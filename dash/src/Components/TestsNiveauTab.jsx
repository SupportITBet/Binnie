// src/Components/TestsNiveauTab.jsx
// Gestion multi-tests de niveau - création, programmation, questions multi-format
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import CloudinaryUpload from "./CloudinaryUpload";
import { useConfirm } from "../contexts/ConfirmContext";
import { exporterExcelStyle } from "../utils/exporterExcel";
import { genererPDF, fmtDatePDF } from "../utils/genererPDF";

import { maxMoPour } from "../utils/uploadFichier";
const API_URL  = process.env.REACT_APP_API_URL || "http://localhost:5001";
const authHdrs = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
});

/* ── CONSTANTES ── */
const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const CEFR_META = {
  A1: { label:"Débutant",          color:"#6b7280", bg:"#f3f4f6", border:"#d1d5db" },
  A2: { label:"Élémentaire",       color:"#d97706", bg:"#fef3c7", border:"#fcd34d" },
  B1: { label:"Intermédiaire",     color:"#2563eb", bg:"#dbeafe", border:"#93c5fd" },
  B2: { label:"Interm. supérieur", color:"#7c3aed", bg:"#ede9fe", border:"#c4b5fd" },
  C1: { label:"Avancé",           color:"#059669", bg:"#d1fae5", border:"#6ee7b7" },
  C2: { label:"Maîtrise",         color:"#dc2626", bg:"#fee2e2", border:"#fca5a5" },
};
const CATEGORIES = ["Grammaire", "Vocabulaire", "Compréhension", "Listening", "Reading", "Speaking", "Orthographe", "Expression"];
const CAT_COLORS = {
  Grammaire:     { bg:"#dbeafe", c:"#1e40af" },
  Vocabulaire:   { bg:"#fef3c7", c:"#92400e" },
  Compréhension: { bg:"#dcfce7", c:"#166534" },
  Listening:     { bg:"#fce7f3", c:"#9d174d" },
  Reading:       { bg:"#e0f2fe", c:"#075985" },
  Speaking:      { bg:"#fff7ed", c:"#9a3412" },
  Orthographe:   { bg:"#ede9fe", c:"#5b21b6" },
  Expression:    { bg:"#fee2e2", c:"#991b1b" },
};
const TEST_TYPES = [
  { value:"qcm",      label:"QCM Général",     icon:"🎯", desc:"Questions à choix multiples (4 options)" },
  { value:"listening",label:"Listening",        icon:"🎧", desc:"Compréhension audio avec questions" },
  { value:"reading",  label:"Reading",          icon:"📖", desc:"Texte à lire + questions de compréhension" },
  { value:"mixed",    label:"Test mixte",       icon:"🔀", desc:"Combinaison de plusieurs formats" },
  { value:"speaking", label:"Speaking/Writing", icon:"🗣️", desc:"Production orale / écrite (correction manuelle)" },
];
const Q_TYPES = [
  { value:"qcm",        label:"QCM",             icon:"🎯", desc:"4 options, 1 bonne réponse" },
  { value:"vrai_faux",  label:"Vrai / Faux",     icon:"✅", desc:"2 options : Vrai ou Faux" },
  { value:"texte_trous",label:"Texte à trous",   icon:"✏️", desc:"Phrase avec un mot à compléter" },
  { value:"audio_qcm",  label:"Audio + QCM",     icon:"🎧", desc:"Fichier audio + questions à choix multiples" },
  { value:"lecture_qcm",label:"Lecture + QCM",   icon:"📖", desc:"Passage à lire + questions de compréhension" },
  { value:"libre",      label:"Question ouverte",icon:"💬", desc:"Réponse libre écrite (correction manuelle)" },
  { value:"speaking",   label:"Speaking",        icon:"🎙️", desc:"Audio à écouter + réponse vocale enregistrée" },
];

const DEFAULT_PARAMS = {
  timerEnabled: true, timerPerQ: 60, shuffleQ: false,
  maxQuestions: 10, passingPct: 50, sendEmail: true, contactAfter: true,
};

/* ── MICRO COMPOSANTS ── */
const CefrBadge = ({ cefr }) => {
  const m = CEFR_META[cefr] || CEFR_META.A1;
  return <span style={{ padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:800, background:m.bg, color:m.color, border:`1px solid ${m.border}` }}>{cefr}</span>;
};

const TogglePill = ({ on, onToggle, color="#0891b2" }) => (
  <div onClick={onToggle} style={{ width:44, height:24, borderRadius:12, background:on?color:"#cbd5e1", cursor:"pointer", position:"relative", transition:"background .2s", flexShrink:0 }}>
    <div style={{ position:"absolute", top:2, left:on?20:2, width:20, height:20, borderRadius:"50%", background:"#fff", transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
  </div>
);

const ScoreBar = ({ pct, compact }) => {
  const color = pct >= 75 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
  if (compact) return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ flex:1, height:6, background:"#e5e7eb", borderRadius:3, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${pct}%`, background:color, borderRadius:3 }} />
      </div>
      <span style={{ fontSize:12, fontWeight:700, color, minWidth:34 }}>{pct}%</span>
    </div>
  );
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ fontSize:11, color:"#9ca3af" }}>Score</span>
        <span style={{ fontSize:13, fontWeight:800, color }}>{pct}%</span>
      </div>
      <div style={{ height:8, background:"#e5e7eb", borderRadius:4, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${pct}%`, background:color, borderRadius:4, transition:"width 0.5s" }} />
      </div>
    </div>
  );
};

