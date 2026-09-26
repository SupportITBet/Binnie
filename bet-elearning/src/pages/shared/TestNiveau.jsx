import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAlerte } from '../../contexts/ConfirmContext';

import { fetchUpload } from "../../utils/fetchUpload";
// ── Palette BET ──────────────────────────────────────────────────────────────
const C = {
  navy:    '#0B1E3D',
  cyan:    '#0891B2',
  cyanDk:  '#0E7490',
  gris50:  '#F8FAFC',
  gris100: '#F1F5F9',
  gris200: '#E2E8F0',
  gris400: '#94A3B8',
  gris600: '#475569',
  blanc:   '#FFFFFF',
  succes:  '#10B981',
  erreur:  '#EF4444',
  warning: '#F59E0B',
};

const NIV_COULEUR = { A1:'#94A3B8', A2:'#60A5FA', B1:'#34D399', B2:'#818CF8', C1:'#F59E0B', C2:'#F97316' };

const _API = process.env.REACT_APP_API_URL || 'http://localhost:5001';

// Enregistre le résultat côté serveur - public, pas de session apprenant à ce stade
// (le lien est ouvert avant toute connexion à la plateforme).
async function sauverResultat(apprenantId, testId, data) {
  try {
    const r = await fetch(`${_API}/api/bet-elearning/tests-niveau/${testId}/resultat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apprenantId, ...data }),
    });
    if (!r.ok) console.error('[TestNiveau] enregistrement du résultat refusé par le serveur', await r.json().catch(() => null));
  } catch (e) {
    // Le résultat reste affiché à l'écran même si l'envoi échoue, mais on trace l'erreur
    // pour pouvoir diagnostiquer une perte de résultat signalée par un agent.
    console.error('[TestNiveau] enregistrement du résultat impossible', e);
  }
}

// ── Déduire niveau selon score ────────────────────────────────────────────────
function deduireNiveau(score, total, niveauTest) {
  const pct = total > 0 ? score / total : 0;
  const niveaux = ['A1','A2','B1','B2','C1','C2'];
  const idx = niveaux.indexOf(niveauTest);
  if (pct >= 0.85) return niveaux[Math.min(idx + 1, 5)];
  if (pct >= 0.60) return niveaux[idx];
  return niveaux[Math.max(idx - 1, 0)];
}

// ── Composant Timer ────────────────────────────────────────────────────────────
function Timer({ dureeMin, onExpire }) {
  const [secondes, setSecondes] = useState(dureeMin * 60);
  useEffect(() => {
    const t = setInterval(() => {
      setSecondes(s => {
        if (s <= 1) { clearInterval(t); onExpire(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [dureeMin, onExpire]);

  const m = Math.floor(secondes / 60);
  const s = secondes % 60;
  const urgent = secondes < 120;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:20, background: urgent ? '#FEF2F2' : C.gris100, border:`1px solid ${urgent ? '#FECACA' : C.gris200}`, fontSize:13, fontWeight:700, color: urgent ? C.erreur : C.navy }}>
      ⏱ {m}:{String(s).padStart(2,'0')}
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────
export default function TestNiveau() {
  const { testId }            = useParams();
  const [searchParams]        = useSearchParams();
  const apprenantId           = searchParams.get('a'); // ?a=insc-001
  const alerte                = useAlerte();

  const [test,       setTest]     = useState(null);
  const [apprenant,  setApp]      = useState(null);
  const [dejaPasse,  setDejaPasse]= useState(false);
  const [erreur,     setErreur]   = useState(null);
  const [etape,      setEtape]    = useState('intro');   // intro | test | resultat
  const [reponses,   setReponses] = useState({});        // { [qi]: choix }
  const [qActuelle,  setQActuelle]= useState(0);
  const [debut,      setDebut]    = useState(null);
  const [resultat,   setResultat] = useState(null);
  // Speaking
  const [enregistrement, setEnreg]  = useState(false);
  const [audioBlob,      setAudio]  = useState(null);
  const [speakEnvoye,    setSpeakEnvoye] = useState(false);
  const [envoiEnCours,   setEnvoiEnCours] = useState(false);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  // ── Charger test + apprenant ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const url = `${_API}/api/bet-elearning/tests-niveau/${testId}/public${apprenantId ? `?a=${encodeURIComponent(apprenantId)}` : ''}`;
        const r = await fetch(url);
        const d = await r.json();
        if (!r.ok || !d.test) { setErreur(d.error || 'Test introuvable. Le lien est peut-être expiré ou incorrect.'); return; }
        setTest(d.test);
        if (apprenantId) setApp(d.apprenant || { id: apprenantId, prenom: 'Apprenant', nom: '', entreprise: '' });
        setDejaPasse(!!d.dejaPasse);
      } catch {
        setErreur('Impossible de charger le test. Vérifiez votre connexion et réessayez.');
      }
    })();
  }, [testId, apprenantId]);

  // ── Démarrer ──────────────────────────────────────────────────────────────
  function demarrer() {
    setDebut(Date.now());
    setReponses({});
    setQActuelle(0);
    setEtape('test');
  }

  // ── Répondre (QCM / Listening / Audio) ────────────────────────────────────
  function repondre(qi, choix) {
    setReponses(r => ({ ...r, [qi]: choix }));
  }

  // ── Passer à la suivante ──────────────────────────────────────────────────
  function suivante() {
    if (qActuelle < (test.questions?.length ?? 0) - 1) {
      setQActuelle(q => q + 1);
    } else {
      soumettre();
    }
  }

  // ── Soumettre QCM / Quiz / Listening / Audio ─────────────────────────────
  function soumettre() {
    const q = test.questions || [];
    const total = q.length;
    const score = q.filter((qu, i) => qu.correct && reponses[i] === qu.correct).length;
    const dureeMin = debut ? Math.round((Date.now() - debut) / 60000) : test.dureeMin;
    const niveauDetecte = deduireNiveau(score, total, test.niveau);

    // Détail question par question
    const detailReponses = q.map((qu, i) => ({
      question:         qu.texte,
      reponseApprenant: reponses[i] || null,
      correcte:         qu.correct || null,
      isCorrect:        qu.correct ? reponses[i] === qu.correct : null,
    }));

    const data = { score, total, niveauDetecte, dureeMin, detailReponses, type: test.type, titreTest: test.titre };
    if (apprenantId) sauverResultat(apprenantId, testId, data);
    setResultat(data);
    setEtape('resultat');
  }

  // ── Speaking : enregistrement ──────────────────────────────────────────────
  async function demarrerEnregistrement() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudio(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRef.current = mr;
      mr.start();
      setEnreg(true);
    } catch {
      await alerte('Microphone non disponible. Vérifiez les permissions de votre navigateur.', { danger: true });
    }
  }

  function arreterEnregistrement() {
    mediaRef.current?.stop();
    setEnreg(false);
  }

  async function envoyerSpeaking() {
    if (envoiEnCours) return;
    setEnvoiEnCours(true);
    const dureeMin = debut ? Math.round((Date.now() - debut) / 60000) : test.dureeMin;
    let audioUrl = null;
    if (audioBlob) {
      try {
        const fd = new FormData();
        fd.append('file', audioBlob, 'recording.webm');
        const r = await fetchUpload(`${_API}/api/upload/recording`, { method: 'POST', body: fd });
        const d = await r.json();
        if (r.ok && d.url) audioUrl = d.url;
        else { await alerte(d.error || "Erreur lors de l'envoi de l'enregistrement", { danger: true }); setEnvoiEnCours(false); return; }
      } catch {
        await alerte("Erreur réseau lors de l'envoi de l'enregistrement", { danger: true });
        setEnvoiEnCours(false);
        return;
      }
    }
    const data = { score: null, total: null, niveauDetecte: test.speakNiveau || test.niveau, dureeMin, type: 'speaking', titreTest: test.titre, speakConsigne: test.speakConsigne, speakType: test.speakType, audioUrl };
    if (apprenantId) await sauverResultat(apprenantId, testId, data);
    setSpeakEnvoye(true);
    setResultat(data);
    setEtape('resultat');
    setEnvoiEnCours(false);
  }

  // ── ERREUR ────────────────────────────────────────────────────────────────
  if (erreur) return (
    <div style={{ minHeight:'100vh', background:C.gris50, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
      <div style={{ textAlign:'center', maxWidth:420, padding:32 }}>
        <div style={{ fontSize:56, marginBottom:16 }}>🔗</div>
        <div style={{ fontSize:20, fontWeight:800, color:C.navy, marginBottom:8 }}>Lien invalide</div>
        <div style={{ fontSize:14, color:C.gris600, lineHeight:1.6 }}>{erreur}</div>
        <div style={{ marginTop:16, fontSize:12, color:C.gris400 }}>Contactez votre agent BET si vous pensez que c'est une erreur.</div>
      </div>
    </div>
  );

  if (!test) return (
    <div style={{ minHeight:'100vh', background:C.gris50, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'"Plus Jakarta Sans", sans-serif', color:C.gris600 }}>
      Chargement du test…
    </div>
  );

  const q = test.questions || [];

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT COMMUN
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight:'100vh', background:`linear-gradient(135deg, ${C.navy} 0%, #1E3A5F 100%)`, fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', flexDirection:'column' }}>

      {/* Header */}
      <div style={{ background:'rgba(255,255,255,0.06)', backdropFilter:'blur(10px)', borderBottom:'1px solid rgba(255,255,255,0.1)', padding:'14px 32px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:C.cyan, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:'#fff' }}>B</div>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:'#fff', letterSpacing:'0.02em' }}>BET E-Learning</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>Test de niveau officiel</div>
          </div>
        </div>
        {etape === 'test' && test.type !== 'speaking' && (
          <Timer dureeMin={test.dureeMin} onExpire={soumettre} />
        )}
        {apprenant && (
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)', textAlign:'right' }}>
            <div style={{ fontWeight:600, color:'rgba(255,255,255,0.85)' }}>{apprenant.prenom} {apprenant.nom}</div>
            <div>{apprenant.entreprise}</div>
          </div>
        )}
      </div>

      {/* Corps */}
      <div style={{ flex:1, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 16px' }}>
        <div style={{ width:'100%', maxWidth: test.type === 'speaking' ? 600 : 720 }}>

          {/* ═══ INTRO ════════════════════════════════════════════════════ */}
          {etape === 'intro' && (
            <div style={{ background:C.blanc, borderRadius:20, overflow:'hidden', boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ background:`linear-gradient(135deg, ${C.cyan} 0%, ${C.cyanDk} 100%)`, padding:'32px 36px' }}>
                <div style={{ fontSize:36, marginBottom:12 }}>
                  {{ qcm:'📋', listening:'🎬', audio:'🎧', quiz:'🎯', speaking:'🎤' }[test.type] || '📝'}
                </div>
                <div style={{ fontSize:24, fontWeight:800, color:'#fff', marginBottom:6 }}>{test.titre}</div>
                <div style={{ fontSize:14, color:'rgba(255,255,255,0.75)' }}>Test de niveau BET · {test.type?.toUpperCase()}</div>
              </div>
              <div style={{ padding:'32px 36px' }}>
                {apprenant && (
                  <div style={{ background:`${C.cyan}10`, border:`1px solid ${C.cyan}30`, borderRadius:12, padding:'14px 18px', marginBottom:24, display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:40, height:40, borderRadius:'50%', background:C.cyan, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff', flexShrink:0 }}>
                      {apprenant.prenom?.[0]}{apprenant.nom?.[0]}
                    </div>
                    <div>
                      <div style={{ fontWeight:700, color:C.navy }}>{apprenant.prenom} {apprenant.nom}</div>
                      <div style={{ fontSize:12, color:C.gris400 }}>{apprenant.entreprise}</div>
                    </div>
                  </div>
                )}

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:28 }}>
                  {[
                    ['🎯', 'Niveau cible', test.niveau],
                    ['⏱', 'Durée estimée', `${test.dureeMin} min`],
                    ['📝', 'Format', test.type === 'speaking' ? 'Expression orale' : test.type?.toUpperCase()],
                    ['📊', 'Questions', test.type === 'speaking' ? 'Expression libre' : `${q.length} question${q.length !== 1 ? 's' : ''}`],
                  ].map(([ic, l, v]) => (
                    <div key={l} style={{ background:C.gris50, borderRadius:10, padding:'14px 16px', border:`1px solid ${C.gris200}` }}>
                      <div style={{ fontSize:11, color:C.gris400, marginBottom:4 }}>{ic} {l}</div>
                      <div style={{ fontWeight:700, color:C.navy, fontSize:14 }}>{v}</div>
                    </div>
                  ))}
                </div>

                {test.type === 'speaking' && (
                  <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'12px 16px', marginBottom:20, fontSize:13, color:'#991B1B' }}>
                    🎤 Ce test nécessite l'accès au <strong>microphone</strong>. Assurez-vous d'être dans un endroit calme.
                  </div>
                )}

                <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, padding:'12px 16px', marginBottom:24, fontSize:13, color:'#92400E', lineHeight:1.6 }}>
                  <strong>📌 Consignes :</strong>
                  <ul style={{ margin:'8px 0 0 16px', paddingLeft:0 }}>
                    {test.type !== 'speaking' && <li>Lisez chaque question attentivement avant de répondre.</li>}
                    {(test.type === 'listening') && <li>Regardez la vidéo entièrement avant de commencer les questions.</li>}
                    {(test.type === 'audio') && <li>Écoutez l'audio entièrement avant de commencer les questions.</li>}
                    {test.type === 'speaking' && <li>Lisez la consigne, préparez-vous, puis enregistrez votre réponse.</li>}
                    <li>Vous avez <strong>{test.dureeMin} minutes</strong> pour compléter ce test.</li>
                    <li>Ne rechargez pas la page en cours de test.</li>
                  </ul>
                </div>

                {dejaPasse ? (
                  <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:12, padding:'16px 18px', fontSize:14, color:'#991B1B', fontWeight:600, textAlign:'center' }}>
                    🔒 Ce test a déjà été soumis. Votre agent BET a déjà reçu vos résultats.
                  </div>
                ) : (
                  <button onClick={demarrer} style={{ width:'100%', padding:'15px 0', borderRadius:12, border:'none', background:`linear-gradient(135deg, ${C.cyan} 0%, ${C.cyanDk} 100%)`, color:'#fff', fontSize:15, fontWeight:800, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', boxShadow:`0 8px 24px ${C.cyan}50`, letterSpacing:'0.02em' }}>
                    Commencer le test →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ═══ TEST QCM / LISTENING / AUDIO / QUIZ ═════════════════════ */}
          {etape === 'test' && test.type !== 'speaking' && (
            <div style={{ background:C.blanc, borderRadius:20, overflow:'hidden', boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}>

              {/* Barre progression */}
              <div style={{ height:4, background:C.gris100 }}>
                <div style={{ height:'100%', width:`${((qActuelle + 1) / Math.max(q.length, 1)) * 100}%`, background:`linear-gradient(90deg, ${C.cyan}, ${C.cyanDk})`, transition:'width 0.3s' }} />
              </div>

              <div style={{ padding:'28px 32px' }}>

                {/* Compteur */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:C.gris400, textTransform:'uppercase', letterSpacing:'0.06em' }}>Question {qActuelle + 1} / {q.length}</span>
                  <span style={{ fontSize:11, color:C.gris400 }}>{Object.keys(reponses).length} réponse{Object.keys(reponses).length !== 1 ? 's' : ''} donnée{Object.keys(reponses).length !== 1 ? 's' : ''}</span>
                </div>

                {/* Ressource média */}
                {(test.type === 'listening' || test.type === 'audio') && test.ressourceUrl && qActuelle === 0 && (
                  <div style={{ marginBottom:20, borderRadius:10, overflow:'hidden', border:`1px solid ${C.gris200}` }}>
                    {test.type === 'listening' ? (
                      <div style={{ background:'#000', aspectRatio:'16/9', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:13 }}>
                        🎬 <a href={test.ressourceUrl} target="_blank" rel="noreferrer" style={{ color:C.cyan, marginLeft:6 }}>Ouvrir la vidéo dans un nouvel onglet</a>
                      </div>
                    ) : (
                      <div style={{ background:C.gris50, padding:'16px 20px' }}>
                        <div style={{ fontSize:12, fontWeight:600, color:C.gris600, marginBottom:8 }}>🎧 Écoutez l'audio avant de répondre :</div>
                        <audio controls src={test.ressourceUrl} style={{ width:'100%' }} />
                      </div>
                    )}
                  </div>
                )}

                {/* Question actuelle */}
                {q.length > 0 && (() => {
                  const qu = q[qActuelle];
                  return (
                    <>
                      <div style={{ fontSize:16, fontWeight:700, color:C.navy, marginBottom:20, lineHeight:1.5, padding:'16px 20px', background:C.gris50, borderRadius:10, borderLeft:`4px solid ${C.cyan}` }}>
                        {qu.texte}
                      </div>

                      {/* Options QCM / Listening / Audio */}
                      {qu.options && qu.options.filter(Boolean).length > 0 && (
                        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:24 }}>
                          {qu.options.filter(Boolean).map((opt, oi) => {
                            const selectionne = reponses[qActuelle] === opt;
                            return (
                              <button key={oi} onClick={() => repondre(qActuelle, opt)} style={{ padding:'13px 18px', borderRadius:10, border:`2px solid ${selectionne ? C.cyan : C.gris200}`, background: selectionne ? `${C.cyan}12` : C.blanc, color: selectionne ? C.cyanDk : C.navy, textAlign:'left', cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', fontSize:14, fontWeight: selectionne ? 700 : 500, transition:'all 0.12s', display:'flex', alignItems:'center', gap:10 }}>
                                <span style={{ width:26, height:26, borderRadius:'50%', border:`2px solid ${selectionne ? C.cyan : C.gris300}`, background: selectionne ? C.cyan : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:12, color: selectionne ? '#fff' : C.gris400 }}>
                                  {selectionne ? '✓' : String.fromCharCode(65 + oi)}
                                </span>
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Quiz - champ libre */}
                      {!qu.options && (
                        <textarea value={reponses[qActuelle] || ''} onChange={e => repondre(qActuelle, e.target.value)} placeholder="Votre réponse…" style={{ width:'100%', padding:'12px 16px', borderRadius:10, border:`1px solid ${C.gris200}`, fontSize:14, color:C.navy, minHeight:100, resize:'vertical', boxSizing:'border-box', fontFamily:'"Plus Jakarta Sans", sans-serif', marginBottom:20 }} />
                      )}
                    </>
                  );
                })()}

                {q.length === 0 && (
                  <div style={{ textAlign:'center', padding:32, color:C.gris400 }}>
                    <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
                    Ce test ne contient pas encore de questions.
                  </div>
                )}

                {/* Navigation */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
                  <button onClick={() => setQActuelle(q => Math.max(q - 1, 0))} disabled={qActuelle === 0} style={{ padding:'10px 20px', borderRadius:9, border:`1px solid ${C.gris200}`, background:C.blanc, color: qActuelle === 0 ? C.gris400 : C.navy, cursor: qActuelle === 0 ? 'not-allowed' : 'pointer', fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                    ← Précédent
                  </button>

                  {/* Dots navigation */}
                  <div style={{ display:'flex', gap:5 }}>
                    {q.slice(0, Math.min(q.length, 10)).map((_, i) => (
                      <button key={i} onClick={() => setQActuelle(i)} style={{ width:8, height:8, borderRadius:'50%', border:'none', background: i === qActuelle ? C.cyan : reponses[i] ? C.succes : C.gris200, cursor:'pointer', padding:0 }} />
                    ))}
                    {q.length > 10 && <span style={{ fontSize:10, color:C.gris400 }}>+{q.length - 10}</span>}
                  </div>

                  <button onClick={suivante} style={{ padding:'10px 20px', borderRadius:9, border:'none', background: qActuelle === q.length - 1 ? C.succes : C.cyan, color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                    {qActuelle === q.length - 1 ? '✅ Terminer' : 'Suivant →'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ TEST SPEAKING ════════════════════════════════════════════ */}
          {etape === 'test' && test.type === 'speaking' && (
            <div style={{ background:C.blanc, borderRadius:20, overflow:'hidden', boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ background:'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)', padding:'20px 28px' }}>
                <div style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:4 }}>🎤 Expression orale</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)' }}>{test.titre}</div>
              </div>
              <div style={{ padding:'28px 32px' }}>

                {/* Passage lecture (si integre_lecture) */}
                {test.speakType === 'integre_lecture' && test.speakTextePassage && (
                  <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:10, padding:'16px 20px', marginBottom:20 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'#1D4ED8', marginBottom:8 }}>📖 Lisez ce texte avant de répondre :</div>
                    <div style={{ fontSize:14, color:C.navy, lineHeight:1.7 }}>{test.speakTextePassage}</div>
                  </div>
                )}

                {/* Audio source (si integre_audio) */}
                {test.speakType === 'integre_audio' && test.speakAudioUrl && (
                  <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:'16px 20px', marginBottom:20 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'#15803D', marginBottom:8 }}>🎧 Écoutez cet audio avant de répondre :</div>
                    <audio controls src={test.speakAudioUrl} style={{ width:'100%' }} />
                  </div>
                )}

                {/* Consigne */}
                <div style={{ background:`${C.cyan}10`, border:`1px solid ${C.cyan}30`, borderRadius:10, padding:'16px 20px', marginBottom:20 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.cyanDk, marginBottom:6 }}>📌 Consigne</div>
                  <div style={{ fontSize:15, color:C.navy, lineHeight:1.6, fontWeight:500 }}>{test.speakConsigne || 'Exprimez-vous librement sur le sujet proposé.'}</div>
                  {test.speakTip && (
                    <div style={{ marginTop:10, fontSize:12, color:C.gris600, fontStyle:'italic', borderTop:`1px solid ${C.gris200}`, paddingTop:8 }}>
                      💡 Conseil : {test.speakTip}
                    </div>
                  )}
                </div>

                {/* Timers */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:24 }}>
                  <div style={{ background:C.gris50, borderRadius:10, padding:'12px 16px', border:`1px solid ${C.gris200}`, textAlign:'center' }}>
                    <div style={{ fontSize:11, color:C.gris400, marginBottom:4 }}>⏱ Temps de préparation</div>
                    <div style={{ fontSize:20, fontWeight:800, color:C.navy }}>{test.speakPrepTime || 30} sec</div>
                  </div>
                  <div style={{ background:C.gris50, borderRadius:10, padding:'12px 16px', border:`1px solid ${C.gris200}`, textAlign:'center' }}>
                    <div style={{ fontSize:11, color:C.gris400, marginBottom:4 }}>🎙 Durée max de réponse</div>
                    <div style={{ fontSize:20, fontWeight:800, color:C.navy }}>{test.speakRecordTime || 60} sec</div>
                  </div>
                </div>

                {/* Zone enregistrement */}
                <div style={{ border:`2px dashed ${enregistrement ? '#DC2626' : audioBlob ? C.succes : C.gris200}`, borderRadius:14, padding:'24px 20px', textAlign:'center', background: enregistrement ? '#FEF2F2' : audioBlob ? '#F0FDF4' : C.gris50, marginBottom:20 }}>
                  {!enregistrement && !audioBlob && (
                    <>
                      <div style={{ fontSize:40, marginBottom:10 }}>🎤</div>
                      <div style={{ fontSize:14, fontWeight:600, color:C.navy, marginBottom:6 }}>Prêt à enregistrer</div>
                      <div style={{ fontSize:12, color:C.gris400, marginBottom:16 }}>Cliquez sur le bouton ci-dessous pour commencer votre réponse</div>
                      <button onClick={demarrerEnregistrement} style={{ padding:'12px 28px', borderRadius:10, border:'none', background:'#DC2626', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        🔴 Démarrer l'enregistrement
                      </button>
                    </>
                  )}
                  {enregistrement && (
                    <>
                      <div style={{ fontSize:40, marginBottom:10, animation:'pulse 1s infinite' }}>🔴</div>
                      <div style={{ fontSize:14, fontWeight:700, color:'#DC2626', marginBottom:6 }}>Enregistrement en cours…</div>
                      <div style={{ fontSize:12, color:C.gris400, marginBottom:16 }}>Parlez clairement, proche du microphone</div>
                      <button onClick={arreterEnregistrement} style={{ padding:'12px 28px', borderRadius:10, border:'none', background:C.navy, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        ⏹ Arrêter l'enregistrement
                      </button>
                    </>
                  )}
                  {audioBlob && !enregistrement && (
                    <>
                      <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
                      <div style={{ fontSize:14, fontWeight:700, color:C.succes, marginBottom:12 }}>Enregistrement réussi !</div>
                      <audio controls src={URL.createObjectURL(audioBlob)} style={{ width:'100%', marginBottom:12 }} />
                      <button onClick={() => { setAudio(null); }} style={{ padding:'8px 18px', borderRadius:8, border:`1px solid ${C.gris200}`, background:C.blanc, color:C.gris600, fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        🔄 Réenregistrer
                      </button>
                    </>
                  )}
                </div>

                <button onClick={envoyerSpeaking} disabled={!audioBlob || envoiEnCours} style={{ width:'100%', padding:'14px 0', borderRadius:12, border:'none', background: audioBlob ? C.succes : C.gris200, color: audioBlob ? '#fff' : C.gris400, fontSize:14, fontWeight:700, cursor: (audioBlob && !envoiEnCours) ? 'pointer' : 'not-allowed', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                  {envoiEnCours ? '⏳ Envoi de l\'enregistrement…' : audioBlob ? '📤 Envoyer ma réponse' : '⚠️ Enregistrez votre réponse d\'abord'}
                </button>
              </div>
            </div>
          )}

          {/* ═══ RÉSULTAT ═════════════════════════════════════════════════ */}
          {etape === 'resultat' && resultat && (
            <div style={{ background:C.blanc, borderRadius:20, overflow:'hidden', boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ background:`linear-gradient(135deg, ${C.succes} 0%, #059669 100%)`, padding:'32px 36px', textAlign:'center' }}>
                <div style={{ fontSize:56, marginBottom:12 }}>🎉</div>
                <div style={{ fontSize:24, fontWeight:800, color:'#fff', marginBottom:6 }}>
                  {test.type === 'speaking' ? 'Réponse envoyée !' : 'Test terminé !'}
                </div>
                <div style={{ fontSize:14, color:'rgba(255,255,255,0.8)' }}>
                  {test.type === 'speaking' ? 'Votre enregistrement a été transmis à votre agent.' : 'Vos réponses ont été enregistrées.'}
                </div>
              </div>
              <div style={{ padding:'32px 36px' }}>

                {/* Score (si pas speaking) */}
                {test.type !== 'speaking' && resultat.total > 0 && (
                  <div style={{ textAlign:'center', marginBottom:28 }}>
                    <div style={{ fontSize:56, fontWeight:900, color:C.navy, lineHeight:1 }}>{resultat.score}<span style={{ fontSize:24, fontWeight:400, color:C.gris400 }}>/{resultat.total}</span></div>
                    <div style={{ fontSize:14, color:C.gris400, marginTop:4 }}>bonnes réponses</div>
                    <div style={{ margin:'12px auto 0', height:8, width:'80%', background:C.gris100, borderRadius:4, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${(resultat.score / resultat.total) * 100}%`, background:resultat.score / resultat.total >= 0.6 ? C.succes : C.erreur, borderRadius:4, transition:'width 1s' }} />
                    </div>
                  </div>
                )}

                {/* Niveau détecté */}
                <div style={{ textAlign:'center', marginBottom:28 }}>
                  <div style={{ fontSize:13, color:C.gris400, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Niveau estimé</div>
                  <div style={{ display:'inline-block', padding:'10px 32px', borderRadius:14, background:`${NIV_COULEUR[resultat.niveauDetecte] || C.cyan}20`, border:`2px solid ${NIV_COULEUR[resultat.niveauDetecte] || C.cyan}`, fontSize:36, fontWeight:900, color:NIV_COULEUR[resultat.niveauDetecte] || C.cyan }}>
                    {resultat.niveauDetecte}
                  </div>
                  {test.type === 'speaking' && (
                    <div style={{ fontSize:12, color:C.gris400, marginTop:8 }}>Niveau estimé - confirmation par votre agent après écoute</div>
                  )}
                </div>

                <div style={{ background:C.gris50, borderRadius:12, padding:'16px 20px', marginBottom:24 }}>
                  <div style={{ fontSize:13, color:C.navy, fontWeight:600, marginBottom:8 }}>📬 Et maintenant ?</div>
                  <ul style={{ margin:0, padding:'0 0 0 18px', fontSize:13, color:C.gris600, lineHeight:1.8 }}>
                    <li>Votre agent BET a reçu les résultats et vous assignera bientôt à un groupe.</li>
                    <li>Vous recevrez un email de confirmation avec vos accès définitifs.</li>
                    {test.notifierEleves && <li>Une notification vous sera envoyée dès que le groupe est confirmé.</li>}
                  </ul>
                </div>

                <div style={{ textAlign:'center', fontSize:12, color:C.gris400 }}>
                  Résultats envoyés le {new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })} à {new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Footer */}
      <div style={{ background:'rgba(0,0,0,0.2)', borderTop:'1px solid rgba(255,255,255,0.06)', padding:'14px 32px', textAlign:'center', fontSize:11, color:'rgba(255,255,255,0.35)', flexShrink:0 }}>
        © 2026 BET × TLG - Plateforme E-Learning · Abidjan, Côte d'Ivoire
      </div>
    </div>
  );
}
