/**
 * ============================================================================
 *  IMPORT EN MASSE - pilotage côté navigateur
 * ============================================================================
 *
 *  Un seul point d'entrée pour les 8 imports des dashboards Commercial et
 *  Onboarding (classes, groupes, apprenants, global, coaching privé ×2).
 *
 *  Avant, chaque écran refaisait sa propre boucle : pour UNE ligne de coaching
 *  privé, 16 allers-retours HTTP (1 dossier, 12 versements, 1 classe, 1
 *  rattachement, 1 apprenant). Mesuré : 40 lignes = 640 requêtes = 25 minutes.
 *  Et comme la même logique était recopiée dans 8 endroits, chaque correctif
 *  devait être appliqué 8 fois - trois fois dans la même journée pour le profil
 *  enfant, la barre de progression puis le verrou de fermeture.
 *
 *  Ici, le navigateur ne fait plus que découper le lot et suivre l'avancement :
 *  tout le travail se passe côté serveur (POST /api/imports/:id/lot), qui
 *  garantit l'atomicité par ligne, le silence (pas d'email par versement) et la
 *  traçabilité permettant d'annuler le lot.
 * ============================================================================
 */

/** Taille d'un paquet. Compromis : assez gros pour amortir l'aller-retour,
 *  assez petit pour que la progression reste fluide et pour rester loin de la
 *  limite de temps d'exécution des fonctions serverless (Vercel). */
export const TAILLE_LOT_DEFAUT = 5;

const entetes = (token) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

/**
 * Déroule un import complet : ouverture, envoi des paquets, clôture.
 *
 * @param {object}   o
 * @param {string}   o.apiUrl      base de l'API
 * @param {string}   o.token       jeton admin
 * @param {string}   o.type        classe | groupe | apprenant | prive_presentiel | prive_en_ligne
 * @param {string}   o.fichierNom  nom du fichier importé (pour l'historique)
 * @param {object}   o.contexte    centre_id, assistante_id, type_cours, source…
 * @param {Array}    o.lignes      lignes valides à créer
 * @param {number}   [o.tailleLot]
 * @param {Function} [o.onProgress] (pourcentage, { traites, total, avancement })
 * @param {Function} [o.doitArreter] appelée entre 2 paquets : renvoyer true pour interrompre
 * @param {string}   [o.importIdExistant] verse dans un lot DÉJÀ ouvert au lieu d'en créer un
 *                   (l'Import global ouvre son lot dès la lecture du fichier, pour que les
 *                   classes qu'il crée portent le même import_id que ses apprenants)
 * @param {string}   [o.typeLot] type propre à ces paquets, s'il diffère de celui du lot
 * @param {boolean}  [o.cloturer=true] passer false quand d'autres paquets suivront
 *
 * @returns {Promise<{importId:string, resultats:Array, interrompu:boolean}>}
 */
