// src/pages/Rooms.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useUserContext } from "../../contexts/UserContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const API = "http://localhost:8080";

const ROOM_TYPE_OPTIONS = [
  { name: "Dashboard", path: "/AdminDashboard" },
    { name: "Professeurs", path: "/TeachersPage" },
    { name: "Classes", path: "/classes" },
    { name: "Cours", path: "/courses" },
    { name: "Etudiant", path: "/student" },
    { name: "Examens", path: "/exams" },
    { name: "Salles", path: "/rooms" },
    { name: "Notifications", path: "/notifications" },
    { name: "Gestion Utilisateurs", path: "/administrator" },
    { name: "Profil", path: "/profile" },
    { name: "Déconnexion", path: "/logout" },
];

const EQUIPMENTS = ["projecteur", "tableau_blanc", "ordinateurs", "wifi", "climatisation", "sono", "tableau_noir"];

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
export default function Rooms() {
  const { getAuthHeaders } = useUserContext();
  const confirm = useConfirm();
  const [rooms, setRooms] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [checkDate, setCheckDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [availability, setAvailability] = useState(null);
  const [loadingAvail, setLoadingAvail] = useState(false);

  const [form, setForm] = useState({
    name: "", type: "salle", capacity: 30, building: "", floor: "", equipment: [],
    isAvailable: true, maintenanceNote: "",
  });

  const fetchRooms = async () => {
    try {
      const res = await fetch(`${API}/get/rooms`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (Array.isArray(data)) {
        setRooms(data);
      } else {
        console.error("L'API /get/rooms n'a pas retourné un tableau :", data);
        toast.error("Erreur de format des données salles");
        setRooms([]);
      }
    } catch (err) {
      console.error(err);
      toast.error("Erreur chargement salles");
      setRooms([]);
    }
  };

  useEffect(() => { fetchRooms(); }, []);

  const filtered = useMemo(() => {
    return rooms.filter((r) => {
      const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.building?.toLowerCase().includes(search.toLowerCase());
      const matchType = !typeFilter || r.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [rooms, search, typeFilter]);

  const resetForm = () => {
    setForm({
      name: "", type: "salle", capacity: 30, building: "", floor: "", equipment: [],
      isAvailable: true, maintenanceNote: "",
    });
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form.name) { toast.error("Nom obligatoire"); return; }
    try {
      const url = editing ? `${API}/update/room/${editing._id}` : `${API}/create/room`;
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(editing ? "Salle modifiée" : "Salle créée");
        setShowModal(false); resetForm(); fetchRooms();
      } else toast.error(data.message || "Erreur");
    } catch { toast.error("Erreur serveur"); }
  };

  const handleDelete = async (id) => {
    if (!(await confirm("Supprimer cette salle ?", { titre: "Supprimer la salle" }))) return;
    try {
      const res = await fetch(`${API}/delete/room/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      const data = await res.json();
      if (res.ok) { toast.success("Supprimée"); fetchRooms(); }
      else toast.error(data.message);
    } catch { toast.error("Erreur"); }
  };

  // Bascule rapide de disponibilité (sans ouvrir le modal)
  const toggleAvailability = async (room) => {
    const newStatus = !room.isAvailable;
    try {
      const res = await fetch(`${API}/update/room/${room._id}`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ isAvailable: newStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(newStatus ? "Salle rendue disponible" : "Salle marquée indisponible");
        fetchRooms();
      } else toast.error(data.message || "Erreur");
    } catch { toast.error("Erreur"); }
  };

  const openEdit = (room) => {
    setEditing(room);
    setForm({
      name: room.name, type: room.type, capacity: room.capacity,
      building: room.building || "", floor: room.floor || "",
      equipment: room.equipment || [],
      isAvailable: room.isAvailable !== false,
      maintenanceNote: room.maintenanceNote || "",
    });
    setShowModal(true);
  };

  const checkAvailability = async (roomId) => {
    setSelectedRoom(roomId);
    setLoadingAvail(true);
    try {
      const res = await fetch(`${API}/get/room-availability/${roomId}?date=${checkDate}`, { headers: getAuthHeaders() });
      const data = await res.json();
      setAvailability(data);
    } catch { toast.error("Erreur"); setAvailability(null); }
    finally { setLoadingAvail(false); }
  };

  const toggleEquipment = (eq) => {
    setForm((prev) => ({
      ...prev,
      equipment: prev.equipment.includes(eq)
        ? prev.equipment.filter((e) => e !== eq)
        : [...prev.equipment, eq],
    }));
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f9fafb" }}>
      <Sidebar />
      <div style={{ flex: 1, padding: 20 }}>
        <h1 style={{ marginBottom: 20 }}>🏫 Gestion des salles</h1>

        <button onClick={() => { resetForm(); setShowModal(true); }} style={btnPrimary}>+ Ajouter une salle</button>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, margin: "16px 0" }}>
          <div style={statCard}><div style={{ fontSize: 11, color: "#6b7280" }}>Total</div><div style={{ fontSize: 22, fontWeight: 700 }}>{rooms.length}</div></div>
          <div style={statCard}><div style={{ fontSize: 11, color: "#6b7280" }}>Salles</div><div style={{ fontSize: 22, fontWeight: 700, color: "#3b82f6" }}>{rooms.filter(r => r.type === "salle").length}</div></div>
          <div style={statCard}><div style={{ fontSize: 11, color: "#6b7280" }}>Amphis</div><div style={{ fontSize: 22, fontWeight: 700, color: "#8b5cf6" }}>{rooms.filter(r => r.type === "amphi").length}</div></div>
          <div style={statCard}><div style={{ fontSize: 11, color: "#6b7280" }}>Labos</div><div style={{ fontSize: 22, fontWeight: 700, color: "#10b981" }}>{rooms.filter(r => r.type === "labo" || r.type === "salle_info").length}</div></div>
          <div style={statCard}><div style={{ fontSize: 11, color: "#6b7280" }}>Disponibles</div><div style={{ fontSize: 22, fontWeight: 700, color: "#22c55e" }}>{rooms.filter(r => r.isAvailable !== false).length}</div></div>
        </div>

        {/* Filtres */}
        <div style={filterBar}>
          <input type="text" placeholder="🔍 Rechercher" value={search} onChange={(e) => setSearch(e.target.value)} style={filterInput} />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={filterInput}>
            <option value="">Tous les types</option>
            {ROOM_TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input type="date" value={checkDate} onChange={(e) => { setCheckDate(e.target.value); if (selectedRoom) checkAvailability(selectedRoom); }} style={filterInput} />
        </div>

        {/* Tableau */}
        <div style={card}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Nom</th><th style={th}>Type</th><th style={th}>Capacité</th>
                <th style={th}>Bâtiment</th><th style={th}>Étage</th><th style={th}>Équipements</th>
                <th style={th}>Statut</th><th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? filtered.map(r => (
                <tr key={r._id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                  <td style={td}>{ROOM_TYPE_OPTIONS.find(t => t.value === r.type)?.label || r.type}</td>
                  <td style={td}>{r.capacity} places</td>
                  <td style={td}>{r.building || "-"}</td>
                  <td style={td}>{r.floor || "-"}</td>
                  <td style={td}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {(r.equipment || []).map((eq, i) => (
                        <span key={i} style={{ padding: "2px 6px", borderRadius: 8, fontSize: 10, background: "#ede9fe", color: "#5b21b6" }}>{eq}</span>
                      ))}
                      {(!r.equipment || r.equipment.length === 0) && <span style={{ color: "#9ca3af", fontSize: 11 }}>-</span>}
                    </div>
                  </td>
                  <td style={td}>
                    <span style={{
                      padding: "3px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: r.isAvailable !== false ? "#dcfce7" : "#fee2e2",
                      color: r.isAvailable !== false ? "#166534" : "#991b1b",
                    }}>
                      {r.isAvailable !== false ? "Disponible" : "Indisponible"}
                    </span>
                    {r.maintenanceNote && r.isAvailable === false && (
                      <div style={{ fontSize: 9, color: "#991b1b", marginTop: 2 }}>{r.maintenanceNote}</div>
                    )}
                  </td>
                  <td style={td}>
                    <button style={{ ...btnSmall, background: "#3b82f6" }} onClick={() => checkAvailability(r._id)} title="Voir planning">📅</button>
                    <button style={{ ...btnSmall, background: "#10b981", marginLeft: 4 }} onClick={() => openEdit(r)}>Modifier</button>
                    {/* Bouton pour basculer la disponibilité */}
                    <button
                      style={{ ...btnSmall, background: r.isAvailable !== false ? "#f59e0b" : "#22c55e", marginLeft: 4 }}
                      onClick={() => toggleAvailability(r)}
                      title={r.isAvailable !== false ? "Rendre indisponible" : "Rendre disponible"}
                    >
                      {r.isAvailable !== false ? "🔴 Indispo" : "🟢 Dispo"}
                    </button>
                    <button style={{ ...btnSmall, background: "#ef4444", marginLeft: 4 }} onClick={() => handleDelete(r._id)}>Suppr.</button>
                  </td>
                  </tr>
                
              )) : (
                <tr><td colSpan="8" style={{ textAlign: "center", padding: 20, color: "#9ca3af" }}>Aucune salle</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {availability && (
          <div style={{ ...card, marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>
                📅 {availability.room?.name} - {availability.day}{" "}
                {format(new Date(checkDate + "T12:00:00"), "d MMMM yyyy", { locale: fr })}
              </h3>
              <button onClick={() => setAvailability(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>

            {!availability.available ? (
              <div style={{ padding: 16, background: "#fee2e2", borderRadius: 8, color: "#991b1b" }}>
                Salle indisponible : {availability.reason}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 12, marginBottom: 10, fontSize: 11, color: "#6b7280" }}>
                  <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#dcfce7", borderRadius: 3, verticalAlign: "middle" }} /> Libre ({availability.freeCount})</span>
                  <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#3b82f6", borderRadius: 3, verticalAlign: "middle" }} /> Cours ({availability.busyCount})</span>
                </div>

                <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 8 }}>
                  {availability.slots?.map((slot) => {
                    const free = slot.status === "free";
                    return (
                      <div key={slot.hour} style={{
                        minWidth: 80, padding: "10px 8px", borderRadius: 8, textAlign: "center",
                        background: free ? "#dcfce7" : slot.status === "exam" ? "#ef4444" : "#3b82f6",
                        color: free ? "#166534" : "#fff", fontSize: 11, lineHeight: 1.4,
                      }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{slot.hour}:00</div>
                        <div>{slot.label}</div>
                        {slot.class && <div style={{ fontSize: 10, opacity: 0.8 }}>{slot.class}</div>}
                        {slot.teacher && <div style={{ fontSize: 9, opacity: 0.7 }}>{slot.teacher}</div>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* MODAL CRÉER/MODIFIER SALLE (avec gestion indisponibilité) */}
        {showModal && (
          <div style={modalOverlay}>
            <div style={modalBox}>
              <h2>{editing ? "Modifier la salle" : "Ajouter une salle"}</h2>

              <label style={labelSt}>Nom de la salle *</label>
              <input type="text" placeholder="ex: Salle B12" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputSt} />

              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelSt}>Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputSt}>
                    {ROOM_TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelSt}>Capacité</label>
                  <input type="number" min="1" value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} style={inputSt} />
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelSt}>Bâtiment</label>
                  <input type="text" placeholder="ex: Bâtiment A" value={form.building}
                    onChange={(e) => setForm({ ...form, building: e.target.value })} style={inputSt} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelSt}>Étage</label>
                  <input type="text" placeholder="ex: 2ème étage" value={form.floor}
                    onChange={(e) => setForm({ ...form, floor: e.target.value })} style={inputSt} />
                </div>
              </div>

              <label style={labelSt}>Équipements</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {EQUIPMENTS.map(eq => (
                  <button key={eq} onClick={() => toggleEquipment(eq)} style={{
                    padding: "5px 10px", borderRadius: 16, fontSize: 12, cursor: "pointer",
                    border: form.equipment.includes(eq) ? "2px solid #8b5cf6" : "1px solid #d1d5db",
                    background: form.equipment.includes(eq) ? "#ede9fe" : "#fff",
                    color: form.equipment.includes(eq) ? "#5b21b6" : "#6b7280",
                  }}>{eq}</button>
                ))}
              </div>

              {/* SECTION DISPONIBILITÉ */}
              <div style={{ marginBottom: 12, padding: 10, background: "#f9fafb", borderRadius: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={form.isAvailable}
                    onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })}
                  />
                  <span>Salle disponible (cocher si opérationnelle)</span>
                </label>
                {!form.isAvailable && (
                  <div>
                    <label style={labelSt}>Note de maintenance / indisponibilité</label>
                    <textarea
                      rows="2"
                      placeholder="ex: En rénovation jusqu'au 15/06"
                      value={form.maintenanceNote}
                      onChange={(e) => setForm({ ...form, maintenanceNote: e.target.value })}
                      style={inputSt}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button onClick={handleSave} style={btnPrimary}>
                  {editing ? "Mettre à jour" : "Créer"}
                </button>
                <button onClick={() => { setShowModal(false); resetForm(); }} style={btnGray}>Annuler</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══ STYLES (inchangés) ═══ */
const sidebarStyle = { width: 200, background: "#0f172a", color: "#fff", padding: 20 };
const sidebarItemStyle = { padding: 12, marginBottom: 10, borderRadius: 8, cursor: "pointer", background: "#1e3a8a" };
const card = { background: "#fff", padding: 16, borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" };
const statCard = { background: "#fff", padding: 14, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", textAlign: "center" };
const tableStyle = { width: "100%", borderCollapse: "collapse" };
const th = { padding: "10px 12px", textAlign: "left", fontSize: 12, color: "#6b7280", background: "#f9fafb", fontWeight: 600 };
const td = { padding: "10px 12px", fontSize: 13 };
const filterBar = { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16, padding: 14, background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" };
const filterInput = { padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 };
const btnPrimary = { padding: "10px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13, marginTop: 10 };
const btnGray = { padding: "10px 18px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13, marginTop: 10 };
const btnSmall = { padding: "4px 8px", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 600 };
const modalOverlay = { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 };
const modalBox = { background: "#fff", padding: 24, borderRadius: 12, width: 500, maxWidth: "90vw" };
const inputSt = { padding: 10, marginBottom: 10, width: "100%", borderRadius: 6, border: "1px solid #d1d5db", boxSizing: "border-box", fontSize: 13 };
const labelSt = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 };