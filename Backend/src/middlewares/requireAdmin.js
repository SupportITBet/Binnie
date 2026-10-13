import supabase from "../config/supabase.js";
import { utilisateurDuJeton } from "../services/cacheAuth.js";
import { sessionPerimee, marquerActiviteServeur, MESSAGE_SESSION_EXPIREE } from "../services/sessionInactive.js";

/* ══════════════════════════════════════════════════════════════
   MIDDLEWARES DE CONTRÔLE DES ACCÈS ADMIN
   Principe : le rôle est lu depuis app_metadata (côté serveur,
   non modifiable par l'utilisateur) ET vérifié en base.
══════════════════════════════════════════════════════════════ */

// ── 1. Extraire et valider le token JWT ──────────────────────
export const authenticateAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token manquant ou invalide" });
  }

  const token = authHeader.split(" ")[1];
  const user = await utilisateurDuJeton(token);
  const error = user ? null : new Error("jeton invalide");

  if (error || !user) {
    return res.status(401).json({ error: "Token invalide ou expiré" });
  }

  const ROLES_ADMIN_VALIDES = [
    // Rôles plateforme BET (table utilisateurs)
    "super_admin", "admin", "manager", "responsable",
    "commercial", "gestionnaire", "coach", "data_collector", "placement_test",
    "superviseur", "deputy_superviseur", "pedagogical_advisor", "onboarding",
    "rh", "rh_paie", "comptable", "customer_care", "assistant_sav", "admin_elearning", "assistant_elearning",
    "marketing",
    // Rôles e-learning BET (bet-elearning)
    "admin_manager", "admin_superviseur", "admin_deputy_superviseur", "admin_placement", "admin_onboarding",
    "admin_elearning", "admin_customer_care", "admin_pa_advisor",
    "admin_rh_paie", "admin_comptable", "admin_commercial",
    // Rôles enseignants e-learning
    "professeur_titulaire", "professeur_remplacant",
    // Rôles entreprise bet-elearning
    "client_entreprise",
    // Anciens rôles (table profils_admin)
    "admin_pedagogique", "admin_financier", "admin_rh",
    "responsable_centre", "observateur",
  ];

  const role = user.app_metadata?.role;
  if (!role || !ROLES_ADMIN_VALIDES.includes(role)) {
    console.warn("[authenticateAdmin] 403 rôle invalide:", role, "user:", user.id);
    return res.status(403).json({
      error: "Accès refusé - ce compte n'est pas un compte administrateur"
    });
  }

  // Chercher le profil dans `utilisateurs` d'abord, puis `profils_admin`
  let profil = null;
  let roleEffectif = role;

  /* L'ERREUR DE LECTURE EST RÉCUPÉRÉE. L'auto-réparation plus bas part de `!profil` et
     réécrit le profil : tant que l'erreur était jetée, un timeout ou une coupure réseau
     rendait `data: null` exactement comme une ligne absente, et ce middleware - qui
     s'exécute à CHAQUE requête authentifiée, pas seulement au login - réécrivait par-dessus
     un profil bien vivant. `.maybeSingle()` distingue enfin « pas de ligne » (data null,
     pas d'erreur) de « la lecture a échoué » (erreur), deux cas que `.single()` confondait. */
  const { data: u, error: errU } = await supabase
    .from("utilisateurs")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (errU) {
    console.error(`[authenticateAdmin] lecture du profil ${user.email} échouée:`, errU.message);
    return res.status(503).json({ error: "Service momentanément indisponible - réessayez dans un instant." });
  }

  if (u) {
    profil = u;
    roleEffectif = u.role;
  } else {
    const { data: pa, error: errPa } = await supabase
      .from("profils_admin")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (errPa) {
      console.error(`[authenticateAdmin] lecture profils_admin ${user.email} échouée:`, errPa.message);
      return res.status(503).json({ error: "Service momentanément indisponible - réessayez dans un instant." });
    }
    if (pa) {
      profil = pa;
      roleEffectif = pa.profil_type;
    }
  }

  // ── Auto-réparation : profil absent mais rôle valide dans app_metadata
  if (!profil) {
    const DEPT_PAR_ROLE = {
      super_admin:"Direction Générale", admin:"Administration",
      manager:"Management", superviseur:"Supervision", deputy_superviseur:"Supervision Déléguée",
      responsable:"Responsable de Centre", pedagogical_advisor:"Conseil Pédagogique",
      commercial:"Commercial / Assistante", onboarding:"Onboarding & Classes",
      gestionnaire:"Gestion Administrative", rh:"Ressources Humaines / Paie",
      comptable:"Comptabilité / Trésorerie", coach:"Pédagogie",
      customer_care:"Customer Care", data_collector:"Collecte de Données",
      marketing:"Marketing / Trafic",
      admin_elearning:"Assistant E-Learning", assistant_elearning:"Assistant E-Learning",
      admin_manager:"Management BET", admin_superviseur:"Supervision BET",
      admin_deputy_superviseur:"Supervision Déléguée BET",
      admin_placement:"Tests de niveau & Placement", admin_onboarding:"Onboarding & Classes",
      admin_customer_care:"Customer Care", admin_pa_advisor:"PA Advisor",
      admin_rh_paie:"RH / Paie",
      admin_comptable:"Comptabilité", admin_commercial:"Commercial Entreprises",
      professeur_titulaire:"Pédagogie", professeur_remplacant:"Pédagogie",
    };
    const nomMeta    = user.user_metadata?.nom    || user.email.split("@")[0];
    const prenomMeta = user.user_metadata?.prenom || "Admin";
    /* INSERT ET NON UPSERT - même correction qu'au login (adminRoutes.js). L'upsert
       `onConflict: "id"` écrasait la ligne quand elle existait, alors que toute cette
       branche repose sur la prémisse inverse. Prémisse fausse = perte silencieuse :
       le `scope` revenait à ["national"], effaçant le centre de la personne, et le
       département comme `mdp_temporaire` étaient réinitialisés. Constaté deux fois en
       production sur un compte commercial, sans aucune intervention humaine.
       Avec `insert`, une ligne existante fait échouer l'opération (23505) plutôt que de
       la remplacer : un refus visible vaut mieux qu'une donnée perdue en silence. */
    const { data: created, error: errCreated } = await supabase
      .from("utilisateurs")
      .insert({
        id: user.id, email: user.email,
        nom: nomMeta, prenom: prenomMeta,
        role, scope: ["national"],
        departement: DEPT_PAR_ROLE[role] || null,
        actif: true, mdp_temporaire: false,
      })
      .select()
      .single();
    if (errCreated || !created) {
      if (errCreated?.code === "23505") {
        console.error(`[MIDDLEWARE AUTO-REPAIR] ABANDON pour ${user.email} : le profil existe déjà alors que la lecture l'a rendu absent. Aucune donnée écrasée.`);
        return res.status(503).json({ error: "Service momentanément indisponible - réessayez dans un instant." });
      }
      console.error(`[MIDDLEWARE AUTO-REPAIR] échec pour ${user.email}:`, errCreated?.message);
      return res.status(403).json({ error: "Profil introuvable - contactez le Super Admin" });
    }
    profil = created;
    roleEffectif = created.role;
    console.log(`[MIDDLEWARE AUTO-REPAIR] Profil recréé pour ${user.email} (rôle: ${role})`);
  }

  if (!profil.actif) {
    console.warn("[authenticateAdmin] 403 compte désactivé:", user.id, "actif:", profil.actif);
    return res.status(403).json({ error: "Compte désactivé - contactez le Super Admin" });
  }

  /* LA SESSION EST-ELLE ENCORE VIVANTE ? Le tableau de bord ferme déjà une session
     inactive, mais un jeton copié depuis le stockage d'un navigateur resterait accepté
     ici jusqu'à son expiration. On refuse donc AVANT de servir la requête, avec un code
     que l'écran sait reconnaître pour renvoyer vers la connexion plutôt que d'afficher
     une erreur incompréhensible. */
  if (sessionPerimee({ ...profil, role: roleEffectif }, token)) {
    return res.status(401).json({ error: MESSAGE_SESSION_EXPIREE, session_expiree: true });
  }
  // Après le contrôle, jamais avant : marquer d'abord rendrait toute session éternelle.
  marquerActiviteServeur({ ...profil, role: roleEffectif });

  const permissions = await resolvePermissions(roleEffectif, user.id);

  req.user   = user;
  req.profil = { ...profil, role: roleEffectif, permissions };
  req.role   = roleEffectif;
  next();
};

