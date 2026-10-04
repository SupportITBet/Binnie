import express from "express";
import { v4 as uuidv4 } from "uuid";
import supabase from "../config/supabase.js";
import { marquerConverti } from "../services/cycleProspect.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { notifyRole } from "../services/notifyRole.js";
import { sendPaymentReceiptEmail } from "../services/emailService.js";

const router = express.Router();
console.log("✅ Route touchpoint chargée");

// ── Identifiants marchand TouchPoint ─────────────────────────────
// agency_code / secure_code sont conçus par TouchPoint pour être passés
// côté client (SendPaymentInfos()), comme une clé publique - pas un secret
// serveur. Voir Backend/docs/touchpoint-integration.md pour la doc complète.
const AGENCY_CODE  = process.env.TOUCHPOINT_AGENCY_CODE  || "";
const SECURE_CODE  = process.env.TOUCHPOINT_SECURE_CODE  || "";
const DOMAIN_NAME  = process.env.TOUCHPOINT_DOMAIN_NAME  || "";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
// Script "Checkout page" - URL confirmée par le support TouchPoint via leur
// propre fichier de test officiel pour notre compte BETSA9323 (2026-08-20),
// différente de celle documentée sur le portail développeur (.com/script2/0.0.2
// vs le vrai .net/touchpayv2/script/touchpaynr/0.0.1 ci-dessous).
const SCRIPT_URL = "https://touchpay.gutouch.net/touchpayv2/script/touchpaynr/prod_touchpay-0.0.1.js";

const MOIS_FR_LABELS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

