import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_REDIRECT } from '../../constants/roles';
import { BoutonLangueClair } from '../../components/shared/BoutonLangue';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

// Mapping rôles backend BET → rôles bet-elearning
const ROLE_MAP_BET = {
  super_admin:         'admin_manager',
  admin:               'admin_manager',
  manager:             'admin_manager',
  superviseur:         'admin_superviseur',
  deputy_superviseur:  'admin_deputy_superviseur',
  data_collector:      'admin_placement',
  placement_test:      'admin_placement',
  onboarding:          'admin_onboarding',
  pedagogical_advisor: 'admin_pa_advisor',
  admin_elearning:     'admin_elearning',
  assistant_elearning: 'admin_elearning',
  customer_care:       'admin_customer_care',
  // Assistante Corporate fusionnée avec Assistant E-Learning - voir constants/roles.js
  commercial:          'admin_elearning',
  rh:                  'admin_rh_paie',
  rh_paie:             'admin_rh_paie',
  comptable:           'admin_comptable',
  coach:               'professeur_titulaire',
  responsable:         'admin_responsable',
  gestionnaire:        'admin_gestionnaire',
  // Rôles admin_* stockés directement en base
  admin_placement:     'admin_placement',
  admin_onboarding:    'admin_onboarding',
  admin_customer_care: 'admin_customer_care',
  admin_commercial:    'admin_elearning',
  admin_pa_advisor:    'admin_pa_advisor',
  admin_rh_paie:       'admin_rh_paie',
  admin_comptable:     'admin_comptable',
  admin_manager:       'admin_manager',
  admin_superviseur:        'admin_superviseur',
  admin_deputy_superviseur: 'admin_deputy_superviseur',
  professeur_titulaire:  'professeur_titulaire',
  professeur_remplacant: 'professeur_remplacant',
};

const NAVY   = '#0F172A';
const CYAN   = '#0891B2';
const CYAN_F = '#0E7490';
const GRIS   = '#94A3B8';
const BLANC  = '#FFFFFF';
const DUREE_CODE = 30;

const PROFILS_BET = [
  { id: 'coach', label: 'Coach / Professeur', emoji: '👨‍🏫', color: '#0D9488', bg: '#F0FDFA',
    desc: 'Titulaire & remplaçant', roles: ['Prof. Titulaire', 'Prof. Remplaçant'] },
  { id: 'admin_manager',        label: 'Manager BET',         emoji: '🔧', color: '#0891B2', bg: '#E0F2FE', desc: 'Pilotage global de la plateforme' },
  { id: 'admin_superviseur',         label: 'Superviseur',          emoji: '🔭', color: '#4F46E5', bg: '#EEF2FF', desc: 'Contrôle qualité & profs' },
  { id: 'admin_deputy_superviseur',  label: 'Deputy Superviseur',   emoji: '🔍', color: '#6D28D9', bg: '#F5F3FF', desc: 'Observation & rapports terrain' },
  { id: 'admin_placement',      label: 'Placement Test',      emoji: '🎯', color: '#16A34A', bg: '#DCFCE7', desc: 'Tests de niveau apprenants' },
  { id: 'admin_onboarding',     label: 'Onboarding',          emoji: '🏷️',  color: '#EA580C', bg: '#FFF7ED', desc: 'Accueil & intégration classes' },
  { id: 'admin_customer_care',  label: 'Customer Care',       emoji: '💬', color: '#EC4899', bg: '#FDF2F8', desc: 'Support & fidélisation client' },
  { id: 'admin_pa_advisor',     label: 'PA Advisor',          emoji: '📋', color: '#0369A1', bg: '#EFF6FF', desc: 'Conseil pédagogique individuel' },
  { id: 'admin_rh_paie',        label: 'RH / Paie',           emoji: '🤝', color: '#0F766E', bg: '#F0FDFA', desc: 'Ressources humaines & salaires' },
  { id: 'admin_comptable',      label: 'Comptable',           emoji: '💰', color: '#D97706', bg: '#FFFBEB', desc: 'Comptabilité & trésorerie' },
  { id: 'admin_elearning',      label: 'Assistant E-Learning',emoji: '💻', color: '#7C3AED', bg: '#F5F3FF', desc: 'Gestion de la plateforme e-learning', roles: ['E-Learning'] },
];

const STATS_BET = [
  { n: '1 284', l: 'Apprenants actifs' },
  { n: '42',    l: 'Coachs certifiés' },
  { n: '94%',   l: 'Taux de réussite' },
  { n: '186',   l: 'Sessions / semaine' },
];

const MODULES = ['Anglais', 'Enfants', 'Adolescents', 'Adultes', 'Entreprises', 'E-Learning'];

