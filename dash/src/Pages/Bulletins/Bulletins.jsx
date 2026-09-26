// src/pages/Bulletins.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useUserContext } from "../../contexts/UserContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

const API = "http://localhost:8080";

const EXAM_TYPES = {
  devoir: { label: "Devoir", icon: "📋", color: "#3b82f6" },
  interro_surprise: { label: "Interro", icon: "⚡", color: "#8b5cf6" },
  partiel: { label: "Partiel", icon: "📝", color: "#f59e0b" },
  examen_final: { label: "Examen final", icon: "🎓", color: "#ef4444" },
  rattrapage: { label: "Rattrapage", icon: "🔄", color: "#10b981" },
};

const SEMESTERS = [
  { value: "T1", label: "Trimestre 1" },
  { value: "T2", label: "Trimestre 2" },
  { value: "T3", label: "Trimestre 3" },
  { value: "S1", label: "Semestre 1" },
  { value: "S2", label: "Semestre 2" },
  { value: "Annuel", label: "Annuel" },
];

const DECISION_MAP = {
  admis: { label: "Admis", bg: "#dcfce7", color: "#166534" },
  ajourné: { label: "Ajourné", bg: "#fee2e2", color: "#991b1b" },
  rattrapage: { label: "Rattrapage", bg: "#fef3c7", color: "#92400e" },
  exclus: { label: "Exclus", bg: "#fecaca", color: "#7f1d1d" },
  en_attente: { label: "En attente", bg: "#f3f4f6", color: "#6b7280" },
};

const STATUS_MAP = {
  draft: { label: "Brouillon", bg: "#f3f4f6", color: "#6b7280" },
  generated: { label: "Généré", bg: "#dbeafe", color: "#1e40af" },
  validated: { label: "Validé", bg: "#dcfce7", color: "#166534" },
  published: { label: "Publié", bg: "#ede9fe", color: "#5b21b6" },
};

const Badge = ({ bg, color, children }) => (
  <span style={{ padding: "3px 10px", borderRadius: 14, fontSize: 11, fontWeight: 700, background: bg, color }}>{children}</span>
);

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
    { name: "Bulletins", path: "/bulletins" },
    { name: "Salles", path: "/rooms" },
    { name: "Notifications", path: "/notifications" },
    { name: "Profil", path: "/profile" },
    { name: "Déconnexion", path: "/logout" },
  ];
  return (
    <div style={sidebarStyle}>
      <h2 style={{ marginBottom: 30, color: "#fff" }}>Menu</h2>
      {items.map((it, i) => (
        <div key={i} style={sidebarItemStyle} onClick={() => navigate(it.path)}>{it.name}</div>
      ))}
    </div>
  );
};

