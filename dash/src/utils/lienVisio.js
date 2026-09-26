/**
 * Un lien de visioconférence est-il réellement utilisable ?
 *
 * Le contrôle se limitait à « le champ est-il vide ». Or l'écran de création propose des
 * préfixes cliquables - « Zoom » insère `https://zoom.us/j/` - et le coach qui oublie de
 * coller son identifiant enregistre une URL qui a toutes les apparences d'un lien valide.
 * Elle passe tous les tests de présence, et échoue au seul moment qui compte : quand
 * l'apprenant clique dessus, trente secondes avant le cours.
 *
 * On vérifie donc qu'il reste quelque chose APRÈS le préfixe de la plateforme - un
 * identifiant de réunion, un code, un nom de salle. C'est ce qui distingue un lien d'un
 * gabarit resté vide.
 */

/**
 * Motifs des plateformes courantes : le groupe capturant est l'identifiant attendu.
 *
 * Zoom est traité en deux temps, et ce n'est pas un détail : exiger seulement « quelque chose
 * après le préfixe » laissait passer `https://zoom.us/j/nouveau`, qui a l'apparence d'un lien
 * et n'ouvre aucune réunion. Un identifiant de réunion Zoom (`/j/`, `/s/`) est un nombre de
 * 9 à 11 chiffres. Une salle personnelle (`/my/`, `/w/`) porte en revanche un nom
 * alphanumérique parfaitement légitime - la même règle y interdirait des liens valides.
 */
const MOTIFS = [
  { nom: "Zoom",   test: /zoom\.us\/(?:j|s)\/(\d{9,11})(?:[/?#]|$)/i, prefixe: /zoom\.us\/(?:j|s)\//i,
    raison: "lien Zoom sans identifiant de réunion valide (9 à 11 chiffres attendus)" },
  { nom: "Zoom",   test: /zoom\.us\/(?:my|w)\/([^/?#\s]+)/i,               prefixe: /zoom\.us\/(?:my|w)\//i },
  { nom: "Teams",  test: /teams\.(?:microsoft|live)\.com\/.*\/([^/?#\s]{6,})/i, prefixe: /teams\.(?:microsoft|live)\.com\//i },
  { nom: "Meet",   test: /meet\.google\.com\/([a-z0-9-]{8,})/i,            prefixe: /meet\.google\.com\//i },
  { nom: "Whereby", test: /whereby\.com\/([^/?#\s]+)/i,                    prefixe: /whereby\.com\//i },
  { nom: "Jitsi",  test: /meet\.jit\.si\/([^/?#\s]+)/i,                    prefixe: /meet\.jit\.si\//i },
];

/**
 * @param {string} lien
 * @returns {{ valide: boolean, raison: string, plateforme: string|null }}
 */
export function analyserLienVisio(lien) {
  const url = String(lien || "").trim();

  if (!url) return { valide: false, raison: "aucun lien", plateforme: null };

  // Le présentiel est marqué par ce préfixe conventionnel : ce n'est pas un lien manquant.
  if (url.startsWith("presentiel")) return { valide: true, raison: "présentiel", plateforme: null };

  if (!/^https?:\/\//i.test(url)) {
    return { valide: false, raison: "ne commence pas par http(s)://", plateforme: null };
  }

  // Le préfixe est déclaré explicitement plutôt que dérivé du motif par découpage de chaîne :
  // cette dérivation cassait dès qu'un motif contenait une alternative ou un groupe non
  // capturant - exactement ce qu'exige la règle Zoom ci-dessus.
  for (const { nom, test, prefixe, raison } of MOTIFS) {
    if (!prefixe.test(url)) continue;
    const m = url.match(test);
    // La plateforme est reconnue : l'identifiant doit suivre, et être plausible.
    if (!m || !m[1]) {
      return { valide: false, raison: raison || `lien ${nom} sans identifiant de réunion`, plateforme: nom };
    }
    return { valide: true, raison: "", plateforme: nom };
  }

  // Plateforme inconnue : on exige au moins un chemin après le domaine, ce qui écarte
  // « https://exemple.com/ » sans pour autant refuser un outil qu'on ne connaît pas.
  try {
    const u = new URL(url);
    const reste = (u.pathname || "").replace(/\/+$/, "") + (u.search || "");
    if (!reste || reste === "") {
      return { valide: false, raison: "lien sans identifiant de réunion", plateforme: null };
    }
    return { valide: true, raison: "", plateforme: null };
  } catch {
    return { valide: false, raison: "adresse invalide", plateforme: null };
  }
}

/** Raccourci : le lien permet-il réellement de rejoindre le cours ? */
export const lienVisioExploitable = (lien) => analyserLienVisio(lien).valide;
