/**
 * Ouvre une fenêtre d'impression avec le contenu HTML fourni.
 * Simule un export PDF via le dialogue d'impression du navigateur - même moteur que
 * bet-elearning (Backend/../bet-elearning/src/utils/genererPDF.js), porté ici pour que
 * dash dispose de la même capacité d'export PDF (aucune dépendance supplémentaire).
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
      /* SANS CECI, LE DOCUMENT S'IMPRIME EN BLANC. Les navigateurs suppriment par défaut
         les fonds et les images de fond à l'impression, pour économiser l'encre : l'en-tête
         dégradé, les badges de couleur et le logo ci-dessous disparaissaient donc du PDF,
         qui ne ressemblait plus à ce qu'on voyait à l'écran. */
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
    @media screen {
      body { padding: 24px; max-width: 860px; margin: 0 auto; }
    }

    .toolbar { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; margin-bottom: 20px; border-bottom: 1px solid #E2E8F0; }
    .toolbar-title { font-size: 14px; font-weight: 700; color: #0F172A; }
    .btn-print { background: #0891B2; color: #fff; border: none; border-radius: 8px; padding: 9px 20px; font-size: 13px; font-weight: 700; cursor: pointer; }

    .doc-header { background: linear-gradient(135deg, #0F172A 0%, #0E4F6B 60%, #0891B2 100%); color: #fff; padding: 28px 32px; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0; }

    /* LE LOGO BET, POSÉ ICI ET NON DANS CHAQUE DOCUMENT.
       Six tableaux de bord appellent ce gabarit ; ajouter l'image dans chacun d'eux aurait
       demandé six modifications et garanti qu'un jour l'un d'eux soit oublié. Greffé en
       pseudo-élément du logo textuel, il apparaît partout d'un coup, sans qu'aucun appelant
       change. Le badge blanc est nécessaire : le logo est sombre, l'en-tête l'est aussi.
       Attention en modifiant ce bloc : tout ce CSS vit dans un littéral de gabarit JS,
       un accent grave y refermerait la chaîne. */
    .doc-header-logo { font-size: 20px; font-weight: 900; letter-spacing: -0.5px; display: flex; align-items: center; gap: 12px; }
    .doc-header-logo::before {
      content: '';
      width: 42px; height: 42px; flex-shrink: 0;
      background: #fff url('https://res.cloudinary.com/nvp7nxqp/image/upload/v1788473005/bet/branding/bet-logo.png') center / 30px 30px no-repeat;
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    }
    /* margin-left = largeur du badge + son écart : les coordonnées s'alignent sous le nom,
       pas sous le logo. Sans ça, l'en-tête part en escalier. */
    .doc-header-sub  { font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 2px; margin-left: 54px; }
    .doc-header-right { text-align: right; font-size: 11px; color: rgba(255,255,255,0.65); line-height: 1.6; }
    .doc-title-band { background: #0891B2; color: #fff; padding: 14px 32px; font-size: 16px; font-weight: 800; letter-spacing: 0.02em; margin-bottom: 0; }

    .doc-body { position: relative; padding: 28px 32px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 8px 8px; }

    .section-title { font-size: 12px; font-weight: 800; color: #0891B2; text-transform: uppercase; letter-spacing: 0.08em; margin: 24px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #E2E8F0; }
    .section-title:first-child { margin-top: 0; }

    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 8px; }
    .info-row  { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
    .info-label { color: #64748B; }
    .info-value { font-weight: 700; color: #0F172A; }

    .kpi-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin: 14px 0; }
    .kpi-card { background: #F8FAFC; border-radius: 8px; padding: 14px 12px; text-align: center; border-top: 3px solid #0891B2; }
    .kpi-val  { font-size: 22px; font-weight: 900; color: #0F172A; }
    .kpi-lbl  { font-size: 10px; color: #64748B; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.05em; }

    table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 10px 0; }
    thead th { background: #0F172A; color: #fff; padding: 9px 12px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
    tbody tr:nth-child(even) { background: #F8FAFC; }
    tbody td { padding: 9px 12px; border-bottom: 1px solid #F1F5F9; color: #0F172A; }
    .td-right { text-align: right; font-weight: 700; }
    tfoot td { background: #0F172A; color: #fff; padding: 10px 12px; font-weight: 800; }

    .badge { display:inline-block; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:700; }
    .badge-green  { background:#D1FAE5; color:#065F46; }
    .badge-orange { background:#FEF3C7; color:#92400E; }
    .badge-red    { background:#FEE2E2; color:#991B1B; }
    .badge-blue   { background:#DBEAFE; color:#1D4ED8; }

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
