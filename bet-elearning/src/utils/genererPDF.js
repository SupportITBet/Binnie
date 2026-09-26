/**
 * Exporte un tableau de données en fichier Excel (.csv UTF-8 avec BOM).
 * @param {string[][]} lignes  - Tableau de lignes, chaque ligne = tableau de cellules
 * @param {string}     nomFichier - Nom du fichier sans extension
 */
export function exporterExcel(lignes, nomFichier = 'export') {
  const sep = ';'; // séparateur Excel FR
  const csvContent = lignes
    .map(row =>
      row.map(cell => {
        const val = cell == null ? '' : String(cell);
        // Encadre de guillemets si la valeur contient le séparateur, des guillemets ou des sauts de ligne
        return /[;\n"]/.test(val) ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(sep)
    )
    .join('\r\n');

  // BOM UTF-8 pour que Excel reconnaisse l'encodage
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href     = url;
  lien.download = `${nomFichier}.csv`;
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  URL.revokeObjectURL(url);
}

/**
 * Exporte un tableau de données en vrai fichier Excel (.xlsx) stylé - en-tête coloré,
 * lignes zébrées, colonnes dimensionnées, filtre automatique. Remplace exporterExcel()
 * (qui ne produit qu'un CSV malgré son nom, sans aucune mise en forme possible).
 * @param {Object}   options
 * @param {string}   options.nomFichier - nom du fichier, avec ou sans extension .xlsx
 * @param {string}   [options.titre] - titre affiché en première ligne (fusionnée)
 * @param {string}   [options.sousTitre] - sous-titre affiché sous le titre
 * @param {Array<{label:string, width?:number, numFmt?:string, align?:string, bold?:boolean}>} options.colonnes
 * @param {Array<Array<any>>} options.lignes - une ligne = un tableau de valeurs, dans l'ordre des colonnes
 * @param {string}   [options.couleurEntete] - couleur hex (sans #) de fond de l'en-tête, ex '6366F1'
 * @param {Array<{nom?:string, titre?:string, sousTitre?:string, colonnes:Array, lignes:Array<Array<any>>, couleurEntete?:string}>} [options.feuilles] - pour un classeur multi-onglets ; si fourni, remplace titre/sousTitre/colonnes/lignes/couleurEntete
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
  wb.creator = 'BET E-Learning';
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

/**
 * Ouvre une fenêtre d'impression avec le contenu HTML fourni.
 * Simule un export PDF via le dialogue d'impression du navigateur.
 */
export function genererPDF(htmlContent, titre = 'Document BET') {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;

  win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>${titre}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: "Segoe UI", "Plus Jakarta Sans", Arial, sans-serif;
      font-size: 13px;
      color: #0F172A;
      background: #fff;
      padding: 0;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
      @page { margin: 20mm 18mm; }
    }
    @media screen {
      body { padding: 24px; max-width: 860px; margin: 0 auto; }
    }

    /* ── Barre d'actions (écran uniquement) ── */
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      margin-bottom: 20px;
      border-bottom: 1px solid #E2E8F0;
    }
    .toolbar-title { font-size: 14px; font-weight: 700; color: #0F172A; }
    .btn-print {
      background: #0891B2;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 9px 20px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }

    /* ── En-tête du document ── */
    .doc-header {
      background: linear-gradient(135deg, #0F172A 0%, #0E4F6B 60%, #0891B2 100%);
      color: #fff;
      padding: 28px 32px;
      border-radius: 8px 8px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0;
    }
    .doc-header-logo { font-size: 20px; font-weight: 900; letter-spacing: -0.5px; }
    .doc-header-sub  { font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 2px; }
    .doc-header-right { text-align: right; font-size: 11px; color: rgba(255,255,255,0.65); line-height: 1.6; }
    .doc-title-band {
      background: #0891B2;
      color: #fff;
      padding: 14px 32px;
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.02em;
      margin-bottom: 0;
    }

    /* ── Corps ── */
    .doc-body { position: relative; padding: 28px 32px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 8px 8px; }

    /* ── Cachet (ex: "Soldé") ── */
    .doc-stamp {
      position: absolute;
      top: 110px;
      right: 48px;
      border: 4px solid #059669;
      color: #059669;
      font-size: 22px;
      font-weight: 900;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 10px 22px;
      border-radius: 10px;
      transform: rotate(-14deg);
      opacity: 0.85;
      pointer-events: none;
    }

    /* ── Section ── */
    .section-title {
      font-size: 12px;
      font-weight: 800;
      color: #0891B2;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin: 24px 0 10px;
      padding-bottom: 6px;
      border-bottom: 2px solid #E2E8F0;
    }
    .section-title:first-child { margin-top: 0; }

    /* ── Info grid ── */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 8px; }
    .info-row  { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
    .info-label { color: #64748B; }
    .info-value { font-weight: 700; color: #0F172A; }

    /* ── KPI cards ── */
    .kpi-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin: 14px 0; }
    .kpi-card { background: #F8FAFC; border-radius: 8px; padding: 14px 12px; text-align: center; border-top: 3px solid #0891B2; }
    .kpi-val  { font-size: 22px; font-weight: 900; color: #0F172A; }
    .kpi-lbl  { font-size: 10px; color: #64748B; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.05em; }

    /* ── Tableau ── */
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 10px 0; }
    thead th { background: #0F172A; color: #fff; padding: 9px 12px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
    tbody tr:nth-child(even) { background: #F8FAFC; }
    tbody td { padding: 9px 12px; border-bottom: 1px solid #F1F5F9; color: #0F172A; }
    .td-right { text-align: right; font-weight: 700; }
    tfoot td { background: #0F172A; color: #fff; padding: 10px 12px; font-weight: 800; }

    /* ── Badge ── */
    .badge { display:inline-block; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:700; }
    .badge-green  { background:#D1FAE5; color:#065F46; }
    .badge-orange { background:#FEF3C7; color:#92400E; }
    .badge-red    { background:#FEE2E2; color:#991B1B; }
    .badge-blue   { background:#DBEAFE; color:#1D4ED8; }

    /* ── Appreciation box ── */
    .apprec-box { background:#F0F9FF; border-left:4px solid #0891B2; padding:14px 18px; border-radius:0 8px 8px 0; font-size:13px; color:#0F172A; font-style:italic; line-height:1.6; margin:10px 0; }

    /* ── Certificat/Attestation spécifique ── */
    .cert-body  { text-align:center; padding:40px 32px; border:3px solid #F59E0B; border-radius:8px; margin:16px 0; }
    .cert-seal  { font-size:64px; margin-bottom:16px; }
    .cert-main  { font-size:28px; font-weight:900; color:#0F172A; margin-bottom:8px; }
    .cert-name  { font-size:22px; font-weight:700; color:#0891B2; margin:12px 0; }
    .cert-text  { font-size:14px; color:#475569; line-height:1.7; max-width:500px; margin:0 auto 20px; }
    .cert-criteria { display:flex; justify-content:center; gap:24px; margin:16px 0; }
    .cert-crit  { background:#F0FDF4; border:1px solid #6EE7B7; border-radius:8px; padding:10px 16px; text-align:center; }
    .cert-crit-val { font-size:18px; font-weight:900; color:#065F46; }
    .cert-crit-lbl { font-size:10px; color:#047857; margin-top:2px; }
    .cert-date  { font-size:12px; color:#94A3B8; margin-top:16px; }

    /* ── Signatures ── */
    .signatures { display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px; margin-top:36px; padding-top:20px; border-top:1px solid #E2E8F0; }
    .sig-block  { text-align:center; }
    .sig-line   { border-bottom:1px solid #0F172A; margin:40px 12px 6px; }
    .sig-name   { font-size:11px; font-weight:700; color:#0F172A; }
    .sig-role   { font-size:10px; color:#64748B; }

    /* ── Pied de page ── */
    .doc-footer { margin-top:28px; padding-top:14px; border-top:1px solid #E2E8F0; display:flex; justify-content:space-between; font-size:10px; color:#94A3B8; }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <span class="toolbar-title">📄 ${titre}</span>
    <button class="btn-print" onclick="window.print()">🖨 Imprimer / Enregistrer en PDF</button>
  </div>
  ${htmlContent}
</body>
</html>`);

  win.document.close();
  win.focus();
}

/** Formate une date ISO en français */
export function fmtDatePDF(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
}

/** Ligne de tableau */
export function ligneTableau(cells) {
  return `<tr>${cells.map(c => `<td${c.right?' class="td-right"':''}${c.bold?' style="font-weight:700"':''}>${c.val}</td>`).join('')}</tr>`;
}
