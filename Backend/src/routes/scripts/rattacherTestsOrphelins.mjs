/**
 * Rattache à leur dossier les tests de niveau enregistrés sans `assignation_id`.
 *
 * POURQUOI. Un test passé lors d'une demande de transfert était écrit sans `assignation_id`
 * ni `commercial_id` : ni le niveau saisi à l'oral par l'agent placement test, ni celui passé
 * en ligne via le lien de la demande, dont l'URL ne transporte que l'e-mail et l'id de
 * demande. Conséquences observées : le dashboard de la conseillère, qui filtre sa liste sur
 * `commercial_id`, rangeait ces tests dans « sans conseillère assignée », et la fiche de
 * l'apprenant restait affichée à son ANCIEN niveau alors qu'il venait d'en changer.
 *
 * La cause est corrigée à la source (routes/demandesTransfert.js). Ce script ne traite que
 * les lignes déjà en base. Elles remontent encore par e-mail, ce qui suffit dans la plupart
 * des cas - mais pas pour un profil enfant, qui partage l'adresse de son parent : là, le
 * rapprochement par e-mail est volontairement refusé pour ne pas attribuer à l'un le test de
 * l'autre, et sans `assignation_id` le test reste donc invisible.
 *
 * COMMENT L'APPARIEMENT EST FAIT. Par e-mail, et uniquement quand il désigne UN SEUL dossier.
 * Un e-mail qui en désigne plusieurs (un parent et ses enfants, une même personne inscrite
 * deux fois) est laissé de côté et listé : deviner lequel des dossiers reçoit le test, ce
 * serait risquer d'inventer une progression à quelqu'un qui ne l'a pas. Mieux vaut un test
 * non rattaché qu'un test attribué au mauvais apprenant.
 *
 * SÉCURITÉ. Sans argument, le script n'écrit RIEN : il affiche ce qu'il ferait, dossier par
 * dossier, plus la liste des cas ambigus et celle des tests sans dossier trouvable.
 *
 *   node src/routes/scripts/rattacherTestsOrphelins.mjs              → simulation
 *   node src/routes/scripts/rattacherTestsOrphelins.mjs --appliquer  → écriture
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const APPLIQUER = process.argv.includes("--appliquer");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const jour = (d) => d ? new Date(d).toLocaleDateString("fr-FR") : "?";

async function main() {
  console.log(APPLIQUER
    ? "── ÉCRITURE : les tests appariés vont être mis à jour ──\n"
    : "── SIMULATION : aucune écriture. Ajoutez --appliquer pour écrire. ──\n");

  const { data: orphelins, error } = await supabase
    .from("level_test_results")
    .select("id, email, fullname, level, source, submitted_at, commercial_id")
    .is("assignation_id", null)
    .order("submitted_at", { ascending: true });

  if (error) {
    console.error("Lecture des tests impossible :", error.message);
    process.exit(1);
  }
  if (!orphelins?.length) {
    console.log("Aucun test sans dossier. Rien à faire.");
    return;
  }
  console.log(`${orphelins.length} test(s) sans assignation_id.\n`);

  const sansEmail = orphelins.filter(t => !t.email);
  const avecEmail = orphelins.filter(t => t.email);

  /* Un seul aller-retour pour tous les e-mails concernés, plutôt qu'une requête par test :
     la table des dossiers est petite au regard du nombre de tests, et un script qui
     interroge la base des centaines de fois finit par être abandonné avant la fin. */
  const emails = [...new Set(avecEmail.map(t => t.email.toLowerCase()))];
  const dossiersParEmail = new Map();
  const PAQUET = 100;
  for (let i = 0; i < emails.length; i += PAQUET) {
    const { data: rows, error: e2 } = await supabase
      .from("assignations_parcours")
      .select("id, prospect_email, prospect_nom, profil_type, assistante_id, created_at")
      .in("prospect_email", emails.slice(i, i + PAQUET));
    if (e2) {
      console.error("Lecture des dossiers impossible :", e2.message);
      process.exit(1);
    }
    (rows || []).forEach(d => {
      const k = (d.prospect_email || "").toLowerCase();
      if (!dossiersParEmail.has(k)) dossiersParEmail.set(k, []);
      dossiersParEmail.get(k).push(d);
    });
  }

  const aEcrire = [];
  const ambigus = [];
  const introuvables = [];

  for (const t of avecEmail) {
    const candidats = dossiersParEmail.get(t.email.toLowerCase()) || [];
    if (candidats.length === 0) { introuvables.push(t); continue; }
    if (candidats.length > 1)   { ambigus.push({ test: t, candidats }); continue; }
    aEcrire.push({ test: t, dossier: candidats[0] });
  }

  // ── Ce qui sera écrit ──────────────────────────────────────────────────────
  console.log(`✅ ${aEcrire.length} test(s) rattachable(s) sans ambiguïté :`);
  for (const { test, dossier } of aEcrire) {
    const majCommercial = !test.commercial_id && dossier.assistante_id ? " + conseillère" : "";
    console.log(`   ${jour(test.submitted_at)}  ${String(test.level || "?").padEnd(3)}  `
      + `${(test.fullname || test.email).slice(0, 34).padEnd(34)} → dossier ${dossier.id.slice(0, 8)}`
      + `${dossier.profil_type === "enfant" ? " (enfant)" : ""}${majCommercial}`);
  }

  if (ambigus.length) {
    console.log(`\n⚠️  ${ambigus.length} test(s) laissé(s) de côté - l'e-mail désigne plusieurs dossiers.`);
    console.log("   Un parent et ses enfants partagent l'adresse : choisir au hasard attribuerait");
    console.log("   à l'un le niveau de l'autre. À rattacher à la main si nécessaire.");
    for (const { test, candidats } of ambigus) {
      console.log(`   ${jour(test.submitted_at)}  ${String(test.level || "?").padEnd(3)}  ${test.email}`);
      candidats.forEach(d => console.log(`        · ${d.id.slice(0, 8)}  ${d.prospect_nom || "-"}`
        + `${d.profil_type === "enfant" ? "  [enfant]" : ""}  créé le ${jour(d.created_at)}`));
    }
  }

  if (introuvables.length) {
    console.log(`\nℹ️  ${introuvables.length} test(s) sans dossier correspondant `
      + "(prospect jamais converti, ou e-mail saisi différemment) - laissés tels quels.");
  }
  if (sansEmail.length) {
    console.log(`ℹ️  ${sansEmail.length} test(s) sans e-mail - impossibles à rapprocher.`);
  }

  if (!APPLIQUER) {
    console.log("\n── Fin de la simulation. Relancez avec --appliquer pour écrire. ──");
    return;
  }
  if (!aEcrire.length) {
    console.log("\nRien à écrire.");
    return;
  }

  console.log("\n── Écriture ──");
  let ok = 0, echecs = 0;
  for (const { test, dossier } of aEcrire) {
    const patch = { assignation_id: dossier.id };
    // On ne réécrit PAS un `commercial_id` déjà posé : il peut avoir été corrigé à la main,
    // et le dossier n'est pas plus fiable que cette correction.
    if (!test.commercial_id && dossier.assistante_id) patch.commercial_id = dossier.assistante_id;

    const { error: e3 } = await supabase.from("level_test_results").update(patch).eq("id", test.id);
    if (e3) { echecs++; console.error(`   ✗ ${test.id.slice(0, 8)} : ${e3.message}`); }
    else ok++;
  }
  console.log(`\n${ok} test(s) rattaché(s)${echecs ? `, ${echecs} en échec` : ""}.`);
  console.log(ambigus.length
    ? `${ambigus.length} cas ambigu(s) restent à traiter à la main (voir la liste ci-dessus).`
    : "Aucun cas ambigu.");
}

main().catch(e => { console.error(e); process.exit(1); });
