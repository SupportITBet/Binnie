import React, { useState, useEffect, useCallback } from "react";

/**
 * Évaluations mensuelles des parents sur la qualité de l'accompagnement.
 *
 * Écrit à l'origine dans le dashboard du conseiller pédagogique de dash, puis partagé avec
 * son superviseur : ce sont les mêmes coachs, jugés sur les mêmes critères.
 *
 * ── POURQUOI UNE COPIE ICI, ET PAS UN IMPORT ──
 * bet-elearning et dash sont deux applications séparées, sans module commun : l'import
 * n'existe pas. Le fichier est donc repris tel quel, à l'identique, pour que la prochaine
 * correction se recopie sans avoir à réapprendre l'écran. La seule différence est l'en-tête
 * `X-Plateforme` posé par l'appelant — `avis_parents_coach` est commune aux deux mondes et
 * le serveur ne rend que les avis de la plateforme qui demande.
 *
 * Le composant charge et filtre lui-même : les dashboards n'ont qu'à le monter, sans
 * dupliquer cinq états et un effet chacun.
 */
export default function EvaluationsParents({
  apiUrl, authHeaders,
  accent = "#7c3aed", accentLight = "#f5f3ff",
  accentGradient = "linear-gradient(135deg,#7c3aed,#4c1d95)",
}) {
  const [evaluations, setEvaluations] = useState([]);
  const [chargement, setChargement]   = useState(false);
  const [filtreCoach, setFiltreCoach] = useState("tous");
  const [moisDebut, setMoisDebut]     = useState("");
  const [moisFin, setMoisFin]         = useState("");
  const [pageParCoach, setPageParCoach] = useState({});
  // Le detail d'une evaluation : un modal, integre ici plutot que laisse dans le PA -
  // sans lui, le superviseur aurait la liste sans pouvoir ouvrir une seule evaluation.
  const [detail, setDetail] = useState(null);
  const PA_EVAL_PAGE_SIZE = 8;

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const r = await fetch(`${apiUrl}/api/analytics/evaluations-coach`, { headers: authHeaders() });
      const d = r.ok ? await r.json() : { evaluations: [] };
      setEvaluations(d.evaluations || []);
    } catch { setEvaluations([]); }
    finally { setChargement(false); }
  }, [apiUrl, authHeaders]);

  useEffect(() => { charger(); }, [charger]);

  const contenu = (() => {
  const CRITERES = [
    { id:"q1", lbl:"Clarté",       icone:"💡" },
    { id:"q2", lbl:"Disponibilité", icone:"📞" },
    { id:"q3", lbl:"Adaptation",    icone:"🎯" },
    { id:"q4", lbl:"Dynamisme",     icone:"⚡" },
    { id:"q5", lbl:"Progression",   icone:"📈" },
  ];

  const coaches = ["tous", ...new Set(evaluations.map(e => e.coach_nom).filter(Boolean))];
  const filtered = evaluations
    .filter(e => filtreCoach === "tous" || e.coach_nom === filtreCoach)
    .filter(e => !moisDebut || e.mois >= moisDebut)
    .filter(e => !moisFin   || e.mois <= moisFin);

  const moyGlobale = filtered.length > 0
    ? (filtered.reduce((s, e) => s + (e.q1+e.q2+e.q3+e.q4+e.q5)/5, 0) / filtered.length).toFixed(1)
    : null;

  // Agréger par coach
  const parCoach = {};
  filtered.forEach(e => {
    const nom = e.coach_nom || "Coach inconnu";
    if (!parCoach[nom]) parCoach[nom] = { evals: [], totals: { q1:0,q2:0,q3:0,q4:0,q5:0 } };
    parCoach[nom].evals.push(e);
    CRITERES.forEach(c => { parCoach[nom].totals[c.id] += e[c.id] || 0; });
  });

  return (
    <div style={{ padding:"24px 0" }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ margin:"0 0 4px", fontSize:17, fontWeight:800, color:"#0f172a" }}>⭐ Évaluations reçues des parents</h2>
          <p style={{ margin:0, fontSize:12, color:"#6b7280" }}>Satisfaction mensuelle des parents sur la qualité du coaching</p>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <label style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:"#64748b" }}>
            Du
            <input type="month" value={moisDebut} onChange={e=>{ setMoisDebut(e.target.value); setPageParCoach({}); }}
              style={{ padding:"7px 10px", borderRadius:8, border:"1.5px solid #e5e7eb", fontSize:12, fontFamily:"inherit" }} />
          </label>
          <label style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:"#64748b" }}>
            Au
            <input type="month" value={moisFin} onChange={e=>{ setMoisFin(e.target.value); setPageParCoach({}); }}
              style={{ padding:"7px 10px", borderRadius:8, border:"1.5px solid #e5e7eb", fontSize:12, fontFamily:"inherit" }} />
          </label>
          {(moisDebut || moisFin) && (
            <button onClick={()=>{ setMoisDebut(""); setMoisFin(""); setPageParCoach({}); }}
              style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #e5e7eb", background:"#f8fafc", fontSize:11, fontWeight:600, color:"#64748b", cursor:"pointer" }}>✕ Effacer</button>
          )}
          {coaches.length > 1 && (
            <select
              value={filtreCoach}
              onChange={e => { setFiltreCoach(e.target.value); setPageParCoach({}); }}
              style={{ padding:"8px 12px", borderRadius:8, border:"1.5px solid #e5e7eb", fontSize:13, fontFamily:"inherit", background:"#fff", cursor:"pointer" }}
            >
              {coaches.map(c => <option key={c} value={c}>{c === "tous" ? "Tous les coachs" : c}</option>)}
            </select>
          )}
        </div>
      </div>

      {chargement ? (
        <div style={{ textAlign:"center", padding:40, color:"#94a3b8" }}>Chargement…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:"center", padding:48, color:"#94a3b8", background:"#f8fafc", borderRadius:12, border:"1px dashed #e2e8f0" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>⭐</div>
          <div style={{ fontWeight:600, color:"#64748b", marginBottom:4 }}>Aucune évaluation reçue</div>
          <div style={{ fontSize:12 }}>Les parents peuvent évaluer le coach depuis leur espace chaque mois.</div>
        </div>
      ) : (
        <>
          {/* KPIs globaux */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:14, marginBottom:28 }}>
            {[
              { val: filtered.length, lbl:"Évaluations reçues", acc:"#7c3aed" },
              { val: moyGlobale ? `${moyGlobale}/5` : "-", lbl:"Moyenne globale", acc:"#F59E0B" },
              { val: Object.keys(parCoach).length, lbl:"Coaches évalués", acc:"#0891b2" },
              { val: new Set(filtered.map(e => e.mois)).size, lbl:"Mois couverts", acc:"#059669" },
            ].map(k => (
              <div key={k.lbl} style={{ background:"#fff", borderRadius:12, padding:"16px 18px", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", border:"1px solid #f1f5f9", borderTop:`3px solid ${k.acc}` }}>
                <div style={{ fontSize:26, fontWeight:800, color:"#0f172a", lineHeight:1, marginBottom:4 }}>{k.val}</div>
                <div style={{ fontSize:12, color:"#6b7280" }}>{k.lbl}</div>
              </div>
            ))}
          </div>

          {/* Résumé par coach */}
          {Object.entries(parCoach).map(([nom, data]) => {
            const nb = data.evals.length;
            const moyCoach = (CRITERES.reduce((s, c) => s + data.totals[c.id], 0) / (nb * 5)).toFixed(1);
            const couleurMoy = moyCoach >= 4 ? "#065F46" : moyCoach >= 3 ? "#92400E" : "#991B1B";
            const bgMoy     = moyCoach >= 4 ? "#D1FAE5" : moyCoach >= 3 ? "#FEF9C3" : "#FEE2E2";
            const totalPages  = Math.max(1, Math.ceil(nb / PA_EVAL_PAGE_SIZE));
            const page        = Math.min(pageParCoach[nom] || 1, totalPages);
            const evalsPage   = data.evals.slice((page-1)*PA_EVAL_PAGE_SIZE, page*PA_EVAL_PAGE_SIZE);
            const setPage     = (p) => setPageParCoach(prev => ({ ...prev, [nom]: p }));
            return (
              <div key={nom} style={{ background:"#fff", borderRadius:14, border:"1px solid #f1f5f9", boxShadow:"0 2px 8px rgba(0,0,0,0.05)", marginBottom:20, overflow:"hidden" }}>
                {/* Coach header */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 20px", borderBottom:"1px solid #f1f5f9", flexWrap:"wrap", gap:10 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:40, height:40, borderRadius:"50%", background:"#7c3aed20", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:15, color:"#7c3aed" }}>
                      {nom.split(" ").map(p => p[0]).join("").slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>{nom}</div>
                      <div style={{ fontSize:11, color:"#94a3b8" }}>{nb} évaluation{nb>1?"s":""} reçue{nb>1?"s":""}</div>
                    </div>
                  </div>
                  <span style={{ padding:"5px 14px", borderRadius:20, background:bgMoy, color:couleurMoy, fontWeight:800, fontSize:16 }}>
                    ⭐ {moyCoach}/5
                  </span>
                </div>

                {/* Moyennes par critère */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:0, borderBottom:"1px solid #f1f5f9" }}>
                  {CRITERES.map((c, i) => {
                    const moy = (data.totals[c.id] / nb).toFixed(1);
                    return (
                      <div key={c.id} style={{ textAlign:"center", padding:"12px 8px", borderRight: i < 4 ? "1px solid #f1f5f9" : "none" }}>
                        <div style={{ fontSize:18, marginBottom:3 }}>{c.icone}</div>
                        <div style={{ fontSize:18, fontWeight:800, color:"#F59E0B" }}>{moy}</div>
                        <div style={{ fontSize:10, color:"#94a3b8", lineHeight:1.3 }}>{c.lbl}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Détail évaluations - tableau cliquable */}
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                    <thead>
                      <tr style={{ background:"#f8fafc" }}>
                        {["Mois","Enfant","Parent","Critères","Note","Commentaire"].map(col => (
                          <th key={col} style={{ padding:"9px 14px", textAlign:"left", fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", borderBottom:"1px solid #E5E7EB", whiteSpace:"nowrap" }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {evalsPage.map((e, i) => {
                        const moyEval = ((e.q1+e.q2+e.q3+e.q4+e.q5)/5).toFixed(1);
                        const moisLib = new Date(e.mois + "-01").toLocaleDateString("fr-FR", { month:"short", year:"numeric" });
                        return (
                          <tr key={i} onClick={()=>setDetail(e)}
                            style={{ borderBottom:"1px solid #f1f5f9", cursor:"pointer", background: i%2===0?"#fff":"#fafafa" }}
                            onMouseEnter={ev=>ev.currentTarget.style.background="#F5F3FF"}
                            onMouseLeave={ev=>ev.currentTarget.style.background=i%2===0?"#fff":"#fafafa"}>
                            <td style={{ padding:"9px 14px", fontWeight:600, color:"#475569", textTransform:"capitalize", whiteSpace:"nowrap" }}>{moisLib}</td>
                            <td style={{ padding:"9px 14px", fontWeight:700, color:"#0f172a", whiteSpace:"nowrap" }}>{e.enfant_nom || "-"}</td>
                            <td style={{ padding:"9px 14px", color:"#64748b", whiteSpace:"nowrap" }}>{e.parent_nom || "-"}</td>
                            <td style={{ padding:"9px 14px" }}>
                              <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                                {CRITERES.map(c => (
                                  <span key={c.id} style={{ fontSize:10, padding:"2px 6px", borderRadius:10, background: e[c.id] >= 4 ? "#D1FAE5" : e[c.id] >= 3 ? "#FEF9C3" : "#FEE2E2", color: e[c.id] >= 4 ? "#065F46" : e[c.id] >= 3 ? "#92400E" : "#991B1B", fontWeight:600, whiteSpace:"nowrap" }}>
                                    {c.icone} {e[c.id]}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td style={{ padding:"9px 14px", fontWeight:700, color:"#F59E0B", whiteSpace:"nowrap" }}>⭐ {moyEval}/5</td>
                            <td style={{ padding:"9px 14px", color:"#64748b", fontStyle: e.commentaire?"italic":"normal", maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {e.commentaire ? `"${e.commentaire}"` : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:10, padding:"10px 20px", borderTop:"1px solid #f1f5f9" }}>
                    <span style={{ fontSize:11, color:"#94a3b8" }}>Page {page} / {totalPages} · {nb} évaluation{nb>1?"s":""}</span>
                    <button onClick={()=>setPage(Math.max(1, page-1))} disabled={page<=1}
                      style={{ padding:"5px 10px", borderRadius:6, border:"1px solid #e2e8f0", background: page<=1?"#f1f5f9":"#fff", color: page<=1?"#cbd5e1":"#374151", fontSize:12, fontWeight:600, cursor: page<=1?"not-allowed":"pointer" }}>‹ Préc.</button>
                    <button onClick={()=>setPage(Math.min(totalPages, page+1))} disabled={page>=totalPages}
                      style={{ padding:"5px 10px", borderRadius:6, border:"1px solid #e2e8f0", background: page>=totalPages?"#f1f5f9":"#fff", color: page>=totalPages?"#cbd5e1":"#374151", fontSize:12, fontWeight:600, cursor: page>=totalPages?"not-allowed":"pointer" }}>Suiv. ›</button>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
  })();

  return (
    <>
      {contenu}
{detail && (() => {
  const e = detail;
  const CRITERES_D = [
    { id:"q1", lbl:"Clarté",       icone:"💡" },
    { id:"q2", lbl:"Disponibilité", icone:"📞" },
    { id:"q3", lbl:"Adaptation",    icone:"🎯" },
    { id:"q4", lbl:"Dynamisme",     icone:"⚡" },
    { id:"q5", lbl:"Progression",   icone:"📈" },
  ];
  const moyEval = ((e.q1+e.q2+e.q3+e.q4+e.q5)/5).toFixed(1);
  const moisLib = new Date(e.mois + "-01").toLocaleDateString("fr-FR", { month:"long", year:"numeric" });
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1500, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
      onClick={ev=>{ if(ev.target===ev.currentTarget) setDetail(null); }}>
      <div style={{ background:"#fff", borderRadius:16, width:"min(700px,90vw)", maxHeight:"90vh", overflowY:"auto", boxShadow:"0 32px 80px rgba(0,0,0,0.3)" }}>
        <div style={{ padding:"18px 24px", background:accentGradient, borderRadius:"16px 16px 0 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontWeight:800, fontSize:15, color:"#fff" }}>⭐ Évaluation - {moisLib}</div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.75)", marginTop:2 }}>Coach : {e.coach_nom || "-"}{e.classe_nom ? ` · ${e.classe_nom}` : ""}</div>
          </div>
          <button onClick={()=>setDetail(null)} style={{ width:30, height:30, borderRadius:"50%", border:"none", background:"rgba(255,255,255,0.25)", color:"#fff", cursor:"pointer", fontSize:16 }}>×</button>
        </div>

        <div style={{ padding:24, display:"flex", flexDirection:"column", gap:20 }}>
          {/* Note globale */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:12, padding:"14px 18px" }}>
            <span style={{ fontSize:13, fontWeight:700, color:"#92400E" }}>Note globale</span>
            <span style={{ fontSize:22, fontWeight:900, color:"#B45309" }}>⭐ {moyEval}/5</span>
          </div>

          {/* Enfant */}
          <div>
            <div style={{ fontSize:12, fontWeight:800, color:"#64748b", textTransform:"uppercase", marginBottom:8 }}>🎓 Enfant (apprenant)</div>
            <div style={{ background:"#F8FAFC", borderRadius:10, border:"1px solid #E5E7EB", padding:"12px 16px", display:"flex", flexDirection:"column", gap:6 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}><span style={{ color:"#64748b" }}>Nom</span><span style={{ fontWeight:700, color:"#0f172a" }}>{e.enfant_nom || "-"}</span></div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}><span style={{ color:"#64748b" }}>Niveau CECR</span><span style={{ fontWeight:700, color:"#0f172a" }}>{e.enfant_niveau || "-"}</span></div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}><span style={{ color:"#64748b" }}>Email</span><span style={{ fontWeight:600, color:"#0f172a" }}>{e.enfant_email || "-"}</span></div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}><span style={{ color:"#64748b" }}>Téléphone</span><span style={{ fontWeight:600, color:"#0f172a" }}>{e.enfant_telephone || "-"}</span></div>
              {e.enfant_naissance && (
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}><span style={{ color:"#64748b" }}>Date de naissance</span><span style={{ fontWeight:600, color:"#0f172a" }}>{new Date(e.enfant_naissance).toLocaleDateString("fr-FR")}</span></div>
              )}
            </div>
          </div>

          {/* Parent */}
          <div>
            <div style={{ fontSize:12, fontWeight:800, color:"#64748b", textTransform:"uppercase", marginBottom:8 }}>👤 Parent</div>
            <div style={{ background:"#F8FAFC", borderRadius:10, border:"1px solid #E5E7EB", padding:"12px 16px", display:"flex", flexDirection:"column", gap:6 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}><span style={{ color:"#64748b" }}>Nom</span><span style={{ fontWeight:700, color:"#0f172a" }}>{e.parent_nom || "-"}</span></div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}><span style={{ color:"#64748b" }}>Email</span><span style={{ fontWeight:600, color:"#0f172a" }}>{e.parent_email || "-"}</span></div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}><span style={{ color:"#64748b" }}>Téléphone</span><span style={{ fontWeight:600, color:"#0f172a" }}>{e.parent_telephone || "-"}</span></div>
            </div>
          </div>

          {/* Critères détaillés */}
          <div>
            <div style={{ fontSize:12, fontWeight:800, color:"#64748b", textTransform:"uppercase", marginBottom:8 }}>📋 Détail des critères</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8 }}>
              {CRITERES_D.map(c => (
                <div key={c.id} style={{ textAlign:"center", background:"#F8FAFC", border:"1px solid #E5E7EB", borderRadius:10, padding:"10px 6px" }}>
                  <div style={{ fontSize:16, marginBottom:3 }}>{c.icone}</div>
                  <div style={{ fontSize:16, fontWeight:800, color:"#F59E0B" }}>{e[c.id]}/5</div>
                  <div style={{ fontSize:9, color:"#94a3b8" }}>{c.lbl}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Commentaire */}
          {e.commentaire && (
            <div style={{ padding:"12px 16px", background:"#eff6ff", borderRadius:10, borderLeft:"3px solid #7c3aed" }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#4f46e5", marginBottom:4 }}>💬 Commentaire du parent</div>
              <div style={{ fontSize:13, color:"#3730a3", fontStyle:"italic" }}>"{e.commentaire}"</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
})()}
    </>
  );
}
