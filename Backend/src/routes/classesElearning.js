// Routes classes_elearning - groupes propres à la plateforme BET E-Learning (entreprises)
import { Router } from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { notifyUser as _notifyUser, notifyEntreprise as _notifyEntreprise, notifyRole as _notifyRole } from "../services/notifyRole.js";

/* ── TOUTE NOTIFICATION ÉCRITE ICI EST UNE NOTIFICATION BET E-LEARNING ──
   `notifyRole` / `notifyUser` / `notifyEntreprise` écrivent `source: 'dash'` PAR DÉFAUT,
   tandis que la cloche de bet-elearning n'interroge que `?source=bet-elearning` et que la
   route filtre strictement dessus. Chaque appel de ce fichier qui oubliait la source
   produisait donc une notification REÉLLEMENT CRÉÉE mais INVISIBLE pour son destinataire -
   la panne était silencieuse des deux côtés.
   On enveloppe à l'import plutôt que de corriger chaque appel : un appel ajouté demain
   hérite du bon comportement sans qu'on ait à y penser. Une notification qui doit partir
   vers dash peut toujours surcharger `source` explicitement. ── */
const _SRC = { source: 'bet-elearning' };
const notifyRole       = (r, p, x) => _notifyRole(r, { ..._SRC, ...p }, x);
const notifyUser       = (u, p)    => _notifyUser(u, { ..._SRC, ...p });
const notifyEntreprise = (e, p)    => _notifyEntreprise(e, { ..._SRC, ...p });

import { logAudit } from "../middlewares/logAudit.js";
import { notifierApprenants, notifierParentsMineurs } from "./remplacements.js";
import { photoValide } from "../utils/photoUrl.js";

/* La colonne `photo_url` manque-t-elle sur cette base ? Mêmes codes que côté
   `conversations.js` : 42703 (colonne inconnue) et PGRST204 (le cache de schéma de
   PostgREST ne la connaît pas encore). Permet de créer une classe sans photo plutôt que
   d'échouer entièrement tant que Backend/sql/photo_classes_elearning.sql n'est pas passé. */
const colonneAbsente = (e) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" || /photo_url/.test(e.message || ""));

// Rôles admin BET + PA Advisor - mêmes destinataires que pour un remplacement temporaire
// (voir ROLES_PA dans remplacements.js), à tenir informés de toute suspension définitive.
const ROLES_ADMIN_BET_PA = ["super_admin", "manager", "pedagogical_advisor", "onboarding"];

// PA Advisor + Onboarding - destinataires des alertes de quota atteint (classe ou entreprise).
// On garde les deux formes de libellé de rôle (valeurs réelles utilisateurs.role ET libellés
// de routage frontend bet-elearning) par sécurité, voir notifyRole() plus bas.
const ROLES_QUOTA = {
  pa:         ["pedagogical_advisor", "admin_pa_advisor"],
  onboarding: ["onboarding", "admin_onboarding"],
};

/* LA CHAÎNE DE SUPERVISION. Le superviseur et ses adjoints suivent l'activité
   pédagogique sans en être les exécutants : ils ne reçoivent donc pas les messages qui
   appellent une action — « classe à pourvoir » reste au PA, qui seul peut l'attribuer —
   mais les faits, pour savoir ce qui s'ouvre, qui l'anime et qui y entre.

   Les quatre noms sont nécessaires : `superviseur` / `deputy_superviseur` sont les rôles
   réels, `admin_superviseur` / `admin_deputy_superviseur` les façades que porte un compte
   côté bet-elearning. Notifier l'un sans l'autre laisse la moitié des comptes muets. */
const ROLES_SUPERVISION = [
  "superviseur", "admin_superviseur",
  "deputy_superviseur", "admin_deputy_superviseur",
];

/* L'ASSISTANTE E-LEARNING. Elle reçoit le dossier, le vérifie, l'envoie au test et le
   transmet à l'Onboarding : elle suit ses apprenants jusqu'à ce qu'ils démarrent, et
   savoir qui les encadre en fait partie.
   Les quatre noms sont nécessaires parce qu'AUCUN compte ne porte réellement
   `assistant_elearning` : `ROLE_MAP_BET` résout `commercial`, `corporate` et
   `admin_commercial` vers la même façade. Ne citer que le nom « officiel » ne notifierait
   donc personne — c'est l'erreur qui rendait déjà muettes d'autres notifications. */
const ROLES_ASSISTANTE = ["assistant_elearning", "commercial", "corporate", "admin_elearning"];

// Vérifie le double quota (capacité de la classe ET quota de licences de l'entreprise) avant
// d'ajouter/réactiver un apprenant. Retourne { bloque: false } si c'est OK, sinon
// { bloque: true, message } et notifie PA Advisor + Onboarding.
async function verifierQuotaClasse(classeId) {
  const { data: classe, error: errClasse } = await supabase
    .from("classes_elearning")
    .select("id, nom, capacite_max, entreprise_id")
    .eq("id", classeId)
    .single();
  if (errClasse) throw new Error(errClasse.message);

  const { count: nbClasse, error: errCount } = await supabase
    .from("classes_elearning_apprenants")
    .select("id", { count: "exact", head: true })
    .eq("classe_id", classeId)
    .eq("statut", "actif");
  if (errCount) throw new Error(errCount.message);

  if ((nbClasse || 0) >= (classe.capacite_max || 0)) {
    const message = `La classe "${classe.nom}" a atteint sa capacité maximale (${classe.capacite_max} bénéficiaires). Impossible d'ajouter un nouveau bénéficiaire.`;
    const notif = {
      type: "classe", titre: "🔒 Quota classe atteint",
      message: `Tentative d'ajout d'un bénéficiaire dans la classe "${classe.nom}" alors qu'elle est déjà pleine (${classe.capacite_max}/${classe.capacite_max}).`,
      meta: { classe_id: classeId, capacite_max: classe.capacite_max },
    };
    await Promise.allSettled([
      notifyRole(ROLES_QUOTA.pa, notif),
      notifyRole(ROLES_QUOTA.onboarding, notif),
    ]);
    return { bloque: true, message };
  }

  if (classe.entreprise_id) {
    const { data: entreprise, error: errEnt } = await supabase
      .from("comptes_entreprises")
      .select("id, nom_entreprise, nb_licences")
      .eq("id", classe.entreprise_id)
      .single();
    if (errEnt) throw new Error(errEnt.message);

    if (entreprise?.nb_licences != null) {
      const { data: classesEnt, error: errClasses } = await supabase
        .from("classes_elearning")
        .select("id")
        .eq("entreprise_id", classe.entreprise_id);
      if (errClasses) throw new Error(errClasses.message);
      const classeIds = (classesEnt || []).map(c => c.id);

      const { count: nbEnt, error: errCountEnt } = await supabase
        .from("classes_elearning_apprenants")
        .select("id", { count: "exact", head: true })
        .in("classe_id", classeIds)
        .eq("statut", "actif");
      if (errCountEnt) throw new Error(errCountEnt.message);

      if ((nbEnt || 0) >= entreprise.nb_licences) {
        const message = `L'entreprise "${entreprise.nom_entreprise}" a atteint son quota de licences (${entreprise.nb_licences}). Impossible d'ajouter un nouveau bénéficiaire.`;
        const notif = {
          type: "entreprise", titre: "🔒 Quota licences entreprise atteint",
          message: `Tentative d'ajout d'un bénéficiaire pour "${entreprise.nom_entreprise}" alors que le quota de licences est atteint (${entreprise.nb_licences}/${entreprise.nb_licences}).`,
          meta: { entreprise_id: classe.entreprise_id, nb_licences: entreprise.nb_licences },
        };
        await Promise.allSettled([
          notifyRole(ROLES_QUOTA.pa, notif),
          notifyRole(ROLES_QUOTA.onboarding, notif),
        ]);
        return { bloque: true, message };
      }
    }
  }

  return { bloque: false };
}

const router = Router();

