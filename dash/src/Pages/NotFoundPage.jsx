import React, { useEffect, useRef } from 'react';

const NotFoundPage = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;
    let particles = [];

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    const init = () => {
      const count = window.innerWidth < 640 ? 35 : 70;
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        r: Math.random() * 1.6 + 0.4,
        vy: Math.random() * 0.15 + 0.03,
        a: Math.random() * 0.5 + 0.15,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      particles.forEach((p) => {
        p.y -= p.vy;
        if (p.y < -5) p.y = canvas.offsetHeight + 5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(240, 184, 75, ${p.a})`;
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };

    resize();
    init();
    draw();

    const onResize = () => { resize(); init(); };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div style={styles.page}>
      <canvas ref={canvasRef} style={styles.canvas} />

      <div style={styles.glowTop} />
      <div style={styles.glowBottom} />

      <div style={styles.content}>
        <div style={styles.code}>
          <span style={styles.codeDigit}>4</span>
          <span style={{ ...styles.codeDigit, ...styles.codeDigitAccent }}>0</span>
          <span style={styles.codeDigit}>4</span>
        </div>

        <p style={styles.title}>Cette page n'existe pas</p>
        <p style={styles.subtitle}>
          L'adresse saisie ne correspond à rien ici. Vérifiez le lien ou revenez plus tard.
        </p>

        <div style={styles.hint}>
          <span style={styles.hintDot} />
          <span>BET · Espace privé</span>
        </div>
      </div>

      <style>{`
        @keyframes ffp-fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes ffp-pulse {
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
    background: 'radial-gradient(120% 120% at 50% 0%, #0F1830 0%, #070C18 55%, #04070F 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  canvas: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
  glowTop: {
    position: 'absolute',
    top: '-180px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '560px',
    height: '360px',
    background: 'radial-gradient(circle, rgba(240,184,75,0.14) 0%, transparent 70%)',
    filter: 'blur(10px)',
    pointerEvents: 'none',
  },
  glowBottom: {
    position: 'absolute',
    bottom: '-220px',
    right: '-120px',
    width: '480px',
    height: '480px',
    background: 'radial-gradient(circle, rgba(52,211,153,0.10) 0%, transparent 70%)',
    filter: 'blur(10px)',
    pointerEvents: 'none',
  },
  content: {
    position: 'relative',
    zIndex: 2,
    textAlign: 'center',
    padding: '32px 24px',
    animation: 'ffp-fade-up .7s ease both',
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
  codeDigit: {
    textShadow: '0 0 40px rgba(255,255,255,0.06)',
  },
  codeDigitAccent: {
    color: '#F0B84B',
    textShadow: '0 0 50px rgba(240,184,75,0.35)',
  },
  title: {
    fontSize: 'clamp(17px, 2.4vw, 21px)',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.94)',
    margin: '0 0 8px',
  },
  subtitle: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.5)',
    maxWidth: '360px',
    margin: '0 auto',
    lineHeight: 1.6,
  },
  hint: {
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
  hintDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#34D399',
    animation: 'ffp-pulse 2s ease-in-out infinite',
  },
};

export default NotFoundPage;
