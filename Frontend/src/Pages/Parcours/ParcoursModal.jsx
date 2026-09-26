import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { supabase } from "../../config/supabase";
import PromosBanner from "../Components/PromosBanner/PromosBanner";
import { payerAvecTouchPoint, parsePrixFCFA, calcMontantReduit } from "../../utils/touchpoint";
import { ga4 } from "../../utils/ga4";

const API                   = process.env.REACT_APP_API_URL || "http://localhost:5001";
const CENTRES_MASTER_KEY    = "bet_centres_master";
const LS_OFFRES_EN_LIGNE_KEY = "bet_offres_en_ligne";
const DEFAULT_BROCHURE_URL = "https://pdfobject.com/pdf/sample.pdf";
const F                  = "'Montserrat', 'Segoe UI', sans-serif";
const BET_BLUE           = "#0891b2";
const BET_DARK           = "#011451";
const BET_NAVY           = "#0c33ac";
const JOURS_SEMAINE      = ["lundi","mardi","mercredi","jeudi","vendredi"];
const JOURS_WEEKEND      = ["samedi","dimanche"];
const JOURS_COURT        = { lundi:"Lun", mardi:"Mar", mercredi:"Mer", jeudi:"Jeu", vendredi:"Ven", samedi:"Sam", dimanche:"Dim" };

// Coordonnées des principales villes de Côte d'Ivoire (pour le tri par distance)
const CITY_COORDS = {
  "abidjan":      { lat: 5.3364, lng: -4.0267 },
  "bouake":       { lat: 7.6897, lng: -5.0304 },
  "bouaké":       { lat: 7.6897, lng: -5.0304 },
  "yamoussoukro": { lat: 6.8206, lng: -5.2768 },
  "san-pedro":    { lat: 4.7491, lng: -6.6350 },
  "san pedro":    { lat: 4.7491, lng: -6.6350 },
  "korhogo":      { lat: 9.4500, lng: -5.6333 },
  "daloa":        { lat: 6.8742, lng: -6.4502 },
  "man":          { lat: 7.4122, lng: -7.5547 },
};

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getCentreCoords(centre, master) {
  if (master?.lat && master?.lng) return { lat: master.lat, lng: master.lng };
  const ville = (centre.ville || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const [key, coords] of Object.entries(CITY_COORDS)) {
    if (ville.includes(key) || key.includes(ville)) return coords;
  }
  return null;
}

