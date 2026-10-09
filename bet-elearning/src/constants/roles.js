export const ROLES = {
  APPRENANT:              'apprenant',
  PARENT:                 'parent',
  PROF_TITULAIRE:         'professeur_titulaire',
  PROF_REMPLACANT:        'professeur_remplacant',
  ADMIN_MANAGER:          'admin_manager',
  ADMIN_SUPERVISEUR:      'admin_superviseur',
  ADMIN_DEPUTY_SUPERVISEUR: 'admin_deputy_superviseur',
  ADMIN_PLACEMENT:        'admin_placement',
  ADMIN_ONBOARDING:       'admin_onboarding',
  ADMIN_ELEARNING:        'admin_elearning',
  ADMIN_CUSTOMER_CARE:    'admin_customer_care',
  // L'Assistante SAV garde l'identifiant de la base (`assistant_sav`) au lieu d'un
  // `admin_sav` de façade : son rôle réel porte déjà ce nom, et en inventer un second
  // obligerait à le tenir synchronisé dans la matrice des droits, le Backend et
  // `app_metadata`. Les autres `admin_*` existent parce que leur rôle en base s'appelle
  // autrement (`onboarding`, `customer_care`…), ce qui n'est pas le cas ici.
  ASSISTANT_SAV:          'assistant_sav',
  ADMIN_PA_ADVISOR:       'admin_pa_advisor',
  ADMIN_RH_PAIE:          'admin_rh_paie',
  ADMIN_COMPTABLE:        'admin_comptable',
  ADMIN_COMMERCIAL:       'admin_commercial',
  ADMIN_RESPONSABLE:      'admin_responsable',
  ADMIN_GESTIONNAIRE:     'admin_gestionnaire',
  ADMIN_OBSERVATEUR:      'admin_observateur',
  CLIENT_ENTREPRISE:      'client_entreprise',
};

// Rôle réel stocké en base (`utilisateurs.role`) → rôle "façade" attendu par le frontend
// bet-elearning (nav, routing, `profile?.role === 'admin_xxx'` un peu partout). Certains
// comptes admin partagent un rôle DB historique commun à dash (ex: "onboarding",
// "superviseur", "manager") qui ne correspond pas au libellé `admin_xxx` utilisé ici.
// Utilisé à la fois au login (LoginAdmin.jsx) ET à chaque restauration de session (F5,
// AuthContext.jsx) - sans ce remapping au second endroit, le rôle repart en frontend
// "brut" après un rechargement et casse tout le routing/nav basé sur `admin_xxx`.
export const ROLE_MAP_BET = {
  super_admin:           'admin_manager',
  admin:                 'admin_manager',
  manager:               'admin_manager',
  superviseur:           'admin_superviseur',
  deputy_superviseur:    'admin_deputy_superviseur',
  responsable_centre:    'admin_superviseur',
  data_collector:        'admin_placement',
  placement_test:        'admin_placement',
  onboarding:            'admin_onboarding',
  pedagogical_advisor:   'admin_pa_advisor',
  admin_elearning:       'admin_elearning',
  assistant_elearning:   'admin_elearning',
  customer_care:         'admin_customer_care',
  // L'Assistante Corporate est désormais représentée par l'Assistant E-Learning côté
  // bet-elearning (rôle fusionné) - le rôle brut reste "commercial"/"corporate" côté dash
  // pour ne pas casser son fonctionnement là-bas, mais ici on résout systématiquement
  // vers admin_elearning.
  commercial:            'admin_elearning',
  corporate:             'admin_elearning',
  rh:                    'admin_rh_paie',
  rh_paie:               'admin_rh_paie',
  comptable:             'admin_comptable',
  coach:                 'professeur_titulaire',
  responsable:           'admin_responsable',
  gestionnaire:          'admin_gestionnaire',
  observateur:           'admin_observateur',
  professeur_titulaire:  'professeur_titulaire',
  professeur_remplacant: 'professeur_remplacant',
  admin_placement:       'admin_placement',
  admin_onboarding:      'admin_onboarding',
  admin_customer_care:   'admin_customer_care',
  assistant_sav:         'assistant_sav',
  admin_commercial:      'admin_elearning',
  admin_pa_advisor:      'admin_pa_advisor',
  admin_rh_paie:         'admin_rh_paie',
  admin_comptable:       'admin_comptable',
  admin_manager:         'admin_manager',
  admin_superviseur:     'admin_superviseur',
};

export const ROLE_REDIRECT = {
  apprenant:              '/apprenant/dashboard',
  parent:                 '/parent/dashboard',
  professeur_titulaire:   '/professeur/dashboard',
  professeur_remplacant:  '/professeur/dashboard',
  admin_manager:          '/admin/manager',
  admin_superviseur:          '/admin/superviseur',
  admin_deputy_superviseur:   '/admin/deputy-superviseur',
  admin_placement:        '/admin/placement',
  admin_onboarding:       '/admin/onboarding',
  admin_elearning:        '/admin/elearning',
  admin_customer_care:    '/admin/support',
  assistant_sav:          '/admin/sav',
  admin_pa_advisor:       '/admin/pa-advisor/overview',
  admin_rh_paie:          '/admin/rh',
  admin_comptable:        '/admin/comptable',
  admin_commercial:       '/admin/commercial',
  admin_responsable:      '/admin/responsable',
  admin_gestionnaire:     '/admin/gestionnaire',
  admin_observateur:      '/admin/observateur',
  client_entreprise:      '/entreprise/dashboard',
};

export const ROLE_LOGIN = {
  apprenant:             '/connexion/apprenant',
  parent:                '/connexion/parent',
  client_entreprise:     '/connexion/entreprise',
  // Les coachs (professeur_titulaire/remplaçant) passent par le portail unique /connexion,
  // pas de page de connexion dédiée - volontaire, cf. demande explicite.
};

export const LIBELLES_ROLES = {
  apprenant:              'Apprenant',
  parent:                 'Parent',
  professeur_titulaire:   'Professeur Titulaire',
  professeur_remplacant:  'Professeur Remplaçant',
  admin_manager:          'Manager BET',
  admin_superviseur:          'Superviseur',
  admin_deputy_superviseur:   'Deputy Superviseur',
  admin_placement:        'Agent Placement',
  admin_onboarding:       'Agent Onboarding',
  admin_elearning:        'Assistant E-Learning',
  admin_customer_care:    'Customer Care',
  assistant_sav:          'Assistante SAV',
  admin_pa_advisor:       'PA Advisor',
  admin_rh_paie:          'RH / Paie',
  admin_comptable:        'Comptable Trésorier',
  admin_commercial:       'Assistante Corporate',
  admin_responsable:      'Responsable',
  admin_gestionnaire:     'Gestionnaire',
  admin_observateur:      'Observateur',
  client_entreprise:      'Responsable RH',
};
