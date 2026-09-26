// src/pages/shared/LevelTest.jsx
// Test de niveau multi-format (QCM/Listening/Reading/Vrai-Faux/Texte à trous/
// Libre/Speaking par question) - réplique du modèle dash (FreeLevelTest.jsx)
// sur les tables bet_level_tests/bet_level_questions/bet_level_test_results.
// Route publique (pas d'authentification) - coexiste avec TestNiveau.jsx
// (l'ancien système bet_elearning_tests_niveau, laissé tel quel).
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAlerte } from '../../contexts/ConfirmContext';

import { fetchUpload } from "../../utils/fetchUpload";
const C = {
  navy: '#0B1E3D', cyan: '#0891B2', cyanDk: '#0E7490',
  gris50: '#F8FAFC', gris100: '#F1F5F9', gris200: '#E2E8F0', gris400: '#94A3B8', gris600: '#475569',
  blanc: '#FFFFFF', succes: '#10B981', erreur: '#EF4444', warning: '#F59E0B',
};
const NIV_COULEUR = { A1:'#94A3B8', A2:'#60A5FA', B1:'#34D399', B2:'#818CF8', C1:'#F59E0B', C2:'#F97316' };
const _API = process.env.REACT_APP_API_URL || 'http://localhost:5001';

/* ════════════════════════════════════════════════════════
   TEXTES D'INSTRUCTIONS / EXEMPLE - mêmes contenus que dash
   (Frontend/FreeLevelTest.jsx), un écran "Comment ça marche" +
   un exemple non noté avant chaque nouvelle catégorie de
   questions, par type d'exercice.
════════════════════════════════════════════════════════ */
const TYPE_INTRO = {
  qcm: {
    how: [
      { icon:'✅', en:"A few multiple-choice questions. Tap the best answer.", fr:"Quelques questions à choix multiple. Touchez la meilleure réponse." },
      { icon:'⏱️', en:"Each question is timed. Don't overthink it.", fr:"Chaque question est chronométrée. Ne réfléchissez pas trop." },
      { icon:'➡️', en:"When you answer, you move straight to the next one.", fr:"Quand vous répondez, vous passez directement à la suivante." },
      { icon:'🤔', en:"We won't tell you if you're right or wrong. That's normal.", fr:"Nous ne dirons pas si c'est juste ou faux. C'est normal." },
    ],
    warning: null,
    sample: { kind:'qcm', q:"She ___ a teacher.", opts:["is","are","am"], sel:0,
      note:{ en:"Here, “is” is chosen. In the real test, tapping an answer moves you on.", fr:"Ici, « is » est sélectionné. Dans le vrai test, toucher une réponse vous fait avancer." } },
  },
  vrai_faux: {
    how: [
      { icon:'✅', en:"A statement is shown. Decide if it's True or False.", fr:"Une affirmation est affichée. Décidez si elle est Vraie ou Fausse." },
      { icon:'⏱️', en:"Each question is timed. Go with your first instinct.", fr:"Chaque question est chronométrée. Fiez-vous à votre premier instinct." },
      { icon:'➡️', en:"Tapping an answer moves you straight to the next question.", fr:"Toucher une réponse vous fait passer directement à la question suivante." },
    ],
    warning: null,
    sample: { kind:'vf', q:"Water boils at 100°C.", sel:"Vrai",
      note:{ en:"Here, “Vrai” (True) is chosen. In the real test, tapping an answer moves you on.", fr:"Ici, « Vrai » est sélectionné. Dans le vrai test, toucher une réponse vous fait avancer." } },
  },
  texte_trous: {
    how: [
      { icon:'✏️', en:"A sentence is missing a word. Type the correct word in the blank.", fr:"Il manque un mot dans une phrase. Tapez le mot correct dans le blanc." },
      { icon:'⌨️', en:"Spelling counts - write it exactly as it should appear.", fr:"L'orthographe compte - écrivez-le exactement comme il doit apparaître." },
      { icon:'➡️', en:"Tap “Next” when you're done answering.", fr:"Touchez « Suivant » une fois votre réponse saisie." },
    ],
    warning: null,
    sample: { kind:'trous', q:"I ___ (to be) very happy today.", val:"am",
      note:{ en:"Here, “am” is typed in the blank. Write your own answer in the real test.", fr:"Ici, « am » est saisi dans le blanc. Écrivez votre propre réponse dans le vrai test." } },
  },
  audio_qcm: {
    how: [
      { icon:'🎧', en:"Listen to a short audio clip - replay it as many times as you like before answering.", fr:"Écoutez un court extrait audio - réécoutez-le autant de fois que vous voulez avant de répondre." },
      { icon:'✅', en:"Then answer a multiple-choice question about what you heard.", fr:"Puis répondez à une question à choix multiple sur ce que vous avez entendu." },
      { icon:'⏱️', en:"Each question is timed once you start answering.", fr:"Chaque question est chronométrée une fois que vous commencez à répondre." },
    ],
    warning: null,
    sample: { kind:'qcm', audio:true, q:"What is the woman's job?", opts:["A teacher","A doctor","An engineer"], sel:0,
      note:{ en:"Listen first, then tap the best answer - just like in the real test.", fr:"Écoutez d'abord, puis touchez la meilleure réponse - comme dans le vrai test." } },
  },
  lecture_qcm: {
    how: [
      { icon:'📖', en:"Read a short passage carefully.", fr:"Lisez attentivement un court texte." },
      { icon:'✅', en:"Then answer a multiple-choice question about it.", fr:"Puis répondez à une question à choix multiple à ce sujet." },
      { icon:'⏱️', en:"Take your time reading, but answer honestly once you start.", fr:"Prenez le temps de lire, mais répondez honnêtement une fois que vous commencez." },
    ],
    warning: null,
    sample: { kind:'qcm', passage:"Sarah works at a hospital. She helps sick people every day and wears a white coat.", q:"Where does Sarah work?", opts:["At a hospital","At a school","At a bank"], sel:0,
      note:{ en:"Read the passage, then tap the best answer - just like in the real test.", fr:"Lisez le texte, puis touchez la meilleure réponse - comme dans le vrai test." } },
  },
  libre: {
    how: [
      { icon:'✍️', en:"Write your answer in English, in your own words.", fr:"Rédigez votre réponse en anglais, avec vos propres mots." },
      { icon:'👩‍🏫', en:"This part is corrected manually by our team - no instant score.", fr:"Cette partie est corrigée manuellement par notre équipe - pas de score instantané." },
      { icon:'🌐', en:"No internet searches, dictionary, or translator.", fr:"Aucune recherche internet, dictionnaire ou traducteur." },
    ],
    warning: null,
    sample: { kind:'libre', q:"Describe your daily routine in 2–3 sentences.", val:"I wake up at 6am. I have breakfast, then I go to work by bus.",
      note:{ en:"Write a few honest sentences - length and accuracy both matter.", fr:"Écrivez quelques phrases honnêtes - la longueur et la justesse comptent toutes les deux." } },
  },
  speaking: {
    how: [
      { icon:'🎙️', en:"Find a quiet place. You will need to speak out loud.", fr:"Trouvez un endroit calme. Vous devrez parler à voix haute." },
      { icon:'🎧', en:"Check your microphone and sound before you begin.", fr:"Vérifiez votre micro et le son avant de commencer." },
      { icon:'⏱️', en:"Each part is timed. Answer as honestly as you can.", fr:"Chaque partie est chronométrée. Répondez le plus honnêtement possible." },
    ],
    warning: { en:"Speak clearly and try to say as much as you can.", fr:"Parlez clairement et essayez d'en dire le plus possible." },
    sample: { kind:'speaking',
      note:{ en:"In the real test, tap the microphone to start recording your answer.", fr:"Dans le vrai test, touchez le micro pour démarrer l'enregistrement de votre réponse." } },
  },
};

