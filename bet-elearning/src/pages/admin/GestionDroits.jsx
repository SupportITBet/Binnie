import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { COULEURS } from '../../constants/couleurs';
import TopNavLayout from '../../components/shared/TopNavLayout';
import { LIBELLES_ROLES, estRole, ROLE_MAP_BET } from '../../constants/roles';
import { useTheme, PALETTE_THEME } from '../../contexts/ThemeContext';
import { useAlerte } from '../../contexts/ConfirmContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
function authHeaders() {
  const t = localStorage.getItem('admin_token') || '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` };
}

// Mapping rôles backend → rôles bet-elearning
/* LA TABLE CENTRALE, PLUS DE COPIE LOCALE.
   Celle-ci portait encore `super_admin: 'admin_manager'`, `admin: 'admin_manager'` : dans la
   liste des utilisateurs, un Super Admin s'affichait donc « Manager BET » — l'ancienne fusion
   rejouée pour l'affichage, alors que les rôles sont désormais distincts. */
const ROLE_MAP = ROLE_MAP_BET;


function mapUser(u) {
  // Rôles professeurs reconnus directement (si l'API les renvoie tels quels)
  const ROLES_PROFS_BET = ['professeur_titulaire', 'professeur_remplacant'];
  let roleBet = ROLE_MAP[u.role] || (ROLES_PROFS_BET.includes(u.role) ? u.role : 'admin_elearning');
  // Pour les coachs : lire le type titulaire/remplaçant depuis localStorage
  if (roleBet === 'professeur_titulaire' || ROLES_PROFS_BET.includes(u.role)) {
    const savedType = localStorage.getItem(`bet_coach_type_${u.id}`);
    if (savedType === 'professeur_remplacant') roleBet = 'professeur_remplacant';
    else if (savedType === 'professeur_titulaire') roleBet = 'professeur_titulaire';
  }
  const info    = u.coach_info || {};
  const scope   = Array.isArray(u.scope) ? u.scope : [];
  const centreId = scope.find(s => s !== 'national') || '';
  return {
    id:            u.id,
    prenom:        u.prenom  || '',
    nom:           u.nom     || '',
    email:         u.email   || '',
    initiales:     `${(u.prenom||'')[0]||''}${(u.nom||'')[0]||''}`.toUpperCase() || '?',
    role:          roleBet,
    description:   u.departement || info.filiere || '',
    est_actif:     u.actif !== false,
    deux_facteurs: u.twofa_active === true,
    photo:         u.avatar_url || info.photo_url || null,
    centre_id:     centreId,
    // champs prof
    certifications:     (() => { const c = info.certifications; return Array.isArray(c) ? c : typeof c === 'string' ? c.split(',').map(s=>s.trim()).filter(Boolean) : []; })(),
    annees_experience:  info.annees_experience || null,
    niveau_anglais:     info.niveau_anglais    || null,
    disponibilites:     null,
    acces_elearning:    u.acces_elearning === true,
    _roleBackend:       u.role,
    derniere_connexion: u.derniere_connexion || null,
  };
}

const ROLES_ADMIN = [
  'admin_manager',
  'admin_superviseur',
  'admin_deputy_superviseur',
  'admin_responsable',
  'admin_gestionnaire',
  'admin_placement',
  'admin_onboarding',
  'admin_elearning',
  'admin_customer_care',
  'admin_pa_advisor',
  'admin_rh_paie',
  'admin_comptable',
  'admin_observateur',
];

// "professeur_remplacant" retiré de l'admin BET (non utilisé actuellement) -
// n'apparaît plus dans les filtres, stats, ni le formulaire de création/édition.
const ROLES_PROF = [
  'professeur_titulaire',
];

const TOUS_ROLES = [...ROLES_ADMIN, ...ROLES_PROF];

// ── Rôles physiques réels (utilisateurs.role, table permissions_roles côté serveur) ──
// Distincts des rôles "façade" bet-elearning ci-dessus (admin_manager, admin_elearning…)
// utilisés uniquement pour le routage/l'affichage frontend. La matrice de permissions
// s'applique au rôle physique, seule valeur que le backend connaît réellement.
const PHYSICAL_ROLES = [
  { id: 'super_admin',          lib: 'Super Admin',          couleur: '#DC2626' },
  { id: 'admin',                lib: 'Admin',                 couleur: '#7C3AED' },
  { id: 'manager',               lib: 'Manager',               couleur: '#0891B2' },
  { id: 'superviseur',           lib: 'Superviseur',           couleur: '#4F46E5' },
  { id: 'deputy_superviseur',    lib: 'Deputy Superviseur',    couleur: '#6D28D9' },
  { id: 'responsable',           lib: 'Responsable',           couleur: '#0D9488' },
  { id: 'onboarding',            lib: 'Onboarding',            couleur: '#EA580C' },
  { id: 'pedagogical_advisor',   lib: 'PA Advisor',            couleur: '#0369A1' },
  { id: 'commercial',            lib: 'Assistant E-Learning',  couleur: '#0284C7' },
  { id: 'customer_care',         lib: 'Customer Care',         couleur: '#EC4899' },
  { id: 'admin_placement',       lib: 'Placement Test',        couleur: '#16A34A' },
  { id: 'rh',                    lib: 'RH / Paie',             couleur: '#0F766E' },
  { id: 'comptable',             lib: 'Comptable',             couleur: '#D97706' },
  { id: 'gestionnaire',          lib: 'Gestionnaire',          couleur: '#64748B' },
  { id: 'coach',                 lib: 'Coach / Professeur',    couleur: '#0D9488' },
  { id: 'data_collector',        lib: 'Data Collector',        couleur: '#94A3B8' },
];

// "dashboard" retiré : page d'atterrissage 100% informationnelle (KPIs/stats),
// aucune route ne vérifie requirePermission("dashboard", ...) pour aucun rôle -
// comme "Lire", le laisser dans la matrice était trompeur (aucun effet réel).
// "utilisateurs" retiré pour la même raison : la création d'un compte passe par
// requireSuperAdmin (contrôle de rôle fixe, hors matrice), et la lecture/modification
// des utilisateurs ne vérifie aucune permission - ce module n'a jamais rien contrôlé.
const MODULES_PERMISSIONS = [
  { id: 'roles',          lib: 'Rôles & permissions',     icone: '🛡️',
    desc: "Créer/modifier des rôles et gérer les droits d'accès des utilisateurs staff." },
  { id: 'remplacements',  lib: 'Remplacements',           icone: '🔄',
    desc: "Signaler l'absence d'un coach, assigner un remplaçant, suivre les délégations de séances." },
  { id: 'missions',       lib: "Missions d'observation",  icone: '🎯',
    desc: "Planifier et suivre les visites d'observation d'un Deputy Superviseur auprès des coachs." },
  { id: 'classes',        lib: 'Classes & groupes',       icone: '🏫',
    desc: "Créer/modifier les classes e-learning, assigner un coach, gérer les bénéficiaires inscrits." },
  { id: 'honoraires',     lib: 'Honoraires & paiements',  icone: '💰',
    desc: "Calculer, valider et transmettre à la RH les honoraires mensuels des coachs." },
  { id: 'contenus_ressources', lib: 'Contenus - Ressources',              icone: '📄',
    desc: "Bibliothèque de ressources d'onboarding : vidéos, PDFs, guides destinés aux nouveaux inscrits." },
  { id: 'contenus_biblio',     lib: 'Contenus - Bibliothèque communautaire', icone: '🎧',
    desc: "Contenus audio/vidéo libres (podcasts, extraits) mis à disposition des apprenants." },
  { id: 'contenus_minijeux',   lib: 'Contenus - Mini-jeux',               icone: '🎮',
    desc: "Créer et gérer les mini-jeux pédagogiques (quiz, mots cachés…) proposés aux apprenants." },
  { id: 'devoirs_evaluations', lib: 'Devoirs, exercices & évaluations',  icone: '✍️',
    desc: "Créer des devoirs/exercices pour une classe et corriger les rendus des apprenants." },
  { id: 'examens',        lib: 'Examens',                 icone: '📝',
    desc: "Créer et administrer les examens/tests de certification des apprenants." },
  { id: 'inscriptions',   lib: 'Inscriptions',            icone: '📥',
    desc: "Saisir de nouvelles inscriptions (manuellement ou par import) et les faire avancer dans le parcours (vérifié → transmis → placement)." },
  { id: 'planning',       lib: 'Planning',                icone: '📅',
    desc: "Gérer le planning des séances et des disponibilités des coachs." },
  { id: 'finances',       lib: 'Finances',                icone: '💳',
    desc: "Saisir et corriger des versements sur le contrat d'une entreprise cliente (onglet Paiements) et consulter la situation financière. La suppression d'un versement reste réservée à l'admin BET." },
  { id: 'finances_facturation',     lib: 'Finances - Facturation',              icone: '🧾',
    desc: "Créer/modifier les factures, consulter et déclencher les relances de factures impayées." },
  { id: 'finances_paiements',       lib: 'Finances - Paiements',                icone: '💰',
    desc: "Enregistrer et modifier les encaissements liés aux factures." },
  { id: 'finances_tresorerie',      lib: 'Finances - Trésorerie',               icone: '🏦',
    desc: "Consulter la synthèse de trésorerie et saisir les dépenses/mouvements manuels." },
  { id: 'finances_fournisseurs',    lib: 'Finances - Fournisseurs & Achats',    icone: '📦',
    desc: "Gérer les fiches fournisseurs, les factures d'achat et leurs paiements." },
  { id: 'finances_generale',        lib: 'Finances - Comptabilité générale',    icone: '📚',
    desc: "Plan comptable, journal, grand-livre, balance, bilan, compte de résultat et clôture d'exercice." },
  { id: 'finances_tva',             lib: 'Finances - TVA',                      icone: '🧮',
    desc: "Consulter la synthèse TVA et gérer les déclarations." },
  { id: 'finances_immobilisations', lib: 'Finances - Immobilisations',          icone: '🏗️',
    desc: "Gérer les immobilisations et leurs amortissements." },
  { id: 'finances_budgets',         lib: 'Finances - Budgets',                  icone: '🎯',
    desc: "Créer les budgets et consulter le suivi budget vs réalisé." },
  { id: 'finances_analytique',      lib: 'Finances - Analytique',               icone: '📐',
    desc: "Gérer les axes analytiques et consulter la répartition analytique des charges." },
  { id: 'crm_entreprises',    lib: 'CRM - Entreprises',                 icone: '🏢',
    desc: "Créer/modifier les fiches entreprises clientes et leurs documents rattachés." }, // couvre aussi demandes/documents (fusionné 22/07/2026)
  { id: 'contrat',           lib: 'Contrats entreprise',               icone: '📄',
    desc: "Renouveler le contrat d'une entreprise cliente et gérer son statut (brouillon/actif/suspendu/expiré/résilié). \"Créer\" permet de proposer un renouvellement (à valider par un rôle avec \"Modifier\") ; \"Modifier\" permet de le renouveler/valider directement." },
  { id: 'crm_beneficiaires',  lib: 'CRM - Bénéficiaires',               icone: '🎓',
    desc: "Ajouter/modifier les bénéficiaires (salariés/enfants) rattachés à une entreprise cliente." },
  { id: 'crm_comptes_acces',  lib: 'CRM - Comptes & accès entreprise',  icone: '🔑',
    desc: "Créer le compte RH d'une entreprise, réinitialiser son mot de passe, gérer ses accès." },
  { id: 'rapports',       lib: 'Rapports',                icone: '📈',
    desc: "Consulter et exporter le reporting e-learning par entreprise (classes, coachs, apprenants)." },
  { id: 'rh',             lib: 'RH',                      icone: '🤝',
    desc: "Gestion des contrats et bulletins de paie des professeurs - module en réflexion, pas encore de route réelle." },
  { id: 'support',        lib: 'Support',                 icone: '🎧',
    desc: "Traiter les tickets de support et les demandes des apprenants/entreprises." },
  { id: 'mediatheque',    lib: 'Médiathèque',             icone: '🖼️',
    desc: "Gérer les images/vidéos utilisées sur le site vitrine et les supports de communication." },
  { id: 'fichiers_partages', lib: 'Fichiers partagés',    icone: '📂',
    desc: "Déposer et consulter des documents internes partagés entre équipes." },
  { id: 'audit',          lib: 'Audit logs',              icone: '🕵️',
    desc: "Consulter l'historique des actions sensibles effectuées par les comptes admin/staff." },
  { id: 'configuration',  lib: 'Configuration',           icone: '⚙️',
    desc: "Paramètres généraux de la plateforme (grilles tarifaires, textes, réglages globaux)." },
];

