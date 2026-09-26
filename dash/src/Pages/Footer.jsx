// src/components/FooterDashboard.jsx
import React from "react";
import { Link } from "react-router-dom";

// Injection du style hover pour les icônes sociales (inline styles ne supportent pas :hover)
if (typeof document !== "undefined" && !document.getElementById("dash-social-style")) {
  const s = document.createElement("style"); s.id = "dash-social-style";
  s.textContent = `
    .dash-social-link { display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:#f1f5f9;color:#1e3a8a;font-size:1rem;text-decoration:none;transition:all .2s; }
    .dash-social-link:hover { background:#f97316;color:#fff;transform:translateY(-3px); }
  `;
  document.head.appendChild(s);
}

const Footer = () => {
  return (
    <footer style={styles.footer}>
      <div style={styles.container}>
        <div style={styles.grid}>
         <Link to="/"><img src="" alt="" /></Link>
          <div style={styles.col}>
            <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="Binnie's English Training" style={{ height: 52, maxWidth: 200, objectFit: "contain", marginBottom: 8 }} />
            <p style={styles.desc}>
              Cabinet d’anglais agréé par l’État de Côte d’Ivoire. Formations pour particuliers,
              entreprises, enfants et ados. Certifications TOEIC, TOEFL, IELTS.
            </p>
          </div>

          {/* Colonne 2 : Liens rapides */}
          <div style={styles.col}>
            <h4 style={styles.title}>Navigation</h4>
            <ul style={styles.list}>
              <li><Link to="/" style={styles.link}>Accueil</Link></li>
              <li><Link to="/cours/en-ligne" style={styles.link}>Cours en ligne</Link></li>
              <li><Link to="/certification/toeic" style={styles.link}>Certifications</Link></li>
              <li><Link to="/test-niveau" style={styles.link}>Test de niveau</Link></li>
              <li><Link to="/contact" style={styles.link}>Contact</Link></li>
            </ul>
          </div>

          {/* Colonne 3 : Espace apprenant / Parent */}
          <div style={styles.col}>
            <h4 style={styles.title}>Mon espace</h4>
            <ul style={styles.list}>
              <li><Link to="/espace-apprenant" style={styles.link}>Tableau de bord</Link></li>
              <li><Link to="/dashboard/parent" style={styles.link}>Espace Parent</Link></li>
              <li><Link to="/profil" style={styles.link}>Mon profil</Link></li>
              <li><Link to="/mes-cours" style={styles.link}>Mes cours</Link></li>
              <li><Link to="/resultats" style={styles.link}>Mes résultats</Link></li>
            </ul>
          </div>

          {/* Colonne 4 : Contact & assistance */}
          <div style={styles.col}>
            <h4 style={styles.title}>Assistance</h4>
            <ul style={styles.list}>
              <li>📞 +225 01 23 45 67 89</li>
              <li>✉️ support@bet-formation.com</li>
              <li>📍 Abidjan, Côte d’Ivoire</li>
              <li>🕒 Lun–Ven : 8h – 18h</li>
            </ul>
            <div style={styles.social}>
              <a href="#" className="dash-social-link" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                <i className="fa-brands fa-facebook"></i>
              </a>
              <a href="#" className="dash-social-link" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                <i className="fa-brands fa-instagram"></i>
              </a>
              <a href="#" className="dash-social-link" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                <i className="fa-brands fa-linkedin"></i>
              </a>
              <a href="#" className="dash-social-link" target="_blank" rel="noopener noreferrer" aria-label="TikTok">
                <i className="fa-brands fa-tiktok"></i>
              </a>
              <a href="#" className="dash-social-link" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)">
                <i className="fa-brands fa-x-twitter"></i>
              </a>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div style={styles.copyright}>
          <p>© {new Date().getFullYear()} Binnie's English Training - Tous droits réservés.</p>
          <div>
            <Link to="/mentions-legales" style={styles.copyrightLink}>Mentions légales</Link>
            <span style={styles.sep}>|</span>
            <Link to="/cgv" style={styles.copyrightLink}>CGV</Link>
            <span style={styles.sep}>|</span>
            <Link to="/confidentialite" style={styles.copyrightLink}>Confidentialité</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

const styles = {
  footer: {
    background: "#fff",
    borderTop: "1px solid #e2e8f0",
    marginTop: "auto",
    padding: "48px 0 24px",
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
  },
  container: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: "0 24px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 32,
    marginBottom: 40,
  },
  col: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  logo: {
    fontFamily: "'DM Serif Display', serif",
    fontSize: "1.8rem",
    fontWeight: 400,
    color: "#0f172a",
    marginBottom: 8,
  },
  logoAccent: {
    color: "#dc2626",
    fontStyle: "italic",
  },
  desc: {
    fontSize: "0.85rem",
    lineHeight: 1.6,
    color: "#64748b",
    margin: 0,
  },
  title: {
    fontSize: "1rem",
    fontWeight: 700,
    color: "#0f172a",
    margin: "0 0 8px 0",
  },
  list: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  link: {
    fontSize: "0.85rem",
    color: "#64748b",
    textDecoration: "none",
    transition: "color 0.2s",
    ":hover": {
      color: "#dc2626",
    },
  },
  social: {
    display: "flex",
    gap: 12,
    marginTop: 8,
  },
  socialLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "#f1f5f9",
    color: "#1e3a8a",
    textDecoration: "none",
    fontSize: "1.1rem",
    transition: "all 0.2s",
    ":hover": {
      background: "#dc2626",
      color: "#fff",
    },
  },
  copyright: {
    borderTop: "1px solid #e2e8f0",
    paddingTop: 24,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    fontSize: "0.75rem",
    color: "#94a3b8",
  },
  copyrightLink: {
    color: "#94a3b8",
    textDecoration: "none",
    ":hover": {
      color: "#dc2626",
    },
  },
  sep: {
    margin: "0 8px",
    color: "#cbd5e1",
  },
};

export default Footer;