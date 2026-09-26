import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const COULEUR_ROLE_DEFAULT = {
  admin_manager:         '#0891B2',
  admin_superviseur:     '#8B5CF6',
  admin_placement:       '#10B981',
  admin_onboarding:      '#F97316',
  admin_elearning:       '#06B6D4',
  admin_customer_care:   '#EC4899',
  admin_pa_advisor:      '#0EA5E9',
  admin_rh_paie:         '#14B8A6',
  admin_comptable:       '#F59E0B',
  admin_commercial:      '#10B981',
  apprenant:             '#6366F1',
  parent:                '#8B5CF6',
  professeur_titulaire:  '#0D9488',
  professeur_remplacant: '#64748B',
  client_entreprise:     '#F97316',
};

export const PALETTE_THEME = [
  '#0891B2', '#06B6D4', '#0D9488', '#10B981',
  '#6366F1', '#8B5CF6', '#7C3AED', '#EC4899',
  '#F97316', '#F59E0B', '#EF4444', '#14B8A6',
  '#1E40AF', '#0EA5E9', '#059669', '#D97706',
];

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

function darkenHex(hex) {
  const r = Math.round(parseInt(hex.slice(1,3),16) * 0.78);
  const g = Math.round(parseInt(hex.slice(3,5),16) * 0.78);
  const b = Math.round(parseInt(hex.slice(5,7),16) * 0.78);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function lightenHex(hex) {
  const r = Math.round(parseInt(hex.slice(1,3),16) * 0.15 + 255 * 0.85);
  const g = Math.round(parseInt(hex.slice(3,5),16) * 0.15 + 255 * 0.85);
  const b = Math.round(parseInt(hex.slice(5,7),16) * 0.15 + 255 * 0.85);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

const ThemeContext = createContext({ couleurTheme: '#0891B2', couleurThemeFonce: '#0E7490', couleurThemeClair: '#E0F2FE', changerCouleur: () => {}, couleurDefaut: '#0891B2' });

export function ThemeProvider({ children }) {
  const { profile } = useAuth();

  const cleStorage   = `bet_couleur_dash_${profile?.id || profile?.email || 'default'}`;
  const couleurDefaut = COULEUR_ROLE_DEFAULT[profile?.role] || '#0891B2';

  const [couleurTheme, setCouleurTheme] = useState(() => {
    return localStorage.getItem(`bet_couleur_dash_${profile?.id || profile?.email || 'default'}`) || couleurDefaut;
  });

  // Quand le profil change (après login), relire la couleur sauvegardée
  useEffect(() => {
    if (profile) {
      const cle    = `bet_couleur_dash_${profile.id || profile.email || 'default'}`;
      const sauvee = localStorage.getItem(cle);
      setCouleurTheme(sauvee || COULEUR_ROLE_DEFAULT[profile.role] || '#0891B2');
    }
  }, [profile?.id, profile?.email, profile?.role]);

  async function changerCouleur(c) {
    setCouleurTheme(c);
    localStorage.setItem(cleStorage, c);

    // PATCH backend (non bloquant)
    try {
      const token  = localStorage.getItem('admin_token');
      const userId = profile?.id;
      if (token && userId) {
        await Promise.race([
          fetch(`${API_URL}/api/admin/utilisateurs/${userId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ couleur: c }),
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ]);
      }
    } catch { /* couleur déjà sauvegardée localement */ }
  }

  const couleurThemeFonce = darkenHex(couleurTheme);
  const couleurThemeClair = lightenHex(couleurTheme);

  return (
    <ThemeContext.Provider value={{ couleurTheme, couleurThemeFonce, couleurThemeClair, changerCouleur, couleurDefaut }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
