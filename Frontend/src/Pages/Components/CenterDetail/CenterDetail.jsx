import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { centersData } from "../../../data/centersData";
import Footer from "../../Footer/Footer";
import { insertDemandeDevis } from "../../../services/formsService";
import SEO from "../SEO/SEO";

if (!document.querySelector("#cnd-fonts")) {
  const l=document.createElement("link");l.id="cnd-fonts";l.rel="stylesheet";
  l.href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700;800&display=swap";
  document.head.appendChild(l);
}
if (!document.querySelector("#cnd-kf")) {
  const s=document.createElement("style");s.id="cnd-kf";
  s.textContent=`@keyframes cnFU{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}@keyframes cnFI{from{opacity:0}to{opacity:1}}@keyframes cnSI{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}.cn-acc{animation:cnFU .25s ease}.cn-row:hover{background:#f8f9fa!important}`;
  document.head.appendChild(s);
}

const MOCK_CENTER={
  name:"Centre Angré",fullName:"Binnie's English Training - Angré 7ème Tranche",
  heroImage:"https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1600&q=80",
  address:"Angré 7ème Tranche, Immeuble Le Palace, 2ème étage, Abidjan",
  phone:"+225 07 00 00 00 00",email:"angre@binnies-english.ci",
  hours:"Lun–Ven : 08h–20h · Sam : 09h–17h · Dim : sur RDV",
  mapUrl:"https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3972.310376339353!2d-4.003492318927239!3d5.369546221617872!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xfc1eb492c36597d%3A0x93bb218604963c57!2sBET%20Binnie&#39;s%20English%20Training!5e0!3m2!1sfr!2sfr!4v1775952579458!5m2!1sfr!2sfr",
  description:"Le centre Angré est notre établissement phare à Abidjan. Avec 12 salles de formation modernes, une salle d'examen officielle et une équipe de 8 formateurs certifiés, il accueille chaque année plus de 800 apprenants.",
  capacity:120,coaches:8,successRate:96,founded:2018,
  facilities:["12 salles climatisées","Salle d'examen ETS officielle","Bibliothèque multimédia","WiFi haut débit","Parking sécurisé","Cafétéria","Salle de coworking","Accès PMR"],
  programs:["Cours intensifs en groupe","Cours particuliers","Préparation TOEIC","Préparation TOEFL iBT","Préparation IELTS Academic","Anglais des affaires","Anglais à domicile","Formation entreprise"],
  team:[
    {name:"Prof. Ama Kouassi",role:"Directrice pédagogique",cert:"CELTA · DELTA · MA Linguistics",av:"👩🏾‍🏫"},
    {name:"M. James Adou",role:"Formateur TOEIC senior",cert:"TOEIC 990 · CELTA",av:"👨🏿‍🏫"},
    {name:"Ms Sarah K.",role:"Formatrice native",cert:"Cambridge CELTA · M.Ed",av:"👩🏼‍🏫"},
  ],
  testimonials:[
    {av:"👩🏽‍💻",name:"Assia Traoré",role:"Développeuse, MTN CI",score:"TOEIC 820",rating:5,text:"Le centre Angré est exceptionnel. Les salles sont modernes et les profs vraiment compétents. J'ai obtenu 820 au TOEIC grâce à eux !"},
    {av:"👨🏾‍🎓",name:"Koffi Mensah",role:"Étudiant MBA, INPHB",score:"IELTS 7.0",rating:5,text:"Excellente formation IELTS. L'équipe est très disponible et les ressources de qualité. Je recommande à 100%."},
  ],
  faq:[
    {q:"Comment s'inscrire au centre Angré ?",a:"Vous pouvez vous inscrire directement au centre, par téléphone ou via notre formulaire en ligne. Un test de positionnement gratuit est réalisé avant toute inscription."},
    {q:"Les cours sont-ils adaptés aux débutants ?",a:"Absolument. Nous accueillons tous les niveaux, de A1 (grand débutant) à C2. Le test de positionnement initial nous permet de vous placer dans le groupe adapté."},
    {q:"Y a-t-il des cours du soir pour les actifs ?",a:"Oui ! Nous proposons des créneaux en soirée de 18h à 20h du lundi au vendredi, spécialement conçus pour les professionnels."},
  ],
};

