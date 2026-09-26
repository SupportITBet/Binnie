import React, { useState, useEffect, useMemo, useCallback } from "react";
import { lienVisioExploitable } from "../utils/lienVisio";
import DerouleReel from "./DerouleReel";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

/**
 * Le planning des séances de tous les coachs - présentiel comme en ligne.
 *
 * Écrit d'abord pour la commerciale, puis réclamé à l'identique par l'onboarding. Le recopier
 * aurait installé la dérive déjà constatée ailleurs dans ce projet : deux versions d'un même
 * écran, corrigées l'une après l'autre, qui finissent par ne plus dire la même chose du même
 * cours. Il vit donc ici, et les deux tableaux de bord montent le même.
 *
 * La séparation hook / composant n'est pas décorative : chaque tableau de bord possède sa
 * propre barre d'exports, alimentée par les lignes réellement affichées. Le hook expose ces
 * lignes ; le composant se contente de les rendre.
 */

/** Toutes les données et tous les filtres du planning. */
export function usePlanningSeances(authHeaders) {
  const [planSeances,   setPlanSeances]   = useState([]);
  const [planLoading,   setPlanLoading]   = useState(false);
  const [planErreur,    setPlanErreur]    = useState(null);
  const [planType,      setPlanType]      = useState("tous");   // tous | en_ligne | presentiel | prive
  const [planStatut,    setPlanStatut]    = useState("tous");
  const [planDu,        setPlanDu]        = useState("");
  const [planAu,        setPlanAu]        = useState("");
  const [planRecherche, setPlanRecherche] = useState("");
  const [planDetail,    setPlanDetail]    = useState(null);

  const chargerPlanning = useCallback(async () => {
    setPlanLoading(true); setPlanErreur(null);
    try {
      const p = new URLSearchParams();
      if (planDu) p.set("date_debut", planDu);
      if (planAu) p.set("date_fin",   planAu);
      // « non_effectuee » n'est pas un statut de la base : il se déduit de la date et de
      // l'absence d'ouverture. L'envoyer au serveur ne renverrait rien - on le filtre ici.
      if (planStatut !== "tous" && planStatut !== "non_effectuee") p.set("statut", planStatut);
      if (planType   !== "tous") p.set("type_cours", planType);
      const r = await fetch(`${API_URL}/api/seances/planning?${p}`, { headers: authHeaders() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setPlanErreur(d.error || `Erreur ${r.status}`); setPlanSeances([]); return; }
      setPlanSeances(d.seances || []);
    } catch {
      setPlanErreur("Impossible de joindre le serveur");
      setPlanSeances([]);
    } finally { setPlanLoading(false); }
  }, [planDu, planAu, planStatut, planType, authHeaders]);

  useEffect(() => { chargerPlanning(); }, [chargerPlanning]);

  // Le détail nominatif des présences - qui était là, qui ne l'était pas. Le planning ne
  // transporte que le compte agrégé : ouvrir une séance réalisée n'affichait donc jamais
  // les noms pointés par le coach. La route sait les retrouver aussi bien dans
  // `seances_presences` que dans `groupes_presences`, où le coach pointe en réalité.
  const [planPresences, setPlanPresences] = useState({ loading: false, liste: null });
  useEffect(() => {
    if (!planDetail?.id) { setPlanPresences({ loading: false, liste: null }); return; }
    let annule = false;
    setPlanPresences({ loading: true, liste: null });
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/seances/${planDetail.id}/presences`, { headers: authHeaders() });
        const d = await r.json().catch(() => ({}));
        if (!annule) setPlanPresences({ loading: false, liste: r.ok ? (d.presences || []) : [] });
      } catch {
        if (!annule) setPlanPresences({ loading: false, liste: [] });
      }
    })();
    return () => { annule = true; };
  }, [planDetail?.id, authHeaders]);

  const planningVisible = useMemo(() => {
    const q = planRecherche.trim().toLowerCase();
    if (!q) return planSeances;
    return planSeances.filter(x => `${x.coach_nom} ${x.groupe_nom} ${x.titre || ""}`.toLowerCase().includes(q));
  }, [planSeances, planRecherche]);

  // Le compteur de l'onglet se nourrit d'un chargement qui lui est propre, NON filtré.
  // Il se calculait auparavant sur la liste déjà restreinte par les filtres de l'écran :
  // laisser le filtre sur « Réalisées » faisait tomber le badge à zéro alors que des séances
  // à venir étaient bel et bien sans lien. Un badge d'onglet doit dire la même chose quel que
  // soit ce qu'on regarde en dessous.
  const [planningsAAlerter, setPlanningsAAlerter] = useState(0);
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const aujourdhui = new Date().toISOString().slice(0, 10);
        const p = new URLSearchParams({ date_debut: aujourdhui });
        const r = await fetch(`${API_URL}/api/seances/planning?${p}`, { headers: authHeaders() });
        const d = await r.json().catch(() => ({}));
        if (annule || !r.ok) return;
        // « À venir » exclut aussi ce qui a déjà eu lieu : le filtre ne rejetait que les
        // séances annulées, si bien qu'un cours déjà donné restait signalé pour un lien
        // qui n'a plus aucune importance.
        setPlanningsAAlerter((d.seances || []).filter(x =>
          x.type_cours !== "presentiel" &&
          !lienVisioExploitable(x.lien) &&
          !["annulee", "realisee", "terminee"].includes(x.statut)
        ).length);
      } catch { /* le badge reste à sa dernière valeur connue */ }
    })();
    return () => { annule = true; };
  }, [planSeances, authHeaders]);

  // Les exports prennent les clés de l'objet comme en-têtes de colonnes : on projette donc
  // le planning sur des libellés lisibles plutôt que d'exposer les noms techniques.
  const planningExport = useMemo(() => planningVisible.map(x => ({
    "Date":       x.date_seance ? new Date(x.date_seance).toLocaleDateString("fr-FR") : "",
    "Horaire":    [x.heure_debut, x.heure_fin].filter(Boolean).map(h => String(h).slice(0,5)).join(" – "),
    "Coach":      x.coach_nom || "",
    "Classe":     x.groupe_nom || "",
    "Niveau":     x.groupe_niveau || "",
    "Type":       { en_ligne:"En ligne", presentiel:"Présentiel", prive:"Privé", domicile:"Domicile" }[x.type_cours] || x.type_cours || "",
    "Durée":      x.duree_h ? `${parseFloat(x.duree_h).toFixed(1)}h` : "",
    "Présences":  x.nb_presences_total ? `${x.nb_presents}/${x.nb_presences_total}` : "",
    "Statut":     { planifiee:"Planifiée", en_cours:"En direct", realisee:"Réalisée", terminee:"Terminée", annulee:"Annulée" }[x.statut] || x.statut || "",
    "Plateforme": x.plateforme || "",
    "Lien":       x.lien || "",
  })), [planningVisible]);

  return {
    planSeances, planningVisible, planningExport, planningsAAlerter,
    planLoading, planErreur, chargerPlanning,
    planType, setPlanType, planStatut, setPlanStatut,
    planDu, setPlanDu, planAu, setPlanAu,
    planRecherche, setPlanRecherche,
    planDetail, setPlanDetail, planPresences,
  };
}

/** Le planning lui-même. Reçoit tel quel ce que renvoie `usePlanningSeances`. */
export default function PlanningSeances({
  planningVisible, planLoading, planErreur, chargerPlanning, planningsAAlerter,
  planType, setPlanType, planStatut, setPlanStatut,
  planDu, setPlanDu, planAu, setPlanAu,
  planRecherche, setPlanRecherche,
  planDetail, setPlanDetail, planPresences,
}) {
  const visiblesBrut = planningVisible;

  const fmtH = (h) => (h ? String(h).slice(0, 5) : "-");

  const maintenantH = new Date();
  const auj = maintenantH.toISOString().slice(0, 10);
  const enMin = (h) => { const [a,b] = String(h||"").split(":").map(Number); return Number.isFinite(a) ? a*60+(b||0) : null; };
  const minNow = maintenantH.getHours()*60 + maintenantH.getMinutes();
  // « En direct » est un FAIT, pas une déduction : la salle est ouverte quand
  // le coach a cliqué dessus, ce qui bascule sessions_live.statut en « en_cours ».
  // Le déduire de l'horaire annonçait un cours en direct alors que le coach
  // n'avait rien ouvert - exactement la confusion entre déclaré et constaté.
  // Une salle ouverte et jamais refermée reste « en_cours » indéfiniment en base.
  // Elle tombait dans un angle mort : affichée « 🔴 En direct » des jours durant,
  // et exclue de « non effectuée », qui écarte explicitement `en_cours`. Le risque
  // est devenu courant depuis que le présentiel passe lui aussi par cet état.
  // Au-delà de ce seuil, ce n'est plus un cours en direct, c'est une anomalie.
  const HEURES_AVANT_SALLE_ABANDONNEE = 4;
  const estSalleAbandonnee = (x) => {
    if (x.statut !== "en_cours" || !x.demarree_at) return false;
    return (Date.now() - new Date(x.demarree_at).getTime()) > HEURES_AVANT_SALLE_ABANDONNEE * 3600000;
  };
  const estEnDirect = (x) => x.statut === "en_cours" && !estSalleAbandonnee(x);

  // Le créneau est passé mais la salle n'a pas été ouverte : ce n'est pas un
  // cours en direct, c'est une anomalie - et c'est elle qui appelle une action.
  const estEnRetard = (x) => {
    if (x.date_seance !== auj) return false;
    if (["annulee","realisee","terminee","en_cours"].includes(x.statut)) return false;
    const d = enMin(x.heure_debut);
    if (d === null) return false;
    const f = enMin(x.heure_fin) ?? (d + 60);
    return minNow > d && minNow <= f + 30;   // tolérance : 30 min après la fin prévue
  };
  const retardMin = (x) => Math.max(0, minNow - (enMin(x.heure_debut) ?? minNow));

  // Le créneau est passé pour de bon et la séance est restée « planifiee » :
  // le cours n'a pas eu lieu. Sans cet état, ces séances restaient affichées
  // « Planifiée » indéfiniment, comme si elles étaient encore à venir.
  const estNonEffectuee = (x) => {
    if (["annulee","realisee","terminee","en_cours"].includes(x.statut)) return false;
    const d = x.date_seance || "";
    if (!d) return false;
    if (d < auj) return true;                       // jour passé
    if (d > auj) return false;                      // encore à venir
    const deb = enMin(x.heure_debut);               // aujourd'hui : après la tolérance
    if (deb === null) return false;
    const fin = enMin(x.heure_fin) ?? (deb + 60);
    return minNow > fin + 30;
  };

  // Le filtre calculé s'applique après coup, sur la liste déjà filtrée côté serveur.
  const visibles = planStatut === "non_effectuee" ? visiblesBrut.filter(estNonEffectuee) : visiblesBrut;

  /* PAGINATION - côté écran, sur la liste déjà filtrée. Le tableau déroulait toutes les
     séances d'un bloc : lisible sur vingt lignes, illisible dès qu'une année de cours s'y
     accumule. Les filtres de dates restent le vrai outil de réduction ; la pagination ne
     fait que rendre le reste consultable. */
  const PAR_PAGE = 25;
  const [page, setPage] = useState(1);
  const nbPages = Math.max(1, Math.ceil(visibles.length / PAR_PAGE));
  // Changer de filtre raccourcit la liste : rester en page 4 afficherait un tableau vide
  // sans que rien n'explique pourquoi.
  useEffect(() => { setPage(1); }, [planType, planStatut, planDu, planAu, planRecherche]);
  const pageSure = Math.min(page, nbPages);
  const visiblesPage = visibles.slice((pageSure - 1) * PAR_PAGE, pageSure * PAR_PAGE);

  const enDirect = visibles.filter(estEnDirect);
  const enRetard = visiblesBrut.filter(estEnRetard);
  const nonEffectuees = visiblesBrut.filter(estNonEffectuee);
  const cfgType = {
    en_ligne:   { l:"💻 En ligne",   c:"#0369a1", bg:"#e0f2fe" },
    presentiel: { l:"🏢 Présentiel", c:"#7c2d12", bg:"#ffedd5" },
    prive:      { l:"👤 Privé",      c:"#6d28d9", bg:"#ede9fe" },
    domicile:   { l:"🏠 Domicile",   c:"#166534", bg:"#dcfce7" },
  };
  const cfgStatut = {
    planifiee: { l:"Planifiée", c:"#b45309", bg:"#fef3c7", bord:"#fde68a" },
    en_cours:  { l:"🔴 En direct", c:"#b91c1c", bg:"#fee2e2", bord:"#fca5a5" },
    realisee:  { l:"Réalisée",  c:"#15803d", bg:"#dcfce7", bord:"#86efac" },
    terminee:  { l:"Terminée",  c:"#15803d", bg:"#dcfce7", bord:"#86efac" },
    annulee:   { l:"Annulée",   c:"#b91c1c", bg:"#fee2e2", bord:"#fca5a5" },
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"14px 16px" }}>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
          <input value={planRecherche} onChange={e=>setPlanRecherche(e.target.value)}
            placeholder="Rechercher un coach, une classe…"
            style={{ flex:"1 1 240px", padding:"8px 12px", borderRadius:8, border:"1px solid #e5e7eb", fontSize:13, outline:"none" }} />
          <label style={{ fontSize:12, color:"#64748b", fontWeight:600 }}>Du&nbsp;
            <input type="date" value={planDu} onChange={e=>setPlanDu(e.target.value)}
              style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #e5e7eb", fontSize:12.5 }} /></label>
          <label style={{ fontSize:12, color:"#64748b", fontWeight:600 }}>au&nbsp;
            <input type="date" value={planAu} onChange={e=>setPlanAu(e.target.value)}
              style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #e5e7eb", fontSize:12.5 }} /></label>
          <button onClick={chargerPlanning} disabled={planLoading}
            style={{ padding:"8px 14px", borderRadius:8, border:"none", background: planLoading?"#e5e7eb":"#0891b2", color: planLoading?"#9ca3af":"#fff", fontSize:12.5, fontWeight:700, cursor: planLoading?"not-allowed":"pointer" }}>
            {planLoading ? "⏳" : "↻ Actualiser"}
          </button>
        </div>

        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:12 }}>
          {[["tous","Tous"],["en_ligne","💻 En ligne"],["presentiel","🏢 Présentiel"],["prive","👤 Privé"]].map(([k,l]) => (
            <button key={k} onClick={()=>setPlanType(k)}
              style={{ padding:"5px 13px", borderRadius:999, fontSize:12, fontWeight:700, cursor:"pointer",
                border:`1px solid ${planType===k?"#0891b2":"#e5e7eb"}`,
                background: planType===k?"#0891b2":"#fff", color: planType===k?"#fff":"#64748b" }}>{l}</button>
          ))}
          <span style={{ width:1, background:"#e5e7eb", margin:"0 4px" }} />
          {[["tous","Tous statuts"],["planifiee","⏳ Planifiées"],["realisee","✅ Réalisées"],["non_effectuee","🚫 Non effectuées"],["annulee","❌ Annulées"]].map(([k,l]) => (
            <button key={k} onClick={()=>setPlanStatut(k)}
              style={{ padding:"5px 13px", borderRadius:999, fontSize:12, fontWeight:700, cursor:"pointer",
                border:`1px solid ${planStatut===k?"#0891b2":"#e5e7eb"}`,
                background: planStatut===k?"#0891b2":"#fff", color: planStatut===k?"#fff":"#64748b" }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Les cours qui se déroulent MAINTENANT, remontés en tête : c'est pour
          les suivre que la commerciale reçoit le rappel, et les chercher dans
          une liste de cent lignes rendait la notification inutile. */}
      {enDirect.length > 0 && (
        <div style={{ background:"#fef2f2", border:"1.5px solid #fca5a5", borderRadius:12, padding:"14px 16px" }}>
          <div style={{ fontSize:12, fontWeight:800, color:"#b91c1c", letterSpacing:".04em", marginBottom:10 }}>
            🔴 EN DIRECT MAINTENANT - {enDirect.length} cours
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {enDirect.map(x => (
              <div key={`live-${x.id}`} style={{ display:"flex", alignItems:"center", gap:12, background:"#fff", border:"1px solid #fecaca", borderRadius:10, padding:"10px 14px", flexWrap:"wrap" }}>
                <div style={{ flex:"1 1 200px", minWidth:0 }}>
                  <div style={{ fontSize:13.5, fontWeight:800, color:"#0f172a" }}>{x.titre || x.groupe_nom}</div>
                  <div style={{ fontSize:11.5, color:"#64748b", marginTop:2 }}>
                    {x.coach_nom} · {x.groupe_nom} · {fmtH(x.heure_debut)}{x.heure_fin ? ` – ${fmtH(x.heure_fin)}` : ""}
                  </div>
                </div>
                {x.nb_presences_total ? (
                  <span style={{ fontSize:11.5, fontWeight:700, color: x.nb_presents ? "#15803d" : "#b91c1c", whiteSpace:"nowrap" }}>
                    {x.nb_presents}/{x.nb_presences_total} présents
                  </span>
                ) : null}
                {x.lien ? (
                  <a href={x.lien} target="_blank" rel="noopener noreferrer"
                    style={{ padding:"7px 16px", borderRadius:8, background:"#b91c1c", color:"#fff", fontSize:12, fontWeight:800, textDecoration:"none", whiteSpace:"nowrap" }}>
                    ▶ Rejoindre
                  </a>
                ) : (
                  <span style={{ fontSize:11.5, color:"#b45309", fontWeight:700, whiteSpace:"nowrap" }}>Aucun lien</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Séances dont la date est passée sans que le cours ait eu lieu. Elles
          restaient affichées « Planifiée » indéfiniment, comme si elles étaient
          encore à venir. */}
      {nonEffectuees.length > 0 && planStatut !== "non_effectuee" && (
        <div style={{ background:"#fef2f2", border:"1.5px solid #fca5a5", borderRadius:12, padding:"12px 16px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <span style={{ fontSize:18 }}>🚫</span>
          <div style={{ flex:1, minWidth:200, fontSize:12.5, color:"#991b1b", lineHeight:1.6 }}>
            <strong>{nonEffectuees.length} séance{nonEffectuees.length>1?"s":""} non effectuée{nonEffectuees.length>1?"s":""}</strong>
            {" "}- la date est passée et la salle n'a jamais été ouverte. À reprogrammer avec le coach.
          </div>
          <button onClick={()=>setPlanStatut("non_effectuee")}
            style={{ padding:"7px 14px", borderRadius:8, border:"1px solid #fca5a5", background:"#fff", color:"#b91c1c", fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
            Les voir
          </button>
        </div>
      )}

      {/* Créneau entamé, salle jamais ouverte. L'ancien badge peignait ces
          séances en « en direct », ce qui masquait précisément le problème. */}
      {enRetard.length > 0 && (
        <div style={{ background:"#fffbeb", border:"1.5px solid #fde68a", borderRadius:12, padding:"14px 16px" }}>
          <div style={{ fontSize:12, fontWeight:800, color:"#92400e", letterSpacing:".04em", marginBottom:10 }}>
            ⏳ DEVRAIENT AVOIR COMMENCÉ - {enRetard.length} cours
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {enRetard.map(x => (
              <div key={`retard-${x.id}`} style={{ display:"flex", alignItems:"center", gap:12, background:"#fff", border:"1px solid #fde68a", borderRadius:10, padding:"10px 14px", flexWrap:"wrap" }}>
                <div style={{ flex:"1 1 200px", minWidth:0 }}>
                  <div style={{ fontSize:13.5, fontWeight:800, color:"#0f172a" }}>{x.titre || x.groupe_nom}</div>
                  <div style={{ fontSize:11.5, color:"#64748b", marginTop:2 }}>
                    {x.coach_nom} · {x.groupe_nom} · prévu à {fmtH(x.heure_debut)}
                  </div>
                </div>
                <span style={{ fontSize:12, fontWeight:800, color:"#b45309", whiteSpace:"nowrap" }}>
                  salle non ouverte · +{retardMin(x)} min
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Le badge de l'onglet compte ces séances-là : un chiffre rouge sans
          explication inquiète sans indiquer quoi faire. */}
      {planningsAAlerter > 0 && (
        <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10, padding:"12px 16px", display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:18 }}>⚠️</span>
          <div style={{ fontSize:12.5, color:"#92400e", lineHeight:1.6 }}>
            <strong>{planningsAAlerter} séance{planningsAAlerter>1?"s":""} en ligne à venir sans lien exploitable.</strong>
            {" "}Lien absent, ou incomplet (par exemple « zoom.us/j/ » sans identifiant de réunion).
            Les apprenants ne pourront pas les rejoindre - signalez-le au coach concerné.
          </div>
        </div>
      )}

      {planErreur && (
        <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#b91c1c" }}>
          {planErreur}
        </div>
      )}

      {planLoading ? (
        <div style={{ textAlign:"center", padding:48, color:"#94a3b8" }}>⏳ Chargement du planning…</div>
      ) : visibles.length === 0 ? (
        <div style={{ textAlign:"center", padding:"48px 20px", border:"2px dashed #e5e7eb", borderRadius:14, color:"#94a3b8" }}>
          <div style={{ fontSize:44, marginBottom:12 }}>📅</div>
          <div style={{ fontWeight:700, color:"#64748b", marginBottom:4 }}>Aucune séance programmée</div>
          <div style={{ fontSize:12.5 }}>
            {planRecherche || planDu || planAu || planType!=="tous" || planStatut!=="tous"
              ? "Aucune séance ne correspond à ces filtres."
              : "Les séances apparaîtront ici dès que les coachs en programmeront."}
          </div>
        </div>
      ) : (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, overflow:"hidden" }}>
          <div style={{ padding:"10px 16px", background:"#f8fafc", borderBottom:"1px solid #e5e7eb", fontSize:12, fontWeight:700, color:"#374151" }}>
            📅 {visibles.length} séance{visibles.length>1?"s":""}
            {nbPages > 1 && (
              <span style={{ fontWeight:600, color:"#94a3b8" }}>
                {"  ·  "}{(pageSure-1)*PAR_PAGE + 1}–{Math.min(pageSure*PAR_PAGE, visibles.length)} affichées
              </span>
            )}
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#f8fafc" }}>
                  {["Date","Horaire","Coach","Classe","Type","Présences","Statut","Visio"].map(h=>(
                    <th key={h} style={{ textAlign:"left", padding:"9px 12px", fontSize:10.5, fontWeight:800, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".05em", borderBottom:"1px solid #e5e7eb", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiblesPage.map((sx,i) => {
                  const ct = cfgType[sx.type_cours] || { l: sx.type_cours || "-", c:"#64748b", bg:"#f1f5f9" };
                  const cs = cfgStatut[sx.statut] || { l: sx.statut || "-", c:"#64748b", bg:"#f1f5f9" };
                  return (
                    <tr key={sx.id} style={{ cursor:"pointer",
                        background: estEnDirect(sx) ? "#fef2f2" : estEnRetard(sx) ? "#fffbeb" : (i%2 ? "#fafafa" : "#fff"),
                        boxShadow: estEnDirect(sx) ? "inset 3px 0 0 #b91c1c" : estEnRetard(sx) ? "inset 3px 0 0 #f59e0b" : "none" }}
                        onClick={()=>setPlanDetail(sx)}>
                      <td style={{ padding:"9px 12px", borderBottom:"1px solid #f1f5f9", whiteSpace:"nowrap", fontWeight:700, color:"#0f172a" }}>
                        {sx.date_seance ? new Date(sx.date_seance).toLocaleDateString("fr-FR") : "-"}
                      </td>
                      <td style={{ padding:"9px 12px", borderBottom:"1px solid #f1f5f9", whiteSpace:"nowrap", color:"#64748b" }}>
                        {fmtH(sx.heure_debut)}{sx.heure_fin ? ` – ${fmtH(sx.heure_fin)}` : ""}
                        {sx.date_seance_initiale && sx.date_seance_initiale !== sx.date_seance && (
                          <div style={{ fontSize:10.5, color:"#b45309", fontWeight:700 }}
                            title={sx.reprogrammee_motif || "Séance reportée"}>
                            ↪ reportée du {new Date(sx.date_seance_initiale).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"})}
                          </div>
                        )}
                      </td>
                      <td style={{ padding:"9px 12px", borderBottom:"1px solid #f1f5f9", fontWeight:600 }}>{sx.coach_nom}</td>
                      <td style={{ padding:"9px 12px", borderBottom:"1px solid #f1f5f9" }}>
                        {sx.groupe_nom}{sx.groupe_niveau ? <span style={{ color:"#94a3b8" }}> · {sx.groupe_niveau}</span> : null}
                      </td>
                      <td style={{ padding:"9px 12px", borderBottom:"1px solid #f1f5f9" }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:999, background:ct.bg, color:ct.c, whiteSpace:"nowrap" }}>{ct.l}</span>
                      </td>
                      <td style={{ padding:"9px 12px", borderBottom:"1px solid #f1f5f9", whiteSpace:"nowrap" }}>
                        {sx.nb_presences_total ? (
                          <span style={{ fontWeight:700, color: sx.nb_presents ? "#15803d" : "#b91c1c" }}>
                            {sx.nb_presents}/{sx.nb_presences_total}
                          </span>
                        ) : <span style={{ color:"#cbd5e1" }}>-</span>}
                      </td>
                      <td style={{ padding:"9px 12px", borderBottom:"1px solid #f1f5f9" }}>
                        <span title={estSalleAbandonnee(sx) ? "Le coach a ouvert la salle sans jamais la clôturer - la durée du cours est inconnue." : undefined}
                          style={{ fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:999, whiteSpace:"nowrap",
                          background: estEnDirect(sx) ? "#fee2e2" : estSalleAbandonnee(sx) ? "#fffbeb" : estNonEffectuee(sx) ? "#fef2f2" : cs.bg,
                          color: estEnDirect(sx) ? "#b91c1c" : estSalleAbandonnee(sx) ? "#b45309" : estNonEffectuee(sx) ? "#b91c1c" : cs.c,
                          border:`1px solid ${estEnDirect(sx) ? "#fca5a5" : estSalleAbandonnee(sx) ? "#fcd34d" : estNonEffectuee(sx) ? "#fca5a5" : (cs.bord || "transparent")}` }}>
                          {estEnDirect(sx) ? "🔴 En direct"
                            : estSalleAbandonnee(sx) ? "⚠️ Salle non clôturée"
                            : estEnRetard(sx) ? `⏳ +${retardMin(sx)} min`
                            : estNonEffectuee(sx) ? "❌ Non effectuée"
                            : cs.l}
                        </span>
                      </td>
                      <td style={{ padding:"9px 12px", borderBottom:"1px solid #f1f5f9", whiteSpace:"nowrap" }}>
                        {/* Une séance clôturée ou non effectuée n'a plus de salle à
                            rejoindre : garder le bouton actif menait vers une
                            réunion fermée. Le lien reste visible, mais inerte. */}
                        {sx.lien && (["realisee","terminee"].includes(sx.statut) || estNonEffectuee(sx)) ? (
                          <span title={["realisee","terminee"].includes(sx.statut) ? "Séance terminée - salle fermée" : "Séance non effectuée"}
                            style={{ display:"inline-block", padding:"5px 12px", borderRadius:7, background:"#f1f5f9", color:"#94a3b8", fontSize:11.5, fontWeight:700, cursor:"not-allowed" }}>
                            ▶ {sx.plateforme || "Lien"}
                          </span>
                        ) : sx.lien ? (
                          <a href={sx.lien} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
                            style={{ display:"inline-block", padding:"5px 12px", borderRadius:7, background: estEnDirect(sx) ? "#b91c1c" : "#0891b2", color:"#fff", fontSize:11.5, fontWeight:700, textDecoration:"none" }}>
                            ▶ {estEnDirect(sx) ? "Rejoindre" : (sx.plateforme || "Rejoindre")}
                          </a>
                        ) : sx.type_cours === "presentiel" ? (
                          <span style={{ color:"#cbd5e1", fontSize:11.5 }}>Sur site</span>
                        ) : (
                          <span style={{ color:"#cbd5e1", fontSize:11.5 }} title="Aucun lien enregistré par le coach">Aucun lien</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {nbPages > 1 && (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, padding:"10px 16px", borderTop:"1px solid #e5e7eb", background:"#f8fafc", flexWrap:"wrap" }}>
              <span style={{ fontSize:11.5, color:"#64748b" }}>Page {pageSure} sur {nbPages}</span>
              <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pageSure === 1}
                  style={{ padding:"6px 12px", borderRadius:7, border:"1px solid #e2e8f0", background: pageSure === 1 ? "#f1f5f9" : "#fff",
                    color: pageSure === 1 ? "#cbd5e1" : "#334155", fontWeight:700, fontSize:12, cursor: pageSure === 1 ? "default" : "pointer" }}>
                  ← Précédent
                </button>
                {/* Une fenêtre de cinq numéros autour de la page courante : au-delà, la
                    rangée de boutons déborderait au lieu d'aider à se repérer. */}
                {Array.from({ length: nbPages }, (_, i) => i + 1)
                  .filter(n => Math.abs(n - pageSure) <= 2 || n === 1 || n === nbPages)
                  .reduce((acc, n) => {
                    if (acc.length && n - acc[acc.length - 1] > 1) acc.push("…");
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((n, i) => n === "…"
                    ? <span key={`e${i}`} style={{ color:"#cbd5e1", fontSize:12, padding:"0 2px" }}>…</span>
                    : (
                      <button key={n} onClick={() => setPage(n)}
                        style={{ minWidth:30, padding:"6px 9px", borderRadius:7, border:`1px solid ${n === pageSure ? "#0891b2" : "#e2e8f0"}`,
                          background: n === pageSure ? "#0891b2" : "#fff", color: n === pageSure ? "#fff" : "#334155",
                          fontWeight:700, fontSize:12, cursor:"pointer" }}>
                        {n}
                      </button>
                    ))}
                <button onClick={() => setPage(p => Math.min(nbPages, p + 1))} disabled={pageSure === nbPages}
                  style={{ padding:"6px 12px", borderRadius:7, border:"1px solid #e2e8f0", background: pageSure === nbPages ? "#f1f5f9" : "#fff",
                    color: pageSure === nbPages ? "#cbd5e1" : "#334155", fontWeight:700, fontSize:12, cursor: pageSure === nbPages ? "default" : "pointer" }}>
                  Suivant →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {planDetail && (() => { const pdSeance = planDetail; return (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:9600, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
             onClick={e=>{ if(e.target===e.currentTarget) setPlanDetail(null); }}>
          <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:720, maxHeight:"88vh", overflowY:"auto", padding:26 }}>
            {(() => {
              const pd = pdSeance;
              const fait = ["realisee","terminee"].includes(pd.statut);
              const live = estEnDirect(pd);
              const cs = cfgStatut[pd.statut] || { l: pd.statut || "-", c:"#64748b", bg:"#f1f5f9", bord:"#e5e7eb" };
              return (
                <>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:4 }}>
                    <h3 style={{ margin:0, fontSize:17, fontWeight:800, color:"#0f172a" }}>{pd.titre || "Séance"}</h3>
                    <span style={{ flexShrink:0, fontSize:11.5, fontWeight:700, padding:"3px 11px", borderRadius:999,
                      background: live ? "#fee2e2" : cs.bg, color: live ? "#b91c1c" : cs.c, border:`1px solid ${live ? "#fca5a5" : (cs.bord||"transparent")}` }}>
                      {live ? "🔴 En direct" : cs.l}
                    </span>
                  </div>
                  <p style={{ margin:"0 0 18px", fontSize:12.5, color:"#64748b" }}>
                    {pd.date_seance ? new Date(pd.date_seance).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}) : "-"}
                    {pd.heure_debut ? ` · ${fmtH(pd.heure_debut)}` : ""}
                    {pd.heure_fin ? ` – ${fmtH(pd.heure_fin)}` : ""}
                  </p>

                  {/* Un cours reporté n'est pas un cours ordinaire à sa nouvelle
                      date : sans cette mention, le fait qu'il n'ait pas eu lieu
                      au moment prévu disparaît du suivi. */}
                  {pd.date_seance_initiale && pd.date_seance_initiale !== pd.date_seance && (
                    <div style={{ background:"#fffbeb", border:"1.5px solid #fde68a", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:12.5, color:"#92400e" }}>
                      <strong>📅 Séance reportée</strong> - initialement prévue le{" "}
                      {new Date(pd.date_seance_initiale).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"})}.
                      {pd.reprogrammee_motif ? <> Motif : <em>{pd.reprogrammee_motif}</em></> : null}
                    </div>
                  )}

                  {/* Déroulé réel - composant partagé avec le PA, l'onboarding
                      et le superviseur : une seule règle, un seul endroit. */}
                  <DerouleReel seance={pd} style={{ marginBottom:16 }} />

                  {/* Présences - la preuve que le cours a eu lieu. */}
                  <div style={{ background: pd.nb_presences_total ? "#f8fafc" : "#fffbeb", border:`1.5px solid ${pd.nb_presences_total ? "#e2e8f0" : "#fde68a"}`, borderRadius:12, padding:"14px 16px", marginBottom:16 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:"#94a3b8", letterSpacing:".05em", marginBottom:8 }}>PRÉSENCES</div>
                    {pd.nb_presences_total ? (
                      <>
                        <div style={{ fontSize:20, fontWeight:900, color: pd.nb_presents ? "#15803d" : "#b91c1c" }}>
                          {pd.nb_presents}/{pd.nb_presences_total}
                          <span style={{ fontSize:12.5, fontWeight:600, color:"#64748b", marginLeft:8 }}>apprenants présents</span>
                        </div>
                        <div style={{ height:6, borderRadius:99, background:"#e5e7eb", overflow:"hidden", marginTop:8 }}>
                          <div style={{ width:`${Math.round((pd.nb_presents/pd.nb_presences_total)*100)}%`, height:"100%", background:"#15803d" }} />
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize:12.5, color:"#92400e", fontWeight:600 }}>
                        {fait ? "Séance marquée réalisée sans aucune présence saisie - à signaler au coach." : "Présences non encore saisies."}
                      </div>
                    )}

                    {/* Le compte ne dit pas QUI était là : c'est pourtant ce qu'on
                        cherche quand on ouvre une séance réalisée. */}
                    {planPresences.loading ? (
                      <div style={{ marginTop:10, fontSize:12, color:"#94a3b8" }}>⏳ Chargement des présences…</div>
                    ) : planPresences.liste?.length ? (
                      <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:5 }}>
                        {planPresences.liste.map((p, i) => {
                          const cfg = { present:{ l:"✅ Présent", c:"#15803d", bg:"#dcfce7" },
                                        retard:{ l:"⏱ Retard", c:"#92400e", bg:"#fef3c7" },
                                        absent:{ l:"❌ Absent", c:"#991b1b", bg:"#fee2e2" },
                                        excuse:{ l:"📝 Excusé", c:"#1d4ed8", bg:"#dbeafe" } }[p.statut]
                                     || { l: p.statut || "-", c:"#64748b", bg:"#f1f5f9" };
                          return (
                            <div key={p.id || i} style={{ display:"flex", alignItems:"center", gap:10, background:"#fff", border:"1px solid #e2e8f0", borderRadius:8, padding:"7px 11px", flexWrap:"wrap" }}>
                              <span style={{ flex:"1 1 140px", fontSize:12.5, fontWeight:700, color:"#0f172a" }}>
                                {[p.prenom_apprenant, p.nom_apprenant].filter(Boolean).join(" ") || "Apprenant"}
                              </span>
                              {p.note && <span style={{ fontSize:11.5, color:"#64748b", fontStyle:"italic" }}>{p.note}</span>}
                              <span style={{ fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:999, background:cfg.bg, color:cfg.c, whiteSpace:"nowrap" }}>{cfg.l}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:0 }}>
                    {[
                      ["Coach", pd.coach_nom],
                      ["Classe", pd.groupe_nom],
                      ["Niveau", pd.groupe_niveau || "-"],
                      ["Type", (cfgType[pd.type_cours]||{}).l || pd.type_cours || "-"],
                      ["Plateforme", pd.plateforme || "-"],
                      ["Durée contractuelle", pd.duree_h ? `${parseFloat(pd.duree_h).toFixed(1)}h` : "-"],
                    ].map(([l,v]) => (
                      <div key={l} style={{ display:"flex", justifyContent:"space-between", gap:12, padding:"9px 0", borderBottom:"1px solid #f1f5f9", fontSize:13 }}>
                        <span style={{ color:"#94a3b8", fontWeight:600 }}>{l}</span>
                        <span style={{ fontWeight:700, color:"#0f172a", textAlign:"right" }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display:"flex", gap:10, marginTop:20 }}>
                    {/* Le lien n'a de sens que tant que le cours n'est pas terminé. */}
                    {/* Ni une séance terminée ni une séance non effectuée n'ont
                        de salle ouverte : le lien n'y mène plus nulle part. */}
                    {pd.lien && !fait && !estNonEffectuee(pd) && (
                      <a href={pd.lien} target="_blank" rel="noopener noreferrer"
                        style={{ flex:1, textAlign:"center", padding:"11px 0", borderRadius:8, background: live ? "#b91c1c" : "#0891b2", color:"#fff", fontWeight:800, fontSize:13, textDecoration:"none" }}>
                        ▶ {live ? "Rejoindre maintenant" : "Rejoindre le cours"}
                      </a>
                    )}
                    <button onClick={()=>setPlanDetail(null)}
                      style={{ flex:1, padding:"11px 0", borderRadius:8, border:"1.5px solid #e2e8f0", background:"#fff", color:"#374151", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                      Fermer
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ); })()}
    </div>
  );
}
