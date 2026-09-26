import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { servicesData } from "../../../data/servicesData";
import Footer from "../../Footer/Footer";
import { insertDemandeDevis } from "../../../services/formsService";
import SEO from "../SEO/SEO";

if (!document.querySelector("#svd-fonts")) {
  const l=document.createElement("link");l.id="svd-fonts";l.rel="stylesheet";
  l.href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&display=swap";
  document.head.appendChild(l);
}
if (!document.querySelector("#svd-kf")) {
  const s=document.createElement("style");s.id="svd-kf";
  s.textContent=`@keyframes svFU{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}@keyframes svFI{from{opacity:0}to{opacity:1}}@keyframes svSI{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}.sv-acc{animation:svFU .25s ease}`;
  document.head.appendChild(s);
}

// Injection des styles responsives
if (!document.querySelector("#svd-responsive")) {
  const resp = document.createElement("style");
  resp.id = "svd-responsive";
  resp.textContent = `
    .svd-root { overflow-x: hidden; max-width: 100%; }
    @media (max-width: 900px) {
      .svd-layout { grid-template-columns: 1fr !important; gap: 32px !important; }
      .svd-sidebar { position: relative !important; top: 0 !important; width: 100% !important; margin-top: 20px; }
      .svd-hero-layout { grid-template-columns: 1fr !important; gap: 32px !important; }
    }
    @media (max-width: 768px) {
      .svd-includes-grid, .svd-features-grid, .svd-whatyougain-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
      .svd-hero-inner { padding: 0 16px !important; }
      .svd-hero-title { font-size: 1.8rem !important; }
      .svd-tabs-inner { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
      .svd-tab-btn { padding: 10px 14px !important; font-size: 0.8rem !important; }
      .svd-steps-grid { grid-template-columns: 1fr !important; }
    }
    @media (max-width: 640px) {
      .svd-hero-title { font-size: 1.5rem !important; }
      .svd-side-card .price-row { flex-wrap: wrap; justify-content: center; }
      .svd-cta-buttons { flex-direction: column; align-items: stretch; gap: 12px; }
    }
    @media (max-width: 480px) {
      .svd-share-buttons { flex-direction: column; gap: 8px !important; }
      .svd-modal-btns { flex-direction: column; gap: 8px; }
    }
  `;
  document.head.appendChild(resp);
}

