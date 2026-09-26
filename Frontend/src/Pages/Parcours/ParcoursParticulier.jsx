import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../Footer/Footer";
import SEO from "../Components/SEO/SEO";

if (!document.querySelector("#pp-fonts")) {
  const l = document.createElement("link"); l.id="pp-fonts"; l.rel="stylesheet";
  l.href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&display=swap";
  document.head.appendChild(l);
}
if (!document.querySelector("#pp-kf")) {
  const s = document.createElement("style"); s.id="pp-kf";
  s.textContent=`
    @keyframes ppFU { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
    @keyframes ppFI { from{opacity:0} to{opacity:1} }
    @keyframes ppSI { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }
    @keyframes ppSpin{ to{transform:rotate(360deg)} }
    .pp-card:hover { transform:translateY(-4px) !important; box-shadow:0 16px 40px rgba(0,0,0,.1) !important; }
    .pp-offer:hover { border-color:#ff2945 !important; }
    .pp-input:focus { border-color:#ff2945 !important; box-shadow:0 0 0 3px rgba(220,38,38,.1) !important; outline:none; }
  `;
  document.head.appendChild(s);
}

// Injection responsive
if (!document.querySelector("#pp-responsive")) {
  const resp = document.createElement("style");
  resp.id = "pp-responsive";
  resp.textContent = `
    .pp-root { overflow-x: hidden; max-width: 100%; }
    @media (max-width: 900px) {
      .pp-hero-layout { grid-template-columns: 1fr !important; gap: 32px !important; text-align: center; }
      .pp-hero-layout > div:first-child { text-align: center; }
      .pp-hero-ctas { justify-content: center; }
      .pp-tabs-wrap { flex-wrap: wrap; gap: 0; border-radius: 12px; }
      .pp-tab-btn { flex: 1 0 auto; padding: 12px 8px; font-size: 0.8rem; }
    }
    @media (max-width: 768px) {
      .pp-offers-grid { grid-template-columns: 1fr !important; gap: 20px; }
      .pp-kid-program-card { grid-template-columns: 1fr !important; }
      .pp-kid-prog-right { border-left: none; border-top: 1px solid #e2e8f0; }
      .pp-hero-title { font-size: 1.8rem !important; }
      .pp-cta-band { flex-direction: column; text-align: center; gap: 20px; }
      .pp-age-selector { justify-content: center; }
    }
    @media (max-width: 640px) {
      .pp-hero-title { font-size: 1.5rem !important; }
      .pp-hero-right { grid-template-columns: 1fr !important; }
      .pp-kid-prog-meta { flex-direction: column; align-items: flex-start; gap: 12px; }
      .pp-modal-frow { grid-template-columns: 1fr !important; gap: 12px; }
      .pp-testi-card { text-align: center; }
      .pp-testi-card > div { flex-direction: column; text-align: center; gap: 12px; }
      .pp-testi-card .stars { margin: 0 auto; }
    }
    @media (max-width: 480px) {
      .pp-hero-ctas { flex-direction: column; align-items: stretch; gap: 12px; }
      .pp-hero-ctas button { width: 100%; text-align: center; }
      .pp-share-buttons { flex-direction: column; gap: 8px; }
      .pp-kid-feature { flex-wrap: wrap; }
    }
  `;
  document.head.appendChild(resp);
}

function useInView(t=0.15){const r=useRef(null);const[v,sv]=useState(false);useEffect(()=>{const o=new IntersectionObserver(([e])=>{if(e.isIntersecting)sv(true)},{threshold:t});if(r.current)o.observe(r.current);return()=>o.disconnect();},[]);return[r,v];} // eslint-disable-line react-hooks/exhaustive-deps

const ADULT_OFFERS = [
  { id:1, ico:"🗣️", title:"Anglais Général",           sub:"Débutant → Intermédiaire", hours:"60h",      price:"150 000 FCFA", desc:"Acquérir ou consolider les bases. Grammaire, vocabulaire, expression orale.",  popular:false, type_coaching:"groupe", routing:"assistante" },
  { id:2, ico:"🎓", title:"Préparation TOEIC",          sub:"Intermédiaire",            hours:"40h",      price:"390 000 FCFA", desc:"15 tests blancs, stratégies, vocabulaire professionnel. Score garanti 700+.",  popular:true,  type_coaching:"groupe", routing:"assistante" },
  { id:3, ico:"💼", title:"Anglais des Affaires",       sub:"Avancé",                  hours:"50h",      price:"200 000 FCFA", desc:"Réunions, négociations, emails professionnels, présentations.",                popular:false, type_coaching:"groupe", routing:"assistante" },
  { id:4, ico:"💬", title:"Conversation Intensif",      sub:"Tous niveaux",             hours:"30h",      price:"120 000 FCFA", desc:"Pratique orale intensive, débats, jeux de rôle pour gagner en aisance.",       popular:false, type_coaching:"groupe", routing:"assistante" },
  { id:5, ico:"🎯", title:"Coaching Privé En Ligne",    sub:"100% personnalisé",        hours:"Flexible", price:"Sur devis",    desc:"Séances vidéo individuelles avec un coach certifié. Programme sur mesure adapté à vos objectifs. Suivi par un Pedagogical Advisor.", popular:false, type_coaching:"prive", routing:"pa_advisor" },
];

const KIDS_PROGRAMS = {
  "3-6":    { ico:"🧸", title:"Petits Explorateurs (3–6 ans)", desc:"Découverte de l'anglais par le jeu, chansons et histoires animées.", duration:"30 min/séance", price:"60 000 FCFA/mois", features:["Méthode 100% ludique","Flashcards & chansons","Max 6 enfants/groupe","Rapport mensuel parents"] },
  "7-12":   { ico:"🚀", title:"Juniors (7–12 ans)",            desc:"Grammaire, vocabulaire et expression orale - approche interactive et gamifiée.", duration:"45 min/séance", price:"75 000 FCFA/mois", features:["Supports visuels animés","Quiz interactifs","Préparation scolaire","Cahier de suivi"] },
};

const TEEN_PROGRAMS = {
  "13-17":  { ico:"⭐", title:"Ados (13–17 ans)",              desc:"Préparation aux examens (TOEFL Junior), débats, culture anglophone.", duration:"60 min/séance", price:"90 000 FCFA/mois", features:["TOEFL Junior prep","Débats & culture","Méthodologie examen","Suivi trimestriel"] },
};

const STUDENT_PROGRAMS = {
  "18-25":  { ico:"🎓", title:"Étudiants (18–25 ans)",         desc:"Anglais académique, préparation IELTS/TOEIC, mobilité internationale.", duration:"90 min/séance", price:"120 000 FCFA/mois", features:["IELTS / TOEIC / TOEFL","Rédaction académique","Bourses & mobilité","Tarif étudiant"] },
};

const TRUST_POINTS = [
  { ico:"🔒", title:"Sécurité totale",       desc:"Classes modérées, accès parents, environnement bienveillant." },
  { ico:"📊", title:"Suivi trimestriel",     desc:"Rapport détaillé sur la progression de votre enfant." },
  { ico:"👩‍🏫", title:"Profs spécialisés",    desc:"Diplômés en enseignement jeunesse, expérience confirmée." },
  { ico:"🔄", title:"Horaires flexibles",    desc:"Cours en centre, à domicile ou en ligne selon vos besoins." },
];

