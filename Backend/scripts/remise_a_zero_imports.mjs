/**
 * Remise à zéro avant un nouveau test d'import en production.
 *
 * Supprime tout ce que les imports en masse ont produit, plus les éléments qui leur
 * survivraient et fabriqueraient des doublons au ré-import :
 *
 *   1. Comptes parent (créés hors import, donc sans `import_id` : l'annulation d'un lot
 *      ne les atteint pas et ils resteraient rattachés à des enfants supprimés).
 *   2. Tout ce qui porte un `import_id` — ordre inverse des dépendances.
 *   3. La classe manuelle et ses inscriptions désignées en argument, dont les dossiers
 *      partent avec les imports et qui resteraient donc incohérentes.
 *   4. Comptes Supabase Auth listés en argument (orphelins, absents de `utilisateurs`).
 *   5. Les notifications — un import de 88 apprenants en produit des milliers (paiement,
 *      assignation, inscription) qui pointent toutes vers des dossiers désormais supprimés.
 *
 * Les journaux d'audit (`audit_logs`) ne sont PAS touchés : ils tracent qui a fait quoi et
 * doivent survivre au nettoyage des données de test.
 *
 * Ne touche JAMAIS une ligne sans `import_id`, sauf celles explicitement nommées ici.
 *
 * Usage :
 *   node scripts/remise_a_zero_imports.mjs             # simulation
 *   node scripts/remise_a_zero_imports.mjs --appliquer # supprime
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const APPLIQUER = process.argv.includes("--appliquer");
const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
);

// Cibles nommées, décidées avec l'utilisateur.
const CLASSE_MANUELLE = "Anglais mArdi Soir";
const COMPTES_AUTH_A_SUPPRIMER = ["doumbia77fode@gmail.com", "fode77doumbia@gmail.com"];

const ligne = (l, n) => console.log(`  ${String(n).padStart(4)}  ${l}`);

/* ── Inventaire ──────────────────────────────────────────────────────────── */

const compter = async (table) => {
  const { count } = await sb.from(table).select("id", { count: "exact", head: true }).not("import_id", "is", null);
  return count || 0;
};

const { data: lots } = await sb.from("imports").select("id, type, fichier_nom, statut");
const { data: parents } = await sb.from("utilisateurs").select("id, email").eq("role", "parent");
const { data: classeManuelle } = await sb
  .from("groupes").select("id, nom").eq("nom", CLASSE_MANUELLE).maybeSingle();
const { data: inscriptionsClasse } = classeManuelle
  ? await sb.from("groupes_apprenants").select("id, nom_apprenant, prenom_apprenant, apprenant_id").eq("groupe_id", classeManuelle.id)
  : { data: [] };

const inventaire = {
  groupes_apprenants:    await compter("groupes_apprenants"),
  paiements_parcours:    await compter("paiements_parcours"),
  assignations_parcours: await compter("assignations_parcours"),
  groupes:               await compter("groupes"),
  utilisateurs:          await compter("utilisateurs"),
};

console.log(`\n${APPLIQUER ? "APPLICATION — SUPPRESSION DÉFINITIVE" : "SIMULATION (aucune suppression)"}\n`);
console.log("issu d'un import :");
for (const [t, n] of Object.entries(inventaire)) ligne(t, n);
console.log("\nhors import, supprimés car ils survivraient au nettoyage :");
ligne("comptes parent", (parents || []).length);
ligne(`inscriptions dans « ${CLASSE_MANUELLE} »`, (inscriptionsClasse || []).length);
ligne(`classe « ${CLASSE_MANUELLE} »`, classeManuelle ? 1 : 0);
console.log("\njournal des imports :");
ligne("lots", (lots || []).length);
const { count: nbNotifs } = await sb.from("notifications").select("id", { count: "exact", head: true });
console.log("\nnotifications (toutes, devenues sans objet) :");
ligne("notifications", nbNotifs || 0);
console.log("\ncomptes Supabase Auth nommés :");
COMPTES_AUTH_A_SUPPRIMER.forEach((e) => console.log(`        ${e}`));

if (!APPLIQUER) { console.log("\nRelancer avec --appliquer pour supprimer.\n"); process.exit(0); }

/* ── Suppression ─────────────────────────────────────────────────────────── */

const auth = async (id) => {
  try { await sb.auth.admin.deleteUser(id); } catch { /* compte auth déjà absent */ }
};

// 1. Comptes parent — auth puis table.
for (const p of parents || []) { await auth(p.id); }
if ((parents || []).length) {
  await sb.from("utilisateurs").delete().eq("role", "parent");
}
console.log(`\n✓ ${(parents || []).length} compte(s) parent supprimé(s)`);

// 2. Classe manuelle et ses inscriptions (avant les dossiers, comme pour un lot).
for (const i of inscriptionsClasse || []) {
  if (i.apprenant_id) await auth(i.apprenant_id);
}
if ((inscriptionsClasse || []).length) {
  await sb.from("groupes_apprenants").delete().eq("groupe_id", classeManuelle.id);
  const ids = (inscriptionsClasse || []).map((i) => i.apprenant_id).filter(Boolean);
  if (ids.length) await sb.from("utilisateurs").delete().in("id", ids);
}
if (classeManuelle) await sb.from("groupes").delete().eq("id", classeManuelle.id);
console.log(`✓ classe « ${CLASSE_MANUELLE} » et ses ${(inscriptionsClasse || []).length} inscription(s) supprimées`);

// 3. Tout ce qui porte un import_id — ordre inverse des dépendances, le même que
//    l'annulation d'un lot (nettoyerLigne dans imports.js).
const { data: comptesImport } = await sb.from("utilisateurs").select("id").not("import_id", "is", null);
for (const u of comptesImport || []) await auth(u.id);

for (const table of ["groupes_apprenants", "paiements_parcours", "assignations_parcours", "groupes", "utilisateurs"]) {
  const { error } = await sb.from(table).delete().not("import_id", "is", null);
  console.log(error ? `✗ ${table} : ${error.message}` : `✓ ${table} vidé de ses lignes importées`);
}

// 4. Journal des imports.
if ((lots || []).length) {
  await sb.from("imports").delete().in("id", (lots || []).map((l) => l.id));
  console.log(`✓ ${(lots || []).length} lot(s) effacés du journal`);
}

// 5. Comptes auth nommés.
let page = 1, tousAuth = [];
while (true) {
  const { data } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
  tousAuth.push(...(data?.users || []));
  if (!data?.users?.length || data.users.length < 1000) break;
  page++;
}
for (const e of COMPTES_AUTH_A_SUPPRIMER) {
  const u = tousAuth.find((x) => (x.email || "").toLowerCase() === e.toLowerCase());
  if (!u) { console.log(`· ${e} : déjà absent`); continue; }
  await auth(u.id);
  await sb.from("utilisateurs").delete().eq("id", u.id);
  console.log(`✓ ${e} supprimé`);
}

// 6. Notifications — supprimées par paquets, la table n'accepte pas un DELETE sans filtre.
let restantes = nbNotifs || 0;
while (restantes > 0) {
  const { data: lot } = await sb.from("notifications").select("id").limit(500);
  if (!lot?.length) break;
  await sb.from("notifications").delete().in("id", lot.map((n) => n.id));
  restantes -= lot.length;
}
const { count: apres } = await sb.from("notifications").select("id", { count: "exact", head: true });
console.log(`✓ notifications supprimées — ${apres || 0} restante(s)`);

console.log("\nRemise à zéro terminée.\n");
process.exit(0);
