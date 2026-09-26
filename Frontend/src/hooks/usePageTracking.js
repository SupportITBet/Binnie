import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { initGA4, pageVueGA4 } from "../utils/ga4";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

function getSessionId() {
  let id = sessionStorage.getItem("_bet_sid");
  if (!id) {
    id = crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem("_bet_sid", id);
  }
  return id;
}

// Détecte si un visiteur est connecté via Supabase (token stocké au SIGNED_IN)
function getUserRole() {
  const token = localStorage.getItem("token");
  if (!token) return "anonyme";
  // Tente de lire le rôle depuis les métadonnées du JWT Supabase
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload?.user_metadata?.role || payload?.app_metadata?.role || "prospect";
  } catch {
    return "prospect";
  }
}

export function usePageTracking() {
  const location  = useLocation();
  const prevPath  = useRef(null);
  const enterTime = useRef(Date.now());

  /* GA4 est ouvert une seule fois, au premier rendu. Le traçage interne continue en
     parallèle : les deux ne mesurent pas la même chose - notre table sait ce que devient
     le visiteur (dossier, paiement), GA4 sait d'où il vient et sur quel terminal. */
  useEffect(() => { initGA4(); }, []);

  useEffect(() => {
    const sessionId   = getSessionId();
    const currentPath = location.pathname;
    const now         = Date.now();
    const duration_ms = prevPath.current ? now - enterTime.current : null;

    fetch(`${API_URL}/api/analytics/pageview`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path:        currentPath,
        referrer:    prevPath.current || (document.referrer ? (() => { try { return new URL(document.referrer).pathname; } catch { return null; } })() : null),
        session_id:  sessionId,
        duration_ms: duration_ms,
        user_role:   getUserRole(),
      }),
    }).catch(() => {});

    // La même page vue, déclarée à GA4. Déclenchée par l'application et non par le
    // script : sur une navigation interne, la vue automatique ne part qu'une fois.
    pageVueGA4(currentPath);

    prevPath.current  = currentPath;
    enterTime.current = now;
  }, [location.pathname]);
}
