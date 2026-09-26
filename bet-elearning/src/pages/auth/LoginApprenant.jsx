import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_REDIRECT } from '../../constants/roles';
import { BoutonLangueClair } from '../../components/shared/BoutonLangue';

const NAVY  = '#0F172A';
const ACC   = '#6366F1';
const ACC_F = '#4338CA';
const GRIS  = '#94A3B8';
const BLANC = '#FFFFFF';

const FEATURES = [
  { i: '📚', t: 'Accès à tous vos cours & modules' },
  { i: '✏️', t: 'Exercices interactifs & évaluations' },
  { i: '📈', t: 'Suivi de progression en temps réel' },
  { i: '🎥', t: 'Sessions en direct avec vos coachs' },
  { i: '🏆', t: 'Badges & certifications BET' },
];

const STATS = [
  { n: '1 284', l: 'Apprenants actifs' },
  { n: '186',   l: 'Sessions / semaine' },
  { n: '94%',   l: 'Taux de réussite' },
  { n: '42',    l: 'Coachs certifiés' },
];

export default function LoginApprenant() {
  const { seConnecter } = useAuth();
  const navigate = useNavigate();

  const [email,    setEmail]    = useState('');
  const [mdp,      setMdp]      = useState('');
  const [showMdp,  setShowMdp]  = useState(false);
  const [erreur,   setErreur]   = useState('');
  const [loading,  setLoading]  = useState(false);

  async function gererConnexion(e) {
    e.preventDefault(); setErreur(''); setLoading(true);
    try {
      await seConnecter(email, mdp);
      const p = JSON.parse(sessionStorage.getItem('bet_profil_mock') || 'null');
      if (p) navigate(ROLE_REDIRECT[p.role] || '/connexion');
    } catch (err) {
      setErreur(err.message || 'Identifiants incorrects. Contactez votre responsable BET.');
    } finally { setLoading(false); }
  }

  return (
    <div style={{ display:'flex', height:'100vh', width:'100vw',
      fontFamily:'"Plus Jakarta Sans",sans-serif', overflow:'hidden' }}>
      <style>{`
        @keyframes appFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-14px,18px) scale(1.04)}}
        @keyframes appFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes appSpin{to{transform:rotate(360deg)}}
        .app-demo-item:hover{background:#EEF2FF !important}
      `}</style>

      {/* ── Panneau gauche ── */}
      <div style={{ width:'48%', position:'relative', overflow:'hidden',
        background:`linear-gradient(160deg, ${NAVY} 0%, #1e1b4b 40%, ${ACC_F} 75%, ${ACC} 100%)` }}>
        <div style={{ position:'absolute', width:400, height:400, borderRadius:'50%',
          background:'rgba(99,102,241,0.14)', top:-100, left:-120,
          animation:'appFloat 10s ease-in-out infinite' }}/>
        <div style={{ position:'absolute', width:270, height:270, borderRadius:'50%',
          background:'rgba(15,23,42,0.2)', bottom:-70, right:-70,
          animation:'appFloat 14s ease-in-out infinite reverse' }}/>
        <div style={{ position:'absolute', width:160, height:160, borderRadius:'50%',
          background:'rgba(99,102,241,0.09)', top:'35%', left:'58%',
          animation:'appFloat 8s ease-in-out infinite 2s' }}/>
        <div style={{ position:'absolute', width:80, height:80, borderRadius:'50%',
          background:'rgba(165,180,252,0.12)', top:'65%', left:'15%',
          animation:'appFloat 6s ease-in-out infinite .5s' }}/>

        <div style={{ position:'relative', zIndex:2, height:'100%', display:'flex',
          flexDirection:'column', justifyContent:'center', padding:'56px 48px' }}>

          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:40 }}>
            <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="BET Logo"
              style={{ width:54, height:54, borderRadius:16, objectFit:'contain',
                background:'rgba(255,255,255,0.12)', border:'2px solid rgba(255,255,255,0.2)',
                padding:4 }}/>
            <div>
              <div style={{ fontSize:15, fontWeight:900, color:BLANC }}>
                <span style={{ color: ACC }}>BET</span> E-Learning
              </div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)',
                letterSpacing:'0.15em', textTransform:'uppercase', marginTop:2 }}>
                Portail Apprenant
              </div>
            </div>
          </div>

          <h1 style={{ fontSize:42, fontWeight:900, lineHeight:1.08, color:BLANC, margin:'0 0 18px' }}>
            Apprenez,<br />progressez,<br /><span style={{ color: ACC }}>réussissez.</span>
          </h1>
          <p style={{ fontSize:13, color:'rgba(255,255,255,0.6)', lineHeight:1.75,
            marginBottom:36, maxWidth:340 }}>
            Accédez à vos cours, suivez vos progrès et participez aux sessions en direct avec vos coachs BET.
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

          <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
            {['Anglais', 'Expression orale', 'Grammaire', 'TOEIC', 'Écriture', 'Phonologie'].map(m => (
              <div key={m} style={{ padding:'4px 12px', borderRadius:20,
                background:'rgba(255,255,255,0.09)', border:'1px solid rgba(255,255,255,0.15)',
                fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.65)' }}>{m}</div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Panneau droit ── */}
      <div style={{ flex:1, background:'#F8FAFC', display:'flex', alignItems:'center',
        justifyContent:'center', padding:'48px 52px', overflowY:'auto', position:'relative' }}>

        <div style={{ position:'absolute', top:16, right:20, zIndex:10 }}>
          <BoutonLangueClair />
        </div>

        <div style={{ position:'absolute', bottom:-80, right:-80, width:240, height:240,
          borderRadius:'50%', background:'rgba(99,102,241,0.05)', pointerEvents:'none' }}/>

        <div style={{ width:'100%', maxWidth:400, animation:'appFadeIn .3s ease' }}>

          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:28 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:`${ACC}20`,
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🎓</div>
            <div style={{ width:1, height:26, background:'#E2E8F0' }}/>
            <div style={{ fontSize:11, fontWeight:600, color:GRIS,
              letterSpacing:'0.1em', textTransform:'uppercase' }}>Connexion Apprenant</div>
          </div>

          <h2 style={{ fontSize:30, fontWeight:800, color:NAVY, margin:'0 0 6px', lineHeight:1.15 }}>
            Bienvenue sur<br />votre espace 🎓
          </h2>
          <p style={{ fontSize:13, color:GRIS, marginBottom:22, lineHeight:1.6 }}>
            Connectez-vous pour accéder à vos cours, exercices et sessions en direct.
          </p>

          <div style={{ padding:'8px 14px', borderRadius:9, background:'#EEF2FF',
            border:'1px solid #C7D2FE', fontSize:12, color:'#3730A3', fontWeight:500, marginBottom:22 }}>
            🔐 Connexion sécurisée - British English Training
          </div>

          <form onSubmit={gererConnexion} style={{ display:'flex', flexDirection:'column', gap:18 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#475569', display:'block', marginBottom:6 }}>
                Adresse email
              </label>
              <div style={{ position:'relative' }}>
                <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:15, pointerEvents:'none' }}>✉️</span>
                <input type="email" value={email} required onChange={e => setEmail(e.target.value)}
                  placeholder="prenom.nom@bet.ci" autoFocus autoComplete="username"
                  style={{ width:'100%', padding:'12px 14px 12px 44px', border:'1.5px solid #E2E8F0',
                    borderRadius:10, fontSize:14, fontFamily:'inherit', outline:'none',
                    boxSizing:'border-box', color:NAVY, transition:'border-color .2s,box-shadow .2s' }}
                  onFocus={e => { e.target.style.borderColor = ACC; e.target.style.boxShadow = `0 0 0 3px ${ACC}25`; }}
                  onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}/>
              </div>
            </div>

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
                  borderTopColor:BLANC, borderRadius:'50%', animation:'appSpin .7s linear infinite' }}/> Connexion…</>
              ) : 'Accéder à mes cours →'}
            </button>
          </form>

          <div style={{ marginTop:20, padding:'11px 14px', background:'#F0FFF4',
            borderRadius:10, border:'1px solid #BBF7D0', fontSize:12, color:'#14532D', lineHeight:1.7 }}>
            👨‍👩‍👧 <strong>Compte géré par un parent ?</strong><br />
            Connectez-vous via le portail parent pour administrer les accès.{' '}
            <button onClick={() => navigate('/connexion/parent')}
              style={{ background:'none', border:'none', color:'#16A34A', fontWeight:700,
                cursor:'pointer', fontFamily:'inherit', fontSize:12, padding:0, textDecoration:'underline' }}>
              Portail parent →
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
