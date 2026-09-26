import { moisDuVersement, libelleMoisSolde } from "./moisDuVersement";

const plan = {
  mois_paiements: [
    { periode: "2025-09", label: "Septembre 2025", tranches: [
      { id: "t1", ref: "TP-5665", montant: 50000, statut: "paye" },
      { id: "t2", ref: "TP-5666", montant: 50000, statut: "paye" },
    ] },
    { periode: "2026-02", label: "Février 2026", tranches: [
      { id: "t3", ref: "TP-5675", montant: 50000, statut: "paye" },
      { id: "t4", ref: "TP-5676", montant: 50000, statut: "paye" },
    ] },
    { periode: "2026-08", label: "Août 2026", montant: 0, montant_initial: 100000,
      neutralise: { motif: "cloture_classe" }, tranches: [] },
  ],
};

describe("moisDuVersement", () => {
  // Le cas qui a motivé l'utilitaire : encaissé le 1er août, il solde février.
  it("rattache un versement au mois qu'il solde, pas à sa date d'encaissement", () => {
    const p = { ref_transaction: "TP-5676", date_paiement: "2026-08-01" };
    expect(moisDuVersement(p, plan)).toEqual({ periode: "2026-02", label: "Février 2026" });
  });

  it("ne confond pas deux tranches du même mois", () => {
    expect(moisDuVersement({ ref_transaction: "TP-5665" }, plan).periode).toBe("2025-09");
    expect(moisDuVersement({ ref_transaction: "TP-5675" }, plan).periode).toBe("2026-02");
  });

  it("tolère la casse et les espaces parasites", () => {
    expect(moisDuVersement({ ref_transaction: " tp-5676 " }, plan).periode).toBe("2026-02");
  });

  it("rapproche aussi par paiement_id, posé par le webhook TouchPoint", () => {
    const planTP = { mois_paiements: [
      { periode: "2026-03", label: "Mars 2026", tranches: [{ id: "x", paiement_id: "abc-123" }] },
    ] };
    expect(moisDuVersement({ id: "abc-123" }, planTP).periode).toBe("2026-03");
  });

  it("rend null plutôt que de deviner quand rien ne correspond", () => {
    expect(moisDuVersement({ ref_transaction: "TP-9999" }, plan)).toBeNull();
    expect(moisDuVersement({}, plan)).toBeNull();
    expect(moisDuVersement({ ref_transaction: "TP-5676" }, {})).toBeNull();
    expect(moisDuVersement({ ref_transaction: "TP-5676" }, null)).toBeNull();
  });

  it("ne rapproche pas un mois gelé, qui n'a aucune tranche", () => {
    const aout = plan.mois_paiements.find((m) => m.periode === "2026-08");
    expect(aout.tranches).toHaveLength(0);
  });
});

describe("libelleMoisSolde", () => {
  it("formate le libellé affiché sous le versement", () => {
    expect(libelleMoisSolde({ ref_transaction: "TP-5676" }, plan)).toBe("Solde : Février 2026");
  });

  it("rend une chaîne vide quand le versement n'est pas rapprochable", () => {
    expect(libelleMoisSolde({ ref_transaction: "???" }, plan)).toBe("");
  });
});