const Stars=({r=5,size=13})=><span style={{display:"inline-flex",gap:1}}>{Array.from({length:5}).map((_,i)=><span key={i} style={{fontSize:size,color:i<Math.floor(r)?"#f59e0b":"#d1d5db"}}>★</span>)}</span>;

const FAQItem=({item})=>{
  const[open,setOpen]=useState(false);
  return(
    <div style={{border:`1.5px solid ${open?"#ff2945":"#e2e8f0"}`,borderRadius:10,overflow:"hidden",transition:"border-color .2s"}}>
      <button style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",background:"none",border:"none",fontFamily:FF,fontSize:".92rem",fontWeight:600,color:"#011451",cursor:"pointer",textAlign:"left",gap:12}} onClick={()=>setOpen(p=>!p)}>
        <span>{item.q}</span><span style={{fontSize:"1.3rem",color:"#ff2945",transition:"transform .2s",display:"inline-block",transform:open?"rotate(45deg)":"rotate(0)"}}>+</span>
      </button>
      {open&&<p className="cn-acc" style={{padding:"0 18px 14px",fontSize:".9rem",color:"#475569",lineHeight:1.7,margin:0}}>{item.a}</p>}
    </div>
  );
};

const CenterDetail=()=>{
  const{centerId}=useParams(); const navigate=useNavigate();
  const rawCenter=centersData?.[centerId?.toLowerCase()];
  const center=rawCenter?{...MOCK_CENTER,...rawCenter}:MOCK_CENTER;
  const[activeTab,setActiveTab]=useState("apercu");
  const[stickyBar,setStickyBar]=useState(false);
  const[modalOpen,setModalOpen]=useState(false);
  const[success,setSuccess]=useState(false);
  const[formData,setFormData]=useState({name:"",email:"",phone:"",societe:"",program:"",message:""});
  const[devisErreur,setDevisErreur]=useState("");
  const[devisLoading,setDevisLoading]=useState(false);
  const heroRef=useRef(null);

  useEffect(()=>{const h=()=>setStickyBar(window.scrollY>(heroRef.current?.offsetHeight||400)-80);window.addEventListener("scroll",h);return()=>window.removeEventListener("scroll",h);},[]);

  // Styles responsives injectés
  useEffect(() => {
    if (!document.querySelector("#cnd-responsive")) {
      const style = document.createElement("style");
      style.id = "cnd-responsive";
      style.textContent = `
        .center-detail-root { overflow-x: hidden; max-width: 100%; }
        @media (max-width: 900px) {
          .center-detail-layout { grid-template-columns: 1fr !important; gap: 32px !important; }
          .center-detail-sidebar { position: relative !important; top: 0 !important; width: 100% !important; margin-top: 20px; }
        }
        @media (max-width: 768px) {
          .center-detail-facilities-grid { grid-template-columns: 1fr !important; }
          .center-detail-team-grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)) !important; }
          .center-detail-programs-list { gap: 12px; }
          .center-detail-contact-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
          .center-detail-help-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
          .center-detail-hero-inner { padding: 0 16px !important; }
          .center-detail-hero-title { font-size: 1.8rem !important; }
          .center-detail-hero-stats { gap: 12px !important; flex-wrap: wrap; }
          .center-detail-hero-stats > div { padding-right: 12px !important; }
          .center-detail-tabs-inner { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .center-detail-tab-btn { padding: 10px 14px !important; font-size: 0.8rem !important; }
        }
        @media (max-width: 640px) {
          .center-detail-hero-title { font-size: 1.5rem !important; }
          .center-detail-side-card .info-row { flex-direction: column; align-items: flex-start; gap: 6px; }
        }
        @media (max-width: 480px) {
          .center-detail-btn-enroll, .center-detail-btn-quote { font-size: 0.85rem !important; }
          .center-detail-share-buttons { flex-direction: column; gap: 8px !important; }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  if(!center)return(
    <div style={{minHeight:"60vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <h2 style={{fontFamily:FD}}>Centre non trouvé</h2>
      <button onClick={()=>navigate("/")} style={{background:"#ff2945",color:"#fff",border:"none",borderRadius:999,padding:"10px 24px",fontFamily:FF,fontWeight:700,cursor:"pointer"}}>← Retour</button>
    </div>
  );

  const TABS=[{id:"apercu",label:"Aperçu"},{id:"equipe",label:"Notre équipe"},{id:"services",label:"Formations disponibles"},{id:"avis",label:`Avis (${center.testimonials?.length||0})`},{id:"faq",label:"FAQ"},{id:"contact",label:"Contact & Accès"}];
  const handleDevis=async()=>{
    if(!formData.name||!formData.email||!formData.phone||!formData.societe)return alert("Veuillez remplir votre nom, email, téléphone et le nom de votre entreprise.");
    setDevisLoading(true);setDevisErreur("");
    try{
      await insertDemandeDevis({
        nom:formData.name,
        email:formData.email,
        tel:formData.phone,
        message:[`Entreprise : ${formData.societe}`,formData.program&&`Formation : ${formData.program}`,formData.message].filter(Boolean).join(" - ")||null,
        source:"centre",
        source_nom:center.name,
      });
      setSuccess(true);
      setTimeout(()=>{setSuccess(false);setModalOpen(false);setFormData({name:"",email:"",phone:"",societe:"",program:"",message:""});},3000);
    }catch(e){
      setDevisErreur("Une erreur est survenue. Veuillez réessayer.");
    }finally{
      setDevisLoading(false);
    }
  };

  return(
    <div className="center-detail-root" style={S.page}>
      <SEO
        title={`Centre ${center.name} - Binnie's English Training | BET`}
        description={`Découvrez le centre BET ${center.name} : formations d'anglais en présentiel, formats et inscription.`}
        canonicalUrl={`/centre/${centerId}`}
      />

      {/* HERO */}
      <div ref={heroRef} style={{...S.hero,backgroundImage:`linear-gradient(135deg,rgba(10,20,40,.9) 0%,rgba(30,58,138,.65) 100%), url(${center.heroImage})`,backgroundSize:"cover",backgroundPosition:"center"}}>
        <div className="center-detail-hero-inner" style={S.heroInner}>
          <div style={S.breadcrumb}>
            <span style={S.bLink} onClick={()=>navigate("/")}>Accueil</span><span style={S.bSep}>/</span>
            <span style={S.bLink} onClick={()=>navigate(-1)}>Nos centres</span><span style={S.bSep}>/</span>
            <span style={{color:"#e2e8f0"}}>{center.name}</span>
          </div>
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
            <span style={S.tagBlue}>✅ CENTRE AGRÉÉ ÉTAT</span>
            <span style={S.tagRed}>🏆 CENTRE OFFICIEL ETS</span>
          </div>
          <h1 className="center-detail-hero-title" style={S.heroTitle}>{center.name}</h1>
          <p style={{color:"rgba(255,255,255,.6)",fontSize:".9rem",margin:"0 0 22px",fontStyle:"italic"}}>{center.fullName}</p>
          <div className="center-detail-hero-stats" style={S.heroStats}>
            {[{num:`${center.capacity}+`,lbl:"Apprenants/an"},{num:center.coaches,lbl:"Formateurs certifiés"},{num:`${center.successRate}%`,lbl:"Taux de réussite"},{num:`Depuis ${center.founded}`,lbl:"Ouvert"}].map((st,i)=>(
              <React.Fragment key={i}>
                <div style={{display:"flex",flexDirection:"column",padding:"0 24px 0 0"}}>
                  <strong style={{fontFamily:FD,fontSize:"1.8rem",color:"#fff",lineHeight:1}}>{st.num}</strong>
                  <span style={{fontSize:".72rem",color:"rgba(255,255,255,.55)",fontWeight:600,textTransform:"uppercase",letterSpacing:".05em",marginTop:3}}>{st.lbl}</span>
                </div>
                {i<3&&<div style={{width:1,height:36,background:"rgba(255,255,255,.2)",margin:"0 24px 0 0"}}/>}
              </React.Fragment>
            ))}
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {[`📍 ${center.address?.split(",")[0]}`,`🕐 ${center.hours?.split("·")[0]?.trim()}`,`📞 ${center.phone}`].map((t,i)=><span key={i} style={S.heroPill}>{t}</span>)}
          </div>
        </div>
      </div>

      {/* TABS */}
      <div style={{...S.tabsBar,...(stickyBar?S.tabsSticky:{})}}>
        <div className="center-detail-tabs-inner" style={S.tabsInner}>
          {TABS.map(t=><button key={t.id} className="center-detail-tab-btn" style={{...S.tabBtn,...(activeTab===t.id?S.tabActive:{})}} onClick={()=>setActiveTab(t.id)}>{t.label}</button>)}
        </div>
      </div>

      <div className="center-detail-layout" style={S.layout}>
        <div style={S.contentCol}>

          {activeTab==="apercu"&&(
            <div style={{animation:"cnFU .4s ease"}}>
              <section style={S.section}>
                <h2 style={S.sH2}>À propos du centre</h2>
                <p style={S.descP}>{center.description}</p>
              </section>
              <section style={S.section}>
                <h2 style={S.sH2}>Équipements & services</h2>
                <div className="center-detail-facilities-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
                  {center.facilities?.map((f,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,background:"#fff0f2",border:"1px solid #ffb3bc",borderRadius:10,padding:"11px 14px"}}>
                      <span style={{color:"#ff2945",fontWeight:800,fontSize:"1rem",flexShrink:0}}>✓</span>
                      <span style={{fontSize:".9rem",color:"#334155"}}>{f}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section style={S.section}>
                <h2 style={S.sH2}>Vous avez des questions ?</h2>
                <div className="center-detail-help-grid" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:18}}>
                  {[
                    {ico:"🎧",title:"Assistance 7j/7",desc:"Notre équipe est disponible tous les jours pour répondre à vos questions.",btn:null},
                    {ico:"❓",title:"FAQ complète",desc:"Consultez nos réponses aux questions les plus fréquentes.",btn:{label:"Voir la FAQ",action:()=>setActiveTab("faq")}},
                    {ico:"📄",title:"Plaquette entreprise",desc:"Téléchargez notre brochure de présentation complète.",btn:{label:"Télécharger",action:()=>alert("Téléchargement...")}},
                  ].map((h,i)=>(
                    <div key={i} style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:14,padding:"22px 18px",display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",gap:8}}>
                      <div style={{fontSize:"2rem"}}>{h.ico}</div>
                      <h3 style={{fontFamily:FD,fontSize:"1.05rem",margin:0,fontWeight:400}}>{h.title}</h3>
                      <p style={{fontSize:".84rem",color:"#64748b",lineHeight:1.6,margin:0}}>{h.desc}</p>
                      {h.btn&&<button style={{marginTop:"auto",background:"transparent",color:"#0c33ac",border:"1.5px solid #0c33ac",borderRadius:999,padding:"7px 18px",fontSize:".82rem",fontWeight:700,cursor:"pointer",transition:"all .2s",fontFamily:FF}} onMouseEnter={e=>{e.currentTarget.style.background="#0c33ac";e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#0c33ac";}} onClick={h.btn.action}>{h.btn.label}</button>}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab==="equipe"&&(
            <div style={{animation:"cnFU .4s ease"}}>
              <section style={S.section}>
                <h2 style={S.sH2}>Notre équipe pédagogique</h2>
                <p style={S.subP}>Des formateurs certifiés, passionnés et expérimentés à votre service.</p>
                <div className="center-detail-team-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:18}}>
                  {center.team?.map((m,i)=>(
                    <div key={i} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,padding:"24px 18px",textAlign:"center",borderTop:`4px solid ${i%2===0?"#ff2945":"#0c33ac"}`}}>
                      <div style={{fontSize:"3rem",marginBottom:12,display:"block"}}>{m.av}</div>
                      <h3 style={{fontFamily:FD,fontSize:"1.1rem",margin:"0 0 4px",fontWeight:400,color:i%2===0?"#ff2945":"#0c33ac"}}>{m.name}</h3>
                      <p style={{fontSize:".82rem",color:"#64748b",margin:"0 0 10px"}}>{m.role}</p>
                      <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:999,padding:"4px 12px",fontSize:".72rem",fontWeight:700,color:"#475569"}}>{m.cert}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab==="services"&&(
            <div style={{animation:"cnFU .4s ease"}}>
              <section style={S.section}>
                <h2 style={S.sH2}>Formations disponibles à {center.name}</h2>
                <p style={S.subP}>Toutes nos formations sont éligibles au financement FDFP.</p>
                <div className="center-detail-programs-list" style={{display:"flex",flexDirection:"column",gap:10,marginBottom:28}}>
                  {center.programs?.map((p,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:14,background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"12px 16px",transition:"all .2s",cursor:"default",flexWrap:"wrap"}}>
                      <div style={{width:28,height:28,borderRadius:"50%",background:`linear-gradient(135deg,${i%2===0?"#ff2945":"#0c33ac"},#011451)`,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".76rem",fontWeight:800,flexShrink:0}}>{i+1}</div>
                      <p style={{margin:0,fontWeight:700,fontSize:".92rem",color:"#011451"}}>{p}</p>
                    </div>
                  ))}
                </div>
                <div style={{background:"linear-gradient(135deg,#011451,#0c33ac)",borderRadius:14,padding:"22px 26px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:20,flexWrap:"wrap"}}>
                  <div>
                    <p style={{margin:"0 0 4px",fontWeight:800,color:"#fff",fontSize:"1rem"}}>Prêt à commencer ?</p>
                    <p style={{margin:0,color:"rgba(255,255,255,.7)",fontSize:".86rem"}}>Test de niveau gratuit disponible sur place.</p>
                  </div>
                  <button style={{background:"#fff",color:"#011451",border:"none",borderRadius:999,padding:"11px 24px",fontFamily:FF,fontWeight:800,fontSize:".9rem",cursor:"pointer",transition:"background .2s",whiteSpace:"nowrap"}} onMouseEnter={e=>e.currentTarget.style.background="#f1f5f9"} onMouseLeave={e=>e.currentTarget.style.background="#fff"} onClick={()=>setModalOpen(true)}>Demander un devis →</button>
                </div>
              </section>
            </div>
          )}

          {activeTab==="avis"&&(
            <div style={{animation:"cnFU .4s ease"}}>
              <section style={S.section}>
                <h2 style={S.sH2}>Avis de nos apprenants</h2>
                <div style={{display:"flex",gap:32,alignItems:"center",background:"#fafafa",border:"1px solid #e2e8f0",borderRadius:12,padding:24,marginBottom:24,flexWrap:"wrap"}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,minWidth:90}}>
                    <div style={{fontFamily:FD,fontSize:"3rem",color:"#011451",lineHeight:1}}>4.9</div>
                    <Stars r={4.9} size={20}/><div style={{fontSize:".76rem",color:"#64748b",fontWeight:600,marginTop:4}}>Note globale</div>
                  </div>
                  <div style={{flex:1,display:"flex",flexDirection:"column",gap:8}}>
                    {[{s:5,p:92},{s:4,p:6},{s:3,p:1},{s:2,p:1},{s:1,p:0}].map((r,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{flex:1,height:8,background:"#e2e8f0",borderRadius:4,overflow:"hidden"}}><div style={{width:`${r.p}%`,height:"100%",background:"#f59e0b",borderRadius:4}}/></div>
                        <Stars r={r.s} size={11}/><span style={{fontSize:".76rem",color:"#64748b",width:30,textAlign:"right"}}>{r.p}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  {center.testimonials?.map((t,i)=>(
                    <div key={i} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:20}}>
                      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,flexWrap:"wrap"}}>
                        <div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#011451,#ff2945)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.2rem",flexShrink:0}}>{t.av}</div>
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
            <div style={{animation:"cnFU .4s ease"}}>
              <section style={S.section}>
                <h2 style={S.sH2}>Questions fréquentes</h2>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>{center.faq?.map((item,i)=><FAQItem key={i} item={item}/>)}</div>
              </section>
            </div>
          )}

          {activeTab==="contact"&&(
            <div style={{animation:"cnFU .4s ease"}}>
              <section style={S.section}>
                <h2 style={S.sH2}>Contact & accès</h2>
                <div className="center-detail-contact-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:28}}>
                  {[
                    {ico:"📍",title:"Adresse",content:center.address,action:{label:"Voir sur Maps →",fn:()=>window.open("https://maps.google.com","_blank")}},
                    {ico:"📞",title:"Téléphone",content:center.phone},
                    {ico:"📧",title:"Email",content:center.email},
                    {ico:"🕐",title:"Horaires",content:center.hours},
                  ].map((c,i)=>(
                    <div key={i} style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:14,padding:"20px 18px"}}>
                      <div style={{fontSize:"1.5rem",marginBottom:10,display:"block"}}>{c.ico}</div>
                      <h3 style={{fontWeight:800,fontSize:".9rem",margin:"0 0 6px",color:"#011451"}}>{c.title}</h3>
                      <p style={{fontSize:".86rem",color:"#475569",margin:"0 0 8px",lineHeight:1.6}}>{c.content}</p>
                      {c.action&&<button style={{background:"none",border:"none",color:"#ff2945",fontWeight:700,fontSize:".86rem",cursor:"pointer",padding:0,fontFamily:FF}} onClick={c.action.fn}>{c.action.label}</button>}
                    </div>
                  ))}
                </div>
                <div style={{border:"1px solid #e2e8f0",borderRadius:14,overflow:"hidden"}}>
                  <div style={{background:"linear-gradient(135deg,#011451,#0c33ac)",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
                    <span style={{fontSize:".8rem",fontWeight:700,color:"#fff"}}>📍 Localisation - {center.name}</span>
                    <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer" style={{fontSize:".76rem",color:"#93c5fd",fontWeight:600,textDecoration:"none"}}>Agrandir →</a>
                  </div>
                  <iframe src={center.mapUrl} width="100%" height="260" style={{border:0,display:"block"}} allowFullScreen="" loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Google Maps BET"/>
                </div>
              </section>
            </div>
          )}
        </div>

        {/* SIDEBAR */}
        <aside className="center-detail-sidebar" style={{...S.sidebar,top:stickyBar?80:20}}>
          <div className="center-detail-side-card" style={S.sideCard}>
            <div style={{background:"linear-gradient(135deg,#011451,#0c33ac)",padding:"20px 18px"}}>
              <p style={{color:"rgba(255,255,255,.6)",fontSize:".76rem",margin:"0 0 6px",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em"}}>Centre de formation agréé</p>
              <p style={{color:"#fff",fontFamily:FD,fontSize:"1.05rem",margin:0,lineHeight:1.3}}>{center.name}</p>
            </div>
            <div style={{padding:"16px 18px"}}>
              {[{ico:"📍",val:center.address},{ico:"📞",val:center.phone},{ico:"📧",val:center.email},{ico:"🕐",val:center.hours}].map((r,i)=>(
                <div key={i} className="info-row" style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10}}>
                  <span>{r.ico}</span><span style={{fontSize:".84rem",color:"#334155",lineHeight:1.5}}>{r.val}</span>
                </div>
              ))}
            </div>
            <div style={{padding:"0 18px 14px",display:"flex",flexDirection:"column",gap:10}}>
              <button className="center-detail-btn-quote" style={S.btnDevis} onMouseEnter={e=>{e.currentTarget.style.background="#0c33ac";e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#0c33ac";}} onClick={()=>window.open(`tel:${center.phone}`)}>📞 Appeler le centre</button>
              <button style={{...S.btnDevis}} onMouseEnter={e=>{e.currentTarget.style.background="#0c33ac";e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#0c33ac";}} onClick={()=>setActiveTab("contact")}>🗺️ Voir l'itinéraire</button>
            </div>
            <div style={{padding:"14px 18px",borderTop:"1px solid #f1f5f9"}}>
              <p style={{fontSize:".78rem",fontWeight:700,color:"#011451",margin:"0 0 10px"}}>Disponibilité :</p>
              {[["Lun – Ven","08h – 20h"],["Samedi","09h – 17h"],["Dimanche","Sur RDV"]].map((h,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:".8rem",color:"#64748b",padding:"3px 0",flexWrap:"wrap",gap:5}}>
                  <span>{h[0]}</span><span style={{fontWeight:600,color:"#011451"}}>{h[1]}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* MODAL DEVIS */}
      {modalOpen&&(
        <div className="modal-overlay-mq" style={S.overlayBg} onClick={()=>setModalOpen(false)}>
          <div style={S.payModal} onClick={e=>e.stopPropagation()}>
            <button style={S.payClose} onClick={()=>setModalOpen(false)}>✕</button>
            {success?(
              <div style={{textAlign:"center",padding:"20px 0"}}>
                <div style={{fontSize:"3rem",marginBottom:16}}>✅</div>
                <h3 style={{fontSize:"1.3rem",fontWeight:800,margin:"0 0 8px"}}>Demande envoyée !</h3>
                <p style={{color:"#64748b",fontSize:".9rem"}}>Un conseiller du centre {center.name} vous rappelle sous 24h.</p>
              </div>
            ):<>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <h2 style={{...S.payTitle,margin:0}}>Demande de devis - {center.name}</h2>
              </div>
              <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:"10px 14px",fontSize:".8rem",color:"#92400e",display:"flex",gap:9,alignItems:"flex-start",marginBottom:16}}>
                <span>🏢</span>
                <div><strong>Réservé aux entreprises uniquement.</strong> Ce service est destiné aux structures souhaitant former leurs collaborateurs. Un devis personnalisé vous sera transmis sous 24h.</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {[{label:"Nom du contact *",ph:"Jean Kouamé",key:"name"},{label:"Email *",ph:"jean@exemple.com",key:"email"},{label:"Téléphone *",ph:"+225 07 00 00 00 00",key:"phone"}].map(f=>(
                  <div key={f.key}><p style={S.payLabel}>{f.label}</p><input style={S.payInput} placeholder={f.ph} value={formData[f.key]} onChange={e=>setFormData(p=>({...p,[f.key]:e.target.value}))}/></div>
                ))}
                <div><p style={S.payLabel}>Nom de l'entreprise *</p><input style={S.payInput} placeholder="Mon Entreprise SARL" value={formData.societe} onChange={e=>setFormData(p=>({...p,societe:e.target.value}))}/></div>
                <div><p style={S.payLabel}>Formation souhaitée</p>
                  <select style={{...S.payInput,cursor:"pointer"}} value={formData.program} onChange={e=>setFormData(p=>({...p,program:e.target.value}))}>
                    <option value="">Sélectionner une formation</option>
                    {center.programs?.map((p,i)=><option key={i}>{p}</option>)}
                  </select>
                </div>
                <div><p style={S.payLabel}>Message (optionnel)</p><textarea style={{...S.payInput,height:80,resize:"vertical"}} placeholder="Précisez votre besoin..." value={formData.message} onChange={e=>setFormData(p=>({...p,message:e.target.value}))}/></div>
              </div>
              {devisErreur&&<p style={{color:"#ff2945",fontSize:".82rem",textAlign:"center",margin:"10px 0 0"}}>{devisErreur}</p>}
              <button style={{...S.payConfirmBtn,opacity:devisLoading?.7:1}} onClick={handleDevis} disabled={devisLoading} onMouseEnter={e=>e.currentTarget.style.opacity=".9"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>{devisLoading?"Envoi en cours...":"Envoyer ma demande →"}</button>
              <p style={{textAlign:"center",fontSize:".74rem",color:"#94a3b8",marginTop:10}}>✓ Gratuit · ✓ Sans engagement · ✓ Réponse sous 24h</p>
            </>}
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
  page:       {fontFamily:FF,color:"#011451",background:"#fff",minHeight:"100vh"},
  hero:       {padding:"52px 0 40px",position:"relative"},
  heroInner:  {maxWidth:1180,margin:"0 auto",padding:"0 24px"},
  breadcrumb: {display:"flex",alignItems:"center",gap:8,marginBottom:20,fontSize:".82rem",flexWrap:"wrap"},
  bLink:      {color:"#93c5fd",cursor:"pointer",textDecoration:"underline"},
  bSep:       {color:"rgba(255,255,255,.3)"},
  tagBlue:    {background:"rgba(30,58,138,.3)",border:"1px solid rgba(30,58,138,.6)",color:"#93c5fd",borderRadius:999,padding:"4px 14px",fontSize:".73rem",fontWeight:800,letterSpacing:".05em"},
  tagRed:     {background:"rgba(220,38,38,.25)",border:"1px solid rgba(220,38,38,.5)",color:"#fca5a5",borderRadius:999,padding:"4px 14px",fontSize:".73rem",fontWeight:800},
  heroTitle:  {fontFamily:FD,fontSize:"clamp(2rem,5vw,3.5rem)",color:"#fff",margin:"0 0 6px",fontWeight:400,lineHeight:1.1},
  heroStats:  {display:"flex",alignItems:"center",gap:0,marginBottom:22,flexWrap:"wrap"},
  heroPill:   {background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",color:"rgba(255,255,255,.8)",borderRadius:6,padding:"4px 12px",fontSize:".78rem",fontWeight:500},
  tabsBar:    {background:"#fff",borderBottom:"1px solid #e2e8f0",position:"relative",zIndex:50},
  tabsSticky: {position:"sticky",top:0,boxShadow:"0 2px 8px rgba(0,0,0,.06)"},
  tabsInner:  {maxWidth:1180,margin:"0 auto",padding:"0 24px",display:"flex",overflowX:"auto"},
  tabBtn:     {background:"none",border:"none",borderBottom:"3px solid transparent",padding:"14px 16px",fontSize:".88rem",fontWeight:600,color:"#64748b",cursor:"pointer",whiteSpace:"nowrap",transition:"all .2s",fontFamily:FF},
  tabActive:  {color:"#ff2945",borderBottomColor:"#ff2945"},
  layout:     {maxWidth:1180,margin:"0 auto",padding:"36px 24px",display:"grid",gridTemplateColumns:"1fr 300px",gap:36,alignItems:"start"},
  contentCol: {minWidth:0},
  section:    {marginBottom:40,paddingBottom:36,borderBottom:"1px solid #f1f5f9"},
  sH2:        {fontFamily:FD,fontSize:"1.4rem",fontWeight:400,margin:"0 0 20px",color:"#011451"},
  subP:       {fontSize:".86rem",color:"#64748b",margin:"-12px 0 20px"},
  descP:      {fontSize:".95rem",color:"#475569",lineHeight:1.75,margin:"0 0 14px"},
  sidebar:    {position:"sticky",alignSelf:"start",transition:"top .3s"},
  sideCard:   {background:"#fff",border:"1px solid #e2e8f0",borderRadius:16,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,.08)"},
  btnEnroll:  {display:"block",width:"100%",padding:"13px",background:"#ff2945",color:"#fff",border:"none",borderRadius:999,fontFamily:FF,fontWeight:800,fontSize:".95rem",cursor:"pointer",transition:"background .2s"},
  btnDevis:   {display:"block",width:"100%",padding:"12px",background:"transparent",color:"#0c33ac",border:"1.5px solid #0c33ac",borderRadius:999,fontFamily:FF,fontWeight:700,fontSize:".88rem",cursor:"pointer",transition:"all .2s",textAlign:"center"},
  overlayBg:  {position:"fixed",inset:0,background:"rgba(0,0,0,.65)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9000,padding:16,animation:"cnFI .2s ease"},
  payModal:   {background:"#fff",borderRadius:20,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",padding:"28px",position:"relative",animation:"cnSI .25s ease",boxShadow:"0 30px 80px rgba(0,0,0,.22)"},
  payClose:   {position:"absolute",top:14,right:14,background:"#f1f5f9",border:"none",width:28,height:28,borderRadius:"50%",cursor:"pointer",fontSize:".9rem",color:"#64748b"},
  payTitle:   {fontFamily:FD,fontSize:"1.3rem",margin:"0 0 16px",fontWeight:400},
  payLabel:   {fontSize:".8rem",fontWeight:700,color:"#011451",margin:"0 0 5px"},
  payInput:   {width:"100%",padding:"10px 14px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:".9rem",fontFamily:FF,outline:"none",marginBottom:4,boxSizing:"border-box"},
  payConfirmBtn:{width:"100%",padding:"13px",background:"linear-gradient(135deg,#ff2945,#0c33ac)",color:"#fff",border:"none",borderRadius:999,fontFamily:FF,fontWeight:800,fontSize:"1rem",cursor:"pointer",transition:"opacity .2s",marginTop:18},
};

export default CenterDetail;