// Réconcilie un versement TouchPoint avec plan_paiement.mois_paiements : marque le mois ciblé
// (ou le premier mois non soldé si aucun n'est ciblé) comme payé, ajoute la tranche, et génère
// le mois suivant si le plan est ouvert et que ce mois vient d'être soldé - même règle que le
// bouton "Payer" manuel (CommercialDashboard.jsx). Jusqu'ici un paiement TouchPoint sans lien
// précis pour un mois ne touchait que paiements_parcours/montant_paye, jamais le plan mensuel
// affiché côté commerciale : le mois restait "en attente" et rien n'était jamais généré ensuite.
export function reconcilierMoisPaiement(plan, { montant, date, mode, ref, moisIdCible }) {
  const moisListe = (plan.mois_paiements || []).map(m => ({ ...m, tranches: [...(m.tranches || [])] }));
  if (!moisListe.length) return plan;

  let idx = moisIdCible ? moisListe.findIndex(m => m.id === moisIdCible) : -1;
  if (idx === -1) {
    idx = moisListe.findIndex(m => {
      const paye = (m.tranches || []).filter(t => t.statut === "paye").reduce((s, t) => s + (t.montant || 0), 0);
      return paye < (m.montant || 0);
    });
  }
  if (idx === -1) idx = moisListe.length - 1;

  const moisAffectesLabels = [];
  let restant = Number(montant) || 0;
  while (restant > 0 && idx < moisListe.length) {
    const m = moisListe[idx];
    const dejaPaye = (m.tranches || []).filter(t => t.statut === "paye").reduce((s, t) => s + (t.montant || 0), 0);
    const capacite = Math.max(0, (m.montant || 0) - dejaPaye);
    if (capacite <= 0) { idx++; continue; }
    const part = Math.min(restant, capacite);
    m.tranches.push({ id: `t_tp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, montant: part, statut: "paye", date_paiement: date, mode, ref });
    if (!moisAffectesLabels.includes(m.label)) moisAffectesLabels.push(m.label);
    const totalPaye = m.tranches.filter(t => t.statut === "paye").reduce((s, t) => s + (t.montant || 0), 0);
    m.statut = totalPaye >= (m.montant || 0) ? "paye" : totalPaye > 0 ? "partiel" : "en_attente";
    restant -= part;
    if (part === capacite) idx++;
  }

  // Plan ouvert (pas de date de fin) : génère le mois suivant si le dernier mois vient d'être
  // soldé - sans ça, un dossier réglé exclusivement en ligne (TouchPoint) n'avait jamais de
  // mois suivant généré, contrairement à un dossier réglé manuellement.
  // Pendant une pause, on ne prolonge rien. Ce fichier est le quatrième écrivain du plan
  // et le seul qui ignorait `plan.actif` : un paiement arrivant par un lien émis avant le
  // gel aurait relancé la génération, et contourné toute la suspension.
  if (!plan.date_fin_formation && plan.actif !== false) {
    const lastMois = moisListe[moisListe.length - 1];
    // Un mois neutralisé passe pour « payé » (montant ramené au déjà-versé) : sans ce
    // garde-fou, il servirait de tremplin pour générer le mois suivant.
    if (lastMois?.statut === "paye" && !lastMois?.neutralise) {
      const [y, mm] = lastMois.periode.split("-").map(Number);
      const nextDate = new Date(y, mm, 1); // mm déjà 1-indexé → correspond au mois suivant
      const periode = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
      if (!moisListe.some(m => m.periode === periode)) {
        moisListe.push({
          id: `m_${periode}`, periode,
          label: `${MOIS_FR_LABELS[nextDate.getMonth()]} ${nextDate.getFullYear()}`,
          montant: plan.mensualite, statut: "en_attente", tranches: [],
        });
      }
    }
  }

  return { ...plan, mois_paiements: moisListe, _moisAffectesLabels: moisAffectesLabels };
}

// ── Finalise un paiement validé : crée paiements_parcours, met à jour la
// tranche si paiement apprenant, notifie le commercial. Partagé entre le
// webhook Checkout page (/callback) et la réponse synchrone Direct API.
async function finalizeSuccessfulPayment(existing, { order_number, paid_amount, payment_token, mode_paiement }) {
  let apprMeta = null;
  try { apprMeta = existing.message ? JSON.parse(existing.message) : null; } catch (_) {}

  // Achat boutique (site public ou Espace Apprenant) : ne concerne ni une
  // fiche prospect (assignations_parcours) ni un paiement de scolarité - on
  // se contente de marquer la commande payée, sans toucher à paiements_parcours.
  if (apprMeta?.context === "boutique" && apprMeta?.commande_id) {
    const { error: cmdErr } = await supabase.from("commandes").update({
      paye: true,
      mode_paiement: mode_paiement || "TouchPoint",
      reference_transaction: order_number,
      statut: "confirmee",
    }).eq("id", apprMeta.commande_id);
    if (cmdErr) console.error(`Échec mise à jour commande boutique ${apprMeta.commande_id}:`, cmdErr.message);

    // Achat passé depuis l'Espace Apprenant (apprenant_id transmis dans le message,
    // absent pour un achat depuis le site public non connecté) : notifie l'apprenant
    // avec la référence de transaction, pour qu'il la retrouve dans sa cloche 🔔
    // sans dépendre du seul toast affiché au moment du retour de paiement.
    if (apprMeta.apprenant_id) {
      await supabase.from("notifications").insert({
        user_id: apprMeta.apprenant_id,
        type:    "boutique",
        titre:   "Paiement boutique confirmé",
        message: `Votre commande a bien été payée (${Number(paid_amount || existing.montant).toLocaleString()} FCFA). Référence : ${order_number}.`,
        lu:      false,
        meta: { order_number, commande_id: apprMeta.commande_id, montant: paid_amount || existing.montant },
      });
    }
    await notifyRole(["super_admin"], {
      type:    "paiement",
      titre:   `Paiement boutique - ${existing.client_nom || "Client"}`,
      message: `Commande boutique payée (${Number(paid_amount || existing.montant).toLocaleString()} FCFA) via TouchPoint. Référence : ${order_number}.`,
      meta: { order_number, commande_id: apprMeta.commande_id, montant: paid_amount || existing.montant },
    });

    if (existing.client_email) {
      await sendPaymentReceiptEmail({
        clientNom: existing.client_nom || "Client",
        email: existing.client_email,
        offreLabel: existing.offre_label || existing.offre_formule || "Achat boutique",
        montant: paid_amount || existing.montant,
        modePaiement: mode_paiement || "TouchPoint",
        reference: order_number,
      }).catch(err => console.error("[touchpoint] email reçu boutique:", err.message));
    }
    return;
  }

  const isApprenantPaiement = apprMeta?.context === "apprenant" && apprMeta?.assignation_id;
  // Paiement direct d'un prospect (ParcoursModal/EnfantParcoursModal) : l'id de
  // la fiche assignations_parcours créée juste avant la redirection TouchPoint,
  // transmis via /initiate - permet de faire apparaître le paiement côté
  // commerciale (onglet Prospects parcours) sans passer par le contexte apprenant.
  const prospectAssignationId = !isApprenantPaiement ? existing.assignation_id || null : null;

  // existing.assistante_id référence assistantes.id - une table totalement distincte de
  // utilisateurs (deux id différents pour la même personne, sans colonne de liaison directe,
  // cf. Backend/sql/par_table/assistantes.sql). paiements_parcours.commercial_id et
  // notifications.user_id attendent un utilisateurs.id (comparé à req.user.id à la connexion
  // dans Backend/src/routes/paiements.js) - sans cette résolution par email (même pattern que
  // parcours.js:1194/1511), le paiement TouchPoint n'apparaissait jamais dans "mes paiements"
  // ni dans les notifications de la commerciale, même une fois correctement rattaché à sa fiche.
  let commercialUtilisateurId = null;
  if (!isApprenantPaiement) {
    /* QUI EST CRÉDITÉ : CELLE QUI SUIT LE DOSSIER AU MOMENT DU PAIEMENT.
       `existing.assistante_id` est figé à l'émission du lien. Deux raisons de ne pas s'y fier :
       il est parfois absent (un lien de relance généré depuis le dashboard peut l'omettre,
       données pas encore rafraîchies côté navigateur) ; et surtout il devient FAUX quand
       l'apprenant a changé de main entre-temps - une migration de canal transfère le dossier à
       une autre assistante, et un vieux lien payé après coup créditait l'ancienne.
       Le dossier est la source de vérité, on le lit donc EN PREMIER et plus seulement à défaut.
       Le figé ne sert que de repli : si le dossier n'a pas d'assistante - cas d'une migration
       vers le en ligne encore à attribuer - mieux vaut créditer celle qui a émis le lien que
       de laisser le paiement orphelin. */
    let assistanteIdResolu = null;
    if (prospectAssignationId) {
      const { data: assignation } = await supabase
        .from("assignations_parcours").select("assistante_id").eq("id", prospectAssignationId).maybeSingle();
      assistanteIdResolu = assignation?.assistante_id || null;
    }
    if (!assistanteIdResolu) assistanteIdResolu = existing.assistante_id || null;

    /* On aligne la ligne de paiement sur ce qui vient d'être décidé, pour que le tableau du
       SuperAdmin affiche la bonne commerciale sans re-résoudre à chaque lecture - et pour que
       la trace du paiement dise la même chose que le crédit. */
    if (assistanteIdResolu && assistanteIdResolu !== existing.assistante_id) {
      await supabase.from("paiements_touchpoint")
        .update({ assistante_id: assistanteIdResolu }).eq("id", existing.id);
    }
    if (assistanteIdResolu) {
      const { data: assistante } = await supabase.from("assistantes").select("email").eq("id", assistanteIdResolu).maybeSingle();
      if (assistante?.email) {
        const { data: u } = await supabase.from("utilisateurs").select("id").ilike("email", assistante.email.trim()).maybeSingle();
        commercialUtilisateurId = u?.id || null;
      }
    }
  }

  const inscriptionLabel = isApprenantPaiement
    ? "Paiement formation - Espace apprenant"
    : ([
        existing.offre_label   ? `offre::${existing.offre_label}`  : null,
        existing.offre_formule ? existing.offre_formule             : null,
      ].filter(Boolean).join("||") || null);

  await supabase.from("paiements_parcours").insert({
    commercial_id:   commercialUtilisateurId || (isApprenantPaiement ? apprMeta.apprenant_id : "00000000-0000-0000-0000-000000000000"),
    client:          existing.client_nom,
    email:           existing.client_email,
    telephone:       existing.client_telephone || null,
    inscription:     inscriptionLabel,
    assignation_id:  isApprenantPaiement ? apprMeta.assignation_id : prospectAssignationId,
    montant_du:      existing.montant,
    montant_recu:    Number(paid_amount) || existing.montant,
    date_paiement:   new Date().toISOString().slice(0, 10),
    mode_paiement:   mode_paiement || "TouchPoint",
    statut:          "validé",
    ref_transaction: order_number,
    notes:           `Paiement en ligne TouchPoint - ref: ${payment_token || order_number}`,
  });

  /* LE PROSPECT VENU DU SITE AVEC SON PAIEMENT est acquis à la seconde où la passerelle
     confirme. Personne n'a de clic à faire : ni la commerciale, qui découvrira le dossier
     déjà converti, ni le client, qui vient de payer. C'est le chemin le plus court du
     tunnel, et c'est celui que `WEB-11` (conversion lead → inscription) mesure. */
  const cibleCycle = isApprenantPaiement ? apprMeta.assignation_id : prospectAssignationId;
  if (cibleCycle) await marquerConverti(cibleCycle);

  // Renseigné plus bas si ce versement a été réconcilié avec un plan mensuel - sert à afficher
  // "Mois concerné" (ex: "Décembre 2026") dans le reçu, une info absente d'un paiement classique.
  let moisLabelPourEmail = null;

  if (prospectAssignationId) {
    const asgUpdate = {
      statut_paiement: "payé",
      montant_paye:    Number(paid_amount) || existing.montant,
      mode_paiement:   mode_paiement || "TouchPoint",
    };
    // Dossier coaching privé validé par le PA ("paiement_en_attente") → le paiement en ligne
    // le fait passer en "paiement_recu", exactement comme pour un paiement enregistré
    // manuellement (cf. Backend/src/routes/paiements.js:99-103) - sans ça, un prospect qui
    // payait directement en ligne restait affiché "Validé - activez le paiement avec le
    // client" indéfiniment, alors que le paiement avait déjà bien été reçu.
    const { data: assignationActuelle } = await supabase
      .from("assignations_parcours")
      .select("dossier_statut")
      .eq("id", prospectAssignationId)
      .maybeSingle();
    if (assignationActuelle?.dossier_statut === "paiement_en_attente") {
      asgUpdate.dossier_statut = "paiement_recu";
    }
    await supabase.from("assignations_parcours").update(asgUpdate).eq("id", prospectAssignationId);

    if (commercialUtilisateurId) {
      await supabase.from("notifications").insert({
        user_id: commercialUtilisateurId,
        type:    "paiement",
        titre:   `Paiement reçu - ${existing.client_nom}`,
        message: `${existing.client_nom} a payé ${Number(paid_amount || existing.montant).toLocaleString()} FCFA via TouchPoint.`,
        lu:      false,
        meta: {
          order_number,
          assignation_id: prospectAssignationId,
          montant:        existing.montant,
        },
      });
    }
    await notifyRole(["super_admin"], {
      type:    "paiement",
      titre:   `Paiement en ligne - ${existing.client_nom}`,
      message: `${existing.client_nom} a payé ${Number(paid_amount || existing.montant).toLocaleString()} FCFA via TouchPoint.`,
      meta: { order_number, assignation_id: prospectAssignationId, montant: existing.montant },
    }, commercialUtilisateurId);

    // Réconcilie ce versement avec le "Plan mensuel" (plan_paiement.mois_paiements) - sur le
    // mois précis si un lien de paiement pour ce mois a été envoyé (cf. CommercialDashboard.jsx
    // "Envoyer le lien", apprMeta.mois_id), sinon sur le premier mois non soldé. Génère aussi le
    // mois suivant si le plan est ouvert et que ce mois vient d'être soldé - jusqu'ici un
    // paiement TouchPoint sans lien précis pour un mois ne touchait que paiements_parcours/
    // montant_paye, jamais le plan mensuel affiché côté commerciale (le mois restait "en
    // attente" indéfiniment, et rien n'était jamais généré ensuite).
    const { data: assignationPlan } = await supabase
      .from("assignations_parcours")
      .select("plan_paiement")
      .eq("id", prospectAssignationId)
      .maybeSingle();
    if (assignationPlan?.plan_paiement?.mois_paiements?.length) {
      const planMaj = reconcilierMoisPaiement(assignationPlan.plan_paiement, {
        montant: Number(paid_amount) || existing.montant,
        date: new Date().toISOString().slice(0, 10),
        mode: mode_paiement || "TouchPoint",
        ref: order_number,
        moisIdCible: apprMeta?.mois_id || null,
      });
      await supabase.from("assignations_parcours").update({ plan_paiement: planMaj }).eq("id", prospectAssignationId);
      moisLabelPourEmail = planMaj._moisAffectesLabels?.join(", ") || null;
    }
  }

  if (existing.client_email) {
    await sendPaymentReceiptEmail({
      clientNom: existing.client_nom || "Client",
      email: existing.client_email,
      offreLabel: existing.offre_label || existing.offre_formule || null,
      montant: Number(paid_amount) || existing.montant,
      modePaiement: mode_paiement || "TouchPoint",
      reference: order_number,
      moisLabel: moisLabelPourEmail,
    }).catch(err => console.error("[touchpoint] email reçu paiement:", err.message));
  }

  if (!isApprenantPaiement) return;

  const { data: assignation } = await supabase
    .from("assignations_parcours")
    .select("plan_paiement, commercial_id")
    .eq("id", apprMeta.assignation_id)
    .maybeSingle();

  if (assignation?.plan_paiement?.tranches && apprMeta.tranche_id) {
    const tranches = assignation.plan_paiement.tranches.map(t =>
      t.id === apprMeta.tranche_id
        ? { ...t, statut: "payé", date_paiement_effectif: new Date().toISOString().slice(0, 10) }
        : t
    );
    await supabase.from("assignations_parcours")
      .update({ plan_paiement: { ...assignation.plan_paiement, tranches } })
      .eq("id", apprMeta.assignation_id);
  }

  const commercialId = assignation?.commercial_id || existing.assistante_id;
  if (!commercialId) return;

  const trancheLabel = (() => {
    const t = assignation?.plan_paiement?.tranches?.find(t => t.id === apprMeta.tranche_id);
    return t?.label || "Paiement formation";
  })();
  await supabase.from("notifications").insert({
    user_id: commercialId,
    type:    "paiement",
    titre:   `Paiement reçu - ${existing.client_nom}`,
    message: `${existing.client_nom} a payé ${existing.montant.toLocaleString()} FCFA (${trancheLabel}) via TouchPoint.`,
    lu:      false,
    meta: {
      order_number,
      assignation_id: apprMeta.assignation_id,
      apprenant_id:   apprMeta.apprenant_id,
      montant:        existing.montant,
      tranche_id:     apprMeta.tranche_id || null,
    },
  });
  await notifyRole(["super_admin"], {
    type:    "paiement",
    titre:   `Paiement en ligne - ${existing.client_nom}`,
    message: `${existing.client_nom} a payé ${existing.montant.toLocaleString()} FCFA (${trancheLabel}) via TouchPoint.`,
    meta: {
      order_number,
      assignation_id: apprMeta.assignation_id,
      apprenant_id:   apprMeta.apprenant_id,
      montant:        existing.montant,
      tranche_id:     apprMeta.tranche_id || null,
    },
  }, commercialId);
}

// ── POST /initiate ────────────────────────────────────────────
// Le frontend appelle cette route pour obtenir un order_number + les
// paramètres à passer au script TouchPoint (SendPaymentInfos côté client).
router.post("/initiate", async (req, res) => {
  try {
    const {
      client_nom, client_prenom, client_email, client_telephone, client_ville,
      offre_key, offre_label, offre_formule, offre_type,
      niveau, objectif, message,
      montant, assignation_id, assistante_id, return_url,
    } = req.body;

    if (!client_nom?.trim())   return res.status(400).json({ error: "Nom du client requis" });
    if (!client_email?.trim()) return res.status(400).json({ error: "Email du client requis" });
    if (!montant || montant <= 0) return res.status(400).json({ error: "Montant invalide" });
    if (!AGENCY_CODE || !SECURE_CODE || !DOMAIN_NAME) {
      return res.status(503).json({ error: "TouchPoint non configuré - identifiants marchand manquants" });
    }

    const order_number = `BET-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    const { error: dbErr } = await supabase.from("paiements_touchpoint").insert({
      order_number,
      client_nom:       client_nom.trim(),
      client_prenom:    client_prenom?.trim()    || null,
      client_email:     client_email.trim().toLowerCase(),
      client_telephone: client_telephone?.trim() || null,
      client_ville:     client_ville?.trim()     || null,
      offre_key:        offre_key                || null,
      offre_label:      offre_label              || null,
      offre_formule:    offre_formule            || null,
      offre_type:       offre_type               || null,
      niveau:           niveau?.trim()           || null,
      objectif:         objectif?.trim()         || null,
      message:          message?.trim()          || null,
      montant:          Number(montant),
      assignation_id:   assignation_id           || null,
      assistante_id:    assistante_id            || null,
      statut:           "en_attente",
    });

    if (dbErr) {
      console.error("Erreur DB touchpoint/initiate:", dbErr);
      return res.status(500).json({ error: dbErr.message });
    }

    // return_url : par défaut, redirige vers /paiement/retour du site public
    // (FRONTEND_URL). Certains appelants (ex: Espace Apprenant dans dash) vivent
    // sur une autre app et fournissent leur propre URL de retour (construite
    // côté client depuis window.location.origin) pour ne pas faire atterrir
    // l'utilisateur sur le mauvais site après paiement.
    const retourUrl = return_url?.trim()
      ? `${return_url.trim()}${return_url.includes("?") ? "&" : "?"}order_number=${order_number}`
      : `${FRONTEND_URL}/paiement/retour?order_number=${order_number}`;

    res.json({
      order_number,
      script_url:              SCRIPT_URL,
      agency_code:              AGENCY_CODE,
      secure_code:               SECURE_CODE,
      domain_name:              DOMAIN_NAME,
      amount:                   Number(montant),
      city:                     client_ville?.trim() || "",
      email:                    client_email.trim().toLowerCase(),
      clientFirstName:          client_prenom?.trim() || client_nom.trim(),
      clientLastName:           client_nom.trim(),
      clientPhone:              client_telephone?.trim() || "",
      url_redirection_success:  retourUrl,
      url_redirection_failed:   retourUrl,
    });
  } catch (err) {
    console.error("Erreur /touchpoint/initiate:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Traite une confirmation de paiement, quelle que soit sa source (callback
// serveur TouchPoint OU redirection navigateur - voir /confirm-redirect) -
// partagé pour ne pas dupliquer la logique de validation/finalisation.
async function traiterConfirmationPaiement({ command_number, payment_status, paid_amount, payment_token, payment_mode, source }) {
  if (!command_number) return { status: 400, body: { error: "command_number manquant" } };

  const { data: existing } = await supabase
    .from("paiements_touchpoint")
    .select("id, client_nom, client_email, client_telephone, offre_label, offre_formule, montant, assistante_id, message, assignation_id, statut")
    .eq("order_number", command_number)
    .single();

  if (!existing) {
    console.error("Transaction TouchPoint inconnue:", command_number);
    return { status: 404, body: { error: "Transaction inconnue" } };
  }

  // Idempotence : déjà finalisée - ne pas ré-insérer paiements_parcours ni renotifier
  // une seconde fois. "échoué" n'est écrit que par /callback (source fiable, cf. plus
  // bas), donc le traiter comme définitif ici est sûr : un vrai succès ultérieur ne
  // peut plus être perdu puisqu'un "échoué" prématuré ne peut plus être écrit du tout
  // par /confirm-redirect (voir plus bas).
  if (existing.statut === "validé" || existing.statut === "échoué") {
    return { status: 200, body: { message: "OK", statut: existing.statut, deja_traite: true } };
  }

  const isValid = String(payment_status) === "200";

  // Garde-fou minimal quand la confirmation vient de la redirection navigateur
  // (non signée, donc falsifiable) : le montant doit correspondre à celui
  // enregistré à l'initiation.
  if (isValid && paid_amount != null && Number(paid_amount) !== Number(existing.montant)) {
    console.error(`Montant incohérent pour ${command_number}: attendu ${existing.montant}, reçu ${paid_amount}`);
    return { status: 400, body: { error: "Montant incohérent" } };
  }

  // MTN/Moov (paiement par confirmation USSD *133#) : TouchPoint redirige déjà le
  // navigateur vers /confirm-redirect dès le lancement du débit, AVANT que le client
  // ait confirmé sur son téléphone - un "échec" reçu par cette voie n'est donc pas
  // fiable (juste "pas encore confirmé", pas "refusé"). Seul le vrai webhook serveur
  // (/callback, source="callback") peut donc écrire un échec définitif ; un échec
  // remonté par la redirection ne fait plus rien - le statut reste "en_attente" (le
  // polling de PaiementRetour.jsx continue, et le vrai webhook pourra encore valider
  // le paiement une fois la confirmation *133# réellement effectuée).
  if (!isValid && source !== "callback") {
    return { status: 200, body: { message: "OK", statut: existing.statut, en_attente_confirmation: true } };
  }

  await supabase.from("paiements_touchpoint").update({
    statut:        isValid ? "validé" : "échoué",
    payment_token,
    payment_mode,
  }).eq("order_number", command_number);

  if (isValid) {
    await finalizeSuccessfulPayment(existing, { order_number: command_number, paid_amount, payment_token, mode_paiement: "TouchPoint" });
  }

  return { status: 200, body: { message: "OK", statut: isValid ? "validé" : "échoué" } };
}

// ── GET|POST /callback ────────────────────────────────────────
// Webhook "Callback TouchPay" appelé par TouchPoint à la fin du paiement.
// Confirmé par leur support (21/08/2026) : ils appellent en POST, pas en GET -
// avec seulement un handler GET déclaré, Express renvoyait son propre 404
// générique ("Cannot POST...") avant même d'atteindre notre code, ce qui
// expliquait le 404 qu'ils constataient de leur côté. On accepte les deux
// méthodes et on lit les paramètres à la fois dans le body et la query,
// puisqu'on ne sait pas avec certitude comment ils encodent le POST.
// Paramètres attendus : payment_mode, paid_sum, paid_amount, payment_token,
//                        payment_status ("200"=succès, "420"=échec), command_number,
//                        payment_validation_date
// IMPORTANT : route publique (pas d'auth), TouchPoint l'appelle directement.
router.all("/callback", async (req, res) => {
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Méthode non supportée" });
  try {
    const params = { ...req.query, ...(req.body || {}) };
    const { payment_mode, paid_amount, payment_token, payment_status, command_number } = params;
    const result = await traiterConfirmationPaiement({ command_number, payment_status, paid_amount, payment_token, payment_mode, source: "callback" });
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error("Erreur /touchpoint/callback:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── POST /confirm-redirect ───────────────────────────────────
// Filet de secours : le callback serveur TouchPoint ("Callback TouchPay",
// /callback ci-dessus) ne nous parvient pas de façon fiable (cf. Backend/docs/
// touchpoint-integration.md - investigation en cours avec le support
// TouchPoint). En revanche, TouchPoint transmet bien les mêmes informations
// directement dans l'URL de redirection vers le navigateur du client
// (num_command, errorCode, amount, num_transaction_from_gu) - confirmé
// empiriquement le 21/08/2026. PaiementRetour.jsx appelle cette route avec
// ces paramètres pour finaliser le paiement quand le vrai callback n'arrive
// jamais. Moins fiable qu'un webhook serveur (dépend que le client termine la
// redirection jusqu'au bout) - à garder en complément, pas en remplacement,
// une fois le vrai callback réparé côté TouchPoint.
router.post("/confirm-redirect", async (req, res) => {
  try {
    const { order_number, errorCode, amount, num_transaction_from_gu } = req.body;
    const result = await traiterConfirmationPaiement({
      command_number: order_number,
      payment_status: errorCode,
      paid_amount:    amount,
      payment_token:  num_transaction_from_gu,
      payment_mode:   "TouchPoint (redirection)",
      source:         "redirect",
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error("Erreur /touchpoint/confirm-redirect:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── POST /verify ──────────────────────────────────────────────
// Le frontend vérifie le statut après retour sur /paiement/retour
router.post("/verify", async (req, res) => {
  try {
    const { order_number } = req.body;
    if (!order_number) return res.status(400).json({ error: "order_number requis" });

    const { data, error } = await supabase
      .from("paiements_touchpoint")
      .select("order_number, statut, montant, offre_label, offre_formule, offre_type, niveau, client_nom, client_email, client_telephone, client_ville, payment_mode, payment_token, message, assignation_id, created_at, updated_at")
      .eq("order_number", order_number)
      .single();

    if (error || !data) return res.status(404).json({ error: "Transaction introuvable" });

    // Un prospect peut relancer le paiement via un AUTRE lien (order_number différent,
    // ex: relance envoyée par la commerciale) pendant que cette page reste ouverte sur la
    // tentative d'origine - celle-ci peut rester "en_attente"/"échoué" indéfiniment alors
    // que le dossier est déjà réglé via cette autre transaction. On le signale ici plutôt
    // que de faire croire au client que son paiement n'a jamais abouti.
    if (data.statut !== "validé" && data.assignation_id) {
      const { data: autrePaiement } = await supabase
        .from("paiements_touchpoint")
        .select("order_number")
        .eq("assignation_id", data.assignation_id)
        .eq("statut", "validé")
        .neq("order_number", order_number)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (autrePaiement) {
        return res.json({ paiement: data, deja_paye_via: autrePaiement.order_number });
      }
    }

    res.json({ paiement: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── GET /admin/all ────────────────────────────────────────────
router.get("/admin/all", authenticateAdmin, async (req, res) => {
  try {
    const { statut, traitee, date_debut, date_fin, archives } = req.query;

    // Une commerciale ne doit voir que SES propres tentatives de paiement (dossier
    // en_attente/échoué inclus) - pas celles des autres. Les rôles globaux (admin,
    // comptable, etc.) continuent de tout voir, comme avant. assistantes.id est un
    // espace d'id distinct de utilisateurs.id (celui de req.user) - résolu par email,
    // même schéma que /parcours/mon-assignation et le reste de ce fichier.
    const ROLES_GLOBAUX = ["super_admin", "admin", "manager", "responsable", "gestionnaire", "superviseur", "comptable"];
    const isGlobal = ROLES_GLOBAUX.includes(req.role);
    let monAssistanteId = null;
    if (!isGlobal && req.user?.email) {
      const { data: monAssistante } = await supabase
        .from("assistantes").select("id").ilike("email", req.user.email.trim()).maybeSingle();
      monAssistanteId = monAssistante?.id || null;
    }

    let q = supabase
      .from("paiements_touchpoint")
      .select("*")
      .order("created_at", { ascending: false });

    if (statut)  q = q.eq("statut", statut);
    if (traitee !== undefined) q = q.eq("traitee", traitee === "true");
    if (date_debut) q = q.gte("created_at", `${date_debut}T00:00:00`);
    if (date_fin)   q = q.lte("created_at", `${date_fin}T23:59:59`);
    // "traitee" sert désormais aussi de flag "archivé" (tentatives échouées en double
    // masquées par la commerciale). Par défaut on masque les lignes archivées ; le
    // paramètre archives=true les affiche exclusivement (vue "paiements archivés").
    if (archives === "true") q = q.eq("traitee", true);
    else if (archives !== "all") q = q.or("traitee.is.null,traitee.eq.false");

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    // La commerciale est déjà connue dès l'initiation du paiement (assistante_id
    // transmis par le site public - voir /initiate) : plus besoin d'une
    // affectation manuelle a posteriori. On résout juste son nom pour
    // l'affichage (assistante_id référence assistantes.id, pas utilisateurs.id).
    // Fallback : un lien "Renvoyer le lien" (RelancerPaiement.jsx) peut omettre
    // assistante_id dans l'URL - on retombe alors sur assignations_parcours.assistante_id,
    // seule source de vérité fiable pour le dossier (même logique que
    // finalizeSuccessfulPayment, mais celle-ci n'écrit jamais le fallback sur la ligne
    // paiements_touchpoint elle-même).
    const assignationIds = [...new Set(
      (data || []).filter(p => !p.assistante_id && p.assignation_id).map(p => p.assignation_id)
    )];
    let assistanteIdParAssignation = {};
    if (assignationIds.length) {
      const { data: assignationsRows } = await supabase
        .from("assignations_parcours")
        .select("id, assistante_id")
        .in("id", assignationIds);
      assistanteIdParAssignation = Object.fromEntries(
        (assignationsRows || []).filter(a => a.assistante_id).map(a => [a.id, a.assistante_id])
      );
    }

    const assistanteIds = [...new Set((data || []).map(p =>
      p.assistante_id || assistanteIdParAssignation[p.assignation_id]
    ).filter(Boolean))];
    let nomsParId = {};
    if (assistanteIds.length) {
      const { data: assistantesRows } = await supabase
        .from("assistantes")
        .select("id, nom, prenom")
        .in("id", assistanteIds);
      nomsParId = Object.fromEntries((assistantesRows || []).map(a => [a.id, `${a.prenom||""} ${a.nom||""}`.trim()]));
    }
    let paiements = (data || []).map(p => {
      const idResolu = p.assistante_id || assistanteIdParAssignation[p.assignation_id] || null;
      return {
        ...p,
        assistante_nom: p.assistante_nom || nomsParId[idResolu] || null,
        _assistante_id_resolu: idResolu,
      };
    });

    if (!isGlobal) {
      paiements = monAssistanteId ? paiements.filter(p => p._assistante_id_resolu === monAssistanteId) : [];
    }
    paiements = paiements.map(({ _assistante_id_resolu, ...p }) => p);

    res.json({ paiements });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── PATCH /admin/:id/traiter ──────────────────────────────────
router.patch("/admin/:id/traiter", authenticateAdmin, async (req, res) => {
  try {
    const { notes_assistante, assistante_id } = req.body;

    let assistante_nom = null;
    if (assistante_id) {
      const { data: u } = await supabase
        .from("utilisateurs")
        .select("prenom, nom")
        .eq("id", assistante_id)
        .maybeSingle();
      if (u) assistante_nom = `${u.prenom||""} ${u.nom||""}`.trim();
    }

    const { data, error } = await supabase
      .from("paiements_touchpoint")
      .update({
        traitee:          true,
        assistante_id:    assistante_id || req.user.id,
        assistante_nom:   assistante_nom,
        notes_assistante: notes_assistante?.trim() || null,
        date_traitement:  new Date().toISOString(),
        assigned_by:      req.profil?.id,
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ paiement: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── PATCH /admin/archiver ─────────────────────────────────────
// Masque (ou restaure) en masse des tentatives TouchPoint en double - n'efface jamais
// la ligne (traçabilité financière conservée), réutilise le flag "traitee" existant.
// Une commerciale ne peut archiver que SES propres tentatives, même logique de scoping
// par assistante_id (résolu par email) que GET /admin/all.
router.patch("/admin/archiver", authenticateAdmin, requirePermission("finances", "update"), async (req, res) => {
  try {
    const { ids, archiver } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids requis" });

    const ROLES_GLOBAUX = ["super_admin", "admin", "manager", "responsable", "gestionnaire", "superviseur", "comptable"];
    const isGlobal = ROLES_GLOBAUX.includes(req.role);

    let idsAutorises = ids;
    if (!isGlobal) {
      if (!req.user?.email) return res.status(403).json({ error: "Non autorisé" });
      const { data: monAssistante } = await supabase
        .from("assistantes").select("id").ilike("email", req.user.email.trim()).maybeSingle();
      const monAssistanteId = monAssistante?.id || null;
      if (!monAssistanteId) return res.status(403).json({ error: "Non autorisé" });

      const { data: rows } = await supabase
        .from("paiements_touchpoint")
        .select("id, assistante_id, assignation_id")
        .in("id", ids);
      const assignationIds = [...new Set((rows||[]).filter(r=>!r.assistante_id && r.assignation_id).map(r=>r.assignation_id))];
      let assistanteIdParAssignation = {};
      if (assignationIds.length) {
        const { data: assignationsRows } = await supabase
          .from("assignations_parcours").select("id, assistante_id").in("id", assignationIds);
        assistanteIdParAssignation = Object.fromEntries((assignationsRows||[]).filter(a=>a.assistante_id).map(a=>[a.id, a.assistante_id]));
      }
      idsAutorises = (rows||[])
        .filter(r => (r.assistante_id || assistanteIdParAssignation[r.assignation_id]) === monAssistanteId)
        .map(r => r.id);
      if (idsAutorises.length === 0) return res.status(403).json({ error: "Non autorisé" });
    }

    const { error } = await supabase
      .from("paiements_touchpoint")
      .update({ traitee: archiver !== false })
      .in("id", idsAutorises);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, count: idsAutorises.length });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