// ── Résout les permissions effectives d'un utilisateur : permissions_roles
// (gabarit du rôle) puis permission_exceptions par-dessus (une ligne
// d'exception pour un module remplace intégralement les 5 droits du rôle
// pour ce module - voir docs/gestion-droits-permissions-schema.html §4).
// Résolu à chaque requête (pas embarqué dans le JWT) pour que toute
// modification de rôle ou d'exception prenne effet immédiatement.
export async function resolvePermissions(role, userId) {
  const [{ data: roleRows }, { data: exceptionRows }] = await Promise.all([
    supabase.from("permissions_roles").select("module,peut_lire,peut_creer,peut_modifier,peut_supprimer,peut_gerer").eq("role", role),
    supabase.from("permission_exceptions").select("module,peut_lire,peut_creer,peut_modifier,peut_supprimer,peut_gerer").eq("utilisateur_id", userId),
  ]);

  const permissions = {};
  for (const row of (roleRows || [])) {
    permissions[row.module] = {
      read: row.peut_lire, create: row.peut_creer, update: row.peut_modifier,
      delete: row.peut_supprimer, manage: row.peut_gerer,
    };
  }
  for (const row of (exceptionRows || [])) {
    permissions[row.module] = {
      read: row.peut_lire, create: row.peut_creer, update: row.peut_modifier,
      delete: row.peut_supprimer, manage: row.peut_gerer,
    };
  }
  return permissions;
}


