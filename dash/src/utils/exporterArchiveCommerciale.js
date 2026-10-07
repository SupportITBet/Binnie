/**
 * L'archive des apprenants d'une commerciale, au format Excel.
 *
 * POURQUOI PAS CELUI DU COACH. `exporterArchiveApprenants` reproduit la feuille ON BREAK que
 * les coachs tiennent à la main : en-têtes en anglais, colonnes « Occupation » et
 * « Recommendations », une ligne par passage en classe. Rien de tout cela ne correspond au
 * travail d'une commerciale, qui suit un DOSSIER - une vente, un client, un encaissement - et
 * non un passage en classe.
 *
 * DEUX FEUILLES, parce qu'une seule ne peut pas dire les deux choses :
 *   · « Apprenants » répond à « combien j'en ai eu, et qui est parti » - une ligne par dossier.
 *   · « Parcours » répond à « qu'est-il arrivé à celui-ci » - une ligne par événement, dans
 *     l'ordre. C'est elle qui porte les transferts, les migrations de canal, les pauses et les
 *     changements de tarif. Les écraser dans des colonnes de la première feuille aurait obligé
 *     à n'en garder qu'un par apprenant, et donc à en perdre.
 */

const VERT  = "FF16A34A", VERT_CLAIR  = "FFDCFCE7";
const ROUGE = "FFDC2626", ROUGE_CLAIR = "FFFEE2E2";
const AMBRE = "FF9A3412", AMBRE_CLAIR = "FFFFEDD5";
const BLEU  = "FF1D4ED8", BLEU_CLAIR  = "FFDBEAFE";
const GRIS_TXT = "FF64748B", GRIS_CLAIR = "FFF1F5F9";
const ARDOISE = "FF0F172A", BORD = "FFCBD5E1";

const dateFr = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "");
const dateHeureFr = (d) =>
  d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

export const LIBELLES_STATUT = {
  en_formation: "En formation",
  revenu:       "Revenu après une pause",
  a_arrete:     "A arrêté",
  jamais_place: "Jamais placé en classe",
};

const COULEURS_STATUT = {
  en_formation: [VERT, VERT_CLAIR],
  revenu:       [AMBRE, AMBRE_CLAIR],
  a_arrete:     [ROUGE, ROUGE_CLAIR],
  jamais_place: [GRIS_TXT, GRIS_CLAIR],
};

export const LIBELLES_EVENEMENT = {
  inscription:       "Inscription",
  arrivee_transfert: "Arrivée par transfert",
  transfert:         "Transfert de classe",
  migration_canal:   "Migration de canal",
  changement_centre: "Transfert de centre",
  pause:             "Pause",
  reprise:           "Reprise",
  arret:             "Arrêt de formation",
  changement_tarif:  "Changement de tarif",
  demande_en_cours:  "Demande en attente",
};

export const libelleCanal = (c) =>
  c === "en_ligne" ? "En ligne" : c === "presentiel" ? "Présentiel"
  : c === "hybride" || c === "les_deux" ? "Hybride" : (c || "—");

/** « 12 jours » quand la durée tient dans le mois, sinon la forme longue du service. */
export const dureeLisible = (a) => {
  if (a.duree_texte == null) return "";
  if (a.duree_mois === 0) {
    const j = a.duree_jours ?? 0;
    if (j < 1) return "moins d'un jour";
    return `${Math.round(j)} jour${Math.round(j) > 1 ? "s" : ""}`;
  }
  return a.duree_texte;
};

const entete = (ws, colonnes) => {
  ws.columns = colonnes;
  const l = ws.getRow(1);
  l.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  l.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARDOISE } };
  l.alignment = { vertical: "middle", horizontal: "left" };
  l.height = 24;
};

const bordure = { top: { style: "thin", color: { argb: BORD } }, left: { style: "thin", color: { argb: BORD } },
  bottom: { style: "thin", color: { argb: BORD } }, right: { style: "thin", color: { argb: BORD } } };

/**
 * @param {object}   p
 * @param {string}   p.commercialeNom
 * @param {object[]} p.apprenants  les lignes déjà filtrées par l'écran
 * @param {object}   p.totaux
 * @param {string?}  p.annee
 */
