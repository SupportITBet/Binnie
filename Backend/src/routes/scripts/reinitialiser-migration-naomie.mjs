/**
 * REMISE EN ÉTAT D'UN DOSSIER POUR REJOUER LA MIGRATION DE CANAL
 *
 * POURQUOI CE SCRIPT EXISTE. La migration de Coulibaly naomie a été exécutée le 04/10 à 12:56
 * sur un build qui ne contenait pas encore le bloc de propriété (`assistante_id`) ni les
 * notifications. Le test doit être rejoué sur le code actuel, ce qui suppose de rendre au
 * dossier son état d'avant — et de le rendre EXACTEMENT, sinon le test valide autre chose.
 *
 * CE QUI EST RESTAURÉ, et d'où vient chaque valeur :
 *   - l'inscription de départ repasse `actif`, sans `date_retrait`, et retrouve sa `note`
 *     d'origine. Cette note avait été écrasée par le journal de départ, mais la nouvelle
 *     inscription en avait gardé une copie augmentée : on la reconstitue en retirant la clé
 *     `dernier_transfert` qui, elle, n'existait pas avant.
 *   - l'inscription d'arrivée est supprimée : elle n'existait pas, et aucune présence ni
 *     évaluation ne s'y rattache (vérifié avant écriture).
 *   - la demande redevient `en_attente_accord` : le statut d'une migration en attente, celle-ci
 *     n'exigeant aucun test de niveau.
 *   - le dossier revient au présentiel à 5 F. Le canal d'avant n'a pas été observé
 *     directement ; il est déduit de deux faits concordants : les sept autres dossiers du
 *     centre angre sont tous `presentiel`, et la mensualité relevée à 00:11 — avant la
 *     migration — valait bien 5, montant que `changements_tarif` enregistre comme point de
 *     départ. L'entrée de `changements_tarif` est retirée puisque le changement est annulé.
 *
 * CE QUI N'EST PAS TOUCHÉ : `assistante_id` et `centre_id`. L'ancien build ne les écrivait pas,
 * ils portent donc déjà leurs valeurs d'avant la migration.
 *
 * TOUTE PRÉCONDITION FAUSSE ARRÊTE LE SCRIPT AVANT LA PREMIÈRE ÉCRITURE. Un état déjà modifié
 * depuis l'inspection signifie que ce script ne décrit plus la réalité, et le réparer au jugé
 * serait pire que de ne rien faire.
 *
 * Usage :  node src/routes/scripts/reinitialiser-migration-naomie.mjs          (lecture seule)
 *          node src/routes/scripts/reinitialiser-migration-naomie.mjs --appliquer
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const DEMANDE = "8fd725c2-395d-4f8b-ac00-8e7e0edf5c11";
const GA_OLD  = "6df2ae97-e014-46c5-a019-3d5975dbce51";   // Evening classes A1+ (presentiel)
const GA_NEW  = "5bf24098-2911-4570-b832-f3cdca2f4dd4";   // Anglais B2 soir WITH ISMAEL (hybride)
const DOSSIER = "b4efe206-1afa-4deb-9d75-4019c72a2b48";
const GROUPE_CIBLE = "4e2314f4-39a8-4360-ad76-e8a6b573f4b1";

const APPLIQUER = process.argv.includes("--appliquer");
const echecs = [];
const exiger = (condition, libelle, constate) => {
  if (condition) console.log(`  ✓ ${libelle}`);
  else { console.log(`  ✗ ${libelle} — constaté : ${constate}`); echecs.push(libelle); }
};

console.log("═══ PRÉCONDITIONS ═══");

/* 1. La demande ──────────────────────────────────────────────────────────────────────── */
const { data: dem } = await s.from("demandes_transfert").select("*").eq("id", DEMANDE).maybeSingle();
exiger(!!dem, "la demande existe", "introuvable");
if (dem) {
  exiger(dem.type_demande === "changement_coaching", "c'est une migration de canal", dem.type_demande);
  exiger(dem.statut === "traitee", "elle est traitée (donc à rouvrir)", dem.statut);
  exiger(dem.ga_id === GA_OLD, "elle porte bien l'inscription de départ", dem.ga_id);
  exiger(dem.groupe_cible_id === GROUPE_CIBLE, "la classe d'arrivée est celle attendue", dem.groupe_cible_id);
}