// ── 1b. Authentifier tout utilisateur (admin OU apprenant) ──
// Utilisé pour les routes partagées comme la messagerie interne
export const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token manquant ou invalide" });
  }

  const token = authHeader.split(" ")[1];
  const user = await utilisateurDuJeton(token);
  const error = user ? null : new Error("jeton invalide");
  if (error || !user) return res.status(401).json({ error: "Token invalide ou expiré" });

  const role = user.app_metadata?.role || "apprenant";

  // Chercher le profil dans utilisateurs, puis profils_admin (anciens comptes admin,
  // ex: super_admin) - sans ce repli, un compte qui n'existe que dans profils_admin
  // recevait "Profil introuvable" ici alors qu'authenticateAdmin l'authentifie très bien.
  let { data: u } = await supabase
    .from("utilisateurs")
    .select("id, nom, prenom, email, role, actif, entreprise_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!u) {
    const { data: pa } = await supabase
      .from("profils_admin")
      .select("id, nom, prenom, email, profil_type, actif")
      .eq("id", user.id)
      .maybeSingle();
    if (pa) u = { ...pa, role: pa.profil_type };
  }

  if (!u) return res.status(403).json({ error: "Profil introuvable" });
  if (!u.actif) return res.status(403).json({ error: "Compte désactivé" });

  req.user   = user;
  req.profil = u;
  req.role   = u.role || role;
  next();
};


// ── 1c. Authentifier un apprenant (token Supabase valide suffit) ──
// Utilisé pour les routes accessibles aux apprenants (ex: rendre un devoir)
export const authenticateApprenant = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token manquant ou invalide" });
  }
  const token = authHeader.split(" ")[1];
  const user = await utilisateurDuJeton(token);
  const error = user ? null : new Error("jeton invalide");
  if (error || !user) return res.status(401).json({ error: "Token invalide ou expiré" });
  req.user = user;
  next();
};


