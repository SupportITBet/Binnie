# -*- coding: utf-8 -*-
"""Produit l'inventaire du site public BET en .docx modifiable."""
import sys
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

CIBLE = sys.argv[1]

INK   = RGBColor(0x12, 0x16, 0x1D)
MUTED = RGBColor(0x5C, 0x65, 0x73)
FAINT = RGBColor(0x8A, 0x93, 0xA1)
NAVY  = RGBColor(0x1B, 0x30, 0x80)
CYAN  = RGBColor(0x08, 0x91, 0xB2)
SERIF, SANS, MONO = "Georgia", "Calibri", "Consolas"

doc = Document()
for s in doc.sections:
    s.page_height, s.page_width = Cm(29.7), Cm(21)
    s.top_margin = s.bottom_margin = Cm(2.2)
    s.left_margin = s.right_margin = Cm(2.0)

def police(style, nom, taille, gras=False, couleur=None):
    f = style.font
    f.name, f.size, f.bold = nom, Pt(taille), gras
    if couleur: f.color.rgb = couleur
    f.element.rPr.rFonts.set(qn("w:eastAsia"), nom)

st = doc.styles
police(st["Normal"], SANS, 10.5, couleur=INK)
st["Normal"].paragraph_format.space_after = Pt(4)
st["Normal"].paragraph_format.line_spacing = 1.18
police(st["Title"], SERIF, 26, gras=True, couleur=INK)
police(st["Heading 1"], SERIF, 17, gras=True, couleur=INK)
police(st["Heading 2"], SERIF, 12.5, gras=True, couleur=NAVY)
police(st["Heading 3"], SERIF, 11, gras=True, couleur=INK)
for n, av, ap in (("Heading 1", 22, 5), ("Heading 2", 14, 5), ("Heading 3", 11, 3)):
    st[n].paragraph_format.space_before, st[n].paragraph_format.space_after = Pt(av), Pt(ap)
    st[n].paragraph_format.keep_with_next = True

def ombrer(cellule, hexa):
    sh = OxmlElement("w:shd"); sh.set(qn("w:val"), "clear"); sh.set(qn("w:fill"), hexa)
    cellule._tc.get_or_add_tcPr().append(sh)

def bord_par(p, cote="bottom", taille=6, couleur="12161D"):
    pPr = p._p.get_or_add_pPr()
    bd = OxmlElement("w:pBdr"); e = OxmlElement(f"w:{cote}")
    e.set(qn("w:val"), "single"); e.set(qn("w:sz"), str(taille))
    e.set(qn("w:space"), "4"); e.set(qn("w:color"), couleur)
    bd.append(e); pPr.append(bd)

def par(texte="", taille=10.5, couleur=None, gras=False, italique=False,
        apres=4, style=None, police_=SANS, align=None):
    p = doc.add_paragraph(style=style)
    p.paragraph_format.space_after = Pt(apres)
    if align is not None: p.alignment = align
    if texte:
        r = p.add_run(texte)
        r.font.size, r.font.name, r.font.bold, r.font.italic = Pt(taille), police_, gras, italique
        if couleur: r.font.color.rgb = couleur
    return p

def riche(morceaux, taille=10.5, apres=4, style=None, indent=None):
    """morceaux : liste de (texte, mode) — mode ∈ '', 'gras', 'mono', 'gris', 'ital'."""
    p = doc.add_paragraph(style=style)
    p.paragraph_format.space_after = Pt(apres)
    if indent is not None: p.paragraph_format.left_indent = Cm(indent)
    for texte, mode in morceaux:
        r = p.add_run(texte)
        r.font.size, r.font.name = Pt(taille), SANS
        if mode == "gras":  r.font.bold = True
        elif mode == "mono": r.font.name = MONO; r.font.size = Pt(taille - 0.5); r.font.color.rgb = NAVY
        elif mode == "gris": r.font.color.rgb = MUTED
        elif mode == "ital": r.font.italic = True; r.font.color.rgb = MUTED
    return p

def puce(morceaux, indent=0.8):
    return riche(morceaux, apres=2, style="List Bullet", indent=indent)

