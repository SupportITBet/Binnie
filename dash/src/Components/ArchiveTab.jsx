// dash/src/Components/ArchiveTab.jsx
import React, { useState, useEffect, useMemo } from "react";
import toast from "react-hot-toast";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

export const MOTIFS_PAUSE = [
  { key: "financier",     label: "💰 Financier",     desc: "Difficultés financières temporaires", color: "#d97706", bg: "#fef3c7" },
  { key: "personnel",     label: "👤 Personnel",      desc: "Raisons personnelles ou familiales",  color: "#7c3aed", bg: "#f3e8ff" },
  { key: "professionnel", label: "💼 Professionnel",  desc: "Changement de poste, déplacement, surcharge", color: "#0891b2", bg: "#e0f2fe" },
  { key: "medical",       label: "🏥 Médical",        desc: "Problème de santé",                   color: "#dc2626", bg: "#fee2e2" },
  { key: "demenagement",  label: "🏠 Déménagement",   desc: "Changement de lieu de résidence",     color: "#16a34a", bg: "#dcfce7" },
  { key: "autre",         label: "❓ Autre",          desc: "Autre motif",                         color: "#6b7280", bg: "#f1f5f9" },
];

const DUREES = ["1 mois", "2 mois", "3 mois", "6 mois", "Indéterminée"];

function moisEcoules(dateStr) {
  if (!dateStr) return 0;
  return (Date.now() - new Date(dateStr)) / (1000 * 60 * 60 * 24 * 30);
}

function Badge({ label, color, bg }) {
  return (
    <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:99, fontSize:10, fontWeight:700, color, background:bg, whiteSpace:"nowrap" }}>{label}</span>
  );
}

