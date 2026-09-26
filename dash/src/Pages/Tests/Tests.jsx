// src/pages/Tests.jsx
// Route : <Route path="/test-niveau" element={<Tests />} />
import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { RangeePastilles } from "../../Components/BarreFiltres";
import { exporterExcelStyle } from "../../utils/exporterExcel";

/* ═══════════════════════════════════════════
   CONSTANTES GLOBALES
═══════════════════════════════════════════ */
const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const CEFR_META = {
  A1: { label: "Débutant",              color: "#6b7280", bg: "#f3f4f6", border: "#d1d5db" },
  A2: { label: "Élémentaire",           color: "#d97706", bg: "#fef3c7", border: "#fcd34d" },
  B1: { label: "Intermédiaire",         color: "#2563eb", bg: "#dbeafe", border: "#93c5fd" },
  B2: { label: "Interm. supérieur",     color: "#7c3aed", bg: "#ede9fe", border: "#c4b5fd" },
  C1: { label: "Avancé",               color: "#059669", bg: "#d1fae5", border: "#6ee7b7" },
  C2: { label: "Maîtrise",             color: "#dc2626", bg: "#fee2e2", border: "#fca5a5" },
};
const PROFILE_META = {
  particulier:   { label: "Particulier",    icon: "👤", bg: "#e0f2fe", c: "#0369a1" },
  etudiant:      { label: "Étudiant",       icon: "🎒", bg: "#f3e8ff", c: "#7e22ce" },
  professionnel: { label: "Professionnel",  icon: "💼", bg: "#fff7ed", c: "#c2410c" },
  entreprise:    { label: "Entreprise",     icon: "🏢", bg: "#dcfce7", c: "#166534" },
};
const CATEGORIES = ["Grammaire", "Vocabulaire", "Compréhension", "Orthographe", "Expression"];
const CAT_COLORS  = {
  Grammaire:     { bg: "#dbeafe", c: "#1e40af" },
  Vocabulaire:   { bg: "#fef3c7", c: "#92400e" },
  Compréhension: { bg: "#dcfce7", c: "#166534" },
  Orthographe:   { bg: "#ede9fe", c: "#5b21b6" },
  Expression:    { bg: "#fee2e2", c: "#991b1b" },
};

/* ═══════════════════════════════════════════
   DONNÉES MOCK - à remplacer par API
═══════════════════════════════════════════ */
const INITIAL_QUESTIONS = [
  { id:1,  text:"What ______ your name?",                                    options:["is","are","am","be"],                                                                                      correct:"is",                      category:"Grammaire",     cefr:"A1", points:1, explanation:"On utilise 'is' avec 'what' pour les sujets singuliers.",                                actif:true  },
  { id:2,  text:"Which word means the opposite of 'big'?",                   options:["tall","small","heavy","old"],                                                                               correct:"small",                   category:"Vocabulaire",   cefr:"A1", points:1, explanation:"'Small' est l'antonyme de 'big'.",                                                       actif:true  },
  { id:3,  text:"She ______ to the cinema last Saturday.",                   options:["go","goes","went","going"],                                                                                 correct:"went",                    category:"Grammaire",     cefr:"A2", points:1, explanation:"Le prétérit de 'go' est 'went' (verbe irrégulier).",                                    actif:true  },
  { id:4,  text:"Choose the correct meaning of 'exhausted'.",                options:["Very hungry","Very tired","Very happy","Very cold"],                                                        correct:"Very tired",               category:"Vocabulaire",   cefr:"A2", points:1, explanation:"'Exhausted' signifie extrêmement fatigué.",                                           actif:true  },
  { id:5,  text:"If I ______ you, I would study harder.",                    options:["was","were","am","is"],                                                                                     correct:"were",                    category:"Grammaire",     cefr:"B1", points:2, explanation:"Dans les conditionnels hypothétiques, on utilise 'were' pour tous les sujets.",       actif:true  },
  { id:6,  text:"He has been working here ______ five years.",               options:["since","for","during","while"],                                                                             correct:"for",                     category:"Grammaire",     cefr:"B1", points:2, explanation:"'For' avec une durée, 'since' avec un point de départ.",                              actif:true  },
  { id:7,  text:"By the time we arrived, the film ______ already started.",  options:["has","have","had","would have"],                                                                            correct:"had",                     category:"Grammaire",     cefr:"B2", points:2, explanation:"Le plus-que-parfait (had + pp) indique une action antérieure.",                       actif:true  },
  { id:8,  text:"Choose the best synonym for 'meticulous'.",                 options:["Careless","Precise","Generous","Stubborn"],                                                                 correct:"Precise",                 category:"Vocabulaire",   cefr:"B2", points:2, explanation:"'Meticulous' signifie très attentif aux détails.",                                    actif:true  },
  { id:9,  text:"The report ______ have been submitted by noon.",            options:["should","must","ought to","All are correct"],                                                               correct:"All are correct",         category:"Grammaire",     cefr:"C1", points:3, explanation:"'Should', 'must' et 'ought to' expriment tous l'obligation.",                        actif:true  },
  { id:10, text:"Which sentence uses the subjunctive correctly?",            options:["I suggest that he goes home.","I suggest that he go home.","I suggest that he will go home.","I suggest that he going home."], correct:"I suggest that he go home.", category:"Grammaire", cefr:"C1", points:3, explanation:"Le subjonctif utilise la base verbale après 'suggest'.", actif:false },
];

