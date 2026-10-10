import { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from 'recharts';
import toast from 'react-hot-toast';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm, useAlerte } from '../../contexts/ConfirmContext';
import { COULEURS } from '../../constants/couleurs';
import TopNavLayout from '../../components/shared/TopNavLayout';
import { MOCK_APPRENANTS } from '../../mock/apprenants';
import { MOCK_SESSIONS, MOCK_GROUPES } from '../../mock/sessions';
import { ModalRenouvellementContrat, STATUT_CONTRAT_LIB } from './GestionEntreprises';
import { genererRecuVersement } from '../../utils/recuVersement';
import { useTheme } from '../../contexts/ThemeContext';
import { OngletComptaApercu, OngletComptaFacturation, OngletComptaPaiements, OngletComptaFournisseurs, OngletComptaTresorerie, OngletComptaRrdBcBacn, OngletComptaGenerale, OngletComptaTva, OngletComptaImmobilisations, OngletComptaBudgets, OngletComptaAnalytique , OngletComptaMesTaches, OngletComptaHonorairesCoaches, OngletComptaExports } from './DashboardComptable';
import { OngletRHPaieBulletins, OngletRHContrats, OngletRHConges, OngletRHPaieApercu, OngletRHPaieMesTaches, OngletRHGrilleTarifaire } from './DashboardRhPaie';
import { OngletCustomerCare } from './DashboardCustomerCare';
import { OngletRemplacements } from './DashboardAdminShared';
import { OngletCahiersCoachs, OngletRapportsDeputySuperviseur, OngletAnomaliesSuperviseur, OngletGestionDeputies, OngletMesTachesSuperviseur, OngletClassementCoachs, OngletObserverCours, OngletPlanningsElearning } from './DashboardSuperviseur';
import { OngletCoachsPAAdvisor, OngletHonorairesPAAdvisor, OngletVueEnsemblePAAdvisor, OngletClassesPAAdvisor, DashboardPAAdvisor, OngletRapportsSuperviseurPA, OngletEvaluationsPAAdvisor, OngletSuiviApprenantsPAAdvisor, OngletMesTachesPAAdvisor, OngletEvaluationsApprenantsPA } from './DashboardPaAdvisor';
import { OngletGestionTests, OngletMesTachesPlacement, OngletRapportsPlacement } from './DashboardPlacement';
import { OngletCommMesTaches, OngletCommTableauBord, OngletCommInscriptions, OngletCommMesClasses, OngletCommMesApprenants, OngletCommPaiements } from './DashboardCommercialElearning';
import { OngletDirectionMesTaches, OngletDirectionApprenants } from './DashboardDirection';
import { OngletMesTachesSav, OngletTableauBordSav, OngletDemandesSav, OngletRemboursementsSav, OngletSatisfactionSav } from './DashboardSav';
import BetLevelTestsTab from '../../components/shared/BetLevelTestsTab';
import { OngletEntreprises } from './DashboardAdminShared';
import { OngletInscriptionOnboarding, OngletParcoursInscriptions, OngletClasses, OngletVueEnsembleOnboarding, OngletSuiviDemarrage, OngletMesTachesOnboarding, OngletMesApprenantsOnboarding, OngletCoachsOnboarding } from './DashboardOnboarding';
import OngletReaffectations from '../../components/shared/OngletReaffectations';
import { OngletELearning } from './DashboardElearning';
import { OngletAuditLogs, EquipePedagogique, OngletAdministrationBET, OngletVueEnsembleManager } from './DashboardManager';

