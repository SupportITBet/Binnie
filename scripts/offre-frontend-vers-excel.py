# -*- coding: utf-8 -*-
"""
Produit l'offre chiffrable du site public BET (application « Frontend ») en classeur Excel.

MÊME GABARIT QUE L'OFFRE « P1 SITE WEB » et que celle des tableaux de bord : lots,
sous-totaux, total général, colonne Prix unitaire à saisir.

D'OÙ VIENNENT LES QUANTITÉS. De l'inventaire du site public déjà établi
(Backend/docs/Inventaire-site-public-BET.docx, relevé du 26/09/2026), recoupé avec le code
au 28/09/2026 : 24 pages, 6 parcours guidés, 25 fonctionnalités transverses, 6 services
extérieurs, 16 formulaires, 71 points d'API appelés.

LE PRIX N'EST PAS RENSEIGNÉ, ET C'EST VOULU. Il ne se lit pas dans le code ; l'écrire ici lui
donnerait l'autorité du relevé alors qu'il serait une invention. Tout le reste est calculé.

    python offre-frontend-vers-excel.py <fichier.xlsx>
"""
import sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

CIBLE = sys.argv[1]

NAVY, CYAN, INK, MUTED = "1B3080", "0891B2", "12161D", "5C6573"
BANDE_LOT, BANDE_OCRE = "1F3864", "BF9000"
FOND_SAISIE, FOND_ENTETE, FOND_BANDE = "FFF7E6", "1B3080", "F2F4FA"
ROUGE, VERT = "AE2128", "15703F"
SANS, MONO = "Calibri", "Consolas"
FIN = Side(style="thin", color="D5DBE6")
BORD = Border(left=FIN, right=FIN, top=FIN, bottom=FIN)

wb = Workbook()

# ══════════════════════════════════════════════════════════════════════════════
#  LES DONNÉES — reprises de l'inventaire du site public
# ══════════════════════════════════════════════════════════════════════════════

PAGES_CONTENU = [
 ("/", "Accueil", "Carrousel administrable, programmes, coachs, équipe administrative, témoignages, blog, partenaires, bandeau catalogue PDF"),
 ("/about", "À propos", "Présentation de BET, histoire, chiffres, équipe"),
 ("/faq", "FAQ", "Questions administrables depuis le back-office, coordonnées de contact"),
 ("/contact", "Contact", "Formulaire de contact, coordonnées et numéros WhatsApp lus depuis la configuration serveur"),
 ("/temoignages", "Témoignages", "Avis publiés, filtres et recherche"),
 ("/blog", "Blog — liste", "Articles publiés depuis le back-office"),
 ("/blog/:id", "Blog — article", "Article complet"),
 ("/bet-for-business", "BET for Business", "Offre entreprise, clients publics, logos partenaires"),
 ("/boutique", "Boutique", "Produits actifs, panier, favoris, commandes"),
]
PAGES_CATALOGUE = [
 ("/cours/:type", "Fiche format de cours", "En ligne, en cabinet ou à domicile : contenu, formules, avis, codes promo, accès à l'inscription"),
 ("/certification/:certId", "Fiche certification", "TOEIC, TOEFL, IELTS : préparation, tarifs, avis, codes promo"),
 ("/centre/:centerId", "Fiche centre", "Bouaké, Angré, Abatta, Yopougon, Koumassi, II Plateaux"),
 ("/service/:serviceId", "Fiche service", "Séjour linguistique, préparation d'interviews, plateforme des natifs, interprétariat"),
]
PAGES_COMPTE = [
 ("/parcours/particulier", "Point d'entrée particulier", "Orientation vers le bon parcours, dépôt d'un contact avant inscription complète"),
 ("/parcours/inscription", "Tunnel d'inscription", "Cinq étapes, du type de coaching aux coordonnées"),
 ("/test-niveau", "Test de niveau gratuit", "Le plus gros écran du site : questionnaire chronométré, épreuve orale enregistrée, résultat CECRL"),
 ("/mon-espace", "Espace personnel", "Deux visages : prospect avant inscription, apprenant après"),
 ("/connexion", "Connexion", "Mot de passe ou compte Google"),
 ("/update-password", "Nouveau mot de passe", "Atterrissage du lien reçu par courriel"),
 ("/paiement/retour", "Retour de paiement", "Résultat de la transaction, reçu téléchargeable en PDF"),
 ("/paiement/relancer", "Relance de paiement", "Reprise d'un paiement interrompu"),
]
PAGES_CAMPAGNE = [
 ("/f/:slug", "Formulaire de campagne", "La page qu'ouvre un QR code imprimé. Adresse volontairement courte : elle se dicte à l'oral et tient sur une affiche"),
 ("/lead-magnet/audit-gratuit", "Audit gratuit", "Formulaire de demande d'audit pour les entreprises"),
 ("/lead-magnet/merci", "Remerciement", "Page d'atterrissage après envoi"),
]
PAGES = ([("Contenu", *p) for p in PAGES_CONTENU]
       + [("Catalogue", *p) for p in PAGES_CATALOGUE]
       + [("Compte & paiement", *p) for p in PAGES_COMPTE]
       + [("Campagne", *p) for p in PAGES_CAMPAGNE])

