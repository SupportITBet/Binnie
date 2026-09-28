import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../config/supabase";
import {
  minutesInactivite, SEUIL_AVERTISSEMENT,
  marquerActivite, tempsRestant, effacerSession,
} from "../utils/inactivite";

/**
 * LE GARDE-FOU D'INACTIVITÉ, monté UNE FOIS pour toute l'application.
 *
 * Placé dans `App.js` plutôt que répété dans chacun des dix-sept tableaux de bord : une
 * règle de sécurité recopiée dix-sept fois finit par diverger, et le premier écran oublié
 * serait précisément celui qui reste ouvert toute la journée.
 *
 * NE FAIT RIEN SANS SESSION. Sur la page de connexion, il n'y a personne à déconnecter -
 * et afficher un compte à rebours à quelqu'un qui n'est pas encore entré n'aurait aucun
 * sens.
 */
export default function GardeInactivite() {
  const [restant, setRestant] = useState(null);   // ms restantes, seulement pendant le préavis
  const deconnexionFaite = useRef(false);

  useEffect(() => {
    const connecte = () => {
      try {
        return !!(localStorage.getItem("admin_token")
          || localStorage.getItem("coach_token")
          || localStorage.getItem("user_token"));
      } catch { return false; }
    };

    marquerActivite();

    /* Les gestes qui comptent comme une présence. `scroll` et `mousemove` sont volontairement
       absents : une souris bousculée par un collègue de passage, ou une page qui défile
       toute seule, prolongeraient une session abandonnée. Cliquer, écrire ou toucher
       l'écran demandent quelqu'un devant le clavier. */
    const gestes = ["mousedown", "keydown", "touchstart", "focus"];
    const surActivite = () => { if (connecte()) marquerActivite(); };
    gestes.forEach(g => window.addEventListener(g, surActivite, { passive: true }));

    const deconnecter = async () => {
      if (deconnexionFaite.current) return;
      deconnexionFaite.current = true;
      effacerSession();
      /* LE LAISSEZ-PASSER DU PORTAIL AUSSI. `effacerSession` ne touche que le localStorage ;
         `bet_gate_token` vit dans le sessionStorage et reste valable deux heures. Une session
         fermée pour inactivité laissait donc derrière elle un laissez-passer actif - soit
         exactement ce que cette déconnexion cherche à empêcher sur un poste partagé. */
      try { sessionStorage.removeItem("bet_gate_token"); } catch { /* mode privé */ }
      // `signOut` révoque aussi le refresh_token côté Supabase : sans lui, le jeton
      // resterait renouvelable par quiconque récupérerait le stockage du navigateur.
      try { await supabase.auth.signOut(); } catch { /* le local est déjà vidé */ }
      // `replace` plutôt que `href` : la touche « retour » ne doit pas ramener sur un
      // écran encore rempli des données de la personne déconnectée.
      window.location.replace("/access?raison=inactivite");
    };

    // Une seconde suffit : le compte à rebours du préavis doit s'égrener visiblement, et
    // c'est un travail négligeable pour le navigateur.
    const minuteur = setInterval(() => {
      if (!connecte()) { setRestant(null); return; }
      const ms = tempsRestant();
      if (ms === Infinity) { setRestant(null); return; }   // salle de cours ouverte
      if (ms <= 0) { deconnecter(); return; }
      setRestant(ms <= SEUIL_AVERTISSEMENT ? ms : null);
    }, 1000);

    return () => {
      clearInterval(minuteur);
      gestes.forEach(g => window.removeEventListener(g, surActivite));
    };
  }, []);

  if (restant === null) return null;

  const secondes = Math.max(0, Math.ceil(restant / 1000));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", zIndex: 100000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "28px 30px", maxWidth: 430, width: "100%",
        textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,.3)", fontFamily: "inherit" }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>⏳</div>
        <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 800, color: "#0f172a" }}>
          Toujours là ?
        </h3>
        <p style={{ margin: "0 0 6px", fontSize: 13.5, color: "#475569", lineHeight: 1.6 }}>
          Votre session va se fermer dans <strong style={{ color: "#b91c1c" }}>{secondes} s</strong>,
          faute d'activité depuis {minutesInactivite()} minutes.
        </p>
        <p style={{ margin: "0 0 18px", fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
          Une déconnexion automatique évite qu'un poste laissé ouvert donne accès aux dossiers.
        </p>
        <button onClick={() => { marquerActivite(); setRestant(null); }}
          style={{ width: "100%", padding: "11px", borderRadius: 10, border: "none", background: "#0891b2",
            color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          Je suis là - continuer
        </button>
      </div>
    </div>
  );
}
