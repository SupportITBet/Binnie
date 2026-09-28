# -*- coding: utf-8 -*-
"""
Produit l'inventaire des tableaux de bord BET (application « dash ») en classeur Excel.

POURQUOI UN CLASSEUR ET NON UN DOCUMENT. L'inventaire du site public était un document à
lire ; celui-ci est un document à REMPLIR : trois colonnes (Complexité, Charge, Commentaire)
sont laissées vides pour la cotation, et chaque feuille est filtrable et triable. Un .docx
aurait obligé à recopier 224 lignes dans un tableur avant de pouvoir chiffrer quoi que ce soit.

CE QUI EST RELEVÉ DANS LE CODE, ET CE QUI NE L'EST PAS. Les profils viennent de la table de
routage `ROUTE_PAR_TYPE` (Pages/Auth/LoginAdmin.jsx), les onglets des tests `activeTab === "…"`
de chaque tableau de bord, leurs libellés des tableaux de définition de la navigation. Les
descriptions, elles, sont rédigées : elles résument ce que fait l'onglet, à un niveau de détail
que la cotation peut utiliser sans devoir ouvrir l'écran.

    python inventaire-dash-vers-excel.py <fichier.xlsx>
"""
import sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

CIBLE = sys.argv[1]

# Charte BET, reprise de utils/genererPDF.js
NAVY, CYAN, INK, MUTED = "1B3080", "0891B2", "12161D", "5C6573"
FOND_ENTETE, FOND_BANDE, FOND_SAISIE = "1B3080", "F2F4FA", "FFF7E6"
ROUGE, VERT = "AE2128", "15703F"

SANS, MONO = "Calibri", "Consolas"
FIN = Side(style="thin", color="D5DBE6")
BORD = Border(left=FIN, right=FIN, top=FIN, bottom=FIN)

wb = Workbook()

# ══════════════════════════════════════════════════════════════════════════════
#  LES DONNÉES
# ══════════════════════════════════════════════════════════════════════════════

# (profil, rôle technique, adresse, fichier, lignes)
PROFILS = [
    ("Super Admin",             "super_admin",         "/dashboard/superAdmin",           "SuperAdminDashboard.jsx",          22433),
    ("Marketing",               "marketing",           "/marketing-dashboard",            "SuperAdminDashboard.jsx (partagé)", 0),
    ("Administrateur",          "admin",               "/AdminDashboard",                 "AdminDashboard.jsx",               20008),
    ("Manager",                 "manager",             "/manager-dashboard",              "ManagerDashboard.jsx",               781),
    ("Superviseur global",      "superviseur",         "/superviseur-dashboard",          "SuperviseurDashboard.jsx",          5022),
    ("Deputy Superviseur",      "deputy_superviseur",  "/superviseur-dashboard",          "SuperviseurDashboard.jsx (variante)", 0),
    ("Conseiller pédagogique",  "pedagogical_advisor", "/pedagogical-advisor-dashboard",  "PedagogicalAdvisorDashboard.jsx",  12902),
    ("Assistante commerciale",  "commercial",          "/commercial-dashboard",           "CommercialDashboard.jsx",          17938),
    ("Assistante onboarding",   "onboarding",          "/onboarding-dashboard",           "OnboardingDashboard.jsx",          10984),
    ("Agent placement test",    "placement_test",      "/placement-test-dashboard",       "PlacementTestDashboard.jsx",        1010),
    ("Gestionnaire",            "gestionnaire",        "/gestionnaire-dashboard",         "GestionnaireDashboard.jsx",          750),
    ("Comptable",               "comptable",           "/comptable-dashboard",            "ComptableDashboard.jsx",            1883),
    ("RH & Paie",               "rh",                  "/rh-paie-dashboard",              "RHPaieDashboard.jsx",                927),
    ("Customer Care",           "customer_care",       "/customer-care-dashboard",        "CustomerCareDashboard.jsx",          862),
    ("Assistante SAV",          "assistant_sav",       "/sav-dashboard",                  "SavDashboard.jsx",                   639),
    ("Data Collector",          "data_collector",      "/datacollector-dashboard",        "DataCollectorDashboard.jsx",        1051),
    ("Coach",                   "coach",               "/espace-professeur",              "EspaceProfesseur.jsx",             12501),
    ("Apprenant",               "apprenant",           "/espace-apprenant",               "EspaceApprenant.jsx",               7601),
    ("Parent",                  "parent",              "/dashboard/parent",               "ParentDashboard.jsx",               1221),
]

# Onglets : profil -> [(clé, libellé, description, état)]
# état : "" = opérationnel | "Ébauche" = écran présent, backend à connecter
O = {}

