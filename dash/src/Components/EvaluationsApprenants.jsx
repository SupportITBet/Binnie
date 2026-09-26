import React, { useState, useEffect, useCallback } from "react";
import { NIVEAUX_APPRECIATION } from "./AppreciationSeance";
import { exporterClassementCoachs, exporterEvaluationsDetail } from "../utils/exporterClassementCoachs";

/**
 * Ce que les apprenants disent des cours - vu par le superviseur et le conseiller
 * pédagogique. Jamais par le coach.
 *
 * Le classement des coachs repose sur les observations d'un deputy : quelques séances par
 * trimestre, choisies. Celui-ci repose sur ceux qui assistent à toutes les séances. Les
 * deux se lisent côte à côte, d'où un rendu volontairement identique - barre des dernières
 * notes, moyenne dans son cercle, tendance : un superviseur qui sait lire l'un sait lire
 * l'autre sans réapprendre.
 *
 * Partagé entre le superviseur et le PA : la même donnée, lue de la même façon.
 */

const NOTE_COUL = n => !n ? "#9ca3af" : n >= 4.5 ? "#16a34a" : n >= 3.5 ? "#0891b2" : n >= 2.5 ? "#f59e0b" : "#ef4444";
const NOTE_FOND = n => !n ? "#f3f4f6" : n >= 4.5 ? "#dcfce7" : n >= 3.5 ? "#e0f2fe" : n >= 2.5 ? "#fef3c7" : "#fee2e2";
const TEND_ICO  = t => t === "hausse" ? "↗" : t === "baisse" ? "↘" : "→";
const TEND_COUL = t => t === "hausse" ? "#16a34a" : t === "baisse" ? "#ef4444" : "#94a3b8";

const LIB_NIVEAU = Object.fromEntries(NIVEAUX_APPRECIATION.map(n => [n.note, n.titre]));
// La note 1 partage le libellé de la 2 : l'échelle de BET les regroupe sous « 1/2 ».
LIB_NIVEAU[1] = "Insuffisant";

const fmtDate = d => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "-";

