/**
 * Recalcule `note_globale` et `synthese` de tous les rapports d'observation sur le
 * barème officiel BET.
 *
 * POURQUOI. La note moyennait neuf éléments à poids égal - les cinq critères pédagogiques
 * plus Ponctualité, Professionnalisme, Interactivité et Grammaire - alors que la feuille
 * d'appraisal ne compte que les cinq, pondérés sur 70. Les deux écrans se contredisaient :
 * un rapport noté 2.6 totalisait 30/70, un autre noté 2.3 en totalisait 32. Le barème
 * officiel fait foi ; les rapports déjà enregistrés doivent suivre, sans quoi les moyennes
 * de coach mélangeraient deux échelles et une « progression » pourrait n'être que le
 * changement de formule.
 *
 * SÉCURITÉ. Sans argument, le script n'écrit RIEN : il affiche l'état avant/après, y
 * compris la liste des coachs dont la catégorie de contrat change - c'est la seule
 * conséquence visible pour eux, et elle ne doit surprendre personne. L'écriture n'a lieu
 * qu'avec `--appliquer`.
 *
 *   node src/routes/scripts/recalculerNotesObservation.mjs              → simulation
 *   node src/routes/scripts/recalculerNotesObservation.mjs --appliquer  → écriture
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { noteObservation, syntheseObservation, totalObservation } from "../../services/noteObservation.js";

const APPLIQUER = process.argv.includes("--appliquer");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Le barème de catégorie, miroir de `dash/src/utils/categorieCoach.js`. */
const CATEGORIES = [
  { seuil: 4, libelle: "Corporate" },
  { seuil: 3, libelle: "BET Group" },
  { seuil: 2.5, libelle: "Needs Improvement" },
  { seuil: 0, libelle: "Needs Retraining" },
];
const categorie = (note) =>
  note === null ? "Non évalué" : (CATEGORIES.find(c => note >= c.seuil) || CATEGORIES[3]).libelle;

const moyenne = (notes) =>
  notes.length ? Math.round((notes.reduce((s, n) => s + n, 0) / notes.length) * 10) / 10 : null;

const nombre = (n, l = 6) => String(n ?? "-").padStart(l);

async function principal() {
  const { data: rapports, error } = await supabase
    .from("rapports_observation")
    .select("id, coach_id, date_observation, note_globale, synthese, plateforme, " +
            "preparation, pedagogie, expression_engagement, gestion_classe, feedback_correction, " +
            "ponctualite, professionnalisme, respect_programme")
    .order("date_observation", { ascending: false });
  if (error) throw error;

  console.log(`\n${rapports.length} rapport(s) d'observation lus.\n`);

  const changements = [];
  const parCoach = {};

  for (const r of rapports) {
    const nouvelle = noteObservation(r);
    const ancienne = r.note_globale === null ? null : parseFloat(r.note_globale);
    const { points, bareme } = totalObservation(r);

    (parCoach[r.coach_id] ||= { avant: [], apres: [] });
    if (ancienne !== null && ancienne > 0) parCoach[r.coach_id].avant.push(ancienne);
    if (nouvelle !== null) parCoach[r.coach_id].apres.push(parseFloat(nouvelle));

    // La comparaison se fait sur le TEXTE : `2.60` et `2.6` sont la même note, et les
    // réécrire toutes gonflerait le rapport de changements qui n'en sont pas.
    const identique = String(ancienne === null ? "" : ancienne.toFixed(1)) === String(nouvelle ?? "");
    if (!identique) {
      changements.push({
        id: r.id, coach_id: r.coach_id, date: r.date_observation,
        ancienne, nouvelle: nouvelle === null ? null : parseFloat(nouvelle),
        total: `${points}/${bareme}`,
        synthese_avant: r.synthese, synthese_apres: syntheseObservation(nouvelle),
      });
    }
  }

  /* ── Ce qui change, rapport par rapport ─────────────────────── */
  console.log(`${changements.length} rapport(s) changeraient de note.\n`);
  if (changements.length) {
    const ecarts = changements
      .filter(c => c.ancienne !== null && c.nouvelle !== null)
      .map(c => c.nouvelle - c.ancienne);
    const moyEcart = ecarts.length ? (ecarts.reduce((s, e) => s + e, 0) / ecarts.length) : 0;
    console.log(`  écart moyen : ${moyEcart >= 0 ? "+" : ""}${moyEcart.toFixed(2)} point`);
    console.log(`  en hausse   : ${ecarts.filter(e => e > 0).length}   en baisse : ${ecarts.filter(e => e < 0).length}\n`);

    console.log("  Les 15 plus gros écarts :");
    changements
      .filter(c => c.ancienne !== null && c.nouvelle !== null)
      .sort((a, b) => Math.abs(b.nouvelle - b.ancienne) - Math.abs(a.nouvelle - a.ancienne))
      .slice(0, 15)
      .forEach(c => {
        const d = c.nouvelle - c.ancienne;
        console.log(`   ${String(c.date || "").slice(0, 10)}  ${nombre(c.ancienne.toFixed(1))} → ${nombre(c.nouvelle.toFixed(1))}  (${d >= 0 ? "+" : ""}${d.toFixed(1)})  total ${c.total}`);
      });
    console.log("");
  }

  /* ── Les coachs qui changent de catégorie ───────────────────── */
  const ids = Object.keys(parCoach).filter(Boolean);
  const { data: coachs } = ids.length
    ? await supabase.from("utilisateurs").select("id, prenom, nom").in("id", ids)
    : { data: [] };
  const nomDe = Object.fromEntries((coachs || []).map(c => [c.id, `${c.prenom || ""} ${c.nom || ""}`.trim()]));

  const bascules = [];
  for (const [id, n] of Object.entries(parCoach)) {
    const av = moyenne(n.avant), ap = moyenne(n.apres);
    const ca = categorie(av), cb = categorie(ap);
    if (ca !== cb) bascules.push({ nom: nomDe[id] || id, av, ap, ca, cb });
  }

  console.log(`${bascules.length} coach(s) changeraient de catégorie de contrat :`);
  if (!bascules.length) console.log("  aucun.\n");
  bascules.forEach(b => {
    console.log(`  ${(b.nom || "?").padEnd(26)} ${nombre(b.av)} → ${nombre(b.ap)}   ${b.ca}  →  ${b.cb}`);
  });
  console.log("");

  /* ── Écriture ───────────────────────────────────────────────── */
  if (!APPLIQUER) {
    console.log("SIMULATION - rien n'a été écrit. Relancez avec --appliquer pour appliquer.\n");
    return;
  }
  if (!changements.length) {
    console.log("Rien à écrire.\n");
    return;
  }

  // Un par un et non en lot : `upsert` réécrirait les colonnes absentes de la charge
  // utile, et un rapport porte bien plus que sa note.
  let ok = 0, ko = 0;
  for (const c of changements) {
    const { error: e } = await supabase
      .from("rapports_observation")
      .update({ note_globale: c.nouvelle, synthese: c.synthese_apres })
      .eq("id", c.id);
    if (e) { ko++; console.error(`  échec ${c.id} : ${e.message}`); } else ok++;
  }
  console.log(`\n${ok} rapport(s) mis à jour${ko ? `, ${ko} en échec` : ""}.\n`);
}

principal().catch(e => { console.error("\nÉCHEC :", e.message || e, "\n"); process.exit(1); });
