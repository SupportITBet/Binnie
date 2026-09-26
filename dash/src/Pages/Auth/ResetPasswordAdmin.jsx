import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../config/supabase";

export default function ResetPasswordAdmin() {
  const navigate = useNavigate();
  const [password,    setPassword]    = useState("");
  const [confirm,     setConfirm]     = useState("");
  const [showPwd,     setShowPwd]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState(false);
  const [ready,       setReady]       = useState(false); // token détecté

  // Supabase v2 détecte automatiquement le token de recovery dans l'URL (#access_token=...&type=recovery)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || "Impossible de mettre à jour le mot de passe.");
        return;
      }
      await supabase.auth.signOut();
      setSuccess(true);
      setTimeout(() => navigate("/bet-staff-access"), 3000);
    } catch {
      setError("Erreur serveur. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="rp-root">
        <div className="rp-left">
          <div className="rp-left-bg" />
          <div className="rp-blob1" />
          <div className="rp-blob2" />
          <div className="rp-left-content">
            <div className="rp-logo-area">
              <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="BET" className="rp-logo-img" />
              <div>
                <div className="rp-logo-name"><span>Binnie's</span> English Training</div>
                <div className="rp-logo-sub">Centre de formation certifié</div>
              </div>
            </div>
            <h1 className="rp-headline">Sécurisez<br />votre accès<br /><span>BET.</span></h1>
            <p className="rp-sub">Choisissez un nouveau mot de passe fort pour protéger votre espace personnel.</p>
            <div className="rp-tips">
              {["Au moins 8 caractères","Mélangez lettres et chiffres","Évitez les mots courants","Ne réutilisez pas un ancien mot de passe"].map(tip => (
                <div key={tip} className="rp-tip">✅ {tip}</div>
              ))}
            </div>
          </div>
        </div>

        <div className="rp-right">
          <div className="rp-form-wrap">
            <div className="rp-header">
              <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="BET" className="rp-logo-img-sm" />
              <div className="rp-header-sep" />
              <div className="rp-header-label">Espace Personnel BET</div>
            </div>

            {success ? (
              <div className="rp-success-box">
                <div className="rp-success-icon">✅</div>
                <h2 className="rp-title" style={{ fontSize:22 }}>Mot de passe mis à jour !</h2>
                <p className="rp-desc">Vous allez être redirigé vers la page de connexion dans quelques secondes…</p>
                <button className="rp-btn" onClick={() => navigate("/bet-staff-access")}>
                  → Aller à la connexion
                </button>
              </div>
            ) : !ready ? (
              <div className="rp-waiting">
                <div className="rp-spinner-lg" />
                <h2 className="rp-title" style={{ fontSize:20, marginTop:20 }}>Vérification du lien…</h2>
                <p className="rp-desc">
                  Assurez-vous d'avoir cliqué sur le lien de l'email de réinitialisation.<br/>
                  Le lien expire après 1 heure.
                </p>
                <button className="rp-btn-back" onClick={() => navigate("/bet-staff-access")}>
                  ← Retour à la connexion
                </button>
              </div>
            ) : (
              <>
                <div className="rp-welcome">Réinitialisation 🔐</div>
                <h2 className="rp-title">Nouveau<br />mot de passe</h2>
                <p className="rp-desc">Choisissez un mot de passe sécurisé pour votre compte administrateur.</p>

                {error && <div className="rp-error">⚠️ {error}</div>}

                <form onSubmit={handleSubmit}>
                  <div className="rp-security">🔒 Connexion chiffrée SSL/TLS - Zone sécurisée</div>

                  <div className="rp-field">
                    <label className="rp-label">Nouveau mot de passe</label>
                    <div className="rp-input-wrap">
                      <span className="rp-input-icon">🔒</span>
                      <input
                        className="rp-input"
                        type={showPwd ? "text" : "password"}
                        placeholder="Au moins 8 caractères"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoFocus
                      />
                      <button type="button" className="rp-eye" onClick={() => setShowPwd(v => !v)}>
                        {showPwd ? "🙈" : "👁️"}
                      </button>
                    </div>
                    {/* Jauge de force */}
                    {password && (
                      <div className="rp-strength">
                        {(() => {
                          let score = 0;
                          if (password.length >= 8)  score++;
                          if (password.length >= 12) score++;
                          if (/[A-Z]/.test(password)) score++;
                          if (/[0-9]/.test(password)) score++;
                          if (/[^A-Za-z0-9]/.test(password)) score++;
                          const labels = ["","Faible","Faible","Moyen","Fort","Très fort"];
                          const colors = ["","#dc2626","#f59e0b","#f59e0b","#16a34a","#16a34a"];
                          return (
                            <>
                              <div className="rp-strength-bars">
                                {[1,2,3,4,5].map(i => (
                                  <div key={i} className="rp-strength-bar" style={{ background: i <= score ? colors[score] : "#e2e8f0" }} />
                                ))}
                              </div>
                              <span className="rp-strength-label" style={{ color: colors[score] }}>{labels[score]}</span>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  <div className="rp-field">
                    <label className="rp-label">Confirmer le mot de passe</label>
                    <div className="rp-input-wrap">
                      <span className="rp-input-icon">🔑</span>
                      <input
                        className="rp-input"
                        type={showConfirm ? "text" : "password"}
                        placeholder="Répétez le mot de passe"
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                      />
                      <button type="button" className="rp-eye" onClick={() => setShowConfirm(v => !v)}>
                        {showConfirm ? "🙈" : "👁️"}
                      </button>
                    </div>
                    {confirm && password && (
                      <div style={{ fontSize:11, marginTop:5, color: confirm === password ? "#16a34a" : "#dc2626", fontWeight:600 }}>
                        {confirm === password ? "✅ Les mots de passe correspondent" : "❌ Les mots de passe ne correspondent pas"}
                      </div>
                    )}
                  </div>

                  <button className="rp-btn" type="submit" disabled={loading || !password || !confirm}>
                    {loading ? <><div className="rp-spinner" /> Mise à jour…</> : <>Mettre à jour le mot de passe →</>}
                  </button>
                  <button type="button" className="rp-btn-back" onClick={() => navigate("/bet-staff-access")}>
                    ← Retour à la connexion
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow: hidden; }
        .rp-root { display: flex; height: 100vh; width: 100vw; font-family: 'Montserrat','Segoe UI',sans-serif; }

        .rp-left { width: 48%; position: relative; overflow: hidden; background: #1B3080; }
        .rp-left-bg { position: absolute; inset: 0; background: linear-gradient(160deg, #0d1a4a 0%, #1B3080 40%, #1e3a8a 70%, #2a4aad 100%); }
        .rp-blob1 { position: absolute; width: 380px; height: 380px; border-radius: 50%; background: rgba(27,48,128,0.22); top: -80px; left: -100px; animation: rpFloat 8s ease-in-out infinite; }
        .rp-blob2 { position: absolute; width: 260px; height: 260px; border-radius: 50%; background: rgba(232,39,58,0.1); bottom: -60px; right: -60px; animation: rpFloat 11s ease-in-out infinite reverse; }
        @keyframes rpFloat { 0%,100%{transform:translate(0,0)} 50%{transform:translate(12px,-16px)} }
        .rp-left-content { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 60px 52px; }
        .rp-logo-area { display: flex; align-items: center; gap: 14px; margin-bottom: 44px; }
        .rp-logo-img { height: 56px; width: 56px; object-fit: contain; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4)); }
        .rp-logo-name { font-size: 17px; font-weight: 900; color: #fff; }
        .rp-logo-name span { color: #f87171; }
        .rp-logo-sub { font-size: 10px; color: rgba(255,255,255,0.5); letter-spacing: .14em; text-transform: uppercase; }
        .rp-headline { font-size: 44px; font-weight: 900; color: #fff; line-height: 1.08; margin-bottom: 20px; }
        .rp-headline span { color: #f87171; }
        .rp-sub { font-size: 14px; color: rgba(255,255,255,0.65); line-height: 1.7; margin-bottom: 36px; max-width: 360px; }
        .rp-tips { display: flex; flex-direction: column; gap: 10px; }
        .rp-tip { font-size: 13px; color: rgba(255,255,255,0.75); font-weight: 500; }

                /* Écrans courts (13 pouces : 1280×800, 1366×768) - la page tient en 100vh sans
           défilement du body, donc tout ce qui dépasse doit tenir dans la colonne de droite. */
        @media (max-height: 860px) {
          .rp-right        { padding: 28px 44px; }
          .rp-left-content { padding: 36px 48px; }
          .rp-headline     { font-size: 36px; margin-bottom: 14px; }
        }
        @media (max-height: 760px) {
          .rp-right    { padding: 20px 36px; }
          .rp-headline { font-size: 31px; }
        }
.rp-right { flex: 1; background: #f8fafc; display: flex; align-items: flex-start; justify-content: center; padding: 48px 52px; overflow-y: auto; }
        .rp-form-wrap { width: 100%; max-width: 380px; margin: auto; }
        .rp-header { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
        .rp-logo-img-sm { height: 36px; width: 36px; object-fit: contain; }
        .rp-header-sep { width: 1px; height: 28px; background: #e2e8f0; }
        .rp-header-label { font-size: 11px; font-weight: 600; color: #94a3b8; letter-spacing: .12em; text-transform: uppercase; }
        .rp-welcome { font-size: 13px; font-weight: 600; color: #1B3080; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 8px; }
        .rp-title { font-size: 32px; font-weight: 700; color: #0f172a; line-height: 1.15; margin-bottom: 6px; }
        .rp-desc { font-size: 14px; color: #64748b; font-weight: 300; margin-bottom: 24px; line-height: 1.6; }
        .rp-error { padding: 10px 14px; border-radius: 10px; background: #fff1f2; border: 1px solid #fecdd3; font-size: 13px; color: #be123c; margin-bottom: 16px; }
        .rp-security { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 10px; background: #eef2ff; border: 1px solid #c7d2fe; font-size: 12px; color: #1B3080; font-weight: 500; margin-bottom: 18px; }

        .rp-field { margin-bottom: 18px; }
        .rp-label { display: block; font-size: 12px; font-weight: 500; color: #475569; margin-bottom: 7px; letter-spacing: .04em; }
        .rp-input-wrap { position: relative; }
        .rp-input { width: 100%; padding: 13px 44px 13px 44px; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 14px; font-family: inherit; background: #fff; color: #0f172a; outline: none; transition: border-color .25s, box-shadow .25s; }
        .rp-input:focus { border-color: #1B3080; box-shadow: 0 0 0 4px rgba(27,48,128,0.1); }
        .rp-input-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-size: 16px; pointer-events: none; }
        .rp-eye { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); font-size: 15px; cursor: pointer; background: none; border: none; padding: 0; color: #94a3b8; }
        .rp-eye:hover { color: #1B3080; }

        .rp-strength { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
        .rp-strength-bars { display: flex; gap: 4px; flex: 1; }
        .rp-strength-bar { height: 4px; flex: 1; border-radius: 2px; transition: background .3s; }
        .rp-strength-label { font-size: 11px; font-weight: 700; white-space: nowrap; }

        .rp-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, #1B3080, #0d1a4a); color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 500; font-family: inherit; cursor: pointer; transition: transform .15s, box-shadow .15s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .rp-btn:hover:not(:disabled) { box-shadow: 0 8px 24px rgba(27,48,128,0.32); transform: translateY(-1px); }
        .rp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .rp-btn-back { width: 100%; padding: 11px; background: transparent; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 14px; font-family: inherit; color: #64748b; cursor: pointer; margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 6px; transition: border-color .2s, color .2s; }
        .rp-btn-back:hover { border-color: #1B3080; color: #1B3080; }
        .rp-spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff; border-radius: 50%; animation: rpspin .7s linear infinite; }
        .rp-spinner-lg { width: 40px; height: 40px; border: 3px solid #e2e8f0; border-top-color: #1B3080; border-radius: 50%; animation: rpspin .8s linear infinite; margin: 0 auto; }
        @keyframes rpspin { to { transform: rotate(360deg); } }

        .rp-success-box { text-align: center; }
        .rp-success-icon { font-size: 52px; margin-bottom: 16px; }
        .rp-waiting { text-align: center; padding-top: 20px; }
      `}</style>
    </>
  );
}
