import { analyserLienVisio, lienVisioExploitable } from "./lienVisio";

describe("le cas qui a motivé ce contrôle", () => {
  it("refuse un gabarit Zoom resté vide", () => {
    // Le bouton « Zoom » de l'écran insère ce préfixe ; sans identifiant collé derrière,
    // le lien a toutes les apparences d'une URL valide et n'ouvre rien.
    const r = analyserLienVisio("https://zoom.us/j/");
    expect(r.valide).toBe(false);
    expect(r.plateforme).toBe("Zoom");
    expect(r.raison).toMatch(/identifiant/);
  });

  it("accepte le même lien une fois l'identifiant collé", () => {
    expect(lienVisioExploitable("https://zoom.us/j/98765432109")).toBe(true);
  });

  it("refuse un identifiant de réunion qui n'en est pas un", () => {
    // Constaté en base sur quatre séances à venir : « https://zoom.us/j/nouveau » satisfaisait
    // la règle « quelque chose après le préfixe » et n'ouvre pourtant aucune réunion. Un
    // identifiant Zoom est un nombre de 9 à 11 chiffres.
    const r = analyserLienVisio("https://zoom.us/j/nouveau");
    expect(r.valide).toBe(false);
    expect(r.plateforme).toBe("Zoom");
    expect(r.raison).toMatch(/9 à 11 chiffres/);
  });

  it("refuse un identifiant trop court", () => {
    expect(lienVisioExploitable("https://zoom.us/j/123")).toBe(false);
  });

  it("n'applique pas la règle numérique aux salles personnelles", () => {
    // /my/ et /w/ portent un nom de salle alphanumérique parfaitement légitime.
    expect(lienVisioExploitable("https://zoom.us/my/salle-bet")).toBe(true);
    expect(lienVisioExploitable("https://zoom.us/w/bet-anglais")).toBe(true);
  });
});

describe("plateformes reconnues", () => {
  it("accepte les liens complets", () => {
    expect(lienVisioExploitable("https://zoom.us/j/1234567890?pwd=abc")).toBe(true);
    expect(lienVisioExploitable("https://zoom.us/my/salle-bet")).toBe(true);
    expect(lienVisioExploitable("https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(lienVisioExploitable("https://meet.jit.si/BetAnglaisA1")).toBe(true);
    expect(lienVisioExploitable("https://whereby.com/bet-coaching")).toBe(true);
  });

  it("nomme la plateforme détectée", () => {
    expect(analyserLienVisio("https://zoom.us/j/123").plateforme).toBe("Zoom");
    expect(analyserLienVisio("https://meet.google.com/abc-defg-hij").plateforme).toBe("Meet");
  });
});

describe("cas refusés", () => {
  it("un champ vide", () => {
    expect(analyserLienVisio("").valide).toBe(false);
    expect(analyserLienVisio(null).valide).toBe(false);
    expect(analyserLienVisio(undefined).valide).toBe(false);
  });

  it("une adresse sans protocole", () => {
    expect(analyserLienVisio("zoom.us/j/123").valide).toBe(false);
  });

  it("un domaine sans chemin - rien à rejoindre", () => {
    expect(analyserLienVisio("https://exemple.com").valide).toBe(false);
    expect(analyserLienVisio("https://exemple.com/").valide).toBe(false);
  });

  it("une chaîne qui n'est pas une adresse", () => {
    expect(analyserLienVisio("https://").valide).toBe(false);
  });
});

describe("cas acceptés malgré l'inconnu", () => {
  it("une plateforme non listée reste acceptée si elle porte un chemin", () => {
    // On ne connaît pas tous les outils : refuser l'inconnu bloquerait un coach qui
    // utilise un service légitime.
    expect(lienVisioExploitable("https://visio.exemple.ci/salle/bet-a1")).toBe(true);
  });

  it("le présentiel n'est pas un lien manquant", () => {
    const r = analyserLienVisio("presentiel");
    expect(r.valide).toBe(true);
    expect(r.raison).toBe("présentiel");
  });

  it("tolère les espaces autour", () => {
    expect(lienVisioExploitable("  https://zoom.us/j/1234567890  ")).toBe(true);
  });
});