PARCOURS = [
 ("Inscription d'un adulte", "Fenêtre ouverte depuis la navigation", "11 états",
  "Le chemin se dédouble dès la première question : type de coaching, offre et formule, branche présentiel avec "
  "choix du centre trié par distance, cours à domicile avec saisie d'adresse, choix de l'assistante parmi celles "
  "réellement disponibles, connexion facultative pour pré-remplir, récapitulatif et confirmation. "
  "La progression est conservée : un visiteur interrompu reprend où il s'était arrêté."),
 ("Inscription d'un enfant", "Fenêtre ouverte depuis « Inscription »", "6 étapes",
  "Informations sur l'enfant, informations du parent, offre et formule filtrées sur celles pertinentes pour un "
  "enfant, modalité en ligne ou présentiel, récapitulatif, confirmation. 1 286 lignes."),
 ("Demande d'une entreprise", "Fenêtre ouverte depuis « BET for Business »", "3 étapes",
  "Votre entreprise (raison sociale, contact, effectif à former), niveau et objectifs CECRL, format et rythme "
  "souhaités. 503 lignes."),
 ("Centres en ligne", "Fenêtre dédiée", "3 étapes",
  "Offres puis choix de la formule, connexion obligatoire à cette étape, récapitulatif et accusé de réception. "
  "1 180 lignes."),
 ("Tunnel d'inscription", "Page /parcours/inscription", "5 étapes",
  "Type de coaching, mode d'apprentissage, lieu (cabinet ou centre le plus proche), choix de l'assistante avec "
  "sa photo, coordonnées et envoi."),
 ("Test de niveau gratuit", "Page /test-niveau", "6 écrans",
  "Formulaire d'identité, questionnaire à choix multiple chronométré des niveaux A1 à C2, épreuve orale "
  "enregistrée au microphone et envoyée au serveur, expression écrite, résultat CECRL. L'avancement est "
  "enregistré à chaque réponse : une coupure ne fait pas perdre le test. 2 973 lignes."),
]

