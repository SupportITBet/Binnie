/**
 * Reprise ponctuelle — réattribue les versements créés par un import en masse à la
 * commerciale du dossier, et non à qui a lancé l'import.
 *
 * Contexte : `insererPaiements` écrivait `commercial_id: ctx.acteur_id`. Une commerciale
 * présentiel important pour elle-même était bien créditée, mais l'Onboarding importe POUR
 * plusieurs assistantes en ligne : leurs versements atterrissaient tous sur le compte de
 * l'Onboarding. L'onglet Paiements filtrant sur `commercial_id = req.user.id`, ces
 * commerciales voyaient un onglet vide malgré des millions encaissés.
 *
 * Le code est corrigé (imports.js) ; ce script rattrape les lignes déjà en base.
 *
 * Sûr par construction :
 *   - ne touche QUE les lignes portant un `import_id` — rien de saisi manuellement ;
 *   - n'écrit que si le dossier désigne une assistante ayant un compte utilisateur ;
 *   - ne réécrit pas les lignes déjà correctes.
 *
 * Usage :
 *   node scripts/reattribuer_paiements_imports.mjs            # simulation, aucune écriture
 *   node scripts/reattribuer_paiements_imports.mjs --appliquer # écrit
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const APPLIQUER = process.argv.includes("--appliquer");
const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
);

const parPaquets = async (ids, taille, fn) => {
  const out = [];
  for (let i = 0; i < ids.length; i += taille) out.push(...((await fn(ids.slice(i, i + taille))) || []));
  return out;
};

const fmt = (n) => Number(n || 0).toLocaleString("fr-FR");

const { data: paiements, error } = await sb
  .from("paiements_parcours")
  .select("id, client, montant_recu, commercial_id, assignation_id")
  .not("import_id", "is", null);
if (error) { console.error("Lecture impossible :", error.message); process.exit(1); }

// Dossier → assistante, puis assistante → compte utilisateur (jointure par email : les
// deux tables n'ont aucune colonne de liaison directe).
const idsDossiers = [...new Set(paiements.map((p) => p.assignation_id).filter(Boolean))];
const dossiers = await parPaquets(idsDossiers, 200, (lot) =>
  sb.from("assignations_parcours").select("id, assistante_id").in("id", lot).then((r) => r.data));
const assistanteParDossier = Object.fromEntries(dossiers.map((d) => [d.id, d.assistante_id]));

const idsAssistantes = [...new Set(Object.values(assistanteParDossier).filter(Boolean))];
const assistantes = await parPaquets(idsAssistantes, 200, (lot) =>
  sb.from("assistantes").select("id, nom, prenom, email").in("id", lot).then((r) => r.data));
const assistanteParId = Object.fromEntries(assistantes.map((a) => [a.id, a]));

const emails = assistantes.map((a) => a.email).filter(Boolean);
const utilisateurs = await parPaquets(emails, 100, (lot) =>
  sb.from("utilisateurs").select("id, nom, prenom, email").in("email", lot).then((r) => r.data));
const utilisateurParEmail = Object.fromEntries(utilisateurs.map((u) => [u.email.toLowerCase(), u]));

const aCorriger = [];
const ignores = { deja_correct: 0, sans_dossier: 0, sans_assistante: 0, sans_compte: 0 };

for (const p of paiements) {
  const assistanteId = assistanteParDossier[p.assignation_id];
  if (!p.assignation_id || assistanteId === undefined) { ignores.sans_dossier++; continue; }
  if (!assistanteId) { ignores.sans_assistante++; continue; }
  const ass = assistanteParId[assistanteId];
  const u = ass?.email ? utilisateurParEmail[ass.email.toLowerCase()] : null;
  if (!u) { ignores.sans_compte++; continue; }
  if (u.id === p.commercial_id) { ignores.deja_correct++; continue; }
  aCorriger.push({ paiement: p, cible: u, assistante: ass });
}

const total = aCorriger.reduce((s, x) => s + Number(x.paiement.montant_recu || 0), 0);
const parCible = {};
for (const x of aCorriger) {
  const k = `${x.cible.prenom || ""} ${x.cible.nom || ""}`.trim();
  parCible[k] = parCible[k] || { n: 0, montant: 0 };
  parCible[k].n++;
  parCible[k].montant += Number(x.paiement.montant_recu || 0);
}

console.log(`\n${APPLIQUER ? "APPLICATION" : "SIMULATION (aucune écriture)"}\n`);
console.log(`versements issus d'un import : ${paiements.length}`);
console.log(`  déjà corrects              : ${ignores.deja_correct}`);
console.log(`  à réattribuer              : ${aCorriger.length}  (${fmt(total)} F)`);
console.log(`  ignorés — sans dossier     : ${ignores.sans_dossier}`);
console.log(`  ignorés — sans assistante  : ${ignores.sans_assistante}`);
console.log(`  ignorés — sans compte      : ${ignores.sans_compte}\n`);
for (const [k, v] of Object.entries(parCible).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${String(v.n).padStart(4)} versements · ${String(fmt(v.montant)).padStart(12)} F  →  ${k}`);
}

if (!APPLIQUER) {
  console.log("\nRelancer avec --appliquer pour écrire.");
  process.exit(0);
}

let ok = 0;
const echecs = [];
for (const x of aCorriger) {
  const { error: e } = await sb
    .from("paiements_parcours")
    .update({ commercial_id: x.cible.id })
    .eq("id", x.paiement.id);
  if (e) echecs.push(`${x.paiement.id} : ${e.message}`); else ok++;
}
console.log(`\n${ok} versement(s) réattribué(s).`);
if (echecs.length) { console.log(`${echecs.length} échec(s) :`); echecs.slice(0, 10).forEach((m) => console.log("  " + m)); }
process.exit(echecs.length ? 1 : 0);
