/**
 * Tests du service de pause/reprise de facturation.
 *
 * Chaque bloc correspond à un défaut trouvé en audit et corrigé : ils existent pour que
 * la correction ne se défasse pas, pas pour décrire le comportement en général.
 *
 *   node --test tests/planPaiement.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  suspendrePlan, reprendrePlan, suspensionOuverte,
  dateEcheanceMois, estNeutralise, totalPayeMois,
} from "../src/services/planPaiement.js";

const plan = (periodes, { mensualite = 100000, fin = null } = {}) => ({
  actif: true, mensualite, jour_echeance: 5, date_fin_formation: fin,
  mois_paiements: periodes.map((p) => ({
    id: `m_${p}`, periode: p, label: p, montant: mensualite, statut: "en_attente", tranches: [],
  })),
});
const duTotal = (p) => (p.mois_paiements || [])
  .reduce((s, m) => s + Math.max(0, (m.montant || 0) - totalPayeMois(m)), 0);

test("le mois de reprise porte l'échéance réelle, pas le jour du contrat", () => {
  // Sans echeance_override, l'échéance retombait au 5 — déjà passée — et le cron
  // générait un mois de plus dès le lendemain de la réouverture.
  const s = suspendrePlan(plan(["2026-06", "2026-07"]), { premierMoisNonFacture: "2026-08" });
  const r = reprendrePlan(s.plan, { moisReprise: "2026-09", dateReprise: "2026-09-12" });

  const dernier = r.plan.mois_paiements.at(-1);
  assert.equal(dernier.periode, "2026-09");
  assert.equal(dernier.echeance_override, "2026-09-12");

  const echeance = dateEcheanceMois(dernier.periode, r.plan.jour_echeance, dernier.echeance_override);
  const today = new Date("2026-09-12"); today.setHours(0, 0, 0, 0);
  assert.ok(echeance >= today, "le cron doit s'arrêter, donc l'échéance ne doit pas être passée");
});

test("deux pauses créées dans la même milliseconde ont des identifiants distincts", () => {
  const a = suspendrePlan(plan(["2026-06"]), { premierMoisNonFacture: "2026-06", motif: "x" });
  const b = suspendrePlan(a.plan, { premierMoisNonFacture: "2026-06", motif: "y" });
  const [id1, id2] = b.plan.suspensions.map((s) => s.id);
  assert.notEqual(id1, id2, "des identifiants égaux font refermer les deux pauses d'un coup");
});

test("la reprise referme TOUTES les pauses ouvertes", async () => {
  const s1 = suspendrePlan(plan(["2026-06", "2026-07", "2026-08", "2026-09"]),
    { premierMoisNonFacture: "2026-08", motif: "pause_apprenant" });
  await new Promise((r) => setTimeout(r, 2));
  const s2 = suspendrePlan(s1.plan, { premierMoisNonFacture: "2026-08", motif: "cloture_classe" });
  assert.equal(s2.plan.suspensions.filter((x) => !x.fin).length, 2);

  const r = reprendrePlan(s2.plan, { moisReprise: "2026-09" });
  assert.equal(r.plan.suspensions.filter((x) => !x.fin).length, 0,
    "une pause laissée ouverte affiche « Cours suspendus » sur un dossier actif");
  assert.equal(suspensionOuverte(r.plan), null);
  assert.equal(r.plan.actif, true);
});

test("reprendre sans pause en cours ne fabrique aucune dette", () => {
  const p0 = plan(["2026-06", "2026-07"]);
  const avant = duTotal(p0);
  const r = reprendrePlan(p0, { moisReprise: "2026-09" });
  assert.equal(duTotal(r.plan), avant, "un clic sur « Rouvrir » ne doit pas créer de mensualité");
  assert.equal(r.plan.mois_paiements.length, 2);
  assert.equal(r.plan.actif, true);
  assert.equal(r.prolongation, 0);
});

test("la clôture ne gèle que les mois postérieurs à la fin de la classe", () => {
  // Classe terminée en juillet, clôturée en septembre : juillet a été dispensé et
  // reste dû ; août ne l'a pas été et se gèle.
  const s = suspendrePlan(plan(["2026-06", "2026-07", "2026-08"]), { premierMoisNonFacture: "2026-08" });
  assert.deepEqual(s.moisNeutralises, ["2026-08"]);
  assert.equal(s.montantGele, 100000);
  assert.equal(s.plan.actif, false);
  assert.equal(duTotal(s.plan), 200000, "juin et juillet restent dus");
});

test("un mois déjà payé n'est jamais gelé, et le déjà-versé est conservé", () => {
  const p0 = plan(["2026-08"]);
  p0.mois_paiements[0].tranches = [{ id: "t", montant: 40000, statut: "paye" }];
  const s = suspendrePlan(p0, { premierMoisNonFacture: "2026-08" });
  const m = s.plan.mois_paiements[0];
  assert.equal(m.montant, 40000, "le montant tombe au déjà-versé, pas à zéro");
  assert.equal(m.montant_initial, 100000);
  assert.equal(totalPayeMois(m), 40000);
  assert.equal(duTotal(s.plan), 0);
});

test("plan borné : la prolongation restitue exactement les mois perdus", () => {
  const s = suspendrePlan(plan(["2026-06", "2026-07", "2026-08"], { fin: "2026-08-31" }),
    { premierMoisNonFacture: "2026-07" });
  assert.equal(s.moisNeutralises.length, 2);

  const r = reprendrePlan(s.plan, { moisReprise: "2027-01" });
  assert.equal(r.prolongation, 2);
  assert.equal(r.plan.date_fin_formation, "2027-02-28", "la fin s'ancre sur la reprise, pas sur l'ancien terme");

  const facturables = r.plan.mois_paiements.filter((m) => !estNeutralise(m));
  assert.equal(facturables.length, 3, "3 mois achetés, 3 mois facturables");
  assert.equal(duTotal(r.plan), 300000);
});

test("deux pauses cumulées prolongent de la somme de leurs mois, sans doublon", async () => {
  const s1 = suspendrePlan(plan(["2026-06", "2026-07", "2026-08"], { fin: "2026-08-31" }),
    { premierMoisNonFacture: "2026-07" });          // gèle 07 et 08
  await new Promise((r) => setTimeout(r, 2));
  const s2 = suspendrePlan(s1.plan, { premierMoisNonFacture: "2026-07" }); // rien à geler en plus
  assert.equal(s2.moisNeutralises.length, 0, "un mois déjà gelé ne se regèle pas");

  const r = reprendrePlan(s2.plan, { moisReprise: "2026-09" });
  assert.equal(r.prolongation, 2, "2 mois perdus au total, pas 4");
});

test("les mois du creux restent visibles et non dus après la reprise", () => {
  const s = suspendrePlan(plan(["2026-06", "2026-07"]), { premierMoisNonFacture: "2026-08" });
  const r = reprendrePlan(s.plan, { moisReprise: "2026-12", dateReprise: "2026-12-03" });

  const geles = r.plan.mois_paiements.filter(estNeutralise).map((m) => m.periode);
  assert.deepEqual(geles, ["2026-08", "2026-09", "2026-10", "2026-11"]);
  assert.equal(r.plan.mois_paiements.some((m) => m.periode === "2026-12"), true);
  assert.equal(duTotal(r.plan), 300000, "juin + juillet dus, décembre dû, le creux non dû");
});

test("le report d'échéance vaut aussi pour un mois de reprise déjà présent", () => {
  // Le cron avait pu générer le mois courant avant la pause : son échéance est alors
  // passée, et ne poser l'override qu'à la création laissait le cron générer le suivant.
  const s = suspendrePlan(plan(["2026-08", "2026-09"]), { premierMoisNonFacture: "2026-10" });
  const r = reprendrePlan(s.plan, { moisReprise: "2026-09", dateReprise: "2026-09-25" });

  const moisReprise = r.plan.mois_paiements.find((m) => m.periode === "2026-09");
  assert.equal(moisReprise.echeance_override, "2026-09-25");

  const echeance = dateEcheanceMois("2026-09", r.plan.jour_echeance, moisReprise.echeance_override);
  const jour = new Date("2026-09-25"); jour.setHours(0, 0, 0, 0);
  assert.ok(echeance >= jour, "le cron doit s'arrêter sur ce mois");
});

test("une échéance à venir n'est pas écrasée par la date de reprise", () => {
  const s = suspendrePlan(plan(["2026-08", "2026-09"]), { premierMoisNonFacture: "2026-10" });
  const r = reprendrePlan(s.plan, { moisReprise: "2026-09", dateReprise: "2026-09-01" });
  const m = r.plan.mois_paiements.find((x) => x.periode === "2026-09");
  assert.equal(m.echeance_override, undefined, "échéance au 5, reprise le 1er : rien à reporter");
});
