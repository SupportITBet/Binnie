import React, { useEffect, useRef } from 'react';

/**
 * LA PAGE 404 — ET CE QU'ELLE NE DIT PAS.
 *
 * Portée de `dash/src/Pages/NotFoundPage.jsx`, aux couleurs de l'e-learning. Elle n'offre
 * AUCUN lien de retour, et c'est délibéré : la racine et les adresses inventées renvoyaient
 * auparavant vers `/connexion`, si bien que taper n'importe quoi après le domaine affichait
 * l'écran de connexion du personnel. Une page qui ne mène nulle part est la seule réponse
 * cohérente avec le portail d'accès — autant ne pas montrer la porte à qui cherche au hasard.
 *
 * Elle ne nomme pas non plus la plateforme : « Espace privé » suffit à dire qu'on n'est pas
 * sur un site public, sans indiquer lequel.
 */
const PageIntrouvable = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf;
    let particules = [];

    const redimensionner = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    const initialiser = () => {
      const nombre = window.innerWidth < 640 ? 35 : 70;
      particules = Array.from({ length: nombre }, () => ({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        r: Math.random() * 1.6 + 0.4,
        vy: Math.random() * 0.15 + 0.03,
        a: Math.random() * 0.5 + 0.15,
      }));
    };

    const dessiner = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      particules.forEach((p) => {
        p.y -= p.vy;
        if (p.y < -5) p.y = canvas.offsetHeight + 5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(56, 189, 248, ${p.a})`;
        ctx.fill();
      });
      raf = requestAnimationFrame(dessiner);
    };

    redimensionner();
    initialiser();
    dessiner();

    const surRedimensionnement = () => { redimensionner(); initialiser(); };
    window.addEventListener('resize', surRedimensionnement);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', surRedimensionnement);
    };
  }, []);

  return (
    <div style={styles.page}>
      <canvas ref={canvasRef} style={styles.canvas} />

      <div style={styles.halotHaut} />
      <div style={styles.halotBas} />

      <div style={styles.contenu}>
        <div style={styles.code}>
          <span style={styles.chiffre}>4</span>
          <span style={{ ...styles.chiffre, ...styles.chiffreAccent }}>0</span>
          <span style={styles.chiffre}>4</span>
        </div>

        <p style={styles.titre}>Cette page n'existe pas</p>
        <p style={styles.soustitre}>
          L'adresse saisie ne correspond à rien ici. Vérifiez le lien ou revenez plus tard.
        </p>

        <div style={styles.mention}>
          <span style={styles.point} />
          <span>Espace privé</span>
        </div>
      </div>

      <style>{`
        @keyframes pi-fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pi-pulse {
          0%, 100% { opacity: .55; }
          50% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; }
        }
      `}</style>
    </div>
  );
};

const styles = {
  page: {
    position: 'relative',
    minHeight: '100vh',
    width: '100%',
    background: 'radial-gradient(120% 120% at 50% 0%, #0E2038 0%, #071424 55%, #040B14 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  canvas: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
  halotHaut: {
    position: 'absolute',
    top: '-180px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '560px',
    height: '360px',
    background: 'radial-gradient(circle, rgba(8,145,178,0.20) 0%, transparent 70%)',
    filter: 'blur(10px)',
    pointerEvents: 'none',
  },
  halotBas: {
    position: 'absolute',
    bottom: '-220px',
    right: '-120px',
    width: '480px',
    height: '480px',
    background: 'radial-gradient(circle, rgba(220,38,38,0.10) 0%, transparent 70%)',
    filter: 'blur(10px)',
    pointerEvents: 'none',
  },
  contenu: {
    position: 'relative',
    zIndex: 2,
    textAlign: 'center',
    padding: '32px 24px',
    animation: 'pi-fade-up .7s ease both',
  },
  code: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    fontFamily: "Georgia, 'Iowan Old Style', serif",
    fontSize: 'clamp(72px, 16vw, 140px)',
    lineHeight: 1,
    letterSpacing: '2px',
    color: 'rgba(255,255,255,0.92)',
    marginBottom: '18px',
  },
  chiffre: {
    textShadow: '0 0 40px rgba(255,255,255,0.06)',
  },
  chiffreAccent: {
    color: '#38BDF8',
    textShadow: '0 0 50px rgba(56,189,248,0.40)',
  },
  titre: {
    fontSize: 'clamp(17px, 2.4vw, 21px)',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.94)',
    margin: '0 0 8px',
  },
  soustitre: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.5)',
    maxWidth: '360px',
    margin: '0 auto',
    lineHeight: 1.6,
  },
  mention: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '38px',
    padding: '7px 14px',
    borderRadius: '999px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    fontSize: '11px',
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)',
  },
  point: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#22D3EE',
    animation: 'pi-pulse 2s ease-in-out infinite',
  },
};

export default PageIntrouvable;
