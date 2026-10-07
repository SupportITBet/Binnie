/**
 * Tests du service d'archive des apprenants.
 *
 * Chaque bloc correspond à un défaut trouvé sur les données réelles et corrigé : ils existent
 * pour que la correction ne se défasse pas, pas pour décrire le comportement en général.
 *
 *   node --test tests/archiveApprenants.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  periodesDe, fusionnerPeriodes, pausesDe, joursSuivis,
  construireParcours, synthetiserDossier, totauxArchive, libelleMotif,
} from "../src/services/archiveApprenants.js";

/* Les vraies lignes du dossier 098ebfa8 (Doumbia Siaka Koudou), réduites aux champs lus.
   Noter `fin: null` sur la seconde période de l'inscription QUITTÉE : le transfert pose
   `date_retrait` mais ne ferme pas la période, et il recopie le tableau entier dans la
   nouvelle inscription. Les deux défauts sont dans ces données. */
const INS_QUITTEE = {
  id: "ga_a2", groupe_id: "g_a2", statut: "transfere",
  date_ajout: "2026-09-22T18:44:41.205Z", date_retrait: "2026-09-28T18:09:35.053Z",
  note: JSON.stringify({
    assignation_id: "dos1",
    periodes: [
      { debut: "2026-09-22T18:44:41.205Z", fin: "2026-09-23T16:01:48.906Z", motif: "arret", par: "MOUSSA" },
      { debut: "2026-09-23T16:02:40.310Z", fin: null },
    ],
    depart: { type: "transfert", motif: "Changement de classe", vers: "A1 Morning",
      niveau_avant: "A2", niveau_apres: "A1", date: "2026-09-28T18:09:35.053Z", par: "u_gr" },
  }),
};
const INS_ACTUELLE = {
  id: "ga_a1", groupe_id: "g_a1", statut: "actif",
  date_ajout: "2026-09-28T18:09:35.990Z", date_retrait: null,
  note: JSON.stringify({
    assignation_id: "dos1",
    periodes: [
      { debut: "2026-09-22T18:44:41.205Z", fin: "2026-09-23T16:01:48.906Z", motif: "arret", par: "MOUSSA" },
      { debut: "2026-09-23T16:02:40.310Z", fin: null },
    ],
    dernier_transfert: { motif: "Changement de classe", ancien_groupe: "Anglais A2",
      date: "2026-09-28T18:09:35.362Z" },
  }),
};
const GROUPES = {
  g_a2: { id: "g_a2", nom: "Anglais A2", niveau: "A2", type_cours: "presentiel" },
  g_a1: { id: "g_a1", nom: "A1 Morning", niveau: "A1", type_cours: "presentiel" },
  g_el: { id: "g_el", nom: "Anglais B2 En Ligne", niveau: "B2", type_cours: "en_ligne" },
};
const DOSSIER = { id: "dos1", prospect_nom: "Doumbia Siaka Koudou", type_cours: "presentiel" };

/* ── Le bornage ───────────────────────────────────────────────────────────────────────── */

test("une période laissée ouverte se ferme à la date de retrait", () => {
  // Sans bornage, elle courait jusqu'à aujourd'hui : la durée passée dans une classe
  // quittée grossissait d'un jour par jour écoulé depuis.
  const p = periodesDe(INS_QUITTEE);
  assert.equal(p.length, 2);
  assert.equal(p[1].fin, "2026-09-28T18:09:35.053Z", "fermée au retrait, pas ouverte");
});

test("les périodes recopiées par le transfert sont écartées de la nouvelle inscription", () => {
  // La période du 22 au 23/09 est antérieure à l'arrivée du 28/09 : elle n'appartient pas
  // à cette inscription. La garder comptait deux fois le même temps.
  const p = periodesDe(INS_ACTUELLE);
  assert.equal(p.length, 1, "une seule période appartient réellement à cette inscription");
  assert.equal(p[0].debut, "2026-09-28T18:09:35.990Z", "ramenée à la date d'arrivée");
  assert.equal(p[0].fin, null, "toujours en cours");
});