const INITIAL_RESULTATS = [
  { id:1,  nom:"Kouamé Aya",       email:"k.aya@gmail.com",        phone:"+225 07 11 22 33", profile:"etudiant",      cefr:"B1", pct:62, correct:6, total:10, points:9,  maxPoints:17, duration:420, date:"2025-11-10", answers:{1:"is",2:"small",3:"went",4:"Very tired",5:"were",6:"for",7:"has",8:"Precise",9:"should",10:"I suggest that he goes home."} },
  { id:2,  nom:"Diallo Ibrahima",  email:"d.ibra@yahoo.fr",        phone:"+225 05 22 44 66", profile:"professionnel", cefr:"B2", pct:75, correct:7, total:10, points:13, maxPoints:17, duration:510, date:"2025-11-12", answers:{1:"is",2:"small",3:"went",4:"Very tired",5:"were",6:"for",7:"had",8:"Precise",9:"should",10:"I suggest that he goes home."} },
  { id:3,  nom:"N'Guessan Fatou",  email:"ng.fatou@outlook.com",   phone:"+225 01 33 55 77", profile:"particulier",   cefr:"A2", pct:38, correct:4, total:10, points:5,  maxPoints:17, duration:385, date:"2025-11-15", answers:{1:"are",2:"small",3:"went",4:"Very hungry",5:"was",6:"since",7:"has",8:"Careless",9:"should",10:"I suggest that he goes home."} },
  { id:4,  nom:"Touré Mamadou",    email:"toure.m@gmail.com",      phone:"+225 07 44 88 22", profile:"entreprise",    cefr:"C1", pct:88, correct:9, total:10, points:16, maxPoints:17, duration:360, date:"2025-11-18", answers:{1:"is",2:"small",3:"went",4:"Very tired",5:"were",6:"for",7:"had",8:"Precise",9:"All are correct",10:"I suggest that he go home."} },
  { id:5,  nom:"Bamba Aïcha",      email:"a.bamba@gmail.com",      phone:"+225 05 66 99 11", profile:"etudiant",      cefr:"A1", pct:22, correct:2, total:10, points:3,  maxPoints:17, duration:290, date:"2025-11-20", answers:{1:"are",2:"tall",3:"go",4:"Very happy",5:"was",6:"since",7:"has",8:"Careless",9:"should",10:"I suggest that he goes home."} },
  { id:6,  nom:"Coulibaly Jean",   email:"j.coulibaly@hotmail.fr", phone:"+225 01 77 33 99", profile:"professionnel", cefr:"B1", pct:56, correct:5, total:10, points:8,  maxPoints:17, duration:455, date:"2025-11-22", answers:{1:"is",2:"small",3:"went",4:"Very tired",5:"was",6:"for",7:"had",8:"Precise",9:"should",10:"I suggest that he going home."} },
  { id:7,  nom:"Yao Stéphanie",    email:"s.yao@gmail.com",        phone:"+225 07 22 11 44", profile:"particulier",   cefr:"B2", pct:71, correct:7, total:10, points:12, maxPoints:17, duration:490, date:"2025-11-25", answers:{1:"is",2:"small",3:"went",4:"Very tired",5:"were",6:"for",7:"had",8:"Precise",9:"should",10:"I suggest that he goes home."} },
  { id:8,  nom:"Koné Aboubakar",   email:"ab.kone@yahoo.fr",       phone:"+225 05 55 77 88", profile:"entreprise",    cefr:"C1", pct:82, correct:8, total:10, points:15, maxPoints:17, duration:330, date:"2025-11-28", answers:{1:"is",2:"small",3:"went",4:"Very tired",5:"were",6:"for",7:"had",8:"Precise",9:"All are correct",10:"I suggest that he going home."} },
  { id:9,  nom:"Traoré Mariam",    email:"m.traore@gmail.com",     phone:"+225 01 44 66 22", profile:"etudiant",      cefr:"A2", pct:40, correct:4, total:10, points:6,  maxPoints:17, duration:410, date:"2025-12-01", answers:{1:"is",2:"tall",3:"went",4:"Very tired",5:"was",6:"since",7:"has",8:"Careless",9:"should",10:"I suggest that he goes home."} },
  { id:10, nom:"Sawadogo Eric",    email:"e.sawadogo@outlook.com", phone:"+225 07 88 22 55", profile:"professionnel", cefr:"B2", pct:68, correct:7, total:10, points:11, maxPoints:17, duration:470, date:"2025-12-03", answers:{1:"is",2:"small",3:"went",4:"Very tired",5:"were",6:"for",7:"had",8:"Precise",9:"should",10:"I suggest that he will go home."} },
  { id:11, nom:"Ouattara Safi",    email:"safi.o@gmail.com",       phone:"+225 05 33 11 77", profile:"etudiant",      cefr:"B1", pct:58, correct:6, total:10, points:9,  maxPoints:17, duration:440, date:"2025-12-05", answers:{1:"is",2:"small",3:"went",4:"Very tired",5:"were",6:"for",7:"has",8:"Precise",9:"should",10:"I suggest that he goes home."} },
  { id:12, nom:"Loba Paterne",     email:"p.loba@hotmail.fr",      phone:"+225 01 99 44 33", profile:"particulier",   cefr:"C2", pct:95, correct:10,total:10, points:17, maxPoints:17, duration:280, date:"2025-12-08", answers:{1:"is",2:"small",3:"went",4:"Very tired",5:"were",6:"for",7:"had",8:"Precise",9:"All are correct",10:"I suggest that he go home."} },
];

/* ═══════════════════════════════════════════
   SOUS-COMPOSANTS
═══════════════════════════════════════════ */
const Sidebar = () => {
  const navigate = useNavigate();
  const items = [
    { name:"Dashboard",           path:"/AdminDashboard" },
    { name:"Professeurs",         path:"/TeachersPage" },
    { name:"Classes",             path:"/classes" },
    { name:"Cours",               path:"/courses" },
    { name:"Etudiant",            path:"/student" },
    { name:"Examens",             path:"/exams" },
    { name:"Salles",              path:"/rooms" },
    { name:"Bulletins",           path:"/bulletins" },
    { name:"Notifications",       path:"/notifications" },
    { name:"Gestion Utilisateurs",path:"/administrator" },
    { name:"Administration",      path:"/administration" },
    { name:"Test Niveau",         path:"/test-niveau", active:true },
    { name:"Profil",              path:"/profile" },
    { name:"Déconnexion",         path:"/logout" },
  ];
  return (
    <div style={sidebarStyle}>
      <h2 style={{ marginBottom:30, color:"#fff", fontSize:16 }}>Menu</h2>
      {items.map((it,i) => (
        <div key={i} onClick={() => navigate(it.path)}
          style={{ ...sidebarItemStyle, background: it.active ? "#6366f1" : "#1e3a8a", fontWeight: it.active ? 700 : 400 }}>
          {it.name}
        </div>
      ))}
    </div>
  );
};

