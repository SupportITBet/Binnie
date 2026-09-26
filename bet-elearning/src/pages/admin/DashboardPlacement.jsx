// DashboardPlacement.jsx - Module Placement extrait de DashboardAdmin.jsx (profil admin_placement)
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useTabState } from '../../hooks/useTabState';
import { useTheme } from '../../contexts/ThemeContext';
import { COULEURS } from '../../constants/couleurs';
import { ageDepuisNaissance, ModalEnvoiGroupé, ModalResultatsTest, ModalAssignationEntreprise, PaginationSimple } from './DashboardAdminShared';
import BetLevelTestsTab from '../../components/shared/BetLevelTestsTab';

const _API_URL_ADMIN = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const _authHdrsAdmin = () => ({ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('admin_token')||''}` });
const NIV_COULEUR = { A1:'#94A3B8', A2:'#60A5FA', B1:'#34D399', B2:'#818CF8', C1:'#F59E0B', C2:'#F97316' };
const NIV_COULEUR_PL = NIV_COULEUR;

export function OngletGestionTests() {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const NIVEAUX   = ['A0 (débutant absolu)', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const NIV_OPTS  = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const BET_CYAN  = couleurTheme;

  const authH = () => ({ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('admin_token')||''}` });

  // ── tab principal ──────────────────────────────────────────────────────────
  const [tab, setTab] = useTabState('suivi', 'tab_tests');

  // ── Tests utilisés pour l'assignation aux bénéficiaires - désormais la
  // bibliothèque multi-format réelle (bet_level_tests), plus l'ancien système
  // (bet_elearning_tests_niveau) qui n'est plus géré nulle part dans l'UI depuis
  // la fusion de l'onglet "Tests multi-format" ici. Sans ce changement, les liens
  // envoyés aux bénéficiaires continuaient de pointer vers les anciens tests figés,
  // invisibles pour l'agent qui ne gère plus que la nouvelle bibliothèque.
  const [tests,      setTests]      = useState([]);
  const [savingTest, setSavingTest] = useState(false); // empêche le double-clic créer/modifier test
  const [importingAnciens, setImportingAnciens] = useState(false); // empêche le double-clic import anciens tests
  const [testsEnSuppression, setTestsEnSuppression] = useState(new Set()); // empêche le double-clic supprimer test
  const [showCreate, setShowCreate] = useState(false);
  const [editTestId, setEditTestId] = useState(null);

  const fetchTestsAssignables = useCallback(() => {
    fetch(`${_API_URL_ADMIN}/api/bet-elearning/level-tests`, { headers: authH() })
      .then(r => r.json())
      .then(d => setTests((d.tests || []).filter(t => t.actif !== false)))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchTestsAssignables(); }, [fetchTestsAssignables]);

  // ── Formulaire création/édition test ──────────────────────────────────────
  const FORM0 = { type:'qcm', titre:'', dureeMin:30, niveau:'A1',
    tranche_cible:'tous',
    questions:[], ressourceUrl:'',
    speakType:'independant', speakConsigne:'', speakAudioUrl:'', speakTextePassage:'',
    speakTip:'', speakNiveau:'B1', speakPrepTime:30, speakRecordTime:60,
    notifierEleves:true, notifierResponsable:false };
  const QF0   = { texte:'', options:['','','',''], correct:'' };
  const [testForm, setTF]  = useState(FORM0);
  const [qForm,    setQF]  = useState(QF0);

  function ouvrirCreation() {
    setEditTestId(null);
    setTF(FORM0);
    setQF(QF0);
    setShowCreate(true);
  }

  // ── Import ponctuel des tests de l'ancienne bibliothèque (localStorage) ──
  // Le passage au backend réel a laissé les tests créés avant cette bascule
  // dans le localStorage de ce navigateur - ce bouton les rapatrie une seule fois.
  function ancienStockageDisponible() {
    try { return JSON.parse(localStorage.getItem('bet_tests_niveau') || '[]').length > 0; } catch { return false; }
  }
  async function importerAnciensTests() {
    if (importingAnciens) return;
    setImportingAnciens(true);
    try {
      const anciens = JSON.parse(localStorage.getItem('bet_tests_niveau') || '[]');
      if (!anciens.length) return;
      const r = await fetch(`${_API_URL_ADMIN}/api/bet-elearning/tests-niveau/import`, {
        method: 'POST', headers: authH(), body: JSON.stringify({ tests: anciens }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Échec de l\'import');
      localStorage.removeItem('bet_tests_niveau');
      setFlash(`✅ ${d.importes} test(s) récupéré(s) depuis l'ancien stockage local.`);
      setTimeout(() => setFlash(null), 4000);
      const r2 = await fetch(`${_API_URL_ADMIN}/api/bet-elearning/tests-niveau`, { headers: authH() });
      const d2 = await r2.json();
      setTests(d2.tests || []);
    } catch (e) {
      console.error('[importerAnciensTests]', e);
      setFlash('❌ Échec de la récupération des anciens tests.');
      setTimeout(() => setFlash(null), 4000);
    } finally {
      setImportingAnciens(false);
    }
  }

  function ouvrirEdition(t) {
    setEditTestId(t.id);
    setTF({ ...FORM0, ...t }); // charger toutes les données du test
    setQF(QF0);
    setShowCreate(true);
  }

  function addQuestion() {
    if (!qForm.texte.trim()) return;
    if ((testForm.type === 'qcm' || testForm.type === 'listening' || testForm.type === 'audio') && !qForm.correct) return;
    setTF(f => ({ ...f, questions: [...f.questions, { id: Date.now(), ...qForm }] }));
    setQF(QF0);
  }

  async function sauvegarderTest() {
    if (!testForm.titre.trim() || savingTest) return;
    setSavingTest(true);
    try {
      if (editTestId) {
        const r = await fetch(`${_API_URL_ADMIN}/api/bet-elearning/tests-niveau/${editTestId}`, {
          method: 'PATCH', headers: authH(), body: JSON.stringify(testForm),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok) {
          setTests(ts => ts.map(t => t.id === editTestId ? d.test : t));
        } else {
          toast.error(d.error || 'Modification refusée', { duration: 5000 });
          return;
        }
      } else {
        const r = await fetch(`${_API_URL_ADMIN}/api/bet-elearning/tests-niveau`, {
          method: 'POST', headers: authH(), body: JSON.stringify(testForm),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok) {
          setTests(ts => [d.test, ...ts]);
        } else {
          toast.error(d.error || 'Création refusée', { duration: 5000 });
          return;
        }
      }
    } catch (e) {
      toast.error('Impossible de joindre le serveur', { duration: 5000 });
      return;
    } finally {
      setSavingTest(false);
    }
    setTF(FORM0); setQF(QF0);
    setEditTestId(null);
    setShowCreate(false);
    setTab('bibliotheque');
  }

  async function supprimerTest(id) {
    if (testsEnSuppression.has(id)) return;
    setTestsEnSuppression(prev => new Set(prev).add(id));
    const cible = tests.find(t => t.id === id);
    setTests(ts => ts.filter(t => t.id !== id));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/bet-elearning/tests-niveau/${id}`, { method: 'DELETE', headers: authH() });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Suppression refusée', { duration: 5000 });
        if (cible) setTests(ts => [...ts, cible]);
      }
    } catch (e) {
      toast.error('Impossible de joindre le serveur', { duration: 5000 });
      if (cible) setTests(ts => [...ts, cible]);
    } finally {
      setTestsEnSuppression(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  // ── Queue réelle depuis l'API ─────────────────────────────────────────────
  const [queue,        setQueue]        = useState([]);
  const [aAssigner,    setAAssigner]    = useState([]);
  // Apprenants déjà assignés à une classe - leur résultat de test doit rester consultable
  // en permanence, même une fois le dossier transmis et sorti des deux listes ci-dessus.
  const [historiquePlacement, setHistoriquePlacement] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(true);

  const fetchQueue = useCallback(async () => {
    setLoadingQueue(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch(`${_API_URL_ADMIN}/api/placement/queue`,       { headers: authH() }),
        fetch(`${_API_URL_ADMIN}/api/placement/a-assigner`,  { headers: authH() }),
        fetch(`${_API_URL_ADMIN}/api/placement/historique`,  { headers: authH() }),
      ]);
      const d1 = await r1.json();
      const d2 = await r2.json();
      const d3 = await r3.json();
      setHistoriquePlacement((d3.apprenants || []).map(a => ({
        id:             a.id,
        prenom:         (a.nom_complet || '').split(' ')[0] || '',
        nom:            (a.nom_complet || '').split(' ').slice(1).join(' ') || '',
        nom_complet:    a.nom_complet,
        email:          a.email || '',
        telephone:      a.telephone || '',
        entreprise:     a.entreprise_nom || '-',
        niveau_detecte: a.niveau_detecte || null,
        dateTest:       a.date_test || '',
        age:            ageDepuisNaissance(a.date_naissance),
        tranche_age:    a.profil_type === 'enfant' ? 'enfant' : a.profil_type === 'ado' ? 'adolescent' : null,
        profil_type:    a.profil_type || 'adulte',
        nom_parent:       a.nom_parent || '',
        telephone_parent: a.telephone_parent || '',
        email_parent:     a.email_parent || '',
      })));
      setQueue((d1.queue || []).map(a => ({
        id:          a.id,
        prenom:      (a.nom_complet || '').split(' ')[0] || '',
        nom:         (a.nom_complet || '').split(' ').slice(1).join(' ') || '',
        nom_complet: a.nom_complet,
        email:       a.email || '',
        telephone:   a.telephone || '',
        entreprise:  a.entreprise_nom || '-',
        entreprise_id: a.entreprise_id || null,
        dateCreation: a.created_at?.slice(0,10) || '',
        statut:      a.statut,
        notes:       a.notes_placement || '',
        age:            ageDepuisNaissance(a.date_naissance),
        tranche_age:    a.profil_type === 'enfant' ? 'enfant' : a.profil_type === 'ado' ? 'adolescent' : null,
        profil_type:    a.profil_type || 'adulte',
        nom_parent:       a.nom_parent || '',
        telephone_parent: a.telephone_parent || '',
        email_parent:     a.email_parent || '',
      })));
      setAAssigner((d2.apprenants || []).map(a => ({
        id:             a.id,
        prenom:         (a.nom_complet || '').split(' ')[0] || '',
        nom:            (a.nom_complet || '').split(' ').slice(1).join(' ') || '',
        nom_complet:    a.nom_complet,
        email:          a.email || '',
        telephone:      a.telephone || '',
        entreprise:     a.entreprise_nom || '-',
        entreprise_id:  a.entreprise_id || null,
        entreprise_nom: a.entreprise_nom || null,
        onboarding_id:  a.onboarding_id || null,
        niveau_detecte: a.niveau_detecte || null,
        niveau_cecr:    a.niveau_detecte || '-',
        notes_test:     a.notes_placement || '',
        dateTest:       a.date_test || '',
        statut:         'a_assigner',
        age:            ageDepuisNaissance(a.date_naissance),
        tranche_age:    a.profil_type === 'enfant' ? 'enfant' : a.profil_type === 'ado' ? 'adolescent' : null,
        profil_type:    a.profil_type || 'adulte',
        nom_parent:       a.nom_parent || '',
        telephone_parent: a.telephone_parent || '',
        email_parent:     a.email_parent || '',
      })));
    } catch (e) {
      console.error('[placement queue]', e);
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    // Rafraîchissement auto - un apprenant transmis par Onboarding pendant que
    // ce dashboard reste ouvert doit apparaître sans que l'agent recharge la page.
    const interval = setInterval(fetchQueue, 20000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  // Notifications depuis Onboarding (via API réelle)
  const [notifsPlacement, setNotifsPlacement] = useState([]);
  const notifsNonLuesPlacement = notifsPlacement.filter(n => !n.lu);

  useEffect(() => {
    fetch(`${_API_URL_ADMIN}/api/notifications/mes-notifs`, { headers: authH() })
      .then(r => r.json())
      .then(d => setNotifsPlacement(d.notifications || []))
      .catch(() => {});
  }, []);

  async function marquerNotifsPlacementLues() {
    await Promise.all(notifsNonLuesPlacement.map(n =>
      fetch(`${_API_URL_ADMIN}/api/notifications/${n.id}/lu`, { method: 'PATCH', headers: authH() })
    )).catch(() => {});
    setNotifsPlacement(prev => prev.map(n => ({ ...n, lu: true })));
    fetchQueue();
  }

  const [modalTest,          setModalTest]          = useState(null);
  const [testsDemarresIds,   setTestsDemarresIds]   = useState(new Set()); // empêche le double-clic démarrer test
  const [savingResultat,     setSavingResultat]     = useState(false); // empêche le double-clic enregistrer résultat
  const [form,               setForm]               = useState({ niveau: 'A1', notes: '', duree: '30' });
  const [flash,              setFlash]              = useState(null);
  const [modalLien,          setModalLien]          = useState(null);
  const [modalResultat,      setModalResultat]      = useState(null);
  const [selection,          setSelection]          = useState(new Set());
  const [modalGroupé,        setModalGroupé]        = useState(false);
  const [filtreSuivi,        setFiltreSuivi]        = useState('tous');
  const [rechercheSuivi,     setRechercheSuivi]     = useState('');
  const [pageSuivi,          setPageSuivi]          = useState(1);
  const PP_SUIVI = 10;
  const [modalEntreprise,    setModalEntreprise]    = useState(null);
  // tousSelectionnes, toggleSelect, toggleTout, ouvrirEnvoiGroupé - définis après enAttente

  function ouvrirModalLien(a) {
    if (tests.length === 0) { setFlash('Créez d\'abord un test dans la bibliothèque avant d\'envoyer un lien.'); return; }
    const testChoisi = tests[0]; // par défaut le premier, l'agent peut choisir
    const lien = `${window.location.origin}/level-test/${testChoisi.id}?a=${a.id}`;
    setModalLien({ apprenant: a, lien, testChoisi, testId: testChoisi.id });
  }

  const enAttente   = queue.filter(a => a.statut === 'en_attente_test');
  const enCours     = queue.filter(a => a.statut === 'test_en_cours');
  const evalues     = aAssigner;

  // ── Sélection multiple ──────────────────────────────────────────────────
  const tousSelectionnes = enAttente.length > 0 && enAttente.every(a => selection.has(a.id));
  const nbSelectionnes   = [...selection].filter(id => enAttente.some(a => a.id === id)).length;

  function toggleSelect(id) {
    setSelection(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleTout() {
    if (tousSelectionnes) setSelection(new Set());
    else setSelection(new Set(enAttente.map(a => a.id)));
  }
  function ouvrirEnvoiGroupé() { if (nbSelectionnes > 0) setModalGroupé(true); }

  async function demarrerTest(a) {
    if (testsDemarresIds.has(a.id)) return;
    setTestsDemarresIds(prev => new Set(prev).add(a.id));
    try {
      await fetch(`${_API_URL_ADMIN}/api/placement/${a.id}/statut`, {
        method: 'PATCH',
        headers: authH(),
        body: JSON.stringify({ statut: 'test_en_cours' }),
      });
      setQueue(q => q.map(x => x.id === a.id ? { ...x, statut: 'test_en_cours' } : x));
    } catch (e) {
      console.error('[demarrerTest]', e);
    } finally {
      setTestsDemarresIds(prev => { const n = new Set(prev); n.delete(a.id); return n; });
    }
    setModalTest(a);
    setForm({ niveau: 'A1', notes: '', duree: '30' });
  }

  async function enregistrerResultat() {
    if (!modalTest || savingResultat) return;
    setSavingResultat(true);
    const niveau_cecr = form.niveau.split(' ')[0];
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/placement/${modalTest.id}/resultat`, {
        method: 'POST',
        headers: authH(),
        body: JSON.stringify({ niveau_cecr, notes: form.notes, duree_min: Number(form.duree) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || r.status);

      // Retirer de la queue et mettre à jour l'état a-assigner
      setQueue(q => q.filter(x => x.id !== modalTest.id));
      const entrant = {
        id: modalTest.id, prenom: modalTest.prenom, nom: modalTest.nom,
        nom_complet: modalTest.nom_complet, email: modalTest.email,
        entreprise: modalTest.entreprise, niveau_cecr,
        notes_test: form.notes, dateTest: new Date().toISOString().slice(0, 10), statut: 'a_assigner',
      };
      setAAssigner(prev => [...prev, entrant]);

      setFlash(`${modalTest.prenom} ${modalTest.nom} - niveau ${niveau_cecr} enregistré.`);
    } catch (e) {
      setFlash(`Erreur : ${e.message}`);
    } finally {
      setSavingResultat(false);
    }
    setModalTest(null);
    setTimeout(() => setFlash(null), 4000);
  }

  const inp  = { width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, boxSizing:'border-box', background:COULEURS.blanc };
  const lbl  = { fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:6 };
  const cardKan = (border) => ({ background:COULEURS.blanc, borderRadius:12, border:`1px solid ${COULEURS.gris200}`, borderTop:`4px solid ${border}`, overflow:'hidden' });

  const TYPE_ICONE = { qcm:'📋', listening:'🎬', audio:'🎧', quiz:'🎯', speaking:'🎤' };
  const TYPE_LIB   = { qcm:'QCM', listening:'Listening', audio:'Audio', quiz:'Quiz', speaking:'Speaking' };

  return (
    <>
      {/* Flash */}
      {flash && (
        <div style={{ background:'#D1FAE5', border:'1px solid #6EE7B7', borderRadius:10, padding:'12px 20px', marginBottom:20, fontSize:13, color:'#065F46', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>✅ {flash}</span>
          <button onClick={() => setFlash(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#065F46', fontSize:18, lineHeight:1 }}>×</button>
        </div>
      )}

      {/* Notifications depuis Onboarding */}
      {notifsNonLuesPlacement.length > 0 && (
        <div style={{ background:'linear-gradient(135deg,#7C3AED,#5B21B6)', borderRadius:12, padding:'14px 20px', marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center', boxShadow:'0 4px 16px rgba(124,58,237,0.3)' }}>
          <div style={{ display:'flex', gap:12, alignItems:'center' }}>
            <span style={{ fontSize:24 }}>🔔</span>
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:'#fff', marginBottom:2 }}>
                {notifsNonLuesPlacement.length} nouvelle{notifsNonLuesPlacement.length > 1 ? 's' : ''} notification{notifsNonLuesPlacement.length > 1 ? 's' : ''} d'Onboarding
              </div>
              <div style={{ display:'flex', gap:6, marginTop:4, flexWrap:'wrap' }}>
                {notifsNonLuesPlacement.slice(0, 5).map(n => (
                  <span key={n.id} style={{ background:'rgba(255,255,255,0.18)', padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700, color:'#fff' }}>
                    {n.meta?.nom_complet || n.titre}
                  </span>
                ))}
                {notifsNonLuesPlacement.length > 5 && <span style={{ background:'rgba(255,255,255,0.18)', padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700, color:'#fff' }}>+{notifsNonLuesPlacement.length - 5}</span>}
              </div>
            </div>
          </div>
          <button onClick={marquerNotifsPlacementLues} style={{ background:'rgba(255,255,255,0.2)', border:'1px solid rgba(255,255,255,0.4)', borderRadius:8, padding:'7px 14px', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', flexShrink:0 }}>
            ✓ Vu
          </button>
        </div>
      )}

      {/* Rappels - nouveaux arrivants en attente de test */}
      {enAttente.length > 0 && (
        <div style={{ background:'#FEF3C7', border:'1px solid #FDE68A', borderRadius:10, padding:'12px 20px', marginBottom:20, display:'flex', gap:10, alignItems:'center' }}>
          <span style={{ fontSize:20 }}>📬</span>
          <div style={{ fontSize:13, color:'#92400E' }}>
            <strong>{enAttente.length} apprenant{enAttente.length > 1 ? 's' : ''} en attente de test de niveau</strong>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:16, marginBottom:24 }}>
        {[
          { l:'En attente de test', v:enAttente.length,              c:COULEURS.attention, i:'⏳' },
          { l:'Test en cours',      v:enCours.length,                c:'#8B5CF6',          i:'📝' },
          { l:'À assigner',         v:evalues.length,                c:couleurTheme,      i:'🎯' },
          { l:'Tests créés',        v:tests.length,                  c:'#10B981',          i:'📚' },
        ].map(k => (
          <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:12, padding:'16px 20px', border:`1px solid ${COULEURS.gris200}`, borderTop:`4px solid ${k.c}`, boxShadow:'0 2px 6px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize:22, marginBottom:6 }}>{k.i}</div>
            <div style={{ fontSize:24, fontWeight:800, color:COULEURS.navy, lineHeight:1, marginBottom:4 }}>{k.v}</div>
            <div style={{ fontSize:11, color:COULEURS.gris600 }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Tabs + bouton Créer */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ display:'flex', gap:0, background:COULEURS.gris100, borderRadius:10, padding:4 }}>
          {[
            ['suivi',       '👥 Suivi apprenants'],
            ['entreprises', '🏢 Entreprises'],
            ['historique',  '🗂️ Historique'],
            ['bibliotheque','📚 Bibliothèque de tests'],
          ].map(([id,lib]) => (
            <button key={id} onClick={() => setTab(id)} style={{ padding:'8px 18px', borderRadius:8, border:'none', background: tab===id ? COULEURS.blanc : 'transparent', color: tab===id ? COULEURS.navy : COULEURS.gris600, fontWeight: tab===id ? 700 : 500, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', boxShadow: tab===id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', transition:'all 0.15s', position:'relative' }}>
              {lib}
              {id === 'entreprises' && (() => {
                const nbEnt = [...new Set(enAttente.filter(a => a.entreprise && a.entreprise !== '-').map(a => a.entreprise))].length;
                return nbEnt > 0 ? <span style={{ position:'absolute', top:4, right:4, background:'#DC2626', color:'#fff', borderRadius:'50%', width:16, height:16, fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>{nbEnt}</span> : null;
              })()}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:10 }}>
          {tab !== 'bibliotheque' && (
            <button onClick={fetchQueue} disabled={loadingQueue} style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px', borderRadius:9, border:`1.5px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.navy, fontWeight:700, fontSize:13, cursor:loadingQueue?'default':'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', opacity:loadingQueue?0.6:1 }}>
              {loadingQueue ? '⏳' : '🔄'} Actualiser
            </button>
          )}
          {tab !== 'bibliotheque' && (
            <button onClick={ouvrirCreation} style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px', borderRadius:9, border:'none', background:BET_CYAN, color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', boxShadow:`0 4px 12px ${BET_CYAN}50` }}>
              ＋ Créer un test de niveau
            </button>
          )}
        </div>
      </div>

      {/* ── Vue Historique - dossiers déjà assignés, résultat toujours consultable ── */}
      {tab === 'historique' && (
        <div>
          {historiquePlacement.length === 0 ? (
            <div style={{ background:COULEURS.blanc, borderRadius:14, padding:'48px 32px', border:`2px dashed ${COULEURS.gris200}`, textAlign:'center' }}>
              <div style={{ fontSize:44, marginBottom:12 }}>🗂️</div>
              <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Aucun dossier traité pour le moment</div>
              <div style={{ fontSize:13, color:COULEURS.gris600 }}>Les apprenants déjà assignés à une classe apparaîtront ici, avec leur résultat de test toujours consultable.</div>
            </div>
          ) : (
            <div style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.05)', border:`1px solid ${COULEURS.gris200}` }}>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1.4fr 1fr 1fr 120px', padding:'11px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                <span>Apprenant</span><span>Client</span><span>Niveau</span><span>Testé le</span><span>Action</span>
              </div>
              {historiquePlacement.map(a => (
                <div key={a.id} style={{ display:'grid', gridTemplateColumns:'2fr 1.4fr 1fr 1fr 120px', padding:'14px 20px', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13, alignItems:'center' }}>
                  <div>
                    <div style={{ fontWeight:700, color:COULEURS.navy }}>{a.prenom} {a.nom}</div>
                    <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:2 }}>{a.email || a.telephone || '-'}</div>
                  </div>
                  <span style={{ fontSize:12, color:COULEURS.navy, fontWeight:600 }}>{a.entreprise}</span>
                  <span style={{ fontWeight:800, fontSize:14, color: NIV_COULEUR_PL[a.niveau_detecte] || COULEURS.navy }}>{a.niveau_detecte || '-'}</span>
                  <span style={{ fontSize:12, color:COULEURS.gris600 }}>{a.dateTest || '-'}</span>
                  <button
                    onClick={() => setModalResultat({ apprenantId: a.id, apprenantNom: `${a.prenom} ${a.nom}` })}
                    style={{ background:COULEURS.gris50, color:COULEURS.navy, border:`1px solid ${COULEURS.gris200}`, borderRadius:7, padding:'6px 12px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', whiteSpace:'nowrap' }}
                  >
                    📋 Résultats
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Vue Entreprises ── */}
      {tab === 'entreprises' && (() => {
        // Grouper tous les apprenants en attente par entreprise
        const tousEnAttente = [...enAttente, ...enCours];
        const parEntreprise = tousEnAttente.reduce((acc, a) => {
          const key = a.entreprise || '- Particuliers -';
          if (!acc[key]) acc[key] = { nom: key, entreprise_id: a.entreprise_id || null, apprenants: [] };
          acc[key].apprenants.push(a);
          return acc;
        }, {});
        const groupes = Object.values(parEntreprise).sort((a, b) => b.apprenants.length - a.apprenants.length);

        if (groupes.length === 0) return (
          <div style={{ background:COULEURS.blanc, borderRadius:14, padding:'48px 32px', border:`2px dashed ${COULEURS.gris200}`, textAlign:'center' }}>
            <div style={{ fontSize:44, marginBottom:12 }}>🏢</div>
            <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Aucune entreprise en attente</div>
            <div style={{ fontSize:13, color:COULEURS.gris600 }}>Les apprenants envoyés par l'onboarding apparaîtront ici, groupés par entreprise.</div>
          </div>
        );

        return (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14 }}>
            {groupes.map(g => {
              const nbAtt = g.apprenants.filter(a => a.statut === 'en_attente_test').length;
              const nbCours= g.apprenants.filter(a => a.statut === 'test_en_cours').length;
              return (
                <div key={g.nom}
                  onClick={() => setModalEntreprise(g)}
                  style={{ background:COULEURS.blanc, borderRadius:14, border:`1px solid ${COULEURS.gris200}`, borderTop:`4px solid ${BET_CYAN}`, padding:'18px 20px', cursor:'pointer', transition:'all 0.15s', boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.10)'; e.currentTarget.style.transform='translateY(-2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.04)'; e.currentTarget.style.transform='translateY(0)'; }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:40, height:40, borderRadius:10, background:`${BET_CYAN}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🏢</div>
                      <div style={{ fontSize:13, fontWeight:800, color:COULEURS.navy, lineHeight:1.3 }}>{g.nom}</div>
                    </div>
                    <span style={{ background:`${BET_CYAN}20`, color:couleurThemeFonce, borderRadius:20, padding:'3px 10px', fontSize:12, fontWeight:800, flexShrink:0 }}>
                      {g.apprenants.length}
                    </span>
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {nbAtt > 0 && (
                      <span style={{ background:'#FEF3C7', color:'#92400E', borderRadius:6, padding:'3px 9px', fontSize:11, fontWeight:700 }}>
                        ⏳ {nbAtt} en attente
                      </span>
                    )}
                    {nbCours > 0 && (
                      <span style={{ background:'#EDE9FE', color:'#5B21B6', borderRadius:6, padding:'3px 9px', fontSize:11, fontWeight:700 }}>
                        📝 {nbCours} en cours
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop:12, display:'flex', gap:8, flexWrap:'wrap' }}>
                    {g.apprenants.slice(0,4).map(a => (
                      <div key={a.id} title={`${a.prenom} ${a.nom}`} style={{ width:28, height:28, borderRadius:'50%', background:`${BET_CYAN}20`, border:`1.5px solid ${BET_CYAN}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:couleurThemeFonce }}>
                        {`${a.prenom?.[0]||''}${a.nom?.[0]||''}`.toUpperCase()}
                      </div>
                    ))}
                    {g.apprenants.length > 4 && (
                      <div style={{ width:28, height:28, borderRadius:'50%', background:COULEURS.gris100, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:COULEURS.gris600 }}>+{g.apprenants.length - 4}</div>
                    )}
                  </div>
                  <div style={{ marginTop:14, padding:'8px 0 0', borderTop:`1px solid ${COULEURS.gris100}`, fontSize:12, color:BET_CYAN, fontWeight:700, textAlign:'center' }}>
                    Cliquer pour assigner les tests →
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── Modal assignation tests entreprise ── */}
      {modalEntreprise && (
        <ModalAssignationEntreprise
          entreprise={modalEntreprise}
          tests={tests}
          onFermer={() => setModalEntreprise(null)}
          onDemarrer={async (apprenantId) => { await demarrerTest({ id: apprenantId }); }}
          onConfirmer={() => setModalEntreprise(null)}
          couleurTheme={couleurTheme}
          couleurThemeFonce={couleurThemeFonce}
          couleurThemeClair={couleurThemeClair}
        />
      )}

      {/* ── Vue Suivi apprenants ── */}
      {tab === 'suivi' && (() => {
        // ── État filtres (déclarés ici pour éviter les hooks conditionnels) ──
        // NOTE : ces états sont déclarés dans le composant parent, voir ci-dessus
        const tousApprenants = [
          ...enAttente.map(a => ({ ...a, _statut: 'en_attente_test' })),
          ...enCours.map(a   => ({ ...a, _statut: 'test_en_cours'   })),
          ...evalues.map(a   => ({ ...a, _statut: 'a_assigner'      })),
        ];

        const CFG_STATUT = {
          en_attente_test: { lib:'En attente de test', bg:'#FEF3C7', txt:'#92400E', ic:'⏳' },
          test_en_cours:   { lib:'Test en cours',      bg:'#EDE9FE', txt:'#5B21B6', ic:'📝' },
          a_assigner:      { lib:'Niveau attribué',    bg:`${couleurTheme}15`, txt:couleurThemeFonce, ic:'🎯' },
        };

        return (
        <div>

          {/* ── Filtres + recherche ── */}
          <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
            {/* Filtres statut */}
            <div style={{ display:'flex', gap:6 }}>
              {[
                ['tous',           'Tous',              tousApprenants.length],
                ['en_attente_test','⏳ En attente',      enAttente.length],
                ['test_en_cours',  '📝 En cours',        enCours.length],
                ['a_assigner',     '🎯 Niveau attribué', evalues.length],
              ].map(([val, lib, nb]) => (
                <button
                  key={val}
                  onClick={() => { setFiltreSuivi(val); setPageSuivi(1); }}
                  style={{ padding:'7px 14px', borderRadius:8, border:`1px solid ${filtreSuivi===val ? couleurTheme : COULEURS.gris200}`, background: filtreSuivi===val ? `${couleurTheme}12` : COULEURS.blanc, color: filtreSuivi===val ? couleurThemeFonce : COULEURS.gris600, fontSize:12, fontWeight: filtreSuivi===val ? 700 : 500, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', gap:6 }}
                >
                  {lib}
                  <span style={{ background: filtreSuivi===val ? couleurTheme : COULEURS.gris200, color: filtreSuivi===val ? '#fff' : COULEURS.gris600, borderRadius:10, padding:'1px 7px', fontSize:10, fontWeight:700 }}>
                    {nb}
                  </span>
                </button>
              ))}
            </div>

            {/* Recherche */}
            <div style={{ flex:1, minWidth:200, position:'relative' }}>
              <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:COULEURS.gris400, fontSize:14 }}>🔍</span>
              <input
                type="text"
                value={rechercheSuivi}
                onChange={e => { setRechercheSuivi(e.target.value); setPageSuivi(1); }}
                placeholder="Rechercher un apprenant, entreprise…"
                style={{ width:'100%', padding:'8px 12px 8px 32px', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, background:COULEURS.blanc, boxSizing:'border-box' }}
              />
            </div>
          </div>

          {/* ── Tableau ── */}
          <div style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.05)', border:`1px solid ${COULEURS.gris200}` }}>

            {/* En-tête */}
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1.2fr 1.4fr 1fr 1fr 180px', padding:'10px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
              <span>Apprenant</span><span>Âge / Tranche</span><span>Entreprise</span><span>Statut</span><span>Niveau</span><span>Depuis</span><span>Actions</span>
            </div>

            {(() => {
              const liste = tousApprenants.filter(a => {
                if (filtreSuivi !== 'tous' && a._statut !== filtreSuivi) return false;
                if (rechercheSuivi) {
                  const q = rechercheSuivi.toLowerCase();
                  return `${a.prenom} ${a.nom} ${a.entreprise}`.toLowerCase().includes(q);
                }
                return true;
              });

              if (liste.length === 0) return (
                <div style={{ padding:'48px 20px', textAlign:'center', color:COULEURS.gris400, fontSize:14 }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>🔍</div>
                  Aucun apprenant ne correspond à la recherche.
                </div>
              );

              const listePage = liste.slice((pageSuivi-1)*PP_SUIVI, pageSuivi*PP_SUIVI);

              return (<>
              {listePage.map((a, i) => {
                const cfg    = CFG_STATUT[a._statut] || CFG_STATUT.en_attente_test;
                const tranche= a.tranche_age || (a.age != null ? (a.age <= 12 ? 'enfant' : 'adolescent') : 'adulte');
                const niv    = a.niveau_cecr || '-';
                const depuis = a.dateTest || a.dateCreation || '-';
                const initials = `${a.prenom?.[0]||''}${a.nom?.[0]||''}`.toUpperCase();

                return (
                  <div
                    key={a.id}
                    style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1.2fr 1.4fr 1fr 1fr 180px', padding:'13px 20px', borderBottom: i < listePage.length - 1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:13, alignItems:'center', transition:'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = COULEURS.gris50}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Apprenant */}
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:34, height:34, borderRadius:'50%', background:`${couleurTheme}20`, border:`1.5px solid ${couleurTheme}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:couleurThemeFonce, flexShrink:0 }}>
                        {initials}
                      </div>
                      <div>
                        <div style={{ fontWeight:700, color:COULEURS.navy }}>{a.prenom} {a.nom}</div>
                        <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:1 }}>{a.emailApp || '-'}</div>
                      </div>
                    </div>

                    {/* Âge / Tranche */}
                    <span style={{ color:COULEURS.gris600 }}>
                      {a.age != null ? `${a.age} ans` : '-'} · {tranche === 'enfant' ? '🧒' : tranche === 'adolescent' ? '🧑' : '👤'}
                    </span>

                    {/* Entreprise */}
                    <span style={{ color:COULEURS.navy, fontWeight:500 }}>{a.entreprise || '-'}</span>

                    {/* Statut */}
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:20, background:cfg.bg, color:cfg.txt, fontSize:11, fontWeight:700, width:'fit-content' }}>
                      {cfg.ic} {cfg.lib}
                    </span>

                    {/* Niveau */}
                    <span style={{ fontWeight:800, fontSize:14, color: NIV_COULEUR[niv] || COULEURS.gris400 }}>{niv}</span>

                    {/* Depuis */}
                    <span style={{ fontSize:11, color:COULEURS.gris400 }}>{depuis}</span>

                    {/* Actions selon statut */}
                    <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                      {a._statut === 'en_attente_test' && (<>
                        <button onClick={() => ouvrirModalLien(a)} style={{ padding:'5px 9px', borderRadius:7, border:`1px solid ${couleurTheme}`, background:`${couleurTheme}10`, color:couleurThemeFonce, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>🔗</button>
                        <button onClick={() => demarrerTest(a)} style={{ padding:'5px 9px', borderRadius:7, border:'none', background:COULEURS.attention, color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>📝 Test</button>
                      </>)}
                      {a._statut === 'test_en_cours' && (
                        <button onClick={() => { setModalTest(a); setForm({ niveau:'A1', notes:'', duree:'30' }); }} style={{ padding:'5px 10px', borderRadius:7, border:'none', background:'#8B5CF6', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>✅ Résultat</button>
                      )}
                      {a._statut === 'a_assigner' && (
                        <button onClick={() => setModalResultat({ apprenantId: a.id, apprenantNom: `${a.prenom} ${a.nom}` })} style={{ padding:'5px 9px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.navy, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>📋 Résultats</button>
                      )}
                    </div>
                  </div>
                );
              })}
              </>);
            })()}
          </div>
          <PaginationSimple
            total={tousApprenants.filter(a => {
              if (filtreSuivi !== 'tous' && a._statut !== filtreSuivi) return false;
              if (rechercheSuivi) {
                const q = rechercheSuivi.toLowerCase();
                return `${a.prenom} ${a.nom} ${a.entreprise}`.toLowerCase().includes(q);
              }
              return true;
            }).length}
            parPage={PP_SUIVI}
            page={pageSuivi}
            onChange={setPageSuivi}
          />
        </div>
        );
      })()}

      {/* ── ANCIEN KANBAN (supprimé) - placeholder pour maintenir la structure ── */}
      {false && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20, alignItems:'start' }}>

          {/* Col 1 - En attente */}
          <div style={cardKan(COULEURS.attention)}>

            {/* Header colonne */}
            <div style={{ padding:'10px 14px', background:'#FEF3C7', borderBottom:`1px solid ${COULEURS.gris200}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: enAttente.length > 0 ? 8 : 0 }}>
                <span style={{ fontWeight:700, fontSize:13, color:'#92400E' }}>⏳ En attente de test</span>
                <span style={{ background:'#92400E', color:'#fff', borderRadius:10, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{enAttente.length}</span>
              </div>

              {/* Barre sélection + actions groupées */}
              {enAttente.length > 0 && (
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <label style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer', fontSize:11, fontWeight:600, color:'#92400E', userSelect:'none' }}>
                    <input
                      type="checkbox"
                      checked={tousSelectionnes}
                      onChange={toggleTout}
                      style={{ width:14, height:14, cursor:'pointer', accentColor:'#92400E' }}
                    />
                    {tousSelectionnes ? 'Tout désélectionner' : 'Tout sélectionner'}
                  </label>
                  {nbSelectionnes > 0 && (
                    <button
                      onClick={ouvrirEnvoiGroupé}
                      style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:7, border:'none', background:'#92400E', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', whiteSpace:'nowrap' }}
                    >
                      🔗 Envoyer à {nbSelectionnes} apprenant{nbSelectionnes > 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Liste */}
            <div style={{ padding:12, display:'flex', flexDirection:'column', gap:10 }}>
              {enAttente.length === 0 && (
                <div style={{ padding:'20px 0', textAlign:'center', color:COULEURS.gris400, fontSize:12 }}>Aucun apprenant en attente</div>
              )}
              {enAttente.map(a => {
                const estSelectionne = selection.has(a.id);
                return (
                  <div
                    key={a.id}
                    style={{ background: estSelectionne ? '#FEF3C7' : COULEURS.gris50, borderRadius:10, padding:'10px 12px', border:`2px solid ${estSelectionne ? '#F59E0B' : COULEURS.gris200}`, transition:'all 0.12s' }}
                  >
                    {/* Checkbox + nom */}
                    <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                      <input
                        type="checkbox"
                        checked={estSelectionne}
                        onChange={() => toggleSelect(a.id)}
                        style={{ width:15, height:15, marginTop:2, cursor:'pointer', flexShrink:0, accentColor:'#92400E' }}
                      />
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:13, color:COULEURS.navy }}>{a.prenom} {a.nom}</div>
                        <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:1 }}>{a.age} ans · {a.entreprise}</div>
                        <div style={{ fontSize:11, color:COULEURS.gris400 }}>Comptes créés le {a.dateCreation}</div>
                      </div>
                    </div>
                    {/* Actions individuelles */}
                    <div style={{ display:'flex', gap:6, marginTop:8 }}>
                      <button onClick={() => ouvrirModalLien(a)} style={{ flex:1, padding:'6px 0', borderRadius:7, border:`1px solid ${couleurTheme}`, background:`${couleurTheme}12`, color:couleurThemeFonce, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        🔗 Lien individuel
                      </button>
                      <button onClick={() => demarrerTest(a)} style={{ flex:1, padding:'6px 0', borderRadius:7, border:'none', background:COULEURS.attention, color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        📝 En salle
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Col 2 - Test en cours */}
          <div style={cardKan('#8B5CF6')}>
            <div style={{ padding:'12px 16px', background:'#EDE9FE', borderBottom:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontWeight:700, fontSize:13, color:'#5B21B6' }}>📝 Test en cours</span>
              <span style={{ background:'#5B21B6', color:'#fff', borderRadius:10, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{enCours.length}</span>
            </div>
            <div style={{ padding:12, display:'flex', flexDirection:'column', gap:10 }}>
              {enCours.length === 0 && <div style={{ padding:'20px 0', textAlign:'center', color:COULEURS.gris400, fontSize:12 }}>Aucun test en cours</div>}
              {enCours.map(a => (
                <div key={a.id} style={{ background:COULEURS.gris50, borderRadius:10, padding:'12px 14px', border:`1px solid ${COULEURS.gris200}` }}>
                  <div style={{ fontWeight:700, fontSize:13, color:COULEURS.navy }}>{a.prenom} {a.nom}</div>
                  <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:2 }}>{a.age} ans · {a.entreprise}</div>
                  <button onClick={() => { setModalTest(a); setForm({ niveau:'A1', notes:'', duree:'30' }); }} style={{ marginTop:10, width:'100%', padding:'7px 0', borderRadius:7, border:'none', background:'#8B5CF6', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                    ✅ Enregistrer le résultat
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Col 3 - Niveau attribué */}
          <div style={cardKan(couleurTheme)}>
            <div style={{ padding:'12px 16px', background:`${couleurTheme}15`, borderBottom:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontWeight:700, fontSize:13, color:couleurThemeFonce }}>🎯 Niveau attribué</span>
              <span style={{ background:couleurThemeFonce, color:'#fff', borderRadius:10, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{evalues.length}</span>
            </div>
            <div style={{ padding:12, display:'flex', flexDirection:'column', gap:10 }}>
              {evalues.length === 0 && <div style={{ padding:'20px 0', textAlign:'center', color:COULEURS.gris400, fontSize:12 }}>Aucun résultat disponible</div>}
              {evalues.map(a => (
                <div key={a.id} style={{ background:COULEURS.gris50, borderRadius:10, padding:'12px 14px', border:`1px solid ${COULEURS.gris200}` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                    <span style={{ fontWeight:700, fontSize:13, color:COULEURS.navy }}>{a.prenom} {a.nom}</span>
                    <span style={{ fontWeight:800, fontSize:14, color: NIV_COULEUR[a.niveau_cecr] || COULEURS.navy }}>{a.niveau_cecr}</span>
                  </div>
                  <div style={{ fontSize:11, color:COULEURS.gris400 }}>{a.entreprise} · Testé le {a.dateTest}</div>
                  {a.notes_test && <div style={{ fontSize:11, color:COULEURS.gris600, marginTop:4, fontStyle:'italic' }}>"{a.notes_test}"</div>}
                  <div style={{ marginTop:8, display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ background:`${couleurTheme}15`, color:couleurThemeFonce, borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:600 }}>En attente d'assignation →</span>
                    <button
                      onClick={() => setModalResultat({ apprenantId: a.id, apprenantNom: `${a.prenom} ${a.nom}` })}
                      style={{ padding:'4px 10px', borderRadius:20, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.navy, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}
                    >
                      📋 Résultats
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Vue Bibliothèque de tests - remplacée par l'écran "Tests multi-format" (BetLevelTestsTab),
          désormais fusionné ici au lieu d'être un onglet séparé du menu latéral ── */}
      {tab === 'bibliotheque' && (
        <BetLevelTestsTab />
      )}

      {/* ── Modal enregistrement résultat ── */}
      {modalTest && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'24px 16px' }} onClick={() => setModalTest(null)}>
          <div style={{ background:COULEURS.blanc, borderRadius:16, width:'90vw', height:'90vh', maxWidth:'98vw', maxHeight:'96vh', boxShadow:'0 24px 60px rgba(0,0,0,0.3)', display:'flex', flexDirection:'column', overflow:'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding:'28px 28px 0', flexShrink:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:14, marginBottom:4 }}>
                <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>📝 Résultat du test de niveau</div>
                <button
                  onClick={() => setModalResultat({ apprenantId: modalTest.id, apprenantNom: `${modalTest.prenom} ${modalTest.nom}` })}
                  style={{ background:COULEURS.gris50, color:COULEURS.navy, border:`1px solid ${COULEURS.gris200}`, borderRadius:7, padding:'7px 14px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', whiteSpace:'nowrap' }}
                >
                  📋 Voir le détail du test
                </button>
              </div>
              <div style={{ fontSize:13, color:COULEURS.gris400, marginBottom:20 }}>{modalTest.prenom} {modalTest.nom} · {modalTest.age} ans · {modalTest.entreprise}</div>
            </div>
            <div style={{ padding:'0 28px', flex:1, overflowY:'auto' }}>
              <div style={{ marginBottom:14 }}>
                <label style={lbl}>Niveau CECR attribué *</label>
                <select value={form.niveau} onChange={e => setForm(f => ({ ...f, niveau: e.target.value }))} style={inp}>
                  {NIVEAUX.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={lbl}>Durée du test (minutes)</label>
                <input type="number" min="10" max="120" value={form.duree} onChange={e => setForm(f => ({ ...f, duree: e.target.value }))} style={inp} />
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={lbl}>Observations / Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Ex : très bonne compréhension orale, difficultés à l'écrit…" style={{ ...inp, minHeight:80, resize:'vertical' }} />
              </div>
            </div>
            <div style={{ display:'flex', gap:10, padding:'16px 28px 28px', flexShrink:0 }}>
              <button onClick={() => setModalTest(null)} style={{ flex:1, padding:'10px 0', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, cursor:'pointer', fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>Annuler</button>
              <button onClick={enregistrerResultat} style={{ flex:2, padding:'10px 0', borderRadius:8, border:'none', background:COULEURS.succes, color:'#fff', fontWeight:700, cursor:'pointer', fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>✅ Confirmer le niveau → Assignation</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ENVOI GROUPÉ ══ */}
      {modalGroupé && (
        <ModalEnvoiGroupé
          apprenants={enAttente.filter(a => selection.has(a.id))}
          tests={tests}
          onFermer={() => setModalGroupé(false)}
          onConfirmer={(nb) => {
            setModalGroupé(false);
            setSelection(new Set());
            setFlash(`Lien de test envoyé à ${nb} apprenant${nb > 1 ? 's' : ''}.`);
            setTimeout(() => setFlash(null), 4000);
          }}
        />
      )}

      {modalResultat && (
        <ModalResultatsTest
          apprenantId={modalResultat.apprenantId}
          apprenantNom={modalResultat.apprenantNom}
          onFermer={() => setModalResultat(null)}
        />
      )}

      {/* ══ MODAL ENVOYER LE LIEN ══ */}
      {modalLien && (() => {
        const { apprenant, lien, testChoisi } = modalLien;
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'24px 16px' }} onClick={() => setModalLien(null)}>
            <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', height:'90vh', maxWidth:'98vw', maxHeight:'96vh', boxShadow:'0 32px 80px rgba(0,0,0,0.35)', display:'flex', flexDirection:'column', overflow:'hidden' }} onClick={e => e.stopPropagation()}>
              <div style={{ background:`linear-gradient(135deg, ${couleurTheme} 0%, ${couleurThemeFonce} 100%)`, padding:'22px 28px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexShrink:0 }}>
                <div>
                  <div style={{ fontSize:17, fontWeight:800, color:'#fff', marginBottom:4 }}>🔗 Lien de test de niveau</div>
                  <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)' }}>{apprenant.prenom} {apprenant.nom} · {apprenant.entreprise}</div>
                </div>
                <button onClick={() => setModalLien(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:30, height:30, cursor:'pointer', color:'#fff', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
              </div>
              <div style={{ padding:24, flex:1, overflowY:'auto' }}>
                {/* Sélecteur de test */}
                <div style={{ marginBottom:16 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:6 }}>Test à envoyer</label>
                  {tests.length === 0 ? (
                    <div style={{ padding:'12px 16px', borderRadius:9, background:'#FEF3C7', border:'1px solid #FDE68A', fontSize:13, color:'#92400E' }}>
                      ⚠️ Aucun test créé. <button onClick={() => { setModalLien(null); setTab('bibliotheque'); }} style={{ background:'none', border:'none', color:couleurTheme, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', fontSize:13 }}>Créer un test →</button>
                    </div>
                  ) : (
                    <select
                      value={modalLien.testId}
                      onChange={e => {
                        const t = tests.find(t => t.id === e.target.value);
                        if (t) setModalLien(m => ({ ...m, testId:t.id, testChoisi:t, lien:`${window.location.origin}/level-test/${t.id}?a=${apprenant.id}` }));
                      }}
                      style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, background:COULEURS.blanc }}
                    >
                      {tests.map(t => <option key={t.id} value={t.id}>{t.titre}{t.bet_level_questions?.[0]?.count ? ` - ${t.bet_level_questions[0].count} question(s)` : ''}</option>)}
                    </select>
                  )}
                </div>

                {/* Test sélectionné - aperçu */}
                {testChoisi && (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:16 }}>
                    {[
                      ['Format', { qcm:'📋 QCM', listening:'🎬 Listening', audio:'🎧 Audio', quiz:'🎯 Quiz', speaking:'🎤 Speaking' }[testChoisi.type] || testChoisi.type],
                      ['Niveau',  testChoisi.niveau],
                      ['Durée',   `${testChoisi.dureeMin} min`],
                    ].map(([l,v]) => (
                      <div key={l} style={{ background:COULEURS.gris50, borderRadius:8, padding:'10px 12px', border:`1px solid ${COULEURS.gris200}`, textAlign:'center' }}>
                        <div style={{ fontSize:10, color:COULEURS.gris400 }}>{l}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginTop:2 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Lien */}
                <div style={{ marginBottom:16 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:6 }}>Lien unique pour cet apprenant</label>
                  <div style={{ display:'flex', gap:8, alignItems:'center', background:COULEURS.gris50, borderRadius:9, border:`1px solid ${COULEURS.gris200}`, padding:'10px 12px' }}>
                    <span style={{ flex:1, fontSize:11, color:COULEURS.navy, wordBreak:'break-all', fontFamily:'monospace' }}>{lien}</span>
                    <button
                      onClick={() => { navigator.clipboard?.writeText(lien); setModalLien(m => ({ ...m, _copie: true })); setTimeout(() => setModalLien(m => m ? ({ ...m, _copie: false }) : m), 2000); }}
                      style={{ padding:'6px 12px', borderRadius:7, border:`1px solid ${modalLien._copie ? COULEURS.succes : COULEURS.gris200}`, background: modalLien._copie ? '#D1FAE5' : COULEURS.blanc, color: modalLien._copie ? '#065F46' : COULEURS.navy, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', flexShrink:0 }}
                    >
                      {modalLien._copie ? '✓ Copié' : '📋 Copier'}
                    </button>
                  </div>
                </div>

                {/* Email simulé */}
                <div style={{ background:`${couleurTheme}08`, border:`1px solid ${couleurTheme}25`, borderRadius:10, padding:'12px 16px', marginBottom:20, fontSize:12, color:COULEURS.navy, lineHeight:1.7 }}>
                  <strong>📧 Email envoyé à :</strong> {apprenant.emailApp || apprenant.emailParent || '-'}<br />
                  <span style={{ color:COULEURS.gris400 }}>Objet : Votre test de niveau BET - {testChoisi?.titre}</span>
                </div>
              </div>

              <div style={{ display:'flex', gap:10, padding:'16px 24px', borderTop:`1px solid ${COULEURS.gris200}`, flexShrink:0 }}>
                <button
                  onClick={() => { setModalLien(null); setFlash(`Lien envoyé à ${apprenant.prenom} ${apprenant.nom}`); setTimeout(() => setFlash(null), 3500); }}
                  style={{ flex:2, padding:'11px 0', borderRadius:9, border:'none', background:COULEURS.succes, color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}
                >
                  ✅ Confirmer l'envoi
                </button>
                <button onClick={() => setModalLien(null)} style={{ flex:1, padding:'11px 0', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                  Annuler
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ MODAL CRÉER TEST DE NIVEAU ══ */}
      {showCreate && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'24px 16px' }} onClick={() => { setShowCreate(false); setEditTestId(null); }}>
          <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', height:'90vh', maxWidth:'98vw', maxHeight:'96vh', boxShadow:'0 32px 80px rgba(0,0,0,0.35)', display:'flex', flexDirection:'column', overflow:'hidden' }} onClick={e => e.stopPropagation()}>

            {/* Header modal */}
            <div style={{ padding:'20px 24px', borderBottom:`1px solid ${COULEURS.gris100}`, display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <div style={{ fontSize:17, fontWeight:800, color:COULEURS.navy }}>
                {editTestId ? '✏️ Modifier le test de niveau' : '📝 Créer un test de niveau'}
              </div>
              <button onClick={() => { setShowCreate(false); setEditTestId(null); }} style={{ background:COULEURS.gris100, border:'none', borderRadius:8, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:18, color:COULEURS.gris600 }}>×</button>
            </div>

            <div style={{ padding:24, flex:1, overflowY:'auto' }}>

              {/* ── ÉTAPE 1 : Tranche cible (EN PREMIER) ── */}
              {(() => {
                const TRANCHES = [
                  { val:'enfant',     ic:'🧒', lib:'Enfants',     sub:'6 – 12 ans',   col:'#10B981' },
                  { val:'adolescent', ic:'🧑', lib:'Adolescents', sub:'13 – 17 ans',  col:'#8B5CF6' },
                  { val:'adulte',     ic:'👔', lib:'Adultes',     sub:'18 ans et +',  col:'#F59E0B' },
                  { val:'tous',       ic:'🌍', lib:'Mixte',       sub:'Toutes tranches', col:'#0891B2' },
                ];
                const tc = testForm.tranche_cible || 'tous';
                const trancheCfg = TRANCHES.find(t => t.val === tc) || TRANCHES[3];
                return (
                  <div style={{ marginBottom:20 }}>
                    <label style={lbl}>1. Tranche cible *</label>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
                      {TRANCHES.map(({ val, ic, lib, sub, col }) => {
                        const actif = tc === val;
                        return (
                          <button key={val} onClick={() => setTF(f => ({ ...f, tranche_cible:val, type: val==='enfant' && f.type==='speaking' ? 'qcm' : f.type, questions:[], ressourceUrl:'' }))} style={{ padding:'14px 10px', borderRadius:10, border:`2px solid ${actif ? col : COULEURS.gris200}`, background: actif ? `${col}12` : COULEURS.blanc, cursor:'pointer', textAlign:'center', transition:'all 0.15s', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                            <div style={{ fontSize:28, marginBottom:4 }}>{ic}</div>
                            <div style={{ fontSize:13, fontWeight:700, color: actif ? col : COULEURS.navy }}>{lib}</div>
                            <div style={{ fontSize:10, color: actif ? col : COULEURS.gris400, marginTop:2 }}>{sub}</div>
                          </button>
                        );
                      })}
                    </div>
                    {/* Bandeau info selon tranche */}
                    <div style={{ marginTop:10, padding:'8px 14px', borderRadius:8, background:`${trancheCfg.col}10`, border:`1px solid ${trancheCfg.col}30`, fontSize:12, color: trancheCfg.col, fontWeight:500 }}>
                      {{
                        enfant:     '🧒 Formats disponibles : QCM · Listening · Audio · Quiz (pas de Speaking - trop complexe pour les jeunes enfants). Niveaux : A1, A2. Durée max recommandée : 30 min.',
                        adolescent: '🧑 Tous les formats disponibles : QCM · Listening · Audio · Quiz · Speaking. Niveaux : A1 à B2. Durée : 15 – 60 min.',
                        adulte:     '👔 Tous les formats disponibles, y compris Speaking avancé. Niveaux A1 à C2. Format TOEIC possible. Durée : 15 – 180 min.',
                        tous:       '🌍 Tous les formats et niveaux disponibles - adapté pour des groupes mixtes ou non définis.',
                      }[tc]}
                    </div>
                  </div>
                );
              })()}

              {/* ── ÉTAPE 2 : Format du test (filtré selon tranche) ── */}
              {(() => {
                const tc = testForm.tranche_cible || 'tous';
                const FORMATS_TOUS = [
                  ['qcm',       '📋', 'QCM',       couleurTheme,   'Toutes tranches'],
                  ['listening', '🎬', 'Listening', '#F59E0B',       'Toutes tranches'],
                  ['audio',     '🎧', 'Audio',     '#10B981',       'Toutes tranches'],
                  ['quiz',      '🎯', 'Quiz',      '#8B5CF6',       'Toutes tranches'],
                  ['speaking',  '🎤', 'Speaking',  '#DC2626',       'Adolescents, Adultes, Mixte'],
                ];
                const formats = FORMATS_TOUS.filter(([v]) => {
                  if (v === 'speaking' && tc === 'enfant') return false;
                  return true;
                });
                return (
                  <div style={{ marginBottom:16 }}>
                    <label style={lbl}>2. Format du test *</label>
                    <div style={{ display:'grid', gridTemplateColumns:`repeat(${formats.length},1fr)`, gap:8 }}>
                      {formats.map(([v, ic, lb, col]) => (
                        <button key={v} onClick={() => setTF(f => ({ ...f, type:v, questions:[], ressourceUrl:'' }))} style={{ padding:'10px 6px', borderRadius:9, border:`2px solid ${testForm.type===v ? col : COULEURS.gris200}`, background: testForm.type===v ? `${col}12` : COULEURS.blanc, cursor:'pointer', textAlign:'center', transition:'all 0.12s' }}>
                          <div style={{ fontSize:22 }}>{ic}</div>
                          <div style={{ fontSize:11, fontWeight: testForm.type===v ? 700 : 400, color: testForm.type===v ? col : COULEURS.gris600, marginTop:4 }}>{lb}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ── ÉTAPE 3 : Titre, Niveau, Durée (adaptés selon tranche) ── */}
              {(() => {
                const tc = testForm.tranche_cible || 'tous';
                const NIV_MAP = {
                  enfant:     ['A1','A2'],
                  adolescent: ['A1','A2','B1','B2'],
                  adulte:     ['A1','A2','B1','B2','C1','C2'],
                  tous:       ['A1','A2','B1','B2','C1','C2'],
                };
                const DUR_MAP = { enfant:[10,30], adolescent:[15,60], adulte:[15,180], tous:[10,180] };
                const [minD, maxD] = DUR_MAP[tc] || [10,180];
                const niveauxDispo = NIV_MAP[tc] || NIV_OPTS;
                const placeholder = {
                  enfant:     'ex: Quiz anglais - Enfants débutants',
                  adolescent: 'ex: Test QCM A2/B1 - Adolescents',
                  adulte:     'ex: Test TOEIC Listening - Adultes B2',
                  tous:       'ex: Test de niveau - Débutants A1/A2',
                }[tc];
                return (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                    <div style={{ gridColumn:'1/-1' }}>
                      <label style={lbl}>3. Titre du test *</label>
                      <input type="text" value={testForm.titre} onChange={e => setTF(f => ({ ...f, titre:e.target.value }))} placeholder={placeholder} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Niveau CECR cible *</label>
                      <select value={niveauxDispo.includes(testForm.niveau) ? testForm.niveau : niveauxDispo[0]} onChange={e => setTF(f => ({ ...f, niveau:e.target.value }))} style={inp}>
                        {niveauxDispo.map(n => <option key={n}>{n}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Durée (min {minD} – max {maxD} min)</label>
                      <input type="number" min={minD} max={maxD} value={Math.min(Math.max(testForm.dureeMin, minD), maxD)} onChange={e => setTF(f => ({ ...f, dureeMin:Number(e.target.value) }))} style={inp} />
                    </div>
                  </div>
                );
              })()}

              {/* ── Encart spécifique Enfants ── */}
              {testForm.tranche_cible === 'enfant' && (
                <div style={{ marginBottom:16, borderRadius:12, overflow:'hidden', border:'1px solid #BBF7D0' }}>
                  <div style={{ background:'#D1FAE5', padding:'10px 16px', display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:18 }}>🧒</span>
                    <span style={{ fontWeight:700, fontSize:13, color:'#065F46' }}>Caractéristiques du test adaptatif Enfants</span>
                  </div>
                  <div style={{ background:'#F0FDF4', padding:'12px 16px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    {[
                      { ic:'📋', lib:'Format recommandé', val:'20 – 30 questions' },
                      { ic:'🧠', lib:'Catégories',        val:'Compréhension · Vocabulaire · Grammaire' },
                      { ic:'📊', lib:'Score automatique', val:'Calcul brut → niveau CECR provisoire (A1/A2)' },
                      { ic:'🎨', lib:'Interface',         val:'Visuelle et ludique, adaptée à l\'âge' },
                    ].map(({ ic, lib, val }) => (
                      <div key={lib} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                        <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>{ic}</span>
                        <div>
                          <div style={{ fontSize:10, fontWeight:700, color:'#15803D', textTransform:'uppercase', letterSpacing:'0.04em' }}>{lib}</div>
                          <div style={{ fontSize:12, color:'#065F46', marginTop:1 }}>{val}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background:'#ECFDF5', borderTop:'1px solid #BBF7D0', padding:'8px 16px', fontSize:11, color:'#059669' }}>
                    💡 Le nombre de questions optimal pour les enfants est de <strong>20 à 30</strong> - au-delà, la concentration diminue significativement.
                  </div>
                </div>
              )}

              {/* Section adaptative */}
              <div style={{ background:COULEURS.gris50, borderRadius:12, border:`1px solid ${COULEURS.gris200}`, padding:16, marginBottom:16 }}>

                {/* LISTENING / AUDIO - URL */}
                {(testForm.type==='listening' || testForm.type==='audio') && (
                  <div style={{ marginBottom:14 }}>
                    <label style={lbl}>{testForm.type==='listening' ? '🎬 URL de la vidéo' : '🎧 URL du fichier audio'}</label>
                    <input type="url" value={testForm.ressourceUrl} onChange={e => setTF(f => ({ ...f, ressourceUrl:e.target.value }))} placeholder="https://…" style={inp} />
                    {testForm.ressourceUrl && (
                      <div style={{ marginTop:6, padding:'8px 12px', borderRadius:8, background: testForm.type==='listening' ? '#FFFBEB' : '#ECFDF5', border:`1px solid ${testForm.type==='listening'?'#FDE68A':'#6EE7B7'}`, fontSize:12, color:'#374151' }}>
                        {testForm.type==='listening'?'🎬':'🎧'} Les apprenants {testForm.type==='listening'?'regarderont cette vidéo':'écouteront cet audio'} <strong>avant</strong> de répondre aux questions.
                      </div>
                    )}
                  </div>
                )}

                {/* QCM / LISTENING / AUDIO - Questions */}
                {(testForm.type==='qcm' || testForm.type==='listening' || testForm.type==='audio') && (
                  <>
                    <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:10 }}>Questions ({testForm.questions.length})</div>
                    {testForm.questions.map((q,qi) => (
                      <div key={q.id} style={{ padding:'8px 12px', borderRadius:8, background:'#F0FDF4', border:'1px solid #BBF7D0', marginBottom:6, fontSize:12, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                        <div><strong>Q{qi+1}.</strong> {q.texte} <span style={{ color:'#059669', marginLeft:8 }}>✓ {q.correct}</span></div>
                        <button onClick={() => setTF(f => ({ ...f, questions:f.questions.filter((_,i)=>i!==qi) }))} style={{ background:'none', border:'none', cursor:'pointer', color:'#EF4444', fontSize:14, flexShrink:0 }}>✕</button>
                      </div>
                    ))}
                    <div style={{ background:COULEURS.blanc, borderRadius:9, padding:14, border:`1px solid ${COULEURS.gris200}` }}>
                      <div style={{ fontSize:12, fontWeight:600, color:COULEURS.navy, marginBottom:8 }}>+ Ajouter une question</div>
                      <input value={qForm.texte} onChange={e => setQF(f => ({ ...f, texte:e.target.value }))} style={{ ...inp, marginBottom:8 }} placeholder="Texte de la question…" />
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:8 }}>
                        {[0,1,2,3].map(i => (
                          <input key={i} value={qForm.options[i]} onChange={e => { const o=[...qForm.options]; o[i]=e.target.value; setQF(f=>({...f,options:o})); }} style={{ ...inp, marginBottom:0 }} placeholder={`Option ${i+1}`} />
                        ))}
                      </div>
                      <select value={qForm.correct} onChange={e => setQF(f => ({ ...f, correct:e.target.value }))} style={{ ...inp, marginBottom:8 }}>
                        <option value="">- Sélectionner la bonne réponse -</option>
                        {qForm.options.filter(Boolean).map((o,i) => <option key={i} value={o}>{o}</option>)}
                      </select>
                      <button onClick={addQuestion} style={{ padding:'6px 14px', borderRadius:7, border:'none', background:COULEURS.succes, color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        + Ajouter cette question
                      </button>
                    </div>
                  </>
                )}

                {/* QUIZ */}
                {testForm.type === 'quiz' && (
                  <>
                    <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:10 }}>Questions du Quiz ({testForm.questions.length})</div>
                    {testForm.questions.map((q,qi) => (
                      <div key={q.id} style={{ padding:'8px 12px', borderRadius:8, background:'#FFFBEB', border:'1px solid #FDE68A', marginBottom:6, fontSize:12, display:'flex', justifyContent:'space-between' }}>
                        <div><strong>Q{qi+1}.</strong> {q.texte}</div>
                        <button onClick={() => setTF(f => ({ ...f, questions:f.questions.filter((_,i)=>i!==qi) }))} style={{ background:'none', border:'none', cursor:'pointer', color:'#EF4444', fontSize:14 }}>✕</button>
                      </div>
                    ))}
                    <div style={{ background:COULEURS.blanc, borderRadius:9, padding:14, border:`1px solid ${COULEURS.gris200}` }}>
                      <input value={qForm.texte} onChange={e => setQF(f => ({ ...f, texte:e.target.value }))} style={{ ...inp, marginBottom:8 }} placeholder="Question du quiz…" />
                      <button onClick={() => { if(!qForm.texte.trim()) return; setTF(f=>({...f,questions:[...f.questions,{id:Date.now(),...qForm}]})); setQF(QF0); }} style={{ padding:'6px 14px', borderRadius:7, border:'none', background:'#8B5CF6', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        + Ajouter
                      </button>
                    </div>
                  </>
                )}

                {/* SPEAKING */}
                {testForm.type === 'speaking' && (
                  <>
                    <div style={{ padding:'8px 12px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', fontSize:12, color:'#991B1B', marginBottom:12 }}>
                      🎤 Les apprenants enregistreront leur réponse orale. Vous recevrez les audios pour notation.
                    </div>
                    <div style={{ marginBottom:12 }}>
                      <label style={lbl}>Format de speaking</label>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                        {[['independant','💭','Opinion / Indépendant'],['integre_lecture','📖','Lecture + Expression'],['integre_audio','🎧','Audio + Expression']].map(([v,ic,lb]) => (
                          <button key={v} onClick={() => setTF(f=>({...f,speakType:v}))} style={{ padding:'8px 6px', borderRadius:8, border:`2px solid ${testForm.speakType===v?'#DC2626':COULEURS.gris200}`, background:testForm.speakType===v?'#FEF2F2':COULEURS.blanc, cursor:'pointer', textAlign:'center' }}>
                            <div style={{ fontSize:18 }}>{ic}</div>
                            <div style={{ fontSize:10, fontWeight:testForm.speakType===v?700:400, color:testForm.speakType===v?'#DC2626':COULEURS.gris600, marginTop:2 }}>{lb}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ marginBottom:10 }}>
                      <label style={lbl}>Consigne * (ce que l'apprenant devra exprimer)</label>
                      <textarea value={testForm.speakConsigne} onChange={e => setTF(f=>({...f,speakConsigne:e.target.value}))} placeholder="ex: Do you prefer working from home or in the office? Explain your choice with 2 reasons and an example." style={{ ...inp, minHeight:70, resize:'vertical' }} />
                    </div>
                    {testForm.speakType === 'integre_audio' && (
                      <div style={{ marginBottom:10 }}>
                        <label style={lbl}>🎧 URL de l'audio à écouter avant de répondre</label>
                        <input type="url" value={testForm.speakAudioUrl} onChange={e => setTF(f=>({...f,speakAudioUrl:e.target.value}))} placeholder="https://example.com/prompt.mp3" style={inp} />
                      </div>
                    )}
                    {testForm.speakType === 'integre_lecture' && (
                      <div style={{ marginBottom:10 }}>
                        <label style={lbl}>📖 Texte à lire avant de répondre</label>
                        <textarea value={testForm.speakTextePassage} onChange={e => setTF(f=>({...f,speakTextePassage:e.target.value}))} placeholder="Collez le passage que l'apprenant devra lire…" style={{ ...inp, minHeight:60, resize:'vertical' }} />
                      </div>
                    )}
                    <div style={{ marginBottom:10 }}>
                      <label style={lbl}>💡 Conseil pour l'apprenant (optionnel)</label>
                      <input type="text" value={testForm.speakTip} onChange={e => setTF(f=>({...f,speakTip:e.target.value}))} placeholder="ex: State preference → 2 reasons → example → conclude" style={inp} />
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                      <div>
                        <label style={lbl}>Niveau</label>
                        <select value={testForm.speakNiveau} onChange={e => setTF(f=>({...f,speakNiveau:e.target.value}))} style={inp}>
                          {['A1','A2','B1','B2','C1','C2'].map(n => <option key={n}>{n}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>⏱ Préparation (sec)</label>
                        <input type="number" min={10} max={120} value={testForm.speakPrepTime} onChange={e => setTF(f=>({...f,speakPrepTime:Number(e.target.value)}))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>🎙 Réponse max (sec)</label>
                        <input type="number" min={15} max={180} value={testForm.speakRecordTime} onChange={e => setTF(f=>({...f,speakRecordTime:Number(e.target.value)}))} style={inp} />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Options */}
              <div style={{ padding:'12px 16px', borderRadius:8, background:COULEURS.gris50, border:`1px solid ${COULEURS.gris200}`, display:'flex', flexWrap:'wrap', gap:16, marginBottom:20 }}>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer' }}>
                  <input type="checkbox" checked={testForm.notifierEleves} onChange={e => setTF(f=>({...f,notifierEleves:e.target.checked}))} />
                  <span>📣 Notifier les apprenants</span>
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer' }}>
                  <input type="checkbox" checked={testForm.notifierResponsable} onChange={e => setTF(f=>({...f,notifierResponsable:e.target.checked}))} />
                  <span>👤 Notifier le responsable pédagogique</span>
                </label>
              </div>

              {/* Actions */}
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={sauvegarderTest} disabled={!testForm.titre.trim()} style={{ flex:2, padding:'11px 0', borderRadius:9, border:'none', background: testForm.titre.trim() ? BET_CYAN : COULEURS.gris200, color: testForm.titre.trim() ? '#fff' : COULEURS.gris400, fontWeight:700, fontSize:13, cursor: testForm.titre.trim() ? 'pointer' : 'not-allowed', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                  {editTestId ? '✅ Enregistrer les modifications' : '✅ Créer le test'}
                </button>
                <button onClick={() => { setShowCreate(false); setEditTestId(null); }} style={{ flex:1, padding:'11px 0', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontWeight:500, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