test("une inscription sans périodes garde exactement l'ancien calcul", () => {
  const sansPeriodes = { date_ajout: "2026-01-10T00:00:00.000Z", date_retrait: "2026-03-10T00:00:00.000Z", note: "{}" };
  const p = periodesDe(sansPeriodes);
  assert.deepEqual(p, [{ debut: "2026-01-10T00:00:00.000Z", fin: "2026-03-10T00:00:00.000Z" }]);
});

test("une note en texte libre ne fait pas échouer la lecture", () => {
  const p = periodesDe({ date_ajout: "2026-01-10T00:00:00.000Z", date_retrait: null, note: "rappeler le client" });
  assert.equal(p.length, 1);
  assert.equal(p[0].fin, null);
});

/* ── La fusion ────────────────────────────────────────────────────────────────────────── */

test("le temps de formation n'est pas compté deux fois après un transfert", () => {
  /* Le défaut mesuré : 24 jours annoncés pour un apprenant arrivé 12 jours plus tôt. On
     reproduit ici la lecture d'AVANT - les périodes prises telles quelles dans `note`, sans
     bornage - pour vérifier que le défaut existait bien et qu'il a disparu. */
  const brutes = [INS_QUITTEE, INS_ACTUELLE].flatMap(i => JSON.parse(i.note).periodes);
  const avant = joursSuivis(brutes);
  const apres = joursSuivis(fusionnerPeriodes([INS_QUITTEE, INS_ACTUELLE].flatMap(periodesDe)));

  assert.ok(avant > apres * 1.8, `l'ancienne lecture doublait bien (${avant.toFixed(1)} j contre ${apres.toFixed(1)})`);
  // Du 22/09 18:44 à maintenant, moins les 51 secondes de pause du 23/09.
  const attendu = (Date.now() - new Date("2026-09-22T18:44:41.205Z").getTime()) / 86400000 - 0.0006;
  assert.ok(Math.abs(apres - attendu) < 0.01, `durée fusionnée ${apres} ≈ ${attendu}`);
});

test("une période encore ouverte absorbe tout ce qui suit", () => {
  const f = fusionnerPeriodes([
    { debut: "2026-01-01T00:00:00.000Z", fin: null },
    { debut: "2026-02-01T00:00:00.000Z", fin: "2026-03-01T00:00:00.000Z" },
  ]);
  assert.equal(f.length, 1, "rien ne commence après une présence sans fin");
  assert.equal(f[0].fin, null);
});

/* ── Les pauses ───────────────────────────────────────────────────────────────────────── */

test("le micro-trou d'un transfert n'est pas une pause", () => {
  /* Mesuré en base : retrait à 18:09:35.053, arrivée à 18:09:35.990 - 0,94 seconde. Ce trou
     faisait passer en « revenu » trois apprenants qui n'avaient rien interrompu. Le
     discriminant est la clé `motif`, que seule la route d'arrêt écrit. */
  const presence = fusionnerPeriodes([INS_QUITTEE, INS_ACTUELLE].flatMap(periodesDe));
  const pauses = pausesDe(presence);
  assert.equal(pauses.length, 1, "une seule pause : celle du 23/09, enregistrée à la main");
  assert.equal(pauses[0].du, "2026-09-23T16:01:48.906Z");
  assert.equal(pauses[0].motif, "arret");
});

test("une pause sans motif saisi est quand même détectée", () => {
  // La route d'arrêt écrit `motif: motif || null` : la clé existe même sans raison donnée.
  // Un seuil de durée, lui, aurait écarté cette pause-ci.
  const pauses = pausesDe([
    { debut: "2026-01-01T00:00:00.000Z", fin: "2026-01-02T00:00:00.000Z", motif: null },
    { debut: "2026-01-02T00:00:10.000Z", fin: null },
  ]);
  assert.equal(pauses.length, 1, "la clé présente suffit, la valeur n'a pas à l'être");
  assert.equal(pauses[0].motif, null);
});

test("une période fermée en dernier est un départ, pas une pause", () => {
  const pauses = pausesDe([
    { debut: "2026-01-01T00:00:00.000Z", fin: "2026-02-01T00:00:00.000Z", motif: "financier" },
  ]);
  assert.equal(pauses.length, 0);
});

