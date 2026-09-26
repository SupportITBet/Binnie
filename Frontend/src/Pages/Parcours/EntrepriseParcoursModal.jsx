// src/Pages/Parcours/EntrepriseParcoursModal.jsx
import React, { useState, useEffect, useCallback } from "react";
import { insertSimulateurFormation } from "../../services/formsService";
import { supabase } from "../../config/supabase";

const BET_BLUE = "#1B3080";

// Aucune media query n'existait dans ce fichier - les grilles à 2 colonnes fixes
// débordaient sur téléphone (~390px). !important pour battre le style inline.
if (!document.querySelector("#epm-styles")) {
  const s = document.createElement("style");
  s.id = "epm-styles";
  s.textContent = `@media (max-width: 640px) { .epm-grid2 { grid-template-columns: 1fr !important; } }`;
  document.head.appendChild(s);
}

// Couleurs fixes par code CECRL (conservées même si le label est personnalisé)
const CECRL_COLORS = {
  A1: { color:"#6b7280", bg:"#f3f4f6" },
  A2: { color:"#d97706", bg:"#fef3c7" },
  B1: { color:"#1a4fd6", bg:"#d6e0ff" },
  B2: { color:"#7c3aed", bg:"#ede9fe" },
  C1: { color:"#059669", bg:"#dcfce7" },
  C2: { color:"#ff2945", bg:"#fee2e2" },
};
const DEFAULT_NIVEAUX = [
  { id:"A1", label:"A1 - Débutant",          actif:true },
  { id:"A2", label:"A2 - Élémentaire",        actif:true },
  { id:"B1", label:"B1 - Intermédiaire",      actif:true },
  { id:"B2", label:"B2 - Interm. supérieur",  actif:true },
  { id:"C1", label:"C1 - Avancé",             actif:true },
  { id:"C2", label:"C2 - Maîtrise",           actif:true },
];
const DEFAULT_OBJECTIFS = [
  { id:"communication", label:"Communication quotidienne",  icon:"💬", actif:true },
  { id:"business",      label:"Anglais des affaires",       icon:"💼", actif:true },
  { id:"toeic",         label:"Certification TOEIC",        icon:"🏆", actif:true },
  { id:"ielts",         label:"Certification IELTS",        icon:"📜", actif:true },
  { id:"presentations", label:"Présentations & réunions",   icon:"🎤", actif:true },
  { id:"redaction",     label:"Rédaction professionnelle",  icon:"✍️", actif:true },
  { id:"negociation",   label:"Négociation commerciale",    icon:"🤝", actif:true },
  { id:"technique",     label:"Anglais technique / IT",     icon:"💻", actif:true },
];
const FORMATS = [
  { id:"presentiel", label:"Présentiel",      icon:"🏢", desc:"Dans nos locaux à Abidjan",     coefPrix:1.0  },
  { id:"distanciel", label:"À distance",      icon:"🌐", desc:"Sessions Zoom / Teams",         coefPrix:0.85 },
  { id:"hybride",    label:"Hybride",         icon:"⚡", desc:"Mix présentiel & en ligne",     coefPrix:0.92 },
  { id:"elearning",  label:"E-learning seul", icon:"💡", desc:"100% autonome, à votre rythme",coefPrix:0.60 },
];
const RYTHMES = [
  { id:"intensif", label:"Intensif",      sessions:5, desc:"5 sessions/semaine",  heures:2.5, coef:1.0  },
  { id:"regulier", label:"Régulier",      sessions:3, desc:"3 sessions/semaine",  heures:1.5, coef:0.9  },
  { id:"leger",    label:"Modéré",        sessions:2, desc:"2 sessions/semaine",  heures:1,   coef:0.85 },
  { id:"weekend",  label:"Week-end only", sessions:2, desc:"Sam + Dim uniquement",heures:3,   coef:0.88 },
];
const GROUPES = [
  { id:"individuel", label:"Individuel",    max:1,  coefPrix:2.2,  desc:"Cours 100% personnalisé" },
  { id:"duo",        label:"Duo",           max:2,  coefPrix:1.5,  desc:"2 participants" },
  { id:"petit",      label:"Petit groupe",  max:6,  coefPrix:1.0,  desc:"3 à 6 participants" },
  { id:"groupe",     label:"Groupe",        max:15, coefPrix:0.75, desc:"7 à 15 participants" },
  { id:"classe",     label:"Grande classe", max:25, coefPrix:0.55, desc:"16 à 25 participants" },
];

