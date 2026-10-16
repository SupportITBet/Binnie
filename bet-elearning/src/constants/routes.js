export const ROUTES = {
  // Auth
  CONNEXION:             '/access/bet-learning',
  MOT_DE_PASSE_OUBLIE:   '/mot-de-passe-oublie',
  RESET_MOT_DE_PASSE:    '/reset-mot-de-passe',

  // Apprenant
  APPRENANT_DASHBOARD:   '/apprenant/dashboard',
  APPRENANT_COURS:       '/apprenant/cours',
  APPRENANT_EXERCICES:   '/apprenant/exercices',
  APPRENANT_DEVOIRS:     '/apprenant/devoirs',
  APPRENANT_SESSION:     '/apprenant/session',
  APPRENANT_PROGRESSION: '/apprenant/progression',
  APPRENANT_RESULTATS:   '/apprenant/resultats',
  APPRENANT_BADGES:      '/apprenant/badges',
  APPRENANT_TEST:        '/apprenant/test-niveau',

  // Parent
  PARENT_DASHBOARD:      '/parent/dashboard',
  PARENT_SUIVI:          '/parent/suivi',
  PARENT_BULLETINS:      '/parent/bulletins',
  PARENT_PRESENCES:      '/parent/presences',
  PARENT_COMMUNICATION:  '/parent/communication',
  PARENT_EVALUATION:     '/parent/evaluation',

  // Professeur
  PROF_DASHBOARD:        '/professeur/dashboard',
  PROF_PLANNING:         '/professeur/planning',
  PROF_APPRENANTS:       '/professeur/apprenants',
  PROF_MEDIATHEQUE:      '/professeur/mediatheque',
  PROF_SESSION_LIVE:     '/professeur/session-live',
  PROF_PRESENCES:        '/professeur/presences',
  PROF_NOTES:            '/professeur/notes',
  PROF_DEVOIRS:          '/professeur/devoirs',
  PROF_SUIVI:            '/professeur/suivi',

  // Admin
  ADMIN_MANAGER:         '/admin/manager',
  ADMIN_SUPERVISEUR:     '/admin/superviseur',
  ADMIN_PLACEMENT:       '/admin/placement',
  ADMIN_ONBOARDING:      '/admin/onboarding',
  ADMIN_ELEARNING:       '/admin/elearning',
  ADMIN_SUPPORT:         '/admin/support',
  ADMIN_AUDIT_LOGS:      '/admin/audit-logs',

  // Entreprise
  ENTREPRISE_DASHBOARD:  '/entreprise/dashboard',
  /* `/entreprise/classes` montre les CLASSES, `/entreprise/beneficiaires` les APPRENANTS.
     Les deux étaient confondus : l'onglet « Bénéficiaires » affichait en réalité une grille
     de classes, et la RH n'avait aucune liste nominative de ses salariés en formation. */
  ENTREPRISE_CLASSES:       '/entreprise/classes',
  ENTREPRISE_BENEFICIAIRES: '/entreprise/beneficiaires',
  ENTREPRISE_PRESENCES:     '/entreprise/presences',
  ENTREPRISE_INSCRIPTION:   '/entreprise/inscription',
  ENTREPRISE_RAPPORTS:      '/entreprise/rapports',
};
