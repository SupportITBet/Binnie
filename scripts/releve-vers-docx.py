# -*- coding: utf-8 -*-
"""
Convertit Backend/docs/releve-travaux-dash-frontend.html en un .docx modifiable.

    python3 -m venv /tmp/venv-docx && /tmp/venv-docx/bin/pip install python-docx
    /tmp/venv-docx/bin/python scripts/releve-vers-docx.py \
        Backend/docs/releve-travaux-dash-frontend.html \
        Backend/docs/Releve-travaux-BET.docx

Un environnement virtuel parce que le Python du système refuse `pip install`
(PEP 668) — et il a raison : cette dépendance ne sert qu'à ce script.

Le contenu est LU dans le HTML, jamais recopié : 21 lots et plus de 150 puces
transcrits à la main seraient une source d'erreurs, et le document devrait être
reconverti à chaque mise à jour du relevé.

Le document produit utilise les styles Word natifs (Titre 1, Titre 2, Paragraphe
de liste) : c'est ce qui le rend réellement modifiable — le volet Navigation
fonctionne, et changer un style change tout le document d'un coup.
"""
import re, sys
from html.parser import HTMLParser
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

SOURCE, CIBLE = sys.argv[1], sys.argv[2]

# ── Palette, reprise du HTML ────────────────────────────────────────────────
INK   = RGBColor(0x12, 0x16, 0x1D)
MUTED = RGBColor(0x5C, 0x65, 0x73)
FAINT = RGBColor(0x8A, 0x93, 0xA1)
NAVY  = RGBColor(0x1B, 0x30, 0x80)
CYAN  = RGBColor(0x08, 0x91, 0xB2)
SERIF, SANS, MONO = "Georgia", "Calibri", "Consolas"

# ══════════════════════════════════════════════════════════════════════════
#  1. Lecture du HTML
# ══════════════════════════════════════════════════════════════════════════
# Conteneurs dont on collecte le contenu : (balise, classe) -> type de bloc.
FEUILLES = {
    ("h1", None): "titre", ("p", "sous-titre"): "soustitre", ("p", "periode"): "periode",
    ("div", "tot-n"): "tot_n", ("div", "tot-l"): "tot_l", ("div", "methode"): "methode",
    ("h2", None): "plateforme", ("span", "quoi"): "quoi", ("span", "chiffres"): "chiffres",
    ("span", "lot-num"): "lot_num", ("h3", None): "h3", ("span", "compte"): "compte",
    ("li", None): "puce", ("th", None): "th", ("td", None): "td", ("p", None): "para",
    ("span", None): "footer_span",
}
# Styles de caractère portés par les balises internes.
STYLES = {("span", "prec"): "prec", ("code", None): "code",
          ("span", "tag"): "tag", ("span", "tag neuf"): "neuf", ("strong", None): "gras"}


