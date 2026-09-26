import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import BarreFiltres, { RangeePastilles, RangeeChamps, Pastille, champFiltre } from "./BarreFiltres";

/**
 * Le composant est désormais la barre de filtres de tous les dashboards : une régression
 * ici se voit partout. Les cas couverts sont ceux sur lesquels la conversion a réellement
 * trébuché - la prop accent perdant contre le contexte, et le compteur absent qu'il ne
 * faut pas confondre avec un compteur à zéro.
 */

const OPTIONS = [
  { v: "tous", l: "Tous" },
  { v: "actif", l: "Actifs" },
  { v: "cloture", l: "Clôturés" },
];

describe("RangeePastilles", () => {
  test("rend une pastille par option et marque la valeur courante", () => {
    render(<RangeePastilles label="Statut :" options={OPTIONS} valeur="actif" onChange={() => {}} />);

    expect(screen.getByText("Statut :")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: /Actifs/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Tous/ })).toHaveAttribute("aria-pressed", "false");
  });

  test("remonte la valeur de l'option cliquée, pas son libellé", () => {
    const onChange = jest.fn();
    render(<RangeePastilles options={OPTIONS} valeur="tous" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Clôturés/ }));
    expect(onChange).toHaveBeenCalledWith("cloture");
  });

  test("appelle compte() par option et affiche le résultat", () => {
    const compte = jest.fn((v) => (v === "tous" ? 12 : v === "actif" ? 7 : 5));
    render(<RangeePastilles options={OPTIONS} valeur="tous" onChange={() => {}} compte={compte} />);

    expect(compte).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("button", { name: /Tous.*12/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Actifs.*7/ })).toBeInTheDocument();
  });

  test("un compteur à zéro s'affiche - ne pas le confondre avec l'absence de compteur", () => {
    render(<RangeePastilles options={OPTIONS} valeur="tous" onChange={() => {}} compte={() => 0} />);
    expect(screen.getAllByText("0")).toHaveLength(3);
  });

  test("sans compte ni n, aucun compteur n'est rendu (cas du filtrage côté serveur)", () => {
    render(<RangeePastilles options={OPTIONS} valeur="tous" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Tous" })).toBeInTheDocument();
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  test("n fige le compteur et court-circuite compte()", () => {
    const compte = jest.fn(() => 99);
    render(
      <RangeePastilles valeur="tous" onChange={() => {}} compte={compte}
        options={[{ v: "tous", l: "Tous", n: 4 }]} />
    );
    expect(screen.getByRole("button", { name: /Tous.*4/ })).toBeInTheDocument();
    expect(compte).not.toHaveBeenCalled();
  });
});

describe("couleur d'accent", () => {
  const rouge = "#dc2626";

  test("BarreFiltres diffuse son accent aux pastilles actives", () => {
    render(
      <BarreFiltres accent={rouge}>
        <RangeePastilles options={OPTIONS} valeur="actif" onChange={() => {}} />
      </BarreFiltres>
    );
    expect(screen.getByRole("button", { name: /Actifs/ })).toHaveStyle(`color: ${rouge}`);
  });

  test("hors BarreFiltres, la prop accent porte la couleur du dashboard", () => {
    // Le cas d'EspaceProfesseur : des rangées posées dans des barres existantes, sans
    // conteneur. Le contexte a une valeur par défaut, donc la prop doit primer.
    render(<RangeePastilles accent={rouge} options={OPTIONS} valeur="actif" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Actifs/ })).toHaveStyle(`color: ${rouge}`);
  });

  test("la prop accent l'emporte sur le contexte", () => {
    render(
      <BarreFiltres accent="#0000ff">
        <RangeePastilles accent={rouge} options={OPTIONS} valeur="actif" onChange={() => {}} />
      </BarreFiltres>
    );
    expect(screen.getByRole("button", { name: /Actifs/ })).toHaveStyle(`color: ${rouge}`);
  });
});

describe("RangeeChamps", () => {
  test("n'affiche le bouton de réinitialisation que si un handler est fourni", () => {
    const { rerender } = render(<RangeeChamps onReinitialiser={null} />);
    expect(screen.queryByRole("button", { name: /Réinitialiser/ })).not.toBeInTheDocument();

    const reset = jest.fn();
    rerender(<RangeeChamps onReinitialiser={reset} />);
    fireEvent.click(screen.getByRole("button", { name: /Réinitialiser/ }));
    expect(reset).toHaveBeenCalled();
  });

  test("affiche le résumé et rend ses champs", () => {
    render(
      <RangeeChamps label="Recherche :" resume="3 / 40 groupes">
        <input aria-label="Rechercher" style={champFiltre} />
      </RangeeChamps>
    );
    expect(screen.getByText("3 / 40 groupes")).toBeInTheDocument();
    expect(screen.getByLabelText("Rechercher")).toBeInTheDocument();
  });

  test("un résumé vide reste rendu, un résumé absent non", () => {
    const { container, rerender } = render(<RangeeChamps resume="" />);
    expect(container.querySelectorAll("span")).toHaveLength(1);
    rerender(<RangeeChamps />);
    expect(container.querySelectorAll("span")).toHaveLength(0);
  });
});

describe("Pastille", () => {
  test("est un bouton de type button - jamais un submit implicite dans un formulaire", () => {
    render(<Pastille actif={false} onClick={() => {}}>X</Pastille>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});