O["Super Admin"] = [
 ("taches","Mes tâches","Point d'entrée unique : agrège les compteurs « à traiter » de tous les autres onglets.",""),
 ("overview","Vue d'ensemble","Indicateurs de synthèse de la plateforme, activité récente.",""),
 ("tdb_marketing","Tableau de bord","Tableau de bord marketing : campagnes, trafic, conversions.",""),
 ("cockpit_kpi","Cockpit KPI","Référentiel d'indicateurs BET, limité à ceux dont la source est réellement alimentée.",""),
 ("platform","Plateforme","Configuration générale : contenus du site public, paramètres, clés d'intégration.",""),
 ("boutique","Boutique","Produits, commandes, stocks de la boutique en ligne.",""),
 ("media","Média","Bibliothèque de médias administrable (visuels du site, carrousel).",""),
 ("campagnes_nl","Campagnes & Newsletters","Rédaction et envoi des campagnes, gestion des abonnés.",""),
 ("trafic","Trafic web","Statistiques de fréquentation du site public.",""),
 ("clients","Clients & Prospects","Base complète des dossiers, toutes assistantes confondues.",""),
 ("suivi_apprenants","Apprenants","Suivi transversal des apprenants inscrits : niveau, classe, assiduité.",""),
 ("archives","Archives","Dossiers clos, apprenants sortis, classes clôturées.",""),
 ("coachs","Professeurs","Fiches coachs : contrats, catégories, notes d'observation, disponibilités.",""),
 ("cours","Groupes","Classes et groupes : création, affectation de coach, horaires, clôture.",""),
 ("offres","Offres & Formations","Catalogue : formules, tarifs, filières, certifications.",""),
 ("assistantes","Planning assistantes","Planning et charge des assistantes commerciales et onboarding.",""),
 ("sondages","Sondages","Création et dépouillement des sondages internes.",""),
 ("ca","Chiffre d'affaires","Chiffre d'affaires consolidé, par période, canal et centre.",""),
 ("paiements","Paiements","Tous les paiements, échéanciers, relances et encaissements.",""),
 ("permissions","Gestion des droits","Matrice des permissions par rôle, création des comptes du personnel.",""),
 ("audit","Audit global","Journal des actions du personnel sur la plateforme.",""),
 ("messages","Messages","Messagerie interne et chats de classe.",""),
 ("notifications","Notifications","Centre de notifications du profil.",""),
]

O["Administrateur"] = [
 ("taches","Mes tâches","Agrégation des points à traiter.",""),
 ("overview","Vue d'ensemble","Indicateurs de synthèse de la plateforme.",""),
 ("platform","Plateforme","Configuration générale et contenus du site public.",""),
 ("trafic","Trafic web","Statistiques de fréquentation.",""),
 ("clients","Clients & Prospects","Base des dossiers, toutes assistantes confondues.",""),
 ("suivi_apprenants","Apprenants","Suivi transversal des apprenants inscrits.",""),
 ("archives","Archives","Dossiers clos et classes clôturées.",""),
 ("coachs","Professeurs","Fiches coachs, contrats, catégories, observations.",""),
 ("cours","Groupes","Classes et groupes, affectation de coach, horaires.",""),
 ("offres","Offres & Formations","Catalogue des formules et tarifs.",""),
 ("assistantes","Planning assistantes","Planning et charge des assistantes.",""),
 ("sondages","Sondages","Sondages internes.",""),
 ("ca","Chiffre d'affaires","Chiffre d'affaires consolidé.",""),
 ("paiements","Paiements","Paiements, échéanciers et relances.",""),
 ("administration","Administration BET","Administration métier : centres, salles, référentiels.",""),
 ("audit","Audit global","Journal des actions du personnel.",""),
 ("messages","Messages","Messagerie interne.",""),
 ("notifications","Notifications","Centre de notifications.",""),
]

O["Manager"] = [
 ("overview","Vue d'ensemble","Synthèse de l'activité des deux équipes.",""),
 ("cockpit","Cockpit KPI","Indicateurs du référentiel KPI dont la source est alimentée.",""),
 ("commercial_team","Équipe Commerciale","Performance par assistante : dossiers, conversions, encaissements.",""),
 ("pedago_team","Équipe Pédagogique","Suivi de l'équipe pédagogique : coachs, classes, observations.",""),
 ("reporting","Reporting global","Rapports consolidés, exports.",""),
 ("workflows","Workflows","Vue des circuits en cours entre métiers.",""),
 ("messagerie","Messages","Messagerie interne.",""),
 ("notifications","Notifications","Centre de notifications.",""),
]

O["Superviseur global"] = [
 ("taches","Mes tâches","Agrégation des points à traiter.",""),
 ("dashboard","Vue d'ensemble","Synthèse de la conformité des coachs et des anomalies ouvertes.",""),
 ("plannings","Plannings","Planning de toutes les classes : jours, heures, liens de connexion.",""),
 ("observer-cours","Observer un cours","Saisie d'un rapport d'observation sur les 5 critères du barème BET.",""),
 ("deputies","Gestion Deputies","Création et affectation des deputies, attribution de missions.",""),
 ("cahiers","Cahiers coachs","Cahier de chaque coach : classes, planning, séances, présences, fichiers partagés.",""),
 ("classement","Classement","Classement des coachs par catégorie de contrat (barème d'appraisal).",""),
 ("eval-apprenants","Évaluations apprenants","Appréciations déposées par les apprenants sur leurs séances.",""),
 ("eval-parents","Évaluations parents","Évaluations des coachs par les parents.",""),
 ("rapports","Rapports Deputy","Lecture, correction et validation des rapports d'observation des deputies.",""),
 ("anomalies","Anomalies","Signalements de non-conformité, réservés au superviseur global.",""),
 ("messagerie","Messagerie","Messagerie interne.",""),
 ("notifications","Notifications","Centre de notifications.",""),
]

O["Deputy Superviseur"] = [
 ("taches","Mes tâches","Agrégation des points à traiter.",""),
 ("dashboard","Vue d'ensemble","Synthèse de son périmètre d'observation.",""),
 ("plannings","Plannings","Planning des classes à observer.",""),
 ("observer-cours","Observer un cours","Saisie de son rapport d'observation.",""),
 ("cahiers","Cahiers coachs","Même écran que le superviseur, en lecture seule : préparation de l'observation.",""),
 ("rapports","Mes rapports","Ses propres rapports, et les corrections demandées par le superviseur.",""),
 ("missions","Mes missions","Missions d'observation assignées par le superviseur global.",""),
 ("messagerie","Messagerie","Messagerie interne.",""),
 ("notifications","Notifications","Centre de notifications.",""),
]

