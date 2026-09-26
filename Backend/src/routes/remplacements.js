import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { notifyRole, notifyUser, notifyEntreprise } from "../services/notifyRole.js";
import { logAudit } from "../middlewares/logAudit.js";
import { recalculerHonoraireMois, verifierFicheModifiable } from "./elearning.js";
import { recalculerHonoraireMoisDash, verifierFicheModifiableDash } from "./seances.js";

const router = express.Router();

// Rôles habilités à voir/traiter les demandes de remplacement (PA Advisor, Onboarding,
// + filet de sécurité management, cohérent avec le reste de la plateforme).
const ROLES_PA = ["super_admin", "manager", "pedagogical_advisor", "onboarding"];
const ROLES_HIERARCHIE = ["superviseur", "deputy_superviseur"];

function acteurAudit(req) {
  return {
    acteur_id:    req.profil?.id    || null,
    acteur_nom:   `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || null,
    acteur_email: req.profil?.email || req.user?.email || null,
    acteur_role:  req.role          || "coach",
    // Pas de plateforme fixe ici : ces routes sont réellement appelées à la fois par dash
    // (PedagogicalAdvisorDashboard, OnboardingDashboard) et bet-elearning (DashboardAdmin,
    // DashboardProfesseur) - un tag figé sur l'une des deux masquerait ces logs à l'autre.
  };
}

// Notifie tous les apprenants actifs d'une classe
export async function notifierApprenants(classeId, payload) {
  const { data: apprenants } = await supabase
    .from("classes_elearning_apprenants")
    .select("apprenant_id")
    .eq("classe_id", classeId)
    .not("apprenant_id", "is", null)
    .neq("statut", "suspendu");
  const ids = [...new Set((apprenants || []).map(a => a.apprenant_id))];
  if (!ids.length) return;
  await supabase.from("notifications").insert(
    ids.map(user_id => ({ user_id, ...payload, source: "bet-elearning", lu: false }))
  );
}

// Notifie les parents des apprenants mineurs (enfant/ado) d'une classe
export async function notifierParentsMineurs(classeId, payload) {
  const { data: inscrits } = await supabase
    .from("classes_elearning_apprenants")
    .select("profil_type, email_parent")
    .eq("classe_id", classeId)
    .neq("statut", "suspendu");
  const emails = [...new Set(
    (inscrits || [])
      .filter(i => ["enfant", "adolescent"].includes(i.profil_type) && i.email_parent)
      .map(i => i.email_parent.toLowerCase().trim())
  )];
  if (!emails.length) return;
  const { data: parents } = await supabase
    .from("utilisateurs")
    .select("id, email")
    .eq("role", "parent")
    .in("email", emails);
  const ids = (parents || []).map(p => p.id);
  if (!ids.length) return;
  await supabase.from("notifications").insert(
    ids.map(user_id => ({ user_id, ...payload, source: "bet-elearning", lu: false }))
  );
}

// Équivalents dash de notifierApprenants/notifierParentsMineurs ci-dessus - celles-ci ne
// couvrent que le vocabulaire bet-elearning (`classes_elearning_apprenants`), donc côté dash
// les apprenants et parents n'étaient jamais notifiés qu'une délégation venait d'être confirmée
// sur leur groupe. `groupes_apprenants` est l'équivalent dash de `classes_elearning_apprenants`.
async function notifierApprenantsGroupeDash(groupeId, payload) {
  const { data: apprenants } = await supabase
    .from("groupes_apprenants")
    .select("apprenant_id, email_apprenant")
    .eq("groupe_id", groupeId)
    .neq("statut", "suspendu");
  const ids = [];
  for (const a of (apprenants || [])) {
    if (a.apprenant_id) ids.push(a.apprenant_id);
    else if (a.email_apprenant) {
      const { data: u } = await supabase.from("utilisateurs").select("id").ilike("email", a.email_apprenant).maybeSingle();
      if (u?.id) ids.push(u.id);
    }
  }
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) return;
  await supabase.from("notifications").insert(
    uniqueIds.map(user_id => ({ user_id, ...payload, source: "dash", lu: false }))
  );
}

// Piège identité enfant/parent (voir docs/parcours-prospect-cartographie.html) : le contact du
// parent n'est jamais sur `groupes_apprenants` directement, seulement sur `assignations_parcours`
// (prospect_email), reliées via `groupes_apprenants.note.assignation_id`.
async function notifierParentsMineursGroupeDash(groupeId, payload) {
  const { data: inscrits } = await supabase
    .from("groupes_apprenants")
    .select("note")
    .eq("groupe_id", groupeId)
    .neq("statut", "suspendu");
  const assignationIds = [...new Set(
    (inscrits || []).map(ga => { try { return JSON.parse(ga.note || "{}").assignation_id; } catch { return null; } }).filter(Boolean)
  )];
  if (!assignationIds.length) return;
  const { data: assignations } = await supabase
    .from("assignations_parcours")
    .select("prospect_email, profil_type")
    .in("id", assignationIds);
  const emails = [...new Set(
    (assignations || [])
      .filter(a => a.profil_type === "enfant" && a.prospect_email)
      .map(a => a.prospect_email.toLowerCase().trim())
  )];
  if (!emails.length) return;
  const { data: parents } = await supabase
    .from("utilisateurs").select("id").eq("role", "parent").in("email", emails);
  const ids = (parents || []).map(p => p.id);
  if (!ids.length) return;
  await supabase.from("notifications").insert(
    ids.map(user_id => ({ user_id, ...payload, source: "dash", lu: false }))
  );
}

// Notifie le référent RH (compte client_entreprise) si la classe est corporate
async function notifierRHSiCorporate(classe, payload) {
  if (!classe?.entreprise_id) return;
  await notifyEntreprise(classe.entreprise_id, payload).catch(() => {});
}

// ── Réattribution comptable + recalcul des honoraires ──────────────────────────
// Point central identifié lors de l'audit du mécanisme côté bet-elearning : réattribuer
// `coach_id` au remplaçant NE SUFFISAIT PAS à faire apparaître le montant dans SES
// honoraires (le recalcul mensuel n'était jamais redéclenché automatiquement - il fallait
// qu'un PA relance `POST /honoraires/calculer` manuellement). Cette fonction corrige ça des
// deux côtés (dash + bet-elearning) : réattribution + recalcul immédiat pour le remplaçant
// ET pour le titulaire absent (dont la fiche doit perdre ces séances), avec traçabilité
// (`remplacement_id`) et notification. Si une fiche est déjà transmise/payée (verrouillée),
// on ne la modifie jamais silencieusement - on notifie le PA/RH pour une correction manuelle.
async function reattribuerEtRecalculer({ tableSeances, sessionsIds, remplacement, plateforme }) {
  if (!remplacement.remplacant_id || !Array.isArray(sessionsIds) || !sessionsIds.length) return;
  const estDash   = plateforme === "dash";
  const champDate = estDash ? "date_seance" : "date";

  // Seules les séances réellement réalisées comptent pour les honoraires - inutile de
  // réattribuer/recalculer pour des séances annulées ou encore planifiées.
  const { data: seancesRealisees, error: eSel } = await supabase
    .from(tableSeances).select(`id, ${champDate}, remplacement_id`).in("id", sessionsIds).eq("statut", "realisee");
  if (eSel) { console.error("[reattribuerEtRecalculer] lecture séances:", eSel.message); return; }
  const aTraiter = (seancesRealisees || []).filter(s => s.remplacement_id !== remplacement.id);
  if (!aTraiter.length) return;

  const idsATraiter = aTraiter.map(s => s.id);
  const { error: eReattrib } = await supabase.from(tableSeances)
    .update({ coach_id: remplacement.remplacant_id, remplacement_id: remplacement.id })
    .in("id", idsATraiter);
  if (eReattrib) { console.error("[reattribuerEtRecalculer] réattribution:", eReattrib.message); return; }

  // `sessions_live` (dash) n'est jamais réassigné par ce qui précède - bridée à `seances` via
  // `seance_id`, elle garde le coach_id du titulaire même après réattribution comptable. Sans
  // ce correctif, dès que la délégation se clôture (auto, dès la dernière séance réalisée), le
  // remplaçant perdait instantanément toute trace des séances live qu'il venait pourtant de
  // réaliser dans son propre onglet Session Live - l'élargissement par délégation active
  // (GET /sessions-live) ne couvre plus une délégation déjà terminée.
  if (estDash) {
    const { error: eLive } = await supabase.from("sessions_live")
      .update({ coach_id: remplacement.remplacant_id })
      .in("seance_id", idsATraiter);
    if (eLive) console.error("[reattribuerEtRecalculer] réattribution sessions_live:", eLive.message);
  }

  // Mois distincts couverts, pour recalculer chaque fiche mensuelle concernée (pas juste le
  // mois en cours - un remplacement peut couvrir une séance à cheval sur deux mois).
  const moisTouches = new Set(aTraiter.map(s => {
    const d = new Date(s[champDate]);
    return `${d.getFullYear()}-${d.getMonth() + 1}`;
  }));

  const recalculerFn = estDash ? recalculerHonoraireMoisDash : recalculerHonoraireMois;
  const verifierFn   = estDash ? verifierFicheModifiableDash : verifierFicheModifiable;

  const alerterFicheVerrouillee = async (coachId, coachNom, mois, annee) => {
    await notifyRole(ROLES_PA, {
      type:    "honoraires_correction_requise",
      titre:   "⚠️ Fiche à corriger manuellement après remplacement",
      message: `La fiche d'honoraires ${mois}/${annee} de ${coachNom} est déjà transmise ou payée mais est concernée par le remplacement du ${remplacement.date_debut} (${remplacement.groupe_nom || "groupe"}) - remettez-la en attente puis recalculez-la manuellement.`,
      meta:    { remplacement_id: remplacement.id, coach_id: coachId, mois, annee },
      source:  estDash ? "dash" : "bet-elearning",
    }).catch(() => {});
  };

  for (const cle of moisTouches) {
    const [annee, mois] = cle.split("-").map(Number);

    // Titulaire absent - la fiche doit perdre ces séances.
    try {
      await verifierFn(remplacement.absent_id, mois, annee);
      await recalculerFn(remplacement.absent_id, mois, annee);
    } catch (e) {
      if (e.statusCode === 409) await alerterFicheVerrouillee(remplacement.absent_id, remplacement.absent_nom, mois, annee);
      else console.error("[reattribuerEtRecalculer] recalcul titulaire:", e.message);
    }

    // Remplaçant - la fiche doit gagner ces séances.
    try {
      await verifierFn(remplacement.remplacant_id, mois, annee);
      await recalculerFn(remplacement.remplacant_id, mois, annee);
      await notifyUser(remplacement.remplacant_id, {
        type:    "honoraires_maj_remplacement",
        titre:   "💰 Honoraires mis à jour",
        message: `Vos honoraires de ${mois}/${annee} ont été mis à jour : ${aTraiter.length} séance${aTraiter.length > 1 ? "s" : ""} assurée${aTraiter.length > 1 ? "s" : ""} en remplacement de ${remplacement.absent_nom} (${remplacement.groupe_nom || "groupe"}) y ${aTraiter.length > 1 ? "ont été ajoutées" : "a été ajoutée"}.`,
        meta:    { remplacement_id: remplacement.id, mois, annee },
        source:  estDash ? "dash" : "bet-elearning",
      }).catch(() => {});
    } catch (e) {
      if (e.statusCode === 409) await alerterFicheVerrouillee(remplacement.remplacant_id, remplacement.remplacant_nom, mois, annee);
      else console.error("[reattribuerEtRecalculer] recalcul remplaçant:", e.message);
    }
  }
}