class LecteurReleve(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.pile, self.blocs = [], []
        self.tampon, self.type_courant = None, None
        # Profondeur de pile à laquelle le conteneur courant a été ouvert. Sans elle, la
        # fermeture d'une balise INTERNE (<strong>, <span class="prec">) viderait le tampon
        # et tout le texte qui suit le mot en gras serait perdu.
        self.profondeur = -1
        self.dans_encart = self.dans_thead = False

    def _cle(self, tag, attrs):
        classe = dict(attrs).get("class")
        return (tag, classe if (tag, classe) in FEUILLES or (tag, classe) in STYLES else None), classe

    def handle_starttag(self, tag, attrs):
        classe = dict(attrs).get("class")
        self.pile.append((tag, classe))
        if classe == "encart":   self.dans_encart = True
        if tag == "thead":       self.dans_thead = True
        if tag == "tbody":       self.dans_thead = False
        if tag == "tr" and not self.dans_thead: self.blocs.append(["ligne", []])
        if tag == "tr" and self.dans_thead:     self.blocs.append(["entete", []])

        cle = (tag, classe) if (tag, classe) in FEUILLES else (tag, None)
        if cle in FEUILLES and self.tampon is None:
            # `footer span` et `p` nu ne comptent que là où ils ont un sens.
            genre = FEUILLES[cle]
            if genre == "footer_span" and not any(t == "footer" for t, _ in self.pile): return
            if genre == "para" and not self.dans_encart: return
            self.tampon, self.type_courant = [], genre
            self.profondeur = len(self.pile)
            if genre == "h3" and self.dans_encart: self.type_courant = "encart_h3"
            if genre == "para": self.type_courant = "encart_p"

    def handle_endtag(self, tag):
        ferme_conteneur = (self.tampon is not None and len(self.pile) == self.profondeur
                           and self.pile and self.pile[-1][0] == tag)
        if ferme_conteneur:
            runs = [(t, s) for t, s in self.tampon if t.strip() or t == " "]
            if runs:
                if self.type_courant in ("th", "td"):
                    if self.blocs and self.blocs[-1][0] in ("entete", "ligne"):
                        self.blocs[-1][1].append(runs)
                else:
                    self.blocs.append([self.type_courant, runs])
            self.tampon = self.type_courant = None
            self.profondeur = -1
        if self.pile:
            _, classe = self.pile.pop()
            if classe == "encart": self.dans_encart = False

    def handle_data(self, data):
        if self.tampon is None: return
        texte = data.replace(" ", " ")
        texte = re.sub(r"\s+", " ", texte)
        if not texte: return
        style = ""
        for t, c in reversed(self.pile):
            if (t, c) in STYLES: style = STYLES[(t, c)]; break
        self.tampon.append((texte, style))


with open(SOURCE, encoding="utf-8") as f:
    html = f.read()
corps = html[html.index('<div class="feuille">'):]
lecteur = LecteurReleve(); lecteur.feed(corps)
blocs = lecteur.blocs

# ══════════════════════════════════════════════════════════════════════════
#  2. Écriture du .docx
# ══════════════════════════════════════════════════════════════════════════
doc = Document()

for s in doc.sections:
    s.page_height, s.page_width = Cm(29.7), Cm(21)
    s.top_margin = s.bottom_margin = Cm(2.2)
    s.left_margin = s.right_margin = Cm(2.2)

def police(style, nom, taille, gras=False, couleur=None, italique=False):
    f = style.font
    f.name, f.size, f.bold, f.italic = nom, Pt(taille), gras, italique
    if couleur: f.color.rgb = couleur
    f.element.rPr.rFonts.set(qn("w:eastAsia"), nom)

st = doc.styles
police(st["Normal"], SANS, 10.5, couleur=INK)
st["Normal"].paragraph_format.space_after = Pt(4)
st["Normal"].paragraph_format.line_spacing = 1.18
police(st["Title"], SERIF, 26, gras=True, couleur=INK)
police(st["Heading 1"], SERIF, 17, gras=True, couleur=INK)
police(st["Heading 2"], SERIF, 12.5, gras=True, couleur=NAVY)
police(st["Heading 3"], SERIF, 11.5, gras=True, couleur=INK)
for n, av, ap in (("Heading 1", 22, 4), ("Heading 2", 14, 5), ("Heading 3", 10, 4)):
    st[n].paragraph_format.space_before, st[n].paragraph_format.space_after = Pt(av), Pt(ap)
    st[n].paragraph_format.keep_with_next = True

def ombrer(cellule, hexa):
    sh = OxmlElement("w:shd"); sh.set(qn("w:val"), "clear"); sh.set(qn("w:fill"), hexa)
    cellule._tc.get_or_add_tcPr().append(sh)

def bordures(cellule, **cotes):
    """cotes : haut/bas/gauche/droite -> (taille_huitiemes_de_point, couleur_hexa) ou None."""
    tcPr = cellule._tc.get_or_add_tcPr()
    bd = OxmlElement("w:tcBorders")
    for nom, cle in (("top", "haut"), ("left", "gauche"), ("bottom", "bas"), ("right", "droite")):
        e = OxmlElement(f"w:{nom}")
        v = cotes.get(cle)
        if v: e.set(qn("w:val"), "single"); e.set(qn("w:sz"), str(v[0])); e.set(qn("w:color"), v[1])
        else: e.set(qn("w:val"), "nil")
        bd.append(e)
    tcPr.append(bd)

def bord_paragraphe(p, cote="bottom", taille=6, couleur="12161D"):
    pPr = p._p.get_or_add_pPr()
    bd = pPr.find(qn("w:pBdr")) or OxmlElement("w:pBdr")
    e = OxmlElement(f"w:{cote}")
    e.set(qn("w:val"), "single"); e.set(qn("w:sz"), str(taille))
    e.set(qn("w:space"), "4"); e.set(qn("w:color"), couleur)
    bd.append(e); pPr.append(bd)

def ecrire(p, runs, base=10.5, couleur=None, police_base=SANS):
    """Applique les styles de caractère relevés dans le HTML."""
    runs = list(runs)
    # L'indentation du HTML laisse une espace en tête de bloc : visible dans Word.
    if runs: runs[0] = (runs[0][0].lstrip(), runs[0][1])
    for texte, style in runs:
        if style == "tag":  r = p.add_run(" [" + texte.strip() + "]")
        elif style == "neuf": r = p.add_run(" [" + texte.strip().upper() + "]")
        else: r = p.add_run(texte)
        r.font.size = Pt(base); r.font.name = police_base
        if couleur: r.font.color.rgb = couleur
        if style == "prec":   r.font.italic = True; r.font.color.rgb = MUTED
        elif style == "code": r.font.name = MONO; r.font.size = Pt(base - 0.5)
        elif style == "gras": r.font.bold = True
        elif style == "tag":  r.font.bold = True; r.font.size = Pt(base - 2); r.font.color.rgb = NAVY
        elif style == "neuf": r.font.bold = True; r.font.size = Pt(base - 2); r.font.color.rgb = CYAN
    return p

def plat(runs): return "".join(t for t, _ in runs).strip()

def encadre(titre_runs, paragraphes, accent=CYAN, fond="F4F6FB"):
    t = doc.add_table(rows=1, cols=1); t.alignment = WD_TABLE_ALIGNMENT.CENTER
    c = t.cell(0, 0); ombrer(c, fond)
    bordures(c, gauche=(18, f"{accent.__str__()}"), haut=(4, "E4E1D9"),
             bas=(4, "E4E1D9"), droite=(4, "E4E1D9"))
    c.paragraphs[0]._p.getparent().remove(c.paragraphs[0]._p)
    if titre_runs:
        p = c.add_paragraph(); p.paragraph_format.space_after = Pt(5)
        ecrire(p, titre_runs, base=11, police_base=SERIF)
        for r in p.runs: r.font.bold = True
    for runs in paragraphes:
        p = c.add_paragraph(); p.paragraph_format.space_after = Pt(3)
        ecrire(p, runs, base=10, couleur=MUTED)
    doc.add_paragraph().paragraph_format.space_after = Pt(6)

# ── Parcours des blocs, dans l'ordre du document ────────────────────────────
totaux, i = [], 0
lot_en_attente = None
tableau = None

def vider_totaux():
    """Les cinq chiffres d'ouverture, en un tableau d'une ligne."""
    global totaux
    if not totaux: return
    t = doc.add_table(rows=2, cols=len(totaux))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for j, (n, l) in enumerate(totaux):
        ch = t.cell(0, j).paragraphs[0]; ch.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = ch.add_run(plat(n)); r.font.name = MONO; r.font.size = Pt(19)
        r.font.bold = True; r.font.color.rgb = NAVY
        cl = t.cell(1, j).paragraphs[0]; cl.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = cl.add_run(plat(l)); r.font.size = Pt(8.5); r.font.color.rgb = MUTED
        bordures(t.cell(0, j), droite=(4, "EFEDE7") if j < len(totaux) - 1 else None)
        bordures(t.cell(1, j), droite=(4, "EFEDE7") if j < len(totaux) - 1 else None,
                 bas=(6, "E4E1D9"))
    totaux = []
    doc.add_paragraph().paragraph_format.space_after = Pt(8)

encart_titre, encart_paras = None, []

def vider_encart():
    global encart_titre, encart_paras
    if encart_titre or encart_paras:
        encadre(encart_titre, encart_paras)
    encart_titre, encart_paras = None, []

while i < len(blocs):
    genre, contenu = blocs[i][0], blocs[i][1]

    if genre != "tot_n" and genre != "tot_l": vider_totaux()
    if genre not in ("encart_h3", "encart_p"): vider_encart()

    if genre == "titre":
        p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(2)
        r = p.add_run("BINNIE'S ENGLISH TRAINING · ANNEXE DE FACTURATION")
        r.font.name = MONO; r.font.size = Pt(8); r.font.bold = True; r.font.color.rgb = CYAN
        doc.add_paragraph(plat(contenu), style="Title").paragraph_format.space_after = Pt(4)

    elif genre == "soustitre":
        p = doc.add_paragraph(); ecrire(p, contenu, base=11, couleur=MUTED)

    elif genre == "periode":
        p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(16)
        r = p.add_run(plat(contenu)); r.font.name = MONO; r.font.size = Pt(9.5); r.font.bold = True
        bord_paragraphe(p, "bottom", 12)

    elif genre == "tot_n": totaux.append([contenu, []])
    elif genre == "tot_l":
        if totaux: totaux[-1][1] = contenu

    elif genre == "methode":
        encadre([("Comment cette liste a été établie.", "gras")],
                [[(t, s) for t, s in contenu if t.strip() != "Comment cette liste a été établie."]],
                accent=CYAN, fond="ECF7FA")

    elif genre == "plateforme":
        doc.add_paragraph(plat(contenu), style="Heading 1")

    elif genre in ("quoi", "chiffres"):
        p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(2)
        r = p.add_run(plat(contenu))
        r.font.size = Pt(9 if genre == "quoi" else 8.5)
        r.font.color.rgb = MUTED if genre == "quoi" else FAINT
        if genre == "chiffres": r.font.name = MONO
        if genre == "chiffres": bord_paragraphe(p, "bottom", 6, "12161D")

    elif genre == "lot_num": lot_en_attente = plat(contenu)
    elif genre == "h3":
        p = doc.add_paragraph(style="Heading 2")
        if lot_en_attente:
            r = p.add_run(lot_en_attente + "   ")
            r.font.name = MONO; r.font.size = Pt(9); r.font.color.rgb = CYAN; r.font.bold = True
            lot_en_attente = None
        r = p.add_run(plat(contenu)); r.font.name = SERIF; r.font.size = Pt(12.5)
        r.font.bold = True; r.font.color.rgb = NAVY

    elif genre == "compte":
        p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(4)
        r = p.add_run(plat(contenu)); r.font.name = MONO; r.font.size = Pt(8.5); r.font.color.rgb = FAINT

    elif genre == "puce":
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.space_after = Pt(2); p.paragraph_format.left_indent = Cm(0.9)
        ecrire(p, contenu, base=10.5)

    elif genre == "entete":
        tableau = doc.add_table(rows=1, cols=len(contenu)); tableau.style = "Table Grid"
        for j, runs in enumerate(contenu):
            c = tableau.cell(0, j); ombrer(c, "F2F4FA")
            pr = c.paragraphs[0]; pr.alignment = WD_ALIGN_PARAGRAPH.RIGHT if j else WD_ALIGN_PARAGRAPH.LEFT
            r = pr.add_run(plat(runs)); r.font.size = Pt(8.5); r.font.bold = True; r.font.color.rgb = NAVY

    elif genre == "ligne" and tableau is not None:
        cells = tableau.add_row().cells
        for j, runs in enumerate(contenu):
            pr = cells[j].paragraphs[0]
            pr.alignment = WD_ALIGN_PARAGRAPH.RIGHT if j else WD_ALIGN_PARAGRAPH.LEFT
            ecrire(pr, runs, base=10, police_base=MONO if j else SANS)
            if j == 0:
                for r in pr.runs:
                    if not r.font.italic: r.font.bold = True
        if plat(contenu[0]).lower().startswith("total"):
            for c in cells: ombrer(c, "F2F4FA")
            for c in cells:
                for pr in c.paragraphs:
                    for r in pr.runs: r.font.bold = True
            doc.add_paragraph().paragraph_format.space_after = Pt(6)
            tableau = None

    elif genre == "encart_h3": encart_titre = contenu
    elif genre == "encart_p":  encart_paras.append(contenu)

    elif genre == "footer_span":
        p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(1)
        r = p.add_run(plat(contenu)); r.font.size = Pt(8.5); r.font.color.rgb = FAINT

    i += 1

vider_totaux(); vider_encart()

# ── Pied de page : numérotation automatique ─────────────────────────────────
pied = doc.sections[0].footer.paragraphs[0]
pied.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = pied.add_run("Relevé de travaux BET · page ")
r.font.size = Pt(8); r.font.color.rgb = FAINT
fld = OxmlElement("w:fldSimple"); fld.set(qn("w:instr"), "PAGE")
pied._p.append(fld)

doc.core_properties.title = "Relevé de travaux BET"
doc.core_properties.subject = "Annexe de facturation — dash & Frontend, 05/08/2026 au 26/09/2026"
doc.core_properties.author = "Binnie's English Training"

doc.save(CIBLE)
print("écrit :", CIBLE)
print("blocs lus :", len(blocs))