// ── Modules pertinents par rôle physique ─────────────────────────────────────
// Réduit le bruit dans la matrice : un rôle ne voit que les modules qui concernent
// réellement son métier (ex: Onboarding n'a rien à faire sur "Remplacements" ou
// "Rôles & permissions"). super_admin/admin voient tout (supervision totale).
// Construit à partir des VRAIS onglets de chaque dashboard (MENUS_PAR_ROLE dans
// TopNavLayout.jsx), pas d'une estimation - chaque profil a des onglets différents
// sur son dashboard, donc la matrice doit refléter exactement ça.
// admin_responsable/admin_gestionnaire n'ont pas encore de menu dédié côté
// bet-elearning (TopNavLayout.jsx) → estimation la plus proche en attendant,
// à ajuster si/quand leur dashboard est construit.
const MODULES_PAR_ROLE = {
  super_admin:        null, // null = tous les modules
  admin:               null,
  // admin_manager : Vue d'ensemble, Professeurs, Entreprises, Administration BET,
  // Reporting, Gestion des droits, Configuration, Audit logs
  // "classes" retiré : aucun onglet de ce rôle ne concerne les classes.
  manager:            ['roles','crm_entreprises','crm_beneficiaires','crm_comptes_acces','contrat','finances','configuration','rapports','audit'],
  // admin_superviseur : Vue d'ensemble, Cahiers coachs, Rapports Deputy, Anomalies,
  // Gestion Deputies
  // "cours" retiré : leur onglet lié aux cours est 100% lecture seule (aucune route
  // backend ne vérifie ce module pour eux), le laisser dans la matrice était trompeur.
  // "missions" ajouté : Gestion Deputies (assigner une mission).
  // "audit", "honoraires", "remplacements" retirés à la demande explicite.
  superviseur:        ['rapports','missions'],
  // admin_deputy_superviseur : Tableau de bord, Observer, Mes rapports, Mes missions
  // "planning" retiré : module fantôme, aucune route ne le vérifie. "remplacements"
  // remplacé par "missions" : un Deputy n'a rien à voir avec les remplacements de
  // coachs, ses missions d'observation sont un concept totalement différent.
  deputy_superviseur: ['rapports','missions'],
  // Pas de menu bet-elearning dédié à ce jour - estimation la plus proche
  responsable:        ['classes','rh','rapports','planning'],
  // admin_onboarding : Vue d'ensemble, Parcours, Inscriptions, Entreprises, Classes, Contenus
  // Seul rôle scindé en 3 sous-modules (Ressources / Bibliothèque communautaire /
  // Mini-jeux, chacun avec ses propres droits) - les autres rôles ci-dessous n'ont
  // qu'un onglet Contenus en lecture seule, donc restent sur le module global "cours".
  onboarding:         ['inscriptions','classes','contenus_ressources','contenus_biblio','contenus_minijeux','crm_entreprises','crm_beneficiaires','crm_comptes_acces','contrat'],
  // admin_pa_advisor : Vue d'ensemble, Suivi programme, Évaluations, Reporting, Suivi
  // apprenants, Remplacements, Coachs, Honoraires, Rapports Superviseur
  // "cours" retiré : onglet Suivi programme 100% lecture seule, non vérifié côté serveur.
  // "examens" retiré : la seule route qui vérifie ce module est la gestion des Tests
  // de niveau (Admin Placement uniquement) - PA Advisor n'a aucun onglet de ce type.
  pedagogical_advisor:['rapports','classes','remplacements','honoraires'],
  // admin_elearning / "commercial" corporate : Vue d'ensemble, Programme, Reporting,
  // Entreprises, Espace Commercial. Rôle unique (fusionné le 22/07/2026, voir note sur
  // PHYSICAL_ROLES) : plus de ligne séparée "assistant_elearning", tout passe par le
  // rôle physique "commercial" (celui réellement stocké sur utilisateurs.role).
  // "cours" retiré : onglet Programme 100% lecture seule, non vérifié côté serveur.
  // "crm" scindé en modules distincts (juillet 2026) : Entreprises / Bénéficiaires /
  // Comptes & accès / Documents - un seul interrupteur "CRM/Commercial" mélangeait des
  // actions très différentes (créer une entreprise, valider une demande, réinitialiser
  // un mot de passe, etc.), impossible à doser finement.
  // "crm_beneficiaires" et "crm_comptes_acces" retirés à la demande explicite : la
  // gestion des bénéficiaires n'est pas du ressort de l'Assistant E-Learning, et la
  // création de comptes (apprenants = Onboarding, RH entreprise = admin BET) non plus.
  // "crm_demandes" ET "crm_documents" fusionnés dans "crm_entreprises" (22/07/2026, à la
  // demande explicite) : créer/soumettre une entreprise, valider/refuser un dossier, et
  // gérer ses documents (preuve d'inscription + pièces jointes) sont maintenant régis
  // par le même module - garder "Modifier" à faux empêche qu'une assistante valide son
  // propre dossier soumis.
  commercial:         ['rapports','crm_entreprises','contrat','finances'],
  // admin_customer_care : Vue d'ensemble, Tickets, Profils, Blocages absences
  // "classes" retiré : la route de blocage/déblocage (PATCH .../apprenants/:id/suspension)
  // n'est protégée que par authenticateAdmin, aucun requirePermission("classes", …) -
  // ce module ne gate rien de ce que Customer Care utilise réellement.
  customer_care:      ['support'],
  // admin_placement : Vue d'ensemble, Tests de niveau - "inscriptions" retiré, pas d'onglet dédié.
  admin_placement:    ['examens'],
  // admin_rh_paie : Vue d'ensemble, Professeurs, Contrats & RH, Bulletins de paie, Congés
  // "classes" et "planning" retirés : gatent respectivement la gestion des classes
  // e-learning (création/modif) et la programmation de séances - aucun onglet RH/Paie
  // n'utilise ces routes.
  rh:                 ['rh','honoraires'],
  // admin_comptable : Vue d'ensemble, Facturation, Paiements, Trésorerie, Fournisseurs,
  // Comptabilité générale, TVA, Immobilisations, Budgets, Analytique, Entreprises
  // "finances" conservé pour les versements sur contrat entreprise (entreprise.js) -
  // scindé en sous-modules pour le reste (comptabilite*.js), cf. requireAdmin.js.
  comptable:          ['finances','finances_facturation','finances_paiements','finances_tresorerie','finances_fournisseurs','finances_generale','finances_tva','finances_immobilisations','finances_budgets','finances_analytique','honoraires','crm_entreprises','crm_beneficiaires','crm_comptes_acces'],
  // Aucun onglet réel pour ce rôle côté bet-elearning : le hub de cartes défini plus haut
  // (CONFIGS_PAR_ROLE.admin_gestionnaire dans DashboardAdmin.jsx) pointe vers des chemins
  // (/admin/gestionnaire/classes, etc.) sans route ni contenu implémenté - liens morts.
  // Le rôle Gestionnaire est réellement utilisé côté `dash` (GestionnaireDashboard.jsx),
  // qui a son propre système de droits séparé. Liste vidée en attendant une vraie
  // implémentation bet-elearning ou une vérification des besoins côté dash.
  gestionnaire:       [],
  // professeur_titulaire : Tableau de bord, Planning, Mes demandes, Apprenants,
  // Médiathèque, Fichiers partagés, Session live, Présences, Notes & Devoirs, Paiements
  // "fichiers_partages" scindé de "mediatheque" : usage distinct (fichiers envoyés
  // à une classe précise, vs bibliothèque générale de contenus).
  // "cours" retiré : ce module ne gate aucune route de gestion de cours réelle
  // (coursElearning.js n'a aucun requirePermission) - il ne servait qu'à couvrir
  // les devoirs par accident. "examens" retiré : mal nommé pour un coach (il ne
  // vérifie que la saisie manuelle de note, POST /notes) et prêtait à confusion
  // avec les Tests de niveau (Admin Placement). Les deux sont remplacés par
  // "devoirs_evaluations", scindé de "cours" : couvre devoirs/exercices (create/
  // update/delete sur /devoirs) ET la saisie de notes (create sur /notes) -
  // un seul module clair pour tout ce qui touche devoirs/exercices/évaluations.
  coach:              ['planning','remplacements','classes','mediatheque','fichiers_partages','devoirs_evaluations','honoraires'],
  // Partage exactement la même façade/menu qu'admin_placement (2 onglets réels :
  // Vue d'ensemble, Tests de niveau) - inscriptions/crm/classes retirés, aucun onglet
  // dédié n'existe pour ce rôle aujourd'hui (à rajouter si une vraie page est construite).
  data_collector:     ['examens'],
};
function modulesPertinents(rolePhysique) {
  const liste = MODULES_PAR_ROLE[rolePhysique];
  if (!liste) return MODULES_PERMISSIONS; // rôle non mappé ou accès total → tout afficher
  return MODULES_PERMISSIONS.filter(m => liste.includes(m.id));
}

// "read" retiré de la matrice : aucune route backend ne vérifie ce droit
// (GET /inscriptions et /inscriptions/stats vérifiaient requirePermission
// ("inscriptions","read") jusqu'en juillet 2026 - retiré côté backend plutôt
// que de l'exposer dans l'UI, car un droit de LECTURE désactivable par erreur
// casse tout l'onglet Inscriptions d'un coup, sans qu'aucune autre action
// (Modifier/Supprimer) ne reste utilisable pour compenser - trop dangereux
// pour une case à cocher). Cohérent avec le reste de l'app : aucune lecture
// n'est gatée ailleurs, seules les mutations le sont.
const ACTIONS_PERMISSIONS = [
  { key: 'create', lib: 'Créer' },
  { key: 'update', lib: 'Modifier' },
  { key: 'delete', lib: 'Supprimer' },
  { key: 'manage', lib: 'Gérer' },
];

// ── Actions réellement vérifiées par le backend, module par module ──────────
// Audit exhaustif de tous les requirePermission(module, action) du backend
// (juillet 2026). Une case n'est affichée dans la matrice QUE si une route
// existe vraiment pour ce couple module/action - sinon elle ne fait rien et
// donne une fausse impression de contrôle. À remettre à jour si une route
// change son couple requirePermission(...).
const ACTIONS_ACTIVES_PAR_MODULE = {
  roles:               ['manage'],
  remplacements:       ['create', 'update'],
  missions:            ['update'],
  classes:             ['create', 'update', 'delete', 'manage'],
  honoraires:          ['manage'],
  contenus_ressources: ['create', 'update', 'delete'],
  contenus_biblio:     ['create', 'update', 'delete'],
  contenus_minijeux:   ['create', 'update', 'delete'],
  devoirs_evaluations: ['create', 'update', 'delete'],
  examens:             ['create', 'update', 'delete'],
  inscriptions:        ['create', 'update', 'delete', 'manage'],
  planning:            ['create', 'update'],
  finances:            ['create', 'update', 'delete'],
  finances_facturation:    ['manage'],
  finances_paiements:      ['manage'],
  finances_tresorerie:     ['manage'],
  finances_fournisseurs:   ['manage'],
  finances_generale:       ['manage'],
  finances_tva:            ['manage'],
  finances_immobilisations:['manage'],
  finances_budgets:        ['manage'],
  finances_analytique:     ['manage'],
  crm_entreprises:     ['create', 'update', 'delete'],
  contrat:             ['create', 'update'],
  crm_beneficiaires:   ['create', 'update'],
  crm_comptes_acces:   ['manage'],
  rapports:            ['manage'],
  rh:                  [],
  support:             ['create', 'update', 'delete'],
  mediatheque:         ['create', 'update', 'delete'],
  fichiers_partages:   ['create', 'update', 'delete'],
  audit:               [],
  configuration:       [],
};
function actionsActives(moduleId) {
  return ACTIONS_ACTIVES_PAR_MODULE[moduleId] || ACTIONS_PERMISSIONS.map(a => a.key);
}

const COULEUR_ROLE = {
  admin_manager:          COULEURS.cyan,
  admin_superviseur:          '#8B5CF6',
  admin_deputy_superviseur:   '#A855F7',
  admin_responsable:          '#7C3AED',
  admin_gestionnaire:     '#0891B2',
  admin_placement:        COULEURS.succes,
  admin_onboarding:       '#F97316',
  admin_elearning:        '#06B6D4',
  admin_customer_care:    '#EC4899',
  admin_pa_advisor:       '#0EA5E9',
  admin_rh_paie:          '#14B8A6',
  admin_comptable:        '#F59E0B',
  admin_commercial:       '#10B981',
  admin_observateur:      '#94A3B8',
  professeur_titulaire:   '#0D9488',
};

const CERTIFS_DISPO = ['CELTA', 'DELTA', 'TESOL', 'CELTA Online', 'Trinity CertTESOL', 'Cambridge TKT', 'IELTS Examiner', 'Cambridge Assessor', 'Autre'];
const SPECIALITES   = ['General English', 'Business English', 'Exam Preparation', 'Young Learners', 'Academic English', 'Conversation', 'Pronunciation', 'Grammar'];
const TRANCHES      = ['Enfants (6-12 ans)', 'Adolescents (13-17 ans)', 'Adultes (18+)', 'Entreprises', 'Tous niveaux'];
const NIVEAUX_ENS   = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const JOURS_SEMAINE = [
  { id: 'lundi',     lib: 'Lundi'    },
  { id: 'mardi',     lib: 'Mardi'    },
  { id: 'mercredi',  lib: 'Mercredi' },
  { id: 'jeudi',     lib: 'Jeudi'    },
  { id: 'vendredi',  lib: 'Vendredi' },
  { id: 'samedi',    lib: 'Samedi'   },
  { id: 'dimanche',  lib: 'Dimanche' },
];

