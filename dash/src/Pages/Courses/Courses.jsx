// src/pages/Courses.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useUserContext } from "../../contexts/UserContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  format, isSameDay, addWeeks, subWeeks, addMonths, subMonths,
  isBefore, startOfDay, parseISO, eachDayOfInterval,
} from "date-fns";
import { fr } from "date-fns/locale";
import SessionMarker from "../Session/SessionMarker";

/* ================= HELPERS ================= */
const DAYS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const dayOffset = { Lundi: 0, Mardi: 1, Mercredi: 2, Jeudi: 3, Vendredi: 4, Samedi: 5, Dimanche: 6 };

const frenchDayName = (date) => {
  const raw = format(date, "EEEE", { locale: fr });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

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
    { name: "Salles", path: "/rooms" },
    { name: "bulletins", path: "/bulletins" },
    { name: "Notifications", path: "/notifications" },
    { name: "Gestion Utilisateurs", path: "/administrator" },
      { name: "Administration", path: "/administration" },
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

/* ================= PAGE COURSES ================= */
export default function Courses() {
  const { user, getAuthHeaders, token } = useUserContext();
  const confirm = useConfirm();
  const [showModal, setShowModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [form, setForm] = useState({ title: "", description: "", credits: "" });
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [filter, setFilter] = useState("all");
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [editingSlot, setEditingSlot] = useState(null);
  const [movingSlot, setMovingSlot] = useState(null);
  const [levelFilter, setLevelFilter] = useState("");
  const [majorFilter, setMajorFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("week");
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [courseTitle, setCourseTitle] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [courseCredits, setCourseCredits] = useState("");
  const [courses, setCourses] = useState([]);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleHour, setRescheduleHour] = useState("");
  const [slotToReschedule, setSlotToReschedule] = useState(null);
  const [programmingInProgress, setProgrammingInProgress] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // 🔥 schedForm avec classes[] (tableau pour multi-sélection)
  const [schedForm, setSchedForm] = useState({
    course: "", teacher: "", classes: [], room: "",
    totalHours: "", slotDuration: 2,
    startDate: format(new Date(), "yyyy-MM-dd"),
  });

  /* ============ NAVIGATION ============ */
  const goToPrev = () => {
    if (timeFilter === "day") setReferenceDate((d) => subDays(d, 1));
    else if (timeFilter === "week") setReferenceDate((d) => subWeeks(d, 1));
    else setReferenceDate((d) => subMonths(d, 1));
  };
  const goToNext = () => {
    if (timeFilter === "day") setReferenceDate((d) => addDays(d, 1));
    else if (timeFilter === "week") setReferenceDate((d) => addWeeks(d, 1));
    else setReferenceDate((d) => addMonths(d, 1));
  };
  const goToToday = () => setReferenceDate(new Date());

  /* ============ JOURS VISIBLES ============ */
  const visibleDayEntries = useMemo(() => {
    const today = new Date();
    if (timeFilter === "day") {
      return [{ dayName: frenchDayName(referenceDate), date: referenceDate, dateStr: format(referenceDate, "yyyy-MM-dd"), dateLabel: format(referenceDate, "d MMM", { locale: fr }), isToday: isSameDay(referenceDate, today) }];
    }
    if (timeFilter === "week") {
      const monday = startOfWeek(referenceDate, { weekStartsOn: 1 });
      return Array.from({ length: 7 }, (_, i) => {
        const d = addDays(monday, i);
        return { dayName: frenchDayName(d), date: d, dateStr: format(d, "yyyy-MM-dd"), dateLabel: format(d, "d MMM", { locale: fr }), isToday: isSameDay(d, today) };
      });
    }
    const calStart = startOfWeek(startOfMonth(referenceDate), { weekStartsOn: 1 });
    const calEnd = endOfWeek(endOfMonth(referenceDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd }).map((d) => ({
      dayName: frenchDayName(d), date: d, dateStr: format(d, "yyyy-MM-dd"),
      dateLabel: format(d, "d MMM", { locale: fr }), isToday: isSameDay(d, today),
      isCurrentMonth: d.getMonth() === referenceDate.getMonth(),
    }));
  }, [timeFilter, referenceDate]);

  const monthWeeks = useMemo(() => {
    if (timeFilter !== "month") return [];
    const weeks = [];
    for (let i = 0; i < visibleDayEntries.length; i += 7) weeks.push(visibleDayEntries.slice(i, i + 7));
    return weeks;
  }, [timeFilter, visibleDayEntries]);

  const periodLabel = useMemo(() => {
    if (timeFilter === "day") return format(referenceDate, "EEEE d MMMM yyyy", { locale: fr });
    if (timeFilter === "week") {
      const mon = startOfWeek(referenceDate, { weekStartsOn: 1 });
      const sun = endOfWeek(referenceDate, { weekStartsOn: 1 });
      return `${format(mon, "d MMM", { locale: fr })} - ${format(sun, "d MMM yyyy", { locale: fr })}`;
    }
    return format(referenceDate, "MMMM yyyy", { locale: fr });
  }, [timeFilter, referenceDate]);

  const safeSchedule = Array.isArray(schedule) ? schedule : [];

  const classFilteredSchedule = useMemo(() => {
    if (!classFilter) return safeSchedule;
    return safeSchedule.filter((s) => s.class?._id === classFilter);
  }, [safeSchedule, classFilter]);

  const hours = Array.from({ length: 14 }, (_, i) => i + 8);

  /* ============ RECHERCHE CRÉNEAUX (planning view) ============ */
  const findSlotForDate = (dateStr, dayName, hour) => {
    if (!Array.isArray(classFilteredSchedule)) return undefined;
    return classFilteredSchedule.find((s) => {
      const startH = parseInt(s.startTime);
      const endH = parseInt(s.endTime);
      if (!(hour >= startH && hour < endH)) return false;
      if (s.date) return s.date === dateStr;
      return s.day === dayName;
    });
  };

  const findSlotStartForDate = (dateStr, dayName, hour) => {
    if (!Array.isArray(classFilteredSchedule)) return undefined;
    return classFilteredSchedule.find((s) => {
      if (parseInt(s.startTime) !== hour) return false;
      if (s.date) return s.date === dateStr;
      return s.day === dayName;
    });
  };

  /* ═══════════════════════════════════════════════════════════════
   * 🔥 GRILLE MODAL PROGRAMMER : Analyser occupation par jour/heure
   * pour TOUTES les classes sélectionnées + conflit salle
   * ═══════════════════════════════════════════════════════════════ */
  const getSlotStatus = (day, hour) => {
    // Retourne : { status, label, details }
    // status: "free" | "class_busy" | "room_busy" | "teacher_busy" | "class_and_room"
    const selectedClassIds = schedForm.classes;
    const selectedRoomId = schedForm.room;
    const selectedTeacherId = schedForm.teacher;

    let classBusy = null;   // Une des classes sélectionnées est occupée
    let roomBusy = null;    // La salle est occupée par une AUTRE classe
    let teacherBusy = null; // Le prof est occupé

    for (const s of safeSchedule) {
      const sStart = parseInt(s.startTime);
      const sEnd = parseInt(s.endTime);
      if (s.day !== day || !(hour >= sStart && hour < sEnd)) continue;
      if (s.sessionStatus === "annule") continue;

      const slotClassId = s.class?._id;
      const slotRoomId = s.room?._id;
      const slotTeacherId = s.teacher?._id;

      // 1. Conflit classe : une des classes sélectionnées est déjà occupée
      if (selectedClassIds.includes(slotClassId)) {
        classBusy = s;
      }

      // 2. Conflit salle : la salle choisie est occupée par une AUTRE classe
      if (selectedRoomId && slotRoomId === selectedRoomId && !selectedClassIds.includes(slotClassId)) {
        roomBusy = s;
      }

      // 3. Conflit prof : le prof sélectionné est déjà occupé
      if (selectedTeacherId && slotTeacherId === selectedTeacherId && !selectedClassIds.includes(slotClassId)) {
        teacherBusy = s;
      }
    }

    if (classBusy && roomBusy) {
      return {
        status: "class_and_room",
        label: `${classBusy.course?.title || "Occupé"}`,
        detail: `Classe + Salle occupées`,
        slot: classBusy,
      };
    }
    if (classBusy) {
      return {
        status: "class_busy",
        label: classBusy.course?.title || "Occupé",
        detail: `${classBusy.class?.name || "Classe"} occupée`,
        slot: classBusy,
      };
    }
    if (roomBusy) {
      return {
        status: "room_busy",
        label: `🔒 ${roomBusy.class?.name}`,
        detail: `Salle prise par ${roomBusy.class?.name} (${roomBusy.course?.title})`,
        slot: roomBusy,
      };
    }
    if (teacherBusy) {
      return {
        status: "teacher_busy",
        label: `👨‍🏫 Occupé`,
        detail: `Prof en ${teacherBusy.class?.name} (${teacherBusy.course?.title})`,
        slot: teacherBusy,
      };
    }
    return { status: "free", label: "Libre", detail: "", slot: null };
  };

  /* ============ PREVIEW ============ */
  const previewSlots = useMemo(() => {
    const totalH = Number(schedForm.totalHours) || 0;
    const duration = Number(schedForm.slotDuration) || 2;
    if (!totalH || !selectedSlots.length) return { slots: [], totalGenerated: 0, weeks: 0, hoursPerWeek: 0, isValid: true, errorMessage: "" };

    const totalSlots = Math.ceil(totalH / duration);
    const hoursPerWeek = selectedSlots.length * duration;
    const startDate = new Date(schedForm.startDate + "T12:00:00");
    const today = startOfDay(new Date());
    if (isBefore(startDate, today)) {
      return { slots: [], totalGenerated: 0, weeks: 0, hoursPerWeek: 0, isValid: false, errorMessage: "Date de début dans le passé" };
    }

    const monday = startOfWeek(startDate, { weekStartsOn: 1 });
    const sorted = [...selectedSlots].sort((a, b) => (dayOffset[a.day] ?? 0) - (dayOffset[b.day] ?? 0) || a.hour - b.hour);
    const allSlots = [];
    let remaining = totalSlots;

    for (let w = 0; remaining > 0 && w < 200; w++) {
      const weekMonday = addDays(monday, w * 7);
      for (const slot of sorted) {
        if (remaining <= 0) break;
        const slotDate = addDays(weekMonday, dayOffset[slot.day] ?? 0);
        if (isBefore(slotDate, today)) continue;
        allSlots.push({
          day: slot.day,
          date: format(slotDate, "yyyy-MM-dd"),
          dateLabel: format(slotDate, "EEE d MMM yyyy", { locale: fr }),
          startTime: `${slot.hour}:00`,
          endTime: `${slot.hour + duration}:00`,
        });
        remaining--;
      }
    }

    const actualWeeks = allSlots.length > 0
      ? Math.ceil((parseISO(allSlots[allSlots.length - 1].date).getTime() - parseISO(allSlots[0].date).getTime()) / (7 * 86400000)) + 1
      : 0;

    return { slots: allSlots, totalGenerated: allSlots.length, weeks: actualWeeks, hoursPerWeek, isValid: true, errorMessage: "" };
  }, [schedForm.totalHours, schedForm.slotDuration, schedForm.startDate, selectedSlots]);

  /* ============ FETCH ============ */
  const fetchCourses = async () => {
    try { const res = await fetch(`http://localhost:8080/get/courses?adminId=${user._id}`, { headers: getAuthHeaders() }); const d = await res.json(); setCourses(Array.isArray(d) ? d : []); }
    catch { toast.error("Erreur récupération des cours"); }
  };
  const fetchSchedule = async () => {
    try {
      const res = await fetch(`http://localhost:8080/get/schedule`, { headers: getAuthHeaders() });
      const d = await res.json();
      if (Array.isArray(d)) setSchedule(d);
      else if (d && Array.isArray(d.schedules)) setSchedule(d.schedules);
      else { console.warn("schedule not array:", d); setSchedule([]); }
    } catch (err) { console.error(err); toast.error("Erreur planning"); setSchedule([]); }
  };
  const fetchTeachers = async () => {
    try { const res = await fetch(`http://localhost:8080/get/teachers`, { headers: getAuthHeaders() }); const d = await res.json(); setTeachers(Array.isArray(d) ? d : []); }
    catch { toast.error("Erreur professeurs"); }
  };
  const fetchClasses = async () => {
    try { const res = await fetch(`http://localhost:8080/get/all/classes`, { headers: getAuthHeaders() }); const d = await res.json(); setClasses(Array.isArray(d) ? d : []); }
    catch { toast.error("Erreur classes"); }
  };
  const fetchRooms = async () => {
    try { const res = await fetch("http://localhost:8080/get/rooms", { headers: getAuthHeaders() }); const d = await res.json(); setRooms(Array.isArray(d) ? d : []); }
    catch { console.error("Erreur salles"); }
  };

  useEffect(() => { if (user?._id) { fetchCourses(); fetchTeachers(); fetchClasses(); fetchSchedule(); fetchRooms(); } }, [user]);
  useEffect(() => { if (form.class) { fetchSchedule(); setSelectedSlots([]); } }, [form.class]);
  useEffect(() => { fetchSchedule(); setSelectedSlots([]); }, [classFilter]);

  /* ============ LOAD AVAILABLE ROOMS ============ */
  const loadAvailableRooms = async (date, startTime, endTime) => {
    if (!date || !startTime || !endTime) return;
    setLoadingRooms(true);
    try {
      const res = await fetch(
        `http://localhost:8080/get/available-rooms?date=${date}&startTime=${startTime}&endTime=${endTime}`,
        { headers: getAuthHeaders() }
      );
      const d = await res.json();
      setAvailableRooms(Array.isArray(d.available) ? d.available : []);
    } catch { setAvailableRooms([]); }
    finally { setLoadingRooms(false); }
  };

  /* ============ TOGGLE CLASS (multi-sélection) ============ */
  const toggleClass = (classId) => {
    setSchedForm((prev) => {
      const arr = prev.classes.includes(classId)
        ? prev.classes.filter((id) => id !== classId)
        : [...prev.classes, classId];
      return { ...prev, classes: arr };
    });
    setSelectedSlots([]);
  };

  /* ============ MODAL HANDLERS ============ */
  const openAddModal = () => {
    setEditingCourse(null);
    setForm({ title: "", description: "", credits: "", coefficient: 1 });
    setCourseTitle(""); setCourseDescription(""); setCourseCredits("");
    setShowModal(true);
  };
  const openEditModal = (course) => {
    setEditingCourse(course); setCourseTitle(course.title || ""); setCourseDescription(course.description || ""); setCourseCredits(course.credits || "");
    setForm({ title: course.title || "", description: course.description || "", credits: course.credits || "", coefficient: course.coefficient || 1, teacher: course.teacher?._id || "", class: course.class?._id || "", level: course.level || "", major: course.major || "", semester: course.semester || "", year: course.year || "", attendanceRequired: course.attendanceRequired || false });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title && !editingSlot) { toast.error("Titre obligatoire !"); return; }
    try {
      if (editingCourse) {
        const payload = { title: form.title, description: form.description || "", credits: form.credits ? Number(form.credits) : 0, coefficient: form.coefficient ? Number(form.coefficient) : 1, teacher: form.teacher || null, class: form.class || null, level: form.level || "", major: form.major || "", semester: form.semester || "", year: form.year ? Number(form.year) : undefined, attendanceRequired: form.attendanceRequired || false };
        const res = await fetch(`http://localhost:8080/update/course/${editingCourse._id}`, { method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (res.ok) { toast.success("Cours mis à jour !"); setShowModal(false); setEditingCourse(null); fetchCourses(); }
        else { const e = await res.json(); toast.error(e.message || "Erreur"); }
      }
    } catch (err) { console.error(err); toast.error("Erreur serveur"); }
  };

  /* ═══════════════════════════════════════════════════════════════
   * 🔥 PROGRAMMER - Crée les créneaux pour CHAQUE classe sélectionnée
   * ═══════════════════════════════════════════════════════════════ */
  const handleProgrammer = async () => {
    if (!schedForm.course || !schedForm.teacher || !schedForm.classes.length) {
      toast.error("Cours, professeur et au moins 1 classe obligatoires !");
      return;
    }
    if (!selectedSlots.length) { toast.error("Sélectionnez au moins un créneau !"); return; }
    if (!schedForm.totalHours || Number(schedForm.totalHours) <= 0) { toast.error("Total heures > 0 requis !"); return; }

    const { slots, isValid, errorMessage } = previewSlots;
    if (!isValid) { toast.error(errorMessage); return; }
    if (!slots.length) { toast.error("Aucun créneau à créer"); return; }

    const classNames = schedForm.classes.map((cid) => classes.find((c) => c._id === cid)?.name || cid).join(", ");
    const msg = `Créer ${slots.length} créneau(x) × ${schedForm.classes.length} classe(s) = ${slots.length * schedForm.classes.length} total\n\nClasses : ${classNames}\nDébut : ${slots[0].dateLabel}\nFin : ${slots[slots.length - 1].dateLabel}`;
    if (!(await confirm(msg, { titre: "Programmer les créneaux", danger: false }))) return;

    setProgrammingInProgress(true);
    try {
      // Mettre à jour le cours avec totalHours
      for (const classId of schedForm.classes) {
       await fetch(`http://localhost:8080/update/course/${schedForm.course}`, {
  method: "PUT",
  headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
  body: JSON.stringify({
    totalHours: Number(schedForm.totalHours),
    hoursPerSession: Number(schedForm.slotDuration),
    startDate: schedForm.startDate,
    teacher: schedForm.teacher,
    classes: schedForm.classes, // ✅ ARRAY
  }),
});
      }

      // Créer les créneaux pour CHAQUE classe
      let created = 0;
      let errors = 0;
      for (const classId of schedForm.classes) {
        const batchSize = 10;
        for (let i = 0; i < slots.length; i += batchSize) {
          const batch = slots.slice(i, i + batchSize);
          const results = await Promise.all(
            batch.map((slot) =>
              fetch("http://localhost:8080/create/schedule", {
                method: "POST",
                headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({
                  course: schedForm.course,
                  teacher: schedForm.teacher,
                  class: classId,
                  room: schedForm.room || undefined,
                  day: slot.day, date: slot.date,
                  startTime: slot.startTime, endTime: slot.endTime,
                  type: "class",
                }),
              })
            )
          );
          for (const r of results) {
            if (r.ok) created++;
            else {
              errors++;
              const err = await r.json().catch(() => ({}));
              console.error("Erreur créneau:", err.message || err);
            }
          }
        }
      }

      if (errors > 0) {
        toast.error(`${errors} créneau(x) en conflit (salle/prof occupé)`);
      }
      toast.success(`${created} créneau(x) programmé(s) pour ${schedForm.classes.length} classe(s) !`);

      setSelectedSlots([]);
      setShowScheduleModal(false);
      setSchedForm({ course: "", teacher: "", classes: [], room: "", totalHours: "", slotDuration: 2, startDate: format(new Date(), "yyyy-MM-dd") });
      setAvailableRooms([]);
      fetchSchedule();
      fetchCourses();
    } catch (err) { console.error(err); toast.error("Erreur serveur"); }
    finally { setProgrammingInProgress(false); }
  };

  /* ============ REPORTER ============ */
  const openReschedule = (slot) => {
    setSlotToReschedule(slot);
    const currentDate = slot.date ? parseISO(slot.date) : new Date();
    setRescheduleDate(format(addDays(currentDate, 7), "yyyy-MM-dd"));
    setRescheduleHour(parseInt(slot.startTime).toString());
    setShowRescheduleModal(true);
    setSelectedSlot(null);
  };

  const handleReschedule = async () => {
    if (!slotToReschedule || !rescheduleDate) { toast.error("Choisissez une date"); return; }
    const newDate = new Date(rescheduleDate + "T12:00:00");
    if (isBefore(newDate, startOfDay(new Date()))) { toast.error("Date passée !"); return; }
    const newDay = frenchDayName(newDate);
    const hour = Number(rescheduleHour) || parseInt(slotToReschedule.startTime);
    const dur = parseInt(slotToReschedule.endTime) - parseInt(slotToReschedule.startTime);
    try {
      await fetch(`http://localhost:8080/update/schedule/${slotToReschedule._id}`, {
        method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ day: newDay, date: rescheduleDate, startTime: `${hour}:00`, endTime: `${hour + dur}:00` }),
      });
      toast.success(`Reporté au ${format(newDate, "EEEE d MMMM yyyy", { locale: fr })}`);
      setShowRescheduleModal(false); setSlotToReschedule(null); fetchSchedule();
    } catch { toast.error("Erreur"); }
  };

  const handleDelete = async (id) => {
    if (!(await confirm("Supprimer ?", { titre: "Supprimer le cours" }))) return;
    try { const r = await fetch(`http://localhost:8080/delete/course/${id}`, { method: "DELETE", headers: getAuthHeaders() }); if (r.ok) { toast.success("Supprimé !"); fetchCourses(); } else toast.error("Erreur"); } catch { toast.error("Erreur serveur"); }
  };
  const handleArchive = async (id) => {
    try { const r = await fetch(`http://localhost:8080/archive/course/${id}`, { method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ archived: true }) }); if (r.ok) { toast.success("Archivé !"); fetchCourses(); } else toast.error("Erreur"); } catch { toast.error("Erreur serveur"); }
  };

  const filteredCourses = (Array.isArray(courses) ? courses : []).filter((c) =>
    (!levelFilter || c.level === levelFilter) && (!majorFilter || c.major?.toLowerCase().includes(majorFilter.toLowerCase()))
  );

  const getCourseColor = (courseId) => {
    const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f43f5e"];
    if (!courseId) return "#6b7280";
    let hash = 0;
    for (let i = 0; i < courseId.length; i++) hash = courseId.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  /* ============ RENDER ROW (planning) ============ */
  const renderDayRow = (entry) => {
    const { dayName, dateStr, dateLabel, isToday } = entry;
    return (
      <tr key={dateStr}>
        <td style={{ fontWeight: 600, fontSize: 13, padding: "8px 6px", background: isToday ? "#dbeafe" : "#f9fafb", borderRadius: 6, textAlign: "center", lineHeight: 1.3, position: "sticky", left: 0, zIndex: 2 }}>
          {dayName}
          <div style={{ fontSize: 11, fontWeight: 400, color: "#6b7280" }}>{dateLabel}</div>
          {isToday && <div style={{ fontSize: 9, color: "#2563eb", fontWeight: 700 }}>AUJOURD'HUI</div>}
        </td>
        {hours.map((hour) => {
          const slotStart = findSlotStartForDate(dateStr, dayName, hour);
          const slotTaken = findSlotForDate(dateStr, dayName, hour);
          const isMiddle = slotTaken && !slotStart;
          return (
            <td key={hour} style={{
              minWidth: "70px", height: "80px", padding: slotStart ? "6px" : "4px",
              border: isToday ? "2px solid #bfdbfe" : "1px solid #e5e7eb", verticalAlign: "top",
              background: slotTaken ? getCourseColor(slotTaken.course?._id) : movingSlot ? "#fffbeb" : "#fff",
              color: slotTaken ? "#fff" : "#111", cursor: isMiddle ? "default" : "pointer",
              borderRadius: "6px", position: "relative", transition: "background 0.15s",
            }}
            onClick={async () => {
              if (isMiddle) return;
              if (slotStart && !movingSlot) { setMovingSlot(slotStart); toast("Cliquez sur une case libre", { icon: "👉" }); return; }
              if (movingSlot && slotStart && movingSlot._id === slotStart._id) { setMovingSlot(null); toast("Annulé ❌"); return; }
              if (movingSlot && !slotTaken) {
                const dur = parseInt(movingSlot.endTime) - parseInt(movingSlot.startTime);
                try {
                  await fetch(`http://localhost:8080/update/schedule/${movingSlot._id}`, {
                    method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                    body: JSON.stringify({ day: dayName, date: dateStr, startTime: `${hour}:00`, endTime: `${hour + dur}:00` }),
                  });
                  toast.success("Déplacé !"); setMovingSlot(null); fetchSchedule();
                } catch { toast.error("Erreur"); }
                return;
              }
              if (movingSlot && slotTaken) toast.error("Occupé !");
            }}>
              {slotStart ? (
                <div style={{ position: "relative" }}>
                  {slotStart.sessionStatus === "effectue" && <div style={{ fontSize: 8, background: "#22c55e", color: "#fff", borderRadius: 3, padding: "1px 4px", position: "absolute", top: -2, left: -2 }}>✅</div>}
                  {slotStart.sessionStatus === "annule" && <div style={{ fontSize: 8, background: "#ef4444", color: "#fff", borderRadius: 3, padding: "1px 4px", position: "absolute", top: -2, left: -2 }}>❌</div>}
                  <div style={{ fontWeight: "bold", fontSize: 11, lineHeight: 1.2 }}>{slotStart.course?.title}</div>
                  <div style={{ fontSize: 10, marginTop: 2 }}>👨‍🏫 {slotStart.teacher?.fullname || "Prof"}</div>
                  <div style={{ fontSize: 9, opacity: 0.85 }}>🏫 {slotStart.class?.name}</div>
                  {slotStart.room?.name && <div style={{ fontSize: 9, opacity: 0.75 }}>📍 {slotStart.room.name}</div>}
                  <div style={{ fontSize: 9, opacity: 0.7 }}>{slotStart.startTime} - {slotStart.endTime}</div>
                  <button style={{ position: "absolute", top: -2, right: -2, padding: "1px 4px", fontSize: 10, background: "rgba(0,0,0,0.3)", color: "#fff", border: "none", borderRadius: 3, cursor: "pointer" }}
                    onClick={async (e) => { e.stopPropagation(); if (!(await confirm("Supprimer ?", { titre: "Supprimer le créneau" }))) return; await fetch(`http://localhost:8080/delete/schedule/${slotStart._id}`, { method: "DELETE", headers: getAuthHeaders() }); toast.success("Supprimé !"); fetchSchedule(); }}>❌</button>
                  <span onClick={(e) => { e.stopPropagation(); setSelectedSlot(slotStart); }}
                    style={{ position: "absolute", bottom: -2, right: -2, cursor: "pointer", fontSize: 12, background: "rgba(0,0,0,0.3)", padding: "1px 4px", borderRadius: 3 }}>👁️</span>
                </div>
              ) : isMiddle ? (
                <div style={{ fontSize: 10, opacity: 0.7, textAlign: "center" }}>⬆</div>
              ) : movingSlot ? (
                <span style={{ fontSize: 11, color: "#92400e" }}>Déplacer ici</span>
              ) : (
                <span style={{ fontSize: 11, color: "#9ca3af" }}>Libre</span>
              )}
            </td>
          );
        })}
      </tr>
    );
  };

  /* ════════════════════════════════════════════════════════════
   * 🔥 COULEURS DE LA GRILLE DU MODAL PROGRAMMER
   * ════════════════════════════════════════════════════════════ */
  const SLOT_COLORS = {
    free:           { bg: "#10b981", text: "#fff" },
    class_busy:     { bg: "#ef4444", text: "#fff" },  // Classe occupée
    room_busy:      { bg: "#f59e0b", text: "#fff" },  // Salle prise par autre classe
    teacher_busy:   { bg: "#8b5cf6", text: "#fff" },  // Prof pris
    class_and_room: { bg: "#991b1b", text: "#fff" },  // Les deux
    selected:       { bg: "#2563eb", text: "#fff" },
    blocked:        { bg: "#93c5fd", text: "#fff" },
  };

  /* ==================================================================== RENDER */
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f9fafb" }}>
      <TeacherSidebar />
      <div style={{ flex: 1, padding: "0.4rem" }}>
        <h1 style={titleStyle}>📚 Mes cours</h1>
        <button onClick={openAddModal} style={buttonStyle}>Ajouter un cours</button>
        <button style={{ ...buttonStyle, background: "#f59e0b", marginLeft: 10 }} onClick={() => {
          setShowScheduleModal(true);
          setSchedForm({ course: "", teacher: "", classes: [], room: "", totalHours: "", slotDuration: 2, startDate: format(new Date(), "yyyy-MM-dd") });
          setSelectedSlots([]); setAvailableRooms([]);
          fetchSchedule();
        }}>Programmer un cours</button>

        {/* FILTRES */}
        <div style={filterContainer}>
          {filter === "all" ? (<>
            <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} style={filterInput}><option value="">🎓 Tous les niveaux</option>{["L1", "L2", "L3", "M1", "M2"].map((l) => <option key={l} value={l}>{l}</option>)}</select>
            <input type="text" placeholder="🔍 Filtrer par filière" value={majorFilter} onChange={(e) => setMajorFilter(e.target.value)} style={filterInput} />
          </>) : (<>
            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} style={filterInput}><option value="">🏫 Toutes les classes</option>{classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} style={filterInput}><option value="day">📅 Jour</option><option value="week">🗓 Semaine</option><option value="month">📆 Mois</option></select>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button onClick={goToPrev} style={navBtnStyle}>◀</button>
              <button onClick={goToToday} style={{ ...navBtnStyle, fontSize: 12, padding: "6px 10px" }}>Aujourd'hui</button>
              <button onClick={goToNext} style={navBtnStyle}>▶</button>
            </div>
            <span style={{ fontWeight: 600, fontSize: 14, textTransform: "capitalize", minWidth: 180, textAlign: "center" }}>{periodLabel}</span>
            <input type="date" value={format(referenceDate, "yyyy-MM-dd")} onChange={(e) => setReferenceDate(new Date(e.target.value + "T12:00:00"))} style={{ ...filterInput, minWidth: 140 }} />
          </>)}
          <button style={{ ...buttonStyle, background: "#ef4444" }} onClick={() => { setLevelFilter(""); setMajorFilter(""); setClassFilter(""); setReferenceDate(new Date()); }}>❌ Reset</button>
          <div style={{ display: "flex", gap: "10px" }}>
            <button style={{ ...buttonStyle, background: filter === "all" ? "#2563eb" : "#e5e7eb", color: filter === "all" ? "#fff" : "#111" }} onClick={() => setFilter("all")}>📚 Cours</button>
            <button style={{ ...buttonStyle, background: filter === "scheduled" ? "#2563eb" : "#e5e7eb", color: filter === "scheduled" ? "#fff" : "#111" }} onClick={() => setFilter("scheduled")}>📅 Planning</button>
          </div>
        </div>

        {/* CONTENU */}
        <div style={cardStyle}>
          {filter === "all" ? (
            <table style={tableStyle}>
              <thead><tr><th>Titre</th><th>Description</th><th>Crédits</th><th>Coef.</th><th>Niveau</th><th>Filière</th><th>Sem./Année</th><th>Présence</th><th>Fin prévue</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredCourses.length > 0 ? filteredCourses.map((c) => (
                  <tr key={c._id}>
                    <td>{c.title}</td><td>{c.description || "-"}</td><td>{c.credits || "-"}</td><td>{c.coefficient || "-"}</td><td>{c.level || "-"}</td><td>{c.major || "-"}</td><td>{c.semester || "-"} / {c.year || "-"}</td><td>{c.attendanceRequired ? "Oui" : "Non"}</td><td>{c.endDate ? format(parseISO(c.endDate), "dd/MM/yyyy") : "-"}</td>
                    <td>
                      <button style={editButtonStyle} onClick={() => openEditModal(c)}>Modifier</button>
                      <button style={{ ...buttonStyle, background: "#ef4444", marginLeft: 5 }} onClick={() => handleDelete(c._id)}>Supprimer</button>
                      <button style={{ ...buttonStyle, background: "#f59e0b", marginLeft: 5 }} onClick={() => handleArchive(c._id)}>Archiver</button>
                    </td>
                  </tr>
                )) : <tr><td colSpan="10">Aucun cours</td></tr>}
              </tbody>
            </table>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              {movingSlot && (
                <div style={{ padding: "8px 14px", marginBottom: 8, background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                  📦 Déplacement : <strong>{movingSlot.course?.title}</strong>
                  <button onClick={() => { setMovingSlot(null); toast("Annulé"); }} style={{ marginLeft: "auto", background: "#ef4444", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>Annuler</button>
                </div>
              )}
              {(timeFilter === "day" || timeFilter === "week") && (
                <table style={{ ...tableStyle, minWidth: "1100px", tableLayout: "fixed", borderCollapse: "separate", borderSpacing: "2px" }}>
                  <thead><tr><th style={{ width: 100, padding: 8, background: "#f1f5f9", borderRadius: 6, fontSize: 13 }}>Jour</th>{hours.map((h) => <th key={h} style={{ padding: 6, background: "#f1f5f9", borderRadius: 6, fontSize: 12, textAlign: "center" }}>{`${h}:00`}</th>)}</tr></thead>
                  <tbody>{visibleDayEntries.map((e) => renderDayRow(e))}</tbody>
                </table>
              )}
              {timeFilter === "month" && monthWeeks.map((week, wIdx) => (
                <div key={wIdx} style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 11, color: "#9ca3af", padding: "4px 0", fontWeight: 600 }}>Semaine du {format(week[0].date, "d MMM", { locale: fr })}</div>
                  <table style={{ ...tableStyle, minWidth: "1100px", tableLayout: "fixed", borderCollapse: "separate", borderSpacing: "2px" }}>
                    {wIdx === 0 && (<thead><tr><th style={{ width: 100, padding: 6, background: "#f1f5f9", borderRadius: 6, fontSize: 12 }}>Jour</th>{hours.map((h) => <th key={h} style={{ padding: 4, background: "#f1f5f9", borderRadius: 6, fontSize: 11, textAlign: "center" }}>{`${h}:00`}</th>)}</tr></thead>)}
                    <tbody>{week.map((e) => renderDayRow(e))}</tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MODAL AJOUTER */}
        {showModal && !editingCourse && (
          <div style={modalStyle}><div style={modalContentStyle}>
            <h2>Ajouter un cours</h2>
            <input type="text" placeholder="Titre" value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} style={inputStyle} />
            <textarea placeholder="Description" value={courseDescription} onChange={(e) => setCourseDescription(e.target.value)} style={inputStyle} />
            <input type="number" placeholder="Crédits" value={courseCredits} onChange={(e) => setCourseCredits(e.target.value)} style={inputStyle} />
            <select value={form.level || ""} onChange={(e) => setForm({ ...form, level: e.target.value })} style={inputStyle}><option value="">Niveau</option>{["L1", "L2", "L3", "M1", "M2"].map((l) => <option key={l} value={l}>{l}</option>)}</select>
            <input type="text" placeholder="Filière" value={form.major || ""} onChange={(e) => setForm({ ...form, major: e.target.value })} style={inputStyle} />
            <input type="text" placeholder="Semestre" value={form.semester || ""} onChange={(e) => setForm({ ...form, semester: e.target.value })} style={inputStyle} />
            <input type="number" placeholder="Année" value={form.year || ""} onChange={(e) => setForm({ ...form, year: e.target.value })} style={inputStyle} />
            <input type="number" placeholder="Coefficient" value={form.coefficient || ""} onChange={(e) => setForm({ ...form, coefficient: e.target.value })} style={inputStyle} />
            <label><input type="checkbox" checked={form.attendanceRequired || false} onChange={(e) => setForm({ ...form, attendanceRequired: e.target.checked })} /> Présence obligatoire</label>
            <div style={{ marginTop: 15 }}>
              <button style={buttonStyle} onClick={async () => {
                if (!courseTitle || !form.level || !form.major) { toast.error("Titre, niveau et filière obligatoires !"); return; }
                try {
                  const res = await fetch("http://localhost:8080/create/course", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ title: courseTitle, description: courseDescription, credits: Number(courseCredits || 0), level: form.level, major: form.major, semester: form.semester || "", year: form.year ? Number(form.year) : undefined, coefficient: form.coefficient ? Number(form.coefficient) : 1, attendanceRequired: form.attendanceRequired || false }) });
                  const data = await res.json();
                  if (res.ok) { toast.success(`Cours "${data.course.title}" créé !`); setCourseTitle(""); setCourseDescription(""); setCourseCredits(""); setForm({}); setShowModal(false); fetchCourses(); } else toast.error(data.message || "Erreur");
                } catch (err) { console.error(err); toast.error("Erreur serveur"); }
              }}>Ajouter</button>
              <button style={{ ...buttonStyle, background: "#aaa", marginLeft: 10 }} onClick={() => { setShowModal(false); setForm({}); }}>Annuler</button>
            </div>
          </div></div>
        )}

        {/* MODAL MODIFIER */}
        {showModal && editingCourse && (
          <div style={modalStyle}><div style={modalContentStyle}>
            <h2>Modifier le cours</h2>
            <input type="text" placeholder="Titre" value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} style={inputStyle} />
            <textarea placeholder="Description" value={courseDescription} onChange={(e) => setCourseDescription(e.target.value)} style={inputStyle} />
            <input type="number" placeholder="Crédits" value={courseCredits} onChange={(e) => setCourseCredits(e.target.value)} style={inputStyle} />
            <select value={form.teacher || ""} onChange={(e) => setForm({ ...form, teacher: e.target.value })} style={inputStyle}><option value="">Professeur</option>{teachers.map((t) => <option key={t._id} value={t._id}>{t.name || t.fullname}</option>)}</select>
            <select value={form.class || ""} onChange={(e) => setForm({ ...form, class: e.target.value })} style={inputStyle}><option value="">Classe</option>{classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
            <select value={form.level || ""} onChange={(e) => setForm({ ...form, level: e.target.value })} style={inputStyle}><option value="">Niveau</option>{["L1", "L2", "L3", "M1", "M2"].map((l) => <option key={l} value={l}>{l}</option>)}</select>
            <input type="text" placeholder="Filière" value={form.major || ""} onChange={(e) => setForm({ ...form, major: e.target.value })} style={inputStyle} />
            <input type="text" placeholder="Semestre" value={form.semester || ""} onChange={(e) => setForm({ ...form, semester: e.target.value })} style={inputStyle} />
            <input type="number" placeholder="Année" value={form.year || ""} onChange={(e) => setForm({ ...form, year: e.target.value })} style={inputStyle} />
            <input type="number" placeholder="Coefficient" value={form.coefficient || ""} onChange={(e) => setForm({ ...form, coefficient: e.target.value })} style={inputStyle} />
            <label><input type="checkbox" checked={form.attendanceRequired || false} onChange={(e) => setForm({ ...form, attendanceRequired: e.target.checked })} /> Présence obligatoire</label>
            <div style={{ marginTop: 15 }}>
              <button style={buttonStyle} onClick={handleSave}>Mettre à jour</button>
              <button style={{ ...buttonStyle, background: "#aaa", marginLeft: 10 }} onClick={() => { setShowModal(false); setEditingCourse(null); }}>Annuler</button>
            </div>
          </div></div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
         * 🔥 MODAL PROGRAMMER - MULTI-CLASSES + VISU SALLE/PROF
         * ═══════════════════════════════════════════════════════════════ */}
        {showScheduleModal && (
          <div style={modalStyle}><div style={{ ...modalContentStyle, width: "820px", maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto" }}>
            <h2 style={{ marginBottom: 15 }}>📅 Programmer un cours</h2>

            {/* Cours + Prof */}
            <div style={{ display: "flex", gap: 10 }}>
              <select style={{ ...inputStyle, flex: 1 }} value={schedForm.course} onChange={(e) => setSchedForm({ ...schedForm, course: e.target.value })}><option value="">📘 Cours</option>{courses.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}</select>
              <select style={{ ...inputStyle, flex: 1 }} value={schedForm.teacher} onChange={(e) => setSchedForm({ ...schedForm, teacher: e.target.value })}><option value="">👨‍🏫 Professeur</option>{teachers.map((t) => <option key={t._id} value={t._id}>{t.fullname || t.name}</option>)}</select>
            </div>

            {/* 🔥 CLASSES - Sélection multiple par boutons toggle */}
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>🏫 Classes (cliquer pour sélectionner 1 ou plusieurs)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {classes.map((c) => {
                  const selected = schedForm.classes.includes(c._id);
                  return (
                    <button key={c._id} onClick={() => toggleClass(c._id)}
                      style={{
                        padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        border: selected ? "2px solid #2563eb" : "1px solid #d1d5db",
                        background: selected ? "#dbeafe" : "#fff",
                        color: selected ? "#1e40af" : "#374151",
                        transition: "all 0.15s",
                      }}>
                      {selected ? "✓ " : ""}{c.name}
                    </button>
                  );
                })}
              </div>
              {schedForm.classes.length > 1 && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#2563eb", fontWeight: 600 }}>
                  📢 Mode multi-classes : {schedForm.classes.length} classes - les créneaux seront créés pour chacune
                </div>
              )}
            </div>

            {/* Salle */}
            <div style={{ display: "flex", gap: 10 }}>
              <select style={{ ...inputStyle, flex: 1 }} value={schedForm.room} onChange={(e) => setSchedForm({ ...schedForm, room: e.target.value })}>
                <option value="">📍 Salle (optionnel - recommandé pour voir les conflits)</option>
                {rooms.map((r) => <option key={r._id} value={r._id}>{r.name} ({r.capacity}p) - {r.building || ""}</option>)}
              </select>
              {selectedSlots.length > 0 && schedForm.startDate && (
                <button style={{ ...buttonStyle, marginTop: 0, fontSize: 11, padding: "8px 10px" }}
                  onClick={() => {
                    const first = [...selectedSlots].sort((a, b) => (dayOffset[a.day] ?? 0) - (dayOffset[b.day] ?? 0) || a.hour - b.hour)[0];
                    const sd = addDays(startOfWeek(new Date(schedForm.startDate + "T12:00:00"), { weekStartsOn: 1 }), dayOffset[first.day] ?? 0);
                    loadAvailableRooms(format(sd, "yyyy-MM-dd"), `${first.hour}:00`, `${first.hour + schedForm.slotDuration}:00`);
                  }}>Salles libres</button>
              )}
            </div>
            {availableRooms.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {availableRooms.map((r) => (
                  <button key={r._id} style={{ padding: "5px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer", border: schedForm.room === r._id ? "2px solid #22c55e" : "1px solid #d1d5db", background: schedForm.room === r._id ? "#dcfce7" : "#fff", color: schedForm.room === r._id ? "#166534" : "#374151" }}
                    onClick={() => setSchedForm({ ...schedForm, room: r._id })}>{r.name} ({r.capacity}p)</button>
                ))}
              </div>
            )}

            {/* Heures / Durée / Date */}
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}><label style={labelStyle}>Total heures</label><input type="number" min="1" placeholder="ex: 80" value={schedForm.totalHours} onChange={(e) => setSchedForm({ ...schedForm, totalHours: e.target.value })} style={inputStyle} /></div>
              <div style={{ flex: 1 }}><label style={labelStyle}>Durée/créneau (h)</label><input type="number" min="1" max="4" value={schedForm.slotDuration} onChange={(e) => setSchedForm({ ...schedForm, slotDuration: Number(e.target.value) || 1 })} style={inputStyle} /></div>
              <div style={{ flex: 1 }}><label style={labelStyle}>Date de début</label><input type="date" min={format(new Date(), "yyyy-MM-dd")} value={schedForm.startDate} onChange={(e) => setSchedForm({ ...schedForm, startDate: e.target.value })} style={inputStyle} /></div>
            </div>

            {/* RÉSUMÉ */}
            {selectedSlots.length > 0 && Number(schedForm.totalHours) > 0 && (
              <div style={{ background: previewSlots.isValid ? "#eff6ff" : "#fee2e2", border: `1px solid ${previewSlots.isValid ? "#bfdbfe" : "#fecaca"}`, borderRadius: 8, padding: "12px 16px", marginBottom: 10, fontSize: 13 }}>
                <strong>📊 Résumé :</strong>
                {!previewSlots.isValid && <div style={{ color: "#dc2626", marginTop: 4, fontSize: 12 }}>⚠️ {previewSlots.errorMessage}</div>}
                {previewSlots.isValid && (<>
                  <div style={{ marginTop: 6, display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <span>🕐 {schedForm.totalHours}h</span><span>📐 {schedForm.slotDuration}h/créneau</span>
                    <span>📅 {selectedSlots.length}/sem</span><span>⏱ {selectedSlots.length * schedForm.slotDuration}h/sem</span>
                    <span>📆 <strong>{previewSlots.weeks} sem.</strong></span><span>🔢 <strong>{previewSlots.totalGenerated} créneaux</strong></span>
                    {schedForm.classes.length > 1 && <span>🏫 × {schedForm.classes.length} classes = <strong>{previewSlots.totalGenerated * schedForm.classes.length} total</strong></span>}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: "#1e40af" }}>
                    {[...selectedSlots].sort((a, b) => (dayOffset[a.day] ?? 0) - (dayOffset[b.day] ?? 0) || a.hour - b.hour).map((s, i) => (
                      <span key={i} style={{ display: "inline-block", background: "#dbeafe", borderRadius: 4, padding: "2px 8px", margin: "2px 4px" }}>{s.day} {s.hour}:00→{s.hour + schedForm.slotDuration}:00</span>
                    ))}
                  </div>
                  {previewSlots.slots.length > 0 && <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>Début : <strong>{previewSlots.slots[0].dateLabel}</strong> · Fin : <strong>{previewSlots.slots[previewSlots.slots.length - 1].dateLabel}</strong></div>}
                </>)}
              </div>
            )}

            {/* LÉGENDE */}
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span>Cliquez pour choisir les créneaux :</span>
              <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: SLOT_COLORS.class_busy.bg, verticalAlign: "middle" }} /> Classe occupée</span>
              <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: SLOT_COLORS.room_busy.bg, verticalAlign: "middle" }} /> Salle prise (autre classe)</span>
              <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: SLOT_COLORS.teacher_busy.bg, verticalAlign: "middle" }} /> Prof occupé</span>
              <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: SLOT_COLORS.selected.bg, verticalAlign: "middle" }} /> Sélectionné</span>
              <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: SLOT_COLORS.free.bg, verticalAlign: "middle" }} /> Libre</span>
            </div>

            {/* 🔥 GRILLE AVEC VISU MULTI-CONFLITS */}
            <div style={{ maxHeight: 350, overflowY: "auto", overflowX: "auto" }}>
              <table style={{ ...tableStyle, minWidth: "1100px", tableLayout: "fixed" }}>
                <thead><tr><th style={{ width: 80 }}>Jour</th>{hours.map((h) => <th key={h} style={{ fontSize: 11 }}>{`${h}:00`}</th>)}</tr></thead>
                <tbody>
                  {DAYS_FR.map((day) => (
                    <tr key={day}><td style={{ fontWeight: 600, fontSize: 12 }}>{day}</td>
                      {hours.map((hour) => {
                        const isSelected = selectedSlots.some((s) => s.day === day && s.hour === hour);
                        const isBlocked = selectedSlots.some((s) => {
                          const e = s.hour + (schedForm.slotDuration || 1);
                          return s.day === day && hour > s.hour && hour < e;
                        });

                        // 🔥 Analyse multi-conflit
                        const slotInfo = schedForm.classes.length > 0
                          ? getSlotStatus(day, hour)
                          : { status: "free", label: "Libre", detail: "" };

                        const isBusy = slotInfo.status !== "free";
                        const isBlk = isBusy || isBlocked;

                        // Vérifier chevauchement sur la durée complète
                        const wouldOverlap = () => {
                          for (let h = hour; h < hour + schedForm.slotDuration; h++) {
                            const si = schedForm.classes.length > 0 ? getSlotStatus(day, h) : { status: "free" };
                            if (si.status !== "free") return true;
                            if (selectedSlots.some((sel) => sel.day === day && h >= sel.hour && h < sel.hour + schedForm.slotDuration && !(sel.day === day && sel.hour === hour))) return true;
                          }
                          return false;
                        };

                        let bg, textColor;
                        if (isSelected) { bg = SLOT_COLORS.selected.bg; textColor = SLOT_COLORS.selected.text; }
                        else if (isBlocked) { bg = SLOT_COLORS.blocked.bg; textColor = SLOT_COLORS.blocked.text; }
                        else if (isBusy) { bg = SLOT_COLORS[slotInfo.status]?.bg || "#ef4444"; textColor = "#fff"; }
                        else { bg = SLOT_COLORS.free.bg; textColor = SLOT_COLORS.free.text; }

                        return (
                          <td key={hour}
                            title={slotInfo.detail || ""}
                            style={{ padding: "6px 4px", border: "1px solid #e5e7eb", background: bg, color: textColor, cursor: isBlk ? "not-allowed" : "pointer", borderRadius: "6px", textAlign: "center", fontSize: 10, opacity: isBlocked ? 0.6 : 1, lineHeight: 1.3 }}
                            onClick={() => {
                              if (isBlk) {
                                if (slotInfo.detail) toast.error(slotInfo.detail);
                                return;
                              }
                              if (schedForm.classes.length === 0) { toast.error("Sélectionnez au moins 1 classe"); return; }
                              if (wouldOverlap()) { toast.error("Chevauchement !"); return; }
                              const a = selectedSlots.find((s) => s.day === day && s.hour === hour);
                              if (a) setSelectedSlots(selectedSlots.filter((s) => !(s.day === day && s.hour === hour)));
                              else setSelectedSlots([...selectedSlots, { day, hour }]);
                            }}>
                            {isSelected
                              ? `✔ ${schedForm.slotDuration}h`
                              : isBlocked
                              ? `← ${schedForm.slotDuration}h`
                              : isBusy
                              ? slotInfo.label
                              : "Libre"
                            }
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 15, display: "flex", gap: 10, alignItems: "center" }}>
              <button style={{ ...buttonStyle, background: "#2563eb", fontSize: 14, padding: "12px 24px", opacity: programmingInProgress ? 0.6 : 1 }}
                onClick={handleProgrammer} disabled={!previewSlots.isValid || programmingInProgress || !schedForm.classes.length}>
                {programmingInProgress ? "⏳ En cours..." : `✅ Programmer ${previewSlots.totalGenerated > 0 ? `(${previewSlots.totalGenerated}${schedForm.classes.length > 1 ? ` × ${schedForm.classes.length}` : ""})` : ""}`}
              </button>
              <button style={{ ...buttonStyle, background: "#aaa" }} onClick={() => { setShowScheduleModal(false); setSelectedSlots([]); setAvailableRooms([]); }}>Annuler</button>
              {selectedSlots.length > 0 && <button style={{ ...buttonStyle, background: "#f59e0b" }} onClick={() => setSelectedSlots([])}>Désélectionner</button>}
            </div>
          </div></div>
        )}

        {/* MODAL DÉTAIL avec SessionMarker */}
        {selectedSlot && (
          <div style={modalStyle}><div style={{ ...modalContentStyle, width: "520px", maxHeight: "90vh", overflowY: "auto" }}>
            <h3>📅 Détail du créneau</h3>
            <p><strong>Cours :</strong> {selectedSlot.course?.title}</p>
            <p><strong>Professeur :</strong> {selectedSlot.teacher?.fullname || "-"}</p>
            <p><strong>Classe :</strong> {selectedSlot.class?.name || "-"}</p>
            {selectedSlot.room?.name && <p><strong>Salle :</strong> {selectedSlot.room.name}</p>}
            <hr />
            <p><strong>Jour :</strong> {selectedSlot.day}</p>
            <p><strong>Horaire :</strong> {selectedSlot.startTime} - {selectedSlot.endTime}</p>
            {selectedSlot.date && <p><strong>Date :</strong> {format(parseISO(selectedSlot.date), "EEEE d MMMM yyyy", { locale: fr })}</p>}
            <hr />
            <SessionMarker slot={selectedSlot} onUpdate={() => { fetchSchedule(); setSelectedSlot(null); }} getAuthHeaders={getAuthHeaders} />
            <div style={{ marginTop: 15, display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button style={{ ...buttonStyle, background: "#ef4444" }} onClick={async () => { if (!(await confirm("Supprimer ?", { titre: "Supprimer le créneau" }))) return; await fetch(`http://localhost:8080/delete/schedule/${selectedSlot._id}`, { method: "DELETE", headers: getAuthHeaders() }); toast.success("Supprimé !"); setSelectedSlot(null); fetchSchedule(); }}>🗑 Supprimer</button>
              <button style={{ ...buttonStyle, background: "#3b82f6" }} onClick={() => { setMovingSlot(selectedSlot); setSelectedSlot(null); toast("Cliquez sur une case libre", { icon: "👉" }); }}>↔️ Déplacer</button>
              <button style={{ ...buttonStyle, background: "#f59e0b" }} onClick={() => openReschedule(selectedSlot)}>📅 Reporter</button>
              <button style={{ ...buttonStyle, background: "#8b5cf6" }} onClick={async () => {
                if (!(await confirm("Reporter d'1 semaine ?", { titre: "Reporter le créneau", danger: false }))) return;
                const cur = selectedSlot.date ? parseISO(selectedSlot.date) : new Date();
                const nd = addDays(cur, 7);
                await fetch(`http://localhost:8080/update/schedule/${selectedSlot._id}`, { method: "PUT", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ day: frenchDayName(nd), date: format(nd, "yyyy-MM-dd"), startTime: selectedSlot.startTime, endTime: selectedSlot.endTime }) });
                toast.success(`Reporté au ${format(nd, "d MMMM yyyy", { locale: fr })}`); setSelectedSlot(null); fetchSchedule();
              }}>⏭ +1 sem</button>
              <button style={{ ...buttonStyle, background: "#aaa" }} onClick={() => setSelectedSlot(null)}>Fermer</button>
            </div>
          </div></div>
        )}

        {/* MODAL REPORTER */}
        {showRescheduleModal && slotToReschedule && (
          <div style={modalStyle}><div style={{ ...modalContentStyle, width: "420px" }}>
            <h3>📅 Reporter le créneau</h3>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}><strong>{slotToReschedule.course?.title}</strong> - {slotToReschedule.date ? format(parseISO(slotToReschedule.date), "EEEE d MMMM yyyy", { locale: fr }) : slotToReschedule.day} de {slotToReschedule.startTime} à {slotToReschedule.endTime}</p>
            <label style={labelStyle}>Nouvelle date</label>
            <input type="date" min={format(new Date(), "yyyy-MM-dd")} value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} style={inputStyle} />
            <label style={labelStyle}>Nouvelle heure</label>
            <select value={rescheduleHour} onChange={(e) => setRescheduleHour(e.target.value)} style={inputStyle}>{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select>
            {rescheduleDate && rescheduleHour && (
              <div style={{ background: "#eff6ff", borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 10 }}>→ <strong>{format(new Date(rescheduleDate + "T12:00:00"), "EEEE d MMMM yyyy", { locale: fr })}</strong> de <strong>{rescheduleHour}:00</strong> à <strong>{Number(rescheduleHour) + (parseInt(slotToReschedule.endTime) - parseInt(slotToReschedule.startTime))}:00</strong></div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button style={{ ...buttonStyle, background: "#2563eb" }} onClick={handleReschedule}>✅ Confirmer</button>
              <button style={{ ...buttonStyle, background: "#aaa" }} onClick={() => { setShowRescheduleModal(false); setSlotToReschedule(null); }}>Annuler</button>
            </div>
          </div></div>
        )}
      </div>
    </div>
  );
}

/* ================= STYLES ================= */
const titleStyle = { marginBottom: "20px" };
const sidebarStyle = { width: "200px", background: "#0f172a", color: "#fff", padding: "20px" };
const sidebarItemStyle = { padding: "12px", marginBottom: "10px", borderRadius: "8px", cursor: "pointer", background: "#1e3a8a" };
const cardStyle = { background: "#fff", padding: "5px", borderRadius: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" };
const tableStyle = { width: "100%", borderCollapse: "collapse" };
const buttonStyle = { padding: "10px 15px", background: "#2563eb", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", marginTop: "10px" };
const editButtonStyle = { ...buttonStyle, background: "#10b981" };
const navBtnStyle = { padding: "6px 12px", background: "#e5e7eb", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: 16, fontWeight: 600 };
const inputStyle = { padding: "10px", marginBottom: "10px", width: "100%", borderRadius: "5px", border: "1px solid #ccc", boxSizing: "border-box" };
const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 };
const modalStyle = { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 };
const modalContentStyle = { background: "#fff", padding: "20px", borderRadius: "10px", width: "400px" };
const filterContainer = { display: "flex", gap: "15px", alignItems: "center", flexWrap: "wrap", marginBottom: "20px", padding: "15px", background: "#ffffff", borderRadius: "12px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" };
const filterInput = { padding: "10px 12px", borderRadius: "8px", border: "1px solid #e5e7eb", minWidth: "200px", fontSize: "14px", outline: "none" };