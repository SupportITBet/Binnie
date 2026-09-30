import { clearAllSessionStorage, retirerBanniereExpiration, sessionCourante } from "./session";

const poserBanniere = () => {
  const b = document.createElement("div");
  b.id = "bet-prolonger-session";
  b.innerHTML = '<button id="bet-prolonger-btn">Prolonger ma session</button>';
  document.body.appendChild(b);
  return b;
};

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("retirerBanniereExpiration", () => {
  it("retire le bandeau « Session bientôt expirée »", () => {
    poserBanniere();
    expect(document.getElementById("bet-prolonger-session")).not.toBeNull();
    retirerBanniereExpiration();
    expect(document.getElementById("bet-prolonger-session")).toBeNull();
  });

  it("ne lève pas quand aucun bandeau n'est affiché", () => {
    expect(() => retirerBanniereExpiration()).not.toThrow();
  });
});

describe("clearAllSessionStorage", () => {
  it("fait disparaître le bandeau en même temps que les jetons", () => {
    // Le défaut corrigé : le bandeau vit hors de React, survivait au changement de route
    // et restait affiché sur la page de code d'accès, bouton « Prolonger » actif.
    localStorage.setItem("admin_token", "jwt");
    localStorage.setItem("admin_refresh", "refresh");
    poserBanniere();

    clearAllSessionStorage();

    expect(localStorage.getItem("admin_token")).toBeNull();
    expect(document.getElementById("bet-prolonger-session")).toBeNull();
    expect(document.getElementById("bet-prolonger-btn")).toBeNull();
  });

  it("efface les jetons de tous les portails, pas seulement du staff", () => {
    localStorage.setItem("admin_token", "a");
    localStorage.setItem("coach_token", "c");
    localStorage.setItem("user_token", "u");

    clearAllSessionStorage();

    expect(localStorage.getItem("admin_token")).toBeNull();
    expect(localStorage.getItem("coach_token")).toBeNull();
    expect(localStorage.getItem("user_token")).toBeNull();
  });
});

describe("sessionCourante", () => {
  it("reconnaît un coach à ses propres clés", () => {
    localStorage.setItem("coach_token", "jwt-coach");
    localStorage.setItem("coach_refresh", "refresh-coach");
    const s = sessionCourante();
    expect(s.portail).toBe("coach");
    expect(s.cleAcces).toBe("coach_token");
    expect(s.access).toBe("jwt-coach");
    expect(s.refresh).toBe("refresh-coach");
  });

  it("retombe sur le portail staff sinon", () => {
    localStorage.setItem("admin_token", "jwt-admin");
    localStorage.setItem("admin_refresh", "refresh-admin");
    const s = sessionCourante();
    expect(s.portail).toBe("admin");
    expect(s.cleAcces).toBe("admin_token");
    expect(s.access).toBe("jwt-admin");
  });

  it("donne la priorité au coach quand les deux cohabitent", () => {
    // Un même navigateur peut porter les deux sessions : le coach prime, c'est lui
    // qui est réellement à l'écran quand coach_token existe.
    localStorage.setItem("admin_token", "jwt-admin");
    localStorage.setItem("coach_token", "jwt-coach");
    expect(sessionCourante().portail).toBe("coach");
  });

  it("ne renvoie jamais undefined quand rien n'est stocké", () => {
    const s = sessionCourante();
    expect(s.portail).toBe("admin");
    expect(s.access).toBe("");
    expect(s.refresh).toBe("");
  });

  /* Le portail apprenant manquait, et la fonction retombait donc sur « admin » : à
     l'expiration, l'intercepteur 401 renvoyait l'apprenant vers l'accès du personnel,
     c'est-à-dire vers le code d'entrée `/access`. Ces trois cas verrouillent le retour
     vers sa propre page de connexion. */
  it("reconnaît un apprenant à ses propres clés", () => {
    localStorage.setItem("user_token", "jwt-apprenant");
    localStorage.setItem("user_refresh", "refresh-apprenant");
    const s = sessionCourante();
    expect(s.portail).toBe("apprenant");
    expect(s.cleAcces).toBe("user_token");
    expect(s.access).toBe("jwt-apprenant");
    expect(s.refresh).toBe("refresh-apprenant");
  });

  it("distingue le parent de l'apprenant, qui partagent les mêmes clés", () => {
    localStorage.setItem("user_token", "jwt-parent");
    localStorage.setItem("user_profil_type", "parent");
    expect(sessionCourante().portail).toBe("parent");
  });

  it("donne la priorité au personnel quand staff et apprenant cohabitent", () => {
    // Reproduit le comportement d'avant : sur un poste partagé, c'est le personnel
    // qui est réellement à l'écran quand admin_token existe.
    localStorage.setItem("user_token", "jwt-apprenant");
    localStorage.setItem("admin_token", "jwt-admin");
    expect(sessionCourante().portail).toBe("admin");
  });
});