export default function Login() {
  const { seConnecter, valider2FA, annuler2FA, reinitMDP, profilEnAttente2FA, connexionReel } = useAuth();
  const navigate = useNavigate();

  const [etape,       setEtape]      = useState('choix_profil');
  const [profil,      setProfil]     = useState(null);
  const [email,       setEmail]      = useState('');
  const [mdp,         setMdp]        = useState('');
  const [showMdp,     setShowMdp]    = useState(false);
  const [erreur,      setErreur]     = useState('');
  const [loading,     setLoading]    = useState(false);

  // 2FA
  const [code2FA,     setCode2FA]    = useState(['', '', '', '', '', '']);
  const [erreur2FA,   setErreur2FA]  = useState('');
  const [tentatives,  setTentatives] = useState(0);
  const [compteur,    setCompteur]   = useState(DUREE_CODE);
  const [expire,      setExpire]     = useState(false);
  const refs2FA = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  // Réinit MDP
  const [emailReinit, setEmailReinit] = useState('');
  const [msgReinit,   setMsgReinit]   = useState('');
  const [loadReinit,  setLoadReinit]  = useState(false);

  // Auth réelle Manager BET
  const [realSession,    setRealSession]    = useState(null);
  const [realFactorId,   setRealFactorId]   = useState(null);
  const [realProfil,     setRealProfil]     = useState(null);
  const [twofa,          setTwofa]          = useState('');
  const [qrCode,         setQrCode]         = useState(null);
  const [secret,         setSecret]         = useState(null);
  const [enrollFactorId, setEnrollFactorId] = useState(null);
  const [showSecret,     setShowSecret]     = useState(false);

  useEffect(() => {
    if (etape !== 'deux_fa') return;
    setCompteur(DUREE_CODE); setExpire(false);
    const iv = setInterval(() => setCompteur(c => { if (c <= 1) { clearInterval(iv); setExpire(true); return 0; } return c - 1; }), 1000);
    return () => clearInterval(iv);
  }, [etape]);

  useEffect(() => {
    if (etape === 'deux_fa') refs2FA[0].current?.focus();
  }, [etape]);

  async function gererConnexion(e) {
    e.preventDefault();
    setErreur(''); setLoading(true);
    try {
      // Tous les profils BET → authentification réelle via l'API backend
      const res = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: mdp, plateforme: 'bet-elearning' }),
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) { setErreur(data.error || 'Identifiants incorrects.'); return; }

      // Bloquer si acces_elearning non activé (sauf les rôles admin_* qui ont accès natif)
      const roleAdmin = data.profil.role?.startsWith('admin_') || ['super_admin', 'admin', 'manager', 'assistant_elearning', 'professeur_titulaire', 'professeur_remplacant', 'client_entreprise'].includes(data.profil.role);
      if (!roleAdmin && !data.profil.acces_elearning) {
        setErreur("Votre accès à la plateforme e-learning n'est pas encore activé. Contactez votre Super Admin BET.");
        return;
      }

      setRealProfil(data.profil);
      setRealSession(data.session);
      if (data.requires_mfa) {
        setRealFactorId(data.factor_id);
        setEtape('real_verify');
      } else if (data.requires_enrollment) {
        await lancerEnrolement(data.session);
      } else {
        redirectUtilisateurReel(data.profil, data.session);
      }
    } catch (err) { setErreur(err.message || 'Email ou mot de passe incorrect.'); }
    finally { setLoading(false); }
  }

  async function lancerEnrolement(sess) {
    const s = sess || realSession;
    if (!s?.access_token) { setErreur('Session expirée, veuillez vous reconnecter.'); setEtape('connexion'); return; }
    try {
      const res  = await fetch(`${API_URL}/api/admin/mfa/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token }),
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) { setErreur(data.error || 'Erreur serveur.'); return; }
      setQrCode(data.qr_code); setSecret(data.secret); setEnrollFactorId(data.factor_id);
      setEtape('real_enroll');
    } catch { setErreur('Erreur de connexion au serveur.'); }
  }

  async function verifierTotp(e) {
    e.preventDefault();
    if (twofa.length !== 6) { setErreur('Saisissez les 6 chiffres.'); return; }
    if (!realSession?.access_token) {
      setErreur('Session expirée - revenez à la connexion et reconnectez-vous.');
      setEtape('connexion');
      return;
    }
    setErreur(''); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/mfa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token:  realSession.access_token,
          refresh_token: realSession.refresh_token,
          factor_id:     realFactorId,
          code:          twofa,
          plateforme:    'bet-elearning',
        }),
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) { setErreur(data.error || `Erreur ${res.status}`); return; }
      redirectUtilisateurReel(data.profil || realProfil, data.session || realSession);
    } catch (err) {
      console.error('[2FA] fetch error:', err);
      setErreur('Erreur réseau : ' + (err?.message || String(err)));
    }
    finally { setLoading(false); }
  }

  async function confirmerEnrolement(e) {
    e.preventDefault();
    if (twofa.length !== 6) { setErreur('Saisissez les 6 chiffres.'); return; }
    if (!realSession?.access_token) {
      setErreur('Session expirée, veuillez vous reconnecter.');
      setEtape('connexion');
      return;
    }
    setErreur(''); setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/admin/mfa/enroll/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token:  realSession.access_token,
          refresh_token: realSession.refresh_token,
          factor_id:     enrollFactorId,
          code:          twofa,
          plateforme:    'bet-elearning',
        }),
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) { setErreur(data.error || 'Code incorrect ou expiré.'); return; }
      redirectUtilisateurReel(data.profil || realProfil, data.session || realSession);
    } catch { setErreur('Erreur de connexion au serveur.'); }
    finally { setLoading(false); }
  }

  function redirectUtilisateurReel(p, sess) {
    const roleBet = ROLE_MAP_BET[p.role];
    if (!roleBet) {
      setErreur("Rôle du compte non reconnu - contactez un administrateur.");
      return;
    }
    localStorage.setItem('admin_token',   sess.access_token);
    localStorage.setItem('admin_refresh', sess.refresh_token);
    localStorage.setItem('admin_profil',  JSON.stringify(p));
    const profilBet = {
      id:         p.id,
      role:       roleBet,
      prenom:     p.prenom || '',
      nom:        p.nom    || '',
      email:      p.email  || email,
      est_actif:  true,
      couleur:    p.couleur    || null,
      avatar_url: p.avatar_url || null,
      permissions: p.permissions || {},
    };
    connexionReel(profilBet);
    navigate(ROLE_REDIRECT[roleBet] || '/admin/manager');
  }

  function handleCode2FA(i, val) {
    const v = val.replace(/\D/g, '').slice(-1);
    const next = [...code2FA]; next[i] = v; setCode2FA(next); setErreur2FA('');
    if (v && i < 5) refs2FA[i + 1].current?.focus();
    if (next.every(c => c)) verifier2FA(next.join(''));
  }
  function handleKey2FA(i, e) {
    if (e.key === 'Backspace' && !code2FA[i] && i > 0) refs2FA[i - 1].current?.focus();
  }
  function handlePaste2FA(e) {
    const txt = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!txt) return;
    const next = Array(6).fill('').map((_, i) => txt[i] || '');
    setCode2FA(next);
    if (txt.length === 6) verifier2FA(txt);
  }
  function verifier2FA(codeStr) {
    if (expire) { setErreur2FA('Code expiré. Régénérez un code.'); return; }
    if (tentatives >= 3) { setErreur2FA('Trop de tentatives. Reconnectez-vous.'); return; }
    const ok = valider2FA(codeStr);
    if (ok) {
      const p = JSON.parse(sessionStorage.getItem('bet_profil_mock') || 'null');
      if (p) navigate(ROLE_REDIRECT[p.role] || '/connexion');
    } else {
      setTentatives(t => t + 1);
      setErreur2FA(`Code incorrect. ${2 - tentatives} essai${tentatives < 2 ? 's' : ''} restant.`);
      setCode2FA(['', '', '', '', '', '']); refs2FA[0].current?.focus();
    }
  }
  function renvoyer2FA() {
    setCode2FA(['', '', '', '', '', '']); setErreur2FA(''); setTentatives(0); setExpire(false); setCompteur(DUREE_CODE);
    refs2FA[0].current?.focus();
  }
  async function gererReinit(e) {
    e.preventDefault(); setMsgReinit(''); setLoadReinit(true);
    try { const r = await reinitMDP(emailReinit); if (r.succes) setMsgReinit(r.message || 'Email envoyé !'); }
    catch { setMsgReinit("Erreur lors de l'envoi. Réessayez."); }
    finally { setLoadReinit(false); }
  }

  const profilSelec = PROFILS_BET.find(p => p.id === profil);

  // ── Panneau gauche (commun à toutes les étapes) ────────────────────────────
  const PanneauGauche = () => (
    <div style={{ width: '48%', position: 'relative', overflow: 'hidden',
      background: `linear-gradient(160deg, ${NAVY} 0%, #0D2137 40%, ${CYAN_F} 100%)` }}>
      {/* Blobs décoratifs */}
      <div style={{ position:'absolute', width:400, height:400, borderRadius:'50%',
        background:'rgba(8,145,178,0.12)', top:-80, left:-100, animation:'betFloat 9s ease-in-out infinite' }} />
      <div style={{ position:'absolute', width:280, height:280, borderRadius:'50%',
        background:'rgba(15,23,42,0.3)', bottom:-60, right:-60, animation:'betFloat 12s ease-in-out infinite reverse' }} />
      <div style={{ position:'absolute', width:160, height:160, borderRadius:'50%',
        background:'rgba(8,145,178,0.08)', top:'42%', left:'58%', animation:'betFloat 7s ease-in-out infinite 2s' }} />

      {/* Contenu */}
      <div style={{ position:'relative', zIndex:2, height:'100%', display:'flex',
        flexDirection:'column', justifyContent:'center', padding:'56px 48px' }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:40 }}>
          <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="BET Logo"
            style={{ width:56, height:56, borderRadius:16, objectFit:'contain',
              background:'rgba(255,255,255,0.12)', border:'2px solid rgba(255,255,255,0.2)',
              padding:4 }}/>
          <div>
            <div style={{ fontSize:16, fontWeight:900, color:BLANC, lineHeight:1.1,
              fontFamily:'"Plus Jakarta Sans",sans-serif', letterSpacing:'0.02em' }}>
              <span style={{ color: CYAN }}>BET</span> E-Learning
            </div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)',
              letterSpacing:'0.16em', textTransform:'uppercase', marginTop:2 }}>
              Centre de formation certifié
            </div>
          </div>
        </div>

        {/* Accroche */}
        <h1 style={{ fontFamily:'"Plus Jakarta Sans",sans-serif', fontSize:44,
          fontWeight:900, lineHeight:1.08, color:BLANC, margin:'0 0 18px' }}>
          Formez,<br />accompagnez,<br /><span style={{ color: CYAN }}>réussissez.</span>
        </h1>
        <p style={{ fontSize:14, color:'rgba(255,255,255,0.6)', lineHeight:1.75,
          marginBottom:36, maxWidth:340 }}>
          Accès sécurisé à l'ensemble des outils pédagogiques et de gestion de la plateforme British English Training.
        </p>

        {/* Modules */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:32 }}>
          {MODULES.map(m => (
            <span key={m} style={{ padding:'5px 13px', borderRadius:20, fontSize:12, fontWeight:500,
              background:'rgba(255,255,255,0.09)', color:'rgba(255,255,255,0.75)',
              border:'1px solid rgba(255,255,255,0.13)' }}>{m}</span>
          ))}
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {STATS_BET.map(s => (
            <div key={s.l} style={{ padding:'14px 16px', borderRadius:14,
              background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)',
              backdropFilter:'blur(10px)' }}>
              <div style={{ fontSize:22, fontWeight:800, color: CYAN,
                fontFamily:'"Plus Jakarta Sans",sans-serif' }}>{s.n}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:3 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Étape 2FA réelle : vérification TOTP (Manager BET) ───────────────────
  if (etape === 'real_verify') {
    return (
      <div style={{ display:'flex', height:'100vh', width:'100vw',
        fontFamily:'"Plus Jakarta Sans",sans-serif', overflow:'hidden' }}>
        <style>{`@keyframes betFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(14px,-18px) scale(1.04)}}`}</style>
        <PanneauGauche />
        <div style={{ flex:1, background:'#F8FAFC', display:'flex', alignItems:'center',
          justifyContent:'center', padding:'48px 52px', overflowY:'auto' }}>
          <div style={{ width:'100%', maxWidth:380 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:28 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:'#E0F2FE',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🔐</div>
              <div style={{ fontSize:11, fontWeight:600, color:GRIS,
                letterSpacing:'0.1em', textTransform:'uppercase' }}>Vérification 2FA</div>
            </div>
            <h2 style={{ fontSize:30, fontWeight:800, color:NAVY, margin:'0 0 6px', lineHeight:1.15 }}>
              Double authentification 🛡️
            </h2>
            <p style={{ fontSize:13, color:GRIS, marginBottom:24, lineHeight:1.6 }}>
              Saisissez le code à 6 chiffres de votre application authenticator (Google Authenticator, Authy…).
            </p>
            {erreur && <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8,
              padding:'9px 13px', fontSize:12, color:'#991B1B', marginBottom:12 }}>⚠️ {erreur}</div>}
            <form onSubmit={verifierTotp} style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ display:'flex', gap:9, justifyContent:'center' }}>
                {[0,1,2,3,4,5].map(i => (
                  <input key={i} type="text" inputMode="numeric" maxLength={1}
                    value={twofa[i] || ''}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/,'');
                      const arr = twofa.split(''); arr[i] = v;
                      setTwofa(arr.join('').slice(0,6));
                      if (v && e.target.nextElementSibling) e.target.nextElementSibling.focus();
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Backspace' && !twofa[i] && e.target.previousElementSibling)
                        e.target.previousElementSibling.focus();
                    }}
                    autoFocus={i === 0}
                    style={{ width:46, height:56, textAlign:'center', fontSize:22, fontWeight:800,
                      borderRadius:10, border:`2px solid ${twofa[i] ? CYAN : '#E2E8F0'}`,
                      outline:'none', fontFamily:'inherit', color:NAVY,
                      background: twofa[i] ? '#EFF6FF' : BLANC, transition:'all .15s' }}
                  />
                ))}
              </div>
              <button type="submit" disabled={loading || twofa.length !== 6}
                style={{ padding:'13px', borderRadius:10, border:'none',
                  background: twofa.length === 6 && !loading ? `linear-gradient(135deg,${NAVY},${CYAN_F})` : '#94A3B8',
                  color:BLANC, fontSize:14, fontWeight:700,
                  cursor: twofa.length === 6 && !loading ? 'pointer' : 'not-allowed',
                  fontFamily:'inherit' }}>
                {loading ? 'Vérification…' : 'Vérifier →'}
              </button>
            </form>
            <button onClick={() => { setEtape('connexion'); setTwofa(''); setErreur(''); }}
              style={{ width:'100%', marginTop:12, padding:'11px', borderRadius:10,
                border:'1.5px solid #E2E8F0', background:'transparent', color:GRIS,
                fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
              ← Retour à la connexion
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Étape 2FA réelle : enrôlement TOTP (Manager BET, premier usage) ──────
  if (etape === 'real_enroll') {
    return (
      <div style={{ display:'flex', height:'100vh', width:'100vw',
        fontFamily:'"Plus Jakarta Sans",sans-serif', overflow:'hidden' }}>
        <style>{`@keyframes betFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(14px,-18px) scale(1.04)}}`}</style>
        <PanneauGauche />
        <div style={{ flex:1, background:'#F8FAFC', display:'flex', alignItems:'center',
          justifyContent:'center', padding:'48px 52px', overflowY:'auto' }}>
          <div style={{ width:'100%', maxWidth:380 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:24 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:'#D1FAE5',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>📲</div>
              <div style={{ fontSize:11, fontWeight:600, color:GRIS,
                letterSpacing:'0.1em', textTransform:'uppercase' }}>Configuration 2FA</div>
            </div>
            <h2 style={{ fontSize:30, fontWeight:800, color:NAVY, margin:'0 0 6px', lineHeight:1.15 }}>
              Activer l'authentificateur 🔑
            </h2>
            <p style={{ fontSize:13, color:GRIS, marginBottom:16, lineHeight:1.6 }}>
              Scannez ce QR code avec Google Authenticator ou Authy, puis saisissez le code généré.
            </p>
            {qrCode && (
              <div style={{ textAlign:'center', margin:'12px 0' }}>
                <div dangerouslySetInnerHTML={{ __html: qrCode }}
                  style={{ display:'inline-block', background:'#fff', padding:10,
                    borderRadius:12, border:'1.5px solid #E2E8F0' }} />
              </div>
            )}
            <div style={{ marginBottom:14 }}>
              <button type="button" onClick={() => setShowSecret(v => !v)}
                style={{ fontSize:11, color:CYAN, background:'none', border:'none',
                  cursor:'pointer', textDecoration:'underline', padding:0, fontFamily:'inherit' }}>
                {showSecret ? 'Masquer la clé secrète' : 'Afficher la clé secrète'}
              </button>
              {showSecret && secret && (
                <div style={{ marginTop:8, padding:'8px 12px', background:'#F1F5F9',
                  borderRadius:8, fontFamily:'monospace', fontSize:13,
                  letterSpacing:'0.1em', color:NAVY, wordBreak:'break-all' }}>
                  {secret}
                </div>
              )}
            </div>
            {erreur && <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8,
              padding:'9px 13px', fontSize:12, color:'#991B1B', marginBottom:12 }}>⚠️ {erreur}</div>}
            <form onSubmit={confirmerEnrolement} style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ display:'flex', gap:9, justifyContent:'center' }}>
                {[0,1,2,3,4,5].map(i => (
                  <input key={i} type="text" inputMode="numeric" maxLength={1}
                    value={twofa[i] || ''}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/,'');
                      const arr = twofa.split(''); arr[i] = v;
                      setTwofa(arr.join('').slice(0,6));
                      if (v && e.target.nextElementSibling) e.target.nextElementSibling.focus();
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Backspace' && !twofa[i] && e.target.previousElementSibling)
                        e.target.previousElementSibling.focus();
                    }}
                    autoFocus={i === 0}
                    style={{ width:46, height:56, textAlign:'center', fontSize:22, fontWeight:800,
                      borderRadius:10, border:`2px solid ${twofa[i] ? CYAN : '#E2E8F0'}`,
                      outline:'none', fontFamily:'inherit', color:NAVY,
                      background: twofa[i] ? '#EFF6FF' : BLANC, transition:'all .15s' }}
                  />
                ))}
              </div>
              <button type="submit" disabled={loading || twofa.length !== 6}
                style={{ padding:'13px', borderRadius:10, border:'none',
                  background: twofa.length === 6 && !loading ? `linear-gradient(135deg,${NAVY},${CYAN_F})` : '#94A3B8',
                  color:BLANC, fontSize:14, fontWeight:700,
                  cursor: twofa.length === 6 && !loading ? 'pointer' : 'not-allowed',
                  fontFamily:'inherit' }}>
                {loading ? 'Activation…' : 'Activer le 2FA →'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── Étape 2FA mock ─────────────────────────────────────────────────────────
  if (etape === 'deux_fa') {
    const nomParent = profilEnAttente2FA
      ? `${profilEnAttente2FA.prenom} ${profilEnAttente2FA.nom}` : 'l\'utilisateur';
    return (
      <div style={{ display:'flex', height:'100vh', width:'100vw',
        fontFamily:'"Plus Jakarta Sans",sans-serif', overflow:'hidden' }}>
        <style>{`@keyframes betFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(14px,-18px) scale(1.04)}}`}</style>
        <PanneauGauche />
        <div style={{ flex:1, background:'#F8FAFC', display:'flex', alignItems:'center',
          justifyContent:'center', padding:'48px 52px', overflowY:'auto' }}>
          <div style={{ width:'100%', maxWidth:380 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:28 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:'#F5F3FF',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🔐</div>
              <div style={{ fontSize:11, fontWeight:600, color:GRIS,
                letterSpacing:'0.1em', textTransform:'uppercase' }}>Vérification 2FA</div>
            </div>
            <h2 style={{ fontSize:30, fontWeight:800, color:NAVY, margin:'0 0 6px', lineHeight:1.15 }}>
              Vérification<br />en 2 étapes 🛡️
            </h2>
            <p style={{ fontSize:13, color:GRIS, marginBottom:24, lineHeight:1.6 }}>
              Bonjour <strong style={{ color:NAVY }}>{nomParent}</strong> - saisissez le code de votre application authenticator.
            </p>

            {/* Compteur */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12, marginBottom:24 }}>
              <div style={{ position:'relative', width:46, height:46 }}>
                <svg width="46" height="46" style={{ transform:'rotate(-90deg)' }}>
                  <circle cx="23" cy="23" r="19" fill="none" stroke="#E2E8F0" strokeWidth="4"/>
                  <circle cx="23" cy="23" r="19" fill="none"
                    stroke={expire ? '#EF4444' : compteur > 10 ? '#10B981' : '#F59E0B'}
                    strokeWidth="4" strokeDasharray={`${2 * Math.PI * 19}`}
                    strokeDashoffset={`${2 * Math.PI * 19 * (1 - compteur / DUREE_CODE)}`}
                    style={{ transition:'stroke-dashoffset 1s linear, stroke .3s' }}/>
                </svg>
                <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
                  justifyContent:'center', fontSize:12, fontWeight:800,
                  color: expire ? '#EF4444' : NAVY }}>{compteur}</span>
              </div>
              <span style={{ fontSize:12, color: expire ? '#EF4444' : GRIS, fontWeight: expire ? 700 : 400 }}>
                {expire ? 'Code expiré' : `Valide encore ${compteur}s`}
              </span>
            </div>

            {/* OTP inputs */}
            <div style={{ display:'flex', gap:9, justifyContent:'center', marginBottom:14 }}>
              {code2FA.map((d, i) => (
                <input key={i} ref={refs2FA[i]} type="text" inputMode="numeric" maxLength={1} value={d}
                  onChange={e => handleCode2FA(i, e.target.value)}
                  onKeyDown={e => handleKey2FA(i, e)}
                  onPaste={i === 0 ? handlePaste2FA : undefined}
                  style={{ width:46, height:56, textAlign:'center', fontSize:22, fontWeight:800,
                    borderRadius:10, border:`2px solid ${d ? '#8B5CF6' : erreur2FA ? '#EF4444' : '#E2E8F0'}`,
                    outline:'none', fontFamily:'inherit', color:NAVY,
                    background: d ? '#F5F3FF' : BLANC, transition:'all .15s' }}/>
              ))}
            </div>
            {erreur2FA && <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8,
              padding:'9px 13px', fontSize:12, color:'#991B1B', marginBottom:12 }}>⚠️ {erreur2FA}</div>}

            <div style={{ textAlign:'center', marginBottom:18 }}>
              {expire || tentatives >= 3 ? (
                <button onClick={renvoyer2FA} style={{ width:'100%', padding:'13px', background:'linear-gradient(135deg,#7C3AED,#8B5CF6)',
                  color:BLANC, border:'none', borderRadius:10, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                  🔄 Régénérer un code
                </button>
              ) : (
                <span style={{ fontSize:12, color:GRIS }}>Code validé automatiquement dès les 6 chiffres saisis.</span>
              )}
            </div>

            <div style={{ background:'#EFF6FF', borderRadius:10, padding:'10px 14px', fontSize:12,
              color:'#1D4ED8', border:'1px solid #BFDBFE', textAlign:'center', marginBottom:16 }}>
              🧪 Mode démo - code : <strong>123456</strong>
            </div>

            <button onClick={() => { annuler2FA(); setEtape('connexion'); setCode2FA(['','','','','','']); }}
              style={{ width:'100%', padding:'11px', borderRadius:10, border:'1.5px solid #E2E8F0',
                background:'transparent', color:GRIS, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
              ← Retour à la connexion
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Étape MDP oublié ──────────────────────────────────────────────────────
  if (etape === 'mdp_oublie') {
    return (
      <div style={{ display:'flex', height:'100vh', width:'100vw',
        fontFamily:'"Plus Jakarta Sans",sans-serif', overflow:'hidden' }}>
        <style>{`@keyframes betFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(14px,-18px) scale(1.04)}}`}</style>
        <PanneauGauche />
        <div style={{ flex:1, background:'#F8FAFC', display:'flex', alignItems:'center',
          justifyContent:'center', padding:'48px 52px' }}>
          <div style={{ width:'100%', maxWidth:380 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:28 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:'#FEF3C7',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🔑</div>
              <div style={{ fontSize:11, fontWeight:600, color:GRIS, letterSpacing:'0.1em', textTransform:'uppercase' }}>Mot de passe</div>
            </div>
            <h2 style={{ fontSize:30, fontWeight:800, color:NAVY, margin:'0 0 6px', lineHeight:1.15 }}>
              Réinitialiser<br />le mot de passe 🔐
            </h2>
            <p style={{ fontSize:13, color:GRIS, marginBottom:24, lineHeight:1.6 }}>
              Renseignez votre email. Vous recevrez un lien pour choisir un nouveau mot de passe.
            </p>
            <form onSubmit={gererReinit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:'#475569', display:'block', marginBottom:6 }}>Adresse email</label>
                <div style={{ position:'relative' }}>
                  <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:16, pointerEvents:'none' }}>✉️</span>
                  <input type="email" value={emailReinit} onChange={e => setEmailReinit(e.target.value)} required placeholder="votre@email.com"
                    autoFocus
                    style={{ width:'100%', padding:'12px 14px 12px 44px', border:'1.5px solid #E2E8F0', borderRadius:10,
                      fontSize:14, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:NAVY }}
                    onFocus={e => { e.target.style.borderColor = CYAN; e.target.style.boxShadow = `0 0 0 3px ${CYAN}20`; }}
                    onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}/>
                </div>
              </div>
              {msgReinit && (
                <div style={{ padding:'10px 14px', borderRadius:9, fontSize:13,
                  background: msgReinit.startsWith('Erreur') ? '#FEF2F2' : '#D1FAE5',
                  color: msgReinit.startsWith('Erreur') ? '#991B1B' : '#065F46',
                  border: `1px solid ${msgReinit.startsWith('Erreur') ? '#FECACA' : '#6EE7B7'}` }}>
                  {msgReinit}
                </div>
              )}
              <button type="submit" disabled={loadReinit}
                style={{ padding:'13px', borderRadius:10, border:'none', cursor: loadReinit ? 'not-allowed' : 'pointer',
                  background: loadReinit ? '#94A3B8' : 'linear-gradient(135deg,#D97706,#F97316)',
                  color:BLANC, fontSize:14, fontWeight:700, fontFamily:'inherit' }}>
                {loadReinit ? 'Envoi…' : '📧 Envoyer le lien de réinitialisation'}
              </button>
            </form>
            <div style={{ textAlign:'center', marginTop:18 }}>
              <button onClick={() => { setEtape('connexion'); setMsgReinit(''); setEmailReinit(''); }}
                style={{ background:'none', border:'none', fontSize:13, color: CYAN, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
                ← Retour à la connexion
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Layout principal (étapes choix_profil + connexion) ────────────────────
  return (
    <div style={{ display:'flex', height:'100vh', width:'100vw',
      fontFamily:'"Plus Jakarta Sans",sans-serif', overflow:'hidden' }}>
      <style>{`
        @keyframes betFloat {
          0%,100%{transform:translate(0,0) scale(1)}
          50%{transform:translate(14px,-18px) scale(1.04)}
        }
        @keyframes betFadeIn {
          from{opacity:0;transform:translateY(10px)}
          to{opacity:1;transform:translateY(0)}
        }
        .bet-profil-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.12) !important; }
        .bet-demo-item:hover { background: #F0F9FF !important; }
        .bet-compte-item:hover { background: #F0F9FF !important; }
      `}</style>

      {/* ── Panneau gauche ── */}
      <PanneauGauche />

      {/* ── Panneau droit ── */}
      <div style={{ flex:1, background:'#F8FAFC', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center', padding:'32px 48px', overflowY:'auto', position:'relative' }}>

        <div style={{ position:'absolute', top:16, right:20, zIndex:10 }}>
          <BoutonLangueClair />
        </div>

        {/* Déco fond droit */}
        <div style={{ position:'absolute', bottom:-80, right:-80, width:260, height:260,
          borderRadius:'50%', background:'rgba(8,145,178,0.05)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', top:-50, left:-50, width:180, height:180,
          borderRadius:'50%', background:'rgba(15,23,42,0.03)', pointerEvents:'none' }}/>

        <div style={{ width:'100%', maxWidth: etape === 'choix_profil' ? 640 : 400,
          position:'relative', zIndex:1, animation:'betFadeIn .3s ease' }}>

          {/* En-tête formulaire */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:28 }}>
            <div style={{ width:36, height:36, borderRadius:9, background: CYAN + '20',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:16,
              fontWeight:800, color: CYAN_F }}>B</div>
            <div style={{ width:1, height:28, background:'#E2E8F0' }}/>
            <div style={{ fontSize:11, fontWeight:600, color:GRIS, letterSpacing:'0.1em', textTransform:'uppercase' }}>
              {etape === 'choix_profil'
                ? 'Sélection du profil'
                : profilSelec ? profilSelec.label : 'Connexion sécurisée'}
            </div>
          </div>

          {/* ── ÉTAPE 0 : Choix du profil ── */}
          {etape === 'choix_profil' && (
            <>
              <h2 style={{ fontSize:30, fontWeight:800, color:NAVY, margin:'0 0 6px', lineHeight:1.15 }}>
                Qui êtes-vous ? 👋
              </h2>
              <p style={{ fontSize:13, color:GRIS, marginBottom:22, lineHeight:1.6 }}>
                Sélectionnez votre profil pour accéder à votre espace BET.
              </p>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:22 }}>
                {PROFILS_BET.map(p => (
                  <button key={p.id} type="button"
                    className="bet-profil-card"
                    onClick={() => { setProfil(p.id); setEtape('connexion'); setErreur(''); }}
                    style={{ padding:'12px 10px', borderRadius:12,
                      border:`2px solid ${p.color}30`,
                      background: p.bg, cursor:'pointer', textAlign:'left',
                      transition:'all .2s', boxShadow:'0 2px 6px rgba(0,0,0,0.06)',
                      fontFamily:'inherit' }}>
                    <div style={{ fontSize:22, marginBottom:5 }}>{p.emoji}</div>
                    <div style={{ fontSize:12, fontWeight:700, color: p.color, lineHeight:1.2 }}>{p.label}</div>
                    <div style={{ fontSize:10, color:'#64748B', marginTop:3, lineHeight:1.4 }}>{p.desc}</div>
                  </button>
                ))}
              </div>

            </>
          )}

          {/* ── ÉTAPE 1 : Formulaire email/mot de passe ── */}
          {etape === 'connexion' && (
            <>
              {/* Badge profil sélectionné */}
              {profilSelec && (
                <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px',
                  borderRadius:11, background: profilSelec.bg,
                  border:`1.5px solid ${profilSelec.color}35`, marginBottom:20 }}>
                  <span style={{ fontSize:22 }}>{profilSelec.emoji}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:13, color: profilSelec.color }}>{profilSelec.label}</div>
                    <div style={{ fontSize:11, color:'#64748B' }}>{profilSelec.desc}</div>
                  </div>
                  <button type="button" onClick={() => { setEtape('choix_profil'); setProfil(null); setErreur(''); setEmail(''); setMdp(''); }}
                    style={{ fontSize:11, color:'#64748B', background:'none', border:'1px solid #E2E8F0',
                      borderRadius:7, padding:'3px 9px', cursor:'pointer', fontFamily:'inherit' }}>
                    Changer
                  </button>
                </div>
              )}

              <h2 style={{ fontSize:30, fontWeight:800, color:NAVY, margin:'0 0 6px', lineHeight:1.15 }}>
                Connexion<br />sécurisée 🔐
              </h2>
              <p style={{ fontSize:13, color:GRIS, marginBottom:22, lineHeight:1.6 }}>
                Entrez vos identifiants pour accéder à votre espace.
              </p>

              <div style={{ padding:'8px 14px', borderRadius:9, background:'#EFF6FF',
                border:'1px solid #BFDBFE', fontSize:12, color:'#1D4ED8', fontWeight:500, marginBottom:20 }}>
                🔒 Connexion chiffrée SSL/TLS - Zone sécurisée
              </div>

              <form onSubmit={gererConnexion} style={{ display:'flex', flexDirection:'column', gap:18 }}>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:'#475569', display:'block', marginBottom:6 }}>Email</label>
                  <div style={{ position:'relative' }}>
                    <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:15, pointerEvents:'none' }}>✉️</span>
                    <input type="email" value={email} required onChange={e => setEmail(e.target.value)}
                      placeholder="prenom.nom@bet.ci" autoFocus autoComplete="username"
                      style={{ width:'100%', padding:'12px 14px 12px 44px', border:'1.5px solid #E2E8F0',
                        borderRadius:10, fontSize:14, fontFamily:'inherit', outline:'none',
                        boxSizing:'border-box', color:NAVY }}
                      onFocus={e => { e.target.style.borderColor = CYAN; e.target.style.boxShadow = `0 0 0 3px ${CYAN}20`; }}
                      onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}/>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:'#475569', display:'block', marginBottom:6 }}>Mot de passe</label>
                  <div style={{ position:'relative' }}>
                    <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:15, pointerEvents:'none' }}>🔒</span>
                    <input type={showMdp ? 'text' : 'password'} value={mdp} required
                      onChange={e => setMdp(e.target.value)} placeholder="••••••••••••"
                      autoComplete="current-password"
                      style={{ width:'100%', padding:'12px 44px 12px 44px', border:'1.5px solid #E2E8F0',
                        borderRadius:10, fontSize:14, fontFamily:'inherit', outline:'none',
                        boxSizing:'border-box', color:NAVY }}
                      onFocus={e => { e.target.style.borderColor = CYAN; e.target.style.boxShadow = `0 0 0 3px ${CYAN}20`; }}
                      onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}/>
                    <button type="button" onClick={() => setShowMdp(v => !v)}
                      style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                        background:'none', border:'none', cursor:'pointer', fontSize:15, color:GRIS, padding:0 }}>
                      {showMdp ? '🙈' : '👁️'}
                    </button>
                  </div>
                  <div style={{ textAlign:'right', marginTop:6 }}>
                    <button type="button" onClick={() => { setEtape('mdp_oublie'); setEmailReinit(email); }}
                      style={{ fontSize:12, color: CYAN, background:'none', border:'none', cursor:'pointer',
                        fontFamily:'inherit', fontWeight:500 }}>
                      Mot de passe oublié ?
                    </button>
                  </div>
                </div>

                {erreur && (
                  <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:9,
                    padding:'10px 14px', fontSize:13, color:'#991B1B' }}>⚠️ {erreur}</div>
                )}

                <button type="submit" disabled={loading}
                  style={{ padding:'14px', borderRadius:10, border:'none',
                    background: loading ? '#94A3B8' : `linear-gradient(135deg, ${NAVY}, ${CYAN_F})`,
                    color:BLANC, fontSize:15, fontWeight:700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontFamily:'inherit', display:'flex', alignItems:'center',
                    justifyContent:'center', gap:8, position:'relative', overflow:'hidden' }}>
                  {loading ? (
                    <><div style={{ width:18, height:18, border:'2px solid rgba(255,255,255,0.35)',
                      borderTopColor:'#fff', borderRadius:'50%',
                      animation:'betSpin .7s linear infinite' }}/> Connexion…</>
                  ) : 'Se connecter →'}
                </button>

                <button type="button" onClick={() => { setEtape('choix_profil'); setProfil(null); setErreur(''); }}
                  style={{ padding:'11px', borderRadius:10, border:'1.5px solid #E2E8F0',
                    background:'transparent', color:GRIS, fontSize:13, fontWeight:600,
                    cursor:'pointer', fontFamily:'inherit' }}>
                  ← Retour au choix du profil
                </button>
              </form>
            </>
          )}
        </div>
      </div>
      <style>{`
        @keyframes betSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
