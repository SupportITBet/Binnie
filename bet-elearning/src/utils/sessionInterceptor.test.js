import { pageConnexionDe } from "../constants/roles";

/* ══ CE QUI A ÉCHOUÉ TROIS FOIS ══════════════════════════════════════════════════════════
   La déconnexion automatique d'un apprenant le renvoyait vers `/connexion`, le portail de
   l'administration BET, au lieu de `/connexion/apprenant`. Deux correctifs ont visé la
   résolution du rôle — elle n'a jamais été en cause, comme le montre le premier test.

   La cause était l'IDENTITÉ : l'intercepteur lisait `admin_profil` (localStorage), écrit par
   les cinq pages de connexion dédiées et effacé par personne. Dans un navigateur ayant servi
   à un coach ou à un admin, c'est ce profil périmé qui gagnait — et ces rôles n'ayant
   délibérément pas de page de connexion dédiée, `pageConnexionDe` rend `null` et le repli
   `/connexion` s'appliquait.

   Ces tests figent les deux moitiés de la règle : la table des pages, et l'ordre des
   sources. */

describe("la résolution du rôle n'a jamais été le problème", () => {
  it("un apprenant a bien sa page dédiée", () => {
    expect(pageConnexionDe("apprenant")).toBe("/connexion/apprenant");
  });

  it("le parent et l'entreprise aussi", () => {
    expect(pageConnexionDe("parent")).toBe("/connexion/parent");
    expect(pageConnexionDe("client_entreprise")).toBe("/connexion/entreprise");
  });

  it("un coach ou un admin n'en a pas — c'est un choix, et c'est là que naît le repli", () => {
    // Ce `null` est correct. Le défaut était de l'obtenir en résolvant le rôle d'un AUTRE
    // compte que celui réellement connecté.
    expect(pageConnexionDe("professeur_titulaire")).toBeNull();
    expect(pageConnexionDe("manager")).toBeNull();
    expect(pageConnexionDe("super_admin")).toBeNull();
  });
});

/* L'ordre des sources, reproduit tel que l'intercepteur l'applique. On le teste ici plutôt
   qu'à travers le module entier, qui patche `window.fetch` au chargement. */
function resoudrePage({ roleCourant, betProfilMock, adminProfil }) {
  const sources = [
    () => (roleCourant ? JSON.stringify({ role: roleCourant }) : null),
    () => betProfilMock,
    () => adminProfil,
  ];
  for (const lire of sources) {
    try {
      const p = JSON.parse(lire() || "null");
      const page = p?.role ? pageConnexionDe(p.role) : null;
      if (page) return page;
    } catch { /* source illisible */ }
  }
  return "/connexion";
}

describe("l'ordre des sources d'identité", () => {
  const COACH = JSON.stringify({ role: "professeur_titulaire" });
  const APPRENANT = JSON.stringify({ role: "apprenant" });

  it("LE CAS DU BUG : le rôle vivant gagne contre un admin_profil périmé", () => {
    // Le scénario exact du poste de test : on s'est connecté comme coach, puis comme
    // apprenant. `admin_profil` porte encore le coach.
    expect(resoudrePage({ roleCourant: "apprenant", betProfilMock: null, adminProfil: COACH }))
      .toBe("/connexion/apprenant");
  });

  it("sans rôle vivant, le profil de l'onglet gagne contre celui du navigateur", () => {
    // `bet_profil_mock` est en sessionStorage, propre à l'onglet ; `admin_profil` en
    // localStorage, partagé par tous les comptes qui sont passés par là.
    expect(resoudrePage({ roleCourant: null, betProfilMock: APPRENANT, adminProfil: COACH }))
      .toBe("/connexion/apprenant");
  });

  it("admin_profil ne sert qu'en dernier recours", () => {
    expect(resoudrePage({ roleCourant: null, betProfilMock: null,
      adminProfil: JSON.stringify({ role: "client_entreprise" }) })).toBe("/connexion/entreprise");
  });

  it("aucune identité lisible : repli assumé sur le portail", () => {
    expect(resoudrePage({ roleCourant: null, betProfilMock: null, adminProfil: null })).toBe("/connexion");
    expect(resoudrePage({ roleCourant: null, betProfilMock: "{pas du json", adminProfil: null })).toBe("/connexion");
  });

  it("un coach connecté va bien au portail, lui", () => {
    // Le repli n'est un défaut que lorsqu'il s'applique à quelqu'un qui a sa propre page.
    expect(resoudrePage({ roleCourant: "professeur_titulaire", betProfilMock: null, adminProfil: null }))
      .toBe("/connexion");
  });
});

/* Le second volet du défaut : `admin_refresh` passé à `setSession()` pour un apprenant
   ressuscitait la session du compte précédent. La règle qui s'y oppose, reproduite. */
const ROLES_SANS_SESSION_SUPABASE = ["client_entreprise", "professeur_titulaire", "professeur_remplacant"];
const estCompteServeur = (role) =>
  !!role && (role.startsWith("admin") || ROLES_SANS_SESSION_SUPABASE.includes(role)
    || !["apprenant", "parent"].includes(role));

describe("à qui appartiennent les jetons admin_*", () => {
  it("un apprenant et un parent rafraîchissent leur PROPRE session Supabase", () => {
    expect(estCompteServeur("apprenant")).toBe(false);
    expect(estCompteServeur("parent")).toBe(false);
  });

  it("les comptes qui se connectent côté serveur en ont réellement besoin", () => {
    for (const r of ["admin_elearning", "manager", "super_admin", "client_entreprise", "professeur_titulaire"]) {
      expect(estCompteServeur(r)).toBe(true);
    }
  });

  it("sans rôle connu, on ne prête les jetons de personne", () => {
    expect(estCompteServeur(null)).toBe(false);
    expect(estCompteServeur("")).toBe(false);
  });
});
