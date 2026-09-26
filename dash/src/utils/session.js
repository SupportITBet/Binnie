// src/utils/session.js
// Toutes les clés de session connues de l'app, tous portails confondus (admin/staff,
// coach, apprenant/parent). Chaque portail a son propre système de connexion avec ses
// propres clés localStorage, mais ils cohabitent tous dans le même navigateur - un
// logout qui n'efface que les clés de SON portail laisse les autres sessions actives
// en arrière-plan (ex: un apprenant connecté puis un admin qui se déconnecte plus tard
// dans le même navigateur garde un user_token apprenant valide). On efface donc tout
// à chaque déconnexion, quel que soit le portail.
const TOUTES_LES_CLES_SESSION = [
  // Staff / dashboards admin
  "admin_token", "admin_refresh", "admin_profil",
  // Coachs (EspaceProfesseur)
  "coach_token", "coach_refresh", "coach_profil",
  // Apprenants / parents
  "user_token", "user_refresh", "user", "user_profil_type",
  // Legacy / clés ponctuelles observées ailleurs dans le code
  "token", "bet_token", "apprenant_color", "prestationSession",
];

/**
 * Identifiant du bandeau « Session bientôt expirée » (créé dans App.js, hors de React).
 *
 * Il vit directement dans document.body : un changement de route côté client ne le
 * démonte donc pas, et il survivait à la déconnexion - jusqu'à rester affiché sur la page
 * de code d'accès, avec un bouton « Prolonger ma session » qui aurait rouvert la session
 * qu'on venait de fermer.
 */
const ID_BANNIERE_EXPIRATION = "bet-prolonger-session";

export function retirerBanniereExpiration() {
  if (typeof document === "undefined") return;
  document.getElementById(ID_BANNIERE_EXPIRATION)?.remove();
}

/**
 * La session en cours, quel que soit le portail.
 *
 * Les coachs se connectent avec `coach_token` / `coach_refresh`, le reste du personnel
 * avec `admin_token` / `admin_refresh`. Toute la gestion d'expiration - bandeau de
 * préavis, rafraîchissement, intercepteur 401 - ne lisait que les clés `admin_*` : un
 * coach n'était donc ni prévenu de l'expiration ni rattrapé, et se faisait éjecter en
 * pleine saisie, la perdant entièrement.
 *
 * Une seule fonction décide désormais de quelles clés il s'agit, au lieu de trois
 * références codées en dur qui pouvaient diverger.
 */
export function sessionCourante() {
  const coachAccess = localStorage.getItem("coach_token");
  if (coachAccess) {
    return {
      portail: "coach",
      cleAcces: "coach_token",
      cleRefresh: "coach_refresh",
      access: coachAccess,
      refresh: localStorage.getItem("coach_refresh") || "",
    };
  }
  return {
    portail: "admin",
    cleAcces: "admin_token",
    cleRefresh: "admin_refresh",
    access: localStorage.getItem("admin_token") || "",
    refresh: localStorage.getItem("admin_refresh") || "",
  };
}

export function clearAllSessionStorage() {
  TOUTES_LES_CLES_SESSION.forEach(k => localStorage.removeItem(k));
  // Retiré ici plutôt que dans la boucle de surveillance : la disparition devient
  // synchrone du clic sur « Déconnexion », au lieu d'attendre le prochain tick (15 s).
  retirerBanniereExpiration();
}