const Q_TYPE_ICON = { qcm:'🎯', vrai_faux:'✅', texte_trous:'✏️', audio_qcm:'🎧', lecture_qcm:'📖', libre:'💬', speaking:'🎙️' };

const introCardStyle = { background:C.blanc, borderRadius:20, overflow:'hidden', boxShadow:'0 24px 60px rgba(0,0,0,0.3)', width:'100%' };
const introBodyStyle = { padding:'32px 36px' };

function BiLine({ icon, en, fr, tone = 'muted' }) {
  const tones = { muted:{ bg:C.gris50, border:C.gris200 }, warning:{ bg:'#FEF2F2', border:'#FECACA' } };
  const t = tones[tone] || tones.muted;
  return (
    <div style={{ display:'flex', gap:12, alignItems:'flex-start', background:t.bg, border:`1px solid ${t.border}`, borderRadius:12, padding:'14px 16px', marginBottom:12 }}>
      {icon && <span style={{ fontSize:'1.15rem', flexShrink:0, lineHeight:1.4 }}>{icon}</span>}
      <div>
        <div style={{ fontSize:'.92rem', fontWeight:600, color: tone==='warning' ? '#B91C1C' : C.navy, lineHeight:1.55 }}>{en}</div>
        <div style={{ fontSize:'.82rem', fontStyle:'italic', color: tone==='warning' ? '#B91C1C99' : C.gris400, marginTop:3, lineHeight:1.5 }}>{fr}</div>
      </div>
    </div>
  );
}

