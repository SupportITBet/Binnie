/**
 * Export Excel des rapports d'observation, au format de la feuille terrain BET
 * - « 2026 Coaches Weekly Performance Appraisal Sheet ».
 *
 * Volontairement TRANSPOSÉ par rapport à un export tabulaire ordinaire : un bloc par coach,
 * les critères en lignes, les observations successives en colonnes. C'est la mise en page que
 * les superviseurs et la direction lisent depuis des mois ; leur rendre un tableau plat leur
 * demanderait de réapprendre à lire leur propre document.
 *
 * Deux conversions sont faites ici, et nulle part ailleurs :
 *
 * 1. Les notes de l'application sont sur 5 pour tous les critères ; la feuille les porte sur
 *    5, 20, 20, 15 et 10. On remet chaque note à l'échelle de la feuille pour que les colonnes
 *    restent directement comparables avec l'historique déjà saisi à la main.
 *
 * 2. Les échelles fermées et la synthèse retrouvent leur libellé anglais d'origine
 *    (« Excellent », « Satisfactory/Acceptable », « Needs improvement ») et leur pastille de
 *    couleur. La couleur portait jusqu'ici l'information à elle seule ; ici elle la double,
 *    car la valeur est aussi écrite en toutes lettres.
 */

// Palette reprise de la feuille : vert foncé, vert, jaune, rouge.
const VERT_FONCE = 'FF2E7D51';
const VERT       = 'FF34C759';
const JAUNE      = 'FFF4F14A';
const ROUGE      = 'FFE8543A';
const GRIS       = 'FFE8E8E8';

const PASTILLE_INTERACTIVITE = {
  excellent:   { t: 'Excellent',   c: VERT },
  bon:         { t: 'Good',        c: VERT_FONCE },
  acceptable:  { t: 'Acceptable',  c: JAUNE },
  insuffisant: { t: 'Insufficient', c: ROUGE },
};

const PASTILLE_GRAMMAIRE = {
  inductive_claire:      { t: 'Induct & Great Exp',  c: VERT },
  inductive_perfectible: { t: 'Induct & Fair Exp',   c: VERT_FONCE },
  deductive_claire:      { t: 'Deduct & Clear',      c: JAUNE },
  confuse:               { t: 'Not Induc & Confu',   c: ROUGE },
};

const PASTILLE_SYNTHESE = {
  excellent:     { t: 'Excellent /Outstanding',   c: VERT },
  satisfaisant:  { t: 'Satisfactory/Acceptable',  c: JAUNE },
  a_accompagner: { t: 'Needs improvement',        c: ROUGE },
};

/** Les cinq critères chiffrés, avec le barème de la feuille. */
const CRITERES_CHIFFRES = [
  { cle: 'preparation',           libelle: 'Lesson preparation & Planning /5',  bareme: 5  },
  { cle: 'pedagogie',             libelle: 'Teaching Methodology /20',          bareme: 20 },
  { cle: 'expression_engagement', libelle: 'Speaking & Learner Engagement /20', bareme: 20 },
  { cle: 'gestion_classe',        libelle: 'Classroom Management /15',          bareme: 15 },
  { cle: 'feedback_correction',   libelle: 'Feedback & Error Correction /10',   bareme: 10 },
];

/** Une note sur 5 ramenée au barème de la feuille. `null` si le critère n'a pas été renseigné. */
function surBareme(note, bareme) {
  const n = Number(note);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round((n / 5) * bareme);
}

const MOIS_COURTS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

/**
 * L'en-tête d'une colonne d'observation, dans la forme employée par la feuille :
 * « Observateur / date ». Elle y était saisie à la main et en trois formats différents -
 * ici elle est construite, donc toujours la même.
 */
function enTeteObservation(rapport, rang) {
  const nom = [rapport.deputy?.prenom, rapport.deputy?.nom].filter(Boolean).join(' ').trim() || '-';
  const d = rapport.date_observation ? new Date(rapport.date_observation) : null;
  const date = d ? `${MOIS_COURTS[d.getMonth()]} ${d.getDate()}` : '';
  return `Obs ${rang}/${nom}${date ? ` / ${date}` : ''}`;
}

function poserPastille(cell, pastille) {
  cell.value = pastille ? pastille.t : '...';
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pastille ? pastille.c : GRIS } };
  cell.font = { size: 11, color: { argb: pastille && pastille.c === ROUGE ? 'FFFFFFFF' : 'FF0F172A' } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  cell.border = { bottom: { style: 'hair', color: { argb: 'FFD8DCE6' } } };
}

