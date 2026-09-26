import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { lienifier } from "./lienifier";

/**
 * Un message est saisi par un tiers : ces tests couvrent autant la commodité (le lien est
 * cliquable) que la sûreté (rien n'est jamais interprété comme du HTML).
 */

const rendre = (texte) => render(<div data-testid="bulle">{lienifier(texte)}</div>);

describe("lienifier", () => {
  test("transforme une URL en lien qui s'ouvre dans un nouvel onglet", () => {
    rendre("Voici le lien https://meet.google.com/abc-defg");
    const a = screen.getByRole("link", { name: "https://meet.google.com/abc-defg" });
    expect(a).toHaveAttribute("href", "https://meet.google.com/abc-defg");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("préfixe en https un domaine écrit en www.", () => {
    rendre("Rendez-vous sur www.binniesenglish.com");
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://www.binniesenglish.com");
  });

  test("une adresse e-mail devient un mailto, sans target ni rel", () => {
    rendre("Écrivez à contact@binniesenglish.com");
    const a = screen.getByRole("link");
    expect(a).toHaveAttribute("href", "mailto:contact@binniesenglish.com");
    expect(a).not.toHaveAttribute("target");
  });

  test("la ponctuation finale reste dans la phrase, hors du lien", () => {
    rendre("Voir https://bet.ci/tarifs.");
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://bet.ci/tarifs");
    expect(screen.getByTestId("bulle")).toHaveTextContent("Voir https://bet.ci/tarifs.");
  });

  test("une parenthèse fermante non ouverte dans l'URL n'est pas avalée", () => {
    rendre("(voir https://bet.ci/a)");
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://bet.ci/a");
  });

  test("une parenthèse appartenant à l'URL est conservée", () => {
    rendre("https://fr.wikipedia.org/wiki/Test_(page)");
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://fr.wikipedia.org/wiki/Test_(page)");
  });

  test("plusieurs liens dans un même message", () => {
    rendre("Avant https://a.com milieu https://b.com fin");
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByTestId("bulle")).toHaveTextContent("Avant https://a.com milieu https://b.com fin");
  });

  test("un texte sans lien est rendu tel quel", () => {
    rendre("Bonjour, à demain 9h.");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByTestId("bulle")).toHaveTextContent("Bonjour, à demain 9h.");
  });

  test("le HTML d'un message reste du TEXTE - jamais interprété", () => {
    const { container } = rendre('<img src=x onerror="alert(1)"> <b>gras</b>');
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByTestId("bulle")).toHaveTextContent('<img src=x onerror="alert(1)"> <b>gras</b>');
  });

  test("un lien javascript: n'est jamais produit", () => {
    const { container } = rendre("javascript:alert(1)");
    const liens = [...container.querySelectorAll("a")];
    expect(liens.every((a) => !a.getAttribute("href").toLowerCase().startsWith("javascript:"))).toBe(true);
  });

  test("les valeurs vides ou non textuelles ne font pas planter le rendu", () => {
    expect(lienifier("")).toBe("");
    expect(lienifier(null)).toBe(null);
    expect(lienifier(undefined)).toBe(undefined);
  });

  test("les sauts de ligne du message sont préservés", () => {
    rendre("Ligne 1\nhttps://bet.ci\nLigne 3");
    expect(screen.getByRole("link")).toBeInTheDocument();
    expect(screen.getByTestId("bulle").textContent).toBe("Ligne 1\nhttps://bet.ci\nLigne 3");
  });
});
