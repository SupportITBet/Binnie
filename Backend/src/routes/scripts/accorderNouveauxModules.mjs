/**
 * Accorde aux rôles les sept modules de permissions ajoutés par l'audit du 29/09/2026.
 *
 * POURQUOI. Ces modules protègent des écrans qui existaient déjà mais que rien ne
 * restreignait : circuit de transfert, cahiers des coachs, évaluations qualité, présences,
 * comptabilité analytique, collecte de données, suivi de démarrage. Les déclarer dans le
 * catalogue ne suffit pas : tant qu'aucune ligne n'existe dans `permissions_roles`, poser un
 * verrou sur les routes correspondantes refuserait l'accès à ceux qui font ce travail
 * aujourd'hui.
 *
 * LE REPLI NE SUFFIT PAS ICI. `MODULE_FALLBACK_PARENT` fait retomber chaque nouveau module
 * sur un module existant, ce qui protège la plupart des rôles. Mais `placement_test` ne
 * possède que `examens` et `rapports` : le repli de `transferts` vers `classes` ne le couvre
 * pas, et c'est pourtant lui qui fait avancer le dossier en y inscrivant le niveau. D'où ces
 * lignes explicites.
 *
 * LES ACTIONS SUIVENT LE MÉTIER, pas un gabarit uniforme. Un deputy soumet ses rapports
 * d'observation mais ne signale pas d'anomalie : il reçoit `creer`, pas `supprimer`. Un coach
 * émet une demande de transfert mais ne la traite pas : `creer`, pas `modifier`.
 *
 * SÉCURITÉ. Sans argument, le script n'écrit RIEN : il affiche ce qu'il ferait. Il n'écrase
 * jamais une ligne existante — un droit déjà accordé ou déjà retiré à la main reste tel quel.
 *
 *   node src/routes/scripts/accorderNouveauxModules.mjs              → simulation
 *   node src/routes/scripts/accorderNouveauxModules.mjs --appliquer  → écriture
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const APPLIQUER = process.argv.includes("--appliquer");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

/* [rôle, module, lire, créer, modifier, supprimer] — `gerer` reste false partout :
   il ouvre l'administration du module, qui n'appartient qu'au super admin. */
const DROITS = [
  // ── Circuit de transfert ────────────────────────────────────────────────
  ["coach",               "transferts", true,  true,  false, false], // émet la demande
  ["placement_test",      "transferts", true,  false, true,  false], // rend le niveau
  ["onboarding",          "transferts", true,  false, true,  false], // réaffecte (en ligne)
  ["commercial",          "transferts", true,  false, true,  false], // réaffecte (présentiel)
  ["pedagogical_advisor", "transferts", true,  false, true,  false],

  // ── Observation des coachs ──────────────────────────────────────────────
  ["superviseur",        "observations", true, true,  true,  true],  // cahiers, anomalies, classement
  ["deputy_superviseur", "observations", true, true,  false, false], // soumet, ne signale pas

  // ── Évaluations qualité (apprenants et parents) ─────────────────────────
  ["superviseur",         "evaluations_qualite", true, false, false, false],
  ["deputy_superviseur",  "evaluations_qualite", true, false, false, false],
  ["pedagogical_advisor", "evaluations_qualite", true, false, false, false],

  // ── Présences ───────────────────────────────────────────────────────────
  // `creer` est donné à tout rôle qui corrige une feuille : la route POST est un
  // upsert (elle supprime la feuille du jour avant de la réinsérer), donc modifier
  // une présence passe par une création. Sans cela, verrouiller l'écriture sur
  // `creer` refuserait la correction à l'onboarding.
  ["coach",       "presences", true, true,  true,  false], // saisit sa feuille
  ["onboarding",  "presences", true, true,  true,  false], // corrige une erreur de saisie
  ["commercial",  "presences", true, false, false, false],
  // `admin_commercial` ouvre le dashboard Commercial, qui lit les présences en trois
  // endroits, et ce rôle n'a AUCUNE ligne `classes` : le repli ne le couvrirait pas.
  ["admin_commercial", "presences", true, false, false, false],

  // Pas de module « comptabilité » : le rôle comptable possède déjà les neuf
  // `dash_finances_*` en lecture/écriture/gestion, qui protègent les 75 routes de
  // dashComptabilite.js. Un module de plus n'aurait verrouillé aucune route et aurait
  // affiché dans Gestion des droits un interrupteur sans effet. La ligne créée par erreur
  // au premier passage est supprimée par SUPPRESSIONS ci-dessous.

  // ── Collecte de données ─────────────────────────────────────────────────
  ["data_collector", "leads", true, true, true, false],

  // ── Suivi de démarrage et bilans ────────────────────────────────────────
  ["onboarding",  "suivi_demarrage", true, true, true, false],
  ["commercial",  "suivi_demarrage", true, true, true, false],

  // ── Planning, module existant nouvellement attribué ─────────────────────
  // Consultation seule : ces rôles lisent le planning des coachs, ils ne le construisent pas.
  ["superviseur",        "planning", true, false, false, false],
  ["deputy_superviseur", "planning", true, false, false, false],
  ["onboarding",         "planning", true, false, false, false],
  ["commercial",         "planning", true, false, false, false],
];

