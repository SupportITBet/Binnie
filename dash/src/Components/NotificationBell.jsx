import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../hooks/useNotifications";

export default function NotificationBell({ userId }) {
  const { notifications, nbNonLues, marquerLue, fermerNotif } = useNotifications(userId);
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });
  const btnRef  = useRef(null);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  // Calculer la position du panel sous le bouton
  const calcPos = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPanelPos({
      top:   r.bottom + window.scrollY + 8,
      right: window.innerWidth - r.right,
    });
  };

  const handleToggle = () => {
    if (!open) calcPos();
    setOpen(o => !o);
  };

  // Fermer si clic en dehors
  useEffect(() => {
    const handler = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        btnRef.current   && !btnRef.current.contains(e.target)
      ) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Recalculer si scroll/resize pendant que le panel est ouvert
  useEffect(() => {
    if (!open) return;
    const update = () => calcPos();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
  }, [open]);

  const handleClick = async (notif) => {
    if (!notif.lu) await marquerLue(notif.id);
    if (notif.link) navigate(notif.link);
    setOpen(false);
  };

  const handleMarquerToutesLues = () => {
    notifications.filter(n => !n.lu).forEach(n => marquerLue(n.id));
  };

  const fmtDate = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return "À l'instant";
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* Bouton cloche */}
      <button
        ref={btnRef}
        onClick={handleToggle}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          position: "relative",
          padding: "6px 8px",
          borderRadius: "8px",
          transition: "background 0.15s",
          display: "flex",
          alignItems: "center",
        }}
        title="Notifications"
      >
        <span style={{ fontSize: "22px", lineHeight: 1 }}>🔔</span>
        {nbNonLues > 0 && (
          <span style={{
            position: "absolute",
            top: "2px",
            right: "2px",
            background: "#ef4444",
            color: "#fff",
            borderRadius: "999px",
            fontSize: "10px",
            fontWeight: 700,
            minWidth: "16px",
            height: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 3px",
            lineHeight: 1,
          }}>
            {nbNonLues > 99 ? "99+" : nbNonLues}
          </span>
        )}
      </button>

      {/* Panneau déroulant - rendu via portal pour échapper aux overflow:hidden parents */}
      {open && createPortal(
        <div ref={panelRef} style={{
          position: "absolute",
          top:   panelPos.top,
          right: panelPos.right,
          width: "360px",
          maxHeight: "480px",
          background: "#fff",
          borderRadius: "12px",
          boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
          zIndex: 99999,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* En-tête */}
          <div style={{
            padding: "14px 16px 10px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{ fontWeight: 700, fontSize: "15px", color: "#1e293b" }}>
              Notifications
            </span>
            {nbNonLues > 0 && (
              <button
                onClick={handleMarquerToutesLues}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "12px",
                  color: "#6366f1",
                  fontWeight: 600,
                  padding: "2px 6px",
                  borderRadius: "4px",
                }}
              >
                Tout marquer lu
              </button>
            )}
          </div>

          {/* Liste */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: "32px 16px",
                textAlign: "center",
                color: "#94a3b8",
                fontSize: "14px",
              }}>
                <div style={{ fontSize: "32px", marginBottom: "8px" }}>🔕</div>
                Aucune notification
              </div>
            ) : (
              notifications.slice(0, 5).map(notif => (
                <div
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid #f8fafc",
                    cursor: notif.link ? "pointer" : "default",
                    background: notif.lu ? "#fff" : "#f0f4ff",
                    display: "flex",
                    gap: "12px",
                    alignItems: "flex-start",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = notif.lu ? "#f8fafc" : "#e8edff"}
                  onMouseLeave={e => e.currentTarget.style.background = notif.lu ? "#fff" : "#f0f4ff"}
                >
                  {/* Icône */}
                  <div style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: "#ede9fe",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "18px",
                    flexShrink: 0,
                  }}>
                    {notif.icon || "🔔"}
                  </div>

                  {/* Contenu */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: notif.lu ? 500 : 700,
                      fontSize: "13px",
                      color: "#1e293b",
                      marginBottom: "2px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      {notif.titre}
                    </div>
                    <div style={{
                      fontSize: "12px",
                      color: "#64748b",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {notif.message}
                    </div>
                    <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                      {fmtDate(notif.createdAt)}
                    </div>
                  </div>

                  {/* Pastille non-lu */}
                  {!notif.lu && (
                    <div style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "#6366f1",
                      flexShrink: 0,
                      marginTop: "4px",
                    }} />
                  )}

                  {/* Fermer cette notification - sans passer par "voir toutes" */}
                  <button
                    onClick={e => { e.stopPropagation(); fermerNotif(notif.id); }}
                    title="Fermer cette notification"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#94a3b8",
                      fontSize: "13px",
                      lineHeight: 1,
                      padding: "2px 4px",
                      borderRadius: "4px",
                      flexShrink: 0,
                      marginTop: "1px",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#334155"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#94a3b8"; }}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer - voir toutes si plus de 5 */}
          {notifications.length > 5 && (
            <div style={{ padding:"10px 16px", borderTop:"1px solid #f1f5f9", textAlign:"center" }}>
              <span style={{ fontSize:"12px", color:"#6366f1", fontWeight:600 }}>
                +{notifications.length - 5} autre{notifications.length - 5 > 1 ? "s" : ""} notification{notifications.length - 5 > 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
