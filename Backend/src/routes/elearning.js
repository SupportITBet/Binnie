/**
 * Routes e-learning dédiées - séparées du système BET classique
 *
 * GET  /api/elearning/coaches/:id/profil          - profil enrichi coach
 * PUT  /api/elearning/coaches/:id/profil          - màj profil coach
 * GET  /api/elearning/coaches/:id/disponibilites  - créneaux dispo
 * POST /api/elearning/coaches/:id/disponibilites  - ajouter créneau
 * DEL  /api/elearning/coaches/:id/disponibilites/:did
 *
 * GET  /api/elearning/seances                     - toutes séances (filtres)
 * POST /api/elearning/seances                     - créer séance
 * GET  /api/elearning/seances/:id                 - détail séance
 * PATCH /api/elearning/seances/:id                - màj séance
 * GET  /api/elearning/seances/:id/presences       - liste présences
 * POST /api/elearning/seances/:id/presences       - saisir présences (bulk)
 *
 * GET  /api/elearning/apprenants/:id/profil       - profil enrichi apprenant
 * PUT  /api/elearning/apprenants/:id/profil       - màj profil apprenant
 * GET  /api/elearning/apprenants/:id/progression  - progression cours/modules
 * GET  /api/elearning/apprenants/:id/resultats    - notes et résultats
 * POST /api/elearning/apprenants/:id/resultats    - ajouter résultat
 *
 * GET  /api/elearning/honoraires                  - liste mensuelle (filtres)
 * GET  /api/elearning/honoraires/:coachId/:mois/:annee
 * POST /api/elearning/honoraires/calculer         - calculer mois d'un coach
 * PATCH /api/elearning/honoraires/:id/statut      - valider / marquer payé
 */

import { Router } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import supabase from "../config/supabase.js";
import { authenticateAdmin, authenticateApprenant, requirePermission } from "../middlewares/requireAdmin.js";
import { notifyRole, notifyUser } from "../services/notifyRole.js";
import { envoyerEmailPublication } from "../services/emailPublication.js";
import { attribuerPoints, verifierBadges } from "../services/gamification.js";
import { traiterClotureSeanceRemplacement } from "./remplacements.js";
import { enregistrerMouvementTresorerie } from "./comptabilite.js";
import { passerEcriture, compteTresorerie } from "./comptabiliteGenerale.js";
import { bloquerAcces } from "../services/blocageAcces.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadDevoir = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-SUSPENSION - Blocage après 4 absences (même logique que BET classique)
// ─────────────────────────────────────────────────────────────────────────────

async function sendNotifElearning(userId, notif) {
  try {
    await supabase.from("notifications").insert({
      user_id: userId,
      type:    notif.type    || "info",
      titre:   notif.titre   || "",
      message: notif.message || "",
      lu:      false,
      meta:    notif.meta    || null,
    });
  } catch (e) { /* ignore */ }
}