TRANSVERSES = [
 ("Navigation et comptes", "Barre de navigation", "Accueil, Apprenez l'anglais, Certifications, Centres physiques, BET for Business, Boutique, FAQ, Contact, Mon espace — c'est elle qui héberge les quatre fenêtres d'inscription"),
 ("Navigation et comptes", "Recherche dans le catalogue", "Depuis la barre de navigation"),
 ("Navigation et comptes", "Connexion", "Mot de passe ou compte Google ; mot de passe oublié et renouvellement par courriel"),
 ("Navigation et comptes", "Bandeau de session active", "Signale une session déjà ouverte"),
 ("Navigation et comptes", "Bilingue français / anglais", "Bascule depuis la barre de navigation"),
 ("Contact et conversation", "Chat avec son assistante", "Bouton flottant portant la photo de l'assistante attitrée, messages en temps réel, signal sonore ; le conseiller retrouve la même conversation depuis son tableau de bord"),
 ("Contact et conversation", "Bouton WhatsApp", "Numéros lus depuis la configuration serveur, jamais écrits en dur"),
 ("Contact et conversation", "Liens cliquables", "Les adresses saisies dans un message le deviennent automatiquement"),
 ("Commerce et promotions", "Codes promo", "Saisis et validés par le serveur sur les fiches de cours, les certifications et les parcours d'inscription"),
 ("Commerce et promotions", "Bandeau de promotions", "Promotions actives affichées automatiquement"),
 ("Commerce et promotions", "Bandeau déroulant et carrousel d'accueil", "Administrables, avec une durée d'affichage réglable par photo"),
 ("Commerce et promotions", "Catalogue PDF", "Bandeau de téléchargement du catalogue BET"),
 ("Avis et contenus", "Avis", "Déposés et affichés sur les fiches de cours et de certification"),
 ("Avis et contenus", "Témoignages", "Page dédiée avec filtres et recherche ; un apprenant en dépose depuis son espace"),
 ("Avis et contenus", "Blog", "Articles administrés depuis le back-office"),
 ("Avis et contenus", "Photos d'équipe", "Coachs et équipe administrative, défilement à vitesse réglable"),
 ("Avis et contenus", "Newsletter", "Inscription depuis le pied de page et depuis le blog ; la désinscription passe par le serveur pour fonctionner depuis un logiciel de messagerie"),
 ("Référencement et mesure", "Balises SEO par page", "Et balisage OrganizationSchema pour les moteurs de recherche"),
 ("Référencement et mesure", "Google Analytics 4", "Treize événements suivis, dont generate_lead, begin_checkout, purchase, test_niveau_commence et termine, contact_whatsapp"),
 ("Référencement et mesure", "Paramètres de campagne (UTM)", "Capturés à l'arrivée et conservés jusqu'à la conversion, pour savoir d'où vient réellement un inscrit"),
 ("Référencement et mesure", "Vues comptées côté serveur", "En plus de GA4, pour ne pas dépendre des bloqueurs de publicité"),
 ("Confort de navigation", "Écran d'accueil au chargement", "En fondu"),
 ("Confort de navigation", "Remontée en haut de page", "À chaque changement d'écran"),
 ("Confort de navigation", "Chargement différé des pages", "Seule celle qu'on regarde est téléchargée"),
 ("Confort de navigation", "Notifications à l'écran", "Messages de confirmation et d'erreur en haut à droite"),
]

INTEGRATIONS = [
 ("API BET",            "Le serveur de la plateforme : 71 points d'entrée appelés depuis ce seul site", "Interne"),
 ("Supabase",           "Comptes et sessions : connexion par mot de passe, compte Google, renouvellement", "Abonnement"),
 ("Firebase",           "La conversation en temps réel entre le prospect et son assistante", "Abonnement"),
 ("TouchPoint",         "Paiement en ligne — mobile money et carte bancaire", "Commission"),
 ("Cloudinary",         "Images, pièces jointes et enregistrements audio du test de niveau", "Abonnement"),
 ("Google Analytics 4", "Mesure d'audience et suivi du tunnel de conversion", "Gratuit"),
]

CATALOGUE = [
 ("Formats de cours", "Cours en ligne · Cours aux cabinets · Cours à domicile"),
 ("Certifications",   "TOEIC · TOEFL · IELTS"),
 ("Centres",          "BET Bouaké · Angré · Abatta · Yopougon · Koumassi · II Plateaux"),
 ("Services",         "Séjour linguistique · Préparation d'interviews · Plateforme des natifs · Interprétariat"),
]