const debutPeriode = (p) => {
  const now = new Date();
  if (p === "semaine") {
    const d = new Date(now);
    // Lundi comme premier jour : getDay() renvoie 0 le dimanche, d'où le -6.
    d.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (p === "mois") return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
};

export default function EvaluationsApprenants({ apiUrl, authHeaders, accent = "#7c3aed", accentLight = "#f5f3ff" }) {
  const [appreciations, setAppreciations] = useState([]);
  const [chargement, setChargement] = useState(false);
  const [periode, setPeriode] = useState("mois");
  // La plage explicite prime sur le raccourci de periode : c'est le filtre le plus
  // precis qui gagne, sinon poser des dates n'aurait aucun effet visible.
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const [page, setPage] = useState(1);
  const PAR_PAGE = 8;
  // Un modal, pas un depliage : la liste garde sa place et le detail s'ouvre par-dessus.
  const [coachOuvert, setCoachOuvert] = useState(null);
  // Filtres propres au detail : avec des notes venant de plusieurs classes et de nombreux
  // apprenants, la liste brute devient vite illisible.
  const [detailClasse, setDetailClasse] = useState("toutes");
  const [detailNote, setDetailNote]     = useState("toutes");
  const [detailTri, setDetailTri]       = useState("date");

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const r = await fetch(`${apiUrl}/api/appreciations`, { headers: authHeaders() });
      const d = r.ok ? await r.json() : { appreciations: [] };
      setAppreciations(d.appreciations || []);
    } catch { setAppreciations([]); }
    finally { setChargement(false); }
  }, [apiUrl, authHeaders]);

  useEffect(() => { charger(); }, [charger]);

  const dansPeriode = (du || au)
    ? appreciations.filter(a => {
        const d = (a.created_at || "").slice(0, 10);
        if (du && d && d < du) return false;
        if (au && d && d > au) return false;
        return true;
      })
    : (() => {
        const debut = debutPeriode(periode);
        return debut
          ? appreciations.filter(a => a.created_at && new Date(a.created_at) >= debut)
          : appreciations;
      })();

  // Regroupement par coach. Les notes restent dans l'ordre chronologique : la barre
  // doit se lire de gauche à droite comme une progression.
  const parCoach = {};
  [...dansPeriode].reverse().forEach(a => {
    if (!a.coach_id) return;
    (parCoach[a.coach_id] ??= { coach: a.coach, coach_id: a.coach_id, notes: [], lignes: [] });
    parCoach[a.coach_id].notes.push(Number(a.note));
    parCoach[a.coach_id].lignes.push(a);
  });

  const classement = Object.values(parCoach)
    .map(e => {
      const moyenne = e.notes.reduce((s, n) => s + n, 0) / e.notes.length;
      const tendance = e.notes.length >= 2
        ? (e.notes[e.notes.length - 1] > e.notes[0] ? "hausse"
          : e.notes[e.notes.length - 1] < e.notes[0] ? "baisse" : "stable")
        : "stable";
      return { ...e, moyenne, nb: e.notes.length, tendance };
    })
    .sort((a, b) => b.moyenne - a.moyenne);

  const libPeriode = (du || au)
    ? `du ${du || "…"} au ${au || "…"}`
    : periode === "semaine" ? "cette semaine" : periode === "mois" ? "ce mois" : "toute période";

  const totalPages = Math.max(1, Math.ceil(classement.length / PAR_PAGE));
  // Borner la page : un filtre qui reduit la liste ne doit pas laisser un ecran vide.
  const pageSafe   = Math.min(page, totalPages);
  const pageItems  = classement.slice((pageSafe - 1) * PAR_PAGE, pageSafe * PAR_PAGE);
  const moyGlobale = classement.length
    ? dansPeriode.reduce((s, a) => s + Number(a.note), 0) / dansPeriode.length : null;
  const insatisfaits = dansPeriode.filter(a => Number(a.note) <= 2).length;
  const avecMot = dansPeriode.filter(a => a.commentaire).length;

  const ouvert = coachOuvert ? classement.find(c => c.coach_id === coachOuvert) : null;

  useEffect(() => {
    setDetailClasse("toutes"); setDetailNote("toutes"); setDetailTri("date");
  }, [coachOuvert]);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ margin:0, fontSize:18, fontWeight:800 }}>⭐ Évaluations des apprenants</h2>
          <p style={{ margin:"4px 0 0", fontSize:13, color:"#94a3b8" }}>
            Notes données après chaque cours par les apprenants présents · {libPeriode}
          </p>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {[{ v:"semaine", l:"Cette semaine" }, { v:"mois", l:"Ce mois" }, { v:"tous", l:"Tout" }].map(p => (
            <button key={p.v} onClick={() => { setPeriode(p.v); setDu(""); setAu(""); setPage(1); }}
              style={{ padding:"7px 14px", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer",
                border:`1.5px solid ${periode === p.v ? accent : "#e2e8f0"}`,
                background: periode === p.v ? accentLight : "#fff",
                color: periode === p.v ? accent : "#64748b" }}>
              {p.l}
            </button>
          ))}
        </div>
      </div>

      {/* Le coach ne voit pas ces notes - le rappeler ici évite qu'on les lui transmette
          de bonne foi, ce qui suffirait à les rendre complaisantes. */}
      <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10,
        padding:"9px 14px", fontSize:12, color:"#64748b", marginBottom:16 }}>
        🔒 Ces notes ne sont pas visibles par les coachs. Elles vous sont destinées, ainsi
        qu'au conseiller pédagogique.
      </div>

      {(() => {
        const MOIS_LIB = ["janvier","février","mars","avril","mai","juin",
          "juillet","août","septembre","octobre","novembre","décembre"];
        const iso = x => `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
        // Les annees reellement presentes, pas une liste en dur.
        const annees = [...new Set(appreciations
          .map(a => a.created_at && new Date(a.created_at).getFullYear()).filter(Boolean))].sort((x, y) => y - x);
        if (!annees.length) annees.push(new Date().getFullYear());
        // Le mois actif se DEDUIT de la plage : un seul filtre, deux facons de le poser.
        const actif = (() => {
          if (!du || !au) return null;
          const d = new Date(`${du}T00:00:00`);
          const pr = new Date(d.getFullYear(), d.getMonth(), 1);
          const de = new Date(d.getFullYear(), d.getMonth() + 1, 0);
          return (iso(pr) === du && iso(de) === au) ? { m: d.getMonth(), a: d.getFullYear() } : null;
        })();
        const poser = (m, a) => {
          if (m === "" || a === "") return;
          setDu(iso(new Date(a, m, 1)));
          setAu(iso(new Date(a, Number(m) + 1, 0)));
          setPage(1);
        };
        const anCourante = actif?.a ?? annees[0];
        const champ = { padding:"5px 9px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, background:"#fff" };
        return (
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:16,
            background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:"9px 13px" }}>
            <span style={{ fontSize:12, color:"#64748b", fontWeight:700 }}>Mois</span>
            <select value={actif ? actif.m : ""} style={champ}
              onChange={e => e.target.value === ""
                ? (setDu(""), setAu(""), setPage(1))
                : poser(Number(e.target.value), anCourante)}>
              <option value="">- Tous -</option>
              {MOIS_LIB.map((lib, k) => <option key={k} value={k}>{lib}</option>)}
            </select>
            <select value={anCourante} style={champ}
              onChange={e => { if (actif) poser(actif.m, Number(e.target.value)); }}>
              {annees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <span style={{ fontSize:12, color:"#64748b", fontWeight:700, marginLeft:4 }}>Du</span>
            <input type="date" value={du} style={champ} onChange={e => { setDu(e.target.value); setPage(1); }} />
            <span style={{ fontSize:12, color:"#64748b", fontWeight:700 }}>au</span>
            <input type="date" value={au} style={champ} onChange={e => { setAu(e.target.value); setPage(1); }} />
            {(du || au) && (
              <button onClick={() => { setDu(""); setAu(""); setPage(1); }}
                style={{ ...champ, cursor:"pointer", border:"1.5px solid #fca5a5", background:"#fef2f2", color:"#b91c1c", fontWeight:700 }}>
                ✕ Effacer
              </button>
            )}
            <button
              onClick={() => exporterClassementCoachs({
                lignes: classement.map(e => ({
                  nom: e.coach ? `${e.coach.prenom || ""} ${e.coach.nom || ""}`.trim() : "Coach",
                  nb: e.nb, moyenne: e.moyenne, notes: e.notes, tendance: e.tendance,
                })),
                periode: libPeriode,
                libelleVolume: "Évaluations",
                titre: "Évaluations des apprenants - moyenne par coach",
                nomFichier: "evaluations_apprenants",
              })}
              disabled={!classement.length}
              style={{ marginLeft:"auto", padding:"6px 14px", borderRadius:7, border:"none",
                background: classement.length ? "#16a34a" : "#e2e8f0",
                color: classement.length ? "#fff" : "#94a3b8",
                fontSize:12, fontWeight:700, cursor: classement.length ? "pointer" : "not-allowed" }}>
              📊 Excel
            </button>
          </div>
        );
      })()}

      {dansPeriode.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(165px,1fr))", gap:10, marginBottom:20 }}>
          {[
            { icon:"📝", label:"Évaluations reçues", v:dansPeriode.length, c:accent },
            { icon:"📊", label:"Note moyenne", v:`${moyGlobale.toFixed(1)}/5`, c:NOTE_COUL(moyGlobale) },
            // Le chiffre qu'on cherche en premier : un apprenant insatisfait ne revient
            // pas toujours le dire, et ne se manifeste souvent qu'en partant.
            { icon:"⚠️", label:"Insatisfaits (≤2)", v:insatisfaits, c: insatisfaits > 0 ? "#ef4444" : "#16a34a" },
            { icon:"💬", label:"Avec commentaire", v:avecMot, c:"#0891b2" },
          ].map(k => (
            <div key={k.label} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"14px 16px" }}>
              <div style={{ fontSize:11, color:"#94a3b8", fontWeight:600, marginBottom:4 }}>{k.icon} {k.label}</div>
              <div style={{ fontSize:20, fontWeight:800, color:k.c }}>{k.v}</div>
            </div>
          ))}
        </div>
      )}

      {chargement ? (
        <div style={{ textAlign:"center", padding:40, color:"#94a3b8" }}>⏳ Chargement…</div>
      ) : classement.length === 0 ? (
        <div style={{ textAlign:"center", padding:"50px 0", color:"#9ca3af", background:"#f8fafc", borderRadius:12 }}>
          <div style={{ fontSize:40, marginBottom:10 }}>⭐</div>
          <div style={{ fontWeight:600, color:"#374151" }}>Aucune évaluation {libPeriode}</div>
          <div style={{ fontSize:12, marginTop:4 }}>
            Les apprenants présents notent leur cours depuis leur espace, après chaque séance.
          </div>
        </div>
      ) : (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, overflow:"hidden" }}>
          <div style={{ padding:"11px 18px", background:"#f8fafc", borderBottom:"1px solid #e5e7eb",
            display:"flex", justifyContent:"space-between", fontSize:12, color:"#64748b", fontWeight:600 }}>
            <span>Moyenne par coach · {libPeriode}</span>
            <span>{classement.length} coach{classement.length > 1 ? "s" : ""} noté{classement.length > 1 ? "s" : ""}</span>
          </div>

          {pageItems.map((e, iPage) => {
            // Le rang reste celui du classement ENTIER : page 2, le premier n'est pas premier.
            const i = (pageSafe - 1) * PAR_PAGE + iPage;
            const nom = e.coach ? `${e.coach.prenom || ""} ${e.coach.nom || ""}`.trim() : "Coach";
            const initiales = e.coach ? `${(e.coach.prenom||"")[0]||""}${(e.coach.nom||"")[0]||""}`.toUpperCase() : "CO";
            return (
              <div key={e.coach_id}
                onClick={() => setCoachOuvert(coachOuvert === e.coach_id ? null : e.coach_id)}
                title={`Voir les ${e.nb} évaluation${e.nb > 1 ? "s" : ""} de ${nom}`}
                style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 18px", cursor:"pointer",
                  borderBottom: iPage < pageItems.length - 1 ? "1px solid #f1f5f9" : "none",
                  background: coachOuvert === e.coach_id ? accentLight : "#fff" }}>

                <div style={{ width:26, textAlign:"center", fontSize:13, fontWeight:800, color:"#94a3b8", flexShrink:0 }}>
                  {i + 1}
                </div>

                {e.coach?.avatar_url
                  ? <img src={e.coach.avatar_url} alt={nom} style={{ width:42, height:42, borderRadius:"50%", objectFit:"cover", border:`2px solid ${NOTE_COUL(e.moyenne)}`, flexShrink:0 }} />
                  : <div style={{ width:42, height:42, borderRadius:"50%", background:accentLight, color:accent, flexShrink:0,
                      display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:13,
                      border:`2px solid ${NOTE_COUL(e.moyenne)}` }}>{initiales}</div>}

                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>{nom}</div>
                  <div style={{ fontSize:12, color:"#94a3b8" }}>
                    {e.nb} évaluation{e.nb > 1 ? "s" : ""} · {libPeriode}
                  </div>
                </div>

                <div style={{ display:"flex", gap:3, alignItems:"flex-end", height:26, flexShrink:0 }}>
                  {e.notes.slice(-5).map((n, ni) => (
                    <div key={ni} title={`${n}/5 - ${LIB_NIVEAU[n] || ""}`}
                      style={{ width:8, borderRadius:3, background:NOTE_COUL(n), height:`${(n/5)*100}%`, minHeight:4 }} />
                  ))}
                </div>

                <div style={{ width:48, height:48, borderRadius:"50%", flexShrink:0,
                  background:NOTE_FOND(e.moyenne), border:`2.5px solid ${NOTE_COUL(e.moyenne)}`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontWeight:900, fontSize:15, color:NOTE_COUL(e.moyenne) }}>
                  {e.moyenne.toFixed(1)}
                </div>

                <div style={{ fontSize:18, fontWeight:900, color:TEND_COUL(e.tendance), width:22, textAlign:"center", flexShrink:0 }}
                  title={`Tendance : ${e.tendance}`}>
                  {e.nb >= 2 ? TEND_ICO(e.tendance) : ""}
                </div>
              </div>
            );
          })}

            {totalPages > 1 && (
              <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"center",
                flexWrap:"wrap", padding:"12px 0", borderTop:"1px solid #f1f5f9" }}>
                <span style={{ fontSize:11, color:"#9ca3af", marginRight:4 }}>
                  Page {pageSafe}/{totalPages} · {classement.length} coach{classement.length > 1 ? "s" : ""}
                </span>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pageSafe === 1}
                  style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0",
                    background: pageSafe === 1 ? "#f1f5f9" : "#fff", fontSize:12,
                    cursor: pageSafe === 1 ? "default" : "pointer",
                    color: pageSafe === 1 ? "#cbd5e1" : "#374151", fontWeight:600 }}>← Préc.</button>
                {Array.from({ length: totalPages }, (_, k) => k + 1).map(pg => (
                  <button key={pg} onClick={() => setPage(pg)}
                    style={{ padding:"4px 9px", borderRadius:7,
                      border:`1.5px solid ${pg === pageSafe ? accent : "#e2e8f0"}`,
                      background: pg === pageSafe ? accent : "#fff", fontSize:12, cursor:"pointer",
                      color: pg === pageSafe ? "#fff" : "#374151",
                      fontWeight: pg === pageSafe ? 800 : 400 }}>{pg}</button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={pageSafe === totalPages}
                  style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0",
                    background: pageSafe === totalPages ? "#f1f5f9" : "#fff", fontSize:12,
                    cursor: pageSafe === totalPages ? "default" : "pointer",
                    color: pageSafe === totalPages ? "#cbd5e1" : "#374151", fontWeight:600 }}>Suiv. →</button>
              </div>
            )}
        </div>
      )}

      {/* Detail complet - un ecran, pas une liste : avec des notes venant de nombreux
          apprenants et de plusieurs classes, il faut pouvoir filtrer, trier et exporter
          sans quitter le coach qu'on examine. */}
      {ouvert && (() => {
        const nomCoach = ouvert.coach ? `${ouvert.coach.prenom || ""} ${ouvert.coach.nom || ""}`.trim() : "Coach";
        // Les classes reellement presentes dans ses evaluations : proposer une liste
        // figee afficherait des classes ou il n'enseigne pas.
        const classes = [...new Set(ouvert.lignes.map(a => a.groupe?.nom).filter(Boolean))].sort();
        const lignes = ouvert.lignes
          .filter(a => detailClasse === "toutes" || a.groupe?.nom === detailClasse)
          .filter(a => detailNote === "toutes" || Number(a.note) === Number(detailNote))
          .sort((a, b) => {
            if (detailTri === "note")       return Number(a.note) - Number(b.note);
            if (detailTri === "note_desc")  return Number(b.note) - Number(a.note);
            // Par defaut : la plus recente d'abord, c'est ce qu'on vient voir.
            return new Date(b.seance?.date_seance || b.created_at) - new Date(a.seance?.date_seance || a.created_at);
          });

        // Repartition : un 3,0 de moyenne peut cacher des 5 et des 1, ce qui n'appelle
        // pas du tout le meme accompagnement qu'une serie de 3.
        const repartition = [5, 4, 3, 2, 1].map(n => ({
          n, nb: ouvert.lignes.filter(a => Number(a.note) === n).length,
        }));
        const maxRep = Math.max(1, ...repartition.map(r => r.nb));

        const champ = { padding:"5px 9px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, background:"#fff" };

        return (
          <div
            onClick={e => { if (e.target === e.currentTarget) setCoachOuvert(null); }}
            style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.65)", zIndex:1800,
              display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
            <div style={{ background:"#fff", borderRadius:16,
              width:"100%", maxWidth:"min(94vw, 1180px)", maxHeight:"92vh",
              display:"flex", flexDirection:"column", boxShadow:"0 28px 70px rgba(0,0,0,.35)" }}>

              {/* En-tete */}
              <div style={{ background:accentLight, borderBottom:`1px solid ${accent}30`,
                padding:"16px 22px", display:"flex", alignItems:"center", gap:16, flexWrap:"wrap", flexShrink:0 }}>
                {ouvert.coach?.avatar_url
                  ? <img src={ouvert.coach.avatar_url} alt={nomCoach}
                      style={{ width:52, height:52, borderRadius:"50%", objectFit:"cover", border:`2.5px solid ${NOTE_COUL(ouvert.moyenne)}` }} />
                  : <div style={{ width:52, height:52, borderRadius:"50%", background:"#fff", color:accent,
                      display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:16,
                      border:`2.5px solid ${NOTE_COUL(ouvert.moyenne)}` }}>
                      {`${(ouvert.coach?.prenom||"")[0]||""}${(ouvert.coach?.nom||"")[0]||""}`.toUpperCase() || "CO"}
                    </div>}
                <div style={{ flex:1, minWidth:180 }}>
                  <div style={{ fontSize:17, fontWeight:800, color:"#0f172a" }}>{nomCoach}</div>
                  <div style={{ fontSize:12.5, color:"#64748b" }}>
                    {ouvert.nb} évaluation{ouvert.nb > 1 ? "s" : ""} · {libPeriode}
                    {classes.length > 1 ? ` · ${classes.length} classes` : classes[0] ? ` · ${classes[0]}` : ""}
                  </div>
                </div>

                {/* Repartition des notes */}
                <div style={{ display:"flex", gap:10, alignItems:"flex-end" }}>
                  {repartition.map(r => (
                    <div key={r.n} style={{ textAlign:"center" }} title={`${r.nb} note${r.nb>1?"s":""} à ${r.n}/5`}>
                      <div style={{ fontSize:10, color:"#94a3b8", fontWeight:700 }}>{r.nb}</div>
                      <div style={{ width:22, height:Math.max(4, (r.nb / maxRep) * 40), background:NOTE_COUL(r.n),
                        borderRadius:"4px 4px 0 0", margin:"2px auto 0" }} />
                      <div style={{ fontSize:10.5, color:"#64748b", fontWeight:700, marginTop:3 }}>{r.n}</div>
                    </div>
                  ))}
                </div>

                <div style={{ width:60, height:60, borderRadius:"50%", flexShrink:0,
                  background:NOTE_FOND(ouvert.moyenne), border:`3px solid ${NOTE_COUL(ouvert.moyenne)}`,
                  display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                  color:NOTE_COUL(ouvert.moyenne) }}>
                  <span style={{ fontWeight:900, fontSize:17, lineHeight:1 }}>{ouvert.moyenne.toFixed(1)}</span>
                  <span style={{ fontSize:9, fontWeight:700, opacity:.8 }}>/5</span>
                </div>

                <button onClick={() => setCoachOuvert(null)}
                  style={{ background:"rgba(0,0,0,.06)", border:"none", borderRadius:"50%", width:32, height:32,
                    cursor:"pointer", color:"#475569", fontSize:16, lineHeight:1, flexShrink:0 }}>✕</button>
              </div>

              {/* Filtres du detail */}
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap",
                padding:"10px 22px", borderBottom:"1px solid #f1f5f9", flexShrink:0 }}>
                {classes.length > 1 && (
                  <>
                    <span style={{ fontSize:12, color:"#64748b", fontWeight:700 }}>Classe</span>
                    <select value={detailClasse} onChange={e => setDetailClasse(e.target.value)} style={champ}>
                      <option value="toutes">Toutes ({ouvert.lignes.length})</option>
                      {classes.map(c => (
                        <option key={c} value={c}>
                          {c} ({ouvert.lignes.filter(a => a.groupe?.nom === c).length})
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <span style={{ fontSize:12, color:"#64748b", fontWeight:700 }}>Note</span>
                <select value={detailNote} onChange={e => setDetailNote(e.target.value)} style={champ}>
                  <option value="toutes">Toutes</option>
                  {repartition.filter(r => r.nb > 0).map(r => (
                    <option key={r.n} value={r.n}>{r.n}/5 - {LIB_NIVEAU[r.n]} ({r.nb})</option>
                  ))}
                </select>
                <span style={{ fontSize:12, color:"#64748b", fontWeight:700 }}>Tri</span>
                <select value={detailTri} onChange={e => setDetailTri(e.target.value)} style={champ}>
                  <option value="date">Plus récentes</option>
                  <option value="note">Note croissante</option>
                  <option value="note_desc">Note décroissante</option>
                </select>
                <span style={{ fontSize:11.5, color:"#94a3b8" }}>
                  {lignes.length === ouvert.lignes.length
                    ? `${lignes.length} évaluation${lignes.length > 1 ? "s" : ""}`
                    : `${lignes.length} sur ${ouvert.lignes.length}`}
                </span>
              </div>

              {/* Tableau - toutes les informations d'un coup : la date du cours, la seance,
                  la classe et son niveau, l'apprenant, la note et son commentaire. */}
              <div style={{ overflowY:"auto", flex:1 }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12.5 }}>
                  <thead style={{ position:"sticky", top:0, zIndex:1 }}>
                    <tr style={{ background:"#f8fafc" }}>
                      {["Date", "Séance", "Classe", "Apprenant", "Note", "Commentaire"].map(c => (
                        <th key={c} style={{ textAlign:"left", padding:"9px 14px", fontSize:10.5, fontWeight:700,
                          color:"#94a3b8", textTransform:"uppercase", letterSpacing:".04em",
                          borderBottom:"1px solid #e5e7eb", whiteSpace:"nowrap" }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((a, i) => {
                      const n = Number(a.note);
                      return (
                        <tr key={a.id} style={{ background: i % 2 ? "#fafafa" : "#fff", borderBottom:"1px solid #f1f5f9" }}>
                          <td style={{ padding:"10px 14px", whiteSpace:"nowrap", color:"#475569" }}>
                            {fmtDate(a.seance?.date_seance || a.created_at)}
                          </td>
                          <td style={{ padding:"10px 14px", fontWeight:600, color:"#0f172a" }}>
                            {a.seance?.titre || "Séance"}
                            {a.seance?.type_cours && (
                              <div style={{ fontSize:10.5, color:"#94a3b8", fontWeight:400 }}>
                                {a.seance.type_cours === "en_ligne" ? "En ligne" : a.seance.type_cours}
                              </div>
                            )}
                          </td>
                          <td style={{ padding:"10px 14px", color:"#475569" }}>
                            {a.groupe?.nom || "-"}
                            {a.groupe?.niveau && (
                              <div style={{ fontSize:10.5, color:"#94a3b8" }}>{a.groupe.niveau}</div>
                            )}
                          </td>
                          <td style={{ padding:"10px 14px", color:"#475569", whiteSpace:"nowrap" }}>
                            {a.nom_apprenant || "Apprenant"}
                          </td>
                          <td style={{ padding:"10px 14px", whiteSpace:"nowrap" }}>
                            <span style={{ background:NOTE_FOND(n), color:NOTE_COUL(n),
                              border:`1.5px solid ${NOTE_COUL(n)}`, borderRadius:20,
                              padding:"2px 9px", fontSize:11.5, fontWeight:800 }}>
                              {n}/5 · {LIB_NIVEAU[n] || ""}
                            </span>
                          </td>
                          <td style={{ padding:"10px 14px", color:"#475569", lineHeight:1.5, minWidth:220 }}>
                            {a.commentaire
                              ? `« ${a.commentaire} »`
                              : <span style={{ color:"#cbd5e1" }}>-</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {lignes.length === 0 && (
                  <div style={{ textAlign:"center", padding:"40px 0", color:"#94a3b8", fontSize:13 }}>
                    Aucune évaluation ne correspond à ces filtres.
                  </div>
                )}
              </div>

              {/* Export du detail affiche, filtres compris : c'est ce qu'on a sous les yeux
                  qu'on veut emporter, pas la totalite. */}
              <div style={{ padding:"11px 22px", borderTop:"1px solid #f1f5f9", display:"flex",
                justifyContent:"space-between", alignItems:"center", flexShrink:0, background:"#fafafa" }}>
                <span style={{ fontSize:11.5, color:"#94a3b8" }}>
                  🔒 Ces notes ne sont pas visibles par le coach.
                </span>
                <button
                  onClick={() => exporterEvaluationsDetail({ nomCoach, lignes, periode: libPeriode })}
                  disabled={!lignes.length}
                  style={{ padding:"7px 16px", borderRadius:8, border:"none",
                    background: lignes.length ? "#16a34a" : "#e2e8f0",
                    color: lignes.length ? "#fff" : "#94a3b8",
                    fontSize:12, fontWeight:700, cursor: lignes.length ? "pointer" : "not-allowed" }}>
                  📊 Exporter ce détail
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

