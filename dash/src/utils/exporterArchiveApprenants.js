/**
 * L'archive des apprenants d'un coach, au format de son classeur.
 *
 * Reprend la feuille `ON BREAK` que les coachs tiennent à la main - mêmes colonnes, même
 * ordre, mêmes intitulés anglais :
 *
 *   Name · Occupation · Contact · Started with me on · Took a break on
 *   · REASON FOR STOPPING · Total Month Spent · Recommendations
 *
 * Deux colonnes sont AJOUTÉES, et elles manquent cruellement au classeur : `Class` et
 * `Level`. Là-bas un onglet vaut une classe, donc l'information est dans le nom de
 * l'onglet ; ici un coach en a sept, et sans elles on ne saurait pas d'où vient chaque
 * apprenant.
 *
 * Et une colonne `Status`, parce que cette archive contient aussi les apprenants ENCORE
 * EN COURS. Dix départs sur douze apprenants ou sur cent vingt ne racontent pas la même
 * histoire : sans le dénominateur, une archive se lit comme un acte d'accusation.
 */

const VERT = "FF16A34A", VERT_CLAIR = "FFDCFCE7";
const ROUGE = "FFDC2626", ROUGE_CLAIR = "FFFEE2E2";
// Le troisième état : parti, puis revenu. Ni tout à fait présent, ni parti.
const AMBRE = "FF9A3412", AMBRE_CLAIR = "FFFFEDD5";
const ARDOISE = "FF0F172A", GRIS = "FFF1F5F9", BORD = "FFCBD5E1";

const dateFr = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "");

/** Les motifs d'arrêt, dans la langue du classeur. */
const MOTIFS = {
  demenagement:   "Moved / relocated",
  financier:      "Financial reasons",
  travail:        "Stopped due to work commitment",
  sante:          "Stopped due to health issues",
  scolarite:      "Resumed at school",
  niveau_suivant: "Moved to next level",
  insatisfaction: "Requested another coach",
  pause:          "Took a break",
  autre:          "Other",
};
const libelleMotif = (m) => (m ? (MOTIFS[m] || m) : "");