def tableau(entetes, lignes, largeurs=None, mono_cols=()):
    t = doc.add_table(rows=1, cols=len(entetes)); t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for j, e in enumerate(entetes):
        c = t.cell(0, j); ombrer(c, "F2F4FA")
        r = c.paragraphs[0].add_run(e)
        r.font.size, r.font.bold, r.font.color.rgb = Pt(8.5), True, NAVY
    for ligne in lignes:
        cells = t.add_row().cells
        for j, val in enumerate(ligne):
            p = cells[j].paragraphs[0]; p.paragraph_format.space_after = Pt(1)
            r = p.add_run(val)
            r.font.size = Pt(9)
            r.font.name = MONO if j in mono_cols else SANS
            if j in mono_cols: r.font.color.rgb = NAVY; r.font.size = Pt(8.5)
            elif j == 0: r.font.bold = True
    if largeurs:
        for j, L in enumerate(largeurs):
            for row in t.rows: row.cells[j].width = Cm(L)
    doc.add_paragraph().paragraph_format.space_after = Pt(6)
    return t

def encadre(titre, paragraphes, fond="F4F6FB", accent="0891B2"):
    t = doc.add_table(rows=1, cols=1); t.alignment = WD_TABLE_ALIGNMENT.CENTER
    c = t.cell(0, 0); ombrer(c, fond)
    tcPr = c._tc.get_or_add_tcPr(); bd = OxmlElement("w:tcBorders")
    for nom, sz, col in (("top", 4, "E4E1D9"), ("left", 18, accent),
                         ("bottom", 4, "E4E1D9"), ("right", 4, "E4E1D9")):
        e = OxmlElement(f"w:{nom}"); e.set(qn("w:val"), "single")
        e.set(qn("w:sz"), str(sz)); e.set(qn("w:color"), col); bd.append(e)
    tcPr.append(bd)
    c.paragraphs[0]._p.getparent().remove(c.paragraphs[0]._p)
    if titre:
        p = c.add_paragraph(); p.paragraph_format.space_after = Pt(4)
        r = p.add_run(titre); r.font.name = SERIF; r.font.size = Pt(11); r.font.bold = True
    for txt in paragraphes:
        p = c.add_paragraph(); p.paragraph_format.space_after = Pt(3)
        r = p.add_run(txt); r.font.size = Pt(10); r.font.color.rgb = MUTED
    doc.add_paragraph().paragraph_format.space_after = Pt(6)

# ══════════════════════════════════════════════════════ EN-TÊTE
par("BINNIE'S ENGLISH TRAINING · SITE PUBLIC", 8, CYAN, gras=True, apres=2, police_=MONO)
doc.add_paragraph("Inventaire du site public", style="Title").paragraph_format.space_after = Pt(4)
par("Pages, parcours et fonctionnalités du site binniesenglish.net, relevés dans le code "
    "source de l'application Frontend.", 11, MUTED, apres=6)
p = par("Relevé du 26 septembre 2026  ·  application React  ·  64 fichiers  ·  29 785 lignes",
        9.5, INK, gras=True, apres=16, police_=MONO)
bord_par(p, taille=12)

t = doc.add_table(rows=2, cols=5); t.alignment = WD_TABLE_ALIGNMENT.CENTER
for j, (n, l) in enumerate([("24", "pages publiques"), ("6", "parcours guidés"),
                            ("70", "points d'API appelés"), ("2", "langues"),
                            ("16", "formulaires")]):
    ph = t.cell(0, j).paragraphs[0]; ph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = ph.add_run(n); r.font.name = MONO; r.font.size = Pt(19); r.font.bold = True; r.font.color.rgb = NAVY
    pl = t.cell(1, j).paragraphs[0]; pl.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = pl.add_run(l); r.font.size = Pt(8.5); r.font.color.rgb = MUTED
doc.add_paragraph().paragraph_format.space_after = Pt(8)

encadre("Comment cet inventaire a été établi",
        ["Il est relevé dans le code, pas en naviguant sur le site : la liste des pages vient du "
         "routeur de l'application, celle des fonctionnalités des appels que le code adresse au "
         "serveur. C'est donc l'inventaire de ce qui EXISTE — y compris des pages qu'aucun menu "
         "ne propose, et qui ne s'atteignent qu'en connaissant leur adresse.",
         "Ne sont pas couverts : les 16 tableaux de bord métier (application « dash »), la "
         "plateforme e-learning, et le serveur. Ce dernier est pourtant sollicité par 70 points "
         "d'entrée différents depuis ce seul site."],
        fond="ECF7FA")