# ══════════════════════════════════════════════════════════════════════════════
#  L'OFFRE
# ══════════════════════════════════════════════════════════════════════════════
LOTS = [
 ("LOT A — CADRAGE, DESIGN ET SOCLE TECHNIQUE", None, None, None),
 ("Cadrage & direction artistique", "Réunion de lancement, brief, arborescence, validation du cahier des charges", 1, "forfait"),
 ("Maquettage UX/UI", "Maquettes haute fidélité de l'ensemble des écrans, cycles de révisions inclus", len(PAGES), "pages"),
 ("Socle React & routage", "Application React, routage de 24 adresses, chargement différé page par page, remontée en haut d'écran", 1, "forfait"),
 ("Barre de navigation & pied de page", "Navigation à 9 entrées hébergeant les quatre fenêtres d'inscription, recherche catalogue, pied de page et newsletter", 1, "forfait"),
 ("Site bilingue FR / EN", "Traduction de l'ensemble des écrans et bascule depuis la barre de navigation", 1, "forfait"),
 ("Responsive mobile-first", "Adaptation de tous les écrans aux mobiles, tablettes et grands écrans", 1, "forfait"),
 ("SOUS-TOTAL LOT A", None, None, "soustotal"),

 ("LOT B — PAGES DE CONTENU", None, None, None),
 ("Pages éditoriales", "Accueil, À propos, FAQ, Contact, Témoignages, Blog (liste et article), BET for Business, Boutique", len(PAGES_CONTENU), "pages"),
 ("Carrousel et bandeaux administrables", "Carrousel d'accueil et bandeau déroulant, durée d'affichage réglable par photo, pilotés depuis le back-office", 1, "forfait"),
 ("Blog & témoignages", "Liste, article, filtres et recherche, dépôt d'un témoignage depuis l'espace apprenant", 1, "forfait"),
 ("Boutique en ligne", "Produits actifs, panier, favoris, commandes", 1, "forfait"),
 ("SOUS-TOTAL LOT B", None, None, "soustotal"),

 ("LOT C — FICHES DU CATALOGUE", None, None, None),
 ("Gabarits de fiches dynamiques", "Format de cours, certification, centre, service — contenu, formules, tarifs, avis, codes promo, accès à l'inscription", len(PAGES_CATALOGUE), "gabarits"),
 ("Familles de catalogue présentées", "3 formats de cours, 3 certifications, 6 centres, 4 services", len(CATALOGUE), "familles"),
 ("Avis et notation", "Dépôt et affichage des avis sur les fiches de cours et de certification", 1, "forfait"),
 ("SOUS-TOTAL LOT C", None, None, "soustotal"),

 ("LOT D — PARCOURS GUIDÉS D'INSCRIPTION", None, None, None),
 ("Parcours d'inscription", "Adulte (11 états, chemin qui se dédouble), enfant (6 étapes), entreprise (3 étapes), centres en ligne, tunnel linéaire (5 étapes)", 5, "parcours"),
 ("Reprise de parcours interrompu", "La progression est conservée : un visiteur revenu retrouve son parcours là où il l'avait laissé", 1, "forfait"),
 ("Choix de l'assistante & des centres", "Assistantes réellement disponibles avec leur photo, centres triés par distance depuis la ville du visiteur, saisie d'adresse pour le domicile", 1, "forfait"),
 ("Formulaires du site", "Contact, audit gratuit, campagne, newsletter, avis, témoignage, inscriptions…", 16, "formulaires"),
 ("SOUS-TOTAL LOT D", None, None, "soustotal"),

 ("LOT E — TEST DE NIVEAU EN LIGNE", None, None, None),
 ("Test de niveau gratuit", "L'écran le plus lourd du site (2 973 lignes) : 6 écrans successifs, questionnaire chronométré A1 à C2, épreuve orale enregistrée au microphone, expression écrite, résultat CECRL", 1, "forfait"),
 ("Sauvegarde continue de l'avancement", "Chaque réponse est enregistrée sur le serveur : une coupure de connexion ne fait pas perdre le test", 1, "forfait"),
 ("Enregistrement et envoi audio", "Capture microphone, envoi et stockage des enregistrements de l'épreuve orale", 1, "forfait"),
 ("Lien pré-rempli & profil verrouillé", "Accès au test depuis un lien transmis par l'agent, sans connexion, avec profil déjà renseigné", 1, "forfait"),
 ("SOUS-TOTAL LOT E", None, None, "soustotal"),

 ("LOT F — COMPTE, ESPACE PERSONNEL ET PAIEMENT", None, None, None),
 ("Comptes & connexion", "Mot de passe ou compte Google, mot de passe oublié, renouvellement par courriel, bandeau de session active", 1, "forfait"),
 ("Espace personnel", "Deux visages selon l'état du visiteur : prospect avant inscription, apprenant après", 1, "forfait"),
 ("Paiement en ligne", "Mobile money et carte bancaire, retour de transaction, reçu PDF téléchargeable, reprise d'un paiement interrompu", 1, "forfait"),
 ("SOUS-TOTAL LOT F", None, None, "soustotal"),

 ("LOT G — ACQUISITION ET CAMPAGNES", None, None, None),
 ("Pages de campagne", "Formulaire ouvert par QR code à adresse courte, audit gratuit entreprise, page de remerciement", len(PAGES_CAMPAGNE), "pages"),
 ("Codes promo & promotions", "Saisie et validation serveur sur les fiches et les parcours, bandeau de promotions actives", 1, "forfait"),
 ("Newsletter", "Inscription depuis le pied de page et le blog, désinscription servie par le serveur", 1, "forfait"),
 ("Catalogue PDF", "Bandeau de téléchargement du catalogue BET", 1, "forfait"),
 ("SOUS-TOTAL LOT G", None, None, "soustotal"),

 ("LOT H — CONVERSATION ET RELATION PROSPECT", None, None, None),
 ("Chat temps réel avec l'assistante", "Bouton flottant à la photo de l'assistante attitrée, messages instantanés, signal sonore, liens cliquables ; la conversation est reprise côté conseiller", 1, "forfait"),
 ("Bouton WhatsApp", "Numéros lus depuis la configuration serveur, modifiables sans redéploiement", 1, "forfait"),
 ("SOUS-TOTAL LOT H", None, None, "soustotal"),

 ("LOT I — RÉFÉRENCEMENT ET MESURE D'AUDIENCE", None, None, None),
 ("SEO natif", "Balises par page, OrganizationSchema, sitemap, robots.txt", 1, "forfait"),
 ("Google Analytics 4", "Treize événements de conversion suivis, du premier contact à l'achat", 13, "événements"),
 ("Captation des campagnes (UTM)", "Paramètres capturés à l'arrivée et conservés jusqu'à la conversion, pour attribuer un inscrit à sa campagne", 1, "forfait"),
 ("Comptage serveur des vues", "Mesure indépendante des bloqueurs de publicité", 1, "forfait"),
 ("SOUS-TOTAL LOT I", None, None, "soustotal"),

 ("LOT J — INTÉGRATIONS EXTÉRIEURES", None, None, None),
 ("Raccordement aux services extérieurs", "API BET, Supabase (comptes), Firebase (chat), TouchPoint (paiement), Cloudinary (médias), Google Analytics 4", len(INTEGRATIONS), "services"),
 ("Points d'entrée serveur consommés", "Appels au serveur BET depuis le site public, tous écrans confondus", 71, "points d'API"),
 ("SOUS-TOTAL LOT J", None, None, "soustotal"),

 ("LOT K — RECETTE ET MISE EN LIGNE", None, None, None),
 ("Tests & recette", "Tests multi-navigateurs, audit de performance et corrections", 1, "forfait"),
 ("Mise en ligne & déploiement", "Configuration du domaine, DNS, certificat HTTPS, redirection, intégration continue", 1, "forfait"),
 ("Formation à la prise en main", "Session avec l'équipe BET sur l'administration des contenus", 1, "forfait"),
 ("Documentation utilisateur", "Guide d'administration en français", 1, "livrable"),
 ("Maintenance corrective", "Correction des anomalies après livraison, sans surcoût", 3, "mois"),
 ("SOUS-TOTAL LOT K", None, None, "soustotal"),

 ("OPTIONS ET ÉVOLUTIONS", None, None, None),
 ("Page d'erreur 404", "ABSENTE. Une adresse inconnue n'affiche rien aujourd'hui — relevé dans l'inventaire du site", 1, "forfait"),
 ("Support prioritaire", "Réponse sous délai convenu, corrections et ajustements", 6, "mois"),
 ("Évolutions fonctionnelles", "Enveloppe d'évolutions après mise en ligne", 1, "forfait"),
 ("Hébergement & stockage médias", "Hébergement du site et stockage des médias", 12, "mois"),
 ("SOUS-TOTAL OPTIONS", None, None, "soustotal"),
]