O["Conseiller pédagogique"] = [
 ("taches","Mes tâches","Agrégation : groupes sans coach, remplacements à pourvoir, honoraires à valider, dossiers à réaffecter, prospects en attente.",""),
 ("dashboard","Tableau de bord","Synthèse de son portefeuille de classes privées et de coachs.",""),
 ("prospects","Prospects parcours","Qualification des prospects orientés vers le coaching privé.",""),
 ("apprenants","Apprenants","Fiche apprenant complète : informations, présences, tests de niveau, paiement, notes, progression, disponibilités, chat.",""),
 ("groupes","Groupes","Classes privées : création, affectation de coach, horaires.",""),
 ("coachs","Coachs","Coachs de son périmètre, catégories et disponibilités.",""),
 ("remplacements","Remplacements","Demandes de remplacement à pourvoir.",""),
 ("honoraires","Honoraires","Validation des honoraires des coachs sur la grille tarifaire.",""),
 ("evaluations","Évaluations parents","Évaluations déposées par les parents.",""),
 ("eval-apprenants","Évaluations apprenants","Appréciations des apprenants sur leurs séances.",""),
 ("rapports-superviseur","Rapports Superviseur","Rapports d'observation transmis par la supervision.",""),
 ("reaffectations","Dossiers à réaffecter","Demandes de transfert en attente de réaffectation.",""),
 ("messages","Messages","Messagerie interne et chats de classe.",""),
 ("notifications","Notifications","Centre de notifications.",""),
]

O["Assistante commerciale"] = [
 ("taches","Mes tâches","Agrégation : tests à corriger, dossiers à relancer, paiements en retard.",""),
 ("dashboard","Tableau de bord","Synthèse de son portefeuille : dossiers, conversions, encaissements.",""),
 ("assignations","Prospects parcours","Dossiers de prospection : qualification, relance, conversion.",""),
 ("tests","Tests reçus","Tests de niveau reçus, correction des réponses orales et écrites, attribution du niveau.",""),
 ("inscriptions","Inscriptions","Transformation d'un prospect en apprenant inscrit.",""),
 ("classes","Mes classes","Classes de son périmètre (présentiel).",""),
 ("plannings","Plannings","Planning des classes de son périmètre.",""),
 ("apprenants","Mes apprenants","Fiche apprenant : informations, accès, parent, présences, tests de niveau, paiement, documents, notes, historique. Export PDF.",""),
 ("reaffecter","Dossiers à réaffecter","Demandes de transfert de ses apprenants ; réaffectation réservée aux assistantes présentiel.",""),
 ("suivi","Suivi démarrage","Suivi des premières semaines de formation.",""),
 ("paiements","Paiements","Échéanciers mensuels, encaissements, relances, plan de paiement, pauses.",""),
 ("entreprises","Comptes entreprises","Comptes clients B2B.",""),
 ("pipeline_b2b","Pipeline B2B","Opportunités entreprises et leur avancement.",""),
 ("documents_b2b","Documents","Devis, contrats et pièces des dossiers entreprises.",""),
 ("facturation_b2b","Facturation","Facturation des comptes entreprises.",""),
 ("sondages","Sondages","Sondages adressés à ses clients.",""),
 ("messages","Messages","Messagerie interne et chats de classe.",""),
 ("notifications","Notifications","Centre de notifications.",""),
]

O["Assistante onboarding"] = [
 ("taches","Mes tâches","Agrégation : accès à créer, kick-off à envoyer, dossiers à réaffecter.",""),
 ("dashboard","Tableau de bord","Synthèse des entrées en formation.",""),
 ("apprenants","Nouveaux apprenants","Dossiers convertis à intégrer : création des accès, envoi du kick-off.",""),
 ("mes_apprenants","Mes apprenants","Fiche apprenant : profil, planning, séances, test de niveau, paiements, notes, historique, présences. Export PDF.",""),
 ("suivi","Suivi démarrage","Suivi des premières séances et des points de contrôle.",""),
 ("bilans","Bilans & Renouvellements","Bilans de fin de cycle et renouvellements d'inscription.",""),
 ("groupes","Groupes","Classes en ligne : création, affectation, horaires, import Excel.",""),
 ("reaffecter","Dossiers à réaffecter","Demandes de transfert des classes en ligne, réaffectation après test de niveau.",""),
 ("plannings","Plannings","Planning des classes en ligne.",""),
 ("coachs","Coachs","Coachs des classes en ligne.",""),
 ("contenus","Contenus","Contenus pédagogiques mis à disposition des classes.",""),
 ("archives","Archives","Apprenants sortis et classes clôturées.",""),
 ("messages","Messages","Messagerie interne et chats de classe.",""),
 ("notifications","Notifications","Centre de notifications.",""),
]

O["Agent placement test"] = [
 ("taches","Mes tâches","Agrégation : tests à corriger, demandes de transfert à traiter.",""),
 ("overview","Vue d'ensemble","Synthèse de l'activité de placement.",""),
 ("file","À corriger","File des tests mixtes à corriger (oral et écrit).",""),
 ("transferts","Demandes de transfert","Demandes émises par les coachs : fait passer le test, rend le niveau, débloque la réaffectation.",""),
 ("rapports","Rapports","Rapports d'activité de placement.",""),
 ("test_niveau","Test de niveau","Administration du test : lien pré-rempli à envoyer, ou saisie du niveau évalué en présentiel.",""),
 ("resultats_candidats","Résultats candidats","Résultats des candidats, historique des passages.",""),
 ("notifications","Notifications","Centre de notifications.",""),
]

