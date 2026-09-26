// src/pages/Notifications.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useUserContext } from "../../contexts/UserContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";

const API = "http://localhost:8080";

const NOTIF_TYPES = {
  student_created: { icon: "👨‍🎓", label: "Inscription", color: "#2563eb" },
  student_updated: { icon: "✏️", label: "Modification étudiant", color: "#8b5cf6" },
  student_deleted: { icon: "🗑️", label: "Suppression étudiant", color: "#ef4444" },
  exam_created: { icon: "📝", label: "Examen créé", color: "#f59e0b" },
  course_created: { icon: "📚", label: "Cours créé", color: "#10b981" },
  schedule_created: { icon: "📅", label: "Planning", color: "#3b82f6" },
  payment: { icon: "💰", label: "Paiement", color: "#22c55e" },
  alert: { icon: "🔴", label: "Alerte", color: "#ef4444" },
  info: { icon: "ℹ️", label: "Information", color: "#6b7280" },
};

const getNotifType = (type) => NOTIF_TYPES[type] || NOTIF_TYPES.info;

const formatNotifDate = (dateStr) => {
  if (!dateStr) return "";
  const d = parseISO(dateStr);
  if (isToday(d)) return `Aujourd'hui à ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `Hier à ${format(d, "HH:mm")}`;
  return format(d, "dd MMM yyyy à HH:mm", { locale: fr });
};

const groupByDate = (notifications) => {
  const groups = {};
  notifications.forEach((n) => {
    const d = n.createdAt ? parseISO(n.createdAt) : new Date();
    let key;
    if (isToday(d)) key = "Aujourd'hui";
    else if (isYesterday(d)) key = "Hier";
    else key = format(d, "EEEE d MMMM yyyy", { locale: fr });
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  });
  return groups;
};

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
    { name: "bulletins", path: "/bulletins" },
    { name: "Notifications", path: "/notifications" },
    { name: "Gestion Utilisateurs", path: "/administrator" },
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
export default function Notifications() {
  const { getAuthHeaders } = useUserContext();
  const confirm = useConfirm();
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState("all"); // all | unread | read
  const [typeFilter, setTypeFilter] = useState(""); // student_created, payment, etc.
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${API}/get/notifications`, { headers: getAuthHeaders() });
      const data = await res.json();
      setNotifications(Array.isArray(data) ? data : []);
      setUnreadCount(Array.isArray(data) ? data.filter((n) => !n.read).length : 0);
    } catch { toast.error("Erreur récupération notifications"); }
  };

  useEffect(() => { fetchNotifications(); }, []);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === "unread" && n.read) return false;
      if (filter === "read" && !n.read) return false;
      if (typeFilter && n.type !== typeFilter) return false;
      return true;
    });
  }, [notifications, filter, typeFilter]);

  const grouped = useMemo(() => groupByDate(filteredNotifications), [filteredNotifications]);

  const markAsRead = async (id) => {
    try {
      await fetch(`${API}/read/notification/${id}`, { method: "PUT", headers: getAuthHeaders() });
      fetchNotifications();
    } catch { toast.error("Erreur"); }
  };

  const markAllAsRead = async () => {
    try {
      await fetch(`${API}/read/all/notifications`, { method: "PUT", headers: getAuthHeaders() });
      toast.success("Toutes marquées comme lues");
      fetchNotifications();
    } catch { toast.error("Erreur"); }
  };

  const deleteNotification = async (id) => {
    try {
      await fetch(`${API}/delete/notification/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      toast.success("Supprimée");
      fetchNotifications();
    } catch { toast.error("Erreur"); }
  };

  const deleteAll = async () => {
    if (!(await confirm("Supprimer TOUTES les notifications ?", { titre: "Supprimer les notifications" }))) return;
    try {
      await fetch(`${API}/delete/all/notifications`, { method: "DELETE", headers: getAuthHeaders() });
      toast.success("Toutes supprimées");
      fetchNotifications();
    } catch { toast.error("Erreur"); }
  };

  // Stats par type
  const typeStats = useMemo(() => {
    const counts = {};
    notifications.forEach((n) => {
      counts[n.type] = (counts[n.type] || 0) + 1;
    });
    return counts;
  }, [notifications]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f1f5f9" }}>
      <Sidebar />
      <div style={{ flex: 1, padding: 20 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0 }}>Notifications</h1>
            {unreadCount > 0 && (
              <span style={{
                padding: "4px 12px", borderRadius: 20, fontSize: 13, fontWeight: 700,
                background: "#ef4444", color: "#fff",
              }}>{unreadCount} non lue{unreadCount > 1 ? "s" : ""}</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} style={btnSecondary}>Tout marquer lu</button>
            )}
            {notifications.length > 0 && (
              <button onClick={deleteAll} style={{ ...btnSecondary, color: "#ef4444" }}>Tout supprimer</button>
            )}
          </div>
        </div>

        {/* Filtres */}
        <div style={filterBar}>
          {/* Read/Unread */}
          {["all", "unread", "read"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "7px 16px", borderRadius: 20, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 12,
              background: filter === f ? "#2563eb" : "#e5e7eb",
              color: filter === f ? "#fff" : "#374151",
            }}>
              {f === "all" ? `Toutes (${notifications.length})` : f === "unread" ? `Non lues (${unreadCount})` : `Lues (${notifications.length - unreadCount})`}
            </button>
          ))}

          <div style={{ width: 1, height: 24, background: "#d1d5db" }} />

          {/* Type filter */}
          <button onClick={() => setTypeFilter("")} style={{
            padding: "7px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
            background: !typeFilter ? "#1e40af" : "#e5e7eb", color: !typeFilter ? "#fff" : "#374151",
          }}>Tous types</button>

          {Object.entries(NOTIF_TYPES).filter(([k]) => typeStats[k]).map(([key, val]) => (
            <button key={key} onClick={() => setTypeFilter(typeFilter === key ? "" : key)} style={{
              padding: "7px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: typeFilter === key ? val.color + "20" : "#f3f4f6",
              color: typeFilter === key ? val.color : "#6b7280",
            }}>
              {val.icon} {val.label} ({typeStats[key]})
            </button>
          ))}
        </div>

        {/* Liste groupée par date */}
        {Object.keys(grouped).length > 0 ? (
          Object.entries(grouped).map(([dateLabel, notifs]) => (
            <div key={dateLabel} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", padding: "8px 0", textTransform: "capitalize" }}>
                {dateLabel}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {notifs.map((n) => {
                  const t = getNotifType(n.type);
                  return (
                    <div key={n._id} style={{
                      display: "flex", alignItems: "flex-start", gap: 12,
                      padding: "14px 16px", borderRadius: 10,
                      background: n.read ? "#fff" : "#eff6ff",
                      border: n.read ? "1px solid #e5e7eb" : "1px solid #bfdbfe",
                      transition: "all 0.15s",
                    }}>
                      {/* Icône */}
                      <div style={{
                        width: 40, height: 40, borderRadius: "50%",
                        background: t.color + "15", display: "flex",
                        alignItems: "center", justifyContent: "center",
                        fontSize: 18, flexShrink: 0,
                      }}>
                        {t.icon}
                      </div>

                      {/* Contenu */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{n.title}</span>
                            <span style={{
                              padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600,
                              background: t.color + "18", color: t.color,
                            }}>{t.label}</span>
                            {!n.read && (
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563eb", display: "inline-block" }} />
                            )}
                          </div>
                          <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>
                            {formatNotifDate(n.createdAt)}
                          </span>
                        </div>

                        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
                          {n.message}
                        </p>

                        {/* Actions */}
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          {!n.read && (
                            <button onClick={() => markAsRead(n._id)} style={actionBtn}>
                              Marquer lu
                            </button>
                          )}
                          <button onClick={() => deleteNotification(n._id)} style={{ ...actionBtn, color: "#ef4444" }}>
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🔔</div>
            <p style={{ fontSize: 15 }}>Aucune notification</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══ STYLES ═══ */
const sidebarStyle = { width: 200, background: "#0f172a", color: "#fff", padding: 20 };
const sidebarItemStyle = { padding: 12, marginBottom: 10, borderRadius: 8, cursor: "pointer", background: "#1e3a8a" };
const filterBar = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 20, padding: "12px 16px", background: "#fff", borderRadius: 12, boxShadow: "0 2px 6px rgba(0,0,0,0.04)" };
const btnSecondary = { padding: "8px 14px", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 12 };
const actionBtn = { background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#2563eb", padding: "2px 0" };