// ── 2. Vérifier que c'est UNIQUEMENT le super_admin ─────────
export const requireSuperAdmin = (req, res, next) => {
  if (req.role !== "super_admin") {
    return res.status(403).json({
      error: "Action réservée au Super Admin uniquement"
    });
  }
  next();
};


// ── Libellés humains pour les messages de permission refusée - ne jamais exposer
//    les clés techniques ('create', 'inscriptions'…) directement à l'utilisateur.
export const LIBELLES_ACTIONS_PERMISSION = {
  read:   "consulter",
  create: "créer",
  update: "modifier",
  delete: "supprimer",
  manage: "gérer",
};
export const LIBELLES_MODULES_PERMISSION = {
  dashboard:     "Tableau de bord",
  utilisateurs:  "Utilisateurs",
  roles:         "Rôles & permissions",
  remplacements: "Remplacements",
  classes:       "Classes & groupes",
  honoraires:    "Honoraires & paiements",
  cours:         "Cours & contenus",
  contenus_ressources: "Contenus - Ressources pédagogiques",
  contenus_biblio:     "Contenus - Bibliothèque communautaire",
  contenus_minijeux:   "Contenus - Mini-jeux",
  devoirs_evaluations: "Devoirs, exercices & évaluations",
  missions:      "Missions d'observation",
  eligibilite:   "Éligibilité paiement",
  examens:       "Examens",
  inscriptions:  "Inscriptions",
  planning:      "Planning",
  finances:      "Finances", // ancien module - plus utilisé par aucune route, scindé (voir ci-dessous)
  finances_facturation:    "Finances - Facturation",
  finances_paiements:      "Finances - Paiements",
  finances_tresorerie:     "Finances - Trésorerie",
  finances_fournisseurs:   "Finances - Fournisseurs & Achats",
  finances_generale:       "Finances - Comptabilité générale",
  finances_tva:            "Finances - TVA",
  finances_immobilisations:"Finances - Immobilisations",
  finances_budgets:        "Finances - Budgets",
  finances_analytique:     "Finances - Analytique",
  // Comptabilité dash - module distinct de finances_* (bet-elearning), tables et permissions
  // séparées pour respecter le cloisonnement des deux plateformes.
  dash_finances_facturation:    "Comptabilité dash - Facturation",
  dash_finances_paiements:      "Comptabilité dash - Paiements",
  dash_finances_tresorerie:     "Comptabilité dash - Trésorerie",
  dash_finances_fournisseurs:   "Comptabilité dash - Fournisseurs & Achats",
  dash_finances_generale:       "Comptabilité dash - Comptabilité générale",
  dash_finances_tva:            "Comptabilité dash - TVA",
  dash_finances_immobilisations:"Comptabilité dash - Immobilisations",
  dash_finances_budgets:        "Comptabilité dash - Budgets",
  dash_finances_analytique:     "Comptabilité dash - Analytique",
  crm:           "CRM / Commercial", // ancien module - plus utilisé par aucune route, scindé (voir ci-dessous)
  crm_entreprises:    "CRM - Entreprises", // couvre aussi demandes/soumissions et documents entreprise (fusionné 22/07/2026)
  contrat:            "Contrats entreprise",
  crm_beneficiaires:  "CRM - Bénéficiaires",
  crm_comptes_acces:  "CRM - Comptes & accès entreprise",
  rapports:      "Rapports",
  rh:            "RH",
  support:       "Support",
  mediatheque:   "Médiathèque",
  fichiers_partages: "Fichiers partagés",
  // ── Modules ajoutés par l'audit du 29/09/2026 ────────────────────────────
  transferts:          "Transferts d'apprenants",
  observations:        "Observation des coachs",
  evaluations_qualite: "Évaluations qualité",
  presences:           "Présences",
  leads:               "Collecte de données",
  suivi_demarrage:     "Suivi de démarrage",
  audit:         "Audit logs",
  configuration: "Configuration",
};
export function messagePermissionRefusee(module, action) {
  const actionLib = LIBELLES_ACTIONS_PERMISSION[action] || action;
  const moduleLib = LIBELLES_MODULES_PERMISSION[module] || module;
  return `Vous n'avez pas la permission de ${actionLib} sur le module "${moduleLib}". Contactez votre administrateur si vous pensez qu'il s'agit d'une erreur.`;
}

