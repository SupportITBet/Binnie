import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";
const MAX_ATTEMPTS = 3;
const LOCK_MS = 15 * 60 * 1000;
const LS_ATTEMPTS = "ag_attempts";
const LS_LOCK_UNTIL = "ag_lock_until";

const formatCountdown = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const AccessGate = () => {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(() => Number(localStorage.getItem(LS_ATTEMPTS) || 0));
  const [lockUntil, setLockUntil] = useState(() => Number(localStorage.getItem(LS_LOCK_UNTIL) || 0));
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef(null);
  // Lu une fois : l'URL ne change pas pendant la vie de cet écran.
  const motif = new URLSearchParams(window.location.search).get("raison");

  const locked = lockUntil > now;

  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [locked]);

  useEffect(() => {
    if (lockUntil && lockUntil <= now) {
      localStorage.removeItem(LS_LOCK_UNTIL);
      localStorage.removeItem(LS_ATTEMPTS);
      setAttempts(0);
      setLockUntil(0);
    }
  }, [now, lockUntil]);

  const registerFailure = () => {
    const next = attempts + 1;
    if (next >= MAX_ATTEMPTS) {
      const until = Date.now() + LOCK_MS;
      localStorage.setItem(LS_LOCK_UNTIL, String(until));
      setLockUntil(until);
    }
    localStorage.setItem(LS_ATTEMPTS, String(next));
    setAttempts(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim() || loading || locked) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/access-gate/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (res.status === 429) {
        const until = Date.now() + LOCK_MS;
        localStorage.setItem(LS_LOCK_UNTIL, String(until));
        setLockUntil(until);
        setCode('');
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.ok) {
        localStorage.removeItem(LS_ATTEMPTS);
        localStorage.removeItem(LS_LOCK_UNTIL);
        sessionStorage.setItem('bet_gate_token', data.token);
        navigate('/bet-staff-access', { replace: true });
        return;
      }
      registerFailure();
    } catch {
      // silencieux - pas de distinction erreur réseau / code faux
    }
    setCode('');
    setShake(true);
    setLoading(false);
    setTimeout(() => setShake(false), 420);
    inputRef.current?.focus();
  };

  const remaining = Math.max(0, MAX_ATTEMPTS - attempts);

  return (
    <div style={styles.page}>
      <div style={styles.orbTop} />
      <div style={styles.orbBottom} />

      <div style={styles.card}>
        <div style={styles.topBar} />
        <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="Binnie's English Training" style={styles.logo} />

        <div style={styles.iconWrap}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ display:'block' }}>
            <rect x="5" y="11" width="14" height="9" rx="2.5" stroke="#0C33AC" strokeWidth="1.8" />
            <path d="M8 11V7.5a4 4 0 0 1 8 0V11" stroke="#0C33AC" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="15.2" r="1.4" fill="#E93747" />
          </svg>
        </div>

        <p style={styles.title}>Zone privée</p>

        {/* POURQUOI VOUS ÊTES ICI. La déconnexion automatique renvoie sur `/access?raison=
            inactivite`, et cette page ignorait le paramètre : on se retrouvait devant un
            écran de code sans la moindre explication, ce qui ressemble davantage à une panne
            qu'à une mesure de sécurité. */}
        {motif === "inactivite" && (
          <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 10,
            padding: "10px 14px", marginBottom: 14, fontSize: 12.5, color: "#92400e", lineHeight: 1.6, textAlign: "center" }}>
            ⏳ <strong>Session fermée après une période d'inactivité.</strong><br />
            Saisissez le code d'accès, puis reconnectez-vous.
          </div>
        )}

        {locked ? (
          <>
            <p style={styles.subtitle}>Trop de tentatives. Réessayez dans</p>
            <div style={styles.countdown}>{formatCountdown(lockUntil - now)}</div>
          </>
        ) : (
          <>
            <p style={styles.subtitle}>Entrez le code d'accès pour continuer</p>
            <form onSubmit={handleSubmit} style={styles.form}>
              <input
                ref={inputRef}
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                disabled={loading}
                style={{ ...styles.input, ...(shake ? styles.inputShake : {}) }}
              />
              <button type="submit" disabled={loading || !code.trim()} style={{ ...styles.button, opacity: loading || !code.trim() ? 0.55 : 1 }}>
                {loading ? '···' : '→'}
              </button>
            </form>
            <div style={styles.dots}>
              {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                <span key={i} style={{ ...styles.dot, ...(i < MAX_ATTEMPTS - remaining ? styles.dotUsed : {}) }} />
              ))}
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes ag-shake {
          10%, 90% { transform: translateX(-1px); }
          20%, 80% { transform: translateX(2px); }
          30%, 50%, 70% { transform: translateX(-4px); }
          40%, 60% { transform: translateX(4px); }
        }
        @keyframes ag-float {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(14px, -10px); }
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
    background: 'linear-gradient(160deg, #F5F4FB 0%, #EEF0FB 45%, #E9EEFB 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: '24px',
  },
  orbTop: {
    position: 'absolute',
    top: '-160px',
    left: '-120px',
    width: '420px',
    height: '420px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(12,51,172,0.14) 0%, transparent 70%)',
    filter: 'blur(4px)',
    animation: 'ag-float 9s ease-in-out infinite',
    pointerEvents: 'none',
  },
  orbBottom: {
    position: 'absolute',
    bottom: '-180px',
    right: '-140px',
    width: '460px',
    height: '460px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(233,55,71,0.10) 0%, transparent 70%)',
    filter: 'blur(4px)',
    animation: 'ag-float 11s ease-in-out infinite reverse',
    pointerEvents: 'none',
  },
  card: {
    position: 'relative',
    zIndex: 2,
    overflow: 'hidden',
    background: 'rgba(255,255,255,0.86)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    border: '1px solid rgba(255,255,255,0.9)',
    borderRadius: '20px',
    padding: '42px 40px 36px',
    width: '100%',
    maxWidth: '400px',
    textAlign: 'center',
    boxShadow: '0 20px 60px rgba(1, 20, 81, 0.14), 0 2px 8px rgba(15, 23, 42, 0.04)',
  },
  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: '4px',
    background: 'linear-gradient(90deg, #011451 0%, #0C33AC 55%, #E93747 100%)',
  },
  logo: {
    width: '130px',
    height: 'auto',
    margin: '4px auto 20px',
    display: 'block',
  },
  iconWrap: {
    width: '38px',
    height: '38px',
    margin: '0 auto 14px',
    borderRadius: '11px',
    background: 'rgba(12,51,172,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#011451',
    margin: '0 0 4px',
    letterSpacing: '-0.01em',
  },
  subtitle: {
    fontSize: '12.5px',
    color: '#6B7290',
    margin: '0 0 20px',
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minWidth: 0,
    background: 'rgba(255,255,255,0.9)',
    border: '1.5px solid rgba(12,51,172,0.16)',
    borderRadius: '11px',
    color: '#011451',
    fontSize: '16px',
    letterSpacing: '3px',
    textAlign: 'center',
    padding: '13px 10px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color .15s ease',
  },
  inputShake: {
    animation: 'ag-shake .4s',
    borderColor: 'rgba(233,55,71,0.55)',
  },
  button: {
    width: '46px',
    height: '46px',
    minWidth: '46px',
    flexShrink: 0,
    boxSizing: 'border-box',
    borderRadius: '11px',
    border: 'none',
    background: 'linear-gradient(135deg, #011451, #0C33AC)',
    color: '#fff',
    fontSize: '17px',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 6px 16px rgba(1,20,81,0.3)',
  },
  dots: {
    display: 'flex',
    justifyContent: 'center',
    gap: '6px',
    marginTop: '18px',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'rgba(12,51,172,0.18)',
  },
  dotUsed: {
    background: '#E93747',
  },
  countdown: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#0C33AC',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '1px',
  },
};

export default AccessGate;