/* ─── Modal archiver (exporté pour usage dans d'autres composants) ─── */
export function ArchiveModal({ apprenant, onClose, onDone, accentColor = "#7c3aed" }) {
  const token = localStorage.getItem("admin_token") || localStorage.getItem("token");
  const [form, setForm] = useState({ type_archive:"en_pause", motif:"", detail_motif:"", duree_estimee:"", date_reprise:"" });
  const [saving, setSaving] = useState(false);

  const nomComplet = `${apprenant.prenom_apprenant || ""} ${apprenant.nom_apprenant || ""}`.trim();

  const handleSubmit = async () => {
    if (!form.motif) { toast.error("Veuillez choisir un motif"); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/groupes/apprenants/${apprenant.id}/archiver`, {
        method: "PATCH",
        headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success(d.message);
      onDone?.();
      onClose();
    } catch(e) { toast.error(e.message || "Erreur"); }
    finally { setSaving(false); }
  };

  const C = accentColor;
  const inp = { padding:"9px 11px", borderRadius:8, border:"1px solid #d1d5db", fontSize:13, width:"100%", boxSizing:"border-box" };
  const lbl = { display:"block", fontSize:12, fontWeight:600, color:"#374151", marginBottom:6 };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.6)", zIndex:1100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:16, width:520, maxWidth:"95vw", maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"18px 24px", borderBottom:"1px solid #e5e7eb" }}>
          <h3 style={{ margin:0, fontSize:15, fontWeight:800, color:"#0f172a" }}>📦 Archiver - {nomComplet}</h3>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#6b7280" }}>✕</button>
        </div>
        <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>

          {/* Type */}
          <div>
            <label style={lbl}>Type d'arrêt</label>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {[
                { val:"en_pause", label:"⏸️ Pause temporaire", desc:"L'apprenant prévoit de reprendre" },
                { val:"archive",  label:"📦 Archivage",         desc:"Arrêt indéterminé / longue durée" },
              ].map(opt => (
                <label key={opt.val} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:12, borderRadius:10, border:`2px solid ${form.type_archive===opt.val?C:"#e2e8f0"}`, cursor:"pointer", background:form.type_archive===opt.val?`${C}08`:"#fff" }}>
                  <input type="radio" checked={form.type_archive===opt.val} onChange={()=>setForm(f=>({...f,type_archive:opt.val}))} style={{ marginTop:2 }} />
                  <div>
                    <div style={{ fontWeight:700, fontSize:12, color:"#0f172a" }}>{opt.label}</div>
                    <div style={{ fontSize:11, color:"#6b7280", marginTop:2 }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Motif */}
          <div>
            <label style={lbl}>Motif <span style={{ color:"#ef4444" }}>*</span></label>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
              {MOTIFS_PAUSE.map(m => (
                <label key={m.key} style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 10px", borderRadius:8, border:`2px solid ${form.motif===m.key?m.color:"#e2e8f0"}`, cursor:"pointer", background:form.motif===m.key?m.bg:"#fff", fontSize:12, fontWeight:600, color:form.motif===m.key?m.color:"#374151" }}>
                  <input type="radio" checked={form.motif===m.key} onChange={()=>setForm(f=>({...f,motif:m.key}))} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          {/* Détail */}
          <div>
            <label style={lbl}>Détail (optionnel)</label>
            <textarea value={form.detail_motif} onChange={e=>setForm(f=>({...f,detail_motif:e.target.value}))}
              placeholder="Précisions sur la situation..." rows={2}
              style={{ ...inp, resize:"vertical" }} />
          </div>

          {form.type_archive === "en_pause" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div>
                <label style={lbl}>Durée estimée</label>
                <select value={form.duree_estimee} onChange={e=>setForm(f=>({...f,duree_estimee:e.target.value}))} style={inp}>
                  <option value="">- Non précisée</option>
                  {DUREES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Date de reprise prévue</label>
                <input type="date" value={form.date_reprise} onChange={e=>setForm(f=>({...f,date_reprise:e.target.value}))} style={inp} />
              </div>
            </div>
          )}

          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", paddingTop:4 }}>
            <button onClick={onClose} style={{ padding:"9px 18px", background:"#f1f5f9", color:"#374151", border:"1px solid #e2e8f0", borderRadius:8, cursor:"pointer", fontWeight:600, fontSize:12 }}>Annuler</button>
            <button onClick={handleSubmit} disabled={saving} style={{ padding:"9px 18px", background:C, color:"#fff", border:"none", borderRadius:8, cursor:saving?"not-allowed":"pointer", fontWeight:700, fontSize:12, opacity:saving?0.7:1 }}>
              {saving ? "Enregistrement..." : "✅ Confirmer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Onglet principal Archive ─── */
export default function ArchiveTab({ accentColor = "#7c3aed" }) {
  const token = localStorage.getItem("admin_token") || localStorage.getItem("token");
  const C = accentColor;

  const [archives,      setArchives]      = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [filtreStatut,  setFiltreStatut]  = useState("tous");
  const [filtreMotif,   setFiltreMotif]   = useState("tous");
  const [search,        setSearch]        = useState("");

  // Modal réactivation
  const [reactiverModal,  setReactiverModal]  = useState(null);
  const [groupesDispos,   setGroupesDispos]   = useState([]);
  const [loadingGroupes,  setLoadingGroupes]  = useState(false);
  const [selectedGroupe,  setSelectedGroupe]  = useState("");
  const [reactivating,    setReactivating]    = useState(false);

  const fetchArchives = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/groupes/archives`, { headers:{ Authorization:`Bearer ${token}` } });
      const d = await r.json();
      setArchives(d.apprenants || []);
    } catch { toast.error("Erreur chargement archives"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchArchives(); }, []);

  useEffect(() => {
    if (!reactiverModal) return;
    setLoadingGroupes(true);
    fetch(`${API_URL}/api/groupes?niveau=${encodeURIComponent(reactiverModal.niveau || "")}&statut=actif`, {
      headers:{ Authorization:`Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : { groupes:[] })
      .then(d => setGroupesDispos(d.groupes || []))
      .catch(() => setGroupesDispos([]))
      .finally(() => setLoadingGroupes(false));
  }, [reactiverModal]);

  const handleReactiver = async () => {
    setReactivating(true);
    try {
      const r = await fetch(`${API_URL}/api/groupes/apprenants/${reactiverModal.id}/reactiver`, {
        method: "PATCH",
        headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({ nouveau_groupe_id: selectedGroupe || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success(d.message);
      setReactiverModal(null);
      setSelectedGroupe("");
      fetchArchives();
    } catch(e) { toast.error(e.message || "Erreur réactivation"); }
    finally { setReactivating(false); }
  };

  const stats = useMemo(() => MOTIFS_PAUSE.map(m => ({
    ...m, count: archives.filter(a => a.motif_pause === m.key).length,
  })), [archives]);

  const nPause   = archives.filter(a => a.statut === "en_pause").length;
  const nArchive = archives.filter(a => a.statut === "archive").length;

  const filtered = useMemo(() => archives.filter(a => {
    if (filtreStatut !== "tous" && a.statut !== filtreStatut) return false;
    if (filtreMotif  !== "tous" && a.motif_pause !== filtreMotif) return false;
    if (search) {
      const s = search.toLowerCase();
      const nom = `${a.prenom_apprenant||""} ${a.nom_apprenant||""}`.toLowerCase();
      if (!nom.includes(s) && !(a.email_apprenant||"").toLowerCase().includes(s)) return false;
    }
    return true;
  }), [archives, filtreStatut, filtreMotif, search]);

  const inp = { padding:"8px 12px", borderRadius:8, border:"1px solid #e2e8f0", fontSize:13, background:"#fff" };

  return (
    <div style={{ padding:"24px 28px" }}>

      {/* KPI stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:12, marginBottom:24 }}>
        <div style={{ background:"#fff", borderRadius:12, padding:"14px 16px", border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize:10, color:"#9ca3af", marginBottom:2 }}>⏸️ En pause</div>
          <div style={{ fontSize:26, fontWeight:900, color:"#f59e0b" }}>{nPause}</div>
        </div>
        <div style={{ background:"#fff", borderRadius:12, padding:"14px 16px", border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize:10, color:"#9ca3af", marginBottom:2 }}>📦 Archivés</div>
          <div style={{ fontSize:26, fontWeight:900, color:"#6b7280" }}>{nArchive}</div>
        </div>
        {stats.filter(s => s.count > 0).map(s => (
          <div key={s.key} style={{ background:s.bg, borderRadius:12, padding:"14px 16px", border:`1px solid ${s.color}33` }}>
            <div style={{ fontSize:10, color:s.color, fontWeight:700, marginBottom:2 }}>{s.label}</div>
            <div style={{ fontSize:26, fontWeight:900, color:s.color }}>{s.count}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Rechercher un apprenant..." style={{ ...inp, flex:1, minWidth:200 }} />
        <select value={filtreStatut} onChange={e=>setFiltreStatut(e.target.value)} style={inp}>
          <option value="tous">Tous</option>
          <option value="en_pause">⏸️ En pause</option>
          <option value="archive">📦 Archivés</option>
        </select>
        <select value={filtreMotif} onChange={e=>setFiltreMotif(e.target.value)} style={inp}>
          <option value="tous">Tous motifs</option>
          {MOTIFS_PAUSE.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <button onClick={fetchArchives} style={{ padding:"8px 14px", background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:600, color:"#374151" }}>
          🔄 Actualiser
        </button>
      </div>

      {/* Liste */}
      {loading ? (
        <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>Chargement...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:"center", padding:48, color:"#9ca3af", fontSize:13 }}>
          <div style={{ fontSize:36, marginBottom:10 }}>📦</div>
          Aucun apprenant archivé ou en pause
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {filtered.map(a => {
            const motifCfg  = MOTIFS_PAUSE.find(m => m.key === a.motif_pause) || { label:"-", color:"#6b7280", bg:"#f1f5f9" };
            const nomComplet = `${a.prenom_apprenant||""} ${a.nom_apprenant||""}`.trim();
            const obsolete   = moisEcoules(a.date_pause) > 3;
            const isPause    = a.statut === "en_pause";
            const datePause  = a.date_pause ? new Date(a.date_pause).toLocaleDateString("fr-FR") : "-";

            return (
              <div key={a.id} style={{ background:"#fff", borderRadius:12, border:`1.5px solid ${obsolete?"#fca5a5":"#e5e7eb"}`, overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,0.04)" }}>
                <div style={{ height:3, background: isPause ? "linear-gradient(90deg,#f59e0b,#fcd34d)" : "#e5e7eb" }} />
                <div style={{ padding:"14px 16px", display:"flex", alignItems:"flex-start", gap:14, flexWrap:"wrap" }}>
                  {/* Avatar initiales */}
                  <div style={{ width:42, height:42, borderRadius:"50%", background:`${C}18`, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:15, color:C, flexShrink:0 }}>
                    {(nomComplet[0] || "?").toUpperCase()}
                  </div>
                  {/* Infos */}
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                      <span style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>{nomComplet}</span>
                      <Badge label={isPause ? "⏸️ En pause" : "📦 Archivé"} color={isPause?"#d97706":"#6b7280"} bg={isPause?"#fef3c7":"#f1f5f9"} />
                      {obsolete && <Badge label="⚠️ +3 mois · Éval. conseillée" color="#dc2626" bg="#fee2e2" />}
                    </div>
                    <div style={{ fontSize:12, color:"#6b7280", marginBottom:6 }}>
                      {a.email_apprenant} · <strong>Niv. {a.niveau||"-"}</strong> · Groupe: {a.groupes?.nom || "-"}
                    </div>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                      <Badge label={motifCfg.label} color={motifCfg.color} bg={motifCfg.bg} />
                      {a.duree_pause_estimee && <span style={{ fontSize:11, color:"#9ca3af" }}>Durée: {a.duree_pause_estimee}</span>}
                      <span style={{ fontSize:11, color:"#9ca3af" }}>Depuis: {datePause}</span>
                      {a.date_reprise_prevue && (
                        <span style={{ fontSize:11, color:"#16a34a", fontWeight:600 }}>
                          Reprise prévue: {new Date(a.date_reprise_prevue).toLocaleDateString("fr-FR")}
                        </span>
                      )}
                    </div>
                    {a.detail_motif && (
                      <div style={{ fontSize:11, color:"#6b7280", marginTop:6, fontStyle:"italic" }}>"{a.detail_motif}"</div>
                    )}
                  </div>
                  {/* Bouton réactiver */}
                  <button onClick={() => { setReactiverModal(a); setSelectedGroupe(""); }}
                    style={{ padding:"8px 16px", background:C, color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12, flexShrink:0, alignSelf:"center" }}>
                    ▶️ Réactiver
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Modal Réactivation ─── */}
      {reactiverModal && (() => {
        const nomComplet  = `${reactiverModal.prenom_apprenant||""} ${reactiverModal.nom_apprenant||""}`.trim();
        const obsolete    = moisEcoules(reactiverModal.date_pause) > 3;
        const disponibles = groupesDispos.filter(g => (g.nb_apprenants||0) < (g.capacite_max||20));

        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.6)", zIndex:1100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
            <div style={{ background:"#fff", borderRadius:16, width:620, maxWidth:"95vw", maxHeight:"92vh", overflowY:"auto", boxShadow:"0 24px 60px rgba(0,0,0,0.25)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"18px 24px", borderBottom:"1px solid #e5e7eb" }}>
                <h3 style={{ margin:0, fontSize:15, fontWeight:800 }}>▶️ Réactiver - {nomComplet}</h3>
                <button onClick={()=>setReactiverModal(null)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#6b7280" }}>✕</button>
              </div>
              <div style={{ padding:"20px 24px" }}>

                {/* Récap profil */}
                <div style={{ background:"#f8fafc", borderRadius:10, padding:16, marginBottom:16 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:10 }}>📋 Profil apprenant</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:12, color:"#6b7280" }}>
                    <div>Email: <strong style={{ color:"#0f172a" }}>{reactiverModal.email_apprenant||"-"}</strong></div>
                    <div>Niveau: <strong style={{ color:C }}>{reactiverModal.niveau||"-"}</strong></div>
                    <div>Ancien groupe: <strong style={{ color:"#0f172a" }}>{reactiverModal.groupes?.nom||"-"}</strong></div>
                    <div>Mis en pause le: <strong>{reactiverModal.date_pause ? new Date(reactiverModal.date_pause).toLocaleDateString("fr-FR") : "-"}</strong></div>
                    <div>Motif: <strong>{MOTIFS_PAUSE.find(m=>m.key===reactiverModal.motif_pause)?.label||"-"}</strong></div>
                    {reactiverModal.detail_motif && <div style={{ gridColumn:"1/-1" }}>Détail: <em>"{reactiverModal.detail_motif}"</em></div>}
                  </div>
                </div>

                {/* Alerte si > 3 mois */}
                {obsolete && (
                  <div style={{ background:"#fef3c7", border:"1px solid #fcd34d", borderRadius:8, padding:12, marginBottom:16, fontSize:12, color:"#92400e", display:"flex", gap:8 }}>
                    <span style={{ fontSize:16 }}>⚠️</span>
                    <div>
                      <strong>Pause de plus de 3 mois</strong> - Le niveau de l'apprenant a peut-être évolué.
                      Il est conseillé de faire passer un <strong>test de niveau</strong> avant le replacement en classe.
                    </div>
                  </div>
                )}

                {/* Sélection groupe */}
                <div style={{ marginBottom:20 }}>
                  <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#374151", marginBottom:10 }}>
                    Choisir un groupe (niveau <strong style={{ color:C }}>{reactiverModal.niveau||"-"}</strong>)
                  </label>
                  {loadingGroupes ? (
                    <div style={{ fontSize:12, color:"#9ca3af", padding:10 }}>Chargement des groupes disponibles...</div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {/* Option même groupe */}
                      <label style={{ display:"flex", alignItems:"center", gap:10, padding:12, borderRadius:8, border:`2px solid ${selectedGroupe===""?C:"#e2e8f0"}`, cursor:"pointer", background:selectedGroupe===""?`${C}08`:"#fff" }}>
                        <input type="radio" checked={selectedGroupe===""} onChange={()=>setSelectedGroupe("")} />
                        <div>
                          <div style={{ fontWeight:700, fontSize:12 }}>🔄 Même groupe - {reactiverModal.groupes?.nom||"-"}</div>
                          <div style={{ fontSize:11, color:"#9ca3af" }}>Réintégration directe sans changement de groupe</div>
                        </div>
                      </label>

                      {disponibles.length === 0 ? (
                        <div style={{ background:"#fef3c7", border:"1px solid #fcd34d", borderRadius:8, padding:10, fontSize:12, color:"#d97706" }}>
                          Aucun autre groupe disponible au niveau {reactiverModal.niveau||"-"}
                        </div>
                      ) : disponibles.map(g => (
                        <label key={g.id} style={{ display:"flex", alignItems:"center", gap:10, padding:12, borderRadius:8, border:`2px solid ${g.id===selectedGroupe?C:"#e2e8f0"}`, cursor:"pointer", background:g.id===selectedGroupe?`${C}08`:"#fff" }}>
                          <input type="radio" checked={g.id===selectedGroupe} onChange={()=>setSelectedGroupe(g.id)} />
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:700, fontSize:12 }}>{g.nom}</div>
                            <div style={{ fontSize:11, color:"#9ca3af" }}>
                              {g.niveau} · {g.type_cours} · {g.nb_apprenants||0}/{g.capacite_max||20} apprenants
                            </div>
                          </div>
                          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:99, background:"#dcfce7", color:"#16a34a", fontWeight:700, flexShrink:0 }}>
                            {(g.capacite_max||20)-(g.nb_apprenants||0)} place(s)
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                  <button onClick={()=>setReactiverModal(null)} style={{ padding:"9px 18px", background:"#f1f5f9", color:"#374151", border:"1px solid #e2e8f0", borderRadius:8, cursor:"pointer", fontWeight:600, fontSize:12 }}>
                    Annuler
                  </button>
                  <button onClick={handleReactiver} disabled={reactivating} style={{ padding:"9px 18px", background:C, color:"#fff", border:"none", borderRadius:8, cursor:reactivating?"not-allowed":"pointer", fontWeight:700, fontSize:12, opacity:reactivating?0.7:1 }}>
                    {reactivating ? "Réactivation..." : "✅ Confirmer la réactivation"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