/* 2. Les deux inscriptions ───────────────────────────────────────────────────────────── */
const { data: gaOld } = await s.from("groupes_apprenants").select("*").eq("id", GA_OLD).maybeSingle();
const { data: gaNew } = await s.from("groupes_apprenants").select("*").eq("id", GA_NEW).maybeSingle();
exiger(gaOld?.statut === "transfere", "l'inscription de départ est marquée transférée", gaOld?.statut ?? "absente");
exiger(!!gaOld?.date_retrait, "elle porte une date de retrait", gaOld?.date_retrait ?? "aucune");
exiger(gaNew?.statut === "actif", "l'inscription d'arrivée est active", gaNew?.statut ?? "absente");
exiger(gaNew?.groupe_id === GROUPE_CIBLE, "elle est dans la classe d'arrivée de la demande", gaNew?.groupe_id ?? "—");

/* Aucune donnée pédagogique ne doit dépendre de l'inscription qu'on supprime, ni manquer à
   celle qu'on rouvre. Sinon la suppression détruirait de l'historique réel. */
for (const table of ["groupes_presences", "resultats_evaluations_groupes"]) {
  const { data, error } = await s.from(table).select("id").eq("ga_id", GA_NEW);
  exiger(!error && data.length === 0, `aucune ligne ${table} sur l'inscription à supprimer`,
    error ? error.message : `${data.length} ligne(s)`);
}

/* 3. La note d'origine, reconstituée depuis la copie gardée par l'arrivée ────────────── */
let noteOrigine = null;
try {
  const { dernier_transfert: _ajoutee, ...reste } = JSON.parse(gaNew?.note || "{}");
  noteOrigine = JSON.stringify(reste);
} catch { /* laissé à null : la précondition suivante échouera */ }
exiger(noteOrigine && noteOrigine.includes(DOSSIER),
  "la note d'origine est reconstituable depuis l'inscription d'arrivée", noteOrigine ?? "illisible");

/* 4. Le dossier ──────────────────────────────────────────────────────────────────────── */
const { data: dos } = await s.from("assignations_parcours")
  .select("id, type_cours, centre_id, assistante_id, plan_paiement").eq("id", DOSSIER).maybeSingle();
const plan = dos?.plan_paiement || {};
const chgts = Array.isArray(plan.changements_tarif) ? plan.changements_tarif : [];
const chgtMigration = chgts.filter(c => c.demande_id === DEMANDE);
exiger(dos?.type_cours === "hybride", "le dossier porte le canal posé par la migration", dos?.type_cours ?? "—");
exiger(Number(plan.mensualite) === 10, "la mensualité est celle d'après migration (10)", String(plan.mensualite));
exiger(chgtMigration.length === 1, "une seule trace de changement de tarif pour cette demande", String(chgtMigration.length));
exiger(chgtMigration[0] && Number(chgtMigration[0].de) === 5,
  "cette trace part bien de 5 F", String(chgtMigration[0]?.de));

if (echecs.length) {
  console.log(`\n⛔ ${echecs.length} précondition(s) non remplie(s) — AUCUNE écriture. L'état en base ne
   correspond plus à celui inspecté : relancer l'inspection avant de réessayer.`);
  process.exit(1);
}

/* ─────────────────────────────────────────────────────────────────────────────────────── */
const mensualiteAvant = Number(chgtMigration[0].de);
const chgtsRestants   = chgts.filter(c => c.demande_id !== DEMANDE);
const planRestaure    = { ...plan, mensualite: mensualiteAvant };
if (chgtsRestants.length) planRestaure.changements_tarif = chgtsRestants;
else delete planRestaure.changements_tarif;

