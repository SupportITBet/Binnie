import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

/**
 * LE COCKPIT DE PILOTAGE — les indicateurs que le SI sait réellement calculer.
 *
 * Ce que cet écran fait DIFFÉREMMENT d'un tableau de chiffres, et pourquoi :
 *
 *  · IL DIT SUR QUOI IL COMPTE. « 2,5 % de churn » n'a pas le même poids sur 79
 *    apprenants que sur 7 900 : l'effectif accompagne toujours la valeur. C'est ce que
 *    la plupart des tableaux de bord omettent, et c'est ce qui les rend intenables au
 *    premier désaccord sur un chiffre.
 *
 *  · IL DISTINGUE « AUCUNE DONNÉE » DE « ZÉRO ». Une table jamais alimentée et une
 *    contre-performance s'affichent autrement : la première en gris et sans pastille,
 *    la seconde en rouge. Sans cette distinction, on cesse de regarder les alertes.
 *
 *  · IL AFFICHE SA SOURCE. Chaque carte nomme la table et le champ d'où sort son
 *    chiffre. Un indicateur qu'on ne peut pas remonter ne se pilote pas, il se subit.
 *
 *  · IL ASSUME CE QU'IL NE COUVRE PAS. Le bandeau final rappelle les 75 indicateurs du
 *    référentiel qui n'ont pas de source, et pourquoi. Un cockpit muet sur ses angles
 *    morts laisse croire qu'il n'en a pas.
 *
 * La tendance compare le dernier mois COMPLET au précédent, jamais le mois en cours -
 * forcément partiel, il afficherait une chute qui n'est qu'un effet de calendrier.
 */

const STATUTS = {
  atteint:     { pastille:"Objectif tenu",  fond:"#ECFDF5", bord:"#A7F3D0", texte:"#047857", point:"#10B981" },
  surveiller:  { pastille:"À surveiller",   fond:"#FFFBEB", bord:"#FDE68A", texte:"#B45309", point:"#F59E0B" },
  hors_cible:  { pastille:"Hors cible",     fond:"#FEF2F2", bord:"#FECACA", texte:"#B91C1C", point:"#EF4444" },
  info:        { pastille:null,             fond:"#F8FAFC", bord:"#E2E8F0", texte:"#475569", point:"#64748B" },
  sans_donnee: { pastille:"Aucune donnée",  fond:"#F8FAFC", bord:"#E2E8F0", texte:"#94A3B8", point:"#CBD5E1" },
};

/** Les grands nombres se lisent par tranches ; les taux gardent leur décimale. */
function formater(valeur, unite) {
  if (valeur === null || valeur === undefined) return "—";
  if (unite === "FCFA") {
    if (Math.abs(valeur) >= 1_000_000) return `${(valeur / 1_000_000).toFixed(valeur >= 10_000_000 ? 1 : 2)} M`;
    return Number(valeur).toLocaleString("fr-FR");
  }
  return Number.isInteger(valeur) ? String(valeur) : valeur.toFixed(1).replace(".", ",");
}

const moisCourt = (m) => {
  const [a, mm] = String(m).split("-");
  return ["janv","févr","mars","avr","mai","juin","juil","août","sept","oct","nov","déc"][Number(mm) - 1] + " " + a.slice(2);
};

/**
 * La courbe des six derniers mois, dessinée à la main.
 *
 * Pas de librairie : un tracé de 40 px de haut ne justifie pas d'embarquer un moteur de
 * graphiques, et `react-chartjs-2` impose un conteneur redimensionnable dont une carte
 * de grille n'a pas besoin. L'échelle part de zéro - une courbe tronquée transforme une
 * variation de 2 % en falaise.
 */