/* ── Le parcours ──────────────────────────────────────────────────────────────────────── */

const parcoursKoudou = () => construireParcours({
  dossier: DOSSIER,
  inscriptions: [INS_QUITTEE, INS_ACTUELLE],
  groupes: GROUPES,
  personnes: { u_gr: { nom: "GRACE MOUSSA", role: "commercial" } },
  demandes: [{
    id: "d1", ga_id: "ga_a2", groupe_id: "g_a2", groupe_cible_id: "g_a1",
    type_demande: "changement_groupe", motif: "horaire", statut: "traitee",
    traite_le: "2026-09-28T18:09:35.000Z", traite_par: "u_gr",
  }],
});

test("le motif de la demande l'emporte sur le libellé du geste", () => {
  // `note.depart.motif` dit « Changement de classe » - le nom du geste. La demande dit
  // « horaire » - la vraie raison, saisie par l'assistante. C'est elle qu'on affiche.
  const t = parcoursKoudou().find(e => e.type === "transfert");
  assert.equal(t.motif, "Horaires incompatibles");
  assert.ok(t.detail.includes("Changement de classe"), "le libellé du geste reste en détail");
  assert.ok(t.detail.includes("A2 → A1"), "le changement de niveau est dit");
});

test("un changement de classe exige un test de niveau, une migration de canal non", () => {
  assert.equal(parcoursKoudou().find(e => e.type === "transfert").test_de_niveau, true);

  const migration = construireParcours({
    dossier: DOSSIER,
    inscriptions: [{ ...INS_QUITTEE, note: JSON.stringify({
      assignation_id: "dos1",
      depart: { type: "transfert", motif: "Changement de classe", vers: "Anglais B2 En Ligne" },
    }) }],
    groupes: GROUPES,
    demandes: [{
      id: "d2", ga_id: "ga_a2", groupe_id: "g_a2", groupe_cible_id: "g_el",
      type_demande: "changement_coaching", motif: "demenagement", statut: "traitee",
      traite_le: "2026-09-28T18:09:35.000Z",
    }],
  });
  const m = migration.find(e => e.type === "migration_canal");
  assert.ok(m, "une migration de canal porte son propre type d'événement");
  assert.equal(m.test_de_niveau, false, "une migration ne passe jamais par un test");
  assert.equal(m.motif, "Déménagement");
  assert.equal(m.canal, "presentiel");
  assert.equal(m.vers_canal, "en_ligne", "le canal d'arrivée se lit sur la classe cible");
});

test("un transfert de centre se lit comme tel, pas comme un changement de classe", () => {
  /* Sans son propre type, un apprenant passé d'Angré à Yopougon s'affichait « transfert de
     classe » : l'archive perdait ce qui s'était réellement produit, et son motif -
     « rapprochement du domicile » - sortait en code brut, cherché dans la mauvaise liste. */
  const evts = construireParcours({
    dossier: DOSSIER,
    inscriptions: [{ ...INS_QUITTEE, note: JSON.stringify({
      assignation_id: "dos1",
      depart: { type: "transfert", motif: "Changement de classe", vers: "A1 Yopougon" },
    }) }],
    groupes: { ...GROUPES, g_yop: { id: "g_yop", nom: "A1 Yopougon", type_cours: "presentiel", centre_id: "yopougon" } },
    demandes: [{
      id: "d9", ga_id: "ga_a2", groupe_id: "g_a2", groupe_cible_id: "g_yop",
      type_demande: "changement_centre", motif: "rapprochement", statut: "traitee",
      centre_source_id: "angre", centre_cible_id: "yopougon",
      traite_le: "2026-10-05T10:00:00.000Z",
    }],
  });
  const e = evts.find(x => x.type === "changement_centre");
  assert.ok(e, "l'événement porte son propre type");
  assert.equal(e.motif, "Rapprochement du domicile ou du lieu de travail");
  assert.equal(e.depuis_centre, "angre");
  assert.equal(e.vers_centre, "yopougon", "le centre de la classe choisie fait foi");
  assert.equal(e.test_de_niveau, false, "changer de centre ne change pas le niveau");
});

