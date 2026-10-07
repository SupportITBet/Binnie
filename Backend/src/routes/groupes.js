import express from "express";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "../middlewares/auth.js";
import { peutLireRattachement } from "../services/accesApprenant.js";
import { authenticateAdmin, requirePermission, authenticateApprenant } from "../middlewares/requireAdmin.js";
import { logAudit } from "../middlewares/logAudit.js";
import { photoValide } from "../utils/photoUrl.js";
import { creerAccesApprenantCore } from "./apprenants.js";
import { attribuerPoints, verifierBadges } from "../services/gamificationDash.js";
import { estDelegueSurGroupe, groupesDeleguesA, refuserSiTitulaireDelegue } from "../services/delegations.js";
import { notifyRole, notifyUser, ROLES_SUPERVISION_GLOBALE, notifyDeputiesDuCoach } from "../services/notifyRole.js";
import { bloquerAcces } from "../services/blocageAcces.js";
import { suspendrePlan, reprendrePlan, periodeDe } from "../services/planPaiement.js";
import { envoyerEmailPublication } from "../services/emailPublication.js";
import { staffDesClasses, resolveAssistanteUserId } from "../services/staffDesClasses.js";

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  // Un serveur ne detient pas de session : sans ces options, le client garde en memoire
  // celle du dernier connecte et lance un rafraichissement de fond. Voir config/supabase.js.
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

// groupes.js est un module dash-only (voir en-tête de fichier / audit plateforme de cette
// session) - source taguée "dash", pas "bet-elearning" (corrigé : ces notifications
// n'apparaissaient jamais dans le flux filtré de dash, seulement dans celui de bet-elearning).
async function sendNotif(userId, notif) {
  if (!userId) return;
  try {
    await supabase.from("notifications").insert({
      user_id: userId,
      type:    notif.type    || "info",
      titre:   notif.titre   || "",
      message: notif.message || "",
      lu:      false,
      meta:    notif.meta    || null,
      source:  'dash',
    });
  } catch (e) {
    console.warn("[groupes] Notification Supabase échouée:", e.message);
  }
}

// assistantes.utilisateur_id n'existe pas en base (jamais migrée) - le lien vers utilisateurs
// se fait par email. Résout l'id utilisateurs correspondant à l'email d'une assistante.
// Résout le user_id du compte parent (rôle "parent") lié à une ligne groupes_apprenants,
// via l'assignation d'origine (email_parent / telephone_parent) - même logique de
// rattachement que authParentEnfant côté apprenants.js. Retourne null si le profil n'est
// pas "enfant" ou si aucun compte parent n'existe encore pour cet email/téléphone.
export async function resolveParentUserId(ga) {
  // Priorité au lien direct posé dans groupes_apprenants.note à la création du dossier
  // ({assignation_id}) - comparer prospect_email (email du PARENT) à email_apprenant (email
  // technique de l'ENFANT) ne matche jamais : ce sont deux emails différents par construction
  // pour un profil enfant. Ce bug faisait que le parent n'était JAMAIS notifié (ex : partage
  // d'une ressource par le coach), silencieusement, sans erreur visible.
  let assignRow = null;
  let assignationIdDeNote = null;
  try { assignationIdDeNote = JSON.parse(ga?.note || "{}").assignation_id || null; } catch {}
  if (assignationIdDeNote) {
    const { data } = await supabase
      .from("assignations_parcours")
      .select("email_parent, telephone_parent, profil_type")
      .eq("id", assignationIdDeNote)
      .maybeSingle();
    assignRow = data || null;
  }
  if (!assignRow && ga?.email_apprenant) {
    const { data } = await supabase
      .from("assignations_parcours")
      .select("email_parent, telephone_parent, profil_type")
      .ilike("prospect_email", ga.email_apprenant)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    assignRow = data || null;
  }
  if (!assignRow || assignRow.profil_type !== "enfant") return null;

  if (assignRow.email_parent) {
    const { data: u } = await supabase
      .from("utilisateurs").select("id").ilike("email", assignRow.email_parent).eq("role", "parent").maybeSingle();
    if (u?.id) return u.id;
  }
  if (assignRow.telephone_parent) {
    const digits = String(assignRow.telephone_parent).replace(/\D/g, "").replace(/^00/, "");
    const { data: candidats } = await supabase
      .from("utilisateurs").select("id, telephone").eq("role", "parent").not("telephone", "is", null);
    const match = (candidats || []).find(x => String(x.telephone || "").replace(/\D/g, "").replace(/^00/, "") === digits);
    if (match) return match.id;
  }
  return null;
}

// Résout coach_id (peut être utilisateurs.id ou coachs.id) vers le vrai utilisateurs.id
async function resolveCoachUserId(coachId) {
  if (!coachId) return null;
  // 1. Vérifier directement dans utilisateurs
  const { data: u } = await supabase
    .from("utilisateurs").select("id").eq("id", coachId).maybeSingle();
  if (u) return u.id;
  // 2. Fallback : le coach est display-only (table coachs) - retrouver via email
  const { data: c } = await supabase
    .from("coachs").select("email_professionnel").eq("id", coachId).maybeSingle();
  if (c?.email_professionnel) {
    const { data: byEmail } = await supabase
      .from("utilisateurs").select("id").ilike("email", c.email_professionnel).maybeSingle();
    if (byEmail) return byEmail.id;
  }
  return null;
}

// Vérifie si un apprenant a atteint 4 absences et le suspend automatiquement
async function checkAutoSuspension(gaId, declencheurId) {
  try {
    const { data: ga } = await supabase
      .from("groupes_apprenants")
      .select("*, groupes(nom, coach_id)")
      .eq("id", gaId)
      .single();
    if (!ga?.apprenant_id) return;

    // Déjà suspendu ? ne rien faire
    const { data: authData } = await supabase.auth.admin.getUserById(ga.apprenant_id);
    if (authData?.user?.app_metadata?.acces_bloque) return;

    // Compter les absences depuis le dernier reset (réintégration) - sur TOUTES les classes
    // actives de l'apprenant, pas seulement celle-ci (gaId) : un apprenant inscrit à
    // plusieurs classes peut atteindre 4 absences cumulées réparties entre elles (ex: 2+2)
    // sans jamais atteindre 4 sur une seule - le compteur affiché côté commerciale
    // (GET /apprenants/acces-status, même agrégation) disait alors "bloqué" alors que
    // acces_bloque restait à false ici, faute de compter le bon périmètre.
    /* LES ABSENCES SUIVENT LA PERSONNE, PAS L'INSCRIPTION. `transfere` était exclu de ce
       filtre : un transfert de classe fermant l'ancienne ligne, les absences qui y étaient
       rattachées cessaient d'être comptées. Un apprenant à trois absences sur quatre
       repartait donc de zéro en changeant de classe - sans décision de personne, par simple
       effet de bord du transfert.
       Le pardon a déjà son levier explicite, `absences_reset_at`, posé à la réintégration.
       En garder un second, implicite, rendait la règle imprévisible. */
    const resetAt = authData?.user?.app_metadata?.absences_reset_at;
    const { data: gasApprenant } = await supabase
      .from("groupes_apprenants")
      .select("id")
      .eq("apprenant_id", ga.apprenant_id)
      .in("statut", ["actif", "periode_test", "transfere", "archive", "retire"]);
    const gaIdsApprenant = (gasApprenant || []).map(g => g.id);
    if (!gaIdsApprenant.length) return;

    let q = supabase
      .from("groupes_presences")
      .select("id", { count: "exact", head: true })
      .in("ga_id", gaIdsApprenant)
      .eq("statut", "absent");
    if (resetAt) q = q.gte("created_at", resetAt);
    const { count } = await q;

    if (!count || count < 4) return;

    const nomComplet = `${ga.prenom_apprenant || ""} ${ga.nom_apprenant || ""}`.trim();
    const nomGroupe  = ga.groupes?.nom || ga.groupe_id;

    // Suspendre - via le service commun, qui consigne le motif lisible par l'apprenant
    // sur la page de connexion et le lui envoie par email. Sans cela il se heurtait a un
    // « contactez votre assistante » sans savoir que 4 absences en etaient la cause.
    await bloquerAcces({
      apprenantId: ga.apprenant_id,
      motif:       "absences_repetees",
      contexte:    { nb: count, groupe: nomGroupe },
    });
    logAudit({
      acteur_id:   declencheurId || null,
      acteur_role: "system",
      plateforme:  "dash",
      action_type: "APPRENANT_SUSPENDU_AUTO",
      module:      "presences",
      entite_type: "user",
      entite_id:   ga.apprenant_id,
      detail:      `Suspension automatique de ${nomComplet} - ${count} absences dans "${nomGroupe}"`,
      statut:      "success",
    }).catch(() => {});

    // Notifier la commerciale
    if (ga.email_apprenant) {
      const { data: assignation } = await supabase
        .from("assignations_parcours")
        .select("assistantes(email)")
        .eq("prospect_email", ga.email_apprenant)
        .maybeSingle();
      const assistanteUserId = await resolveAssistanteUserId(assignation?.assistantes?.email);
      if (assistanteUserId) {
        await sendNotif(assistanteUserId, {
          type:    "absence_repetee",
          titre:   `🔒 Suspension automatique - ${nomComplet}`,
          message: `${nomComplet} a atteint ${count} absences dans le groupe "${nomGroupe}". Son accès a été automatiquement bloqué. Veuillez le contacter.`,
          meta:    { ga_id: gaId, apprenant_id: ga.apprenant_id, groupe: nomGroupe, nb_absences: count },
        });
      }
    }

    // Notifier le PA (added_by)
    if (ga.added_by) {
      await sendNotif(ga.added_by, {
        type:    "absence_repetee",
        titre:   `🔒 Suspension automatique - ${nomComplet}`,
        message: `${nomComplet} a atteint ${count} absences dans le groupe "${nomGroupe}". Son accès a été automatiquement bloqué. Veuillez le contacter.`,
        meta:    { ga_id: gaId, apprenant_id: ga.apprenant_id, groupe: nomGroupe, nb_absences: count },
      });
    }

    // Notifier le coach du groupe
    const coachId = ga.groupes?.coach_id;
    if (coachId) {
      const coachUserId = await resolveCoachUserId(coachId);
      if (coachUserId) await sendNotif(coachUserId, {
        type:    "absence_repetee",
        titre:   `🔒 Apprenant bloqué - ${nomComplet}`,
        message: `${nomComplet} a atteint ${count} absences dans votre groupe "${nomGroupe}". Son accès a été automatiquement bloqué et ne figurera plus dans vos listes de présences.`,
        meta:    { ga_id: gaId, apprenant_id: ga.apprenant_id, groupe: nomGroupe, nb_absences: count },
      });
    }

    console.log(`[auto-suspension] ${nomComplet} bloqué après ${count} absences dans "${nomGroupe}"`);
  } catch (e) {
    console.error("[auto-suspension] erreur:", e.message);
  }
}

// notifyRole est désormais importé depuis services/notifyRole.js - la version locale qui
// existait ici interrogeait directement la table `utilisateurs` par rôle, ce qui ne
// trouvait jamais les rôles auth-only (super_admin, admin_superviseur, admin_pa_advisor,
// admin_deputy_superviseur - absents de cette table, vivant uniquement dans app_metadata
// Supabase Auth). Les 10 appels de ce fichier qui ciblaient ces rôles (dont la suspension
// définitive de coach) ne notifiaient donc jamais personne pour ces destinataires, sans
// aucune erreur visible.

// Notifie apprenants + commerciale/onboarding/PA advisor lors de la publication d'une évaluation
/**
 * Prévient d'une évaluation publiée, et l'envoie par email si le coach l'a demandé.
 *
 * Une évaluation a une ÉCHÉANCE : la manquer a une conséquence, là où manquer un contenu
 * de médiathèque ne fait que retarder une lecture. C'est donc ici que l'email compte le
 * plus - d'où la date limite portée dans le message, et pas seulement le titre.
 *
 * `envoyerEmail` est le choix du coach au moment de publier ; le service garantit de son
 * côté qu'un seul envoi part par évaluation, quelles que soient les republications.
 */
async function notifyEvalPublished(groupeId, evalData, envoyerEmail = false, acteurId = null) {
  try {
    const label = evalData.categorie === "examen" ? "Examen" : evalData.categorie === "devoir" ? "Devoir" : "Évaluation";
    const titre = evalData.titre || "Nouvelle évaluation";
    const meta  = { evaluation_id: evalData.id, groupe_id: groupeId };

    // 1. Apprenants actifs du groupe
    const { data: gas } = await supabase
      .from("groupes_apprenants")
      .select("apprenant_id, email_apprenant")
      .eq("groupe_id", groupeId)
      .eq("statut", "actif");

    const apprenantIds = [];
    const emails = [];
    for (const ga of (gas || [])) {
      if (ga.apprenant_id) apprenantIds.push(ga.apprenant_id);
      else if (ga.email_apprenant) emails.push(ga.email_apprenant);
    }
    for (const email of emails) {
      const { data: u } = await supabase.from("utilisateurs").select("id").ilike("email", email).maybeSingle();
      if (u?.id) apprenantIds.push(u.id);
    }
    if (apprenantIds.length) {
      await supabase.from("notifications").insert(apprenantIds.map(uid => ({
        user_id: uid,
        type: "evaluation",
        titre: `📝 ${label} disponible`,
        message: `"${titre}" est maintenant disponible dans votre espace.`,
        lu: false, meta, source: 'bet-elearning',
      })));
    }

    // 2. L'assistante qui suit chaque apprenant, et le créateur du groupe - même
    //    résolution que la publication de contenu, désormais partagée. L'ancienne version
    //    interrogeait la base une fois PAR apprenant.
    const staffIds = new Set(await staffDesClasses([groupeId]));
    if (staffIds.size) {
      // source:"dash" indispensable - la cloche du dashboard staff (useNotifications.js)
      // filtre strictement source=dash ; "bet-elearning" (mis ici par erreur, ce champ est
      // destiné aux notifs apprenant) rendait cette notification invisible pour la
      // commerciale/onboarding malgré une insertion réussie en base.
      await supabase.from("notifications").insert([...staffIds].map(uid => ({
        user_id: uid,
        type: "evaluation",
        titre: `📝 ${label} publié(e)`,
        message: `Le coach a publié "${titre}" pour un groupe.`,
        lu: false, meta, source: 'dash',
      })));
    }

    // 3. Tous les PA advisors
    await notifyRole(["pedagogical_advisor", "admin_pa_advisor", ...ROLES_SUPERVISION_GLOBALE], {
      type: "evaluation",
      titre: `📝 ${label} publié(e)`,
      message: `"${titre}" a été publié(e) par un coach.`,
      meta,
      source: "dash",
    });
    if (envoyerEmail) {
      const echeance = evalData.date_evaluation
        ? new Date(evalData.date_evaluation).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" })
        : null;
      await envoyerEmailPublication({
        ressourceType: "evaluation",
        ressourceId: evalData.id,
        titre: `📝 ${label} : ${titre}`,
        message: `Votre formateur a publié ${label.toLowerCase()} « ${titre} ».`
          + (echeance ? `\n\n📅 À rendre pour le ${echeance}.` : "")
          + `\n\nConnectez-vous à votre espace pour en prendre connaissance.`,
        groupeIds: [groupeId],
        acteurId,
      });
    }
  } catch (e) {
    console.warn("[groupes] notifyEvalPublished échouée:", e.message);
  }
}