O["Gestionnaire"] = [
 ("taches","Mes tâches","Agrégation des points à traiter.",""),
 ("dashboard","Tableau de bord","Synthèse de l'activité de gestion.",""),
 ("inscriptions","Inscriptions","Traitement administratif des inscriptions.",""),
 ("dossiers","Dossiers","Dossiers administratifs des apprenants.",""),
 ("paiements","Paiements","Suivi des encaissements.",""),
 ("requetes","Requêtes","Requêtes internes adressées à la gestion.",""),
 ("exports","Exports & envois","Exports de données et envois groupés.",""),
 ("notifications","Notifications","Centre de notifications.",""),
]

O["Comptable"] = [
 ("taches","Mes tâches","Agrégation des points à traiter.",""),
 ("dashboard","Tableau de bord","Synthèse comptable et financière.",""),
 ("facturation","Facturation","Émission et suivi des factures.",""),
 ("paiements","Paiements","Encaissements et rapprochement.",""),
 ("tresorerie","Trésorerie","Position et mouvements de trésorerie.",""),
 ("fournisseurs","Fournisseurs & Achats","Fournisseurs, commandes et factures d'achat.",""),
 ("rrd_bc_bacn","RRD · BC · BACN","Pièces internes : réquisitions, bons de commande, bons d'achat comptabilisés.",""),
 ("generale","Comptabilité générale","Écritures et journaux.",""),
 ("tva","TVA","Déclaration et suivi de la TVA.",""),
 ("immobilisations","Immobilisations","Registre des immobilisations et amortissements.",""),
 ("budgets","Budgets","Budgets et suivi des écarts.",""),
 ("analytique","Analytique","Répartition analytique par centre et activité.",""),
 ("honoraires","Honoraires coaches","Honoraires des coachs à payer, issus des séances réalisées.",""),
 ("exports","Exports comptables","Exports vers l'outil comptable.",""),
 ("messages","Messages","Messagerie interne.",""),
 ("notifications","Notifications","Centre de notifications.",""),
]

O["RH & Paie"] = [
 ("taches","Mes tâches","Agrégation des points à traiter.",""),
 ("dashboard","Tableau de bord","Synthèse RH et masse salariale.",""),
 ("grille","Grille tarifaire","Grille des honoraires par grade, canal, niveau et durée.",""),
 ("contrats","Coachs","Dossiers des coachs : contrats, grades, catégories.",""),
 ("recaps","Bulletins de paie","Récapitulatifs et bulletins de paie.",""),
 ("messages","Messages","Messagerie interne.",""),
 ("notifications","Notifications","Centre de notifications.",""),
]

O["Customer Care"] = [
 ("taches","Mes tâches","Agrégation des points à traiter.",""),
 ("dashboard","Tableau de bord","Synthèse des sollicitations clients.",""),
 ("plaintes","Plaintes","Réception, qualification et traitement des plaintes.",""),
 ("messages","Messages","Messagerie interne.",""),
 ("notifications","Notifications","Centre de notifications.",""),
]

O["Assistante SAV"] = [
 ("taches","Mes tâches","Agrégation des points à traiter.",""),
 ("dashboard","Tableau de bord","Synthèse de l'activité SAV.",""),
 ("demandes","Demandes SAV","Réception et traitement des demandes de service après-vente.",""),
 ("remboursements","Remboursements","Écran présent, sans backend dédié : à connecter.","Ébauche"),
 ("satisfaction","Suivi satisfaction","Écran présent, sans backend dédié : à connecter.","Ébauche"),
 ("messages","Messages","Messagerie interne.",""),
 ("notifications","Notifications","Centre de notifications.",""),
]

O["Data Collector"] = [
 ("taches","Mes tâches","Agrégation des points à traiter.",""),
 ("dashboard","Tableau de bord","Synthèse de la collecte.",""),
 ("clients","Clients","Base clients collectée.",""),
 ("prospects","Prospects","Prospects collectés, à qualifier.",""),
 ("import","Import fichiers","Import de fichiers de données, contrôle des lignes rejetées.",""),
 ("qualite","Qualité des données","Contrôles de cohérence, doublons, champs manquants.",""),
 ("historique","Historique","Historique des imports et des corrections.",""),
 ("notifications","Notifications","Centre de notifications.",""),
]

O["Coach"] = [
 ("taches","Mes tâches","Agrégation : présences à saisir, devoirs à corriger, demandes en attente.",""),
 ("dashboard","Tableau de bord","Synthèse de ses classes et de son activité.",""),
 ("groupes","Mes Contrats","Ses classes sous contrat, avec leurs apprenants.",""),
 ("etudiants","Apprenants","Fiche apprenant : profil, tests de niveau, présences, devoirs et notes, parcours, parents. Export PDF. Demande de transfert.",""),
 ("planning","Planning","Son planning de séances.",""),
 ("disponibilites","Disponibilités","Déclaration de ses créneaux disponibles.",""),
 ("presences","Présences","Saisie des feuilles de présence par séance.",""),
 ("evaluations","Évaluations","Création et notation des évaluations.",""),
 ("session_live","Session Live","Animation de la séance en ligne.",""),
 ("modules_contenu","Médiathèque","Contenus pédagogiques : création de modules et de blocs.",""),
 ("ressources","Ressources","Fichiers partagés avec ses classes.",""),
 ("demandes","Mes demandes","Ses demandes : remplacement, transfert d'apprenant, congés.",""),
 ("honoraires","Honoraires","Ses honoraires calculés sur les séances réalisées.",""),
 ("recompenses","Récompenses","Gamification : points et récompenses du coach.",""),
 ("messages","Messages","Messagerie interne et chats de classe.",""),
 ("notifs","Notifications","Centre de notifications.",""),
 ("profil","Mon profil","Ses informations, son contrat, sa catégorie.",""),
]