test("un transfert de centre ne compte pas comme un départ", () => {
  const s = synthetiserDossier({
    dossier: DOSSIER, inscriptions: [INS_QUITTEE, INS_ACTUELLE], groupes: GROUPES,
    evenements: [{ type: "changement_centre", date: "2026-10-05T10:00:00.000Z" }],
  });
  assert.equal(s.nb_changements_centre, 1);
  assert.equal(s.parti, false, "il suit toujours ses cours, ailleurs");
  assert.equal(totauxArchive([s]).taux_retention, 100);
});

test("les pauses ne sont émises qu'une fois, pas une par classe", () => {
  // Le transfert recopiant `periodes`, une émission par inscription affichait la même pause
  // deux fois - une fois sous chaque classe.
  const evts = parcoursKoudou();
  assert.equal(evts.filter(e => e.type === "pause").length, 1);
  assert.equal(evts.filter(e => e.type === "reprise").length, 1);
});

test("une entrée par transfert ne se confond pas avec une inscription initiale", () => {
  const evts = parcoursKoudou();
  assert.equal(evts.filter(e => e.type === "inscription").length, 1, "une seule vraie inscription");
  assert.equal(evts.filter(e => e.type === "arrivee_transfert").length, 1);
});

test("une demande encore ouverte figure au parcours", () => {
  // Elle n'est pas un non-événement : c'est ce que la commerciale doit voir avant d'appeler.
  const evts = construireParcours({
    dossier: DOSSIER, inscriptions: [INS_ACTUELLE], groupes: GROUPES,
    demandes: [{ id: "d3", ga_id: "ga_a1", groupe_id: "g_a1", type_demande: "changement_coaching",
      motif: "demenagement", statut: "en_attente_accord", created_at: "2026-10-03T23:13:03.000Z" }],
  });
  const d = evts.find(e => e.type === "demande_en_cours");
  assert.equal(d.nature, "migration_canal");
  assert.equal(d.statut_demande, "en_attente_accord");
});

test("une demande refusée n'encombre pas le parcours", () => {
  const evts = construireParcours({
    dossier: DOSSIER, inscriptions: [INS_ACTUELLE], groupes: GROUPES,
    demandes: [{ id: "d4", ga_id: "ga_a1", type_demande: "changement_groupe", statut: "refusee",
      created_at: "2026-10-01T00:00:00.000Z" }],
  });
  assert.equal(evts.filter(e => e.type === "demande_en_cours").length, 0);
});

test("un changement de tarif est tracé, avec son montant et sa cause", () => {
  const evts = construireParcours({
    dossier: { ...DOSSIER, plan_paiement: { mensualite: 10, changements_tarif: [
      { de: 5, vers: 10, le: "2026-10-04T12:56:05.705Z", motif: "migration_canal", par: "u_gr", demande_id: "d2" },
    ] } },
    inscriptions: [INS_ACTUELLE], groupes: GROUPES,
    personnes: { u_gr: { nom: "GRACE MOUSSA", role: "commercial" } },
  });
  const t = evts.find(e => e.type === "changement_tarif");
  assert.equal(t.de, 5);
  assert.equal(t.vers, 10);
  assert.equal(t.par_nom, "GRACE MOUSSA");
});

test("un événement sans date n'est pas effacé du parcours", () => {
  // Une date manquante est une saisie incomplète, pas une raison de taire le fait.
  const evts = construireParcours({
    dossier: DOSSIER, groupes: GROUPES,
    inscriptions: [{ id: "x", groupe_id: "g_a1", statut: "actif", date_ajout: null, note: "{}" }],
  });
  assert.equal(evts.length, 1);
  assert.equal(evts[0].date, null);
});

/* ── La synthèse ──────────────────────────────────────────────────────────────────────── */

const synthese = (inscriptions, dossier = DOSSIER, paiements = []) => {
  const evenements = construireParcours({ dossier, inscriptions, groupes: GROUPES });
  return synthetiserDossier({ dossier, inscriptions, groupes: GROUPES, evenements, paiements });
};

