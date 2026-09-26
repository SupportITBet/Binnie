import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../config/supabase";
import { payerAvecTouchPoint, parsePrixFCFA } from "../../utils/touchpoint";
import { ga4 } from "../../utils/ga4";

const API              = process.env.REACT_APP_API_URL || "http://localhost:5001";
const CENTRES_MASTER_KEY     = "bet_centres_master";
const LS_OFFRES_EN_LIGNE_KEY = "bet_offres_en_ligne";
const DEFAULT_BROCHURE_URL = "https://pdfobject.com/pdf/sample.pdf";
const F        = "'Montserrat', 'Segoe UI', sans-serif";
const BET_BLUE = "#0891b2";
const BET_DARK = "#011451";
const BET_NAVY = "#0c33ac";
const BET_GREEN= "#16a34a";

// Mots-clés utilisés pour ne retenir, dans le vrai catalogue, que les offres
// pertinentes pour un enfant (partagé entre le filtrage en_ligne et présentiel).
const KW_ENFANT = ["enfant","junior","ado","adolescent","jeune","kid","child","6-","8-","11-","14-"];

// Lit le type de coaching depuis la config réelle (champ type_coaching), avec un
// repli sur le libellé si l'offre n'a pas encore ce champ - même logique que
// ParcoursModal.jsx (flux adulte), pour router correctement vers le PA Advisor
// quand l'offre choisie est un coaching privé.
const inferTypeCoaching = (offre) => {
  if (!offre) return null;
  if (offre.type_coaching) return offre.type_coaching;
  const l = (offre.label || "").toLowerCase();
  if (l.includes("priv") || l.includes("particulier") || l.includes("individu")) return "prive";
  return "groupe";
};

/* Les formules d'une offre, telles que le SuperAdmin les configure. Elles priment sur le
   prix générique : deux rythmes d'une même offre n'ont pas le même tarif, et c'est celui
   de la formule qui sera facturé. Une offre sans formule active reste affichée comme
   avant - le tunnel ne dépend pas de leur présence. */
const formulesDe = (offre) => {
  if (offre?.formules_actif !== true) return [];
  return (offre.formules || []).filter(f => f?.label && Number(f.tarif) > 0);
};

const TRANCHES = [
  { val:"4-5",   label:"4 – 5 ans",   icon:"🧒", desc:"Éveil linguistique - jeux et chansons" },
  { val:"6-7",   label:"6 – 7 ans",   icon:"👧", desc:"Initiation A1 - lecture et oral" },
  { val:"8-10",  label:"8 – 10 ans",  icon:"🧑", desc:"Niveau A1 – A2 - bases solides" },
  { val:"11-13", label:"11 – 13 ans", icon:"👦", desc:"Niveau A2 – B1 - collège" },
  { val:"14-17", label:"14 – 17 ans", icon:"🎓", desc:"Niveau B1 – B2 - lycée & certif." },
];

const STEP_TITLES = [
  "Votre enfant",
  "Coordonnées du parent",
  "Mode de cours",
  "Votre assistante",
  "Paiement & confirmation",
  "Inscription envoyée !",
];

if (!document.querySelector("#em-styles")) {
  const s = document.createElement("style");
  s.id = "em-styles";
  s.textContent = `
    @keyframes emFU    { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
    @keyframes emSpin  { to{transform:rotate(360deg)} }
    @keyframes emIn    { from{opacity:0;transform:scale(.96)} to{opacity:1;transform:scale(1)} }
    @keyframes emSlide { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
    .em-overlay { position:fixed;inset:0;background:rgba(10,20,50,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px); }
    .em-box { background:#fff;border-radius:24px;width:100%;max-width:900px;max-height:95vh;overflow-y:auto;box-shadow:0 32px 80px rgba(0,0,0,.28);animation:emIn .25s ease; }
    .em-assistant:hover { border-color:#0891b2!important;transform:translateY(-2px)!important; }
    .em-centre-grid { display:grid;grid-template-columns:1fr 1fr;gap:12px; }
    .em-assist-grid  { display:grid;grid-template-columns:1fr 1fr;gap:12px; }
    @media(max-width:540px){ .em-grid2{grid-template-columns:1fr!important;} .em-centre-grid{grid-template-columns:1fr!important;} .em-assist-grid{grid-template-columns:1fr!important;} .em-overlay{align-items:flex-start!important;overflow-y:auto!important;padding-top:16px!important;padding-bottom:16px!important;} }
  `;
  document.head.appendChild(s);
}

/* ── Step dots ── */
function StepDots({ step, total }) {
  return (
    <div style={{ display:"flex", gap:6, justifyContent:"center", marginBottom:28 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === step ? 22 : 8, height:8, borderRadius:999,
          background: i < step ? "#22c55e" : i === step ? BET_BLUE : "#e2e8f0",
          transition:"all .3s"
        }} />
      ))}
    </div>
  );
}

/* ── Sélecteur de formule ─────────────────────────────────────────────────────
   Rendu dans le panneau déjà ouvert, sous les offres, plutôt qu'en étape ou en modal
   imbriqué : le parcours parent compte déjà cinq étapes, et ce choix découle directement
   de l'offre qu'on vient de cocher - le séparer d'un écran aurait coupé le raisonnement
   en deux. Le même composant sert au groupe et au privé : ce sont les mêmes données. ── */