O["Apprenant"] = [
 ("dashboard","Tableau de bord","Synthèse de son parcours : prochaine séance, progression, alertes.",""),
 ("onboarding","Onboarding","Parcours d'accueil des premières connexions.",""),
 ("cours","Mes cours","Ses cours et contenus, bornés à sa date d'arrivée dans la classe.",""),
 ("planning","Planning","Son planning de séances.",""),
 ("presences","Mes présences","Son assiduité séance par séance.",""),
 ("examens","Devoirs & Évaluations","Ses devoirs à rendre et ses évaluations.",""),
 ("resultats","Résultats","Ses notes et ses résultats.",""),
 ("objectifs","Objectifs & Certifications","Ses objectifs et les certifications visées.",""),
 ("session_live","Session Live","Rejoindre la séance en ligne.",""),
 ("ressources","Ressources","Fichiers partagés par son coach.",""),
 ("gamification","Gamification","Points, badges et niveaux.",""),
 ("minijeux","Mini-jeux","Jeux d'entraînement linguistique.",""),
 ("dictionnaire","Dictionnaire","Dictionnaire intégré.",""),
 ("paiement","Paiement","Ses échéances, paiement en ligne, historique des versements.",""),
 ("boutique","Boutique","Commandes dans la boutique BET.",""),
 ("monprofil","Mon profil","Ses informations, son niveau et son historique de tests.",""),
 ("temoignage","Mon témoignage","Dépôt d'un témoignage publiable sur le site.",""),
 ("messages","Messages","Messagerie avec son coach et sa classe.",""),
 ("contacts","Contacts & Support","Coordonnées utiles et demande d'assistance.",""),
 ("notifications_appr","Notifications","Centre de notifications.",""),
]

O["Parent"] = [
 ("vue","Vue d'ensemble","Synthèse du parcours de son enfant.",""),
 ("seances","Séances","Séances passées et à venir.",""),
 ("presences","Présences","Assiduité de son enfant.",""),
 ("devoirs","Devoirs","Devoirs donnés et rendus.",""),
 ("ressources","Ressources","Fichiers partagés par le coach.",""),
 ("resultats","Résultats","Notes et résultats.",""),
 ("evaluation","Évaluer le coach","Dépôt d'une évaluation du coach.",""),
 ("paiement","Paiement","Échéances et paiement en ligne.",""),
 ("notifications","Notifications","Centre de notifications.",""),
 ("contact","Contactez BET","Prise de contact avec l'équipe.",""),
]

O["Marketing"] = [("—","Écran du Super Admin","Le rôle marketing ouvre le tableau de bord Super Admin : pas d'écran propre. Onglets utiles : Tableau de bord marketing, Campagnes & Newsletters, Média, Trafic web, Boutique, Sondages.","Partagé")]

# Modules transverses : (module, adresse, fichiers, lignes, description)
MODULES = [
 ("Gestion des droits", "/gestion-droits",   1, 2306, "Matrice des permissions par rôle et par domaine ; commande ce que chaque profil peut voir et modifier."),
 ("Administration",     "/administration",   2,  878, "Référentiels : centres, paramètres métier."),
 ("Admin (sous-pages)", "divers",           10, 3794, "Écrans d'administration : configuration du site public, référentiels, outils internes."),
 ("Cours",              "/courses",          1,  970, "Catalogue des cours et contenus."),
 ("Bulletins",          "/bulletins",        1,  849, "Édition des bulletins de notes."),
 ("Examens",            "/exams",            1,  583, "Examens et sessions d'évaluation."),
 ("Salles",             "/rooms",            1,  418, "Salles des centres et leur occupation."),
 ("Classes",            "/classes",          1,  312, "Liste des classes."),
 ("Sessions",           "/session",          1,  251, "Sessions de formation."),
 ("Statistiques",       "/statistiques",     1,  393, "Statistiques transverses."),
 ("Notifications",      "/notifications",    1,  289, "Centre de notifications commun."),
 ("Outils",             "/outils",           2, 1077, "Outils internes."),
 ("Test de niveau",     "/test-niveau",      1, 1087, "Administration du test de niveau côté personnel."),
 ("Traçabilité",        "/actions",          1,    0, "Journal des actions du personnel."),
 ("Portail d'accès",    "/access",           2,    0, "Sas d'accès au formulaire de connexion du personnel."),
]