# ══════════════════════════════════════════════════════════════════════════════
#  MISE EN FORME
# ══════════════════════════════════════════════════════════════════════════════
def entete(ws, colonnes, r=1):
    for j, (titre, largeur, saisie) in enumerate(colonnes, start=1):
        c = ws.cell(row=r, column=j, value=titre)
        c.font = Font(name=SANS, size=9, bold=True,
                      color="8A5A00" if saisie else "FFFFFF")
        c.fill = PatternFill("solid", fgColor=FOND_SAISIE if saisie else FOND_ENTETE)
        c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        c.border = BORD
        ws.column_dimensions[get_column_letter(j)].width = largeur
    ws.row_dimensions[r].height = 26

def ligne(ws, r, valeurs, colonnes, bande=False):
    for j, v in enumerate(valeurs, start=1):
        c = ws.cell(row=r, column=j, value=v)
        saisie = colonnes[j-1][2] if j-1 < len(colonnes) else False
        c.font = Font(name=SANS, size=9.5, bold=(j == 1), color=INK)
        c.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
        c.border = BORD
        if saisie:
            c.fill = PatternFill("solid", fgColor=FOND_SAISIE)
        elif bande:
            c.fill = PatternFill("solid", fgColor=FOND_BANDE)

def titre_feuille(ws, titre, sous, n):
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=n)
    c = ws.cell(row=1, column=1, value=titre)
    c.font = Font(name=SANS, size=15, bold=True, color=NAVY)
    ws.row_dimensions[1].height = 24
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=n)
    c = ws.cell(row=2, column=1, value=sous)
    c.font = Font(name=SANS, size=9.5, color=MUTED)

