// Modules qui n'appartiennent qu'à une seule des deux apps admin (dash vs bet-elearning) -
// permet à /api/audit/logs (et /by-profile, /by-centre) de filtrer par plateforme et
// d'éviter qu'une app affiche le journal d'audit de l'autre. Les modules absents d'ici
// sont réellement partagés (ex: entreprise, apprenants, upload, coachs, centres, roles,
// auth…) et restent visibles des deux côtés (plateforme NULL).
// Utilisée à la fois par autoAudit.js (logs auto-générés) et logAudit.js (logs manuels,
// qui n'ont pas à répéter cette table dans chaque appel - voir ce fichier pour le détail
// des modules volontairement laissés partagés, notamment "contenus").
export const PLATEFORME_PAR_MODULE = {
  boutique: "dash", paiements: "dash", level_test: "dash", level_tests: "dash",
  devis: "dash", contact: "dash", leads: "dash", newsletter: "dash", sondage: "dash",
  messages: "dash", blog: "dash", temoignages: "dash", equipe_photos: "dash",
  partenaires: "dash", parcours: "dash", corporate: "dash", marquee: "dash",
  codes_promo: "dash", avis: "dash", groupes: "dash", contrats_prives: "dash",
  plaintes: "dash", config_contact: "dash", faq: "dash", carousel: "dash",
  offre_media: "dash", cinetpay: "dash", touchpoint: "dash", seances_privees: "dash",
  fichiers_prives: "dash", cours_elearning: "dash", mon_espace: "dash",
  remplacements: "dash", seances: "dash", presences: "dash", presences_privees: "dash",
  // /api/inscriptions (dash - transformation lead → apprenant) et /api/simulateur (soumis
  // par le site public, consommé uniquement par CommercialDashboard côté dash) n'étaient
  // pas tagués : leurs entrées remontaient (plateforme NULL) dans l'audit des deux apps.
  inscriptions: "dash", simulateur: "dash",
  tickets: "bet-elearning", placement: "bet-elearning", gamification: "bet-elearning",
  bet_elearning: "bet-elearning", classes: "bet-elearning", onboarding: "bet-elearning",
  // /api/elearning n'est appelé que depuis bet-elearning/ (jamais depuis dash/) - vérifié
  // par grep sur les deux frontends. Sans ce tag, ces actions (contenus coach : exercices,
  // devoirs…) remontaient aussi dans le journal d'audit de dash, qui n'a rien à voir avec
  // la gestion de contenus e-learning par un coach.
  elearning: "bet-elearning",
  // Module Comptabilité (Facturation/Trésorerie/TVA/Immobilisations) - exclusif au rôle
  // admin_comptable de bet-elearning, aucune route équivalente côté dash.
  comptabilite: "bet-elearning", comptabilite_generale: "bet-elearning",
  comptabilite_tva: "bet-elearning", comptabilite_immobilisations: "bet-elearning",
  // "roles" (gestion des permissions), "auth" (connexion staff), "apprenants", "coachs",
  // "crm_entreprises", "finances" (entreprise.js) et "contenus" restent volontairement
  // absents d'ici : ce sont soit de vrais modules partagés (un compte staff des deux
  // plateformes s'authentifie via la même route, un rôle bet-elearning peut recevoir une
  // permission depuis la même Matrice), soit - pour "contenus" - un nom de module identique
  // réutilisé par deux fichiers de routes différents (contenusOnboardingDash.js pour dash,
  // contenusOnboarding.js pour bet-elearning) : ceux-là renseignent leur "plateforme"
  // explicitement dans chaque appel logAudit() plutôt que de compter sur cette table.
  // Pour CES modules "partagés", c'est le rôle de l'acteur (PLATEFORME_PAR_ROLE ci-dessous)
  // qui tranche - un module partagé n'implique pas qu'une action précise l'est aussi : un
  // "onboarding" (rôle 100% dash) qui crée un accès apprenant, c'est une action dash, même
  // si d'autres rôles bet-elearning utilisent la même route "apprenants" par ailleurs.
};

// Rôle de l'acteur → plateforme - SIGNAL DE SECOURS UNIQUEMENT (voir resolvePlateforme
// ci-dessous, l'origine de la requête prime). Audit complet du routing réel (dash/src/App.js,
// bet-elearning/src/contexts/AuthContext.jsx + constants/roles.js) le 06/08/2026 : la quasi-
// totalité des rôles dash ont en réalité un équivalent fonctionnel côté bet-elearning via son
// système de "façade" (ex: "commercial" → façade admin_elearning, "onboarding" → façade
// admin_onboarding, "coach" → professeur_titulaire/remplacant) - un rôle NE SUFFIT DONC PAS
// à déterminer la plateforme dans la plupart des cas (contrairement à ce qu'on croyait avant
// cet audit - "deputy_superviseur" avait par ex. été classé "dash" à tort). Seuls les rôles
// ci-dessous sont confirmés strictement exclusifs à une seule plateforme (aucune route/dashboard
// fonctionnel de l'autre côté) :
export const PLATEFORME_PAR_ROLE = {
  // Rôles legacy (table profils_admin) : dash a un fallback role-aware (AdminDashboard.jsx),
  // bet-elearning n'a AUCUN mapping pour ces rôles bruts (redirection cassée vers /connexion).
  admin_pedagogique: "dash", admin_financier: "dash", admin_rh: "dash",
  // Rôles "admin_*" bet-elearning natifs : dash ne les connaît pas du tout (absents de
  // DASHBOARD_PAR_ROLE), pas de fallback même générique.
  admin_elearning: "bet-elearning", assistant_elearning: "bet-elearning",
  admin_manager: "bet-elearning", admin_superviseur: "bet-elearning",
  admin_placement: "bet-elearning", admin_onboarding: "bet-elearning",
  admin_customer_care: "bet-elearning", admin_pa_advisor: "bet-elearning",
  admin_rh_paie: "bet-elearning", admin_comptable: "bet-elearning",
  // "coach" (dash) est un rôle distinct de professeur_titulaire/remplacant (bet-elearning) -
  // aucun des deux n'a d'équivalent de l'autre côté.
  professeur_titulaire: "bet-elearning", professeur_remplacant: "bet-elearning",
  client_entreprise: "bet-elearning",
  // Tous les autres rôles (super_admin, admin, manager, commercial, gestionnaire, coach,
  // data_collector, placement_test, superviseur, deputy_superviseur, pedagogical_advisor,
  // onboarding, rh, rh_paie, comptable, customer_care, responsable, responsable_centre,
  // observateur, admin_commercial…) sont VRAIMENT partagés - volontairement absents d'ici,
  // c'est l'origine de la requête (voir resolvePlateforme) qui tranche pour eux.
};

// Résout la plateforme effective d'un log, par ordre de fiabilité décroissant :
// 1. explicite (passée par l'appelant - rare, ex: disambiguïsation du module "contenus")
// 2. origine de la requête (Origin/Referer HTTP - voir requestContext.js) : LE signal fiable,
//    car il reflète l'app qui a réellement émis l'appel, indépendamment du rôle de l'acteur
//    (qui peut légitimement utiliser l'une ou l'autre façade selon la plateforme).
// 3. rôle de l'acteur, seulement pour les ~15 rôles confirmés exclusifs (PLATEFORME_PAR_ROLE)
// 4. module, en tout dernier recours (ex: appel serveur-à-serveur sans en-tête Origin)
export function resolvePlateforme(explicit, module, acteurRole, origine) {
  return explicit || origine || PLATEFORME_PAR_ROLE[acteurRole] || PLATEFORME_PAR_MODULE[module] || null;
}