const SERVICES_MOCK={
  sejour:{
    name:"Séjour linguistique",tagline:"Immergez-vous totalement dans la langue anglaise",
    heroImage:"https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=1600&q=80",
    badge:"PROGRAMME PREMIUM",
    fullDescription:"Notre programme de séjour linguistique vous plonge directement dans un environnement anglophone authentique. Pendant votre séjour au UK, USA ou Canada, vous vivez et respirez l'anglais 24h/24.",
    features:["Hébergement chez des familles d'accueil certifiées","Cours intensifs en école partenaire","Activités culturelles immersives","Excursions et visites guidées","Encadrement BET sur place","Certificat de participation officiel","Transferts aéroport inclus","Assurance voyage complète"],
    whatYouGain:["Maîtrise totale de l'accent natif","Vocabulaire quotidien authentique","Confiance absolue à l'oral","Réseau international d'apprenants","Expérience de vie à l'étranger","Certificat reconnu"],
    target:"Apprenants niveau B1+ souhaitant une progression rapide et une expérience d'immersion authentique en pays anglophone.",
    duration:"2 semaines minimum · 3 mois maximum",price:"À partir de 1 200 000 FCFA",
    includes:["🌍 Hébergement famille d'accueil","✈️ Assistance visa & billets","🎓 École partenaire certifiée","🏛️ Activités culturelles","🛡️ Assurance voyage","📜 Certificat BET officiel"],
    steps:[
      {num:"01",title:"Candidature en ligne",desc:"Remplissez notre formulaire et faites votre test de niveau."},
      {num:"02",title:"Entretien & validation",desc:"Un conseiller BET étudie votre profil et valide votre candidature."},
      {num:"03",title:"Préparation au départ",desc:"Briefing complet, assistance visa, réservation hébergement."},
      {num:"04",title:"Séjour & immersion",desc:"Vous vivez votre expérience encadré par nos partenaires sur place."},
      {num:"05",title:"Retour & certification",desc:"Bilan de séjour + remise du certificat BET officiel."},
    ],
    testimonials:[
      {av:"👩🏾‍🎓",name:"Aïcha Konaté",role:"Étudiante en commerce, Abidjan",score:"Séjour UK 3 sem.",rating:5,text:"Trois semaines à Londres ont transformé mon anglais. Je parle maintenant avec fluidité et confiance. Une expérience inoubliable !"},
      {av:"👨🏿‍💼",name:"Eric N'Goran",role:"Cadre bancaire, NSIA",score:"Séjour USA 2 sem.",rating:5,text:"BET a tout géré à la perfection. Du visa au retour, tout était organisé. J'ai progressé en 2 semaines plus qu'en 1 an de cours classiques."},
    ],
    faq:[
      {q:"Quel niveau minimum pour partir en séjour ?",a:"Un niveau B1 (intermédiaire) est recommandé pour profiter pleinement de l'immersion. Si vous êtes en dessous, nous vous proposons d'abord une préparation intensive en Côte d'Ivoire."},
      {q:"Les visas sont-ils facilement obtenus ?",a:"Notre équipe accompagne chaque candidat dans ses démarches de visa. Nous avons un taux d'obtention visa de 94%. Nous vous guidons pas à pas."},
      {q:"Y a-t-il un âge minimum ?",a:"Les séjours sont ouverts à partir de 16 ans. Pour les mineurs, un encadrement spécifique est prévu et les parents sont tenus informés à chaque étape."},
    ],
  },
  interview:{
    name:"Préparation aux interviews",tagline:"Décrochez le poste de vos rêves en anglais",
    heroImage:"https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=1600&q=80",
    badge:"SERVICE CARRIÈRE",
    fullDescription:"Notre programme de préparation aux interviews vous prépare méthodiquement à réussir vos entretiens professionnels en anglais. Simulations, feedback personnalisé et techniques éprouvées.",
    features:["20+ simulations d'entretiens réels","Feedback immédiat de coaches experts","50 questions d'entretien + réponses modèles","Techniques de gestion du stress","Vocabulaire RH et business","Conseils sur le langage non-verbal","Préparation aux entretiens vidéo","Certification de préparation BET"],
    whatYouGain:["Réponses structurées et impactantes","Maîtrise du vocabulaire professionnel","Confiance lors des entretiens","Connaissance des codes culturels","Capacité à négocier un salaire","Portfolio de réponses personnalisées"],
    target:"Professionnels et étudiants passant des entretiens pour des postes nécessitant l'anglais, dans des entreprises nationales ou internationales.",
    duration:"2 semaines intensives · Sessions de 2h",price:"120 000 FCFA",
    includes:["🎯 20 simulations d'entretiens","📚 Guide 50 Q&A en anglais","🎥 Séances enregistrées pour analyse","👤 Coach RH certifié","📜 Certificat de préparation","♾️ Accès ressources à vie"],
    steps:[
      {num:"01",title:"Audit de votre profil",desc:"Analyse de votre CV, poste visé et points à améliorer."},
      {num:"02",title:"Séances de coaching",desc:"4 séances de 2h avec votre coach dédié, en présentiel ou en ligne."},
      {num:"03",title:"Simulations réelles",desc:"Mises en situation filmées avec feedback détaillé immédiat."},
      {num:"04",title:"Finalisation",desc:"Préparation des réponses signature et révision complète."},
    ],
    testimonials:[
      {av:"👩🏽‍💼",name:"Sylvie Aka",role:"Ingénieure, Bolloré Africa",score:"Offre CDI obtenue",rating:5,text:"En 2 semaines, j'ai transformé ma façon de me présenter. L'entretien s'est parfaitement déroulé et j'ai décroché le poste. Merci BET !"},
      {av:"👨🏾‍💻",name:"David Yao",role:"Développeur Senior, Orange CI",score:"Promotion internationale",rating:5,text:"Les simulations filmées sont redoutables. Voir mes propres erreurs et les corriger immédiatement a été très efficace."},
    ],
    faq:[
      {q:"En combien de temps puis-je être prêt ?",a:"Notre programme de 2 semaines est conçu pour une transformation rapide. Si vous avez plus de temps, nous recommandons 4 semaines pour une préparation encore plus approfondie."},
      {q:"Le service est-il disponible en ligne ?",a:"Oui, toutes nos séances de préparation sont disponibles en visioconférence. Vous profitez du même niveau de qualité qu'en présentiel."},
      {q:"Quel est le taux de réussite de vos clients ?",a:"87% de nos clients obtiennent le poste ou la promotion visée dans les 3 mois suivant la formation. Un résultat dont nous sommes très fiers."},
    ],
  },
};

const Stars=({r=5,size=13})=><span style={{display:"inline-flex",gap:1}}>{Array.from({length:5}).map((_,i)=><span key={i} style={{fontSize:size,color:i<Math.floor(r)?"#f59e0b":"#d1d5db"}}>★</span>)}</span>;

