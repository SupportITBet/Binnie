import { useState, useMemo } from "react";
import { useNotifications } from "../hooks/useNotifications";

const TYPES_CONFIG = {
  paiement:     { icon:"💳", color:"#059669", bg:"#d1fae5", label:"Paiement" },
  inscription:  { icon:"📋", color:"#0891b2", bg:"#e0f2fe", label:"Inscription" },
  assignation:  { icon:"🎯", color:"#7c3aed", bg:"#ede9fe", label:"Affectation" },
  message:      { icon:"💬", color:"#f59e0b", bg:"#fef3c7", label:"Message" },
  cours:        { icon:"📚", color:"#2563eb", bg:"#dbeafe", label:"Cours" },
  evaluation:   { icon:"📝", color:"#dc2626", bg:"#fee2e2", label:"Évaluation" },
  honoraire:    { icon:"💵", color:"#d97706", bg:"#fef3c7", label:"Honoraire" },
  alerte:       { icon:"⚠️", color:"#dc2626", bg:"#fee2e2", label:"Alerte" },
  info:         { icon:"ℹ️", color:"#0891b2", bg:"#e0f2fe", label:"Info" },
  systeme:      { icon:"⚙️", color:"#64748b", bg:"#f1f5f9", label:"Système" },
};

const PERIODES = [
  { key:"toutes",       label:"Toutes périodes" },
  { key:"aujourd_hui",  label:"Aujourd'hui" },
  { key:"7j",           label:"7 derniers jours" },
  { key:"30j",          label:"30 derniers jours" },
  { key:"ce_mois",      label:"Ce mois-ci" },
  { key:"mois_dernier", label:"Mois dernier" },
];

const PAGE_SIZES = [10, 20, 50];

const toDate = (ts) => ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);

const fmtDate = (ts) => {
  const d = toDate(ts);
  if (!d) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)  return "À l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `il y a ${h}h`;
  const j = Math.floor(h / 24);
  if (j < 7)    return `il y a ${j}j`;
  return d.toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" });
};

const isInPeriode = (ts, periode) => {
  const d = toDate(ts);
  if (!d || periode === "toutes") return true;
  const now   = new Date();
  const start = new Date(now);
  if (periode === "aujourd_hui") {
    start.setHours(0, 0, 0, 0);
    return d >= start;
  }
  if (periode === "7j") {
    start.setDate(start.getDate() - 7);
    return d >= start;
  }
  if (periode === "30j") {
    start.setDate(start.getDate() - 30);
    return d >= start;
  }
  if (periode === "ce_mois") {
    start.setDate(1); start.setHours(0, 0, 0, 0);
    return d >= start;
  }
  if (periode === "mois_dernier") {
    const debut = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const fin   = new Date(now.getFullYear(), now.getMonth(), 1);
    return d >= debut && d < fin;
  }
  return true;
};