# Circuits traversant plusieurs profils : (circuit, profils, description, remarque)
CIRCUITS = [
 ("Demande de transfert d'un apprenant",
  "Coach → Agent placement test → Onboarding ou Assistante présentiel",
  "Le coach signale un apprenant mal placé avec un motif ; l'agent placement test fait passer le niveau ; "
  "l'onboarding (classes en ligne) ou l'assistante du centre (présentiel) exécute le changement de classe. "
  "Le bouton de réaffectation reste fermé jusqu'au retour du test.",
  "Opérationnel. File partitionnée par canal."),
 ("Test de niveau",
  "Site public ou Assistante commerciale → Agent placement test → tous les écrans de suivi",
  "Passage en ligne depuis le site, ou évaluation en présentiel saisie par l'agent. Correction des réponses "
  "orales, attribution du niveau, historique des passages conservé et affiché sur 7 espaces.",
  "Opérationnel."),
 ("Observation de cours et catégorie de contrat",
  "Deputy → Superviseur global → Conseiller pédagogique → RH & Paie",
  "Le deputy observe et note sur 5 critères ; le superviseur corrige et valide ; la note détermine la "
  "catégorie de contrat du coach, qui commande sa grille d'honoraires.",
  "Opérationnel."),
 ("Échéancier mensuel et relances",
  "Assistante commerciale → Apprenant / Parent → Comptable",
  "Plan de paiement mensuel, génération automatique du mois suivant par tâche planifiée quotidienne, "
  "relances J-7 / J-3 / J-1 à l'apprenant et à l'assistante, paiement en ligne.",
  "Opérationnel."),
 ("Honoraires des coachs",
  "Coach → Conseiller pédagogique → RH & Paie → Comptable",
  "Séances réalisées valorisées sur la grille (grade, canal, niveau, durée), validées par le conseiller "
  "pédagogique, puis payées.",
  "Opérationnel."),
 ("Entrée en formation (kick-off)",
  "Assistante commerciale → Assistante onboarding → Coach → Apprenant",
  "Conversion du dossier, création des accès, envoi du kick-off, affectation en classe, suivi des "
  "premières séances.",
  "Opérationnel."),
 ("Migration en ligne ↔ présentiel",
  "Client → Assistante commerciale / Onboarding",
  "Changement de canal du programme avec ajustement de la mensualité au mois suivant.",
  "NON RÉALISÉ. Analysé le 28/09/2026 : 5 ruptures identifiées, 3 décisions en attente."),
]

# Briques partagées notables : (brique, type, sert à, profils concernés)
BRIQUES = [
 ("PlanningClasse",        "Composant", "Emploi du temps hebdomadaire et séances d'une classe", "Superviseur, Deputy, Onboarding, PA"),
 ("HistoriqueTestsNiveau", "Composant", "Historique complet des tests de niveau d'un apprenant", "7 espaces"),
 ("DemandeTransfert",      "Composant", "Demande de transfert et file des dossiers à réaffecter", "Coach, Placement, Onboarding, Commercial, PA"),
 ("FiltrePeriode",         "Composant", "Filtrage par date et pagination", "Superviseur, Onboarding, PA"),
 ("EvolutionNiveauTests",  "Composant", "Frise de progression de niveau", "7 espaces"),
 ("NiveauApprenant",       "Composant", "Badge de niveau et ancien niveau", "Coach, Onboarding, Commercial"),
 ("AppreciationSeance",    "Composant", "Appréciation d'une séance par l'apprenant", "Apprenant, Superviseur, PA"),
 ("NotificationsTab",      "Composant", "Onglet notifications commun", "Tous les profils"),
 ("MonProfilModal",        "Composant", "Fiche profil de l'utilisateur connecté", "Tous les profils"),
 ("fichePdfApprenant",     "Utilitaire","Fiche apprenant en PDF, charte commune", "Commercial, PA, Onboarding, Coach, Superviseur, Admin, Super Admin"),
 ("genererPDF",            "Utilitaire","Gabarit PDF BET : en-tête, bandeau, pied de page", "Tous les exports"),
 ("exporterExcelStyle",    "Utilitaire","Exports Excel mis en forme", "La plupart des profils"),
 ("urlDocument",           "Utilitaire","Lecture sécurisée des documents stockés", "Tous les écrans avec fichiers"),
 ("categorieCoach",        "Utilitaire","Barème d'appraisal et catégorie de contrat", "Superviseur, PA, RH"),
 ("criteresObservation",   "Utilitaire","Libellés et barème des 5 critères d'observation", "Superviseur, Deputy, PA"),
 ("inactivite",            "Utilitaire","Déconnexion automatique après inactivité", "Tous les profils"),
 ("classePrivee",          "Utilitaire","Distinction classe privée / classe de groupe", "PA, Onboarding, Commercial"),
]

# ══════════════════════════════════════════════════════════════════════════════
#  MISE EN FORME
# ══════════════════════════════════════════════════════════════════════════════

def entete(ws, colonnes, ligne=1):
    """colonnes : [(titre, largeur, saisie?)]"""
    for j, (titre, largeur, saisie) in enumerate(colonnes, start=1):
        c = ws.cell(row=ligne, column=j, value=titre)
        c.font = Font(name=SANS, size=9, bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor=FOND_SAISIE if saisie else FOND_ENTETE)
        if saisie:
            c.font = Font(name=SANS, size=9, bold=True, color="8A5A00")
        c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        c.border = BORD
        ws.column_dimensions[get_column_letter(j)].width = largeur
    ws.row_dimensions[ligne].height = 26

def ligne(ws, r, valeurs, colonnes, gras_col0=True, bande=False, couleur_etat=None):
    for j, v in enumerate(valeurs, start=1):
        c = ws.cell(row=r, column=j, value=v)
        saisie = colonnes[j-1][2] if j-1 < len(colonnes) else False
        c.font = Font(name=SANS, size=9.5, bold=(gras_col0 and j == 1),
                      color=INK if not saisie else MUTED)
        c.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
        c.border = BORD
        if saisie:
            c.fill = PatternFill("solid", fgColor=FOND_SAISIE)
        elif bande:
            c.fill = PatternFill("solid", fgColor=FOND_BANDE)
    if couleur_etat:
        ws.cell(row=r, column=len(valeurs)).font = Font(name=SANS, size=9.5, bold=True, color=couleur_etat)