console.log("\n═══ CE QUI VA CHANGER ═══");
console.log(`  demandes_transfert  statut           traitee            → en_attente_accord`);
console.log(`                      groupe_cible_id  ${GROUPE_CIBLE} → null`);
console.log(`                      traite_le        ${dem.traite_le} → null`);
console.log(`                      traite_par       ${dem.traite_par} → null`);
console.log(`  groupes_apprenants  ${GA_OLD}`);
console.log(`                      statut           transfere          → actif`);
console.log(`                      date_retrait     ${gaOld.date_retrait} → null`);
console.log(`                      note             (journal de départ) → ${noteOrigine}`);
console.log(`  groupes_apprenants  ${GA_NEW}  → SUPPRIMÉE`);
console.log(`  assignations_parcours ${DOSSIER}`);
console.log(`                      type_cours       hybride            → presentiel`);
console.log(`                      mensualité       ${plan.mensualite}                 → ${mensualiteAvant}`);
console.log(`                      changements_tarif ${chgts.length} entrée(s)       → ${chgtsRestants.length}`);
console.log(`  INCHANGÉS           assistante_id=${dos.assistante_id} · centre_id=${dos.centre_id}`);

if (!APPLIQUER) {
  console.log("\nLecture seule. Relancer avec --appliquer pour écrire.");
  process.exit(0);
}

console.log("\n═══ ÉCRITURES ═══");
const ecrire = async (libelle, promesse) => {
  const { error } = await promesse;
  if (error) { console.log(`  ✗ ${libelle} : ${error.message}`); process.exit(1); }
  console.log(`  ✓ ${libelle}`);
};

/* L'inscription d'arrivée part d'abord : tant qu'elle existe, l'apprenante est dans deux
   classes à la fois, et c'est l'état le plus faux des trois. */
await ecrire("inscription d'arrivée supprimée",
  s.from("groupes_apprenants").delete().eq("id", GA_NEW));

await ecrire("inscription de départ rouverte",
  s.from("groupes_apprenants")
    .update({ statut: "actif", date_retrait: null, note: noteOrigine })
    .eq("id", GA_OLD));

await ecrire("dossier remis au présentiel à " + mensualiteAvant + " F",
  s.from("assignations_parcours")
    .update({ type_cours: "presentiel", plan_paiement: planRestaure })
    .eq("id", DOSSIER));

/* La demande en dernier : elle est le déclencheur du test, et la rouvrir avant que le reste
   soit en place exposerait un dossier à moitié rendu à l'écran de l'assistante. */
await ecrire("demande rouverte en attente d'accord",
  s.from("demandes_transfert")
    .update({ statut: "en_attente_accord", groupe_cible_id: null, traite_le: null, traite_par: null })
    .eq("id", DEMANDE));

console.log("\n═══ RELECTURE ═══");
const { data: v1 } = await s.from("demandes_transfert").select("statut, groupe_cible_id, traite_le").eq("id", DEMANDE).maybeSingle();
const { data: v2 } = await s.from("groupes_apprenants").select("statut, date_retrait, note").eq("id", GA_OLD).maybeSingle();
const { data: v3 } = await s.from("groupes_apprenants").select("id").eq("id", GA_NEW).maybeSingle();
const { data: v4 } = await s.from("assignations_parcours").select("type_cours, centre_id, assistante_id, plan_paiement").eq("id", DOSSIER).maybeSingle();
console.log("  demande      :", v1.statut, "· cible =", v1.groupe_cible_id, "· traitée le", v1.traite_le);
console.log("  départ       :", v2.statut, "· retrait =", v2.date_retrait, "·", v2.note);
console.log("  arrivée      :", v3 ? "ENCORE PRÉSENTE ⚠" : "supprimée");
console.log("  dossier      :", v4.type_cours, "· centre =", v4.centre_id, "· mensualité =", v4.plan_paiement?.mensualite,
            "· changements_tarif =", v4.plan_paiement?.changements_tarif ? v4.plan_paiement.changements_tarif.length : 0);
console.log("  assistante   :", v4.assistante_id);