# ══════════════════════════════════════════════════════ 1. LES PAGES
doc.add_paragraph("1. Les pages", style="Heading 1")
par("Vingt-quatre adresses, dont neuf prennent un paramètre dans l'URL — une fiche de cours, "
    "un article, un centre. Le site n'a pas de page d'erreur : une adresse inconnue n'affiche rien.",
    10.5, MUTED, apres=8)

doc.add_paragraph("Pages de contenu", style="Heading 2")
tableau(["Adresse", "Page", "Ce qu'on y trouve"],
[("/", "Accueil", "Carrousel administrable, programmes, coachs, équipe administrative, témoignages, blog, partenaires, bandeau catalogue PDF"),
 ("/about", "À propos", "Présentation de BET, histoire, chiffres, équipe"),
 ("/faq", "FAQ", "Questions administrables depuis le back-office, coordonnées de contact"),
 ("/contact", "Contact", "Formulaire de contact, coordonnées et numéros WhatsApp lus depuis la configuration serveur"),
 ("/temoignages", "Témoignages", "Avis publiés, filtres et recherche"),
 ("/blog", "Blog — liste", "Articles publiés depuis le back-office"),
 ("/blog/:id", "Blog — article", "Article complet"),
 ("/bet-for-business", "BET for Business", "Offre entreprise, clients publics, logos partenaires"),
 ("/boutique", "Boutique", "Produits actifs, panier, favoris, commandes"),
], largeurs=[4.2, 3.6, 8.7], mono_cols=(0,))

doc.add_paragraph("Fiches du catalogue", style="Heading 2")
tableau(["Adresse", "Page", "Ce qu'on y trouve"],
[("/cours/:type", "Fiche format de cours", "En ligne, en cabinet ou à domicile : contenu, formules, avis, codes promo, accès à l'inscription"),
 ("/certification/:certId", "Fiche certification", "TOEIC, TOEFL, IELTS : préparation, tarifs, avis, codes promo"),
 ("/centre/:centerId", "Fiche centre", "Bouaké, Angré, Abatta, Yopougon, Koumassi, II Plateaux"),
 ("/service/:serviceId", "Fiche service", "Séjour linguistique, préparation d'interviews, plateforme des natifs, interprétariat"),
], largeurs=[4.2, 3.6, 8.7], mono_cols=(0,))

doc.add_paragraph("Parcours, compte et paiement", style="Heading 2")
tableau(["Adresse", "Page", "Ce qu'on y trouve"],
[("/parcours/particulier", "Point d'entrée particulier", "Orientation vers le bon parcours, dépôt d'un contact avant inscription complète"),
 ("/parcours/inscription", "Tunnel d'inscription", "Cinq étapes, du type de coaching aux coordonnées"),
 ("/test-niveau", "Test de niveau gratuit", "Le plus gros écran du site : questionnaire chronométré, épreuve orale enregistrée, résultat CECRL"),
 ("/mon-espace", "Espace personnel", "Deux visages : prospect avant inscription, apprenant après"),
 ("/connexion", "Connexion", "Mot de passe ou compte Google"),
 ("/update-password", "Nouveau mot de passe", "Atterrissage du lien reçu par courriel"),
 ("/paiement/retour", "Retour de paiement", "Résultat de la transaction, reçu téléchargeable en PDF"),
 ("/paiement/relancer", "Relance de paiement", "Reprise d'un paiement interrompu"),
], largeurs=[4.2, 3.6, 8.7], mono_cols=(0,))

doc.add_paragraph("Pages de campagne", style="Heading 2")
tableau(["Adresse", "Page", "Ce qu'on y trouve"],
[("/f/:slug", "Formulaire de campagne", "La page qu'ouvre un QR code imprimé. Adresse volontairement courte : elle se dicte à l'oral et tient sur une affiche"),
 ("/lead-magnet/audit-gratuit", "Audit gratuit", "Formulaire de demande d'audit pour les entreprises"),
 ("/lead-magnet/merci", "Remerciement", "Page d'atterrissage après envoi"),
], largeurs=[4.2, 3.6, 8.7], mono_cols=(0,))

# ══════════════════════════════════════════════════════ 2. LES PARCOURS
doc.add_page_break()
doc.add_paragraph("2. Les parcours", style="Heading 1")
par("Six chemins guidés mènent un visiteur de la découverte à l'inscription. Quatre sont des "
    "fenêtres ouvertes depuis la navigation, deux sont des pages à part entière.", 10.5, MUTED, apres=8)