export async function lancerImport({
  apiUrl, token, type, fichierNom, contexte = {}, lignes,
  tailleLot = TAILLE_LOT_DEFAUT, onProgress, doitArreter,
  importIdExistant = null, typeLot = null, cloturer = true,
}) {
  if (!Array.isArray(lignes) || !lignes.length) {
    throw new Error("Aucune ligne à importer");
  }

  // 1. Ouvrir l'import - il existe en base dès maintenant, donc même une
  //    interruption brutale laisse une trace consultable, relançable et annulable.
  //    Les lignes sont conservées côté serveur : c'est ce qui permet de relancer un
  //    lot interrompu sans avoir à retrouver le fichier d'origine.
  let importId = importIdExistant;
  if (!importId) {
    const rOuv = await fetch(`${apiUrl}/api/imports`, {
      method: "POST", headers: entetes(token),
      body: JSON.stringify({
        type, fichier_nom: fichierNom, nb_lignes: lignes.length, contexte, lignes_source: lignes,
      }),
    });
    const dOuv = await rOuv.json().catch(() => ({}));
    if (!rOuv.ok) throw new Error(dOuv.error || "Impossible d'ouvrir l'import");
    importId = dOuv.import.id;
  }

  // 2. Envoyer les paquets.
  const resultats = [];
  let interrompu = false;
  onProgress?.(0, { traites: 0, total: lignes.length });

  for (let i = 0; i < lignes.length; i += tailleLot) {
    if (doitArreter?.()) { interrompu = true; break; }

    const paquet = lignes.slice(i, i + tailleLot);
    try {
      const r = await fetch(`${apiUrl}/api/imports/${importId}/lot`, {
        method: "POST", headers: entetes(token),
        body: JSON.stringify(typeLot ? { lignes: paquet, type: typeLot } : { lignes: paquet }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        // Un paquet refusé ne doit pas faire disparaître les lignes qu'il
        // contenait du rapport : elles sont reportées en erreur, nommément.
        paquet.forEach((l) => resultats.push({
          statut: "erreur",
          nom: [l.prenom, l.nom].filter(Boolean).join(" ") || l.nom || "-",
          detail: d.error || `Erreur serveur (${r.status})`,
        }));
      } else {
        resultats.push(...(d.resultats || []));
      }
    } catch (err) {
      paquet.forEach((l) => resultats.push({
        statut: "erreur",
        nom: [l.prenom, l.nom].filter(Boolean).join(" ") || l.nom || "-",
        detail: err.message,
      }));
    }

    const traites = Math.min(i + tailleLot, lignes.length);
    onProgress?.(Math.round((traites / lignes.length) * 100), { traites, total: lignes.length });
  }

  // 3. Clôturer - déclenche l'unique notification de synthèse côté serveur.
  //    Sautée quand d'autres paquets suivront dans le même lot (Import global :
  //    les classes d'abord, les apprenants ensuite).
  if (cloturer) {
    await fetch(`${apiUrl}/api/imports/${importId}/terminer`, {
      method: "POST", headers: entetes(token),
      body: JSON.stringify({ interrompu }),
    }).catch(() => {});
  }

  return { importId, resultats, interrompu };
}

/**
 * Ouvre un lot SANS rien traiter, pour y verser des paquets ensuite.
 * Utilisé par l'Import global, qui crée ses classes dès la lecture du fichier : sans
 * lot déjà ouvert, ces classes naîtraient hors du moteur et sans import_id - donc
 * invisibles à l'annulation, qui laisserait des classes vides derrière elle.
 */
export async function ouvrirImport({ apiUrl, token, type, fichierNom, nbLignes = 0, contexte = {} }) {
  const r = await fetch(`${apiUrl}/api/imports`, {
    method: "POST", headers: entetes(token),
    body: JSON.stringify({ type, fichier_nom: fichierNom, nb_lignes: nbLignes, contexte }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Impossible d'ouvrir l'import");
  return d.import.id;
}

/**
 * Annule un import : supprime tout ce que CE lot a créé, et rien d'autre
 * (filtre serveur sur `import_id`, donc aucune saisie manuelle ne peut être
 * touchée).
 */
export async function annulerImport({ apiUrl, token, importId }) {
  const r = await fetch(`${apiUrl}/api/imports/${importId}/annuler`, {
    method: "POST", headers: entetes(token),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Annulation impossible");
  return d.supprime;
}

/**
 * Historique des imports. Le serveur cloisonne : chacune ne reçoit que ses propres
 * lots, sauf les rôles à vue totale - annuler celui d'une collègue est impossible.
 */
export async function listerImports({ apiUrl, token, type, limit = 30 }) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  params.set("limit", String(limit));
  const r = await fetch(`${apiUrl}/api/imports?${params}`, { headers: entetes(token) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Lecture de l'historique impossible");
  return d.imports || [];
}

/**
 * Récupère les lignes d'un import passé pour le relancer.
 * Rejouer est sans danger : l'idempotence saute les lignes déjà créées et ne crée
 * que les manquantes - c'est précisément le cas d'un lot interrompu en cours de route.
 */
export async function lignesDeLImport({ apiUrl, token, importId }) {
  const r = await fetch(`${apiUrl}/api/imports/${importId}`, { headers: entetes(token) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Import introuvable");
  const job = d.import || {};
  if (!Array.isArray(job.lignes_source) || !job.lignes_source.length) {
    throw new Error("Les lignes de cet import n'ont pas été conservées - relancez-le depuis le fichier Excel");
  }
  return job;
}

/**
 * Efface une entrée du journal - jamais les données importées.
 * Le serveur refuse tant que le lot a des données vivantes : il faut l'annuler
 * d'abord, sinon ses lignes deviendraient impossibles à retrouver en bloc.
 */
export async function supprimerImport({ apiUrl, token, importId }) {
  const r = await fetch(`${apiUrl}/api/imports/${importId}`, {
    method: "DELETE", headers: entetes(token),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Suppression impossible");
  return true;
}

/**
 * Marque un lot interrompu comme repris, apres qu'il a ete relance.
 * Sans cela son alerte "a relancer" resterait allumee indefiniment : la relance cree
 * un NOUVEAU lot, et l'ancien ne peut pas etre efface puisqu'il a des donnees vivantes.
 */
export async function marquerImportRepris({ apiUrl, token, importId }) {
  await fetch(`${apiUrl}/api/imports/${importId}/marquer-repris`, {
    method: "POST", headers: entetes(token),
  }).catch(() => {});
}

/** Une entrée n'est effaçable que si elle ne laisse rien derrière elle. */
export const peutEtreEfface = (job) => job.statut === "annule" || (job.nb_ok || 0) === 0;

/**
 * Délai au-delà duquel « Annuler » disparaît de l'historique.
 *
 * Annuler supprime TOUT ce que le lot a créé : dossiers, versements, classes, comptes
 * d'accès. C'est le bon geste dans les heures qui suivent un import raté, quand rien
 * n'a encore vécu. Passé ce délai les apprenants ont été assignés, ont payé, ont été
 * transférés : le lot n'est plus une unité qu'on retire proprement, et un bouton
 * destructeur laissé à côté d'imports anciens n'attend que le clic de trop. Au-delà,
 * la suppression passe par un administrateur, qui voit l'ensemble des conséquences.
 */
export const FENETRE_ANNULATION_HEURES = 48;

const ageEnHeures = (job) => {
  const t = Date.parse(job?.created_at);
  return Number.isFinite(t) ? (Date.now() - t) / 3_600_000 : Infinity;
};

/** Reste-t-il dans la fenêtre où la commerciale peut annuler elle-même son lot ? */
export const peutEtreAnnule = (job) =>
  job.statut !== "annule" && ageEnHeures(job) < FENETRE_ANNULATION_HEURES;

/**
 * Relancer n'a de sens que sur un lot incomplet : interrompu (créer ce qui manque)
 * ou annulé (tout refaire). Sur un lot terminé, l'idempotence renverrait chaque ligne
 * en « ignoré » - un bouton qui ne fait rien, mais qui laisse croire le contraire.
 */
export const peutEtreRelance = (job) => job.statut !== "termine";

/** Libellés d'affichage des statuts d'un import. */
export const STATUT_IMPORT = {
  en_cours:   { label: "En cours",    couleur: "#0891b2", fond: "#e0f2fe" },
  termine:    { label: "Terminé",     couleur: "#16a34a", fond: "#dcfce7" },
  interrompu: { label: "Interrompu",  couleur: "#92400e", fond: "#fef3c7" },
  repris:     { label: "Repris",      couleur: "#4338ca", fond: "#e0e7ff" },
  annule:     { label: "Annulé",      couleur: "#dc2626", fond: "#fee2e2" },
};

/** Compte les lignes par statut, pour les libellés de résultat. */
export const compterResultats = (resultats = []) => ({
  ok:     resultats.filter((r) => r.statut === "ok").length,
  erreur: resultats.filter((r) => r.statut === "erreur").length,
  ignore: resultats.filter((r) => r.statut === "ignore").length,
});