/* ══════════════════════════════════════════════════════════════
   GET /api/groupes          - liste (filtrable par coach_id, statut)
   GET /api/groupes/:id      - détail avec apprenants
══════════════════════════════════════════════════════════════ */
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    const { coach_id, statut, centre_id, commercial_email } = req.query;
    let q = supabase.from("groupes").select("*").order("created_at", { ascending: false });
    if (coach_id)  q = q.eq("coach_id", coach_id);
    if (statut)    q = q.eq("statut", statut);
    if (centre_id) q = q.eq("centre_id", centre_id);
    if (req.query.niveau) q = q.eq("niveau", req.query.niveau);

    // Coach ne voit que ses groupes - élargi aux groupes qui lui sont délégués (remplacement
    // en cours), sans quoi un remplaçant assigné ne verrait jamais le groupe qu'il doit couvrir.
    if (req.role === "coach") {
      const groupeIdsDelegues = await groupesDeleguesA(req.profil.id);
      q = groupeIdsDelegues.length
        ? q.or(`coach_id.eq.${req.profil.id},id.in.(${groupeIdsDelegues.join(",")})`)
        : q.eq("coach_id", req.profil.id);
    }

    const { data, error } = await q;
    if (error) throw error;

    // Compter les apprenants actifs pour chaque groupe
    const ids = (data || []).map(g => g.id);
    let counts = {};
    if (ids.length) {
      const { data: cnt } = await supabase
        .from("groupes_apprenants")
        .select("groupe_id")
        .in("groupe_id", ids)
        .eq("statut", "actif");
      (cnt || []).forEach(r => { counts[r.groupe_id] = (counts[r.groupe_id] || 0) + 1; });
    }

    // Séances par classe - comptées depuis la table `seances`, seule source réelle.
    //
    // `groupes` ne porte AUCUNE colonne de séances : les écrans qui lisaient
    // `nb_seances_realisees` ou `nb_seances` (l'onglet Honoraires du superviseur, notamment)
    // trouvaient `undefined` et affichaient zéro partout - donc zéro honoraire, pour un coach
    // qui avait bel et bien donné ses cours.
    let seancesParGroupe = {};
    if (ids.length) {
      const { data: seancesGroupes } = await supabase
        .from("seances")
        .select("groupe_id, statut, duree_h, honoraire_montant, honoraire_statut")
        .in("groupe_id", ids)
        .neq("statut", "corbeille");
      for (const sg of seancesGroupes || []) {
        const e = (seancesParGroupe[sg.groupe_id] ??= {
          total: 0, realisees: 0, heures: 0,
          montant_estime: 0, montant_valide: 0,
          nb_valide: 0, nb_en_attente: 0, nb_rejete: 0,
        });
        e.total++;
        if (sg.statut === "realisee" || sg.statut === "terminee") {
          e.realisees++;
          e.heures += parseFloat(sg.duree_h) || 0;
          const m = Number(sg.honoraire_montant) || 0;
          // Le montant calculé à la clôture n'est qu'une ESTIMATION : c'est le conseil
          // pédagogique qui valide ou rejette chaque séance, et seul un honoraire validé
          // est dû. Les confondre ferait annoncer au coach une somme qui peut encore
          // être refusée.
          if (sg.honoraire_statut === "rejete") { e.nb_rejete++; }
          else if (sg.honoraire_statut === "valide") { e.nb_valide++; e.montant_valide += m; e.montant_estime += m; }
          else { e.nb_en_attente++; e.montant_estime += m; }
        }
      }
    }

    let groupes = (data || []).map(g => {
      const sg = seancesParGroupe[g.id];
      return {
        ...g,
        nb_apprenants: counts[g.id] || 0,
        nb_seances:            sg?.total     || 0,
        nb_seances_total:      sg?.total     || 0,
        nb_seances_realisees:  sg?.realisees || 0,
        heures_realisees:      Math.round((sg?.heures || 0) * 10) / 10,
        // Estimé : calculé à la clôture, hors séances rejetées. Validé : effectivement dû.
        honoraires_estimes:    Math.round(sg?.montant_estime || 0),
        honoraires_valides:    Math.round(sg?.montant_valide || 0),
        nb_honoraires_valides:    sg?.nb_valide     || 0,
        nb_honoraires_en_attente: sg?.nb_en_attente || 0,
        nb_honoraires_rejetes:    sg?.nb_rejete     || 0,
      };
    });

    // Enrichir avec le nom du coach (utilisateurs + coachs display-only)
    const coachIds = [...new Set(groupes.map(g => g.coach_id).filter(Boolean))];
    let coachMap = {};
    if (coachIds.length) {
      // 1. Chercher dans utilisateurs (coachs avec compte auth)
      // avatar_url manquait ici - la liste des classes (contrairement à GET /:id, qui l'a
      // déjà) ne renvoyait donc jamais la photo du coach, qui retombait systématiquement
      // sur les initiales côté Commercial et PA Advisor.
      const { data: coaches } = await supabase
        .from("utilisateurs")
        .select("id,nom,prenom,email,telephone,avatar_url")
        .in("id", coachIds);
      (coaches || []).forEach(c => {
        coachMap[c.id] = {
          coach_nom:       `${c.prenom||""} ${c.nom||""}`.trim(),
          coach_email:     c.email     || null,
          coach_telephone: c.telephone || null,
          coach_photo_url: c.avatar_url || null,
        };
      });
      // 2. Pour les IDs non trouvés, chercher dans coachs (display-only)
      const manquants = coachIds.filter(id => !coachMap[id]);
      if (manquants.length) {
        const { data: displayCoachs } = await supabase
          .from("coachs")
          .select("id,nom,prenom,email_professionnel,photo_url")
          .in("id", manquants);
        (displayCoachs || []).forEach(c => {
          coachMap[c.id] = {
            coach_nom:   `${c.prenom||""} ${c.nom||""}`.trim(),
            coach_email: c.email_professionnel || null,
            coach_telephone: null,
            coach_photo_url: c.photo_url || null,
          };
        });
      }
    }

    // Enrichir avec le nom du centre
    const centreIds = [...new Set(groupes.map(g => g.centre_id).filter(Boolean))];
    let centreMap = {};
    if (centreIds.length) {
      const { data: centres } = await supabase
        .from("centres")
        .select("id,nom,ville")
        .in("id", centreIds);
      (centres || []).forEach(c => { centreMap[c.id] = { centre_nom: c.nom, centre_ville: c.ville }; });
    }

    // Enrichir avec les infos du créateur (onboarding / commercial)
    const creatorIds = [...new Set(groupes.map(g => g.created_by).filter(Boolean))];
    let creatorMap = {};
    // groupe_id -> { assistante_id: {...} } - assistantes réelles des apprenants du groupe.
    let assistantesParGroupe = {};
    if (creatorIds.length) {
      const { data: creators } = await supabase
        .from("utilisateurs")
        .select("id,nom,prenom,email,telephone,role")
        .in("id", creatorIds);
      (creators || []).forEach(u => {
        creatorMap[u.id] = {
          created_by_nom:           `${u.prenom||""} ${u.nom||""}`.trim(),
          created_by_role:          u.role || null,
          created_by_email:         u.email || null,
          created_by_telephone:     u.telephone || null,
          created_by_utilisateur_id: u.id,
          created_by_photo:         null,
        };
      });
      // Photo depuis assistantes (pour les commerciales qui sont aussi dans assistantes)
      // assistantes.utilisateur_id n'existe pas en base : on relie par email.
      const creatorEmailToId = {};
      (creators || []).forEach(u => { if (u.email) creatorEmailToId[u.email.toLowerCase()] = u.id; });
      const creatorEmails = Object.keys(creatorEmailToId);
      if (creatorEmails.length) {
        const { data: assPhotos } = await supabase
          .from("assistantes")
          .select("email,photo_url,telephone")
          .in("email", creatorEmails);
        (assPhotos || []).forEach(a => {
          const uid = creatorEmailToId[(a.email || "").toLowerCase()];
          if (uid && creatorMap[uid]) {
            creatorMap[uid].created_by_photo = a.photo_url || null;
            if (!creatorMap[uid].created_by_telephone && a.telephone)
              creatorMap[uid].created_by_telephone = a.telephone;
          }
        });
      }
      /* Assistante(s) commerciale(s) du groupe - déduites des DOSSIERS de ses apprenants,
         et non plus du compte ayant créé la classe.
         L'ancienne version rattachait à chaque classe toutes les commerciales de son
         créateur. Sur un import lancé par une onboarding, les dix classes privées créées
         portaient donc la même liste, alors que chaque apprenant relevait bien d'une
         assistante différente : l'écran du conseiller pédagogique les attribuait toutes
         à la même personne. Le lien fiable est le dossier de l'apprenant, via
         assignation_id posé dans `note` à l'inscription - replié sur l'email quand ce
         lien manque (anciennes lignes). */
      {
        const idsGroupes = groupes.map(g => g.id);
        const { data: inscrits } = idsGroupes.length
          ? await supabase.from("groupes_apprenants")
              .select("groupe_id, email_apprenant, note").in("groupe_id", idsGroupes).neq("statut", "retire")
          : { data: [] };

        const assignIds = [], emailsAppr = [];
        (inscrits || []).forEach(r => {
          let aid = null;
          try { aid = JSON.parse(r.note || "{}").assignation_id || null; } catch {}
          if (aid) assignIds.push(aid);
          else if (r.email_apprenant) emailsAppr.push(r.email_apprenant);
        });

        let dossiers = [];
        if (assignIds.length) {
          const { data } = await supabase.from("assignations_parcours")
            .select("id, prospect_email, assistante_id, assistantes(id,nom,prenom,email,telephone,photo_url,type_cours)")
            .in("id", [...new Set(assignIds)]);
          dossiers = dossiers.concat(data || []);
        }
        if (emailsAppr.length) {
          const { data } = await supabase.from("assignations_parcours")
            .select("id, prospect_email, assistante_id, assistantes(id,nom,prenom,email,telephone,photo_url,type_cours)")
            .in("prospect_email", [...new Set(emailsAppr)]);
          dossiers = dossiers.concat(data || []);
        }
        const dossierParId    = Object.fromEntries(dossiers.map(d => [d.id, d]));
        const dossierParEmail = Object.fromEntries(dossiers.filter(d => d.prospect_email).map(d => [d.prospect_email.toLowerCase(), d]));

        // Résoudre le compte utilisateur des assistantes, pour que le bouton de discussion
        // reste utilisable depuis la fiche du groupe.
        const emailsAss = [...new Set(dossiers.map(d => d.assistantes?.email).filter(Boolean))];
        let assEmailToUserId = {};
        if (emailsAss.length) {
          const { data: assUsers } = await supabase.from("utilisateurs").select("id,email").in("email", emailsAss);
          (assUsers || []).forEach(u => { if (u.email) assEmailToUserId[u.email.toLowerCase()] = u.id; });
        }

        assistantesParGroupe = {};
        (inscrits || []).forEach(r => {
          let aid = null;
          try { aid = JSON.parse(r.note || "{}").assignation_id || null; } catch {}
          const dossier = aid ? dossierParId[aid] : dossierParEmail[(r.email_apprenant || "").toLowerCase()];
          const a = dossier?.assistantes;
          if (!a) return;
          assistantesParGroupe[r.groupe_id] = assistantesParGroupe[r.groupe_id] || {};
          assistantesParGroupe[r.groupe_id][a.id] = {
            id:             a.id,
            nom:            `${a.prenom || ""} ${a.nom || ""}`.trim(),
            email:          a.email || null,
            telephone:      a.telephone || null,
            photo_url:      a.photo_url || null,
            type_cours:     a.type_cours || null,
            utilisateur_id: assEmailToUserId[(a.email || "").toLowerCase()] || null,
          };
        });
      }
    }

    groupes = groupes.map(g => ({
      ...g,
      ...(g.coach_id   ? coachMap[g.coach_id]    || {} : {}),
      ...(g.centre_id  ? centreMap[g.centre_id]  || {} : {}),
      ...(g.created_by ? creatorMap[g.created_by] || {} : {}),
      // Écrase toute valeur héritée du créateur : seules comptent les assistantes
      // réellement en charge des apprenants de CE groupe.
      assistantes_commerciales: Object.values(assistantesParGroupe[g.id] || {}),
    }));

    // Restriction onboarding : groupes créés par l'onboarding/commerciale OU contenant leurs apprenants.
    // Ne s'applique pas quand coach_id est fourni : dans ce cas l'appelant consulte le profil
    // complet d'UN coach précis (ex. Coachs → détail coach → Classes) et doit voir toutes ses
    // classes, pas seulement celles issues du propre périmètre de l'onboarding connecté -
    // sans quoi le compte affiché divergeait de celui (non filtré) de la liste des coachs.
    if ((req.role === "onboarding" || commercial_email) && !coach_id) {
      const onboardingUserId = req.profil?.id || req.user?.id;
      const estOnboardingGlobal = req.role === "onboarding" && req.profil?.onboarding_vue_globale === true;
      let assistanteIds = [];
      // Onboarding global : réunit le périmètre de TOUS les comptes onboarding (leurs
      // groupes créés + leurs commerciales en ligne) - jamais "tout, sans filtre" (ce qui
      // remontait aussi les classes centre/présentiel gérées par d'autres rôles).
      let onboardingScopeIds = onboardingUserId ? [onboardingUserId] : [];
      if (estOnboardingGlobal) {
        const { data: obUsers } = await supabase.from("utilisateurs").select("id").eq("role", "onboarding");
        onboardingScopeIds = (obUsers || []).map(u => u.id);
      }
      // Toujours inclure le(s) onboarding comme créateur(s) autorisé(s)
      const allowedCreatorIds = new Set(onboardingScopeIds);

      // La colonne assistantes.utilisateur_id n'existe pas dans cette base (jamais migrée) -
      // toute requête qui la sélectionne échoue silencieusement, ce qui vidait entièrement
      // ce filtre pour une assistante commerciale (assistanteIds restait vide, aucune de ses
      // classes n'était jamais retrouvée). On résout son utilisateur_id séparément, par email.
      if (commercial_email) {
        const { data: ass } = await supabase
          .from("assistantes").select("id").eq("email", commercial_email).maybeSingle();
        if (ass?.id) assistanteIds = [ass.id];
        const { data: userRow } = await supabase
          .from("utilisateurs").select("id").ilike("email", commercial_email).maybeSingle();
        if (userRow?.id) allowedCreatorIds.add(userRow.id);
      } else if (req.role === "onboarding" && onboardingScopeIds.length) {
        // Résoudre les commerciales de ce(s) onboarding (colonne onboarding_id peut ne pas exister)
        // - jamais les assistantes centre (présentiel), qui n'ont rien à voir avec l'onboarding.
        const { data: assRows, error: assErr } = await supabase
          .from("assistantes").select("id, type_cours").in("onboarding_id", onboardingScopeIds);
        if (!assErr && assRows) assistanteIds = assRows.filter(a => a.type_cours !== "presentiel").map(a => a.id);
        // Si migration pas encore jouée : continuer avec juste l'onboarding comme créateur autorisé
      }

      // Groupes créés par l'onboarding ou la commerciale (même vides)
      const groupesCreatedByAllowed = new Set(
        groupes.filter(g => allowedCreatorIds.has(g.created_by)).map(g => g.id)
      );

      // Groupes contenant au moins un apprenant de cette assistante/cet onboarding.
      // Pour une commerciale (commercial_email) : ses propres apprenants, via assistante_id -
      // direct et fiable, jamais besoin de passer par onboarding_id (qui ne la concerne pas).
      // Pour un onboarding : priorité à onboarding_id (figé, stable même si la commerciale
      // change), repli sur assistante_id si la colonne n'existe pas encore.
      let groupesAvecApprenant = new Set();
      {
        let assignations = [];
        if (commercial_email) {
          if (assistanteIds.length > 0) {
            const { data: rows } = await supabase
              .from("assignations_parcours")
              .select("id, prospect_email")
              .in("assistante_id", assistanteIds);
            assignations = rows || [];
          }
        } else {
          const { data: assignationsDirect, error: adErr } = await supabase
            .from("assignations_parcours")
            .select("id, prospect_email")
            .in("onboarding_id", onboardingScopeIds);
          if (!adErr) {
            assignations = assignationsDirect || [];
          } else if (assistanteIds.length > 0) {
            // Fallback si onboarding_id n'existe pas encore
            const { data: assignationsFallback } = await supabase
              .from("assignations_parcours")
              .select("id, prospect_email")
              .in("assistante_id", assistanteIds);
            assignations = assignationsFallback || [];
          }
        }
        const emailsAutorisés = new Set(assignations.map(a => (a.prospect_email || "").toLowerCase()).filter(Boolean));
        const idsAutorises = new Set(assignations.map(a => a.id));
        if (emailsAutorisés.size > 0 || idsAutorises.size > 0) {
          const { data: gaRows } = await supabase
            .from("groupes_apprenants")
            .select("groupe_id, email_apprenant, note")
            .in("groupe_id", ids)
            .neq("statut", "retire");
          groupesAvecApprenant = new Set(
            (gaRows || []).filter(r => {
              if (emailsAutorisés.has((r.email_apprenant || "").toLowerCase())) return true;
              // Lien fiable posé dans `note` à la création - indispensable pour un profil
              // enfant, où email_apprenant est un identifiant technique qui ne correspondra
              // jamais à prospect_email (celui du parent).
              try { return idsAutorises.has(JSON.parse(r.note || "{}").assignation_id); } catch { return false; }
            }).map(r => r.groupe_id)
          );
        }
      }

      groupes = groupes.filter(g => groupesCreatedByAllowed.has(g.id) || groupesAvecApprenant.has(g.id));
    }

    res.json({ groupes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur récupération groupes" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/groupes/apprenants - tous les apprenants de tous les groupes (vue plate)
   DOIT être déclaré AVANT /:id
══════════════════════════════════════════════════════════════ */
router.get("/apprenants", authenticateAdmin, async (req, res) => {
  try {
    // Récupérer les groupes visibles par cet utilisateur
    // created_by est indispensable au filtre "groupesOnboarding" plus bas (ligne ~617) - sans
    // lui dans ce select, g.created_by valait toujours undefined et ce filtre ne matchait
    // jamais aucun groupe, même ceux créés par l'onboarding elle-même (typiquement les classes
    // de coaching privé) : ils ne restaient visibles que via le fallback emails_autorisés
    // (assignations_parcours.onboarding_id), lui-même peu fiable pour ce parcours-là - d'où
    // l'apprenant qui disparaissait de "Mes apprenants" dès que ce fallback ne matchait pas.
    let groupeQuery = supabase.from("groupes").select("id,nom,filiere,niveau,type_cours,statut,coach_id,centre_id,is_prive,capacite_max,created_by");
    if (req.role === "coach") {
      const groupeIdsDelegues = await groupesDeleguesA(req.profil.id);
      groupeQuery = groupeIdsDelegues.length
        ? groupeQuery.or(`coach_id.eq.${req.profil.id},id.in.(${groupeIdsDelegues.join(",")})`)
        : groupeQuery.eq("coach_id", req.profil.id);
    }
    // Utilisé par la commerciale centre (présentiel) pour ne voir que les apprenants de son propre centre.
    if (req.query.centre_id) groupeQuery = groupeQuery.eq("centre_id", req.query.centre_id);
    const { data: groupes } = await groupeQuery;

    if (!groupes || groupes.length === 0) return res.json({ apprenants: [] });

    const groupeIds = groupes.map(g => g.id);
    const groupeMap = Object.fromEntries(groupes.map(g => [g.id, g]));

    // Récupérer tous les apprenants de ces groupes
    const { data: gas, error } = await supabase
      .from("groupes_apprenants")
      .select("*")
      .in("groupe_id", groupeIds)
      .neq("statut", "retire")
      .neq("statut", "transfere")
      .order("date_ajout", { ascending: false });
    if (error) throw error;

    // Filtre onboarding : apprenants des groupes créés par l'onboarding + ceux de sa commerciale
    let emailsAutorisés = null;
    let groupesOnboarding = null; // groupe_ids créés par l'onboarding elle-même
    const commercialEmail = req.query.commercial_email;

    if (req.role === "onboarding" || commercialEmail) {
      const onboardingUserId = req.profil?.id || req.user?.id;
      const estOnboardingGlobal = req.role === "onboarding" && req.profil?.onboarding_vue_globale === true;
      let assistanteIds = [];
      // Onboarding global : réunit le périmètre de TOUS les comptes onboarding - jamais
      // "tout, sans filtre" (ce qui remontait aussi les apprenants du présentiel/coaching
      // privé géré par d'autres rôles).
      let onboardingScopeIds = onboardingUserId ? [onboardingUserId] : [];
      if (estOnboardingGlobal) {
        const { data: obUsers } = await supabase.from("utilisateurs").select("id").eq("role", "onboarding");
        onboardingScopeIds = (obUsers || []).map(u => u.id);
      }

      if (commercialEmail) {
        const { data: ass } = await supabase
          .from("assistantes").select("id").eq("email", commercialEmail).maybeSingle();
        if (ass?.id) assistanteIds = [ass.id];
      } else if (req.role === "onboarding" && onboardingScopeIds.length) {
        // Jamais les assistantes centre (présentiel) - hors périmètre onboarding.
        const { data: assRows, error: assErr } = await supabase
          .from("assistantes").select("id, type_cours").in("onboarding_id", onboardingScopeIds);
        if (!assErr && assRows) assistanteIds = assRows.filter(a => a.type_cours !== "presentiel").map(a => a.id);
      }

      // Groupes créés par l'onboarding (ou par n'importe quel onboarding, en mode global)
      // → tous leurs apprenants sont autorisés
      if (onboardingScopeIds.length) {
        const scopeSet = new Set(onboardingScopeIds);
        groupesOnboarding = new Set(groupes.filter(g => scopeSet.has(g.created_by)).map(g => g.id));
      }

      // Emails autorisés : priorité onboarding_id figé, fallback assistante_id
      {
        const { data: assignationsDirect, error: adErr } = await supabase
          .from("assignations_parcours")
          .select("prospect_email")
          .in("onboarding_id", onboardingScopeIds);
        if (!adErr) {
          emailsAutorisés = new Set((assignationsDirect || []).map(a => (a.prospect_email || "").toLowerCase()).filter(Boolean));
        } else if (assistanteIds.length > 0) {
          const { data: assignationsFb } = await supabase
            .from("assignations_parcours")
            .select("prospect_email")
            .in("assistante_id", assistanteIds);
          emailsAutorisés = new Set((assignationsFb || []).map(a => (a.prospect_email || "").toLowerCase()).filter(Boolean));
        } else {
          emailsAutorisés = new Set();
        }
      }
    }

    // Récupérer les noms des coachs (utilisateurs)
    const coachIds = [...new Set(groupes.map(g => g.coach_id).filter(Boolean))];
    let coachMap = {};
    if (coachIds.length) {
      const { data: coaches } = await supabase
        .from("utilisateurs").select("id,nom,prenom").in("id", coachIds);
      (coaches || []).forEach(u => { coachMap[u.id] = `${u.prenom||""} ${u.nom||""}`.trim(); });
    }

    // Récupérer l'assistante commerciale + le nom de l'onboarding (added_by) pour chaque apprenant
    const emails = [...new Set((gas||[]).map(a => a.email_apprenant).filter(Boolean))];
    let commercialMap = {};
    let emailParentMap = {};
    let telephoneParentMap = {};
    let nomParentMap = {};
    let profilTypeMap = {};
    // Paiement réel du coaching privé - vit sur l'assignation d'origine (assignations_parcours),
    // jamais sur groupes_apprenants. Sans ça, un apprenant "privé" affiche toujours "aucun plan
    // / paiement en attente" côté PA, peu importe les versements réellement enregistrés.
    let paiementMap = {};
    if (emails.length) {
      // Chercher aussi en lowercase pour la correspondance
      const emailsLower = emails.map(e => e.toLowerCase());
      const { data: assignations } = await supabase
        .from("assignations_parcours")
        .select("prospect_email, nom_parent, email_parent, telephone_parent, profil_type, montant_paye, plan_paiement, statut_paiement, mode_paiement, inscription_offre, assistantes(id, nom, prenom, telephone, photo_url)")
        .in("prospect_email", emailsLower)
        .order("created_at", { ascending: false });
      (assignations || []).forEach(row => {
        const key = (row.prospect_email || "").toLowerCase();
        if (key && row.assistantes && !commercialMap[key])
          commercialMap[key] = row.assistantes;
        if (key && row.email_parent && !emailParentMap[key])
          emailParentMap[key] = row.email_parent;
        if (key && row.telephone_parent && !telephoneParentMap[key])
          telephoneParentMap[key] = row.telephone_parent;
        if (key && row.nom_parent && !nomParentMap[key])
          nomParentMap[key] = row.nom_parent;
        if (key && row.profil_type && !profilTypeMap[key])
          profilTypeMap[key] = row.profil_type;
        if (key && !paiementMap[key]) {
          paiementMap[key] = {
            montant_paye:     row.montant_paye,
            plan_paiement:    row.plan_paiement,
            statut_paiement:  row.statut_paiement,
            mode_paiement:    row.mode_paiement,
            inscription_offre: row.inscription_offre,
          };
        }
      });
    }

    // Lien direct assignation_id (stocké dans `note` à la création de la classe privée) -
    // indispensable quand prospect_email (le parent, qui remplit le formulaire) diffère de
    // email_apprenant (l'email de connexion propre à l'enfant) : le match par email ci-dessus
    // ne matche alors jamais et parent/paiement restent vides malgré des données bien présentes.
    const assignationIdsNote = [...new Set((gas || []).map(ga => {
      try { return JSON.parse(ga.note || "{}").assignation_id || null; } catch { return null; }
    }).filter(Boolean))];
    let assignationByIdMap = {};
    if (assignationIdsNote.length) {
      const { data: assById } = await supabase
        .from("assignations_parcours")
        .select("id, nom_parent, email_parent, telephone_parent, profil_type, montant_paye, plan_paiement, statut_paiement, mode_paiement, inscription_offre, assistantes(id, nom, prenom, telephone, photo_url)")
        .in("id", assignationIdsNote);
      (assById || []).forEach(row => { assignationByIdMap[row.id] = row; });
    }

    // Résoudre les added_by → noms onboarding
    const addedByIds = [...new Set((gas||[]).map(a => a.added_by).filter(Boolean))];
    let onboardingMap = {};
    if (addedByIds.length) {
      const { data: users } = await supabase
        .from("utilisateurs").select("id,nom,prenom,role").in("id", addedByIds);
      (users || []).forEach(u => { onboardingMap[u.id] = `${u.prenom||""} ${u.nom||""}`.trim(); });
    }

    let apprenants = (gas || []).map(ga => {
      const groupe = groupeMap[ga.groupe_id] || {};
      let noteObj = {};
      try { noteObj = JSON.parse(ga.note || "{}"); } catch {}
      const emailKey = (ga.email_apprenant || "").toLowerCase();
      const byId = noteObj.assignation_id ? assignationByIdMap[noteObj.assignation_id] : null;
      return {
        ...ga,
        groupe_nom:            groupe.nom || "-",
        groupe_filiere:        groupe.filiere || "-",
        groupe_niveau:         groupe.niveau || ga.niveau || "-",
        groupe_type_cours:     groupe.type_cours || "-",
        groupe_statut:         groupe.statut || "-",
        groupe_is_prive:       groupe.is_prive === true,
        groupe_capacite_max:   groupe.capacite_max ?? null,
        coach_id:              groupe.coach_id || null,
        coach_nom:             coachMap[groupe.coach_id] || "-",
        note_obj:              noteObj,
        assistante_nom:        ga.added_by ? (onboardingMap[ga.added_by] || null) : null,
        /* L'IDENTIFIANT DU DOSSIER, sans lequel l'écran ne peut rien écrire dessus. Il
           manquait : l'onboarding voit l'assistante d'un apprenant mais n'avait aucun moyen
           de la changer après une migration de canal - il aurait fallu retrouver le dossier
           par e-mail depuis le navigateur, c'est-à-dire refaire mal ce que le serveur sait. */
        assignation_id:        byId?.id ?? null,
        assistante_commerciale: byId?.assistantes ?? (emailKey ? (commercialMap[emailKey] || null) : null),
        nom_parent:            byId?.nom_parent ?? (emailKey ? (nomParentMap[emailKey] || null) : null),
        email_parent:          byId?.email_parent ?? (emailKey ? (emailParentMap[emailKey] || null) : null),
        telephone_parent:      byId?.telephone_parent ?? (emailKey ? (telephoneParentMap[emailKey] || null) : null),
        profil_type:           byId?.profil_type ?? (emailKey ? (profilTypeMap[emailKey] || null) : null),
        montant_paye:          byId ? (byId.montant_paye ?? null) : (emailKey ? (paiementMap[emailKey]?.montant_paye ?? null) : null),
        plan_paiement:         byId ? (byId.plan_paiement ?? null) : (emailKey ? (paiementMap[emailKey]?.plan_paiement ?? null) : null),
        statut_paiement:       byId ? (byId.statut_paiement ?? null) : (emailKey ? (paiementMap[emailKey]?.statut_paiement ?? null) : null),
        mode_paiement:         byId ? (byId.mode_paiement ?? null) : (emailKey ? (paiementMap[emailKey]?.mode_paiement ?? null) : null),
        inscription_offre:     byId ? (byId.inscription_offre ?? null) : (emailKey ? (paiementMap[emailKey]?.inscription_offre ?? null) : null),
        assignation_id:        noteObj.assignation_id || null,
      };
    });

    // Restriction onboarding : apprenants de la commerciale OU dans un groupe créé par l'onboarding
    if (emailsAutorisés !== null || groupesOnboarding !== null) {
      apprenants = apprenants.filter(a => {
        if (groupesOnboarding && groupesOnboarding.has(a.groupe_id)) return true;
        if (emailsAutorisés && a.email_apprenant && emailsAutorisés.has((a.email_apprenant || "").toLowerCase())) return true;
        return false;
      });
    }

    // Enrichir acces_bloque depuis Auth app_metadata
    const idsAuth = [...new Set(apprenants.map(a => a.apprenant_id).filter(Boolean))];
    let accesBloquéMap = {};
    if (idsAuth.length) {
      const authResults = await Promise.all(
        idsAuth.map(uid =>
          supabase.auth.admin.getUserById(uid)
            .then(({ data }) => ({ id: uid, acces_bloque: data?.user?.app_metadata?.acces_bloque || false }))
            .catch(() => ({ id: uid, acces_bloque: false }))
        )
      );
      authResults.forEach(r => { accesBloquéMap[r.id] = r.acces_bloque; });
    }
    // Photo de l'apprenant - via apprenant_id (compte lié) sinon email_apprenant, même
    // logique que GET /:id : cette vue plate ("Mes apprenants" côté coach/onboarding/PA)
    // n'affichait aucune photo faute d'avatar_url dans la réponse.
    let avatarParApprenantIdFlat = {};
    if (idsAuth.length) {
      const { data: comptesAvatarIdFlat } = await supabase.from("utilisateurs").select("id, avatar_url").in("id", idsAuth);
      (comptesAvatarIdFlat || []).forEach(u => { if (u.avatar_url) avatarParApprenantIdFlat[u.id] = u.avatar_url; });
    }
    let avatarParEmailFlat = {};
    if (emails.length) {
      const { data: comptesAvatarEmailFlat } = await supabase.from("utilisateurs").select("email, avatar_url").in("email", emails);
      (comptesAvatarEmailFlat || []).forEach(u => { if (u.avatar_url) avatarParEmailFlat[(u.email||"").toLowerCase()] = u.avatar_url; });
    }
    apprenants = apprenants.map(a => ({
      ...a,
      acces_bloque: a.apprenant_id ? (accesBloquéMap[a.apprenant_id] || false) : false,
      avatar_url: (a.apprenant_id && avatarParApprenantIdFlat[a.apprenant_id]) || avatarParEmailFlat[(a.email_apprenant||"").toLowerCase()] || null,
    }));

    // Statistiques réelles par apprenant - `groupes_apprenants.note` est un JSON de
    // programme/description (voir `noteObj` plus haut), PAS des statistiques scolaires ; le
    // frontend le lisait comme tel (`noteObj.progression`, `.assiduite`...), ce qui affichait
    // systématiquement 0% partout dans l'onglet "Mes apprenants". Ici : assiduité/absences/
    // retards depuis les vraies feuilles de présence, note/progression depuis les vrais
    // résultats d'évaluation corrigés.
    const gaIds = apprenants.map(a => a.id);
    let statsMap = {};
    if (gaIds.length) {
      const [{ data: presences }, { data: resultats }] = await Promise.all([
        supabase.from("groupes_presences").select("ga_id, statut").in("ga_id", gaIds),
        supabase.from("resultats_evaluations_groupes").select("ga_id, note, note_max, rendu_at").in("ga_id", gaIds).eq("statut", "corrige"),
      ]);
      (presences || []).forEach(p => {
        const s = statsMap[p.ga_id] || (statsMap[p.ga_id] = { present: 0, absent: 0, retard: 0, total: 0, notes: [] });
        s.total++;
        if (p.statut === "present") s.present++;
        else if (p.statut === "absent") s.absent++;
        else if (p.statut === "retard") s.retard++;
      });
      (resultats || []).forEach(r => {
        if (!r.note_max) return;
        const s = statsMap[r.ga_id] || (statsMap[r.ga_id] = { present: 0, absent: 0, retard: 0, total: 0, notes: [] });
        s.notes.push({ pct: (r.note / r.note_max) * 100, note20: (r.note / r.note_max) * 20, at: r.rendu_at });
      });
    }
    apprenants = apprenants.map(a => {
      const s = statsMap[a.id];
      const notesTriees = (s?.notes || []).slice().sort((x, y) => new Date(y.at || 0) - new Date(x.at || 0));
      return {
        ...a,
        assiduite:     s && s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
        absences:      s?.absent || 0,
        retards:       s?.retard || 0,
        progression:   notesTriees.length ? Math.round(notesTriees.reduce((t, n) => t + n.pct, 0) / notesTriees.length) : 0,
        derniere_note: notesTriees.length ? Math.round(notesTriees[0].note20 * 10) / 10 : null,
      };
    });

    res.json({ apprenants });
  } catch (err) {
    console.error("[groupes/apprenants]", err);
    res.status(500).json({ error: "Erreur récupération apprenants" });
  }
});

/* ══════════════════════════════════════════════════════════════
   PATCH /api/groupes/apprenants/:id/suivi
   Suivi de démarrage réel (checklist + notes) d'un apprenant fraîchement
   inscrit - remplace l'ancienne liste mockée du dashboard Onboarding.
   Utilisé aussi par la commerciale centre (présentiel) pour son propre
   suivi, filtré côté frontend sur les apprenants de son centre.
══════════════════════════════════════════════════════════════ */
router.patch("/apprenants/:id/suivi", authenticateAdmin, requirePermission("inscriptions", "update"), async (req, res) => {
  try {
    const { checklist, notes } = req.body;
    const updates = {};
    if (checklist !== undefined) updates.suivi_checklist = checklist;
    if (notes !== undefined)     updates.suivi_notes = notes;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "Rien à mettre à jour" });

    const { data, error } = await supabase
      .from("groupes_apprenants")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;

    res.json({ apprenant: data });
  } catch (err) {
    console.error("[groupes/apprenants/:id/suivi PATCH]", err);
    res.status(500).json({ error: "Erreur mise à jour du suivi" });
  }
});