doc.add_paragraph("2.1  Inscription d'un adulte", style="Heading 2")
riche([("Fenêtre ouverte depuis « Inscription » · ", "gris"), ("2 009 lignes", "mono"),
       (" · le parcours le plus ramifié du site.", "gris")], 9.5, apres=6)
par("Le chemin se dédouble dès la première question et ne se parcourt pas de la même façon selon "
    "la réponse. Onze états distincts existent dans le code, dont plusieurs propres à une branche.", apres=6)
puce([("Type de coaching", "gras"), (" — privé ou en groupe, en ligne ou en présentiel", "")])
puce([("Offre et formule", "gras"), (" — chaque offre porte ses propres formules, avec son tarif", "")])
puce([("Branche présentiel", "gras"), (" — choix du centre, ", ""), ("trié par distance depuis la ville du visiteur", "ital")])
puce([("Cours à domicile", "gras"), (" — saisie de l'adresse plutôt que d'un centre", "")])
puce([("Choix de l'assistante", "gras"), (" — parmi celles réellement disponibles ; un message explicite s'il n'y en a aucune", "")])
puce([("Connexion facultative", "gras"), (" — « Connectez-vous pour pré-remplir vos coordonnées »", "")])
puce([("Récapitulatif", "gras"), (" puis confirmation", "")])
encadre(None, ["La progression est conservée : un visiteur interrompu retrouve son parcours là où il "
               "l'avait laissé, sans avoir à ressaisir."], fond="F7F7F4", accent="8A93A1")

doc.add_paragraph("2.2  Inscription d'un enfant", style="Heading 2")
riche([("Fenêtre ouverte depuis « Inscription » · ", "gris"), ("1 286 lignes", "mono"),
       (" · six étapes", "gris")], 9.5, apres=6)
puce([("Informations sur l'enfant", "gras"), (" — prénom, âge", "")])
puce([("Informations du parent", "gras"), (" — identité et contact du responsable", "")])
puce([("Offre et formule", "gras"), (" — le catalogue est filtré sur les offres pertinentes pour un enfant", "")])
puce([("Modalité", "gras"), (" — en ligne ou présentiel, puis centre ou adresse", "")])
puce([("Récapitulatif", "gras"), (" — relecture avant envoi", "")])
puce([("Confirmation", "gras"), (" — « Inscription envoyée »", "")])

doc.add_paragraph("2.3  Demande d'une entreprise", style="Heading 2")
riche([("Fenêtre ouverte depuis « BET for Business » · ", "gris"), ("503 lignes", "mono"),
       (" · trois étapes annoncées au visiteur", "gris")], 9.5, apres=6)
puce([("Votre entreprise", "gras"), (" — raison sociale, contact, effectif à former", "")])
puce([("Niveau & objectifs", "gras"), (" — niveaux CECRL visés, besoins : anglais professionnel, communication interne, missions à l'étranger", "")])
puce([("Format & rythme", "gras"), (" — organisation souhaitée", "")])

doc.add_paragraph("2.4  Centres en ligne", style="Heading 2")
riche([("Fenêtre dédiée · ", "gris"), ("1 180 lignes", "mono"),
       (" · pour qui veut apprendre à distance", "gris")], 9.5, apres=6)
puce([("Offres", "gras"), (" puis ", ""), ("choix de la formule", "gras")])
puce([("Connexion obligatoire", "gras"), (" à cette étape — c'est ce que le code appelle l'« authgate »", "")])
puce([("Récapitulatif", "gras"), (" puis « Votre demande a bien été reçue »", "")])

doc.add_paragraph("2.5  Tunnel d'inscription", style="Heading 2")
riche([("Page ", "gris"), ("/parcours/inscription", "mono"), (" · cinq étapes linéaires", "gris")], 9.5, apres=6)
puce([("Quel type de coaching ?", "gras"), (" — groupe ou suivi individuel", "")])
puce([("Comment souhaitez-vous apprendre ?", "gras"), (" — en ligne ou en présentiel", "")])
puce([("Où ?", "gras"), (" — « Quel cabinet vous convient ? » ou le centre le plus proche", "")])
puce([("Choisissez votre assistante", "gras"), (" — avec sa photo", "")])
puce([("Vos coordonnées", "gras"), (" puis envoi", "")])