# ── FEUILLE 1 : OFFRE ────────────────────────────────────────────────────────
ws0 = wb.active
ws0.title = "Offre — Cotation"
ws0.sheet_view.showGridLines = False
for j, L in enumerate([46, 88, 13, 17, 17], start=1):
    ws0.column_dimensions[get_column_letter(j)].width = L

ws0.merge_cells("A2:E2")
c = ws0["A2"]; c.value = "OFFRE — SITE PUBLIC BET (binniesenglish.net)"
c.font = Font(name=SANS, size=14, bold=True, color="FFFFFF")
c.fill = PatternFill("solid", fgColor=BANDE_LOT)
c.alignment = Alignment(vertical="center", indent=1)
ws0.row_dimensions[2].height = 30

ws0.merge_cells("A3:E3")
c = ws0["A3"]; c.value = ("Quantités relevées dans le code source le 28/09/2026 — voir les feuilles d'inventaire. "
                          "Prix unitaires à renseigner : tous les totaux sont calculés.")
c.font = Font(name=SANS, size=9, bold=True, color="3F3000")
c.fill = PatternFill("solid", fgColor=BANDE_OCRE)
c.alignment = Alignment(vertical="center", indent=1)
ws0.row_dimensions[3].height = 18

for j, t in enumerate(["Prestation", "Détail / Description", "Qté", "Prix unitaire (FCFA)", "Total (FCFA)"], start=1):
    c = ws0.cell(row=5, column=j, value=t)
    c.font = Font(name=SANS, size=9.5, bold=True, color=INK)
    c.fill = PatternFill("solid", fgColor="D9D9D9")
    c.border = BORD
    c.alignment = Alignment(horizontal="center" if j >= 3 else "left", vertical="center")
ws0.row_dimensions[5].height = 20