const STEPS = [
  { id:1, label:"Votre entreprise",   icon:"🏢" },
  { id:2, label:"Niveau & objectifs", icon:"🎯" },
  { id:3, label:"Format & rythme",    icon:"📅" },
];

const SelectCard = ({ item, selected, onSelect }) => (
  <div onClick={() => onSelect(item.id)} style={{ padding:"12px 14px", borderRadius:10, border:`1.5px solid ${selected?BET_BLUE:"#e5e7eb"}`, background:selected?BET_BLUE+"08":"#fff", cursor:"pointer", transition:"all .2s" }}>
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
      <div style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${selected?BET_BLUE:"#d1d5db"}`, background:selected?BET_BLUE:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        {selected && <div style={{ width:6, height:6, borderRadius:"50%", background:"#fff" }} />}
      </div>
      {item.icon && <span style={{ fontSize:16 }}>{item.icon}</span>}
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:600, fontSize:13, color:"#011451" }}>{item.label}</div>
        {item.desc && <div style={{ fontSize:11, color:"#9ca3af", marginTop:1 }}>{item.desc}</div>}
      </div>
    </div>
  </div>
);

const ProgressBar = ({ current }) => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:0, marginBottom:28, flexWrap:"wrap", rowGap:10 }}>
    {STEPS.map((s, i) => (
      <React.Fragment key={s.id}>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
          <div style={{ width:34, height:34, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, transition:"all .3s",
            background: current > s.id ? BET_BLUE : current === s.id ? BET_BLUE : "#e5e7eb",
            color: current >= s.id ? "#fff" : "#9ca3af",
            boxShadow: current === s.id ? `0 0 0 4px ${BET_BLUE}22` : "none" }}>
            {current > s.id ? "✓" : s.icon}
          </div>
          <span style={{ fontSize:9, fontWeight:current===s.id?700:400, color:current>=s.id?BET_BLUE:"#9ca3af", textAlign:"center", maxWidth:64, lineHeight:1.3 }}>{s.label}</span>
        </div>
        {i < STEPS.length-1 && <div style={{ width:32, height:2, background:current>s.id?BET_BLUE:"#e5e7eb", marginBottom:18, flexShrink:0, transition:"background .3s" }} />}
      </React.Fragment>
    ))}
  </div>
);

export default function EntrepriseParcoursModal({ isOpen, onClose }) {
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);

  // Config dynamique (chargée depuis Supabase via SuperAdmin)
  const [formats,   setFormats]   = useState(FORMATS);
  const [rythmes,   setRythmes]   = useState(RYTHMES);
  const [groupes,   setGroupes]   = useState(GROUPES);
  const [centres,   setCentres]   = useState([]);
  const [niveaux,   setNiveaux]   = useState(DEFAULT_NIVEAUX);
  const [objectifsConfig, setObjectifsConfig] = useState(DEFAULT_OBJECTIFS);

  const loadConfig = useCallback(async () => {
    // Purge les anciens caches localStorage (ils ne sont pas à jour - le SuperAdmin
    // tourne sur une autre origine et ne partage pas le localStorage avec le frontend)
    localStorage.removeItem("bet_parcours_entreprise");
    localStorage.removeItem("bet_centres_master");

    // Toujours charger depuis Supabase (source de vérité)
    // Le SuperAdmin et le Frontend sont sur des origines différentes
    // donc localStorage n'est pas partagé entre eux
    try {
      const [peRes, centresRes] = await Promise.all([
        supabase.from("plateforme_config").select("valeur").eq("key","parcours_entreprise").maybeSingle(),
        supabase.from("plateforme_config").select("valeur").eq("key","centres_master").maybeSingle(),
      ]);

      if (peRes.data?.valeur) {
        const v = peRes.data.valeur;
        if (v.formats)   setFormats(v.formats.filter(f => f.actif !== false));
        if (v.rythmes)   setRythmes(v.rythmes.filter(r => r.actif !== false));
        if (v.groupes)   setGroupes(v.groupes.filter(g => g.actif !== false));
        if (v.niveaux)   setNiveaux(v.niveaux.filter(n => n.actif !== false));
        if (v.objectifs) setObjectifsConfig(v.objectifs.filter(o => o.actif !== false));
      }

      if (Array.isArray(centresRes.data?.valeur)) {
        setCentres(centresRes.data.valeur.filter(c => c.actif !== false));
      }
    } catch { /* ignore, garde les valeurs par défaut */ }
  }, []);

  // Recharge la config Supabase à chaque ouverture du modal
  useEffect(() => { if (isOpen) loadConfig(); }, [isOpen, loadConfig]);

  const [entreprise, setEntreprise] = useState({ nom:"", secteur:"", secteurAutre:"", nbEmployes:"", nbEmployesAutre:"", emailContact:"", tel:"", nomContact:"" });

  const [niveauActuel,   setNiveauActuel]   = useState("");
  const [niveauCible,    setNiveauCible]    = useState("");
  const [objectifs,      setObjectifs]      = useState([]);
  const [objectifAutre,  setObjectifAutre]  = useState("");
  const [dureeWeeks,     setDureeWeeks]     = useState(12);
  const [nbParticipants] = useState(null);
  const [formatId,       setFormatId]       = useState("hybride");
  const [rythmeId,       setRythmeId]       = useState("regulier");
  const [groupeId,       setGroupeId]       = useState("petit");
  const [centreId,       setCentreId]       = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [erreur,     setErreur]     = useState("");

  useEffect(() => {
    if (!isOpen) {
      setStep(1); setDone(false); setErreur("");
      setEntreprise({ nom:"", secteur:"", secteurAutre:"", nbEmployes:"", nbEmployesAutre:"", emailContact:"", tel:"", nomContact:"" });
      setObjectifs([]); setObjectifAutre(""); setNiveauActuel(""); setNiveauCible(""); setCentreId("");
    }
  }, [isOpen]);

  const canNext = () => {
    if (step===1) {
      if (!entreprise.nom.trim() || !entreprise.emailContact.trim()) return false;
      if (entreprise.secteur==="Autre" && !entreprise.secteurAutre.trim()) return false;
      if (entreprise.nbEmployes==="Autre" && !entreprise.nbEmployesAutre.trim()) return false;
      return true;
    }
    if (step===2) return objectifs.length > 0 || objectifAutre.trim().length > 0;
    if (step===3) {
      if (!formatId || !rythmeId || !groupeId) return false;
      const needsCentre = formatId === "presentiel" || formatId === "hybride";
      if (needsCentre && !centreId) return false;
      return true;
    }
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true); setErreur("");
    const allObjectifs = [...objectifs, ...(objectifAutre.trim() ? [`autre:${objectifAutre.trim()}`] : [])];
    try {
      await insertSimulateurFormation({
        nom_entreprise:  entreprise.nom,
        secteur:         entreprise.secteur==="Autre" ? entreprise.secteurAutre : entreprise.secteur || null,
        nb_employes:     entreprise.nbEmployes==="Autre" ? entreprise.nbEmployesAutre : entreprise.nbEmployes || null,
        nom_contact:     entreprise.nomContact || null,
        email_contact:   entreprise.emailContact,
        tel:             entreprise.tel || null,
        niveau_actuel:   niveauActuel || null,
        niveau_cible:    niveauCible  || null,
        objectifs:       allObjectifs,
        format:          formatId || null,
        rythme:          rythmeId || null,
        groupe:          groupeId || null,
        centre:          centreId || null,
        nb_participants: nbParticipants || null,
        duree_semaines:  dureeWeeks,
        email_devis:     entreprise.emailContact,
      });

      // Affectation à une assistante Corporate B2B disponible - même logique que le
      // formulaire "Demander un devis" de /parcours/entreprise (assistante.id + POST
      // assignation), pour que toute demande de devis du site suive le même chemin
      // jusqu'au back office plutôt que de rester dans une file partagée non assignée.
      try {
        const API = process.env.REACT_APP_API_URL || "http://localhost:5001";
        const ar = await fetch(`${API}/api/parcours/assistantes-ligne?profil=b2b`);
        const ad = await ar.json();
        const ca = (ad.assistantes || [])[0] || null;
        if (ca) {
          const assignRes = await fetch(`${API}/api/parcours/assignation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              assistante_id:      ca.id,
              prospect_nom:       entreprise.nomContact || entreprise.nom,
              prospect_email:     entreprise.emailContact,
              prospect_telephone: entreprise.tel || null,
              type_cours:         "en_ligne",
              source:             "devis_entreprise",
            }),
          });
          if (!assignRes.ok) console.warn("Assignation B2B échouée:", await assignRes.text());
        } else {
          console.warn("Aucune assistante B2B disponible pour l'assignation");
        }
      } catch (e) { console.error("Erreur assignation B2B:", e); }

      setDone(true);
    } catch (e) {
      console.error(e);
      setErreur("Une erreur est survenue. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay-mq" style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.65)", zIndex:1200, display:"flex", alignItems:"center", justifyContent:"center", padding:16, overflowY:"auto" }}>
      <div style={{ background:"#fff", borderRadius:18, width:"100%", maxWidth:860, maxHeight:"96vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(0,0,0,0.28)" }} onClick={e=>e.stopPropagation()}>

        {/* ── VUE SUCCÈS (remplace tout le contenu du modal) ── */}
        {done && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"60px 32px", textAlign:"center", minHeight:360 }}>
            <div style={{ width:72, height:72, borderRadius:"50%", background:"linear-gradient(135deg,#dcfce7,#bbf7d0)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:36, marginBottom:20, boxShadow:"0 4px 16px rgba(22,163,74,0.18)" }}>✅</div>
            <h2 style={{ fontSize:22, fontWeight:800, color:"#011451", margin:"0 0 12px" }}>Demande enregistrée !</h2>
            <p style={{ fontSize:14, color:"#6b7280", lineHeight:1.8, maxWidth:420, margin:"0 auto 28px" }}>
              {/* Aucun nom n'est annoncé ici : le dossier arrive à TOUTE l'équipe Corporate,
                  et celle qui rappellera n'est pas forcément celle que l'affectation
                  technique a retenue. Promettre un interlocuteur précis exposait à ce que
                  l'entreprise soit rappelée par quelqu'un d'autre. */}
              <>Votre demande a bien été enregistrée.<br/>Notre équipe Corporate vous contactera sous <strong>24h</strong> à l'adresse <strong style={{ color:"#0c33ac" }}>{entreprise.emailContact}</strong>.</>
            </p>
            <button onClick={onClose} style={{ ...btnPrimary, padding:"12px 32px", fontSize:14 }}>Fermer</button>
          </div>
        )}

        {/* ── CONTENU FORMULAIRE (masqué quand done) ── */}
        {!done && <>
        {/* Header */}
        <div style={{ background:`linear-gradient(135deg,${BET_BLUE},#0d1a4a)`, padding:"22px 28px", borderRadius:"18px 18px 0 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", fontWeight:600, letterSpacing:"0.08em" }}>ESPACE ENTREPRISE</div>
            <h2 style={{ margin:"4px 0 0", fontSize:18, fontWeight:800, color:"#fff" }}>🏢 Votre programme de formation</h2>
          </div>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", width:32, height:32, borderRadius:"50%", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>

        <div style={{ padding:"28px 28px 24px" }}>

          <ProgressBar current={step} />

          {/* ── ÉTAPE 1 : Votre entreprise ── */}
          {step===1 && (
            <div>
              <h3 style={titleSt}>🏢 Votre entreprise</h3>
              <p style={subSt}>Ces informations nous permettent de personnaliser votre programme et de vous recontacter.</p>
              <div className="epm-grid2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <div style={{ gridColumn:"1/-1" }}>
                  <label style={labelSt}>Durée souhaitée de la formation</label>
                  <select style={inputSt} value={dureeWeeks} onChange={e=>setDureeWeeks(Number(e.target.value))}>
                    <option value={4}>1 mois (4 semaines)</option>
                    <option value={8}>2 mois (8 semaines)</option>
                    <option value={12}>3 mois (12 semaines)</option>
                    <option value={16}>4 mois (16 semaines)</option>
                    <option value={24}>6 mois (24 semaines)</option>
                    <option value={36}>9 mois (36 semaines)</option>
                    <option value={52}>1 an (52 semaines)</option>
                  </select>
                </div>
                <div style={{ gridColumn:"1/-1" }}>
                  <label style={labelSt}>Nom de l'entreprise *</label>
                  <input style={inputSt} placeholder="Orange Côte d'Ivoire" value={entreprise.nom} onChange={e=>setEntreprise(p=>({...p,nom:e.target.value}))} />
                </div>
                <div style={{ gridColumn:"1/-1" }}>
                  <label style={labelSt}>Nom du contact *</label>
                  <input style={inputSt} placeholder="Jean Kouamé - DRH" value={entreprise.nomContact} onChange={e=>setEntreprise(p=>({...p,nomContact:e.target.value}))} />
                </div>
                <div>
                  <label style={labelSt}>Email professionnel *</label>
                  <input style={inputSt} type="email" placeholder="drh@entreprise.ci" value={entreprise.emailContact} onChange={e=>setEntreprise(p=>({...p,emailContact:e.target.value}))} />
                </div>
                <div>
                  <label style={labelSt}>Téléphone</label>
                  <input style={inputSt} type="tel" placeholder="+225 07 00 00 00 00" value={entreprise.tel} onChange={e=>setEntreprise(p=>({...p,tel:e.target.value}))} />
                </div>
                <div>
                  <label style={labelSt}>Secteur d'activité</label>
                  <select style={inputSt} value={entreprise.secteur} onChange={e=>setEntreprise(p=>({...p,secteur:e.target.value,secteurAutre:""}))}>
                    <option value="">Sélectionner…</option>
                    {["Télécommunications","Finance & Banque","Industrie","Commerce","Santé","Education","Technologie","Logistique","Tourisme","Autre"].map(s=><option key={s}>{s}</option>)}
                  </select>
                  {entreprise.secteur==="Autre" && <input style={{...inputSt,marginTop:8}} placeholder="Précisez votre secteur" value={entreprise.secteurAutre} onChange={e=>setEntreprise(p=>({...p,secteurAutre:e.target.value}))} />}
                </div>
                <div>
                  <label style={labelSt}>Nombre d'employés</label>
                  <select style={inputSt} value={entreprise.nbEmployes} onChange={e=>setEntreprise(p=>({...p,nbEmployes:e.target.value,nbEmployesAutre:""}))}>
                    <option value="">Sélectionner…</option>
                    {["1–10","11–50","51–200","201–500","500+","Autre"].map(s=><option key={s}>{s}</option>)}
                  </select>
                  {entreprise.nbEmployes==="Autre" && <input style={{...inputSt,marginTop:8}} placeholder="Précisez" value={entreprise.nbEmployesAutre} onChange={e=>setEntreprise(p=>({...p,nbEmployesAutre:e.target.value}))} />}
                </div>
              </div>
            </div>
          )}

          {/* ── ÉTAPE 2 : Niveau & objectifs ── */}
          {step===2 && (
            <div>
              <h3 style={titleSt}>🎯 Niveau & objectifs</h3>
              <p style={subSt}>Définissez le point de départ et la destination de vos équipes.</p>
              <div className="epm-grid2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 }}>
                <div>
                  <label style={{...labelSt,marginBottom:10}}>Niveau actuel des équipes <span style={{fontSize:10,color:"#9ca3af"}}>(optionnel)</span></label>
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {niveaux.map(n=>{
                      const c = CECRL_COLORS[n.id] || { color:"#6b7280", bg:"#f3f4f6" };
                      const sel = niveauActuel===n.id;
                      return (
                        <div key={n.id} onClick={()=>setNiveauActuel(p=>p===n.id?"":n.id)} style={{ padding:"9px 12px", borderRadius:8, border:`1.5px solid ${sel?c.color:"#e5e7eb"}`, background:sel?c.bg:"#fff", cursor:"pointer", display:"flex", gap:8, alignItems:"center" }}>
                          <div style={{ width:16, height:16, borderRadius:"50%", border:`2px solid ${sel?c.color:"#d1d5db"}`, background:sel?c.color:"transparent", flexShrink:0 }} />
                          <span style={{ fontSize:12, fontWeight:sel?700:400, color:sel?c.color:"#374151" }}>{n.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label style={{...labelSt,marginBottom:10}}>Niveau cible visé <span style={{fontSize:10,color:"#9ca3af"}}>(optionnel)</span></label>
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {niveaux.map(n=>{
                      const c = CECRL_COLORS[n.id] || { color:"#6b7280", bg:"#f3f4f6" };
                      const sel = niveauCible===n.id;
                      return (
                        <div key={n.id} onClick={()=>setNiveauCible(p=>p===n.id?"":n.id)} style={{ padding:"9px 12px", borderRadius:8, border:`1.5px solid ${sel?c.color:"#e5e7eb"}`, background:sel?c.bg:"#fff", cursor:"pointer", display:"flex", gap:8, alignItems:"center", opacity:niveauActuel&&n.id<=niveauActuel?0.35:1 }}>
                          <div style={{ width:16, height:16, borderRadius:"50%", border:`2px solid ${sel?c.color:"#d1d5db"}`, background:sel?c.color:"transparent", flexShrink:0 }} />
                          <span style={{ fontSize:12, fontWeight:sel?700:400, color:sel?c.color:"#374151" }}>{n.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <label style={{...labelSt,marginBottom:10}}>
                Objectifs de formation * <span style={{fontSize:10,color:"#9ca3af"}}>(plusieurs choix possibles)</span>
              </label>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:8, marginBottom:12 }}>
                {objectifsConfig.map(o=>(
                  <div key={o.id} onClick={()=>setObjectifs(p=>p.includes(o.id)?p.filter(x=>x!==o.id):[...p,o.id])} style={{ padding:"9px 12px", borderRadius:8, border:`1.5px solid ${objectifs.includes(o.id)?BET_BLUE:"#e5e7eb"}`, background:objectifs.includes(o.id)?"#eef2ff":"#fff", cursor:"pointer", display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{fontSize:15}}>{o.icon}</span>
                    <span style={{ fontSize:12, fontWeight:objectifs.includes(o.id)?700:400, color:objectifs.includes(o.id)?BET_BLUE:"#374151" }}>{o.label}</span>
                  </div>
                ))}
              </div>

              {/* Autres - objectif libre */}
              <div style={{ marginTop:4 }}>
                <label style={{...labelSt, marginBottom:6}}>
                  ✏️ Autre objectif <span style={{fontSize:10,color:"#9ca3af"}}>(si non listé ci-dessus)</span>
                </label>
                <input
                  style={inputSt}
                  placeholder="Ex: Préparation au poste de manager international…"
                  value={objectifAutre}
                  onChange={e => setObjectifAutre(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* ── ÉTAPE 3 : Format & rythme ── */}
          {step===3 && (
            <div>
              <h3 style={titleSt}>📅 Format, rythme & groupe</h3>
              <p style={subSt}>Ces choix nous aident à adapter le programme à vos contraintes.</p>
              <div style={{marginBottom:20}}>
                <label style={{...labelSt,marginBottom:10}}>Format des cours *</label>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:8 }}>
                  {formats.map(f=>(
                    <SelectCard key={f.id} item={f} selected={formatId===f.id} onSelect={(id)=>{ setFormatId(id); setCentreId(""); }} />
                  ))}
                </div>
              </div>

              {/* Sélection du centre - affiché uniquement si Présentiel ou Hybride */}
              {(formatId === "presentiel" || formatId === "hybride") && centres.length > 0 && (
                <div style={{ marginBottom:20, padding:"16px 18px", background:"#f0f4ff", border:`1.5px solid ${BET_BLUE}33`, borderRadius:12 }}>
                  <label style={{...labelSt, marginBottom:10, color:BET_BLUE, fontWeight:700}}>
                    📍 Centre BET souhaité *
                    <span style={{ fontSize:10, color:"#9ca3af", fontWeight:400, marginLeft:6 }}>
                      {formatId === "hybride" ? "pour vos sessions en présentiel" : "lieu de formation"}
                    </span>
                  </label>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:8 }}>
                    {centres.map(c => {
                      const sel = centreId === c.key;
                      return (
                        <div key={c.key} onClick={() => setCentreId(c.key)} style={{ padding:"12px 14px", borderRadius:10, border:`1.5px solid ${sel ? BET_BLUE : "#d1d5db"}`, background: sel ? BET_BLUE+"0D" : "#fff", cursor:"pointer", transition:"all .2s", display:"flex", alignItems:"flex-start", gap:10 }}>
                          <div style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${sel ? BET_BLUE : "#d1d5db"}`, background: sel ? BET_BLUE : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2 }}>
                            {sel && <div style={{ width:6, height:6, borderRadius:"50%", background:"#fff" }} />}
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:700, fontSize:13, color: sel ? BET_BLUE : "#011451" }}>{c.name}</div>
                            {c.addr && <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>{c.addr}</div>}
                            {c.horaires && <div style={{ fontSize:10, color:"#64748b", marginTop:3 }}>🕐 {c.horaires}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {!centreId && (
                    <p style={{ margin:"10px 0 0", fontSize:11, color:"#e93747", fontWeight:600 }}>
                      ⚠️ Veuillez sélectionner un centre pour continuer
                    </p>
                  )}
                </div>
              )}

              <div style={{marginBottom:20}}>
                <label style={{...labelSt,marginBottom:10}}>Rythme d'apprentissage *</label>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:8 }}>
                  {rythmes.map(r=><SelectCard key={r.id} item={r} selected={rythmeId===r.id} onSelect={setRythmeId} />)}
                </div>
              </div>
              <div style={{marginBottom:20}}>
                <label style={{...labelSt,marginBottom:10}}>Type de groupe *</label>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:8 }}>
                  {groupes.map(g=><SelectCard key={g.id} item={g} selected={groupeId===g.id} onSelect={setGroupeId} />)}
                </div>
              </div>
            </div>
          )}

          {erreur && (
            <div style={{ margin:"12px 0 0", padding:"10px 14px", borderRadius:8, background:"#fee2e2", border:"1px solid #fca5a5", fontSize:13, color:"#b91c1c" }}>
              ⚠️ {erreur}
            </div>
          )}

          {/* ── Navigation ── */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:28, paddingTop:20, borderTop:"1px solid #e5e7eb" }}>
            <button onClick={()=>setStep(s=>Math.max(1,s-1))} disabled={step===1} style={{ ...btnSecondary, opacity:step===1?0.4:1 }}>← Précédent</button>
            <span style={{ fontSize:12, color:"#9ca3af" }}>Étape {step} / {STEPS.length}</span>
            {step < 3 ? (
              <button onClick={()=>canNext()&&setStep(s=>s+1)} disabled={!canNext()} style={{ ...btnPrimary, opacity:canNext()?1:0.45 }}>
                Suivant →
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={submitting} style={{ ...btnPrimary, opacity:submitting?0.5:1 }}>
                {submitting ? "Envoi…" : "✅ Confirmer"}
              </button>
            )}
          </div>

        </div>
        </>}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────
const titleSt      = { fontSize:20, fontWeight:800, color:"#011451", margin:"0 0 6px" };
const subSt        = { fontSize:13, color:"#9ca3af", marginBottom:22 };
const labelSt      = { display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:6 };
const inputSt      = { padding:"11px 13px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, outline:"none", width:"100%", background:"#fff", color:"#011451", boxSizing:"border-box" };
const btnPrimary   = { background:`linear-gradient(135deg,${BET_BLUE},#0d1a4a)`, color:"#fff", border:"none", borderRadius:9, cursor:"pointer", fontWeight:700, fontSize:13, display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8, padding:"10px 22px" };
const btnSecondary = { background:"#e5e7eb", color:"#374151", border:"none", borderRadius:8, cursor:"pointer", fontWeight:600, fontSize:13, padding:"9px 16px" };
