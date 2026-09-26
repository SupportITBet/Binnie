import { BetaAnalyticsDataClient } from "@google-analytics/data";

/**
 * LECTURE DE GOOGLE ANALYTICS 4 — la source des indicateurs d'audience du référentiel.
 *
 * POURQUOI CE SERVICE EXISTE. Poser la balise `gtag` sur le site remplit la console GA4,
 * mais pas le cockpit BET : les chiffres restent chez Google. L'API Data les rapatrie,
 * et c'est elle qui permet à `WEB-05` (part mobile), `WEB-06` (PageSpeed) et `WEB-07`
 * (référencement) d'apparaître à côté du chiffre d'affaires, dans le même écran.
 *
 * DEUX SECRETS SONT NÉCESSAIRES, tous deux dans l'environnement du serveur :
 *   · `GA4_PROPERTY_ID`          — l'identifiant numérique de la propriété (pas le G-XXXX)
 *   · `GA4_CREDENTIALS_JSON`     — la clé du compte de service, en JSON sur une ligne
 *
 * SANS EUX, LE SERVICE SE TAIT. `ga4Configure()` rend `false`, les appels renvoient `null`,
 * et le cockpit affiche ses indicateurs GA4 comme « en attente de configuration » plutôt
 * que de tomber en erreur. Aucun écran ne casse tant que la propriété n'est pas branchée.
 *
 * ⚠️ LE COMPTE DE SERVICE DOIT ÊTRE AJOUTÉ COMME LECTEUR de la propriété GA4
 * (Admin › Accès à la propriété › Ajouter, rôle « Lecteur »). Sans cela l'API répond 403
 * avec un message qui ne dit pas que c'est un problème de droits.
 */

const PROPERTY = (process.env.GA4_PROPERTY_ID || "").trim();

/** Les identifiants, lus une seule fois - un JSON malformé ne doit pas casser le serveur. */
const IDENTIFIANTS = (() => {
  const brut = process.env.GA4_CREDENTIALS_JSON;
  if (!brut) return null;
  try {
    const c = JSON.parse(brut);
    // La clé privée d'un JSON d'environnement contient des `\n` échappés : sans cette
    // restitution, l'authentification échoue sur une erreur de format de clé, très
    // difficile à relier à sa cause.
    if (c.private_key) c.private_key = c.private_key.replace(/\\n/g, "\n");
    return c;
  } catch {
    console.warn("[ga4] GA4_CREDENTIALS_JSON illisible — la lecture GA4 restera désactivée");
    return null;
  }
})();

export const ga4Configure = () => !!(PROPERTY && IDENTIFIANTS);

let client = null;
const getClient = () => {
  if (!ga4Configure()) return null;
  if (!client) client = new BetaAnalyticsDataClient({ credentials: IDENTIFIANTS });
  return client;
};

/** `2026-09-01` — GA4 accepte aussi `NdaysAgo`, mais une date explicite se relit mieux. */
const ilYA = (jours) => {
  const d = new Date();
  d.setDate(d.getDate() - jours);
  return d.toISOString().slice(0, 10);
};

/**
 * Les métriques d'audience du référentiel, en UN seul appel.
 *
 * L'API facture au rapport, pas à la métrique : demander la part mobile, le canal
 * d'acquisition et la durée de session séparément coûterait trois fois plus de quota
 * pour la même information.
 *
 * @param {number} jours  profondeur d'analyse (30 par défaut)
 * @returns {Promise<object|null>} `null` si GA4 n'est pas configuré ou si l'appel échoue
 */
export async function lireAudienceGA4(jours = 30) {
  const c = getClient();
  if (!c) return null;

  try {
    const periode = [{ startDate: ilYA(jours), endDate: "today" }];

    const [parAppareil, parCanal, global] = await Promise.all([
      c.runReport({
        property: `properties/${PROPERTY}`,
        dateRanges: periode,
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "sessions" }],
      }),
      c.runReport({
        property: `properties/${PROPERTY}`,
        dateRanges: periode,
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
      }),
      c.runReport({
        property: `properties/${PROPERTY}`,
        dateRanges: periode,
        metrics: [
          { name: "totalUsers" }, { name: "sessions" }, { name: "bounceRate" },
          { name: "averageSessionDuration" }, { name: "screenPageViewsPerSession" },
        ],
      }),
    ]);

    const lignes = (rep, cle) => Object.fromEntries(
      (rep?.[0]?.rows || []).map((r) => [r.dimensionValues?.[0]?.value || "(inconnu)", Number(r.metricValues?.[0]?.value || 0)]),
    );

    const appareils = lignes(parAppareil);
    const canaux = lignes(parCanal);
    const g = global?.[0]?.rows?.[0]?.metricValues || [];
    const totalSessions = Object.values(appareils).reduce((s, v) => s + v, 0);

    return {
      periode_jours: jours,
      visiteurs_uniques: Number(g[0]?.value || 0),
      sessions: Number(g[1]?.value || 0),
      // GA4 rend un taux entre 0 et 1 ; le référentiel raisonne en pourcentage.
      taux_rebond: Number(((Number(g[2]?.value || 0)) * 100).toFixed(1)),
      duree_moyenne_s: Number(Number(g[3]?.value || 0).toFixed(0)),
      pages_par_session: Number(Number(g[4]?.value || 0).toFixed(1)),
      part_mobile: totalSessions ? Number((((appareils.mobile || 0) / totalSessions) * 100).toFixed(1)) : null,
      part_organique: (() => {
        const total = Object.values(canaux).reduce((s, v) => s + v, 0);
        const orga = (canaux["Organic Search"] || 0) + (canaux["Organic Social"] || 0);
        return total ? Number(((orga / total) * 100).toFixed(1)) : null;
      })(),
      appareils, canaux,
    };
  } catch (e) {
    // On ne relance PAS : une propriété mal partagée ou un quota dépassé ne doit pas
    // priver le cockpit de ses vingt-deux autres indicateurs.
    console.warn("[ga4] lecture impossible :", e.message || e);
    return null;
  }
}
