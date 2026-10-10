import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useMessagerie } from '../../contexts/MessagerieContext';
import { useNotifications } from '../../contexts/NotificationsContext';
import { COULEURS } from '../../constants/couleurs';
import { LIBELLES_ROLES, ROLE_LOGIN } from '../../constants/roles';
import { MOCK_ENTREPRISES } from '../../mock/entreprises';
import BoutonLangue from './BoutonLangue';
import { useTheme, PALETTE_THEME } from '../../contexts/ThemeContext';
import { useConfirm, useAlerte } from '../../contexts/ConfirmContext';
import { supabase } from '../../config/supabase';
import { fetchFooterConfig, FOOTER_DEFAUT } from '../../constants/footerConfig';

import { fetchUpload } from "../../utils/fetchUpload";
import MonProfilModal, { BoutonMonProfil, nomAffiche } from "./MonProfilModal";
import VisionneuseImage from "./VisionneuseImage";
// Mélange une couleur hex avec du noir/blanc - garantit un contraste lisible quel que soit le
// thème choisi par l'utilisateur : couleurThemeFonce (ThemeContext) n'assombrit que de 22%,
// insuffisant pour les thèmes très clairs (jaune pâle, cyan clair…) qui rendaient le texte
// blanc illisible sur le dégradé du header/footer.
function melangerCouleur(hex, cible, ratio) {
  const h = (hex || '#0891B2').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  const mix = (v) => Math.round(v * (1 - ratio) + cible * ratio);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
const assombrirCouleur = (hex, ratio) => melangerCouleur(hex, 0, ratio);
const eclaircirCouleur = (hex, ratio) => melangerCouleur(hex, 255, ratio);

const MENUS_PAR_ROLE = {
  // ── Apprenant : menu adulte = fallback utilisé par PageMessages / PageNotifications ──
  apprenant: [
    { libelle: 'Tableau de bord',  icone: '🏠', chemin: '/apprenant/dashboard' },
    { libelle: 'Onboarding',       icone: '👋', chemin: '/apprenant/onboarding' },
    { libelle: 'Mes cours',        icone: '📖', chemin: '/apprenant/cours' },
    { libelle: 'Exercices & Devoirs', icone: '✏️', chemin: '/apprenant/devoirs' },
    { libelle: 'Fichiers du cours',icone: '📂', chemin: '/apprenant/ressources' },
    { libelle: 'Session live',     icone: '🎥', chemin: '/apprenant/session' },
    { libelle: 'Présences',        icone: '✅', chemin: '/apprenant/presences' },
    { libelle: 'Progression',      icone: '📈', chemin: '/apprenant/progression' },
    { libelle: 'Résultats & Bulletins', icone: '📊', chemin: '/apprenant/resultats' },
    { libelle: 'Badges',           icone: '🌟', chemin: '/apprenant/badges' },
    { libelle: 'Classement',       icone: '🏆', chemin: '/apprenant/classement' },
    { libelle: 'Notifications',    icone: '🔔', chemin: '/apprenant/notifications', notifications: true },
    { libelle: 'Messages',         icone: '📩', chemin: '/apprenant/messages', messagerie: true },
  ],
  apprenant_adulte: [
    { libelle: 'Tableau de bord',  icone: '🏠', chemin: '/apprenant/dashboard' },
    { libelle: 'Onboarding',       icone: '👋', chemin: '/apprenant/onboarding' },
    { libelle: 'Mes cours',        icone: '📖', chemin: '/apprenant/cours' },
    { libelle: 'Exercices & Devoirs', icone: '✏️', chemin: '/apprenant/devoirs' },
    { libelle: 'Fichiers du cours',icone: '📂', chemin: '/apprenant/ressources' },
    { libelle: 'Session live',     icone: '🎥', chemin: '/apprenant/session' },
    { libelle: 'Présences',        icone: '✅', chemin: '/apprenant/presences' },
    { libelle: 'Mini-jeux',        icone: '🎮', chemin: '/apprenant/minijeux' },
    { libelle: 'Dictionnaire',     icone: '📘', chemin: '/apprenant/dictionnaire' },
    { libelle: 'Progression',      icone: '📈', chemin: '/apprenant/progression' },
    { libelle: 'Résultats & Bulletins', icone: '📊', chemin: '/apprenant/resultats' },
    { libelle: 'Badges',           icone: '🌟', chemin: '/apprenant/badges' },
    { libelle: 'Classement',       icone: '🏆', chemin: '/apprenant/classement' },
    { libelle: 'Notifications',    icone: '🔔', chemin: '/apprenant/notifications', notifications: true },
    { libelle: 'Messages',         icone: '📩', chemin: '/apprenant/messages', messagerie: true },
  ],
  apprenant_enfant: [
    { libelle: 'Accueil',          icone: '🏠', chemin: '/apprenant/dashboard' },
    { libelle: 'Onboarding',       icone: '👋', chemin: '/apprenant/onboarding' },
    { libelle: 'Mes cours',        icone: '📚', chemin: '/apprenant/cours' },
    { libelle: 'Exercices & Devoirs', icone: '✏️', chemin: '/apprenant/devoirs' },
    { libelle: 'Mes fichiers',     icone: '📂', chemin: '/apprenant/ressources' },
    { libelle: 'Mon Live',         icone: '🎥', chemin: '/apprenant/session' },
    { libelle: 'Mes présences',    icone: '✅', chemin: '/apprenant/presences' },
    { libelle: 'Dictionnaire',     icone: '📘', chemin: '/apprenant/dictionnaire' },
    { libelle: 'Progression',      icone: '🌈', chemin: '/apprenant/progression' },
    { libelle: 'Résultats & Bulletins', icone: '📊', chemin: '/apprenant/resultats' },
    { libelle: 'Mes badges',       icone: '⭐', chemin: '/apprenant/badges' },
    { libelle: 'Classement',       icone: '🏆', chemin: '/apprenant/classement' },
    { libelle: 'Mini-jeux',        icone: '🎮', chemin: '/apprenant/minijeux' },
    { libelle: 'Notifications',    icone: '🔔', chemin: '/apprenant/notifications', notifications: true },
    { libelle: 'Messages',         icone: '📩', chemin: '/apprenant/messages', messagerie: true },
  ],
  apprenant_adolescent: [
    { libelle: 'Tableau de bord',  icone: '🏠', chemin: '/apprenant/dashboard' },
    { libelle: 'Onboarding',       icone: '👋', chemin: '/apprenant/onboarding' },
    { libelle: 'Mes cours',        icone: '📖', chemin: '/apprenant/cours' },
    { libelle: 'Exercices & Devoirs', icone: '✏️', chemin: '/apprenant/devoirs' },
    { libelle: 'Fichiers',         icone: '📂', chemin: '/apprenant/ressources' },
    { libelle: 'Session live',     icone: '🎥', chemin: '/apprenant/session' },
    { libelle: 'Présences',        icone: '✅', chemin: '/apprenant/presences' },
    { libelle: 'Dictionnaire',     icone: '📘', chemin: '/apprenant/dictionnaire' },
    { libelle: 'Progression',      icone: '📈', chemin: '/apprenant/progression' },
    { libelle: 'Résultats & Bulletins', icone: '📊', chemin: '/apprenant/resultats' },
    { libelle: 'Badges',           icone: '🌟', chemin: '/apprenant/badges' },
    { libelle: 'Classement',       icone: '🏆', chemin: '/apprenant/classement' },
    { libelle: 'Mini-jeux',        icone: '🎮', chemin: '/apprenant/minijeux' },
    { libelle: 'Notifications',    icone: '🔔', chemin: '/apprenant/notifications', notifications: true },
    { libelle: 'Messages',         icone: '📩', chemin: '/apprenant/messages', messagerie: true },
  ],
  parent: [
    { libelle: 'Tableau de bord',  icone: '🏠', chemin: '/parent/dashboard' },
    { libelle: 'Mes cours',        icone: '📚', chemin: '/parent/cours' },
    { libelle: 'Mon Live',         icone: '🎥', chemin: '/parent/live' },
    { libelle: 'Présences',        icone: '✅', chemin: '/parent/presences' },
    { libelle: 'Devoirs',          icone: '📝', chemin: '/parent/devoirs' },
    { libelle: 'Bilan & Suivi',    icone: '📊', chemin: '/parent/bilan' },
    { libelle: 'Éval. prof',      icone: '⭐', chemin: '/parent/evaluation' },
    { libelle: 'Profil enfant',   icone: '👧', chemin: '/parent/profil' },
    { libelle: 'Support',         icone: '🎧', chemin: '/parent/support' },
    { libelle: 'Notifications',   icone: '🔔', chemin: '/parent/notifications', notifications: true },
    { libelle: 'Messages',        icone: '💬', chemin: '/parent/messages', messagerie: true },
  ],
  professeur_titulaire: [
    { libelle: 'Tableau de bord', icone: '🏠', chemin: '/professeur/dashboard' },
    { libelle: 'Planning',        icone: '📅', chemin: '/professeur/planning' },
    { libelle: 'Mes demandes',    icone: '📨', chemin: '/professeur/demandes' },
    { libelle: 'Apprenants',      icone: '👩‍🎓', chemin: '/professeur/apprenants' },
    { libelle: 'Médiathèque',     icone: '📁', chemin: '/professeur/mediatheque' },
    { libelle: 'Fichiers partagés',icone:'📂', chemin: '/professeur/fichiers' },
    { libelle: 'Session live',    icone: '🎥', chemin: '/professeur/session-live' },
    { libelle: 'Présences',       icone: '✅', chemin: '/professeur/presences' },
    { libelle: 'Notes & Devoirs', icone: '📋', chemin: '/professeur/notes' },
    { libelle: 'Paiements',       icone: '💰', chemin: '/professeur/paiements' },
    { libelle: 'Récompenses',     icone: '🏆', chemin: '/professeur/recompenses' },
    { libelle: 'Notifications',   icone: '🔔', chemin: '/professeur/notifications', notifications: true },
    { libelle: 'Messages',        icone: '💬', chemin: '/professeur/messages', messagerie: true },
  ],
  professeur_remplacant: [
    { libelle: 'Tableau de bord', icone: '🏠', chemin: '/professeur/dashboard' },
    { libelle: 'Planning',        icone: '📅', chemin: '/professeur/planning' },
    { libelle: 'Apprenants',      icone: '👩‍🎓', chemin: '/professeur/apprenants' },
    { libelle: 'Présences',       icone: '✅', chemin: '/professeur/presences' },
    { libelle: 'Notes & Devoirs', icone: '📋', chemin: '/professeur/notes' },
    { libelle: 'Fichiers partagés',icone:'📂', chemin: '/professeur/fichiers' },
    { libelle: 'Paiements',       icone: '💰', chemin: '/professeur/paiements' },
    { libelle: 'Notifications',   icone: '🔔', chemin: '/professeur/notifications', notifications: true },
    { libelle: 'Messages',        icone: '💬', chemin: '/professeur/messages', messagerie: true },
  ],
  admin_manager: [
    { libelle: "Vue d'ensemble",      icone: '📊', chemin: '/admin/manager' },
    // Réorganisé par thème : pilotage → opérationnel (business client, le plus manipulé au
    // quotidien) → administration système → communication.
    { libelle: 'Entreprises',         icone: '🏢', chemin: '/admin/entreprises' },
    { libelle: 'Professeurs',         icone: '👨‍🏫', chemin: '/admin/manager/professeurs' },
    { libelle: 'Reporting',           icone: '📈', chemin: '/admin/reporting' },
    { libelle: 'Gestion des droits',  icone: '🛡️', chemin: '/admin/droits' },
    { libelle: 'Configuration',       icone: '⚙️',  chemin: '/admin/manager/configuration' },
    { libelle: 'Audit logs',          icone: '🕵️', chemin: '/admin/audit-logs' },
    { libelle: 'Notifications',       icone: '🔔', chemin: '/admin/notifications', notifications: true },
    { libelle: 'Messages',            icone: '💬', chemin: '/admin/messages', messagerie: true },
  ],
  admin_superviseur: [
    { libelle: 'Mes tâches',        icone: '✅', chemin: '/admin/superviseur/taches' },
    { libelle: "Vue d'ensemble",    icone: '📊', chemin: '/admin/superviseur' },
    { libelle: 'Classement',        icone: '🏆', chemin: '/admin/superviseur/classement' },
    { libelle: 'Plannings',         icone: '📅', chemin: '/admin/superviseur/plannings' },
    { libelle: 'Observer un cours', icone: '👁️', chemin: '/admin/superviseur/observer' },
    { libelle: 'Cahiers coachs',    icone: '📘', chemin: '/admin/superviseur/cahiers-coachs' },
    { libelle: 'Rapports Deputy',   icone: '📋', chemin: '/admin/superviseur/rapports-deputy' },
    { libelle: 'Anomalies',         icone: '⚠️', chemin: '/admin/superviseur/anomalies' },
    { libelle: 'Gestion Deputies',  icone: '👥', chemin: '/admin/superviseur/deputies' },
    { libelle: 'Notifications',     icone: '🔔', chemin: '/admin/notifications', notifications: true },
    { libelle: 'Messages',          icone: '💬', chemin: '/admin/messages', messagerie: true },
  ],
  admin_deputy_superviseur: [
    { libelle: 'Mes tâches',       icone: '✅', chemin: '/admin/deputy-superviseur/taches' },
    { libelle: 'Tableau de bord',  icone: '🏠', chemin: '/admin/deputy-superviseur' },
    /* Cahiers coachs : le MÊME composant que celui du superviseur général
       (`OngletCahiersCoachs`, déjà exporté) — le Deputy consulte les mêmes cahiers, il n'y
       avait aucune raison d'en écrire une seconde version. */
    { libelle: 'Cahiers coachs',   icone: '📘', chemin: '/admin/deputy-superviseur/cahiers-coachs' },
    { libelle: 'Plannings',        icone: '📅', chemin: '/admin/deputy-superviseur/plannings' },
    { libelle: 'Observer',         icone: '👁️',  chemin: '/admin/deputy-superviseur/observer' },
    { libelle: 'Mes rapports',     icone: '📋', chemin: '/admin/deputy-superviseur/rapports' },
    { libelle: 'Mes missions',     icone: '🎯', chemin: '/admin/deputy-superviseur/missions' },
    { libelle: 'Notifications',    icone: '🔔', chemin: '/admin/notifications', notifications: true },
    { libelle: 'Messages',         icone: '💬', chemin: '/admin/messages', messagerie: true },
  ],
  /* « À corriger » et « Résultats candidats » ne sont pas de nouveaux écrans : ce sont les
     sous-vues de `BetLevelTestsTab`, remontées au premier niveau comme sur dash. La file de
     correction est le travail quotidien de l'agent Placement — elle était à deux clics sous
     « Tests de niveau ». */
  admin_placement: [
    { libelle: 'Mes tâches',            icone: '✅', chemin: '/admin/placement/taches' },
    { libelle: "Vue d'ensemble",        icone: '📊', chemin: '/admin/placement' },
    { libelle: 'À corriger',            icone: '📥', chemin: '/admin/placement/a-corriger' },
    { libelle: 'Rapports',              icone: '📊', chemin: '/admin/placement/rapports' },
    { libelle: 'Tests de niveau',       icone: '🎯', chemin: '/admin/placement/tests' },
    { libelle: 'Résultats candidats',   icone: '📋', chemin: '/admin/placement/resultats' },
    { libelle: 'Notifications',         icone: '🔔', chemin: '/admin/notifications', notifications: true },
    { libelle: 'Messages',              icone: '💬', chemin: '/admin/messages', messagerie: true },
  ],
  // « Mes tâches » en tête, comme sur dash : c'est l'écran d'aiguillage, celui qui dit où aller
  // avant d'ouvrir quoi que ce soit. Le mettre ailleurs qu'en premier le rend inutile.
  admin_onboarding: [
    { libelle: 'Mes tâches',          icone: '✅', chemin: '/admin/onboarding/taches' },
    { libelle: "Vue d'ensemble",      icone: '📊', chemin: '/admin/onboarding' },
    { libelle: 'Parcours',            icone: '📋', chemin: '/admin/onboarding/parcours' },
    { libelle: 'Inscriptions',        icone: '📥', chemin: '/admin/onboarding/inscriptions' },
    { libelle: 'Suivi démarrage',     icone: '🚀', chemin: '/admin/onboarding/suivi' },
    { libelle: 'Plannings',          icone: '📅', chemin: '/admin/onboarding/plannings' },
    { libelle: 'Entreprises',         icone: '🏢', chemin: '/admin/onboarding/entreprises' },
    { libelle: 'Classes',             icone: '🏫', chemin: '/admin/onboarding/classes' },
    { libelle: 'Contenus',            icone: '📚', chemin: '/admin/onboarding/contenus' },
    { libelle: 'Notifications',       icone: '🔔', chemin: '/admin/notifications', notifications: true },
    { libelle: 'Messages',            icone: '💬', chemin: '/admin/messages', messagerie: true },
  ],
  admin_elearning: [
    /* ── LE VOLET COMMERCIAL ──
       bet-elearning n'a aucun rôle « Commerciale » : `ROLE_MAP_BET` résout `commercial`,
       `corporate` et même `admin_commercial` vers `admin_elearning`. Le menu
       `admin_commercial` plus haut est donc du code mort — rien de ce qu'on y ajoute n'est
       jamais affiché. Ces onglets vivent ici, le rôle que les comptes commerciaux reçoivent
       réellement ; ce menu mélange de ce fait deux métiers, c'est le prix de la fusion de
       rôles décidée côté bet-elearning.

       Plannings, Suivi démarrage et Tests reçus ne sont pas de nouveaux écrans : ils
       réutilisent ceux du Superviseur, de l'Onboarding et du Placement. Comptes entreprises
       et Pipeline B2B renvoient sur `DashboardAssistantCommercial` et `GestionEntreprises`,
       déjà en place et plus riches que les onglets B2B de dash. */
    /* PRÉFIXE `/admin/vente/` ET NON `/admin/commercial/` : App.js route déjà
       `/admin/commercial/*` vers `DashboardAssistantCommercial`, et React Router v6 classe par
       spécificité — ce motif à deux segments bat le `/admin/*` qui mène à `DashboardAdmin`.
       Sous `/admin/commercial/`, ces neuf écrans n'auraient jamais été atteints. */
    { libelle: 'Mes tâches',         icone: '✅', chemin: '/admin/vente/taches' },
    { libelle: 'Tableau de bord',    icone: '📊', chemin: '/admin/vente/tableau-de-bord' },
    { libelle: 'Tests reçus',        icone: '📝', chemin: '/admin/vente/tests' },
    { libelle: 'Inscriptions',       icone: '📥', chemin: '/admin/vente/inscriptions' },
    { libelle: 'Mes classes',        icone: '🏫', chemin: '/admin/vente/classes' },
    { libelle: 'Plannings',          icone: '📅', chemin: '/admin/vente/plannings' },
    { libelle: 'Mes apprenants',     icone: '🎓', chemin: '/admin/vente/apprenants' },
    { libelle: 'Suivi démarrage',    icone: '🚀', chemin: '/admin/vente/suivi' },
    { libelle: 'Paiements',          icone: '💳', chemin: '/admin/vente/paiements' },
    /* Les quatre onglets B2B demandés — Comptes entreprises, Pipeline B2B, Documents,
       Facturation — ne sont PAS ajoutés ici : ils doublonneraient « Entreprises »
       (/admin/elearning/entreprises) et « Espace Commercial » (/admin/commercial), déjà
       présents juste en dessous et qui montent `GestionEntreprises` (5 203 l.) et
       `DashboardAssistantCommercial` (821 l.) — plus riches que les onglets de dash. Deux
       entrées de menu vers le même écran se lisent comme un bug, pas comme une commodité. */
    { libelle: "Vue d'ensemble",  icone: '📊', chemin: '/admin/elearning/overview'     },
    { libelle: 'Programme',       icone: '📈', chemin: '/admin/elearning/programme'    },
    { libelle: 'Reporting',       icone: '📋', chemin: '/admin/elearning/reporting'    },
    { libelle: 'Entreprises',     icone: '🏢', chemin: '/admin/elearning/entreprises'  },
    { libelle: 'Espace Commercial', icone: '💼', chemin: '/admin/commercial'           },
    { libelle: 'Notifications',   icone: '🔔', chemin: '/admin/notifications', notifications: true },
    { libelle: 'Messages',        icone: '💬', chemin: '/admin/messages', messagerie: true },
  ],
  admin_commercial: [
    { libelle: 'Entreprises',   icone: '🏢', chemin: '/admin/commercial/entreprises' },
    { libelle: 'Notifications', icone: '🔔', chemin: '/admin/notifications', notifications: true },
    { libelle: 'Messages',      icone: '💬', chemin: '/admin/messages', messagerie: true },
  ],
  admin_customer_care: [
    { libelle: "Vue d'ensemble",    icone: '📊', chemin: '/admin/support/overview' },
    { libelle: 'Tickets',           icone: '🎧', chemin: '/admin/support/tickets'  },
    { libelle: 'Profils',           icone: '👥', chemin: '/admin/support/profils'  },
    { libelle: 'Blocages absences', icone: '🚫', chemin: '/admin/support/blocages' },
    { libelle: 'Notifications',     icone: '🔔', chemin: '/admin/notifications', notifications: true },
    { libelle: 'Messages',          icone: '💬', chemin: '/admin/messages',      messagerie: true },
  ],
  /* Assistante SAV. « Remboursements » et « Suivi satisfaction » sont des ébauches ici comme
     sur dash : les garder visibles plutôt que les masquer évite qu'une assistante habituée à
     dash cherche un onglet disparu, et l'écran dit franchement que le circuit reste à définir. */
  assistant_sav: [
    { libelle: 'Mes tâches',          icone: '✅', chemin: '/admin/sav/taches' },
    { libelle: 'Tableau de bord',     icone: '🏠', chemin: '/admin/sav' },
    { libelle: 'Demandes SAV',        icone: '📨', chemin: '/admin/sav/demandes' },
    { libelle: 'Remboursements',      icone: '💳', chemin: '/admin/sav/remboursements' },
    { libelle: 'Suivi satisfaction',  icone: '😊', chemin: '/admin/sav/satisfaction' },
    { libelle: 'Notifications',       icone: '🔔', chemin: '/admin/notifications', notifications: true },
    { libelle: 'Messages',            icone: '💬', chemin: '/admin/messages', messagerie: true },
  ],
  admin_pa_advisor: [
    { libelle: "Vue d'ensemble",       icone: '📊', chemin: '/admin/pa-advisor/overview' },
    { libelle: 'Classes',              icone: '🏫', chemin: '/admin/pa-advisor/classes' },
    { libelle: 'Coachs',                icone: '👨‍🏫', chemin: '/admin/pa-advisor/coachs' },
    { libelle: 'Rapports Superviseur',  icone: '📋', chemin: '/admin/pa-advisor/rapports-superviseur' },
    { libelle: 'Remplacements',         icone: '🔄', chemin: '/admin/pa-advisor/remplacements' },
    { libelle: 'Honoraires',            icone: '💰', chemin: '/admin/pa-advisor/honoraires' },
    { libelle: 'Suivi apprenants',      icone: '👩‍🎓', chemin: '/admin/pa-advisor/apprenants' },
    { libelle: 'Suivi programme',       icone: '📈', chemin: '/admin/pa-advisor/programme' },
    { libelle: 'Évaluations',           icone: '⭐', chemin: '/admin/pa-advisor/evaluations' },
    { libelle: 'Reporting',             icone: '📊', chemin: '/admin/pa-advisor/reporting' },
    { libelle: 'Notifications',         icone: '🔔', chemin: '/admin/notifications', notifications: true },
    { libelle: 'Messages',              icone: '💬', chemin: '/admin/messages', messagerie: true },
  ],
  admin_rh_paie: [
    { libelle: 'Mes tâches',        icone: '✅', chemin: '/admin/rh/taches' },
    { libelle: "Vue d'ensemble",    icone: '📊', chemin: '/admin/rh' },
    { libelle: 'Contrats & RH',     icone: '📝', chemin: '/admin/rh/contrats' },
    { libelle: 'Grille tarifaire', icone: '💰', chemin: '/admin/rh/grille' },
    { libelle: 'Bulletins de paie', icone: '💰', chemin: '/admin/rh/paie' },
    { libelle: 'Congés',            icone: '📅', chemin: '/admin/rh/conges' },
    { libelle: 'Notifications',     icone: '🔔', chemin: '/admin/notifications', notifications: true },
    { libelle: 'Messages',          icone: '💬', chemin: '/admin/messages', messagerie: true },
  ],
  admin_comptable: [
    { libelle: 'Mes tâches',           icone: '✅', chemin: '/admin/comptable/taches' },
    { libelle: "Vue d'ensemble",    icone: '📊', chemin: '/admin/comptable' },
    { libelle: 'Facturation',       icone: '🧾', chemin: '/admin/comptable/facturation' },
    { libelle: 'Paiements',         icone: '💳', chemin: '/admin/comptable/paiements' },
    { libelle: 'Trésorerie',        icone: '💰', chemin: '/admin/comptable/tresorerie' },
    { libelle: 'Fournisseurs & Achats', icone: '🚚', chemin: '/admin/comptable/fournisseurs' },
    /* Cet écran EXISTAIT DÉJÀ — `OngletComptaRrdBcBacn`, route incluse — mais sans entrée
       de menu : il était terminé et inaccessible. */
    { libelle: 'RRD · BC · BACN',      icone: '🧾', chemin: '/admin/comptable/rrd-bc-bacn' },
    { libelle: 'Comptabilité générale', icone: '📚', chemin: '/admin/comptable/generale' },
    { libelle: 'TVA',               icone: '🧮', chemin: '/admin/comptable/tva' },
    { libelle: 'Immobilisations',   icone: '🏗️', chemin: '/admin/comptable/immobilisations' },
    { libelle: 'Budgets',           icone: '🎯', chemin: '/admin/comptable/budgets' },
    { libelle: 'Analytique',        icone: '📐', chemin: '/admin/comptable/analytique' },
    { libelle: 'Honoraires coaches',   icone: '🧾', chemin: '/admin/comptable/honoraires' },
    { libelle: 'Exports comptables',   icone: '⬇️', chemin: '/admin/comptable/exports' },
    { libelle: 'Entreprises',       icone: '🏢', chemin: '/admin/entreprises' },
    { libelle: 'Notifications',     icone: '🔔', chemin: '/admin/notifications', notifications: true },
    { libelle: 'Messages',          icone: '💬', chemin: '/admin/messages', messagerie: true },
  ],
  client_entreprise: [
    { libelle: 'Tableau de bord RH', icone: '🏠', chemin: '/entreprise/dashboard' },
    { libelle: 'Bénéficiaires',      icone: '👥', chemin: '/entreprise/beneficiaires' },
    { libelle: 'Inscription',        icone: '➕', chemin: '/entreprise/inscription' },
    { libelle: 'Rapports',           icone: '📊', chemin: '/entreprise/rapports' },
    { libelle: 'Contrat & Paiements',icone: '💳', chemin: '/entreprise/paiements' },
    { libelle: 'Gestion des accès',  icone: '🔐', chemin: '/entreprise/acces' },
    { libelle: 'Notifications',      icone: '🔔', chemin: '/entreprise/notifications', notifications: true },
    { libelle: 'Messages',           icone: '💬', chemin: '/entreprise/messages', messagerie: true },
  ],
};

const DESCRIPTIONS_ROLE = {
  apprenant:            'Espace apprentissage · BET E-Learning',
  parent:               'Suivi parental · BET E-Learning',
  professeur_titulaire: 'Espace enseignant · Professeur titulaire',
  professeur_remplacant:'Espace enseignant · Professeur remplaçant',
  admin_manager:        'Manager BET · Pilotage global',
  admin_superviseur:    'Superviseur · Suivi qualité',
  admin_placement:      'Agent Placement · Tests de niveau',
  admin_onboarding:     'Agent Onboarding · Gestion classes',
  admin_elearning:      'Assistant E-Learning · Suivi programme',
  admin_commercial:     'Assistante Corporate · Gestion entreprises',
  admin_customer_care:  'Customer Care · Support client',
  admin_pa_advisor:     'PA Advisor · Conseil pédagogique',
  admin_rh_paie:             'RH / Paie · Ressources humaines',
  admin_comptable:           'Comptable Trésorier · Finance',
  admin_deputy_superviseur:  'Deputy Superviseur · Observation & rapports',
  assistant_sav:             'Assistante SAV · Demandes après-vente',
};

function getNomEntreprise(profile) {
  if (!profile?.entreprise_id) return null;
  // nom_entreprise stocké dynamiquement dans le profil (connexion réelle)
  if (profile.nom_entreprise) return profile.nom_entreprise;
  return MOCK_ENTREPRISES.find(e => e.id === profile.entreprise_id)?.nom || null;
}

export default function TopNavLayout({ children, stats, menusSec, menuRole, sousTitre }) {
  const { profile, seDeconnecter, connexionReel } = useAuth();
  const confirm = useConfirm();
  const alerte = useAlerte();
  const messagerieCtx = useMessagerie();
  const navigate  = useNavigate();
  const location  = useLocation();

  const notifCtx   = useNotifications();
  const nbNonLus   = messagerieCtx?.nbNonLus || 0;
  const nbNotifs   = notifCtx?.nbNonLus || 0;
  // menuRole permet aux pages apprenant de passer leur menu adapté selon l'âge
  const menus        = MENUS_PAR_ROLE[menuRole] || MENUS_PAR_ROLE[profile?.role] || [];
  /* Le libellé vient du rôle RÉEL quand on le connaît, sinon de la façade. Un super admin
     porte la façade `admin_manager` (son dashboard est celui du manager) et s'affichait donc
     « Manager BET » : son identité était masquée à l'écran alors qu'elle compte pour savoir
     qui a fait quoi. */
  const roleLibelle  = LIBELLES_ROLES[profile?.role_reel] || LIBELLES_ROLES[profile?.role] || profile?.role || '';
  // Le surnom n'existait dans aucun des dix-sept dashboards de bet-elearning, alors que la
  // colonne vit sur `utilisateurs` - table ou figurent aussi bien le personnel que les
  // coachs, les apprenants et les parents. Le poser ici couvre d'un coup tous les ecrans
  // qui partagent cet en-tete, plutot que de le recopier dans chacun.
  const [monProfilOuvert, setMonProfilOuvert] = React.useState(false);
  // Cliquer sur sa photo la montrait... en ouvrant le selecteur de fichier. Voir et
  // remplacer sont deux intentions distinctes : le crayon en coin garde le remplacement.
  const [photoOuverte, setPhotoOuverte] = React.useState(false);
  const [surnomPerso, setSurnomPerso] = React.useState(profile?.surnom || '');
  const nomEntreprise = getNomEntreprise(profile);
  const description  = sousTitre
    ? sousTitre
    : nomEntreprise
    ? `${nomEntreprise} · Programme de formation`
    : (DESCRIPTIONS_ROLE[profile?.role] || 'BET E-Learning · Plateforme');
  const initiales  = profile
    ? `${profile.prenom?.[0] || ''}${profile.nom?.[0] || ''}`.toUpperCase()
    : '?';

  const [footerCfg, setFooterCfg] = useState(FOOTER_DEFAUT);
  useEffect(() => {
    const token = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
    if (!token) return;
    fetchFooterConfig(token).then(setFooterCfg);
  }, []);

  function estActif(chemin) {
    return location.pathname === chemin || location.pathname.startsWith(chemin + '/');
  }

  async function gererDeconnexion() {
    if (!(await confirm('Vous allez être déconnecté(e) de votre session.', { titre: 'Se déconnecter ?', confirmLabel: 'Se déconnecter', danger: false }))) return;
    // menuRole (ex: "apprenant_enfant") sert de filet de sécurité si profile.role n'est pas
    // encore résolu au clic - évite de retomber sur le fallback générique "/connexion" (portail
    // BET) au lieu de la page de connexion propre au rôle (ex: "/connexion/apprenant").
    const role = profile?.role || (menuRole?.startsWith('apprenant') ? 'apprenant' : null);
    const destination = ROLE_LOGIN[role] || '/connexion';
    // On attend la fin complète de la déconnexion avant de naviguer, pour éviter toute course
    // avec le listener onAuthStateChange / RedirectRacine qui pourrait rediriger entre-temps.
    seDeconnecter().finally(() => navigate(destination, { replace: true }));
  }

  // ── Photo de profil (logo entreprise pour client_entreprise) ────────────
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);

  // Qui peut changer sa photo depuis ce header : l'entreprise (logo) et l'apprenant (photo de
  // profil personnelle - visible ensuite côté Onboarding, PA Advisor, coach, parent et RH).
  const peutModifierAvatar = profile?.role === 'client_entreprise' || profile?.role === 'apprenant';

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      if (profile?.role === 'apprenant') {
        // Photo de profil apprenant - upload générique puis persistance sur utilisateurs.avatar_url.
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        const formData = new FormData();
        formData.append('file', file);
        const upRes = await fetchUpload(`${API_URL}/api/upload/avatar`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        const upD = await upRes.json();
        if (!upRes.ok) throw new Error(upD.error || 'Erreur upload');
        const avatarUrl = upD.file.url;
        const saveRes = await fetch(`${API_URL}/api/apprenants/preferences`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ avatar_url: avatarUrl }),
        });
        if (!saveRes.ok) throw new Error((await saveRes.json()).error || 'Erreur enregistrement');
        connexionReel({ ...profile, avatar_url: avatarUrl });
      } else {
        const formData = new FormData();
        formData.append('logo', file);
        const token = localStorage.getItem('admin_token');
        const res = await fetch(`${API_URL}/api/entreprise/elearning/update-logo`, {
          method: 'PATCH',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Erreur upload');
        connexionReel({ ...profile, logo_url: d.logo_url });
      }
    } catch (err) {
      await alerte('Erreur : ' + err.message, { danger: true });
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  // ── Thème couleur personnalisé - piloté par ThemeContext ───────────────────
  const { couleurTheme, changerCouleur, couleurDefaut } = useTheme();
  // Version assombrie de couleurTheme pour les fonds où du texte blanc est posé dessus (header,
  // footer) - sans ça, un thème clair (jaune pâle, cyan clair…) rend ce texte illisible.
  const couleurThemeSombre = assombrirCouleur(couleurTheme, 0.45);
  const couleurThemeAccent = eclaircirCouleur(couleurTheme, 0.35);
  const [showPalette, setShowPalette] = useState(false);
  const paletteRef = useRef(null);

  useEffect(() => {
    function fermerSiHorsClic(e) {
      if (paletteRef.current && !paletteRef.current.contains(e.target)) setShowPalette(false);
    }
    if (showPalette) document.addEventListener('mousedown', fermerSiHorsClic);
    return () => document.removeEventListener('mousedown', fermerSiHorsClic);
  }, [showPalette]);

  function handleChangerCouleur(c) {
    changerCouleur(c);
    setShowPalette(false);
  }

  const S = {
    page: {
      minHeight: '100vh',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      background: COULEURS.gris50,
      display: 'flex',
      flexDirection: 'column',
    },
    // ── HEADER ─────────────────────────────────────────────────────────────────
    header: {
      background: `linear-gradient(135deg, ${COULEURS.navy} 0%, #0E4F6B 60%, ${couleurThemeSombre} 100%)`,
      padding: '16px 32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
    },
    headerGauche: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.15)',
      border: '2px solid rgba(255,255,255,0.3)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 18,
      fontWeight: 800,
      color: COULEURS.blanc,
      flexShrink: 0,
      letterSpacing: 1,
    },
    roleBadge: {
      display: 'inline-block',
      background: `${couleurTheme}55`,
      color: '#fff',
      border: `1px solid ${couleurTheme}77`,
      borderRadius: 20,
      padding: '2px 10px',
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 4,
      letterSpacing: '0.03em',
    },
    nomUtilisateur: {
      fontSize: 20,
      fontWeight: 800,
      color: COULEURS.blanc,
      lineHeight: 1.1,
      marginBottom: 2,
    },
    infoSecondaire: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.55)',
    },
    headerDroite: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    },
    btnNotif: {
      width: 40,
      height: 40,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.1)',
      border: '1px solid rgba(255,255,255,0.2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      fontSize: 18,
      color: COULEURS.blanc,
    },
    btnDeconnexion: {
      background: 'rgba(220,38,38,0.15)',
      border: '1px solid rgba(220,38,38,0.35)',
      borderRadius: 8,
      padding: '8px 18px',
      color: '#FCA5A5',
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    // ── STATS BAR ───────────────────────────────────────────────────────────────
    statsBar: {
      background: `linear-gradient(135deg, #0D1829 0%, #0c3547 100%)`,
      padding: '14px 32px',
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      flexShrink: 0,
    },
    statItem: {
      flex: 1,
      textAlign: 'center',
      padding: '0 16px',
      borderRight: '1px solid rgba(255,255,255,0.08)',
    },
    statItemDernier: {
      flex: 1,
      textAlign: 'center',
      padding: '0 16px',
    },
    statLabel: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.45)',
      fontWeight: 500,
      marginBottom: 3,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    },
    statValeur: (couleur) => ({
      fontSize: 20,
      fontWeight: 800,
      color: couleur || COULEURS.blanc,
      lineHeight: 1,
    }),
    // ── NAV PRIMAIRE ────────────────────────────────────────────────────────────
    navPrimaire: {
      background: COULEURS.blanc,
      borderBottom: `1px solid ${COULEURS.gris200}`,
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      overflowX: 'auto',
      flexShrink: 0,
      scrollbarWidth: 'none',
    },
    tabPrimaire: (actif) => ({
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '14px 16px',
      cursor: 'pointer',
      color: actif ? couleurTheme : COULEURS.gris600,
      fontWeight: actif ? 700 : 500,
      fontSize: 13,
      whiteSpace: 'nowrap',
      transition: 'all 0.15s',
      background: 'transparent',
      border: 'none',
      borderBottom: actif ? `2px solid ${couleurTheme}` : '2px solid transparent',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
    }),
    tabIcone: {
      fontSize: 15,
    },
    tabBadge: (actif) => ({
      background: actif ? couleurTheme : COULEURS.gris200,
      color: actif ? COULEURS.blanc : COULEURS.gris600,
      borderRadius: 10,
      padding: '1px 7px',
      fontSize: 11,
      fontWeight: 700,
      minWidth: 18,
      textAlign: 'center',
    }),
    // ── NAV SECONDAIRE ──────────────────────────────────────────────────────────
    navSecondaire: {
      background: COULEURS.gris50,
      borderBottom: `1px solid ${COULEURS.gris200}`,
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      overflowX: 'auto',
      flexShrink: 0,
      scrollbarWidth: 'none',
    },
    tabSecondaire: (actif) => ({
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '10px 14px',
      cursor: 'pointer',
      color: actif ? couleurTheme : COULEURS.gris600,
      fontWeight: actif ? 600 : 400,
      fontSize: 12,
      whiteSpace: 'nowrap',
      transition: 'all 0.15s',
      background: 'transparent',
      border: 'none',
      borderBottom: actif ? `2px solid ${couleurTheme}` : '2px solid transparent',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
    }),
    tabSecBadge: {
      background: COULEURS.gris200,
      color: COULEURS.gris600,
      borderRadius: 10,
      padding: '1px 6px',
      fontSize: 11,
      fontWeight: 700,
    },
    // ── CONTENU ──────────────────────────────────────────────────────────────────
    contenu: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
    },
    // ── FOOTER ───────────────────────────────────────────────────────────────────
    footer: {
      background: COULEURS.navy,
      borderTop: `1px solid rgba(255,255,255,0.06)`,
      padding: '24px 32px 20px',
      flexShrink: 0,
    },
    footerInner: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 32,
      marginBottom: 20,
    },
    footerLogo: {
      fontSize: 18,
      fontWeight: 800,
      color: COULEURS.blanc,
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      lineHeight: 1.2,
      marginBottom: 6,
    },
    footerLogoSous: {
      fontSize: 11,
      color: couleurThemeAccent,
      fontWeight: 500,
    },
    footerLogoDesc: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.35)',
      marginTop: 8,
      maxWidth: 220,
      lineHeight: 1.6,
    },
    footerColTitre: {
      fontSize: 11,
      fontWeight: 700,
      color: 'rgba(255,255,255,0.45)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom: 12,
    },
    footerLien: {
      display: 'block',
      fontSize: 13,
      color: 'rgba(255,255,255,0.55)',
      marginBottom: 8,
      cursor: 'pointer',
      textDecoration: 'none',
      transition: 'color 0.15s',
    },
    footerDivider: {
      borderTop: '1px solid rgba(255,255,255,0.08)',
      paddingTop: 16,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    footerCopy: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.3)',
    },
    footerBadges: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    },
    footerBadge: {
      fontSize: 10,
      fontWeight: 700,
      padding: '3px 8px',
      borderRadius: 6,
      letterSpacing: '0.04em',
    },
  };

  return (
    <div style={S.page}>
      {/* ── Header ── */}
      <header style={S.header}>
        <div style={S.headerGauche}>
          {/* Avatar - logo_url pour client_entreprise, initiales sinon */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div
              style={{
                ...S.avatar,
                overflow: 'hidden',
                cursor: (profile?.logo_url || profile?.avatar_url) ? 'zoom-in' : 'default',
              }}
              title={(profile?.logo_url || profile?.avatar_url) ? 'Voir en grand' : undefined}
              onClick={() => { if (profile?.logo_url || profile?.avatar_url) setPhotoOuverte(true); }}
            >
              {uploadingAvatar ? (
                <span style={{ fontSize: 20 }}>⏳</span>
              ) : (profile?.logo_url || profile?.avatar_url) ? (
                <img
                  src={profile.logo_url || profile.avatar_url}
                  alt={profile?.role === 'apprenant' ? 'Photo de profil' : 'Logo entreprise'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                  onError={e => { e.target.style.display = 'none'; }}
                />
              ) : (
                initiales
              )}
            </div>
            {/* Crayon - uniquement pour les rôles autorisés à changer leur photo */}
            {peutModifierAvatar && !uploadingAvatar && (
              <div
                onClick={() => avatarInputRef.current?.click()}
                style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: 18, height: 18, borderRadius: '50%',
                  background: couleurTheme, border: '2px solid rgba(255,255,255,0.6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, cursor: 'pointer',
                }}
              >✏️</div>
            )}
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarUpload}
            />
          </div>
          <div>
            <div style={S.roleBadge}>{roleLibelle}</div>
            <div style={{ ...S.nomUtilisateur, display:'flex', alignItems:'center', gap:6 }}>
              {nomAffiche({ prenom: profile?.prenom, nom: profile?.nom, surnom: surnomPerso, email: profile?.email })}
              <BoutonMonProfil onClick={() => setMonProfilOuvert(true)} couleurTexte="#94a3b8" />
            </div>
            {surnomPerso.trim() && (profile?.prenom || profile?.nom) && (
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{profile?.prenom} {profile?.nom}</div>
            )}
            {photoOuverte && (
              <VisionneuseImage
                url={profile?.logo_url || profile?.avatar_url}
                titre={`${profile?.prenom || ''} ${profile?.nom || ''}`.trim()}
                onClose={() => setPhotoOuverte(false)}
              />
            )}
            <MonProfilModal
              ouvert={monProfilOuvert}
              onClose={() => setMonProfilOuvert(false)}
              onEnregistre={(v) => setSurnomPerso(v || '')}
              profil={{ id: profile?.id, prenom: profile?.prenom, nom: profile?.nom, email: profile?.email, surnom: surnomPerso }}
            />
            <div style={S.infoSecondaire}>
              {profile?.email} · {description}
            </div>
          </div>
        </div>
        <div style={S.headerDroite}>
          <div
            style={{ ...S.btnNotif, position: 'relative', cursor: 'pointer' }}
            title="Notifications"
            onClick={() => {
              const base = profile?.role?.startsWith('admin') ? '/admin'
                : profile?.role?.startsWith('professeur') ? '/professeur'
                : profile?.role === 'parent' ? '/parent'
                : profile?.role === 'client_entreprise' ? '/entreprise'
                : '/apprenant';
              navigate(`${base}/notifications`);
            }}
          >
            🔔
            {nbNotifs > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: '#EF4444', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                {nbNotifs > 9 ? '9+' : nbNotifs}
              </span>
            )}
          </div>
          <BoutonLangue />

          {/* ── Personnalisation couleur dashboard ── */}
          <div ref={paletteRef} style={{ position: 'relative' }}>
            <button
              title="Personnaliser la couleur de mon dashboard"
              onClick={() => setShowPalette(v => !v)}
              style={{
                ...S.btnNotif,
                border: `2px solid ${couleurTheme}88`,
                background: `${couleurTheme}25`,
                fontSize: 16,
              }}
            >
              🎨
            </button>
            {showPalette && (
              <div style={{
                position: 'absolute', top: 50, right: 0, zIndex: 2000,
                background: '#fff', borderRadius: 14,
                boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
                padding: 16, width: 228,
                border: '1px solid #E2E8F0',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  🎨 Couleur du dashboard
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                  {PALETTE_THEME.map(c => (
                    <button
                      key={c}
                      onClick={() => handleChangerCouleur(c)}
                      style={{
                        width: 44, height: 44, borderRadius: 10,
                        background: c, border: 'none', cursor: 'pointer',
                        outline: couleurTheme === c ? `3px solid ${COULEURS.navy}` : '3px solid transparent',
                        outlineOffset: 2,
                        transition: 'transform 0.1s',
                        flexShrink: 0,
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.12)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    />
                  ))}
                </div>
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 10 }}>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 6 }}>Couleur personnalisée</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="color"
                      value={couleurTheme}
                      onChange={e => changerCouleur(e.target.value)}
                      style={{ width: 44, height: 36, borderRadius: 8, border: '1px solid #E2E8F0', cursor: 'pointer', padding: 2 }}
                    />
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#475569', fontWeight: 600 }}>{couleurTheme.toUpperCase()}</span>
                    <button
                      onClick={() => handleChangerCouleur(couleurDefaut)}
                      style={{ marginLeft: 'auto', fontSize: 10, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: 600 }}
                    >
                      Réinitialiser
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {profile?.role === 'admin_manager' && (
            <button
              title="Retourner au tableau de bord BET (SuperAdmin)"
              onClick={() => {
                const dashUrl = process.env.REACT_APP_DASH_URL || 'http://localhost:3001';
                window.open(`${dashUrl}/dashboard/superAdmin`, '_blank');
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 14px', borderRadius: 9,
                background: 'rgba(220,38,38,0.2)',
                border: '1.5px solid rgba(220,38,38,0.45)',
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'background .2s',
                fontFamily: '"Plus Jakarta Sans", sans-serif',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(220,38,38,0.38)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(220,38,38,0.2)'}
            >
              <span style={{ fontSize: 15 }}>👑</span> Dashboard BET
            </button>
          )}
          <button style={S.btnDeconnexion} onClick={gererDeconnexion}>
            <span>🚪</span>
            Déconnexion
          </button>
        </div>
      </header>

      {/* ── Stats bar ── */}
      {stats && stats.length > 0 && (
        <div style={S.statsBar}>
          {stats.map((s, i) => (
            <div
              key={s.label}
              style={i === stats.length - 1 ? S.statItemDernier : S.statItem}
            >
              <div style={S.statLabel}>{s.label}</div>
              <div style={S.statValeur(s.couleur)}>{s.valeur}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Navigation primaire ── */}
      <nav style={S.navPrimaire}>
        {menus.map((item) => {
          const actif = estActif(item.chemin);
          const badgeVal = item.messagerie ? nbNonLus : item.notifications ? nbNotifs : item.badge;
          return (
            <button
              key={item.chemin}
              style={S.tabPrimaire(actif)}
              onClick={() => navigate(item.chemin)}
            >
              <span style={S.tabIcone}>{item.icone}</span>
              <span>{item.libelle}</span>
              {badgeVal != null && badgeVal > 0 && (
                <span style={{
                  ...S.tabBadge(actif),
                  background: item.messagerie ? '#EF4444' : (actif ? couleurTheme : COULEURS.gris200),
                  color: '#fff',
                  animation: item.messagerie && badgeVal > 0 ? 'none' : undefined,
                }}>
                  {badgeVal}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Navigation secondaire (optionnelle) ── */}
      {menusSec && menusSec.length > 0 && (
        <nav style={S.navSecondaire}>
          {menusSec.map((item) => {
            const actif = estActif(item.chemin);
            return (
              <button
                key={item.chemin}
                style={S.tabSecondaire(actif)}
                onClick={() => navigate(item.chemin)}
              >
                <span>{item.icone}</span>
                <span>{item.libelle}</span>
                {item.badge != null && (
                  <span style={S.tabSecBadge}>{item.badge}</span>
                )}
              </button>
            );
          })}
        </nav>
      )}

      {/* ── Contenu ── */}
      <div style={S.contenu}>
        {children}
      </div>

      {/* ── Footer ── */}
      {footerCfg.visible && (
      <footer style={S.footer}>
        <div style={S.footerInner}>
          {/* Colonne logo */}
          <div>
            <div style={S.footerLogo}>{nomEntreprise ? `BET × ${nomEntreprise}` : 'BET E-Learning'}</div>
            <div style={S.footerLogoSous}>{footerCfg.tagline}</div>
            <div style={S.footerLogoDesc}>
              {footerCfg.description}{nomEntreprise ? ` (${nomEntreprise})` : ''}
            </div>
          </div>

          {/* Colonnes configurables */}
          {footerCfg.colonnes.map((col, ci) => (
            <div key={ci}>
              <div style={S.footerColTitre}>{col.titre}</div>
              {col.liens.map((lien, li) => (
                lien.url ? (
                  <a key={li} href={lien.url} target="_blank" rel="noreferrer" style={{ ...S.footerLien, textDecoration:'none', display:'block' }}>{lien.label}</a>
                ) : (
                  <span key={li} style={S.footerLien}>{lien.label}</span>
                )
              ))}
            </div>
          ))}
        </div>

        {/* Bas du footer */}
        <div style={S.footerDivider}>
          <span style={S.footerCopy}>
            © {new Date().getFullYear()} {nomEntreprise ? `BET × ${nomEntreprise}` : 'BET E-Learning'} · {footerCfg.copyright_texte}
          </span>
          <div style={S.footerBadges}>
            <span style={{ ...S.footerBadge, background: 'rgba(255,255,255,0.14)', color: couleurThemeAccent }}>
              {footerCfg.version}
            </span>
            <span style={{ ...S.footerBadge, background: 'rgba(22,163,74,0.2)', color: '#4ADE80' }}>
              ● EN LIGNE
            </span>
            <span style={{ ...S.footerBadge, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}>
              🔒 SÉCURISÉ
            </span>
          </div>
        </div>
      </footer>
      )}
    </div>
  );
}