function NotifDetailModal({ notif, onClose, accentColor }) {
  if (!notif) return null;
  const cfg  = TYPES_CONFIG[notif.type] || TYPES_CONFIG.info;
  const date = toDate(notif.createdAt);
  return (
    <div onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:520, boxShadow:"0 20px 60px rgba(0,0,0,.2)", overflow:"hidden" }}>

        {/* Header coloré */}
        <div style={{ background:`linear-gradient(135deg,${cfg.color}22,${cfg.color}08)`, borderBottom:`3px solid ${cfg.color}`, padding:"20px 22px", display:"flex", alignItems:"flex-start", gap:14 }}>
          <div style={{ width:52, height:52, borderRadius:14, background:cfg.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, flexShrink:0 }}>
            {cfg.icon}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <span style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:".07em", color:cfg.color, background:cfg.bg, borderRadius:99, padding:"2px 9px", display:"inline-block", marginBottom:6 }}>
              {cfg.icon} {cfg.label}
            </span>
            <div style={{ fontSize:16, fontWeight:800, color:"#0f172a", lineHeight:1.3 }}>
              {notif.titre || notif.title || "Notification"}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background:"#f1f5f9", border:"none", width:30, height:30, borderRadius:"50%", cursor:"pointer", fontSize:15, color:"#64748b", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            ✕
          </button>
        </div>

        {/* Corps */}
        <div style={{ padding:"20px 22px" }}>
          {/* Message */}
          <div style={{ fontSize:14, color:"#1e293b", lineHeight:1.7, marginBottom:18, background:"#f8fafc", borderRadius:10, padding:"14px 16px", border:"1px solid #e2e8f0" }}>
            {notif.message || notif.body || "Aucun contenu."}
          </div>

          {/* Métadonnées */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 14px", border:"1px solid #e2e8f0" }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".05em", marginBottom:3 }}>Date</div>
              <div style={{ fontSize:13, fontWeight:600, color:"#0f172a" }}>
                {date ? date.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" }) : "-"}
              </div>
            </div>
            <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 14px", border:"1px solid #e2e8f0" }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".05em", marginBottom:3 }}>Heure</div>
              <div style={{ fontSize:13, fontWeight:600, color:"#0f172a" }}>
                {date ? date.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" }) : "-"}
              </div>
            </div>
            <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 14px", border:"1px solid #e2e8f0" }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".05em", marginBottom:3 }}>Statut</div>
              <div style={{ fontSize:13, fontWeight:700, color: notif.lu ? "#16a34a" : accentColor }}>
                {notif.lu ? "✅ Lue" : "🔵 Non lue"}
              </div>
            </div>
            {notif.type && (
              <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 14px", border:"1px solid #e2e8f0" }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".05em", marginBottom:3 }}>Catégorie</div>
                <div style={{ fontSize:13, fontWeight:700, color:cfg.color }}>{cfg.icon} {cfg.label}</div>
              </div>
            )}
          </div>

          {/* Données supplémentaires si présentes */}
          {notif.data && Object.keys(notif.data).length > 0 && (
            <div style={{ marginTop:12 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".05em", marginBottom:8 }}>Informations complémentaires</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {Object.entries(notif.data).map(([k, v]) => (
                  <div key={k} style={{ display:"flex", gap:10, background:"#f8fafc", borderRadius:7, padding:"8px 12px", border:"1px solid #e2e8f0" }}>
                    <span style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"capitalize", flexShrink:0 }}>{k} :</span>
                    <span style={{ fontSize:11, color:"#0f172a" }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:"12px 22px", borderTop:"1px solid #f1f5f9", display:"flex", justifyContent:"flex-end" }}>
          <button onClick={onClose}
            style={{ padding:"9px 22px", background:"#f1f5f9", border:"none", borderRadius:8, fontSize:13, fontWeight:700, color:"#374151", cursor:"pointer" }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsTab({ userId, accentColor = "#0891b2" }) {
  const { notifications, nbNonLues, marquerLue } = useNotifications(userId);

  const [filtre,      setFiltre]      = useState("toutes");
  const [typeFiltre,  setTypeFiltre]  = useState("tous");
  const [periode,     setPeriode]     = useState("toutes");
  const [page,        setPage]        = useState(1);
  const [pageSize,    setPageSize]    = useState(10);
  const [selected,    setSelected]    = useState(null);

  const resetPage = () => setPage(1);

  const marquerToutesLues = () => {
    notifications.filter(n => !n.lu).forEach(n => marquerLue(n.id));
  };

  const filtrees = useMemo(() => notifications.filter(n => {
    if (filtre === "non_lues" && n.lu)  return false;
    if (filtre === "lues"     && !n.lu) return false;
    if (typeFiltre !== "tous" && n.type !== typeFiltre) return false;
    if (!isInPeriode(n.createdAt, periode)) return false;
    return true;
  }), [notifications, filtre, typeFiltre, periode]);

  const totalPages  = Math.max(1, Math.ceil(filtrees.length / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const paginee     = filtrees.slice((pageClamped - 1) * pageSize, pageClamped * pageSize);

  const typesPresents = [...new Set(notifications.map(n => n.type).filter(Boolean))];

  const handleFiltre = (v)      => { setFiltre(v);     resetPage(); };
  const handleType   = (v)      => { setTypeFiltre(v); resetPage(); };
  const handlePeriode = (v)     => { setPeriode(v);    resetPage(); };
  const handlePageSize = (v)    => { setPageSize(Number(v)); resetPage(); };

  return (
    <div style={{ width: "100%" }}>

      {/* ── Header ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:"#0f172a" }}>🔔 Notifications</h2>
          <p style={{ margin:"3px 0 0", fontSize:13, color:"#9ca3af" }}>
            {nbNonLues > 0
              ? `${nbNonLues} non lue${nbNonLues > 1 ? "s" : ""} · ${notifications.length} au total`
              : `${notifications.length} notification${notifications.length > 1 ? "s" : ""}`}
          </p>
        </div>
        {nbNonLues > 0 && (
          <button onClick={marquerToutesLues}
            style={{ padding:"8px 14px", background:"#f1f5f9", border:"none", borderRadius:8, fontSize:12, fontWeight:600, color:"#475569", cursor:"pointer" }}>
            ✓ Tout marquer comme lu
          </button>
        )}
      </div>

      {/* ── Filtre statut ── */}
      <div style={{ display:"flex", gap:6, marginBottom:12, background:"#f1f5f9", borderRadius:10, padding:4, width:"fit-content" }}>
        {[
          { key:"toutes",   label:`Toutes (${notifications.length})` },
          { key:"non_lues", label:`Non lues (${nbNonLues})` },
          { key:"lues",     label:`Lues (${notifications.length - nbNonLues})` },
        ].map(f => (
          <button key={f.key} onClick={() => handleFiltre(f.key)}
            style={{ padding:"6px 14px", borderRadius:8, border:"none", fontSize:12, fontWeight:600, cursor:"pointer",
              background: filtre === f.key ? "#fff" : "transparent",
              color:      filtre === f.key ? accentColor : "#64748b",
              boxShadow:  filtre === f.key ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
              transition:"all .15s" }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Filtre période ── */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12, alignItems:"center" }}>
        <span style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".05em", marginRight:4 }}>Période :</span>
        {PERIODES.map(p => (
          <button key={p.key} onClick={() => handlePeriode(p.key)}
            style={{ padding:"4px 12px", borderRadius:20, border:`1.5px solid ${periode === p.key ? accentColor : "#e5e7eb"}`,
              background: periode === p.key ? accentColor : "#fff",
              color:      periode === p.key ? "#fff" : "#374151",
              fontSize:11, fontWeight:600, cursor:"pointer", transition:"all .15s" }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Filtre type ── */}
      {typesPresents.length > 1 && (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:18, alignItems:"center" }}>
          <span style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".05em", marginRight:4 }}>Type :</span>
          <button onClick={() => handleType("tous")}
            style={{ padding:"4px 12px", borderRadius:20, border:`1.5px solid ${typeFiltre==="tous" ? accentColor : "#e5e7eb"}`,
              background: typeFiltre==="tous" ? accentColor : "#fff", color: typeFiltre==="tous" ? "#fff" : "#374151",
              fontSize:11, fontWeight:600, cursor:"pointer" }}>
            Tous
          </button>
          {typesPresents.map(t => {
            const cfg = TYPES_CONFIG[t] || TYPES_CONFIG.info;
            return (
              <button key={t} onClick={() => handleType(t)}
                style={{ padding:"4px 12px", borderRadius:20, border:`1.5px solid ${typeFiltre===t ? cfg.color : "#e5e7eb"}`,
                  background: typeFiltre===t ? cfg.color : "#fff",
                  color: typeFiltre===t ? "#fff" : "#374151",
                  fontSize:11, fontWeight:600, cursor:"pointer" }}>
                {cfg.icon} {cfg.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Barre résumé + taille page ── */}
      {filtrees.length > 0 && (
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <span style={{ fontSize:12, color:"#64748b" }}>
            {filtrees.length} notification{filtrees.length > 1 ? "s" : ""}
            {filtrees.length !== notifications.length ? " filtrée" + (filtrees.length > 1 ? "s" : "") : ""}
            {totalPages > 1 && <span style={{ color:"#94a3b8" }}> · page {pageClamped}/{totalPages}</span>}
          </span>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:11, color:"#94a3b8" }}>Afficher :</span>
            {PAGE_SIZES.map(s => (
              <button key={s} onClick={() => handlePageSize(s)}
                style={{ padding:"3px 10px", borderRadius:6, border:`1.5px solid ${pageSize===s ? accentColor : "#e5e7eb"}`,
                  background: pageSize===s ? accentColor : "#fff",
                  color: pageSize===s ? "#fff" : "#374151",
                  fontSize:11, fontWeight:600, cursor:"pointer" }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Liste ── */}
      {filtrees.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 20px", background:"#f8fafc", borderRadius:16, border:"1px solid #e5e7eb" }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🔕</div>
          <div style={{ fontWeight:700, fontSize:15, color:"#0f172a", marginBottom:6 }}>
            {filtre === "non_lues" ? "Aucune notification non lue" : "Aucune notification"}
            {periode !== "toutes" ? ` pour cette période` : ""}
          </div>
          <p style={{ color:"#9ca3af", fontSize:13, margin:0 }}>
            Vous êtes à jour ! Les nouvelles notifications apparaîtront ici.
          </p>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {paginee.map(notif => {
            const cfg = TYPES_CONFIG[notif.type] || TYPES_CONFIG.info;
            return (
              <div key={notif.id}
                onClick={() => { if (!notif.lu) marquerLue(notif.id); setSelected(notif); }}
                style={{ display:"flex", gap:14, padding:"14px 16px", borderRadius:12,
                  background: notif.lu ? "#fff" : `${accentColor}06`,
                  border: `1.5px solid ${notif.lu ? "#e5e7eb" : accentColor+"30"}`,
                  cursor: "pointer",
                  transition:"all .15s", position:"relative" }}>

                {!notif.lu && (
                  <div style={{ position:"absolute", top:14, right:14, width:8, height:8,
                    borderRadius:"50%", background:accentColor }} />
                )}

                <div style={{ width:42, height:42, borderRadius:12, background:cfg.bg,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:20, flexShrink:0 }}>
                  {cfg.icon}
                </div>

                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:3 }}>
                    <div style={{ fontWeight: notif.lu ? 500 : 700, fontSize:14, color:"#0f172a", lineHeight:1.3 }}>
                      {notif.titre || notif.title || "Notification"}
                    </div>
                    <span style={{ fontSize:11, color:"#9ca3af", whiteSpace:"nowrap", flexShrink:0 }}>
                      {fmtDate(notif.createdAt)}
                    </span>
                  </div>
                  <p style={{ margin:0, fontSize:13, color: notif.lu ? "#6b7280" : "#374151", lineHeight:1.5 }}>
                    {notif.message || notif.body || ""}
                  </p>
                  <div style={{ display:"flex", gap:8, marginTop:6, alignItems:"center" }}>
                    <span style={{ padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:600,
                      background:cfg.bg, color:cfg.color }}>
                      {cfg.icon} {cfg.label}
                    </span>
                    {!notif.lu && (
                      <span style={{ fontSize:11, color:accentColor, fontWeight:600 }}>● Non lue</span>
                    )}
                    <span style={{ marginLeft:"auto", fontSize:11, color:"#94a3b8", fontWeight:500 }}>Voir →</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:6, marginTop:20 }}>
          <button onClick={() => setPage(1)} disabled={pageClamped === 1}
            style={{ padding:"6px 10px", borderRadius:8, border:"1px solid #e2e8f0", background: pageClamped===1 ? "#f8fafc" : "#fff",
              color: pageClamped===1 ? "#cbd5e1" : "#374151", cursor: pageClamped===1 ? "not-allowed" : "pointer", fontSize:12, fontWeight:600 }}>
            «
          </button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pageClamped === 1}
            style={{ padding:"6px 12px", borderRadius:8, border:"1px solid #e2e8f0", background: pageClamped===1 ? "#f8fafc" : "#fff",
              color: pageClamped===1 ? "#cbd5e1" : "#374151", cursor: pageClamped===1 ? "not-allowed" : "pointer", fontSize:12, fontWeight:600 }}>
            ‹ Précédent
          </button>

          {/* Numéros de page */}
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(n => n === 1 || n === totalPages || Math.abs(n - pageClamped) <= 2)
            .reduce((acc, n, i, arr) => {
              if (i > 0 && n - arr[i - 1] > 1) acc.push("…");
              acc.push(n);
              return acc;
            }, [])
            .map((n, i) => n === "…" ? (
              <span key={`ellipsis-${i}`} style={{ fontSize:12, color:"#94a3b8", padding:"0 4px" }}>…</span>
            ) : (
              <button key={n} onClick={() => setPage(n)}
                style={{ width:34, height:34, borderRadius:8, border:`1.5px solid ${pageClamped===n ? accentColor : "#e2e8f0"}`,
                  background: pageClamped===n ? accentColor : "#fff",
                  color: pageClamped===n ? "#fff" : "#374151",
                  cursor:"pointer", fontSize:12, fontWeight: pageClamped===n ? 800 : 500 }}>
                {n}
              </button>
            ))
          }

          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={pageClamped === totalPages}
            style={{ padding:"6px 12px", borderRadius:8, border:"1px solid #e2e8f0", background: pageClamped===totalPages ? "#f8fafc" : "#fff",
              color: pageClamped===totalPages ? "#cbd5e1" : "#374151", cursor: pageClamped===totalPages ? "not-allowed" : "pointer", fontSize:12, fontWeight:600 }}>
            Suivant ›
          </button>
          <button onClick={() => setPage(totalPages)} disabled={pageClamped === totalPages}
            style={{ padding:"6px 10px", borderRadius:8, border:"1px solid #e2e8f0", background: pageClamped===totalPages ? "#f8fafc" : "#fff",
              color: pageClamped===totalPages ? "#cbd5e1" : "#374151", cursor: pageClamped===totalPages ? "not-allowed" : "pointer", fontSize:12, fontWeight:600 }}>
            »
          </button>
        </div>
      )}

      {notifications.length > 0 && (
        <p style={{ textAlign:"center", fontSize:11, color:"#cbd5e1", marginTop:16 }}>
          Les notifications sont conservées 30 jours · Cliquer sur une notification pour voir les détails
        </p>
      )}

      {selected && (
        <NotifDetailModal notif={selected} accentColor={accentColor} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
