import { genererPDF, fmtDatePDF } from "./genererPDF";

/* Ré-exporté ici pour que les écrans qui bâtissent une fiche n'aient qu'un import à faire :
   ils formatent tous des dates, et aller les chercher dans genererPDF pendant qu'on lit
   ce constructeur est exactement le genre d'import qu'on oublie. */
export { fmtDatePDF };

/**
 * ════════════════════════════════════════════════════════════════════════════════
 * LA FICHE APPRENANT EN PDF — un seul constructeur pour tous les tableaux de bord
 * ════════════════════════════════════════════════════════════════════════════════
 * POURQUOI. Trois services savaient déjà exporter une fiche apprenant (commerciale, PA,
 * onboarding), chacun avec son propre assemblage HTML recopié à la main : trois endroits
 * à corriger pour une même charte, et la garantie qu'un jour l'un des trois soit oublié -
 * c'est exactement ce qui s'est produit, l'export de l'onboarding étant resté accroché à
 * un modal que plus aucun bouton n'ouvrait. Le coach, le superviseur, l'admin et le
 * superadmin, eux, n'en avaient aucun.
 *
 * CE FICHIER NE DÉCIDE PAS DU CONTENU. Chaque écran connaît des choses différentes sur
 * l'apprenant - le coach ses présences, la commerciale son paiement, le superviseur sa
 * classe. Il passe donc ses propres sections ; ce constructeur porte l'en-tête BET, le
 * bandeau de titre, le pied de page, et une chose qu'aucun écran ne doit avoir à
 * réécrire : le tableau des tests de niveau, chargé ici à la source.
 *
 * L'HISTORIQUE DES TESTS EST CHARGÉ, PAS FOURNI. Un export est le moment où l'on veut la
 * donnée la plus fraîche, et tous les écrans ne la gardent pas en mémoire. D'où la
 * fonction `async` : l'appelant l'attend, ou pas - l'export s'ouvre de toute façon.
 */

const echapper = (v) => String(v == null ? "" : v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Une ligne libellé / valeur. Vide = absente : une fiche ne montre pas ses trous. */
export const ligneInfo = (libelle, valeur) =>
  valeur == null || valeur === "" || valeur === "-"
    ? ""
    : `<div class="info-row"><span class="info-label">${echapper(libelle)}</span><span class="info-value">${valeur}</span></div>`;

const bloc = (titre, lignes) => {
  const corps = (lignes || []).filter(Boolean).join("");
  return corps ? `<div class="section-title">${echapper(titre)}</div><div class="info-grid">${corps}</div>` : "";
};

const tableau = (titre, entetes, lignes) => {
  if (!lignes || !lignes.length) return "";
  return `<div class="section-title">${echapper(titre)}</div>
    <table><thead><tr>${entetes.map(h => `<th>${echapper(h)}</th>`).join("")}</tr></thead>
    <tbody>${lignes.map(l => `<tr>${l.map(c => `<td>${c == null ? "-" : c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
};

const cartesKpi = (titre, cartes) => {
  if (!cartes || !cartes.length) return "";
  return `<div class="section-title">${echapper(titre)}</div><div class="kpi-row">${
    cartes.map(c => `<div class="kpi-card"><div class="kpi-val">${echapper(c.valeur)}</div><div class="kpi-lbl">${echapper(c.libelle)}</div></div>`).join("")
  }</div>`;
};

/** Charge l'historique des tests. Ne jette jamais : un export ne doit pas échouer pour ça. */
async function chargerTests({ apiUrl, authHeaders, assignationId, gaId, email }) {
  if (!apiUrl || !authHeaders || (!assignationId && !gaId && !email)) return [];
  try {
    const p = new URLSearchParams();
    if (assignationId) p.set("assignation_id", assignationId);
    if (gaId)          p.set("ga_id", gaId);
    if (email)         p.set("email", email);
    const r = await fetch(`${apiUrl}/api/level-test/historique?${p}`, { headers: authHeaders() });
    if (!r.ok) return [];
    return (await r.json()).historique || [];
  } catch {
    return [];
  }
}

/**
 * @param {object} o
 * @param {string} o.nom            nom affiché dans le bandeau de titre
 * @param {string} [o.id]           sert à numéroter le document (BET-FA-XXXXXXXX)
 * @param {string} [o.emoji]        pictogramme du bandeau
 * @param {Array}  [o.sections]     [{ titre, lignes: [...ligneInfo] }] — avant les tests
 * @param {Array}  [o.kpis]         [{ titre, cartes: [{ valeur, libelle }] }]
 * @param {Array}  [o.tableaux]     [{ titre, entetes, lignes }] — après les tests
 * @param {string} [o.texteLibre]   encart pleine largeur (objectif du client, par exemple)
 * @param {object} [o.tests]        { apiUrl, authHeaders, assignationId, gaId, email }
 */
export async function exporterFicheApprenantPDF({
  nom, id, emoji = "🎓",
  sections = [], kpis = [], tableaux = [], texteLibre = "",
  tests = null,
}) {
  const numero = `BET-FA-${String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase() || "000000"}`;

  const historique = tests ? await chargerTests(tests) : [];
  const lignesTests = historique.map(t => [
    t.submitted_at ? fmtDatePDF(t.submitted_at) : "-",
    `<strong>${echapper((t.level || "-").toUpperCase())}</strong>`,
    t.score != null ? `${t.score}%` : "-",
    t.source === "oral" ? "Évalué en présentiel" : "Passé en ligne",
  ]);
  /* LA PROGRESSION EN UNE LIGNE, au-dessus du tableau. « A2 → B1 » se lit d'un coup d'œil
     là où quatre colonnes demandent d'être déchiffrées. Rien avec un seul test : un point
     de départ n'est pas une progression. */
  const suite = historique.length > 1
    ? [...historique].reverse().map(t => (t.level || "?").toUpperCase()).join("  →  ")
    : null;

  genererPDF(`
    <div class="doc-header">
      <div>
        <div class="doc-header-logo">BET Languages</div>
        <div class="doc-header-sub">Centre de langues - Abidjan, Côte d'Ivoire</div>
        <div class="doc-header-sub">📧 contact@binniesenglish.com · 📞 +225 27 22 40 71 99</div>
      </div>
      <div class="doc-header-right">
        N° ${numero}<br/>Émise le ${fmtDatePDF(new Date().toISOString())}
      </div>
    </div>
    <div class="doc-title-band">${emoji} FICHE APPRENANT - ${echapper(nom || "")}</div>
    <div class="doc-body">

      ${sections.map(s => bloc(s.titre, s.lignes)).join("")}

      ${texteLibre || ""}

      ${suite ? `<div class="section-title">📈 Évolution du niveau</div>
        <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:12px 16px;font-size:15px;font-weight:800;color:#0F172A;letter-spacing:0.02em">${echapper(suite)}</div>` : ""}

      ${tableau("📝 Tests de niveau", ["Date", "Niveau", "Score", "Origine"], lignesTests)}

      ${kpis.map(k => cartesKpi(k.titre, k.cartes)).join("")}

      ${tableaux.map(t => tableau(t.titre, t.entetes, t.lignes)).join("")}

      <div class="doc-footer">
        <span>BET Languages · Centre de langues agréé · Abidjan, Côte d'Ivoire</span>
        <span>contact@binniesenglish.com · +225 27 22 40 71 99</span>
      </div>
    </div>
  `, `Fiche apprenant - ${nom || ""}`);
}