function SelecteurFormules({ offre, valeur, onChange, color }) {
  const formules = formulesDe(offre);
  if (formules.length === 0) return null;
  const prive = offre?.type_coaching === "prive";
  return (
    <div style={{ marginBottom:14 }}>
      <p style={{ fontSize:".72rem", fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:".05em", margin:"0 0 8px" }}>
        {prive ? "Rythme du suivi individuel" : "Choisissez votre rythme"}
      </p>
      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        {formules.map(f => {
          const s = valeur?.id === f.id;
          return (
            <div key={f.id} onClick={() => onChange(s ? null : f)}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:11,
                border:`2px solid ${s ? color : "#e2e8f0"}`, background: s ? `${color}08` : "#fff",
                cursor:"pointer", transition:"all .15s" }}>
              <div style={{ width:16, height:16, borderRadius:"50%", border:`2px solid ${s ? color : "#cbd5e1"}`,
                background: s ? color : "#fff", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {s && <div style={{ width:5, height:5, borderRadius:"50%", background:"#fff" }} />}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:".8rem", color: s ? color : BET_DARK }}>{f.label}</div>
                {f.frequence && <div style={{ fontSize:".68rem", color:"#64748b", marginTop:1 }}>{f.frequence}</div>}
              </div>
              <div style={{ fontWeight:800, fontSize:".8rem", color: s ? color : BET_DARK, flexShrink:0, whiteSpace:"nowrap" }}>
                {Number(f.tarif).toLocaleString("fr-FR")} F<span style={{ fontSize:".62rem", fontWeight:600, color:"#94a3b8" }}>/mois</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Avatar ── */
function Avatar({ a, size = 46 }) {
  const ini = `${a.prenom?.[0]||""}${a.nom?.[0]||""}`.toUpperCase();
  const src = a.photo_url || a.avatar_url || null;
  return src
    ? <img src={src} alt={a.prenom} style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} />
    : <div style={{ width:size, height:size, borderRadius:"50%", background:`linear-gradient(135deg,${BET_NAVY},${BET_BLUE})`, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:Math.max(10,size*.3), flexShrink:0, fontFamily:F }}>{ini||"?"}</div>;
}

/* ── Jours pills (disponibilité de l'assistante - même affichage que ParcoursModal.jsx) ── */
const JOURS_COURT_EM   = { lundi:"Lun", mardi:"Mar", mercredi:"Mer", jeudi:"Jeu", vendredi:"Ven", samedi:"Sam", dimanche:"Dim" };
const JOURS_SEMAINE_EM = ["lundi","mardi","mercredi","jeudi","vendredi"];
const JOURS_WEEKEND_EM = ["samedi","dimanche"];
function JoursPills({ jours }) {
  const list = jours || JOURS_SEMAINE_EM;
  return (
    <div style={{ display:"flex", gap:3, justifyContent:"center", flexWrap:"wrap" }}>
      {list.map(j => (
        <span key={j} style={{ fontSize:".58rem", fontWeight:800, padding:"2px 6px", borderRadius:4,
          background: JOURS_WEEKEND_EM.includes(j) ? "#fef3c7" : "#eef1ff",
          color:      JOURS_WEEKEND_EM.includes(j) ? "#92400e" : "#0c33ac" }}>
          {JOURS_COURT_EM[j] || j}
        </span>
      ))}
    </div>
  );
}

/* ── AvatarStack ── */
function AvatarStack({ assistantes = [], size = 26, max = 4 }) {
  const shown   = assistantes.slice(0, max);
  const surplus = assistantes.length - max;
  return (
    <div style={{ display:"flex", alignItems:"center" }}>
      {shown.map((a, i) => (
        <div key={a.id} title={`${a.prenom} ${a.nom}`}
          style={{ marginLeft: i === 0 ? 0 : -(size * 0.3), zIndex: shown.length - i, position:"relative" }}>
          <Avatar a={a} size={size} />
        </div>
      ))}
      {surplus > 0 && (
        <div style={{ marginLeft:-(size * 0.3), width:size, height:size, borderRadius:"50%",
          background:"#f1f5f9", border:"2px solid #fff", display:"flex", alignItems:"center",
          justifyContent:"center", fontSize:size * .28, fontWeight:800, color:"#64748b" }}>
          +{surplus}
        </div>
      )}
    </div>
  );
}

/* ── Spinner inline ── */
function Spinner() {
  return <div style={{ width:14, height:14, border:"2px solid rgba(255,255,255,.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"emSpin .7s linear infinite" }} />;
}

/* ════════════════════════════════════════════════════════
   MODAL PRINCIPAL
════════════════════════════════════════════════════════ */
export default function EnfantParcoursModal({ isOpen, onClose }) {
  const [step,       setStep]       = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [erreur,     setErreur]     = useState("");

  // Data
  const [centres,             setCentres]             = useState([]);
  const [centresMaster,       setCentresMaster]       = useState([]);
  const [offresEnLigneToutes, setOffresEnLigneToutes] = useState([]);
  const [centreAssistantesMap,setCentreAssistantesMap]= useState({});
  const [assistantes,         setAssistantes]         = useState([]);
  const [loadingAss,          setLoadingAss]          = useState(false);
  const [loadingAssLigne,     setLoadingAssLigne]     = useState(false);
  // Assignation déjà existante POUR CET ENFANT précis (scope parent+enfant) -
  // sert à réutiliser automatiquement la même assistante pour le même canal.
  const [assignationExistante, setAssignationExistante] = useState(null);

  // Form
  const [enfant,       setEnfant]       = useState({ prenom:"", nom:"", tranche_age:"" });
  const [parent,       setParent]       = useState({ nom:"", email:"", tel:"" });
  const [parentErrors, setParentErrors] = useState({});
  // true si les coordonnées ci-dessus proviennent d'un compte parent déjà connecté
  // (session Supabase) - dans ce cas on les affiche en lecture seule plutôt que de
  // laisser le parent modifier des infos déjà vérifiées sur son compte.
  const [parentConnecte, setParentConnecte] = useState(false);

  // Mode & sélection
  const [modeCours,         setModeCours]         = useState(null);
  const [offreChoisie,      setOffreChoisie]      = useState(null);
  const [offreEnLigne,      setOffreEnLigne]      = useState(null);
  /* LA FORMULE RETENUE, dernier écran du tunnel public à l'ignorer. Les offres enfants
     portent pourtant leurs formules (Week-end, 2×/semaine… ; Classique, Intensive pour le
     privé) : le parent choisissait donc son offre sans voir le rythme, et le dossier
     partait chez l'assistante avec le prix générique de l'offre - sans le détail dont
     l'Onboarding a besoin pour affecter l'enfant à une classe. */
  const [formuleChoisie, setFormuleChoisie] = useState(null);
  const [centreChoisi,      setCentreChoisi]      = useState(null);
  const [selectedCentreCard,setSelectedCentreCard]= useState(null);
  const [assistante,        setAssistante]        = useState(null);
  // true si le dossier part vers le pool des PA Advisors (coaching privé) sans
  // qu'on en désigne un en particulier au parent - cf. choisirAssistante() reste
  // pour le cas où CET enfant a déjà un PA assigné (on le montre alors, ce n'est
  // plus anonyme).
  const [poolPA,            setPoolPA]            = useState(false);
  // Coaching privé (en ligne ET présentiel) : après avoir choisi une assistante, le
  // parent renseigne ses modalités souhaitées (jours/créneau/fréquence) avant de
  // continuer - cf. workflow "Cours Privé" (assistante d'abord, PA ensuite).
  const [assistantePreChoisie, setAssistantePreChoisie] = useState(null);
  const [disponForm, setDisponForm] = useState([]); // [{jour, debut}] - même format que ParcoursModal.jsx
  const [modalitesErreur, setModalitesErreur] = useState("");

  // Paiement
  const [modePaiement] = useState("mobile_money"); // sélecteur retiré - un seul mode réellement utilisé (TouchPoint)

  // "groupe" ou "prive" - déduit de l'offre choisie (cf. inferTypeCoaching), pilote
  // le routing vers une assistante standard (groupe) ou vers un PA Advisor (prive).
  const [typeCoaching, setTypeCoaching] = useState(null);

  // ── Load data
  useEffect(() => {
    if (!isOpen) return;
    fetch(`${API}/api/parcours/centres`).then(r => r.json()).then(d => setCentres(d.centres || [])).catch(() => {});
    try {
      const s = localStorage.getItem(CENTRES_MASTER_KEY);
      if (s) setCentresMaster(JSON.parse(s).filter(c => c.actif !== false));
    } catch {}
    // Offres en ligne : vrai catalogue admin (localStorage en cache, puis sync Supabase) -
    // remplace l'ancien tableau OFFRES_EN_LIGNE codé en dur.
    try {
      const s = localStorage.getItem(LS_OFFRES_EN_LIGNE_KEY);
      if (s) setOffresEnLigneToutes(JSON.parse(s).filter(o => o.actif !== false));
    } catch {}
    supabase.from("plateforme_config").select("valeur").eq("key","offres_en_ligne").maybeSingle()
      .then(({ data, error }) => {
        if (!error && Array.isArray(data?.valeur) && data.valeur.length) {
          localStorage.setItem(LS_OFFRES_EN_LIGNE_KEY, JSON.stringify(data.valeur));
          setOffresEnLigneToutes(data.valeur.filter(o => o.actif !== false));
        }
      });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      const u = session.user, meta = u.user_metadata || {};
      const nom = (meta.prenom && meta.nom) ? `${meta.prenom} ${meta.nom}` : meta.full_name || u.email?.split("@")[0] || "";
      setParent({ nom, email: u.email || "", tel: meta.telephone || "" });
      setParentConnecte(true);
    });
  }, [isOpen]);

  // ── Pré-charger assistantes de tous les centres (photos dans les cartes)
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

  const findMaster = useCallback((centre) => {
    const norm = s => (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/^bet\s+/,"").trim();
    const cn = norm(centre.nom);
    return centresMaster.find(m => norm(m.name) === cn) ||
           centresMaster.find(m => norm(m.name).includes(cn) || cn.includes(norm(m.name)));
  }, [centresMaster]);

  const handleClose = useCallback(() => {
    setStep(0); setErreur("");
    setEnfant({ prenom:"", nom:"", tranche_age:"" });
    setParent({ nom:"", email:"", tel:"" });
    setModeCours(null); setOffreChoisie(null); setOffreEnLigne(null); setFormuleChoisie(null);
    setCentreChoisi(null); setSelectedCentreCard(null); setAssistante(null); setPoolPA(false);
    setAssistantes([]); setParentErrors({}); setTypeCoaching(null);
    setParentConnecte(false);
    setAssistantePreChoisie(null); setDisponForm([]); setModalitesErreur("");
    onClose();
  }, [onClose]);

  // ── Validation
  const canStep0 = enfant.prenom.trim() && enfant.nom.trim() && enfant.tranche_age;

  const validateParent = () => {
    const errors = {};
    if (!parent.tel.trim()) errors.tel = "Requis";
    setParentErrors(errors);
    return !Object.keys(errors).length;
  };

  // ── Step 2 : mode toggle (accordion)
  const toggleMode = (mode) => {
    setModeCours(prev => prev === mode ? null : mode);
    setOffreChoisie(null); setOffreEnLigne(null); setFormuleChoisie(null);
    setCentreChoisi(null); setSelectedCentreCard(null);
    setAssistantePreChoisie(null); setDisponForm([]); setModalitesErreur("");
  };

  const toggleCentreCard = (centreId) => {
    setSelectedCentreCard(prev => prev === centreId ? null : centreId);
    setOffreChoisie(null); setFormuleChoisie(null);
    setAssistantePreChoisie(null); setDisponForm([]); setModalitesErreur("");
  };

  // ── Vérifier si CET enfant a déjà une assistante pour un canal donné
  // (scope parent+enfant : un même parent peut avoir plusieurs enfants avec
  // des assistantes différentes, donc jamais scoper sur le seul email parent).
  const fetchAssignationExistante = async () => {
    if (!parent.email.trim()) { setAssignationExistante(null); return; }
    try {
      const r = await fetch(`${API}/api/parcours/mon-assignation?email=${encodeURIComponent(parent.email.trim())}&prenom_enfant=${encodeURIComponent(enfant.prenom.trim())}&nom_enfant=${encodeURIComponent(enfant.nom.trim())}`);
      const d = await r.json();
      setAssignationExistante(d.assignation || null);
    } catch { setAssignationExistante(null); }
  };

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

  // Coaching privé, si aucune assistante n'est disponible sur le canal choisi : repli
  // sur le pool des PA Advisors (n'importe quel PA autorisé peut prendre le dossier en
  // charge depuis son dashboard) - le parent ne voit alors aucun nom, juste "un
  // conseiller vous contactera". Cas de secours uniquement : le chemin normal (assistante
  // + PA ensuite) passe désormais par choisirAssistante, comme pour le groupe/en ligne.
  const routerVersPA = () => {
    setAssistante(null);
    setPoolPA(true);
    setStep(4);
  };

  // ── Confirmer centre → step 3 (choix assistante présentiel, groupe ET privé)
  const confirmerCentre = async (centre) => {
    setCentreChoisi(centre);
    const tc = inferTypeCoaching(offreChoisie);
    setTypeCoaching(tc);
    const existingAst = findAssistanteExistante("presentiel", tc, centre.id);
    if (existingAst) { choisirAssistante(existingAst); return; }
    setLoadingAss(true); setAssistantes([]);
    try {
      const r = await fetch(`${API}/api/parcours/assistantes-presentiel/${centre.id}?tous=true`);
      const d = await r.json();
      setAssistantes(d.assistantes || []);
    } catch {}
    finally { setLoadingAss(false); }
    setStep(3);
  };

  /* Un seul point d'entrée pour les deux chemins : le rythme se choisit de la même façon
     en ligne et en présentiel, et la mesure ne doit pas dépendre de celui des deux par
     lequel le parent est passé. */
  const choisirFormule = (f) => {
    setFormuleChoisie(f);
    if (f) {
      const offre = modeCours === "en_ligne" ? offreEnLigne : offreChoisie;
      ga4.formuleChoisie({
        offre: offre?.label, formule: f.label, tarif: f.tarif,
        canal: modeCours === "en_ligne" ? "en_ligne" : "presentiel",
      });
    }
  };

  // ── En ligne → step 3 (choix assistante en ligne, groupe ET privé)
  const continuerEnLigne = async () => {
    const tc = inferTypeCoaching(offreEnLigne);
    setTypeCoaching(tc);
    const existingAst = findAssistanteExistante("en_ligne", tc, null);
    if (existingAst) { choisirAssistante(existingAst); return; }
    setLoadingAssLigne(true); setAssistantes([]);
    try {
      const r = await fetch(`${API}/api/parcours/assistantes-ligne?profil=b2c`);
      const d = await r.json();
      setAssistantes(d.assistantes || []);
    } catch {}
    finally { setLoadingAssLigne(false); }
    setStep(3);
  };

  // ── Choisir assistante → step 4 (groupe : direct - présentiel/en ligne PRIVÉ : passe
  // d'abord par la saisie des modalités souhaitées, cf. bloc modalités du step 3 JSX)
  const choisirAssistante = (a) => {
    if (typeCoaching === "prive") { setAssistantePreChoisie(a); return; }
    setAssistante(a); setPoolPA(false); setStep(4);
  };

  const JOURS_ORDER_EM = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
  const toggleDispoJour = (jour) =>
    setDisponForm(prev => {
      const exists = prev.some(d => d.jour === jour);
      if (exists) return prev.filter(d => d.jour !== jour);
      const next = [...prev, { jour, debut: "08:00" }];
      return next.sort((a,b) => JOURS_ORDER_EM.indexOf(a.jour) - JOURS_ORDER_EM.indexOf(b.jour));
    });
  const setDispoDebut = (jour, debut) =>
    setDisponForm(prev => prev.map(d => d.jour === jour ? {...d, debut} : d));
  const confirmerModalitesPrivees = () => {
    if (!disponForm.length) {
      setModalitesErreur("Merci de sélectionner au moins un jour de disponibilité.");
      return;
    }
    setAssistante(assistantePreChoisie);
    setPoolPA(false);
    setStep(4);
  };

  // ── Submit
  // Passe par /api/parcours/assignation (et non /api/inscriptions/enfant/submit) :
  // c'est cette table (assignations_parcours) que l'onglet "Prospects parcours" de
  // l'assistante lit réellement - l'ancienne route n'écrivait que dans une table de
  // lead brut (inscriptions_enfants) jamais consultée par la commerciale.
  const handleSubmit = async () => {
    setSubmitting(true); setErreur("");
    try {
      const offre = modeCours === "en_ligne" ? offreEnLigne : offreChoisie;
      // Prix numérique de l'offre choisie - sans ça, cout_formation reste vide et le
      // montant dû ne se pré-remplit côté assistante que si le libellé matche par hasard
      // le catalogue générique (catalogueOffres), ce qui exclut les formules de la grille
      // tarifaire réelle du centre (programmesEnfants, cf. EnfantParcoursModal formulesGrille).
      /* LE TARIF DE LA FORMULE PRIME sur le prix générique de l'offre - c'est celui que le
         parent vient de voir et de cocher. Il sert au dossier ET au paiement : sans cela,
         le parent aurait été débité d'un montant qu'il n'a jamais choisi. */
      const prixOffreNum = Number(formuleChoisie?.tarif) > 0
        ? Number(formuleChoisie.tarif)
        : (parseInt((offre?.prix || "").replace(/\D/g, "")) || undefined);
      const modePaiementLabel = modePaiement || undefined;
      const modalitesLabel = (typeCoaching === "prive" && disponForm.length)
        ? `Disponibilités souhaitées : ${disponForm.map(d => `${d.jour} ${d.debut}`).join(", ")}`
        : null;
      const notes = [modePaiementLabel && `Mode de paiement souhaité : ${modePaiementLabel}`, modalitesLabel].filter(Boolean).join(" - ") || undefined;
      const r = await fetch(`${API}/api/parcours/assignation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistante_id:        assistante?.id || undefined,
          prospect_nom:         `${enfant.prenom.trim()} ${enfant.nom.trim()}`.trim(),
          prospect_email:       parent.email.trim() || undefined,
          prospect_telephone:   parent.tel.trim(),
          type_cours:           modeCours,
          type_coaching:        typeCoaching || "groupe",
          centre_id:            centreChoisi?.id || undefined,
          source:               "parcours_enfant_public",
          inscription_offre:    offre?.label || undefined,
          formation_souhaitee:  formuleChoisie
                                  ? `${offre?.label || "Formation"} - ${formuleChoisie.label}`
                                  : (offre?.label || undefined),
          cout_formation:       prixOffreNum,
          /* LA FORMULE EN ENTIER, pas seulement son nom : c'est sur le rythme et les
             horaires que l'Onboarding choisit la classe de l'enfant. Le backend la range
             dans `suivi_demarrage`, d'où la commerciale et l'Onboarding la lisent déjà. */
          ...(formuleChoisie ? {
            pack_coaching: formuleChoisie.label,
            formule_groupe: {
              id:        formuleChoisie.id || null,
              label:     formuleChoisie.label,
              frequence: formuleChoisie.frequence || null,
              tarif:     Number(formuleChoisie.tarif) || null,
              canal:     modeCours === "en_ligne" ? "en_ligne" : "presentiel",
            },
          } : {}),
          profil_type:          "enfant",
          nom_parent:           parent.nom.trim() || undefined,
          telephone_parent:     parent.tel.trim(),
          email_parent:         parent.email.trim() || undefined,
          prenom_enfant:        enfant.prenom.trim(),
          nom_enfant:           enfant.nom.trim(),
          age_enfant:           enfant.tranche_age || undefined,
          disponibilites:       (typeCoaching === "prive" && disponForm.length) ? { horaires: disponForm } : undefined,
          notes:                notes,
          statut:               "en_attente",
        }),
      });
      const rData = await r.json();
      if (!r.ok) throw new Error(rData.error || "Erreur serveur");
      if ((modePaiement === "mobile_money" || modePaiement === "carte_bancaire") && prixOffreNum) {
        await payerAvecTouchPoint({
          clientInfo:    { nom: parent.nom.trim(), email: parent.email.trim(), telephone: parent.tel.trim() },
          montant:       prixOffreNum,
          offreLabel:    formuleChoisie ? `${offre?.label} - ${formuleChoisie.label}` : offre?.label,
          assignationId: rData.assignation?.id,
          assistanteId:  assistante?.id,
        });
        return; // redirection vers la page de paiement TouchPoint en cours
      }
      setStep(5);
    } catch (e) {
      setErreur(e.message || "Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const selectedTranche = TRANCHES.find(t => t.val === enfant.tranche_age);
  const offre = modeCours === "en_ligne" ? offreEnLigne : offreChoisie;
  /* Le récapitulatif doit annoncer le tarif QUI SERA DÉBITÉ. Afficher le prix générique de
     l'offre après que le parent a coché un rythme le ferait payer autre chose que ce qu'il
     a lu - l'écart le plus impardonnable d'un tunnel de paiement. */
  const prixAffiche = Number(formuleChoisie?.tarif) > 0
    ? `${Number(formuleChoisie.tarif).toLocaleString("fr-FR")} F/mois`
    : offre?.prix;

  return (
    <div className="em-overlay" onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="em-box">

        {/* ── Header ── */}
        <div style={{ background:`linear-gradient(135deg,#064e3b,#065f46,#0891b2)`, borderRadius:"24px 24px 0 0", padding:"20px 24px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ color:"rgba(255,255,255,.6)", fontSize:".7rem", fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", marginBottom:4 }}>
              👧 Parcours Enfant - BET Languages
            </div>
            <div style={{ color:"#fff", fontWeight:800, fontSize:"1rem", fontFamily:F }}>
              {STEP_TITLES[step] || ""}
            </div>
          </div>
          <button onClick={handleClose} style={{ background:"rgba(255,255,255,.12)", border:"none", borderRadius:"50%", width:32, height:32, color:"#fff", fontSize:"1.1rem", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✕</button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding:"24px 24px 28px" }}>

          {step < 5 && <StepDots step={step} total={5} />}

          {erreur && (
            <div style={{ background:"#fff0f2", border:"1px solid #ffb3bc", borderRadius:10, padding:"10px 14px", color:"#ff2945", fontSize:".84rem", marginBottom:16 }}>
              ⚠️ {erreur}
            </div>
          )}

          {/* ═══ STEP 0 : Infos enfant ═══ */}
          {step === 0 && (
            <div style={{ animation:"emFU .3s ease" }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:10, background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:12, padding:"12px 14px", marginBottom:20 }}>
                <span style={{ fontSize:"1.3rem", flexShrink:0 }}>🎓</span>
                <p style={{ margin:0, fontSize:".8rem", color:"#166534", lineHeight:1.6 }}>
                  Nos coachs sont spécialisés en <strong>pédagogie jeunesse</strong> (niveaux A1 → B2). Chaque tranche d'âge a son programme adapté.
                </p>
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div className="em-grid2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div>
                    <label style={labelStyle}>Prénom de l'enfant *</label>
                    <input value={enfant.prenom} onChange={e => setEnfant(p => ({...p, prenom:e.target.value}))}
                      placeholder="Kouamé" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Nom de l'enfant *</label>
                    <input value={enfant.nom} onChange={e => setEnfant(p => ({...p, nom:e.target.value}))}
                      placeholder="Diallo" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Tranche d'âge *</label>
                  <div className="em-grid2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:6 }}>
                    {TRANCHES.map(t => (
                      <div key={t.val} onClick={() => setEnfant(p => ({...p, tranche_age:t.val}))}
                        style={{ border:`2px solid ${enfant.tranche_age===t.val ? BET_BLUE : "#e2e8f0"}`, borderRadius:14, padding:"12px 14px", cursor:"pointer", background: enfant.tranche_age===t.val ? `${BET_BLUE}0d` : "#fafafa", transition:"all .2s", display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:"1.5rem", flexShrink:0 }}>{t.icon}</span>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontWeight:800, fontSize:".82rem", color:BET_DARK }}>{t.label}</div>
                          <div style={{ fontSize:".68rem", color:"#64748b", marginTop:2, lineHeight:1.4 }}>{t.desc}</div>
                        </div>
                        {enfant.tranche_age===t.val && (
                          <div style={{ marginLeft:"auto", width:18, height:18, borderRadius:"50%", background:BET_BLUE, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <button onClick={() => { setErreur(""); setStep(1); }} disabled={!canStep0}
                style={{ ...primaryBtn, marginTop:22, opacity: canStep0 ? 1 : .45 }}>
                Continuer →
              </button>
            </div>
          )}

          {/* ═══ STEP 1 : Coordonnées parent ═══ */}
          {step === 1 && (
            <div style={{ animation:"emFU .3s ease" }}>
              <button onClick={() => setStep(0)} style={backBtn}>← Retour</button>

              <div style={{ display:"flex", alignItems:"center", gap:12, background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:12, padding:"12px 14px", marginBottom:20 }}>
                <span style={{ fontSize:"1.8rem" }}>{selectedTranche?.icon || "🧒"}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:800, fontSize:".88rem", color:BET_DARK }}>{enfant.prenom} {enfant.nom}</div>
                  <div style={{ fontSize:".74rem", color:"#64748b", marginTop:2 }}>{selectedTranche?.label} · {selectedTranche?.desc}</div>
                </div>
                <span style={{ background:"#dcfce7", color:BET_GREEN, borderRadius:999, padding:"3px 10px", fontSize:".68rem", fontWeight:700, flexShrink:0 }}>✓</span>
              </div>

              <p style={{ color:"#64748b", fontSize:".84rem", marginBottom:16, lineHeight:1.6 }}>
                Ces coordonnées permettent à votre assistante de vous contacter pour le suivi de votre enfant.
              </p>

              {parentConnecte && (
                <div style={{ display:"flex", alignItems:"center", gap:8, background:"#eef1ff", border:"1.5px solid #bae6fd", borderRadius:10, padding:"9px 13px", marginBottom:14 }}>
                  <span style={{ fontSize:"1rem" }}>🔒</span>
                  <p style={{ margin:0, fontSize:".76rem", color:"#0c33ac", lineHeight:1.5 }}>
                    Vous êtes connecté(e) - vos coordonnées sont reprises automatiquement de votre compte et ne sont pas modifiables ici.
                  </p>
                </div>
              )}

              {(() => {
                // On ne grise que les champs déjà remplis par le compte connecté - si le
                // compte n'a pas de téléphone en métadonnées par ex., on laisse ce champ
                // éditable plutôt que de bloquer le parent sur un champ requis mais vide.
                const nomLocked   = parentConnecte && !!parent.nom.trim();
                const telLocked   = parentConnecte && !!parent.tel.trim();
                const emailLocked = parentConnecte && !!parent.email.trim();
                return (
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  <div>
                    <label style={labelStyle}>Votre nom complet {!nomLocked && <span style={{ color:"#94a3b8", fontWeight:400 }}>(optionnel)</span>}</label>
                    <input value={parent.nom} onChange={e => setParent(p => ({...p, nom:e.target.value}))}
                      placeholder="Jean Kouamé" disabled={nomLocked} style={nomLocked ? disabledInputStyle : inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Numéro WhatsApp *</label>
                    <input value={parent.tel} onChange={e => { setParent(p => ({...p, tel:e.target.value})); setParentErrors(pe => ({...pe, tel:""})); }}
                      placeholder="+225 07 XX XX XX" disabled={telLocked}
                      style={{ ...(telLocked ? disabledInputStyle : inputStyle), borderColor: parentErrors.tel ? "#ff2945" : "#e2e8f0" }} />
                    {parentErrors.tel && <p style={errStyle}>{parentErrors.tel}</p>}
                  </div>
                  <div>
                    <label style={labelStyle}>E-mail {!emailLocked && <span style={{ color:"#94a3b8", fontWeight:400 }}>(optionnel)</span>}</label>
                    <input value={parent.email} onChange={e => setParent(p => ({...p, email:e.target.value}))}
                      placeholder="parent@email.com" type="email" disabled={emailLocked} style={emailLocked ? disabledInputStyle : inputStyle} />
                  </div>
                </div>
                );
              })()}

              <button onClick={() => { if (validateParent()) { setErreur(""); fetchAssignationExistante(); setStep(2); } }}
                style={{ ...primaryBtn, marginTop:22 }}>
                Continuer →
              </button>
            </div>
          )}

          {/* ═══ STEP 2 : Mode de cours ═══ */}
          {step === 2 && (
            <div style={{ animation:"emFU .3s ease" }}>
              <button onClick={() => setStep(1)} style={backBtn}>← Retour</button>
              <p style={{ color:"#64748b", fontSize:".82rem", marginBottom:16, lineHeight:1.6 }}>
                Choisissez comment votre enfant suivra ses cours BET.
              </p>

              <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                {[
                  { mode:"en_ligne",   icon:"💻", title:"En ligne",      subtitle:"Cours via Zoom/Meet - depuis chez vous", color:BET_BLUE },
                  { mode:"presentiel", icon:"🏫", title:"En présentiel", subtitle:"Dans l'un de nos cabinets BET",           color:BET_NAVY },
                ].map((o, idx) => {
                  const sel = modeCours === o.mode;
                  const isLast = idx === 1;
                  return (
                    <div key={o.mode}>
                      {/* Mode card header */}
                      <div onClick={() => toggleMode(o.mode)}
                        style={{ display:"flex", alignItems:"center", gap:14,
                          border:`2px solid ${sel ? o.color : "#e2e8f0"}`,
                          borderBottom: sel ? `2px solid ${o.color}` : "2px solid #e2e8f0",
                          borderRadius: sel ? "16px 16px 0 0" : isLast ? "16px" : "16px",
                          marginBottom: sel ? 0 : 12,
                          padding:"16px 18px", cursor:"pointer",
                          background: sel ? `${o.color}08` : "#fff",
                          transition:"all .22s", boxShadow: sel ? `0 4px 16px ${o.color}18` : "none" }}>
                        <div style={{ width:44, height:44, borderRadius:12, background:`${o.color}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.5rem", flexShrink:0 }}>{o.icon}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:800, fontSize:".9rem", color: sel ? o.color : BET_DARK }}>{o.title}</div>
                          <div style={{ fontSize:".72rem", color:"#64748b", marginTop:2 }}>{o.subtitle}</div>
                        </div>
                        <div style={{ color: sel ? o.color : "#94a3b8", fontWeight:800, fontSize:"1.1rem", transform: sel ? "rotate(90deg)" : "none", transition:"transform .2s" }}>›</div>
                      </div>

                      {/* ── Contenu en ligne ── */}
                      {sel && o.mode === "en_ligne" && (
                        <div style={{ border:`2px solid ${o.color}`, borderTop:"none", borderRadius:"0 0 16px 16px",
                          padding:"16px", animation:"emSlide .2s ease", background:`${o.color}04`, marginBottom:12 }}
                          onClick={e => e.stopPropagation()}>

                          <p style={{ fontSize:".72rem", fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:".05em", margin:"0 0 12px" }}>
                            Formules disponibles
                          </p>

                          {(() => {
                            const offresEnLigneEnfant = offresEnLigneToutes.filter(off => KW_ENFANT.some(kw => (off.label||"").toLowerCase().includes(kw)));
                            const offresAffichees = offresEnLigneEnfant.length > 0 ? offresEnLigneEnfant : offresEnLigneToutes;
                            if (offresAffichees.length === 0) {
                              return <p style={{ fontSize:".78rem", color:"#94a3b8", margin:"0 0 12px", textAlign:"center" }}>Contactez-nous pour les tarifs.</p>;
                            }
                            return (
                              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:14 }}>
                                {offresAffichees.map((off, i) => {
                                  const s = offreEnLigne?.label === off.label;
                                  return (
                                    <div key={off.id || i} onClick={() => { setOffreEnLigne(off); setFormuleChoisie(null); }}
                                      style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 13px", borderRadius:12,
                                        border:`2px solid ${s ? o.color : "#e2e8f0"}`, background: s ? `${o.color}08` : "#f8fafc",
                                        cursor:"pointer", transition:"all .15s" }}>
                                      <div style={{ width:17, height:17, borderRadius:"50%", border:`2px solid ${s ? o.color : "#cbd5e1"}`,
                                        background: s ? o.color : "#fff", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                                        {s && <div style={{ width:6, height:6, borderRadius:"50%", background:"#fff" }} />}
                                      </div>
                                      <span style={{ fontSize:"1rem" }}>{off.icon || "💻"}</span>
                                      <div style={{ flex:1 }}>
                                        <div style={{ fontWeight:700, fontSize:".82rem", color: s ? o.color : BET_DARK }}>{off.label}</div>
                                        {off.desc && <div style={{ fontSize:".7rem", color:"#64748b" }}>{off.desc}</div>}
                                      </div>
                                      <div style={{ fontWeight:800, fontSize:".82rem", color: s ? o.color : BET_DARK, flexShrink:0 }}>{off.prix || "Sur devis"}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}

                          <SelecteurFormules
                            offre={offreEnLigne}
                            valeur={formuleChoisie}
                            onChange={choisirFormule}
                            color={o.color}
                          />

                          {(() => {
                            // Une offre qui propose des formules n'a pas de tarif tant qu'aucune
                            // n'est retenue : laisser continuer reviendrait à facturer le prix
                            // générique, que le parent n'a jamais choisi.
                            const attendFormule = formulesDe(offreEnLigne).length > 0 && !formuleChoisie;
                            const pret = offreEnLigne && !attendFormule;
                            return (
                              <button onClick={continuerEnLigne} disabled={!pret || loadingAssLigne}
                                style={{ ...primaryBtn, opacity: pret ? 1 : .45, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                                {loadingAssLigne ? <><Spinner/>Chargement…</> : attendFormule ? "Choisissez un rythme ↑" : "Choisir mon assistante →"}
                              </button>
                            );
                          })()}
                        </div>
                      )}

                      {/* ── Contenu présentiel : grille centres ── */}
                      {sel && o.mode === "presentiel" && (
                        <div style={{ border:`2px solid ${o.color}`, borderTop:"none", borderRadius:"0 0 16px 16px",
                          padding:"16px", animation:"emSlide .2s ease", background:`${o.color}04`, marginBottom:12 }}
                          onClick={e => e.stopPropagation()}>

                          {centres.length === 0
                            ? <p style={{ color:"#94a3b8", textAlign:"center", padding:16, margin:0 }}>Chargement des centres…</p>
                            : (
                              <div className="em-centre-grid">
                                {centres.map(c => {
                                  const master    = findMaster(c);
                                  const color     = master?.color || BET_NAVY;
                                  // Programmes Enfants & Ados de la grille tarifaire réelle du centre (configurés
                                  // par le SuperAdmin/PA - mêmes group formulas que côté parcours adulte, cf.
                                  // ParcoursModal.jsx) : sans ce merge, seules les offres du catalogue générique
                                  // (master.offres) s'affichaient, masquant les vraies formules groupe du centre.
                                  const gt = master?.grilleTarifaire;
                                  const formulesGrille = (gt?.programmesEnfants || []).filter(it => it.actif !== false).map(it => ({
                                    label: it.label, prix: `${Number(it.tarif||0).toLocaleString("fr-FR")} F/mois`, desc: it.creneaux, type_coaching: "groupe",
                                  }));
                                  const catalogue     = (master?.offres || []).filter(off => off.actif !== false);
                                  const catalogueEnfant = catalogue.filter(o => KW_ENFANT.some(kw => (o.label||"").toLowerCase().includes(kw)));
                                  const offresEnfant  = [...formulesGrille, ...catalogueEnfant];
                                  const offres = offresEnfant.length > 0 ? offresEnfant : catalogue;
                                  const assistList= centreAssistantesMap[c.id] || [];
                                  const isOpenC   = selectedCentreCard === c.id;
                                  const offreOk   = isOpenC && offreChoisie && selectedCentreCard === c.id;

                                  return (
                                    <div key={c.id} onClick={() => toggleCentreCard(c.id)}
                                      style={{ gridColumn: isOpenC ? "1 / -1" : "auto",
                                        border:`2px solid ${isOpenC ? color : "#e2e8f0"}`, borderRadius:14,
                                        background: isOpenC ? `${color}06` : "#fff", cursor:"pointer",
                                        transition:"all .22s", overflow:"hidden",
                                        boxShadow: isOpenC ? `0 6px 20px ${color}20` : "none" }}>

                                      <div style={{ height:4, background: isOpenC ? color : "#e2e8f0", transition:"background .2s" }} />

                                      <div style={{ padding:"12px 14px" }}>
                                        <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:8 }}>
                                          <div style={{ width:36, height:36, borderRadius:8, background:`${color}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.1rem", flexShrink:0 }}>🏢</div>
                                          <div style={{ flex:1, minWidth:0 }}>
                                            <div style={{ fontWeight:800, fontSize:".85rem", color: isOpenC ? color : BET_DARK, lineHeight:1.2 }}>{c.nom}</div>
                                            {c.ville && <div style={{ fontSize:".68rem", color:"#64748b", marginTop:2 }}>{c.ville}</div>}
                                            {c.adresse && <div style={{ fontSize:".64rem", color:"#94a3b8", marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.adresse}</div>}
                                          </div>
                                          <div style={{ color: isOpenC ? color : "#94a3b8", fontWeight:800, fontSize:".9rem", transform: isOpenC ? "rotate(90deg)" : "none", transition:"transform .2s" }}>›</div>
                                        </div>

                                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                            {assistList.length > 0
                                              ? <><AvatarStack assistantes={assistList} size={24} max={3} /><span style={{ fontSize:".66rem", color:"#64748b" }}>{assistList.length} assistante{assistList.length>1?"s":""}</span></>
                                              : <span style={{ fontSize:".66rem", color:"#94a3b8" }}>-</span>
                                            }
                                          </div>
                                          {offres.length > 0 && (() => {
                                            const prix = offres.map(of => parseInt((of.prix||"").replace(/\D/g,""))||0).filter(Boolean);
                                            const min  = prix.length ? Math.min(...prix) : null;
                                            return min ? <span style={{ fontSize:".62rem", fontWeight:800, color, background:`${color}12`, padding:"2px 7px", borderRadius:999 }}>Dès {min.toLocaleString("fr")} F</span> : null;
                                          })()}
                                        </div>
                                      </div>

                                      {/* Section offres */}
                                      {isOpenC && (
                                        <div style={{ borderTop:`1px solid ${color}30`, padding:"12px 14px", animation:"emSlide .2s ease" }}
                                          onClick={e => e.stopPropagation()}>

                                          {/* Brochure */}
                                          <a href={master?.brochure_url || DEFAULT_BROCHURE_URL} onClick={e => e.stopPropagation()} target="_blank" rel="noopener noreferrer"
                                            style={{ display:"flex", alignItems:"center", gap:6, background:"#eef1ff", border:"1.5px solid #bae6fd", borderRadius:8, padding:"7px 10px", marginBottom:12, textDecoration:"none" }}>
                                            <span style={{ fontSize:".9rem" }}>📄</span>
                                            <span style={{ fontSize:".72rem", fontWeight:700, color:BET_BLUE, flex:1 }}>Télécharger la brochure</span>
                                            <span style={{ fontSize:".62rem", fontWeight:700, color:"#94a3b8", background:"#f1f5f9", borderRadius:4, padding:"1px 5px" }}>PDF</span>
                                          </a>

                                          {offres.length === 0 ? (
                                            <p style={{ fontSize:".78rem", color:"#94a3b8", margin:"0 0 10px", textAlign:"center" }}>Contactez-nous pour les tarifs.</p>
                                          ) : (
                                            <>
                                              <p style={{ fontSize:".68rem", fontWeight:700, color:"#374151", marginBottom:8, textTransform:"uppercase", letterSpacing:".05em" }}>Choisissez votre formule</p>
                                              <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:12 }}>
                                                {offres.map((off, i) => {
                                                  const s = offreChoisie?.label === off.label && selectedCentreCard === c.id;
                                                  return (
                                                    <div key={i} onClick={() => { setOffreChoisie(off); setFormuleChoisie(null); }}
                                                      style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:10,
                                                        border:`2px solid ${s ? color : "#e2e8f0"}`, background: s ? `${color}08` : "#f8fafc",
                                                        cursor:"pointer", transition:"all .15s" }}>
                                                      <div style={{ width:16, height:16, borderRadius:"50%", border:`2px solid ${s ? color : "#cbd5e1"}`,
                                                        background: s ? color : "#fff", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                                                        {s && <div style={{ width:6, height:6, borderRadius:"50%", background:"#fff" }} />}
                                                      </div>
                                                      <div style={{ flex:1, minWidth:0 }}>
                                                        <div style={{ fontWeight:700, fontSize:".8rem", color: s ? color : BET_DARK }}>{off.label}</div>
                                                        {off.desc && <div style={{ fontSize:".68rem", color:"#64748b" }}>{off.desc}</div>}
                                                      </div>
                                                      <div style={{ fontWeight:800, fontSize:".8rem", color: s ? color : BET_DARK, flexShrink:0 }}>{off.prix}</div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </>
                                          )}

                                          {offreOk && (
                                            <SelecteurFormules
                                              offre={offreChoisie}
                                              valeur={formuleChoisie}
                                              onChange={choisirFormule}
                                              color={color}
                                            />
                                          )}

                                          {(() => {
                                            const attendFormule = offreOk && formulesDe(offreChoisie).length > 0 && !formuleChoisie;
                                            const pret = (offres.length === 0 || offreOk) && !attendFormule;
                                            return (
                                              <button onClick={() => confirmerCentre(c)}
                                                disabled={!pret}
                                                style={{ width:"100%", padding:"10px", borderRadius:999,
                                                  background: pret ? `linear-gradient(135deg,${color},${BET_DARK})` : "#e5e7eb",
                                                  color: pret ? "#fff" : "#94a3b8",
                                                  border:"none", cursor: pret ? "pointer" : "default",
                                                  fontWeight:800, fontSize:".82rem", fontFamily:F }}>
                                                {offres.length > 0 && !offreOk
                                                  ? "Sélectionnez une formule ↑"
                                                  : attendFormule
                                                    ? "Choisissez un rythme ↑"
                                                    : `Continuer avec ${c.nom.replace("BET ","")} →`}
                                              </button>
                                            );
                                          })()}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )
                          }
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ STEP 3 : Assistantes (présentiel = centre / en_ligne = disponibles) ═══ */}
          {step === 3 && (
            <div style={{ animation:"emFU .3s ease" }}>
              <button onClick={() => setStep(2)} style={backBtn}>← Retour</button>

              {/* Recap */}
              <div style={{ display:"flex", alignItems:"center", gap:10, background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:10, padding:"10px 14px", marginBottom:16 }}>
                <span style={{ fontSize:"1rem" }}>✅</span>
                <div style={{ flex:1 }}>
                  {modeCours === "en_ligne" ? (
                    <>
                      <div style={{ fontWeight:700, fontSize:".82rem", color:"#065f46" }}>{offreEnLigne?.label}</div>
                      <div style={{ fontSize:".72rem", color:"#047857" }}>En ligne · {offreEnLigne?.prix}</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontWeight:700, fontSize:".82rem", color:"#065f46" }}>{offreChoisie?.label || centreChoisi?.nom}</div>
                      <div style={{ fontSize:".72rem", color:"#047857" }}>{centreChoisi?.nom}{offreChoisie ? ` · ${offreChoisie.prix}` : ""}</div>
                    </>
                  )}
                </div>
                <button onClick={() => setStep(2)} style={{ background:"none", border:"none", fontSize:".7rem", color:"#059669", cursor:"pointer", fontWeight:700 }}>Changer</button>
              </div>

              {/* Titre contextuel */}
              {modeCours === "en_ligne" && !assistantePreChoisie && (
                <div style={{ display:"flex", alignItems:"flex-start", gap:10, background:"#eef1ff", border:"1.5px solid #bae6fd", borderRadius:10, padding:"10px 14px", marginBottom:16 }}>
                  <span style={{ flexShrink:0, fontSize:"1.1rem" }}>💻</span>
                  <p style={{ margin:0, fontSize:".8rem", color:"#0c33ac", lineHeight:1.6 }}>
                    Choisissez votre <strong>assistante en ligne</strong>. Elle vous accompagnera tout au long du parcours de votre enfant.
                  </p>
                </div>
              )}

              {typeCoaching === "prive" && assistantePreChoisie ? (
                /* ── Coaching privé : modalités souhaitées, une fois l'assistante choisie ── */
                <div style={{ animation:"emSlide .2s ease" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:12, padding:"12px 14px", marginBottom:18 }}>
                    <Avatar a={assistantePreChoisie} size={44} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:800, fontSize:".85rem", color:BET_DARK }}>{assistantePreChoisie.prenom} {assistantePreChoisie.nom}</div>
                      <div style={{ fontSize:".7rem", color:"#64748b" }}>Assistante sélectionnée</div>
                    </div>
                    <button onClick={() => setAssistantePreChoisie(null)} style={{ background:"none", border:"none", fontSize:".7rem", color:"#059669", cursor:"pointer", fontWeight:700 }}>Changer</button>
                  </div>

                  <p style={{ color:"#64748b", fontSize:".84rem", marginBottom:14, lineHeight:1.6 }}>
                    Le coaching privé s'organise autour des disponibilités de votre enfant. Indiquez vos modalités souhaitées - elles seront confirmées par votre assistante selon la disponibilité du coach.
                  </p>

                  <div style={{ marginBottom:16 }}>
                    <label style={labelStyle}>Votre disponibilité *</label>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:6, borderRadius:10, border: modalitesErreur ? "1.5px solid #ff2945" : "none", padding: modalitesErreur ? "8px" : 0 }}>
                      {JOURS_ORDER_EM.map(j => {
                        const sel = disponForm.some(d => d.jour === j);
                        return (
                          <button key={j} type="button" onClick={() => { toggleDispoJour(j); setModalitesErreur(""); }}
                            style={{ padding:"7px 16px", borderRadius:20, border:`2px solid ${sel ? BET_BLUE : "#e2e8f0"}`, background: sel ? `${BET_BLUE}10` : "#f8fafc", color: sel ? BET_BLUE : "#64748b", fontWeight:700, fontSize:".8rem", cursor:"pointer", transition:"all .15s" }}>
                            {j}
                          </button>
                        );
                      })}
                    </div>
                    {disponForm.length > 0 && (
                      <div style={{ display:"flex", flexDirection:"column", gap:7, marginTop:10 }}>
                        {disponForm.map(row => (
                          <div key={row.jour} style={{ display:"flex", alignItems:"center", gap:10, background:`${BET_BLUE}10`, borderRadius:10, padding:"8px 12px", border:`1.5px solid ${BET_BLUE}30` }}>
                            <span style={{ fontWeight:800, fontSize:".82rem", color:BET_BLUE, minWidth:34 }}>{row.jour}</span>
                            <span style={{ color:"#94a3b8", fontSize:".75rem", flexShrink:0 }}>à partir de</span>
                            <input type="time" value={row.debut}
                              onChange={e => { setDispoDebut(row.jour, e.target.value); setModalitesErreur(""); }}
                              style={{ padding:"5px 8px", borderRadius:8, border:`1px solid ${BET_BLUE}30`, fontSize:".82rem", outline:"none", cursor:"pointer", background:"#fff", color:"#0f172a" }}/>
                            <button type="button"
                              onClick={() => setDisponForm(prev => prev.filter(d => d.jour !== row.jour))}
                              style={{ marginLeft:"auto", background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:".88rem", padding:"2px 6px", borderRadius:6, lineHeight:1, flexShrink:0 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {disponForm.length === 0 && !modalitesErreur && (
                      <p style={{ fontSize:".72rem", color:"#94a3b8", margin:"6px 0 0" }}>Cliquez sur un jour pour le sélectionner</p>
                    )}
                  </div>

                  {modalitesErreur && <p style={errStyle}>{modalitesErreur}</p>}

                  <button onClick={confirmerModalitesPrivees} style={{ ...primaryBtn, marginTop:14 }}>
                    Continuer →
                  </button>
                </div>
              ) : (loadingAss || loadingAssLigne) ? (
                <div style={{ textAlign:"center", padding:40 }}>
                  <div style={{ width:32, height:32, border:"3px solid #e2e8f0", borderTopColor:BET_BLUE, borderRadius:"50%", animation:"emSpin .8s linear infinite", margin:"0 auto 12px" }} />
                  <p style={{ color:"#64748b", fontSize:".88rem", margin:0 }}>Recherche des assistantes…</p>
                </div>
              ) : assistantes.length === 0 ? (
                <div style={{ textAlign:"center", padding:"28px 20px", background:"#f8fafc", borderRadius:14, border:"1.5px dashed #e2e8f0", marginBottom:16 }}>
                  <div style={{ fontSize:"1.8rem", marginBottom:10 }}>😔</div>
                  <p style={{ color:"#475569", fontSize:".86rem", lineHeight:1.6, margin:"0 0 14px" }}>
                    {modeCours === "en_ligne"
                      ? <>Aucune assistante disponible pour le moment.{typeCoaching === "prive" ? "" : " Merci de réessayer un peu plus tard, ou de nous contacter directement."}</>
                      : <>Aucune assistante assignée à ce centre pour le moment.{typeCoaching === "prive" ? "" : " Merci de réessayer un peu plus tard, ou de nous contacter directement."}</>
                    }
                  </p>
                  {typeCoaching === "prive" && (
                    <button onClick={routerVersPA} style={primaryBtn}>Envoyer à un conseiller pédagogique →</button>
                  )}
                </div>
              ) : (
                <>
                  <p style={{ color:"#64748b", fontSize:".84rem", marginBottom:14 }}>
                    {assistantes.length} assistante{assistantes.length > 1 ? "s" : ""} disponible{assistantes.length > 1 ? "s" : ""}
                    {modeCours === "presentiel" && centreChoisi ? ` - ${centreChoisi.nom}` : " en ligne"}
                  </p>
                  <div className="em-assist-grid" style={{ marginBottom:14 }}>
                    {assistantes.map(a => {
                      const jours       = a.jours_travail || JOURS_SEMAINE_EM;
                      const hasSemaine  = jours.some(j => JOURS_SEMAINE_EM.includes(j));
                      const hasWeekend  = jours.some(j => JOURS_WEEKEND_EM.includes(j));
                      return (
                        <div key={a.id} className="em-assistant" onClick={() => choisirAssistante(a)}
                          style={{ border:"2px solid #e2e8f0", borderRadius:16, padding:"16px 12px", cursor:"pointer", textAlign:"center", background:"#fff", transition:"all .22s" }}>
                          <div style={{ display:"flex", justifyContent:"center", marginBottom:10 }}>
                            <Avatar a={a} size={62} />
                          </div>
                          <div style={{ fontWeight:800, fontSize:".88rem", color:BET_DARK, marginBottom:2 }}>{a.prenom} {a.nom}</div>
                          <div style={{ fontSize:".7rem", color:"#94a3b8", marginBottom: a.telephone ? 4 : 8 }}>Assistante BET</div>
                          {a.telephone && <div style={{ fontSize:".7rem", color:BET_BLUE, fontWeight:700, marginBottom:8 }}>📞 {a.telephone}</div>}
                          <div style={{ marginBottom:6 }}>
                            <JoursPills jours={jours} />
                          </div>
                          <div style={{ display:"flex", gap:5, justifyContent:"center", flexWrap:"wrap", marginBottom:10 }}>
                            {hasSemaine && <span style={{ fontSize:".6rem", padding:"2px 7px", borderRadius:999, background:"#eef1ff", color:"#0c33ac", fontWeight:700 }}>📆 Semaine</span>}
                            {hasWeekend && <span style={{ fontSize:".6rem", padding:"2px 7px", borderRadius:999, background:"#fef3c7", color:"#92400e", fontWeight:700 }}>🌴 Weekend</span>}
                          </div>
                          {modeCours === "en_ligne" && (
                            <div style={{ fontSize:".64rem", color:"#16a34a", fontWeight:700, marginBottom:6, background:"#f0fdf4", borderRadius:6, padding:"2px 8px", display:"inline-block" }}>
                              🟢 Disponible en ligne
                            </div>
                          )}
                          <div style={{ background:`linear-gradient(135deg,${BET_NAVY},${BET_BLUE})`, color:"#fff", borderRadius:999, padding:"7px 0", fontWeight:800, fontSize:".74rem", fontFamily:F }}>
                            Choisir →
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ STEP 4 : Paiement ═══ */}
          {step === 4 && (
            <div style={{ animation:"emFU .3s ease" }}>
              <button onClick={() => setStep(3)} style={backBtn}>← Retour</button>

              {/* Recap */}
              <div style={{ background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:14, padding:"14px 16px", marginBottom:20 }}>
                <div style={{ fontSize:".7rem", fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:".05em", marginBottom:10 }}>Récapitulatif</div>

                {/* ── Enfant ── */}
                <div style={{ display:"flex", alignItems:"center", gap:12, paddingBottom:10, borderBottom:"1px solid #f1f5f9", marginBottom:10 }}>
                  <span style={{ fontSize:"1.5rem" }}>{selectedTranche?.icon || "🧒"}</span>
                  <div>
                    <div style={{ fontWeight:800, fontSize:".88rem", color:BET_DARK }}>{enfant.prenom} {enfant.nom}</div>
                    <div style={{ fontSize:".72rem", color:"#64748b", marginTop:2 }}>{selectedTranche?.label} · {modeCours === "en_ligne" ? "En ligne" : `Présentiel · ${centreChoisi?.nom||""}`}</div>
                  </div>
                </div>

                {/* ── Parent ── */}
                <div style={{ display:"flex", flexDirection:"column", gap:5, paddingBottom:10, borderBottom:"1px solid #f1f5f9", marginBottom:10 }}>
                  <div style={{ fontSize:".68rem", fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:".06em", marginBottom:2 }}>Parent</div>
                  {parent.nom && (
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:".82rem" }}>👤</span>
                      <span style={{ fontSize:".8rem", color:BET_DARK, fontWeight:600 }}>{parent.nom}</span>
                    </div>
                  )}
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:".82rem" }}>📱</span>
                    <span style={{ fontSize:".8rem", color:BET_DARK, fontWeight:600 }}>{parent.tel}</span>
                  </div>
                  {parent.email && (
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:".82rem" }}>📧</span>
                      <span style={{ fontSize:".8rem", color:BET_DARK, fontWeight:600 }}>{parent.email}</span>
                    </div>
                  )}
                </div>

                {/* ── Assistante + offre ── */}
                {assistante ? (
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <Avatar a={assistante} size={38} />
                    <div>
                      <div style={{ fontWeight:800, fontSize:".84rem", color:BET_DARK }}>{assistante.prenom} {assistante.nom}</div>
                      <div style={{ fontSize:".72rem", color:"#64748b" }}>
                        {modeCours === "en_ligne" ? "En ligne" : `Présentiel · ${centreChoisi?.nom || "BET"}`}
                      </div>
                    </div>
                  </div>
                ) : poolPA && (
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <div style={{ width:38, height:38, borderRadius:"50%", background:`${BET_BLUE}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.2rem", flexShrink:0 }}>🧑‍💼</div>
                    <div>
                      <div style={{ fontWeight:800, fontSize:".84rem", color:BET_DARK }}>Un conseiller pédagogique (PA)</div>
                      <div style={{ fontSize:".72rem", color:"#64748b" }}>Vous serez contacté(e) sous peu</div>
                    </div>
                  </div>
                )}

                {offre && (
                  <div style={{ borderRadius:10, background:`${BET_BLUE}07`, border:`1.5px solid ${BET_BLUE}20`, overflow:"hidden" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", borderBottom: offre.desc ? `1px solid ${BET_BLUE}15` : "none" }}>
                      <div>
                        <div style={{ fontWeight:800, fontSize:".84rem", color:BET_DARK }}>{offre.label}</div>
                        {formuleChoisie && (
                          <div style={{ fontSize:".7rem", color:BET_BLUE, fontWeight:700, marginTop:2 }}>
                            👥 {formuleChoisie.label}{formuleChoisie.frequence ? ` · ${formuleChoisie.frequence}` : ""}
                          </div>
                        )}
                        {offre.duration && <div style={{ fontSize:".68rem", color:"#64748b", marginTop:1 }}>⏱ {offre.duration}</div>}
                      </div>
                      <div style={{ fontWeight:900, fontSize:".9rem", color:BET_BLUE, flexShrink:0 }}>{prixAffiche}</div>
                    </div>
                    {offre.desc && (
                      <div style={{ padding:"8px 12px", fontSize:".74rem", color:"#475569", lineHeight:1.6 }}>{offre.desc}</div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display:"flex", alignItems:"flex-start", gap:10, background:"#eef1ff", border:"1.5px solid #bae6fd", borderRadius:12, padding:"12px 14px", marginBottom:14 }}>
                <span style={{ fontSize:"1.1rem", flexShrink:0 }}>💬</span>
                <p style={{ margin:0, fontSize:".78rem", color:"#0c33ac", lineHeight:1.6 }}>
                  {parsePrixFCFA((modeCours === "en_ligne" ? offreEnLigne : offreChoisie)?.prix)
                    ? "Vous allez être redirigé(e) vers TouchPoint pour finaliser votre paiement en toute sécurité."
                    : <>Après confirmation, {assistante ? <><strong>{assistante.prenom}</strong></> : poolPA ? "un conseiller pédagogique" : "votre assistante"} vous contactera par WhatsApp pour finaliser l'inscription de <strong>{enfant.prenom}</strong>.</>}
                </p>
              </div>

              <button onClick={handleSubmit} disabled={submitting}
                style={{ ...primaryBtn, opacity:submitting ? .5 : 1, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                {submitting ? <><Spinner/>Envoi…</> : "Confirmer l'inscription →"}
              </button>
            </div>
          )}

          {/* ═══ STEP 5 : Succès ═══ */}
          {step === 5 && (
            <div style={{ animation:"emFU .4s ease" }}>
              <div style={{ textAlign:"center", marginBottom:24 }}>
                <div style={{ width:72, height:72, borderRadius:"50%", background:"linear-gradient(135deg,#22c55e,#16a34a)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"2rem", margin:"0 auto 16px", boxShadow:"0 8px 24px rgba(34,197,94,.3)" }}>✓</div>
                <h3 style={{ fontFamily:F, color:BET_DARK, fontWeight:800, fontSize:"1.2rem", margin:"0 0 8px" }}>Inscription envoyée !</h3>
                <p style={{ color:"#475569", fontSize:".88rem", lineHeight:1.7, margin:0 }}>
                  {assistante
                    ? <><strong>{assistante.prenom} {assistante.nom}</strong> a été notifiée et vous contactera sous peu.</>
                    : poolPA
                      ? <>Un <strong>conseiller pédagogique</strong> va prendre en charge le dossier de <strong>{enfant.prenom}</strong> et vous contactera sous <strong>24 h</strong>.</>
                      : <>Un conseiller BET vous contactera sous <strong>24 h</strong> pour finaliser l'inscription de <strong>{enfant.prenom}</strong>.</>
                  }
                </p>
              </div>

              <div style={{ background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:14, padding:"16px 18px", marginBottom:20 }}>
                <div style={{ fontSize:".72rem", fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".06em", marginBottom:12 }}>Récapitulatif</div>
                {[
                  { icon:"🧒", label:"Enfant",      val:`${enfant.prenom} ${enfant.nom}` },
                  { icon:"📅", label:"Âge",          val: selectedTranche?.label },
                  { icon:"💻", label:"Mode",         val: modeCours === "en_ligne" ? "En ligne" : "Présentiel" },
                  centreChoisi  && { icon:"🏢", label:"Centre",      val: centreChoisi.nom },
                  parent.nom    && { icon:"👤", label:"Parent",      val: parent.nom },
                  { icon:"📱",   label:"WhatsApp",   val: parent.tel },
                  parent.email  && { icon:"📧", label:"E-mail",      val: parent.email },
                  assistante    && { icon:"🧑‍💼", label:"Assistante", val:`${assistante.prenom} ${assistante.nom} · ${modeCours === "en_ligne" ? "En ligne" : "Présentiel"}` },
                ].filter(Boolean).map(r => (
                  <div key={r.label} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 0", borderBottom:"1px solid #f1f5f9" }}>
                    <span style={{ fontSize:"1rem", width:20, textAlign:"center", flexShrink:0 }}>{r.icon}</span>
                    <span style={{ fontSize:".75rem", color:"#64748b", width:80, flexShrink:0 }}>{r.label}</span>
                    <span style={{ fontSize:".82rem", fontWeight:600, color:BET_DARK }}>{r.val}</span>
                  </div>
                ))}

                {/* Détail offre */}
                {offre && (
                  <div style={{ marginTop:10, borderRadius:10, background:`${BET_BLUE}07`, border:`1.5px solid ${BET_BLUE}20`, overflow:"hidden" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", borderBottom: offre.desc ? `1px solid ${BET_BLUE}15` : "none" }}>
                      <div>
                        <div style={{ fontWeight:800, fontSize:".82rem", color:BET_DARK }}>{offre.label}</div>
                        {formuleChoisie && (
                          <div style={{ fontSize:".69rem", color:BET_BLUE, fontWeight:700, marginTop:2 }}>
                            👥 {formuleChoisie.label}{formuleChoisie.frequence ? ` · ${formuleChoisie.frequence}` : ""}
                          </div>
                        )}
                        {offre.duration && <div style={{ fontSize:".67rem", color:"#64748b", marginTop:1 }}>⏱ {offre.duration}</div>}
                      </div>
                      <div style={{ fontWeight:900, fontSize:".88rem", color:BET_BLUE, flexShrink:0 }}>{prixAffiche}</div>
                    </div>
                    {offre.desc && (
                      <div style={{ padding:"8px 12px", fontSize:".73rem", color:"#475569", lineHeight:1.6 }}>{offre.desc}</div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {assistante?.telephone && (
                  <a href={`https://wa.me/${(assistante.telephone||"").replace(/[\s+\-()]/g,"")}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ display:"flex", alignItems:"center", gap:12, background:"#22c55e", color:"#fff", borderRadius:12, padding:"13px 18px", textDecoration:"none", fontWeight:800, fontSize:".9rem", fontFamily:F }}>
                    <svg width="20" height="20" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="16" fill="#fff" fillOpacity=".2"/><path d="M23.5 19.9c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2c-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.9-1.6.1-.2 0-.4-.1-.5-.1-.2-.7-1.8-1-2.4-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1.1 1.1-1.1 2.6s1.1 3 1.3 3.2c.2.2 2.2 3.4 5.3 4.7 2 .9 2.7.9 3.7.8.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3z" fill="#fff"/></svg>
                    Écrire à {assistante.prenom} sur WhatsApp
                  </a>
                )}
                <button onClick={handleClose}
                  style={{ background:"none", border:"1.5px solid #e2e8f0", borderRadius:12, padding:"12px", color:"#64748b", fontWeight:700, fontSize:".88rem", cursor:"pointer", fontFamily:F }}>
                  Fermer
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/* ── Styles partagés ── */
const primaryBtn = {
  width:"100%", background:`linear-gradient(135deg,${BET_BLUE},${BET_NAVY})`, color:"#fff",
  border:"none", borderRadius:999, padding:"13px", fontWeight:800, fontSize:".9rem",
  cursor:"pointer", fontFamily:F, transition:"opacity .2s",
};
const backBtn = {
  background:"none", border:"none", color:"#64748b", cursor:"pointer",
  fontSize:".82rem", marginBottom:16, display:"flex", alignItems:"center", gap:4, padding:0,
};
const labelStyle = { display:"block", fontSize:".75rem", fontWeight:700, color:BET_DARK, marginBottom:5 };
const inputStyle  = { width:"100%", padding:"11px 13px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:".88rem", fontFamily:F, boxSizing:"border-box", outline:"none" };
const disabledInputStyle = { ...inputStyle, background:"#f1f5f9", color:"#64748b", cursor:"not-allowed" };
const errStyle    = { color:"#ff2945", fontSize:".72rem", margin:"4px 0 0" };