function IntegrityGate({ onContinue }) {
  return (
    <div style={introCardStyle}>
      <div style={{ background:`linear-gradient(135deg, ${C.navy} 0%, #1E3A5F 100%)`, padding:'26px 28px', textAlign:'center' }}>
        <div style={{ fontSize:'2rem', marginBottom:8 }}>🛡️</div>
        <h2 style={{ fontFamily:'"Plus Jakarta Sans", sans-serif', color:'#fff', fontSize:'1.3rem', fontWeight:800, margin:'0 0 4px' }}>Before you begin</h2>
        <p style={{ color:'rgba(255,255,255,.65)', fontSize:'.84rem', fontStyle:'italic', margin:0 }}>Avant de commencer</p>
      </div>
      <div style={introBodyStyle}>
        <BiLine icon="🌐" en={<><strong>No internet searches</strong> · Aucune recherche internet</>} fr="Do not search for answers in a browser, dictionary, or online translator. N'utilisez pas de navigateur, dictionnaire ou traducteur en ligne." />
        <BiLine icon="📝" en={<><strong>Your own words only</strong> · Vos propres mots uniquement</>} fr="All responses must come from your own knowledge and ability. Toutes les réponses doivent venir de vos propres connaissances et capacités." />
        <BiLine icon="🚫" en={<><strong>No AI tools</strong> · Aucun outil d'IA</>} fr="Do not use ChatGPT or any other AI assistant to answer. N'utilisez pas ChatGPT ni aucun autre assistant IA pour répondre." />
        <BiLine tone="warning" en="Using any form of external assistance invalidates your results and misrepresents your true level."
          fr="L'utilisation d'une aide extérieure invalide vos résultats et ne reflète pas votre vrai niveau." />
        <button onClick={onContinue} style={{ width:'100%', marginTop:8, padding:15, background:C.cyan, color:'#fff', border:'none', borderRadius:12, fontWeight:800, fontSize:'.95rem', cursor:'pointer' }}>
          I UNDERSTAND - I WILL NOT CHEAT
        </button>
        <p style={{ textAlign:'center', fontSize:'.78rem', fontStyle:'italic', color:C.gris400, margin:'10px 0 0' }}>Je comprends - je ne tricherai pas</p>
      </div>
    </div>
  );
}

function SampleQcmCard({ sample }) {
  return (
    <div style={{ background:C.blanc, border:`1px solid ${C.gris200}`, borderRadius:16, padding:'20px 22px' }}>
      {sample.audio && <div style={{ background:C.gris50, border:`1.5px solid ${C.gris200}`, borderRadius:12, padding:'10px 14px', marginBottom:14, fontSize:'.82rem', color:C.gris600, fontWeight:600 }}>🎧 (Example audio)</div>}
      {sample.passage && <div style={{ background:'#EFF6FF', border:'1.5px solid #BFDBFE', borderRadius:12, padding:'12px 14px', marginBottom:14, fontSize:'.84rem', color:'#1D4ED8' }}>📖 {sample.passage}</div>}
      <div style={{ fontSize:'.78rem', color:C.gris400, fontWeight:700, marginBottom:6 }}>QUESTION 1 / 5</div>
      <div style={{ fontSize:'1.15rem', fontWeight:700, color:C.navy, marginBottom:18 }}>{sample.q}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {sample.opts.map((opt, i) => (
          <div key={opt} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 18px', borderRadius:12, background: i===sample.sel ? C.cyan : `${C.cyan}12`, color: i===sample.sel ? '#fff' : C.cyanDk, fontWeight:700 }}>
            <span style={{ width:26, height:26, borderRadius:'50%', background: i===sample.sel ? 'rgba(255,255,255,.25)' : `${C.cyan}25`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.78rem', flexShrink:0 }}>{['A','B','C','D'][i]}</span>
            {opt}
          </div>
        ))}
      </div>
    </div>
  );
}
function SampleVfCard({ sample }) {
  return (
    <div style={{ background:C.blanc, border:`1px solid ${C.gris200}`, borderRadius:16, padding:'20px 22px' }}>
      <div style={{ fontSize:'1.15rem', fontWeight:700, color:C.navy, marginBottom:18 }}>{sample.q}</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        {['Vrai','Faux'].map(opt => (
          <div key={opt} style={{ textAlign:'center', padding:14, borderRadius:12, background: opt===sample.sel ? C.cyan : `${C.cyan}12`, color: opt===sample.sel ? '#fff' : C.cyanDk, fontWeight:700 }}>{opt}</div>
        ))}
      </div>
    </div>
  );
}
function SampleTrousCard({ sample }) {
  return (
    <div style={{ background:C.blanc, border:`1px solid ${C.gris200}`, borderRadius:16, padding:'20px 22px' }}>
      <div style={{ fontSize:'1.15rem', fontWeight:700, color:C.navy, marginBottom:18 }}>{sample.q}</div>
      <div style={{ padding:'13px 16px', borderRadius:10, border:`2px solid ${C.cyan}`, background:`${C.cyan}12`, color:C.cyanDk, fontWeight:700, display:'inline-block', minWidth:100 }}>{sample.val}</div>
    </div>
  );
}
function SampleLibreCard({ sample }) {
  return (
    <div style={{ background:C.blanc, border:`1px solid ${C.gris200}`, borderRadius:16, padding:'20px 22px' }}>
      <div style={{ fontSize:'1.15rem', fontWeight:700, color:C.navy, marginBottom:14 }}>{sample.q}</div>
      <div style={{ padding:'14px 16px', borderRadius:10, border:`1.5px solid ${C.gris200}`, background:C.gris50, color:C.gris600, fontSize:'.9rem', lineHeight:1.6 }}>{sample.val}</div>
    </div>
  );
}
function SampleSpeakingCard() {
  return (
    <div style={{ background:C.blanc, border:`1px solid ${C.gris200}`, borderRadius:16, padding:'30px 22px', textAlign:'center' }}>
      <div style={{ width:100, height:100, borderRadius:'50%', background:'#FEF2F2', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
        <div style={{ width:64, height:64, borderRadius:14, background:'#DC2626', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.6rem', color:'#fff' }}>🎙️</div>
      </div>
      <div style={{ fontSize:'1.8rem', fontWeight:900, color:C.navy, marginBottom:6 }}>2:00</div>
      <p style={{ fontSize:'.82rem', color:C.gris400, margin:'0 0 4px' }}>The timer counts down while you speak.</p>
      <p style={{ fontSize:'.78rem', fontStyle:'italic', color:C.gris200, margin:0 }}>Le minuteur décompte pendant que vous parlez.</p>
    </div>
  );
}
const SAMPLE_RENDERERS = { qcm:SampleQcmCard, vf:SampleVfCard, trous:SampleTrousCard, libre:SampleLibreCard, speaking:SampleSpeakingCard };

function SectionIntro({ category, type, sectionIndex, totalSections, view, onChangeView, onStart }) {
  const meta = TYPE_INTRO[type] || TYPE_INTRO.qcm;
  const icon = Q_TYPE_ICON[type] || '🎯';
  const SampleRenderer = SAMPLE_RENDERERS[meta.sample?.kind] || SampleQcmCard;

  const Tab = ({ id, label, done }) => (
    <button onClick={() => (done || id === view) && onChangeView(id)} disabled={!done && id !== view}
      style={{ padding:'8px 16px', borderRadius:999, border:'none', fontWeight:800, fontSize:'.78rem', letterSpacing:'.03em',
        cursor: done ? 'pointer' : 'default',
        background: id === view ? C.cyan : done ? '#F0FDF4' : C.gris100,
        color: id === view ? '#fff' : done ? '#16A34A' : C.gris400 }}>
      {done && id !== view ? '✓ ' : ''}{label}
    </button>
  );

  return (
    <div style={{ width:'100%' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:999, background:C.cyan, color:'#fff', fontWeight:800, fontSize:'.85rem' }}>
          {icon} {category.toUpperCase()} <span style={{ background:'rgba(255,255,255,.25)', borderRadius:999, padding:'1px 8px', fontSize:'.75rem' }}>{sectionIndex+1}/{totalSections}</span>
        </span>
        <span style={{ fontSize:'.82rem', fontStyle:'italic', color:'rgba(255,255,255,.6)' }}>{category}</span>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        <Tab id="instructions" label="INSTRUCTIONS" done />
        <Tab id="sample" label="SAMPLE" done={view === 'sample'} />
      </div>

      {view === 'instructions' ? (
        <div style={introCardStyle}>
          <div style={introBodyStyle}>
            <h2 style={{ fontFamily:'"Plus Jakarta Sans", sans-serif', color:C.navy, fontSize:'1.25rem', fontWeight:800, margin:'0 0 2px' }}>How this part works</h2>
            <p style={{ color:C.gris400, fontSize:'.82rem', fontStyle:'italic', margin:'0 0 20px' }}>Comment fonctionne cette partie</p>
            {meta.how.map((h, i) => <BiLine key={i} icon={h.icon} en={h.en} fr={h.fr} />)}
            {meta.warning && <BiLine tone="warning" en={meta.warning.en} fr={meta.warning.fr} />}
            <button onClick={() => onChangeView('sample')} style={{ width:'100%', marginTop:8, padding:15, background:C.cyan, color:'#fff', border:'none', borderRadius:12, fontWeight:800, fontSize:'.95rem', cursor:'pointer' }}>
              SEE AN EXAMPLE
            </button>
            <p style={{ textAlign:'center', fontSize:'.78rem', fontStyle:'italic', color:C.gris400, margin:'10px 0 0' }}>Voir un exemple</p>
          </div>
        </div>
      ) : (
        <div style={introCardStyle}>
          <div style={introBodyStyle}>
            <span style={{ display:'inline-block', background:`${C.cyan}15`, color:C.cyanDk, fontWeight:700, fontSize:'.76rem', borderRadius:999, padding:'4px 12px', marginBottom:4 }}>Example only - not scored</span>
            <p style={{ fontSize:'.78rem', fontStyle:'italic', color:C.gris400, margin:'4px 0 18px' }}>Exemple seulement - non noté</p>
            <SampleRenderer sample={meta.sample} />
            {meta.sample?.note && (
              <p style={{ textAlign:'center', fontSize:'.84rem', color:C.gris600, lineHeight:1.6, margin:'16px 0 0' }}>
                {meta.sample.note.en}
                <span style={{ display:'block', fontStyle:'italic', fontSize:'.8rem', color:C.gris400, marginTop:3 }}>{meta.sample.note.fr}</span>
              </p>
            )}
            <button onClick={onStart} style={{ width:'100%', marginTop:22, padding:15, background: type==='speaking' ? '#DC2626' : C.cyan, color:'#fff', border:'none', borderRadius:12, fontWeight:800, fontSize:'.95rem', cursor:'pointer' }}>
              START THE {category.toUpperCase()} TEST
            </button>
            <p style={{ textAlign:'center', fontSize:'.78rem', fontStyle:'italic', color:C.gris400, margin:'10px 0 0' }}>Commencer - {category}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Timer({ secondes: dureeSec, onExpire }) {
  const [secondes, setSecondes] = useState(dureeSec);
  useEffect(() => {
    setSecondes(dureeSec);
    const t = setInterval(() => {
      setSecondes(s => { if (s <= 1) { clearInterval(t); onExpire(); return 0; } return s - 1; });
    }, 1000);
    return () => clearInterval(t);
  }, [dureeSec, onExpire]);
  const m = Math.floor(secondes / 60), s = secondes % 60, urgent = secondes < 10;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:20, background: urgent ? '#FEF2F2' : C.gris100, border:`1px solid ${urgent ? '#FECACA' : C.gris200}`, fontSize:13, fontWeight:700, color: urgent ? C.erreur : C.navy }}>
      ⏱ {m}:{String(s).padStart(2,'0')}
    </div>
  );
}

export default function LevelTest() {
  const { testId } = useParams();
  const [searchParams] = useSearchParams();
  const apprenantId = searchParams.get('a');
  const alerte = useAlerte();

  const [test, setTest]       = useState(null);
  const [apprenant, setApprenant] = useState(null); // identité déjà connue via ?a= (lien envoyé par l'agent)
  const [erreur, setErreur]   = useState(null);
  const [etape, setEtape]     = useState('intro'); // intro | infos | test | resultat
  const [formData, setFD]     = useState({ fullname:'', email:'', phone:'' });
  const [qActuelle, setQAct]  = useState(0);
  const [answers, setAnswers] = useState({});
  const [audioAnswers, setAudioAnswers] = useState({}); // { [qId]: url }
  const [debut, setDebut]     = useState(null);
  const [resultat, setResultat] = useState(null);

  // Sous-étapes de l'étape "test" : règles d'intégrité (une fois) → instructions +
  // exemple avant chaque nouvelle catégorie → questions réelles.
  const [quizPhase, setQuizPhase] = useState('rules'); // 'rules' | 'intro' | 'live'
  const [introView, setIntroView] = useState('instructions'); // 'instructions' | 'sample'
  const quizPhaseRef = useRef(quizPhase);
  useEffect(() => { quizPhaseRef.current = quizPhase; }, [quizPhase]);

  // Tentative ancrée côté serveur (bet_level_test_attempts) - empêche qu'un
  // rafraîchissement de page "recommence" le test. Seulement possible quand
  // apprenantId est présent (lien envoyé à un apprenant identifié) : sans
  // identité stable, aucune tentative n'est créée (voir migration SQL).
  const [attemptId, setAttemptId]       = useState(null);
  const [attemptReady, setAttemptReady] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const attemptIdRef = useRef(null);
  useEffect(() => { attemptIdRef.current = attemptId; }, [attemptId]);

  // Speaking - enregistrement
  const [enregistrement, setEnreg] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    (async () => {
      try {
        const url = `${_API}/api/bet-elearning/level-tests/${testId}/public${apprenantId ? `?a=${encodeURIComponent(apprenantId)}` : ''}`;
        const r = await fetch(url);
        const d = await r.json();
        if (!r.ok || !d.test) { setErreur(d.error || 'Test introuvable. Le lien est peut-être expiré ou incorrect.'); return; }
        setTest(d.test);
        if (apprenantId && d.apprenant) {
          setApprenant(d.apprenant);
          setFD(f => ({ ...f, fullname: `${d.apprenant.prenom} ${d.apprenant.nom}`.trim() }));
        }
      } catch {
        setErreur('Impossible de charger le test. Vérifiez votre connexion et réessayez.');
      }
    })();
  }, [testId, apprenantId]);

  const questionsRaw = (test?.bet_level_questions || []).filter(q => q.actif !== false);
  // Regroupées par catégorie (ordre de 1ère apparition) pour que chaque
  // catégorie forme une section cohérente avec ses propres instructions.
  const questions = useMemo(() => {
    const order = [];
    questionsRaw.forEach(q => { if (q?.category && !order.includes(q.category)) order.push(q.category); });
    return [...questionsRaw].sort((a,b) => order.indexOf(a.category) - order.indexOf(b.category));
  }, [questionsRaw]); // eslint-disable-line
  const sections = useMemo(() => {
    const order = [];
    questions.forEach(q => { if (q?.category && !order.includes(q.category)) order.push(q.category); });
    return order;
  }, [questions]);

  const isCorrect = useCallback((q) => {
    const ans = answers[q.id] ?? '';
    if (q.type === 'libre' || q.type === 'speaking') return false; // correction manuelle
    if (q.type === 'texte_trous') return ans.toLowerCase().trim() === (q.correct || '').toLowerCase().trim();
    return ans === q.correct;
  }, [answers]);

  function demarrer() {
    // Identité déjà connue via le lien (?a=) - inutile de la redemander, on va
    // directement au test (même comportement que l'ancien système, TestNiveau.jsx).
    if (apprenant) {
      setDebut(Date.now());
      setQAct(0);
      setAnswers({});
      setAudioAnswers({});
      setQuizPhase('rules');
      setIntroView('instructions');
      setEtape('test');
      return;
    }
    setEtape('infos');
  }

  // ── Résolution de la tentative côté serveur (création ou reprise) ──
  useEffect(() => {
    if (etape !== 'test' || attemptReady) return;
    let cancelled = false;
    (async () => {
      if (!apprenantId) { setAttemptReady(true); return; }
      try {
        const res = await fetch(`${_API}/api/bet-elearning/level-test/attempt/start`, {
          method: 'POST', headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ apprenant_id: apprenantId, test_id: test?.id || null, question_ids: questions.map(q=>q.id) }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.attempt) {
          setAttemptId(data.attempt.id);
          if (data.resumed) {
            setAnswers(data.attempt.answers || {});
            setAudioAnswers(data.attempt.audio_answers || {});
            setQuizPhase(data.attempt.quiz_phase || 'rules');
            setIntroView('instructions');
            setQAct(Math.min(Math.max(data.attempt.current_index || 0, 0), Math.max(questions.length - 1, 0)));
            setTabSwitchCount(data.attempt.tab_switch_count || 0);
          }
        }
      } catch { /* API indisponible : le test reste utilisable, juste sans reprise */ }
      finally { if (!cancelled) setAttemptReady(true); }
    })();
    return () => { cancelled = true; };
  }, [etape]); // eslint-disable-line

  // ── Sauvegarde incrémentale de la progression ──
  useEffect(() => {
    if (!attemptId || !attemptReady) return;
    fetch(`${_API}/api/bet-elearning/level-test/attempt/${attemptId}/progress`, {
      method: 'PATCH', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ answers, audio_answers: audioAnswers, current_index: qActuelle, quiz_phase: quizPhase }),
    }).catch(() => {});
  }, [attemptId, attemptReady, answers, audioAnswers, qActuelle, quizPhase]); // eslint-disable-line

  // ── Détection des changements d'onglet pendant les questions réelles -
  // ne peut pas être empêchée depuis un site web, seulement détectée et
  // remontée au staff dans le résultat final pour revue manuelle.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && etape === 'test' && quizPhaseRef.current === 'live') {
        setTabSwitchCount(c => c + 1);
        if (attemptIdRef.current) {
          fetch(`${_API}/api/bet-elearning/level-test/attempt/${attemptIdRef.current}/progress`, {
            method: 'PATCH', headers: { 'Content-Type':'application/json' },
            body: JSON.stringify({ tab_switch_increment: true }),
          }).catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [etape]);

  function commencerTest() {
    if (!formData.fullname.trim()) { alerte('Votre nom est requis.', { danger:true }); return; }
    setDebut(Date.now());
    setQAct(0);
    setAnswers({});
    setAudioAnswers({});
    setQuizPhase('rules');
    setIntroView('instructions');
    setEtape('test');
  }

  function repondre(qId, val) { setAnswers(a => ({ ...a, [qId]: val })); }

  // Avance vers `idx` - si la question ciblée appartient à une nouvelle
  // catégorie, on repasse par l'écran instructions/exemple de cette section.
  function avancerVers(idx) {
    if (idx < 0 || idx >= questions.length) return;
    const curCat  = questions[qActuelle]?.category;
    const nextCat = questions[idx]?.category;
    setQAct(idx);
    if (nextCat !== curCat) { setQuizPhase('intro'); setIntroView('instructions'); }
  }

  async function demarrerEnregistrement(qId) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(m => MediaRecorder.isTypeSupported(m)) || '';
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mr.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType.split(';')[0] || 'audio/webm' });
        setUploadingAudio(true);
        try {
          const fd = new FormData();
          fd.append('file', blob, 'recording.webm');
          const r = await fetchUpload(`${_API}/api/upload/recording`, { method:'POST', body:fd });
          const d = await r.json();
          if (r.ok && d.url) { setAudioAnswers(a => ({ ...a, [qId]: d.url })); repondre(qId, d.url); }
          else await alerte(d.error || "Erreur lors de l'envoi de l'enregistrement", { danger:true });
        } catch { await alerte("Erreur réseau lors de l'envoi de l'enregistrement", { danger:true }); }
        finally { setUploadingAudio(false); }
      };
      mediaRef.current = mr;
      mr.start();
      setEnreg(true);
    } catch {
      await alerte('Microphone non disponible. Vérifiez les permissions de votre navigateur.', { danger:true });
    }
  }

  function arreterEnregistrement() { mediaRef.current?.stop(); setEnreg(false); }

  function computeResult() {
    let earned = 0;
    const byCat = {}, byCefr = {};
    questions.forEach(q => {
      if (!byCat[q.category]) byCat[q.category] = { correct:0, total:0 };
      if (!byCefr[q.cefr])    byCefr[q.cefr]    = { correct:0, total:0 };
      byCat[q.category].total++; byCefr[q.cefr].total++;
      if (isCorrect(q)) { earned += (q.points || 1); byCat[q.category].correct++; byCefr[q.cefr].correct++; }
    });
    const gradable = questions.filter(q => q.type !== 'libre' && q.type !== 'speaking');
    const gradableTotal = gradable.reduce((s,q) => s+(q.points||1), 0) || 1;
    const pct = Math.round((earned / gradableTotal) * 100);
    let cefr = 'A1';
    if (pct >= 90) cefr='C2'; else if (pct >= 75) cefr='C1'; else if (pct >= 60) cefr='B2'; else if (pct >= 45) cefr='B1'; else if (pct >= 25) cefr='A2';
    return { earned, pct, cefr, byCat, byCefr, correct: questions.filter(isCorrect).length };
  }

  async function soumettre() {
    const resultData = computeResult();
    const timeTaken = debut ? Math.round((Date.now() - debut) / 1000) : 0;
    // Un test contenant ne serait-ce qu'une question libre/speaking reste
    // "en_attente" même si le reste est auto-corrigé - le score auto est
    // conservé pour pré-remplir la correction de l'agent (pas remis à zéro).
    const hasQuestionsManuelles = questions.some(q => q.type === 'libre' || q.type === 'speaking');
    const isFullyManual = test.type === 'speaking';
    const needsReview = isFullyManual || hasQuestionsManuelles;

    const body = {
      user: { fullname: formData.fullname, email: formData.email || null, phone: formData.phone || null },
      test: {
        test_id:            test.id,
        level:              isFullyManual ? 'En attente' : resultData.cefr,
        score:              isFullyManual ? 0 : resultData.pct,
        points_earned:      isFullyManual ? 0 : resultData.earned,
        points_total:       questions.filter(q=>q.type!=='libre'&&q.type!=='speaking').reduce((s,q)=>s+(q.points||1),0) || 100,
        correct_answers:    isFullyManual ? 0 : resultData.correct,
        total_questions:    questions.length,
        time_taken_seconds: timeTaken,
        answers_details:    questions.map(q => ({
          question_id: q.id, question_text: q.text, category: q.category, cefr: q.cefr,
          user_answer: q.type === 'speaking' ? (audioAnswers[q.id] ? '[audio]' : null) : (answers[q.id] || null),
          correct_answer: q.correct || null,
          is_correct: isFullyManual ? null : isCorrect(q),
        })),
        audio_answers:      audioAnswers,
        by_category:        isFullyManual ? {} : resultData.byCat,
        by_cefr:            isFullyManual ? {} : resultData.byCefr,
        format_test:        test.type,
        correction_statut:  needsReview ? 'en_attente' : 'auto',
        tab_switch_count:   tabSwitchCount,
      },
      apprenant_id: apprenantId || null,
      attempt_id: attemptIdRef.current || null,
      submitted_at: new Date().toISOString(),
    };

    try {
      await fetch(`${_API}/api/bet-elearning/level-test/submit`, {
        method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body),
      });
    } catch { /* le résultat reste affiché même si l'envoi échoue */ }

    setResultat({ ...resultData, needsReview, level: isFullyManual ? 'En attente' : resultData.cefr });
    setEtape('resultat');
  }

  function suivante() {
    if (qActuelle < questions.length - 1) avancerVers(qActuelle + 1);
    else soumettre();
  }

  // ── ERREUR / CHARGEMENT ──────────────────────────────────────────────────
  if (erreur) return (
    <div style={{ minHeight:'100vh', background:C.gris50, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
      <div style={{ textAlign:'center', maxWidth:420, padding:32 }}>
        <div style={{ fontSize:56, marginBottom:16 }}>🔗</div>
        <div style={{ fontSize:20, fontWeight:800, color:C.navy, marginBottom:8 }}>Lien invalide</div>
        <div style={{ fontSize:14, color:C.gris600, lineHeight:1.6 }}>{erreur}</div>
      </div>
    </div>
  );
  if (!test) return (
    <div style={{ minHeight:'100vh', background:C.gris50, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'"Plus Jakarta Sans", sans-serif', color:C.gris600 }}>
      Chargement du test…
    </div>
  );

  const qActive = questions[qActuelle];
  const dureeMinDefaut = test.params?.timerPerQ ? Math.ceil(test.params.timerPerQ / 60) : 1;

  return (
    <div style={{ minHeight:'100vh', background:`linear-gradient(135deg, ${C.navy} 0%, #1E3A5F 100%)`, fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', flexDirection:'column' }}>
      <div style={{ background:'rgba(255,255,255,0.06)', backdropFilter:'blur(10px)', borderBottom:'1px solid rgba(255,255,255,0.1)', padding:'14px 32px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:C.cyan, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:'#fff' }}>B</div>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:'#fff' }}>BET E-Learning</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>Test de niveau officiel</div>
          </div>
        </div>
        {etape === 'test' && quizPhase === 'live' && test.params?.timerEnabled && qActive?.type !== 'speaking' && (
          <Timer key={qActuelle} secondes={test.params.timerPerQ || 60} onExpire={suivante} />
        )}
      </div>

      <div style={{ flex:1, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 16px' }}>
        <div style={{ width:'100%', maxWidth:720 }}>

          {/* ═══ INTRO ═══ */}
          {etape === 'intro' && (
            <div style={{ background:C.blanc, borderRadius:20, overflow:'hidden', boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ background:`linear-gradient(135deg, ${C.cyan} 0%, ${C.cyanDk} 100%)`, padding:'32px 36px' }}>
                <div style={{ fontSize:36, marginBottom:12 }}>📝</div>
                <div style={{ fontSize:24, fontWeight:800, color:'#fff', marginBottom:6 }}>{test.titre}</div>
                <div style={{ fontSize:14, color:'rgba(255,255,255,0.75)' }}>{test.description || 'Test de niveau BET'}</div>
              </div>
              <div style={{ padding:'32px 36px' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:28 }}>
                  <div style={{ background:C.gris50, borderRadius:10, padding:'14px 16px', border:`1px solid ${C.gris200}` }}>
                    <div style={{ fontSize:11, color:C.gris400, marginBottom:4 }}>📊 Questions</div>
                    <div style={{ fontWeight:700, color:C.navy, fontSize:14 }}>{questions.length} question{questions.length!==1?'s':''}</div>
                  </div>
                  <div style={{ background:C.gris50, borderRadius:10, padding:'14px 16px', border:`1px solid ${C.gris200}` }}>
                    <div style={{ fontSize:11, color:C.gris400, marginBottom:4 }}>⏱ Temps par question</div>
                    <div style={{ fontWeight:700, color:C.navy, fontSize:14 }}>{test.params?.timerEnabled ? `${dureeMinDefaut} min` : 'Libre'}</div>
                  </div>
                </div>
                <button onClick={demarrer} style={{ width:'100%', padding:'15px 0', borderRadius:12, border:'none', background:`linear-gradient(135deg, ${C.cyan} 0%, ${C.cyanDk} 100%)`, color:'#fff', fontSize:15, fontWeight:800, cursor:'pointer' }}>
                  Commencer →
                </button>
              </div>
            </div>
          )}

          {/* ═══ INFOS CANDIDAT ═══ */}
          {etape === 'infos' && (
            <div style={{ background:C.blanc, borderRadius:20, padding:'32px 36px', boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ fontSize:18, fontWeight:800, color:C.navy, marginBottom:20 }}>Avant de commencer</div>
              {[['fullname','Nom complet *','text'],['email','Email','email'],['phone','Téléphone','tel']].map(([k,l,t]) => (
                <div key={k} style={{ marginBottom:14 }}>
                  <label style={{ fontSize:12, fontWeight:700, color:C.gris600, display:'block', marginBottom:5 }}>{l}</label>
                  <input type={t} value={formData[k]} onChange={e=>setFD(f=>({...f,[k]:e.target.value}))}
                    style={{ width:'100%', padding:'11px 14px', borderRadius:9, border:`1.5px solid ${C.gris200}`, fontSize:14, boxSizing:'border-box', fontFamily:'"Plus Jakarta Sans", sans-serif' }} />
                </div>
              ))}
              <button onClick={commencerTest} style={{ width:'100%', marginTop:8, padding:'14px 0', borderRadius:12, border:'none', background:C.cyan, color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer' }}>
                Démarrer le test →
              </button>
            </div>
          )}

          {/* ═══ TEST : règles d'intégrité (une fois, avant la 1ère section) ═══ */}
          {etape === 'test' && quizPhase === 'rules' && (
            <IntegrityGate onContinue={() => { setQuizPhase('intro'); setIntroView('instructions'); }} />
          )}

          {/* ═══ TEST : instructions + exemple, avant chaque nouvelle catégorie ═══ */}
          {etape === 'test' && quizPhase === 'intro' && qActive && (
            <SectionIntro
              category={qActive.category}
              type={qActive.type}
              sectionIndex={sections.indexOf(qActive.category)}
              totalSections={sections.length}
              view={introView}
              onChangeView={setIntroView}
              onStart={() => setQuizPhase('live')}
            />
          )}

          {/* ═══ TEST : questions réelles ═══ */}
          {etape === 'test' && quizPhase === 'live' && qActive && (
            <div style={{ background:C.blanc, borderRadius:20, overflow:'hidden', boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ height:4, background:C.gris100 }}>
                <div style={{ height:'100%', width:`${((qActuelle+1)/Math.max(questions.length,1))*100}%`, background:`linear-gradient(90deg, ${C.cyan}, ${C.cyanDk})`, transition:'width .3s' }} />
              </div>
              <div style={{ padding:'28px 32px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:20 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:C.gris400, textTransform:'uppercase' }}>Question {qActuelle+1} / {questions.length}</span>
                  <span style={{ fontSize:11, padding:'2px 8px', borderRadius:8, background:C.gris100, color:C.gris600 }}>{qActive.category} · {qActive.cefr}</span>
                </div>

                {qActive.type === 'lecture_qcm' && qActive.passage && (
                  <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:10, padding:'14px 18px', marginBottom:16, fontSize:13, color:C.navy, lineHeight:1.7 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#1D4ED8', marginBottom:6 }}>📖 Passage</div>
                    {qActive.passage}
                  </div>
                )}
                {qActive.type === 'audio_qcm' && qActive.audio_url && (
                  <div style={{ background:C.gris50, borderRadius:10, padding:'14px 18px', marginBottom:16 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:C.gris600, marginBottom:8 }}>🎧 Écoutez avant de répondre</div>
                    <audio controls src={qActive.audio_url} style={{ width:'100%' }} />
                  </div>
                )}

                <div style={{ fontSize:16, fontWeight:700, color:C.navy, marginBottom:20, lineHeight:1.5, padding:'16px 20px', background:C.gris50, borderRadius:10, borderLeft:`4px solid ${C.cyan}` }}>
                  {qActive.text}
                </div>

                {/* QCM / Audio_qcm / Lecture_qcm */}
                {['qcm','audio_qcm','lecture_qcm'].includes(qActive.type) && (
                  <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:8 }}>
                    {(qActive.options||[]).filter(Boolean).map((opt,oi) => {
                      const sel = answers[qActive.id] === opt;
                      return (
                        <button key={oi} onClick={()=>repondre(qActive.id, opt)} style={{ padding:'13px 18px', borderRadius:10, border:`2px solid ${sel?C.cyan:C.gris200}`, background:sel?`${C.cyan}12`:C.blanc, color:sel?C.cyanDk:C.navy, textAlign:'left', cursor:'pointer', fontSize:14, fontWeight:sel?700:500, display:'flex', alignItems:'center', gap:10 }}>
                          <span style={{ width:26, height:26, borderRadius:'50%', border:`2px solid ${sel?C.cyan:'#cbd5e1'}`, background:sel?C.cyan:'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:12, color:sel?'#fff':C.gris400 }}>
                            {sel?'✓':String.fromCharCode(65+oi)}
                          </span>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Vrai/Faux */}
                {qActive.type === 'vrai_faux' && (
                  <div style={{ display:'flex', gap:12, marginBottom:8 }}>
                    {['Vrai','Faux'].map(opt => (
                      <button key={opt} onClick={()=>repondre(qActive.id, opt)} style={{ flex:1, padding:'12px 0', borderRadius:10, border:`2px solid ${answers[qActive.id]===opt?C.cyan:C.gris200}`, background:answers[qActive.id]===opt?`${C.cyan}12`:C.blanc, fontWeight:700, fontSize:14, cursor:'pointer', color:answers[qActive.id]===opt?C.cyanDk:C.navy }}>
                        {opt === 'Vrai' ? '✅ Vrai' : '❌ Faux'}
                      </button>
                    ))}
                  </div>
                )}

                {/* Texte à trous */}
                {qActive.type === 'texte_trous' && (
                  <input value={answers[qActive.id]||''} onChange={e=>repondre(qActive.id, e.target.value)} placeholder="Votre réponse…"
                    style={{ width:'100%', padding:'13px 16px', borderRadius:10, border:`1.5px solid ${C.gris200}`, fontSize:14, boxSizing:'border-box', marginBottom:8 }} />
                )}

                {/* Libre */}
                {qActive.type === 'libre' && (
                  <textarea value={answers[qActive.id]||''} onChange={e=>repondre(qActive.id, e.target.value)} placeholder="Votre réponse…" rows={5}
                    style={{ width:'100%', padding:'13px 16px', borderRadius:10, border:`1.5px solid ${C.gris200}`, fontSize:14, boxSizing:'border-box', marginBottom:8, resize:'vertical', fontFamily:'"Plus Jakarta Sans", sans-serif' }} />
                )}

                {/* Speaking */}
                {qActive.type === 'speaking' && (
                  <div style={{ border:`2px dashed ${enregistrement?'#DC2626':audioAnswers[qActive.id]?C.succes:C.gris200}`, borderRadius:14, padding:'22px 18px', textAlign:'center', background:enregistrement?'#FEF2F2':audioAnswers[qActive.id]?'#F0FDF4':C.gris50, marginBottom:8 }}>
                    {uploadingAudio ? (
                      <div style={{ fontSize:13, color:C.gris600 }}>⏳ Envoi de l'enregistrement…</div>
                    ) : !enregistrement && !audioAnswers[qActive.id] ? (
                      <>
                        <div style={{ fontSize:36, marginBottom:8 }}>🎤</div>
                        <button onClick={()=>demarrerEnregistrement(qActive.id)} style={{ padding:'11px 26px', borderRadius:10, border:'none', background:'#DC2626', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                          🔴 Démarrer l'enregistrement
                        </button>
                      </>
                    ) : enregistrement ? (
                      <>
                        <div style={{ fontSize:36, marginBottom:8 }}>🔴</div>
                        <button onClick={arreterEnregistrement} style={{ padding:'11px 26px', borderRadius:10, border:'none', background:C.navy, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                          ⏹ Arrêter
                        </button>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize:28, marginBottom:6 }}>✅</div>
                        <audio controls src={audioAnswers[qActive.id]} style={{ width:'100%', marginBottom:10 }} />
                        <button onClick={()=>{ setAudioAnswers(a=>{ const n={...a}; delete n[qActive.id]; return n; }); repondre(qActive.id, null); }} style={{ padding:'7px 16px', borderRadius:8, border:`1px solid ${C.gris200}`, background:C.blanc, color:C.gris600, fontSize:12, cursor:'pointer' }}>
                          🔄 Réenregistrer
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Pas de retour en arrière possible une fois répondu */}
                <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', marginTop:16 }}>
                  <button onClick={suivante} disabled={uploadingAudio} style={{ padding:'10px 22px', borderRadius:9, border:'none', background:qActuelle===questions.length-1?C.succes:C.cyan, color:'#fff', cursor:uploadingAudio?'not-allowed':'pointer', fontSize:13, fontWeight:700 }}>
                    {qActuelle===questions.length-1 ? '✅ Terminer' : 'Suivant →'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ RÉSULTAT ═══ */}
          {etape === 'resultat' && resultat && (
            <div style={{ background:C.blanc, borderRadius:20, overflow:'hidden', boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ background:`linear-gradient(135deg, ${C.succes} 0%, #059669 100%)`, padding:'32px 36px', textAlign:'center' }}>
                <div style={{ fontSize:56, marginBottom:12 }}>🎉</div>
                <div style={{ fontSize:24, fontWeight:800, color:'#fff' }}>Test terminé !</div>
              </div>
              <div style={{ padding:'32px 36px', textAlign:'center' }}>
                <div style={{ fontSize:13, color:C.gris400, marginBottom:8, textTransform:'uppercase' }}>Niveau {resultat.needsReview ? 'estimé' : ''}</div>
                <div style={{ display:'inline-block', padding:'10px 32px', borderRadius:14, background:`${NIV_COULEUR[resultat.level]||C.cyan}20`, border:`2px solid ${NIV_COULEUR[resultat.level]||C.cyan}`, fontSize:36, fontWeight:900, color:NIV_COULEUR[resultat.level]||C.cyan }}>
                  {resultat.level}
                </div>
                {resultat.needsReview && (
                  <div style={{ fontSize:12, color:C.gris400, marginTop:10 }}>Confirmation finale par votre agent BET après relecture/écoute.</div>
                )}
                <div style={{ background:C.gris50, borderRadius:12, padding:'16px 20px', marginTop:24, textAlign:'left' }}>
                  <div style={{ fontSize:13, color:C.navy, fontWeight:600, marginBottom:6 }}>📬 Et maintenant ?</div>
                  <div style={{ fontSize:13, color:C.gris600, lineHeight:1.7 }}>Votre agent BET a reçu vos résultats et vous contactera bientôt.</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div style={{ background:'rgba(0,0,0,0.2)', padding:'14px 32px', textAlign:'center', fontSize:11, color:'rgba(255,255,255,0.35)', flexShrink:0 }}>
        © 2026 BET - Plateforme E-Learning · Abidjan, Côte d'Ivoire
      </div>
    </div>
  );
}
