import React from "react";

/* ══════════════════════════════════════════════════════════════════════════════
   PLANNING D'UNE CLASSE - emploi du temps hebdomadaire + séances à venir/passées

   POURQUOI CE FICHIER EXISTE
   Le tableau de bord Superviseur ouvrait DEUX modals de classe différents : celui
   de l'onglet Plannings, qui montrait les jours, les heures et le lien de la salle,
   et celui du Cahier coachs (coach → Classes → une classe), qui n'affichait que
   huit champs figés. Le même objet métier, deux écrans, deux niveaux d'information.

   BET demande que superviseurs globaux ET deputies voient à l'avance les jours, les
   heures et les liens d'une classe. Copier le bloc dans le second modal aurait créé
   une troisième copie à maintenir : à la première correction, les deux affichages
   divergeaient. D'où ce composant, seul endroit où ce planning est dessiné.
══════════════════════════════════════════════════════════════════════════════ */

/* Une séance close n'a plus de salle à rejoindre. Le découpage à venir/passé ne peut
   pas se faire sur la seule date : quatre séances clôturées par le coach mais
   programmées la semaine prochaine étaient annoncées « À venir ». */
export const SESSION_CLOSE = (statut) => ["realisee", "terminee", "annulee"].includes(statut);
export const RAISON_CLOSE  = (statut) => statut === "annulee"
  ? "Séance annulée - aucune salle à rejoindre"
  : "Séance terminée - la salle est fermée";

const JOURS_ORDER = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const parseHM  = (h) => { const [hh,mm] = (h||"").split(":").map(Number); return hh*60+(mm||0); };
const fmtJour  = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day:"2-digit", month:"short", year:"numeric" }) : "-";
const statutCol = (st) => st==="realisee"||st==="terminee" ? { c:"#16a34a", bg:"#dcfce7" }
                        : st==="annulee"                   ? { c:"#dc2626", bg:"#fee2e2" }
                        :                                    { c:"#d97706", bg:"#fef9c3" };