doc.add_paragraph("2.6  Test de niveau gratuit", style="Heading 2")
riche([("Page ", "gris"), ("/test-niveau", "mono"), (" · ", "gris"), ("2 973 lignes", "mono"),
       (" · l'écran le plus lourd du site", "gris")], 9.5, apres=6)
par("Six écrans se succèdent, et l'avancement est enregistré sur le serveur à chaque réponse : "
    "une coupure de connexion ne fait pas perdre le test.", apres=6)
puce([("Formulaire", "gras"), (" — identité et contact du candidat", "")])
puce([("Questionnaire", "gras"), (" — questions à choix multiple ", ""), ("chronométrées", "ital"),
      (", niveaux A1 à C2", "")])
puce([("Épreuve orale", "gras"), (" — enregistrement au microphone, envoyé au serveur", "")])
puce([("Projet", "gras"), (" — expression écrite", "")])
puce([("Choix du conseiller", "gras"), (" — parmi les commerciaux du centre retenu", "")])
puce([("Attente puis résultat", "gras"), (" — niveau CECRL détecté, transmis à l'assistante", "")])

doc.add_paragraph("2.7  Paiement en ligne", style="Heading 2")
riche([("Prestataire ", "gris"), ("TouchPoint", "gras"),
       (" — mobile money et carte. A remplacé CinetPay.", "gris")], 9.5, apres=6)
puce([("Ouverture", "gras"), (" — le serveur prépare la transaction et renvoie les paramètres marchands", "")])
puce([("Paiement", "gras"), (" — hors du site, chez le prestataire", "")])
puce([("Retour", "gras"), (" — page ", ""), ("/paiement/retour", "mono"),
      (" : résultat affiché, reçu téléchargeable en PDF", "")])
puce([("Double filet", "gras"), (" — la confirmation est reconnue par le serveur ", ""),
      ("et", "ital"), (" par la redirection du navigateur, pour qu'un appel perdu ne perde pas un paiement", "")])
puce([("Relance", "gras"), (" — page ", ""), ("/paiement/relancer", "mono"), (" pour un règlement interrompu", "")])

doc.add_paragraph("2.8  Espace personnel", style="Heading 2")
riche([("Page ", "gris"), ("/mon-espace", "mono"),
       (" · deux jeux d'onglets, selon que la personne est inscrite ou non", "gris")], 9.5, apres=6)
tableau(["Avant l'inscription — prospect", "Après l'inscription — apprenant"],
[("Mon test de niveau", "Planning"),
 ("Conseillère & Contact", "Mes sessions"),
 ("Catalogue formations", "Présences"),
 ("Paiement", "Ressources"),
 ("Mon profil", "Paiement"),
 ("Paramètres", "Mon coach"),
], largeurs=[8.2, 8.2])
par("L'espace permet aussi de changer sa photo de profil, de déposer un témoignage et de répondre "
    "au sondage « Comment nous avez-vous connu ? ».", 10, MUTED, apres=8)

doc.add_paragraph("2.9  Boutique", style="Heading 2")
puce([("Produits actifs", "gras"), (" — lus depuis le back-office, avec filtres", "")])
puce([("Panier et favoris", "gras"), (" — conservés pendant la visite", "")])
puce([("Commande", "gras"), (" — passage de commande et consultation de ses commandes", "")])

doc.add_paragraph("2.10  Formulaire de campagne", style="Heading 2")
riche([("Page ", "gris"), ("/f/:slug", "mono"), (" — celle qu'ouvre un QR code imprimé", "gris")], 9.5, apres=6)
par("Chaque campagne a son adresse courte et son formulaire propre, défini côté back-office : "
    "bannière, illustration, questions. Les réponses alimentent ensuite les campagnes de courriel "
    "et de diffusion WhatsApp.", apres=8)

# ══════════════════════════════════════════════════════ 3. TRANSVERSE
doc.add_page_break()
doc.add_paragraph("3. Fonctionnalités transverses", style="Heading 1")
par("Présentes sur toutes les pages, indépendamment du parcours.", 10.5, MUTED, apres=8)

doc.add_paragraph("Navigation et comptes", style="Heading 3")
puce([("Barre de navigation", "gras"), (" — Accueil, Apprenez l'anglais, Certifications, Centres physiques, "
      "BET for Business, Boutique, FAQ, Contact, Mon espace. C'est elle qui héberge les quatre "
      "fenêtres d'inscription.", "")])
