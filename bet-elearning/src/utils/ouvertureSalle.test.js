import { accesSalle, seanceClose, enDirect, formaterAttente, MINUTES_OUVERTURE_SALLE } from "./ouvertureSalle";

/* Cette règle décide si un bouton « Rejoindre » s'affiche, sur SEPT écrans : apprenant,
   parent, coach, assistante e-learning, onboarding, superviseur, deputy. Une erreur ici se
   paie soit d'un apprenant devant une porte fermée, soit — c'est le cas qui s'est produit —
   d'un superviseur à qui l'on dit qu'un cours clôturé est encore joignable. */

const T = (iso) => new Date(iso);
const LE_JOUR = "2026-10-13";
const A_20H = T(`${LE_JOUR}T20:00:00`);
const enLigne = (extra = {}) => ({ date: LE_JOUR, heure_debut: "20:00:00", type: "cours", statut: "planifiee", ...extra });

describe("le cas qui a motivé ce contrôle", () => {
  it("une séance clôturée par le coach n'est plus joignable", () => {
    // Constaté dans l'onglet Plannings : « 🔗 Rejoindre » survivait à la clôture, parce que
    // la règle ne regardait que l'heure et jamais le statut.
    const a = accesSalle(enLigne({ statut: "realisee", terminee_at: `${LE_JOUR}T19:53:09Z` }), A_20H);
    expect(a.joignable).toBe(false);
    expect(a.close).toBe(true);
    expect(a.raison).toMatch(/terminée/i);
  });

  it("une séance annulée le dit, et ne propose rien", () => {
    const a = accesSalle(enLigne({ statut: "annulee" }), A_20H);
    expect(a.joignable).toBe(false);
    expect(a.raison).toMatch(/annulée/i);
  });

  it("la clôture prime même sur le présentiel", () => {
    // Sinon une séance présentielle terminée restait annoncée comme accessible, le
    // présentiel étant traité en « jamais verrouillé ».
    expect(accesSalle({ ...enLigne(), type: "presentiel", statut: "realisee" }, A_20H).joignable).toBe(false);
  });
});

describe("le verrou des dix minutes", () => {
  it("fermé une minute avant l'ouverture", () => {
    // `minutesAvant` compte avant l'OUVERTURE de la salle, pas avant le début du cours :
    // à 19 h 49 il reste une minute d'attente, pas onze.
    const a = accesSalle(enLigne(), T(`${LE_JOUR}T19:49:00`));
    expect(a.joignable).toBe(false);
    expect(a.minutesAvant).toBe(1);
    expect(a.libelleAttente).toBe("dans 1 min");
  });

  it("une séance du lendemain annonce l'attente en jours", () => {
    const a = accesSalle(enLigne({ date: "2026-10-23" }), A_20H);
    expect(a.joignable).toBe(false);
    expect(a.libelleAttente).toMatch(/dans \d+ j/);
  });

  it("ouvert pile à H-10", () => {
    expect(accesSalle(enLigne(), T(`${LE_JOUR}T19:50:00`)).joignable).toBe(true);
    expect(MINUTES_OUVERTURE_SALLE).toBe(10);
  });

  it("ouvert pendant le cours", () => {
    expect(accesSalle(enLigne(), T(`${LE_JOUR}T20:30:00`)).joignable).toBe(true);
  });
});

describe("les exceptions volontaires", () => {
  it("une séance démarrée par le coach est joignable avant l'heure prévue", () => {
    // C'est le coach qui a ouvert la salle, et c'est ce moment-là qu'un superviseur observe.
    const a = accesSalle(enLigne({ statut: "en_cours", demarree_at: `${LE_JOUR}T19:30:00Z` }), T(`${LE_JOUR}T19:35:00Z`));
    expect(a.joignable).toBe(true);
    expect(a.enDirect).toBe(true);
  });

  it("une salle ouverte depuis plus de quatre heures n'est plus un direct", () => {
    // Elle reste « en_cours » en base indéfiniment : l'annoncer en direct ferait croire à un
    // cours en train de se tenir, des jours plus tard.
    const s = enLigne({ statut: "en_cours", demarree_at: `${LE_JOUR}T10:00:00Z` });
    expect(enDirect(s, T(`${LE_JOUR}T15:00:00Z`))).toBe(false);
  });

  it("le présentiel n'a pas de salle à verrouiller", () => {
    const a = accesSalle({ ...enLigne(), type: "presentiel" }, T(`${LE_JOUR}T08:00:00`));
    expect(a.joignable).toBe(true);
    expect(a.presentiel).toBe(true);
  });

  it("une date illisible ne verrouille pas", () => {
    // Le verrou protège d'une salle vide, il ne garde pas un secret : mieux vaut un bouton
    // de trop qu'un superviseur bloqué par une donnée qu'il ne peut pas corriger.
    expect(accesSalle({ heure_debut: "20:00", type: "cours" }, A_20H).joignable).toBe(true);
    expect(accesSalle({ date: "pas-une-date", heure_debut: "20:00" }, A_20H).joignable).toBe(true);
  });
});

describe("seanceClose", () => {
  it("reconnaît les quatre statuts de clôture", () => {
    for (const statut of ["realisee", "terminee", "annulee", "clos"]) {
      expect(seanceClose({ statut })).toBe(true);
    }
  });

  it("ne ferme pas une séance planifiée ni une séance en cours", () => {
    expect(seanceClose({ statut: "planifiee" })).toBe(false);
    // `terminee_at` posé alors que la séance est repassée en cours : le statut tranche.
    expect(seanceClose({ statut: "en_cours", terminee_at: `${LE_JOUR}T19:00:00Z` })).toBe(false);
  });

  it("ferme sur terminee_at même sans statut explicite", () => {
    expect(seanceClose({ terminee_at: `${LE_JOUR}T19:53:09Z` })).toBe(true);
  });
});

describe("formaterAttente", () => {
  it("dit l'ordre de grandeur, pas la minute exacte au-delà de quelques heures", () => {
    expect(formaterAttente(7)).toBe("dans 7 min");
    expect(formaterAttente(135)).toBe("dans 2 h 15");
    expect(formaterAttente(120)).toBe("dans 2 h");
    expect(formaterAttente(4320)).toBe("dans 3 j");
    expect(formaterAttente(0)).toBe("");
  });
});