// ── Sous-modules qui héritent du module parent tant qu'aucune ligne
//    spécifique n'existe dans permissions_roles/permission_exceptions -
//    permet de scinder finement un module (ex: "cours" → onglets
//    Ressources / Bibliothèque / Mini-jeux) sans casser les rôles déjà
//    configurés sur le module parent avant la scission.
const MODULE_FALLBACK_PARENT = {
  contenus_ressources: "cours",
  contenus_biblio:     "cours",
  contenus_minijeux:   "cours",
  // "devoirs_evaluations" vient d'être extrait de "cours" (création/modification/
  // suppression de devoirs) et de "examens" (saisie manuelle de note) - retombe
  // sur les droits "cours" déjà accordés au coach tant qu'aucune ligne dédiée
  // n'existe, pour ne pas casser l'accès des coachs déjà configurés.
  devoirs_evaluations: "cours",
  // "missions" vient d'être extrait de "remplacements" (les missions
  // d'observation du Superviseur/Deputy n'ont rien à voir avec les
  // remplacements de coachs) - retombe sur les droits "remplacements"
  // déjà accordés tant qu'aucune ligne dédiée n'existe pour ce rôle.
  missions: "remplacements",
  // "eligibilite" vient d'être extrait de "rapports" (soumettre la liste
  // d'éligibilité au paiement au PA Advisor est un workflow distinct) -
  // retombe sur les droits "rapports" déjà accordés tant qu'aucune ligne
  // dédiée n'existe pour ce rôle.
  eligibilite: "rapports",
  // "fichiers_partages" vient d'être extrait de "mediatheque" (les fichiers
  // partagés avec une classe sont un usage distinct de la médiathèque
  // générale) - retombe sur les droits "mediatheque" déjà accordés tant
  // qu'aucune ligne dédiée n'existe pour ce rôle.
  fichiers_partages: "mediatheque",
  // "crm" scindé en modules (Entreprises / Bénéficiaires / Comptes & accès) - un seul
  // interrupteur mélangeait des actions très différentes (créer une entreprise, valider
  // une demande, réinitialiser un mot de passe...). Chacun retombe sur les droits "crm"
  // déjà accordés tant qu'aucune ligne dédiée n'existe pour ce rôle, pour ne pas casser
  // l'accès existant. "crm_demandes" et "crm_documents" fusionnés dans "crm_entreprises"
  // (22/07/2026) : créer/soumettre/valider une entreprise et gérer ses documents passent
  // maintenant par le même module.
  crm_entreprises:    "crm",
  crm_beneficiaires:  "crm",
  crm_comptes_acces:  "crm",
  // "finances" scindé en sous-modules (Facturation / Paiements / Trésorerie / Fournisseurs /
  // Comptabilité générale / TVA / Immobilisations / Budgets / Analytique) - un seul droit
  // mélangeait des périmètres très différents (ex: donner accès à la TVA seule sans donner
  // la main sur la facturation était impossible). Chacun retombe sur les droits "finances"
  // déjà accordés tant qu'aucune ligne dédiée n'existe pour ce rôle.
  finances_facturation:    "finances",
  finances_paiements:      "finances",
  finances_tresorerie:     "finances",
  finances_fournisseurs:   "finances",
  finances_generale:       "finances",
  finances_tva:            "finances",
  finances_immobilisations:"finances",
  finances_budgets:        "finances",
  finances_analytique:     "finances",

  // ── Comptabilité du tableau de bord ───────────────────────────────────────
  // Ces neuf modules protègent 75 routes de dashComptabilite.js et n'étaient
  // rattachés à rien : absents du catalogue de Gestion des droits comme d'ici.
  // Personne ne pouvait donc les recevoir, et une comptable à qui l'on cochait
  // tout restait refusée sur l'essentiel de son propre écran.
  dash_finances_facturation:    "finances",
  dash_finances_paiements:      "finances",
  dash_finances_tresorerie:     "finances",
  dash_finances_fournisseurs:   "finances",
  dash_finances_generale:       "finances",
  dash_finances_tva:            "finances",
  dash_finances_immobilisations:"finances",
  dash_finances_budgets:        "finances",
  dash_finances_analytique:     "finances",

  // `mediatheque`, `crm` et `cours` servaient de parents à d'autres modules
  // sans exister eux-mêmes dans le catalogue : la chaîne s'arrêtait dans le
  // vide. Ils pointent désormais vers un module réellement accordable, et la
  // résolution ci-dessous suit la chaîne jusqu'au bout.
  mediatheque:         "contenus_ressources",
  crm:                 "crm_entreprises",
  cours:               "contenus_ressources",

  // ── Modules ajoutés par l'audit du 29/09/2026 ─────────────────────────────
  // Chacun retombe sur un module que les rôles concernés possèdent déjà : mettre
  // ces écrans sous permission ne bloque donc personne du jour au lendemain. Un
  // administrateur peut ensuite accorder le module fin lui-même, ce qui prend
  // alors le pas sur le repli.
  transferts:          "classes",
  observations:        "rapports",
  evaluations_qualite: "rapports",
  presences:           "classes",
  leads:               "inscriptions",
  suivi_demarrage:     "inscriptions",
};

