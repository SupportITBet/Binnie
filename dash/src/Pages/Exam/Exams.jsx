// src/pages/Exams.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useUserContext } from "../../contexts/UserContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

const API = "http://localhost:8080";

/* ================= SIDEBAR ================= */
const TeacherSidebar = () => {
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
      <h2 style={{ marginBottom: "30px", color: "#fff" }}>Menu</h2>
      {items.map((item, idx) => (
        <div key={idx} style={sidebarItemStyle} onClick={() => navigate(item.path)}>{item.name}</div>
      ))}
    </div>
  );
};

/* ================= HELPERS ================= */
const EXAM_TYPES = [
  { value: "examen_final", label: "Examen final", color: "#ef4444", icon: "🎓" },
  { value: "partiel", label: "Partiel", color: "#f59e0b", icon: "📝" },
  { value: "devoir", label: "Devoir surveillé", color: "#3b82f6", icon: "📋" },
  { value: "interro_surprise", label: "Interro surprise", color: "#8b5cf6", icon: "⚡" },
  { value: "rattrapage", label: "Rattrapage", color: "#10b981", icon: "🔄" },
];

const getExamTypeInfo = (type) => EXAM_TYPES.find((t) => t.value === type) || EXAM_TYPES[2];

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("fr-FR", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });
  } catch { return dateStr; }
};

