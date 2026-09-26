import * as XLSX from "xlsx";

/**
 * Exports des récoltes par QR et des campagnes qui en découlent.
 *
 * Un seul module pour les deux formats : Excel et PDF montrent EXACTEMENT les mêmes
 * chiffres, et deux implémentations auraient fini par diverger - c'est toujours le
 * rapport qu'on n'a pas sous les yeux qui se met à mentir.
 *
 * Les deux exportent la SÉLECTION AFFICHÉE, filtres compris, jamais toute la base :
 * c'est le sens des filtres posés juste au-dessus des boutons.
 */

const BLEU = [8, 145, 178];        // le cyan des campagnes e-mail
const ARDOISE = [15, 23, 42];

const dateFr = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "-");
const dateHeureFr = (d) =>
  d ? `${new Date(d).toLocaleDateString("fr-FR")} ${new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "-";

const horodatage = () =>
  new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "h");

/** Un nom de fichier utilisable sur tous les systèmes, sans accent ni séparateur. */
const nomFichier = (titre, ext) =>
  `${String(titre || "campagnes").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase()
    .slice(0, 40)}_${horodatage()}.${ext}`;

/** Les lignes de synthèse, communes aux deux formats. */
function synthese({ titre, filtresLisibles, exportData, stats, performance }) {
  const t = stats?.totaux || {};
  const visites = (performance || []).reduce((s, p) => s + (p.nb_visites || 0), 0);
  const reponses = exportData?.total || 0;
  return [
    ["Récolte", titre || "Toutes les récoltes"],
    ["Sélection exportée", filtresLisibles || "Aucun filtre"],
    ["Généré le", dateHeureFr(new Date())],
    [],
    ["Visites des canaux", visites],
    ["Réponses collectées", reponses],
    // Un taux sans visites n'est pas 0 %, c'est « on ne sait pas ».
    ["Taux de conversion", visites ? `${Math.round((reponses / visites) * 100)} %` : "-"],
    ["Réponses converties en dossier", (exportData?.lignes || []).filter(l => l.convertie === "Oui").length],
    ["Réponses avec consentement", (exportData?.lignes || []).filter(l => l.consentement === "Oui").length],
    [],
    ["Campagnes de relance", t.campagnes ?? 0],
    ["Destinataires visés", t.destinataires ?? 0],
    ["Messages partis", t.envoyes ?? 0],
    ["Échecs d'envoi", t.echecs ?? 0],
    ["Écartés faute de consentement", t.sans_consentement ?? 0],
    ["Taux de réussite des envois", t.taux_reussite == null ? "-" : `${t.taux_reussite} %`],
  ];
}

/* ═══════════════════════════════════════════════════════════════
   EXCEL
═══════════════════════════════════════════════════════════════ */

/**
 * Quatre feuilles plutôt qu'un seul tableau à rallonge : la synthèse se lit d'un coup
 * d'œil, les réponses se filtrent, les campagnes se comparent. Tout empiler forcerait
 * le lecteur à faire ce tri à la main, à chaque ouverture.
 */
export function exporterCampagnesExcel({ titre, filtresLisibles, exportData, stats, performance }) {
  const classeur = XLSX.utils.book_new();

  const fSynthese = XLSX.utils.aoa_to_sheet(synthese({ titre, filtresLisibles, exportData, stats, performance }));
  fSynthese["!cols"] = [{ wch: 34 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(classeur, fSynthese, "Synthèse");

  /* ── Réponses : une colonne par question, dans l'ordre du formulaire ── */
  const questions = exportData?.colonnes || [];
  const enTetes = [
    "Reçue le", "Récolte", "Nom", "E-mail", "Téléphone",
    "Canal", "Code canal", "Support", "Statut", "Consentement", "Convertie", "Note interne",
    ...questions,
  ];
  const lignes = (exportData?.lignes || []).map(l => [
    dateHeureFr(l.recue_le), l.formulaire, l.nom, l.email, l.telephone,
    l.canal, l.code_canal, l.support, l.statut, l.consentement, l.convertie, l.note_interne,
    ...questions.map(q => l.reponses?.[q] ?? ""),
  ]);
  const fRep = XLSX.utils.aoa_to_sheet([enTetes, ...lignes]);
  fRep["!cols"] = enTetes.map((h, i) => ({ wch: i < 2 ? 18 : Math.min(38, Math.max(12, h.length + 4)) }));
  fRep["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lignes.length, c: enTetes.length - 1 } }) };
  XLSX.utils.book_append_sheet(classeur, fRep, "Réponses");

  /* ── Campagnes : e-mail et WhatsApp dans le même tableau, colonne « Canal » ── */
  const campEnTetes = ["Date", "Canal", "Campagne", "Objet", "Récolte(s)", "Statut",
    "Destinataires", "Partis", "Échecs", "Lus", "Sans consentement", "Motif d'échec"];
  const campLignes = (stats?.toutes || []).map(c => [
    dateHeureFr(c.date),
    c.canal === "email" ? "E-mail" : "WhatsApp",
    c.nom || "-", c.sujet || "-",
    (c.recoltes || []).join(" · ") || "-",
    c.statut,
    c.destinataires, c.envoyes, c.echecs,
    c.canal === "whatsapp" ? (c.lus ?? 0) : "-",
    c.sans_consentement,
    (c.erreurs || []).join(" | ") || "-",
  ]);
  const fCamp = XLSX.utils.aoa_to_sheet([campEnTetes, ...campLignes]);
  fCamp["!cols"] = [{ wch: 17 }, { wch: 10 }, { wch: 30 }, { wch: 30 }, { wch: 26 }, { wch: 12 },
    { wch: 13 }, { wch: 9 }, { wch: 9 }, { wch: 8 }, { wch: 18 }, { wch: 46 }];
  XLSX.utils.book_append_sheet(classeur, fCamp, "Campagnes");

  /* ── Canaux : quelle affiche a réellement amené des inscriptions ── */
  if ((performance || []).length) {
    const perfEnTetes = ["Canal", "Code", "Support", "Format", "Visites", "Réponses", "Converties", "Taux"];
    const perfLignes = performance.map(p => {
      const v = p.nb_visites || 0, r = p.nb_reponses || 0;
      return [p.libelle, p.code, p.support, p.format, v, r, p.nb_converties || 0,
        v ? `${Math.round((r / v) * 100)} %` : "-"];
    });
    const fPerf = XLSX.utils.aoa_to_sheet([perfEnTetes, ...perfLignes]);
    fPerf["!cols"] = [{ wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 9 }];
    XLSX.utils.book_append_sheet(classeur, fPerf, "Canaux");
  }

  XLSX.writeFile(classeur, nomFichier(titre, "xlsx"));
}

/* ═══════════════════════════════════════════════════════════════
   PDF
═══════════════════════════════════════════════════════════════ */

/**
 * `jspdf` pèse plusieurs centaines de kilo-octets : il est chargé À LA DEMANDE, au clic,
 * et non au chargement de l'écran - la très grande majorité des consultations n'exporte
 * rien, et n'a pas à payer ce poids.
 */
export async function exporterCampagnesPdf({ titre, filtresLisibles, exportData, stats, performance }) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  // Paysage : le tableau des réponses a douze colonnes avant même les questions,
  // et un portrait les écraserait jusqu'à l'illisible.
  const doc = new jsPDF({ orientation: "landscape" });
  const largeur = doc.internal.pageSize.getWidth();

  doc.setFontSize(16); doc.setTextColor(...ARDOISE);
  doc.text("Campagnes de collecte - BET", 14, 15);
  doc.setFontSize(11); doc.setTextColor(...BLEU);
  doc.text(titre || "Toutes les récoltes", 14, 22);
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text(`${filtresLisibles || "Aucun filtre"}  ·  Généré le ${dateHeureFr(new Date())}`, 14, 28);

  autoTable(doc, {
    startY: 34,
    head: [["Synthèse", ""]],
    body: synthese({ titre, filtresLisibles, exportData, stats, performance })
      .filter(l => l.length === 2)
      .map(([a, b]) => [a, String(b)]),
    theme: "striped", headStyles: { fillColor: BLEU }, styles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 70, fontStyle: "bold" } },
    tableWidth: 150,
  });

  if ((performance || []).length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["Canal", "Code", "Support", "Visites", "Réponses", "Converties", "Taux"]],
      body: performance.map(p => {
        const v = p.nb_visites || 0, r = p.nb_reponses || 0;
        return [p.libelle, p.code, p.support, v, r, p.nb_converties || 0, v ? `${Math.round((r / v) * 100)} %` : "-"];
      }),
      theme: "striped", headStyles: { fillColor: BLEU }, styles: { fontSize: 8.5 },
    });
  }

  if ((stats?.toutes || []).length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["Date", "Canal", "Campagne", "Récolte(s)", "Statut", "Visés", "Partis", "Échecs", "Sans consent."]],
      body: stats.toutes.map(c => [
        dateFr(c.date),
        c.canal === "email" ? "E-mail" : "WhatsApp",
        (c.nom || "-").slice(0, 45),
        ((c.recoltes || []).join(" · ") || "-").slice(0, 40),
        c.statut, c.destinataires, c.envoyes, c.echecs, c.sans_consentement,
      ]),
      theme: "striped", headStyles: { fillColor: BLEU }, styles: { fontSize: 8.5 },
    });
  }

  /* Les réponses commencent sur une NOUVELLE page : c'est la pièce jointe du rapport,
     pas sa conclusion. Seules les colonnes d'identité y figurent - les réponses aux
     questions vivent dans l'Excel, qui se filtre et ne tronque rien. */
  const lignes = exportData?.lignes || [];
  if (lignes.length) {
    doc.addPage();
    doc.setFontSize(12); doc.setTextColor(...ARDOISE);
    doc.text(`Réponses collectées (${lignes.length})`, 14, 15);
    autoTable(doc, {
      startY: 21,
      head: [["Reçue le", "Nom", "E-mail", "Téléphone", "Canal", "Statut", "Consent.", "Convertie"]],
      body: lignes.map(l => [
        dateHeureFr(l.recue_le), l.nom || "-", l.email || "-", l.telephone || "-",
        l.canal, l.statut, l.consentement, l.convertie,
      ]),
      theme: "striped", headStyles: { fillColor: BLEU }, styles: { fontSize: 8 },
    });
    if (exportData?.tronque) {
      doc.setFontSize(8.5); doc.setTextColor(180, 83, 9);
      doc.text("Export limité aux 5 000 réponses les plus récentes.", 14, doc.lastAutoTable.finalY + 6);
    }
  }

  // Le numéro de page sur chaque feuille : un rapport imprimé se désassemble.
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text(`BET - ${i} / ${pages}`, largeur - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
  }

  doc.save(nomFichier(titre, "pdf"));
}
