// Mélange une couleur hex avec du noir/blanc - garantit un contraste lisible quel que soit le
// thème choisi par l'utilisateur (DashboardColorPicker) : un thème très clair (jaune pâle,
// cyan clair…) rend sinon le texte blanc illisible sur les dégradés d'en-tête/footer qui
// utilisaient la couleur brute comme point de fin du dégradé.
function melangerCouleur(hex, cible, ratio) {
  const h = (hex || "#0891b2").replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  const mix = (v) => Math.round(v * (1 - ratio) + cible * ratio);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
export const assombrirCouleur = (hex, ratio = 0.45) => melangerCouleur(hex, 0, ratio);
export const eclaircirCouleur = (hex, ratio = 0.35) => melangerCouleur(hex, 255, ratio);
