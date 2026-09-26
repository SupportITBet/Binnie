/**
 * Exporte un tableau de données en vrai fichier Excel (.xlsx) stylé - en-tête coloré,
 * lignes zébrées, colonnes dimensionnées, filtre automatique.
 *
 * @param {string}   nomFichier - nom du fichier (l'extension .xlsx est ajoutée si absente)
 * @param {string}   [titre] - titre affiché en première ligne (fusionnée)
 * @param {string}   [sousTitre] - sous-titre affiché sous le titre
 * @param {Array<{label:string, width?:number, numFmt?:string, align?:string, bold?:boolean}>} [colonnes]
 * @param {Array<Array<any>>} [lignes] - une ligne = un tableau de valeurs, dans l'ordre des colonnes
 * @param {string}   [couleurEntete] - couleur hex (sans #) de fond de l'en-tête, ex '6366F1'
 * @param {Array<{nom?:string, titre?:string, sousTitre?:string, colonnes:Array, lignes:Array<Array<any>>, couleurEntete?:string}>} [feuilles] - pour un classeur multi-onglets ; si fourni, remplace titre/sousTitre/colonnes/lignes/couleurEntete
 */
function remplirFeuille(ws, { titre, sousTitre, colonnes, lignes, couleurEntete = '6366F1' }) {
  let ligneEntete = 1;
  if (titre) {
    ws.mergeCells(1, 1, 1, colonnes.length);
    const t = ws.getCell(1, 1);
    t.value = titre;
    t.font = { bold: true, size: 14, color: { argb: 'FF0F172A' } };
    t.alignment = { vertical: 'middle' };
    ws.getRow(1).height = 26;
    ligneEntete = 2;
    if (sousTitre) {
      ws.mergeCells(2, 1, 2, colonnes.length);
      const s = ws.getCell(2, 1);
      s.value = sousTitre;
      s.font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
      ws.getRow(2).height = 16;
      ligneEntete = 3;
    }
  }

  const enTete = ws.getRow(ligneEntete);
  enTete.values = colonnes.map(c => c.label);
  enTete.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${couleurEntete}` } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF334155' } } };
  });
  enTete.height = 22;

  lignes.forEach((ligne, i) => {
    const row = ws.addRow(ligne);
    const zebre = i % 2 === 1;
    row.eachCell((cell, colNumber) => {
      const colDef = colonnes[colNumber - 1];
      if (zebre) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
      cell.alignment = colDef?.align ? { vertical: 'middle', horizontal: colDef.align } : { vertical: 'middle' };
      if (colDef?.numFmt) cell.numFmt = colDef.numFmt;
      if (colDef?.bold) cell.font = { bold: true, color: { argb: 'FF0F172A' } };
    });
  });

  ws.columns = colonnes.map(c => ({ width: c.width || 18 }));
  ws.autoFilter = { from: { row: ligneEntete, column: 1 }, to: { row: ligneEntete, column: colonnes.length } };
  ws.views = [{ state: 'frozen', ySplit: ligneEntete }];
}

export async function exporterExcelStyle({ nomFichier, titre, sousTitre, colonnes, lignes, couleurEntete = '6366F1', feuilles }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BET';
  wb.created = new Date();

  if (feuilles?.length) {
    feuilles.forEach((f, i) => {
      const ws = wb.addWorksheet(f.nom || `Feuille${i + 1}`);
      remplirFeuille(ws, f);
    });
  } else {
    const ws = wb.addWorksheet('Export');
    remplirFeuille(ws, { titre, sousTitre, colonnes, lignes, couleurEntete });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const nom = nomFichier.endsWith('.xlsx') ? nomFichier : `${nomFichier}.xlsx`;
  const a = document.createElement('a');
  a.href = url; a.download = nom;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