const Modal = ({ title, onClose, children, wide }) => (
  <div style={modalOverlay}>
    <div style={{ ...modalBox, width: wide ? 680 : 520, maxHeight:"92vh", overflowY:"auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <h3 style={{ margin:0, fontSize:16 }}>{title}</h3>
        <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#6b7280" }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const CefrBadge = ({ cefr, size = "sm" }) => {
  const m = CEFR_META[cefr] || CEFR_META.A1;
  return (
    <span style={{ padding: size==="lg" ? "5px 14px" : "3px 9px", borderRadius:20, fontSize: size==="lg" ? 14 : 11, fontWeight:800, background:m.bg, color:m.color, border:`1px solid ${m.border}` }}>
      {cefr}
    </span>
  );
};

const ProfileBadge = ({ profile }) => {
  const m = PROFILE_META[profile] || { label:profile, icon:"👤", bg:"#f3f4f6", c:"#374151" };
  return (
    <span style={{ padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:600, background:m.bg, color:m.c, display:"inline-flex", alignItems:"center", gap:4 }}>
      <span style={{ fontSize:12 }}>{m.icon}</span>{m.label}
    </span>
  );
};

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

const StatCard = ({ label, value, color, icon, sub }) => (
  <div style={{ background:"#fff", padding:16, borderRadius:12, boxShadow:"0 1px 4px rgba(0,0,0,0.06)", display:"flex", alignItems:"center", gap:12 }}>
    <div style={{ width:46, height:46, borderRadius:10, background:color+"1a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{icon}</div>
    <div style={{ minWidth:0 }}>
      <div style={{ fontSize:11, color:"#9ca3af", whiteSpace:"nowrap" }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:800, color, lineHeight:1.2 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"#9ca3af", marginTop:1 }}>{sub}</div>}
    </div>
  </div>
);

const EmptyState = ({ icon="📭", message="Aucune donnée", action, onAction }) => (
  <div style={{ textAlign:"center", padding:"50px 20px" }}>
    <div style={{ fontSize:44, marginBottom:12 }}>{icon}</div>
    <p style={{ color:"#9ca3af", marginBottom:16, fontSize:14 }}>{message}</p>
    {action && <button onClick={onAction} style={btnPrimary}>{action}</button>}
  </div>
);

/* ── Mini barre horizontale pour stats ── */
const HBar = ({ label, value, max, color, count }) => (
  <div style={{ marginBottom:10 }}>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
      <span style={{ fontSize:13, color:"#374151" }}>{label}</span>
      <span style={{ fontSize:12, color:"#6b7280" }}>{count} · {Math.round((value/max)*100)}%</span>
    </div>
    <div style={{ height:7, background:"#f1f5f9", borderRadius:4, overflow:"hidden" }}>
      <div style={{ height:"100%", width:`${(value/max)*100}%`, background:color, borderRadius:4 }} />
    </div>
  </div>
);

/* ═══════════════════════════════════════════
   PAGE PRINCIPALE
═══════════════════════════════════════════ */
export default function Tests() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("synthese");

  /* ── State : questions ── */
  const [questions, setQuestions] = useState(INITIAL_QUESTIONS);
  const [filterCefr, setFilterCefr] = useState("Tous");
  const [filterCat,  setFilterCat]  = useState("Tous");
  const [showQModal, setShowQModal] = useState(false);
  const [editQ,      setEditQ]      = useState(null);
  const [qForm,      setQForm]      = useState({ text:"", options:["","","",""], correct:"", category:"Grammaire", cefr:"A1", points:1, explanation:"", actif:true });

  /* ── State : résultats ── */
  const [resultats, setResultats] = useState(INITIAL_RESULTATS);
  const [filterProfile,  setFilterProfile]  = useState("Tous");
  const [filterCefrRes,  setFilterCefrRes]  = useState("Tous");
  const [filterScore,    setFilterScore]    = useState("Tous");
  const [searchTerm,     setSearchTerm]     = useState("");
  const [showDetailModal,setShowDetailModal]= useState(false);
  const [selectedResult, setSelectedResult] = useState(null);
  const [sortField,      setSortField]      = useState("date");
  const [sortDir,        setSortDir]        = useState("desc");

  /* ── State : paramètres test ── */
  const [params, setParams] = useState({
    timerEnabled:  true,
    timerPerQ:     60,
    showExplanation: true,
    shuffleQ:      false,
    maxQuestions:  10,
    passingPct:    50,
    sendEmail:     true,
    contactAfter:  true,
  });

  /* ── Computed ── */
  const activeQuestions = useMemo(() => questions.filter(q => q.actif), [questions]);

  const filteredQuestions = useMemo(() =>
    questions.filter(q =>
      (filterCefr === "Tous" || q.cefr  === filterCefr) &&
      (filterCat  === "Tous" || q.category === filterCat)
    ), [questions, filterCefr, filterCat]);

  const filteredResultats = useMemo(() => {
    let r = [...resultats];
    if (filterProfile !== "Tous") r = r.filter(x => x.profile === filterProfile);
    if (filterCefrRes !== "Tous") r = r.filter(x => x.cefr === filterCefrRes);
    if (filterScore   === "Échec")  r = r.filter(x => x.pct < params.passingPct);
    if (filterScore   === "Réussi") r = r.filter(x => x.pct >= params.passingPct);
    if (searchTerm)   r = r.filter(x => x.nom.toLowerCase().includes(searchTerm.toLowerCase()) || x.email.toLowerCase().includes(searchTerm.toLowerCase()));
    r.sort((a, b) => {
  let va = a[sortField], vb = b[sortField];
  if (typeof va === "string") {
    va = va.toLowerCase();
    vb = vb.toLowerCase();
  }
  return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
});
    return r;
  }, [resultats, filterProfile, filterCefrRes, filterScore, searchTerm, sortField, sortDir, params.passingPct]);

  /* ── Stats synthèse ── */
  const stats = useMemo(() => {
    const total   = resultats.length;
    const avgPct  = total ? Math.round(resultats.reduce((s,r) => s+r.pct, 0) / total) : 0;
    const avgDur  = total ? Math.round(resultats.reduce((s,r) => s+r.duration, 0) / total) : 0;
    const passed  = resultats.filter(r => r.pct >= params.passingPct).length;
    const byCefr  = CEFR_LEVELS.reduce((acc, l) => { acc[l] = resultats.filter(r => r.cefr === l).length; return acc; }, {});
    const byProf  = Object.keys(PROFILE_META).reduce((acc, p) => { acc[p] = resultats.filter(r => r.profile === p).length; return acc; }, {});
    const recent  = [...resultats].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);
    return { total, avgPct, avgDur, passed, byCefr, byProf, recent };
  }, [resultats, params.passingPct]);

  const formatDuration = (s) => `${Math.floor(s/60)}min ${s%60}s`;
  const formatDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" }) : "-";

  /* ── Handlers questions ── */
  const openQModal = (q = null) => {
    setEditQ(q);
    setQForm(q ? { ...q, options:[...q.options] } : { text:"", options:["","","",""], correct:"", category:"Grammaire", cefr:"A1", points:1, explanation:"", actif:true });
    setShowQModal(true);
  };
  const saveQuestion = () => {
    if (!qForm.text || !qForm.correct)               { toast.error("Question et bonne réponse requises"); return; }
    if (qForm.options.some(o => !o.trim()))           { toast.error("Remplissez les 4 options"); return; }
    if (!qForm.options.includes(qForm.correct))       { toast.error("La bonne réponse doit figurer dans les options"); return; }
    if (editQ) setQuestions(questions.map(x => x.id===editQ.id ? { ...qForm, id:editQ.id } : x));
    else       setQuestions([...questions, { ...qForm, id:Date.now() }]);
    toast.success(editQ ? "Question modifiée ✓" : "Question ajoutée ✓");
    setShowQModal(false);
  };
  const deleteQ = (id) => { setQuestions(questions.filter(q => q.id!==id)); toast.success("Supprimé"); };
  const toggleQ = (id) => setQuestions(questions.map(x => x.id===id ? { ...x, actif:!x.actif } : x));

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d==="asc"?"desc":"asc");
    else { setSortField(field); setSortDir("asc"); }
  };
  const SortIcon = ({ field }) => (
    <span style={{ fontSize:10, color:"#9ca3af" }}>
      {sortField===field ? (sortDir==="asc" ? " ↑" : " ↓") : " ↕"}
    </span>
  );

  /* ── Tabs ── */
  const tabs = [
    { key:"synthese",    label:"Synthèse",     icon:"📊", count: null  },
    { key:"tests",       label:"Questions",    icon:"🧪", count: questions.length },
    { key:"resultats",   label:"Résultats",    icon:"📋", count: resultats.length },
    { key:"statistiques",label:"Statistiques", icon:"📈", count: null  },
    { key:"parametres",  label:"Paramètres",   icon:"⚙️", count: null  },
  ];

  /* ══════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════ */
  return (
    <div style={{ display:"flex", minHeight:"100vh", background:"#f1f5f9" }}>
      <Sidebar />
      <div style={{ flex:1, padding:24, overflowX:"hidden" }}>

        {/* ── PAGE HEADER ── */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
          <div>
            <h1 style={{ margin:0, fontSize:24, color:"#0f172a", fontWeight:800 }}>🧪 Test de Niveau - Anglais</h1>
            <p style={{ margin:"4px 0 0", color:"#6b7280", fontSize:13 }}>
              Gestion des questions · Suivi des candidats · Analyse des résultats
            </p>
          </div>
          <button onClick={() => window.open("/test-niveau-public","_blank")} style={{ ...btnPrimary, display:"flex", alignItems:"center", gap:6 }}>
            👁️ Voir le test public
          </button>
        </div>

        {/* ── STATS RAPIDES ── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px,1fr))", gap:12, marginBottom:24 }}>
          <StatCard label="Candidats total"    value={stats.total}                            color="#6366f1" icon="👥"  sub={`${stats.passed} réussis`} />
          <StatCard label="Score moyen"        value={`${stats.avgPct}%`}                     color="#2563eb" icon="📊"  sub={stats.avgPct>=params.passingPct?"Bon niveau":"À améliorer"} />
          <StatCard label="Questions actives"  value={activeQuestions.length}                  color="#059669" icon="🧪"  sub={`sur ${questions.length} total`} />
          <StatCard label="Taux de réussite"   value={`${stats.total ? Math.round((stats.passed/stats.total)*100) : 0}%`} color="#f59e0b" icon="🏆" sub={`seuil : ${params.passingPct}%`} />
          <StatCard label="Durée moyenne"      value={formatDuration(stats.avgDur)}            color="#8b5cf6" icon="⏱️" sub="par candidat" />
          <StatCard label="Cette semaine"      value={resultats.filter(r => { const d=new Date(r.date); const now=new Date(); return (now-d)/(1000*3600*24)<=7; }).length} color="#ef4444" icon="📅" sub="nouveaux tests" />
        </div>

        {/* ── TABS ── */}
        <div style={{ display:"flex", gap:3, marginBottom:0, flexWrap:"wrap" }}>
          {tabs.map(tab => {
            const active = activeTab === tab.key;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding:"10px 18px", borderRadius:"8px 8px 0 0", border:"none", cursor:"pointer",
                fontWeight:600, fontSize:13,
                background: active ? "#fff" : "#e5e7eb",
                color: active ? "#4f46e5" : "#6b7280",
                boxShadow: active ? "0 -2px 6px rgba(0,0,0,0.06)" : "none",
                display:"flex", alignItems:"center", gap:6,
              }}>
                <span style={{ fontSize:14 }}>{tab.icon}</span>
                {tab.label}
                {tab.count !== null && (
                  <span style={{ padding:"1px 7px", borderRadius:10, fontSize:11, fontWeight:700, background: active ? "#ede9fe" : "#d1d5db", color: active ? "#4f46e5" : "#4b5563" }}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── CARD PRINCIPALE ── */}
        <div style={{ ...card, borderRadius:"0 12px 12px 12px" }}>

          {/* ═══════════════ SYNTHÈSE ═══════════════ */}
          {activeTab === "synthese" && (
            <div>
              <div style={tabHeader}>
                <div><h2 style={tabTitle}>Synthèse générale</h2><p style={tabSubtitle}>Vue d'ensemble du test de niveau</p></div>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>

                {/* Répartition par niveau CECRL */}
                <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                  <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:16 }}>Répartition par niveau CECRL</h3>
                  {CEFR_LEVELS.map(lvl => {
                    const m = CEFR_META[lvl];
                    const count = stats.byCefr[lvl] || 0;
                    return (
                      <HBar key={lvl}
                        label={<span><strong style={{ color:m.color }}>{lvl}</strong> - {m.label}</span>}
                        value={count} max={Math.max(1, stats.total)}
                        color={m.color} count={count} />
                    );
                  })}
                </div>

                {/* Répartition par profil */}
                <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                  <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:16 }}>Répartition par profil</h3>
                  {Object.entries(PROFILE_META).map(([key, meta]) => {
                    const count = stats.byProf[key] || 0;
                    return (
                      <HBar key={key}
                        label={<span>{meta.icon} {meta.label}</span>}
                        value={count} max={Math.max(1, stats.total)}
                        color={meta.c} count={count} />
                    );
                  })}

                  <div style={{ marginTop:20, paddingTop:16, borderTop:"1px solid #e5e7eb" }}>
                    <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:12 }}>Taux de réussite</h3>
                    <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                      <div style={{ position:"relative", width:80, height:80, flexShrink:0 }}>
                        <svg viewBox="0 0 36 36" style={{ width:80, height:80, transform:"rotate(-90deg)" }}>
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3"/>
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#22c55e" strokeWidth="3"
                            strokeDasharray={`${stats.total ? (stats.passed/stats.total)*100 : 0} 100`} strokeLinecap="round"/>
                        </svg>
                        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:800, color:"#22c55e" }}>
                          {stats.total ? Math.round((stats.passed/stats.total)*100) : 0}%
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize:13, color:"#374151" }}><strong style={{ color:"#22c55e" }}>{stats.passed}</strong> réussis</div>
                        <div style={{ fontSize:13, color:"#374151" }}><strong style={{ color:"#ef4444" }}>{stats.total - stats.passed}</strong> en dessous du seuil</div>
                        <div style={{ fontSize:11, color:"#9ca3af" }}>Seuil fixé à {params.passingPct}%</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Derniers candidats */}
                <div style={{ background:"#f8fafc", borderRadius:12, padding:20, gridColumn:"1 / -1" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                    <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", margin:0 }}>Derniers candidats</h3>
                    <button onClick={() => setActiveTab("resultats")} style={{ ...btnSecondary, padding:"5px 12px", fontSize:11 }}>Voir tous →</button>
                  </div>
                  <table style={tableStyle}><thead><tr>
                    <th style={th}>Candidat</th><th style={th}>Profil</th><th style={th}>Niveau</th><th style={th}>Score</th><th style={th}>Date</th><th style={th}>Action</th>
                  </tr></thead><tbody>
                    {stats.recent.map(r => (
                      <tr key={r.id} style={{ borderTop:"1px solid #e5e7eb" }}>
                        <td style={td}>
                          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                            <div style={{ width:34, height:34, borderRadius:"50%", background:"#e0e7ff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:12, color:"#4f46e5", flexShrink:0 }}>
                              {r.nom.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight:600, fontSize:13 }}>{r.nom}</div>
                              <div style={{ fontSize:11, color:"#9ca3af" }}>{r.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={td}><ProfileBadge profile={r.profile} /></td>
                        <td style={td}><CefrBadge cefr={r.cefr} /></td>
                        <td style={{ ...td, width:140 }}><ScoreBar pct={r.pct} compact /></td>
                        <td style={{ ...td, fontSize:12, color:"#6b7280" }}>{formatDate(r.date)}</td>
                        <td style={td}>
                          <button onClick={() => { setSelectedResult(r); setShowDetailModal(true); }} style={btnIconEdit}>🔍</button>
                        </td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>

                {/* Niveau des questions */}
                <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                  <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:16 }}>Questions par niveau</h3>
                  {CEFR_LEVELS.map(lvl => {
                    const total = questions.filter(q => q.cefr===lvl).length;
                    const active = questions.filter(q => q.cefr===lvl && q.actif).length;
                    const m = CEFR_META[lvl];
                    if (!total) return null;
                    return (
                      <div key={lvl} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                        <CefrBadge cefr={lvl} />
                        <div style={{ flex:1 }}>
                          <div style={{ height:7, background:"#e5e7eb", borderRadius:4, overflow:"hidden" }}>
                            <div style={{ height:"100%", width:`${(active/Math.max(1,total))*100}%`, background:m.color, borderRadius:4 }} />
                          </div>
                        </div>
                        <span style={{ fontSize:11, color:"#6b7280", minWidth:60 }}>{active}/{total} actives</span>
                      </div>
                    );
                  })}
                </div>

                {/* Distribution scores */}
                <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                  <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:16 }}>Distribution des scores</h3>
                  {[["0–25%","#ef4444"], ["25–50%","#f59e0b"], ["50–75%","#3b82f6"], ["75–100%","#22c55e"]].map(([range, color]) => {
                    const [lo, hi] = range.split("–").map(x => parseInt(x));
                    const count = resultats.filter(r => r.pct >= lo && r.pct < hi + (hi===100?1:0)).length;
                    return (
                      <HBar key={range} label={range} value={count} max={Math.max(1, stats.total)} color={color} count={count} />
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════ QUESTIONS ═══════════════ */}
          {activeTab === "tests" && (
            <div>
              <div style={tabHeader}>
                <div>
                  <h2 style={tabTitle}>Gestion des Questions</h2>
                  <p style={tabSubtitle}>{questions.length} questions · {activeQuestions.length} actives · {questions.reduce((s,q)=>s+q.points,0)} pts total</p>
                </div>
                <button onClick={() => openQModal()} style={btnPrimary}>+ Nouvelle question</button>
              </div>

              {/* Minicartes CECRL */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:8, marginBottom:20 }}>
                {CEFR_LEVELS.map(lvl => {
                  const m = CEFR_META[lvl];
                  const count  = questions.filter(q => q.cefr===lvl).length;
                  const actifs = questions.filter(q => q.cefr===lvl && q.actif).length;
                  const sel    = filterCefr === lvl;
                  return (
                    <div key={lvl} onClick={() => setFilterCefr(sel?"Tous":lvl)}
                      style={{ textAlign:"center", padding:"10px 6px", borderRadius:8, cursor:"pointer", background: sel ? m.bg : "#f8fafc", border:`2px solid ${sel ? m.border : "#e5e7eb"}`, transition:"all .15s" }}>
                      <div style={{ fontSize:16, fontWeight:800, color:m.color }}>{lvl}</div>
                      <div style={{ fontSize:20, fontWeight:900, color:m.color }}>{count}</div>
                      <div style={{ fontSize:10, color:"#9ca3af" }}>{actifs} actives</div>
                    </div>
                  );
                })}
              </div>

              {/* Filtres catégorie */}
              <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
                {["Tous",...CATEGORIES].map(cat => {
                  const cc = CAT_COLORS[cat];
                  return (
                    <button key={cat} onClick={() => setFilterCat(cat)} style={{
                      padding:"4px 12px", borderRadius:20, border:"1px solid", fontSize:12, cursor:"pointer", fontWeight:filterCat===cat?700:400,
                      background: filterCat===cat ? (cc?.bg || "#ede9fe") : "#fff",
                      color:       filterCat===cat ? (cc?.c  || "#5b21b6") : "#6b7280",
                      borderColor: filterCat===cat ? (cc?.bg || "#c4b5fd") : "#e5e7eb",
                    }}>{cat}</button>
                  );
                })}
                <span style={{ marginLeft:"auto", fontSize:11, color:"#9ca3af" }}>{filteredQuestions.length} affiché(s)</span>
              </div>

              {filteredQuestions.length === 0 ? <EmptyState icon="🧪" message="Aucune question trouvée" action="+ Ajouter" onAction={() => openQModal()} /> : (
                <table style={tableStyle}><thead><tr>
                  <th style={th}>#</th>
                  <th style={th}>Question</th>
                  <th style={th}>Catégorie</th>
                  <th style={th}>Niveau</th>
                  <th style={th}>Pts</th>
                  <th style={th}>Bonne réponse</th>
                  <th style={th}>Statut</th>
                  <th style={th}>Actions</th>
                </tr></thead><tbody>
                  {filteredQuestions.map((q,idx) => (
                    <tr key={q.id} style={{ borderTop:"1px solid #f1f5f9" }}>
                      <td style={{ ...td, color:"#9ca3af", fontWeight:600, fontSize:12 }}>{idx+1}</td>
                      <td style={td}>
                        <div style={{ fontWeight:500, fontSize:13, maxWidth:300, color:"#0f172a" }}>{q.text}</div>
                        <div style={{ display:"flex", gap:3, marginTop:4, flexWrap:"wrap" }}>
                          {q.options.map((opt,i) => (
                            <span key={i} style={{ fontSize:10, padding:"2px 6px", borderRadius:4, background: opt===q.correct?"#dcfce7":"#f3f4f6", color: opt===q.correct?"#166534":"#6b7280", fontWeight: opt===q.correct?700:400 }}>{opt}</span>
                          ))}
                        </div>
                      </td>
                      <td style={td}>
                        <span style={{ padding:"3px 8px", borderRadius:10, fontSize:11, background: CAT_COLORS[q.category]?.bg||"#f3f4f6", color: CAT_COLORS[q.category]?.c||"#374151" }}>{q.category}</span>
                      </td>
                      <td style={td}><CefrBadge cefr={q.cefr} /></td>
                      <td style={{ ...td, fontWeight:800, color:"#f59e0b" }}>{q.points}pt</td>
                      <td style={{ ...td, fontSize:12 }}><span style={{ color:"#16a34a", fontWeight:600 }}>✓ {q.correct}</span></td>
                      <td style={td}>
                        <span style={{ padding:"3px 10px", borderRadius:14, fontSize:11, fontWeight:700, background: q.actif?"#dcfce7":"#fee2e2", color: q.actif?"#166534":"#991b1b" }}>
                          {q.actif?"Actif":"Inactif"}
                        </span>
                      </td>
                      <td style={td}>
                        <div style={{ display:"flex", gap:6 }}>
                          <button onClick={() => openQModal(q)} style={btnIconEdit} title="Modifier">✏️</button>
                          <button onClick={() => toggleQ(q.id)} style={btnIconToggle} title={q.actif?"Désactiver":"Activer"}>{q.actif?"🔴":"🟢"}</button>
                          <button onClick={() => deleteQ(q.id)} style={btnIconDelete} title="Supprimer">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody></table>
              )}
            </div>
          )}

          {/* ═══════════════ RÉSULTATS ═══════════════ */}
          {activeTab === "resultats" && (
            <div>
              <div style={tabHeader}>
                <div>
                  <h2 style={tabTitle}>Résultats des candidats</h2>
                  <p style={tabSubtitle}>{resultats.length} candidats · {filteredResultats.length} affichés</p>
                </div>
                <button onClick={() => {
                  exporterExcelStyle({
                    nomFichier: `resultats_tests_niveau_${new Date().toISOString().slice(0,10)}`,
                    titre: '📋 Résultats des candidats - Test de niveau',
                    sousTitre: `${resultats.length} candidat${resultats.length>1?'s':''} · Généré le ${new Date().toLocaleDateString('fr-FR')}`,
                    couleurEntete: '6366F1',
                    colonnes: [
                      { label: 'Nom', width: 24, bold: true }, { label: 'Email', width: 26 },
                      { label: 'Téléphone', width: 18 }, { label: 'Profil', width: 14 },
                      { label: 'Niveau', width: 12, align: 'center' }, { label: 'Score %', width: 12, align: 'center' },
                      { label: 'Correct', width: 12, align: 'center' }, { label: 'Total', width: 10, align: 'center' },
                      { label: 'Durée (s)', width: 12, align: 'center' }, { label: 'Date', width: 16 },
                    ],
                    lignes: resultats.map(r => [r.nom, r.email, r.phone, r.profile, r.cefr, r.pct, r.correct, r.total, r.duration, r.date]),
                  });
                  toast.success("Export Excel téléchargé");
                }} style={btnSecondary}>⬇️ Exporter Excel</button>
              </div>

              {/* Filtres */}
              <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
                <input type="text" placeholder="🔍  Rechercher nom ou email..." value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ ...inputSt, marginBottom:0, width:230 }} />
                <RangeePastilles valeur={filterProfile} style={{ marginBottom:0 }}
                  onChange={(v) => setFilterProfile(v)}
                  options={[{ v:"Tous", l:"Tous" }, ...Object.entries(PROFILE_META).map(([k,v]) => ({ v:k, l:`${v.icon} ${v.label}` }))]}
                  compte={(v) => v==="Tous" ? resultats.length : resultats.filter(r=>r.profile===v).length} />
                <select value={filterCefrRes} onChange={e => setFilterCefrRes(e.target.value)} style={{ ...inputSt, marginBottom:0, width:"auto" }}>
                  <option value="Tous">Tous niveaux</option>
                  {CEFR_LEVELS.map(l => <option key={l} value={l}>{l} - {CEFR_META[l].label}</option>)}
                </select>
                <RangeePastilles valeur={filterScore} style={{ marginBottom:0 }}
                  onChange={(v) => setFilterScore(v)}
                  options={[
                    { v:"Tous",   l:"Tous scores" },
                    { v:"Réussi", l:`✅ Réussis (≥${params.passingPct}%)` },
                    { v:"Échec",  l:"❌ En dessous du seuil" },
                  ]} />
                {(filterProfile!=="Tous"||filterCefrRes!=="Tous"||filterScore!=="Tous"||searchTerm) &&
                  <button onClick={() => { setFilterProfile("Tous"); setFilterCefrRes("Tous"); setFilterScore("Tous"); setSearchTerm(""); }} style={{ ...btnSecondary, padding:"7px 12px", fontSize:11 }}>✕ Réinitialiser</button>}
              </div>

              {filteredResultats.length === 0 ? <EmptyState icon="📋" message="Aucun résultat correspondant" /> : (
                <div style={{ overflowX:"auto" }}>
                  <table style={tableStyle}><thead><tr>
                    <th style={th}>Candidat</th>
                    <th style={{ ...th, cursor:"pointer" }} onClick={() => handleSort("profile")}>Profil<SortIcon field="profile"/></th>
                    <th style={{ ...th, cursor:"pointer" }} onClick={() => handleSort("cefr")}>Niveau<SortIcon field="cefr"/></th>
                    <th style={{ ...th, cursor:"pointer", minWidth:150 }} onClick={() => handleSort("pct")}>Score<SortIcon field="pct"/></th>
                    <th style={th}>Bonnes rép.</th>
                    <th style={{ ...th, cursor:"pointer" }} onClick={() => handleSort("duration")}>Durée<SortIcon field="duration"/></th>
                    <th style={{ ...th, cursor:"pointer" }} onClick={() => handleSort("date")}>Date<SortIcon field="date"/></th>
                    <th style={th}>Action</th>
                  </tr></thead><tbody>
                    {filteredResultats.map(r => {
                      const passed = r.pct >= params.passingPct;
                      return (
                        <tr key={r.id} style={{ borderTop:"1px solid #f1f5f9", background: "transparent" }}>
                          <td style={td}>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <div style={{ width:36, height:36, borderRadius:"50%", background:"#e0e7ff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:12, color:"#4f46e5", flexShrink:0 }}>
                                {r.nom.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight:600, fontSize:13, color:"#0f172a" }}>{r.nom}</div>
                                <div style={{ fontSize:11, color:"#9ca3af" }}>{r.email}</div>
                              </div>
                            </div>
                          </td>
                          <td style={td}><ProfileBadge profile={r.profile} /></td>
                          <td style={td}><CefrBadge cefr={r.cefr} /></td>
                          <td style={{ ...td, minWidth:150 }}><ScoreBar pct={r.pct} compact /></td>
                          <td style={{ ...td, fontSize:13, fontWeight:600 }}>
                            <span style={{ color: r.correct/r.total >= 0.6 ? "#22c55e" : "#ef4444" }}>{r.correct}/{r.total}</span>
                          </td>
                          <td style={{ ...td, fontSize:12, color:"#6b7280" }}>{formatDuration(r.duration)}</td>
                          <td style={{ ...td, fontSize:12, color:"#6b7280" }}>{formatDate(r.date)}</td>
                          <td style={td}>
                            <button onClick={() => { setSelectedResult(r); setShowDetailModal(true); }}
                              style={{ ...btnEdit, display:"flex", alignItems:"center", gap:4 }}>
                              🔍 Détail
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody></table>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ STATISTIQUES ═══════════════ */}
          {activeTab === "statistiques" && (
            <div>
              <div style={tabHeader}>
                <div><h2 style={tabTitle}>Statistiques détaillées</h2><p style={tabSubtitle}>Analyse approfondie des performances</p></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>

                {/* Score moyen par profil */}
                <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                  <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:16 }}>Score moyen par profil</h3>
                  {Object.entries(PROFILE_META).map(([key, meta]) => {
                    const group = resultats.filter(r => r.profile===key);
                    const avg = group.length ? Math.round(group.reduce((s,r)=>s+r.pct,0)/group.length) : 0;
                    return group.length ? (
                      <div key={key} style={{ marginBottom:12 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontSize:13 }}>{meta.icon} {meta.label} <span style={{ color:"#9ca3af", fontSize:11 }}>({group.length})</span></span>
                          <strong style={{ color: avg>=params.passingPct?"#22c55e":"#ef4444" }}>{avg}%</strong>
                        </div>
                        <div style={{ height:8, background:"#e5e7eb", borderRadius:4, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${avg}%`, background: avg>=params.passingPct?"#22c55e":"#f59e0b", borderRadius:4 }} />
                        </div>
                      </div>
                    ) : null;
                  })}
                </div>

                {/* Temps moyen par niveau */}
                <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                  <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:16 }}>Durée moyenne par niveau CECRL</h3>
                  {CEFR_LEVELS.map(lvl => {
                    const group = resultats.filter(r => r.cefr===lvl);
                    if (!group.length) return null;
                    const avg = Math.round(group.reduce((s,r)=>s+r.duration,0)/group.length);
                    const maxDur = Math.max(...resultats.map(r=>r.duration));
                    const m = CEFR_META[lvl];
                    return (
                      <div key={lvl} style={{ marginBottom:12 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontSize:13 }}><strong style={{ color:m.color }}>{lvl}</strong> - {m.label}</span>
                          <span style={{ fontSize:12, color:"#6b7280" }}>{formatDuration(avg)}</span>
                        </div>
                        <div style={{ height:7, background:"#e5e7eb", borderRadius:4, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${(avg/maxDur)*100}%`, background:m.color, borderRadius:4 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Top 5 meilleurs scores */}
                <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                  <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:16 }}>🏆 Top 5 - Meilleurs scores</h3>
                  {[...resultats].sort((a,b)=>b.pct-a.pct).slice(0,5).map((r,i) => (
                    <div key={r.id} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10, padding:"8px 10px", borderRadius:8, background:"#fff", border:"1px solid #e5e7eb" }}>
                      <span style={{ fontSize:20 }}>{["🥇","🥈","🥉","4️⃣","5️⃣"][i]}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, fontSize:13 }}>{r.nom}</div>
                        <div style={{ fontSize:11, color:"#9ca3af" }}>{PROFILE_META[r.profile]?.label}</div>
                      </div>
                      <CefrBadge cefr={r.cefr} />
                      <span style={{ fontWeight:800, color:"#22c55e", fontSize:15 }}>{r.pct}%</span>
                    </div>
                  ))}
                </div>

                {/* Statistiques par catégorie de question */}
                <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                  <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:16 }}>Performance par catégorie</h3>
                  {CATEGORIES.map(cat => {
                    const qCat = questions.filter(q => q.category===cat && q.actif);
                    if (!qCat.length) return null;
                    const qIds = qCat.map(q=>q.id);
                    let totalAnswers=0, correctAnswers=0;
                    resultats.forEach(r => {
                      qIds.forEach(id => {
                        const q = questions.find(x=>x.id===id);
                        if (q && r.answers[id] !== undefined) {
                          totalAnswers++;
                          if (r.answers[id]===q.correct) correctAnswers++;
                        }
                      });
                    });
                    const pct = totalAnswers ? Math.round((correctAnswers/totalAnswers)*100) : 0;
                    const cc = CAT_COLORS[cat] || { bg:"#f3f4f6", c:"#374151" };
                    return (
                      <div key={cat} style={{ marginBottom:12 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontSize:13 }}>
                            <span style={{ padding:"2px 7px", borderRadius:8, fontSize:11, background:cc.bg, color:cc.c, fontWeight:600 }}>{cat}</span>
                          </span>
                          <span style={{ fontWeight:700, fontSize:12, color: pct>=60?"#22c55e":"#f59e0b" }}>{pct}% réussite</span>
                        </div>
                        <div style={{ height:7, background:"#e5e7eb", borderRadius:4, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${pct}%`, background: pct>=60?"#22c55e":"#f59e0b", borderRadius:4 }} />
                        </div>
                        <div style={{ fontSize:10, color:"#9ca3af", marginTop:2 }}>{correctAnswers}/{totalAnswers} bonnes réponses</div>
                      </div>
                    );
                  })}
                </div>

              </div>
            </div>
          )}

          {/* ═══════════════ PARAMÈTRES ═══════════════ */}
          {activeTab === "parametres" && (
            <div>
              <div style={tabHeader}>
                <div><h2 style={tabTitle}>Paramètres du test</h2><p style={tabSubtitle}>Configuration générale du test de niveau</p></div>
                <button onClick={() => toast.success("Paramètres enregistrés ✓")} style={btnPrimary}>💾 Enregistrer</button>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>

                {/* Chronomètre */}
                <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                  <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:16 }}>⏱️ Chronomètre</h3>
                  <label style={{ ...labelSt, display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                    <span>Activer le chronomètre</span>
                    <div onClick={() => setParams(p => ({ ...p, timerEnabled:!p.timerEnabled }))}
                      style={{ width:44, height:24, borderRadius:12, background: params.timerEnabled?"#6366f1":"#d1d5db", cursor:"pointer", position:"relative", transition:"background .2s", flexShrink:0 }}>
                      <div style={{ position:"absolute", top:2, left: params.timerEnabled?20:2, width:20, height:20, borderRadius:"50%", background:"#fff", transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
                    </div>
                  </label>
                  {params.timerEnabled && (
                    <>
                      <label style={labelSt}>Durée par question (secondes)</label>
                      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                        <input type="range" min={15} max={180} step={15} value={params.timerPerQ}
                          onChange={e => setParams(p => ({ ...p, timerPerQ:Number(e.target.value) }))}
                          style={{ flex:1 }} />
                        <span style={{ fontWeight:800, color:"#6366f1", minWidth:50 }}>{params.timerPerQ}s</span>
                      </div>
                      <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>
                        Durée totale estimée : {Math.round((params.timerPerQ * Math.min(params.maxQuestions, activeQuestions.length)) / 60)} min
                      </div>
                    </>
                  )}
                </div>

                {/* Questions */}
                <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                  <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:16 }}>🧪 Questions</h3>
                  <label style={labelSt}>Nombre de questions affichées</label>
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
                    <input type="range" min={5} max={activeQuestions.length || 20} step={1} value={params.maxQuestions}
                      onChange={e => setParams(p => ({ ...p, maxQuestions:Number(e.target.value) }))}
                      style={{ flex:1 }} />
                    <span style={{ fontWeight:800, color:"#6366f1", minWidth:40 }}>{params.maxQuestions}</span>
                  </div>
                  <label style={{ ...labelSt, display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                    <span>Mélanger l'ordre des questions</span>
                    <div onClick={() => setParams(p => ({ ...p, shuffleQ:!p.shuffleQ }))}
                      style={{ width:44, height:24, borderRadius:12, background: params.shuffleQ?"#6366f1":"#d1d5db", cursor:"pointer", position:"relative", transition:"background .2s", flexShrink:0 }}>
                      <div style={{ position:"absolute", top:2, left: params.shuffleQ?20:2, width:20, height:20, borderRadius:"50%", background:"#fff", transition:"left .2s" }} />
                    </div>
                  </label>
                  <label style={{ ...labelSt, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span>Afficher les explications après correction</span>
                    <div onClick={() => setParams(p => ({ ...p, showExplanation:!p.showExplanation }))}
                      style={{ width:44, height:24, borderRadius:12, background: params.showExplanation?"#6366f1":"#d1d5db", cursor:"pointer", position:"relative", transition:"background .2s", flexShrink:0 }}>
                      <div style={{ position:"absolute", top:2, left: params.showExplanation?20:2, width:20, height:20, borderRadius:"50%", background:"#fff", transition:"left .2s" }} />
                    </div>
                  </label>
                </div>

                {/* Seuil de réussite */}
                <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                  <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:16 }}>🎯 Seuil de réussite</h3>
                  <label style={labelSt}>Score minimum pour valider le test</label>
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
                    <input type="range" min={20} max={90} step={5} value={params.passingPct}
                      onChange={e => setParams(p => ({ ...p, passingPct:Number(e.target.value) }))}
                      style={{ flex:1 }} />
                    <span style={{ fontWeight:800, color: "#f59e0b", minWidth:40 }}>{params.passingPct}%</span>
                  </div>
                  <div style={{ padding:"10px 14px", borderRadius:8, background: "#fef3c7", fontSize:12, color:"#92400e" }}>
                    ⚠️ {resultats.filter(r=>r.pct < params.passingPct).length} candidat(s) seraient sous le seuil avec ce réglage
                  </div>
                </div>

                {/* Notifications */}
                <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                  <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:16 }}>📧 Notifications</h3>
                  <label style={{ ...labelSt, display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                    <div>
                      <div>Envoyer les résultats par email</div>
                      <div style={{ fontSize:11, color:"#9ca3af", fontWeight:400 }}>Le candidat reçoit son résultat par mail</div>
                    </div>
                    <div onClick={() => setParams(p => ({ ...p, sendEmail:!p.sendEmail }))}
                      style={{ width:44, height:24, borderRadius:12, background: params.sendEmail?"#6366f1":"#d1d5db", cursor:"pointer", position:"relative", transition:"background .2s", flexShrink:0 }}>
                      <div style={{ position:"absolute", top:2, left: params.sendEmail?20:2, width:20, height:20, borderRadius:"50%", background:"#fff", transition:"left .2s" }} />
                    </div>
                  </label>
                  <label style={{ ...labelSt, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div>
                      <div>Proposer un contact commercial</div>
                      <div style={{ fontSize:11, color:"#9ca3af", fontWeight:400 }}>Afficher "Demander un bilan" en fin de test</div>
                    </div>
                    <div onClick={() => setParams(p => ({ ...p, contactAfter:!p.contactAfter }))}
                      style={{ width:44, height:24, borderRadius:12, background: params.contactAfter?"#6366f1":"#d1d5db", cursor:"pointer", position:"relative", transition:"background .2s", flexShrink:0 }}>
                      <div style={{ position:"absolute", top:2, left: params.contactAfter?20:2, width:20, height:20, borderRadius:"50%", background:"#fff", transition:"left .2s" }} />
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════
            MODAL DÉTAIL RÉSULTAT
        ══════════════════════════════════════════════ */}
        {showDetailModal && selectedResult && (() => {
          const r = selectedResult;
          const m = CEFR_META[r.cefr];
          const prof = PROFILE_META[r.profile] || {};
          return (
            <Modal title="Détail du résultat" onClose={() => setShowDetailModal(false)} wide>
              {/* En-tête candidat */}
              <div style={{ display:"flex", alignItems:"center", gap:16, padding:"16px 0 16px", borderBottom:"1px solid #e5e7eb", marginBottom:20 }}>
                <div style={{ width:56, height:56, borderRadius:"50%", background:"#e0e7ff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:18, color:"#4f46e5", flexShrink:0 }}>
                  {r.nom.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:18, fontWeight:800, color:"#0f172a" }}>{r.nom}</div>
                  <div style={{ fontSize:13, color:"#6b7280" }}>{r.email} · {r.phone}</div>
                  <div style={{ display:"flex", gap:8, marginTop:6 }}>
                    <ProfileBadge profile={r.profile} />
                    <span style={{ fontSize:11, color:"#9ca3af" }}>📅 {formatDate(r.date)}</span>
                  </div>
                </div>
                <div style={{ textAlign:"center", padding:"12px 20px", borderRadius:12, background:m.bg, border:`2px solid ${m.border}` }}>
                  <div style={{ fontSize:11, color:m.color, fontWeight:600, marginBottom:2 }}>NIVEAU</div>
                  <div style={{ fontSize:32, fontWeight:900, color:m.color }}>{r.cefr}</div>
                  <div style={{ fontSize:11, color:m.color }}>{m.label}</div>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
                {[
                  { l:"Score",     v:`${r.pct}%`,              color: r.pct>=params.passingPct?"#22c55e":"#ef4444" },
                  { l:"Réponses",  v:`${r.correct}/${r.total}`, color:"#2563eb" },
                  { l:"Points",    v:`${r.points}/${r.maxPoints}`, color:"#8b5cf6" },
                  { l:"Durée",     v:formatDuration(r.duration),   color:"#f59e0b" },
                ].map(s => (
                  <div key={s.l} style={{ textAlign:"center", padding:12, borderRadius:10, background:"#f8fafc" }}>
                    <div style={{ fontSize:11, color:"#9ca3af" }}>{s.l}</div>
                    <div style={{ fontSize:20, fontWeight:800, color:s.color }}>{s.v}</div>
                  </div>
                ))}
              </div>
              <ScoreBar pct={r.pct} />

              {/* Détail par question */}
              <h4 style={{ fontSize:14, fontWeight:700, color:"#0f172a", margin:"20px 0 12px" }}>Réponses question par question</h4>
              <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:340, overflowY:"auto" }}>
                {questions.filter(q => r.answers[q.id] !== undefined).map((q, idx) => {
                  const isOk = r.answers[q.id] === q.correct;
                  const cc = CAT_COLORS[q.category] || { bg:"#f3f4f6", c:"#374151" };
                  return (
                    <div key={q.id} style={{ padding:"10px 14px", borderRadius:8, background: isOk?"#f0fdf4":"#fff5f5", border:`1px solid ${isOk?"#bbf7d0":"#fecaca"}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                          <span style={{ fontWeight:700, fontSize:12, color:"#9ca3af" }}>Q{idx+1}</span>
                          <span style={{ padding:"2px 7px", borderRadius:8, fontSize:10, background:cc.bg, color:cc.c, fontWeight:600 }}>{q.category}</span>
                          <CefrBadge cefr={q.cefr} />
                          <span style={{ fontSize:11, color:"#f59e0b" }}>{q.points}pt</span>
                        </div>
                        <span style={{ fontSize:16 }}>{isOk?"✅":"❌"}</span>
                      </div>
                      <p style={{ fontSize:13, color:"#374151", margin:"0 0 6px", fontWeight:500 }}>{q.text}</p>
                      {!isOk && <div style={{ fontSize:12, color:"#dc2626" }}>Réponse donnée : <strong>{r.answers[q.id]}</strong></div>}
                      <div style={{ fontSize:12, color:"#16a34a" }}>Bonne réponse : <strong>{q.correct}</strong></div>
                      {q.explanation && (
                        <div style={{ marginTop:6, padding:"6px 10px", borderRadius:6, background:"#f8fafc", fontSize:11, color:"#6b7280", borderLeft:"3px solid #94a3b8" }}>
                          💡 {q.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ display:"flex", gap:10, marginTop:20 }}>
                <button onClick={() => {
                  const body = encodeURIComponent(`Bonjour ${r.nom},\n\nVotre niveau d'anglais estimé est : ${r.cefr} (${CEFR_META[r.cefr].label}).\nScore obtenu : ${r.pct}%.\n\nNous vous proposons un bilan personnalisé gratuit.`);
                  window.location.href = `mailto:${r.email}?subject=Votre résultat test anglais&body=${body}`;
                }} style={btnPrimary}>📧 Envoyer par email</button>
                <button onClick={() => { setShowDetailModal(false); }} style={btnSecondary}>Fermer</button>
              </div>
            </Modal>
          );
        })()}

        {/* ══════════════════════════════════════════════
            MODAL QUESTION
        ══════════════════════════════════════════════ */}
        {showQModal && (
          <Modal title={editQ ? "Modifier la question" : "Nouvelle question"} onClose={() => setShowQModal(false)}>
            <label style={labelSt}>Question *</label>
            <textarea placeholder="ex: What ______ your name?" value={qForm.text}
              onChange={e => setQForm({ ...qForm, text:e.target.value })}
              style={{ ...inputSt, minHeight:70, resize:"vertical" }} />

            <label style={labelSt}>4 options de réponse (cochez la bonne)</label>
            {qForm.options.map((opt, i) => (
              <div key={i} style={{ display:"flex", gap:8, marginBottom:8, alignItems:"center" }}>
                <input type="radio" name="correct_opt" checked={qForm.correct === opt && !!opt}
                  onChange={() => opt && setQForm({ ...qForm, correct:opt })} />
                <input type="text" placeholder={`Option ${i+1}`} value={opt}
                  onChange={e => {
                    const newOpts = [...qForm.options]; newOpts[i] = e.target.value;
                    setQForm({ ...qForm, options:newOpts, correct: qForm.correct===opt ? e.target.value : qForm.correct });
                  }}
                  style={{ ...inputSt, marginBottom:0, flex:1, border: qForm.correct===opt && opt ? "2px solid #22c55e" : "1px solid #d1d5db" }} />
                {qForm.correct===opt && opt && <span style={{ fontSize:11, color:"#16a34a", fontWeight:700, whiteSpace:"nowrap" }}>✓ Correcte</span>}
              </div>
            ))}
            <p style={{ fontSize:11, color:"#9ca3af", marginBottom:12 }}>💡 Cliquez sur le radio à côté de la bonne réponse</p>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
              <div>
                <label style={labelSt}>Catégorie</label>
                <select value={qForm.category} onChange={e => setQForm({ ...qForm, category:e.target.value })} style={inputSt}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Niveau CECRL</label>
                <select value={qForm.cefr} onChange={e => setQForm({ ...qForm, cefr:e.target.value })} style={inputSt}>
                  {CEFR_LEVELS.map(l => <option key={l} value={l}>{l} - {CEFR_META[l].label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Difficulté / Points</label>
                <select value={qForm.points} onChange={e => setQForm({ ...qForm, points:Number(e.target.value) })} style={inputSt}>
                  <option value={1}>1 pt - Facile</option>
                  <option value={2}>2 pts - Moyen</option>
                  <option value={3}>3 pts - Difficile</option>
                </select>
              </div>
            </div>

            <label style={labelSt}>Explication (affiché après la correction)</label>
            <textarea placeholder="Expliquez pourquoi cette réponse est correcte..." value={qForm.explanation}
              onChange={e => setQForm({ ...qForm, explanation:e.target.value })}
              style={{ ...inputSt, minHeight:60, resize:"vertical" }} />

            <label style={{ ...labelSt, display:"flex", alignItems:"center", gap:8 }}>
              <input type="checkbox" checked={qForm.actif} onChange={e => setQForm({ ...qForm, actif:e.target.checked })} />
              Question active dans le test
            </label>

            {/* Preview */}
            {qForm.text && qForm.options.some(o=>o) && (
              <div style={{ marginTop:14, padding:14, borderRadius:10, background:"#f8fafc", border:"1px solid #e2e8f0" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", marginBottom:8 }}>PRÉVISUALISATION</div>
                <p style={{ fontSize:14, fontWeight:600, marginBottom:10 }}>{qForm.text}</p>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                  {qForm.options.map((opt,i) => opt && (
                    <div key={i} style={{ padding:"8px 12px", borderRadius:8, fontSize:13, background: opt===qForm.correct?"#dcfce7":"#f3f4f6", border:`1px solid ${opt===qForm.correct?"#bbf7d0":"#e5e7eb"}`, color: opt===qForm.correct?"#166534":"#374151", fontWeight: opt===qForm.correct?700:400 }}>
                      {opt===qForm.correct?"✓ ":""}{opt}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display:"flex", gap:10, marginTop:14 }}>
              <button onClick={saveQuestion} style={btnPrimary}>{editQ?"Enregistrer les modifications":"Ajouter la question"}</button>
              <button onClick={() => setShowQModal(false)} style={btnSecondary}>Annuler</button>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}

/* ═══ STYLES ═══ */
const sidebarStyle      = { width:200, minWidth:200, background:"#0f172a", color:"#fff", padding:20, minHeight:"100vh" };
const sidebarItemStyle  = { padding:12, marginBottom:8, borderRadius:8, cursor:"pointer", fontSize:13, color:"#fff" };
const card              = { background:"#fff", padding:24, boxShadow:"0 2px 8px rgba(0,0,0,0.05)" };
const tableStyle        = { width:"100%", borderCollapse:"collapse" };
const th                = { padding:"10px 12px", textAlign:"left", fontSize:12, color:"#6b7280", background:"#f9fafb", fontWeight:600 };
const td                = { padding:"10px 12px", fontSize:13, verticalAlign:"middle" };
const tabHeader         = { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 };
const tabTitle          = { margin:0, fontSize:17, fontWeight:700, color:"#0f172a" };
const tabSubtitle       = { margin:"3px 0 0", fontSize:12, color:"#9ca3af" };
const btnPrimary        = { padding:"9px 16px", background:"#6366f1", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 };
const btnSecondary      = { padding:"9px 16px", background:"#e5e7eb", color:"#374151", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 };
const btnEdit           = { padding:"5px 10px", background:"#eff6ff", color:"#2563eb", border:"1px solid #bfdbfe", borderRadius:6, cursor:"pointer", fontSize:11, fontWeight:600 };
const btnIconEdit       = { padding:"4px 8px", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:6, cursor:"pointer", fontSize:13 };
const btnIconToggle     = { padding:"4px 8px", background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:6, cursor:"pointer", fontSize:13 };
const btnIconDelete     = { padding:"4px 8px", background:"#fff1f2", border:"1px solid #fecdd3", borderRadius:6, cursor:"pointer", fontSize:13 };
const modalOverlay      = { position:"fixed", top:0, left:0, width:"100%", height:"100%", background:"rgba(0,0,0,0.5)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:1000 };
const modalBox          = { background:"#fff", padding:24, borderRadius:14, maxWidth:"92vw" };
const inputSt           = { padding:9, marginBottom:10, width:"100%", borderRadius:6, border:"1px solid #d1d5db", boxSizing:"border-box", fontSize:13 };
const labelSt           = { display:"block", fontSize:12, fontWeight:600, color:"#374151", marginBottom:4 };
