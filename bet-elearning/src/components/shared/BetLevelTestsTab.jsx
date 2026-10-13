// src/components/shared/BetLevelTestsTab.jsx
// Bibliothèque de tests de niveau multi-format + résultats/correction -
// réplique de dash/src/Components/TestsNiveauTab.jsx sur les tables
// bet_level_tests/bet_level_questions/bet_level_test_results. Réservé au
// rôle admin_placement (module de permission "examens").
import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useAuth } from '../../contexts/AuthContext';

const _API = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const authHdrs = () => ({ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('admin_token')||''}`, 'X-Plateforme': 'bet-elearning' });

const CEFR_LEVELS = ['A1','A2','B1','B2','C1','C2'];
const CEFR_META = {
  A1:{label:'Débutant',color:'#6b7280',bg:'#f3f4f6',border:'#d1d5db'}, A2:{label:'Élémentaire',color:'#d97706',bg:'#fef3c7',border:'#fcd34d'},
  B1:{label:'Intermédiaire',color:'#2563eb',bg:'#dbeafe',border:'#93c5fd'}, B2:{label:'Interm. supérieur',color:'#7c3aed',bg:'#ede9fe',border:'#c4b5fd'},
  C1:{label:'Avancé',color:'#059669',bg:'#d1fae5',border:'#6ee7b7'}, C2:{label:'Maîtrise',color:'#dc2626',bg:'#fee2e2',border:'#fca5a5'},
};
const CATEGORIES = ['Grammaire','Vocabulaire','Compréhension','Listening','Reading','Speaking','Orthographe','Expression'];
const TEST_TYPES = [
  { value:'qcm', label:'QCM Général', icon:'🎯' }, { value:'listening', label:'Listening', icon:'🎧' },
  { value:'reading', label:'Reading', icon:'📖' }, { value:'mixed', label:'Test mixte', icon:'🔀' },
  { value:'speaking', label:'Speaking/Writing', icon:'🗣️' },
];
const Q_TYPES = [
  { value:'qcm', label:'QCM', icon:'🎯' }, { value:'vrai_faux', label:'Vrai / Faux', icon:'✅' },
  { value:'texte_trous', label:'Texte à trous', icon:'✏️' }, { value:'audio_qcm', label:'Audio + QCM', icon:'🎧' },
  { value:'lecture_qcm', label:'Lecture + QCM', icon:'📖' }, { value:'libre', label:'Question ouverte', icon:'💬' },
  { value:'speaking', label:'Speaking', icon:'🎙️' },
];
const DEFAULT_PARAMS = { timerEnabled:true, timerPerQ:60, shuffleQ:false, maxQuestions:10, passingPct:50 };

const permBtnStyle = (style, allowed) => allowed ? style : { ...style, opacity:0.45, cursor:'not-allowed', filter:'grayscale(70%)' };
const permBtnTitle = (label, allowed) => allowed ? label : "🔒 Vous n'avez pas la permission pour cette action";

const CefrBadge = ({ cefr }) => { const m = CEFR_META[cefr]||CEFR_META.A1; return <span style={{ padding:'3px 9px', borderRadius:20, fontSize:11, fontWeight:800, background:m.bg, color:m.color, border:`1px solid ${m.border}` }}>{cefr}</span>; };

const Overlay = ({ onClose, children, xl }) => (
  <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.6)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:2000 }} onClick={onClose}>
    <div style={{ background:'#fff', borderRadius:14, padding:24, width:xl?'90vw':560, maxWidth:'94vw', maxHeight:'90vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
      {children}
    </div>
  </div>
);
const OverlayHeader = ({ title, sub, onClose }) => (
  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
    <div><h3 style={{ margin:0, fontSize:17, fontWeight:800 }}>{title}</h3>{sub && <p style={{ margin:'3px 0 0', fontSize:12, color:'#9ca3af' }}>{sub}</p>}</div>
    <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#9ca3af' }}>✕</button>
  </div>
);

const btnPrimary = { padding:'9px 16px', background:'#0891b2', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontWeight:600, fontSize:12 };
const btnSecondary = { padding:'9px 16px', background:'#e5e7eb', color:'#374151', border:'none', borderRadius:6, cursor:'pointer', fontWeight:600, fontSize:12 };
const btnIconEdit = { padding:'5px 9px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:6, cursor:'pointer', fontSize:13 };
const btnIconDelete = { padding:'5px 9px', background:'#fff1f2', border:'1px solid #fecdd3', borderRadius:6, cursor:'pointer', fontSize:13 };
const inputSt = { padding:9, marginBottom:10, width:'100%', borderRadius:6, border:'1px solid #d1d5db', boxSizing:'border-box', fontSize:13 };
const labelSt = { display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 };
const th = { padding:'10px 12px', textAlign:'left', fontSize:12, color:'#6b7280', background:'#f9fafb', fontWeight:600 };
const td = { padding:'10px 12px', fontSize:13, verticalAlign:'middle' };

function defaultQForm(type) {
  return { type, text:'', audio_url:'', image_url:'', passage:'', options:['','','',''], correct:'', category:'Grammaire', cefr:'A1', points:1, explanation:'', actif:true };
}

/**
 * `vueInitiale` et `filtreInitial` ouvrent ce composant directement sur une de ses sous-vues.
 *
 * POURQUOI. « Résultats candidats » et le filtre « À corriger » existaient déjà ici, mais
 * enfouis à deux clics sous l'onglet « Tests de niveau » : l'agent Placement devait ouvrir les
 * tests pour atteindre la file de correction, qui est pourtant son travail quotidien. dash en
 * fait deux onglets de premier niveau.
 *
 * Les promouvoir par des props plutôt que par deux nouveaux composants évite de dupliquer les
 * 554 lignes de cet écran — et surtout évite que la correction d'un bug ne soit faite que d'un
 * côté. Les sous-onglets internes restent affichés : on peut toujours passer de la file à la
 * bibliothèque sans repasser par le menu.
 */
export default function BetLevelTestsTab({ peut: peutProp, vueInitiale = 'tests', filtreInitial = 'Tous', sansBibliotheque = false }) {
  const confirm = useConfirm();
  const { profile } = useAuth();
  /* ── LE DÉFAUT ÉTAIT `() => true` : TOUT PERMIS ──
     Chaque bouton de cet écran teste `peut('examens', …)`, mais AUCUN des trois écrans
     qui montent ce composant ne passait la prop. Le défaut s'appliquait donc partout :
     l'assistante e-learning voyait « ✏️ Modifier » et « 🗑 » actifs sur la banque de
     tests, et ne découvrait son absence de droit qu'au refus du serveur — ce qui se lit
     comme une panne, pas comme une règle.
     On lit maintenant les permissions du compte connecté, celles-là mêmes que
     `requirePermission` applique côté serveur. La prop reste acceptée pour qu'un
     appelant puisse restreindre davantage ; elle ne peut plus élargir par omission. */
  const peut = peutProp || ((module, action) => {
    const CLE = { read: 'read', create: 'create', update: 'update', delete: 'delete' };
    const p = profile?.permissions?.[module];
    if (!p) return false;
    return p[CLE[action] || action] === true || p.manage === true;
  });
  const [view, setView] = useState('tests');
  /* Si la bibliothèque est retirée, on force la vue des résultats : un `vueInitiale`
     resté sur « tests » afficherait un onglet qu'on vient précisément d'enlever. */
  const [activeMain, setActiveMain] = useState(sansBibliotheque ? 'resultats' : vueInitiale);

  const [tests, setTests] = useState([]);
  const [loadingTests, setLT] = useState(true);
  const [activeTestId, setATID] = useState(null);
  const [showTestModal, setSTM] = useState(false);
  const [editingTest, setET] = useState(null);
  const [testForm, setTF] = useState({ titre:'', description:'', type:'qcm', programme_le:'', programme_jusqu_au:'', params:DEFAULT_PARAMS });

  const [questions, setQs] = useState([]);
  const [loadingQs, setLQ] = useState(false);
  const [showQModal, setQM] = useState(false);
  const [editingQ, setEQ] = useState(null);
  const [qForm, setQF] = useState(defaultQForm('qcm'));

  const [resultats, setRes] = useState([]);
  const [loadingRes, setLR] = useState(true);
  const [selectedRes, setSelR] = useState(null);
  const [filtreCorrection, setFiltreCorrection] = useState(filtreInitial);
  const [correctionForm, setCF] = useState({ level:'A1', score:0, notes_agent:'' });
  const [saving, setSaving] = useState(false);

  const fetchTests = useCallback(async () => {
    try {
      setLT(true);
      const r = await fetch(`${_API}/api/bet-elearning/level-tests`, { headers: authHdrs() });
      if (!r.ok) throw new Error();
      const { tests: list } = await r.json();
      setTests(list || []);
    } catch { toast.error('Impossible de charger les tests'); }
    finally { setLT(false); }
  }, []);

  const fetchQuestions = useCallback(async (testId) => {
    if (!testId) return;
    setLQ(true);
    try {
      const r = await fetch(`${_API}/api/bet-elearning/level-tests/${testId}/questions`, { headers: authHdrs() });
      const { questions: list } = await r.json();
      setQs(list || []);
    } catch { toast.error('Impossible de charger les questions'); }
    finally { setLQ(false); }
  }, []);

  const fetchResultats = useCallback(async () => {
    setLR(true);
    try {
      const r = await fetch(`${_API}/api/bet-elearning/level-test/all`, { headers: authHdrs() });
      const { results } = await r.json();
      setRes(results || []);
    } catch { /* silencieux */ }
    finally { setLR(false); }
  }, []);

  useEffect(() => { fetchTests(); fetchResultats(); }, [fetchTests, fetchResultats]);

  const openTestEditor = async (t) => { setATID(t.id); setView('editTest'); await fetchQuestions(t.id); };

  const openTestModal = (t=null) => {
    setET(t);
    setTF(t ? { titre:t.titre, description:t.description||'', type:t.type||'qcm',
      programme_le: t.programme_le ? t.programme_le.slice(0,16) : '', programme_jusqu_au: t.programme_jusqu_au ? t.programme_jusqu_au.slice(0,16) : '',
      params: t.params || DEFAULT_PARAMS,
    } : { titre:'', description:'', type:'qcm', programme_le:'', programme_jusqu_au:'', params:DEFAULT_PARAMS });
    setSTM(true);
  };

  const saveTest = async () => {
    if (!testForm.titre.trim()) { toast.error('Le titre est requis'); return; }
    const body = { titre:testForm.titre.trim(), description:testForm.description, type:testForm.type, params:testForm.params,
      programme_le: testForm.programme_le||null, programme_jusqu_au: testForm.programme_jusqu_au||null };
    try {
      const url = editingTest ? `${_API}/api/bet-elearning/level-tests/${editingTest.id}` : `${_API}/api/bet-elearning/level-tests`;
      const r = await fetch(url, { method: editingTest?'PATCH':'POST', headers: authHdrs(), body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error); return; }
      toast.success(editingTest ? 'Test modifié ✓' : 'Test créé ✓');
      setSTM(false); fetchTests();
    } catch { toast.error('Erreur réseau'); }
  };

  const activerTest = async (id) => {
    const r = await fetch(`${_API}/api/bet-elearning/level-tests/${id}/activer`, { method:'PATCH', headers: authHdrs() });
    if (r.ok) { toast.success('Test activé ✓'); fetchTests(); } else toast.error('Erreur');
  };
  const desactiverTest = async (id) => {
    const r = await fetch(`${_API}/api/bet-elearning/level-tests/${id}/desactiver`, { method:'PATCH', headers: authHdrs() });
    if (r.ok) { toast.success('Test retiré'); fetchTests(); }
  };
  const dupliquerTest = async (id) => {
    const r = await fetch(`${_API}/api/bet-elearning/level-tests/${id}/dupliquer`, { method:'POST', headers: authHdrs() });
    if (r.ok) { toast.success('Test dupliqué ✓'); fetchTests(); } else toast.error('Erreur');
  };
  const supprimerTest = async (id) => {
    if (!(await confirm('Supprimer ce test et toutes ses questions ?', { titre:'Supprimer le test' }))) return;
    const r = await fetch(`${_API}/api/bet-elearning/level-tests/${id}`, { method:'DELETE', headers: authHdrs() });
    if (r.ok) { toast.success('Test supprimé'); fetchTests(); }
  };

  const openQModal = (q=null) => {
    const currentTest = tests.find(t => t.id === activeTestId);
    const defaultType = currentTest?.type === 'listening' ? 'audio_qcm' : currentTest?.type === 'reading' ? 'lecture_qcm' : currentTest?.type === 'speaking' ? 'speaking' : 'qcm';
    setEQ(q); setQF(q ? { ...q, options: q.options || ['','','',''] } : defaultQForm(defaultType)); setQM(true);
  };

  const saveQuestion = async () => {
    const { type, text, audio_url, passage, options, correct } = qForm;
    if (!text.trim() && !audio_url.trim() && !passage.trim()) { toast.error('Contenu de la question requis'); return; }
    if (['qcm','audio_qcm','lecture_qcm'].includes(type)) {
      if (options.some(o => !o.trim())) { toast.error('Remplissez toutes les options'); return; }
      if (!correct || !options.includes(correct)) { toast.error('Sélectionnez la bonne réponse'); return; }
    }
    if (type === 'vrai_faux' && !correct) { toast.error('Sélectionnez Vrai ou Faux'); return; }
    try {
      const url = editingQ ? `${_API}/api/bet-elearning/level-tests/${activeTestId}/questions/${editingQ.id}` : `${_API}/api/bet-elearning/level-tests/${activeTestId}/questions`;
      const r = await fetch(url, { method: editingQ?'PATCH':'POST', headers: authHdrs(), body: JSON.stringify(qForm) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error); return; }
      toast.success(editingQ ? 'Question modifiée ✓' : 'Question ajoutée ✓');
      setQM(false); fetchQuestions(activeTestId);
    } catch { toast.error('Erreur réseau'); }
  };

  const toggleQ = async (q) => {
    await fetch(`${_API}/api/bet-elearning/level-tests/${activeTestId}/questions/${q.id}`, { method:'PATCH', headers: authHdrs(), body: JSON.stringify({ actif: !q.actif }) });
    fetchQuestions(activeTestId);
  };
  const deleteQ = async (q) => {
    if (!(await confirm('Supprimer cette question ?', { titre:'Supprimer la question' }))) return;
    await fetch(`${_API}/api/bet-elearning/level-tests/${activeTestId}/questions/${q.id}`, { method:'DELETE', headers: authHdrs() });
    toast.success('Question supprimée'); fetchQuestions(activeTestId);
  };

  const activeTest = tests.find(t => t.id === activeTestId);
  const activeCount = tests.filter(t => t.actif).length;

  const filteredRes = useMemo(() => filtreCorrection==='Tous' ? resultats : resultats.filter(r => r.correction_statut === filtreCorrection), [resultats, filtreCorrection]);

  const openCorrection = (r) => { setSelR(r); setCF({ level: r.level && r.level!=='En attente' ? r.level : 'A1', score: r.score||0, notes_agent: r.notes_agent||'' }); };

  const enregistrerCorrection = async () => {
    if (!selectedRes || saving) return;
    setSaving(true);
    try {
      const r = await fetch(`${_API}/api/bet-elearning/level-test/${selectedRes.id}/corriger`, { method:'PATCH', headers: authHdrs(), body: JSON.stringify(correctionForm) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error||'Erreur'); return; }
      toast.success(`Niveau ${correctionForm.level} enregistré ✓`);
      setSelR(null); fetchResultats();
    } catch { toast.error('Erreur réseau'); }
    finally { setSaving(false); }
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' }) : '-';

  /* ══ VUE ÉDITEUR D'UN TEST ══ */
  if (view === 'editTest' && activeTest) {
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <button onClick={()=>{ setView('tests'); setATID(null); setQs([]); }} style={{ ...btnSecondary, display:'flex', alignItems:'center', gap:6 }}>← Retour aux tests</button>
          <div style={{ flex:1 }}>
            <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:'#0f172a' }}>{activeTest.titre}</h2>
            <p style={{ margin:'3px 0 0', fontSize:12, color:'#9ca3af' }}>{questions.length} questions</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button disabled={!peut('examens','update')} title={permBtnTitle('Modifier',peut('examens','update'))} onClick={()=>openTestModal(activeTest)} style={permBtnStyle(btnSecondary,peut('examens','update'))}>✏️ Modifier</button>
            {activeTest.actif
              ? <button disabled={!peut('examens','update')} title={permBtnTitle('Retirer',peut('examens','update'))} onClick={()=>desactiverTest(activeTest.id)} style={permBtnStyle({ ...btnSecondary, color:'#ef4444' },peut('examens','update'))}>⏸ Retirer</button>
              : <button disabled={!peut('examens','update')} title={permBtnTitle('Publier',peut('examens','update'))} onClick={()=>activerTest(activeTest.id)} style={permBtnStyle(btnPrimary,peut('examens','update'))}>🟢 Publier</button>}
            <button disabled={!peut('examens','create')} title={permBtnTitle('Nouvelle question',peut('examens','create'))} onClick={()=>openQModal()} style={permBtnStyle({ ...btnPrimary, background:'#059669' },peut('examens','create'))}>+ Nouvelle question</button>
          </div>
        </div>

        {loadingQs ? <div style={{ textAlign:'center', padding:'40px 0', color:'#9ca3af' }}>Chargement…</div>
        : questions.length === 0 ? (
          <div style={{ textAlign:'center', padding:'50px 0' }}>
            <div style={{ fontSize:42, marginBottom:12 }}>🧪</div>
            <p style={{ color:'#9ca3af', marginBottom:16 }}>Aucune question pour ce test</p>
            <button disabled={!peut('examens','create')} title={permBtnTitle('Ajouter la première question',peut('examens','create'))} onClick={()=>openQModal()} style={permBtnStyle(btnPrimary,peut('examens','create'))}>+ Ajouter la première question</button>
          </div>
        ) : (
          <div style={{ background:'#fff', borderRadius:12, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}><thead><tr>
              <th style={th}>#</th><th style={th}>Type</th><th style={th}>Question</th><th style={th}>Catégorie</th><th style={th}>Niveau</th><th style={th}>Pts</th><th style={th}>Statut</th><th style={th}>Actions</th>
            </tr></thead><tbody>
              {questions.map((q, idx) => {
                const qt = Q_TYPES.find(t => t.value === q.type) || Q_TYPES[0];
                return (
                  <tr key={q.id} style={{ borderTop:'1px solid #f1f5f9' }}>
                    <td style={{ ...td, color:'#9ca3af', width:36 }}>{idx+1}</td>
                    <td style={{ ...td, width:110 }}>{qt.icon} {qt.label}</td>
                    <td style={td}>{q.text || '-'}</td>
                    <td style={td}>{q.category}</td>
                    <td style={td}><CefrBadge cefr={q.cefr} /></td>
                    <td style={{ ...td, fontWeight:800, color:'#f59e0b' }}>{q.points}pt</td>
                    <td style={td}><span style={{ padding:'3px 10px', borderRadius:14, fontSize:11, fontWeight:700, background:q.actif?'#dcfce7':'#fee2e2', color:q.actif?'#166534':'#991b1b' }}>{q.actif?'Actif':'Inactif'}</span></td>
                    <td style={td}>
                      <div style={{ display:'flex', gap:5 }}>
                        <button disabled={!peut('examens','update')} onClick={()=>openQModal(q)} style={permBtnStyle(btnIconEdit,peut('examens','update'))} title={permBtnTitle('Modifier',peut('examens','update'))}>✏️</button>
                        <button disabled={!peut('examens','update')} onClick={()=>toggleQ(q)} style={permBtnStyle(btnIconEdit,peut('examens','update'))} title={permBtnTitle(q.actif?'Désactiver':'Activer',peut('examens','update'))}>{q.actif?'🔴':'🟢'}</button>
                        <button disabled={!peut('examens','delete')} onClick={()=>deleteQ(q)} style={permBtnStyle(btnIconDelete,peut('examens','delete'))} title={permBtnTitle('Supprimer',peut('examens','delete'))}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody></table>
          </div>
        )}

        {showQModal && <QuestionModal qForm={qForm} setQF={setQF} editingQ={editingQ} onSave={saveQuestion} onClose={()=>setQM(false)} peut={peut} />}
        {showTestModal && <TestModal testForm={testForm} setTF={setTF} editingTest={editingTest} onSave={saveTest} onClose={()=>setSTM(false)} peut={peut} />}
      </div>
    );
  }

  /* ══ VUE PRINCIPALE ══
     `sansBibliotheque` retire l'onglet « Bibliothèque de tests » — la banque de questions.
     Pour l'assistante e-learning, cet onglet n'avait aucune raison d'être affiché : elle
     consulte les résultats de ses candidats, elle ne construit pas les tests. Le montrer
     en lecture seule aurait quand même donné à voir tout le contenu des épreuves, ce qui
     n'est pas plus souhaitable que de pouvoir les modifier. */
  const mainTabs = [
    ...(sansBibliotheque ? [] : [{ key:'tests', label:'Bibliothèque de tests', icon:'📚', count:tests.length }]),
    { key:'resultats', label:'Résultats candidats', icon:'📋', count:resultats.length },
  ];

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:'#0f172a' }}>🧪 Tests de Niveau</h2>
          <p style={{ margin:'4px 0 0', color:'#6b7280', fontSize:13 }}>{tests.length} test(s) créé(s) · {activeCount} actif(s) · {resultats.length} résultats</p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={()=>{ fetchTests(); fetchResultats(); }} style={btnSecondary}>🔄 Actualiser</button>
          <button disabled={!peut('examens','create')} title={permBtnTitle('Nouveau test',peut('examens','create'))} onClick={()=>openTestModal()} style={permBtnStyle(btnPrimary,peut('examens','create'))}>+ Nouveau test</button>
        </div>
      </div>

      <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
        {mainTabs.map(tab => {
          const active = activeMain === tab.key;
          return (
            <button key={tab.key} onClick={()=>setActiveMain(tab.key)} style={{ padding:'9px 16px', borderRadius:'8px 8px 0 0', border:'none', cursor:'pointer', fontWeight:600, fontSize:13, background:active?'#fff':'#e5e7eb', color:active?'#0891b2':'#6b7280', display:'flex', alignItems:'center', gap:6 }}>
              {tab.icon} {tab.label} <span style={{ padding:'1px 7px', borderRadius:10, fontSize:11, fontWeight:700, background:active?'#e0f2fe':'#d1d5db', color:active?'#0891b2':'#4b5563' }}>{tab.count}</span>
            </button>
          );
        })}
      </div>

      <div style={{ background:'#fff', borderRadius:'0 12px 12px 12px', padding:22, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>

        {activeMain === 'tests' && (
          loadingTests ? <div style={{ textAlign:'center', padding:'50px 0', color:'#9ca3af' }}>Chargement…</div>
          : tests.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 0' }}>
              <div style={{ fontSize:50, marginBottom:14 }}>📭</div>
              <p style={{ color:'#9ca3af', fontSize:15, marginBottom:20 }}>Aucun test créé pour l'instant</p>
              <button disabled={!peut('examens','create')} onClick={()=>openTestModal()} style={permBtnStyle(btnPrimary,peut('examens','create'))}>+ Créer le premier test</button>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:16 }}>
              {tests.map(t => {
                const meta = TEST_TYPES.find(tt => tt.value === t.type) || TEST_TYPES[0];
                const qCount = t.bet_level_questions?.[0]?.count || 0;
                return (
                  <div key={t.id} style={{ borderRadius:14, border:`2px solid ${t.actif?'#86efac':'#e5e7eb'}`, background:t.actif?'#f0fdf4':'#fff', padding:18, position:'relative' }}>
                    {t.actif && <div style={{ position:'absolute', top:12, right:12, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:'#22c55e', color:'#fff' }}>🟢 ACTIF</div>}
                    <div style={{ display:'flex', gap:12, marginBottom:12 }}>
                      <div style={{ width:46, height:46, borderRadius:12, background:'#e0f2fe', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>{meta.icon}</div>
                      <div><h3 style={{ margin:0, fontSize:15, fontWeight:800, color:'#0f172a' }}>{t.titre}</h3><div style={{ fontSize:12, color:'#9ca3af' }}>{meta.label} · {qCount} question(s)</div></div>
                    </div>
                    {t.description && <p style={{ fontSize:12, color:'#6b7280', marginBottom:12 }}>{t.description}</p>}
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <button onClick={()=>openTestEditor(t)} style={{ ...btnPrimary, padding:'7px 14px', fontSize:12, flex:1 }}>✏️ Gérer les questions</button>
                      {t.actif
                        ? <button disabled={!peut('examens','update')} onClick={()=>desactiverTest(t.id)} style={permBtnStyle({ ...btnSecondary, padding:'7px 14px', fontSize:12, color:'#dc2626' },peut('examens','update'))}>⏸</button>
                        : <button disabled={!peut('examens','update')} onClick={()=>activerTest(t.id)} style={permBtnStyle({ ...btnSecondary, padding:'7px 14px', fontSize:12, color:'#16a34a' },peut('examens','update'))}>🟢</button>}
                      <button disabled={!peut('examens','update')} onClick={()=>openTestModal(t)} style={permBtnStyle({ ...btnIconEdit, padding:'7px 10px' },peut('examens','update'))} title="Modifier">✏️</button>
                      <button disabled={!peut('examens','create')} onClick={()=>dupliquerTest(t.id)} style={permBtnStyle({ ...btnIconEdit, padding:'7px 10px' },peut('examens','create'))} title="Dupliquer">📋</button>
                      <button disabled={!peut('examens','delete')} onClick={()=>supprimerTest(t.id)} style={permBtnStyle({ ...btnIconDelete, padding:'7px 10px' },peut('examens','delete'))} title="Supprimer">🗑️</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {activeMain === 'resultats' && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
              <h3 style={{ margin:0, fontSize:16, fontWeight:700 }}>Résultats des candidats</h3>
              <div style={{ display:'flex', gap:6 }}>
                {['Tous','en_attente','auto','corrige'].map(f => (
                  <button key={f} onClick={()=>setFiltreCorrection(f)} style={{ padding:'6px 12px', borderRadius:8, fontSize:11, fontWeight:700, border:`1.5px solid ${filtreCorrection===f?'#0891b2':'#e2e8f0'}`, background:filtreCorrection===f?'#e0f2fe':'#fff', color:filtreCorrection===f?'#0891b2':'#64748b', cursor:'pointer' }}>
                    {f==='Tous'?'Tous':f==='en_attente'?'⏳ À corriger':f==='auto'?'Auto':'✅ Corrigés'}
                  </button>
                ))}
              </div>
            </div>
            {loadingRes ? <div style={{ textAlign:'center', padding:'40px 0', color:'#9ca3af' }}>Chargement…</div>
            : filteredRes.length === 0 ? <div style={{ textAlign:'center', padding:'40px 0', color:'#9ca3af' }}>Aucun résultat</div>
            : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}><thead><tr>
                  <th style={th}>Candidat</th><th style={th}>Format</th><th style={th}>Niveau</th><th style={th}>Score</th><th style={th}>Date</th><th style={th}>Statut</th><th style={th}>Action</th>
                </tr></thead><tbody>
                  {filteredRes.map(r => (
                    <tr key={r.id} style={{ borderTop:'1px solid #f1f5f9' }}>
                      <td style={td}><div style={{ fontWeight:600 }}>{r.fullname||'-'}</div><div style={{ fontSize:11, color:'#94a3b8' }}>{r.email||''}</div></td>
                      <td style={td}>{r.format_test}</td>
                      <td style={td}><CefrBadge cefr={r.level==='En attente'?'A1':r.level} />{r.level==='En attente' && <span style={{ marginLeft:6, fontSize:11, color:'#d97706' }}>En attente</span>}</td>
                      <td style={td}>{r.correct_answers}/{r.total_questions} ({r.score}%)</td>
                      <td style={{ ...td, fontSize:12, color:'#6b7280' }}>{fmtDate(r.submitted_at)}</td>
                      <td style={td}>
                        <span style={{ padding:'3px 10px', borderRadius:14, fontSize:11, fontWeight:700, background:r.correction_statut==='en_attente'?'#fef3c7':r.correction_statut==='corrige'?'#dcfce7':'#e0f2fe', color:r.correction_statut==='en_attente'?'#92400e':r.correction_statut==='corrige'?'#166534':'#0369a1' }}>
                          {r.correction_statut==='en_attente'?'⏳ À corriger':r.correction_statut==='corrige'?'✅ Corrigé':'Auto'}
                        </span>
                      </td>
                      <td style={td}><button onClick={()=>openCorrection(r)} style={{ ...btnIconEdit, padding:'6px 12px' }}>{r.correction_statut==='en_attente'?'✏️ Corriger':'🔍 Détail'}</button></td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedRes && (
        <Overlay onClose={()=>setSelR(null)}>
          <OverlayHeader title={`Résultat - ${selectedRes.fullname||'Candidat'}`} sub={`${selectedRes.format_test} · ${fmtDate(selectedRes.submitted_at)}`} onClose={()=>setSelR(null)} />
          <div style={{ display:'flex', gap:12, marginBottom:16 }}>
            <div style={{ flex:1, background:'#f0f9ff', borderRadius:10, padding:'14px 18px', textAlign:'center' }}>
              <div style={{ fontSize:11, color:'#64748b' }}>Score</div>
              <div style={{ fontSize:32, fontWeight:900, color:'#0891b2' }}>{selectedRes.score}%</div>
              <div style={{ fontSize:11, color:'#94a3b8' }}>{selectedRes.correct_answers}/{selectedRes.total_questions} bonnes réponses</div>
            </div>
            <div style={{ flex:1, background:'#f0f9ff', borderRadius:10, padding:'14px 18px', textAlign:'center' }}>
              <div style={{ fontSize:11, color:'#64748b' }}>Niveau {selectedRes.correction_statut!=='en_attente'?'attribué':selectedRes.level&&selectedRes.level!=='En attente'?'(auto - à valider)':'(à définir)'}</div>
              <div style={{ fontSize:32, fontWeight:900, color:'#0891b2' }}>{selectedRes.level||'-'}</div>
            </div>
          </div>

          {selectedRes.audio_answers && Object.keys(selectedRes.audio_answers).length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:8 }}>🎙️ Réponses vocales</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {Object.entries(selectedRes.audio_answers).map(([qId,url]) => url && (
                  <div key={qId} style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:10, padding:'10px 14px' }}>
                    <audio controls src={url} style={{ width:'100%' }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedRes.correction_statut === 'en_attente' ? (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label style={labelSt}>Niveau CECR à attribuer *</label>
                <select value={correctionForm.level} onChange={e=>setCF(f=>({...f,level:e.target.value}))} style={inputSt}>
                  {CEFR_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Score (%)</label>
                <input type="number" min={0} max={100} value={correctionForm.score} onChange={e=>setCF(f=>({...f,score:e.target.value}))} style={inputSt} />
              </div>
              <div style={{ gridColumn:'1 / -1' }}>
                <label style={labelSt}>Notes de l'agent</label>
                <textarea value={correctionForm.notes_agent} onChange={e=>setCF(f=>({...f,notes_agent:e.target.value}))} rows={3} style={{ ...inputSt, resize:'vertical' }} />
              </div>
              <div style={{ gridColumn:'1 / -1', display:'flex', gap:10 }}>
                <button disabled={!peut('examens','update')||saving} title={permBtnTitle('Enregistrer le niveau',peut('examens','update'))} onClick={enregistrerCorrection} style={permBtnStyle(btnPrimary,peut('examens','update'))}>{saving?'Enregistrement…':'✅ Enregistrer le niveau'}</button>
                <button onClick={()=>setSelR(null)} style={btnSecondary}>Fermer</button>
              </div>
            </div>
          ) : (
            <>
              {selectedRes.notes_agent && <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#92400e', marginBottom:12 }}>💬 {selectedRes.notes_agent}</div>}
              <button onClick={()=>setSelR(null)} style={btnSecondary}>Fermer</button>
            </>
          )}
        </Overlay>
      )}
    </div>
  );
}

function TestModal({ testForm, setTF, editingTest, onSave, onClose, peut }) {
  const p = testForm.params || {};
  const setP = (u) => setTF(f => ({ ...f, params: { ...f.params, ...u } }));
  const canSave = peut('examens', editingTest ? 'update' : 'create');
  return (
    <Overlay onClose={onClose}>
      <OverlayHeader title={editingTest?'Modifier le test':'Nouveau test de niveau'} onClose={onClose} />
      <label style={labelSt}>Titre *</label>
      <input value={testForm.titre} onChange={e=>setTF(f=>({...f,titre:e.target.value}))} style={inputSt} />
      <label style={labelSt}>Description</label>
      <textarea value={testForm.description} onChange={e=>setTF(f=>({...f,description:e.target.value}))} rows={2} style={{ ...inputSt, resize:'vertical' }} />
      <label style={labelSt}>Format</label>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:16 }}>
        {TEST_TYPES.map(t => (
          <div key={t.value} onClick={()=>setTF(f=>({...f,type:t.value}))} style={{ padding:'10px', borderRadius:10, border:`2px solid ${testForm.type===t.value?'#0891b2':'#e5e7eb'}`, background:testForm.type===t.value?'#e0f2fe':'#fff', cursor:'pointer', textAlign:'center' }}>
            <div style={{ fontSize:18 }}>{t.icon}</div><div style={{ fontSize:12, fontWeight:700 }}>{t.label}</div>
          </div>
        ))}
      </div>
      <div style={{ background:'#f8fafc', borderRadius:10, padding:16, marginBottom:16 }}>
        <label style={{ ...labelSt, display:'flex', justifyContent:'space-between' }}>
          <span>Chronomètre par question</span>
          <input type="checkbox" checked={p.timerEnabled} onChange={e=>setP({timerEnabled:e.target.checked})} />
        </label>
        {p.timerEnabled && (
          <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:8 }}>
            <input type="range" min={15} max={180} step={15} value={p.timerPerQ||60} onChange={e=>setP({timerPerQ:Number(e.target.value)})} style={{ flex:1 }} />
            <span style={{ fontWeight:800, minWidth:40 }}>{p.timerPerQ||60}s</span>
          </div>
        )}
      </div>
      <div style={{ display:'flex', gap:10 }}>
        <button disabled={!canSave} title={permBtnTitle(editingTest?'Enregistrer':'Créer le test',canSave)} onClick={onSave} style={permBtnStyle(btnPrimary,canSave)}>{editingTest?'Enregistrer les modifications':'Créer le test'}</button>
        <button onClick={onClose} style={btnSecondary}>Annuler</button>
      </div>
    </Overlay>
  );
}

function QuestionModal({ qForm, setQF, editingQ, onSave, onClose, peut }) {
  const qt = qForm.type;
  const showOptions = ['qcm','audio_qcm','lecture_qcm','vrai_faux'].includes(qt);
  const isVraiFaux = qt === 'vrai_faux';
  const canSave = peut('examens', editingQ ? 'update' : 'create');
  return (
    <Overlay onClose={onClose} xl>
      <OverlayHeader title={editingQ?'Modifier la question':'Nouvelle question'} onClose={onClose} />
      <label style={labelSt}>Type de question</label>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 }}>
        {Q_TYPES.map(t => (
          <div key={t.value} onClick={()=>setQF(f=>({...f,type:t.value,options:t.value==='vrai_faux'?['Vrai','Faux']:['','','',''],correct:''}))} style={{ padding:'8px', borderRadius:10, border:`2px solid ${qt===t.value?'#0891b2':'#e5e7eb'}`, background:qt===t.value?'#e0f2fe':'#fff', cursor:'pointer', textAlign:'center' }}>
            <div style={{ fontSize:16 }}>{t.icon}</div><div style={{ fontSize:11, fontWeight:700 }}>{t.label}</div>
          </div>
        ))}
      </div>
      {qt === 'lecture_qcm' && (<><label style={labelSt}>📖 Passage</label><textarea value={qForm.passage||''} onChange={e=>setQF(f=>({...f,passage:e.target.value}))} rows={4} style={{ ...inputSt, resize:'vertical' }} /></>)}
      {(qt === 'audio_qcm' || qt === 'speaking') && (
        <>
          <label style={labelSt}>🎧 URL audio {qt==='speaking' ? '(stimulus, optionnel)' : ''}</label>
          <input type="url" value={qForm.audio_url||''} onChange={e=>setQF(f=>({...f,audio_url:e.target.value}))} placeholder="https://…" style={inputSt} />
          {qForm.audio_url && <audio controls src={qForm.audio_url} style={{ width:'100%', marginBottom:10 }} />}
        </>
      )}
      <label style={labelSt}>{qt==='texte_trous'?'Phrase à compléter (utilisez _____ )':qt==='libre'?'Consigne':qt==='speaking'?'Consigne orale':'Question *'}</label>
      <textarea value={qForm.text} onChange={e=>setQF(f=>({...f,text:e.target.value}))} rows={qt==='texte_trous'?2:3} style={{ ...inputSt, resize:'vertical' }} />
      {showOptions && !isVraiFaux && (
        <>
          <label style={labelSt}>Options (cochez la bonne réponse)</label>
          {qForm.options.map((opt,i) => (
            <div key={i} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center' }}>
              <input type="radio" name="correct_opt" checked={qForm.correct===opt && !!opt} onChange={()=>opt && setQF(f=>({...f,correct:opt}))} />
              <input type="text" value={opt} onChange={e=>{ const o2=[...qForm.options]; o2[i]=e.target.value; setQF(f=>({...f,options:o2,correct:f.correct===opt?e.target.value:f.correct})); }} style={{ ...inputSt, marginBottom:0, flex:1, border:qForm.correct===opt&&opt?'2px solid #22c55e':'1px solid #d1d5db' }} />
            </div>
          ))}
        </>
      )}
      {isVraiFaux && (
        <div style={{ display:'flex', gap:12, marginBottom:16 }}>
          {['Vrai','Faux'].map(opt => (
            <button key={opt} onClick={()=>setQF(f=>({...f,correct:opt}))} style={{ flex:1, padding:'12px 0', borderRadius:10, border:`2px solid ${qForm.correct===opt?'#0891b2':'#e5e7eb'}`, background:qForm.correct===opt?'#e0f2fe':'#fff', fontWeight:700, cursor:'pointer' }}>{opt}</button>
          ))}
        </div>
      )}
      {qt === 'texte_trous' && (<><label style={labelSt}>Réponse correcte</label><input value={qForm.correct} onChange={e=>setQF(f=>({...f,correct:e.target.value}))} style={inputSt} /></>)}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
        <div><label style={labelSt}>Catégorie</label><select value={qForm.category} onChange={e=>setQF(f=>({...f,category:e.target.value}))} style={inputSt}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
        <div><label style={labelSt}>Niveau CECRL</label><select value={qForm.cefr} onChange={e=>setQF(f=>({...f,cefr:e.target.value}))} style={inputSt}>{CEFR_LEVELS.map(l=><option key={l} value={l}>{l}</option>)}</select></div>
        <div><label style={labelSt}>Points</label><select value={qForm.points} onChange={e=>setQF(f=>({...f,points:Number(e.target.value)}))} style={inputSt}><option value={1}>1 pt</option><option value={2}>2 pts</option><option value={3}>3 pts</option><option value={5}>5 pts</option></select></div>
      </div>
      <label style={{ ...labelSt, display:'flex', alignItems:'center', gap:8 }}>
        <input type="checkbox" checked={qForm.actif} onChange={e=>setQF(f=>({...f,actif:e.target.checked}))} /> Question active
      </label>
      <div style={{ display:'flex', gap:10, marginTop:16 }}>
        <button disabled={!canSave} title={permBtnTitle(editingQ?'Enregistrer':'Ajouter',canSave)} onClick={onSave} style={permBtnStyle(btnPrimary,canSave)}>{editingQ?'Enregistrer':'Ajouter la question'}</button>
        <button onClick={onClose} style={btnSecondary}>Annuler</button>
      </div>
    </Overlay>
  );
}