r = 6
soustotaux, debut = [], None
for prestation, detail, qte, unite in LOTS:
    if detail is None and unite is None:
        ws0.merge_cells(start_row=r, start_column=1, end_row=r, end_column=5)
        c = ws0.cell(row=r, column=1, value=f"— {prestation} —")
        c.font = Font(name=SANS, size=9.5, bold=True, italic=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor=BANDE_LOT)
        c.alignment = Alignment(vertical="center", indent=1)
        ws0.row_dimensions[r].height = 18
        debut = r + 1
        r += 1
        continue
    if unite == "soustotal":
        fin = r - 1
        ws0.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)
        c = ws0.cell(row=r, column=1, value=prestation)
        c.font = Font(name=SANS, size=10, bold=True, color=INK)
        c.alignment = Alignment(horizontal="right", vertical="center")
        c.fill = PatternFill("solid", fgColor="EDEDED"); c.border = BORD
        c = ws0.cell(row=r, column=5, value=f"=SUM(E{debut}:E{fin})")
        c.font = Font(name=SANS, size=10, bold=True, color=NAVY)
        c.fill = PatternFill("solid", fgColor="EDEDED"); c.border = BORD
        c.number_format = "# ##0"; c.alignment = Alignment(horizontal="right")
        soustotaux.append(r)
        r += 2
        continue

    manquant = detail.startswith("ABSENTE")
    for j, v in enumerate([prestation, detail, f"{qte} {unite}", None, None], start=1):
        c = ws0.cell(row=r, column=j, value=v)
        c.border = BORD
        c.alignment = Alignment(vertical="center", wrap_text=(j == 2),
                                horizontal="center" if j == 3 else ("right" if j >= 4 else "left"))
        if j == 1:
            c.font = Font(name=SANS, size=9.5, bold=True, color=ROUGE if manquant else INK)
        elif j == 2:
            c.font = Font(name=SANS, size=9, italic=True, color=MUTED)
        else:
            c.font = Font(name=SANS, size=9.5, color=INK)
    pu = ws0.cell(row=r, column=4)
    pu.fill = PatternFill("solid", fgColor=FOND_SAISIE); pu.number_format = "# ##0"
    tot = ws0.cell(row=r, column=5, value=f'=IF(D{r}="","",{qte}*D{r})')
    tot.font = Font(name=SANS, size=9.5, bold=True, color=INK); tot.number_format = "# ##0"
    ws0.row_dimensions[r].height = 26
    r += 1

r += 1
ws0.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)
c = ws0.cell(row=r, column=1, value="TOTAL GÉNÉRAL (FCFA)")
c.font = Font(name=SANS, size=12, bold=True, color="FFFFFF")
c.fill = PatternFill("solid", fgColor=BANDE_LOT)
c.alignment = Alignment(horizontal="right", vertical="center")
c = ws0.cell(row=r, column=5, value="=" + "+".join(f"E{x}" for x in soustotaux))
c.font = Font(name=SANS, size=12, bold=True, color="FFFFFF")
c.fill = PatternFill("solid", fgColor=BANDE_LOT)
c.number_format = "# ##0"; c.alignment = Alignment(horizontal="right", vertical="center")
ws0.row_dimensions[r].height = 26

r += 2
for txt in [
 "Les quantités sont relevées dans le code : 24 pages, 6 parcours guidés, 25 fonctionnalités transverses, "
 "16 formulaires, 6 services extérieurs et 71 points d'entrée serveur. Le détail est dans les feuilles suivantes.",
 "Le test de niveau est isolé en lot E : à lui seul il pèse 2 973 lignes, soit plus que n'importe quelle autre "
 "page du site. Le noyer dans un forfait « pages » sous-estimerait le poste le plus lourd.",
 "La page d'erreur 404 figure en options parce qu'elle n'existe pas : aujourd'hui, une adresse inconnue n'affiche rien.",
 "Aucun prix n'a été porté dans ce document : il ne se lit pas dans le code. Renseignez la colonne « Prix unitaire », "
 "les totaux, sous-totaux et total général se calculent seuls.",
]:
    ws0.merge_cells(start_row=r, start_column=1, end_row=r, end_column=5)
    c = ws0.cell(row=r, column=1, value="•  " + txt)
    c.font = Font(name=SANS, size=9, color=MUTED)
    c.alignment = Alignment(wrap_text=True, vertical="top")
    ws0.row_dimensions[r].height = 26
    r += 1
ws0.freeze_panes = "A6"

# ── FEUILLE 2 : PAGES ────────────────────────────────────────────────────────
ws = wb.create_sheet("Pages")
ws.sheet_view.showGridLines = False
C = [("Famille", 20, False), ("Adresse", 28, False), ("Page", 26, False), ("Ce qu'on y trouve", 86, False),
     ("Complexité", 13, True), ("Charge (j)", 11, True), ("Commentaire", 34, True)]