puce([("Recherche", "gras"), (" dans le catalogue, depuis la barre", "")])
puce([("Connexion", "gras"), (" — mot de passe ou ", ""), ("compte Google", "gras"),
      (" ; mot de passe oublié et renouvellement par courriel", "")])
puce([("Bandeau de session active", "gras"), (" — signale une session déjà ouverte", "")])
puce([("Bilingue", "gras"), (" — français et anglais, bascule depuis la barre", "")])

doc.add_paragraph("Contact et conversation", style="Heading 3")
puce([("Chat avec son assistante", "gras"), (" — bouton flottant portant ", ""),
      ("la photo de l'assistante attitrée", "ital"),
      (". Messages en temps réel, signal sonore à la réception. Le conseiller retrouve la même "
       "conversation depuis son tableau de bord.", "")])
puce([("Bouton WhatsApp", "gras"), (" — numéros lus depuis la configuration serveur, jamais écrits en dur", "")])
puce([("Liens cliquables", "gras"), (" — les adresses saisies dans un message le deviennent automatiquement", "")])

doc.add_paragraph("Commerce et promotions", style="Heading 3")
puce([("Codes promo", "gras"), (" — saisis et validés par le serveur sur les fiches de cours, "
      "les certifications et les parcours d'inscription", "")])
puce([("Bandeau de promotions", "gras"), (" — promotions actives affichées automatiquement", "")])
puce([("Bandeau déroulant", "gras"), (" et ", ""), ("carrousel d'accueil", "gras"),
      (" — administrables, avec une durée d'affichage réglable par photo", "")])
puce([("Catalogue PDF", "gras"), (" — bandeau de téléchargement du catalogue BET", "")])

doc.add_paragraph("Avis, contenus et newsletter", style="Heading 3")
puce([("Avis", "gras"), (" — déposés et affichés sur les fiches de cours et de certification", "")])
puce([("Témoignages", "gras"), (" — page dédiée avec filtres et recherche ; un apprenant en dépose depuis son espace", "")])
puce([("Blog", "gras"), (" — articles administrés depuis le back-office", "")])
puce([("Photos d'équipe", "gras"), (" — coachs et équipe administrative, défilement à vitesse réglable", "")])
puce([("Newsletter", "gras"), (" — inscription depuis le pied de page et depuis le blog. "
      "La désinscription, elle, ", ""), ("passe par le serveur et non par le site", "ital"),
      (" : le lien doit fonctionner depuis un logiciel de messagerie.", "")])

doc.add_paragraph("Référencement et mesure d'audience", style="Heading 3")
puce([("Balises SEO", "gras"), (" par page, et balisage ", ""), ("OrganizationSchema", "mono"),
      (" pour les moteurs de recherche", "")])
puce([("Google Analytics 4", "gras"), (" — treize événements suivis, dont ", ""),
      ("generate_lead", "mono"), (", ", ""), ("begin_checkout", "mono"), (", ", ""),
      ("purchase", "mono"), (", ", ""), ("test_niveau_commence", "mono"), (" et ", ""),
      ("test_niveau_termine", "mono"), (", ", ""), ("contact_whatsapp", "mono"), ("", "")])
puce([("Paramètres de campagne", "gras"), (" — les UTM sont capturés à l'arrivée et conservés "
      "jusqu'à la conversion, pour savoir d'où vient réellement un inscrit", "")])
puce([("Vues comptées côté serveur", "gras"), (" — en plus de GA4, pour ne pas dépendre des bloqueurs", "")])

doc.add_paragraph("Confort de navigation", style="Heading 3")
puce([("Écran d'accueil", "gras"), (" au chargement, en fondu", "")])
puce([("Remontée en haut de page", "gras"), (" à chaque changement d'écran", "")])
puce([("Chargement différé", "gras"), (" des pages — seule celle qu'on regarde est téléchargée", "")])
puce([("Notifications", "gras"), (" — messages de confirmation et d'erreur en haut à droite", "")])

