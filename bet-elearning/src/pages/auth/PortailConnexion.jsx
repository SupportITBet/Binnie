import { useNavigate } from 'react-router-dom';

const PORTAILS = [
  {
    id:       'admin',
    chemin:   '/connexion/admin',
    icone:    '🛡️',
    titre:    'Administration BET',
    desc:     'Manager, Superviseur, RH, Comptable, Placement…',
    gradient: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 60%, #0891B2 100%)',
    accent:   '#0891B2',
    badge:    '10 rôles',
  },
  {
    id:       'deputy',
    chemin:   '/connexion/admin',
    icone:    '🔍',
    titre:    'Deputy Superviseur',
    desc:     'Observation · Rapports terrain · Missions',
    gradient: 'linear-gradient(135deg, #2E1065 0%, #5B21B6 60%, #7C3AED 100%)',
    accent:   '#7C3AED',
    badge:    'Terrain',
  },
  {
    id:       'professeur',
    chemin:   '/connexion/professeur',
    icone:    '👨‍🏫',
    titre:    'Espace Professeur',
    desc:     'Titulaire · Remplaçant',
    gradient: 'linear-gradient(135deg, #064E3B 0%, #065F46 60%, #10B981 100%)',
    accent:   '#10B981',
    badge:    'Équipe pédagogique',
  },
  {
    id:       'apprenant',
    chemin:   '/connexion/apprenant',
    icone:    '🎓',
    titre:    'Espace Apprenant',
    desc:     'Accédez à vos cours, exercices et résultats',
    gradient: 'linear-gradient(135deg, #1E1B4B 0%, #3730A3 60%, #6366F1 100%)',
    accent:   '#6366F1',
    badge:    'Élèves & Adultes',
  },
  {
    id:       'parent',
    chemin:   '/connexion/parent',
    icone:    '👨‍👩‍👧',
    titre:    'Espace Parent',
    desc:     'Suivi de votre enfant · Connexion sécurisée 2FA',
    gradient: 'linear-gradient(135deg, #4C1D95 0%, #6D28D9 60%, #8B5CF6 100%)',
    accent:   '#8B5CF6',
    badge:    '🔐 2FA activé',
  },
  {
    id:       'entreprise',
    chemin:   '/connexion/entreprise',
    icone:    '🏢',
    titre:    'Espace Entreprise',
    desc:     'Suivi RH · Bénéficiaires · Rapports',
    gradient: 'linear-gradient(135deg, #7C2D12 0%, #C2410C 60%, #F97316 100%)',
    accent:   '#F97316',
    badge:    'Clients BET',
  },
];

export default function PortailConnexion() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      padding: '40px 20px',
      position: 'relative', overflow: 'hidden',
    }}>

      {/* Décoration fond */}
      <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
        {[
          { top:'10%', left:'5%',  size:300, opacity:0.04, color:'#0891B2' },
          { top:'60%', left:'80%', size:400, opacity:0.04, color:'#6366F1' },
          { top:'80%', left:'15%', size:200, opacity:0.03, color:'#10B981' },
        ].map((c, i) => (
          <div key={i} style={{
            position:'absolute', top:c.top, left:c.left,
            width:c.size, height:c.size, borderRadius:'50%',
            background:c.color, opacity:c.opacity, filter:'blur(60px)',
          }} />
        ))}
      </div>

      {/* En-tête */}
      <div style={{ textAlign:'center', marginBottom:52, position:'relative' }}>
        <div style={{
          display:'inline-flex', alignItems:'center', justifyContent:'center',
          width:72, height:72, borderRadius:20,
          background:'linear-gradient(135deg, #0891B2, #0F172A)',
          border:'2px solid rgba(8,145,178,0.4)',
          marginBottom:20, boxShadow:'0 8px 32px rgba(8,145,178,0.3)',
        }}>
          <span style={{ fontSize:30, fontWeight:900, color:'#fff' }}>B</span>
        </div>
        <h1 style={{
          fontSize:32, fontWeight:900, color:'#fff',
          margin:'0 0 8px', letterSpacing:'-0.02em',
        }}>
          BET E-Learning
        </h1>
        <p style={{ fontSize:14, color:'rgba(255,255,255,0.45)', margin:0 }}>
          Binnies' English Training · Plateforme de formation en anglais
        </p>
        <div style={{
          display:'inline-block', marginTop:14,
          padding:'4px 14px', borderRadius:20,
          border:'1px solid rgba(8,145,178,0.3)',
          fontSize:11, fontWeight:700, color:'#0891B2',
          background:'rgba(8,145,178,0.1)', letterSpacing:'0.06em',
          textTransform:'uppercase',
        }}>
          Sélectionnez votre espace
        </div>
      </div>

      {/* Grille des portails */}
      <div style={{
        display:'grid',
        gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',
        gap:16, width:'100%', maxWidth:1100,
        position:'relative',
      }}>
        {PORTAILS.map(p => (
          <button
            key={p.id}
            onClick={() => navigate(p.chemin)}
            style={{
              background:p.gradient,
              border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:20, padding:'32px 24px',
              cursor:'pointer', textAlign:'left',
              transition:'transform 0.2s, box-shadow 0.2s',
              boxShadow:'0 4px 24px rgba(0,0,0,0.3)',
              outline:'none',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-6px)';
              e.currentTarget.style.boxShadow = `0 16px 48px rgba(0,0,0,0.4), 0 0 0 1px ${p.accent}50`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.3)';
            }}
          >
            {/* Badge */}
            <div style={{
              display:'inline-block', marginBottom:20,
              padding:'3px 10px', borderRadius:20,
              background:'rgba(255,255,255,0.15)',
              fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.8)',
              letterSpacing:'0.05em', textTransform:'uppercase',
            }}>
              {p.badge}
            </div>

            {/* Icône */}
            <div style={{
              fontSize:40, marginBottom:16,
              filter:'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
            }}>
              {p.icone}
            </div>

            {/* Titre */}
            <div style={{
              fontSize:17, fontWeight:800, color:'#fff',
              marginBottom:8, lineHeight:1.3,
            }}>
              {p.titre}
            </div>

            {/* Description */}
            <div style={{
              fontSize:12, color:'rgba(255,255,255,0.6)', lineHeight:1.5,
              marginBottom:24,
            }}>
              {p.desc}
            </div>

            {/* Flèche */}
            <div style={{
              display:'flex', alignItems:'center', gap:6,
              fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.8)',
            }}>
              <span>Accéder</span>
              <span style={{ fontSize:16 }}>→</span>
            </div>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        marginTop:32, textAlign:'center',
        fontSize:11, color:'rgba(255,255,255,0.2)',
        position:'relative',
      }}>
        © {new Date().getFullYear()} BET E-Learning · Abidjan, Côte d'Ivoire · v1.0.0
      </div>
    </div>
  );
}
