// ══════════════════════════════════════════════════════════════════
// SessionMarker.jsx - Composant de marquage de séance
// 
// À intégrer dans ta page Courses.jsx dans le modal détail créneau
// Le prof clique sur une séance → choisit "Effectué" / "Indisponible" etc.
// Seules les séances "Effectué" décomptent les heures du module.
//
// IMPORT : import SessionMarker from "./SessionMarker";
// USAGE  : <SessionMarker slot={selectedSlot} onUpdate={fetchSchedule} />
// ══════════════════════════════════════════════════════════════════

import React, { useState } from "react";
import toast from "react-hot-toast";

const STATUS_OPTIONS = [
  { value: "effectue",     label: "Effectué",       color: "#22c55e", icon: "✅", description: "Cours dispensé - heures décomptées" },
  { value: "indisponible", label: "Indisponible",    color: "#f59e0b", icon: "⚠️", description: "Prof absent - heures NON décomptées" },
  { value: "annule",       label: "Annulé",          color: "#ef4444", icon: "❌", description: "Séance annulée - heures NON décomptées" },
  { value: "reporte",      label: "Reporté",         color: "#3b82f6", icon: "↪️", description: "Reporté à une autre date" },
  { value: "pending",      label: "En attente",      color: "#9ca3af", icon: "⏳", description: "Pas encore eu lieu" },
];

const getStatusInfo = (status) => STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[4];

export default function SessionMarker({ slot, onUpdate, getAuthHeaders }) {
  const [marking, setMarking] = useState(false);
  const [note, setNote] = useState("");
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportDate, setReportDate] = useState("");
  const [reportHour, setReportHour] = useState("");

  if (!slot) return null;

  const currentStatus = getStatusInfo(slot.sessionStatus || "pending");

  const handleMark = async (newStatus) => {
    if (newStatus === "reporte") {
      setShowReportForm(true);
      return;
    }

    setMarking(true);
    try {
      const res = await fetch(`http://localhost:8080/mark/session/${slot._id}`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionStatus: newStatus,
          sessionNote: note,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || `Séance marquée : ${newStatus}`);
        onUpdate?.();
      } else {
        toast.error(data.message || "Erreur");
      }
    } catch {
      toast.error("Erreur serveur");
    } finally {
      setMarking(false);
    }
  };

  const handleReport = async () => {
    if (!reportDate) {
      toast.error("Choisissez une date pour le report");
      return;
    }

    setMarking(true);
    try {
      // Calculer le jour FR
      const dateObj = new Date(reportDate + "T12:00:00");
      const daysMap = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
      const newDay = daysMap[dateObj.getDay()];
      const hour = reportHour || parseInt(slot.startTime);
      const duration = parseInt(slot.endTime) - parseInt(slot.startTime);

      const res = await fetch(`http://localhost:8080/report/session/${slot._id}`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          newDate: reportDate,
          newDay,
          newStartTime: `${hour}:00`,
          newEndTime: `${Number(hour) + duration}:00`,
          reason: note || "Reporté par le professeur",
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success("Séance reportée !");
        setShowReportForm(false);
        onUpdate?.();
      } else {
        toast.error(data.message || "Erreur");
      }
    } catch {
      toast.error("Erreur serveur");
    } finally {
      setMarking(false);
    }
  };

  return (
    <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 10, background: "#f9fafb", border: "1px solid #e5e7eb" }}>

      {/* Statut actuel */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>{currentStatus.icon}</span>
        <span style={{
          padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
          background: currentStatus.color + "20", color: currentStatus.color,
        }}>
          {currentStatus.label}
        </span>
        {slot.markedAt && (
          <span style={{ fontSize: 11, color: "#9ca3af" }}>
            Marqué le {new Date(slot.markedAt).toLocaleDateString("fr-FR")}
          </span>
        )}
        {slot.sessionNote && (
          <span style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>
            - {slot.sessionNote}
          </span>
        )}
      </div>

      {/* Note optionnelle */}
      <input
        type="text"
        placeholder="Note (ex: Maladie, Réunion, Jour férié...)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{
          width: "100%", padding: "8px 10px", borderRadius: 6,
          border: "1px solid #e5e7eb", fontSize: 12, marginBottom: 10,
          boxSizing: "border-box",
        }}
      />

      {/* Boutons de marquage */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {STATUS_OPTIONS.filter((s) => s.value !== "pending").map((status) => {
          const isActive = slot.sessionStatus === status.value;
          return (
            <button
              key={status.value}
              disabled={marking}
              onClick={() => handleMark(status.value)}
              title={status.description}
              style={{
                padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: isActive ? `2px solid ${status.color}` : "1px solid #e5e7eb",
                background: isActive ? status.color + "20" : "#fff",
                color: isActive ? status.color : "#374151",
                cursor: marking ? "wait" : "pointer",
                opacity: marking ? 0.6 : 1,
              }}
            >
              {status.icon} {status.label}
            </button>
          );
        })}
      </div>

      {/* Formulaire de report */}
      {showReportForm && (
        <div style={{ marginTop: 10, padding: 10, background: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Reporter à quelle date ?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              style={{ padding: "6px 8px", borderRadius: 4, border: "1px solid #ccc", fontSize: 12, flex: 1 }}
            />
            <select
              value={reportHour}
              onChange={(e) => setReportHour(e.target.value)}
              style={{ padding: "6px 8px", borderRadius: 4, border: "1px solid #ccc", fontSize: 12 }}
            >
              <option value="">Même heure</option>
              {Array.from({ length: 14 }, (_, i) => i + 8).map((h) => (
                <option key={h} value={h}>{h}:00</option>
              ))}
            </select>
            <button
              onClick={handleReport}
              disabled={marking}
              style={{
                padding: "6px 14px", borderRadius: 4, fontSize: 12, fontWeight: 600,
                background: "#2563eb", color: "#fff", border: "none", cursor: "pointer",
              }}
            >
              Confirmer
            </button>
            <button
              onClick={() => setShowReportForm(false)}
              style={{
                padding: "6px 10px", borderRadius: 4, fontSize: 12,
                background: "#e5e7eb", border: "none", cursor: "pointer",
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// INTÉGRATION DANS Courses.jsx :
//
// 1. Importe le composant :
//    import SessionMarker from "./SessionMarker";
//
// 2. Dans ton modal détail créneau (selectedSlot), AJOUTE avant les boutons :
//
//    <SessionMarker
//      slot={selectedSlot}
//      onUpdate={() => { fetchSchedule(); setSelectedSlot(null); }}
//      getAuthHeaders={getAuthHeaders}
//    />
//
// 3. Dans la grille du planning, affiche le statut de la séance.
//    Modifie le renderDayRow pour montrer un petit badge :
//
//    {slotStart?.sessionStatus === "effectue" && (
//      <div style={{ fontSize: 8, background: "#22c55e", color: "#fff",
//        borderRadius: 3, padding: "1px 4px", position: "absolute",
//        top: -2, left: -2 }}>✅</div>
//    )}
//    {slotStart?.sessionStatus === "indisponible" && (
//      <div style={{ fontSize: 8, background: "#f59e0b", color: "#fff",
//        borderRadius: 3, padding: "1px 4px", position: "absolute",
//        top: -2, left: -2 }}>⚠️</div>
//    )}
//    {slotStart?.sessionStatus === "annule" && (
//      <div style={{ fontSize: 8, background: "#ef4444", color: "#fff",
//        borderRadius: 3, padding: "1px 4px", position: "absolute",
//        top: -2, left: -2 }}>❌</div>
//    )}
//
// ══════════════════════════════════════════════════════════════════