import { fetchUpload } from "../../utils/fetchUpload";
import { estRole, familleDe } from '../../constants/roles';
const _API_URL_ADMIN = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const _authHdrsAdmin = () => ({ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('admin_token')||''}` });


// Données mock admin
const MOCK_PROFESSEURS = [
  { id: 'teacher-001', prenom: 'Marie',   nom: 'Dupont',  role: 'professeur_titulaire',   email: 'marie.dupont@bet.ci',   est_actif: true,  nb_groupes: 2, contrat: 'Permanent',  debut: '2024-01-15', niveaux: 'A1 → B1', sessions_mois: 12, evaluation: 4.5, specialite: 'General English' },
  { id: 'teacher-002', prenom: 'Pierre',  nom: 'Martin',  role: 'professeur_titulaire',   email: 'pierre.martin@bet.ci',  est_actif: true,  nb_groupes: 1, contrat: 'Consultant', debut: '2025-06-01', niveaux: 'B1 → C1', sessions_mois: 6,  evaluation: 4.2, specialite: 'Business English' },
  { id: 'teacher-004', prenom: 'Aurélie', nom: 'Bernard', role: 'professeur_titulaire',   email: 'aurelie.bernard@bet.ci',est_actif: true,  nb_groupes: 3, contrat: 'Permanent',  debut: '2023-09-01', niveaux: 'A1 → A2', sessions_mois: 15, evaluation: 4.8, specialite: 'Kids English (6-12 ans)' },
  { id: 'teacher-005', prenom: 'Kwame',   nom: 'Asare',   role: 'professeur_titulaire',   email: 'kwame.asare@bet.ci',    est_actif: false, nb_groupes: 0, contrat: 'Consultant', debut: '2024-03-01', niveaux: 'B2 → C2', sessions_mois: 0,  evaluation: 3.9, specialite: 'IELTS Prep' },
  { id: 'teacher-003', prenom: 'Sophie',  nom: 'Leclerc', role: 'professeur_remplacant',  email: 'sophie.leclerc@bet.ci', est_actif: true,  nb_groupes: 1, contrat: 'Freelance',  debut: '2025-09-01', niveaux: 'A1 → B1', sessions_mois: 4,  evaluation: 4.0, specialite: 'General English' },
  { id: 'teacher-006', prenom: 'Issouf',  nom: 'Koné',    role: 'professeur_remplacant',  email: 'issouf.kone@bet.ci',    est_actif: true,  nb_groupes: 0, contrat: 'Stagiaire',  debut: '2026-02-01', niveaux: 'A2 → B2', sessions_mois: 0,  evaluation: null, specialite: 'Business English' },
];

// ── Mock Onboarding / PA Contenus ────────────────────────────────────────────
// Barre de sous-onglets affichée pour Onboarding (admin_onboarding) en haut des 4 pages
// Contenus (Bibliothèque/Mise en ligne/Statistiques/Mini-jeux), regroupées sous un seul
// onglet global "Contenus" plutôt que 4 onglets séparés.
function ContenusOnbSousTabs({ actif, onChange }) {
  const onglets = [
    { id: 'bibliotheque', lib: 'Bibliothèque',  icone: '📚' },
    { id: 'upload',       lib: 'Mise en ligne', icone: '⬆️' },
    { id: 'stats',        lib: 'Statistiques',  icone: '📈' },
    { id: 'minijeux',     lib: 'Mini-jeux',     icone: '🎮' },
  ];
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#F1F5F9', borderRadius: 10, padding: 4, width: 'fit-content' }}>
      {onglets.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)}
          style={{ padding: '8px 16px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif',
            background: actif === o.id ? '#fff' : 'transparent', color: actif === o.id ? '#7C3AED' : '#64748B',
            boxShadow: actif === o.id ? '0 1px 6px rgba(0,0,0,.08)' : 'none' }}>
          {o.icone} {o.lib}
        </button>
      ))}
    </div>
  );
}

// Limites de taille par type de fichier pour l'upload de contenus onboarding - mêmes seuils
// que la revérification côté backend (Backend/src/routes/uploadRoutes.js, LIMITES_CONTENU_MB).
// Validé avant l'upload pour éviter de faire transiter un fichier trop lourd inutilement.
const LIMITES_CONTENU_MO = { video: 100, audio: 20, image: 5, autre: 15 };
function fichierDepasseLimite(fichier) {
  if (!fichier) return null;
  const limite = fichier.type?.startsWith('video/') ? LIMITES_CONTENU_MO.video
    : fichier.type?.startsWith('audio/') ? LIMITES_CONTENU_MO.audio
    : fichier.type?.startsWith('image/') ? LIMITES_CONTENU_MO.image
    : LIMITES_CONTENU_MO.autre;
  const tailleMo = fichier.size / 1048576;
  return tailleMo > limite ? { limite, tailleMo: tailleMo.toFixed(1) } : null;
}

const CATS_CONTENUS = [
  { id: 'bienvenue',     lib: 'Présentation & Bienvenue', icone: '🎬', couleur: '#7C3AED' },
  { id: 'regles',        lib: 'Règles & Charte',          icone: '📋', couleur: '#0891B2' },
  { id: 'processus',     lib: "Processus d'apprentissage",icone: '🗺️', couleur: '#059669' },
  { id: 'certification', lib: 'Certification',            icone: '🏆', couleur: '#F59E0B' },
  { id: 'ressources',    lib: 'Ressources complémentaires',icone:'📚', couleur: '#EC4899' },
];

// ── Bibliothèque de contenus onboarding + bibliothèque communautaire + mini-jeux :
// données chargées depuis /api/contenus/* (Backend/src/routes/contenusOnboarding.js).

// ── Mini-jeux admin (jeux gérés par Onboarding/PA) - catalogue de types, pas des données ──
const TYPES_JEUX = [
  { id:'qcm',          icone:'⚡', lib:'QCM Flash',               categorie:'tous'       },
  { id:'association',  icone:'🔀', lib:'Association',              categorie:'tous'       },
  { id:'lacunes',      icone:'✏️', lib:'Mot manquant',             categorie:'tous'       },
  { id:'anagramme',    icone:'🔤', lib:'Anagramme',                categorie:'enfant'     },
  { id:'image',        icone:'🖼️', lib:"Devine l'image",           categorie:'enfant'     },
  { id:'audio',        icone:'🔊', lib:'Écoute & Réponds',         categorie:'enfant'     },
  { id:'coloriage',    icone:'🎨', lib:'Coloriage vocabulaire',    categorie:'enfant'     },
  { id:'sprint',       icone:'⏱️', lib:'Sprint vocabulaire',       categorie:'ado_adulte' },
  { id:'conjugaison',  icone:'🔁', lib:'Conjugaison express',      categorie:'ado_adulte' },
  { id:'vrai_faux',    icone:'🎯', lib:'Vrai ou Faux',             categorie:'ado_adulte' },
  { id:'dialogue',     icone:'💬', lib:'Complétion de dialogue',   categorie:'ado_adulte' },
  { id:'reordre',      icone:'🧩', lib:'Phrases à réordonner',     categorie:'tous'       },
  { id:'flashcards',   icone:'🃏', lib:'Flashcards',               categorie:'tous'       },
  { id:'cecr',         icone:'🏆', lib:'Défi CECR',                categorie:'tous'       },
  { id:'dictee',       icone:'📖', lib:'Dictée éclair',            categorie:'tous'       },
  { id:'mots_croises', icone:'🔍', lib:'Mots croisés',             categorie:'tous'       },
  { id:'traduction',   icone:'🔃', lib:'Traduction inverse',       categorie:'tous'       },
  { id:'mots_caches',  icone:'🕵️', lib:'Mots cachés',              categorie:'tous'       },
];
// ── Mock PA Advisor ───────────────────────────────────────────────────────────
const MOCK_SUIVI_PEDAGOGIQUE = [
  { id: 'g1', groupe: 'Enfants Débutants A - TLG',     cecr: 'A1 → A2', effectif: 8,  taux_presence: 87, score_moyen: 14.2, taux_passage: 38, statut: 'bon'    },
  { id: 'g2', groupe: 'Adolescents Intermédiaires - TLG',cecr:'A2 → B1', effectif: 10, taux_presence: 91, score_moyen: 15.8, taux_passage: 45, statut: 'bon'    },
  { id: 'g3', groupe: 'Adolescents Avancés - TLG',      cecr: 'B1 → B2', effectif: 12, taux_presence: 72, score_moyen: 11.5, taux_passage: 25, statut: 'alerte' },
];

// Module Comptabilité extrait dans DashboardComptable.jsx (import ci-dessous)

// ── Indicateurs de performance (tableau de bord) ─────────────────────────────
const MOCK_INDICATEURS = {
  tauxPresence: {
    id:         'tauxPresence',
    icone:      '📅',
    label:      'Taux de présence',
    valeur:     '87 %',
    definition: '% de séances effectuées / séances planifiées par apprenant',
    tendance:   '+2 pts vs mois dernier',
    statut:     'bon',      // bon | moyen | alerte
  },
  progressionMoyenne: {
    id:         'progressionMoyenne',
    icone:      '📈',
    label:      'Progression moyenne',
    valeur:     '+12 pts',
    definition: 'Évolution du score moyen du groupe sur le trimestre',
    tendance:   'Trimestre en cours',
    statut:     'bon',
  },
  tauxDevoirsRendus: {
    id:         'tauxDevoirsRendus',
    icone:      '📝',
    label:      'Taux de devoirs rendus',
    valeur:     '73 %',
    definition: '% de devoirs soumis sur total des devoirs assignés',
    tendance:   '-4 pts vs semaine dernière',
    statut:     'moyen',
  },
  scoreSatisfactionParents: {
    id:         'scoreSatisfactionParents',
    icone:      '⭐',
    label:      'Score satisfaction parents',
    valeur:     '4,2 / 5',
    definition: 'Moyenne des évaluations parents sur le mois',
    tendance:   '+0,3 vs mois dernier',
    statut:     'bon',
  },
  scoreEvaluationProf: {
    id:         'scoreEvaluationProf',
    icone:      '🏅',
    label:      'Score évaluation prof',
    valeur:     '4,5 / 5',
    definition: 'Moyenne des évaluations Superviseur sur le mois',
    tendance:   'Stable',
    statut:     'bon',
  },
  tauxPassageNiveau: {
    id:         'tauxPassageNiveau',
    icone:      '🎯',
    label:      'Taux de passage de niveau',
    valeur:     '34 %',
    definition: "% d'apprenants ayant progressé de niveau sur le cycle",
    tendance:   '+8 pts vs cycle précédent',
    statut:     'moyen',
  },
  // Onboarding / PA Contenus
  totalRessources: {
    id: 'totalRessources', icone: '📚', label: 'Ressources publiées',
    valeur: '10',
    definition: 'Contenus visibles par les apprenants dans la bibliothèque',
    tendance: '1 en attente de publication',
    statut: 'bon',
  },
  vuesMois: {
    id: 'vuesMois', icone: '👁', label: 'Vues ce mois',
    valeur: '289',
    definition: 'Nombre total de consultations des ressources',
    tendance: '+23% vs mois précédent', statut: 'bon',
  },
  ressourcesVideo: {
    id: 'ressourcesVideo', icone: '🎬', label: 'Vidéos disponibles',
    valeur: '4',
    definition: 'Vidéos d\'onboarding accessibles aux apprenants',
    tendance: '1 vidéo obsolète à mettre à jour', statut: 'moyen',
  },
  // PA Advisor
  scoreMoyenGlobal: {
    id: 'scoreMoyenGlobal', icone: '📊', label: 'Score moyen global',
    valeur: '13,8 / 20', definition: 'Moyenne des notes sur tous les groupes suivis',
    tendance: '+1,2 pts vs trimestre précédent', statut: 'bon',
  },
  groupesEnDifficulte: {
    id: 'groupesEnDifficulte', icone: '⚠️', label: 'Groupes en difficulté',
    valeur: '1 / 3', definition: 'Groupes avec taux de présence < 80% ou score < 12/20',
    tendance: 'Adolescents Avancés à surveiller', statut: 'alerte',
  },
  evaluationsPlannees: {
    id: 'evaluationsPlannees', icone: '📅', label: 'Évaluations planifiées',
    valeur: '2 ce mois', definition: 'Évaluations trimestrielles et mensuelles à venir',
    tendance: 'Quiz Module 1 - 10/06', statut: 'bon',
  },
  // RH / Paie
  contratsActifs: {
    id: 'contratsActifs', icone: '📝', label: 'Contrats actifs',
    valeur: '3 / 3', definition: 'Contrats de professeurs en cours de validité',
    tendance: '1 CDD expire dans 30 jours', statut: 'moyen',
  },
  bulletinsAGenerer: {
    id: 'bulletinsAGenerer', icone: '💰', label: 'Bulletins à générer',
    valeur: '2', definition: 'Bulletins de paie en attente pour le mois de Mai 2026',
    tendance: 'Délai : avant le 05/06', statut: 'alerte',
  },
  masseSalarialeMois: {
    id: 'masseSalarialeMois', icone: '💳', label: 'Masse salariale Mai',
    valeur: '950 000 FCFA', definition: 'Total des salaires bruts du mois en cours',
    tendance: 'Stable vs mois précédent', statut: 'bon',
  },
  // Comptable Trésorier
  caMensuel: {
    id: 'caMensuel', icone: '📈', label: 'CA mensuel - Juin 2026',
    valeur: '12 350 000 FCFA', definition: 'Chiffre d\'affaires facturé sur le mois',
    tendance: '+8% vs objectif mensuel', statut: 'bon',
  },
  tauxRecouvrement: {
    id: 'tauxRecouvrement', icone: '💳', label: 'Taux de recouvrement',
    valeur: '74 %', definition: '% des factures encaissées sur le total facturé',
    tendance: '2 factures en retard', statut: 'moyen',
  },
  soldeTresorerie: {
    id: 'soldeTresorerie', icone: '🏦', label: 'Solde trésorerie',
    valeur: '24 750 000 FCFA', definition: 'Solde courant du compte BET au 01/06/2026',
    tendance: '+4 500 000 vs mois dernier', statut: 'bon',
  },
};

// Indicateurs affichés par rôle (selon tableau de bord)
const INDICATEURS_PAR_ROLE = {
  admin_manager:       ['tauxPresence', 'progressionMoyenne', 'scoreSatisfactionParents', 'scoreEvaluationProf', 'tauxPassageNiveau'],
  admin_superviseur:          ['tauxPresence', 'tauxDevoirsRendus', 'scoreSatisfactionParents', 'scoreEvaluationProf'],
  admin_responsable:   ['tauxPresence', 'progressionMoyenne', 'scoreSatisfactionParents', 'tauxPassageNiveau'],
  admin_gestionnaire:  ['tauxPresence', 'tauxDevoirsRendus', 'progressionMoyenne'],
  admin_placement:     ['tauxPresence', 'tauxPassageNiveau'],
  admin_onboarding:    ['tauxPresence', 'tauxDevoirsRendus'],
  admin_elearning:     ['tauxPresence', 'progressionMoyenne', 'tauxPassageNiveau', 'scoreSatisfactionParents'],
  admin_customer_care: ['tauxPresence', 'scoreSatisfactionParents'],
  admin_pa_advisor:    ['scoreMoyenGlobal', 'tauxPassageNiveau', 'groupesEnDifficulte', 'evaluationsPlannees'],
  admin_rh_paie:       ['contratsActifs', 'bulletinsAGenerer', 'masseSalarialeMois'],
  admin_comptable:     ['caMensuel', 'tauxRecouvrement', 'soldeTresorerie'],
  admin_observateur:   ['tauxPresence', 'progressionMoyenne'],
};

const COULEUR_STATUT = {
  bon:    { fond: '#D1FAE5', texte: '#065F46', bord: '#6EE7B7', accent: '#10B981' },
  moyen:  { fond: '#FEF9C3', texte: '#92400E', bord: '#FDE68A', accent: '#F59E0B' },
  alerte: { fond: '#FEE2E2', texte: '#991B1B', bord: '#FECACA', accent: '#EF4444' },
};

const CONFIGS_PAR_ROLE = {
  admin_manager: {
    titre:       'Manager BET',
    description: 'Pilotage global de la plateforme et gestion des professeurs',
    modules: [
      { id: 'professeurs', titre: 'Professeurs',   icone: '👨‍🏫', chemin: '/admin/manager/professeurs', couleur: COULEURS.cyan },
      { id: 'config',      titre: 'Configuration', icone: '⚙️',   chemin: '/admin/manager/configuration', couleur: COULEURS.gris600 },
      { id: 'audit_logs',  titre: 'Audit Logs',    icone: '🔍',   chemin: '/admin/audit-logs',            couleur: '#0F172A' },
    ],
  },
  admin_superviseur: {
    titre:       'Superviseur',
    description: 'Suivi qualité et évaluation des professeurs',
    modules: [
      { id: 'suivi',         titre: 'Suivi profs',    icone: '👁️', chemin: '/admin/superviseur/suivi',         couleur: COULEURS.cyanFonce },
      { id: 'evaluations',   titre: 'Évaluations',    icone: '⭐', chemin: '/admin/superviseur/evaluations',   couleur: COULEURS.attention },
      { id: 'remplacements', titre: 'Remplacements',  icone: '🔄', chemin: '/admin/superviseur/remplacements', couleur: '#8B5CF6' },
    ],
  },
  // admin_deputy_superviseur retiré : ce rôle a son propre point d'entrée dédié
  // (DashboardDeputySuperviseur.jsx, route /admin/deputy-superviseur/*) - n'atteint
  // jamais DashboardAdmin, cette config n'était plus lue nulle part.
  admin_placement: {
    titre:       'Agent Placement',
    description: 'Gestion des tests de niveau et affectation des apprenants',
    modules: [
      { id: 'tests', titre: 'Tests de niveau', icone: '📊', chemin: '/admin/placement/tests', couleur: COULEURS.cyan },
    ],
  },
  admin_onboarding: {
    titre:       'Agent Onboarding',
    description: 'Réception des inscriptions entreprises, vérification et transmission au parcours de placement',
    modules: [
      { id: 'inscriptions', titre: 'Inscrire',              icone: '📝', chemin: '/admin/onboarding/inscriptions', couleur: '#7C3AED' },
      { id: 'parcours',     titre: 'Parcours inscriptions', icone: '📋', chemin: '/admin/onboarding/parcours',     couleur: '#F97316' },
      { id: 'entreprises',  titre: 'Entreprises',           icone: '🏢', chemin: '/admin/onboarding/entreprises',  couleur: '#0891B2' },
      { id: 'classes',      titre: 'Classes',               icone: '🏫', chemin: '/admin/onboarding/classes',      couleur: COULEURS.cyanFonce },
      { id: 'apprenants',   titre: 'Mes apprenants',        icone: '🎓', chemin: '/admin/onboarding/apprenants',   couleur: '#F97316' },
      { id: 'coachs',       titre: 'Coachs',                icone: '👨‍🏫', chemin: '/admin/onboarding/coachs',       couleur: '#0EA5E9' },
      { id: 'reaffectations', titre: 'Dossiers à réaffecter', icone: '🔄', chemin: '/admin/onboarding/reaffectations', couleur: '#F59E0B' },
      { id: 'assignation',  titre: 'Assignation',           icone: '🎯', chemin: '/admin/onboarding/assignation',  couleur: COULEURS.succes },
      { id: 'contenus',     titre: 'Contenus',              icone: '📚', chemin: '/admin/onboarding/contenus',     couleur: '#7C3AED' },
    ],
  },
  admin_elearning: {
    titre: 'Assistant E-Learning',
    description: "Inscriptions, suivi du parcours, programme pédagogique et reporting entreprises",
    modules: [
      { id: 'inscrire',     titre: 'Inscrire',         icone: '📝', chemin: '/admin/elearning/inscrire',    couleur: '#7C3AED' },
      { id: 'parcours',     titre: 'Parcours',         icone: '📋', chemin: '/admin/elearning/parcours',    couleur: '#F97316' },
      { id: 'programme',    titre: 'Programme',       icone: '📈', chemin: '/admin/elearning/programme',    couleur: COULEURS.cyan },
      { id: 'reporting',    titre: 'Reporting',        icone: '📋', chemin: '/admin/elearning/reporting',    couleur: '#6366F1' },
      { id: 'entreprises',  titre: 'Entreprises',      icone: '🏢', chemin: '/admin/elearning/entreprises', couleur: '#F97316' },
    ],
  },
  /* ── DEUX RÔLES QUI TOMBAIENT SUR « Rôle admin non reconnu » ──
     `config` est résolu juste avant le rendu, et une absence renvoie un écran d'erreur plein
     page. `assistant_sav` n'avait pas d'entrée — son dashboard existait mais n'était jamais
     atteint — et `marketing` non plus, puisque le rôle vient d'être créé. */
  assistant_sav: {
    titre:       'Service Après-Vente',
    description: 'Demandes après-vente, remboursements et suivi de satisfaction',
    modules: [
      { id: 'taches',    titre: 'Mes tâches',         icone: '✅', chemin: '/admin/sav/taches',    couleur: '#0E7490' },
      { id: 'demandes',  titre: 'Demandes SAV',       icone: '📨', chemin: '/admin/sav/demandes',  couleur: COULEURS.cyan },
      { id: 'rembours',  titre: 'Remboursements',     icone: '💳', chemin: '/admin/sav/remboursements', couleur: '#D97706' },
      { id: 'satisf',    titre: 'Suivi satisfaction', icone: '😊', chemin: '/admin/sav/satisfaction',   couleur: '#16A34A' },
    ],
  },
  /* Le Marketing n'a pas encore d'écran propre : son menu se limite au socle (notifications,
     messagerie). Cette entrée existe pour qu'il ENTRE au lieu de buter sur l'écran d'erreur —
     ses quatre comptes actifs n'avaient aucun accès à bet-elearning. */
  marketing: {
    titre:       'Assistant Marketing',
    description: 'Communication et campagnes — les écrans dédiés restent à construire',
    modules: [],
  },
  admin_customer_care: {
    titre:       'Customer Care',
    description: 'Support et relation client',
    modules: [
      { id: 'overview', titre: 'Vue d\'ensemble',    icone: '📊', chemin: '/admin/support/overview', couleur: '#EC4899' },
      { id: 'tickets',  titre: 'Tickets',            icone: '🎧', chemin: '/admin/support/tickets',  couleur: COULEURS.cyan },
      { id: 'profils',  titre: 'Profils',             icone: '👥', chemin: '/admin/support/profils',  couleur: '#F97316' },
      { id: 'blocages', titre: 'Blocages absences',   icone: '🚫', chemin: '/admin/support/blocages', couleur: '#DC2626' },
    ],
  },
  admin_pa_advisor: {
    titre:       'PA Advisor',
    description: 'Conseil pédagogique, suivi de la qualité des programmes et accompagnement des apprenants et professeurs',
    modules: [
      { id: 'taches',                titre: 'Mes tâches',           icone: '✅', chemin: '/admin/pa-advisor/taches',               couleur: '#8B5CF6' },
      { id: 'overview',              titre: "Vue d'ensemble",       icone: '📊', chemin: '/admin/pa-advisor/overview',             couleur: '#0EA5E9' },
      { id: 'classes',              titre: 'Classes',              icone: '🏫', chemin: '/admin/pa-advisor/classes',              couleur: '#6366F1' },
      { id: 'coachs',                titre: 'Coachs E-Learning',    icone: '👨‍🏫', chemin: '/admin/pa-advisor/coachs',               couleur: '#0EA5E9' },
      { id: 'rapports-superviseur',  titre: 'Rapports Superviseur', icone: '📋', chemin: '/admin/pa-advisor/rapports-superviseur', couleur: '#7C3AED' },
      { id: 'remplacements',         titre: 'Remplacements',        icone: '🔄', chemin: '/admin/pa-advisor/remplacements',        couleur: COULEURS.violetEnfant },
      { id: 'honoraires',            titre: 'Honoraires',           icone: '💰', chemin: '/admin/pa-advisor/honoraires',           couleur: '#F59E0B' },
      { id: 'apprenants',            titre: 'Suivi apprenants',     icone: '👩‍🎓', chemin: '/admin/pa-advisor/apprenants',           couleur: '#F97316' },
      { id: 'programme',             titre: 'Suivi programme',      icone: '📈', chemin: '/admin/pa-advisor/programme',            couleur: COULEURS.cyan },
      { id: 'evaluations',           titre: 'Évaluations parents',  icone: '⭐', chemin: '/admin/pa-advisor/evaluations',          couleur: '#8B5CF6' },
      { id: 'eval-apprenants',       titre: 'Évaluations apprenants', icone: '🎓', chemin: '/admin/pa-advisor/eval-apprenants',    couleur: '#8B5CF6' },
      { id: 'reaffectations',        titre: 'Dossiers à réaffecter', icone: '🔀', chemin: '/admin/pa-advisor/reaffectations',      couleur: '#F59E0B' },
      { id: 'reporting',             titre: 'Reporting',            icone: '📊', chemin: '/admin/pa-advisor/reporting',            couleur: COULEURS.succes },
    ],
  },
  admin_rh_paie: {
    titre:       'RH / Paie',
    description: 'Gestion des ressources humaines, contrats professeurs, bulletins de paie et planification RH',
    modules: [
      { id: 'contrats',     titre: 'Contrats & RH',       icone: '📝', chemin: '/admin/rh/contrats',              couleur: '#0D9488' },
      { id: 'paie',         titre: 'Bulletins de paie',   icone: '💰', chemin: '/admin/rh/paie',                  couleur: '#059669' },
      { id: 'conges',       titre: 'Congés & absences',   icone: '📅', chemin: '/admin/rh/conges',                couleur: '#F97316' },
    ],
  },
  admin_comptable: {
    titre:       'Comptable Trésorier',
    description: 'Gestion financière, facturation entreprises, suivi des paiements et trésorerie BET',
    modules: [
      { id: 'facturation',  titre: 'Facturation',         icone: '🧾', chemin: '/admin/comptable/facturation',    couleur: COULEURS.cyan },
      { id: 'paiements',    titre: 'Suivi paiements',     icone: '💳', chemin: '/admin/comptable/paiements',      couleur: '#059669' },
      { id: 'fournisseurs', titre: 'Fournisseurs & Achats',icone:'📦', chemin: '/admin/comptable/fournisseurs',   couleur: '#DC2626' },
      { id: 'tresorerie',   titre: 'Trésorerie',          icone: '💰', chemin: '/admin/comptable/tresorerie',     couleur: '#8B5CF6' },
      { id: 'rrd_bc_bacn',  titre: 'RRD · BC · BACN',     icone: '📒', chemin: '/admin/comptable/rrd-bc-bacn',    couleur: '#0891B2' },
      { id: 'generale',     titre: 'Comptabilité générale',icone:'📚', chemin: '/admin/comptable/generale',       couleur: '#0F172A' },
      { id: 'tva',          titre: 'TVA',                  icone: '🏦', chemin: '/admin/comptable/tva',            couleur: '#0891B2' },
      { id: 'immobilisations', titre: 'Immobilisations',  icone: '🏗️', chemin: '/admin/comptable/immobilisations', couleur: '#7C3AED' },
      { id: 'budgets',      titre: 'Budgets',              icone: '🎯', chemin: '/admin/comptable/budgets',        couleur: '#D97706' },
      { id: 'analytique',   titre: 'Analytique',           icone: '📐', chemin: '/admin/comptable/analytique',     couleur: '#059669' },
      { id: 'entreprises',  titre: 'Contrats entreprises',icone: '🏢', chemin: '/admin/entreprises',              couleur: '#F97316' },
    ],
  },
  // admin_commercial retiré : ce rôle a son propre point d'entrée dédié
  // (DashboardAssistantCommercial.jsx, routes /admin/commercial*) - n'atteint jamais
  // DashboardAdmin, cette config n'était plus lue nulle part.
  admin_responsable: {
    titre:       'Responsable',
    description: 'Supervision des équipes pédagogiques, accès aux rapports, validation des formations et KPIs',
    modules: [
      { id: 'rapports',    titre: 'Rapports & KPIs',   icone: '📊', chemin: '/admin/responsable/rapports',   couleur: '#7C3AED' },
      { id: 'formations',  titre: 'Formations',         icone: '📚', chemin: '/admin/responsable/formations',  couleur: '#06B6D4' },
      { id: 'planning',    titre: 'Planning',           icone: '📅', chemin: '/admin/responsable/planning',    couleur: '#0EA5E9' },
      { id: 'entreprises', titre: 'Entreprises / DRH', icone: '🏢', chemin: '/admin/entreprises',             couleur: '#F97316' },
    ],
  },
  admin_gestionnaire: {
    titre:       'Gestionnaire',
    description: 'Gestion opérationnelle des classes, présences, apprenants et ressources pédagogiques',
    modules: [
      { id: 'classes',     titre: 'Classes',          icone: '🏫', chemin: '/admin/gestionnaire/classes',    couleur: '#0891B2' },
      { id: 'apprenants',  titre: 'Apprenants',       icone: '👩‍🎓', chemin: '/admin/gestionnaire/apprenants', couleur: '#059669' },
      { id: 'presences',   titre: 'Présences',        icone: '✅',  chemin: '/admin/gestionnaire/presences',  couleur: '#10B981' },
      { id: 'ressources',  titre: 'Ressources',       icone: '📂',  chemin: '/admin/gestionnaire/ressources', couleur: '#8B5CF6' },
    ],
  },
  admin_observateur: {
    titre:       'Observateur',
    description: 'Accès en lecture seule aux tableaux de bord, statistiques et rapports de la plateforme',
    modules: [
      { id: 'dashboard',   titre: 'Tableau de bord',  icone: '🏠', chemin: '/admin/observateur/dashboard',  couleur: '#94A3B8' },
      { id: 'rapports',    titre: 'Rapports',         icone: '📊', chemin: '/admin/observateur/rapports',   couleur: '#64748B' },
    ],
  },
};


// ── helpers entreprises ───────────────────────────────────────────────────────

const STATUT_ENT = {
  actif:          { bg: '#D1FAE5', txt: '#065F46', lib: 'Actif' },
  expire_bientot: { bg: '#FEF3C7', txt: '#92400E', lib: 'Expire bientôt' },
  prospect:       { bg: '#EDE9FE', txt: '#5B21B6', lib: 'Prospect' },
  suspendu:       { bg: '#FEE2E2', txt: '#991B1B', lib: 'Suspendu' },
  en_attente:     { bg: '#FEF3C7', txt: '#92400E', lib: 'En attente de validation' },
  refuse:         { bg: '#FEE2E2', txt: '#991B1B', lib: 'Refusé' },
};

const STATUT_BEN = {
  actif:               { bg: '#D1FAE5', txt: '#065F46', lib: 'Actif' },
  certifie:            { bg: '#EDE9FE', txt: '#5B21B6', lib: 'Certifié' },
  en_attente:          { bg: '#FEF3C7', txt: '#92400E', lib: 'En attente' },
  test_niveau_pending: { bg: '#FEF3C7', txt: '#92400E', lib: 'Test en cours' },
  suspendu:            { bg: '#FEE2E2', txt: '#991B1B', lib: 'Suspendu' },
};

const NIV_COULEUR = {
  A1:'#94A3B8', A2:'#60A5FA', B1:'#34D399', B2:'#818CF8', C1:'#F59E0B', C2:'#F97316',
};

function genSuivi(b) {
  const seed = b.id.charCodeAt(b.id.length - 1);
  const tauxP  = 65 + (seed % 30);
  const nbSess = 8 + (seed % 6);
  const faites = Math.round(nbSess * tauxP / 100);
  const COURS  = ['Grammaire B1','Speaking Practice','Listening','Writing Skills','Vocabulary','Business English'];
  const PROFS  = ['Marie Dupont','Pierre Martin','Sophie Leclerc'];
  const presences = Array.from({ length: nbSess }, (_, i) => ({
    date:   new Date(Date.now() - (nbSess - i) * 7 * 86400000).toLocaleDateString('fr-FR'),
    heure:  `${9 + (i % 3)}h00 – ${11 + (i % 3)}h00`,
    statut: i < faites ? 'present' : 'absent',
    cours:  COURS[i % 6],
    prof:   PROFS[i % 3],
  }));
  const aVenir = Array.from({ length: 3 }, (_, i) => ({
    date:  new Date(Date.now() + (i + 1) * 7 * 86400000).toLocaleDateString('fr-FR'),
    heure: `${9 + (i % 3)}h00 – ${11 + (i % 3)}h00`,
    titre: COURS[(nbSess + i) % 6],
    prof:  PROFS[(seed + i) % 3],
  }));
  const competences = [
    { lib: 'Compréhension orale',  pct: 45 + (seed % 40), icone: '👂' },
    { lib: 'Compréhension écrite', pct: 50 + (seed % 35), icone: '📖' },
    { lib: 'Expression orale',     pct: 40 + (seed % 45), icone: '🗣️' },
    { lib: 'Expression écrite',    pct: 55 + (seed % 30), icone: '✍️' },
  ];
  const evaluations = [
    { lib: 'Test de positionnement', note: 10 + (seed % 8), date: '2025-10-15' },
    { lib: 'Contrôle Grammaire',     note: 12 + (seed % 6), date: '2025-11-20' },
    { lib: 'Speaking Assessment',    note: 11 + (seed % 7), date: '2025-12-10' },
  ];
  const niveauSuivant = { A1:'A2', A2:'B1', B1:'B2', B2:'C1', C1:'C2', C2:'C2' };
  return { tauxP, nbSess, faites, presences, aVenir, competences, evaluations,
    objectifNiveau: b.niveau_cecr ? niveauSuivant[b.niveau_cecr] : 'B1' };
}

// ── Modal détail bénéficiaire ─────────────────────────────────────────────────

function ModalDetailBenef({ benef, entreprise, onFermer }) {
  const { profile } = useAuth();
  const alerte = useAlerte();
  const [tab, setTab] = useState('suivi');
  const [filtreDebut,   setFiltreDebut]   = useState('');
  const [filtreFin,     setFiltreFin]     = useState('');
  const [filtreStatut,  setFiltreStatut]  = useState('tous');
  // ── Onglet Accès ──
  const [accesInfo,   setAccesInfo]   = useState(null);   // profil-acces response
  const [accesLoad,   setAccesLoad]   = useState(false);
  const [accesCree,   setAccesCree]   = useState(null);   // résultat creer-acces
  const [accesCreeLd, setAccesCreeLd] = useState(false);
  const [copieCle,    setCopieCle]    = useState('');
  const [realPresences,  setRealPresences]  = useState(null);
  const [presencesLoad,  setPresencesLoad]  = useState(false);
  // ── Blocage absences (système auto-suspension e-learning) ──
  const [blocageStatus,   setBlocageStatus]   = useState(null);  // { acces_bloque, nb_absences }
  const [blocageLoad,     setBlocageLoad]     = useState(false);
  const [deblocageLd,     setDeblocageLd]     = useState(false);
  const [motifDeblocage,  setMotifDeblocage]  = useState('');
  const isElearning = benef._source === 'elearning' && !!benef.id;

  // Parent tab - contact info (editable locally)
  const [localParent, setLocalParent] = useState({
    prenom:    benef.prenom_parent    || '',
    nom:       benef.nom_parent       || '',
    email:     benef.email_parent     || '',
    telephone: benef.telephone_parent || '',
  });
  const [editingParent,  setEditingParent]  = useState(false);
  const [savingParent,   setSavingParent]   = useState(false);
  const [saveParentErr,  setSaveParentErr]  = useState('');
  const [parentAccesBenef,    setParentAccesBenef]    = useState(null);
  const [parentAccesBenefLd,  setParentAccesBenefLd]  = useState(false);
  const [parentAccesBenefErr, setParentAccesBenefErr] = useState('');

  // Charger le compte parent existant quand l'onglet parent s'ouvre
  useEffect(() => {
    if (tab !== 'parent' || parentAccesBenef || parentAccesBenefLd) return;
    const emailParent = localParent.email;
    if (!emailParent) return;
    setParentAccesBenefLd(true);
    fetch(`${_API_URL_ADMIN}/api/apprenants/acces-parent?email=${encodeURIComponent(emailParent)}`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => { if (d.existe) setParentAccesBenef(d); })
      .catch(() => {})
      .finally(() => setParentAccesBenefLd(false));
  }, [tab, editingParent]);

  async function sauvegarderInfosParent() {
    if (!benef.id || savingParent) return;
    setSavingParent(true); setSaveParentErr('');
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/classes-elearning/apprenants/${benef.id}`, {
        method: 'PATCH',
        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prenom_parent:    localParent.prenom  || null,
          nom_parent:       localParent.nom     || null,
          email_parent:     localParent.email   || null,
          telephone_parent: localParent.telephone || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setSaveParentErr(d.error || 'Erreur lors de la sauvegarde'); return; }
      setEditingParent(false);
      setParentAccesBenef(null); // reset so useEffect re-fetches account if email changed
    } catch (e) {
      setSaveParentErr(e.message);
    } finally {
      setSavingParent(false);
    }
  }

  const benAge = benef.date_naissance
    ? Math.floor((Date.now() - new Date(benef.date_naissance)) / (365.25*24*3600*1000))
    : null;
  const benTranche = benef.profil_type && benef.profil_type !== 'adulte'
    ? benef.profil_type
    : (benAge !== null ? (benAge <= 12 ? 'enfant' : benAge <= 17 ? 'adolescent' : 'adulte') : 'adulte');
  const hasParentBenef = !!(localParent.email || localParent.prenom || localParent.nom || localParent.telephone);
  const showParentTabBenef = benTranche === 'enfant' || benTranche === 'adolescent';

  useEffect(() => {
    setPresencesLoad(true);
    let url;
    if (isElearning) {
      url = `${_API_URL_ADMIN}/api/elearning/apprenants/${benef.id}/presences`;
    } else {
      const email = benef.email || benef.email_benef || null;
      if (!email) { setRealPresences([]); setPresencesLoad(false); return; }
      url = `${_API_URL_ADMIN}/api/elearning/apprenants/by-email/presences?email=${encodeURIComponent(email)}`;
    }
    fetch(url, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => {
        const list = d.presences || [];
        const mapped = list.map(p => ({
          date: p.seance?.date ? new Date(p.seance.date).toLocaleDateString('fr-FR') : '-',
          heure: p.seance?.heure_debut ? p.seance.heure_debut.slice(0,5) : '-',
          cours: p.seance?.objectifs_session || '-',
          statut: p.statut || 'absent',
        }));
        setRealPresences(mapped);
      })
      .catch(() => setRealPresences([]))
      .finally(() => setPresencesLoad(false));
  }, [benef.id, benef.email, benef.email_benef, isElearning]);

  const suivi = genSuivi(benef);
  const cfg   = STATUT_BEN[benef.statut] || STATUT_BEN.en_attente;
  const niv   = benef.niveau_cecr;

  useEffect(() => {
    if (tab !== 'acces') return;
    if (accesInfo !== null) return;
    const emailBenef = benef.email || benef.email_benef || null;
    // Un enfant sans contact propre se voit attribuer un identifiant technique
    // (<nom>@betacademy.app) différent de l'email affiché ici (celui du parent) - on vérifie
    // alors par apprenant_id, seul lien fiable vers le vrai compte de connexion.
    const parBenefId = benef.apprenant_id
      ? `apprenant_id=${encodeURIComponent(benef.apprenant_id)}`
      : emailBenef ? `email=${encodeURIComponent(emailBenef)}` : null;
    if (!parBenefId) { setAccesInfo({ has_account: false, profil: null, _no_email: true }); return; }
    setAccesLoad(true);
    fetch(`${_API_URL_ADMIN}/api/apprenants/profil-acces?${parBenefId}`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setAccesInfo(d))
      .catch(() => setAccesInfo({ has_account: false, profil: null }))
      .finally(() => setAccesLoad(false));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'acces' || !isElearning || blocageStatus !== null) return;
    setBlocageLoad(true);
    fetch(`${_API_URL_ADMIN}/api/elearning/apprenants/${benef.id}/acces-status`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setBlocageStatus(d))
      .catch(() => setBlocageStatus({ acces_bloque: false, nb_absences: 0 }))
      .finally(() => setBlocageLoad(false));
  }, [tab, isElearning, blocageStatus]);

  async function debloquerApprenant() {
    if (!benef.id || deblocageLd) return;
    setDeblocageLd(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/elearning/apprenants/${benef.id}/suspension`, {
        method: 'PATCH',
        headers: _authHdrsAdmin(),
        body: JSON.stringify({ bloque: false }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setBlocageStatus({ acces_bloque: false, nb_absences: 0 });
      setMotifDeblocage('');
    } catch (err) { await alerte('Erreur : ' + err.message, { danger: true }); }
    finally { setDeblocageLd(false); }
  }

  async function genererAcces() {
    if (accesCreeLd) return;
    const emailBenef = benef.email || benef.email_benef || null;
    const nom        = benef.nom_complet?.split(' ').slice(1).join(' ') || benef.nom || '';
    const prenom     = benef.nom_complet?.split(' ')[0]                 || benef.prenom || '';
    setAccesCreeLd(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/apprenants/creer-acces`, {
        method: 'POST',
        headers: _authHdrsAdmin(),
        body: JSON.stringify({
          nom, prenom, email: emailBenef, telephone: benef.telephone || null,
          // Permet au backend de détecter directement si cet email/tel est celui du parent
          // et de générer un identifiant @betacademy.app pour l'enfant dans ce cas - sans ça,
          // la protection ne s'appliquait que si le compte parent existait déjà (ordre de création).
          email_parent:     benef.email_parent     || null,
          telephone_parent: benef.telephone_parent || null,
          // Lie le compte créé à cette fiche (classes_elearning_apprenants.apprenant_id) -
          // indispensable pour la retrouver après un rechargement quand le login réel de
          // l'enfant (identifiant technique) diffère de l'email affiché ici (celui du parent).
          cea_id: benef._source === 'elearning' ? benef.id : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setAccesCree(d);
      setAccesInfo({ has_account: true, profil: { ...d, mdp_temporaire: true } });
    } catch (err) { await alerte('Erreur : ' + err.message, { danger: true }); }
    finally { setAccesCreeLd(false); }
  }

  function copier(texte, cle) {
    navigator.clipboard?.writeText(texte).catch(() => {});
    setCopieCle(cle);
    setTimeout(() => setCopieCle(''), 2500);
  }

  const TABS = [
    { id:'suivi',      lib:'Suivi',        icone:'📈' },
    { id:'presences',  lib:'Présences',    icone:'✅' },
    { id:'competences',lib:'Compétences',  icone:'🎯' },
    { id:'evaluations',lib:'Évaluations',  icone:'📝' },
    { id:'acces',      lib:'Accès',        icone:'🔐' },
    ...(showParentTabBenef ? [{ id:'parent', lib:'Parent', icone:'👨‍👩‍👧' }] : []),
  ];

  const row = (l, v) => (
    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13 }}>
      <span style={{ color:COULEURS.gris600 }}>{l}</span>
      <span style={{ fontWeight:600, color:COULEURS.navy }}>{v || '-'}</span>
    </div>
  );

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, backdropFilter:'blur(3px)' }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', height:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.3)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ background:`linear-gradient(135deg, ${entreprise.couleur}CC, ${entreprise.couleur})`, padding:'20px 24px', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ display:'flex', gap:14, alignItems:'center' }}>
              <div style={{ width:48, height:48, borderRadius:12, background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:800, color:'#fff' }}>
                {benef.prenom[0]}{benef.nom[0]}
              </div>
              <div>
                <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>{benef.prenom} {benef.nom}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:2 }}>{benef.poste} · {entreprise.nom}</div>
              </div>
            </div>
            <button onClick={onFermer} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:18, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>
          {(() => {
            const pList = realPresences || [];
            const pPres = pList.filter(p => p.statut === 'present').length;
            const pTaux = pList.length > 0 ? Math.round((pPres / pList.length) * 100) : null;
            return (
          <div style={{ display:'flex', gap:20, marginTop:14 }}>
            {[
              { l:'Niveau', v: niv ? <span style={{ background:NIV_COULEUR[niv], color:'#fff', padding:'1px 8px', borderRadius:6, fontSize:12, fontWeight:700 }}>{niv}</span> : '-' },
              { l:'Présence', v: pTaux !== null ? `${pTaux}%` : (presencesLoad ? '…' : '-') },
              { l:'Sessions', v: pList.length > 0 ? `${pPres}/${pList.length}` : '-' },
              { l:'Statut', v:<span style={{ background:cfg.bg, color:cfg.txt, padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:700 }}>{cfg.lib}</span> },
            ].map((s, i) => (
              <div key={i} style={{ textAlign:'center' }}>
                <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>{s.v}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{s.l}</div>
              </div>
            ))}
          </div>
            );
          })()}
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', background:COULEURS.blanc, borderBottom:`1px solid ${COULEURS.gris200}`, padding:'0 8px', flexShrink:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding:'10px 14px', border:'none', background:'transparent', borderBottom: tab===t.id ? `2px solid ${entreprise.couleur}` : '2px solid transparent', color: tab===t.id ? entreprise.couleur : COULEURS.gris600, fontWeight: tab===t.id ? 700 : 500, fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
              <span>{t.icone}</span><span>{t.lib}</span>
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div style={{ flex:1, overflowY:'auto', padding:24 }}>

          {/* ── Suivi global ── */}
          {tab === 'suivi' && (() => {
            const pList = realPresences || [];
            const pPres = pList.filter(p => p.statut === 'present').length;
            const taux  = pList.length > 0 ? Math.round((pPres / pList.length) * 100) : 0;
            return (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
                {row('Email', benef.email)}
                {row('Téléphone', benef.telephone)}
                {row('Poste', benef.poste)}
                {row('Niveau CECR actuel', niv || 'Non évalué')}
                {row('Inscrit le', benef.date_inscription ? new Date(benef.date_inscription).toLocaleDateString('fr-FR') : null)}
                {benef.date_naissance && row('Date de naissance', new Date(benef.date_naissance).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }))}
                {benAge !== null && row('Âge', `${benAge} ans`)}
                {benTranche !== 'adulte' && row('Profil', benTranche === 'enfant' ? '🧒 Enfant (≤ 12 ans)' : '🧑 Adolescent (13–17 ans)')}
                {benef.classe && row('Classe scolaire', benef.classe)}
                {row('Sessions assistées', pList.length > 0 ? `${pPres} présent(s) / ${pList.length} total` : '-')}
              </div>
              {/* Barre présence */}
              {pList.length > 0 && (
                <div style={{ background:COULEURS.gris50, borderRadius:12, padding:'16px 20px', marginBottom:16 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:8 }}>
                    <span style={{ fontWeight:600, color:COULEURS.navy }}>Taux de présence</span>
                    <span style={{ fontWeight:800, color: taux >= 80 ? COULEURS.succes : COULEURS.attention }}>{taux}%</span>
                  </div>
                  <div style={{ height:10, background:COULEURS.gris200, borderRadius:5, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${taux}%`, background: taux >= 80 ? COULEURS.succes : COULEURS.attention, borderRadius:5, transition:'width 0.5s' }} />
                  </div>
                </div>
              )}
              {/* Dernières présences */}
              {pList.length > 0 && (
                <>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:10 }}>📋 Dernières présences</div>
                  {pList.slice(0, 5).map((p, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', background:COULEURS.gris50, borderRadius:8, marginBottom:8, fontSize:12 }}>
                      <div>
                        <div style={{ fontWeight:600, color:COULEURS.navy }}>{p.cours}</div>
                        <div style={{ color:COULEURS.gris600, marginTop:2 }}>{p.date} · {p.heure}</div>
                      </div>
                      <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700,
                        background: p.statut==='present'?'#D1FAE5': p.statut==='retard'?'#FEF3C7':'#FEE2E2',
                        color: p.statut==='present'?'#065F46': p.statut==='retard'?'#92400E':'#991B1B' }}>
                        {p.statut === 'present' ? '✓ Présent' : p.statut === 'retard' ? '⚠ Retard' : '✗ Absent'}
                      </span>
                    </div>
                  ))}
                </>
              )}
              {pList.length === 0 && !presencesLoad && (
                <div style={{ textAlign:'center', padding:'32px 20px', color:COULEURS.gris400, fontSize:13, border:`1px dashed ${COULEURS.gris200}`, borderRadius:12 }}>
                  Aucune session enregistrée pour ce bénéficiaire
                </div>
              )}
            </>
            );
          })()}

          {/* ── Présences ── */}
          {tab === 'presences' && (() => {
            function parseFR(s) {
              if (!s || s === '-') return null;
              const [d, m, y] = s.split('/');
              return new Date(`${y}-${m}-${d}`);
            }
            const debut = filtreDebut ? new Date(filtreDebut) : null;
            const fin   = filtreFin   ? new Date(filtreFin)   : null;

            function setPeriode(moisArriere) {
              const auj = new Date();
              const d   = new Date(auj);
              d.setMonth(d.getMonth() - moisArriere);
              setFiltreDebut(d.toISOString().slice(0,10));
              setFiltreFin(auj.toISOString().slice(0,10));
            }

            const pAll = realPresences || [];
            const presencesFiltrees = pAll.filter(p => {
              const d = parseFR(p.date);
              if (!d) return true;
              if (debut && d < debut) return false;
              if (fin   && d > fin)   return false;
              if (filtreStatut !== 'tous' && p.statut !== filtreStatut) return false;
              return true;
            });

            const nbPresent = presencesFiltrees.filter(p => p.statut === 'present').length;
            const nbAbsent  = presencesFiltrees.filter(p => p.statut === 'absent').length;
            const tauxFilt  = presencesFiltrees.length > 0 ? Math.round((nbPresent / presencesFiltrees.length) * 100) : 0;
            const actif     = filtreDebut || filtreFin || filtreStatut !== 'tous';

            if (presencesLoad) return (
              <div style={{ textAlign:'center', padding:48, color:COULEURS.gris400, fontSize:13 }}>⏳ Chargement des présences…</div>
            );

            return (
              <>
                {/* ── Filtres ── */}
                <div style={{ background:COULEURS.blanc, borderRadius:12, border:`1px solid ${COULEURS.gris200}`, padding:'12px 14px', marginBottom:14 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:COULEURS.navy }}>🔍 Filtrer les présences</span>
                    {actif && (
                      <button onClick={() => { setFiltreDebut(''); setFiltreFin(''); setFiltreStatut('tous'); }}
                        style={{ fontSize:11, color:'#EF4444', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:6, padding:'3px 9px', cursor:'pointer', fontWeight:600, fontFamily:'inherit' }}>
                        ✕ Effacer les filtres
                      </button>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
                    {[
                      { l:'Tout',    fn: () => { setFiltreDebut(''); setFiltreFin(''); } },
                      { l:'Ce mois', fn: () => setPeriode(0) },
                      { l:'3 mois',  fn: () => setPeriode(3) },
                      { l:'6 mois',  fn: () => setPeriode(6) },
                      { l:'1 an',    fn: () => setPeriode(12) },
                    ].map(p => (
                      <button key={p.l} onClick={p.fn}
                        style={{ padding:'4px 12px', borderRadius:20, border:`1px solid ${COULEURS.gris200}`,
                          background:COULEURS.gris50, color:COULEURS.navy, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                        {p.l}
                      </button>
                    ))}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Du</div>
                      <input type="date" value={filtreDebut} onChange={e => setFiltreDebut(e.target.value)}
                        style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy }} />
                    </div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Au</div>
                      <input type="date" value={filtreFin} onChange={e => setFiltreFin(e.target.value)}
                        style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy }} />
                    </div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Statut</div>
                      <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
                        style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy, background:COULEURS.blanc }}>
                        <option value="tous">Tous</option>
                        <option value="present">Présent</option>
                        <option value="absent">Absent</option>
                        <option value="retard">Retard</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* ── KPIs ── */}
                <div style={{ display:'flex', gap:10, marginBottom:14 }}>
                  {[
                    { l:'Présent', v: nbPresent,               c: COULEURS.succes },
                    { l:'Absent',  v: nbAbsent,                c: '#EF4444' },
                    { l:'Total',   v: presencesFiltrees.length, c: COULEURS.navy },
                    { l:'Taux',    v: `${tauxFilt}%`,          c: tauxFilt >= 75 ? COULEURS.succes : tauxFilt >= 50 ? COULEURS.attention : '#EF4444' },
                  ].map(k => (
                    <div key={k.l} style={{ flex:1, background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}`, borderRadius:10, padding:'10px', textAlign:'center' }}>
                      <div style={{ fontSize:18, fontWeight:800, color:k.c }}>{k.v}</div>
                      <div style={{ fontSize:10, color:COULEURS.gris600 }}>{k.l}</div>
                    </div>
                  ))}
                </div>

                {/* ── Tableau ── */}
                <div style={{ background:COULEURS.blanc, borderRadius:10, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr 1fr', padding:'9px 14px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    <span>Date</span><span>Heure</span><span>Session</span><span>Statut</span>
                  </div>
                  {presencesFiltrees.length === 0 ? (
                    <div style={{ padding:'28px', textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>
                      {realPresences === null ? '⏳ Chargement…' : 'Aucune présence enregistrée'}
                    </div>
                  ) : presencesFiltrees.map((p, i) => (
                    <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr 1fr', padding:'10px 14px', borderBottom: i < presencesFiltrees.length - 1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:12, alignItems:'center', background: p.statut === 'absent' ? '#FFF5F5' : 'transparent' }}>
                      <span style={{ color:COULEURS.navy, fontWeight:600 }}>{p.date}</span>
                      <span style={{ color:COULEURS.gris600 }}>{p.heure}</span>
                      <span style={{ color:COULEURS.navy }}>{p.cours}</span>
                      <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700,
                        background: p.statut==='present'?'#D1FAE5': p.statut==='retard'?'#FEF3C7':'#FEE2E2',
                        color: p.statut==='present'?'#065F46': p.statut==='retard'?'#92400E':'#991B1B' }}>
                        {p.statut === 'present' ? '✓ Présent' : p.statut === 'retard' ? '⚠ Retard' : '✗ Absent'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}

          {/* ── Compétences ── */}
          {tab === 'competences' && (
            <>
              {niv && (
                <div style={{ background:`${NIV_COULEUR[niv]}20`, border:`1px solid ${NIV_COULEUR[niv]}40`, borderRadius:12, padding:'14px 18px', marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:4 }}>Niveau CECR actuel</div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ background:NIV_COULEUR[niv], color:'#fff', padding:'3px 12px', borderRadius:8, fontSize:16, fontWeight:800 }}>{niv}</span>
                  </div>
                </div>
              )}
              <div style={{ textAlign:'center', padding:'40px 20px', color:COULEURS.gris400, border:`1px dashed ${COULEURS.gris200}`, borderRadius:12 }}>
                <div style={{ fontSize:36, marginBottom:12 }}>🎯</div>
                <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Compétences bientôt disponibles</div>
                <div style={{ fontSize:12, color:COULEURS.gris600, lineHeight:1.6 }}>Le suivi des compétences sera affiché ici dès que des évaluations auront été enregistrées pour ce bénéficiaire.</div>
              </div>
            </>
          )}

          {/* ── Évaluations ── */}
          {tab === 'evaluations' && (
            <div style={{ textAlign:'center', padding:'40px 20px', color:COULEURS.gris400, border:`1px dashed ${COULEURS.gris200}`, borderRadius:12 }}>
              <div style={{ fontSize:36, marginBottom:12 }}>📝</div>
              <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Évaluations bientôt disponibles</div>
              <div style={{ fontSize:12, color:COULEURS.gris600, lineHeight:1.6 }}>Les résultats d'évaluations seront affichés ici une fois que des sessions d'évaluation auront eu lieu.</div>
            </div>
          )}

          {/* ── Accès ── */}
          {tab === 'acces' && (
            <div style={{ maxWidth:700 }}>
              {/* Info eligibilité */}
              <div style={{ background:`${entreprise.couleur}08`, border:`1px solid ${entreprise.couleur}25`, borderRadius:14, padding:'14px 18px', marginBottom:20, display:'flex', gap:12, alignItems:'flex-start' }}>
                <span style={{ fontSize:20, flexShrink:0 }}>🔐</span>
                <div style={{ fontSize:13, color:COULEURS.navy, lineHeight:1.6 }}>
                  La génération des accès crée un compte apprenant avec un <strong>mot de passe temporaire</strong>. L'apprenant pourra se connecter sur le portail BET e-learning uniquement si son <strong>test de niveau a été effectué</strong> et qu'une <strong>classe lui a été assignée</strong>.
                </div>
              </div>

              {accesLoad ? (
                <div style={{ textAlign:'center', padding:40, color:COULEURS.gris400 }}>⏳ Vérification du compte…</div>
              ) : accesInfo?._no_email ? (
                <div style={{ textAlign:'center', padding:'32px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:12, color:COULEURS.gris400 }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>📧</div>
                  <div style={{ fontSize:14, fontWeight:600, color:COULEURS.navy, marginBottom:6 }}>Aucun email renseigné</div>
                  <div style={{ fontSize:13 }}>Ajoutez un email à ce bénéficiaire pour pouvoir générer ses accès.</div>
                </div>
              ) : (
                <>
                  {/* Credentials si dispo */}
                  {(accesCree?.mdp_initial || (accesInfo?.profil?.mdp_initial && accesInfo?.profil?.mdp_temporaire)) && (
                    <div style={{ background:'#F0FDF4', border:'1.5px solid #86EFAC', borderRadius:14, padding:'18px 22px', marginBottom:20 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'#065F46', marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
                        🎉 Identifiants générés - à communiquer à l'apprenant
                      </div>
                      {[
                        { l:'Email / Identifiant', v: accesCree?.login_email || accesCree?.login_identifier || accesInfo?.profil?.login_email || accesInfo?.profil?.email || benef.email, cle:'email' },
                        { l:'Mot de passe temporaire', v: accesCree?.mdp_initial || accesInfo?.profil?.mdp_initial, cle:'mdp' },
                        { l:'URL de connexion', v: `${window.location.origin}/connexion/apprenant`, cle:'url' },
                      ].map(({l, v, cle}) => v ? (
                        <div key={cle} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(255,255,255,0.7)', borderRadius:8, padding:'10px 14px', marginBottom:8, gap:12 }}>
                          <div>
                            <div style={{ fontSize:10, fontWeight:700, color:'#166534', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:2 }}>{l}</div>
                            <div style={{ fontSize:14, fontWeight:700, color:'#14532D', fontFamily:'monospace' }}>{v}</div>
                          </div>
                          <button onClick={() => copier(v, cle)} style={{ padding:'5px 12px', borderRadius:7, border:'1px solid #86EFAC', background: copieCle===cle ? '#16A34A' : '#fff', color: copieCle===cle ? '#fff' : '#16A34A', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', transition:'all 0.2s', whiteSpace:'nowrap' }}>
                            {copieCle===cle ? '✅ Copié' : '📋 Copier'}
                          </button>
                        </div>
                      ) : null)}
                    </div>
                  )}

                  {/* Bouton générer / regénérer */}
                  <button
                    onClick={genererAcces}
                    disabled={accesCreeLd}
                    style={{ width:'100%', padding:'13px', borderRadius:10, border:'none', background: accesCreeLd ? COULEURS.gris200 : entreprise.couleur, color: accesCreeLd ? COULEURS.gris600 : '#fff', fontSize:14, fontWeight:700, cursor: accesCreeLd ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', transition:'all 0.2s' }}>
                    {accesCreeLd ? '⏳ Génération en cours…' : accesInfo?.has_account ? '🔄 Regénérer un mot de passe' : '🔑 Générer les accès'}
                  </button>
                  <div style={{ fontSize:11, color:COULEURS.gris400, textAlign:'center', marginTop:8 }}>
                    {accesInfo?.has_account ? 'Un nouveau mot de passe temporaire sera créé - l\'ancien sera invalidé.' : 'Un compte sera créé avec un mot de passe temporaire à communiquer à l\'apprenant.'}
                  </div>

                  {/* Renvoi des accès par email - envoi réel à configurer plus tard */}
                  {accesInfo?.has_account && (
                    <button
                      onClick={() => toast.success(`📧 Accès renvoyés par email à ${benef.email || benef.email_benef}`)}
                      style={{ width:'100%', padding:'12px', borderRadius:10, border:`1.5px solid ${entreprise.couleur}`, background:'#fff', color: entreprise.couleur, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', marginTop:10 }}>
                      📧 Renvoyer les accès par email
                    </button>
                  )}
                </>
              )}

              {/* ── Section Blocage Absences (apprenants e-learning uniquement) ── */}
              {isElearning && (
                <div style={{ marginTop:24 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                    <span style={{ fontSize:16 }}>🚫</span>
                    <span style={{ fontSize:14, fontWeight:700, color:COULEURS.navy }}>Blocage automatique - Absences</span>
                  </div>

                  {blocageLoad ? (
                    <div style={{ textAlign:'center', padding:24, color:COULEURS.gris400, fontSize:13 }}>⏳ Vérification…</div>
                  ) : blocageStatus === null ? null : (
                    <>
                      {/* Bannière si bloqué */}
                      {blocageStatus.acces_bloque && (
                        <div style={{ background:'#FEF2F2', border:'1.5px solid #FECACA', borderRadius:12, padding:'14px 18px', marginBottom:16, display:'flex', gap:12, alignItems:'flex-start' }}>
                          <span style={{ fontSize:20, flexShrink:0 }}>🔒</span>
                          <div>
                            <div style={{ fontSize:14, fontWeight:700, color:'#991B1B', marginBottom:4 }}>Accès bloqué automatiquement</div>
                            <div style={{ fontSize:12, color:'#B91C1C', lineHeight:1.5 }}>
                              Cet apprenant a atteint 4 absences consécutives. Son accès à la plateforme a été automatiquement suspendu.
                              Il faut le débloquer manuellement une fois le contact établi.
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Barre de progression absences */}
                      <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'16px 20px', marginBottom:16 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                          <span style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>Absences enregistrées</span>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:20, fontWeight:800, color: blocageStatus.acces_bloque ? '#DC2626' : blocageStatus.nb_absences >= 3 ? '#F59E0B' : COULEURS.succes }}>
                              {blocageStatus.nb_absences}
                            </span>
                            <span style={{ fontSize:13, color:COULEURS.gris400, fontWeight:600 }}>/4</span>
                          </div>
                        </div>
                        <div style={{ height:10, background:COULEURS.gris100, borderRadius:5, overflow:'hidden' }}>
                          <div style={{
                            height:'100%',
                            width:`${Math.min(100, (blocageStatus.nb_absences / 4) * 100)}%`,
                            background: blocageStatus.acces_bloque ? '#EF4444' : blocageStatus.nb_absences >= 3 ? '#F59E0B' : '#22C55E',
                            borderRadius:5,
                            transition:'width 0.4s',
                          }}/>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
                          {[1,2,3,4].map(n => (
                            <div key={n} style={{ textAlign:'center', flex:1 }}>
                              <div style={{ width:8, height:8, borderRadius:'50%', margin:'0 auto 3px', background: blocageStatus.nb_absences >= n ? (n >= 4 ? '#EF4444' : '#F59E0B') : COULEURS.gris200 }}/>
                              <div style={{ fontSize:9, color: blocageStatus.nb_absences >= n ? COULEURS.navy : COULEURS.gris400, fontWeight:600 }}>{n}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop:10, fontSize:11, color:COULEURS.gris500, textAlign:'center' }}>
                          {blocageStatus.acces_bloque
                            ? '🔒 Accès bloqué - débloquer pour remettre le compteur à zéro'
                            : blocageStatus.nb_absences >= 3
                              ? '⚠️ Attention - 1 absence supplémentaire entraînera un blocage automatique'
                              : `✅ ${4 - blocageStatus.nb_absences} absence(s) restante(s) avant blocage automatique`}
                        </div>
                      </div>

                      {/* Bouton débloquer (visible si bloqué + rôle autorisé) */}
                      {blocageStatus.acces_bloque && estRole(profile?.role, ['admin_onboarding', 'admin_manager', 'admin_superviseur', 'admin_customer_care']) && (
                        <div style={{ background:'#F0FDF4', border:'1.5px solid #86EFAC', borderRadius:12, padding:'16px 20px' }}>
                          <div style={{ fontSize:13, fontWeight:700, color:'#065F46', marginBottom:10 }}>🔓 Débloquer l'accès</div>
                          <div style={{ fontSize:12, color:'#166534', marginBottom:12, lineHeight:1.5 }}>
                            Le déblocage réintègre l'apprenant immédiatement. Le compteur d'absences repart à zéro à partir de maintenant.
                          </div>
                          <textarea
                            value={motifDeblocage}
                            onChange={e => setMotifDeblocage(e.target.value)}
                            placeholder="Motif du déblocage (optionnel) : contact établi, justification reçue…"
                            rows={2}
                            style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif', resize:'vertical', outline:'none', boxSizing:'border-box', marginBottom:10 }}
                          />
                          <button
                            onClick={debloquerApprenant}
                            disabled={deblocageLd}
                            style={{ width:'100%', padding:'11px', borderRadius:9, border:'none', background: deblocageLd ? COULEURS.gris200 : '#16A34A', color: deblocageLd ? COULEURS.gris600 : '#fff', fontSize:13, fontWeight:700, cursor: deblocageLd ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', transition:'all 0.2s' }}>
                            {deblocageLd ? '⏳ Déblocage en cours…' : '🔓 Confirmer le déblocage'}
                          </button>
                        </div>
                      )}

                      {/* Message si pas le bon rôle */}
                      {blocageStatus.acces_bloque && !estRole(profile?.role, ['admin_onboarding', 'admin_manager', 'admin_superviseur', 'admin_customer_care']) && (
                        <div style={{ background:'#FEF9C3', border:'1px solid #FDE68A', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#92400E' }}>
                          ⚠️ Seul un agent Onboarding ou Customer Care peut débloquer cet accès.
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── PARENT ── */}
          {tab === 'parent' && (() => {
            const couleur = entreprise.couleur || '#0891B2';

            async function creerAccesParentBenef() {
              if (parentAccesBenefLd) return;
              if (!localParent.email && !localParent.telephone) {
                setParentAccesBenefErr('Renseignez d\'abord l\'email ou le téléphone du parent ci-dessus.');
                return;
              }
              setParentAccesBenefLd(true);
              setParentAccesBenefErr('');
              try {
                const r = await fetch(`${_API_URL_ADMIN}/api/apprenants/creer-acces-parent`, {
                  method: 'POST',
                  headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    prenom_parent:    localParent.prenom,
                    nom_parent:       localParent.nom,
                    email_parent:     localParent.email,
                    telephone_parent: localParent.telephone,
                    inscription_id:   benef.id,
                    enfant_nom:       `${benef.prenom} ${benef.nom}`,
                  }),
                });
                const d = await r.json();
                if (!r.ok) { setParentAccesBenefErr(d.error || 'Erreur serveur'); return; }
                setParentAccesBenef(d);
              } catch (e) {
                setParentAccesBenefErr(e.message);
              } finally {
                setParentAccesBenefLd(false);
              }
            }

            return (
              <div style={{ display:'flex', flexDirection:'column', gap:16, maxWidth:680 }}>

                {/* Carte parent */}
                <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:14, padding:'20px 24px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, paddingBottom:10, borderBottom:'1px solid #BAE6FD' }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'#0369A1' }}>👨‍👩‍👧 Contact parent / tuteur</div>
                    <button onClick={() => { setEditingParent(v => !v); setSaveParentErr(''); }}
                      style={{ fontSize:11, background:'none', border:'1px solid #BAE6FD', borderRadius:6, padding:'3px 10px', cursor:'pointer', color:'#0369A1', fontFamily:'inherit', fontWeight:600 }}>
                      {editingParent ? '✕ Annuler' : '✏️ Modifier'}
                    </button>
                  </div>
                  {editingParent ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {[
                        ['Prénom parent', 'prenom', 'text'],
                        ['Nom parent',    'nom',    'text'],
                        ['Email parent',  'email',  'email'],
                        ['Téléphone',     'telephone', 'tel'],
                      ].map(([label, key, type]) => (
                        <div key={key}>
                          <div style={{ fontSize:10, fontWeight:700, color:'#0369A1', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:3 }}>{label}</div>
                          <input type={type} value={localParent[key]}
                            onChange={e => setLocalParent(p => ({ ...p, [key]: e.target.value }))}
                            placeholder={label}
                            style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #BAE6FD', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy }} />
                        </div>
                      ))}
                      {saveParentErr && <div style={{ fontSize:12, color:'#DC2626', background:'#FEE2E2', borderRadius:6, padding:'8px 12px' }}>{saveParentErr}</div>}
                      <button onClick={sauvegarderInfosParent} disabled={savingParent}
                        style={{ padding:'9px 18px', borderRadius:8, border:'none', background:'#0369A1', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', alignSelf:'flex-start' }}>
                        {savingParent ? '⏳ Sauvegarde…' : '💾 Sauvegarder'}
                      </button>
                    </div>
                  ) : hasParentBenef ? (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                      {[
                        ['Prénom',    localParent.prenom],
                        ['Nom',       localParent.nom],
                        ['Email',     localParent.email],
                        ['Téléphone', localParent.telephone],
                      ].map(([l, v]) => (
                        <div key={l} style={{ background:COULEURS.blanc, border:'1px solid #BAE6FD', borderRadius:10, padding:'12px 16px' }}>
                          <div style={{ fontSize:10, fontWeight:700, color:'#0369A1', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>{l}</div>
                          <div style={{ fontSize:14, fontWeight:600, color:COULEURS.navy }}>{v || '-'}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign:'center', padding:'16px 0', color:COULEURS.gris400, fontSize:13 }}>
                      Aucune coordonnée parent enregistrée - cliquez sur <strong>✏️ Modifier</strong> pour les ajouter.
                    </div>
                  )}
                </div>

                {/* Profil enfant */}
                {benef.date_naissance && (
                  <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'14px 20px', display:'flex', gap:16, alignItems:'center' }}>
                    <span style={{ fontSize:28 }}>{benTranche === 'enfant' ? '🧒' : '🧑'}</span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>
                        {benTranche === 'enfant' ? 'Enfant' : 'Adolescent'} · {benAge} ans
                      </div>
                      <div style={{ fontSize:12, color:COULEURS.gris500, marginTop:2 }}>
                        Né(e) le {new Date(benef.date_naissance).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })}
                        {benef.classe ? ` · Classe : ${benef.classe}` : ''}
                      </div>
                    </div>
                  </div>
                )}

                {/* Créer accès parent */}
                {(() => {
                  const emailApprenant = (benef.email || '').toLowerCase().trim();
                  const emailParent    = (localParent.email || '').toLowerCase().trim();
                  const conflitEmail   = emailApprenant && emailParent && emailApprenant === emailParent;

                  return (
                  <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'20px 24px' }}>
                    <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:14, paddingBottom:10, borderBottom:`1px solid ${COULEURS.gris100}` }}>
                      🔐 Créer un accès Dashboard Parent
                    </div>

                    {/* ℹ️ Email partagé apprenant/parent - accès automatique */}
                    {conflitEmail && (
                      <div style={{ background:'#EFF6FF', border:'2px solid #BFDBFE', borderRadius:12, padding:'16px 20px', marginBottom:16 }}>
                        <div style={{ fontSize:14, fontWeight:800, color:'#1D4ED8', marginBottom:8 }}>
                          ℹ️ Accès parent déjà disponible
                        </div>
                        <div style={{ fontSize:13, color:'#1E40AF', lineHeight:1.7, marginBottom:12 }}>
                          L'email <strong>{emailParent}</strong> est aussi l'email de connexion de l'apprenant (cas d'un enfant sans email propre).<br/>
                          <strong>Ce parent peut déjà se connecter</strong> avec ces identifiants - il sera automatiquement redirigé vers le dashboard parent.
                        </div>
                        <div style={{ fontSize:12, fontWeight:700, color:'#1D4ED8', background:'#DBEAFE', borderRadius:8, padding:'10px 14px' }}>
                          ✅ Aucune action requise. Le parent utilise les mêmes identifiants que l'apprenant et accède directement à son espace parent.
                          Si vous souhaitez un compte parent séparé, renseignez un email différent via <strong>✏️ Modifier</strong>.
                        </div>
                        <button
                          onClick={() => toast.success(`📧 Accès renvoyés par email à ${emailParent}`)}
                          style={{ width:'100%', padding:'11px', borderRadius:10, border:'1.5px solid #1D4ED8', background:'#fff', color:'#1D4ED8', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', marginTop:12 }}>
                          📧 Renvoyer les accès par email
                        </button>
                      </div>
                    )}

                    {parentAccesBenefLd ? (
                      <div style={{ textAlign:'center', padding:'16px', color:COULEURS.gris400, fontSize:13 }}>⏳ Vérification du compte parent…</div>
                    ) : parentAccesBenef ? (
                      <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, padding:'16px 20px' }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#166534', marginBottom:10 }}>✅ Accès parent actif</div>
                        {[
                          ['Identifiant', parentAccesBenef.login_email],
                          parentAccesBenef.mdp_initial ? ['Mot de passe temporaire', parentAccesBenef.mdp_initial] : null,
                        ].filter(Boolean).map(([l, v]) => (
                          <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'6px 0', borderBottom:'1px solid #BBF7D0' }}>
                            <span style={{ color:'#166534' }}>{l}</span>
                            <span style={{ fontWeight:700, color:COULEURS.navy, fontFamily:'monospace' }}>{v}</span>
                          </div>
                        ))}
                        <div style={{ fontSize:11, color:'#166534', marginTop:10 }}>
                          {parentAccesBenef.mdp_initial
                            ? 'Le parent devra changer son mot de passe à la première connexion sur le portail parent BET E-Learning.'
                            : '✅ Le parent a déjà changé son mot de passe temporaire - compte actif.'}
                        </div>
                        <button
                          onClick={() => toast.success(`📧 Accès renvoyés par email à ${parentAccesBenef.login_email}`)}
                          style={{ width:'100%', padding:'11px', borderRadius:10, border:'1px solid #16A34A', background:'#fff', color:'#166534', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', marginTop:12 }}>
                          📧 Renvoyer les accès par email
                        </button>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize:13, color:COULEURS.gris600, marginBottom:14, lineHeight:'1.6' }}>
                          Crée un compte pour que le parent/tuteur puisse suivre la progression de son enfant sur le portail parent.
                          {!hasParentBenef && (
                            <span style={{ display:'block', marginTop:6, color:'#DC2626', fontWeight:600 }}>
                              ⚠️ Aucune coordonnée parent renseignée - cliquez sur ✏️ Modifier pour les ajouter.
                            </span>
                          )}
                        </div>
                        {parentAccesBenefErr && (
                          <div style={{ background:'#FEE2E2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#DC2626', marginBottom:12 }}>
                            {parentAccesBenefErr}
                          </div>
                        )}
                        <button
                          onClick={creerAccesParentBenef}
                          disabled={parentAccesBenefLd || !hasParentBenef || conflitEmail}
                          style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 22px', borderRadius:10, border:'none', background: (hasParentBenef && !conflitEmail) ? couleur : COULEURS.gris200, color: (hasParentBenef && !conflitEmail) ? '#fff' : COULEURS.gris400, fontWeight:700, fontSize:13, cursor: (hasParentBenef && !conflitEmail) ? 'pointer' : 'not-allowed', fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                        >
                          {parentAccesBenefLd ? '⏳ Création en cours…' : '🔑 Créer accès parent'}
                        </button>
                      </>
                    )}
                  </div>
                  );
                })()}
              </div>
            );
          })()}

        </div>
      </div>
    </div>
  );
}

// ── helpers formatage ────────────────────────────────────────────────────────
function formatFCFA(n) { return (n || 0).toLocaleString('fr-FR') + ' FCFA'; }
function joursRestants(dateFin) {
  return Math.ceil((new Date(dateFin) - new Date()) / (1000 * 60 * 60 * 24));
}
function dureeFormation(dateDebut, dateFin) {
  const d1 = new Date(dateDebut);
  const d2 = new Date(dateFin);
  const mois = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (mois >= 12 && mois % 12 === 0) return `${mois / 12} an${mois / 12 > 1 ? 's' : ''}`;
  if (mois >= 12) return `${Math.floor(mois / 12)} an${Math.floor(mois / 12) > 1 ? 's' : ''} et ${mois % 12} mois`;
  return `${mois} mois`;
}
function pctFormationEcoule(dateDebut, dateFin) {
  const debut = new Date(dateDebut).getTime();
  const fin   = new Date(dateFin).getTime();
  const now   = Date.now();
  if (now <= debut) return 0;
  if (now >= fin)   return 100;
  return Math.round(((now - debut) / (fin - debut)) * 100);
}
function fmtDateFr(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Modal détail classe (Admin BET / Onboarding) ─────────────────────────────

const NIV_COULEUR_ADM = { A0:'#94A3B8', A1:'#60A5FA', A2:'#34D399', B1:'#818CF8', B2:'#F59E0B', C1:'#F97316', C2:'#EF4444' };

// ── Onglet Sessions commun aux modals de détail classe ────────────────────────
const _SESS_PAGE = 10;

function OngletSessionsClasse({ classeId, coachNom, couleur }) {
  const [seances,      setSeances]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [erreur,       setErreur]       = useState(null);
  const [filtreDebut,  setFiltreDebut]  = useState('');
  const [filtreFin,    setFiltreFin]    = useState('');
  const [filtreStatut, setFiltreStatut] = useState('tous');
  const [page,         setPage]         = useState(0);

  useEffect(() => {
    if (!classeId) return;
    setLoading(true); setErreur(null);
    fetch(`${_API_URL_ADMIN}/api/elearning/seances?classe_id=${classeId}`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => {
        if (d.error) setErreur(d.error);
        else setSeances((d.seances || []).sort((a, b) => new Date(b.date) - new Date(a.date)));
      })
      .catch(e => setErreur(e.message))
      .finally(() => setLoading(false));
  }, [classeId]);

  // Réinitialise la page quand les filtres changent
  useEffect(() => { setPage(0); }, [filtreDebut, filtreFin, filtreStatut]);

  const STATUT = {
    planifiee: { lib: 'Planifiée', bg: '#EFF6FF', txt: '#1E40AF', dot: '#3B82F6' },
    realisee:  { lib: 'Réalisée',  bg: '#F0FDF4', txt: '#166534', dot: '#22C55E' },
    annulee:   { lib: 'Annulée',   bg: '#FEF2F2', txt: '#991B1B', dot: '#EF4444' },
  };

  const col = couleur || '#0891B2';

  function setPeriode(moisArriere) {
    const auj = new Date();
    const d   = new Date(auj);
    d.setMonth(d.getMonth() - moisArriere);
    setFiltreDebut(d.toISOString().slice(0, 10));
    setFiltreFin(auj.toISOString().slice(0, 10));
  }

  const seancesFiltrees = seances.filter(s => {
    if (filtreStatut !== 'tous' && s.statut !== filtreStatut) return false;
    if (filtreDebut && s.date && s.date < filtreDebut) return false;
    if (filtreFin   && s.date && s.date > filtreFin)   return false;
    return true;
  });

  const nbPages  = Math.ceil(seancesFiltrees.length / _SESS_PAGE);
  const pageCurr = Math.min(page, Math.max(0, nbPages - 1));
  const slice    = seancesFiltrees.slice(pageCurr * _SESS_PAGE, (pageCurr + 1) * _SESS_PAGE);
  const filtreActif = filtreDebut || filtreFin || filtreStatut !== 'tous';

  if (loading) return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:COULEURS.gris400 }}>
      <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
      <div style={{ fontSize:13 }}>Chargement des sessions…</div>
    </div>
  );

  if (erreur) return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:'#991B1B' }}>
      <div style={{ fontSize:32, marginBottom:12 }}>⚠️</div>
      <div style={{ fontSize:13 }}>{erreur}</div>
    </div>
  );

  return (
    <div>
      {/* KPIs globaux (toujours sur l'ensemble, pas filtrés) */}
      <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap' }}>
        {[
          { l:'Total',      v: seances.length,                                    c: col },
          { l:'Réalisées',  v: seances.filter(s=>s.statut==='realisee').length,   c: '#16A34A' },
          { l:'Planifiées', v: seances.filter(s=>s.statut==='planifiee').length,  c: '#2563EB' },
          { l:'Annulées',   v: seances.filter(s=>s.statut==='annulee').length,    c: '#DC2626' },
        ].map(({ l, v, c }) => (
          <div key={l} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'10px 18px', textAlign:'center', minWidth:110 }}>
            <div style={{ fontSize:22, fontWeight:800, color:c }}>{v}</div>
            <div style={{ fontSize:10, color:COULEURS.gris500, marginTop:2, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'12px 14px', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <span style={{ fontSize:12, fontWeight:700, color:COULEURS.navy }}>🔍 Filtrer les sessions</span>
          {filtreActif && (
            <button
              onClick={() => { setFiltreDebut(''); setFiltreFin(''); setFiltreStatut('tous'); }}
              style={{ fontSize:11, color:'#EF4444', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:6, padding:'3px 9px', cursor:'pointer', fontWeight:600, fontFamily:'inherit' }}>
              ✕ Effacer
            </button>
          )}
        </div>

        {/* Raccourcis période */}
        <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
          {[
            { l:'Tout',    fn: () => { setFiltreDebut(''); setFiltreFin(''); } },
            { l:'Ce mois', fn: () => setPeriode(0) },
            { l:'3 mois',  fn: () => setPeriode(3) },
            { l:'6 mois',  fn: () => setPeriode(6) },
            { l:'1 an',    fn: () => setPeriode(12) },
          ].map(p => (
            <button key={p.l} onClick={p.fn}
              style={{ padding:'4px 12px', borderRadius:20, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.gris50, color:COULEURS.navy, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
              {p.l}
            </button>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Du</div>
            <input type="date" value={filtreDebut} onChange={e => setFiltreDebut(e.target.value)}
              style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy }} />
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Au</div>
            <input type="date" value={filtreFin} onChange={e => setFiltreFin(e.target.value)}
              style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy }} />
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Statut</div>
            <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
              style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy, background:COULEURS.blanc }}>
              <option value="tous">Tous</option>
              <option value="realisee">Réalisée</option>
              <option value="planifiee">Planifiée</option>
              <option value="annulee">Annulée</option>
            </select>
          </div>
        </div>
      </div>

      {seances.length === 0 ? (
        <div style={{ textAlign:'center', padding:'56px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
          <div style={{ fontSize:44, marginBottom:14 }}>📅</div>
          <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>Aucune session enregistrée</div>
          <div style={{ fontSize:13, color:COULEURS.gris600, lineHeight:1.6, maxWidth:360, margin:'0 auto' }}>
            Les sessions de cours apparaîtront ici dès que le coach commencera à les saisir.
          </div>
          {coachNom && (
            <div style={{ marginTop:20, background:`${col}10`, border:`1px solid ${col}25`, borderRadius:10, padding:'10px 18px', display:'inline-block' }}>
              <span style={{ fontSize:13, color:COULEURS.navy }}>👨‍🏫 Coach : <strong>{coachNom}</strong></span>
            </div>
          )}
        </div>
      ) : seancesFiltrees.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 20px', border:`1px dashed ${COULEURS.gris200}`, borderRadius:12, color:COULEURS.gris400 }}>
          <div style={{ fontSize:32, marginBottom:10 }}>🔍</div>
          <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Aucune session sur cette période</div>
          <div style={{ fontSize:12 }}>Modifiez les filtres pour afficher d'autres sessions.</div>
        </div>
      ) : (
        <>
          {/* Compteur résultats */}
          <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:10 }}>
            {filtreActif
              ? `${seancesFiltrees.length} session${seancesFiltrees.length > 1 ? 's' : ''} filtrée${seancesFiltrees.length > 1 ? 's' : ''} sur ${seances.length}`
              : `${seances.length} session${seances.length > 1 ? 's' : ''}`
            }
            {nbPages > 1 && ` · page ${pageCurr + 1}/${nbPages}`}
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
            {slice.map((s, i) => {
              const st = STATUT[s.statut] || STATUT.planifiee;
              const duree = s.heure_debut && s.heure_fin
                ? (() => {
                    const [h1, m1] = s.heure_debut.split(':').map(Number);
                    const [h2, m2] = s.heure_fin.split(':').map(Number);
                    const diff = (h2*60+m2) - (h1*60+m1);
                    return diff > 0 ? `${Math.floor(diff/60)}h${String(diff%60).padStart(2,'0')}` : null;
                  })()
                : null;
              const lien = s.lien_zoom || s.lien_meet || s.lien_teams;

              return (
                <div key={s.id || i} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'14px 18px', display:'flex', gap:14, alignItems:'flex-start' }}>
                  {/* Bloc date */}
                  <div style={{ flexShrink:0, width:52, textAlign:'center', background:`${col}10`, border:`1px solid ${col}25`, borderRadius:10, padding:'8px 6px' }}>
                    <div style={{ fontSize:18, fontWeight:900, color:col, lineHeight:1 }}>
                      {s.date ? new Date(s.date).getDate() : '-'}
                    </div>
                    <div style={{ fontSize:9, fontWeight:700, color:col, textTransform:'uppercase', letterSpacing:'0.05em', marginTop:2 }}>
                      {s.date ? new Date(s.date).toLocaleDateString('fr-FR', { month:'short' }) : ''}
                    </div>
                    {s.date && (
                      <div style={{ fontSize:8, color:COULEURS.gris400, marginTop:1 }}>
                        {new Date(s.date).getFullYear()}
                      </div>
                    )}
                  </div>

                  {/* Infos */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                      <span style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>
                        {s.titre || s.type || 'Session de cours'}
                      </span>
                      <span style={{ background:st.bg, color:st.txt, borderRadius:20, padding:'2px 9px', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                        <span style={{ width:6, height:6, borderRadius:'50%', background:st.dot, display:'inline-block' }}/>
                        {st.lib}
                      </span>
                    </div>
                    <div style={{ display:'flex', gap:12, flexWrap:'wrap', fontSize:11, color:COULEURS.gris500 }}>
                      {s.heure_debut && <span>🕐 {s.heure_debut}{s.heure_fin ? ` → ${s.heure_fin}` : ''}{duree ? ` (${duree})` : ''}</span>}
                      {s.nb_presents != null && <span>👥 {s.nb_presents} présent{s.nb_presents !== 1 ? 's' : ''}</span>}
                      {lien && <span style={{ color:col }}>🔗 <a href={lien} target="_blank" rel="noreferrer" style={{ color:col, textDecoration:'none', fontWeight:600 }}>Lien visio</a></span>}
                    </div>
                    {(s.objectifs_session || s.compte_rendu || s.bilan_session) && (
                      <div style={{ marginTop:8, fontSize:12, color:COULEURS.gris600, background:COULEURS.gris50, borderRadius:8, padding:'8px 12px', lineHeight:1.5 }}>
                        {s.objectifs_session && <div><span style={{ fontWeight:600 }}>Objectifs :</span> {s.objectifs_session}</div>}
                        {s.compte_rendu     && <div style={{ marginTop: s.objectifs_session ? 4 : 0 }}><span style={{ fontWeight:600 }}>Compte-rendu :</span> {s.compte_rendu}</div>}
                        {s.bilan_session    && <div style={{ marginTop:4 }}><span style={{ fontWeight:600 }}>Bilan :</span> {s.bilan_session}</div>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {nbPages > 1 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <button
                onClick={() => setPage(0)}
                disabled={pageCurr === 0}
                style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background: pageCurr === 0 ? COULEURS.gris100 : COULEURS.blanc, color: pageCurr === 0 ? COULEURS.gris400 : COULEURS.navy, cursor: pageCurr === 0 ? 'default' : 'pointer', fontSize:13, fontFamily:'inherit' }}>
                «
              </button>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={pageCurr === 0}
                style={{ padding:'5px 12px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background: pageCurr === 0 ? COULEURS.gris100 : COULEURS.blanc, color: pageCurr === 0 ? COULEURS.gris400 : COULEURS.navy, cursor: pageCurr === 0 ? 'default' : 'pointer', fontSize:12, fontFamily:'inherit', fontWeight:600 }}>
                ‹ Préc.
              </button>
              {Array.from({ length: nbPages }, (_, i) => i).filter(i => Math.abs(i - pageCurr) <= 2).map(i => (
                <button key={i} onClick={() => setPage(i)}
                  style={{ padding:'5px 11px', borderRadius:7, border:`1px solid ${i === pageCurr ? col : COULEURS.gris200}`, background: i === pageCurr ? col : COULEURS.blanc, color: i === pageCurr ? '#fff' : COULEURS.navy, cursor:'pointer', fontSize:12, fontFamily:'inherit', fontWeight: i === pageCurr ? 800 : 500 }}>
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(nbPages - 1, p + 1))}
                disabled={pageCurr === nbPages - 1}
                style={{ padding:'5px 12px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background: pageCurr === nbPages - 1 ? COULEURS.gris100 : COULEURS.blanc, color: pageCurr === nbPages - 1 ? COULEURS.gris400 : COULEURS.navy, cursor: pageCurr === nbPages - 1 ? 'default' : 'pointer', fontSize:12, fontFamily:'inherit', fontWeight:600 }}>
                Suiv. ›
              </button>
              <button
                onClick={() => setPage(nbPages - 1)}
                disabled={pageCurr === nbPages - 1}
                style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background: pageCurr === nbPages - 1 ? COULEURS.gris100 : COULEURS.blanc, color: pageCurr === nbPages - 1 ? COULEURS.gris400 : COULEURS.navy, cursor: pageCurr === nbPages - 1 ? 'default' : 'pointer', fontSize:13, fontFamily:'inherit' }}>
                »
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Onglet Présences réelles d'une classe ────────────────────────────────────
const _PRES_PAGE = 15;

function OngletPresencesClasse({ classeId, couleur }) {
  const [presences,    setPresences]    = useState([]);
  const [seances,      setSeances]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [erreur,       setErreur]       = useState(null);
  const [filtreSea,    setFiltreSea]    = useState('toutes');
  const [filtreStatut, setFiltreStatut] = useState('tous');
  const [filtreDebut,  setFiltreDebut]  = useState('');
  const [filtreFin,    setFiltreFin]    = useState('');
  const [page,         setPage]         = useState(0);

  useEffect(() => {
    if (!classeId) return;
    setLoading(true); setErreur(null);
    fetch(`${_API_URL_ADMIN}/api/elearning/classes/${classeId}/presences`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErreur(d.error); return; }
        setPresences(d.presences || []);
        setSeances(d.seances || []);
      })
      .catch(e => setErreur(e.message))
      .finally(() => setLoading(false));
  }, [classeId]);

  useEffect(() => { setPage(0); }, [filtreSea, filtreStatut, filtreDebut, filtreFin]);

  const col      = couleur || '#0891B2';
  const fmtDate  = d => d ? new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }) : '-';
  const FOND_S   = { present:'#D1FAE5', absent:'#FEE2E2', retard:'#FEF3C7' };
  const TEXTE_S  = { present:'#065F46', absent:'#991B1B', retard:'#92400E' };
  const LABEL_S  = { present:'✅ Présent', absent:'❌ Absent', retard:'⏱ Retard' };

  function setPeriode(moisArriere) {
    const auj = new Date();
    const d   = new Date(auj);
    d.setMonth(d.getMonth() - moisArriere);
    setFiltreDebut(d.toISOString().slice(0, 10));
    setFiltreFin(auj.toISOString().slice(0, 10));
  }

  const presencesFiltrees = presences.filter(p => {
    if (filtreSea !== 'toutes' && p.seance_id !== filtreSea) return false;
    if (filtreStatut !== 'tous' && p.statut !== filtreStatut) return false;
    const dateSeance = p.seance?.date;
    if (filtreDebut && dateSeance && dateSeance < filtreDebut) return false;
    if (filtreFin   && dateSeance && dateSeance > filtreFin)   return false;
    return true;
  });

  const nbTotal   = presencesFiltrees.length;
  const nbPresent = presencesFiltrees.filter(p => p.statut === 'present').length;
  const nbAbsent  = presencesFiltrees.filter(p => p.statut === 'absent').length;
  const nbRetard  = presencesFiltrees.filter(p => p.statut === 'retard').length;
  const taux      = nbTotal > 0 ? Math.round(nbPresent / nbTotal * 100) : null;

  const nbPages  = Math.ceil(presencesFiltrees.length / _PRES_PAGE);
  const pageCurr = Math.min(page, Math.max(0, nbPages - 1));
  const slice    = presencesFiltrees.slice(pageCurr * _PRES_PAGE, (pageCurr + 1) * _PRES_PAGE);
  const filtreActif = filtreSea !== 'toutes' || filtreStatut !== 'tous' || filtreDebut || filtreFin;

  if (loading) return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:COULEURS.gris400 }}>
      <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
      <div style={{ fontSize:13 }}>Chargement des présences…</div>
    </div>
  );
  if (erreur) return (
    <div style={{ textAlign:'center', padding:'40px 20px', color:'#991B1B', fontSize:13 }}>⚠️ {erreur}</div>
  );

  return (
    <div>
      {/* KPIs globaux */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        {[
          { l:'Présents',      v: presences.filter(p=>p.statut==='present').length, c:'#16A34A' },
          { l:'Absents',       v: presences.filter(p=>p.statut==='absent').length,  c:'#DC2626' },
          { l:'Retards',       v: presences.filter(p=>p.statut==='retard').length,  c:'#D97706' },
          { l:'Taux global',   v: presences.length > 0 ? `${Math.round(presences.filter(p=>p.statut==='present').length/presences.length*100)}%` : '-',
            c: presences.length === 0 ? COULEURS.gris400 : Math.round(presences.filter(p=>p.statut==='present').length/presences.length*100) >= 75 ? '#16A34A' : '#D97706' },
        ].map(k => (
          <div key={k.l} style={{ flex:1, minWidth:80, background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}`, borderRadius:10, padding:'10px', textAlign:'center' }}>
            <div style={{ fontSize:20, fontWeight:800, color:k.c }}>{k.v}</div>
            <div style={{ fontSize:10, color:COULEURS.gris600, marginTop:2 }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'12px 14px', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <span style={{ fontSize:12, fontWeight:700, color:COULEURS.navy }}>🔍 Filtrer les présences</span>
          {filtreActif && (
            <button
              onClick={() => { setFiltreSea('toutes'); setFiltreStatut('tous'); setFiltreDebut(''); setFiltreFin(''); }}
              style={{ fontSize:11, color:'#EF4444', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:6, padding:'3px 9px', cursor:'pointer', fontWeight:600, fontFamily:'inherit' }}>
              ✕ Effacer
            </button>
          )}
        </div>

        {/* Raccourcis période */}
        <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
          {[
            { l:'Tout',    fn: () => { setFiltreDebut(''); setFiltreFin(''); } },
            { l:'Ce mois', fn: () => setPeriode(0) },
            { l:'3 mois',  fn: () => setPeriode(3) },
            { l:'6 mois',  fn: () => setPeriode(6) },
            { l:'1 an',    fn: () => setPeriode(12) },
          ].map(p => (
            <button key={p.l} onClick={p.fn}
              style={{ padding:'4px 12px', borderRadius:20, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.gris50, color:COULEURS.navy, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
              {p.l}
            </button>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10 }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Du</div>
            <input type="date" value={filtreDebut} onChange={e => setFiltreDebut(e.target.value)}
              style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy }} />
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Au</div>
            <input type="date" value={filtreFin} onChange={e => setFiltreFin(e.target.value)}
              style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy }} />
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Statut</div>
            <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
              style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy, background:COULEURS.blanc }}>
              <option value="tous">Tous</option>
              <option value="present">Présent</option>
              <option value="absent">Absent</option>
              <option value="retard">Retard</option>
            </select>
          </div>
          {seances.length > 0 && (
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:4 }}>Session</div>
              <select value={filtreSea} onChange={e => setFiltreSea(e.target.value)}
                style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:COULEURS.navy, background:COULEURS.blanc }}>
                <option value="toutes">Toutes ({seances.length})</option>
                {seances.map(s => (
                  <option key={s.id} value={s.id}>
                    {fmtDate(s.date)} - {s.objectifs_session || 'Séance'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Résultats filtrés KPIs */}
      {filtreActif && nbTotal > 0 && (
        <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
          {[
            { l:'Présents (filtre)',  v: nbPresent, c:'#16A34A' },
            { l:'Absents (filtre)',   v: nbAbsent,  c:'#DC2626' },
            { l:'Total (filtre)',     v: nbTotal,   c: col },
            { l:'Taux (filtre)',      v: taux !== null ? `${taux}%` : '-', c: taux >= 75 ? '#16A34A' : '#D97706' },
          ].map(k => (
            <div key={k.l} style={{ flex:1, minWidth:70, background:`${k.c}08`, border:`1px solid ${k.c}30`, borderRadius:8, padding:'8px', textAlign:'center' }}>
              <div style={{ fontSize:16, fontWeight:800, color:k.c }}>{k.v}</div>
              <div style={{ fontSize:9, color:COULEURS.gris600, marginTop:1 }}>{k.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tableau */}
      {presences.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
          <div style={{ fontSize:40, marginBottom:10 }}>📋</div>
          <div style={{ fontSize:14, fontWeight:600, color:COULEURS.navy, marginBottom:6 }}>Aucune présence enregistrée</div>
          <div style={{ fontSize:12 }}>Les présences apparaissent dès que le coach clôture une session.</div>
        </div>
      ) : presencesFiltrees.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 20px', border:`1px dashed ${COULEURS.gris200}`, borderRadius:12, color:COULEURS.gris400 }}>
          <div style={{ fontSize:32, marginBottom:10 }}>🔍</div>
          <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Aucun résultat pour ces filtres</div>
          <div style={{ fontSize:12 }}>Modifiez les filtres pour afficher d'autres présences.</div>
        </div>
      ) : (
        <>
          <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:8 }}>
            {filtreActif
              ? `${nbTotal} résultat${nbTotal > 1 ? 's' : ''} sur ${presences.length} présences`
              : `${presences.length} présence${presences.length > 1 ? 's' : ''}`
            }
            {nbPages > 1 && ` · page ${pageCurr + 1}/${nbPages}`}
          </div>

          <div style={{ background:COULEURS.blanc, borderRadius:12, overflow:'hidden', border:`1px solid ${COULEURS.gris200}`, marginBottom:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1.2fr 1fr', padding:'9px 14px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
              <span>Apprenant</span><span>Session</span><span>Date</span><span>Statut</span>
            </div>
            {slice.map((p, i) => {
              const nom = p.inscription?.nom_complet || '-';
              const seance = p.seance;
              return (
                <div key={p.id || i} style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1.2fr 1fr', padding:'10px 14px', borderBottom: i < slice.length - 1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:12, alignItems:'center', background: p.statut === 'absent' ? '#FFF5F5' : 'transparent' }}>
                  <div>
                    <div style={{ fontWeight:600, color:COULEURS.navy }}>{nom}</div>
                    {p.inscription?.niveau_cecr && <div style={{ fontSize:10, color:COULEURS.gris400 }}>{p.inscription.niveau_cecr}</div>}
                  </div>
                  <span style={{ color:COULEURS.gris700, fontSize:11 }}>{seance?.objectifs_session || '-'}</span>
                  <span style={{ color:COULEURS.gris600 }}>{fmtDate(seance?.date)}</span>
                  <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700, background: FOND_S[p.statut] || COULEURS.gris100, color: TEXTE_S[p.statut] || COULEURS.gris600, display:'inline-block' }}>
                    {LABEL_S[p.statut] || p.statut}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {nbPages > 1 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <button onClick={() => setPage(0)} disabled={pageCurr === 0}
                style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background: pageCurr===0?COULEURS.gris100:COULEURS.blanc, color: pageCurr===0?COULEURS.gris400:COULEURS.navy, cursor: pageCurr===0?'default':'pointer', fontSize:13, fontFamily:'inherit' }}>«</button>
              <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={pageCurr===0}
                style={{ padding:'5px 12px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background: pageCurr===0?COULEURS.gris100:COULEURS.blanc, color: pageCurr===0?COULEURS.gris400:COULEURS.navy, cursor: pageCurr===0?'default':'pointer', fontSize:12, fontFamily:'inherit', fontWeight:600 }}>‹ Préc.</button>
              {Array.from({ length: nbPages }, (_, i) => i).filter(i => Math.abs(i - pageCurr) <= 2).map(i => (
                <button key={i} onClick={() => setPage(i)}
                  style={{ padding:'5px 11px', borderRadius:7, border:`1px solid ${i===pageCurr?col:COULEURS.gris200}`, background: i===pageCurr?col:COULEURS.blanc, color: i===pageCurr?'#fff':COULEURS.navy, cursor:'pointer', fontSize:12, fontFamily:'inherit', fontWeight: i===pageCurr?800:500 }}>
                  {i+1}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(nbPages-1, p+1))} disabled={pageCurr===nbPages-1}
                style={{ padding:'5px 12px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background: pageCurr===nbPages-1?COULEURS.gris100:COULEURS.blanc, color: pageCurr===nbPages-1?COULEURS.gris400:COULEURS.navy, cursor: pageCurr===nbPages-1?'default':'pointer', fontSize:12, fontFamily:'inherit', fontWeight:600 }}>Suiv. ›</button>
              <button onClick={() => setPage(nbPages-1)} disabled={pageCurr===nbPages-1}
                style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background: pageCurr===nbPages-1?COULEURS.gris100:COULEURS.blanc, color: pageCurr===nbPages-1?COULEURS.gris400:COULEURS.navy, cursor: pageCurr===nbPages-1?'default':'pointer', fontSize:13, fontFamily:'inherit' }}>»</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Onglet Accès d'une classe ─────────────────────────────────────────────────
function OngletAccesClasse({ benefs, couleur }) {
  const alerte = useAlerte();
  const col = couleur || '#0891B2';
  // Réinitialiser le mot de passe d'un compte existant n'est pas du ressort de
  // l'Assistant E-Learning - seule la création d'un tout premier accès l'est.
  const rolePhysique = (() => { try { return JSON.parse(localStorage.getItem('admin_profil') || '{}')?.role; } catch { return null; } })();
  const peutReinitialiserMdp = rolePhysique !== 'assistant_elearning';
  const [enCours,  setEnCours]  = useState({});  // { [benef_id]: true }
  const [resultats, setResultats] = useState({}); // { [benef_id]: { mdp, email, erreur } }
  const [copies,   setCopies]   = useState({});   // { [key]: true }

  async function creerAcces(b) {
    if (enCours[b.id]) return;
    // Pas de blocage si l'email est absent : le backend génère alors un identifiant
    // @betacademy.app (via téléphone ou nom+prénom) - voir creerAccesApprenantCore.
    const email = b.email || b.email_benef || null;
    setEnCours(prev => ({ ...prev, [b.id]: true }));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/apprenants/creer-acces`, {
        method: 'POST',
        headers: _authHdrsAdmin(),
        body: JSON.stringify({
          email,
          nom:    b.nom    || b.nom_complet?.split(' ').slice(1).join(' ') || '',
          prenom: b.prenom || b.nom_complet?.split(' ')[0] || '',
          telephone: b.telephone || null,
          // Permet au backend de détecter directement si cet email/tel est celui du parent
          // et de générer un identifiant @betacademy.app pour l'enfant dans ce cas.
          email_parent:     b.email_parent     || null,
          telephone_parent: b.telephone_parent || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur lors de la création');
      setResultats(prev => ({ ...prev, [b.id]: { email: d.login_email || email, mdp: d.mdp_initial } }));
    } catch (err) {
      setResultats(prev => ({ ...prev, [b.id]: { erreur: err.message } }));
    } finally {
      setEnCours(prev => ({ ...prev, [b.id]: false }));
    }
  }

  function copier(texte, cle) {
    navigator.clipboard?.writeText(texte).catch(() => {});
    setCopies(prev => ({ ...prev, [cle]: true }));
    setTimeout(() => setCopies(prev => ({ ...prev, [cle]: false })), 2000);
  }

  const nbActifs   = benefs.filter(b => b.acces_elearning).length;
  const nbSansAcces = benefs.filter(b => !b.acces_elearning).length;

  if (benefs.length === 0) return (
    <div style={{ textAlign:'center', padding:48, color:COULEURS.gris400, fontSize:13 }}>
      Aucun bénéficiaire dans cette classe.
    </div>
  );

  return (
    <div>
      {/* Explication */}
      <div style={{ background:`${col}08`, border:`1px solid ${col}25`, borderRadius:12, padding:'14px 18px', marginBottom:16, display:'flex', gap:12, alignItems:'flex-start' }}>
        <span style={{ fontSize:20, flexShrink:0 }}>🔐</span>
        <div style={{ fontSize:13, color:COULEURS.navy, lineHeight:1.7 }}>
          <strong>Accès plateforme BET e-learning.</strong> Chaque bénéficiaire a besoin d'un compte pour se connecter.
          Cliquez sur <strong>Créer l'accès</strong> pour générer un identifiant et un mot de passe temporaire à lui communiquer.
          S'il a déjà un compte, le bouton recrée un nouveau mot de passe temporaire.
        </div>
      </div>

      {/* Résumé */}
      <div style={{ display:'flex', gap:10, marginBottom:16 }}>
        {[
          { l:'Compte actif',    v: nbActifs,    c:'#16A34A' },
          { l:'Sans compte',     v: nbSansAcces, c:'#D97706' },
          { l:'Total',           v: benefs.length, c: col },
        ].map(k => (
          <div key={k.l} style={{ flex:1, background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}`, borderRadius:10, padding:'10px', textAlign:'center' }}>
            <div style={{ fontSize:20, fontWeight:800, color:k.c }}>{k.v}</div>
            <div style={{ fontSize:10, color:COULEURS.gris600, marginTop:2 }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Liste */}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {benefs.map(b => {
          const nom    = b.nom_complet || `${b.prenom||''} ${b.nom||''}`.trim() || '-';
          const email  = b.email || b.email_benef || null;
          const actif  = b.acces_elearning ?? false;
          const load   = enCours[b.id] || false;
          const res    = resultats[b.id] || null;

          return (
            <div key={b.id} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'14px 18px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, color:COULEURS.navy, fontSize:13 }}>{nom}</div>
                  <div style={{ fontSize:11, color:COULEURS.gris500, marginTop:2 }}>{email || <span style={{ color:'#D97706' }}>⚠ Pas d'email renseigné</span>}</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                  <span style={{ padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:700,
                    background: actif ? '#D1FAE5' : '#FEF3C7',
                    color:      actif ? '#065F46' : '#92400E' }}>
                    {actif ? '✅ Compte actif' : '⚠ Pas de compte'}
                  </span>
                  {email && (actif ? peutReinitialiserMdp : true) && (
                    <button
                      onClick={() => creerAcces(b)}
                      disabled={load}
                      style={{ padding:'6px 14px', borderRadius:8, border:`1px solid ${col}`, background: load ? COULEURS.gris100 : actif ? COULEURS.blanc : col, color: load ? COULEURS.gris400 : actif ? col : '#fff', fontSize:11, fontWeight:700, cursor: load ? 'not-allowed' : 'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                      {load ? '⏳ En cours…' : actif ? '🔄 Nouveau mdp' : '🔑 Créer l\'accès'}
                    </button>
                  )}
                  {email && actif && !peutReinitialiserMdp && (
                    <span style={{ fontSize:10, color:COULEURS.gris400, fontStyle:'italic' }}>Réinitialisation réservée à Onboarding</span>
                  )}
                </div>
              </div>

              {/* Résultat après création */}
              {res && !res.erreur && (
                <div style={{ marginTop:12, background:'#F0FDF4', border:'1px solid #86EFAC', borderRadius:10, padding:'12px 16px' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#065F46', marginBottom:10 }}>
                    🎉 Identifiants générés - à communiquer à {nom.split(' ')[0]}
                  </div>
                  {[
                    { l:'Email / Identifiant', v: res.email, k:`${b.id}-email` },
                    { l:'Mot de passe temporaire', v: res.mdp, k:`${b.id}-mdp` },
                    { l:'URL de connexion', v: `${window.location.origin}/connexion/apprenant`, k:`${b.id}-url` },
                  ].map(({ l, v, k }) => v ? (
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(255,255,255,0.7)', borderRadius:8, padding:'8px 12px', marginBottom:6, gap:10 }}>
                      <div>
                        <div style={{ fontSize:9, fontWeight:700, color:'#166534', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:1 }}>{l}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:'#14532D', fontFamily:'monospace' }}>{v}</div>
                      </div>
                      <button onClick={() => copier(v, k)}
                        style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #86EFAC', background: copies[k] ? '#16A34A' : '#fff', color: copies[k] ? '#fff' : '#16A34A', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                        {copies[k] ? '✓ Copié' : 'Copier'}
                      </button>
                    </div>
                  ) : null)}
                </div>
              )}
              {res?.erreur && (
                <div style={{ marginTop:10, background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#991B1B' }}>
                  ⚠ Erreur : {res.erreur}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModalDetailClasseAdmin({ classe, entreprise, onFermer, onOuvrirBenef, onStatutChange }) {
  const [tab, setTab] = useState('infos');
  const couleur  = entreprise.couleur || '#0891B2';
  const benefs   = classe.apprenants || [];
  const horaires = Array.isArray(classe.horaire) ? classe.horaire : [];
  const FORMAT   = { en_ligne:'🌐 En ligne', presentiel:'🏢 Présentiel', hybride:'🔀 Hybride' };
  const niv      = classe.niveau;

  const TABS = [
    { id:'infos',         lib:'Infos',          icone:'ℹ️' },
    { id:'beneficiaires', lib:'Bénéficiaires',  icone:'👥', badge: benefs.length },
    { id:'presences',     lib:'Présences',      icone:'✅' },
    { id:'sessions',      lib:'Sessions',       icone:'📅' },
    { id:'acces',         lib:'Accès',          icone:'🔐' },
  ];

  const row = (l, v) => v ? (
    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13, gap:12 }}>
      <span style={{ color:COULEURS.gris600, flexShrink:0 }}>{l}</span>
      <span style={{ fontWeight:600, color:COULEURS.navy, textAlign:'right' }}>{v}</span>
    </div>
  ) : null;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1500, backdropFilter:'blur(3px)' }}
      onClick={onFermer}>
      <div style={{ background:COULEURS.blanc, borderRadius:20, width:'90vw', height:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 40px 100px rgba(0,0,0,0.35)', overflow:'hidden' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background:`linear-gradient(135deg, ${couleur}CC, ${couleur})`, padding:'20px 26px', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <div style={{ width:48, height:48, borderRadius:12, background:'rgba(255,255,255,0.2)', border:'2px solid rgba(255,255,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>🏫</div>
              <div>
                <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>{classe.nom}</div>
                <div style={{ display:'flex', gap:8, marginTop:5, flexWrap:'wrap', alignItems:'center' }}>
                  {niv && <span style={{ background:NIV_COULEUR_ADM[niv]||'rgba(255,255,255,0.3)', color:'#fff', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:800 }}>{niv}</span>}
                  {classe.type_cours && <span style={{ background:'rgba(255,255,255,0.18)', color:'rgba(255,255,255,0.85)', borderRadius:20, padding:'2px 8px', fontSize:11 }}>{FORMAT[classe.type_cours]||classe.type_cours}</span>}
                  <span style={{ background: classe.statut==='actif' ? '#D1FAE5' : '#FEF3C7', color: classe.statut==='actif' ? '#065F46' : '#92400E', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:700 }}>
                    {classe.statut === 'actif' ? 'Active' : classe.statut}
                  </span>
                  <span style={{ color:'rgba(255,255,255,0.75)', fontSize:12 }}>· {benefs.length} bénéficiaire{benefs.length!==1?'s':''}</span>
                </div>
              </div>
            </div>
            <button onClick={onFermer} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:34, height:34, cursor:'pointer', fontSize:18, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, padding:'0 20px', flexShrink:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding:'12px 16px', border:'none', borderBottom: tab===t.id ? `2.5px solid ${couleur}` : '2.5px solid transparent', background:'none', color: tab===t.id ? couleur : COULEURS.gris600, fontWeight: tab===t.id ? 700 : 500, fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
              <span>{t.icone}</span>{t.lib}
              {t.badge > 0 && <span style={{ background:couleur, color:'#fff', borderRadius:20, padding:'1px 6px', fontSize:10, fontWeight:700, marginLeft:2 }}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>

          {/* INFOS */}
          {tab === 'infos' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, maxWidth:860 }}>
              <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'18px 20px' }}>
                <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:10, paddingBottom:8, borderBottom:`1px solid ${COULEURS.gris100}` }}>📋 Détails</div>
                {row('Nom',        classe.nom)}
                {row('Niveau',     niv)}
                {row('Format',     FORMAT[classe.type_cours] || classe.type_cours)}
                {row('Statut',     classe.statut === 'actif' ? '✅ Active' : classe.statut)}
                {row('Capacité',   classe.capacite_max ? `${benefs.length} / ${classe.capacite_max} places` : null)}
                {row('Entreprise', classe.entreprise_nom)}
              </div>
              <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'18px 20px' }}>
                <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:10, paddingBottom:8, borderBottom:`1px solid ${COULEURS.gris100}` }}>👨‍🏫 Encadrement & Dates</div>
                {row('Coach',      classe.coach_nom || '- Non assigné')}
                {row('Date début', classe.date_debut ? new Date(classe.date_debut).toLocaleDateString('fr-FR') : null)}
                {row('Date fin',   classe.date_fin   ? new Date(classe.date_fin).toLocaleDateString('fr-FR')   : null)}
                {row('Type',       '🎓 E-Learning BET')}
              </div>
              {horaires.length > 0 && (
                <div style={{ gridColumn:'1/-1', background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'18px 20px' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${COULEURS.gris100}` }}>📅 Disponibilités - créneaux horaires</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                    {horaires.map((h, i) => (
                      <div key={i} style={{ background:`${couleur}10`, border:`1px solid ${couleur}30`, borderRadius:10, padding:'8px 14px', display:'flex', gap:10, alignItems:'center' }}>
                        <span style={{ fontSize:13, fontWeight:700, color:couleur }}>{h.jour}</span>
                        <span style={{ fontSize:12, color:COULEURS.navy, fontWeight:600 }}>{h.debut} – {h.fin}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {niv && (
                <div style={{ gridColumn:'1/-1', background:`${NIV_COULEUR_ADM[niv]||couleur}10`, border:`1px solid ${NIV_COULEUR_ADM[niv]||couleur}30`, borderRadius:12, padding:'16px 20px', display:'flex', gap:16, alignItems:'center' }}>
                  <div style={{ width:56, height:56, borderRadius:12, background:NIV_COULEUR_ADM[niv]||couleur, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:900, color:'#fff', flexShrink:0 }}>{niv}</div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:3 }}>{{ A0:'Faux débutant', A1:'Débutant', A2:'Élémentaire', B1:'Intermédiaire', B2:'Intermédiaire supérieur', C1:'Avancé', C2:'Maîtrise' }[niv]||niv}</div>
                    <div style={{ fontSize:12, color:COULEURS.gris600 }}>Niveau CECR de la classe - test de placement requis</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* BÉNÉFICIAIRES */}
          {tab === 'beneficiaires' && (
            <>
              <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
                {[
                  { l:'Total',               v:benefs.length,                                  c:couleur },
                  { l:'Actifs',              v:benefs.filter(b=>b.statut==='actif').length,     c:'#059669' },
                  { l:'Niveaux renseignés',  v:benefs.filter(b=>b.niveau_cecr).length,         c:'#7C3AED' },
                ].map(({l,v,c}) => (
                  <div key={l} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'10px 16px', textAlign:'center', minWidth:120 }}>
                    <div style={{ fontSize:20, fontWeight:800, color:c }}>{v}</div>
                    <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:2 }}>{l}</div>
                  </div>
                ))}
              </div>
              {benefs.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:12, color:COULEURS.gris400 }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>👥</div>
                  <div>Aucun bénéficiaire dans cette classe.</div>
                </div>
              ) : (
                <div style={{ background:COULEURS.blanc, borderRadius:12, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                  <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 1fr 70px', padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    <span>Bénéficiaire</span><span>Contact</span><span>Niveau</span><span>Statut</span><span></span>
                  </div>
                  {benefs.map((b, i) => {
                    const nom  = b.nom_complet || `${b.prenom||''} ${b.nom||''}`.trim() || '-';
                    const init = nom.split(/\s+/).map(p=>p[0]||'').slice(0,2).join('').toUpperCase();
                    const nv   = b.niveau_cecr;
                    return (
                      <div key={b.id} style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 1fr 70px', padding:'10px 16px', borderBottom: i < benefs.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', alignItems:'center', fontSize:12 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:30, height:30, borderRadius:8, background:`${couleur}18`, border:`1.5px solid ${couleur}35`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:couleur, flexShrink:0 }}>{init}</div>
                          <div style={{ fontWeight:700, color:COULEURS.navy }}>{nom}</div>
                        </div>
                        <span style={{ color:COULEURS.gris600, fontSize:11 }}>{b.email || b.telephone || '-'}</span>
                        <span>{nv ? <span style={{ background:NIV_COULEUR_ADM[nv]||couleur, color:'#fff', borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{nv}</span> : <span style={{ color:COULEURS.gris400 }}>-</span>}</span>
                        <span style={{ background: b.statut==='suspendu' ? '#FEE2E2' : '#D1FAE5', color: b.statut==='suspendu' ? '#991B1B' : '#065F46', borderRadius:20, padding:'2px 8px', fontSize:10, fontWeight:700, display:'inline-block' }}>
                          {b.statut === 'suspendu' ? 'Suspendu' : 'Actif'}
                        </span>
                        <button onClick={() => onOuvrirBenef({ ...b, _source: 'elearning', prenom: b.prenom || nom.split(' ')[0], nom: b.nom || nom.split(' ').slice(1).join(' ') || nom })}
                          style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${couleur}`, background:`${couleur}10`, color:couleur, cursor:'pointer', fontSize:10, fontFamily:'"Plus Jakarta Sans",sans-serif', fontWeight:600 }}>
                          👁 Détail
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* PRÉSENCES */}
          {tab === 'presences' && (
            <OngletPresencesClasse classeId={classe.id} couleur={couleur} />
          )}

          {/* SESSIONS */}
          {tab === 'sessions' && (
            <OngletSessionsClasse classeId={classe.id} coachNom={classe.coach_nom} couleur={couleur} />
          )}

          {/* ACCÈS */}
          {tab === 'acces' && (
            <OngletAccesClasse benefs={benefs} couleur={couleur} />
          )}

        </div>
      </div>
    </div>
  );
}

// ── Onglet Entreprises ────────────────────────────────────────────────────────

function ModalOnboardingEntreprise({ entreprise, onFermer, onPreuveSupprimee, onEntrepriseMaj }) {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const { profile } = useAuth();
  const confirm = useConfirm();
  const alerte = useAlerte();
  /* `super_admin` ajouté : le repli `profile.permissions.crm_entreprises` ne les
       rattrapait PAS. La base leur accorde le module `crm`, et le serveur sait que
       `crm_entreprises` retombe sur `crm` (MODULE_FALLBACK_PARENT) — mais ce repli n'existe
       que dans `requirePermission`. L'interface, elle, lit la clé exacte : absente, donc
       bouton grisé pour qui a pourtant le droit.
       L'Administrateur, lui, reste en lecture sur les entreprises — demande explicite. */
    const peutModifier = estRole(profile?.role, ['super_admin', 'admin_elearning', 'admin_commercial']) || profile?.permissions?.crm_entreprises?.update === true;

  const [tab, setTab]           = useState('beneficiaires');
  const [benDetail, setBen]     = useState(null);
  const [typesSessionsLocal, setTypesSessionsLocal] = useState(entreprise.types_sessions || ['ligne']);

  // ── Contrat (renouvellement + statut) - module dédié "contrat", distinct de "crm_entreprises" ──
  const peutGererContrat = estRole(profile?.role, ['admin_manager', 'admin_superviseur']) || profile?.permissions?.contrat?.update === true;
  // L'assistante e-learning a le droit "créer" (pas "modifier") sur ce module : elle peut donc
  // proposer un renouvellement, mais seul l'admin BET (peutGererContrat) peut le valider.
  const peutProposerRenouvellement = !peutGererContrat && profile?.permissions?.contrat?.create === true;
  const [contratActif, setContratActif] = useState(null);
  const [contratsHistorique, setContratsHistorique] = useState([]);
  const [modalRenouvellement, setModalRenouvellement] = useState(false);
  const [contratHistoriqueOuvert, setContratHistoriqueOuvert] = useState(null);
  useEffect(() => {
    if (tab !== 'contrat') return;
    fetch(`${_API_URL_ADMIN}/api/entreprise/admin/contrats`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => {
        const ceux = (d.contrats || []).filter(c => c.entreprise_id === entreprise.id);
        setContratActif(ceux.find(c => c.statut === 'actif') || ceux[0] || null);
        setContratsHistorique(ceux);
      })
      .catch(() => {});
  }, [tab, entreprise.id]);

  async function changerStatutContratLocal(statut) {
    if (!contratActif) return;
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/contrat/${contratActif.id}/statut`, {
        method: 'PATCH', headers: _authHdrsAdmin(), body: JSON.stringify({ statut }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erreur lors du changement de statut'); return; }
      setContratActif(d.contrat);
      toast.success('Statut du contrat mis à jour ✓');
    } catch (e) {
      toast.error('Erreur réseau');
    }
  }

  async function renouvelerContratLocal(form) {
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/renouveler-contrat`, {
        method: 'POST', headers: _authHdrsAdmin(), body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erreur lors du renouvellement du contrat'); return false; }
      setContratActif(d.contrat);
      setContratsHistorique(prev => [d.contrat, ...prev.map(c => c.id !== d.contrat.id ? { ...c, statut: 'expire' } : c)]);
      onEntrepriseMaj?.(d.entreprise);
      toast.success('Contrat renouvelé ✓');
      return true;
    } catch (e) {
      toast.error('Erreur réseau');
      return false;
    }
  }

  async function proposerRenouvellementLocal(form) {
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/proposer-renouvellement`, {
        method: 'POST', headers: _authHdrsAdmin(), body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erreur lors de la proposition de renouvellement'); return false; }
      setContratsHistorique(prev => [d.contrat, ...prev]);
      toast.success('Renouvellement proposé - en attente de validation par l\'admin BET ✓');
      return true;
    } catch (e) {
      toast.error('Erreur réseau');
      return false;
    }
  }

  async function validerRenouvellementLocal(contratId) {
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/contrat/${contratId}/valider-renouvellement`, {
        method: 'PATCH', headers: _authHdrsAdmin(),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erreur lors de la validation du renouvellement'); return; }
      setContratActif(d.contrat);
      setContratsHistorique(prev => prev.map(c => {
        if (c.id === d.contrat.id) return d.contrat;
        if (c.entreprise_id === d.contrat.entreprise_id && c.id !== d.contrat.id && c.statut === 'actif') return { ...c, statut: 'expire' };
        return c;
      }));
      onEntrepriseMaj?.(d.entreprise);
      toast.success('Renouvellement validé ✓');
    } catch (e) {
      toast.error('Erreur réseau');
    }
  }

  // ── Documents entreprise ──
  const [documents, setDocuments]       = useState([]);
  const [docsEnSuppression, setDocsEnSuppression] = useState(new Set()); // empêche le double-clic supprimer document
  const [chargDocs, setChargDocs]       = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  // La "preuve d'inscription" est désormais une ligne réelle de entreprise_documents
  // (type='preuve_inscription', voir syncPreuveDocument côté backend) - plus besoin de la
  // fabriquer côté client à partir de entreprise.fichier_preuve_url.
  const documentsAffiches = documents;
  useEffect(() => {
    if (tab !== 'documents') return;
    setChargDocs(true);
    fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/documents`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setDocuments(d.documents || []))
      .catch(() => {})
      .finally(() => setChargDocs(false));
  }, [tab, entreprise.id]);

  const [docFichierEnAttente, setDocFichierEnAttente] = useState(null); // { file } - sélectionné mais pas encore déposé
  function deposerDocument(e) {
    const fichier = e.target.files[0];
    e.target.value = '';
    if (!fichier) return;
    if (fichier.size > 10 * 1024 * 1024) { alerte('Fichier trop lourd (max 10 Mo).', { danger: true }); return; }
    setDocFichierEnAttente(fichier);
  }
  async function validerDepotDocument() {
    const fichier = docFichierEnAttente;
    if (!fichier || docUploading) return;
    setDocUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', fichier);
      const resUpload = await fetchUpload(`${_API_URL_ADMIN}/api/upload/document`, {
        method: 'POST', headers: { Authorization: _authHdrsAdmin().Authorization }, body: fd,
      });
      const dataUpload = await resUpload.json();
      if (!resUpload.ok) throw new Error(dataUpload.error || 'Erreur serveur');

      const resDoc = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/documents`, {
        method: 'POST', headers: _authHdrsAdmin(),
        body: JSON.stringify({ nom: fichier.name, url: dataUpload.file.url, format: dataUpload.file.format, taille: dataUpload.file.size }),
      });
      const dataDoc = await resDoc.json();
      if (!resDoc.ok) throw new Error(dataDoc.error || 'Erreur serveur');
      setDocuments(prev => [dataDoc.document, ...prev]);
      setDocFichierEnAttente(null);
    } catch (err) {
      await alerte('Impossible de déposer le document : ' + err.message, { danger: true });
    } finally {
      setDocUploading(false);
    }
  }

  async function supprimerDocument(docId) {
    if (docsEnSuppression.has(docId)) return;
    if (!(await confirm('Supprimer ce document ?', { titre: 'Supprimer le document' }))) return;
    setDocsEnSuppression(prev => new Set(prev).add(docId));
    try {
      const docSupprime = documents.find(d => d.id === docId);
      const res = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/documents/${docId}`, {
        method: 'DELETE', headers: _authHdrsAdmin(),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erreur serveur'); }
      setDocuments(prev => prev.filter(d => d.id !== docId));
      // Le backend vide déjà comptes_entreprises.fichier_preuve_url dans ce cas - on répercute
      // ça sur l'état local pour que le formulaire d'édition ne le fasse pas réapparaître.
      if (docSupprime?.type === 'preuve_inscription') onPreuveSupprimee?.();
    } catch (err) {
      await alerte('Impossible de supprimer : ' + err.message, { danger: true });
    } finally {
      setDocsEnSuppression(prev => { const n = new Set(prev); n.delete(docId); return n; });
    }
  }

  // ── Classes e-learning ──
  const [classes,      setClasses]      = useState([]);
  const [chargClasses, setChargClasses] = useState(true);
  const [modalCl,      setModalCl]      = useState(null); // classe ouverte en modal
  useEffect(() => {
    fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/classes`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setClasses(d.classes || []))
      .catch(() => {})
      .finally(() => setChargClasses(false));
  }, [entreprise.id]);

  function handleStatutBenefAdmin(benefId, newStatut) {
    setModalCl(prev => prev ? ({
      ...prev,
      apprenants: (prev.apprenants || []).map(a => a.id === benefId ? { ...a, statut: newStatut } : a),
    }) : prev);
  }

  // ── Bénéficiaires réels ──
  const [benefs,      setBenefs]      = useState([]);
  const [chargBenefs, setChargBenefs] = useState(true);
  useEffect(() => {
    fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/beneficiaires`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setBenefs(d.beneficiaires || []))
      .catch(console.error)
      .finally(() => setChargBenefs(false));
  }, [entreprise.id]);

  // ── Credentials RH ──
  const [credentials,  setCredentials]  = useState(null);
  const [chargCred,    setChargCred]    = useState(false);
  const [showCred,     setShowCred]     = useState(false);
  const [mdpVisible,   setMdpVisible]   = useState(false);
  const [copie,        setCopie]        = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [createForm,   setCreateForm]   = useState({ prenom:'', nom:'', email: entreprise.referent_rh_email || '' });
  const [createLoading,setCreateLoading]= useState(false);

  function voirAcces() {
    if (credentials) { setShowCred(true); return; }
    setChargCred(true);
    fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/credentials`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => { if (d.credentials) setCredentials(d.credentials); else setCredentials({ error: d.error }); setShowCred(true); })
      .catch(() => setCredentials({ error: 'Erreur réseau' }))
      .finally(() => setChargCred(false));
  }

  async function reinitialiserMdp() {
    if (resetLoading) return;
    setResetLoading(true);
    try {
      const res = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/reset-password`, {
        method: 'PATCH', headers: _authHdrsAdmin(),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur serveur');
      setCredentials(prev => ({ ...prev, mdp_initial: d.nouveau_mdp, mdp_temporaire: true }));
      setMdpVisible(true);
      setResetConfirm(false);
    } catch (err) {
      await alerte('Erreur : ' + err.message, { danger: true });
    } finally { setResetLoading(false); }
  }

  function copier(texte, champ) {
    navigator.clipboard.writeText(texte).then(() => { setCopie(champ); setTimeout(() => setCopie(''), 2000); });
  }

  // ── Versements (table paiements_entreprises, partagée avec GestionEntreprises.jsx) ──
  // ⚠️ La façade "admin_elearning" est partagée entre un éventuel admin e-learning ET le rôle
  // physique "commercial" (l'assistante e-learning) - voir ROLE_MAP_BET dans constants/roles.js.
  // La whitelister ici court-circuiterait TOUJOURS la matrice de permissions pour l'assistante,
  // quoi que l'admin configure dans Gestion des droits. Seul "admin_manager" (super_admin/admin/
  // manager) est une façade sans ambiguïté - on peut la garder comme accès admin implicite.
  const entrepriseRefusee = entreprise.statut === 'refuse';
  const peutSaisirVersement = !entrepriseRefusee && (estRole(profile?.role, 'admin_manager') || profile?.permissions?.finances?.create === true);
  const peutModifierVersement = !entrepriseRefusee && (estRole(profile?.role, 'admin_manager') || profile?.permissions?.finances?.update === true);
  // Suppression réservée à l'admin BET - jamais à l'assistante e-learning, même si un rôle
  // "commercial" venait un jour à cocher "Modifier" sur le module Finances.
  const peutSupprimerVersement = estRole(profile?.role, ['admin_manager', 'admin_superviseur']) || profile?.permissions?.finances?.delete === true;
  const [versements, setVersements] = useState([]);
  const [chargVersements, setChargVersements] = useState(false);
  const [showFormVers, setShowFormVers] = useState(false);
  const [savingVers, setSavingVers] = useState(false);
  const [paiementDetail, setPaiementDetail] = useState(null);
  const [editVersId, setEditVersId] = useState(null);
  const [formVers, setFormVers] = useState({ montant:'', date: new Date().toISOString().split('T')[0], mode:'virement', reference:'', note:'' });

  useEffect(() => {
    if (tab !== 'paiements') return;
    setChargVersements(true);
    fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/paiements`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setVersements(d.paiements || []))
      .catch(() => {})
      .finally(() => setChargVersements(false));
  }, [tab, entreprise.id]);

  // ── Champs réels de l'entreprise ──
  const cfg         = STATUT_ENT[entreprise.statut] || STATUT_ENT.actif;
  const nbLicences  = entreprise.nb_licences || 0;
  const nbActifs    = benefs.filter(b => b.statut === 'actif').length;
  const pct         = nbLicences > 0 ? Math.round((nbActifs / nbLicences) * 100) : 0;
  const jours       = entreprise.date_fin_contrat ? joursRestants(entreprise.date_fin_contrat) : null;
  const montantContrat = Number(entreprise.montant_contrat || 0);
  const totalVerse  = versements.reduce((s, v) => s + Number(v.montant || 0), 0);
  const soldeRestant = Math.max(0, montantContrat - totalVerse);
  const pctPaie     = montantContrat > 0 ? Math.round((totalVerse / montantContrat) * 100) : 0;

  const ACTIVITE = [
    { icone:'📝', lib:'Entreprise créée',        detail:`Package ${entreprise.package_elearning || '-'}`,              date: (entreprise.created_at || '').slice(0,10) || '-' },
    { icone:'👤', lib:'Bénéficiaires inscrits',  detail:`${benefs.length} bénéficiaire(s) ajouté(s)`,                  date: entreprise.date_debut_contrat || '-' },
    { icone:'📧', lib:'Contact RH',               detail:`${entreprise.referent_rh_nom || '-'} - ${entreprise.referent_rh_email || '-'}`, date: '-' },
    { icone:'📊', lib:'Tests de niveau',          detail:`${benefs.filter(b => b.niveau_cecr || b.niveau).length} bénéf(s) évalué(s)`, date:'-' },
  ];

  const TABS = [
    { id:'infos',         lib:'Informations',   icone:'🏢' },
    { id:'beneficiaires', lib:'Bénéficiaires',  icone:'👥', badge: benefs.length },
    { id:'contrat',       lib:'Contrat',         icone:'📄' },
    { id:'paiements',     lib:'Paiements',       icone:'💳', badge: versements.length },
    { id:'documents',     lib:'Documents',       icone:'📁', badge: documents.length || null },
    { id:'activite',      lib:'Activité',        icone:'📋' },
  ];

  const S = {
    overlay:   { position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, backdropFilter:'blur(3px)' },
    modal:     { background:COULEURS.gris50, borderRadius:20, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.35)', overflow:'hidden' },
    header:    { background:`linear-gradient(135deg, ${entreprise.couleur}CC 0%, ${entreprise.couleur} 100%)`, padding:'24px 28px', flexShrink:0 },
    headerTop: { display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 },
    avatar:    { width:56, height:56, borderRadius:14, background:'rgba(255,255,255,0.2)', border:'2px solid rgba(255,255,255,0.35)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:800, color:'#fff', flexShrink:0, overflow:'hidden' },
    btnX:      { background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.25)', borderRadius:8, width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:18, color:'#fff', flexShrink:0 },
    hStat:     { textAlign:'center' },
    hSep:      { width:1, background:'rgba(255,255,255,0.2)', alignSelf:'stretch' },
    tabs:      { display:'flex', background:COULEURS.blanc, borderBottom:`1px solid ${COULEURS.gris200}`, padding:'0 8px', flexShrink:0, overflowX:'auto', scrollbarWidth:'none' },
    tab:    (a) => ({ display:'flex', alignItems:'center', gap:5, padding:'10px 12px', cursor:'pointer', border:'none', background:'transparent', borderBottom:a?`2px solid ${entreprise.couleur}`:'2px solid transparent', color:a?entreprise.couleur:COULEURS.gris600, fontWeight:a?700:500, fontSize:12, fontFamily:'"Plus Jakarta Sans", sans-serif', marginBottom:-1, transition:'all 0.15s', whiteSpace:'nowrap', flexShrink:0 }),
    badge:  (a) => ({ background:a?entreprise.couleur:COULEURS.gris200, color:a?'#fff':COULEURS.gris600, borderRadius:10, padding:'1px 7px', fontSize:10, fontWeight:700 }),
    corps:     { flex:1, overflowY:'auto', padding:24 },
    carteInfo: { background:COULEURS.blanc, borderRadius:12, padding:'14px 18px', border:`1px solid ${COULEURS.gris200}` },
    lbl:       { fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 },
    val:       { fontSize:14, fontWeight:600, color:COULEURS.navy },
    ligneC:    { display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:`1px solid ${COULEURS.gris50}`, fontSize:13 },
    ligneBen:  { display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom:`1px solid ${COULEURS.gris100}` },
    footer:    { padding:'16px 24px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'flex-end', background:COULEURS.blanc, flexShrink:0 },
    statBadge: (bg,txt) => ({ display:'inline-block', padding:'3px 10px', borderRadius:20, background:bg, color:txt, fontSize:11, fontWeight:600 }),
  };

  return (
    <div style={S.overlay} onClick={onFermer}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>

        {/* ── Header coloré ── */}
        <div style={S.header}>
          <div style={S.headerTop}>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={S.avatar}>
                {entreprise.logo_url && !entreprise.logo_url.startsWith('blob:')
                  ? <img src={entreprise.logo_url} alt={entreprise.nom} style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'inherit' }} onError={e => { e.target.style.display='none'; }} />
                  : entreprise.initiales || '🏢'
                }
              </div>
              <div>
                <div style={{ fontSize:22, fontWeight:800, color:'#fff', lineHeight:1.2, marginBottom:4 }}>{entreprise.nom}</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)' }}>{[entreprise.secteur, entreprise.ville].filter(Boolean).join(' · ')}</div>
                <div style={{ marginTop:6, display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                  <span style={{ ...S.statBadge(cfg.bg, cfg.txt), fontSize:10 }}>{cfg.lib}</span>
                  {!peutModifier && (
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:'rgba(0,0,0,0.3)', color:'rgba(255,255,255,0.85)', letterSpacing:'0.03em' }}>🔒 Lecture seule</span>
                  )}
                </div>
              </div>
            </div>
            <button style={S.btnX} onClick={onFermer}>×</button>
          </div>
          {/* Mini stats */}
          <div style={{ display:'flex', gap:20 }}>
            {[
              { l:'Bénéficiaires', v:`${nbActifs}/${nbLicences}` },
              { l:'Contrat',       v: montantContrat > 0 ? `${(montantContrat/1000000).toFixed(1)}M FCFA` : '-' },
              { l:'Remplissage',   v:`${pct}%` },
              ...(jours !== null ? [{ l:'Fin contrat', v: jours > 0 ? `J-${jours}` : 'Expiré', alert: jours < 60 }] : []),
            ].map((s, i, arr) => (
              <div key={i} style={{ display:'flex', gap:20, alignItems:'stretch' }}>
                {i > 0 && <div style={S.hSep} />}
                <div style={S.hStat}>
                  <div style={{ fontSize:18, fontWeight:800, color: s.alert ? '#FCA5A5' : '#fff' }}>{s.v}</div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{s.l}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={S.tabs}>
          {TABS.map(t => (
            <button key={t.id} style={S.tab(tab === t.id)} onClick={() => setTab(t.id)}>
              <span>{t.icone}</span><span>{t.lib}</span>
              {t.badge != null && <span style={S.badge(tab === t.id)}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* ── Corps ── */}
        <div style={S.corps}>

          {/* INFORMATIONS */}
          {tab === 'infos' && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                {[
                  ['Secteur d\'activité', entreprise.secteur],
                  ['Référent RH', entreprise.referent_rh_nom],
                  ['Email RH', entreprise.referent_rh_email],
                  ['Téléphone RH', entreprise.referent_rh_telephone],
                  ['Package', entreprise.package_elearning],
                  ['Licences', entreprise.nb_licences ? `${entreprise.nb_licences} places` : '-'],
                ].map(([l, v]) => (
                  <div key={l} style={S.carteInfo}>
                    <div style={S.lbl}>{l}</div>
                    <div style={{ ...S.val, color: l === 'Email RH' ? couleurTheme : COULEURS.navy }}>{v || '-'}</div>
                  </div>
                ))}
                <div style={{ ...S.carteInfo, gridColumn:'1 / -1' }}>
                  <div style={S.lbl}>Adresse</div>
                  <div style={S.val}>{[entreprise.adresse, entreprise.ville].filter(Boolean).join(' · ') || '-'}</div>
                </div>
              </div>
              {/* Barre occupation */}
              <div style={S.carteInfo}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={S.lbl}>Taux d'occupation des places</div>
                  <span style={{ fontSize:13, fontWeight:700, color:entreprise.couleur }}>{pct}%</span>
                </div>
                <div style={{ height:8, background:COULEURS.gris100, borderRadius:4, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:entreprise.couleur, borderRadius:4, transition:'width 0.5s' }} />
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:COULEURS.gris400, marginTop:6 }}>
                  <span>{nbActifs} actifs</span>
                  <span>{nbLicences} places</span>
                </div>
              </div>
              {/* ── Types de sessions ── */}
              <div style={{ ...S.carteInfo, marginTop:16 }}>
                <div style={{ ...S.lbl, marginBottom:10 }}>Modalités de sessions souscrites</div>
                <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                  {[
                    { val:'presentiel', ic:'🏢', lib:'Présentiel', sub:'Cours en salle', col:'#F59E0B' },
                    { val:'ligne',      ic:'📹', lib:'En ligne',   sub:'Zoom · Meet · Teams', col:couleurTheme },
                  ].map(({ val, ic, lib, sub, col }) => {
                    const actif = typesSessionsLocal.includes(val);
                    return (
                      <button key={val} type="button"
                        onClick={() => {
                          if (!peutModifier) return;
                          if (actif && typesSessionsLocal.length === 1) return;
                          setTypesSessionsLocal(prev =>
                            actif ? prev.filter(t => t !== val) : [...prev, val]
                          );
                        }}
                        style={{ flex:1, padding:'12px 10px', borderRadius:10, border:`2px solid ${actif ? col : COULEURS.gris200}`, background: actif ? `${col}15` : COULEURS.blanc, cursor: !peutModifier ? 'default' : (typesSessionsLocal.length === 1 && actif ? 'not-allowed' : 'pointer'), textAlign:'center', transition:'all 0.15s', opacity: (!peutModifier || (typesSessionsLocal.length === 1 && actif)) ? 0.7 : 1, fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                      >
                        <div style={{ fontSize:22, marginBottom:3 }}>{ic}</div>
                        <div style={{ fontSize:13, fontWeight:700, color: actif ? col : COULEURS.navy }}>{lib}</div>
                        <div style={{ fontSize:10, color: actif ? col : COULEURS.gris400 }}>{sub}</div>
                        {actif && <div style={{ marginTop:5, fontSize:9, fontWeight:800, color:col, textTransform:'uppercase', letterSpacing:'0.05em' }}>✓ Activé</div>}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize:11, color:COULEURS.gris400, fontStyle:'italic' }}>
                  {typesSessionsLocal.length === 2
                    ? '🔀 Formule hybride - les deux modalités sont disponibles pour cette entreprise.'
                    : typesSessionsLocal.includes('presentiel')
                      ? '🏢 Présentiel uniquement - peut être étendu aux sessions en ligne à tout moment.'
                      : '📹 En ligne uniquement - sessions live avec lien visioconférence.'
                  }
                </div>
              </div>
              {entreprise.notes && (
                <div style={{ ...S.carteInfo, background:'#FFFBEB', border:'1px solid #FDE68A', marginTop:16 }}>
                  <div style={{ ...S.lbl, color:'#92400E' }}>Notes internes</div>
                  <div style={{ fontSize:13, color:'#78350F', lineHeight:1.6 }}>{entreprise.notes}</div>
                </div>
              )}
            </>
          )}

          {/* BÉNÉFICIAIRES - classes d'abord */}
          {tab === 'beneficiaires' && (
            <>
              {/* KPIs globaux */}
              <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
                {[
                  { l:'Classes',    v: classes.length,                                       c: entreprise.couleur },
                  { l:'Total',      v: benefs.length,                                        c: COULEURS.navy },
                  { l:'Actifs',     v: benefs.filter(b=>b.statut==='actif').length,          c: COULEURS.succes },
                  { l:'En attente', v: benefs.filter(b=>b.statut==='en_attente'||b.statut==='test_niveau_pending').length, c: COULEURS.attention },
                ].map(({l,v,c}) => (
                  <div key={l} style={{ flex:1, minWidth:90, background:COULEURS.blanc, borderRadius:10, padding:'10px 12px', border:`1px solid ${COULEURS.gris200}`, textAlign:'center' }}>
                    <div style={{ fontSize:18, fontWeight:800, color:c }}>{v}</div>
                    <div style={{ fontSize:10, color:COULEURS.gris400 }}>{l}</div>
                  </div>
                ))}
              </div>

              {/* Grille de classes */}
              {chargClasses ? (
                <div style={{ textAlign:'center', padding:32, color:COULEURS.gris400 }}>Chargement des classes…</div>
              ) : classes.length === 0 ? (
                <div style={{ textAlign:'center', padding:'32px 20px', color:COULEURS.gris400, border:`2px dashed ${COULEURS.gris200}`, borderRadius:12 }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>🏫</div>
                  <div style={{ fontWeight:600, marginBottom:6 }}>Aucune classe assignée</div>
                  <div style={{ fontSize:12 }}>Les bénéficiaires apparaîtront ici une fois assignés à une classe.</div>
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:14 }}>
                  {classes.map(c => {
                    const horaires = Array.isArray(c.horaire) ? c.horaire : [];
                    const NIV_C = { A0:'#94A3B8', A1:'#60A5FA', A2:'#34D399', B1:'#818CF8', B2:'#F59E0B', C1:'#F97316', C2:'#EF4444' };
                    return (
                      <div key={c.id}
                        onClick={() => setModalCl(c)}
                        style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.05)', cursor:'pointer', transition:'box-shadow 0.2s, transform 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.12)'; e.currentTarget.style.transform='translateY(-2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)'; e.currentTarget.style.transform=''; }}
                      >
                        <div style={{ background:`linear-gradient(135deg, ${entreprise.couleur}CC, ${entreprise.couleur})`, padding:'14px 16px' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                            <div style={{ fontSize:13, fontWeight:800, color:'#fff', lineHeight:1.3, flex:1, marginRight:8 }}>{c.nom}</div>
                            {c.niveau && <span style={{ background:'rgba(255,255,255,0.25)', color:'#fff', borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:800, flexShrink:0 }}>{c.niveau}</span>}
                          </div>
                          {horaires.length > 0 && (
                            <div style={{ marginTop:6, fontSize:10, color:'rgba(255,255,255,0.85)' }}>
                              📅 {horaires.slice(0,2).map(h=>`${h.jour} ${h.debut}–${h.fin}`).join(' · ')}
                              {horaires.length > 2 && ` +${horaires.length-2}`}
                            </div>
                          )}
                        </div>
                        <div style={{ padding:'12px 16px' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <div style={{ width:32, height:32, borderRadius:8, background:`${entreprise.couleur}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:900, color:entreprise.couleur }}>{c.apprenants?.length||0}</div>
                              <div>
                                <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy }}>{c.apprenants?.length||0} bénéficiaire{(c.apprenants?.length||0)!==1?'s':''}</div>
                                <div style={{ fontSize:10, color:COULEURS.gris400 }}>{c.capacite_max ? `/ ${c.capacite_max} places` : 'inscrits'}</div>
                              </div>
                            </div>
                            <span style={{ background: c.statut==='actif' ? '#D1FAE5' : '#FEF3C7', color: c.statut==='actif' ? '#065F46' : '#92400E', borderRadius:20, padding:'2px 8px', fontSize:10, fontWeight:700 }}>
                              {c.statut === 'actif' ? 'Active' : c.statut}
                            </span>
                          </div>
                          {c.coach_nom && <div style={{ fontSize:11, color:COULEURS.gris600, marginBottom:2 }}>👨‍🏫 {c.coach_nom}</div>}
                          {c.date_debut && <div style={{ fontSize:11, color:COULEURS.gris600 }}>📅 {new Date(c.date_debut).toLocaleDateString('fr-FR')}</div>}
                          <div style={{ marginTop:10, paddingTop:8, borderTop:`1px solid ${COULEURS.gris100}`, display:'flex', justifyContent:'flex-end', alignItems:'center', gap:4 }}>
                            <span style={{ fontSize:11, fontWeight:700, color:entreprise.couleur }}>Voir le détail →</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </>
          )}

          {/* CONTRAT */}
          {tab === 'contrat' && (
            <>
              <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:10, marginBottom:14 }}>
                {peutGererContrat && contratActif && (
                  <select
                    value={contratActif.statut || 'actif'}
                    onChange={e => changerStatutContratLocal(e.target.value)}
                    style={{ padding:'7px 10px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:12, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif', background:COULEURS.blanc, color:COULEURS.navy }}
                  >
                    <option value="brouillon">📝 Brouillon</option>
                    <option value="actif">✅ Actif</option>
                    <option value="suspendu">⏸️ Suspendu</option>
                    <option value="expire">⌛ Expiré</option>
                    <option value="resilie">🚫 Résilié</option>
                  </select>
                )}
                {(peutGererContrat || peutProposerRenouvellement) ? (
                  <button
                    onClick={() => setModalRenouvellement(true)}
                    style={{ padding:'7px 14px', borderRadius:8, border:'none', background:entreprise.couleur, color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                  >
                    {peutGererContrat ? '🔄 Renouveler le contrat' : '🔄 Proposer un renouvellement'}
                  </button>
                ) : (
                  <span style={{ fontSize:11, padding:'4px 10px', borderRadius:20, background:'#F1F5F9', color:'#64748B', fontWeight:600 }}>🔒 Lecture seule</span>
                )}
              </div>
              
              {entreprise.date_debut_contrat || entreprise.montant_contrat ? (
                <>
                  <div style={{ background:COULEURS.blanc, borderRadius:12, padding:20, border:`1px solid ${COULEURS.gris200}`, borderTop:`4px solid ${entreprise.couleur}`, marginBottom:16 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:14, paddingBottom:10, borderBottom:`1px solid ${COULEURS.gris100}` }}>
                      📄 Package {entreprise.package_elearning || '-'}
                    </div>
                    {[
                      { l:'Date de début',           v: entreprise.date_debut_contrat || '-' },
                      { l:'Date de fin',             v: entreprise.date_fin_contrat   || '-' },
                      ...(entreprise.date_debut_contrat && entreprise.date_fin_contrat
                          ? [{ l:'Durée', v: dureeFormation(entreprise.date_debut_contrat, entreprise.date_fin_contrat) }]
                          : []),
                      { l:'Nombre de licences',      v: entreprise.nb_licences ? `${entreprise.nb_licences} places` : '-' },
                      { l:'Option replay',           v: entreprise.option_replay ? '✓ Activé' : '✗ Non' },
                      ...(jours !== null ? [{ l:'Temps restant', v: jours > 0 ? `${jours} jours (J-${jours})` : '⚠️ Expiré', rouge: jours < 60 }] : []),
                    ].map(({l, v, rouge}) => (
                      <div key={l} style={S.ligneC}>
                        <span style={{ color:COULEURS.gris600 }}>{l}</span>
                        <span style={{ fontWeight:600, color: rouge ? '#DC2626' : COULEURS.navy }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ background:COULEURS.blanc, borderRadius:12, padding:20, border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:14, paddingBottom:10, borderBottom:`1px solid ${COULEURS.gris100}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span>💰 Situation financière</span>
                      <button onClick={() => setTab('paiements')} style={{ fontSize:11, color:couleurTheme, background:'none', border:'none', cursor:'pointer', fontWeight:600, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                        Voir les paiements →
                      </button>
                    </div>
                    {[
                      { l:'Montant total contrat', v: formatFCFA(montantContrat), accent:true },
                      { l:'Total versé',           v: formatFCFA(totalVerse) },
                      { l:'Solde restant',         v: formatFCFA(soldeRestant), rouge: soldeRestant > 0 },
                    ].map(({l, v, accent, rouge}) => (
                      <div key={l} style={S.ligneC}>
                        <span style={{ color:COULEURS.gris600 }}>{l}</span>
                        <span style={{ fontWeight:600, fontSize: accent?15:13, color: rouge?'#DC2626': accent?entreprise.couleur:COULEURS.navy }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ marginTop:14 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:COULEURS.gris400, marginBottom:6 }}>
                        <span>Taux de paiement</span>
                        <span style={{ fontWeight:700, color: pctPaie===100?COULEURS.succes:COULEURS.attention }}>{pctPaie}%</span>
                      </div>
                      <div style={{ height:8, background:COULEURS.gris100, borderRadius:4, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pctPaie}%`, background: pctPaie===100?COULEURS.succes:COULEURS.attention, borderRadius:4 }} />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign:'center', padding:'48px 20px', color:COULEURS.gris400 }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>📄</div>
                  <div>Aucune information de contrat renseignée pour cette entreprise.</div>
                </div>
              )}

              {/* ── Historique des contrats précédents (renouvellements) ── */}
              {contratsHistorique.filter(c => c.id !== contratActif?.id).length > 0 && (
                <div style={{ marginTop:24 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:10 }}>
                    📚 Historique des contrats ({contratsHistorique.filter(c => c.id !== contratActif?.id).length})
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {contratsHistorique.filter(c => c.id !== contratActif?.id).map(c => {
                      const cfgC = STATUT_CONTRAT_LIB[c.statut] || STATUT_CONTRAT_LIB.expire;
                      const ouvert = contratHistoriqueOuvert === c.id;
                      return (
                        <div key={c.id} style={{ background:COULEURS.gris50, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'12px 16px' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                            <span style={{ fontSize:12, fontWeight:700, color:COULEURS.navy }}>📄 REF-{(c.id || '').split('-')[0]?.toUpperCase() || '-'} - Package {c.package || '-'}</span>
                            <span style={{ padding:'2px 10px', borderRadius:20, background:cfgC.bg, color:cfgC.txt, fontSize:10, fontWeight:700 }}>{cfgC.lib}</span>
                          </div>
                          <div style={{ fontSize:11, color:COULEURS.gris600 }}>
                            {c.date_debut || '-'} → {c.date_fin || '-'} · {c.nb_licences || 0} places · {formatFCFA(c.montant_ht)}
                          </div>
                          {c.statut === 'brouillon' && peutGererContrat && (
                            <div style={{ marginTop:8, padding:'8px 10px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
                              <span style={{ fontSize:11, color:'#92400E' }}>🕒 Renouvellement proposé - en attente de validation</span>
                              <button
                                onClick={async () => {
                                  if (!(await confirm(`Valider ce renouvellement pour ${entreprise.nom} ? L'ancien contrat sera archivé et ce nouveau contrat sera activé.`, { titre: 'Valider le renouvellement', confirmLabel: 'Valider', danger: false }))) return;
                                  validerRenouvellementLocal(c.id);
                                }}
                                style={{ padding:'5px 12px', borderRadius:7, border:'none', background:'#059669', color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                              >
                                ✓ Valider
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => setContratHistoriqueOuvert(ouvert ? null : c.id)}
                            style={{ marginTop:8, background:'none', border:'none', color:entreprise.couleur, fontSize:11, fontWeight:700, cursor:'pointer', padding:0, fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                          >
                            {ouvert ? '▲ Masquer les détails' : '▼ Voir les détails'}
                          </button>
                          {ouvert && (
                            <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${COULEURS.gris200}` }}>
                              {[
                                { l:'Date de création',   v: c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '-' },
                                { l:'Durée de formation', v: c.date_debut && c.date_fin ? dureeFormation(c.date_debut, c.date_fin) : '-' },
                                { l:'Type de sessions',   v: (c.types_sessions || []).join(', ') || '-' },
                                { l:'Option replay',      v: c.option_replay ? '✓ Activé' : '✗ Non' },
                                { l:'Devise',              v: c.devise || 'FCFA' },
                              ].map(({ l, v }) => (
                                <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:11 }}>
                                  <span style={{ color:COULEURS.gris400 }}>{l}</span>
                                  <span style={{ fontWeight:600, color:COULEURS.navy }}>{v}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* PAIEMENTS */}
          {tab === 'paiements' && (() => {
            const pctTotal = montantContrat > 0 ? Math.min(100, Math.round((totalVerse / montantContrat) * 100)) : 0;
            const MODES = { virement:'Virement', cheque:'Chèque', especes:'Espèces', mobile_money:'Mobile Money' };

            function ouvrirAjout() {
              setEditVersId(null);
              setFormVers({ montant:'', date: new Date().toISOString().split('T')[0], mode:'virement', reference:'', note:'' });
              setShowFormVers(true);
            }
            async function sauvegarder() {
              if (!formVers.montant || !formVers.date || savingVers) return;
              const msg = editVersId
                ? `Corriger ce versement à ${formatFCFA(Number(formVers.montant))} pour ${entreprise.nom} ?`
                : `Enregistrer un versement de ${formatFCFA(Number(formVers.montant))} pour ${entreprise.nom} ?`;
              if (!(await confirm(msg, { titre: editVersId ? 'Confirmer la correction' : 'Confirmer le versement', confirmLabel: editVersId ? 'Corriger' : 'Enregistrer', danger: false }))) return;
              setSavingVers(true);
              try {
                const url = editVersId
                  ? `${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/paiements/${editVersId}`
                  : `${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/paiements`;
                const r = await fetch(url, {
                  method: editVersId ? 'PATCH' : 'POST', headers: _authHdrsAdmin(),
                  body: JSON.stringify({ ...formVers, montant: Number(formVers.montant) }),
                });
                const d = await r.json();
                if (!r.ok) { await alerte(d.error || 'Erreur lors de l\'enregistrement du versement', { danger: true }); return; }
                if (editVersId) setVersements(prev => prev.map(v => v.id === editVersId ? d.paiement : v));
                else setVersements(prev => [d.paiement, ...prev]);
                setShowFormVers(false);
                setEditVersId(null);
              } catch (e) {
                await alerte('Erreur réseau', { danger: true });
              } finally {
                setSavingVers(false);
              }
            }

            async function supprimer(v) {
              if (!(await confirm(`Supprimer définitivement ce versement de ${formatFCFA(v.montant)} pour ${entreprise.nom} ?`, { titre: 'Supprimer le versement', confirmLabel: 'Supprimer', danger: true }))) return;
              try {
                const r = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/paiements/${v.id}`, {
                  method: 'DELETE', headers: _authHdrsAdmin(),
                });
                const d = await r.json();
                if (!r.ok) { await alerte(d.error || 'Erreur lors de la suppression du versement', { danger: true }); return; }
                setVersements(prev => prev.filter(x => x.id !== v.id));
                setPaiementDetail(null);
              } catch (e) {
                await alerte('Erreur réseau', { danger: true });
              }
            }

            return (
              <>
                {/* KPI synthèse */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
                  {[
                    { l:'Montant total',  v: montantContrat > 0 ? formatFCFA(montantContrat) : '-', c: entreprise.couleur, i:'📄' },
                    { l:'Total versé',    v: formatFCFA(totalVerse),  c:'#059669', i:'💰' },
                    { l:'Solde restant',  v: formatFCFA(soldeRestant), c: soldeRestant > 0 ? '#DC2626' : '#059669', i:'⚖️' },
                  ].map(k => (
                    <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:10, padding:'14px 16px', border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}` }}>
                      <div style={{ fontSize:18, marginBottom:4 }}>{k.i}</div>
                      <div style={{ fontSize:15, fontWeight:800, color:k.c }}>{k.v}</div>
                      <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:2 }}>{k.l}</div>
                    </div>
                  ))}
                </div>

                {/* Barre progression */}
                <div style={{ background:COULEURS.blanc, borderRadius:10, padding:'12px 16px', border:`1px solid ${COULEURS.gris200}`, marginBottom:20 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:6 }}>
                    <span style={{ fontWeight:600, color:COULEURS.navy }}>Progression du paiement</span>
                    <span style={{ fontWeight:800, color: pctTotal===100?'#059669':COULEURS.attention }}>{pctTotal}%</span>
                  </div>
                  <div style={{ height:10, background:COULEURS.gris100, borderRadius:5, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${pctTotal}%`, background: pctTotal===100?'#059669':COULEURS.attention, borderRadius:5, transition:'width 0.4s' }} />
                  </div>
                </div>

                {/* Header liste + bouton ajouter */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>Historique des versements ({versements.length})</div>
                  {peutSaisirVersement && !showFormVers && (
                    <button onClick={ouvrirAjout} style={{ background:'#059669', color:'#fff', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:5 }}>
                      + Nouveau versement
                    </button>
                  )}
                  {!peutSaisirVersement && (
                    <span style={{ fontSize:11, padding:'4px 10px', borderRadius:20, background: entrepriseRefusee ? '#FEE2E2' : '#F1F5F9', color: entrepriseRefusee ? '#991B1B' : '#64748B', fontWeight:600 }}>
                      {entrepriseRefusee ? '❌ Inscription refusée - aucune saisie possible' : '🔒 Lecture seule'}
                    </span>
                  )}
                </div>

                {/* Formulaire ajout (lecture seule masqué) */}
                {showFormVers && (peutSaisirVersement || (editVersId && peutModifierVersement)) && (
                  <div style={{ background:'#F0FDF4', borderRadius:12, border:'1.5px solid #86EFAC', padding:'18px', marginBottom:16 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#065F46', marginBottom:14 }}>
                      {editVersId ? '✏️ Modifier le versement' : '+ Nouveau versement'}
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                      {[
                        { lbl:'Montant (FCFA) *', key:'montant', type:'number', placeholder:'ex : 2 500 000' },
                        { lbl:'Date *',            key:'date',    type:'date',   placeholder:'' },
                        { lbl:'Référence',         key:'reference', type:'text', placeholder:'ex : VIR-2026-087' },
                      ].map(({ lbl, key, type, placeholder }) => (
                        <div key={key}>
                          <label style={{ fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:4 }}>{lbl}</label>
                          <input type={type} placeholder={placeholder}
                            value={formVers[key]}
                            onChange={e => setFormVers(f => ({ ...f, [key]: e.target.value }))}
                            style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', boxSizing:'border-box', outline:'none' }}
                          />
                        </div>
                      ))}
                      <div>
                        <label style={{ fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:4 }}>Mode de paiement</label>
                        <select value={formVers.mode} onChange={e => setFormVers(f => ({ ...f, mode:e.target.value }))}
                          style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', background:'#fff', outline:'none' }}>
                          {[['virement','Virement bancaire'],['cheque','Chèque'],['especes','Espèces'],['mobile_money','Mobile Money']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ marginBottom:12 }}>
                      <label style={{ fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:4 }}>Note</label>
                      <textarea value={formVers.note} onChange={e => setFormVers(f => ({ ...f, note:e.target.value }))} rows={2}
                        placeholder="Note ou commentaire interne..."
                        style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', resize:'vertical', boxSizing:'border-box', outline:'none' }}
                      />
                    </div>
                    <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                      <button onClick={() => { setShowFormVers(false); setEditVersId(null); }} disabled={savingVers} style={{ padding:'8px 16px', borderRadius:7, border:`1.5px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.gris600, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>Annuler</button>
                      <button onClick={sauvegarder} disabled={!formVers.montant || !formVers.date || savingVers}
                        style={{ padding:'8px 18px', borderRadius:7, border:'none', background: formVers.montant && formVers.date ? '#059669' : COULEURS.gris200, color:'#fff', fontSize:12, fontWeight:700, cursor: formVers.montant && formVers.date ? 'pointer' : 'not-allowed', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                        {savingVers ? '⏳ Enregistrement…' : (editVersId ? '✅ Enregistrer la correction' : '✅ Confirmer le versement')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Liste des versements */}
                {chargVersements ? (
                  <div style={{ textAlign:'center', padding:'36px 20px', color:COULEURS.gris400 }}>Chargement…</div>
                ) : versements.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'36px 20px', background:COULEURS.blanc, borderRadius:12, border:`2px dashed ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:36, marginBottom:8 }}>💳</div>
                    <div style={{ fontWeight:600, color:COULEURS.navy, marginBottom:4 }}>Aucun versement enregistré</div>
                    {peutSaisirVersement && <div style={{ fontSize:12, color:COULEURS.gris400 }}>Cliquez sur "+ Nouveau versement" pour saisir le premier paiement.</div>}
                  </div>
                ) : (() => {
                  const avecActions = peutModifierVersement || peutSupprimerVersement;
                  const colsVers = avecActions ? '1fr 1.2fr 1fr 1.2fr 1.5fr 80px' : '1fr 1.2fr 1fr 1.2fr 1.5fr';
                  return (
                  <div style={{ background:COULEURS.blanc, borderRadius:12, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ display:'grid', gridTemplateColumns:colsVers, padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                      <span>Date</span><span>Montant</span><span>Mode</span><span>Référence</span><span>Note</span>{avecActions && <span>Actions</span>}
                    </div>
                    {versements.map((v, i) => (
                      // Ce modal ModalOnboardingEntreprise est partagé par plusieurs rôles (Onboarding,
                      // E-Learning, et 2 autres) - le détail/reçu n'est activé que pour ceux autorisés
                      // à saisir des versements (peutSaisirVersement), pas pour Onboarding (lecture seule).
                      <div key={v.id} onClick={() => peutSaisirVersement && setPaiementDetail(v)}
                        style={{ display:'grid', gridTemplateColumns:colsVers, padding:'12px 16px', borderBottom: i < versements.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:12, alignItems:'center', cursor: peutSaisirVersement ? 'pointer' : 'default' }}
                        onMouseEnter={e => { if (peutSaisirVersement) e.currentTarget.style.background = COULEURS.gris50; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <span style={{ color:COULEURS.gris600 }}>{v.date}</span>
                        <span style={{ fontWeight:800, color:'#059669' }}>{formatFCFA(v.montant)}</span>
                        <span style={{ padding:'2px 8px', borderRadius:10, background:'#EDE9FE', color:'#6D28D9', fontSize:10, fontWeight:600 }}>{MODES[v.mode] || v.mode}</span>
                        <span style={{ fontSize:11, color:COULEURS.gris600 }}>{v.reference || '-'}</span>
                        <span style={{ fontSize:11, color:COULEURS.gris400, fontStyle: v.note ? 'normal' : 'italic' }}>{v.note || '-'}</span>
                        {avecActions && (
                          <span style={{ display:'flex', gap:5 }} onClick={e => e.stopPropagation()}>
                            {peutModifierVersement && (
                              <button onClick={() => { setFormVers({ montant: v.montant, date: (v.date||'').slice(0,10), mode: v.mode || 'virement', reference: v.reference || '', note: v.note || '' }); setEditVersId(v.id); setShowFormVers(true); }}
                                title="Modifier" style={{ width:26, height:26, borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, cursor:'pointer', fontSize:12 }}>✏️</button>
                            )}
                            {peutSupprimerVersement && (
                              <button onClick={() => supprimer(v)}
                                title="Supprimer" style={{ width:26, height:26, borderRadius:6, border:'1px solid #FCA5A5', background:'#FFF5F5', cursor:'pointer', fontSize:12 }}>🗑️</button>
                            )}
                          </span>
                        )}
                      </div>
                    ))}
                    {/* Total */}
                    <div style={{ display:'grid', gridTemplateColumns:colsVers, padding:'10px 16px', background:COULEURS.navy, fontSize:12, alignItems:'center' }}>
                      <span style={{ fontWeight:700, color:'#fff' }}>TOTAL</span>
                      <span style={{ fontWeight:900, color:'#FCD34D' }}>{formatFCFA(totalVerse)}</span>
                      <span></span><span></span><span></span>{avecActions && <span></span>}
                    </div>
                  </div>
                  );
                })()}
              </>
            );
          })()}

          {/* DOCUMENTS */}
          {tab === 'documents' && (
            <>
              {peutModifier && (
                docFichierEnAttente ? (
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderRadius:12, border:`1.5px solid ${entreprise.couleur}`, background:`${entreprise.couleur}08`, marginBottom:16 }}>
                    <span style={{ fontSize:18 }}>📄</span>
                    <span style={{ flex:1, fontSize:13, fontWeight:600, color:COULEURS.navy, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {docFichierEnAttente.name}
                    </span>
                    <button type="button" onClick={() => setDocFichierEnAttente(null)} disabled={docUploading}
                      style={{ padding:'6px 14px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, color:COULEURS.gris600, fontSize:12, fontWeight:600, cursor: docUploading ? 'default' : 'pointer', background:'transparent', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      ✕ Annuler
                    </button>
                    <button type="button" onClick={validerDepotDocument} disabled={docUploading}
                      style={{ padding:'6px 14px', borderRadius:8, border:'none', color:'#fff', fontSize:12, fontWeight:700, cursor: docUploading ? 'wait' : 'pointer', background:entreprise.couleur, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      {docUploading ? 'Envoi…' : '✅ Valider le dépôt'}
                    </button>
                  </div>
                ) : (
                  <label style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'14px', borderRadius:12, border:`2px dashed ${COULEURS.gris200}`, cursor:'pointer', marginBottom:16, fontSize:13, fontWeight:600, color:entreprise.couleur, background:COULEURS.blanc }}>
                    📎 Déposer un document (PDF, Word, Excel… - max 10 Mo)
                    <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" style={{ display:'none' }} onChange={deposerDocument} />
                  </label>
                )
              )}
              {chargDocs ? (
                <div style={{ textAlign:'center', padding:30, color:COULEURS.gris400, fontSize:13 }}>Chargement…</div>
              ) : documentsAffiches.length === 0 ? (
                <div style={{ textAlign:'center', padding:30, color:COULEURS.gris400, fontSize:13 }}>Aucun document déposé pour cette entreprise.</div>
              ) : (
                documentsAffiches.map(doc => {
                  const estPreuve = doc.type === 'preuve_inscription';
                  return (
                    <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 0', borderBottom:`1px solid ${COULEURS.gris100}` }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', background:`${entreprise.couleur}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>{estPreuve ? '📎' : '📄'}</div>
                      <a href={doc.url} target="_blank" rel="noreferrer" style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, color:COULEURS.navy, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.nom}</div>
                        <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:2 }}>{estPreuve ? `Document · Déposé par ${doc.depose_par_nom || '-'}` : `Déposé par ${doc.depose_par_nom || '-'}`}</div>
                      </a>
                      <span style={{ fontSize:11, color:COULEURS.gris400, flexShrink:0, marginRight: peutModifier ? 10 : 0 }}>{(doc.created_at || '').slice(0,10)}</span>
                      {peutModifier && (
                        <button type="button" onClick={() => supprimerDocument(doc.id)} disabled={docsEnSuppression.has(doc.id)} style={{ background:'transparent', border:'none', color:'#EF4444', cursor: docsEnSuppression.has(doc.id) ? 'not-allowed' : 'pointer', opacity: docsEnSuppression.has(doc.id) ? 0.5 : 1, fontSize:16, flexShrink:0 }} title="Supprimer">🗑️</button>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* ACTIVITÉ */}
          {tab === 'activite' && ACTIVITE.map((a, i) => (
            <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'14px 0', borderBottom:`1px solid ${COULEURS.gris100}` }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:`${entreprise.couleur}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
                {a.icone}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, color:COULEURS.navy, fontSize:13 }}>{a.lib}</div>
                <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:2 }}>{a.detail}</div>
              </div>
              <div style={{ fontSize:11, color:COULEURS.gris400, flexShrink:0 }}>{a.date}</div>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{ ...S.footer, justifyContent:'space-between' }}>
          <button onClick={voirAcces} disabled={chargCred}
            style={{ padding:'9px 16px', borderRadius:8, border:`1.5px solid ${entreprise.couleur}`, background:`${entreprise.couleur}10`, color:entreprise.couleur, cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', gap:6 }}>
            {chargCred ? '⏳ Chargement…' : '🔑 Voir les accès'}
          </button>
          <button onClick={onFermer} style={{ padding:'9px 20px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
            Fermer
          </button>
        </div>
      </div>

      {/* ── Panneau credentials ── */}
      {showCred && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100, backdropFilter:'blur(4px)' }} onClick={() => setShowCred(false)}>
          <div style={{ background:COULEURS.blanc, borderRadius:18, width:640, maxWidth:'94vw', maxHeight:'88vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
            <div style={{ background:`linear-gradient(135deg, ${entreprise.couleur}CC, ${entreprise.couleur})`, padding:'26px 32px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:19, fontWeight:800, color:'#fff' }}>🔑 Accès entreprise</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', marginTop:4 }}>{entreprise.nom}</div>
              </div>
              <button onClick={() => setShowCred(false)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:36, height:36, color:'#fff', fontSize:20, cursor:'pointer' }}>×</button>
            </div>
            <div style={{ padding:32 }}>
              {credentials?.error ? (
                <div>
                  <div style={{ background:'#FEF3C7', border:'1px solid #FDE68A', color:'#92400E', borderRadius:10, padding:'12px 14px', fontSize:13, marginBottom:16 }}>
                    ⚠️ {credentials.error}
                  </div>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>Créer le compte RH</div>
                  {[
                    { lbl:'Prénom', key:'prenom', placeholder:'ex: Marie' },
                    { lbl:'Nom',    key:'nom',    placeholder:'ex: Dupont' },
                    { lbl:'Email',  key:'email',  placeholder:'rh@entreprise.com' },
                  ].map(({ lbl, key, placeholder }) => (
                    <div key={key} style={{ marginBottom:12 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{lbl}</div>
                      <input
                        value={createForm[key]}
                        onChange={e => setCreateForm(f => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', boxSizing:'border-box', outline:'none' }}
                      />
                    </div>
                  ))}
                  <button
                    onClick={async () => {
                      if (!createForm.email || createLoading) return;
                      setCreateLoading(true);
                      try {
                        const res = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/creer-compte-rh`, {
                          method: 'POST',
                          headers: _authHdrsAdmin(),
                          body: JSON.stringify({ rh_prenom: createForm.prenom, rh_nom: createForm.nom, rh_email: createForm.email }),
                        });
                        const d = await res.json();
                        if (!res.ok) throw new Error(d.error || 'Erreur serveur');
                        setCredentials({ email: d.email, prenom: d.prenom, nom: d.nom, mdp_initial: d.mot_de_passe, mdp_temporaire: true });
                        setMdpVisible(true);
                      } catch (err) {
                        await alerte('Erreur : ' + err.message, { danger: true });
                      } finally { setCreateLoading(false); }
                    }}
                    disabled={createLoading || !createForm.email}
                    style={{ width:'100%', padding:'11px', borderRadius:9, border:'none', background: createForm.email ? entreprise.couleur : COULEURS.gris200, color:'#fff', fontSize:13, fontWeight:700, cursor: createForm.email ? 'pointer' : 'not-allowed', fontFamily:'"Plus Jakarta Sans",sans-serif', marginTop:4 }}
                  >
                    {createLoading ? '⏳ Création…' : '✅ Créer le compte RH'}
                  </button>
                </div>
              ) : credentials ? (
                <>
                  <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#92400E', marginBottom:20 }}>
                    ⚠️ Ces informations sont confidentielles. Ne les partagez qu'avec le responsable RH concerné.
                  </div>
                  {[
                    { lbl:'Prénom Nom', val:`${credentials.prenom || ''} ${credentials.nom || ''}`.trim() },
                    { lbl:'Email de connexion', val: credentials.email, champ:'email' },
                    { lbl:'Mot de passe', val: credentials.mdp_initial || '(réinitialisé)', champ:'mdp', masque: true },
                  ].map(({ lbl, val, champ, masque }) => (
                    <div key={lbl} style={{ marginBottom:14 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>{lbl}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, background:COULEURS.gris50, borderRadius:8, padding:'10px 14px', border:`1px solid ${COULEURS.gris200}` }}>
                        <span style={{ flex:1, fontSize:13, fontWeight:600, color:COULEURS.navy, fontFamily: masque ? 'monospace' : 'inherit', letterSpacing: masque ? '0.05em' : 'normal' }}>
                          {masque && !mdpVisible ? '••••••••••••' : val}
                        </span>
                        {masque && (
                          <button onClick={() => setMdpVisible(v => !v)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, color:COULEURS.gris400 }}>
                            {mdpVisible ? '🙈' : '👁'}
                          </button>
                        )}
                        {champ && val && (
                          <button onClick={() => copier(val, champ)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color: copie===champ ? COULEURS.succes : couleurTheme, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif', whiteSpace:'nowrap' }}>
                            {copie === champ ? '✓ Copié' : 'Copier'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {credentials.mdp_temporaire && (
                    <div style={{ background:'#EFF6FF', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#1D4ED8', marginTop:8 }}>
                      ℹ️ Mot de passe temporaire - l'utilisateur est invité à le modifier à la première connexion.
                    </div>
                  )}

                  <div style={{ marginTop:20, borderTop:`1px solid ${COULEURS.gris200}`, paddingTop:16 }}>
                    {!resetConfirm ? (
                      <>
                        <button onClick={() => setResetConfirm(true)}
                          style={{ width:'100%', padding:'10px', borderRadius:9, border:'1.5px solid #DC2626', background:'#FEF2F2', color:'#DC2626', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                          🔄 Réinitialiser le mot de passe
                        </button>
                        {/* Renvoi des accès par email - envoi réel à configurer plus tard */}
                        <button onClick={() => toast.success(`📧 Accès renvoyés par email à ${credentials.email}`)}
                          style={{ width:'100%', padding:'10px', borderRadius:9, border:`1.5px solid ${couleurTheme}`, background:'#fff', color: couleurTheme, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', marginTop:10 }}>
                          📧 Renvoyer les accès par email
                        </button>
                      </>
                    ) : (
                      <div style={{ background:'#FEF2F2', borderRadius:10, border:'1.5px solid #FECACA', padding:'14px 16px' }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#991B1B', marginBottom:10 }}>
                          ⚠️ Confirmer la réinitialisation ?
                        </div>
                        <div style={{ fontSize:12, color:'#7F1D1D', marginBottom:14, lineHeight:1.5 }}>
                          Un nouveau mot de passe temporaire sera généré et l'ancien sera immédiatement invalidé.
                        </div>
                        <div style={{ display:'flex', gap:8 }}>
                          <button onClick={reinitialiserMdp} disabled={resetLoading}
                            style={{ flex:2, padding:'9px', borderRadius:8, border:'none', background:'#DC2626', color:'#fff', fontSize:13, fontWeight:700, cursor: resetLoading ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                            {resetLoading ? '⏳ En cours…' : '✅ Confirmer'}
                          </button>
                          <button onClick={() => setResetConfirm(false)}
                            style={{ flex:1, padding:'9px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Modal détail classe */}
      {modalCl && (
        <ModalDetailClasseAdmin
          classe={modalCl}
          entreprise={entreprise}
          onFermer={() => setModalCl(null)}
          onOuvrirBenef={b => setBen(b)}
          onStatutChange={handleStatutBenefAdmin}
        />
      )}

      {/* Modal détail bénéficiaire */}
      {benDetail && (
        <ModalDetailBenef benef={benDetail} entreprise={entreprise} onFermer={() => setBen(null)} />
      )}

      {/* Modal renouvellement de contrat (renouvellement direct pour l'admin BET,
          proposition à valider pour l'assistante e-learning) */}
      {modalRenouvellement && (
        <ModalRenouvellementContrat
          entreprise={entreprise}
          modeProposition={!peutGererContrat}
          beneficiairesActifs={benefs.filter(b => b.statut === 'actif').length}
          onFermer={() => setModalRenouvellement(false)}
          onSauvegarder={async (form) => {
            const ok = peutGererContrat
              ? await renouvelerContratLocal(form)
              : await proposerRenouvellementLocal(form);
            if (ok) setModalRenouvellement(false);
          }}
        />
      )}

      {/* Modal détail versement (traçabilité + reçu) - actif seulement pour les rôles
          autorisés à saisir des versements (peutSaisirVersement), pas pour Onboarding. */}
      {peutSaisirVersement && paiementDetail && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1150, backdropFilter:'blur(4px)' }} onClick={() => setPaiementDetail(null)}>
          <div style={{ background:COULEURS.blanc, borderRadius:16, width:640, maxWidth:'94vw', boxShadow:'0 24px 64px rgba(0,0,0,0.35)', overflow:'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ background:`linear-gradient(135deg, ${entreprise.couleur}CC, ${entreprise.couleur})`, padding:'20px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>💰 Détail du versement</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:3 }}>{entreprise.nom}</div>
              </div>
              <button onClick={() => setPaiementDetail(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer' }}>×</button>
            </div>
            <div style={{ padding:24 }}>
              {[
                { lbl:'Montant', val: formatFCFA(paiementDetail.montant) },
                { lbl:'Date du versement', val: paiementDetail.date },
                { lbl:'Mode de paiement', val: paiementDetail.mode || '-' },
                { lbl:'Référence', val: paiementDetail.reference || '-' },
                { lbl:'Note', val: paiementDetail.note || '-' },
              ].map(({ lbl, val }) => (
                <div key={lbl} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13 }}>
                  <span style={{ color:COULEURS.gris600 }}>{lbl}</span>
                  <span style={{ fontWeight:700, color:COULEURS.navy }}>{val}</span>
                </div>
              ))}
              <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:10, padding:'12px 16px', marginTop:16 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#0369A1', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>🔍 Traçabilité</div>
                <div style={{ fontSize:13, color:'#0F172A' }}>
                  Enregistré par <strong>{paiementDetail.cree_par_nom || 'Inconnu'}</strong>
                  {paiementDetail.created_at && <> le {new Date(paiementDetail.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}</>}
                </div>
              </div>
            </div>
            <div style={{ padding:'14px 24px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button onClick={() => setPaiementDetail(null)} style={{ padding:'9px 18px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>Fermer</button>
              {peutModifierVersement && (
                <button onClick={() => {
                  setFormVers({ montant: paiementDetail.montant, date: (paiementDetail.date || '').slice(0,10), mode: paiementDetail.mode || 'virement', reference: paiementDetail.reference || '', note: paiementDetail.note || '' });
                  setEditVersId(paiementDetail.id);
                  setPaiementDetail(null);
                  setShowFormVers(true);
                }} style={{ padding:'9px 20px', borderRadius:8, border:`1.5px solid ${entreprise.couleur}`, background:COULEURS.blanc, color:entreprise.couleur, cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                  ✏️ Modifier
                </button>
              )}
              {peutSupprimerVersement && (
                <button onClick={async () => {
                  if (!(await confirm(`Supprimer définitivement ce versement de ${formatFCFA(paiementDetail.montant)} pour ${entreprise.nom} ?`, { titre: 'Supprimer le versement', confirmLabel: 'Supprimer', danger: true }))) return;
                  try {
                    const r = await fetch(`${_API_URL_ADMIN}/api/entreprise/admin/${entreprise.id}/paiements/${paiementDetail.id}`, { method: 'DELETE', headers: _authHdrsAdmin() });
                    const d = await r.json();
                    if (!r.ok) { await alerte(d.error || 'Erreur lors de la suppression du versement', { danger: true }); return; }
                    setVersements(prev => prev.filter(x => x.id !== paiementDetail.id));
                    setPaiementDetail(null);
                  } catch (e) {
                    await alerte('Erreur réseau', { danger: true });
                  }
                }} style={{ padding:'9px 20px', borderRadius:8, border:'1.5px solid #FCA5A5', background:'#FFF5F5', color:'#991B1B', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                  🗑️ Supprimer
                </button>
              )}
              <button onClick={() => genererRecuVersement(paiementDetail, entreprise, { montantContrat, soldeRestant })} style={{ padding:'9px 20px', borderRadius:8, border:'none', background:entreprise.couleur, color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                🧾 Générer le reçu
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// OngletInscriptionOnboarding + OngletParcoursInscriptions extraits dans DashboardOnboarding.jsx (import ci-dessus)

// OngletClasses extrait dans DashboardOnboarding.jsx (import ci-dessus)

// Module Placement (OngletGestionTests) extrait dans DashboardPlacement.jsx (import ci-dessus)

// Module Manager BET (Audit Logs, Équipe pédagogique, Administration BET, Vue d'ensemble) extrait dans DashboardManager.jsx (import ci-dessus)
export default function DashboardAdmin() {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const location    = useLocation();
  const alerte      = useAlerte();

  /* Indexé par nom de FAMILLE, pas par rôle : depuis la dé-fusion, `profile.role` vaut
     `placement_test` ou `pedagogical_advisor` là où cette table attend `admin_placement` ou
     `admin_pa_advisor`. Sans `familleDe`, `config` serait `undefined` et les trois blocs qui
     lisent `config.modules` / `config.description` sans protection planteraient. */
  const config = CONFIGS_PAR_ROLE[familleDe(profile?.role)];

  // États pour le dashboard Contenus - chargés depuis /api/contenus/* (voir useEffect ci-dessous)
  const [catActive, setCatActive]   = useState('tous');
  const [ressources, setRessources] = useState([]);
  const [contenuIdsEnCours, setContenuIdsEnCours] = useState(new Set()); // empêche le double-clic toggle/suppression ressources/biblio/mini-jeux
  const [savingRessource, setSavingRessource] = useState(false);
  const [savingBiblioCom, setSavingBiblioCom] = useState(false);
  const [savingJeu, setSavingJeu] = useState(false);
  const [biblioCom, setBiblioCom]   = useState([]);
  const [jeuxAdmin, setJeuxAdmin]   = useState([]);
  const [contenusLoading, setContenusLoading] = useState(false);
  const [modalUpload, setModalUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ titre:'', categorie:'bienvenue', type:'pdf', fichier:null, lienVideo:'', visible:true });
  // null = mode création · id = mode édition d'une ressource existante (le modal/formulaire est réutilisé)
  const [editingRessourceId, setEditingRessourceId] = useState(null);
  const [editOriginalFichierUrl, setEditOriginalFichierUrl] = useState(null);
  // Bibliothèque communautaire - modal de création/édition dédié (champs différents des
  // ressources onboarding : cible = tranche d'âge au lieu de catégorie, pas de "detail").
  const [modalBiblioCom, setModalBiblioCom] = useState(false);
  const [editingBiblioComId, setEditingBiblioComId] = useState(null);
  const [editBiblioComOriginalUrl, setEditBiblioComOriginalUrl] = useState(null);
  const [biblioComForm, setBiblioComForm] = useState({ titre:'', type:'audio', cible:'tous', duree:'', niveau:'', icone:'🎵', fichier:null, lienVideo:'', visible:true });
  const [jeuForm, setJeuForm]       = useState({ nom:'', type:'qcm', cible:'tous', nbQuestions:10, maxTentatives:2 });
  const [modalJeu, setModalJeu]     = useState(false);
  const [editingJeuId, setEditingJeuId] = useState(null);
  // Détails d'un jeu (stats + résultats par apprenant) - ouvert au clic sur une ligne du tableau
  const [detailsJeu, setDetailsJeu] = useState(null);
  const [resultatsJeu, setResultatsJeu] = useState([]);
  const [resultatsJeuLoading, setResultatsJeuLoading] = useState(false);
  // Détail d'un apprenant pour un jeu donné (KPIs + historique complet de ses tentatives),
  // ouvert au clic sur une ligne du tableau "Résultats par apprenant" - pas de nouvel appel
  // API, tout est déjà dans resultatsJeu (regroupé côté client).
  const [apprenantDetailJeu, setApprenantDetailJeu] = useState(null);
  // Sous-onglet actif pour l'onglet "Contenus" côté Onboarding (admin_onboarding), regroupant
  // Bibliothèque/Mise en ligne/Statistiques/Mini-jeux sous un seul onglet global.
  const [contenusOnbSousTab, setContenusOnbSousTab] = useState('bibliotheque');
  const [modalSupprimerContenu, setModalSupprimerContenu] = useState(null); // { type:'ressource'|'biblio', id, titre }
  const [suppressionContenuEnCours, setSuppressionContenuEnCours] = useState(false);

  const mapRessource = r => ({ ...r, date: (r.created_at || '').slice(0, 10) });
  const mapJeu = j => ({ ...j, nbQuestions: j.nb_questions, partiesJouees: j.parties_jouees, scoreMoyen: Number(j.score_moyen), maxTentatives: j.max_tentatives });

  const fetchContenus = useCallback(async () => {
    setContenusLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch(`${_API_URL_ADMIN}/api/contenus/ressources`, { headers: _authHdrsAdmin() }),
        fetch(`${_API_URL_ADMIN}/api/contenus/biblio-communautaire`, { headers: _authHdrsAdmin() }),
        fetch(`${_API_URL_ADMIN}/api/contenus/mini-jeux`, { headers: _authHdrsAdmin() }),
      ]);
      const [d1, d2, d3] = await Promise.all([r1.json(), r2.json(), r3.json()]);
      setRessources((d1.ressources || []).map(mapRessource));
      setBiblioCom((d2.ressources || []).map(mapRessource));
      setJeuxAdmin((d3.jeux || []).map(mapJeu));
    } catch { /* silencieux - pages Contenus resteront vides */ }
    finally { setContenusLoading(false); }
  }, []);

  useEffect(() => {
    const estPageContenus =
      estRole(profile?.role, 'admin_onboarding') && location.pathname === '/admin/onboarding/contenus';
    if (estPageContenus) fetchContenus();
  }, [profile?.role, location.pathname, fetchContenus]);

  async function toggleVisib(id) {
    if (contenuIdsEnCours.has(id)) return;
    const cible = ressources.find(r => r.id === id);
    if (!cible) return;
    setContenuIdsEnCours(prev => new Set(prev).add(id));
    setRessources(prev => prev.map(r => r.id === id ? { ...r, visible: !r.visible } : r));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/contenus/ressources/${id}`, { method: 'PATCH', headers: _authHdrsAdmin(), body: JSON.stringify({ visible: !cible.visible }) });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Action refusée', { duration: 5000 });
        setRessources(prev => prev.map(x => x.id === id ? cible : x));
      }
    } catch {} finally {
      setContenuIdsEnCours(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }
  async function supprimerRessource(id) {
    if (contenuIdsEnCours.has(id)) return;
    const cible = ressources.find(r => r.id === id);
    setContenuIdsEnCours(prev => new Set(prev).add(id));
    setRessources(prev => prev.filter(r => r.id !== id));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/contenus/ressources/${id}`, { method: 'DELETE', headers: _authHdrsAdmin() });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Suppression refusée', { duration: 5000 });
        if (cible) setRessources(prev => [...prev, cible]);
      }
    } catch {} finally {
      setContenuIdsEnCours(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }
  async function confirmerSuppressionContenu() {
    if (!modalSupprimerContenu || suppressionContenuEnCours) return;
    setSuppressionContenuEnCours(true);
    const { type, id } = modalSupprimerContenu;
    if (type === 'ressource') await supprimerRessource(id);
    else await supprimerBiblioCom(id);
    setSuppressionContenuEnCours(false);
    setModalSupprimerContenu(null);
  }
  async function ajouterRessource() {
    if (!uploadForm.titre.trim() || savingRessource) return;
    setSavingRessource(true);
    try {
    let fichier_url = null;
    let detail; // undefined = ne pas toucher au champ (utile en édition sans nouveau fichier)
    // Un lien vidéo (YouTube/Vimeo/URL directe) est prioritaire sur un fichier uploadé -
    // évite de re-uploader une vidéo déjà hébergée ailleurs, et permet de renseigner une
    // vidéo sans passer par Cloudinary (200 Mo max sinon).
    if (uploadForm.type === 'video' && uploadForm.lienVideo?.trim()) {
      fichier_url = uploadForm.lienVideo.trim();
      detail = 'Lien vidéo';
    } else if (uploadForm.fichier) {
      detail = `${(uploadForm.fichier.size / 1048576).toFixed(1)} Mo`;
      try {
        const fd = new FormData();
        fd.append('file', uploadForm.fichier);
        const r = await fetchUpload(`${_API_URL_ADMIN}/api/upload/contenu`, { method: 'POST', headers: { Authorization: _authHdrsAdmin().Authorization }, body: fd });
        const d = await r.json();
        if (r.ok) fichier_url = d.file?.url;
      } catch {}
    } else if (editingRessourceId && editOriginalFichierUrl) {
      // Édition sans nouveau fichier/lien fourni : on garde le fichier existant, detail inchangé.
      fichier_url = editOriginalFichierUrl;
    }
    try {
      if (editingRessourceId) {
        const body = { titre: uploadForm.titre, cat: uploadForm.categorie, type: uploadForm.type, visible: uploadForm.visible, fichier_url };
        if (detail !== undefined) body.detail = detail;
        const r = await fetch(`${_API_URL_ADMIN}/api/contenus/ressources/${editingRessourceId}`, {
          method: 'PATCH', headers: _authHdrsAdmin(), body: JSON.stringify(body),
        });
        const d = await r.json();
        if (!r.ok) { toast.error(d.error || 'Enregistrement refusé', { duration: 5000 }); return; }
        setRessources(prev => prev.map(x => x.id === editingRessourceId ? mapRessource(d.ressource) : x));
      } else if (uploadForm.categorie === 'communautaire') {
        const r = await fetch(`${_API_URL_ADMIN}/api/contenus/biblio-communautaire`, {
          method: 'POST', headers: _authHdrsAdmin(),
          body: JSON.stringify({ titre: uploadForm.titre, type: uploadForm.type === 'video' ? 'video' : 'audio', cible: 'tous', fichier_url, visible: uploadForm.visible }),
        });
        const d = await r.json();
        if (!r.ok) { toast.error(d.error || 'Création refusée', { duration: 5000 }); return; }
        setBiblioCom(prev => [mapRessource(d.ressource), ...prev]);
      } else {
        const r = await fetch(`${_API_URL_ADMIN}/api/contenus/ressources`, {
          method: 'POST', headers: _authHdrsAdmin(),
          body: JSON.stringify({ titre: uploadForm.titre, cat: uploadForm.categorie, type: uploadForm.type, detail, fichier_url, visible: uploadForm.visible }),
        });
        const d = await r.json();
        if (!r.ok) { toast.error(d.error || 'Création refusée', { duration: 5000 }); return; }
        setRessources(prev => [mapRessource(d.ressource), ...prev]);
      }
    } catch {}
    setModalUpload(false);
    setEditingRessourceId(null);
    setEditOriginalFichierUrl(null);
    setUploadForm({ titre:'', categorie:'bienvenue', type:'pdf', fichier:null, lienVideo:'', visible:true });
    } finally {
      setSavingRessource(false);
    }
  }

  function ouvrirEditionRessource(r) {
    setEditingRessourceId(r.id);
    setEditOriginalFichierUrl(r.fichier_url || null);
    setUploadForm({ titre: r.titre, categorie: r.cat, type: r.type, fichier: null, lienVideo: r.type === 'video' ? (r.fichier_url || '') : '', visible: r.visible });
    setModalUpload(true);
  }

  async function toggleBiblioComVisib(id) {
    if (contenuIdsEnCours.has(id)) return;
    const cible = biblioCom.find(r => r.id === id);
    if (!cible) return;
    setContenuIdsEnCours(prev => new Set(prev).add(id));
    setBiblioCom(prev => prev.map(r => r.id === id ? { ...r, visible: !r.visible } : r));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/contenus/biblio-communautaire/${id}`, { method: 'PATCH', headers: _authHdrsAdmin(), body: JSON.stringify({ visible: !cible.visible }) });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Action refusée', { duration: 5000 });
        setBiblioCom(prev => prev.map(x => x.id === id ? cible : x));
      }
    } catch {} finally {
      setContenuIdsEnCours(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }
  function ouvrirCreationBiblioCom() {
    setEditingBiblioComId(null);
    setEditBiblioComOriginalUrl(null);
    setBiblioComForm({ titre:'', type:'audio', cible:'tous', duree:'', niveau:'', icone:'🎵', fichier:null, lienVideo:'', visible:true });
    setModalBiblioCom(true);
  }
  function ouvrirEditionBiblioCom(r) {
    setEditingBiblioComId(r.id);
    setEditBiblioComOriginalUrl(r.fichier_url || null);
    setBiblioComForm({ titre: r.titre, type: r.type, cible: r.cible, duree: r.duree || '', niveau: r.niveau || '', icone: r.icone || '🎵', fichier: null, lienVideo: r.type === 'video' ? (r.fichier_url || '') : '', visible: r.visible });
    setModalBiblioCom(true);
  }
  async function enregistrerBiblioCom() {
    if (!biblioComForm.titre.trim() || savingBiblioCom) return;
    setSavingBiblioCom(true);
    try {
    let fichier_url = null;
    if (biblioComForm.type === 'video' && biblioComForm.lienVideo?.trim()) {
      fichier_url = biblioComForm.lienVideo.trim();
    } else if (biblioComForm.fichier) {
      try {
        const fd = new FormData();
        fd.append('file', biblioComForm.fichier);
        const r = await fetchUpload(`${_API_URL_ADMIN}/api/upload/contenu`, { method: 'POST', headers: { Authorization: _authHdrsAdmin().Authorization }, body: fd });
        const d = await r.json();
        if (r.ok) fichier_url = d.file?.url;
      } catch {}
    } else if (editingBiblioComId && editBiblioComOriginalUrl) {
      fichier_url = editBiblioComOriginalUrl;
    }
    const body = { titre: biblioComForm.titre, type: biblioComForm.type, cible: biblioComForm.cible, duree: biblioComForm.duree || null, niveau: biblioComForm.niveau || null, icone: biblioComForm.icone, fichier_url, visible: biblioComForm.visible };
    try {
      if (editingBiblioComId) {
        const r = await fetch(`${_API_URL_ADMIN}/api/contenus/biblio-communautaire/${editingBiblioComId}`, { method: 'PATCH', headers: _authHdrsAdmin(), body: JSON.stringify(body) });
        const d = await r.json();
        if (r.ok) {
          setBiblioCom(prev => prev.map(x => x.id === editingBiblioComId ? mapRessource(d.ressource) : x));
        } else {
          toast.error(d.error || 'Modification refusée', { duration: 5000 });
          return;
        }
      } else {
        const r = await fetch(`${_API_URL_ADMIN}/api/contenus/biblio-communautaire`, { method: 'POST', headers: _authHdrsAdmin(), body: JSON.stringify(body) });
        const d = await r.json();
        if (r.ok) {
          setBiblioCom(prev => [mapRessource(d.ressource), ...prev]);
        } else {
          toast.error(d.error || 'Création refusée', { duration: 5000 });
          return;
        }
      }
    } catch {}
    setModalBiblioCom(false);
    setEditingBiblioComId(null);
    setEditBiblioComOriginalUrl(null);
    } finally {
      setSavingBiblioCom(false);
    }
  }
  async function supprimerBiblioCom(id) {
    if (contenuIdsEnCours.has(id)) return;
    const cible = biblioCom.find(r => r.id === id);
    setContenuIdsEnCours(prev => new Set(prev).add(id));
    setBiblioCom(prev => prev.filter(r => r.id !== id));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/contenus/biblio-communautaire/${id}`, { method: 'DELETE', headers: _authHdrsAdmin() });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Suppression refusée', { duration: 5000 });
        if (cible) setBiblioCom(prev => [...prev, cible]);
      }
    } catch {} finally {
      setContenuIdsEnCours(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  async function toggleJeuActif(id) {
    if (contenuIdsEnCours.has(id)) return;
    const cible = jeuxAdmin.find(j => j.id === id);
    if (!cible) return;
    setContenuIdsEnCours(prev => new Set(prev).add(id));
    setJeuxAdmin(prev => prev.map(j => j.id === id ? { ...j, actif: !j.actif } : j));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/contenus/mini-jeux/${id}`, { method: 'PATCH', headers: _authHdrsAdmin(), body: JSON.stringify({ actif: !cible.actif }) });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Action refusée', { duration: 5000 });
        setJeuxAdmin(prev => prev.map(j => j.id === id ? cible : j));
      }
    } catch {} finally {
      setContenuIdsEnCours(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }
  async function reinitialiserJeu(id) {
    if (contenuIdsEnCours.has(id)) return;
    const cible = jeuxAdmin.find(j => j.id === id);
    if (!cible) return;
    setContenuIdsEnCours(prev => new Set(prev).add(id));
    setJeuxAdmin(prev => prev.map(j => j.id === id ? { ...j, partiesJouees: 0, scoreMoyen: 0 } : j));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/contenus/mini-jeux/${id}`, { method: 'PATCH', headers: _authHdrsAdmin(), body: JSON.stringify({ reset: true }) });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Action refusée', { duration: 5000 });
        setJeuxAdmin(prev => prev.map(j => j.id === id ? cible : j));
      }
    } catch {} finally {
      setContenuIdsEnCours(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }
  async function creerJeu() {
    if (!jeuForm.nom || savingJeu) return;
    setSavingJeu(true);
    try {
    const typeInfo = TYPES_JEUX.find(t => t.id === jeuForm.type);
    const body = { nom: jeuForm.nom, type: jeuForm.type, categorie: typeInfo?.categorie || 'tous', cible: jeuForm.cible, nb_questions: jeuForm.nbQuestions, max_tentatives: jeuForm.maxTentatives };
    try {
      if (editingJeuId) {
        const r = await fetch(`${_API_URL_ADMIN}/api/contenus/mini-jeux/${editingJeuId}`, { method: 'PATCH', headers: _authHdrsAdmin(), body: JSON.stringify(body) });
        const d = await r.json();
        if (r.ok) {
          setJeuxAdmin(prev => prev.map(j => j.id === editingJeuId ? mapJeu(d.jeu) : j));
        } else {
          toast.error(d.error || 'Modification refusée', { duration: 5000 });
          return;
        }
      } else {
        const r = await fetch(`${_API_URL_ADMIN}/api/contenus/mini-jeux`, { method: 'POST', headers: _authHdrsAdmin(), body: JSON.stringify(body) });
        const d = await r.json();
        if (r.ok) {
          setJeuxAdmin(prev => [...prev, mapJeu(d.jeu)]);
        } else {
          toast.error(d.error || 'Création refusée', { duration: 5000 });
          return;
        }
      }
    } catch {}
    setModalJeu(false);
    setEditingJeuId(null);
    setJeuForm({ nom:'', type:'qcm', cible:'tous', nbQuestions:10, maxTentatives:2 });
    } finally {
      setSavingJeu(false);
    }
  }
  function ouvrirEditionJeu(j) {
    setEditingJeuId(j.id);
    setJeuForm({ nom: j.nom, type: j.type, cible: j.cible, nbQuestions: j.nbQuestions, maxTentatives: j.maxTentatives ?? 2 });
    setModalJeu(true);
  }
  async function ouvrirDetailsJeu(j) {
    setDetailsJeu(j);
    setResultatsJeuLoading(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/contenus/mini-jeux/${j.id}/resultats`, { headers: _authHdrsAdmin() });
      const d = await r.json();
      setResultatsJeu(d.resultats || []);
    } catch { setResultatsJeu([]); }
    finally { setResultatsJeuLoading(false); }
  }
  async function modifierTentatives(id, valeur) {
    if (contenuIdsEnCours.has(id)) return;
    const v = Math.max(1, Math.min(10, parseInt(valeur) || 1));
    const cible = jeuxAdmin.find(j => j.id === id);
    setContenuIdsEnCours(prev => new Set(prev).add(id));
    setJeuxAdmin(prev => prev.map(j => j.id === id ? { ...j, maxTentatives: v } : j));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/contenus/mini-jeux/${id}`, { method: 'PATCH', headers: _authHdrsAdmin(), body: JSON.stringify({ max_tentatives: v }) });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Modification refusée', { duration: 5000 });
        if (cible) setJeuxAdmin(prev => prev.map(j => j.id === id ? cible : j));
      }
    } catch {} finally {
      setContenuIdsEnCours(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  const totalApprenants   = MOCK_APPRENANTS.length;
  const totalProfesseurs  = MOCK_PROFESSEURS.length;
  const totalGroupes      = MOCK_GROUPES.length;
  const sessionsEnCours   = MOCK_SESSIONS.filter((s) => s.statut === 'en_cours').length;
  const sessionsAVenir    = MOCK_SESSIONS.filter((s) => s.statut === 'planifiee').length;
  const apprenantsPending = MOCK_APPRENANTS.filter((a) => a.statut === 'en_attente' || a.statut === 'test_niveau_pending').length;

  // ── KPIs réels pour admin_placement ──────────────────────────────────────
  const [placementStats, setPlacementStats] = useState({ enAttente:0, enCours:0, aAssigner:0, total:0 });
  // Résultats testés (a-assigner + historique) - sert aux courbes Vue d'ensemble ci-dessous
  const [placementResultats, setPlacementResultats] = useState([]);
  const [placementAssignesCount, setPlacementAssignesCount] = useState(0);
  useEffect(() => {
    if (!estRole(profile?.role, 'admin_placement')) return;
    const h = { 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('admin_token')||''}` };
    Promise.all([
      fetch(`${_API_URL_ADMIN}/api/placement/queue`,       { headers: h }),
      fetch(`${_API_URL_ADMIN}/api/placement/a-assigner`,  { headers: h }),
      fetch(`${_API_URL_ADMIN}/api/placement/historique`,  { headers: h }),
    ]).then(async ([r1, r2, r3]) => {
      const d1 = await r1.json();
      const d2 = await r2.json();
      const d3 = await r3.json();
      const q  = d1.queue || [];
      const aa = d2.apprenants || [];
      const hist = d3.apprenants || [];
      setPlacementStats({
        enAttente:  q.filter(x => x.statut === 'en_attente_test').length,
        enCours:    q.filter(x => x.statut === 'test_en_cours').length,
        aAssigner:  aa.length,
        total:      q.length + aa.length,
      });
      setPlacementAssignesCount(hist.length);
      setPlacementResultats([...aa, ...hist]);
    }).catch(() => {});
  }, [profile?.role]);

  const MOIS_LABELS_PLACEMENT = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  const placementParMois = (() => {
    const mois = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i));
      return { label: `${MOIS_LABELS_PLACEMENT[d.getMonth()+1]} ${d.getFullYear()}`, prefix: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` };
    });
    return mois.map(m => ({ mois: m.label, count: placementResultats.filter(r => (r.date_test||r.created_at||'').startsWith(m.prefix)).length }));
  })();
  const placementParNiveau = (() => {
    const map = {};
    placementResultats.forEach(r => { const k = r.niveau_detecte || 'Non défini'; map[k] = (map[k]||0)+1; });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([nom, valeur]) => ({ nom, valeur, couleur: NIV_COULEUR[nom] || '#94A3B8' }));
  })();
  const placementTotalTestes = placementResultats.length;
  const placementTauxAssignation = placementTotalTestes ? Math.round((placementAssignesCount / placementTotalTestes) * 100) : 0;

  // ── KPIs réels pour admin_elearning (remplace les MOCK_* de la barre de stats) ──
  const [elearningStats, setElearningStats] = useState({ apprenants:0, coachs:0, groupes:0, sessions:0 });
  useEffect(() => {
    if (!estRole(profile?.role, 'admin_elearning')) return;
    const h = { 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('admin_token')||''}` };
    const maintenant = new Date();
    Promise.all([
      fetch(`${_API_URL_ADMIN}/api/classes-elearning`, { headers: h }),
      fetch(`${_API_URL_ADMIN}/api/elearning/seances?mois=${maintenant.getMonth()+1}&annee=${maintenant.getFullYear()}`, { headers: h }),
    ]).then(async ([r1, r2]) => {
      const d1 = await r1.json();
      const d2 = await r2.json();
      const classes  = d1.classes  || [];
      const seances  = d2.seances  || [];
      setElearningStats({
        apprenants: classes.reduce((s, c) => s + (c.nb_apprenants || 0), 0),
        coachs:     new Set(classes.map(c => c.coach_id).filter(Boolean)).size,
        groupes:    classes.length,
        sessions:   seances.filter(s => s.statut === 'planifiee').length,
      });
    }).catch(() => {});
  }, [profile?.role]);

  const stats = estRole(profile?.role, 'admin_elearning')
    ? [
        { label: 'Apprenants',     valeur: elearningStats.apprenants, couleur: couleurTheme },
        { label: 'Coachs',         valeur: elearningStats.coachs,     couleur: COULEURS.succes },
        { label: 'Groupes actifs', valeur: elearningStats.groupes,    couleur: '#A78BFA' },
        { label: 'Sessions à venir', valeur: elearningStats.sessions, couleur: COULEURS.attention },
      ]
    : [
        { label: 'Apprenants',     valeur: totalApprenants,  couleur: couleurTheme },
        { label: 'Professeurs',    valeur: totalProfesseurs, couleur: COULEURS.succes },
        { label: 'Groupes actifs', valeur: totalGroupes,     couleur: '#A78BFA' },
        { label: 'Sessions',       valeur: sessionsEnCours + sessionsAVenir, couleur: COULEURS.attention },
      ];


  const indicateursDuRole = (INDICATEURS_PAR_ROLE[profile?.role] || [])
    .map((id) => MOCK_INDICATEURS[id])
    .filter(Boolean);

  const styles = {
    corps: { flex: 1, padding: 32, overflowY: 'auto' },
    descriptionZone: {
      background: COULEURS.blanc,
      borderRadius: 12,
      padding: '16px 20px',
      marginBottom: 28,
      border: `1px solid ${COULEURS.gris200}`,
      fontSize: 14,
      color: COULEURS.gris600,
    },
    kpisGlobaux: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 16,
      marginBottom: 32,
    },
    carteKpi: (accent) => ({
      background: COULEURS.blanc,
      borderRadius: 12,
      padding: '18px 20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      border: `1px solid ${COULEURS.gris200}`,
      borderTop: `3px solid ${accent}`,
    }),
    kpiVal: {
      fontSize: 28,
      fontWeight: 800,
      color: COULEURS.navy,
      lineHeight: 1,
      marginBottom: 4,
    },
    kpiLbl: {
      fontSize: 12,
      color: COULEURS.gris600,
    },
    titreSec: {
      fontSize: 16,
      fontWeight: 700,
      color: COULEURS.navy,
      marginBottom: 20,
    },
    grilleModules: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
      gap: 20,
      marginBottom: 32,
    },
    carteModule: (couleur) => ({
      background: COULEURS.blanc,
      borderRadius: 16,
      padding: 28,
      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
      border: `1px solid ${COULEURS.gris200}`,
      cursor: 'pointer',
      transition: 'transform 0.15s, box-shadow 0.15s',
      textAlign: 'center',
    }),
    moduleIcone: (couleur) => ({
      width: 64,
      height: 64,
      borderRadius: 20,
      background: couleur + '18',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 28,
      margin: '0 auto 16px',
      border: `2px solid ${couleur}30`,
    }),
    moduleTitre: {
      fontSize: 16,
      fontWeight: 700,
      color: COULEURS.navy,
    },
    grilleIndicateurs: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
      gap: 16,
      marginBottom: 32,
    },
    carteIndicateur: (statut) => ({
      background: COULEURS.blanc,
      borderRadius: 14,
      padding: '18px 20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      border: `1px solid ${COULEUR_STATUT[statut].bord}`,
      borderLeft: `4px solid ${COULEUR_STATUT[statut].accent}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }),
    indEntete: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    indIcone: { fontSize: 20 },
    indBadge: (statut) => ({
      fontSize: 10,
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 20,
      background: COULEUR_STATUT[statut].fond,
      color: COULEUR_STATUT[statut].texte,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }),
    indValeur: (statut) => ({
      fontSize: 30,
      fontWeight: 800,
      color: COULEUR_STATUT[statut].accent,
      lineHeight: 1,
    }),
    indLabel: {
      fontSize: 13,
      fontWeight: 700,
      color: COULEURS.navy,
    },
    indDef: {
      fontSize: 11,
      color: COULEURS.gris400,
      lineHeight: 1.5,
    },
    indTendance: {
      fontSize: 11,
      color: COULEURS.gris600,
      fontStyle: 'italic',
      marginTop: 2,
    },
    tableauProfs: {
      background: COULEURS.blanc,
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      border: `1px solid ${COULEURS.gris200}`,
    },
    enteteTab: {
      display: 'grid',
      gridTemplateColumns: '2fr 2fr 1fr 1fr',
      padding: '12px 20px',
      background: COULEURS.gris50,
      borderBottom: `1px solid ${COULEURS.gris200}`,
      fontSize: 11,
      fontWeight: 700,
      color: COULEURS.gris600,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    },
    ligneProf: {
      display: 'grid',
      gridTemplateColumns: '2fr 2fr 1fr 1fr',
      padding: '14px 20px',
      borderBottom: `1px solid ${COULEURS.gris100}`,
      fontSize: 13,
      alignItems: 'center',
    },
    nomProf: {
      fontWeight: 600,
      color: COULEURS.navy,
    },
    badgeActif: (actif) => ({
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 20,
      background: actif ? '#D1FAE5' : '#FEE2E2',
      color: actif ? '#065F46' : '#991B1B',
      fontSize: 11,
      fontWeight: 600,
    }),
  };

  if (!config) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        Rôle admin non reconnu.
      </div>
    );
  }

  return (
    <>
    <TopNavLayout stats={stats}>
      <div style={styles.corps}>

          {/* ══ AGENT ONBOARDING - vues dédiées ══ */}
          {estRole(profile?.role, 'admin_manager') && (location.pathname === '/admin/audit-logs' || location.pathname === '/admin/manager/audit') ? (
            <OngletAuditLogs />
          ) : estRole(profile?.role, 'admin_superviseur') && location.pathname === '/admin/superviseur/taches' ? (
            <OngletMesTachesSuperviseur general />
          ) : estRole(profile?.role, 'admin_superviseur') && location.pathname === '/admin/superviseur/classement' ? (
            <OngletClassementCoachs />
          ) : estRole(profile?.role, 'admin_superviseur') && location.pathname === '/admin/superviseur/plannings' ? (
            <OngletPlanningsElearning />
          ) : estRole(profile?.role, 'admin_superviseur') && location.pathname === '/admin/superviseur/observer' ? (
            <OngletObserverCours />
          ) : estRole(profile?.role, 'admin_superviseur') && location.pathname === '/admin/superviseur/remplacements' ? (
            <OngletRemplacements />
          ) : estRole(profile?.role, 'admin_superviseur') && location.pathname === '/admin/superviseur/cahiers-coachs' ? (
            <OngletCahiersCoachs />
          ) : estRole(profile?.role, 'admin_superviseur') && location.pathname === '/admin/superviseur/rapports-deputy' ? (
            <OngletRapportsDeputySuperviseur />
          ) : estRole(profile?.role, 'admin_superviseur') && location.pathname === '/admin/superviseur/anomalies' ? (
            <OngletAnomaliesSuperviseur />
          ) : estRole(profile?.role, 'admin_superviseur') && location.pathname === '/admin/superviseur/deputies' ? (
            <OngletGestionDeputies />
          ) : /* ── LE VOLET COMMERCIAL, monté sur `admin_elearning` ──
                 Aucun rôle de bet-elearning n'est « Commerciale » : `commercial`,
                 `corporate` et `admin_commercial` se résolvent tous vers `admin_elearning`.
                 Trois de ces écrans sont des réutilisations : Plannings vient du Superviseur,
                 Suivi démarrage de l'Onboarding, Tests reçus du Placement. */
            estRole(profile?.role, 'admin_elearning') && location.pathname === '/admin/vente/taches' ? (
            <OngletCommMesTaches />
          ) : estRole(profile?.role, 'admin_elearning') && location.pathname === '/admin/vente/tableau-de-bord' ? (
            <OngletCommTableauBord />
          ) : estRole(profile?.role, 'admin_elearning') && location.pathname === '/admin/vente/tests' ? (
            <BetLevelTestsTab vueInitiale="resultats" />
          ) : estRole(profile?.role, 'admin_elearning') && location.pathname === '/admin/vente/inscriptions' ? (
            <OngletCommInscriptions />
          ) : estRole(profile?.role, 'admin_elearning') && location.pathname === '/admin/vente/classes' ? (
            <OngletCommMesClasses />
          ) : estRole(profile?.role, 'admin_elearning') && location.pathname === '/admin/vente/plannings' ? (
            <OngletPlanningsElearning />
          ) : estRole(profile?.role, 'admin_elearning') && location.pathname === '/admin/vente/apprenants' ? (
            <OngletCommMesApprenants />
          ) : estRole(profile?.role, 'admin_elearning') && location.pathname === '/admin/vente/suivi' ? (
            <OngletSuiviDemarrage />
          ) : estRole(profile?.role, 'admin_elearning') && location.pathname === '/admin/vente/paiements' ? (
            <OngletCommPaiements />
          ) : /* ── LA DIRECTION ──
                 Sept chemins, un seul écran neuf : tous les autres montent des composants
                 déjà écrits pour d'autres rôles. La direction supervise les mêmes données —
                 il n'y avait aucune raison d'en écrire une seconde version.
                 `estRole` couvre admin, super_admin et manager d'un coup. */
            estRole(profile?.role, 'admin_manager') && location.pathname === '/admin/direction/taches' ? (
            <OngletDirectionMesTaches />
          ) : estRole(profile?.role, 'admin_manager') && location.pathname === '/admin/direction/apprenants' ? (
            /* `OngletCommMesApprenants` lisait /api/groupes/apprenants — les classes de DASH.
               La direction de BET E-Learning y voyait les apprenants du présentiel. */
            <OngletDirectionApprenants />
          ) : estRole(profile?.role, 'admin_manager') && location.pathname === '/admin/direction/classes' ? (
            <OngletCommMesClasses />
          ) : estRole(profile?.role, 'admin_manager') && location.pathname === '/admin/direction/plannings' ? (
            <OngletPlanningsElearning />
          ) : estRole(profile?.role, 'admin_manager') && location.pathname === '/admin/direction/paiements' ? (
            /* L'ADMINISTRATEUR N'A PAS LE DROIT D'ENREGISTRER UN PAIEMENT : son bouton est
               masqué. Le Super Admin le garde — il a tout — et la comptabilité, qui monte ce
               même écran depuis sa propre route, n'est pas touchée. */
            <OngletComptaPaiements lectureSeule={profile?.role === 'admin'} />
          ) : estRole(profile?.role, 'admin_manager') && location.pathname === '/admin/direction/ca' ? (
            <OngletComptaApercu />
          ) : estRole(profile?.role, 'admin_manager') && location.pathname === '/admin/direction/administration' ? (
            <OngletAdministrationBET />
          ) : estRole(profile?.role, 'admin_onboarding') && location.pathname === '/admin/onboarding/taches' ? (
            <OngletMesTachesOnboarding />
          ) : estRole(profile?.role, 'admin_onboarding') && location.pathname === '/admin/onboarding/apprenants' ? (
            <OngletMesApprenantsOnboarding />
          ) : estRole(profile?.role, 'admin_onboarding') && location.pathname === '/admin/onboarding/coachs' ? (
            <OngletCoachsOnboarding />
          ) : estRole(profile?.role, 'admin_onboarding') && location.pathname === '/admin/onboarding/reaffectations' ? (
            <OngletReaffectations couleur="#F97316" />
          ) : estRole(profile?.role, 'admin_onboarding') && location.pathname === '/admin/onboarding/suivi' ? (
            <OngletSuiviDemarrage />
          ) : /* Le MÊME planning e-learning que chez le superviseur et le Deputy : trois rôles
                 regardent les mêmes séances, un seul composant les rend. */
            estRole(profile?.role, 'admin_onboarding') && location.pathname === '/admin/onboarding/plannings' ? (
            <OngletPlanningsElearning />
          ) : estRole(profile?.role, 'admin_onboarding') && location.pathname === '/admin/onboarding' ? (
            <OngletVueEnsembleOnboarding />
          ) : estRole(profile?.role, 'admin_onboarding') && location.pathname === '/admin/onboarding/parcours' ? (
            <OngletParcoursInscriptions />
          ) : estRole(profile?.role, 'admin_onboarding') && location.pathname === '/admin/onboarding/inscriptions' ? (
            <OngletInscriptionOnboarding />
          ) : estRole(profile?.role, 'admin_onboarding') && location.pathname === '/admin/onboarding/entreprises' ? (
            <OngletEntreprises />
          ) : estRole(profile?.role, 'admin_onboarding') && location.pathname === '/admin/onboarding/classes' ? (
            <OngletClasses />

          ) : /* ── ASSISTANTE SAV ──
                 Le rôle n'existait pas du tout dans bet-elearning : ni menu, ni route, ni
                 dashboard. Il garde l'identifiant `assistant_sav` de la base plutôt qu'un
                 `admin_sav` de façade (voir `DashboardSav.jsx`). */
            profile?.role === 'assistant_sav' && location.pathname === '/admin/sav/taches' ? (
            <OngletMesTachesSav />
          ) : profile?.role === 'assistant_sav' && location.pathname === '/admin/sav/demandes' ? (
            <OngletDemandesSav />
          ) : profile?.role === 'assistant_sav' && location.pathname === '/admin/sav/remboursements' ? (
            <OngletRemboursementsSav />
          ) : profile?.role === 'assistant_sav' && location.pathname === '/admin/sav/satisfaction' ? (
            <OngletSatisfactionSav />
          ) : profile?.role === 'assistant_sav' ? (
            /* Tout autre chemin du rôle retombe sur son tableau de bord, y compris `/admin/sav`
               lui-même : sans ce repli, une URL inattendue afficherait l'écran generique des
               admins, qui n'a aucun sens pour ce métier. */
            <OngletTableauBordSav />
          ) : estRole(profile?.role, 'admin_placement') && location.pathname === '/admin/placement/taches' ? (
            <OngletMesTachesPlacement />
          ) : estRole(profile?.role, 'admin_placement') && location.pathname === '/admin/placement/rapports' ? (
            <OngletRapportsPlacement />
          ) : /* « À corriger » et « Résultats candidats » sont le MÊME écran que « Tests de
                 niveau », ouvert sur sa sous-vue de résultats — l'un filtré sur la file de
                 correction, l'autre non. Deux composants distincts auraient dupliqué 554 lignes
                 et fait diverger les corrections. */
            estRole(profile?.role, 'admin_placement') && location.pathname === '/admin/placement/a-corriger' ? (
            <BetLevelTestsTab vueInitiale="resultats" filtreInitial="en_attente" />
          ) : estRole(profile?.role, 'admin_placement') && location.pathname === '/admin/placement/resultats' ? (
            <BetLevelTestsTab vueInitiale="resultats" />
          ) : estRole(profile?.role, 'admin_placement') && location.pathname === '/admin/placement/tests' ? (
            <OngletGestionTests />
          ) : estRole(profile?.role, 'admin_placement') ? (
            <>
              <div style={styles.descriptionZone}>{config.description}</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginBottom:14 }}>
                {[
                  { l:'Tests en attente',  v:placementStats.enAttente,  c:'#7C3AED', i:'📋' },
                  { l:'À assigner',        v:placementStats.aAssigner,  c:couleurTheme, i:'🎯' },
                  { l:'Test en cours',     v:placementStats.enCours,    c:COULEURS.attention, i:'⏳' },
                  { l:'Total en queue',    v:placementStats.total,      c:COULEURS.succes, i:'📊' },
                ].map(k => (
                  <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:12, padding:'16px 18px', border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}` }}>
                    <div style={{ fontSize:22, marginBottom:5 }}>{k.i}</div>
                    <div style={{ fontSize:20, fontWeight:800, color:k.c }}>{k.v}</div>
                    <div style={{ fontSize:11, color:COULEURS.gris600, marginTop:3 }}>{k.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginBottom:28 }}>
                {[
                  { l:'Total testés',        v:placementTotalTestes,       c:COULEURS.cyanFonce, i:'✅' },
                  { l:"Taux d'assignation",  v:`${placementTauxAssignation}%`, c:'#059669', i:'📈' },
                ].map(k => (
                  <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:12, padding:'16px 18px', border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}` }}>
                    <div style={{ fontSize:22, marginBottom:5 }}>{k.i}</div>
                    <div style={{ fontSize:20, fontWeight:800, color:k.c }}>{k.v}</div>
                    <div style={{ fontSize:11, color:COULEURS.gris600, marginTop:3 }}>{k.l}</div>
                  </div>
                ))}
              </div>

              {/* ── Courbes de résultat ── */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:16, marginBottom:28 }}>
                <div style={{ background:COULEURS.blanc, borderRadius:14, padding:20, border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>📈 Tests réalisés (6 derniers mois)</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={placementParMois}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mois" tick={{ fontSize:10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize:11 }} />
                      <RTooltip />
                      <Line type="monotone" dataKey="count" stroke={couleurTheme} strokeWidth={2} dot={{ r:3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ background:COULEURS.blanc, borderRadius:14, padding:20, border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>🎯 Répartition par niveau détecté</div>
                  {placementParNiveau.length === 0 ? (
                    <div style={{ textAlign:'center', padding:40, color:COULEURS.gris400, fontSize:12 }}>Aucun test réalisé.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={placementParNiveau} dataKey="valeur" nameKey="nom" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                          {placementParNiveau.map((s, i) => <Cell key={i} fill={s.couleur} />)}
                        </Pie>
                        <RTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div style={styles.titreSec}>Accès rapides</div>
              <div style={styles.grilleModules}>
                {config.modules.map((mod) => (
                  <div key={mod.id} style={styles.carteModule(mod.couleur)} onClick={() => navigate(mod.chemin)}
                    onMouseEnter={e => { e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.12)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'; }}>
                    <div style={styles.moduleIcone(mod.couleur)}>
                      <span style={{ fontSize:28 }}>{mod.icone}</span>
                    </div>
                    <div style={styles.moduleTitre}>{mod.titre}</div>
                  </div>
                ))}
              </div>
            </>

          ) : (estRole(profile?.role, 'admin_onboarding') && location.pathname === '/admin/onboarding/contenus' && contenusOnbSousTab === 'bibliotheque') ? (
            /* ══ BIBLIOTHÈQUE ONBOARDING + RESSOURCES COMMUNES ══ */
            <div>
              {estRole(profile?.role, 'admin_onboarding') && <ContenusOnbSousTabs actif={contenusOnbSousTab} onChange={setContenusOnbSousTab} />}
              {/* Onboarding */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div style={styles.titreSec}>📚 Contenus d'onboarding</div>
                <button onClick={() => { setEditingRessourceId(null); setEditOriginalFichierUrl(null); setUploadForm({ titre:'', categorie:'bienvenue', type:'pdf', fichier:null, lienVideo:'', visible:true }); setModalUpload(true); }} style={{ background:'#7C3AED', color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>+ Ajouter un contenu</button>
              </div>
              <div style={{ display:'flex', gap:8, marginBottom:18, flexWrap:'wrap' }}>
                {[{ id:'tous', lib:'Tous', icone:'📂', couleur:COULEURS.navy }, ...CATS_CONTENUS].map(c => (
                  <button key={c.id} onClick={() => setCatActive(c.id)} style={{ padding:'6px 14px', borderRadius:20, border:`1.5px solid ${catActive===c.id?c.couleur:COULEURS.gris200}`, background:catActive===c.id?c.couleur:COULEURS.blanc, color:catActive===c.id?'#fff':COULEURS.gris600, fontSize:12, fontWeight:catActive===c.id?700:500, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                    {c.icone} {c.lib} <span style={{ opacity:0.7, fontSize:10 }}>({ressources.filter(r=>c.id==='tous'?true:r.cat===c.id).length})</span>
                  </button>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(290px,1fr))', gap:12, marginBottom:32 }}>
                {ressources.filter(r=>catActive==='tous'||r.cat===catActive).map(r => {
                  const cat = CATS_CONTENUS.find(c=>c.id===r.cat);
                  return (
                    <div key={r.id} style={{ background:COULEURS.blanc, borderRadius:12, border:`1px solid ${COULEURS.gris200}`, overflow:'hidden', opacity:r.visible?1:0.6 }}>
                      <div style={{ height:4, background:cat?.couleur||'#7C3AED' }} />
                      <div style={{ padding:'14px 16px' }}>
                        <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:10 }}>
                          <span style={{ fontSize:22 }}>{r.type==='video'?'🎬':'📄'}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{r.titre}</div>
                            <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:3 }}>{r.detail} · {r.date}</div>
                          </div>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ fontSize:11, color:COULEURS.gris400 }}>👁 {r.vues} vues · <span style={{ padding:'2px 7px', borderRadius:10, background:r.visible?'#D1FAE5':'#F1F5F9', color:r.visible?'#065F46':'#64748B', fontSize:10, fontWeight:700 }}>{r.visible?'Visible':'Masqué'}</span></span>
                          <div style={{ display:'flex', gap:6 }}>
                            <button onClick={() => ouvrirEditionRessource(r)} style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:11, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>✏️ Modifier</button>
                            <button onClick={() => toggleVisib(r.id)} style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:11, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>{r.visible?'🔒 Masquer':'👁 Publier'}</button>
                            <button onClick={() => setModalSupprimerContenu({ type:'ressource', id:r.id, titre:r.titre })} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid #FECACA', background:'#FEF2F2', color:'#991B1B', fontSize:11, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>🗑</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bibliothèque communautaire */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div style={styles.titreSec}>🌍 Bibliothèque communautaire <span style={{ fontSize:12, fontWeight:500, color:COULEURS.gris400 }}>- accessible à tous les apprenants</span></div>
                <button onClick={ouvrirCreationBiblioCom} style={{ background:couleurTheme, color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>+ Ajouter</button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(290px,1fr))', gap:12 }}>
                {biblioCom.map(r => {
                  const cibleColor = r.cible==='enfant'?'#F97316':r.cible==='adolescent'?'#8B5CF6':r.cible==='adulte'?'#0891B2':'#64748B';
                  return (
                    <div key={r.id} style={{ background:COULEURS.blanc, borderRadius:12, border:`1px solid ${COULEURS.gris200}`, padding:'14px 16px', opacity:r.visible?1:0.65 }}>
                      <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:10 }}>
                        <span style={{ fontSize:24 }}>{r.icone}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:4 }}>{r.titre}</div>
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                            <span style={{ padding:'2px 8px', borderRadius:10, background:cibleColor+'15', color:cibleColor, fontSize:10, fontWeight:700 }}>{r.cible}</span>
                            <span style={{ padding:'2px 8px', borderRadius:10, background:COULEURS.gris100, color:COULEURS.gris600, fontSize:10 }}>{r.type}</span>
                            {r.duree && <span style={{ fontSize:11, color:COULEURS.gris400 }}>⏱ {r.duree}</span>}
                          </div>
                        </div>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:11, color:COULEURS.gris400 }}>👁 {r.vues} vues · <span style={{ padding:'2px 7px', borderRadius:10, background:r.visible?'#D1FAE5':'#F1F5F9', color:r.visible?'#065F46':'#64748B', fontSize:10, fontWeight:700 }}>{r.visible?'Visible':'Masqué'}</span></span>
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={() => ouvrirEditionBiblioCom(r)} style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:11, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>✏️</button>
                          <button onClick={() => toggleBiblioComVisib(r.id)} style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:11, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>{r.visible?'🔒 Masquer':'👁 Publier'}</button>
                          <button onClick={() => setModalSupprimerContenu({ type:'biblio', id:r.id, titre:r.titre })} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid #FECACA', background:'#FEF2F2', color:'#991B1B', fontSize:11, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>🗑</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          ) : (estRole(profile?.role, 'admin_onboarding') && location.pathname === '/admin/onboarding/contenus' && contenusOnbSousTab === 'upload') ? (
            /* ══ MISE EN LIGNE ══ */
            <div>
              {estRole(profile?.role, 'admin_onboarding') && <ContenusOnbSousTabs actif={contenusOnbSousTab} onChange={setContenusOnbSousTab} />}
              <div style={styles.titreSec}>⬆ Mise en ligne d'un contenu</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
                {/* Formulaire upload */}
                <div style={{ background:COULEURS.blanc, borderRadius:14, padding:'24px', border:`1px solid ${COULEURS.gris200}` }}>
                  <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:18 }}>Nouveau contenu</div>
                  {[
                    { lbl:'Titre *', key:'titre', ph:'ex: Vidéo de bienvenue BET 2026', type:'text' },
                  ].map(f => (
                    <div key={f.key} style={{ marginBottom:14 }}>
                      <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:5 }}>{f.lbl}</label>
                      <input value={uploadForm.titre} onChange={e=>setUploadForm(p=>({...p,titre:e.target.value}))} style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', outline:'none', boxSizing:'border-box' }} placeholder={f.ph} />
                    </div>
                  ))}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                    <div>
                      <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:5 }}>Catégorie</label>
                      <select value={uploadForm.categorie} onChange={e=>setUploadForm(p=>({...p,categorie:e.target.value}))} style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', outline:'none' }}>
                        {CATS_CONTENUS.map(c => <option key={c.id} value={c.id}>{c.icone} {c.lib}</option>)}
                        <option value="communautaire">🌍 Bibliothèque communautaire</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:5 }}>Type</label>
                      <select value={uploadForm.type} onChange={e=>setUploadForm(p=>({...p,type:e.target.value}))} style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', outline:'none' }}>
                        <option value="video">🎬 Vidéo</option>
                        <option value="pdf">📄 PDF / Document</option>
                        <option value="audio">🎧 Audio / Podcast</option>
                        <option value="jeu">🎮 Jeu interactif</option>
                      </select>
                    </div>
                  </div>
                  {/* Lien vidéo (YouTube/Vimeo/URL directe) - alternative à l'upload de fichier */}
                  {uploadForm.type === 'video' && (
                    <div style={{ marginBottom:14 }}>
                      <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:5 }}>Lien vidéo (YouTube, Vimeo, URL directe…)</label>
                      <input value={uploadForm.lienVideo} onChange={e=>setUploadForm(p=>({...p,lienVideo:e.target.value, fichier: e.target.value ? null : p.fichier}))}
                        placeholder="https://www.youtube.com/watch?v=..."
                        style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:`1.5px solid ${uploadForm.lienVideo?'#7C3AED':COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', outline:'none', boxSizing:'border-box' }} />
                      <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:4 }}>Ou importez un fichier vidéo ci-dessous - le lien est prioritaire si les deux sont renseignés.</div>
                    </div>
                  )}
                  {/* Zone drop */}
                  <label style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'28px 20px', borderRadius:12, border:`2px dashed ${uploadForm.fichier?COULEURS.succes:COULEURS.gris200}`, background:uploadForm.fichier?'#F0FDF4':COULEURS.gris50, cursor:'pointer', marginBottom:14, transition:'all 0.15s', opacity: uploadForm.lienVideo?0.5:1 }}>
                    <span style={{ fontSize:36 }}>{uploadForm.fichier?'✅':'☁️'}</span>
                    <span style={{ fontSize:13, fontWeight:600, color:uploadForm.fichier?COULEURS.succes:COULEURS.gris600 }}>{uploadForm.fichier?uploadForm.fichier.name:'Glissez ou cliquez pour importer'}</span>
                    <span style={{ fontSize:11, color:COULEURS.gris400 }}>Vidéo max {LIMITES_CONTENU_MO.video} Mo · Audio max {LIMITES_CONTENU_MO.audio} Mo · PDF/DOCX max {LIMITES_CONTENU_MO.autre} Mo</span>
                    <input type="file" disabled={!!uploadForm.lienVideo} style={{ display:'none' }} accept=".mp4,.pdf,.mp3,.docx,.pptx" onChange={async e=>{
                      const f = e.target.files[0] || null;
                      const depasse = fichierDepasseLimite(f);
                      if (depasse) { await alerte(`Fichier trop lourd : ${depasse.tailleMo} Mo (max ${depasse.limite} Mo pour ce type).`, { danger: true }); e.target.value = ''; return; }
                      setUploadForm(p=>({...p,fichier:f}));
                    }} />
                  </label>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:COULEURS.gris50, borderRadius:10, padding:'10px 14px', border:`1px solid ${COULEURS.gris200}`, marginBottom:14 }}>
                    <div><div style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>Publier immédiatement</div><div style={{ fontSize:11, color:COULEURS.gris400 }}>Visible par les apprenants dès l'upload</div></div>
                    <button onClick={()=>setUploadForm(p=>({...p,visible:!p.visible}))} style={{ width:46, height:26, borderRadius:13, border:'none', background:uploadForm.visible?couleurTheme:COULEURS.gris200, cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
                      <div style={{ position:'absolute', top:3, left:uploadForm.visible?22:3, width:20, height:20, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 4px rgba(0,0,0,0.2)', transition:'left 0.2s' }} />
                    </button>
                  </div>
                  <button disabled={!uploadForm.titre} onClick={ajouterRessource} style={{ width:'100%', padding:'11px', borderRadius:8, border:'none', background:uploadForm.titre?'#7C3AED':COULEURS.gris200, color:uploadForm.titre?'#fff':COULEURS.gris400, fontSize:13, fontWeight:700, cursor:uploadForm.titre?'pointer':'not-allowed', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                    ⬆ Publier le contenu
                  </button>
                </div>
                {/* Uploads récents */}
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>📋 Uploads récents</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {[...ressources].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6).map(r => {
                      const cat = CATS_CONTENUS.find(c=>c.id===r.cat);
                      return (
                        <div key={r.id} style={{ background:COULEURS.blanc, borderRadius:10, border:`1px solid ${COULEURS.gris200}`, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
                          <span style={{ fontSize:20 }}>{r.type==='video'?'🎬':'📄'}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>{r.titre}</div>
                            <div style={{ fontSize:11, color:COULEURS.gris400 }}>{cat?.lib} · {r.date} · {r.detail}</div>
                          </div>
                          <span style={{ padding:'3px 8px', borderRadius:10, background:r.visible?'#D1FAE5':'#F1F5F9', color:r.visible?'#065F46':'#64748B', fontSize:10, fontWeight:700 }}>{r.visible?'✅':'🔒'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

          ) : (estRole(profile?.role, 'admin_onboarding') && location.pathname === '/admin/onboarding/contenus' && contenusOnbSousTab === 'stats') ? (
            /* ══ STATISTIQUES ══ */
            <div>
              {estRole(profile?.role, 'admin_onboarding') && <ContenusOnbSousTabs actif={contenusOnbSousTab} onChange={setContenusOnbSousTab} />}
              <div style={styles.titreSec}>📈 Statistiques des contenus</div>
              {/* KPIs */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14, marginBottom:28 }}>
                {[
                  { l:'Total ressources',      v:ressources.length,                                   c:'#7C3AED', i:'📚' },
                  { l:'Vues ce mois',           v:ressources.reduce((s,r)=>s+r.vues,0),               c:couleurTheme, i:'👁' },
                  { l:'Ressources publiées',    v:ressources.filter(r=>r.visible).length,              c:COULEURS.succes, i:'✅' },
                  { l:'Bibliothèque commune',   v:biblioCom.length,                                   c:'#F97316', i:'🌍' },
                ].map(k => (
                  <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:12, padding:'16px 18px', border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}` }}>
                    <div style={{ fontSize:22, marginBottom:6 }}>{k.i}</div>
                    <div style={{ fontSize:22, fontWeight:800, color:k.c }}>{k.v}</div>
                    <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:4 }}>{k.l}</div>
                  </div>
                ))}
              </div>
              {/* Top ressources */}
              <div style={{ marginBottom:28 }}>
                <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>🏆 Top 5 ressources les plus consultées</div>
                <div style={styles.tableauProfs}>
                  <div style={{ display:'grid', gridTemplateColumns:'0.5fr 3fr 1.5fr 1fr 1fr 1fr', padding:'10px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    <span>#</span><span>Ressource</span><span>Catégorie</span><span>Type</span><span>Vues</span><span>Statut</span>
                  </div>
                  {[...ressources].sort((a,b)=>b.vues-a.vues).slice(0,5).map((r,i) => {
                    const cat = CATS_CONTENUS.find(c=>c.id===r.cat);
                    const maxVues = Math.max(...ressources.map(x=>x.vues),1);
                    return (
                      <div key={r.id} style={{ display:'grid', gridTemplateColumns:'0.5fr 3fr 1.5fr 1fr 1fr 1fr', padding:'13px 20px', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13, alignItems:'center' }}>
                        <span style={{ fontWeight:800, color:i<3?['#F59E0B','#9CA3AF','#CD7F32'][i]:COULEURS.gris400 }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</span>
                        <div>
                          <div style={{ fontWeight:600, color:COULEURS.navy }}>{r.titre}</div>
                          <div style={{ height:4, background:COULEURS.gris100, borderRadius:2, marginTop:4, overflow:'hidden', maxWidth:200 }}>
                            <div style={{ width:`${(r.vues/maxVues)*100}%`, height:'100%', background:cat?.couleur||'#7C3AED', borderRadius:2 }} />
                          </div>
                        </div>
                        <span style={{ fontSize:12, color:COULEURS.gris600 }}>{cat?.icone} {cat?.lib}</span>
                        <span style={{ fontSize:12, color:COULEURS.gris600 }}>{r.type==='video'?'🎬 Vidéo':'📄 PDF'}</span>
                        <span style={{ fontWeight:700, color:'#7C3AED' }}>{r.vues}</span>
                        <span style={{ padding:'3px 8px', borderRadius:10, background:r.visible?'#D1FAE5':'#F1F5F9', color:r.visible?'#065F46':'#64748B', fontSize:10, fontWeight:700 }}>{r.visible?'Visible':'Masqué'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Répartition par catégorie */}
              <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>📊 Vues par catégorie</div>
              <div style={{ background:COULEURS.blanc, borderRadius:14, padding:'20px', border:`1px solid ${COULEURS.gris200}` }}>
                {CATS_CONTENUS.map(cat => {
                  const vues = ressources.filter(r=>r.cat===cat.id).reduce((s,r)=>s+r.vues,0);
                  const maxVues = Math.max(...CATS_CONTENUS.map(c=>ressources.filter(r=>r.cat===c.id).reduce((s,r)=>s+r.vues,0)),1);
                  return (
                    <div key={cat.id} style={{ display:'flex', alignItems:'center', gap:14, marginBottom:12 }}>
                      <span style={{ fontSize:18, width:28 }}>{cat.icone}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:12, fontWeight:600, color:COULEURS.navy }}><span>{cat.lib}</span><span style={{ color:cat.couleur }}>{vues} vues</span></div>
                        <div style={{ height:8, background:COULEURS.gris100, borderRadius:4, overflow:'hidden' }}>
                          <div style={{ width:`${(vues/maxVues)*100}%`, height:'100%', background:cat.couleur, borderRadius:4 }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          ) : (estRole(profile?.role, 'admin_onboarding') && location.pathname === '/admin/onboarding/contenus' && contenusOnbSousTab === 'minijeux') ? (
            /* ══ GESTION MINI-JEUX ══ */
            <div>
              {estRole(profile?.role, 'admin_onboarding') && <ContenusOnbSousTabs actif={contenusOnbSousTab} onChange={setContenusOnbSousTab} />}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div style={styles.titreSec}>🎮 Gestion des mini-jeux</div>
                <button onClick={()=>{ setEditingJeuId(null); setJeuForm({ nom:'', type:'qcm', cible:'tous', nbQuestions:10, maxTentatives:2 }); setModalJeu(true); }} style={{ background:'#F97316', color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>+ Créer un jeu</button>
              </div>

              {/* Règle d'utilisation - encart prominent */}
              <div style={{ background:'linear-gradient(135deg,#FFF7ED,#FEF3C7)', border:'2px solid #FED7AA', borderRadius:12, padding:'16px 20px', marginBottom:24, display:'flex', gap:14, alignItems:'flex-start' }}>
                <span style={{ fontSize:28, flexShrink:0 }}>📋</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:800, color:'#92400E', marginBottom:6 }}>Règle d'utilisation des mini-jeux</div>
                  <div style={{ fontSize:12, color:'#78350F', lineHeight:1.7 }}>
                    L'apprenant dispose d'un nombre de tentatives <strong>réglable par jeu</strong> (colonne "Tentatives" dans le tableau ci-dessous, 1 à 10). Au-delà, le jeu est 🔒 verrouillé - seule l'équipe Onboarding/PA peut réinitialiser les tentatives d'un apprenant.
                  </div>
                </div>
              </div>

              {/* KPIs mini-jeux */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginBottom:24 }}>
                {[
                  { l:'Jeux actifs',    v:jeuxAdmin.filter(j=>j.actif).length,    c:'#059669', i:'✅' },
                  { l:'Total parties',  v:jeuxAdmin.reduce((s,j)=>s+j.partiesJouees,0), c:'#F97316', i:'🎮' },
                  { l:'Score moyen',    v: jeuxAdmin.filter(j=>j.scoreMoyen>0).length > 0 ? `${Math.round(jeuxAdmin.filter(j=>j.scoreMoyen>0).reduce((s,j)=>s+j.scoreMoyen,0)/jeuxAdmin.filter(j=>j.scoreMoyen>0).length)}%` : '-', c:'#7C3AED', i:'📊' },
                  { l:'Tentatives (min–max)', v: jeuxAdmin.length ? `${Math.min(...jeuxAdmin.map(j=>j.maxTentatives||2))}–${Math.max(...jeuxAdmin.map(j=>j.maxTentatives||2))}` : '-', c:'#0891B2', i:'🔄' },
                ].map(k => (
                  <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:12, padding:'14px 16px', border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}` }}>
                    <div style={{ fontSize:20, marginBottom:5 }}>{k.i}</div>
                    <div style={{ fontSize:20, fontWeight:800, color:k.c }}>{k.v}</div>
                    <div style={{ fontSize:11, color:COULEURS.gris600, marginTop:3 }}>{k.l}</div>
                  </div>
                ))}
              </div>

              {/* Jeux groupés par catégorie */}
              {[
                { cat:'enfant',     lib:'🧒 Enfants',          bg:'#FFF7ED', bord:'#FED7AA', txt:'#92400E' },
                { cat:'ado_adulte', lib:'🧑 Ados / Adultes',   bg:'#F5F3FF', bord:'#DDD6FE', txt:'#5B21B6' },
                { cat:'tous',       lib:'🌐 Tous niveaux',     bg:'#EFF6FF', bord:'#BFDBFE', txt:'#1D4ED8' },
              ].map(groupe => {
                const jeusDuGroupe = jeuxAdmin.filter(j => j.categorie === groupe.cat);
                if (jeusDuGroupe.length === 0) return null;
                return (
                  <div key={groupe.cat} style={{ marginBottom:28 }}>
                    <div style={{ background:groupe.bg, border:`1px solid ${groupe.bord}`, borderRadius:10, padding:'8px 16px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:13, fontWeight:800, color:groupe.txt }}>{groupe.lib}</span>
                      <span style={{ fontSize:11, color:groupe.txt, opacity:0.7 }}>{jeusDuGroupe.filter(j=>j.actif).length} actif{jeusDuGroupe.filter(j=>j.actif).length>1?'s':''} / {jeusDuGroupe.length}</span>
                    </div>
                    <div style={styles.tableauProfs}>
                      <div style={{ display:'grid', gridTemplateColumns:'2.2fr 1.1fr 0.9fr 0.9fr 0.9fr 1fr 1.5fr', padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                        <span>Jeu</span><span>Type</span><span>Cible</span><span>Parties</span><span>Score moy.</span><span>Tentatives</span><span>Statut / Actions</span>
                      </div>
                      {jeusDuGroupe.map(j => {
                        const typeInfo = TYPES_JEUX.find(t => t.id === j.type);
                        const bientot = ['image','audio','coloriage','mots_croises'].includes(j.type);
                        return (
                          <div key={j.id} style={{ display:'grid', gridTemplateColumns:'2.2fr 1.1fr 0.9fr 0.9fr 0.9fr 1fr 1.5fr', padding:'12px 16px', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:12, alignItems:'center', background:j.actif?COULEURS.blanc:'#F8FAFC', opacity:bientot?0.7:1 }}>
                            <div onClick={() => ouvrirDetailsJeu(j)} style={{ cursor:'pointer' }} title="Voir les statistiques et résultats par apprenant">
                              <div style={{ fontWeight:700, color:j.actif?COULEURS.navy:COULEURS.gris400, fontSize:13 }}>{j.nom} <span style={{ fontSize:10, color:COULEURS.gris400, fontWeight:400 }}>📊</span></div>
                              <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:2, display:'flex', gap:6 }}>
                                <span>{j.nbQuestions} questions</span>
                                {bientot && <span style={{ padding:'1px 6px', borderRadius:8, background:'#F1F5F9', color:'#64748B', fontWeight:700 }}>🔜 Bientôt</span>}
                              </div>
                            </div>
                            <span style={{ padding:'2px 8px', borderRadius:20, background:'#EDE9FE', color:'#6D28D9', fontSize:10, fontWeight:700, width:'fit-content' }}>
                              {typeInfo?.icone} {typeInfo?.lib || j.type}
                            </span>
                            <span style={{ fontSize:11, color:COULEURS.gris600 }}>{j.cible}</span>
                            <span style={{ fontWeight:700, color:'#F97316' }}>{j.partiesJouees}</span>
                            <span style={{ fontWeight:700, color:j.scoreMoyen>=70?COULEURS.succes:j.scoreMoyen>0?COULEURS.attention:COULEURS.gris400 }}>{j.scoreMoyen>0?`${j.scoreMoyen}%`:'-'}</span>
                            <input type="number" min={1} max={10} value={j.maxTentatives ?? 2}
                              onChange={e => modifierTentatives(j.id, e.target.value)}
                              title="Nombre de tentatives autorisées"
                              style={{ width: 48, padding: '4px 6px', borderRadius: 6, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 12, fontWeight: 700, color: COULEURS.navy, textAlign: 'center' }} />
                            <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                              <button onClick={()=>toggleJeuActif(j.id)} style={{ width:36, height:20, borderRadius:10, background:j.actif?COULEURS.succes:COULEURS.gris200, border:'none', cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
                                <div style={{ position:'absolute', top:2, width:16, height:16, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,0.2)', left:j.actif?18:2, transition:'left 0.2s' }} />
                              </button>
                              <span style={{ fontSize:10, color:j.actif?COULEURS.succes:COULEURS.gris400, fontWeight:600 }}>{j.actif?'Actif':'Inactif'}</span>
                              <button
                                title="Modifier le jeu"
                                onClick={()=>ouvrirEditionJeu(j)}
                                style={{ padding:'2px 7px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.gris600, fontSize:9, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', flexShrink:0 }}
                              >✏️</button>
                              <button
                                title="Réinitialiser les tentatives"
                                onClick={()=>reinitialiserJeu(j.id)}
                                style={{ padding:'2px 7px', borderRadius:6, border:'1px solid #BFDBFE', background:'#EFF6FF', color:'#1D4ED8', fontSize:9, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', flexShrink:0 }}
                              >🔄 Réinit.</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Modal créer jeu */}
              {modalJeu && (
                <>
                  <div onClick={()=>{ setModalJeu(false); setEditingJeuId(null); }} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000 }} />
                  <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'90vw', height:'90vh', overflowY:'auto', background:'#fff', borderRadius:20, zIndex:1001, padding:28, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                    <div style={{ fontSize:18, fontWeight:800, color:COULEURS.navy, marginBottom:4 }}>{editingJeuId ? '✏️ Modifier le jeu' : '🎮 Nouveau jeu'}</div>
                    <div style={{ fontSize:12, color:COULEURS.gris400, marginBottom:20 }}>Le nombre de tentatives est réglable ci-dessous (par défaut 2).</div>
                    <div style={{ marginBottom:14 }}>
                      <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', display:'block', marginBottom:5 }}>Nom du jeu *</label>
                      <input value={jeuForm.nom} onChange={e=>setJeuForm(p=>({...p,nom:e.target.value}))} style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', outline:'none', boxSizing:'border-box' }} placeholder="ex: Anagramme - Animaux A1" />
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                      <div>
                        <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', display:'block', marginBottom:5 }}>Type de jeu</label>
                        <select value={jeuForm.type} onChange={e=>setJeuForm(p=>({...p,type:e.target.value}))} style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', outline:'none' }}>
                          <optgroup label="── Tous niveaux ──">
                            {TYPES_JEUX.filter(t=>t.categorie==='tous').map(t=>(
                              <option key={t.id} value={t.id}>{t.icone} {t.lib}</option>
                            ))}
                          </optgroup>
                          <optgroup label="── Enfants ──">
                            {TYPES_JEUX.filter(t=>t.categorie==='enfant').map(t=>(
                              <option key={t.id} value={t.id}>{t.icone} {t.lib}</option>
                            ))}
                          </optgroup>
                          <optgroup label="── Ados / Adultes ──">
                            {TYPES_JEUX.filter(t=>t.categorie==='ado_adulte').map(t=>(
                              <option key={t.id} value={t.id}>{t.icone} {t.lib}</option>
                            ))}
                          </optgroup>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', display:'block', marginBottom:5 }}>Public cible</label>
                        <select value={jeuForm.cible} onChange={e=>setJeuForm(p=>({...p,cible:e.target.value}))} style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', outline:'none' }}>
                          <option value="tous">🌐 Tous</option>
                          <option value="enfant">🧒 Enfants</option>
                          <option value="adolescent">🧑 Adolescents</option>
                          <option value="adulte">👔 Adultes</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:20 }}>
                      <div>
                        <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', display:'block', marginBottom:5 }}>Nombre de questions / éléments</label>
                        <input type="number" min={3} max={30} value={jeuForm.nbQuestions} onChange={e=>setJeuForm(p=>({...p,nbQuestions:parseInt(e.target.value)||5}))} style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', outline:'none', boxSizing:'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', display:'block', marginBottom:5 }}>Tentatives autorisées</label>
                        <input type="number" min={1} max={10} value={jeuForm.maxTentatives} onChange={e=>setJeuForm(p=>({...p,maxTentatives:parseInt(e.target.value)||2}))} style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', outline:'none', boxSizing:'border-box' }} />
                      </div>
                    </div>
                    <div style={{ background:'#FFF7ED', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#92400E', marginBottom:20 }}>
                      📋 L'apprenant aura droit à <strong>{jeuForm.maxTentatives} tentative{jeuForm.maxTentatives>1?'s':''}</strong> pour ce jeu. Modifiable à tout moment depuis le tableau.
                    </div>
                    <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                      <button onClick={()=>{ setModalJeu(false); setEditingJeuId(null); }} style={{ padding:'10px 20px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>Annuler</button>
                      <button disabled={!jeuForm.nom} onClick={creerJeu} style={{ padding:'10px 20px', borderRadius:8, border:'none', background:jeuForm.nom?'#F97316':COULEURS.gris200, color:jeuForm.nom?'#fff':COULEURS.gris400, fontSize:13, fontWeight:700, cursor:jeuForm.nom?'pointer':'not-allowed', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>{editingJeuId ? '✅ Enregistrer' : '🎮 Créer le jeu'}</button>
                    </div>
                  </div>
                </>
              )}

              {/* Modal détails du jeu - stats + résultats par apprenant */}
              {detailsJeu && (
                <>
                  <div onClick={()=>{ setDetailsJeu(null); setApprenantDetailJeu(null); }} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000 }} />
                  <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'90vw', height:'90vh', overflowY:'auto', background:'#fff', borderRadius:20, zIndex:1001, padding:28, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
                      <div>
                        <div style={{ fontSize:18, fontWeight:800, color:COULEURS.navy }}>📊 {detailsJeu.nom}</div>
                        <div style={{ fontSize:12, color:COULEURS.gris400, marginTop:2 }}>Statistiques et résultats détaillés par apprenant</div>
                      </div>
                      <button onClick={()=>{ setDetailsJeu(null); setApprenantDetailJeu(null); }} style={{ background:COULEURS.gris100, border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:16 }}>✕</button>
                    </div>

                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginBottom:24 }}>
                      {[
                        { l:'Parties jouées', v: detailsJeu.partiesJouees, c:'#F97316', i:'🎮' },
                        { l:'Score moyen',    v: detailsJeu.scoreMoyen > 0 ? `${detailsJeu.scoreMoyen}%` : '-', c:'#7C3AED', i:'📊' },
                        { l:'Apprenants distincts', v: new Set(resultatsJeu.map(r=>r.apprenant_id)).size, c:'#0891B2', i:'👥' },
                        { l:'Tentatives autorisées', v: detailsJeu.maxTentatives ?? 2, c:'#059669', i:'🔄' },
                      ].map(k => (
                        <div key={k.l} style={{ background:COULEURS.gris50, borderRadius:12, padding:'14px 16px', border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}` }}>
                          <div style={{ fontSize:20, marginBottom:5 }}>{k.i}</div>
                          <div style={{ fontSize:20, fontWeight:800, color:k.c }}>{k.v}</div>
                          <div style={{ fontSize:11, color:COULEURS.gris600, marginTop:3 }}>{k.l}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:12 }}>Résultats par apprenant</div>
                    {resultatsJeuLoading ? (
                      <div style={{ textAlign:'center', padding:40, color:COULEURS.gris400 }}>Chargement…</div>
                    ) : resultatsJeu.length === 0 ? (
                      <div style={{ textAlign:'center', padding:40, background:COULEURS.gris50, borderRadius:12, border:`1px dashed ${COULEURS.gris200}`, color:COULEURS.gris400 }}>
                        Aucune partie jouée pour ce jeu pour le moment.
                      </div>
                    ) : (() => {
                      // Regroupement par apprenant - une ligne par apprenant, cliquable pour le détail complet.
                      const parApprenant = {};
                      resultatsJeu.forEach(r => {
                        if (!parApprenant[r.apprenant_id]) parApprenant[r.apprenant_id] = { apprenant_id: r.apprenant_id, apprenant_nom: r.apprenant_nom, tentatives: [] };
                        parApprenant[r.apprenant_id].tentatives.push(r);
                      });
                      const lignes = Object.values(parApprenant).map(a => {
                        const avecPct = a.tentatives.filter(t => t.pourcentage != null);
                        const meilleur = avecPct.length ? Math.max(...avecPct.map(t => t.pourcentage)) : null;
                        const moyenne = avecPct.length ? Math.round(avecPct.reduce((s,t)=>s+t.pourcentage,0)/avecPct.length) : null;
                        const dernier = [...a.tentatives].sort((x,y)=>new Date(y.created_at)-new Date(x.created_at))[0];
                        return { ...a, meilleur, moyenne, dernier };
                      }).sort((x,y) => (y.meilleur ?? -1) - (x.meilleur ?? -1));
                      return (
                        <div style={styles.tableauProfs}>
                          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1.3fr', padding:'10px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase' }}>
                            <span>Apprenant</span><span>Tentatives</span><span>Meilleur score</span><span>Moyenne</span><span>Dernière partie</span>
                          </div>
                          {lignes.map(a => (
                            <div key={a.apprenant_id} onClick={() => setApprenantDetailJeu(a)} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1.3fr', padding:'11px 16px', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:12, alignItems:'center', cursor:'pointer' }}
                              onMouseEnter={e=>e.currentTarget.style.background=COULEURS.gris50} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                              <span style={{ fontWeight:600, color:COULEURS.navy }}>{a.apprenant_nom || '-'} <span style={{ fontSize:10, color:COULEURS.gris400, fontWeight:400 }}>📊</span></span>
                              <span style={{ padding:'2px 8px', borderRadius:10, background: a.tentatives.length>1?'#FEF3C7':'#F1F5F9', color: a.tentatives.length>1?'#92400E':COULEURS.gris600, fontSize:11, fontWeight:700, width:'fit-content' }}>{a.tentatives.length}</span>
                              <span style={{ fontWeight:700, color: a.meilleur>=70?COULEURS.succes:a.meilleur>=40?COULEURS.attention:'#DC2626' }}>{a.meilleur!=null?`${a.meilleur}%`:'-'}</span>
                              <span style={{ color:COULEURS.gris600 }}>{a.moyenne!=null?`${a.moyenne}%`:'-'}</span>
                              <span style={{ fontSize:11, color:COULEURS.gris400 }}>{new Date(a.dernier.created_at).toLocaleString('fr-FR')}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}

              {/* Modal détail d'un apprenant pour ce jeu - KPIs + historique complet des tentatives */}
              {apprenantDetailJeu && (() => {
                const tentatives = [...apprenantDetailJeu.tentatives].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
                const avecPct = tentatives.filter(t => t.pourcentage != null);
                const meilleur = avecPct.length ? Math.max(...avecPct.map(t=>t.pourcentage)) : null;
                const moyenne  = avecPct.length ? Math.round(avecPct.reduce((s,t)=>s+t.pourcentage,0)/avecPct.length) : null;
                const premier  = avecPct[0]?.pourcentage;
                const dernierPct = avecPct[avecPct.length-1]?.pourcentage;
                const tendance = (premier!=null && dernierPct!=null && tentatives.length>1) ? (dernierPct>premier?'hausse':dernierPct<premier?'baisse':'stable') : null;
                return (
                  <>
                    <div onClick={()=>setApprenantDetailJeu(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1100 }} />
                    <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'70vw', height:'70vh', overflowY:'auto', background:'#fff', borderRadius:20, zIndex:1101, padding:28, boxShadow:'0 24px 64px rgba(0,0,0,0.25)', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                        <div style={{ fontSize:17, fontWeight:800, color:COULEURS.navy }}>👤 {apprenantDetailJeu.apprenant_nom || '-'}</div>
                        <button onClick={()=>setApprenantDetailJeu(null)} style={{ background:COULEURS.gris100, border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:16, flexShrink:0 }}>✕</button>
                      </div>

                      {/* Bandeau jeu concerné */}
                      <div style={{ display:'flex', alignItems:'center', gap:14, background:'#F5F3FF', border:'1px solid #DDD6FE', borderRadius:12, padding:'12px 16px', marginBottom:20, flexWrap:'wrap' }}>
                        <span style={{ fontSize:22 }}>🎮</span>
                        <div style={{ flex:1, minWidth:160 }}>
                          <div style={{ fontSize:14, fontWeight:800, color:'#5B21B6' }}>{detailsJeu?.nom}</div>
                          <div style={{ fontSize:11, color:'#6D28D9', marginTop:1 }}>{TYPES_JEUX.find(t=>t.id===detailsJeu?.type)?.lib || detailsJeu?.type}</div>
                        </div>
                        <div style={{ display:'flex', gap:18, fontSize:12, color:'#5B21B6' }}>
                          <div><div style={{ fontWeight:800, fontSize:15 }}>{detailsJeu?.maxTentatives ?? 2}</div><div style={{ fontSize:10 }}>tentatives autorisées</div></div>
                          <div><div style={{ fontWeight:800, fontSize:15 }}>{detailsJeu?.scoreMoyen > 0 ? `${detailsJeu.scoreMoyen}%` : '-'}</div><div style={{ fontSize:10 }}>score moyen global</div></div>
                        </div>
                      </div>

                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:12, marginBottom:24 }}>
                        {[
                          { l:'Tentatives',     v: tentatives.length, c:'#0891B2', i:'🎮' },
                          { l:'Meilleur score', v: meilleur!=null?`${meilleur}%`:'-', c:COULEURS.succes, i:'🏆' },
                          { l:'Score moyen',    v: moyenne!=null?`${moyenne}%`:'-', c:'#7C3AED', i:'📊' },
                          { l:'Tendance', v: tendance==='hausse'?'↗ En progrès':tendance==='baisse'?'↘ En baisse':tendance==='stable'?'→ Stable':'-', c: tendance==='hausse'?COULEURS.succes:tendance==='baisse'?'#DC2626':COULEURS.gris600, i:'📈' },
                        ].map(k => (
                          <div key={k.l} style={{ background:COULEURS.gris50, borderRadius:12, padding:'12px 14px', border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}` }}>
                            <div style={{ fontSize:18, marginBottom:4 }}>{k.i}</div>
                            <div style={{ fontSize:16, fontWeight:800, color:k.c }}>{k.v}</div>
                            <div style={{ fontSize:10, color:COULEURS.gris600, marginTop:2 }}>{k.l}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:10 }}>Historique des tentatives</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {tentatives.map(t => (
                          <div key={t.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:COULEURS.gris50, borderRadius:10, border:`1px solid ${COULEURS.gris200}` }}>
                            <span style={{ padding:'3px 9px', borderRadius:10, background:'#EDE9FE', color:'#6D28D9', fontSize:11, fontWeight:700, flexShrink:0 }}>#{t.tentative_numero}</span>
                            <span style={{ fontSize:12, color:COULEURS.navy, fontWeight:600 }}>{t.score}{t.score_max ? ` / ${t.score_max}` : ''}</span>
                            <span style={{ fontSize:12, fontWeight:700, color: t.pourcentage>=70?COULEURS.succes:t.pourcentage>=40?COULEURS.attention:'#DC2626' }}>{t.pourcentage!=null?`${t.pourcentage}%`:'-'}</span>
                            <span style={{ fontSize:11, color:COULEURS.gris400, marginLeft:'auto' }}>{new Date(t.created_at).toLocaleString('fr-FR')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

          ) : estRole(profile?.role, 'admin_comptable') && location.pathname === '/admin/comptable/facturation' ? (
            <OngletComptaFacturation />

          ) : estRole(profile?.role, 'admin_comptable') && location.pathname === '/admin/comptable/paiements' ? (
            <OngletComptaPaiements />

          ) : estRole(profile?.role, 'admin_comptable') && location.pathname === '/admin/comptable/fournisseurs' ? (
            <OngletComptaFournisseurs />

          ) : estRole(profile?.role, 'admin_comptable') && location.pathname === '/admin/comptable/tresorerie' ? (
            <OngletComptaTresorerie />

          ) : estRole(profile?.role, 'admin_comptable') && location.pathname === '/admin/comptable/taches' ? (
            <OngletComptaMesTaches />
          ) : estRole(profile?.role, 'admin_comptable') && location.pathname === '/admin/comptable/honoraires' ? (
            <OngletComptaHonorairesCoaches />
          ) : estRole(profile?.role, 'admin_comptable') && location.pathname === '/admin/comptable/exports' ? (
            <OngletComptaExports />
          ) : estRole(profile?.role, 'admin_rh_paie') && location.pathname === '/admin/rh/taches' ? (
            <OngletRHPaieMesTaches />
          ) : estRole(profile?.role, 'admin_rh_paie') && location.pathname === '/admin/rh/grille' ? (
            <OngletRHGrilleTarifaire />
          ) : estRole(profile?.role, 'admin_comptable') && location.pathname === '/admin/comptable/rrd-bc-bacn' ? (
            <OngletComptaRrdBcBacn />

          ) : estRole(profile?.role, 'admin_comptable') && location.pathname === '/admin/comptable/generale' ? (
            <OngletComptaGenerale />

          ) : estRole(profile?.role, 'admin_comptable') && location.pathname === '/admin/comptable/tva' ? (
            <OngletComptaTva />

          ) : estRole(profile?.role, 'admin_comptable') && location.pathname === '/admin/comptable/immobilisations' ? (
            <OngletComptaImmobilisations />

          ) : estRole(profile?.role, 'admin_comptable') && location.pathname === '/admin/comptable/budgets' ? (
            <OngletComptaBudgets />

          ) : estRole(profile?.role, 'admin_comptable') && location.pathname === '/admin/comptable/analytique' ? (
            <OngletComptaAnalytique />

          ) : estRole(profile?.role, 'admin_elearning') && location.pathname === '/admin/elearning/inscrire' ? (
            <OngletInscriptionOnboarding />
          ) : estRole(profile?.role, 'admin_elearning') && location.pathname === '/admin/elearning/parcours' ? (
            <OngletParcoursInscriptions />
          ) : estRole(profile?.role, 'admin_elearning') && location.pathname === '/admin/elearning/programme' ? (
            <OngletELearning ongletActif="programme" />
          ) : estRole(profile?.role, 'admin_elearning') && location.pathname === '/admin/elearning/reporting' ? (
            <OngletELearning ongletActif="reporting" />
          ) : estRole(profile?.role, 'admin_elearning') && location.pathname === '/admin/elearning/entreprises' ? (
            <OngletEntreprises />
          ) : estRole(profile?.role, 'admin_elearning') ? (
            /* L'ÉCRAN PAR DÉFAUT EST DÉSORMAIS « Inscrire » et non plus « Vue d'ensemble »,
               retirée du menu : l'assistante e-learning ouvre son dashboard sur ce qu'elle
               fait en premier, la saisie d'un dossier. Cette branche reste le repli pour
               toute URL inconnue sous /admin/. */
            <OngletInscriptionOnboarding />

          ) : estRole(profile?.role, 'admin_rh_paie') && location.pathname === '/admin/rh/contrats' ? (
            <OngletRHContrats />

          ) : estRole(profile?.role, 'admin_rh_paie') && location.pathname === '/admin/rh/paie' ? (
            <OngletRHPaieBulletins />

          ) : location.pathname === '/admin/administration' ? (
            <OngletAdministrationBET />
          ) : estRole(profile?.role, 'admin_customer_care') && location.pathname === '/admin/support/tickets' ? (
            <OngletCustomerCare ongletActif="tickets" />
          ) : estRole(profile?.role, 'admin_customer_care') && location.pathname === '/admin/support/profils' ? (
            <OngletCustomerCare ongletActif="profils" />
          ) : estRole(profile?.role, 'admin_customer_care') && location.pathname === '/admin/support/blocages' ? (
            <OngletCustomerCare ongletActif="blocages" />
          ) : estRole(profile?.role, 'admin_customer_care') ? (
            <OngletCustomerCare ongletActif="overview" />
          ) : estRole(profile?.role, 'admin_rh_paie') && location.pathname === '/admin/rh/conges' ? (
            <OngletRHConges />

          ) : estRole(profile?.role, 'admin_pa_advisor') && location.pathname === '/admin/pa-advisor/taches' ? (
            <OngletMesTachesPAAdvisor />
          ) : estRole(profile?.role, 'admin_pa_advisor') && location.pathname === '/admin/pa-advisor/eval-apprenants' ? (
            <OngletEvaluationsApprenantsPA />
          ) : estRole(profile?.role, 'admin_pa_advisor') && location.pathname === '/admin/pa-advisor/reaffectations' ? (
            <OngletReaffectations couleur="#8B5CF6" />
          ) : estRole(profile?.role, 'admin_pa_advisor') && location.pathname === '/admin/pa-advisor/overview' ? (
            <OngletVueEnsemblePAAdvisor />
          ) : estRole(profile?.role, 'admin_pa_advisor') && location.pathname === '/admin/pa-advisor/classes' ? (
            <OngletClassesPAAdvisor />
          ) : estRole(profile?.role, 'admin_pa_advisor') && location.pathname === '/admin/pa-advisor/programme' ? (
            <OngletELearning ongletActif="programme" />
          ) : estRole(profile?.role, 'admin_pa_advisor') && location.pathname === '/admin/pa-advisor/evaluations' ? (
            <OngletEvaluationsPAAdvisor />
          ) : estRole(profile?.role, 'admin_pa_advisor') && location.pathname === '/admin/pa-advisor/reporting' ? (
            <OngletELearning ongletActif="reporting" />
          ) : estRole(profile?.role, 'admin_pa_advisor') && location.pathname === '/admin/pa-advisor/apprenants' ? (
            <OngletSuiviApprenantsPAAdvisor />
          ) : estRole(profile?.role, 'admin_pa_advisor') && location.pathname === '/admin/pa-advisor/remplacements' ? (
            <OngletRemplacements />
          ) : estRole(profile?.role, 'admin_pa_advisor') && location.pathname === '/admin/pa-advisor/coachs' ? (
            <OngletCoachsPAAdvisor />
          ) : estRole(profile?.role, 'admin_pa_advisor') && location.pathname === '/admin/pa-advisor/honoraires' ? (
            <OngletHonorairesPAAdvisor />
          ) : estRole(profile?.role, 'admin_pa_advisor') && location.pathname === '/admin/pa-advisor/rapports-superviseur' ? (
            <OngletRapportsSuperviseurPA />
          ) : estRole(profile?.role, 'admin_pa_advisor') ? (
            <>
              <div style={styles.descriptionZone}>{config.description}</div>
              <DashboardPAAdvisor />
              {/* Accès rapides */}
              <div style={{ ...styles.titreSec, marginTop:32 }}>Accès rapides</div>
              <div style={styles.grilleModules}>
                {config.modules.map((mod) => (
                  <div key={mod.id} style={styles.carteModule(mod.couleur)} onClick={() => navigate(mod.chemin)}
                    onMouseEnter={e => { e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.12)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'; }}>
                    <div style={styles.moduleIcone(mod.couleur)}>
                      <span style={{ fontSize: 28 }}>{mod.icone}</span>
                    </div>
                    <div style={styles.moduleTitre}>{mod.titre}</div>
                  </div>
                ))}
              </div>
            </>

          ) : estRole(profile?.role, 'admin_manager') ? (
            <OngletVueEnsembleManager />

          ) : estRole(profile?.role, 'admin_comptable') ? (
            <OngletComptaApercu />

          ) : (
          <>
          <div style={styles.descriptionZone}>{config.description}</div>


          {/* KPIs globaux */}
          <div style={styles.kpisGlobaux}>
            <div style={styles.carteKpi(couleurTheme)}>
              <div style={styles.kpiVal}>{totalApprenants}</div>
              <div style={styles.kpiLbl}>Apprenants</div>
            </div>
            <div style={styles.carteKpi(COULEURS.succes)}>
              <div style={styles.kpiVal}>{totalProfesseurs}</div>
              <div style={styles.kpiLbl}>Professeurs</div>
            </div>
            <div style={styles.carteKpi(COULEURS.violetEnfant)}>
              <div style={styles.kpiVal}>{totalGroupes}</div>
              <div style={styles.kpiLbl}>Groupes actifs</div>
            </div>
            <div style={styles.carteKpi(COULEURS.orangeEnfant)}>
              <div style={styles.kpiVal}>{sessionsEnCours + sessionsAVenir}</div>
              <div style={styles.kpiLbl}>Sessions</div>
            </div>
            {apprenantsPending > 0 && (
              <div style={styles.carteKpi(COULEURS.attention)}>
                <div style={styles.kpiVal}>{apprenantsPending}</div>
                <div style={styles.kpiLbl}>En attente</div>
              </div>
            )}
          </div>


          {/* Modules du rôle */}
          <div style={styles.titreSec}>Mes modules</div>
          <div style={styles.grilleModules}>
            {config.modules.map((m) => (
              <div
                key={m.id}
                style={styles.carteModule(m.couleur)}
                onClick={() => navigate(m.chemin)}
              >
                <div style={styles.moduleIcone(m.couleur)}>{m.icone}</div>
                <div style={styles.moduleTitre}>{m.titre}</div>
              </div>
            ))}
          </div>

          {/* Calendrier des évaluations (manager + superviseur) */}
          {(estRole(profile?.role, 'admin_manager') || estRole(profile?.role, 'admin_superviseur')) && (
            <div style={{ marginBottom: 32 }}>
              <div style={styles.titreSec}>📆 Calendrier des évaluations</div>
              <div style={{ background: COULEURS.blanc, borderRadius: 14, overflow: 'hidden', border: `1px solid ${COULEURS.gris200}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr', padding: '10px 20px', background: COULEURS.navy, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <span>Type d'évaluation</span><span>Fréquence / Moment</span><span>Qui évalue</span>
                </div>
                {[
                  { type: 'Quiz / contrôle continu',          freq: 'Chaque session ou bimensuel',     eval: 'Professeur (dans la plateforme)', accent: couleurTheme,      acteur: 'prof'  },
                  { type: 'Devoir noté',                      freq: 'Hebdomadaire',                    eval: 'Professeur',                      accent: '#6366F1',          acteur: 'prof'  },
                  { type: 'Évaluation mensuelle',             freq: '1ère session de chaque mois',     eval: 'Professeur',                      accent: '#8B5CF6',          acteur: 'prof'  },
                  { type: 'Évaluation trimestrielle',         freq: 'Fin de chaque trimestre (3×/an)', eval: 'Professeur + PA',                 accent: COULEURS.succes,    acteur: 'admin' },
                  { type: 'Satisfaction parent',              freq: '1 fois/mois',                     eval: 'Parent (formulaire in-app)',       accent: COULEURS.attention, acteur: 'parent'},
                  { type: 'Évaluation prof par superviseur',  freq: 'Max 3 fois/mois',                 eval: 'Superviseur BET',                 accent: couleurThemeFonce, acteur: 'sup'   },
                ].map((row, i) => (
                  <div key={row.type} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr', padding: '13px 20px', borderBottom: i < 5 ? `1px solid ${COULEURS.gris100}` : 'none', alignItems: 'center', background: row.acteur === 'sup' ? '#EFF6FF' : COULEURS.blanc }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 4, height: 32, borderRadius: 4, background: row.accent, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: COULEURS.navy }}>{row.type}</span>
                    </div>
                    <span style={{ fontSize: 13, color: COULEURS.gris600 }}>{row.freq}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: row.accent, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: row.accent }}>{row.eval}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 8, fontStyle: 'italic' }}>
                ● Les lignes en bleu sont sous la responsabilité du Superviseur BET.
              </div>
            </div>
          )}

          {/* Tableau professeurs (visible pour manager et superviseur) */}

          {/* ══ RH / PAIE - Résumé vue d'ensemble ══ */}
          {estRole(profile?.role, 'admin_rh_paie') && <OngletRHPaieApercu />}

          {/* ══ Équipe pédagogique (manager + superviseur) ══ */}
          {(estRole(profile?.role, 'admin_manager') || estRole(profile?.role, 'admin_superviseur')) && (
            <EquipePedagogique />
          )}
          </>
          )}
        </div>
    </TopNavLayout>

    {/* ══ MODAL UPLOAD CONTENU ══ */}
    {modalUpload && (
      <>
        <div onClick={() => setModalUpload(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, backdropFilter:'blur(2px)' }} />
        <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'90%', maxWidth:520, background:COULEURS.blanc, borderRadius:20, boxShadow:'0 24px 64px rgba(0,0,0,0.25)', zIndex:1001, fontFamily:'"Plus Jakarta Sans", sans-serif', overflow:'hidden' }}>

          {/* En-tête */}
          <div style={{ background:'linear-gradient(135deg,#5B21B6,#7C3AED)', padding:'20px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>{editingRessourceId ? '✏️ Modifier le contenu' : '+ Ajouter un contenu'}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginTop:2 }}>Bibliothèque d'onboarding</div>
            </div>
            <button onClick={() => setModalUpload(false)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:34, height:34, color:'#fff', fontSize:16, cursor:'pointer' }}>✕</button>
          </div>

          {/* Formulaire */}
          <div style={{ padding:'24px', display:'flex', flexDirection:'column', gap:16 }}>

            {/* Titre */}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>Titre *</label>
              <input
                style={{ padding:'9px 13px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:14, fontFamily:'"Plus Jakarta Sans", sans-serif', width:'100%', boxSizing:'border-box', outline:'none' }}
                placeholder="ex : Vidéo de bienvenue BET 2026"
                value={uploadForm.titre}
                onChange={e => setUploadForm(p => ({ ...p, titre: e.target.value }))}
              />
            </div>

            {/* Catégorie + Type */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>Catégorie *</label>
                <select
                  style={{ padding:'9px 13px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', background:COULEURS.blanc, width:'100%', outline:'none' }}
                  value={uploadForm.categorie}
                  onChange={e => setUploadForm(p => ({ ...p, categorie: e.target.value }))}
                >
                  {CATS_CONTENUS.map(c => <option key={c.id} value={c.id}>{c.icone} {c.lib}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>Type de contenu</label>
                <div style={{ display:'flex', gap:8 }}>
                  {[['pdf','📄','PDF / Doc'],['video','🎬','Vidéo']].map(([val,ic,lb]) => (
                    <button key={val} onClick={() => setUploadForm(p => ({ ...p, type:val }))} style={{
                      flex:1, padding:'9px 6px', borderRadius:8, cursor:'pointer', textAlign:'center',
                      border:`2px solid ${uploadForm.type===val?'#7C3AED':COULEURS.gris200}`,
                      background: uploadForm.type===val?'#F5F3FF':COULEURS.blanc,
                      fontFamily:'"Plus Jakarta Sans", sans-serif',
                    }}>
                      <div style={{ fontSize:20 }}>{ic}</div>
                      <div style={{ fontSize:11, fontWeight:uploadForm.type===val?700:400, color:uploadForm.type===val?'#5B21B6':COULEURS.gris600 }}>{lb}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Lien vidéo (YouTube/Vimeo/URL directe) - alternative à l'upload de fichier */}
            {uploadForm.type === 'video' && (
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>Lien vidéo (YouTube, Vimeo, URL directe…)</label>
                <input value={uploadForm.lienVideo} onChange={e => setUploadForm(p => ({ ...p, lienVideo: e.target.value, fichier: e.target.value ? null : p.fichier }))}
                  placeholder="https://www.youtube.com/watch?v=..."
                  style={{ padding:'9px 13px', borderRadius:8, border:`1.5px solid ${uploadForm.lienVideo?'#7C3AED':COULEURS.gris200}`, fontSize:14, fontFamily:'"Plus Jakarta Sans", sans-serif', width:'100%', boxSizing:'border-box', outline:'none' }} />
              </div>
            )}

            {/* Zone upload fichier */}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>
                {uploadForm.type === 'video' ? (uploadForm.lienVideo ? 'Fichier vidéo (désactivé - lien renseigné)' : 'Ou fichier vidéo (MP4)') : 'Fichier (PDF, DOCX, PPTX)'}
              </label>
              <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, padding:'20px', borderRadius:10, border:`2px dashed ${uploadForm.fichier?'#7C3AED':COULEURS.gris200}`, background:uploadForm.fichier?'#F5F3FF':COULEURS.gris50, cursor:'pointer', opacity: uploadForm.lienVideo?0.5:1 }}>
                <span style={{ fontSize:28 }}>{uploadForm.fichier ? '✅' : '⬆️'}</span>
                <span style={{ fontSize:13, fontWeight:600, color:uploadForm.fichier?'#5B21B6':COULEURS.gris600 }}>
                  {uploadForm.fichier ? uploadForm.fichier.name : 'Cliquez ou glissez un fichier'}
                </span>
                <span style={{ fontSize:11, color:COULEURS.gris400 }}>
                  {uploadForm.type==='video' ? `MP4, MOV, AVI - max ${LIMITES_CONTENU_MO.video} Mo` : uploadForm.type==='audio' ? `MP3, WAV - max ${LIMITES_CONTENU_MO.audio} Mo` : `PDF, DOCX, PPTX - max ${LIMITES_CONTENU_MO.autre} Mo`}
                </span>
                <input type="file" disabled={!!uploadForm.lienVideo} style={{ display:'none' }}
                  accept={uploadForm.type==='video' ? 'video/*' : uploadForm.type==='audio' ? 'audio/*' : '.pdf,.docx,.pptx'}
                  onChange={async e => {
                    const f = e.target.files[0] || null;
                    const depasse = fichierDepasseLimite(f);
                    if (depasse) { await alerte(`Fichier trop lourd : ${depasse.tailleMo} Mo (max ${depasse.limite} Mo pour ce type).`, { danger: true }); e.target.value = ''; return; }
                    setUploadForm(p => ({ ...p, fichier: f }));
                  }}
                />
              </label>
            </div>

            {/* Visibilité */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:COULEURS.gris50, borderRadius:10, padding:'12px 16px', border:`1px solid ${COULEURS.gris200}` }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>Publier immédiatement</div>
                <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:2 }}>Visible par les apprenants dès l'ajout</div>
              </div>
              <button onClick={() => setUploadForm(p => ({ ...p, visible: !p.visible }))} style={{ width:44, height:24, borderRadius:12, background:uploadForm.visible?'#7C3AED':COULEURS.gris200, border:'none', cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
                <span style={{ position:'absolute', top:3, width:18, height:18, borderRadius:'50%', background:'#fff', left:uploadForm.visible?23:3, transition:'left 0.2s' }} />
              </button>
            </div>

          </div>

          {/* Pied */}
          <div style={{ padding:'14px 24px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'flex-end', gap:10 }}>
            <button onClick={() => setModalUpload(false)} style={{ padding:'9px 18px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
              Annuler
            </button>
            <button
              disabled={!uploadForm.titre.trim()}
              onClick={ajouterRessource}
              style={{ padding:'9px 20px', borderRadius:8, border:'none', background:uploadForm.titre.trim()?'#7C3AED':COULEURS.gris200, color:'#fff', fontSize:13, fontWeight:700, cursor:uploadForm.titre.trim()?'pointer':'not-allowed', fontFamily:'"Plus Jakarta Sans", sans-serif' }}
            >
              {editingRessourceId ? '✅ Enregistrer les modifications' : '✅ Ajouter le contenu'}
            </button>
          </div>
        </div>
      </>
    )}

    {/* ══ MODAL BIBLIOTHÈQUE COMMUNAUTAIRE ══ */}
    {modalBiblioCom && (
      <>
        <div onClick={() => setModalBiblioCom(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, backdropFilter:'blur(2px)' }} />
        <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'90%', maxWidth:520, background:COULEURS.blanc, borderRadius:20, boxShadow:'0 24px 64px rgba(0,0,0,0.25)', zIndex:1001, fontFamily:'"Plus Jakarta Sans", sans-serif', overflow:'hidden' }}>
          <div style={{ background:'linear-gradient(135deg,#5B21B6,#7C3AED)', padding:'20px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>{editingBiblioComId ? '✏️ Modifier la ressource' : '+ Ajouter à la bibliothèque communautaire'}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginTop:2 }}>Accessible à tous les apprenants</div>
            </div>
            <button onClick={() => setModalBiblioCom(false)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:34, height:34, color:'#fff', fontSize:16, cursor:'pointer' }}>✕</button>
          </div>

          <div style={{ padding:'24px', display:'flex', flexDirection:'column', gap:16 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>Titre *</label>
              <input
                style={{ padding:'9px 13px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:14, fontFamily:'"Plus Jakarta Sans", sans-serif', width:'100%', boxSizing:'border-box', outline:'none' }}
                placeholder="ex : Comptines en anglais - Nursery Rhymes"
                value={biblioComForm.titre}
                onChange={e => setBiblioComForm(p => ({ ...p, titre: e.target.value }))}
              />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>Type</label>
                <select value={biblioComForm.type} onChange={e => setBiblioComForm(p => ({ ...p, type: e.target.value, icone: e.target.value==='video'?'🎬':e.target.value==='jeu'?'🎮':'🎧' }))}
                  style={{ padding:'9px 13px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', background:COULEURS.blanc, width:'100%', outline:'none' }}>
                  <option value="audio">🎧 Audio / Podcast</option>
                  <option value="video">🎬 Vidéo</option>
                  <option value="jeu">🎮 Jeu (lien externe)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>Cible</label>
                <select value={biblioComForm.cible} onChange={e => setBiblioComForm(p => ({ ...p, cible: e.target.value }))}
                  style={{ padding:'9px 13px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', background:COULEURS.blanc, width:'100%', outline:'none' }}>
                  <option value="tous">🌐 Tous</option>
                  <option value="enfant">🧒 Enfants</option>
                  <option value="adolescent">🧑 Adolescents</option>
                  <option value="adulte">👔 Adultes</option>
                </select>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>Durée (optionnel)</label>
                <input placeholder="ex : 12 min" value={biblioComForm.duree} onChange={e => setBiblioComForm(p => ({ ...p, duree: e.target.value }))}
                  style={{ padding:'9px 13px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', width:'100%', boxSizing:'border-box', outline:'none' }} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>Niveau (optionnel)</label>
                <input placeholder="ex : A1" value={biblioComForm.niveau} onChange={e => setBiblioComForm(p => ({ ...p, niveau: e.target.value }))}
                  style={{ padding:'9px 13px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', width:'100%', boxSizing:'border-box', outline:'none' }} />
              </div>
            </div>

            {biblioComForm.type === 'video' && (
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>Lien vidéo (YouTube, Vimeo, URL directe…)</label>
                <input value={biblioComForm.lienVideo} onChange={e => setBiblioComForm(p => ({ ...p, lienVideo: e.target.value, fichier: e.target.value ? null : p.fichier }))}
                  placeholder="https://www.youtube.com/watch?v=..."
                  style={{ padding:'9px 13px', borderRadius:8, border:`1.5px solid ${biblioComForm.lienVideo?'#7C3AED':COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', width:'100%', boxSizing:'border-box', outline:'none' }} />
              </div>
            )}

            {biblioComForm.type !== 'jeu' && (
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>
                  {biblioComForm.type==='video' ? (biblioComForm.lienVideo ? 'Fichier vidéo (désactivé - lien renseigné)' : 'Ou fichier vidéo (MP4)') : 'Fichier audio (MP3)'}
                </label>
                <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, padding:'18px', borderRadius:10, border:`2px dashed ${biblioComForm.fichier?'#7C3AED':COULEURS.gris200}`, background:biblioComForm.fichier?'#F5F3FF':COULEURS.gris50, cursor:'pointer', opacity: biblioComForm.lienVideo?0.5:1 }}>
                  <span style={{ fontSize:24 }}>{biblioComForm.fichier ? '✅' : '⬆️'}</span>
                  <span style={{ fontSize:12, fontWeight:600, color:biblioComForm.fichier?'#5B21B6':COULEURS.gris600 }}>
                    {biblioComForm.fichier ? biblioComForm.fichier.name : 'Cliquez ou glissez un fichier'}
                  </span>
                  <input type="file" disabled={!!biblioComForm.lienVideo} style={{ display:'none' }}
                    accept={biblioComForm.type==='video' ? 'video/*' : 'audio/*'}
                    onChange={async e => {
                      const f = e.target.files[0] || null;
                      const depasse = fichierDepasseLimite(f);
                      if (depasse) { await alerte(`Fichier trop lourd : ${depasse.tailleMo} Mo (max ${depasse.limite} Mo pour ce type).`, { danger: true }); e.target.value = ''; return; }
                      setBiblioComForm(p => ({ ...p, fichier: f }));
                    }} />
                </label>
              </div>
            )}

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:COULEURS.gris50, borderRadius:10, padding:'12px 16px', border:`1px solid ${COULEURS.gris200}` }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>Publier immédiatement</div>
                <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:2 }}>Visible par les apprenants dès l'ajout</div>
              </div>
              <button onClick={() => setBiblioComForm(p => ({ ...p, visible: !p.visible }))} style={{ width:44, height:24, borderRadius:12, background:biblioComForm.visible?'#7C3AED':COULEURS.gris200, border:'none', cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
                <span style={{ position:'absolute', top:3, width:18, height:18, borderRadius:'50%', background:'#fff', left:biblioComForm.visible?23:3, transition:'left 0.2s' }} />
              </button>
            </div>
          </div>

          <div style={{ padding:'14px 24px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'flex-end', gap:10 }}>
            <button onClick={() => setModalBiblioCom(false)} style={{ padding:'9px 18px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
              Annuler
            </button>
            <button
              disabled={!biblioComForm.titre.trim()}
              onClick={enregistrerBiblioCom}
              style={{ padding:'9px 20px', borderRadius:8, border:'none', background:biblioComForm.titre.trim()?'#7C3AED':COULEURS.gris200, color:'#fff', fontSize:13, fontWeight:700, cursor:biblioComForm.titre.trim()?'pointer':'not-allowed', fontFamily:'"Plus Jakarta Sans", sans-serif' }}
            >
              {editingBiblioComId ? '✅ Enregistrer les modifications' : '✅ Ajouter'}
            </button>
          </div>
        </div>
      </>
    )}

    {/* ── Modal confirmation suppression contenu ── */}
    {modalSupprimerContenu && (
      <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1300, backdropFilter:'blur(2px)' }}
        onClick={() => !suppressionContenuEnCours && setModalSupprimerContenu(null)}>
        <div style={{ background:COULEURS.blanc, borderRadius:16, width:440, maxWidth:'92vw', padding:28, boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
            <div style={{ width:44, height:44, borderRadius:'50%', background:'#FEE2E2', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>🗑</div>
            <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>Supprimer ce contenu ?</div>
          </div>
          <div style={{ fontSize:13, color:COULEURS.gris600, lineHeight:1.6, marginBottom:22 }}>
            <strong>{modalSupprimerContenu.titre}</strong> sera définitivement supprimé de la bibliothèque et ne sera plus accessible aux apprenants.
            <div style={{ marginTop:10, background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#92400E' }}>
              ⚠️ Cette action est irréversible.
            </div>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => setModalSupprimerContenu(null)} disabled={suppressionContenuEnCours} style={{ flex:1, padding:'10px 0', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, cursor: suppressionContenuEnCours ? 'not-allowed' : 'pointer', fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
              Annuler
            </button>
            <button onClick={confirmerSuppressionContenu} disabled={suppressionContenuEnCours} style={{ flex:2, padding:'10px 0', borderRadius:8, border:'none', background: suppressionContenuEnCours ? COULEURS.gris200 : '#DC2626', color: suppressionContenuEnCours ? COULEURS.gris400 : '#fff', fontWeight:700, cursor: suppressionContenuEnCours ? 'not-allowed' : 'pointer', fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
              {suppressionContenuEnCours ? 'Suppression…' : '🗑 Supprimer définitivement'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
