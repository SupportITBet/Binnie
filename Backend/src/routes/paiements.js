import express from "express";
import supabase from "../config/supabase.js";
import { marquerConverti } from "../services/cycleProspect.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { logAudit } from "../middlewares/logAudit.js";
import { notifyUser, notifyRole, notifyOnboarding } from "../services/notifyRole.js";
import { enrichirPaiementsAvecTouchPoint } from "../utils/enrichirPaiementsTouchpoint.js";
import { sendPaymentReceiptEmail } from "../services/emailService.js";

const router = express.Router();
console.log("✅ Route paiements chargée");

const TABLE = "paiements_parcours";
// `mois_label` : le mois de cours que ce versement solde, distinct de `date_paiement` qui
// est la date d'encaissement. Les deux divergent dès qu'un apprenant paie en plusieurs
// fois. La colonne reste vide sur l'historique antérieur à sa création : l'interface
// retombe alors sur le rapprochement par référence (dash/src/utils/moisDuVersement.js).
const FIELDS = "id, commercial_id, client, email, telephone, inscription, montant_du, montant_recu, date_paiement, mode_paiement, statut, ref_transaction, notes, assignation_id, preuve_image, created_at, mois_label";

// ── POST /submit ──────────────────────────────────────────────
router.post("/submit", authenticateAdmin, requirePermission("finances","create"), async (req, res) => {
  try {
    const {
      client, email, telephone, offre, inscription, mois_label,
      montant_du, montant_recu, date_paiement,
      mode_paiement, statut, ref_transaction, notes, assignation_id,
      // compat anciens noms
      date, mode, montantDu, montantRecu,
    } = req.body;

    if (!client?.trim()) {
      return res.status(400).json({ error: "Le nom du client est obligatoire" });
    }

    // Coaching privé : le paiement ne peut être enregistré qu'une fois le dossier
    // validé par le PA (dossier_statut "paiement_en_attente"), ou si un paiement a déjà
    // été reçu (versements complémentaires) - cf. workflow "Cours Privé".
    let assignationPrivee = null;
    if (assignation_id) {
      const { data: asg } = await supabase
        .from("assignations_parcours")
        .select("id, type_coaching, dossier_statut, statut")
        .eq("id", assignation_id)
        .maybeSingle();
      if (asg?.type_coaching === "prive") {
        assignationPrivee = asg;
        // Bloqué PAR DÉFAUT (y compris dossier_statut vide/null - dossier pas encore
        // transmis au PA) : seul un statut explicitement autorisé débloque le paiement.
        // Exception : un dossier déjà "converti" (classe assignée, apprenant actif) a
        // terminé le pipeline - dossier_statut est alors remis à null (cf. handleAssignCentre
        // côté frontend) et ne doit plus jamais bloquer les versements complémentaires d'un
        // apprenant qui a déjà commencé ses cours.
        const statutsAutorises = ["paiement_en_attente", "paiement_recu"];
        const dejaConverti = asg.statut === "converti";
        if (!dejaConverti && !statutsAutorises.includes(asg.dossier_statut)) {
          return res.status(409).json({
            error: asg.dossier_statut === "invalide"
              ? "Ce dossier a été invalidé par le PA - le paiement ne peut pas être enregistré."
              : "Ce dossier de coaching privé doit d'abord être validé par le PA avant d'enregistrer un paiement.",
          });
        }
      }
    }

    // Encode offre dans inscription : "offre::Anglais Pro B2||Parcours BET · En ligne"
    const inscriptionFull = [
      offre ? `offre::${offre.trim()}` : null,
      inscription?.trim() || null,
    ].filter(Boolean).join("||") || null;

    // `mois_label` est envoyé depuis longtemps par le front alors que la colonne vient
    // seulement d'être ajoutée : on l'insère à part, avec repli si la migration n'a pas
    // encore tourné. Sans ce repli, Postgres rejette la ligne ENTIÈRE et plus aucun
    // paiement ne s'enregistre - le même piège que sur config-contact.
    const champsPaiement = {
        commercial_id:   req.user.id,
        client:          client.trim(),
        email:           email?.trim()           || null,
        telephone:       telephone?.trim()       || null,
        inscription:     inscriptionFull,
        montant_du:      montant_du   ?? montantDu  ?? 0,
        montant_recu:    montant_recu ?? montantRecu ?? 0,
        date_paiement:   date_paiement || date   || new Date().toISOString().slice(0, 10),
        mode_paiement:   mode_paiement || mode   || "Mobile Money",
        statut:          statut                  || "en_attente",
        ref_transaction: ref_transaction?.trim() || null,
        notes:           notes?.trim()           || null,
        assignation_id:  assignation_id          || null,
        preuve_image:    req.body.preuve_image   || null,
    };

    let { data, error } = await supabase
      .from(TABLE)
      .insert({ ...champsPaiement, mois_label: mois_label?.trim() || null })
      .select(FIELDS)
      .single();

    if (error && /mois_label/i.test(error.message || "")) {
      console.warn("[paiements] colonne mois_label absente - insertion sans elle. Exécuter sql/paiements_parcours_mois_label.sql");
      ({ data, error } = await supabase.from(TABLE).insert(champsPaiement).select(FIELDS).single());
    }

    if (error) {
      console.error("Erreur paiement insert:", error);
      return res.status(500).json({ error: error.message });
    }

    /* Le versement acquiert le dossier : le cycle passe à « converti » sans qu'on le
       demande à personne. Un montant reçu nul (échéance créée mais impayée) ne compte
       pas — sinon un simple échéancier suffirait à convertir un prospect. */
    if (assignation_id && Number(montant_recu) > 0) {
      await marquerConverti(assignation_id, date_paiement || null);
    }

    // Sync assignation montant_paye + statut_paiement
    if (assignation_id) {
      try {
        const { data: allPmts } = await supabase
          .from(TABLE)
          .select("montant_recu")
          .eq("assignation_id", assignation_id);
        const totalRecu = (allPmts || []).reduce((s, p) => s + (Number(p.montant_recu) || 0), 0);
        const asgUpdate = { montant_paye: totalRecu, statut_paiement: statut || "en_attente" };
        // Dossier coaching privé validé → le paiement fait passer le dossier en
        // "paiement_recu" (le PA doit ensuite vérifier le justificatif et router).
        if (assignationPrivee?.dossier_statut === "paiement_en_attente") {
          asgUpdate.dossier_statut = "paiement_recu";
        }
        await supabase.from("assignations_parcours").update(asgUpdate).eq("id", assignation_id);
      } catch { /* non bloquant */ }

      // Notifier PA/Onboarding (selon le type de parcours) + l'apprenant lui-même - jusqu'ici
      // un paiement enregistré par la commerciale ne prévenait personne, ni côté suivi
      // pédagogique ni côté apprenant, qui ne le découvrait qu'en consultant lui-même son
      // espace.
      (async () => {
        try {
          const { data: asg } = await supabase
            .from("assignations_parcours")
            .select("prospect_nom, prospect_email, type_coaching, pa_advisor_id, onboarding_id, plan_paiement")
            .eq("id", assignation_id)
            .maybeSingle();
          if (!asg) return;

          const montantRecuFinal = montant_recu ?? montantRecu ?? 0;
          const nomClient = asg.prospect_nom || client.trim();
          const payloadInterne = {
            type:    "paiement",
            titre:   `💳 Paiement enregistré - ${nomClient}`,
            message: `${montantRecuFinal.toLocaleString("fr-FR")} FCFA reçu(s) pour ${nomClient}.`,
            meta:    { assignation_id, paiement_id: data.id },
            source:  "dash",
          };

          if (asg.type_coaching === "prive") {
            if (asg.pa_advisor_id) await notifyUser(asg.pa_advisor_id, payloadInterne).catch(() => {});
            else await notifyRole(["pedagogical_advisor", "admin_pa_advisor"], payloadInterne).catch(() => {});
          } else if (asg.onboarding_id) {
            await notifyOnboarding(asg.onboarding_id, payloadInterne).catch(() => {});
          } else {
            await notifyRole("onboarding", payloadInterne).catch(() => {});
          }
          await notifyRole(["super_admin"], payloadInterne, asg.pa_advisor_id || asg.onboarding_id || null).catch(() => {});

          if (asg.prospect_email) {
            const titrePaiement = "💳 Paiement bien reçu";
            const messagePaiement = `Votre paiement de ${montantRecuFinal.toLocaleString("fr-FR")} FCFA a été enregistré. Merci !`;
            const { data: u } = await supabase
              .from("utilisateurs").select("id, prenom").ilike("email", asg.prospect_email).maybeSingle();
            if (u?.id) {
              await notifyUser(u.id, {
                type:    "paiement",
                titre:   titrePaiement,
                message: messagePaiement,
                meta:    { assignation_id, paiement_id: data.id },
                source:  "dash",
              }).catch(() => {});
            }
            // Canal email - activé par défaut, désactivable dossier par dossier via la case
            // "📧 Email" du plan de paiement (canal_sms reste non implémenté, pas de fournisseur SMS).
            // Même gabarit "reçu" que les paiements TouchPoint en ligne, pour la cohérence.
            if (asg.plan_paiement?.canal_email !== false) {
              await sendPaymentReceiptEmail({
                clientNom: nomClient,
                email: asg.prospect_email,
                offreLabel: offre?.trim() || null,
                montant: montantRecuFinal,
                modePaiement: data.mode_paiement,
                reference: data.ref_transaction || data.id,
                dateConfirmation: data.date_paiement,
                moisLabel: mois_label?.trim() || null,
              }).catch(err => console.error("[paiements submit] email:", err.message));
            }
          }
        } catch (e) { console.warn("[paiements submit] notifications échouées:", e.message); }
      })();
    }

    logAudit({
      acteur_id:    req.user?.id,
      acteur_nom:   req.profil ? `${req.profil.prenom} ${req.profil.nom}` : null,
      acteur_email: req.profil?.email || req.user?.email,
      acteur_role:  req.role || "commercial",
      plateforme:   "dash",
      action_type:  "PAIEMENT_CREATED",
      module:       "paiements",
      entite_type:  "paiement",
      entite_id:    data.id,
      detail:       `Paiement enregistré pour ${client.trim()} - montant reçu : ${data.montant_recu} (statut : ${data.statut})`,
      ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
      user_agent:   req.headers["user-agent"] || null,
      statut:       "success",
    }).catch(() => {});

    res.status(201).json({ message: "Paiement enregistré", paiement: data });
  } catch (err) {
    console.error("Erreur serveur paiement:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── PATCH /:id ────────────────────────────────────────────────
router.patch("/:id", authenticateAdmin, requirePermission("finances","update"), async (req, res) => {
  try {
    const allowed = ["client","email","telephone","montant_du","montant_recu","date_paiement","mode_paiement","statut","ref_transaction","notes","assignation_id","preuve_image"];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    // Encoder offre dans inscription si présent
    if (req.body.offre !== undefined || req.body.inscription !== undefined) {
      const offre = req.body.offre?.trim() || null;
      const insc  = req.body.inscription?.trim() || null;
      updates.inscription = [
        offre ? `offre::${offre}` : null,
        insc || null,
      ].filter(Boolean).join("||") || null;
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update(updates)
      .eq("id", req.params.id)
      .eq("commercial_id", req.user.id)
      .select(FIELDS)
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Sync assignation montant_paye + statut_paiement
    const assIdPatch = data?.assignation_id;
    if (assIdPatch) {
      try {
        const { data: allPmts } = await supabase
          .from(TABLE)
          .select("montant_recu")
          .eq("assignation_id", assIdPatch);
        const totalRecu = (allPmts || []).reduce((s, p) => s + (Number(p.montant_recu) || 0), 0);
        await supabase
          .from("assignations_parcours")
          .update({ montant_paye: totalRecu, statut_paiement: data.statut || "en_attente" })
          .eq("id", assIdPatch);
      } catch { /* non bloquant */ }
    }

    logAudit({
      acteur_id:    req.user?.id,
      acteur_nom:   req.profil ? `${req.profil.prenom} ${req.profil.nom}` : null,
      acteur_email: req.profil?.email || req.user?.email,
      acteur_role:  req.role || "commercial",
      plateforme:   "dash",
      action_type:  "PAIEMENT_UPDATED",
      module:       "paiements",
      entite_type:  "paiement",
      entite_id:    req.params.id,
      detail:       `Paiement ${req.params.id} mis à jour - champs : ${Object.keys(updates).join(", ")}`,
      ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
      user_agent:   req.headers["user-agent"] || null,
      statut:       "success",
    }).catch(() => {});

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── DELETE /:id ───────────────────────────────────────────────
router.delete("/:id", authenticateAdmin, requirePermission("finances","delete"), async (req, res) => {
  try {
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", req.params.id)
      .eq("commercial_id", req.user.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Paiement supprimé" });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── GET /mes-paiements ────────────────────────────────────────
router.get("/mes-paiements", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select(FIELDS)
      .eq("commercial_id", req.user.id)
      // date_paiement est une simple DATE (sans heure) - deux versements du même jour
      // n'ont donc aucun ordre garanti entre eux sans ce second critère, ce qui rendait
      // le badge de statut du "dernier paiement" aléatoire (parfois "Partiel" au lieu du
      // "Payé" plus récent, alors même jour). created_at a la précision seconde et lève
      // l'ambiguïté de façon déterministe.
      .order("date_paiement", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erreur mes-paiements:", error);
      return res.status(500).json({ error: error.message });
    }

    const paiements = await enrichirPaiementsAvecTouchPoint(data);

    res.json({ paiements });
  } catch (err) {
    console.error("Erreur serveur mes-paiements:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── GET /all ──────────────────────────────────────────────────
// Super admin / admin / manager → tous les paiements
// Autres rôles → uniquement leurs propres paiements
router.get("/all", authenticateAdmin, async (req, res) => {
  try {
    const ROLES_GLOBAUX = ["super_admin", "admin", "manager", "responsable", "gestionnaire", "comptable", "superviseur"];
    const isGlobal = ROLES_GLOBAUX.includes(req.role);

    let q = supabase.from(TABLE).select(FIELDS).order("date_paiement", { ascending: false }).order("created_at", { ascending: false });
    if (!isGlobal) q = q.eq("commercial_id", req.user.id);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    // Résoudre les noms et centres des commerciaux via la table utilisateurs - `utilisateurs`
    // n'a pas de colonne `centre_id` propre, le centre d'un commercial se déduit de son
    // `scope` (ex: ["angre"], ou ["national"] pour un commercial en ligne sans centre physique).
    const commercialIds = [...new Set((data || []).map(p => p.commercial_id).filter(Boolean))];
    let commercialMap = {};
    if (commercialIds.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from("utilisateurs")
        .select("id, prenom, nom, scope")
        .in("id", commercialIds);
      if (usersError) console.error("[paiements/all] résolution commerciaux:", usersError.message);
      (users || []).forEach(u => {
        const scope = Array.isArray(u.scope) ? u.scope : [];
        commercialMap[u.id] = {
          nom:       `${u.prenom || ""} ${u.nom || ""}`.trim(),
          centre_id: (scope.length && !scope.includes("national")) ? scope[0] : null,
        };
      });
    }

    const paiementsAvecCommercial = (data || []).map(p => ({
      ...p,
      commercial_nom: commercialMap[p.commercial_id]?.nom      || "-",
      centre_id:      commercialMap[p.commercial_id]?.centre_id || null,
    }));
    const paiements = await enrichirPaiementsAvecTouchPoint(paiementsAvecCommercial);

    res.json({ paiements });
  } catch (err) {
    console.error("Erreur /paiements/all:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── GET /mes-paiements-prospect ────────────────────────────────
// Historique de paiement pour l'espace client (prospect/apprenant) -
// public (pas d'authenticateAdmin) car ce n'est pas un membre du staff qui
// appelle, mais le prospect lui-même depuis Mon espace, identifié par son
// email (même pattern que /api/parcours/mon-assignation).
router.get("/mes-paiements-prospect", async (req, res) => {
  try {
    const email = (req.query.email || "").trim();
    if (!email) return res.status(400).json({ error: "email requis" });

    const { data, error } = await supabase
      .from(TABLE)
      .select(FIELDS)
      .ilike("email", email)
      .order("date_paiement", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const paiements = await enrichirPaiementsAvecTouchPoint(data);

    // Code promo - champ du dossier (assignations_parcours), pas d'un versement précis :
    // affiché une seule fois pour le dossier, pas répété sur chaque paiement. Sans ce
    // lookup, le badge visible côté commerciale (dossier) n'apparaissait jamais dans
    // "Mon espace" côté prospect, qui ne consultait que paiements_parcours.
    let code_promo = null, reduction_montant = null;
    const assignationId = (data || []).find(p => p.assignation_id)?.assignation_id;
    if (assignationId) {
      const { data: asg } = await supabase
        .from("assignations_parcours")
        .select("code_promo, reduction_montant")
        .eq("id", assignationId)
        .maybeSingle();
      code_promo = asg?.code_promo || null;
      reduction_montant = asg?.reduction_montant || null;
    }

    res.json({ paiements, code_promo, reduction_montant });
  } catch (err) {
    console.error("Erreur mes-paiements-prospect:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── GET /assignation/:id ──────────────────────────────────────
// Versements liés à une assignation spécifique (PA, commercial, admin)
router.get("/assignation/:id", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select(FIELDS)
      .eq("assignation_id", req.params.id)
      .order("date_paiement", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    const paiements = await enrichirPaiementsAvecTouchPoint(data);
    res.json({ paiements });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
