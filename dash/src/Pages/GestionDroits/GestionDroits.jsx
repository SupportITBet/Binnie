// src/Pages/GestionDroits/GestionDroits.jsx
// Route : <Route path="/gestion-droits" element={<GestionDroits />} />
// npm install react-hot-toast (déjà installé)

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import { exporterExcelStyle } from "../../utils/exporterExcel";

const API_URL  = process.env.REACT_APP_API_URL || "http://localhost:5001";
const authHdrs = () => ({ "Content-Type":"application/json", Authorization:`Bearer ${localStorage.getItem("admin_token")}` });

/* ═══════════════════════════════════════════════
   CONSTANTES & PALETTE BET
═══════════════════════════════════════════════ */
const BET      = "#1B3080";
const BET_DARK = "#0d1a4a";
const BET_RED  = "#E8273A";
const BET_GRAD = "linear-gradient(135deg,#0d1a4a 0%,#1B3080 60%,#2a4aad 100%)";

/* ── Rôles hiérarchiques ── */
const ROLES_DEF = {
  super_admin: {
    id:"super_admin", label:"Super Admin", emoji:"👑",
    color:"#E8273A", bg:"#fff1f2", border:"#fecdd3",
    niveau: 4,
    description:"Accès total à toutes les fonctionnalités. Configure la plateforme, gère les droits et supervise tout.",
    canBeEditedBy:[], // personne ne peut l'éditer
    badge:"bg-red",
  },
  admin: {
    id:"admin", label:"Administrateur", emoji:"🛡️",
    color:"#1B3080", bg:"#eff6ff", border:"#bfdbfe",
    niveau: 3,
    description:"Gestion complète de la plateforme sauf la configuration système. Peut créer et gérer tous les utilisateurs.",
    canBeEditedBy:["super_admin"],
    badge:"bg-blue",
  },
  manager: {
    id:"manager", label:"Manager", emoji:"📋",
    color:"#059669", bg:"#f0fdf4", border:"#bbf7d0",
    niveau: 1,
    description:"Suit la progression de son équipe, accède aux présences et aux notes. Vue limitée à son périmètre.",
    canBeEditedBy:["super_admin","admin"],
    badge:"bg-green",
  },
  // ── Rôles physiques staff dash (clés = valeurs réelles de utilisateurs.role,
  // les mêmes que PHYSICAL_ROLES plus bas) ──────────────
  superviseur: {
    id:"superviseur", label:"Superviseur", emoji:"🧭",
    color:"#4F46E5", bg:"#eef2ff", border:"#c7d2fe",
    niveau: 2,
    description:"Supervise les coachs, évalue leurs cahiers de texte, gère l'éligibilité au paiement et les anomalies.",
    canBeEditedBy:["super_admin","admin"],
    badge:"bg-indigo",
  },
  deputy_superviseur: {
    id:"deputy_superviseur", label:"Deputy Superviseur", emoji:"🔎",
    color:"#6D28D9", bg:"#f5f3ff", border:"#ddd6fe",
    niveau: 1,
    description:"Réalise les missions d'observation auprès des coachs et soumet ses rapports au superviseur.",
    canBeEditedBy:["super_admin","admin","superviseur"],
    badge:"bg-purple",
  },
  onboarding: {
    id:"onboarding", label:"Agent Onboarding", emoji:"📥",
    color:"#0891B2", bg:"#f0f9ff", border:"#bae6fd",
    niveau: 1,
    description:"Gère les inscriptions, crée les comptes apprenants et parents, assigne les groupes après test.",
    canBeEditedBy:["super_admin","admin"],
    badge:"bg-cyan",
  },
  placement_test: {
    id:"placement_test", label:"Agent Placement / Tests", emoji:"🎯",
    color:"#7C3AED", bg:"#f5f3ff", border:"#ddd6fe",
    niveau: 1,
    description:"Administre les tests de niveau (A1→C2), valide les résultats et prépare les assignations de groupes.",
    canBeEditedBy:["super_admin","admin"],
    badge:"bg-purple",
  },
  admin_elearning: {
    id:"admin_elearning", label:"Assistant E-Learning", emoji:"🎓",
    color:"#D97706", bg:"#fffbeb", border:"#fde68a",
    niveau: 1,
    description:"Suit le programme pédagogique, le reporting et les contenus de la plateforme e-learning.",
    canBeEditedBy:["super_admin","admin"],
    badge:"bg-amber",
  },
  customer_care: {
    id:"customer_care", label:"Customer Care", emoji:"🎧",
    color:"#DB2777", bg:"#fdf2f8", border:"#fbcfe8",
    niveau: 1,
    description:"Support client, gestion des tickets, suivi des blocages et résolution des problèmes apprenants.",
    canBeEditedBy:["super_admin","admin"],
    badge:"bg-pink",
  },
  assistant_sav: {
    id:"assistant_sav", label:"Assistante SAV", emoji:"🛎️",
    color:"#0E7490", bg:"#ecfeff", border:"#a5f3fc",
    niveau: 1,
    description:"Service après-vente : suivi des demandes clients, remboursements et satisfaction post-formation.",
    canBeEditedBy:["super_admin","admin"],
    badge:"bg-cyan",
  },
  commercial: {
    id:"commercial", label:"Commercial", emoji:"🏢",
    color:"#0284C7", bg:"#f0f9ff", border:"#bae6fd",
    niveau: 1,
    description:"Gestion des prospects/inscriptions B2C et des entreprises clientes, contrats et suivi commercial B2B.",
    canBeEditedBy:["super_admin","admin"],
    badge:"bg-sky",
  },
  pedagogical_advisor: {
    id:"pedagogical_advisor", label:"PA Advisor", emoji:"🧑‍🏫",
    color:"#9333EA", bg:"#faf5ff", border:"#e9d5ff",
    niveau: 1,
    description:"Conseil pédagogique, suivi des apprenants, évaluations des professeurs et remplacements.",
    canBeEditedBy:["super_admin","admin"],
    badge:"bg-violet",
  },
  rh: {
    id:"rh", label:"RH / Paie", emoji:"💼",
    color:"#16A34A", bg:"#f0fdf4", border:"#bbf7d0",
    niveau: 1,
    description:"Gestion des contrats professeurs, bulletins de paie, congés et ressources humaines.",
    canBeEditedBy:["super_admin","admin"],
    badge:"bg-green",
  },
  comptable: {
    id:"comptable", label:"Comptable Trésorier", emoji:"💰",
    color:"#CA8A04", bg:"#fefce8", border:"#fef08a",
    niveau: 1,
    description:"Facturation, paiements entreprises, suivi trésorerie et rapprochements comptables.",
    canBeEditedBy:["super_admin","admin"],
    badge:"bg-yellow",
  },
  gestionnaire: {
    id:"gestionnaire", label:"Gestionnaire", emoji:"⚙️",
    color:"#64748B", bg:"#f8fafc", border:"#e2e8f0",
    niveau: 1,
    description:"Traite les inscriptions, dossiers, paiements et requêtes administratives courantes.",
    canBeEditedBy:["super_admin","admin"],
    badge:"bg-slate",
  },
  coach: {
    id:"coach", label:"Coach / Professeur", emoji:"👨‍🏫",
    color:"#0D9488", bg:"#f0fdfa", border:"#99f6e4",
    niveau: 1,
    description:"Anime les classes, gère son planning, ses remplacements, devoirs/évaluations et ses honoraires.",
    canBeEditedBy:["super_admin","admin"],
    badge:"bg-teal",
  },
  data_collector: {
    id:"data_collector", label:"Data Collector", emoji:"📇",
    color:"#94A3B8", bg:"#f8fafc", border:"#e2e8f0",
    niveau: 1,
    description:"Collecte et qualifie les prospects/leads particuliers, importe des fichiers de contacts.",
    canBeEditedBy:["super_admin","admin"],
    badge:"bg-gray",
  },
  marketing: {
    id:"marketing", label:"Assistant Marketing", emoji:"📣",
    color:"#DB2777", bg:"#fdf2f8", border:"#fbcfe8",
    niveau: 1,
    description:"Gère le contenu du site web (offres, blog, témoignages, FAQ, boutique, newsletter…) et suit le trafic.",
    canBeEditedBy:["super_admin","admin"],
    badge:"bg-pink",
  },
};

/* ── Utilisateurs ── */
const USERS_INIT = [
  { id:1, nom:"Binnie Kouassi",   email:"binnie@bet.ci",       role:"super_admin", actif:true,  dernConn:"2025-12-09 08:14", twofa:true,  ipRestr:false, accessTemp:null, avatar:"BK", createdAt:"2023-01-15", sessions:2 },
  { id:2, nom:"Amara Diallo",     email:"a.diallo@bet.ci",     role:"admin",       actif:true,  dernConn:"2025-12-09 07:52", twofa:true,  ipRestr:false, accessTemp:null, avatar:"AD", createdAt:"2023-03-10", sessions:1 },
  { id:3, nom:"Fatou N'Diaye",    email:"f.ndiaye@bet.ci",     role:"admin",       actif:true,  dernConn:"2025-12-08 16:30", twofa:false, ipRestr:true,  accessTemp:null, avatar:"FN", createdAt:"2023-06-01", sessions:1 },
  { id:6, nom:"Bah Mamadou",      email:"m.bah@bnp.ci",        role:"manager",     actif:true,  dernConn:"2025-12-09 08:45", twofa:false, ipRestr:false, accessTemp:"2025-12-31", avatar:"BM", createdAt:"2024-05-10", sessions:1 },
  { id:7, nom:"Coulibaly Sékou",  email:"s.coul@nestle.ci",    role:"manager",     actif:true,  dernConn:"2025-12-07 11:20", twofa:false, ipRestr:false, accessTemp:null, avatar:"CS", createdAt:"2024-06-01", sessions:0 },
];

/* ── Journal d'audit ── */
const AUDIT_INIT = [
  { id:1, acteur:"Binnie Kouassi", role:"super_admin", action:"PERMISSION_MODIFIEE", detail:"Rôle Admin - finances.modifier → activé", date:"2025-12-09 08:14", ip:"192.168.1.1",  statut:"success" },
  { id:2, acteur:"Amara Diallo",   role:"admin",       action:"UTILISATEUR_CREE",   detail:"Nouveau compte : Coulibaly Sékou (manager)", date:"2025-12-08 17:30", ip:"192.168.1.2", statut:"success" },
  { id:3, acteur:"Amara Diallo",   role:"admin",       action:"ROLE_MODIFIE",       detail:"Traoré Ibrahima : responsable → désactivé", date:"2025-11-28 14:05", ip:"192.168.1.2", statut:"success" },
  { id:4, acteur:"SYSTÈME",        role:"system",      action:"TENTATIVE_ECHEC",    detail:"Connexion refusée : user_inconnu@hack.com", date:"2025-12-08 22:11", ip:"41.202.219.4", statut:"danger" },
  { id:5, acteur:"Binnie Kouassi", role:"super_admin", action:"2FA_FORCE",          detail:"2FA rendu obligatoire pour rôle Admin", date:"2025-12-07 10:00", ip:"192.168.1.1",  statut:"success" },
  { id:6, acteur:"Fatou N'Diaye",  role:"admin",       action:"SESSION_REVOQUEE",   detail:"Session forcée fermée : Bah Mamadou", date:"2025-12-06 16:00", ip:"192.168.1.3",  statut:"warning" },
  { id:7, acteur:"SYSTÈME",        role:"system",      action:"TENTATIVE_ECHEC",    detail:"Brute-force détecté : 5 échecs consécutifs", date:"2025-12-05 03:22", ip:"102.90.14.7", statut:"danger" },
  { id:8, acteur:"Koné Mariam",    role:"manager", action:"EXPORT_DONNEES",     detail:"Export CSV étudiants entreprise Orange", date:"2025-12-04 11:15", ip:"192.168.1.5",  statut:"warning" },
];

/* ── Demandes d'accès ── */
const DEMANDES_INIT = [
  { id:1, nom:"Soro Patrick",    email:"p.soro@mtn.ci",    roleDemande:"manager", entreprise:"MTN CI",    date:"2025-12-08", statut:"en_attente", justification:"Responsable formation équipe commerciale 45 personnes" },
  { id:2, nom:"Diabaté Yves",    email:"y.diab@total.ci",  roleDemande:"manager",     entreprise:"TotalEnergie", date:"2025-12-07", statut:"en_attente", justification:"Manager équipe technique - besoin suivi formations réglementaires" },
  { id:3, nom:"Camara Aminata",  email:"a.cam@ecobank.ci", roleDemande:"admin", entreprise:"Ecobank",   date:"2025-12-06", statut:"approuve",   justification:"DRH Ecobank - supervision 120 collaborateurs" },
];

/* ── Politiques de sécurité ── */
const SECURITE_INIT = {
  super_admin:{ twofa_obligatoire:true,  expiration_session:60,  tentatives_max:3, ip_restriction:false, rotation_pwd_jours:60,  complexite_pwd:"tres_haute" },
  admin:      { twofa_obligatoire:true,  expiration_session:120, tentatives_max:5, ip_restriction:false, rotation_pwd_jours:90,  complexite_pwd:"haute"      },
  manager:    { twofa_obligatoire:false, expiration_session:480, tentatives_max:10,ip_restriction:false, rotation_pwd_jours:365, complexite_pwd:"normale"    },
};

const PERM_LABELS = { voir:"Voir", creer:"Créer", modifier:"Modifier", supprimer:"Supprimer" };
const PERM_COLORS = { voir:"#2563eb", creer:"#059669", modifier:"#d97706", supprimer:"#dc2626" };

const fmtDate = d => d ? new Date(d).toLocaleDateString("fr-FR",{ day:"numeric", month:"short", year:"numeric" }) : "-";
const fmtDateTime = d => d ? d.replace("T"," ").slice(0,16) : "-";

/* ═══════════════════════════════════════════════
   MATRICE DE PERMISSIONS RÉELLE (permissions_roles /
   permission_exceptions côté serveur - même backend et mêmes
   tables que bet-elearning/src/pages/admin/GestionDroits.jsx,
   adapté aux rôles/modules réellement utilisés côté dash).
═══════════════════════════════════════════════ */

// Rôles physiques réels (utilisateurs.role) - seule valeur que le backend
// connaît. Distincts des clés "façade" de ROLES_DEF ci-dessus (qui servent
// uniquement à l'affichage des autres onglets de cette page).
export const PHYSICAL_ROLES = [
  { id:"super_admin",          lib:"Super Admin",           couleur:"#DC2626" },
  { id:"admin",                lib:"Admin",                  couleur:"#7C3AED" },
  { id:"manager",               lib:"Manager",                couleur:"#0891B2" },
  { id:"superviseur",           lib:"Superviseur",            couleur:"#4F46E5" },
  { id:"deputy_superviseur",    lib:"Deputy Superviseur",     couleur:"#6D28D9" },
  { id:"onboarding",            lib:"Onboarding",              couleur:"#EA580C" },
  { id:"pedagogical_advisor",   lib:"PA Advisor",             couleur:"#0369A1" },
  { id:"commercial",            lib:"Commercial",              couleur:"#0284C7" },
  { id:"customer_care",         lib:"Customer Care",          couleur:"#EC4899" },
  { id:"assistant_sav",         lib:"Assistante SAV",         couleur:"#0E7490" },
  { id:"placement_test",        lib:"Placement Test",         couleur:"#16A34A" },
  { id:"rh",                    lib:"RH / Paie",               couleur:"#0F766E" },
  { id:"comptable",             lib:"Comptable",               couleur:"#D97706" },
  { id:"gestionnaire",          lib:"Gestionnaire",           couleur:"#64748B" },
  { id:"coach",                 lib:"Coach / Professeur",     couleur:"#0D9488" },
  { id:"data_collector",        lib:"Data Collector",         couleur:"#94A3B8" },
  { id:"marketing",             lib:"Assistant Marketing",    couleur:"#DB2777" },
];