def titre_feuille(ws, titre, sous_titre, nb_cols):
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=nb_cols)
    c = ws.cell(row=1, column=1, value=titre)
    c.font = Font(name=SANS, size=15, bold=True, color=NAVY)
    c.alignment = Alignment(vertical="center")
    ws.row_dimensions[1].height = 24
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=nb_cols)
    c = ws.cell(row=2, column=1, value=sous_titre)
    c.font = Font(name=SANS, size=9.5, color=MUTED)
    ws.row_dimensions[2].height = 16

# ══════════════════════════════════════════════════════════════════════════════
#  FEUILLE 1 — SYNTHÈSE
# ══════════════════════════════════════════════════════════════════════════════
ws = wb.active
ws.title = "Synthèse"
ws.sheet_view.showGridLines = False

ws["A1"] = "BINNIE'S ENGLISH TRAINING"
ws["A1"].font = Font(name=MONO, size=9, bold=True, color=CYAN)
ws["A2"] = "Inventaire des tableaux de bord"
ws["A2"].font = Font(name=SANS, size=20, bold=True, color=INK)
ws["A3"] = ("Profils, espaces, onglets et fonctionnalités de l'application « dash », "
            "relevés dans le code source.")
ws["A3"].font = Font(name=SANS, size=10.5, color=MUTED)
ws["A4"] = "Relevé du 28 septembre 2026  ·  application React  ·  174 fichiers  ·  156 305 lignes"
ws["A4"].font = Font(name=MONO, size=9, bold=True, color=INK)
for c in ("A1", "A2", "A3", "A4"):
    ws[c].alignment = Alignment(vertical="center")
ws.row_dimensions[2].height = 28

# CALCULÉS, PAS SAISIS. Un chiffre écrit à la main dans l'en-tête finit par contredire le
# tableau qu'il résume dès la première mise à jour ; celui-ci ne peut pas.
NB_ONGLETS = sum(len([o for o in v if o[0] != "—"]) for v in O.values())
NB_ESPACES = len({p[3].split(" ")[0] for p in PROFILS})
CHIFFRES = [(len(PROFILS), "profils"), (NB_ESPACES, "espaces distincts"), (NB_ONGLETS, "onglets"),
            (303, "points d'API appelés"), (len(MODULES), "modules transverses"),
            (46, "composants partagés")]
for j, (n, l) in enumerate(CHIFFRES, start=1):
    c = ws.cell(row=6, column=j, value=n)
    c.font = Font(name=MONO, size=18, bold=True, color=NAVY)
    c.alignment = Alignment(horizontal="center")
    c = ws.cell(row=7, column=j, value=l)
    c.font = Font(name=SANS, size=8.5, color=MUTED)
    c.alignment = Alignment(horizontal="center", wrap_text=True)
ws.row_dimensions[6].height = 26

COLS_SYN = [("Profil", 26, False), ("Rôle technique", 21, False), ("Adresse d'entrée", 32, False),
            ("Fichier", 34, False), ("Lignes", 9, False), ("Onglets", 9, False),
            ("Complexité", 13, True), ("Charge (j)", 11, True), ("Commentaire", 40, True)]
entete(ws, COLS_SYN, ligne=9)

r = 10
total_onglets = 0
for nom, role, adresse, fichier, lignes in PROFILS:
    ongs = O.get(nom, [])
    n = len([o for o in ongs if o[0] != "—"])
    total_onglets += n
    ligne(ws, r, [nom, role, adresse, fichier,
                  lignes if lignes else "partagé", n if n else "—", "", "", ""],
          COLS_SYN, bande=(r % 2 == 0))
    r += 1

ligne(ws, r, ["TOTAL", "", "", "", 156305, total_onglets, "", "", ""], COLS_SYN)
for j in range(1, len(COLS_SYN) + 1):
    ws.cell(row=r, column=j).font = Font(name=SANS, size=9.5, bold=True, color=NAVY)
    ws.cell(row=r, column=j).fill = PatternFill("solid", fgColor="E8EDF8")

r += 3
ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=9)
c = ws.cell(row=r, column=1, value="Comment cet inventaire a été établi")
c.font = Font(name=SANS, size=11, bold=True, color=INK)
r += 1
for txt in [
  "Les profils viennent de la table de routage de la page de connexion du personnel ; les onglets sont relevés un par un "
  "dans le code de chaque tableau de bord, et leurs libellés sont ceux réellement affichés. C'est donc l'inventaire de ce "
  "qui EXISTE, y compris des écrans qu'aucun menu ne met en avant.",
  "Les colonnes Complexité, Charge et Commentaire sont volontairement vides : elles sont là pour la cotation. Aucune "
  "estimation d'effort n'a été portée dans ce classeur — elle ne se lit pas dans le code, et l'y écrire lui donnerait "
  "l'apparence d'un fait relevé.",
  "Deux profils n'ont pas d'écran propre : le rôle Marketing ouvre le tableau de bord Super Admin, et le Deputy "
  "Superviseur partage celui du Superviseur global avec une navigation réduite. Ils sont comptés comme profils, pas "
  "comme espaces.",
  "Ne sont pas couverts : le site public binniesenglish.net (inventaire séparé du 26/09/2026), la plateforme "
  "e-learning, et le serveur — ce dernier étant sollicité par 303 points d'entrée différents depuis cette seule application.",
]:
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=9)
    c = ws.cell(row=r, column=1, value=txt)
    c.font = Font(name=SANS, size=9.5, color=MUTED)
    c.alignment = Alignment(wrap_text=True, vertical="top")
    ws.row_dimensions[r].height = 30
    r += 1

ws.freeze_panes = "A10"