/* ================= PAGE EXAMS ================= */
export default function Exams() {
  const { user, getAuthHeaders } = useUserContext();
  const confirm = useConfirm();

  const [exams, setExams] = useState([]);
  const [courses, setCourses] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingExam, setEditingExam] = useState(null);

  // Créneaux libres
  const [daySlots, setDaySlots] = useState(null);
  const [courseCompletion, setCourseCompletion] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // 🔥 Disponibilité salles
  const [availableRooms, setAvailableRooms] = useState([]);
  const [roomSlots, setRoomSlots] = useState(null); // planning d'une salle
  const [loadingRoomSlots, setLoadingRoomSlots] = useState(false);
  const [showRoomGrid, setShowRoomGrid] = useState(false);

  // Filtres
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [classFilterList, setClassFilterList] = useState("");

  const [form, setForm] = useState({
    title: "", examType: "devoir", course: "", teacher: "", class: "",
    date: "", startTime: "", endTime: "", duration: "", room: "", totalPoints: 20,
  });

  /* ============ FETCH ============ */
  const fetchExams = async () => {
    try { const res = await fetch(`${API}/get/all/exams`, { headers: getAuthHeaders() }); const d = await res.json(); setExams(Array.isArray(d) ? d : []); }
    catch { toast.error("Erreur examens"); }
  };
  const fetchCourses = async () => {
    try { const res = await fetch(`${API}/get/courses?adminId=${user._id}`, { headers: getAuthHeaders() }); const d = await res.json(); setCourses(Array.isArray(d) ? d : []); }
    catch { toast.error("Erreur cours"); }
  };
  const fetchClasses = async () => {
    try { const res = await fetch(`${API}/get/all/classes`, { headers: getAuthHeaders() }); const d = await res.json(); setClasses(Array.isArray(d) ? d : []); }
    catch { toast.error("Erreur classes"); }
  };
  const fetchTeachers = async () => {
    try { const res = await fetch(`${API}/get/teachers`, { headers: getAuthHeaders() }); const d = await res.json(); setTeachers(Array.isArray(d) ? d : []); }
    catch { toast.error("Erreur professeurs"); }
  };
  const fetchRooms = async () => {
    try { const res = await fetch(`${API}/get/rooms`, { headers: getAuthHeaders() }); const d = await res.json(); setRooms(Array.isArray(d) ? d : []); }
    catch { console.error("Erreur salles"); }
  };

  useEffect(() => {
    if (user?._id) { fetchExams(); fetchCourses(); fetchClasses(); fetchTeachers(); fetchRooms(); }
  }, [user]);

  /* ============ CHARGER CRÉNEAUX LIBRES (classe) ============ */
  const loadFreeSlots = async (classId, date) => {
    if (!classId || !date) { setDaySlots(null); return; }
    setLoadingSlots(true);
    try {
      const res = await fetch(`${API}/get/free-slots?classId=${classId}&date=${date}`, { headers: getAuthHeaders() });
      setDaySlots(await res.json());
    } catch { setDaySlots(null); }
    finally { setLoadingSlots(false); }
  };

  /* ============ 🔥 CHARGER SALLES LIBRES AU CRÉNEAU SÉLECTIONNÉ ============ */
  const loadAvailableRooms = async () => {
    if (!form.date || !form.startTime || !form.endTime) {
      toast.error("Sélectionnez d'abord un créneau horaire");
      return;
    }
    try {
      const res = await fetch(
        `${API}/get/available-rooms?date=${form.date}&startTime=${form.startTime}&endTime=${form.endTime}`,
        { headers: getAuthHeaders() }
      );
      const d = await res.json();
      setAvailableRooms(Array.isArray(d.available) ? d.available : []);
      setShowRoomGrid(true);
    } catch { setAvailableRooms([]); }
  };

  /* ============ 🔥 PLANNING D'UNE SALLE SPÉCIFIQUE ============ */
  const loadRoomSlots = async (roomId) => {
    if (!roomId || !form.date) return;
    setLoadingRoomSlots(true);
    try {
      const res = await fetch(`${API}/get/room-slots?roomId=${roomId}&date=${form.date}`, { headers: getAuthHeaders() });
      setRoomSlots(await res.json());
    } catch { setRoomSlots(null); }
    finally { setLoadingRoomSlots(false); }
  };

  /* ============ VÉRIFIER COMPLÉTION COURS ============ */
  const checkCourseCompletion = async (courseId) => {
    if (!courseId) { setCourseCompletion(null); return; }
    try {
      const res = await fetch(`${API}/get/course-completion/${courseId}`, { headers: getAuthHeaders() });
      setCourseCompletion(await res.json());
    } catch { setCourseCompletion(null); }
  };

  /* ============ MODAL ============ */
  const openAddModal = () => {
    setEditingExam(null);
    setForm({ title: "", examType: "devoir", course: "", teacher: "", class: "", date: "", startTime: "", endTime: "", duration: "", room: "", totalPoints: 20 });
    setDaySlots(null); setCourseCompletion(null); setAvailableRooms([]); setRoomSlots(null); setShowRoomGrid(false);
    setShowModal(true);
  };

  const openEditModal = (exam) => {
    setEditingExam(exam);
    setForm({
      title: exam.title || "", examType: exam.examType || "devoir",
      course: exam.course?._id || "", teacher: exam.teacher?._id || "",
      class: exam.class?._id || "", date: exam.date || "",
      startTime: exam.startTime || "", endTime: exam.endTime || "",
      duration: exam.duration || "", room: exam.room?._id || exam.room || "",
      totalPoints: exam.totalPoints || 20,
    });
    setShowModal(true);
    if (exam.class?._id && exam.date) loadFreeSlots(exam.class._id, exam.date);
    if (exam.course?._id) checkCourseCompletion(exam.course._id);
  };

  /* ============ SÉLECTION CRÉNEAUX ============ */
  const handleSlotClick = (slot) => {
    if (slot.status !== "free") return;
    const hour = slot.hour;
    const currentStart = form.startTime ? parseInt(form.startTime) : null;
    const currentEnd = form.endTime ? parseInt(form.endTime) : null;

    if (!currentStart) {
      setForm({ ...form, startTime: `${hour}:00`, endTime: `${hour + 1}:00`, duration: 60 });
    } else if (hour === currentEnd) {
      setForm({ ...form, endTime: `${hour + 1}:00`, duration: (hour + 1 - currentStart) * 60 });
    } else if (hour === currentStart - 1) {
      setForm({ ...form, startTime: `${hour}:00`, duration: (currentEnd - hour) * 60 });
    } else {
      setForm({ ...form, startTime: `${hour}:00`, endTime: `${hour + 1}:00`, duration: 60 });
    }
    // Reset room selection quand le créneau change
    setAvailableRooms([]); setShowRoomGrid(false); setRoomSlots(null);
  };

  const isSlotSelected = (hour) => {
    if (!form.startTime || !form.endTime) return false;
    return hour >= parseInt(form.startTime) && hour < parseInt(form.endTime);
  };

  /* ============ SAVE ============ */
  const handleSave = async () => {
    if (!form.title || !form.course || !form.class || !form.date || !form.startTime || !form.endTime) {
      toast.error("Remplissez tous les champs obligatoires !");
      return;
    }
    try {
      const url = editingExam ? `${API}/update/exams/${editingExam._id}` : `${API}/create/exams`;
      const payload = {
        title: form.title, examType: form.examType, course: form.course,
        class: form.class, date: form.date, startTime: form.startTime, endTime: form.endTime,
        duration: form.duration || (parseInt(form.endTime) - parseInt(form.startTime)) * 60,
        totalPoints: form.totalPoints || 20, adminId: user._id,
      };
      if (form.teacher) payload.teacher = form.teacher;
      if (form.room) payload.room = form.room;

      const res = await fetch(url, {
        method: editingExam ? "PUT" : "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(editingExam ? "Examen mis à jour !" : "Examen programmé !");
        setShowModal(false); fetchExams();
      } else toast.error(data.message || "Erreur");
    } catch { toast.error("Erreur serveur"); }
  };

  const handleDelete = async (id) => {
    if (!(await confirm("Supprimer ?", { titre: "Supprimer l'examen" }))) return;
    try {
      const res = await fetch(`${API}/delete/exams/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (res.ok) { toast.success("Supprimé !"); fetchExams(); } else toast.error("Erreur");
    } catch { toast.error("Erreur serveur"); }
  };

  /* ============ FILTRES ============ */
  const filteredExams = (Array.isArray(exams) ? exams : []).filter((e) => {
    if (typeFilter && e.examType !== typeFilter) return false;
    if (statusFilter && e.status !== statusFilter) return false;
    if (classFilterList && e.class?._id !== classFilterList) return false;
    return true;
  });

  const autoTitle = () => {
    const courseName = courses.find((c) => c._id === form.course)?.title || "";
    const typeInfo = getExamTypeInfo(form.examType);
    if (courseName) setForm({ ...form, title: `${typeInfo.label} - ${courseName}` });
  };

  /* ============ RENDER ============ */
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f9fafb" }}>
      <TeacherSidebar />
      <div style={{ flex: 1, padding: 20 }}>
        <h1 style={{ marginBottom: 20 }}>📝 Examens & évaluations</h1>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 15 }}>
          <button onClick={openAddModal} style={buttonStyle}>Programmer une évaluation</button>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={filterInput}>
            <option value="">Tous les types</option>
            {EXAM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={filterInput}>
            <option value="">Tous les statuts</option>
            <option value="scheduled">Programmé</option>
            <option value="completed">Terminé</option>
            <option value="cancelled">Annulé</option>
          </select>
          <select value={classFilterList} onChange={(e) => setClassFilterList(e.target.value)} style={filterInput}>
            <option value="">Toutes les classes</option>
            {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </div>

        {/* ══ TABLEAU ══ */}
        <div style={cardStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th>Type</th><th>Titre</th><th>Cours</th><th>Classe</th>
                <th>Date</th><th>Horaire</th><th>Salle</th><th>Statut</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredExams.length > 0 ? filteredExams.map((e) => {
                const typeInfo = getExamTypeInfo(e.examType);
                return (
                  <tr key={e._id}>
                    <td><span style={{ background: typeInfo.color + "20", color: typeInfo.color, padding: "3px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{typeInfo.icon} {typeInfo.label}</span></td>
                    <td style={{ fontWeight: 500 }}>{e.title}</td>
                    <td>{e.course?.title || "-"}</td>
                    <td>{e.class?.name || "-"}</td>
                    <td>{formatDate(e.date)}</td>
                    <td>{e.startTime} - {e.endTime}</td>
                    <td>
                      {e.room?.name ? (
                        <span style={{ padding: "2px 8px", borderRadius: 8, fontSize: 11, background: "#dbeafe", color: "#1e40af" }}>📍 {e.room.name}</span>
                      ) : "-"}
                    </td>
                    <td>
                      <span style={{
                        padding: "3px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                        background: e.status === "completed" ? "#dcfce7" : e.status === "cancelled" ? "#fee2e2" : "#dbeafe",
                        color: e.status === "completed" ? "#166534" : e.status === "cancelled" ? "#991b1b" : "#1e40af",
                      }}>{e.status === "scheduled" ? "Programmé" : e.status === "completed" ? "Terminé" : e.status === "cancelled" ? "Annulé" : e.status}</span>
                    </td>
                    <td>
                      <button style={editButtonStyle} onClick={() => openEditModal(e)}>Modifier</button>
                      <button style={{ ...buttonStyle, background: "#ef4444", marginLeft: 5, padding: "5px 10px" }} onClick={() => handleDelete(e._id)}>Supprimer</button>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="9" style={{ textAlign: "center", padding: 20, color: "#9ca3af" }}>Aucun examen</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ══════════════════════════════════════
         *  MODAL PROGRAMMER
         * ══════════════════════════════════════ */}
        {showModal && (
          <div style={modalStyle}>
            <div style={{ ...modalContentStyle, width: "750px", maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto" }}>
              <h2>{editingExam ? "Modifier l'évaluation" : "Programmer une évaluation"}</h2>

              {/* Type */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                {EXAM_TYPES.map((t) => (
                  <button key={t.value}
                    style={{
                      padding: "8px 14px", borderRadius: 8, border: "2px solid",
                      borderColor: form.examType === t.value ? t.color : "#e5e7eb",
                      background: form.examType === t.value ? t.color + "15" : "#fff",
                      color: form.examType === t.value ? t.color : "#6b7280",
                      cursor: "pointer", fontSize: 13, fontWeight: 600,
                    }}
                    onClick={() => { setForm({ ...form, examType: t.value }); if (form.course) checkCourseCompletion(form.course); }}
                  >{t.icon} {t.label}</button>
                ))}
              </div>

              {/* Titre */}
              <div style={{ display: "flex", gap: 8 }}>
                <input type="text" placeholder="Titre *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
                <button onClick={autoTitle} style={{ ...buttonStyle, padding: "8px 12px", marginTop: 0, fontSize: 12 }}>Auto</button>
              </div>

              {/* Cours + Prof */}
              <div style={{ display: "flex", gap: 10 }}>
                <select style={{ ...inputStyle, flex: 1 }} value={form.course}
                  onChange={(e) => {
                    const courseId = e.target.value;
                    setForm({ ...form, course: courseId });
                    checkCourseCompletion(courseId);
                    const course = courses.find((c) => c._id === courseId);
                    if (course?.teacher?._id) setForm((p) => ({ ...p, course: courseId, teacher: course.teacher._id }));
                  }}>
                  <option value="">📘 Cours *</option>
                  {courses.map((c) => <option key={c._id} value={c._id}>{c.title} ({c.level} {c.major})</option>)}
                </select>
                <select style={{ ...inputStyle, flex: 1 }} value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })}>
                  <option value="">👨‍🏫 Professeur</option>
                  {teachers.map((t) => <option key={t._id} value={t._id}>{t.fullname || t.name}</option>)}
                </select>
              </div>

              {/* Complétion cours */}
              {courseCompletion && (
                <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 10, fontSize: 12, background: courseCompletion.isComplete ? "#dcfce7" : "#fef3c7", border: `1px solid ${courseCompletion.isComplete ? "#86efac" : "#fcd34d"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600 }}>{courseCompletion.isComplete ? "✅ Cours terminé" : "⏳ Cours en cours"}</span>
                    <span>{courseCompletion.progress}% - {courseCompletion.hoursEffectue || 0}h / {courseCompletion.totalHours}h</span>
                  </div>
                  <div style={{ height: 6, background: "#e5e7eb", borderRadius: 3, marginTop: 6 }}>
                    <div style={{ height: "100%", borderRadius: 3, width: `${Math.min(100, courseCompletion.progress)}%`, background: courseCompletion.isComplete ? "#22c55e" : "#f59e0b" }} />
                  </div>
                  {!courseCompletion.isComplete && form.examType === "examen_final" && (
                    <div style={{ color: "#b45309", marginTop: 6, fontSize: 11 }}>⚠️ L'examen final ne peut être programmé qu'après la fin du cours.</div>
                  )}
                </div>
              )}

              {/* Classe + Date */}
              <div style={{ display: "flex", gap: 10 }}>
                <select style={{ ...inputStyle, flex: 1 }} value={form.class}
                  onChange={(e) => { setForm({ ...form, class: e.target.value, startTime: "", endTime: "", duration: "", room: "" }); if (form.date) loadFreeSlots(e.target.value, form.date); setAvailableRooms([]); setShowRoomGrid(false); setRoomSlots(null); }}>
                  <option value="">🏫 Classe *</option>
                  {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
                <input type="date" style={{ ...inputStyle, flex: 1 }} value={form.date}
                  onChange={(e) => { setForm({ ...form, date: e.target.value, startTime: "", endTime: "", duration: "", room: "" }); if (form.class) loadFreeSlots(form.class, e.target.value); setAvailableRooms([]); setShowRoomGrid(false); setRoomSlots(null); }} />
              </div>

              {/* Points */}
              <div style={{ display: "flex", gap: 10 }}>
                <input type="number" placeholder="Note sur..." value={form.totalPoints} onChange={(e) => setForm({ ...form, totalPoints: Number(e.target.value) })} style={{ ...inputStyle, flex: 1 }} />
              </div>

              {/* ══════════════════════════════════════
               * GRILLE CRÉNEAUX CLASSE
               * ══════════════════════════════════════ */}
              {form.class && form.date && (
                <div style={{ marginTop: 5 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                    <span>📅 Créneaux - {daySlots?.day || ""} {formatDate(form.date)}</span>
                    {form.startTime && (
                      <button onClick={() => { setForm({ ...form, startTime: "", endTime: "", duration: "", room: "" }); setAvailableRooms([]); setShowRoomGrid(false); setRoomSlots(null); }}
                        style={{ fontSize: 11, background: "#fee2e2", color: "#991b1b", border: "none", borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}>Réinitialiser</button>
                    )}
                  </div>

                  {loadingSlots ? (
                    <div style={{ textAlign: "center", padding: 20, color: "#9ca3af" }}>Chargement...</div>
                  ) : daySlots?.slots ? (
                    <>
                      <div style={{ display: "flex", gap: 12, marginBottom: 8, fontSize: 11, color: "#6b7280" }}>
                        <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#dcfce7", borderRadius: 3, verticalAlign: "middle" }} /> Libre</span>
                        <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#3b82f6", borderRadius: 3, verticalAlign: "middle" }} /> Cours</span>
                        <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#ef4444", borderRadius: 3, verticalAlign: "middle" }} /> Examen</span>
                        <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#8b5cf6", borderRadius: 3, verticalAlign: "middle" }} /> Sélectionné</span>
                      </div>

                      <div style={{ display: "flex", gap: 3, overflowX: "auto", paddingBottom: 8 }}>
                        {daySlots.slots.map((slot) => {
                          const selected = isSlotSelected(slot.hour);
                          const isFree = slot.status === "free";
                          let bg = "#dcfce7", color = "#166534", cursor = "pointer";
                          if (slot.status === "course") { bg = "#3b82f6"; color = "#fff"; cursor = "not-allowed"; }
                          else if (slot.status === "exam") { bg = "#ef4444"; color = "#fff"; cursor = "not-allowed"; }
                          else if (selected) { bg = "#8b5cf6"; color = "#fff"; }

                          return (
                            <div key={slot.hour} onClick={() => isFree && handleSlotClick(slot)}
                              style={{ minWidth: 72, padding: "8px 6px", borderRadius: 8, background: bg, color, cursor, textAlign: "center", fontSize: 11, lineHeight: 1.3, border: selected ? "2px solid #6d28d9" : "1px solid transparent" }}>
                              <div style={{ fontWeight: 700, fontSize: 12 }}>{slot.hour}:00</div>
                              <div style={{ fontSize: 10 }}>{slot.status !== "free" ? slot.label : selected ? "✔" : "Libre"}</div>
                              {slot.room && <div style={{ fontSize: 9, opacity: 0.7 }}>📍 {slot.room}</div>}
                            </div>
                          );
                        })}
                      </div>

                      {form.startTime && form.endTime && (
                        <div style={{ marginTop: 8, padding: "10px 14px", borderRadius: 8, background: "#f3e8ff", border: "1px solid #c4b5fd", fontSize: 13 }}>
                          <span style={{ fontWeight: 600 }}>Créneau :</span> {form.startTime} → {form.endTime} ({(parseInt(form.endTime) - parseInt(form.startTime)) * 60} min)
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 11, color: "#6b7280" }}>
                        <span>🟢 {daySlots.freeSlotsCount} libres</span>
                        <span>🔵 {daySlots.coursesSlotsCount} cours</span>
                        <span>🔴 {daySlots.examsSlotsCount} examens</span>
                      </div>
                    </>
                  ) : null}
                </div>
              )}

              {/* ══════════════════════════════════════
               * 🔥 SÉLECTION DE SALLE - avec grille
               * ══════════════════════════════════════ */}
              {form.startTime && form.endTime && form.date && (
                <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <h4 style={{ margin: 0, fontSize: 14, color: "#374151" }}>🏫 Choisir une salle</h4>
                    <button onClick={loadAvailableRooms} style={{ ...buttonStyle, marginTop: 0, fontSize: 12, padding: "6px 14px" }}>
                      Afficher les salles libres
                    </button>
                  </div>

                  {/* Dropdown + salles libres */}
                  <select style={inputStyle} value={form.room}
                    onChange={(e) => { setForm({ ...form, room: e.target.value }); if (e.target.value) loadRoomSlots(e.target.value); else setRoomSlots(null); }}>
                    <option value="">📍 Sélectionner une salle</option>
                    {rooms.map((r) => <option key={r._id} value={r._id}>{r.name} ({r.capacity}p) - {r.type} - {r.building || ""}</option>)}
                  </select>

                  {/* Boutons salles libres */}
                  {showRoomGrid && availableRooms.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#22c55e", marginBottom: 6 }}>
                        ✅ {availableRooms.length} salle(s) libre(s) de {form.startTime} à {form.endTime} :
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {availableRooms.map((r) => (
                          <button key={r._id}
                            onClick={() => { setForm({ ...form, room: r._id }); loadRoomSlots(r._id); }}
                            style={{
                              padding: "6px 12px", borderRadius: 10, fontSize: 12, cursor: "pointer", fontWeight: 600,
                              border: form.room === r._id ? "2px solid #22c55e" : "1px solid #d1d5db",
                              background: form.room === r._id ? "#dcfce7" : "#fff",
                              color: form.room === r._id ? "#166534" : "#374151",
                            }}>
                            📍 {r.name} ({r.capacity}p)
                            {r.building && <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 4 }}>{r.building}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {showRoomGrid && availableRooms.length === 0 && (
                    <div style={{ padding: 10, borderRadius: 8, background: "#fee2e2", color: "#991b1b", fontSize: 12, marginBottom: 10 }}>
                      ❌ Aucune salle libre de {form.startTime} à {form.endTime}. Changez l'horaire ou la date.
                    </div>
                  )}

                  {/* 🔥 GRILLE PLANNING DE LA SALLE SÉLECTIONNÉE */}
                  {form.room && roomSlots && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                        📅 Planning de {roomSlots.room?.name} - {roomSlots.day} {formatDate(form.date)}
                      </div>
                      <div style={{ display: "flex", gap: 3, overflowX: "auto", paddingBottom: 6 }}>
                        {roomSlots.slots?.map((slot) => {
                          const isFree = slot.status === "free";
                          const isMySlot = isSlotSelected(slot.hour);
                          let bg = "#dcfce7", clr = "#166534";
                          if (slot.status === "course") { bg = "#3b82f6"; clr = "#fff"; }
                          else if (slot.status === "exam") { bg = "#ef4444"; clr = "#fff"; }
                          if (isMySlot && isFree) { bg = "#22c55e"; clr = "#fff"; }

                          return (
                            <div key={slot.hour} style={{
                              minWidth: 68, padding: "6px 4px", borderRadius: 6, background: bg, color: clr,
                              textAlign: "center", fontSize: 10, lineHeight: 1.3,
                              border: isMySlot ? "2px solid #166534" : "1px solid transparent",
                            }}>
                              <div style={{ fontWeight: 700, fontSize: 11 }}>{slot.hour}:00</div>
                              <div>{isMySlot && isFree ? "✔ Votre exam" : slot.label}</div>
                              {slot.class && <div style={{ fontSize: 9, opacity: 0.8 }}>{slot.class}</div>}
                              {slot.teacher && <div style={{ fontSize: 8, opacity: 0.7 }}>{slot.teacher}</div>}
                            </div>
                          );
                        })}
                      </div>
                      {loadingRoomSlots && <div style={{ fontSize: 11, color: "#9ca3af" }}>Chargement...</div>}
                    </div>
                  )}
                </div>
              )}

              {/* Boutons */}
              <div style={{ marginTop: 15, display: "flex", gap: 10 }}>
                <button onClick={handleSave} style={{ ...buttonStyle, padding: "12px 24px", fontSize: 14 }}>
                  {editingExam ? "Mettre à jour" : "✅ Programmer"}
                </button>
                <button onClick={() => setShowModal(false)} style={{ ...buttonStyle, background: "#aaa" }}>Annuler</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= STYLES ================= */
const sidebarStyle = { width: "200px", background: "#0f172a", color: "#fff", padding: "20px" };
const sidebarItemStyle = { padding: "12px", marginBottom: "10px", borderRadius: "8px", cursor: "pointer", background: "#1e3a8a" };
const cardStyle = { background: "#fff", padding: "10px", borderRadius: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" };
const tableStyle = { width: "100%", borderCollapse: "collapse" };
const buttonStyle = { padding: "10px 15px", background: "#2563eb", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", marginTop: "10px" };
const editButtonStyle = { padding: "5px 10px", background: "#10b981", color: "white", border: "none", borderRadius: "5px", cursor: "pointer" };
const inputStyle = { padding: "10px", marginBottom: "10px", width: "100%", borderRadius: "5px", border: "1px solid #ccc", boxSizing: "border-box" };
const filterInput = { padding: "8px 12px", borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "13px" };
const modalStyle = { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 };
const modalContentStyle = { background: "#fff", padding: "20px", borderRadius: "10px", width: "400px" };