test("un apprenant transféré reste UN apprenant, pas deux", () => {
  // La différence de fond avec l'archive du coach : chez lui une inscription vaut une classe
  // enseignée ; chez la commerciale, deux inscriptions valent un apprenant vendu une fois.
  const s = synthese([INS_QUITTEE, INS_ACTUELLE]);
  assert.equal(s.nb_classes, 2, "deux classes traversées");
  assert.equal(s.nb_transferts, 1);
  assert.equal(s.statut, "revenu", "il est là, mais il s'est absenté une fois");
  assert.equal(s.parti, false, "transféré n'est pas parti");
});

test("un transféré ne fait pas baisser la rétention", () => {
  const t = totauxArchive([synthese([INS_QUITTEE, INS_ACTUELLE])]);
  assert.equal(t.partis, 0);
  assert.equal(t.taux_retention, 100, "BET ne l'a pas perdu");
});

test("un dossier sans aucune classe est « jamais placé », pas « parti »", () => {
  // Quatre cas réels en base : vendus, convertis, mais l'onboarding ne les a pas placés.
  const s = synthese([], { ...DOSSIER, converti_at: "2026-09-01T00:00:00.000Z" });
  assert.equal(s.statut, "jamais_place");
  assert.equal(s.parti, false);
  assert.equal(s.date_entree, "2026-09-01T00:00:00.000Z", "l'entrée chez BET existe sans classe");
  assert.equal(s.duree_texte, null, "aucune durée à inventer");
});

test("les jamais placés sortent du dénominateur de la rétention", () => {
  // Les y laisser faisait baisser le taux d'une commerciale pour des dossiers que
  // l'onboarding n'avait pas traités.
  const parti = synthese([{
    id: "g1", groupe_id: "g_a1", statut: "retire",
    date_ajout: "2026-01-01T00:00:00.000Z", date_retrait: "2026-02-01T00:00:00.000Z",
    note: JSON.stringify({ assignation_id: "dos1", arret_formation: { motif: "financier" } }),
  }]);
  const place = synthese([INS_ACTUELLE]);
  const jamais = synthese([], { ...DOSSIER, converti_at: "2026-09-01T00:00:00.000Z" });

  assert.equal(totauxArchive([parti, place]).taux_retention, 50);
  assert.equal(totauxArchive([parti, place, jamais]).taux_retention, 50, "le jamais placé ne dilue pas");
});

test("un arrêt porte son motif jusqu'à la ligne de synthèse", () => {
  const s = synthese([{
    id: "g1", groupe_id: "g_a1", statut: "retire",
    date_ajout: "2026-01-01T00:00:00.000Z", date_retrait: "2026-02-01T00:00:00.000Z",
    note: JSON.stringify({ assignation_id: "dos1",
      arret_formation: { motif: "financier", detail: "perte d'emploi" } }),
  }]);
  assert.equal(s.statut, "a_arrete");
  assert.equal(s.parti, true);
  assert.equal(s.motif_sortie, "Raisons financières");
  assert.equal(s.date_sortie, "2026-02-01T00:00:00.000Z");
});

test("le total encaissé vient des paiements, le reste dû n'est jamais négatif", () => {
  const s = synthese([INS_ACTUELLE], DOSSIER, [
    { montant_du: 50000, montant_recu: 50000 },
    { montant_du: 50000, montant_recu: 60000 },   // trop-perçu
  ]);
  assert.equal(s.montant_encaisse, 110000);
  assert.equal(totauxArchive([s]).reste_du, 0, "un trop-perçu ne devient pas une dette négative");
});

test("sans apprenant, le taux de rétention est inconnu et non pas zéro", () => {
  assert.equal(totauxArchive([]).taux_retention, null);
});

/* ── Les libellés ─────────────────────────────────────────────────────────────────────── */

test("un motif non reconnu est rendu tel quel, jamais escamoté", () => {
  // Les motifs sont écrits par trois écrans : certains sont des codes, d'autres déjà des
  // phrases. Avaler ceux qu'on ne connaît pas effacerait la raison du départ.
  assert.equal(libelleMotif("niveau_trop_eleve"), "Niveau de la classe trop élevé");
  assert.equal(libelleMotif("demenagement"), "Déménagement");
  assert.equal(libelleMotif("Fin de contrat"), "Fin de contrat");
  assert.equal(libelleMotif(null), null);
});
