import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_REDIRECT } from '../../constants/roles';
import { COULEURS } from '../../constants/couleurs';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const ROLE_MAP_BET = {
  coach: 'professeur_titulaire',
  super_admin: 'admin_manager', manager: 'admin_manager',
};

export default function LoginProfesseur() {
  const { connexionReel } = useAuth();
  const navigate = useNavigate();

  const [email,       setEmail]       = useState('');
  const [motDePasse,  setMotDePasse]  = useState('');
  const [afficherMDP, setAfficherMDP] = useState(false);
  const [erreur,      setErreur]      = useState('');
  const [chargement,  setChargement]  = useState(false);

  async function gererSoumission(e) {
    e.preventDefault();
    setErreur('');
    setChargement(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: motDePasse, plateforme: 'bet-elearning' }),
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) { setErreur(data.error || 'Identifiants incorrects.'); return; }

      if (!data.profil.acces_elearning && data.profil.role !== 'coach') {
        setErreur("Votre accès à la plateforme e-learning n'est pas encore activé. Contactez votre Super Admin BET.");
        return;
      }

      const roleBet = ROLE_MAP_BET[data.profil.role] || 'professeur_titulaire';
      const profilBet = {
        id: data.profil.id, role: roleBet,
        prenom: data.profil.prenom || '', nom: data.profil.nom || '',
        email: data.profil.email || email, est_actif: true,
        couleur: data.profil.couleur || null, avatar_url: data.profil.avatar_url || null,
      };
      localStorage.setItem('admin_token',   data.session.access_token);
      localStorage.setItem('admin_refresh', data.session.refresh_token);
      localStorage.setItem('admin_profil',  JSON.stringify(data.profil));
      connexionReel(profilBet);
      navigate(ROLE_REDIRECT[roleBet] || '/professeur');
    } catch (err) {
      setErreur(err.message || 'Identifiants incorrects.');
    } finally {
      setChargement(false);
    }
  }

  const ACCENT = '#10B981';

  return (
    <div style={{
      minHeight:'100vh',
      background:'linear-gradient(160deg, #064E3B 0%, #065F46 50%, #10B981 100%)',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:'"Plus Jakarta Sans", sans-serif', padding:20,
    }}>
      <div style={{ width:'100%', maxWidth:900, display:'flex', gap:32, alignItems:'center' }}>

        {/* Panneau gauche */}
        <div style={{ flex:1, color:'#fff', padding:'32px 24px' }}>
          <div style={{ fontSize:52, marginBottom:20, filter:'drop-shadow(0 4px 12px rgba(0,0,0,0.2))' }}>👨‍🏫</div>
          <h1 style={{ fontSize:26, fontWeight:900, margin:'0 0 12px', lineHeight:1.2 }}>
            Espace<br />Professeur
          </h1>
          <p style={{ fontSize:13, color:'rgba(255,255,255,0.6)', lineHeight:1.7, margin:'0 0 28px', maxWidth:280 }}>
            Accédez à vos groupes, sessions, évaluations et ressources pédagogiques.
          </p>

          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {[
              { i:'🏫', t:'Mes groupes & sessions' },
              { i:'📚', t:'Ressources pédagogiques' },
              { i:'✏️', t:'Notes & évaluations' },
              { i:'📅', t:'Planning & disponibilités' },
            ].map(f => (
              <div key={f.t} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:16 }}>{f.i}</span>
                <span style={{ fontSize:12, color:'rgba(255,255,255,0.65)' }}>{f.t}</span>
              </div>
            ))}
          </div>

          <button onClick={() => navigate('/connexion')}
            style={{ marginTop:36, background:'none', border:'none', color:'rgba(255,255,255,0.4)', fontSize:12, cursor:'pointer', padding:0, fontFamily:'inherit', display:'flex', alignItems:'center', gap:6 }}>
            ← Retour au portail
          </button>
        </div>

        {/* Formulaire */}
        <div style={{
          width:400, background:'#fff', borderRadius:24,
          padding:'44px 36px', boxShadow:'0 32px 80px rgba(0,0,0,0.35)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:28 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:`${ACCENT}20`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🎓</div>
            <div>
              <div style={{ fontSize:18, fontWeight:800, color:'#064E3B' }}>Connexion Professeur</div>
              <div style={{ fontSize:12, color:COULEURS.gris400 }}>Titulaire · Remplaçant</div>
            </div>
          </div>

          <form onSubmit={gererSoumission} style={{ display:'flex', flexDirection:'column', gap:18 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'#064E3B', display:'block', marginBottom:5 }}>Email</label>
              <input type="email" value={email} required
                onChange={e => setEmail(e.target.value)}
                placeholder="prenom.nom@bet.ci"
                style={{ width:'100%', padding:'11px 14px', borderRadius:9, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }}
                onFocus={e => e.target.style.borderColor = ACCENT}
                onBlur={e => e.target.style.borderColor = COULEURS.gris200}
              />
            </div>

            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'#064E3B', display:'block', marginBottom:5 }}>Mot de passe</label>
              <div style={{ position:'relative' }}>
                <input type={afficherMDP ? 'text' : 'password'} value={motDePasse} required
                  onChange={e => setMotDePasse(e.target.value)} placeholder="••••••••"
                  style={{ width:'100%', padding:'11px 42px 11px 14px', borderRadius:9, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }}
                />
                <button type="button" onClick={() => setAfficherMDP(!afficherMDP)}
                  style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:15, color:COULEURS.gris400, padding:0 }}>
                  {afficherMDP ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {erreur && <div style={{ background:'#FEE2E2', borderRadius:8, padding:'9px 13px', fontSize:12, color:'#991B1B' }}>⚠️ {erreur}</div>}

            <button type="submit" disabled={chargement} style={{
              padding:'13px', borderRadius:9, border:'none',
              background: chargement ? COULEURS.gris300 : `linear-gradient(135deg, #064E3B, ${ACCENT})`,
              color:'#fff', fontSize:14, fontWeight:700, cursor: chargement ? 'not-allowed' : 'pointer', fontFamily:'inherit',
            }}>
              {chargement ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
