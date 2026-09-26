// src/pages/Administration.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useConfirm } from "../../contexts/ConfirmContext";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";
const authHdrs = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` });

/* ================= SIDEBAR ================= */
const Sidebar = () => {
  const navigate = useNavigate();
  const items = [
    { name: "Dashboard", path: "/AdminDashboard" },
    { name: "Professeurs", path: "/TeachersPage" },
    { name: "Classes", path: "/classes" },
    { name: "Cours", path: "/courses" },
    { name: "Etudiant", path: "/student" },
    { name: "Examens", path: "/exams" },
    { name: "Salles", path: "/rooms" },
    { name: "Bulletins", path: "/bulletins" },
    { name: "Notifications", path: "/notifications" },
    { name: "Gestion Utilisateurs", path: "/administrator" },
    { name: "Administration", path: "/administration", active: true },
    { name: "Test Niveau", path: "/test-niveau" },
    { name: "Profil", path: "/profile" },
    { name: "Déconnexion", path: "/logout" },
  ];
  return (
    <div style={sidebarStyle}>
      <h2 style={{ marginBottom: 30, color: "#fff", fontSize: 16 }}>Menu</h2>
      {items.map((it, i) => (
        <div key={i} onClick={() => navigate(it.path)}
          style={{ ...sidebarItemStyle, background: it.active ? "#3b82f6" : "#1e3a8a", fontWeight: it.active ? 700 : 400 }}>
          {it.name}
        </div>
      ))}
    </div>
  );
};

/* ── helpers ── */
const EmptyState = ({ label, onAdd }) => (
  <div style={{ textAlign: "center", padding: "50px 20px" }}>
    <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
    <p style={{ color: "#9ca3af", marginBottom: 16 }}>Aucun {label} pour l'instant</p>
    <button onClick={onAdd} style={btnPrimary}>+ Ajouter</button>
  </div>
);

const Modal = ({ title, onClose, children }) => (
  <div style={modalOverlay}>
    <div style={{ ...modalBox, maxHeight: "90vh", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const StatCard = ({ label, value, color, icon }) => (
  <div style={{ background: "#fff", padding: 16, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 12 }}>
    <div style={{ width: 44, height: 44, borderRadius: 10, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{icon}</div>
    <div>
      <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  </div>
);

const StatusBadge = ({ active }) => (
  <span style={{ padding: "3px 10px", borderRadius: 14, fontSize: 11, fontWeight: 700, background: active ? "#dcfce7" : "#fee2e2", color: active ? "#166534" : "#991b1b" }}>
    {active ? "Actif" : "Inactif"}
  </span>
);

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const CEFR_COLORS = { A1: "#6b7280", A2: "#f59e0b", B1: "#3b82f6", B2: "#8b5cf6", C1: "#10b981", C2: "#ef4444" };
const CATEGORIES = ["Grammaire", "Vocabulaire", "Compréhension", "Orthographe", "Expression"];

/* ═══ MAIN ═══ */
export default function Administration() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState("offres");

  /* ── OFFRES ── */
  const [offres, setOffres] = useState([
    { id: 1, titre: "Pack Essentiel", prix: 150000, duree: "3 mois", description: "Accès aux cours de base", actif: true, avantages: ["Cours en ligne", "Support email"] },
    { id: 2, titre: "Pack Premium", prix: 300000, duree: "6 mois", description: "Accès complet + examens", actif: true, avantages: ["Cours en ligne", "Examens inclus", "Certificat"] },
    { id: 3, titre: "Pack Annuel", prix: 500000, duree: "12 mois", description: "Accès illimité à tout", actif: false, avantages: ["Tout inclus", "Suivi personnalisé", "Certificat premium"] },
  ]);
  const [showOffreModal, setShowOffreModal] = useState(false);
  const [editOffre, setEditOffre] = useState(null);
  const [offreForm, setOffreForm] = useState({ titre: "", prix: "", duree: "", description: "", actif: true, avantages: "" });

  /* ── BLOG ── */
  const [articles, setArticles] = useState([]);
  const [loadingBlog, setLoadingBlog] = useState(false);
  const [showArticleModal, setShowArticleModal] = useState(false);
  const [articleSaving, setArticleSaving] = useState(false);
  const [editArticle, setEditArticle] = useState(null);
  const [articleForm, setArticleForm] = useState({ titre: "", extrait: "", contenu: "", categorie: "Actualités", auteur: "Admin", image_url: "", read_time: "", publie: true });
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [commentsArticle, setCommentsArticle] = useState(null);
  const [articleComments, setArticleComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);

  const fetchArticles = useCallback(async () => {
    setLoadingBlog(true);
    try {
      const r = await fetch(`${API_URL}/api/blog/admin/all`, { headers: authHdrs() });
      if (!r.ok) throw new Error();
      const { articles: list } = await r.json();
      setArticles(list || []);
    } catch { toast.error("Impossible de charger les articles"); }
    finally { setLoadingBlog(false); }
  }, []);

  const fetchComments = async (articleId) => {
    setLoadingComments(true);
    try {
      const r = await fetch(`${API_URL}/api/blog/${articleId}/commentaires`, { headers: authHdrs() });
      const { commentaires } = await r.json();
      setArticleComments(commentaires || []);
    } catch { toast.error("Erreur chargement commentaires"); }
    finally { setLoadingComments(false); }
  };

  useEffect(() => { if (activeTab === "blog") fetchArticles(); }, [activeTab, fetchArticles]);

  /* ── TÉMOIGNAGES ── */
  const [temoignages, setTemoignages] = useState([
    { id: 1, nom: "Kouamé Aya", role: "Étudiante L3", note: 5, texte: "Excellente plateforme, j'ai vraiment progressé.", approuve: true, date: "2025-10-12", avatar: "KA" },
    { id: 2, nom: "Diallo Ibrahima", role: "Étudiant M1", note: 4, texte: "Très bon système de gestion. Les professeurs sont compétents.", approuve: true, date: "2025-11-05", avatar: "DI" },
    { id: 3, nom: "N'Guessan Fatou", role: "Parent d'élève", note: 5, texte: "Mon enfant a beaucoup évolué cette année.", approuve: false, date: "2025-12-01", avatar: "NF" },
  ]);
  const [showTemoModal, setShowTemoModal] = useState(false);
  const [editTemo, setEditTemo] = useState(null);
  const [temoForm, setTemoForm] = useState({ nom: "", role: "", note: 5, texte: "", approuve: false });

  /* ── CATALOGUE ── */
  const [catalogue, setCatalogue] = useState([
    { id: 1, nom: "Formation Comptabilité", categorie: "Finance", niveau: "Débutant", duree: "120h", prix: 200000, places: 30, actif: true, description: "Formation complète en comptabilité générale" },
    { id: 2, nom: "Droit des Affaires", categorie: "Juridique", niveau: "Intermédiaire", duree: "80h", prix: 180000, places: 25, actif: true, description: "Maîtrisez les fondamentaux du droit commercial" },
    { id: 3, nom: "Marketing Digital", categorie: "Marketing", niveau: "Avancé", duree: "60h", prix: 150000, places: 20, actif: false, description: "Stratégies digitales et réseaux sociaux" },
  ]);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [editCatalog, setEditCatalog] = useState(null);
  const [catalogForm, setCatalogForm] = useState({ nom: "", categorie: "", niveau: "Débutant", duree: "", prix: "", places: "", actif: true, description: "" });

  /* ── PARTENAIRES ── */
  const [partenaires, setPartenaires] = useState([
    { id: 1, nom: "BNP Paribas CI", type: "Financier", description: "Partenaire financier officiel", site: "https://bnpparibas.ci", actif: true, logo: "🏦" },
    { id: 2, nom: "Orange Côte d'Ivoire", type: "Technologie", description: "Partenaire télécommunications", site: "https://orange.ci", actif: true, logo: "📱" },
    { id: 3, nom: "Ministère de l'Éducation", type: "Institutionnel", description: "Partenaire institutionnel", site: "https://men.gouv.ci", actif: true, logo: "🏛️" },
  ]);
  const [showPartModal, setShowPartModal] = useState(false);
  const [editPart, setEditPart] = useState(null);
  const [partForm, setPartForm] = useState({ nom: "", type: "Financier", description: "", site: "", actif: true, logo: "" });

  /* ── TESTS DE NIVEAU ── */
  const [questions, setQuestions] = useState([
    { id: 1, text: "What ______ your name?", options: ["is", "are", "am", "be"], correct: "is", category: "Grammaire", cefr: "A1", points: 1, explanation: "On utilise 'is' avec 'what' pour les sujets singuliers.", actif: true },
    { id: 2, text: "Which word means the opposite of 'big'?", options: ["tall", "small", "heavy", "old"], correct: "small", category: "Vocabulaire", cefr: "A1", points: 1, explanation: "'Small' est l'antonyme de 'big'.", actif: true },
    { id: 3, text: "She ______ to the cinema last Saturday.", options: ["go", "goes", "went", "going"], correct: "went", category: "Grammaire", cefr: "A2", points: 1, explanation: "Le prétérit de 'go' est 'went' (verbe irrégulier).", actif: true },
    { id: 4, text: "Choose the correct meaning of 'exhausted'.", options: ["Very hungry", "Very tired", "Very happy", "Very cold"], correct: "Very tired", category: "Vocabulaire", cefr: "A2", points: 1, explanation: "'Exhausted' signifie extrêmement fatigué.", actif: true },
    { id: 5, text: "If I ______ you, I would study harder.", options: ["was", "were", "am", "is"], correct: "were", category: "Grammaire", cefr: "B1", points: 2, explanation: "Dans les conditionnels hypothétiques, on utilise 'were' pour tous les sujets.", actif: true },
    { id: 6, text: "He has been working here ______ five years.", options: ["since", "for", "during", "while"], correct: "for", category: "Grammaire", cefr: "B1", points: 2, explanation: "'For' est utilisé avec une durée, 'since' avec un point de départ.", actif: true },
    { id: 7, text: "By the time we arrived, the film ______ already started.", options: ["has", "have", "had", "would have"], correct: "had", category: "Grammaire", cefr: "B2", points: 2, explanation: "Le plus-que-parfait (had + pp) indique une action antérieure.", actif: true },
    { id: 8, text: "Choose the best synonym for 'meticulous'.", options: ["Careless", "Precise", "Generous", "Stubborn"], correct: "Precise", category: "Vocabulaire", cefr: "B2", points: 2, explanation: "'Meticulous' signifie très attentif aux détails.", actif: true },
    { id: 9, text: "The report ______ have been submitted by noon.", options: ["should", "must", "ought to", "All are correct"], correct: "All are correct", category: "Grammaire", cefr: "C1", points: 3, explanation: "'Should', 'must' et 'ought to' expriment tous l'obligation.", actif: true },
    { id: 10, text: "Which sentence uses the subjunctive correctly?", options: ["I suggest that he goes home.", "I suggest that he go home.", "I suggest that he will go home.", "I suggest that he going home."], correct: "I suggest that he go home.", category: "Grammaire", cefr: "C1", points: 3, explanation: "Le subjonctif utilise la base verbale après 'suggest'.", actif: false },
  ]);
  const [showQModal, setShowQModal] = useState(false);
  const [editQ, setEditQ] = useState(null);
  const [qForm, setQForm] = useState({ text: "", options: ["", "", "", ""], correct: "", category: "Grammaire", cefr: "A1", points: 1, explanation: "", actif: true });
  const [filterCefr, setFilterCefr] = useState("Tous");
  const [filterCat, setFilterCat] = useState("Tous");
  const [testPreview, setTestPreview] = useState(false);

  /* ─── Handlers OFFRES ─── */
  const openOffreModal = (o = null) => {
    setEditOffre(o);
    setOffreForm(o ? { ...o, avantages: o.avantages.join(", ") } : { titre: "", prix: "", duree: "", description: "", actif: true, avantages: "" });
    setShowOffreModal(true);
  };
  const saveOffre = () => {
    if (!offreForm.titre || !offreForm.prix) { toast.error("Titre et prix requis"); return; }
    const avantages = offreForm.avantages.split(",").map(a => a.trim()).filter(Boolean);
    if (editOffre) setOffres(offres.map(x => x.id === editOffre.id ? { ...offreForm, avantages, id: editOffre.id } : x));
    else setOffres([...offres, { ...offreForm, avantages, id: Date.now() }]);
    toast.success(editOffre ? "Offre modifiée" : "Offre ajoutée");
    setShowOffreModal(false);
  };

  /* ─── Handlers ARTICLE ─── */
  const openArticleModal = (a = null) => {
    setEditArticle(a);
    setArticleForm(a
      ? { titre: a.titre, extrait: a.extrait || "", contenu: a.contenu || "", categorie: a.categorie, auteur: a.auteur, image_url: a.image_url || "", read_time: a.read_time || "", publie: a.publie }
      : { titre: "", extrait: "", contenu: "", categorie: "Actualités", auteur: "Admin", image_url: "", read_time: "", publie: true });
    setShowArticleModal(true);
  };
  const saveArticle = async () => {
    if (articleSaving) return;
    if (!articleForm.titre) { toast.error("Titre requis"); return; }
    setArticleSaving(true);
    try {
      const url    = editArticle ? `${API_URL}/api/blog/${editArticle.id}` : `${API_URL}/api/blog`;
      const method = editArticle ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: authHdrs(), body: JSON.stringify(articleForm) });
      if (!r.ok) { const d = await r.json(); toast.error(d.error || "Erreur"); return; }
      toast.success(editArticle ? "Article modifié ✓" : "Article publié ✓");
      setShowArticleModal(false);
      fetchArticles();
    } catch { toast.error("Erreur réseau"); }
    finally { setArticleSaving(false); }
  };
  const toggleArticle = async (a) => {
    try {
      await fetch(`${API_URL}/api/blog/${a.id}/publie`, { method: "PATCH", headers: authHdrs(), body: JSON.stringify({ publie: !a.publie }) });
      toast.success(!a.publie ? "Article publié" : "Passé en brouillon");
      fetchArticles();
    } catch { toast.error("Erreur"); }
  };
  const deleteArticle = async (id) => {
    if (!(await confirm("Supprimer cet article et ses commentaires ?", { titre: "Supprimer l'article" }))) return;
    try {
      await fetch(`${API_URL}/api/blog/${id}`, { method: "DELETE", headers: authHdrs() });
      toast.success("Article supprimé");
      fetchArticles();
    } catch { toast.error("Erreur"); }
  };
  const openCommentsModal = async (a) => {
    setCommentsArticle(a);
    setShowCommentsModal(true);
    await fetchComments(a.id);
  };
  const toggleComment = async (c) => {
    try {
      await fetch(`${API_URL}/api/blog/commentaires/${c.id}`, { method: "PATCH", headers: authHdrs(), body: JSON.stringify({ approuve: !c.approuve }) });
      setArticleComments(prev => prev.map(x => x.id === c.id ? { ...x, approuve: !x.approuve } : x));
      fetchArticles();
    } catch { toast.error("Erreur"); }
  };
  const deleteComment = async (cId) => {
    try {
      await fetch(`${API_URL}/api/blog/commentaires/${cId}`, { method: "DELETE", headers: authHdrs() });
      setArticleComments(prev => prev.filter(x => x.id !== cId));
      fetchArticles();
    } catch { toast.error("Erreur"); }
  };

  /* ─── Handlers TEMOIGNAGE ─── */
  const openTemoModal = (t = null) => {
    setEditTemo(t);
    setTemoForm(t ? { ...t } : { nom: "", role: "", note: 5, texte: "", approuve: false });
    setShowTemoModal(true);
  };
  const saveTemo = () => {
    if (!temoForm.nom || !temoForm.texte) { toast.error("Nom et témoignage requis"); return; }
    const avatar = temoForm.nom.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    const date = new Date().toISOString().split("T")[0];
    if (editTemo) setTemoignages(temoignages.map(x => x.id === editTemo.id ? { ...temoForm, avatar, date, id: editTemo.id } : x));
    else setTemoignages([...temoignages, { ...temoForm, avatar, date, id: Date.now() }]);
    toast.success(editTemo ? "Modifié" : "Ajouté");
    setShowTemoModal(false);
  };

  /* ─── Handlers CATALOGUE ─── */
  const openCatalogModal = (c = null) => {
    setEditCatalog(c);
    setCatalogForm(c ? { ...c } : { nom: "", categorie: "", niveau: "Débutant", duree: "", prix: "", places: "", actif: true, description: "" });
    setShowCatalogModal(true);
  };
  const saveCatalog = () => {
    if (!catalogForm.nom || !catalogForm.prix) { toast.error("Nom et prix requis"); return; }
    if (editCatalog) setCatalogue(catalogue.map(x => x.id === editCatalog.id ? { ...catalogForm, id: editCatalog.id } : x));
    else setCatalogue([...catalogue, { ...catalogForm, id: Date.now() }]);
    toast.success(editCatalog ? "Modifié" : "Ajouté");
    setShowCatalogModal(false);
  };

  /* ─── Handlers PARTENAIRES ─── */
  const openPartModal = (p = null) => {
    setEditPart(p);
    setPartForm(p ? { ...p } : { nom: "", type: "Financier", description: "", site: "", actif: true, logo: "" });
    setShowPartModal(true);
  };
  const savePart = () => {
    if (!partForm.nom) { toast.error("Nom requis"); return; }
    if (editPart) setPartenaires(partenaires.map(x => x.id === editPart.id ? { ...partForm, id: editPart.id } : x));
    else setPartenaires([...partenaires, { ...partForm, id: Date.now() }]);
    toast.success(editPart ? "Modifié" : "Ajouté");
    setShowPartModal(false);
  };

  /* ─── Handlers QUESTIONS ─── */
  const openQModal = (q = null) => {
    setEditQ(q);
    setQForm(q ? { ...q, options: [...q.options] } : { text: "", options: ["", "", "", ""], correct: "", category: "Grammaire", cefr: "A1", points: 1, explanation: "", actif: true });
    setShowQModal(true);
  };
  const saveQuestion = () => {
    if (!qForm.text || !qForm.correct) { toast.error("Question et bonne réponse requises"); return; }
    if (qForm.options.some(o => !o.trim())) { toast.error("Remplissez toutes les options"); return; }
    if (!qForm.options.includes(qForm.correct)) { toast.error("La bonne réponse doit être l'une des options"); return; }
    if (editQ) setQuestions(questions.map(x => x.id === editQ.id ? { ...qForm, id: editQ.id } : x));
    else setQuestions([...questions, { ...qForm, id: Date.now() }]);
    toast.success(editQ ? "Question modifiée" : "Question ajoutée");
    setShowQModal(false);
  };
  const deleteQuestion = (id) => { setQuestions(questions.filter(q => q.id !== id)); toast.success("Question supprimée"); };

  const filteredQuestions = questions.filter(q =>
    (filterCefr === "Tous" || q.cefr === filterCefr) &&
    (filterCat === "Tous" || q.category === filterCat)
  );

  /* ── Tabs config ── */
  const tabs = [
    { key: "offres",      label: "Offres",       count: offres.length,       icon: "🎁", danger: offres.filter(o => !o.actif).length > 0 },
    { key: "catalogue",   label: "Catalogue",     count: catalogue.length,    icon: "📚" },
    { key: "partenaires", label: "Partenaires",   count: partenaires.length,  icon: "🤝" },
    { key: "temoignages", label: "Témoignages",   count: temoignages.length,  icon: "💬" },
    { key: "blog",        label: "Blog",          count: articles.length,     icon: "📝", success: articles.filter(a => a.publie).length },
    { key: "tests",       label: "Tests",         count: questions.length,    icon: "🧪", info: questions.filter(q => q.actif).length },
  ];

  const niveauColors = { "Débutant": { bg: "#dcfce7", c: "#166534" }, "Intermédiaire": { bg: "#fef3c7", c: "#92400e" }, "Avancé": { bg: "#fee2e2", c: "#991b1b" } };
  const typeColors = { "Financier": "#2563eb", "Technologie": "#8b5cf6", "Institutionnel": "#f59e0b", "Académique": "#10b981", "Autre": "#6b7280" };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f1f5f9" }}>
      <Sidebar />
      <div style={{ flex: 1, padding: 24, overflowX: "hidden" }}>

        {/* HEADER */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24, color: "#0f172a" }}>Administration</h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>Gérez le contenu public de votre établissement</p>
        </div>

        {/* STATS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
          <StatCard label="Offres actives"     value={offres.filter(o => o.actif).length}        color="#2563eb" icon="🎁" />
          <StatCard label="Articles publiés"   value={articles.filter(a => a.publie).length}      color="#8b5cf6" icon="📝" />
          <StatCard label="Avis approuvés"     value={temoignages.filter(t => t.approuve).length} color="#f59e0b" icon="⭐" />
          <StatCard label="Formations actives" value={catalogue.filter(c => c.actif).length}      color="#10b981" icon="📚" />
          <StatCard label="Partenaires actifs" value={partenaires.filter(p => p.actif).length}    color="#ef4444" icon="🤝" />
          <StatCard label="Questions actives"  value={questions.filter(q => q.actif).length}      color="#6366f1" icon="🧪" />
        </div>

        {/* ── TABS ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 0, flexWrap: "wrap" }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            let cntBg = isActive ? "#dbeafe" : "#d1d5db";
            let cntC = isActive ? "#1d4ed8" : "#4b5563";
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: "10px 18px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer",
                fontWeight: 600, fontSize: 13,
                background: isActive ? "#fff" : "#e5e7eb",
                color: isActive ? "#1e40af" : "#6b7280",
                boxShadow: isActive ? "0 -2px 6px rgba(0,0,0,0.06)" : "none",
                display: "flex", alignItems: "center", gap: 6, justifyContent: "center",
                flex: "1 1 140px", whiteSpace: "nowrap",
              }}>
                <span style={{ fontSize: 14 }}>{tab.icon}</span>
                {tab.label}
                <span style={{ padding: "1px 7px", borderRadius: 10, fontSize: 11, background: cntBg, color: cntC, fontWeight: 700 }}>{tab.count}</span>
              </button>
            );
          })}
        </div>

        {/* ── CARD PRINCIPALE ── */}
        <div style={{ ...card, borderRadius: "0 12px 12px 12px" }}>

          {/* ═══════════ TAB OFFRES ═══════════ */}
          {activeTab === "offres" && (
            <div>
              <div style={tabHeader}>
                <div><h2 style={tabTitle}>Gestion des Offres</h2><p style={tabSubtitle}>{offres.length} offres · {offres.filter(o => o.actif).length} actives</p></div>
                <button onClick={() => openOffreModal()} style={btnPrimary}>+ Nouvelle offre</button>
              </div>
              {offres.length === 0 ? <EmptyState label="offre" onAdd={() => openOffreModal()} /> : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                  {offres.map(o => (
                    <div key={o.id} style={{ ...itemCard, borderTop: `4px solid ${o.actif ? "#2563eb" : "#d1d5db"}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div><div style={{ fontWeight: 700, fontSize: 15 }}>{o.titre}</div><div style={{ fontSize: 12, color: "#6b7280" }}>{o.duree}</div></div>
                        <StatusBadge active={o.actif} />
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: "#2563eb", marginBottom: 8 }}>{Number(o.prix).toLocaleString()} <span style={{ fontSize: 12, fontWeight: 400, color: "#6b7280" }}>FCFA</span></div>
                      <p style={{ fontSize: 12, color: "#4b5563", marginBottom: 10 }}>{o.description}</p>
                      <div style={{ marginBottom: 12 }}>{o.avantages.map((av, i) => <div key={i} style={{ fontSize: 11, color: "#166534", display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}><span style={{ color: "#22c55e" }}>✓</span>{av}</div>)}</div>
                      <div style={actionRow}>
                        <button onClick={() => openOffreModal(o)} style={btnEdit}>✏️ Modifier</button>
                        <button onClick={() => { setOffres(offres.map(x => x.id === o.id ? { ...x, actif: !x.actif } : x)); toast.success("Statut mis à jour"); }} style={btnToggle}>{o.actif ? "🔴" : "🟢"}</button>
                        <button onClick={() => { setOffres(offres.filter(x => x.id !== o.id)); toast.success("Supprimé"); }} style={btnDelete}>🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══════════ TAB BLOG ═══════════ */}
          {activeTab === "blog" && (
            <div>
              <div style={tabHeader}>
                <div><h2 style={tabTitle}>Articles de Blog</h2><p style={tabSubtitle}>{articles.length} articles · {articles.filter(a => a.publie).length} publiés</p></div>
                <button onClick={() => openArticleModal()} style={btnPrimary}>+ Nouvel article</button>
              </div>
              {articles.length === 0 ? <EmptyState label="article" onAdd={() => openArticleModal()} /> : (
                <table style={tableStyle}><thead><tr>
                  <th style={th}>Titre</th><th style={th}>Catégorie</th><th style={th}>Auteur</th><th style={th}>Date</th><th style={th}>Statut</th><th style={th}>Actions</th>
                </tr></thead><tbody>
                  {articles.map(a => (
                    <tr key={a.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={td}><div style={{ fontWeight: 600, fontSize: 13 }}>{a.titre}</div><div style={{ fontSize: 11, color: "#9ca3af", maxWidth: 280 }}>{a.extrait}</div></td>
                      <td style={td}><span style={{ padding: "3px 8px", borderRadius: 10, fontSize: 11, background: "#ede9fe", color: "#5b21b6" }}>{a.categorie}</span></td>
                      <td style={{ ...td, fontSize: 12 }}>{a.auteur}</td>
                      <td style={{ ...td, fontSize: 12, color: "#6b7280" }}>{a.date ? new Date(a.date).toLocaleDateString("fr-FR") : "-"}</td>
                      <td style={td}><StatusBadge active={a.publie} /></td>
                      <td style={td}><div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => openArticleModal(a)} style={btnIconEdit}>✏️</button>
                        <button onClick={() => { setArticles(articles.map(x => x.id === a.id ? { ...x, publie: !x.publie } : x)); toast.success("Mis à jour"); }} style={btnIconToggle}>{a.publie ? "🔴" : "🟢"}</button>
                        <button onClick={() => { setArticles(articles.filter(x => x.id !== a.id)); toast.success("Supprimé"); }} style={btnIconDelete}>🗑️</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody></table>
              )}
            </div>
          )}

          {/* ═══════════ TAB TÉMOIGNAGES ═══════════ */}
          {activeTab === "temoignages" && (
            <div>
              <div style={tabHeader}>
                <div><h2 style={tabTitle}>Témoignages</h2><p style={tabSubtitle}>{temoignages.length} avis · {temoignages.filter(t => t.approuve).length} approuvés</p></div>
                <button onClick={() => openTemoModal()} style={btnPrimary}>+ Ajouter un avis</button>
              </div>
              {temoignages.length === 0 ? <EmptyState label="témoignage" onAdd={() => openTemoModal()} /> : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                  {temoignages.map(t => (
                    <div key={t.id} style={{ ...itemCard, position: "relative" }}>
                      <div style={{ position: "absolute", top: 12, right: 12 }}><StatusBadge active={t.approuve} /></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#2563eb", fontSize: 14 }}>{t.avatar}</div>
                        <div><div style={{ fontWeight: 700, fontSize: 13 }}>{t.nom}</div><div style={{ fontSize: 11, color: "#6b7280" }}>{t.role}</div></div>
                      </div>
                      <div style={{ marginBottom: 8, color: "#f59e0b" }}>{"★".repeat(t.note)}{"☆".repeat(5 - t.note)} <span style={{ fontSize: 11, color: "#6b7280" }}>{t.note}/5</span></div>
                      <p style={{ fontSize: 12, color: "#374151", fontStyle: "italic", marginBottom: 12 }}>"{t.texte}"</p>
                      <div style={actionRow}>
                        <button onClick={() => openTemoModal(t)} style={btnEdit}>✏️</button>
                        <button onClick={() => { setTemoignages(temoignages.map(x => x.id === t.id ? { ...x, approuve: !x.approuve } : x)); toast.success("Mis à jour"); }} style={btnToggle}>{t.approuve ? "🔴 Désappr." : "✅ Approuver"}</button>
                        <button onClick={() => { setTemoignages(temoignages.filter(x => x.id !== t.id)); toast.success("Supprimé"); }} style={btnDelete}>🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══════════ TAB CATALOGUE ═══════════ */}
          {activeTab === "catalogue" && (
            <div>
              <div style={tabHeader}>
                <div><h2 style={tabTitle}>Catalogue des Formations</h2><p style={tabSubtitle}>{catalogue.length} formations</p></div>
                <button onClick={() => openCatalogModal()} style={btnPrimary}>+ Nouvelle formation</button>
              </div>
              {catalogue.length === 0 ? <EmptyState label="formation" onAdd={() => openCatalogModal()} /> : (
                <table style={tableStyle}><thead><tr>
                  <th style={th}>Formation</th><th style={th}>Catégorie</th><th style={th}>Niveau</th><th style={th}>Durée</th><th style={th}>Prix</th><th style={th}>Places</th><th style={th}>Statut</th><th style={th}>Actions</th>
                </tr></thead><tbody>
                  {catalogue.map(c => {
                    const niv = niveauColors[c.niveau] || niveauColors["Débutant"];
                    return (
                      <tr key={c.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                        <td style={td}><div style={{ fontWeight: 600, fontSize: 13 }}>{c.nom}</div><div style={{ fontSize: 11, color: "#9ca3af" }}>{c.description}</div></td>
                        <td style={td}><span style={{ padding: "3px 8px", borderRadius: 10, fontSize: 11, background: "#f0fdf4", color: "#166534" }}>{c.categorie}</span></td>
                        <td style={td}><span style={{ padding: "3px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: niv.bg, color: niv.c }}>{c.niveau}</span></td>
                        <td style={{ ...td, fontSize: 12 }}>{c.duree}</td>
                        <td style={{ ...td, fontWeight: 700, color: "#2563eb" }}>{Number(c.prix).toLocaleString()} F</td>
                        <td style={{ ...td, fontSize: 12 }}>{c.places}</td>
                        <td style={td}><StatusBadge active={c.actif} /></td>
                        <td style={td}><div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => openCatalogModal(c)} style={btnIconEdit}>✏️</button>
                          <button onClick={() => { setCatalogue(catalogue.map(x => x.id === c.id ? { ...x, actif: !x.actif } : x)); toast.success("Mis à jour"); }} style={btnIconToggle}>{c.actif ? "🔴" : "🟢"}</button>
                          <button onClick={() => { setCatalogue(catalogue.filter(x => x.id !== c.id)); toast.success("Supprimé"); }} style={btnIconDelete}>🗑️</button>
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody></table>
              )}
            </div>
          )}

          {/* ═══════════ TAB PARTENAIRES ═══════════ */}
          {activeTab === "partenaires" && (
            <div>
              <div style={tabHeader}>
                <div><h2 style={tabTitle}>Partenaires</h2><p style={tabSubtitle}>{partenaires.length} partenaires</p></div>
                <button onClick={() => openPartModal()} style={btnPrimary}>+ Nouveau partenaire</button>
              </div>
              {partenaires.length === 0 ? <EmptyState label="partenaire" onAdd={() => openPartModal()} /> : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
                  {partenaires.map(p => (
                    <div key={p.id} style={{ ...itemCard }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{p.logo || "🏢"}</div>
                          <div><div style={{ fontWeight: 700, fontSize: 14 }}>{p.nom}</div>
                            <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: (typeColors[p.type] || "#6b7280") + "18", color: typeColors[p.type] || "#6b7280" }}>{p.type}</span>
                          </div>
                        </div>
                        <StatusBadge active={p.actif} />
                      </div>
                      <p style={{ fontSize: 12, color: "#4b5563", marginBottom: 8 }}>{p.description}</p>
                      {p.site && <a href={p.site} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#2563eb", textDecoration: "none" }}>🔗 {p.site}</a>}
                      <div style={{ ...actionRow, marginTop: 12 }}>
                        <button onClick={() => openPartModal(p)} style={btnEdit}>✏️ Modifier</button>
                        <button onClick={() => { setPartenaires(partenaires.map(x => x.id === p.id ? { ...x, actif: !x.actif } : x)); toast.success("Mis à jour"); }} style={btnToggle}>{p.actif ? "🔴" : "🟢"}</button>
                        <button onClick={() => { setPartenaires(partenaires.filter(x => x.id !== p.id)); toast.success("Supprimé"); }} style={btnDelete}>🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══════════ TAB TESTS ═══════════ */}
          {activeTab === "tests" && (
            <div>
              <div style={tabHeader}>
                <div>
                  <h2 style={tabTitle}>Gestion des Questions - Test d'anglais</h2>
                  <p style={tabSubtitle}>{questions.length} questions · {questions.filter(q => q.actif).length} actives · {questions.reduce((s, q) => s + q.points, 0)} points au total</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => navigate("/test-niveau")} style={btnSecondary}>👁️ Voir le test</button>
                  <button onClick={() => openQModal()} style={btnPrimary}>+ Nouvelle question</button>
                </div>
              </div>

              {/* Statistiques par niveau CECRL */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 20 }}>
                {CEFR_LEVELS.map(lvl => {
                  const count = questions.filter(q => q.cefr === lvl).length;
                  const actifs = questions.filter(q => q.cefr === lvl && q.actif).length;
                  return (
                    <div key={lvl} style={{ textAlign: "center", padding: "10px 6px", borderRadius: 8, background: CEFR_COLORS[lvl] + "12", border: `1px solid ${CEFR_COLORS[lvl]}30`, cursor: "pointer" }}
                      onClick={() => setFilterCefr(filterCefr === lvl ? "Tous" : lvl)}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: CEFR_COLORS[lvl] }}>{lvl}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: CEFR_COLORS[lvl] }}>{count}</div>
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>{actifs} actives</div>
                    </div>
                  );
                })}
              </div>

              {/* Filtres */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Filtrer :</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {["Tous", ...CEFR_LEVELS].map(lvl => (
                    <button key={lvl} onClick={() => setFilterCefr(lvl)} style={{
                      padding: "4px 10px", borderRadius: 6, border: "1px solid", fontSize: 11, fontWeight: 700, cursor: "pointer",
                      background: filterCefr === lvl ? (CEFR_COLORS[lvl] || "#2563eb") : "#fff",
                      color: filterCefr === lvl ? "#fff" : (CEFR_COLORS[lvl] || "#374151"),
                      borderColor: CEFR_COLORS[lvl] || "#e5e7eb",
                    }}>{lvl}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {["Tous", ...CATEGORIES].map(cat => (
                    <button key={cat} onClick={() => setFilterCat(cat)} style={{
                      padding: "4px 10px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 11, cursor: "pointer",
                      background: filterCat === cat ? "#ede9fe" : "#fff",
                      color: filterCat === cat ? "#5b21b6" : "#6b7280",
                      fontWeight: filterCat === cat ? 700 : 400,
                    }}>{cat}</button>
                  ))}
                </div>
                <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto" }}>{filteredQuestions.length} question(s) affichée(s)</span>
              </div>

              {/* Tableau des questions */}
              {filteredQuestions.length === 0 ? <EmptyState label="question" onAdd={() => openQModal()} /> : (
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
                  {filteredQuestions.map((q, idx) => (
                    <tr key={q.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ ...td, fontSize: 12, color: "#9ca3af", fontWeight: 600 }}>{idx + 1}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 500, fontSize: 13, color: "#0f172a", maxWidth: 280 }}>{q.text}</div>
                        <div style={{ display: "flex", gap: 3, marginTop: 4, flexWrap: "wrap" }}>
                          {q.options.map((opt, i) => (
                            <span key={i} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: opt === q.correct ? "#dcfce7" : "#f3f4f6", color: opt === q.correct ? "#166534" : "#6b7280", fontWeight: opt === q.correct ? 700 : 400 }}>{opt}</span>
                          ))}
                        </div>
                      </td>
                      <td style={td}><span style={{ padding: "3px 8px", borderRadius: 10, fontSize: 11, background: "#ede9fe", color: "#5b21b6" }}>{q.category}</span></td>
                      <td style={td}><span style={{ padding: "3px 8px", borderRadius: 10, fontSize: 11, fontWeight: 800, background: CEFR_COLORS[q.cefr] + "18", color: CEFR_COLORS[q.cefr] }}>{q.cefr}</span></td>
                      <td style={{ ...td, fontWeight: 700, color: "#f59e0b", fontSize: 14 }}>{q.points}pt</td>
                      <td style={{ ...td, fontSize: 12 }}><span style={{ color: "#16a34a", fontWeight: 600 }}>✓ {q.correct}</span></td>
                      <td style={td}><StatusBadge active={q.actif} /></td>
                      <td style={td}><div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => openQModal(q)} style={btnIconEdit}>✏️</button>
                        <button onClick={() => { setQuestions(questions.map(x => x.id === q.id ? { ...x, actif: !x.actif } : x)); toast.success("Mis à jour"); }} style={btnIconToggle}>{q.actif ? "🔴" : "🟢"}</button>
                        <button onClick={() => deleteQuestion(q.id)} style={btnIconDelete}>🗑️</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody></table>
              )}
            </div>
          )}
        </div>

        {/* ══════════════════ MODALS ══════════════════ */}

        {/* MODAL OFFRE */}
        {showOffreModal && (
          <Modal title={editOffre ? "Modifier l'offre" : "Nouvelle offre"} onClose={() => setShowOffreModal(false)}>
            <label style={labelSt}>Titre *</label>
            <input type="text" placeholder="Pack Premium" value={offreForm.titre} onChange={e => setOffreForm({ ...offreForm, titre: e.target.value })} style={inputSt} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={labelSt}>Prix (FCFA) *</label><input type="number" value={offreForm.prix} onChange={e => setOffreForm({ ...offreForm, prix: e.target.value })} style={inputSt} /></div>
              <div><label style={labelSt}>Durée</label><input type="text" placeholder="6 mois" value={offreForm.duree} onChange={e => setOffreForm({ ...offreForm, duree: e.target.value })} style={inputSt} /></div>
            </div>
            <label style={labelSt}>Description</label>
            <textarea value={offreForm.description} onChange={e => setOffreForm({ ...offreForm, description: e.target.value })} style={{ ...inputSt, minHeight: 60, resize: "vertical" }} />
            <label style={labelSt}>Avantages (séparés par des virgules)</label>
            <input type="text" placeholder="Cours en ligne, Support, Certificat" value={offreForm.avantages} onChange={e => setOffreForm({ ...offreForm, avantages: e.target.value })} style={inputSt} />
            <label style={{ ...labelSt, display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={offreForm.actif} onChange={e => setOffreForm({ ...offreForm, actif: e.target.checked })} /> Offre active
            </label>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button onClick={saveOffre} style={btnPrimary}>{editOffre ? "Enregistrer" : "Créer"}</button>
              <button onClick={() => setShowOffreModal(false)} style={btnSecondary}>Annuler</button>
            </div>
          </Modal>
        )}

        {/* MODAL ARTICLE */}
        {showArticleModal && (
          <Modal title={editArticle ? "Modifier l'article" : "Nouvel article"} onClose={() => setShowArticleModal(false)}>
            <label style={labelSt}>Titre *</label>
            <input type="text" value={articleForm.titre} onChange={e => setArticleForm({ ...articleForm, titre: e.target.value })} style={inputSt} />
            <label style={labelSt}>Extrait</label>
            <textarea value={articleForm.extrait} onChange={e => setArticleForm({ ...articleForm, extrait: e.target.value })} style={{ ...inputSt, minHeight: 60, resize: "vertical" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={labelSt}>Catégorie</label>
                <select value={articleForm.categorie} onChange={e => setArticleForm({ ...articleForm, categorie: e.target.value })} style={inputSt}>
                  {["Actualités", "Cours", "Examens", "Événements", "Annonces"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div><label style={labelSt}>Auteur</label><input type="text" value={articleForm.auteur} onChange={e => setArticleForm({ ...articleForm, auteur: e.target.value })} style={inputSt} /></div>
            </div>
            <label style={{ ...labelSt, display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={articleForm.publie} onChange={e => setArticleForm({ ...articleForm, publie: e.target.checked })} /> Publier
            </label>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button disabled={articleSaving} onClick={saveArticle} style={{ ...btnPrimary, opacity:articleSaving?0.6:1, cursor:articleSaving?"not-allowed":"pointer" }}>{articleSaving ? "⏳…" : editArticle ? "Enregistrer" : "Créer"}</button>
              <button onClick={() => setShowArticleModal(false)} style={btnSecondary}>Annuler</button>
            </div>
          </Modal>
        )}

        {/* MODAL TÉMOIGNAGE */}
        {showTemoModal && (
          <Modal title={editTemo ? "Modifier" : "Nouveau témoignage"} onClose={() => setShowTemoModal(false)}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={labelSt}>Nom *</label><input type="text" value={temoForm.nom} onChange={e => setTemoForm({ ...temoForm, nom: e.target.value })} style={inputSt} /></div>
              <div><label style={labelSt}>Rôle</label><input type="text" value={temoForm.role} onChange={e => setTemoForm({ ...temoForm, role: e.target.value })} style={inputSt} /></div>
            </div>
            <label style={labelSt}>Note</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {[1,2,3,4,5].map(n => <button key={n} onClick={() => setTemoForm({ ...temoForm, note: n })} style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer", opacity: n <= temoForm.note ? 1 : 0.3 }}>★</button>)}
            </div>
            <label style={labelSt}>Témoignage *</label>
            <textarea value={temoForm.texte} onChange={e => setTemoForm({ ...temoForm, texte: e.target.value })} style={{ ...inputSt, minHeight: 80, resize: "vertical" }} />
            <label style={{ ...labelSt, display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={temoForm.approuve} onChange={e => setTemoForm({ ...temoForm, approuve: e.target.checked })} /> Approuver
            </label>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button onClick={saveTemo} style={btnPrimary}>{editTemo ? "Enregistrer" : "Ajouter"}</button>
              <button onClick={() => setShowTemoModal(false)} style={btnSecondary}>Annuler</button>
            </div>
          </Modal>
        )}

        {/* MODAL CATALOGUE */}
        {showCatalogModal && (
          <Modal title={editCatalog ? "Modifier" : "Nouvelle formation"} onClose={() => setShowCatalogModal(false)}>
            <label style={labelSt}>Nom *</label>
            <input type="text" value={catalogForm.nom} onChange={e => setCatalogForm({ ...catalogForm, nom: e.target.value })} style={inputSt} />
            <label style={labelSt}>Description</label>
            <textarea value={catalogForm.description} onChange={e => setCatalogForm({ ...catalogForm, description: e.target.value })} style={{ ...inputSt, minHeight: 60, resize: "vertical" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={labelSt}>Catégorie</label><input type="text" value={catalogForm.categorie} onChange={e => setCatalogForm({ ...catalogForm, categorie: e.target.value })} style={inputSt} /></div>
              <div><label style={labelSt}>Niveau</label>
                <select value={catalogForm.niveau} onChange={e => setCatalogForm({ ...catalogForm, niveau: e.target.value })} style={inputSt}>
                  <option>Débutant</option><option>Intermédiaire</option><option>Avancé</option>
                </select>
              </div>
              <div><label style={labelSt}>Durée</label><input type="text" value={catalogForm.duree} onChange={e => setCatalogForm({ ...catalogForm, duree: e.target.value })} style={inputSt} /></div>
              <div><label style={labelSt}>Prix (FCFA) *</label><input type="number" value={catalogForm.prix} onChange={e => setCatalogForm({ ...catalogForm, prix: e.target.value })} style={inputSt} /></div>
              <div><label style={labelSt}>Places</label><input type="number" value={catalogForm.places} onChange={e => setCatalogForm({ ...catalogForm, places: e.target.value })} style={inputSt} /></div>
            </div>
            <label style={{ ...labelSt, display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={catalogForm.actif} onChange={e => setCatalogForm({ ...catalogForm, actif: e.target.checked })} /> Active
            </label>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button onClick={saveCatalog} style={btnPrimary}>{editCatalog ? "Enregistrer" : "Créer"}</button>
              <button onClick={() => setShowCatalogModal(false)} style={btnSecondary}>Annuler</button>
            </div>
          </Modal>
        )}

        {/* MODAL PARTENAIRE */}
        {showPartModal && (
          <Modal title={editPart ? "Modifier" : "Nouveau partenaire"} onClose={() => setShowPartModal(false)}>
            <label style={labelSt}>Nom *</label>
            <input type="text" value={partForm.nom} onChange={e => setPartForm({ ...partForm, nom: e.target.value })} style={inputSt} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={labelSt}>Type</label>
                <select value={partForm.type} onChange={e => setPartForm({ ...partForm, type: e.target.value })} style={inputSt}>
                  {["Financier","Technologie","Institutionnel","Académique","Autre"].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label style={labelSt}>Logo (emoji)</label><input type="text" value={partForm.logo} onChange={e => setPartForm({ ...partForm, logo: e.target.value })} style={inputSt} /></div>
            </div>
            <label style={labelSt}>Description</label>
            <textarea value={partForm.description} onChange={e => setPartForm({ ...partForm, description: e.target.value })} style={{ ...inputSt, minHeight: 60, resize: "vertical" }} />
            <label style={labelSt}>Site web</label>
            <input type="text" value={partForm.site} onChange={e => setPartForm({ ...partForm, site: e.target.value })} style={inputSt} />
            <label style={{ ...labelSt, display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={partForm.actif} onChange={e => setPartForm({ ...partForm, actif: e.target.checked })} /> Actif
            </label>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button onClick={savePart} style={btnPrimary}>{editPart ? "Enregistrer" : "Ajouter"}</button>
              <button onClick={() => setShowPartModal(false)} style={btnSecondary}>Annuler</button>
            </div>
          </Modal>
        )}

        {/* MODAL QUESTION */}
        {showQModal && (
          <Modal title={editQ ? "Modifier la question" : "Nouvelle question"} onClose={() => setShowQModal(false)}>
            <label style={labelSt}>Question *</label>
            <textarea placeholder="ex: What ______ your name?" value={qForm.text} onChange={e => setQForm({ ...qForm, text: e.target.value })} style={{ ...inputSt, minHeight: 70, resize: "vertical" }} />

            <label style={labelSt}>4 Options de réponse *</label>
            {qForm.options.map((opt, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <input type="radio" name="correct" checked={qForm.correct === opt} onChange={() => opt && setQForm({ ...qForm, correct: opt })} />
                <input type="text" placeholder={`Option ${i + 1}`} value={opt}
                  onChange={e => {
                    const newOpts = [...qForm.options]; newOpts[i] = e.target.value;
                    setQForm({ ...qForm, options: newOpts, correct: qForm.correct === opt ? e.target.value : qForm.correct });
                  }}
                  style={{ ...inputSt, marginBottom: 0, flex: 1, border: qForm.correct === opt ? "2px solid #22c55e" : "1px solid #d1d5db" }} />
                {qForm.correct === opt && <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 700, whiteSpace: "nowrap" }}>✓ Correcte</span>}
              </div>
            ))}
            <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 12 }}>
              💡 Sélectionnez le bouton radio à côté de la bonne réponse
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelSt}>Catégorie</label>
                <select value={qForm.category} onChange={e => setQForm({ ...qForm, category: e.target.value })} style={inputSt}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Niveau CECRL</label>
                <select value={qForm.cefr} onChange={e => setQForm({ ...qForm, cefr: e.target.value })} style={inputSt}>
                  {CEFR_LEVELS.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Points</label>
                <select value={qForm.points} onChange={e => setQForm({ ...qForm, points: Number(e.target.value) })} style={inputSt}>
                  <option value={1}>1 pt - Facile</option>
                  <option value={2}>2 pts - Moyen</option>
                  <option value={3}>3 pts - Difficile</option>
                </select>
              </div>
            </div>

            <label style={labelSt}>Explication (affiché après correction)</label>
            <textarea placeholder="Expliquez pourquoi cette réponse est correcte..." value={qForm.explanation} onChange={e => setQForm({ ...qForm, explanation: e.target.value })} style={{ ...inputSt, minHeight: 60, resize: "vertical" }} />

            <label style={{ ...labelSt, display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={qForm.actif} onChange={e => setQForm({ ...qForm, actif: e.target.checked })} /> Question active dans le test
            </label>

            {/* Prévisualisation */}
            {qForm.text && qForm.options.some(o => o) && (
              <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 8 }}>PRÉVISUALISATION</div>
                <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{qForm.text}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {qForm.options.map((opt, i) => opt && (
                    <div key={i} style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, background: opt === qForm.correct ? "#dcfce7" : "#f3f4f6", border: `1px solid ${opt === qForm.correct ? "#bbf7d0" : "#e5e7eb"}`, color: opt === qForm.correct ? "#166534" : "#374151", fontWeight: opt === qForm.correct ? 700 : 400 }}>
                      {opt === qForm.correct ? "✓ " : ""}{opt}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button onClick={saveQuestion} style={btnPrimary}>{editQ ? "Enregistrer" : "Ajouter la question"}</button>
              <button onClick={() => setShowQModal(false)} style={btnSecondary}>Annuler</button>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}

/* ═══ STYLES ═══ */
const sidebarStyle = { width: 200, minWidth: 200, background: "#0f172a", color: "#fff", padding: 20, minHeight: "100vh" };
const sidebarItemStyle = { padding: 12, marginBottom: 8, borderRadius: 8, cursor: "pointer", fontSize: 13, color: "#fff" };
const card = { background: "#fff", padding: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" };
const itemCard = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 };
const tableStyle = { width: "100%", borderCollapse: "collapse" };
const th = { padding: "10px 12px", textAlign: "left", fontSize: 12, color: "#6b7280", background: "#f9fafb", fontWeight: 600 };
const td = { padding: "10px 12px", fontSize: 13, verticalAlign: "middle" };
const tabHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 };
const tabTitle = { margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" };
const tabSubtitle = { margin: "3px 0 0", fontSize: 12, color: "#9ca3af" };
const actionRow = { display: "flex", gap: 6, flexWrap: "wrap" };
const btnPrimary = { padding: "9px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 12 };
const btnSecondary = { padding: "9px 16px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 12 };
const btnEdit = { padding: "5px 10px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 };
const btnToggle = { padding: "5px 10px", background: "#f9fafb", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 };
const btnDelete = { padding: "5px 8px", background: "#fff1f2", color: "#e11d48", border: "1px solid #fecdd3", borderRadius: 6, cursor: "pointer", fontSize: 11 };
const btnIconEdit = { padding: "4px 8px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, cursor: "pointer", fontSize: 13 };
const btnIconToggle = { padding: "4px 8px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", fontSize: 13 };
const btnIconDelete = { padding: "4px 8px", background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 6, cursor: "pointer", fontSize: 13 };
const modalOverlay = { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 };
const modalBox = { background: "#fff", padding: 24, borderRadius: 14, width: 520, maxWidth: "92vw" };
const inputSt = { padding: 9, marginBottom: 10, width: "100%", borderRadius: 6, border: "1px solid #d1d5db", boxSizing: "border-box", fontSize: 13 };
const labelSt = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 };