function acteurAudit(req) {
  return {
    acteur_id:    req.profil?.id    || null,
    acteur_nom:   `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || null,
    acteur_email: req.profil?.email || req.user?.email || null,
    acteur_role:  req.role          || "admin",
    plateforme:   "bet-elearning",
  };
}

// ── GET /api/classes-elearning ──────────────────────────────────────────────
// Liste toutes les classes e-learning avec comptage apprenants
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    const { entreprise_id, statut, niveau, coach_id } = req.query;

    let q = supabase
      .from("classes_elearning")
      .select("*")
      .order("created_at", { ascending: false });

    if (entreprise_id) q = q.eq("entreprise_id", entreprise_id);
    if (statut)        q = q.eq("statut", statut);
    if (niveau)        q = q.eq("niveau", niveau);
    if (coach_id)      q = q.eq("coach_id", coach_id);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    // Compter les apprenants actifs par classe
    const ids = (data || []).map(c => c.id);
    let counts = {};
    if (ids.length) {
      const { data: cnt } = await supabase
        .from("classes_elearning_apprenants")
        .select("classe_id")
        .in("classe_id", ids)
        .eq("statut", "actif");
      (cnt || []).forEach(r => { counts[r.classe_id] = (counts[r.classe_id] || 0) + 1; });
    }

    // Logo de l'entreprise - utilisé par le dashboard coach (onglet Apprenants) pour afficher
    // le logo au lieu d'initiales génériques.
    const entrepriseIds = [...new Set((data || []).map(c => c.entreprise_id).filter(Boolean))];
    let logos = {};
    if (entrepriseIds.length) {
      const { data: ents } = await supabase
        .from("comptes_entreprises")
        .select("id, logo_url")
        .in("id", entrepriseIds);
      (ents || []).forEach(e => { logos[e.id] = e.logo_url; });
    }

    /* LE COACH, AU-DELÀ DE SON NOM. `classes_elearning` ne stocke que `coach_nom` -
       une chaîne figée au moment de l'assignation. Les écrans qui listent les classes
       veulent l'identifier d'un coup d'œil : son avatar et son e-mail de contact. On les
       résout depuis `utilisateurs`, ce qui a l'avantage de rendre la version À JOUR si
       le coach a changé de photo ou d'adresse depuis l'assignation. */
    const coachIds = [...new Set((data || []).map(c => c.coach_id).filter(Boolean))];
    let coachs = {};
    if (coachIds.length) {
      const { data: cos } = await supabase
        .from("utilisateurs")
        .select("id, email, avatar_url, nom, prenom")
        .in("id", coachIds);
      (cos || []).forEach(u => { coachs[u.id] = u; });
    }

    const classes = (data || []).map(c => {
      const co = c.coach_id ? coachs[c.coach_id] : null;
      return {
        ...c,
        nb_apprenants: counts[c.id] || 0,
        entreprise_logo_url: c.entreprise_id ? (logos[c.entreprise_id] || null) : null,
        // `coach_nom` reste la source si le compte a disparu : mieux vaut un nom figé
        // que plus de coach du tout sur une classe qui en a un.
        coach_nom:        co ? `${co.prenom || ""} ${co.nom || ""}`.trim() || c.coach_nom : c.coach_nom,
        coach_email:      co?.email || null,
        coach_avatar_url: co?.avatar_url || null,
      };
    });
    res.json({ classes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/classes-elearning/reporting ────────────────────────────────────
// Même liste de classes (avec comptage apprenants), dédiée à l'onglet Reporting
// et protégée par la permission "rapports" - contrairement à GET "/" qui reste
// ouverte à tout admin authentifié pour ne pas bloquer les onglets Vue
// d'ensemble / Programme qui partagent la même donnée mais pas la même permission.
router.get("/reporting", authenticateAdmin, requirePermission("rapports", "manage"), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("classes_elearning")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    const ids = (data || []).map(c => c.id);
    let counts = {};
    if (ids.length) {
      const { data: cnt } = await supabase
        .from("classes_elearning_apprenants")
        .select("classe_id")
        .in("classe_id", ids)
        .eq("statut", "actif");
      (cnt || []).forEach(r => { counts[r.classe_id] = (counts[r.classe_id] || 0) + 1; });
    }

    const classes = (data || []).map(c => ({ ...c, nb_apprenants: counts[c.id] || 0 }));
    res.json({ classes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/classes-elearning/apprenants/tous ──────────────────────────────
// Tous les apprenants e-learning, toutes classes confondues (Customer Care)
router.get("/apprenants/tous", authenticateAdmin, async (req, res) => {
  try {
    const { data: classes, error: errClasses } = await supabase
      .from("classes_elearning")
      .select("id, nom, niveau, entreprise_id, entreprise_nom");
    if (errClasses) return res.status(500).json({ error: errClasses.message });

    const { data: apprenants, error: errApp } = await supabase
      .from("classes_elearning_apprenants")
      .select("*")
      .order("created_at", { ascending: false });
    if (errApp) return res.status(500).json({ error: errApp.message });

    const classeMap = {};
    (classes || []).forEach(c => { classeMap[c.id] = c; });

    const enrichis = (apprenants || []).map(a => ({
      ...a,
      classe_nom:     classeMap[a.classe_id]?.nom || null,
      niveau_classe:  classeMap[a.classe_id]?.niveau || null,
      entreprise_id:  classeMap[a.classe_id]?.entreprise_id || null,
      entreprise_nom: classeMap[a.classe_id]?.entreprise_nom || null,
    }));

    res.json({ apprenants: enrichis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/classes-elearning/apprenants/:id/suivi
 *
 * Coche ou décoche une étape de démarrage d'un apprenant E-LEARNING.
 *
 * Pendant de `PATCH /api/groupes/apprenants/:id/suivi`, qui agit sur `groupes_apprenants` -
 * la table des classes de dash. L'écran « Suivi démarrage » de l'Onboarding appelait cette
 * dernière et affichait donc les apprenants du présentiel ; cette route lui donne son
 * équivalent sur `classes_elearning_apprenants`.
 *
 * ON NE STOCKE QUE CE QUI SE COCHE À LA MAIN. `bienvenue` et `acces` sont déduites côté
 * écran de la présence d'un `apprenant_id` - le compte est créé à l'assignation, donc son
 * existence vaut preuve d'envoi. Les accepter ici permettrait de les décocher alors que le
 * compte existe, c'est-à-dire d'afficher une case qui ment.
 */
const ETAPES_SUIVI_MANUELLES = ["kit", "planning"];

router.patch("/apprenants/:id/suivi", authenticateAdmin, requirePermission("classes", "update"), async (req, res) => {
  try {
    const recu = req.body?.suivi_checklist;
    if (!recu || typeof recu !== "object" || Array.isArray(recu)) {
      return res.status(400).json({ error: "suivi_checklist doit être un objet." });
    }

    /* ON FUSIONNE, ON NE REMPLACE PAS. `bienvenue` et `acces` sont écrites par le serveur
       au moment où l'e-mail de bienvenue part réellement ; elles ne figurent pas dans les
       étapes cochables à la main. Écrire l'objet reçu tel quel les effacerait au premier
       clic sur « kit » ou « planning » - l'envoi déjà fait disparaîtrait de l'écran. */
    const { data: avant } = await supabase
      .from("classes_elearning_apprenants")
      .select("suivi_checklist").eq("id", req.params.id).maybeSingle();

    const fusion = { ...(avant?.suivi_checklist || {}) };
    ETAPES_SUIVI_MANUELLES.forEach(k => { if (k in recu) fusion[k] = !!recu[k]; });

    const { data, error } = await supabase
      .from("classes_elearning_apprenants")
      .update({ suivi_checklist: fusion })
      .eq("id", req.params.id)
      .select("id, suivi_checklist")
      .single();

    /* La colonne peut ne pas exister encore - le SQL est livré à part
       (Backend/sql/suivi_demarrage_classes_elearning.sql). On le DIT plutôt que de rendre
       une erreur 500 que l'écran afficherait comme un échec de réseau. */
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      return res.status(409).json({
        error: "Le suivi de démarrage n'est pas encore installé sur cette base "
             + "(Backend/sql/suivi_demarrage_classes_elearning.sql).",
      });
    }
    if (error) return res.status(500).json({ error: error.message });

    res.json({ apprenant: data });
  } catch (err) {
    console.error("[classes-elearning/suivi]", err.message || err);
    res.status(500).json({ error: "Enregistrement impossible" });
  }
});

// ── GET /api/classes-elearning/sans-coach ───────────────────────────────────
// Classes créées sans coach assigné - file d'attente pour le PA Advisor
router.get("/sans-coach", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("classes_elearning")
      .select("*")
      .is("coach_id", null)
      .neq("statut", "archive")
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const ids = (data || []).map(c => c.id);
    let counts = {};
    if (ids.length) {
      const { data: cnt } = await supabase
        .from("classes_elearning_apprenants")
        .select("classe_id")
        .in("classe_id", ids)
        .eq("statut", "actif");
      (cnt || []).forEach(r => { counts[r.classe_id] = (counts[r.classe_id] || 0) + 1; });
    }

    const classes = (data || []).map(c => ({ ...c, nb_apprenants: counts[c.id] || 0 }));
    res.json({ classes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/classes-elearning/coaches-elearning ─────────────────────────────
// Coachs/professeurs habilités à intervenir sur la plateforme e-learning
router.get("/coaches-elearning", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("utilisateurs")
      .select("id, nom, prenom, email, role, type_coach, coach_info, acces_elearning, avatar_url, actif")
      .in("role", ["coach", "professeur_titulaire", "professeur_remplacant"])
      .eq("acces_elearning", true)
      .eq("actif", true)
      .order("nom");

    if (error) return res.status(500).json({ error: error.message });

    /* LA NOTE MOYENNE ACCOMPAGNE CHAQUE COACH, parce que c'est elle qui détermine sa
       catégorie de contrat (Corporate / BET Group / Needs Improvement / Needs Retraining).
       Cette liste sert à ASSIGNER un coach à une classe : choisir sans voir sa catégorie
       revient à décider à l'aveugle, alors que le superviseur, lui, la voit.
       Mêmes sources et même filtre de plateforme que `coachs-conformite` du superviseur
       bet-elearning - sinon le PA et le superviseur liraient deux moyennes différentes
       pour la même personne. */
    const coaches = data || [];
    const ids = coaches.map(c => c.id);
    const notesPar = {};
    if (ids.length) {
      const vide = { data: [] };
      const sur = (p) => p.then(r => (r?.error ? vide : r), () => vide);
      const [evalsR, rapportsR] = await Promise.all([
        sur(supabase.from("evaluations_coachs").select("coach_id, note_finale")
          .in("coach_id", ids).eq("plateforme", "bet-elearning")),
        sur(supabase.from("rapports_observation").select("coach_id, note_globale")
          .in("coach_id", ids).eq("plateforme", "bet-elearning")),
      ]);
      const ajouter = (id, v) => {
        const n = parseFloat(v);
        if (!Number.isFinite(n) || n <= 0) return;
        (notesPar[id] = notesPar[id] || []).push(n);
      };
      (evalsR.data || []).forEach(e => ajouter(e.coach_id, e.note_finale));
      (rapportsR.data || []).forEach(r => ajouter(r.coach_id, r.note_globale));
    }

    /* ── CE QU'IL FAUT POUR CHOISIR, ET PAS SEULEMENT POUR NOMMER ──
       Cette liste sert à assigner un coach à une classe. Le nom et l'e-mail ne suffisent
       pas à décider : il faut savoir s'il est déjà chargé, s'il a renseigné ses
       disponibilités pour le mois où la classe démarre, et ce qu'il enseigne.

       Les DISPONIBILITÉS sont filtrées sur `plateforme = 'bet-elearning'` : la table est
       partagée avec dash, et compter les créneaux du présentiel ferait passer pour
       disponible un coach qui ne l'est que là-bas. On compte le mois courant ET le
       suivant, parce qu'une classe qui démarre début novembre se prépare en octobre. */
    const maintenant = new Date();
    const moisCourant = maintenant.getMonth() + 1;
    const anneeCourante = maintenant.getFullYear();
    const moisSuivant = moisCourant === 12 ? 1 : moisCourant + 1;
    const anneeSuivante = moisCourant === 12 ? anneeCourante + 1 : anneeCourante;

    const vide2 = { data: [] };
    const sur2 = (p) => p.then(r => (r?.error ? vide2 : r), () => vide2);
    const [dispoR, classesR, contratsR] = await Promise.all([
      /* `jour` et `creneau` EN PLUS DU COMPTE. On ne renvoyait qu'un total — « 10
         créneaux en octobre » — alors que la question posée en assignant un coach est
         précise : couvre-t-il le lundi et le jeudi de 9h à 11h, les horaires de CETTE
         classe ? Un total n'y répond pas, et il fallait quitter l'écran pour aller lire
         la grille du coach ailleurs. */
      ids.length ? sur2(supabase.from("coach_disponibilites")
        .select("coach_id, dispo, mois, annee, jour, creneau")
        .in("coach_id", ids).eq("plateforme", "bet-elearning").eq("dispo", true)) : vide2,
      // La charge réelle : les classes e-learning encore vivantes dont il est le coach.
      sur2(supabase.from("classes_elearning").select("coach_id, statut").neq("statut", "archive")),
      ids.length ? sur2(supabase.from("contrats_coachs").select("coach_id, statut").in("coach_id", ids)) : vide2,
    ]);

    const dispoCe = {}, dispoSuiv = {}, chargePar = {}, contratsPar = {};
    // Le détail, à côté du compte : { coach_id: [{ jour, creneau }] }, une entrée par heure.
    const detailCe = {}, detailSuiv = {};
    (dispoR.data || []).forEach(d => {
      if (d.mois === moisCourant && d.annee === anneeCourante) {
        dispoCe[d.coach_id] = (dispoCe[d.coach_id] || 0) + 1;
        (detailCe[d.coach_id] = detailCe[d.coach_id] || []).push({ jour: d.jour, creneau: d.creneau });
      }
      if (d.mois === moisSuivant && d.annee === anneeSuivante) {
        dispoSuiv[d.coach_id] = (dispoSuiv[d.coach_id] || 0) + 1;
        (detailSuiv[d.coach_id] = detailSuiv[d.coach_id] || []).push({ jour: d.jour, creneau: d.creneau });
      }
    });
    (classesR.data || []).forEach(c => { if (c.coach_id) chargePar[c.coach_id] = (chargePar[c.coach_id] || 0) + 1; });
    (contratsR.data || []).forEach(c => { if (c.coach_id) contratsPar[c.coach_id] = (contratsPar[c.coach_id] || 0) + 1; });

    res.json({
      mois_courant: { mois: moisCourant, annee: anneeCourante },
      mois_suivant: { mois: moisSuivant, annee: anneeSuivante },
      coaches: coaches.map(c => {
        const notes = notesPar[c.id] || [];
        return {
          ...c,
          // `null` et non 0 : un coach jamais observé n'est pas un coach noté zéro, et
          // l'affichage doit pouvoir le ranger dans « Non évalué ».
          note_moyenne: notes.length
            ? Math.round((notes.reduce((s, n) => s + n, 0) / notes.length) * 10) / 10
            : null,
          nb_observations: notes.length,
          nb_classes:       chargePar[c.id]  || 0,
          nb_contrats:      contratsPar[c.id] || 0,
          dispos_ce_mois:   dispoCe[c.id]    || 0,
          dispos_mois_prochain: dispoSuiv[c.id] || 0,
          creneaux_ce_mois:       detailCe[c.id]   || [],
          creneaux_mois_prochain: detailSuiv[c.id] || [],
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/classes-elearning/evaluations ──────────────────────────────────
// Toutes les évaluations e-learning enrichies avec coach + classe
router.get("/evaluations", authenticateAdmin, async (req, res) => {
  try {
    const { coach_id, date_from, date_to } = req.query;
    let evalQ = supabase.from("evaluations_elearning").select("*").order("date_evaluation", { ascending: false });
    if (coach_id)  evalQ = evalQ.eq("coach_id", coach_id);
    if (date_from) evalQ = evalQ.gte("date_evaluation", date_from);
    if (date_to)   evalQ = evalQ.lte("date_evaluation", date_to);

    const [{ data: evals, error: errE }, { data: coaches }, { data: classes }] = await Promise.all([
      evalQ,
      supabase.from("utilisateurs").select("id, prenom, nom, role, type_coach"),
      supabase.from("classes_elearning").select("id, nom, entreprise_nom, niveau"),
    ]);
    if (errE) return res.status(500).json({ error: errE.message });

    const coachMap  = Object.fromEntries((coaches || []).map(c => [c.id, c]));
    const classeMap = Object.fromEntries((classes || []).map(c => [c.id, c]));

    const enriched = (evals || []).map(e => ({
      ...e,
      coach:      coachMap[e.coach_id]   || null,
      coach_nom:  coachMap[e.coach_id]   ? `${coachMap[e.coach_id].prenom} ${coachMap[e.coach_id].nom}` : '-',
      classe:     classeMap[e.classe_id] || null,
      classe_nom: classeMap[e.classe_id]?.nom || e.periode || '-',
    }));
    res.json({ evaluations: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/classes-elearning/evaluations ─────────────────────────────────
// Créer une évaluation e-learning - réservé au Superviseur Général / Deputy
// Superviseur : le PA Advisor ne fait que recevoir les notes qu'ils transmettent
// (cf. onglet "Rapports Superviseur"), il n'en crée jamais lui-même.
const ROLES_EVAL_ELEARNING = ["superviseur", "deputy_superviseur", "admin_superviseur", "admin_deputy_superviseur", "super_admin"];
router.post("/evaluations", authenticateAdmin, (req, res, next) => {
  if (!ROLES_EVAL_ELEARNING.includes(req.role)) {
    return res.status(403).json({ error: "Action réservée au Superviseur Général et aux Deputy Superviseurs" });
  }
  next();
}, async (req, res) => {
  try {
    const {
      coach_id, classe_id, periode,
      ponctualite, qualite_pedagogique, satisfaction_apprenants, respect_programme, communication,
      rapport, points_forts, axes_amelioration, statut,
    } = req.body;

    if (!coach_id) return res.status(400).json({ error: "coach_id requis" });
    if (!periode && !classe_id) return res.status(400).json({ error: "periode ou classe_id requis" });

    const criteres = [ponctualite, qualite_pedagogique, satisfaction_apprenants, respect_programme, communication].filter(v => v != null);
    const note_finale = criteres.length > 0
      ? Math.round((criteres.reduce((s, v) => s + v, 0) / criteres.length) * 10) / 10
      : null;

    const evaluateur_nom = [req.profil?.prenom, req.profil?.nom].filter(Boolean).join(" ") || req.profil?.email || null;

    const { data, error } = await supabase
      .from("evaluations_elearning")
      .insert({
        coach_id, classe_id: classe_id || null,
        evaluateur_id: req.profil?.id || null,
        evaluateur_nom,
        periode: periode || null,
        ponctualite, qualite_pedagogique, satisfaction_apprenants, respect_programme, communication,
        note_finale, rapport: rapport || null,
        points_forts: points_forts || null,
        axes_amelioration: axes_amelioration || null,
        statut: statut || "validée",
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ evaluation: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/classes-elearning/:id/cloture ─────────────────────────────────
// Clôturer définitivement une classe e-learning (statut → "clos")
// CRITICAL: on ne change PAS classes_elearning_apprenants.statut
router.post("/:id/cloture", authenticateAdmin, requirePermission("classes","update"), async (req, res) => {
  try {
    const { id } = req.params;
    const { data: classe } = await supabase
      .from("classes_elearning")
      .select("id, nom, statut, coach_id, coach_nom, date_fin, entreprise_id, entreprise_nom")
      .eq("id", id)
      .maybeSingle();

    if (!classe) return res.status(404).json({ error: "Classe introuvable" });
    if (classe.statut === "clos") return res.status(409).json({ error: "Classe déjà clôturée" });

    const today = new Date().toISOString().slice(0, 10);

    // 1. Clôturer la classe
    await supabase.from("classes_elearning")
      .update({ statut: "clos", date_fin: classe.date_fin || today })
      .eq("id", id);

    // 2. Récupérer les apprenants inscrits (actifs) pour les notifications
    const { data: apprenants } = await supabase
      .from("classes_elearning_apprenants")
      .select("id, apprenant_id, nom_complet")
      .eq("classe_id", id)
      .eq("statut", "actif");

    const nbApprenants = (apprenants || []).length;

    // 3. Notification au coach e-learning
    if (classe.coach_id) {
      const { data: coachUser } = await supabase
        .from("utilisateurs")
        .select("id")
        .eq("id", classe.coach_id)
        .maybeSingle();
      if (coachUser) {
        await supabase.from("notifications").insert({
          user_id: coachUser.id,
          type: "warning",
          titre: `Classe clôturée : ${classe.nom}`,
          message: `La classe "${classe.nom}" (${classe.entreprise_nom || "E-Learning BET"}) a été officiellement clôturée.`,
          lu: false,
          meta: { classe_id: id, action: "cloture_elearning" },
        });
      }
    }

    // 4. Notifications aux apprenants ayant un compte utilisateur
    const apprenantUserIds = (apprenants || [])
      .map(a => a.apprenant_id)
      .filter(Boolean);
    if (apprenantUserIds.length) {
      await supabase.from("notifications").insert(
        apprenantUserIds.map(uid => ({
          user_id: uid,
          type: "info",
          titre: `Fin de formation : ${classe.nom}`,
          message: `Votre classe "${classe.nom}" est maintenant terminée. Félicitations pour votre engagement !`,
          lu: false,
          meta: { classe_id: id, action: "cloture_elearning" },
        }))
      );
    }

    // 5. Notification à l'entreprise cliente (rôle client_entreprise liée à entreprise_id)
    if (classe.entreprise_id) {
      const { data: entUsers } = await supabase
        .from("utilisateurs")
        .select("id")
        .eq("entreprise_id", classe.entreprise_id)
        .eq("role", "client_entreprise")
        .eq("actif", true);
      if (entUsers?.length) {
        await supabase.from("notifications").insert(
          entUsers.map(u => ({
            user_id: u.id,
            type: "info",
            titre: `Formation terminée : ${classe.nom}`,
            message: `La classe "${classe.nom}" (${nbApprenants} bénéficiaire${nbApprenants > 1 ? "s" : ""}) a été officiellement clôturée par l'équipe BET.`,
            lu: false,
            meta: { classe_id: id, action: "cloture_elearning" },
          }))
        );
      }
    }

    // 6. Notification admin_elearning + superviseur
    const { data: admins } = await supabase
      .from("utilisateurs")
      .select("id")
      .in("role", ["admin_elearning", "superviseur", "super_admin"])
      .eq("actif", true);
    if (admins?.length) {
      await supabase.from("notifications").insert(
        admins.map(u => ({
          user_id: u.id,
          type: "info",
          titre: `🔒 Classe e-learning clôturée : ${classe.nom}`,
          message: `La classe "${classe.nom}"${classe.entreprise_nom ? ` (${classe.entreprise_nom})` : ""} a été clôturée. ${nbApprenants} apprenant${nbApprenants > 1 ? "s" : ""}.`,
          lu: false,
          meta: { classe_id: id, action: "cloture_elearning" },
        }))
      );
    }

    res.json({ success: true, classe_id: id, apprenants_notifies: nbApprenants });
  } catch (err) {
    console.error("[cloture_elearning]", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/classes-elearning/:id ──────────────────────────────────────────
router.get("/:id", authenticateAdmin, async (req, res) => {
  try {
    const { data: classe, error } = await supabase
      .from("classes_elearning")
      .select("*")
      .eq("id", req.params.id)
      .single();
    if (error) return res.status(404).json({ error: "Classe introuvable" });

    const { data: apprenants } = await supabase
      .from("classes_elearning_apprenants")
      .select("*")
      .eq("classe_id", req.params.id)
      .order("date_inscription", { ascending: false });

    res.json({ classe, apprenants: apprenants || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/classes-elearning ──────────────────────────────────────────────
// Créer une nouvelle classe e-learning
router.post("/", authenticateAdmin, requirePermission("classes","create"), async (req, res) => {
  try {
    const {
      nom, entreprise_id, entreprise_nom,
      niveau, type_cours, coach_id, coach_nom,
      horaire, date_debut, date_fin, capacite_max, photo_url,
    } = req.body;

    if (!nom?.trim()) return res.status(400).json({ error: "Le nom de la classe est requis" });

    /* La photo passe par la même validation que celle des groupes : elle finit dans un
       attribut `src`, et une URL `javascript:` y serait exécutée chez chaque apprenant. */
    const photo = photoValide(photo_url);
    if (photo === undefined) return res.status(400).json({ error: "Photo de classe invalide." });

    const createdByNom = [req.profil.prenom, req.profil.nom].filter(Boolean).join(" ") || req.profil.email;

    const aInserer = {
      nom:            nom.trim(),
      entreprise_id:  entreprise_id  || null,
      entreprise_nom: entreprise_nom || null,
      niveau:         niveau         || null,
      type_cours:     type_cours     || "en_ligne",
      coach_id:       coach_id       || null,
      coach_nom:      coach_nom      || null,
      horaire:        Array.isArray(horaire) ? horaire : [],
      date_debut:     date_debut     || null,
      date_fin:       date_fin       || null,
      capacite_max:   Number(capacite_max) || 10,
      statut:         "actif",
      created_by:     req.profil.id,
      created_by_nom: createdByNom,
      ...(photo ? { photo_url: photo } : {}),
    };

    let { data, error } = await supabase
      .from("classes_elearning").insert(aInserer).select().single();

    /* La colonne `photo_url` peut ne pas exister encore - le SQL est livré à part
       (Backend/sql/photo_classes_elearning.sql) et s'exécute quand l'équipe le décide.
       Plutôt que de faire échouer TOUTE la création d'une classe pour une image
       facultative, on rejoue sans elle et on le dit : l'écran saura pourquoi la photo
       n'est pas apparue. */
    let photoNonEnregistree = false;
    if (error && photo && colonneAbsente(error)) {
      const { photo_url: _sansPhoto, ...sansColonne } = aInserer;
      ({ data, error } = await supabase
        .from("classes_elearning").insert(sansColonne).select().single());
      if (!error) photoNonEnregistree = true;
    }

    if (error) return res.status(500).json({ error: error.message });

    /* ── QUI PRÉVENIR À LA CRÉATION ──
       Seul le coach l'était, et seulement s'il y en avait un. Depuis que l'onboarding
       crée les classes SANS coach — c'est le PA qui l'assigne, lui seul voit les charges,
       les disponibilités et les contrats —, le cas sans coach était devenu le cas normal
       et ne prévenait plus personne : la classe restait en attente d'un titulaire sans
       que celui qui doit l'attribuer sache qu'elle existe.

       Deux messages distincts, et non un seul neutre : l'un informe, l'autre appelle une
       action. Le second porte `coach_a_assigner` et le `classe_id` en méta pour ouvrir
       directement l'écran d'assignation, comme le fait déjà l'assignation d'un apprenant
       à une classe sans coach (inscriptionsElearning.js). */
    const contexteClasse = `${data.niveau ? ` (${data.niveau})` : ""}${data.entreprise_nom ? ` - ${data.entreprise_nom}` : ""}`;
    // `createdByNom` est déjà dérivé plus haut et inscrit dans `created_by_nom` : on le
    // réutilise plutôt que de recalculer le même nom d'une seconde façon, qui finirait
    // par diverger de ce que l'audit a enregistré.
    const creeePar = createdByNom || "l'onboarding";
    const debutLe = data.date_debut
      ? ` Démarrage prévu le ${new Date(data.date_debut).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.`
      : "";

    if (data.coach_id) {
      await notifyUser(data.coach_id, {
        type:    "coach_assigne",
        titre:   `🏫 Nouvelle classe assignée - ${data.nom}`,
        message: `Vous avez été assigné(e) comme coach de la classe "${data.nom}"${contexteClasse}.`,
        meta:    { classe_id: data.id, classe_nom: data.nom },
      }).catch(err => console.error("[classes-elearning] notifyUser coach", err.message));

      await notifyRole(ROLES_QUOTA.pa, {
        type:    "success",
        titre:   `Nouvelle classe créée - ${data.nom}`,
        message: `${creeePar} a créé la classe "${data.nom}"${contexteClasse}, avec ${data.coach_nom || "un coach"} comme coach.${debutLe}`,
        meta:    { classe_id: data.id, classe_nom: data.nom },
      }).catch(err => console.error("[classes-elearning] notifyRole PA", err.message));
    } else {
      await notifyRole(ROLES_QUOTA.pa, {
        type:    "warning",
        titre:   `⚠️ Classe sans coach - ${data.nom}`,
        message: `${creeePar} a créé la classe "${data.nom}"${contexteClasse}, sans coach. À pourvoir pour que le programme démarre.${debutLe}`,
        meta:    { classe_id: data.id, classe_nom: data.nom, coach_a_assigner: true },
      }).catch(err => console.error("[classes-elearning] notifyRole PA sans coach", err.message));
    }

    /* La supervision est informée de TOUTE classe ouverte, pourvue ou non. L'état du
       coach est dit dans le même message plutôt que dans deux notifications séparées :
       c'est une seule information — une classe existe, voici qui l'anime ou non. */
    await notifyRole(ROLES_SUPERVISION, {
      type:    "info",
      titre:   `🏫 Nouvelle classe - ${data.nom}`,
      message: `${creeePar} a ouvert la classe "${data.nom}"${contexteClasse}. `
             + `${data.coach_nom ? `Coach : ${data.coach_nom}.` : "Pas encore de coach."}${debutLe}`,
      meta:    { classe_id: data.id, classe_nom: data.nom, sans_coach: !data.coach_id },
    }).catch(err => console.error("[classes-elearning] notifyRole supervision", err.message));

    /* ── ET LA RH DE L'ENTREPRISE ──
       Une classe créée pour une entreprise la concerne directement : c'est sur son
       contrat qu'elle est ouverte et ce sont ses salariés qui y entreront. Elle ne
       l'apprenait qu'en ouvrant son espace, ou par un appel.

       Le message ne parle PAS du coach, ni de son absence. Qui anime la classe est une
       affaire interne tant que l'assignation n'est pas faite ; annoncer « sans coach »
       à un client inquiète sur une étape qui n'est pas la sienne et dont il n'a aucune
       prise. La RH sera prévenue de l'assignation quand elle aura eu lieu. */
    if (data.entreprise_id) {
      const creneaux = Array.isArray(data.horaire) ? data.horaire : [];
      const quand = creneaux.length
        ? ` Créneaux : ${creneaux.map(c => `${c.jour} ${c.debut}-${c.fin}`).join(", ")}.`
        : "";
      await notifyEntreprise(data.entreprise_id, {
        type:    "info",
        titre:   `🏫 Nouvelle classe ouverte - ${data.nom}`,
        message: `La classe "${data.nom}"${data.niveau ? ` (${data.niveau})` : ""} a été ouverte pour votre entreprise`
               + `${data.capacite_max ? `, ${data.capacite_max} places` : ""}.`
               + `${debutLe}${quand} Vos bénéficiaires y seront inscrits au fur et à mesure.`,
        meta:    { classe_id: data.id, classe_nom: data.nom, entreprise_id: data.entreprise_id },
      }).catch(err => console.error("[classes-elearning] notifyEntreprise", err.message));
    }

    logAudit({
      ...acteurAudit(req),
      action_type: "CLASSE_CREEE",
      module:      "classes",
      entite_type: "classes_elearning",
      entite_id:   data.id,
      detail:      `Création de la classe "${data.nom}"${data.niveau ? ` (${data.niveau})` : ""}${data.entreprise_nom ? ` - ${data.entreprise_nom}` : ""}`,
      statut:      "success",
    }).catch(() => {});

    res.status(201).json({
      classe: data,
      ...(photoNonEnregistree ? {
        photo_non_enregistree: "La classe est créée, mais la photo n'a pas pu être enregistrée : "
          + "la colonne n'existe pas encore sur cette base (Backend/sql/photo_classes_elearning.sql).",
      } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/classes-elearning/:id ────────────────────────────────────────
// Modifier une classe
router.patch("/:id", authenticateAdmin, requirePermission("classes","update"), async (req, res) => {
  try {
    const allowed = ["nom", "niveau", "type_cours", "coach_id", "coach_nom",
                     "horaire", "date_debut", "date_fin", "capacite_max", "statut",
                     "entreprise_id", "entreprise_nom"];
    const payload = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) payload[k] = req.body[k]; });

    /* `photo_url` est traitée à part de la liste blanche : elle a besoin de sa validation
       (http(s) uniquement - cette valeur finit dans un `src`), et `null` doit passer pour
       retirer la photo, ce qu'une simple recopie confondrait avec « champ absent ». */
    if (req.body.photo_url !== undefined) {
      const photo = photoValide(req.body.photo_url);
      if (photo === undefined) return res.status(400).json({ error: "Photo de classe invalide." });
      payload.photo_url = photo;   // `null` retire la photo, l'écran retombe sur les initiales
    }

    // Récupérer l'ancien coach avant écrasement - pour ne notifier que si l'assignation change
    // réellement (évite de renotifier le même coach à chaque modification de la classe).
    let ancienCoachId = null;
    if (payload.coach_id !== undefined) {
      const { data: avant } = await supabase.from("classes_elearning").select("coach_id").eq("id", req.params.id).maybeSingle();
      ancienCoachId = avant?.coach_id || null;
    }

    let { data, error } = await supabase
      .from("classes_elearning")
      .update(payload)
      .eq("id", req.params.id)
      .select()
      .single();

    /* Même repli qu'à la création : si la colonne n'existe pas encore, on rejoue sans la
       photo plutôt que de faire aussi perdre le renommage ou le changement de coach
       demandés dans le même appel. */
    let photoNonEnregistree = false;
    if (error && payload.photo_url !== undefined && colonneAbsente(error)) {
      const { photo_url: _sansPhoto, ...reste } = payload;
      photoNonEnregistree = true;
      ({ data, error } = await supabase
        .from("classes_elearning").update(reste).eq("id", req.params.id).select().single());
    }

    if (error) return res.status(500).json({ error: error.message });

    // Notifier le coach nouvellement assigné à cette classe - et réattribuer ce qui va avec,
    // exactement comme /suspendre-coach (délégation active + séances futures non terminées) :
    // ce PATCH générique reste le seul chemin pour assigner un coach à une classe encore sans
    // titulaire, mais il peut aussi être appelé sur une classe qui a déjà des séances
    // programmées - sans cette réattribution elles restaient orphelines de l'ancien coach_id.
    if (payload.coach_id && payload.coach_id !== ancienCoachId) {
      await notifyUser(payload.coach_id, {
        type:    "coach_assigne",
        titre:   `🏫 Nouvelle classe assignée - ${data.nom}`,
        message: `Vous avez été assigné(e) comme coach de la classe "${data.nom}"${data.niveau ? ` (${data.niveau})` : ""}${data.entreprise_nom ? ` - ${data.entreprise_nom}` : ""}.`,
        meta:    { classe_id: data.id, classe_nom: data.nom },
        source:  "bet-elearning",
      }).catch(err => console.error("[classes-elearning] notifyUser coach", err.message));

      /* ── L'ASSIGNATION SE SAIT AILLEURS QU'AU COACH ──
         Seul le coach était prévenu. Or deux autres personnes attendent précisément
         cette information :

         · LA RH DE L'ENTREPRISE, parce que le coach est l'interlocuteur de ses salariés.
           C'est aussi la suite de l'annonce d'ouverture de la classe, où l'on ne parle
           délibérément pas du coach tant qu'il n'est pas désigné.
         · L'ONBOARDING, qui a créé la classe en attendant qu'elle soit pourvue et n'avait
           aucun retour : elle relançait le PA, ou ne savait pas que c'était fait.

         Première assignation et remplacement ne se disent pas pareil : apprendre qu'« un
         coach a été désigné » quand on en avait déjà un laisse croire à une erreur. */
      const nomCoach = payload.coach_nom || data.coach_nom || "Un coach";
      const remplacement = !!ancienCoachId;

      if (data.entreprise_id) {
        await notifyEntreprise(data.entreprise_id, {
          type:    "info",
          titre:   remplacement
            ? `👤 Changement de coach - ${data.nom}`
            : `👤 Coach désigné - ${data.nom}`,
          message: remplacement
            ? `${nomCoach} reprend l'animation de la classe "${data.nom}". Vos bénéficiaires en sont informés.`
            : `${nomCoach} animera la classe "${data.nom}"${data.niveau ? ` (${data.niveau})` : ""}. C'est votre interlocuteur pédagogique pour cette classe.`,
          meta:    { classe_id: data.id, classe_nom: data.nom, entreprise_id: data.entreprise_id },
        }).catch(err => console.error("[classes-elearning PATCH] notifyEntreprise coach", err.message));
      }

      await notifyRole(ROLES_SUPERVISION, {
        type:    "info",
        titre:   remplacement
          ? `👤 Coach remplacé - ${data.nom}`
          : `👤 Coach assigné - ${data.nom}`,
        message: `${nomCoach} ${remplacement ? "reprend" : "prend"} la classe "${data.nom}"`
               + `${data.niveau ? ` (${data.niveau})` : ""}${data.entreprise_nom ? ` - ${data.entreprise_nom}` : ""}.`,
        meta:    { classe_id: data.id, classe_nom: data.nom, coach_id: payload.coach_id },
      }).catch(err => console.error("[classes-elearning PATCH] notifyRole supervision", err.message));

      await notifyRole(ROLES_QUOTA.onboarding, {
        type:    "success",
        titre:   remplacement
          ? `Coach remplacé - ${data.nom}`
          : `✅ Classe pourvue - ${data.nom}`,
        message: remplacement
          ? `${nomCoach} reprend la classe "${data.nom}"${data.entreprise_nom ? ` - ${data.entreprise_nom}` : ""}.`
          : `La classe "${data.nom}"${data.entreprise_nom ? ` - ${data.entreprise_nom}` : ""} a désormais un coach : ${nomCoach}. Le programme peut démarrer.`,
        meta:    { classe_id: data.id, classe_nom: data.nom },
      }).catch(err => console.error("[classes-elearning PATCH] notifyRole onboarding", err.message));

      await notifyRole(ROLES_ASSISTANTE, {
        type:    "info",
        titre:   remplacement
          ? `🔁 Coach remplacé - ${data.nom}`
          : `✅ Coach désigné - ${data.nom}`,
        message: `${nomCoach} ${remplacement ? "reprend" : "encadre"} la classe "${data.nom}"`
               + `${data.entreprise_nom ? ` - ${data.entreprise_nom}` : ""}. Vos apprenants de cette classe sont concernés.`,
        meta:    { classe_id: data.id, classe_nom: data.nom },
      }).catch(err => console.error("[classes-elearning PATCH] notifyRole assistante", err.message));

      /* ── ET LES PREMIERS CONCERNÉS : LES APPRENANTS ──
         Ils l'apprenaient en voyant un nom inconnu ouvrir leur première séance. Le
         remplacement définitif (`/suspendre-coach`) les prévient depuis toujours ; cette
         route-ci, qui est pourtant LE chemin d'assignation du PA, ne le faisait pas.
         Les parents des mineurs reçoivent le même message : sur un enfant, c'est le
         parent qui lit la notification, et souvent le seul à avoir un compte. */
      notifierApprenants(req.params.id, {
        type:    "coach_change",
        titre:   remplacement ? "🔁 Nouveau coach pour votre classe" : "👤 Votre coach est désigné",
        message: remplacement
          ? `${nomCoach} est désormais votre coach sur "${data.nom}".`
          : `${nomCoach} sera votre coach sur "${data.nom}". Vous le retrouverez à votre première séance.`,
        meta:    { classe_id: data.id, classe_nom: data.nom },
      }).catch(err => console.error("[classes-elearning PATCH] notif apprenants", err.message));

      notifierParentsMineurs(req.params.id, {
        type:    "coach_change",
        titre:   remplacement ? "🔁 Nouveau coach pour votre enfant" : "👤 Le coach de votre enfant est désigné",
        message: remplacement
          ? `${nomCoach} est désormais le coach de votre enfant sur "${data.nom}".`
          : `${nomCoach} sera le coach de votre enfant sur "${data.nom}".`,
        meta:    { classe_id: data.id, classe_nom: data.nom },
      }).catch(err => console.error("[classes-elearning PATCH] notif parents", err.message));

      const { data: delegationsActives } = await supabase.from("delegations")
        .select("id, remplacement_id").eq("groupe_id", req.params.id).eq("statut", "active");
      if (delegationsActives?.length) {
        await supabase.from("delegations").update({ statut: "terminee", updated_at: new Date().toISOString() })
          .eq("groupe_id", req.params.id).eq("statut", "active").then(({ error: e }) => { if (e) console.error("[classes-elearning PATCH] clôture délégation active:", e.message); });
        const remplacementIds = delegationsActives.map(d => d.remplacement_id).filter(Boolean);
        if (remplacementIds.length) {
          await supabase.from("remplacements").update({ statut: "termine", updated_at: new Date().toISOString() })
            .in("id", remplacementIds).neq("statut", "termine").then(({ error: e }) => { if (e) console.error("[classes-elearning PATCH] clôture remplacement lié:", e.message); });
        }
      }

      if (ancienCoachId) {
        const STATUTS_TERMINAUX = ["realisee", "annulee", "reportee"];
        await supabase.from("seances_elearning")
          .update({ coach_id: payload.coach_id })
          .eq("classe_id", req.params.id).eq("coach_id", ancienCoachId)
          .not("statut", "in", `(${STATUTS_TERMINAUX.join(",")})`)
          .then(({ error: e }) => { if (e) console.error("[classes-elearning PATCH] transfert séances futures:", e.message); });
      }
    }

    logAudit({
      ...acteurAudit(req),
      action_type: "CLASSE_MODIFIEE",
      module:      "classes",
      entite_type: "classes_elearning",
      entite_id:   data.id,
      detail:      `Modification de la classe "${data.nom}" (${Object.keys(payload).join(", ")})`,
      statut:      "success",
    }).catch(() => {});

    res.json({
      classe: data,
      ...(photoNonEnregistree ? {
        photo_non_enregistree: "La photo de classe n'est pas encore installée sur cette base "
          + "(Backend/sql/photo_classes_elearning.sql).",
      } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/classes-elearning/:id/suspendre-coach ────────────────────────
// Suspension DÉFINITIVE d'un coach sur une classe (distincte d'un remplacement temporaire,
// voir Backend/docs/remplacement-schema.html étape 6). Le nouveau coach devient titulaire
// à part entière : hérite du contexte pédagogique complet (devoirs inclus), mais aucun
// honoraire déjà dû à l'ancien coach n'est jamais réécrit rétroactivement.
router.patch("/:id/suspendre-coach", authenticateAdmin, requirePermission("classes", "manage"), async (req, res) => {
  try {
    const { nouveau_coach_id, nouveau_coach_nom, motif } = req.body;
    if (!nouveau_coach_id || !nouveau_coach_nom)
      return res.status(400).json({ error: "nouveau_coach_id et nouveau_coach_nom sont requis" });
    if (!motif?.trim())
      return res.status(400).json({ error: "Un motif est requis pour une suspension définitive" });

    const { data: avant, error: eAvant } = await supabase
      .from("classes_elearning")
      .select("id, nom, niveau, coach_id, coach_nom, entreprise_id, entreprise_nom")
      .eq("id", req.params.id)
      .single();
    if (eAvant || !avant) return res.status(404).json({ error: "Classe introuvable" });

    const ancienCoachId  = avant.coach_id;
    const ancienCoachNom = avant.coach_nom;

    // coach_id ET coach_nom mis à jour ensemble, dans le même appel - coach_nom est un texte
    // dupliqué lu tel quel par une quinzaine d'écrans (RH entreprise, parent, coach, deputy...).
    const { data, error } = await supabase
      .from("classes_elearning")
      .update({ coach_id: nouveau_coach_id, coach_nom: nouveau_coach_nom, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // Une délégation TEMPORAIRE encore active sur cette classe (remplaçant B) devient
    // incohérente dès que le titulaire change définitivement (nouveau coach C) : B garderait un
    // accès (contexte de classe, séances) alors qu'il n'a plus de raison d'y être. On la
    // clôture donc ici, comme une clôture manuelle normale. `delegations.groupe_id` est la
    // colonne générique utilisée pour les deux plateformes (dash groupe OU classe bet-elearning).
    const { data: delegationsActives } = await supabase.from("delegations")
      .select("id, remplacement_id").eq("groupe_id", req.params.id).eq("statut", "active");
    if (delegationsActives?.length) {
      const { error: eDelegClot } = await supabase.from("delegations")
        .update({ statut: "terminee", updated_at: new Date().toISOString() })
        .eq("groupe_id", req.params.id).eq("statut", "active");
      if (eDelegClot) console.error("[suspendre-coach] clôture délégation active:", eDelegClot.message);
      const remplacementIds = delegationsActives.map(d => d.remplacement_id).filter(Boolean);
      if (remplacementIds.length) {
        const { error: eRemplClot } = await supabase.from("remplacements")
          .update({ statut: "termine", updated_at: new Date().toISOString() })
          .in("id", remplacementIds).neq("statut", "termine");
        if (eRemplClot) console.error("[suspendre-coach] clôture remplacement lié:", eRemplClot.message);
      }
    }

    // Contexte pédagogique transféré intégralement au nouveau titulaire - devoirs (rendus
    // non encore corrigés jamais laissés sans correcteur), médiathèque (leçons/modules) et
    // fichiers partagés sont tous scopés par coach_id en base : sans cette réattribution, le
    // nouveau titulaire hérite de la classe mais voit une médiathèque et des fichiers vides,
    // alors que le contenu existe toujours, juste attribué à l'ancien coach_id.
    const { error: eDevoirs } = await supabase.from("devoirs_elearning")
      .update({ coach_id: nouveau_coach_id }).eq("classe_id", req.params.id);
    if (eDevoirs) console.error("[suspendre-coach] transfert devoirs:", eDevoirs.message);

    /* `contains` et non `eq` : un contenu peut viser plusieurs classes, et
       `classe_id` ne porte que la première. Filtrer dessus laissait au coach
       suspendu les contenus où la classe transférée n'arrivait pas en tête.
       Effet de bord assumé : un contenu partagé avec une classe NON transférée
       suit quand même le nouveau titulaire — il n'existe qu'une colonne
       `coach_id`, donc un contenu n'a qu'un propriétaire ; mieux vaut qu'il
       reste modifiable par quelqu'un que par personne. */
    const { error: eContenus } = await supabase.from("contenus_classes_elearning")
      .update({ coach_id: nouveau_coach_id }).contains("classe_ids", [req.params.id]);
    if (eContenus) console.error("[suspendre-coach] transfert médiathèque:", eContenus.message);

    const { error: eFichiers } = await supabase.from("fichiers_classes_elearning")
      .update({ coach_id: nouveau_coach_id }).eq("classe_id", req.params.id);
    if (eFichiers) console.error("[suspendre-coach] transfert fichiers:", eFichiers.message);

    // Comptabilité jamais réécrite rétroactivement pour les séances déjà réalisées (historique
    // et honoraires déjà calculés restent à l'ancien titulaire). MAIS les séances futures déjà
    // PLANIFIÉES au nom de l'ancien coach ne se réassignent jamais "naturellement" - elles
    // existent déjà en base avec son coach_id, et restent invisibles pour le nouveau titulaire
    // (planning) tant qu'on ne les réattribue pas explicitement ici.
    const STATUTS_TERMINAUX = ["realisee", "annulee", "reportee"];
    const { error: eSeancesFutures } = await supabase
      .from("seances_elearning")
      .update({ coach_id: nouveau_coach_id })
      .eq("classe_id", req.params.id)
      .eq("coach_id", ancienCoachId)
      .not("statut", "in", `(${STATUTS_TERMINAUX.join(",")})`);
    if (eSeancesFutures) console.error("[suspendre-coach] transfert séances futures:", eSeancesFutures.message);

    const dateLabel = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

    if (ancienCoachId) {
      await notifyUser(ancienCoachId, {
        type: "coach_suspendu", titre: "🔴 Fin de votre affectation sur une classe",
        message: `Vous n'êtes plus titulaire de la classe "${avant.nom}" à compter du ${dateLabel}. Motif : ${motif.trim()}.`,
        meta: { classe_id: avant.id },
      }).catch(() => {});
    }
    await notifyUser(nouveau_coach_id, {
      type: "coach_assigne", titre: `🏫 Vous êtes désormais titulaire - ${data.nom}`,
      message: `Vous remplacez définitivement ${ancienCoachNom || "le coach précédent"} sur la classe "${data.nom}"${data.niveau ? ` (${data.niveau})` : ""}. Vous héritez de tout l'historique pédagogique.`,
      meta: { classe_id: data.id },
    }).catch(() => {});
    await notifyRole(["super_admin"], {
      type: "coach_assigne", titre: `🏫 Coach remplacé - ${data.nom}`,
      message: `${nouveau_coach_nom} remplace ${ancienCoachNom || "le coach précédent"} sur la classe "${data.nom}"${data.niveau ? ` (${data.niveau})` : ""}. Motif : ${motif.trim()}.`,
      meta: { classe_id: data.id },
    }, nouveau_coach_id).catch(() => {});

    notifierApprenants(req.params.id, {
      type: "coach_change", titre: "🔁 Nouveau coach pour votre classe",
      message: `${nouveau_coach_nom} est désormais votre coach sur "${data.nom}".`,
      meta: { classe_id: data.id },
    }).catch(() => {});

    notifierParentsMineurs(req.params.id, {
      type: "coach_change", titre: "🔁 Nouveau coach pour votre enfant",
      message: `${nouveau_coach_nom} est désormais le coach de votre enfant sur "${data.nom}".`,
      meta: { classe_id: data.id },
    }).catch(() => {});

    notifyEntreprise(avant.entreprise_id, {
      type: "coach_change", titre: "🏢 Changement définitif de coach",
      message: `Votre groupe "${data.nom}" est désormais assuré par ${nouveau_coach_nom}.`,
      meta: { classe_id: data.id },
    }).catch(() => {});

    // Admin BET + PA Advisor - tenus informés de toute suspension définitive, au même titre
    // que pour un remplacement temporaire (décision lourde, doit rester visible pour la ligne
    // de gestion pédagogique même si ce n'est pas eux qui l'ont déclenchée).
    await notifyRole(ROLES_ADMIN_BET_PA, {
      type: "coach_suspendu_definitif", titre: "🔴 Suspension définitive de coach",
      message: `${ancienCoachNom || "Le coach précédent"} a été suspendu définitivement de "${data.nom}", remplacé par ${nouveau_coach_nom}. Motif : ${motif.trim()}.`,
      meta: { classe_id: data.id },
    }).catch(() => {});

    logAudit({
      ...acteurAudit(req),
      action_type: "COACH_SUSPENDU_DEFINITIF",
      module:      "classes",
      entite_type: "classes_elearning",
      entite_id:   data.id,
      detail:      `${ancienCoachNom || "Coach précédent"} suspendu définitivement de "${data.nom}", remplacé par ${nouveau_coach_nom} - motif : ${motif.trim()}`,
      statut:      "warning",
    }).catch(() => {});

    res.json({ classe: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/classes-elearning/:id ───────────────────────────────────────
router.delete("/:id", authenticateAdmin, requirePermission("classes","delete"), async (req, res) => {
  try {
    const { data: avant } = await supabase.from("classes_elearning").select("nom").eq("id", req.params.id).maybeSingle();
    const { error } = await supabase
      .from("classes_elearning")
      .update({ statut: "archive" })
      .eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });

    logAudit({
      ...acteurAudit(req),
      action_type: "CLASSE_ARCHIVEE",
      module:      "classes",
      entite_type: "classes_elearning",
      entite_id:   req.params.id,
      detail:      `Archivage de la classe "${avant?.nom || req.params.id}"`,
      statut:      "warning",
    }).catch(() => {});

    res.json({ message: "Classe archivée" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/classes-elearning/:id/apprenants ──────────────────────────────
// Inscrire un apprenant dans une classe
router.post("/:id/apprenants", authenticateAdmin, requirePermission("classes","update"), async (req, res) => {
  try {
    const { apprenant_id, nom_complet, email, telephone, niveau_cecr } = req.body;
    if (!nom_complet) return res.status(400).json({ error: "nom_complet requis" });

    const quota = await verifierQuotaClasse(req.params.id);
    if (quota.bloque) return res.status(409).json({ error: quota.message });

    const { data, error } = await supabase
      .from("classes_elearning_apprenants")
      .insert({
        classe_id:    req.params.id,
        apprenant_id: apprenant_id || null,
        nom_complet,
        email:        email      || null,
        telephone:    telephone  || null,
        niveau_cecr:  niveau_cecr|| null,
        statut:       "actif",
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ inscription: data });

    /* ── CETTE INSCRIPTION NE PRÉVENAIT PERSONNE ──
       L'autre chemin d'entrée en classe — l'assignation d'un dossier depuis le parcours
       d'onboarding — notifie le PA, l'assistante et l'entreprise. Celui-ci, l'ajout
       direct d'un apprenant à une classe, n'écrivait aucune notification : un effectif
       changeait sans que la supervision ni le coach ne l'apprennent.

       Après la réponse, et non avant : l'inscription est faite, elle ne doit pas échouer
       ni attendre parce qu'une notification se passe mal. */
    (async () => {
      const { data: classe } = await supabase
        .from("classes_elearning")
        .select("id, nom, niveau, coach_id, entreprise_id, entreprise_nom, capacite_max")
        .eq("id", req.params.id).maybeSingle();
      if (!classe) return;

      const { count: effectif } = await supabase
        .from("classes_elearning_apprenants")
        .select("id", { count: "exact", head: true })
        .eq("classe_id", classe.id).eq("statut", "actif");
      const places = classe.capacite_max ? ` (${effectif ?? "?"}/${classe.capacite_max})` : "";

      await notifyRole(ROLES_SUPERVISION, {
        type:    "info",
        titre:   `🎓 Nouvel apprenant - ${classe.nom}`,
        message: `${nom_complet} a été inscrit(e) dans la classe "${classe.nom}"`
               + `${classe.niveau ? ` (${classe.niveau})` : ""}${classe.entreprise_nom ? ` - ${classe.entreprise_nom}` : ""}${places}.`,
        meta:    { classe_id: classe.id, classe_nom: classe.nom, inscription_id: data.id },
      }).catch(err => console.error("[classes-elearning] notifyRole supervision apprenant", err.message));

      /* Le coach aussi : c'est lui qui accueillera cette personne à la prochaine séance,
         et il l'apprenait jusqu'ici en la voyant arriver. */
      if (classe.coach_id) {
        await notifyUser(classe.coach_id, {
          type:    "apprenant_assigne",
          titre:   `🎓 Nouvel apprenant dans ${classe.nom}`,
          message: `${nom_complet} vient de rejoindre votre classe "${classe.nom}"${places}.`
                 + `${niveau_cecr ? ` Niveau ${niveau_cecr}.` : ""}`,
          meta:    { classe_id: classe.id, classe_nom: classe.nom, inscription_id: data.id },
        }).catch(err => console.error("[classes-elearning] notifyUser coach apprenant", err.message));
      }
    })().catch(err => console.error("[classes-elearning] notifs inscription", err.message));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/classes-elearning/apprenants/:inscriptionId ─────────────────
// Mettre à jour date_naissance + coordonnées parent sur un apprenant
router.patch("/apprenants/:inscriptionId", authenticateAdmin, requirePermission("classes","update"), async (req, res) => {
  try {
    /* Les champs de l'APPRENANT LUI-MÊME ont été ajoutés : `nom_complet`, `telephone`,
       `objectif_client`. La liste ne portait que l'état civil des mineurs et les
       coordonnées du parent - sur un adulte en entreprise, le cas courant, le formulaire
       d'édition n'offrait donc aucun champ pertinent.

       `email` reste HORS de cette liste, délibérément : c'est l'identifiant de connexion
       de l'apprenant, et le changer ici ne changerait pas son compte Supabase Auth - il se
       retrouverait avec une adresse affichée qui n'ouvre plus sa session. Cela relève d'un
       geste dédié (« Modifier l'identifiant »), pas d'un champ de formulaire. */
    const allowed = [
      "date_naissance", "profil_type",
      "prenom_parent", "nom_parent", "email_parent", "telephone_parent", "classe",
      "niveau_cecr", "statut", "notes_internes",
      "nom_complet", "telephone", "objectif_client",
    ];
    const payload = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) payload[k] = req.body[k] || null; });
    // Le matching parent ↔ enfant côté dashboard parent se fait sur cet email exact
    if (payload.email_parent) payload.email_parent = payload.email_parent.toLowerCase().trim();

    if (Object.keys(payload).length === 0)
      return res.status(400).json({ error: "Aucun champ à mettre à jour" });

    // Réactivation (statut → actif) : elle augmente l'effectif actif au même titre qu'un ajout,
    // donc soumise au même double quota (classe + entreprise) - sauf si déjà actif.
    if (payload.statut === "actif") {
      const { data: inscriptionActuelle, error: errActuelle } = await supabase
        .from("classes_elearning_apprenants")
        .select("classe_id, statut")
        .eq("id", req.params.inscriptionId)
        .single();
      if (errActuelle) return res.status(500).json({ error: errActuelle.message });

      if (inscriptionActuelle && inscriptionActuelle.statut !== "actif") {
        const quota = await verifierQuotaClasse(inscriptionActuelle.classe_id);
        if (quota.bloque) return res.status(409).json({ error: quota.message });
      }
    }

    const { data, error } = await supabase
      .from("classes_elearning_apprenants")
      .update(payload)
      .eq("id", req.params.inscriptionId)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ apprenant: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/classes-elearning/:id/apprenants ───────────────────────────────
// ?presence=true → exclut les apprenants suspendus (feuille de présence)
router.get("/:id/apprenants", authenticateAdmin, async (req, res) => {
  try {
    let q = supabase
      .from("classes_elearning_apprenants")
      .select("*")
      .eq("classe_id", req.params.id)
      .order("created_at", { ascending: false });

    if (req.query.presence === "true") {
      q = q.neq("statut", "suspendu");
    }

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    // Photo de profil - pas de colonne avatar_url ici, elle vit sur utilisateurs (compte réel
    // une fois créé). Jointure manuelle par apprenant_id, best-effort (pas d'échec bloquant).
    const ids = [...new Set((data || []).map(a => a.apprenant_id).filter(Boolean))];
    let avatars = {};
    if (ids.length) {
      const { data: comptes } = await supabase.from("utilisateurs").select("id, avatar_url").in("id", ids);
      (comptes || []).forEach(c => { if (c.avatar_url) avatars[c.id] = c.avatar_url; });
    }
    const apprenants = (data || []).map(a => ({ ...a, avatar_url: a.apprenant_id ? avatars[a.apprenant_id] || null : null }));

    res.json({ apprenants });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
