/**
 * Reprise ponctuelle — crée les comptes parent manquants des enfants déjà en base.
 *
 * Contexte : la création automatique du compte parent, déclenchée à la création de l'accès
 * de l'enfant, était condamnée à ne jamais s'exécuter pour un enfant. Elle exigeait l'email
 * de l'enfant puis retrouvait le dossier par `prospect_email` — deux valeurs NULL pour un
 * enfant, dont les seules coordonnées connues sont celles de son parent. Le code est
 * corrigé (apprenants.js) ; ce script rattrape les enfants déjà créés.
 *
 * Le compte est créé par la même fonction que le bouton de la commerciale
 * (creerAccesParentCore) : mêmes règles, même rôle, même identifiant généré depuis le
 * téléphone quand le parent n'a pas d'email réel. Appelée directement plutôt que via
 * l'API — ni serveur à lancer, ni jeton à fabriquer pour une reprise ponctuelle.
 *
 * Sûr par construction :
 *   - ne traite que les dossiers profil_type = "enfant" ;
 *   - saute tout parent ayant déjà un compte (aucun mot de passe écrasé) ;
 *   - un parent de plusieurs enfants n'obtient qu'un seul compte ;
 *   - n'écrit rien sans --appliquer.
 *
 * Usage :
 *   node scripts/creer_comptes_parents_manquants.mjs             # simulation
 *   node scripts/creer_comptes_parents_manquants.mjs --appliquer # crée les comptes
 */
import "dotenv/config";

const APPLIQUER = process.argv.includes("--appliquer");

const { createClient } = await import("@supabase/supabase-js");
const { creerAccesParentCore } = await import("../src/routes/apprenants.js");
const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
);

const isRealEmail = (e) => !!e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && !/@betacademy\.app$/i.test(e);
const normalizePhone = (s) => String(s || "").replace(/\D/g, "");

// Identifiant de connexion attendu — même règle que phoneToVirtualEmail (apprenants.js).
const identifiantParent = (email, tel) => {
  if (isRealEmail(email)) return email.toLowerCase().trim();
  const d = normalizePhone(tel);
  return d ? `tel.${d}@betacademy.app` : null;
};

const { data: enfants, error } = await sb
  .from("assignations_parcours")
  .select("id, prospect_nom, nom_parent, email_parent, telephone_parent, prenom_enfant, nom_enfant")
  .eq("profil_type", "enfant");
if (error) { console.error("Lecture impossible :", error.message); process.exit(1); }

const { data: comptes } = await sb.from("utilisateurs").select("email").eq("role", "parent");
const dejaLa = new Set((comptes || []).map((c) => (c.email || "").toLowerCase()));

// Un parent de plusieurs enfants ne doit obtenir qu'un compte : on regroupe par identifiant.
const parIdentifiant = new Map();
const sansMoyen = [];
for (const e of enfants) {
  const ident = identifiantParent(e.email_parent, e.telephone_parent);
  if (!ident) { sansMoyen.push(e); continue; }
  if (!parIdentifiant.has(ident)) parIdentifiant.set(ident, { ident, enfants: [], ...e });
  parIdentifiant.get(ident).enfants.push(e.prospect_nom);
}

const aCreer = [...parIdentifiant.values()].filter((p) => !dejaLa.has(p.ident));
const existants = [...parIdentifiant.values()].filter((p) => dejaLa.has(p.ident));

console.log(`\n${APPLIQUER ? "APPLICATION" : "SIMULATION (aucune écriture)"}\n`);
console.log(`dossiers enfants          : ${enfants.length}`);
console.log(`parents distincts         : ${parIdentifiant.size}`);
console.log(`  compte déjà existant    : ${existants.length}`);
console.log(`  compte à créer          : ${aCreer.length}`);
console.log(`  sans email ni téléphone : ${sansMoyen.length}\n`);
for (const p of aCreer) {
  const genere = !isRealEmail(p.email_parent);
  console.log(`  ${p.ident}${genere ? "  (identifiant généré depuis le téléphone)" : ""}`);
  console.log(`      pour : ${p.enfants.join(", ")}`);
}
for (const e of sansMoyen) console.log(`  IGNORÉ (aucun moyen de connexion) : ${e.prospect_nom}`);

if (!APPLIQUER) { console.log("\nRelancer avec --appliquer pour créer les comptes."); process.exit(0); }

let ok = 0;
const echecs = [];
for (const p of aCreer) {
  try {
    const r = await creerAccesParentCore({
      nom_parent:       p.nom_parent || null,
      email_parent:     p.email_parent || null,
      telephone_parent: p.telephone_parent || null,
      enfant_nom:       [p.prenom_enfant, p.nom_enfant].filter(Boolean).join(" ") || p.prospect_nom,
    });
    if (r.ok) { ok++; console.log(`  ✓ ${p.ident}`); }
    else echecs.push(`${p.ident} : ${r.error}`);
  } catch (e) {
    echecs.push(`${p.ident} : ${e.message}`);
  }
}
console.log(`\n${ok} compte(s) parent créé(s).`);
if (echecs.length) { console.log(`${echecs.length} échec(s) :`); echecs.forEach((m) => console.log("  " + m)); }
process.exit(echecs.length ? 1 : 0);
