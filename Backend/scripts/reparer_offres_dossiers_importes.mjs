/**
 * Reprise ponctuelle — remet le bon libellé d'offre sur les dossiers créés par un import.
 *
 * Contexte : le moteur écrivait des libellés inventés quand la ligne n'en portait pas —
 * "Formation" pour un apprenant, "Coaching Privé" pour un privé. Aucun des deux n'existe
 * au catalogue (plateforme_config), et `inscription_offre` est justement la clé qui relie
 * un dossier à son offre dans « Offres & Formations ». Résultat : 68 inscriptions rangées
 * en « offres inconnues », leur chiffre d'affaires exclu des statistiques, et les 20 privés
 * comptés dans l'en-tête mais absents de leur propre ligne (casse différente).
 *
 * Le code est corrigé (imports.js : l'offre vient de la classe, sinon null) ; ce script
 * rattrape les dossiers déjà en base.
 *
 * Source de vérité : la filière de la CLASSE de l'apprenant, reliée au dossier par
 * groupes_apprenants.note->>assignation_id. À défaut de classe, le libellé du catalogue
 * qui correspond à la casse près — un dossier sans aucune des deux est laissé tel quel
 * et signalé, jamais deviné.
 *
 * Usage :
 *   node scripts/reparer_offres_dossiers_importes.mjs             # simulation
 *   node scripts/reparer_offres_dossiers_importes.mjs --appliquer # écrit
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const APPLIQUER = process.argv.includes("--appliquer");
const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
);

const normLabel = (s) => (s || "").trim().toLowerCase();
const fmt = (n) => Number(n || 0).toLocaleString("fr-FR");

// ── Catalogue : même construction que GET /api/admin/catalogue-offres ──
const cles = ["offres_en_ligne", "offres_domicile", "centres_master"];
const configs = Object.fromEntries(await Promise.all(cles.map(async (k) => {
  const { data } = await sb.from("plateforme_config").select("valeur").eq("key", k).maybeSingle();
  return [k, Array.isArray(data?.valeur) ? data.valeur : []];
})));
const libellesCatalogue = [
  ...configs.offres_en_ligne.map((o) => o.label),
  ...configs.offres_domicile.map((o) => o.label),
  ...configs.centres_master.flatMap((c) => (c.offres || []).map((o) => o.label)),
].filter(Boolean);
const catalogueParNorm = new Map(libellesCatalogue.map((l) => [normLabel(l), l]));
console.log(`catalogue : ${catalogueParNorm.size} offres distinctes`);

// ── Dossiers issus d'un import ──
const { data: dossiers, error } = await sb
  .from("assignations_parcours")
  .select("id, prospect_nom, inscription_offre, montant_paye")
  .not("import_id", "is", null);
if (error) { console.error("Lecture impossible :", error.message); process.exit(1); }

// ── Dossier → classe → filière ──
const { data: liens } = await sb.from("groupes_apprenants").select("groupe_id, note").not("note", "is", null);
const groupeParDossier = {};
for (const l of liens || []) {
  try {
    const n = typeof l.note === "string" ? JSON.parse(l.note) : l.note;
    if (n?.assignation_id) groupeParDossier[n.assignation_id] = l.groupe_id;
  } catch { /* note non JSON : sans intérêt ici */ }
}
const { data: groupes } = await sb.from("groupes").select("id, nom, filiere");
const filiereParGroupe = Object.fromEntries((groupes || []).map((g) => [g.id, g.filiere]));

const aCorriger = [];
const ignores = { deja_bon: 0, sans_source: [] };

for (const d of dossiers) {
  const actuel = d.inscription_offre || null;
  if (actuel && catalogueParNorm.get(normLabel(actuel)) === actuel) { ignores.deja_bon++; continue; }

  // 1. La filière de sa classe, si elle est bien une offre du catalogue.
  const filiere = filiereParGroupe[groupeParDossier[d.id]] || null;
  let cible = filiere ? catalogueParNorm.get(normLabel(filiere)) || null : null;
  // 2. Sinon, le libellé du catalogue qui ne diffère que par la casse.
  if (!cible && actuel) cible = catalogueParNorm.get(normLabel(actuel)) || null;

  if (!cible) { ignores.sans_source.push({ ...d, filiere }); continue; }
  if (cible === actuel) { ignores.deja_bon++; continue; }
  aCorriger.push({ dossier: d, actuel, cible });
}

const parTransition = {};
for (const x of aCorriger) {
  const k = `«${x.actuel ?? "(vide)"}»  →  «${x.cible}»`;
  parTransition[k] = parTransition[k] || { n: 0, ca: 0 };
  parTransition[k].n++;
  parTransition[k].ca += Number(x.dossier.montant_paye || 0);
}

console.log(`\n${APPLIQUER ? "APPLICATION" : "SIMULATION (aucune écriture)"}\n`);
console.log(`dossiers issus d'un import : ${dossiers.length}`);
console.log(`  déjà corrects            : ${ignores.deja_bon}`);
console.log(`  à corriger               : ${aCorriger.length}`);
console.log(`  sans source fiable       : ${ignores.sans_source.length}\n`);
for (const [k, v] of Object.entries(parTransition).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${String(v.n).padStart(4)} · ${String(fmt(v.ca)).padStart(11)} F   ${k}`);
}
if (ignores.sans_source.length) {
  console.log("\nlaissés tels quels (ni classe ni correspondance catalogue) :");
  for (const d of ignores.sans_source.slice(0, 15)) {
    console.log(`  ${d.prospect_nom} — offre «${d.inscription_offre}» · filière classe «${d.filiere ?? "aucune"}»`);
  }
  if (ignores.sans_source.length > 15) console.log(`  … et ${ignores.sans_source.length - 15} autres`);
}

if (!APPLIQUER) { console.log("\nRelancer avec --appliquer pour écrire."); process.exit(0); }

let ok = 0;
const echecs = [];
for (const x of aCorriger) {
  const { error: e } = await sb
    .from("assignations_parcours")
    .update({ inscription_offre: x.cible })
    .eq("id", x.dossier.id);
  if (e) echecs.push(`${x.dossier.id} : ${e.message}`); else ok++;
}
console.log(`\n${ok} dossier(s) corrigé(s).`);
if (echecs.length) { console.log(`${echecs.length} échec(s) :`); echecs.slice(0, 10).forEach((m) => console.log("  " + m)); }
process.exit(echecs.length ? 1 : 0);