// ── GET /api/remplacements - liste (PA, superviseur, super_admin) ─────────────
// Un coach ne doit voir QUE ses propres demandes (absent_id = lui) ou les remplacements où il
// est le remplaçant assigné - jamais le motif d'absence, le motif de refus ou l'identité d'un
// autre coach. Avant ce correctif, n'importe quel compte "coach" authentifié pouvait appeler
// cette route sans filtre et récupérer la liste complète de tous les remplacements de la
// plateforme (fuite d'information - motifs d'absence/refus de collègues inclus).
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    const { statut, absent_id, remplacant_id, plateforme } = req.query;
    const estPA = ROLES_PA.includes(req.role);
    let q = supabase.from("remplacements").select("*").order("created_at", { ascending: false });

    if (statut) q = q.eq("statut", statut);
    // dash et bet-elearning partagent le même id de coach (`utilisateurs`) - sans ce filtre,
    // "Mes demandes" côté dash affichait aussi les demandes d'absence faites côté bet-elearning
    // par la même personne. `plateforme=dash` exclut donc les lignes "bet-elearning" ET les
    // lignes historiques sans plateforme (NULL, créées avant l'ajout de cette colonne).
    if (plateforme === "dash") q = q.eq("plateforme", "dash");
    else if (plateforme === "bet-elearning") q = q.or("plateforme.eq.bet-elearning,plateforme.is.null");

    if (estPA) {
      if (absent_id)     q = q.eq("absent_id", absent_id);
      if (remplacant_id) q = q.eq("remplacant_id", remplacant_id);
    } else {
      // Coach non-PA : uniquement ses propres demandes (absent) ou ses propres délégations
      // (remplaçant) - tout paramètre pointant vers un autre utilisateur est ignoré.
      const moi = req.profil?.id;
      if (!moi) return res.status(401).json({ error: "Non authentifié" });
      if (remplacant_id && remplacant_id === moi)      q = q.eq("remplacant_id", moi);
      else if (absent_id && absent_id === moi)         q = q.eq("absent_id", moi);
      else                                              q = q.or(`absent_id.eq.${moi},remplacant_id.eq.${moi}`);
    }

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    const maintenant = Date.now();

    // Statut réel des séances couvertes (table `seances` pour dash, `seances_elearning`
    // pour bet-elearning) - sans ça, le front n'a aucun moyen de savoir quelles séances
    // sont déjà réalisées et la progression/clôture automatique reste bloquée à 0%.
    const idsDash = new Set(), idsBet = new Set();
    (data || []).forEach(r => {
      const cible = r.plateforme === "bet-elearning" ? idsBet : idsDash;
      (r.sessions_ids || []).forEach(id => cible.add(id));
    });
    const [{ data: toutesDash }, { data: toutesBet }] = await Promise.all([
      idsDash.size
        ? supabase.from("seances").select("id, statut, date_seance, heure_debut, titre").in("id", [...idsDash])
        : Promise.resolve({ data: [] }),
      idsBet.size
        ? supabase.from("seances_elearning").select("id, statut, date, heure_debut, type").in("id", [...idsBet])
        : Promise.resolve({ data: [] }),
    ]);
    const realiseesSet = new Set(
      [...(toutesDash || []), ...(toutesBet || [])].filter(s => s.statut === "realisee").map(s => s.id)
    );
    // Détail lisible des séances couvertes - sans ça, le front n'a que des ids de séances à
    // afficher tels quels (ex: "Session 62015d48-...") faute d'avoir la date/l'heure/le titre.
    const detailMap = {};
    (toutesDash || []).forEach(s => { detailMap[s.id] = { date: s.date_seance, heure: s.heure_debut, titre: s.titre }; });
    (toutesBet  || []).forEach(s => { detailMap[s.id] = { date: s.date, heure: s.heure_debut, titre: s.type }; });

    const remplacements = (data || []).map(r => ({
      ...r,
      urgent: r.statut === "a_pourvoir" && r.date_debut
        ? (new Date(r.date_debut).getTime() - maintenant) < 24 * 3600 * 1000
        : false,
      sessions_realisees_ids: (r.sessions_ids || []).filter(id => realiseesSet.has(id)),
      sessions_detail: Object.fromEntries((r.sessions_ids || []).map(id => [id, detailMap[id] || null])),
      // `groupe_id` est polymorphe (pas de FK en base, cf. Backend/sql/par_table/remplacements.sql) :
      // pointe vers `classes_elearning` OU `groupes` selon `plateforme`. Champ additif pour que tout
      // futur consommateur (app mobile incluse) sache dans quelle table résoudre `groupe_id` sans
      // avoir à connaître ce piège historique.
      groupe_id_type: r.plateforme === "dash" ? "groupes" : "classes_elearning",
    }));
    res.json({ remplacements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/remplacements - le coach signale son absence sur des séances précises ──
router.post("/", authenticateAdmin, requirePermission("remplacements", "create"), async (req, res) => {
  try {
    const {
      absent_id: bodyAbsentId, absent_nom: bodyAbsentNom,
      groupe_id, groupe_nom,
      date_debut, date_fin,
      sessions_ids,
      motif, message,
      plateforme,
      lot_id,
    } = req.body;

    // dash et bet-elearning stockent leurs séances dans des tables distinctes
    // (`seances` vs `seances_elearning`) - sans ce branchement, toute demande
    // d'absence créée depuis dash échouerait à la vérification ci-dessous, ses
    // sessions_ids n'existant jamais dans seances_elearning. NULL/valeur
    // inconnue = bet-elearning, pour ne rien changer au comportement historique.
    const estDash = plateforme === "dash";
    const tableSeances  = estDash ? "seances" : "seances_elearning";
    const colonneGroupe = estDash ? "groupe_id" : "classe_id";

    if (!groupe_id)                          return res.status(400).json({ error: "groupe_id est requis" });
    if (!Array.isArray(sessions_ids) || !sessions_ids.length)
      return res.status(400).json({ error: "Sélectionnez au moins une séance précise à couvrir" });
    if (!date_debut)                         return res.status(400).json({ error: "date_debut est requis" });
    if (date_fin && date_fin < date_debut)   return res.status(400).json({ error: "date_fin ne peut pas précéder date_debut" });

    // Un coach non-PA ne peut signaler une absence QUE pour lui-même - sans ce garde-fou,
    // n'importe quel compte coach authentifié pouvait passer un autre absent_id dans le corps
    // de la requête et déposer une fausse demande d'absence au nom d'un collègue.
    const estPA  = ROLES_PA.includes(req.role);
    const absentId = estPA && bodyAbsentId ? bodyAbsentId : req.user.id;
    let absent_nom = estPA ? (bodyAbsentNom || null) : null;
    if (!absent_nom) {
      const { data: profil } = await supabase.from("utilisateurs").select("nom, prenom").eq("id", absentId).maybeSingle();
      absent_nom = profil ? `${profil.prenom || ""} ${profil.nom || ""}`.trim() : "Coach";
    }

    // Les séances signalées doivent réellement appartenir à ce groupe ET à ce coach - sans
    // cette vérification, un client malveillant pourrait couvrir des séances d'une autre
    // classe (ou d'un autre coach) sous couvert d'une demande d'absence légitime.
    const { data: seancesVerif, error: eVerif } = await supabase
      .from(tableSeances).select(`id, ${colonneGroupe}, coach_id`).in("id", sessions_ids);
    if (eVerif) return res.status(500).json({ error: eVerif.message });
    const invalides = (seancesVerif || []).filter(s => s[colonneGroupe] !== groupe_id || s.coach_id !== absentId);
    if (invalides.length > 0 || (seancesVerif || []).length !== sessions_ids.length) {
      return res.status(400).json({ error: "Une ou plusieurs séances sélectionnées n'appartiennent pas à ce coach ou à ce groupe" });
    }

    const basePayload = {
      absent_id: absentId, absent_nom,
      groupe_id, groupe_nom: groupe_nom || null,
      date_debut, date_fin: date_fin || date_debut,
      nb_sessions: sessions_ids.length,
      sessions_ids,
      motif: motif || null, message: message || null,
      statut: "a_pourvoir",
      plateforme: estDash ? "dash" : "bet-elearning",
    };

    let { data, error } = await supabase
      .from("remplacements")
      .insert(lot_id ? { ...basePayload, lot_id } : basePayload)
      .select()
      .single();

    // `lot_id` relie les demandes issues d'une même absence multi-classes (cf.
    // envoyerDemandeAbsence côté dash/bet-elearning) - colonne ajoutée après coup
    // (remplacements_lot_id_migration.sql) : tant que la migration n'a pas été jouée en prod,
    // on retente sans ce champ plutôt que de faire échouer toute la déclaration d'absence.
    if (error && lot_id && (error.message || "").includes("lot_id")) {
      ({ data, error } = await supabase.from("remplacements").insert(basePayload).select().single());
    }

    if (error) return res.status(500).json({ error: error.message });

    // Étape 2 - le PA / Onboarding est notifié immédiatement, sans file d'attente silencieuse.
    const urgent = (new Date(date_debut).getTime() - Date.now()) < 24 * 3600 * 1000;
    await notifyRole(ROLES_PA, {
      type:    "remplacement_a_pourvoir",
      titre:   `${urgent ? "🚨 URGENT - " : "🔄 "}Absence à couvrir - ${absent_nom}`,
      message: `${absent_nom} a signalé son absence sur ${sessions_ids.length} séance${sessions_ids.length > 1 ? "s" : ""}${groupe_nom ? ` (${groupe_nom})` : ""} à partir du ${date_debut}. Motif : ${motif || "non précisé"}.`,
      meta:    { remplacement_id: data.id, groupe_id, urgent },
      source:  estDash ? "dash" : "bet-elearning",
    }).catch(() => {});

    req._auditLogged = true;
    logAudit({
      ...acteurAudit(req),
      action_type: "ABSENCE_SIGNALEE",
      module:      "remplacements",
      entite_type: "remplacements",
      entite_id:   data.id,
      detail:      `${absent_nom} signale son absence sur ${sessions_ids.length} séance(s)${groupe_nom ? ` - ${groupe_nom}` : ""} - motif : ${motif || "non précisé"}`,
      statut:      "success",
    }).catch(() => {});

    res.status(201).json({ remplacement: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/remplacements/:id - assignation d'un remplaçant, ou clôture manuelle ──
router.patch("/:id", authenticateAdmin, requirePermission("remplacements", "update"), async (req, res) => {
  try {
    const { id } = req.params;
    const { remplacant_id, remplacant_nom, sessions_ids, nb_sessions, statut, motif_refus } = req.body;

    // Assignation, refus et clôture sont des décisions PA/superviseur/admin - jamais une action
    // qu'un coach peut effectuer sur SA PROPRE demande ni, pire, sur celle d'un collègue. Avant
    // ce correctif, cette route n'avait aucune vérification de rôle : n'importe quel coach
    // authentifié pouvait s'auto-assigner comme remplaçant sur n'importe quelle classe (gagnant
    // ainsi un accès de délégation réel via l'insert dans `delegations`), refuser la demande
    // d'un collègue, ou clôturer un remplacement en cours - une élévation de privilèges directe.
    if (!ROLES_PA.includes(req.role)) {
      return res.status(403).json({ error: "Action réservée au PA Advisor / à l'administration" });
    }

    const { data: avant, error: eAvant } = await supabase.from("remplacements").select("*").eq("id", id).single();
    if (eAvant || !avant) return res.status(404).json({ error: "Remplacement introuvable" });

    // ── Refus par le PA - chemin séparé, distinct de l'assignation/clôture, jamais déclenché
    // automatiquement. Nécessite un motif (garde-fou procédural, cohérent avec la suspension
    // définitive de coach) et notifie le coach absent, qui doit alors régler l'absence
    // autrement (ex : re-signaler avec un autre créneau, en discuter avec son superviseur).
    if (statut === "refuse" && avant.statut !== "refuse") {
      if (avant.statut !== "a_pourvoir") {
        return res.status(409).json({ error: "Cette demande n'est plus « à pourvoir » - elle a déjà été assignée ou clôturée" });
      }
      if (!motif_refus?.trim()) return res.status(400).json({ error: "Un motif est requis pour refuser la demande" });
      const refusePar = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || null;
      const { data: refuse, error: eRefus } = await supabase.from("remplacements")
        .update({
          statut: "refuse", motif_refus: motif_refus.trim(),
          refuse_par_id: req.profil?.id || null, refuse_par_nom: refusePar, refuse_le: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id).select().single();
      if (eRefus) return res.status(500).json({ error: eRefus.message });

      await notifyUser(avant.absent_id, {
        type: "remplacement_refuse", titre: "❌ Demande d'absence refusée",
        message: `Votre demande d'absence sur "${avant.groupe_nom || "votre groupe"}" a été refusée. Motif : ${motif_refus.trim()}.`,
        meta: { remplacement_id: id },
        source: avant.plateforme === "dash" ? "dash" : "bet-elearning",
      }).catch(() => {});

      req._auditLogged = true;
      logAudit({
        ...acteurAudit(req),
        action_type: "REMPLACEMENT_REFUSE",
        module:      "remplacements",
        entite_type: "remplacements",
        entite_id:   id,
        detail:      `Demande de ${avant.absent_nom} refusée - motif : ${motif_refus.trim()}`,
        statut:      "warning",
      }).catch(() => {});

      return res.json({ remplacement: refuse });
    }

    // Un coach ne peut pas être son propre remplaçant - sans ce garde-fou, rien n'empêchait un
    // PA de valider une assignation avec remplacant_id === absent_id, ce qui aurait produit des
    // notifications incohérentes ("vous êtes assigné en remplacement de vous-même") et une
    // réattribution comptable sans effet réel.
    if (remplacant_id && remplacant_id === avant.absent_id) {
      return res.status(400).json({ error: "Le coach absent ne peut pas être son propre remplaçant" });
    }

    const estAssignation = !!remplacant_id && !avant.remplacant_id;

    // Un remplaçant déjà assigné ne doit jamais être réécrit par un second appel à cette route
    // (ex: un PA qui re-clique "Confirmer" après une première assignation) - auparavant,
    // remplacant_nom/sessions_ids/nb_sessions étaient appliqués dès qu'ils étaient fournis dans
    // le body, même hors du chemin d'assignation initiale (remplacant_id différent de celui déjà
    // en place, ou carrément absent du body), écrasant silencieusement la délégation déjà active
    // sans créer de nouvelle ligne `delegations` ni notifier personne.
    if (remplacant_id && avant.remplacant_id && remplacant_id !== avant.remplacant_id) {
      return res.status(409).json({ error: "Un remplaçant est déjà assigné à cette demande - clôturez la délégation en cours avant d'en assigner une nouvelle." });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (statut) updates.statut = statut;
    if (estAssignation) {
      updates.remplacant_id  = remplacant_id;
      if (remplacant_nom)            updates.remplacant_nom = remplacant_nom;
      if (sessions_ids)              updates.sessions_ids   = sessions_ids;
      if (nb_sessions !== undefined) updates.nb_sessions    = nb_sessions;
      if (!statut) updates.statut = "en_cours";
      updates.assigne_par_id  = req.profil?.id || null;
      updates.assigne_par_nom = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || null;
    }

    // Garde-fou anti-race sur une première assignation : l'update ne s'applique que si
    // remplacant_id est TOUJOURS null au moment précis de l'écriture (vérification atomique
    // côté base, pas seulement sur `avant` lu quelques instants plus tôt) - sans ça, deux PA
    // qui assignent chacun un coach différent en même temps pourraient tous les deux réussir,
    // créant deux délégations actives concurrentes sur les mêmes séances.
    let q = supabase.from("remplacements").update(updates).eq("id", id);
    if (estAssignation) q = q.is("remplacant_id", null);
    const { data, error } = await q.select().single();
    if (error) {
      if (estAssignation) return res.status(409).json({ error: "Un remplaçant vient déjà d'être assigné par quelqu'un d'autre - rechargez la page." });
      return res.status(500).json({ error: error.message });
    }

    // ── Étape 4 - délégation réelle : accès du remplaçant (badge, séances déléguées) ──
    // DOIT réussir et être vérifiée AVANT toute notification de succès - c'est cette ligne
    // qui rend le remplacement effectif (AuthContext.jsx du remplaçant lit cette table).
    // Un ancien bug envoyait les notifications inconditionnellement puis tentait cet insert
    // en avalant l'erreur silencieusement (try/catch sans vérifier { error }), ce qui faisait
    // croire à une assignation réussie alors qu'elle n'avait jamais eu lieu.
    if (estAssignation) {
      const { error: eDeleg } = await supabase.from("delegations").insert({
        remplacement_id: data.id,
        titulaire_id:     data.absent_id,
        groupe_id:        data.groupe_id,
        remplacant_id:    data.remplacant_id,
        sessions_ids:     data.sessions_ids || [],
        date_debut:       data.date_debut,
        date_fin:         data.date_fin,
        statut:           "active",
      });
      if (eDeleg) {
        console.error("[remplacements] échec insert delegation:", eDeleg.message);
        // Revenir en arrière sur le statut pour ne pas laisser le remplacement dans un état
        // incohérent ("en_cours" avec un remplaçant assigné mais aucune délégation active).
        await supabase.from("remplacements").update({
          statut: avant.statut, remplacant_id: avant.remplacant_id, remplacant_nom: avant.remplacant_nom,
          assigne_par_id: avant.assigne_par_id || null, assigne_par_nom: avant.assigne_par_nom || null,
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        return res.status(500).json({ error: `L'assignation n'a pas pu être finalisée : ${eDeleg.message}` });
      }

      // Cas rétroactif : le PA peut assigner un remplaçant sur une demande couvrant des
      // séances DÉJÀ réalisées (le titulaire a fini par assurer la séance lui-même avant
      // qu'un remplaçant ne soit trouvé, ou l'absence est signalée après coup). Dans ce cas,
      // la transition de statut qui déclenche normalement traiterClotureSeanceRemplacement
      // ne se produira jamais - sans ce rattrapage immédiat, ces séances resteraient
      // indéfiniment au nom du titulaire absent dans ses honoraires.
      const tableSeancesAssign = avant.plateforme === "dash" ? "seances" : "seances_elearning";
      reattribuerEtRecalculer({
        tableSeances: tableSeancesAssign,
        sessionsIds:  data.sessions_ids || [],
        remplacement: data,
        plateforme:   avant.plateforme,
      }).catch(e => console.error("[remplacements] rattrapage rétroactif:", e.message));
    }

    // ── Étape 3 - assignation confirmée : sept notifications en parallèle ──
    if (estAssignation) {
      const { data: classe } = await supabase
        .from("classes_elearning")
        .select("id, nom, entreprise_id")
        .eq("id", data.groupe_id)
        .maybeSingle();

      const dateLabel = data.date_debut
        ? new Date(data.date_debut).toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })
        : "";
      const groupeLabel = data.groupe_nom || classe?.nom || "votre groupe";

      // 1) Coach absent
      await notifyUser(data.absent_id, {
        type: "remplacement_confirme",
        titre: "✅ Remplacement pris en charge",
        message: `C'est pris en charge - ${data.remplacant_nom} remplace votre séance du ${dateLabel} (${groupeLabel}).`,
        meta: { remplacement_id: data.id },
        source: avant.plateforme === "dash" ? "dash" : "bet-elearning",
      }).catch(() => {});

      // 2) Coach remplaçant
      await notifyUser(data.remplacant_id, {
        type: "remplacement_assigne",
        titre: "🔁 Vous avez été assigné(e) comme remplaçant",
        message: `Vous remplacez ${data.absent_nom} le ${dateLabel} - ${groupeLabel}.${data.assigne_par_nom ? ` Assignation validée par ${data.assigne_par_nom} (PA Advisor).` : ''}`,
        meta: { remplacement_id: data.id, groupe_id: data.groupe_id },
        source: avant.plateforme === "dash" ? "dash" : "bet-elearning",
      }).catch(() => {});

      // 3) Apprenants de la classe
      if (data.groupe_id) {
        const notifierAppr = avant.plateforme === "dash" ? notifierApprenantsGroupeDash : notifierApprenants;
        notifierAppr(data.groupe_id, {
          type: "remplacement_confirme",
          titre: "🔁 Changement de coach pour votre prochaine séance",
          message: `Votre séance du ${dateLabel} sera assurée par ${data.remplacant_nom}.`,
          meta: { remplacement_id: data.id, groupe_id: data.groupe_id },
        }).catch(() => {});
      }

      // 4) Superviseur + 5) Deputy superviseur(s)
      await notifyRole(ROLES_HIERARCHIE, {
        type: "remplacement_confirme",
        titre: "🧭 Remplacement confirmé",
        message: `Remplacement confirmé - ${groupeLabel}, séance du ${dateLabel} : ${data.remplacant_nom} remplace ${data.absent_nom}.`,
        meta: { remplacement_id: data.id, groupe_id: data.groupe_id },
        source: avant.plateforme === "dash" ? "dash" : "bet-elearning",
      }).catch(() => {});

      // 6) Parent(s) si apprenant mineur
      if (data.groupe_id) {
        const notifierParents = avant.plateforme === "dash" ? notifierParentsMineursGroupeDash : notifierParentsMineurs;
        notifierParents(data.groupe_id, {
          type: "remplacement_confirme",
          titre: "🔁 Changement de coach pour votre enfant",
          message: `La séance du ${dateLabel} de votre enfant (${groupeLabel}) sera assurée par ${data.remplacant_nom}.`,
          meta: { remplacement_id: data.id, groupe_id: data.groupe_id },
        }).catch(() => {});
      }

      // 7) Référent RH entreprise si classe corporate
      notifierRHSiCorporate(classe, {
        type: "remplacement_confirme",
        titre: "🏢 Changement de coach sur votre groupe",
        message: `Votre groupe ${groupeLabel} sera assuré par ${data.remplacant_nom} le ${dateLabel}.`,
        meta: { remplacement_id: data.id, groupe_id: data.groupe_id },
        source: "bet-elearning",
      }).catch(() => {});

      req._auditLogged = true;
      logAudit({
        ...acteurAudit(req),
        action_type: "REMPLACANT_ASSIGNE",
        module:      "remplacements",
        entite_type: "remplacements",
        entite_id:   data.id,
        detail:      `${data.remplacant_nom} assigné(e) en remplacement de ${data.absent_nom} - ${(data.sessions_ids || []).length} séance(s), ${groupeLabel}`,
        statut:      "success",
      }).catch(() => {});
    } else if (statut === "termine" && avant.statut !== "termine") {
      // Clôture manuelle par le PA
      const { error: eDelegClot } = await supabase.from("delegations")
        .update({ statut: "terminee", updated_at: new Date().toISOString() })
        .eq("remplacement_id", id);
      if (eDelegClot) console.error("[remplacements] échec clôture delegation:", eDelegClot.message);

      // Réattribution comptable des séances déjà réalisées - sans ça, une clôture manuelle
      // (avant que la clôture automatique de chaque séance n'ait pu s'en charger) laisse
      // le coach_id pointer indéfiniment sur le titulaire absent, alors que c'est le
      // remplaçant qui les a effectivement assurées. Table cible selon la plateforme
      // d'origine du remplacement (voir POST / plus haut pour le même branchement).
      if (data.remplacant_id && Array.isArray(data.sessions_ids) && data.sessions_ids.length > 0) {
        const tableSeancesClot = avant.plateforme === "dash" ? "seances" : "seances_elearning";
        reattribuerEtRecalculer({
          tableSeances: tableSeancesClot,
          sessionsIds:  data.sessions_ids,
          remplacement: data,
          plateforme:   avant.plateforme,
        }).catch(e => console.error("[remplacements] échec réattribution/recalcul (clôture manuelle):", e.message));
      }

      req._auditLogged = true;
      logAudit({
        ...acteurAudit(req),
        action_type: "REMPLACEMENT_CLOTURE",
        module:      "remplacements",
        entite_type: "remplacements",
        entite_id:   id,
        detail:      `Clôture manuelle du remplacement (${data.remplacant_nom || "sans remplaçant"} - ${data.groupe_nom || ""})`,
        statut:      "success",
      }).catch(() => {});

      // Notifier le remplaçant et le titulaire absent - la clôture automatique le fait déjà
      // (cf. traiterClotureSeanceRemplacement plus bas), mais la clôture manuelle par le PA
      // restait entièrement silencieuse.
      const messageClotureManuelle = `✅ Remplacement de ${data.groupe_nom || "groupe"} clôturé par le PA Advisor.`;
      if (data.remplacant_id) {
        await notifyUser(data.remplacant_id, {
          type: "remplacement_termine", titre: "✅ Remplacement terminé", message: messageClotureManuelle,
          meta: { remplacement_id: id },
          source: avant.plateforme === "dash" ? "dash" : "bet-elearning",
        }).catch(() => {});
      }
      if (data.absent_id) {
        await notifyUser(data.absent_id, {
          type: "remplacement_termine", titre: "✅ Remplacement clôturé", message: messageClotureManuelle,
          meta: { remplacement_id: id },
          source: avant.plateforme === "dash" ? "dash" : "bet-elearning",
        }).catch(() => {});
      }
    }

    res.json({ remplacement: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Appelée depuis la clôture d'une séance (elearning.js pour bet-elearning,
// seances.js pour dash - d'où le paramètre plateforme) ────────────────────────
// Étape 5 - réattribue la séance couverte au remplaçant pour le calcul des honoraires.
// Étape 6 - clôture automatique du remplacement dès que toutes ses séances sont réalisées.
export async function traiterClotureSeanceRemplacement(seanceId, classeId, plateforme = "bet-elearning") {
  try {
    const estDash = plateforme === "dash";
    const tableSeances = estDash ? "seances" : "seances_elearning";
    // dash n'a pas de statut "reportee" (voir seances_statut_check) - les statuts
    // terminaux y sont réalisée/annulée/coach absent/apprenant absent.
    const statutsTraites = estDash
      ? ["realisee", "annulee", "coach_absent", "apprenant_absent"]
      : ["realisee", "annulee", "reportee"];
    // `sessions_ids` est une colonne JSONB (pas un tableau Postgres natif) - `.contains()` de
    // supabase-js sérialise un tableau JS en littéral de tableau Postgres (`{a,b}`), une syntaxe
    // invalide pour du JSON, ce qui fait échouer la requête à coup sûr ("invalid input syntax
    // for type json"). Comme l'erreur n'était jamais vérifiée, la fonction retournait toujours
    // silencieusement à la ligne suivante (`remplacement` = undefined) : la clôture automatique
    // n'a donc jamais pu se déclencher, quel que soit l'état des séances. On filtre donc côté
    // JS après un fetch simple par groupe_id + statut, sans dépendre du filtrage JSONB de
    // PostgREST.
    const { data: candidats, error: eCandidats } = await supabase
      .from("remplacements")
      .select("*")
      .eq("groupe_id", classeId)
      .eq("statut", "en_cours");
    if (eCandidats) { console.error("[traiterClotureSeanceRemplacement] échec recherche remplacement:", eCandidats.message); return; }
    const remplacement = (candidats || []).find(r => (r.sessions_ids || []).includes(seanceId));
    if (!remplacement) return;

    // Réattribution comptable de cette séance + recalcul immédiat des honoraires du
    // titulaire absent (qui la perd) et du remplaçant (qui la gagne) - voir
    // reattribuerEtRecalculer plus haut : ne touche que les séances "realisee".
    await reattribuerEtRecalculer({ tableSeances, sessionsIds: [seanceId], remplacement, plateforme });

    // Toutes les séances couvertes sont-elles désormais traitées (réalisées, annulées ou
    // équivalent) ? Sans ça, la délégation resterait bloquée en_cours indéfiniment et
    // exigerait une clôture manuelle du PA à chaque annulation.
    const { data: seances } = await supabase
      .from(tableSeances)
      .select("id, statut")
      .in("id", remplacement.sessions_ids);
    const toutesTraitees = (seances || []).length > 0 && seances.every(s => statutsTraites.includes(s.statut));
    if (!toutesTraitees) return;

    const { error: eTermine } = await supabase.from("remplacements")
      .update({ statut: "termine", updated_at: new Date().toISOString() }).eq("id", remplacement.id);
    if (eTermine) console.error("[traiterClotureSeanceRemplacement] échec clôture remplacement:", eTermine.message);
    const { error: eDelegTermine } = await supabase.from("delegations")
      .update({ statut: "terminee", updated_at: new Date().toISOString() }).eq("remplacement_id", remplacement.id);
    if (eDelegTermine) console.error("[traiterClotureSeanceRemplacement] échec clôture delegation:", eDelegTermine.message);

    const messageAuto = `✅ Délégation de ${remplacement.remplacant_nom} (${remplacement.groupe_nom || "groupe"}) clôturée automatiquement - toutes les séances ont été réalisées.`;
    if (remplacement.assigne_par_id) {
      await notifyUser(remplacement.assigne_par_id, {
        type: "remplacement_termine", titre: "✅ Remplacement terminé", message: messageAuto,
        meta: { remplacement_id: remplacement.id },
        source: estDash ? "dash" : "bet-elearning",
      }).catch(() => {});
    } else {
      await notifyRole(ROLES_PA, {
        type: "remplacement_termine", titre: "✅ Remplacement terminé", message: messageAuto,
        meta: { remplacement_id: remplacement.id },
        source: estDash ? "dash" : "bet-elearning",
      }).catch(() => {});
    }

    // Les deux coachs concernés doivent aussi être notifiés - jusqu'ici, seule la clôture
    // MANUELLE (par le PA, ci-dessus dans PATCH /:id) les notifiait ; la clôture AUTOMATIQUE
    // (le cas le plus fréquent, dès que toutes les séances déléguées sont réalisées) ne
    // prévenait que le PA assigneur, laissant le titulaire et le remplaçant sans nouvelle
    // du retour à la normale (le titulaire retrouve pourtant l'accès complet à sa classe ici).
    if (remplacement.remplacant_id) {
      await notifyUser(remplacement.remplacant_id, {
        type: "remplacement_termine", titre: "✅ Remplacement terminé", message: messageAuto,
        meta: { remplacement_id: remplacement.id },
        source: estDash ? "dash" : "bet-elearning",
      }).catch(() => {});
    }
    if (remplacement.absent_id) {
      await notifyUser(remplacement.absent_id, {
        type: "remplacement_termine", titre: "✅ Vous avez retrouvé votre classe",
        message: `${messageAuto} Vous êtes de nouveau seul(e) titulaire de "${remplacement.groupe_nom || "votre groupe"}".`,
        meta: { remplacement_id: remplacement.id },
        source: estDash ? "dash" : "bet-elearning",
      }).catch(() => {});
    }

    await logAudit({
      acteur_id: null, acteur_nom: "Système", acteur_email: null, acteur_role: "systeme",
      plateforme: estDash ? "dash" : "bet-elearning",
      action_type: "REMPLACEMENT_TERMINE",
      module:      "remplacements",
      entite_type: "remplacements",
      entite_id:   remplacement.id,
      detail:      `Clôture automatique - toutes les séances couvertes sont réalisées (${remplacement.remplacant_nom})`,
      statut:      "success",
    }).catch(() => {});
  } catch (err) {
    console.error("[traiterClotureSeanceRemplacement]", err.message);
  }
}

// GET /api/remplacements/delegations/actives - utilisé par Gestion des droits (Vue d'ensemble,
// carte "Accès temporaires") : nombre de délégations de remplacement actuellement actives
// (un remplaçant dispose temporairement de l'accès aux séances d'un titulaire absent).
router.get("/delegations/actives", authenticateAdmin, async (req, res) => {
  try {
    const { count, error } = await supabase
      .from("delegations")
      .select("id", { count: "exact", head: true })
      .eq("statut", "active");
    if (error) throw error;
    res.json({ total: count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/remplacements/delegations/recues - délégations où JE suis le remplaçant.
// Contrairement à bet-elearning (qui lit `delegations` en direct depuis le navigateur via
// Supabase, cf. AuthContext.jsx), dash n'expose pas de client Supabase authentifié RLS côté
// coach - cet endpoint backend, self-scopé sur l'appelant, joue le même rôle : permettre au
// frontend de savoir quels groupes/séances lui sont délégués pour les fusionner dans sa vue.
router.get("/delegations/recues", authenticateAdmin, async (req, res) => {
  try {
    const moi = req.profil?.id;
    if (!moi) return res.status(401).json({ error: "Non authentifié" });
    const { statut } = req.query;
    let q = supabase.from("delegations").select("*").eq("remplacant_id", moi).order("created_at", { ascending: false });
    if (statut) q = q.eq("statut", statut);
    const { data, error } = await q;
    if (error) throw error;

    // Enrichissement avec le nom du titulaire remplacé / du groupe / du PA assignateur - la
    // table `delegations` ne stocke que des ids, mais le bandeau frontend (mêmes infos que
    // côté bet-elearning) a besoin de ces libellés sans requête supplémentaire par ligne.
    const remplacementIds = [...new Set((data || []).map(d => d.remplacement_id).filter(Boolean))];
    let remplacementsById = {};
    if (remplacementIds.length) {
      const { data: remps } = await supabase
        .from("remplacements")
        .select("id, absent_nom, groupe_nom, assigne_par_nom, plateforme")
        .in("id", remplacementIds);
      remplacementsById = Object.fromEntries((remps || []).map(r => [r.id, r]));
    }
    const enrichies = (data || []).map(d => ({
      ...d,
      absent_nom:     remplacementsById[d.remplacement_id]?.absent_nom || null,
      groupe_nom:     remplacementsById[d.remplacement_id]?.groupe_nom || null,
      assigne_par_nom: remplacementsById[d.remplacement_id]?.assigne_par_nom || null,
      // Voir commentaire équivalent sur GET / - même piège polymorphe pour delegations.groupe_id.
      groupe_id_type: remplacementsById[d.remplacement_id]?.plateforme === "dash" ? "groupes" : "classes_elearning",
    }));

    res.json({ delegations: enrichies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
