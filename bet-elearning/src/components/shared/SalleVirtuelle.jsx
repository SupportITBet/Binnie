import { useState, useRef, useEffect } from 'react';
import { COULEURS } from '../../constants/couleurs';
import { genererNomSalle, JITSI_HOST } from '../../utils/genererSalleVirtuelle';

/**
 * Salle virtuelle Jitsi embarquée via iFrame direct.
 *
 * Approche iFrame simple (plus fiable que External API) :
 *  - Fonctionne sur HTTP et HTTPS
 *  - Partage d'écran natif via allow="display-capture"
 *  - Aucune dépendance réseau pour charger un SDK externe
 *  - Configuration via paramètres d'URL Jitsi
 *
 * Props :
 *   session    - { id, groupe_id, titre, heure_debut, heure_fin }
 *   profil     - { prenom, nom, email }
 *   role       - 'professeur' | 'apprenant'
 *   hauteur    - hauteur iFrame en px (défaut 520)
 *   onQuitter  - callback bouton Quitter
 */
export default function SalleVirtuelle({
  session,
  profil,
  role = 'apprenant',
  hauteur = 520,
  onQuitter,
}) {
  const iframeRef = useRef(null);
  const [chargement, setChargement] = useState(true);
  const [pleinEcran, setPleinEcran] = useState(false);

  const nomSalle  = genererNomSalle(session);
  const estProf   = role === 'professeur';
  const nomAffich = `${profil?.prenom || ''} ${profil?.nom || ''}`.trim() || 'Utilisateur BET';

  // ── Construction de l'URL Jitsi avec paramètres de config ────────────────
  const boutonsProf = [
    'microphone','camera','desktop','chat','raisehand',
    'tileview','participants-pane','whiteboard',
    'recording','security','fullscreen','hangup',
  ];
  const boutonsApp = [
    'microphone','camera','desktop','chat','raisehand',
    'tileview','fullscreen','hangup',
  ];

  const config = [
    'config.prejoinPageEnabled=false',
    `config.startWithAudioMuted=${!estProf}`,
    'config.startWithVideoMuted=false',
    'config.disableDeepLinking=true',
    `config.subject=${encodeURIComponent(session.titre)}`,
    'config.defaultLanguage=fr',
    'config.requireDisplayName=false',
    'config.enableNoisyMicDetection=false',
    // Désactiver le watermark Jitsi
    'interfaceConfig.SHOW_JITSI_WATERMARK=false',
    'interfaceConfig.SHOW_WATERMARK_FOR_GUESTS=false',
    'interfaceConfig.SHOW_BRAND_WATERMARK=false',
    `interfaceConfig.APP_NAME=${encodeURIComponent('BET × TLG - Cours en ligne')}`,
    `interfaceConfig.PROVIDER_NAME=${encodeURIComponent('British English Training')}`,
    `interfaceConfig.DEFAULT_REMOTE_DISPLAY_NAME=${encodeURIComponent('Apprenant BET')}`,
    // Infos utilisateur
    `userInfo.displayName=${encodeURIComponent(nomAffich)}`,
    profil?.email ? `userInfo.email=${encodeURIComponent(profil.email)}` : '',
  ].filter(Boolean).join('&');

  const urlJitsi = `https://${JITSI_HOST}/${nomSalle}#${config}`;

  // Plein écran
  function basculerPleinEcran() {
    const el = iframeRef.current;
    if (!el) return;
    if (!pleinEcran) {
      (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen)?.call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen)?.call(document);
    }
    setPleinEcran(p => !p);
  }

  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setPleinEcran(false);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  return (
    <div style={{ borderRadius:14, overflow:'hidden', border:`1.5px solid ${COULEURS.gris200}`, background:'#0F172A' }}>

      {/* ── Bandeau supérieur ── */}
      <div style={{ background:'#0F172A', padding:'10px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:'#EF4444', display:'inline-block', boxShadow:'0 0 8px rgba(239,68,68,0.8)' }} />
          <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{session.titre}</span>
          <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>· {session.heure_debut} – {session.heure_fin}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {!chargement && (
            <span style={{ padding:'2px 8px', borderRadius:10, background:'#D1FAE5', color:'#065F46', fontSize:10, fontWeight:800 }}>
              ✅ Connecté · {nomAffich}
            </span>
          )}
          {/* Plein écran */}
          <button
            onClick={basculerPleinEcran}
            title="Plein écran"
            style={{ padding:'5px 10px', borderRadius:7, border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.7)', fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}
          >
            {pleinEcran ? '⛶' : '⛶'}
          </button>
          {/* Ouvrir dans un onglet (fallback) */}
          <a
            href={urlJitsi}
            target="_blank"
            rel="noreferrer"
            title="Ouvrir dans un onglet (si l'iFrame est bloquée)"
            style={{ padding:'5px 10px', borderRadius:7, border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.55)', fontSize:11, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', textDecoration:'none', whiteSpace:'nowrap' }}
          >
            ↗ Onglet
          </a>
          {/* Quitter */}
          <button
            onClick={onQuitter}
            style={{ padding:'5px 14px', borderRadius:7, border:'1px solid rgba(239,68,68,0.4)', background:'rgba(239,68,68,0.15)', color:'#FCA5A5', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}
          >
            ⏹ Quitter
          </button>
        </div>
      </div>

      {/* ── Info barre Jitsi ── */}
      {!chargement && (
        <div style={{ background:'#1E293B', padding:'7px 18px', borderBottom:'1px solid rgba(255,255,255,0.05)', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>
            Commandes disponibles dans la salle :
          </span>
          {[
            { icone:'🎙', lib:'Micro' },
            { icone:'📷', lib:'Caméra' },
            { icone:'🖥', lib:'Partage écran' },
            { icone:'✋', lib:'Lever la main' },
            { icone:'💬', lib:'Chat' },
            estProf && { icone:'✏️', lib:'Tableau blanc' },
            estProf && { icone:'⏺', lib:'Enregistrement' },
          ].filter(Boolean).map(b => (
            <span key={b.lib} style={{ padding:'2px 8px', borderRadius:6, background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.5)', fontSize:10, fontWeight:600 }}>
              {b.icone} {b.lib}
            </span>
          ))}
        </div>
      )}

      {/* ── Overlay chargement ── */}
      {chargement && (
        <div style={{ background:'#0F172A', padding:'64px 0', display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
          <div style={{ width:44, height:44, border:'4px solid rgba(255,255,255,0.1)', borderTop:'4px solid #0891B2', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
          <div style={{ color:'rgba(255,255,255,0.6)', fontSize:14, fontWeight:600, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
            Chargement de la salle virtuelle…
          </div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.25)', fontFamily:'monospace' }}>
            {JITSI_HOST} / {nomSalle}
          </div>
        </div>
      )}

      {/* ── iFrame Jitsi ── */}
      <iframe
        ref={iframeRef}
        src={urlJitsi}
        title={`BET - ${session.titre}`}
        width="100%"
        height={hauteur}
        frameBorder="0"
        scrolling="no"
        allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write; encrypted-media; picture-in-picture"
        allowFullScreen
        onLoad={() => setChargement(false)}
        style={{
          display:    'block',
          border:     'none',
          background: '#0F172A',
          visibility: chargement ? 'hidden' : 'visible',
          height:     chargement ? 0 : hauteur,
        }}
      />
    </div>
  );
}
