import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { ROLE_REDIRECT } from '../../constants/roles';
import { BoutonLangueClair } from '../../components/shared/BoutonLangue';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const NAVY  = '#0F172A';
const ACC   = '#F97316';
const ACC_F = '#C2410C';
const GRIS  = '#94A3B8';
const BLANC = '#FFFFFF';

const FEATURES = [
  { i: '👥', t: 'Suivi de vos bénéficiaires en temps réel' },
  { i: '📊', t: 'Rapports de formation & statistiques' },
  { i: '📋', t: 'Gestion des inscriptions et groupes' },
  { i: '💬', t: 'Communication directe avec BET' },
  { i: '🧾', t: 'Contrats & historique de facturation' },
];

const STATS = [
  { n: '12+',  l: 'Entreprises partenaires' },
  { n: '580',  l: 'Bénéficiaires formés' },
  { n: '97%',  l: 'Taux de satisfaction' },
  { n: 'B2B',  l: 'Espace dédié RH' },
];

export default function LoginEntreprise() {
  const { connexionReel } = useAuth();
  const navigate = useNavigate();

  const [email,    setEmail]    = useState('');
  const [mdp,      setMdp]      = useState('');
  const [showMdp,  setShowMdp]  = useState(false);
  const [erreur,   setErreur]   = useState('');
  const [loading,  setLoading]  = useState(false);

  async function gererConnexion(e) {
    e.preventDefault(); setErreur(''); setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/admin/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim().toLowerCase(), password: mdp, plateforme: 'bet-elearning' }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErreur(data.error || 'Identifiants incorrects. Contactez votre responsable BET.');
        return;
      }

      if (data.profil.role !== 'client_entreprise') {
        setErreur('Ce portail est réservé aux comptes entreprises.');
        return;
      }

      localStorage.setItem('admin_token',   data.session.access_token);
      localStorage.setItem('admin_refresh', data.session.refresh_token);
      localStorage.setItem('admin_profil',  JSON.stringify(data.profil));

      // Synchroniser le client Supabase navigateur pour que la session survive au refresh
      if (supabase) {
        await supabase.auth.setSession({
          access_token:  data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      const profilBet = { ...data.profil, role: 'client_entreprise' };
      connexionReel(profilBet);
      navigate(ROLE_REDIRECT['client_entreprise'] || '/entreprise/dashboard');
    } catch (err) {
      setErreur('Erreur réseau. Vérifiez votre connexion internet.');
    } finally { setLoading(false); }
  }

  return (
    <div style={{ display:'flex', height:'100vh', width:'100vw',
      fontFamily:'"Plus Jakarta Sans",sans-serif', overflow:'hidden' }}>
      <style>{`
        @keyframes entFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(12px,-16px) scale(1.03)}}
        @keyframes entFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .ent-demo:hover{background:#FFF7ED !important}
        .ent-input:focus{border-color:${ACC} !important;box-shadow:0 0 0 3px ${ACC}25 !important}
      `}</style>

      {/* ── Panneau gauche ── */}
      <div style={{ width:'48%', position:'relative', overflow:'hidden',
        background:`linear-gradient(160deg, ${NAVY} 0%, #431407 45%, ${ACC_F} 80%, ${ACC} 100%)` }}>
        {/* Blobs */}
        <div style={{ position:'absolute', width:380, height:380, borderRadius:'50%',
          background:'rgba(249,115,22,0.12)', top:-90, left:-110,
          animation:'entFloat 9s ease-in-out infinite' }}/>
        <div style={{ position:'absolute', width:260, height:260, borderRadius:'50%',
          background:'rgba(15,23,42,0.25)', bottom:-60, right:-60,
          animation:'entFloat 13s ease-in-out infinite reverse' }}/>
        <div style={{ position:'absolute', width:140, height:140, borderRadius:'50%',
          background:'rgba(249,115,22,0.08)', top:'40%', left:'60%',
          animation:'entFloat 7s ease-in-out infinite 1.5s' }}/>

        <div style={{ position:'relative', zIndex:2, height:'100%', display:'flex',
          flexDirection:'column', justifyContent:'center', padding:'56px 48px' }}>

          {/* Logo + badge */}
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:40 }}>
            <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="BET Logo"
              style={{ width:54, height:54, borderRadius:16, objectFit:'contain',
                background:'rgba(255,255,255,0.12)', border:'2px solid rgba(255,255,255,0.2)',
                padding:4 }}/>
            <div>
              <div style={{ fontSize:15, fontWeight:900, color:BLANC,
                fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                <span style={{ color: ACC }}>BET</span> × Entreprises
              </div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)',
                letterSpacing:'0.15em', textTransform:'uppercase', marginTop:2 }}>
                Portail RH & Formation
              </div>
            </div>
          </div>

          <h1 style={{ fontFamily:'"Plus Jakarta Sans",sans-serif', fontSize:42,
            fontWeight:900, lineHeight:1.08, color:BLANC, margin:'0 0 18px' }}>
            Gérez la<br />formation de<br /><span style={{ color: ACC }}>vos équipes.</span>
          </h1>
          <p style={{ fontSize:13, color:'rgba(255,255,255,0.6)', lineHeight:1.75,
            marginBottom:36, maxWidth:340 }}>
            Suivez la progression de vos bénéficiaires, accédez aux rapports et gérez les inscriptions depuis votre espace dédié.
          </p>

          {/* Features */}
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

          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:28 }}>
            {STATS.map(s => (
              <div key={s.l} style={{ padding:'12px 14px', borderRadius:12,
                background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize:20, fontWeight:800, color: ACC,
                  fontFamily:'"Plus Jakarta Sans",sans-serif' }}>{s.n}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', marginTop:2 }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Partenaires */}
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.3)',
              textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>
              Nos entreprises partenaires
            </div>
            <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
              {[
                { lib:'TLG', couleur:'#0891B2' },
                { lib:'OCI', couleur:'#F97316' },
                { lib:'SGB', couleur:'#DC2626' },
                { lib:'C+A', couleur:'#8B5CF6' },
                { lib:'BOA', couleur:'#059669' },
                { lib:'MTN', couleur:'#F59E0B' },
              ].map(p => (
                <div key={p.lib} style={{ background:'rgba(255,255,255,0.09)',
                  border:'1px solid rgba(255,255,255,0.14)', borderRadius:8,
                  padding:'5px 11px', display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:7, height:7, borderRadius:'50%', background: p.couleur }}/>
                  <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.6)' }}>{p.lib}</span>
                </div>
              ))}
            </div>
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
          borderRadius:'50%', background:'rgba(249,115,22,0.05)', pointerEvents:'none' }}/>

        <div style={{ width:'100%', maxWidth:400, animation:'entFadeIn .3s ease' }}>

          {/* En-tête */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:28 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:`${ACC}20`,
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🏢</div>
            <div style={{ width:1, height:26, background:'#E2E8F0' }}/>
            <div style={{ fontSize:11, fontWeight:600, color:GRIS,
              letterSpacing:'0.1em', textTransform:'uppercase' }}>Connexion Entreprise</div>
          </div>

          <h2 style={{ fontSize:30, fontWeight:800, color:NAVY, margin:'0 0 6px', lineHeight:1.15 }}>
            Accéder à<br />votre espace RH 🏢
          </h2>
          <p style={{ fontSize:13, color:GRIS, marginBottom:22, lineHeight:1.6 }}>
            Identifiants fournis par votre gestionnaire BET lors de la signature du contrat.
          </p>

          <div style={{ padding:'8px 14px', borderRadius:9, background:'#FFF7ED',
            border:'1px solid #FED7AA', fontSize:12, color:'#92400E', fontWeight:500, marginBottom:22 }}>
            🔒 Accès sécurisé - Portail B2B British English Training
          </div>

          <form onSubmit={gererConnexion} style={{ display:'flex', flexDirection:'column', gap:18 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#475569', display:'block', marginBottom:6 }}>Email professionnel</label>
              <div style={{ position:'relative' }}>
                <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:15, pointerEvents:'none' }}>✉️</span>
                <input type="email" value={email} required onChange={e => setEmail(e.target.value)}
                  placeholder="rh@votreentreprise.ci" autoFocus autoComplete="username"
                  style={{ width:'100%', padding:'12px 14px 12px 44px', border:'1.5px solid #E2E8F0',
                    borderRadius:10, fontSize:14, fontFamily:'inherit', outline:'none',
                    boxSizing:'border-box', color:NAVY, transition:'border-color .2s,box-shadow .2s' }}
                  onFocus={e => { e.target.style.borderColor = ACC; e.target.style.boxShadow = `0 0 0 3px ${ACC}25`; }}
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
                  borderTopColor:BLANC, borderRadius:'50%', animation:'entSpin .7s linear infinite' }}/> Connexion…</>
              ) : 'Accéder à mon espace →'}
            </button>
          </form>

          {/* Info + démo */}
          <div style={{ marginTop:22, padding:'13px 15px', background:'#FFF7ED',
            borderRadius:11, border:'1px solid #FED7AA' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#92400E', marginBottom:6 }}>🔑 Pas encore de compte ?</div>
            <div style={{ fontSize:11, color:'#78350F', lineHeight:1.7 }}>
              Votre compte est créé lors de la signature du contrat BET.<br />
              Contactez : <strong>contact@bet.ci</strong>
            </div>
          </div>


          <div style={{ textAlign:'center', marginTop:20 }}>
            <button onClick={() => navigate('/connexion')}
              style={{ background:'none', border:'none', fontSize:12, color:GRIS,
                cursor:'pointer', fontFamily:'inherit', fontWeight:500 }}>
              ← Retour au portail principal
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes entSpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
