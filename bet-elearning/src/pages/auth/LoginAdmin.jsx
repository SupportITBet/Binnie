import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROLE_REDIRECT, ROLE_MAP_BET, estStaff, roleBetDe } from '../../constants/roles';
import { COULEURS } from '../../constants/couleurs';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

export default function LoginAdmin() {
  const navigate = useNavigate();
  const { connexionReel } = useAuth();

  const [email,       setEmail]       = useState('');
  const [motDePasse,  setMotDePasse]  = useState('');
  const [afficherMDP, setAfficherMDP] = useState(false);
  const [erreur,      setErreur]      = useState('');
  const [chargement,  setChargement]  = useState(false);
  const [compteBloque, setCompteBloque] = useState(null); // { prenom, nom, email } ou null

  // ── 2FA réel ────────────────────────────────────────────────────────────────
  const [realStep,        setRealStep]        = useState(null); // null | 'verify' | 'enroll'
  const [realSession,     setRealSession]     = useState(null);
  const [realFactorId,    setRealFactorId]    = useState(null);
  const [realProfil,      setRealProfil]      = useState(null);
  const [twofa,           setTwofa]           = useState('');
  const [qrCode,          setQrCode]          = useState(null);
  const [secret,          setSecret]          = useState(null);
  const [enrollFactorId,  setEnrollFactorId]  = useState(null);
  const [showSecret,      setShowSecret]      = useState(false);

  // Compteur 2FA non utilisé en mode réel, gardé pour cohérence structure
  const refs2FA = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  useEffect(() => {
    if (realStep === 'verify') refs2FA[0]?.current?.focus();
  }, [realStep]);

  // ── Enrichir le profil coach avec type_coach depuis l'API ───────────────────
  async function enrichirProfilCoach(profil, session) {
    try {
      const r = await fetch(`${API_URL}/api/admin/utilisateurs/${profil.id}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      if (!r.ok) return profil;
      const full = await r.json();
      // Fusionner type_coach et role du profil complet avec les données login
      return { ...profil, type_coach: full.type_coach, role: full.role || profil.role };
    } catch {
      return profil;
    }
  }

  // ── Connexion via l'API BET réelle (tous les utilisateurs) ──────────────────
  async function gererConnexionReelle(e) {
    e.preventDefault();
    setErreur(''); setChargement(true);
    try {
      const res  = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: motDePasse, plateforme: 'bet-elearning' }),
      });
      const data = await res.json();
      if (!res.ok) { setErreur(data.error || 'Identifiants incorrects.'); return; }

      /* `acces_elearning` NE S'APPLIQUE PLUS AU PERSONNEL. Ce drapeau existe pour ouvrir la
         plateforme aux apprenants et aux parents au cas par cas ; l'appliquer au staff refusait
         l'entrée à quarante-deux des quarante-neuf comptes actifs, dont l'Administrateur.
         La liste en dur qui précédait reposait sur `role.startsWith('admin_')` — vrai du temps
         des rôles de façade, faux depuis que chaque métier porte son propre nom. */
      if (!estStaff(data.profil.role) && data.profil.acces_elearning === false) {
        setCompteBloque({ prenom: data.profil.prenom || '', nom: data.profil.nom || '', email: data.profil.email || email });
        return;
      }

      // Pour les coachs : récupérer le profil complet pour avoir type_coach
      let profil = data.profil;
      if (data.profil.role === 'coach') {
        profil = await enrichirProfilCoach(data.profil, data.session);
      }

      setRealProfil(profil);
      setRealSession(data.session);

      if (data.requires_mfa) {
        setRealFactorId(data.factor_id);
        setRealStep('verify');
      } else if (data.requires_enrollment) {
        await lancerEnrolement(data.session);
      } else {
        redirectUtilisateurReel(profil, data.session);
      }
    } catch {
      setErreur('Erreur de connexion au serveur.');
    } finally {
      setChargement(false);
    }
  }

  async function lancerEnrolement(sess) {
    const s = sess || realSession;
    setChargement(true);
    try {
      const res  = await fetch(`${API_URL}/api/admin/mfa/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token }),
      });
      const data = await res.json();
      if (!res.ok) { setErreur(data.error || 'Erreur serveur.'); return; }
      setQrCode(data.qr_code);
      setSecret(data.secret);
      setEnrollFactorId(data.factor_id);
      setRealStep('enroll');
    } catch {
      setErreur('Erreur de connexion au serveur.');
    } finally {
      setChargement(false);
    }
  }

  async function verifierTotp(e) {
    e.preventDefault();
    if (twofa.length !== 6) { setErreur('Saisissez les 6 chiffres du code.'); return; }
    setErreur(''); setChargement(true);
    try {
      const res  = await fetch(`${API_URL}/api/admin/mfa/verify`, {
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
      const data = await res.json();
      if (!res.ok) { setErreur(data.error || 'Code incorrect.'); return; }
      // Utiliser realProfil (enrichi avec type_coach si coach) plutôt que data.profil
      redirectUtilisateurReel(realProfil || data.profil, data.session);
    } catch {
      setErreur('Erreur de connexion au serveur.');
    } finally {
      setChargement(false);
    }
  }

  async function confirmerEnrolement(e) {
    e.preventDefault();
    if (twofa.length !== 6) { setErreur('Saisissez les 6 chiffres du code.'); return; }
    setErreur(''); setChargement(true);
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
      const data = await res.json();
      if (!res.ok) { setErreur(data.error || 'Code incorrect.'); return; }
      redirectUtilisateurReel(realProfil, data.session);
    } catch {
      setErreur('Erreur de connexion au serveur.');
    } finally {
      setChargement(false);
    }
  }

  async function redirectUtilisateurReel(profil, sess) {
    localStorage.setItem('admin_token',   sess.access_token);
    localStorage.setItem('admin_refresh', sess.refresh_token);
    localStorage.setItem('admin_profil',  JSON.stringify(profil));

    // Mapper le rôle backend vers le rôle bet-elearning
    let roleBet = roleBetDe(profil.role) || profil.role || 'admin_elearning';
    // Pour les coachs : type_coach (enregistré via PATCH) prime sur le rôle générique
    if (profil.role === 'coach') {
      if (profil.type_coach === 'professeur_remplacant') roleBet = 'professeur_remplacant';
      else if (profil.type_coach === 'professeur_titulaire') roleBet = 'professeur_titulaire';
    }
    const profilBet = {
      id:        profil.id,
      role:      roleBet,
      // `role_reel` est conservé par simple prudence : depuis la dé-fusion, ROLE_MAP_BET ne
      // traduit plus que des synonymes, donc il vaut presque toujours `role`. Il reste utile
      // le jour où un alias devrait être affiché sous son nom d'origine.
      role_reel: profil.role,
      prenom:    profil.prenom || '',
      nom:       profil.nom    || '',
      email:     profil.email  || email,
      est_actif: true,
      couleur:   profil.couleur || null,
      avatar_url: profil.avatar_url || null,
      permissions: profil.permissions || {},
    };
    // Mettre à jour le state React immédiatement (sessionStorage seul ne suffit pas)
    connexionReel(profilBet);

    // Synchroniser la session Supabase côté client (mode production)
    if (supabase && sess.access_token && sess.refresh_token) {
      await supabase.auth.setSession({
        access_token:  sess.access_token,
        refresh_token: sess.refresh_token,
      });
    }

    navigate(ROLE_REDIRECT[roleBet] || '/admin/manager');
  }

  function retourConnexionReelle() {
    setRealStep(null); setTwofa(''); setErreur('');
    setQrCode(null); setSecret(null); setShowSecret(false);
  }

  // ── Écran compte bloqué ──────────────────────────────────────────────────────
  if (compteBloque) {
    return (
      <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#0F172A 0%,#1E3A5F 60%,#7F1D1D 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'"Plus Jakarta Sans",sans-serif', padding:20 }}>
        <div style={{ background:'#fff', borderRadius:24, padding:'48px 40px', maxWidth:460, width:'100%', textAlign:'center', boxShadow:'0 32px 80px rgba(0,0,0,0.4)' }}>
          <div style={{ width:72, height:72, borderRadius:'50%', background:'#FEE2E2', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, margin:'0 auto 24px' }}>🚫</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#7F1D1D', marginBottom:8 }}>Accès E-Learning désactivé</div>
          <div style={{ fontSize:14, color:'#374151', marginBottom:24, lineHeight:1.6 }}>
            Le compte <strong>{compteBloque.prenom} {compteBloque.nom}</strong> n'a pas accès à la plateforme e-learning.<br/>
            Vos données sont conservées et accessibles à l'administration.
          </div>
          <div style={{ background:'#FEF9C3', border:'1px solid #FDE68A', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#92400E', marginBottom:28, textAlign:'left', display:'flex', gap:10, alignItems:'flex-start' }}>
            <span style={{ fontSize:16, flexShrink:0 }}>💡</span>
            <span>Contactez votre <strong>Admin BET</strong> pour activer votre accès à la plateforme e-learning.</span>
          </div>
          <button onClick={() => { setCompteBloque(null); setEmail(''); setMotDePasse(''); }}
            style={{ width:'100%', padding:'12px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#0F172A,#0891B2)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            ← Retour à la connexion
          </button>
        </div>
      </div>
    );
  }

  // ── Rendu principal ──────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0F172A 0%, #1E3A5F 50%, #0891B2 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Plus Jakarta Sans", sans-serif', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 960, display: 'flex', gap: 32, alignItems: 'stretch' }}>

        {/* ── Panneau gauche : branding ── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '40px 32px', color: '#fff',
        }}>
          <div style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:64, height:64, borderRadius:18,
            background:'rgba(255,255,255,0.1)',
            border:'2px solid rgba(255,255,255,0.2)',
            fontSize:28, marginBottom:24,
          }}>🛡️</div>

          <h1 style={{ fontSize:28, fontWeight:900, margin:'0 0 12px', lineHeight:1.2 }}>
            Administration &<br />E-Learning BET
          </h1>
          <p style={{ fontSize:13, color:'rgba(255,255,255,0.55)', lineHeight:1.7, margin:'0 0 36px' }}>
            Espace réservé aux équipes internes de Binnies' English Training.
            Accès sécurisé et traçé.
          </p>

          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[
              { lib:'Manager BET',          couleur:'#0891B2', twofa:true },
              { lib:'Superviseur',           couleur:'#8B5CF6' },
              { lib:'Agent Onboarding',      couleur:'#F97316' },
              { lib:'RH / Paie',             couleur:'#14B8A6' },
              { lib:'Assistante Corporate',  couleur:'#10B981' },
              { lib:'Professeur',            couleur:'#0D9488' },
            ].map(c => (
              <div key={c.lib} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:c.couleur, flexShrink:0 }} />
                <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>{c.lib}</span>
                {c.twofa && (
                  <span style={{ fontSize:10, background:'rgba(8,145,178,0.3)', color:'#7DD3FC',
                    padding:'1px 6px', borderRadius:6, fontWeight:700 }}>2FA</span>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => navigate('/access/bet-learning')}
            style={{ marginTop:40, display:'inline-flex', alignItems:'center', gap:6, background:'none', border:'none', color:'rgba(255,255,255,0.4)', fontSize:12, cursor:'pointer', padding:0, fontFamily:'inherit' }}
          >
            ← Retour au portail
          </button>
        </div>

        {/* ── Panneau droit ── */}
        <div style={{
          width: 420, background: '#fff', borderRadius: 24,
          padding: '48px 40px', boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>

          {/* ── 2FA réel : vérification TOTP ── */}
          {realStep === 'verify' && (
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:24 }}>
                <div style={{ width:40, height:40, borderRadius:12, background:'#EFF6FF',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🔐</div>
                <div style={{ fontSize:11, fontWeight:600, color:COULEURS.gris400,
                  letterSpacing:'0.1em', textTransform:'uppercase' }}>Vérification 2FA</div>
              </div>
              <div style={{ fontSize:22, fontWeight:800, color:'#0F172A', marginBottom:6 }}>
                Double authentification 🛡️
              </div>
              <p style={{ fontSize:13, color:COULEURS.gris400, marginBottom:22, lineHeight:1.6 }}>
                Saisissez le code à 6 chiffres de votre application authenticator (Google Authenticator, Authy…).
              </p>
              {erreur && (
                <div style={{ background:'#FEE2E2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#991B1B', marginBottom:14 }}>
                  ⚠️ {erreur}
                </div>
              )}
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
                        borderRadius:10, border:`2px solid ${twofa[i] ? '#0891B2' : '#E2E8F0'}`,
                        outline:'none', fontFamily:'inherit', color:'#0F172A',
                        background: twofa[i] ? '#EFF6FF' : '#fff', transition:'all .15s' }}
                    />
                  ))}
                </div>
                <button type="submit" disabled={chargement || twofa.length !== 6}
                  style={{ padding:'14px', borderRadius:10, border:'none',
                    background: twofa.length === 6 && !chargement ? 'linear-gradient(135deg, #0F172A, #0891B2)' : COULEURS.gris300,
                    color:'#fff', fontSize:15, fontWeight:700,
                    cursor: twofa.length === 6 && !chargement ? 'pointer' : 'not-allowed',
                    fontFamily:'inherit' }}>
                  {chargement ? 'Vérification…' : 'Vérifier →'}
                </button>
              </form>
              <button onClick={retourConnexionReelle}
                style={{ width:'100%', marginTop:12, padding:'11px', borderRadius:10,
                  border:`1.5px solid ${COULEURS.gris200}`, background:'transparent',
                  color:COULEURS.gris400, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                ← Retour à la connexion
              </button>
            </div>
          )}

          {/* ── 2FA réel : enrôlement TOTP (premier usage) ── */}
          {realStep === 'enroll' && (
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                <div style={{ width:40, height:40, borderRadius:12, background:'#F0FDF4',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>📲</div>
                <div style={{ fontSize:11, fontWeight:600, color:COULEURS.gris400,
                  letterSpacing:'0.1em', textTransform:'uppercase' }}>Configuration 2FA</div>
              </div>
              <div style={{ fontSize:20, fontWeight:800, color:'#0F172A', marginBottom:6 }}>
                Activer l'authentificateur 🔑
              </div>
              <p style={{ fontSize:13, color:COULEURS.gris400, marginBottom:16, lineHeight:1.6 }}>
                Scannez ce QR code avec Google Authenticator ou Authy, puis saisissez le code généré.
              </p>
              {qrCode && (
                <div style={{ textAlign:'center', margin:'12px 0' }}>
                  <div dangerouslySetInnerHTML={{ __html: qrCode }}
                    style={{ display:'inline-block', background:'#fff', padding:10,
                      borderRadius:12, border:`1.5px solid ${COULEURS.gris200}` }} />
                </div>
              )}
              <div style={{ marginBottom:14 }}>
                <button type="button" onClick={() => setShowSecret(v => !v)}
                  style={{ fontSize:11, color:'#0891B2', background:'none', border:'none',
                    cursor:'pointer', textDecoration:'underline', padding:0, fontFamily:'inherit' }}>
                  {showSecret ? 'Masquer la clé secrète' : 'Afficher la clé secrète'}
                </button>
                {showSecret && secret && (
                  <div style={{ marginTop:8, padding:'8px 12px', background:'#F1F5F9',
                    borderRadius:8, fontFamily:'monospace', fontSize:13,
                    letterSpacing:'0.1em', color:'#0F172A', wordBreak:'break-all' }}>
                    {secret}
                  </div>
                )}
              </div>
              {erreur && (
                <div style={{ background:'#FEE2E2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#991B1B', marginBottom:14 }}>
                  ⚠️ {erreur}
                </div>
              )}
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
                        borderRadius:10, border:`2px solid ${twofa[i] ? '#0891B2' : '#E2E8F0'}`,
                        outline:'none', fontFamily:'inherit', color:'#0F172A',
                        background: twofa[i] ? '#EFF6FF' : '#fff', transition:'all .15s' }}
                    />
                  ))}
                </div>
                <button type="submit" disabled={chargement || twofa.length !== 6}
                  style={{ padding:'14px', borderRadius:10, border:'none',
                    background: twofa.length === 6 && !chargement ? 'linear-gradient(135deg, #0F172A, #0891B2)' : COULEURS.gris300,
                    color:'#fff', fontSize:15, fontWeight:700,
                    cursor: twofa.length === 6 && !chargement ? 'pointer' : 'not-allowed',
                    fontFamily:'inherit' }}>
                  {chargement ? 'Activation…' : 'Activer le 2FA →'}
                </button>
              </form>
            </div>
          )}

          {/* ── Formulaire login ── */}
          {!realStep && (
            <>
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize:22, fontWeight:800, color:'#0F172A', marginBottom:6 }}>
                  Connexion Admin BET
                </div>
                <div style={{ fontSize:13, color:COULEURS.gris400 }}>
                  Utilisez vos identifiants BET
                </div>
              </div>

              <form onSubmit={gererConnexionReelle}
                style={{ display:'flex', flexDirection:'column', gap:20 }}>
                <div>
                  <label style={{ fontSize:12, fontWeight:700, color:'#0F172A', display:'block', marginBottom:6 }}>
                    Email professionnel
                  </label>
                  <input
                    type="email" value={email} required
                    onChange={e => setEmail(e.target.value)}
                    placeholder="prenom.nom@bet.ci"
                    style={{
                      width:'100%', padding:'12px 16px', borderRadius:10,
                      border:`1.5px solid ${COULEURS.gris200}`, fontSize:14,
                      fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:'#0F172A',
                    }}
                    onFocus={e => e.target.style.borderColor = '#0891B2'}
                    onBlur={e => e.target.style.borderColor = COULEURS.gris200}
                  />
                </div>

                <div>
                  <label style={{ fontSize:12, fontWeight:700, color:'#0F172A', display:'block', marginBottom:6 }}>
                    Mot de passe
                  </label>
                  <div style={{ position:'relative' }}>
                    <input
                      type={afficherMDP ? 'text' : 'password'}
                      value={motDePasse} required
                      onChange={e => setMotDePasse(e.target.value)}
                      placeholder="••••••••"
                      style={{
                        width:'100%', padding:'12px 44px 12px 16px', borderRadius:10,
                        border:`1.5px solid ${COULEURS.gris200}`, fontSize:14,
                        fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:'#0F172A',
                      }}
                      onFocus={e => e.target.style.borderColor = '#0891B2'}
                      onBlur={e => e.target.style.borderColor = COULEURS.gris200}
                    />
                    <button type="button" onClick={() => setAfficherMDP(!afficherMDP)}
                      style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:16, color:COULEURS.gris400, padding:0 }}>
                      {afficherMDP ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                {erreur && (
                  <div style={{ background:'#FEE2E2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#991B1B' }}>
                    ⚠️ {erreur}
                  </div>
                )}

                <div style={{ background:'#EFF6FF', borderRadius:10, padding:'9px 14px', fontSize:12,
                  color:'#1D4ED8', border:'1px solid #BFDBFE', display:'flex', alignItems:'center', gap:8 }}>
                  🔒 Connexion sécurisée avec vos accès BET
                </div>

                <button type="submit" disabled={chargement} style={{
                  padding:'14px', borderRadius:10, border:'none',
                  background: chargement ? COULEURS.gris300 : 'linear-gradient(135deg, #0F172A, #0891B2)',
                  color:'#fff', fontSize:15, fontWeight:700, cursor: chargement ? 'not-allowed' : 'pointer',
                  fontFamily:'inherit', transition:'opacity 0.2s',
                }}>
                  {chargement ? 'Connexion…' : 'Se connecter'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