const HEURES = Array.from({ length: 30 }, (_, i) => {
  const total = 6 * 60 + i * 30;
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${h}:${m}`;
});

const DISPO_DEFAUT = Object.fromEntries(
  JOURS_SEMAINE.map(j => [j.id, { actif: false, debut: '09:00', fin: '17:00' }])
);

// ── Modale exceptions de permissions par utilisateur ─────────────────────────
// Affiche TOUS les modules directement - chaque case à cocher part de ce que le
// rôle accorde déjà (permsRoleBase) ou de l'exception existante si elle existe,
// et se sauvegarde immédiatement au clic (permission_exceptions côté serveur,
// une ligne par module qui remplace intégralement les 5 droits du rôle pour ce
// module, résolu à chaque requête - donc effet immédiat, pas de bouton "Enregistrer").
function ModalExceptionsUtilisateur({ utilisateur, rolePhysique, permsRoleBase, onFermer }) {
  const modulesRole = modulesPertinents(rolePhysique);
  const [exceptions, setExceptions] = useState([]);
  const [chargement, setChargement] = useState(true);

  const chargerExceptions = useCallback(async () => {
    setChargement(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/permissions-exceptions/${utilisateur.id}`, { headers: authHeaders() });
      if (r.ok) { const d = await r.json(); setExceptions(d.exceptions || []); }
    } catch {}
    finally { setChargement(false); }
  }, [utilisateur.id]);

  useEffect(() => { chargerExceptions(); }, [chargerExceptions]);

  function permsEffectifs(moduleId) {
    const ex = exceptions.find(e => e.module === moduleId);
    if (ex) return { read: ex.peut_lire, create: ex.peut_creer, update: ex.peut_modifier, delete: ex.peut_supprimer, manage: ex.peut_gerer };
    const base = permsRoleBase?.[moduleId] || {};
    return { read: !!base.read, create: !!base.create, update: !!base.update, delete: !!base.delete, manage: !!base.manage };
  }

  async function toggle(moduleId, actionKey) {
    const avant = permsEffectifs(moduleId);
    const permissions = { ...avant, [actionKey]: !avant[actionKey] };
    const moduleLib = MODULES_PERMISSIONS.find(m => m.id === moduleId)?.lib || moduleId;
    const actionLib = ACTIONS_PERMISSIONS.find(a => a.key === actionKey)?.lib || actionKey;
    const accorde = permissions[actionKey];

    setExceptions(prev => {
      const existe = prev.some(e => e.module === moduleId);
      const ligne = {
        module: moduleId, peut_lire: permissions.read, peut_creer: permissions.create,
        peut_modifier: permissions.update, peut_supprimer: permissions.delete, peut_gerer: permissions.manage,
      };
      return existe ? prev.map(e => e.module === moduleId ? ligne : e) : [...prev, ligne];
    });

    try {
      const r = await fetch(`${API_URL}/api/admin/permissions-exceptions/${utilisateur.id}`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ module: moduleId, permissions }),
      });
      if (r.ok) {
        toast.success(
          `${accorde ? 'Droit accordé' : 'Droit retiré'} : "${actionLib}" sur "${moduleLib}" pour ${utilisateur.prenom} ${utilisateur.nom}`,
          { duration: 4000 }
        );
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || "Échec de l'enregistrement de la permission", { duration: 5000 });
        setExceptions(prev => {
          const existe = prev.some(e => e.module === moduleId);
          const ligne = {
            module: moduleId, peut_lire: avant.read, peut_creer: avant.create,
            peut_modifier: avant.update, peut_supprimer: avant.delete, peut_gerer: avant.manage,
          };
          return existe ? prev.map(e => e.module === moduleId ? ligne : e) : prev.filter(e => e.module !== moduleId);
        });
      }
    } catch {
      toast.error("Impossible de joindre le serveur", { duration: 5000 });
    }
  }

  const S = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
    modal: { background: COULEURS.blanc, borderRadius: 16, width: '90vw', height: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.28)', overflow: 'hidden' },
    header: { padding: '18px 24px', borderBottom: `1px solid ${COULEURS.gris200}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
    titre: { fontSize: 17, fontWeight: 800, color: COULEURS.navy },
    sous: { fontSize: 12, color: COULEURS.gris400, marginTop: 4, lineHeight: 1.5, maxWidth: 600 },
    btnX: { background: COULEURS.gris100, border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 16, color: COULEURS.gris600 },
    corps: { flex: 1, overflowY: 'auto', padding: 0 },
  };

  return (
    <div style={S.overlay} onClick={onFermer}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <div>
            <div style={S.titre}>🔑 Permissions - {utilisateur.prenom} {utilisateur.nom}</div>
            <div style={S.sous}>Rôle : {LIBELLES_ROLES[utilisateur.role] || utilisateur.role}. Décochez pour retirer un droit à cette personne, cochez pour lui en accorder un de plus - sans toucher aux autres utilisateurs du même rôle.</div>
          </div>
          <button style={S.btnX} onClick={onFermer}>×</button>
        </div>
        <div style={S.corps}>
          {chargement ? (
            <div style={{ textAlign: 'center', padding: 40, color: COULEURS.gris400 }}>⏳ Chargement…</div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: `2fr repeat(${ACTIONS_PERMISSIONS.length}, 1fr)`, padding: '13px 24px', background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris200}`, position: 'sticky', top: 0 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Module</span>
                {ACTIONS_PERMISSIONS.map(a => (
                  <span key={a.key} style={{ fontSize: 11.5, fontWeight: 700, color: COULEURS.gris600, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{a.lib}</span>
                ))}
              </div>
              {modulesRole.map((m, i) => {
                const p = permsEffectifs(m.id);
                const estException = exceptions.some(e => e.module === m.id);
                return (
                  <div key={m.id} style={{ display: 'grid', gridTemplateColumns: `2fr repeat(${ACTIONS_PERMISSIONS.length}, 1fr)`, padding: '14px 24px', alignItems: 'center', borderBottom: i < modulesRole.length - 1 ? `1px solid ${COULEURS.gris100}` : 'none', background: estException ? '#EEF2FF30' : 'transparent' }}>
                    <span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: COULEURS.navy, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{m.icone}</span> {m.lib}
                        {estException && <span style={{ fontSize: 10, fontWeight: 700, color: '#4338CA', background: '#EEF2FF', padding: '1px 7px', borderRadius: 10 }}>modifié</span>}
                      </span>
                      {m.desc && <span style={{ fontSize: 11.5, color: COULEURS.gris400, display: 'block', marginTop: 2, lineHeight: 1.4, maxWidth: 340 }}>{m.desc}</span>}
                    </span>
                    {ACTIONS_PERMISSIONS.map(a => {
                      const active = actionsActives(m.id).includes(a.key);
                      return (
                        <div key={a.key} style={{ display: 'flex', justifyContent: 'center' }}>
                          {active
                            ? <input type="checkbox" checked={p[a.key]} onChange={() => toggle(m.id, a.key)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                            : <span title="Aucune route ne vérifie ce droit" style={{ color: COULEURS.gris200, fontSize: 14 }}>-</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Formulaire création/édition d'utilisateur ────────────────────────────────
function ModalDetailUtilisateur({ utilisateur, onFermer, centres = [] }) {
  const u = utilisateur;
  const centre = centres.find(c => c.id === u.centre_id);
  const couleur = COULEUR_ROLE[u.role] || COULEURS.navy;

  const S = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
    modal: { background: COULEURS.blanc, borderRadius: 16, width: 480, maxWidth: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.28)', overflow: 'hidden' },
    header: { padding: '18px 24px', borderBottom: `1px solid ${COULEURS.gris200}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    btnX: { background: COULEURS.gris100, border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 16, color: COULEURS.gris600, flexShrink: 0 },
    corps: { flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 },
    ligne: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `1px solid ${COULEURS.gris100}` },
    label: { fontSize: 12, color: COULEURS.gris400, fontWeight: 600 },
    valeur: { fontSize: 13.5, color: COULEURS.navy, fontWeight: 600, textAlign: 'right' },
  };

  const champs = [
    { label: 'Email',        valeur: u.email || '-' },
    { label: 'Rôle',         valeur: LIBELLES_ROLES[u.role] || u.role },
    { label: 'Rôle réel (base de données)', valeur: u._roleBackend || '-' },
    { label: 'Département / filière', valeur: u.description || '-' },
    { label: 'Centre',       valeur: centre?.nom || (u.centre_id ? u.centre_id : 'National') },
    { label: 'Statut',       valeur: u.est_actif ? 'Actif' : 'Inactif' },
    { label: '2FA',          valeur: u.deux_facteurs ? '✓ Activée' : '✗ Désactivée' },
    { label: 'Accès e-learning', valeur: u.acces_elearning ? 'Oui' : 'Non' },
  ];

  if (estRole(u.role, 'professeur_titulaire') || estRole(u.role, 'professeur_remplacant')) {
    champs.push(
      { label: 'Certifications',    valeur: u.certifications?.length ? u.certifications.join(', ') : '-' },
      { label: "Années d'expérience", valeur: u.annees_experience ?? '-' },
      { label: 'Niveau anglais',    valeur: u.niveau_anglais || '-' },
    );
  }

  return (
    <div style={S.overlay} onClick={onFermer}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: couleur, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
              {u.initiales}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: COULEURS.navy }}>{u.prenom} {u.nom}</div>
              <div style={{ fontSize: 11.5, color: COULEURS.gris400 }}>Détail de l'utilisateur - lecture seule</div>
            </div>
          </div>
          <button style={S.btnX} onClick={onFermer}>×</button>
        </div>
        <div style={S.corps}>
          {champs.map((c, i) => (
            <div key={i} style={{ ...S.ligne, borderBottom: i < champs.length - 1 ? S.ligne.borderBottom : 'none' }}>
              <span style={S.label}>{c.label}</span>
              <span style={S.valeur}>{c.valeur}</span>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: COULEURS.gris400, background: COULEURS.gris50, borderRadius: 8, padding: '10px 12px', lineHeight: 1.5 }}>
            ℹ️ La modification de ce profil se fait désormais depuis dash.
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalUtilisateur({ utilisateur, onFermer, onSauvegarder, centres = [] }) {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const estProf = ROLES_PROF.includes(utilisateur?.role || 'admin_customer_care');
  const [onglet, setOnglet] = useState('infos');
  const [form, setForm] = useState(
    utilisateur
      ? { ...{ disponibilites: DISPO_DEFAUT, photo: null, cv: null, certifications: [], specialites: [], tranches_age: [], niveaux_enseignes: [], centre_id: '' }, ...utilisateur }
      : {
          // Infos de base
          prenom: '', nom: '', email: '', role: 'admin_customer_care',
          est_actif: true, deux_facteurs: false, description: '',
          // Centre BET
          centre_id: '',
          // Accès E-Learning
          acces_elearning: false, acces_cours: false, acces_tests: false,
          acces_ressources: false, acces_reporting: false, acces_classes: false,
          // Photo
          photo: null,
          // CV
          cv: null,
          // Infos personnelles (prof)
          telephone: '', date_naissance: '', nationalite: '', adresse: '', bio: '',
          // Certifications (prof)
          niveau_etudes: 'Master (Bac+5)',
          etablissement_formation: '',
          niveau_anglais: 'C2',
          annees_experience: '',
          certifications: [],
          date_debut_poste: '',
          type_contrat: 'Freelance',
          // Expériences (prof)
          specialites: [],
          tranches_age: [],
          niveaux_enseignes: [],
          etablissements_precedents: '',
          disponibilites: { ...DISPO_DEFAUT },
        }
  );

  const isProf = ROLES_PROF.includes(form.role);
  function ch(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function toggleItem(champ, val) {
    setForm(f => ({
      ...f,
      [champ]: f[champ]?.includes(val)
        ? f[champ].filter(x => x !== val)
        : [...(f[champ] || []), val],
    }));
  }
  function chDispo(jour, champ, val) {
    setForm(f => ({
      ...f,
      disponibilites: {
        ...(f.disponibilites || DISPO_DEFAUT),
        [jour]: { ...(f.disponibilites?.[jour] || DISPO_DEFAUT[jour]), [champ]: val },
      },
    }));
  }
  function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => ch('photo', ev.target.result);
    reader.readAsDataURL(file);
  }
  function handleCV(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    ch('cv', { nom: file.name, taille: file.size, type: file.type, url: URL.createObjectURL(file) });
  }
  const initiales = `${form.prenom?.[0] || ''}${form.nom?.[0] || ''}`.toUpperCase() || '?';
  const couleur = COULEUR_ROLE[form.role] || couleurTheme;
  const couleurProfil = form.couleur || couleur;
  const [hexInput, setHexInput] = useState(couleurProfil);

  function choisirCouleur(c) {
    ch('couleur', c);
    setHexInput(c);
  }
  function handleHexChange(e) {
    const v = e.target.value;
    setHexInput(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) ch('couleur', v);
  }

  const TABS = [
    { id: 'infos',   lib: 'Infos personnelles', icone: '👤' },
    ...(isProf ? [
      { id: 'certifs', lib: 'Certifications',     icone: '🎓' },
      { id: 'exp',     lib: 'Expériences',         icone: '💼' },
      { id: 'dispos',  lib: 'Disponibilités',      icone: '📅' },
    ] : []),
    { id: 'acces',   lib: 'Accès & Sécurité',   icone: '🔒' },
  ];

  const S = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(3px)' },
    modal: { background: COULEURS.gris50, borderRadius: 18, width: '90vw', maxWidth: '90vw', height: '90vh', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', overflow: 'hidden' },
    // Header
    header: { background: `linear-gradient(135deg, ${couleur}CC 0%, ${couleur} 100%)`, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 },
    headerTitre: { fontSize: 17, fontWeight: 800, color: '#fff' },
    headerSous: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 3 },
    btnX: { background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#fff' },
    // Tabs
    tabs: { display: 'flex', background: COULEURS.blanc, borderBottom: `1px solid ${COULEURS.gris200}`, padding: '0 16px', flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none' },
    tab: (a) => ({ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 14px', cursor: 'pointer', border: 'none', background: 'transparent', borderBottom: a ? `2px solid ${couleur}` : '2px solid transparent', color: a ? couleur : COULEURS.gris600, fontWeight: a ? 700 : 500, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', marginBottom: -1, whiteSpace: 'nowrap', flexShrink: 0 }),
    // Corps
    corps: { flex: 1, overflowY: 'auto', padding: 24 },
    // Champs
    grille2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 },
    groupe: { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 },
    label: { fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.04em' },
    input: { padding: '10px 13px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', color: COULEURS.navy, width: '100%', boxSizing: 'border-box' },
    select: { padding: '10px 13px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', color: COULEURS.navy, background: COULEURS.blanc, width: '100%', boxSizing: 'border-box' },
    textarea: { padding: '10px 13px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', color: COULEURS.navy, width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 80 },
    sepTitre: { fontSize: 11, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid ${COULEURS.gris200}` },
    // Chips multi-select
    chipsZone: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    chip: (sel) => ({ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: sel ? 700 : 400, cursor: 'pointer', border: `1.5px solid ${sel ? couleur : COULEURS.gris200}`, background: sel ? couleur : COULEURS.blanc, color: sel ? '#fff' : COULEURS.gris600, transition: 'all 0.12s' }),
    // Toggles
    toggleZone: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: COULEURS.blanc, borderRadius: 8, border: `1px solid ${COULEURS.gris200}`, marginBottom: 12 },
    toggle: (a) => ({ width: 44, height: 24, borderRadius: 12, background: a ? couleur : COULEURS.gris200, position: 'relative', cursor: 'pointer', border: 'none', outline: 'none', flexShrink: 0 }),
    toggleDot: (a) => ({ position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', left: a ? 23 : 3, transition: 'left 0.2s' }),
    // Photo
    photoZone: { display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20, padding: '16px 18px', background: COULEURS.blanc, borderRadius: 12, border: `1px solid ${COULEURS.gris200}` },
    avatarPhoto: { width: 80, height: 80, borderRadius: '50%', background: couleur + '20', border: `2.5px solid ${couleur}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, color: couleur, cursor: 'pointer', overflow: 'hidden', flexShrink: 0, position: 'relative' },
    // Planificateur
    ligneJour: (actif) => ({ display: 'grid', gridTemplateColumns: '90px 44px 1fr', gap: 10, alignItems: 'center', padding: '10px 14px', borderRadius: 8, background: actif ? couleur + '08' : COULEURS.blanc, border: `1px solid ${actif ? couleur + '40' : COULEURS.gris200}`, marginBottom: 6, transition: 'all 0.15s' }),
    jourNom: (actif) => ({ fontSize: 13, fontWeight: actif ? 700 : 500, color: actif ? COULEURS.navy : COULEURS.gris400 }),
    toggleJour: (actif) => ({ width: 36, height: 20, borderRadius: 10, background: actif ? couleur : COULEURS.gris200, position: 'relative', cursor: 'pointer', border: 'none', outline: 'none', flexShrink: 0, transition: 'background 0.2s' }),
    toggleJourDot: (actif) => ({ position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', left: actif ? 18 : 2, transition: 'left 0.2s' }),
    heureZone: { display: 'flex', alignItems: 'center', gap: 8 },
    selectHeure: (actif) => ({ padding: '6px 10px', borderRadius: 6, border: `1.5px solid ${actif ? couleur + '60' : COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', background: actif ? '#fff' : COULEURS.gris50, color: actif ? COULEURS.navy : COULEURS.gris400, cursor: actif ? 'pointer' : 'default' }),
    separateurHeure: { fontSize: 13, color: COULEURS.gris400, fontWeight: 600 },
    // Footer
    footer: { padding: '14px 24px', borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: COULEURS.blanc, flexShrink: 0 },
    stepInfo: { fontSize: 12, color: COULEURS.gris400 },
    btnRow: { display: 'flex', gap: 10 },
    btnAnn: { padding: '9px 18px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' },
    btnSauv: { padding: '9px 22px', borderRadius: 8, border: 'none', background: couleur, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' },
  };

  return (
    <div style={S.overlay} onClick={onFermer}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={S.headerTitre}>
              {utilisateur ? 'Modifier le profil' : isProf ? '👨‍🏫 Créer un profil Coach' : '＋ Créer un profil interne'}
            </div>
            <div style={S.headerSous}>
              {isProf ? 'Renseignez les informations pédagogiques complètes' : 'Accès et rôle sur la plateforme BET'}
            </div>
          </div>
          <button style={S.btnX} onClick={onFermer}>×</button>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          {TABS.map(t => (
            <button key={t.id} style={S.tab(onglet === t.id)} onClick={() => setOnglet(t.id)}>
              <span>{t.icone}</span><span>{t.lib}</span>
            </button>
          ))}
        </div>

        {/* Corps */}
        <div style={S.corps}>

          {/* ── INFOS PERSONNELLES ── */}
          {onglet === 'infos' && (
            <>
              {/* Photo de profil */}
              <div style={S.photoZone}>
                <div style={S.avatarPhoto} onClick={() => document.getElementById('input-photo-profil').click()}>
                  {form.photo
                    ? <img src={form.photo} alt="profil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span>{initiales}</span>
                  }
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', transition: 'background 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.35)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0)'}
                  >
                    <span style={{ fontSize: 18, opacity: 0, transition: 'opacity 0.2s' }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = 1; }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = 0; }}
                    >📷</span>
                  </div>
                </div>
                <input id="input-photo-profil" type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy, marginBottom: 4 }}>Photo de profil</div>
                  <div style={{ fontSize: 12, color: COULEURS.gris400, marginBottom: 10 }}>JPG, PNG ou WEBP · Max 2 Mo</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: couleur, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                      onClick={() => document.getElementById('input-photo-profil').click()}
                    >
                      📷 Choisir une photo
                    </button>
                    {form.photo && (
                      <button
                        style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.erreur, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                        onClick={() => ch('photo', null)}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div style={S.sepTitre}>Identité</div>
              <div style={S.grille2}>
                <div style={S.groupe}>
                  <label style={S.label}>Prénom *</label>
                  <input style={S.input} value={form.prenom} onChange={e => ch('prenom', e.target.value)} placeholder="Marie" />
                </div>
                <div style={S.groupe}>
                  <label style={S.label}>Nom *</label>
                  <input style={S.input} value={form.nom} onChange={e => ch('nom', e.target.value)} placeholder="Dupont" />
                </div>
              </div>

              <div style={S.groupe}>
                <label style={S.label}>Email professionnel *</label>
                <input style={S.input} type="email" value={form.email} onChange={e => ch('email', e.target.value)} placeholder="prenom.nom@bet.ci" />
              </div>

              {isProf && (
                <div style={S.grille2}>
                  <div style={S.groupe}>
                    <label style={S.label}>Téléphone</label>
                    <input style={S.input} value={form.telephone} onChange={e => ch('telephone', e.target.value)} placeholder="+225 07 00 00 00 00" />
                  </div>
                  <div style={S.groupe}>
                    <label style={S.label}>Date de naissance</label>
                    <input style={S.input} type="date" value={form.date_naissance} onChange={e => ch('date_naissance', e.target.value)} />
                  </div>
                </div>
              )}

              {isProf && (
                <div style={S.grille2}>
                  <div style={S.groupe}>
                    <label style={S.label}>Nationalité</label>
                    <input style={S.input} value={form.nationalite} onChange={e => ch('nationalite', e.target.value)} placeholder="Française" />
                  </div>
                  <div style={S.groupe}>
                    <label style={S.label}>Ville / Adresse</label>
                    <input style={S.input} value={form.adresse} onChange={e => ch('adresse', e.target.value)} placeholder="Cocody, Abidjan" />
                  </div>
                </div>
              )}

              <div style={S.sepTitre}>Rôle & Poste</div>
              <div style={S.groupe}>
                <label style={S.label}>Rôle BET *</label>
                {isProf ? (
                  /* "professeur_remplacant" retiré (non utilisé actuellement) - un seul profil coach */
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                    {[
                      {
                        role: 'professeur_titulaire',
                        icone: '👨‍🏫',
                        label: 'Coach Titulaire',
                        desc: 'Coach permanent avec ses propres groupes, programme et planning',
                        couleur: '#0D9488',
                        fond: '#F0FDFA',
                        bord: '#99F6E4',
                      },
                    ].map(opt => {
                      const selectionne = form.role === opt.role;
                      return (
                        <button key={opt.role} type="button"
                          onClick={() => { ch('role', opt.role); setOnglet('infos'); }}
                          style={{ padding: '14px 12px', borderRadius: 12, border: `2px solid ${selectionne ? opt.couleur : opt.bord}`, background: selectionne ? opt.fond : COULEURS.blanc, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', outline: 'none', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                          <div style={{ fontSize: 22, marginBottom: 6 }}>{opt.icone}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: selectionne ? opt.couleur : COULEURS.navy, marginBottom: 4 }}>{opt.label}</div>
                          <div style={{ fontSize: 11, color: COULEURS.gris400, lineHeight: 1.4 }}>{opt.desc}</div>
                          {selectionne && (
                            <div style={{ marginTop: 8, fontSize: 10, fontWeight: 700, color: opt.couleur, background: opt.couleur + '20', display: 'inline-block', padding: '2px 8px', borderRadius: 20 }}>
                              ✓ Sélectionné
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <select style={S.select} value={form.role} onChange={e => { ch('role', e.target.value); setOnglet('infos'); }}>
                    <optgroup label="── Administration BET">
                      {ROLES_ADMIN.map(r => <option key={r} value={r}>{LIBELLES_ROLES[r]}</option>)}
                    </optgroup>
                    <optgroup label="── Corps enseignant">
                      {ROLES_PROF.map(r => <option key={r} value={r}>{LIBELLES_ROLES[r]}</option>)}
                    </optgroup>
                  </select>
                )}
              </div>

              <div style={S.groupe}>
                <label style={S.label}>Description / Poste</label>
                <input style={S.input} value={form.description} onChange={e => ch('description', e.target.value)}
                  placeholder={isProf ? 'Ex : Professeure titulaire · Groupes enfants & ados' : 'Ex : Manager BET · Pilotage global'} />
              </div>

              {!isProf && (
                <div style={S.groupe}>
                  <label style={S.label}>
                    Centre BET
                    {estRole(form.role, 'admin_elearning') && (
                      <span style={{ color: '#EF4444', marginLeft: 4 }}>*</span>
                    )}
                  </label>
                  <select
                    style={{
                      ...S.select,
                      borderColor: estRole(form.role, 'admin_elearning') && !form.centre_id ? '#FCA5A5' : undefined,
                      background: estRole(form.role, 'admin_elearning') && !form.centre_id ? '#FFF5F5' : undefined,
                    }}
                    value={form.centre_id}
                    onChange={e => ch('centre_id', e.target.value)}
                  >
                    <option value="">
                      {estRole(form.role, 'admin_elearning') ? '- Sélectionner un centre (obligatoire) -' : '- Accès national (tous les centres) -'}
                    </option>
                    {centres.map(c => (
                      <option key={c.id} value={c.id}>{c.nom} · {c.ville}</option>
                    ))}
                  </select>
                  {estRole(form.role, 'admin_elearning') && !form.centre_id && (
                    <div style={{ fontSize: 11, color: '#DC2626', marginTop: 4 }}>
                      ⚠️ Un centre est requis pour le rôle Assistant E-Learning.
                    </div>
                  )}
                  {form.centre_id && (
                    <div style={{ fontSize: 11, color: COULEURS.succes, marginTop: 4 }}>
                      ✅ Accès limité au centre sélectionné.
                    </div>
                  )}
                  {!form.centre_id && !estRole(form.role, 'admin_elearning') && (
                    <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 4 }}>
                      Laissez vide pour un accès national (tous les centres).
                    </div>
                  )}
                </div>
              )}

              {isProf && (
                <div style={S.groupe}>
                  <label style={S.label}>Biographie / Présentation</label>
                  <textarea style={S.textarea} value={form.bio} onChange={e => ch('bio', e.target.value)}
                    placeholder="Présentez brièvement le profil du coach : parcours, approche pédagogique, points forts…" />
                </div>
              )}
            </>
          )}

          {/* ── CERTIFICATIONS ── */}
          {onglet === 'certifs' && isProf && (
            <>
              <div style={S.sepTitre}>Formation académique</div>
              <div style={S.grille2}>
                <div style={S.groupe}>
                  <label style={S.label}>Niveau d'études</label>
                  <select style={S.select} value={form.niveau_etudes} onChange={e => ch('niveau_etudes', e.target.value)}>
                    {['Licence (Bac+3)', 'Master (Bac+5)', 'Doctorat (Bac+8)', 'Autre'].map(n => <option key={n}>{n}</option>)}
                  </select>
                </div>
                <div style={S.groupe}>
                  <label style={S.label}>Établissement de formation</label>
                  <input style={S.input} value={form.etablissement_formation} onChange={e => ch('etablissement_formation', e.target.value)} placeholder="Université de..." />
                </div>
              </div>

              <div style={S.grille2}>
                <div style={S.groupe}>
                  <label style={S.label}>Niveau d'anglais certifié</label>
                  <select style={S.select} value={form.niveau_anglais} onChange={e => ch('niveau_anglais', e.target.value)}>
                    <option value="C1">C1 - Avancé</option>
                    <option value="C2">C2 - Maîtrise</option>
                    <option value="Natif">Natif / Bilingue</option>
                  </select>
                </div>
                <div style={S.groupe}>
                  <label style={S.label}>Date de prise de poste</label>
                  <input style={S.input} type="date" value={form.date_debut_poste} onChange={e => ch('date_debut_poste', e.target.value)} />
                </div>
              </div>

              {/* ── Type de contrat ── */}
              <div style={{ marginBottom: 18 }}>
                <div style={S.sepTitre}>Type de contrat BET</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['Freelance', 'Consultant', 'Stagiaire', 'Permanent'].map(type => {
                    const CFG = {
                      Freelance:  { bg: '#FEF3C7', txt: '#92400E', sel_bg: '#F59E0B', icone: '🔖' },
                      Consultant: { bg: '#EDE9FE', txt: '#5B21B6', sel_bg: '#7C3AED', icone: '💼' },
                      Stagiaire:  { bg: '#DBEAFE', txt: '#1D4ED8', sel_bg: '#2563EB', icone: '🎓' },
                      Permanent:  { bg: '#D1FAE5', txt: '#065F46', sel_bg: '#059669', icone: '🏢' },
                    }[type];
                    const selec = form.type_contrat === type;
                    return (
                      <button key={type} type="button" onClick={() => ch('type_contrat', type)}
                        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: 700, fontSize: 13, border: `2px solid ${selec ? CFG.sel_bg : COULEURS.gris200}`, background: selec ? CFG.sel_bg : CFG.bg, color: selec ? '#fff' : CFG.txt, transition: 'all 0.15s' }}>
                        <span>{CFG.icone}</span> {type}
                        {selec && <span style={{ fontSize: 11 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
                {form.type_contrat && (
                  <div style={{ marginTop: 10, fontSize: 12, color: COULEURS.gris400 }}>
                    {{
                      Freelance:  'Prestataire indépendant · facturation à la séance ou mensuelle',
                      Consultant: 'Mission définie · contrat de prestation de services',
                      Stagiaire:  'Stage rémunéré · encadrement pédagogique inclus',
                      Permanent:  'Salarié BET · CDI avec fiche de paie mensuelle',
                    }[form.type_contrat]}
                  </div>
                )}
              </div>

              <div style={S.sepTitre}>Certifications pédagogiques</div>
              <div style={S.groupe}>
                <label style={S.label}>Certifications obtenues (sélection multiple)</label>
                <div style={S.chipsZone}>
                  {CERTIFS_DISPO.map(c => (
                    <button key={c} style={S.chip((form.certifications || []).includes(c))} onClick={() => toggleItem('certifications', c)}>
                      {(form.certifications || []).includes(c) ? '✓ ' : ''}{c}
                    </button>
                  ))}
                </div>
              </div>

              {(form.certifications || []).length > 0 && (
                <div style={{ background: '#D1FAE5', borderRadius: 8, padding: '10px 14px', marginTop: 8, fontSize: 12, color: '#065F46', fontWeight: 600 }}>
                  ✅ {form.certifications.length} certification{form.certifications.length > 1 ? 's' : ''} sélectionnée{form.certifications.length > 1 ? 's' : ''} : {form.certifications.join(', ')}
                </div>
              )}

              <div style={S.sepTitre}>Curriculum Vitae</div>
              <input id="input-cv-prof" type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }} onChange={handleCV} />
              <div style={{ background: COULEURS.blanc, borderRadius: 12, border: `1.5px dashed ${form.cv ? couleur : COULEURS.gris200}`, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 32 }}>📄</div>
                <div style={{ flex: 1 }}>
                  {form.cv ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 2 }}>{form.cv.nom}</div>
                      <div style={{ fontSize: 11, color: COULEURS.gris400 }}>{(form.cv.taille / 1024).toFixed(0)} Ko</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, color: COULEURS.navy, marginBottom: 2 }}>Aucun CV importé</div>
                      <div style={{ fontSize: 11, color: COULEURS.gris400 }}>PDF, DOC ou DOCX · Max 5 Mo</div>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {form.cv && (
                    <a href={form.cv.url} target="_blank" rel="noreferrer"
                      style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${couleur}`, background: couleur + '12', color: couleur, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                      👁 Voir
                    </a>
                  )}
                  <button onClick={() => document.getElementById('input-cv-prof').click()}
                    style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: couleur, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                    {form.cv ? '🔄 Remplacer' : '📤 Importer le CV'}
                  </button>
                  {form.cv && (
                    <button onClick={() => ch('cv', null)}
                      style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.rouge, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── EXPÉRIENCES ── */}
          {onglet === 'exp' && isProf && (
            <>
              <div style={S.sepTitre}>Expérience d'enseignement</div>
              <div style={S.grille2}>
                <div style={S.groupe}>
                  <label style={S.label}>Années d'expérience</label>
                  <input style={S.input} type="number" min="0" max="50" value={form.annees_experience}
                    onChange={e => ch('annees_experience', e.target.value)} placeholder="Ex : 5" />
                </div>
                <div style={S.groupe}>
                  <label style={S.label}>Établissements précédents</label>
                  <input style={S.input} value={form.etablissements_precedents}
                    onChange={e => ch('etablissements_precedents', e.target.value)} placeholder="British Council, Alliance Française…" />
                </div>
              </div>

              <div style={S.sepTitre}>Domaines de spécialité</div>
              <div style={S.groupe}>
                <label style={S.label}>Spécialités (sélection multiple)</label>
                <select
                  multiple
                  value={form.specialites || []}
                  onChange={e => ch('specialites', Array.from(e.target.selectedOptions, o => o.value))}
                  style={{ ...S.select, height: 160, padding: '4px 8px' }}
                >
                  {SPECIALITES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {(form.specialites || []).length > 0 && (
                  <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 4 }}>
                    ✅ {form.specialites.length} spécialité{form.specialites.length > 1 ? 's' : ''} : {form.specialites.join(', ')}
                  </div>
                )}
              </div>

              <div style={S.groupe}>
                <label style={S.label}>Tranches d'âge enseignées</label>
                <div style={S.chipsZone}>
                  {TRANCHES.map(t => (
                    <button key={t} style={S.chip((form.tranches_age || []).includes(t))} onClick={() => toggleItem('tranches_age', t)}>
                      {(form.tranches_age || []).includes(t) ? '✓ ' : ''}{t}
                    </button>
                  ))}
                </div>
              </div>

              <div style={S.groupe}>
                <label style={S.label}>Niveaux CECR enseignés</label>
                <select
                  multiple
                  value={form.niveaux_enseignes || []}
                  onChange={e => ch('niveaux_enseignes', Array.from(e.target.selectedOptions, o => o.value))}
                  style={{ ...S.select, height: 130, padding: '4px 8px' }}
                >
                  {NIVEAUX_ENS.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                {(form.niveaux_enseignes || []).length > 0 && (
                  <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 4 }}>
                    ✅ {form.niveaux_enseignes.join(', ')} sélectionné{form.niveaux_enseignes.length > 1 ? 's' : ''}
                  </div>
                )}
              </div>

            </>
          )}

          {/* ── DISPONIBILITÉS ── */}
          {onglet === 'dispos' && isProf && (
            <>
              <div style={S.sepTitre}>Disponibilités hebdomadaires</div>
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#EFF6FF', borderRadius: 10, fontSize: 12, color: '#1E40AF', lineHeight: 1.6 }}>
                📅 Activez les jours disponibles et définissez les plages horaires. Ces informations seront utilisées pour l'affectation des groupes et la planification des sessions.
              </div>
              {JOURS_SEMAINE.map(({ id, lib }) => {
                const dispo = form.disponibilites?.[id] || DISPO_DEFAUT[id];
                return (
                  <div key={id} style={S.ligneJour(dispo.actif)}>
                    <span style={S.jourNom(dispo.actif)}>{lib}</span>
                    <button style={S.toggleJour(dispo.actif)} onClick={() => chDispo(id, 'actif', !dispo.actif)}>
                      <span style={S.toggleJourDot(dispo.actif)} />
                    </button>
                    <div style={S.heureZone}>
                      <select style={S.selectHeure(dispo.actif)} value={dispo.debut} disabled={!dispo.actif} onChange={e => chDispo(id, 'debut', e.target.value)}>
                        {HEURES.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <span style={S.separateurHeure}>→</span>
                      <select style={S.selectHeure(dispo.actif)} value={dispo.fin} disabled={!dispo.actif} onChange={e => chDispo(id, 'fin', e.target.value)}>
                        {HEURES.filter(h => h > dispo.debut).map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      {dispo.actif && (
                        <span style={{ fontSize: 11, color: COULEURS.succes, fontWeight: 600, marginLeft: 4 }}>
                          {Math.round((parseInt(dispo.fin) - parseInt(dispo.debut)) || 0)}h
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Récap jours actifs */}
              {Object.entries(form.disponibilites || {}).some(([, d]) => d.actif) ? (
                <div style={{ marginTop: 14, padding: '10px 14px', background: '#D1FAE5', borderRadius: 10, fontSize: 12, color: '#065F46', fontWeight: 600 }}>
                  ✅ Disponible : {JOURS_SEMAINE.filter(j => form.disponibilites?.[j.id]?.actif).map(j => {
                    const d = form.disponibilites[j.id];
                    return `${j.lib} ${d.debut}→${d.fin}`;
                  }).join(' · ')}
                </div>
              ) : (
                <div style={{ marginTop: 14, padding: '10px 14px', background: COULEURS.gris50, borderRadius: 10, fontSize: 12, color: COULEURS.gris400, fontStyle: 'italic' }}>
                  Aucun créneau activé - le coach sera affiché comme non disponible.
                </div>
              )}
            </>
          )}

          {/* ── ACCÈS & SÉCURITÉ ── */}
          {onglet === 'acces' && (
            <>
              <div style={S.sepTitre}>Paramètres de connexion</div>
              <div style={S.toggleZone}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COULEURS.navy }}>Compte actif</div>
                  <div style={{ fontSize: 12, color: COULEURS.gris400 }}>L'utilisateur peut se connecter à la plateforme</div>
                </div>
                <button style={S.toggle(form.est_actif)} onClick={() => ch('est_actif', !form.est_actif)}>
                  <span style={S.toggleDot(form.est_actif)} />
                </button>
              </div>
              <div style={S.toggleZone}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COULEURS.navy }}>Authentification 2FA</div>
                  <div style={{ fontSize: 12, color: COULEURS.gris400 }}>Double authentification à chaque connexion</div>
                </div>
                <button style={S.toggle(form.deux_facteurs)} onClick={() => ch('deux_facteurs', !form.deux_facteurs)}>
                  <span style={S.toggleDot(form.deux_facteurs)} />
                </button>
              </div>

              {/* ── Accès E-Learning ── */}
              <div style={S.sepTitre}>Accès E-Learning</div>

              <div style={{ ...S.toggleZone, background: form.acces_elearning ? couleur + '08' : '#FFF5F5', border: `1.5px solid ${form.acces_elearning ? couleur + '40' : '#FECACA'}`, marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: form.acces_elearning ? couleur + '20' : '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    {form.acces_elearning ? '🎓' : '🚫'}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy }}>Accès à la plateforme E-Learning</div>
                    <div style={{ fontSize: 11, color: form.acces_elearning ? COULEURS.gris400 : '#DC2626', marginTop: 2 }}>
                      {form.acces_elearning
                        ? 'Cet utilisateur peut se connecter à bet-elearning'
                        : 'Connexion bloquée - un message s\'affichera à la tentative de connexion'}
                    </div>
                  </div>
                </div>
                <button style={S.toggle(form.acces_elearning)} onClick={() => ch('acces_elearning', !form.acces_elearning)}>
                  <span style={S.toggleDot(form.acces_elearning)} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Couleur du dashboard */}
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${COULEURS.gris100}` }}>
          <div style={{ border: `1px solid ${COULEURS.gris200}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: COULEURS.navy, background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris100}` }}>
              🎨 Couleur du dashboard
            </div>
            {/* Aperçu header */}
            <div style={{ background: `linear-gradient(135deg, ${couleurProfil}CC 0%, ${couleurProfil} 100%)`, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>
                  {initiales}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
                    {form.prenom || 'Prénom'} {form.nom || 'Nom'}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)' }}>
                    {LIBELLES_ROLES[form.role] || form.role}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
                <span>Tableau de bord</span>
                <span>Messages</span>
                <span style={{ fontWeight: 700, color: '#fff' }}>Actif</span>
              </div>
            </div>
            {/* Palette */}
            <div style={{ padding: '14px 16px', background: COULEURS.blanc }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {PALETTE_THEME.map(c => (
                  <button key={c} onClick={() => choisirCouleur(c)} style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: couleurProfil === c ? `3px solid ${COULEURS.navy}` : '2.5px solid transparent', outline: couleurProfil === c ? `2px solid ${c}` : 'none', cursor: 'pointer', flexShrink: 0, transition: 'transform 0.1s', transform: couleurProfil === c ? 'scale(1.15)' : 'scale(1)' }} />
                ))}
              </div>
              {/* Hex input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: /^#[0-9a-fA-F]{6}$/.test(hexInput) ? hexInput : couleurProfil, border: `1px solid ${COULEURS.gris200}`, flexShrink: 0 }} />
                <input
                  value={hexInput}
                  onChange={handleHexChange}
                  maxLength={7}
                  placeholder="Code hexadécimal personnalisé"
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', color: COULEURS.navy, maxWidth: 180 }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <span style={S.stepInfo}>
            {TABS.findIndex(t => t.id === onglet) + 1} / {TABS.length} - {TABS.find(t => t.id === onglet)?.lib}
          </span>
          <div style={S.btnRow}>
            <button style={S.btnAnn} onClick={onFermer}>Annuler</button>
            <button style={S.btnSauv} onClick={() => onSauvegarder(form)}>
              {utilisateur ? 'Enregistrer' : 'Créer le profil'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Composant principal ──────────────────────────────────────────────────────
export default function GestionDroits() {
  const { couleurTheme } = useTheme();
  const alerte = useAlerte();
  const navigate = useNavigate();
  const [users,       setUsers]       = useState([]);
  const [chargement,  setChargement]  = useState(true);
  const [erreurChargement, setErreurChargement] = useState(null);
  const [centres,     setCentres]     = useState([]);
  const [alertesSec48h, setAlertesSec48h] = useState(0);
  const [accesTemporaires, setAccesTemporaires] = useState(0);
  const [activiteRecente,  setActiviteRecente]  = useState([]);
  const [onglet, setOnglet]               = useState('overview');
  const [modalOuvert, setModalOuvert]     = useState(false);
  const [userEdite, setUserEdite]         = useState(null);
  const [userDetail, setUserDetail]       = useState(null);
  const [exceptionsUser, setExceptionsUser] = useState(null);
  const [recherche, setRecherche]         = useState('');
  const [filtreRole, setFiltreRole]       = useState('tous');
  const [filtreStatut, setFiltreStatut]   = useState('tous');
  // ── Matrice de permissions réelle (permissions_roles, côté serveur) ──
  const [matrice, setMatrice]                 = useState({});
  const [matriceOriginale, setMatriceOriginale] = useState({});
  const [matriceChargement, setMatriceChargement] = useState(true);
  const [roleSelectionnePhysique, setRoleSelectionnePhysique] = useState(PHYSICAL_ROLES[0].id);
  const [matriceSaving, setMatriceSaving]     = useState(false);
  const [matriceSauvee,   setMatriceSauvee]   = useState(false);

  const chargerMatrice = useCallback(async () => {
    setMatriceChargement(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/permissions-matrice`, { headers: authHeaders() });
      if (r.ok) {
        const d = await r.json();
        setMatrice(d.matrice || {});
        setMatriceOriginale(d.matrice || {});
      }
    } catch {}
    finally { setMatriceChargement(false); }
  }, []);

  useEffect(() => { chargerMatrice(); }, [chargerMatrice]);

  const matriceModifiee = JSON.stringify(matrice[roleSelectionnePhysique] || {}) !== JSON.stringify(matriceOriginale[roleSelectionnePhysique] || {});

  // ── Chargement depuis la vraie BDD ──────────────────────────
  const chargerUsers = useCallback(async () => {
    setChargement(true);
    setErreurChargement(null);
    try {
      const r = await fetch(`${API_URL}/api/admin/utilisateurs`, { headers: authHeaders() });
      if (r.ok) {
        const d = await r.json();
        setUsers((d.utilisateurs || []).map(mapUser));
      } else {
        const msg = r.status === 401 || r.status === 403
          ? 'Accès non autorisé. Vérifiez votre session.'
          : `Erreur serveur (${r.status})`;
        setErreurChargement(msg);
      }
    } catch (e) {
      setErreurChargement('Impossible de joindre le serveur. Vérifiez que le backend est démarré.');
    }
    finally { setChargement(false); }
  }, []);

  useEffect(() => { chargerUsers(); }, [chargerUsers]);

  useEffect(() => {
    fetch(`${API_URL}/api/centres`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { centres: [] })
      .then(d => setCentres(d.centres || []))
      .catch(() => {});
  }, []);

  // Vue d'ensemble - données réelles (remplace les KPI figés à 0/1 et le flux d'activité mocké)
  useEffect(() => {
    const depuis48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    Promise.all([
      fetch(`${API_URL}/api/audit/logs?plateforme=bet-elearning&statut=danger&date_debut=${encodeURIComponent(depuis48h)}&limit=1`, { headers: authHeaders() })
        .then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API_URL}/api/remplacements/delegations/actives`, { headers: authHeaders() })
        .then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API_URL}/api/audit/logs?plateforme=bet-elearning&limit=6`, { headers: authHeaders() })
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([danger, deleg, recents]) => {
      if (danger) setAlertesSec48h(danger.total || 0);
      if (deleg)  setAccesTemporaires(deleg.total || 0);
      if (recents) setActiviteRecente(recents.logs || []);
    });
  }, []);

  // Périmètre bet-elearning uniquement - un compte "dash" sans acces_elearning
  // ne doit apparaître nulle part sur cette page (stats, répartition, badges…).
  const usersElearning = users.filter((u) => u.acces_elearning);

  const actifs        = usersElearning.filter((u) => u.est_actif).length;
  const sans2FA       = usersElearning.filter((u) => !u.deux_facteurs).length;
  // Proxy réel de "connexion active" : dernière connexion il y a moins de 15 min (aucun
  // tracker de session live n'existe côté backend, c'est le signal le plus proche disponible).
  const connexionsActives = usersElearning.filter((u) => {
    if (!u.derniere_connexion) return false;
    return (Date.now() - new Date(u.derniere_connexion).getTime()) < 15 * 60 * 1000;
  }).length;

  const repartition = TOUS_ROLES.map((r) => ({
    role: r, libelle: LIBELLES_ROLES[r],
    count: usersElearning.filter((u) => u.role === r).length,
    couleur: COULEUR_ROLE[r],
  })).filter((r) => r.count > 0);

  const usersFiltres = usersElearning
    .filter((u) => filtreRole === 'tous' || u.role === filtreRole)
    .filter((u) =>
      filtreStatut === 'tous' ||
      (filtreStatut === 'actif' && u.est_actif) ||
      (filtreStatut === 'inactif' && !u.est_actif) ||
      (filtreStatut === '2fa_on' && u.deux_facteurs) ||
      (filtreStatut === '2fa_off' && !u.deux_facteurs)
    )
    .filter((u) =>
      recherche === '' ||
      `${u.prenom} ${u.nom} ${u.email}`.toLowerCase().includes(recherche.toLowerCase())
    );

  function ouvrirEdition(u) { setUserEdite(u); setModalOuvert(true); }
  function fermerModal()    { setModalOuvert(false); setUserEdite(null); }

  const [activation2FA, setActivation2FA] = useState(null); // id de l'utilisateur en cours de bascule

  // Bascule la 2FA pour un utilisateur (activer OU désactiver) : ne configure pas de TOTP à sa
  // place (l'enrôlement se fait par l'utilisateur lui-même à sa prochaine connexion, via
  // LoginAdmin.jsx qui gère déjà le flow requires_enrollment de adminRoutes.js) - ici on rend
  // l'authentification à deux facteurs obligatoire (ou non) pour son compte.
  async function toggleDeuxFA(u) {
    const nouvelEtat = !u.deux_facteurs;
    setActivation2FA(u.id);
    try {
      const r = await fetch(`${API_URL}/api/admin/utilisateurs/${u.id}`, {
        method: 'PATCH', headers: authHeaders(),
        body: JSON.stringify({ twofa_active: nouvelEtat }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        await alerte(`Erreur ${r.status} : ${err.error || `Impossible de ${nouvelEtat ? 'activer' : 'désactiver'} la 2FA`}`, { danger: true });
        return;
      }
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, deux_facteurs: nouvelEtat } : x));
      await alerte(nouvelEtat
        ? `2FA activée pour ${u.prenom} ${u.nom} - un code d'authentification lui sera demandé à sa prochaine connexion.`
        : `2FA désactivée pour ${u.prenom} ${u.nom}.`);
    } catch (e) {
      await alerte('Impossible de joindre le serveur.', { danger: true });
    } finally {
      setActivation2FA(null);
    }
  }

  async function sauvegarder(form) {
    if (estRole(form.role, 'admin_elearning') && !form.centre_id) {
      await alerte('Veuillez sélectionner un centre pour le rôle Assistant E-Learning.', { danger: true });
      return;
    }
    const scope = form.centre_id ? [form.centre_id] : ['national'];
    try {
      let r;
      if (userEdite) {
        r = await fetch(`${API_URL}/api/admin/utilisateurs/${userEdite.id}`, {
          method: 'PATCH', headers: authHeaders(),
          body: JSON.stringify({
            nom: form.nom, prenom: form.prenom, telephone: form.telephone,
            departement: form.description, role: form.role,
            scope,
            actif: form.est_actif, twofa_active: form.deux_facteurs,
            acces_elearning: form.acces_elearning,
            acces_cours: form.acces_cours, acces_tests: form.acces_tests,
            acces_ressources: form.acces_ressources, acces_reporting: form.acces_reporting,
            acces_classes: form.acces_classes,
            couleur: form.couleur,
            ...(ROLES_PROF.includes(form.role) ? { type_coach: form.role, role: 'coach' } : {}),
          }),
        });
      } else {
        r = await fetch(`${API_URL}/api/admin/utilisateurs`, {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({
            nom: form.nom, prenom: form.prenom, email: form.email,
            role: form.role, departement: form.description,
            scope,
            actif: form.est_actif, twofa_active: form.deux_facteurs,
            acces_elearning: form.acces_elearning,
            acces_cours: form.acces_cours, acces_tests: form.acces_tests,
            acces_ressources: form.acces_ressources, acces_reporting: form.acces_reporting,
            acces_classes: form.acces_classes,
            couleur: form.couleur,
            source: 'bet_elearning',
          }),
        });
      }
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        await alerte(`Erreur ${r.status} : ${err.error || err.detail || 'Erreur serveur'}`, { danger: true });
        return;
      }
      // Persister le type coach en localStorage si c'est un professeur
      const userId = userEdite?.id;
      if (userId && ROLES_PROF.includes(form.role)) {
        localStorage.setItem(`bet_coach_type_${userId}`, form.role);
      }
      fermerModal();
      chargerUsers();
    } catch (e) {
      await alerte(`Erreur réseau : ${e.message}`, { danger: true });
    }
  }

  async function toggleElearning(id) {
    const u = users.find(x => x.id === id);
    if (!u) return;
    const nouvel = !u.acces_elearning;
    setUsers(prev => prev.map(x => x.id === id ? { ...x, acces_elearning: nouvel } : x));
    try {
      const r = await fetch(`${API_URL}/api/admin/utilisateurs/${id}`, {
        method: 'PATCH', headers: authHeaders(),
        body: JSON.stringify({ acces_elearning: nouvel }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
    } catch {
      setUsers(prev => prev.map(x => x.id === id ? { ...x, acces_elearning: !nouvel } : x));
    }
  }

  async function toggleActif(id) {
    const u = users.find(x => x.id === id);
    if (!u) return;
    const nouvel = !u.est_actif;
    setUsers(prev => prev.map(x => x.id === id ? { ...x, est_actif: nouvel } : x));
    try {
      const r = await fetch(`${API_URL}/api/admin/utilisateurs/${id}`, {
        method: 'PATCH', headers: authHeaders(),
        body: JSON.stringify({ actif: nouvel }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
    } catch {
      setUsers(prev => prev.map(x => x.id === id ? { ...x, est_actif: !nouvel } : x));
    }
  }

  const stats = [
    { label: 'Utilisateurs totaux',  valeur: chargement ? '…' : usersElearning.length, couleur: COULEURS.blanc },
    { label: 'Comptes actifs',        valeur: chargement ? '…' : actifs,       couleur: COULEURS.succes },
    { label: 'Sans 2FA',              valeur: chargement ? '…' : sans2FA,      couleur: '#F87171' },
    { label: 'Alertes sécurité',      valeur: chargement ? '…' : alertesSec48h, couleur: '#FBBF24' },
  ];

  const ONGLETS = [
    { id: 'overview',     libelle: 'Vue d\'ensemble',         icone: '📊' },
    { id: 'utilisateurs', libelle: 'Utilisateurs',            icone: '👥', badge: chargement ? null : usersElearning.length },
    { id: 'matrice',      libelle: 'Matrice des permissions', icone: '🛡️' },
  ];

  const S = {
    page: { padding: 32, fontFamily: '"Plus Jakarta Sans", sans-serif', minHeight: '100%' },
    // ── En-tête de page ──
    pageHeader: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      marginBottom: 28,
    },
    pageTitre: { fontSize: 22, fontWeight: 800, color: COULEURS.navy, marginBottom: 4 },
    pageSousTitre: { fontSize: 13, color: COULEURS.gris400 },
    btnActions: { display: 'flex', gap: 12 },
    btnSecondaire: {
      padding: '9px 18px', borderRadius: 8,
      border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc,
      color: COULEURS.gris600, cursor: 'pointer', fontSize: 13, fontWeight: 600,
      fontFamily: '"Plus Jakarta Sans", sans-serif', display: 'flex', alignItems: 'center', gap: 6,
    },
    btnPrimaire: {
      padding: '9px 20px', borderRadius: 8, border: 'none',
      background: couleurTheme, color: COULEURS.blanc,
      cursor: 'pointer', fontSize: 13, fontWeight: 700,
      fontFamily: '"Plus Jakarta Sans", sans-serif', display: 'flex', alignItems: 'center', gap: 6,
    },
    // ── Sous-onglets ──
    sousOnglets: {
      display: 'flex', gap: 4, marginBottom: 28,
      borderBottom: `2px solid ${COULEURS.gris200}`,
    },
    tabSous: (actif) => ({
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '10px 18px', cursor: 'pointer',
      border: 'none', background: 'transparent',
      borderBottom: actif ? `2px solid ${couleurTheme}` : '2px solid transparent',
      color: actif ? couleurTheme : COULEURS.gris600,
      fontWeight: actif ? 700 : 500, fontSize: 13,
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      marginBottom: -2, transition: 'all 0.15s',
    }),
    tabBadge: (actif) => ({
      background: actif ? couleurTheme : COULEURS.gris200,
      color: actif ? COULEURS.blanc : COULEURS.gris600,
      borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700,
    }),
    // ── KPI cards ──
    grilleKpi: {
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 16, marginBottom: 32,
    },
    carteKpi: (alerte) => ({
      background: COULEURS.blanc, borderRadius: 12, padding: '18px 20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      border: `1px solid ${alerte ? '#FECACA' : COULEURS.gris200}`,
      background: alerte ? '#FFF5F5' : COULEURS.blanc,
    }),
    kpiIcn: { fontSize: 20, marginBottom: 8 },
    kpiLbl: { fontSize: 11, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 },
    kpiVal: (couleur) => ({
      fontSize: 28, fontWeight: 800, color: couleur || COULEURS.navy, lineHeight: 1, marginBottom: 4,
    }),
    kpiSub: { fontSize: 11, color: COULEURS.gris400 },
    // ── Layout 2 colonnes ──
    deuxColonnes: {
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 8,
    },
    section: {
      background: COULEURS.blanc, borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `1px solid ${COULEURS.gris200}`,
    },
    sectionHeader: {
      padding: '16px 20px', borderBottom: `1px solid ${COULEURS.gris100}`,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    },
    sectionTitre: { fontSize: 14, fontWeight: 700, color: COULEURS.navy },
    lienVoirTout: { fontSize: 12, color: couleurTheme, cursor: 'pointer', fontWeight: 600 },
    // ── Répartition rôles ──
    ligneRole: {
      padding: '12px 20px', borderBottom: `1px solid ${COULEURS.gris50}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    },
    roleBarre: (couleur, pct) => ({
      flex: 1, height: 4, background: COULEURS.gris100, borderRadius: 4, overflow: 'hidden',
    }),
    roleBarreRemplie: (couleur, pct) => ({
      height: '100%', width: `${pct}%`, background: couleur, borderRadius: 4,
      transition: 'width 0.5s',
    }),
    // ── Activité ──
    ligneActivite: {
      padding: '12px 20px', borderBottom: `1px solid ${COULEURS.gris50}`,
      display: 'flex', alignItems: 'center', gap: 12,
    },
    activiteIcn: (couleur) => ({
      width: 28, height: 28, borderRadius: '50%',
      background: couleur + '20', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: 13, flexShrink: 0,
    }),
    activiteTitre: { fontSize: 12, fontWeight: 700, color: COULEURS.navy },
    activiteDetail: { fontSize: 11, color: COULEURS.gris400, marginTop: 1 },
    activiteHeure: { fontSize: 11, color: COULEURS.gris400, marginLeft: 'auto', flexShrink: 0 },
    // ── Tableau utilisateurs ──
    barreRecherche: {
      padding: '18px 22px', borderBottom: `1px solid ${COULEURS.gris200}`,
      display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      background: COULEURS.gris50,
    },
    inputRecherche: {
      padding: '10px 16px', borderRadius: 9,
      border: `1.5px solid ${COULEURS.gris200}`,
      fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none',
      flex: 1, minWidth: 220, background: COULEURS.blanc,
    },
    selectFiltre: {
      padding: '10px 16px', borderRadius: 9,
      border: `1.5px solid ${COULEURS.gris200}`,
      fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none',
      background: COULEURS.blanc, color: COULEURS.navy,
    },
    tableauHeader: {
      display: 'grid', gridTemplateColumns: '2.5fr 2fr 1.5fr 1fr 1.2fr 110px',
      padding: '12px 22px', background: COULEURS.gris50,
      borderBottom: `1px solid ${COULEURS.gris200}`,
      fontSize: 10.5, fontWeight: 700, color: COULEURS.gris400,
      textTransform: 'uppercase', letterSpacing: '0.07em',
    },
    tableauLigne: {
      display: 'grid', gridTemplateColumns: '2.5fr 2fr 1.5fr 1fr 1.2fr 110px',
      padding: '16px 22px', borderBottom: `1px solid ${COULEURS.gris100}`,
      fontSize: 13, alignItems: 'center', transition: 'background 0.12s',
    },
    avatarPetit: (couleur) => ({
      width: 38, height: 38, borderRadius: '50%',
      background: couleur + '18', border: `1.5px solid ${couleur}45`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 700, color: couleur, flexShrink: 0,
    }),
    nomUser: { fontWeight: 700, color: COULEURS.navy, fontSize: 13.5 },
    emailUser: { fontSize: 11.5, color: COULEURS.gris400, marginTop: 2 },
    badgeRole: (couleur) => ({
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 11px', borderRadius: 20,
      background: couleur + '15', color: couleur,
      fontSize: 11, fontWeight: 700,
    }),
    badgeActif: (actif) => ({
      display: 'inline-block', padding: '4px 11px', borderRadius: 20,
      background: actif ? '#D1FAE5' : '#FEE2E2',
      color: actif ? '#065F46' : '#991B1B',
      fontSize: 11, fontWeight: 700,
    }),
    badge2FA: (ok) => ({
      display: 'inline-block', padding: '4px 11px', borderRadius: 20,
      background: ok ? '#DBEAFE' : '#FEF9C3',
      color: ok ? '#1E40AF' : '#92400E',
      fontSize: 11, fontWeight: 700,
    }),
    btnEdit: {
      padding: '6px 13px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`,
      background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer',
      fontSize: 11.5, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif',
    },
    btnExceptions: {
      padding: '6px 13px', borderRadius: 7, border: '1px solid #C7D2FE',
      background: '#EEF2FF', color: '#4338CA', cursor: 'pointer',
      fontSize: 11.5, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif',
    },
    // ── Matrice ──
    matriceTable: {
      background: COULEURS.blanc, borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `1px solid ${COULEURS.gris200}`,
    },
    matriceHeader: {
      display: 'grid',
      gridTemplateColumns: `2fr repeat(${TOUS_ROLES.length}, 1fr)`,
      background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris200}`,
      padding: '12px 16px', gap: 8,
    },
    matriceLigne: {
      display: 'grid',
      gridTemplateColumns: `2fr repeat(${TOUS_ROLES.length}, 1fr)`,
      padding: '10px 16px', borderBottom: `1px solid ${COULEURS.gris100}`,
      gap: 8, alignItems: 'center',
    },
    check: (ok) => ({
      width: 22, height: 22, borderRadius: '50%',
      background: ok ? '#D1FAE5' : '#F1F5F9',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, margin: '0 auto',
    }),
    // ── Sécurité ──
    carteSecu: {
      background: COULEURS.blanc, borderRadius: 12, padding: 24,
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      border: `1px solid ${COULEURS.gris200}`, marginBottom: 20,
    },
    secuTitre: { fontSize: 15, fontWeight: 700, color: COULEURS.navy, marginBottom: 16 },
    ligneSecu: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 0', borderBottom: `1px solid ${COULEURS.gris100}`,
    },
    alerteSecu: {
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '14px 16px', background: '#FEF9C3',
      borderRadius: 10, border: '1px solid #FDE68A', marginBottom: 12,
    },
  };

  return (
    <TopNavLayout stats={stats}>
      <div style={S.page}>

        {/* En-tête */}
        <div style={S.pageHeader}>
          <div>
            <div style={S.pageTitre}>Vue d'ensemble - Contrôle d'accès</div>
            <div style={S.pageSousTitre}>Tableau de bord de sécurité en temps réel</div>
          </div>
        </div>

        {/* Sous-onglets */}
        <div style={S.sousOnglets}>
          {ONGLETS.map((o) => (
            <button key={o.id} style={S.tabSous(onglet === o.id)} onClick={() => setOnglet(o.id)}>
              <span>{o.icone}</span>
              <span>{o.libelle}</span>
              {o.badge != null && <span style={S.tabBadge(onglet === o.id)}>{o.badge}</span>}
            </button>
          ))}
        </div>

        {/* ── VUE D'ENSEMBLE ── */}
        {onglet === 'overview' && (
          <>
            {/* KPI cards */}
            <div style={S.grilleKpi}>
              <div style={S.carteKpi(false)}>
                <div style={S.kpiIcn}>👥</div>
                <div style={S.kpiLbl}>Utilisateurs totaux</div>
                <div style={S.kpiVal(COULEURS.navy)}>{usersElearning.length}</div>
                <div style={S.kpiSub}>{actifs} actifs</div>
              </div>
              <div style={S.carteKpi(false)}>
                <div style={S.kpiIcn}>🟢</div>
                <div style={S.kpiLbl}>Connexions actives</div>
                <div style={S.kpiVal(COULEURS.succes)}>{connexionsActives}</div>
                <div style={S.kpiSub}>Dernières 15 min</div>
              </div>
              <div style={S.carteKpi(sans2FA > 10)}>
                <div style={S.kpiIcn}>🔓</div>
                <div style={S.kpiLbl}>Sans 2FA activé</div>
                <div style={S.kpiVal('#DC2626')}>{sans2FA}</div>
                <div style={S.kpiSub}>Utilisateurs à risque</div>
              </div>
              <div style={S.carteKpi(alertesSec48h > 0)}>
                <div style={S.kpiIcn}>⚠️</div>
                <div style={S.kpiLbl}>Alertes sécurité</div>
                <div style={S.kpiVal('#D97706')}>{alertesSec48h}</div>
                <div style={S.kpiSub}>Dernières 48h</div>
              </div>
              <div style={S.carteKpi(false)}>
                <div style={S.kpiIcn}>⏳</div>
                <div style={S.kpiLbl}>Accès temporaires</div>
                <div style={S.kpiVal('#8B5CF6')}>{accesTemporaires}</div>
                <div style={S.kpiSub}>Délégations actives</div>
              </div>
            </div>

            {/* Répartition + Activité */}
            <div style={S.deuxColonnes}>
              {/* Répartition par rôle */}
              <div style={S.section}>
                <div style={S.sectionHeader}>
                  <span style={S.sectionTitre}>Répartition par rôle</span>
                </div>
                {repartition.map((r) => (
                  <div key={r.role} style={S.ligneRole}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', background: r.couleur, flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 13, color: COULEURS.navy, fontWeight: 500 }}>{r.libelle}</span>
                    </div>
                    <div style={S.roleBarre(r.couleur)}>
                      <div style={S.roleBarreRemplie(r.couleur, (r.count / usersElearning.length) * 100)} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, minWidth: 20, textAlign: 'right' }}>
                      {r.count}
                    </span>
                  </div>
                ))}
              </div>

              {/* Activité récente */}
              <div style={S.section}>
                <div style={S.sectionHeader}>
                  <span style={S.sectionTitre}>Activité récente</span>
                  <span style={S.lienVoirTout} onClick={() => navigate('/admin/audit-logs')}>Voir tout →</span>
                </div>
                {activiteRecente.length === 0 ? (
                  <div style={{ padding: '20px 4px', fontSize: 13, color: COULEURS.gris400, textAlign: 'center' }}>Aucune activité récente.</div>
                ) : activiteRecente.map((a) => {
                  const couleur = a.statut === 'danger' ? '#DC2626' : a.statut === 'warning' ? '#D97706' : a.statut === 'success' ? COULEURS.succes : '#0891B2';
                  const icone = a.statut === 'danger' ? '🚨' : a.statut === 'warning' ? '⚠️' : a.statut === 'success' ? '✅' : 'ℹ️';
                  return (
                    <div key={a.id} style={S.ligneActivite}>
                      <div style={S.activiteIcn(couleur)}>{icone}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ ...S.activiteTitre, color: couleur }}>{a.acteur_nom || 'Système'} · {(a.action_type || '').replace(/_/g, ' ')}</div>
                        <div style={S.activiteDetail}>{a.detail}</div>
                      </div>
                      <span style={S.activiteHeure}>{a.created_at ? new Date(a.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ── UTILISATEURS ── */}
        {onglet === 'utilisateurs' && (
          <div style={S.section}>
            {/* Barre filtres */}
            <div style={S.barreRecherche}>
              <input
                style={S.inputRecherche}
                placeholder="Rechercher un utilisateur…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
              />
              <select style={S.selectFiltre} value={filtreRole} onChange={(e) => setFiltreRole(e.target.value)}>
                <option value="tous">Tous les rôles</option>
                <optgroup label="Administration">
                  {ROLES_ADMIN.map((r) => (
                    <option key={r} value={r}>{LIBELLES_ROLES[r]}</option>
                  ))}
                </optgroup>
                <optgroup label="Corps enseignant">
                  {ROLES_PROF.map((r) => (
                    <option key={r} value={r}>{LIBELLES_ROLES[r]}</option>
                  ))}
                </optgroup>
              </select>
              <select style={S.selectFiltre} value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}>
                <option value="tous">Tous les statuts</option>
                <option value="actif">Actif</option>
                <option value="inactif">Inactif</option>
                <option value="2fa_on">2FA activée</option>
                <option value="2fa_off">2FA désactivée</option>
              </select>
            </div>

            {/* En-tête tableau */}
            <div style={S.tableauHeader}>
              <span>Utilisateur</span>
              <span>Email</span>
              <span>Rôle</span>
              <span>Statut</span>
              <span>2FA</span>
              <span>Actions</span>
            </div>

            {/* Lignes */}
            {chargement && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: COULEURS.gris400 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
                <div style={{ fontSize: 13 }}>Chargement des utilisateurs BET…</div>
              </div>
            )}

            {!chargement && erreurChargement && (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
                <div style={{ fontSize: 13, color: '#EF4444', marginBottom: 12 }}>{erreurChargement}</div>
                <button
                  onClick={chargerUsers}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: couleurTheme, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                >
                  Réessayer
                </button>
              </div>
            )}

            {!chargement && !erreurChargement && usersFiltres.map((u) => {
              const couleur = COULEUR_ROLE[u.role] || couleurTheme;
              const en2FA   = activation2FA === u.id;
              return (
                <div key={u.id} style={S.tableauLigne}
                  onMouseEnter={e => e.currentTarget.style.background = COULEURS.gris50}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={S.avatarPetit(couleur)}>{u.initiales}</div>
                    <div>
                      <div style={S.nomUser}>{u.prenom} {u.nom}</div>
                      <div style={S.emailUser}>{u.description}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: COULEURS.gris600 }}>{u.email}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={S.badgeRole(couleur)}>{LIBELLES_ROLES[u.role]}</span>
                  </div>
                  <span
                    style={{ ...S.badgeActif(u.est_actif), cursor: 'pointer' }}
                    onClick={() => toggleActif(u.id)}
                    title="Cliquer pour basculer"
                  >
                    {u.est_actif ? 'Actif' : 'Inactif'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={S.badge2FA(u.deux_facteurs)}>
                      {u.deux_facteurs ? '✓ Activé' : '✗ Désactivé'}
                    </span>
                    <div
                      onClick={() => !en2FA && toggleDeuxFA(u)}
                      title={u.deux_facteurs ? 'Désactiver la 2FA' : 'Activer la 2FA'}
                      style={{
                        width: 34, height: 19, borderRadius: 10,
                        background: u.deux_facteurs ? COULEURS.succes : COULEURS.gris200,
                        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                        cursor: en2FA ? 'not-allowed' : 'pointer',
                        opacity: en2FA ? 0.6 : 1,
                      }}
                    >
                      <div style={{ position: 'absolute', top: 2, left: u.deux_facteurs ? 17 : 2, width: 15, height: 15, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                    </div>
                  </div>

                  {/* Modification désactivée temporairement : se fait désormais côté dash. */}
                  {/* <button style={S.btnEdit} onClick={() => ouvrirEdition(u)}>✏️ Modifier</button> */}
                  <button style={S.btnEdit} onClick={() => setUserDetail(u)}>👁️ Détails</button>
                </div>
              );
            })}

            {!chargement && !erreurChargement && usersFiltres.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: COULEURS.gris400 }}>
                Aucun utilisateur trouvé.
              </div>
            )}
          </div>
        )}

        {/* ── MATRICE DES PERMISSIONS (réelle - permissions_roles côté serveur) ── */}
        {onglet === 'matrice' && (() => {
          const roleInfo = PHYSICAL_ROLES.find(r => r.id === roleSelectionnePhysique) || PHYSICAL_ROLES[0];
          const permsRole = matrice[roleSelectionnePhysique] || {};
          const modulesRole = modulesPertinents(roleSelectionnePhysique);
          const nbModulesActifs = modulesRole.filter(m => {
            const p = permsRole[m.id];
            return p && (p.read || p.create || p.update || p.delete || p.manage);
          }).length;

          function toggleAction(moduleId, actionKey) {
            setMatrice(prev => {
              const roleMap = { ...(prev[roleSelectionnePhysique] || {}) };
              const modulePerm = { read: false, create: false, update: false, delete: false, manage: false, ...(roleMap[moduleId] || {}) };
              modulePerm[actionKey] = !modulePerm[actionKey];
              roleMap[moduleId] = modulePerm;
              return { ...prev, [roleSelectionnePhysique]: roleMap };
            });
            setMatriceSauvee(false);
          }

          function reinitialiserRole() {
            setMatrice(prev => ({ ...prev, [roleSelectionnePhysique]: matriceOriginale[roleSelectionnePhysique] || {} }));
          }

          async function sauvegarderMatrice() {
            setMatriceSaving(true);
            try {
              const r = await fetch(`${API_URL}/api/admin/permissions-matrice`, {
                method: 'PUT', headers: authHeaders(),
                body: JSON.stringify({ role: roleSelectionnePhysique, permissions: permsRole }),
              });
              if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                await alerte(`Erreur : ${err.error || 'Impossible d\'enregistrer'}`, { danger: true });
                return;
              }
              setMatriceOriginale(prev => ({ ...prev, [roleSelectionnePhysique]: permsRole }));
              setMatriceSauvee(true);
              setTimeout(() => setMatriceSauvee(false), 2500);
            } finally {
              setMatriceSaving(false);
            }
          }

          return (
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

              {/* ── Panneau gauche : sélection du rôle ── */}
              <div style={{ width: 230, flexShrink: 0, background: COULEURS.blanc, borderRadius: 12, border: `1px solid ${COULEURS.gris200}`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${COULEURS.gris100}`, fontSize: 11, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Sélectionner un rôle
                </div>
                {PHYSICAL_ROLES.map(r => {
                  const permsR = matrice[r.id] || {};
                  const n = modulesPertinents(r.id).filter(m => {
                    const p = permsR[m.id];
                    return p && (p.read || p.create || p.update || p.delete || p.manage);
                  }).length;
                  const actif = roleSelectionnePhysique === r.id;
                  return (
                    <button key={r.id} onClick={() => setRoleSelectionnePhysique(r.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', border: 'none', background: actif ? r.couleur + '15' : 'transparent', borderLeft: `3px solid ${actif ? r.couleur : 'transparent'}`, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif', transition: 'all 0.12s' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.couleur, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: actif ? 700 : 500, color: actif ? r.couleur : COULEURS.navy, flex: 1, textAlign: 'left', lineHeight: 1.3 }}>
                        {r.lib}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: actif ? r.couleur : COULEURS.gris400, background: actif ? r.couleur + '20' : COULEURS.gris100, padding: '1px 6px', borderRadius: 10, flexShrink: 0 }}>{n}</span>
                    </button>
                  );
                })}
              </div>

              {/* ── Panneau droit : permissions du rôle sélectionné ── */}
              <div style={{ flex: 1, minWidth: 0 }}>

                {/* En-tête rôle */}
                <div style={{ background: COULEURS.blanc, borderRadius: 12, border: `1px solid ${COULEURS.gris200}`, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: roleInfo.couleur + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: roleInfo.couleur }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: COULEURS.navy }}>{roleInfo.lib}</div>
                      <div style={{ fontSize: 12, color: COULEURS.gris400 }}>{nbModulesActifs} module{nbModulesActifs > 1 ? 's' : ''} avec accès</div>
                      {roleInfo.note && (
                        <div style={{ fontSize: 11.5, color: COULEURS.gris500, marginTop: 4, maxWidth: 520, lineHeight: 1.4 }}>ℹ️ {roleInfo.note}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {matriceSauvee && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: COULEURS.succes, background: '#D1FAE5', padding: '5px 12px', borderRadius: 8 }}>✓ Sauvegardé</span>
                    )}
                    {matriceModifiee && (
                      <button onClick={reinitialiserRole} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                        Réinitialiser
                      </button>
                    )}
                    <button onClick={sauvegarderMatrice} disabled={!matriceModifiee || matriceSaving} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: (matriceModifiee && !matriceSaving) ? roleInfo.couleur : COULEURS.gris200, color: (matriceModifiee && !matriceSaving) ? '#fff' : COULEURS.gris400, fontSize: 12, fontWeight: 700, cursor: (matriceModifiee && !matriceSaving) ? 'pointer' : 'default', fontFamily: '"Plus Jakarta Sans", sans-serif', transition: 'all 0.15s' }}>
                      {matriceSaving ? 'Enregistrement…' : '💾 Sauvegarder'}
                    </button>
                  </div>
                </div>

                {matriceChargement ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: COULEURS.gris400 }}>⏳ Chargement de la matrice…</div>
                ) : (
                  <div style={{ background: COULEURS.blanc, borderRadius: 12, border: `1px solid ${COULEURS.gris200}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: `2fr repeat(${ACTIONS_PERMISSIONS.length}, 90px)`, padding: '11px 18px', background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris200}` }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Module</span>
                      {ACTIONS_PERMISSIONS.map(a => (
                        <span key={a.key} style={{ fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{a.lib}</span>
                      ))}
                    </div>
                    {modulesRole.map((m, i) => {
                      const p = permsRole[m.id] || {};
                      return (
                        <div key={m.id} style={{ display: 'grid', gridTemplateColumns: `2fr repeat(${ACTIONS_PERMISSIONS.length}, 90px)`, padding: '11px 18px', alignItems: 'center', borderBottom: i < modulesRole.length - 1 ? `1px solid ${COULEURS.gris100}` : 'none' }}>
                          <span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: COULEURS.navy, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span>{m.icone}</span> {m.lib}
                            </span>
                            {m.desc && <span style={{ fontSize: 11, color: COULEURS.gris400, display: 'block', marginTop: 2, lineHeight: 1.4, maxWidth: 320 }}>{m.desc}</span>}
                          </span>
                          {ACTIONS_PERMISSIONS.map(a => {
                            const actif = !!p[a.key];
                            const active = actionsActives(m.id).includes(a.key);
                            if (!active) {
                              return (
                                <div key={a.key} style={{ display: 'flex', justifyContent: 'center' }}>
                                  <span title="Aucune route ne vérifie ce droit" style={{ color: COULEURS.gris200, fontSize: 14 }}>-</span>
                                </div>
                              );
                            }
                            return (
                              <div key={a.key} style={{ display: 'flex', justifyContent: 'center' }}>
                                <div onClick={() => toggleAction(m.id, a.key)} style={{ width: 36, height: 20, borderRadius: 10, background: actif ? roleInfo.couleur : COULEURS.gris200, position: 'relative', cursor: 'pointer', transition: 'background 0.15s', flexShrink: 0 }}>
                                  <div style={{ position: 'absolute', top: 2, left: actif ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.15s' }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Utilisateurs de ce rôle - exceptions individuelles ── */}
                {!matriceChargement && (() => {
                  const usersDuRole = usersElearning.filter(u => u._roleBackend === roleSelectionnePhysique);
                  return (
                    <div style={{ background: COULEURS.blanc, borderRadius: 12, border: `1px solid ${COULEURS.gris200}`, overflow: 'hidden', marginTop: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                      <div style={{ padding: '12px 18px', background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris200}` }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Utilisateurs de ce rôle - cliquer pour gérer ses exceptions ({usersDuRole.length})
                        </span>
                      </div>
                      {usersDuRole.length === 0 ? (
                        <div style={{ padding: '20px 18px', fontSize: 12, color: COULEURS.gris400, fontStyle: 'italic' }}>Aucun utilisateur avec ce rôle pour l'instant.</div>
                      ) : (
                        usersDuRole.map((u, i) => (
                          <div key={u.id} onClick={() => setExceptionsUser(u)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 18px', borderBottom: i < usersDuRole.length - 1 ? `1px solid ${COULEURS.gris100}` : 'none', cursor: 'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background = COULEURS.gris50}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <div style={S.avatarPetit(roleInfo.couleur)}>{u.initiales}</div>
                            <div style={{ flex: 1 }}>
                              <div style={S.nomUser}>{u.prenom} {u.nom}</div>
                              <div style={S.emailUser}>{u.email}</div>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#4338CA' }}>🔑 Exceptions →</span>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })()}

      </div>

      {/* Modale détail utilisateur (lecture seule) */}
      {userDetail && (
        <ModalDetailUtilisateur
          utilisateur={userDetail}
          onFermer={() => setUserDetail(null)}
          centres={centres}
        />
      )}

      {/* Modale création/édition */}
      {modalOuvert && (
        <ModalUtilisateur
          utilisateur={userEdite}
          onFermer={fermerModal}
          onSauvegarder={sauvegarder}
          centres={centres}
        />
      )}

      {/* Modale exceptions de permissions */}
      {exceptionsUser && (
        <ModalExceptionsUtilisateur
          utilisateur={exceptionsUser}
          rolePhysique={exceptionsUser._roleBackend}
          permsRoleBase={matrice[exceptionsUser._roleBackend] || {}}
          onFermer={() => setExceptionsUser(null)}
        />
      )}
    </TopNavLayout>
  );
}