const Overlay = ({ onClose, children, wide, xl }) => (
  <div style={{ position:"fixed", top:0, left:0, width:"100%", height:"100%", background:"rgba(0,0,0,0.5)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:2000 }}>
    <div style={{ background:"#fff", borderRadius:14, padding:24, width:xl?"90vw":wide?740:520, maxWidth:xl?"90vw":"94vw", maxHeight:"90vh", overflowY:"auto" }}>
      {children}
    </div>
  </div>
);

const permBtnStyle = (style, allowed) => allowed ? style : { ...style, opacity:0.45, cursor:"not-allowed", filter:"grayscale(70%)" };
const permBtnTitle = (label, allowed) => allowed ? label : "🔒 Vous n'avez pas la permission pour cette action";

const OverlayHeader = ({ title, sub, onClose }) => (
  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
    <div>
      <h3 style={{ margin:0, fontSize:17, fontWeight:800 }}>{title}</h3>
      {sub && <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>{sub}</p>}
    </div>
    <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#9ca3af" }}>✕</button>
  </div>
);

/* ══════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
══════════════════════════════════════════════════════ */
export default function TestsNiveauTab({ peut = () => true, tabs = ["tests", "resultats", "statistiques"], initialTab }) {
  const confirm = useConfirm();
  const [view, setView]           = useState("tests");   // "tests" | "editTest"
  const [activeMain, setActiveMain] = useState(initialTab || tabs[0] || "tests"); // "tests" | "resultats" | "statistiques"

  /* ── Tests ── */
  const [tests, setTests]         = useState([]);
  const [loadingTests, setLT]     = useState(true);
  const [activeTestId, setATID]   = useState(null); // test ouvert en édition
  const [showTestModal, setSTM]   = useState(false);
  const [editingTest, setET]      = useState(null);
  const [testForm, setTF]         = useState({ titre:"", description:"", type:"qcm", programme_le:"", programme_jusqu_au:"", params:DEFAULT_PARAMS });

  /* ── Questions du test ouvert ── */
  const [questions, setQs]        = useState([]);
  const [loadingQs, setLQ]        = useState(false);
  const [showQModal, setQM]       = useState(false);
  const [editingQ, setEQ]         = useState(null);
  const [qForm, setQF]            = useState(defaultQForm("qcm"));
  const [filterCefr, setFC]       = useState("Tous");
  const [filterCat,  setFCat]     = useState("Tous");
  const [filterQType, setFQT]     = useState("Tous");

  /* ── Résultats ── */
  const [resultats, setRes]       = useState([]);
  const [loadingRes, setLR]       = useState(true);
  const [searchTerm, setST]       = useState("");
  const [filterScore, setFS]      = useState("Tous");
  const [filterCentre, setFCentre]= useState("Tous");
  const [sortField, setSF]        = useState("submitted_at");
  const [sortDir, setSD]          = useState("desc");
  const [showDetail, setShowD]    = useState(false);
  const [selectedRes, setSelR]    = useState(null);
  const [filterTestId, setFTID]   = useState("Tous");
  const [passingPct]              = useState(50);
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo,   setDateTo]     = useState("");
  const [resPage,  setResPage]    = useState(1);
  const RES_PER_PAGE = 10;

  function defaultQForm(type) {
    return { type, text:"", audio_url:"", image_url:"", passage:"", options:["","","",""], correct:"", category:"Grammaire", cefr:"A1", points:1, explanation:"", actif:true };
  }

  /* ── Chargement ── */
  const fetchTests = useCallback(async () => {
    try {
      setLT(true);
      const r = await fetch(`${API_URL}/api/level-tests`, { headers: authHdrs() });
      if (!r.ok) throw new Error();
      const { tests: list } = await r.json();
      setTests(list || []);
    } catch { toast.error("Impossible de charger les tests"); }
    finally { setLT(false); }
  }, []);

  const fetchQuestions = useCallback(async (testId) => {
    if (!testId) return;
    setLQ(true);
    try {
      const r = await fetch(`${API_URL}/api/level-tests/${testId}/questions`, { headers: authHdrs() });
      if (!r.ok) throw new Error();
      const { questions: list } = await r.json();
      setQs(list || []);
    } catch { toast.error("Impossible de charger les questions"); }
    finally { setLQ(false); }
  }, []);

  const fetchResults = useCallback(async () => {
    setLR(true);
    try {
      const r = await fetch(`${API_URL}/api/level-test/all`, { headers: authHdrs() });
      if (!r.ok) throw new Error();
      const { results } = await r.json();
      setRes(results || []);
    } catch {}
    finally { setLR(false); }
  }, []);

  useEffect(() => { fetchTests(); fetchResults(); }, [fetchTests, fetchResults]);

  /* ── Ouvrir l'éditeur d'un test ── */
  const openTestEditor = async (test) => {
    setATID(test.id);
    setView("editTest");
    await fetchQuestions(test.id);
  };

  /* ── CRUD tests ── */
  const openTestModal = (t = null) => {
    setET(t);
    setTF(t ? {
      titre: t.titre, description: t.description || "", type: t.type || "qcm",
      programme_le: t.programme_le ? t.programme_le.slice(0,16) : "",
      programme_jusqu_au: t.programme_jusqu_au ? t.programme_jusqu_au.slice(0,16) : "",
      params: t.params || DEFAULT_PARAMS,
    } : { titre:"", description:"", type:"qcm", programme_le:"", programme_jusqu_au:"", params:DEFAULT_PARAMS });
    setSTM(true);
  };

  const saveTest = async () => {
    if (!testForm.titre.trim()) { toast.error("Le titre est requis"); return; }
    const body = {
      titre: testForm.titre.trim(),
      description: testForm.description,
      type: testForm.type,
      params: testForm.params,
      programme_le: testForm.programme_le || null,
      programme_jusqu_au: testForm.programme_jusqu_au || null,
    };
    try {
      const url  = editingTest ? `${API_URL}/api/level-tests/${editingTest.id}` : `${API_URL}/api/level-tests`;
      const method = editingTest ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: authHdrs(), body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error); return; }
      toast.success(editingTest ? "Test modifié ✓" : "Test créé ✓");
      setSTM(false);
      fetchTests();
    } catch { toast.error("Erreur réseau"); }
  };

  const activerTest = async (id) => {
    try {
      const r = await fetch(`${API_URL}/api/level-tests/${id}/activer`, { method:"PATCH", headers: authHdrs() });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error); return; }
      toast.success("Test publié sur le site ✓");
      fetchTests();
    } catch { toast.error("Erreur réseau"); }
  };

  const desactiverTest = async (id) => {
    try {
      await fetch(`${API_URL}/api/level-tests/${id}/desactiver`, { method:"PATCH", headers: authHdrs() });
      toast.success("Test retiré du site");
      fetchTests();
    } catch {}
  };

  const dupliquerTest = async (id) => {
    try {
      const r = await fetch(`${API_URL}/api/level-tests/${id}/dupliquer`, { method:"POST", headers: authHdrs() });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error); return; }
      toast.success("Test dupliqué ✓");
      fetchTests();
    } catch { toast.error("Erreur réseau"); }
  };

  const supprimerTest = async (id) => {
    if (!(await confirm("Supprimer ce test et toutes ses questions ?", { titre: "Supprimer le test" }))) return;
    try {
      await fetch(`${API_URL}/api/level-tests/${id}`, { method:"DELETE", headers: authHdrs() });
      toast.success("Test supprimé");
      fetchTests();
    } catch {}
  };

  /* ── CRUD questions ── */
  const openQModal = (q = null) => {
    const currentTest = tests.find(t => t.id === activeTestId);
    const defaultType = currentTest?.type === "listening" ? "audio_qcm" : currentTest?.type === "reading" ? "lecture_qcm" : "qcm";
    setEQ(q);
    setQF(q ? { ...q, options: q.options || ["","","",""] } : defaultQForm(defaultType));
    setQM(true);
  };

  const saveQuestion = async () => {
    const { type, text, audio_url, passage, options, correct } = qForm;
    if (!text.trim() && !audio_url.trim() && !passage.trim()) { toast.error("Contenu de la question requis"); return; }
    if (["qcm","audio_qcm","lecture_qcm"].includes(type)) {
      if (options.some(o => !o.trim())) { toast.error("Remplissez toutes les options"); return; }
      if (!correct || !options.includes(correct)) { toast.error("Sélectionnez la bonne réponse"); return; }
    }
    if (type === "vrai_faux" && !correct) { toast.error("Sélectionnez Vrai ou Faux"); return; }
    try {
      const url = editingQ
        ? `${API_URL}/api/level-tests/${activeTestId}/questions/${editingQ.id}`
        : `${API_URL}/api/level-tests/${activeTestId}/questions`;
      const method = editingQ ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: authHdrs(), body: JSON.stringify(qForm) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error); return; }
      toast.success(editingQ ? "Question modifiée ✓" : "Question ajoutée ✓");
      setQM(false);
      fetchQuestions(activeTestId);
    } catch { toast.error("Erreur réseau"); }
  };

  const toggleQ = async (q) => {
    try {
      await fetch(`${API_URL}/api/level-tests/${activeTestId}/questions/${q.id}`, {
        method:"PATCH", headers: authHdrs(), body: JSON.stringify({ actif: !q.actif }),
      });
      fetchQuestions(activeTestId);
    } catch {}
  };

  const deleteQ = async (q) => {
    if (!(await confirm("Supprimer cette question ?", { titre: "Supprimer la question" }))) return;
    try {
      await fetch(`${API_URL}/api/level-tests/${activeTestId}/questions/${q.id}`, { method:"DELETE", headers: authHdrs() });
      toast.success("Question supprimée");
      fetchQuestions(activeTestId);
    } catch {}
  };

  /* ── Computed ── */
  const activeTest = tests.find(t => t.id === activeTestId);
  const activeCount = tests.filter(t => t.actif).length;

  const filteredQs = useMemo(() => questions.filter(q =>
    (filterCefr  === "Tous" || q.cefr === filterCefr) &&
    (filterCat   === "Tous" || q.category === filterCat) &&
    (filterQType === "Tous" || q.type === filterQType)
  ), [questions, filterCefr, filterCat, filterQType]);

  const normalise = (r) => ({
    ...r,
    nom:     r.fullname || r.nom || "-",
    cefr:    r.level || r.cefr || "A1",
    pct:     r.score != null ? Math.round(r.score) : (r.pct || 0),
    correct: r.correct_answers || r.correct || 0,
    total:   r.total_questions || r.total || 0,
    date:    r.submitted_at || r.date || "",
    duration:r.time_taken_seconds || r.duration || 0,
    profile: r.profile || "particulier",
  });

  const filteredRes = useMemo(() => {
    let rs = resultats.map(normalise);
    if (filterTestId !== "Tous") rs = rs.filter(r => r.test_id === filterTestId);
    if (filterScore === "Réussi") rs = rs.filter(r => r.pct >= passingPct);
    if (filterScore === "Échec")  rs = rs.filter(r => r.pct < passingPct);
    if (filterCentre !== "Tous") rs = rs.filter(r => r.centre_id === filterCentre);
    if (searchTerm) rs = rs.filter(r => (r.nom||"").toLowerCase().includes(searchTerm.toLowerCase()) || (r.email||"").toLowerCase().includes(searchTerm.toLowerCase()));
    if (dateFrom) rs = rs.filter(r => (r.date||"") >= dateFrom);
    if (dateTo)   rs = rs.filter(r => (r.date||"") <= dateTo+"T23:59:59");
    rs.sort((a, b) => {
      let va = a[sortField] || "", vb = b[sortField] || "";
      if (typeof va === "string") { va = va.toLowerCase(); vb = vb.toLowerCase(); }
      return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
    return rs;
  }, [resultats, filterTestId, filterScore, filterCentre, searchTerm, sortField, sortDir, passingPct, dateFrom, dateTo]);

  const resTotalPages = Math.max(1, Math.ceil(filteredRes.length / RES_PER_PAGE));
  const resSafePage = Math.min(resPage, resTotalPages);
  const filteredResPage = useMemo(() => filteredRes.slice((resSafePage-1)*RES_PER_PAGE, resSafePage*RES_PER_PAGE), [filteredRes, resSafePage]);

  const fmtDur  = (s) => `${Math.floor((s||0)/60)}min ${(s||0)%60}s`;
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" }) : "-";
  const fmtDt   = (d) => d ? new Date(d).toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "-";

  const SortIcon = ({ field }) => <span style={{ fontSize:10, color:"#9ca3af" }}>{sortField===field?(sortDir==="asc"?" ↑":" ↓"):" ↕"}</span>;

  /* ══════════════════════════════════════════════════════
     VUE : ÉDITEUR D'UN TEST
  ══════════════════════════════════════════════════════ */
  if (view === "editTest" && activeTest) {
    const qActives  = questions.filter(q => q.actif).length;
    const totalPts  = questions.reduce((s, q) => s + (q.points || 0), 0);
    const testMeta  = TEST_TYPES.find(t => t.value === activeTest.type) || TEST_TYPES[0];

    return (
      <div>
        {/* Back + header */}
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
          <button onClick={() => { setView("tests"); setATID(null); setQs([]); }} style={{ ...btnSecondary, display:"flex", alignItems:"center", gap:6 }}>
            ← Retour aux tests
          </button>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:22 }}>{testMeta.icon}</span>
              <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:"#0f172a" }}>{activeTest.titre}</h2>
              {activeTest.actif && <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:"#dcfce7", color:"#16a34a" }}>🟢 ACTIF sur le site</span>}
            </div>
            <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>
              {testMeta.label} · {questions.length} questions · {qActives} actives · {totalPts} pts
            </p>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button disabled={!peut("examens","update")} title={permBtnTitle("Modifier",peut("examens","update"))} onClick={() => openTestModal(activeTest)} style={permBtnStyle(btnSecondary,peut("examens","update"))}>✏️ Modifier</button>
            {activeTest.actif
              ? <button disabled={!peut("examens","update")} title={permBtnTitle("Retirer du site",peut("examens","update"))} onClick={() => desactiverTest(activeTest.id)} style={permBtnStyle({ ...btnSecondary, color:"#ef4444", borderColor:"#fecaca" },peut("examens","update"))}>⏸ Retirer du site</button>
              : <button disabled={!peut("examens","update")} title={permBtnTitle("Publier sur le site",peut("examens","update"))} onClick={() => activerTest(activeTest.id)} style={permBtnStyle(btnPrimary,peut("examens","update"))}>🟢 Publier sur le site</button>
            }
            <button disabled={!peut("examens","create")} title={permBtnTitle("Nouvelle question",peut("examens","create"))} onClick={() => openQModal()} style={permBtnStyle({ ...btnPrimary, background:"#059669" },peut("examens","create"))}>+ Nouvelle question</button>
          </div>
        </div>

        {/* Filtres questions */}
        <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
          {/* Type question */}
          <select value={filterQType} onChange={e => setFQT(e.target.value)} style={{ ...inputSt, marginBottom:0, width:"auto" }}>
            <option value="Tous">Tous les types</option>
            {Q_TYPES.map(qt => <option key={qt.value} value={qt.value}>{qt.icon} {qt.label}</option>)}
          </select>
          {/* CEFR */}
          <select value={filterCefr} onChange={e => setFC(e.target.value)} style={{ ...inputSt, marginBottom:0, width:"auto" }}>
            <option value="Tous">Tous niveaux</option>
            {CEFR_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {/* Catégorie */}
          <select value={filterCat} onChange={e => setFCat(e.target.value)} style={{ ...inputSt, marginBottom:0, width:"auto" }}>
            <option value="Tous">Toutes catégories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span style={{ marginLeft:"auto", fontSize:11, color:"#9ca3af" }}>{filteredQs.length} / {questions.length} affichées</span>
          <button onClick={() => fetchQuestions(activeTestId)} style={btnSecondary}>🔄</button>
        </div>

        {/* Minicartes CEFR */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:8, marginBottom:16 }}>
          {CEFR_LEVELS.map(lvl => {
            const m = CEFR_META[lvl];
            const cnt = questions.filter(q => q.cefr === lvl).length;
            const act = questions.filter(q => q.cefr === lvl && q.actif).length;
            const sel = filterCefr === lvl;
            return (
              <div key={lvl} onClick={() => setFC(sel?"Tous":lvl)}
                style={{ textAlign:"center", padding:"8px 4px", borderRadius:8, cursor:"pointer", background:sel?m.bg:"#f8fafc", border:`2px solid ${sel?m.border:"#e5e7eb"}`, transition:"all .15s" }}>
                <div style={{ fontSize:14, fontWeight:800, color:m.color }}>{lvl}</div>
                <div style={{ fontSize:17, fontWeight:900, color:m.color }}>{cnt}</div>
                <div style={{ fontSize:9, color:"#9ca3af" }}>{act} actives</div>
              </div>
            );
          })}
        </div>

        {/* Table questions */}
        {loadingQs ? (
          <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af" }}>Chargement…</div>
        ) : filteredQs.length === 0 ? (
          <div style={{ textAlign:"center", padding:"50px 0" }}>
            <div style={{ fontSize:42, marginBottom:12 }}>🧪</div>
            <p style={{ color:"#9ca3af", marginBottom:16 }}>Aucune question pour ce test</p>
            <button disabled={!peut("examens","create")} title={permBtnTitle("Ajouter la première question",peut("examens","create"))} onClick={() => openQModal()} style={permBtnStyle(btnPrimary,peut("examens","create"))}>+ Ajouter la première question</button>
          </div>
        ) : (
          <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,0.05)" }}>
            <table style={tbl}><thead><tr>
              <th style={th}>#</th>
              <th style={th}>Type</th>
              <th style={th}>Question / Contenu</th>
              <th style={th}>Catégorie</th>
              <th style={th}>Niveau</th>
              <th style={th}>Pts</th>
              <th style={th}>Statut</th>
              <th style={th}>Actions</th>
            </tr></thead><tbody>
              {filteredQs.map((q, idx) => {
                const qt = Q_TYPES.find(t => t.value === q.type) || Q_TYPES[0];
                const cc = CAT_COLORS[q.category] || { bg:"#f3f4f6", c:"#374151" };
                return (
                  <tr key={q.id} style={{ borderTop:"1px solid #f1f5f9" }}>
                    <td style={{ ...td, color:"#9ca3af", fontWeight:600, fontSize:12, width:36 }}>{idx+1}</td>
                    <td style={{ ...td, width:90 }}>
                      <span style={{ fontSize:12, display:"flex", alignItems:"center", gap:4, whiteSpace:"nowrap", color:"#4b5563", fontWeight:600 }}>
                        <span>{qt.icon}</span>{qt.label}
                      </span>
                    </td>
                    <td style={td}>
                      {q.passage && <div style={{ fontSize:11, color:"#9ca3af", marginBottom:4, fontStyle:"italic" }}>📖 Passage texte · {q.passage.slice(0,50)}…</div>}
                      {q.audio_url && <div style={{ fontSize:11, color:"#9d174d", marginBottom:4 }}>🎧 {q.audio_url.split("/").pop()}</div>}
                      <div style={{ fontWeight:500, fontSize:13, maxWidth:300, color:"#0f172a" }}>{q.text || "-"}</div>
                      {q.options?.length > 0 && q.type !== "libre" && (
                        <div style={{ display:"flex", gap:3, marginTop:4, flexWrap:"wrap" }}>
                          {q.options.map((opt, i) => (
                            <span key={i} style={{ fontSize:10, padding:"2px 6px", borderRadius:4, background:opt===q.correct?"#dcfce7":"#f3f4f6", color:opt===q.correct?"#166534":"#6b7280", fontWeight:opt===q.correct?700:400 }}>{opt}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={td}><span style={{ padding:"3px 8px", borderRadius:10, fontSize:11, background:cc.bg, color:cc.c }}>{q.category}</span></td>
                    <td style={td}><CefrBadge cefr={q.cefr} /></td>
                    <td style={{ ...td, fontWeight:800, color:"#f59e0b" }}>{q.points}pt</td>
                    <td style={td}>
                      <span style={{ padding:"3px 10px", borderRadius:14, fontSize:11, fontWeight:700, background:q.actif?"#dcfce7":"#fee2e2", color:q.actif?"#166534":"#991b1b" }}>
                        {q.actif?"Actif":"Inactif"}
                      </span>
                    </td>
                    <td style={td}>
                      <div style={{ display:"flex", gap:5 }}>
                        <button disabled={!peut("examens","update")} onClick={() => openQModal(q)} style={permBtnStyle(btnIconEdit,peut("examens","update"))} title={permBtnTitle("Modifier",peut("examens","update"))}>✏️</button>
                        <button disabled={!peut("examens","update")} onClick={() => toggleQ(q)} style={permBtnStyle(btnIconToggle,peut("examens","update"))} title={permBtnTitle(q.actif?"Désactiver":"Activer",peut("examens","update"))}>{q.actif?"🔴":"🟢"}</button>
                        <button disabled={!peut("examens","delete")} onClick={() => deleteQ(q)} style={permBtnStyle(btnIconDelete,peut("examens","delete"))} title={permBtnTitle("Supprimer",peut("examens","delete"))}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody></table>
          </div>
        )}

        {/* Modal question */}
        {showQModal && <QuestionModal
          qForm={qForm} setQF={setQF} editingQ={editingQ}
          onSave={saveQuestion} onClose={() => setQM(false)}
          testType={activeTest?.type} peut={peut}
        />}

        {/* Modal test edit */}
        {showTestModal && <TestModal
          testForm={testForm} setTF={setTF} editingTest={editingTest}
          onSave={saveTest} onClose={() => setSTM(false)} peut={peut}
        />}
      </div>
    );
  }

  /* ── Exports Statistiques ── */
  const statsScoreMoyen = resultats.length ? Math.round(resultats.reduce((s,r)=>s+Math.round(r.score||0),0)/resultats.length) : 0;
  const statsParNiveau = CEFR_LEVELS.map(lvl => ({ lvl, label:CEFR_META[lvl].label, count: resultats.map(normalise).filter(r=>r.cefr===lvl).length }));
  const statsTop5 = resultats.map(normalise).sort((a,b)=>b.pct-a.pct).slice(0,5);

  const exportStatsExcel = () => {
    exporterExcelStyle({
      nomFichier: `statistiques_tests_niveau_${new Date().toISOString().slice(0,10)}`,
      couleurEntete: '6366F1',
      feuilles: [
        {
          nom: "KPIs",
          titre: "Statistiques globales - Test de niveau",
          sousTitre: `Généré le ${new Date().toLocaleDateString('fr-FR')}`,
          colonnes: [{ label:"Indicateur", width:28, bold:true }, { label:"Valeur", width:16, align:"right" }],
          lignes: [
            ["Candidats total", resultats.length],
            ["Score moyen (%)", statsScoreMoyen],
            ["Tests créés", tests.length],
            ["Tests actifs", activeCount],
          ],
        },
        {
          nom: "Par niveau CECR",
          colonnes: [{ label:"Niveau", width:12 }, { label:"Libellé", width:22 }, { label:"Candidats", width:14, align:"right" }],
          lignes: statsParNiveau.map(s => [s.lvl, s.label, s.count]),
        },
        {
          nom: "Top 5",
          colonnes: [{ label:"Nom", width:24, bold:true }, { label:"Email", width:26 }, { label:"Niveau", width:12 }, { label:"Score (%)", width:14, align:"right" }],
          lignes: statsTop5.map(r => [r.nom, r.email||"", r.cefr, r.pct]),
        },
      ],
    });
    toast.success("Export Excel téléchargé");
  };

  const exportStatsPDF = () => {
    const ligneNiveau = statsParNiveau.map(s => `<tr><td>${s.lvl} - ${s.label}</td><td class="td-right">${s.count}</td></tr>`).join("");
    const ligneTop5 = statsTop5.map((r,i) => `<tr><td>${i+1}</td><td>${r.nom}</td><td>${r.email||"-"}</td><td>${r.cefr}</td><td class="td-right">${r.pct}%</td></tr>`).join("");
    genererPDF(`
      <div class="doc-header"><div><div class="doc-header-logo">BET - Test de niveau</div><div class="doc-header-sub">Statistiques globales</div></div><div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}</div></div>
      <div class="doc-title-band">📈 STATISTIQUES GLOBALES - TEST DE NIVEAU</div>
      <div class="doc-body">
        <div class="section-title">Indicateurs clés</div>
        <div class="kpi-row">
          <div class="kpi-card" style="border-top-color:#6366F1"><div class="kpi-val">${resultats.length}</div><div class="kpi-lbl">Candidats total</div></div>
          <div class="kpi-card" style="border-top-color:#2563EB"><div class="kpi-val">${statsScoreMoyen}%</div><div class="kpi-lbl">Score moyen</div></div>
          <div class="kpi-card" style="border-top-color:#059669"><div class="kpi-val">${tests.length}</div><div class="kpi-lbl">Tests créés</div></div>
          <div class="kpi-card" style="border-top-color:#F59E0B"><div class="kpi-val">${activeCount}</div><div class="kpi-lbl">Tests actifs</div></div>
        </div>
        <div class="section-title">Résultats par niveau CECR</div>
        <table><thead><tr><th>Niveau</th><th>Candidats</th></tr></thead><tbody>${ligneNiveau}</tbody></table>
        <div class="section-title">Top 5 - Meilleurs scores</div>
        <table><thead><tr><th>#</th><th>Nom</th><th>Email</th><th>Niveau</th><th>Score</th></tr></thead>
        <tbody>${ligneTop5 || '<tr><td colspan="5" style="text-align:center;color:#94A3B8">Aucun résultat</td></tr>'}</tbody></table>
        <div class="doc-footer"><span>BET · Statistiques Test de niveau</span><span>Émis le ${fmtDatePDF(new Date().toISOString())}</span></div>
      </div>
    `, "Statistiques - Test de niveau");
  };

  /* ══════════════════════════════════════════════════════
     VUE PRINCIPALE : LISTE TESTS + RÉSULTATS + STATS
  ══════════════════════════════════════════════════════ */
  const mainTabs = [
    { key:"tests",       label:"Bibliothèque de tests", icon:"📚", count:tests.length },
    { key:"resultats",   label:"Résultats candidats",   icon:"📋", count:resultats.length },
    { key:"statistiques",label:"Statistiques",          icon:"📈", count:null },
  ].filter(t => tabs.includes(t.key));

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:"#0f172a" }}>🧪 Tests de Niveau</h2>
          <p style={{ margin:"4px 0 0", color:"#6b7280", fontSize:13 }}>
            {tests.length} test(s) créé(s) · {activeCount} actif sur le site · {resultats.length} résultats
          </p>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={() => { fetchTests(); fetchResults(); }} style={btnSecondary}>🔄 Actualiser</button>
          <button disabled={!peut("examens","create")} title={permBtnTitle("Nouveau test",peut("examens","create"))} onClick={() => openTestModal()} style={permBtnStyle(btnPrimary,peut("examens","create"))}>+ Nouveau test</button>
        </div>
      </div>

      {/* MainTabs */}
      {mainTabs.length > 1 && (
      <div style={{ display:"flex", gap:3, flexWrap:"wrap", marginBottom:0 }}>
        {mainTabs.map(tab => {
          const active = activeMain === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveMain(tab.key)} style={{
              padding:"9px 16px", borderRadius:"8px 8px 0 0", border:"none", cursor:"pointer",
              fontWeight:600, fontSize:13, background:active?"#fff":"#e5e7eb", color:active?"#0891b2":"#6b7280",
              boxShadow:active?"0 -2px 6px rgba(0,0,0,0.06)":"none", display:"flex", alignItems:"center", gap:6,
            }}>
              {tab.icon} {tab.label}
              {tab.count !== null && <span style={{ padding:"1px 7px", borderRadius:10, fontSize:11, fontWeight:700, background:active?"#e0f2fe":"#d1d5db", color:active?"#0891b2":"#4b5563" }}>{tab.count}</span>}
            </button>
          );
        })}
      </div>
      )}

      <div style={{ background:"#fff", borderRadius: mainTabs.length > 1 ? "0 12px 12px 12px" : 12, padding:22, boxShadow:"0 2px 8px rgba(0,0,0,0.05)" }}>

        {/* ══════════ BIBLIOTHÈQUE DE TESTS ══════════ */}
        {activeMain === "tests" && (
          <div>
            {loadingTests ? (
              <div style={{ textAlign:"center", padding:"50px 0", color:"#9ca3af" }}>Chargement…</div>
            ) : tests.length === 0 ? (
              <div style={{ textAlign:"center", padding:"60px 0" }}>
                <div style={{ fontSize:50, marginBottom:14 }}>📭</div>
                <p style={{ color:"#9ca3af", fontSize:15, marginBottom:20 }}>Aucun test créé pour l'instant</p>
                <button disabled={!peut("examens","create")} title={permBtnTitle("Créer le premier test",peut("examens","create"))} onClick={() => openTestModal()} style={permBtnStyle(btnPrimary,peut("examens","create"))}>+ Créer le premier test</button>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))", gap:16 }}>
                {tests.map(t => {
                  const meta   = TEST_TYPES.find(tt => tt.value === t.type) || TEST_TYPES[0];
                  const qCount = t.level_questions?.[0]?.count || 0;
                  const isProgrammed = t.programme_le && new Date(t.programme_le) > new Date();
                  return (
                    <div key={t.id} style={{ borderRadius:14, border:`2px solid ${t.actif?"#86efac":"#e5e7eb"}`, background:t.actif?"#f0fdf4":"#fff", padding:18, position:"relative", transition:"box-shadow .2s" }}>
                      {t.actif && (
                        <div style={{ position:"absolute", top:12, right:12, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:"#22c55e", color:"#fff" }}>
                          🟢 ACTIF
                        </div>
                      )}
                      {isProgrammed && !t.actif && (
                        <div style={{ position:"absolute", top:12, right:12, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:"#fef3c7", color:"#92400e" }}>
                          ⏰ PROGRAMMÉ
                        </div>
                      )}

                      <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:12 }}>
                        <div style={{ width:46, height:46, borderRadius:12, background:"#e0f2fe", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0 }}>
                          {meta.icon}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <h3 style={{ margin:0, fontSize:15, fontWeight:800, color:"#0f172a", lineHeight:1.3 }}>{t.titre}</h3>
                          <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>{meta.label}</div>
                        </div>
                      </div>

                      {t.description && <p style={{ fontSize:12, color:"#6b7280", marginBottom:12, lineHeight:1.5 }}>{t.description}</p>}

                      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
                        <span style={{ fontSize:11, padding:"3px 8px", borderRadius:8, background:"#f1f5f9", color:"#475569" }}>
                          🧪 {qCount} question(s)
                        </span>
                        {t.programme_le && (
                          <span style={{ fontSize:11, padding:"3px 8px", borderRadius:8, background:"#fef9c3", color:"#854d0e" }}>
                            📅 Dès le {fmtDt(t.programme_le)}
                          </span>
                        )}
                        {t.programme_jusqu_au && (
                          <span style={{ fontSize:11, padding:"3px 8px", borderRadius:8, background:"#fee2e2", color:"#991b1b" }}>
                            🔚 Jusqu'au {fmtDt(t.programme_jusqu_au)}
                          </span>
                        )}
                        {t.params?.timerEnabled && (
                          <span style={{ fontSize:11, padding:"3px 8px", borderRadius:8, background:"#f3e8ff", color:"#6b21a8" }}>
                            ⏱ {t.params.timerPerQ}s/question
                          </span>
                        )}
                      </div>

                      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                        <button onClick={() => openTestEditor(t)} style={{ ...btnPrimary, padding:"7px 14px", fontSize:12, flex:1 }}>
                          ✏️ Gérer les questions
                        </button>
                        {t.actif
                          ? <button disabled={!peut("examens","update")} onClick={() => desactiverTest(t.id)} style={permBtnStyle({ ...btnSecondary, padding:"7px 14px", fontSize:12, color:"#dc2626" },peut("examens","update"))} title={permBtnTitle("Retirer",peut("examens","update"))}>⏸ Retirer</button>
                          : <button disabled={!peut("examens","update")} onClick={() => activerTest(t.id)} style={permBtnStyle({ ...btnSecondary, padding:"7px 14px", fontSize:12, color:"#16a34a", fontWeight:700 },peut("examens","update"))} title={permBtnTitle("Publier",peut("examens","update"))}>🟢 Publier</button>
                        }
                        <button disabled={!peut("examens","update")} onClick={() => openTestModal(t)} style={permBtnStyle({ ...btnIconEdit, padding:"7px 10px" },peut("examens","update"))} title={permBtnTitle("Modifier",peut("examens","update"))}>✏️</button>
                        <button disabled={!peut("examens","create")} onClick={() => dupliquerTest(t.id)} style={permBtnStyle({ ...btnIconToggle, padding:"7px 10px" },peut("examens","create"))} title={permBtnTitle("Dupliquer",peut("examens","create"))}>📋</button>
                        <button disabled={!peut("examens","delete")} onClick={() => supprimerTest(t.id)} style={permBtnStyle({ ...btnIconDelete, padding:"7px 10px" },peut("examens","delete"))} title={permBtnTitle("Supprimer",peut("examens","delete"))}>🗑️</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════ RÉSULTATS ══════════ */}
        {activeMain === "resultats" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
              <div>
                <h3 style={ttl}>Résultats des candidats</h3>
                <p style={sub}>{resultats.length} résultats · {filteredRes.length} affichés</p>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={fetchResults} style={btnSecondary}>🔄</button>
                <button onClick={() => {
                  exporterExcelStyle({
                    nomFichier: `resultats_tests_niveau_${new Date().toISOString().slice(0,10)}`,
                    titre: '📋 Résultats des candidats - Test de niveau',
                    sousTitre: `${filteredRes.length} résultat${filteredRes.length>1?'s':''} · Généré le ${new Date().toLocaleDateString('fr-FR')}`,
                    couleurEntete: '6366F1',
                    colonnes: [
                      { label: 'Nom', width: 24, bold: true }, { label: 'Email', width: 26 },
                      { label: 'Téléphone', width: 18 }, { label: 'Profil', width: 14 },
                      { label: 'Niveau', width: 12, align: 'center' }, { label: 'Score', width: 12, align: 'center' },
                      { label: 'Réponses', width: 14, align: 'center' }, { label: 'Date', width: 16 },
                    ],
                    lignes: filteredRes.map(r => [r.nom, r.email||"", r.phone||"", r.profile, r.cefr, `${r.pct}%`, `${r.correct}/${r.total}`, fmtDate(r.date)]),
                  });
                  toast.success("Export Excel téléchargé");
                }} style={btnSecondary}>⬇️ Excel</button>
              </div>
            </div>

            <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
              <input type="text" placeholder="🔍 Rechercher…" value={searchTerm} onChange={e => { setST(e.target.value); setResPage(1); }} style={{ ...inputSt, marginBottom:0, width:220 }} />
              <select value={filterTestId} onChange={e => { setFTID(e.target.value); setResPage(1); }} style={{ ...inputSt, marginBottom:0, width:"auto" }}>
                <option value="Tous">Tous les tests</option>
                {tests.map(t => <option key={t.id} value={t.id}>{t.titre}</option>)}
              </select>
              <select value={filterScore} onChange={e => { setFS(e.target.value); setResPage(1); }} style={{ ...inputSt, marginBottom:0, width:"auto" }}>
                <option value="Tous">Tous scores</option>
                <option value="Réussi">✅ Réussis (≥{passingPct}%)</option>
                <option value="Échec">❌ Sous le seuil</option>
              </select>
              <select value={filterCentre} onChange={e => { setFCentre(e.target.value); setResPage(1); }} style={{ ...inputSt, marginBottom:0, width:"auto" }}>
                <option value="Tous">Tous les centres</option>
                <option value="angre">Angré</option>
                <option value="2plateaux">II Plateaux</option>
                <option value="yopougon">Yopougon</option>
                <option value="koumassi">Koumassi</option>
                <option value="abatta">Abatta</option>
                <option value="bouake">Bouaké</option>
              </select>
              <label style={{ fontSize:12, color:"#6b7280", display:"flex", alignItems:"center", gap:4 }}>Du
                <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setResPage(1); }} style={{ ...inputSt, marginBottom:0 }} />
              </label>
              <label style={{ fontSize:12, color:"#6b7280", display:"flex", alignItems:"center", gap:4 }}>Au
                <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setResPage(1); }} style={{ ...inputSt, marginBottom:0 }} />
              </label>
              {(filterTestId!=="Tous"||filterScore!=="Tous"||filterCentre!=="Tous"||searchTerm||dateFrom||dateTo) &&
                <button onClick={() => { setFTID("Tous"); setFS("Tous"); setFCentre("Tous"); setST(""); setDateFrom(""); setDateTo(""); setResPage(1); }} style={{ ...btnSecondary, padding:"7px 12px", fontSize:11 }}>✕ Reset</button>}
            </div>

            {loadingRes ? (
              <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af" }}>Chargement…</div>
            ) : filteredRes.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px 0" }}>
                <div style={{ fontSize:36, marginBottom:10 }}>📋</div>
                <p style={{ color:"#9ca3af" }}>Aucun résultat</p>
              </div>
            ) : (
              <div style={{ overflowX:"auto" }}>
                <table style={tbl}><thead><tr>
                  <th style={th}>Candidat</th>
                  <th style={th}>Niveau</th>
                  <th style={{ ...th, cursor:"pointer", minWidth:150 }} onClick={() => { setSF("pct"); setSD(d=>d==="asc"?"desc":"asc"); }}>Score<SortIcon field="pct"/></th>
                  <th style={th}>Réponses</th>
                  <th style={{ ...th, cursor:"pointer" }} onClick={() => { setSF("date"); setSD(d=>d==="asc"?"desc":"asc"); }}>Date<SortIcon field="date"/></th>
                  <th style={th}>Durée</th>
                  <th style={th}>Action</th>
                </tr></thead><tbody>
                  {filteredResPage.map((r, i) => (
                    <tr key={i} style={{ borderTop:"1px solid #f1f5f9" }}>
                      <td style={td}>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div style={avatarSt}>{(r.nom||"?").slice(0,2).toUpperCase()}</div>
                          <div>
                            <div style={{ fontWeight:600, fontSize:13 }}>{r.nom}</div>
                            <div style={{ fontSize:11, color:"#9ca3af" }}>{r.email||""}</div>
                          </div>
                        </div>
                      </td>
                      <td style={td}><CefrBadge cefr={r.cefr} /></td>
                      <td style={{ ...td, minWidth:150 }}><ScoreBar pct={r.pct} compact /></td>
                      <td style={{ ...td, fontSize:13, fontWeight:600 }}>
                        <span style={{ color:r.correct/Math.max(1,r.total)>=0.6?"#22c55e":"#ef4444" }}>{r.correct}/{r.total}</span>
                      </td>
                      <td style={{ ...td, fontSize:12, color:"#6b7280" }}>{fmtDate(r.date)}</td>
                      <td style={{ ...td, fontSize:12, color:"#6b7280" }}>{fmtDur(r.duration)}</td>
                      <td style={td}>
                        <button onClick={() => { setSelR(r); setShowD(true); }} style={{ ...btnIconEdit, padding:"5px 10px", fontSize:11 }}>🔍 Détail</button>
                      </td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            )}
            {resTotalPages > 1 && (
              <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:6, marginTop:14 }}>
                <button onClick={()=>setResPage(p=>Math.max(1,p-1))} disabled={resSafePage===1}
                  style={{ padding:"4px 12px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", cursor:resSafePage===1?"default":"pointer", color:resSafePage===1?"#d1d5db":"#374151", fontWeight:700, fontSize:12 }}>‹</button>
                {Array.from({length:resTotalPages},(_,i)=>(
                  <button key={i} onClick={()=>setResPage(i+1)}
                    style={{ padding:"4px 10px", borderRadius:7, border:`1.5px solid ${i+1===resSafePage?"#6366f1":"#e2e8f0"}`, background:i+1===resSafePage?"#6366f118":"#fff", color:i+1===resSafePage?"#6366f1":"#374151", fontWeight:700, fontSize:12, cursor:"pointer" }}>{i+1}</button>
                ))}
                <button onClick={()=>setResPage(p=>Math.min(resTotalPages,p+1))} disabled={resSafePage===resTotalPages}
                  style={{ padding:"4px 12px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", cursor:resSafePage===resTotalPages?"default":"pointer", color:resSafePage===resTotalPages?"#d1d5db":"#374151", fontWeight:700, fontSize:12 }}>›</button>
              </div>
            )}
          </div>
        )}

        {/* ══════════ STATISTIQUES ══════════ */}
        {activeMain === "statistiques" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
              <div><h3 style={ttl}>Statistiques globales</h3><p style={sub}>Performance des candidats sur tous les tests</p></div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={exportStatsExcel} style={btnSecondary}>⬇️ Excel</button>
                <button onClick={exportStatsPDF} style={btnSecondary}>📄 PDF</button>
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(155px,1fr))", gap:12, marginBottom:24 }}>
              {[
                { label:"Candidats total",  value:resultats.length,    color:"#6366f1", icon:"👥" },
                { label:"Score moyen",      value:`${resultats.length ? Math.round(resultats.reduce((s,r)=>s+Math.round(r.score||0),0)/resultats.length) : 0}%`, color:"#2563eb", icon:"📊" },
                { label:"Tests créés",      value:tests.length,         color:"#059669", icon:"🧪" },
                { label:"Tests actifs",     value:activeCount,          color:"#f59e0b", icon:"🟢" },
              ].map(s => (
                <div key={s.label} style={{ background:"#fff", padding:14, borderRadius:12, border:"1px solid #f1f5f9", display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:42, height:42, borderRadius:10, background:s.color+"1a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{s.icon}</div>
                  <div>
                    <div style={{ fontSize:11, color:"#9ca3af" }}>{s.label}</div>
                    <div style={{ fontSize:20, fontWeight:800, color:s.color }}>{s.value}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
              <div style={panel}>
                <h4 style={panelTitle}>Résultats par niveau CECRL</h4>
                {CEFR_LEVELS.map(lvl => {
                  const m = CEFR_META[lvl];
                  const cnt = resultats.map(normalise).filter(r => r.cefr === lvl).length;
                  return <div key={lvl} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:13 }}><strong style={{ color:m.color }}>{lvl}</strong> - {m.label}</span>
                      <span style={{ fontSize:12, color:"#6b7280" }}>{cnt} candidat(s)</span>
                    </div>
                    <div style={{ height:7, background:"#f1f5f9", borderRadius:4, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${resultats.length ? (cnt/resultats.length)*100 : 0}%`, background:m.color, borderRadius:4 }} />
                    </div>
                  </div>;
                })}
              </div>

              <div style={panel}>
                <h4 style={panelTitle}>Top 5 - Meilleurs scores</h4>
                {resultats.map(normalise).sort((a,b)=>b.pct-a.pct).slice(0,5).map((r, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10, padding:"8px 10px", borderRadius:8, background:"#fff", border:"1px solid #e5e7eb" }}>
                    <span style={{ fontSize:18 }}>{["🥇","🥈","🥉","4️⃣","5️⃣"][i]}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:13 }}>{r.nom}</div>
                      <div style={{ fontSize:11, color:"#9ca3af" }}>{r.email||""}</div>
                    </div>
                    <CefrBadge cefr={r.cefr} />
                    <span style={{ fontWeight:800, color:"#22c55e", fontSize:14 }}>{r.pct}%</span>
                  </div>
                ))}
                {resultats.length === 0 && <p style={{ color:"#9ca3af", fontSize:13 }}>Aucun résultat</p>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Détail résultat */}
      {showDetail && selectedRes && (
        <Overlay onClose={() => setShowD(false)} wide>
          <OverlayHeader title="Détail du candidat" sub={`Test passé le ${fmtDate(selectedRes.date)}`} onClose={() => setShowD(false)} />
          <div style={{ display:"flex", alignItems:"center", gap:16, padding:"12px 0 16px", borderBottom:"1px solid #e5e7eb", marginBottom:16 }}>
            <div style={{ ...avatarSt, width:52, height:52, fontSize:16, borderRadius:"50%" }}>{(selectedRes.nom||"?").slice(0,2).toUpperCase()}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:17, fontWeight:800 }}>{selectedRes.nom}</div>
              <div style={{ fontSize:12, color:"#6b7280" }}>{selectedRes.email||""} {selectedRes.phone?`· ${selectedRes.phone}`:""}</div>
            </div>
            <div style={{ textAlign:"center", padding:"10px 18px", borderRadius:12, background:CEFR_META[selectedRes.cefr]?.bg||"#f3f4f6", border:`2px solid ${CEFR_META[selectedRes.cefr]?.border||"#e5e7eb"}` }}>
              <div style={{ fontSize:10, color:CEFR_META[selectedRes.cefr]?.color, fontWeight:600 }}>NIVEAU</div>
              <div style={{ fontSize:26, fontWeight:900, color:CEFR_META[selectedRes.cefr]?.color }}>{selectedRes.cefr}</div>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
            {[
              { l:"Score",    v:`${selectedRes.pct}%`,               color:selectedRes.pct>=passingPct?"#22c55e":"#ef4444" },
              { l:"Réponses", v:`${selectedRes.correct}/${selectedRes.total}`, color:"#2563eb" },
              { l:"Durée",    v:fmtDur(selectedRes.duration),        color:"#f59e0b" },
              { l:"Date",     v:fmtDate(selectedRes.date),           color:"#8b5cf6" },
            ].map(s => (
              <div key={s.l} style={{ textAlign:"center", padding:12, borderRadius:10, background:"#f8fafc" }}>
                <div style={{ fontSize:11, color:"#9ca3af" }}>{s.l}</div>
                <div style={{ fontSize:16, fontWeight:800, color:s.color }}>{s.v}</div>
              </div>
            ))}
          </div>
          <ScoreBar pct={selectedRes.pct} />
          {/* Enregistrements Speaking */}
          {selectedRes.audio_answers && Object.keys(selectedRes.audio_answers).length > 0 && (
            <>
              <h4 style={{ fontSize:14, fontWeight:700, color:"#0f172a", margin:"18px 0 10px" }}>🎙️ Réponses vocales (Speaking)</h4>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {Object.entries(selectedRes.audio_answers).map(([qId, url], i) => url && (
                  <div key={qId} style={{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:10, padding:"10px 14px" }}>
                    <p style={{ margin:"0 0 6px", fontSize:12, color:"#166534", fontWeight:600 }}>🎙️ Enregistrement {i+1}</p>
                    <audio controls src={url} crossOrigin="anonymous" style={{ width:"100%", borderRadius:8 }} />
                  </div>
                ))}
              </div>
            </>
          )}

          {selectedRes.by_category && Object.keys(selectedRes.by_category).length > 0 && (
            <>
              <h4 style={{ fontSize:14, fontWeight:700, color:"#0f172a", margin:"18px 0 10px" }}>Performance par catégorie</h4>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {Object.entries(selectedRes.by_category).map(([cat, val]) => {
                  const cc = CAT_COLORS[cat] || { bg:"#f3f4f6", c:"#374151" };
                  const pct = typeof val === "object" ? Math.round((val.correct/Math.max(1,val.total))*100) : val;
                  return <div key={cat} style={{ padding:"8px 14px", borderRadius:10, background:cc.bg, color:cc.c, fontSize:12, fontWeight:700 }}>{cat}: {pct}%</div>;
                })}
              </div>
            </>
          )}
          <div style={{ display:"flex", gap:10, marginTop:16 }}>
            {selectedRes.email && (
              <button onClick={() => {
                const body = encodeURIComponent(`Bonjour ${selectedRes.nom},\n\nVotre niveau d'anglais : ${selectedRes.cefr}.\nScore : ${selectedRes.pct}%.\n\nNous vous proposons un bilan personnalisé gratuit.`);
                window.location.href = `mailto:${selectedRes.email}?subject=Votre résultat test anglais&body=${body}`;
              }} style={btnPrimary}>📧 Envoyer par email</button>
            )}
            <button onClick={() => setShowD(false)} style={btnSecondary}>Fermer</button>
          </div>
        </Overlay>
      )}

      {/* Modal création/édition test */}
      {showTestModal && <TestModal
        testForm={testForm} setTF={setTF} editingTest={editingTest}
        onSave={saveTest} onClose={() => setSTM(false)} peut={peut}
      />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MODAL TEST (création / édition)
══════════════════════════════════════════════════════ */
function TestModal({ testForm, setTF, editingTest, onSave, onClose, peut = () => true }) {
  const canSave = peut("examens", editingTest ? "update" : "create");
  const p = testForm.params || {};
  const setP = (updates) => setTF(f => ({ ...f, params: { ...f.params, ...updates } }));

  return (
    <Overlay onClose={onClose} wide>
      <OverlayHeader
        title={editingTest ? "Modifier le test" : "Nouveau test de niveau"}
        sub="Configurez le format, la programmation et les paramètres"
        onClose={onClose}
      />

      <label style={labelSt}>Titre du test *</label>
      <input value={testForm.titre} onChange={e => setTF(f => ({ ...f, titre:e.target.value }))}
        placeholder="ex: Test Standard Janvier 2026" style={inputSt} />

      <label style={labelSt}>Description</label>
      <textarea value={testForm.description} onChange={e => setTF(f => ({ ...f, description:e.target.value }))}
        placeholder="Décrivez ce test, son objectif, son public cible…" rows={2} style={{ ...inputSt, resize:"vertical" }} />

      <label style={labelSt}>Format du test</label>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
        {TEST_TYPES.map(t => (
          <div key={t.value} onClick={() => setTF(f => ({ ...f, type:t.value }))}
            style={{ padding:"10px 12px", borderRadius:10, border:`2px solid ${testForm.type===t.value?"#0891b2":"#e5e7eb"}`, background:testForm.type===t.value?"#e0f2fe":"#fff", cursor:"pointer", transition:"all .15s" }}>
            <div style={{ fontSize:20, marginBottom:4 }}>{t.icon}</div>
            <div style={{ fontSize:13, fontWeight:700, color:testForm.type===t.value?"#0891b2":"#0f172a" }}>{t.label}</div>
            <div style={{ fontSize:11, color:"#9ca3af" }}>{t.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:4 }}>
        <div>
          <label style={labelSt}>📅 Programmé le (optionnel)</label>
          <input type="datetime-local" value={testForm.programme_le}
            onChange={e => setTF(f => ({ ...f, programme_le:e.target.value }))} style={inputSt} />
        </div>
        <div>
          <label style={labelSt}>🔚 Actif jusqu'au (optionnel)</label>
          <input type="datetime-local" value={testForm.programme_jusqu_au}
            onChange={e => setTF(f => ({ ...f, programme_jusqu_au:e.target.value }))} style={inputSt} />
        </div>
      </div>

      <div style={{ background:"#f8fafc", borderRadius:10, padding:16, marginBottom:16 }}>
        <h4 style={{ margin:"0 0 14px", fontSize:14, fontWeight:700, color:"#0f172a" }}>⚙️ Paramètres du test</h4>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <div>
            <label style={{ ...labelSt, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span>Chronomètre par question</span>
              <TogglePill on={p.timerEnabled} onToggle={() => setP({ timerEnabled:!p.timerEnabled })} />
            </label>
            {p.timerEnabled && (
              <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:8 }}>
                <input type="range" min={15} max={180} step={15} value={p.timerPerQ||60}
                  onChange={e => setP({ timerPerQ:Number(e.target.value) })} style={{ flex:1 }} />
                <span style={{ fontWeight:800, color:"#6366f1", minWidth:40 }}>{p.timerPerQ||60}s</span>
              </div>
            )}
          </div>
          <div>
            <label style={labelSt}>Nb max de questions</label>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <input type="range" min={5} max={50} step={1} value={p.maxQuestions||10}
                onChange={e => setP({ maxQuestions:Number(e.target.value) })} style={{ flex:1 }} />
              <span style={{ fontWeight:800, color:"#6366f1", minWidth:30 }}>{p.maxQuestions||10}</span>
            </div>
          </div>
          <div>
            <label style={labelSt}>Seuil de réussite</label>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <input type="range" min={20} max={90} step={5} value={p.passingPct||50}
                onChange={e => setP({ passingPct:Number(e.target.value) })} style={{ flex:1 }} />
              <span style={{ fontWeight:800, color:"#f59e0b", minWidth:40 }}>{p.passingPct||50}%</span>
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <label style={{ ...labelSt, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span>Mélanger les questions</span>
              <TogglePill on={p.shuffleQ} onToggle={() => setP({ shuffleQ:!p.shuffleQ })} />
            </label>
            <label style={{ ...labelSt, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span>Envoyer résultats par email</span>
              <TogglePill on={p.sendEmail} onToggle={() => setP({ sendEmail:!p.sendEmail })} />
            </label>
            <label style={{ ...labelSt, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span>Proposer contact commercial</span>
              <TogglePill on={p.contactAfter} onToggle={() => setP({ contactAfter:!p.contactAfter })} />
            </label>
          </div>
        </div>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button disabled={!canSave} title={permBtnTitle(editingTest ? "Enregistrer les modifications" : "Créer le test",canSave)} onClick={onSave} style={permBtnStyle(btnPrimary,canSave)}>{editingTest ? "Enregistrer les modifications" : "Créer le test"}</button>
        <button onClick={onClose} style={btnSecondary}>Annuler</button>
      </div>
    </Overlay>
  );
}

/* ══════════════════════════════════════════════════════
   MODAL QUESTION (multi-format)
══════════════════════════════════════════════════════ */
function QuestionModal({ qForm, setQF, editingQ, onSave, onClose, peut = () => true }) {
  const canSave = peut("examens", editingQ ? "update" : "create");
  const qt = qForm.type;
  const showOptions = ["qcm","audio_qcm","lecture_qcm","vrai_faux"].includes(qt);
  const isVraiFaux  = qt === "vrai_faux";
  const isSpeaking  = qt === "speaking";

  const vfOptions = ["Vrai", "Faux"];

  return (
    <Overlay onClose={onClose} xl>
      <OverlayHeader
        title={editingQ ? "Modifier la question" : "Nouvelle question"}
        sub="Choisissez le type puis remplissez le contenu"
        onClose={onClose}
      />

      {/* Type de question */}
      <label style={labelSt}>Type de question</label>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:16 }}>
        {Q_TYPES.map(t => (
          <div key={t.value} onClick={() => setQF(f => ({ ...f, type:t.value, options:t.value==="vrai_faux"?["Vrai","Faux"]:["","","",""], correct:"" }))}
            style={{ padding:"8px 10px", borderRadius:10, border:`2px solid ${qt===t.value?"#0891b2":"#e5e7eb"}`, background:qt===t.value?"#e0f2fe":"#fff", cursor:"pointer", transition:"all .15s" }}>
            <div style={{ fontSize:18 }}>{t.icon}</div>
            <div style={{ fontSize:12, fontWeight:700, color:qt===t.value?"#0891b2":"#0f172a" }}>{t.label}</div>
            <div style={{ fontSize:10, color:"#9ca3af" }}>{t.desc}</div>
          </div>
        ))}
      </div>

      {/* Passage texte (Reading) */}
      {(qt === "lecture_qcm") && (
        <>
          <label style={labelSt}>📖 Passage / Texte à lire</label>
          <textarea value={qForm.passage||""} onChange={e => setQF(f => ({ ...f, passage:e.target.value }))}
            placeholder="Collez ici le texte que le candidat devra lire…" rows={5}
            style={{ ...inputSt, resize:"vertical", fontFamily:"serif", fontSize:14 }} />
        </>
      )}

      {/* Upload Audio (Listening ou stimulus Speaking) */}
      {(qt === "audio_qcm" || qt === "speaking") && (
        <>
          <label style={labelSt}>🎧 {qt === "speaking" ? "Audio stimulus (à écouter par le candidat)" : "Fichier audio"}</label>
          <CloudinaryUpload
            type="audio"
            currentUrl={qForm.audio_url}
            label={`Uploader le fichier audio (MP3, WAV, OGG - max ${maxMoPour("audio","audio/mpeg")} Mo)`}
            onSuccess={(file) => setQF(f => ({ ...f, audio_url: file.url }))}
          />
          {qForm.audio_url && (
            <audio controls src={qForm.audio_url} crossOrigin="anonymous" style={{ width:"100%", marginBottom:10, borderRadius:8 }} />
          )}
        </>
      )}

      {/* Badge informatif Speaking */}
      {isSpeaking && (
        <div style={{ background:"#f0fdf4", border:"1.5px solid #86efac", borderRadius:10, padding:"10px 14px", marginBottom:12, fontSize:12, color:"#166534" }}>
          🎙️ <strong>Mode Speaking</strong> - Le candidat écoute l'audio ci-dessus puis enregistre sa réponse orale directement depuis le site web. La correction est manuelle (le formateur écoute les enregistrements depuis le dashboard).
        </div>
      )}

      {/* Texte de la question */}
      <label style={labelSt}>
        {qt==="texte_trous" ? "Phrase à compléter (utilisez _____ pour le trou)" : qt==="libre" ? "Consigne / Question ouverte" : qt==="speaking" ? "Consigne orale (affichée sous l'audio)" : "Question *"}
      </label>
      <textarea value={qForm.text} onChange={e => setQF(f => ({ ...f, text:e.target.value }))}
        placeholder={qt==="texte_trous" ? "ex: She _____ to school every day." : qt==="libre" ? "ex: Describe your ideal working environment." : qt==="speaking" ? "ex: Listen to the conversation and describe what the speakers are discussing." : "ex: What ______ your name?"}
        rows={qt==="texte_trous"?2:3} style={{ ...inputSt, resize:"vertical" }} />

      {/* Options de réponse */}
      {showOptions && !isVraiFaux && !isSpeaking && (
        <>
          <label style={labelSt}>Options de réponse (cochez la bonne réponse)</label>
          {qForm.options.map((opt, i) => (
            <div key={i} style={{ display:"flex", gap:8, marginBottom:8, alignItems:"center" }}>
              <input type="radio" name="correct_opt" checked={qForm.correct === opt && !!opt}
                onChange={() => opt && setQF(f => ({ ...f, correct:opt }))} />
              <input type="text" placeholder={`Option ${i+1}`} value={opt}
                onChange={e => {
                  const o2 = [...qForm.options]; o2[i] = e.target.value;
                  setQF(f => ({ ...f, options:o2, correct:f.correct===opt?e.target.value:f.correct }));
                }}
                style={{ ...inputSt, marginBottom:0, flex:1, border:qForm.correct===opt&&opt?"2px solid #22c55e":"1px solid #d1d5db" }} />
              {qForm.correct===opt&&opt && <span style={{ fontSize:11, color:"#16a34a", fontWeight:700, whiteSpace:"nowrap" }}>✓</span>}
            </div>
          ))}
          <p style={{ fontSize:11, color:"#9ca3af", marginBottom:12 }}>💡 Cliquez sur le bouton radio à côté de la bonne réponse</p>
        </>
      )}

      {/* Vrai / Faux */}
      {isVraiFaux && (
        <>
          <label style={labelSt}>Bonne réponse</label>
          <div style={{ display:"flex", gap:12, marginBottom:16 }}>
            {vfOptions.map(opt => (
              <button key={opt} onClick={() => setQF(f => ({ ...f, correct:opt }))}
                style={{ flex:1, padding:"12px 0", borderRadius:10, border:`2px solid ${qForm.correct===opt?"#0891b2":"#e5e7eb"}`, background:qForm.correct===opt?"#e0f2fe":"#fff", fontWeight:700, fontSize:14, cursor:"pointer", color:qForm.correct===opt?"#0891b2":"#374151" }}>
                {opt === "Vrai" ? "✅ Vrai" : "❌ Faux"}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Texte à trous - réponse attendue */}
      {qt === "texte_trous" && (
        <>
          <label style={labelSt}>Réponse correcte (mot à placer dans le trou)</label>
          <input value={qForm.correct} onChange={e => setQF(f => ({ ...f, correct:e.target.value }))}
            placeholder="ex: goes" style={inputSt} />
        </>
      )}

      {/* Métadonnées */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
        <div>
          <label style={labelSt}>Catégorie</label>
          <select value={qForm.category} onChange={e => setQF(f => ({ ...f, category:e.target.value }))} style={inputSt}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={labelSt}>Niveau CECRL</label>
          <select value={qForm.cefr} onChange={e => setQF(f => ({ ...f, cefr:e.target.value }))} style={inputSt}>
            {CEFR_LEVELS.map(l => <option key={l} value={l}>{l} - {({ A1:"Débutant",A2:"Élém.",B1:"Inter.",B2:"Inter. sup.",C1:"Avancé",C2:"Maîtrise" })[l]}</option>)}
          </select>
        </div>
        <div>
          <label style={labelSt}>Points</label>
          <select value={qForm.points} onChange={e => setQF(f => ({ ...f, points:Number(e.target.value) }))} style={inputSt}>
            <option value={1}>1 pt - Facile</option>
            <option value={2}>2 pts - Moyen</option>
            <option value={3}>3 pts - Difficile</option>
            <option value={5}>5 pts - Expert</option>
          </select>
        </div>
      </div>

      <label style={labelSt}>Explication (affichée après correction)</label>
      <textarea value={qForm.explanation} onChange={e => setQF(f => ({ ...f, explanation:e.target.value }))}
        placeholder="Expliquez pourquoi cette réponse est correcte…" rows={2} style={{ ...inputSt, resize:"vertical" }} />

      <label style={{ ...labelSt, display:"flex", alignItems:"center", gap:8 }}>
        <input type="checkbox" checked={qForm.actif} onChange={e => setQF(f => ({ ...f, actif:e.target.checked }))} />
        Question active dans le test
      </label>

      {/* Prévisualisation QCM */}
      {["qcm","audio_qcm","lecture_qcm"].includes(qt) && qForm.text && qForm.options.some(o=>o) && (
        <div style={{ marginTop:14, padding:14, borderRadius:10, background:"#f8fafc", border:"1px solid #e2e8f0" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", marginBottom:8 }}>PRÉVISUALISATION</div>
          {qForm.passage && <p style={{ fontSize:13, color:"#374151", fontStyle:"italic", borderLeft:"3px solid #e2e8f0", paddingLeft:10, marginBottom:12 }}>{qForm.passage.slice(0,200)}{qForm.passage.length>200?"…":""}</p>}
          <p style={{ fontSize:14, fontWeight:600, marginBottom:10 }}>{qForm.text}</p>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
            {qForm.options.map((opt,i) => opt && (
              <div key={i} style={{ padding:"8px 12px", borderRadius:8, fontSize:13, background:opt===qForm.correct?"#dcfce7":"#f3f4f6", border:`1px solid ${opt===qForm.correct?"#bbf7d0":"#e5e7eb"}`, color:opt===qForm.correct?"#166534":"#374151", fontWeight:opt===qForm.correct?700:400 }}>
                {opt===qForm.correct?"✓ ":""}{opt}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display:"flex", gap:10, marginTop:16 }}>
        <button disabled={!canSave} title={permBtnTitle(editingQ ? "Enregistrer" : "Ajouter la question",canSave)} onClick={onSave} style={permBtnStyle(btnPrimary,canSave)}>{editingQ ? "Enregistrer" : "Ajouter la question"}</button>
        <button onClick={onClose} style={btnSecondary}>Annuler</button>
      </div>
    </Overlay>
  );
}

/* ── STYLES ── */
const ttl        = { margin:0, fontSize:16, fontWeight:700, color:"#0f172a" };
const sub        = { margin:"3px 0 0", fontSize:12, color:"#9ca3af" };
const panel      = { background:"#f8fafc", borderRadius:12, padding:18 };
const panelTitle = { fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:14, marginTop:0 };
const tbl        = { width:"100%", borderCollapse:"collapse" };
const th         = { padding:"10px 12px", textAlign:"left", fontSize:12, color:"#6b7280", background:"#f9fafb", fontWeight:600 };
const td         = { padding:"10px 12px", fontSize:13, verticalAlign:"middle" };
const avatarSt   = { width:34, height:34, borderRadius:"50%", background:"#e0e7ff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:12, color:"#4f46e5", flexShrink:0 };
const btnPrimary = { padding:"9px 16px", background:"#0891b2", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 };
const btnSecondary={ padding:"9px 16px", background:"#e5e7eb", color:"#374151", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 };
const btnIconEdit = { padding:"5px 9px", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:6, cursor:"pointer", fontSize:13 };
const btnIconToggle={ padding:"5px 9px", background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:6, cursor:"pointer", fontSize:13 };
const btnIconDelete={ padding:"5px 9px", background:"#fff1f2", border:"1px solid #fecdd3", borderRadius:6, cursor:"pointer", fontSize:13 };
const inputSt    = { padding:9, marginBottom:10, width:"100%", borderRadius:6, border:"1px solid #d1d5db", boxSizing:"border-box", fontSize:13 };
const labelSt    = { display:"block", fontSize:12, fontWeight:600, color:"#374151", marginBottom:4 };
