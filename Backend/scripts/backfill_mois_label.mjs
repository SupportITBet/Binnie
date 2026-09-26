/**
 * Renseigne `paiements_parcours.mois_label` sur l'historique.
 *
 * La colonne vient d'être créée : les 244 versements déjà en base sont vides. Le mois
 * soldé se retrouve par la référence de transaction, seul lien présent des deux côtés —
 * la tranche du plan et la ligne de paiement portent la même (« TP-5676 ».
 *
 * Simule par défaut. `--appliquer` pour écrire.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
const APPLIQUER = process.argv.includes("--appliquer");
const norm = (v) => String(v ?? "").trim().toUpperCase();

const { data: pmts } = await sb.from("paiements_parcours")
  .select("id, assignation_id, ref_transaction, date_paiement, montant_recu, mois_label");

const planParAsg = new Map();
const chargerPlan = async (aid) => {
  if (planParAsg.has(aid)) return planParAsg.get(aid);
  const { data } = await sb.from("assignations_parcours").select("plan_paiement").eq("id", aid).maybeSingle();
  planParAsg.set(aid, data?.plan_paiement || null);
  return planParAsg.get(aid);
};

let resolus = 0, deja = 0, sansAsg = 0, sansRef = 0, introuvable = 0;
const aEcrire = [];
const exemples = [];

for (const p of pmts || []) {
  if (p.mois_label) { deja++; continue; }
  if (!p.assignation_id) { sansAsg++; continue; }
  if (!p.ref_transaction) { sansRef++; continue; }
  const plan = await chargerPlan(p.assignation_id);
  const ref = norm(p.ref_transaction);
  let trouve = null;
  for (const m of plan?.mois_paiements || []) {
    if ((m.tranches || []).some((t) => norm(t.ref) === ref || norm(t.reference) === ref)) {
      trouve = m.label || m.periode; break;
    }
  }
  if (!trouve) { introuvable++; continue; }
  resolus++;
  aEcrire.push({ id: p.id, mois_label: trouve });
  if (exemples.length < 6) exemples.push(`  ${p.date_paiement} · ${p.ref_transaction} · ${Number(p.montant_recu).toLocaleString("fr-FR")} F  ->  ${trouve}`);
}

console.log(`total versements      : ${(pmts || []).length}`);
console.log(`deja renseignes       : ${deja}`);
console.log(`RESOLUS (a ecrire)    : ${resolus}`);
console.log(`sans assignation      : ${sansAsg}`);
console.log(`sans reference        : ${sansRef}`);
console.log(`reference introuvable : ${introuvable}`);
if (exemples.length) console.log(`\nexemples :\n${exemples.join("\n")}`);

if (!APPLIQUER) { console.log(`\n(simulation — relancer avec --appliquer pour ecrire)`); process.exit(0); }

let ok = 0;
for (const w of aEcrire) {
  const { error } = await sb.from("paiements_parcours").update({ mois_label: w.mois_label }).eq("id", w.id);
  if (!error) ok++; else console.warn("echec", w.id, error.message);
}
console.log(`\n${ok}/${aEcrire.length} versements mis a jour.`);
