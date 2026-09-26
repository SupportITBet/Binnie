Ajouter et gérer les profils professeurs (infos personnelles, certifications, expériences). 

Configuration globale de la plateforme (niveaux, groupes, horaires, paramètres). Reporting exécutif

KPIs et reporting

pour les devoirs a rendre , les apprenants doivent pouvoir les uploader en ligne pour que le prof recoit 

Calendrier des évaluations


propose moi un tableau csv qui sera importé par TLG lors de l'inscription :
•	Données à fournir par bénéficiaire : Nom, Prénom, Âge, Nom et prénom du parent, Contact & Email du parent.

•	Inscrire les bénéficiaires (enfants d'employés) par : saisie manuelle, import CSV, ou transmission de liste à l'équipe Onboarding BET
•	Données à fournir par bénéficiaire : Nom, Prénom, Âge, Nom et prénom du parent, Contact & Email du parent


comment rendre la plateforme e-learning plus modulables pour toutes les autres entreprises qui viendont auront des etudiants ou des adultes ou leurs salariés qui travaille a leur sein . Pas seulement pour TLG mais globalement
comment faire de tel sorte que l'Agent Testment Agent puisse creer differents test de niveaux pour toutes autres personnes car le but final de cette plateforme est de servir tout le monde 
(Adultes , enfant/ado , etc...) car les entreprises inscrrons leurs employés pour faire des formations sur notre plateforme



meme apres la creation des compte par l'onboarding il faut mettre un blocage de tel sort que l'apprenant passe dabord le test de niveau pour accéder a son espace et son groupe assigné.

le bloc kanban et cartes cliquables 

Structure des niveaux et des groupes

Débutant	A1 / A2	6–12 ans (principalement)	25–40 enfants
Intermédiaire	B1 / B2	11–17 ans (principalement)	25–40 enfants

Réalisation du test	L'enfant réalise le test adaptatif (20–30 questions : compréhension, vocabulaire, grammaire). Interface adaptée à l'âge.	Apprenant
Score automatique :	Calcul du score brut → attribution d'un niveau CECR provisoire (A1/A2/B1/B2).	Système

les modals semblement etre petit je veux que tu elargis un peu plus les modals des details profs ( dashboard Admin bet et le superviseur)


lorsque je programme un devoir a rendre je dois pouvoir les receptionner mais imaginons que le prof ait plusieurs classes et des devoirs a recuperer donc 

comme je l'ai dit tout doit etre modulable pour tout age (enfant , adulte , particulier de l'entreprise ), l'ajout du support

revoir le moal de creation de devoir si on fera pareil avec la création des modules et cours

j'ai une autre preoccupation , c'est bien deja le coté a rendre cest bon mais le soir peut etre fais sur la plateforme aussi 

je dois revoir les tabs de nav des differents apprenants 


Onboarding / PA - Contenus	Upload des vidéos et contenus d'onboarding (présentation, règles, processus jusqu'au certificat). Gérer la bibliothèque de ressources.


Documents générés automatiquement
•	Bulletin trimestriel PDF par apprenant (notes, commentaires prof, progression, assiduité)
•	Rapport mensuel de formation pour TLG PHARMA (par groupe + global)
•	Attestation de participation (fin de chaque cycle/trimestre)
•	Certificat de fin de programme (si critères validés : présence ≥ 75% + score ≥ 70%)
•	Récapitulatif mensuel des honoraires professeurs (export PDF/Excel)


Alertes automatiques
•	Absence de l'apprenant à 2 sessions consécutives → alerte email au parent + Customer Care
•	Devoir non rendu après la date limite → rappel à l'apprenant + notification parent
•	Note < 40% à une évaluation → alerte au professeur + E-learning Assistant
•	Absence du professeur non signalée 24h avant le cours → alerte au Superviseur


Déroulement type d'une session

Étape	: Description / Action	: Acteur(s)
J-1 : Rappel automatique	:Email + notification in-app au parent et à l'apprenant : « Votre cours de demain samedi à 9h00 ».	: Système → Parent + Apprenant
H-15min : Activation salle	Le bouton « Rejoindre le cours » devient actif dans l'espace de l'apprenant et du professeur.	: Système
Ouverture salle par le prof	: Le professeur ouvre la salle virtuelle et active le cours. Lancement du chronomètre de durée.	: Professeur
Entrée des apprenants	: Les apprenants rejoignent la salle via le bouton. Accès refusé aux non-inscrits du groupe.	: Apprenants
Déroulement du cours	: Partage d'écran, tableau blanc, exercices interactifs, chat, levée de main virtuelle.	: Professeur + Apprenants
Saisie des présences	: Le professeur saisit les présences pendant ou immédiatement après le cours.	: Professeur
Clôture & Enregistrement	: Fin du cours, arrêt de l'enregistrement. La session est archivée et disponible en replay sous 2h.	: Professeur + Système
Post-session	: Le professeur peut publier un résumé et les devoirs de la semaine depuis son espace.	: Professeur

