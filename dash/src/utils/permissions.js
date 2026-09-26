// src/utils/permissions.js
// Lecture des droits effectifs de l'utilisateur connecté (profil.permissions,
// renvoyé par /api/admin/login et /api/admin/me - déjà fusionné côté backend
// avec permission_exceptions dans requireAdmin.js::resolvePermissions).
// super_admin a un accès total non modifiable (cf. Matrice des permissions,
// rôle verrouillé) : on applique le même bypass ici plutôt que de dépendre
// d'une ligne permissions_roles qui pourrait ne pas exister pour ce rôle.

import { useState, useEffect, useCallback } from "react";

export function hasPermission(profil, module, action) {
  if (!profil) return false;
  if (profil.role === "super_admin") return true;
  const modulePerms = profil.permissions?.[module];
  return !!modulePerms?.[action];
}

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

// profil.permissions n'est lu qu'une seule fois au login et mis en cache dans
// localStorage - un admin qui modifie les droits d'un utilisateur déjà connecté
// (Matrice des permissions) n'avait jusqu'ici jamais d'effet tant que cette
// session restait ouverte, obligeant à se déconnecter/reconnecter à chaque
// changement. GET /api/admin/me renvoie req.profil.permissions, recalculé à
// chaque requête par authenticateAdmin - on le réinterroge périodiquement pour
// que les boutons dépendant des permissions se mettent à jour tout seuls.
// Même pattern que bet-elearning/src/contexts/AuthContext.jsx.
export function useLivePermissions(profilInitial) {
  const [profil, setProfil] = useState(profilInitial);

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!profilInitial?.id || !token) return;
    let annule = false;

    async function rafraichirPermissions() {
      try {
        const res = await fetch(`${API_URL}/api/admin/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const { profil: frais } = await res.json();
        if (annule || !frais?.permissions) return;
        setProfil(prev => {
          if (!prev) return prev;
          // Fusionne tout le profil frais (pas seulement permissions/acces_elearning) - un
          // champ ajouté après coup (ex: onboarding_vue_globale, activé par un admin pendant
          // que la session reste ouverte) restait sinon figé à sa valeur du dernier login
          // réel, cette fonction ne recopiant explicitement que deux champs jusqu'ici.
          const maj = { ...prev, ...frais };
          localStorage.setItem("admin_profil", JSON.stringify(maj));
          return maj;
        });
      } catch { /* silencieux - on retentera au prochain intervalle */ }
    }

    rafraichirPermissions();
    const intervalId = setInterval(rafraichirPermissions, 60000);
    return () => { annule = true; clearInterval(intervalId); };
  }, [profilInitial?.id]);

  const peut = useCallback((module, action) => hasPermission(profil, module, action), [profil]);
  return { profil, peut };
}