export async function exporterArchiveApprenants({ coachNom, apprenants = [], totaux, annee }) {
  const ExcelJS = (await import("exceljs")).default;
  const { saveAs } = await import("file-saver");

  const wb = new ExcelJS.Workbook();
  wb.creator = "BET - Binnie's English Training";
  wb.created = new Date();
  const ws = wb.addWorksheet("ON BREAK", {
    views: [{ state: "frozen", ySplit: 5 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  /* ── Bandeau, à l'image du classeur ── */
  ws.mergeCells("B2:D2");
  ws.getCell("B2").value = "LEARNERS' PROFILE";
  ws.getCell("B2").font = { bold: true, size: 13, color: { argb: ARDOISE } };

  ws.mergeCells("F2:L2");
  ws.getCell("F2").value = "TEACHERS KEEP RECORD OF LEARNERS WHO HAVE STOPPED CLASSES HERE";
  ws.getCell("F2").font = { bold: true, size: 11, color: { argb: "FF64748B" } };

  ws.mergeCells("B3:L3");
  ws.getCell("B3").value = `${coachNom || "Coach"}${annee ? ` - année ${annee}` : ""}`
    + `   ·   ${totaux?.total ?? apprenants.length} apprenant(s)`
    + `   ·   ${totaux?.actifs ?? 0} en cours`
    + `   ·   ${totaux?.partis ?? 0} parti(s)`
    + (totaux?.taux_retention != null ? `   ·   rétention ${totaux.taux_retention} %` : "");
  ws.getCell("B3").font = { size: 11, italic: true, color: { argb: "FF475569" } };

  /* ── En-têtes ── */
  const COLONNES = [
    { cle: "n",              titre: "N°",                    largeur: 5  },
    { cle: "nom",            titre: "Name",                  largeur: 26 },
    { cle: "occupation",     titre: "Occupation",            largeur: 18 },
    { cle: "contact",        titre: "Contact",               largeur: 20 },
    { cle: "classe",         titre: "Class",                 largeur: 24 },
    { cle: "niveau",         titre: "Level",                 largeur: 9  },
    { cle: "arrivee",        titre: "Started with me on",    largeur: 16 },
    { cle: "sortie",         titre: "Took a break on",       largeur: 16 },
    { cle: "motif",          titre: "REASON FOR STOPPING",   largeur: 30 },
    { cle: "duree",          titre: "Total Month Spent",     largeur: 20 },
    { cle: "statut",         titre: "Status",                largeur: 12 },
    { cle: "recommandations", titre: "Recommendations",      largeur: 34 },
  ];

  const ligneEntete = 5;
  COLONNES.forEach((c, i) => {
    const cell = ws.getCell(ligneEntete, i + 2);   // colonne B, comme le classeur
    cell.value = c.titre;
    cell.font = { bold: true, size: 10.5, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARDOISE } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: BORD } } };
    ws.getColumn(i + 2).width = c.largeur;
  });
  ws.getRow(ligneEntete).height = 26;

  /* ── Lignes ── */
  apprenants.forEach((a, i) => {
    const r = ligneEntete + 1 + i;
    const parti = !!a.parti;
    /* TROIS ÉTATS, pas deux. Un apprenant parti puis revenu ressortait « Ongoing », sa
       pause effacée et son ancienneté gonflée des mois d'absence - alors que cette feuille
       existe précisément pour consigner les pauses. `Returned` la rend visible tout en
       gardant une ligne par personne. */
    const revenu = !parti && !!a.revenu;
    const motifLigne = [
      libelleMotif(a.motif),
      a.detail_motif ? `- ${a.detail_motif}` : "",
      revenu && a.date_reprise ? `(back on ${dateFr(a.date_reprise)})` : "",
      revenu && a.nb_pauses > 1 ? `· ${a.nb_pauses} breaks` : "",
    ].filter(Boolean).join(" ");

    const valeurs = [
      i + 1,
      a.nom || "",
      // L'occupation n'existe pas encore en base : la colonne est conservée pour que la
      // feuille reste superposable au classeur, et se remplira le jour où le champ existera.
      a.occupation || "",
      [a.telephone, a.email].filter(Boolean).join(" · "),
      a.classe || "",
      a.niveau || "",
      dateFr(a.date_arrivee),
      dateFr(a.date_sortie),
      motifLigne,
      a.duree_texte || "",
      parti ? "Stopped" : revenu ? "Returned" : "Ongoing",
      a.recommandations || "",
    ];
    valeurs.forEach((v, j) => {
      const cell = ws.getCell(r, j + 2);
      cell.value = v;
      cell.font = { size: 10.5, color: { argb: ARDOISE } };
      cell.alignment = { vertical: "middle", wrapText: j === 8 || j === 11,
        horizontal: j === 0 || (j >= 5 && j <= 7) ? "center" : "left" };
      cell.border = { bottom: { style: "hair", color: { argb: BORD } } };
      // Une ligne sur deux en gris : au-delà de vingt apprenants, l'œil saute de ligne.
      if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
    });
    // La colonne Status porte la couleur : c'est elle qu'on cherche en parcourant la feuille.
    const st = ws.getCell(r, 2 + 10);
    const teinte = parti ? ROUGE : revenu ? AMBRE : VERT;
    const fond   = parti ? ROUGE_CLAIR : revenu ? AMBRE_CLAIR : VERT_CLAIR;
    st.font = { size: 10.5, bold: true, color: { argb: teinte } };
    st.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fond } };
    st.alignment = { vertical: "middle", horizontal: "center" };
  });

  // Filtres sur l'en-tête : une archive se lit en triant par classe ou par motif.
  if (apprenants.length) {
    ws.autoFilter = {
      from: { row: ligneEntete, column: 2 },
      to: { row: ligneEntete + apprenants.length, column: 1 + COLONNES.length },
    };
  }

  const nom = String(coachNom || "coach").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 32);
  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `archive-apprenants-${nom}${annee ? `-${annee}` : ""}.xlsx`);
}

export { MOTIFS, libelleMotif };