/* ================= PAGE ================= */
export default function Bulletins() {
  const { getAuthHeaders } = useUserContext();
  const navigate = useNavigate();
  const confirm = useConfirm();

  // Filtres principaux
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [semester, setSemester] = useState("S1");
  const [academicYear, setAcademicYear] = useState("2025-2026");

  // Onglets : bulletins | grades | detail | student
  const [activeTab, setActiveTab] = useState("bulletins");

  // Données
  const [bulletins, setBulletins] = useState([]);
  const [classGrades, setClassGrades] = useState(null);
  const [selectedBulletin, setSelectedBulletin] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [gradeEdits, setGradeEdits] = useState({});
  const [savingGrades, setSavingGrades] = useState(false);

  // Étudiants
  const [students, setStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentBulletins, setStudentBulletins] = useState([]);

  /* ============ FETCH ============ */
  const fetchClasses = async () => {
    try {
      const res = await fetch(`${API}/get/all/classes`, { headers: getAuthHeaders() });
      const d = await res.json();
      setClasses(Array.isArray(d) ? d : []);
    } catch { toast.error("Erreur classes"); }
  };

  const fetchStudents = async () => {
    if (!selectedClass) { setStudents([]); return; }
    try {
      const res = await fetch(`${API}/get/students`, { headers: getAuthHeaders() });
      const all = await res.json();
      const filtered = (Array.isArray(all) ? all : []).filter(
        (s) => s.class?._id === selectedClass && s.status === "active"
      );
      setStudents(filtered);
    } catch { setStudents([]); }
  };

  const fetchBulletins = async () => {
    if (!selectedClass) return;
    try {
      const res = await fetch(
        `${API}/get/bulletins?classId=${selectedClass}&semester=${semester}&academicYear=${academicYear}`,
        { headers: getAuthHeaders() }
      );
      const d = await res.json();
      setBulletins(Array.isArray(d) ? d : []);
    } catch { toast.error("Erreur bulletins"); }
  };

  const fetchClassGrades = async () => {
    if (!selectedClass) return;
    try {
      const res = await fetch(
        `${API}/get/class-grades?classId=${selectedClass}&semester=${semester}`,
        { headers: getAuthHeaders() }
      );
      setClassGrades(await res.json());
      setGradeEdits({});
    } catch { toast.error("Erreur notes"); }
  };

  const fetchBulletinDetail = async (id) => {
    try {
      const res = await fetch(`${API}/get/bulletin/${id}`, { headers: getAuthHeaders() });
      const data = await res.json();
      setSelectedBulletin(data);
      setActiveTab("detail");
    } catch { toast.error("Erreur détail"); }
  };

  // Bulletins d'un étudiant spécifique (tous semestres)
  const fetchStudentBulletins = async (studentId) => {
    try {
      const res = await fetch(
        `${API}/get/bulletins?studentId=${studentId}&academicYear=${academicYear}`,
        { headers: getAuthHeaders() }
      );
      const d = await res.json();
      setStudentBulletins(Array.isArray(d) ? d : []);
    } catch { setStudentBulletins([]); }
  };

  useEffect(() => { fetchClasses(); }, []);
  useEffect(() => {
    if (selectedClass) {
      fetchBulletins();
      fetchClassGrades();
      fetchStudents();
      setSelectedStudent(null);
      setStudentBulletins([]);
    }
  }, [selectedClass, semester, academicYear]);

  useEffect(() => {
    if (selectedClass) {
      const cls = classes.find((c) => c._id === selectedClass);
      if (cls?.academicYear) setAcademicYear(cls.academicYear);
    }
  }, [selectedClass, classes]);

  /* ============ ACTIONS ============ */
  const handleGenerate = async () => {
    if (!selectedClass) { toast.error("Sélectionnez une classe"); return; }
    if (!(await confirm(`Générer les bulletins pour ${SEMESTERS.find((s) => s.value === semester)?.label} ${academicYear} ?\n\nLes bulletins existants seront mis à jour.`, { titre: "Générer les bulletins", danger: false }))) return;
    setGenerating(true);
    try {
      const res = await fetch(`${API}/generate/bulletin`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ classId: selectedClass, semester, academicYear }),
      });
      const data = await res.json();
      if (res.ok) { toast.success(data.message); fetchBulletins(); }
      else toast.error(data.message);
    } catch { toast.error("Erreur serveur"); }
    finally { setGenerating(false); }
  };

  const handleValidateAll = async () => {
    const ids = (Array.isArray(bulletins) ? bulletins : []).filter((b) => b.status === "generated").map((b) => b._id);
    if (!ids.length) { toast.error("Aucun bulletin à valider"); return; }
    try {
      await fetch(`${API}/validate/bulletins`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ bulletinIds: ids }),
      });
      toast.success(`${ids.length} bulletin(s) validé(s)`);
      fetchBulletins();
    } catch { toast.error("Erreur"); }
  };

  const handleSaveGrade = async (examId, studentId, score) => {
    try {
      const res = await fetch(`${API}/save/exam-grade`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ examId, studentId, score: Number(score) }),
      });
      if (res.ok) toast.success("Note enregistrée");
      else { const d = await res.json(); toast.error(d.message); }
    } catch { toast.error("Erreur"); }
  };

  const handleSaveBatchGrades = async (examId) => {
    const grades = Object.entries(gradeEdits)
      .filter(([key]) => key.startsWith(examId + "_"))
      .map(([key, score]) => ({ studentId: key.split("_")[1], score }));
    if (!grades.length) { toast.error("Aucune note modifiée"); return; }
    setSavingGrades(true);
    try {
      const res = await fetch(`${API}/save/exam-grades-batch`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ examId, grades }),
      });
      const data = await res.json();
      if (res.ok) { toast.success(data.message); fetchClassGrades(); }
      else toast.error(data.message);
    } catch { toast.error("Erreur"); }
    finally { setSavingGrades(false); }
  };

  const handleUpdateBulletin = async (id, updates) => {
    try {
      const res = await fetch(`${API}/update/bulletin/${id}`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        toast.success("Mis à jour");
        fetchBulletins();
        if (selectedBulletin?._id === id) fetchBulletinDetail(id);
      }
    } catch { toast.error("Erreur"); }
  };

  // Sélectionner un étudiant
  const selectStudent = (student) => {
    setSelectedStudent(student);
    fetchStudentBulletins(student._id);
    setActiveTab("student");
  };

  /* ============ STATS ============ */
  const safeBulletins = Array.isArray(bulletins) ? bulletins : [];
  const stats = useMemo(() => {
    if (!safeBulletins.length) return null;
    const noted = safeBulletins.filter((b) => b.moyenneGenerale !== null);
    const moyennes = noted.map((b) => b.moyenneGenerale);
    return {
      total: safeBulletins.length,
      admis: safeBulletins.filter((b) => b.decision === "admis").length,
      rattrapage: safeBulletins.filter((b) => b.decision === "rattrapage").length,
      ajourné: safeBulletins.filter((b) => b.decision === "ajourné").length,
      moyenneClasse: moyennes.length ? (moyennes.reduce((a, b) => a + b, 0) / moyennes.length).toFixed(2) : "-",
      meilleure: moyennes.length ? Math.max(...moyennes).toFixed(2) : "-",
      plusBasse: moyennes.length ? Math.min(...moyennes).toFixed(2) : "-",
      validated: safeBulletins.filter((b) => b.status === "validated").length,
    };
  }, [safeBulletins]);

  // Filtrer les étudiants par recherche
  const filteredStudents = useMemo(() => {
    if (!studentSearch) return students;
    const q = studentSearch.toLowerCase();
    return students.filter((s) =>
      `${s.firstname} ${s.lastname}`.toLowerCase().includes(q) ||
      s.matricule?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q)
    );
  }, [students, studentSearch]);

  const className = classes.find((c) => c._id === selectedClass)?.name || "";
  const semesterLabel = SEMESTERS.find((s) => s.value === semester)?.label || semester;

  /* ═══════════════════════════════ RENDER ═══════════════════════════════ */
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f1f5f9" }}>
      <Sidebar />
      <div style={{ flex: 1, padding: 20 }}>
        <h1 style={{ marginBottom: 10 }}>📊 Gestion des Bulletins</h1>

        {/* ══ FILTRES ══ */}
        <div style={filterBar}>
          <select value={selectedClass} onChange={(e) => { setSelectedClass(e.target.value); setActiveTab("bulletins"); }} style={filterInput}>
            <option value="">🏫 Sélectionner une classe</option>
            {classes.map((c) => <option key={c._id} value={c._id}>{c.name} - {c.academicYear}</option>)}
          </select>
          <select value={semester} onChange={(e) => setSemester(e.target.value)} style={filterInput}>
            {SEMESTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <input type="text" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="2025-2026" style={{ ...filterInput, maxWidth: 140 }} />
          <button onClick={handleGenerate} disabled={generating || !selectedClass}
            style={{ ...btnPrimary, opacity: generating ? 0.5 : 1 }}>
            {generating ? "⏳ Génération..." : "⚡ Générer les bulletins"}
          </button>
          {safeBulletins.some((b) => b.status === "generated") && (
            <button onClick={handleValidateAll} style={{ ...btnPrimary, background: "#22c55e" }}>✅ Valider tous</button>
          )}
        </div>

        {/* ══ TABS ══ */}
        {selectedClass && (
          <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
            {[
              { key: "bulletins", label: `Bulletins (${safeBulletins.length})` },
              { key: "grades", label: "Saisie des notes" },
              { key: "students", label: `Étudiants (${students.length})` },
              ...(selectedStudent ? [{ key: "student", label: `${selectedStudent.firstname} ${selectedStudent.lastname}` }] : []),
              ...(selectedBulletin ? [{ key: "detail", label: "Bulletin détaillé" }] : []),
            ].map((tab) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: "10px 18px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 12,
                background: activeTab === tab.key ? "#fff" : "#e5e7eb",
                color: activeTab === tab.key ? "#1e40af" : "#6b7280",
                boxShadow: activeTab === tab.key ? "0 -2px 6px rgba(0,0,0,0.06)" : "none",
              }}>{tab.label}</button>
            ))}
          </div>
        )}

        {!selectedClass && (
          <div style={{ ...card, textAlign: "center", padding: 60, color: "#9ca3af" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📊</div>
            Sélectionnez une classe pour commencer
          </div>
        )}

        {/* ══════════════════════════════════════════════════
         *  TAB: LISTE DES ÉTUDIANTS DE LA CLASSE
         * ══════════════════════════════════════════════════ */}
        {selectedClass && activeTab === "students" && (
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>👨‍🎓 Étudiants - {className}</h3>
              <input type="text" placeholder="🔍 Rechercher un étudiant..." value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                style={{ ...filterInput, minWidth: 250 }} />
            </div>
            {filteredStudents.length > 0 ? (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>#</th><th style={th}>Nom complet</th><th style={th}>Matricule</th>
                    <th style={th}>Email</th><th style={th}>Téléphone</th>
                    <th style={th}>Moyenne</th><th style={th}>Rang</th><th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s, idx) => {
                    const bul = safeBulletins.find((b) => b.student?._id === s._id);
                    return (
                      <tr key={s._id} style={{ borderTop: "1px solid #f1f5f9" }}>
                        <td style={{ ...td, color: "#9ca3af", fontSize: 11 }}>{idx + 1}</td>
                        <td style={td}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#2563eb", flexShrink: 0 }}>
                              {s.firstname?.[0]}{s.lastname?.[0]}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{s.lastname} {s.firstname}</div>
                              <div style={{ fontSize: 10, color: "#9ca3af" }}>@{s.username}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ ...td, fontSize: 11, color: "#6b7280" }}>{s.matricule || "-"}</td>
                        <td style={{ ...td, fontSize: 11 }}>{s.email}</td>
                        <td style={{ ...td, fontSize: 11 }}>{s.phone || "-"}</td>
                        <td style={td}>
                          {bul?.moyenneGenerale !== null && bul?.moyenneGenerale !== undefined ? (
                            <span style={{ fontWeight: 700, fontSize: 15, color: bul.moyenneGenerale >= 10 ? "#22c55e" : "#ef4444" }}>
                              {bul.moyenneGenerale.toFixed(2)}
                            </span>
                          ) : <span style={{ color: "#9ca3af", fontSize: 11 }}>-</span>}
                        </td>
                        <td style={{ ...td, textAlign: "center", fontWeight: 700 }}>
                          {bul?.rang || "-"}
                        </td>
                        <td style={td}>
                          <button style={{ ...btnSmall, background: "#3b82f6" }} onClick={() => selectStudent(s)}>📋 Fiche</button>
                          {bul && <button style={{ ...btnSmall, background: "#8b5cf6", marginLeft: 4 }} onClick={() => fetchBulletinDetail(bul._id)}>📊 Bulletin</button>}
                          <button style={{ ...btnSmall, background: "#6b7280", marginLeft: 4 }} onClick={() => navigate(`/student/${s._id}`)}>👁️ Détail</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p style={{ textAlign: "center", padding: 30, color: "#9ca3af" }}>Aucun étudiant trouvé</p>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
         *  TAB: FICHE ÉTUDIANT (tous ses bulletins)
         * ══════════════════════════════════════════════════ */}
        {selectedClass && activeTab === "student" && selectedStudent && (
          <div style={card}>
            {/* En-tête étudiant */}
            <div style={{ display: "flex", gap: 16, marginBottom: 20, padding: 16, background: "#f9fafb", borderRadius: 10 }}>
              <div style={{ width: 70, height: 70, borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, color: "#2563eb", flexShrink: 0 }}>
                {selectedStudent.firstname?.[0]}{selectedStudent.lastname?.[0]}
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: 20 }}>{selectedStudent.lastname} {selectedStudent.firstname}</h2>
                <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>
                  @{selectedStudent.username} - {selectedStudent.matricule || "Sans matricule"}
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "#374151" }}>
                  <span>📧 {selectedStudent.email}</span>
                  {selectedStudent.phone && <span>📱 {selectedStudent.phone}</span>}
                  {selectedStudent.address && <span>📍 {selectedStudent.address}</span>}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <Badge bg="#dbeafe" color="#1e40af">{className}</Badge>
                  <Badge bg={selectedStudent.status === "active" ? "#dcfce7" : "#fee2e2"} color={selectedStudent.status === "active" ? "#166534" : "#991b1b"}>
                    {selectedStudent.status === "active" ? "Actif" : "Suspendu"}
                  </Badge>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button style={btnPrimary} onClick={() => navigate(`/student/${selectedStudent._id}`)}>
                  👁️ Fiche complète
                </button>
                <button style={btnGray} onClick={() => setActiveTab("students")}>← Retour liste</button>
              </div>
            </div>

            {/* Cours inscrits */}
            {selectedStudent.enrolledCourses?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>📚 Cours inscrits ({selectedStudent.enrolledCourses.length})</h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {selectedStudent.enrolledCourses.map((c, i) => (
                    <span key={i} style={{ padding: "4px 10px", borderRadius: 14, fontSize: 11, background: "#ede9fe", color: "#5b21b6" }}>
                      {c.title || c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Scolarité */}
            {selectedStudent.scolarites?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>💰 Scolarité</h4>
                {selectedStudent.scolarites.map((sco, i) => (
                  <div key={i} style={{ padding: 10, borderRadius: 8, background: "#f9fafb", border: "1px solid #e5e7eb", marginBottom: 6, fontSize: 12, display: "flex", gap: 20, alignItems: "center" }}>
                    <span>Année : <strong>{sco.academicYear}</strong></span>
                    <span>Payé : <strong style={{ color: "#22c55e" }}>{(sco.paidAmount || 0).toLocaleString()} F</strong></span>
                    <span>Reste : <strong style={{ color: (sco.remainingAmount || 0) > 0 ? "#ef4444" : "#22c55e" }}>{(sco.remainingAmount || 0).toLocaleString()} F</strong></span>
                    <Badge bg={sco.paymentStatus === "paye" ? "#dcfce7" : sco.paymentStatus === "partiel" ? "#fef3c7" : "#fee2e2"}
                      color={sco.paymentStatus === "paye" ? "#166534" : sco.paymentStatus === "partiel" ? "#92400e" : "#991b1b"}>
                      {sco.paymentStatus === "paye" ? "Soldé" : sco.paymentStatus === "partiel" ? "Partiel" : "Non payé"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Bulletins de l'étudiant (tous semestres/trimestres) */}
            <h4 style={{ fontSize: 14, fontWeight: 700, color: "#1e40af", marginBottom: 8, borderBottom: "2px solid #dbeafe", paddingBottom: 6 }}>
              📊 Bulletins - {academicYear}
            </h4>

            {studentBulletins.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {studentBulletins.map((b) => {
                  const d = DECISION_MAP[b.decision] || DECISION_MAP.en_attente;
                  const st = STATUS_MAP[b.status] || STATUS_MAP.draft;
                  return (
                    <div key={b._id} style={{ padding: 16, borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", transition: "box-shadow 0.15s" }}
                      onClick={() => fetchBulletinDetail(b._id)}
                      onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)"}
                      onMouseLeave={(e) => e.currentTarget.style.boxShadow = "none"}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: "#1e40af" }}>
                          {SEMESTERS.find((s) => s.value === b.semester)?.label || b.semester}
                        </span>
                        <Badge bg={st.bg} color={st.color}>{st.label}</Badge>
                      </div>
                      <div style={{ fontSize: 30, fontWeight: 800, textAlign: "center", margin: "8px 0", color: b.moyenneGenerale !== null ? (b.moyenneGenerale >= 10 ? "#22c55e" : "#ef4444") : "#9ca3af" }}>
                        {b.moyenneGenerale !== null ? `${b.moyenneGenerale.toFixed(2)}/20` : "-"}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280" }}>
                        <span>Rang : <strong>{b.rang || "-"}/{b.totalStudents || "?"}</strong></span>
                        <span>Crédits : <strong>{b.creditsValides}/{b.totalCredits}</strong></span>
                      </div>
                      <div style={{ textAlign: "center", marginTop: 8 }}>
                        <Badge bg={d.bg} color={d.color}>{d.label}</Badge>
                      </div>
                      {b.mention && <div style={{ textAlign: "center", marginTop: 6, fontSize: 11, color: "#6b7280" }}>{b.mention}</div>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ textAlign: "center", padding: 20, color: "#9ca3af" }}>
                Aucun bulletin généré pour cet étudiant. Générez d'abord les bulletins de la classe.
              </p>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
         *  TAB: BULLETINS - Liste + Stats
         * ══════════════════════════════════════════════════ */}
        {selectedClass && activeTab === "bulletins" && (
          <div style={card}>
            {stats && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginBottom: 16 }}>
                <StatCard label="Moyenne classe" value={stats.moyenneClasse} color="#2563eb" />
                <StatCard label="Meilleure" value={stats.meilleure} color="#22c55e" />
                <StatCard label="Plus basse" value={stats.plusBasse} color="#ef4444" />
                <StatCard label="Admis" value={stats.admis} color="#22c55e" />
                <StatCard label="Rattrapage" value={stats.rattrapage} color="#f59e0b" />
                <StatCard label="Ajournés" value={stats.ajourné} color="#ef4444" />
                <StatCard label="Validés" value={stats.validated} color="#8b5cf6" />
              </div>
            )}

            {safeBulletins.length > 0 ? (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>Rang</th><th style={th}>Étudiant</th><th style={th}>Matricule</th>
                    <th style={th}>Moyenne</th><th style={th}>Mention</th><th style={th}>Décision</th>
                    <th style={th}>Crédits</th><th style={th}>Statut</th><th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {safeBulletins.map((b) => {
                    const d = DECISION_MAP[b.decision] || DECISION_MAP.en_attente;
                    const s = STATUS_MAP[b.status] || STATUS_MAP.draft;
                    return (
                      <tr key={b._id} style={{ borderTop: "1px solid #f1f5f9" }}>
                        <td style={{ ...td, textAlign: "center", fontWeight: 700, fontSize: 16 }}>{b.rang || "-"}</td>
                        <td style={{ ...td, fontWeight: 500, cursor: "pointer", color: "#2563eb" }}
                          onClick={() => {
                            const stu = students.find((st) => st._id === b.student?._id);
                            if (stu) selectStudent(stu);
                          }}>
                          {b.student?.lastname} {b.student?.firstname}
                        </td>
                        <td style={{ ...td, fontSize: 11, color: "#6b7280" }}>{b.student?.matricule || "-"}</td>
                        <td style={td}>
                          <span style={{ fontWeight: 700, fontSize: 16, color: b.moyenneGenerale !== null ? (b.moyenneGenerale >= 10 ? "#22c55e" : "#ef4444") : "#9ca3af" }}>
                            {b.moyenneGenerale !== null ? `${b.moyenneGenerale.toFixed(2)}/20` : "-"}
                          </span>
                        </td>
                        <td style={td}>{b.mention || "-"}</td>
                        <td style={td}><Badge bg={d.bg} color={d.color}>{d.label}</Badge></td>
                        <td style={{ ...td, fontSize: 12 }}>{b.creditsValides}/{b.totalCredits}</td>
                        <td style={td}><Badge bg={s.bg} color={s.color}>{s.label}</Badge></td>
                        <td style={td}>
                          <button style={{ ...btnSmall, background: "#3b82f6" }} onClick={() => fetchBulletinDetail(b._id)}>👁️</button>
                          <select style={{ marginLeft: 4, padding: 3, fontSize: 10, borderRadius: 4, border: "1px solid #d1d5db" }}
                            value={b.decision} onChange={(e) => handleUpdateBulletin(b._id, { decision: e.target.value })}>
                            {Object.entries(DECISION_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p style={{ textAlign: "center", padding: 30, color: "#9ca3af" }}>
                Aucun bulletin. Cliquez sur "Générer les bulletins" après avoir saisi les notes.
              </p>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
         *  TAB: SAISIE DES NOTES
         * ══════════════════════════════════════════════════ */}
        {selectedClass && activeTab === "grades" && classGrades && (
          <div style={card}>
            {classGrades.courseGrades?.length > 0 ? classGrades.courseGrades.map((cg) => (
              <div key={cg.course._id} style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px", color: "#1e40af", borderBottom: "2px solid #dbeafe", paddingBottom: 6 }}>
                  📘 {cg.course.title}
                  <span style={{ fontWeight: 400, fontSize: 12, color: "#6b7280", marginLeft: 8 }}>
                    (coef: {cg.course.coefficient}, crédits: {cg.course.credits})
                  </span>
                </h3>
                {cg.exams.length > 0 ? cg.exams.map((exam) => {
                  const et = EXAM_TYPES[exam.examType] || EXAM_TYPES.devoir;
                  return (
                    <div key={exam._id} style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>
                          <span style={{ padding: "2px 8px", borderRadius: 8, fontSize: 11, background: et.color + "20", color: et.color, marginRight: 6 }}>{et.icon} {et.label}</span>
                          {exam.title}
                          <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>/{exam.totalPoints}pts</span>
                          {exam.date && <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>{exam.date}</span>}
                        </span>
                        <button onClick={() => handleSaveBatchGrades(exam._id)} disabled={savingGrades}
                          style={{ ...btnSmall, background: "#22c55e" }}>
                          {savingGrades ? "..." : "💾 Sauvegarder"}
                        </button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
                        {exam.grades.map((g) => {
                          const editKey = `${exam._id}_${g.studentId}`;
                          const currentValue = gradeEdits[editKey] !== undefined ? gradeEdits[editKey] : (g.score ?? "");
                          const note20 = g.score !== null ? ((g.score / exam.totalPoints) * 20).toFixed(1) : null;
                          return (
                            <div key={g.studentId} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 6, background: "#fff", border: "1px solid #e5e7eb" }}>
                              <span style={{ flex: 1, fontSize: 11, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.studentName}>{g.studentName}</span>
                              <input type="number" min="0" max={exam.totalPoints} step="0.25" value={currentValue}
                                onChange={(e) => setGradeEdits({ ...gradeEdits, [editKey]: e.target.value })}
                                onBlur={() => { if (gradeEdits[editKey] !== undefined && gradeEdits[editKey] !== "" && gradeEdits[editKey] !== g.score?.toString()) handleSaveGrade(exam._id, g.studentId, gradeEdits[editKey]); }}
                                style={{ width: 60, padding: 4, borderRadius: 4, border: "1px solid #d1d5db", fontSize: 12, textAlign: "center" }} placeholder="-" />
                              <span style={{ fontSize: 10, color: note20 !== null ? (parseFloat(note20) >= 10 ? "#22c55e" : "#ef4444") : "#9ca3af", fontWeight: 600, width: 35, textAlign: "right" }}>
                                {note20 !== null ? note20 : "-"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }) : <p style={{ fontSize: 12, color: "#9ca3af", paddingLeft: 10 }}>Aucun examen programmé</p>}
              </div>
            )) : <p style={{ textAlign: "center", padding: 30, color: "#9ca3af" }}>Aucun cours/examen trouvé</p>}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
         *  TAB: DÉTAIL BULLETIN (impression)
         * ══════════════════════════════════════════════════ */}
        {selectedClass && activeTab === "detail" && selectedBulletin && (
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <button onClick={() => window.print()} style={btnPrimary}>🖨️ Imprimer</button>
              <button onClick={() => setActiveTab("bulletins")} style={btnGray}>← Retour</button>
              {selectedStudent && <button onClick={() => setActiveTab("student")} style={btnGray}>← Fiche étudiant</button>}
            </div>

            <div id="bulletin-print" style={{ ...card, padding: 30, maxWidth: 800, margin: "0 auto" }}>
              {/* En-tête */}
              <div style={{ textAlign: "center", marginBottom: 20, borderBottom: "3px double #1e40af", paddingBottom: 16 }}>
                <h2 style={{ margin: 0, color: "#1e40af", fontSize: 20 }}>BULLETIN DE NOTES</h2>
                <div style={{ fontSize: 14, color: "#374151", marginTop: 6 }}>{semesterLabel} - Année académique {selectedBulletin.academicYear}</div>
              </div>

              {/* Infos étudiant + classe */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20, fontSize: 13 }}>
                <div>
                  <InfoLine label="Nom et Prénom" value={`${selectedBulletin.student?.lastname} ${selectedBulletin.student?.firstname}`} bold />
                  <InfoLine label="Matricule" value={selectedBulletin.student?.matricule} />
                  <InfoLine label="Email" value={selectedBulletin.student?.email} />
                  {selectedBulletin.student?.phone && <InfoLine label="Téléphone" value={selectedBulletin.student.phone} />}
                </div>
                <div>
                  <InfoLine label="Classe" value={selectedBulletin.class?.name} bold />
                  <InfoLine label="Niveau" value={selectedBulletin.class?.level} />
                  <InfoLine label="Année académique" value={selectedBulletin.academicYear} />
                  <InfoLine label="Prof principal" value={selectedBulletin.class?.mainTeacherInfo?.fullname || selectedBulletin.class?.mainTeacherInfo?.name || "-"} />
                </div>
              </div>

              {/* Tableau des notes */}
              <table style={{ ...tableStyle, border: "2px solid #1e40af", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#1e40af", color: "#fff" }}>
                    <th style={{ ...thPrint, width: "28%" }}>Matière</th>
                    <th style={thPrint}>Coef</th>
                    <th style={thPrint}>Devoirs</th>
                    <th style={thPrint}>Partiel</th>
                    <th style={thPrint}>Examen</th>
                    <th style={{ ...thPrint, fontWeight: 800 }}>Moyenne</th>
                    <th style={thPrint}>Crédits</th>
                    <th style={thPrint}>Mention</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedBulletin.grades?.map((g, i) => {
                    const moy = g.moyenneGenerale;
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #e5e7eb", background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                        <td style={{ ...tdPrint, fontWeight: 600 }}>{g.courseTitle}</td>
                        <td style={{ ...tdPrint, textAlign: "center" }}>{g.coefficient}</td>
                        <td style={{ ...tdPrint, textAlign: "center" }}>{g.moyenneDevoir !== null ? g.moyenneDevoir.toFixed(2) : "-"}</td>
                        <td style={{ ...tdPrint, textAlign: "center" }}>{g.moyennePartiel !== null ? g.moyennePartiel.toFixed(2) : "-"}</td>
                        <td style={{ ...tdPrint, textAlign: "center" }}>{g.moyenneExamen !== null ? g.moyenneExamen.toFixed(2) : "-"}</td>
                        <td style={{ ...tdPrint, textAlign: "center", fontWeight: 800, fontSize: 14, color: moy !== null ? (moy >= 10 ? "#166534" : "#991b1b") : "#9ca3af", background: moy !== null ? (moy >= 10 ? "#f0fdf4" : "#fef2f2") : "transparent" }}>
                          {moy !== null ? moy.toFixed(2) : "-"}
                        </td>
                        <td style={{ ...tdPrint, textAlign: "center" }}>{g.credits || 0}{moy !== null && moy >= 10 && <span style={{ color: "#22c55e", marginLeft: 2 }}>✓</span>}</td>
                        <td style={{ ...tdPrint, textAlign: "center", fontSize: 10 }}>{g.mention || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#1e3a8a", color: "#fff", fontWeight: 700, fontSize: 14 }}>
                    <td style={tdPrint} colSpan={5}>MOYENNE GÉNÉRALE</td>
                    <td style={{ ...tdPrint, textAlign: "center", fontSize: 18 }}>{selectedBulletin.moyenneGenerale !== null ? selectedBulletin.moyenneGenerale.toFixed(2) : "-"} /20</td>
                    <td style={{ ...tdPrint, textAlign: "center" }}>{selectedBulletin.creditsValides}/{selectedBulletin.totalCredits}</td>
                    <td style={{ ...tdPrint, textAlign: "center" }}>{selectedBulletin.mention}</td>
                  </tr>
                </tfoot>
              </table>

              {/* Rang / Décision / Absences */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16 }}>
                <div style={{ padding: 12, borderRadius: 8, border: "2px solid #1e40af", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Rang</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#1e40af" }}>{selectedBulletin.rang || "-"}<span style={{ fontSize: 12, fontWeight: 400 }}>/{selectedBulletin.totalStudents || "?"}</span></div>
                </div>
                <div style={{ padding: 12, borderRadius: 8, border: "2px solid #1e40af", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Décision</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: (DECISION_MAP[selectedBulletin.decision] || DECISION_MAP.en_attente).color }}>
                    {(DECISION_MAP[selectedBulletin.decision] || DECISION_MAP.en_attente).label}
                  </div>
                </div>
                <div style={{ padding: 12, borderRadius: 8, border: "2px solid #1e40af", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Absences</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedBulletin.totalAbsences || 0}<span style={{ fontSize: 11, fontWeight: 400, color: "#6b7280" }}> ({selectedBulletin.absencesJustifiees || 0} just.)</span></div>
                </div>
              </div>

              {/* Détail évaluations */}
              <div style={{ marginTop: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>Détail des évaluations</h4>
                {selectedBulletin.grades?.map((g, i) => (
                  g.evaluations?.length > 0 && (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{g.courseTitle}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 10, marginTop: 2 }}>
                        {g.evaluations.map((ev, j) => {
                          const et = EXAM_TYPES[ev.examType] || EXAM_TYPES.devoir;
                          return (
                            <span key={j} style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, background: et.color + "15", color: et.color, fontWeight: 600 }}>
                              {et.icon} {ev.examTitle}: {ev.score !== null ? `${ev.score}/${ev.totalPoints}` : "-"}{ev.note20 !== null && ` (${ev.note20}/20)`}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )
                ))}
              </div>

              {/* Appréciations */}
              <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Appréciation générale</label>
                  <textarea style={{ ...inputSt, height: 60, marginTop: 4 }}
                    value={selectedBulletin.appreciationGenerale || ""}
                    onChange={(e) => setSelectedBulletin({ ...selectedBulletin, appreciationGenerale: e.target.value })}
                    onBlur={() => handleUpdateBulletin(selectedBulletin._id, { appreciationGenerale: selectedBulletin.appreciationGenerale })}
                    placeholder="Saisir une appréciation..." />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Avis du conseil de classe</label>
                  <textarea style={{ ...inputSt, height: 60, marginTop: 4 }}
                    value={selectedBulletin.appreciationConseil || ""}
                    onChange={(e) => setSelectedBulletin({ ...selectedBulletin, appreciationConseil: e.target.value })}
                    onBlur={() => handleUpdateBulletin(selectedBulletin._id, { appreciationConseil: selectedBulletin.appreciationConseil })}
                    placeholder="Avis du conseil..." />
                </div>
              </div>

              {/* Pied */}
              <div style={{ marginTop: 30, display: "flex", justifyContent: "space-between", borderTop: "1px solid #d1d5db", paddingTop: 16, fontSize: 11, color: "#6b7280" }}>
                <div>Fait le {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</div>
                <div>Signature du directeur</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #bulletin-print, #bulletin-print * { visibility: visible; }
          #bulletin-print { position: absolute; left: 0; top: 0; width: 100%; padding: 20px !important; box-shadow: none !important; }
          button, select, textarea, input { display: none !important; }
        }
      `}</style>
    </div>
  );
}

/* ═══ Sub-components ═══ */
function StatCard({ label, value, color }) {
  return (
    <div style={{ background: "#fff", padding: 12, borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function InfoLine({ label, value, bold }) {
  return (
    <div style={{ display: "flex", padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ width: 140, color: "#6b7280", fontWeight: 500, fontSize: 12 }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 400, fontSize: 13 }}>{value || "-"}</span>
    </div>
  );
}

/* ═══ STYLES ═══ */
const sidebarStyle = { width: 200, background: "#0f172a", color: "#fff", padding: 20 };
const sidebarItemStyle = { padding: 12, marginBottom: 10, borderRadius: 8, cursor: "pointer", background: "#1e3a8a" };
const card = { background: "#fff", padding: 20, borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" };
const filterBar = { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16, padding: 14, background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" };
const filterInput = { padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 };
const tableStyle = { width: "100%", borderCollapse: "collapse" };
const th = { padding: "10px 12px", textAlign: "left", fontSize: 12, color: "#6b7280", background: "#f9fafb", fontWeight: 600 };
const td = { padding: "10px 12px", fontSize: 13 };
const thPrint = { padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 700 };
const tdPrint = { padding: "8px 10px", fontSize: 12 };
const btnPrimary = { padding: "10px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 };
const btnGray = { padding: "10px 18px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 };
const btnSmall = { padding: "4px 8px", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 600 };
const inputSt = { padding: 8, width: "100%", borderRadius: 6, border: "1px solid #d1d5db", boxSizing: "border-box", fontSize: 12 };