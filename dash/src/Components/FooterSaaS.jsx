import { useState, useEffect } from "react";
import { assombrirCouleur as assombrir, eclaircirCouleur as eclaircir } from "../utils/couleurs";

// Footer "SaaS" partagé par les dashboards internes dash - même look et même source de
// données que TopNavLayout.jsx côté bet-elearning (config_footer_elearning, backend commun
// aux deux apps), pour une identité visuelle cohérente entre les deux plateformes.
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

const FOOTER_DEFAUT = {
  visible: true,
  tagline: "Plateforme de gestion",
  description: "British English Training - Formation en anglais pour enfants, adolescents et entreprises. Abidjan, Côte d'Ivoire.",
  colonnes: [
    { titre: "Plateforme", liens: [
      { label: "Tableau de bord", url: "" },
      { label: "Mes cours", url: "" },
      { label: "Planning", url: "" },
    ]},
    { titre: "Support", liens: [
      { label: "Centre d'aide", url: "" },
      { label: "Contacter l'équipe", url: "" },
    ]},
    { titre: "Légal", liens: [
      { label: "Politique de confidentialité", url: "" },
      { label: "Conditions d'utilisation", url: "" },
    ]},
  ],
  copyright_texte: "Tous droits réservés · Abidjan, Côte d'Ivoire",
  version: "v1.0.0",
};

function getToken() {
  return localStorage.getItem("coach_token") || localStorage.getItem("admin_token") || "";
}


export default function FooterSaaS({ couleurTheme = "#0891b2", nomEntreprise = "" }) {
  const [cfg, setCfg] = useState(FOOTER_DEFAUT);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${API_URL}/api/config-footer-elearning`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCfg({ ...FOOTER_DEFAUT, ...d, colonnes: d.colonnes?.length ? d.colonnes : FOOTER_DEFAUT.colonnes }); })
      .catch(() => {});
  }, []);

  if (!cfg.visible) return null;

  // Même formule de dégradé que les en-têtes de chaque dashboard, mais la couleur de fin est
  // assombrie (jamais la couleur brute du thème) : un thème clair (jaune pâle, cyan clair…)
  // rendrait sinon le texte blanc illisible côté droit du dégradé.
  const finDegrade = assombrir(couleurTheme, 0.45);
  const gradient = `linear-gradient(135deg, #0f172a 0%, ${finDegrade} 100%)`;
  // Couleur "accent" toujours lisible sur fond sombre, quel que soit le thème choisi (un thème
  // très sombre rendrait sinon la tagline/le badge version illisibles).
  const accentLisible = eclaircir(couleurTheme, 0.35);

  const S = {
    footer: { background: gradient, borderTop: "1px solid rgba(255,255,255,0.08)", padding: "24px 32px 20px", flexShrink: 0 },
    inner: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 32, marginBottom: 20, flexWrap: "wrap" },
    logoImg: { height: 44, maxWidth: 160, objectFit: "contain", marginBottom: 8 },
    logoSous: { fontSize: 11, color: accentLisible, fontWeight: 600 },
    logoDesc: { fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 8, maxWidth: 240, lineHeight: 1.6 },
    colTitre: { fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 },
    lien: { display: "block", fontSize: 13, color: "rgba(255,255,255,0.75)", marginBottom: 8, textDecoration: "none" },
    divider: { borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 },
    copy: { fontSize: 12, color: "rgba(255,255,255,0.5)" },
    badges: { display: "flex", gap: 8, alignItems: "center" },
    badge: { fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, letterSpacing: "0.04em" },
  };

  return (
    <footer style={S.footer}>
      <div style={S.inner}>
        <div>
          <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="BET" style={S.logoImg} />
          <div style={S.logoSous}>{nomEntreprise ? `${cfg.tagline} × ${nomEntreprise}` : cfg.tagline}</div>
          <div style={S.logoDesc}>{cfg.description}{nomEntreprise ? ` (${nomEntreprise})` : ""}</div>
        </div>

        {cfg.colonnes.map((col, ci) => (
          <div key={ci}>
            <div style={S.colTitre}>{col.titre}</div>
            {col.liens.map((lien, li) => (
              lien.url ? (
                <a key={li} href={lien.url} target="_blank" rel="noreferrer" style={S.lien}>{lien.label}</a>
              ) : (
                <span key={li} style={S.lien}>{lien.label}</span>
              )
            ))}
          </div>
        ))}
      </div>

      <div style={S.divider}>
        <span style={S.copy}>© {new Date().getFullYear()} {nomEntreprise ? `BET × ${nomEntreprise}` : "BET"} · {cfg.copyright_texte}</span>
        <div style={S.badges}>
          <span style={{ ...S.badge, background: "rgba(255,255,255,0.14)", color: accentLisible }}>{cfg.version}</span>
          <span style={{ ...S.badge, background: "rgba(22,163,74,0.25)", color: "#6EE7A0" }}>● EN LIGNE</span>
          <span style={{ ...S.badge, background: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.75)" }}>🔒 SÉCURISÉ</span>
        </div>
      </div>
    </footer>
  );
}