/**
 * @param {Array} rapports  rapports d'observation enrichis (avec `coach` et `deputy`)
 * @param {string} nomFichier
 * @param {number} [obsParCoach=5]  colonnes d'observation par bloc, comme la feuille
 */
export async function exporterAppraisalCoachs({ rapports = [], nomFichier = 'appraisal_coachs', obsParCoach = 5 }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BET';
  wb.created = new Date();

  // Un onglet par type d'observation, comme la feuille d'origine : observer un cours et
  // faire passer un mock teaching sont deux exercices différents, et les mélanger sur la
  // même grille rendait les colonnes incomparables.
  const parType = {
    'Weekly Performance': rapports.filter(r => !['mock_teaching', 'evaluation'].includes(r.type_observation)),
    'Evaluations': rapports.filter(r => r.type_observation === 'evaluation'),
    'Mock Teaching Performances': rapports.filter(r => r.type_observation === 'mock_teaching'),
  };

  for (const [nomOnglet, lot] of Object.entries(parType)) {
    if (!lot.length) continue;
    const ws = wb.addWorksheet(nomOnglet);

    ws.getColumn(1).width = 30;   // nom du coach
    ws.getColumn(2).width = 34;   // libellé du critère
    for (let c = 3; c < 3 + obsParCoach; c++) ws.getColumn(c).width = 26;

    // Bandeau d'en-tête, repris tel quel de la feuille.
    ws.getCell(1, 2).value = 'LESSON TYPES';
    ws.getCell(1, 2).font = { bold: true, size: 12 };
    ws.getCell(1, 2).alignment = { horizontal: 'center' };
    ws.getCell(1, 5).value = "Le type de leçon et le contexte figurent sous chaque observation";
    ws.getCell(1, 5).font = { size: 10, color: { argb: 'FF64748B' } };
    ws.getCell(2, 2).value = 'PERSONALITY';
    ws.getCell(2, 2).font = { bold: true, size: 12 };
    ws.getCell(2, 2).alignment = { horizontal: 'center' };
    ws.getCell(2, 3).value = 'OBS 1/Sup/Date';
    ws.getCell(2, 3).font = { size: 11 };

    // Un bloc par coach, les plus récemment observés d'abord.
    const parCoach = new Map();
    for (const r of lot) {
      const cid = r.coach_id || 'inconnu';
      if (!parCoach.has(cid)) parCoach.set(cid, []);
      parCoach.get(cid).push(r);
    }

    let ligne = 4;
    for (const [, rapportsCoach] of parCoach) {
      const tries = [...rapportsCoach].sort((a, b) =>
        String(a.date_observation || '').localeCompare(String(b.date_observation || '')));
      const colonnes = tries.slice(0, obsParCoach);
      const coach = colonnes[0]?.coach;
      const nomCoach = [coach?.prenom, coach?.nom].filter(Boolean).join(' ').trim() || '-';

      // Ligne des en-têtes d'observation
      const ligneEnTete = ligne;
      colonnes.forEach((r, i) => {
        const cell = ws.getCell(ligneEnTete, 3 + i);
        cell.value = enTeteObservation(r, i + 1);
        cell.font = { size: 11, color: { argb: 'FF0F172A' } };
      });
      ligne++;

      const premiereLigneBloc = ligne;

      // Quatre lignes d'appréciation, avec leurs pastilles colorées.
      const appreciations = [
        { libelle: 'Class Interactivity', valeur: r => PASTILLE_INTERACTIVITE[r.interactivite_classe] },
        { libelle: 'Grammar',             valeur: r => PASTILLE_GRAMMAIRE[r.approche_grammaticale] },
        { libelle: 'Satisfaction',        valeur: r => PASTILLE_SYNTHESE[r.synthese] },
        // « Network » n'est pas une note : le coach ne maîtrise pas sa connexion. La
        // cellule rend l'état constaté. Repli sur `incident_technique` pour les rapports
        // antérieurs à l'appréciation Internet, sans quoi ils s'afficheraient tous
        // « Stable » - y compris ceux où un incident avait bien été signalé.
        { libelle: 'Network',             valeur: r => (
            r.internet === 'instable'         ? { t: 'Unstable', c: ROUGE }
          : r.internet === 'stable'           ? { t: 'Stable',   c: VERT }
          : r.internet === 'autre'            ? { t: 'N/A',      c: GRIS }
          : r.incident_technique              ? { t: r.incident_technique_detail || 'Incident', c: ROUGE }
          :                                     null) },
      ];
      for (const a of appreciations) {
        ws.getCell(ligne, 2).value = a.libelle;
        ws.getCell(ligne, 2).font = { size: 11 };
        colonnes.forEach((r, i) => poserPastille(ws.getCell(ligne, 3 + i), a.valeur(r)));
        ligne++;
      }

      // Cinq critères chiffrés, remis au barème de la feuille.
      for (const c of CRITERES_CHIFFRES) {
        ws.getCell(ligne, 2).value = c.libelle;
        ws.getCell(ligne, 2).font = { size: 11 };
        colonnes.forEach((r, i) => {
          const cell = ws.getCell(ligne, 3 + i);
          const v = surBareme(r[c.cle], c.bareme);
          if (v !== null) cell.value = v;
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
        });
        ligne++;
      }

      // Total - absent de la feuille d'origine, et c'est justement ce qui empêchait d'y voir
      // une progression : deux observations pouvaient donner le même total sans que personne
      // ne le remarque.
      ws.getCell(ligne, 2).value = 'TOTAL /70';
      ws.getCell(ligne, 2).font = { bold: true, size: 11 };
      const totaux = colonnes.map(r => {
        // Le barème RÉELLEMENT applicable : un critère non noté est écarté avec son poids,
        // sinon un rapport partiel afficherait un score catastrophique qui punirait
        // l'observateur pressé plutôt que le coach.
        let points = 0, bareme = 0;
        for (const c of CRITERES_CHIFFRES) {
          const v = surBareme(r[c.cle], c.bareme);
          if (v === null) continue;
          points += v; bareme += c.bareme;
        }
        return { points, bareme };
      });
      totaux.forEach((t, i) => {
        const cell = ws.getCell(ligne, 3 + i);
        if (t.points > 0) cell.value = t.bareme === 70 ? t.points : `${t.points} / ${t.bareme}`;
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } };
      });
      ligne++;

      /* LA NOTE SUR 5, DÉRIVÉE DU TOTAL CI-DESSUS - et non relue depuis la base.
         Les deux chiffres vivaient séparément : la feuille montrait un total /70 sur cinq
         critères, le tableau de bord une moyenne sur neuf, et le classement s'inversait de
         l'un à l'autre. Calculée ici depuis le total, la note ne PEUT plus le contredire. */
      ws.getCell(ligne, 2).value = 'Note globale /5';
      ws.getCell(ligne, 2).font = { bold: true, size: 11 };
      totaux.forEach((t, i) => {
        const cell = ws.getCell(ligne, 3 + i);
        if (t.bareme > 0) cell.value = Number(((t.points / t.bareme) * 5).toFixed(1));
        cell.numFmt = '0.0';
        cell.font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      });
      ligne++;

      // Séance observée et durée réelle - ce que la feuille papier ne pouvait pas porter.
      ws.getCell(ligne, 2).value = 'Séance observée';
      ws.getCell(ligne, 2).font = { size: 10, italic: true, color: { argb: 'FF64748B' } };
      colonnes.forEach((r, i) => {
        const cell = ws.getCell(ligne, 3 + i);
        if (r.seance) {
          const reel = r.seance.duree_reelle_s != null ? Math.round(r.seance.duree_reelle_s / 60) : null;
          cell.value = `${r.seance.titre || 'Séance'}${reel != null ? ` - ${reel} min en salle` : ''}`;
        }
        cell.font = { size: 10, italic: true, color: { argb: 'FF64748B' } };
      });
      ligne++;

      // La personnalité du coach, en clair.
      //
      // La feuille la déclare en en-tête (« PERSONALITY ») et la porte dans la COULEUR de
      // fond de la cellule du nom : une information que tout export perd, et qu'on ne peut
      // pas lire sans connaître le code. Ici elle est écrite.
      const personnalite = coach?.coach_info?.personnalite || colonnes[0]?.coach?.coach_info?.personnalite;
      if (personnalite) {
        ws.getCell(ligne, 2).value = 'Personality';
        ws.getCell(ligne, 2).font = { size: 10, italic: true, color: { argb: 'FF64748B' } };
        const cell = ws.getCell(ligne, 3);
        cell.value = personnalite;
        cell.font = { size: 10, italic: true, color: { argb: 'FF6D28D9' } };
        ligne++;
      }

      // Nom du coach, fusionné sur la hauteur du bloc - comme dans la feuille.
      ws.mergeCells(premiereLigneBloc, 1, ligne - 1, 1);
      const cellNom = ws.getCell(premiereLigneBloc, 1);
      cellNom.value = nomCoach;
      cellNom.font = { size: 12, color: { argb: 'FF0F172A' } };
      cellNom.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cellNom.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3E8F7' } };

      ligne += 2;   // respiration entre deux coachs, comme dans la feuille
    }

    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];
  }

  if (!wb.worksheets.length) wb.addWorksheet('Aucun rapport');

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier.endsWith('.xlsx') ? nomFichier : `${nomFichier}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
