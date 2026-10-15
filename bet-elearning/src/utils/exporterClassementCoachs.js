import ExcelJS from "exceljs";

/**
 * Export Excel du classement des coachs.
 *
 * Distinct de `exporterAppraisalCoachs`, qui reproduit la feuille terrain transposée - un
 * bloc par coach, les critères en lignes. Ici on exporte le CLASSEMENT : un coach par
 * ligne, sa moyenne, son volume, sa tendance. Deux documents, deux usages - celui-ci se
 * trie et se filtre dans Excel, l'autre se lit.
 *
 * Sert aussi bien au classement issu des observations qu'à celui issu des appréciations
 * d'apprenants : la structure est la même, seul l'intitulé de la colonne de volume change.
 */
export async function exporterClassementCoachs({
  lignes,
  periode = "",
  libelleVolume = "Observations",
  titre = "Classement des coachs",
  nomFichier = "classement_coachs",
}) {
  if (!Array.isArray(lignes) || !lignes.length) return false;

  const wb = new ExcelJS.Workbook();
  wb.creator = "BET";
  wb.created = new Date();
  const ws = wb.addWorksheet("Classement", {
    views: [{ state: "frozen", ySplit: 4 }],
  });

  ws.columns = [
    { key: "rang",     width: 7 },
    { key: "coach",    width: 34 },
    { key: "volume",   width: 15 },
    { key: "moyenne",  width: 12 },
    { key: "mini",     width: 10 },
    { key: "maxi",     width: 10 },
    { key: "tendance", width: 13 },
    { key: "apprec",   width: 18 },
  ];

  ws.mergeCells("A1:H1");
  const tt = ws.getCell("A1");
  tt.value = titre;
  tt.font = { size: 14, bold: true, color: { argb: "FF1B3080" } };
  tt.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 26;

  ws.mergeCells("A2:H2");
  const st = ws.getCell("A2");
  st.value = [periode, `${lignes.length} coach${lignes.length > 1 ? "s" : ""}`,
    `Export du ${new Date().toLocaleDateString("fr-FR")}`].filter(Boolean).join(" · ");
  st.font = { size: 10, italic: true, color: { argb: "FF6B7385" } };
  st.alignment = { horizontal: "center" };

  const enTete = ws.addRow({
    rang: "#", coach: "Coach", volume: libelleVolume, moyenne: "Moyenne /5",
    mini: "Note mini", maxi: "Note maxi", tendance: "Tendance", apprec: "Appréciation",
  });
  enTete.eachCell(c => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B3080" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  enTete.height = 22;

  // Mêmes paliers que les écrans : un coach ne doit pas changer de catégorie selon
  // qu'on le regarde à l'écran ou dans le fichier.
  const apprecie = (m) =>
    m >= 4.5 ? "Excellent" : m >= 3.5 ? "Bon" : m >= 2.5 ? "Acceptable" : "À accompagner";
  const couleur = (m) =>
    m >= 4.5 ? "FFDCFCE7" : m >= 3.5 ? "FFE0F2FE" : m >= 2.5 ? "FFFEF3C7" : "FFFEE2E2";

  lignes.forEach((l, i) => {
    const notes = Array.isArray(l.notes) ? l.notes.map(Number).filter(n => n > 0) : [];
    const r = ws.addRow({
      rang: i + 1,
      coach: l.nom || "-",
      volume: l.nb ?? notes.length,
      // Nombre et non texte : sans cela, Excel ne saurait ni trier ni moyenner la colonne.
      moyenne: Number(Number(l.moyenne).toFixed(1)),
      mini: notes.length ? Math.min(...notes) : "",
      maxi: notes.length ? Math.max(...notes) : "",
      tendance: l.tendance === "hausse" ? "En hausse" : l.tendance === "baisse" ? "En baisse" : "Stable",
      apprec: apprecie(Number(l.moyenne)),
    });
    r.eachCell(c => {
      c.alignment = { vertical: "middle", horizontal: "center" };
      c.border = { bottom: { style: "hair", color: { argb: "FFE2E5EE" } } };
      c.font = { size: 10 };
    });
    r.getCell("coach").alignment = { vertical: "middle", horizontal: "left" };
    const fond = couleur(Number(l.moyenne));
    r.getCell("moyenne").fill = { type: "pattern", pattern: "solid", fgColor: { argb: fond } };
    r.getCell("moyenne").font = { bold: true, size: 11 };
    r.getCell("apprec").fill = { type: "pattern", pattern: "solid", fgColor: { argb: fond } };
  });

  const blob = new Blob([await wb.xlsx.writeBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomFichier}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  // Révoquer, sinon le blob reste en mémoire jusqu'au rechargement de la page.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export default exporterClassementCoachs;

/**
 * Export du DÉTAIL des évaluations d'un coach - une ligne par note reçue.
 *
 * Distinct de l'export du classement, qui donne une ligne par coach. Ici on emporte ce
 * qu'on a sous les yeux, filtres compris : c'est la sélection en cours qui intéresse,
 * pas la totalité.
 */
export async function exporterEvaluationsDetail({ nomCoach, lignes, periode = "" }) {
  if (!Array.isArray(lignes) || !lignes.length) return false;

  const wb = new ExcelJS.Workbook();
  wb.creator = "BET";
  const ws = wb.addWorksheet("Évaluations", { views: [{ state: "frozen", ySplit: 4 }] });

  ws.columns = [
    { key: "date",   width: 14 },
    { key: "seance", width: 28 },
    { key: "classe", width: 22 },
    { key: "niveau", width: 10 },
    { key: "appr",   width: 26 },
    { key: "note",   width: 9 },
    { key: "niv",    width: 15 },
    { key: "com",    width: 60 },
  ];

  ws.mergeCells("A1:H1");
  const t = ws.getCell("A1");
  t.value = `Évaluations des apprenants - ${nomCoach}`;
  t.font = { size: 14, bold: true, color: { argb: "FF1B3080" } };
  t.alignment = { horizontal: "center" };
  ws.getRow(1).height = 26;

  ws.mergeCells("A2:H2");
  const st = ws.getCell("A2");
  st.value = [periode, `${lignes.length} évaluation${lignes.length > 1 ? "s" : ""}`,
    `Export du ${new Date().toLocaleDateString("fr-FR")}`].filter(Boolean).join(" · ");
  st.font = { size: 10, italic: true, color: { argb: "FF6B7385" } };
  st.alignment = { horizontal: "center" };

  const head = ws.addRow({
    date: "Date", seance: "Séance", classe: "Classe", niveau: "Niveau",
    appr: "Apprenant", note: "Note", niv: "Appréciation", com: "Commentaire",
  });
  head.eachCell(c => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B3080" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
  });
  head.height = 20;

  const LIB = { 5: "Excellent", 4: "Bon", 3: "Acceptable", 2: "Insuffisant", 1: "Insuffisant" };
  const FOND = { 5: "FFDCFCE7", 4: "FFE0F2FE", 3: "FFFEF3C7", 2: "FFFEE2E2", 1: "FFFEE2E2" };

  lignes.forEach(a => {
    const n = Number(a.note);
    const r = ws.addRow({
      date: a.seance?.date_seance || (a.created_at || "").slice(0, 10),
      seance: a.seance?.titre || "Séance",
      classe: a.groupe?.nom || "-",
      niveau: a.groupe?.niveau || "",
      appr: a.nom_apprenant || "",
      // Nombre et non texte : Excel doit pouvoir trier et moyenner cette colonne.
      note: n,
      niv: LIB[n] || "",
      com: a.commentaire || "",
    });
    r.eachCell(c => { c.font = { size: 10 }; c.alignment = { vertical: "top" }; });
    r.getCell("note").alignment = { horizontal: "center", vertical: "top" };
    r.getCell("note").font = { bold: true, size: 11 };
    r.getCell("note").fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOND[n] } };
    r.getCell("niv").fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOND[n] } };
    // Les commentaires font parfois plusieurs lignes : sans le retour à la ligne, ils
    // débordent sur les colonnes voisines à l'impression.
    r.getCell("com").alignment = { wrapText: true, vertical: "top" };
  });

  const blob = new Blob([await wb.xlsx.writeBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `evaluations_${(nomCoach || "coach").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