// Catalogue de modules - partagé avec le backend commun (mêmes routes
// requirePermission(module, action) que bet-elearning), donc mêmes ids.
export const MODULES_PERMISSIONS = [
  { id:"roles",          lib:"Rôles & permissions",     icone:"🛡️", desc:"Créer/modifier des rôles et gérer les droits d'accès des utilisateurs staff." },
  { id:"remplacements",  lib:"Remplacements",           icone:"🔄", desc:"Signaler l'absence d'un coach, assigner un remplaçant, suivre les délégations de séances." },
  { id:"missions",       lib:"Missions d'observation",  icone:"🎯", desc:"Planifier et suivre les visites d'observation d'un Deputy Superviseur auprès des coachs." },
  { id:"classes",        lib:"Classes & groupes",       icone:"🏫", desc:"Créer/modifier les classes/groupes, assigner un coach, gérer les apprenants inscrits." },
  { id:"honoraires",     lib:"Honoraires & paiements",  icone:"💰", desc:"Calculer, valider et transmettre à la RH les honoraires mensuels des coachs." },
  { id:"contenus_ressources", lib:"Contenus - Ressources",              icone:"📄", desc:"Bibliothèque de ressources d'onboarding : vidéos, PDFs, guides destinés aux nouveaux inscrits." },
  { id:"contenus_biblio",     lib:"Contenus - Bibliothèque communautaire", icone:"🎧", desc:"Contenus audio/vidéo libres mis à disposition des apprenants." },
  { id:"contenus_minijeux",   lib:"Contenus - Mini-jeux",               icone:"🎮", desc:"Créer et gérer les mini-jeux pédagogiques proposés aux apprenants." },
  { id:"devoirs_evaluations", lib:"Devoirs, exercices & évaluations",  icone:"✍️", desc:"Créer des devoirs/exercices pour une classe et corriger les rendus des apprenants." },
  { id:"examens",        lib:"Examens",                 icone:"📝", desc:"Créer et administrer les examens/tests de niveau des apprenants." },
  { id:"inscriptions",   lib:"Inscriptions",            icone:"📥", desc:"Saisir de nouvelles inscriptions et les faire avancer dans le parcours." },
  { id:"planning",       lib:"Planning",                icone:"📅", desc:"Gérer le planning des séances et des disponibilités des coachs." },
  { id:"finances",       lib:"Finances",                icone:"💳", desc:"Saisir/corriger des versements et consulter la situation financière d'un dossier." },
  { id:"crm_entreprises",lib:"CRM - Entreprises",       icone:"🏢", desc:"Créer/modifier les fiches entreprises clientes et leurs documents rattachés." },
  { id:"prospects_b2b",  lib:"Prospects B2B",           icone:"📋", desc:"Suivre les demandes entreprises reçues du site web (statut du lead, notes de suivi)." },
  { id:"contrat",        lib:"Contrats entreprise",     icone:"📄", desc:"Renouveler le contrat d'une entreprise cliente et gérer son statut." },
  { id:"rapports",       lib:"Rapports",                icone:"📈", desc:"Consulter et exporter le reporting (classes, coachs, apprenants)." },
  { id:"rh",             lib:"RH",                      icone:"🤝", desc:"Gestion des contrats et bulletins de paie des professeurs." },
  { id:"support",        lib:"Support",                 icone:"🎧", desc:"Traiter les tickets/plaintes et les demandes des apprenants/entreprises." },
  { id:"audit",          lib:"Audit logs",              icone:"🕵️", desc:"Consulter l'historique des actions sensibles effectuées par les comptes staff." },
  { id:"configuration",  lib:"Configuration",           icone:"⚙️", desc:"Paramètres généraux de la plateforme." },
  // ── Modules "site web" (Assistant Marketing) - découpage détaillé du tab
  // Plateforme du SuperAdmin, pour que la matrice reste lisible (voir aussi
  // module "examens" pour Test de niveau, déjà partagé avec PA Advisor/Placement Test).
  { id:"offres_catalogue", lib:"Offres & Catalogue",    icone:"🗂️", desc:"Nos centres, offres en ligne/à domicile, certifications, interprétariat, traduction, catalogue PDF, BET for Business, codes promo." },
  { id:"contenu_editorial",lib:"Contenu éditorial",     icone:"📰", desc:"Blog, témoignages, FAQ, carrousel & médias, avis sur les offres." },
  { id:"boutique",         lib:"Boutique",               icone:"🛍️", desc:"Produits de la boutique et suivi des commandes." },
  { id:"communication",    lib:"Communication",          icone:"📣", desc:"Partenaires, contact & WhatsApp, marquee, newsletter, parcours entreprise." },
  { id:"equipe_coachs",    lib:"Équipe Coachs",          icone:"👨‍🏫", desc:"Photos et fiches de l'équipe affichées sur le site." },
  { id:"trafic",           lib:"Trafic web",             icone:"🌐", desc:"Sondages, sources d'acquisition et statistiques de visite (lecture)." },
  { id:"suivi_prospects",  lib:"Suivi prospects",        icone:"📋", desc:"Qualification, relances et fidélisation des prospects/apprenants (statut, prochain contact, conversion en ambassadeur)." },

  /* ── Modules ajoutés par l'audit du 29/09/2026 ───────────────────────────────────────
     Six écrans apparus depuis la dernière révision de cette matrice n'y figuraient pas.
     Chacun retombe côté serveur sur un module que les rôles concernés possèdent déjà
     (MODULE_FALLBACK_PARENT dans Backend/src/middlewares/requireAdmin.js), et les droits
     correspondants ont été écrits en base par
     Backend/src/routes/scripts/accorderNouveauxModules.mjs : décocher l'un d'eux retire donc
     un accès réel, sans que l'ajout en ait interrompu un.

     ATTENTION, ces modules ne protègent pas tous la même chose. `presences` et `leads`
     verrouillent des routes serveur (trois en tout, les seules que l'audit a trouvées
     réellement ouvertes). Les quatre autres décrivent des écrans dont les routes sont déjà
     gardées autrement - par rôle (`requireSuperviseurRole`, `requireGlobalSuperviseur`) ou
     par des contrôles par action à l'intérieur du handler, comme demandesTransfert.js qui
     vérifie en plus la propriété de la classe. Ces gardes-là sont plus fines que la matrice :
     y superposer un requirePermission ne protégerait rien de plus et ajouterait une façon
     de bloquer quelqu'un qui travaille. Ces quatre modules restent donc déclaratifs tant que
     les dashboards concernés ne filtrent pas leurs onglets sur les droits - aujourd'hui seul
     EspaceProfesseur le fait, via hasPermission(). */
  { id:"transferts",         lib:"Transferts d'apprenants", icone:"🔀", desc:"Demander le transfert d'un apprenant, rendre son niveau, et le réaffecter à une autre classe. Circuit coach → agent placement test → onboarding ou assistante de centre." },
  { id:"observations",       lib:"Observation des coachs",  icone:"📓", desc:"Cahiers des coachs, signalement d'anomalies et classement par catégorie de contrat." },
  { id:"evaluations_qualite",lib:"Évaluations qualité",     icone:"⭐", desc:"Appréciations déposées par les apprenants sur leurs séances et évaluations des coachs par les parents." },
  { id:"presences",          lib:"Présences",               icone:"✅", desc:"Saisir les feuilles de présence d'une séance, et corriger une présence déjà validée." },
  { id:"leads",              lib:"Collecte de données",     icone:"📇", desc:"Base de clients et prospects collectés, import de fichiers et contrôle de la qualité des données." },
  { id:"suivi_demarrage",    lib:"Suivi de démarrage",      icone:"🚀", desc:"Suivi des premières séances d'un nouvel apprenant, bilans de fin de cycle et renouvellements." },
];

// Modules pertinents par rôle physique, alignés sur les onglets réels de
// chaque dashboard dash/src/Pages/* (voir commentaires par rôle ci-dessous
// pour la source de chaque liste).
export const MODULES_PAR_ROLE = {
  super_admin: null, // null = tous les modules
  admin:       null,
  manager:            ["roles","crm_entreprises","finances","rapports","audit"],
  // Onglets réels (SuperviseurDashboard.jsx) : Cahiers (coachs), Rapports, Éligibilité,
  // Anomalies, Deputy Superviseurs, Missions d'observation - le catalogue actuel n'a pas de
  // module dédié "cahiers coachs"/"anomalies", donc ces deux onglets restent non couverts.
  // Onglets réels : Plannings, Observer un cours, Gestion Deputies, Cahiers coachs,
  // Classement, Évaluations apprenants, Évaluations parents, Rapports Deputy, Anomalies.
  // "observations" couvre les cahiers, les anomalies et le classement ; "evaluations_qualite"
  // les deux onglets d'évaluation ; "planning" la consultation du planning des classes.
  superviseur:        ["rapports","missions","observations","evaluations_qualite","planning"],
  // Le deputy voit les cahiers en lecture seule et n'a pas les anomalies : le même module
  // les couvre, la restriction d'écriture se joue déjà dans l'écran (gardes IS_GENERAL).
  deputy_superviseur: ["rapports","missions","observations","planning"],
  // Onglets réels (OnboardingDashboard.jsx) : Nouveaux/Mes apprenants, Suivi démarrage, Groupes,
  // Coachs, Contenus (sous-onglets Bibliothèque/Upload/Statistiques/Mini-jeux). Le sous-onglet
  // "Bibliothèque" contient aussi la bibliothèque de vidéos communautaires (contenus_biblio) -
  // module oublié ici initialement, ce qui laissait ses boutons non gatés côté dashboard.
  onboarding:         ["inscriptions","classes","contenus_ressources","contenus_biblio",
                       "contenus_minijeux","transferts","suivi_demarrage","planning"],
  // Onglets réels (PedagogicalAdvisorDashboard.jsx) : Prospects parcours, Apprenants, Groupes,
  // Coachs, Remplacements, Honoraires, Évaluations, Rapports Superviseur, Réaffectations.
  pedagogical_advisor:["rapports","classes","remplacements","honoraires","inscriptions",
                       "support","transferts","evaluations_qualite"],
  // Onglets réels (CommercialDashboard.jsx) : Prospects parcours, Tests reçus, Inscriptions,
  // Mes classes, Comptes entreprises, Pipeline B2B, Documents, Facturation.
  commercial:         ["crm_entreprises","prospects_b2b","contrat","finances","inscriptions",
                       "classes","examens","transferts","suivi_demarrage","planning"],
  customer_care:      ["support"],
  // Nouveau rôle distinct de Customer Care - dashboard dédié (SavDashboard.jsx) construit sur
  // le même module "support" (demandes/plaintes) en attendant un périmètre plus fin une fois
  // les vrais besoins SAV connus.
  assistant_sav:      ["support"],
  // Onglets réels (PlacementTestDashboard.jsx) : À corriger/Traités (tests de niveau), Rapports.
  placement_test:     ["examens","rapports","transferts"],
  rh:                 ["rh","honoraires"],
  // Onglets réels (ComptableDashboard.jsx) : Facturation, Paiements, Trésorerie, TVA,
  // Immobilisations, Budgets, Honoraires coaches - aucun onglet CRM entreprises.
  // Les 12 onglets métier sont couverts par les neuf sous-modules `dash_finances_*`, qui
  // protègent les 75 routes de dashComptabilite.js et retombent sur `finances` (cf. l'audit
  // du 29/09/2026). Inutile d'ajouter un module « comptabilité » de plus : il ferait un
  // interrupteur sans effet à côté de neuf qui fonctionnent.
  comptable:          ["finances","honoraires"],
  // Onglets réels (GestionnaireDashboard.jsx) : Inscriptions, Dossiers, Paiements, Requêtes.
  gestionnaire:       ["inscriptions","finances","support"],
  // Onglets réels (EspaceProfesseur.jsx) : Contrats, Apprenants, Planning, Disponibilités,
  // Présences, Évaluations, Session Live, Médiathèque (modules de cours - couvert par
  // devoirs_evaluations), Ressources, Mes demandes (remplacements), Honoraires, Récompenses.
  coach:              ["planning","remplacements","classes","devoirs_evaluations","honoraires",
                       "contenus_ressources","presences","transferts"],
  // DataCollectorDashboard.jsx gère des leads particuliers (Clients/Prospects/Import) - aucun
  // module du catalogue actuel ne correspond réellement (pas d'examens) ; laissé vide plutôt que
  // d'afficher un module trompeur, en attendant l'ajout d'un module "leads" côté backend.
  data_collector:     ["leads"],
  // assistant_elearning / admin_elearning n'ont pas de dashboard dash (rôles utilisés
  // uniquement pour l'accès SSO à la plateforme e-learning) - laissés vides pour éviter
  // qu'ils héritent par défaut de TOUS les modules (comportement de `null`).
  assistant_elearning: [],
  admin_elearning:     [],
  // Onglets réels (SuperAdminDashboard.jsx, tabs restreints pour ce rôle) :
  // Plateforme (Partenaires, WhatsApp, Équipe Coachs, Marquee, Offres & Contenus,
  // Avis, Boutique, Blog & Témoignages, Newsletter, FAQ, Carrousel, Parcours
  // Entreprise, Test de niveau) + Trafic web.
  marketing: ["offres_catalogue","contenu_editorial","boutique","communication","equipe_coachs","trafic","suivi_prospects"],
};
export function modulesPertinents(rolePhysique) {
  const liste = MODULES_PAR_ROLE[rolePhysique];
  if (!liste) return MODULES_PERMISSIONS;
  return MODULES_PERMISSIONS.filter(m => liste.includes(m.id));
}

export const ACTIONS_PERMISSIONS = [
  { key:"create", lib:"Créer" },
  { key:"update", lib:"Modifier" },
  { key:"delete", lib:"Supprimer" },
  { key:"manage", lib:"Gérer" },
];

// Actions réellement vérifiées par le backend, module par module - une case
// n'apparaît dans la matrice QUE si une route existe vraiment pour ce couple
// module/action (sinon elle ne ferait rien, ce qui serait trompeur).
const ACTIONS_ACTIVES_PAR_MODULE = {
  roles:               ["manage"],
  remplacements:       ["create","update"],
  missions:            ["update"],
  classes:             ["create","update","delete"],
  honoraires:          ["manage"],
  contenus_ressources: ["create","update","delete"],
  contenus_biblio:     ["create","update","delete"],
  contenus_minijeux:   ["create","update","delete"],
  devoirs_evaluations: ["create","update","delete"],
  examens:             ["create","update","delete"],
  // `manage` n'est garde par aucune route - seuls create/update/delete le sont.
  inscriptions:        ["create","update","delete"],
  planning:            ["create","update"],
  finances:            ["create","update","delete"],
  crm_entreprises:     ["create","update","delete"],
  // Aucune route ne garde ce module : la case `update` n'avait aucun effet.
  prospects_b2b:       [],
  contrat:             ["create","update"],
  rapports:            ["manage"],
  rh:                  [],
  support:             ["create","update","delete"],
  audit:               [],
  // Aucune route `requirePermission("configuration", …)` n'existe : ces trois cases
  // etaient cochables sans aucun effet serveur.
  configuration:       [],
  offres_catalogue:    ["create","update","delete"],
  contenu_editorial:   ["create","update","delete"],
  boutique:            ["create","update","delete"],
  communication:       ["create","update","delete"],
  equipe_coachs:       ["create","update","delete"],
  trafic:              [],

  /* ── LES SEPT MODULES QUI TOMBAIENT DANS LE REPLI ──────────────────────────────────
     `actionsActives()` affiche les QUATRE actions quand un module n'a pas d'entree ici.
     Ces sept-la n'en avaient pas : ils exposaient donc 28 cases, dont 24 sans aucune route
     derriere - exactement ce que le commentaire en tete de cette table interdit.

     Quatre n'ont aucune route protegee du tout (`transferts`, `observations`,
     `evaluations_qualite`, `suivi_demarrage`) : leur acces passe par le repli de
     MODULE_FALLBACK_PARENT cote backend, pas par une case a cocher. `leads` n'est garde
     qu'en lecture, et la matrice n'expose pas `read`. Ils sont donc a vide, volontairement :
     le module reste visible dans la liste - il existe - mais sans case trompeuse. */
  suivi_prospects:     ["create","update","delete"],
  presences:           ["create"],
  leads:               [],
  transferts:          [],
  observations:        [],
  evaluations_qualite: [],
  suivi_demarrage:     [],
};
// Certains rôles partagent un module avec d'autres (ex: "inscriptions" est aussi
// utilisé par commercial/gestionnaire/data_collector) mais n'en exploitent qu'un
// sous-ensemble d'actions dans leur propre dashboard - cette table retire ces
// actions-là (par rôle) pour ne pas afficher une case qui n'a aucun effet.
// Onboarding ne "saisit" jamais une inscription depuis zéro (ça reste le rôle du
// Commercial/Data Collector) : il ne fait qu'avancer/annuler un dossier existant.
const ACTIONS_EXCLUES_PAR_ROLE = {
  "onboarding:inscriptions": ["create"],
};
export function actionsActives(moduleId, role) {
  const base = ACTIONS_ACTIVES_PAR_MODULE[moduleId] || ACTIONS_PERMISSIONS.map(a => a.key);
  const exclues = role ? ACTIONS_EXCLUES_PAR_ROLE[`${role}:${moduleId}`] : null;
  return exclues ? base.filter(a => !exclues.includes(a)) : base;
}

/* ═══════════════════════════════════════════════
   SOUS-COMPOSANTS
═══════════════════════════════════════════════ */
const Sidebar = () => (
  <div style={{ width:200, minWidth:200, background:"#0f172a", color:"#fff", padding:20, minHeight:"100vh" }}>
    <div style={{ marginBottom:24, padding:"10px 8px", borderRadius:10, background:"rgba(27,48,128,0.3)", textAlign:"center", border:"1px solid rgba(27,48,128,0.4)" }}>
      <div style={{ fontSize:18, fontWeight:900, color:"#60a5fa", letterSpacing:"0.05em" }}>BET</div>
      <div style={{ fontSize:9, color:"rgba(255,255,255,0.4)", letterSpacing:"0.15em", marginTop:2 }}>SUPER ADMIN</div>
    </div>
    {[
      { label:"Dashboard",         path:"/AdminDashboard" },
      { label:"Utilisateurs",      path:"/users" },
      { label:"Cours",             path:"/courses" },
      { label:"Étudiants",         path:"/etudiants" },
      { label:"Planning",          path:"/planning" },
      { label:"Entreprises / DRH", path:"/drh" },
      { label:"Finances",          path:"/finances" },
      { label:"Rapports & KPIs",   path:"/rapports" },
      { label:"🔐 Droits d'accès", path:"/gestion-droits", active:true },
      { label:"Audit & Logs",      path:"/audit" },
      { label:"Paramètres",        path:"/settings" },
    ].map((it,i) => (
      <div key={i} style={{ padding:"10px 12px", marginBottom:5, borderRadius:8, cursor:"pointer", fontSize:12, color:"#fff",
        background: it.active ? BET : "transparent",
        fontWeight: it.active ? 700 : 400,
        border: it.active ? `1px solid ${BET}80` : "1px solid transparent",
      }}>{it.label}</div>
    ))}
  </div>
);

