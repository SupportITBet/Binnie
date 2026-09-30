import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { coursesData } from "../../data/coursesData";
import { centersData } from "../../data/centersData";
import Footer from "../Footer/Footer";
import CataloguePdfBanner from "../CataloguePdfBanner";
import { insertDemandeDevis, insertInscriptionAdulte } from "../../services/formsService";
import { payerAvecTouchPoint, parsePrixFCFA, calcMontantReduit } from "../../utils/touchpoint";
import { ga4 } from "../../utils/ga4";
import { supabase } from "../../config/supabase";
import PromosBanner from "../Components/PromosBanner/PromosBanner";
import SEO from "../Components/SEO/SEO";

// Convertit centersData (objet clé→détail) en tableau format centres_master
const CENTRES_FALLBACK = Object.entries(centersData).map(([key, c]) => ({
  key,
  name:        c.name,
  ville:       c.address ? c.address.split(",").pop()?.trim() || "Abidjan" : "Abidjan",
  addr:        c.address || "",
  horaires:    c.hours   || "",
  description: c.description || "",
  actif:       true,
  offres:      [],
}));

const CENTRES_MASTER_KEY        = "bet_centres_master";
const OFFRES_EN_LIGNE_KEY       = "bet_offres_en_ligne";
const OFFRES_DOMICILE_KEY       = "bet_offres_domicile";
const COURSE_APERCU_KEY         = "bet_course_apercu_config";
const ASSISTANTES_EN_LIGNE_KEY  = "bet_assistantes_en_ligne";

const JOURS_LABELS_COURTS = { lundi:"Lun", mardi:"Mar", mercredi:"Mer", jeudi:"Jeu", vendredi:"Ven", samedi:"Sam", dimanche:"Dim" };
function formatJoursTravail(jours) {
  return jours.map(j => JOURS_LABELS_COURTS[j] || j).join(", ");
}

function apercuFromLS(typeParam) {
  const lsType = typeParam === "en-ligne" ? "en_ligne" : typeParam === "domicile" ? "domicile" : null;
  if (!lsType) return null;
  try {
    const s = localStorage.getItem(COURSE_APERCU_KEY);
    if (!s) return null;
    const cfg = JSON.parse(s);
    return cfg[lsType] || null;
  } catch { return null; }
}

function offresFromLS(lsKey) {
  try {
    const s = localStorage.getItem(lsKey);
    if (!s) return null;
    const list = JSON.parse(s).filter(o => o.actif !== false);
    if (!list.length) return null;
      // `formules` et `formules_actif` DOIVENT suivre : sans elles, le sélecteur de
      // formule de la page ne voyait jamais rien à proposer.
    return list.map(o => ({ name: o.label, img: o.img || "", price: o.prix || "Sur devis", duration: o.duration || "", details: o.desc || "", brochure_url: o.brochure_url || "", brochure_nom: o.brochure_nom || "", formules: o.formules || [], formules_actif: o.formules_actif === true, type_coaching: o.type_coaching || "groupe" }));
  } catch { return null; }
}
function loadCabinetCourse(centreKey) {
  if (!centreKey) return null;
  try {
    const s = localStorage.getItem(CENTRES_MASTER_KEY);
    if (!s) return null;
    const list = JSON.parse(s);
    const centre = list.find(c => c.key === centreKey && c.actif !== false);
    if (!centre) return null;
    const formats = (centre.offres || [])
      .filter(o => o.actif !== false)
      .map(o => ({ name: o.label, img: o.img || "", price: o.prix, duration: o.duration || "", details: o.desc, brochure_url: o.brochure_url || "", brochure_nom: o.brochure_nom || "", type_coaching: o.type_coaching || "groupe", formules: o.formules || [], formules_actif: o.formules_actif === true }));
    return {
      title: centre.name,
      subtitle: centre.subtitle || `Apprenez à ${centre.ville} dans un cadre moderne`,
      heroImage: centre.hero_image || undefined,
      description: centre.description,
      advantages: centre.advantages?.length ? centre.advantages : undefined,
      formats: formats.length ? formats : undefined,
      testimonials: centre.testimonials?.length ? centre.testimonials : undefined,
      faq: centre.faq?.length ? centre.faq : undefined,
    };
  } catch { return null; }
}

if (!document.querySelector("#cd-fonts")) {
  const l = document.createElement("link"); l.id="cd-fonts"; l.rel="stylesheet";
  l.href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&display=swap";
  document.head.appendChild(l);
}
if (!document.querySelector("#cd-kf")) {
  const s = document.createElement("style"); s.id="cd-kf";
  s.textContent=`@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes scaleIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}@keyframes spin{to{transform:rotate(360deg)}}.cd-acc{animation:fadeUp .25s ease}.cd-row:hover{background:#f8f9fa!important}`;
  document.head.appendChild(s);
}

const MOCK_COURSE = {
  title:"Maîtriser l'anglais professionnel",subtitle:"Anglais des affaires · Préparation certifications · Communication internationale",
  creator:"Binnie's English Training",lastUpdate:"03/2025",language:"Français",level:"Tous niveaux",
  heroImage:"https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1600&q=80",
  rating:4.9,ratingCount:1248,students:5320,duration:"18 h 30 min",lectureCount:94,
  price:"150 000 FCFA",oldPrice:"250 000 FCFA",discount:"40%",
  description:`Ce programme complet vous permettra de maîtriser l'anglais professionnel de A à Z. Que vous souhaitiez préparer une certification (TOEIC, TOEFL, IELTS), améliorer votre communication en entreprise ou partir étudier à l'étranger, cette formation est conçue pour vous.\n\nNotre méthode repose sur l'immersion progressive, la pratique intensive et un suivi personnalisé. Chaque leçon est pensée pour s'intégrer dans votre quotidien - même avec seulement 30 minutes par jour.`,
  advantages:["Accès illimité à toutes les ressources","Correction personnalisée par un coach","Certification officielle BET incluse","Sessions de conversation avec locuteurs natifs","Support 7j/7 via WhatsApp"],
  whatYouLearn:["Maîtriser la communication professionnelle en anglais","Préparer et réussir TOEIC, TOEFL ou IELTS","Rédiger des emails, rapports et présentations en anglais","Conduire des réunions et négociations internationales","Comprendre et parler l'anglais des affaires courant","Enrichir votre vocabulaire professionnel et académique","Maîtriser la grammaire anglaise sans mémorisation fastidieuse","Gagner confiance à l'oral lors d'entretiens ou conférences"],
  includes:[{icon:"🎥",label:"18h30 de vidéo à la demande"},{icon:"📝",label:"47 exercices pratiques"},{icon:"📄",label:"28 ressources téléchargeables"},{icon:"📱",label:"Accès mobile & tablette"},{icon:"∞",label:"Accès illimité à vie"},{icon:"🏆",label:"Certificat de fin de formation"},{icon:"🌐",label:"Sous-titres FR & EN"}],
  curriculum:[
    {title:"Introduction & Diagnostic",sessions:[{type:"video",title:"Bienvenue dans la formation",duration:"5:22",preview:true},{type:"quiz",title:"Test de positionnement initial",duration:""},{type:"video",title:"Comment tirer le maximum de ce cours",duration:"8:14",preview:true}]},
    {title:"Fondations de l'anglais professionnel",sessions:[{type:"video",title:"Prononciation & accent professionnel",duration:"12:30"},{type:"video",title:"Vocabulaire essentiel du monde des affaires",duration:"18:45"},{type:"quiz",title:"Exercice : Vocabulaire business",duration:""},{type:"video",title:"Construire des phrases complexes",duration:"14:20"}]},
    {title:"Communication écrite avancée",sessions:[{type:"video",title:"Rédiger un email professionnel parfait",duration:"16:10",preview:true},{type:"video",title:"Structure d'un rapport en anglais",duration:"20:05"},{type:"doc",title:"Templates : 15 modèles d'emails téléchargeables",duration:""},{type:"video",title:"Présentations PowerPoint en anglais",duration:"11:30"}]},
    {title:"Communication orale & réunions",sessions:[{type:"video",title:"Conduire une réunion en anglais",duration:"22:15"},{type:"video",title:"Techniques de négociation internationale",duration:"19:40"},{type:"quiz",title:"Mise en situation : simulation de réunion",duration:""},{type:"video",title:"Présenter des chiffres et données",duration:"14:55"}]},
    {title:"Préparation certifications TOEIC",sessions:[{type:"video",title:"Structure et stratégie du TOEIC",duration:"25:00"},{type:"video",title:"Listening Part 1 & 2 : techniques gagnantes",duration:"30:10"},{type:"quiz",title:"Test blanc TOEIC complet n°1",duration:""},{type:"video",title:"Reading et grammaire express",duration:"28:45"},{type:"quiz",title:"Test blanc TOEIC complet n°2",duration:""}]},
    {title:"Entretiens & présentation de soi",sessions:[{type:"video",title:"Se présenter en anglais avec impact",duration:"15:20",preview:true},{type:"video",title:"Répondre aux questions difficiles en entretien",duration:"18:00"},{type:"doc",title:"Guide : 50 questions d'entretien + réponses modèles",duration:""}]},
  ],
  requirements:["Niveau A2 minimum en anglais (débutant avancé)","Un ordinateur, tablette ou smartphone","30 minutes par jour de disponibilité","Motivation et persévérance 💪"],
  targetAudience:["Professionnels souhaitant évoluer dans un contexte international","Étudiants visant une certification TOEIC, TOEFL ou IELTS","Managers devant animer des équipes multinationales","Toute personne souhaitant gagner en confiance à l'oral"],
  testimonials:[
    {avatar:"👩🏾‍💼",name:"Awa Koné",role:"Responsable Marketing, NSIA",score:"TOEIC 880",rating:5,text:"Formation exceptionnelle ! Les méthodes sont vraiment efficaces. J'ai obtenu 880 au TOEIC après seulement 10 semaines de formation intensive."},
    {avatar:"👨🏿‍💻",name:"Kouamé Brou",role:"Ingénieur IT, Orange CI",score:"TOEFL 108",rating:5,text:"Le module sur la communication professionnelle a transformé ma façon de travailler. Je conduis maintenant des réunions internationales avec aisance."},
    {avatar:"👩🏽‍🎓",name:"Fatoumata Diallo",role:"Étudiante en MBA, Abidjan",score:"IELTS 7.5",rating:5,text:"Les exercices pratiques et les corrections personnalisées font vraiment la différence. Je recommande à tous ceux qui veulent progresser vite."},
    {avatar:"👨🏾‍🏫",name:"Serge Assoua",role:"DRH, Bolloré Africa Logistics",score:"Formation entreprise",rating:5,text:"Nous avons formé 15 collaborateurs avec BET. Le résultat est visible sur notre communication client internationale. Un investissement rentable."},
  ],
  faq:[
    {q:"Quelle est la durée de la formation ?",a:"La formation contient 18h30 de contenu vidéo. À raison de 30 min/jour, vous pouvez la terminer en 10 à 12 semaines. L'accès est illimité, à votre rythme."},
    {q:"Est-ce que je recevrai un certificat ?",a:"Oui ! À la fin de la formation, vous recevez un certificat officiel Binnie's English Training, reconnu par l'État de Côte d'Ivoire."},
    {q:"La formation convient-elle aux débutants complets ?",a:"Cette formation est recommandée à partir du niveau A2. Si vous êtes grand débutant, nous proposons une formation Débutant Absolu adaptée."},
    {q:"Comment fonctionne le support ?",a:"Vous avez accès à notre support 7j/7 via WhatsApp et email. Les corrections d'exercices sont faites sous 48h par votre coach personnel."},
    {q:"Y a-t-il une garantie ?",a:"Oui ! Satisfait ou remboursé sous 30 jours, sans condition ni justification."},
  ],
  relatedCourses:[
    {title:"TOEIC Express - Score 700+ garanti",price:"390 000 FCFA",img:"https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=400&q=80",rating:4.9,students:1240},
    {title:"IELTS Academic - Band 7.0",price:"520 000 FCFA",img:"https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=400&q=80",rating:4.8,students:870},
    {title:"Anglais à domicile - Sur mesure",price:"35 000 FCFA/h",img:"https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=400&q=80",rating:4.7,students:2100},
  ],
  formats:[
    {name:"Découverte",price:"15 000 FCFA",duration:"/mois",details:"2 cours/sem · Accès 3 mois · Support communauté"},
    {name:"Intensif",price:"30 000 FCFA",duration:"/mois",details:"5 cours/sem · Coach personnel · Accès illimité",popular:true},
    {name:"Premium",price:"50 000 FCFA",duration:"/mois",details:"Cours illimités · Tuteur natif · Certification incluse"},
  ],
};

const FORMAT_IMG_MAP = [
  { keys:["découverte","decouverte","débutant","debutant","basic","starter"], img:"https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80" },
  { keys:["intensif","intensive","groupe","group"],                           img:"https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=600&q=80" },
  { keys:["premium","privé","prive","domicile","vip"],                        img:"https://images.unsplash.com/photo-1560523159-4a9692d222ef?auto=format&fit=crop&w=600&q=80" },
  { keys:["entreprise","business","corporate","b2b"],                         img:"https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=600&q=80" },
];
function getFormatImg(f, fallback) {
  if (f.img) return f.img;
  const k = (f.name||"").toLowerCase();
  for (const { keys, img } of FORMAT_IMG_MAP) {
    if (keys.some(key => k.includes(key))) return img;
  }
  return fallback || "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=600&q=80";
}

function extractYoutubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
function buildHeroEmbedUrl(url) {
  if (!url) return null;
  const ytId = extractYoutubeId(url);
  if (ytId) return `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}&rel=0&modestbranding=1&controls=0&enablejsapi=1`;
  if (/vimeo\.com\/(\d+)/.test(url)) {
    const id = url.match(/vimeo\.com\/(\d+)/)[1];
    return `https://player.vimeo.com/video/${id}?autoplay=1&muted=1&loop=1&background=1`;
  }
  return url;
}

const Stars=({rating=5,size=14})=><span style={{display:"inline-flex",gap:1}}>{Array.from({length:5}).map((_,i)=><span key={i} style={{fontSize:size,color:i<Math.floor(rating)?"#f59e0b":"#d1d5db"}}>★</span>)}</span>;

const FAQItem=({item})=>{
  const[open,setOpen]=useState(false);
  return(
    <div style={{border:`1.5px solid ${open?"#ff2945":"#e2e8f0"}`,borderRadius:10,overflow:"hidden",transition:"border-color .2s"}}>
      <button style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"15px 18px",background:"none",border:"none",fontFamily:FF,fontSize:".95rem",fontWeight:600,color:"#011451",cursor:"pointer",textAlign:"left",gap:12}} onClick={()=>setOpen(p=>!p)}>
        <span>{item.q}</span>
        <span style={{fontSize:"1.3rem",color:"#ff2945",transition:"transform .2s",display:"inline-block",transform:open?"rotate(45deg)":"rotate(0)"}}>+</span>
      </button>
      {open&&<p className="cd-acc" style={{padding:"0 18px 16px",fontSize:".9rem",color:"#475569",lineHeight:1.7,margin:0}}>{item.a}</p>}
    </div>
  );
};