/* ══════════════════════════════════════════════════════════════
   PATCH /api/groupes/apprenants/:id/arret-formation
   ──────────────────────────────────────────────────────────────
   Declarer qu'un apprenant ARRETE sa formation, ou revenir sur cette declaration.

   Une classe ou des apprenants partent et d'autres arrivent ne se cloture jamais : le
   repere d'acces n'est donc pas la classe mais la periode pendant laquelle l'apprenant y
   etait. `date_retrait` borne cette periode - les contenus publies APRES ne lui sont plus
   servis.

   Jusqu'ici `date_retrait` n'etait ecrite que lors d'un TRANSFERT (2 lignes sur 74) :
   rien ne permettait de dire « celui-ci arrete », et la regle ne se serait jamais
   declenchee.

   Reversible a dessein : un arret declare par erreur doit pouvoir etre annule, sans quoi
   il faudrait recreer le rattachement et l'apprenant perdrait son historique.
══════════════════════════════════════════════════════════════ */
router.patch("/apprenants/:id/arret-formation", authenticateAdmin, requirePermission("inscriptions", "update"), async (req, res) => {
  try {
    const { arrete, motif, date_retrait } = req.body || {};

    /* LE MOTIF EST OBLIGATOIRE POUR ARRÊTER, jamais pour reprendre. Un arrêt sans raison
       laisse un dossier clos que personne ne sait relire six mois plus tard : ni le PA qui
       cherche pourquoi la classe s'est vidée, ni la commerciale qui voudrait rappeler
       l'apprenant. Reprendre, à l'inverse, n'a rien à justifier.
       La règle est posée ici en plus de l'écran : elle vaut pour tout appelant, et c'est
       elle qui garantit que la note d'arrêt ne sera jamais vide en base. */
    if (arrete !== false && !String(motif || "").trim()) {
      return res.status(400).json({ error: "Le motif de l'arrêt de formation est obligatoire." });
    }

    const { data: avant } = await supabase
      .from("groupes_apprenants")
      .select("id, groupe_id, statut, date_ajout, date_retrait, nom_apprenant, prenom_apprenant, email_apprenant, note")
      .eq("id", req.params.id).maybeSingle();
    if (!avant) return res.status(404).json({ error: "Rattachement introuvable" });

    // La date de retrait ne peut pas preceder l'arrivee : la fenetre serait vide et
    // l'apprenant perdrait d'un coup TOUS ses cours, y compris ceux qu'il a suivis.
    const d = date_retrait ? new Date(date_retrait) : new Date();
    if (avant.date_ajout && d < new Date(avant.date_ajout)) {
      return res.status(400).json({ error: "La date d'arrêt ne peut pas précéder la date d'arrivée dans la classe." });
    }

    const maj = arrete === false
      ? { statut: "actif", date_retrait: null }
      : { statut: "retire", date_retrait: d.toISOString() };

    // Le motif vit dans `note`, deja utilisee comme JSON ailleurs sur cette table : pas
    // de colonne supplementaire pour une information consultee a la marge.
    let noteObj = {};
    try { noteObj = JSON.parse(avant.note || "{}"); } catch {}
    if (arrete === false) delete noteObj.arret_formation;
    else noteObj.arret_formation = {
      motif: motif || null,
      date: maj.date_retrait,
      par: `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || null,
    };

    /* ── LES PERIODES DE PRESENCE ─────────────────────────────────────────────
       Une ligne `groupes_apprenants` ne porte qu'UNE fenetre, `date_ajout` → `date_retrait`.
       Reprendre une formation remettait `date_retrait` a null, ce qui RE-OUVRAIT toute la
       periode : un apprenant parti en juillet et revenu en decembre recuperait d'un coup
       les cinq mois de cours publies pendant son absence, comme s'il ne l'avait jamais
       quittee.

       On tient donc la LISTE des periodes ou il etait la. L'absence devient un TROU entre
       deux periodes, et les contenus publies dans ce trou restent fermes - grises, avec
       leur raison, jamais effaces : il doit comprendre ce qu'il a manque.

       `date_ajout` n'est JAMAIS deplacee : c'est la date d'arrivee dans la classe, celle
       qu'affichent l'archive et l'historique. La reprise ouvre une periode, elle ne
       reecrit pas le passe. */
    const periodes = Array.isArray(noteObj.periodes) ? [...noteObj.periodes] : [];
    /* Les lignes anterieures n'ont pas de periodes : on materialise la premiere a partir
       des colonnes, sans quoi la reprise creerait un trou remontant a l'origine des temps.
       ET ON Y EMPORTE LE MOTIF de l'arret en cours : sur un rattachement arrete AVANT ce
       mecanisme, il ne vit que dans `arret_formation`, que la reprise efface deux lignes
       plus bas. Sans cette reprise-ci, la feuille ON BREAK affichait la pause sans jamais
       pouvoir dire pourquoi. */
    if (!periodes.length && avant.date_ajout) {
      let ancien = {};
      try { ancien = JSON.parse(avant.note || "{}").arret_formation || {}; } catch { /* note libre */ }
      periodes.push({
        debut: avant.date_ajout,
        fin:   avant.date_retrait || null,
        ...(avant.date_retrait ? { motif: ancien.motif || null, par: ancien.par || null } : {}),
      });
    }
    const ouverte = periodes.find(p => !p.fin);
    if (arrete === false) {
      // Reprise : une periode deja ouverte signifie qu'il n'etait pas reellement parti -
      // on n'en ouvre pas une seconde, qui ferait compter deux fois la meme presence.
      if (!ouverte) periodes.push({ debut: d.toISOString(), fin: null });
    } else if (ouverte) {
      /* LE MOTIF EST ECRIT DANS LA PERIODE QU'ON FERME, pas seulement dans
         `arret_formation`. Ce dernier decrit l'ETAT COURANT et la reprise l'efface : le
         motif de l'arret disparaissait donc au retour de l'apprenant, et la feuille
         ON BREAK - dont c'est toute la raison d'etre - perdait la trace de la pause.
         Range ici, il survit a autant d'allers-retours qu'on voudra. */
      ouverte.fin    = maj.date_retrait;
      ouverte.motif  = motif || null;
      ouverte.par    = noteObj.arret_formation?.par || null;
    }
    noteObj.periodes = periodes;

    maj.note = JSON.stringify(noteObj);

    const { data, error } = await supabase
      .from("groupes_apprenants").update(maj).eq("id", req.params.id).select().single();
    if (error) throw error;

    /* LA FACTURATION SUIT L'ARRET.
       Sans cet appel, un apprenant declare « arrete » perdait l'acces aux nouveaux cours
       mais continuait d'etre facture tous les mois, rappels J-7/J-3/J-1 compris. Le
       mecanisme de neutralisation existait deja et etait branche sur la mise en pause :
       il manquait seulement ici.

       LE MOIS EN COURS RESTE DU - il a eu cours pendant ce mois. La neutralisation
       commence au mois SUIVANT, d'ou `premierMoisNonFacture`. Par defaut
       `suspendrePlan` aurait neutralise le mois courant.

       A la reprise, `reprendrePlan` REBASE le plan sur le mois de reprise au lieu de
       rattraper les mois manques : sans ce rebasage, reactiver un dossier produirait
       d'un coup les arrieres de toute la periode d'absence. */
    const moisSuivant = periodeDe(new Date(d.getFullYear(), d.getMonth() + 1, 1));
    const facturation = await repercuterSurLaFacturation(avant, {
      reprise: arrete === false,
      motif: arrete === false ? null : (motif || "Arrêt de formation"),
      detail: arrete === false ? null : "Formation arrêtée - déclarée depuis la fiche apprenant",
      acteur: `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || null,
      ...(arrete === false ? {} : { premierMoisNonFacture: moisSuivant }),
    });

    const nom = `${avant.prenom_apprenant || ""} ${avant.nom_apprenant || ""}`.trim() || "L'apprenant";

    // Le retour DIT ce qui s'est reellement passe cote facturation : l'ecran ne doit pas
    // laisser croire qu'elle a suivi si elle a echoue.
    const estReprise = arrete === false;
    const nb = facturation.moisNeutralises || 0;
    const suite =
      facturation.statut === "dossier_introuvable" || facturation.statut === "aucun_plan"
        ? ""                                   // pas de plan mensuel : rien a dire
        : facturation.statut !== "ok"
        ? " ⚠️ La facturation n'a pas pu être mise à jour - à vérifier."
        : estReprise
        ? " La facturation reprend au mois en cours, sans rattrapage des mois d'absence."
        : nb > 0
        ? ` ${nb} mensualité${nb > 1 ? "s" : ""} à venir ${nb > 1 ? "ont" : "a"} été annulée${nb > 1 ? "s" : ""} - le mois en cours reste dû.`
        : " Aucune mensualité à venir n'était à annuler.";

    /* ── PREVENIR CEUX QUI ENSEIGNENT ────────────────────────────────────────
       Un apprenant arrete disparait de la liste active de sa classe. Sans ce message, le
       coach constatait un nom en moins sans savoir ni quand, ni pourquoi, ni s'il devait
       le relancer - et le superviseur ne l'apprenait jamais.
       Volontairement APRES la reponse metier : une notification qui echoue ne doit pas
       faire echouer un arret deja enregistre en base. */
    try {
      const { data: groupe } = await supabase
        .from("groupes").select("id, nom, coach_id").eq("id", avant.groupe_id).maybeSingle();
      const classe  = groupe?.nom || "sa classe";
      const leMotif = motif ? ` Motif : ${motif}.` : "";
      const payload = estReprise
        ? {
            type: "info",
            titre: `▶️ Reprise de formation : ${nom}`,
            message: `${nom} reprend sa formation dans « ${classe} ». Il reçoit de nouveau les cours publiés à partir d'aujourd'hui - ceux parus pendant son absence restent fermés.`,
            meta: { groupe_id: avant.groupe_id, ga_id: avant.id, action: "reprise_formation" },
          }
        : {
            type: "alerte",
            titre: `🎓 Arrêt de formation : ${nom}`,
            message: `${nom} a arrêté sa formation dans « ${classe} » le ${d.toLocaleDateString("fr-FR")}.${leMotif} Il garde l'accès aux cours déjà suivis, mais ne recevra plus les prochains.`,
            meta: { groupe_id: avant.groupe_id, ga_id: avant.id, action: "arret_formation", motif: motif || null },
          };

      /* `resolveCoachUserId` et NON `groupe.coach_id` en direct : cet identifiant designe
         tantot un compte `utilisateurs`, tantot une fiche `coachs` display-only. Sur le
         second cas, `notifyUser` ecrivait une notification pour un utilisateur qui n'existe
         pas - sans erreur, et sans que personne ne la recoive. */
      const coachUserId = await resolveCoachUserId(groupe?.coach_id);

      await Promise.all([
        // Le coach de la classe, nommement : c'est lui qui verra la place vide.
        coachUserId ? notifyUser(coachUserId, payload) : null,
        // Supervision globale ET conseil pedagogique : les deux suivent la vie des classes.
        notifyRole(["pedagogical_advisor", "admin_pa_advisor", ...ROLES_SUPERVISION_GLOBALE], payload),
        // Les superviseurs adjoints rattaches a CE coach - le pendant filtre du precedent.
        groupe?.coach_id ? notifyDeputiesDuCoach(groupe.coach_id, payload) : null,
        /* L'assistante qui SUIT cet apprenant - commerciale ou onboarding - retrouvee par
           son dossier, plus la creatrice de la classe. Volontairement pas un
           `notifyRole(["onboarding","commercial"])` : il previendrait les 5 comptes
           onboarding et les 23 commerciaux pour un apprenant qui n'est pas le leur, et
           une cloche qui sonne pour tout finit par n'etre plus lue. */
        notifierStaffDuGroupe(avant.groupe_id, [{ email_apprenant: avant.email_apprenant }], {
          titre:   payload.titre,
          message: payload.message,
          action:  payload.meta.action,
        }),
      ].filter(Boolean));
    } catch (e) {
      console.error("[arret-formation] notifications non envoyées:", e.message);
    }

    res.json({
      ok: true,
      assignation: data,
      facturation,
      message: (arrete === false
        ? `${nom} reprend sa formation - il accède de nouveau aux cours publiés.`
        : `${nom} a arrêté sa formation. Les cours publiés après le ${d.toLocaleDateString("fr-FR")} ne lui seront plus accessibles.`) + suite,
    });
  } catch (err) {
    console.error("[groupes/apprenants/:id/arret-formation]", err);
    res.status(500).json({ error: "Enregistrement impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   PATCH /api/groupes/apprenants/:id/niveau
   Progression de niveau CECR d'un apprenant (coach/onboarding) - déclenche les points
   de gamification (+20) et les badges associés si le nouveau niveau est strictement
   supérieur à l'ancien (A1<A2<B1<B2<C1<C2).
══════════════════════════════════════════════════════════════ */
const ORDRE_CECR_GROUPES = ["A1", "A2", "B1", "B2", "C1", "C2"];
router.patch("/apprenants/:id/niveau", authenticateAdmin, async (req, res) => {
  try {
    const { niveau } = req.body;
    if (!niveau || !ORDRE_CECR_GROUPES.includes(niveau.toUpperCase())) {
      return res.status(400).json({ error: "Niveau CECR invalide (A1-C2 attendu)" });
    }
    const nvl = niveau.toUpperCase();

    const { data: avant } = await supabase.from("groupes_apprenants").select("niveau, apprenant_id").eq("id", req.params.id).maybeSingle();
    if (!avant) return res.status(404).json({ error: "Apprenant introuvable" });

    /* L'ANCIEN NIVEAU EST CONSERVÉ, PAS ÉCRASÉ. Un niveau seul ne dit rien : « B1 » est une
       étiquette, « A2 → B1 » est une progression, et « B1 → A2 » dit qu'on s'était trompé de
       classe. C'est cette paire que le coach, l'agent placement test et l'onboarding lisent
       au moment d'un transfert. Jusqu'ici l'ancien disparaissait à l'écriture - il n'était lu
       qu'une ligne plus bas, pour les points de progression, puis perdu.

       On ne réécrit pas `niveau_precedent` quand le niveau ne change pas réellement : sinon
       un enregistrement sans modification effacerait la trace du vrai changement précédent. */
    const changementReel = (avant.niveau || "").toUpperCase() !== nvl;
    const patch = { niveau: nvl };
    if (changementReel) {
      patch.niveau_precedent = avant.niveau || null;
      patch.niveau_change_le = new Date().toISOString();
    }

    let { data, error } = await supabase
      .from("groupes_apprenants")
      .update(patch)
      .eq("id", req.params.id)
      .select()
      .single();

    /* Repli si la migration n'a pas encore été jouée : on enregistre au moins le niveau,
       plutôt que de refuser le changement sur une base non migrée. */
    if (error && /niveau_precedent|niveau_change_le/.test(error.message || "")) {
      ({ data, error } = await supabase
        .from("groupes_apprenants")
        .update({ niveau: nvl })
        .eq("id", req.params.id)
        .select()
        .single());
    }
    if (error) throw error;

    const rangAvant = ORDRE_CECR_GROUPES.indexOf((avant.niveau || "").toUpperCase());
    const rangApres = ORDRE_CECR_GROUPES.indexOf(nvl);
    if (avant.apprenant_id && rangApres > rangAvant) {
      attribuerPoints(avant.apprenant_id, "niveau_progression", req.params.id, 20, `Progression de niveau - ${nvl}`, { niveau: nvl }).catch(() => {});
    }

    res.json({ apprenant: data });
  } catch (err) {
    console.error("[groupes/apprenants/:id/niveau PATCH]", err);
    res.status(500).json({ error: "Erreur mise à jour du niveau" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/groupes/apprenants/bilans
   Apprenants approchant (ou ayant dépassé) la fin de leur groupe -
   remplace l'ancienne liste mockée (INIT_BILANS) du dashboard Onboarding.
   niveau_fin = niveau du groupe suivi (hypothèse : l'apprenant termine
   au niveau enseigné dans sa classe). Note finale / commentaire coach =
   dernier résultat corrigé dans evaluations_groupes. Taux de présence =
   calculé depuis groupes_presences.
══════════════════════════════════════════════════════════════ */
const CECRL_ORDRE = ["A1", "A2", "B1", "B2", "C1", "C2"];
function niveauSuivant(niveau) {
  const i = CECRL_ORDRE.indexOf((niveau || "").toUpperCase());
  return (i >= 0 && i < CECRL_ORDRE.length - 1) ? CECRL_ORDRE[i + 1] : null;
}

router.get("/apprenants/bilans", authenticateAdmin, async (req, res) => {
  try {
    const HORIZON_JOURS = Number(req.query.horizon_jours) || 30;
    const seuil = new Date(Date.now() + HORIZON_JOURS * 86400000).toISOString().slice(0, 10);

    let groupeQuery = supabase.from("groupes").select("id,nom,niveau,coach_id,centre_id,date_fin").not("date_fin", "is", null).lte("date_fin", seuil);
    if (req.role === "coach") {
      const groupeIdsDelegues = await groupesDeleguesA(req.profil.id);
      groupeQuery = groupeIdsDelegues.length
        ? groupeQuery.or(`coach_id.eq.${req.profil.id},id.in.(${groupeIdsDelegues.join(",")})`)
        : groupeQuery.eq("coach_id", req.profil.id);
    }
    if (req.query.centre_id) groupeQuery = groupeQuery.eq("centre_id", req.query.centre_id);
    const { data: groupes, error: gErr } = await groupeQuery;
    if (gErr) throw gErr;
    if (!groupes?.length) return res.json({ bilans: [] });

    const groupeIds = groupes.map(g => g.id);
    const groupeMap = Object.fromEntries(groupes.map(g => [g.id, g]));

    const { data: gas, error: gaErr } = await supabase
      .from("groupes_apprenants")
      .select("*")
      .in("groupe_id", groupeIds)
      .neq("statut", "retire");
    if (gaErr) throw gaErr;
    if (!gas?.length) return res.json({ bilans: [] });

    const gaIds = gas.map(a => a.id);

    const { data: presences } = await supabase
      .from("groupes_presences")
      .select("ga_id, statut")
      .in("ga_id", gaIds);
    const presenceParGa = {};
    (presences || []).forEach(p => {
      if (!presenceParGa[p.ga_id]) presenceParGa[p.ga_id] = { total: 0, present: 0 };
      presenceParGa[p.ga_id].total += 1;
      if (p.statut === "present") presenceParGa[p.ga_id].present += 1;
    });

    const { data: resultats } = await supabase
      .from("resultats_evaluations_groupes")
      .select("ga_id, note, note_max, commentaire_coach, corrige_at")
      .in("ga_id", gaIds)
      .eq("statut", "corrige")
      .not("note", "is", null)
      .order("corrige_at", { ascending: false });
    const dernierResultatParGa = {};
    (resultats || []).forEach(r => {
      if (!dernierResultatParGa[r.ga_id]) dernierResultatParGa[r.ga_id] = r;
    });

    const bilans = gas.map(a => {
      const groupe = groupeMap[a.groupe_id];
      const pres = presenceParGa[a.id];
      const tauxPresence = pres && pres.total > 0 ? Math.round((pres.present / pres.total) * 100) : null;
      const dernier = dernierResultatParGa[a.id];
      const noteFinale = dernier && dernier.note_max ? Math.round((dernier.note / dernier.note_max) * 100) : null;
      const niveauFin = groupe?.niveau || null;
      return {
        id: a.id,
        nom_apprenant: a.nom_apprenant,
        prenom_apprenant: a.prenom_apprenant,
        groupe_nom: a.groupe_nom || groupe?.nom,
        coach_nom: a.coach_nom,
        date_fin: groupe?.date_fin || null,
        niveau_debut: a.niveau || null,
        niveau_fin: niveauFin,
        nb_seances: pres?.total || 0,
        taux_presence: tauxPresence,
        note_finale: noteFinale,
        commentaire_coach: dernier?.commentaire_coach || null,
        renouvellement_suggere: niveauSuivant(niveauFin),
        bilan_alerte_envoyee: !!a.bilan_alerte_envoyee,
        bilan_alerte_date: a.bilan_alerte_date || null,
      };
    }).sort((x, y) => (x.date_fin || "").localeCompare(y.date_fin || ""));

    res.json({ bilans });
  } catch (err) {
    console.error("[groupes/apprenants/bilans]", err);
    res.status(500).json({ error: "Erreur récupération des bilans" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/groupes/apprenants/acces-status?apprenant_id=X
   Statut de blocage + compteur d'absences (depuis le dernier reset) - même
   modèle d'affichage que bet-elearning (elearning.js GET /apprenants/:id/acces-status),
   pour donner de la visibilité avant que le blocage automatique (4 absences,
   cf. checkAutoSuspension) ne se déclenche.
══════════════════════════════════════════════════════════════ */
router.get("/apprenants/acces-status", authenticateAdmin, async (req, res) => {
  try {
    const { apprenant_id } = req.query;
    if (!apprenant_id) return res.status(400).json({ error: "apprenant_id requis" });

    const { data: authData } = await supabase.auth.admin.getUserById(apprenant_id);
    const meta = authData?.user?.app_metadata || {};
    const accesBloque = meta.acces_bloque || false;
    const resetAt = meta.absences_reset_at || null;

    const { data: gas } = await supabase
      .from("groupes_apprenants")
      .select("id")
      .eq("apprenant_id", apprenant_id)
      // Mêmes statuts que la suspension automatique (voir son commentaire) : les absences
      // suivent la personne, donc les inscriptions closes par un transfert comptent aussi.
      // Compter autrement ici ferait diverger le chiffre affiché de celui qui bloque.
      .in("statut", ["actif", "periode_test", "transfere", "archive", "retire"]);
    const gaIds = (gas || []).map(g => g.id);

    let nbAbsences = 0;
    if (gaIds.length) {
      let q = supabase
        .from("groupes_presences")
        .select("id", { count: "exact", head: true })
        .in("ga_id", gaIds)
        .eq("statut", "absent");
      if (resetAt) q = q.gte("created_at", resetAt);
      const { count } = await q;
      nbAbsences = count || 0;
    }

    res.json({ acces_bloque: accesBloque, nb_absences: nbAbsences, absences_reset_at: resetAt });
  } catch (err) {
    console.error("[groupes/apprenants/acces-status]", err);
    res.status(500).json({ error: "Erreur récupération statut accès" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/groupes/mon-acces-status
   Même chose que ci-dessus mais en self-service pour l'apprenant connecté
   (apprenant_id déduit du token, pas du query param) - utilisé pour afficher
   le bandeau d'avertissement avant le blocage automatique à la 4e absence.
══════════════════════════════════════════════════════════════ */
router.get("/mon-acces-status", authenticateApprenant, async (req, res) => {
  try {
    const apprenantId = req.user.id;

    const { data: authData } = await supabase.auth.admin.getUserById(apprenantId);
    const meta = authData?.user?.app_metadata || {};
    const accesBloque = meta.acces_bloque || false;
    const resetAt = meta.absences_reset_at || null;

    const { data: gas } = await supabase
      .from("groupes_apprenants")
      .select("id")
      .eq("apprenant_id", apprenantId)
      // Mêmes statuts que la suspension automatique (voir son commentaire) : les absences
      // suivent la personne, donc les inscriptions closes par un transfert comptent aussi.
      // Compter autrement ici ferait diverger le chiffre affiché de celui qui bloque.
      .in("statut", ["actif", "periode_test", "transfere", "archive", "retire"]);
    const gaIds = (gas || []).map(g => g.id);

    let nbAbsences = 0;
    if (gaIds.length) {
      let q = supabase
        .from("groupes_presences")
        .select("id", { count: "exact", head: true })
        .in("ga_id", gaIds)
        .eq("statut", "absent");
      if (resetAt) q = q.gte("created_at", resetAt);
      const { count } = await q;
      nbAbsences = count || 0;
    }

    res.json({ acces_bloque: accesBloque, nb_absences: nbAbsences, absences_reset_at: resetAt, seuil_blocage: 4 });
  } catch (err) {
    console.error("[groupes/mon-acces-status]", err);
    res.status(500).json({ error: "Erreur récupération statut accès" });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/groupes/apprenants/:id/alerte-renouvellement
   Envoie une vraie notification à la commerciale (même mécanisme que
   signaler-absence) pour déclencher le suivi de renouvellement.
══════════════════════════════════════════════════════════════ */
router.post("/apprenants/:id/alerte-renouvellement", authenticateAdmin, requirePermission("inscriptions", "update"), async (req, res) => {
  try {
    const { id } = req.params;
    const { data: ga } = await supabase
      .from("groupes_apprenants")
      .select("*, groupes(nom, niveau)")
      .eq("id", id)
      .single();
    if (!ga) return res.status(404).json({ error: "Apprenant introuvable" });

    const nomComplet = `${ga.prenom_apprenant || ""} ${ga.nom_apprenant || ""}`.trim();
    const nomGroupe   = ga.groupes?.nom || ga.groupe_nom || "";
    const suggestion  = niveauSuivant(ga.groupes?.niveau);
    const notified = [];

    if (ga.email_apprenant) {
      const { data: assignation } = await supabase
        .from("assignations_parcours")
        .select("assistante_id, assistantes(email)")
        .eq("prospect_email", ga.email_apprenant)
        .maybeSingle();
      const assistanteUserId = await resolveAssistanteUserId(assignation?.assistantes?.email);
      if (assistanteUserId) {
        await sendNotif(assistanteUserId, {
          type:    "bilan_renouvellement",
          titre:   `📣 Renouvellement à proposer - ${nomComplet}`,
          message: `${nomComplet} termine bientôt son groupe "${nomGroupe}"${suggestion ? ` - proposez le niveau ${suggestion}` : ""}. Merci de le relancer.`,
          meta:    { ga_id: ga.id, apprenant: nomComplet, groupe: nomGroupe, niveau_suggere: suggestion },
        });
        notified.push("commerciale");
      }
    }

    await supabase.from("groupes_apprenants")
      .update({ bilan_alerte_envoyee: true, bilan_alerte_date: new Date().toISOString() })
      .eq("id", id);

    res.json({ ok: true, notified });
  } catch (err) {
    console.error("[groupes/apprenants/:id/alerte-renouvellement]", err);
    res.status(500).json({ error: "Erreur envoi de l'alerte" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/groupes/apprenant-by-email?email=xxx
   Retourne la classe active + coach d'un apprenant (pour la commerciale)
══════════════════════════════════════════════════════════════ */
router.get("/apprenant-by-email", authenticateAdmin, async (req, res) => {
  try {
    const { email, assignation_id } = req.query;
    if (!email && !assignation_id) return res.json({ groupe: null });

    // Priorité au lien direct posé dans groupes_apprenants.note à la création du dossier
    // ({assignation_id}) - le seul repère fiable pour un profil ENFANT, dont l'email envoyé
    // ici (souvent celui du parent, prospect_email) ne correspond jamais à email_apprenant
    // (email technique propre à l'enfant) : la recherche par email échouait alors
    // systématiquement, laissant "Classe & Coach assignés" afficher "en attente d'affectation"
    // même quand une classe et un coach étaient bel et bien assignés.
    let ga = null;
    if (assignation_id) {
      const { data: gaParNote } = await supabase
        .from("groupes_apprenants")
        .select("id, groupe_id, nom_apprenant, prenom_apprenant, statut, date_ajout, date_retrait, niveau, note")
        .ilike("note", `%${assignation_id}%`)
        .order("date_ajout", { ascending: false })
        .limit(1)
        .maybeSingle();
      ga = gaParNote || null;
    }

    /* Chercher l'entrée dans groupes_apprenants.
       LE STATUT N'EST PLUS FILTRE. Il l'était sur `actif` et `periode_test`, ce qui faisait
       disparaître le rattachement dès qu'un apprenant passait en `retire` - et avec lui le
       `ga_id` dont l'écran a besoin pour ANNULER cet arrêt. On ne pouvait donc arrêter une
       formation qu'une fois, sans jamais revenir dessus.
       `retire` est au contraire l'état qu'il faut pouvoir lire. Seul `transfere` reste exclu :
       c'est un rattachement PÉRIMÉ, remplacé par celui de la nouvelle classe - le remonter
       ferait afficher l'ancienne classe. Les autres sont triés du plus récent au plus ancien. */
    if (!ga && email) {
      const { data: gaParEmail } = await supabase
        .from("groupes_apprenants")
        .select("id, groupe_id, nom_apprenant, prenom_apprenant, statut, date_ajout, date_retrait, niveau, note")
        .eq("email_apprenant", email.toLowerCase())
        .neq("statut", "transfere")
        .order("date_ajout", { ascending: false })
        .limit(1)
        .maybeSingle();
      ga = gaParEmail || null;
    }

    if (!ga) return res.json({ groupe: null });

    // Récupérer les infos du groupe + coach
    const { data: groupe } = await supabase
      .from("groupes")
      .select("id, nom, niveau, filiere, type_cours, horaire, coach_id, centre_id")
      .eq("id", ga.groupe_id)
      .maybeSingle();

    if (!groupe) return res.json({ groupe: null });

    let coach_nom  = null;
    let coach_photo = null;
    let coach_email = null;
    let coach_telephone = null;

    if (groupe.coach_id) {
      // Même logique que GET /api/groupes : utilisateurs d'abord, fallback coachs
      const { data: userCoach } = await supabase
        .from("utilisateurs")
        .select("id, nom, prenom, email, telephone")
        .eq("id", groupe.coach_id)
        .maybeSingle();
      if (userCoach) {
        coach_nom       = `${userCoach.prenom || ""} ${userCoach.nom || ""}`.trim();
        coach_email     = userCoach.email     || null;
        coach_telephone = userCoach.telephone || null;
        // Chercher la photo dans coachs (display-only) en parallèle
        const { data: coachDisplay } = await supabase
          .from("coachs").select("photo_url").eq("id", groupe.coach_id).maybeSingle();
        coach_photo = coachDisplay?.photo_url || null;
      } else {
        const { data: coachRec } = await supabase
          .from("coachs")
          .select("id, nom, prenom, photo_url, email_professionnel, telephone")
          .eq("id", groupe.coach_id)
          .maybeSingle();
        if (coachRec) {
          coach_nom       = `${coachRec.prenom || ""} ${coachRec.nom || ""}`.trim();
          coach_photo     = coachRec.photo_url || null;
          coach_email     = coachRec.email_professionnel || null;
          coach_telephone = coachRec.telephone || null;
        }
      }
    }

    let centre_nom = null;
    if (groupe.centre_id) {
      const { data: centre } = await supabase
        .from("centres").select("nom").eq("id", groupe.centre_id).maybeSingle();
      centre_nom = centre?.nom || null;
    }

    res.json({
      groupe: {
        id:              groupe.id,
        nom:             groupe.nom,
        niveau:          groupe.niveau,
        filiere:         groupe.filiere,
        type_cours:      groupe.type_cours,
        horaire:         groupe.horaire || [],
        centre_nom,
        /* L'IDENTIFIANT DU CENTRE, ET PAS SEULEMENT SON NOM. Les écrans n'avaient que
           `centre_nom`, bon à afficher mais inutilisable pour décider : le bouton de transfert
           de centre à centre ne pouvait ni s'activer, ni retirer le centre actuel de la liste
           des destinations. Et il en a d'autant plus besoin que le dossier, lui, ne porte pas
           toujours le centre - 3 dossiers présentiel sur 10 l'ont à NULL, alors que leur
           classe le sait. C'est donc la classe qui comble le trou. */
        centre_id:       groupe.centre_id || null,
        statut_ga:       ga.statut,
        date_ajout:      ga.date_ajout,
        // La date d'arrêt de formation, seule source fiable de cet état : l'écran qui ouvre
        // un apprenant fusionne sa ligne avec son assignation, et `statut` y devient celui
        // du DOSSIER (« converti »…), plus celui du rattachement.
        date_retrait:    ga.date_retrait || null,
        ga_id:           ga.id,
        coach_nom,
        coach_photo,
        coach_email,
        coach_telephone,
      },
    });
  } catch (err) {
    console.error("[apprenant-by-email]", err);
    res.json({ groupe: null });
  }
});

// GET /api/groupes/honoraires-coaches?mois=&annee=
// Agrège les séances enregistrées (groupes_cours) par coach pour le PA
router.get("/honoraires-coaches", authenticateAdmin, async (req, res) => {
  try {
    const { mois, annee } = req.query;
    let q = supabase
      .from("groupes_cours")
      .select("id, coach_id, groupe_id, date_cours, statut, groupes(nom, niveau, type_cours)")
      .neq("statut", "corbeille")
      .order("date_cours", { ascending: false });
    if (mois && annee) {
      const debut = `${annee}-${String(mois).padStart(2,"0")}-01`;
      const fin   = new Date(Number(annee), Number(mois), 0).toISOString().slice(0,10);
      q = q.gte("date_cours", debut).lte("date_cours", fin);
    }
    const { data: cours, error } = await q;
    if (error) throw error;

    const byCoach = {};
    (cours || []).forEach(c => {
      const cid = c.coach_id;
      if (!cid) return;
      if (!byCoach[cid]) byCoach[cid] = { coach_id: cid, nb_seances: 0, groupes: {} };
      byCoach[cid].nb_seances++;
      const gid = c.groupe_id;
      if (!byCoach[cid].groupes[gid]) {
        byCoach[cid].groupes[gid] = {
          groupe_id: gid,
          nom:       c.groupes?.nom       || "-",
          niveau:    c.groupes?.niveau    || null,
          type_cours:c.groupes?.type_cours|| null,
          nb_seances: 0,
        };
      }
      byCoach[cid].groupes[gid].nb_seances++;
    });

    const result = Object.values(byCoach).map(h => ({
      ...h,
      groupes: Object.values(h.groupes).sort((a, b) => b.nb_seances - a.nb_seances),
    }));
    res.json({ honoraires: result });
  } catch (err) {
    console.error("[honoraires-coaches]", err.message);
    res.status(500).json({ error: "Erreur récupération honoraires coaches" });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/groupes/transfert - transférer un apprenant vers un autre groupe
   DOIT être déclaré AVANT /:id pour qu'Express ne confonde pas "transfert" avec un id
══════════════════════════════════════════════════════════════ */
router.post("/transfert", authenticateAdmin, requirePermission("classes", "update"), async (req, res) => {
  try {
    const { ga_id, nouveau_groupe_id, motif, initiateur } = req.body;
    // initiateur = "coach" | "assistant" | "apprenant"

    if (!ga_id || !nouveau_groupe_id) {
      return res.status(400).json({ error: "ga_id et nouveau_groupe_id sont requis" });
    }

    // 1. Récupérer l'apprenant actuel
    const { data: ga, error: gaErr } = await supabase
      .from("groupes_apprenants").select("*").eq("id", ga_id).single();
    if (gaErr || !ga) return res.status(404).json({ error: "Apprenant introuvable" });

    // Garde-fou doublon n°1 : ce ga_id a déjà été transféré (double-clic, ou modal de
    // transfert rouvert sur une référence périmée) - sans ce contrôle, la ligne était
    // quand même ré-actualisée en "transfere" (opération sans effet, donc invisible) puis
    // une NOUVELLE ligne "actif" était réinsérée dans la classe cible à chaque tentative,
    // créant plusieurs copies actives du même apprenant dans la même classe.
    if (ga.statut === "transfere") {
      return res.status(409).json({ error: "Cet apprenant a déjà été transféré - actualisez la page." });
    }

    // 2. Récupérer les deux groupes
    const { data: ancienGroupe } = await supabase.from("groupes").select("*").eq("id", ga.groupe_id).single();
    const { data: nouveauGroupe } = await supabase.from("groupes").select("*").eq("id", nouveau_groupe_id).single();
    if (!nouveauGroupe) return res.status(404).json({ error: "Nouveau groupe introuvable" });

    /* LES CLASSES EN LIGNE APPARTIENNENT À L'ONBOARDING. C'est elle qui y place les
       apprenants ; une commerciale qui déplacerait quelqu'un déferait une affectation dont
       elle n'est pas responsable, sans que personne en soit averti. Les écrans de la
       commerciale ne proposent plus ce transfert, mais un bouton retiré n'est pas un droit
       retiré : la règle est posée ici, où elle tient quel que soit l'appelant.
       LES DEUX CÔTÉS sont contrôlés - sortir d'une classe en ligne comme y entrer fait
       entrer le dossier dans le périmètre de l'Onboarding.
       Le présentiel reste ouvert : la commerciale y affecte elle-même classe et coach. */
    /* L'EXCEPTION : UNE MIGRATION DE CANAL ACCEPTÉE.
       La règle ci-dessus empêche une commerciale de toucher aux classes en ligne de sa propre
       initiative, et elle doit le rester. Mais une migration en ligne → présentiel part
       FORCÉMENT d'une classe en ligne : l'assistante du centre qui vient d'accepter le dossier
       se serait vue refuser le geste qu'on venait de l'autoriser à faire. Le bouton se serait
       affiché, le clic aurait rendu un 403, et la migration n'aurait jamais pu aboutir.

       VÉRIFIÉE ICI, PAS DÉCLARÉE PAR LE NAVIGATEUR. On relit la demande en base et on exige
       tout : qu'elle existe, qu'elle soit bien une migration, qu'elle attende encore un accord,
       qu'elle porte sur CET apprenant, et que la classe d'arrivée ne soit pas en ligne - car
       vers le en ligne, c'est l'onboarding qui affecte, jamais une assistante. Un simple
       indicateur envoyé par l'écran aurait suffi à contourner toute la règle. */
    let migrationAcceptee = false;
    if (req.body.demande_id) {
      const { data: dem } = await supabase
        .from("demandes_transfert")
        .select("id, ga_id, statut, type_demande")
        .eq("id", req.body.demande_id).maybeSingle();
      migrationAcceptee = !!dem
        && dem.type_demande === "changement_coaching"
        && dem.statut === "en_attente_accord"
        && String(dem.ga_id) === String(ga_id)
        && nouveauGroupe.type_cours !== "en_ligne";
    }

    if (req.role === "commercial" && !migrationAcceptee
        && (ancienGroupe?.type_cours === "en_ligne" || nouveauGroupe.type_cours === "en_ligne")) {
      return res.status(403).json({
        error: "Les classes en ligne sont affectées par l'Onboarding - rapprochez-vous d'elle pour ce changement de groupe.",
      });
    }

    // Garde-fou doublon n°2 : l'apprenant est déjà actif dans la classe cible (identité
    // stable via apprenant_id, sinon email_apprenant) - évite une seconde copie s'il y a
    // déjà été transféré entre-temps par une autre requête concurrente.
    {
      let dejaPresentQ = supabase.from("groupes_apprenants").select("id").eq("groupe_id", nouveau_groupe_id).eq("statut", "actif");
      dejaPresentQ = ga.apprenant_id ? dejaPresentQ.eq("apprenant_id", ga.apprenant_id) : dejaPresentQ.eq("email_apprenant", ga.email_apprenant);
      const { data: dejaPresent } = await dejaPresentQ.limit(1);
      if (dejaPresent?.length) {
        return res.status(409).json({ error: `${ga.prenom_apprenant || ""} ${ga.nom_apprenant || ""}`.trim() + " est déjà dans cette classe." });
      }
    }

    /* 3. Fermer l'ancienne inscription — EN Y INSCRIVANT LE MOTIF DU DÉPART.
       Le motif n'était posé que sur la NOUVELLE ligne (`note.dernier_transfert`, plus bas) :
       celle qui part n'en gardait aucune trace. Or c'est elle que lit l'archive du coach, et
       le classeur « LEARNERS' PROFILE » affichait donc « motif non renseigné » pour un départ
       qui en avait pourtant un - et le coach ne savait pas pourquoi son apprenant était parti. */
    let noteDepart = {};
    try { noteDepart = JSON.parse(ga.note || "{}"); } catch { /* note libre */ }
    noteDepart.depart = {
      type:   "transfert",
      motif:  motif || "Changement de classe",
      vers:   nouveauGroupe?.nom || null,
      /* LE NIVEAU, PAS SEULEMENT LA CLASSE. « Transféré vers Anglais B2 » ne dit pas si
         l'apprenant a progressé, régressé, ou simplement changé d'horaire. Or c'est le plus
         souvent le niveau qui motive le départ, et le coach a besoin de le lire dans son
         classeur pour comprendre ce qui s'est passé dans sa classe.
         `niveau_apres` vaut celui de la classe d'arrivée, à défaut celui de l'apprenant : au
         moment où l'on écrit, le test peut avoir rendu un niveau que l'inscription ne porte
         pas encore. */
      niveau_avant: ga.niveau || null,
      niveau_apres: nouveauGroupe?.niveau || ga.niveau || null,
      date:   new Date().toISOString(),
      par:    req.profil?.id || null,
    };
    await supabase.from("groupes_apprenants")
      .update({
        statut: "transfere",
        date_retrait: new Date().toISOString(),
        note: JSON.stringify(noteDepart),
      })
      .eq("id", ga_id);

    // 4. Insérer dans le nouveau groupe directement en "actif" - plus de période de test.
    // Le motif est conservé dans `note` (déjà réutilisé comme JSON ailleurs sur cette table)
    // pour rester consultable depuis l'historique de l'apprenant, sans nouvelle colonne.
    let noteObj = {};
    try { noteObj = JSON.parse(ga.note || "{}"); } catch {}
    noteObj.dernier_transfert = { motif: motif || null, ancien_groupe: ancienGroupe?.nom || null, date: new Date().toISOString() };
    const ligneBase = {
      groupe_id:         nouveau_groupe_id,
      apprenant_id:      ga.apprenant_id,
      nom_apprenant:     ga.nom_apprenant,
      prenom_apprenant:  ga.prenom_apprenant,
      email_apprenant:   ga.email_apprenant,
      telephone:         ga.telephone,
      niveau:            ga.niveau,
      note:              JSON.stringify(noteObj),
      statut:            "actif",
      added_by:          req.profil.id,
    };

    /* L'HISTORIQUE DU NIVEAU SUIT L'APPRENANT, lui aussi.
       Ces deux champs n'étaient pas recopiés : à chaque transfert, « passé de A2 à B1 le
       28 septembre » disparaissait, et la nouvelle inscription repartait comme si l'apprenant
       n'avait jamais été évalué. Constaté le 07/10/2026 sur un dossier qui portait bien
       `niveau_precedent: "A2"` avant son transfert, et plus rien après. C'est la seule trace
       de sa progression : la fiche, l'archive et la frise de niveau de l'application mobile
       la lisent toutes ici.

       LE REPLI N'EST PAS DE LA PRUDENCE DÉCORATIVE : ces deux colonnes viennent d'une
       migration qui peut ne pas avoir été jouée partout. Sans lui, les demander ferait échouer
       l'INSERT, et c'est le TRANSFERT ENTIER qui tomberait — l'ancienne inscription est déjà
       fermée à ce stade, l'apprenant se retrouverait sans classe. On réessaie donc sans elles :
       perdre l'historique est regrettable, perdre l'apprenant ne l'est pas. */
    let { data: newGa, error: insertErr } = await supabase
      .from("groupes_apprenants")
      .insert({
        ...ligneBase,
        niveau_precedent: ga.niveau_precedent ?? null,
        niveau_change_le: ga.niveau_change_le ?? null,
      })
      .select().single();

    if (insertErr && /niveau_precedent|niveau_change_le/.test(insertErr.message || "")) {
      console.warn("[transfert] colonnes d'historique de niveau absentes, insertion sans elles");
      ({ data: newGa, error: insertErr } = await supabase
        .from("groupes_apprenants").insert(ligneBase).select().single());
    }
    if (insertErr) throw insertErr;

    // 5. Mettre à jour le nb_apprenants des deux groupes
    if (ancienGroupe) {
      const nb = Math.max(0, (ancienGroupe.nb_apprenants || 1) - 1);
      await supabase.from("groupes").update({ nb_apprenants: nb }).eq("id", ga.groupe_id);
    }
    const nbNouv = (nouveauGroupe.nb_apprenants || 0) + 1;
    await supabase.from("groupes").update({ nb_apprenants: nbNouv }).eq("id", nouveau_groupe_id);

    const nomComplet = `${ga.prenom_apprenant || ""} ${ga.nom_apprenant || ""}`.trim();

    /* ── Notifications du transfert ─────────────────────────────────────────────
       L'anti-auto-notification s'appuie sur l'identifiant RÉEL de l'utilisateur
       authentifié, plus sur la chaîne `initiateur` envoyée par le client. Celle-ci
       était traitée comme une catégorie de rôle et faisait taire des destinataires
       entiers : la commerciale envoyant "assistant", ni elle ni l'onboarding
       n'étaient prévenus, et le comportement différait d'un dashboard à l'autre
       pour un même acte. */
    const acteurId = req.profil?.id || null;
    const dejaNotifies = new Set();
    const prevenir = async (userId, notif) => {
      if (!userId || userId === acteurId || dejaNotifies.has(userId)) return;
      dejaNotifies.add(userId);
      await sendNotif(userId, notif);
    };

    const resume    = `de "${ancienGroupe?.nom || "-"}" vers "${nouveauGroupe.nom || nouveau_groupe_id}"`;
    const motifTxt  = motif || "Changement de disponibilités";
    const metaNotif = {
      ga_id: newGa?.id, apprenant: nomComplet,
      ancien_groupe: ancienGroupe?.nom, nouveau_groupe: nouveauGroupe.nom,
      motif, initiateur,
    };

    // 6. Le nouveau coach - il accueille l'apprenant.
    await prevenir(nouveauGroupe.coach_id, {
      type: "transfert",
      titre: `📥 Nouvel apprenant transféré`,
      message: `${nomComplet} rejoint votre groupe "${nouveauGroupe.nom || nouveau_groupe_id}". Ancien groupe : "${ancienGroupe?.nom || "-"}". Motif : ${motifTxt}.`,
      meta: metaNotif,
    });

    // 7. L'ancien coach - sans cela il découvrait le départ en voyant son effectif baisser.
    if (ancienGroupe?.coach_id && ancienGroupe.coach_id !== nouveauGroupe.coach_id) {
      await prevenir(ancienGroupe.coach_id, {
        type: "transfert",
        titre: `📤 Apprenant transféré hors de votre groupe`,
        message: `${nomComplet} quitte votre groupe "${ancienGroupe.nom}" pour "${nouveauGroupe.nom || nouveau_groupe_id}". Motif : ${motifTxt}.`,
        meta: metaNotif,
      });
    }

    // 8. L'équipe du dossier : assistante commerciale et onboarding rattaché. Auparavant
    //    conditionnés à `initiateur`, ils n'étaient donc presque jamais prévenus.
    let assignationDossier = null;
    if (ga.email_apprenant) {
      const { data: asg } = await supabase
        .from("assignations_parcours")
        .select("assistante_id, onboarding_id, assistantes(email)")
        .eq("prospect_email", ga.email_apprenant)
        .maybeSingle();
      assignationDossier = asg || null;
    }

    const assistanteUserId = await resolveAssistanteUserId(assignationDossier?.assistantes?.email);
    await prevenir(assistanteUserId, {
      type: "transfert",
      titre: `🔄 Changement de groupe - ${nomComplet}`,
      message: `${nomComplet}, que vous suivez, a été transféré ${resume}. Motif : ${motifTxt}.`,
      meta: metaNotif,
    });

    await prevenir(assignationDossier?.onboarding_id, {
      type: "transfert",
      titre: `🔄 Changement de groupe - ${nomComplet}`,
      message: `${nomComplet} a été transféré ${resume}. Motif : ${motifTxt}.`,
      meta: metaNotif,
    });

    // 9. Celui qui avait inscrit l'apprenant dans son groupe précédent.
    await prevenir(ga.added_by, {
      type: "transfert",
      titre: `🔄 Changement de groupe - ${nomComplet}`,
      message: `${nomComplet}, que vous aviez inscrit, a été transféré ${resume}. Motif : ${motifTxt}.`,
      meta: metaNotif,
    });

    // 10. L'apprenant lui-même - premier concerné, jamais informé jusqu'ici.
    await prevenir(ga.apprenant_id, {
      type: "transfert",
      titre: `🔄 Votre groupe a changé`,
      message: `Vous rejoignez le groupe "${nouveauGroupe.nom || nouveau_groupe_id}". Motif : ${motifTxt}.`,
      meta: metaNotif,
    });

    /* 11. LES RÔLES QUI SUIVENT L'APPRENANT, prévenus d'un seul appel.
       Un changement de classe déplace quelqu'un d'un coach à un autre, d'un niveau à un autre,
       souvent d'un horaire à un autre : il concerne tous ceux qui l'encadrent ou l'observent.
       Les DEPUTIES en font partie - ils observent les cours et prépareraient une visite dans
       une classe que l'apprenant a quittée. L'ÉQUIPE ONBOARDING aussi : jusqu'ici seule
       l'onboarding rattachée au dossier était prévenue (étape 8), et un transfert opéré par
       une assistante présentiel ne remontait donc à personne chez eux.

       UN SEUL APPEL au lieu de deux : le message était identique, et quelqu'un cumulant deux
       rôles - superviseur et super admin, par exemple - recevait deux fois la même chose. */
    await notifyRole([
      "pedagogical_advisor", "admin_pa_advisor",
      ...ROLES_SUPERVISION_GLOBALE,                              // superviseur, admin_superviseur
      "deputy_superviseur", "admin_deputy_superviseur",
      "onboarding", "admin_onboarding",
      "admin", "super_admin",
    ], {
      type: "transfert",
      titre: `🔄 Changement de classe - ${nomComplet}`,
      message: `${nomComplet} a été transféré ${resume}. Motif : ${motifTxt}.`,
      meta: metaNotif,
    }, acteurId);   // ne pas se notifier soi-même

    /* ── LA CLASSE QUITTÉE, QUAND ELLE SE RETROUVE VIDE ──────────────────────────────────
       Une classe de coaching PRIVÉ n'existe que pour ses apprenants : le dernier parti, elle
       n'a plus d'objet. Rien ne la fermait pourtant - le transfert ne touche qu'à
       `groupes_apprenants` - et elle restait `actif` indéfiniment. « Coaching privé - Jojol
       Arnaud » est dans cet état depuis le 28/09/2026 : zéro apprenant, coach toujours
       attaché, comptée dans sa charge et proposée dans les sélecteurs de classe.

       LE CRITÈRE EST « PLUS AUCUN APPRENANT ACTIF », PAS « CLASSE PRIVÉE ». Une classe privée
       peut accueillir une famille : tant qu'un frère ou une sœur y suit ses cours, elle vit.
       C'est pourquoi le compte est refait ICI, après le déplacement, plutôt que de faire
       confiance à l'écran - lui ne voyait que l'apprenant qu'il déplaçait.

       DEMANDÉ, JAMAIS IMPOSÉ : la clôture notifie, gèle les plans de paiement et clôt les
       évaluations publiées. On ne déclenche cela que si l'appelant l'a explicitement coché, et
       on refuse silencieusement si la condition n'est pas remplie - un refus bruyant ferait
       échouer un transfert pourtant réussi. */
    let clotureSource = null;
    if (req.body.cloturer_groupe_source) {
      try {
        const { data: restants } = await supabase
          .from("groupes_apprenants").select("id")
          .eq("groupe_id", ga.groupe_id).eq("statut", "actif");
        const nbRestants = (restants || []).length;

        if (nbRestants > 0) {
          clotureSource = { fait: false, raison: "apprenants_restants", restants: nbRestants };
        } else if (ancienGroupe?.statut === "cloture") {
          clotureSource = { fait: false, raison: "deja_cloturee" };
        } else {
          const { error: eClot } = await supabase.from("groupes")
            .update({ statut: "cloture", date_fin: ancienGroupe?.date_fin || new Date().toISOString().slice(0, 10) })
            .eq("id", ga.groupe_id);
          if (eClot) throw eClot;
          clotureSource = { fait: true, groupe_id: ga.groupe_id, nom: ancienGroupe?.nom || null };

          logAudit({
            acteur_id: req.profil?.id,
            acteur_nom: `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || null,
            acteur_email: req.profil?.email || null,
            acteur_role: req.role, action_type: "modification", module: "classes",
            cible_id: ga.groupe_id, cible_nom: ancienGroupe?.nom || null,
            description: `Classe clôturée : dernier apprenant transféré (${nomComplet})`,
          });
        }
      } catch (e) {
        // La clôture est un à-côté : son échec ne doit pas faire croire que le transfert a raté.
        console.warn("[transfert] clôture de la classe source impossible:", e.message);
        clotureSource = { fait: false, raison: "erreur", detail: e.message };
      }
    }

    res.json({
      success: true,
      message: `${nomComplet} transféré avec succès vers "${nouveauGroupe.nom || nouveau_groupe_id}".`,
      ga: newGa,
      cloture_source: clotureSource,
    });
  } catch (err) {
    console.error("[transfert]", err);
    res.status(500).json({ error: "Erreur lors du transfert" });
  }
});

// GET /api/groupes/apprenants/:gaId/historique - tout le parcours de classes de cet
// apprenant (actuel + anciens, transferts inclus). Les lignes "transfere" ne sont plus
// affichées dans aucun roster actif, mais restent en base pour alimenter cet historique.
router.get("/apprenants/:gaId/historique", authenticateAdmin, async (req, res) => {
  try {
    const { gaId } = req.params;
    const { data: ga } = await supabase
      .from("groupes_apprenants").select("*").eq("id", gaId).maybeSingle();
    if (!ga) return res.status(404).json({ error: "Apprenant introuvable" });

    // Identité stable de l'apprenant à travers ses transferts : apprenant_id si présent
    // (compte réel), sinon email_apprenant (toujours renseigné, y compris profil enfant).
    let q = supabase.from("groupes_apprenants").select("*");
    q = ga.apprenant_id ? q.eq("apprenant_id", ga.apprenant_id) : q.eq("email_apprenant", ga.email_apprenant);
    const { data: lignes, error } = await q.order("date_ajout", { ascending: true });
    if (error) throw error;

    const groupeIds = [...new Set((lignes || []).map(l => l.groupe_id).filter(Boolean))];
    let groupeMap = {};
    if (groupeIds.length) {
      const { data: gs } = await supabase.from("groupes").select("id,nom,niveau,type_cours,coach_id,centre_id").in("id", groupeIds);
      (gs || []).forEach(g => { groupeMap[g.id] = g; });
    }

    // Coach de chaque classe traversée - coach ACTUEL de cette classe (aucun snapshot
    // historique n'existe si le coach a changé depuis) : utilisateurs d'abord (compte
    // auth), fallback coachs (display-only), même logique que GET /:id.
    const coachIds = [...new Set(Object.values(groupeMap).map(g => g.coach_id).filter(Boolean))];
    let coachMap = {};
    if (coachIds.length) {
      const { data: coachUsers } = await supabase.from("utilisateurs").select("id,nom,prenom,email,telephone").in("id", coachIds);
      (coachUsers || []).forEach(c => { coachMap[c.id] = { nom: `${c.prenom||""} ${c.nom||""}`.trim(), email: c.email, telephone: c.telephone }; });
      const manquants = coachIds.filter(id => !coachMap[id]);
      if (manquants.length) {
        const { data: coachsDisplay } = await supabase.from("coachs").select("id,nom,prenom,email_professionnel,telephone").in("id", manquants);
        (coachsDisplay || []).forEach(c => { coachMap[c.id] = { nom: `${c.prenom||""} ${c.nom||""}`.trim(), email: c.email_professionnel, telephone: c.telephone }; });
      }
    }

    // Centre de chaque classe traversée
    const centreIds = [...new Set(Object.values(groupeMap).map(g => g.centre_id).filter(Boolean))];
    let centreMap = {};
    if (centreIds.length) {
      const { data: centres } = await supabase.from("centres").select("id,nom,ville").in("id", centreIds);
      (centres || []).forEach(c => { centreMap[c.id] = c; });
    }

    // Assistante/onboarding à l'origine de chaque ligne (added_by) - c'est bien la
    // personne réelle de l'époque, contrairement au coach ci-dessus (added_by n'est
    // jamais réécrit après coup).
    const addedByIds = [...new Set((lignes || []).map(l => l.added_by).filter(Boolean))];
    let addedByMap = {};
    if (addedByIds.length) {
      const { data: users } = await supabase.from("utilisateurs").select("id,nom,prenom,role").in("id", addedByIds);
      (users || []).forEach(u => { addedByMap[u.id] = { nom: `${u.prenom||""} ${u.nom||""}`.trim(), role: u.role }; });
    }

    /* L'ASSIDUITÉ DE CHAQUE ÉTAPE. L'historique ne donnait que l'itinéraire - quelles classes,
       quand, pourquoi - et le staff perdait de vue tout ce que l'apprenant avait fait avant
       son dernier transfert : ses présences restent en base, rattachées à l'ancienne ligne,
       mais aucun écran ne les relisait. On les compte ici, par étape, pour que la fiche
       raconte un parcours et non le seul dernier épisode. */
    const gaIdsParcours = (lignes || []).map(l => l.id);
    const bilanParGa = {};
    if (gaIdsParcours.length) {
      const { data: presences } = await supabase
        .from("groupes_presences")
        .select("ga_id, statut")
        .in("ga_id", gaIdsParcours);
      (presences || []).forEach(p => {
        const b = bilanParGa[p.ga_id] || (bilanParGa[p.ga_id] = { presences: 0, absences: 0, retards: 0, pointees: 0 });
        b.pointees += 1;
        if (p.statut === "present")      b.presences += 1;
        else if (p.statut === "retard") { b.retards += 1; b.presences += 1; }  // présent, en retard
        else if (p.statut === "absent")  b.absences += 1;
      });
    }

    const historique = (lignes || []).map(l => {
      let motif = null;
      try { motif = JSON.parse(l.note || "{}").dernier_transfert?.motif || null; } catch {}
      const groupe = groupeMap[l.groupe_id] || {};
      const b = bilanParGa[l.id] || null;
      return {
        // `null` et non 0 quand rien n'a été pointé : afficher 0 % laisserait croire que
        // l'apprenant n'est jamais venu, alors que le coach n'a simplement rien saisi.
        presences:       b ? b.presences : 0,
        absences:        b ? b.absences  : 0,
        retards:         b ? b.retards   : 0,
        seances_pointees:b ? b.pointees  : 0,
        taux_presence:   b && b.pointees ? Math.round(b.presences / b.pointees * 100) : null,
        id:          l.id,
        groupe_id:   l.groupe_id,
        groupe_nom:  groupe.nom || "-",
        /* LE NIVEAU DE L'APPRENANT, PAS CELUI DE LA CLASSE. Le repli `|| groupe.niveau` a été
           retiré : il recopiait le niveau du GROUPE quand l'inscription n'en avait pas, et
           cette valeur empruntée s'affichait ensuite comme le niveau de la personne. Un
           apprenant évalué A2 dans une classe étiquetée B1 apparaissait B1 — constaté le
           07/10/2026, et c'est sur cette base qu'on l'affectait à une classe trop difficile.
           « Non évalué » est une information juste ; un niveau emprunté n'en est pas une.
           Le niveau de la classe reste disponible à part, sous son vrai nom. */
        niveau:      l.niveau || null,
        niveau_classe: groupe.niveau || null,
        type_cours:  groupe.type_cours || null,
        statut:      l.statut,
        date_ajout:  l.date_ajout,
        date_retrait: l.date_retrait,
        motif,
        coach_nom:       coachMap[groupe.coach_id]?.nom || null,
        coach_email:     coachMap[groupe.coach_id]?.email || null,
        coach_telephone: coachMap[groupe.coach_id]?.telephone || null,
        centre_nom:      centreMap[groupe.centre_id]?.nom || null,
        centre_ville:    centreMap[groupe.centre_id]?.ville || null,
        assistante_nom:  addedByMap[l.added_by]?.nom || null,
        assistante_role: addedByMap[l.added_by]?.role || null,
      };
    });

    res.json({ historique });
  } catch (err) {
    console.error("[historique apprenant]", err);
    res.status(500).json({ error: "Erreur récupération historique" });
  }
});

// ── GET /api/groupes/:id/historique ───────────────────────────
// Mouvements d'apprenants de CETTE classe : qui l'a rejointe, qui l'a quittée.
// Reconstruit à partir des traces déjà laissées par un transfert, sans table dédiée :
//   • un départ  → l'ancienne ligne passe en statut "transfere" avec sa date_retrait ;
//   • une arrivée → la nouvelle ligne porte note.dernier_transfert {motif, ancien_groupe, date}.
// La destination d'un départ n'est écrite nulle part : on la retrouve via la ligne
// suivante du même apprenant, identifié par apprenant_id ou, à défaut, par son email
// (toujours présent, y compris pour un profil enfant sans compte propre).
router.get("/:id/historique", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: lignes, error } = await supabase
      .from("groupes_apprenants").select("*").eq("groupe_id", id);
    if (error) throw error;
    if (!lignes?.length) return res.json({ historique: [] });

    const lireNote = (l) => { try { return JSON.parse(l.note || "{}"); } catch { return {}; } };
    const nomDe = (l) => [l.prenom_apprenant, l.nom_apprenant].filter(Boolean).join(" ") || "Apprenant";

    // Retrouver où sont partis ceux qui ont quitté la classe.
    const partis = lignes.filter(l => l.statut === "transfere");
    let destinations = {};
    if (partis.length) {
      const apprIds = [...new Set(partis.map(l => l.apprenant_id).filter(Boolean))];
      const emails  = [...new Set(partis.map(l => l.email_apprenant).filter(Boolean))];
      let suivantes = [];
      if (apprIds.length) {
        const { data } = await supabase.from("groupes_apprenants")
          .select("apprenant_id, email_apprenant, groupe_id, date_ajout, note")
          .in("apprenant_id", apprIds).neq("groupe_id", id);
        suivantes = suivantes.concat(data || []);
      }
      if (emails.length) {
        const { data } = await supabase.from("groupes_apprenants")
          .select("apprenant_id, email_apprenant, groupe_id, date_ajout, note")
          .in("email_apprenant", emails).neq("groupe_id", id);
        suivantes = suivantes.concat(data || []);
      }
      partis.forEach(l => {
        const cands = suivantes
          .filter(s => (l.apprenant_id && s.apprenant_id === l.apprenant_id)
                    || (!l.apprenant_id && s.email_apprenant === l.email_apprenant))
          .filter(s => !l.date_retrait || new Date(s.date_ajout) >= new Date(l.date_retrait))
          .sort((a, b) => new Date(a.date_ajout) - new Date(b.date_ajout));
        if (cands[0]) destinations[l.id] = cands[0];
      });
    }

    // Noms des classes citées + des assistantes ayant agi.
    const groupeIds = [...new Set(Object.values(destinations).map(d => d.groupe_id).filter(Boolean))];
    let groupeMap = {};
    if (groupeIds.length) {
      const { data: gs } = await supabase.from("groupes").select("id,nom,niveau").in("id", groupeIds);
      (gs || []).forEach(g => { groupeMap[g.id] = g; });
    }
    const acteurIds = [...new Set(lignes.map(l => l.added_by).filter(Boolean))];
    let acteurMap = {};
    if (acteurIds.length) {
      const { data: us } = await supabase.from("utilisateurs").select("id,nom,prenom,role").in("id", acteurIds);
      (us || []).forEach(u => { acteurMap[u.id] = u; });
    }
    const nomActeur = (uid) => {
      const u = acteurMap[uid];
      return u ? ([u.prenom, u.nom].filter(Boolean).join(" ") || null) : null;
    };

    const historique = [];

    lignes.forEach(l => {
      const t = lireNote(l).dernier_transfert;
      if (t) historique.push({
        type: "arrivee",
        apprenant: nomDe(l), niveau: l.niveau || null,
        date: t.date || l.date_ajout || null,
        motif: t.motif || null,
        classe_liee: t.ancien_groupe || null,   // le nom est déjà figé dans la note
        par: nomActeur(l.added_by),
      });
    });

    partis.forEach(l => {
      const d = destinations[l.id];
      const motifCible = d ? (lireNote(d).dernier_transfert?.motif || null) : null;
      historique.push({
        type: "depart",
        apprenant: nomDe(l), niveau: l.niveau || null,
        date: l.date_retrait || null,
        motif: motifCible,
        classe_liee: d ? (groupeMap[d.groupe_id]?.nom || null) : null,
        par: nomActeur(l.added_by),
      });
    });

    /* LES ARRÊTS DE FORMATION SONT AUSSI DES MOUVEMENTS.
       Cet historique ne connaissait que le transfert : quitter la classe pour une autre.
       Un apprenant qui ARRÊTE sort pourtant de la classe tout autant - et c'est le seul
       départ dont le motif soit réellement saisi, par l'assistante, au moment du geste.
       Sans ce bloc, la classe où quelqu'un vient d'arrêter affiche « 0 mouvement ». */
    lignes
      .filter(l => l.statut === "retire" || l.date_retrait)
      .filter(l => l.statut !== "transfere")   // un transfert est déjà compté plus haut
      .forEach(l => {
        const a = lireNote(l).arret_formation || {};
        historique.push({
          type: "arret",
          apprenant: nomDe(l), niveau: l.niveau || null,
          date: l.date_retrait || a.date || null,
          motif: a.motif || null,
          classe_liee: null,                    // il ne part nulle part : il arrête
          par: a.par || nomActeur(l.added_by),
        });
      });

    historique.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)); // plus récent d'abord
    res.json({ historique });
  } catch (err) {
    console.error("[historique classe]", err);
    res.status(500).json({ error: "Erreur récupération historique de la classe" });
  }
});


// GET /api/groupes/apprenants/:gaId/evaluations - toutes les évaluations du groupe avec statut individuel
router.get("/apprenants/:gaId/evaluations", authenticateAdmin, async (req, res) => {
  try {
    const { gaId } = req.params;

    const { data: ga } = await supabase
      .from("groupes_apprenants").select("groupe_id, date_ajout").eq("id", gaId).maybeSingle();
    if (!ga) return res.status(404).json({ error: "Apprenant introuvable" });

    let { data: evals, error } = await supabase
      .from("evaluations_groupes")
      .select("id, titre, type_evaluation:type, date_evaluation, heure_debut, statut, instructions")
      .eq("groupe_id", ga.groupe_id)
      .in("statut", ["publie", "cloture"])
      .order("date_evaluation", { ascending: false, nullsLast: true });

    if (error) throw error;
    // Exclut les évaluations programmées avant l'arrivée de l'apprenant dans cette classe
    // (transfert, ou ajout tardif) - sans ce filtre, tout devoir déjà publié avant son
    // arrivée s'affichait comme "à faire" alors qu'il ne le concernait jamais.
    if (ga.date_ajout) {
      evals = (evals || []).filter(e => !e.date_evaluation || new Date(e.date_evaluation) >= new Date(ga.date_ajout));
    }
    if (!evals?.length) return res.json({ evaluations: [] });

    const evalIds = evals.map(e => e.id);
    const { data: resultats } = await supabase
      .from("resultats_evaluations_groupes")
      .select("evaluation_id, statut, note, note_max, commentaire_coach, rendu_at, corrige_at, contenu_texte, fichier_url")
      .eq("ga_id", gaId)
      .in("evaluation_id", evalIds);

    const resMap = {};
    (resultats || []).forEach(r => { resMap[r.evaluation_id] = r; });

    const enrichies = evals.map(e => ({
      ...e,
      resultat: resMap[e.id] || { statut: "a_faire", note: null, commentaire_coach: null },
    }));

    res.json({ evaluations: enrichies });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/groupes/apprenants/:gaId/resultats - tous les résultats corrigés d'un apprenant
// DOIT être déclaré avant /:id pour ne pas être intercepté
router.get("/apprenants/:gaId/resultats", authenticateAdmin, async (req, res) => {
  try {
    const { gaId } = req.params;

    const { data: ga } = await supabase
      .from("groupes_apprenants").select("date_ajout").eq("id", gaId).maybeSingle();

    const { data: resultats, error } = await supabase
      .from("resultats_evaluations_groupes")
      .select("evaluation_id, note, note_max, commentaire_coach, statut, corrige_at")
      .eq("ga_id", gaId)
      .eq("statut", "corrige")
      .not("note", "is", null);

    if (error) throw error;
    if (!resultats?.length) return res.json({ resultats: [] });

    const evalIds = [...new Set(resultats.map(r => r.evaluation_id))];
    const { data: evals } = await supabase
      .from("evaluations_groupes")
      .select("id, titre, type_evaluation:type, date_evaluation")
      .in("id", evalIds);

    const evalsMap = {};
    (evals || []).forEach(e => { evalsMap[e.id] = e; });

    // Filet de sécurité, même logique que /evaluations : un résultat rattaché à une
    // évaluation antérieure à l'arrivée de l'apprenant dans cette classe ne le concerne pas.
    const resultatsFiltres = ga?.date_ajout
      ? resultats.filter(r => {
          const d = evalsMap[r.evaluation_id]?.date_evaluation;
          return !d || new Date(d) >= new Date(ga.date_ajout);
        })
      : resultats;

    const enrichis = resultatsFiltres.map(r => ({
      ...r,
      titre:           evalsMap[r.evaluation_id]?.titre           || "Évaluation",
      type_evaluation: evalsMap[r.evaluation_id]?.type_evaluation || "devoir",
      date_evaluation: evalsMap[r.evaluation_id]?.date_evaluation || r.corrige_at,
    }));

    res.json({ resultats: enrichis });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/groupes/:id/cloture - clôture définitive d'une classe par le PA
/**
 * Prévient le personnel qui suit les apprenants d'une classe : leur assistante
 * (commerciale ou onboarding, résolue via le dossier) et le créateur du groupe.
 *
 * Clôture et réouverture ont le même public : l'assistante qui suit le dossier doit
 * apprendre les deux, sans quoi elle relance un apprenant dont la classe est fermée, ou
 * ignore qu'elle a rouvert. Le bloc vivait en double dans la seule clôture ; la
 * réouverture, elle, ne prévenait personne côté commercial.
 */
async function notifierStaffDuGroupe(groupeId, gas, { titre, message, action }) {
  const staffIds = new Set();
  for (const ga of (gas || [])) {
    if (!ga.email_apprenant) continue;
    const { data: a } = await supabase
      .from("assignations_parcours")
      .select("assistantes(email)")
      .ilike("prospect_email", ga.email_apprenant)
      .maybeSingle();
    if (a?.assistantes?.email) {
      const uid = await resolveAssistanteUserId(a.assistantes.email);
      if (uid) staffIds.add(uid);
    }
  }
  const { data: grpCreator } = await supabase.from("groupes").select("created_by").eq("id", groupeId).maybeSingle();
  if (grpCreator?.created_by) {
    const { data: cr } = await supabase.from("utilisateurs").select("id, role").eq("id", grpCreator.created_by).maybeSingle();
    if (cr && ["commercial","onboarding","assistant_elearning","customer_care"].includes(cr.role))
      staffIds.add(cr.id);
  }
  if (!staffIds.size) return 0;
  await supabase.from("notifications").insert([...staffIds].map((uid) => ({
    user_id: uid, type: "info", titre, message, lu: false,
    meta: { groupe_id: groupeId, action }, source: "bet-elearning",
  })));
  return staffIds.size;
}

router.post("/:id/cloture", authenticateAdmin, requirePermission("classes", "update"), async (req, res) => {
  try {
    const { id } = req.params;

    const { data: groupe, error: errG } = await supabase
      .from("groupes").select("id, nom, statut, coach_id, date_fin").eq("id", id).maybeSingle();
    if (errG || !groupe) return res.status(404).json({ error: "Groupe introuvable" });
    if (groupe.statut === "cloture") return res.status(409).json({ error: "Classe déjà clôturée" });

    const today = new Date().toISOString().slice(0, 10);

    // 1. Clôturer le groupe
    await supabase.from("groupes").update({
      statut:   "cloture",
      date_fin: groupe.date_fin || today,
    }).eq("id", id);

    // 2. Récupérer les apprenants pour les notifications (on ne change PAS leur statut GA
    //    afin que tous les endpoints qui filtrent par statut="actif" continuent de fonctionner)
    const { data: gasActifs } = await supabase
      .from("groupes_apprenants")
      .select("id, apprenant_id, note, email_apprenant")
      .eq("groupe_id", id)
      /* CEUX QUI SONT ENCORE LÀ, et eux seuls. Cette liste sert à notifier la clôture et à
         geler la facturation : y faire entrer les inscriptions closes préviendrait de la
         fermeture d'une classe des apprenants qui l'ont quittée depuis des mois, et
         toucherait au plan de paiement de leur classe actuelle. Rien à voir avec le comptage
         des absences, qui lui suit la personne. */
      .in("statut", ["actif", "periode_test"]);

    // Geler la facturation de chaque apprenant de la classe. Sans cela, une classe
    // clôturée continuait de générer une mensualité par mois et ses rappels J-7/J-3/J-1 :
    // le cron ne lit pas groupes.statut. C'est le cas de la majorité des dossiers de
    // groupe, dont le plan est ouvert et donc sans terme.
    const acteurCloture = req.profil ? `${req.profil.prenom || ""} ${req.profil.nom || ""}`.trim() : null;

    // Le gel démarre le mois QUI SUIT la fin de la classe, pas le mois courant : une classe
    // terminée en juillet et clôturée en septembre a bien été dispensée jusqu'en juillet -
    // ce mois-là reste dû. Partir du mois courant ne gèlerait rien du tout, et laisserait
    // août facturé alors qu'aucun cours n'a eu lieu.
    const finClasse = groupe.date_fin || today;
    const dFin = new Date(finClasse);
    dFin.setMonth(dFin.getMonth() + 1);
    const premierMoisNonFacture = `${dFin.getFullYear()}-${String(dFin.getMonth() + 1).padStart(2, "0")}`;

    let plansGeles = 0;
    let moisGelesTotal = 0;
    for (const ga of (gasActifs || [])) {
      const r = await repercuterSurLaFacturation(ga, {
        reprise: false,
        premierMoisNonFacture,
        motif: "cloture_classe",
        detail: `Classe « ${groupe.nom} » clôturée`,
        dateReprisePrevue: null,
        acteur: acteurCloture,
      });
      if (r?.statut === "ok") { plansGeles++; moisGelesTotal += r.moisNeutralises || 0; }
    }

    // 3. Clôturer automatiquement les évaluations encore publiées
    await supabase.from("evaluations_groupes")
      .update({ statut: "cloture" })
      .eq("groupe_id", id)
      .eq("statut", "publie");

    // 4. Notifications - coach
    const coachUserId = await resolveCoachUserId(groupe.coach_id);
    if (coachUserId) {
      await sendNotif(coachUserId, {
        type:    "warning",
        titre:   `Classe clôturée : ${groupe.nom}`,
        message: `La classe "${groupe.nom}" a été officiellement clôturée par le Conseiller Pédagogique.`,
        meta:    { groupe_id: id, action: "cloture" },
      });
    }

    // 5. Notifications - apprenants
    const apprenantUserIds = (gasActifs || []).map(g => g.apprenant_id).filter(Boolean);
    if (apprenantUserIds.length) {
      await supabase.from("notifications").insert(apprenantUserIds.map(uid => ({
        user_id: uid,
        type:    "info",
        titre:   `Fin de parcours : ${groupe.nom}`,
        message: `Votre classe "${groupe.nom}" est maintenant terminée. Félicitations pour votre engagement !`,
        lu:      false,
        meta:    { groupe_id: id, action: "cloture" },
        source:  'bet-elearning',
      })));
    }

    // 6. Notifications - tous les PA advisors
    await notifyRole(["pedagogical_advisor", "admin_pa_advisor", ...ROLES_SUPERVISION_GLOBALE], {
      type:    "info",
      titre:   `🔒 Classe clôturée : ${groupe.nom}`,
      message: `La classe "${groupe.nom}" (${apprenantUserIds.length} apprenant${apprenantUserIds.length!==1?"s":""}) a été clôturée.`,
      meta:    { groupe_id: id, action: "cloture" },
    });

    // 7. Notifications - assistantes (commerciale / onboarding) liées aux apprenants du groupe
    const { data: gasEmails } = await supabase
      .from("groupes_apprenants")
      .select("email_apprenant")
      .eq("groupe_id", id)
      .not("email_apprenant", "is", null);

    await notifierStaffDuGroupe(id, gasEmails, {
      titre:   `🔒 Classe clôturée : ${groupe.nom}`,
      // « archivé(s) » était faux : la clôture ne touche pas au statut des apprenants,
      // le modal de confirmation le dit lui-même.
      message: `La classe "${groupe.nom}" a été clôturée. ${apprenantUserIds.length} apprenant(s) conservent leur accès ; les mensualités non dispensées sont gelées.`,
      action:  "cloture",
    });

    // 8. Notifications - super_admin / admin_manager
    await notifyRole(["super_admin", "admin_manager"], {
      type:    "info",
      titre:   `🔒 Classe clôturée : ${groupe.nom}`,
      message: `La classe "${groupe.nom}" a été clôturée par le Conseiller Pédagogique. ${apprenantUserIds.length} apprenant(s) notifié(s).`,
      meta:    { groupe_id: id, action: "cloture" },
    });

    res.json({
      success: true,
      groupe_id: id,
      apprenants_notifies: (gasActifs || []).length,
      plans_geles: plansGeles,
      mois_geles: moisGelesTotal,
      gel_a_partir_de: premierMoisNonFacture,
    });
  } catch (err) {
    console.error("[cloture]", err);
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════
   POST /api/groupes/:id/reouvrir - annule une clôture
   ------------------------------------------------------------------
   Une classe clôturée l'était définitivement : aucune route ne permettait le
   retour, alors qu'un groupe interrompu peut reprendre, et qu'une clôture faite
   par erreur n'avait aucun recours.

   La clôture ne détache pas les apprenants - le lien groupes_apprenants reste
   intact. Rouvrir suffit donc à remettre la classe en marche, avec tout son
   historique : séances, présences, évaluations, progression.

   Deux précautions :
   • `date_fin` est REDEMANDÉE plutôt que devinée. La clôture l'avait posée à sa
     propre date ; la laisser telle quelle donnerait une classe « active mais
     terminée », et pour un coaching privé le plan de paiement est borné par elle.
   • Les évaluations ne sont PAS republiées. La clôture les a basculées en masse
     sans marquer lesquelles : les rouvrir toutes ressusciterait aussi celles que
     le coach avait délibérément fermées. Le coach republie ce qu'il veut.

   Contrairement à la clôture, cette route contrôle le rôle.
══════════════════════════════════════════════════════════════════ */
router.post("/:id/reouvrir", authenticateAdmin, requirePermission("classes", "update"), async (req, res) => {
  try {
    const { id } = req.params;
    const { date_fin } = req.body || {};

    const { data: groupe, error: errG } = await supabase
      .from("groupes").select("id, nom, statut, coach_id, date_fin").eq("id", id).maybeSingle();
    if (errG || !groupe) return res.status(404).json({ error: "Groupe introuvable" });
    if (groupe.statut !== "cloture") return res.status(409).json({ error: "Cette classe n'est pas clôturée" });

    // date_fin explicitement vidée = classe sans terme ; absente du corps = on garde l'existante.
    const nouvelleFin = date_fin === null || date_fin === "" ? null
      : (date_fin || groupe.date_fin);

    const { error } = await supabase.from("groupes")
      .update({ statut: "actif", date_fin: nouvelleFin }).eq("id", id);
    if (error) return res.status(500).json({ error: error.message });

    const { data: gas } = await supabase
      .from("groupes_apprenants").select("id, apprenant_id, note, email_apprenant")
      .eq("groupe_id", id).in("statut", ["actif", "periode_test"]);
    const apprenantIds = (gas || []).map((g) => g.apprenant_id).filter(Boolean);

    const acteur = req.profil ? `${req.profil.prenom || ""} ${req.profil.nom || ""}`.trim() : null;
    const dateDuJour = new Date().toISOString().slice(0, 10);

    // Relancer la facturation, rebasée sur le mois courant : les mensualités de la période
    // de fermeture restent neutralisées, et aucun arriéré n'apparaît au redémarrage.
    let plansRepris = 0;
    for (const ga of (gas || [])) {
      const r = await repercuterSurLaFacturation(ga, { reprise: true, acteur, dateReprise: dateDuJour });
      if (r?.statut === "ok") plansRepris++;
    }

    logAudit({
      acteur_id: req.profil?.id || null, acteur_nom: acteur, acteur_email: req.profil?.email || null,
      acteur_role: req.role || null, plateforme: "dash",
      action_type: "CLASSE_REOUVERTE", module: "classes",
      entite_type: "groupe", entite_id: id,
      detail: `Réouverture de « ${groupe.nom} »`
        + (nouvelleFin ? ` - nouvelle fin ${nouvelleFin}` : " - sans date de fin"),
      statut: "success",
    }).catch(() => {});

    const coachUserId = await resolveCoachUserId(groupe.coach_id);
    if (coachUserId) {
      await sendNotif(coachUserId, {
        type:    "info",
        titre:   `▶️ Classe rouverte : ${groupe.nom}`,
        message: `La classe « ${groupe.nom} » reprend. Vous pouvez de nouveau y ajouter des séances, marquer les présences et publier des évaluations.`,
        meta:    { groupe_id: id, action: "reouverture" },
      });
    }

    if (apprenantIds.length) {
      await supabase.from("notifications").insert(apprenantIds.map((uid) => ({
        user_id: uid, type: "info",
        titre:   `▶️ Reprise des cours : ${groupe.nom}`,
        message: `Votre classe « ${groupe.nom} » reprend. Retrouvez vos séances et vos ressources dans votre espace.`,
        lu: false, meta: { groupe_id: id, action: "reouverture" }, source: "bet-elearning",
      })));
    }

    await notifyRole(["pedagogical_advisor", "admin_pa_advisor", "super_admin", ...ROLES_SUPERVISION_GLOBALE], {
      type:    "info",
      titre:   `▶️ Classe rouverte : ${groupe.nom}`,
      message: `La classe « ${groupe.nom} » (${apprenantIds.length} apprenant${apprenantIds.length !== 1 ? "s" : ""}) a été rouverte`
        + (acteur ? ` par ${acteur}` : "") + ".",
      meta:    { groupe_id: id, action: "reouverture" },
    }, req.profil?.id || null);

    // L'assistante qui suit le dossier doit savoir que la facturation redémarre : c'est
    // elle qui encaisse, et elle n'était prévenue que de la clôture.
    await notifierStaffDuGroupe(id, gas, {
      titre:   `▶️ Classe rouverte : ${groupe.nom}`,
      message: `La classe « ${groupe.nom} » a été rouverte${acteur ? ` par ${acteur}` : ""}. `
        + `${plansRepris} plan${plansRepris !== 1 ? "s" : ""} de paiement relancé${plansRepris !== 1 ? "s" : ""} - `
        + `les mois gelés restent non dus.`,
      action:  "reouverture",
    });

    res.json({ success: true, groupe_id: id, date_fin: nouvelleFin, apprenants_notifies: apprenantIds.length, plans_repris: plansRepris });
  } catch (err) {
    console.error("[reouvrir]", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    let { data: groupe, error } = await supabase.from("groupes").select("*").eq("id", id).single();
    if (error || !groupe) return res.status(404).json({ error: "Groupe introuvable" });

    if (req.role === "coach" && groupe.coach_id !== req.profil.id && !(await estDelegueSurGroupe(req.profil.id, id)))
      return res.status(403).json({ error: "Accès refusé" });

    // Enrichir avec le coach - utilisateurs (avatar_url) puis coachs (display-only)
    if (groupe.coach_id) {
      let coachData = null;

      // 1. Chercher dans utilisateurs (coachs avec compte auth)
      const { data: userCoach, error: errU } = await supabase
        .from("utilisateurs")
        .select("id,nom,prenom,email,telephone,avatar_url")   // avatar_url (pas photo_url)
        .eq("id", groupe.coach_id)
        .maybeSingle();
      if (errU) console.warn("coach utilisateurs lookup error:", errU.message);
      if (userCoach) {
        coachData = {
          nom:       `${userCoach.prenom||""} ${userCoach.nom||""}`.trim(),
          email:     userCoach.email      || null,
          telephone: userCoach.telephone  || null,
          photo_url: userCoach.avatar_url || null,
          grade:     null,
        };
      }

      // 2. Fallback : chercher dans coachs (display-only ou doublon)
      if (!coachData) {
        const { data: displayCoach, error: errC } = await supabase
          .from("coachs")
          .select("id,nom,prenom,email_professionnel,grade,photo_url")
          .eq("id", groupe.coach_id)
          .maybeSingle();
        if (errC) console.warn("coach coachs lookup error:", errC.message);
        if (displayCoach) {
          coachData = {
            nom:       `${displayCoach.prenom||""} ${displayCoach.nom||""}`.trim(),
            email:     displayCoach.email_professionnel || null,
            telephone: null,
            photo_url: displayCoach.photo_url || null,
            grade:     displayCoach.grade     || null,
          };
        }
      }

      if (coachData) {
        groupe = {
          ...groupe,
          coach_nom:       coachData.nom,
          coach_email:     coachData.email,
          coach_telephone: coachData.telephone,
          coach_photo_url: coachData.photo_url,
          coach_grade:     coachData.grade,
        };
      } else {
        console.warn(`Coach ${groupe.coach_id} introuvable dans utilisateurs ni coachs`);
      }
    }

    // Enrichir avec le centre - supporte UUID ET clé texte (ex: "angre")
    if (groupe.centre_id) {
      // 1. Essai table centres (UUID ou texte)
      const { data: centreDb } = await supabase
        .from("centres")
        .select("id,nom,ville,adresse")
        .or(`id.eq.${groupe.centre_id},nom.ilike.${groupe.centre_id}`)
        .maybeSingle();
      if (centreDb) {
        groupe = { ...groupe, centre_nom: centreDb.nom, centre_ville: centreDb.ville, centre_adresse: centreDb.adresse };
      } else {
        // 2. Fallback plateforme_config.centres_master (clés textuelles)
        const { data: cfg } = await supabase
          .from("plateforme_config")
          .select("valeur")
          .eq("key", "centres_master")         // colonne = "key" (pas "cle")
          .maybeSingle();
        const raw = cfg?.valeur;
        const centresMaster = Array.isArray(raw) ? raw : [];
        const cm = centresMaster.find(c => c.key === groupe.centre_id || c.name?.toLowerCase() === groupe.centre_id?.toLowerCase());
        if (cm) {
          groupe = { ...groupe, centre_nom: cm.name, centre_ville: null, centre_adresse: cm.addr || null };
        } else {
          // 3. Utiliser la clé brute comme nom lisible
          groupe = { ...groupe, centre_nom: groupe.centre_id };
        }
      }
    }

    // "transfere" exclu : l'apprenant a quitté ce groupe (ligne conservée en base pour
    // l'historique, mais ne doit plus apparaître dans son roster actuel).
    const { data: apprenants } = await supabase
      .from("groupes_apprenants").select("*").eq("groupe_id", id).neq("statut", "transfere").order("date_ajout");

    // Récupérer acces_bloque depuis app_metadata Supabase Auth (source de vérité)
    const apprenantIds = (apprenants || []).map(a => a.apprenant_id).filter(Boolean);
    let accesBloquéMap = {};
    if (apprenantIds.length) {
      const authResults = await Promise.all(
        apprenantIds.map(uid =>
          supabase.auth.admin.getUserById(uid)
            .then(({ data }) => ({ id: uid, acces_bloque: data?.user?.app_metadata?.acces_bloque || false }))
            .catch(() => ({ id: uid, acces_bloque: false }))
        )
      );
      authResults.forEach(r => { accesBloquéMap[r.id] = r.acces_bloque; });
    }

    const { data: fichiers } = await supabase
      .from("groupes_fichiers").select("*").eq("groupe_id", id).order("created_at", { ascending: false });

    // Enrichir chaque apprenant avec le nom de l'onboarding (added_by → utilisateurs)
    const assistantIds = [...new Set((apprenants || []).map(a => a.added_by).filter(Boolean))];
    let assistants = {};
    if (assistantIds.length) {
      const { data: users } = await supabase
        .from("utilisateurs").select("id,nom,prenom,role").in("id", assistantIds);
      (users || []).forEach(u => { assistants[u.id] = { nom: `${u.prenom} ${u.nom}`.trim(), role: u.role }; });
    }

    // Enrichir chaque apprenant avec l'assistante commerciale + email_parent + profil_type (assignations_parcours)
    const emails = (apprenants || []).map(a => a.email_apprenant).filter(Boolean);
    let commercialMap = {}; // email → { nom, prenom, telephone, photo_url }
    let emailParentMap2 = {}; // email_apprenant → email_parent
    let telephoneParentMap2 = {}; // email_apprenant → telephone_parent
    let nomParentMap2 = {}; // email_apprenant → nom_parent
    let profilTypeMap2 = {}; // email_apprenant → profil_type
    const dossierParEmail = {};
    if (emails.length) {
      const { data: assignations } = await supabase
        .from("assignations_parcours")
        .select("prospect_email, nom_parent, email_parent, telephone_parent, profil_type, objectif_client, niveau_client, suivi_demarrage, assistantes(id, nom, prenom, telephone, photo_url)")
        .in("prospect_email", emails);
      (assignations || []).forEach(row => {
        const key = (row.prospect_email || "").toLowerCase();
        if (key && !dossierParEmail[key]) dossierParEmail[key] = row;
        if (key && row.assistantes && !commercialMap[key]) {
          commercialMap[key] = row.assistantes;
        }
        if (key && row.email_parent && !emailParentMap2[key]) {
          emailParentMap2[key] = row.email_parent;
        }
        if (key && row.telephone_parent && !telephoneParentMap2[key]) {
          telephoneParentMap2[key] = row.telephone_parent;
        }
        if (key && row.nom_parent && !nomParentMap2[key]) {
          nomParentMap2[key] = row.nom_parent;
        }
        if (key && row.profil_type && !profilTypeMap2[key]) {
          profilTypeMap2[key] = row.profil_type;
        }
      });
    }

    // Lien direct assignation_id (stocké dans `note` à la création de la classe privée) -
    // prioritaire sur le match par email, qui échoue quand prospect_email (le parent) diffère
    // de email_apprenant (l'email de connexion propre à l'enfant). Cf. même correctif dans
    // GET /apprenants (vue plate) ci-dessus.
    const assignationIdsNote2 = [...new Set((apprenants || []).map(a => {
      try { return JSON.parse(a.note || "{}").assignation_id || null; } catch { return null; }
    }).filter(Boolean))];
    let assignationByIdMap2 = {};
    if (assignationIdsNote2.length) {
      const { data: assById2 } = await supabase
        .from("assignations_parcours")
        .select("id, nom_parent, email_parent, telephone_parent, profil_type, objectif_client, niveau_client, suivi_demarrage, assistantes(id, nom, prenom, telephone, photo_url)")
        .in("id", assignationIdsNote2);
      (assById2 || []).forEach(row => { assignationByIdMap2[row.id] = row; });
    }

    // Photo de l'apprenant - via son compte utilisateurs (apprenant_id si déjà
    // rattaché, sinon repli sur email_apprenant, comme pour l'assistante commerciale
    // ci-dessus). apprenantIds/emails déjà collectés plus haut.
    let avatarParApprenantId = {};
    if (apprenantIds.length) {
      const { data: comptesAvatarId } = await supabase.from("utilisateurs").select("id, avatar_url").in("id", apprenantIds);
      (comptesAvatarId || []).forEach(u => { if (u.avatar_url) avatarParApprenantId[u.id] = u.avatar_url; });
    }
    let avatarParEmailApp = {};
    if (emails.length) {
      const { data: comptesAvatarEmail } = await supabase.from("utilisateurs").select("email, avatar_url").in("email", emails);
      (comptesAvatarEmail || []).forEach(u => { if (u.avatar_url) avatarParEmailApp[(u.email||"").toLowerCase()] = u.avatar_url; });
    }

    // Assiduité de chaque apprenant, calculée depuis `groupes_presences` - la table où le
    // coach pointe réellement. L'écran du superviseur affichait des colonnes « Présences » et
    // « Absences » alimentées par des champs qui n'existaient nulle part : elles montraient
    // « - » quoi qu'il arrive, alors que le pointage est bien là.
    //
    // Le rapprochement se fait sur `ga_id` quand il est présent, et à défaut sur le nom :
    // les lignes anciennes ne le portent pas toujours.
    const presencesParApprenant = {};
    {
      const { data: presencesGroupe } = await supabase
        .from("groupes_presences")
        .select("ga_id, nom_apprenant, prenom_apprenant, statut")
        .eq("groupe_id", id);
      const cle = (gaId, prenom, nom) =>
        gaId || `${(prenom || "").trim().toLowerCase()}|${(nom || "").trim().toLowerCase()}`;
      for (const pr of presencesGroupe || []) {
        const k = cle(pr.ga_id, pr.prenom_apprenant, pr.nom_apprenant);
        const e = (presencesParApprenant[k] ??= { presences: 0, absences: 0, retards: 0, total: 0 });
        e.total++;
        if (pr.statut === "present")      e.presences++;
        else if (pr.statut === "retard") { e.retards++; e.presences++; }   // un retard reste une présence
        else if (pr.statut === "absent")  e.absences++;
      }
    }

    const apprenantesEnrichis = (apprenants || []).map(a => {
      const addedByData = a.added_by ? (assistants[a.added_by] || null) : null;
      const emailKey = (a.email_apprenant || "").toLowerCase();
      let noteObj2 = {};
      try { noteObj2 = JSON.parse(a.note || "{}"); } catch {}
      const byId2 = noteObj2.assignation_id ? assignationByIdMap2[noteObj2.assignation_id] : null;
      return {
        ...a,
        assistante_onboarding:      addedByData ? addedByData.nom  : null,
        assistante_onboarding_role: addedByData ? addedByData.role : null,
        assistante_nom:             addedByData ? addedByData.nom  : null,
        // Même raison qu'au premier enrichissement : sans l'identifiant du dossier,
        // l'écran ne peut pas en changer l'assistante.
        assignation_id:             byId2?.id ?? null,
        assistante_commerciale:     byId2?.assistantes ?? (emailKey ? (commercialMap[emailKey] || null) : null),
        nom_parent:                 byId2?.nom_parent ?? (emailKey ? (nomParentMap2[emailKey] || null) : null),
        email_parent:               byId2?.email_parent ?? (emailKey ? (emailParentMap2[emailKey] || null) : null),
        telephone_parent:           byId2?.telephone_parent ?? (emailKey ? (telephoneParentMap2[emailKey] || null) : null),
        profil_type:                byId2?.profil_type ?? (emailKey ? (profilTypeMap2[emailKey] || null) : null),
        /* L'OBJECTIF DE L'APPRENANT suit le dossier jusqu'au coach. C'est ce que le
           conseiller pédagogique a lu pour choisir ce coach-là ; celui-ci doit savoir ce
           qu'on attend de lui, sans avoir à le demander à quelqu'un. */
        objectif_client:            byId2?.objectif_client ?? (emailKey ? (dossierParEmail[emailKey]?.objectif_client || null) : null),
        niveau_client:              byId2?.niveau_client   ?? (emailKey ? (dossierParEmail[emailKey]?.niveau_client   || null) : null),
        assignation_id:             noteObj2.assignation_id || null,
        acces_bloque:               a.apprenant_id ? (accesBloquéMap[a.apprenant_id] || false) : false,
        avatar_url:                 (a.apprenant_id && avatarParApprenantId[a.apprenant_id]) || avatarParEmailApp[emailKey] || null,
        ...(() => {
          const k = presencesParApprenant[a.id]
            ? a.id
            : `${(a.prenom_apprenant || "").trim().toLowerCase()}|${(a.nom_apprenant || "").trim().toLowerCase()}`;
          const st = presencesParApprenant[k];
          return {
            presences:   st?.presences ?? 0,
            absences:    st?.absences  ?? 0,
            retards:     st?.retards   ?? 0,
            seances_pointees: st?.total ?? 0,
            // `null` et non 0 quand rien n'a été pointé : un taux de 0 % voudrait dire
            // « n'est jamais venu », ce qui n'est pas la même chose que « jamais pointé ».
            taux_presence: st?.total ? Math.round((st.presences / st.total) * 100) : null,
          };
        })(),
      };
    });

    // ?presence=true - utilisé par les écrans de prise de présence (séances à venir,
    // salle virtuelle) : exclut côté serveur les apprenants dont l'accès est bloqué,
    // même logique que bet-elearning (classesElearning.js GET /:id/apprenants?presence=true).
    // Centralise le filtre ici plutôt que de compter uniquement sur chaque liste
    // frontend pour l'appliquer elle-même (c'est cet oubli, sur une seule liste, qui
    // avait laissé un apprenant bloqué visible dans "Prendre la présence").
    const apprenantsFinal = req.query.presence === "true"
      ? apprenantesEnrichis.filter(a => a.statut === "actif" && !a.acces_bloque)
      : apprenantesEnrichis;

    // ── Lieu réel d'un coaching privé ────────────────────────────────────────
    // Une classe privée à domicile portait quand même le centre de la commerciale, et
    // les modals de détail affichaient « BET Angré » pour un cours donné chez l'apprenant
    // - l'adresse, pourtant importée, n'était visible nulle part. Elle vit dans le dossier
    // (suivi_demarrage), pas sur la classe : on la remonte ici, une fois, pour les trois
    // dashboards qui appellent cette route plutôt que de la refaire chercher par chacun.
    // `is_prive` d'abord, la capacité en repli : les classes créées avant l'écriture de
    // cette colonne n'ont que leur capacité pour dire ce qu'elles sont.
    if (groupe.is_prive === true || groupe.capacite_max === 1) {
      const premier = (apprenantsFinal || [])[0];
      let dossier = null;
      if (premier) {
        try {
          const idNote = JSON.parse(premier.note || "{}").assignation_id || null;
          if (idNote) dossier = assignationByIdMap2[idNote] || null;
        } catch { /* note non JSON : on retombe sur l'email */ }
        if (!dossier) dossier = dossierParEmail[(premier.email_apprenant || "").toLowerCase()] || null;
      }
      const sd = dossier?.suivi_demarrage || null;
      groupe.lieu_coaching    = sd?.lieu_coaching    || null;
      groupe.adresse_coaching = sd?.adresse_coaching || null;
    }

    res.json({ groupe, apprenants: apprenantsFinal, fichiers: fichiers || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur récupération groupe" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET  /api/groupes/:id/presences          - historique par date
   POST /api/groupes/:id/presences          - sauvegarder une séance
══════════════════════════════════════════════════════════════ */
// GET public - présences d'un apprenant spécifique (ga_id) dans un groupe
router.get("/:id/mes-presences", authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { ga_id } = req.query;
    if (!ga_id) return res.status(400).json({ error: "ga_id requis" });
    /* Le `ga_id` seul ne prouve rien : c'est un identifiant, pas un droit. Sans ce
       contrôle, la route rendait les présences de n'importe quel apprenant à qui savait
       lire un identifiant dans une réponse réseau. */
    if (!(await peutLireRattachement(req.user, ga_id))) {
      return res.status(403).json({ error: "Accès refusé à ces présences" });
    }
    const { data, error } = await supabase
      .from("groupes_presences")
      .select("date_seance, statut, note")
      .eq("groupe_id", id)
      .eq("ga_id", ga_id)
      .order("date_seance", { ascending: false });
    if (error) throw error;
    res.json({ presences: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur récupération présences" });
  }
});

router.get("/:id/presences", authenticateAdmin, requirePermission("presences", "read"), async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("groupes_presences").select("*").eq("groupe_id", id)
      .order("date_seance", { ascending: false });
    if (error) throw error;
    // Regrouper par date de séance
    const parDate = {};
    (data || []).forEach(p => {
      if (!parDate[p.date_seance]) parDate[p.date_seance] = [];
      parDate[p.date_seance].push(p);
    });
    res.json({ presences: data || [], parDate });
  } catch (err) {
    res.status(500).json({ error: "Erreur récupération présences" });
  }
});

// GET /api/groupes/:id/stats - KPI agrégés de la classe (taux de présence + note moyenne)
router.get("/:id/stats", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: presences, error: errPres } = await supabase
      .from("groupes_presences").select("statut").eq("groupe_id", id);
    if (errPres) throw errPres;
    const totalPresences = presences?.length || 0;
    const presents = (presences || []).filter(p => p.statut === "present").length;
    const tauxPresence = totalPresences ? Math.round((presents / totalPresences) * 100) : null;

    const { data: evals, error: errEvals } = await supabase
      .from("evaluations_groupes").select("id").eq("groupe_id", id);
    if (errEvals) throw errEvals;
    const evalIds = (evals || []).map(e => e.id);

    let noteMoyenne = null, totalNotes = 0;
    if (evalIds.length) {
      const { data: resultats, error: errRes } = await supabase
        .from("resultats_evaluations_groupes")
        .select("note, note_max")
        .in("evaluation_id", evalIds)
        .eq("statut", "corrige")
        .not("note", "is", null);
      if (errRes) throw errRes;
      totalNotes = resultats?.length || 0;
      if (totalNotes) {
        const somme = resultats.reduce((s, r) => s + (Number(r.note) / Number(r.note_max || 20)) * 20, 0);
        noteMoyenne = Math.round((somme / totalNotes) * 10) / 10;
      }
    }

    res.json({ taux_presence: tauxPresence, total_presences: totalPresences, note_moyenne: noteMoyenne, total_notes: totalNotes });
  } catch (err) {
    res.status(500).json({ error: "Erreur récupération statistiques classe" });
  }
});

// Écrire une feuille de présence n'était soumis à aucun droit : tout compte admin, quel que
// soit son rôle, pouvait marquer un apprenant absent - et donc déclencher l'auto-suspension
// de son accès quelques lignes plus bas. Le module `presences` ferme cela. Il exige `creer`
// et non `modifier` parce que la route est un upsert : elle supprime la feuille du jour avant
// de la réinsérer. Seul l'Espace Professeur appelle ce POST aujourd'hui.
router.post("/:id/presences", authenticateAdmin, requirePermission("presences", "create"), async (req, res) => {
  try {
    const { id } = req.params;
    const { date_seance, liste } = req.body;
    // liste = [{ ga_id, nom_apprenant, prenom_apprenant, statut, note }]
    if (!date_seance || !Array.isArray(liste) || !liste.length)
      return res.status(400).json({ error: "date_seance et liste[] requis" });

    const { data: groupePres } = await supabase.from("groupes").select("statut").eq("id", id).maybeSingle();
    if (groupePres?.statut === "cloture") return res.status(409).json({ error: "Classe clôturée - impossible d'enregistrer une présence" });
    const msgDelegueP = await refuserSiTitulaireDelegue(req.role === "coach" ? req.profil.id : null, id);
    if (msgDelegueP) return res.status(403).json({ error: msgDelegueP });

    // Supprimer l'éventuelle feuille existante pour cette date (upsert manuel)
    await supabase.from("groupes_presences").delete()
      .eq("groupe_id", id).eq("date_seance", date_seance);

    const rows = liste.map(l => ({
      groupe_id:        id,
      ga_id:            l.ga_id || null,
      nom_apprenant:    l.nom_apprenant,
      prenom_apprenant: l.prenom_apprenant || null,
      date_seance,
      statut:           l.statut || "present",
      note:             l.note || null,
      created_by:       req.profil.id,
    }));

    const { data, error } = await supabase.from("groupes_presences").insert(rows).select();
    if (error) throw error;

    // Vérifier auto-suspension pour chaque absent ayant un ga_id.
    // ATTENDU, pas lancé en arrière-plan : en serverless la fonction gèle dès la réponse
    // envoyée, et ce travail - blocage du compte ET email à l'apprenant - n'aurait aucune
    // garantie de s'exécuter (même classe de bug que les emails perdus corrigés ailleurs).
    // Les vérifications partent en parallèle : la latence reste celle d'une seule.
    const absentsAvecGaId = liste.filter(l => l.statut === "absent" && l.ga_id);
    await Promise.all(
      absentsAvecGaId.map(l =>
        checkAutoSuspension(l.ga_id, req.profil?.id)
          .catch(e => console.warn("[auto-suspension]", l.ga_id, e.message))),
    );

    // Gamification : points de présence pour les apprenants marqués présents/en retard.
    const presentsOuRetard = liste.filter(l => (l.statut === "present" || l.statut === "retard") && l.ga_id);
    if (presentsOuRetard.length) {
      const gaIdsPresents = presentsOuRetard.map(l => l.ga_id);
      supabase.from("groupes_apprenants").select("id, apprenant_id").in("id", gaIdsPresents)
        .then(({ data: gasPresents }) => {
          const apprenantIdParGa = {};
          (gasPresents || []).forEach(g => { if (g.apprenant_id) apprenantIdParGa[g.id] = g.apprenant_id; });
          presentsOuRetard.forEach(l => {
            const apprenantId = apprenantIdParGa[l.ga_id];
            if (!apprenantId) return;
            const points = l.statut === "present" ? 10 : 5;
            attribuerPoints(apprenantId, "session", l.ga_id, points, l.statut === "present" ? "Session - présent" : "Session - en retard").catch(() => {});
          });
        }).catch(() => {});
    }

    // Synchroniser dans seances_presences via la séance unifiée (si elle existe pour cette date)
    const { data: seanceUnif } = await supabase
      .from("seances")
      .select("id")
      .eq("groupe_id", id)
      .eq("date_seance", date_seance)
      .eq("circuit", "groupe")
      .maybeSingle();

    if (seanceUnif?.id) {
      await supabase.from("seances_presences").delete().eq("seance_id", seanceUnif.id);
      await supabase.from("seances_presences").insert(
        liste.map(l => ({
          seance_id:        seanceUnif.id,
          ga_id:            l.ga_id || null,
          nom_apprenant:    l.nom_apprenant,
          prenom_apprenant: l.prenom_apprenant || null,
          statut:           l.statut || "present",
          note_seance:      l.note || null,
        }))
      );
    }

    res.status(201).json({ message: "Présences enregistrées", presences: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur enregistrement présences" });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/groupes - créer un groupe (onboarding / admin)
══════════════════════════════════════════════════════════════ */
router.post("/", authenticateAdmin, requirePermission("classes", "create"), async (req, res) => {
  try {
    const { nom, niveau, filiere, type_cours, coach_id, centre_id, horaire, date_debut, date_fin, capacite_max, is_prive, photo_url } = req.body;
    if (!nom) return res.status(400).json({ error: "Le nom du groupe est requis" });

    /* La photo de la classe. C'est LA MÊME image que celle du fil de discussion de cette
       classe - `ChatGroupe` lit `groupe.photo_url` sans distinguer classe et groupe libre -
       pour qu'un apprenant ne voie pas deux visuels différents désigner le même endroit. */
    const photoCreation = photoValide(photo_url);
    if (photoCreation === undefined) return res.status(400).json({ error: "Photo de classe invalide." });

    const createdByNom = [req.profil.prenom, req.profil.nom].filter(Boolean).join(" ") || req.profil.email || "Inconnu";

    const payload = {
      nom,
      niveau:          niveau       || null,
      type_cours:      type_cours   || "en_ligne",
      coach_id:        coach_id     || null,
      centre_id:       centre_id    || null,   // TEXT (ex: "angre", "cocody")
      horaire:         horaire      || [],
      date_debut:      date_debut   || null,
      date_fin:        date_fin     || null,
      capacite_max:    capacite_max || 20,
      /* QU'UNE CLASSE SOIT PRIVÉE DOIT ÊTRE ÉCRIT, PAS DEVINÉ.
         Jusqu'ici, « privé » se déduisait de `capacite_max === 1`, à seize endroits du code.
         Cette déduction interdisait le cas le plus banal du coaching privé : un couple ou
         une famille qui s'inscrit ensemble. Monter la capacité à 3 pour les loger faisait
         basculer la classe en « groupe » partout - planning, écrans du PA, du coach,
         indicateurs - sans que personne l'ait demandé.
         La colonne existait depuis le début et n'était jamais écrite. Elle l'est désormais,
         et `capacite_max` redevient ce qu'elle dit être : une capacité. */
      is_prive:        is_prive === true || capacite_max === 1 || capacite_max === "1",
      photo_url:       photoCreation,
      statut:          "actif",
      created_by:      req.profil.id,
      created_by_nom:  createdByNom,
      created_by_role: req.role || null,
    };

    // filiere : colonne optionnelle - on tente avec, et on retente sans si absente en DB
    if (filiere) payload.filiere = filiere;

    let { data: groupe, error } = await supabase
      .from("groupes")
      .insert(payload)
      .select().single();

    if (error && filiere && (
      error.code === "42703" || error.code === "PGRST204" ||
      (error.message || "").toLowerCase().includes("filiere") ||
      (error.message || "").includes("Could not find") ||
      (error.message || "").includes("column")
    )) {
      console.warn("Colonne 'filiere' absente, réessai sans filiere :", error.message);
      const { filiere: _f, ...payloadSans } = payload;
      const retry = await supabase.from("groupes").insert(payloadSans).select().single();
      groupe = retry.data;
      error  = retry.error;
    }

    // created_by_role : colonne optionnelle (migration à jouer, cf. sql/groupes_created_by_role_migration.sql)
    if (error && (
      error.code === "42703" || error.code === "PGRST204" ||
      (error.message || "").toLowerCase().includes("created_by_role") ||
      (error.message || "").includes("Could not find") ||
      (error.message || "").includes("column")
    )) {
      console.warn("Colonne 'created_by_role' absente, réessai sans :", error.message);
      const { created_by_role: _r, ...payloadSansRole } = payload;
      const retry = await supabase.from("groupes").insert(payloadSansRole).select().single();
      groupe = retry.data;
      error  = retry.error;
    }

    // is_prive : même prudence que ci-dessus. La colonne existe en base, mais une création
    // de classe ne doit pas échouer pour un champ de confort - la détection garde de toute
    // façon son repli sur `capacite_max === 1`.
    if (error && (
      error.code === "42703" || error.code === "PGRST204" ||
      (error.message || "").toLowerCase().includes("is_prive") ||
      (error.message || "").includes("Could not find") ||
      (error.message || "").includes("column")
    )) {
      console.warn("Colonne 'is_prive' absente, réessai sans :", error.message);
      const { is_prive: _p, ...payloadSansPrive } = payload;
      const retry = await supabase.from("groupes").insert(payloadSansPrive).select().single();
      groupe = retry.data;
      error  = retry.error;
    }

    if (error) {
      console.error("Supabase groupes insert error:", JSON.stringify(error));
      return res.status(500).json({ error: error.message || "Erreur création groupe", code: error.code, detail: error.details });
    }

    // Notifier le coach assigné
    if (coach_id) {
      const coachUserId = await resolveCoachUserId(coach_id);
      if (coachUserId) {
        const isPrivate = (is_prive === true || capacite_max === 1 || capacite_max === "1");
        if (isPrivate) {
          const lieuLabel = type_cours === "domicile" ? "🏠 À domicile"
                          : type_cours === "centre"   ? "🏢 Au cabinet"
                          : "🔒 Coaching privé";
          const horaireStr = Array.isArray(horaire) && horaire.length > 0
            ? horaire.map(h => `${h.jour} ${h.debut}–${h.fin}`).join(", ")
            : null;
          const msgParts = [
            `Votre planning de coaching privé est prêt.`,
            `Apprenant : ${nom.replace(/^Coaching privé\s*-\s*/i, "")}`,
            `Lieu : ${lieuLabel}`,
            horaireStr ? `Planning : ${horaireStr}` : null,
            date_debut ? `Début : ${date_debut}` : null,
          ].filter(Boolean).join("\n");
          await sendNotif(coachUserId, {
            type:    "assignation",
            titre:   `📅 Planning confirmé - ${nom}`,
            message: msgParts,
          });
        } else {
          await sendNotif(coachUserId, {
            type:    "assignation",
            titre:   "Nouveau groupe assigné",
            message: `Le groupe "${nom}" ${niveau ? `(${niveau})` : ""} vous a été assigné. ${date_debut ? `Début : ${date_debut}.` : ""}`,
          });
        }
      }
    }

    // Notifier l'assistant e-learning + le PA advisor + le SuperAdmin (visibilité totale
    // sur toute création de classe, manuelle ou importée en masse)
    const auteurNom = [req.profil.prenom, req.profil.nom].filter(Boolean).join(" ") || req.profil.email;
    await notifyRole(["assistant_elearning", "admin_elearning"], {
      type:    "cours",
      titre:   `📚 Nouvelle classe créée : ${nom}`,
      message: `La classe "${nom}"${niveau ? ` (${niveau})` : ""} a été créée par ${auteurNom}.`,
      meta:    { groupe_id: groupe.id },
    });
    await notifyRole(["pedagogical_advisor", "admin_pa_advisor", ...ROLES_SUPERVISION_GLOBALE], {
      type:    "cours",
      titre:   `📚 Nouvelle classe : ${nom}`,
      message: `La classe "${nom}"${niveau ? ` (${niveau})` : ""} a été créée par ${auteurNom}. Vérifiez le programme pédagogique.`,
      meta:    { groupe_id: groupe.id },
    });
    await notifyRole(["super_admin"], {
      type:    "cours",
      titre:   `📚 Nouvelle classe créée : ${nom}`,
      message: `La classe "${nom}"${niveau ? ` (${niveau})` : ""} a été créée par ${auteurNom} (${req.role}).`,
      meta:    { groupe_id: groupe.id },
    });
    res.status(201).json({ message: "Groupe créé", groupe });
  } catch (err) {
    console.error("POST /api/groupes erreur:", err);
    res.status(500).json({ error: err.message || "Erreur création groupe" });
  }
});

/* ══════════════════════════════════════════════════════════════
   PATCH /api/groupes/:id - modifier un groupe
══════════════════════════════════════════════════════════════ */
router.patch("/:id", authenticateAdmin, requirePermission("classes", "update"), async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ["nom","niveau","filiere","type_cours","coach_id","centre_id","horaire","date_debut","date_fin","statut","capacite_max","created_by_nom","is_prive"];
    // Un champ vidé dans un formulaire arrive en chaîne vide, que Postgres refuse sur une
    // colonne date ou uuid ("invalid input syntax for type date"). La création normalisait
    // déjà (date_fin || null) ; la modification, elle, recopiait tel quel - d'où l'échec
    // dès qu'une classe sans date de fin ou sans coach était modifiée.
    const VIDE_VAUT_NULL = new Set(["date_debut", "date_fin", "coach_id", "centre_id"]);
    const updates = {};
    allowed.forEach(k => {
      if (req.body[k] === undefined) return;
      const v = req.body[k];
      updates[k] = (VIDE_VAUT_NULL.has(k) && v === "") ? null : v;
    });

    /* La photo passe par sa propre validation plutôt que par `allowed` : la recopie générique
       ci-dessus accepterait n'importe quelle chaîne, et celle-ci finit dans un attribut `src`
       chez tous les apprenants de la classe. Une valeur vide efface la photo - c'est ainsi
       qu'on en retire une - tandis qu'une valeur inexploitable est refusée. */
    if (req.body.photo_url !== undefined) {
      const photo = photoValide(req.body.photo_url);
      if (photo === undefined) return res.status(400).json({ error: "Photo de classe invalide." });
      updates.photo_url = photo;
    }

    const { data: ancien } = await supabase.from("groupes").select("coach_id,nom,statut,capacite_max,is_prive").eq("id", id).single();
    if (!ancien) return res.status(404).json({ error: "Groupe introuvable" });
    if (ancien.statut === "cloture") return res.status(409).json({ error: "Classe clôturée - modification impossible" });

    /* ── LE PIÈGE DE L'AUGMENTATION DE CAPACITÉ ──────────────────────────────────────
       Avant que `is_prive` soit écrit, une classe privée ne se reconnaissait qu'à sa
       capacité de 1. Passer cette capacité à 3 pour y loger une famille effaçait donc le
       SEUL signal qui la disait privée : le badge disparaissait, et tous les écrans la
       traitaient soudain comme une classe de groupe. C'est exactement ce que fait un
       utilisateur qui vient d'apprendre qu'il peut inscrire un couple.

       On marque donc la classe AVANT d'appliquer la modification : si elle était privée à
       l'ancienne (capacité 1, `is_prive` jamais renseigné), elle le reste explicitement.
       La donnée se répare ainsi d'elle-même au fil des modifications, sans reprise globale
       et sans qu'aucun utilisateur ait à savoir que cette colonne existe.

       `is_prive !== true` et non `is_prive == null` : la colonne a une valeur PAR DÉFAUT
       à `false`. Elle ne vaut donc jamais null, et un test sur null ne rattrape rien -
       erreur que j'ai commise en supposant la forme de la donnée au lieu de la lire.
       Comme rien n'a jamais écrit cette colonne, `false` y signifie « jamais renseignée »,
       pas « explicitement pas privée ». */
    if (ancien.is_prive !== true && ancien.capacite_max === 1 && updates.is_prive === undefined) {
      updates.is_prive = true;
    }
    const msgDelegueEdit = await refuserSiTitulaireDelegue(req.role === "coach" ? req.profil.id : null, id);
    if (msgDelegueEdit) return res.status(403).json({ error: msgDelegueEdit });

    const { data, error } = await supabase.from("groupes").update(updates).eq("id", id).select().single();
    if (error) {
      console.error("Supabase groupes update error:", JSON.stringify(error));
      return res.status(500).json({ error: error.message || "Erreur mise à jour groupe", code: error.code });
    }

    // Si le coach change, notifier le nouveau - et réattribuer ce qui va avec, exactement comme
    // /suspendre-coach (délégation active + séances futures non terminées + sessions_live) :
    // ce PATCH générique reste le seul chemin pour assigner un coach à un groupe encore sans
    // titulaire, mais il peut aussi être appelé sur un groupe qui a déjà des séances
    // programmées - sans cette réattribution elles restaient orphelines de l'ancien coach_id.
    if (updates.coach_id && updates.coach_id !== ancien?.coach_id) {
      await sendNotif(updates.coach_id, {
        type: "assignation",
        titre: "Nouveau groupe assigné",
        message: `Le groupe "${ancien?.nom || data.nom}" vous a été assigné.`,
      });

      const { data: delegationsActives } = await supabase.from("delegations")
        .select("id, remplacement_id").eq("groupe_id", id).eq("statut", "active");
      if (delegationsActives?.length) {
        await supabase.from("delegations").update({ statut: "terminee", updated_at: new Date().toISOString() })
          .eq("groupe_id", id).eq("statut", "active").then(({ error: e }) => { if (e) console.error("[groupes PATCH] clôture délégation active:", e.message); });
        const remplacementIds = delegationsActives.map(d => d.remplacement_id).filter(Boolean);
        if (remplacementIds.length) {
          await supabase.from("remplacements").update({ statut: "termine", updated_at: new Date().toISOString() })
            .in("id", remplacementIds).neq("statut", "termine").then(({ error: e }) => { if (e) console.error("[groupes PATCH] clôture remplacement lié:", e.message); });
        }
      }

      if (ancien?.coach_id) {
        const STATUTS_TERMINAUX = ["realisee", "annulee", "coach_absent", "apprenant_absent"];
        const { data: seancesFutures } = await supabase.from("seances")
          .update({ coach_id: updates.coach_id })
          .eq("groupe_id", id).eq("coach_id", ancien.coach_id)
          .not("statut", "in", `(${STATUTS_TERMINAUX.join(",")})`)
          .select("id");
        if (seancesFutures?.length) {
          const ids = seancesFutures.map(s => s.id);
          await supabase.from("sessions_live").update({ coach_id: updates.coach_id }).in("seance_id", ids)
            .then(({ error: e }) => { if (e) console.error("[groupes PATCH] transfert sessions_live:", e.message); });
        }
      }

      // Notifier Onboarding en retour - jusqu'ici, quand le PA assignait (ou changeait) le
      // coach d'un groupe, Onboarding n'était jamais informé que le dossier qu'il avait
      // affecté était désormais pourvu d'un coach.
      const { data: nouveauCoachInfo } = await supabase
        .from("utilisateurs").select("nom,prenom").eq("id", updates.coach_id).maybeSingle();
      const nouveauCoachNomOb = nouveauCoachInfo ? `${nouveauCoachInfo.prenom||""} ${nouveauCoachInfo.nom||""}`.trim() : "un coach";
      notifyRole("onboarding", {
        type:    "assignation",
        titre:   `👨‍🏫 Coach assigné - ${ancien?.nom || data.nom}`,
        message: `Le PA Advisor a assigné ${nouveauCoachNomOb} à la classe "${ancien?.nom || data.nom}".`,
        meta:    { groupe_id: id, coach_id: updates.coach_id },
        source:  "dash",
      }).catch(() => {});

      // Prévenir aussi l'assistante (en ligne ou présentiel) à l'origine du dossier -
      // jusqu'ici elle n'était jamais informée que le PA venait d'affecter un coach à la
      // classe (groupe ou coaching privé) de son prospect.
      (async () => {
        try {
          const { data: gaRow } = await supabase
            .from("groupes_apprenants")
            .select("note")
            .eq("groupe_id", id)
            .order("date_ajout", { ascending: false })
            .limit(1)
            .maybeSingle();
          let assignationId = null;
          try { assignationId = JSON.parse(gaRow?.note || "null")?.assignation_id || null; } catch { /* note pas JSON */ }
          if (!assignationId) {
            const m = gaRow?.note?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
            assignationId = m?.[0] || null;
          }
          if (!assignationId) return;
          const { data: asg } = await supabase
            .from("assignations_parcours")
            .select("prospect_nom, assistante_id, assistantes(email)")
            .eq("id", assignationId)
            .maybeSingle();
          if (!asg?.assistantes?.email) return;
          const { data: u } = await supabase
            .from("utilisateurs").select("id").ilike("email", asg.assistantes.email.trim()).maybeSingle();
          if (!u?.id) return;
          await notifyUser(u.id, {
            type:    "assignation",
            titre:   `👨‍🏫 Coach assigné - ${asg.prospect_nom || ancien?.nom || data.nom}`,
            message: `Le PA Advisor a assigné ${nouveauCoachNomOb} à la classe de ${asg.prospect_nom || "votre prospect"}.`,
            meta:    { groupe_id: id, coach_id: updates.coach_id, assignation_id: assignationId },
            source:  "dash",
          });
        } catch (e) { console.warn("[groupes PATCH] notif assistante coach assigné échouée:", e.message); }
      })();
    }

    // Notifier l'assistant e-learning de la modification
    const auteurNom = [req.profil.prenom, req.profil.nom].filter(Boolean).join(" ") || req.profil.email;
    const champsModifies = Object.keys(updates).join(", ");
    await notifyRole(["assistant_elearning", "admin_elearning"], {
      type:    "cours",
      titre:   `✏️ Classe modifiée : ${ancien?.nom || data.nom}`,
      message: `La classe "${ancien?.nom || data.nom}" a été modifiée par ${auteurNom} (${champsModifies}).`,
      meta:    { groupe_id: id },
    });

    res.json({ message: "Groupe mis à jour", groupe: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur mise à jour groupe" });
  }
});

// ── PATCH /api/groupes/:id/suspendre-coach ──────────────────────────────────
// Suspension DÉFINITIVE d'un coach sur un groupe présentiel - équivalent dash de
// PATCH /api/classes-elearning/:id/suspendre-coach (bet-elearning), qui n'avait pas
// d'équivalent ici (le seul moyen de changer coach_id était le PATCH /:id générique
// ci-dessus, sans motif, sans transfert du contenu pédagogique). Distincte du
// remplacement TEMPORAIRE (voir Backend/src/routes/remplacements.js) : ici le nouveau
// coach devient titulaire à part entière, sans date de fin.
router.patch("/:id/suspendre-coach", authenticateAdmin, requirePermission("classes", "update"), async (req, res) => {
  try {
    const { nouveau_coach_id, motif } = req.body;
    if (!nouveau_coach_id) return res.status(400).json({ error: "nouveau_coach_id est requis" });
    if (!motif?.trim())    return res.status(400).json({ error: "Un motif est requis pour une suspension définitive" });

    const { data: avant, error: eAvant } = await supabase
      .from("groupes").select("id, nom, niveau, coach_id, statut").eq("id", req.params.id).single();
    if (eAvant || !avant) return res.status(404).json({ error: "Groupe introuvable" });
    if (avant.statut === "cloture") return res.status(409).json({ error: "Groupe clôturé - transfert impossible" });
    if (nouveau_coach_id === avant.coach_id) return res.status(400).json({ error: "Ce coach est déjà titulaire de ce groupe" });

    const ancienCoachId = avant.coach_id;
    const [{ data: ancienCoach }, { data: nouveauCoach }] = await Promise.all([
      ancienCoachId ? supabase.from("utilisateurs").select("nom,prenom").eq("id", ancienCoachId).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("utilisateurs").select("nom,prenom").eq("id", nouveau_coach_id).maybeSingle(),
    ]);
    const ancienCoachNom  = ancienCoach  ? `${ancienCoach.prenom || ""} ${ancienCoach.nom || ""}`.trim()  : "le coach précédent";
    const nouveauCoachNom = nouveauCoach ? `${nouveauCoach.prenom || ""} ${nouveauCoach.nom || ""}`.trim() : "le nouveau coach";

    const { data, error } = await supabase
      .from("groupes")
      .update({ coach_id: nouveau_coach_id })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // Une délégation TEMPORAIRE encore active sur ce groupe (remplaçant B) devient incohérente
    // dès que le titulaire change définitivement (nouveau coach C) : B garderait un accès
    // (contexte de classe, séances) alors qu'il n'a plus de raison d'y être. On la clôture donc
    // ici, comme une clôture manuelle normale (même effet que "Clôturer la délégation" côté PA).
    const { data: delegationsActives } = await supabase.from("delegations")
      .select("id, remplacement_id").eq("groupe_id", req.params.id).eq("statut", "active");
    if (delegationsActives?.length) {
      const { error: eDelegClot } = await supabase.from("delegations")
        .update({ statut: "terminee", updated_at: new Date().toISOString() })
        .eq("groupe_id", req.params.id).eq("statut", "active");
      if (eDelegClot) console.error("[suspendre-coach dash] clôture délégation active:", eDelegClot.message);
      const remplacementIds = delegationsActives.map(d => d.remplacement_id).filter(Boolean);
      if (remplacementIds.length) {
        const { error: eRemplClot } = await supabase.from("remplacements")
          .update({ statut: "termine", updated_at: new Date().toISOString() })
          .in("id", remplacementIds).neq("statut", "termine");
        if (eRemplClot) console.error("[suspendre-coach dash] clôture remplacement lié:", eRemplClot.message);
      }
    }

    // Contexte pédagogique transféré - dash n'a pas d'équivalent devoirs/médiathèque par
    // groupe (contrairement à classes_elearning), seuls les fichiers partagés sont scopés
    // par coach_id ici.
    const { error: eFichiers } = await supabase.from("groupes_fichiers")
      .update({ coach_id: nouveau_coach_id }).eq("groupe_id", req.params.id);
    if (eFichiers) console.error("[suspendre-coach dash] transfert fichiers:", eFichiers.message);

    // Comptabilité jamais réécrite rétroactivement pour les séances déjà réalisées (l'historique
    // et les honoraires déjà calculés restent à l'ancien titulaire). MAIS les séances futures
    // déjà PLANIFIÉES au nom de l'ancien coach ne se réassignent jamais "naturellement" - elles
    // existent déjà en base avec son coach_id, et restent invisibles pour le nouveau titulaire
    // (planning, Session Live) tant qu'on ne les réattribue pas explicitement ici.
    const STATUTS_TERMINAUX = ["realisee", "annulee", "coach_absent", "apprenant_absent"];
    const { data: seancesFutures, error: eSeancesFutures } = await supabase
      .from("seances")
      .update({ coach_id: nouveau_coach_id })
      .eq("groupe_id", req.params.id)
      .eq("coach_id", ancienCoachId)
      .not("statut", "in", `(${STATUTS_TERMINAUX.join(",")})`)
      .select("id");
    if (eSeancesFutures) console.error("[suspendre-coach dash] transfert séances futures:", eSeancesFutures.message);

    // `sessions_live` (visio) est bridée à `seances` via `seance_id` mais jamais réassignée par
    // ce qui précède - même trou que celui déjà corrigé pour les délégations temporaires
    // (reattribuerEtRecalculer dans remplacements.js). Sans ce correctif, une séance live déjà
    // programmée restait ouvrable/visible chez l'ancien coach malgré sa suspension.
    const idsSeancesFutures = (seancesFutures || []).map(s => s.id);
    if (idsSeancesFutures.length) {
      const { error: eLive } = await supabase.from("sessions_live")
        .update({ coach_id: nouveau_coach_id }).in("seance_id", idsSeancesFutures);
      if (eLive) console.error("[suspendre-coach dash] transfert sessions_live (bridées):", eLive.message);
    }
    // Filet de sécurité pour les `sessions_live` sans `seance_id` (créées avant la migration du
    // pont vers `seances`, ou jamais liées) : réassignées directement par groupe_id.
    const { error: eLiveDirect } = await supabase.from("sessions_live")
      .update({ coach_id: nouveau_coach_id })
      .eq("groupe_id", req.params.id)
      .eq("coach_id", ancienCoachId)
      .is("seance_id", null)
      .not("statut", "in", "(terminee,annulee)");
    if (eLiveDirect) console.error("[suspendre-coach dash] transfert sessions_live (directes):", eLiveDirect.message);

    const dateLabel = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

    if (ancienCoachId) {
      await sendNotif(ancienCoachId, {
        type: "coach_suspendu", titre: "🔴 Fin de votre affectation sur un groupe",
        message: `Vous n'êtes plus titulaire du groupe "${avant.nom}" à compter du ${dateLabel}. Motif : ${motif.trim()}.`,
        meta: { groupe_id: avant.id },
      });
    }
    await sendNotif(nouveau_coach_id, {
      type: "coach_assigne", titre: `🏫 Vous êtes désormais titulaire - ${data.nom}`,
      message: `Vous remplacez définitivement ${ancienCoachNom} sur le groupe "${data.nom}"${data.niveau ? ` (${data.niveau})` : ""}.`,
      meta: { groupe_id: data.id },
    });

    // Apprenants actifs du groupe
    const { data: gas } = await supabase
      .from("groupes_apprenants").select("apprenant_id, email_apprenant").eq("groupe_id", req.params.id).eq("statut", "actif");
    if (gas?.length) {
      const userIds = [];
      for (const ga of gas) {
        if (ga.apprenant_id) userIds.push(ga.apprenant_id);
        else if (ga.email_apprenant) {
          const { data: u } = await supabase.from("utilisateurs").select("id").ilike("email", ga.email_apprenant).maybeSingle();
          if (u?.id) userIds.push(u.id);
        }
      }
      if (userIds.length) {
        await supabase.from("notifications").insert(userIds.map(user_id => ({
          user_id, type: "coach_change", titre: "🔁 Nouveau coach pour votre groupe",
          message: `${nouveauCoachNom} est désormais votre coach sur "${data.nom}".`,
          meta: { groupe_id: data.id }, lu: false, source: "dash",
        })));
      }
    }

    // PA/admin informés, même logique que côté bet-elearning - via notifyRole (résout aussi
    // super_admin, absent de la table utilisateurs, contrairement à l'ancienne requête directe
    // qui ne le trouvait jamais).
    const payloadDefinitif = {
      type: "coach_suspendu_definitif", titre: "🔴 Suspension définitive de coach",
      message: `${ancienCoachNom} a été suspendu définitivement du groupe "${data.nom}", remplacé par ${nouveauCoachNom}. Motif : ${motif.trim()}.`,
      meta: { groupe_id: data.id },
    };
    await notifyRole(["super_admin", "manager", "pedagogical_advisor", "onboarding", ...ROLES_SUPERVISION_GLOBALE], payloadDefinitif);
    // Les deputies qui suivent CE coach : eux seuls sont concernes, contrairement au
    // superviseur general qui suit tout le monde.
    await notifyDeputiesDuCoach(ancienCoachId, payloadDefinitif).catch(() => {});

    // Commerciale liée au groupe - absente jusqu'ici de la liste des destinataires (même
    // double résolution que pour les autres notifications de ce fichier : via
    // assignations_parcours→assistantes, sinon via groupe.created_by).
    (async () => {
      const commercialeIds = new Set();
      const emailsGroupe = (gas || []).map(g => g.email_apprenant).filter(Boolean);
      for (const email of emailsGroupe) {
        const { data: a } = await supabase
          .from("assignations_parcours").select("assistantes(email)").ilike("prospect_email", email).maybeSingle();
        if (a?.assistantes?.email) {
          const uid = await resolveAssistanteUserId(a.assistantes.email);
          if (uid) commercialeIds.add(uid);
        }
      }
      const { data: grpCreateur } = await supabase.from("groupes").select("created_by").eq("id", req.params.id).maybeSingle();
      if (grpCreateur?.created_by) {
        const { data: cr } = await supabase.from("utilisateurs").select("id, role").eq("id", grpCreateur.created_by).maybeSingle();
        if (cr && ["commercial", "onboarding", "assistant_elearning", "customer_care"].includes(cr.role))
          commercialeIds.add(cr.id);
      }
      if (commercialeIds.size) {
        await supabase.from("notifications").insert([...commercialeIds].map(user_id => ({
          user_id, ...payloadDefinitif, lu: false, source: "dash",
        })));
      }
    })().catch(() => {});

    req._auditLogged = true;
    logAudit({
      acteur_id:   req.profil?.id || null,
      acteur_nom:  `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || null,
      acteur_role: req.role || "admin",
      action_type: "COACH_SUSPENDU_DEFINITIF",
      module:      "groupes",
      entite_type: "groupes",
      entite_id:   data.id,
      detail:      `${ancienCoachNom} suspendu définitivement du groupe "${data.nom}", remplacé par ${nouveauCoachNom} - motif : ${motif.trim()}`,
      statut:      "warning",
    }).catch(() => {});

    res.json({ groupe: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/groupes/:id/apprenants - ajouter un apprenant
══════════════════════════════════════════════════════════════ */
router.post("/:id/apprenants", authenticateAdmin, requirePermission("inscriptions", "update"), async (req, res) => {
  try {
    const { id } = req.params;
    const { nom_apprenant, prenom_apprenant, email_apprenant, telephone, niveau, note, apprenant_id } = req.body;
    if (!nom_apprenant) return res.status(400).json({ error: "nom_apprenant requis" });

    const { data: groupe } = await supabase.from("groupes").select("coach_id,nom,niveau,statut").eq("id", id).single();
    if (!groupe) return res.status(404).json({ error: "Groupe introuvable" });
    if (groupe.statut === "cloture") return res.status(409).json({ error: "Classe clôturée - impossible d'y ajouter un apprenant" });
    const msgDelegueA1 = await refuserSiTitulaireDelegue(req.role === "coach" ? req.profil.id : null, id);
    if (msgDelegueA1) return res.status(403).json({ error: msgDelegueA1 });

    // Anti-doublon : empêche un double-clic, un import relancé ou une ré-inscription
    // manuelle d'ajouter deux fois la même personne dans la même classe. On matche
    // sur apprenant_id si connu (identité stable), sinon sur l'email (insensible à
    // la casse) - seules les lignes encore actives comptent (une ligne "retire" ne
    // bloque pas une réinscription légitime).
    if (apprenant_id || email_apprenant) {
      let dupQuery = supabase
        .from("groupes_apprenants")
        .select("id")
        .eq("groupe_id", id)
        .neq("statut", "retire");
      dupQuery = apprenant_id
        ? dupQuery.eq("apprenant_id", apprenant_id)
        : dupQuery.ilike("email_apprenant", email_apprenant.trim());
      const { data: doublon } = await dupQuery.limit(1).maybeSingle();
      if (doublon) {
        return res.status(409).json({ error: "Cette personne est déjà inscrite dans cette classe." });
      }
    }

    const { data, error } = await supabase
      .from("groupes_apprenants")
      .insert({ groupe_id: id, apprenant_id: apprenant_id || null, nom_apprenant, prenom_apprenant: prenom_apprenant || null, email_apprenant: email_apprenant || null, telephone: telephone || null, niveau: niveau || groupe.niveau, note: note || null, statut: "actif", added_by: req.profil.id })
      .select().single();
    if (error) throw error;

    // Notifier le coach - résoudre le vrai utilisateurs.id avant d'envoyer
    if (groupe.coach_id) {
      const nomComplet = [prenom_apprenant, nom_apprenant].filter(Boolean).join(" ");
      // coach_id peut pointer vers utilisateurs.id (compte auth) OU coachs.id (display-only)
      // On vérifie d'abord dans utilisateurs
      let coachUserId = null;
      const { data: coachUser } = await supabase
        .from("utilisateurs").select("id").eq("id", groupe.coach_id).maybeSingle();
      if (coachUser) {
        coachUserId = coachUser.id;
      } else {
        // Fallback : retrouver via email du coach display-only
        const { data: coachRec } = await supabase
          .from("coachs").select("email_professionnel").eq("id", groupe.coach_id).maybeSingle();
        if (coachRec?.email_professionnel) {
          const { data: userByEmail } = await supabase
            .from("utilisateurs").select("id").ilike("email", coachRec.email_professionnel).maybeSingle();
          if (userByEmail) coachUserId = userByEmail.id;
        }
      }
      if (coachUserId) {
        await sendNotif(coachUserId, {
          type: "inscription",
          titre: "Nouvel apprenant dans votre groupe",
          message: `${nomComplet} a été ajouté(e) au groupe "${groupe.nom}".`,
          meta: { groupe_id: id, groupe_nom: groupe.nom },
        });
      }
    }

    // Notifier l'assistant e-learning + admin_elearning
    const nomCompletAppr = [prenom_apprenant, nom_apprenant].filter(Boolean).join(" ");
    await notifyRole(["assistant_elearning", "admin_elearning"], {
      type:    "inscription",
      titre:   `🎓 Nouvel apprenant : ${nomCompletAppr}`,
      message: `${nomCompletAppr} a été ajouté(e) à la classe "${groupe.nom}".`,
      meta:    { groupe_id: id },
    });

    // Notifier le PA Advisor - oublié jusqu'ici : contrairement à la création d'une
    // nouvelle classe (POST /groupes), l'ajout d'un apprenant à une classe déjà
    // existante (cas courant Commercial/Onboarding) ne remontait à aucun PA Advisor.
    await notifyRole(["pedagogical_advisor", "admin_pa_advisor", ...ROLES_SUPERVISION_GLOBALE], {
      type:    "inscription",
      titre:   `🎓 Nouvel apprenant assigné : ${nomCompletAppr}`,
      message: `${nomCompletAppr} a été ajouté(e) à la classe "${groupe.nom}".`,
      meta:    { groupe_id: id },
    });

    // Notifier le SuperAdmin - visibilité totale sur toute inscription, manuelle ou importée.
    await notifyRole(["super_admin"], {
      type:    "inscription",
      titre:   `🎓 Nouvel apprenant : ${nomCompletAppr}`,
      message: `${nomCompletAppr} a été ajouté(e) à la classe "${groupe.nom}" par ${req.role}.`,
      meta:    { groupe_id: id },
    });

    // Notifier l'apprenant lui-même s'il a un compte
    if (apprenant_id) {
      await supabase.from("notifications").insert({
        user_id: apprenant_id,
        type:    "inscription",
        titre:   `🏫 Vous avez été ajouté(e) à une classe`,
        message: `Vous faites maintenant partie de la classe "${groupe.nom}"${groupe.niveau ? ` (${groupe.niveau})` : ""}. Votre coach vous contactera prochainement.`,
        lu:      false,
        meta:    { groupe_id: id },
        source:  'bet-elearning',
      });
    }

    // Notifier la RH entreprise de l'apprenant si applicable
    if (apprenant_id) {
      (async () => {
        try {
          const { data: apprUser } = await supabase.from("utilisateurs").select("entreprise_id").eq("id", apprenant_id).maybeSingle();
          if (apprUser?.entreprise_id) {
            const { data: rhUsers } = await supabase.from("utilisateurs").select("id")
              .eq("role", "client_entreprise").eq("entreprise_id", apprUser.entreprise_id).eq("actif", true);
            if (rhUsers?.length) {
              await supabase.from("notifications").insert(rhUsers.map(u => ({
                user_id: u.id, type: "inscription", lu: false,
                titre: `🎓 Apprenant ajouté à une classe`,
                message: `${nomCompletAppr} a été inscrit(e) à la classe "${groupe.nom}".`,
                meta: { groupe_id: id, apprenant_id },
                source: 'bet-elearning',
              })));
            }
          }
        } catch (e) {
          console.warn("[groupes] RH entreprise notif échouée:", e.message);
        }
      })();
    }

    // Création automatique du compte apprenant (et, en cascade, du compte parent si profil
    // enfant) dès l'inscription en classe - évite l'étape manuelle "Créer les accès" et les
    // incohérences qu'elle laissait traîner (email_apprenant jamais aligné, etc.).
    // Best-effort : n'affecte jamais la réponse d'inscription en cas d'échec, et ne se déclenche
    // que si aucun compte n'est déjà lié (apprenant_id absent de la requête).
    let accesAuto = null;
    if (!apprenant_id && nom_apprenant) {
      try {
        let emailParentAuto = null, telephoneParentAuto = null;
        if (email_apprenant) {
          const { data: assignRow } = await supabase
            .from("assignations_parcours")
            .select("email_parent, telephone_parent")
            .ilike("prospect_email", email_apprenant)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          emailParentAuto     = assignRow?.email_parent || null;
          telephoneParentAuto = assignRow?.telephone_parent || null;
        }
        const result = await creerAccesApprenantCore({
          nom:              nom_apprenant,
          prenom:           prenom_apprenant || null,
          email:            email_apprenant || null,
          telephone:        telephone || null,
          ga_id:            data.id,
          email_parent:     emailParentAuto,
          telephone_parent: telephoneParentAuto,
          acteur: {
            id: req.profil?.id || null, nom: req.profil?.nom, prenom: req.profil?.prenom,
            email: req.profil?.email || null, role: req.role || "onboarding",
            ip_address: req.headers["x-forwarded-for"] || req.ip || null,
          },
        });
        if (result.ok) {
          accesAuto = {
            user_id:                result.data.user_id,
            login_type:             result.data.login_type,
            login_identifier:       result.data.login_identifier,
            parent_account_created: result.data.parent_account_created,
          };
        } else {
          console.warn("[groupes] création auto compte apprenant refusée:", result.error);
        }
      } catch (e) {
        console.warn("[groupes] création auto compte apprenant échouée:", e.message);
      }
    }

    res.status(201).json({ message: "Apprenant ajouté", apprenant: data, acces_auto: accesAuto });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur ajout apprenant" });
  }
});

/* ══════════════════════════════════════════════════════════════
   DELETE /api/groupes/:id/apprenants/:aid - retirer un apprenant
══════════════════════════════════════════════════════════════ */
router.delete("/:id/apprenants/:aid", authenticateAdmin, requirePermission("classes", "delete"), async (req, res) => {
  try {
    const { id, aid } = req.params;

    const { data: apprenant } = await supabase.from("groupes_apprenants").select("*").eq("id", aid).single();
    const { data: groupe }    = await supabase.from("groupes").select("coach_id,nom").eq("id", id).single();
    const msgDelegueA2 = await refuserSiTitulaireDelegue(req.role === "coach" ? req.profil.id : null, id);
    if (msgDelegueA2) return res.status(403).json({ error: msgDelegueA2 });

    await supabase.from("groupes_apprenants")
      .update({ statut: "retire", date_retrait: new Date().toISOString() })
      .eq("id", aid);

    if (groupe?.coach_id && apprenant) {
      const nomComplet = [apprenant.prenom_apprenant, apprenant.nom_apprenant].filter(Boolean).join(" ");
      const coachUserId = await resolveCoachUserId(groupe.coach_id);
      if (coachUserId) await sendNotif(coachUserId, {
        type: "alerte",
        titre: "Apprenant retiré de votre groupe",
        message: `${nomComplet} a été retiré(e) du groupe "${groupe.nom}".`,
        meta: { groupe_id: id, groupe_nom: groupe.nom },
      });
    }

    res.json({ message: "Apprenant retiré" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur retrait apprenant" });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/groupes/:id/fichiers - partager un fichier
   DELETE /api/groupes/:id/fichiers/:fid - supprimer un fichier
══════════════════════════════════════════════════════════════ */
router.post("/:id/fichiers", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, url, public_id, type_fichier, taille_ko, visible } = req.body;
    if (!nom || !url) return res.status(400).json({ error: "nom et url requis" });
    const msgDelegueF1 = await refuserSiTitulaireDelegue(req.role === "coach" ? req.profil.id : null, id);
    if (msgDelegueF1) return res.status(403).json({ error: msgDelegueF1 });

    // visible peut être absent si la colonne n'existe pas encore - on l'insère conditionnellement
    const insertData = { groupe_id: id, coach_id: req.profil.id, nom, url, public_id: public_id || null, type_fichier: type_fichier || "autre", taille_ko: taille_ko || null };
    if (visible !== undefined) insertData.visible = visible !== false;

    const { data, error } = await supabase
      .from("groupes_fichiers")
      .insert(insertData)
      .select().single();
    if (error) throw error;

    // Notifier les apprenants du groupe (en arrière-plan, sans bloquer la réponse)
    res.status(201).json({ message: "Fichier partagé", fichier: data });

    // Récupérer les apprenants actifs du groupe pour leur envoyer une notification
    // (note incluse : nécessaire à resolveParentUserId pour retrouver le parent d'un enfant)
    const { data: gas } = await supabase
      .from("groupes_apprenants")
      .select("apprenant_id, email_apprenant, note")
      .eq("groupe_id", id)
      .eq("statut", "actif");

    if (gas?.length) {
      const typeIcon = { pdf:"📄", video:"🎬", audio:"🎧", lien:"🔗", speaking:"🎤" };
      const icon = typeIcon[type_fichier] || "📎";
      const nomGroupe = null; // Optionnel - on peut l'enrichir si besoin

      const userIds = [];
      for (const ga of gas) {
        if (ga.apprenant_id) {
          userIds.push(ga.apprenant_id);
        } else if (ga.email_apprenant) {
          // Résoudre l'email en user_id
          const { data: u } = await supabase
            .from("utilisateurs")
            .select("id")
            .ilike("email", ga.email_apprenant)
            .maybeSingle();
          if (u?.id) userIds.push(u.id);
        }
      }

      if (userIds.length) {
        const notifs = userIds.map(uid => ({
          user_id: uid,
          type: "ressource",
          titre: `${icon} Nouvelle ressource partagée`,
          message: `Votre coach vient de partager un fichier : "${nom}"`,
          meta: { fichier_id: data?.id, fichier_nom: nom, type_fichier, groupe_id: id },
          lu: false,
          source: 'bet-elearning',
        }));
        await supabase.from("notifications").insert(notifs);
      }

      // Notifier aussi le(s) parent(s) des enfants du groupe, best-effort.
      try {
        const notifsParents = [];
        for (const ga of gas) {
          const parentId = await resolveParentUserId(ga);
          if (parentId) {
            notifsParents.push({
              user_id: parentId,
              type: "ressource",
              titre: `${icon} Nouvelle ressource pour votre enfant`,
              message: `Le coach a partagé un nouveau fichier : "${nom}"`,
              meta: { fichier_id: data?.id, fichier_nom: nom, type_fichier, groupe_id: id },
              lu: false,
              source: 'bet-elearning',
            });
          }
        }
        if (notifsParents.length) await supabase.from("notifications").insert(notifsParents);
      } catch (e) {
        console.warn("[groupes] notif parent (fichier) échouée:", e.message);
      }
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur partage fichier" });
  }
});

router.patch("/:id/fichiers/:fid", authenticateAdmin, async (req, res) => {
  try {
    const { visible } = req.body;
    const msgDelegueF2 = await refuserSiTitulaireDelegue(req.role === "coach" ? req.profil.id : null, req.params.id);
    if (msgDelegueF2) return res.status(403).json({ error: msgDelegueF2 });
    const { data, error } = await supabase
      .from("groupes_fichiers")
      .update({ visible: visible !== false })
      .eq("id", req.params.fid)
      .select().single();
    if (error) throw error;
    res.json({ fichier: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur mise à jour fichier" });
  }
});

router.delete("/:id/fichiers/:fid", authenticateAdmin, async (req, res) => {
  try {
    const msgDelegueF3 = await refuserSiTitulaireDelegue(req.role === "coach" ? req.profil.id : null, req.params.id);
    if (msgDelegueF3) return res.status(403).json({ error: msgDelegueF3 });
    const { error } = await supabase.from("groupes_fichiers").delete().eq("id", req.params.fid);
    if (error) throw error;
    res.json({ message: "Fichier supprimé" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur suppression fichier" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET  /api/groupes/:id/cours         - historique des cours
   POST /api/groupes/:id/cours         - ajouter / mettre à jour un cours
   PATCH /api/groupes/:id/cours/:cid   - modifier une entrée
   DELETE /api/groupes/:id/cours/:cid  - supprimer une entrée
══════════════════════════════════════════════════════════════ */
router.get("/:id/cours", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { mois, annee, corbeille } = req.query;
    let q = supabase.from("groupes_cours").select("*").eq("groupe_id", id).order("date_cours", { ascending: false });
    if (corbeille === "true") {
      q = q.eq("statut", "corbeille");
    } else {
      q = q.neq("statut", "corbeille");
    }
    if (mois && annee) {
      const debut = `${annee}-${String(mois).padStart(2,"0")}-01`;
      const fin   = new Date(annee, mois, 0).toISOString().slice(0,10);
      q = q.gte("date_cours", debut).lte("date_cours", fin);
    }
    const { data, error } = await q;
    if (error) throw error;

    // `groupes_cours` a été remplacée par la table unifiée `seances` : elle est vide,
    // et cet écran renvoyait donc systématiquement une liste sans aucune séance -
    // l'onglet « Sessions » du détail de classe restait désespérément vide côté
    // onboarding. On fusionne les deux, comme le fait déjà l'espace apprenant : la
    // table historique pour ce qui y reste, la nouvelle pour tout le reste.
    let qs = supabase.from("seances").select("*").eq("groupe_id", id).order("date_seance", { ascending: false });
    if (corbeille !== "true") qs = qs.neq("statut", "corbeille");
    if (mois && annee) {
      const debut = `${annee}-${String(mois).padStart(2,"0")}-01`;
      const fin   = new Date(annee, mois, 0).toISOString().slice(0,10);
      qs = qs.gte("date_seance", debut).lte("date_seance", fin);
    }
    const { data: seancesNew } = await qs;

    const cours = [
      ...(data || []).map((c) => ({ ...c, source: "groupes_cours" })),
      // On expose `date_cours` en plus de `date_seance` : l'écran trie et affiche sur ce
      // champ, et le renommer côté client aurait demandé de toucher chaque lecteur.
      ...(seancesNew || []).map((s) => ({
        ...s,
        date_cours: s.date_seance,
        objectif: s.objectif || s.titre,
        duree_heures: s.duree_h,
        source: "seances",
      })),
    ].sort((a, b) => String(b.date_cours || "").localeCompare(String(a.date_cours || "")));

    res.json({ cours });
  } catch (err) {
    console.error("[groupes/:id/cours]", err.message);
    res.status(500).json({ error: "Erreur récupération historique cours" });
  }
});

router.post("/:id/cours", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { date_cours, objectif, grammaire, sujet_discussion, statut, commentaire } = req.body;
    if (!date_cours) return res.status(400).json({ error: "date_cours requis" });

    const STATUTS = ["dispense","annule","apprenant_absent","coach_absent","catch_up","holiday"];
    if (statut && !STATUTS.includes(statut))
      return res.status(400).json({ error: `statut invalide. Valeurs : ${STATUTS.join(", ")}` });

    // Récupérer infos groupe pour la séance unifiée
    const { data: groupe } = await supabase
      .from("groupes").select("nom,type_cours,niveau,coach_id,statut").eq("id", id).single();
    if (groupe?.statut === "cloture") return res.status(409).json({ error: "Classe clôturée - impossible d'ajouter un cours" });
    const msgDelegueC1 = await refuserSiTitulaireDelegue(req.role === "coach" ? req.profil.id : null, id);
    if (msgDelegueC1) return res.status(403).json({ error: msgDelegueC1 });

    // Récupérer grade du coach pour le calcul d'honoraire
    const coachId = req.profil.id;
    const { data: coachData } = await supabase
      .from("utilisateurs").select("coach_info").eq("id", coachId).single();
    const gradeCoach = coachData?.coach_info?.type_contrat || "Vacataire";

    // Ce formulaire ("Historique cours") enregistre une séance déjà donnée, pas une séance à
    // venir - "dispense" doit donc immédiatement produire le statut "realisee" (et non
    // "planifiee" comme avant, ce qui empêchait tout calcul d'honoraire pour le circuit groupe,
    // même quand la séance avait bien eu lieu). Mapping aligné sur seances_statut_check.
    const STATUT_VERS_SEANCE = {
      dispense:         "realisee",
      catch_up:         "realisee",
      annule:           "annulee",
      holiday:          "annulee",
      coach_absent:     "coach_absent",
      apprenant_absent: "apprenant_absent",
    };
    const statutSeance = STATUT_VERS_SEANCE[statut] || "realisee";

    // Honoraire calculé immédiatement si la séance est déjà "réalisée" - sans ça,
    // `honoraire_montant` restait à 0 (valeur par défaut) et le recalcul mensuel sommait des
    // zéros malgré des séances bien marquées "realisee".
    let honoraireMontant = 0;
    if (statutSeance === "realisee") {
      const { getGrille, calcHonoraire } = await import("./seances.js");
      const grille = await getGrille();
      honoraireMontant = calcHonoraire(grille, gradeCoach, groupe?.type_cours || "presentiel", groupe?.niveau, 1.5);
    }

    // Créer la séance unifiée - `titre` est NOT NULL en base : son absence bloquait 100% des
    // insertions ici (avalées silencieusement par le .catch() plus bas), ce qui explique
    // pourquoi le circuit groupe n'a jamais produit la moindre ligne dans `seances`.
    const { data: seanceUnif, error: eSeanceUnif } = await supabase.from("seances").insert({
      circuit:    "groupe",
      coach_id:   coachId,
      groupe_id:  id,
      titre:      groupe?.nom || "Séance de groupe",
      date_seance: date_cours,
      type_cours:  groupe?.type_cours || "presentiel",
      niveau:      groupe?.niveau || null,
      grade_coach: gradeCoach,
      honoraire_montant: honoraireMontant,
      objectif:    objectif || null,
      notes:       commentaire || null,
      statut:      statutSeance,
      duree_h:     1.5,
    }).select().single();
    if (eSeanceUnif) console.error("[groupes/cours POST] échec création séance unifiée:", eSeanceUnif.message);

    const coursPayload = {
      groupe_id: id, coach_id: coachId, date_cours,
      objectif: objectif||null, grammaire: grammaire||null,
      sujet_discussion: sujet_discussion||null,
      statut: statut||"dispense", commentaire: commentaire||null,
    };
    const seanceUnifId = seanceUnif?.id || null;
    if (seanceUnifId) coursPayload.seance_id = seanceUnifId;

    let { data, error } = await supabase.from("groupes_cours").insert(coursPayload).select().single();

    // Si seance_id n'existe pas encore (migration pas lancée), réessayer sans
    if (error && error.message?.includes("seance_id")) {
      delete coursPayload.seance_id;
      const retry = await supabase.from("groupes_cours").insert(coursPayload).select().single();
      data  = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    res.status(201).json({ message: "Cours ajouté", cours: data, seance_id: seanceUnif?.id || null });

    // Séance réellement donnée : calcule/recalcule immédiatement la fiche mensuelle du coach
    // (même logique que POST /api/seances/cloturer/:id) - sans ça, un cours "dispensé" restait
    // enregistré mais invisible dans les honoraires tant qu'un autre mécanisme ne le recalculait.
    if (statutSeance === "realisee" && seanceUnif) {
      (async () => {
        try {
          const { verifierFicheModifiableDash, recalculerHonoraireMoisDash } = await import("./seances.js");
          const d = new Date(date_cours);
          await verifierFicheModifiableDash(coachId, d.getMonth() + 1, d.getFullYear());
          await recalculerHonoraireMoisDash(coachId, d.getMonth() + 1, d.getFullYear());
        } catch (e) {
          console.warn(`[groupes/cours POST] fiche non recalculée (${e.message})`);
        }
      })();
    }

    // Notifier les apprenants actifs du groupe (best-effort, après la réponse)
    try {
      console.log(`[NOTIF DEBUG] Début notification pour groupe ${id}`);

      const { data: gas, error: gasErr } = await supabase
        .from("groupes_apprenants")
        .select("apprenant_id, email_apprenant, note")
        .eq("groupe_id", id)
        .eq("statut", "actif");

      console.log(`[NOTIF DEBUG] groupes_apprenants: ${gas?.length || 0} apprenants actifs, erreur:`, gasErr?.message || "aucune");

      if (gas?.length) {
        const userIds = [];
        const emailsAppr = [];
        for (const ga of gas) {
          console.log(`[NOTIF DEBUG]   apprenant_id=${ga.apprenant_id} email=${ga.email_apprenant}`);
          if (ga.apprenant_id) {
            userIds.push(ga.apprenant_id);
          } else if (ga.email_apprenant) {
            emailsAppr.push(ga.email_apprenant);
          }
        }
        // Résoudre les emails sans apprenant_id (ilike pour tolérer la casse)
        for (const email of emailsAppr) {
          const { data: u } = await supabase
            .from("utilisateurs").select("id").ilike("email", email).maybeSingle();
          console.log(`[NOTIF DEBUG]   email lookup ${email} → ${u?.id || "NON TROUVÉ"}`);
          if (u?.id) userIds.push(u.id);
        }

        console.log(`[NOTIF DEBUG] userIds à notifier:`, userIds);

        if (userIds.length) {
          const dateLabel = new Date(date_cours).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });
          const notifAppr = userIds.map(uid => ({
            user_id: uid,
            type: "cours",
            titre: "📅 Nouveau cours programmé",
            message: `Un cours a été ajouté pour le ${dateLabel}${objectif ? ` : « ${objectif} »` : ""}`,
            meta: { cours_id: data?.id, groupe_id: id, date_cours },
            lu: false,
            source: 'bet-elearning',
          }));
          const { error: notifErr2 } = await supabase.from("notifications").insert(notifAppr);
          console.log(`[NOTIF DEBUG] INSERT notifications apprenants: ${notifErr2 ? "ERREUR: "+notifErr2.message : "OK ("+notifAppr.length+" notif(s))"}`);
        }

        // Notifier aussi le(s) parent(s) des enfants du groupe, best-effort.
        try {
          const notifsParents = [];
          for (const ga of gas) {
            const parentId = await resolveParentUserId(ga);
            if (parentId) {
              notifsParents.push({
                user_id: parentId,
                type: "cours",
                titre: "📅 Nouvelle séance programmée",
                message: `Une séance a été ajoutée pour le ${dateLabel} pour votre enfant${objectif ? ` : « ${objectif} »` : ""}`,
                meta: { cours_id: data?.id, groupe_id: id, date_cours },
                lu: false,
                source: 'bet-elearning',
              });
            }
          }
          if (notifsParents.length) await supabase.from("notifications").insert(notifsParents);
        } catch (e) {
          console.warn("[groupes] notif parent (cours) échouée:", e.message);
        }

        // Notifier la commerciale - double approche
        const commercialeIds = new Set();

        // Approche 1 : via assignations_parcours (lien CRM)
        const emailsAll = gas.map(g => g.email_apprenant).filter(Boolean);
        for (const email of emailsAll) {
          const { data: a } = await supabase
            .from("assignations_parcours")
            .select("assistantes(id, email)")
            .ilike("prospect_email", email)
            .maybeSingle();
          if (!a?.assistantes) continue;
          if (a.assistantes.email) {
            const uid = await resolveAssistanteUserId(a.assistantes.email);
            if (uid) commercialeIds.add(uid);
          }
        }

        // Approche 2 : via le créateur du groupe (created_by = commercial/onboarding)
        const { data: grp } = await supabase
          .from("groupes").select("created_by").eq("id", id).maybeSingle();
        if (grp?.created_by) {
          const { data: createur } = await supabase
            .from("utilisateurs").select("id, role").eq("id", grp.created_by).maybeSingle();
          const ROLES_COMM = ["commercial", "onboarding", "assistant_elearning", "customer_care"];
          if (createur && ROLES_COMM.includes(createur.role)) {
            commercialeIds.add(createur.id);
          }
        }

        console.log(`[NOTIF DEBUG] commercialeIds:`, [...commercialeIds]);
        if (commercialeIds.size) {
          const dateLabelC = new Date(date_cours).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });
          const notifComm = [...commercialeIds].map(uid => ({
            user_id: uid,
            type: "cours",
            titre: "📅 Cours ajouté dans un groupe",
            message: `Un nouveau cours a été ajouté pour le ${dateLabelC}${objectif ? ` : « ${objectif} »` : ""}`,
            meta: { cours_id: data?.id, groupe_id: id, date_cours },
            lu: false,
            source: 'bet-elearning',
          }));
          const { error: notifErrC } = await supabase.from("notifications").insert(notifComm);
          console.log(`[NOTIF DEBUG] INSERT commerciales: ${notifErrC ? "ERREUR: "+notifErrC.message : "OK"}`);
        }
      }
    } catch (notifErr) {
      console.warn("[groupes POST cours] notification échouée:", notifErr.message);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur ajout cours" });
  }
});

router.patch("/:id/cours/:cid", authenticateAdmin, async (req, res) => {
  try {
    const { cid } = req.params;
    const msgDelegueC2 = await refuserSiTitulaireDelegue(req.role === "coach" ? req.profil.id : null, req.params.id);
    if (msgDelegueC2) return res.status(403).json({ error: msgDelegueC2 });
    const allowed = ["date_cours","objectif","grammaire","sujet_discussion","statut","commentaire"];
    const updates = { updated_at: new Date().toISOString() };
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const { data, error } = await supabase.from("groupes_cours").update(updates).eq("id", cid).select().single();
    if (error) throw error;
    res.json({ message: "Cours mis à jour", cours: data });

    // Répercute un changement de statut sur la séance unifiée liée (même mapping qu'à la
    // création) - sans ça, corriger un cours après coup ne mettait jamais à jour les honoraires.
    if (data.seance_id && updates.statut !== undefined) {
      const STATUT_VERS_SEANCE = {
        dispense: "realisee", catch_up: "realisee", annule: "annulee", holiday: "annulee",
        coach_absent: "coach_absent", apprenant_absent: "apprenant_absent",
      };
      const statutSeance = STATUT_VERS_SEANCE[updates.statut] || "realisee";
      (async () => {
        try {
          const { getGrille, calcHonoraire, verifierFicheModifiableDash, recalculerHonoraireMoisDash } = await import("./seances.js");
          const seanceUpdate = { statut: statutSeance };
          if (statutSeance === "realisee") {
            const { data: seanceAvant } = await supabase.from("seances").select("grade_coach,type_cours,niveau,duree_h").eq("id", data.seance_id).maybeSingle();
            if (seanceAvant) {
              const grille = await getGrille();
              seanceUpdate.honoraire_montant = calcHonoraire(grille, seanceAvant.grade_coach, seanceAvant.type_cours, seanceAvant.niveau, seanceAvant.duree_h);
            }
          }
          const { data: seanceLiee, error: eMaj } = await supabase.from("seances")
            .update(seanceUpdate).eq("id", data.seance_id).select().single();
          if (eMaj) { console.error("[groupes/cours PATCH] échec maj séance liée:", eMaj.message); return; }
          if (statutSeance === "realisee" && seanceLiee) {
            const d = new Date(seanceLiee.date_seance);
            await verifierFicheModifiableDash(seanceLiee.coach_id, d.getMonth() + 1, d.getFullYear());
            await recalculerHonoraireMoisDash(seanceLiee.coach_id, d.getMonth() + 1, d.getFullYear());
          }
        } catch (e) { console.warn("[groupes/cours PATCH] fiche non recalculée:", e.message); }
      })();
    }
  } catch (err) {
    res.status(500).json({ error: "Erreur mise à jour cours" });
  }
});

// Mise en corbeille (soft delete)
router.delete("/:id/cours/:cid", authenticateAdmin, async (req, res) => {
  try {
    const msgDelegueC3 = await refuserSiTitulaireDelegue(req.role === "coach" ? req.profil.id : null, req.params.id);
    if (msgDelegueC3) return res.status(403).json({ error: msgDelegueC3 });
    const { data, error } = await supabase
      .from("groupes_cours")
      .update({ statut: "corbeille", updated_at: new Date().toISOString() })
      .eq("id", req.params.cid)
      .select().single();
    if (error) throw error;
    res.json({ message: "Cours mis en corbeille", cours: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur mise en corbeille" });
  }
});

// Suppression définitive depuis la corbeille
router.delete("/:id/cours/:cid/permanent", authenticateAdmin, requirePermission("classes","delete"), async (req, res) => {
  try {
    await supabase.from("groupes_cours").delete().eq("id", req.params.cid);
    res.json({ message: "Cours supprimé définitivement" });
  } catch (err) {
    res.status(500).json({ error: "Erreur suppression définitive" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET  /api/groupes/archives
   - Liste tous les apprenants en_pause ou archive
══════════════════════════════════════════════════════════════ */
router.get("/archives", authenticateAdmin, async (req, res) => {
  try {
    const { statut } = req.query;
    const statuts = statut ? [statut] : ["en_pause", "archive"];

    const { data, error } = await supabase
      .from("groupes_apprenants")
      .select("*, groupes(nom, niveau, type_cours)")
      .in("statut", statuts)
      .order("date_pause", { ascending: false });

    if (error) throw error;
    res.json({ apprenants: data || [] });
  } catch (err) {
    console.error("[archives]", err);
    res.status(500).json({ error: "Erreur récupération archives" });
  }
});

/* ══════════════════════════════════════════════════════════════
   PATCH /api/groupes/apprenants/:id/note
   - Met à jour le JSONB note d'un apprenant (suivi, notes, devoirs, parents…)
══════════════════════════════════════════════════════════════ */
router.patch("/apprenants/:id/note", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { patch } = req.body; // { suivi, notes_cours, devoirs, parents, progression, ... }
    if (!patch || typeof patch !== "object") return res.status(400).json({ error: "patch requis" });

    const { data: ga, error: gaErr } = await supabase
      .from("groupes_apprenants").select("note").eq("id", id).single();
    if (gaErr || !ga) return res.status(404).json({ error: "Apprenant introuvable" });

    let noteActuelle = {};
    try { noteActuelle = ga.note ? (typeof ga.note === "string" ? JSON.parse(ga.note) : ga.note) : {}; } catch {}

    const noteNouvelle = { ...noteActuelle, ...patch };

    const { data, error } = await supabase
      .from("groupes_apprenants")
      .update({ note: noteNouvelle })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    res.json({ apprenant: data });
  } catch (err) {
    console.error("[PATCH apprenant/note]", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   PATCH /api/groupes/apprenants/:id/archiver
   - Met un apprenant en pause ou en archive avec motif
══════════════════════════════════════════════════════════════ */
/**
 * Le dossier (assignations_parcours) derrière une ligne de classe.
 *
 * Deux chemins, dans cet ordre : le lien fiable posé dans `note` à l'inscription - qui vaut
 * aussi pour un profil enfant, où prospect_email est celui du parent et jamais celui de
 * l'apprenant - puis le repli par email. Le motif existait déjà en double (jobsPaiements.js
 * et la clôture de classe) ; il est centralisé ici.
 */
async function resoudreAssignationDepuisGA(ga) {
  if (!ga) return null;
  try {
    const idNote = JSON.parse(ga.note || "{}").assignation_id || null;
    if (idNote) {
      const { data } = await supabase
        .from("assignations_parcours").select("id, plan_paiement").eq("id", idNote).maybeSingle();
      if (data) return data;
    }
  } catch { /* note non JSON : on tente l'email */ }
  if (!ga.email_apprenant) return null;
  const { data } = await supabase
    .from("assignations_parcours").select("id, plan_paiement")
    .ilike("prospect_email", ga.email_apprenant)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

/**
 * Répercute une pause/reprise d'apprenant sur sa facturation.
 *
 * Best-effort et jamais bloquant : un échec côté paiement ne doit pas annuler une décision
 * pédagogique. La route dit en retour ce qui s'est réellement passé, pour que l'écran ne
 * laisse pas croire que la facturation a suivi quand ce n'est pas le cas.
 */
async function repercuterSurLaFacturation(ga, { reprise, motif, detail, dateReprisePrevue, acteur, premierMoisNonFacture, moisReprise, dateReprise } = {}) {
  try {
    const dossier = await resoudreAssignationDepuisGA(ga);
    if (!dossier) return { statut: "dossier_introuvable" };
    if (!dossier.plan_paiement) return { statut: "aucun_plan" };

    const r = reprise
      ? reprendrePlan(dossier.plan_paiement, {
          par: acteur,
          ...(moisReprise ? { moisReprise } : {}),
          // Sans cette date, l'echeance du mois de reprise retombe sur le jour du contrat,
          // deja passe : le cron generait alors un mois de plus des le lendemain.
          ...(dateReprise ? { dateReprise } : {}),
        })
      : suspendrePlan(dossier.plan_paiement, {
          motif, detail, dateReprisePrevue, gaId: ga.id, par: acteur,
          ...(premierMoisNonFacture ? { premierMoisNonFacture } : {}),
        });

    const { error } = await supabase
      .from("assignations_parcours").update({ plan_paiement: r.plan }).eq("id", dossier.id);
    if (error) return { statut: "echec" };
    return {
      statut: "ok",
      moisNeutralises: (r.moisNeutralises || []).length,
      montantGele: r.montantGele || 0,
      prolongation: r.prolongation || 0,
    };
  } catch (e) {
    console.warn("[facturation] répercussion impossible pour ga", ga?.id, ":", e.message);
    return { statut: "echec" };
  }
}

router.patch("/apprenants/:id/archiver", authenticateAdmin, requirePermission("inscriptions", "update"), async (req, res) => {
  try {
    const { id } = req.params;
    const { type_archive = "en_pause", motif, detail_motif, duree_estimee, date_reprise } = req.body;

    if (!motif) return res.status(400).json({ error: "Le motif est requis" });

    const { data: ga, error: gaErr } = await supabase
      .from("groupes_apprenants").select("*").eq("id", id).single();
    if (gaErr || !ga) return res.status(404).json({ error: "Apprenant introuvable" });

    const { error } = await supabase.from("groupes_apprenants").update({
      statut:              type_archive === "en_pause" ? "en_pause" : "archive",
      motif_pause:         motif,
      detail_motif:        detail_motif || null,
      duree_pause_estimee: duree_estimee || null,
      date_reprise_prevue: date_reprise  || null,
      date_pause:          new Date().toISOString(),
      archive_par:         req.profil?.id || null,
    }).eq("id", id);

    if (error) throw error;

    const nomComplet = `${ga.prenom_apprenant || ""} ${ga.nom_apprenant || ""}`.trim();
    const labelType  = type_archive === "en_pause" ? "mis en pause" : "archivé";

    // La facturation suit l'apprenant. Sans ce lien, un apprenant mis en pause continuait
    // de recevoir une mensualité par mois et ses rappels J-7/J-3/J-1 - le cron ne lit
    // jamais groupes_apprenants.statut.
    const facturation = await repercuterSurLaFacturation(ga, {
      reprise: false,
      motif, detail: detail_motif || null, dateReprisePrevue: date_reprise || null,
      acteur: req.profil ? `${req.profil.prenom || ""} ${req.profil.nom || ""}`.trim() : null,
    });

    // Notifier l'assistante/onboarding qui gère ce dossier (added_by) - sans ça, elle ne
    // découvre la mise en pause/l'archivage qu'en rafraîchissant sa liste par hasard.
    if (ga.added_by) {
      await sendNotif(ga.added_by, {
        type: "archivage",
        titre: `⏸️ ${nomComplet} ${labelType}`,
        message: `${nomComplet} a été ${labelType}. Motif : ${motif}${detail_motif ? ` - ${detail_motif}` : ""}.`,
        meta: { ga_id: id, motif },
      });
    }
    // Notifier le coach du groupe concerné
    const { data: groupeArchive } = await supabase.from("groupes").select("nom, coach_id").eq("id", ga.groupe_id).maybeSingle();
    if (groupeArchive?.coach_id) {
      const coachUserId = await resolveCoachUserId(groupeArchive.coach_id);
      if (coachUserId) await sendNotif(coachUserId, {
        type: "archivage",
        titre: `⏸️ ${nomComplet} ${labelType}`,
        message: `${nomComplet} a été ${labelType} du groupe "${groupeArchive.nom}". Motif : ${motif}.`,
        meta: { ga_id: id, motif },
      });
    }

    res.json({ success: true, message: `${nomComplet} a été ${labelType} avec succès.`, facturation });
  } catch (err) {
    console.error("[archiver]", err);
    res.status(500).json({ error: "Erreur lors de l'archivage" });
  }
});

/* ══════════════════════════════════════════════════════════════
   PATCH /api/groupes/apprenants/:id/reactiver
   - Réactive un apprenant (même groupe ou nouveau groupe)
══════════════════════════════════════════════════════════════ */
router.patch("/apprenants/:id/reactiver", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nouveau_groupe_id } = req.body;

    const { data: ga, error: gaErr } = await supabase
      .from("groupes_apprenants").select("*").eq("id", id).single();
    if (gaErr || !ga) return res.status(404).json({ error: "Apprenant introuvable" });

    const nomComplet = `${ga.prenom_apprenant || ""} ${ga.nom_apprenant || ""}`.trim();

    if (nouveau_groupe_id && nouveau_groupe_id !== ga.groupe_id) {
      // Fermer l'entrée archivée
      await supabase.from("groupes_apprenants").update({
        statut: "retire", date_retrait: new Date().toISOString(),
      }).eq("id", id);

      // Créer une nouvelle entrée dans le nouveau groupe
      const { data: newGa, error: insertErr } = await supabase
        .from("groupes_apprenants")
        .insert({
          groupe_id:          nouveau_groupe_id,
          apprenant_id:       ga.apprenant_id,
          nom_apprenant:      ga.nom_apprenant,
          prenom_apprenant:   ga.prenom_apprenant,
          email_apprenant:    ga.email_apprenant,
          telephone:          ga.telephone,
          niveau:             ga.niveau,
          note:               ga.note,
          statut:             "actif",
          added_by:           req.profil?.id || null,
          date_reactivation:  new Date().toISOString(),
        })
        .select().single();
      if (insertErr) throw insertErr;

      // Mettre à jour les compteurs
      const { data: ancienG } = await supabase.from("groupes").select("nb_apprenants").eq("id", ga.groupe_id).single();
      await supabase.from("groupes").update({ nb_apprenants: Math.max(0, (ancienG?.nb_apprenants||1)-1) }).eq("id", ga.groupe_id);
      const { data: nouvG } = await supabase.from("groupes").select("nb_apprenants").eq("id", nouveau_groupe_id).single();
      await supabase.from("groupes").update({ nb_apprenants: (nouvG?.nb_apprenants||0)+1 }).eq("id", nouveau_groupe_id);

      if (ga.added_by) await sendNotif(ga.added_by, {
        type: "reactivation",
        titre: `▶️ ${nomComplet} réactivé(e)`,
        message: `${nomComplet} a été réactivé(e) dans un nouveau groupe.`,
        meta: { ga_id: id, nouveau_groupe_id },
      });
      res.json({ success: true, message: `${nomComplet} réactivé(e) dans le nouveau groupe.`, ga: newGa });
    } else {
      // Réactivation dans le même groupe
      const { error } = await supabase.from("groupes_apprenants").update({
        statut:              "actif",
        date_reactivation:   new Date().toISOString(),
        motif_pause:         null,
        detail_motif:        null,
        duree_pause_estimee: null,
        date_reprise_prevue: null,
        date_pause:          null,
      }).eq("id", id);
      if (error) throw error;

      // Reprise de la facturation, rebasée sur le mois courant : sans rebasage, le cron
      // repartirait du dernier mois d'avant la pause et générerait tous les arriérés d'un
      // coup, le jour même du retour.
      const facturationReprise = await repercuterSurLaFacturation(ga, {
        reprise: true,
        acteur: req.profil ? `${req.profil.prenom || ""} ${req.profil.nom || ""}`.trim() : null,
        dateReprise: new Date().toISOString().slice(0, 10),
      });

      if (ga.added_by) await sendNotif(ga.added_by, {
        type: "reactivation",
        titre: `▶️ ${nomComplet} réactivé(e)`,
        message: `${nomComplet} a été réactivé(e) dans son groupe d'origine.`,
        meta: { ga_id: id },
      });

      res.json({ success: true, message: `${nomComplet} réactivé(e) dans son groupe d'origine.`, facturation: facturationReprise });
    }
  } catch (err) {
    console.error("[reactiver]", err);
    res.status(500).json({ error: "Erreur lors de la réactivation" });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/groupes/apprenants/:id/signaler-absence
   Coach signale une absence répétée → notifie la commerciale et le PA
══════════════════════════════════════════════════════════════ */
router.post("/apprenants/:id/signaler-absence", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params; // id = groupes_apprenants.id

    const { data: ga } = await supabase
      .from("groupes_apprenants")
      .select("*, groupes(nom)")
      .eq("id", id)
      .single();
    if (!ga) return res.status(404).json({ error: "Apprenant introuvable" });

    const nomComplet  = `${ga.prenom_apprenant || ""} ${ga.nom_apprenant || ""}`.trim();
    const nomGroupe   = ga.groupes?.nom || ga.groupe_id;
    const coachNom    = req.profil ? `${req.profil.prenom || ""} ${req.profil.nom || ""}`.trim() : "Le coach";

    const notified = [];

    // 1. Notifier la commerciale via assignations_parcours
    if (ga.email_apprenant) {
      const { data: assignation } = await supabase
        .from("assignations_parcours")
        .select("assistante_id, assistantes(email, nom, prenom)")
        .eq("prospect_email", ga.email_apprenant)
        .maybeSingle();
      const assistanteUserId = await resolveAssistanteUserId(assignation?.assistantes?.email);
      if (assistanteUserId) {
        await sendNotif(assistanteUserId, {
          type:    "absence_repetee",
          titre:   `🚨 Absence répétée - ${nomComplet}`,
          message: `${coachNom} signale des absences répétées de ${nomComplet} dans le groupe "${nomGroupe}". Veuillez contacter l'apprenant et mettre à jour son dossier.`,
          meta:    { ga_id: ga.id, apprenant: nomComplet, groupe: nomGroupe, coach: coachNom },
        });
        notified.push("commerciale");
      }
    }

    // 2. Notifier le PA (added_by = l'onboarding qui a ajouté l'apprenant)
    if (ga.added_by) {
      await sendNotif(ga.added_by, {
        type:    "absence_repetee",
        titre:   `🚨 Absence répétée - ${nomComplet}`,
        message: `${coachNom} signale des absences répétées de ${nomComplet} dans le groupe "${nomGroupe}". Veuillez prendre contact avec l'apprenant.`,
        meta:    { ga_id: ga.id, apprenant: nomComplet, groupe: nomGroupe, coach: coachNom },
      });
      notified.push("pa");
    }

    res.json({ ok: true, notified });
  } catch (err) {
    console.error("[signaler-absence]", err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// ÉVALUATIONS GROUPES
// Tables : evaluations_groupes + resultats_evaluations_groupes
// ══════════════════════════════════════════════════════════════

// GET /api/groupes/:id/evaluations - coach voit ses évaluations du groupe
router.get("/:id/evaluations", authenticateAdmin, async (req, res) => {
  try {
    const { id: groupeId } = req.params;
    // Vérifier accès coach
    const { data: groupe } = await supabase.from("groupes").select("coach_id").eq("id", groupeId).maybeSingle();
    if (!groupe) return res.status(404).json({ error: "Groupe introuvable" });
    if (req.role === "coach" && groupe.coach_id !== req.profil.id && !(await estDelegueSurGroupe(req.profil.id, groupeId)))
      return res.status(403).json({ error: "Accès refusé" });

    const { data, error } = await supabase
      .from("evaluations_groupes")
      .select("*")
      .eq("groupe_id", groupeId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    // Enrichir chaque éval avec le nb de résultats soumis
    const evalIds = (data || []).map(e => e.id);
    let resultatsMap = {};
    if (evalIds.length > 0) {
      const { data: res2 } = await supabase
        .from("resultats_evaluations_groupes")
        .select("evaluation_id, statut")
        .in("evaluation_id", evalIds);
      (res2 || []).forEach(r => {
        if (!resultatsMap[r.evaluation_id]) resultatsMap[r.evaluation_id] = { total: 0, rendus: 0, corriges: 0 };
        resultatsMap[r.evaluation_id].total++;
        if (r.statut === "rendu")   resultatsMap[r.evaluation_id].rendus++;
        if (r.statut === "corrige") resultatsMap[r.evaluation_id].corriges++;
      });
    }
    const enriched = (data || []).map(e => ({ ...e, stats: resultatsMap[e.id] || { total: 0, rendus: 0, corriges: 0 } }));
    res.json({ evaluations: enriched });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/groupes/:id/evaluations - coach crée une évaluation
router.post("/:id/evaluations", authenticateAdmin, async (req, res) => {
  try {
    const { id: groupeId } = req.params;
    const { data: groupe } = await supabase.from("groupes").select("coach_id,statut").eq("id", groupeId).maybeSingle();
    if (!groupe) return res.status(404).json({ error: "Groupe introuvable" });
    if (req.role === "coach" && groupe.coach_id !== req.profil.id && !(await estDelegueSurGroupe(req.profil.id, groupeId)))
      return res.status(403).json({ error: "Accès refusé" });
    const msgDelegue = await refuserSiTitulaireDelegue(req.role === "coach" ? req.profil.id : null, groupeId);
    if (msgDelegue) return res.status(403).json({ error: msgDelegue });
    if (groupe.statut === "cloture") return res.status(409).json({ error: "Classe clôturée - impossible de créer une évaluation" });

    const {
      titre, type, categorie, instructions, questions, ressource_url, blocs,
      sur_toeic, duree_min, date_evaluation, heure_debut,
      type_rendu, date_ouverture, heure_ouverture,
      statut, notifier_eleves,
    } = req.body;
    if (!titre) return res.status(400).json({ error: "titre requis" });

    const payload = {
      coach_id:        req.profil.id,
      groupe_id:       groupeId,
      titre,
      type:            type            || "qcm",
      categorie:       categorie       || "evaluation",
      type_rendu:      type_rendu      || "texte",
      instructions:    instructions    || null,
      questions:       questions       || [],
      ressource_url:   ressource_url   || null,
      // "type"==="mixte" : le vrai contenu vit dans blocs[] (mix QCM/Listening/Audio/Quiz/
      // Speaking), questions/ressource_url ci-dessus restent vides dans ce cas.
      blocs:           Array.isArray(blocs) ? blocs : [],
      sur_toeic:       !!sur_toeic,
      duree_min:       duree_min       || 60,
      date_evaluation: date_evaluation || null,
      heure_debut:     heure_debut     || null,
      date_ouverture:  date_ouverture  || null,
      heure_ouverture: heure_ouverture || "00:00",
      statut:          statut          || "brouillon",
      notifier_eleves: notifier_eleves !== false,
      created_by:      req.profil.id,
    };
    const { data, error } = await supabase.from("evaluations_groupes").insert(payload).select().single();
    if (error) throw error;

    res.status(201).json({ evaluation: data });

    // Notifier apprenants + commerciale + onboarding + PA advisor si publiée directement
    if (data.statut === "publie" && data.notifier_eleves) {
      notifyEvalPublished(groupeId, data, !!req.body.envoyer_email, req.profil?.id || null);
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/groupes/:id/evaluations/:evalId - modifier / publier / clôturer
router.patch("/:id/evaluations/:evalId", authenticateAdmin, async (req, res) => {
  try {
    const { id: groupeId, evalId } = req.params;
    const { data: eval0 } = await supabase.from("evaluations_groupes").select("*").eq("id", evalId).eq("groupe_id", groupeId).maybeSingle();
    if (!eval0) return res.status(404).json({ error: "Évaluation introuvable" });
    if (req.role === "coach" && eval0.coach_id !== req.profil.id && !(await estDelegueSurGroupe(req.profil.id, groupeId)))
      return res.status(403).json({ error: "Accès refusé" });
    const msgDelegue1 = await refuserSiTitulaireDelegue(req.role === "coach" ? req.profil.id : null, groupeId);
    if (msgDelegue1) return res.status(403).json({ error: msgDelegue1 });

    // Bloquer la dépublication ET toute modification de contenu si au moins un apprenant a
    // soumis - sinon on fausse un devoir déjà rendu (questions/consignes changées après coup).
    const CONTENT_FIELDS = ["titre","type","categorie","type_rendu","instructions","questions","ressource_url","blocs","sur_toeic","duree_min","date_evaluation","heure_debut","date_ouverture","heure_ouverture"];
    const touchesContent = CONTENT_FIELDS.some(k => req.body[k] !== undefined);
    const touchesDepublication = req.body.statut === "brouillon" && eval0.statut === "publie";
    if (touchesContent || touchesDepublication) {
      const { count } = await supabase
        .from("resultats_evaluations_groupes")
        .select("id", { count: "exact", head: true })
        .eq("evaluation_id", evalId)
        .neq("statut", "a_faire");
      if (count > 0) {
        const action = touchesDepublication ? "dépublier" : "modifier";
        return res.status(409).json({ error: `Impossible de ${action} : ${count} apprenant(s) ont déjà soumis ce devoir. Créez plutôt un nouveau devoir.` });
      }
    }

    const allowed = ["titre","type","categorie","type_rendu","instructions","questions","ressource_url","blocs","sur_toeic","duree_min","date_evaluation","heure_debut","date_ouverture","heure_ouverture","statut","notifier_eleves"];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const { data, error } = await supabase.from("evaluations_groupes").update(updates).eq("id", evalId).select().single();
    if (error) throw error;

    res.json({ evaluation: data });

    // Notifier apprenants + commerciale + onboarding + PA advisor à la publication
    if (updates.statut === "publie" && eval0.statut !== "publie" && data.notifier_eleves) {
      notifyEvalPublished(groupeId, data, !!req.body.envoyer_email, req.profil?.id || null);
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/groupes/:id/evaluations/:evalId - supprimer
router.delete("/:id/evaluations/:evalId", authenticateAdmin, async (req, res) => {
  try {
    const { id: groupeId, evalId } = req.params;
    const { data: eval0 } = await supabase.from("evaluations_groupes").select("coach_id, statut").eq("id", evalId).eq("groupe_id", groupeId).maybeSingle();
    if (!eval0) return res.status(404).json({ error: "Évaluation introuvable" });
    if (req.role === "coach" && eval0.coach_id !== req.profil.id && !(await estDelegueSurGroupe(req.profil.id, groupeId)))
      return res.status(403).json({ error: "Accès refusé" });
    const msgDelegue2 = await refuserSiTitulaireDelegue(req.role === "coach" ? req.profil.id : null, groupeId);
    if (msgDelegue2) return res.status(403).json({ error: msgDelegue2 });

    // Bloquer la suppression si au moins un apprenant a soumis
    const { count } = await supabase
      .from("resultats_evaluations_groupes")
      .select("id", { count: "exact", head: true })
      .eq("evaluation_id", evalId)
      .neq("statut", "a_faire");
    if (count > 0)
      return res.status(409).json({ error: `Impossible de supprimer : ${count} apprenant(s) ont déjà soumis ce devoir.` });

    const { error } = await supabase.from("evaluations_groupes").delete().eq("id", evalId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/groupes/:id/evaluations/:evalId/resultats - coach voit tous les résultats
router.get("/:id/evaluations/:evalId/resultats", authenticateAdmin, async (req, res) => {
  try {
    const { id: groupeId, evalId } = req.params;
    const { data: eval0 } = await supabase.from("evaluations_groupes").select("*").eq("id", evalId).eq("groupe_id", groupeId).maybeSingle();
    if (!eval0) return res.status(404).json({ error: "Évaluation introuvable" });
    if (req.role === "coach" && eval0.coach_id !== req.profil.id && !(await estDelegueSurGroupe(req.profil.id, groupeId)))
      return res.status(403).json({ error: "Accès refusé" });

    // Tous les apprenants du groupe (hors retirés et hors transférés vers une autre
    // classe) - inclut les apprenants "archive" d'une classe clôturée, pour que leurs
    // notes déjà corrigées restent visibles. "transfere" exclu : un apprenant transféré
    // ailleurs ne fait plus partie de cette classe, il ne doit plus y bloquer une
    // validation groupée ni y apparaître comme ayant un devoir "à faire".
    const { data: apprenants } = await supabase
      .from("groupes_apprenants")
      .select("id, nom_apprenant, prenom_apprenant, statut")
      .eq("groupe_id", groupeId)
      .neq("statut", "retire")
      .neq("statut", "transfere");

    // Résultats existants
    const { data: resultats } = await supabase
      .from("resultats_evaluations_groupes")
      .select("*")
      .eq("evaluation_id", evalId);

    const resultatsMap = {};
    (resultats || []).forEach(r => { resultatsMap[r.ga_id] = r; });

    // Liste complète : tous les apprenants, avec ou sans résultat
    const liste = (apprenants || []).map(a => ({
      apprenant: { id: a.id, nom: a.nom_apprenant, prenom: a.prenom_apprenant },
      resultat: resultatsMap[a.id] || { ga_id: a.id, statut: "a_faire", note: null, commentaire_coach: null },
    }));

    res.json({ evaluation: eval0, resultats: liste });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/groupes/:id/evaluations/:evalId/resultats/:gaId - coach corrige
router.patch("/:id/evaluations/:evalId/resultats/:gaId", authenticateAdmin, async (req, res) => {
  try {
    const { id: groupeId, evalId, gaId } = req.params;
    const { data: eval0 } = await supabase.from("evaluations_groupes").select("coach_id, categorie, titre").eq("id", evalId).eq("groupe_id", groupeId).maybeSingle();
    if (!eval0) return res.status(404).json({ error: "Évaluation introuvable" });
    if (req.role === "coach" && eval0.coach_id !== req.profil.id && !(await estDelegueSurGroupe(req.profil.id, groupeId)))
      return res.status(403).json({ error: "Accès refusé" });
    const msgDelegue3 = await refuserSiTitulaireDelegue(req.role === "coach" ? req.profil.id : null, groupeId);
    if (msgDelegue3) return res.status(403).json({ error: msgDelegue3 });

    const { note, note_max, commentaire_coach, statut: statutBody } = req.body;
    const updates = {
      note:              note ?? null,
      note_max:          note_max ?? 20,
      commentaire_coach: commentaire_coach || null,
      statut:            statutBody || "corrige",
      corrige_par:       req.profil.id,
      corrige_at:        new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("resultats_evaluations_groupes")
      .upsert({ evaluation_id: evalId, ga_id: gaId, groupe_id: groupeId, ...updates },
               { onConflict: "evaluation_id,ga_id" })
      .select().single();
    if (error) throw error;

    // Notifier l'apprenant que son devoir a été corrigé
    const { data: ga2 } = await supabase.from("groupes_apprenants").select("apprenant_id").eq("id", gaId).maybeSingle();
    if (ga2?.apprenant_id) {
      await sendNotif(ga2.apprenant_id, {
        type: "evaluation",
        titre: "🏅 Devoir corrigé",
        message: `Votre devoir a été noté : ${note ?? "-"}/${note_max ?? 20}${commentaire_coach ? ` - "${commentaire_coach}"` : ""}`,
        meta: { evaluation_id: evalId, groupe_id: groupeId },
      });

      // Gamification : bonus qualité si devoir noté ≥ 80%, + réévaluation des badges de
      // progression même sans bonus (ex. "grand progrès").
      if (eval0.categorie === "devoir" && ga2.apprenant_id && note != null && note_max) {
        if (note / note_max >= 0.8) {
          attribuerPoints(ga2.apprenant_id, "devoir_bonus", evalId, 10, `Devoir noté ≥ 80 % - ${eval0.titre || ""}`, { note, noteMax: note_max }).catch(() => {});
        }
        verifierBadges(ga2.apprenant_id, "devoir_correction").catch(() => {});
      }
    }

    res.json({ resultat: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/groupes/:id/evaluations/:evalId/valider
// Valide définitivement toutes les notes : exige une note pour chaque apprenant actif,
// sauvegarde en bulk, notifie apprenants + PA advisors + commerciale de chaque apprenant
router.post("/:id/evaluations/:evalId/valider", authenticateAdmin, async (req, res) => {
  try {
    const { id: groupeId, evalId } = req.params;
    const { corrections } = req.body; // [{ ga_id, note, note_max, commentaire_coach }]

    if (!Array.isArray(corrections) || corrections.length === 0)
      return res.status(400).json({ error: "corrections[] requis" });

    // Vérifier accès
    const { data: eval0 } = await supabase.from("evaluations_groupes").select("*").eq("id", evalId).eq("groupe_id", groupeId).maybeSingle();
    if (!eval0) return res.status(404).json({ error: "Évaluation introuvable" });
    if (req.role === "coach" && eval0.coach_id !== req.profil.id && !(await estDelegueSurGroupe(req.profil.id, groupeId)))
      return res.status(403).json({ error: "Accès refusé" });
    const msgDelegue4 = await refuserSiTitulaireDelegue(req.role === "coach" ? req.profil.id : null, groupeId);
    if (msgDelegue4) return res.status(403).json({ error: msgDelegue4 });

    // Récupérer tous les apprenants du groupe (hors retirés et hors transférés) -
    // inclut les apprenants "archive" d'une classe clôturée, dont les notes doivent
    // rester validables/visibles. "transfere" exclu : sans ce filtre, un apprenant
    // parti vers une autre classe bloquait la validation en bloc avec "Note manquante".
    const { data: apprenants } = await supabase
      .from("groupes_apprenants")
      .select("id, nom_apprenant, prenom_apprenant, email_apprenant, apprenant_id")
      .eq("groupe_id", groupeId)
      .neq("statut", "retire")
      .neq("statut", "transfere");

    const totalActifs = (apprenants || []).length;
    if (totalActifs === 0) return res.status(400).json({ error: "Aucun apprenant dans ce groupe" });

    // Indexer les corrections envoyées par ga_id
    const corrMap = {};
    for (const c of corrections) corrMap[c.ga_id] = c;

    // Vérifier que chaque apprenant actif a une note
    const sansNote = (apprenants || []).filter(a => {
      const c = corrMap[a.id];
      return !c || c.note === null || c.note === undefined || c.note === "" || isNaN(parseFloat(c.note));
    });
    if (sansNote.length > 0) {
      const noms = sansNote.map(a => `${a.prenom_apprenant || ""} ${a.nom_apprenant || ""}`.trim() || a.id).join(", ");
      return res.status(422).json({ error: `Note manquante pour ${sansNote.length} apprenant(s) : ${noms}` });
    }

    const now = new Date().toISOString();
    // Sauvegarder toutes les corrections
    const upserts = (apprenants || []).map(a => {
      const c = corrMap[a.id];
      return {
        evaluation_id:     evalId,
        ga_id:             a.id,
        groupe_id:         groupeId,
        note:              parseFloat(c.note),
        note_max:          c.note_max ?? 20,
        commentaire_coach: c.commentaire_coach || null,
        statut:            "corrige",
        corrige_par:       req.profil.id,
        corrige_at:        now,
      };
    });

    const { error: upsertErr } = await supabase
      .from("resultats_evaluations_groupes")
      .upsert(upserts, { onConflict: "evaluation_id,ga_id" });
    if (upsertErr) throw upsertErr;

    // Marquer l'évaluation comme clôturée
    await supabase.from("evaluations_groupes").update({ statut: "cloture" }).eq("id", evalId);

    res.json({ ok: true, total: upserts.length });

    // ── Notifications asynchrones ──────────────────────────────────
    const titreEval = eval0.titre || "Évaluation";
    const meta = { evaluation_id: evalId, groupe_id: groupeId };

    // 1. Notifier chaque apprenant + trouver sa commerciale
    const staffIds = new Set();
    for (const a of (apprenants || [])) {
      const c = corrMap[a.id];
      const noteStr = `${parseFloat(c.note)}/${c.note_max ?? 20}`;

      // Notif apprenant
      if (a.apprenant_id) {
        await sendNotif(a.apprenant_id, {
          type: "correction",
          titre: "🏅 Note disponible",
          message: `"${titreEval}" : votre note est ${noteStr}${c.commentaire_coach ? ` - "${c.commentaire_coach}"` : ""}`,
          meta,
        });

        // Gamification : bonus qualité si devoir noté ≥ 80 %, + réévaluation des badges.
        if (eval0.categorie === "devoir") {
          const noteMaxNum = c.note_max ?? 20;
          if (parseFloat(c.note) / noteMaxNum >= 0.8) {
            attribuerPoints(a.apprenant_id, "devoir_bonus", evalId, 10, `Devoir noté ≥ 80 % - ${titreEval}`, { note: parseFloat(c.note), noteMax: noteMaxNum }).catch(() => {});
          }
          verifierBadges(a.apprenant_id, "devoir_correction").catch(() => {});
        }
      }

      // Chercher commerciale via assignations_parcours
      if (a.email_apprenant) {
        const { data: ap } = await supabase
          .from("assignations_parcours")
          .select("assistantes(id, email)")
          .ilike("prospect_email", a.email_apprenant)
          .maybeSingle();
        if (ap?.assistantes?.email) {
          const uid = await resolveAssistanteUserId(ap.assistantes.email);
          if (uid) staffIds.add(uid);
        }
      }
    }

    // 2. Notifier les commerciales/onboarding trouvées
    for (const uid of staffIds) {
      await sendNotif(uid, {
        type: "correction",
        titre: "🏅 Notes validées",
        message: `Le coach a validé les notes pour "${titreEval}" (${totalActifs} apprenant(s)).`,
        meta,
      });
    }

    // 3. Notifier tous les PA advisors
    await notifyRole(["pedagogical_advisor", "admin_pa_advisor", ...ROLES_SUPERVISION_GLOBALE], {
      type: "correction",
      titre: "🏅 Notes validées",
      message: `Les notes de "${titreEval}" ont été validées définitivement (${totalActifs} apprenant(s)).`,
      meta,
    });

  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
