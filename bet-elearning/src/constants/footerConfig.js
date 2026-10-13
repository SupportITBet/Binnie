// Configuration éditable du footer (TopNavLayout) - pilotée depuis
// Admin → Configuration → Paramètres généraux. Persistée en base
// (table config_footer_elearning), même convention que config_contact
// (footer du site public).

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

export const FOOTER_DEFAUT = {
  visible: true,
  tagline: 'Plateforme E-Learning',
  description: "British English Training - Formation en anglais pour enfants, adolescents et entreprises. Abidjan, Côte d'Ivoire.",
  colonnes: [
    {
      titre: 'Plateforme',
      liens: [
        { label: 'Tableau de bord', url: '' },
        { label: 'Mes cours', url: '' },
        { label: 'Planning des sessions', url: '' },
        { label: 'Suivi de progression', url: '' },
      ],
    },
    {
      titre: 'Support',
      liens: [
        { label: "Centre d'aide", url: '' },
        { label: "Contacter l'équipe", url: '' },
        { label: 'Signaler un problème', url: '' },
        { label: 'Documentation', url: '' },
      ],
    },
    {
      titre: 'Légal',
      liens: [
        { label: 'Politique de confidentialité', url: '' },
        { label: "Conditions d'utilisation", url: '' },
        { label: 'Mentions légales', url: '' },
      ],
    },
  ],
  copyright_texte: "Tous droits réservés · Abidjan, Côte d'Ivoire",
  version: 'v1.0.0',
};

export async function fetchFooterConfig(token) {
  try {
    const r = await fetch(`${API_URL}/api/config-footer-elearning`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return FOOTER_DEFAUT;
    const d = await r.json();
    return { ...FOOTER_DEFAUT, ...d, colonnes: d.colonnes?.length ? d.colonnes : FOOTER_DEFAUT.colonnes };
  } catch {
    return FOOTER_DEFAUT;
  }
}

export async function saveFooterConfig(cfg, token) {
  const r = await fetch(`${API_URL}/api/config-footer-elearning`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Plateforme': 'bet-elearning' },
    body: JSON.stringify(cfg),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Erreur serveur');
  return d;
}