function Sparkline({ serie, couleur }) {
  const pts = (serie || []).filter((p) => p && typeof p.v === "number");
  if (pts.length < 2) return null;
  const max = Math.max(...pts.map((p) => p.v), 1);
  const L = 100, H = 30;
  const x = (i) => (i / (pts.length - 1)) * L;
  const y = (v) => H - (v / max) * (H - 3) - 1.5;
  const trace = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const aire = `${trace} L${L},${H} L0,${H} Z`;
  const dernier = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none" role="img"
      aria-label={`Évolution sur ${pts.length} mois, dernière valeur ${dernier.v}`}
      style={{ width:"100%", height:34, display:"block", overflow:"visible" }}>
      <path d={aire} fill={couleur} opacity=".10" />
      <path d={trace} fill="none" stroke={couleur} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(pts.length - 1)} cy={y(dernier.v)} r="2.2" fill={couleur} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** La répartition interne d'un indicateur (canaux d'encaissement, modalités de cours). */
function Repartition({ detail, unite, couleur }) {
  if (!detail?.length) return null;
  const max = Math.max(...detail.map((d) => d.v), 1);
  return (
    <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:7 }}>
      {detail.slice(0, 4).map((d) => (
        <div key={d.cle}>
          <div style={{ display:"flex", justifyContent:"space-between", gap:10, fontSize:11.5, marginBottom:3 }}>
            <span style={{ color:"#475569", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.cle}</span>
            <span style={{ color:"#0f172a", fontWeight:700, whiteSpace:"nowrap", fontVariantNumeric:"tabular-nums" }}>
              {formater(d.v, unite)} <span style={{ color:"#94a3b8", fontWeight:500 }}>· {d.part} %</span>
            </span>
          </div>
          <div style={{ height:4, background:"#F1F5F9", borderRadius:3, overflow:"hidden" }}>
            <div style={{ width:`${(d.v / max) * 100}%`, height:"100%", background:couleur, opacity:.55, borderRadius:3 }} />
          </div>
        </div>
      ))}
      {detail.length > 4 && (
        <div style={{ fontSize:11, color:"#94a3b8" }}>+ {detail.length - 4} autre{detail.length - 4 > 1 ? "s" : ""}</div>
      )}
    </div>
  );
}

function CarteKPI({ k, accent }) {
  const s = STATUTS[k.statut] || STATUTS.info;
  const vide = k.statut === "sans_donnee";
  /* La variation n'est pas lue de la même façon selon le sens : +40 % de churn est une
     mauvaise nouvelle, +40 % de CA une bonne. La couleur suit le SENS, pas le signe. */
  const varBonne = k.variation === null ? null : (k.sens === "bas" ? k.variation < 0 : k.variation > 0);

  return (
    <div style={{ background:"#fff", border:`1px solid ${s.bord}`, borderRadius:14, padding:"16px 18px 18px",
      display:"flex", flexDirection:"column", minWidth:0 }}>

      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10, marginBottom:10 }}>
        <div style={{ minWidth:0 }}>
          <div style={{ fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace", fontSize:10.5, letterSpacing:".06em",
            color:"#94a3b8", fontWeight:700 }}>{k.code}</div>
          <div style={{ fontSize:13.5, fontWeight:700, color:"#0f172a", marginTop:3, lineHeight:1.3 }}>{k.libelle}</div>
        </div>
        {s.pastille && (
          <span style={{ flexShrink:0, fontSize:10, fontWeight:800, padding:"3px 9px", borderRadius:99,
            background:s.fond, color:s.texte, border:`1px solid ${s.bord}`, whiteSpace:"nowrap" }}>
            {s.pastille}
          </span>
        )}
      </div>

      <div style={{ display:"flex", alignItems:"baseline", gap:7, flexWrap:"wrap" }}>
        <span style={{ fontSize:30, fontWeight:800, lineHeight:1, color: vide ? "#CBD5E1" : "#0f172a",
          fontVariantNumeric:"tabular-nums", letterSpacing:"-.02em" }}>
          {formater(k.valeur, k.unite)}
        </span>
        <span style={{ fontSize:12.5, color:"#94a3b8", fontWeight:600 }}>{k.unite}</span>
        {k.variation !== null && (
          <span title="Variation du dernier mois complet par rapport au précédent"
            style={{ fontSize:11.5, fontWeight:800, marginLeft:"auto",
              color: varBonne ? "#047857" : "#B91C1C" }}>
            {k.variation > 0 ? "▲" : "▼"} {Math.abs(k.variation)} %
          </span>
        )}
      </div>

      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginTop:8, fontSize:11, color:"#94a3b8" }}>
        {k.cible !== null && (
          <span>Cible <strong style={{ color:"#64748b" }}>{k.sens === "bas" ? "≤" : "≥"} {k.cible} {k.unite}</strong></span>
        )}
        {/* L'EFFECTIF, toujours. Un taux sans son dénominateur n'est pas un chiffre, c'est une opinion. */}
        {k.effectif !== null && <span>sur <strong style={{ color:"#64748b" }}>{k.effectif}</strong></span>}
      </div>

      {!vide && k.serie?.length > 1 && (
        <div style={{ marginTop:12 }}>
          <Sparkline serie={k.serie} couleur={s.point === "#64748B" ? accent : s.point} />
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:9.5, color:"#CBD5E1", marginTop:2 }}>
            <span>{moisCourt(k.serie[0].mois)}</span>
            <span>{moisCourt(k.serie[k.serie.length - 1].mois)}</span>
          </div>
        </div>
      )}

      <Repartition detail={k.detail} unite={k.unite} couleur={accent} />

      {k.note && (
        <div style={{ marginTop:11, fontSize:10.5, color:"#B45309", background:"#FFFBEB",
          border:"1px solid #FDE68A", borderRadius:7, padding:"6px 9px", lineHeight:1.5 }}>
          {k.note}
        </div>
      )}

      {/* La source, en pied de carte : d'où vient ce chiffre, et donc à qui le contester. */}
      <div style={{ marginTop:"auto", paddingTop:12, fontSize:10, color:"#CBD5E1",
        fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace", wordBreak:"break-word" }}>
        {k.source}
      </div>
    </div>
  );
}