/* ══════════════════════════════════════════════════════════════
   IMPORT SCHEMAS - un schéma par rôle importable
══════════════════════════════════════════════════════════════ */
const _mapCentreGlobal = (val) => {
  if (!val) return null;
  const n = String(val).toLowerCase()
    .replace(/[éèêë]/g,"e").replace(/[àâä]/g,"a").replace(/[ùûü]/g,"u").replace(/[îï]/g,"i").replace(/[ôö]/g,"o");
  const CENTRES = [
    { id:"angre",     mots:["angre","cocody","angre"] },
    { id:"2plateaux", mots:["2plateaux","ii plateau","deux plateau","2 plateau","plateau"] },
    { id:"yopougon",  mots:["yopougon"] },
    { id:"koumassi",  mots:["koumassi"] },
    { id:"abatta",    mots:["abatta"] },
    { id:"bouake",    mots:["bouake","bouake"] },
  ];
  for (const c of CENTRES) { if (c.mots.some(m => n.includes(m))) return c.id; }
  if (CENTRES.map(c=>c.id).includes(val.trim().toLowerCase())) return val.trim().toLowerCase();
  return null;
};

const IMPORT_SCHEMAS = {
  coach: {
    label:"Coach", emoji:"🏫", couleur:"#059669", bg:"#f0fdf4",
    avecCentre:false,
    colonnes:[
      { key:"prenom",          header:"Prénom",            requis:true  },
      { key:"nom",             header:"Nom",               requis:true  },
      { key:"email",           header:"Email",             requis:true  },
      { key:"telephone",       header:"Téléphone",         requis:false },
      { key:"filiere",         header:"Filière",           requis:false },
      { key:"matricule",       header:"Matricule",         requis:false },
      { key:"specialite",      header:"Spécialité",        requis:false },
      { key:"niveaux",         header:"Niveaux enseignés", requis:false },
      { key:"type_contrat",    header:"Type de contrat",   requis:false },
      { key:"lieu_habitation", header:"Lieu d'habitation", requis:false },
      { key:"date_debut_bet",  header:"Date début BET",    requis:false },
      { key:"certifications",  header:"Certifications",    requis:false },
    ],
    exemple:["Aminata","Koné","a.kone@bet-coaching.ci","+225 07 01 23 45","Business English","BET-C001","Communication","B1,B2,C1","CDI","Cocody","2022-03-01","CELTA,TOEIC"],
    buildPayload:(f,scope)=>({ prenom:f.prenom, nom:f.nom, email:f.email, telephone:f.telephone||null, role:"coach", scope, departement:"Pédagogie", coach_info:{ filiere:f.filiere||"", matricule:f.matricule||"", specialite:f.specialite||"", niveaux:f.niveaux||"", type_contrat:f.type_contrat||"", personnalite:f.personnalite||"", lieu_habitation:f.lieu_habitation||"", date_debut_bet:f.date_debut_bet||"", certifications:f.certifications?f.certifications.split(",").map(s=>s.trim()).filter(Boolean):[] } }),
    extraInfo:(f)=>[f.filiere,f.matricule].filter(Boolean).join(" · ")||"-",
    extraLabel:"Filière · Matricule",
  },
  commercial: {
    label:"Commercial", emoji:"💼", couleur:"#2563eb", bg:"#eff6ff",
    avecCentre:true,
    colonnes:[
      { key:"prenom",    header:"Prénom",    requis:true  },
      { key:"nom",       header:"Nom",       requis:true  },
      { key:"email",     header:"Email",     requis:true  },
      { key:"telephone", header:"Téléphone", requis:false },
      { key:"centre_bet",header:"Centre BET",requis:false },
      { key:"zone",      header:"Zone",      requis:false },
    ],
    exemple:["Kouassi","Bamba","k.bamba@bet-coaching.ci","+225 05 12 34 56","yopougon","Zone Sud"],
    buildPayload:(f,scope)=>({ prenom:f.prenom, nom:f.nom, email:f.email, telephone:f.telephone||null, role:"commercial", scope, zone:f.zone||"" }),
    extraInfo:(f)=>f.zone||"-",
    extraLabel:"Zone",
  },
  deputy_superviseur: {
    label:"Deputy Superviseur", emoji:"🔎", couleur:"#7c3aed", bg:"#f5f3ff",
    avecCentre:false,
    colonnes:[
      { key:"prenom",    header:"Prénom",    requis:true  },
      { key:"nom",       header:"Nom",       requis:true  },
      { key:"email",     header:"Email",     requis:true  },
      { key:"telephone", header:"Téléphone", requis:false },
    ],
    exemple:["Fatou","Diallo","f.diallo@bet-coaching.ci","+225 01 23 45 67"],
    buildPayload:(f,scope)=>({ prenom:f.prenom, nom:f.nom, email:f.email, telephone:f.telephone||null, role:"deputy_superviseur", scope }),
    extraInfo:()=>"-",
    extraLabel:"Info",
  },
  manager: {
    label:"Manager", emoji:"📋", couleur:"#059669", bg:"#f0fdf4",
    avecCentre:false,
    colonnes:[
      { key:"prenom",    header:"Prénom",    requis:true  },
      { key:"nom",       header:"Nom",       requis:true  },
      { key:"email",     header:"Email",     requis:true  },
      { key:"telephone", header:"Téléphone", requis:false },
      { key:"note",      header:"Note",      requis:false },
    ],
    exemple:["Marie","Dupont","m.dupont@bet-coaching.ci","+225 07 89 12 34","Responsable pédagogie"],
    buildPayload:(f)=>({ prenom:f.prenom, nom:f.nom, email:f.email, telephone:f.telephone||null, role:"manager", scope:["national"], note:f.note||"" }),
    extraInfo:(f)=>f.note||"-",
    extraLabel:"Note",
  },
  gestionnaire: {
    label:"Gestionnaire", emoji:"⚙️", couleur:"#0891b2", bg:"#f0f9ff",
    avecCentre:false,
    colonnes:[
      { key:"prenom",    header:"Prénom",    requis:true  },
      { key:"nom",       header:"Nom",       requis:true  },
      { key:"email",     header:"Email",     requis:true  },
      { key:"telephone", header:"Téléphone", requis:false },
      { key:"note",      header:"Note",      requis:false },
    ],
    exemple:["Sita","Coulibaly","s.coulibaly@bet-coaching.ci","+225 05 67 89 01","Gestion administrative"],
    buildPayload:(f)=>({ prenom:f.prenom, nom:f.nom, email:f.email, telephone:f.telephone||null, role:"gestionnaire", scope:["national"], note:f.note||"" }),
    extraInfo:(f)=>f.note||"-",
    extraLabel:"Note",
  },
  admin: {
    label:"Administrateur", emoji:"🛡️", couleur:"#1B3080", bg:"#eff6ff",
    avecCentre:false,
    colonnes:[
      { key:"prenom",    header:"Prénom",    requis:true  },
      { key:"nom",       header:"Nom",       requis:true  },
      { key:"email",     header:"Email",     requis:true  },
      { key:"telephone", header:"Téléphone", requis:false },
      { key:"note",      header:"Note",      requis:false },
    ],
    exemple:["Jean","Martin","j.martin@bet-coaching.ci","+225 07 45 67 89","Admin pédagogie"],
    buildPayload:(f)=>({ prenom:f.prenom, nom:f.nom, email:f.email, telephone:f.telephone||null, role:"admin", scope:["national"], note:f.note||"" }),
    extraInfo:(f)=>f.note||"-",
    extraLabel:"Note",
  },
  pedagogical_advisor: {
    label:"PA Advisor", emoji:"🎓", couleur:"#d97706", bg:"#fffbeb",
    avecCentre:false,
    colonnes:[
      { key:"prenom",    header:"Prénom",    requis:true  },
      { key:"nom",       header:"Nom",       requis:true  },
      { key:"email",     header:"Email",     requis:true  },
      { key:"telephone", header:"Téléphone", requis:false },
      { key:"note",      header:"Note",      requis:false },
    ],
    exemple:["Adjoua","Traoré","a.traore@bet-coaching.ci","+225 01 45 23 67","Pédagogie avancée"],
    buildPayload:(f)=>({ prenom:f.prenom, nom:f.nom, email:f.email, telephone:f.telephone||null, role:"pedagogical_advisor", scope:["national"], note:f.note||"" }),
    extraInfo:(f)=>f.note||"-",
    extraLabel:"Note",
  },
  onboarding: {
    label:"Assistante Onboarding", emoji:"🎯", couleur:"#e11d48", bg:"#fff1f2",
    avecCentre:false,
    colonnes:[
      { key:"prenom",    header:"Prénom",    requis:true  },
      { key:"nom",       header:"Nom",       requis:true  },
      { key:"email",     header:"Email",     requis:true  },
      { key:"telephone", header:"Téléphone", requis:false },
      { key:"note",      header:"Note",      requis:false },
    ],
    exemple:["Nadia","Konaté","n.konate@bet-coaching.ci","+225 05 34 56 78","Accueil apprenants"],
    buildPayload:(f)=>({ prenom:f.prenom, nom:f.nom, email:f.email, telephone:f.telephone||null, role:"onboarding", scope:["national"], note:f.note||"" }),
    extraInfo:(f)=>f.note||"-",
    extraLabel:"Note",
  },
};