# ══════════════════════════════════════════════════════════════════════════════
#  FEUILLE 2 — ONGLETS PAR PROFIL
# ══════════════════════════════════════════════════════════════════════════════
ws2 = wb.create_sheet("Onglets par profil")
ws2.sheet_view.showGridLines = False
COLS = [("Profil", 24, False), ("Rôle technique", 19, False), ("N°", 5, False),
        ("Onglet", 27, False), ("Ce qu'on y fait", 72, False), ("État", 11, False),
        ("Complexité", 13, True), ("Charge (j)", 11, True), ("Commentaire", 34, True)]
titre_feuille(ws2, "Onglets par profil",
              "Une ligne par onglet de navigation principale. Les trois dernières colonnes sont à remplir pour la cotation.",
              len(COLS))
entete(ws2, COLS, ligne=4)

r = 5
role_par_profil = {p[0]: p[1] for p in PROFILS}
for nom, _role, _adr, _f, _l in PROFILS:
    ongs = O.get(nom, [])
    if not ongs:
        continue
    for i, (cle, lib, desc, etat) in enumerate(ongs, start=1):
        coul = None
        if etat == "Ébauche":
            coul = ROUGE
        elif etat == "Partagé":
            coul = MUTED
        ligne(ws2, r, [nom, role_par_profil[nom], i if cle != "—" else "—",
                       lib, desc, etat or "Opérationnel", "", "", ""],
              COLS, bande=(i % 2 == 0))
        ws2.cell(row=r, column=6).font = Font(name=SANS, size=9,
                                             bold=bool(coul), color=coul or VERT)
        r += 1

ws2.auto_filter.ref = f"A4:I{r-1}"
ws2.freeze_panes = "A5"

# ══════════════════════════════════════════════════════════════════════════════
#  FEUILLE 3 — MODULES TRANSVERSES
# ══════════════════════════════════════════════════════════════════════════════
ws3 = wb.create_sheet("Modules transverses")
ws3.sheet_view.showGridLines = False
COLS3 = [("Module", 26, False), ("Adresse", 22, False), ("Fichiers", 9, False),
         ("Lignes", 9, False), ("Ce qu'il fait", 70, False),
         ("Complexité", 13, True), ("Charge (j)", 11, True), ("Commentaire", 34, True)]
titre_feuille(ws3, "Modules transverses",
              "Écrans accessibles hors tableau de bord, partagés par plusieurs profils selon leurs droits.",
              len(COLS3))
entete(ws3, COLS3, ligne=4)
r = 5
for i, (m, adr, nf, nl, desc) in enumerate(MODULES, start=1):
    ligne(ws3, r, [m, adr, nf, nl if nl else "—", desc, "", "", ""], COLS3, bande=(i % 2 == 0))
    r += 1
ws3.auto_filter.ref = f"A4:H{r-1}"
ws3.freeze_panes = "A5"

# ══════════════════════════════════════════════════════════════════════════════
#  FEUILLE 4 — CIRCUITS TRANSVERSES
# ══════════════════════════════════════════════════════════════════════════════
ws4 = wb.create_sheet("Circuits transverses")
ws4.sheet_view.showGridLines = False
COLS4 = [("Circuit", 34, False), ("Profils traversés", 44, False),
         ("Ce qui se passe", 78, False), ("État", 46, False),
         ("Complexité", 13, True), ("Charge (j)", 11, True), ("Commentaire", 34, True)]
titre_feuille(ws4, "Circuits transverses",
              "Ce que la cotation par écran sous-estime : un même besoin traverse plusieurs profils, et c'est le passage de relais qui coûte.",
              len(COLS4))
entete(ws4, COLS4, ligne=4)
r = 5
for i, (c1, c2, c3, c4) in enumerate(CIRCUITS, start=1):
    ligne(ws4, r, [c1, c2, c3, c4, "", "", ""], COLS4, bande=(i % 2 == 0))
    if c4.startswith("NON RÉALISÉ"):
        ws4.cell(row=r, column=4).font = Font(name=SANS, size=9.5, bold=True, color=ROUGE)
    ws4.row_dimensions[r].height = 46
    r += 1
ws4.freeze_panes = "A5"

# ══════════════════════════════════════════════════════════════════════════════
#  FEUILLE 5 — BRIQUES PARTAGÉES
# ══════════════════════════════════════════════════════════════════════════════
ws5 = wb.create_sheet("Briques partagées")
ws5.sheet_view.showGridLines = False
COLS5 = [("Brique", 26, False), ("Type", 12, False), ("Sert à", 62, False),
         ("Profils concernés", 56, False),
         ("Complexité", 13, True), ("Charge (j)", 11, True), ("Commentaire", 34, True)]
titre_feuille(ws5, "Briques partagées",
              "Composants et utilitaires mutualisés : chiffrés une fois, ils servent plusieurs profils. 46 composants et 32 utilitaires au total, les plus structurants ci-dessous.",
              len(COLS5))
entete(ws5, COLS5, ligne=4)
r = 5
for i, (b, t, s, p) in enumerate(BRIQUES, start=1):
    ligne(ws5, r, [b, t, s, p, "", "", ""], COLS5, bande=(i % 2 == 0))
    r += 1
ws5.auto_filter.ref = f"A4:G{r-1}"
ws5.freeze_panes = "A5"

wb.properties.title = "Inventaire des tableaux de bord BET"
wb.properties.subject = "Profils, espaces, onglets et fonctionnalités — relevé du 28 septembre 2026"
wb.properties.creator = "Binnie's English Training"

wb.save(CIBLE)
print("écrit :", CIBLE)
print(f"  {len(PROFILS)} profils · {total_onglets} onglets · {len(MODULES)} modules · "
      f"{len(CIRCUITS)} circuits · {len(BRIQUES)} briques")