/* Corrections d'une ligne que CE script a créée à un premier passage avec une action trop
   étroite. Elles ÉLARGISSENT uniquement — on ne retire jamais un droit ici, sans quoi on
   écraserait un réglage fait à la main depuis Gestion des droits. Chaque entrée porte la
   raison de l'élargissement, faute de quoi il n'y a aucun moyen de savoir plus tard si elle
   est encore justifiée. */
const AJUSTEMENTS = [
  {
    role: "onboarding", module: "presences", champ: "peut_creer",
    pourquoi: "POST /groupes/:id/presences est un upsert : corriger une feuille exige `creer`.",
  },
];

/* Lignes créées par un passage précédent de ce script et qu'il faut retirer. Le seul motif
   admis est « le module n'existe plus au catalogue » : une ligne pointant vers un module que
   Gestion des droits n'affiche plus est invisible et donc impossible à retirer à la main. */
const SUPPRESSIONS = [
  {
    role: "comptable", module: "comptabilite",
    pourquoi: "Module retiré du catalogue : doublon des neuf `dash_finances_*` déjà accordés.",
  },
];

const actionsLisibles = (l, c, m, s) =>
  [l && "lire", c && "créer", m && "modifier", s && "supprimer"].filter(Boolean).join(", ");

async function main() {
  console.log(APPLIQUER
    ? "── ÉCRITURE : les lignes manquantes vont être créées ──\n"
    : "── SIMULATION : aucune écriture. Ajoutez --appliquer pour écrire. ──\n");

  const { data: existantes, error } = await supabase
    .from("permissions_roles").select("role, module");
  if (error) {
    console.error("Lecture impossible :", error.message);
    process.exit(1);
  }
  const deja = new Set((existantes || []).map(r => `${r.role}|${r.module}`));

  const aCreer = DROITS.filter(([role, mod]) => !deja.has(`${role}|${mod}`));
  const ignorees = DROITS.length - aCreer.length;

  console.log(`${existantes.length} lignes déjà en base · ${DROITS.length} droits visés\n`);

  if (ignorees) {
    console.log(`${ignorees} déjà présent(s), laissé(s) intact(s) :`);
    for (const [role, mod] of DROITS) {
      if (deja.has(`${role}|${mod}`)) console.log(`   = ${role.padEnd(20)} ${mod}`);
    }
    console.log();
  }

  if (aCreer.length) {
    console.log(`${aCreer.length} ligne(s) à créer :`);
    for (const [role, mod, l, c, m, s] of aCreer) {
      console.log(`   + ${role.padEnd(20)} ${mod.padEnd(20)} ${actionsLisibles(l, c, m, s)}`);
    }
  } else {
    console.log("Aucune ligne à créer : tous les droits visés existent déjà.");
  }

  // Les ajustements ne portent que sur une ligne réellement présente et réellement à faux.
  const aAjuster = [];
  for (const a of AJUSTEMENTS) {
    const { data: ligne } = await supabase.from("permissions_roles")
      .select(`id, ${a.champ}`).eq("role", a.role).eq("module", a.module).maybeSingle();
    if (ligne && ligne[a.champ] !== true) aAjuster.push({ ...a, id: ligne.id });
  }
  if (aAjuster.length) {
    console.log(`\n${aAjuster.length} ajustement(s) à appliquer :`);
    for (const a of aAjuster) {
      console.log(`   ~ ${a.role.padEnd(20)} ${a.module.padEnd(20)} ${a.champ} → true`);
      console.log(`     ${a.pourquoi}`);
    }
  }

  const aSupprimer = SUPPRESSIONS.filter(s => deja.has(`${s.role}|${s.module}`));
  if (aSupprimer.length) {
    console.log(`\n${aSupprimer.length} suppression(s) à appliquer :`);
    for (const s of aSupprimer) {
      console.log(`   − ${s.role.padEnd(20)} ${s.module}`);
      console.log(`     ${s.pourquoi}`);
    }
  }

  if (!aCreer.length && !aAjuster.length && !aSupprimer.length) return;

  if (!APPLIQUER) {
    console.log("\n── Fin de la simulation. Relancez avec --appliquer pour écrire. ──");
    return;
  }

  if (aCreer.length) {
    const lignes = aCreer.map(([role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer]) => ({
      role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer, peut_gerer: false,
    }));
    const { error: e2 } = await supabase.from("permissions_roles").insert(lignes);
    if (e2) {
      console.error("\nÉcriture impossible :", e2.message);
      process.exit(1);
    }
    console.log(`\n${lignes.length} ligne(s) créée(s).`);
  }

  for (const a of aAjuster) {
    const { error: e3 } = await supabase.from("permissions_roles")
      .update({ [a.champ]: true }).eq("id", a.id);
    if (e3) {
      console.error(`\nAjustement ${a.role}/${a.module} impossible :`, e3.message);
      process.exit(1);
    }
    console.log(`Ajusté : ${a.role} / ${a.module} / ${a.champ}`);
  }

  for (const s of aSupprimer) {
    const { error: e4 } = await supabase.from("permissions_roles")
      .delete().eq("role", s.role).eq("module", s.module);
    if (e4) {
      console.error(`\nSuppression ${s.role}/${s.module} impossible :`, e4.message);
      process.exit(1);
    }
    console.log(`Supprimé : ${s.role} / ${s.module}`);
  }

  console.log("\nLes rôles concernés devront se reconnecter pour que leurs droits soient relus.");
}

main().catch(e => { console.error(e); process.exit(1); });
