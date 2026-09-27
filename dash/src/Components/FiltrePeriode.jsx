import React from "react";

/* ══════════════════════════════════════════════════════════════════════════════
   FILTRE PAR PÉRIODE + PAGINATION - briques partagées

   Le détail d'une classe montre trois listes qui grandissent sans fin : les séances,
   les feuilles de présence et les fichiers. Une classe d'un an en compte des centaines,
   et le superviseur qui prépare une observation cherche une semaine précise.

   Ces deux briques vivent ici plutôt que recopiées dans chaque onglet : trois copies
   d'une pagination, ce sont trois comportements qui finissent par différer.
══════════════════════════════════════════════════════════════════════════════ */

/* Compare une date ISO (AAAA-MM-JJ, éventuellement suivie d'une heure) aux bornes du
   filtre, en restant sur la comparaison de chaînes : passer par `new Date()` ferait
   entrer le fuseau du navigateur dans le calcul, et une séance du 1er du mois à 00:00
   basculerait la veille pour un utilisateur à l'ouest de Greenwich. */
export function dansLaPeriode(dateISO, du, au) {
  if (!du && !au) return true;
  if (!dateISO) return false;
  const d = String(dateISO).slice(0, 10);
  if (du && d < du) return false;
  if (au && d > au) return false;
  return true;
}

export function FiltrePeriode({ du, au, onChange, accent = "#b45309", total = 0, affiches = 0, labelItem = "élément" }) {
  const actif = !!(du || au);
  const pluriel = (n) => n > 1 ? "s" : "";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:12 }}>
      <span style={{ fontSize:11, color:"#6b7280", fontWeight:700 }}>Du</span>
      <input type="date" value={du} onChange={e=>onChange(e.target.value, au)}
        style={{ padding:"4px 8px", borderRadius:7, border:"1.5px solid #e2e8f0", fontSize:12, color:"#374151", background:"#fff" }} />
      <span style={{ fontSize:11, color:"#6b7280", fontWeight:700 }}>au</span>
      <input type="date" value={au} onChange={e=>onChange(du, e.target.value)}
        style={{ padding:"4px 8px", borderRadius:7, border:"1.5px solid #e2e8f0", fontSize:12, color:"#374151", background:"#fff" }} />
      {actif && (
        <button type="button" onClick={()=>onChange("", "")}
          style={{ padding:"3px 9px", borderRadius:7, border:"1.5px solid #fca5a5", background:"#fef2f2", fontSize:12, color:"#b91c1c", cursor:"pointer", fontWeight:700 }}>
          ✕ Effacer
        </button>
      )}
      <span style={{ fontSize:11.5, color:"#94a3b8", marginLeft:"auto" }}>
        {actif
          ? <><strong style={{ color:accent }}>{affiches}</strong> {labelItem}{pluriel(affiches)} sur {total}</>
          : <>{total} {labelItem}{pluriel(total)}</>}
      </span>
    </div>
  );
}

export function BarrePagination({ page, totalPages, onPage, accent = "#b45309" }) {
  if (totalPages <= 1) return null;
  const btn = (actif, courant) => ({
    padding:"4px 10px", borderRadius:7, fontSize:12, fontWeight: courant ? 800 : 600,
    border:`1.5px solid ${courant ? accent : "#e2e8f0"}`,
    background: courant ? accent : actif ? "#fff" : "#f1f5f9",
    color: courant ? "#fff" : actif ? "#374151" : "#cbd5e1",
    cursor: actif ? "pointer" : "default",
  });
  // Fenêtre glissante : une classe d'un an produirait cinquante boutons de page.
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => Math.abs(p - page) <= 2);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"center", padding:"12px 0", flexWrap:"wrap" }}>
      <span style={{ fontSize:11, color:"#9ca3af", marginRight:4 }}>Page {page}/{totalPages}</span>
      <button type="button" onClick={()=>onPage(Math.max(1, page-1))} disabled={page===1} style={btn(page!==1, false)}>← Préc.</button>
      {pages[0] > 1 && <span style={{ fontSize:11, color:"#cbd5e1" }}>…</span>}
      {pages.map(p => (
        <button key={p} type="button" onClick={()=>onPage(p)} style={btn(true, p===page)}>{p}</button>
      ))}
      {pages[pages.length-1] < totalPages && <span style={{ fontSize:11, color:"#cbd5e1" }}>…</span>}
      <button type="button" onClick={()=>onPage(Math.min(totalPages, page+1))} disabled={page===totalPages} style={btn(page!==totalPages, false)}>Suiv. →</button>
    </div>
  );
}

/* Découpe une liste et corrige la page si le filtre l'a rendue hors bornes - sans quoi
   resserrer les dates depuis la page 4 afficherait une liste vide sur des données présentes. */
export function paginer(liste, page, parPage) {
  const totalPages = Math.max(1, Math.ceil(liste.length / parPage));
  const pageSure   = Math.min(Math.max(1, page), totalPages);
  return { totalPages, page: pageSure, items: liste.slice((pageSure - 1) * parPage, pageSure * parPage) };
}