export async function exporterArchiveCommerciale({ commercialeNom, apprenants, totaux, annee }) {
  if (!apprenants?.length) throw new Error("Aucun apprenant à exporter.");

  const ExcelJS = (await import("exceljs")).default;
  const { saveAs } = await import("file-saver");

  const wb = new ExcelJS.Workbook();
  wb.creator = "BET Languages";
  wb.created = new Date();

  /* ── Feuille 1 : un apprenant par ligne ─────────────────────────────────────────────── */
  const ws = wb.addWorksheet("Apprenants", { views: [{ state: "frozen", ySplit: 1 }] });
  entete(ws, [
    { header: "Apprenant",        key: "nom",      width: 28 },
    { header: "Contact",          key: "contact",  width: 22 },
    { header: "Formule",          key: "canal",    width: 13 },
    { header: "Classe",           key: "classe",   width: 26 },
    { header: "Niveau",           key: "niveau",   width: 9 },
    { header: "Entré le",         key: "entree",   width: 12 },
    { header: "Parti le",         key: "sortie",   width: 12 },
    { header: "Durée suivie",     key: "duree",    width: 20 },
    { header: "Statut",           key: "statut",   width: 24 },
    { header: "Mouvements",       key: "mvts",     width: 30 },
    { header: "Motif de sortie",  key: "motif",    width: 34 },
    { header: "Encaissé (F)",     key: "encaisse", width: 14 },
    { header: "Mensualité (F)",   key: "mensu",    width: 14 },
  ]);

  for (const a of apprenants) {
    /* LES MOUVEMENTS EN CLAIR DANS LA PREMIÈRE FEUILLE. Un classeur se lit souvent sans
       ouvrir le second onglet : si cette colonne est vide, le lecteur conclut qu'il ne s'est
       rien passé. Elle dit le compte, la feuille « Parcours » dit le détail. */
    const mvts = [
      a.nb_transferts  ? `${a.nb_transferts} transfert${a.nb_transferts > 1 ? "s" : ""}` : null,
      a.nb_migrations  ? `${a.nb_migrations} migration${a.nb_migrations > 1 ? "s" : ""} de canal` : null,
      a.nb_changements_centre ? `${a.nb_changements_centre} transfert${a.nb_changements_centre > 1 ? "s" : ""} de centre` : null,
      a.nb_pauses      ? `${a.nb_pauses} pause${a.nb_pauses > 1 ? "s" : ""}` : null,
      a.nb_changements_tarif ? `${a.nb_changements_tarif} changement${a.nb_changements_tarif > 1 ? "s" : ""} de tarif` : null,
      a.demande_en_cours ? `⏳ demande en attente` : null,
    ].filter(Boolean).join(" · ");

    const ligne = ws.addRow({
      nom: a.nom,
      contact: a.telephone || a.email || "",
      canal: libelleCanal(a.canal),
      classe: a.classe_actuelle || a.derniere_classe || "",
      niveau: a.niveau || "",
      entree: dateFr(a.date_entree),
      sortie: dateFr(a.date_sortie),
      duree: dureeLisible(a),
      statut: LIBELLES_STATUT[a.statut] || a.statut,
      mvts,
      // Un départ SANS motif est dit comme tel : une case vide laisse croire à un oubli
      // d'affichage plutôt qu'à un oubli de saisie.
      motif: a.statut === "a_arrete"
        ? (a.motif_sortie ? [a.motif_sortie, a.detail_motif].filter(Boolean).join(" - ") : "motif non renseigné")
        : "",
      encaisse: a.montant_encaisse || 0,
      mensu: a.mensualite || "",
    });

    const [txt, fond] = COULEURS_STATUT[a.statut] || [ARDOISE, "FFFFFFFF"];
    ligne.getCell("statut").font = { bold: true, color: { argb: txt }, size: 10 };
    ligne.getCell("statut").fill = { type: "pattern", pattern: "solid", fgColor: { argb: fond } };
    ligne.getCell("encaisse").numFmt = "#,##0";
    ligne.getCell("mensu").numFmt = "#,##0";
    ligne.eachCell((c) => { c.border = bordure; c.alignment = { vertical: "top", wrapText: true }; });
  }

  /* ── Feuille 2 : un événement par ligne ─────────────────────────────────────────────── */
  const wp = wb.addWorksheet("Parcours", { views: [{ state: "frozen", ySplit: 1 }] });
  entete(wp, [
    { header: "Apprenant",   key: "nom",     width: 28 },
    { header: "Date",        key: "date",    width: 18 },
    { header: "Événement",   key: "type",    width: 24 },
    { header: "Classe",      key: "classe",  width: 26 },
    { header: "Formule",     key: "canal",   width: 12 },
    { header: "Vers",        key: "vers",    width: 30 },
    { header: "Motif",       key: "motif",   width: 34 },
    { header: "Détail",      key: "detail",  width: 44 },
    { header: "Test requis", key: "test",    width: 12 },
    { header: "Par",         key: "par",     width: 30 },
  ]);

  for (const a of apprenants) {
    for (const e of (a.evenements || [])) {
      const vers = e.type === "changement_tarif"
        ? `${Number(e.de || 0).toLocaleString("fr-FR")} F → ${Number(e.vers || 0).toLocaleString("fr-FR")} F`
        /* Le trajet entre CENTRES prime sur celui entre classes : c'est lui qui résume le
           geste. Sans cette branche, la colonne nommait deux classes sans jamais dire que
           l'apprenant avait changé de ville. */
        : (e.depuis_centre || e.vers_centre)
          ? `${e.depuis_centre || "?"} → ${e.vers_centre || "?"}${e.vers_classe ? ` · ${e.vers_classe}` : ""}`
        : [e.vers_classe, e.vers_canal ? `(${libelleCanal(e.vers_canal)})` : null,
           e.depuis_classe ? `depuis « ${e.depuis_classe} »` : null].filter(Boolean).join(" ");

      const ligne = wp.addRow({
        nom: a.nom,
        date: dateHeureFr(e.date),
        type: LIBELLES_EVENEMENT[e.type] || e.type,
        classe: e.classe || "",
        canal: e.canal ? libelleCanal(e.canal) : "",
        vers,
        motif: e.motif || "",
        detail: [e.detail,
          e.niveau_avant && e.niveau_apres && e.niveau_avant !== e.niveau_apres
            ? `niveau ${e.niveau_avant} → ${e.niveau_apres}` : null,
          e.statut_demande ? `statut : ${e.statut_demande}` : null,
        ].filter(Boolean).join(" · "),
        // Vide, et non « non », quand la question ne se pose pas : seuls un transfert et une
        // migration ont un rapport au test de niveau.
        test: e.test_de_niveau == null ? "" : (e.test_de_niveau ? "oui" : "non"),
        par: [e.par_nom, e.par_role ? `(${e.par_role})` : null].filter(Boolean).join(" "),
      });

      const couleur = e.type === "migration_canal" ? [BLEU, BLEU_CLAIR]
        : e.type === "changement_centre" ? ["FF0369A1", "FFE0F2FE"]
      : e.type === "transfert" ? [BLEU, "FFFFFFFF"]
        : e.type === "arret" ? [ROUGE, ROUGE_CLAIR]
        : e.type === "pause" ? [AMBRE, AMBRE_CLAIR]
        : e.type === "demande_en_cours" ? [AMBRE, AMBRE_CLAIR]
        : [ARDOISE, "FFFFFFFF"];
      ligne.getCell("type").font = { bold: true, color: { argb: couleur[0] }, size: 10 };
      ligne.getCell("type").fill = { type: "pattern", pattern: "solid", fgColor: { argb: couleur[1] } };
      ligne.eachCell((c) => { c.border = bordure; c.alignment = { vertical: "top", wrapText: true }; });
    }
  }

  /* ── Feuille 3 : la synthèse, pour ne pas la recalculer à la main ───────────────────── */
  const wt = wb.addWorksheet("Synthèse");
  wt.columns = [{ key: "l", width: 38 }, { key: "v", width: 18 }];
  const titre = wt.addRow({ l: `Archive de ${commercialeNom || "la commerciale"}`, v: annee ? `Année ${annee}` : "Toutes années" });
  titre.font = { bold: true, size: 13, color: { argb: ARDOISE } };
  wt.addRow({});
  const lignes = [
    ["Apprenants au total", totaux?.total],
    ["Encore en formation", totaux?.en_formation],
    ["Revenus après une pause", totaux?.revenus],
    ["Ont arrêté", totaux?.partis],
    ["Jamais placés en classe", totaux?.jamais_places],
    ["Transferts de classe", totaux?.transferts],
    ["Migrations de canal", totaux?.migrations],
    ["Taux de rétention", totaux?.taux_retention == null ? "—" : `${totaux.taux_retention} %`],
    ["Durée moyenne (mois)", totaux?.duree_moyenne_mois ?? "—"],
    ["Total encaissé (F)", totaux?.ca_encaisse],
    ["Reste dû (F)", totaux?.reste_du],
  ];
  for (const [l, v] of lignes) {
    const r = wt.addRow({ l, v: v ?? 0 });
    r.getCell("l").font = { size: 11, color: { argb: GRIS_TXT } };
    r.getCell("v").font = { bold: true, size: 11, color: { argb: ARDOISE } };
    if (typeof v === "number") r.getCell("v").numFmt = "#,##0";
  }
  /* La note du bas n'est pas décorative : sans elle, un lecteur additionne « ont arrêté » et
     « transferts » pour en faire des départs, ce qui est faux. */
  wt.addRow({});
  const note = wt.addRow({ l: "Un transfert ou une migration n'est PAS un départ : l'apprenant suit toujours ses cours." });
  note.font = { italic: true, size: 10, color: { argb: GRIS_TXT } };

  const buf = await wb.xlsx.writeBuffer();
  const nom = `archive-apprenants-${(commercialeNom || "commerciale").replace(/\s+/g, "-").toLowerCase()}${annee ? `-${annee}` : ""}.xlsx`;
  saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nom);
}