export default function ParcoursParticulier() {
  const navigate    = useNavigate();
  const [tab,setTab]= useState("adultes");
  const [ageGroupKids, setAgeGroupKids] = useState("7-12");
  const [modal,setModal]       = useState(null);
  const [selOffer,setSelOffer] = useState(null);
  const [form,setForm]         = useState({ name:"", email:"", phone:"", birthDate:"", parentName:"", parentEmail:"", parentPhone:"", childName:"", childBirthDate:"", ageGroup:"", level:"", goal:"", consent:false, pack:"classique", lieu:"cabinet" });
  const [dispos, setDispos]    = useState([]); // [{jour, debut, fin}] pour coaching privé
  const GRILLE_DEFAUT = {
    classique: { label:"Classique", frequence:"3 séances de 2h / semaine", cabinet:150000, domicile:200000, en_ligne:100000 },
    intensive:  { label:"Intensive",  frequence:"5 séances / semaine",       cabinet:200000, domicile:300000, en_ligne:200000 },
  };
  const [grillePrivee, setGrillePrivee] = useState(GRILLE_DEFAUT);
  useEffect(() => {
    const API = process.env.REACT_APP_API_URL || "http://localhost:5001";
    fetch(`${API}/api/admin/plateforme-config/coaching_prive_config`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.valeur && typeof d.valeur === "object") setGrillePrivee({ ...GRILLE_DEFAUT, ...d.valeur }); })
      .catch(() => {});
  }, []); // eslint-disable-line
  const [submitting,setSub]    = useState(false);
  const [sent,setSent]         = useState(false);
  const [erreur,setErreur]     = useState("");

  const [heroRef, heroInView]     = useInView();
  const [offersRef, offersInView] = useInView();
  const [kidsRef, kidsInView]     = useInView();
  const [teensRef, teensInView]   = useInView();
  const [studentsRef, studentsInView] = useInView();

  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const openModal = (type, offer=null) => { setModal(type); setSelOffer(offer); setSent(false); setErreur(""); setDispos([]); setForm({ name:"", email:"", phone:"", birthDate:"", parentName:"", parentEmail:"", parentPhone:"", childName:"", childBirthDate:"", ageGroup:"", level:"", goal:"", consent:false, pack:"classique", lieu: type === "coaching_prive" ? "en_ligne" : "cabinet" }); };
  const closeModal = () => { setModal(null); setSent(false); setErreur(""); };

  const handleSubmit = async () => {
    setSub(true); setErreur("");
    const API = process.env.REACT_APP_API_URL || "http://localhost:5001";
    try {
      let endpoint, body;

      if (modal === "coaching_prive") {
        // Étape 1 : enregistrer le lead
        try {
          await fetch(`${API}/api/inscriptions/adulte/submit`, {
            method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ nom_complet: form.name, email: form.email||null, telephone: form.phone, offre_titre: "Coaching Privé En Ligne", niveau_detecte: form.level||null }),
          });
        } catch(_) {}
        // Étape 2 : assigner au PA
        const paR = await fetch(`${API}/api/parcours/assistantes-pa`);
        const paD = await paR.json();
        const pa = (paD.assistantes||[])[0]||null;
        if (!pa) throw new Error("Aucun conseiller pédagogique disponible. Contactez-nous directement.");
        const ar = await fetch(`${API}/api/parcours/assignation`, {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            assistante_id:      pa.id,
            prospect_nom:       form.name,
            prospect_email:     form.email||undefined,
            prospect_telephone: form.phone,
            type_cours:         "en_ligne",
            type_coaching:      "prive",
            source:             "formulaire_coaching_prive",
            notes:              form.goal||undefined,
            pack_coaching:      form.pack||"classique",
            lieu_coaching:      "en_ligne",
            cout_formation:     grillePrivee[form.pack||"classique"]?.en_ligne || null,
            disponibilites:     dispos.length > 0 ? { horaires: dispos } : undefined,
          }),
        });
        if (!ar.ok) { const ad=await ar.json(); throw new Error(ad.error||"Erreur lors de l'envoi"); }
        setSent(true); return;
      } else if (modal === "adulte") {
        endpoint = "/api/inscriptions/adulte/submit";
        body = { nom_complet: form.name, email: form.email, telephone: form.phone, offre_titre: selOffer?.title || null, niveau_detecte: form.level || null };
      } else if (modal === "enfant" || modal === "ado") {
        endpoint = "/api/inscriptions/enfant/submit";
        const parts = (form.childName || "").trim().split(" ");
        body = {
          prenom_enfant:    parts[0] || form.childName,
          nom_enfant:       parts.slice(1).join(" ") || "-",
          date_naissance:   form.childBirthDate || null,
          tranche_age:      form.ageGroup || ageGroupKids,
          nom_parent:       form.parentName,
          email_parent:     form.parentEmail,
          telephone_parent: form.parentPhone,
        };
      } else if (modal === "etudiant") {
        endpoint = "/api/inscriptions/etudiant/submit";
        const parts = (form.name || "").trim().split(" ");
        body = { prenom: parts[0] || form.name, nom: parts.slice(1).join(" ") || "-", email: form.email, telephone: form.phone, niveau: form.level || null, objectif: selOffer?.title || form.goal || null, consentement_donnees: true };
      } else if (modal === "essai") {
        endpoint = "/api/leads/submit";
        body = { nom: form.name, email: form.email, telephone: form.phone, niveau: form.level || null, objectif: form.goal || null };
      }

      if (!endpoint) return;
      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch(e) {
      setErreur(e?.message || "Une erreur est survenue. Vérifiez votre connexion et réessayez.");
    } finally {
      setSub(false);
    }
  };

  const kidProg = KIDS_PROGRAMS[ageGroupKids];
  const teenProg = TEEN_PROGRAMS["13-17"];
  const studentProg = STUDENT_PROGRAMS["18-25"];

  return (
    <>
      <SEO
        title="Parcours Particulier - Cours d'anglais sur mesure | Binnie's English Training"
        description="Découvrez le parcours particulier BET : formations d'anglais personnalisées pour adultes, adaptées à votre niveau et vos objectifs."
        canonicalUrl="/parcours/particulier"
      />
      <div className="pp-root" style={S.page}>

        <div ref={heroRef} style={S.hero}>
          <div style={S.heroOrb1}/><div style={S.heroOrb2}/>
          <div style={S.heroInner}>
            <div style={S.breadcrumb}>
              <span style={S.bLink} onClick={()=>navigate("/")}>Accueil</span>
              <span style={S.bSep}>/</span>
              <span style={{color:"#e2e8f0"}}>Particuliers</span>
            </div>
            <div className="pp-hero-layout" style={S.heroLayout}>
              <div style={{animation:heroInView?"ppFU .6s ease both":"none"}}>
                <div style={S.heroTags}>
                  <span style={S.tagRed}>👤 PARTICULIERS</span>
                  <span style={S.tagBlue}>🏛️ CABINET AGRÉÉ ÉTAT CI</span>
                </div>
                <h1 className="pp-hero-title" style={S.heroH1}>Formation anglais<br /><em style={S.heroAccent}>pour particuliers</em></h1>
                <p style={S.heroDesc}>Adultes, enfants, adolescents ou étudiants - choisissez le programme adapté à votre profil et vos objectifs.</p>
                <div className="pp-hero-ctas" style={S.heroCtas}>
                  <button style={S.btnRed} onClick={()=>openModal("essai")}
                    onMouseEnter={e=>e.currentTarget.style.background="#b91c1c"}
                    onMouseLeave={e=>e.currentTarget.style.background="#ff2945"}>
                    🎓 Cours d'essai gratuit
                  </button>
                  <button style={S.btnOutlineWhite} onClick={()=>navigate("/test-niveau")}>
                    🧪 Test de niveau →
                  </button>
                </div>
              </div>
              <div className="pp-hero-right" style={{...S.heroRight, animation:heroInView?"ppFU .7s ease .15s both":"none"}}>
                {[["👤","Adultes","Certifications & Pro"],["🧸","Enfants","3–12 ans"],["⭐","Ados","13–17 ans"],["🎓","Étudiants","18–25 ans"]].map(([ico,t,s],i)=>(
                  <div key={i} style={S.heroPill}><span style={{fontSize:"1.5rem"}}>{ico}</span><div><div style={{fontWeight:800,fontSize:".88rem",color:"#fff"}}>{t}</div><div style={{fontSize:".72rem",color:"rgba(255,255,255,.55)"}}>{s}</div></div></div>
                ))}
              </div>
            </div>
          </div>
          <div style={{lineHeight:0}}><svg viewBox="0 0 1440 48" style={{display:"block",width:"100%"}} preserveAspectRatio="none"><path fill="#f8fafc" d="M0,24 C480,48 960,0 1440,24 L1440,48 L0,48 Z"/></svg></div>
        </div>

        <div style={S.body}>
          <div style={S.inner}>

            <div className="pp-tabs-wrap" style={S.tabsWrap}>
              <button style={{...S.tabBtn,...(tab==="adultes"?S.tabBtnActive:{})}} onClick={()=>setTab("adultes")}>👤 Adultes</button>
              <button style={{...S.tabBtn,...(tab==="enfants"?S.tabBtnActive:{})}} onClick={()=>setTab("enfants")}>🧸 Enfants (3–12 ans)</button>
              <button style={{...S.tabBtn,...(tab==="ados"?S.tabBtnActive:{})}} onClick={()=>setTab("ados")}>⭐ Adolescents (13–17 ans)</button>
              <button style={{...S.tabBtn,...(tab==="etudiants"?S.tabBtnActive:{})}} onClick={()=>setTab("etudiants")}>🎓 Étudiants (18–25 ans)</button>
            </div>

            {tab === "adultes" && (
              <div style={{animation:"ppFU .4s ease"}}>
                <div style={{marginBottom:40}}>
                  <span style={S.badge}>NOS FORMATIONS ADULTES</span>
                  <h2 style={S.sH2}>Choisissez votre programme</h2>
                  <p style={S.sDesc}>Des formations adaptées à chaque objectif - du débutant au niveau expert.</p>
                </div>
                <div ref={offersRef} className="pp-offers-grid" style={S.offersGrid}>
                  {ADULT_OFFERS.map((o,i)=>(
                    <div key={o.id} className="pp-offer" style={{...S.offerCard, opacity:offersInView?1:0, transform:offersInView?"none":"translateY(16px)", transition:`all .5s ease ${i*80}ms`, border:o.type_coaching==="prive"?"1.5px solid #bfdbfe":o.popular?"1.5px solid #ff2945":"1.5px solid #e2e8f0", background:o.type_coaching==="prive"?"#f8fbff":undefined}}>
                      {o.popular && <div style={S.offerPopBadge}>⭐ Le plus choisi</div>}
                      {o.type_coaching==="prive" && <div style={{...S.offerPopBadge,background:"linear-gradient(135deg,#0c33ac,#011451)"}}>🧑‍💼 PA Advisor</div>}
                      <div style={S.offerIco}>{o.ico}</div>
                      <h3 style={S.offerTitle}>{o.title}</h3>
                      <span style={S.offerSub}>{o.sub}</span>
                      <p style={S.offerDesc}>{o.desc}</p>
                      <div style={S.offerMeta}>
                        <span style={S.metaPill}>⏱ {o.hours}</span>
                        <span style={{...S.metaPill,fontWeight:800,color:o.type_coaching==="prive"?"#0c33ac":"#ff2945"}}>{o.price}</span>
                      </div>
                      <button style={{...S.btnRedSm, marginTop:"auto", ...(o.type_coaching==="prive"?{background:"linear-gradient(135deg,#0c33ac,#011451)"}:{})}}
                        onClick={()=>openModal(o.type_coaching==="prive"?"coaching_prive":"adulte",o)}
                        onMouseEnter={e=>e.currentTarget.style.opacity="0.85"}
                        onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                        {o.type_coaching==="prive"?"Prendre RDV →":"S'inscrire →"}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="pp-cta-band" style={S.ctaBand}>
                  <div style={S.ctaBandOrb}/>
                  <div style={{position:"relative",zIndex:1}}>
                    <h3 style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.6rem",color:"#fff",margin:"0 0 10px",fontWeight:400}}>Pas encore décidé ?</h3>
                    <p style={{color:"rgba(255,255,255,.75)",margin:0,fontSize:".92rem"}}>Essayez un cours gratuit de 45 minutes - sans engagement, sans carte bancaire.</p>
                  </div>
                  <button style={{...S.btnWhite,flexShrink:0}} onClick={()=>openModal("essai")}
                    onMouseEnter={e=>e.currentTarget.style.background="#f1f5f9"}
                    onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                    Réserver mon essai gratuit →
                  </button>
                </div>
              </div>
            )}

            {tab === "enfants" && (
              <div style={{animation:"ppFU .4s ease"}}>
                <div style={{marginBottom:36}}>
                  <span style={S.badge}>PROGRAMMES ENFANTS (3–12 ANS)</span>
                  <h2 style={S.sH2}>Choisissez la tranche d'âge</h2>
                  <p style={S.sDesc}>Des méthodes ludiques et interactives pour les plus jeunes.</p>
                </div>
                <div className="pp-age-selector" style={S.ageSelector}>
                  {Object.entries(KIDS_PROGRAMS).map(([key,p])=>(
                    <button key={key} style={{...S.ageBtn,...(ageGroupKids===key?S.ageBtnActive:{})}} onClick={()=>setAgeGroupKids(key)}>
                      <span style={{fontSize:"1.3rem"}}>{p.ico}</span>
                      <span>{key==="3-6"?"3–6 ans":"7–12 ans"}</span>
                    </button>
                  ))}
                </div>
                <div ref={kidsRef} className="pp-kid-program-card" style={{...S.kidProgramCard, animation:kidsInView?"ppSI .4s ease":"none"}}>
                  <div style={S.kidProgLeft}>
                    <div style={S.kidProgIco}>{kidProg.ico}</div>
                    <h2 style={S.kidProgTitle}>{kidProg.title}</h2>
                    <p style={S.kidProgDesc}>{kidProg.desc}</p>
                    <div className="pp-kid-prog-meta" style={S.kidProgMeta}>
                      <div style={S.kidMetaItem}><span style={{fontWeight:800,color:"#ff2945",fontSize:"1.1rem"}}>{kidProg.price}</span><span style={{fontSize:".72rem",color:"#64748b",fontWeight:600}}>TARIF MENSUEL</span></div>
                      <div style={S.kidMetaItem}><span style={{fontWeight:800,color:"#0c33ac",fontSize:"1.1rem"}}>{kidProg.duration}</span><span style={{fontSize:".72rem",color:"#64748b",fontWeight:600}}>PAR SÉANCE</span></div>
                    </div>
                    <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:24}}>
                      <button style={S.btnRed} onClick={()=>openModal("enfant",{title:kidProg.title})}
                        onMouseEnter={e=>e.currentTarget.style.background="#b91c1c"}
                        onMouseLeave={e=>e.currentTarget.style.background="#ff2945"}>
                        Inscrire mon enfant →
                      </button>
                      <button style={S.btnOutlineRed} onClick={()=>openModal("essai")}>Essai gratuit</button>
                    </div>
                  </div>
                  <div style={S.kidProgRight}>
                    <h4 style={{fontWeight:800,fontSize:".9rem",color:"#011451",margin:"0 0 16px"}}>Ce programme comprend :</h4>
                    {kidProg.features.map((f,i)=>(
                      <div key={i} className="pp-kid-feature" style={S.kidFeature}><span style={S.kidCheck}>✓</span><span style={{fontSize:".9rem",color:"#334155"}}>{f}</span></div>
                    ))}
                    <div style={S.kidAssurance}>
                      <h4 style={{fontWeight:800,fontSize:".88rem",color:"#011451",margin:"0 0 14px"}}>Pourquoi nous faire confiance ?</h4>
                      {TRUST_POINTS.map((tp,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10}}>
                          <span style={{fontSize:"1.1rem"}}>{tp.ico}</span>
                          <div><div style={{fontWeight:700,fontSize:".83rem",color:"#011451"}}>{tp.title}</div><div style={{fontSize:".78rem",color:"#64748b"}}>{tp.desc}</div></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="pp-testi-card" style={S.testiCard}>
                  <p style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.15rem",color:"#011451",fontStyle:"italic",margin:"0 0 16px",lineHeight:1.6}}>
                    "Mon fils a gagné en confiance et ses notes ont grimpé de 3 points en seulement 6 mois !"
                  </p>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:38,height:38,borderRadius:"50%",background:"linear-gradient(135deg,#ff2945,#0c33ac)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:".82rem"}}>MK</div>
                    <div><div style={{fontWeight:800,fontSize:".88rem"}}>Marie Kouamé</div><div style={{fontSize:".76rem",color:"#64748b"}}>Parent d'élève - Centre Angré</div></div>
                    <div style={{marginLeft:"auto",display:"flex",gap:2}}>{[1,2,3,4,5].map(s=><span key={s} style={{color:"#f59e0b",fontSize:"1rem"}}>★</span>)}</div>
                  </div>
                </div>
              </div>
            )}

            {tab === "ados" && (
              <div style={{animation:"ppFU .4s ease"}}>
                <div style={{marginBottom:36}}>
                  <span style={S.badge}>PROGRAMME ADOLESCENTS (13–17 ANS)</span>
                  <h2 style={S.sH2}>Préparez l'avenir</h2>
                  <p style={S.sDesc}>Un cursus dynamique pour maîtriser l'anglais et réussir les examens.</p>
                </div>
                <div ref={teensRef} className="pp-kid-program-card" style={{...S.kidProgramCard, animation:teensInView?"ppSI .4s ease":"none"}}>
                  <div style={S.kidProgLeft}>
                    <div style={S.kidProgIco}>{teenProg.ico}</div>
                    <h2 style={S.kidProgTitle}>{teenProg.title}</h2>
                    <p style={S.kidProgDesc}>{teenProg.desc}</p>
                    <div className="pp-kid-prog-meta" style={S.kidProgMeta}>
                      <div style={S.kidMetaItem}><span style={{fontWeight:800,color:"#ff2945",fontSize:"1.1rem"}}>{teenProg.price}</span><span style={{fontSize:".72rem",color:"#64748b",fontWeight:600}}>TARIF MENSUEL</span></div>
                      <div style={S.kidMetaItem}><span style={{fontWeight:800,color:"#0c33ac",fontSize:"1.1rem"}}>{teenProg.duration}</span><span style={{fontSize:".72rem",color:"#64748b",fontWeight:600}}>PAR SÉANCE</span></div>
                    </div>
                    <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:24}}>
                      <button style={S.btnRed} onClick={()=>openModal("ado",{title:teenProg.title})}
                        onMouseEnter={e=>e.currentTarget.style.background="#b91c1c"}
                        onMouseLeave={e=>e.currentTarget.style.background="#ff2945"}>
                        Inscrire mon adolescent →
                      </button>
                      <button style={S.btnOutlineRed} onClick={()=>openModal("essai")}>Essai gratuit</button>
                    </div>
                  </div>
                  <div style={S.kidProgRight}>
                    <h4 style={{fontWeight:800,fontSize:".9rem",color:"#011451",margin:"0 0 16px"}}>Ce programme comprend :</h4>
                    {teenProg.features.map((f,i)=>(
                      <div key={i} className="pp-kid-feature" style={S.kidFeature}><span style={S.kidCheck}>✓</span><span style={{fontSize:".9rem",color:"#334155"}}>{f}</span></div>
                    ))}
                    <div style={S.kidAssurance}>
                      <h4 style={{fontWeight:800,fontSize:".88rem",color:"#011451",margin:"0 0 14px"}}>Pourquoi nous faire confiance ?</h4>
                      {TRUST_POINTS.map((tp,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10}}>
                          <span style={{fontSize:"1.1rem"}}>{tp.ico}</span>
                          <div><div style={{fontWeight:700,fontSize:".83rem",color:"#011451"}}>{tp.title}</div><div style={{fontSize:".78rem",color:"#64748b"}}>{tp.desc}</div></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="pp-testi-card" style={S.testiCard}>
                  <p style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.15rem",color:"#011451",fontStyle:"italic",margin:"0 0 16px",lineHeight:1.6}}>
                    "Les cours ont boosté la confiance de ma fille et elle a décroché son TOEFL Junior avec succès !"
                  </p>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:38,height:38,borderRadius:"50%",background:"linear-gradient(135deg,#ff2945,#0c33ac)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:".82rem"}}>SL</div>
                    <div><div style={{fontWeight:800,fontSize:".88rem"}}>Sylvie L.</div><div style={{fontSize:".76rem",color:"#64748b"}}>Parent - Centre Bouaké</div></div>
                    <div style={{marginLeft:"auto",display:"flex",gap:2}}>{[1,2,3,4,5].map(s=><span key={s} style={{color:"#f59e0b",fontSize:"1rem"}}>★</span>)}</div>
                  </div>
                </div>
              </div>
            )}

            {tab === "etudiants" && (
              <div style={{animation:"ppFU .4s ease"}}>
                <div style={{marginBottom:36}}>
                  <span style={S.badge}>PROGRAMME ÉTUDIANTS (18–25 ANS)</span>
                  <h2 style={S.sH2}>Réussissez vos examens et votre carrière</h2>
                  <p style={S.sDesc}>Des cursus intensifs pour l’université, les concours et la mobilité internationale.</p>
                </div>
                <div ref={studentsRef} className="pp-kid-program-card" style={{...S.kidProgramCard, animation:studentsInView?"ppSI .4s ease":"none"}}>
                  <div style={S.kidProgLeft}>
                    <div style={S.kidProgIco}>{studentProg.ico}</div>
                    <h2 style={S.kidProgTitle}>{studentProg.title}</h2>
                    <p style={S.kidProgDesc}>{studentProg.desc}</p>
                    <div className="pp-kid-prog-meta" style={S.kidProgMeta}>
                      <div style={S.kidMetaItem}><span style={{fontWeight:800,color:"#ff2945",fontSize:"1.1rem"}}>{studentProg.price}</span><span style={{fontSize:".72rem",color:"#64748b",fontWeight:600}}>TARIF MENSUEL</span></div>
                      <div style={S.kidMetaItem}><span style={{fontWeight:800,color:"#0c33ac",fontSize:"1.1rem"}}>{studentProg.duration}</span><span style={{fontSize:".72rem",color:"#64748b",fontWeight:600}}>PAR SÉANCE</span></div>
                    </div>
                    <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:24}}>
                      <button style={S.btnRed} onClick={()=>openModal("etudiant",{title:studentProg.title})}
                        onMouseEnter={e=>e.currentTarget.style.background="#b91c1c"}
                        onMouseLeave={e=>e.currentTarget.style.background="#ff2945"}>
                        Je m'inscris →
                      </button>
                      <button style={S.btnOutlineRed} onClick={()=>openModal("essai")}>Essai gratuit</button>
                    </div>
                  </div>
                  <div style={S.kidProgRight}>
                    <h4 style={{fontWeight:800,fontSize:".9rem",color:"#011451",margin:"0 0 16px"}}>Ce programme comprend :</h4>
                    {studentProg.features.map((f,i)=>(
                      <div key={i} className="pp-kid-feature" style={S.kidFeature}><span style={S.kidCheck}>✓</span><span style={{fontSize:".9rem",color:"#334155"}}>{f}</span></div>
                    ))}
                    <div style={S.kidAssurance}>
                      <h4 style={{fontWeight:800,fontSize:".88rem",color:"#011451",margin:"0 0 14px"}}>Pourquoi nous faire confiance ?</h4>
                      {TRUST_POINTS.map((tp,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10}}>
                          <span style={{fontSize:"1.1rem"}}>{tp.ico}</span>
                          <div><div style={{fontWeight:700,fontSize:".83rem",color:"#011451"}}>{tp.title}</div><div style={{fontSize:".78rem",color:"#64748b"}}>{tp.desc}</div></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="pp-testi-card" style={S.testiCard}>
                  <p style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.15rem",color:"#011451",fontStyle:"italic",margin:"0 0 16px",lineHeight:1.6}}>
                    "Grâce au programme Étudiants, j’ai obtenu 920 au TOEIC et décroché mon stage à Londres !"
                  </p>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:38,height:38,borderRadius:"50%",background:"linear-gradient(135deg,#ff2945,#0c33ac)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:".82rem"}}>AD</div>
                    <div><div style={{fontWeight:800,fontSize:".88rem"}}>Awa Diop</div><div style={{fontSize:".76rem",color:"#64748b"}}>Étudiante - Centre Plateau</div></div>
                    <div style={{marginLeft:"auto",display:"flex",gap:2}}>{[1,2,3,4,5].map(s=><span key={s} style={{color:"#f59e0b",fontSize:"1rem"}}>★</span>)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODALS (inchangés) */}
      {modal === "adulte" && (
        <ModalWrap onClose={closeModal}>
          {sent ? <SuccessView name={form.name} email={form.email} onClose={closeModal} /> : (
            <>
              <div style={S.modalHeader}>
                <h2 style={S.modalTitle}>Inscription - {selOffer?.title}</h2>
                <p style={S.modalSub}>{selOffer?.price && `${selOffer.price} · `}Réponse sous 24h</p>
              </div>
              <div style={S.modalBody}>
                <div className="pp-modal-frow" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <FField label="Nom complet *"><input className="pp-input" style={S.inp} placeholder="Jean Kouamé" value={form.name} onChange={e=>set("name",e.target.value)}/></FField>
                  <FField label="Email *"><input className="pp-input" style={S.inp} type="email" placeholder="jean@exemple.com" value={form.email} onChange={e=>set("email",e.target.value)}/></FField>
                </div>
                <div className="pp-modal-frow" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <FField label="Téléphone *"><input className="pp-input" style={S.inp} placeholder="+225 07 00 00 00 00" value={form.phone} onChange={e=>set("phone",e.target.value)}/></FField>
                  <FField label="Niveau actuel"><select className="pp-input" style={{...S.inp,cursor:"pointer"}} value={form.level} onChange={e=>set("level",e.target.value)}><option value="">Sélectionner</option><option>Débutant (A1)</option><option>Élémentaire (A2)</option><option>Intermédiaire (B1)</option><option>Avancé (B2+)</option></select></FField>
                </div>
                <FField label="Vos objectifs"><textarea className="pp-input" style={{...S.inp,height:80,resize:"vertical"}} placeholder="Expliquez-nous votre objectif principal..." value={form.goal} onChange={e=>set("goal",e.target.value)}/></FField>
                <Consent form={form} set={set}/>
                {erreur && <p style={{color:"#ff2945",fontSize:".82rem",textAlign:"center",margin:"8px 0 0"}}>{erreur}</p>}
                <SubmitBtn submitting={submitting} onClick={handleSubmit} label="Confirmer mon inscription"/>
              </div>
            </>
          )}
        </ModalWrap>
      )}

      {modal === "enfant" && (
        <ModalWrap onClose={closeModal}>
          {sent ? <SuccessView name={form.parentName} email={form.parentEmail} onClose={closeModal}/> : (
            <>
              <div style={S.modalHeader}>
                <h2 style={S.modalTitle}>Inscription Enfant - {KIDS_PROGRAMS[ageGroupKids]?.title}</h2>
                <p style={S.modalSub}>Informations sur l'enfant + parent/tuteur</p>
              </div>
              <div style={S.modalBody}>
                <p style={S.modalSection}>👶 Informations de l'enfant</p>
                <div className="pp-modal-frow" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <FField label="Prénom de l'enfant *"><input className="pp-input" style={S.inp} placeholder="Kofi" value={form.childName} onChange={e=>set("childName",e.target.value)}/></FField>
                  <FField label="Date de naissance"><input className="pp-input" style={S.inp} type="date" value={form.childBirthDate} onChange={e=>set("childBirthDate",e.target.value)}/></FField>
                </div>
                <FField label="Tranche d'âge"><select className="pp-input" style={{...S.inp,cursor:"pointer"}} value={form.ageGroup||ageGroupKids} onChange={e=>set("ageGroup",e.target.value)}>
                  {Object.keys(KIDS_PROGRAMS).map(k=><option key={k} value={k}>{k==="3-6"?"3–6 ans":"7–12 ans"}</option>)}
                </select></FField>
                <p style={{...S.modalSection,marginTop:20}}>👨‍👩‍👦 Parent / Tuteur</p>
                <div className="pp-modal-frow" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <FField label="Nom complet *"><input className="pp-input" style={S.inp} placeholder="Jean Kouamé" value={form.parentName} onChange={e=>set("parentName",e.target.value)}/></FField>
                  <FField label="Email *"><input className="pp-input" style={S.inp} type="email" placeholder="jean@exemple.com" value={form.parentEmail} onChange={e=>set("parentEmail",e.target.value)}/></FField>
                </div>
                <FField label="Téléphone *"><input className="pp-input" style={S.inp} placeholder="+225 07 00 00 00 00" value={form.parentPhone} onChange={e=>set("parentPhone",e.target.value)}/></FField>
                <Consent form={form} set={set}/>
                {erreur && <p style={{color:"#ff2945",fontSize:".82rem",textAlign:"center",margin:"8px 0 0"}}>{erreur}</p>}
                <SubmitBtn submitting={submitting} onClick={handleSubmit} label="Inscrire mon enfant"/>
              </div>
            </>
          )}
        </ModalWrap>
      )}

      {modal === "ado" && (
        <ModalWrap onClose={closeModal}>
          {sent ? <SuccessView name={form.parentName} email={form.parentEmail} onClose={closeModal}/> : (
            <>
              <div style={S.modalHeader}>
                <h2 style={S.modalTitle}>Inscription Adolescent - {TEEN_PROGRAMS["13-17"]?.title}</h2>
                <p style={S.modalSub}>Informations sur l'adolescent + parent/tuteur</p>
              </div>
              <div style={S.modalBody}>
                <p style={S.modalSection}>🧑 Informations de l'adolescent</p>
                <div className="pp-modal-frow" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <FField label="Nom complet *"><input className="pp-input" style={S.inp} placeholder="Koffi" value={form.childName} onChange={e=>set("childName",e.target.value)}/></FField>
                  <FField label="Date de naissance"><input className="pp-input" style={S.inp} type="date" value={form.childBirthDate} onChange={e=>set("childBirthDate",e.target.value)}/></FField>
                </div>
                <FField label="Niveau actuel"><select className="pp-input" style={{...S.inp,cursor:"pointer"}} value={form.level} onChange={e=>set("level",e.target.value)}><option value="">Sélectionner</option><option>Débutant (A1)</option><option>Élémentaire (A2)</option><option>Intermédiaire (B1)</option><option>Avancé (B2+)</option></select></FField>
                <p style={{...S.modalSection,marginTop:20}}>👨‍👩‍👧 Parent / Tuteur</p>
                <div className="pp-modal-frow" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <FField label="Nom complet *"><input className="pp-input" style={S.inp} placeholder="Jean Kouamé" value={form.parentName} onChange={e=>set("parentName",e.target.value)}/></FField>
                  <FField label="Email *"><input className="pp-input" style={S.inp} type="email" placeholder="jean@exemple.com" value={form.parentEmail} onChange={e=>set("parentEmail",e.target.value)}/></FField>
                </div>
                <FField label="Téléphone *"><input className="pp-input" style={S.inp} placeholder="+225 07 00 00 00 00" value={form.parentPhone} onChange={e=>set("parentPhone",e.target.value)}/></FField>
                <Consent form={form} set={set}/>
                {erreur && <p style={{color:"#ff2945",fontSize:".82rem",textAlign:"center",margin:"8px 0 0"}}>{erreur}</p>}
                <SubmitBtn submitting={submitting} onClick={handleSubmit} label="Inscrire mon adolescent"/>
              </div>
            </>
          )}
        </ModalWrap>
      )}

      {modal === "etudiant" && (
        <ModalWrap onClose={closeModal}>
          {sent ? <SuccessView name={form.name} email={form.email} onClose={closeModal}/> : (
            <>
              <div style={S.modalHeader}>
                <h2 style={S.modalTitle}>Inscription Étudiant - {STUDENT_PROGRAMS["18-25"]?.title}</h2>
                <p style={S.modalSub}>Programme {STUDENT_PROGRAMS["18-25"]?.title}</p>
              </div>
              <div style={S.modalBody}>
                <div className="pp-modal-frow" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <FField label="Nom complet *"><input className="pp-input" style={S.inp} placeholder="Jean Kouamé" value={form.name} onChange={e=>set("name",e.target.value)}/></FField>
                  <FField label="Email *"><input className="pp-input" style={S.inp} type="email" placeholder="jean@exemple.com" value={form.email} onChange={e=>set("email",e.target.value)}/></FField>
                </div>
                <div className="pp-modal-frow" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <FField label="Téléphone *"><input className="pp-input" style={S.inp} placeholder="+225 07 00 00 00 00" value={form.phone} onChange={e=>set("phone",e.target.value)}/></FField>
                  <FField label="Âge"><input className="pp-input" style={S.inp} type="number" placeholder="18-25" value={form.ageGroup} onChange={e=>set("ageGroup",e.target.value)}/></FField>
                </div>
                <FField label="Objectif (TOEIC, IELTS, études à l'étranger…)"><textarea className="pp-input" style={{...S.inp,height:80,resize:"vertical"}} value={form.goal} onChange={e=>set("goal",e.target.value)}/></FField>
                <Consent form={form} set={set}/>
                {erreur && <p style={{color:"#ff2945",fontSize:".82rem",textAlign:"center",margin:"8px 0 0"}}>{erreur}</p>}
                <SubmitBtn submitting={submitting} onClick={handleSubmit} label="Je m'inscris"/>
              </div>
            </>
          )}
        </ModalWrap>
      )}

      {modal === "coaching_prive" && (
        <ModalWrap onClose={closeModal}>
          {sent ? <SuccessView name={form.name} email={form.email} onClose={closeModal} msg="Un Pedagogical Advisor BET vous contactera sous 24–48h pour organiser votre coaching privé personnalisé."/> : (
            <>
              <div style={S.modalHeader}>
                <h2 style={S.modalTitle}>🎯 Coaching Privé En Ligne</h2>
                <p style={S.modalSub}>Séances individuelles · 100% sur mesure</p>
              </div>
              {/* Info PA */}
              <div style={{display:"flex",alignItems:"center",gap:12,background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:12,padding:"12px 16px",margin:"0 0 18px"}}>
                <div style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#0c33ac,#011451)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.2rem",flexShrink:0}}>🧑‍💼</div>
                <div style={{fontSize:".8rem",color:"#1e40af",lineHeight:1.5}}>Un <strong>Pedagogical Advisor BET</strong> vous contactera sous 24–48h pour définir votre programme et planifier vos séances.</div>
              </div>
              <div style={S.modalBody}>
                {/* ── Choix du pack ── */}
                <div style={{marginBottom:14}}>
                  <label style={{fontSize:".76rem",fontWeight:700,color:"#011451",display:"block",marginBottom:8}}>Choisissez votre formule *</label>
                  <div className="pp-modal-frow" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {Object.entries(grillePrivee).map(([key, g]) => {
                      const tarif = g.en_ligne || 0;
                      const active = form.pack === key;
                      return (
                        <button key={key} type="button" onClick={()=>set("pack",key)}
                          style={{padding:"14px 12px",borderRadius:12,border:`2px solid ${active?"#0c33ac":"#e2e8f0"}`,background:active?"linear-gradient(135deg,#eff6ff,#dbeafe)":"#fff",cursor:"pointer",textAlign:"left",transition:"all .18s"}}>
                          <div style={{fontWeight:800,fontSize:".9rem",color:active?"#0c33ac":"#0f172a",marginBottom:4}}>
                            {key==="classique"?"🔵":"🔴"} {g.label}
                          </div>
                          <div style={{fontSize:".72rem",color:"#64748b",marginBottom:8,lineHeight:1.4}}>{g.frequence}</div>
                          <div style={{fontWeight:900,fontSize:"1.05rem",color:active?"#0c33ac":"#0f172a"}}>
                            {tarif.toLocaleString("fr-FR")} <span style={{fontSize:".72rem",fontWeight:600,color:"#94a3b8"}}>F / mois</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* ── Récap prix ── */}
                {(() => {
                  const g = grillePrivee[form.pack||"classique"];
                  const tarif = g?.en_ligne || 0;
                  return (
                    <div style={{background:"linear-gradient(135deg,#0c33ac,#011451)",borderRadius:12,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div>
                        <div style={{fontSize:".72rem",color:"rgba(255,255,255,.65)",fontWeight:600,textTransform:"uppercase",letterSpacing:".05em"}}>Votre formule</div>
                        <div style={{fontSize:".9rem",fontWeight:800,color:"#fff",marginTop:2}}>
                          {g?.label} · 💻 En ligne
                        </div>
                        <div style={{fontSize:".72rem",color:"rgba(255,255,255,.7)",marginTop:2}}>{g?.frequence}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:"1.5rem",fontWeight:900,color:"#fff",lineHeight:1}}>{tarif.toLocaleString("fr-FR")}</div>
                        <div style={{fontSize:".72rem",color:"rgba(255,255,255,.65)",fontWeight:600}}>FCFA / mois</div>
                      </div>
                    </div>
                  );
                })()}
                {/* ── Infos contact ── */}
                <div className="pp-modal-frow" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <FField label="Nom complet *"><input className="pp-input" style={S.inp} placeholder="Jean Kouamé" value={form.name} onChange={e=>set("name",e.target.value)}/></FField>
                  <FField label="Numéro WhatsApp *"><input className="pp-input" style={S.inp} placeholder="+225 07 XX XX XX" value={form.phone} onChange={e=>set("phone",e.target.value)}/></FField>
                </div>
                <FField label="Email (optionnel)"><input className="pp-input" style={S.inp} type="email" placeholder="votre@email.com" value={form.email} onChange={e=>set("email",e.target.value)}/></FField>
                {/* ── Objectifs ── */}
                <div style={{marginTop:12}}>
                  <FField label="Vos objectifs">
                    <textarea className="pp-input" style={{...S.inp,height:60,resize:"vertical"}} placeholder="Ex : Améliorer mon anglais professionnel, préparer un entretien…" value={form.goal} onChange={e=>set("goal",e.target.value)}/>
                  </FField>
                </div>
                {/* ── Disponibilités structurées ── */}
                <div style={{marginTop:14}}>
                  <label style={{fontSize:".76rem",fontWeight:700,color:"#011451",display:"block",marginBottom:8}}>Vos disponibilités <span style={{color:"#94a3b8",fontWeight:500}}>(optionnel)</span></label>
                  {/* Chips jours */}
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:10}}>
                    {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(jour => {
                      const active = dispos.some(d => d.jour === jour);
                      return (
                        <button key={jour} type="button"
                          onClick={() => {
                            if (active) {
                              setDispos(prev => prev.filter(d => d.jour !== jour));
                            } else {
                              setDispos(prev => {
                                const ORDER = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
                                const next = [...prev, {jour, debut:"08:00"}];
                                return next.sort((a,b) => ORDER.indexOf(a.jour) - ORDER.indexOf(b.jour));
                              });
                            }
                          }}
                          style={{padding:"7px 16px",borderRadius:20,border:`2px solid ${active?"#0c33ac":"#e2e8f0"}`,
                            background:active?"#eff6ff":"#fff",color:active?"#0c33ac":"#64748b",
                            fontWeight:700,fontSize:".8rem",cursor:"pointer",transition:"all .15s"}}>
                          {jour}
                        </button>
                      );
                    })}
                  </div>
                  {/* Ligne heure début par jour sélectionné */}
                  {dispos.length > 0 && (
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {dispos.map(row => (
                        <div key={row.jour} style={{display:"flex",alignItems:"center",gap:10,background:"#f0f6ff",borderRadius:10,padding:"9px 12px",border:"1.5px solid #bfdbfe"}}>
                          <span style={{fontWeight:800,fontSize:".82rem",color:"#0c33ac",minWidth:34}}>{row.jour}</span>
                          <span style={{color:"#94a3b8",fontSize:".75rem",flexShrink:0}}>à partir de</span>
                          <input type="time" value={row.debut}
                            onChange={e => setDispos(prev => prev.map(d => d.jour===row.jour ? {...d, debut:e.target.value} : d))}
                            style={{padding:"5px 8px",borderRadius:8,border:"1px solid #bfdbfe",fontSize:".82rem",outline:"none",cursor:"pointer",background:"#fff",color:"#0f172a"}}/>
                          <button type="button"
                            onClick={() => setDispos(prev => prev.filter(d => d.jour !== row.jour))}
                            style={{marginLeft:"auto",background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:".9rem",padding:"2px 6px",borderRadius:6,lineHeight:1,flexShrink:0}}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {dispos.length === 0 && (
                    <p style={{fontSize:".72rem",color:"#94a3b8",margin:0}}>Cliquez sur un jour pour ajouter un créneau horaire</p>
                  )}
                </div>
                <Consent form={form} set={set}/>
                {erreur && <p style={{color:"#ff2945",fontSize:".82rem",textAlign:"center",margin:"8px 0 0"}}>{erreur}</p>}
                <button style={{...S.btnRed,width:"100%",padding:"13px",fontSize:"1rem",display:"flex",alignItems:"center",justifyContent:"center",gap:10,opacity:submitting?.7:1,background:"linear-gradient(135deg,#0c33ac,#011451)"}} onClick={handleSubmit} disabled={submitting||!form.name.trim()||!form.phone.trim()||!form.consent}>
                  {submitting?<><span style={{width:16,height:16,border:"2.5px solid rgba(255,255,255,.35)",borderTopColor:"#fff",borderRadius:"50%",animation:"ppSpin .8s linear infinite",display:"inline-block"}}/> Envoi en cours…</>:"📩 Envoyer ma demande →"}
                </button>
              </div>
            </>
          )}
        </ModalWrap>
      )}

      {modal === "essai" && (
        <ModalWrap onClose={closeModal}>
          {sent ? <SuccessView name={form.name} email={form.email} onClose={closeModal} msg="Un conseiller vous contactera sous 24h pour fixer votre cours d'essai gratuit."/> : (
            <>
              <div style={S.modalHeader}>
                <h2 style={S.modalTitle}>🎓 Cours d'essai gratuit</h2>
                <p style={S.modalSub}>45 minutes · Sans engagement · Avec un formateur certifié</p>
              </div>
              <div style={S.modalBody}>
                <div className="pp-modal-frow" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <FField label="Nom complet *"><input className="pp-input" style={S.inp} placeholder="Jean Kouamé" value={form.name} onChange={e=>set("name",e.target.value)}/></FField>
                  <FField label="Email *"><input className="pp-input" style={S.inp} type="email" placeholder="jean@exemple.com" value={form.email} onChange={e=>set("email",e.target.value)}/></FField>
                </div>
                <div className="pp-modal-frow" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <FField label="Téléphone *"><input className="pp-input" style={S.inp} placeholder="+225 07 00 00 00 00" value={form.phone} onChange={e=>set("phone",e.target.value)}/></FField>
                  <FField label="Votre niveau actuel"><select className="pp-input" style={{...S.inp,cursor:"pointer"}} value={form.level} onChange={e=>set("level",e.target.value)}><option value="">Sélectionner</option><option>Débutant</option><option>Intermédiaire</option><option>Avancé</option></select></FField>
                </div>
                <FField label="Objectif (TOEIC, voyage, entretien…)"><textarea className="pp-input" style={{...S.inp,height:72,resize:"vertical"}} value={form.goal} onChange={e=>set("goal",e.target.value)} placeholder="Précisez votre objectif…"/></FField>
                <Consent form={form} set={set}/>
                {erreur && <p style={{color:"#ff2945",fontSize:".82rem",textAlign:"center",margin:"8px 0 0"}}>{erreur}</p>}
                <SubmitBtn submitting={submitting} onClick={handleSubmit} label="Réserver mon essai gratuit"/>
              </div>
            </>
          )}
        </ModalWrap>
      )}

      <Footer/>
    </>
  );
}

/* ── Shared modal sub-components (inchangés) ────────── */
const ModalWrap = ({children, onClose}) => (
  <div style={S.overlay} onClick={onClose}>
    <div style={S.modalCard} onClick={e=>e.stopPropagation()}>
      <button style={S.modalClose} onClick={onClose}>✕</button>
      {children}
    </div>
  </div>
);
const FField=({label,children})=><div style={{display:"flex",flexDirection:"column",gap:4}}><label style={{fontSize:".76rem",fontWeight:700,color:"#011451"}}>{label}</label>{children}</div>;
const Consent=({form,set})=>(
  <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer",margin:"14px 0"}}>
    <input type="checkbox" checked={form.consent} onChange={e=>set("consent",e.target.checked)} style={{accentColor:"#ff2945",width:15,height:15,marginTop:2}}/>
    <span style={{fontSize:".82rem",color:"#475569",lineHeight:1.5}}>J'accepte que mes données soient utilisées par BET pour me contacter. <span style={{color:"#94a3b8"}}>(Confidentielles · Désinscription facile)</span></span>
  </label>
);
const SubmitBtn=({submitting,onClick,label})=>(
  <button style={{...S.btnRed,width:"100%",padding:"13px",fontSize:"1rem",display:"flex",alignItems:"center",justifyContent:"center",gap:10,opacity:submitting?.7:1}} onClick={onClick} disabled={submitting}>
    {submitting?<><span style={{width:16,height:16,border:"2.5px solid rgba(255,255,255,.35)",borderTopColor:"#fff",borderRadius:"50%",animation:"ppSpin .8s linear infinite",display:"inline-block"}}/> Envoi en cours…</>:label}
  </button>
);
const SuccessView=({name,email,onClose,msg})=>(
  <div style={{textAlign:"center",padding:"32px 24px"}}>
    <div style={{fontSize:"3rem",marginBottom:14}}>🎉</div>
    <h3 style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.4rem",margin:"0 0 10px",fontWeight:400}}>Demande enregistrée !</h3>
    <p style={{color:"#475569",fontSize:".92rem",lineHeight:1.7,margin:"0 0 24px"}}>{msg||`Merci ${name} ! Un conseiller vous contactera à ${email} sous 24h.`}</p>
    <button style={S.btnRed} onClick={onClose}>Fermer</button>
  </div>
);

const FF = "'Montserrat','Segoe UI',sans-serif";
const FD = "'Montserrat','Segoe UI',sans-serif"; 
const S = {
  page:       { fontFamily:FF, background:"#f8fafc", minHeight:"100vh", color:"#011451" },
  inner:      { maxWidth:1180, margin:"0 auto", padding:"0 24px" },
  body:       { padding:"52px 0 64px" },
  hero:       { background:"linear-gradient(135deg,#011451 0%,#011451 55%,#0c33ac 100%)", padding:"52px 0 0", position:"relative", overflow:"hidden", minHeight:480, display:"flex", flexDirection:"column" },
  heroOrb1:   { position:"absolute", width:360, height:360, borderRadius:"50%", background:"rgba(220,38,38,.1)", top:-100, right:-60, pointerEvents:"none" },
  heroOrb2:   { position:"absolute", width:220, height:220, borderRadius:"50%", background:"rgba(30,58,138,.15)", bottom:40, left:-50, pointerEvents:"none" },
  heroInner:  { maxWidth:1180, margin:"0 auto", padding:"0 24px", position:"relative", zIndex:1 },
  breadcrumb: { display:"flex", alignItems:"center", gap:8, marginBottom:22, fontSize:".82rem", flexWrap:"wrap" },
  bLink:      { color:"rgba(255,255,255,.6)", cursor:"pointer", textDecoration:"underline" },
  bSep:       { color:"rgba(255,255,255,.3)" },
  heroLayout: { display:"grid", gridTemplateColumns:"1fr 340px", gap:48, alignItems:"center", paddingBottom:52 },
  heroTags:   { display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" },
  tagRed:     { background:"rgba(220,38,38,.25)", border:"1px solid rgba(220,38,38,.5)", color:"#fca5a5", borderRadius:999, padding:"4px 14px", fontSize:".72rem", fontWeight:800 },
  tagBlue:    { background:"rgba(30,58,138,.3)", border:"1px solid rgba(30,58,138,.6)", color:"#93c5fd", borderRadius:999, padding:"4px 14px", fontSize:".72rem", fontWeight:800 },
  heroH1:     { fontFamily:FD, fontSize:"clamp(2rem,4.5vw,3.2rem)", color:"#fff", margin:"0 0 14px", fontWeight:400, lineHeight:1.1 },
  heroAccent: { color:"#f87171", fontStyle:"italic" },
  heroDesc:   { color:"rgba(255,255,255,.75)", fontSize:"1rem", lineHeight:1.75, margin:"0 0 26px", maxWidth:520 },
  heroCtas:   { display:"flex", gap:12, flexWrap:"wrap" },
  heroRight:  { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 },
  heroPill:   { background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)", borderRadius:14, padding:"16px 14px", display:"flex", alignItems:"center", gap:10 },

  tabsWrap:   { display:"flex", gap:0, marginBottom:44, background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,.05)" },
  tabBtn:     { flex:1, padding:"14px", background:"none", border:"none", fontFamily:FF, fontSize:".92rem", fontWeight:700, color:"#64748b", cursor:"pointer", transition:"all .2s", borderBottom:"3px solid transparent" },
  tabBtnActive:{ color:"#ff2945", borderBottomColor:"#ff2945", background:"#fff0f2" },

  badge:      { display:"inline-block", background:"#fff0f2", color:"#ff2945", border:"1px solid #ffb3bc", borderRadius:999, padding:"4px 14px", fontSize:".72rem", fontWeight:800, letterSpacing:".06em", marginBottom:10 },
  sH2:        { fontFamily:FD, fontSize:"clamp(1.6rem,3vw,2.2rem)", fontWeight:400, color:"#011451", margin:"0 0 10px" },
  sDesc:      { fontSize:".95rem", color:"#64748b", lineHeight:1.65, margin:"0 0 32px" },

  offersGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))", gap:20, marginBottom:40 },
  offerCard:  { background:"#fff", borderRadius:16, padding:"22px 18px", cursor:"pointer", transition:"all .25s", display:"flex", flexDirection:"column", gap:8, position:"relative" },
  offerPopBadge:{ position:"absolute", top:-10, left:"50%", transform:"translateX(-50%)", background:"#ff2945", color:"#fff", borderRadius:999, padding:"2px 12px", fontSize:".66rem", fontWeight:800, whiteSpace:"nowrap" },
  offerIco:   { fontSize:"2rem" },
  offerTitle: { fontFamily:FD, fontSize:"1.15rem", margin:0, fontWeight:400, color:"#011451" },
  offerSub:   { display:"inline-block", background:"#f1f5f9", color:"#475569", borderRadius:999, padding:"2px 10px", fontSize:".72rem", fontWeight:600 },
  offerDesc:  { fontSize:".84rem", color:"#64748b", lineHeight:1.6, margin:"4px 0" },
  offerMeta:  { display:"flex", gap:8, flexWrap:"wrap", marginTop:4 },
  metaPill:   { background:"#f1f5f9", borderRadius:6, padding:"3px 10px", fontSize:".76rem", color:"#475569" },

  ctaBand:    { background:"linear-gradient(135deg,#011451,#0c33ac)", borderRadius:18, padding:"30px 32px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:24, position:"relative", overflow:"hidden" },
  ctaBandOrb: { position:"absolute", width:200, height:200, borderRadius:"50%", background:"rgba(220,38,38,.12)", top:-80, right:280, pointerEvents:"none" },

  ageSelector:{ display:"flex", gap:10, marginBottom:28, flexWrap:"wrap" },
  ageBtn:     { display:"flex", alignItems:"center", gap:8, padding:"10px 20px", background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:999, fontFamily:FF, fontWeight:700, fontSize:".86rem", color:"#475569", cursor:"pointer", transition:"all .2s" },
  ageBtnActive:{ background:"#fff0f2", borderColor:"#ff2945", color:"#ff2945", boxShadow:"0 2px 8px rgba(220,38,38,.15)" },

  kidProgramCard:{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:20, overflow:"hidden", display:"grid", gridTemplateColumns:"1fr 380px", boxShadow:"0 4px 24px rgba(0,0,0,.07)" },
  kidProgLeft:{ padding:"32px 28px", display:"flex", flexDirection:"column", gap:0 },
  kidProgIco: { fontSize:"2.8rem", marginBottom:12 },
  kidProgTitle:{ fontFamily:FD, fontSize:"1.5rem", margin:"0 0 10px", fontWeight:400, color:"#011451" },
  kidProgDesc:{ fontSize:".96rem", color:"#475569", lineHeight:1.7, margin:"0 0 20px" },
  kidProgMeta:{ display:"flex", gap:24 },
  kidMetaItem:{ display:"flex", flexDirection:"column", gap:3 },
  kidProgRight:{ background:"#f8fafc", padding:"28px 24px", borderLeft:"1px solid #f1f5f9", display:"flex", flexDirection:"column", gap:0 },
  kidFeature: { display:"flex", alignItems:"flex-start", gap:10, marginBottom:12 },
  kidCheck:   { width:20, height:20, borderRadius:"50%", background:"#ff2945", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:".7rem", fontWeight:800, flexShrink:0 },
  kidAssurance:{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:"16px", marginTop:20 },

  testiCard:  { background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:"24px", marginTop:24, boxShadow:"0 2px 10px rgba(0,0,0,.05)" },

  overlay:    { position:"fixed", inset:0, background:"rgba(0,0,0,.6)", backdropFilter:"blur(4px)", display:"flex", alignItems:"flex-start", justifyContent:"center", overflowY:"auto", zIndex:9000, padding:"20px 16px", animation:"ppFI .2s ease" },
  modalCard:  { background:"#fff", borderRadius:20, width:"100%", maxWidth:560, position:"relative", animation:"ppSI .25s ease", boxShadow:"0 24px 60px rgba(0,0,0,.2)", margin:"auto" },
  modalClose: { position:"absolute", top:14, right:14, background:"#f1f5f9", border:"none", width:28, height:28, borderRadius:"50%", cursor:"pointer", color:"#64748b", fontSize:".88rem", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1 },
  modalHeader:{ background:"linear-gradient(135deg,#011451,#0c33ac)", padding:"24px 28px 20px" },
  modalTitle: { fontFamily:FD, fontSize:"1.3rem", color:"#fff", margin:"0 0 4px", fontWeight:400 },
  modalSub:   { fontSize:".82rem", color:"rgba(255,255,255,.6)", margin:0 },
  modalBody:  { padding:"22px 28px 26px" },
  modalSection:{ fontWeight:800, fontSize:".82rem", color:"#ff2945", textTransform:"uppercase", letterSpacing:".06em", margin:"0 0 14px" },
  inp:        { width:"100%", padding:"10px 13px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:".9rem", fontFamily:FF, boxSizing:"border-box", color:"#011451", background:"#fff", transition:"border-color .2s" },

  btnRed:     { padding:"11px 24px", background:"#ff2945", color:"#fff", border:"none", borderRadius:999, fontFamily:FF, fontWeight:800, fontSize:".9rem", cursor:"pointer", transition:"background .2s", boxShadow:"0 4px 14px rgba(220,38,38,.3)" },
  btnRedSm:   { padding:"9px 18px", background:"#ff2945", color:"#fff", border:"none", borderRadius:999, fontFamily:FF, fontWeight:700, fontSize:".82rem", cursor:"pointer", transition:"background .2s" },
  btnOutlineWhite:{ padding:"10px 22px", background:"transparent", color:"#fff", border:"1.5px solid rgba(255,255,255,.45)", borderRadius:999, fontFamily:FF, fontWeight:700, fontSize:".9rem", cursor:"pointer" },
  btnOutlineRed:  { padding:"10px 20px", background:"transparent", color:"#ff2945", border:"1.5px solid #ff2945", borderRadius:999, fontFamily:FF, fontWeight:700, fontSize:".88rem", cursor:"pointer" },
  btnWhite:   { padding:"11px 24px", background:"#fff", color:"#011451", border:"none", borderRadius:999, fontFamily:FF, fontWeight:800, fontSize:".9rem", cursor:"pointer", transition:"background .2s", whiteSpace:"nowrap" },
};