const Modal = ({ title, subtitle, onClose, children, size="md", danger=false }) => {
  const widths = { sm:440, md:580, lg:800, xl:1000, full:"min(98vw,1100px)" };
  return (
    <div style={{ position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(0,0,0,0.6)",display:"flex",justifyContent:"center",alignItems:"center",zIndex:1000,backdropFilter:"blur(4px)" }}>
      <div style={{ background:"#fff",borderRadius:16,width:widths[size]||580,maxHeight:"94vh",overflowY:"auto",maxWidth:"96vw",boxShadow:"0 24px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ padding:"20px 24px", borderBottom:"1px solid #e5e7eb", display:"flex", justifyContent:"space-between", alignItems:"flex-start",
          background: danger?"linear-gradient(135deg,#7f1d1d,#dc2626)":BET_GRAD, borderRadius:"16px 16px 0 0" }}>
          <div>
            <h3 style={{ margin:0,fontSize:17,fontWeight:800,color:"#fff" }}>{title}</h3>
            {subtitle&&<p style={{ margin:"3px 0 0",fontSize:12,color:"rgba(255,255,255,0.65)" }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",width:28,height:28,borderRadius:8,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center" }}>✕</button>
        </div>
        <div style={{ padding:24 }}>{children}</div>
      </div>
    </div>
  );
};

const RoleBadge = ({ role, size="sm" }) => {
  const r = ROLES_DEF[role];
  if (!r) return null;
  const pad = size==="lg" ? "5px 14px" : "2px 9px";
  const fs  = size==="lg" ? 13 : 11;
  return (
    <span style={{ padding:pad, borderRadius:20, fontSize:fs, fontWeight:700, background:r.bg, color:r.color, border:`1px solid ${r.border}`, display:"inline-flex", alignItems:"center", gap:5 }}>
      {r.emoji} {r.label}
    </span>
  );
};

const ToggleSwitch = ({ on, onChange, color=BET, disabled=false }) => (
  <div onClick={()=>!disabled&&onChange(!on)} style={{ width:42, height:24, borderRadius:12, background:on?color:"#d1d5db", cursor:disabled?"not-allowed":"pointer", position:"relative", transition:"background .2s", opacity:disabled?0.5:1, flexShrink:0 }}>
    <div style={{ width:18, height:18, borderRadius:"50%", background:"#fff", position:"absolute", top:3, left:on?21:3, transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,0.25)" }}/>
  </div>
);

const KpiCard = ({ icon, label, value, sub, color, onClick, alert=false }) => (
  <div onClick={onClick} style={{ background:"#fff", borderRadius:14, padding:"18px 20px", border:`1px solid ${alert?"#fecdd3":"#e5e7eb"}`, cursor:onClick?"pointer":"default",
    boxShadow: alert?"0 0 0 2px #fca5a5,0 4px 12px rgba(0,0,0,0.06)":"0 2px 8px rgba(0,0,0,0.04)", display:"flex", alignItems:"center", gap:14 }}>
    <div style={{ width:50, height:50, borderRadius:12, background:color+"15", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0 }}>{icon}</div>
    <div style={{ flex:1, minWidth:0 }}>
      <div style={{ fontSize:11, color:"#9ca3af", fontWeight:500 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:900, color, lineHeight:1.1 }}>{value}</div>
      {sub&&<div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>{sub}</div>}
    </div>
    {alert&&<span style={{ fontSize:18 }}>⚠️</span>}
  </div>
);

const PermCheckbox = ({ on, color, onChange, disabled=false }) => (
  <div onClick={()=>!disabled&&onChange(!on)}
    style={{ width:22, height:22, borderRadius:6, border:`2px solid ${on?color:"#d1d5db"}`, background:on?color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", cursor:disabled?"not-allowed":"pointer", flexShrink:0, transition:"all .15s" }}>
    {on&&<span style={{ color:"#fff", fontSize:12, fontWeight:700 }}>✓</span>}
  </div>
);

// ── Modale exceptions de permissions par utilisateur ─────────────────────────
// Chaque case part de ce que le rôle accorde déjà (permsRoleBase) ou de
// l'exception existante, et se sauvegarde immédiatement au clic
// (permission_exceptions côté serveur - une ligne par module qui remplace
// intégralement les 5 droits du rôle pour ce module, résolue à chaque
// requête : effet immédiat, pas de bouton "Enregistrer").
export function ModalExceptionsUtilisateur({ utilisateur, rolePhysique, permsRoleBase, onFermer }) {
  const modulesRole = modulesPertinents(rolePhysique);
  const [exceptions, setExceptions] = useState([]);
  const [chargement, setChargement] = useState(true);

  const chargerExceptions = useCallback(async () => {
    setChargement(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/permissions-exceptions/${utilisateur.id}`, { headers: authHdrs() });
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
        method: "PUT", headers: authHdrs(),
        body: JSON.stringify({ module: moduleId, permissions }),
      });
      if (r.ok) {
        toast.success(`${accorde ? "Droit accordé" : "Droit retiré"} : "${actionLib}" sur "${moduleLib}" pour ${utilisateur.nom}`, { duration: 4000 });
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

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 }} onClick={onFermer}>
      <div style={{ background:"#fff", borderRadius:16, width:"90vw", height:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 24px 64px rgba(0,0,0,0.28)", overflow:"hidden" }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"18px 24px", borderBottom:"1px solid #e5e7eb", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div style={{ display:"flex", gap:14, alignItems:"center" }}>
            {utilisateur.avatar_url
              ? <img src={utilisateur.avatar_url} alt={utilisateur.nom} style={{ width:44, height:44, borderRadius:"50%", objectFit:"cover", flexShrink:0 }}/>
              : <div style={{ width:44, height:44, borderRadius:"50%", background:`${ROLES_DEF[rolePhysique]?.color||"#1B3080"}18`, color:ROLES_DEF[rolePhysique]?.color||"#1B3080", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:15, flexShrink:0 }}>
                  {(utilisateur.prenom?.[0]||utilisateur.nom?.[0]||"?")}{(utilisateur.nom?.split(" ")?.[1]?.[0]||"")}
                </div>}
            <div>
              <div style={{ fontSize:17, fontWeight:800, color:"#0f172a" }}>🔑 Permissions - {utilisateur.nom}</div>
              <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:8, marginTop:5 }}>
                {utilisateur.email && (
                  <span style={{ fontSize:11.5, color:"#6b7280" }}>✉️ {utilisateur.email}</span>
                )}
                {ROLES_DEF[rolePhysique] && (
                  <span style={{ padding:"2px 9px", borderRadius:20, fontSize:10.5, fontWeight:700, background:ROLES_DEF[rolePhysique].bg, color:ROLES_DEF[rolePhysique].color, border:`1px solid ${ROLES_DEF[rolePhysique].border}` }}>
                    {ROLES_DEF[rolePhysique].emoji} {ROLES_DEF[rolePhysique].label}
                  </span>
                )}
                <span style={{ padding:"2px 9px", borderRadius:20, fontSize:10.5, fontWeight:700, background:utilisateur.actif?"#dcfce7":"#f1f5f9", color:utilisateur.actif?"#166534":"#9ca3af" }}>
                  {utilisateur.actif ? "🟢 Actif" : "⚪ Inactif"}
                </span>
                {(utilisateur.derniere_connexion || utilisateur.dernConn) && (
                  <span style={{ fontSize:11, color:"#9ca3af" }}>Dernier accès : {utilisateur.dernConn || new Date(utilisateur.derniere_connexion).toLocaleString("fr-FR")}</span>
                )}
                {utilisateur.scope && utilisateur.scope.length>0 && !utilisateur.scope.includes("national") && (
                  <span style={{ fontSize:11, color:"#9ca3af" }}>🏢 {utilisateur.scope.join(", ")}</span>
                )}
              </div>
              <div style={{ fontSize:12, color:"#9ca3af", marginTop:6, lineHeight:1.5, maxWidth:600 }}>
                Décochez pour retirer un droit à cette personne, cochez pour lui en accorder un de plus - sans toucher aux autres utilisateurs du même rôle.
              </div>
            </div>
          </div>
          <button onClick={onFermer} style={{ background:"#f3f4f6", border:"none", borderRadius:8, width:30, height:30, cursor:"pointer", fontSize:16, color:"#4b5563", flexShrink:0 }}>×</button>
        </div>
        <div style={{ flex:1, overflowY:"auto" }}>
          {chargement ? (
            <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>⏳ Chargement…</div>
          ) : (
            <div>
              <div style={{ display:"grid", gridTemplateColumns:`2fr repeat(${ACTIONS_PERMISSIONS.length}, 1fr)`, padding:"13px 24px", background:"#f9fafb", borderBottom:"1px solid #e5e7eb", position:"sticky", top:0 }}>
                <span style={{ fontSize:11.5, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.05em" }}>Module</span>
                {ACTIONS_PERMISSIONS.map(a => (
                  <span key={a.key} style={{ fontSize:11.5, fontWeight:700, color:"#6b7280", textAlign:"center", textTransform:"uppercase", letterSpacing:"0.05em" }}>{a.lib}</span>
                ))}
              </div>
              {modulesRole.map((m, i) => {
                const p = permsEffectifs(m.id);
                const estException = exceptions.some(e => e.module === m.id);
                return (
                  <div key={m.id} style={{ display:"grid", gridTemplateColumns:`2fr repeat(${ACTIONS_PERMISSIONS.length}, 1fr)`, padding:"14px 24px", alignItems:"center", borderBottom: i < modulesRole.length-1 ? "1px solid #f3f4f6" : "none", background: estException ? "#EEF2FF30" : "transparent" }}>
                    <span>
                      <span style={{ fontSize:14, fontWeight:600, color:"#0f172a", display:"flex", alignItems:"center", gap:8 }}>
                        <span>{m.icone}</span> {m.lib}
                        {estException && <span style={{ fontSize:10, fontWeight:700, color:"#4338CA", background:"#EEF2FF", padding:"1px 7px", borderRadius:10 }}>modifié</span>}
                      </span>
                      {m.desc && <span style={{ fontSize:11.5, color:"#9ca3af", display:"block", marginTop:2, lineHeight:1.4, maxWidth:340 }}>{m.desc}</span>}
                    </span>
                    {ACTIONS_PERMISSIONS.map(a => {
                      const active = actionsActives(m.id, rolePhysique).includes(a.key);
                      return (
                        <div key={a.key} style={{ display:"flex", justifyContent:"center" }}>
                          {active
                            ? <input type="checkbox" checked={p[a.key]} onChange={() => toggle(m.id, a.key)} style={{ width:18, height:18, cursor:"pointer" }} />
                            : <span title="Aucune route ne vérifie ce droit" style={{ color:"#e5e7eb", fontSize:14 }}>-</span>}
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

/* ═══════════════════════════════════════════════
   PAGE PRINCIPALE
═══════════════════════════════════════════════ */
export default function GestionDroits() {
  const [activeTab, setActiveTab] = useState("vue_ensemble");
  const [users, setUsers]         = useState(USERS_INIT);
  const [auditLog, setAuditLog]   = useState(AUDIT_INIT);
  const [demandes, setDemandes]   = useState(DEMANDES_INIT);
  const [securite, setSecurite]   = useState(SECURITE_INIT);

  /* modals */
  const [showUserModal, setShowUserModal]       = useState(false);
  const [editingUser, setEditingUser]           = useState(null);
  const [showInviteModal, setShowInviteModal]   = useState(false);
  const [showDemandeModal, setShowDemandeModal] = useState(false);
  const [selectedDemande, setSelectedDemande]  = useState(null);
  const [showSecuModal, setShowSecuModal]       = useState(false);
  const [showRevokeModal, setShowRevokeModal]   = useState(false);
  const [userToRevoke, setUserToRevoke]         = useState(null);
  const [exceptionsUser, setExceptionsUser]     = useState(null); // utilisateur ciblé pour la modale d'exceptions

  /* ── Matrice de permissions réelle (permissions_roles, côté serveur) ── */
  const [matrice, setMatrice]                     = useState({});
  const [matriceOriginale, setMatriceOriginale]   = useState({});
  const [matriceChargement, setMatriceChargement] = useState(true);
  const [roleSelectionnePhysique, setRoleSelectionnePhysique] = useState(PHYSICAL_ROLES[0].id);
  const [matriceSaving, setMatriceSaving]         = useState(false);
  const [matriceSauvee, setMatriceSauvee]         = useState(false);

  const chargerMatrice = useCallback(async () => {
    setMatriceChargement(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/permissions-matrice`, { headers: authHdrs() });
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

  /* filtres */
  const [filtreRole, setFiltreRole]   = useState("Tous");
  const [filtreStatut, setFiltreStatut] = useState("Tous");
  const [searchUser, setSearchUser]   = useState("");
  const [filtreAudit, setFiltreAudit] = useState("Tous");

  /* import - sélection de rôle + preview + résultats */
  const [showImportRoleModal, setShowImportRoleModal] = useState(false);
  const [importRole,          setImportRole]          = useState("coach");
  const [importPreviewRows,   setImportPreviewRows]   = useState([]);
  const [showImportPreview,   setShowImportPreview]   = useState(false);
  const [importConfirming,    setImportConfirming]    = useState(false);
  const [importResultats,     setImportResultats]     = useState([]);
  const [showImportResultat,  setShowImportResultat]  = useState(false);

  /* invite form */
  const ROLES_AVEC_CENTRE_GD = ["commercial"];
  const CENTRES_GD = [
    { id:"angre",      label:"BET Angré - Abidjan" },
    { id:"2plateaux",  label:"BET II Plateaux - Abidjan" },
    { id:"yopougon",   label:"BET Yopougon - Abidjan" },
    { id:"koumassi",   label:"BET Koumassi - Abidjan" },
    { id:"abatta",     label:"BET Abatta - Abidjan" },
    { id:"bouake",     label:"BET Bouaké - Bouaké" },
  ];
  const INVITE_INIT = { nom:"", telephone:"", email:"", role:"manager", centre_id:"", accessTemp:"", note:"" };
  const [inviteForm, setInviteForm] = useState(INVITE_INIT);

  /* online simulation */
  const [onlineUsers] = useState([1,2,4,6,8]);

  /* ── Chargement des vrais utilisateurs depuis le backend ── */
  const [loadingUsers, setLoadingUsers] = useState(false);
  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/utilisateurs`, { headers: authHdrs() });
      if (r.ok) {
        const d = await r.json();
        if (d.utilisateurs?.length) {
          setUsers(d.utilisateurs.map(u => ({
            id: u.id || u._id || Date.now(),
            prenom: u.prenom || "",
            nom: `${u.prenom || ""} ${u.nom || ""}`.trim(),
            email: u.email || "",
            role: u.role || "manager",
            actif: u.actif !== undefined ? u.actif : true,
            dernConn: u.derniere_connexion
              ? new Date(u.derniere_connexion).toLocaleString("fr-FR")
              : "Jamais",
            derniere_connexion: u.derniere_connexion || null,
            twofa: u.twofa_active || false,
            ipRestr: false,
            accessTemp: null,
            avatar: ((u.prenom?.[0] || "") + (u.nom?.[0] || "")).toUpperCase() || "??",
            avatar_url: u.avatar_url || null,
            scope: u.scope || null,
            createdAt: u.createdAt || u.created_at || "",
            sessions: 0,
          })));
        }
      }
    } catch { /* garde le mock en cas d'erreur réseau */ }
    finally { setLoadingUsers(false); }
  }, []);
  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  /* ── Stats ── */
  const stats = useMemo(() => ({
    totalAdmin:   users.filter(u=>u.role==="admin"||u.role==="super_admin").length,
    actifs:       users.filter(u=>u.actif).length,
    sans2fa:      users.filter(u=>u.actif&&!u.twofa).length,
    alertes:      auditLog.filter(a=>a.statut==="danger").length,
    enAttente:    demandes.filter(d=>d.statut==="en_attente").length,
    tempAccess:   users.filter(u=>u.accessTemp&&new Date(u.accessTemp)>new Date()).length,
    totalSessions:users.reduce((s,u)=>s+u.sessions,0),
  }), [users, auditLog, demandes]);

  /* ── Computed ── */
  const usersFiltres = useMemo(() => {
    let r = [...users];
    if (filtreRole !== "Tous") r = r.filter(u => u.role === filtreRole);
    if (filtreStatut === "Actifs") r = r.filter(u => u.actif);
    if (filtreStatut === "Inactifs") r = r.filter(u => !u.actif);
    if (filtreStatut === "Sans 2FA") r = r.filter(u => !u.twofa && u.actif);
    if (filtreStatut === "En ligne") r = r.filter(u => onlineUsers.includes(u.id));
    if (searchUser) r = r.filter(u => u.nom.toLowerCase().includes(searchUser.toLowerCase()) || u.email.toLowerCase().includes(searchUser.toLowerCase()));
    return r;
  }, [users, filtreRole, filtreStatut, searchUser, onlineUsers]);

  const auditFiltres = useMemo(() => {
    if (filtreAudit === "Tous") return auditLog;
    return auditLog.filter(a => a.statut === filtreAudit.toLowerCase());
  }, [auditLog, filtreAudit]);

  const addAuditEntry = (action, detail, statut="success") => {
    setAuditLog(prev => [{
      id: Date.now(), acteur:"Binnie Kouassi", role:"super_admin",
      action, detail, date: new Date().toISOString().replace("T"," ").slice(0,16),
      ip:"192.168.1.1", statut,
    }, ...prev]);
  };

  /* ── Handlers ── */
  const toggleUserStatus = (userId) => {
    const u = users.find(x=>x.id===userId);
    setUsers(users.map(x => x.id===userId ? { ...x, actif:!x.actif } : x));
    addAuditEntry(u?.actif?"COMPTE_DESACTIVE":"COMPTE_ACTIVE", `${u?.nom} (${u?.role})`);
    toast.success(u?.actif ? `${u?.nom} désactivé` : `${u?.nom} activé`);
  };

  const revokeSession = (userId) => {
    const u = users.find(x=>x.id===userId);
    setUsers(users.map(x => x.id===userId ? { ...x, sessions:0 } : x));
    addAuditEntry("SESSION_REVOQUEE", `Sessions de ${u?.nom} révoquées`, "warning");
    toast.success(`Sessions révoquées pour ${u?.nom}`);
    setShowRevokeModal(false);
  };

  const sendInvite = async () => {
    if (!inviteForm.nom.trim() || !inviteForm.email.trim()) { toast.error("Nom et email requis"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(inviteForm.email)) { toast.error("Format email invalide"); return; }
    const needsCentre = ROLES_AVEC_CENTRE_GD.includes(inviteForm.role);
    if (needsCentre && !inviteForm.centre_id) { toast.error("Ce rôle nécessite un centre BET"); return; }

    const parts  = inviteForm.nom.trim().split(" ");
    const prenom = parts[0] || "";
    const nom    = parts.slice(1).join(" ") || prenom;
    const scope  = inviteForm.centre_id ? [inviteForm.centre_id] : ["national"];

    try {
      const res = await fetch(`${API_URL}/api/admin/utilisateurs`, {
        method: "POST",
        headers: authHdrs(),
        body: JSON.stringify({ prenom, nom, email: inviteForm.email, telephone: inviteForm.telephone || null, role: inviteForm.role, scope, note: inviteForm.note }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erreur création"); return; }
      addAuditEntry("UTILISATEUR_CREE", `Créé : ${inviteForm.nom} (${inviteForm.role}) · Centre: ${inviteForm.centre_id || "National"} → ${inviteForm.email}`, "success");
      toast.success(`✅ ${inviteForm.nom} créé${data.mdp_temporaire ? ` · MDP: ${data.mdp_temporaire}` : ""}`);
      setShowInviteModal(false);
      setInviteForm(INVITE_INIT);
      fetchUsers();
    } catch (err) { toast.error("Erreur : " + err.message); }
  };

  const handleDemande = (demandeId, action) => {
    const d = demandes.find(x=>x.id===demandeId);
    if (action==="approuver") {
      const newUser = { id:Date.now(), nom:d.nom, email:d.email, role:d.roleDemande, actif:true, dernConn:"Jamais", twofa:false, ipRestr:false, accessTemp:null, avatar:d.nom.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase(), createdAt:new Date().toISOString().split("T")[0], sessions:0 };
      setUsers(prev=>[...prev, newUser]);
      addAuditEntry("DEMANDE_APPROUVEE", `${d.nom} (${d.roleDemande}) - ${d.entreprise}`);
      toast.success(`Accès approuvé pour ${d.nom} ✓`);
    } else {
      addAuditEntry("DEMANDE_REFUSEE", `${d.nom} (${d.roleDemande}) - ${d.entreprise}`, "warning");
      toast(`Demande refusée pour ${d.nom}`);
    }
    setDemandes(prev=>prev.map(x=>x.id===demandeId?{...x,statut:action==="approuver"?"approuve":"refuse"}:x));
    setShowDemandeModal(false);
  };

  const exportUsers = () => {
    exporterExcelStyle({
      nomFichier: `droits_acces_${new Date().toISOString().split("T")[0]}`,
      titre: '🔐 Droits d\'accès - Utilisateurs',
      sousTitre: `${users.length} utilisateur${users.length>1?'s':''} · Généré le ${new Date().toLocaleDateString('fr-FR')}`,
      couleurEntete: '0F172A',
      colonnes: [
        { label: 'Nom', width: 22, bold: true }, { label: 'Email', width: 26 },
        { label: 'Rôle', width: 16 }, { label: 'Actif', width: 10, align: 'center' },
        { label: '2FA', width: 10, align: 'center' }, { label: 'Dernière connexion', width: 18 },
        { label: 'Sessions', width: 12, align: 'center' }, { label: 'Accès temporaire', width: 18 },
      ],
      lignes: users.map(u => [u.nom, u.email, u.role, u.actif?"Oui":"Non", u.twofa?"Oui":"Non", u.dernConn, u.sessions, u.accessTemp||""]),
    });
    toast.success("Export Excel téléchargé ✓");
  };

  const importFileRef = useRef(null);

  /* ── Télécharger le modèle Excel pour le rôle sélectionné ── */
  const telechargerModeleImport = (roleKey) => {
    const rk  = roleKey || importRole;
    const sch = IMPORT_SCHEMAS[rk];
    if (!sch) return;
    const headers = sch.colonnes.map(c => c.header);
    const ws = XLSX.utils.aoa_to_sheet([headers, sch.exemple || headers.map(()=>"")]);
    ws["!cols"] = headers.map(() => ({ wch:18 }));
    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb2, ws, `Import ${sch.label}`);
    XLSX.writeFile(wb2, `modele_import_${rk}_bet.xlsx`);
    toast.success(`Modèle ${sch.label} téléchargé ✓`);
  };

  /* ── Phase 1 : lecture, validation, prévisualisation (multi-profil) ── */
  const lireEtPrevisualiser = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const sch = IMPORT_SCHEMAS[importRole];
    if (!sch) { toast.error("Profil non reconnu"); return; }

    try {
      const buf  = await file.arrayBuffer();
      const wb2  = XLSX.read(buf, { type:"array" });
      const ws   = wb2.Sheets[wb2.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval:"" });
      if (!rows.length) { toast.error("Fichier vide ou non reconnu"); return; }

      const norm = (s) => String(s||"").toLowerCase().trim()
        .replace(/[éèêë]/g,"e").replace(/[àâä]/g,"a").replace(/[ùûü]/g,"u").replace(/[îï]/g,"i").replace(/[ôö]/g,"o")
        .replace(/[^a-z0-9]/g,"_").replace(/_+/g,"_").replace(/^_|_$/g,"");

      const isEmailOk = (em) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em);
      const emailsBase  = new Set(users.map(u => (u.email||"").toLowerCase().trim()));
      const emailsBatch = {};

      rows.forEach(row => {
        const r = {};
        Object.keys(row).forEach(k => { r[norm(k)] = String(row[k]||"").trim(); });
        const em = (r.email || r.e_mail || r.courriel || "").toLowerCase().trim();
        if (em) emailsBatch[em] = (emailsBatch[em] || 0) + 1;
      });

      const emailsVusDansBatch = {};
      const lignes = rows.map((row, idx) => {
        const r = {};
        Object.keys(row).forEach(k => { r[norm(k)] = String(row[k]||"").trim(); });

        const prenom = (r.prenom || r.firstname || "").trim();
        const nom    = (r.nom    || r.lastname  || "").trim();
        const email  = (r.email  || r.e_mail    || r.courriel || "").toLowerCase().trim();
        const tel    = r.telephone || r.tel || "";
        const note   = r.note || r.commentaire || r.comment || "";

        // Centre (uniquement si rôle avecCentre)
        const centreRaw = r.centre_bet || r.centre || r.departement___centre || r.departement || "";
        const centre_id = sch.avecCentre ? _mapCentreGlobal(centreRaw) : null;
        const scope     = centre_id ? [centre_id] : ["national"];

        // Champs spécifiques selon le rôle
        const extra = { note };
        if (importRole === "coach") {
          extra.filiere         = r.filiere         || r.fili_re     || "";
          extra.matricule       = r.matricule       || "";
          extra.specialite      = r.specialite      || r.sp_cialite  || "";
          extra.niveaux         = r.niveaux_enseignes || r.niveaux   || "";
          extra.type_contrat    = r.type_de_contrat || r.type_contrat || r.contrat || "";
          extra.lieu_habitation = r.lieu_d_habitation || r.lieu_habitation || "";
          extra.date_debut_bet  = r.date_debut_bet  || r.date_debut  || "";
          extra.certifications  = r.certifications  || "";
        }
        if (importRole === "commercial") {
          extra.zone = r.zone || "";
        }

        const erreurs = [];
        const avertissements = [];

        if (!prenom)          erreurs.push("Prénom manquant");
        if (!nom)             erreurs.push("Nom manquant");
        if (!email)           erreurs.push("Email manquant");
        else if (!isEmailOk(email)) erreurs.push("Format email invalide");
        else {
          if (emailsBase.has(email)) erreurs.push("Email déjà existant en base");
          if (emailsBatch[email] > 1 && emailsVusDansBatch[email]) erreurs.push("Email en doublon dans le fichier");
        }
        if (email) emailsVusDansBatch[email] = true;
        if (!tel) avertissements.push("Téléphone manquant");
        if (importRole === "coach" && !extra.matricule) avertissements.push("Matricule non renseigné");
        if (sch.avecCentre && !centre_id) avertissements.push("Centre BET non renseigné → périmètre national");

        const fields = { prenom, nom, email, telephone:tel, centre_bet:centreRaw, ...extra };
        const payload = sch.buildPayload(fields, scope);

        return {
          _idx: idx + 2,
          prenom, nom, email, tel, centre_id, scope, ...extra,
          _erreurs: erreurs,
          _avertissements: avertissements,
          _statut: erreurs.length > 0 ? "erreur" : avertissements.length > 0 ? "avertissement" : "ok",
          _payload: payload,
        };
      }).filter(l => l.prenom || l.nom || l.email);

      if (!lignes.length) { toast.error("Aucune ligne exploitable dans le fichier"); return; }
      setImportPreviewRows(lignes);
      setShowImportPreview(true);
    } catch (err) { toast.error("Erreur lecture fichier : " + err.message); }
  };

  /* ── Phase 2 : envoi en base des lignes valides ── */
  const confirmerImport = async () => {
    const lignesValides = importPreviewRows.filter(l => l._statut !== "erreur");
    if (!lignesValides.length) return;
    setImportConfirming(true);
    let ok = 0, fail = 0, resultats = [];
    for (const l of lignesValides) {
      try {
        const res = await fetch(`${API_URL}/api/admin/utilisateurs`, {
          method: "POST",
          headers: authHdrs(),
          body: JSON.stringify(l._payload),
        });
        if (res.ok) {
          const d = await res.json().catch(()=>({}));
          ok++;
          resultats.push({ prenom:l.prenom, nom:l.nom, email:l.email, mdp: d.mdp_temporaire || "-", statut:"ok" });
        } else {
          const d = await res.json().catch(()=>({}));
          fail++;
          resultats.push({ prenom:l.prenom, nom:l.nom, email:l.email, mdp:"-", statut:"erreur", detail: d.error || res.statusText });
        }
      } catch (err) {
        fail++;
        resultats.push({ prenom:l.prenom, nom:l.nom, email:l.email, mdp:"-", statut:"erreur", detail: err.message });
      }
    }
    setImportConfirming(false);
    setShowImportPreview(false);
    setImportPreviewRows([]);
    const roleLabel = IMPORT_SCHEMAS[importRole]?.label || importRole;
    if (ok > 0) {
      toast.success(`${ok} ${roleLabel}(s) créé(s)${fail ? ` · ${fail} erreur(s)` : ""} ✓`);
      fetchUsers();
      addAuditEntry(`IMPORT_${importRole.toUpperCase()}`, `${ok} ${roleLabel}(s) importé(s) depuis Excel${fail ? `, ${fail} erreur(s)` : ""}`, "success");
      setImportResultats(resultats);
      setShowImportResultat(true);
    } else {
      toast.error(`Aucun ${roleLabel} créé - ${fail} erreur(s).`);
    }
  };

  const tabs = [
    { key:"vue_ensemble", label:"Vue d'ensemble",     icon:"🏠" },
    { key:"utilisateurs", label:"Utilisateurs",         icon:"👥", badge: stats.enAttente > 0 ? stats.enAttente : null, danger:true },
    { key:"matrice",      label:"Matrice permissions", icon:"🔐" },
    { key:"securite",     label:"Politiques sécurité", icon:"🛡️", badge: stats.sans2fa > 0 ? stats.sans2fa : null, danger:true },
    { key:"demandes",     label:"Demandes d'accès",    icon:"📬", badge: stats.enAttente > 0 ? stats.enAttente : null, danger:true },
    { key:"audit",        label:"Journal d'audit",     icon:"🕵️", badge: stats.alertes > 0 ? stats.alertes : null, danger:true },
  ];

  /* ══════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════ */
  return (
    <div style={{ display:"flex", minHeight:"100vh", background:"#f0f4ff", fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@700;900&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        @keyframes gdPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes gdFade { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .gd-fade { animation:gdFade .3s ease both; }
        input[type=range] { -webkit-appearance:none; height:5px; border-radius:3px; background:#e5e7eb; cursor:pointer; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:18px; height:18px; border-radius:50%; background:${BET}; cursor:pointer; }
        table { border-collapse:collapse; }
        input:focus,select:focus,textarea:focus { outline:2px solid ${BET}40; outline-offset:1px; }
      `}</style>

      {/* <Sidebar /> */}

      <div style={{ flex:1, overflowX:"hidden" }}>

        {/* ── HERO ── */}
        <div style={{ background:BET_GRAD, padding:"28px 28px 0", color:"#fff", position:"relative", overflow:"hidden" }}>
          {/* deco circles */}
          <div style={{ position:"absolute", top:-50, right:80, width:200, height:200, borderRadius:"50%", border:"1px solid rgba(255,255,255,0.05)" }}/>
          <div style={{ position:"absolute", top:-20, right:120, width:120, height:120, borderRadius:"50%", border:"1px solid rgba(232,39,58,0.15)" }}/>
          <div style={{ position:"absolute", bottom:0, left:"40%", width:100, height:100, borderRadius:"50%", background:"rgba(232,39,58,0.06)" }}/>

          <div style={{ display:"flex", alignItems:"flex-start", gap:20, marginBottom:24, position:"relative", zIndex:1 }}>
            <div style={{ width:54, height:54, borderRadius:14, background:"rgba(232,39,58,0.2)", border:"1px solid rgba(232,39,58,0.4)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, flexShrink:0 }}>🔐</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.45)", letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:4 }}>ADMINISTRATION SYSTÈME</div>
              <h1 style={{ margin:0, fontSize:24, fontWeight:900, fontFamily:"'Playfair Display',serif" }}>Gestion des Droits & Accès</h1>
              <p style={{ fontSize:13, color:"rgba(255,255,255,0.6)", marginTop:4 }}>Contrôle total des rôles, permissions et politiques de sécurité de la plateforme BET</p>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"rgba(255,255,255,0.7)" }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:"#22c55e", display:"inline-block", animation:"gdPulse 2s infinite" }}/>
                {onlineUsers.length} utilisateurs en ligne
              </div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginTop:4 }}>Dernière mise à jour : il y a 3 min</div>
            </div>
          </div>

          {/* KPI Strip */}
          <div style={{ display:"flex", background:"rgba(0,0,0,0.2)", borderRadius:"10px 10px 0 0", overflow:"hidden" }}>
            {[
              { l:"Utilisateurs actifs",   v:stats.actifs,       c:"#60a5fa" },
              { l:"En ligne maintenant",   v:onlineUsers.length, c:"#34d399" },
              { l:"Sessions ouvertes",     v:stats.totalSessions,c:"#a78bfa" },
              { l:"Sans 2FA ⚠️",          v:stats.sans2fa,      c:stats.sans2fa>0?"#f87171":"#6ee7b7" },
              { l:"Demandes en attente",   v:stats.enAttente,    c:stats.enAttente>0?"#fbbf24":"#6ee7b7" },
              { l:"Alertes sécurité",      v:stats.alertes,      c:stats.alertes>0?"#f87171":"#6ee7b7" },
            ].map((s,i,arr)=>(
              <div key={s.l} style={{ flex:1, textAlign:"center", padding:"12px 6px", borderRight:i<arr.length-1?"1px solid rgba(255,255,255,0.06)":"none" }}>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginBottom:2 }}>{s.l}</div>
                <div style={{ fontSize:20, fontWeight:800, color:s.c }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding:"0 24px 32px" }}>
          {/* ── TABS ── */}
          <div style={{ display:"flex", gap:3, paddingTop:18, flexWrap:"wrap", marginBottom:0 }}>
            {tabs.map(tab => {
              const ia = activeTab === tab.key;
              return (
                <button key={tab.key} onClick={()=>setActiveTab(tab.key)} style={{ padding:"9px 15px", borderRadius:"8px 8px 0 0", border:"none", cursor:"pointer", fontWeight:600, fontSize:12, background:ia?"#fff":"#e0e7ff", color:ia?BET:"#4338ca", boxShadow:ia?"0 -2px 8px rgba(27,48,128,0.1)":"none", display:"flex", alignItems:"center", justifyContent:"center", gap:5, fontFamily:"'DM Sans',sans-serif", flex:"1 1 130px", whiteSpace:"nowrap" }}>
                  <span style={{ fontSize:14 }}>{tab.icon}</span>{tab.label}
                  {tab.badge&&<span style={{ padding:"1px 6px", borderRadius:9, fontSize:10, fontWeight:700, background:tab.danger?"#fee2e2":"#e0e7ff", color:tab.danger?"#dc2626":"#4338ca" }}>{tab.badge}</span>}
                </button>
              );
            })}
          </div>

          <div style={{ background:"#fff", borderRadius:"0 12px 12px 12px", padding:26, boxShadow:"0 2px 10px rgba(0,0,0,0.05)", border:"1px solid #e5e7eb" }}>

            {/* ══ VUE D'ENSEMBLE ══ */}
            {activeTab==="vue_ensemble" && (
              <div className="gd-fade">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:22 }}>
                  <div>
                    <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:"#0f172a" }}>Vue d'ensemble - Contrôle d'accès</h2>
                    <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Tableau de bord de sécurité en temps réel</p>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={()=>setShowInviteModal(true)} style={btnPrimary}>+ Inviter un utilisateur</button>
                  </div>
                </div>

                {/* KPI Cards */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:14, marginBottom:26 }}>
                  <KpiCard icon="👥" label="Utilisateurs totaux"  value={users.length}       color={BET}      sub={`${stats.actifs} actifs`} onClick={()=>setActiveTab("utilisateurs")} />
                  <KpiCard icon="🟢" label="Connexions actives"   value={onlineUsers.length}  color="#22c55e"  sub="En ce moment" />
                  <KpiCard icon="🔐" label="Sans 2FA activé"      value={stats.sans2fa}       color={stats.sans2fa>0?BET_RED:BET} sub="Utilisateurs à risque" alert={stats.sans2fa>2} onClick={()=>setActiveTab("securite")} />
                  <KpiCard icon="📬" label="Demandes en attente"  value={stats.enAttente}     color="#d97706"  sub="À traiter" onClick={()=>setActiveTab("demandes")} alert={stats.enAttente>0} />
                  <KpiCard icon="⚠️" label="Alertes sécurité"    value={stats.alertes}       color={BET_RED}  sub="Dernières 48h" alert={stats.alertes>0} onClick={()=>setActiveTab("audit")} />
                  <KpiCard icon="⏳" label="Accès temporaires"   value={stats.tempAccess}    color="#7c3aed"  sub="Actifs" />
                </div>

                {/* Répartition par rôle */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
                  <div>
                    <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:14 }}>Répartition par rôle</h3>
                    {Object.values(ROLES_DEF).reverse().map(r => {
                      const count = users.filter(u=>u.role===r.id).length;
                      const pct = users.length ? Math.round((count/users.length)*100) : 0;
                      return (
                        <div key={r.id} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12, padding:"10px 14px", borderRadius:10, background:`${r.color}06`, border:`1px solid ${r.border}`, cursor:"pointer" }}
                          onClick={()=>{ setFiltreRole(r.id); setActiveTab("utilisateurs"); }}>
                          <span style={{ fontSize:20 }}>{r.emoji}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                              <span style={{ fontWeight:600, fontSize:13, color:"#0f172a" }}>{r.label}</span>
                              <span style={{ fontWeight:800, color:r.color, fontSize:14 }}>{count}</span>
                            </div>
                            <div style={{ height:5, background:"#e5e7eb", borderRadius:3, overflow:"hidden" }}>
                              <div style={{ height:"100%", width:`${pct}%`, background:r.color, borderRadius:3 }}/>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Activité récente */}
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                      <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", margin:0 }}>Activité récente</h3>
                      <button onClick={()=>setActiveTab("audit")} style={btnGhost}>Voir tout →</button>
                    </div>
                    {auditLog.slice(0,5).map(a => {
                      const colors = { success:"#059669", danger:BET_RED, warning:"#d97706" };
                      const bgs    = { success:"#f0fdf4", danger:"#fff1f2", warning:"#fff7ed" };
                      const icons  = { success:"✅", danger:"🚨", warning:"⚠️" };
                      return (
                        <div key={a.id} style={{ display:"flex", gap:10, padding:"9px 12px", borderRadius:9, background:bgs[a.statut]||"#f8fafc", border:`1px solid ${a.statut==="danger"?"#fecdd3":a.statut==="warning"?"#fed7aa":"#e5e7eb"}`, marginBottom:8 }}>
                          <span style={{ fontSize:16 }}>{icons[a.statut]||"ℹ️"}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:12, fontWeight:600, color:"#0f172a" }}>{a.action.replace(/_/g," ")}</div>
                            <div style={{ fontSize:11, color:"#6b7280", marginTop:1 }}>{a.detail.slice(0,55)}{a.detail.length>55?"…":""}</div>
                          </div>
                          <div style={{ fontSize:10, color:"#9ca3af", flexShrink:0 }}>{a.date.slice(11,16)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ══ UTILISATEURS ══ */}
            {activeTab==="utilisateurs" && (
              <div className="gd-fade">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                  <div>
                    <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:"#0f172a" }}>Utilisateurs administratifs</h2>
                    <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>
                      {loadingUsers ? "Chargement…" : `${usersFiltres.length} affiché(s) sur ${users.length}`}
                    </p>
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <button onClick={exportUsers} style={btnSecondary}>⬇️ Export CSV</button>
                    <button onClick={() => setShowImportRoleModal(true)} style={{ padding:"8px 14px", borderRadius:8, border:"1.5px solid #bbf7d0", background:"#f0fdf4", color:"#16a34a", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                      📥 Importer (Excel)
                    </button>
                    <button onClick={()=>setShowInviteModal(true)} style={btnPrimary}>+ Inviter</button>
                  </div>
                </div>

                {/* Barre info import */}
                <div style={{ background:"#f0f9ff", borderRadius:9, padding:"9px 14px", border:"1px solid #bae6fd", fontSize:11, color:"#0369a1", marginBottom:14, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                  <span>💡</span>
                  <span>Import Excel multi-profil - cliquez <strong>📥 Importer</strong> pour choisir le type de profil. Chaque rôle a son propre modèle avec des colonnes adaptées.</span>
                  <span style={{ marginLeft:"auto", color:"#0891b2", fontWeight:700, whiteSpace:"nowrap" }}>→ Le modèle Excel est fourni dans le sélecteur</span>
                </div>

                {/* Filtres */}
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:18 }}>
                  <input type="text" placeholder="🔍 Nom ou email…" value={searchUser} onChange={e=>setSearchUser(e.target.value)} style={{ ...inputSt, width:200, marginBottom:0 }}/>
                  <div style={{ display:"flex", gap:5 }}>
                    {["Tous","super_admin","admin","manager"].map(r=>(
                      <button key={r} onClick={()=>setFiltreRole(r)} style={{ padding:"5px 12px", borderRadius:20, border:"1px solid", fontSize:11, fontWeight:600, cursor:"pointer",
                        background:filtreRole===r?(ROLES_DEF[r]?.color||BET):"#fff",
                        color:filtreRole===r?"#fff":"#6b7280",
                        borderColor:filtreRole===r?(ROLES_DEF[r]?.color||BET):"#e5e7eb" }}>
                        {r==="Tous"?"Tous":ROLES_DEF[r]?.emoji+" "+ROLES_DEF[r]?.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display:"flex", gap:5 }}>
                    {["Tous","Actifs","Inactifs","Sans 2FA","En ligne"].map(s=>(
                      <button key={s} onClick={()=>setFiltreStatut(s)} style={{ padding:"5px 12px", borderRadius:20, border:"1px solid", fontSize:11, cursor:"pointer",
                        background:filtreStatut===s?BET:"#fff", color:filtreStatut===s?"#fff":"#6b7280",
                        borderColor:filtreStatut===s?BET:"#e5e7eb" }}>{s}</button>
                    ))}
                  </div>
                </div>

                {/* Table */}
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}><thead>
                    <tr style={{ background:"#f9fafb" }}>
                      {["Utilisateur","Rôle","Statut","2FA","Sessions","Dernier accès","Accès temp.","Actions"].map(h=>(
                        <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontSize:11, color:"#6b7280", fontWeight:600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead><tbody>
                    {usersFiltres.map(u=>{
                      const r=ROLES_DEF[u.role];
                      const isOnline=onlineUsers.includes(u.id);
                      const isExpired=u.accessTemp&&new Date(u.accessTemp)<new Date();
                      return (
                        <tr key={u.id} style={{ borderTop:"1px solid #f1f5f9", background:!u.actif?"#f9fafb":"#fff" }}>
                          <td style={{ padding:"12px", verticalAlign:"middle" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <div style={{ position:"relative" }}>
                                <div style={{ width:36, height:36, borderRadius:"50%", background:`${r?.color||BET}18`, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:12, color:r?.color||BET }}>
                                  {u.avatar}
                                </div>
                                {isOnline&&<div style={{ position:"absolute", bottom:0, right:0, width:10, height:10, borderRadius:"50%", background:"#22c55e", border:"2px solid #fff" }}/>}
                              </div>
                              <div>
                                <div style={{ fontWeight:600, fontSize:13 }}>{u.nom}</div>
                                <div style={{ fontSize:11, color:"#9ca3af" }}>{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding:"12px", verticalAlign:"middle" }}><RoleBadge role={u.role}/></td>
                          <td style={{ padding:"12px", verticalAlign:"middle" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <ToggleSwitch on={u.actif} onChange={()=>toggleUserStatus(u.id)} color="#22c55e"/>
                              <span style={{ fontSize:11, color:u.actif?"#22c55e":"#9ca3af", fontWeight:600 }}>{u.actif?"Actif":"Inactif"}</span>
                            </div>
                          </td>
                          <td style={{ padding:"12px", verticalAlign:"middle" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <ToggleSwitch on={u.twofa} onChange={()=>{ setUsers(users.map(x=>x.id===u.id?{...x,twofa:!x.twofa}:x)); addAuditEntry("2FA_MODIFIE",`${u.nom} : 2FA ${!u.twofa?"activé":"désactivé"}`,"warning"); toast(`2FA ${!u.twofa?"activé":"désactivé"} pour ${u.nom}`); }} color={BET}/>
                              {!u.twofa&&u.actif&&<span style={{ fontSize:10, color:BET_RED, fontWeight:700 }}>⚠️</span>}
                            </div>
                          </td>
                          <td style={{ padding:"12px", verticalAlign:"middle" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <span style={{ fontWeight:700, color:u.sessions>0?BET:"#9ca3af" }}>{u.sessions}</span>
                              {u.sessions>0&&(
                                <button onClick={()=>{ setUserToRevoke(u); setShowRevokeModal(true); }} style={{ padding:"2px 7px", borderRadius:5, background:"#fff1f2", border:"1px solid #fecdd3", color:BET_RED, fontSize:10, cursor:"pointer", fontWeight:600 }}>Révoquer</button>
                              )}
                            </div>
                          </td>
                          <td style={{ padding:"12px", fontSize:12, color:"#6b7280", verticalAlign:"middle" }}>
                            {u.dernConn==="Jamais"?<span style={{ color:"#9ca3af", fontSize:11 }}>Jamais connecté</span>:u.dernConn}
                          </td>
                          <td style={{ padding:"12px", verticalAlign:"middle" }}>
                            {u.accessTemp ? (
                              <span style={{ fontSize:11, padding:"2px 7px", borderRadius:8, background:isExpired?"#fee2e2":"#fef3c7", color:isExpired?"#dc2626":"#92400e", fontWeight:600 }}>
                                {isExpired?"Expiré":"⏳ "+(new Date(u.accessTemp)).toLocaleDateString("fr-FR")}
                              </span>
                            ) : <span style={{ color:"#d1d5db", fontSize:11 }}>Permanent</span>}
                          </td>
                          <td style={{ padding:"12px", verticalAlign:"middle" }}>
                            <div style={{ display:"flex", gap:5 }}>
                              <button onClick={()=>{ setEditingUser(u); setShowUserModal(true); }} style={btnIconEdit} title="Modifier">✏️</button>
                              <button onClick={()=>setExceptionsUser(u)} style={btnIconEdit} title="Voir/modifier ses permissions">🔐</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody></table>
                </div>
              </div>
            )}

            {/* ══ MATRICE DES PERMISSIONS ══ */}
            {activeTab==="matrice" && (() => {
              const roleInfo = PHYSICAL_ROLES.find(r => r.id === roleSelectionnePhysique) || PHYSICAL_ROLES[0];
              const permsRole = matrice[roleSelectionnePhysique] || {};
              const modulesRole = modulesPertinents(roleSelectionnePhysique);
              const nbModulesActifs = modulesRole.filter(m => {
                const p = permsRole[m.id];
                return p && (p.read || p.create || p.update || p.delete || p.manage);
              }).length;
              const usersDuRole = users.filter(u => u.role === roleSelectionnePhysique);

              function toggleAction(moduleId, actionKey) {
                setMatrice(prev => {
                  const roleMap = { ...(prev[roleSelectionnePhysique] || {}) };
                  const modulePerm = { read:false, create:false, update:false, delete:false, manage:false, ...(roleMap[moduleId] || {}) };
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
                    method:"PUT", headers: authHdrs(),
                    body: JSON.stringify({ role: roleSelectionnePhysique, permissions: permsRole }),
                  });
                  if (!r.ok) {
                    const err = await r.json().catch(() => ({}));
                    toast.error(err.error || "Impossible d'enregistrer");
                    return;
                  }
                  setMatriceOriginale(prev => ({ ...prev, [roleSelectionnePhysique]: permsRole }));
                  addAuditEntry("PERMISSIONS_SAUVEGARDEES", `Matrice de permissions mise à jour - Rôle : ${roleInfo.lib}`);
                  setMatriceSauvee(true);
                  toast.success("Permissions sauvegardées ✓");
                  setTimeout(() => setMatriceSauvee(false), 2500);
                } finally {
                  setMatriceSaving(false);
                }
              }

              return (
                <div className="gd-fade">
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                    <div>
                      <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:"#0f172a" }}>Matrice des Permissions</h2>
                      <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Droits réels par rôle - connectée à <code>permissions_roles</code>, effet immédiat sur toutes les routes protégées.</p>
                    </div>
                  </div>

                  <div style={{ display:"flex", gap:20, alignItems:"flex-start" }}>

                    {/* ── Panneau gauche : sélection du rôle ── */}
                    <div style={{ width:230, flexShrink:0, background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
                      <div style={{ padding:"14px 16px", borderBottom:"1px solid #f3f4f6", fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.06em" }}>
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
                          <button key={r.id} onClick={() => setRoleSelectionnePhysique(r.id)} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"9px 14px", border:"none", background: actif ? r.couleur+"15" : "transparent", borderLeft:`3px solid ${actif ? r.couleur : "transparent"}`, cursor:"pointer", transition:"all .12s" }}>
                            <div style={{ width:8, height:8, borderRadius:"50%", background:r.couleur, flexShrink:0 }} />
                            <span style={{ fontSize:12, fontWeight: actif?700:500, color: actif ? r.couleur : "#0f172a", flex:1, textAlign:"left", lineHeight:1.3 }}>{r.lib}</span>
                            <span style={{ fontSize:10, fontWeight:700, color: actif ? r.couleur : "#9ca3af", background: actif ? r.couleur+"20" : "#f3f4f6", padding:"1px 6px", borderRadius:10, flexShrink:0 }}>{n}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* ── Panneau droit : permissions du rôle sélectionné ── */}
                    <div style={{ flex:1, minWidth:0 }}>

                      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", padding:"16px 20px", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                          <div style={{ width:36, height:36, borderRadius:10, background:roleInfo.couleur+"20", display:"flex", alignItems:"center", justifyContent:"center" }}>
                            <div style={{ width:12, height:12, borderRadius:"50%", background:roleInfo.couleur }} />
                          </div>
                          <div>
                            <div style={{ fontSize:15, fontWeight:700, color:"#0f172a" }}>{roleInfo.lib}</div>
                            <div style={{ fontSize:12, color:"#9ca3af" }}>{nbModulesActifs} module{nbModulesActifs>1?"s":""} avec accès</div>
                          </div>
                        </div>
                        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                          {matriceSauvee && <span style={{ fontSize:12, fontWeight:600, color:"#16a34a", background:"#dcfce7", padding:"5px 12px", borderRadius:8 }}>✓ Sauvegardé</span>}
                          {matriceModifiee && (
                            <button onClick={reinitialiserRole} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid #e5e7eb", background:"#fff", color:"#4b5563", fontSize:12, fontWeight:600, cursor:"pointer" }}>Réinitialiser</button>
                          )}
                          <button onClick={sauvegarderMatrice} disabled={!matriceModifiee || matriceSaving} style={{ padding:"7px 16px", borderRadius:8, border:"none", background: (matriceModifiee && !matriceSaving) ? roleInfo.couleur : "#e5e7eb", color: (matriceModifiee && !matriceSaving) ? "#fff" : "#9ca3af", fontSize:12, fontWeight:700, cursor: (matriceModifiee && !matriceSaving) ? "pointer" : "default" }}>
                            {matriceSaving ? "Enregistrement…" : "💾 Sauvegarder"}
                          </button>
                        </div>
                      </div>

                      {matriceChargement ? (
                        <div style={{ padding:"40px 20px", textAlign:"center", color:"#9ca3af" }}>⏳ Chargement de la matrice…</div>
                      ) : (
                        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
                          <div style={{ display:"grid", gridTemplateColumns:`2fr repeat(${ACTIONS_PERMISSIONS.length}, 90px)`, padding:"11px 18px", background:"#f9fafb", borderBottom:"1px solid #e5e7eb" }}>
                            <span style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.05em" }}>Module</span>
                            {ACTIONS_PERMISSIONS.map(a => (
                              <span key={a.key} style={{ fontSize:11, fontWeight:700, color:"#6b7280", textAlign:"center", textTransform:"uppercase", letterSpacing:"0.05em" }}>{a.lib}</span>
                            ))}
                          </div>
                          {modulesRole.map((m, i) => {
                            const p = permsRole[m.id] || {};
                            return (
                              <div key={m.id} style={{ display:"grid", gridTemplateColumns:`2fr repeat(${ACTIONS_PERMISSIONS.length}, 90px)`, padding:"11px 18px", alignItems:"center", borderBottom: i<modulesRole.length-1 ? "1px solid #f3f4f6" : "none" }}>
                                <span>
                                  <span style={{ fontSize:13, fontWeight:600, color:"#0f172a", display:"flex", alignItems:"center", gap:8 }}>
                                    <span>{m.icone}</span> {m.lib}
                                  </span>
                                  {m.desc && <span style={{ fontSize:11, color:"#9ca3af", display:"block", marginTop:2, lineHeight:1.4, maxWidth:320 }}>{m.desc}</span>}
                                </span>
                                {ACTIONS_PERMISSIONS.map(a => {
                                  const actif = !!p[a.key];
                                  const active = actionsActives(m.id, roleSelectionnePhysique).includes(a.key);
                                  if (!active) {
                                    return (
                                      <div key={a.key} style={{ display:"flex", justifyContent:"center" }}>
                                        <span title="Aucune route ne vérifie ce droit" style={{ color:"#e5e7eb", fontSize:14 }}>-</span>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div key={a.key} style={{ display:"flex", justifyContent:"center" }}>
                                      <div onClick={() => toggleAction(m.id, a.key)} style={{ width:36, height:20, borderRadius:10, background: actif ? roleInfo.couleur : "#e5e7eb", position:"relative", cursor:"pointer", transition:"background .15s", flexShrink:0 }}>
                                        <div style={{ position:"absolute", top:2, left: actif?18:2, width:16, height:16, borderRadius:"50%", background:"#fff", boxShadow:"0 1px 3px rgba(0,0,0,0.2)", transition:"left .15s" }} />
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
                      {!matriceChargement && (
                        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", overflow:"hidden", marginTop:16, boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
                          <div style={{ padding:"12px 18px", background:"#f9fafb", borderBottom:"1px solid #e5e7eb" }}>
                            <span style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.05em" }}>
                              Utilisateurs de ce rôle - cliquer pour gérer ses exceptions ({usersDuRole.length})
                            </span>
                          </div>
                          {usersDuRole.length === 0 ? (
                            <div style={{ padding:"20px 18px", fontSize:12, color:"#9ca3af", fontStyle:"italic" }}>Aucun utilisateur avec ce rôle pour l'instant.</div>
                          ) : (
                            usersDuRole.map((u, i) => (
                              <div key={u.id} onClick={() => setExceptionsUser(u)} style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 18px", borderBottom: i<usersDuRole.length-1 ? "1px solid #f3f4f6" : "none", cursor:"pointer" }}>
                                {u.avatar_url
                                  ? <img src={u.avatar_url} alt={u.nom} style={{ width:32, height:32, borderRadius:"50%", objectFit:"cover", flexShrink:0 }}/>
                                  : <div style={{ width:32, height:32, borderRadius:"50%", background:roleInfo.couleur+"20", color:roleInfo.couleur, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:12, flexShrink:0 }}>{u.avatar}</div>}
                                <div style={{ flex:1 }}>
                                  <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{u.nom}</div>
                                  <div style={{ fontSize:11, color:"#9ca3af" }}>{u.email}</div>
                                </div>
                                <span style={{ fontSize:11, fontWeight:700, color:"#4338CA" }}>🔑 Exceptions →</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ══ SÉCURITÉ ══ */}
            {activeTab==="securite" && (
              <div className="gd-fade">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:22 }}>
                  <div>
                    <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:"#0f172a" }}>Politiques de Sécurité</h2>
                    <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Configurez les règles de sécurité par rôle</p>
                  </div>
                  <button onClick={()=>{ addAuditEntry("POLITIQUES_SAUVEGARDEES","Politiques de sécurité mises à jour"); toast.success("Politiques sauvegardées ✓"); }} style={btnPrimary}>💾 Sauvegarder toutes les politiques</button>
                </div>

                {stats.sans2fa > 0 && (
                  <div style={{ padding:"14px 18px", borderRadius:12, background:"#fff7ed", border:"1px solid #fed7aa", marginBottom:20, display:"flex", gap:12, alignItems:"center" }}>
                    <span style={{ fontSize:22 }}>⚠️</span>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14, color:"#92400e" }}>{stats.sans2fa} utilisateur(s) actif(s) sans authentification 2FA</div>
                      <div style={{ fontSize:12, color:"#b45309" }}>Renforcez la sécurité en forçant le 2FA pour ces comptes.</div>
                    </div>
                    <button onClick={()=>{ setUsers(prev=>prev.map(u=>({...u,twofa:u.actif?true:u.twofa}))); addAuditEntry("2FA_FORCE_GLOBAL","2FA activé de force sur tous les comptes actifs"); toast.success(`2FA forcé sur ${stats.sans2fa} compte(s) ✓`); }} style={{ ...btnPrimary, marginLeft:"auto", background:BET_RED, whiteSpace:"nowrap" }}>
                      🔒 Forcer le 2FA sur tous
                    </button>
                  </div>
                )}

                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:18 }}>
                  {Object.entries(securite).map(([roleId, pol]) => {
                    const r = ROLES_DEF[roleId];
                    return (
                      <div key={roleId} style={{ borderRadius:14, border:`1.5px solid ${r.border}`, padding:20, background:"#fff" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:18, paddingBottom:14, borderBottom:`1px solid ${r.border}` }}>
                          <span style={{ fontSize:24 }}>{r.emoji}</span>
                          <div>
                            <div style={{ fontWeight:700, fontSize:15, color:r.color }}>{r.label}</div>
                            <div style={{ fontSize:11, color:"#9ca3af" }}>Niveau {r.niveau} · {users.filter(u=>u.role===roleId).length} utilisateur(s)</div>
                          </div>
                        </div>

                        {/* 2FA */}
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600, color:"#0f172a" }}>🔐 2FA obligatoire</div>
                            <div style={{ fontSize:11, color:"#9ca3af" }}>Authentification à 2 facteurs</div>
                          </div>
                          <ToggleSwitch on={pol.twofa_obligatoire} color={r.color} onChange={(v)=>{ setSecurite(prev=>({...prev,[roleId]:{...prev[roleId],twofa_obligatoire:v}})); addAuditEntry("POLITIQUE_2FA",`${r.label} : 2FA obligatoire → ${v?"activé":"désactivé"}`,"warning"); }}/>
                        </div>

                        {/* Expiration session */}
                        <div style={{ marginBottom:14 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5 }}>
                            <span style={{ fontWeight:600, color:"#374151" }}>⏱ Expiration session</span>
                            <strong style={{ color:r.color }}>{pol.expiration_session} min</strong>
                          </div>
                          <input type="range" min={15} max={480} step={15} value={pol.expiration_session}
                            onChange={e=>setSecurite(prev=>({...prev,[roleId]:{...prev[roleId],expiration_session:Number(e.target.value)}}))}/>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#d1d5db", marginTop:2 }}><span>15 min</span><span>8h</span></div>
                        </div>

                        {/* Tentatives max */}
                        <div style={{ marginBottom:14 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5 }}>
                            <span style={{ fontWeight:600, color:"#374151" }}>🔄 Tentatives max</span>
                            <strong style={{ color:r.color }}>{pol.tentatives_max}</strong>
                          </div>
                          <input type="range" min={2} max={10} step={1} value={pol.tentatives_max}
                            onChange={e=>setSecurite(prev=>({...prev,[roleId]:{...prev[roleId],tentatives_max:Number(e.target.value)}}))}/>
                        </div>

                        {/* Rotation mot de passe */}
                        <div style={{ marginBottom:14 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5 }}>
                            <span style={{ fontWeight:600, color:"#374151" }}>🔑 Rotation mdp</span>
                            <strong style={{ color:r.color }}>{pol.rotation_pwd_jours} jours</strong>
                          </div>
                          <input type="range" min={30} max={365} step={30} value={pol.rotation_pwd_jours}
                            onChange={e=>setSecurite(prev=>({...prev,[roleId]:{...prev[roleId],rotation_pwd_jours:Number(e.target.value)}}))}/>
                        </div>

                        {/* Complexité */}
                        <div style={{ marginBottom:10 }}>
                          <label style={{ fontSize:12, fontWeight:600, color:"#374151", display:"block", marginBottom:5 }}>🛡️ Complexité mot de passe</label>
                          <select value={pol.complexite_pwd} onChange={e=>setSecurite(prev=>({...prev,[roleId]:{...prev[roleId],complexite_pwd:e.target.value}}))} style={inputSt}>
                            <option value="normale">Normale (8 car. minimum)</option>
                            <option value="moyenne">Moyenne (12 car. + chiffres)</option>
                            <option value="haute">Haute (12 car. + spéciaux)</option>
                            <option value="tres_haute">Très haute (16 car. + tout)</option>
                          </select>
                        </div>

                        {/* IP restriction */}
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600, color:"#0f172a" }}>🌐 Restriction IP</div>
                            <div style={{ fontSize:11, color:"#9ca3af" }}>Limiter aux IPs autorisées</div>
                          </div>
                          <ToggleSwitch on={pol.ip_restriction} color={r.color} onChange={(v)=>setSecurite(prev=>({...prev,[roleId]:{...prev[roleId],ip_restriction:v}}))}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ══ DEMANDES D'ACCÈS ══ */}
            {activeTab==="demandes" && (
              <div className="gd-fade">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:22 }}>
                  <div>
                    <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:"#0f172a" }}>Demandes d'accès</h2>
                    <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>{demandes.filter(d=>d.statut==="en_attente").length} demande(s) en attente de traitement</p>
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))", gap:16 }}>
                  {demandes.map(d=>{
                    const r=ROLES_DEF[d.roleDemande];
                    const statutMeta = { en_attente:{ bg:"#fef3c7",c:"#92400e",label:"⏳ En attente" }, approuve:{ bg:"#dcfce7",c:"#166534",label:"✅ Approuvé" }, refuse:{ bg:"#fee2e2",c:"#991b1b",label:"❌ Refusé" } };
                    const sm=statutMeta[d.statut];
                    return (
                      <div key={d.id} style={{ borderRadius:14, border:`1.5px solid ${d.statut==="en_attente"?r?.border:"#e5e7eb"}`, background:"#fff", overflow:"hidden" }}>
                        <div style={{ height:4, background:d.statut==="en_attente"?r?.color||BET:d.statut==="approuve"?"#22c55e":"#9ca3af" }}/>
                        <div style={{ padding:18 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                              <div style={{ width:40, height:40, borderRadius:"50%", background:`${r?.color||BET}15`, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:13, color:r?.color||BET }}>
                                {d.nom.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>{d.nom}</div>
                                <div style={{ fontSize:11, color:"#9ca3af" }}>{d.email}</div>
                              </div>
                            </div>
                            <span style={{ padding:"3px 9px", borderRadius:10, fontSize:11, fontWeight:700, background:sm.bg, color:sm.c }}>{sm.label}</span>
                          </div>
                          <div style={{ marginBottom:10 }}>
                            <div style={{ fontSize:11, color:"#9ca3af", marginBottom:5 }}>Entreprise · Date</div>
                            <div style={{ fontSize:13, color:"#374151" }}>🏢 {d.entreprise} · 📅 {fmtDate(d.date)}</div>
                          </div>
                          <div style={{ marginBottom:10 }}>
                            <div style={{ fontSize:11, color:"#9ca3af", marginBottom:5 }}>Rôle demandé</div>
                            <RoleBadge role={d.roleDemande}/>
                          </div>
                          <div style={{ padding:"9px 12px", borderRadius:8, background:"#f8fafc", fontSize:12, color:"#374151", lineHeight:1.5, marginBottom:14 }}>
                            💬 {d.justification}
                          </div>
                          {d.statut==="en_attente"&&(
                            <div style={{ display:"flex", gap:8 }}>
                              <button onClick={()=>handleDemande(d.id,"approuver")} style={{ ...btnPrimary, flex:1, textAlign:"center", background:"#22c55e" }}>✅ Approuver</button>
                              <button onClick={()=>handleDemande(d.id,"refuser")} style={{ ...btnSecondary, flex:1, textAlign:"center", background:"#fee2e2", color:BET_RED, border:`1px solid #fecdd3` }}>❌ Refuser</button>
                              <button onClick={()=>{ setSelectedDemande(d); setShowDemandeModal(true); }} style={{ ...btnSecondary, padding:"9px 11px" }}>🔍</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ══ AUDIT LOG ══ */}
            {activeTab==="audit" && (
              <div className="gd-fade">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                  <div>
                    <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:"#0f172a" }}>Journal d'Audit</h2>
                    <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Traçabilité complète de toutes les actions administratives</p>
                  </div>
                  <button onClick={()=>{
                  exporterExcelStyle({
                    nomFichier: `audit_log_${new Date().toISOString().split("T")[0]}`,
                    titre: "📜 Journal d'audit",
                    sousTitre: `${auditLog.length} entrée${auditLog.length>1?'s':''} · Généré le ${new Date().toLocaleDateString('fr-FR')}`,
                    couleurEntete: '0F172A',
                    colonnes: [
                      { label: 'Acteur', width: 22, bold: true }, { label: 'Rôle', width: 16 },
                      { label: 'Action', width: 20 }, { label: 'Détail', width: 36 },
                      { label: 'Date', width: 16 }, { label: 'IP', width: 14 }, { label: 'Statut', width: 12 },
                    ],
                    lignes: auditLog.map(a => [a.acteur, a.role, a.action, a.detail, a.date, a.ip, a.statut]),
                  });
                  toast.success("Journal exporté ✓");
                }} style={btnSecondary}>⬇️ Export audit</button>
                </div>

                {/* Filtres */}
                <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                  {["Tous","success","warning","danger"].map(f=>{
                    const meta={ Tous:{bg:"#f3f4f6",c:"#374151"}, success:{bg:"#dcfce7",c:"#166534"}, warning:{bg:"#fef3c7",c:"#92400e"}, danger:{bg:"#fee2e2",c:"#991b1b"} };
                    const m=meta[f];
                    return (
                      <button key={f} onClick={()=>setFiltreAudit(f)} style={{ padding:"5px 14px", borderRadius:20, border:"1px solid", fontSize:12, cursor:"pointer",
                        background:filtreAudit===f?m.bg:"#fff", color:filtreAudit===f?m.c:"#6b7280",
                        borderColor:filtreAudit===f?m.bg:"#e5e7eb", fontWeight:filtreAudit===f?700:400 }}>
                        {f==="Tous"?"Tous":f==="success"?"✅ Succès":f==="warning"?"⚠️ Attention":"🚨 Alertes"}
                      </button>
                    );
                  })}
                  <span style={{ fontSize:12, color:"#9ca3af", alignSelf:"center", marginLeft:"auto" }}>{auditFiltres.length} entrée(s)</span>
                </div>

                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}><thead>
                    <tr style={{ background:"#f9fafb" }}>
                      {["","Acteur","Action","Détail","Date & Heure","IP Source"].map((h,i)=>(
                        <th key={i} style={{ padding:"10px 12px", textAlign:"left", fontSize:11, color:"#6b7280", fontWeight:600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead><tbody>
                    {auditFiltres.map(a=>{
                      const meta={ success:{bg:"#f0fdf4",dot:"#22c55e",c:"#166534"}, warning:{bg:"#fff7ed",dot:"#f59e0b",c:"#92400e"}, danger:{bg:"#fff1f2",dot:"#ef4444",c:"#991b1b"} };
                      const m=meta[a.statut]||meta.success;
                      const r=ROLES_DEF[a.role];
                      return (
                        <tr key={a.id} style={{ borderTop:"1px solid #f1f5f9", background:a.statut==="danger"?"#fff8f8":a.statut==="warning"?"#fffaf0":"#fff" }}>
                          <td style={{ padding:"10px 12px" }}>
                            <div style={{ width:8, height:8, borderRadius:"50%", background:m.dot, boxShadow:`0 0 0 3px ${m.dot}30` }}/>
                          </td>
                          <td style={{ padding:"10px 12px" }}>
                            <div style={{ fontWeight:600, fontSize:13 }}>{a.acteur}</div>
                            {r&&<RoleBadge role={a.role}/>}
                          </td>
                          <td style={{ padding:"10px 12px" }}>
                            <span style={{ padding:"3px 9px", borderRadius:8, fontSize:11, fontWeight:700, background:m.bg, color:m.c }}>{a.action.replace(/_/g," ")}</span>
                          </td>
                          <td style={{ padding:"10px 12px", fontSize:12, color:"#374151", maxWidth:260 }}>{a.detail}</td>
                          <td style={{ padding:"10px 12px", fontSize:12, color:"#6b7280", whiteSpace:"nowrap" }}>{a.date}</td>
                          <td style={{ padding:"10px 12px" }}>
                            <code style={{ fontSize:11, padding:"2px 7px", borderRadius:5, background:"#f3f4f6", color:"#374151" }}>{a.ip}</code>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody></table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ══ MODAL INVITER ══ */}
        {showInviteModal&&(
          <Modal title="Créer un utilisateur" subtitle="Un mot de passe temporaire sera généré et envoyé par email" onClose={()=>{ setShowInviteModal(false); setInviteForm(INVITE_INIT); }}>

            {/* Identité */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
              <div>
                <label style={labelSt}>Nom complet *</label>
                <input value={inviteForm.nom} onChange={e=>setInviteForm({...inviteForm,nom:e.target.value})} style={inputSt} placeholder="Prénom Nom"/>
              </div>
              <div>
                <label style={labelSt}>Téléphone</label>
                <input value={inviteForm.telephone} onChange={e=>setInviteForm({...inviteForm,telephone:e.target.value})} style={inputSt} placeholder="+225 07 …"/>
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={labelSt}>Email *</label>
              <input type="email" value={inviteForm.email} onChange={e=>setInviteForm({...inviteForm,email:e.target.value})} style={inputSt} placeholder="email@domaine.ci"/>
            </div>

            {/* Rôle */}
            <label style={labelSt}>Rôle à attribuer *</label>

            {/* Rôles staff dash */}
            <div style={{ fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>Rôles disponibles</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
              {Object.values(ROLES_DEF).filter(r=>r.id!=="super_admin").map(r=>(
                <div key={r.id} onClick={()=>setInviteForm({...inviteForm,role:r.id,centre_id:""})}
                  style={{ padding:"12px 14px", borderRadius:10, border:`2px solid ${inviteForm.role===r.id?r.color:"#e5e7eb"}`, background:inviteForm.role===r.id?r.color+"08":"#fff", cursor:"pointer" }}>
                  <div style={{ fontWeight:700, color:inviteForm.role===r.id?r.color:"#0f172a", fontSize:13 }}>{r.emoji} {r.label}</div>
                  <div style={{ fontSize:10, color:"#9ca3af", marginTop:2 }}>{r.description.slice(0,55)}…</div>
                </div>
              ))}
            </div>

            {/* Centre BET - obligatoire selon le rôle */}
            {ROLES_AVEC_CENTRE_GD.includes(inviteForm.role) && !["superviseur","onboarding"].includes(inviteForm.role) && (
              <div style={{ marginBottom:14 }}>
                <label style={{ ...labelSt, color: inviteForm.centre_id ? "#1e3a8a" : "#dc2626" }}>
                  🏢 Centre BET attribué *
                </label>
                <select value={inviteForm.centre_id} onChange={e=>setInviteForm({...inviteForm,centre_id:e.target.value})}
                  style={{ ...inputSt, border:`2px solid ${inviteForm.centre_id?"#1e3a8a":"#fca5a5"}`, background:"#fff" }}>
                  <option value="">- Sélectionner le centre -</option>
                  {CENTRES_GD.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                {!inviteForm.centre_id && (
                  <div style={{ fontSize:11, color:"#dc2626", marginTop:3 }}>⚠️ Ce rôle doit être rattaché à un centre BET</div>
                )}
              </div>
            )}

            {/* Info rôles sans centre (transversaux/nationaux) */}
            {["superviseur","onboarding","admin","manager","gestionnaire","pedagogical_advisor"].includes(inviteForm.role) && (
              <div style={{ marginBottom:14, padding:"10px 14px", borderRadius:8, background:"#f0f9ff", border:"1px solid #bae6fd", fontSize:12, color:"#0369a1" }}>
                🌍 Ce profil a un périmètre <strong>national</strong> - aucun centre BET spécifique requis.
              </div>
            )}

            <label style={labelSt}>Note / message (optionnel)</label>
            <textarea value={inviteForm.note} onChange={e=>setInviteForm({...inviteForm,note:e.target.value})} style={{ ...inputSt, minHeight:56, resize:"vertical" }} placeholder="Information interne ou message d'accueil…"/>

            <div style={{ display:"flex", gap:10, marginTop:4 }}>
              <button onClick={sendInvite} style={btnPrimary}>✅ Créer l'utilisateur</button>
              <button onClick={()=>{ setShowInviteModal(false); setInviteForm(INVITE_INIT); }} style={btnSecondary}>Annuler</button>
            </div>
          </Modal>
        )}

        {/* ══ MODAL MODIFIER UTILISATEUR ══ */}
        {showUserModal&&editingUser&&(
          <Modal title={`Modifier - ${editingUser.nom}`} subtitle="Modifier le rôle et les paramètres de cet utilisateur" onClose={()=>setShowUserModal(false)}>
            <div style={{ display:"flex", gap:14, padding:"12px 16px", borderRadius:10, background:`${ROLES_DEF[editingUser.role]?.bg}`, border:`1px solid ${ROLES_DEF[editingUser.role]?.border}`, marginBottom:18 }}>
              <div style={{ width:48, height:48, borderRadius:"50%", background:`${ROLES_DEF[editingUser.role]?.color}18`, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:16, color:ROLES_DEF[editingUser.role]?.color }}>
                {editingUser.avatar}
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:15 }}>{editingUser.nom}</div>
                <div style={{ fontSize:12, color:"#9ca3af" }}>{editingUser.email}</div>
                <div style={{ marginTop:5 }}><RoleBadge role={editingUser.role}/></div>
              </div>
            </div>
            <label style={labelSt}>Changer le rôle</label>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
              {Object.values(ROLES_DEF).filter(r=>r.id!=="super_admin").map(r=>(
                <div key={r.id} onClick={()=>setEditingUser({...editingUser,role:r.id})}
                  style={{ padding:"10px 12px", borderRadius:9, border:`2px solid ${editingUser.role===r.id?r.color:"#e5e7eb"}`, background:editingUser.role===r.id?r.color+"08":"#fff", cursor:"pointer" }}>
                  <div style={{ fontWeight:700, fontSize:13, color:editingUser.role===r.id?r.color:"#374151" }}>{r.emoji} {r.label}</div>
                </div>
              ))}
            </div>
            <label style={labelSt}>Accès temporaire</label>
            <input type="date" value={editingUser.accessTemp||""} onChange={e=>setEditingUser({...editingUser,accessTemp:e.target.value||null})} style={inputSt}/>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 14px", borderRadius:8, background:"#f8fafc", border:"1px solid #e5e7eb" }}>
                <span style={{ fontSize:13, fontWeight:500 }}>2FA activé</span>
                <ToggleSwitch on={editingUser.twofa} onChange={v=>setEditingUser({...editingUser,twofa:v})} color={BET}/>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 14px", borderRadius:8, background:"#f8fafc", border:"1px solid #e5e7eb" }}>
                <span style={{ fontSize:13, fontWeight:500 }}>Restr. IP</span>
                <ToggleSwitch on={editingUser.ipRestr} onChange={v=>setEditingUser({...editingUser,ipRestr:v})} color={BET}/>
              </div>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>{ const old=users.find(u=>u.id===editingUser.id); setUsers(users.map(u=>u.id===editingUser.id?editingUser:u)); if(old.role!==editingUser.role) addAuditEntry("ROLE_MODIFIE",`${editingUser.nom} : ${old.role} → ${editingUser.role}`); toast.success("Modifications enregistrées ✓"); setShowUserModal(false); }} style={btnPrimary}>💾 Enregistrer</button>
              <button onClick={()=>setShowUserModal(false)} style={btnSecondary}>Annuler</button>
            </div>
          </Modal>
        )}

        {/* ══ MODAL RÉVOQUER SESSION ══ */}
        {showRevokeModal&&userToRevoke&&(
          <Modal title="Révoquer les sessions" subtitle="Cette action déconnectera l'utilisateur immédiatement" onClose={()=>setShowRevokeModal(false)} danger>
            <div style={{ textAlign:"center", padding:"16px 0" }}>
              <div style={{ fontSize:48, marginBottom:12 }}>⚠️</div>
              <p style={{ fontSize:14, color:"#374151", lineHeight:1.7 }}>
                Vous êtes sur le point de déconnecter <strong>{userToRevoke.nom}</strong> ({ROLES_DEF[userToRevoke.role]?.label}) de toutes ses sessions actives ({userToRevoke.sessions} session(s)).
              </p>
              <p style={{ fontSize:13, color:"#9ca3af", marginTop:8 }}>L'utilisateur devra se reconnecter pour continuer.</p>
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"center", marginTop:16 }}>
              <button onClick={()=>revokeSession(userToRevoke.id)} style={{ ...btnPrimary, background:BET_RED }}>🔌 Révoquer les sessions</button>
              <button onClick={()=>setShowRevokeModal(false)} style={btnSecondary}>Annuler</button>
            </div>
          </Modal>
        )}

        {/* ══ MODAL EXCEPTIONS PAR UTILISATEUR ══ */}
        {exceptionsUser && (
          <ModalExceptionsUtilisateur
            utilisateur={exceptionsUser}
            rolePhysique={exceptionsUser.role}
            permsRoleBase={matrice[exceptionsUser.role] || {}}
            onFermer={() => setExceptionsUser(null)}
          />
        )}

        {/* ══ MODAL DÉTAIL DEMANDE ══ */}
        {showDemandeModal&&selectedDemande&&(
          <Modal title="Détail de la demande" subtitle={`Demande de ${selectedDemande.nom}`} onClose={()=>setShowDemandeModal(false)}>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {[
                { l:"Nom complet",   v:selectedDemande.nom },
                { l:"Email",         v:selectedDemande.email },
                { l:"Entreprise",    v:selectedDemande.entreprise },
                { l:"Rôle demandé",  v:<RoleBadge role={selectedDemande.roleDemande}/> },
                { l:"Date demande",  v:fmtDate(selectedDemande.date) },
              ].map(row=>(
                <div key={row.l} style={{ display:"flex", gap:16, padding:"8px 0", borderBottom:"1px solid #f1f5f9" }}>
                  <span style={{ width:140, fontSize:12, fontWeight:600, color:"#9ca3af", flexShrink:0 }}>{row.l}</span>
                  <span style={{ fontSize:13, color:"#374151" }}>{row.v}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop:14, padding:"12px 16px", borderRadius:10, background:"#f8fafc", fontSize:13, color:"#374151", lineHeight:1.7 }}>
              💬 <strong>Justification :</strong> {selectedDemande.justification}
            </div>
            {selectedDemande.statut==="en_attente"&&(
              <div style={{ display:"flex", gap:10, marginTop:16 }}>
                <button onClick={()=>handleDemande(selectedDemande.id,"approuver")} style={{ ...btnPrimary, flex:1, textAlign:"center", background:"#22c55e" }}>✅ Approuver</button>
                <button onClick={()=>handleDemande(selectedDemande.id,"refuser")} style={{ ...btnSecondary, flex:1, textAlign:"center", color:BET_RED }}>❌ Refuser</button>
              </div>
            )}
          </Modal>
        )}

        {/* ══ MODAL SÉLECTION PROFIL À IMPORTER ══ */}
        {showImportRoleModal && (() => {
          const sch = IMPORT_SCHEMAS[importRole];
          return (
            <Modal
              title="📥 Import multi-profil - Choisir un type de profil"
              subtitle="Sélectionnez le rôle à importer, téléchargez le modèle, puis choisissez votre fichier Excel"
              onClose={() => setShowImportRoleModal(false)}
              size="lg"
            >
              {/* Grille de sélection du rôle */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:10, marginBottom:18 }}>
                {Object.entries(IMPORT_SCHEMAS).map(([key, s]) => (
                  <button key={key} onClick={() => setImportRole(key)} style={{
                    padding:"14px 12px", borderRadius:12, border:`2px solid ${importRole===key ? s.couleur : "#e5e7eb"}`,
                    background: importRole===key ? s.bg : "#fff",
                    cursor:"pointer", textAlign:"left", transition:"all .15s",
                  }}>
                    <div style={{ fontSize:22, marginBottom:4 }}>{s.emoji}</div>
                    <div style={{ fontWeight:700, fontSize:13, color: importRole===key ? s.couleur : "#1f2937" }}>{s.label}</div>
                    <div style={{ fontSize:10, color:"#9ca3af", marginTop:3, lineHeight:1.4 }}>
                      {s.colonnes.filter(c=>c.requis).map(c=>c.header).join(", ")}
                    </div>
                  </button>
                ))}
              </div>

              {/* Aperçu colonnes du rôle sélectionné */}
              <div style={{ background:"#f8fafc", borderRadius:10, padding:"12px 14px", marginBottom:18, border:"1px solid #e2e8f0" }}>
                <div style={{ fontWeight:700, fontSize:13, color:"#1e3a8a", marginBottom:8 }}>
                  {sch?.emoji} {sch?.label} - colonnes du fichier Excel :
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {sch?.colonnes.map(c => (
                    <span key={c.key} style={{
                      padding:"3px 10px", borderRadius:12, fontSize:11, fontWeight:600,
                      background: c.requis ? "#dbeafe" : "#f1f5f9",
                      color:      c.requis ? "#1e40af" : "#64748b",
                      border:     `1px solid ${c.requis ? "#bfdbfe" : "#e2e8f0"}`,
                    }}>
                      {c.header}{c.requis ? " *" : ""}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize:11, color:"#94a3b8", marginTop:8 }}>* champ obligatoire · les autres sont facultatifs</div>
              </div>

              <div style={{ display:"flex", gap:10, justifyContent:"flex-end", flexWrap:"wrap", alignItems:"center" }}>
                <a
                  href={`/templates/modele_import_${importRole}_bet.csv`}
                  download={`modele_import_${importRole}_bet.csv`}
                  style={{ padding:"9px 14px", background:"#f0fdf4", color:"#16a34a", border:"1.5px solid #bbf7d0", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer", textDecoration:"none" }}
                >
                  ⬇ CSV modèle
                </a>
                <button onClick={() => telechargerModeleImport(importRole)} style={{
                  padding:"9px 16px", background:"#fffbeb", color:"#92400e",
                  border:"1.5px solid #fde68a", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer",
                }}>
                  ⬇ Modèle Excel - {sch?.label}
                </button>
                <label style={{
                  padding:"9px 18px", background: sch?.couleur || BET, color:"#fff",
                  border:"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer",
                  display:"flex", alignItems:"center", gap:6,
                }}>
                  📂 Choisir un fichier
                  <input ref={importFileRef} type="file" accept=".xlsx,.xls,.csv"
                    onChange={(e) => { setShowImportRoleModal(false); lireEtPrevisualiser(e); }}
                    style={{ display:"none" }} />
                </label>
              </div>
            </Modal>
          );
        })()}

        {/* ══ MODAL PRÉVISUALISATION IMPORT ══ */}
        {showImportPreview && (() => {
          const nbErreurs     = importPreviewRows.filter(l => l._statut === "erreur").length;
          const nbAvertiss    = importPreviewRows.filter(l => l._statut === "avertissement").length;
          const nbOk          = importPreviewRows.filter(l => l._statut === "ok").length;
          const nbImportables = importPreviewRows.filter(l => l._statut !== "erreur").length;
          const sch           = IMPORT_SCHEMAS[importRole];
          const avecCentre    = sch?.avecCentre;
          const extraLabel    = sch?.extraLabel || "Info";
          return (
            <Modal
              title={`🔍 Prévisualisation - ${sch?.emoji} ${sch?.label} - Vérifiez avant de valider`}
              subtitle={`${importPreviewRows.length} ligne(s) · ${nbOk} OK · ${nbAvertiss} avertissement(s) · ${nbErreurs} erreur(s) bloquante(s)`}
              onClose={() => { setShowImportPreview(false); setImportPreviewRows([]); }}
              size="xl"
            >
              <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
                {nbOk > 0 && <div style={{ background:"#dcfce7", color:"#16a34a", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700 }}>✅ {nbOk} valide{nbOk>1?"s":""}</div>}
                {nbAvertiss > 0 && <div style={{ background:"#fef3c7", color:"#92400e", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700 }}>⚠️ {nbAvertiss} avertissement{nbAvertiss>1?"s":""}</div>}
                {nbErreurs > 0 && <div style={{ background:"#fee2e2", color:"#dc2626", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700 }}>🚫 {nbErreurs} erreur{nbErreurs>1?"s":""} bloquante{nbErreurs>1?"s":""}</div>}
              </div>

              {nbErreurs > 0 && (
                <div style={{ background:"#fff1f2", border:"1px solid #fecaca", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#991b1b" }}>
                  ⚠️ Les lignes en rouge <strong>ne seront pas importées</strong>. Corrigez le fichier et réimportez.
                </div>
              )}

              <div style={{ overflowX:"auto", maxHeight:420, overflowY:"auto", marginBottom:16, borderRadius:10, border:"1.5px solid #e2e8f0" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead style={{ position:"sticky", top:0, zIndex:2 }}>
                    <tr style={{ background:"#f8fafc" }}>
                      {["#","Statut","Prénom","Nom","Email","Téléphone",
                        ...(avecCentre ? ["Centre BET"] : []),
                        extraLabel,
                        "Problèmes détectés",
                      ].map(h => (
                        <th key={h} style={{ padding:"9px 10px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreviewRows.map((l, i) => {
                      const bgRow = l._statut==="erreur" ? "#fff1f2" : l._statut==="avertissement" ? "#fffbeb" : "#f0fdf4";
                      const allIssues = [
                        ...l._erreurs.map(e2 => ({ text:e2, type:"erreur" })),
                        ...l._avertissements.map(w => ({ text:w, type:"avertissement" })),
                      ];
                      const extraVal = sch?.extraInfo ? sch.extraInfo(l) : "-";
                      return (
                        <tr key={i} style={{ borderBottom:"1px solid #f1f5f9", background:bgRow }}>
                          <td style={{ padding:"8px 10px", color:"#94a3b8", fontSize:11, fontWeight:600 }}>{l._idx}</td>
                          <td style={{ padding:"8px 10px", whiteSpace:"nowrap" }}>
                            {l._statut==="erreur"
                              ? <span style={{ background:"#fee2e2", color:"#dc2626", borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:700 }}>🚫 Erreur</span>
                              : l._statut==="avertissement"
                              ? <span style={{ background:"#fef3c7", color:"#92400e", borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:700 }}>⚠️ Attention</span>
                              : <span style={{ background:"#dcfce7", color:"#16a34a", borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:700 }}>✅ Valide</span>
                            }
                          </td>
                          <td style={{ padding:"8px 10px", fontWeight:600 }}>{l.prenom || <span style={{ color:"#ef4444" }}>-</span>}</td>
                          <td style={{ padding:"8px 10px", fontWeight:600 }}>{l.nom || <span style={{ color:"#ef4444" }}>-</span>}</td>
                          <td style={{ padding:"8px 10px", color:"#374151", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l.email || <span style={{ color:"#ef4444" }}>-</span>}</td>
                          <td style={{ padding:"8px 10px", color:"#64748b", whiteSpace:"nowrap" }}>{l.tel || <span style={{ color:"#d1d5db", fontSize:11 }}>-</span>}</td>
                          {avecCentre && (
                            <td style={{ padding:"8px 10px", whiteSpace:"nowrap" }}>
                              {l.centre_id
                                ? <span style={{ background:"#e0f2fe", color:"#0369a1", borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:600 }}>🏢 {l.centre_id}</span>
                                : <span style={{ background:"#f1f5f9", color:"#64748b", borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:600 }}>🌍 national</span>
                              }
                            </td>
                          )}
                          <td style={{ padding:"8px 10px", color:"#64748b", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontSize:11 }}>{extraVal}</td>
                          <td style={{ padding:"8px 10px", maxWidth:240 }}>
                            {allIssues.length === 0
                              ? <span style={{ color:"#86efac", fontSize:11 }}>Aucun problème</span>
                              : <ul style={{ margin:0, paddingLeft:14 }}>
                                  {allIssues.map((iss, j) => (
                                    <li key={j} style={{ fontSize:11, color: iss.type==="erreur"?"#dc2626":"#92400e", fontWeight: iss.type==="erreur"?700:500, marginBottom:2 }}>
                                      {iss.text}
                                    </li>
                                  ))}
                                </ul>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display:"flex", gap:10, justifyContent:"flex-end", alignItems:"center", flexWrap:"wrap" }}>
                {nbErreurs > 0 && <span style={{ fontSize:11, color:"#94a3b8", marginRight:"auto" }}>
                  {nbImportables} ligne{nbImportables>1?"s":""} importable{nbImportables>1?"s":""} sur {importPreviewRows.length}
                </span>}
                <button
                  onClick={() => { setShowImportPreview(false); setImportPreviewRows([]); }}
                  style={{ padding:"9px 18px", background:"#f1f5f9", border:"none", borderRadius:8, fontSize:12, color:"#374151", cursor:"pointer", fontWeight:600 }}>
                  ✕ Fermer et corriger
                </button>
                {nbImportables > 0 && (
                  <button
                    onClick={confirmerImport}
                    disabled={importConfirming}
                    style={{ padding:"9px 20px", background: nbErreurs>0 ? "#f59e0b" : (sch?.couleur || "#16a34a"), border:"none", borderRadius:8, fontSize:12, color:"#fff", cursor:"pointer", fontWeight:700, opacity: importConfirming?0.7:1 }}>
                    {importConfirming ? "Import en cours…" : nbErreurs > 0
                      ? `⚠️ Importer uniquement les ${nbImportables} ligne${nbImportables>1?"s":""} valides`
                      : `✅ Valider et importer ${nbImportables} ${sch?.label || "profil"}${nbImportables>1?"s":""}`
                    }
                  </button>
                )}
              </div>
            </Modal>
          );
        })()}

        {showImportResultat && importResultats.length > 0 && (
          <Modal
            title={`✅ Import terminé - ${IMPORT_SCHEMAS[importRole]?.label || "Profils"} créés`}
            subtitle="Un email avec les identifiants a été envoyé automatiquement. Conservez ce récap."
            onClose={()=>setShowImportResultat(false)}
            size="xl"
          >
            {/* Avertissement */}
            <div style={{ background:"#fef3c7", borderLeft:"4px solid #f59e0b", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12, color:"#92400e" }}>
              ⚠️ <strong>Ces mots de passe sont temporaires.</strong> Chaque coach devra le changer dès sa première connexion. Ils ne seront plus visibles après la fermeture de cette fenêtre.
            </div>

            {/* Tableau */}
            <div style={{ overflowX:"auto", marginBottom:16 }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ background:"#f8fafc" }}>
                    {["Prénom","Nom","Email","Mot de passe temporaire","Statut"].map(h=>(
                      <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importResultats.map((r,i)=>(
                    <tr key={i} style={{ borderBottom:"1px solid #f1f5f9", background:r.statut==="ok"?"#fff":"#fff1f2" }}>
                      <td style={{ padding:"8px 12px", fontWeight:600 }}>{r.prenom}</td>
                      <td style={{ padding:"8px 12px", fontWeight:600 }}>{r.nom}</td>
                      <td style={{ padding:"8px 12px", color:"#374151" }}>{r.email}</td>
                      <td style={{ padding:"8px 12px" }}>
                        {r.statut==="ok"
                          ? <span style={{ fontFamily:"monospace", fontWeight:800, fontSize:13, color:"#0891b2", background:"#e0f2fe", padding:"3px 9px", borderRadius:6, letterSpacing:1 }}>{r.mdp}</span>
                          : <span style={{ color:"#ef4444", fontSize:11 }}>Erreur : {r.detail}</span>
                        }
                      </td>
                      <td style={{ padding:"8px 12px" }}>
                        {r.statut==="ok"
                          ? <span style={{ background:"#dcfce7", color:"#16a34a", borderRadius:20, padding:"2px 9px", fontSize:10, fontWeight:700 }}>✓ Créé</span>
                          : <span style={{ background:"#fee2e2", color:"#dc2626", borderRadius:20, padding:"2px 9px", fontSize:10, fontWeight:700 }}>✗ Erreur</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Boutons */}
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={()=>{
                const okRows = importResultats.filter(r=>r.statut==="ok");
                exporterExcelStyle({
                  nomFichier: `identifiants_coachs_${new Date().toISOString().slice(0,10)}`,
                  titre: '🔑 Identifiants coachs créés',
                  sousTitre: `${okRows.length} compte${okRows.length>1?'s':''} créé${okRows.length>1?'s':''} le ${new Date().toLocaleDateString('fr-FR')}`,
                  couleurEntete: '16A34A',
                  colonnes: [
                    { label: 'Prénom', width: 18 }, { label: 'Nom', width: 18, bold: true },
                    { label: 'Email', width: 30 }, { label: 'Mot de passe temporaire', width: 24 },
                    { label: 'Statut', width: 12 },
                  ],
                  lignes: okRows.map(r => [r.prenom, r.nom, r.email, r.mdp, r.statut==="ok"?"Créé":"Erreur"]),
                });
                toast.success("Fichier identifiants téléchargé ✓");
              }} style={{ padding:"9px 18px", background:"#16a34a", border:"none", borderRadius:8, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                📥 Exporter identifiants Excel
              </button>
              <button onClick={()=>setShowImportResultat(false)} style={{ padding:"9px 18px", background:"#f1f5f9", border:"none", borderRadius:8, fontSize:12, color:"#374151", cursor:"pointer", fontWeight:600 }}>
                Fermer
              </button>
            </div>
          </Modal>
        )}

      </div>
    </div>
  );
}

/* ═══ STYLES ═══ */
const btnPrimary   = { padding:"9px 16px", background:BET, color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12, fontFamily:"'DM Sans',sans-serif", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6 };
const btnSecondary = { padding:"9px 16px", background:"#e5e7eb", color:"#374151", border:"none", borderRadius:8, cursor:"pointer", fontWeight:600, fontSize:12, fontFamily:"'DM Sans',sans-serif" };
const btnGhost     = { padding:"5px 10px", background:"none", color:BET, border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 };
const btnIconEdit  = { padding:"5px 9px", background:"#e0e7ff", color:BET, border:`1px solid ${BET}30`, borderRadius:6, cursor:"pointer", fontSize:11, fontWeight:600 };
const inputSt      = { padding:"9px 12px", marginBottom:12, width:"100%", borderRadius:8, border:"1px solid #d1d5db", boxSizing:"border-box", fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#0f172a" };
const labelSt      = { display:"block", fontSize:12, fontWeight:600, color:"#374151", marginBottom:5 };