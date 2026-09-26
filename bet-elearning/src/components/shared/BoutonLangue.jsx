import { useLangue } from '../../contexts/LangueContext';

export default function BoutonLangue({ style = {} }) {
  const { langue, changerLangue } = useLangue();
  const estFR = langue === 'fr';

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.18)',
      borderRadius: 20, overflow: 'hidden',
      ...style,
    }}>
      <button
        onClick={() => changerLangue('fr')}
        style={{
          padding: '4px 11px', border: 'none', cursor: 'pointer',
          background: estFR ? '#fff' : 'transparent',
          color: estFR ? '#0F172A' : 'rgba(255,255,255,0.6)',
          fontWeight: estFR ? 800 : 500,
          fontSize: 11, fontFamily: 'inherit',
          borderRadius: '20px 0 0 20px',
          transition: 'all .15s',
        }}
      >
        FR
      </button>
      <div style={{ width: 1, background: 'rgba(255,255,255,0.18)', alignSelf: 'stretch' }} />
      <button
        onClick={() => changerLangue('en')}
        style={{
          padding: '4px 11px', border: 'none', cursor: 'pointer',
          background: !estFR ? '#fff' : 'transparent',
          color: !estFR ? '#0F172A' : 'rgba(255,255,255,0.6)',
          fontWeight: !estFR ? 800 : 500,
          fontSize: 11, fontFamily: 'inherit',
          borderRadius: '0 20px 20px 0',
          transition: 'all .15s',
        }}
      >
        EN
      </button>
    </div>
  );
}

// Variante claire pour fond blanc (pages de connexion panneau droit)
export function BoutonLangueClair({ style = {} }) {
  const { langue, changerLangue } = useLangue();
  const estFR = langue === 'fr';

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      background: '#F1F5F9',
      border: '1px solid #E2E8F0',
      borderRadius: 20, overflow: 'hidden',
      ...style,
    }}>
      <button
        onClick={() => changerLangue('fr')}
        style={{
          padding: '4px 11px', border: 'none', cursor: 'pointer',
          background: estFR ? '#0F172A' : 'transparent',
          color: estFR ? '#fff' : '#64748B',
          fontWeight: estFR ? 800 : 500,
          fontSize: 11, fontFamily: 'inherit',
          borderRadius: '20px 0 0 20px',
          transition: 'all .15s',
        }}
      >
        FR
      </button>
      <div style={{ width: 1, background: '#E2E8F0', alignSelf: 'stretch' }} />
      <button
        onClick={() => changerLangue('en')}
        style={{
          padding: '4px 11px', border: 'none', cursor: 'pointer',
          background: !estFR ? '#0F172A' : 'transparent',
          color: !estFR ? '#fff' : '#64748B',
          fontWeight: !estFR ? 800 : 500,
          fontSize: 11, fontFamily: 'inherit',
          borderRadius: '0 20px 20px 0',
          transition: 'all .15s',
        }}
      >
        EN
      </button>
    </div>
  );
}