export default function PlanningClasse({ horaire, sessions = [], loading = false, accent = "#b45309" }) {
  const accentLight = accent + "18";
  const creneaux = Array.isArray(horaire) ? horaire : [];

  const now = Date.now();
  const triees = [...sessions].sort((a,b) => (a.date_seance||"").localeCompare(b.date_seance||""));
  const encoreAVenir = (x) =>
    !SESSION_CLOSE(x.statut) &&
    x.date_seance && new Date(`${x.date_seance}T${x.heure_debut||"00:00"}`).getTime() >= now;
  const aVenir  = triees.filter(encoreAVenir);
  const passees = triees.filter(s => s.date_seance && !encoreAVenir(s)).reverse();

  return (
    <div>
      {/* ── Emploi du temps hebdomadaire (récurrent) ── */}
      <div style={{ marginBottom:22 }}>
        <div style={{ fontSize:13, fontWeight:800, color:"#0f172a", marginBottom:10 }}>🗓️ Emploi du temps hebdomadaire</div>
        {creneaux.length === 0 ? (
          <div style={{ textAlign:"center", padding:20, color:"#94a3b8", background:"#f8fafc", borderRadius:10, border:"1px dashed #e2e8f0", fontSize:12 }}>
            Aucun créneau récurrent renseigné pour cette classe.
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:10 }}>
            {JOURS_ORDER.filter(j => creneaux.some(h => h.jour === j)).map(jour => (
              <div key={jour} style={{ background:accentLight, borderRadius:10, padding:"10px 12px", border:`1px solid ${accent}30` }}>
                <div style={{ fontSize:12, fontWeight:800, color:accent, marginBottom:6 }}>{jour}</div>
                {creneaux.filter(h => h.jour === jour).sort((a,b)=>parseHM(a.debut)-parseHM(b.debut)).map((h,i) => (
                  <div key={i} style={{ fontSize:12, color:"#374151" }}>{h.debut} – {h.fin}</div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Séances programmées / réalisées ── */}
      <div>
        <div style={{ fontSize:13, fontWeight:800, color:"#0f172a", marginBottom:10 }}>📋 Séances ({sessions.length})</div>
        {loading ? (
          <div style={{ textAlign:"center", padding:30, color:"#94a3b8" }}>Chargement des séances…</div>
        ) : sessions.length === 0 ? (
          <div style={{ textAlign:"center", padding:20, color:"#94a3b8", background:"#f8fafc", borderRadius:10, border:"1px dashed #e2e8f0", fontSize:12 }}>
            Aucune séance programmée pour cette classe.
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {aVenir.length > 0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:"#64748b", marginBottom:6, textTransform:"uppercase" }}>À venir ({aVenir.length})</div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {aVenir.map(s => { const sc = statutCol(s.statut); const estLien = s.lieu && /^https?:\/\//.test(s.lieu); return (
                    <div key={s.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:"#fff", border:"1px solid #e2e8f0", borderRadius:9, flexWrap:"wrap" }}>
                      <span style={{ fontSize:12, fontWeight:700, color:"#0f172a", minWidth:90 }}>{s.date_seance ? fmtJour(s.date_seance) : "-"}</span>
                      <span style={{ fontSize:12, color:"#64748b" }}>{s.heure_debut||"-"} · {s.duree_h ? `${s.duree_h}h` : "-"}</span>
                      {estLien && !SESSION_CLOSE(s.statut) ? (
                        <a href={s.lieu} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:"#1d4ed8", fontWeight:700, textDecoration:"none" }}>🎥 Rejoindre</a>
                      ) : estLien ? (
                        <span title={RAISON_CLOSE(s.statut)} style={{ fontSize:11, color:"#cbd5e1", fontWeight:700, cursor:"not-allowed" }}>🎥 Rejoindre</span>
                      ) : s.lieu && <span style={{ fontSize:11, color:"#94a3b8" }}>· {s.lieu}</span>}
                      <span style={{ marginLeft:"auto", background:sc.bg, color:sc.c, borderRadius:99, padding:"2px 9px", fontSize:10, fontWeight:700 }}>{s.statut||"planifiée"}</span>
                    </div>
                  );})}
                </div>
              </div>
            )}
            {passees.length > 0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:"#64748b", marginBottom:6, textTransform:"uppercase" }}>Passées ({passees.length})</div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {passees.map(s => { const sc = statutCol(s.statut); const estLien = s.lieu && /^https?:\/\//.test(s.lieu); const estRealisee = s.statut==="realisee"||s.statut==="terminee"; return (
                    <div key={s.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:"#fafafa", border:"1px solid #f1f5f9", borderRadius:9, flexWrap:"wrap" }}>
                      <span style={{ fontSize:12, fontWeight:700, color:"#374151", minWidth:90 }}>{s.date_seance ? fmtJour(s.date_seance) : "-"}</span>
                      <span style={{ fontSize:12, color:"#94a3b8" }}>{s.heure_debut||"-"} · {s.duree_h ? `${s.duree_h}h` : "-"}</span>
                      {estLien ? (
                        <a href={s.lieu} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:"#1d4ed8", fontWeight:700, textDecoration:"none" }}>🎥 Lien</a>
                      ) : s.lieu && <span style={{ fontSize:11, color:"#94a3b8" }}>· {s.lieu}</span>}
                      {estRealisee && s.nb_presences_total != null && (
                        <span style={{ fontSize:10, fontWeight:700, color: s.nb_presents>0 ? "#16a34a" : "#dc2626", background: s.nb_presents>0 ? "#dcfce7" : "#fee2e2", borderRadius:99, padding:"2px 9px" }}>
                          👥 {s.nb_presents}/{s.nb_presences_total} présent{s.nb_presents>1?"s":""}
                        </span>
                      )}
                      {estRealisee && s.nb_presences_total == null && (
                        <span style={{ fontSize:10, fontWeight:700, color:"#d97706", background:"#fef9c3", borderRadius:99, padding:"2px 9px" }}>⚠️ Présences non renseignées</span>
                      )}
                      <span style={{ marginLeft:"auto", background:sc.bg, color:sc.c, borderRadius:99, padding:"2px 9px", fontSize:10, fontWeight:700 }}>{s.statut||"-"}</span>
                    </div>
                  );})}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