if (!document.querySelector("#pm-styles")) {
  const s = document.createElement("style");
  s.id = "pm-styles";
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');
    @keyframes pmFU   { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
    @keyframes pmSpin { to{transform:rotate(360deg)} }
    @keyframes pmIn   { from{opacity:0;transform:scale(.96)} to{opacity:1;transform:scale(1)} }
    @keyframes pmSlide { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
    .pm-overlay { position:fixed;inset:0;background:rgba(10,20,50,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px); }
    .pm-box { background:#fff;border-radius:24px;width:100%;max-width:660px;max-height:92vh;overflow-y:auto;box-shadow:0 32px 80px rgba(0,0,0,.28);animation:pmIn .25s ease; }
    .pm-card:hover { transform:translateY(-4px)!important;box-shadow:0 16px 40px rgba(0,0,0,.12)!important; }
    .pm-assist-card:hover { border-color:#0891b2!important;box-shadow:0 8px 24px rgba(8,145,178,.12)!important;transform:translateY(-3px)!important; }
    .pm-card-dom:hover { border-color:#059669!important;transform:translateY(-4px)!important; }
    .pm-centre-grid { display:grid;grid-template-columns:1fr 1fr;gap:12px; }
    @media(max-width:540px){ .pm-grid2{grid-template-columns:1fr!important;} .pm-grid3{grid-template-columns:1fr!important;} .pm-assist-grid{grid-template-columns:1fr!important;} .pm-centre-grid{grid-template-columns:1fr!important;} .pm-pack-grid{grid-template-columns:1fr!important;} .pm-overlay{align-items:flex-start!important;overflow-y:auto!important;padding-top:16px!important;padding-bottom:16px!important;} }
  `;
  document.head.appendChild(s);
}

/* ── Step dots ── */
function StepDots({ current, total }) {
  return (
    <div style={{ display:"flex", gap:6, justifyContent:"center", marginBottom:24 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ width: i === current ? 22 : 8, height:8, borderRadius:999,
          background: i < current ? "#22c55e" : i === current ? BET_BLUE : "#e2e8f0",
          transition:"all .3s" }} />
      ))}
    </div>
  );
}

/* ── Avatar ── */
function Avatar({ a, size = 52, border = false, color = BET_NAVY }) {
  if (!a) return null;
  const ini = `${a.prenom?.[0]||""}${a.nom?.[0]||""}`.toUpperCase();
  const style = {
    width:size, height:size, borderRadius:"50%", objectFit:"cover", flexShrink:0,
    ...(border ? { border:`2px solid #fff`, boxSizing:"border-box" } : {}),
  };
  const src = a.photo_url || a.avatar_url || null;
  return src
    ? <img src={src} alt={a.prenom} style={style} />
    : <div style={{ ...style, background:`linear-gradient(135deg,${color},${BET_BLUE})`, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:Math.max(10, size*.3), fontFamily:F }}>
        {ini||"?"}
      </div>;
}

/* ── Stacked avatars ── */
function AvatarStack({ assistantes = [], size = 30, max = 4, color }) {
  const shown   = assistantes.slice(0, max);
  const surplus = assistantes.length - max;
  return (
    <div style={{ display:"flex", alignItems:"center" }}>
      {shown.map((a, i) => (
        <div key={a.id} title={`${a.prenom} ${a.nom}`}
          style={{ marginLeft: i === 0 ? 0 : -(size * 0.3), zIndex: shown.length - i, position:"relative" }}>
          <Avatar a={a} size={size} border color={color} />
        </div>
      ))}
      {surplus > 0 && (
        <div style={{ marginLeft:-(size * 0.3), width:size, height:size, borderRadius:"50%",
          background:"#f1f5f9", border:"2px solid #fff", display:"flex", alignItems:"center",
          justifyContent:"center", fontSize:size * .28, fontWeight:800, color:"#64748b", zIndex:0, flexShrink:0 }}>
          +{surplus}
        </div>
      )}
    </div>
  );
}

/* ── Jours pills ── */
function JoursPills({ jours }) {
  const list = jours || JOURS_SEMAINE;
  return (
    <div style={{ display:"flex", gap:3, justifyContent:"center", flexWrap:"wrap" }}>
      {list.map(j => (
        <span key={j} style={{ fontSize:".58rem", fontWeight:800, padding:"2px 6px", borderRadius:4,
          background: JOURS_WEEKEND.includes(j) ? "#fef3c7" : "#eef1ff",
          color:      JOURS_WEEKEND.includes(j) ? "#92400e" : "#0c33ac" }}>
          {JOURS_COURT[j] || j}
        </span>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MODAL PRINCIPAL
════════════════════════════════════════════════════════ */
export default function ParcoursModal({ isOpen, onClose, user: userProp = null, defaultMode = null }) {
  const navigate = useNavigate();

  // ── Auth
  const [sbUser, setSbUser] = useState(userProp);

  // ── Wizard
  const getInitialStep = (m) => m === "domicile" ? 6 : m === "presentiel" ? "p1" : m === "en_ligne" ? 1 : 0;
  const [step,         setStep]         = useState(getInitialStep(defaultMode));
  const [modeCours,    setModeCours]    = useState(defaultMode);
  const [typeCoaching, setTypeCoaching] = useState(null);
  const [centreChoisi, setCentreChoisi] = useState(null);
  const [offreChoisie, setOffreChoisie] = useState(null);   // offre sélectionnée dans p1
  /* L'offre sur laquelle on vient de cliquer. `offreChoisie` ne suffisait pas : elle est
     posée puis l'écran change aussitôt, si bien que rien ne marquait jamais la carte -
     le clic paraissait sans effet, et l'on croyait avoir sauté une étape. Ce second état
     survit à l'aller-retour réseau qui suit, le temps que la sélection se voie. */
  const [offreEnCours, setOffreEnCours] = useState(null);
  const [assistante,   setAssistante]   = useState(null);
  const [assistantes,  setAssistantes]  = useState([]);
  const [centres,      setCentres]      = useState([]);
  const [centresMaster, setCentresMaster] = useState([]);
  const [centreAssistantesMap, setCentreAssistantesMap] = useState({}); // centreId → assistantes[]
  const [selectedCentreCard,   setSelectedCentreCard]   = useState(null); // carte ouverte en p1
  const [userCoords,           setUserCoords]           = useState(null); // { lat, lng }
  const [geoStatus,            setGeoStatus]            = useState("idle"); // idle | loading | ok | denied
  const [offresEnLigne, setOffresEnLigne] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [erreur,       setErreur]       = useState("");
  const [form,         setForm]         = useState({ nom:"", email:"", telephone:"" });
  const [formErrors,   setFormErrors]   = useState({});
  const [submitting,   setSubmitting]   = useState(false);
  const [modePaiement] = useState("mobile_money"); // sélecteur retiré - un seul mode réellement utilisé (TouchPoint)
  const [paiementDomicile, setPaiementDomicile] = useState(false);

  // ── Assignation déjà existante : sert uniquement à réutiliser automatiquement
  // la même assistante pour un type de service déjà assigné (pas à bloquer l'achat
  // d'une offre supplémentaire - l'utilisateur doit toujours pouvoir choisir une offre).
  const [assignationExistante, setAssignationExistante] = useState(null);

  /* Auth inline (step 2.5) */
  const [authTab,    setAuthTab]    = useState("login");
  const [authFormPm, setAuthFormPm] = useState({ email:"", password:"", prenom:"", nom:"", telephone:"" });
  const [authLoadPm, setAuthLoadPm] = useState(false);
  const [authErrPm,  setAuthErrPm]  = useState("");

  /* Code promo */
  const [codePromo,        setCodePromo]        = useState("");
  const [codePromoApplied, setCodePromoApplied] = useState(null);
  const [codePromoLoading, setCodePromoLoading] = useState(false);
  const [codePromoError,   setCodePromoError]   = useState("");
  const [zoneForm,     setZoneForm]     = useState("");
  const [disponForm,   setDisponForm]   = useState([]); // [{jour, debut}]
  const [packChoix,    setPackChoix]    = useState("classique");
  const [lieuChoix,    setLieuChoix]    = useState("cabinet");
  const GRILLE_PRIVE_PM_DEFAULT = {
    classique: { label:"Classique", frequence:"3 séances de 2h / semaine", cabinet:150000, domicile:200000, en_ligne:120000 },
    intensive:  { label:"Intensive",  frequence:"5 séances / semaine",       cabinet:200000, domicile:300000, en_ligne:160000 },
  };
  const [grillePrivePM, setGrillePrivePM] = useState(GRILLE_PRIVE_PM_DEFAULT);

  /* ── FORMULES DE GROUPE ───────────────────────────────────────────────────
     Les formules appartiennent à L'OFFRE (`formules_actif` + `formules`), lues par
     `listeFormulesGroupe` plus bas. L'ancienne grille globale `groupe_config` a été retirée
     du SuperAdmin et n'est plus chargée ici : deux formations d'une même adresse peuvent
     avoir des rythmes et des tarifs distincts, ce qu'une grille commune ne savait pas dire. */
  const [formuleGroupe,  setFormuleGroupe]  = useState(null);   // id de la formule de l'offre
  useEffect(() => {
    supabase.from("plateforme_config").select("valeur").eq("key","coaching_prive_config").maybeSingle()
      .then(({data,error})=>{
        if(!error && data?.valeur && typeof data.valeur==="object"){
          const v=data.valeur; const merged={...GRILLE_PRIVE_PM_DEFAULT};
          Object.keys(v).forEach(k=>{ merged[k]={...(GRILLE_PRIVE_PM_DEFAULT[k]||{}), ...v[k]}; });
          setGrillePrivePM(merged);
        }
      });
  },[]); // eslint-disable-line

  const JOURS_ORDER = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
  const toggleDispoJour = (jour) =>
    setDisponForm(prev => {
      const exists = prev.some(d => d.jour === jour);
      if (exists) return prev.filter(d => d.jour !== jour);
      const next = [...prev, { jour, debut: "08:00" }];
      return next.sort((a,b) => JOURS_ORDER.indexOf(a.jour) - JOURS_ORDER.indexOf(b.jour));
    });
  const setDispoDebut = (jour, debut) =>
    setDisponForm(prev => prev.map(d => d.jour === jour ? {...d, debut} : d));

  // ── Auth check + live tracking
  useEffect(() => {
    if (userProp) { setSbUser(userProp); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSbUser(session?.user || null);
      if (session?.user) prefillForm(session.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSbUser(session?.user || null);
      if (session?.user) prefillForm(session.user);
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProp]);

  // ── Vérifier si une assignation existe déjà pour cet utilisateur - sert à
  // réutiliser automatiquement la même assistante (jamais à bloquer l'achat
  // d'une offre). Métadonnée en priorité, DB en fallback si absente.
  useEffect(() => {
    if (!isOpen || !sbUser) { setAssignationExistante(null); return; }
    const metaAssignation = sbUser.user_metadata?.parcours_assignation;
    if (metaAssignation) { setAssignationExistante(metaAssignation); return; }
    if (!sbUser.email) return;
    fetch(`${API}/api/parcours/mon-assignation?email=${encodeURIComponent(sbUser.email)}`)
      .then(r => r.json())
      .then(d => { if (d.assignation) setAssignationExistante(d.assignation); })
      .catch(() => {});
  }, [isOpen, sbUser]);

  // ── Load centres + centresMaster + offres en ligne
  useEffect(() => {
    if (!isOpen) return;
    fetch(`${API}/api/parcours/centres`).then(r => r.json()).then(d => setCentres(d.centres || [])).catch(() => {});
    // centresMaster : localStorage d'abord, puis sync Supabase
    try {
      const s = localStorage.getItem(CENTRES_MASTER_KEY);
      if (s) setCentresMaster(JSON.parse(s).filter(c => c.actif !== false));
    } catch {}
    supabase.from("plateforme_config").select("valeur").eq("key","centres_master").maybeSingle()
      .then(({ data, error }) => {
        if (!error && Array.isArray(data?.valeur) && data.valeur.length) {
          // Patch type_coaching manquant sur les offres (pour les données sauvegardées sans ce champ)
          const KNOWN_TYPES = { cours_groupe:"groupe", cours_prives:"prive", toeic_prep:"groupe", ielts_prep:"groupe", toefl_prep:"groupe", enfants:"groupe", entreprise:"groupe" };
          const patched = data.valeur.map(centre => ({
            ...centre,
            offres: (centre.offres || []).map(o => o.type_coaching ? o : { ...o, type_coaching: KNOWN_TYPES[o.id] || ((() => {
              const l = (o.label||"").toLowerCase();
              if (l.includes("priv") || l.includes("particulier")) return "prive";
              return "groupe";
            })()) }),
          }));
          localStorage.setItem(CENTRES_MASTER_KEY, JSON.stringify(patched));
          setCentresMaster(patched.filter(c => c.actif !== false));
        }
      });
    // Offres en ligne : localStorage d'abord, puis sync Supabase
    try {
      const s = localStorage.getItem(LS_OFFRES_EN_LIGNE_KEY);
      if (s) setOffresEnLigne(JSON.parse(s).filter(o => o.actif !== false));
    } catch {}
    supabase.from("plateforme_config").select("valeur").eq("key","offres_en_ligne").maybeSingle()
      .then(({ data, error }) => {
        if (!error && Array.isArray(data?.valeur) && data.valeur.length) {
          localStorage.setItem(LS_OFFRES_EN_LIGNE_KEY, JSON.stringify(data.valeur));
          setOffresEnLigne(data.valeur.filter(o => o.actif !== false));
        }
      });
  }, [isOpen]);

  // ── Pré-charger les assistantes de tous les centres (pour les photos dans les cartes)
  useEffect(() => {
    if (!isOpen || centres.length === 0) return;
    Promise.all(
      centres.map(async c => {
        try {
          const r = await fetch(`${API}/api/parcours/assistantes-presentiel/${c.id}?tous=true`);
          const d = await r.json();
          return { id: c.id, assistantes: d.assistantes || [] };
        } catch { return { id: c.id, assistantes: [] }; }
      })
    ).then(results => {
      const map = {};
      results.forEach(({ id, assistantes }) => { map[id] = assistantes; });
      setCentreAssistantesMap(map);
    });
  }, [isOpen, centres]);

  // ── Géolocalisation pour le tri des centres
  useEffect(() => {
    if (step !== "p1" || geoStatus !== "idle") return;
    if (!navigator.geolocation) { setGeoStatus("denied"); return; }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      pos => { setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoStatus("ok"); },
      ()   => setGeoStatus("denied"),
      { timeout: 6000 }
    );
  }, [step, geoStatus]);

  // ── Find master data for a centre (name match)
  const findMaster = useCallback((centre) => {
    const norm = s => (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/^bet\s+/,"").trim();
    const cn = norm(centre.nom);
    return centresMaster.find(m => norm(m.name) === cn) ||
           centresMaster.find(m => norm(m.name).includes(cn) || cn.includes(norm(m.name)));
  }, [centresMaster]);

  // ── Reset
  const resetPresentiel = () => {
    setCentreChoisi(null); setOffreChoisie(null); setOffreEnCours(null); setFormuleGroupe(null);
    setAssistante(null); setAssistantes([]);
    setSelectedCentreCard(null);
    setErreur("");
  };

  const handleClose = useCallback(() => {
    setStep(getInitialStep(defaultMode)); setModeCours(defaultMode);
    setTypeCoaching(null); setCentreChoisi(null); setOffreChoisie(null); setOffreEnCours(null); setFormuleGroupe(null);
    setAssistante(null); setAssistantes([]); setSelectedCentreCard(null);
    setZoneForm(""); setDisponForm([]);
    setErreur(""); setForm({ nom:"", email:"", telephone:"" }); setFormErrors({});
    onClose();
  }, [onClose, defaultMode]);

  const prefillForm = useCallback((u) => {
    if (!u) return;
    const meta = u.user_metadata || {};
    const nom = (meta.nom && meta.prenom) ? `${meta.prenom} ${meta.nom}` : meta.full_name || u.email?.split("@")[0] || "";
    setForm({ nom, email: u.email || "", telephone: meta.telephone || "" });
  }, []);

  // ── Si le prospect a déjà une assistante pour CE type de service (même
  // type_cours + type_coaching, et même centre en présentiel), on la réutilise
  // automatiquement au lieu de proposer une nouvelle sélection - l'utilisateur
  // garde la liberté de choisir une offre, seule la ré-assignation est évitée.
  const findAssistanteExistante = (typeCoursVal, typeCoachingVal, centreIdVal) => {
    if (!assignationExistante?.assistante_id) return null;
    if (assignationExistante.type_cours !== typeCoursVal) return null;
    if (typeCoachingVal && assignationExistante.type_coaching !== typeCoachingVal) return null;
    if (typeCoursVal === "presentiel" && centreIdVal && assignationExistante.centre_id !== centreIdVal) return null;
    return {
      id: assignationExistante.assistante_id,
      prenom: assignationExistante.assistante_prenom,
      nom: assignationExistante.assistante_nom,
      photo_url: assignationExistante.assistante_photo,
      telephone: assignationExistante.assistante_tel,
    };
  };

  // ── Choisir mode
  const choisirMode = (mode) => {
    setModeCours(mode); resetPresentiel(); setTypeCoaching(null); setZoneForm(""); setDisponForm([]);
    if (mode === "domicile") {
      // Domicile = toujours du coaching privé - même parcours que "coaching privé en ligne" :
      // le client choisit d'abord son assistante avant de renseigner ses disponibilités.
      setTypeCoaching("prive");
      setAssistantes([]); setAssistante(null); setErreur("");
      const existingAst = findAssistanteExistante("domicile", "prive", null);
      if (existingAst) { choisirAssistante(existingAst); return; }
      setLoading(true);
      // Domicile = un coach se déplace physiquement chez le client : géré par les
      // assistantes présentielles (comme le coaching privé au cabinet), jamais par
      // le pool en ligne - d'où l'endpoint dédié /assistantes-domicile.
      fetch(`${API}/api/parcours/assistantes-domicile`)
        .then(r => r.json())
        .then(d => { setAssistantes(d.assistantes || []); setStep(2); })
        .catch(e => setErreur(e.message))
        .finally(() => setLoading(false));
    }
    else if (mode === "presentiel") setStep("p1");
    else setStep(1);
  };

  // ── Offre en ligne sélectionnée
  const choisirOffreEnLigne = async (offre) => {
    if (loading) return;   // deux clics rapides lançaient deux chargements concurrents
    const tc = inferTypeCoaching(offre); // lit type_coaching du champ config (pas du label)
    setOffreEnCours(offre.id || offre.label);
    setOffreChoisie(offre);
    setTypeCoaching(tc);
    ga4.offreChoisie({ offre: offre.label, type_coaching: tc, canal: "en_ligne", prix: parsePrixFCFA(offre.prix) });
    setAssistantes([]); setAssistante(null); setErreur("");

    // Lieu fixé à "en ligne" - choisi via ce catalogue en ligne, donc livré en ligne, point.
    if (tc === "prive") setLieuChoix("en_ligne");

    /* LA FORMULE D'ABORD, l'assistante ensuite. On choisit ce qu'on achète avant de
       choisir à qui l'on parle - et le tarif exact est connu avant d'engager quiconque. */
    if (tc === "groupe" && listeFormulesGroupe("en_ligne", null, offre).length > 0) {
      setFormuleGroupe(null);
      setStep(7);
      return;
    }
    await allerAuxAssistantesEnLigne(tc);
  };

  /* Le choix de l'assistante, extrait pour être atteignable depuis deux endroits : juste
     après l'offre (groupe sans formule, ou coaching privé) et après l'étape des formules. */
  const allerAuxAssistantesEnLigne = async (tc = typeCoaching) => {
    // Coaching privé OU groupe : même parcours - le client choisit son assistante (qui
    // reçoit le dossier et le transmet ensuite au PA), au lieu d'être envoyé anonymement.
    const existingAst = findAssistanteExistante("en_ligne", tc, null);
    if (existingAst) { choisirAssistante(existingAst); return; }

    setLoading(true);
    try {
      const r = await fetch(`${API}/api/parcours/assistantes-ligne?profil=b2c`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      setAssistantes(d.assistantes || []);
      setStep(2);
    } catch (e) { setErreur(e.message); }
    finally { setLoading(false); }
  };

  // ── Auto-progression quand l'user se connecte depuis l'auth gate (step 2.5)
  useEffect(() => {
    if (step === 2.5 && sbUser) {
      prefillForm(sbUser);
      // Coaching privé (tous canaux, assistante déjà choisie via choisirAssistante) → étape
      // pack/modalités partagée (step 6).
      if (typeCoaching === "prive") setStep(6);
      else if (modeCours === "presentiel") setStep("p4");
      else setStep(typeCoaching === "groupe" ? 3.5 : 3);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sbUser, step]);

  // ── Ouvrir/fermer une carte centre
  const toggleCentreCard = (centreId) => {
    if (selectedCentreCard === centreId) {
      setSelectedCentreCard(null);
    } else {
      setSelectedCentreCard(centreId);
      setOffreChoisie(null); // reset offre quand on change de centre setOffreEnCours(null);
    }
  };

  // Lit le type de coaching depuis la config (champ type_coaching) avec fallback string-matching
  /* Les formules de groupe réellement proposables, selon le canal.
     Présentiel : celles du centre choisi (`groupePresentiel`), car les tarifs varient d'un
     cabinet à l'autre. En ligne : la grille globale. Une liste vide n'est pas une erreur -
     un centre peut n'avoir rien renseigné, et l'étape est alors sautée plutôt que d'afficher
     un écran sans choix. */
  /* Fonction et non seulement mémo : la décision d'afficher l'étape se prend DANS le
     gestionnaire de clic, avant que React n'ait recalculé quoi que ce soit. Un mémo lu à
     cet instant renverrait encore la valeur de l'état précédent. */
  const listeFormulesGroupe = useCallback((mode, centre, offre = null) => {
    /* LA FORMULE APPARTIENT À L'OFFRE, en présentiel comme en ligne - et son interrupteur
       commande. Une même adresse vend un cours à tarif unique et un autre à trois rythmes :
       rattacher les formules au centre ne permettait pas de les distinguer. */
    const o = offre || offreChoisie;
    if (o?.formules_actif !== true) return [];
    return (o.formules || [])
      .map(f => ({ id: f.id, label: f.label, frequence: f.frequence, tarif: Number(f.tarif) || 0 }))
      .filter(f => f.tarif > 0 && f.label);
  }, [offreChoisie]); // eslint-disable-line

  const formulesGroupe = useMemo(
    () => (typeCoaching === "groupe" ? listeFormulesGroupe(modeCours, centreChoisi) : []),
    [typeCoaching, modeCours, centreChoisi, listeFormulesGroupe]
  );

  /* La grille privée effective, dans l'ordre de priorité :
       1. les formules portées par L'OFFRE choisie, si son interrupteur est allumé ;
       2. la grille du centre, si elle est activée ;
       3. la grille globale.
     Le premier niveau est nouveau : il permet à deux offres privées d'une même adresse
     d'avoir des rythmes et des tarifs différents, ce que la grille du centre ne savait
     pas exprimer. Les deux suivants existaient déjà et restent le repli. */
  const formulesPriveDeLOffre = useMemo(() => {
    const o = offreChoisie;
    if (o?.formules_actif !== true) return null;
    const liste = (o.formules || []).filter(f => f.label && (Number(f.tarif) > 0 || Number(f.tarif_domicile) > 0));
    if (!liste.length) return null;
    // Même forme que la grille globale : { cle: { label, frequence, cabinet, domicile, en_ligne } }
    return Object.fromEntries(liste.map(f => [f.id || f.label, {
      label:     f.label,
      frequence: f.frequence || "",
      cabinet:   Number(f.tarif) || 0,
      en_ligne:  Number(f.tarif) || 0,
      domicile:  Number(f.tarif_domicile) || Number(f.tarif) || 0,
    }]));
  }, [offreChoisie]);

  useEffect(() => {
    if (!formulesPriveDeLOffre) return;
    const cles = Object.keys(formulesPriveDeLOffre);
    // Le défaut « classique » n'existe pas dans une grille propre à l'offre : sans ce
    // recalage, l'étape des packs afficherait 0 F et le bouton resterait inerte.
    if (cles.length && !cles.includes(packChoix)) setPackChoix(cles[0]);
  }, [formulesPriveDeLOffre]); // eslint-disable-line

  const formuleGroupeChoisie = useMemo(
    () => formulesGroupe.find(f => f.id === formuleGroupe) || null,
    [formulesGroupe, formuleGroupe]
  );

  /* LE MONTANT DE RÉFÉRENCE - une seule source de vérité pour l'écran de confirmation ET
     pour TouchPoint. Le tarif de la formule prime toujours sur le prix d'appel de la carte :
     sans cela, un client qui choisissait « 3×/semaine » voyait et payait le prix unique de
     l'offre, et son choix de formule ne servait à rien. Le repli sur le prix de l'offre reste
     nécessaire pour les offres à tarif unique, qui n'ont pas de formules. */
  const montantReference = useMemo(
    () => formuleGroupeChoisie?.tarif || parsePrixFCFA(offreChoisie?.prix) || null,
    [formuleGroupeChoisie, offreChoisie]
  );

  const inferTypeCoaching = (offre) => {
    if (!offre) return null;
    if (offre.type_coaching) return offre.type_coaching;
    const KNOWN = { cours_groupe:"groupe", cours_prives:"prive", toeic_prep:"groupe", ielts_prep:"groupe", toefl_prep:"groupe", enfants:"groupe", entreprise:"groupe" };
    if (offre.id && KNOWN[offre.id]) return KNOWN[offre.id];
    const l = (offre.label || "").toLowerCase();
    if (l.includes("groupe") || l.includes("group")) return "groupe";
    if (l.includes("priv") || l.includes("particulier") || l.includes("individu")) return "prive";
    return null;
  };

  // ── Confirmer le centre + offre → p2 (ou step 6 si coaching privé)
  const confirmerCentre = (centre) => {
    setCentreChoisi(centre);
    setAssistantes(centreAssistantesMap[centre.id] || []);
    const tc = offreChoisie ? inferTypeCoaching(offreChoisie) : typeCoaching;
    if (offreChoisie) setTypeCoaching(tc);
    // Lieu fixé à "cabinet" - le centre a déjà été choisi juste avant, jamais de choix domicile/en_ligne ici.
    if (tc === "prive") setLieuChoix("cabinet");
    // La formule avant l'assistante - et après le centre, car les tarifs en dépendent.
    if (tc === "groupe" && listeFormulesGroupe("presentiel", centre).length > 0) {
      setFormuleGroupe(null);
      setStep(7);
      return;
    }
    // Déjà une assistante présentiel assignée pour ce même centre → on la réutilise
    const existingAst = findAssistanteExistante("presentiel", tc, centre.id);
    if (existingAst) { choisirAssistante(existingAst); return; }
    setStep("p2");
  };

  // ── Choisir assistante
  const choisirAssistante = (a) => {
    setAssistante(a);
    if (!sbUser) { setStep(2.5); return; }
    prefillForm(sbUser);
    // Coaching privé (tous canaux) → étape pack/modalités partagée (step 6), l'assistante
    // choisie ici est celle qui reçoit le dossier et le transmet ensuite au PA.
    if (typeCoaching === "prive") { setStep(6); return; }
    if (modeCours === "presentiel") setStep("p4");
    else setStep(typeCoaching === "groupe" ? 3.5 : 3);
  };

  // ── Validation
  const validateForm = () => {
    const errors = {};
    const isCoachingPriveEnLigne    = modeCours === "en_ligne"    && typeCoaching === "prive";
    const isCoachingPrivePresentiel = modeCours === "presentiel"  && typeCoaching === "prive";
    if (!form.nom.trim()) errors.nom = "Requis";
    if (!form.telephone.trim()) errors.telephone = "Requis";
    // Zone requise si cours à domicile OU si lieu sélectionné = "domicile" pour un cours privé
    const needsZone = modeCours === "domicile" || ((isCoachingPriveEnLigne || isCoachingPrivePresentiel) && lieuChoix === "domicile");
    if (needsZone && !zoneForm.trim()) errors.zone = "Requis";
    if (isCoachingPriveEnLigne && lieuChoix === "cabinet" && !centreChoisi) errors.centre = "Choisissez un cabinet";
    if ((modeCours === "domicile" || isCoachingPriveEnLigne || isCoachingPrivePresentiel) && !disponForm.length) errors.dispos = "Sélectionnez au moins un jour";
    setFormErrors(errors);
    return !Object.keys(errors).length;
  };

  // ── Valider code promo
  const validerCodePromo = async (offreType, centreId, codeOverride) => {
    const code = (codeOverride || codePromo).trim().toUpperCase();
    if (!code) return;
    setCodePromoLoading(true);
    setCodePromoError("");
    setCodePromoApplied(null);
    try {
      const token = localStorage.getItem("bet_token") || localStorage.getItem("admin_token") || "";
      const r = await fetch(`${API}/api/codes-promo/valider`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ code, offre_type: offreType, centre_id: centreId || undefined }),
      });
      const d = await r.json();
      if (!r.ok) { setCodePromoError(d.error || "Code invalide"); return; }
      setCodePromoApplied(d);
      const reduc = d.type_reduction === "pourcentage" ? `-${d.valeur}%` : `-${Number(d.valeur).toLocaleString("fr-FR")} FCFA`;
      toast.success(`🎟️ Code ${d.code} activé - ${reduc}`);
    } catch { setCodePromoError("Impossible de vérifier le code"); }
    finally { setCodePromoLoading(false); }
  };

  const handleAuthLogin = async () => {
    if (!authFormPm.email || !authFormPm.password) return setAuthErrPm("Email et mot de passe requis.");
    setAuthLoadPm(true); setAuthErrPm("");
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authFormPm.email, password: authFormPm.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Email ou mot de passe incorrect");
      await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
    } catch (err) { setAuthErrPm(err.message); }
    finally { setAuthLoadPm(false); }
  };

  const handleAuthRegister = async () => {
    if (!authFormPm.prenom || !authFormPm.nom || !authFormPm.email || !authFormPm.password) return setAuthErrPm("Tous les champs * sont requis.");
    setAuthLoadPm(true); setAuthErrPm("");
    try {
      const res = await fetch(`${API}/api/auth/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: authFormPm.nom, prenom: authFormPm.prenom, email: authFormPm.email, telephone: authFormPm.telephone, password: authFormPm.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'inscription");
      const { error } = await supabase.auth.signInWithPassword({ email: authFormPm.email, password: authFormPm.password });
      if (error) throw new Error(error.message);
    } catch (err) { setAuthErrPm(err.message); }
    finally { setAuthLoadPm(false); }
  };

  // ── Submit assignation
  const submitAssignation = async () => {
    if (!validateForm()) return;
    setSubmitting(true); setErreur("");
    try {
      const r = await fetch(`${API}/api/parcours/assignation`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          assistante_id:      assistante.id,
          prospect_nom:       form.nom.trim(),
          prospect_email:     form.email.trim() || undefined,
          prospect_telephone: form.telephone.trim(),
          type_cours:         modeCours,
          type_coaching:      typeCoaching || undefined,
          centre_id:          centreChoisi?.id || undefined,
          offre_label:        offreChoisie?.label || undefined,
          source:             "formulaire_en_ligne",
          mode_paiement:      modePaiement || undefined,
          // Montant NON réduit ici volontairement : le backend revalide le code promo et
          // applique lui-même la réduction sur ce montant de référence (voir parcours.js).
          /* LE TARIF DE LA FORMULE PRIME sur le prix d'appel de l'offre. Sans cela, un
             client qui choisit « 3×/semaine » à 80 000 F était facturé au prix unique
             affiché sur la carte - le choix de formule n'aurait servi à rien. */
          montant_paye:       montantReference || undefined,
          // La formule retenue, pour que l'assistante et le PA sachent quoi planifier.
          ...(formuleGroupeChoisie ? {
            pack_coaching:       formuleGroupeChoisie.label,
            formation_souhaitee: `${offreChoisie?.label || "Coaching de groupe"} - ${formuleGroupeChoisie.label}`,
            cout_formation:      formuleGroupeChoisie.tarif,
            // L'objet complet : l'onboarding a besoin des jours et des horaires pour
            // choisir la classe, pas seulement du nom de la formule.
            formule_groupe: {
              id:        formuleGroupeChoisie.id,
              label:     formuleGroupeChoisie.label,
              frequence: formuleGroupeChoisie.frequence,
              tarif:     formuleGroupeChoisie.tarif,
              canal:     modeCours === "presentiel" ? "presentiel" : "en_ligne",
            },
          } : {}),
          code_promo:         codePromoApplied?.code || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      ga4.leadEnvoye({ canal: modeCours, type_coaching: typeCoaching, offre: offreChoisie?.label });
      if (sbUser) {
        await supabase.auth.updateUser({ data: { parcours_assignation: {
          assignation_id: d.assignation?.id || null,
          assistante_id: assistante.id, assistante_prenom: assistante.prenom,
          assistante_nom: assistante.nom, assistante_photo: assistante.photo_url || null,
          assistante_tel: assistante.telephone || null, type_cours: modeCours,
          type_coaching: typeCoaching || null, centre_id: centreChoisi?.id || null,
          centre_nom: centreChoisi?.nom || null, offre: offreChoisie?.label || null,
          date: new Date().toISOString(),
        }}});
      }

      // Paiement immédiat TouchPoint si un montant chiffré est disponible pour
      // l'offre choisie (sinon - "Sur devis" - on garde le flow historique :
      // demande envoyée, paiement géré plus tard par la commerciale). Réduction du code
      // promo déjà validé appliquée ici - sinon TouchPoint facturait le plein tarif alors
      // que la réduction n'était qu'affichée.
      /* Le tarif de la formule, et non le prix d'appel de l'offre : c'est ce que le client a
         vu sur l'écran de confirmation, c'est ce qu'il doit payer. Une offre « Sur devis »
         dotée de formules chiffrées déclenche donc bien le paiement, là où elle l'ignorait. */
      const montantPaiement = calcMontantReduit(montantReference, codePromoApplied);
      if ((modePaiement === "mobile_money" || modePaiement === "carte_bancaire") && montantPaiement) {
        ga4.paiementLance({ montant: montantPaiement, offre: offreChoisie?.label, canal: modeCours });
        await payerAvecTouchPoint({
          clientInfo:    { nom: form.nom.trim(), email: form.email.trim(), telephone: form.telephone.trim() },
          montant:       montantPaiement,
          offreLabel:    offreChoisie?.label,
          assignationId: d.assignation?.id,
          assistanteId:  assistante.id,
        });
        return; // redirection vers la page de paiement TouchPoint en cours
      }
      setStep(4);
    } catch (e) { setErreur(e.message); }
    finally { setSubmitting(false); }
  };

  // ── Submit domicile OU coaching privé en ligne OU coaching privé présentiel (step 6 partagé)
  const submitDomicile = async () => {
    if (!validateForm()) return;
    setSubmitting(true); setErreur("");
    const isCoachingPriveEnLigne    = modeCours === "en_ligne"   && typeCoaching === "prive";
    const isCoachingPrivePresentiel = modeCours === "presentiel" && typeCoaching === "prive";
    try {
      const disponStr = disponForm.map(h => `${h.jour} ${h.debut}`).join(", ");
      const notesParts = [];
      if (!isCoachingPriveEnLigne && !isCoachingPrivePresentiel && zoneForm) notesParts.push(`Zone : ${zoneForm}`);
      if (disponStr) notesParts.push(`Disponibilités : ${disponStr}`);
      const notes = notesParts.join(" | ");

      // Prix RÉEL du pack choisi (Classique/Intensive × lieu, avec grille spécifique au
      // centre si elle existe) - indispensable pour que le montant dû pré-rempli côté
      // assistante (paiements) corresponde à ce que le client a effectivement vu/choisi,
      // au lieu du prix générique du catalogue ("Cours privés - 50 000 F/mois").
      const centreMasterChoisi = isCoachingPrivePresentiel && centreChoisi ? findMaster(centreChoisi) : null;
      const grillePriveeActive = formulesPriveDeLOffre
        || (centreMasterChoisi?.grilleTarifaire?.coachingPrive?.actif
        ? { classique: centreMasterChoisi.grilleTarifaire.coachingPrive.classique, intensive: centreMasterChoisi.grilleTarifaire.coachingPrive.intensive }
        : grillePrivePM);
      const effectiveLieu = modeCours === "domicile" ? "domicile" : lieuChoix;
      const prixChoisi = grillePriveeActive[packChoix]?.[effectiveLieu] || grillePriveeActive[packChoix]?.cabinet || null;

      const packLabel = grillePrivePM[packChoix]?.label || packChoix;
      const lieuLabel = lieuChoix === "en_ligne" ? "En ligne" : lieuChoix === "cabinet" ? "Au cabinet" : "À domicile";
      const offreTitre = isCoachingPriveEnLigne
        ? `Coaching Privé En Ligne${offreChoisie?.label ? " - " + offreChoisie.label : ""} | Pack ${packLabel} · ${lieuLabel}${notes ? " | " + notes : ""}`
        : isCoachingPrivePresentiel
          ? `Coaching Privé Présentiel - ${centreChoisi?.nom || ""}${offreChoisie?.label ? " - " + offreChoisie.label : ""} | Pack ${packLabel} · ${lieuLabel}${notes ? " | " + notes : ""}`
          : `Cours à domicile${notes ? " - " + notes : ""}`;

      // Étape 1 : inscription dans la table (non-bloquante)
      try {
        await fetch(`${API}/api/inscriptions/adulte/submit`, {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            nom_complet:  form.nom.trim(),
            email:        form.email.trim() || null,
            telephone:    form.telephone.trim(),
            offre_titre:  offreTitre,
            statut:       "nouveau",
          }),
        });
      } catch(_) {}

      // Étape 2 : assignation à l'assistante déjà choisie par le client (via
      // choisirAssistante, avant d'arriver à cette étape) - c'est elle qui reçoit le
      // dossier et le transmet ensuite au PA pour validation, plus de désignation
      // anonyme au premier PA du pool.
      const pa = assistante;
      if (!pa) {
        throw new Error("Merci de sélectionner votre assistante avant de continuer.");
      }

      const ar = await fetch(`${API}/api/parcours/assignation`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistante_id:      pa.id,
          prospect_nom:       form.nom.trim(),
          prospect_email:     form.email.trim() || undefined,
          prospect_telephone: form.telephone.trim(),
          type_cours:         isCoachingPriveEnLigne ? "en_ligne" : isCoachingPrivePresentiel ? "presentiel" : "domicile",
          type_coaching:      "prive",
          source:             isCoachingPriveEnLigne ? "formulaire_coaching_prive_enligne" : isCoachingPrivePresentiel ? "formulaire_coaching_prive_presentiel" : "formulaire_domicile",
          centre_id:          (isCoachingPrivePresentiel || (isCoachingPriveEnLigne && lieuChoix === "cabinet")) ? centreChoisi?.id : undefined,
          notes:              notes || undefined,
          disponibilites:     disponForm.length > 0 ? { horaires: disponForm } : undefined,
          // Domicile ne passe jamais par un catalogue d'offres (offreChoisie reste vide) -
          // sans repli explicite, inscription_offre restait null en base et le dropdown
          // "Formation" du modal de paiement s'affichait vide côté assistante.
          offre_label:        offreChoisie?.label || (modeCours === "domicile" ? "Cours à domicile" : undefined),
          ...((isCoachingPriveEnLigne || isCoachingPrivePresentiel || modeCours === "domicile") ? { pack_coaching: packChoix, lieu_coaching: (isCoachingPriveEnLigne || isCoachingPrivePresentiel) ? lieuChoix : "domicile" } : {}),
          formation_souhaitee: offreChoisie?.label || (isCoachingPrivePresentiel ? "Cours privés" : isCoachingPriveEnLigne ? "Coaching Privé En Ligne" : "Cours à domicile"),
          centre_coaching:     (lieuChoix === "cabinet" && centreChoisi) ? (findMaster(centreChoisi)?.key || centreChoisi.nom) : undefined,
          adresse_coaching:    (modeCours === "domicile" || lieuChoix === "domicile") ? zoneForm || undefined : undefined,
          cout_formation:      prixChoisi || undefined,
          mode_paiement:       modePaiement || undefined,
        }),
      });
      if (!ar.ok) {
        const ad = await ar.json();
        throw new Error(ad.error || "Erreur lors de l'envoi de la demande");
      }

      const arData = await ar.json();
      if (sbUser) {
        await supabase.auth.updateUser({ data: { parcours_assignation: {
          assignation_id: arData.assignation?.id || null,
          assistante_id: pa.id, assistante_prenom: pa.prenom, assistante_nom: pa.nom,
          assistante_photo: pa.photo_url || null, assistante_tel: pa.telephone || null,
          type_cours: isCoachingPriveEnLigne ? "en_ligne" : isCoachingPrivePresentiel ? "presentiel" : "domicile",
          type_coaching: "prive", centre_id: isCoachingPrivePresentiel ? (centreChoisi?.id || null) : null,
          centre_nom: isCoachingPrivePresentiel ? (centreChoisi?.nom || null) : null,
          offre: offreChoisie?.label || null, date: new Date().toISOString(),
        }}});
      }

      // Paiement immédiat TouchPoint si un prix a bien été déterminé pour le
      // pack choisi (sinon - "Sur devis" - flow historique inchangé).
      if ((modePaiement === "mobile_money" || modePaiement === "carte_bancaire") && prixChoisi) {
        await payerAvecTouchPoint({
          clientInfo:    { nom: form.nom.trim(), email: form.email.trim(), telephone: form.telephone.trim() },
          montant:       prixChoisi,
          offreLabel:    offreTitre,
          assignationId: arData.assignation?.id,
          assistanteId:  pa.id,
        });
        return; // redirection vers la page de paiement TouchPoint en cours
      }

      setStep(4);
      setPaiementDomicile(false);
    } catch(e) { setErreur(e.message); }
    finally { setSubmitting(false); }
  };

  if (!isOpen) return null;

  // ── Step dots
  const stepDotMap = { "p1":0, "p2":1, "p4":2, 4:3 };
  const dotCurrent = stepDotMap[String(step)] ?? -1;
  const showDots   = (typeof step === "string" && step !== "2.5") || (typeof step === "number" && step >= 1 && step < 4 && step !== 2.5 && step !== 6);

  // ── Header
  const headerTitle = { 0:"Comment souhaitez-vous apprendre ?", "p1":"Choisissez votre cabinet", "p2":`Assistantes - ${centreChoisi?.nom||""}`, "p4":"Paiement & confirmation",
    1:"Choisissez votre formule", 2:"Choisissez votre assistante", 2.5:"Connexion requise",
    3:"Vos coordonnées", 3.5:"Mode de paiement", 6:"Cours à domicile / Cours privé",
    7:"Choisissez votre formule",
    4: modeCours === "domicile" ? "Demande reçue !" : "Demande envoyée !" }[String(step)] || "";

  // ── Centres triés par distance si géolocalisation disponible
  const sortedCentres = userCoords
    ? [...centres].sort((a, b) => {
        const ca = getCentreCoords(a, findMaster(a)), cb = getCentreCoords(b, findMaster(b));
        if (!ca && !cb) return 0;
        if (!ca) return 1;
        if (!cb) return -1;
        return haversine(userCoords.lat, userCoords.lng, ca.lat, ca.lng)
             - haversine(userCoords.lat, userCoords.lng, cb.lat, cb.lng);
      })
    : centres;

  return (
    <div className="pm-overlay" onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="pm-box" style={step === "p1" ? { maxWidth: 920 } : step === 1 ? { maxWidth: 780 } : undefined}>

        {/* ── Header ── */}
        <div style={{ background:`linear-gradient(135deg,${BET_DARK},${BET_NAVY})`, borderRadius:"24px 24px 0 0", padding:"20px 24px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ color:"rgba(255,255,255,.6)", fontSize:".68rem", fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", marginBottom:4 }}>
              Parcours BET{modeCours === "presentiel" && step !== 0 ? " · Présentiel" : ""}
            </div>
            <div style={{ color:"#fff", fontWeight:800, fontSize:"1rem", fontFamily:F }}>{headerTitle}</div>
          </div>
          <button onClick={handleClose} style={{ background:"rgba(255,255,255,.12)", border:"none", borderRadius:"50%", width:32, height:32, color:"#fff", fontSize:"1.1rem", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✕</button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding:"24px 24px 28px" }}>

          {showDots && step !== 4 && dotCurrent >= 0 && <StepDots current={dotCurrent} total={4} />}
          {step === 6 && <StepDots current={1} total={2} />}

          {erreur && (
            <div style={{ background:"#fff0f2", border:"1px solid #ffb3bc", borderRadius:10, padding:"10px 14px", color:"#ff2945", fontSize:".84rem", marginBottom:16 }}>⚠️ {erreur}</div>
          )}
          {loading && (
            <div style={{ textAlign:"center", padding:40 }}>
              <div style={{ width:32, height:32, border:"3px solid #e2e8f0", borderTopColor:BET_BLUE, borderRadius:"50%", animation:"pmSpin .8s linear infinite", margin:"0 auto 12px" }} />
              <p style={{ color:"#64748b", fontSize:".88rem", margin:0 }}>Chargement…</p>
            </div>
          )}

          {/* ═══ STEP 0 : mode ═══ */}
          {step === 0 && !loading && (
            <div style={{ animation:"pmFU .3s ease" }}>
              <div className="pm-grid3" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                {[
                  { mode:"en_ligne",   icon:"💻", title:"En ligne",      desc:"Coaching groupe ou privé, depuis chez vous.",          tags:["Groupe","Privé"],               color:BET_BLUE,  grad:`linear-gradient(135deg,${BET_BLUE},${BET_NAVY})` },
                  { mode:"presentiel", icon:"🏫", title:"En présentiel", desc:"Dans l'un de nos 6 cabinets en Côte d'Ivoire.",        tags:["6 centres","Abidjan & Bouaké"],  color:BET_NAVY,  grad:`linear-gradient(135deg,${BET_NAVY},${BET_BLUE})` },
                  { mode:"domicile",   icon:"🏠", title:"À domicile",    desc:"Un coach certifié se déplace chez vous. Cours privé.", tags:["Cours privé","Chez vous"],       color:"#059669", grad:"linear-gradient(135deg,#059669,#011451)" },
                ].map(o => (
                  <div key={o.mode} className={o.mode==="domicile"?"pm-card pm-card-dom":"pm-card"} onClick={() => choisirMode(o.mode)}
                    style={{ border:`2px solid ${o.mode==="domicile"?"#bbf7d0":"#e2e8f0"}`, borderRadius:16, padding:"20px 14px", cursor:"pointer", transition:"all .22s", textAlign:"center", background: o.mode==="domicile"?"#f0fdf4":"#fafafa" }}>
                    <div style={{ fontSize:"2.2rem", marginBottom:8 }}>{o.icon}</div>
                    <div style={{ fontWeight:800, color:BET_DARK, fontSize:".88rem", marginBottom:6, fontFamily:F }}>{o.title}</div>
                    <div style={{ fontSize:".73rem", color:"#475569", lineHeight:1.5, marginBottom:10 }}>{o.desc}</div>
                    <div style={{ display:"flex", gap:5, justifyContent:"center", flexWrap:"wrap", marginBottom:12 }}>
                      {o.tags.map(t => <span key={t} style={{ background:o.color+"18", color:o.color, borderRadius:999, padding:"2px 8px", fontSize:".64rem", fontWeight:700 }}>{t}</span>)}
                    </div>
                    <div style={{ background:o.grad, color:"#fff", borderRadius:999, padding:"8px 0", fontWeight:800, fontSize:".78rem", fontFamily:F }}>Choisir →</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ STEP 1 (en ligne) : offres ═══ */}
          {step === 1 && !loading && (
            <div style={{ animation:"pmFU .3s ease" }}>
              <button onClick={() => setStep(0)} style={backBtn}>← Retour</button>
              <PromosBanner
                offreType="en_ligne"
                accentColor={BET_BLUE}
                onApply={(code) => { setCodePromo(code); setCodePromoApplied(null); setCodePromoError(""); validerCodePromo("en_ligne", undefined, code); }}
              />
              <p style={{ color:"#64748b", fontSize:".84rem", marginBottom:20, lineHeight:1.6 }}>
                Découvrez nos formules de cours en ligne. Apprenez où que vous soyez, à votre rythme, avec nos assistantes dédiées.
              </p>

              {offresEnLigne.length === 0 ? (
                <div style={{ textAlign:"center", padding:"36px 20px", background:"#f8fafc", borderRadius:16, border:"1.5px dashed #e2e8f0" }}>
                  <div style={{ fontSize:"2rem", marginBottom:10 }}>💻</div>
                  <p style={{ color:"#64748b", fontSize:".88rem", lineHeight:1.6, margin:0 }}>
                    Nos offres seront disponibles très prochainement.<br />
                    <strong>Contactez-nous</strong> pour en savoir plus.
                  </p>
                </div>
              ) : (
                <>
                  <div className="pm-grid2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:18 }}>
                    {offresEnLigne.map((o, i) => {
                      const COLORS = [BET_BLUE, BET_NAVY, "#059669", "#d97706", "#7c3aed", "#ff2945"];
                      const col = COLORS[i % COLORS.length];
                      return (
                        <div key={o.id || i} className="pm-card"
                          onClick={() => choisirOffreEnLigne(o)}
                          aria-current={offreEnCours === (o.id || o.label) ? "true" : undefined}
                          style={{
                            border:`2px solid ${offreEnCours === (o.id || o.label) ? col : "#e2e8f0"}`,
                            borderRadius:18, padding:"18px 16px",
                            cursor: loading ? "wait" : "pointer", transition:"all .22s",
                            background: offreEnCours === (o.id || o.label) ? `${col}0d` : "#fafafa",
                            boxShadow: offreEnCours === (o.id || o.label) ? `0 0 0 4px ${col}1f` : "none",
                            opacity: loading && offreEnCours !== (o.id || o.label) ? .55 : 1,
                            display:"flex", flexDirection:"column", gap:10, position:"relative" }}>

                          {/* La coche dit « c'est bien celle-là », y compris pendant le
                              chargement des assistantes qui suit. */}
                          {offreEnCours === (o.id || o.label) && (
                            <div style={{ position:"absolute", top:10, right:10, width:24, height:24, borderRadius:"50%", background:col, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:".8rem", fontWeight:800, boxShadow:"0 2px 6px rgba(0,0,0,.18)" }}>✓</div>
                          )}

                          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
                            <div style={{ width:44, height:44, borderRadius:12, background:`${col}15`, border:`2px solid ${col}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.4rem", flexShrink:0 }}>
                              {o.icon || "💻"}
                            </div>
                            <div style={{ textAlign:"right" }}>
                              <div style={{ fontWeight:800, fontSize:".88rem", color:col, fontFamily:F }}>{o.prix || "Sur devis"}</div>
                              {o.duration && <div style={{ fontSize:".68rem", color:"#94a3b8", marginTop:1 }}>{o.duration}</div>}
                            </div>
                          </div>

                          <div>
                            <div style={{ fontWeight:800, fontSize:".88rem", color:BET_DARK, fontFamily:F, marginBottom:4, lineHeight:1.3 }}>{o.label}</div>
                            {o.desc && (
                              <ul style={{ margin:0, padding:"0 0 0 16px", fontSize:".74rem", color:"#64748b", lineHeight:1.5 }}>
                                {o.desc.split("\n").map(s => s.trim()).filter(Boolean).map((line, li) => <li key={li}>{line}</li>)}
                              </ul>
                            )}
                          </div>

                          {o.brochure_url && (
                            <a href={o.brochure_url} download={o.brochure_nom || true} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{ display:"flex", alignItems:"center", gap:6, background:"#eef1ff", border:"1.5px solid #bae6fd", borderRadius:8, padding:"6px 10px", textDecoration:"none", marginTop:"auto" }}>
                              <span style={{ fontSize:".8rem" }}>📄</span>
                              <span style={{ fontSize:".7rem", fontWeight:700, color:BET_BLUE, flex:1 }}>{o.brochure_nom || "Télécharger la brochure"}</span>
                              <span style={{ fontSize:".62rem", fontWeight:700, color:"#94a3b8", background:"#f1f5f9", borderRadius:4, padding:"1px 5px" }}>PDF</span>
                            </a>
                          )}

                          {/* Un vrai <button> : c'était un <div>, donc invisible au clavier
                              et aux lecteurs d'écran, alors qu'il porte l'action principale. */}
                          <button type="button"
                            onClick={(ev) => { ev.stopPropagation(); choisirOffreEnLigne(o); }}
                            disabled={loading}
                            style={{ background:`linear-gradient(135deg,${col},${BET_NAVY})`, color:"#fff", border:"none", borderRadius:999, padding:"8px 0", fontWeight:800, fontSize:".74rem", textAlign:"center", fontFamily:F, marginTop:"auto", cursor: loading ? "wait" : "pointer", width:"100%" }}>
                            {offreEnCours === (o.id || o.label) && loading ? "Sélection…" : "Choisir cette offre →"}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ textAlign:"center" }}>
                    <button onClick={() => choisirOffreEnLigne(null)}
                      style={{ background:"none", border:"none", color:"#94a3b8", fontSize:".78rem", cursor:"pointer", textDecoration:"underline", fontFamily:F }}>
                      Continuer sans sélectionner d'offre →
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ STEP p1 : cartes centres (flex) + offres + assistantes ═══ */}
          {step === "p1" && !loading && (
            <div style={{ animation:"pmFU .3s ease" }}>
              <button onClick={() => setStep(0)} style={backBtn}>← Retour</button>
              <PromosBanner
                offreType="centres"
                accentColor={BET_NAVY}
                onApply={(code) => { setCodePromo(code); setCodePromoApplied(null); setCodePromoError(""); validerCodePromo("centres", centreChoisi?.id, code); }}
              />
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, gap:8 }}>
                <p style={{ color:"#64748b", fontSize:".82rem", margin:0, lineHeight:1.6 }}>
                  Sélectionnez un cabinet et choisissez votre formule pour continuer.
                </p>
                {geoStatus === "loading" && (
                  <span style={{ fontSize:".68rem", color:"#94a3b8", whiteSpace:"nowrap" }}>📍 Localisation…</span>
                )}
                {geoStatus === "ok" && (
                  <span style={{ fontSize:".68rem", color:"#059669", fontWeight:700, whiteSpace:"nowrap" }}>📍 Trié par distance</span>
                )}
              </div>

              {sortedCentres.length === 0
                ? <p style={{ color:"#94a3b8", textAlign:"center", padding:20 }}>Chargement des centres…</p>
                : (
                  <div className="pm-centre-grid">
                    {sortedCentres.map(c => {
                      const master      = findMaster(c);
                      const color       = master?.color || BET_NAVY;
                      // Formules issues de la grille tarifaire par centre (Groupe présentiel,
                      // Programmes Enfants & Ados, Programme ouvert, Tarif étudiant) - converties
                      // au même format {label,prix,desc} que les offres génériques pour s'intégrer
                      // dans la même liste de sélection sans dupliquer la logique de choix.
                      const gt = master?.grilleTarifaire;
                      const formulesGrille = [
                        ...(gt?.groupePresentiel||[]).filter(it=>it.actif!==false).map(it => ({ label:`Groupe présentiel - ${it.label}`, prix:`${Number(it.tarif||0).toLocaleString("fr-FR")} F/mois`, desc:it.creneaux, type_coaching:"groupe" })),
                        ...(gt?.programmesEnfants||[]).filter(it=>it.actif!==false).map(it => ({ label:`${it.label} - Enfants & Ados`, prix:`${Number(it.tarif||0).toLocaleString("fr-FR")} F/mois`, desc:it.creneaux, type_coaching:"groupe" })),
                        ...(gt?.programmeOuvert||[]).filter(it=>it.actif!==false).map(it => ({ label:`Programme ouvert - ${it.label}`, prix:`${Number(it.tarif||0).toLocaleString("fr-FR")} F/mois`, desc:it.creneaux, type_coaching:"groupe" })),
                        ...(gt?.tarifEtudiant||[]).filter(it=>it.actif!==false).map(it => ({ label:it.label, prix:`${Number(it.tarif||0).toLocaleString("fr-FR")} F/mois`, desc:it.creneaux, type_coaching:"groupe" })),
                      ];
                      const offres      = [...(master?.offres || []).filter(o => o.actif !== false), ...formulesGrille];
                      const assistList  = centreAssistantesMap[c.id] || [];
                      const isOpen_     = selectedCentreCard === c.id;
                      const offreOk     = isOpen_ && offreChoisie && selectedCentreCard === c.id;
                      const centreKm    = userCoords ? (() => { const coords = getCentreCoords(c, master); return coords ? Math.round(haversine(userCoords.lat, userCoords.lng, coords.lat, coords.lng)) : null; })() : null;

                      return (
                        <div key={c.id} onClick={() => toggleCentreCard(c.id)}
                          style={{ gridColumn: isOpen_ ? "1 / -1" : "auto",
                            border:`2px solid ${isOpen_ ? color : "#e2e8f0"}`, borderRadius:16,
                            background: isOpen_ ? `${color}06` : "#fff",
                            cursor:"pointer", transition:"all .22s", overflow:"hidden",
                            boxShadow: isOpen_ ? `0 8px 24px ${color}20` : "none" }}>

                            {/* Bandeau couleur haut */}
                            <div style={{ height:4, background: isOpen_ ? color : "#e2e8f0", transition:"background .2s" }} />

                            <div style={{ padding:"14px 16px" }}>
                              {/* Ligne principale */}
                              <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:10 }}>
                                <div style={{ width:42, height:42, borderRadius:10, background:`${color}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.3rem", flexShrink:0 }}>🏢</div>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontWeight:800, fontSize:".9rem", color: isOpen_ ? color : BET_DARK, lineHeight:1.2 }}>{c.nom}</div>
                                  {c.ville && (
                                    <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:2 }}>
                                      <span style={{ fontSize:".72rem", color:"#64748b" }}>{c.ville}</span>
                                      {centreKm !== null && (
                                        <span style={{ fontSize:".62rem", fontWeight:700, color:"#6366f1", background:"#eef2ff", padding:"1px 5px", borderRadius:999 }}>~{centreKm} km</span>
                                      )}
                                    </div>
                                  )}
                                  {c.adresse && <div style={{ fontSize:".68rem", color:"#94a3b8", marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.adresse}</div>}
                                </div>
                                <div style={{ color: isOpen_ ? color : "#94a3b8", fontWeight:800, fontSize:"1rem", transition:"transform .2s", transform: isOpen_ ? "rotate(90deg)" : "none" }}>›</div>
                              </div>

                              {/* Assistantes preview + compteur */}
                              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: offres.length > 0 ? 10 : 0 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                  {assistList.length > 0
                                    ? <AvatarStack assistantes={assistList} size={28} max={4} color={color} />
                                    : <span style={{ fontSize:".7rem", color:"#94a3b8" }}>-</span>
                                  }
                                  {assistList.length > 0 && (
                                    <span style={{ fontSize:".7rem", color:"#64748b", fontWeight:600 }}>
                                      {assistList.length} assistante{assistList.length > 1 ? "s" : ""}
                                    </span>
                                  )}
                                </div>
                                {offres.length > 0 && (() => {
                                  const prix = offres.map(o => parseInt((o.prix||"").replace(/\D/g,""))||0).filter(Boolean);
                                  const min  = prix.length ? Math.min(...prix) : null;
                                  return min ? (
                                    <span style={{ background:`${color}12`, color, borderRadius:999, padding:"2px 8px", fontSize:".66rem", fontWeight:800 }}>
                                      Dès {min.toLocaleString("fr")} F
                                    </span>
                                  ) : null;
                                })()}
                              </div>
                            </div>

                            {/* ── Section offres (dépliée) ── */}
                            {isOpen_ && (
                              <div style={{ borderTop:`1px solid ${color}30`, padding:"14px 16px", animation:"pmSlide .2s ease" }}
                                onClick={e => e.stopPropagation()}>

                                {/* Brochure */}
                                <a href={master?.brochure_url || DEFAULT_BROCHURE_URL} onClick={e => e.stopPropagation()} target="_blank" rel="noopener noreferrer"
                                  style={{ display:"flex", alignItems:"center", gap:6, background:"#eef1ff", border:"1.5px solid #bae6fd", borderRadius:8, padding:"7px 10px", marginBottom:14, textDecoration:"none" }}>
                                  <span style={{ fontSize:".9rem" }}>📄</span>
                                  <span style={{ fontSize:".72rem", fontWeight:700, color:BET_BLUE, flex:1 }}>Télécharger la brochure</span>
                                  <span style={{ fontSize:".62rem", fontWeight:700, color:"#94a3b8", background:"#f1f5f9", borderRadius:4, padding:"1px 5px" }}>PDF</span>
                                </a>

                                {offres.length === 0 ? (
                                  <p style={{ fontSize:".78rem", color:"#94a3b8", margin:"0 0 12px", textAlign:"center" }}>Contactez-nous pour les tarifs.</p>
                                ) : (
                                  <>
                                    <p style={{ fontSize:".72rem", fontWeight:700, color:"#374151", marginBottom:10, textTransform:"uppercase", letterSpacing:".05em" }}>
                                      Choisissez votre formule
                                    </p>
                                    <div className="pm-grid2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                                      {offres.map((o, i) => {
                                        const sel = offreChoisie?.label === o.label && selectedCentreCard === c.id;
                                        return (
                                          <div key={i} className="pm-card" onClick={() => setOffreChoisie(o)}
                                            style={{ border:`2px solid ${sel ? color : "#e2e8f0"}`, borderRadius:18, padding:"16px 14px",
                                              cursor:"pointer", transition:"all .22s", background: sel ? `${color}08` : "#fafafa",
                                              display:"flex", flexDirection:"column", gap:8 }}>

                                            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
                                              <div style={{ width:38, height:38, borderRadius:11, background:`${color}15`, border:`2px solid ${color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.15rem", flexShrink:0 }}>
                                                {o.icon || (o.type_coaching === "prive" ? "🧑‍💼" : "👥")}
                                              </div>
                                              <div style={{ textAlign:"right" }}>
                                                <div style={{ fontWeight:800, fontSize:".84rem", color, fontFamily:F }}>{o.prix}</div>
                                                {o.duration && <div style={{ fontSize:".64rem", color:"#94a3b8", marginTop:1 }}>{o.duration}</div>}
                                              </div>
                                            </div>

                                            <div>
                                              <div style={{ fontWeight:800, fontSize:".82rem", color:sel?color:BET_DARK, fontFamily:F, marginBottom:3, lineHeight:1.3 }}>{o.label}</div>
                                              {o.desc && (
                                                <ul style={{ margin:0, padding:"0 0 0 14px", fontSize:".7rem", color:"#64748b", lineHeight:1.5 }}>
                                                  {o.desc.split("\n").map(s => s.trim()).filter(Boolean).map((line, li) => <li key={li}>{line}</li>)}
                                                </ul>
                                              )}
                                            </div>

                                            <div style={{ marginTop:"auto", borderRadius:999, padding:"7px 0", fontWeight:800, fontSize:".7rem", textAlign:"center", fontFamily:F,
                                              background: sel ? `linear-gradient(135deg,${color},${BET_DARK})` : "#eef1ff",
                                              color: sel ? "#fff" : color }}>
                                              {sel ? "✓ Sélectionné" : "Choisir cette formule"}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </>
                                )}

                                <button onClick={() => confirmerCentre(c)}
                                  disabled={offres.length > 0 && !offreOk}
                                  style={{ width:"100%", padding:"11px", borderRadius:999,
                                    background: (offres.length === 0 || offreOk) ? `linear-gradient(135deg,${color},${BET_DARK})` : "#e5e7eb",
                                    color: (offres.length === 0 || offreOk) ? "#fff" : "#94a3b8",
                                    border:"none", cursor: (offres.length === 0 || offreOk) ? "pointer" : "default",
                                    fontWeight:800, fontSize:".84rem", fontFamily:F, transition:"all .2s" }}>
                                  {offres.length > 0 && !offreOk
                                    ? "Sélectionnez une formule ↑"
                                    : `Continuer avec ${c.nom.replace("BET ","")} →`}
                                </button>
                              </div>
                            )}
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
          )}

          {/* ═══ STEP p2 : cartes assistantes ═══ */}
          {step === "p2" && !loading && (
            <div style={{ animation:"pmFU .3s ease" }}>
              <button onClick={() => { setStep("p1"); setSelectedCentreCard(centreChoisi?.id); }} style={backBtn}>← Retour</button>

              {/* Recap offre */}
              {offreChoisie && (
                <div style={{ display:"flex", alignItems:"center", gap:10, background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:10, padding:"10px 14px", marginBottom:16 }}>
                  <span style={{ fontSize:"1rem" }}>✅</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:".82rem", color:"#065f46" }}>{offreChoisie.label}</div>
                    <div style={{ fontSize:".72rem", color:"#047857" }}>{offreChoisie.prix}{offreChoisie.duration ? ` · ${offreChoisie.duration}` : ""}</div>
                  </div>
                  <button onClick={() => setStep("p1")} style={{ background:"none", border:"none", fontSize:".7rem", color:"#059669", cursor:"pointer", fontWeight:700 }}>Changer</button>
                </div>
              )}

              <p style={{ color:"#64748b", fontSize:".84rem", marginBottom:16 }}>
                {assistantes.length} assistante{assistantes.length > 1 ? "s" : ""} - {centreChoisi?.nom}
              </p>

              {assistantes.length === 0 ? (
                <div style={{ textAlign:"center", padding:"32px 20px", background:"#f8fafc", borderRadius:14, border:"1.5px dashed #e2e8f0" }}>
                  <div style={{ fontSize:"1.8rem", marginBottom:10 }}>😔</div>
                  <p style={{ color:"#475569", fontSize:".86rem", lineHeight:1.6 }}>
                    Aucune assistante assignée à ce centre.<br/>
                    <strong>Contactez-nous directement</strong> pour être pris(e) en charge.
                  </p>
                </div>
              ) : (
                <div className="pm-assist-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  {assistantes.map(a => {
                    const jours = a.jours_travail || JOURS_SEMAINE;
                    const hasSemaine = jours.some(j => JOURS_SEMAINE.includes(j));
                    const hasWeekend = jours.some(j => JOURS_WEEKEND.includes(j));
                    const master  = findMaster(centreChoisi || {});
                    const color   = master?.color || BET_NAVY;
                    return (
                      <div key={a.id} className="pm-assist-card" onClick={() => choisirAssistante(a)}
                        style={{ border:"2px solid #e2e8f0", borderRadius:18, padding:"18px 14px", cursor:"pointer", transition:"all .22s", background:"#fff", textAlign:"center" }}>
                        <div style={{ display:"flex", justifyContent:"center", marginBottom:10 }}>
                          <Avatar a={a} size={68} color={color} />
                        </div>
                        <div style={{ fontWeight:800, fontSize:".9rem", color:BET_DARK, marginBottom:2 }}>{a.prenom} {a.nom}</div>
                        <div style={{ fontSize:".72rem", color:"#94a3b8", marginBottom: a.telephone ? 4 : 8 }}>Assistante BET</div>
                        {a.telephone && (
                          <div style={{ fontSize:".72rem", color:"#0891b2", fontWeight:700, marginBottom:8 }}>📞 {a.telephone}</div>
                        )}
                        <div style={{ marginBottom:8 }}>
                          <JoursPills jours={jours} />
                        </div>
                        <div style={{ display:"flex", gap:5, justifyContent:"center", flexWrap:"wrap", marginBottom:12 }}>
                          {hasSemaine && <span style={{ fontSize:".65rem", padding:"3px 8px", borderRadius:999, background:"#eef1ff", color:"#0c33ac", fontWeight:700 }}>📆 Semaine</span>}
                          {hasWeekend && <span style={{ fontSize:".65rem", padding:"3px 8px", borderRadius:999, background:"#fef3c7", color:"#92400e", fontWeight:700 }}>📅 Weekend</span>}
                        </div>
                        <div style={{ background:`linear-gradient(135deg,${color},${BET_DARK})`, color:"#fff", borderRadius:999, padding:"8px 0", fontWeight:800, fontSize:".76rem", fontFamily:F }}>
                          Choisir →
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 2 (en ligne) : assistantes ═══ */}
          {step === 2 && !loading && (
            <div style={{ animation:"pmFU .3s ease" }}>
              <button onClick={() => setStep(1)} style={backBtn}>← Retour aux offres</button>

              {/* Recap offre choisie */}
              {offreChoisie && (
                <div style={{ display:"flex", alignItems:"center", gap:10, background:"#eef1ff", border:"1.5px solid #bae6fd", borderRadius:12, padding:"10px 14px", marginBottom:16 }}>
                  <span style={{ fontSize:"1.1rem" }}>{offreChoisie.icon || "💻"}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:800, fontSize:".82rem", color:BET_DARK }}>{offreChoisie.label}</div>
                    <div style={{ fontSize:".72rem", color:"#64748b" }}>{offreChoisie.prix}{offreChoisie.duration ? ` · ${offreChoisie.duration}` : ""}</div>
                  </div>
                  <button onClick={() => setStep(1)} style={{ background:"none", border:"none", fontSize:".72rem", color:"#94a3b8", cursor:"pointer", fontWeight:700 }}>Changer</button>
                </div>
              )}

              <p style={{ color:"#64748b", fontSize:".84rem", marginBottom:16, lineHeight:1.6 }}>
                {modeCours === "domicile"
                  ? "Choisissez l'assistante qui organisera vos séances de coaching privé à domicile."
                  : "Choisissez l'assistante qui vous accompagnera tout au long de votre parcours en ligne."}
              </p>

              {assistantes.length === 0 ? (
                <div style={{ textAlign:"center", padding:"32px 20px", background:"#f8fafc", borderRadius:14, border:"1.5px dashed #e2e8f0" }}>
                  <div style={{ fontSize:"1.8rem", marginBottom:10 }}>😔</div>
                  <p style={{ color:"#475569", fontSize:".86rem", lineHeight:1.6, margin:0 }}>Aucune assistante disponible pour le moment.<br/><strong>Contactez-nous directement.</strong></p>
                </div>
              ) : (
                <div className="pm-assist-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
                  {assistantes.map(a => {
                    const wa = a.telephone
                      ? `https://wa.me/${a.telephone.replace(/\D/g,"")}?text=${encodeURIComponent(`Bonjour ${a.prenom}, je souhaite m'inscrire à un cours BET ${modeCours === "domicile" ? "à domicile" : "en ligne"}${offreChoisie ? ` - ${offreChoisie.label}` : ""}.`)}`
                      : null;
                    return (
                      <div key={a.id} className="pm-assist-card" onClick={() => choisirAssistante(a)}
                        style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10, border:"2px solid #e2e8f0", borderRadius:18, padding:"20px 14px 16px", cursor:"pointer", transition:"all .22s", background:"#fff", textAlign:"center" }}>

                        <div style={{ position:"relative" }}>
                          <Avatar a={a} size={72} />
                          <span style={{ position:"absolute", bottom:0, right:0, width:16, height:16, borderRadius:"50%", background:"#22c55e", border:"2.5px solid #fff" }} />
                        </div>

                        <div>
                          <div style={{ fontWeight:800, fontSize:".88rem", color:BET_DARK, fontFamily:F, lineHeight:1.3 }}>{a.prenom} {a.nom}</div>
                          <div style={{ fontSize:".68rem", color:"#94a3b8", marginTop:3 }}>
                            {modeCours === "domicile" ? `Assistante · ${a.centres?.nom || "Présentiel"}` : "Assistante · En ligne"}
                          </div>
                        </div>

                        {a.telephone && (
                          <div style={{ fontSize:".72rem", color:"#334155", fontWeight:600 }}>📞 {a.telephone}</div>
                        )}

                        {wa && (
                          <a href={wa} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:5, width:"100%", padding:"8px 0", background:"#25d366", color:"#fff", borderRadius:999, textDecoration:"none", fontWeight:700, fontSize:".74rem", fontFamily:F, marginTop:"auto" }}>
                            <span>💬</span> WhatsApp
                          </a>
                        )}

                        <div style={{ width:"100%", padding:"7px 0", background:`linear-gradient(135deg,${BET_BLUE},${BET_NAVY})`, color:"#fff", borderRadius:999, fontWeight:800, fontSize:".72rem", fontFamily:F }}>
                          Choisir →
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 2.5 : Auth gate ═══ */}
          {step === 2.5 && (
            <div style={{ padding:"8px 0", animation:"pmFU .3s ease" }}>
              {/* Progress recap */}
              {modeCours !== "domicile" && assistante && (
                <div style={{ display:"flex", alignItems:"center", gap:12, background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:12, padding:"12px 14px", marginBottom:16 }}>
                  {assistante.photo_url
                    ? <img src={assistante.photo_url} alt="" style={{ width:42, height:42, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} />
                    : <div style={{ width:42, height:42, borderRadius:"50%", background:"#1B3080", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, flexShrink:0 }}>{`${assistante.prenom?.[0]||""}${assistante.nom?.[0]||""}`.toUpperCase()}</div>
                  }
                  <div>
                    <div style={{ fontWeight:800, fontSize:".88rem" }}>{assistante.prenom} {assistante.nom}</div>
                    <div style={{ fontSize:".72rem", color:"#64748b" }}>{modeCours === "en_ligne" ? "Cours en ligne" : "Présentiel"} {offreChoisie ? `· ${offreChoisie.label}` : ""}</div>
                  </div>
                  <span style={{ marginLeft:"auto", background:"#f0fdf4", color:"#16a34a", borderRadius:999, padding:"3px 10px", fontSize:".7rem", fontWeight:700 }}>✓ Sélectionnée</span>
                </div>
              )}
              {modeCours === "domicile" && (
                <div style={{ padding:"10px 14px", background:"#f0fdf4", borderRadius:10, border:"1px solid #bbf7d0", marginBottom:16, display:"flex", gap:10, alignItems:"center" }}>
                  <span style={{ fontSize:20 }}>🏠</span>
                  <div>
                    <div style={{ fontSize:".82rem", fontWeight:700, color:"#15803d" }}>Cours à domicile</div>
                    <div style={{ fontSize:".76rem", color:"#64748b" }}>Connectez-vous pour pré-remplir vos coordonnées automatiquement.</div>
                  </div>
                </div>
              )}
              {/* Inline Auth */}
              <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e2e8f0", padding:"16px" }}>
                <div style={{ fontSize:".78rem", fontWeight:700, color:"#64748b", marginBottom:12, textAlign:"center" }}>Votre progression est conservée</div>
                {/* Tabs */}
                <div style={{ display:"flex", borderRadius:10, overflow:"hidden", border:"1.5px solid #e2e8f0", marginBottom:14 }}>
                  {[["login","Se connecter"],["register","Créer un compte"]].map(([t,l]) => (
                    <button key={t} onClick={() => setAuthTab(t)} style={{ flex:1, padding:"9px 0", border:"none", fontWeight:700, fontSize:".82rem", cursor:"pointer", background:authTab===t?"#1B3080":"#fff", color:authTab===t?"#fff":"#374151" }}>{l}</button>
                  ))}
                </div>
                {authTab === "login" ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    <input type="email" placeholder="Email *" value={authFormPm.email} onChange={e=>setAuthFormPm(p=>({...p,email:e.target.value}))} style={{ padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".84rem", outline:"none", boxSizing:"border-box", width:"100%" }} />
                    <input type="password" placeholder="Mot de passe *" value={authFormPm.password} onChange={e=>setAuthFormPm(p=>({...p,password:e.target.value}))} style={{ padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".84rem", outline:"none", boxSizing:"border-box", width:"100%" }} />
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                      <input placeholder="Prénom *" value={authFormPm.prenom} onChange={e=>setAuthFormPm(p=>({...p,prenom:e.target.value}))} style={{ padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".84rem", outline:"none", boxSizing:"border-box", width:"100%" }} />
                      <input placeholder="Nom *" value={authFormPm.nom} onChange={e=>setAuthFormPm(p=>({...p,nom:e.target.value}))} style={{ padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".84rem", outline:"none", boxSizing:"border-box", width:"100%" }} />
                    </div>
                    <input type="email" placeholder="Email *" value={authFormPm.email} onChange={e=>setAuthFormPm(p=>({...p,email:e.target.value}))} style={{ padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".84rem", outline:"none", boxSizing:"border-box", width:"100%" }} />
                    <input placeholder="Téléphone" value={authFormPm.telephone} onChange={e=>setAuthFormPm(p=>({...p,telephone:e.target.value}))} style={{ padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".84rem", outline:"none", boxSizing:"border-box", width:"100%" }} />
                    <input type="password" placeholder="Mot de passe *" value={authFormPm.password} onChange={e=>setAuthFormPm(p=>({...p,password:e.target.value}))} style={{ padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".84rem", outline:"none", boxSizing:"border-box", width:"100%" }} />
                  </div>
                )}
                {authErrPm && <p style={{ fontSize:".78rem", margin:"8px 0 0", color:"#ff2945", textAlign:"center" }}>{authErrPm}</p>}
                <button onClick={authTab==="login" ? handleAuthLogin : handleAuthRegister} disabled={authLoadPm}
                  style={{ width:"100%", marginTop:14, padding:"12px", background:"#1B3080", color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", opacity:authLoadPm?.7:1, fontSize:".88rem" }}>
                  {authLoadPm ? "Chargement…" : authTab==="login" ? "Se connecter" : "Créer mon compte"}
                </button>
                <button onClick={() => setStep(modeCours === "domicile" ? 0 : modeCours === "en_ligne" ? 2 : typeCoaching === "prive" ? "p1" : "p2")}
                  style={{ width:"100%", marginTop:8, padding:"9px", background:"transparent", color:"#64748b", border:"1.5px solid #e2e8f0", borderRadius:8, fontWeight:600, fontSize:".8rem", cursor:"pointer" }}>
                  ← Retour
                </button>
              </div>
            </div>
          )}

          {/* ═══ STEP p4 : paiement (présentiel) ═══ */}
          {step === "p4" && !loading && (
            <div style={{ animation:"pmFU .3s ease" }}>
              <button onClick={() => setStep("p2")} style={backBtn}>← Retour</button>

              {/* Recap complet */}
              <div style={{ background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:14, padding:"14px 16px", marginBottom:20 }}>
                <div style={{ fontSize:".7rem", fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:".05em", marginBottom:10 }}>Récapitulatif</div>
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
                  <Avatar a={assistante} size={42} />
                  <div>
                    <div style={{ fontWeight:800, fontSize:".88rem", color:BET_DARK }}>{assistante?.prenom} {assistante?.nom}</div>
                    <div style={{ fontSize:".72rem", color:"#64748b" }}>Présentiel · {centreChoisi?.nom} · {typeCoaching === "groupe" ? "Groupe" : "Privé"}</div>
                  </div>
                </div>
                {offreChoisie && (
                  <div style={{ borderRadius:10, background:`${BET_BLUE}07`, border:`1.5px solid ${BET_BLUE}20`, overflow:"hidden" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", borderBottom: offreChoisie.desc ? `1px solid ${BET_BLUE}15` : "none" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:".9rem" }}>{typeCoaching === "groupe" ? "👥" : typeCoaching === "prive" ? "👤" : "📋"}</span>
                        <div>
                          <div style={{ fontWeight:800, fontSize:".84rem", color:BET_DARK }}>{offreChoisie.label}</div>
                          {offreChoisie.duration && (
                            <div style={{ fontSize:".68rem", color:"#64748b", marginTop:1 }}>⏱ {offreChoisie.duration}</div>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0 }}>
                        {/* Le tarif de la formule prime sur le prix d'appel de la carte. */}
                        <div style={{ fontWeight:900, fontSize:".92rem", color:BET_BLUE }}>
                          {formuleGroupeChoisie ? `${formuleGroupeChoisie.tarif.toLocaleString("fr-FR")} F / mois` : offreChoisie.prix}
                        </div>
                        {typeCoaching && (
                          <div style={{ fontSize:".62rem", fontWeight:700, color:"#fff", background: typeCoaching === "groupe" ? "#6366f1" : "#0891b2", borderRadius:999, padding:"1px 7px", marginTop:3, display:"inline-block" }}>
                            {typeCoaching === "groupe" ? "Groupe" : "Privé"}
                          </div>
                        )}
                      </div>
                    </div>
                    {offreChoisie.desc && (
                      <div style={{ padding:"8px 12px", fontSize:".74rem", color:"#475569", lineHeight:1.6 }}>
                        {offreChoisie.desc}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Form */}
              <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:18 }}>
                <div>
                  <label style={labelStyle}>Nom complet *</label>
                  <input value={form.nom} readOnly={!!(sbUser && form.nom)} onChange={e => { setForm(f=>({...f,nom:e.target.value})); setFormErrors(fe=>({...fe,nom:""})); }}
                    placeholder="Ex : Kouamé Yao" style={{ ...(sbUser && form.nom ? lockedInputStyle : inputStyle), borderColor: formErrors.nom ? "#ff2945" : "#e2e8f0" }} />
                  {formErrors.nom && <p style={errStyle}>{formErrors.nom}</p>}
                </div>
                <div>
                  <label style={labelStyle}>Numéro WhatsApp *</label>
                  <input value={form.telephone} readOnly={!!(sbUser && form.telephone)} onChange={e => { setForm(f=>({...f,telephone:e.target.value})); setFormErrors(fe=>({...fe,telephone:""})); }}
                    placeholder="+225 07 XX XX XX" style={{ ...(sbUser && form.telephone ? lockedInputStyle : inputStyle), borderColor: formErrors.telephone ? "#ff2945" : "#e2e8f0" }} />
                  {formErrors.telephone && <p style={errStyle}>{formErrors.telephone}</p>}
                </div>
                <div>
                  <label style={labelStyle}>E-mail <span style={{ color:"#94a3b8", fontWeight:400 }}>(optionnel)</span></label>
                  <input value={form.email} readOnly={!!(sbUser && form.email)} onChange={e => setForm(f=>({...f,email:e.target.value}))}
                    placeholder="votre@email.com" type="email" style={sbUser && form.email ? lockedInputStyle : inputStyle} />
                </div>
              </div>

              {/* Code promo - step p4 */}
              <div style={{ marginBottom:16 }}>
                <p style={{ fontSize:".78rem", fontWeight:700, color:"#374151", marginBottom:8 }}>🏷️ Code promo <span style={{ fontWeight:400, color:"#94a3b8" }}>(optionnel)</span></p>
                {codePromoApplied ? (
                  <div style={{ display:"flex", alignItems:"center", gap:10, background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:10, padding:"10px 14px" }}>
                    <span style={{ fontSize:"1.1rem" }}>✅</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:800, fontSize:".82rem", color:"#166534" }}>{codePromoApplied.code} appliqué !</div>
                      <div style={{ fontSize:".72rem", color:"#166534" }}>Réduction : {codePromoApplied.type_reduction === "pourcentage" ? `-${codePromoApplied.valeur}%` : `-${Number(codePromoApplied.valeur).toLocaleString("fr-FR")} FCFA`}{codePromoApplied.description && ` · ${codePromoApplied.description}`}</div>
                    </div>
                    <button onClick={() => { setCodePromoApplied(null); setCodePromo(""); setCodePromoError(""); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:16, padding:0 }}>✕</button>
                  </div>
                ) : (
                  <div style={{ display:"flex", gap:8 }}>
                    <input value={codePromo} onChange={e => { setCodePromo(e.target.value.toUpperCase()); setCodePromoError(""); }}
                      onKeyDown={e => e.key === "Enter" && validerCodePromo("centres", centreChoisi?.id)}
                      placeholder="Ex : BET2025"
                      style={{ flex:1, padding:"10px 13px", border:`1.5px solid ${codePromoError?"#ff2945":"#e2e8f0"}`, borderRadius:9, fontSize:".82rem", fontFamily:"monospace", letterSpacing:1, outline:"none" }} />
                    <button onClick={() => validerCodePromo("centres", centreChoisi?.id)} disabled={!codePromo.trim() || codePromoLoading}
                      style={{ padding:"0 16px", background:BET_BLUE, color:"#fff", border:"none", borderRadius:9, cursor:"pointer", fontWeight:700, fontSize:".78rem", opacity:(!codePromo.trim()||codePromoLoading)?.5:1, whiteSpace:"nowrap" }}>
                      {codePromoLoading ? "⏳" : "Appliquer"}
                    </button>
                  </div>
                )}
                {codePromoError && <p style={{ margin:"5px 0 0", fontSize:".72rem", color:"#ff2945" }}>{codePromoError}</p>}
              </div>

              {/* Même bloc qu'en ligne : toujours visible, et fondé sur le tarif de la
                  formule quand il y en a une. */}
              {montantReference && (() => {
                const montantFinal = calcMontantReduit(montantReference, codePromoApplied);
                return (
                  <div style={{ background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"12px 14px", marginBottom:14 }}>
                    {formuleGroupeChoisie && (
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, fontSize:".78rem", marginBottom:8, paddingBottom:8, borderBottom:"1px solid #e2e8f0" }}>
                        <div>
                          <div style={{ fontWeight:800, color:BET_DARK }}>Formule {formuleGroupeChoisie.label}</div>
                          {formuleGroupeChoisie.frequence && <div style={{ fontSize:".72rem", color:"#64748b", marginTop:2 }}>{formuleGroupeChoisie.frequence}</div>}
                        </div>
                        <span style={{ fontWeight:700, color:"#059669", whiteSpace:"nowrap" }}>{formuleGroupeChoisie.tarif.toLocaleString("fr-FR")} F / mois</span>
                      </div>
                    )}
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:".78rem", color:"#64748b", marginBottom:codePromoApplied?4:8 }}>
                      <span>Montant initial</span>
                      <span>{montantReference.toLocaleString("fr-FR")} FCFA</span>
                    </div>
                    {codePromoApplied && (
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:".78rem", color:"#16a34a", fontWeight:700, marginBottom:8 }}>
                        <span>Réduction ({codePromoApplied.code})</span>
                        <span>-{(montantReference-montantFinal).toLocaleString("fr-FR")} FCFA</span>
                      </div>
                    )}
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:".92rem", fontWeight:800, color:"#0c33ac", paddingTop:8, borderTop:"1px solid #e2e8f0" }}>
                      <span>Total à payer</span>
                      <span>{montantFinal.toLocaleString("fr-FR")} FCFA</span>
                    </div>
                  </div>
                );
              })()}

              <button onClick={submitAssignation}
                disabled={submitting}
                style={{ ...primaryBtn, opacity:submitting ? .5 : 1, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                {submitting ? <><div style={{ width:14,height:14,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"pmSpin .7s linear infinite" }}/>Envoi…</> : "Confirmer mon inscription →"}
              </button>
            </div>
          )}

          {/* ═══ STEP 3 (en ligne privé) ═══ */}
          {step === 3 && (
            <div style={{ animation:"pmFU .3s ease" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, background:"#eef1ff", border:"1.5px solid #bae6fd", borderRadius:12, padding:"12px 14px", marginBottom:20 }}>
                <Avatar a={assistante} size={40} />
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:800, fontSize:".85rem", color:BET_DARK }}>{assistante?.prenom} {assistante?.nom}</div>
                  <div style={{ fontSize:".72rem", color:"#64748b" }}>En ligne · Coaching privé</div>
                </div>
                <span style={{ background:"#f0fdf4", color:"#16a34a", borderRadius:999, padding:"3px 10px", fontSize:".7rem", fontWeight:700, flexShrink:0 }}>✓ Connecté(e)</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div><label style={labelStyle}>Nom complet *</label>
                  <input value={form.nom} readOnly={!!(sbUser && form.nom)} onChange={e => { setForm(f=>({...f,nom:e.target.value})); setFormErrors(fe=>({...fe,nom:""})); }} placeholder="Ex : Kouamé Yao" style={{ ...(sbUser && form.nom ? lockedInputStyle : inputStyle), borderColor: formErrors.nom ? "#ff2945" : "#e2e8f0" }} />
                  {formErrors.nom && <p style={errStyle}>{formErrors.nom}</p>}</div>
                <div><label style={labelStyle}>Numéro WhatsApp *</label>
                  <input value={form.telephone} readOnly={!!(sbUser && form.telephone)} onChange={e => { setForm(f=>({...f,telephone:e.target.value})); setFormErrors(fe=>({...fe,telephone:""})); }} placeholder="+225 07 XX XX XX" style={{ ...(sbUser && form.telephone ? lockedInputStyle : inputStyle), borderColor: formErrors.telephone ? "#ff2945" : "#e2e8f0" }} />
                  {formErrors.telephone && <p style={errStyle}>{formErrors.telephone}</p>}</div>
                <div><label style={labelStyle}>E-mail <span style={{ color:"#94a3b8", fontWeight:400 }}>(optionnel)</span></label>
                  <input value={form.email} readOnly={!!(sbUser && form.email)} onChange={e => setForm(f=>({...f,email:e.target.value}))} placeholder="votre@email.com" type="email" style={sbUser && form.email ? lockedInputStyle : inputStyle} /></div>
                <button onClick={submitAssignation} disabled={submitting} style={{ ...primaryBtn, opacity:submitting?.7:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                  {submitting ? <><div style={{ width:14,height:14,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"pmSpin .7s linear infinite" }}/>Envoi…</> : "Confirmer ma demande →"}
                </button>
              </div>
            </div>
          )}

          {/* ═══ STEP 3.5 (en ligne groupe) : paiement ═══ */}
          {/* ═══ STEP 7 : formule de groupe - pendant de l'étape 6 du coaching privé ═══ */}
          {step === 7 && (
            <div style={{ animation:"pmFU .3s ease" }}>
              <button onClick={() => setStep(modeCours === "presentiel" ? "p1" : 1)} style={backBtn}>← Retour</button>

              <div style={{ display:"flex", alignItems:"center", gap:12, background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:12, padding:"12px 16px", marginBottom:18 }}>
                <div style={{ width:40, height:40, borderRadius:10, background:"linear-gradient(135deg,#059669,#065f46)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.3rem", flexShrink:0 }}>👥</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:800, fontSize:".85rem", color:"#065f46", fontFamily:F }}>Coaching de groupe</div>
                  <div style={{ fontSize:".72rem", color:"#047857" }}>
                    {modeCours === "presentiel" ? (centreChoisi?.nom || "En cabinet") : "En ligne via Google Meet"}
                  </div>
                </div>
              </div>

              <div className="pm-pack-grid" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:10, marginBottom:16 }}>
                {formulesGroupe.map(f => {
                  const selected = formuleGroupe === f.id;
                  return (
                    <button key={f.id} type="button" onClick={() => setFormuleGroupe(f.id)}
                      style={{ textAlign:"left", cursor:"pointer", border:`2px solid ${selected ? "#059669" : "#e2e8f0"}`,
                        background: selected ? "#f0fdf4" : "#fafafa", borderRadius:16, padding:"14px 14px",
                        boxShadow: selected ? "0 0 0 4px #05966920" : "none", transition:"all .2s",
                        display:"flex", flexDirection:"column", gap:6, position:"relative", fontFamily:F }}>
                      {selected && (
                        <div style={{ position:"absolute", top:10, right:10, width:22, height:22, borderRadius:"50%", background:"#059669", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:".72rem", fontWeight:800 }}>✓</div>
                      )}
                      <div style={{ fontWeight:800, fontSize:".86rem", color:BET_DARK }}>{f.label}</div>
                      {f.frequence && <div style={{ fontSize:".72rem", color:"#64748b", lineHeight:1.45 }}>{f.frequence}</div>}
                      <div style={{ marginTop:"auto", fontWeight:800, fontSize:".95rem", color:"#059669" }}>
                        {f.tarif.toLocaleString("fr-FR")} F <span style={{ fontSize:".68rem", fontWeight:600, color:"#64748b" }}>/ mois</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Le tarif retenu, redit avant de payer : c'est lui qui sera facturé, et non
                  le prix d'appel affiché sur la carte de l'offre. */}
              {formuleGroupeChoisie && (
                <div style={{ background:"#0f172a", color:"#fff", borderRadius:12, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
                  <div>
                    <div style={{ fontWeight:800, fontSize:".82rem" }}>Formule {formuleGroupeChoisie.label}</div>
                    <div style={{ fontSize:".7rem", color:"rgba(255,255,255,.7)" }}>{formuleGroupeChoisie.frequence}</div>
                  </div>
                  <div style={{ fontWeight:800, fontSize:"1.05rem" }}>{formuleGroupeChoisie.tarif.toLocaleString("fr-FR")} F / mois</div>
                </div>
              )}

              <button type="button" disabled={!formuleGroupeChoisie}
                onClick={() => {
                  ga4.formuleChoisie({ offre: offreChoisie?.label, formule: formuleGroupeChoisie?.label,
                    tarif: formuleGroupeChoisie?.tarif, canal: modeCours });
                  // La formule est retenue : on passe au choix de l'assistante.
                  if (modeCours === "presentiel") {
                    const dejaVue = findAssistanteExistante("presentiel", "groupe", centreChoisi?.id);
                    if (dejaVue) { choisirAssistante(dejaVue); return; }
                    setStep("p2");
                  } else {
                    allerAuxAssistantesEnLigne("groupe");
                  }
                }}
                style={{ width:"100%", padding:"12px 0", borderRadius:999, border:"none", fontFamily:F, fontWeight:800, fontSize:".85rem",
                  background: formuleGroupeChoisie ? "linear-gradient(135deg,#059669,#065f46)" : "#e2e8f0",
                  color: formuleGroupeChoisie ? "#fff" : "#94a3b8",
                  cursor: formuleGroupeChoisie ? "pointer" : "not-allowed" }}>
                {formuleGroupeChoisie ? "Continuer vers le choix de l'assistante →" : "Choisissez une formule"}
              </button>
            </div>
          )}

          {step === 3.5 && (
            <div style={{ animation:"pmFU .3s ease" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, background:"#eef1ff", border:"1.5px solid #bae6fd", borderRadius:12, padding:"12px 14px", marginBottom:20 }}>
                <Avatar a={assistante} size={40} />
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:800, fontSize:".85rem", color:BET_DARK }}>{assistante?.prenom} {assistante?.nom}</div>
                  <div style={{ fontSize:".72rem", color:"#64748b" }}>En ligne · Coaching de groupe</div>
                </div>
                <span style={{ background:"#f0fdf4", color:"#16a34a", borderRadius:999, padding:"3px 10px", fontSize:".7rem", fontWeight:700, flexShrink:0 }}>✓ Connecté(e)</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:16 }}>
                <div><label style={labelStyle}>Nom complet *</label>
                  <input value={form.nom} readOnly={!!(sbUser && form.nom)} onChange={e => { setForm(f=>({...f,nom:e.target.value})); setFormErrors(fe=>({...fe,nom:""})); }} placeholder="Ex : Kouamé Yao" style={{ ...(sbUser && form.nom ? lockedInputStyle : inputStyle), borderColor: formErrors.nom ? "#ff2945" : "#e2e8f0" }} />
                  {formErrors.nom && <p style={errStyle}>{formErrors.nom}</p>}</div>
                <div><label style={labelStyle}>Numéro WhatsApp *</label>
                  <input value={form.telephone} readOnly={!!(sbUser && form.telephone)} onChange={e => { setForm(f=>({...f,telephone:e.target.value})); setFormErrors(fe=>({...fe,telephone:""})); }} placeholder="+225 07 XX XX XX" style={{ ...(sbUser && form.telephone ? lockedInputStyle : inputStyle), borderColor: formErrors.telephone ? "#ff2945" : "#e2e8f0" }} />
                  {formErrors.telephone && <p style={errStyle}>{formErrors.telephone}</p>}</div>
              </div>
              {/* Code promo - step 3.5 */}
              <div style={{ marginBottom:16 }}>
                <p style={{ fontSize:".78rem", fontWeight:700, color:"#374151", marginBottom:8 }}>🏷️ Code promo <span style={{ fontWeight:400, color:"#94a3b8" }}>(optionnel)</span></p>
                {codePromoApplied ? (
                  <div style={{ display:"flex", alignItems:"center", gap:10, background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:10, padding:"10px 14px" }}>
                    <span style={{ fontSize:"1.1rem" }}>✅</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:800, fontSize:".82rem", color:"#166534" }}>{codePromoApplied.code} appliqué !</div>
                      <div style={{ fontSize:".72rem", color:"#166534" }}>Réduction : {codePromoApplied.type_reduction === "pourcentage" ? `-${codePromoApplied.valeur}%` : `-${Number(codePromoApplied.valeur).toLocaleString("fr-FR")} FCFA`}{codePromoApplied.description && ` · ${codePromoApplied.description}`}</div>
                    </div>
                    <button onClick={() => { setCodePromoApplied(null); setCodePromo(""); setCodePromoError(""); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:16, padding:0 }}>✕</button>
                  </div>
                ) : (
                  <div style={{ display:"flex", gap:8 }}>
                    <input value={codePromo} onChange={e => { setCodePromo(e.target.value.toUpperCase()); setCodePromoError(""); }}
                      onKeyDown={e => e.key === "Enter" && validerCodePromo("en_ligne")}
                      placeholder="Ex : BET2025"
                      style={{ flex:1, padding:"10px 13px", border:`1.5px solid ${codePromoError?"#ff2945":"#e2e8f0"}`, borderRadius:9, fontSize:".82rem", fontFamily:"monospace", letterSpacing:1, outline:"none" }} />
                    <button onClick={() => validerCodePromo("en_ligne")} disabled={!codePromo.trim() || codePromoLoading}
                      style={{ padding:"0 16px", background:BET_BLUE, color:"#fff", border:"none", borderRadius:9, cursor:"pointer", fontWeight:700, fontSize:".78rem", opacity:(!codePromo.trim()||codePromoLoading)?.5:1, whiteSpace:"nowrap" }}>
                      {codePromoLoading ? "⏳" : "Appliquer"}
                    </button>
                  </div>
                )}
                {codePromoError && <p style={{ margin:"5px 0 0", fontSize:".72rem", color:"#ff2945" }}>{codePromoError}</p>}
              </div>

              {/* LE MONTANT EST TOUJOURS AFFICHÉ, code promo ou non. Auparavant ce bloc ne
                  s'ouvrait qu'en présence d'une réduction : le client qui avait choisi une
                  formule arrivait sur un écran de confirmation muet sur le prix, et ne
                  découvrait le montant qu'une fois chez TouchPoint. */}
              {montantReference && (() => {
                const montantFinal = calcMontantReduit(montantReference, codePromoApplied);
                return (
                  <div style={{ background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"12px 14px", marginBottom:14 }}>
                    {formuleGroupeChoisie && (
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, fontSize:".78rem", marginBottom:8, paddingBottom:8, borderBottom:"1px solid #e2e8f0" }}>
                        <div>
                          <div style={{ fontWeight:800, color:BET_DARK }}>Formule {formuleGroupeChoisie.label}</div>
                          {formuleGroupeChoisie.frequence && <div style={{ fontSize:".72rem", color:"#64748b", marginTop:2 }}>{formuleGroupeChoisie.frequence}</div>}
                        </div>
                        <span style={{ fontWeight:700, color:"#059669", whiteSpace:"nowrap" }}>{formuleGroupeChoisie.tarif.toLocaleString("fr-FR")} F / mois</span>
                      </div>
                    )}
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:".78rem", color:"#64748b", marginBottom:codePromoApplied?4:8 }}>
                      <span>Montant initial</span>
                      <span>{montantReference.toLocaleString("fr-FR")} FCFA</span>
                    </div>
                    {codePromoApplied && (
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:".78rem", color:"#16a34a", fontWeight:700, marginBottom:8 }}>
                        <span>Réduction ({codePromoApplied.code})</span>
                        <span>-{(montantReference-montantFinal).toLocaleString("fr-FR")} FCFA</span>
                      </div>
                    )}
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:".92rem", fontWeight:800, color:"#0c33ac", paddingTop:8, borderTop:"1px solid #e2e8f0" }}>
                      <span>Total à payer</span>
                      <span>{montantFinal.toLocaleString("fr-FR")} FCFA</span>
                    </div>
                  </div>
                );
              })()}

              <div style={{ display:"flex", alignItems:"flex-start", gap:10, background:"#eef1ff", border:"1.5px solid #bae6fd", borderRadius:12, padding:"12px 14px", marginBottom:14 }}>
                <span style={{ fontSize:"1.1rem", flexShrink:0 }}>💬</span>
                <p style={{ margin:0, fontSize:".78rem", color:"#0c33ac", lineHeight:1.6 }}>
                  {montantReference
                    ? "Vous allez être redirigé(e) vers TouchPoint pour finaliser votre paiement en toute sécurité."
                    : <>Après confirmation, <strong>{assistante?.prenom || "votre assistante"}</strong> vous contactera directement par WhatsApp ou téléphone pour finaliser votre inscription.</>}
                </p>
              </div>
              <button onClick={submitAssignation} disabled={submitting}
                style={{ ...primaryBtn, opacity:submitting ? .5 : 1, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                {submitting ? <><div style={{ width:14,height:14,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"pmSpin .7s linear infinite" }}/>Envoi…</> : "Confirmer mon inscription →"}
              </button>
            </div>
          )}

          {/* ═══ STEP 6 : domicile OU coaching privé en ligne OU coaching privé présentiel ═══ */}
          {step === 6 && !loading && (() => {
            const isCoachingPriveEnLigne    = modeCours === "en_ligne"   && typeCoaching === "prive";
            const isCoachingPrivePresentiel = modeCours === "presentiel" && typeCoaching === "prive";
            // Grille coaching privé effective : si le centre choisi a sa propre grille
            // (activée depuis le dashboard SuperAdmin), on l'utilise à la place de la
            // grille globale coaching_prive_config.
            const centreMasterChoisi = isCoachingPrivePresentiel && centreChoisi ? findMaster(centreChoisi) : null;
            const grillePriveeActive = formulesPriveDeLOffre
              || (centreMasterChoisi?.grilleTarifaire?.coachingPrive?.actif
              ? { classique: centreMasterChoisi.grilleTarifaire.coachingPrive.classique, intensive: centreMasterChoisi.grilleTarifaire.coachingPrive.intensive }
              : grillePrivePM);
            const accentColor  = isCoachingPrivePresentiel ? "#7c3aed" : isCoachingPriveEnLigne ? "#0c33ac" : "#059669";
            const accentDark   = isCoachingPrivePresentiel ? "#4c1d95" : isCoachingPriveEnLigne ? "#011451" : "#065f46";
            const accentBg     = isCoachingPrivePresentiel ? "#f5f3ff" : isCoachingPriveEnLigne ? "#eff6ff" : "#f0fdf4";
            const accentBorder = isCoachingPrivePresentiel ? "#ddd6fe" : isCoachingPriveEnLigne ? "#bfdbfe" : "#bbf7d0";
            return (
            <div style={{ animation:"pmFU .3s ease" }}>
              <button onClick={() => paiementDomicile ? setPaiementDomicile(false) : setStep(isCoachingPrivePresentiel ? "p1" : isCoachingPriveEnLigne ? 1 : 0)} style={backBtn}>← Retour</button>
              <div style={{ display:"flex", alignItems:"center", gap:12, background:accentBg, border:`1.5px solid ${accentBorder}`, borderRadius:12, padding:"12px 16px", marginBottom:20 }}>
                <div style={{ width:40, height:40, borderRadius:10, background:`linear-gradient(135deg,${accentColor},${accentDark})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.3rem", flexShrink:0 }}>
                  {isCoachingPrivePresentiel ? "🏢" : isCoachingPriveEnLigne ? "🧑‍💼" : "🏠"}
                </div>
                <div>
                  <div style={{ fontWeight:800, fontSize:".85rem", color:accentDark }}>
                    {isCoachingPrivePresentiel
                      ? `Coaching Privé Présentiel${centreChoisi?.nom ? " - " + centreChoisi.nom : ""}${offreChoisie?.label ? " - " + offreChoisie.label : ""}`
                      : isCoachingPriveEnLigne
                        ? `Coaching Privé En Ligne${offreChoisie?.label ? " - " + offreChoisie.label : ""}`
                        : "Cours à domicile / Cours privé"}
                  </div>
                  <div style={{ fontSize:".75rem", color:accentColor, lineHeight:1.5, marginTop:2 }}>
                    {assistante ? <><strong>{assistante.prenom} {assistante.nom}</strong> vous accompagnera pour ce dossier.</> : "Votre assistante vous accompagnera pour ce dossier."}
                  </div>
                </div>
              </div>
              {sbUser && <div style={{ fontSize:".75rem", color:accentColor, background:accentBg, border:`1px solid ${accentBorder}`, borderRadius:8, padding:"7px 12px", marginBottom:14 }}>✓ Coordonnées pré-remplies depuis votre compte</div>}

              {/* ── Pack / Lieu selector (tous les cours privés + domicile) ── */}
              {(isCoachingPriveEnLigne || isCoachingPrivePresentiel || modeCours === "domicile") && (
                <div style={{ background:accentBg, border:`1.5px solid ${accentBorder}`, borderRadius:14, padding:16, marginBottom:16 }}>
                  <div style={{ fontSize:".78rem", fontWeight:800, color:accentDark, marginBottom:12 }}>💰 Choisissez votre pack de coaching</div>

                  {/* Pack cards */}
                  <div className="pm-pack-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                    {Object.entries(grillePriveeActive).map(([key, pack]) => {
                      const effectiveLieu = modeCours === "domicile" ? "domicile" : lieuChoix;
                      const prix = pack[effectiveLieu] || pack.cabinet;
                      const selected = packChoix === key;
                      return (
                        <button key={key} type="button" onClick={() => setPackChoix(key)}
                          style={{ background: selected ? `linear-gradient(135deg,${accentColor},${accentDark})` : "#fff", border: selected ? `2px solid ${accentColor}` : `1.5px solid ${accentBorder}`, borderRadius:12, padding:"12px 10px", cursor:"pointer", textAlign:"left", transition:"all .15s", color: selected ? "#fff" : accentDark }}>
                          <div style={{ fontWeight:800, fontSize:".82rem", marginBottom:3 }}>{pack.label || key}</div>
                          <div style={{ fontSize:".7rem", opacity:.85, marginBottom:6, lineHeight:1.3 }}>{pack.frequence}</div>
                          <div style={{ fontWeight:900, fontSize:"1rem" }}>
                            {prix ? Number(prix).toLocaleString("fr-FR") + " FCFA" : "Sur devis"}
                          </div>
                          <div style={{ fontSize:".65rem", opacity:.75, marginTop:1 }}>/mois</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Lieu du coaching - fixé automatiquement selon le parcours d'entrée, plus de
                      choix ici : "En ligne" → toujours en ligne, "Présentiel" → toujours au centre
                      déjà choisi à l'étape précédente, "À domicile" → toujours à domicile. */}
                  {isCoachingPriveEnLigne && (
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, fontSize:".8rem", fontWeight:700, color:accentDark, background:"#fff", border:`1.5px solid ${accentBorder}`, borderRadius:10, padding:"9px 12px" }}>
                      💻 Lieu du coaching : En ligne
                    </div>
                  )}

                  {/* Recap banner */}
                  {(() => {
                    const effectiveLieu = modeCours === "domicile" ? "domicile" : lieuChoix;
                    const pack = grillePriveeActive[packChoix];
                    const prix = pack?.[effectiveLieu] || pack?.cabinet;
                    return (
                      <div style={{ background:`linear-gradient(135deg,${accentColor},${accentDark})`, borderRadius:10, padding:"12px 14px", color:"#fff", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div>
                          <div style={{ fontWeight:800, fontSize:".82rem" }}>Pack {pack?.label || packChoix} · {effectiveLieu === "en_ligne" ? "En ligne" : effectiveLieu === "cabinet" ? "Au cabinet" : "À domicile"}</div>
                          <div style={{ fontSize:".7rem", opacity:.8, marginTop:2 }}>{pack?.frequence}</div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontWeight:900, fontSize:"1.05rem" }}>{prix ? Number(prix).toLocaleString("fr-FR") + " FCFA" : "Sur devis"}</div>
                          <div style={{ fontSize:".65rem", opacity:.75 }}>/mois</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {!paiementDomicile ? (<>
                <div><label style={labelStyle}>Nom complet *</label><input value={form.nom} readOnly={!!(sbUser && form.nom)} onChange={e => { setForm(f=>({...f,nom:e.target.value})); setFormErrors(fe=>({...fe,nom:""})); }} placeholder="Ex : Kouamé Yao" style={{ ...(sbUser && form.nom ? lockedInputStyle : inputStyle), borderColor: formErrors.nom?"#ff2945":"#e2e8f0" }}/>{formErrors.nom&&<p style={errStyle}>{formErrors.nom}</p>}</div>
                <div><label style={labelStyle}>Numéro WhatsApp *</label><input value={form.telephone} readOnly={!!(sbUser && form.telephone)} onChange={e=>{setForm(f=>({...f,telephone:e.target.value}));setFormErrors(fe=>({...fe,telephone:""}));}} placeholder="+225 07 XX XX XX" style={{...(sbUser && form.telephone ? lockedInputStyle : inputStyle),borderColor:formErrors.telephone?"#ff2945":"#e2e8f0"}}/>{formErrors.telephone&&<p style={errStyle}>{formErrors.telephone}</p>}</div>
                <div><label style={labelStyle}>E-mail <span style={{color:"#94a3b8",fontWeight:400}}>(optionnel)</span></label><input value={form.email} readOnly={!!(sbUser && form.email)} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="votre@email.com" type="email" style={sbUser && form.email ? lockedInputStyle : inputStyle}/></div>

                {/* Adresse : toujours visible pour domicile, et pour cours privé quand lieu = "à domicile" */}
                {(modeCours === "domicile" || ((isCoachingPriveEnLigne || isCoachingPrivePresentiel) && lieuChoix === "domicile")) && (
                  <div><label style={labelStyle}>Quartier / Zone / Adresse *</label><input value={zoneForm} onChange={e=>{setZoneForm(e.target.value);setFormErrors(fe=>({...fe,zone:""}));}} placeholder="Ex : Cocody Riviera, Angré 7ème tranche…" style={{...inputStyle,borderColor:formErrors.zone?"#ff2945":"#e2e8f0"}}/>{formErrors.zone&&<p style={errStyle}>{formErrors.zone}</p>}</div>
                )}

                {/* Centre affiché en lecture seule quand lieu = "Au cabinet" et centre déjà sélectionné */}
                {(isCoachingPrivePresentiel) && lieuChoix === "cabinet" && centreChoisi?.nom && (
                  <div>
                    <label style={labelStyle}>Cabinet BET</label>
                    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 13px", background:accentBg, border:`1.5px solid ${accentBorder}`, borderRadius:10 }}>
                      <span style={{ fontSize:"1.1rem" }}>🏢</span>
                      <span style={{ fontWeight:700, fontSize:".88rem", color:accentDark }}>{centreChoisi.nom}</span>
                      <span style={{ marginLeft:"auto", fontSize:".7rem", color:accentColor, fontWeight:600 }}>Sélectionné</span>
                    </div>
                  </div>
                )}
                <div>
                  <label style={labelStyle}>Votre disponibilité *</label>
                  {/* Chips jours */}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:6, borderRadius:10, border: formErrors.dispos ? "1.5px solid #ff2945" : "none", padding: formErrors.dispos ? "8px" : 0 }}>
                    {JOURS_ORDER.map(jour => {
                      const active = disponForm.some(d => d.jour === jour);
                      return (
                        <button key={jour} type="button"
                          onClick={() => { toggleDispoJour(jour); setFormErrors(fe=>({...fe,dispos:""})); }}
                          style={{ padding:"7px 16px", borderRadius:20, border:`2px solid ${active?accentColor:"#e2e8f0"}`,
                            background:active?accentBg:"#f8fafc", color:active?accentDark:"#64748b",
                            fontWeight:700, fontSize:".8rem", cursor:"pointer", transition:"all .15s" }}>
                          {jour}
                        </button>
                      );
                    })}
                  </div>
                  {/* Lignes heure début par jour sélectionné */}
                  {disponForm.length > 0 && (
                    <div style={{ display:"flex", flexDirection:"column", gap:7, marginTop:10 }}>
                      {disponForm.map(row => (
                        <div key={row.jour} style={{ display:"flex", alignItems:"center", gap:10, background:accentBg, borderRadius:10, padding:"8px 12px", border:`1.5px solid ${accentBorder}` }}>
                          <span style={{ fontWeight:800, fontSize:".82rem", color:accentDark, minWidth:34 }}>{row.jour}</span>
                          <span style={{ color:"#94a3b8", fontSize:".75rem", flexShrink:0 }}>à partir de</span>
                          <input type="time" value={row.debut}
                            onChange={e => { setDispoDebut(row.jour, e.target.value); setFormErrors(fe=>({...fe,dispos:""})); }}
                            style={{ padding:"5px 8px", borderRadius:8, border:`1px solid ${accentBorder}`, fontSize:".82rem", outline:"none", cursor:"pointer", background:"#fff", color:"#0f172a" }}/>
                          <button type="button"
                            onClick={() => setDisponForm(prev => prev.filter(d => d.jour !== row.jour))}
                            style={{ marginLeft:"auto", background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:".88rem", padding:"2px 6px", borderRadius:6, lineHeight:1, flexShrink:0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {disponForm.length === 0 && !formErrors.dispos && (
                    <p style={{ fontSize:".72rem", color:"#94a3b8", margin:"6px 0 0" }}>Cliquez sur un jour pour le sélectionner</p>
                  )}
                  {formErrors.dispos && <p style={errStyle}>{formErrors.dispos}</p>}
                </div>
                <button onClick={() => { if (validateForm()) setPaiementDomicile(true); }} style={{ ...primaryBtn, background:`linear-gradient(135deg,${accentColor},${accentDark})`, display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginTop:4 }}>
                  Continuer vers le paiement →
                </button>
                </>) : (<>
                <button onClick={submitDomicile} disabled={submitting}
                  style={{ ...primaryBtn, background:`linear-gradient(135deg,${accentColor},${accentDark})`, opacity:submitting?.5:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginTop:4 }}>
                  {submitting ? <><div style={{ width:14,height:14,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"pmSpin .7s linear infinite" }}/>Envoi…</> : "📩 Envoyer ma demande →"}
                </button>
                </>)}
              </div>
            </div>
            );
          })()}
         

          {/* ═══ STEP 4 : Succès ═══ */}
          {step === 4 && (() => {
            const isPriveFlow = typeCoaching === "prive" || modeCours === "domicile";
            const isPrivePresentiel = modeCours === "presentiel" && typeCoaching === "prive";
            const successIcon  = isPrivePresentiel ? "🏢" : modeCours === "domicile" ? "🏠" : "✓";
            const successBg    = isPrivePresentiel ? "linear-gradient(135deg,#7c3aed,#4c1d95)" : modeCours === "domicile" ? "linear-gradient(135deg,#059669,#065f46)" : "linear-gradient(135deg,#22c55e,#16a34a)";
            const successTitle = "Assistante assignée !";
            return (
            <div style={{ animation:"pmFU .4s ease" }}>
              <div style={{ textAlign:"center", marginBottom:22 }}>
                <div style={{ width:70, height:70, borderRadius:"50%", background:successBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"2rem", margin:"0 auto 14px", boxShadow:"0 8px 24px rgba(34,197,94,.3)" }}>
                  {successIcon}
                </div>
                <h3 style={{ fontFamily:F, color:BET_DARK, fontWeight:800, fontSize:"1.2rem", margin:"0 0 6px" }}>
                  {successTitle}
                </h3>
                <p style={{ color:"#475569", fontSize:".86rem", lineHeight:1.6, margin:0 }}>
                  <strong>{assistante?.prenom} {assistante?.nom}</strong> a été notifiée et vous contactera sous peu.
                </p>
              </div>

              {(
                <div style={{ background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:14, padding:"14px 16px", marginBottom:18 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom: offreChoisie ? 12 : 0 }}>
                    <Avatar a={assistante} size={50} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:800, color:BET_DARK, fontSize:".95rem" }}>{assistante?.prenom} {assistante?.nom}</div>
                      <div style={{ fontSize:".74rem", color:"#64748b", marginTop:2 }}>
                        {modeCours === "domicile" ? "À domicile · Privé"
                          : modeCours === "en_ligne" ? `En ligne · ${typeCoaching==="groupe"?"Groupe":"Privé"}`
                          : `Présentiel · ${centreChoisi?.nom||""} · ${typeCoaching==="groupe"?"Groupe":"Privé"}`}
                      </div>
                      {assistante?.telephone && <div style={{ fontSize:".74rem", color:"#0891b2", marginTop:3 }}>📞 {assistante.telephone}</div>}
                    </div>
                    <span style={{ background:"#dcfce7", color:"#16a34a", borderRadius:999, padding:"4px 10px", fontSize:".7rem", fontWeight:800, flexShrink:0 }}>✓ Assignée</span>
                  </div>
                  {offreChoisie && (
                    <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 10px", borderRadius:8, background:`${BET_BLUE}08`, border:`1px solid ${BET_BLUE}20` }}>
                      <span style={{ fontSize:".8rem", fontWeight:700, color:BET_DARK }}>{offreChoisie.label}</span>
                      <span style={{ fontSize:".8rem", fontWeight:800, color:BET_BLUE }}>{offreChoisie.prix}</span>
                    </div>
                  )}
                </div>
              )}

              {isPriveFlow && (
                <div style={{ background: isPrivePresentiel ? "#f5f3ff" : modeCours === "domicile" ? "#f0fdf4" : "#eff6ff", border:`1.5px solid ${isPrivePresentiel ? "#ddd6fe" : modeCours === "domicile" ? "#bbf7d0" : "#bfdbfe"}`, borderRadius:12, padding:"14px 16px", marginBottom:18 }}>
                  {[
                    { label:"Nom",     val:form.nom },
                    { label:"WhatsApp", val:form.telephone },
                    { label:"Email",   val:form.email||"-" },
                    ...(modeCours === "domicile" ? [{ label:"Zone", val:zoneForm||"-" }] : []),
                    ...(isPrivePresentiel && centreChoisi ? [{ label:"Cabinet", val:centreChoisi.nom }] : []),
                    ...(offreChoisie ? [{ label:"Offre", val:offreChoisie.label }] : []),
                    { label:"Dispos", val:disponForm.length>0?disponForm.map(h=>`${h.jour} ${h.debut}`).join(", "):"-" },
                  ].map(r => (
                    <div key={r.label} style={{ display:"flex", justifyContent:"space-between", fontSize:".78rem", color:"#047857", marginBottom:4 }}>
                      <span style={{ color:"#64748b" }}>{r.label}</span><strong>{r.val}</strong>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {assistante?.telephone && (
                  <a href={`https://wa.me/${(assistante.telephone||"").replace(/[\s+\-()]/g,"")}`} target="_blank" rel="noopener noreferrer"
                    style={{ display:"flex", alignItems:"center", gap:12, background:"#22c55e", color:"#fff", borderRadius:12, padding:"13px 18px", textDecoration:"none", fontWeight:800, fontSize:".9rem", fontFamily:F }}>
                    <svg width="20" height="20" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="16" fill="#fff" fillOpacity=".2"/><path d="M23.5 19.9c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2c-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.9-1.6.1-.2 0-.4-.1-.5-.1-.2-.7-1.8-1-2.4-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1.1 1.1-1.1 2.6s1.1 3 1.3 3.2c.2.2 2.2 3.4 5.3 4.7 2 .9 2.7.9 3.7.8.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3z" fill="#fff"/></svg>
                    Écrire sur WhatsApp
                  </a>
                )}
                <button onClick={() => { handleClose(); navigate("/mon-espace"); }}
                  style={{ display:"flex", alignItems:"center", gap:12, background: isPriveFlow ? `linear-gradient(135deg,${isPrivePresentiel?"#7c3aed,#4c1d95":"#059669,#065f46"})` : `linear-gradient(135deg,${BET_BLUE},${BET_NAVY})`, color:"#fff", borderRadius:12, padding:"13px 18px", border:"none", cursor:"pointer", fontWeight:800, fontSize:".9rem", fontFamily:F }}>
                  <span style={{ fontSize:"1.2rem" }}>💬</span>
                  {isPriveFlow ? "Accéder à Mon Espace" : "Discuter dans Mon Espace"}
                </button>
              </div>
              <button onClick={handleClose} style={{ ...backBtn, justifyContent:"center", width:"100%", padding:"10px 0", fontSize:".82rem", marginTop:10 }}>Fermer</button>
            </div>
            );
          })()}

        </div>
      </div>
    </div>
  );
}

/* ── Styles ── */
const primaryBtn = { width:"100%", background:`linear-gradient(135deg,${BET_BLUE},${BET_NAVY})`, color:"#fff", border:"none", borderRadius:999, padding:"12px", fontWeight:800, fontSize:".9rem", cursor:"pointer", fontFamily:F, transition:"opacity .2s" };
const backBtn    = { background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:".82rem", marginBottom:16, display:"flex", alignItems:"center", gap:4, padding:0 };
const labelStyle = { display:"block", fontSize:".75rem", fontWeight:700, color:BET_DARK, marginBottom:5 };
const inputStyle = { width:"100%", padding:"11px 13px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:".88rem", fontFamily:F, boxSizing:"border-box", outline:"none" };
const lockedInputStyle = { ...inputStyle, background:"#f1f5f9", color:"#64748b", cursor:"not-allowed" };
const errStyle   = { color:"#ff2945", fontSize:".72rem", margin:"4px 0 0" };
