import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_REDIRECT } from '../../constants/roles';
import { BoutonLangueClair } from '../../components/shared/BoutonLangue';

const _API = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const NAVY    = '#0F172A';
const ACC     = '#8B5CF6';
const ACC_F   = '#6D28D9';
const GRIS    = '#94A3B8';
const BLANC   = '#FFFFFF';
const DUREE   = 30;

const FEATURES = [
  { i: '👀', t: 'Suivi de la progression de votre enfant' },
  { i: '📋', t: 'Accès aux bulletins & évaluations' },
  { i: '🗓️', t: 'Consultation des présences & absences' },
  { i: '💳', t: 'Paiements & historique des frais' },
  { i: '🔐', t: 'Double authentification pour votre sécurité' },
];

const STATS = [
  { n: '320+', l: 'Familles inscrites' },
  { n: '98%',  l: 'Parents satisfaits' },
  { n: '2FA',  l: 'Sécurité renforcée' },
  { n: '24/7', l: 'Accès en ligne' },
];

function forceMdp(v) {
  let score = 0;
  if (v.length >= 8)          score++;
  if (/[A-Z]/.test(v))        score++;
  if (/[0-9]/.test(v))        score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  const couleurs = ['#EF4444','#F97316','#EAB308','#22C55E'];
  const labels   = ['Faible','Moyen','Fort','Très fort'];
  return { score, couleur: couleurs[score - 1] || '#E2E8F0', label: labels[score - 1] || '' };
}

