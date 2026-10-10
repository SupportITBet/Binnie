export const ROLES = {
  SUPER_ADMIN:            'super_admin',
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

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   UN MÉTIER, UN RÔLE — ET LE FILET QUI A PERMIS D'Y ARRIVER

   AVANT, trente-quatre rôles bruts s'écrasaient en seize rôles « façade » : `admin`,
   `super_admin` et `manager` aboutissaient tous à `admin_manager` et voyaient le même menu de
   neuf onglets, tous étiquetés « Manager BET » — alors que dash leur donne respectivement
   dix-sept, vingt et huit onglets. `data_collector` atterrissait sur l'écran de l'agent
   Placement, un autre métier. Et `marketing`, absent des deux tables, n'avait aucun accès.

   MAINTENANT chaque métier a son rôle. `ROLE_MAP_BET` ne traduit plus que les SYNONYMES —
   deux noms pour un même poste, héritage de dash (`rh` et `rh_paie`, `coach` et
   `professeur_titulaire`) — jamais deux métiers différents vers un seul écran.

   ─────────────────────────────────────────────────────────────────────────────────────────
   POURQUOI `GROUPES_ROLE` EXISTE, ET POURQUOI IL NE FAUT PAS LE SUPPRIMER

   Cent soixante-et-onze contrôles `profile?.role === 'admin_manager'` (ou `admin_elearning`,
   `admin_onboarding`…) sont répartis dans dix-neuf fichiers, dont quatre-vingt-seize dans le
   seul `DashboardAdmin.jsx`. Ils passaient pour tous les rôles de la fusion. Dé-fusionner sans
   rien faire les aurait tous fait échouer, et aurait RETIRÉ aux comptes concernés des accès
   qu'ils avaient — exactement l'inverse du but.

   `estRole(role, famille)` remplace l'égalité stricte : il répond vrai pour le rôle lui-même
   ET pour ceux qui aboutissaient à cette façade. Les écrans continuent donc de s'afficher pour
   qui les voyait, tandis que les rôles sont désormais distincts en identité, en libellé et en
   menu. Le jour où un écran doit se restreindre à un seul rôle, on y remet une égalité stricte
   — mais ce doit être un choix explicite, pas un effet de bord de ce chantier.
   ═══════════════════════════════════════════════════════════════════════════════════════════ */

/* Les familles, telles qu'elles existaient avant la dé-fusion. Chaque clé est une ancienne
   façade ; la liste donne les rôles qui s'y résolvaient et doivent donc continuer de voir
   ses écrans. */
export const GROUPES_ROLE = {
  admin_manager:            ['super_admin', 'admin', 'manager', 'admin_manager'],
  admin_superviseur:        ['superviseur', 'responsable_centre', 'admin_superviseur'],
  admin_deputy_superviseur: ['deputy_superviseur', 'admin_deputy_superviseur'],
  admin_placement:          ['placement_test', 'data_collector', 'admin_placement'],
  admin_onboarding:         ['onboarding', 'admin_onboarding'],
  admin_pa_advisor:         ['pedagogical_advisor', 'admin_pa_advisor'],
  admin_elearning:          ['commercial', 'corporate', 'admin_commercial', 'assistant_elearning', 'admin_elearning'],
  admin_customer_care:      ['customer_care', 'admin_customer_care'],
  admin_rh_paie:            ['rh', 'rh_paie', 'admin_rh_paie'],
  admin_comptable:          ['comptable', 'admin_comptable'],
  admin_gestionnaire:       ['gestionnaire', 'admin_gestionnaire'],
  admin_responsable:        ['responsable', 'admin_responsable'],
  admin_observateur:        ['observateur', 'admin_observateur'],
  assistant_sav:            ['assistant_sav'],
  marketing:                ['marketing'],
  professeur_titulaire:     ['coach', 'professeur_titulaire'],
  professeur_remplacant:    ['professeur_remplacant'],
};

/**
 * `estRole(role, famille)` — le rôle appartient-il à cette famille d'écrans ?
 *
 * À utiliser partout où l'on écrivait `profile?.role === 'admin_xxx'`. Accepte aussi une
 * liste : `estRole(r, ['admin_manager', 'admin_comptable'])`.
 */
/**
 * `familleDe(role)` — la famille d'écrans à laquelle ce rôle appartient, ou le rôle lui-même.
 *
 * Indispensable pour les tables encore indexées par nom de FAMILLE, comme
 * `CONFIGS_PAR_ROLE` dans `DashboardAdmin.jsx` : depuis la dé-fusion, un compte arrive avec le
 * nom de son métier, et `TABLE[profile.role]` rendait `undefined`. Trois blocs de rendu lisent
 * `config.modules` et `config.description` sans protection — ils auraient levé
 * « Cannot read properties of undefined » pour l'agent Placement, le PA Advisor et le
 * comptable. Passer par `familleDe` retrouve la bonne entrée.
 */
/* ═══════════════════════════════════════════════════════════════════════════════════════════
   LES RÔLES DU PERSONNEL — UNE SEULE LISTE, POUR UNE SEULE RÈGLE D'ACCÈS

   Les deux pages de connexion portaient chacune leur propre liste en dur de « rôles à accès
   natif », et elles DIVERGEAIENT : `Login.jsx` acceptait `admin` et `manager`, `LoginAdmin.jsx`
   non. L'Administrateur était donc refusé sur la porte du personnel, avec le message
   « Votre accès à la plateforme e-learning n'est pas encore activé » — alors qu'il n'y a rien
   à activer pour lui.

   Les deux listes reposaient aussi sur `role.startsWith('admin_')`, un test qui fonctionnait
   tant que chaque compte portait un rôle de façade. Depuis que chaque métier a son propre rôle,
   `commercial`, `rh`, `onboarding`, `superviseur`… ne commencent plus par `admin_` : quarante-deux
   des quarante-neuf comptes du personnel se faisaient refouler.

   Appartenir au personnel suffit désormais pour entrer. Le drapeau `acces_elearning` reste la
   règle pour les APPRENANTS et les PARENTS, à qui l'accès est ouvert au cas par cas — c'était
   son objet d'origine, et il la garde. Ce que fait chaque rôle une fois entré reste décidé par
   son menu et par `requirePermission` côté serveur.
   ═══════════════════════════════════════════════════════════════════════════════════════════ */
export const ROLES_STAFF = [
  'super_admin', 'admin', 'manager',
  'superviseur', 'deputy_superviseur', 'pedagogical_advisor', 'onboarding',
  'placement_test', 'data_collector',
  'commercial', 'admin_elearning', 'customer_care', 'assistant_sav', 'marketing',
  'rh', 'comptable', 'gestionnaire', 'responsable', 'observateur',
  // Les enseignants et le client entreprise ont leur propre espace, mais entrent de droit.
  'professeur_titulaire', 'professeur_remplacant', 'client_entreprise',
  // Anciens noms de façade, encore possibles en base ou dans un jeton déjà émis.
  'admin_manager', 'admin_superviseur', 'admin_deputy_superviseur', 'admin_placement',
  'admin_onboarding', 'admin_pa_advisor', 'admin_customer_care', 'admin_rh_paie',
  'admin_comptable', 'admin_commercial', 'admin_gestionnaire', 'admin_responsable',
  'admin_observateur', 'assistant_elearning',
];

/**
 * `roleBetDe(role)` — le rôle bet-elearning correspondant à un rôle de la base, ou `null`.
 *
 * ⚠️ À UTILISER PARTOUT OÙ L'ON ÉCRIVAIT `ROLE_MAP_BET[role]`. Tant que cette table traduisait
 * les trente-quatre rôles, une absence signifiait « rôle inconnu » et les pages de connexion
 * s'en servaient pour refuser l'entrée. Depuis la dé-fusion elle ne contient plus que les
 * SYNONYMES : `super_admin`, `admin`, `commercial`, `rh`… n'y figurent plus puisqu'ils se
 * résolvent en eux-mêmes. `ROLE_MAP_BET['super_admin']` valant `undefined`, ces pages ont
 * conclu « Rôle du compte non reconnu » et ont refusé le Super Admin.
 *
 * Cette fonction rétablit les deux propriétés à la fois : un rôle connu — synonyme ou non —
 * est résolu, et un rôle VRAIMENT inconnu rend `null`, pour que l'appelant refuse au lieu de
 * retomber sur un rôle à privilèges par défaut, comme le fait `SSOLogin.jsx`.
 */
export function roleBetDe(role) {
  if (!role) return null;
  const r = ROLE_MAP_BET[role] || role;
  const CONNUS = [...ROLES_STAFF, 'apprenant', 'parent', 'client_entreprise',
                  'apprenant_adulte', 'apprenant_enfant', 'apprenant_adolescent'];
  return CONNUS.includes(r) ? r : null;
}

/** Ce rôle fait-il partie du personnel ? Si oui, l'accès à la plateforme est de droit. */
export const estStaff = (role) => !!role && ROLES_STAFF.includes(role);

export function familleDe(role) {
  if (!role) return role;
  if (GROUPES_ROLE[role]) return role;
  return Object.keys(GROUPES_ROLE).find(f => GROUPES_ROLE[f].includes(role)) || role;
}

export function estRole(role, famille) {
  if (!role) return false;
  const familles = Array.isArray(famille) ? famille : [famille];
  return familles.some(f => f === role || (GROUPES_ROLE[f] || []).includes(role));
}

/* `ROLE_MAP_BET` NE TRADUIT PLUS QUE LES SYNONYMES. Un nom brut qui désigne le même poste
   qu'un autre y est ramené à sa forme canonique ; tout rôle absent de cette table garde son
   nom tel quel (voir AuthContext.jsx : le remappage est conditionnel).

   Aucune de ces correspondances ne fait partager un écran à deux métiers : ce sont des alias
   historiques de dash, et tous ont zéro compte en base sauf `coach` — dont la distinction
   titulaire/remplaçant est faite plus loin par `type_coach`, pas par cette table. */
export const ROLE_MAP_BET = {
  // Alias stricts : deux noms, un seul poste.
  rh_paie:               'rh',
  admin_rh_paie:         'rh',
  admin_comptable:       'comptable',
  admin_manager:         'manager',
  admin_superviseur:     'superviseur',
  responsable_centre:    'superviseur',
  admin_deputy_superviseur: 'deputy_superviseur',
  admin_placement:       'placement_test',
  admin_onboarding:      'onboarding',
  admin_pa_advisor:      'pedagogical_advisor',
  admin_customer_care:   'customer_care',
  admin_gestionnaire:    'gestionnaire',
  admin_responsable:     'responsable',
  admin_observateur:     'observateur',
  // L'Assistante Corporate et l'Assistant E-Learning restent un seul poste — c'est une fusion
  // de MÉTIERS décidée côté bet-elearning, pas un partage d'écran accidentel. `commercial`,
  // lui, est désormais son propre rôle.
  corporate:             'admin_elearning',
  admin_commercial:      'admin_elearning',
  assistant_elearning:   'admin_elearning',
  // Le coach : `type_coach` tranche entre titulaire et remplaçant, en aval de cette table.
  coach:                 'professeur_titulaire',
};


/* Un point d'entrée par rôle. Plusieurs rôles peuvent viser la MÊME adresse — c'est le cas
   de la direction, qui partage aujourd'hui l'écran du manager — sans pour autant partager leur
   identité : chacun garde son libellé et son menu. */
export const ROLE_REDIRECT = {
  apprenant:              '/apprenant/dashboard',
  parent:                 '/parent/dashboard',
  professeur_titulaire:   '/professeur/dashboard',
  professeur_remplacant:  '/professeur/dashboard',
  client_entreprise:      '/entreprise/dashboard',
  // ── Direction ──
  super_admin:            '/admin/manager',
  admin:                  '/admin/manager',
  manager:                '/admin/manager',
  // ── Pédagogie & supervision ──
  superviseur:            '/admin/superviseur',
  deputy_superviseur:     '/admin/deputy-superviseur',
  pedagogical_advisor:    '/admin/pa-advisor/overview',
  onboarding:             '/admin/onboarding',
  placement_test:         '/admin/placement',
  // `data_collector` ne partage plus l'écran du Placement : c'est un autre métier.
  data_collector:         '/admin/data-collector',
  // ── Commerce & relation client ──
  commercial:             '/admin/vente/taches',
  admin_elearning:        '/admin/elearning',
  customer_care:          '/admin/support',
  assistant_sav:          '/admin/sav',
  marketing:              '/admin/marketing',
  // ── Administration & finances ──
  rh:                     '/admin/rh',
  comptable:              '/admin/comptable',
  gestionnaire:           '/admin/gestionnaire',
  responsable:            '/admin/responsable',
  observateur:            '/admin/observateur',
};


export const ROLE_LOGIN = {
  apprenant:             '/connexion/apprenant',
  parent:                '/connexion/parent',
  client_entreprise:     '/connexion/entreprise',
  // Les coachs (professeur_titulaire/remplaçant) passent par le portail unique /connexion,
  // pas de page de connexion dédiée - volontaire, cf. demande explicite.
};

/* Le libellé affiché dans l'en-tête. Il doit dire le MÉTIER, pas la famille d'écrans :
   un administrateur s'affichait « Manager BET » tant que les deux partageaient une façade. */
export const LIBELLES_ROLES = {
  apprenant:              'Apprenant',
  parent:                 'Parent',
  professeur_titulaire:   'Professeur Titulaire',
  professeur_remplacant:  'Professeur Remplaçant',
  client_entreprise:      'Responsable RH',
  super_admin:            'Super Admin',
  admin:                  'Administrateur',
  manager:                'Manager BET',
  superviseur:            'Superviseur',
  deputy_superviseur:     'Deputy Superviseur',
  pedagogical_advisor:    'PA Advisor',
  onboarding:             'Agent Onboarding',
  placement_test:         'Agent Placement',
  data_collector:         'Data Collector',
  commercial:             'Commerciale',
  admin_elearning:        'Assistant E-Learning',
  customer_care:          'Customer Care',
  assistant_sav:          'Assistante SAV',
  marketing:              'Assistant Marketing',
  rh:                     'RH / Paie',
  comptable:              'Comptable Trésorier',
  gestionnaire:           'Gestionnaire',
  responsable:            'Responsable',
  observateur:            'Observateur',
};