export default function CockpitKPI({ accent = "#0891b2", token }) {
  const [data, setData]       = useState(null);
  const [charge, setCharge]   = useState(true);
  const [imports, setImports] = useState(false);
  /* Une section à la fois. Vingt-cinq cartes d'un bloc ne se lisent pas : on parcourt au
     lieu de regarder, et les deux ou trois chiffres qui comptent se noient dans le reste.
     « Tout » reste accessible pour la lecture d'ensemble et pour l'export. */
  const [section, setSection] = useState("tout");

  const charger = useCallback(async (avecImports) => {
    setCharge(true);
    try {
      const r = await fetch(`${API_URL}/api/kpi/cockpit${avecImports ? "?imports=1" : ""}`, {
        headers: { Authorization: `Bearer ${token || localStorage.getItem("admin_token")}` },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Lecture impossible");
      setData(d);
    } catch (e) {
      toast.error(e.message || "Indicateurs indisponibles");
    } finally { setCharge(false); }
  }, [token]);

  useEffect(() => { charger(imports); }, [charger, imports]);

  if (charge && !data) {
    return <div style={{ textAlign:"center", padding:"60px 20px", color:"#94a3b8", fontSize:13 }}>Calcul des indicateurs…</div>;
  }
  if (!data) return null;

  const groupes = [
    { cle:"cycle", titre:"Cycle commercial", sous:"De l'arrivée du prospect à sa conversion",
      codes:["COM-01","COM-03","COM-05","COM-06","WEB-09","WEB-11"] },
    { cle:"commercial", titre:"Portefeuille", sous:"Encaissement, effectif et rétention",
      codes:["COM-07","COM-08","COM-12","COM-13","COM-14","COM-15"] },
    { cle:"audience", titre:"Audience du site", sous:"Traçage interne du SI — sessions, rebond, profondeur",
      codes:["WEB-01","WEB-02","WEB-03","WEB-04","WEB-08"] },
    { cle:"ga4", titre:"Provenance & terminaux", sous:"Ce que seul GA4 sait dire",
      codes:["WEB-01b","WEB-05","WEB-07"] },
    { cle:"conversion", titre:"Conversion & paiement", sous:"Ce que le site rapporte réellement",
      codes:["WEB-13","WEB-18","TECH-07"] },
    { cle:"pedago", titre:"Pédagogie & honoraires", sous:"Le circuit le mieux instrumenté du SI",
      codes:["PED-06","HON-01","HON-02","HON-03","HON-04","HON-05","HON-06"] },
    { cle:"technique", titre:"Technique", sous:"Ce que les journaux permettent de mesurer",
      codes:["TECH-06"] },
  ];

  const parCode = Object.fromEntries(data.indicateurs.map((i) => [i.code, i]));
  const horsCible = data.indicateurs.filter((i) => i.statut === "hors_cible").length;
  const sansDonnee = data.indicateurs.filter((i) => i.statut === "sans_donnee").length;

  /* Le compteur de chaque section porte le nombre d'indicateurs RÉELLEMENT rendus par le
     serveur, pas la longueur de la liste de codes : un indicateur retiré côté serveur ne
     doit pas continuer d'être annoncé ici. */
  const compte = (g) => g.codes.filter((c) => parCode[c]).length;
  const alertes = (g) => g.codes.filter((c) => parCode[c]?.statut === "hors_cible").length;
  const visibles = section === "tout" ? groupes : groupes.filter((g) => g.cle === section);

  return (
    <div>
      {/* ── Bandeau : ce que l'écran couvre, et à quelle date ── */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:16,
        flexWrap:"wrap", marginBottom:18 }}>
        <div>
          <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:"#0f172a" }}>📊 Cockpit de pilotage</h2>
          <p style={{ margin:"4px 0 0", fontSize:12.5, color:"#64748b", maxWidth:"62ch", lineHeight:1.6 }}>
            {data.indicateurs.length} indicateurs du référentiel dont la source est réellement alimentée.
            Calculés le {new Date(data.genere_le).toLocaleString("fr-FR", { dateStyle:"long", timeStyle:"short" })}.
          </p>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          {/* L'interrupteur des imports change les DÉNOMINATEURS : il mérite d'être visible
              et expliqué, pas caché dans un menu. */}
          <label title="68 dossiers proviennent d'une reprise de l'existant, avec des dates antérieures à leur création. Les inclure fausse les délais et les taux de conversion."
            style={{ display:"flex", alignItems:"center", gap:7, fontSize:12, color:"#475569",
              background: imports ? "#FFFBEB" : "#F8FAFC", border:`1px solid ${imports ? "#FDE68A" : "#E2E8F0"}`,
              borderRadius:9, padding:"7px 12px", cursor:"pointer" }}>
            <input type="checkbox" checked={imports} onChange={(e) => setImports(e.target.checked)}
              style={{ width:14, height:14, accentColor:accent, cursor:"pointer" }} />
            Inclure les {data.filtres.dossiers_importes} dossiers importés
          </label>
          <button onClick={() => charger(imports)} disabled={charge}
            style={{ padding:"8px 14px", background:"#fff", border:"1px solid #E2E8F0", borderRadius:9,
              cursor: charge ? "wait" : "pointer", fontSize:12, fontWeight:700, color:"#475569" }}>
            {charge ? "⏳" : "🔄"} Actualiser
          </button>
        </div>
      </div>

      {/* ── Le filtre de section ─────────────────────────────────────────────
          Les pastilles portent le nombre d'indicateurs et, en rouge, ceux qui sont hors
          cible : on voit où regarder avant même d'ouvrir la section. */}
      <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:18, paddingBottom:16,
        borderBottom:"1px solid #E2E8F0" }}>
        {[{ cle:"tout", titre:"Tout", n:data.indicateurs.length,
            alerte:data.indicateurs.filter((i) => i.statut === "hors_cible").length },
          ...groupes.filter((g) => compte(g) > 0).map((g) => ({ cle:g.cle, titre:g.titre, n:compte(g), alerte:alertes(g) })),
        ].map((t) => {
          const actif = section === t.cle;
          return (
            <button key={t.cle} type="button" onClick={() => setSection(t.cle)}
              style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 14px", borderRadius:99,
                border:`1.5px solid ${actif ? accent : "#E2E8F0"}`,
                background: actif ? accent : "#fff", color: actif ? "#fff" : "#475569",
                fontWeight: actif ? 800 : 600, fontSize:12.5, cursor:"pointer", whiteSpace:"nowrap" }}>
              {t.titre}
              <span style={{ fontSize:11, fontWeight:800, opacity: actif ? .8 : .55 }}>{t.n}</span>
              {t.alerte > 0 && (
                <span style={{ fontSize:10, fontWeight:800, padding:"1px 6px", borderRadius:99,
                  background: actif ? "rgba(255,255,255,.22)" : "#FEF2F2",
                  color: actif ? "#fff" : "#B91C1C" }}>
                  {t.alerte} ⚠
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Ce qui demande une action, en tête ── */}
      {(horsCible > 0 || sansDonnee > 0) && (
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:20 }}>
          {horsCible > 0 && (
            <div style={{ flex:"1 1 260px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:11, padding:"12px 15px" }}>
              <div style={{ fontSize:12.5, fontWeight:800, color:"#B91C1C" }}>
                {horsCible} indicateur{horsCible > 1 ? "s" : ""} hors cible
              </div>
              <div style={{ fontSize:11.5, color:"#991B1B", marginTop:3 }}>
                {data.indicateurs.filter((i) => i.statut === "hors_cible").map((i) => i.code).join(" · ")}
              </div>
            </div>
          )}
          {sansDonnee > 0 && (
            <div style={{ flex:"1 1 260px", background:"#F8FAFC", border:"1px solid #E2E8F0", borderRadius:11, padding:"12px 15px" }}>
              <div style={{ fontSize:12.5, fontWeight:800, color:"#64748b" }}>
                {sansDonnee} en attente de données
              </div>
              <div style={{ fontSize:11.5, color:"#94a3b8", marginTop:3 }}>
                La source existe, elle n'a pas encore été alimentée — ce n'est pas un zéro.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Les indicateurs, par domaine ── */}
      {visibles.map((g) => {
        const cartes = g.codes.map((c) => parCode[c]).filter(Boolean);
        if (!cartes.length) return null;
        return (
          <section key={g.cle} style={{ marginBottom:30 }}>
            <div style={{ display:"flex", alignItems:"baseline", gap:10, marginBottom:12, flexWrap:"wrap" }}>
              <h3 style={{ margin:0, fontSize:14.5, fontWeight:800, color:"#0f172a" }}>{g.titre}</h3>
              <span style={{ fontSize:11.5, color:"#94a3b8" }}>{g.sous}</span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(258px,1fr))", gap:14, alignItems:"stretch" }}>
              {cartes.map((k) => <CarteKPI key={k.code} k={k} accent={accent} />)}
            </div>
          </section>
        );
      })}

      {/* ── Les angles morts, assumés ── */}
      <div style={{ background:"#0F172A", borderRadius:14, padding:"18px 22px", color:"#fff" }}>
        <div style={{ fontSize:13.5, fontWeight:800, marginBottom:4 }}>
          {data.non_couverts.total} indicateurs du référentiel ne sont pas affichés ici
        </div>
        <div style={{ fontSize:11.5, color:"rgba(255,255,255,.65)", marginBottom:13, lineHeight:1.6, maxWidth:"70ch" }}>
          Ils n'ont pas de source alimentée. Les publier à côté des précédents ferait cohabiter
          des chiffres justes et des cases vides sans que rien ne les distingue — et c'est ainsi
          qu'on cesse de croire à un tableau de bord.
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))", gap:10 }}>
          {data.non_couverts.raisons.map((r) => (
            <div key={r.motif} style={{ background:"rgba(255,255,255,.06)", borderRadius:9, padding:"11px 13px" }}>
              <div style={{ fontSize:20, fontWeight:800, lineHeight:1 }}>{r.nb}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,.7)", marginTop:5, lineHeight:1.5 }}>{r.motif}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