async function checkAutoSuspensionElearning(inscriptionId, declencheurId) {
  try {
    // Récupère l'inscription + classe
    const { data: inscription } = await supabase
      .from("classes_elearning_apprenants")
      .select("*, classe:classes_elearning(nom, coach_id)")
      .eq("id", inscriptionId)
      .single();
    if (!inscription?.apprenant_id) return;

    // Déjà bloqué ? ne rien faire
    const { data: authData } = await supabase.auth.admin.getUserById(inscription.apprenant_id);
    if (authData?.user?.app_metadata?.acces_bloque) return;

    // Compter les absences depuis le dernier reset
    const resetAt = authData?.user?.app_metadata?.absences_reset_at;
    let q = supabase
      .from("presences_elearning")
      .select("id", { count: "exact", head: true })
      .eq("inscription_id", inscriptionId)
      .eq("statut", "absent");
    if (resetAt) q = q.gte("created_at", resetAt);
    const { count } = await q;

    if (!count || count < 4) return;

    const nomComplet = inscription.nom_complet || "Apprenant";
    const nomClasse  = inscription.classe?.nom || inscription.classe_id;

    // Bloquer dans Auth + marquer suspendu dans classes_elearning_apprenants.
    // Meme service que le dash : un seul endroit decide de ce que l'apprenant lit.
    await bloquerAcces({
      apprenantId: inscription.apprenant_id,
      motif:       "absences_repetees",
      contexte:    { nb: count, groupe: nomClasse },
    });
    await supabase
      .from("classes_elearning_apprenants")
      .update({ statut: "suspendu" })
      .eq("id", inscriptionId);

    console.log(`[auto-suspension-elearning] ${nomComplet} bloqué après ${count} absences dans "${nomClasse}"`);

    // Notifier onboarding, PA Advisor, Assistant E-Learning et Customer Care (qui gère les
    // déblocages). ⚠️ utilisateurs.role stocke le rôle RÉEL en base (onboarding,
    // pedagogical_advisor, assistant_elearning, customer_care) - jamais le libellé "admin_xxx"
    // recalculé côté frontend bet-elearning. On garde les deux formes par sécurité (même
    // correctif que pour notifyRole() ailleurs dans ce fichier).
    const { data: destinataires } = await supabase
      .from("utilisateurs")
      .select("id")
      .in("role", [
        "onboarding", "admin_onboarding",
        "pedagogical_advisor", "admin_pa_advisor",
        "assistant_elearning", "admin_elearning",
        "customer_care", "admin_customer_care",
      ])
      .eq("actif", true);
    if (destinataires?.length) {
      await supabase.from("notifications").insert(
        destinataires.map(u => ({
          user_id: u.id,
          type:    "absence_repetee",
          titre:   `🔒 Suspension automatique - ${nomComplet}`,
          message: `${nomComplet} a atteint ${count} absences dans la classe "${nomClasse}". Son accès a été automatiquement bloqué.`,
          lu:      false,
          source:  "bet-elearning",
          meta:    { inscription_id: inscriptionId, apprenant_id: inscription.apprenant_id, classe: nomClasse, nb_absences: count },
        }))
      );
    }

    // Notifier le coach de la classe
    const coachId = inscription.classe?.coach_id;
    if (coachId) {
      await sendNotifElearning(coachId, {
        type:    "absence_repetee",
        titre:   `🔒 Apprenant bloqué - ${nomComplet}`,
        message: `${nomComplet} a atteint ${count} absences dans votre classe "${nomClasse}". Son accès a été automatiquement bloqué.`,
        meta:    { inscription_id: inscriptionId, apprenant_id: inscription.apprenant_id, classe: nomClasse, nb_absences: count },
      });
    }
  } catch (e) {
    console.error("[auto-suspension-elearning]", e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COACHES - Profil e-learning
// ─────────────────────────────────────────────────────────────────────────────

router.get("/coaches/:id/profil", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("coach_elearning_profil")
      .select("*")
      .eq("coach_id", req.params.id)
      .maybeSingle();
    if (error) throw error;
    res.json({ profil: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/coaches/:id/profil", authenticateAdmin, async (req, res) => {
  try {
    const fields = ["bio","photo_url","niveaux_enseignes","specialisations","langues_enseignees",
                    "certifications","tarif_horaire","devise","experience_annees","linkedin_url","actif"];
    const payload = { coach_id: req.params.id, updated_at: new Date().toISOString() };
    fields.forEach(k => { if (req.body[k] !== undefined) payload[k] = req.body[k]; });

    const { data, error } = await supabase
      .from("coach_elearning_profil")
      .upsert(payload, { onConflict: "coach_id" })
      .select().single();
    if (error) throw error;
    res.json({ profil: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/coaches/:id/disponibilites", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("disponibilites_elearning")
      .select("*").eq("coach_id", req.params.id)
      .order("jour").order("heure_debut");
    if (error) throw error;
    res.json({ disponibilites: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/coaches/:id/disponibilites", authenticateAdmin, async (req, res) => {
  try {
    const { jour, heure_debut, heure_fin, recurrent, date_debut, date_fin } = req.body;
    if (!jour || !heure_debut || !heure_fin) return res.status(400).json({ error: "jour, heure_debut, heure_fin requis" });
    const { data, error } = await supabase
      .from("disponibilites_elearning")
      .insert({ coach_id: req.params.id, jour, heure_debut, heure_fin, recurrent: recurrent ?? true, date_debut: date_debut || null, date_fin: date_fin || null })
      .select().single();
    if (error) throw error;
    res.status(201).json({ disponibilite: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/coaches/:id/disponibilites/:did", authenticateAdmin, async (req, res) => {
  try {
    const { error } = await supabase.from("disponibilites_elearning")
      .delete().eq("id", req.params.did).eq("coach_id", req.params.id);
    if (error) throw error;
    res.json({ message: "Créneau supprimé" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// SÉANCES E-LEARNING
// ─────────────────────────────────────────────────────────────────────────────

router.get("/seances", authenticateAdmin, async (req, res) => {
  try {
    const { classe_id, coach_id, statut, mois, annee } = req.query;
    let q = supabase.from("seances_elearning").select("*").order("date").order("heure_debut");
    if (classe_id) q = q.eq("classe_id", classe_id);
    if (coach_id)  q = q.eq("coach_id", coach_id);
    if (statut)    q = q.eq("statut", statut);
    if (mois && annee) {
      const debut = `${annee}-${String(mois).padStart(2,"0")}-01`;
      const fin   = new Date(Number(annee), Number(mois), 0).toISOString().slice(0,10);
      q = q.gte("date", debut).lte("date", fin);
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json({ seances: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/seances", authenticateAdmin, requirePermission("planning", "create"), async (req, res) => {
  try {
    const { classe_id, coach_id, date, heure_debut, heure_fin, type, lien_zoom, lien_meet, lien_teams, objectifs_session, contenu_ids } = req.body;
    if (!classe_id || !coach_id || !date || !heure_debut || !heure_fin)
      return res.status(400).json({ error: "classe_id, coach_id, date, heure_debut, heure_fin requis" });

    // Récupérer le tarif du coach
    const { data: profil } = await supabase.from("coach_elearning_profil")
      .select("tarif_horaire").eq("coach_id", coach_id).maybeSingle();
    const tarif = profil?.tarif_horaire || 0;

    // Essai avec contenu_ids et type 'presentiel' (après migration)
    // Calculer duree_minutes depuis heure_debut/heure_fin (ex: "09:00" et "10:30" → 90 min)
    const parseMin = h => { const [hh, mm] = (h || "0:0").split(":").map(Number); return hh * 60 + (mm || 0); };
    const duree_minutes = heure_debut && heure_fin ? Math.max(0, parseMin(heure_fin) - parseMin(heure_debut)) : null;

    const typeDB = ["cours","evaluation","rattrapage","decouverte","presentiel"].includes(type) ? type : "cours";
    let insertPayload = {
      classe_id, coach_id, date, heure_debut, heure_fin,
      type: typeDB, statut: "planifiee",
      lien_zoom: lien_zoom || null, lien_meet: lien_meet || null, lien_teams: lien_teams || null,
      objectifs_session: objectifs_session || null,
      contenu_ids: contenu_ids || [],
      tarif_applique: tarif,
    };
    let { data, error } = await supabase.from("seances_elearning")
      .insert(insertPayload).select().single();

    // Fallback si contenu_ids ou 'presentiel' pas encore migrés
    if (error && (error.message?.includes("contenu_ids") || error.message?.includes("presentiel"))) {
      const { contenu_ids: _ci, ...payloadSansContenu } = insertPayload;
      payloadSansContenu.type = payloadSansContenu.type === "presentiel" ? "cours" : payloadSansContenu.type;
      const fallback = await supabase.from("seances_elearning").insert(payloadSansContenu).select().single();
      data = fallback.data; error = fallback.error;
      if (data) data._type_reel = typeDB; // conserver pour retour frontend
    }
    if (error) throw error;
    res.status(201).json({ seance: data });

    // Notifier apprenants de la classe + PA + onboarding + admin_elearning (best-effort)
    (async () => {
      try {
        const dateLabel = new Date(date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
        const heureLabel = `${heure_debut}–${heure_fin}`;
        const msgAppr = `Une nouvelle session a été planifiée le ${dateLabel} de ${heureLabel}.`;
        /* Le message administratif nommait la classe par son UUID : « dans la classe
           8f3c-… ». Illisible, et sans valeur pour qui reçoit la notification — il faut
           alors aller chercher de quelle classe il s'agit. On résout le nom. */
        const { data: classeSeance } = await supabase
          .from("classes_elearning").select("nom, entreprise_nom").eq("id", classe_id).maybeSingle();
        const nomClasseSeance = classeSeance?.nom || "classe inconnue";
        const msgAdmin = `Session planifiée le ${dateLabel} (${heureLabel}) dans la classe "${nomClasseSeance}"`
          + `${classeSeance?.entreprise_nom ? ` - ${classeSeance.entreprise_nom}` : ""}.`;

        // Apprenants actifs de la classe (via utilisateurs pour s'assurer que le compte existe)
        const { data: inscrits, error: errInscrits } = await supabase
          .from("classes_elearning_apprenants")
          .select("apprenant_id")
          .eq("classe_id", classe_id)
          .eq("statut", "actif")
          .not("apprenant_id", "is", null);
        if (errInscrits) console.warn("[seance notif apprenants]", errInscrits.message);
        if (inscrits?.length) {
          // Vérifier que les apprenant_id existent bien dans utilisateurs
          const appIds = inscrits.map(i => i.apprenant_id);
          const { data: utilisateursActifs } = await supabase
            .from("utilisateurs").select("id").in("id", appIds).eq("actif", true);
          const idsValides = (utilisateursActifs || []).map(u => u.id);
          if (idsValides.length) {
            const { error: errNotif } = await supabase.from("notifications").insert(idsValides.map(uid => ({
              user_id: uid,
              type:    "cours",
              titre:   "📅 Nouvelle session planifiée",
              message: msgAppr,
              lu:      false,
              meta:    { seance_id: data?.id, classe_id, date },
            })));
            if (errNotif) console.warn("[seance notif apprenants insert]", errNotif.message);
            else console.log(`[seance notif] ${idsValides.length} apprenant(s) notifié(s)`);
          }
        }

        // Rôles administratifs - `utilisateurs.role` stocke les valeurs "physiques"
        // (pedagogical_advisor, onboarding, assistant_elearning), pas les libellés de route
        // bet-elearning (admin_pa_advisor, admin_onboarding, admin_elearning) utilisés
        // uniquement côté frontend pour le routage/l'affichage. Ancien code ne notifiait donc
        // jamais personne - vérifié en base : aucun utilisateur n'a jamais eu ces rôles
        // "admin_*". On garde les deux formes par sécurité (coûte rien, aucun utilisateur ne
        // matchera la forme incorrecte).
        const notifAdmin = { type: "cours", titre: "📅 Session programmée", message: msgAdmin, meta: { seance_id: data?.id, classe_id, date } };
        const results = await Promise.allSettled([
          notifyRole(["pedagogical_advisor", "admin_pa_advisor"], notifAdmin),
          notifyRole(["onboarding", "admin_onboarding"], notifAdmin),
          notifyRole(["assistant_elearning", "admin_elearning"], notifAdmin),
          /* La supervision suit l'activité pédagogique : ce qui se programme, et pour
             quelle classe. Les quatre noms sont nécessaires — les rôles réels et les
             façades portées côté bet-elearning ; n'en citer qu'une moitié laisse l'autre
             moitié des comptes muette. */
          notifyRole(["superviseur", "admin_superviseur", "deputy_superviseur", "admin_deputy_superviseur"], notifAdmin),
        ]);
        results.forEach((r, i) => {
          if (r.status === 'rejected') console.warn(`[seance notif admin ${i}]`, r.reason);
        });

        // Notifier la RH entreprise des apprenants inscrits
        if (inscrits?.length) {
          const apprIds = inscrits.map(i => i.apprenant_id).filter(Boolean);
          const { data: apprUsers } = await supabase.from("utilisateurs").select("entreprise_id").in("id", apprIds).not("entreprise_id", "is", null);
          const entrepriseIds = [...new Set((apprUsers || []).map(u => u.entreprise_id).filter(Boolean))];
          for (const eid of entrepriseIds) {
            const { data: rhUsers } = await supabase.from("utilisateurs").select("id").eq("role", "client_entreprise").eq("entreprise_id", eid).eq("actif", true);
            if (rhUsers?.length) {
              await supabase.from("notifications").insert(rhUsers.map(u => ({
                user_id: u.id, type: "cours", lu: false,
                titre: "📅 Nouvelle session planifiée",
                message: `Une session a été planifiée le ${dateLabel} (${heureLabel}) pour vos apprenants.`,
                meta: { seance_id: data?.id, classe_id, date },
              })));
            }
          }
        }
      } catch {}
    })();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Enrichit chaque présence avec le nom/rôle réel de la personne qui l'a saisie (saisi_par),
// pour éviter que le front n'affiche le profil actuellement connecté à la place de l'auteur réel.
// `seanceId` permet de préciser, quand l'auteur est un coach, s'il s'agit du remplaçant assigné
// à CETTE séance précise - le rôle stocké dans `utilisateurs` est simplement "coach" pour un
// titulaire comme pour un remplaçant, donc le rôle seul ne suffit pas à les distinguer.
async function enrichirSaisiPar(presences, seanceId) {
  const ids = [...new Set((presences || []).map(p => p.saisi_par).filter(Boolean))];
  if (ids.length === 0) return presences || [];
  const [{ data: users }, { data: delegs }] = await Promise.all([
    supabase.from("utilisateurs").select("id, prenom, nom, role").in("id", ids),
    seanceId
      ? supabase.from("delegations").select("remplacant_id, sessions_ids").contains("sessions_ids", [seanceId])
      : Promise.resolve({ data: [] }),
  ]);
  const parId = {};
  (users || []).forEach(u => { parId[u.id] = u; });
  const remplacantIds = new Set((delegs || []).map(d => d.remplacant_id));
  return presences.map(p => ({
    ...p,
    saisi_par_prenom:      parId[p.saisi_par]?.prenom || null,
    saisi_par_nom:          parId[p.saisi_par]?.nom || null,
    saisi_par_role:         parId[p.saisi_par]?.role || null,
    saisi_par_est_remplacant: remplacantIds.has(p.saisi_par),
  }));
}

router.get("/seances/:id", authenticateAdmin, async (req, res) => {
  try {
    const [{ data: seance, error }, { data: presences }] = await Promise.all([
      supabase.from("seances_elearning").select("*").eq("id", req.params.id).single(),
      supabase.from("presences_elearning").select("*, classes_elearning_apprenants(nom_complet, email, niveau_cecr)")
        .eq("seance_id", req.params.id),
    ]);
    if (error) throw error;
    res.json({ seance, presences: await enrichirSaisiPar(presences, req.params.id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/seances/:id", authenticateAdmin, requirePermission("planning", "update"), async (req, res) => {
  try {
    const allowed = ["statut","compte_rendu","bilan_session","enregistrement_url",
                     "nb_presents","honoraire_valide","lien_zoom","lien_meet","lien_teams",
                     "date","heure_debut","heure_fin","objectifs_session","type","contenu_ids"];
    const payload = { updated_at: new Date().toISOString() };
    allowed.forEach(k => { if (req.body[k] !== undefined) payload[k] = req.body[k]; });

    // On relit l'état antérieur une seule fois : deux décisions en dépendent, et deux
    // lectures séparées auraient pu se contredire.
    const { data: avant, error: eAvant } = await supabase
      .from("seances_elearning")
      .select("statut, date, date_initiale, demarree_at, tarif_applique, duree_minutes")
      .eq("id", req.params.id).maybeSingle();
    if (eAvant) throw eAvant;
    if (!avant) return res.status(404).json({ error: "Séance introuvable" });

    // Statut avant modif - pour ne notifier qu'au moment où le coach clôture RÉELLEMENT la
    // séance (pas à chaque simple édition d'une séance déjà clôturée : compte-rendu, etc.).
    const etaitRealisee = avant.statut === "realisee";

    // ── Traçabilité ───────────────────────────────────────────────────────────
    // La salle affiche un chronomètre au coach, mais la clôture n'envoyait que le statut :
    // le temps réellement passé disparaissait avec la fenêtre, et personne - ni le PA, ni
    // la commerciale, ni le superviseur - ne pouvait dire combien de temps le cours a duré.
    //
    // `demarree_at` n'est posé qu'à la PREMIÈRE ouverture. Le réécrire à chaque passage en
    // « en_cours » effacerait l'heure de début réelle dès que le coach rafraîchit sa page et
    // retrouve sa salle : la traçabilité afficherait alors un cours commencé bien plus tard
    // qu'en réalité, ce qui est pire que pas de traçabilité du tout.
    if (payload.statut === "en_cours" && !avant.demarree_at) {
      payload.demarree_at = new Date().toISOString();
    }
    if (payload.statut === "realisee" && !etaitRealisee) {
      payload.terminee_at = new Date().toISOString();
      if (Number.isFinite(Number(req.body.duree_reelle_s))) {
        payload.duree_reelle_s = Math.max(0, Math.round(Number(req.body.duree_reelle_s)));
      }
    }

    // ── Report ────────────────────────────────────────────────────────────────
    // Un changement de date sur une séance non tenue est un report, pas une correction de
    // saisie. Le tracer ici plutôt que dans une route dédiée couvre TOUS les chemins qui
    // déplacent une séance - l'édition du planning comme un futur bouton « Reprogrammer ».
    // `date_initiale` est figée au premier report : elle porte la date d'origine, et c'est
    // elle qui garde la trace qu'un cours n'a pas eu lieu au moment prévu.
    if (payload.date && avant.date && payload.date !== avant.date && !["realisee", "annulee"].includes(avant.statut)) {
      payload.reprogrammee_le = new Date().toISOString();
      if (req.body.motif_report !== undefined) payload.reprogrammee_motif = req.body.motif_report || null;
      if (!avant.date_initiale) payload.date_initiale = avant.date;
    }

    // Si la séance passe à "realisee", calculer montant_seance. L'honoraire reste assis sur
    // la durée PRÉVUE, pas sur le temps relevé : c'est le contrat qui est payé, pas le
    // chronomètre. `duree_reelle_s` sert à constater l'écart, jamais à le facturer.
    if (payload.statut === "realisee" && avant.tarif_applique && avant.duree_minutes) {
      payload.montant_seance = Math.round((avant.tarif_applique * avant.duree_minutes / 60) * 100) / 100;
    }

    const CHAMPS_TRACABILITE = ["demarree_at", "terminee_at", "duree_reelle_s",
                                "date_initiale", "reprogrammee_le", "reprogrammee_motif"];

    let { data, error } = await supabase.from("seances_elearning")
      .update(payload).eq("id", req.params.id).select().single();

    // Filet de sécurité tant que la migration n'est pas passée.
    //
    // Sans lui, une colonne manquante ferait échouer TOUT l'appel : le coach ne pourrait plus
    // clôturer ses séances du tout. Clôturer est l'acte essentiel - présences, honoraire,
    // notifications aux apprenants en dépendent ; la traçabilité n'en est qu'un enrichissement.
    // On réessaie donc sans elle, et on le signale bruyamment dans les journaux plutôt que de
    // laisser croire que tout s'est bien passé.
    if (error && CHAMPS_TRACABILITE.some(c => payload[c] !== undefined) &&
        (error.code === "PGRST204" || error.code === "42703" || /column .* does not exist/i.test(error.message || ""))) {
      console.error(
        "[elearning PATCH] colonnes de traçabilité absentes - exécutez sql/seances_elearning_tracabilite.sql. " +
        "La séance est enregistrée SANS durée réelle ni horodatage :", error.message
      );
      const replis = { ...payload };
      CHAMPS_TRACABILITE.forEach(c => delete replis[c]);
      ({ data, error } = await supabase.from("seances_elearning")
        .update(replis).eq("id", req.params.id).select().single());
    }
    if (error) throw error;

    // Notifier tous les apprenants de la classe - présents ou non - quand le coach clôture
    // une session (live ou présentiel).
    if (payload.statut === "realisee" && !etaitRealisee && data.classe_id) {
      const dateLabel = data.date ? new Date(data.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long" }) : "";
      notifierApprenantsClasse(data.classe_id, {
        type:    "session",
        titre:   "✅ Session clôturée",
        message: `Votre session${dateLabel ? ` du ${dateLabel}` : ""} vient d'être clôturée par votre coach.${data.bilan_session ? " Un bilan est disponible." : ""}`,
        meta:    { seance_id: data.id, classe_id: data.classe_id },
      }).catch(() => {});

      // Remplacement (étapes 5 & 6) - réattribution honoraires + clôture auto si complet
      traiterClotureSeanceRemplacement(data.id, data.classe_id).catch(() => {});
    }

    res.json({ seance: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PRÉSENCES - Saisie bulk par séance
// ─────────────────────────────────────────────────────────────────────────────

router.get("/seances/:id/presences", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("presences_elearning")
      .select("*, classes_elearning_apprenants(nom_complet, email, niveau_cecr, statut)")
      .eq("seance_id", req.params.id);
    if (error) throw error;
    res.json({ presences: await enrichirSaisiPar(data, req.params.id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST body : { presences: [{ inscription_id, statut, note_participation, observation }] }
router.post("/seances/:id/presences", authenticateAdmin, requirePermission("classes", "update"), async (req, res) => {
  try {
    const { presences } = req.body;
    if (!Array.isArray(presences) || presences.length === 0)
      return res.status(400).json({ error: "presences[] requis" });

    const saisi_par = req.profil?.id || null;
    const rows = presences.map(p => ({
      seance_id:          req.params.id,
      inscription_id:     p.inscription_id,
      statut:             p.statut || "absent",
      heure_connexion:    p.heure_connexion || null,
      heure_deconnexion:  p.heure_deconnexion || null,
      duree_connexion_min:p.duree_connexion_min || null,
      note_participation: p.note_participation || null,
      observation:        p.observation || null,
      saisi_par,
    }));

    const { data, error } = await supabase.from("presences_elearning")
      .upsert(rows, { onConflict: "seance_id,inscription_id" }).select();
    if (error) throw error;

    // Mettre à jour nb_presents sur la séance
    const nbPresents = rows.filter(r => r.statut === "present" || r.statut === "retard").length;
    await supabase.from("seances_elearning").update({ nb_presents: nbPresents }).eq("id", req.params.id);

    // Vérifier auto-suspension pour chaque absent - attendu, voir groupes.js : en
    // serverless, ce qui n'est pas attendu avant la réponse peut ne jamais s'exécuter,
    // et l'apprenant ne serait ni bloqué ni prévenu.
    const absents = rows.filter(r => r.statut === "absent");
    await Promise.all(
      absents.map(r =>
        checkAutoSuspensionElearning(r.inscription_id, req.profil?.id)
          .catch(e => console.warn("[auto-suspension-elearning]", r.inscription_id, e.message))),
    );

    // Gamification : points pour chaque présence marquée présent/en retard.
    const presentsOuRetard = rows.filter(r => r.statut === "present" || r.statut === "retard");
    if (presentsOuRetard.length) {
      const { data: inscriptions } = await supabase
        .from("classes_elearning_apprenants")
        .select("id, apprenant_id")
        .in("id", presentsOuRetard.map(r => r.inscription_id));
      const apprenantIdParInscription = {};
      (inscriptions || []).forEach(i => { apprenantIdParInscription[i.id] = i.apprenant_id; });
      presentsOuRetard.forEach(r => {
        const apprenantId = apprenantIdParInscription[r.inscription_id];
        if (!apprenantId) return;
        const pts = r.statut === "present" ? 10 : 5;
        attribuerPoints(apprenantId, "session", req.params.id, pts, r.statut === "present" ? "Session live - présent" : "Session live - en retard").catch(() => {});
      });
    }

    res.json({ presences: data || [], nb_presents: nbPresents });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// APPRENANTS - Profil enrichi, progression, résultats
// ─────────────────────────────────────────────────────────────────────────────

router.get("/apprenants/:id/profil", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from("apprenants_elearning")
      .select("*").eq("inscription_id", req.params.id).maybeSingle();
    if (error) throw error;
    res.json({ profil: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const ORDRE_CECR = ["A1", "A2", "B1", "B2", "C1", "C2"];

router.put("/apprenants/:id/profil", authenticateAdmin, async (req, res) => {
  try {
    const fields = ["entreprise_id","langue_maternelle","nationalite","objectifs","motivations",
                    "niveau_initial","niveau_actuel","date_test_placement","score_test_placement","notes_internes"];
    const payload = { inscription_id: req.params.id, updated_at: new Date().toISOString() };
    fields.forEach(k => { if (req.body[k] !== undefined) payload[k] = req.body[k]; });

    // Niveau CECR avant modif - pour ne notifier/gamifier qu'une vraie progression (jamais
    // en cas de correction vers un niveau égal ou inférieur).
    let niveauAvant = null;
    if (payload.niveau_actuel !== undefined) {
      const { data: avant } = await supabase.from("apprenants_elearning").select("niveau_actuel").eq("inscription_id", req.params.id).maybeSingle();
      niveauAvant = avant?.niveau_actuel || null;
    }

    const { data, error } = await supabase.from("apprenants_elearning")
      .upsert(payload, { onConflict: "inscription_id" }).select().single();
    if (error) throw error;

    if (payload.niveau_actuel && payload.niveau_actuel !== niveauAvant) {
      const rangAvant   = ORDRE_CECR.indexOf((niveauAvant || "").toUpperCase());
      const rangApres   = ORDRE_CECR.indexOf(payload.niveau_actuel.toUpperCase());
      if (rangApres !== -1 && rangApres > rangAvant) {
        const { data: inscr } = await supabase.from("classes_elearning_apprenants").select("apprenant_id").eq("id", req.params.id).maybeSingle();
        if (inscr?.apprenant_id) {
          attribuerPoints(inscr.apprenant_id, "niveau_progression", req.params.id, 20, `Niveau ${payload.niveau_actuel} atteint`, { niveau: payload.niveau_actuel }).catch(() => {});
        }
      }
    }

    res.json({ profil: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/apprenants/:id/presences", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("presences_elearning")
      .select("*, seance:seances_elearning(date, heure_debut, heure_fin, objectifs_session, type)")
      .eq("inscription_id", req.params.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ presences: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/elearning/apprenants/:id/acces-status  - statut de blocage + compteur absences
router.get("/apprenants/:id/acces-status", authenticateAdmin, async (req, res) => {
  try {
    const inscriptionId = req.params.id;
    const { data: inscription } = await supabase
      .from("classes_elearning_apprenants")
      .select("apprenant_id")
      .eq("id", inscriptionId)
      .maybeSingle();

    if (!inscription?.apprenant_id) return res.json({ acces_bloque: false, nb_absences: 0 });

    const { data: authData } = await supabase.auth.admin.getUserById(inscription.apprenant_id);
    const meta      = authData?.user?.app_metadata || {};
    const accesBloque  = meta.acces_bloque || false;
    const resetAt      = meta.absences_reset_at || null;

    let q = supabase
      .from("presences_elearning")
      .select("id", { count: "exact", head: true })
      .eq("inscription_id", inscriptionId)
      .eq("statut", "absent");
    if (resetAt) q = q.gte("created_at", resetAt);
    const { count: nbAbsences } = await q;

    res.json({ acces_bloque: accesBloque, nb_absences: nbAbsences || 0, absences_reset_at: resetAt });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/elearning/apprenants/:id/suspension  - bloquer / débloquer
router.patch("/apprenants/:id/suspension", authenticateAdmin, async (req, res) => {
  try {
    const inscriptionId = req.params.id;
    const { bloque } = req.body;
    if (typeof bloque !== "boolean") return res.status(400).json({ error: "bloque (boolean) requis" });

    const { data: inscription } = await supabase
      .from("classes_elearning_apprenants")
      .select("apprenant_id, nom_complet")
      .eq("id", inscriptionId)
      .maybeSingle();

    if (!inscription?.apprenant_id) return res.status(404).json({ error: "Inscription introuvable" });

    const appMetaUpdate = { acces_bloque: bloque };
    if (!bloque) appMetaUpdate.absences_reset_at = new Date().toISOString();

    await supabase.auth.admin.updateUserById(inscription.apprenant_id, {
      app_metadata: appMetaUpdate,
    });

    // Synchroniser le statut dans classes_elearning_apprenants
    await supabase
      .from("classes_elearning_apprenants")
      .update({ statut: bloque ? "suspendu" : "actif" })
      .eq("id", inscriptionId);

    // Notifier les onboardings du déblocage
    if (!bloque) {
      const debloquePar = req.profil?.prenom ? `${req.profil.prenom} ${req.profil.nom}` : "Onboarding";
      const { data: onboardings } = await supabase
        .from("utilisateurs")
        .select("id")
        .eq("role", "admin_onboarding")
        .eq("actif", true);
      if (onboardings?.length) {
        await supabase.from("notifications").insert(
          onboardings
            .filter(u => u.id !== req.profil?.id)
            .map(u => ({
              user_id: u.id,
              type:    "reinstatement",
              titre:   `🔓 Déblocage - ${inscription.nom_complet}`,
              message: `${inscription.nom_complet} a été débloqué(e) par ${debloquePar}. Le compteur d'absences a été remis à zéro.`,
              lu:      false,
              meta:    { inscription_id: inscriptionId, apprenant_id: inscription.apprenant_id },
            }))
        );
      }
    }

    res.json({ ok: true, acces_bloque: bloque });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/apprenants/:id/progression", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from("progression_elearning")
      .select("*, cours_elearning(titre, niveau), modules_elearning(nom, ordre)")
      .eq("inscription_id", req.params.id).order("updated_at", { ascending: false });
    if (error) throw error;
    res.json({ progression: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/apprenants/:id/resultats", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from("resultats_elearning")
      .select("*").eq("inscription_id", req.params.id)
      .order("date_evaluation", { ascending: false });
    if (error) throw error;
    res.json({ resultats: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/elearning/apprenants/:id/evaluations - notes manuelles + devoirs corrigés combinés
router.get("/apprenants/:id/evaluations", authenticateAdmin, async (req, res) => {
  try {
    const inscriptionId = req.params.id;
    console.log("[evaluations] inscriptionId:", inscriptionId);

    // 1. Notes manuelles (resultats_elearning)
    const { data: manuelles, error: errM } = await supabase
      .from("resultats_elearning")
      .select("*")
      .eq("inscription_id", inscriptionId)
      .order("date_evaluation", { ascending: false });
    if (errM) console.warn("[evaluations] erreur resultats_elearning:", errM.message);
    console.log("[evaluations] manuelles:", (manuelles || []).length);

    // 2. Devoirs corrigés avec note (sans join - 2 requêtes séparées)
    const { data: rendus, error: errR } = await supabase
      .from("devoirs_rendus_elearning")
      .select("id, devoir_id, note, note_max, commentaire_coach, corrige_at, statut")
      .eq("inscription_id", inscriptionId)
      .not("note", "is", null)
      .order("corrige_at", { ascending: false });
    if (errR) console.warn("[evaluations] erreur devoirs_rendus:", errR.message);
    console.log("[evaluations] rendus avec note:", (rendus || []).length);

    // 3. Récupérer les titres des devoirs séparément
    let devoirsMap = {};
    if (rendus?.length) {
      const devoirIds = [...new Set(rendus.map(r => r.devoir_id).filter(Boolean))];
      const { data: devoirs } = await supabase
        .from("devoirs_elearning")
        .select("id, titre, type")
        .in("id", devoirIds);
      (devoirs || []).forEach(d => { devoirsMap[d.id] = d; });
    }

    const devoirsNotes = (rendus || []).map(r => ({
      id:               `devoir-${r.id}`,
      inscription_id:   inscriptionId,
      titre:            devoirsMap[r.devoir_id]?.titre || "Devoir",
      type:             "devoir",
      note:             r.note,
      note_max:         r.note_max ?? 20,
      mention:          null,
      commentaire_coach: r.commentaire_coach || null,
      date_evaluation:  r.corrige_at,
      source:           "devoir",
    }));

    const toutes = [
      ...(manuelles || []).map(n => ({ ...n, source: "manuel" })),
      ...devoirsNotes,
    ].sort((a, b) => new Date(b.date_evaluation || 0) - new Date(a.date_evaluation || 0));

    console.log("[evaluations] total:", toutes.length);
    res.json({ evaluations: toutes });
  } catch (err) {
    console.error("[evaluations] erreur:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/apprenants/:id/resultats", authenticateAdmin, async (req, res) => {
  try {
    const { classe_id, seance_id, type, titre, note, note_max, competences, commentaire_coach, points_forts, axes_amelioration, niveau_atteint } = req.body;
    if (!classe_id) return res.status(400).json({ error: "classe_id requis" });

    // Mention automatique
    let mention = null;
    if (note != null && note_max) {
      const pct = (note / note_max) * 100;
      if (pct >= 90) mention = "Excellent";
      else if (pct >= 75) mention = "Bien";
      else if (pct >= 60) mention = "Assez Bien";
      else if (pct >= 50) mention = "Passable";
      else mention = "Insuffisant";
    }

    const { data, error } = await supabase.from("resultats_elearning").insert({
      inscription_id: req.params.id,
      classe_id, seance_id: seance_id || null,
      type: type || "controle", titre: titre || null,
      note: note || null, note_max: note_max || 20, mention,
      competences: competences || [],
      commentaire_coach: commentaire_coach || null,
      points_forts: points_forts || null,
      axes_amelioration: axes_amelioration || null,
      niveau_atteint: niveau_atteint || null,
      evalue_par: req.profil?.id || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ resultat: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PRÉSENCES PAR CLASSE - toutes séances confondues
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/elearning/classes/:id/apprenants
router.get("/classes/:id/apprenants", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("classes_elearning_apprenants")
      .select("id, nom_complet, email, telephone, niveau_cecr, statut, date_inscription, notes")
      .eq("classe_id", req.params.id)
      .order("nom_complet", { ascending: true });
    if (error) throw error;
    res.json({ apprenants: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/elearning/classes/:id/presences
router.get("/classes/:id/presences", authenticateAdmin, async (req, res) => {
  try {
    // 1. IDs des séances de cette classe
    const { data: seances, error: errS } = await supabase
      .from("seances_elearning")
      .select("id, date, heure_debut, heure_fin, objectifs_session, type")
      .eq("classe_id", req.params.id)
      .order("date", { ascending: false });
    if (errS) throw errS;

    const seanceIds = (seances || []).map(s => s.id);
    if (seanceIds.length === 0) return res.json({ presences: [], seances: [] });

    // 2. Présences liées à ces séances
    const { data: presences, error: errP } = await supabase
      .from("presences_elearning")
      .select(`
        id, inscription_id, seance_id, statut, observation, created_at,
        inscription:classes_elearning_apprenants(nom_complet, niveau_cecr, apprenant_id)
      `)
      .in("seance_id", seanceIds)
      .order("created_at", { ascending: false });
    if (errP) throw errP;

    // 3. Fusionner les infos séance dans chaque présence
    const seanceMap = Object.fromEntries((seances || []).map(s => [s.id, s]));
    const enrichies = (presences || []).map(p => ({
      ...p,
      seance: seanceMap[p.seance_id] || null,
    }));

    res.json({ presences: enrichies, seances: seances || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/elearning/apprenants/by-email/presences?email=X
// Retourne les inscriptions + présences d'un apprenant identifié par son email
router.get("/apprenants/by-email/presences", authenticateAdmin, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "email requis" });

    // 1. Trouver l'utilisateur par email
    const { data: user } = await supabase
      .from("utilisateurs")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (!user) return res.json({ presences: [], inscriptions: [], found: false });

    // 2. Trouver ses inscriptions e-learning
    const { data: inscriptions } = await supabase
      .from("classes_elearning_apprenants")
      .select("id, classe_id, niveau_cecr, statut, created_at, classe:classes_elearning(nom, niveau)")
      .eq("apprenant_id", user.id);

    const inscriptionIds = (inscriptions || []).map(i => i.id);
    if (inscriptionIds.length === 0) return res.json({ presences: [], inscriptions: inscriptions || [], found: true });

    // 3. Présences pour toutes ses inscriptions
    const { data: presences } = await supabase
      .from("presences_elearning")
      .select("*, seance:seances_elearning(date, heure_debut, heure_fin, objectifs_session, type, classe_id)")
      .in("inscription_id", inscriptionIds)
      .order("created_at", { ascending: false });

    res.json({ presences: presences || [], inscriptions: inscriptions || [], found: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// HONORAIRES E-LEARNING - Circuit séparé de BET
// ─────────────────────────────────────────────────────────────────────────────

router.get("/honoraires", authenticateAdmin, requirePermission("honoraires", "read"), async (req, res) => {
  try {
    const { mois, annee, statut } = req.query;
    // Un coach ne peut voir que ses propres honoraires - un coach_id passé en query
    // n'est honoré que pour les rôles admin/PA (jamais pour se substituer à un autre coach).
    const coach_id = req.role === "coach" ? req.profil?.id : req.query.coach_id;
    let q = supabase.from("honoraires_elearning_mois").select("*")
      .order("annee", { ascending: false }).order("mois", { ascending: false });
    if (coach_id) q = q.eq("coach_id", coach_id);
    if (mois)     q = q.eq("mois", Number(mois));
    if (annee)    q = q.eq("annee", Number(annee));
    if (statut)   q = q.eq("statut", statut);
    const { data, error } = await q;
    if (error) throw error;

    // Enrichir avec le nom du coach
    const coachIds = [...new Set((data || []).map(h => h.coach_id))];
    let coachMap = {};
    if (coachIds.length) {
      const { data: coaches } = await supabase.from("utilisateurs")
        .select("id, prenom, nom, role, avatar_url").in("id", coachIds);
      (coaches || []).forEach(c => { coachMap[c.id] = c; });
    }
    const enriched = (data || []).map(h => ({ ...h, coach: coachMap[h.coach_id] || null }));
    res.json({ honoraires: enriched });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Recalcule la fiche d'honoraires d'un coach pour un mois donné, en excluant
// les séances explicitement rejetées par le PA (honoraire_statut_pa = 'rejete').
// Préserve les retenues/note déjà saisies par le PA sur une fiche existante.
export async function recalculerHonoraireMois(coach_id, mois, annee) {
  const debut = `${annee}-${String(mois).padStart(2,"0")}-01`;
  const fin   = new Date(Number(annee), Number(mois), 0).toISOString().slice(0,10);

  const { data: seances, error: errS } = await supabase.from("seances_elearning")
    .select("id, duree_minutes, heure_debut, heure_fin, montant_seance, nb_presents, tarif_applique, type, honoraire_statut_pa")
    .eq("coach_id", coach_id).eq("statut", "realisee")
    .neq("honoraire_statut_pa", "rejete")
    .gte("date", debut).lte("date", fin);
  if (errS) throw errS;

  const [{ data: profil }, { data: utilisateur }, { data: param }, { data: existant }] = await Promise.all([
    supabase.from("coach_elearning_profil").select("tarif_horaire").eq("coach_id", coach_id).maybeSingle(),
    supabase.from("utilisateurs").select("coach_info, type_coach").eq("id", coach_id).maybeSingle(),
    supabase.from("parametres").select("valeur").eq("cle", "grille_tarifaire").maybeSingle(),
    supabase.from("honoraires_elearning_mois").select("retenues, note_pa").eq("coach_id", coach_id).eq("mois", mois).eq("annee", annee).maybeSingle(),
  ]);

  const GRILLE_DEF = {
    tarifs: {
      Vacataire: { en_ligne:5000, presentiel:6500 },
      CDD:       { en_ligne:6500, presentiel:8000 },
      CDI:       { en_ligne:8000, presentiel:9500 },
      Freelance: { en_ligne:6000, presentiel:7500 },
    },
  };

  let tarif_horaire = profil?.tarif_horaire || 0;
  if (!tarif_horaire) {
    const grille = param?.valeur || GRILLE_DEF;
    const type_contrat = utilisateur?.coach_info?.type_contrat || "Vacataire";
    tarif_horaire = grille.tarifs?.[type_contrat]?.en_ligne || GRILLE_DEF.tarifs["Vacataire"].en_ligne;
  }

  const parseMin = h => { const [hh, mm] = (h || "0:0").split(":").map(Number); return hh * 60 + (mm || 0); };
  const getDuree = s => s.duree_minutes || (s.heure_debut && s.heure_fin ? Math.max(0, parseMin(s.heure_fin) - parseMin(s.heure_debut)) : 0);

  const nb_seances    = (seances || []).length;
  const nb_heures     = Math.round((seances || []).reduce((t, s) => t + getDuree(s), 0) / 60 * 100) / 100;
  const nb_apprenants = (seances || []).reduce((t, s) => t + (s.nb_presents || 0), 0);
  const montant_brut  = Math.round(tarif_horaire * nb_heures * 100) / 100;
  const seances_ids   = (seances || []).map(s => s.id);
  const retenues      = existant?.retenues || 0;
  const montant_net   = Math.max(0, montant_brut - retenues);

  const { data, error } = await supabase.from("honoraires_elearning_mois").upsert({
    coach_id, mois: Number(mois), annee: Number(annee),
    nb_seances, nb_heures, nb_apprenants,
    tarif_horaire, montant_brut, retenues, montant_net,
    note_pa: existant?.note_pa || null,
    seances_ids,
    updated_at: new Date().toISOString(),
  }, { onConflict: "coach_id,mois,annee" }).select().single();
  if (error) throw error;
  return data;
}

// Une fiche déjà transmise à la RH (ou payée) ne doit plus pouvoir être recalculée
// silencieusement - sinon la RH agit sur des montants qui changent après coup sans
// repasser par une nouvelle validation. Il faut d'abord la remettre "en attente".
export async function verifierFicheModifiable(coach_id, mois, annee) {
  const { data: existant } = await supabase.from("honoraires_elearning_mois")
    .select("statut").eq("coach_id", coach_id).eq("mois", mois).eq("annee", annee).maybeSingle();
  if (existant && (existant.statut === "transmis" || existant.statut === "paye")) {
    const err = new Error(`Cette fiche est déjà "${existant.statut === "paye" ? "payée" : "transmise à la RH"}" - remettez-la d'abord en attente avant de la modifier.`);
    err.statusCode = 409;
    throw err;
  }
}

// Calculer/recalculer les honoraires d'un coach pour un mois
router.post("/honoraires/calculer", authenticateAdmin, requirePermission("honoraires", "manage"), async (req, res) => {
  try {
    const { coach_id, mois, annee } = req.body;
    if (!coach_id || !mois || !annee) return res.status(400).json({ error: "coach_id, mois, annee requis" });
    await verifierFicheModifiable(coach_id, Number(mois), Number(annee));
    const data = await recalculerHonoraireMois(coach_id, Number(mois), Number(annee));
    res.json({ honoraire: data });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// Le PA valide ou rejette une séance individuelle prise en compte dans les honoraires
// du mois - recalcule aussitôt la fiche mensuelle du coach pour refléter le changement.
router.patch("/honoraires/seance/:id/statut", authenticateAdmin, requirePermission("honoraires", "manage"), async (req, res) => {
  try {
    const { statut, note } = req.body;
    const allowed = ["en_attente", "valide", "rejete"];
    if (!allowed.includes(statut)) return res.status(400).json({ error: "statut invalide" });

    const { data: seanceAvant } = await supabase.from("seances_elearning").select("coach_id, date").eq("id", req.params.id).maybeSingle();
    if (seanceAvant) {
      const dAvant = new Date(seanceAvant.date);
      await verifierFicheModifiable(seanceAvant.coach_id, dAvant.getMonth() + 1, dAvant.getFullYear());
    }

    const { data: seance, error: errSeance } = await supabase.from("seances_elearning")
      .update({
        honoraire_statut_pa: statut,
        honoraire_statut_pa_note: note || null,
        honoraire_statut_pa_par: req.profil?.id || null,
        honoraire_statut_pa_at: new Date().toISOString(),
      })
      .eq("id", req.params.id).select("id, coach_id, date").single();
    if (errSeance) throw errSeance;

    const d = new Date(seance.date);
    const honoraire = await recalculerHonoraireMois(seance.coach_id, d.getMonth() + 1, d.getFullYear());

    if (statut === "rejete") {
      const { data: coach } = await supabase.from("utilisateurs").select("prenom, nom").eq("id", seance.coach_id).maybeSingle();
      await notifyUser(seance.coach_id, {
        type: "paiement",
        titre: "🚫 Séance rejetée de vos honoraires",
        message: `Une séance du ${d.toLocaleDateString("fr-FR")} a été rejetée par le PA Advisor${note ? ` : ${note}` : "."}`,
        meta: { seance_id: seance.id, honoraire_id: honoraire.id },
      }).catch(() => {});
    }

    res.json({ seance, honoraire });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// Détail des séances réalisées ayant servi au calcul d'une fiche d'honoraires
router.get("/honoraires/:id/seances", authenticateAdmin, requirePermission("honoraires", "read"), async (req, res) => {
  try {
    const { data: hon, error: errH } = await supabase.from("honoraires_elearning_mois")
      .select("coach_id, mois, annee, tarif_horaire").eq("id", req.params.id).maybeSingle();
    if (errH) throw errH;
    if (!hon) return res.json({ seances: [] });
    if (req.role === "coach" && hon.coach_id !== req.profil?.id) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Re-requêté sur coach_id + mois/année (pas seances_ids, qui exclut déjà les séances
    // rejetées après recalcul) pour que les séances rejetées restent visibles/réactivables.
    const debut = `${hon.annee}-${String(hon.mois).padStart(2,"0")}-01`;
    const fin   = new Date(hon.annee, hon.mois, 0).toISOString().slice(0,10);
    const { data: seances, error: errS } = await supabase.from("seances_elearning")
      .select("id, classe_id, date, heure_debut, heure_fin, duree_minutes, type, nb_presents, statut, honoraire_statut_pa, honoraire_statut_pa_note, remplacement_id")
      .eq("coach_id", hon.coach_id).eq("statut", "realisee")
      .gte("date", debut).lte("date", fin);
    if (errS) throw errS;

    const classeIds = [...new Set((seances || []).map(s => s.classe_id).filter(Boolean))];
    let classeMap = {};
    if (classeIds.length) {
      const { data: classes } = await supabase.from("classes_elearning").select("id, nom").in("id", classeIds);
      (classes || []).forEach(c => { classeMap[c.id] = c.nom; });
    }

    // Séances honorées suite à un remplacement - badge "🔄 Remplacement" côté honoraires,
    // avec le nom du titulaire d'origine (voir même logique dans seances.js).
    const remplacementIds = [...new Set((seances || []).map(s => s.remplacement_id).filter(Boolean))];
    let remplacementMap = {};
    if (remplacementIds.length) {
      const { data: remps } = await supabase.from("remplacements").select("id, absent_nom").in("id", remplacementIds);
      remplacementMap = Object.fromEntries((remps || []).map(r => [r.id, r]));
    }

    const parseMin = h => { const [hh, mm] = (h || "0:0").split(":").map(Number); return hh * 60 + (mm || 0); };
    const getDuree = s => s.duree_minutes || (s.heure_debut && s.heure_fin ? Math.max(0, parseMin(s.heure_fin) - parseMin(s.heure_debut)) : 0);

    const enriched = (seances || [])
      .map(s => {
        const duree_heures = Math.round(getDuree(s) / 60 * 100) / 100;
        return {
          ...s,
          classe_nom: classeMap[s.classe_id] || "-",
          duree_heures,
          montant: Math.round(duree_heures * (hon.tarif_horaire || 0) * 100) / 100,
          remplacement_absent_nom: s.remplacement_id ? (remplacementMap[s.remplacement_id]?.absent_nom || null) : null,
        };
      })
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    res.json({ seances: enriched });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/honoraires/:id/statut", authenticateAdmin, requirePermission("honoraires", "manage"), async (req, res) => {
  try {
    const { statut, mode_paiement, reference_paiement, retenues, note_pa } = req.body;
    // "valide" = le PA a vérifié le calcul (encore modifiable, coach peut contester).
    // "transmis" = envoi définitif à la RH/Paie, étape séparée et volontaire du PA.
    const allowed = ["valide","transmis","paye","en_attente","litige"];
    if (!allowed.includes(statut)) return res.status(400).json({ error: "statut invalide" });

    // Avant transmission définitive à la RH : aucune séance du mois ne doit rester
    // "en_attente" - chacune doit avoir été explicitement validée ou rejetée par le PA.
    if (statut === "transmis") {
      const { data: hon } = await supabase.from("honoraires_elearning_mois")
        .select("coach_id, mois, annee").eq("id", req.params.id).maybeSingle();
      if (!hon) return res.status(404).json({ error: "Fiche introuvable" });
      const debut = `${hon.annee}-${String(hon.mois).padStart(2,"0")}-01`;
      const fin   = new Date(hon.annee, hon.mois, 0).toISOString().slice(0,10);
      const { count: nbEnAttente } = await supabase.from("seances_elearning")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", hon.coach_id).eq("statut", "realisee")
        .eq("honoraire_statut_pa", "en_attente")
        .gte("date", debut).lte("date", fin);
      if (nbEnAttente > 0) {
        return res.status(400).json({
          error: `Impossible de transmettre : ${nbEnAttente} séance${nbEnAttente>1?"s":""} encore en attente de validation. Validez ou rejetez-les toutes d'abord.`,
        });
      }
    }

    const payload = { statut, updated_at: new Date().toISOString() };
    if (note_pa)             payload.note_pa = note_pa;
    if (retenues != null)    { payload.retenues = retenues; }
    if (statut === "valide")   { payload.valide_par = req.profil?.id; payload.valide_at = new Date().toISOString(); }
    if (statut === "transmis") { payload.transmis_par = req.profil?.id; payload.transmis_at = new Date().toISOString(); }
    if (statut === "paye")   {
      payload.paye_at = new Date().toISOString();
      if (mode_paiement)    payload.mode_paiement = mode_paiement;
      if (reference_paiement) payload.reference_paiement = reference_paiement;
    } else {
      // On quitte le statut "payé" (ex: annulation d'un paiement saisi par erreur) -
      // on efface la trace de paiement pour ne pas laisser une fiche non-payée avec
      // une date/référence de paiement obsolète.
      payload.paye_at = null;
      payload.mode_paiement = null;
      payload.reference_paiement = null;
    }

    // Recalculer montant_net si retenues changent
    if (retenues != null) {
      const { data: h } = await supabase.from("honoraires_elearning_mois")
        .select("montant_brut").eq("id", req.params.id).single();
      if (h) payload.montant_net = Math.max(0, (h.montant_brut || 0) - retenues);
    }

    const { data, error } = await supabase.from("honoraires_elearning_mois")
      .update(payload).eq("id", req.params.id).select().single();
    if (error) throw error;

    const MOIS_LABELS = ["","Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];
    const periode = `${MOIS_LABELS[data.mois]} ${data.annee}`;
    const montantFmt = `${Math.round(data.montant_net).toLocaleString("fr-FR")} FCFA`;

    // Paiement coach confirmé → sortie de trésorerie réelle.
    if (statut === "paye") {
      const { data: coachTr } = await supabase.from("utilisateurs").select("prenom, nom").eq("id", data.coach_id).maybeSingle();
      const nomCoachTr = coachTr ? `${coachTr.prenom || ""} ${coachTr.nom || ""}`.trim() : "un coach";
      enregistrerMouvementTresorerie({
        type: "sortie", categorie: "paiement_coach", montant: data.montant_net,
        date_mouvement: new Date().toISOString().slice(0, 10),
        source_type: "honoraire_mois", source_id: data.id,
        description: `Honoraires ${periode} - ${nomCoachTr}`, mode_paiement: mode_paiement || null,
        created_by: req.profil?.id || null,
      }).catch(() => {});
      passerEcriture({
        journal: "BQ", date_ecriture: new Date().toISOString().slice(0, 10), libelle: `Honoraires ${periode} - ${nomCoachTr}`,
        source_type: "honoraire_mois", source_id: data.id, created_by: req.profil?.id || null,
        lignes: [
          { compte_numero: "622000", debit: data.montant_net },
          { compte_numero: compteTresorerie(mode_paiement), credit: data.montant_net },
        ],
      }).catch(() => {});
    }

    if (statut === "transmis") {
      const { data: coach } = await supabase.from("utilisateurs").select("prenom, nom").eq("id", data.coach_id).maybeSingle();
      const nomCoach = coach ? `${coach.prenom||""} ${coach.nom||""}`.trim() : "un coach";
      await notifyRole(["rh", "admin_rh_paie"], {
        type: "paiement",
        titre: "💰 Honoraires transmis pour paiement",
        message: `${nomCoach} - ${periode} - ${montantFmt} net à verser.`,
        meta: { honoraire_id: data.id, coach_id: data.coach_id, mois: data.mois, annee: data.annee },
      }).catch(() => {});
    }

    // Le coach est informé à chaque étape qui le concerne, pour pouvoir contester
    // avant la transmission définitive à la RH.
    const NOTIF_COACH = {
      valide:     { titre: "✅ Vos honoraires ont été validés", message: `Votre fiche ${periode} (${montantFmt}) a été validée par le PA Advisor et sera bientôt transmise à la RH. Vous pouvez encore signaler un désaccord avant la transmission.` },
      transmis:   { titre: "📤 Vos honoraires ont été transmis à la RH", message: `Votre fiche ${periode} (${montantFmt}) a été transmise à la RH/Paie pour paiement.` },
      litige:     { titre: "🚫 Votre fiche d'honoraires a été refusée", message: `Votre fiche ${periode} a été mise en litige par le PA Advisor${note_pa ? ` : ${note_pa}` : "."}` },
      paye:       { titre: "💵 Vous avez été payé", message: `Le paiement de votre fiche ${periode} (${montantFmt}) a été enregistré par la RH.` },
    };
    if (NOTIF_COACH[statut]) {
      await notifyUser(data.coach_id, { type: "paiement", ...NOTIF_COACH[statut], meta: { honoraire_id: data.id, mois: data.mois, annee: data.annee } }).catch(() => {});
    }

    res.json({ honoraire: data });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// REPORTING EXÉCUTIF - agrégats réels pour le tableau de bord Manager/Superviseur
// (remplace l'ancien ReportingExecutif.jsx entièrement basé sur des mocks)
// ─────────────────────────────────────────────────────────────────────────────

// Même logique que trancheDepuisApprenant() dans contenusOnboarding.js - dupliquée ici
// volontairement pour ne pas créer de dépendance entre fichiers de routes.
function trancheAge(a) {
  if (a.profil_type && a.profil_type !== "adulte") return a.profil_type;
  if (!a.date_naissance) return "adulte";
  const age = Math.floor((Date.now() - new Date(a.date_naissance).getTime()) / (365.25 * 24 * 3600 * 1000));
  if (age <= 12) return "enfant";
  if (age <= 17) return "adolescent";
  return "adulte";
}

router.get("/reporting-executif", authenticateAdmin, async (req, res) => {
  try {
    const [
      { data: apprenants },
      { data: seances },
      { data: entreprises },
      { data: contrats },
      { data: classes },
    ] = await Promise.all([
      supabase.from("classes_elearning_apprenants").select("statut, niveau_cecr, profil_type, date_naissance, classe_id"),
      supabase.from("seances_elearning").select("statut"),
      supabase.from("comptes_entreprises").select("id, nom, secteur, statut, couleur, initiales, nb_licences"),
      supabase.from("contrats_entreprises_elearning").select("id, entreprise_id, numero_contrat, package, nb_licences, montant_ht, devise, statut, date_debut, date_fin, created_at, entreprise:comptes_entreprises(nom,couleur,initiales)").order("created_at", { ascending: false }),
      supabase.from("classes_elearning").select("id, entreprise_id").neq("statut", "archive"),
    ]);

    // ── Apprenants ──────────────────────────────────────────────
    const apprenantsTotal  = (apprenants || []).length;
    const apprenantsActifs = (apprenants || []).filter(a => a.statut === "actif").length;

    const NIVEAUX = ["A1", "A2", "B1", "B2", "C1", "C2"];
    const niveauCounts = {};
    (apprenants || []).forEach(a => { if (a.niveau_cecr) niveauCounts[a.niveau_cecr] = (niveauCounts[a.niveau_cecr] || 0) + 1; });
    const avecNiveau = Object.values(niveauCounts).reduce((s, n) => s + n, 0);
    const niveaux_cecr = NIVEAUX.filter(n => niveauCounts[n]).map(n => ({
      niveau: n, count: niveauCounts[n], pct: avecNiveau > 0 ? Math.round((niveauCounts[n] / avecNiveau) * 100) : 0,
    }));

    const trancheCounts = { enfant: 0, adolescent: 0, adulte: 0 };
    (apprenants || []).forEach(a => { trancheCounts[trancheAge(a)]++; });
    const tranches_age = [
      { tranche: "enfant",     lib: "🧒 Enfants (≤12 ans)",       count: trancheCounts.enfant },
      { tranche: "adolescent", lib: "🧑 Adolescents (13-17 ans)", count: trancheCounts.adolescent },
      { tranche: "adulte",     lib: "🧑‍💼 Adultes (18+)",          count: trancheCounts.adulte },
    ].map(t => ({ ...t, pct: apprenantsTotal > 0 ? Math.round((t.count / apprenantsTotal) * 100) : 0 }));

    // ── Sessions ────────────────────────────────────────────────
    const sessionsTotal     = (seances || []).length;
    const sessionsRealisees = (seances || []).filter(s => s.statut === "realisee").length;

    // ── Entreprises ─────────────────────────────────────────────
    const apprenantsParEntreprise = {};
    const classeParId = {};
    (classes || []).forEach(c => { classeParId[c.id] = c.entreprise_id; });
    (apprenants || []).forEach(a => {
      const eid = classeParId[a.classe_id];
      if (!eid) return;
      if (!apprenantsParEntreprise[eid]) apprenantsParEntreprise[eid] = { total: 0, actifs: 0 };
      apprenantsParEntreprise[eid].total++;
      if (a.statut === "actif") apprenantsParEntreprise[eid].actifs++;
    });
    const entreprisesEnrichies = (entreprises || []).map(e => ({
      ...e,
      nb_apprenants_actifs: apprenantsParEntreprise[e.id]?.actifs || 0,
      nb_apprenants_total:  apprenantsParEntreprise[e.id]?.total  || 0,
    }));
    const entreprisesActives = (entreprises || []).filter(e => e.statut === "actif").length;

    // ── Contrats / CA ───────────────────────────────────────────
    const contratsActifs = (contrats || []).filter(c => c.statut === "actif");
    const caTotalActifs  = contratsActifs.reduce((s, c) => s + (c.montant_ht || 0), 0);

    // CA par mois de signature (12 derniers mois glissants) - réel, basé sur created_at.
    // Pas d'"objectif" affiché : aucune donnée d'objectif mensuel n'existe en base, on ne
    // fabrique pas un chiffre qui n'existe pas.
    const MOIS_LIB = ["Jan","Fév","Mar","Avr","Mai","Jui","Jul","Aoû","Sep","Oct","Nov","Déc"];
    const now = new Date();
    const ca_mensuel = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      return { mois: MOIS_LIB[d.getMonth()], annee: d.getFullYear(), cle: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`, ca: 0 };
    });
    (contrats || []).forEach(c => {
      if (!c.created_at) return;
      const cle = c.created_at.slice(0, 7);
      const bucket = ca_mensuel.find(m => m.cle === cle);
      if (bucket) bucket.ca += c.montant_ht || 0;
    });

    res.json({
      kpis: {
        apprenants_total: apprenantsTotal, apprenants_actifs: apprenantsActifs,
        sessions_total: sessionsTotal, sessions_realisees: sessionsRealisees,
        entreprises_total: (entreprises || []).length, entreprises_actives: entreprisesActives,
        ca_total_contrats_actifs: caTotalActifs,
      },
      ca_mensuel,
      niveaux_cecr,
      tranches_age,
      contrats: contrats || [],
      entreprises: entreprisesEnrichies,
    });
  } catch (err) {
    console.error("[elearning/reporting-executif]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTENUS - Supports pédagogiques créés par les coachs bet-elearning
// GET  /api/elearning/contenus?coach_id=X&classe_id=X
// POST /api/elearning/contenus
// PATCH /api/elearning/contenus/:id
// DELETE /api/elearning/contenus/:id
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/elearning/contenus/:id/lus - liste des apprenants qui ont marqué ce contenu comme lu
router.get("/contenus/:id/lus", authenticateAdmin, async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from("contenus_lus")
      .select("apprenant_id, lu_le")
      .eq("contenu_id", req.params.id)
      .order("lu_le", { ascending: false });
    if (error) throw error;

    if (!rows?.length) return res.json({ lus: [] });

    // Fetch apprenant details separately (no FK constraint on contenus_lus)
    const apprIds = [...new Set(rows.map(r => r.apprenant_id))];
    const { data: users } = await supabase
      .from("utilisateurs")
      .select("id, nom, prenom, email")
      .in("id", apprIds);
    const userMap = {};
    (users || []).forEach(u => { userMap[u.id] = u; });

    const lus = rows.map(r => ({
      apprenant_id: r.apprenant_id,
      lu_le:        r.lu_le,
      nom:          userMap[r.apprenant_id]?.nom    || "",
      prenom:       userMap[r.apprenant_id]?.prenom || "",
      email:        userMap[r.apprenant_id]?.email  || "",
    }));
    res.json({ lus });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── GET /api/elearning/contenus/:id/lecteurs ───────────────────────────────
   QUI A LU, ET SURTOUT QUI N'A PAS ENCORE OUVERT.
   `/contenus/:id/lus` ne rend que les lecteurs : un coach y voit trois noms sans
   savoir s'il manque deux apprenants ou vingt. C'est pourtant la seule question
   utile — relancer ceux qui n'ont pas ouvert. Même réponse que `/:id/lecteurs`
   côté dash (coursElearning.js), appliquée aux tables e-learning. */
router.get("/contenus/:id/lecteurs", authenticateAdmin, async (req, res) => {
  try {
    const { data: contenu } = await supabase
      .from("contenus_classes_elearning")
      .select("id, titre, classe_id, classe_ids")
      .eq("id", req.params.id)
      .maybeSingle();
    if (!contenu) return res.status(404).json({ error: "Contenu introuvable" });
    /* Toutes les classes visées, pas seulement la première : un contenu diffusé à
       trois classes n'est pas « lu par 4/8 » mais par 4 sur l'ensemble de ses
       destinataires, sinon le coach relance les mauvaises personnes. */
    const classesVisees = (contenu.classe_ids?.length ? contenu.classe_ids : [contenu.classe_id]).filter(Boolean);
    if (!classesVisees.length) {
      return res.json({ titre: contenu.titre, lecteurs: [], en_attente: [], total: 0, lus: 0 });
    }

    const [{ data: inscrits }, { data: lectures }, { data: classes }] = await Promise.all([
      supabase.from("classes_elearning_apprenants")
        .select("apprenant_id, nom_complet, email, classe_id")
        .in("classe_id", classesVisees)
        .eq("statut", "actif"),
      supabase.from("contenus_lus").select("apprenant_id, lu_le").eq("contenu_id", req.params.id),
      /* Le nom de la classe accompagne chaque apprenant : sur un contenu diffusé à
         plusieurs classes, « Awa n'a pas ouvert » ne dit pas laquelle relancer. */
      supabase.from("classes_elearning").select("id, nom").in("id", classesVisees),
    ]);
    const nomClasse = Object.fromEntries((classes || []).map(c => [c.id, c.nom]));

    const luPar = Object.fromEntries((lectures || []).map(l => [l.apprenant_id, l.lu_le]));
    const lecteurs = [], en_attente = [];
    for (const i of inscrits || []) {
      /* Un apprenant sans compte ouvert ne PEUT pas avoir lu : le ranger parmi ceux
         « en attente » serait exact mais trompeur — on le marque pour que le coach
         sache que c'est l'accès qui manque, pas la bonne volonté. */
      const fiche = {
        apprenant_id: i.apprenant_id || null,
        nom_complet:  i.nom_complet || "",
        email:        i.email || "",
        classe:       nomClasse[i.classe_id] || "",
        sans_compte:  !i.apprenant_id,
      };
      const le = i.apprenant_id ? luPar[i.apprenant_id] : null;
      if (le) lecteurs.push({ ...fiche, lu_le: le });
      else    en_attente.push(fiche);
    }
    lecteurs.sort((a, b) => String(b.lu_le).localeCompare(String(a.lu_le)));

    res.json({
      titre: contenu.titre,
      lecteurs,
      en_attente,
      total: (inscrits || []).length,
      lus:   lecteurs.length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/contenus", authenticateAdmin, async (req, res) => {
  try {
    const coachId  = req.query.coach_id || req.profil?.id;
    if (!coachId) return res.status(400).json({ error: "coach_id requis" });
    let q = supabase.from("contenus_classes_elearning").select("*").eq("coach_id", coachId).order("created_at", { ascending: true });
    /* `contains` et non `eq` : un contenu vise maintenant plusieurs classes, et
       `classe_id` ne porte plus que la première d'entre elles. Filtrer dessus
       masquerait un contenu diffusé à la classe demandée dès qu'une autre classe
       figure en tête de liste. */
    if (req.query.classe_id) q = q.contains("classe_ids", [req.query.classe_id]);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ contenus: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/contenus", authenticateAdmin, requirePermission("mediatheque", "create"), async (req, res) => {
  try {
    const coachId = req.profil?.id;
    if (!coachId) return res.status(401).json({ error: "Non authentifié" });
    const { titre, categorie, type_contenu, semaine, statut, est_visible, blocs, objectifs, duree_estimee, ordre, classe_id } = req.body;
    if (!titre) return res.status(400).json({ error: "Titre requis" });
    /* On accepte `classe_ids` (plusieurs destinataires) comme `classe_id` (un
       seul, ancien appelant) : un client pas encore déployé continue de créer
       ses contenus. `classe_id` reste alimentée avec la première de la liste —
       l'espace apprenant la lit encore directement. */
    const classeIds = Array.isArray(req.body.classe_ids)
      ? [...new Set(req.body.classe_ids.filter(Boolean))]
      : (classe_id ? [classe_id] : []);
    /* AU MOINS UNE CLASSE, brouillon compris. Un contenu sans destinataire
       n'apparaît dans aucune médiathèque — elle filtre par classe —, si bien que
       son auteur lui-même ne le retrouvait plus. Un contenu se rattache d'abord,
       se rédige ensuite. */
    if (!classeIds.length) {
      return res.status(400).json({ error: "Choisissez au moins une classe destinataire" });
    }
    const aInserer = {
      coach_id:      coachId,
      classe_id:     classeIds[0],
      classe_ids:    classeIds,
      titre,
      categorie:     categorie     || '',
      type_contenu:  type_contenu  || 'lecon',
      semaine:       semaine       || 1,
      lecture_sequentielle: req.body.lecture_sequentielle === true,
      /* UN CONTENU SANS BLOC RESTE BROUILLON, quoi qu'on demande. Publier une
         coquille vide notifie toute la classe d'un cours qui s'ouvre sur rien,
         et l'envoi n'est pas rattrapable. Même règle que côté dash. */
      statut:        (blocs || []).length ? (statut || 'brouillon') : 'brouillon',
      est_visible:   (blocs || []).length ? (est_visible ?? false)  : false,
      blocs:         blocs         || [],
      objectifs:     objectifs     || '',
      duree_estimee: duree_estimee || 30,
      ordre:         ordre         || 1,
    };
    let { data, error } = await supabase.from("contenus_classes_elearning").insert(aInserer).select().single();
    /* La colonne `lecture_sequentielle` est livrée par un SQL à part
       (Backend/sql/contenus_classes_elearning_lecture_sequentielle.sql). Tant qu'il n'est
       pas joué, on rejoue SANS elle plutôt que de faire échouer toute création de contenu
       pour un réglage facultatif — le coach ne comprendrait pas pourquoi son cours est
       refusé. */
    if (error && (error.code === "42703" || /lecture_sequentielle/.test(error.message || ""))) {
      const { lecture_sequentielle: _absent, ...sansColonne } = aInserer;
      ({ data, error } = await supabase.from("contenus_classes_elearning").insert(sansColonne).select().single());
    }
    if (error) throw error;
    res.status(201).json({ contenu: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/contenus/:id", authenticateAdmin, requirePermission("mediatheque", "update"), async (req, res) => {
  try {
    const coachId = req.profil?.id;
    const allowed = ["titre","categorie","type_contenu","semaine","statut","est_visible","blocs","objectifs","duree_estimee","ordre","lecture_sequentielle"];
    const payload = { updated_at: new Date().toISOString() };
    allowed.forEach(k => { if (req.body[k] !== undefined) payload[k] = req.body[k]; });
    /* Les destinataires se modifient par `classe_ids` ; `classe_id` suit avec la
       première de la liste, pour l'espace apprenant qui la lit encore. On refuse
       de vider la liste : un contenu sans classe disparaît de la médiathèque, qui
       filtre par classe, et son auteur ne le retrouve plus. */
    if (Array.isArray(req.body.classe_ids)) {
      const ids = [...new Set(req.body.classe_ids.filter(Boolean))];
      if (!ids.length) return res.status(400).json({ error: "Un contenu doit viser au moins une classe" });
      payload.classe_ids = ids;
      payload.classe_id  = ids[0];
    } else if (req.body.classe_id !== undefined) {
      if (!req.body.classe_id) return res.status(400).json({ error: "Un contenu doit viser au moins une classe" });
      payload.classe_ids = [req.body.classe_id];
      payload.classe_id  = req.body.classe_id;
    }
    /* L'état AVANT la mise à jour : la notification de publication ne doit partir qu'au
       PASSAGE en publié. Republier après une correction de virgule ne doit pas réalerter
       toute la classe — même règle que côté dash (coursElearning.js). */
    const { data: avant } = await supabase.from("contenus_classes_elearning")
      .select("est_visible, titre, classe_id, classe_ids, blocs").eq("id", req.params.id).maybeSingle();

    /* Même garde-fou qu'à la création : on ne publie pas un contenu vide. Les
       blocs peuvent venir de la requête (on les remplace) ou rester ceux déjà
       en base (on ne touche qu'au statut) — c'est le résultat qui compte. */
    const blocsApres = req.body.blocs !== undefined ? (req.body.blocs || []) : (avant?.blocs || []);
    if ((payload.est_visible === true || payload.statut === "publie") && !blocsApres.length) {
      return res.status(409).json({
        error: "Ce contenu n'a aucun bloc : il s'ouvrirait sur une page vide. Ajoutez au moins un bloc avant de publier.",
        code:  "CONTENU_VIDE",
      });
    }

    let { data, error } = await supabase.from("contenus_classes_elearning")
      .update(payload).eq("id", req.params.id).eq("coach_id", coachId).select().single();
    // Même repli qu'à la création tant que le SQL de lecture séquentielle n'est pas joué :
    // une modification de titre ne doit pas échouer à cause d'un réglage facultatif.
    if (error && (error.code === "42703" || /lecture_sequentielle/.test(error.message || ""))) {
      const { lecture_sequentielle: _absent, ...sansColonne } = payload;
      ({ data, error } = await supabase.from("contenus_classes_elearning")
        .update(sansColonne).eq("id", req.params.id).eq("coach_id", coachId).select().single());
    }
    if (error) throw error;
    res.json({ contenu: data });

    const classesVisees = (data.classe_ids?.length ? data.classe_ids : [data.classe_id]).filter(Boolean);
    if (!avant?.est_visible && data.est_visible && classesVisees.length) {
      /* ── PUBLIER UN COURS SE SAIT AU-DELÀ DE LA CLASSE ──
         Seuls les apprenants étaient prévenus. Or publier est l'acte par lequel le coach
         met un contenu en circulation : l'encadrement le suit — l'onboarding et
         l'assistante pour le démarrage des apprenants, le PA et la supervision pour
         l'activité pédagogique. Aucun d'eux ne le voyait, et personne ne savait si un
         coach alimentait réellement sa médiathèque.
         Résolu avant la boucle des apprenants pour que le nom des classes figure dans le
         message : « publié dans Anglais Moov A2 » se lit, un UUID non. */
      const { data: classesNommees } = await supabase
        .from("classes_elearning").select("nom").in("id", classesVisees);
      const libClasses = (classesNommees || []).map(c => c.nom).filter(Boolean).join(", ") || "sa classe";
      const notifEncadrement = {
        type:    "cours",
        titre:   `📚 Cours publié - ${data.titre}`,
        message: `Un coach vient de publier « ${data.titre} » dans ${libClasses}.`,
        meta:    { contenu_id: data.id, classe_ids: classesVisees },
      };
      await Promise.allSettled([
        notifyRole(["onboarding", "admin_onboarding"], notifEncadrement),
        /* Quatre noms pour l'assistante : AUCUN compte ne porte `assistant_elearning`,
           `ROLE_MAP_BET` y résout `commercial` et `corporate`. N'en citer qu'un
           écrirait une notification que personne ne recevrait. */
        notifyRole(["assistant_elearning", "commercial", "corporate", "admin_elearning"], notifEncadrement),
        notifyRole(["pedagogical_advisor", "admin_pa_advisor"], notifEncadrement),
        notifyRole(["superviseur", "admin_superviseur", "deputy_superviseur", "admin_deputy_superviseur"], notifEncadrement),
      ]).then(rs => rs.forEach((r, i) => {
        if (r.status === "rejected") console.error(`[contenu publie] notif encadrement ${i}:`, r.reason);
      }));

      /* Les apprenants de TOUTES les classes visées, prévenus dans leur espace. On
         notifie les COMPTES, pas les inscriptions : un apprenant sans accès ouvert
         n'a pas de cloche à remplir. `in` plutôt qu'une requête par classe — un
         apprenant inscrit dans deux classes visées ne doit recevoir qu'une
         notification, d'où le dédoublonnage qui suit. */
      const { data: inscrits } = await supabase
        .from("classes_elearning_apprenants")
        .select("apprenant_id")
        .in("classe_id", classesVisees)
        .eq("statut", "actif");
      const ids = [...new Set((inscrits || []).map(i => i.apprenant_id).filter(Boolean))];
      if (ids.length) {
        await supabase.from("notifications").insert(ids.map(id => ({
          user_id: id,
          type:    "cours",
          titre:   `📚 Nouveau contenu : ${data.titre}`,
          message: `Votre coach a publié « ${data.titre} ». Retrouvez-le dans Mes cours.`,
          meta:    { contenu_id: data.id, classe_id: data.classe_id, classe_ids: classesVisees },
          source:  "bet-elearning",
          lu:      false,
        }))).then(({ error: e }) => { if (e) console.error("[contenu publie] notifs:", e.message); });
      }

      // L'e-mail ne part que si le coach l'a demandé, et une seule fois par contenu :
      // le service refuse tout second envoi, quel que soit le nombre de republications.
      if (req.body.envoyer_email) {
        envoyerEmailPublication({
          ressourceType: "contenu",
          ressourceId:   data.id,
          titre:         `📚 Nouveau contenu : ${data.titre}`,
          message:       `Votre coach a publié « ${data.titre} ». Retrouvez-le dès maintenant dans votre espace.`,
          groupeIds:     classesVisees,
          acteurId:      coachId,
        }).catch(e => console.error("[contenu publie] email:", e.message));
      }
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/contenus/:id", authenticateAdmin, requirePermission("mediatheque", "delete"), async (req, res) => {
  try {
    const coachId = req.profil?.id;
    const { error } = await supabase.from("contenus_classes_elearning")
      .delete().eq("id", req.params.id).eq("coach_id", coachId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// FICHIERS CLASSES E-LEARNING
// GET  /api/elearning/fichiers?coach_id=X&classe_id=X
// POST /api/elearning/fichiers
// PATCH /api/elearning/fichiers/:id
// DELETE /api/elearning/fichiers/:id
// ─────────────────────────────────────────────────────────────────────────────

router.get("/fichiers", authenticateAdmin, async (req, res) => {
  try {
    const coachId = req.query.coach_id || req.profil?.id;
    if (!coachId) return res.status(400).json({ error: "coach_id requis" });
    let q = supabase.from("fichiers_classes_elearning").select("*").eq("coach_id", coachId).order("created_at", { ascending: false });
    if (req.query.classe_id) q = q.eq("classe_id", req.query.classe_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ fichiers: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/fichiers", authenticateAdmin, requirePermission("fichiers_partages", "create"), async (req, res) => {
  try {
    const coachId = req.profil?.id;
    if (!coachId) return res.status(401).json({ error: "Non authentifié" });
    const { classe_id, nom, url, public_id, categorie, taille_ko, visible } = req.body;
    if (!classe_id || !nom || !url) return res.status(400).json({ error: "classe_id, nom et url requis" });
    const { data, error } = await supabase.from("fichiers_classes_elearning").insert({
      coach_id:  coachId,
      classe_id, nom, url,
      public_id: public_id || null,
      categorie: categorie || 'autre',
      taille_ko: taille_ko || null,
      visible:   visible ?? true,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ fichier: data });

    /* ── PARTAGER UN FICHIER NE PRÉVENAIT PERSONNE ──
       Le coach déposait un support et attendait que ses apprenants le trouvent par
       eux-mêmes, en passant par l'onglet Ressources. Un document arrivé entre deux séances
       restait donc invisible jusqu'à ce que quelqu'un pense à aller voir.
       On ne notifie QUE si le fichier est visible : un dépôt masqué est un brouillon, et
       annoncer un document que personne ne peut ouvrir est pire que de se taire.
       Après la réponse : le partage ne doit ni échouer ni attendre pour une notification. */
    if (data.visible) {
      notifierPartageFichier(data, coachId).catch(e => console.error("[fichiers] notifs:", e.message));
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * Qui prévenir quand un support devient accessible à une classe.
 *
 * Les apprenants d'abord — c'est pour eux. Puis l'encadrement, qui suit ce que le coach
 * met à disposition : l'assistante et l'onboarding pour le démarrage, le PA et la
 * supervision pour l'activité pédagogique. Mêmes destinataires que la publication d'un
 * cours, parce que c'est le même geste : mettre une ressource en circulation.
 */
async function notifierPartageFichier(fichier, coachId) {
  const { data: classe } = await supabase
    .from("classes_elearning").select("nom, entreprise_nom").eq("id", fichier.classe_id).maybeSingle();
  const nomClasse = classe?.nom || "votre classe";

  await notifierApprenantsClasse(fichier.classe_id, {
    type:    "ressource",
    titre:   "📎 Nouveau document partagé",
    message: `Votre coach a partagé « ${fichier.nom} » dans ${nomClasse}. Retrouvez-le dans vos ressources.`,
    meta:    { fichier_id: fichier.id, classe_id: fichier.classe_id },
  });

  const notif = {
    type:    "ressource",
    titre:   `📎 Document partagé - ${nomClasse}`,
    message: `Un coach a partagé « ${fichier.nom} » dans ${nomClasse}`
           + `${classe?.entreprise_nom ? ` - ${classe.entreprise_nom}` : ""}.`,
    meta:    { fichier_id: fichier.id, classe_id: fichier.classe_id, coach_id: coachId },
  };
  await Promise.allSettled([
    notifyRole(["onboarding", "admin_onboarding"], notif),
    /* Quatre noms pour l'assistante : aucun compte ne porte `assistant_elearning`,
       `ROLE_MAP_BET` y résout `commercial` et `corporate`. */
    notifyRole(["assistant_elearning", "commercial", "corporate", "admin_elearning"], notif),
    notifyRole(["pedagogical_advisor", "admin_pa_advisor"], notif),
    notifyRole(["superviseur", "admin_superviseur", "deputy_superviseur", "admin_deputy_superviseur"], notif),
  ]).then(rs => rs.forEach((r, i) => {
    if (r.status === "rejected") console.error(`[fichiers] notif encadrement ${i}:`, r.reason);
  }));
}

router.patch("/fichiers/:id", authenticateAdmin, requirePermission("fichiers_partages", "update"), async (req, res) => {
  try {
    const coachId = req.profil?.id;
    const payload = {};
    if (req.body.visible !== undefined) payload.visible   = req.body.visible;
    if (req.body.nom     !== undefined) payload.nom       = req.body.nom;
    if (req.body.categorie !== undefined) payload.categorie = req.body.categorie;
    /* L'état AVANT : on ne notifie qu'au PASSAGE de masqué à visible. Un fichier déjà
       visible qu'on renomme ne doit pas réalerter toute la classe — c'est la même règle
       que pour la publication d'un cours. */
    const { data: avant } = await supabase.from("fichiers_classes_elearning")
      .select("visible").eq("id", req.params.id).maybeSingle();

    const { data, error } = await supabase.from("fichiers_classes_elearning")
      .update(payload).eq("id", req.params.id).eq("coach_id", coachId).select().single();
    if (error) throw error;
    res.json({ fichier: data });

    if (!avant?.visible && data.visible) {
      notifierPartageFichier(data, coachId).catch(e => console.error("[fichiers PATCH] notifs:", e.message));
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/fichiers/:id", authenticateAdmin, requirePermission("fichiers_partages", "delete"), async (req, res) => {
  try {
    const coachId = req.profil?.id;
    const { error } = await supabase.from("fichiers_classes_elearning")
      .delete().eq("id", req.params.id).eq("coach_id", coachId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// DEVOIRS E-LEARNING
// ─────────────────────────────────────────────────────────────────────────────

// Helper : calcule si un devoir est ouvert / deadline dépassée
function devoirOuvert(d) {
  if (!d.date_ouverture) return true;
  const hOuv = (d.heure_ouverture || '00:00').slice(0, 5);
  const ouv  = new Date(`${d.date_ouverture}T${hOuv}:00`);
  return new Date() >= ouv;
}
function devoirExpire(d) {
  if (!d.date_limite) return false;
  const hLim = (d.heure_limite || '23:59').slice(0, 5);
  const lim  = new Date(`${d.date_limite}T${hLim}:00`);
  return new Date() > lim;
}

// Notifie tous les apprenants d'une classe (présents ou non, seuls les suspendus sont exclus).
// ⚠️ Ne PAS utiliser notifyRole(['apprenant'], ...) ici : le rôle "apprenant" est partagé avec
// dash en base - cibler classes_elearning_apprenants garantit qu'on ne notifie que les vrais
// comptes apprenants de la classe concernée sur bet-elearning, jamais ceux de dash.
/**
 * Ce que l'apprenant doit lire quand un devoir est publié.
 *
 * Le message annonçait « à rendre pour le … » même sur un devoir PROGRAMMÉ, dont la date
 * d'ouverture est dans le futur : l'apprenant allait l'ouvrir, trouvait porte close, et
 * n'avait aucun moyen de savoir si c'était une panne ou une attente. On dit quand il
 * s'ouvre, et seulement ensuite quand il se rend.
 */
function messageDevoirApprenant(d) {
  const jour = (v) => new Date(v).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const ouvreePlusTard = d.date_ouverture && new Date(`${d.date_ouverture}T${(d.heure_ouverture || "00:00").slice(0, 5)}:00`) > new Date();
  const limite = d.date_limite ? ` À rendre pour le ${jour(d.date_limite)}.` : "";
  return ouvreePlusTard
    ? `"${d.titre}" a été programmé par votre coach. Il s'ouvrira le ${jour(d.date_ouverture)} à ${(d.heure_ouverture || "00:00").slice(0, 5)}.${limite}`
    : `"${d.titre}" a été publié par votre coach.${limite || " À rendre prochainement."}`;
}

async function notifierApprenantsClasse(classeId, { type = "info", titre, message, meta }) {
  try {
    const { data: apprenants, error } = await supabase
      .from("classes_elearning_apprenants")
      .select("apprenant_id")
      .eq("classe_id", classeId)
      .not("apprenant_id", "is", null)
      .neq("statut", "suspendu");
    if (error) { console.error("[notifierApprenantsClasse]", error.message); return; }
    const ids = [...new Set((apprenants || []).map(a => a.apprenant_id))];
    if (!ids.length) return;
    await supabase.from("notifications").insert(
      ids.map(user_id => ({ user_id, type, titre, message, meta, source: "bet-elearning", lu: false }))
    );
  } catch (err) {
    console.error("[notifierApprenantsClasse]", err.message);
  }
}

// ── GET /api/elearning/devoirs?classe_id=&statut=publie ──────────────────────
router.get("/devoirs", authenticateAdmin, async (req, res) => {
  try {
    const { classe_id, statut } = req.query;
    let q = supabase.from("devoirs_elearning").select("*").order("created_at", { ascending: false });
    if (classe_id) q = q.eq("classe_id", classe_id);
    if (statut)    q = q.eq("statut", statut);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ devoirs: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/elearning/devoirs/:id ──────────────────────────────────────────
router.get("/devoirs/:id", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from("devoirs_elearning")
      .select("*").eq("id", req.params.id).single();
    if (error) throw error;
    res.json({ devoir: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/elearning/devoirs ──────────────────────────────────────────────
router.post("/devoirs", authenticateAdmin, requirePermission("devoirs_evaluations", "create"), async (req, res) => {
  try {
    const coachId = req.profil?.id;
    const {
      classe_id, contenu_id, titre, instructions, format_type, type_rendu, categorie, blocs,
      ressource_url, questions, date_ouverture, heure_ouverture,
      date_limite, heure_limite, statut,
    } = req.body;
    if (!classe_id || !titre) return res.status(400).json({ error: "classe_id et titre requis" });
    const payload = {
      coach_id: coachId, classe_id, titre,
      contenu_id:     contenu_id     || null,
      instructions:   instructions   || "",
      format_type:    format_type    || "texte_libre",
      type_rendu:     type_rendu     || "texte",
      ressource_url:  ressource_url  || "",
      questions:      questions      || [],
      // "categorie" (devoir/exercice/evaluation) sert au bonus de gamification réservé aux
      // devoirs ; "blocs" porte le contenu quand format_type==="mixte" (QCM/Listening/
      // Audio/Quiz/Speaking combinés).
      categorie:      categorie      || "devoir",
      blocs:          Array.isArray(blocs) ? blocs : [],
      date_ouverture: date_ouverture || null,
      heure_ouverture:heure_ouverture|| "00:00",
      date_limite:    date_limite    || null,
      heure_limite:   heure_limite   || "23:59",
      statut:         statut         || "brouillon",
    };
    const { data, error } = await supabase.from("devoirs_elearning").insert(payload).select().single();
    if (error) throw error;

    // Notifier onboarding + admin_elearning si le devoir est directement publié
    if (data?.statut === "publie") {
      const { data: classe } = await supabase.from("classes_elearning").select("nom").eq("id", data.classe_id).maybeSingle();
      const msg = `📝 Nouveau devoir publié par le coach dans la classe ${classe?.nom || data.classe_id} : "${data.titre}"`;
      const notif = { type: "devoir", titre: "📝 Nouveau devoir publié", message: msg, meta: { devoir_id: data.id, classe_id: data.classe_id } };
      await Promise.all([
        notifyRole(["onboarding", "admin_onboarding"], notif),
        /* Quatre noms pour l'assistante : aucun compte ne porte `assistant_elearning`,
           `ROLE_MAP_BET` y résout `commercial` et `corporate`. N'en citer qu'un écrivait
           une notification que personne ne recevait. */
        notifyRole(["assistant_elearning", "commercial", "corporate", "admin_elearning"], notif),
        /* LE PA MANQUAIT. Il reçoit la publication d'un cours mais pas celle d'un devoir,
           alors que les deux relèvent du même suivi pédagogique. */
        notifyRole(["pedagogical_advisor", "admin_pa_advisor"], notif),
        /* La supervision reçoit ce que le coach met réellement en circulation. Un devoir
           resté en brouillon ne la concerne pas : il n'est encore demandé à personne.
           Les quatre noms de rôle sont nécessaires — les rôles réels et les façades
           portées côté bet-elearning ; n'en citer qu'une moitié laisse l'autre moitié des
           comptes muette. */
        notifyRole(["superviseur", "admin_superviseur", "deputy_superviseur", "admin_deputy_superviseur"], notif),
        notifierApprenantsClasse(data.classe_id, {
          type:    "devoir",
          titre:   data.date_ouverture && new Date(`${data.date_ouverture}T${(data.heure_ouverture || "00:00").slice(0, 5)}:00`) > new Date()
            ? "🗓 Devoir programmé" : "📝 Nouveau devoir",
          message: messageDevoirApprenant(data),
          meta:    { devoir_id: data.id, classe_id: data.classe_id },
        }),
      ]);
    }

    res.status(201).json({ devoir: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /api/elearning/devoirs/:id ────────────────────────────────────────
router.patch("/devoirs/:id", authenticateAdmin, requirePermission("devoirs_evaluations", "update"), async (req, res) => {
  try {
    const coachId  = req.profil?.id;
    const devoirId = req.params.id;

    // Dépublication ET toute modification de contenu bloquées si au moins un apprenant a
    // déjà rendu - sinon on fausse un devoir déjà rendu (questions/consignes changées après
    // coup). Avant, seule la dépublication était bloquée.
    const CONTENT_FIELDS = ["titre","instructions","format_type","type_rendu","ressource_url","questions","blocs","categorie",
                            "date_ouverture","heure_ouverture","date_limite","heure_limite","contenu_id","classe_id"];
    const touchesContent = CONTENT_FIELDS.some(k => req.body[k] !== undefined);
    const touchesDepublication = req.body.statut === "brouillon";
    if (touchesContent || touchesDepublication) {
      const { data: rendusReels } = await supabase
        .from("devoirs_rendus_elearning")
        .select("id, statut")
        .eq("devoir_id", devoirId)
        .in("statut", ["rendu", "corrige"]);

      if (rendusReels && rendusReels.length > 0) {
        const action = touchesDepublication ? "dépublier" : "modifier";
        return res.status(409).json({
          error: `Impossible de ${action} : ${rendusReels.length} apprenant(s) ont déjà rendu ce devoir. Créez plutôt un nouveau devoir.`,
        });
      }
    }

    if (touchesDepublication) {
      // Supprimer les lignes auto-générées (note 0 attribuée automatiquement)
      await supabase
        .from("devoirs_rendus_elearning")
        .delete()
        .eq("devoir_id", devoirId)
        .eq("commentaire_coach", "Non rendu - note 0 attribuée automatiquement");
    }

    // Statut avant modif - pour ne notifier qu'au moment où le devoir passe RÉELLEMENT en
    // "publie" (et pas à chaque simple édition d'un devoir déjà publié).
    let etaitPublie = false;
    if (req.body.statut === "publie") {
      const { data: avant } = await supabase.from("devoirs_elearning").select("statut").eq("id", devoirId).maybeSingle();
      etaitPublie = avant?.statut === "publie";
    }

    const allowed = ["titre","instructions","format_type","type_rendu","ressource_url","questions","blocs","categorie",
                     "date_ouverture","heure_ouverture","date_limite","heure_limite","statut","contenu_id","classe_id"];
    const payload = { updated_at: new Date().toISOString() };
    allowed.forEach(k => { if (req.body[k] !== undefined) payload[k] = req.body[k]; });
    const { data, error } = await supabase.from("devoirs_elearning")
      .update(payload).eq("id", devoirId).eq("coach_id", coachId).select().single();
    if (error) throw error;

    // Notifier onboarding + admin_elearning + les apprenants de la classe quand le devoir
    // passe à "publie" pour la première fois.
    if (payload.statut === "publie" && !etaitPublie) {
      const { data: classe } = await supabase.from("classes_elearning").select("nom").eq("id", data.classe_id).maybeSingle();
      const msg = `📝 Devoir publié par le coach dans la classe ${classe?.nom || data.classe_id} : "${data.titre}"`;
      const notif = { type: "devoir", titre: "📝 Devoir publié", message: msg, meta: { devoir_id: data.id, classe_id: data.classe_id } };
      await Promise.all([
        notifyRole(["onboarding", "admin_onboarding"], notif),
        /* Quatre noms pour l'assistante : aucun compte ne porte `assistant_elearning`,
           `ROLE_MAP_BET` y résout `commercial` et `corporate`. N'en citer qu'un écrivait
           une notification que personne ne recevait. */
        notifyRole(["assistant_elearning", "commercial", "corporate", "admin_elearning"], notif),
        /* LE PA MANQUAIT. Il reçoit la publication d'un cours mais pas celle d'un devoir,
           alors que les deux relèvent du même suivi pédagogique. */
        notifyRole(["pedagogical_advisor", "admin_pa_advisor"], notif),
        /* La supervision reçoit ce que le coach met réellement en circulation. Un devoir
           resté en brouillon ne la concerne pas : il n'est encore demandé à personne.
           Les quatre noms de rôle sont nécessaires — les rôles réels et les façades
           portées côté bet-elearning ; n'en citer qu'une moitié laisse l'autre moitié des
           comptes muette. */
        notifyRole(["superviseur", "admin_superviseur", "deputy_superviseur", "admin_deputy_superviseur"], notif),
        notifierApprenantsClasse(data.classe_id, {
          type:    "devoir",
          titre:   data.date_ouverture && new Date(`${data.date_ouverture}T${(data.heure_ouverture || "00:00").slice(0, 5)}:00`) > new Date()
            ? "🗓 Devoir programmé" : "📝 Nouveau devoir",
          message: messageDevoirApprenant(data),
          meta:    { devoir_id: data.id, classe_id: data.classe_id },
        }),
      ]);
    }

    res.json({ devoir: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/elearning/devoirs/:id ───────────────────────────────────────
router.delete("/devoirs/:id", authenticateAdmin, requirePermission("devoirs_evaluations", "delete"), async (req, res) => {
  try {
    const devoirId = req.params.id;
    const coachId  = req.profil?.id;

    // Bloquer si des apprenants ont déjà rendu ou été corrigés
    const { data: rendusReels } = await supabase
      .from("devoirs_rendus_elearning")
      .select("id, statut")
      .eq("devoir_id", devoirId)
      .in("statut", ["rendu", "corrige"]);

    if (rendusReels && rendusReels.length > 0) {
      return res.status(409).json({
        error: `Impossible de supprimer : ${rendusReels.length} apprenant${rendusReels.length > 1 ? "s ont" : " a"} déjà rendu ce devoir. Dépubliez-le d'abord si nécessaire.`,
      });
    }

    // Supprimer les lignes auto-générées (note 0) avant la suppression principale
    await supabase.from("devoirs_rendus_elearning")
      .delete().eq("devoir_id", devoirId);

    const { error } = await supabase.from("devoirs_elearning")
      .delete().eq("id", devoirId).eq("coach_id", coachId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/elearning/devoirs/:id/rendus - coach voit tous les rendus ───────
router.get("/devoirs/:id/rendus", authenticateAdmin, async (req, res) => {
  try {
    const devoirId = req.params.id;

    // 1. Récupérer le devoir et sa classe
    const { data: devoir, error: dErr } = await supabase
      .from("devoirs_elearning").select("*").eq("id", devoirId).single();
    if (dErr || !devoir) return res.status(404).json({ error: "Devoir introuvable" });

    const expire = devoirExpire(devoir);

    // 2. Tous les apprenants actifs de la classe
    const { data: inscriptions } = await supabase
      .from("classes_elearning_apprenants")
      .select("id, nom_complet, statut, email")
      .eq("classe_id", devoir.classe_id)
      .neq("statut", "suspendu");

    // 3. Rendus existants pour ce devoir
    const { data: rendusExist } = await supabase
      .from("devoirs_rendus_elearning")
      .select("*")
      .eq("devoir_id", devoirId);

    const rendusMap = {};
    (rendusExist || []).forEach(r => { rendusMap[r.inscription_id] = r; });

    // 4. Pour les apprenants sans rendu et deadline dépassée → upsert note 0
    const absents = (inscriptions || []).filter(i => !rendusMap[i.id] && expire);
    if (absents.length > 0) {
      const lignesAbsents = absents.map(i => ({
        devoir_id:      devoirId,
        inscription_id: i.id,
        classe_id:      devoir.classe_id,
        statut:         "en_retard",
        note:           0,
        note_max:       20,
        commentaire_coach: "Non rendu - note 0 attribuée automatiquement",
        corrige_at:     new Date().toISOString(),
      }));
      const { data: created } = await supabase
        .from("devoirs_rendus_elearning")
        .upsert(lignesAbsents, { onConflict: "devoir_id,inscription_id" })
        .select();
      (created || []).forEach(r => { rendusMap[r.inscription_id] = r; });
    }

    // 5. Construire la liste complète (tous les apprenants, rendu ou non)
    const rendus = (inscriptions || []).map(i => {
      const r = rendusMap[i.id];
      if (r) {
        // Marquer en_retard si soumission tardive encore en a_rendre
        const statut = (expire && r.statut === "a_rendre") ? "en_retard" : r.statut;
        return { ...r, statut, apprenant: { nom_complet: i.nom_complet, statut: i.statut, email: i.email } };
      }
      // Apprenant sans rendu, deadline pas encore dépassée
      return {
        id:             null,
        devoir_id:      devoirId,
        inscription_id: i.id,
        classe_id:      devoir.classe_id,
        statut:         "a_rendre",
        note:           null,
        commentaire_coach: null,
        rendu_at:       null,
        fichier_url:    null,
        contenu_texte:  null,
        apprenant:      { nom_complet: i.nom_complet, statut: i.statut, email: i.email },
      };
    });

    res.json({ rendus });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/elearning/devoirs/:id/rendre - apprenant soumet ───────────────
// Accepte JSON (texte/QCM) OU multipart/form-data (fichier → Cloudinary)
// ── POST /api/elearning/upload-audio-speaking - enregistrement micro pour un bloc Speaking ──
router.post("/upload-audio-speaking", authenticateApprenant, (req, res) => {
  uploadDevoir.single("audio")(req, res, async (multerErr) => {
    if (multerErr) return res.status(400).json({ error: multerErr.message });
    try {
      if (!req.file) return res.status(400).json({ error: "Aucun fichier audio reçu" });
      const pubId = `speaking_${req.user.id}_${Date.now()}`;
      const url = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "bet/devoirs-rendus/speaking", resource_type: "video", public_id: pubId },
          (error, result) => error ? reject(error) : resolve(result.secure_url)
        );
        stream.end(req.file.buffer);
      });
      res.json({ url });
    } catch (err) {
      res.status(500).json({ error: err.message || "Erreur upload audio" });
    }
  });
});

router.post("/devoirs/:id/rendre", authenticateApprenant, (req, res) => {
  uploadDevoir.single("fichier")(req, res, async (multerErr) => {
    if (multerErr) return res.status(400).json({ error: multerErr.message });
    try {
      const { data: devoir, error: dErr } = await supabase.from("devoirs_elearning")
        .select("*").eq("id", req.params.id).single();
      if (dErr || !devoir) return res.status(404).json({ error: "Devoir introuvable" });
      if (devoir.statut !== "publie") return res.status(403).json({ error: "Devoir non publié" });
      if (!devoirOuvert(devoir))  return res.status(403).json({ error: "Devoir pas encore ouvert" });
      if (devoirExpire(devoir))   return res.status(403).json({ error: "Date limite dépassée" });

      const body = req.body || {};
      const { inscription_id, type_soumission, contenu_texte } = body;
      if (!inscription_id) return res.status(400).json({ error: "inscription_id requis" });

      // reponses_qcm peut arriver comme string JSON via FormData
      let reponses_qcm = {};
      if (body.reponses_qcm) {
        reponses_qcm = typeof body.reponses_qcm === "string"
          ? JSON.parse(body.reponses_qcm)
          : body.reponses_qcm;
      }

      // reponses_blocs - soumission "mixte" (plusieurs blocs QCM/Listening/Audio/Quiz/
      // Speaking dans un même devoir) : { [bloc_id]: { "0": "optionA", ..., texte, audioUrl } }
      let reponses_blocs = {};
      if (body.reponses_blocs) {
        reponses_blocs = typeof body.reponses_blocs === "string"
          ? JSON.parse(body.reponses_blocs)
          : body.reponses_blocs;
      }

      // Upload fichier sur Cloudinary si présent
      let fichier_url = null;
      let fichier_nom = null;
      if (req.file) {
        const ext     = req.file.originalname.split(".").pop().toLowerCase();
        const isVideo = ["mp3","mp4","mov","avi","mkv","wav","ogg"].includes(ext);
        const isImage = ["jpg","jpeg","png","gif","webp","bmp","svg"].includes(ext);
        // PDFs et docs → raw pour téléchargement direct sans conversion
        const resType = isVideo ? "video" : isImage ? "image" : "raw";
        // public_id sans préfixe de dossier (folder l'ajoute automatiquement) + extension pour téléchargement correct
        const pubId   = `${req.params.id}_${inscription_id}_${Date.now()}.${ext}`;
        await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "bet/devoirs-rendus", resource_type: resType, public_id: pubId },
            (error, result) => {
              if (error) reject(error);
              else { fichier_url = result.secure_url; fichier_nom = req.file.originalname; resolve(); }
            }
          );
          stream.end(req.file.buffer);
        });
      }

      // Calcul note automatique si QCM (format unique) - inchangé, rétrocompatible
      let noteAuto = null;
      if ((devoir.format_type === "qcm" || devoir.format_type === "quiz")
          && Object.keys(reponses_qcm).length > 0 && Array.isArray(devoir.questions)) {
        const questions = devoir.questions;
        const bonnes = questions.filter((q, i) => reponses_qcm[String(i)] === q.correct).length;
        noteAuto = questions.length > 0 ? Math.round((bonnes / questions.length) * 20 * 10) / 10 : null;
      }

      // Calcul note automatique si "mixte" (blocs) - cumule les bonnes réponses de TOUS les
      // blocs à questions (qcm/listening/audio/quiz), sur le total de questions de ces blocs ;
      // les blocs "speaking" (pas de bonne réponse type) sont ignorés du calcul automatique.
      const blocsDevoir = Array.isArray(devoir.blocs) ? devoir.blocs : [];
      if (devoir.format_type === "mixte" && blocsDevoir.length > 0) {
        const blocsNotables = blocsDevoir.filter(b => ["qcm","listening","audio","quiz"].includes(b.type) && (b.questions||[]).length > 0);
        const totalQuestions = blocsNotables.reduce((s, b) => s + b.questions.length, 0);
        if (totalQuestions > 0 && Object.keys(reponses_blocs).length > 0) {
          const bonnes = blocsNotables.reduce((s, b) => {
            const rep = reponses_blocs[b.id] || {};
            return s + b.questions.filter((q, i) => rep[String(i)] === q.correct).length;
          }, 0);
          noteAuto = Math.round((bonnes / totalQuestions) * 20 * 10) / 10;
        }
      }

      const payload = {
        devoir_id:       req.params.id,
        inscription_id,
        classe_id:       devoir.classe_id,
        type_soumission: type_soumission || (req.file ? "fichier" : "texte"),
        contenu_texte:   contenu_texte   || null,
        reponses_qcm,
        reponses_blocs,
        fichier_url,
        fichier_nom,
        statut:          "rendu",
        rendu_at:        new Date().toISOString(),
        note:            noteAuto,
      };

      /* ── UN DEVOIR CORRIGÉ NE SE RÉÉCRIT PLUS ──
         L'`upsert` ci-dessous ÉCRASE le rendu précédent : c'est voulu, l'apprenant doit
         pouvoir revenir sur sa copie tant qu'elle n'a pas été vue. Mais rien ne vérifiait
         l'état de ce rendu, si bien qu'une re-soumission après correction remplaçait la
         copie ET la note déjà donnée par le coach, sans trace ni message.
         Même garde que côté dash (apprenants.js, POST /evaluations/:evalId/soumettre),
         où la règle est annoncée à l'apprenant au moment où il rend : « vous pourrez
         encore la modifier tant que votre coach ne l'a pas corrigée ». */
      const { data: rendüExistant } = await supabase
        .from("devoirs_rendus_elearning")
        .select("statut, note")
        .eq("devoir_id", req.params.id)
        .eq("inscription_id", inscription_id)
        .maybeSingle();

      if (rendüExistant?.statut === "corrige") {
        return res.status(403).json({
          error: "Ce devoir a déjà été corrigé par votre coach - vous ne pouvez plus le modifier.",
          code:  "DEJA_CORRIGE",
        });
      }

      const { data, error } = await supabase.from("devoirs_rendus_elearning")
        .upsert(payload, { onConflict: "devoir_id,inscription_id" }).select().single();
      if (error) throw error;

      if (noteAuto !== null) {
        await supabase.from("resultats_elearning").insert({
          inscription_id,
          classe_id:         devoir.classe_id,
          type:              "controle",
          titre:             devoir.titre,
          note:              noteAuto,
          note_max:          20,
          commentaire_coach: "Corrigé automatiquement (QCM)",
          date_evaluation:   new Date().toISOString().slice(0, 10),
        }).select();
      }

      // Gamification : le contrôle d'ouverture/expiration plus haut garantit qu'on est
      // forcément "à temps" ici - la soumission a été rejetée avant si la deadline était dépassée.
      await attribuerPoints(req.user.id, "devoir", req.params.id, 15, `Devoir rendu à temps - ${devoir.titre}`);

      // Notifier le coach de la classe - jusqu'ici il fallait aller vérifier manuellement,
      // aucune alerte n'était envoyée à la soumission d'un devoir.
      (async () => {
        try {
          const { data: classe } = await supabase.from("classes_elearning")
            .select("coach_id, nom").eq("id", devoir.classe_id).maybeSingle();
          if (!classe?.coach_id) return;
          const { data: inscription } = await supabase.from("classes_elearning_apprenants")
            .select("nom_complet").eq("id", inscription_id).maybeSingle();
          await supabase.from("notifications").insert({
            user_id: classe.coach_id,
            type:    "devoir_rendu",
            titre:   "📝 Devoir rendu",
            message: `${inscription?.nom_complet || "Un apprenant"} a rendu le devoir "${devoir.titre}" (${classe.nom || "classe"}).`,
            meta:    { devoir_id: req.params.id, inscription_id, classe_id: devoir.classe_id },
            source:  "bet-elearning",
            lu:      false,
          });
        } catch (e) { console.error("[notif coach devoir rendu]", e.message); }
      })();

      res.status(201).json({ rendu: data });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
});

// ── PATCH /api/elearning/devoirs/:devoirId/rendus/:renduId - coach corrige ────
// renduId peut être "new" si l'apprenant n'a jamais rendu (non rendu = 0)
router.patch("/devoirs/:devoirId/rendus/:renduId", authenticateAdmin, async (req, res) => {
  try {
    if (!req.body) return res.status(400).json({ error: "Corps de requête manquant" });
    const { note, note_max, commentaire_coach, inscription_id } = req.body;
    const coachId  = req.profil?.id;
    const devoirId = req.params.devoirId;

    const payload = {
      statut:            "corrige",
      note:              note      ?? 0,
      note_max:          note_max  ?? 20,
      commentaire_coach: commentaire_coach || "",
      corrige_par:       coachId,
      corrige_at:        new Date().toISOString(),
    };

    let data, error;

    if (req.params.renduId === "new") {
      // Apprenant n'a jamais soumis → upsert
      const { data: devoir } = await supabase.from("devoirs_elearning")
        .select("classe_id").eq("id", devoirId).single();
      const res2 = await supabase.from("devoirs_rendus_elearning")
        .upsert({
          devoir_id:      devoirId,
          inscription_id: inscription_id,
          classe_id:      devoir?.classe_id,
          type_soumission:"texte",
          ...payload,
        }, { onConflict: "devoir_id,inscription_id" })
        .select("*, apprenant:classes_elearning_apprenants(nom_complet)")
        .single();
      data  = res2.data;
      error = res2.error;
    } else {
      const res2 = await supabase.from("devoirs_rendus_elearning")
        .update(payload).eq("id", req.params.renduId)
        .select("*, apprenant:classes_elearning_apprenants(nom_complet)").single();
      data  = res2.data;
      error = res2.error;
    }

    if (error) throw error;

    // Récupère le devoir pour avoir classe_id, titre et categorie (bonus gamification
    // réservé aux vrais "devoir", pas aux exercices/évaluations).
    const { data: devoirInfo } = await supabase.from("devoirs_elearning")
      .select("classe_id,titre,categorie").eq("id", req.params.devoirId).single();

    // Insérer / mettre à jour dans resultats_elearning
    if (note != null) {
      const devoir = devoirInfo;
      if (devoir) {
        await supabase.from("resultats_elearning").upsert({
          inscription_id:   data.inscription_id,
          classe_id:        devoir.classe_id,
          type:             "controle",
          titre:            devoir.titre,
          note:             note,
          note_max:         note_max ?? 20,
          commentaire_coach: commentaire_coach || "",
          evalue_par:       coachId,
          date_evaluation:  new Date().toISOString().slice(0, 10),
        }, { onConflict: "inscription_id,titre" }).select();
      }
    }

    // Gamification : bonus qualité si note ≥ 80% - seulement pour un vrai devoir rendu
    // (pas le cas "jamais soumis, noté 0 automatiquement"). Le badge "Grand progrès" est
    // évalué à chaque correction notée, indépendamment du seuil de 80%.
    if (note != null && data?.rendu_at && data?.inscription_id) {
      const noteMaxEffectif = note_max ?? 20;
      const { data: inscr } = await supabase.from("classes_elearning_apprenants").select("apprenant_id").eq("id", data.inscription_id).maybeSingle();
      if (inscr?.apprenant_id) {
        const estUnVraiDevoir = (devoirInfo?.categorie || "devoir") === "devoir";
        if (estUnVraiDevoir && noteMaxEffectif > 0 && note / noteMaxEffectif >= 0.8) {
          await attribuerPoints(inscr.apprenant_id, "devoir_bonus", devoirId, 10, "Devoir noté ≥ 80 %", { note, noteMax: noteMaxEffectif });
        }
        verifierBadges(inscr.apprenant_id, "devoir_correction").catch(() => {});
      }
    }

    res.json({ rendu: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/elearning/notes?classe_id=&inscription_id= ─────────────────────
router.get("/notes", authenticateAdmin, async (req, res) => {
  try {
    const { classe_id, inscription_id } = req.query;
    let q = supabase.from("resultats_elearning").select("*").order("date_evaluation", { ascending: false });
    if (classe_id)     q = q.eq("classe_id", classe_id);
    if (inscription_id) q = q.eq("inscription_id", inscription_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ notes: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/elearning/notes - coach saisit une note manuelle ───────────────
router.post("/notes", authenticateAdmin, requirePermission("devoirs_evaluations", "create"), async (req, res) => {
  try {
    const coachId = req.profil?.id;
    const { inscription_id, classe_id, titre, note, note_max, type, commentaire_coach, date_evaluation } = req.body;
    if (!inscription_id || !classe_id || note == null) return res.status(400).json({ error: "inscription_id, classe_id et note requis" });
    const { data, error } = await supabase.from("resultats_elearning").insert({
      inscription_id, classe_id, titre: titre || "Note manuelle",
      note, note_max: note_max ?? 20,
      type: type || "controle",
      commentaire_coach: commentaire_coach || "",
      evalue_par: coachId,
      date_evaluation: date_evaluation || new Date().toISOString().slice(0, 10),
    }).select().single();
    if (error) throw error;
    res.status(201).json({ note: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;