# ══════════════════════════════════════════════════════ 4. CATALOGUE
doc.add_paragraph("4. Le catalogue présenté", style="Heading 1")
tableau(["Famille", "Contenu"],
[("Formats de cours", "Cours en ligne · Cours aux cabinets · Cours à domicile"),
 ("Certifications", "TOEIC · TOEFL · IELTS"),
 ("Centres", "BET Bouaké · Angré · Abatta · Yopougon · Koumassi · II Plateaux"),
 ("Services", "Séjour linguistique · Préparation d'interviews · Plateforme des natifs · Interprétariat"),
], largeurs=[4.5, 12.0])
encadre("Une distinction qui compte pour la maintenance",
        ["Les quatre familles ci-dessus sont décrites dans des fichiers du site — les modifier "
         "demande une intervention technique et un redéploiement. En revanche les offres, leurs "
         "formules et leurs tarifs, eux, viennent du back-office et se modifient sans toucher au code. "
         "Le catalogue affiché est donc pour partie figé, pour partie administrable."])

# ══════════════════════════════════════════════════════ 5. INTÉGRATIONS
doc.add_paragraph("5. Services extérieurs", style="Heading 1")
tableau(["Service", "Ce qu'il assure sur le site public"],
[("API BET", "Le serveur de la plateforme : 70 points d'entrée appelés depuis ce seul site"),
 ("Supabase", "Comptes et sessions : connexion par mot de passe, compte Google, renouvellement"),
 ("Firebase", "La conversation en temps réel entre le prospect et son assistante"),
 ("TouchPoint", "Paiement en ligne — mobile money et carte"),
 ("Cloudinary", "Images, pièces jointes et enregistrements audio du test de niveau"),
 ("Google Analytics 4", "Mesure d'audience et suivi du tunnel"),
], largeurs=[4.0, 12.5])

# ══════════════════════════════════════════════════════ 6. ATTENTION
doc.add_paragraph("6. Points relevés au passage", style="Heading 1")
par("Constats factuels issus de la lecture du code, sans jugement sur leur urgence.", 10.5, MUTED, apres=8)

doc.add_paragraph("Un formulaire demande un numéro de carte qui n'est jamais utilisé", style="Heading 3")
par("La fenêtre d'offres de la barre de navigation présente des champs « Numéro de carte », "
    "« Expiration » et « CVV ». Ces valeurs ne sont transmises à personne : seul le nom du "
    "titulaire est conservé, dans une simple étiquette « Carte bancaire — <titulaire> » envoyée "
    "avec la demande d'inscription. Le numéro et le code de sécurité sont saisis puis abandonnés.", apres=4)
par("Deux conséquences : le visiteur croit payer alors qu'il ne paie pas, et il apprend à taper "
    "ses coordonnées bancaires sur une page qui n'est pas une page de paiement. Le paiement réel "
    "passe par TouchPoint, hors du site — comme il doit.", 10, MUTED, apres=8)

doc.add_paragraph("Aucune page d'erreur", style="Heading 3")
par("Le routeur ne déclare pas de route de repli. Une adresse inconnue — un lien périmé, une "
    "faute de frappe, un ancien signet — n'affiche donc ni message, ni chemin de retour.", apres=8)

doc.add_paragraph("Trois adresses sur quatre mènent à un site qui ne répond pas", style="Heading 3")
par("Le site est atteignable par quatre noms : binniesenglish.net, www.binniesenglish.net, "
    "binniesenglish.com et www.binniesenglish.com. Un seul figure dans les origines autorisées "
    "par le serveur. Depuis les trois autres, la page s'affiche mais aucun appel n'aboutit : "
    "ni inscription, ni test de niveau, ni paiement.", apres=8)

doc.add_paragraph("Le catalogue de présentation est figé dans le code", style="Heading 3")
par("Ajouter un centre ou une certification demande aujourd'hui une intervention technique. "
    "Les six centres, trois certifications, trois formats de cours et quatre services sont "
    "décrits dans des fichiers du site, là où tout le reste du contenu est administrable.", apres=8)

# ══════════════════════════════════════════════════════ PIED
pied = doc.sections[0].footer.paragraphs[0]
pied.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = pied.add_run("Inventaire du site public BET · 26 septembre 2026 · page ")
r.font.size = Pt(8); r.font.color.rgb = FAINT
fld = OxmlElement("w:fldSimple"); fld.set(qn("w:instr"), "PAGE")
pied._p.append(fld)

doc.core_properties.title = "Inventaire du site public BET"
doc.core_properties.subject = "Pages, parcours et fonctionnalités — relevé du 26 septembre 2026"
doc.core_properties.author = "Binnie's English Training"

doc.save(CIBLE)
print("écrit :", CIBLE)