// ── 3. Vérifier qu'il a accès à un module + une action ──────
//    Usage : requirePermission("cours", "create")
export const requirePermission = (module, action) => {
  return (req, res, next) => {
    // Le super_admin a toujours accès à tout
    if (req.role === "super_admin") return next();

    const allPerms = req.profil?.permissions || {};
    let perms = allPerms[module];

    /* LE REPLI SUIT LA CHAÎNE, et ne s'arrête plus au premier parent.
       `fichiers_partages` retombait sur `mediatheque`, lui-même accordable
       nulle part : la recherche s'achevait dans le vide et la route restait
       fermée à tout le monde. En remontant tant qu'un parent existe, une
       scission en deux temps continue de fonctionner pour les rôles configurés
       sur l'ancêtre.

       La table contient des paires à double sens voulues - `cours` et
       `contenus_ressources`, `crm` et `crm_entreprises` - parce que l'ancien nom
       et le nouveau sont tous deux accordés en base selon l'ancienneté du rôle :
       chacun doit pouvoir répondre pour l'autre. D'où le suivi des modules déjà
       visités plutôt qu'un compteur : la remontée s'arrête exactement quand elle
       n'a plus rien de neuf à examiner, sans tourner à vide et sans risquer la
       boucle infinie qu'un cycle provoquerait. */
    const vus = new Set([module]);
    let parent = MODULE_FALLBACK_PARENT[module];
    while (!perms && parent && !vus.has(parent)) {
      vus.add(parent);
      perms = allPerms[parent];
      parent = MODULE_FALLBACK_PARENT[parent];
    }
    if (!perms || !perms[action]) {
      return res.status(403).json({
        error: messagePermissionRefusee(module, action)
      });
    }
    next();
  };
};


// ── 4. Vérifier que le profil couvre le périmètre demandé ───
//    Usage : requireScope("angre")
export const requireScope = (centreId) => {
  return (req, res, next) => {
    if (req.role === "super_admin") return next();

    const scope = req.profil?.scope || [];
    if (scope.includes("national") || scope.includes(centreId)) {
      return next();
    }
    return res.status(403).json({
      error: `Accès refusé - votre profil ne couvre pas le centre '${centreId}'`
    });
  };
};