const FAQItem=({item})=>{
  const[open,setOpen]=useState(false);
  return(
    <div style={{border:`1.5px solid ${open?"#ff2945":"#e2e8f0"}`,borderRadius:10,overflow:"hidden",transition:"border-color .2s"}}>
      <button style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",background:"none",border:"none",fontFamily:FF,fontSize:".92rem",fontWeight:600,color:"#011451",cursor:"pointer",textAlign:"left",gap:12}} onClick={()=>setOpen(p=>!p)}>
        <span>{item.q}</span><span style={{fontSize:"1.3rem",color:"#ff2945",transition:"transform .2s",display:"inline-block",transform:open?"rotate(45deg)":"rotate(0)"}}>+</span>
      </button>
      {open&&<p className="sv-acc" style={{padding:"0 18px 14px",fontSize:".9rem",color:"#475569",lineHeight:1.7,margin:0}}>{item.a}</p>}
    </div>
  );
};

const ServiceDetail=()=>{
  const{serviceId}=useParams(); const navigate=useNavigate();
  const rawService=servicesData?.[serviceId?.toLowerCase()];
  const service=rawService?{...SERVICES_MOCK[serviceId?.toLowerCase()]||SERVICES_MOCK.sejour,...rawService}:(SERVICES_MOCK[serviceId?.toLowerCase()]||SERVICES_MOCK.sejour);
  const[activeTab,setActiveTab]=useState("apercu");
  const[stickyBar,setStickyBar]=useState(false);
  const[modalOpen,setModalOpen]=useState(false);
  const[success,setSuccess]=useState(false);
  const[formData,setFormData]=useState({prenom:"",email:"",telephone:"",message:""});
  const[infosOpen,setInfosOpen]=useState(false);
  const[infosSuccess,setInfosSuccess]=useState(false);
  const[infosForm,setInfosForm]=useState({nom:"",email:"",tel:"",sujet:"",question:""});
  const[infosErreur,setInfosErreur]=useState("");
  const[infosLoading,setInfosLoading]=useState(false);
  const[submitErreur,setSubmitErreur]=useState("");
  const[submitLoading,setSubmitLoading]=useState(false);
  const heroRef=useRef(null);

  useEffect(()=>{const h=()=>setStickyBar(window.scrollY>(heroRef.current?.offsetHeight||400)-80);window.addEventListener("scroll",h);return()=>window.removeEventListener("scroll",h);},[]);

  if(!service)return<div style={{minHeight:"60vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}><h2 style={{fontFamily:FD}}>Service non trouvé</h2><button onClick={()=>navigate("/")} style={{background:"#ff2945",color:"#fff",border:"none",borderRadius:999,padding:"10px 24px",fontFamily:FF,fontWeight:700,cursor:"pointer"}}>← Retour</button></div>;

  const TABS=[{id:"apercu",label:"Aperçu"},{id:"details",label:"Ce que vous gagnez"},{id:"etapes",label:"Comment ça marche"},{id:"avis",label:`Avis (${service.testimonials?.length||0})`},{id:"faq",label:"FAQ"}];
  const handleSubmit=async()=>{
    if(!formData.prenom||!formData.email||!formData.telephone)return alert("Veuillez remplir votre prénom, email et téléphone.");
    setSubmitLoading(true);setSubmitErreur("");
    try{
      await insertDemandeDevis({
        nom:formData.prenom,
        email:formData.email,
        tel:formData.telephone,
        message:formData.message||null,
        source:"service_souscription",
        source_nom:service.name,
      });
      setSuccess(true);
      setTimeout(()=>{setSuccess(false);setModalOpen(false);setFormData({prenom:"",email:"",telephone:"",message:""});},3000);
    }catch(err){
      setSubmitErreur("Une erreur est survenue. Veuillez réessayer.");
    }finally{
      setSubmitLoading(false);
    }
  };
  const handleInfos=async()=>{
    if(!infosForm.nom||!infosForm.email||!infosForm.tel)return;
    setInfosLoading(true);setInfosErreur("");
    try{
      await insertDemandeDevis({
        nom:infosForm.nom,
        email:infosForm.email,
        tel:infosForm.tel,
        message:(infosForm.sujet?`[${infosForm.sujet}] `:"")+(infosForm.question||""),
        source:"service",
        source_nom:service.name,
      });
      setInfosSuccess(true);
      setTimeout(()=>{setInfosSuccess(false);setInfosOpen(false);setInfosForm({nom:"",email:"",tel:"",sujet:"",question:""});},3000);
    }catch(err){
      setInfosErreur("Une erreur est survenue. Veuillez réessayer.");
    }finally{
      setInfosLoading(false);
    }
  };

  return(
    <div className="svd-root" style={S.page}>
      <SEO
        title={`${service.name} - Binnie's English Training | BET`}
        description={`Découvrez le service ${service.name} proposé par Binnie's English Training.`}
        canonicalUrl={`/service/${serviceId}`}
      />

      {/* HERO */}
      <div ref={heroRef} style={{...S.hero,backgroundImage:`linear-gradient(135deg,rgba(10,20,40,.9) 0%,rgba(30,58,138,.65) 100%), url(${service.heroImage})`,backgroundSize:"cover",backgroundPosition:"center"}}>
        <div className="svd-hero-inner" style={S.heroInner}>
          <div style={S.breadcrumb}>
            <span style={S.bLink} onClick={()=>navigate("/")}>Accueil</span><span style={S.bSep}>/</span>
            <span style={S.bLink} onClick={()=>navigate(-1)}>Services</span><span style={S.bSep}>/</span>
            <span style={{color:"#e2e8f0"}}>{service.name}</span>
          </div>
          <span style={{display:"inline-block",background:"rgba(220,38,38,.25)",border:"1px solid rgba(220,38,38,.5)",color:"#fca5a5",borderRadius:999,padding:"4px 16px",fontSize:".73rem",fontWeight:800,letterSpacing:".06em",marginBottom:16}}>{service.badge}</span>
          <h1 className="svd-hero-title" style={S.heroTitle}>{service.name}</h1>
          <p style={{color:"rgba(255,255,255,.85)",fontSize:"1.05rem",margin:"0 0 22px",lineHeight:1.6}}>{service.tagline}</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:28}}>
            {[`⏱ ${service.duration}`,`💰 ${service.price}`,`🎯 ${service.target?.slice(0,55)}…`].map((t,i)=><span key={i} style={S.heroPill}>{t}</span>)}
          </div>
          <div className="svd-cta-buttons" style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            <button style={S.heroBtnRed} onMouseEnter={e=>e.currentTarget.style.background="#b91c1c"} onMouseLeave={e=>e.currentTarget.style.background="#ff2945"} onClick={()=>setModalOpen(true)}>Souscrire maintenant →</button>
            <button style={S.heroBtnOutline} onClick={()=>setActiveTab("details")}>Découvrir le service</button>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div style={{...S.tabsBar,...(stickyBar?S.tabsSticky:{})}}>
        <div className="svd-tabs-inner" style={S.tabsInner}>{TABS.map(t=><button key={t.id} className="svd-tab-btn" style={{...S.tabBtn,...(activeTab===t.id?S.tabActive:{})}} onClick={()=>setActiveTab(t.id)}>{t.label}</button>)}</div>
      </div>

      <div className="svd-layout" style={S.layout}>
        <div style={S.contentCol}>

          {activeTab==="apercu"&&(
            <div style={{animation:"svFU .4s ease"}}>
              <section style={S.section}>
                <h2 style={S.sH2}>À propos du service</h2>
                <p style={S.descP}>{service.fullDescription}</p>
              </section>
              <section style={S.section}>
                <h2 style={S.sH2}>Ce service comprend</h2>
                <div className="svd-includes-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  {service.includes?.map((inc,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background: i%2===0?"#fff0f2":"#eef1ff",border:`1px solid ${i%2===0?"#ffb3bc":"#b3c4ff"}`,borderRadius:10}}>
                      <span style={{fontSize:"1.3rem"}}>{inc.split(" ")[0]}</span>
                      <span style={{fontSize:".88rem",color:"#334155"}}>{inc.split(" ").slice(1).join(" ")}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section style={S.section}>
                <h2 style={S.sH2}>Public concerné & infos pratiques</h2>
                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  {[{ico:"🎯",title:"Public concerné",content:service.target},{ico:"⏱️",title:"Durée / Engagement",content:service.duration},{ico:"💰",title:"Tarifs",content:service.price}].map((c,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"flex-start",gap:14,padding:"16px 18px",background:"#fafafa",border:`1px solid ${i%2===0?"#ffb3bc":"#b3c4ff"}`,borderRadius:12}}>
                      <div style={{width:38,height:38,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.2rem",flexShrink:0,background:i%2===0?"#fff0f2":"#eef1ff"}}>{c.ico}</div>
                      <div><h4 style={{margin:"0 0 6px",fontSize:".88rem",fontWeight:800,color:"#011451"}}>{c.title}</h4><p style={{margin:0,fontSize:".86rem",color:"#475569",lineHeight:1.6}}>{c.content}</p></div>
                    </div>
                  ))}
                </div>
              </section>
              <section style={S.section}>
                <h2 style={S.sH2}>Ce qui est inclus</h2>
                <div className="svd-features-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  {service.features?.map((f,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10}}>
                      <div style={{width:20,height:20,borderRadius:"50%",background:`linear-gradient(135deg,${i%2===0?"#ff2945":"#0c33ac"},#011451)`,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".65rem",fontWeight:800,flexShrink:0,marginTop:1}}>✓</div>
                      <span style={{fontSize:".9rem",color:"#334155"}}>{f}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab==="details"&&(
            <div style={{animation:"svFU .4s ease"}}>
              <section style={S.section}>
                <h2 style={S.sH2}>Ce que vous gagnez avec ce service</h2>
                <div className="svd-whatyougain-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  {service.whatYouGain?.map((g,i)=>(
                    <div key={i} style={{background:"#fafafa",border:`1px solid ${i%2===0?"#ffb3bc":"#b3c4ff"}`,borderRadius:12,padding:"16px 14px",display:"flex",flexDirection:"column",gap:10}}>
                      <div style={{width:32,height:32,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FD,fontSize:"1rem",background:i%2===0?"#fff0f2":"#eef1ff",color:i%2===0?"#ff2945":"#0c33ac"}}>0{i+1}</div>
                      <p style={{margin:0,fontSize:".9rem",color:"#334155",fontWeight:600,lineHeight:1.5}}>{g}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab==="etapes"&&(
            <div style={{animation:"svFU .4s ease"}}>
              <section style={S.section}>
                <h2 style={S.sH2}>Comment ça marche ?</h2>
                <p style={S.subP}>Un processus simple et accompagné de A à Z par nos équipes.</p>
                <div className="svd-steps-grid" style={{display:"flex",flexDirection:"column",gap:0}}>
                  {service.steps?.map((step,i)=>(
                    <div key={i} style={{display:"grid",gridTemplateColumns:"48px 1fr",gap:0,alignItems:"start"}}>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                        <div style={{width:44,height:44,borderRadius:"50%",background:`linear-gradient(135deg,${i%2===0?"#ff2945":"#0c33ac"},#011451)`,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FD,fontSize:"1.1rem",flexShrink:0,zIndex:1}}>{step.num}</div>
                        {i<service.steps.length-1&&<div style={{width:2,flex:1,minHeight:32,background:"linear-gradient(180deg,#ff2945,#0c33ac)",opacity:.2,margin:"2px auto 0"}}/>}
                      </div>
                      <div style={{padding:"2px 0 32px 18px"}}>
                        <h3 style={{fontFamily:FD,fontSize:"1.1rem",margin:"0 0 6px",fontWeight:400,color:i%2===0?"#ff2945":"#0c33ac"}}>{step.title}</h3>
                        <p style={{fontSize:".9rem",color:"#64748b",margin:0,lineHeight:1.6}}>{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab==="avis"&&(
            <div style={{animation:"svFU .4s ease"}}>
              <section style={S.section}>
                <h2 style={S.sH2}>Ce que disent nos clients</h2>
                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  {service.testimonials?.map((t,i)=>(
                    <div key={i} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:20}}>
                      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,flexWrap:"wrap"}}>
                        <div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#011451,#0c33ac)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.2rem",flexShrink:0}}>{t.av}</div>
                        <div><div style={{fontWeight:800,fontSize:".9rem"}}>{t.name}</div><div style={{fontSize:".76rem",color:"#64748b"}}>{t.role}</div></div>
                        <div style={{marginLeft:"auto",background:"#fff0f2",color:"#ff2945",borderRadius:999,padding:"3px 12px",fontSize:".74rem",fontWeight:800,whiteSpace:"nowrap"}}>{t.score}</div>
                      </div>
                      <Stars r={t.rating} size={13}/>
                      <p style={{fontSize:".9rem",color:"#475569",lineHeight:1.65,marginTop:10,fontStyle:"italic"}}>"{t.text}"</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab==="faq"&&(
            <div style={{animation:"svFU .4s ease"}}>
              <section style={S.section}>
                <h2 style={S.sH2}>Questions fréquentes</h2>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>{service.faq?.map((item,i)=><FAQItem key={i} item={item}/>)}</div>
              </section>
            </div>
          )}
        </div>

        {/* SIDEBAR */}
        <aside className="svd-sidebar" style={{...S.sidebar,top:stickyBar?80:20}}>
          <div className="svd-side-card" style={S.sideCard}>
            <div style={{background:"linear-gradient(135deg,#011451,#0c33ac)",padding:"20px 18px"}}>
              <span style={{display:"inline-block",background:"rgba(220,38,38,.3)",border:"1px solid rgba(220,38,38,.5)",color:"#fca5a5",borderRadius:999,padding:"3px 12px",fontSize:".7rem",fontWeight:800,marginBottom:10}}>{service.badge}</span>
              <div style={{fontFamily:FD,fontSize:"1.1rem",color:"#fff",lineHeight:1.3}}>{service.name}</div>
            </div>
            <div className="price-row" style={{padding:"16px 18px 10px"}}>
              <span style={{fontFamily:FD,fontSize:"1.9rem",color:"#011451"}}>{service.price}</span>
              <p style={{fontSize:".78rem",color:"#64748b",margin:"4px 0 0"}}>⏱ {service.duration}</p>
            </div>
            <div style={{padding:"0 18px 14px",display:"flex",flexDirection:"column",gap:10}}>
              <button style={S.btnEnroll} onMouseEnter={e=>e.currentTarget.style.background="#b91c1c"} onMouseLeave={e=>e.currentTarget.style.background="#ff2945"} onClick={()=>setModalOpen(true)}>Souscrire maintenant</button>
              <button style={S.btnDevis} onMouseEnter={e=>{e.currentTarget.style.background="#0c33ac";e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#0c33ac";}} onClick={()=>setInfosOpen(true)}>Demander plus d'infos</button>
            </div>
            <p style={{textAlign:"center",fontSize:".76rem",color:"#64748b",padding:"0 18px 14px",margin:0}}>✓ Garantie satisfait ou remboursé 30 jours</p>
            <div style={{padding:"14px 18px",borderTop:"1px solid #f1f5f9"}}>
              <p style={{fontWeight:700,fontSize:".82rem",color:"#011451",margin:"0 0 12px"}}>Ce service comprend :</p>
              {service.includes?.map((inc,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><span style={{fontSize:".9rem"}}>{inc.split(" ")[0]}</span><span style={{fontSize:".82rem",color:"#475569"}}>{inc.split(" ").slice(1).join(" ")}</span></div>)}
            </div>
            <div className="svd-share-buttons" style={{padding:"12px 18px",borderTop:"1px solid #f1f5f9",display:"flex",gap:8}}>
              {["🔗 Partager","🎁 Offrir","🔖 Sauver"].map((l,i)=><button key={i} style={{flex:1,background:"#f1f5f9",border:"none",borderRadius:8,padding:"7px 4px",fontSize:".72rem",fontWeight:600,cursor:"pointer",color:"#475569"}}>{l}</button>)}
            </div>
          </div>
        </aside>
      </div>

      {/* MODAL */}
      {modalOpen&&(
        <div className="modal-overlay-mq" style={S.overlayBg} onClick={()=>setModalOpen(false)}>
          <div style={S.payModal} onClick={e=>e.stopPropagation()}>
            <button style={S.payClose} onClick={()=>setModalOpen(false)}>✕</button>
            {success?(
              <div style={{textAlign:"center",padding:"24px 0"}}>
                <div style={{fontSize:"3rem",marginBottom:16}}>🎉</div>
                <h3 style={{fontSize:"1.3rem",fontWeight:800,margin:"0 0 8px"}}>Demande envoyée !</h3>
                <p style={{color:"#64748b",fontSize:".9rem"}}>Un conseiller BET vous contactera sous 24h.</p>
              </div>
            ):<>
              <h2 style={S.payTitle}>Souscrire - {service.name}</h2>
              <div style={{background:"#fff0f2",border:"1px solid #ffb3bc",borderRadius:10,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,gap:12,flexWrap:"wrap"}}>
                <span style={{fontSize:".88rem",color:"#64748b"}}>Service : <strong style={{color:"#011451"}}>{service.name}</strong></span>
                <span style={{fontFamily:FD,fontSize:"1.1rem",color:"#ff2945",flexShrink:0}}>{service.price}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {[{label:"Prénom *",ph:"Jean",key:"prenom"},{label:"Email *",ph:"jean@exemple.com",key:"email"},{label:"Téléphone *",ph:"+225 07 00 00 00 00",key:"telephone"}].map(f=>(
                  <div key={f.key}><p style={S.payLabel}>{f.label}</p><input style={S.payInput} placeholder={f.ph} value={formData[f.key]} onChange={e=>setFormData(p=>({...p,[f.key]:e.target.value}))}/></div>
                ))}
                <div><p style={S.payLabel}>Votre message / questions</p><textarea style={{...S.payInput,height:90,resize:"vertical"}} value={formData.message} onChange={e=>setFormData(p=>({...p,message:e.target.value}))} placeholder="Décrivez votre besoin..."/></div>
              </div>
              {submitErreur&&<p style={{color:"#ff2945",fontSize:".82rem",textAlign:"center",margin:"10px 0 0"}}>{submitErreur}</p>}
              <button style={{...S.payConfirmBtn,opacity:submitLoading?.7:1}} onClick={handleSubmit} disabled={submitLoading} onMouseEnter={e=>e.currentTarget.style.opacity=".9"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>{submitLoading?"Envoi en cours...":"Envoyer ma demande →"}</button>
              <p style={{textAlign:"center",fontSize:".74rem",color:"#94a3b8",marginTop:10}}>✓ Gratuit · ✓ Sans engagement · ✓ Réponse sous 24h</p>
            </>}
          </div>
        </div>
      )}
      {/* MODAL PLUS D'INFOS */}
      {infosOpen&&(
        <div className="modal-overlay-mq" style={S.overlayBg} onClick={()=>setInfosOpen(false)}>
          <div style={S.payModal} onClick={e=>e.stopPropagation()}>
            <button style={S.payClose} onClick={()=>setInfosOpen(false)}>✕</button>
            {infosSuccess?(
              <div style={{textAlign:"center",padding:"24px 0"}}>
                <div style={{fontSize:"3rem",marginBottom:16}}>📬</div>
                <h3 style={{fontSize:"1.3rem",fontWeight:800,margin:"0 0 8px",fontFamily:FD}}>Message envoyé !</h3>
                <p style={{color:"#64748b",fontSize:".9rem",lineHeight:1.6}}>Un conseiller BET vous répondra sous 24h avec toutes les informations demandées.</p>
              </div>
            ):(
              <>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
                  <div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#0c33ac,#0891b2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.2rem",flexShrink:0}}>💬</div>
                  <div>
                    <h2 style={{...S.payTitle,margin:0,fontSize:"1.15rem"}}>Demande d'informations</h2>
                    <p style={{fontSize:".78rem",color:"#64748b",margin:0}}>{service.name}</p>
                  </div>
                </div>
                <div style={{background:"#eef1ff",border:"1px solid #b3c4ff",borderRadius:10,padding:"10px 14px",marginBottom:18,fontSize:".82rem",color:"#0c33ac",fontWeight:600}}>
                  ℹ️ Notre équipe vous répond personnellement sous 24h
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <div>
                      <p style={S.payLabel}>Nom complet *</p>
                      <input style={S.payInput} placeholder="Jean Kouamé" value={infosForm.nom} onChange={e=>setInfosForm(p=>({...p,nom:e.target.value}))}/>
                    </div>
                    <div>
                      <p style={S.payLabel}>Téléphone *</p>
                      <input style={S.payInput} placeholder="07 00 00 00 00" value={infosForm.tel} onChange={e=>setInfosForm(p=>({...p,tel:e.target.value}))}/>
                    </div>
                  </div>
                  <div>
                    <p style={S.payLabel}>Email *</p>
                    <input style={S.payInput} placeholder="jean@exemple.ci" type="email" value={infosForm.email} onChange={e=>setInfosForm(p=>({...p,email:e.target.value}))}/>
                  </div>
                  <div>
                    <p style={S.payLabel}>Sujet de votre question</p>
                    <select style={S.payInput} value={infosForm.sujet} onChange={e=>setInfosForm(p=>({...p,sujet:e.target.value}))}>
                      <option value="">Sélectionner un sujet…</option>
                      <option>Tarifs et formules</option>
                      <option>Dates et disponibilités</option>
                      <option>Modalités en ligne / présentiel</option>
                      <option>Prise en charge entreprise</option>
                      <option>Autre</option>
                    </select>
                  </div>
                  <div>
                    <p style={S.payLabel}>Votre question</p>
                    <textarea style={{...S.payInput,height:90,resize:"vertical",paddingTop:10}} placeholder="Décrivez ce que vous souhaitez savoir…" value={infosForm.question} onChange={e=>setInfosForm(p=>({...p,question:e.target.value}))}/>
                  </div>
                </div>
                {infosErreur&&<p style={{color:"#ff2945",fontSize:".82rem",textAlign:"center",margin:"10px 0 0"}}>{infosErreur}</p>}
                <button style={{...S.payConfirmBtn,opacity:infosLoading?.7:1}} onClick={handleInfos} disabled={infosLoading||!infosForm.nom||!infosForm.email||!infosForm.tel} onMouseEnter={e=>e.currentTarget.style.opacity=".9"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                  {infosLoading?"Envoi en cours...":"Envoyer ma demande →"}
                </button>
                <p style={{textAlign:"center",fontSize:".74rem",color:"#94a3b8",marginTop:10}}>✓ Gratuit · ✓ Sans engagement · ✓ Réponse sous 24h</p>
              </>
            )}
          </div>
        </div>
      )}
      <Footer/>
    </div>
  );
};

const FF = "'Montserrat','Segoe UI',sans-serif";
const FD = "'Montserrat','Segoe UI',sans-serif"; 
const S={
  page:         {fontFamily:FF,color:"#011451",background:"#fff",minHeight:"100vh"},
  hero:         {padding:"52px 0 44px",position:"relative"},
  heroInner:    {maxWidth:1180,margin:"0 auto",padding:"0 24px"},
  breadcrumb:   {display:"flex",alignItems:"center",gap:8,marginBottom:20,fontSize:".82rem",flexWrap:"wrap"},
  bLink:        {color:"#93c5fd",cursor:"pointer",textDecoration:"underline"},
  bSep:         {color:"rgba(255,255,255,.3)"},
  heroTitle:    {fontFamily:FD,fontSize:"clamp(2rem,5vw,3.5rem)",color:"#fff",margin:"0 0 12px",fontWeight:400,lineHeight:1.1},
  heroPill:     {background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.18)",color:"rgba(255,255,255,.82)",borderRadius:6,padding:"4px 12px",fontSize:".78rem",fontWeight:500},
  heroBtnRed:   {background:"#ff2945",color:"#fff",border:"none",borderRadius:999,padding:"13px 28px",fontSize:".95rem",fontWeight:800,cursor:"pointer",transition:"background .2s",boxShadow:"0 4px 16px rgba(220,38,38,.35)"},
  heroBtnOutline:{background:"transparent",color:"#fff",border:"2px solid rgba(255,255,255,.4)",borderRadius:999,padding:"12px 26px",fontSize:".92rem",fontWeight:700,cursor:"pointer"},
  tabsBar:      {background:"#fff",borderBottom:"1px solid #e2e8f0",position:"relative",zIndex:50},
  tabsSticky:   {position:"sticky",top:0,boxShadow:"0 2px 8px rgba(0,0,0,.06)"},
  tabsInner:    {maxWidth:1180,margin:"0 auto",padding:"0 24px",display:"flex",overflowX:"auto",gap:4},
  tabBtn:       {background:"none",border:"none",borderBottom:"3px solid transparent",padding:"14px 18px",fontSize:".88rem",fontWeight:600,color:"#64748b",cursor:"pointer",whiteSpace:"nowrap",transition:"all .2s",fontFamily:FF},
  tabActive:    {color:"#ff2945",borderBottomColor:"#ff2945"},
  layout:       {maxWidth:1180,margin:"0 auto",padding:"36px 24px",display:"grid",gridTemplateColumns:"1fr 310px",gap:36,alignItems:"start"},
  contentCol:   {minWidth:0},
  section:      {marginBottom:40,paddingBottom:36,borderBottom:"1px solid #f1f5f9"},
  sH2:          {fontFamily:FD,fontSize:"1.4rem",fontWeight:400,margin:"0 0 20px",color:"#011451"},
  subP:         {fontSize:".86rem",color:"#64748b",margin:"-12px 0 20px"},
  descP:        {fontSize:".95rem",color:"#475569",lineHeight:1.75,margin:"0 0 14px"},
  sidebar:      {position:"sticky",alignSelf:"start",transition:"top .3s"},
  sideCard:     {background:"#fff",border:"1px solid #e2e8f0",borderRadius:16,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,.08)"},
  btnEnroll:    {display:"block",width:"100%",padding:"13px",background:"#ff2945",color:"#fff",border:"none",borderRadius:999,fontFamily:FF,fontWeight:800,fontSize:".95rem",cursor:"pointer",transition:"background .2s"},
  btnDevis:     {display:"block",width:"100%",padding:"12px",background:"transparent",color:"#0c33ac",border:"1.5px solid #0c33ac",borderRadius:999,fontFamily:FF,fontWeight:700,fontSize:".88rem",cursor:"pointer",transition:"all .2s",textAlign:"center"},
  overlayBg:    {position:"fixed",inset:0,background:"rgba(0,0,0,.65)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9000,padding:16,animation:"svFI .2s ease"},
  payModal:     {background:"#fff",borderRadius:20,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",padding:"28px",position:"relative",animation:"svSI .25s ease",boxShadow:"0 30px 80px rgba(0,0,0,.22)"},
  payClose:     {position:"absolute",top:14,right:14,background:"#f1f5f9",border:"none",width:28,height:28,borderRadius:"50%",cursor:"pointer",fontSize:".9rem",color:"#64748b"},
  payTitle:     {fontFamily:FD,fontSize:"1.3rem",margin:"0 0 16px",fontWeight:400},
  payLabel:     {fontSize:".8rem",fontWeight:700,color:"#011451",margin:"0 0 5px"},
  payInput:     {width:"100%",padding:"10px 14px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:".9rem",fontFamily:FF,outline:"none",marginBottom:4,boxSizing:"border-box"},
  payConfirmBtn:{width:"100%",padding:"13px",background:"linear-gradient(135deg,#ff2945,#0c33ac)",color:"#fff",border:"none",borderRadius:999,fontFamily:FF,fontWeight:800,fontSize:"1rem",cursor:"pointer",transition:"opacity .2s",marginTop:18},
};

export default ServiceDetail;