titre_feuille(ws, "Les 24 pages du site", "Neuf adresses prennent un paramètre dans l'URL — une fiche de cours, un article, un centre.", len(C))
entete(ws, C, 4)
r = 5
for i, (fam, adr, page, desc) in enumerate(PAGES, start=1):
    ligne(ws, r, [fam, adr, page, desc, "", "", ""], C, bande=(i % 2 == 0)); r += 1
ws.auto_filter.ref = f"A4:G{r-1}"; ws.freeze_panes = "A5"

# ── FEUILLE 3 : PARCOURS ─────────────────────────────────────────────────────
ws = wb.create_sheet("Parcours guidés")
ws.sheet_view.showGridLines = False
C = [("Parcours", 30, False), ("Point d'entrée", 38, False), ("Étapes", 11, False), ("Ce qui s'y passe", 96, False),
     ("Complexité", 13, True), ("Charge (j)", 11, True), ("Commentaire", 34, True)]
titre_feuille(ws, "Les 6 parcours guidés", "Quatre sont des fenêtres ouvertes depuis la navigation, deux sont des pages à part entière.", len(C))
entete(ws, C, 4)
r = 5
for i, p in enumerate(PARCOURS, start=1):
    ligne(ws, r, [*p, "", "", ""], C, bande=(i % 2 == 0))
    ws.row_dimensions[r].height = 54
    r += 1
ws.freeze_panes = "A5"

# ── FEUILLE 4 : FONCTIONNALITÉS TRANSVERSES ──────────────────────────────────
ws = wb.create_sheet("Fonctionnalités")
ws.sheet_view.showGridLines = False
C = [("Famille", 26, False), ("Fonctionnalité", 34, False), ("Détail", 92, False),
     ("Complexité", 13, True), ("Charge (j)", 11, True), ("Commentaire", 34, True)]
titre_feuille(ws, "Fonctionnalités transverses", "Présentes sur toutes les pages, indépendamment du parcours.", len(C))
entete(ws, C, 4)
r = 5
for i, f in enumerate(TRANSVERSES, start=1):
    ligne(ws, r, [*f, "", "", ""], C, bande=(i % 2 == 0)); r += 1
ws.auto_filter.ref = f"A4:F{r-1}"; ws.freeze_panes = "A5"

# ── FEUILLE 5 : INTÉGRATIONS & CATALOGUE ─────────────────────────────────────
ws = wb.create_sheet("Intégrations")
ws.sheet_view.showGridLines = False
C = [("Service", 26, False), ("Ce qu'il assure sur le site public", 86, False), ("Modèle de coût", 18, False),
     ("Coût annuel estimé", 20, True), ("Commentaire", 34, True)]
titre_feuille(ws, "Services extérieurs et catalogue présenté", "Les abonnements ci-dessous sont récurrents : ils ne se chiffrent pas comme un développement.", len(C))
entete(ws, C, 4)
r = 5
for i, (s, d, m) in enumerate(INTEGRATIONS, start=1):
    ligne(ws, r, [s, d, m, "", ""], C, bande=(i % 2 == 0)); r += 1
r += 2
ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=5)
c = ws.cell(row=r, column=1, value="Le catalogue présenté sur le site")
c.font = Font(name=SANS, size=12, bold=True, color=NAVY)
r += 1
for i, (fam, contenu) in enumerate(CATALOGUE, start=1):
    ligne(ws, r, [fam, contenu, "", "", ""], C, bande=(i % 2 == 0)); r += 1
ws.freeze_panes = "A5"

wb.properties.title = "Offre — Site public BET"
wb.properties.subject = "Cotation du site binniesenglish.net — relevé du 28 septembre 2026"
wb.properties.creator = "Binnie's English Training"
wb.save(CIBLE)
print("écrit :", CIBLE)
print(f"  {len(PAGES)} pages · {len(PARCOURS)} parcours · {len(TRANSVERSES)} fonctionnalités · "
      f"{len(INTEGRATIONS)} services · {len(soustotaux)} lots")