const CourseDetail=()=>{
  const{type}=useParams(); const navigate=useNavigate();
  const[searchParams,setSearchParams]=useSearchParams();
  const initCentreKey=searchParams.get("centre");
  const rawCourse=coursesData?.[type];
  const isMounted=useRef(false);

  // Centres (cabinet mode)
  const[centresList,setCentresList]=useState([]);
  const[selectedCentreKey,setSelectedCentreKey]=useState(initCentreKey||null);
  const[sidebarAssistantes,setSidebarAssistantes]=useState([]);
  const[loadingAssistantes,setLoadingAssistantes]=useState(false);
  const[realCentresMap,setRealCentresMap]=useState({});

  // Assistantes commerciales - mode en-ligne
  const[enLigneAssistantes,setEnLigneAssistantes]=useState([]);
  const[loadingEnLigneAssistantes,setLoadingEnLigneAssistantes]=useState(false);

  // Charger la liste réelle des centres depuis l'API (même logique Navbar)
  useEffect(()=>{
    if(type!=="cabinet") return;
    const API_URL=process.env.REACT_APP_API_URL||"http://localhost:5001";
    fetch(`${API_URL}/api/parcours/centres`)
      .then(r=>r.json())
      .then(d=>{
        const map={};
        (d.centres||[]).forEach(c=>{
          const key=c.nom.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
          map[key]=c;
        });
        setRealCentresMap(map);
      }).catch(()=>{});
  },[type]);

  // Charger les vraies assistantes dès que le centre change
  useEffect(()=>{
    if(type!=="cabinet"||!selectedCentreKey) return;
    const centre=centresList.find(c=>c.key===selectedCentreKey);
    if(!centre) return;
    setSidebarAssistantes([]);
    setLoadingAssistantes(true);
    const API_URL=process.env.REACT_APP_API_URL||"http://localhost:5001";
    const nomNorm=centre.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
    let realId=null;
    for(const[k,c] of Object.entries(realCentresMap)){
      if(k.includes(nomNorm)||nomNorm.includes(k)){realId=c.id;break;}
    }
    const fallback=()=>{
      setSidebarAssistantes((centre.assistantes||[]).map(a=>({
        id:a.phone, prenom:a.nom, nom:"", telephone:a.phone, photo_url:null
      })));
      setLoadingAssistantes(false);
    };
    if(realId){
      fetch(`${API_URL}/api/parcours/assistantes-presentiel/${realId}?tous=true`)
        .then(r=>r.json())
        .then(d=>{ setSidebarAssistantes(d.assistantes||[]); setLoadingAssistantes(false); })
        .catch(fallback);
    } else { fallback(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectedCentreKey,realCentresMap]);

  useEffect(()=>{
    if(type!=="cabinet") return;

    const applyList = (list) => {
      const actifs = (list||[]).filter(c=>c.actif!==false);
      if(!actifs.length) return false;
      setCentresList(actifs);
      setSelectedCentreKey(k => k || actifs[0].key);
      return true;
    };

    // 1. Essai localStorage (instantané)
    try {
      const s = localStorage.getItem(CENTRES_MASTER_KEY);
      if (s && applyList(JSON.parse(s))) {
        // OK - mais on sync quand même depuis Supabase en arrière-plan
      }
    } catch {}

    // 2. Fetch Supabase (source de vérité)
    supabase
      .from("plateforme_config")
      .select("valeur")
      .eq("key", "centres_master")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && Array.isArray(data?.valeur) && data.valeur.length) {
          localStorage.setItem(CENTRES_MASTER_KEY, JSON.stringify(data.valeur));
          applyList(data.valeur);
        } else {
          // 3. Fallback ultime : centersData.js (données statiques)
          setCentresList(prev => prev.length ? prev : CENTRES_FALLBACK);
          setSelectedCentreKey(k => k || CENTRES_FALLBACK[0]?.key);
        }
      })
      .catch(() => {
        // 3. Fallback ultime si Supabase injoignable
        setCentresList(prev => prev.length ? prev : CENTRES_FALLBACK);
        setSelectedCentreKey(k => k || CENTRES_FALLBACK[0]?.key);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[type]);

  // ── Assistantes commerciales en ligne ──────────────────────────────────
  useEffect(()=>{
    if(type!=="en-ligne") return;
    const API_URL=process.env.REACT_APP_API_URL||"http://localhost:5001";
    setLoadingEnLigneAssistantes(true);
    fetch(`${API_URL}/api/parcours/assistantes-ligne?profil=b2c`)
      .then(r=>r.json())
      .then(d=>{
        setEnLigneAssistantes(d.assistantes||[]);
        setLoadingEnLigneAssistantes(false);
      })
      .catch(()=>{
        try{
          const saved=localStorage.getItem(ASSISTANTES_EN_LIGNE_KEY);
          if(saved) setEnLigneAssistantes(JSON.parse(saved));
        }catch{}
        setLoadingEnLigneAssistantes(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[type]);

  // ── Offres dynamiques (en-ligne / domicile) ──────────────────────────────
  const [dynamicFormats, setDynamicFormats] = useState(() => {
    if (type === "en-ligne")  return offresFromLS(OFFRES_EN_LIGNE_KEY);
    if (type === "domicile")  return offresFromLS(OFFRES_DOMICILE_KEY);
    return null;
  });

  // ── Aperçu dynamique (en-ligne / domicile) ───────────────────────────────
  const [dynamicApercu, setDynamicApercu] = useState(() => apercuFromLS(type));

  const centreOverride=type==="cabinet"?loadCabinetCourse(selectedCentreKey):null;
  const selectedCentre=centresList.find(c=>c.key===selectedCentreKey)||null;
  const formatsOverride = dynamicFormats ? { formats: dynamicFormats } : {};
  const apercuOverride = dynamicApercu ? {
    ...(dynamicApercu.description  ? { description:     dynamicApercu.description }  : {}),
    ...(dynamicApercu.advantages?.length ? { advantages: dynamicApercu.advantages }  : {}),
    ...(dynamicApercu.whatYouLearn?.length ? { whatYouLearn: dynamicApercu.whatYouLearn } : {}),
    ...(dynamicApercu.includes?.length ? { includes: dynamicApercu.includes }         : {}),
    ...(dynamicApercu.requirements?.length ? { requirements: dynamicApercu.requirements } : {}),
    ...(dynamicApercu.targetAudience?.length ? { targetAudience: dynamicApercu.targetAudience } : {}),
    ...(dynamicApercu.faq?.length ? { faq: dynamicApercu.faq }                        : {}),
  } : {};
  const course=rawCourse?{...MOCK_COURSE,...rawCourse,...(centreOverride||{}),...formatsOverride,...apercuOverride}:{...MOCK_COURSE,...(centreOverride||{}),...formatsOverride,...apercuOverride};

  useEffect(() => {
    if (type !== "en-ligne" && type !== "domicile") return;
    const sbKey = type === "en-ligne" ? "offres_en_ligne" : "offres_domicile";
    const lsKey = type === "en-ligne" ? OFFRES_EN_LIGNE_KEY : OFFRES_DOMICILE_KEY;
    supabase
      .from("plateforme_config")
      .select("valeur")
      .eq("key", sbKey)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && Array.isArray(data?.valeur) && data.valeur.length) {
          localStorage.setItem(lsKey, JSON.stringify(data.valeur));
          const f = offresFromLS(lsKey);
          if (f) setDynamicFormats(f);
        }
      });
    const onStorage = (e) => {
      if (e.key === lsKey) { const f = offresFromLS(lsKey); if (f) setDynamicFormats(f); }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [type]); // eslint-disable-line

  useEffect(() => {
    if (type !== "en-ligne" && type !== "domicile") return;
    // Sync depuis Supabase (dashboard sur port différent - localStorage non partagé)
    supabase.from("plateforme_config").select("valeur").eq("key","course_apercu_config").maybeSingle()
      .then(({data,error})=>{
        if(!error && data?.valeur && typeof data.valeur==="object"){
          localStorage.setItem(COURSE_APERCU_KEY, JSON.stringify(data.valeur));
          setDynamicApercu(apercuFromLS(type));
        }
      });
    const onStorage = (e) => {
      if (e.key === COURSE_APERCU_KEY) setDynamicApercu(apercuFromLS(type));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [type]); // eslint-disable-line

  // ── Média hero (configurable par type d'offre) ───────────────────────────
  const [heroMedia, setHeroMedia] = useState(null);
  useEffect(() => {
    setHeroMedia(null); // reset immédiat pour ne pas afficher le média du type précédent
    const API = process.env.REACT_APP_API_URL || "http://localhost:5001";
    fetch(`${API}/api/offre-media/${type}/publiques`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.media?.length) setHeroMedia(d.media[0]); })
      .catch(() => {});
  }, [type]);

  const[activeTab,setActiveTab]=useState("apercu");
  const[sidebarSticky,setSidebarSticky]=useState(false);
  const[modalOpen,setModalOpen]=useState(false);
  const[formuleRequiseMsg,setFormuleRequiseMsg]=useState(false);
  const payMethod="mobile"; // sélecteur retiré - un seul mode réellement utilisé (TouchPoint)
  const[successMsg,setSuccessMsg]=useState(false);
  // Choix de l'assistante avant l'envoi du dossier : le client garde un contact humain
  // rattaché dès la création du lead, même si le paiement échoue/est abandonné ensuite -
  // plus besoin d'attendre que le SuperAdmin répartisse les paiements confirmés après coup.
  const[assistanteChoisie,setAssistanteChoisie]=useState(null);
  const[assistantesPaiement,setAssistantesPaiement]=useState([]);
  const[loadingAssistantesPaiement,setLoadingAssistantesPaiement]=useState(false);
  useEffect(()=>{ if(modalOpen) setAssistanteChoisie(null); },[modalOpen]);
  const[hovCard,setHovCard]=useState(null);
  const[selectedFormat,setSelectedFormat]=useState(null);
  const[selectedPack,setSelectedPack]=useState("classique");
  // Le lieu des séances du coaching privé suit la page cours consultée - aucune raison de
  // proposer "Au cabinet" à quelqu'un qui navigue sur /cours/en-ligne, et inversement.
  const selectedLieu = type==="en-ligne"?"en_ligne":type==="domicile"?"domicile":"cabinet";
  // Disponibilités du coaching privé - même mécanisme que ParcoursModal.jsx, pour que le
  // dossier arrive déjà rempli chez la commerciale au lieu d'une resaisie manuelle.
  const [disponForm, setDisponForm] = useState([]); // [{jour, debut}]
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
  // Adresse - uniquement pertinente quand le lieu des séances est "à domicile" (un coach
  // qui se déplace a besoin de savoir où), même champ que ParcoursModal.jsx.
  const [zoneForm, setZoneForm] = useState("");
  const GRILLE_PRIVE_DEFAULT = {
    classique: { label:"Classique", frequence:"3 séances de 2h / semaine", cabinet:150000, domicile:200000, en_ligne:100000 },
    intensive:  { label:"Intensive",  frequence:"5 séances / semaine",       cabinet:200000, domicile:300000, en_ligne:200000 },
  };
  const [grillePriveCD, setGrillePriveCD] = useState(GRILLE_PRIVE_DEFAULT);

  /* ── FORMULES DE GROUPE ───────────────────────────────────────────────────
     Les formules appartiennent désormais à L'OFFRE (`formules_actif` + `formules`), et non
     plus à une grille globale `groupe_config` : deux formations vendues par la même adresse
     peuvent avoir des rythmes et des tarifs différents, ce que la grille commune ne savait
     pas exprimer. Une offre dont l'interrupteur est éteint garde son prix unique. */
  const [selectedFormuleGroupe, setSelectedFormuleGroupe] = useState(null);

  /* Les formules de l'offre choisie - l'interrupteur de l'offre commande. Une offre
     sans formules garde son prix unique, ce qui est le cas de la plupart. */
  const formulesGroupeCD = React.useMemo(() => {
    if (selectedFormat?.formules_actif !== true) return [];
    return (selectedFormat.formules || [])
      .map(f => ({ id:f.id, label:f.label, frequence:f.frequence, tarif:Number(f.tarif) || 0 }))
      .filter(f => f.tarif > 0 && f.label);
  }, [selectedFormat]);

  const formuleGroupeCD = formulesGroupeCD.find(f => f.id === selectedFormuleGroupe) || null;
  // Changer de formation remet le choix à zéro : garder la formule d'une autre offre
  // ferait payer un tarif qui n'est pas celui de la formation affichée.
  useEffect(() => { setSelectedFormuleGroupe(null); }, [selectedFormat?.name, type]); // eslint-disable-line
  // Le groupe est le cas par défaut : tout ce qui n'est pas explicitement « prive ».
  const estGroupeCD = !!selectedFormat && selectedFormat.type_coaching !== "prive";
  useEffect(() => {
    supabase.from("plateforme_config").select("valeur").eq("key","coaching_prive_config").maybeSingle()
      .then(({data,error})=>{
        if(!error && data?.valeur && typeof data.valeur==="object"){
          const v=data.valeur; const merged={...GRILLE_PRIVE_DEFAULT};
          Object.keys(v).forEach(k=>{ merged[k]={...(GRILLE_PRIVE_DEFAULT[k]||{}), ...v[k]}; });
          setGrillePriveCD(merged);
        }
      });
  },[]); // eslint-disable-line

  /* ── LA GRILLE PRIVÉE EFFECTIVE ───────────────────────────────────────────
     Même règle que dans ParcoursModal : les formules portées par l'offre priment sur la
     grille globale `coaching_prive_config`, qui ne reste qu'en repli pour les offres qui
     n'ont pas encore les leurs. Sans cela, cette page affichait Classique/Intensive à
     tout le monde alors que l'offre déclarait ses propres rythmes. */
  const formulesPriveCD = React.useMemo(() => {
    if (selectedFormat?.type_coaching !== "prive") return null;
    if (selectedFormat?.formules_actif !== true) return null;
    const liste = (selectedFormat.formules || []).filter(f => f.label && (Number(f.tarif) > 0 || Number(f.tarif_domicile) > 0));
    if (!liste.length) return null;
    return Object.fromEntries(liste.map(f => [f.id || f.label, {
      label:     f.label,
      frequence: f.frequence || "",
      cabinet:   Number(f.tarif) || 0,
      en_ligne:  Number(f.tarif) || 0,
      domicile:  Number(f.tarif_domicile) || Number(f.tarif) || 0,
    }]));
  }, [selectedFormat]);

  const grillePriveEff = formulesPriveCD || grillePriveCD;

  /* Le défaut « classique » n'existe pas dans une grille propre à l'offre : sans ce
     recalage, le sélecteur de pack afficherait 0 F et le bouton d'inscription un montant
     nul. Même correctif que dans ParcoursModal. */
  useEffect(() => {
    if (!formulesPriveCD) return;
    const cles = Object.keys(formulesPriveCD);
    if (cles.length && !cles.includes(selectedPack)) setSelectedPack(cles[0]);
  }, [formulesPriveCD]); // eslint-disable-line

  /* ── LE MONTANT DE RÉFÉRENCE ──────────────────────────────────────────────
     Une seule source de vérité pour l'affichage ET pour TouchPoint : le tarif du pack pour
     un coaching privé, celui de la formule pour un groupe, le prix générique en dernier
     recours. L'écran de confirmation lisait encore `selectedFormat.price` : le client
     choisissait une formule à 80 000 F et voyait - puis payait - le prix d'appel. */
  const prixRefCD = React.useMemo(() => {
    const lieuKey = selectedLieu==="domicile" ? "domicile" : selectedLieu==="en_ligne" ? "en_ligne" : "cabinet";
    if (selectedFormat?.type_coaching === "prive") return grillePriveEff[selectedPack||"classique"]?.[lieuKey] || 0;
    return formuleGroupeCD?.tarif || parsePrixFCFA(selectedFormat?.price || course?.price) || 0;
  }, [selectedFormat, selectedLieu, selectedPack, grillePriveEff, formuleGroupeCD, course]); // eslint-disable-line

  /* ── Le sélecteur de formule s'ouvre en MODAL ─────────────────────────────
     Il vivait plus bas dans la page, et choisir une offre déclenchait un défilement
     automatique vers lui : on descendait, on choisissait, puis il fallait remonter pour
     s'inscrire. Le modal supprime cet aller-retour - le choix se fait là où l'on a
     cliqué, et la page garde ensuite une carte récapitulative compacte. */
  const [selecteurOuvert, setSelecteurOuvert] = useState(false);

  /* Une offre n'ouvre le sélecteur que si elle a réellement quelque chose à choisir :
     des formules de groupe, ou le paramétrage du coaching privé. Une offre à tarif
     unique reste sélectionnable d'un simple clic, sans écran intermédiaire. */
  const offreAUnSelecteur = (o) =>
    o?.type_coaching === "prive" || (o?.formules_actif === true && (o.formules || []).some(f => f.label && Number(f.tarif) > 0));

  // ── Reset UI quand le type de cours change (pas au montage initial) ──
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return; }
    setActiveTab("apercu");
    setSelectedFormat(null);
    setModalOpen(false);
    // Sans cela le sélecteur resterait ouvert sur une offre qui n'existe plus.
    setSelecteurOuvert(false);
    setSuccessMsg(false);
    setHovCard(null);
    setInscForm({nom:"",email:"",tel:"",mobileNum:""});
    setInscErreur("");
    if(sbUser) fetchAndPrefillProfile(sbUser);
    // Les données cabinet (centresList, assistantes…) sont gérées par leurs propres effects
    setDynamicFormats(
      type === "en-ligne" ? offresFromLS(OFFRES_EN_LIGNE_KEY) :
      type === "domicile" ? offresFromLS(OFFRES_DOMICILE_KEY) : null
    );
  }, [type]); // eslint-disable-line
  const[devisOpen,setDevisOpen]=useState(false);
  const[devisSuccess,setDevisSuccess]=useState(false);
  const[devisForm,setDevisForm]=useState({nom:"",email:"",tel:"",entreprise:"",participants:"1",message:""});
  const[devisAuthGate,setDevisAuthGate]=useState(false);
  const[devisAuthTab,setDevisAuthTab]=useState("login");
  const[devisAuthForm,setDevisAuthForm]=useState({email:"",password:"",prenom:"",nom:"",telephone:""});
  const[devisAuthLoad,setDevisAuthLoad]=useState(false);
  const[devisAuthErr,setDevisAuthErr]=useState("");
  const[inscForm,setInscForm]=useState({nom:"",email:"",tel:"",mobileNum:""});
  const[inscErreur,setInscErreur]=useState("");
  const[inscLoading,setInscLoading]=useState(false);
  const[codePromo,setCodePromo]=useState("");
  const[codePromoApplied,setCodePromoApplied]=useState(null);
  const[codePromoLoading,setCodePromoLoading]=useState(false);
  const[codePromoError,setCodePromoError]=useState("");
  const[sbUser,setSbUser]=useState(null);
  // Assistantes proposées dans l'étape "Choisir son assistante" du modal de paiement -
  // cabinet réutilise sidebarAssistantes (déjà chargées), en_ligne/domicile ont leur
  // propre pool (jamais les mêmes personnes que le présentiel).
  useEffect(()=>{
    if(!modalOpen||!sbUser||successMsg||assistanteChoisie) return;
    if(type==="cabinet"){ setAssistantesPaiement(sidebarAssistantes); return; }
    const API_URL=process.env.REACT_APP_API_URL||"http://localhost:5001";
    const url=type==="domicile"
      ? `${API_URL}/api/parcours/assistantes-domicile`
      : `${API_URL}/api/parcours/assistantes-ligne?profil=b2c`;
    setLoadingAssistantesPaiement(true);
    fetch(url).then(r=>r.json()).then(d=>setAssistantesPaiement(d.assistantes||[])).catch(()=>setAssistantesPaiement([])).finally(()=>setLoadingAssistantesPaiement(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[modalOpen,sbUser,successMsg,assistanteChoisie,type,sidebarAssistantes]);
  // ── Avis ──
  const[avisLive,setAvisLive]=useState([]);
  const[avisLoading,setAvisLoading]=useState(false);
  const[avisModalOpen,setAvisModalOpen]=useState(false);
  const[avisForm,setAvisForm]=useState({note:5,texte:""});
  const[avisSubmitting,setAvisSubmitting]=useState(false);
  const[avisMsg,setAvisMsg]=useState(null);
  const[isApprenantBET,setIsApprenantBET]=useState(false);
  const[avisDejaPoste,setAvisDejaPoste]=useState(false);
  const heroRef=useRef(null);
  const iframeRef=useRef(null);
  const sidebarRef=useRef(null);
  const [isMuted,   setIsMuted]   = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);

  const prefillForm=(u)=>{
    const m=u?.user_metadata||{};
    setInscForm(p=>({
      ...p,
      nom: m.full_name||m.nom||m.prenom||(m.first_name&&m.last_name?`${m.first_name} ${m.last_name}`:`${m.first_name||""} ${m.last_name||""}`.trim())||p.nom||"",
      email: u.email||m.email||p.email||"",
      tel: m.telephone||m.phone||m.tel||p.tel||"",
    }));
  };

  const fetchAndPrefillProfile = async (u) => {
    if (!u) return;
    // Préfill immédiat depuis les métadonnées Supabase
    prefillForm(u);
    // Ensuite enrichir depuis le backend /api/auth/me (nom, prenom, telephone complets)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const APIU = process.env.REACT_APP_API_URL || "http://localhost:5001";
      const r = await fetch(`${APIU}/api/auth/me`, { headers: { "Authorization": `Bearer ${session.access_token}` } });
      if (!r.ok) return;
      const profile = await r.json();
      const fullName = [profile.prenom, profile.nom].filter(Boolean).join(" ").trim() || "";
      setInscForm(p => ({
        ...p,
        nom:   fullName   || p.nom   || "",
        email: profile.email || u.email || p.email || "",
        tel:   profile.telephone || p.tel || "",
      }));
    } catch {}
  };

  const prefillDevisForm=(u)=>{
    if(!u) return;
    const m=u?.user_metadata||{};
    const nom=m.full_name||(m.prenom&&m.nom?`${m.prenom} ${m.nom}`:"")||(m.first_name&&m.last_name?`${m.first_name} ${m.last_name}`:"")||"";
    setDevisForm(p=>({...p,nom:nom||p.nom,email:u.email||p.email,tel:m.telephone||m.phone||m.tel||p.tel}));
  };

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      setSbUser(session?.user||null);
      if(session?.user) fetchAndPrefillProfile(session.user);
    });
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_e,session)=>{
      setSbUser(session?.user||null);
      if(session?.user){ fetchAndPrefillProfile(session.user); prefillDevisForm(session.user); setDevisAuthGate(false); setDevisAuthErr(""); }
    });
    return()=>subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const handleDevisAuthLogin=async()=>{
    const API=process.env.REACT_APP_API_URL||"http://localhost:5001";
    if(!devisAuthForm.email||!devisAuthForm.password) return setDevisAuthErr("Email et mot de passe requis.");
    setDevisAuthLoad(true); setDevisAuthErr("");
    try{
      const res=await fetch(`${API}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:devisAuthForm.email,password:devisAuthForm.password})});
      const data=await res.json();
      if(!res.ok) throw new Error(data.error||"Email ou mot de passe incorrect");
      await supabase.auth.setSession({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
    }catch(err){setDevisAuthErr(err.message);}
    finally{setDevisAuthLoad(false);}
  };

  const handleDevisAuthRegister=async()=>{
    const API=process.env.REACT_APP_API_URL||"http://localhost:5001";
    if(!devisAuthForm.prenom||!devisAuthForm.nom||!devisAuthForm.email||!devisAuthForm.password) return setDevisAuthErr("Tous les champs * sont requis.");
    setDevisAuthLoad(true); setDevisAuthErr("");
    try{
      const res=await fetch(`${API}/api/auth/register`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nom:devisAuthForm.nom,prenom:devisAuthForm.prenom,email:devisAuthForm.email,telephone:devisAuthForm.telephone,password:devisAuthForm.password})});
      const data=await res.json();
      if(!res.ok) throw new Error(data.error||"Erreur lors de l'inscription");
      const{error}=await supabase.auth.signInWithPassword({email:devisAuthForm.email,password:devisAuthForm.password});
      if(error) throw new Error(error.message);
    }catch(err){setDevisAuthErr(err.message);}
    finally{setDevisAuthLoad(false);}
  };

  // ── Charger les avis live ──────────────────────────────────────────────────
  useEffect(()=>{
    const API=process.env.REACT_APP_API_URL||"http://localhost:5001";
    setAvisLoading(true);
    fetch(`${API}/api/avis/publics?offre_type=cours`)
      .then(r=>r.ok?r.json():null)
      .then(d=>{ if(d?.avis) setAvisLive(d.avis); })
      .catch(()=>{})
      .finally(()=>setAvisLoading(false));
  },[]);

  // ── Vérifier si l'utilisateur est apprenant BET ───────────────────────────
  useEffect(()=>{
    if(!sbUser?.email) return;
    const API=process.env.REACT_APP_API_URL||"http://localhost:5001";
    fetch(`${API}/api/auth/prospect-info?email=${encodeURIComponent(sbUser.email)}`)
      .then(r=>r.ok?r.json():null)
      .then(d=>{ if(d?.is_apprenant) setIsApprenantBET(true); })
      .catch(()=>{});
  },[sbUser]);

  // ── Vérifier si l'apprenant a déjà posté un avis (cours) ─────────────────
  useEffect(()=>{
    if(!sbUser?.email||!isApprenantBET) return;
    const API=process.env.REACT_APP_API_URL||"http://localhost:5001";
    supabase.auth.getSession().then(({data:{session}})=>{
      if(!session) return;
      fetch(`${API}/api/avis/publics?offre_type=cours&limit=200`)
        .then(r=>r.ok?r.json():null)
        .then(d=>{
          const already=d?.avis?.some(a=>a.apprenant_email===sbUser.email||false);
          setAvisDejaPoste(!!already);
        })
        .catch(()=>{});
    });
  },[sbUser,isApprenantBET]);

  const submitAvis=async()=>{
    if(avisForm.texte.trim().length<20) return;
    setAvisSubmitting(true); setAvisMsg(null);
    try{
      const API=process.env.REACT_APP_API_URL||"http://localhost:5001";
      const {data:{session}}=await supabase.auth.getSession();
      const r=await fetch(`${API}/api/avis`,{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${session?.access_token}`},
        body:JSON.stringify({offre_type:"cours",note:avisForm.note,texte:avisForm.texte.trim()}),
      });
      const d=await r.json();
      if(!r.ok) throw new Error(d.error);
      setAvisMsg({type:"ok",text:d.message});
      setAvisDejaPoste(true);
      // Rafraîchir la liste
      fetch(`${API}/api/avis/publics?offre_type=cours`)
        .then(res=>res.ok?res.json():null)
        .then(d=>{ if(d?.avis) setAvisLive(d.avis); });
      setTimeout(()=>setAvisModalOpen(false),2000);
    }catch(err){ setAvisMsg({type:"err",text:err.message}); }
    finally{ setAvisSubmitting(false); }
  };

  // Détecte le retour après login (Google OAuth ou autre) et rouvre la modal paiement
  useEffect(()=>{
    if(searchParams.get("openPayment")!=="1") return;
    const raw=sessionStorage.getItem("bet_return_context");
    if(raw){try{const ctx=JSON.parse(raw);if(ctx.selectedFormat)setSelectedFormat(ctx.selectedFormat);sessionStorage.removeItem("bet_return_context");}catch{}}
    setModalOpen(true);
    setSearchParams(p=>{p.delete("openPayment");return p;},{replace:true});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    const h=()=>setSidebarSticky(window.scrollY>(heroRef.current?.offsetHeight||500)-80);
    window.addEventListener("scroll",h); return()=>window.removeEventListener("scroll",h);
  },[]);

  // Styles responsives injectés
  useEffect(() => {
    if (!document.querySelector("#cd-responsive")) {
      const style = document.createElement("style");
      style.id = "cd-responsive";
      style.textContent = `
        .course-detail-root { overflow-x: hidden; max-width: 100%; }
        @media (max-width: 900px) {
          .course-detail-layout { grid-template-columns: 1fr !important; gap: 32px !important; }
          .course-detail-sidebar { position: relative !important; top: 0 !important; width: 100% !important; margin-top: 20px; }
        }
        @media (min-width: 901px) and (max-width: 1100px) {
          .course-detail-formats-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 768px) {
          .course-detail-learn-grid, .course-detail-includes-grid { grid-template-columns: 1fr !important; }
          .course-detail-formats-grid { grid-template-columns: 1fr !important; gap: 20px !important; }
          .course-detail-related-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
          .course-detail-hero-inner { padding: 0 16px !important; }
          .course-detail-hero-title { font-size: 1.8rem !important; }
          .course-detail-hero-breadcrumb { display: none !important; }
          .course-detail-tabs-inner { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .course-detail-tab-btn { padding: 10px 14px !important; font-size: 0.8rem !important; }
          .course-detail-curr-meta { flex-wrap: wrap; gap: 8px; }
        }
        @media (max-width: 640px) {
          .course-detail-hero-title { font-size: 1.5rem !important; }
          .course-detail-side-card .price-row { flex-wrap: wrap; justify-content: center; }
          .course-detail-curr-head { flex-wrap: wrap; gap: 8px; }
        }
        .course-detail-side-card .timer-badge { word-break: break-word; white-space: normal; line-height: 1.4; }
        @media (max-width: 480px) {
          .course-detail-btn-enroll, .course-detail-btn-quote { width: calc(100% - 24px) !important; margin-left: 12px !important; margin-right: 12px !important; font-size: 0.85rem !important; }
          .course-detail-share-buttons { flex-direction: column; gap: 8px !important; }
          .course-detail-lesson-row { flex-wrap: wrap; gap: 8px; }
        }
        @media (max-width: 640px) {
          .course-detail-assistant-grid { grid-template-columns: 1fr !important; }
          .course-detail-assistant-avatar { width: 72px !important; height: 72px !important; }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const TABS=[{id:"apercu",label:"Aperçu"},
    {id:"formules",label:"Formules & Tarifs"},
    {id:"avis",label:"Avis"},
    {id:"faq",label:"FAQ"}];
  const validerCodePromo=async(codeOverride)=>{
    const code=(codeOverride||codePromo).trim().toUpperCase();
    if(!code)return;
    setCodePromoLoading(true);setCodePromoError("");setCodePromoApplied(null);
    try{
      const API=process.env.REACT_APP_API_URL||"http://localhost:5001";
      const token=localStorage.getItem("bet_token")||"";
      const offreType=type==="en-ligne"?"en_ligne":type==="domicile"?"domicile":"centres";
      const r=await fetch(`${API}/api/codes-promo/valider`,{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({code,offre_type:offreType,centre_id:type==="cabinet"?selectedCentre?.id:undefined})});
      const d=await r.json();
      if(!r.ok){setCodePromoError(d.error||"Code invalide");return;}
      setCodePromoApplied(d);
      const reduc=d.type_reduction==="pourcentage"?`-${d.valeur}%`:`-${Number(d.valeur).toLocaleString("fr-FR")} FCFA`;
      toast.success(`🎟️ Code ${d.code} activé - ${reduc}`);
    }catch{setCodePromoError("Impossible de vérifier le code");}
    finally{setCodePromoLoading(false);}
  };

  const handlePay=async()=>{
    if(!inscForm.nom||!inscForm.email||!inscForm.tel)return alert("Veuillez remplir votre nom, email et téléphone.");
    if(!assistanteChoisie)return alert("Veuillez choisir une assistante avant de continuer.");
    if(selectedLieu==="domicile"&&!zoneForm.trim())return alert("Veuillez indiquer votre quartier/zone/adresse pour le coaching à domicile.");
    setInscLoading(true);setInscErreur("");
    try{
      await insertInscriptionAdulte({
        nom_complet:inscForm.nom,
        email:inscForm.email,
        telephone:inscForm.tel,
        // Le libellé du lead porte le tarif réellement retenu (formule ou pack), pas le prix
        // d'appel de la carte : c'est ce chiffre que la commerciale relira.
        offre_titre:selectedFormat
          ? `${course.title} - ${selectedFormat.name}${formuleGroupeCD ? ` · ${formuleGroupeCD.label}` : ""} (${prixRefCD ? `${prixRefCD.toLocaleString("fr-FR")} FCFA` : selectedFormat.price})`
          : course.title,
        mode_paiement:payMethod==="mobile"?"Mobile Money":"Carte bancaire",
        statut:"nouveau",
        code_promo:codePromoApplied?.code||undefined,
      });
      // Dossier rattaché à l'assistante choisie DÈS MAINTENANT, avant tout paiement réel -
      // même si le paiement échoue/est abandonné plus tard, elle a déjà le client dans sa
      // liste "Prospects parcours" et peut le relancer (au lieu d'attendre une répartition
      // manuelle par le SuperAdmin sur les seuls paiements confirmés).
      let assignationIdCree = null;
      // Coaching privé : le "Lieu des séances" choisi dans le widget de personnalisation
      // (selectedLieu) est le véritable choix du prospect - indépendant de la page cours
      // sur laquelle il se trouve (/cours/en-ligne, /cours/domicile, /cours/cabinet).
      const isPrivé = selectedFormat?.type_coaching === "prive";
      const lieuCoachingKey = selectedLieu==="domicile"?"domicile":selectedLieu==="en_ligne"?"en_ligne":"cabinet";
      // Le montant réellement engagé : tarif du pack + lieu pour un coaching privé, tarif de
      // la formule pour un groupe, prix générique en dernier recours. Calculé une seule fois
      // pour toute la page (`prixRefCD`), de sorte que le dossier, l'écran de confirmation et
      // TouchPoint annoncent tous les trois le même chiffre.
      const prixReference = prixRefCD;
      try{
        const API=process.env.REACT_APP_API_URL||"http://localhost:5001";
        // On envoie aussi pack_coaching/lieu_coaching/formation_souhaitee/disponibilites, même
        // champs que ParcoursModal.jsx, pour que le dossier arrive déjà rempli chez la
        // commerciale au lieu d'un formulaire vide à ressaisir.
        const rAssign = await fetch(`${API}/api/parcours/assignation`,{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            assistante_id:assistanteChoisie.id,
            prospect_nom:inscForm.nom,
            prospect_email:inscForm.email,
            prospect_telephone:inscForm.tel,
            type_cours: isPrivé ? (lieuCoachingKey==="cabinet"?"presentiel":lieuCoachingKey) : (type==="en-ligne"?"en_ligne":type==="domicile"?"domicile":"presentiel"),
            type_coaching:selectedFormat?.type_coaching||"groupe",
            centre_id: (isPrivé ? lieuCoachingKey==="cabinet" : type==="cabinet") ? (selectedCentre?.id||undefined) : undefined,
            inscription_offre:selectedFormat?`${course.title} - ${selectedFormat.name}`:course.title,
            source:"site_public_paiement",
            mode_paiement:payMethod==="mobile"?"mobile_money":"carte_bancaire",
            statut:"en_attente",
            // Montant NON réduit ici volontairement : le backend revalide le code promo
            // et applique lui-même la réduction sur ce montant de référence (voir
            // parcours.js) - l'envoyer déjà réduit doublerait la remise.
            montant_paye:prixReference||undefined,
            code_promo:codePromoApplied?.code||undefined,
            ...(!isPrivé && formuleGroupeCD ? {
              pack_coaching:       formuleGroupeCD.label,
              formation_souhaitee: `${course.title} - ${formuleGroupeCD.label}`,
              cout_formation:      formuleGroupeCD.tarif,
              formule_groupe: {
                id:        formuleGroupeCD.id,
                label:     formuleGroupeCD.label,
                frequence: formuleGroupeCD.frequence,
                tarif:     formuleGroupeCD.tarif,
                canal:     type === "en-ligne" ? "en_ligne" : "presentiel",
              },
            } : {}),
            ...(isPrivé ? {
              pack_coaching:       selectedPack,
              lieu_coaching:       lieuCoachingKey,
              formation_souhaitee: `${grillePriveEff[selectedPack]?.label || selectedPack} - ${course.title}`,
              // La commerciale attend la clé technique du centre (ex: "angre"), pas son nom
              // affiché ("BET Angré") - sans ça, le menu déroulant "Centre BET" ne matche
              // aucune option et retombe sur "- Sélectionner -" malgré une donnée présente.
              centre_coaching:     lieuCoachingKey==="cabinet" ? (selectedCentreKey||undefined) : undefined,
              adresse_coaching:    lieuCoachingKey==="domicile" ? (zoneForm.trim()||undefined) : undefined,
              disponibilites:      disponForm.length > 0 ? { horaires: disponForm } : undefined,
            } : {}),
          }),
        });
        const dAssign = await rAssign.json();
        assignationIdCree = dAssign?.assignation?.id || null;
      }catch{/* best-effort - ne bloque jamais la confirmation du lead */}

      // Paiement immédiat TouchPoint si un montant chiffré est disponible
      // (sinon - "Sur devis" - le lead reste en attente, traité manuellement).
      // Montant réellement facturé = prixReference (déjà le bon tarif pack+lieu pour un
      // coaching privé, cf. plus haut) moins la réduction du code promo déjà validé côté
      // serveur (codePromoApplied vient de la réponse de /valider).
      const montantPaiement = calcMontantReduit(prixReference, codePromoApplied);
      if (montantPaiement) {
        ga4.leadEnvoye({ canal:type, type_coaching:selectedFormat?.type_coaching, offre:course.title });
        ga4.paiementLance({ montant:montantPaiement, offre:selectedFormat?.name || course.title, canal:type });
        await payerAvecTouchPoint({
          clientInfo:    { nom: inscForm.nom, email: inscForm.email, telephone: inscForm.tel },
          montant:       montantPaiement,
          offreLabel:    selectedFormat ? `${course.title} - ${selectedFormat.name}` : course.title,
          assignationId: assignationIdCree,
          assistanteId:  assistanteChoisie.id,
        });
        return; // redirection vers la page de paiement TouchPoint en cours
      }

      setSuccessMsg(true);
      setTimeout(()=>{setSuccessMsg(false);setModalOpen(false);setInscForm({nom:"",email:"",tel:"",mobileNum:""});setCodePromo("");setCodePromoApplied(null);setCodePromoError("");},3000);
    }catch(e){
      if (!e.annuleParUtilisateur) setInscErreur("Une erreur est survenue. Veuillez réessayer.");
    }finally{
      setInscLoading(false);
    }
  };
  const sendYTCmd=(func,args=[])=>{
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({event:"command",func,args}),"*");
  };
  // Distingue une pause voulue (bouton) d'une pause automatique au scroll - seule la première
  // doit empêcher la reprise automatique quand le hero revient dans le champ de vision.
  const manualPauseRef = useRef(false);
  const handleMute=()=>{ sendYTCmd(isMuted?"unMute":"mute"); setIsMuted(m=>!m); };
  const handleReplay=()=>{ sendYTCmd("seekTo",[0,true]); sendYTCmd("playVideo"); setIsPlaying(true); manualPauseRef.current=false; };
  const handlePlayPause=()=>{ sendYTCmd(isPlaying?"pauseVideo":"playVideo"); manualPauseRef.current=isPlaying; setIsPlaying(p=>!p); };

  // Coupe la vidéo hero dès qu'elle sort de l'écran au scroll - reprend seule au retour dans
  // le champ, sauf si l'utilisateur l'avait lui-même mise en pause avant de scroller.
  useEffect(() => {
    const node = iframeRef.current;
    if (!node || heroMedia?.type !== "video") return;
    const o = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        if (manualPauseRef.current) return;
        sendYTCmd("playVideo");
        setIsPlaying(true);
      } else {
        sendYTCmd("pauseVideo");
        setIsPlaying(false);
      }
    }, { threshold: 0.2 });
    o.observe(node);
    return () => o.disconnect();
  }, [heroMedia]);

  const handleDevis=async()=>{
    try{
      const API=process.env.REACT_APP_API_URL||"http://localhost:5001";
      await insertDemandeDevis({nom:devisForm.nom,email:devisForm.email,tel:devisForm.tel,entreprise:devisForm.entreprise||null,participants:devisForm.participants,message:devisForm.message||null,source:"cours",source_nom:course.title});
      // Auto-assignation à l'assistante corporate dédiée (B2B)
      try{
        const ar=await fetch(`${API}/api/parcours/assistantes-ligne?profil=b2b`);
        const ad=await ar.json();
        const ca=(ad.assistantes||[])[0]||null;
        if(ca){
          await fetch(`${API}/api/parcours/assignation`,{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({assistante_id:ca.id,prospect_nom:devisForm.nom,prospect_email:devisForm.email||undefined,prospect_telephone:devisForm.tel||undefined,type_cours:"en_ligne",source:"devis_cours"}),
          });
        }
      }catch{/* silent */}
      setDevisSuccess(true);
      setTimeout(()=>{setDevisSuccess(false);setDevisOpen(false);setDevisForm({nom:"",email:"",tel:"",entreprise:"",participants:"1",message:""});},3000);
    }catch(err){console.error("Erreur devis:",err);}
  };

  const courseJsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.subtitle || course.title,
    provider: { "@type": "EducationalOrganization", name: "Binnie's English Training", sameAs: "https://binniesenglish.com" },
  };

  /* Le contenu du sélecteur de formule, rendu à l'identique dans le modal.
     Extrait tel quel de l'onglet « Formules & Tarifs » : mêmes champs, mêmes tarifs,
     seul son emplacement change. */
  const renderSelecteurFormule = () => (
    <>
                  {/* ── Sélecteur Pack + Lieu pour coaching privé ── */}
                  {/* ── Formules de GROUPE, jumeau du bloc coaching privé ci-dessous ── */}
                  {estGroupeCD && formulesGroupeCD.length > 0 && (
                    <div style={{marginBottom:20}}>
                      <div style={{background:"linear-gradient(135deg,#f0fdf4,#dcfce7)",borderRadius:16,border:"1.5px solid #bbf7d0",padding:"20px 22px"}}>
                        <div style={{fontWeight:800,fontSize:"1rem",color:"#065f46",marginBottom:4}}>👥 Choisissez votre rythme</div>
                        <div style={{fontSize:".8rem",color:"#059669",marginBottom:18}}>
                          Le tarif dépend du nombre de séances par semaine.
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12}}>
                          {formulesGroupeCD.map(f=>{
                            const active = selectedFormuleGroupe===f.id;
                            return(
                              <button key={f.id} type="button" onClick={()=>setSelectedFormuleGroupe(f.id)}
                                style={{padding:"14px 12px",borderRadius:12,border:`2px solid ${active?"#059669":"#e2e8f0"}`,background:active?"linear-gradient(135deg,#fff,#f0fdf4)":"#fff",cursor:"pointer",textAlign:"left",transition:"all .18s",boxShadow:active?"0 0 0 3px #05966922":undefined}}>
                                <div style={{fontWeight:800,fontSize:".88rem",color:active?"#059669":"#0f172a",marginBottom:4}}>👥 {f.label}</div>
                                <div style={{fontSize:".72rem",color:"#64748b",marginBottom:8,lineHeight:1.4}}>{f.frequence}</div>
                                <div style={{fontWeight:900,fontSize:"1rem",color:active?"#059669":"#0f172a"}}>
                                  {f.tarif.toLocaleString("fr-FR")} <span style={{fontSize:".7rem",fontWeight:600,color:"#94a3b8"}}>F / mois</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        {/* Dit ce qui sera facturé, avant de s'engager. */}
                        {formuleGroupeCD && (
                          <div style={{marginTop:14,background:"#0f172a",color:"#fff",borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
                            <div>
                              <div style={{fontWeight:800,fontSize:".8rem"}}>Formule {formuleGroupeCD.label}</div>
                              <div style={{fontSize:".68rem",color:"rgba(255,255,255,.7)"}}>{formuleGroupeCD.frequence}</div>
                            </div>
                            <div style={{fontWeight:800,fontSize:"1rem"}}>{formuleGroupeCD.tarif.toLocaleString("fr-FR")} F / mois</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedFormat?.type_coaching === "prive" && (
                    <div style={{marginBottom:20}}>
                      <div style={{background:"linear-gradient(135deg,#eff6ff,#dbeafe)",borderRadius:16,border:"1.5px solid #bfdbfe",padding:"20px 22px"}}>
                        <div style={{fontWeight:800,fontSize:"1rem",color:"#011451",marginBottom:4}}>🎯 Personnalisez votre coaching privé</div>
                        <div style={{fontSize:".8rem",color:"#3b82f6",marginBottom:18}}>Choisissez votre formule et le lieu des séances pour voir le tarif exact.</div>
                        {/* Pack */}
                        <div style={{marginBottom:16}}>
                          <div style={{fontSize:".76rem",fontWeight:700,color:"#011451",marginBottom:8}}>Formule *</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                            {Object.entries(grillePriveEff).map(([key,g])=>{
                              const tarif = g[selectedLieu==="domicile"?"domicile":selectedLieu==="en_ligne"?"en_ligne":"cabinet"]||0;
                              const active = selectedPack===key;
                              return(
                                <button key={key} type="button" onClick={()=>setSelectedPack(key)}
                                  style={{padding:"14px 12px",borderRadius:12,border:`2px solid ${active?"#0c33ac":"#e2e8f0"}`,background:active?"linear-gradient(135deg,#fff,#eff6ff)":"#fff",cursor:"pointer",textAlign:"left",transition:"all .18s",boxShadow:active?"0 0 0 3px #0c33ac22":undefined}}>
                                  <div style={{fontWeight:800,fontSize:".88rem",color:active?"#0c33ac":"#0f172a",marginBottom:4}}>{key==="classique"?"🔵":"🔴"} {g.label}</div>
                                  <div style={{fontSize:".72rem",color:"#64748b",marginBottom:8,lineHeight:1.4}}>{g.frequence}</div>
                                  <div style={{fontWeight:900,fontSize:"1rem",color:active?"#0c33ac":"#0f172a"}}>{tarif.toLocaleString("fr-FR")} <span style={{fontSize:".7rem",fontWeight:600,color:"#94a3b8"}}>F / mois</span></div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        {/* Lieu - verrouillé sur la page cours consultée : /cours/en-ligne ne
                            propose que "En ligne", les 2 autres options restent visibles mais
                            grisées/désactivées pour que ce soit clair que c'est un choix fixe,
                            pas une option qui a disparu. */}
                        <div style={{marginBottom:18}}>
                          <div style={{fontSize:".76rem",fontWeight:700,color:"#011451",marginBottom:8}}>Lieu des séances</div>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(120px, 1fr))",gap:10}}>
                            {[{key:"cabinet",icon:"🏢",label:"Au cabinet"},{key:"domicile",icon:"🏠",label:"À domicile"},{key:"en_ligne",icon:"💻",label:"En ligne"}].map(l=>{
                              const active=selectedLieu===l.key;
                              return(
                                <div key={l.key}
                                  style={{padding:"11px 10px",borderRadius:10,border:`2px solid ${active?"#0c33ac":"#e2e8f0"}`,background:active?"#eff6ff":"#f8fafc",display:"flex",alignItems:"center",gap:8,opacity:active?1:.45,cursor:"default",minWidth:0}}>
                                  <span style={{fontSize:"1.2rem",flexShrink:0}}>{l.icon}</span>
                                  <span style={{fontWeight:700,fontSize:".85rem",color:active?"#0c33ac":"#94a3b8",overflowWrap:"break-word",minWidth:0}}>{l.label}</span>
                                </div>
                              );
                            })}
                          </div>
                          <p style={{fontSize:".7rem",color:"#94a3b8",margin:"6px 0 0"}}>Le lieu suit la formule de cours consultée.</p>
                        </div>
                        {/* Disponibilités */}
                        <div style={{marginBottom:18}}>
                          <div style={{fontSize:".76rem",fontWeight:700,color:"#011451",marginBottom:8}}>Vos disponibilités</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                            {JOURS_ORDER.map(jour=>{
                              const active=disponForm.some(d=>d.jour===jour);
                              return(
                                <button key={jour} type="button" onClick={()=>toggleDispoJour(jour)}
                                  style={{padding:"7px 16px",borderRadius:20,border:`2px solid ${active?"#0c33ac":"#e2e8f0"}`,background:active?"#eff6ff":"#fff",color:active?"#0c33ac":"#64748b",fontWeight:700,fontSize:".8rem",cursor:"pointer",transition:"all .15s"}}>
                                  {jour}
                                </button>
                              );
                            })}
                          </div>
                          {disponForm.length>0 && (
                            <div style={{display:"flex",flexDirection:"column",gap:7,marginTop:10}}>
                              {disponForm.map(row=>(
                                <div key={row.jour} style={{display:"flex",alignItems:"center",gap:10,background:"#eff6ff",borderRadius:10,padding:"8px 12px",border:"1.5px solid #bfdbfe"}}>
                                  <span style={{fontWeight:800,fontSize:".82rem",color:"#0c33ac",minWidth:34}}>{row.jour}</span>
                                  <span style={{color:"#94a3b8",fontSize:".75rem",flexShrink:0}}>à partir de</span>
                                  <input type="time" value={row.debut}
                                    onChange={e=>setDispoDebut(row.jour,e.target.value)}
                                    style={{padding:"5px 8px",borderRadius:8,border:"1px solid #bfdbfe",fontSize:".82rem",outline:"none",cursor:"pointer",background:"#fff",color:"#0f172a"}}/>
                                  <button type="button" onClick={()=>setDisponForm(prev=>prev.filter(d=>d.jour!==row.jour))}
                                    style={{marginLeft:"auto",background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:".88rem",padding:"2px 6px",borderRadius:6,lineHeight:1,flexShrink:0}}>✕</button>
                                </div>
                              ))}
                            </div>
                          )}
                          {disponForm.length===0 && (
                            <p style={{fontSize:".72rem",color:"#94a3b8",margin:"6px 0 0"}}>Cliquez sur un jour pour le sélectionner</p>
                          )}
                        </div>
                        {/* Adresse - uniquement pour "À domicile", le coach doit savoir où se déplacer */}
                        {selectedLieu==="domicile" && (
                          <div style={{marginBottom:18}}>
                            <div style={{fontSize:".76rem",fontWeight:700,color:"#011451",marginBottom:8}}>Quartier / Zone / Adresse *</div>
                            <input value={zoneForm} onChange={e=>setZoneForm(e.target.value)}
                              placeholder="Ex : Cocody Riviera, Angré 7ème tranche…"
                              style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"1.5px solid #e2e8f0",fontSize:".85rem",boxSizing:"border-box",outline:"none"}}/>
                          </div>
                        )}
                        {/* Récap */}
                        {(()=>{
                          const g=grillePriveEff[selectedPack||"classique"];
                          const tarif=g?.[selectedLieu==="domicile"?"domicile":selectedLieu==="en_ligne"?"en_ligne":"cabinet"]||0;
                          return(
                            <div style={{background:"linear-gradient(135deg,#0c33ac,#011451)",borderRadius:12,padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                              <div>
                                <div style={{fontSize:".7rem",color:"rgba(255,255,255,.65)",fontWeight:600,textTransform:"uppercase",letterSpacing:".05em"}}>Votre formule</div>
                                <div style={{fontSize:".88rem",fontWeight:800,color:"#fff",marginTop:2}}>{g?.label} · {selectedLieu==="domicile"?"🏠 À domicile":selectedLieu==="en_ligne"?"💻 En ligne":"🏢 Au cabinet"}</div>
                                <div style={{fontSize:".7rem",color:"rgba(255,255,255,.7)",marginTop:2}}>{g?.frequence}</div>
                              </div>
                              <div style={{textAlign:"right"}}>
                                <div style={{fontSize:"1.5rem",fontWeight:900,color:"#fff",lineHeight:1}}>{tarif.toLocaleString("fr-FR")}</div>
                                <div style={{fontSize:".7rem",color:"rgba(255,255,255,.65)",fontWeight:600}}>FCFA / mois</div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
    </>
  );


  return(
    <div className="course-detail-root" style={S.page}>
      <SEO
        title={`${course.title} - Formation anglais | BET`}
        description={course.subtitle || `Découvrez la formation "${course.title}" chez Binnie's English Training - programme, formats et tarifs.`}
        canonicalUrl={`/cours/${type}`}
        jsonLd={courseJsonLd}
      />
      {/* HERO */}
      <div ref={heroRef} style={heroMedia ? {
        position:"relative", overflow:"hidden",
        height: heroMedia.type==="video" ? "clamp(500px, 56.25vw, 620px)" : 480,
        background:"#07111f",
      } : S.hero}>

        {/* ── Fond media plein écran ── */}
        {heroMedia && heroMedia.type==="video" && (
          <iframe
            ref={iframeRef}
            src={buildHeroEmbedUrl(heroMedia.url)}
            title={heroMedia.titre||"Présentation"}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{
              position:"absolute", top:"50%", left:"50%",
              width:"100%", height:"56.25vw",
              minWidth:"177.78vh", minHeight:"100%",
              transform:"translate(-50%,-50%)",
              zIndex:1,
            }}
          />
        )}
        {heroMedia && heroMedia.type==="image" && (
          <div style={{
            position:"absolute", inset:0, zIndex:1,
            backgroundImage:`url(${heroMedia.url})`,
            backgroundSize:"cover", backgroundPosition:"center",
          }}/>
        )}

        {/* Gradient cinématique : transparent haut → sombre bas */}
        {heroMedia && (
          <div style={{
            position:"absolute", inset:0, zIndex:2, pointerEvents:"none",
            background: heroMedia.type==="video"
              ? "linear-gradient(to bottom, rgba(7,17,31,0) 20%, rgba(7,17,31,.45) 58%, rgba(7,17,31,.96) 100%)"
              : "linear-gradient(135deg, rgba(7,17,31,.86) 0%, rgba(7,17,31,.48) 100%)",
          }}/>
        )}

        {/* Breadcrumb flottant en haut */}
        {heroMedia && (
          <div className="course-detail-hero-breadcrumb" style={{position:"absolute",top:22,left:0,right:0,zIndex:4,maxWidth:1180,margin:"0 auto",padding:"0 32px",display:"flex",alignItems:"center",gap:6,fontSize:".76rem"}}>
            <span onClick={()=>navigate("/")} style={{color:"rgba(255,255,255,.5)",cursor:"pointer",transition:"color .2s"}} onMouseEnter={e=>e.target.style.color="#fff"} onMouseLeave={e=>e.target.style.color="rgba(255,255,255,.5)"}>Accueil</span>
            <span style={{color:"rgba(255,255,255,.2)"}}>›</span>
            <span onClick={()=>navigate(-1)} style={{color:"rgba(255,255,255,.5)",cursor:"pointer",transition:"color .2s"}} onMouseEnter={e=>e.target.style.color="#fff"} onMouseLeave={e=>e.target.style.color="rgba(255,255,255,.5)"}>Cours</span>
            <span style={{color:"rgba(255,255,255,.2)"}}>›</span>
            <span style={{color:"rgba(255,255,255,.7)",maxWidth:300,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{heroMedia?.titre||course.title}</span>
          </div>
        )}

        {/* Zone titre ancrée en bas */}
        {heroMedia ? (
          <div style={{position:"absolute",bottom:0,left:0,right:0,zIndex:3,padding:"0 0 36px"}}>
            <div style={{maxWidth:1180,margin:"0 auto",padding:"0 32px",display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:20,flexWrap:"wrap"}}>
              {/* Colonne gauche : badge + titre */}
              <div style={{flex:1,minWidth:0}}>
                {/* Badge type d'offre */}
                <div style={{marginBottom:12}}>
                  <span style={{
                    display:"inline-flex",alignItems:"center",gap:6,
                    background:"rgba(255,255,255,.1)",backdropFilter:"blur(12px)",
                    border:"1px solid rgba(255,255,255,.18)",
                    color:"rgba(255,255,255,.9)",borderRadius:100,
                    padding:"5px 16px",fontSize:".7rem",fontWeight:700,
                    letterSpacing:".1em",textTransform:"uppercase",
                  }}>
                    {type==="en-ligne"?"📱 En ligne":type==="domicile"?"🏠 À domicile":type==="cabinet"?"🏫 En cabinet":"📚 Formation"}
                  </span>
                </div>
                {/* Accent + Titre */}
                <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
                  <div style={{width:4,minHeight:52,borderRadius:4,background:"linear-gradient(to bottom,#3355cc,#0c33ac)",flexShrink:0,marginTop:4}}/>
                  <div>
                    <h1 className="course-detail-hero-title" style={{
                      fontFamily:FD,fontSize:"clamp(1.7rem,4vw,3rem)",
                      color:"#fff",margin:"0 0 8px",fontWeight:800,
                      lineHeight:1.1,textShadow:"0 2px 28px rgba(0,0,0,.55)",
                    }}>
                      {type==="cabinet"&&selectedCentre ? selectedCentre.name : (heroMedia?.titre||course.title)}
                    </h1>
                    {type==="cabinet"&&selectedCentre&&(
                      <p style={{color:"rgba(255,255,255,.65)",fontSize:".95rem",margin:0,lineHeight:1.5}}>
                        {selectedCentre.subtitle||`Cours en cabinet · ${selectedCentre.ville}`}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Layout original sans media */
          <>
          <div style={{position:"absolute",width:360,height:360,borderRadius:"50%",background:"rgba(220,38,38,.12)",top:-100,right:-60,pointerEvents:"none"}}/>
          <div style={{position:"absolute",width:240,height:240,borderRadius:"50%",background:"rgba(30,58,138,.2)",bottom:40,left:-60,pointerEvents:"none"}}/>
          <div style={{position:"absolute",width:180,height:180,borderRadius:"50%",background:"rgba(220,38,38,.07)",top:"35%",left:"38%",pointerEvents:"none"}}/>
          <div className="course-detail-hero-inner" style={{...S.heroInner,position:"relative",zIndex:3}}>
            <div style={S.heroMain}>
              <div style={S.breadcrumb}>
                <span style={S.bLink} onClick={()=>navigate("/")}>Accueil</span><span style={S.bSep}>/</span>
                <span style={S.bLink} onClick={()=>navigate(-1)}>Cours</span><span style={S.bSep}>/</span>
                <span style={{color:"#e2e8f0"}}>{course.title}</span>
              </div>
              <h1 className="course-detail-hero-title" style={S.heroTitle}>
                {type==="cabinet"&&selectedCentre ? selectedCentre.name : course.title}
              </h1>
              {type==="cabinet"&&selectedCentre&&(
                <p style={S.heroSub}>{selectedCentre.subtitle||`Cours en cabinet · ${selectedCentre.ville}`}</p>
              )}
            </div>
          </div>
          </>
        )}

        {/* Wave - uniquement sans media */}
        {!heroMedia && (
          <div style={{lineHeight:0,position:"relative",zIndex:3}}>
            <svg viewBox="0 0 1440 56" style={{display:"block",width:"100%"}} preserveAspectRatio="none">
              <path fill="#fff" d="M0,28 C480,56 960,0 1440,28 L1440,56 L0,56 Z"/>
            </svg>
          </div>
        )}
      </div>

      {/* ── Barre de contrôle vidéo ── */}
      {heroMedia?.type==="video" && (
        <div style={{background:"#0a1128",padding:"14px 32px",display:"flex",justifyContent:"center",alignItems:"center",gap:12,flexWrap:"wrap",borderBottom:"1.5px solid rgba(255,255,255,.06)"}}>
          <button onClick={handlePlayPause} style={{display:"flex",alignItems:"center",gap:8,background:"#0c33ac",color:"#fff",border:"none",borderRadius:10,padding:"11px 28px",fontSize:".95rem",fontWeight:800,cursor:"pointer",letterSpacing:".02em"}}>
            {isPlaying ? "⏸ Pause" : "▶ Jouer"}
          </button>
          <button onClick={handleReplay} style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,.07)",color:"#e2e8f0",border:"1.5px solid rgba(255,255,255,.18)",borderRadius:10,padding:"11px 28px",fontSize:".95rem",fontWeight:700,cursor:"pointer"}}>
            ↺ Rejouer
          </button>
          <button onClick={handleMute} style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,.07)",color:"#e2e8f0",border:"1.5px solid rgba(255,255,255,.18)",borderRadius:10,padding:"11px 28px",fontSize:".95rem",fontWeight:700,cursor:"pointer"}}>
            {isMuted ? "🔊 Son" : "🔇 Muet"}
          </button>
        </div>
      )}

      {/* SÉLECTEUR DE CENTRE (type cabinet uniquement) */}
      {type==="cabinet"&&centresList.length>0&&(
        <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"14px 0"}}>
          <div style={{maxWidth:1180,margin:"0 auto",padding:"0 24px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:13,fontWeight:700,color:"#475569",whiteSpace:"nowrap",flexShrink:0}}>📍 Choisissez votre centre :</span>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {centresList.map(c=>(
                  <button key={c.key} onClick={()=>setSelectedCentreKey(c.key)}
                    style={{
                      padding:"7px 16px",borderRadius:999,fontSize:13,fontWeight:700,cursor:"pointer",transition:"all .2s",
                      border:`2px solid ${selectedCentreKey===c.key?c.color:"#e2e8f0"}`,
                      background:selectedCentreKey===c.key?c.color+"22":"#f8fafc",
                      color:selectedCentreKey===c.key?"#011451":"#64748b",
                      boxShadow:selectedCentreKey===c.key?`0 0 0 3px ${c.color}33`:"none",
                    }}
                  >
                    <span style={{display:"inline-block",width:9,height:9,borderRadius:"50%",background:c.color,marginRight:6,verticalAlign:"middle"}}/>
                    {c.name}
                    {c.ville&&c.ville!=="Abidjan"&&<span style={{fontSize:11,fontWeight:500,color:"#94a3b8",marginLeft:4}}>({c.ville})</span>}
                  </button>
                ))}
              </div>
            </div>
            {selectedCentre&&(
              <div style={{marginTop:10,display:"flex",gap:16,flexWrap:"wrap",fontSize:12,color:"#64748b"}}>
                {selectedCentre.addr&&<span>📌 {selectedCentre.addr}</span>}
                {selectedCentre.horaires&&<span>🕐 {selectedCentre.horaires}</span>}
                {selectedCentre.telephone&&<a href={`tel:${selectedCentre.telephone}`} style={{color:"#0891b2",textDecoration:"none",fontWeight:600}}>📞 {selectedCentre.telephone}</a>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TABS */}
      <div style={{...S.tabsBar,...(sidebarSticky?S.tabsSticky:{})}}>
        <div className="course-detail-tabs-inner" style={S.tabsInner}>
          {TABS.map(t=><button key={t.id} className="course-detail-tab-btn" style={{...S.tabBtn,...(activeTab===t.id?S.tabActive:{})}} onClick={()=>setActiveTab(t.id)}>{t.label}</button>)}
        </div>
      </div>

      {/* LAYOUT */}
      <div className="course-detail-layout" style={S.layout}>
        <div style={S.contentCol}>
          {/* Aperçu */}
          {activeTab==="apercu"&&(
            <div style={{animation:"fadeUp .4s ease"}}>
              <section style={S.section}>
                <h2 style={S.sH2}>Ce que vous apprendrez</h2>
                <div className="course-detail-learn-grid" style={S.learnGrid}>{course.whatYouLearn?.map((item,i)=><div key={i} style={S.learnItem}><span style={S.learnCheck}>✓</span><span style={S.learnTxt}>{item}</span></div>)}</div>
              </section>
              <section style={S.section}>
                <h2 style={S.sH2}>Ce cours comprend :</h2>
                <div className="course-detail-includes-grid" style={S.includesGrid}>{course.includes?.map((inc,i)=><div key={i} style={S.includeItem}><span style={{fontSize:"1.1rem",width:24,textAlign:"center",flexShrink:0}}>{inc.icon}</span><span style={{fontSize:".88rem",color:"#475569"}}>{inc.label}</span></div>)}</div>
              </section>
              <section style={S.section}>
                <h2 style={S.sH2}>Prérequis</h2>
                <ul style={S.plainList}>{course.requirements?.map((r,i)=><li key={i} style={S.plainLi}>• {r}</li>)}</ul>
              </section>
              <section style={S.section}>
                <h2 style={S.sH2}>Description</h2>
                {course.description?.split("\n\n").map((p,i)=><p key={i} style={S.descP}>{p}</p>)}
              </section>
              {course.advantages&&(
                <section style={S.section}>
                  <h2 style={S.sH2}>Avantages exclusifs BET</h2>
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>{course.advantages.map((a,i)=><div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,fontSize:".92rem",color:"#334155"}}><div style={S.advDot}>✓</div><span>{a}</span></div>)}</div>
                </section>
              )}
              <section style={S.section}>
                <h2 style={S.sH2}>À qui s'adresse cette formation ?</h2>
                <ul style={S.plainList}>{course.targetAudience?.map((t,i)=><li key={i} style={S.plainLi}>• {t}</li>)}</ul>
              </section>
            </div>
          )}

          {/* Formules */}
          {activeTab==="formules"&&(
            <div style={{animation:"fadeUp .4s ease"}}>
              <section style={{...S.section,paddingTop:16}}>
                <h2 style={S.sH2}>Choisissez votre formule</h2>
                <p style={S.currMeta}>Sans engagement · Changez ou annulez à tout moment</p>
                <PromosBanner
                  offreType={type==="en-ligne"?"en_ligne":type==="domicile"?"domicile":"centres"}
                  centreId={type==="cabinet"?selectedCentre?.id:undefined}
                  accentColor="#ff2945"
                  onApply={(code)=>{
                    setCodePromo(code);setCodePromoApplied(null);setCodePromoError("");
                    // Sans formule sélectionnée, le modal retombe sur course.price (prix
                    // générique d'affichage, jamais celui réellement facturé) - on garde le
                    // code en attente et on demande de choisir une formule d'abord, au lieu
                    // d'ouvrir le paiement avec un montant qui ne correspond à rien de choisi.
                    if (!selectedFormat) { setFormuleRequiseMsg(true); return; }
                    setModalOpen(true);
                    validerCodePromo(code);
                  }}
                />
                {formuleRequiseMsg && !selectedFormat && (
                  <p style={{ color:"#ff2945", fontSize:".82rem", fontWeight:600, margin:"-14px 0 20px" }}>
                    👇 Choisissez d'abord une formule ci-dessous - votre code sera appliqué automatiquement.
                  </p>
                )}
                <div className="course-detail-formats-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:24,marginBottom:28}}>
                  {course.formats?.map((f,i)=>{
                    const isEntreprise=/entreprise/i.test(f.name||"");
                    const isSelected = selectedFormat?.name===f.name && !isEntreprise;
                    const tagLabel = isSelected ? "✓ Sélectionnée" : f.popular ? "⭐ LE PLUS CHOISI" : isEntreprise ? "🏢 ENTREPRISES" : f.name.toUpperCase();
                    const tagBg    = isSelected ? "#ff2945" : f.popular ? "#fef3c7" : isEntreprise ? "#d6e0ff" : "rgba(255,255,255,.92)";
                    const tagColor = isSelected ? "#fff"    : f.popular ? "#d97706"  : isEntreprise ? "#0c33ac" : "#011451";
                    const accentColor = isEntreprise ? "#0c33ac" : "#ff2945";
                    return(
                    <div key={i} className="bet-card"
                      onClick={()=>{
                        if(isEntreprise) return;
                        setSelectedFormat(f);
                        setFormuleRequiseMsg(false);
                        ga4.offreChoisie({ offre:`${course.title} - ${f.name}`, type_coaching:f.type_coaching,
                          canal:type, prix:parsePrixFCFA(f.price) });
                        /* Le choix se poursuit sur place, dans un modal : l'offre a un
                           rythme ou un paramétrage à arrêter avant de pouvoir s'inscrire. */
                        if(offreAUnSelecteur(f)){ setSelecteurOuvert(true); return; }
                        // Offre à tarif unique : rien à choisir. Sur petit écran, la sidebar
                        // (bouton S'inscrire) passe sous le contenu - on y scrolle.
                        if(window.innerWidth<=900){
                          setTimeout(()=>sidebarRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),80);
                        }
                      }}
                      onMouseEnter={()=>setHovCard(i)} onMouseLeave={()=>setHovCard(null)}
                      style={{
                        borderRadius:18, overflow:"hidden", cursor:"pointer",
                        border:`1.5px solid ${isSelected?"#ff2945":f.popular?"#ff294533":isEntreprise?"#93c5fd":"#e2e8f0"}`,
                        background:"#fff",
                        boxShadow: isSelected?"0 0 0 3px #ff294522, 0 8px 24px rgba(220,38,38,.1)":hovCard===i?"0 24px 56px rgba(0,0,0,.14)":"0 2px 12px rgba(0,0,0,.07)",
                        transform: hovCard===i&&!isSelected?"translateY(-6px)":"none",
                        transition:"all .3s ease",
                      }}>
                      {/* Image */}
                      <div style={{height:185,position:"relative",overflow:"hidden"}}>
                        <img src={getFormatImg(f,course.heroImage)} alt={f.name}
                          style={{width:"100%",height:"100%",objectFit:"cover",transition:"transform .5s",transform:hovCard===i?"scale(1.05)":"scale(1)"}} />
                        <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,transparent 40%,rgba(0,0,0,.65))"}} />
                        <div style={{position:"absolute",top:12,left:12,background:tagBg,color:tagColor,fontSize:".63rem",fontWeight:800,letterSpacing:".07em",borderRadius:999,padding:"3px 10px"}}>
                          {tagLabel}
                        </div>
                        <div style={{position:"absolute",bottom:12,left:12,background:"rgba(255,255,255,.95)",color:"#011451",fontSize:".76rem",fontWeight:800,borderRadius:999,padding:"4px 12px"}}>
                          {f.price}{f.duration?" · "+f.duration:""}
                        </div>
                      </div>
                      {/* Body */}
                      <div style={{padding:"18px 18px 20px"}}>
                        <h3 style={{fontFamily:FD,fontSize:"1.15rem",margin:"0 0 8px",fontWeight:400,color:"#011451"}}>{f.name}</h3>
                        {f.details && (
                          <ul style={{fontSize:".82rem",color:"#475569",lineHeight:1.6,margin:"0 0 12px",padding:"0 0 0 18px"}}>
                            {f.details.split("\n").map(s=>s.trim()).filter(Boolean).map((line,li)=><li key={li}>{line}</li>)}
                          </ul>
                        )}
                        {f.brochure_url&&(
                          <a href={f.brochure_url} download={f.brochure_nom||true} target="_blank" rel="noopener noreferrer"
                            onClick={e=>e.stopPropagation()}
                            style={{display:"flex",alignItems:"center",gap:6,background:"#eef1ff",border:"1.5px solid #bae6fd",borderRadius:8,padding:"8px 12px",marginBottom:12,textDecoration:"none"}}>
                            <span>📄</span>
                            <span style={{fontSize:".82rem",fontWeight:700,color:"#0891b2",flex:1}}>{f.brochure_nom||"Télécharger la brochure"}</span>
                            <span style={{fontSize:".72rem",fontWeight:700,color:"#94a3b8",background:"#f1f5f9",borderRadius:4,padding:"2px 7px"}}>PDF</span>
                          </a>
                        )}
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"1px solid #f1f5f9",paddingTop:14}}>
                          <div>
                            <div style={{fontWeight:800,fontSize:".88rem",color:"#011451"}}>{f.price}{f.duration?" · "+f.duration:""}</div>
                            <div style={{fontSize:".68rem",color:"#94a3b8"}}>remboursement 30j garanti</div>
                          </div>
                          <button style={{color:"#fff",background:isSelected?"#10b981":accentColor,border:"none",borderRadius:999,padding:"9px 18px",fontWeight:800,fontSize:".82rem",cursor:"pointer",transition:"background .2s",whiteSpace:"nowrap"}}>
                            {isSelected?"✓ Sélectionnée":isEntreprise?"Nous contacter →":"Choisir →"}
                          </button>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
                {/* Carte compacte : le grand sélecteur vit désormais dans un modal
                    (plus d'aller-retour en bas de page). Elle dit ce qui est retenu et
                    rouvre le modal pour en changer. */}
                {selectedFormat && offreAUnSelecteur(selectedFormat) && (
                  <div style={{marginBottom:20,background:"linear-gradient(135deg,#f8fafc,#f1f5f9)",border:"1.5px solid #e2e8f0",borderRadius:16,padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:".7rem",fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>Votre formule</div>
                      {selectedFormat.type_coaching === "prive" ? (()=>{
                        const g=grillePriveEff[selectedPack||"classique"];
                        return (
                          <>
                            <div style={{fontWeight:800,fontSize:".95rem",color:"#011451"}}>{g?.label} · {selectedLieu==="domicile"?"🏠 À domicile":selectedLieu==="en_ligne"?"💻 En ligne":"🏢 Au cabinet"}</div>
                            {g?.frequence && <div style={{fontSize:".76rem",color:"#64748b",marginTop:2}}>{g.frequence}</div>}
                          </>
                        );
                      })() : formuleGroupeCD ? (
                        <>
                          <div style={{fontWeight:800,fontSize:".95rem",color:"#065f46"}}>{formuleGroupeCD.label}</div>
                          {formuleGroupeCD.frequence && <div style={{fontSize:".76rem",color:"#64748b",marginTop:2}}>{formuleGroupeCD.frequence}</div>}
                        </>
                      ) : (
                        <div style={{fontWeight:800,fontSize:".95rem",color:"#ff2945"}}>Aucune formule choisie</div>
                      )}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
                      {prixRefCD>0 && (
                        <div style={{textAlign:"right"}}>
                          <div style={{fontFamily:FD,fontSize:"1.5rem",color:selectedFormat.type_coaching==="prive"?"#0c33ac":"#059669",lineHeight:1}}>{prixRefCD.toLocaleString("fr-FR")} F</div>
                          <div style={{fontSize:".68rem",color:"#94a3b8",fontWeight:700}}>/ mois</div>
                        </div>
                      )}
                      <button type="button" onClick={()=>setSelecteurOuvert(true)}
                        style={{padding:"10px 18px",borderRadius:999,border:"1.5px solid #cbd5e1",background:"#fff",color:"#0f172a",fontWeight:800,fontSize:".82rem",cursor:"pointer",whiteSpace:"nowrap"}}>
                        ✏️ {formuleGroupeCD || selectedFormat.type_coaching==="prive" ? "Modifier ma formule" : "Choisir ma formule"}
                      </button>
                    </div>
                  </div>
                )}
                <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:12,padding:"18px 20px",display:"flex",alignItems:"flex-start",gap:16,color:"#166534"}}>
                  <span style={{fontSize:"1.5rem"}}>🛡️</span>
                  <div><strong style={{display:"block",marginBottom:4}}>Garantie satisfait ou remboursé 30 jours</strong><span style={{fontSize:".88rem",color:"#64748b"}}>Aucun risque. Si vous n'êtes pas satisfait dans les 30 jours, nous vous remboursons intégralement, sans condition.</span></div>
                </div>
              </section>

              {type==="en-ligne"&&!selectedFormat&&(
                <div style={{position:"sticky",bottom:0,background:"#fafafa",borderTop:"1.5px solid #e2e8f0",padding:"12px 20px",textAlign:"center",color:"#94a3b8",fontSize:".82rem",zIndex:40}}>
                  ☝️ Cliquez sur une formule ci-dessus pour la sélectionner
                </div>
              )}
            </div>
          )}

          {/* Avis */}
          {activeTab==="avis"&&(
            <div style={{animation:"fadeUp .4s ease"}}>
              <section style={S.section}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12,marginBottom:24}}>
                  <h2 style={{...S.sH2,margin:0}}>Avis des apprenants</h2>
                  {isApprenantBET && !avisDejaPoste && (
                    <button onClick={()=>{setAvisForm({note:5,texte:""});setAvisMsg(null);setAvisModalOpen(true);}}
                      style={{background:"#ff2945",color:"#fff",border:"none",borderRadius:999,padding:"10px 22px",fontWeight:800,fontSize:".85rem",cursor:"pointer",boxShadow:"0 4px 14px rgba(220,38,38,.25)"}}>
                      ✍️ Laisser mon avis
                    </button>
                  )}
                  {isApprenantBET && avisDejaPoste && (
                    <span style={{background:"#d1fae5",color:"#065f46",borderRadius:999,padding:"6px 16px",fontSize:".8rem",fontWeight:700}}>✅ Votre avis a été publié</span>
                  )}
                  {!sbUser && (
                    <span style={{fontSize:".8rem",color:"#64748b"}}>Connectez-vous pour laisser un avis (réservé aux apprenants BET)</span>
                  )}
                </div>

                {/* Barre de note globale */}
                {avisLive.length > 0 && (()=>{
                  const avg=(avisLive.reduce((s,a)=>s+a.note,0)/avisLive.length).toFixed(1);
                  const dist=[5,4,3,2,1].map(n=>({n,count:avisLive.filter(a=>a.note===n).length}));
                  return(
                    <div style={{display:"flex",gap:32,alignItems:"center",background:"#fafafa",border:"1px solid #e2e8f0",borderRadius:12,padding:24,marginBottom:28,flexWrap:"wrap"}}>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,minWidth:90}}>
                        <div style={{fontSize:"3rem",fontWeight:900,color:"#011451",lineHeight:1}}>{avg}</div>
                        <Stars rating={Number(avg)} size={20}/>
                        <div style={{fontSize:".76rem",color:"#64748b",fontWeight:600}}>{avisLive.length} avis</div>
                      </div>
                      <div style={{flex:1,display:"flex",flexDirection:"column",gap:6}}>
                        {dist.map(({n,count})=>{
                          const pct=Math.round((count/avisLive.length)*100);
                          return(
                            <div key={n} style={{display:"flex",alignItems:"center",gap:10}}>
                              <Stars rating={n} size={11}/>
                              <div style={{flex:1,height:8,background:"#e2e8f0",borderRadius:4,overflow:"hidden"}}>
                                <div style={{width:`${pct}%`,height:"100%",background:"#f59e0b",borderRadius:4}}/>
                              </div>
                              <span style={{fontSize:".75rem",color:"#64748b",width:30,textAlign:"right"}}>{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Liste avis */}
                {avisLoading && <div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>Chargement des avis…</div>}
                {!avisLoading && avisLive.length===0 && (
                  <div style={{textAlign:"center",padding:"48px 24px",background:"#f8fafc",borderRadius:12,border:"1.5px dashed #e2e8f0"}}>
                    <div style={{fontSize:"2.5rem",marginBottom:12}}>💬</div>
                    <p style={{color:"#64748b",fontSize:".9rem",margin:0}}>Aucun avis pour le moment. Soyez le premier à partager votre expérience !</p>
                  </div>
                )}
                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  {avisLive.map((a)=>(
                    <div key={a.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:20}}>
                      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,flexWrap:"wrap"}}>
                        <div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#0c33ac,#ff2945)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem",fontWeight:800,color:"#fff",flexShrink:0}}>
                          {(a.apprenant_nom||"?")[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{fontWeight:800,fontSize:".88rem",color:"#011451"}}>{a.apprenant_nom||"Apprenant BET"}</div>
                          <div style={{fontSize:".73rem",color:"#64748b"}}>{new Date(a.created_at).toLocaleDateString("fr-FR",{year:"numeric",month:"long",day:"numeric"})}</div>
                        </div>
                        <div style={{marginLeft:"auto"}}><Stars rating={a.note} size={14}/></div>
                      </div>
                      <p style={{fontSize:".9rem",color:"#475569",lineHeight:1.65,margin:0,fontStyle:"italic"}}>"{a.texte}"</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* Modal avis */}
          {avisModalOpen && (
            <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.75)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setAvisModalOpen(false)}>
              <div style={{background:"#fff",borderRadius:20,padding:"32px 28px",maxWidth:480,width:"100%",boxShadow:"0 24px 64px rgba(0,0,0,.2)"}} onClick={e=>e.stopPropagation()}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
                  <h3 style={{margin:0,fontSize:"1.1rem",fontWeight:800,color:"#011451"}}>✍️ Mon avis sur ce cours</h3>
                  <button onClick={()=>setAvisModalOpen(false)} style={{background:"none",border:"none",fontSize:"1.4rem",cursor:"pointer",color:"#64748b",lineHeight:1}}>✕</button>
                </div>
                <label style={{fontSize:".83rem",fontWeight:700,color:"#334155",display:"block",marginBottom:8}}>Votre note *</label>
                <div style={{display:"flex",gap:6,marginBottom:20}}>
                  {[1,2,3,4,5].map(n=>(
                    <button key={n} onClick={()=>setAvisForm(p=>({...p,note:n}))}
                      style={{fontSize:"1.8rem",background:"none",border:"none",cursor:"pointer",color:n<=avisForm.note?"#f59e0b":"#e2e8f0",transition:"color .12s,transform .1s",transform:n<=avisForm.note?"scale(1.12)":"scale(1)"}}>★</button>
                  ))}
                  <span style={{alignSelf:"center",fontSize:".82rem",color:"#94a3b8",marginLeft:4}}>{["","Mauvais","Passable","Bien","Très bien","Excellent"][avisForm.note]}</span>
                </div>
                <label style={{fontSize:".83rem",fontWeight:700,color:"#334155",display:"block",marginBottom:6}}>Votre avis * <span style={{fontWeight:400,color:"#94a3b8"}}>({avisForm.texte.length}/500, min. 20)</span></label>
                <textarea value={avisForm.texte} onChange={e=>setAvisForm(p=>({...p,texte:e.target.value.slice(0,500)}))}
                  rows={4} placeholder="Partagez votre expérience avec ce cours : les points forts, ce que vous avez appris, à qui vous le recommanderiez…"
                  style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px",fontSize:".88rem",resize:"vertical",boxSizing:"border-box",outline:"none",fontFamily:"inherit",lineHeight:1.6}}
                  onFocus={e=>e.target.style.borderColor="#ff2945"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
                {avisMsg && (
                  <div style={{background:avisMsg.type==="ok"?"#d1fae5":"#fee2e2",color:avisMsg.type==="ok"?"#065f46":"#ff2945",borderRadius:8,padding:"10px 14px",fontSize:".82rem",marginTop:12}}>
                    {avisMsg.type==="ok"?"✅":"❌"} {avisMsg.text}
                  </div>
                )}
                <button onClick={submitAvis} disabled={avisSubmitting||avisForm.texte.trim().length<20}
                  style={{width:"100%",marginTop:18,padding:"13px",background:avisForm.texte.trim().length<20?"#e2e8f0":"#ff2945",color:avisForm.texte.trim().length<20?"#94a3b8":"#fff",border:"none",borderRadius:10,fontWeight:800,fontSize:".95rem",cursor:avisForm.texte.trim().length<20?"not-allowed":"pointer",transition:"background .2s"}}>
                  {avisSubmitting?"Envoi en cours…":"Publier mon avis →"}
                </button>
              </div>
            </div>
          )}

          {/* FAQ */}
          {activeTab==="faq"&&(
            <div style={{animation:"fadeUp .4s ease"}}>
              <section style={S.section}>
                <h2 style={S.sH2}>Questions fréquentes</h2>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>{course.faq?.map((item,i)=><FAQItem key={i} item={item}/>)}</div>
              </section>
            </div>
          )}


        </div>

        {/* SIDEBAR */}
        <aside ref={sidebarRef} className="course-detail-sidebar" style={{...S.sidebar,...(sidebarSticky?{top:80}:{})}}>

          {/* ── SIDEBAR CABINET (centre physique) ── */}
          {type==="cabinet"&&selectedCentre?(()=>{
            const offresActives=(selectedCentre.offres||[]).filter(o=>o.actif!==false);
            const prixDepart=offresActives[0]?.prix;
            return(
              <div className="course-detail-side-card" style={S.sideCard}>

                {/* Header centre coloré */}
                <div style={{padding:"16px 18px",background:`linear-gradient(135deg,${selectedCentre.color}18,${selectedCentre.color}08)`,borderBottom:`3px solid ${selectedCentre.color}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:38,height:38,borderRadius:10,background:selectedCentre.color+"33",border:`2px solid ${selectedCentre.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>📍</div>
                    <div>
                      <div style={{fontWeight:800,fontSize:".95rem",color:"#011451"}}>{selectedCentre.name}</div>
                      <div style={{fontSize:".76rem",color:"#64748b"}}>{selectedCentre.addr||selectedCentre.ville}</div>
                    </div>
                  </div>
                </div>

                {/* Offre sélectionnée ou prix de départ */}
                {selectedFormat ? (
                  <div style={{padding:"14px 18px",borderBottom:"1px solid #f1f5f9"}}>
                    <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,letterSpacing:".08em",marginBottom:6}}>FORMULE SÉLECTIONNÉE</div>
                    <div style={{fontWeight:800,fontSize:".95rem",color:"#011451",marginBottom:4}}>{selectedFormat.name}</div>
                    {selectedFormat.type_coaching === "prive" ? (()=>{
                      const gp=grillePriveEff[selectedPack||"classique"];
                      const tarifP=gp?.[selectedLieu==="domicile"?"domicile":selectedLieu==="en_ligne"?"en_ligne":"cabinet"]||0;
                      return (
                        <div>
                          <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:2}}>
                            <span style={{fontFamily:FD,fontSize:"1.7rem",color:"#0c33ac"}}>{tarifP.toLocaleString("fr-FR")} F</span>
                            <span style={{fontSize:".8rem",color:"#64748b"}}>/mois</span>
                          </div>
                          <div style={{fontSize:".72rem",color:"#3b82f6",marginBottom:4}}>Pack {gp?.label} · {selectedLieu==="domicile"?"À domicile":"Au cabinet"}</div>
                        </div>
                      );
                    })() : formuleGroupeCD ? (
                      /* Une formule choisie remplace le prix d'appel : c'est son tarif qui
                         sera facturé, l'afficher ailleurs induirait le client en erreur. */
                      <div style={{marginBottom:4}}>
                        <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:2}}>
                          <span style={{fontFamily:FD,fontSize:"1.7rem",color:"#059669"}}>{formuleGroupeCD.tarif.toLocaleString("fr-FR")} F</span>
                          <span style={{fontSize:".8rem",color:"#64748b"}}>/mois</span>
                        </div>
                        <div style={{fontSize:".72rem",color:"#059669"}}>Formule {formuleGroupeCD.label}{formuleGroupeCD.frequence?` · ${formuleGroupeCD.frequence}`:""}</div>
                      </div>
                    ) : (
                      <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:4}}>
                        <span style={{fontFamily:FD,fontSize:"1.7rem",color:"#ff2945"}}>{selectedFormat.price}</span>
                        {selectedFormat.duration&&<span style={{fontSize:".8rem",color:"#64748b"}}>· {selectedFormat.duration}</span>}
                      </div>
                    )}
                    {selectedFormat.details&&<ul style={{fontSize:".78rem",color:"#64748b",lineHeight:1.5,margin:0,padding:"0 0 0 16px"}}>{selectedFormat.details.split("\n").map(s=>s.trim()).filter(Boolean).map((line,li)=><li key={li}>{line}</li>)}</ul>}
                  </div>
                ) : prixDepart ? (
                  <div style={{padding:"14px 18px 4px"}}>
                    <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,letterSpacing:".08em",marginBottom:2}}>À PARTIR DE</div>
                    <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                      <span style={{fontFamily:FD,fontSize:"1.9rem",color:"#011451",fontWeight:400}}>{prixDepart}</span>
                      {offresActives[0]?.duration&&<span style={{fontSize:".82rem",color:"#64748b"}}>/ {offresActives[0].duration}</span>}
                    </div>
                    <div style={{fontSize:".76rem",color:"#94a3b8",marginTop:4}}>← Sélectionnez une formule dans l'onglet "Formules & Tarifs"</div>
                  </div>
                ) : null}

                {/* Bouton S'inscrire */}
                <div style={{padding:"12px 18px 4px"}}>
                  <button className="course-detail-btn-enroll"
                    style={{...S.btnEnroll,opacity:selectedFormat?1:.55,pointerEvents:selectedFormat?"auto":"none"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#b91c1c"}
                    onMouseLeave={e=>e.currentTarget.style.background="#ff2945"}
                    onClick={()=>{ if(!selectedFormat) return; if(sbUser) fetchAndPrefillProfile(sbUser); setModalOpen(true); }}>
                    {selectedFormat ? (selectedFormat.type_coaching==="prive" ? `✍️ S'inscrire - ${(grillePriveEff[selectedPack||"classique"]?.[selectedLieu==="domicile"?"domicile":selectedLieu==="en_ligne"?"en_ligne":"cabinet"]||0).toLocaleString("fr-FR")} F/mois` : `✍️ S'inscrire - ${formuleGroupeCD ? `${formuleGroupeCD.tarif.toLocaleString("fr-FR")} F/mois` : selectedFormat.price}`) : "Choisissez d'abord une formule"}
                  </button>
                </div>

                {/* WhatsApp assistantes - style Navbar */}
                <div style={{padding:"14px 18px",borderTop:"1px solid #f1f5f9"}}>
                  <p style={{fontWeight:700,fontSize:".82rem",color:"#011451",margin:"0 0 10px"}}>
                    💬 Parler à une assistante
                  </p>
                  {loadingAssistantes?(
                    <div style={{textAlign:"center",padding:"16px 0",color:"#64748b",fontSize:".82rem"}}>
                      <div style={{width:24,height:24,border:"3px solid #e2e8f0",borderTopColor:"#25d366",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 8px"}}/>
                      Chargement…
                    </div>
                  ):sidebarAssistantes.length===0?(
                    <p style={{fontSize:".78rem",color:"#94a3b8",textAlign:"center",margin:0}}>
                      😔 Aucune assistante disponible pour ce centre.
                    </p>
                  ):(
                    sidebarAssistantes.map((a,i)=>{
                      const phoneRaw=(a.telephone||"").replace(/[\s+\-()]/g,"");
                      const waMsg=encodeURIComponent(`Bonjour ${a.prenom||""}${a.nom?" "+a.nom:""}, je souhaite avoir des informations sur les cours d'anglais chez ${selectedCentre.name}.`);
                      const ini=`${a.prenom?.[0]||""}${a.nom?.[0]||""}`.toUpperCase()||"A";
                      return(
                        <a key={a.id||i}
                          href={phoneRaw?`https://wa.me/${phoneRaw}?text=${waMsg}`:"#"}
                          target={phoneRaw?"_blank":undefined} rel="noopener noreferrer"
                          style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:"#f0fdf4",border:"1px solid #86efac",borderRadius:12,textDecoration:"none",marginBottom:8,transition:"background .15s",...(!phoneRaw?{opacity:.5,pointerEvents:"none"}:{})}}
                          onMouseEnter={e=>e.currentTarget.style.background="#dcfce7"}
                          onMouseLeave={e=>e.currentTarget.style.background="#f0fdf4"}>
                          {/* Avatar */}
                          {a.photo_url
                            ?<img src={a.photo_url} alt={a.prenom} style={{width:40,height:40,borderRadius:"50%",objectFit:"cover",flexShrink:0}}/>
                            :<div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#0c33ac,#0891b2)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:".88rem",flexShrink:0}}>{ini}</div>
                          }
                          {/* Infos */}
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:700,fontSize:".84rem",color:"#011451"}}>{a.prenom} {a.nom}</div>
                            <div style={{fontSize:".72rem",color:"#64748b",marginTop:1}}>{a.telephone||<em style={{color:"#94a3b8"}}>Non renseigné</em>}</div>
                          </div>
                          {/* Icône WhatsApp SVG */}
                          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,flexShrink:0}}>
                            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
                              <circle cx="16" cy="16" r="16" fill="#25d366"/>
                              <path d="M23.5 19.9c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2c-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.9-1.6.1-.2 0-.4-.1-.5-.1-.2-.7-1.8-1-2.4-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1.1 1.1-1.1 2.6s1.1 3 1.3 3.2c.2.2 2.2 3.4 5.3 4.7 2 .9 2.7.9 3.7.8.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3z" fill="#fff"/>
                            </svg>
                            <span style={{fontSize:".62rem",color:"#22c55e",fontWeight:700}}>WhatsApp</span>
                          </div>
                        </a>
                      );
                    })
                  )}
                  {selectedCentre&&sidebarAssistantes.length>0&&(
                    <p style={{fontSize:".68rem",color:"#94a3b8",margin:"8px 0 0",fontStyle:"italic",lineHeight:1.4}}>
                      💬 Message pré-rempli : « Bonjour, je souhaite avoir des informations sur les cours d'anglais chez {selectedCentre.name}. »
                    </p>
                  )}
                </div>

                {/* Brochure PDF */}
                {selectedCentre.brochure_url&&(
                  <div style={{padding:"10px 18px",borderTop:"1px solid #f1f5f9"}}>
                    <a href={selectedCentre.brochure_url} target="_blank" rel="noopener noreferrer"
                      style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:10,textDecoration:"none",color:"#011451",transition:"border-color .2s"}}
                      onMouseEnter={e=>e.currentTarget.style.borderColor="#0891b2"} onMouseLeave={e=>e.currentTarget.style.borderColor="#e2e8f0"}>
                      <span style={{fontSize:"1.2rem"}}>📄</span>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:".82rem"}}>Télécharger la brochure</div>
                        <div style={{fontSize:".72rem",color:"#64748b"}}>{selectedCentre.brochure_nom||"brochure.pdf"}</div>
                      </div>
                      <span style={{color:"#0891b2",fontSize:".8rem",fontWeight:700}}>↓</span>
                    </a>
                  </div>
                )}

                {/* Infos pratiques */}
                <div style={{padding:"12px 18px",borderTop:"1px solid #f1f5f9",display:"flex",flexDirection:"column",gap:8}}>
                  {selectedCentre.horaires&&<div style={{display:"flex",gap:8,fontSize:".8rem",color:"#475569",alignItems:"flex-start"}}><span style={{flexShrink:0}}>🕐</span><span>{selectedCentre.horaires}</span></div>}
                  {selectedCentre.telephone&&<a href={`tel:${selectedCentre.telephone}`} style={{display:"flex",gap:8,fontSize:".8rem",color:"#0891b2",fontWeight:700,textDecoration:"none",alignItems:"center"}}><span>📞</span><span>{selectedCentre.telephone}</span></a>}
                  {selectedCentre.email&&<a href={`mailto:${selectedCentre.email}`} style={{display:"flex",gap:8,fontSize:".8rem",color:"#0891b2",textDecoration:"none",alignItems:"center"}}><span>✉️</span><span>{selectedCentre.email}</span></a>}
                  {selectedCentre.maps_url&&<a href={selectedCentre.maps_url} target="_blank" rel="noopener noreferrer" style={{display:"flex",gap:8,fontSize:".8rem",color:"#0891b2",fontWeight:700,textDecoration:"none",alignItems:"center"}}><span>🗺️</span><span>Voir sur Google Maps</span></a>}
                </div>

                <div className="course-detail-share-buttons" style={{padding:"12px 18px",display:"flex",gap:8,borderTop:"1px solid #f1f5f9"}}>
                  <button
                    onClick={async () => {
                      const url = window.location.href;
                      if (navigator.share) {
                        try { await navigator.share({ title: course.title, url }); } catch {}
                      } else {
                        await navigator.clipboard.writeText(url);
                        alert("Lien copié dans le presse-papiers !");
                      }
                    }}
                    style={{flex:1,background:"#f1f5f9",border:"none",borderRadius:8,padding:"7px 4px",fontSize:".72rem",fontWeight:600,cursor:"pointer",color:"#475569"}}
                  >🔗 Partager</button>
                </div>
              </div>
            );
          })():(

          /* ── SIDEBAR GÉNÉRIQUE (cours en ligne, domicile, etc.) ── */
          <div className="course-detail-side-card" style={S.sideCard}>
            {selectedFormat ? (
              <div style={{padding:"14px 18px",borderBottom:"1px solid #f1f5f9"}}>
                <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,letterSpacing:".08em",marginBottom:6}}>FORMULE SÉLECTIONNÉE</div>
                <div style={{fontWeight:800,fontSize:".95rem",color:"#011451",marginBottom:4}}>{selectedFormat.name}</div>
                {selectedFormat.type_coaching==="prive" ? (()=>{
                  const gp2=grillePriveEff[selectedPack||"classique"];
                  const tarifP2=gp2?.[selectedLieu==="domicile"?"domicile":selectedLieu==="en_ligne"?"en_ligne":"cabinet"]||0;
                  return (
                    <div>
                      <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:2}}>
                        <span style={{fontFamily:FD,fontSize:"1.7rem",color:"#0c33ac"}}>{tarifP2.toLocaleString("fr-FR")} F</span>
                        <span style={{fontSize:".8rem",color:"#64748b"}}>/mois</span>
                      </div>
                      <div style={{fontSize:".72rem",color:"#3b82f6",marginBottom:4}}>Pack {gp2?.label} · {selectedLieu==="domicile"?"À domicile":"Au cabinet"}</div>
                    </div>
                  );
                })() : formuleGroupeCD ? (
                  <div style={{marginBottom:4}}>
                    <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:2}}>
                      <span style={{fontFamily:FD,fontSize:"1.7rem",color:"#059669"}}>{formuleGroupeCD.tarif.toLocaleString("fr-FR")} F</span>
                      <span style={{fontSize:".8rem",color:"#64748b"}}>/mois</span>
                    </div>
                    <div style={{fontSize:".72rem",color:"#059669"}}>Formule {formuleGroupeCD.label}{formuleGroupeCD.frequence?` · ${formuleGroupeCD.frequence}`:""}</div>
                  </div>
                ) : (
                  <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:4}}>
                    <span style={{fontFamily:FD,fontSize:"1.7rem",color:"#ff2945"}}>{selectedFormat.price}</span>
                    {selectedFormat.duration&&<span style={{fontSize:".8rem",color:"#64748b"}}>· {selectedFormat.duration}</span>}
                  </div>
                )}
                {selectedFormat.details&&<ul style={{fontSize:".78rem",color:"#64748b",lineHeight:1.5,margin:0,padding:"0 0 0 16px"}}>{selectedFormat.details.split("\n").map(s=>s.trim()).filter(Boolean).map((line,li)=><li key={li}>{line}</li>)}</ul>}
              </div>
            ) : (
              <div style={{padding:"14px 18px",borderBottom:"1px solid #f1f5f9",textAlign:"center",color:"#94a3b8",fontSize:".82rem",lineHeight:1.5}}>
                Cliquez sur une offre dans l'onglet<br/><strong style={{color:"#64748b"}}>"Formules & Tarifs"</strong> pour la sélectionner
              </div>
            )}
            <button className="course-detail-btn-enroll" style={{...S.btnEnroll,opacity:selectedFormat?1:.55,pointerEvents:selectedFormat?"auto":"none"}} onMouseEnter={e=>e.currentTarget.style.background="#b91c1c"} onMouseLeave={e=>e.currentTarget.style.background="#ff2945"} onClick={()=>{ if(!selectedFormat) return; if(sbUser) fetchAndPrefillProfile(sbUser); setModalOpen(true); }}>
              {selectedFormat ? (selectedFormat.type_coaching==="prive" ? `✍️ S'inscrire - ${(grillePriveEff[selectedPack||"classique"]?.[selectedLieu==="domicile"?"domicile":selectedLieu==="en_ligne"?"en_ligne":"cabinet"]||0).toLocaleString("fr-FR")} F/mois` : `✍️ S'inscrire - ${formuleGroupeCD ? `${formuleGroupeCD.tarif.toLocaleString("fr-FR")} F/mois` : selectedFormat.price}`) : "Choisissez d'abord une formule"}
            </button>
            <p style={{textAlign:"center",fontSize:".76rem",color:"#64748b",padding:"0 18px 14px",margin:0}}>✓ Garantie satisfait ou remboursé 30 jours</p>
            <div style={{padding:"14px 18px",borderTop:"1px solid #f1f5f9"}}>
              <p style={{fontWeight:700,fontSize:".82rem",color:"#011451",margin:"0 0 10px"}}>Ce cours comprend :</p>
              {course.includes?.map((inc,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><span>{inc.icon}</span><span style={{fontSize:".82rem",color:"#475569"}}>{inc.label}</span></div>)}
            </div>

            {/* ── WhatsApp assistantes commerciales (en-ligne) ── */}
            {type==="en-ligne"&&(
              <div style={{padding:"14px 18px",borderTop:"1px solid #f1f5f9"}}>
                <p style={{fontWeight:700,fontSize:".82rem",color:"#011451",margin:"0 0 4px"}}>
                  💬 Une question ? Écrivez-nous
                </p>
                <p style={{fontSize:".74rem",color:"#64748b",margin:"0 0 12px",lineHeight:1.4}}>
                  Une assistante commerciale vous répond sur WhatsApp
                </p>
                {loadingEnLigneAssistantes?(
                  <div style={{textAlign:"center",padding:"14px 0",color:"#64748b",fontSize:".78rem"}}>
                    <div style={{width:22,height:22,border:"3px solid #e2e8f0",borderTopColor:"#25d366",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 8px"}}/>
                    Chargement…
                  </div>
                ):enLigneAssistantes.length===0?(
                  <p style={{fontSize:".76rem",color:"#94a3b8",textAlign:"center",margin:0,fontStyle:"italic"}}>
                    😔 Aucune assistante disponible pour le moment.
                  </p>
                ):(
                  enLigneAssistantes.map((a,i)=>{
                    const phoneRaw=(a.telephone||"").replace(/[\s+\-()]/g,"");
                    const waMsg=encodeURIComponent(`Bonjour ${a.prenom||""}${a.nom?" "+a.nom:""}, je souhaite avoir des informations sur les cours d'anglais en ligne chez BET.`);
                    const ini=`${a.prenom?.[0]||""}${a.nom?.[0]||""}`.toUpperCase()||"A";
                    return(
                      <a key={a.id||i}
                        href={phoneRaw?`https://wa.me/${phoneRaw}?text=${waMsg}`:"#"}
                        target={phoneRaw?"_blank":undefined} rel="noopener noreferrer"
                        style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:"#f0fdf4",border:"1px solid #86efac",borderRadius:12,textDecoration:"none",marginBottom:8,transition:"background .15s",...(!phoneRaw?{opacity:.5,pointerEvents:"none"}:{})}}
                        onMouseEnter={e=>e.currentTarget.style.background="#dcfce7"}
                        onMouseLeave={e=>e.currentTarget.style.background="#f0fdf4"}>
                        {/* Avatar */}
                        {a.photo_url
                          ?<img src={a.photo_url} alt={a.prenom} style={{width:40,height:40,borderRadius:"50%",objectFit:"cover",flexShrink:0}}/>
                          :<div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#0c33ac,#25d366)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:".88rem",flexShrink:0}}>{ini}</div>
                        }
                        {/* Infos */}
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:".84rem",color:"#011451"}}>{a.prenom} {a.nom}</div>
                          <div style={{fontSize:".72rem",color:"#64748b",marginTop:1}}>Assistante commerciale</div>
                        </div>
                        {/* Icône WhatsApp */}
                        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,flexShrink:0}}>
                          <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
                            <circle cx="16" cy="16" r="16" fill="#25d366"/>
                            <path d="M23.5 19.9c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2c-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.9-1.6.1-.2 0-.4-.1-.5-.1-.2-.7-1.8-1-2.4-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1.1 1.1-1.1 2.6s1.1 3 1.3 3.2c.2.2 2.2 3.4 5.3 4.7 2 .9 2.7.9 3.7.8.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3z" fill="#fff"/>
                          </svg>
                          <span style={{fontSize:".62rem",color:"#22c55e",fontWeight:700}}>WhatsApp</span>
                        </div>
                      </a>
                    );
                  })
                )}
                {enLigneAssistantes.length>0&&(
                  <p style={{fontSize:".68rem",color:"#94a3b8",margin:"6px 0 0",fontStyle:"italic",lineHeight:1.4}}>
                    💬 Message pré-rempli : « Bonjour, je souhaite avoir des informations sur les cours en ligne BET. »
                  </p>
                )}
              </div>
            )}
          </div>
          )}
        </aside>
      </div>

      {/* ── MODAL SÉLECTEUR DE FORMULE ───────────────────────────────────────
          Le sélecteur vivait en bas de l'onglet « Formules & Tarifs » et le clic sur une
          offre y faisait descendre la page ; il fallait ensuite remonter pour s'inscrire.
          Il s'ouvre ici sur place. Fermeture par les boutons uniquement : un clic à côté
          ferait perdre la formule tout juste choisie. */}
      {selecteurOuvert && selectedFormat && (
        <div className="modal-overlay-mq" style={S.overlayBg}>
          <div style={{...S.payModal,maxWidth:680,padding:0,display:"flex",flexDirection:"column",maxHeight:"90vh"}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:"18px 24px 14px",borderBottom:"1px solid #f1f5f9",flexShrink:0}}>
              <div style={{fontSize:".68rem",fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".07em",marginBottom:4}}>Offre sélectionnée</div>
              <div style={{fontSize:"1.05rem",fontWeight:800,color:"#011451"}}>{course.title} - {selectedFormat.name}</div>
            </div>
            <div style={{padding:"18px 24px",overflowY:"auto",flex:1}}>
              {renderSelecteurFormule()}
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",alignItems:"center",padding:"14px 24px",borderTop:"1px solid #f1f5f9",background:"#fafafa",flexShrink:0,flexWrap:"wrap"}}>
              {prixRefCD>0 && (
                <div style={{marginRight:"auto",fontSize:".82rem",color:"#64748b",fontWeight:700}}>
                  Total : <span style={{color:"#0f172a",fontWeight:900}}>{prixRefCD.toLocaleString("fr-FR")} FCFA</span> / mois
                </div>
              )}
              <button type="button" onClick={()=>setSelecteurOuvert(false)}
                style={{padding:"10px 18px",background:"#f1f5f9",border:"none",borderRadius:999,cursor:"pointer",fontWeight:700,fontSize:".84rem",color:"#374151"}}>
                Fermer
              </button>
              {/* Côté groupe, rien n'est présélectionné : valider sans formule ramènerait au
                  prix générique de l'offre, donc on l'interdit. Le privé a toujours un pack. */}
              <button type="button" disabled={estGroupeCD && formulesGroupeCD.length>0 && !formuleGroupeCD}
                onClick={()=>{
                  setSelecteurOuvert(false);
                  if(window.innerWidth<=900){
                    setTimeout(()=>sidebarRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),80);
                  }
                }}
                style={{padding:"10px 22px",border:"none",borderRadius:999,fontWeight:800,fontSize:".84rem",
                  background:(estGroupeCD && formulesGroupeCD.length>0 && !formuleGroupeCD)?"#e2e8f0":"#ff2945",
                  color:(estGroupeCD && formulesGroupeCD.length>0 && !formuleGroupeCD)?"#94a3b8":"#fff",
                  cursor:(estGroupeCD && formulesGroupeCD.length>0 && !formuleGroupeCD)?"not-allowed":"pointer"}}>
                {(estGroupeCD && formulesGroupeCD.length>0 && !formuleGroupeCD) ? "Choisissez une formule" : "Valider ma formule →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL */}
      {modalOpen&&(
        <div className="modal-overlay-mq" style={S.overlayBg} onClick={()=>{setModalOpen(false);setCodePromo("");setCodePromoApplied(null);setCodePromoError("");}}>
          <div style={sbUser&&!successMsg&&!assistanteChoisie?{...S.payModal,maxWidth:760}:{...S.payModal,maxWidth:640}} onClick={e=>e.stopPropagation()}>
            <button style={S.payClose} onClick={()=>{setModalOpen(false);setCodePromo("");setCodePromoApplied(null);setCodePromoError("");}}>✕</button>
            {/* ── Auth gate ── */}
            {!sbUser?(
              <div style={{textAlign:"center",padding:"20px 0 10px"}}>
                <div style={{fontSize:"3rem",marginBottom:12}}>🔐</div>
                <h3 style={{fontSize:"1.2rem",fontWeight:800,margin:"0 0 8px",color:"#011451"}}>Connexion requise</h3>
                <p style={{color:"#64748b",fontSize:".9rem",margin:"0 0 6px"}}>Vous devez être connecté pour finaliser votre inscription.</p>
                {selectedFormat&&(
                  <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:"10px 14px",margin:"14px 0",textAlign:"left"}}>
                    <div style={{fontSize:".78rem",color:"#64748b",marginBottom:4}}>Offre sélectionnée</div>
                    <div style={{fontWeight:700,fontSize:".95rem",color:"#011451",marginBottom:2}}>{course.title} - {selectedFormat.name}</div>
                    {selectedFormat.duration&&<div style={{fontSize:".76rem",color:"#475569",marginBottom:4}}>{selectedFormat.duration}</div>}
                    <div style={{fontFamily:FD,fontSize:"1.2rem",color:"#ff2945"}}>
                      {selectedFormat.type_coaching==="prive"
                        ? `${(grillePriveEff[selectedPack||"classique"]?.[selectedLieu==="domicile"?"domicile":selectedLieu==="en_ligne"?"en_ligne":"cabinet"]||0).toLocaleString("fr-FR")} FCFA/mois`
                        : formuleGroupeCD
                        ? `${formuleGroupeCD.tarif.toLocaleString("fr-FR")} FCFA/mois`
                        : selectedFormat.price}
                    </div>
                  </div>
                )}
                <button onClick={()=>window.dispatchEvent(new CustomEvent("bet:openLoginModal",{detail:{returnUrl:window.location.pathname+window.location.search,context:{type:"course",selectedFormat}}}))}
                  style={{width:"100%",padding:"13px",background:"#ff2945",color:"#fff",border:"none",borderRadius:999,fontWeight:800,fontSize:".95rem",cursor:"pointer",margin:"4px 0 10px"}}>
                  🔑 Se connecter / S'inscrire
                </button>
                <p style={{fontSize:".74rem",color:"#94a3b8",margin:0}}>Votre sélection sera conservée à votre retour.</p>
              </div>
            ):successMsg?(
              <div style={{textAlign:"center",padding:"20px 0"}}>
                <div style={{fontSize:"3rem",marginBottom:16}}>🎉</div>
                <h3 style={{fontSize:"1.3rem",fontWeight:800,margin:"0 0 8px"}}>Inscription confirmée !</h3>
                <p style={{color:"#64748b",fontSize:".9rem"}}>Votre coach vous contactera sous 24h.</p>
              </div>
            ):!assistanteChoisie?(
              <div>
                <h2 style={S.payTitle}>Choisissez votre assistante</h2>
                <p style={{color:"#64748b",fontSize:".84rem",margin:"0 0 16px"}}>Elle vous accompagnera tout au long de votre inscription - même si le paiement ne passe pas du premier coup, elle reste votre contact.</p>
                {loadingAssistantesPaiement?(
                  <div style={{textAlign:"center",padding:"30px 0",color:"#94a3b8"}}>⏳ Chargement…</div>
                ):assistantesPaiement.length===0?(
                  <div style={{textAlign:"center",padding:"24px 16px",background:"#f8fafc",borderRadius:10,border:"1.5px dashed #e2e8f0",fontSize:".84rem",color:"#64748b"}}>
                    Aucune assistante disponible pour le moment - contactez-nous directement.
                  </div>
                ):(
                  <div className="course-detail-assistant-grid" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,maxHeight:400,overflowY:"auto"}}>
                    {assistantesPaiement.map(a=>(
                      <div key={a.id} onClick={()=>setAssistanteChoisie(a)}
                        style={{border:"2px solid #e2e8f0",borderRadius:12,padding:"12px 10px",textAlign:"center",cursor:"pointer",transition:"all .15s",background:"#fff"}}>
                        <div className="course-detail-assistant-avatar" style={{width:56,height:56,borderRadius:"50%",margin:"0 auto 8px",background:"linear-gradient(135deg,#011451,#0c33ac)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:".9rem",overflow:"hidden"}}>
                          {a.photo_url?<img src={a.photo_url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:`${a.prenom?.[0]||""}${a.nom?.[0]||""}`.toUpperCase()}
                        </div>
                        <div style={{fontWeight:700,fontSize:".9rem",color:"#011451"}}>{a.prenom} {a.nom}</div>
                        {a.telephone&&<div style={{fontSize:".72rem",color:"#94a3b8",marginTop:2}}>📞 {a.telephone}</div>}
                        {a.email&&<div style={{fontSize:".68rem",color:"#94a3b8",marginTop:2,wordBreak:"break-all"}}>✉️ {a.email}</div>}
                        {Array.isArray(a.jours_travail)&&a.jours_travail.length>0&&(
                          <div style={{fontSize:".68rem",color:"#0891b2",marginTop:4,fontWeight:600}}>📅 {formatJoursTravail(a.jours_travail)}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ):(
              <>
                {/* Assistante choisie */}
                <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,padding:"8px 12px",display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <span style={{fontSize:"1rem"}}>👤</span>
                  <span style={{fontSize:".8rem",color:"#1d4ed8",fontWeight:600,flex:1}}>Assistante : <strong>{assistanteChoisie.prenom} {assistanteChoisie.nom}</strong></span>
                  <button onClick={()=>setAssistanteChoisie(null)} style={{background:"none",border:"none",color:"#3b82f6",fontSize:".74rem",fontWeight:700,cursor:"pointer"}}>Changer</button>
                </div>
                {/* Bandeau profil connecté */}
                <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"8px 12px",display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                  <span style={{fontSize:"1rem"}}>✅</span>
                  <span style={{fontSize:".8rem",color:"#166534",fontWeight:600}}>Connecté en tant que <strong>{sbUser.user_metadata?.full_name||sbUser.email}</strong></span>
                </div>
                <h2 style={S.payTitle}>Finaliser votre inscription</h2>
                {/* ── Récap offre ── */}
                {selectedFormat && (()=>{
                  const isPrivé = selectedFormat.type_coaching === "prive";
                  const gp = isPrivé ? grillePriveEff[selectedPack||"classique"] : null;
                  return (
                    <div style={{background:"linear-gradient(135deg,#f8faff,#eff6ff)",border:"1.5px solid #bfdbfe",borderRadius:14,padding:"16px 18px",marginBottom:20}}>
                      {/* En-tête formation */}
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,paddingBottom:12,borderBottom:"1px solid #dbeafe"}}>
                        <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#0c33ac,#011451)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem",flexShrink:0}}>
                          {type==="en-ligne"?"💻":type==="domicile"?"🏠":"🏫"}
                        </div>
                        <div>
                          <div style={{fontSize:".7rem",color:"#64748b",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em"}}>Formation</div>
                          <div style={{fontWeight:800,fontSize:".92rem",color:"#011451",lineHeight:1.2}}>{course.title}</div>
                        </div>
                      </div>
                      {/* Formule */}
                      <div style={{marginBottom:10}}>
                        <div style={{fontSize:".7rem",color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Formule choisie</div>
                        <div style={{fontWeight:800,fontSize:".95rem",color:"#011451"}}>{selectedFormat.name}</div>
                        {selectedFormat.duration&&<div style={{fontSize:".78rem",color:"#475569",marginTop:1}}>⏱ Durée : {selectedFormat.duration}</div>}
                        {selectedFormat.details&&<ul style={{fontSize:".78rem",color:"#64748b",marginTop:4,marginBottom:0,lineHeight:1.5,padding:"0 0 0 16px"}}>{selectedFormat.details.split("\n").map(s=>s.trim()).filter(Boolean).map((line,li)=><li key={li}>{line}</li>)}</ul>}
                      </div>
                      {/* Détails coaching privé */}
                      {isPrivé && gp && (
                        <div style={{background:"#eff6ff",borderRadius:10,padding:"10px 12px",marginBottom:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                          <div>
                            <div style={{fontSize:".65rem",color:"#3b82f6",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Pack</div>
                            <div style={{fontWeight:800,fontSize:".82rem",color:"#0c33ac"}}>{gp.label}</div>
                            <div style={{fontSize:".7rem",color:"#64748b",marginTop:1}}>{gp.frequence}</div>
                          </div>
                          <div>
                            <div style={{fontSize:".65rem",color:"#3b82f6",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Lieu</div>
                            <div style={{fontWeight:800,fontSize:".82rem",color:"#0c33ac"}}>{selectedLieu==="domicile"?"🏠 À domicile":selectedLieu==="en_ligne"?"💻 En ligne":"🏢 Au cabinet"}</div>
                          </div>
                        </div>
                      )}
                      {/* Brochure */}
                      {selectedFormat.brochure_url && (
                        <a href={selectedFormat.brochure_url} download={selectedFormat.brochure_nom||true} target="_blank" rel="noopener noreferrer"
                          style={{display:"flex",alignItems:"center",gap:6,background:"#fff",border:"1px solid #bfdbfe",borderRadius:8,padding:"7px 10px",textDecoration:"none",marginBottom:10}}>
                          <span>📄</span>
                          <span style={{fontSize:".76rem",fontWeight:700,color:"#0891b2",flex:1}}>{selectedFormat.brochure_nom||"Télécharger la brochure"}</span>
                          <span style={{fontSize:".65rem",fontWeight:700,color:"#94a3b8",background:"#f1f5f9",borderRadius:4,padding:"2px 6px"}}>PDF</span>
                        </a>
                      )}
                      {/* Détail de la formule de groupe retenue - sans ce rappel, le client
                          arrivait au paiement sans revoir ce qu'il avait choisi. */}
                      {!isPrivé && formuleGroupeCD && (
                        <div style={{background:"#f0fdf4",borderRadius:10,padding:"10px 12px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
                          <div>
                            <div style={{fontSize:".65rem",color:"#059669",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Formule</div>
                            <div style={{fontWeight:800,fontSize:".82rem",color:"#065f46"}}>{formuleGroupeCD.label}</div>
                            {formuleGroupeCD.frequence && <div style={{fontSize:".7rem",color:"#64748b",marginTop:1}}>{formuleGroupeCD.frequence}</div>}
                          </div>
                          <span style={{fontWeight:800,fontSize:".82rem",color:"#059669",whiteSpace:"nowrap"}}>{formuleGroupeCD.tarif.toLocaleString("fr-FR")} F / mois</span>
                        </div>
                      )}
                      {/* Prix - fondé sur prixRefCD, le même montant que celui envoyé à
                          TouchPoint. Il lisait auparavant `selectedFormat.price`, donc le
                          prix d'appel de la carte quelle que soit la formule choisie. */}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"linear-gradient(135deg,#0c33ac,#011451)",borderRadius:10,padding:"12px 14px"}}>
                        <div style={{fontSize:".76rem",color:"rgba(255,255,255,.75)",fontWeight:600}}>Montant {(isPrivé||formuleGroupeCD)?"mensuel":"total"}</div>
                        <div style={{textAlign:"right"}}>
                          {codePromoApplied && (
                            <span style={{fontFamily:FD,fontSize:".82rem",color:"rgba(255,255,255,.55)",textDecoration:"line-through",marginRight:8}}>
                              {prixRefCD ? `${prixRefCD.toLocaleString("fr-FR")} FCFA` : selectedFormat.price}
                            </span>
                          )}
                          <span style={{fontFamily:FD,fontSize:"1.4rem",color:"#fff",fontWeight:900}}>
                            {prixRefCD
                              ? `${(codePromoApplied ? calcMontantReduit(prixRefCD, codePromoApplied) : prixRefCD).toLocaleString("fr-FR")} FCFA`
                              : selectedFormat.price}
                          </span>
                          {(isPrivé||formuleGroupeCD) && <div style={{fontSize:".65rem",color:"rgba(255,255,255,.65)"}}>/mois</div>}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                  <div><p style={S.payLabel}>Nom complet *</p><input style={S.payInput} value={inscForm.nom} onChange={e=>setInscForm(p=>({...p,nom:e.target.value}))} placeholder="Jean Kouamé"/></div>
                  <div><p style={S.payLabel}>Email *</p><input style={S.payInput} type="email" value={inscForm.email} onChange={e=>setInscForm(p=>({...p,email:e.target.value}))} placeholder="jean@exemple.com"/></div>
                </div>
                <div style={{marginBottom:20}}><p style={S.payLabel}>Téléphone *</p><input style={S.payInput} type="tel" value={inscForm.tel} onChange={e=>setInscForm(p=>({...p,tel:e.target.value}))} placeholder="+225 07 00 00 00 00"/></div>
                {/* Code promo */}
                <div style={{marginBottom:20}}>
                  <p style={S.payLabel}>🏷️ Code promo <span style={{fontWeight:400,color:"#94a3b8"}}>(optionnel)</span></p>
                  {codePromoApplied?(
                    <div style={{display:"flex",alignItems:"center",gap:10,background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:10,padding:"10px 14px"}}>
                      <span>✅</span>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:800,fontSize:".82rem",color:"#166534"}}>{codePromoApplied.code} appliqué !</div>
                        <div style={{fontSize:".72rem",color:"#166534"}}>Réduction : {codePromoApplied.type_reduction==="pourcentage"?`-${codePromoApplied.valeur}%`:`-${Number(codePromoApplied.valeur).toLocaleString("fr-FR")} FCFA`}{codePromoApplied.description&&` · ${codePromoApplied.description}`}</div>
                      </div>
                      <button onClick={()=>{setCodePromoApplied(null);setCodePromo("");setCodePromoError("");}} style={{background:"none",border:"none",cursor:"pointer",color:"#9ca3af",fontSize:16,padding:0}}>✕</button>
                    </div>
                  ):(
                    <div style={{display:"flex",gap:8}}>
                      <input value={codePromo} onChange={e=>{setCodePromo(e.target.value.toUpperCase());setCodePromoError("");}}
                        onKeyDown={e=>e.key==="Enter"&&validerCodePromo()}
                        placeholder="Ex : BET2025"
                        style={{flex:1,...S.payInput,fontFamily:"monospace",letterSpacing:1,border:`1.5px solid ${codePromoError?"#ff2945":"#e2e8f0"}`}} />
                      <button onClick={()=>validerCodePromo()} disabled={!codePromo.trim()||codePromoLoading}
                        style={{padding:"0 16px",background:"#ff2945",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:".8rem",opacity:(!codePromo.trim()||codePromoLoading)?.5:1,whiteSpace:"nowrap"}}>
                        {codePromoLoading?"⏳":"Appliquer"}
                      </button>
                    </div>
                  )}
                  {codePromoError&&<p style={{margin:"5px 0 0",fontSize:".72rem",color:"#ff2945"}}>{codePromoError}</p>}
                </div>
                <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"9px 12px",fontSize:".76rem",color:"#166534",fontWeight:600,marginBottom:16,textAlign:"center"}}>🔒 Vous serez redirigé(e) vers TouchPoint pour saisir vos informations de paiement en toute sécurité.</div>
                {inscErreur&&<p style={{color:"#ff2945",fontSize:".82rem",textAlign:"center",margin:"0 0 10px"}}>{inscErreur}</p>}
                {/* Le montant du bouton vient de prixRefCD, comme le récapitulatif et comme
                    TouchPoint : trois chiffres identiques au lieu de deux sources. */}
                <button style={{...S.payConfirmBtn,opacity:inscLoading?.7:1}} onClick={handlePay} disabled={inscLoading} onMouseEnter={e=>e.currentTarget.style.opacity=".9"} onMouseLeave={e=>e.currentTarget.style.opacity=inscLoading?"1":".9"}>{(() => {
                  if (inscLoading) return "Envoi en cours...";
                  const du = codePromoApplied ? calcMontantReduit(prixRefCD, codePromoApplied) : prixRefCD;
                  const mensuel = selectedFormat?.type_coaching==="prive" || !!formuleGroupeCD;
                  if (!du) return "Confirmer et payer "+(selectedFormat?.price||course.price);
                  return mensuel
                    ? `Confirmer mon inscription - ${du.toLocaleString("fr-FR")} FCFA/mois`
                    : `Confirmer et payer ${du.toLocaleString("fr-FR")} FCFA`;
                })()}</button>
                <p style={{textAlign:"center",fontSize:".75rem",color:"#94a3b8",marginTop:10}}>✓ Remboursement 30 jours · ✓ Accès immédiat · ✓ Sans engagement</p>
              </>
            )}
          </div>
        </div>
      )}
      {/* MODAL DEVIS */}
      {devisOpen&&(
        <div className="modal-overlay-mq" style={S.overlayBg} onClick={()=>setDevisOpen(false)}>
          <div style={{...S.payModal,maxWidth:520}} onClick={e=>e.stopPropagation()}>
            <button style={S.payClose} onClick={()=>setDevisOpen(false)}>✕</button>
            {devisSuccess?(
              <div style={{textAlign:"center",padding:"24px 0"}}>
                <div style={{fontSize:"3rem",marginBottom:16}}>📩</div>
                <h3 style={{fontSize:"1.3rem",fontWeight:800,margin:"0 0 8px",fontFamily:FD}}>Demande envoyée !</h3>
                <p style={{color:"#64748b",fontSize:".9rem",lineHeight:1.6}}>Notre équipe commerciale vous contactera sous 24h avec un devis personnalisé.</p>
              </div>
            ):devisAuthGate?(
              <div>
                <h2 style={{fontSize:"1.1rem",fontWeight:800,margin:"0 0 6px",fontFamily:FD}}>Connexion requise</h2>
                <p style={{color:"#64748b",fontSize:".82rem",marginBottom:14,lineHeight:1.6}}>Connectez-vous pour pré-remplir votre demande automatiquement. Votre sélection est conservée.</p>
                <div style={{display:"flex",borderRadius:10,overflow:"hidden",border:"1.5px solid #e2e8f0",marginBottom:14}}>
                  {[["login","Se connecter"],["register","Créer un compte"]].map(([t,l])=>(
                    <button key={t} onClick={()=>setDevisAuthTab(t)} style={{flex:1,padding:"9px 0",border:"none",fontWeight:700,fontSize:".82rem",cursor:"pointer",background:devisAuthTab===t?"#0c33ac":"#fff",color:devisAuthTab===t?"#fff":"#374151"}}>{l}</button>
                  ))}
                </div>
                {devisAuthTab==="login"?(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <input type="email" placeholder="Email *" value={devisAuthForm.email} onChange={e=>setDevisAuthForm(p=>({...p,email:e.target.value}))} style={{padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:".84rem",outline:"none",width:"100%",boxSizing:"border-box"}}/>
                    <input type="password" placeholder="Mot de passe *" value={devisAuthForm.password} onChange={e=>setDevisAuthForm(p=>({...p,password:e.target.value}))} style={{padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:".84rem",outline:"none",width:"100%",boxSizing:"border-box"}}/>
                  </div>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <input placeholder="Prénom *" value={devisAuthForm.prenom} onChange={e=>setDevisAuthForm(p=>({...p,prenom:e.target.value}))} style={{padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:".84rem",outline:"none",width:"100%",boxSizing:"border-box"}}/>
                      <input placeholder="Nom *" value={devisAuthForm.nom} onChange={e=>setDevisAuthForm(p=>({...p,nom:e.target.value}))} style={{padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:".84rem",outline:"none",width:"100%",boxSizing:"border-box"}}/>
                    </div>
                    <input type="email" placeholder="Email *" value={devisAuthForm.email} onChange={e=>setDevisAuthForm(p=>({...p,email:e.target.value}))} style={{padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:".84rem",outline:"none",width:"100%",boxSizing:"border-box"}}/>
                    <input placeholder="Téléphone" value={devisAuthForm.telephone} onChange={e=>setDevisAuthForm(p=>({...p,telephone:e.target.value}))} style={{padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:".84rem",outline:"none",width:"100%",boxSizing:"border-box"}}/>
                    <input type="password" placeholder="Mot de passe *" value={devisAuthForm.password} onChange={e=>setDevisAuthForm(p=>({...p,password:e.target.value}))} style={{padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:".84rem",outline:"none",width:"100%",boxSizing:"border-box"}}/>
                  </div>
                )}
                {devisAuthErr&&<p style={{fontSize:".78rem",margin:"8px 0 0",color:"#ff2945",textAlign:"center"}}>{devisAuthErr}</p>}
                <button onClick={devisAuthTab==="login"?handleDevisAuthLogin:handleDevisAuthRegister} disabled={devisAuthLoad}
                  style={{width:"100%",marginTop:14,padding:"12px",background:"#0c33ac",color:"#fff",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",opacity:devisAuthLoad?.7:1,fontSize:".88rem"}}>
                  {devisAuthLoad?"Chargement…":devisAuthTab==="login"?"Se connecter →":"Créer mon compte →"}
                </button>
                <button onClick={()=>{setDevisOpen(false);setDevisAuthGate(false);}}
                  style={{width:"100%",marginTop:8,padding:"9px",background:"transparent",color:"#64748b",border:"1.5px solid #e2e8f0",borderRadius:8,fontWeight:600,fontSize:".8rem",cursor:"pointer"}}>
                  ← Annuler
                </button>
              </div>
            ):(
              <>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
                  <div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#0c33ac,#0891b2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.2rem",flexShrink:0}}>📋</div>
                  <div>
                    <h2 style={{...S.payTitle,margin:0,fontSize:"1.2rem"}}>Demande de devis</h2>
                    <p style={{fontSize:".78rem",color:"#64748b",margin:0}}>{course.title}</p>
                  </div>
                </div>
                <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:"10px 14px",marginBottom:18,fontSize:".82rem",color:"#92400e",display:"flex",gap:9,alignItems:"flex-start"}}>
                  <span>🏢</span>
                  <div><strong>Réservé aux entreprises uniquement.</strong> Ce service est destiné aux structures souhaitant former leurs collaborateurs. Un devis personnalisé vous sera transmis sous 24h.</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <div>
                    <p style={S.payLabel}>Nom complet *</p>
                    <input style={S.payInput} placeholder="Jean Kouamé" value={devisForm.nom} onChange={e=>setDevisForm(p=>({...p,nom:e.target.value}))}/>
                  </div>
                  <div>
                    <p style={S.payLabel}>Email *</p>
                    <input style={S.payInput} placeholder="jean@entreprise.ci" type="email" value={devisForm.email} onChange={e=>setDevisForm(p=>({...p,email:e.target.value}))}/>
                  </div>
                  <div>
                    <p style={S.payLabel}>Téléphone *</p>
                    <input style={S.payInput} placeholder="07 00 00 00 00" value={devisForm.tel} onChange={e=>setDevisForm(p=>({...p,tel:e.target.value}))}/>
                  </div>
                  <div>
                    <p style={S.payLabel}>Entreprise / Organisation *</p>
                    <input style={S.payInput} placeholder="Nom de la structure" value={devisForm.entreprise} onChange={e=>setDevisForm(p=>({...p,entreprise:e.target.value}))}/>
                  </div>
                  <div>
                    <p style={S.payLabel}>Nombre de participants</p>
                    <select style={S.payInput} value={devisForm.participants} onChange={e=>setDevisForm(p=>({...p,participants:e.target.value}))}>
                      {["1","2","3-5","6-10","11-20","20+"].map(v=><option key={v} value={v}>{v} participant{v==="1"?"":"s"}</option>)}
                    </select>
                  </div>
                  <div style={{gridColumn:"span 2"}}>
                    <p style={S.payLabel}>Message / Besoins spécifiques</p>
                    <textarea style={{...S.payInput,height:80,resize:"vertical",paddingTop:10}} placeholder="Décrivez votre besoin, vos objectifs, ou posez vos questions..." value={devisForm.message} onChange={e=>setDevisForm(p=>({...p,message:e.target.value}))}/>
                  </div>
                </div>
                <button style={{...S.payConfirmBtn,background:"linear-gradient(135deg,#0c33ac,#0891b2)"}} onClick={handleDevis} onMouseEnter={e=>e.currentTarget.style.opacity=".9"} onMouseLeave={e=>e.currentTarget.style.opacity="1"} disabled={!devisForm.nom||!devisForm.email||!devisForm.tel||!devisForm.entreprise}>
                  Envoyer ma demande de devis →
                </button>
                <p style={{textAlign:"center",fontSize:".74rem",color:"#94a3b8",marginTop:10}}>✓ Réponse sous 24h · ✓ Sans engagement · ✓ Devis gratuit</p>
              </>
            )}
          </div>
        </div>
      )}
      <CataloguePdfBanner />
      <Footer/>
    </div>
  );
};

const FF = "'Montserrat','Segoe UI',sans-serif";
const FD = "'Montserrat','Segoe UI',sans-serif";
const S={
  page:        {fontFamily:FF,color:"#011451",background:"#fff",minHeight:"100vh"},
  hero:        {background:"linear-gradient(135deg,#011451 0%,#011451 55%,#0c33ac 100%)", padding:"52px 0 0", overflow:"hidden", position:"relative", minHeight:480, display:"flex", flexDirection:"column"},
  heroInner:   {maxWidth:1180,margin:"0 auto",padding:"0 24px",flex:1,display:"flex",flexDirection:"column",justifyContent:"center",paddingTop:28,paddingBottom:52},
  heroMain:    {maxWidth:760},
  breadcrumb:  {display:"flex",alignItems:"center",gap:8,marginBottom:20,fontSize:".82rem",flexWrap:"wrap"},
  bLink:       {color:"#93c5fd",cursor:"pointer",textDecoration:"underline"},
  bSep:        {color:"rgba(255,255,255,.3)"},
  heroTitle:   {fontFamily:FD,fontSize:"clamp(1.8rem,4vw,2.8rem)",color:"#fff",margin:"0 0 12px",fontWeight:400,lineHeight:1.15},
  heroSub:     {color:"rgba(255,255,255,.75)",fontSize:"1.05rem",margin:"0 0 18px",lineHeight:1.6},
  heroMeta:    {display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:12},
  heroBadge:   {background:"#ff2945",color:"#fff",borderRadius:4,padding:"2px 10px",fontSize:".72rem",fontWeight:800,letterSpacing:".05em"},
  heroRating:  {color:"#f59e0b",fontWeight:800,fontSize:".95rem"},
  heroRatingCount:{color:"#93c5fd",fontSize:".82rem",textDecoration:"underline"},
  heroDot:     {color:"rgba(255,255,255,.3)"},
  heroMetaTxt: {color:"rgba(255,255,255,.8)",fontSize:".86rem"},
  heroCreator: {color:"rgba(255,255,255,.7)",fontSize:".84rem",marginBottom:16},
  heroCreatorLink:{color:"#93c5fd",textDecoration:"underline",cursor:"pointer"},
  heroPills:   {display:"flex",flexWrap:"wrap",gap:8,marginTop:4},
  heroPill:    {background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",color:"rgba(255,255,255,.8)",borderRadius:6,padding:"4px 12px",fontSize:".78rem",fontWeight:500},
  tabsBar:     {background:"#fff",borderBottom:"1px solid #e2e8f0",position:"relative",zIndex:50},
  tabsSticky:  {position:"sticky",top:0,boxShadow:"0 2px 8px rgba(0,0,0,.06)"},
  tabsInner:   {maxWidth:1180,margin:"0 auto",padding:"0 24px",display:"flex",gap:0,overflowX:"auto"},
  tabBtn:      {background:"none",border:"none",borderBottom:"3px solid transparent",padding:"14px 20px",fontSize:".9rem",fontWeight:600,color:"#64748b",cursor:"pointer",whiteSpace:"nowrap",transition:"all .2s",fontFamily:FF},
  tabActive:   {color:"#ff2945",borderBottom:"3px solid #ff2945"},
  layout:      {maxWidth:1180,margin:"0 auto",padding:"36px 24px",display:"grid",gridTemplateColumns:"1fr 340px",gap:40,alignItems:"start"},
  contentCol:  {minWidth:0},
  section:     {marginBottom:40,paddingBottom:36,borderBottom:"1px solid #f1f5f9"},
  sH2:         {fontFamily:FD,fontSize:"1.4rem",fontWeight:400,margin:"0 0 20px",color:"#011451"},
  learnGrid:   {display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,background:"#fafafa",border:"1px solid #e2e8f0",borderRadius:12,padding:20},
  learnItem:   {display:"flex",alignItems:"flex-start",gap:10},
  learnCheck:  {color:"#0c33ac",fontWeight:800,marginTop:1,flexShrink:0},
  learnTxt:    {fontSize:".88rem",color:"#334155",lineHeight:1.5},
  includesGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},
  includeItem: {display:"flex",alignItems:"center",gap:10},
  plainList:   {listStyle:"none",padding:0,margin:0,display:"flex",flexDirection:"column",gap:10},
  plainLi:     {fontSize:".92rem",color:"#334155",lineHeight:1.6},
  descP:       {fontSize:".95rem",color:"#475569",lineHeight:1.75,margin:"0 0 16px"},
  advDot:      {width:22,height:22,borderRadius:"50%",background:"linear-gradient(135deg,#ff2945,#0c33ac)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".7rem",fontWeight:800,flexShrink:0},
  currMeta:    {fontSize:".86rem",color:"#64748b",margin:"0 0 16px",display:"flex",alignItems:"center",gap:12},
  formatCard:  {borderRadius:16,padding:"24px 20px",border:"1.5px solid #e2e8f0",background:"#fff",cursor:"pointer",transition:"all .25s",position:"relative"},
  sidebar:     {position:"sticky",top:80,alignSelf:"start"},
  sideCard:    {background:"#fff",border:"1px solid #e2e8f0",borderRadius:16,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,.08)"},
  btnEnroll:   {display:"block",width:"calc(100% - 36px)",margin:"0 18px 10px",padding:"13px",background:"#ff2945",color:"#fff",border:"none",borderRadius:999,fontFamily:FF,fontWeight:800,fontSize:"1rem",cursor:"pointer",transition:"background .2s"},
  btnDevis:    {display:"block",width:"calc(100% - 36px)",margin:"0 18px 8px",padding:"12px",background:"transparent",color:"#0c33ac",border:"1.5px solid #0c33ac",borderRadius:999,fontFamily:FF,fontWeight:700,fontSize:".92rem",cursor:"pointer",transition:"all .2s"},
  overlayBg:   {position:"fixed",inset:0,background:"rgba(0,0,0,.65)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9000,padding:16,animation:"fadeIn .2s ease"},
  payModal:    {background:"#fff",borderRadius:20,width:"100%",maxWidth:540,maxHeight:"90vh",overflowY:"auto",padding:"28px",position:"relative",animation:"scaleIn .25s ease",boxShadow:"0 30px 80px rgba(0,0,0,.22)"},
  payClose:    {position:"absolute",top:14,right:14,background:"#f1f5f9",border:"none",width:28,height:28,borderRadius:"50%",cursor:"pointer",fontSize:".9rem",color:"#64748b",display:"flex",alignItems:"center",justifyContent:"center"},
  payTitle:    {fontFamily:FD,fontSize:"1.4rem",margin:"0 0 16px",fontWeight:400},
  payLabel:    {fontSize:".8rem",fontWeight:700,color:"#011451",margin:"0 0 6px"},
  payMethodBtn:{flex:1,padding:"10px",border:"1.5px solid #e2e8f0",borderRadius:10,background:"#fff",fontFamily:FF,fontWeight:700,fontSize:".86rem",cursor:"pointer",transition:"all .2s"},
  payMethodActive:{borderColor:"#ff2945",background:"#fff0f2",color:"#ff2945"},
  payInput:    {width:"100%",padding:"10px 14px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:".9rem",fontFamily:FF,outline:"none",marginBottom:14,boxSizing:"border-box"},
  payConfirmBtn:{width:"100%",padding:"13px",background:"linear-gradient(135deg,#ff2945,#0c33ac)",color:"#fff",border:"none",borderRadius:999,fontFamily:FF,fontWeight:800,fontSize:"1rem",cursor:"pointer",transition:"opacity .2s"},
};

export default CourseDetail;