export default function LoginParent() {
  const { seConnecter, seConnecterParent, valider2FA, annuler2FA, reinitMDP, profilEnAttente2FA } = useAuth();
  const navigate = useNavigate();

  const [etape,         setEtape]         = useState('connexion');
  const [modeLogin,     setModeLogin]     = useState('email'); // 'email' | 'telephone'
  const [email,         setEmail]         = useState('');
  const [telephone,     setTelephone]     = useState('');
  const [mdp,           setMdp]           = useState('');
  const [showMdp,       setShowMdp]       = useState(false);
  const [erreur,        setErreur]        = useState('');
  const [loading,       setLoading]       = useState(false);

  // 2FA
  const [code2FA,     setCode2FA]     = useState(['', '', '', '', '', '']);
  const [erreur2FA,   setErreur2FA]   = useState('');
  const [tentatives,  setTentatives]  = useState(0);
  const [compteur,    setCompteur]    = useState(DUREE);
  const [expire,      setExpire]      = useState(false);
  const inputsRef = useRef([]);

  // Réinit MDP
  const [emailReinit, setEmailReinit] = useState('');
  const [msgReinit,   setMsgReinit]   = useState('');
  const [loadReinit,  setLoadReinit]  = useState(false);

  useEffect(() => {
    if (etape !== 'deux_fa') return;
    setCompteur(DUREE); setExpire(false);
    const iv = setInterval(() => {
      setCompteur(c => {
        if (c <= 1) { clearInterval(iv); setExpire(true); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [etape]);

  async function gererConnexion(e) {
    e.preventDefault(); setErreur(''); setLoading(true);
    try {
      let loginEmail = email;

      // Si connexion par téléphone : résoudre le numéro → email via le backend
      if (modeLogin === 'telephone') {
        const r = await fetch(`${_API}/api/apprenants/resolve-phone-parent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telephone }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Numéro de téléphone non trouvé.');
        loginEmail = data.email;
      }

      // Via téléphone : on sait que c'est un parent → connexion directe sans check-eligibilite
      const res = modeLogin === 'telephone'
        ? await seConnecterParent(loginEmail, mdp)
        : await seConnecter(loginEmail, mdp);
      if (res?.need2FA) { setEtape('deux_fa'); return; }
      const p = JSON.parse(sessionStorage.getItem('bet_profil_mock') || 'null');
      if (p) navigate(ROLE_REDIRECT[p.role] || '/access/bet-learning');
    } catch (err) {
      setErreur(err.message || 'Identifiants incorrects.');
    } finally { setLoading(false); }
  }

  function gerer2FAChange(val, idx) {
    const c = [...code2FA];
    c[idx] = val.replace(/\D/, '').slice(-1);
    setCode2FA(c);
    if (val && idx < 5) inputsRef.current[idx + 1]?.focus();
    if (c.every(x => x !== '')) valider2FACode(c.join(''));
  }

  function gerer2FAKeyDown(e, idx) {
    if (e.key === 'Backspace' && !code2FA[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
  }

  async function valider2FACode(code) {
    setErreur2FA(''); setLoading(true);
    try {
      await valider2FA(code);
      const p = JSON.parse(sessionStorage.getItem('bet_profil_mock') || 'null');
      if (p) navigate(ROLE_REDIRECT[p.role] || '/access/bet-learning');
    } catch (err) {
      setTentatives(t => t + 1);
      setErreur2FA(err.message || 'Code incorrect.');
      setCode2FA(['', '', '', '', '', '']);
      setTimeout(() => inputsRef.current[0]?.focus(), 80);
    } finally { setLoading(false); }
  }

  function annuler() {
    annuler2FA?.();
    setEtape('connexion');
    setCode2FA(['', '', '', '', '', '']);
    setErreur2FA('');
  }

  async function gererReinit(e) {
    e.preventDefault(); setLoadReinit(true); setMsgReinit('');
    try {
      await reinitMDP(emailReinit);
      setMsgReinit('📧 Un lien de réinitialisation a été envoyé à ' + emailReinit);
    } catch (err) {
      setMsgReinit('⚠️ ' + (err.message || 'Erreur lors de l\'envoi.'));
    } finally { setLoadReinit(false); }
  }

  /* ────── Panneau gauche commun ────── */
  function PanneauGauche() {
    return (
      <div style={{ width:'48%', position:'relative', overflow:'hidden',
        background:`linear-gradient(160deg, ${NAVY} 0%, #2e1065 40%, ${ACC_F} 75%, ${ACC} 100%)` }}>
        <div style={{ position:'absolute', width:380, height:380, borderRadius:'50%',
          background:'rgba(139,92,246,0.14)', top:-90, left:-110,
          animation:'parFloat 11s ease-in-out infinite' }}/>
        <div style={{ position:'absolute', width:260, height:260, borderRadius:'50%',
          background:'rgba(15,23,42,0.22)', bottom:-60, right:-60,
          animation:'parFloat 15s ease-in-out infinite reverse' }}/>
        <div style={{ position:'absolute', width:130, height:130, borderRadius:'50%',
          background:'rgba(139,92,246,0.09)', top:'38%', left:'60%',
          animation:'parFloat 7s ease-in-out infinite 1s' }}/>

        <div style={{ position:'relative', zIndex:2, height:'100%', display:'flex',
          flexDirection:'column', justifyContent:'center', padding:'56px 48px' }}>

          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:40 }}>
            <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="BET Logo"
              style={{ width:54, height:54, borderRadius:16, objectFit:'contain',
                background:'rgba(255,255,255,0.12)', border:'2px solid rgba(255,255,255,0.2)',
                padding:4 }}/>
            <div>
              <div style={{ fontSize:15, fontWeight:900, color:BLANC }}>
                <span style={{ color: ACC }}>BET</span> Parent
              </div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)',
                letterSpacing:'0.15em', textTransform:'uppercase', marginTop:2 }}>
                Portail Famille
              </div>
            </div>
          </div>

          <h1 style={{ fontSize:40, fontWeight:900, lineHeight:1.1, color:BLANC, margin:'0 0 18px' }}>
            Suivez,<br />protégez,<br /><span style={{ color: ACC }}>accompagnez.</span>
          </h1>
          <p style={{ fontSize:13, color:'rgba(255,255,255,0.6)', lineHeight:1.75,
            marginBottom:36, maxWidth:340 }}>
            Consultez les bulletins, absences et la progression de votre enfant depuis votre espace sécurisé.
          </p>

          <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:36 }}>
            {FEATURES.map(f => (
              <div key={f.t} style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:34, height:34, borderRadius:10, flexShrink:0,
                  background:'rgba(255,255,255,0.1)',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>{f.i}</div>
                <span style={{ fontSize:12, color:'rgba(255,255,255,0.72)' }}>{f.t}</span>
              </div>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:28 }}>
            {STATS.map(s => (
              <div key={s.l} style={{ padding:'12px 14px', borderRadius:12,
                background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize:20, fontWeight:800, color: ACC }}>{s.n}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', marginTop:2 }}>{s.l}</div>
              </div>
            ))}
          </div>

          <div style={{ padding:'12px 14px', borderRadius:12,
            background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)',
            display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:22 }}>🛡️</span>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.8)' }}>
                Double authentification activée
              </div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', marginTop:2 }}>
                Un code OTP est envoyé à chaque connexion pour protéger votre compte
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ────── Étape réinitialisation MDP ────── */
  if (etape === 'mdp_oublie') {
    return (
      <div style={{ display:'flex', height:'100vh', width:'100vw',
        fontFamily:'"Plus Jakarta Sans",sans-serif', overflow:'hidden' }}>
        <style>{`
          @keyframes parFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(10px,-14px) scale(1.03)}}
          @keyframes parFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
          @keyframes parSpin{to{transform:rotate(360deg)}}
        `}</style>
        <PanneauGauche />
        <div style={{ flex:1, background:'#F8FAFC', display:'flex', alignItems:'center',
          justifyContent:'center', padding:'48px 52px', overflowY:'auto', position:'relative' }}>
          <div style={{ position:'absolute', top:16, right:20, zIndex:10 }}><BoutonLangueClair /></div>
          <div style={{ width:'100%', maxWidth:400, animation:'parFadeIn .3s ease' }}>
            <div style={{ width:52, height:52, borderRadius:14, background:`${ACC}20`,
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:24,
              marginBottom:20 }}>🔑</div>
            <h2 style={{ fontSize:28, fontWeight:800, color:NAVY, margin:'0 0 8px' }}>
              Réinitialiser le mot de passe
            </h2>
            <p style={{ fontSize:13, color:GRIS, marginBottom:24, lineHeight:1.6 }}>
              Saisissez votre adresse email pour recevoir un lien de réinitialisation sécurisé.
            </p>
            <form onSubmit={gererReinit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:'#475569', display:'block', marginBottom:6 }}>
                  Adresse email
                </label>
                <div style={{ position:'relative' }}>
                  <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:15, pointerEvents:'none' }}>✉️</span>
                  <input type="email" required value={emailReinit}
                    onChange={e => setEmailReinit(e.target.value)}
                    placeholder="votre@email.ci" autoFocus
                    style={{ width:'100%', padding:'12px 14px 12px 44px', border:'1.5px solid #E2E8F0',
                      borderRadius:10, fontSize:14, fontFamily:'inherit', outline:'none',
                      boxSizing:'border-box', color:NAVY, transition:'border-color .2s,box-shadow .2s' }}
                    onFocus={e => { e.target.style.borderColor = ACC; e.target.style.boxShadow = `0 0 0 3px ${ACC}25`; }}
                    onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}/>
                </div>
              </div>
              {msgReinit && (
                <div style={{ padding:'10px 14px', borderRadius:9,
                  background: msgReinit.startsWith('📧') ? '#F0FDF4' : '#FEF2F2',
                  border:`1px solid ${msgReinit.startsWith('📧') ? '#BBF7D0' : '#FECACA'}`,
                  fontSize:13, color: msgReinit.startsWith('📧') ? '#14532D' : '#991B1B' }}>
                  {msgReinit}
                </div>
              )}
              <button type="submit" disabled={loadReinit}
                style={{ padding:'13px', borderRadius:10, border:'none',
                  background: loadReinit ? '#94A3B8' : `linear-gradient(135deg, ${ACC_F}, ${ACC})`,
                  color:BLANC, fontSize:14, fontWeight:700, cursor: loadReinit ? 'not-allowed' : 'pointer',
                  fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  boxShadow: loadReinit ? 'none' : `0 4px 20px ${ACC}40` }}>
                {loadReinit ? (
                  <><div style={{ width:16, height:16, border:'2px solid rgba(255,255,255,0.3)',
                    borderTopColor:BLANC, borderRadius:'50%', animation:'parSpin .7s linear infinite' }}/> Envoi…</>
                ) : 'Envoyer le lien de réinitialisation'}
              </button>
            </form>
            <div style={{ textAlign:'center', marginTop:20 }}>
              <button onClick={() => setEtape('connexion')}
                style={{ background:'none', border:'none', fontSize:13, color:GRIS,
                  cursor:'pointer', fontFamily:'inherit' }}>
                ← Retour à la connexion
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ────── Étape 2FA ────── */
  if (etape === 'deux_fa') {
    const nomAffiche = profilEnAttente2FA?.prenom
      ? `${profilEnAttente2FA.prenom} ${profilEnAttente2FA.nom || ''}`
      : email;
    return (
      <div style={{ display:'flex', height:'100vh', width:'100vw',
        fontFamily:'"Plus Jakarta Sans",sans-serif', overflow:'hidden' }}>
        <style>{`
          @keyframes parFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(10px,-14px) scale(1.03)}}
          @keyframes parFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
          @keyframes parSpin{to{transform:rotate(360deg)}}
        `}</style>
        <PanneauGauche />
        <div style={{ flex:1, background:'#F8FAFC', display:'flex', alignItems:'center',
          justifyContent:'center', padding:'48px 52px', overflowY:'auto', position:'relative' }}>
          <div style={{ position:'absolute', top:16, right:20, zIndex:10 }}><BoutonLangueClair /></div>
          <div style={{ width:'100%', maxWidth:420, animation:'parFadeIn .3s ease' }}>

            <div style={{ textAlign:'center', marginBottom:28 }}>
              <div style={{ width:60, height:60, borderRadius:18, background:`${ACC}15`,
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:28,
                margin:'0 auto 14px' }}>🔐</div>
              <h2 style={{ fontSize:26, fontWeight:800, color:NAVY, margin:'0 0 8px' }}>
                Vérification en deux étapes
              </h2>
              <p style={{ fontSize:13, color:GRIS, lineHeight:1.6 }}>
                Code envoyé à <strong style={{ color:NAVY }}>{nomAffiche}</strong>.<br />
                Saisissez le code à 6 chiffres reçu par SMS ou email.
              </p>
            </div>

            <div style={{ display:'flex', justifyContent:'center', gap:10, marginBottom:20 }}>
              {code2FA.map((v, i) => (
                <input key={i} ref={el => inputsRef.current[i] = el}
                  type="text" inputMode="numeric" maxLength={1} value={v}
                  onChange={e => gerer2FAChange(e.target.value, i)}
                  onKeyDown={e => gerer2FAKeyDown(e, i)}
                  style={{ width:50, height:58, textAlign:'center', fontSize:24, fontWeight:700,
                    border:`2px solid ${v ? ACC : '#E2E8F0'}`, borderRadius:12, outline:'none',
                    color:NAVY, fontFamily:'inherit', transition:'border-color .15s',
                    background: v ? `${ACC}0A` : BLANC }}/>
              ))}
            </div>

            <div style={{ textAlign:'center', marginBottom:16 }}>
              {expire ? (
                <span style={{ fontSize:13, color:'#EF4444', fontWeight:600 }}>
                  ⏱️ Code expiré
                </span>
              ) : (
                <span style={{ fontSize:13, color:GRIS }}>
                  Expire dans{' '}
                  <span style={{ fontWeight:700, color: compteur <= 10 ? '#EF4444' : ACC }}>
                    {compteur}s
                  </span>
                </span>
              )}
            </div>

            {/* Barre de progression */}
            <div style={{ height:4, background:'#E2E8F0', borderRadius:4, marginBottom:20, overflow:'hidden' }}>
              <div style={{ height:'100%', borderRadius:4,
                background: compteur <= 10 ? '#EF4444' : `linear-gradient(90deg, ${ACC_F}, ${ACC})`,
                width:`${(compteur / DUREE) * 100}%`,
                transition:'width 1s linear, background .3s' }}/>
            </div>

            {erreur2FA && (
              <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:9,
                padding:'10px 14px', fontSize:13, color:'#991B1B', marginBottom:14, textAlign:'center' }}>
                ⚠️ {erreur2FA}
                {tentatives >= 3 && (
                  <div style={{ marginTop:6, fontSize:12, color:'#B91C1C', fontWeight:600 }}>
                    Trop de tentatives - contactez BET au besoin.
                  </div>
                )}
              </div>
            )}

            <button
              disabled={loading || expire || code2FA.some(x => !x)}
              onClick={() => valider2FACode(code2FA.join(''))}
              style={{ width:'100%', padding:'14px', borderRadius:10, border:'none',
                background: (loading || expire || code2FA.some(x => !x)) ? '#94A3B8'
                  : `linear-gradient(135deg, ${ACC_F}, ${ACC})`,
                color:BLANC, fontSize:15, fontWeight:700,
                cursor: (loading || expire || code2FA.some(x => !x)) ? 'not-allowed' : 'pointer',
                fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                boxShadow: loading ? 'none' : `0 4px 20px ${ACC}40` }}>
              {loading ? (
                <><div style={{ width:17, height:17, border:'2px solid rgba(255,255,255,0.35)',
                  borderTopColor:BLANC, borderRadius:'50%', animation:'parSpin .7s linear infinite' }}/> Vérification…</>
              ) : '✅ Valider le code'}
            </button>

            <div style={{ marginTop:18, padding:'12px 15px', borderRadius:10,
              background:'#F5F3FF', border:'1px solid #DDD6FE', fontSize:12, color:'#5B21B6' }}>
              🧪 <strong>Démo :</strong> le code est <strong>123456</strong>
            </div>

            <div style={{ textAlign:'center', marginTop:16 }}>
              <button onClick={annuler}
                style={{ background:'none', border:'none', fontSize:13, color:GRIS,
                  cursor:'pointer', fontFamily:'inherit' }}>
                ← Annuler et revenir à la connexion
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ────── Étape connexion (principale) ────── */
  const force = forceMdp(mdp);

  return (
    <div style={{ display:'flex', height:'100vh', width:'100vw',
      fontFamily:'"Plus Jakarta Sans",sans-serif', overflow:'hidden' }}>
      <style>{`
        @keyframes parFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(10px,-14px) scale(1.03)}}
        @keyframes parFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes parSpin{to{transform:rotate(360deg)}}
        .par-demo-item:hover{background:#F5F3FF !important}
      `}</style>

      <PanneauGauche />

      {/* ── Panneau droit ── */}
      <div style={{ flex:1, background:'#F8FAFC', display:'flex', alignItems:'center',
        justifyContent:'center', padding:'48px 52px', overflowY:'auto', position:'relative' }}>
        <div style={{ position:'absolute', top:16, right:20, zIndex:10 }}><BoutonLangueClair /></div>

        <div style={{ position:'absolute', bottom:-80, right:-80, width:240, height:240,
          borderRadius:'50%', background:'rgba(139,92,246,0.05)', pointerEvents:'none' }}/>

        <div style={{ width:'100%', maxWidth:400, animation:'parFadeIn .3s ease' }}>

          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:28 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:`${ACC}20`,
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>👨‍👩‍👧</div>
            <div style={{ width:1, height:26, background:'#E2E8F0' }}/>
            <div style={{ fontSize:11, fontWeight:600, color:GRIS,
              letterSpacing:'0.1em', textTransform:'uppercase' }}>Connexion Parent</div>
          </div>

          <h2 style={{ fontSize:30, fontWeight:800, color:NAVY, margin:'0 0 6px', lineHeight:1.15 }}>
            Accéder à<br />l'espace famille 👨‍👩‍👧
          </h2>
          <p style={{ fontSize:13, color:GRIS, marginBottom:22, lineHeight:1.6 }}>
            Suivez la progression scolaire de votre enfant en toute sécurité.
          </p>

          <div style={{ padding:'8px 14px', borderRadius:9, background:'#F5F3FF',
            border:'1px solid #DDD6FE', fontSize:12, color:'#5B21B6', fontWeight:500,
            marginBottom:22, display:'flex', alignItems:'center', gap:8 }}>
            <span>🛡️</span>
            <span>Connexion protégée - 2FA activé sur ce compte</span>
          </div>

          <form onSubmit={gererConnexion} style={{ display:'flex', flexDirection:'column', gap:18 }}>

            {/* Toggle Email / Téléphone */}
            <div style={{ display:'flex', background:'#F1F5F9', borderRadius:10, padding:4, gap:4 }}>
              {[
                { id:'email',     label:'✉️ Email' },
                { id:'telephone', label:'📱 Téléphone' },
              ].map(m => (
                <button key={m.id} type="button"
                  onClick={() => { setModeLogin(m.id); setErreur(''); }}
                  style={{ flex:1, padding:'9px 0', borderRadius:8, border:'none', cursor:'pointer',
                    fontFamily:'inherit', fontSize:12, fontWeight:700, transition:'all .15s',
                    background: modeLogin === m.id ? ACC : 'transparent',
                    color: modeLogin === m.id ? '#fff' : '#64748B',
                    boxShadow: modeLogin === m.id ? `0 2px 8px ${ACC}40` : 'none',
                  }}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Champ email ou téléphone */}
            {modeLogin === 'email' ? (
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:'#475569', display:'block', marginBottom:6 }}>
                  Adresse email
                </label>
                <div style={{ position:'relative' }}>
                  <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:15, pointerEvents:'none' }}>✉️</span>
                  <input type="email" value={email} required onChange={e => setEmail(e.target.value)}
                    placeholder="parent@famille.ci" autoFocus autoComplete="username"
                    style={{ width:'100%', padding:'12px 14px 12px 44px', border:'1.5px solid #E2E8F0',
                      borderRadius:10, fontSize:14, fontFamily:'inherit', outline:'none',
                      boxSizing:'border-box', color:NAVY, transition:'border-color .2s,box-shadow .2s' }}
                    onFocus={e => { e.target.style.borderColor = ACC; e.target.style.boxShadow = `0 0 0 3px ${ACC}25`; }}
                    onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}/>
                </div>
              </div>
            ) : (
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:'#475569', display:'block', marginBottom:6 }}>
                  Numéro de téléphone
                </label>
                <div style={{ position:'relative' }}>
                  <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:15, pointerEvents:'none' }}>📱</span>
                  <input type="tel" value={telephone} required onChange={e => setTelephone(e.target.value)}
                    placeholder="07 08 XX XX XX" autoFocus autoComplete="tel"
                    style={{ width:'100%', padding:'12px 14px 12px 44px', border:'1.5px solid #E2E8F0',
                      borderRadius:10, fontSize:14, fontFamily:'inherit', outline:'none',
                      boxSizing:'border-box', color:NAVY, transition:'border-color .2s,box-shadow .2s' }}
                    onFocus={e => { e.target.style.borderColor = ACC; e.target.style.boxShadow = `0 0 0 3px ${ACC}25`; }}
                    onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}/>
                </div>
                <div style={{ fontSize:11, color:'#94A3B8', marginTop:5 }}>
                  Le numéro renseigné par l'onboarding lors de l'inscription de votre enfant
                </div>
              </div>
            )}

            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#475569', display:'block', marginBottom:6 }}>
                Mot de passe
              </label>
              <div style={{ position:'relative' }}>
                <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:15, pointerEvents:'none' }}>🔒</span>
                <input type={showMdp ? 'text' : 'password'} value={mdp} required
                  onChange={e => setMdp(e.target.value)} placeholder="••••••••••••"
                  autoComplete="current-password"
                  style={{ width:'100%', padding:'12px 44px 12px 44px', border:'1.5px solid #E2E8F0',
                    borderRadius:10, fontSize:14, fontFamily:'inherit', outline:'none',
                    boxSizing:'border-box', color:NAVY, transition:'border-color .2s,box-shadow .2s' }}
                  onFocus={e => { e.target.style.borderColor = ACC; e.target.style.boxShadow = `0 0 0 3px ${ACC}25`; }}
                  onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}/>
                <button type="button" onClick={() => setShowMdp(v => !v)}
                  style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                    background:'none', border:'none', cursor:'pointer', fontSize:15, color:GRIS, padding:0 }}>
                  {showMdp ? '🙈' : '👁️'}
                </button>
              </div>

              {/* Indicateur de force */}
              {mdp.length > 0 && (
                <div style={{ marginTop:8 }}>
                  <div style={{ display:'flex', gap:4, marginBottom:4 }}>
                    {[1,2,3,4].map(n => (
                      <div key={n} style={{ flex:1, height:3, borderRadius:2,
                        background: n <= force.score ? force.couleur : '#E2E8F0',
                        transition:'background .2s' }}/>
                    ))}
                  </div>
                  <div style={{ fontSize:10, color: force.couleur, fontWeight:600 }}>
                    {force.label}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <button type="button" onClick={() => { setEmailReinit(email); setEtape('mdp_oublie'); }}
                style={{ background:'none', border:'none', fontSize:12, color: ACC,
                  cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
                Mot de passe oublié ?
              </button>
            </div>

            {erreur && (
              <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:9,
                padding:'10px 14px', fontSize:13, color:'#991B1B' }}>⚠️ {erreur}</div>
            )}

            <button type="submit" disabled={loading}
              style={{ padding:'14px', borderRadius:10, border:'none',
                background: loading ? '#94A3B8' : `linear-gradient(135deg, ${ACC_F}, ${ACC})`,
                color:BLANC, fontSize:15, fontWeight:700, cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                boxShadow: loading ? 'none' : `0 4px 20px ${ACC}40` }}>
              {loading ? (
                <><div style={{ width:17, height:17, border:'2px solid rgba(255,255,255,0.35)',
                  borderTopColor:BLANC, borderRadius:'50%', animation:'parSpin .7s linear infinite' }}/> Connexion…</>
              ) : '🔐 Se connecter → Code 2FA'}
            </button>
          </form>

          {/* Démo */}
          <div style={{ marginTop:16, padding:'11px 14px', background:'#EEF2FF',
            borderRadius:10, border:'1px solid #C7D2FE',
            display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
            <div style={{ fontSize:12, color:'#3730A3', lineHeight:1.6 }}>
              🎓 <strong>Vous souhaitez connecter votre enfant ?</strong>
            </div>
            <button onClick={() => navigate('/connexion/apprenant')}
              style={{ flexShrink:0, padding:'7px 14px', borderRadius:8, border:'none',
                background:`linear-gradient(135deg, ${ACC_F}, ${ACC})`, color:BLANC,
                fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                boxShadow:`0 2px 10px ${ACC}35` }}>
              Espace enfant →
            </button>
          </div>


        </div>
      </div>
    </div>
  );
}