Outil de visioconférence
ℹ️  Note : Recommandation : intégration Zoom (API Zoom Meeting) ou Google Meet (Calendar API). Le lien de la salle virtuelle est généré automatiquement par le système et inséré dans le planning de chaque apprenant et professeur. L'option d'une salle native intégrée peut être étudiée en Phase 2.

Option	Avantages	Contraintes
Zoom API	: Familier pour tous, robuste, enregistrement natif, tableau blanc intégré	Coût licence Zoom, limite 40 min en version gratuite
Google Meet : API	Gratuit, pas de limite de durée, intégration Google Calendar	Moins de fonctionnalités pédagogiques natives
Solution native : 	Expérience unifiée, contrôle total des fonctionnalités	Développement plus long, coût plus élevé

tu dois integrer ce systeme d'inscription pareil dans le dashboard onboarding Classes car l'entreprise peut transmettre le fichier excel et onboarding creera directement l'inscription et les comptes .



on doit pouvoir ajouter une nouvelle inscription (apprenant)
 de la part de onboarding mais apres la création de la classe 


pour l'administration interne BET c'est seulement BET qui s'affiche contrairement aux profils des entreprises qui doivent s'adapter



RDV 06/06/26
- "Programme multiple" des sessions où le prof peut saisir d'un coup 10, 12, 14 sessions (ou plus) avec un modèle commun.
assimiliés les cours aux sessions

- intégration des types de contrats des coachs : freelance , Consultant , Stagiaire , permanent 

- Ajout des liens des plateformes : Teams , Zoom , google meet , jitsi 

- intégration des modules de cours a la programmation des nouvelles sessions

- Intégrer les couleurs (chartes graphiques ) des entreprises lors de la création de leur profil

- intégration du module d'evauation des coachs (1 fois/semaine et calcul moyenne /mois)

- intégration du module evaluation enfant (chque 3mois , une evaluation /examen****) et rapport de progression mensuelle

- intégration des modules d'activation/désactivation du mode replay des enregistrements des sessions lives (zoom , meet , teams...)

- intégration du module de blocage de compte apprenant automatique  pour des absences consécutives (4 fois) et deblocages par customer care

- intégration de l'onglet session live chez le parent de l'enfant 

- Architecture hybride de la plateforme :

Cours Présentiel
  ├── Séance physique (centre BET / locaux entreprise / autre lieu)
  └── Médiathèque → accessible dans l'espace apprenant
        └── Supports déposés par le coach

Cours Ligne
  ├── Session Zoom/Meet/Teams (lien de connexion)
  └── Médiathèque → accessible dans l'espace apprenant
        └── Supports déposés par le coach


Une entreprise cliente peut souscrire à l'un ou aux deux volets selon ses besoins (ex : cours online pour ses télétravailleurs + sessions groupées en centre pour ses équipes locales).

Un coach/prof peut avoir des contrats mixtes - il dispense des cours en présentiel dans un centre ET des sessions en ligne.

La médiathèque sert les deux volets : un prof dépose ses supports (PDF, vidéos, exercices…) qui peuvent être accessibles aux apprenants en ligne ET utilisés comme ressources lors des séances en présentiel.

Les sessions ont donc un type : "ligne" ou "presentiel" (et potentiellement "hybride"), avec des champs différents selon le type (lien Zoom vs salle physique).



onboarding Classes --> choix du coach , faire un meilleur choix 

dans l'onglet Remplacement je dois pouvoir cliquer sur le prof (voir modal detail) et qui s'absente et voir les raisons ensuite assigner le prof remplacant mais tout ca dans un modal 
et tu propose le meilleur choix du prof selon les evaluations des profs 


le superviseur assigne les remplacements c'est ilogique 






dans le dashboard Onboarding Contenus , revoir le contenu de presentation lors de la premeiere connexion de l'apprenant , lon ne voit pas le contenu de la presentation que ca soit pour la video ou les autres points 



