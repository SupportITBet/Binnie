import React from "react";
import { render, act } from "@testing-library/react";
import GardeInactivite from "./GardeInactivite";
import { marquerActivite } from "../utils/inactivite";

/* `signOut` part vers le réseau et n'a rien à voir avec ce qu'on vérifie ici. */
jest.mock("../config/supabase", () => ({
  supabase: { auth: { signOut: jest.fn().mockResolvedValue({}) } },
}));

const CLE = "bet_derniere_activite";
const ILYA = (minutes) => String(Date.now() - minutes * 60 * 1000);

let remplacee;
beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  remplacee = null;
  // `window.location` n'est pas assignable sous jsdom : on remplace la seule méthode utilisée.
  delete window.location;
  window.location = { replace: (url) => { remplacee = url; } };
});
afterEach(() => { jest.useRealTimers(); });

/* Fait avancer le minuteur d'une seconde, comme le fait le composant, PUIS laisse les
   promesses se vider : `deconnecter()` attend `supabase.auth.signOut()` avant de rediriger,
   donc la redirection part dans une micro-tâche et non dans le même tour de boucle. */
const tic = async (secondes = 1) => {
  await act(async () => {
    jest.advanceTimersByTime(secondes * 1000);
    await Promise.resolve();
  });
};

describe("GardeInactivite", () => {
  it("ne déconnecte personne tant qu'aucune session n'est ouverte", async () => {
    localStorage.setItem(CLE, ILYA(300));   // très ancien
    render(<GardeInactivite />);
    await tic(3);
    expect(remplacee).toBeNull();
  });

  /* LE DÉFAUT CORRIGÉ. Un onglet laissé ouvert sur l'écran de connexion consommait le délai
     avant même qu'on entre : le compte à rebours partait du chargement de la page, et les
     gestes faits pendant la connexion ne le rafraîchissaient pas. On se connectait, et la
     seconde d'après on repartait vers /access?raison=inactivite sans avoir rien fait. */
  it("repart d'un délai plein quand quelqu'un se connecte, même après une longue attente", async () => {
    render(<GardeInactivite />);
    // L'onglet dort deux heures sur la page de connexion : l'horodatage devient périmé.
    localStorage.setItem(CLE, ILYA(120));
    await tic();
    expect(remplacee).toBeNull();          // personne n'est connecté : rien ne se passe

    // La personne se connecte enfin.
    localStorage.setItem("admin_token", "jwt");
    await tic();
    expect(remplacee).toBeNull();          // ← déconnectait immédiatement avant la correction

    // Et le compteur est bien reparti de maintenant.
    expect(Number(localStorage.getItem(CLE))).toBeGreaterThan(Date.now() - 5000);
  });

  it("déconnecte bien après le délai, une fois la session ouverte", async () => {
    localStorage.setItem("admin_token", "jwt");
    render(<GardeInactivite />);
    await tic();                                  // la bascule marque l'activité
    expect(remplacee).toBeNull();

    marquerActivite();
    localStorage.setItem(CLE, ILYA(61));    // 61 min pour un profil administratif (seuil 60)
    await tic();
    expect(remplacee).toBe("/access?raison=inactivite");
    expect(localStorage.getItem("admin_token")).toBeNull();
  });
});
