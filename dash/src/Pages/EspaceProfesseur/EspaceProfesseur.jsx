// src/Pages/EspaceProfesseur/EspaceProfesseur.jsx
// Route : <Route path="/espace-professeur" element={<EspaceProfesseur />} />

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTabState } from "../../hooks/useTabState";
import { hasPermission } from "../../utils/permissions";
import toast from "react-hot-toast";
import { RangeePastilles } from "../../Components/BarreFiltres";
import CloudinaryUpload, { AvatarUpload } from "../../Components/CloudinaryUpload";
import NotificationsTab from "../../Components/NotificationsTab";
import NotificationBell from "../../Components/NotificationBell";
import { exporterExcelStyle } from "../../utils/exporterExcel";
import { genererPDF, fmtDatePDF, ligneTableau } from "../../utils/genererPDF";
import MessagerieTab from "../../Components/MessagerieTab";
import { urlDocument, extensionDe } from "../../utils/urlDocument";
import { urlEmbedVideo, estFichierVideo, estFichierAudio, estChaineYoutube } from "../../utils/urlVideo";
import DashboardColorPicker from "../../Components/DashboardColorPicker";
import { useGroupeChat, useGroupesChatUnreadTotal, useGroupesLibresNonLus } from "../../hooks/useGroupeChat";
import ChatGroupe from "../../Components/ChatGroupe";
import GroupesLibres from "../../Components/GroupesLibres";
import ArchiveApprenantsCoach from "../../Components/ArchiveApprenantsCoach";
import { ParcoursApprenant, MouvementsClasse } from "../../Components/HistoriqueMouvements";
import { useFirebaseChat } from "../../hooks/useFirebaseChat";
import { useLanguage } from "../../contexts/LanguageContext";
import { useNotifications } from "../../hooks/useNotifications";
import { useAssistanteChat } from "../../hooks/useAssistanteChat";
import { useConfirm } from "../../contexts/ConfirmContext";
import FooterSaaS from "../../Components/FooterSaaS";
import { assombrirCouleur } from "../../utils/couleurs";
import { clearAllSessionStorage } from "../../utils/session";
import { openElearningSSO } from "../../utils/ssoElearning";
import { analyserLienVisio } from "../../utils/lienVisio";

import { uploadFichier } from "../../utils/uploadFichier";
import { fetchUpload } from "../../utils/fetchUpload";
import MonProfilModal, { BoutonMonProfil, nomAffiche } from "../../Components/MonProfilModal";
import VisionneuseImage from "../../Components/VisionneuseImage";
import BadgeCategorieCoach from "../../Components/BadgeCategorieCoach";
import { BoutonDemandeTransfert } from "../../Components/DemandeTransfert";
import { NOTE_COULEUR, NOTE_FOND, BAREME_TEXTE } from "../../utils/categorieCoach";
import { suivreFenetreLive } from "../../utils/inactivite";

/* OUVERTURE DE LA SALLE VIRTUELLE - le même délai pour le coach, l'apprenant et le parent.
   Il vivait en clair dans chaque écran (`15*60*1000`), ce qui obligeait à le retrouver à la
   main dans quatre fichiers pour le changer d'une minute : nommé ici, il se relit et se
   corrige d'un seul endroit par application. */
const MINUTES_OUVERTURE_SALLE = 10;
const MS_OUVERTURE_SALLE = MINUTES_OUVERTURE_SALLE * 60 * 1000;
/* ═══════════════════════════════════════════════════════
   CONSTANTES BET
═══════════════════════════════════════════════════════ */
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";
const ELEARNING_URL = process.env.REACT_APP_ELEARNING_URL || "http://localhost:3002";
const BET        = (() => { try { return JSON.parse(localStorage.getItem("coach_profil")||localStorage.getItem("admin_profil")||"{}").couleur||"#0891b2"; } catch { return "#0891b2"; } })();
const CENTRES_LABELS = {
  angre:      "BET Angré",
  "2plateaux":"BET II Plateaux",
  yopougon:   "BET Yopougon",
  koumassi:   "BET Koumassi",
  abatta:     "BET Abatta",
  bouake:     "BET Bouaké",
};
const JOURS_SEMAINE = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const CRENEAUX_DEF  = Array.from({ length: 15 }, (_, i) => {
  const h   = 7 + i;
  const pad = n => String(n).padStart(2, '0');
  return { id:`h${pad(h)}`, label:`${pad(h)}h00`, debut:`${pad(h)}:00`, fin:`${pad(h+1)}:00` };
});
// Heures disponibles pour les selects (de 07:00 à 22:00)
const HEURES_DISPO = CRENEAUX_DEF.map(c => c.debut).concat([CRENEAUX_DEF[CRENEAUX_DEF.length - 1].fin]);

const initDispo = () => {
  const d = {};
  JOURS_SEMAINE.forEach(j => { d[j] = []; }); // tableau de plages { debut, fin }
  return d;
};
const BET_DARK   = BET;
const BET_LIGHT  = BET + "26";
const BET_GRAD   = `linear-gradient(135deg,#0f172a 0%,${assombrirCouleur(BET)} 100%)`;
const RESS_TYPE_COURS_META = { en_ligne:{icon:"💻",label:"En ligne"}, domicile:{icon:"🏠",label:"Domicile"}, centre:{icon:"🏢",label:"Centre"}, prive:{icon:"🔒",label:"Privé"} };

const STATUT_SEANCE = {
  planifie:  { label:"Planifiée",   bg:"#fef3c7", c:"#92400e" },
  confirme:  { label:"Confirmée",   bg:"#dbeafe", c:"#1e40af" },
  termine:   { label:"Terminée",    bg:"#dcfce7", c:"#166534" },
  annule:    { label:"Annulée",     bg:"#fee2e2", c:"#991b1b" },
};
const STATUT_ETUD = {
  actif:    { bg:"#dcfce7", c:"#166534", label:"Actif"    },
  absent:   { bg:"#fee2e2", c:"#991b1b", label:"Absent"   },
  retard:   { bg:"#fef3c7", c:"#92400e", label:"En retard"},
  conge:    { bg:"#dbeafe", c:"#1e40af", label:"Congé"    },
};
const NIVEAU_META = {
  A1:{ l:"Débutant",         c:"#6b7280", bg:"#f3f4f6" },
  A2:{ l:"Élémentaire",      c:"#d97706", bg:"#fef3c7" },
  B1:{ l:"Intermédiaire",    c:"#2563eb", bg:"#dbeafe" },
  B2:{ l:"Interm. supérieur",c:"#7c3aed", bg:"#ede9fe" },
  C1:{ l:"Avancé",           c:"#059669", bg:"#dcfce7" },
  C2:{ l:"Maîtrise",         c:"#dc2626", bg:"#fee2e2" },
};
const TYPE_RESSOURCE = {
  pdf:      { icon:"📄", label:"PDF",      color:"#dc2626" },
  video:    { icon:"🎬", label:"Vidéo",    color:"#7c3aed" },
  audio:    { icon:"🎧", label:"Audio",    color:"#059669" },
  lien:     { icon:"🔗", label:"Lien",     color:BET      },
  speaking: { icon:"🎤", label:"Speaking", color:"#dc2626" },
};

/* ═══════════════════════════════════════════════════════
   GRILLE TARIFAIRE BET (F/heure selon grade × type_cours)
═══════════════════════════════════════════════════════ */
const GRILLE_TARIFAIRE = {
  "Vacataire": { "en_ligne": 5000,  "presentiel": 6500,  "domicile": 7000 },
  "CDD":       { "en_ligne": 7000,  "presentiel": 8500,  "domicile": 9000 },
  "CDI":       { "en_ligne": 8000,  "presentiel": 9500,  "domicile": 10000 },
  "Freelance": { "en_ligne": 6000,  "presentiel": 7500,  "domicile": 8000 },
  "Coach":     { "en_ligne": 5000,  "presentiel": 6500,  "domicile": 7000 },
};

const calcHeureSemaine = (horaire) => {
  if (!Array.isArray(horaire)) return 0;
  return horaire.reduce((sum, h) => {
    if (!h.debut || !h.fin) return sum;
    const [dh, dm] = h.debut.split(":").map(Number);
    const [fh, fm] = h.fin.split(":").map(Number);
    const dur = (fh * 60 + fm - dh * 60 - dm) / 60;
    return sum + (dur > 0 ? dur : 0);
  }, 0);
};

/* ═══════════════════════════════════════════════════════
   DONNÉES MOCK
═══════════════════════════════════════════════════════ */
const MON_PROFIL = {
  id:1, nom:"Martin", prenom:"Sophie", avatar:"SM",
  email:"s.martin@bet.ci", phone:"+225 07 22 33 44",
  specialite:"Anglais Professionnel & TOEIC",
  niveauxEnseignes:["B1","B2","C1"],
  dateRecrutement:"2023-09-01",
  notation: 4.8, nbAvis: 124,
  coursActifs: 3, totalEtudiants: 54, heuresMois: 48,
  xp:"Senior", certifications:["CELTA","DELTA","TOEIC 990"],
};
/* ═══════════════════════════════════════════════════════
   MODULES & CONTENU AVANCÉ - NOUVELLES DONNÉES
═══════════════════════════════════════════════════════ */
const BLOCK_TYPES = {
  texte:    { icon:"📝", label:"Texte / Cours",           color:"#374151" },
  video:    { icon:"🎬", label:"Vidéo",                   color:"#7c3aed" },
  document: { icon:"📄", label:"Document / PDF",          color:"#dc2626" },
  // Manquait à l'appel : un coach ne pouvait pas déposer une image dans un cours, alors
  // qu'une consigne visuelle ou un schéma est souvent ce qui se comprend le plus vite.
  image:    { icon:"🖼️", label:"Image / Illustration",     color:"#db2777" },
  quiz:     { icon:"❓", label:"Quiz interactif",          color:"#2563eb" },
  exercice: { icon:"✏️", label:"Exercice pratique",       color:"#d97706" },
  audio:    { icon:"🎧", label:"Audio / Podcast",         color:"#059669" },
  lien:     { icon:"🔗", label:"Lien externe",             color:"#0891b2" },
  speaking: { icon:"🎤", label:"Speaking / Expression orale", color:"#dc2626" },
};

/* ═══ APERÇUS DES BLOCS ═══════════════════════════════════════════════════════
   L'éditeur de module n'affichait qu'une étiquette : une URL tronquée pour la vidéo,
   un nom de fichier même pas cliquable pour le document. Le coach ne pouvait donc pas
   relire ce qu'il venait de déposer avant de le publier à ses apprenants.
   Les mêmes règles que partout ailleurs : YouTube/Vimeo par intégration, fichiers par
   `<video>`/`<audio>`, documents PAR LE RELAIS - Cloudinary répond 401 sur les PDF de
   ce compte, un lien direct n'aurait rien ouvert. */

const ApercuVideoBloc = ({ bloc }) => {
  const url = bloc?.url;
  if (!url) return <div style={{ background:"#f3f4f6",borderRadius:8,padding:12,fontSize:12,color:"#9ca3af" }}>🎬 Aucune vidéo déposée.</div>;
  const embed = urlEmbedVideo(url);
  if (embed) {
    return (
      <div style={{ borderRadius:8, overflow:"hidden", background:"#0f172a" }}>
        <div style={{ position:"relative", width:"100%", paddingTop:"56.25%" }}>
          <iframe src={embed} title={bloc.titre||"Vidéo"} allowFullScreen
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none" }} />
        </div>
      </div>
    );
  }
  if (estFichierVideo(url)) {
    return <video src={url} controls preload="metadata" style={{ width:"100%", maxHeight:320, borderRadius:8, background:"#000", display:"block" }} />;
  }
  return (
    <div style={{ background:"#fffbeb",border:"1px dashed #fcd34d",borderRadius:8,padding:12,fontSize:12,color:"#92400e" }}>
      <div style={{ fontWeight:700,marginBottom:4 }}>
        {estChaineYoutube(url) ? "Ce lien mène à une chaîne YouTube, pas à une vidéo" : "Cette vidéo ne peut pas être lue ici"}
      </div>
      <a href={url} target="_blank" rel="noreferrer" style={{ color:"#b45309",fontWeight:700,wordBreak:"break-all" }}>{url} ↗</a>
    </div>
  );
};

const ApercuAudioBloc = ({ bloc, onOuvrir }) => {
  const url = bloc?.url;
  if (!url) return <div style={{ background:"#f0fdf4",borderRadius:8,padding:12,fontSize:12,color:"#9ca3af" }}>🎧 Aucun audio déposé.</div>;
  const embed = urlEmbedVideo(url);
  return (
    <div style={{ background:"#f0fdf4",borderRadius:8,padding:12 }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:8 }}>
        <span style={{ fontSize:12,color:"#059669",fontWeight:600,minWidth:0,overflow:"hidden",textOverflow:"ellipsis" }}>🎧 {bloc.titre || bloc.fichier || "Audio"}</span>
        <button onClick={onOuvrir} style={{ padding:"5px 12px",background:"#059669",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontWeight:600,fontSize:11,flexShrink:0 }}>⛶ Agrandir</button>
      </div>
      {embed ? (
        <div style={{ position:"relative", width:"100%", paddingTop:"56.25%", borderRadius:8, overflow:"hidden", background:"#0f172a" }}>
          <iframe src={embed} title={bloc.titre||"Audio"} allowFullScreen
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none" }} />
        </div>
      ) : estFichierAudio(url) ? (
        <audio src={url} controls preload="metadata" style={{ width:"100%" }} />
      ) : (
        <a href={url} target="_blank" rel="noreferrer" style={{ fontSize:12,color:"#b45309",fontWeight:700,wordBreak:"break-all" }}>{url} ↗</a>
      )}
    </div>
  );
};

const ApercuDocumentBloc = ({ bloc }) => {
  const url = bloc?.url;
  const nom = bloc?.fichier || bloc?.titre || "Document";
  if (!url) {
    return (
      <div style={{ background:"#fff1f2",borderRadius:8,padding:12,fontSize:12,color:"#9ca3af",display:"flex",gap:10,alignItems:"center" }}>
        📄 {bloc?.fichier || "Aucun document déposé."} {bloc?.taille&&<span>· {bloc.taille}</span>}
      </div>
    );
  }
  // L'extension se lit sur le nom de FICHIER, sinon sur l'URL - jamais sur le titre.
  const ext = extensionDe(bloc?.fichier || url);
  return (
    <div style={{ background:"#fff1f2",borderRadius:8,padding:12 }}>
      <div style={{ display:"flex",gap:10,alignItems:"center",marginBottom: ext==="pdf" ? 10 : 0 }}>
        <span>📄</span>
        <a href={urlDocument(url,{ nom })} target="_blank" rel="noreferrer"
          style={{ fontSize:12,color:"#dc2626",fontWeight:700,wordBreak:"break-word" }}>{nom}</a>
        {bloc?.taille&&<span style={{ fontSize:12,color:"#9ca3af",flexShrink:0 }}>· {bloc.taille}</span>}
      </div>
      {ext==="pdf" && (
        <iframe title={nom} src={urlDocument(url,{ nom, inline:true })}
          style={{ width:"100%", height:420, border:"1px solid #fecdd3", borderRadius:8, background:"#fff" }} />
      )}
    </div>
  );
};

/**
 * Blocs proposés selon le type de contenu.
 *
 * Les huit types s'affichaient quel que soit le contenu : on proposait un bloc Vidéo dans
 * une capsule Audio, un Document dans une vidéo. Le choix du type devenait décoratif.
 *
 * La LEÇON, elle, accepte tout - et ce n'est pas un relâchement de la règle mais sa raison
 * d'être. Un devoir type de l'équipe enchaîne objectifs, vocabulaire, UNE VIDÉO à regarder,
 * les questions qu'elle appelle, un point de grammaire puis une consigne d'expression
 * orale. En excluant Vidéo et Audio de la leçon, on rendait ce devoir tout simplement
 * impossible à créer. La leçon est le type composite ; Audio et Vidéo sont les capsules
 * mono-média, et c'est là que le tri garde du sens.
 */
const BLOCS_PAR_TYPE = {
  lecon: Object.keys(BLOCK_TYPES),
  audio: ["audio", "texte", "image", "lien", "quiz", "exercice"],
  video: ["video", "texte", "image", "lien", "quiz", "exercice"],
};

/** Les blocs autorisés pour un type donné - tout, si le type est inconnu. */
const blocsAutorises = (typeContenu) =>
  BLOCS_PAR_TYPE[typeContenu] || Object.keys(BLOCK_TYPES);

const STATUT_MODULE = {
  brouillon:{ label:"Brouillon", bg:"#f3f4f6", c:"#374151" },
  publie:   { label:"Publié",    bg:"#dcfce7", c:"#166534" },
  archive:  { label:"Archivé",  bg:"#fef3c7", c:"#92400e" },
};

const MODULES_CONTENT_INIT_UNUSED = {
  "1": {
    "1":{ id:"m1-1",coursId:1,moduleId:1,titre:"Réunions d'affaires",objectifs:["Vocabulaire des réunions","Animer en anglais","Rédiger un compte-rendu"],statut:"publie",dureeEstimee:90,ordre:1,
      blocs:[
        { id:"b1",type:"texte",titre:"Introduction aux réunions",contenu:"Les réunions internationales nécessitent un vocabulaire précis. Nous couvrons les expressions clés pour ouvrir, animer et clore une réunion formelle.",dureeMin:10,ordre:1 },
        { id:"b2",type:"video",titre:"Vidéo : Exemple réunion B2 - 15 min",url:"https://www.youtube.com/embed/example",dureeMin:15,ordre:2 },
        { id:"b3",type:"exercice",titre:"Exercice : Phrases de réunion",contenu:"Complétez : 1) 'Let\'s ______ the meeting to order.' 2) 'I\'d like to ______ to the agenda.' 3) 'Can we ______ on that?'",dureeMin:15,ordre:3 },
        { id:"b4",type:"quiz",titre:"Quiz : Vocabulaire réunions",dureeMin:10,ordre:4,
          questions:[
            { id:"q1",texte:"Which opens a meeting?",options:["Let's get started","Begin now","Meeting time","Start it"],correct:"Let's get started" },
            { id:"q2",texte:"How to ask for clarification?",options:["Could you elaborate?","Say again?","What?","Repeat."],correct:"Could you elaborate?" },
            { id:"q3",texte:"'AOB' stands for:",options:["Any Other Business","All Options Booked","Agency of Business","Another Old Book"],correct:"Any Other Business" },
          ]
        },
        { id:"b5",type:"document",titre:"PDF : 50 expressions clés pour les réunions",fichier:"phrases_reunions_b2.pdf",taille:"1.2 MB",dureeMin:20,ordre:5 },
      ]
    },
    "2":{ id:"m1-2",coursId:1,moduleId:2,titre:"Négociation en anglais",objectifs:["Techniques de négociation","Contre-propositions","Conclure un accord"],statut:"publie",dureeEstimee:75,ordre:2,
      blocs:[
        { id:"b1",type:"texte",titre:"Principes de la négociation",contenu:"Négocier en anglais requiert précision et diplomatie. Ce module couvre les stratégies avancées.",dureeMin:12,ordre:1 },
        { id:"b2",type:"audio",titre:"Podcast : Negotiation Masterclass",url:"https://example.com/negotiation.mp3",dureeMin:25,ordre:2 },
        { id:"b3",type:"exercice",titre:"Jeu de rôle : Négocier un contrat",contenu:"En binôme : l\'un acheteur, l\'autre vendeur. Utiliser : 'We could consider...', 'Our best offer is...', 'Let\'s meet halfway...'",dureeMin:20,ordre:3 },
        { id:"b4",type:"quiz",titre:"Quiz : Expressions de négociation",dureeMin:8,ordre:4,
          questions:[
            { id:"q1",texte:"'To meet halfway' means:",options:["To compromise","To disagree","To walk away","To fully agree"],correct:"To compromise" },
            { id:"q2",texte:"A 'counteroffer' is:",options:["A response proposal","The original offer","A refusal","A contract"],correct:"A response proposal" },
          ]
        },
      ]
    },
    "3":{ id:"m1-3",coursId:1,moduleId:3,titre:"Présentations Pro",objectifs:["Structurer une présentation","Gérer les transitions","Les questions-réponses"],statut:"publie",dureeEstimee:80,ordre:3,
      blocs:[
        { id:"b1",type:"texte",titre:"Structure d'une présentation",contenu:"Règle des 3 parties : intro (hook+agenda), développement (3 points), conclusion (résumé+CTA). Chaque partie a ses phrases clés.",dureeMin:15,ordre:1 },
        { id:"b2",type:"video",titre:"TED Talk : How to speak so people listen",url:"https://www.youtube.com/embed/eIho2S0ZahI",dureeMin:22,ordre:2 },
        { id:"b3",type:"exercice",titre:"Créer votre présentation de 3 minutes",contenu:"Préparez 3 minutes sur votre secteur. Utiliser : 'Today I\'d like to discuss...', 'Moving on to...', 'To wrap up...'",dureeMin:25,ordre:3 },
        { id:"b4",type:"document",titre:"Template PowerPoint BET - Présentation Pro",fichier:"template_presentation.pptx",taille:"3.1 MB",dureeMin:10,ordre:4 },
        { id:"b5",type:"quiz",titre:"Quiz final : Présentations",dureeMin:8,ordre:5,
          questions:[
            { id:"q1",texte:"'To sum up' is used to:",options:["Summarize","Start a new point","Ask a question","Disagree"],correct:"Summarize" },
            { id:"q2",texte:"A 'hook' in a presentation is:",options:["Attention-grabbing opening","The conclusion","A slide title","A transition"],correct:"Attention-grabbing opening" },
          ]
        },
      ]
    },
    "4":{ id:"m1-4",coursId:1,moduleId:4,titre:"Correspondance formelle",objectifs:["Emails formels","Lettres professionnelles","Memos"],statut:"brouillon",dureeEstimee:60,ordre:4,blocs:[] },
    "5":{ id:"m1-5",coursId:1,moduleId:5,titre:"Rapport d'activité",objectifs:["Structure d'un rapport","Données et graphiques","Recommandations"],statut:"brouillon",dureeEstimee:70,ordre:5,blocs:[] },
  },
  "2":{
    "1":{ id:"m2-1",coursId:2,moduleId:1,titre:"Finance & Budget",objectifs:["Vocabulaire financier","Lecture de bilans","Présenter des chiffres"],statut:"publie",dureeEstimee:80,ordre:1,
      blocs:[
        { id:"b1",type:"texte",titre:"Vocabulaire finance en anglais",contenu:"ROI, EBITDA, cash flow, balance sheet, P&L - termes essentiels pour tout professionnel en environnement international.",dureeMin:15,ordre:1 },
        { id:"b2",type:"document",titre:"Glossaire Finance English - 200 termes",fichier:"glossaire_finance.pdf",taille:"2.8 MB",dureeMin:20,ordre:2 },
        { id:"b3",type:"quiz",titre:"Quiz : Finance Vocabulary",dureeMin:10,ordre:3,
          questions:[
            { id:"q1",texte:"'Bottom line' means:",options:["Net profit","Revenue","Fixed costs","Tax"],correct:"Net profit" },
            { id:"q2",texte:"'ROI' stands for:",options:["Return On Investment","Rate Of Inflation","Revenue Over Income","Risk Of Increase"],correct:"Return On Investment" },
          ]
        },
      ]
    },
    "2":{ id:"m2-2",coursId:2,moduleId:2,titre:"Marketing Digital",objectifs:["Digital marketing vocabulary","Campaigns","Analytics"],statut:"publie",dureeEstimee:65,ordre:2,blocs:[] },
    "3":{ id:"m2-3",coursId:2,moduleId:3,titre:"Leadership",objectifs:["Leadership styles","Team management","Motivation"],statut:"brouillon",dureeEstimee:70,ordre:3,blocs:[] },
    "4":{ id:"m2-4",coursId:2,moduleId:4,titre:"Stratégie d'entreprise",objectifs:["Strategic planning","SWOT","Presentations"],statut:"brouillon",dureeEstimee:75,ordre:4,blocs:[] },
  },
  "3":{
    "1":{ id:"m3-1",coursId:3,moduleId:1,titre:"Listening Part 1-2",objectifs:["Photos","Short conversations","TOEIC strategy"],statut:"publie",dureeEstimee:90,ordre:1,
      blocs:[
        { id:"b1",type:"texte",titre:"Stratégie TOEIC Listening Parts 1 & 2",contenu:"Part 1 : 6 photos. Part 2 : 25 questions-réponses. Stratégie : écouter le premier mot, éliminer les distracteurs.",dureeMin:20,ordre:1 },
        { id:"b2",type:"audio",titre:"Practice : 20 Questions Parts 1 & 2",url:"https://example.com/toeic-listening.mp3",dureeMin:30,ordre:2 },
        { id:"b3",type:"quiz",titre:"Mini-test TOEIC Part 1",dureeMin:15,ordre:3,
          questions:[
            { id:"q1",texte:"TOEIC Listening Part 1 has:",options:["6 questions","10 questions","25 questions","45 questions"],correct:"6 questions" },
            { id:"q2",texte:"Best strategy for Part 2:",options:["Listen to first word","Read options first","Guess quickly","Skip all"],correct:"Listen to first word" },
          ]
        },
      ]
    },
    "2":{ id:"m3-2",coursId:3,moduleId:2,titre:"Listening Part 3-4",objectifs:["Conversations","Talks","TOEIC strategy"],statut:"publie",dureeEstimee:95,ordre:2,blocs:[] },
    "3":{ id:"m3-3",coursId:3,moduleId:3,titre:"Reading Part 5-6",objectifs:["Incomplete sentences","Error recognition"],statut:"brouillon",dureeEstimee:85,ordre:3,blocs:[] },
    "4":{ id:"m3-4",coursId:3,moduleId:4,titre:"Reading Part 7",objectifs:["Single passages","Multiple passages"],statut:"brouillon",dureeEstimee:100,ordre:4,blocs:[] },
    "5":{ id:"m3-5",coursId:3,moduleId:5,titre:"Examens blancs",objectifs:["Full TOEIC simulation","Time management"],statut:"brouillon",dureeEstimee:120,ordre:5,blocs:[] },
  }
};

const STUDENT_PROGRESSIONS_INIT = {
  1:{ "1":{ "1":{statut:"termine",pct:100,quizScore:90,dateComplete:"2025-11-12"}, "2":{statut:"termine",pct:100,quizScore:80,dateComplete:"2025-11-19"}, "3":{statut:"termine",pct:85,quizScore:75,dateComplete:"2025-11-26"}, "4":{statut:"en_cours",pct:40,quizScore:null,dateComplete:null}, "5":{statut:"non_commence",pct:0,quizScore:null,dateComplete:null} }},
  2:{ "1":{ "1":{statut:"termine",pct:100,quizScore:100,dateComplete:"2025-11-12"}, "2":{statut:"termine",pct:100,quizScore:95,dateComplete:"2025-11-19"}, "3":{statut:"termine",pct:100,quizScore:95,dateComplete:"2025-11-26"}, "4":{statut:"en_cours",pct:70,quizScore:null,dateComplete:null}, "5":{statut:"non_commence",pct:0,quizScore:null,dateComplete:null} }},
  3:{ "1":{ "1":{statut:"termine",pct:100,quizScore:60,dateComplete:"2025-11-15"}, "2":{statut:"en_cours",pct:50,quizScore:null,dateComplete:null}, "3":{statut:"non_commence",pct:0,quizScore:null,dateComplete:null}, "4":{statut:"non_commence",pct:0,quizScore:null,dateComplete:null}, "5":{statut:"non_commence",pct:0,quizScore:null,dateComplete:null} }},
  7:{ "1":{ "1":{statut:"termine",pct:100,quizScore:85,dateComplete:"2025-11-12"}, "2":{statut:"termine",pct:100,quizScore:75,dateComplete:"2025-11-19"}, "3":{statut:"en_cours",pct:60,quizScore:null,dateComplete:null}, "4":{statut:"non_commence",pct:0,quizScore:null,dateComplete:null}, "5":{statut:"non_commence",pct:0,quizScore:null,dateComplete:null} }},
  9:{ "1":{ "1":{statut:"termine",pct:100,quizScore:55,dateComplete:"2025-11-20"}, "2":{statut:"non_commence",pct:0,quizScore:null,dateComplete:null}, "3":{statut:"non_commence",pct:0,quizScore:null,dateComplete:null}, "4":{statut:"non_commence",pct:0,quizScore:null,dateComplete:null}, "5":{statut:"non_commence",pct:0,quizScore:null,dateComplete:null} }},
};

const STATUT_PROG_META = {
  "non_commence":{ label:"Non commencé", bg:"#f3f4f6", c:"#6b7280", icon:"○" },
  "en_cours":    { label:"En cours",     bg:"#fef3c7", c:"#92400e", icon:"◐" },
  "termine":     { label:"Terminé",      bg:"#dcfce7", c:"#166534", icon:"●" },
};

const NOTIFICATIONS_INIT = [
  { id:1,type:"module_publie",   titre:"Nouveau module disponible",message:"Le module 'Correspondance formelle' est maintenant accessible.",cours:"Anglais Pro B2",destinataires:18,date:"2025-12-01",statut:"envoye" },
  { id:2,type:"evaluation",      titre:"Évaluation à venir",       message:"Rappel : évaluation Module 4 le 12/12. Révisez les emails formels.",cours:"Anglais Pro B2",destinataires:18,date:"2025-12-08",statut:"envoye" },
  { id:3,type:"ressource_ajoutee",titre:"Nouvelle ressource PDF",  message:"Un nouveau guide a été ajouté : Guide de grammaire B2.",cours:"Anglais Pro B2",destinataires:18,date:"2025-11-10",statut:"envoye" },
];


/* ═══════════════════════════════════════════════════════
   SOUS-COMPOSANTS
═══════════════════════════════════════════════════════ */

const Modal = ({ title, onClose, children, wide }) => (
  <div style={modalOverlay}>
    <div style={{ ...modalBox, width:"90vw", maxHeight:"90vh", overflowY:"auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <h3 style={{ margin:0, fontSize:16 }}>{title}</h3>
        <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#6b7280" }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const ProgressRing = ({ pct, size=70, stroke=5, color=BET }) => {
  const r = (size-stroke)/2, circ = 2*Math.PI*r, dash = (pct/100)*circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform:"rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"/>
    </svg>
  );
};

const Bar = ({ value, color=BET, h=7 }) => (
  <div style={{ height:h, background:"#e5e7eb", borderRadius:h, overflow:"hidden" }}>
    <div style={{ height:"100%", width:`${Math.min(100,value)}%`, background:color, borderRadius:h, transition:"width .4s" }}/>
  </div>
);

const StatCard = ({ label, value, color, icon, sub, onClick }) => (
  <div onClick={onClick} style={{ background:"#fff", padding:16, borderRadius:12, boxShadow:"0 1px 6px rgba(0,0,0,0.06)", display:"flex", alignItems:"center", gap:12, cursor:onClick?"pointer":"default", border:"1px solid #f1f5f9" }}>
    <div style={{ width:46, height:46, borderRadius:10, background:color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{icon}</div>
    <div>
      <div style={{ fontSize:11, color:"#9ca3af" }}>{label}</div>
      <div style={{ fontSize:21, fontWeight:800, color, lineHeight:1.2 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"#9ca3af" }}>{sub}</div>}
    </div>
  </div>
);

const NivBadge = ({ n }) => { const m=NIVEAU_META[n]||NIVEAU_META.A1; return <span style={{ padding:"2px 9px", borderRadius:20, fontSize:11, fontWeight:800, background:m.bg, color:m.c }}>{n}</span>; };
const Sbadge  = ({ s })  => { const m=STATUT_ETUD[s]||STATUT_ETUD.actif; return <span style={{ padding:"2px 9px", borderRadius:20, fontSize:11, fontWeight:700, background:m.bg, color:m.c }}>{m.label}</span>; };

const fmtDate = (d, opts) => d ? new Date(d).toLocaleDateString("fr-FR", opts||{ day:"numeric", month:"short", year:"numeric" }) : "-";
const fmtDateCourt = (d) => d ? new Date(d).toLocaleDateString("fr-FR",{ weekday:"short", day:"numeric", month:"short" }) : "-";


/* ═══════════════════════════════════════════════════════
   PAGE PRINCIPALE
═══════════════════════════════════════════════════════ */
const EMOJIS_COURS = ["📚","💼","🏆","📊","🎯","✏️","🌐","🎓","📖","🔬","💡","🗣️"];
const COLORS_COURS = ["#2563eb","#059669","#7c3aed","#d97706","#dc2626","#0891b2","#db2777","#16a34a","#9333ea","#ea580c"];

/* ────────────────────────────────────────────────────────────
   Chat inline dans le modal apprenant privé
──────────────────────────────────────────────────────────── */
function PriveChatInline({ assignationId, profil, assignation, accentColor }) {
  const { myId, messages, loading, initialized, initConv, sendMessage, fmtTime } = useAssistanteChat(assignationId, profil, assignation);
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const bottomRef = React.useRef(null);

  React.useEffect(() => { initConv(); }, [initConv]);
  React.useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    await sendMessage(text);
    setText("");
    setSending(false);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:380 }}>
      {/* Messages */}
      <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:8, paddingRight:4 }}>
        {(loading || !initialized) && (
          <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:8, padding:24, color:"#94a3b8", fontSize:12 }}>
            <div style={{ width:16, height:16, border:"2px solid #e2e8f0", borderTopColor:accentColor, borderRadius:"50%", animation:"spin .8s linear infinite" }} />
            Connexion…
          </div>
        )}
        {initialized && messages.length === 0 && (
          <div style={{ textAlign:"center", padding:"32px 12px", color:"#94a3b8", fontSize:13 }}>
            <div style={{ fontSize:28, marginBottom:8 }}>💬</div>
            Aucun message. Commencez la conversation.
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.from_id === myId;
          return (
            <div key={msg.id} style={{ display:"flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth:"72%", display:"flex", flexDirection:"column", gap:2, alignItems: isMe ? "flex-end" : "flex-start" }}>
                {!isMe && <div style={{ fontSize:10, color:"#94a3b8", fontWeight:600, paddingLeft:4 }}>{msg.senderName}</div>}
                <div style={{ padding:"9px 13px", borderRadius: isMe ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: isMe ? accentColor : "#f1f5f9", color: isMe ? "#fff" : "#0f172a",
                  fontSize:13, lineHeight:1.5, wordBreak:"break-word" }}>
                  {msg.text}
                </div>
                <div style={{ fontSize:10, color:"#9ca3af", paddingLeft:4, paddingRight:4 }}>{fmtTime(msg.createdAt)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {/* Input */}
      <form onSubmit={handleSend} style={{ display:"flex", gap:8, paddingTop:12, borderTop:"1px solid #e2e8f0", marginTop:8 }}>
        <input
          value={text} onChange={e => setText(e.target.value)}
          placeholder="Écrire un message…"
          style={{ flex:1, padding:"10px 14px", borderRadius:10, border:"1.5px solid #e2e8f0", fontSize:13, outline:"none" }}
          onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        />
        <button type="submit" disabled={!text.trim() || sending}
          style={{ padding:"10px 18px", background: (!text.trim()||sending) ? "#e2e8f0" : accentColor,
            color: (!text.trim()||sending) ? "#94a3b8" : "#fff", border:"none", borderRadius:10,
            fontSize:13, fontWeight:700, cursor: (!text.trim()||sending) ? "not-allowed" : "pointer" }}>
          {sending ? "…" : "Envoyer"}
        </button>
      </form>
    </div>
  );
}

const PALIER_INFO_PROF = {
  bronze:  { lib: 'Bronze',  couleur: '#9A9A9A', icone: '🥉' },
  argent:  { lib: 'Argent',  couleur: '#C4C4D2', icone: '🥈' },
  or:      { lib: 'Or',      couleur: '#F0B84B', icone: '🥇' },
  platine: { lib: 'Platine', couleur: '#A78BFA', icone: '💎' },
};

// ── Onglet Récompenses (gamification coach - dash) ─────────────────────────
function OngletRecompensesProf() {
  const [donnees, setDonnees]       = useState(null);
  const [chargement, setChargement] = useState(true);
  const [filtreCategorie, setFiltreCategorie] = useState('tous');

  useEffect(() => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    fetch(`${API_URL}/api/gamification-coach-dash/moi`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setDonnees(d))
      .catch(() => setDonnees(null))
      .finally(() => setChargement(false));
  }, []);

  const CATS = [
    { id: 'tous',                lib: 'Tous' },
    { id: 'demarrage',           lib: 'Démarrage' },
    { id: 'excellence_terrain',  lib: 'Excellence terrain' },
    { id: 'excellence_parents',  lib: 'Excellence parents' },
    { id: 'fidelite',            lib: 'Fidélité' },
    { id: 'terrain_dispo',       lib: 'Terrain & disponibilité' },
    { id: 'paliers_leadership',  lib: 'Paliers & leadership' },
  ];

  if (chargement) {
    return <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>Chargement…</div>;
  }
  if (!donnees) {
    return (
      <div style={{ background: '#fff', borderRadius: 14, padding: '48px 32px', border: '2px dashed #e2e8f0', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>🏆</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Impossible de charger vos récompenses pour le moment.</div>
      </div>
    );
  }

  const palier = PALIER_INFO_PROF[donnees.palier] || PALIER_INFO_PROF.bronze;
  const badgesFiltres = filtreCategorie === 'tous' ? donnees.badges : donnees.badges.filter(b => b.categorie === filtreCategorie);
  const nbObtenus = donnees.badges.filter(b => b.obtenu).length;

  return (
    <div>
      <div style={tabHeader}>
        <div>
          <h2 style={tabTitle}>🏆 Récompenses</h2>
          <p style={tabSubtitle}>Votre palier, vos badges et vos points sur les 3 derniers mois</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ flex: '1 1 220px', background: `linear-gradient(135deg, ${palier.couleur}22, ${palier.couleur}08)`, border: `1.5px solid ${palier.couleur}55`, borderRadius: 16, padding: 22, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>{palier.icone}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: palier.couleur, marginTop: 4 }}>Palier {palier.lib}</div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>Score glissant : {donnees.score_glissant}/100</div>
          {!donnees.eligible_or_platine && (
            <div style={{ fontSize: 11, color: '#DC2626', marginTop: 8 }}>⚠ Une anomalie ouverte bloque l'accès aux paliers Or/Platine</div>
          )}
        </div>
        <div style={{ flex: '1 1 140px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 22, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{donnees.rang ?? '-'}</div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>Rang ce mois-ci</div>
        </div>
        <div style={{ flex: '1 1 140px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 22, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{nbObtenus}/{donnees.badges.length}</div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>Badges débloqués</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {CATS.map(c => (
          <button key={c.id} onClick={() => setFiltreCategorie(c.id)}
            style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1.5px solid ${filtreCategorie === c.id ? '#0f172a' : '#e2e8f0'}`,
              background: filtreCategorie === c.id ? '#0f172a' : '#fff',
              color: filtreCategorie === c.id ? '#fff' : '#475569' }}>
            {c.lib}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 28 }}>
        {badgesFiltres.map(b => (
          <div key={b.code} style={{
            background: b.obtenu ? '#fff' : '#F8FAFC', border: `1px solid ${b.obtenu ? '#e2e8f0' : '#f1f5f9'}`,
            borderRadius: 14, padding: 16, opacity: b.obtenu ? 1 : 0.5,
          }}>
            <div style={{ fontSize: 26, marginBottom: 8, filter: b.obtenu ? 'none' : 'grayscale(1)' }}>{b.icone}</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{b.nom}</div>
            <div style={{ fontSize: 11.5, color: '#475569', marginTop: 4, lineHeight: 1.4 }}>{b.description}</div>
            {b.obtenu && b.obtenu_le && (
              <div style={{ fontSize: 10.5, color: '#059669', marginTop: 8, fontWeight: 600 }}>
                ✓ Obtenu le {new Date(b.obtenu_le).toLocaleDateString('fr-FR')}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>📜 Derniers points reçus</div>
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {donnees.historique.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Aucun point pour le moment.</div>
        ) : donnees.historique.map((h, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: i < donnees.historique.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
            <div>
              <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600 }}>{h.description}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{new Date(h.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: h.points >= 0 ? '#059669' : '#DC2626' }}>{h.points >= 0 ? '+' : ''}{h.points}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EspaceProfesseur() {
  const navigate = useNavigate();

  // Profil réel du coach connecté (localStorage en priorité, remplacé par fetch frais)
  const coachStored = JSON.parse(localStorage.getItem("coach_profil") || "null");
  // Le coach etait le seul espace du personnel sans surnom : sa fiche affichait l'etat
  // civil complet la ou les quatorze dashboards laissent choisir un prenom d'usage.
  const [monProfilOuvert, setMonProfilOuvert] = useState(false);
  const [surnomPerso, setSurnomPerso] = useState(() => {
    try { return JSON.parse(localStorage.getItem("coach_profil") || "{}").surnom || ""; } catch { return ""; }
  });
  const [profilFrais, setProfilFrais] = useState(null);

  // Sa note d'observation. Elle determine la categorie de contrat a laquelle il peut
  // pretendre : la lui cacher revenait a le laisser decouvrir son classement au moment
  // de la negociation. Route dediee - /classement renverrait les notes de tous.
  const [maNote, setMaNote] = useState({ moyenne: null, nb_evaluations: 0, nb_avec_note: 0 });
  useEffect(() => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    if (!token) return;
    fetch(`${API_URL}/api/coachs/ma-note`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && d.moyenne !== undefined) setMaNote(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    if (!token) return;
    let annule = false;

    // Rafraîchit profilFrais (donc coachBase et peut()) au montage puis toutes les 60s -
    // sans ça, une permission modifiée depuis la Matrice des permissions ne s'appliquait
    // jamais tant que ce coach restait connecté. Même pattern que utils/permissions.js.
    function rafraichir() {
      fetch(`${API_URL}/api/admin/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (annule || !data?.profil) return;
          setProfilFrais(data.profil);
          if (data.profil.acces_elearning !== undefined) setAccesElearning(data.profil.acces_elearning === true);
          if (sessionStorage.getItem("_bet_color_guard")) { sessionStorage.removeItem("_bet_color_guard"); return; }
          const freshColor = data.profil.couleur || null;
          const _cp = (() => { try { return JSON.parse(localStorage.getItem("coach_profil")||"{}"); } catch { return {}; } })();
          localStorage.setItem("coach_profil", JSON.stringify({ ...data.profil, couleur: data.profil.couleur || _cp.couleur || null }));
          if (freshColor && freshColor !== BET) {
            window.location.reload();
          }
        })
        .catch(() => {});
    }

    rafraichir();
    const intervalId = setInterval(rafraichir, 60000);
    return () => { annule = true; clearInterval(intervalId); };
  }, []);

  const coachBase = profilFrais || coachStored;
  const peut = useCallback((module, action) => hasPermission(coachBase, module, action), [coachBase]);
  const permBtnStyle = (style, allowed) => allowed ? style : { ...style, opacity:0.45, cursor:"not-allowed", filter:"grayscale(70%)" };
  const permBtnTitle = (label, allowed) => allowed ? label : "🔒 Vous n'avez pas la permission pour cette action";
  const coachCentreId    = coachBase?.scope?.find(s => s !== "national") || null;
  const coachCentreLabel = coachCentreId ? (CENTRES_LABELS[coachCentreId] || coachCentreId) : null;

  const MON_PROFIL_REEL = coachBase ? {
    id:              coachBase.id,
    nom:             coachBase.nom       || "-",
    prenom:          coachBase.prenom    || "-",
    avatar:          ((coachBase.prenom?.[0] || "") + (coachBase.nom?.[0] || "")).toUpperCase() || "CO",
    photo_url:       coachBase.avatar_url || coachBase.coach_info?.photo_url || null,
    email:           coachBase.email     || "-",
    phone:           coachBase.telephone || "-",
    specialite:      coachBase.departement || "Anglais",
    niveauxEnseignes:["B1","B2","C1"],
    dateRecrutement: coachBase.date_creation?.slice(0,10) || "-",
    // Aucun système de notation coach n'existe encore en base (le module "avis" ne
    // couvre que les offres, pas les coachs) - on n'invente pas une note fictive.
    notation: null, nbAvis: 0,
    coursActifs: 0, totalEtudiants: 0, heuresMois: 0,
    xp:"Coach",
    certifications: (() => { const c = coachBase.coach_info?.certifications; if (!c) return []; if (Array.isArray(c)) return c; return String(c).split(",").map(s=>s.trim()).filter(Boolean); })(),
    nbr_contrats_actifs: coachBase.nbr_contrats_actifs ?? null,
  } : MON_PROFIL;

  const { lang, toggleLang } = useLanguage();
  const { notifications: toutesNotifsCoach, nbNonLues: nbNotifsNonLues, marquerLue: marquerNotifLueCoach } = useNotifications(MON_PROFIL_REEL?.id);
  const [banderoleFermeeCoach, setBanderoleFermeeCoach] = useState(false);
  const notifsBanderoleCoach = toutesNotifsCoach.filter(n => !n.lu).slice(0, 3);

  const [accesElearning, setAccesElearning] = useState(coachBase?.acces_elearning === true);

  const confirm = useConfirm();
  const handleLogout = async () => {
    if (!(await confirm('Vous allez être déconnecté(e) de votre session.', { titre: 'Se déconnecter ?', confirmLabel: 'Se déconnecter', danger: false }))) return;
    clearAllSessionStorage();
    // "/bet-staff-access" est la page de login (le portail d'accès "/" a été déplacé vers
    // "/access" et ne sert plus que de code d'entrée, sans lien direct vers le login).
    window.location.replace("/bet-staff-access");
  };

  const [activeTab, setActiveTab]             = useTabState("dashboard");
  const [coachAvatarUrl, setCoachAvatarUrl]   = useState(() => {
    try { return JSON.parse(localStorage.getItem("coach_profil")||"{}").avatar_url || null; } catch { return null; }
  });
  // Cliquer sur la photo la montre en grand ; le bouton 📷 garde le remplacement.
  const [photoProfilOuverte, setPhotoProfilOuverte] = useState(false);

  const handleCoachAvatarSuccess = async (file) => {
    setCoachAvatarUrl(file.url);
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    try {
      const r = await fetch(`${API_URL}/api/admin/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatar_url: file.url }),
      });
      if (r.ok) {
        const cp = (() => { try { return JSON.parse(localStorage.getItem("coach_profil")||"{}"); } catch { return {}; } })();
        localStorage.setItem("coach_profil", JSON.stringify({ ...cp, avatar_url: file.url }));
        toast.success("Photo de profil mise à jour !");
      } else { toast.error("Erreur lors de la sauvegarde."); }
    } catch { toast.error("Erreur réseau."); }
  };

  const [disponibilites, setDisponibilites]   = useState(initDispo);
  const [dispoSaved,    setDispoSaved]        = useState(false);
  const [dispoLoading,  setDispoLoading]      = useState(false);
  // Disponibilités renseignées mois par mois - la dispo d'un coach change chaque mois
  const [dispoMois,             setDispoMois]             = useState(() => new Date().getMonth() + 1);
  const [dispoAnnee,            setDispoAnnee]             = useState(() => new Date().getFullYear());
  const [dispoMoisCourantRempli, setDispoMoisCourantRempli] = useState(null); // null = pas encore su, true/false ensuite
  const [dispoPreRempli,        setDispoPreRempli]         = useState(false); // true si les créneaux affichés viennent du mois précédent (pas encore enregistrés pour ce mois)
  const [cours, setCours]                     = useState([]);
  const [seances, setSeances]                 = useState([]);
  const [etudiants, setEtudiants]             = useState([]);
  const [etudiantsLoading, setEtudiantsLoading] = useState(true);
  const [ressources, setRessources]           = useState([]);
  const [evaluations, setEvaluations]         = useState([]);
  const [messages, setMessages]               = useState([]);

  /* modals */
  const [showEtudModal, setShowEtudModal]     = useState(false);
  const [selectedEtud, setSelectedEtud]       = useState(null);
  const [showSeanceModal, setShowSeanceModal] = useState(false);
  const [selectedSeance, setSelectedSeance]  = useState(null);
  // Modal détails session (Planning)
  const [showSessionDetailModal, setShowSessionDetailModal] = useState(false);
  const [sessionDetailData, setSessionDetailData] = useState(null);
  // Modal présentiel (présences + clôture)
  const [showPresentielModal, setShowPresentielModal] = useState(false);
  const [presentielSession, setPresentielSession] = useState(null);
  const [presentielApprenants, setPresentielApprenants] = useState([]);
  const [presentielPresences, setPresentielPresences] = useState({});
  const [presentielCloturing, setPresentielCloturing] = useState(false);
  const [chronoPresentiel,    setChronoPresentiel]    = useState(0);
  const [showMsgModal, setShowMsgModal]       = useState(false);
  const [selectedMsg, setSelectedMsg]         = useState(null);
  const [showAddRessModal, setShowAddRessModal]= useState(false);
  const [showNoteModal, setShowNoteModal]     = useState(false);
  const [noteForm, setNoteForm]               = useState({ etudiantId:"", evalNom:"", score:"", total:"20", commentaire:"" });
  const [notesData, setNotesData]             = useState([]);
  const [notesDataLoading, setNotesDataLoading] = useState(false);
  const [noteDetailModal, setNoteDetailModal] = useState(null);
  const [ressForm, setRessForm]               = useState({ titre:"", type:"pdf", groupe_ids:[], taille:"", partage:true, url:"", fichierNom:"", speakConsigne:"", speakPrepTime:30, speakRecordTime:60, speakType:"independant", speakNiveau:"B2", speakTip:"" });
  const [presenceSeance, setPresenceSeance]   = useState(null);
  const [presenceData, setPresenceData]       = useState({});

  /* filtres */
  const [filtEtudCours, setFiltEtudCours]     = useState("Tous");
  const [filtEtudNiveau, setFiltEtudNiveau]   = useState("Tous");
  const [searchEtud, setSearchEtud]           = useState("");
  const [filtSeanceSt, setFiltSeanceSt]       = useState("Tous");
  const [filtRessType, setFiltRessType]        = useState("Tous");
  const [filtRessGroupe, setFiltRessGroupe]    = useState(null); // null = toutes classes
  // ── Médiathèque ──
  // Cinq états de filtrage déclarés puis jamais lus ont été retirés ici : ils étaient la
  // trace de trois tentatives successives de filtrage empilées, dont une seule servait.
  const [mediathFiltreCours, setMediathFiltreCours] = useState("tous");  // "tous" | groupe_id
  const [mediathStatut,      setMediathStatut]      = useState("tous");  // "tous"|"publie"|"brouillon"
  const [searchMediath,      setSearchMediath]      = useState("");
  const [mediathFamille,     setMediathFamille]     = useState("toutes"); // toutes|actives|terminees
  // { contenu, data, loading } - qui a lu ce contenu, et qui ne l'a pas ouvert.
  const [lecteursModal,      setLecteursModal]      = useState(null);
  // Compteurs de lecture par contenu, chargés en une fois pour la colonne « Lu par ».
  const [luParContenu,       setLuParContenu]       = useState({});
  // { action:"publier"|"depublier"|"supprimer", contenu } - publier prévient tous les
  // apprenants des classes visées, ce qui ne se rattrape pas : la confirmation annonce
  // donc combien de personnes vont recevoir la notification.
  const [confirmContenu,     setConfirmContenu]     = useState(null);
  const [envoyerEmailPub,    setEnvoyerEmailPub]    = useState(false);
  const [semaine, setSemaine]                 = useState(0);


  // messages améliorés
  const [showNewMsgModal, setShowNewMsgModal] = useState(false);
  const [newMsgForm, setNewMsgForm] = useState({ destinataire:"etudiant", etudiantId:"", objet:"", message:"" });
  const [filterMsgLu, setFilterMsgLu] = useState("Tous");
  const [searchMsg, setSearchMsg] = useState("");
  const [activeConvMsg, setActiveConvMsg] = useState(null);
  const [convReply, setConvReply] = useState("");
  const [filterMsgType, setFilterMsgType] = useState("Tous");

  // évaluations
  const [showCreateEvalModal, setShowCreateEvalModal] = useState(false);
  const [evalForm, setEvalForm] = useState({ groupe_id:"", titre:"", date_limite:"", heure_limite:"23:59", date_ouverture:"", heure_ouverture:"", type:"qcm", categorie:"devoir", typeRendu:"fichier", surTOEIC:false, dureeMin:60, questions:[], ressourceUrl:"", instructions:"", notifierEleves:true, envoyerEmail:false, blocs:[] });
  const [evalQForm, setEvalQForm] = useState({ texte:"", options:["","","",""], correct:"", media:"" });
  const [evalBlocEditing, setEvalBlocEditing] = useState(null); // id du bloc en cours d'édition dans "Créer évaluation"
  const [uploadExerciceEnCours, setUploadExerciceEnCours] = useState(false);
  const [uploadBlocEnCours, setUploadBlocEnCours] = useState(null); // id du bloc en cours d'upload
  async function uploaderFichierVers(file, onSuccess, setLoading) {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    if (!token) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetchUpload(`${API_URL}/api/upload/fichier-classe`, { method:"POST", headers:{ Authorization:`Bearer ${token}` }, body:fd });
      if (!r.ok) { const d = await r.json().catch(()=>({})); toast.error(d.error || "Échec de l'envoi du fichier"); return; }
      const d = await r.json();
      onSuccess(d.url);
    } catch {
      toast.error("Impossible de joindre le serveur");
    } finally {
      setLoading(false);
    }
  }
  const uploaderExerciceDevoir = (file) =>
    uploaderFichierVers(file, url => setEvalForm(p => ({ ...p, ressourceUrl: url })), setUploadExerciceEnCours);
  const uploaderRessourceBloc = (blocId, file) =>
    uploaderFichierVers(file, url => updateEvalBloc(blocId, { ressourceUrl: url }), (v) => setUploadBlocEnCours(v ? blocId : null));
  const [evalsLoading,       setEvalsLoading]       = useState(false);
  const [evalEditId,         setEvalEditId]         = useState(null);
  const [evalResultatsModal, setEvalResultatsModal] = useState(null);
  const [evalResultatDetail, setEvalResultatDetail] = useState(null); // { apprenant, resultat } - rendu ouvert individuellement
  const [validationEnCours, setValidationEnCours] = useState(new Set()); // empêche le double-clic validation définitive des notes
  const [evalCorrectForms,   setEvalCorrectForms]   = useState({});  // keyed by ga_id
  const [sousOngletEval,     setSousOngletEval]     = useState("devoirs");
  const [evalStatutFiltre,   setEvalStatutFiltre]   = useState("tous");
  const [evalClasseFiltre,   setEvalClasseFiltre]   = useState(null);
  const [evalGroupeStatutFiltre, setEvalGroupeStatutFiltre] = useState("actif"); // "actif" | "cloture" | "tous"
  const [rechercheClasseEvalNotes, setRechercheClasseEvalNotes] = useState("");
  const [receptEvalId,       setReceptEvalId]       = useState(null);

  // nouveau module
  const [showNewModuleModal, setShowNewModuleModal] = useState(false);
  const [newModForm, setNewModForm] = useState({ coursId:1, titre:"", objectifs:"", dureeEstimee:60, type_contenu:"lecon", semaine:"", groupe_id:"", statut:"brouillon" });
  const [etapeModule, setEtapeModule] = useState(1);

  // nouveau cours

  // ── Assistant de création d'un contenu ──────────────────────────────────
  // Il n'y a plus qu'un assistant : le niveau « Cours » supprimé, créer un contenu ne
  // demande plus de créer d'abord son conteneur. `groupe_ids` remplace `groupe_id` - le
  // coach coche autant de classes qu'il veut, au lieu de dupliquer le même contenu.
  const [showWizard, setShowWizard]       = useState(false);
  const [wizardStep, setWizardStep]       = useState(1);
  const [wizardCreating, setWizardCreating] = useState(false);
  const WIZARD_INIT = {
    groupe_ids:[], mod_titre:"", mod_type:"lecon", mod_duree:60, mod_objectifs:"", mod_statut:"brouillon",
  };
  const [wiz, setWiz] = useState(WIZARD_INIT);
  const setW = (k, v) => setWiz(p => ({ ...p, [k]: v }));
  const basculerClasseWiz = (id) => setWiz(p => ({
    ...p,
    groupe_ids: p.groupe_ids.includes(id) ? p.groupe_ids.filter(x => x !== id) : [...p.groupe_ids, id],
  }));
  const openWizard = (prefill={}) => { setWiz({ ...WIZARD_INIT, ...prefill }); setBlocs([]); setWizardStep(1); setShowWizard(true); };

  const createWizard = async () => {
    if (wizardCreating) return;
    if (!wiz.mod_titre.trim()) { toast.error("Titre du contenu requis"); return; }
    /* AU MOINS UNE CLASSE, brouillon compris. Seule la publication était contrôlée
       jusqu'ici : un brouillon sans destinataire n'est lu par personne et n'apparaît dans
       aucune médiathèque - qui filtre par classe -, si bien que son auteur lui-même ne le
       retrouvait plus. Un contenu se rattache d'abord, se rédige ensuite. */
    if (!wiz.groupe_ids.length) {
      toast.error("Choisissez au moins une classe destinataire");
      return;
    }
    setWizardCreating(true);
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    try {
      const r = await fetch(`${API_URL}/api/cours-elearning`, {
        method:"POST",
        headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({
          titre:         wiz.mod_titre.trim(),
          groupe_ids:    wiz.groupe_ids,
          type_contenu:  wiz.mod_type,
          duree_estimee: Number(wiz.mod_duree),
          objectifs:     wiz.mod_objectifs.split("\n").filter(Boolean),
          blocs:         blocs.map((b,i)=>({ ...b, ordre:i+1 })),
          // Un contenu sans bloc reste brouillon quoi qu'on demande : publier une coquille
          // vide notifierait les apprenants d'un contenu qu'ils ne pourraient pas ouvrir.
          statut:        blocs.length > 0 ? wiz.mod_statut : "brouillon",
          ordre:         1,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur lors de la création");

      const contenu = d.contenu;
      setCours(prev => [contenu, ...prev]);
      setModulesContent(prev => ({ ...prev, [contenu.id]: {
        id: contenu.id, titre: contenu.titre, objectifs: contenu.objectifs,
        dureeEstimee: contenu.dureeEstimee, statut: contenu.statut,
        blocs: contenu.blocs, ordre: contenu.ordre,
      } }));

      const n = wiz.groupe_ids.length;
      toast.success(contenu.statut === "publie"
        ? `« ${contenu.titre} » publié vers ${n} classe${n>1?"s":""} ✓`
        : `« ${contenu.titre} » enregistré en brouillon ✓`);
      setShowWizard(false);
      setWiz(WIZARD_INIT);
      setBlocs([]);
      setActiveTab("modules_contenu");
    } catch(e) { toast.error(e.message); }
    finally { setWizardCreating(false); }
  };

  // signal au responsable
  const [showSignalModal, setShowSignalModal] = useState(false);

  const [signalForm, setSignalForm] = useState({ type:"probleme_technique", sujet:"", description:"", urgence:"normale" });

  // ── Signalement d'absence / Mes demandes ─────────────────────────────────
  const MOTIFS_ABSENCE = ['Maladie', 'Congé personnel', 'Formation', 'Congé maternité', 'Urgence familiale', 'Autre'];
  const STATUT_DEMANDE = {
    a_pourvoir: { label:'🔴 En attente d\'un remplaçant', c:'#991B1B', bg:'#FEE2E2' },
    en_cours:   { label:'🟠 Remplaçant assigné',           c:'#92400E', bg:'#FEF3C7' },
    termine:    { label:'✅ Terminé',                       c:'#166534', bg:'#DCFCE7' },
    refuse:     { label:'❌ Refusé',                        c:'#991B1B', bg:'#FEE2E2' },
  };
  const [modalAbsence,    setModalAbsence]    = useState(false);
  const [formAbsence,     setFormAbsence]     = useState({ motif:'Maladie', dateDebut:'', dateFin:'', message:'', sessionsIds:[] });
  const [absenceEnvoyee,  setAbsenceEnvoyee]  = useState(false);
  const [absenceEnvoi,    setAbsenceEnvoi]    = useState(false);
  const [demandesAbsence, setDemandesAbsence] = useState([]);
  const [demandesLoading, setDemandesLoading] = useState(false);
  const [filtreDemandesStatut, setFiltreDemandesStatut] = useState('tous');
  const [pageDemandes, setPageDemandes] = useState(1);
  const DEMANDES_PAR_PAGE = 8;
  const [demandeDetail, setDemandeDetail] = useState(null);
  // Vraies séances (groupe) du coach, servant à choisir quoi couvrir dans "Signaler une absence"
  const [seancesReellesAbsence, setSeancesReellesAbsence] = useState([]);

  // Séances réelles du jour (Tableau de bord - KPI "Séances aujourd'hui")
  const [seancesDuJour, setSeancesDuJour] = useState([]);
  useEffect(() => {
    if (activeTab !== "dashboard") return;
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    if (!token) return;
    const now = new Date();
    const aujourdHui = now.toISOString().slice(0, 10);
    fetch(`${API_URL}/api/seances?mois=${now.getMonth()+1}&annee=${now.getFullYear()}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setSeancesDuJour((d.seances || []).filter(s => s.date_seance === aujourdHui)))
      .catch(() => setSeancesDuJour([]));
  }, [activeTab]);

  // Onglet Planning - le state `seances` n'était alimenté par AUCUN fetch (uniquement mutable
  // localement via confirmer/clôturer), donc le badge "à venir" et le calendrier étaient
  // structurellement toujours vides. `/api/seances` filtre déjà côté serveur sur le coach
  // connecté (req.role === "coach"), donc pas besoin de coach_id ici.
  useEffect(() => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    if (!token) return;
    fetch(`${API_URL}/api/seances`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        const statutMap = { planifiee: "planifie", realisee: "termine", annulee: "annule" };
        setSeances((d.seances || []).map(s => ({
          id:         s.id,
          date:       s.date_seance,
          heure:      s.heure_debut || "00:00",
          titre:      s.titre || "Séance",
          type:       s.type_cours === "presentiel" ? "presentiel" : "online",
          plateforme: s.type_cours === "presentiel" ? "presentiel" : "en_ligne",
          salle:      s.lieu || (s.type_cours === "presentiel" ? "Présentiel" : "En ligne"),
          duree:      s.duree_h ? `${s.duree_h}h` : "",
          coursId:    s.groupe_id,
          statut:     statutMap[s.statut] || s.statut || "planifie",
          nbInscrits: s.nb_presences_total ?? 0,
          nbPresents: s.nb_presents ?? null,
        })));
      })
      .catch(() => setSeances([]));
  }, []);

  /* Heures REELLEMENT dispensees ce mois-ci.
     `MON_PROFIL_REEL.heuresMois` valait 0 en dur - la tuile « Ce mois / 0h dispensées »
     n'a jamais rien affiche d'autre. On somme ici les seances TERMINEES du mois courant ;
     une seance planifiee n'a pas encore ete dispensee et ne doit pas etre comptee.
     `duree` arrive sous la forme « 1.5h » : on en extrait le nombre. */
  const heuresMoisReelles = useMemo(() => {
    const now = new Date();
    const m = now.getMonth(), y = now.getFullYear();
    return (seances || []).reduce((total, s) => {
      if (s.statut !== "termine" || !s.date) return total;
      const d = new Date(s.date);
      if (Number.isNaN(d.getTime()) || d.getMonth() !== m || d.getFullYear() !== y) return total;
      const h = parseFloat(String(s.duree || "").replace(",", ".").replace(/[^0-9.]/g, ""));
      return total + (Number.isFinite(h) ? h : 0);
    }, 0);
  }, [seances]);

  // Délégations actuellement actives où ce coach est le remplaçant - le backend inclut déjà
  // ces groupes/séances dans les réponses de /api/groupes et /api/seances (élargissement
  // serveur), ceci ne sert qu'à afficher le bandeau/badge "🔁 Remplacement" (nom du titulaire,
  // groupe, sessions couvertes) pour que le coach comprenne pourquoi ce groupe apparaît dans sa
  // liste - même principe que le bandeau `delegationActive` de bet-elearning (AuthContext.jsx).
  const [delegationsRecues, setDelegationsRecues] = useState([]);
  const groupeIdsDelegues = useMemo(() => new Set(delegationsRecues.map(d => d.groupe_id).filter(Boolean)), [delegationsRecues]);
  useEffect(() => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    if (!token) return;
    const charger = () => {
      fetch(`${API_URL}/api/remplacements/delegations/recues?statut=active`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setDelegationsRecues(d.delegations || []))
        .catch(() => {});
    };
    charger();
    // Une PA peut assigner une délégation pendant que ce dashboard reste ouvert (pas de
    // realtime sur `delegations`) - sans ce polling, le coach ne voyait la bannière/le badge
    // qu'après un rechargement manuel de la page.
    const intervalId = setInterval(charger, 30000);
    return () => clearInterval(intervalId);
  }, []);

  const chargerDemandesAbsence = useCallback(() => {
    const moiId = MON_PROFIL_REEL?.id;
    if (!moiId) return;
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    if (!token) return;
    setDemandesLoading(true);
    fetch(`${API_URL}/api/remplacements?absent_id=${moiId}&plateforme=dash`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setDemandesAbsence(d.remplacements || []))
      .catch(() => {})
      .finally(() => setDemandesLoading(false));
  }, [MON_PROFIL_REEL?.id]);

  useEffect(() => { chargerDemandesAbsence(); }, [chargerDemandesAbsence]);

  // Ouvre le détail avec la donnée en cache (instantané), puis rafraîchit en arrière-plan - la
  // liste n'est chargée qu'une fois au montage, sans realtime, donc sans ce refetch le coach
  // verrait un statut/remplaçant périmé si le PA a agi sur la demande depuis.
  function ouvrirDetailDemande(d) {
    setDemandeDetail(d);
    const moiId = MON_PROFIL_REEL?.id;
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    if (!moiId || !token) return;
    fetch(`${API_URL}/api/remplacements?absent_id=${moiId}&plateforme=dash`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        const frais = data.remplacements || [];
        setDemandesAbsence(frais);
        const jour = frais.find(r => r.id === d.id);
        if (jour) setDemandeDetail(jour);
      })
      .catch(() => {});
  }

  function ouvrirModalAbsence(sessionPreSelectId = null) {
    const today = new Date().toISOString().slice(0, 10);
    const ids = sessionPreSelectId ? [sessionPreSelectId] : [];
    setFormAbsence({ motif:'Maladie', dateDebut:today, dateFin:today, message:'', sessionsIds:ids });
    setAbsenceEnvoyee(false);
    setModalAbsence(true);
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    if (token) {
      fetch(`${API_URL}/api/seances?statut=planifiee`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setSeancesReellesAbsence(d.seances || []))
        .catch(() => setSeancesReellesAbsence([]));
    }
  }

  function sessionsAbsenceDansPeriode(debut, fin) {
    if (!debut || !fin) return [];
    return seancesReellesAbsence.filter(s => s.date_seance >= debut && s.date_seance <= fin);
  }

  async function envoyerDemandeAbsence() {
    const toutesSelectionnees = sessionsAbsenceDansPeriode(formAbsence.dateDebut, formAbsence.dateFin)
      .filter(s => formAbsence.sessionsIds.length === 0 || formAbsence.sessionsIds.includes(s.id));
    // Une absence peut couvrir plusieurs classes à la fois (le sélecteur ne filtre que par
    // date, pas par classe) - mais le serveur n'accepte qu'une seule classe par demande
    // (groupe_id singulier : remplaçant, clôture et notifications sont gérés par classe).
    // On regroupe donc les séances sélectionnées par classe et on envoie une demande par
    // groupe, en une seule action pour le coach.
    const parGroupe = {};
    toutesSelectionnees.forEach(s => {
      if (!s.groupe_id) return;
      (parGroupe[s.groupe_id] ||= []).push(s);
    });
    const groupeIds = Object.keys(parGroupe);
    if (!groupeIds.length) { toast.error("Aucune séance valide sélectionnée"); return; }

    // Identifiant commun à toutes les demandes issues de cette déclaration - permet à la PA
    // de retrouver les demandes-sœurs (mêmes classes, même absence) et de choisir : un seul
    // remplaçant pour tout le lot, ou une assignation différente par classe.
    const lotId = groupeIds.length > 1 ? crypto.randomUUID() : null;

    setAbsenceEnvoi(true);
    try {
      const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
      const resultats = await Promise.all(groupeIds.map(async (groupe_id) => {
        const sessionsDuGroupe = parGroupe[groupe_id];
        const grp = groupes.find(g => g.id === groupe_id)?.nom || '-';
        const r = await fetch(`${API_URL}/api/remplacements`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            groupe_id,
            groupe_nom:   grp,
            date_debut:   formAbsence.dateDebut,
            date_fin:     formAbsence.dateFin,
            nb_sessions:  sessionsDuGroupe.length,
            sessions_ids: sessionsDuGroupe.map(s => s.id),
            motif:        formAbsence.motif,
            message:      formAbsence.message,
            plateforme:   'dash',
            lot_id:       lotId,
          }),
        });
        const d = await r.json().catch(() => ({}));
        return { ok: r.ok, groupe: grp, data: d };
      }));

      const echecs = resultats.filter(r => !r.ok);
      const succes = resultats.filter(r => r.ok);
      if (succes.length) {
        setDemandesAbsence(prev => [...succes.map(r => r.data.remplacement), ...prev]);
      }
      if (echecs.length) {
        toast.error(`Échec pour ${echecs.map(e => e.groupe).join(", ")} : ${echecs[0].data.error || "erreur serveur"}`);
      }
      if (succes.length && !echecs.length) {
        setAbsenceEnvoyee(true);
      } else if (succes.length) {
        toast.success(`${succes.length} demande(s) envoyée(s) (${succes.map(s => s.groupe).join(", ")})`);
        setModalAbsence(false);
      }
    } catch (err) {
      toast.error("Erreur lors de l'envoi : " + err.message);
    } finally {
      setAbsenceEnvoi(false);
    }
  }

  // profil contrat coach (grade, type_contrat, taux_horaire)
  const [coachMoi, setCoachMoi] = useState(null);

  // ── Mes honoraires (réel, connecté à honoraires_mois / seances) ──────────
  const _MOIS_HON = ['','Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
  const [honMoisSel, setHonMoisSel] = useState(new Date().getMonth() + 1);
  const [honAnneeSel, setHonAnneeSel] = useState(new Date().getFullYear());
  const [monHonoraire, setMonHonoraire] = useState(null);
  const [monHonSeances, setMonHonSeances] = useState([]);
  const [honLoading, setHonLoading] = useState(false);
  const [honSeanceDetail, setHonSeanceDetail] = useState(null);
  const [honSeancePresences, setHonSeancePresences] = useState([]);
  const [honSeancePresencesLoading, setHonSeancePresencesLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== "honoraires") return;
    let annule = false;
    setHonLoading(true);
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    const hdr = { Authorization: `Bearer ${token}` };
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/seances/honoraires-mois?mois=${honMoisSel}&annee=${honAnneeSel}`, { headers: hdr });
        const d = await r.json();
        const hon = (d.honoraires || [])[0] || null;
        if (annule) return;
        setMonHonoraire(hon);
        if (hon) {
          const r2 = await fetch(`${API_URL}/api/seances/honoraires-mois/${hon.id}/seances`, { headers: hdr });
          const d2 = await r2.json();
          if (!annule) setMonHonSeances(d2.seances || []);
        } else if (!annule) {
          setMonHonSeances([]);
        }
      } catch {
        if (!annule) { setMonHonoraire(null); setMonHonSeances([]); }
      } finally {
        if (!annule) setHonLoading(false);
      }
    })();
    return () => { annule = true; };
  }, [activeTab, honMoisSel, honAnneeSel]);

  useEffect(() => {
    if (!honSeanceDetail) { setHonSeancePresences([]); return; }
    let annule = false;
    setHonSeancePresencesLoading(true);
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    const hdr = { Authorization: `Bearer ${token}` };
    fetch(`${API_URL}/api/seances/${honSeanceDetail.id}/presences`, { headers: hdr })
      .then(r => r.ok ? r.json() : { presences: [] })
      .then(d => { if (!annule) setHonSeancePresences(d.presences || []); })
      .catch(() => { if (!annule) setHonSeancePresences([]); })
      .finally(() => { if (!annule) setHonSeancePresencesLoading(false); });
    return () => { annule = true; };
  }, [honSeanceDetail]);

  // groupes
  const [groupes, setGroupes] = useState([]);
  const [groupesLoading, setGroupesLoading] = useState(false);
  const [apprenantsPrive, setApprenantsPrive] = useState([]);
  const [selectedPrive,   setSelectedPrive]   = useState(null);
  const [priveTab,        setPriveTab]        = useState("infos");
  // Séances privées
  const [seancesPrivees,      setSeancesPrivees]      = useState([]);
  const [seancesLoading,      setSeancesLoading]      = useState(false);
  const [showSeanceForm,      setShowSeanceForm]       = useState(false);
  const [seanceForm,          setSeanceForm]           = useState({ date_seance:"", heure_debut:"", duree_h:"1.5", lieu:"cabinet", notes:"" });
  const [seanceSaving,        setSeanceSaving]         = useState(false);
  // Présences privées
  const [presencesPrivees,    setPresencesPrivees]     = useState([]);
  const [presencesLoading,      setPresencesLoading]      = useState(false);
  const [showPresenceForm,      setShowPresenceForm]      = useState(false);
  const [presenceForm,          setPresenceForm]          = useState({ date_presence:"", statut:"present", motif:"", note:"" });
  const [presencePriveeSaving,  setPresencePriveeSaving]  = useState(false);
  // Fichiers privés
  const [fichiersPrives,        setFichiersPrives]        = useState([]);
  const [fichiersPrivesLoading, setFichiersPrivesLoading] = useState(false);
  const [fichierPriveUploading, setFichierPriveUploading] = useState(false);
  const [selectedGroupe, setSelectedGroupe] = useState(null);
  // filtre classe partagé entre Apprenants / Présences / Évaluations / Notes
  const [filtreGroupeTab, setFiltreGroupeTab] = useState(null); // null = toutes classes
  const [filtreGroupeStatutEtud, setFiltreGroupeStatutEtud] = useState("actif"); // "actif" | "cloture" | "tous"
  const [rechercheClasseEtud, setRechercheClasseEtud] = useState("");
  const [filtreGroupeStatutRess, setFiltreGroupeStatutRess] = useState("actif"); // "actif" | "cloture" | "tous"
  const [rechercheClasseRess, setRechercheClasseRess] = useState("");
  const [filtreGroupeStatutPres, setFiltreGroupeStatutPres] = useState("actif"); // "actif" | "cloture" | "tous"
  const [rechercheClassePres, setRechercheClassePres] = useState("");
  const [etudPage, setEtudPage] = useState(1);
  const ETUD_PER_PAGE = 15;
  const [groupeApprenants, setGroupeApprenants] = useState([]);
  const [groupeFichiers, setGroupeFichiers] = useState([]);
  const [groupeSubTab, setGroupeSubTab] = useState("apprenants");
  // Historique réel des cours dispensés, mois par mois. L'onglet « Honoraire » voisin
  // simule UN mois depuis la grille tarifaire ; celui-ci lit ce qui a réellement eu lieu.
  const [histoContrat,   setHistoContrat]   = useState(null);
  const [histoLoading,   setHistoLoading]   = useState(false);
  const [histoMoisOuvert,setHistoMoisOuvert]= useState(null);
  const [contratSubTab,     setContratSubTab]     = useState("groupes"); // "groupes" | "prives"
  const [contratPage,       setContratPage]       = useState(0);
  const [contratSearch,     setContratSearch]     = useState("");
  const [contratFiltreStatut, setContratFiltreStatut] = useState("tous");
  const [contratSort,       setContratSort]       = useState("desc"); // "desc" = plus récent, "asc" = plus ancien
  // Pagination cours privés
  const [privePage,         setPrivePage]         = useState(0);
  const [priveSearch,       setPriveSearch]       = useState("");
  // détail apprenant (modal)
  const [apprenantDetail, setApprenantDetail]           = useState(null);
  const [ficheFicheTab, setFicheFicheTab]               = useState("profil"); // profil | test | presences | suivi | progression | notes | devoirs | parents
  const [ficheNotePatch, setFicheNotePatch]             = useState(null); // note JSONB en cours d'édition
  const [ficheNoteSaving, setFicheNoteSaving]           = useState(false);
  const [newSuivi,  setNewSuivi]  = useState({ type:"observation", texte:"" });
  const [newMs,     setNewMs]     = useState({ type:"niveau", valeur:"", commentaire:"" });
  const [newNote,   setNewNote]   = useState({ titre:"", note:"", sur:20, date:new Date().toISOString().slice(0,10), commentaire:"" });
  const [newDev,    setNewDev]    = useState({ titre:"", date_donne:new Date().toISOString().slice(0,10), date_limite:"", commentaire:"" });
  const [newP,      setNewP]      = useState({ nom:"", prenom:"", relation:"Père", telephone:"", email:"" });
  const [ficheAcces, setFicheAcces]                     = useState(null);
  const [ficheAccesLoad, setFicheAccesLoad]             = useState(false);
  const [ficheTest, setFicheTest]                       = useState(null);
  const [ficheTestLoading, setFicheTestLoading]         = useState(false);
  const [fichePres, setFichePres]                       = useState([]);
  const [fichePresLoading, setFichePresLoading]         = useState(false);

  // ── Sessions live ──────────────────────────────────────────
  const [liveSessions, setLiveSessions] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [showLiveForm, setShowLiveForm] = useState(false);
  const [liveEditId, setLiveEditId] = useState(null);
  const [savingLiveSession, setSavingLiveSession] = useState(false); // empêche le double-clic création/modif session live
  const [liveForm, setLiveForm] = useState({ titre:"", plateforme:"zoom", lien:"", date:"", heure:"", heure_fin:"", duree:60, groupe_id:"", notes:"" });
  const [modeMultiple, setModeMultiple] = useState(false);
  const [formNouvelleSession, setFormNouvelleSession] = useState({ titre:"", type_session:"ligne", lien_visio:"", date_session:"", heure_debut:"", heure_fin:"", groupe_id:"", notes_prof:"", contenu_ids:[] });
  const [sessionsMultiples, setSessionsMultiples] = useState([{ titre:"", date_session:"", heure_debut:"", heure_fin:"", lien_visio:"", contenu_ids:[] }]);
  const [commonFields, setCommonFields] = useState({ groupe_id:"", heure_debut:"", heure_fin:"", lien_visio:"", type_session:"ligne" });
  const [salleOuverte, setSalleOuverte] = useState(null);
  const [modalVideoOuvert, setModalVideoOuvert] = useState(false);
  const [presencesLive, setPresencesLive] = useState({});
  const [chatLive, setChatLive] = useState([]);
  const [chatInputLive, setChatInputLive] = useState("");
  const [chronoSec, setChronoSec] = useState(0);
  const [mainLeveesLive, setMainLeveesLive] = useState([]);
  const [sessionsRealisees, setSessionsRealisees] = useState(new Set());
  const [apprenantsSalle, setApprenantsSalle] = useState([]);
  const [sessionEnCours, setSessionEnCours] = useState(null); // full session object when salle is open
  const [sessionsDepliees, setSessionsDepliees] = useState(new Set());
  const [seancesDepliees, setSeancesDepliees] = useState(new Set());

  // Modal de confirmation générique
  const [confirmModal, setConfirmModal] = useState({ open:false, title:"", message:"", confirmLabel:"Confirmer", confirmColor:"#dc2626", onConfirm:null });
  const openConfirm = (title, message, onConfirm, confirmLabel="Confirmer", confirmColor="#dc2626") => setConfirmModal({ open:true, title, message, onConfirm, confirmLabel, confirmColor });
  const closeConfirm = () => setConfirmModal(m => ({ ...m, open:false, onConfirm:null }));

  // Corbeille cours groupe
  const [corbeilleList,    setCorbeilleList]    = useState([]);
  const [corbeilleLoading, setCorbeilleLoading] = useState(false);
  const [showCorbeille,    setShowCorbeille]    = useState(false);

  const fetchLiveSessions = async () => {
    const token = localStorage.getItem("coach_token");
    if (!token) return;
    setLiveLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/coachs/sessions-live`, { headers:{ Authorization:`Bearer ${token}` } });
      const d = await r.json();
      setLiveSessions(d.sessions || []);
    } catch { /* silencieux */ }
    finally { setLiveLoading(false); }
  };

  // ── Reprogrammation d'une séance non effectuée ────────────────────────────
  // Une séance dont le créneau est passé et dont la salle n'a JAMAIS été ouverte n'a pas
  // eu lieu. On ne le déduit pas de l'horaire seul - un cours peut commencer en retard -
  // mais de l'absence de démarrage une fois la journée terminée.
  const estSessionNonEffectuee = (s) => {
    if (!s?.date) return false;
    if (s.statut !== "planifiee" || s.demarree_at) return false;
    const fin = new Date(`${s.date}T${s.heure_fin || s.heure || "23:59"}`);
    return new Date() > new Date(fin.getTime() + 2 * 3600 * 1000); // 2 h de tolérance
  };
  const [reprogSession, setReprogSession] = useState(null);
  const [reprogForm,    setReprogForm]    = useState({ date:"", heure:"", heure_fin:"", motif:"" });
  const [reprogBusy,    setReprogBusy]    = useState(false);

  const ouvrirReprogrammation = (s) => {
    setReprogSession(s);
    setReprogForm({ date:"", heure: s.heure || "", heure_fin: s.heure_fin || "", motif:"" });
  };

  const envoyerReprogrammation = async () => {
    if (!reprogSession || !reprogForm.date || !reprogForm.heure) return;
    setReprogBusy(true);
    try {
      const token = localStorage.getItem("coach_token");
      const r = await fetch(`${API_URL}/api/coachs/sessions-live/${reprogSession.id}/reprogrammer`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify(reprogForm),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || "Reprogrammation impossible"); return; }
      setReprogSession(null);
      await fetchLiveSessions();
      alert("Séance reportée. Les apprenants, leurs parents et le suivi pédagogique ont été prévenus.");
    } catch (e) {
      alert("Erreur réseau - la séance n'a pas été reportée.");
    } finally { setReprogBusy(false); }
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short",year:"numeric"}) : "-";
  const fmtChrono = (sec) => [Math.floor(sec/3600), Math.floor((sec%3600)/60), sec%60].map(n=>String(n).padStart(2,"0")).join(":");

  const openPopup = (url) => {
    const w = Math.min(1280, window.screen.width - 40);
    const h = Math.min(800,  window.screen.height - 80);
    const left = Math.round((window.screen.width  - w) / 2);
    const top  = Math.round((window.screen.height - h) / 2);
    /* La salle s'ouvre dans une FENÊTRE À PART : l'onglet du tableau de bord ne reçoit plus
       aucun geste pendant le cours, et la déconnexion automatique s'y déclencherait en
       plein enseignement. On confie la référence au garde-fou, qui considère la personne
       présente tant que cette fenêtre n'est pas fermée. */
    suivreFenetreLive(window.open(url, 'bet_session_live', `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`));
  };

  const ouvrirSalle = (session) => {
    const lien = session.lien || session.lien_visio || "";
    const isJitsi = lien.includes("jit.si") || lien.includes("meet.jit");
    if (lien && !isJitsi) {
      openPopup(lien);
    } else if (isJitsi || !lien) {
      setModalVideoOuvert(true);
    }
    setSalleOuverte(session.id);
    setSessionEnCours(session);
    setPresencesLive({});
    setMainLeveesLive([]);
    setChronoSec(0);
    setChatLive([{ id:Date.now(), auteur:"🤖 Système", systeme:true, texte:`Session "${session.titre}" ouverte - bienvenue !`, ts:new Date().toISOString() }]);

    // Marque la session "en_cours" côté serveur - déclenche la notification superviseur/deputy
    // (best-effort, ne doit jamais bloquer l'ouverture de la salle pour le coach).
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    fetch(`${API_URL}/api/coachs/sessions-live/${session.id}`, {
      method:"PATCH",
      headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
      body:JSON.stringify({ statut:"en_cours" }),
    })
      // On récupère l'horodatage retenu par le serveur - c'est lui qui fait référence pour le
      // chronomètre, et il peut être antérieur à ce clic si la salle était déjà ouverte.
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.session) setSessionEnCours(prev => prev?.id === d.session.id ? { ...prev, ...d.session } : prev); })
      .catch(()=>{});
  };

  const cloturerSalle = async (session) => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");

    // Vérifier que toutes les présences sont renseignées
    const nonRenseignes = apprenantsSalle.filter(a => !presencesLive[a.id] || presencesLive[a.id] === "non_renseigne");
    if (apprenantsSalle.length > 0 && nonRenseignes.length > 0) {
      toast.error(`⚠️ Renseignez d'abord les présences : ${nonRenseignes.length} apprenant(s) sans statut.`);
      return;
    }

    // 1. Sauvegarder les présences (format correct : date_seance + liste[])
    if (session.groupe_id && apprenantsSalle.length > 0) {
      try {
        const liste = apprenantsSalle.map(a => ({
          ga_id:           a.id,
          nom_apprenant:   a.nom_apprenant || a.nom || "",
          prenom_apprenant:a.prenom_apprenant || a.prenom || "",
          statut:          presencesLive[a.id] || "absent",
        }));
        await fetch(`${API_URL}/api/groupes/${session.groupe_id}/presences`, {
          method:"POST",
          headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
          body:JSON.stringify({ date_seance: session.date, liste }),
        });
      } catch (e) { console.warn("[cloturerSalle] Erreur sauvegarde présences:", e.message); }
    }

    // 2. Marquer la session comme terminée dans la DB
    try {
      await fetch(`${API_URL}/api/coachs/sessions-live/${session.id}`, {
        method:"PATCH",
        headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        // Le chronomètre de la salle part avec la clôture : sans lui, personne ne peut
        // dire après coup combien de temps le cours a duré.
        body:JSON.stringify({ statut:"terminee", duree_reelle_s: chronoSec }),
      });
    } catch (e) { console.warn("[cloturerSalle] Erreur PATCH statut:", e.message); }

    setSessionsRealisees(prev => new Set([...prev, session.id]));
    setSalleOuverte(null);
    fetchLiveSessions();
    toast.success("Session clôturée ✅");
  };

  const ouvrirPresentielModal = async (session) => {
    setPresentielSession(session);
    setPresentielPresences({});
    setPresentielApprenants([]);
    setShowPresentielModal(true);
    setChronoPresentiel(0);
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    if (!token) return;

    // Le démarrage se déclare au serveur, exactement comme l'ouverture d'une salle en ligne :
    // il horodate `demarree_at` et fait apparaître la séance « en direct » chez la commerciale
    // et le superviseur - ce qui est exact, le cours a réellement commencé. Une séance déjà
    // terminée n'est pas rouverte : on ne redémarre pas ce qui est clos.
    if (session.statut !== "terminee") {
      fetch(`${API_URL}/api/coachs/sessions-live/${session.id}`, {
        method:"PATCH",
        headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body:JSON.stringify({ statut:"en_cours" }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.session) setPresentielSession(prev => prev?.id === d.session.id ? { ...prev, ...d.session } : prev); })
        .catch(e => console.warn("[presentiel] démarrage non enregistré:", e.message));
    }

    if (!session.groupe_id) return;
    fetch(`${API_URL}/api/groupes/${session.groupe_id}`, { headers:{ Authorization:`Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { apprenants:[] })
      .then(d => setPresentielApprenants((d.apprenants||[]).filter(a => a.statut==="actif" && !a.acces_bloque)))
      .catch(() => {});
  };

  const cloturerPresentiel = async () => {
    if (!presentielSession || presentielCloturing) return;
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    const nonRenseignesPre = presentielApprenants.filter(a => !presentielPresences[a.id]);
    if (presentielApprenants.length > 0 && nonRenseignesPre.length > 0) {
      toast.error(`⚠️ Renseignez d'abord les présences : ${nonRenseignesPre.length} apprenant(s) sans statut.`);
      return;
    }
    setPresentielCloturing(true);
    if (presentielSession.groupe_id && presentielApprenants.length > 0) {
      const liste = presentielApprenants.map(a => ({
        ga_id:            a.id,
        nom_apprenant:    a.nom_apprenant || a.nom || "",
        prenom_apprenant: a.prenom_apprenant || a.prenom || "",
        statut:           presentielPresences[a.id] || "absent",
      }));
      await fetch(`${API_URL}/api/groupes/${presentielSession.groupe_id}/presences`, {
        method:"POST", headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body:JSON.stringify({ date_seance: presentielSession.date, liste }),
      }).catch(()=>{});
    }
    await fetch(`${API_URL}/api/coachs/sessions-live/${presentielSession.id}`, {
      method:"PATCH", headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
      // Le temps passé en salle part avec la clôture, comme pour une session en ligne.
      body:JSON.stringify({ statut:"terminee", duree_reelle_s: chronoPresentiel }),
    }).catch(()=>{});
    setPresentielCloturing(false);
    setShowPresentielModal(false);
    fetchLiveSessions();
    toast.success("Session présentielle clôturée ✅");
  };

  const envoyerMessageLive = () => {
    if (!chatInputLive.trim()) return;
    setChatLive(prev => [...prev, { id:Date.now(), auteur:`${MON_PROFIL_REEL.prenom} ${MON_PROFIL_REEL.nom}`, systeme:false, texte:chatInputLive.trim(), ts:new Date().toISOString() }]);
    setChatInputLive("");
  };

  const [chatInput, setChatInput] = useState("");
  const [fichierUploading, setFichierUploading] = useState(false);
  const [pendingChatFile, setPendingChatFile] = useState(null); // { file, name, size, ext, type }
  // Messages tab sub-tabs
  const [msgSubTab, setMsgSubTab] = useState("prive");
  const [showArchiveApprenants, setShowArchiveApprenants] = useState(false);
  const [presenceDate, setPresenceDate] = useState(() => new Date().toISOString().slice(0,10));
  const [presenceListe, setPresenceListe] = useState([]);
  const [presenceSaving, setPresenceSaving] = useState(false);
  const [presenceHistory, setPresenceHistory] = useState([]);
  const [presenceView, setPresenceView] = useState("historique");

  // Blocage chat

  // historique cours
  const [coursList, setCoursList]             = useState([]);
  const [coursLoading, setCoursLoading]       = useState(false);
  const [coursFiltreMois, setCoursFiltreMois] = useState(() => new Date().getMonth() + 1);
  const [coursFiltreAnnee, setCoursFiltreAnnee] = useState(() => new Date().getFullYear());
  const [showCoursForm, setShowCoursForm]     = useState(false);
  const [coursEditId, setCoursEditId]         = useState(null);
  const [coursForm, setCoursForm]             = useState({ date_cours:"", objectif:"", grammaire:"", sujet_discussion:"", statut:"dispense", commentaire:"" });
  const [coursSaving, setCoursSaving]         = useState(false);

  // onglet Sessions (nouveau - toutes sessions groupe + live)
  const [sessGroupeLive,       setSessGroupeLive]       = useState([]);
  const [sessGroupeCours,      setSessGroupeCours]      = useState([]);
  const [sessGroupeLoading,    setSessGroupeLoading]    = useState(false);
  const [sessDateDebutF,       setSessDateDebutF]       = useState("");
  const [sessDateFinF,         setSessDateFinF]         = useState("");
  const [sessStatutFilter,     setSessStatutFilter]     = useState("all"); // all | actif | cloture
  const [sessPageG,            setSessPageG]            = useState(0);
  const SESS_G_PER_PAGE = 10;
  const [realiseesPage,        setRealiseesPage]        = useState(0);
  const REALISEES_PER_PAGE = 5;

  // onglet Honoraire
  const [grillePA,             setGrillePA]             = useState(null);
  const [honorMois,            setHonorMois]            = useState(() => new Date().getMonth() + 1);
  const [honorAnnee,           setHonorAnnee]           = useState(() => new Date().getFullYear());

  // cours détail expandable
  const [expandedModuleInCours, setExpandedModuleInCours] = useState(null);

  // Charger les disponibilités depuis la base de données - un planning par mois/année
  const rowsToDispoState = (rows) => {
    const next = initDispo();
    (rows||[]).filter(r => r.dispo).forEach(r => {
      if (!next[r.jour]) return;
      next[r.jour].push({ debut: r.debut?.slice(0,5)||r.debut, fin: r.fin?.slice(0,5)||r.fin });
    });
    JOURS_SEMAINE.forEach(j => {
      next[j].sort((a,b) => a.debut.localeCompare(b.debut));
      const merged = [];
      next[j].forEach(range => {
        const last = merged[merged.length-1];
        if (last && last.fin >= range.debut) { last.fin = range.fin > last.fin ? range.fin : last.fin; }
        else { merged.push({ ...range }); }
      });
      next[j] = merged;
    });
    return next;
  };

  const chargerDisponibilites = async (mois, annee) => {
    const token = localStorage.getItem("coach_token");
    if (!token) return;
    const now = new Date();
    const estMoisReelCourant = mois === now.getMonth()+1 && annee === now.getFullYear();
    const estFuturOuCourant  = (annee > now.getFullYear()) || (annee === now.getFullYear() && mois >= now.getMonth()+1);
    setDispoLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/coachs/disponibilites?mois=${mois}&annee=${annee}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      const rows = Array.isArray(d.disponibilites) ? d.disponibilites : [];
      if (rows.length > 0) {
        setDisponibilites(rowsToDispoState(rows));
        setDispoPreRempli(false);
        if (estMoisReelCourant) setDispoMoisCourantRempli(true);
      } else {
        if (estMoisReelCourant) setDispoMoisCourantRempli(false);
        // Pré-remplissage depuis le mois précédent - seulement si on regarde le mois courant
        // ou un mois futur pas encore planifié (pas pour consulter un mois passé vide).
        if (estFuturOuCourant) {
          const moisPrec  = mois === 1 ? 12 : mois - 1;
          const anneePrec = mois === 1 ? annee - 1 : annee;
          try {
            const r2 = await fetch(`${API_URL}/api/coachs/disponibilites?mois=${moisPrec}&annee=${anneePrec}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const d2 = await r2.json();
            const rows2 = Array.isArray(d2.disponibilites) ? d2.disponibilites : [];
            if (rows2.length > 0) {
              setDisponibilites(rowsToDispoState(rows2));
              setDispoPreRempli(true);
            } else {
              setDisponibilites(initDispo());
              setDispoPreRempli(false);
            }
          } catch { setDisponibilites(initDispo()); setDispoPreRempli(false); }
        } else {
          setDisponibilites(initDispo());
          setDispoPreRempli(false);
        }
      }
    } catch {}
    finally { setDispoLoading(false); }
  };

  useEffect(() => { chargerDisponibilites(dispoMois, dispoAnnee); }, []); // eslint-disable-line

  useEffect(() => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    if (!token) return;
    setGroupesLoading(true);
    fetch(`${API_URL}/api/groupes`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { groupes: [] })
      .then(d => {
        const grps = d.groupes || [];
        setGroupes(grps);
        // Charger les évaluations de tous les groupes
        if (grps.length > 0) {
          setEvalsLoading(true);
          Promise.all(
            grps.map(g =>
              fetch(`${API_URL}/api/groupes/${g.id}/evaluations`, { headers: { Authorization: `Bearer ${token}` } })
                .then(r => r.ok ? r.json() : { evaluations: [] })
                .then(d2 => (d2.evaluations || []).map(ev => ({ ...ev, groupe_nom: g.nom })))
                .catch(() => [])
            )
          ).then(results => {
            setEvaluations(results.flat());
            setEvalsLoading(false);
          });
        }
      })
      .catch(() => {})
      .finally(() => setGroupesLoading(false));
    // Charger les vrais apprenants depuis groupes_apprenants
    fetch(`${API_URL}/api/groupes/apprenants`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { apprenants: [] })
      .then(d => {
        const mapped = (d.apprenants || []).map(ga => {
          const prenom = ga.prenom_apprenant || "";
          const nom    = ga.nom_apprenant    || "";
          return {
            // Préserver TOUS les champs bruts de l'API (pour apprenantDetail modal)
            ...ga,
            // Champs calculés / normalisés pour le tableau "Mes apprenants" - assiduite/
            // absences/retards/progression/derniere_note sont calculés côté backend à partir
            // des vraies feuilles de présence et des vrais résultats d'évaluation (voir
            // GET /api/groupes/apprenants), pas d'un JSON `note` qui ne contient que le
            // programme/description de l'apprenant.
            groupe_nom:  ga.groupe_nom  || "-",
            coursIds:    [ga.groupe_id],
            nom:         [prenom, nom].filter(Boolean).join(" ") || ga.email_apprenant || "-",
            email:       ga.email_apprenant || "",
            niveau:      ga.niveau || ga.groupe_niveau || "-",
            statut:      ga.statut  || "actif",
            profil:      ga.profil_type || "particulier",
            progression: ga.progression   ?? 0,
            assiduite:   ga.assiduite      ?? 0,
            absent:      ga.absences       ?? 0,
            retard:      ga.retards        ?? 0,
            dernNote:    ga.derniere_note  ?? null,
            testScore:   ga.derniere_note  ?? 0,
          };
        });
        setEtudiants(mapped);
        setEtudiantsLoading(false);
      })
      .catch(() => { setEtudiantsLoading(false); });
    fetch(`${API_URL}/api/parcours/mes-apprenants-coach`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { apprenants: [] })
      .then(d => setApprenantsPrive(d.apprenants || []))
      .catch(() => {});
    fetch(`${API_URL}/api/coachs/moi`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.coach) setCoachMoi(d.coach); })
      .catch(() => {});
    fetchLiveSessions();
    // Charger la médiathèque : une liste PLATE de contenus, chacun publié vers N classes.
    // `cours` conserve son nom d'état - il porte désormais des contenus, le niveau Cours
    // ayant été supprimé.
    fetch(`${API_URL}/api/cours-elearning`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) { console.error("[EspaceProfesseur] GET médiathèque:", r.status); return { contenus: null }; }
        return r.json();
      })
      .then(d => {
        if (!d.contenus) return;
        setCours(d.contenus);
        // `modulesContent` reste l'index des blocs, désormais à plat : un contenu = une clé.
        const mc = {};
        d.contenus.forEach(ct => {
          mc[String(ct.id)] = {
            id: ct.id, titre: ct.titre || "", objectifs: ct.objectifs || [],
            dureeEstimee: ct.dureeEstimee || 60, statut: ct.statut || "brouillon",
            blocs: ct.blocs || [], ordre: ct.ordre || 1,
          };
        });
        setModulesContent(mc);
        chargerCompteursLecture(d.contenus);
      })
      .catch(e => { console.error("[EspaceProfesseur] fetch médiathèque:", e.message); });

    // Charger les ressources partagées depuis la BD (tous les groupes)
    fetch(`${API_URL}/api/groupes`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { groupes: [] })
      .then(async d => {
        const gs = d.groupes || [];
        const all = [];
        await Promise.all(gs.map(async g => {
          try {
            const r2 = await fetch(`${API_URL}/api/groupes/${g.id}`, { headers: { Authorization: `Bearer ${token}` } });
            if (!r2.ok) return;
            const d2 = await r2.json();
            (d2.fichiers || []).forEach(f => {
              all.push({ ...f, titre: f.nom, type: f.type_fichier || "autre", groupe_id: g.id, partage: f.visible !== false, url: f.url, fichierNom: f.nom, date: f.created_at?.split("T")[0] || "" });
            });
          } catch {}
        }));
        if (all.length > 0) setRessources(all);
      })
      .catch(() => {});
  }, []);

  // Notes & Évaluations - agrège les résultats corrigés de chaque évaluation
  // de la/des classe(s) filtrée(s). "evaluations" ne contient que des stats
  // agrégées (rendus/corrigés), donc on va chercher le détail par évaluation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (sousOngletEval !== "notes") return;
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    if (!token) return;
    const evalsCibles = evalClasseFiltre
      ? evaluations.filter(e => e.groupe_id === evalClasseFiltre)
      : evaluations;
    if (evalsCibles.length === 0) { setNotesData([]); return; }
    setNotesDataLoading(true);
    Promise.all(evalsCibles.map(ev =>
      fetch(`${API_URL}/api/groupes/${ev.groupe_id}/evaluations/${ev.id}/resultats`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d) return [];
          return (d.resultats || [])
            .filter(({ resultat: r }) => r.statut === "corrige" && r.note !== null && r.note !== undefined)
            .map(({ apprenant: a, resultat: r }) => ({
              id:              `${ev.id}-${a.id}`,
              etudiant_id:     a.id,
              eval_nom:        d.evaluation?.titre || ev.titre,
              score:           r.note,
              total:           r.note_max || 20,
              type:            d.evaluation?.type || d.evaluation?.type_evaluation || ev.type_evaluation,
              commentaire:     r.commentaire_coach,
              date_evaluation: d.evaluation?.date_evaluation || r.corrige_at,
            }));
        })
        .catch(() => [])
    )).then(lists => setNotesData(lists.flat()))
      .finally(() => setNotesDataLoading(false));
  }, [sousOngletEval, evalClasseFiltre, evaluations]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSeancesPrivees = async (assignationId, groupeId) => {
    if (!assignationId) return;
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    setSeancesLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/seances-privees?assignation_id=${assignationId}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      let seances = d.seances || [];

      // Table unifiée `seances` (remplace seances_privees) - sans elle, une séance créée
      // depuis le planning général (circuit "live"/"groupe" mais liée à cette classe privée
      // via groupe_id) n'apparaît jamais ici.
      if (groupeId) {
        const rNew = await fetch(`${API_URL}/api/seances?groupe_id=${groupeId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (rNew.ok) {
          const dNew = await rNew.json();
          const statutMap = { realisee:"effectuee", planifiee:"planifiee", annulee:"annulee" };
          const seancesNew = (dNew.seances || []).map(s => ({ ...s, statut: statutMap[s.statut] || s.statut }));
          const existingDates = new Set(seances.map(s => s.date_seance));
          seances = [...seances, ...seancesNew.filter(s => !existingDates.has(s.date_seance))];
        }
      }

      setSeancesPrivees(seances);
    } catch {} finally { setSeancesLoading(false); }
  };

  const fetchPresencesPrivees = async (assignationId) => {
    if (!assignationId) return;
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    setPresencesLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/presences-privees?assignation_id=${assignationId}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setPresencesPrivees(d.presences || []);
    } catch {} finally { setPresencesLoading(false); }
  };

  const saveSeancePrive = async (assignationId) => {
    if (seanceSaving) return;
    if (!seanceForm.date_seance) return toast.error("Date requise");
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    setSeanceSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/seances-privees`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...seanceForm, assignation_id: assignationId }),
      });
      if (!r.ok) throw new Error();
      toast.success("Séance planifiée !");
      setShowSeanceForm(false);
      setSeanceForm({ date_seance:"", heure_debut:"", duree_h:"1.5", lieu:"cabinet", notes:"" });
      fetchSeancesPrivees(assignationId);
    } catch { toast.error("Erreur lors de la sauvegarde"); } finally { setSeanceSaving(false); }
  };

  const savePresencePrive = async (assignationId) => {
    if (presencePriveeSaving) return;
    if (!presenceForm.date_presence) return toast.error("Date requise");
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    setPresencePriveeSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/presences-privees`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...presenceForm, assignation_id: assignationId }),
      });
      if (!r.ok) throw new Error();
      toast.success("Présence enregistrée !");
      setShowPresenceForm(false);
      setPresenceForm({ date_presence:"", statut:"present", motif:"", note:"" });
      fetchPresencesPrivees(assignationId);
    } catch { toast.error("Erreur lors de la sauvegarde"); } finally { setPresencePriveeSaving(false); }
  };

  const deleteSeancePrive = (seanceId, assignationId) => {
    openConfirm("Supprimer la séance", "Cette séance sera définitivement supprimée.", async () => {
      const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
      await fetch(`${API_URL}/api/seances-privees/${seanceId}`, { method:"DELETE", headers:{ Authorization:`Bearer ${token}` } });
      fetchSeancesPrivees(assignationId);
    });
  };

  const patchSeancePrive = async (seanceId, updates, assignationId) => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    await fetch(`${API_URL}/api/seances-privees/${seanceId}`, {
      method: "PATCH",
      headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
      body: JSON.stringify(updates),
    });
    fetchSeancesPrivees(assignationId);
  };

  const fetchFichiersPrives = async (assignationId) => {
    if (!assignationId) return;
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    setFichiersPrivesLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/fichiers-prives?assignation_id=${assignationId}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setFichiersPrives(d.fichiers || []);
    } catch {} finally { setFichiersPrivesLoading(false); }
  };

  const deleteFichierPrive = (fichierId, assignationId) => {
    openConfirm("Supprimer le fichier", "Ce fichier sera définitivement supprimé.", async () => {
      const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
      await fetch(`${API_URL}/api/fichiers-prives/${fichierId}`, { method:"DELETE", headers:{ Authorization:`Bearer ${token}` } });
      fetchFichiersPrives(assignationId);
    });
  };

  // Charger données selon l'onglet actif dans le modal apprenant privé
  useEffect(() => {
    if (!selectedPrive) return;
    if (priveTab === "seances")   fetchSeancesPrivees(selectedPrive.id, selectedPrive.groupe_id || selectedPrive._groupe_id);
    if (priveTab === "presences") fetchPresencesPrivees(selectedPrive.id);
    if (priveTab === "fichiers")  fetchFichiersPrives(selectedPrive.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPrive?.id, priveTab]);

  const fetchHistoriqueContrat = async (groupeId) => {
    setHistoLoading(true); setHistoContrat(null); setHistoMoisOuvert(null);
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    try {
      const r = await fetch(`${API_URL}/api/seances/historique-contrat?groupe_id=${groupeId}`, { headers:{ Authorization:`Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      setHistoContrat(d);
    } catch (e) {
      toast.error(e.message || "Historique indisponible");
      setHistoContrat({ mois: [], totaux: { nb_seances:0, total_heures:0, montant_total:0, montant_valide:0 } });
    } finally { setHistoLoading(false); }
  };

  const fetchGroupeDetail = async (groupe) => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    setSelectedGroupe(groupe);
    setGroupeSubTab("apprenants");
    // Reset données sessions + honoraires pour le nouveau groupe
    setSessGroupeLive([]);
    setSessGroupeCours([]);
    setSessPageG(0);
    setSessDateDebutF("");
    setSessDateFinF("");
    setSessStatutFilter("all");
    try {
      const r = await fetch(`${API_URL}/api/groupes/${groupe.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setGroupeApprenants(d.apprenants || []);
      setGroupeFichiers(d.fichiers || []);
    } catch {}
  };

  useEffect(() => {
    if (groupeApprenants.length > 0) {
      setPresenceListe(groupeApprenants.filter(a=>a.statut==="actif" && !a.acces_bloque).map(a => ({
        ga_id: a.id,
        nom_apprenant: a.nom_apprenant,
        prenom_apprenant: a.prenom_apprenant || "",
        avatar_url: a.avatar_url || null,
        statut: "present",
        note: "",
      })));
    }
  }, [groupeApprenants]);

  const fetchPresenceHistory = async () => {
    if (!selectedGroupe) return;
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    try {
      const r = await fetch(`${API_URL}/api/groupes/${selectedGroupe.id}/presences`, { headers: { Authorization:`Bearer ${token}` } });
      const d = await r.json();
      setPresenceHistory(d.presences || []);
    } catch {}
  };

  const selectGroupeForPresences = async (g) => {
    setFiltreGroupeTab(g.id);
    setSelectedGroupe(g);
    setPresenceHistory([]);
    setPresenceListe([]);
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    try {
      const [rApp, rPres] = await Promise.all([
        fetch(`${API_URL}/api/groupes/${g.id}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/groupes/${g.id}/presences`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const dApp = await rApp.json();
      const dPres = await rPres.json();
      setGroupeApprenants(dApp.apprenants || []);
      setPresenceHistory(dPres.presences || []);
    } catch {}
  };

  // Le chat de groupe était verrouillé tant qu'une séance n'avait pas sa feuille de présence.
  // Ce verrou a été retiré : la CLÔTURE d'une session refuse déjà de passer sans présences
  // (cf. cloturerSalle et cloturerPresentiel), donc le contrôle faisait doublon. Il était de
  // surcroît faux - il réclamait les présences de cours encore à venir, avec pour seule issue
  // de saisir des présences fictives pour retrouver la parole.

  const savePresences = async () => {
    if (presenceSaving) return;
    if (!selectedGroupe || !presenceDate) return;
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    setPresenceSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/groupes/${selectedGroupe.id}/presences`, {
        method:"POST",
        headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({ date_seance: presenceDate, liste: presenceListe })
      });
      if (!r.ok) throw new Error();
      toast.success("Présences enregistrées ✓");
      fetchPresenceHistory();
    } catch { toast.error("Erreur enregistrement"); }
    finally { setPresenceSaving(false); }
  };

  const signalerAbsence = async (apprenant) => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    const nomComplet = `${apprenant.prenom_apprenant || ""} ${apprenant.nom_apprenant || ""}`.trim();
    try {
      const r = await fetch(`${API_URL}/api/groupes/apprenants/${apprenant.id}/signaler-absence`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        toast.success(`🚨 Absence répétée de ${nomComplet} signalée à l'assistante commerciale et au PA`);
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || "Erreur lors du signalement");
      }
    } catch {
      toast.error("Erreur réseau");
    }
  };


  useEffect(() => {
    if (groupeSubTab === "historique" && selectedGroupe) fetchHistoriqueContrat(selectedGroupe.id);
    if (groupeSubTab === "presences" && selectedGroupe) fetchPresenceHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupeSubTab, selectedGroupe]);

  const openFicheApprenant = (a, groupeCtx) => {
    setApprenantDetail(a);
    setFicheFicheTab("profil");
    setFicheTest(null);
    setFichePres([]);
    setPresenceHistory([]);
    setFicheNotePatch(null);
    setFicheResultatsDB([]);
    setFicheDevoirsDB([]);
    setPresDateFrom(""); setPresDateTo(""); setPresStatutFil("tous"); setPresPage(1);
    setDevDateFrom("");  setDevDateTo("");  setDevStatutFil("tous");  setDevPage(1);
    setNewSuivi({ type:"observation", texte:"" });
    setNewMs({ type:"niveau", valeur:"", commentaire:"" });
    setNewNote({ titre:"", note:"", sur:20, date:new Date().toISOString().slice(0,10), commentaire:"" });
    setNewDev({ titre:"", date_donne:new Date().toISOString().slice(0,10), date_limite:"", commentaire:"" });
    setNewP({ nom:"", prenom:"", relation:"Père", telephone:"", email:"" });
    setFicheAcces(null);
    // Charger les résultats validés + toutes les évaluations du groupe
    if (a.id) {
      const tok = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
      setFicheResultatsLoading(true);
      fetch(`${API_URL}/api/groupes/apprenants/${a.id}/resultats`, { headers:{ Authorization:`Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : { resultats:[] })
        .then(d => setFicheResultatsDB(d.resultats || []))
        .catch(() => {})
        .finally(() => setFicheResultatsLoading(false));

      setFicheDevoirsLoading(true);
      fetch(`${API_URL}/api/groupes/apprenants/${a.id}/evaluations`, { headers:{ Authorization:`Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : { evaluations:[] })
        .then(d => setFicheDevoirsDB(d.evaluations || []))
        .catch(() => {})
        .finally(() => setFicheDevoirsLoading(false));
    }
    if (groupeCtx) setSelectedGroupe(groupeCtx);
    const email = a.email_apprenant || a.email;
    if (email) {
      const tok2 = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
      setFicheTestLoading(true);
      fetch(`${API_URL}/api/level-test/result?email=${encodeURIComponent(email)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => setFicheTest(d?.result || null))
        .catch(() => {})
        .finally(() => setFicheTestLoading(false));
      setFicheAccesLoad(true);
      fetch(`${API_URL}/api/apprenants/profil-acces?email=${encodeURIComponent(email)}`, { headers:{ Authorization:`Bearer ${tok2}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => { setFicheAcces(d); setFicheAccesLoad(false); })
        .catch(() => setFicheAccesLoad(false));
    }
  };

  const fetchCours = async (groupeId, mois, annee) => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    setCoursLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/groupes/${groupeId}/cours?mois=${mois}&annee=${annee}`, { headers:{ Authorization:`Bearer ${token}` } });
      const d = await r.json();
      setCoursList(d.cours || []);
    } catch {}
    finally { setCoursLoading(false); }
  };

  useEffect(() => {
    if ((groupeSubTab === "cours") && selectedGroupe) {
      fetchCours(selectedGroupe.id, coursFiltreMois, coursFiltreAnnee);
    }
  }, [groupeSubTab, selectedGroupe, coursFiltreMois, coursFiltreAnnee]);

  // Sessions live → onglet Sessions uniquement
  useEffect(() => {
    if (groupeSubTab !== "sessions" || !selectedGroupe) return;
    if (sessGroupeLive.length > 0) return;
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    setSessGroupeLoading(true);
    fetch(`${API_URL}/api/coachs/sessions-live/upcoming?groupe_id=${selectedGroupe.id}`, {
      headers: { Authorization:`Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { sessions: [] })
      .then(d => setSessGroupeLive(d.sessions || []))
      .catch(() => setSessGroupeLive([]))
      .finally(() => setSessGroupeLoading(false));
  }, [groupeSubTab, selectedGroupe]);

  // Onglet Honoraire : charger cours de groupe (TOUTES dates) + sessions live clôturées
  useEffect(() => {
    if (groupeSubTab !== "honoraire" || !selectedGroupe) return;
    if (sessGroupeCours.length > 0 && sessGroupeLive.length > 0) return;
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    const hdr   = { Authorization:`Bearer ${token}` };
    setSessGroupeLoading(true);
    Promise.all([
      fetch(`${API_URL}/api/groupes/${selectedGroupe.id}/cours`, { headers: hdr })
        .then(r => r.ok ? r.json() : { cours: [] }).then(d => d.cours || []),
      fetch(`${API_URL}/api/coachs/sessions-live/upcoming?groupe_id=${selectedGroupe.id}`, { headers: hdr })
        .then(r => r.ok ? r.json() : { sessions: [] }).then(d => d.sessions || []),
    ]).then(([cours, live]) => {
      setSessGroupeCours(cours);
      setSessGroupeLive(live);
    }).catch(() => {}).finally(() => setSessGroupeLoading(false));
  }, [groupeSubTab, selectedGroupe]);

  // Charger grille tarifaire PA (pour onglet honoraire)
  useEffect(() => {
    if (groupeSubTab !== "honoraire" || grillePA) return;
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    fetch(`${API_URL}/api/seances/grille-tarifaire`, { headers:{ Authorization:`Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.grille) setGrillePA(d.grille); })
      .catch(() => {});
  }, [groupeSubTab, grillePA]);

  // Restauration de la salle après un rafraîchissement.
  //
  // `salleOuverte` ne vivait que dans la mémoire de l'onglet : recharger la page suffisait à
  // la perdre, alors que le serveur, lui, gardait la session en « en_cours » - d'où deux
  // écrans qui se contredisaient, le coach ne voyant plus rien et la commerciale affichant
  // « En direct ». C'est le serveur qui a raison : on lui redemande.
  useEffect(() => {
    if (salleOuverte || !liveSessions.length) return;
    const ouverte = liveSessions.find(s =>
      s.statut === "en_cours" &&
      // Le présentiel a son propre modal : le restaurer ici ouvrirait la mauvaise salle.
      // Son chronomètre repart quand même juste, `demarree_at` étant désormais préservé.
      s.plateforme !== "presentiel" &&
      // Une salle que l'on vient de clôturer dans cet onglet ne doit pas se rouvrir : la
      // liste locale porte encore « en_cours » le temps que le rechargement revienne.
      !sessionsRealisees.has(s.id)
    );
    if (!ouverte) return;
    setSalleOuverte(ouverte.id);
    setSessionEnCours(ouverte);
    setChatLive([{ id: Date.now(), auteur: "🤖 Système", systeme: true,
      texte: `Salle « ${ouverte.titre} » retrouvée - elle était restée ouverte. Utilisez « Rouvrir ${ouverte.plateforme === "presentiel" ? "la séance" : "la visio"} » si la fenêtre a été fermée.`,
      ts: new Date().toISOString() }]);
  }, [liveSessions, salleOuverte, sessionsRealisees]);

  // Chrono session live - calculé depuis l'horodatage d'ouverture du serveur, et non par un
  // compteur local parti de zéro : ce dernier repartait à 00:00:00 à chaque rafraîchissement
  // et dérivait dès que l'onglet passait en veille. La durée d'un cours ne dépend pas de
  // l'état d'un onglet.
  useEffect(() => {
    if (!salleOuverte) { setChronoSec(0); return; }
    // On retient la source qui porte réellement l'horodatage : juste après l'ouverture, la
    // liste rechargée ne l'a pas encore, mais la réponse du serveur conservée dans
    // `sessionEnCours` l'a déjà.
    const deLaListe = liveSessions.find(s => s.id === salleOuverte);
    const depuis = deLaListe?.demarree_at || sessionEnCours?.demarree_at || null;
    const depart = depuis ? new Date(depuis).getTime() : Date.now();
    const calcul = () => setChronoSec(Math.max(0, Math.round((Date.now() - depart) / 1000)));
    calcul();
    const iv = setInterval(calcul, 1000);
    return () => clearInterval(iv);
  }, [salleOuverte, liveSessions, sessionEnCours]);

  // Chrono séance présentielle - il n'en existait aucun. Une séance en salle se clôturait
  // avec le seul statut, si bien que le « Déroulé réel » consulté par le PA, la commerciale
  // et l'onboarding affichait « non relevé » pour TOUTE séance présentielle, à jamais, avec
  // en prime l'explication trompeuse « séance antérieure à la mise en place du suivi ».
  // Même principe que le live : le départ vient du serveur, jamais d'un compteur local.
  useEffect(() => {
    if (!showPresentielModal) { setChronoPresentiel(0); return; }
    const aJour = liveSessions.find(s => s.id === presentielSession?.id);
    const depuis = aJour?.demarree_at || presentielSession?.demarree_at || null;
    const depart = depuis ? new Date(depuis).getTime() : Date.now();
    const calcul = () => setChronoPresentiel(Math.max(0, Math.round((Date.now() - depart) / 1000)));
    calcul();
    const iv = setInterval(calcul, 1000);
    return () => clearInterval(iv);
  }, [showPresentielModal, presentielSession, liveSessions]);

  /* La liste de la séance PRÉSENTIELLE, rafraîchie pendant la séance - même raison que la
     salle live : une heure s'écoule, et un apprenant arrêté entre-temps restait affiché,
     avec sa case de présence à cocher. */
  useEffect(() => {
    if (!showPresentielModal || !presentielSession?.groupe_id) return;
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    if (!token) return;
    let vivant = true;
    const charger = () => {
      fetch(`${API_URL}/api/groupes/${presentielSession.groupe_id}`, { headers:{ Authorization:`Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!vivant || !d) return;
          const liste = (d.apprenants||[]).filter(a => a.statut==="actif" && !a.acces_bloque);
          setPresentielApprenants(liste);
          setPresentielPresences(prev => {
            const ids = new Set(liste.map(a => a.id));
            const garde = Object.fromEntries(Object.entries(prev).filter(([id]) => ids.has(id)));
            return Object.keys(garde).length === Object.keys(prev).length ? prev : garde;
          });
        })
        .catch(() => {});   // on garde la dernière liste connue plutôt que de vider l'écran
    };
    const iv = setInterval(charger, 60000);
    return () => { vivant = false; clearInterval(iv); };
  }, [showPresentielModal, presentielSession?.groupe_id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Les apprenants de la salle ouverte - RECHARGÉS TANT QUE LA SALLE EST OUVERTE.
     La liste n'était lue qu'à l'ouverture. Une séance dure une heure : si l'assistante
     arrête la formation d'un apprenant pendant ce temps, ou bloque son accès, le coach
     continuait de le voir dans la salle et pouvait lui saisir une présence - pour un cours
     auquel il n'avait plus droit. Une minute d'écart, la même cadence que le chat live. */
  useEffect(() => {
    if (!salleOuverte) { setApprenantsSalle([]); return; }
    // On cherche dans liveSessions en priorité, sinon on utilise sessionEnCours (évite la race condition)
    const session = liveSessions.find(s => s.id === salleOuverte) || sessionEnCours;
    if (!session?.groupe_id) return;
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    if (!token) return;

    let vivant = true;
    const charger = () => {
      fetch(`${API_URL}/api/groupes/${session.groupe_id}`, { headers:{ Authorization:`Bearer ${token}` } })
        .then(r => r.ok ? r.json() : { apprenants:[] })
        .then(d => {
          if (!vivant) return;
          const liste = (d.apprenants||[]).filter(a => a.statut==="actif" && !a.acces_bloque);
          setApprenantsSalle(liste);
          /* On oublie aussi la présence saisie pour quelqu'un qui vient de sortir de la
             liste : sans cela, son « présent » resterait compté dans le total affiché,
             et le coach verrait 3 présents sur 2 apprenants. */
          setPresencesLive(prev => {
            const ids = new Set(liste.map(a => a.id));
            const garde = Object.fromEntries(Object.entries(prev).filter(([id]) => ids.has(id)));
            return Object.keys(garde).length === Object.keys(prev).length ? prev : garde;
          });
        })
        // Un rafraîchissement qui échoue ne doit pas VIDER la salle en pleine séance :
        // on garde la dernière liste connue plutôt que d'effacer l'écran du coach.
        .catch(() => {});
    };
    charger();
    const iv = setInterval(charger, 60000);
    return () => { vivant = false; clearInterval(iv); };
  }, [salleOuverte, liveSessions, sessionEnCours]);

  const saveCours = async () => {
    if (coursSaving) return;
    if (!coursForm.date_cours) { toast.error("La date est requise"); return; }
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    setCoursSaving(true);
    try {
      const url = coursEditId
        ? `${API_URL}/api/groupes/${selectedGroupe.id}/cours/${coursEditId}`
        : `${API_URL}/api/groupes/${selectedGroupe.id}/cours`;
      const r = await fetch(url, {
        method: coursEditId ? "PATCH" : "POST",
        headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify(coursForm)
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success(coursEditId ? "Cours mis à jour ✓" : "Cours ajouté ✓");
      setShowCoursForm(false);
      setCoursEditId(null);
      setCoursForm({ date_cours:"", objectif:"", grammaire:"", sujet_discussion:"", statut:"dispense", commentaire:"" });
      fetchCours(selectedGroupe.id, coursFiltreMois, coursFiltreAnnee);
    } catch(e) { toast.error(e.message || "Erreur"); }
    finally { setCoursSaving(false); }
  };

  const deleteCours = (cid) => {
    openConfirm("Supprimer l'entrée", "Ce cours sera définitivement supprimé de l'historique.", async () => {
      const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
      await fetch(`${API_URL}/api/groupes/${selectedGroupe.id}/cours/${cid}/permanent`, { method:"DELETE", headers:{ Authorization:`Bearer ${token}` } });
      setCoursList(prev => prev.filter(c => c.id !== cid));
      toast.success("Supprimé ✓");
    });
  };

  const fetchCorbeille = async () => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    if (!token) return;
    setCorbeilleLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/coachs/sessions-live/corbeille`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) { setCorbeilleList([]); return; }
      const d = await r.json();
      setCorbeilleList(d.sessions || []);
    } catch {}
    finally { setCorbeilleLoading(false); }
  };

  const restoreSession = async (sid) => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    const r = await fetch(`${API_URL}/api/coachs/sessions-live/${sid}/restore`, {
      method: "PATCH",
      headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
    });
    if (!r.ok) { toast.error("Erreur restauration"); return; }
    setCorbeilleList(prev => prev.filter(s => s.id !== sid));
    setSessGroupeLive([]);
    fetchLiveSessions();
    toast.success("Session restaurée ✓");
  };

  const permanentDeleteSession = (sid) => {
    openConfirm("Supprimer définitivement", "Cette session sera supprimée de façon permanente et irrécupérable.", async () => {
      const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
      await fetch(`${API_URL}/api/coachs/sessions-live/${sid}/permanent`, { method:"DELETE", headers:{ Authorization:`Bearer ${token}` } });
      setCorbeilleList(prev => prev.filter(s => s.id !== sid));
      toast.success("Supprimée définitivement ✓");
    });
  };

  // Badge "Messages" réel : messagerie privée (useFirebaseChat.unreadTotal, déjà fiable)
  // + chats de groupe (jusqu'ici sans aucune notion de lecture, donc jamais comptés -
  // voir useGroupesChatUnreadTotal). L'ancien `messages.filter(m=>!m.lu)` portait sur un
  // état local jamais alimenté par un vrai fetch, donc toujours à 0 en pratique.
  const { unreadTotal: msgPriveNonLus } = useFirebaseChat({ overrideProfil: coachBase, overrideToken: localStorage.getItem("coach_token") || localStorage.getItem("admin_token") });
  const msgGroupeNonLus = useGroupesChatUnreadTotal(groupes.map(g => g.id), MON_PROFIL_REEL?.id);
  // Les non-lus des groupes LIBRES : calculés ici pour que la pastille s'allume
  // même quand l'onglet n'est pas ouvert.
  const groupesLibresNonLus = useGroupesLibresNonLus(localStorage.getItem("coach_token") || localStorage.getItem("admin_token"), MON_PROFIL_REEL?.id);
  const msgNonLus = (msgPriveNonLus || 0) + (msgGroupeNonLus || 0);
  const evalAVenir = evaluations.filter(e => e.statut==="publie").length;

  /* ── Computed ── */
  const etudsFiltres = useMemo(() => {
    let r = [...etudiants];
    if (filtreGroupeTab)           r = r.filter(e => e.groupe_id === filtreGroupeTab);
    if (filtEtudNiveau !== "Tous") r = r.filter(e => e.niveau === filtEtudNiveau);
    if (searchEtud) r = r.filter(e => e.nom.toLowerCase().includes(searchEtud.toLowerCase()) || e.email.toLowerCase().includes(searchEtud.toLowerCase()));
    return r;
  }, [etudiants, filtreGroupeTab, filtEtudNiveau, searchEtud]);
  useEffect(() => { setEtudPage(1); }, [filtreGroupeTab, filtEtudNiveau, searchEtud]);

  const seancesFiltres = useMemo(() => {
    let r = [...seances];
    if (filtSeanceSt !== "Tous") r = r.filter(s => s.statut === filtSeanceSt);
    return r.sort((a,b) => a.date.localeCompare(b.date));
  }, [seances, filtSeanceSt]);

  const planningSeam = useMemo(() => {
    const today = new Date();
    const dow = today.getDay(); // 0=dim
    const base = new Date(today);
    base.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow)); // lundi de la semaine courante
    base.setHours(0, 0, 0, 0);
    const liveAsSeances = liveSessions.map(s => ({
      id:       `live-${s.id}`,
      _liveId:  s.id,
      _live:    true,
      date:     s.date,
      heure:    s.heure || "00:00",
      titre:    s.titre,
      type:     s.plateforme === "presentiel" ? "online" : "online",
      plateforme: s.plateforme,
      statut:   s.statut === "terminee" ? "termine" : "planifie",
      salle:    s.plateforme === "presentiel" ? "Présentiel" : (s.lien || "En ligne"),
      nbInscrits: 0, nbPresents: null,
    }));
    return [...seances, ...liveAsSeances].filter(s => {
      const d = new Date(s.date);
      const diff = Math.floor((d - base) / (1000*3600*24));
      return diff >= semaine*7 && diff < (semaine+1)*7;
    }).sort((a,b) => (a.date+(a.heure||"")).localeCompare(b.date+(b.heure||"")));
  }, [seances, liveSessions, semaine]);

  const stats = useMemo(() => ({
    totalEtudiants: etudiants.length,
    avgProg:  etudiants.length ? Math.round(etudiants.reduce((s,e)=>s+e.progression,0)/etudiants.length) : 0,
    avgAssid: etudiants.length ? Math.round(etudiants.reduce((s,e)=>s+e.assiduite,0)/etudiants.length) : 0,
    enDanger: etudiants.filter(e=>e.assiduite<80||e.progression<45).length,
    seancesAV:seances.filter(s=>s.statut==="planifie"||s.statut==="confirme").length,
    tauxAssidMoyen: Math.round(seances.filter(s=>s.nbPresents!==null).reduce((s,se)=>s+(se.nbPresents/se.nbInscrits),0)/Math.max(1,seances.filter(s=>s.nbPresents!==null).length)*100),
  }), [etudiants, seances]);

  /* ── Handlers ── */
  const saveNote = () => {
    if (!noteForm.etudiantId || !noteForm.score || !noteForm.evalNom) { toast.error("Remplissez tous les champs"); return; }
    setEtudiants(etudiants.map(e => e.id===Number(noteForm.etudiantId) ? { ...e, dernNote: Number(noteForm.score) } : e));
    setNotesData(prev => [...prev, {
      id: Date.now(), etudiant_id: Number(noteForm.etudiantId),
      eval_nom: noteForm.evalNom, score: Number(noteForm.score),
      total: Number(noteForm.total)||20, type: "controle",
      commentaire: noteForm.commentaire, created_at: new Date().toISOString(),
    }]);
    toast.success("Note enregistrée ✓");
    setShowNoteModal(false);
    setNoteForm({ etudiantId:"", evalNom:"", score:"", total:"20", commentaire:"" });
  };
  const saveRessource = async () => {
    if (!ressForm.titre) { toast.error("Titre requis"); return; }
    if (ressForm.type === "speaking" && !ressForm.speakConsigne.trim()) { toast.error("La consigne speaking est requise"); return; }
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    const label = ressForm.type === "speaking" ? "Exercice speaking" : ressForm.type === "audio" ? "Audio" : ressForm.type === "video" ? "Vidéo" : "Ressource";

    // Persister en DB pour chaque classe sélectionnée si une URL est fournie
    if (ressForm.groupe_ids.length > 0 && ressForm.url) {
      try {
        const taille_ko = ressForm.taille ? Math.round(parseFloat(ressForm.taille) * 1024) : null;
        const resultats = await Promise.all(ressForm.groupe_ids.map(async gid => {
          const r = await fetch(`${API_URL}/api/groupes/${gid}/fichiers`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              nom:         ressForm.titre,
              url:         ressForm.url,
              type_fichier: ressForm.type,
              taille_ko,
              visible:     ressForm.partage,
            }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || "Erreur");
          return { gid, fichier: d.fichier };
        }));
        // Ajouter chaque fichier retourné par l'API à l'état local
        setRessources(prev => [
          ...resultats.map(({ gid, fichier }) => ({ ...ressForm, groupe_id: gid, id: fichier?.id || Date.now()+Math.random(), date: new Date().toISOString().split("T")[0] })),
          ...prev,
        ]);
        toast.success(`${label} partagé avec ${resultats.length} classe${resultats.length>1?"s":""} ✓`);
      } catch (err) {
        toast.error("Erreur lors de la sauvegarde : " + err.message);
        return;
      }
    } else {
      // Pas de classe ou pas d'URL → stockage local uniquement
      setRessources(prev => [{ ...ressForm, id: Date.now(), date: new Date().toISOString().split("T")[0] }, ...prev]);
      toast.success(`${label} ajouté${["speaking","audio","video"].includes(ressForm.type)?"":"e"} ✓`);
      if (ressForm.partage) toast("📣 Ressource partagée avec les étudiants", { icon:"🎓" });
    }

    setShowAddRessModal(false);
    setRessForm({ titre:"", type:"pdf", groupe_ids:[], taille:"", partage:true, url:"", fichierNom:"", speakConsigne:"", speakPrepTime:30, speakRecordTime:60, speakType:"independant", speakNiveau:"B2", speakTip:"" });
  };
  /* ── NOUVEAUX ÉTATS - Modules & Contenu avancé ── */
  const [modulesContent, setModulesContent]             = useState({});
  const [studentProgressions, setStudentProgressions]   = useState({});
  const [notifications, setNotifications]               = useState([]);
  const [showModuleBuilder, setShowModuleBuilder]       = useState(false);
  const [editingModuleContent, setEditingModuleContent] = useState(null);
  /* `groupe_ids` : les classes destinataires du contenu. Elles se choisissaient à la
     création puis devenaient définitives - le formulaire d'édition ne les portait pas et le
     PATCH ne les envoyait jamais, alors que le serveur sait les mettre à jour depuis
     toujours. Un coach ne pouvait donc ni ouvrir un cours à une seconde classe, ni le
     retirer d'une classe qui n'en avait plus l'usage. */
  const [moduleForm, setModuleForm]                     = useState({ titre:"", objectifs:"", dureeEstimee:60, statut:"brouillon", groupe_ids:[] });
  const [blocs, setBlocs]                               = useState([]);
  const [previewMode, setPreviewMode]                   = useState(false);
  const [showBlocForm, setShowBlocForm]                 = useState(false);
  const [blocForm, setBlocForm]                         = useState({ type:"texte", titre:"", contenu:"", url:"", dureeMin:10, fichier:"", taille:"", questions:[], sections:[{id:1,niveau:"h2",titre:"I. Introduction",contenu:""}] });
  const [blocQuizQ, setBlocQuizQ]                       = useState({ texte:"", options:["","","",""], correct:"" });
  const [blocEnEdition, setBlocEnEdition]               = useState(null); // id du bloc en cours de correction
  const [showRecurringModal, setShowRecurringModal]     = useState(false);
  const [recurringForm, setRecurringForm]               = useState({ seanceBaseId:"", nbSemaines:4 });
  const [showNotifModal, setShowNotifModal]             = useState(false);
  const [notifForm, setNotifForm]                       = useState({ titre:"", message:"", coursId:1, type:"info" });
  const [showProgEtudModal, setShowProgEtudModal]       = useState(false);
  const [selectedEtudProg, setSelectedEtudProg]         = useState(null);
  const [showAudioModal, setShowAudioModal]             = useState(false);
  const [selectedAudio, setSelectedAudio]               = useState(null);
  // Modals détail lecture (cours + module)
  const [showModuleDetail, setShowModuleDetail] = useState(false);
  const [moduleDetailData, setModuleDetailData] = useState(null); // { mod, content, cours }
  const [moduleLusData, setModuleLusData] = useState({}); // { [moduleId]: count }
  const [moduleLecteurs, setModuleLecteurs] = useState([]); // apprenants ayant marqué le module ouvert comme lu
  const [moduleLecteursLoading, setModuleLecteursLoading] = useState(false);

  // Qui a lu ce module - chargé à l'ouverture du modal détail module
  useEffect(() => {
    if (!showModuleDetail || !moduleDetailData?.mod?.id) { setModuleLecteurs([]); return; }
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    setModuleLecteursLoading(true);
    fetch(`${API_URL}/api/elearning/contenus/${moduleDetailData.mod.id}/lus`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setModuleLecteurs(d.lus || []))
      .catch(() => setModuleLecteurs([]))
      .finally(() => setModuleLecteursLoading(false));
  }, [showModuleDetail, moduleDetailData]);

  const [ficheResultatsDB, setFicheResultatsDB] = useState([]);
  const [ficheResultatsLoading, setFicheResultatsLoading] = useState(false);
  const [ficheDevoirsDB, setFicheDevoirsDB] = useState([]);
  const [ficheDevoirsLoading, setFicheDevoirsLoading] = useState(false);
  // Filtres Présences
  const PRES_PER_PAGE = 10;
  const [presDateFrom, setPresDateFrom] = useState("");
  const [presDateTo,   setPresDateTo]   = useState("");
  const [presStatutFil, setPresStatutFil] = useState("tous");
  const [presPage,     setPresPage]     = useState(1);
  // Filtres Devoirs BDD
  const DEV_PER_PAGE = 10;
  const [devDateFrom,   setDevDateFrom]   = useState("");
  const [devDateTo,     setDevDateTo]     = useState("");
  const [devStatutFil,  setDevStatutFil]  = useState("tous");
  const [devPage,       setDevPage]       = useState(1);

  /* ── HANDLERS MODULES & CONTENU ── */
  const getModuleContent = (_coursId, moduleId) =>
    modulesContent[String(moduleId)] || null;

  const openModuleBuilder = (coursId, moduleId, moduleBase) => {
    const ex = getModuleContent(coursId, moduleId);
    setEditingModuleContent({ coursId, moduleId, moduleBase });
    setModuleForm({ titre:ex?.titre||moduleBase.titre||moduleBase.nom||"", objectifs:(ex?.objectifs||moduleBase.objectifs||[]).join("\n"), dureeEstimee:ex?.dureeEstimee||moduleBase.dureeEstimee||60, statut:ex?.statut||moduleBase.statut||"brouillon", groupe_ids:[...(moduleBase.groupe_ids || ex?.groupe_ids || [])] });
    setBlocs(ex?.blocs?.length ? [...ex.blocs] : (moduleBase.blocs || []));

    // Une saisie perdue par une session expirée attend peut-être ici.
    const brouillon = lireBrouillonLocal(moduleId);
    if (brouillon && window.confirm(
      `Une saisie non enregistrée de « ${brouillon.titre} » a été retrouvée (${(brouillon.blocs||[]).length} bloc(s)).\n\nLa restaurer ?`
    )) {
      setModuleForm(p => ({ ...p, titre:brouillon.titre, objectifs:brouillon.objectifs, dureeEstimee:brouillon.dureeEstimee, statut:brouillon.statut }));
      setBlocs(brouillon.blocs || []);
    } else if (brouillon) {
      oublierBrouillonLocal();
    }

    setPreviewMode(false);
    setShowModuleBuilder(true);
  };

  /**
   * Brouillon de secours d'un contenu en cours d'édition.
   *
   * Une session qui expire en plein enregistrement faisait perdre tout le travail : les
   * blocs, la vidéo uploadée, les questions saisies. Le rejeu automatique après
   * rafraîchissement couvre l'essentiel, mais pas le cas où la session est réellement
   * finie. On garde alors la saisie localement pour la restituer à la reconnexion.
   */
  const CLE_BROUILLON = "bet_contenu_brouillon";

  const sauverBrouillonLocal = (moduleId, charge) => {
    try { localStorage.setItem(CLE_BROUILLON, JSON.stringify({ moduleId, charge, le: Date.now() })); }
    catch { /* quota plein : on ne peut rien de plus */ }
  };
  const lireBrouillonLocal = (moduleId) => {
    try {
      const b = JSON.parse(localStorage.getItem(CLE_BROUILLON) || "null");
      if (!b || String(b.moduleId) !== String(moduleId)) return null;
      // Au-delà de 24 h, la reprise est plus déroutante qu'utile.
      if (Date.now() - b.le > 24 * 3600 * 1000) return null;
      return b.charge;
    } catch { return null; }
  };
  const oublierBrouillonLocal = () => { try { localStorage.removeItem(CLE_BROUILLON); } catch { /* ignore */ } };

  const saveModuleContent = async (statutVoulu = null) => {
    if (!moduleForm.titre) { toast.error("Titre requis"); return; }
    // Retirer la dernière classe ferait disparaître le contenu de toutes les médiathèques,
    // y compris sous les apprenants en train de le lire.
    if (!(moduleForm.groupe_ids || []).length) { toast.error("Ce contenu doit rester rattaché à au moins une classe"); return; }
    const { coursId, moduleId } = editingModuleContent;
    // Le statut arrive en paramètre : le passer par setModuleForm juste avant l'appel
    // laissait partir l'ANCIENNE valeur, setState n'étant pas immédiat.
    const statut = statutVoulu || moduleForm.statut;
    const updatedBlocs = blocs.map((b,i)=>({...b,ordre:i+1}));

    // Garde-fou : enregistrer moins de blocs qu'à l'ouverture est presque toujours une
    // perte involontaire. On ne l'interdit pas - supprimer un bloc est légitime - mais on
    // la rend consciente, parce qu'elle était jusqu'ici parfaitement silencieuse.
    const avant = (getModuleContent(coursId, moduleId)?.blocs || []).length;
    if (updatedBlocs.length < avant) {
      const perdus = avant - updatedBlocs.length;
      if (!window.confirm(
        `⚠️ Vous enregistrez ${updatedBlocs.length} bloc(s) alors que ce contenu en comptait ${avant}.\n\n`
        + `${perdus} bloc(s) ser${perdus > 1 ? "ont" : "a"} définitivement supprimé(s).\n\nContinuer ?`
      )) return;
    }

    const updated = { ...getModuleContent(coursId, moduleId), id:moduleId, titre:moduleForm.titre, objectifs:moduleForm.objectifs.split("\n").filter(Boolean), dureeEstimee:Number(moduleForm.dureeEstimee), statut, blocs:updatedBlocs };
    setModulesContent(prev => ({ ...prev, [moduleId]: updated }));
    setCours(prev => prev.map(c => c.id===moduleId
      ? { ...c, titre:moduleForm.titre, dureeEstimee:Number(moduleForm.dureeEstimee), statut, publie:statut==="publie", objectifs:updated.objectifs, blocs:updatedBlocs }
      : c));
    // Persister en base
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    try {
      const r = await fetch(`${API_URL}/api/cours-elearning/${moduleId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          titre:         moduleForm.titre,
          nom:           moduleForm.titre,
          groupe_ids:    moduleForm.groupe_ids || [],
          objectifs:     moduleForm.objectifs.split("\n").filter(Boolean),
          duree_estimee: Number(moduleForm.dureeEstimee),
          statut,
          fait:          statut === "publie",
          blocs:         updatedBlocs,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(()=>({}));
        sauverBrouillonLocal(moduleId, { titre:moduleForm.titre, objectifs:moduleForm.objectifs, dureeEstimee:moduleForm.dureeEstimee, statut, blocs:updatedBlocs });
        toast.error(`Sauvegarde impossible (${err.error || r.status}) - votre saisie est conservée, elle sera proposée à la réouverture.`);
        return;
      }
    } catch (e) {
      sauverBrouillonLocal(moduleId, { titre:moduleForm.titre, objectifs:moduleForm.objectifs, dureeEstimee:moduleForm.dureeEstimee, statut, blocs:updatedBlocs });
      toast.error("Serveur injoignable - votre saisie est conservée, elle sera proposée à la réouverture.");
      return;
    }
    oublierBrouillonLocal();
    if (statut === "publie") {
      toast.success(`Contenu publié - ${updatedBlocs.length} bloc(s) enregistré(s) ✓`);
    } else {
      toast.success(`Brouillon enregistré - ${updatedBlocs.length} bloc(s) ✓`);
    }
    fermerEditeurModule();
  };


  /**
   * Bascule un contenu entre brouillon et publié.
   *
   * La publication est ce qui déclenche l'envoi aux apprenants de TOUTES les classes
   * visées - d'où le refus de publier un contenu qui n'en vise aucune : il partirait
   * dans le vide sans que le coach comprenne pourquoi personne ne l'a reçu.
   */
  const basculerPublicationContenu = async (contenu, envoyerEmailPub = false) => {
    const nouveauStatut = contenu.statut === "publie" ? "brouillon" : "publie";
    if (nouveauStatut === "publie" && !(contenu.groupe_ids || []).length) {
      toast.error("Choisissez au moins une classe avant de publier");
      return;
    }
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    // Optimiste : l'écran répond tout de suite, et se corrige si le serveur refuse.
    setCours(prev => prev.map(c => c.id === contenu.id ? { ...c, statut: nouveauStatut, publie: nouveauStatut === "publie" } : c));
    try {
      const r = await fetch(`${API_URL}/api/cours-elearning/${contenu.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ statut: nouveauStatut, envoyer_email: nouveauStatut === "publie" && envoyerEmailPub }),
      });
      if (!r.ok) throw new Error((await r.json().catch(()=>({}))).error || "Erreur");
      toast.success(nouveauStatut === "publie"
        ? `Publié vers ${(contenu.groupe_ids || []).length} classe(s) - apprenants notifiés ✓`
        : "Contenu repassé en brouillon ✓");
    } catch (e) {
      setCours(prev => prev.map(c => c.id === contenu.id ? { ...c, statut: contenu.statut, publie: contenu.statut === "publie" } : c));
      toast.error(e.message || "Erreur lors de la mise à jour");
    }
  };

  /* Lecture sequentielle : ce contenu doit etre termine avant que ceux publies APRES lui
     ne s'ouvrent, dans les memes classes. Modifiable a tout moment et pas seulement a la
     creation - un coach decide souvent en cours de route qu'un cours est un prerequis. */
  const basculerSequentielContenu = async (contenu) => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    const nouveau = !contenu.lecture_sequentielle;
    setCours(prev => prev.map(c => c.id === contenu.id ? { ...c, lecture_sequentielle: nouveau } : c));
    try {
      const r = await fetch(`${API_URL}/api/cours-elearning/${contenu.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lecture_sequentielle: nouveau }),
      });
      if (!r.ok) throw new Error((await r.json().catch(()=>({}))).error || "Erreur");
      toast.success(nouveau
        ? "Lecture obligatoire : les cours publiés après celui-ci resteront fermés tant qu'il n'est pas terminé ✓"
        : "Lecture libre : ce cours ne retient plus les suivants ✓");
    } catch (e) {
      setCours(prev => prev.map(c => c.id === contenu.id ? { ...c, lecture_sequentielle: !nouveau } : c));
      toast.error(e.message || "Modification impossible");
    }
  };

  const supprimerContenu = async (contenu) => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    const avant = cours;
    setCours(prev => prev.filter(c => c.id !== contenu.id));
    try {
      const r = await fetch(`${API_URL}/api/cours-elearning/${contenu.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error((await r.json().catch(()=>({}))).error || "Erreur");
      toast.success("Contenu supprimé ✓");
    } catch (e) {
      setCours(avant);
      toast.error(e.message || "Suppression impossible");
    }
  };

  const BLOC_FORM_VIDE = { type:"texte", titre:"", contenu:"", url:"", dureeMin:10, fichier:"", taille:"", questions:[], sections:[{id:1,niveau:"h2",titre:"I. Introduction",contenu:""}] };

  /**
   * Ajoute le bloc en cours de saisie, ou enregistre celui qu'on est en train de modifier.
   *
   * Un bloc n'était pas modifiable : seuls ↑ ↓ et 🗑 existaient. Corriger une faute
   * imposait de supprimer puis de tout refaire - y compris re-uploader la vidéo.
   */
  const addBloc = () => {
    if (!blocForm.titre) { toast.error("Titre du bloc requis"); return; }
    const charge = { ...blocForm, questions: blocForm.type === "quiz" ? blocForm.questions : [] };
    if (blocEnEdition) {
      setBlocs(prev => prev.map(b => b.id === blocEnEdition ? { ...charge, id: b.id, ordre: b.ordre } : b));
      toast.success("Bloc modifié ✓");
    } else {
      setBlocs(prev => [...prev, { ...charge, id:`b${Date.now()}`, ordre:prev.length+1 }]);
      toast.success("Bloc ajouté ✓");
    }
    setBlocForm(BLOC_FORM_VIDE);
    setBlocEnEdition(null);
    setShowBlocForm(false);
  };

  /**
   * Compteurs de lecture pour tous les contenus publiés.
   *
   * Un appel par contenu : la liste d'un coach reste courte, et cela évite une route
   * d'agrégation supplémentaire. Les brouillons sont ignorés - personne ne peut les lire.
   */
  const chargerCompteursLecture = async (liste) => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    const publies = (liste || []).filter(c => c.statut === "publie");
    if (!publies.length) return;
    const res = {};
    await Promise.all(publies.map(async (c) => {
      try {
        const r = await fetch(`${API_URL}/api/cours-elearning/${c.id}/lecteurs`, { headers:{ Authorization:`Bearer ${token}` } });
        if (!r.ok) return;
        const d = await r.json();
        res[c.id] = { lus: d.lus || 0, total: d.total || 0 };
      } catch { /* un compteur manquant n'empêche pas d'afficher la liste */ }
    }));
    setLuParContenu(prev => ({ ...prev, ...res }));
  };

  const ouvrirLecteurs = async (contenu) => {
    setLecteursModal({ contenu, data: null, loading: true });
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    try {
      const r = await fetch(`${API_URL}/api/cours-elearning/${contenu.id}/lecteurs`, { headers:{ Authorization:`Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      setLecteursModal({ contenu, data: d, loading: false });
      setLuParContenu(prev => ({ ...prev, [contenu.id]: { lus: d.lus || 0, total: d.total || 0 } }));
    } catch (e) {
      toast.error(e.message || "Impossible de charger les lectures");
      setLecteursModal(null);
    }
  };

  /** Ouvre le formulaire pour un bloc NEUF - et sort explicitement du mode correction. */
  const ouvrirNouveauBloc = () => {
    setBlocForm(BLOC_FORM_VIDE);
    setBlocEnEdition(null);
    setShowBlocForm(true);
  };

  /** Ferme l'éditeur de module en remettant à zéro l'état de saisie d'un bloc. */
  const fermerEditeurModule = () => {
    setShowModuleBuilder(false);
    setShowBlocForm(false);
    setBlocForm(BLOC_FORM_VIDE);
    setBlocEnEdition(null);
  };

  /** Recharge un bloc existant dans le formulaire pour le corriger. */
  const editerBloc = (bloc) => {
    setBlocForm({ ...BLOC_FORM_VIDE, ...bloc });
    setBlocEnEdition(bloc.id);
    setShowBlocForm(true);
  };

  const annulerEditionBloc = () => {
    setBlocForm(BLOC_FORM_VIDE);
    setBlocEnEdition(null);
    setShowBlocForm(false);
  };

  const addQuizQuestion = () => {
    // Les options sont FACULTATIVES : sans elles la question est ouverte - « What is the
    // video about? » - et se lit chez l'apprenant comme un sujet à préparer. Exiger une
    // bonne réponse interdisait purement et simplement ce cas, qui est le plus courant
    // dans les devoirs de l'équipe.
    if (!blocQuizQ.texte.trim()) { toast.error("Texte de la question requis"); return; }
    const options = blocQuizQ.options.filter(o => String(o).trim());
    if (options.length && !blocQuizQ.correct) { toast.error("Indiquez la bonne réponse, ou retirez les options pour une question ouverte"); return; }
    setBlocForm(prev => ({ ...prev, questions:[...prev.questions,{ ...blocQuizQ, options, correct: options.length ? blocQuizQ.correct : "", id:`q${Date.now()}` }] }));
    setBlocQuizQ({ texte:"", options:["","","",""], correct:"" });
  };

  const removeBloc = (id) => setBlocs(prev => prev.filter(b=>b.id!==id));
  const moveBlocUp = (i) => { if(i===0)return; const a=[...blocs]; [a[i-1],a[i]]=[a[i],a[i-1]]; setBlocs(a); };
  const moveBlocDown = (i) => { if(i>=blocs.length-1)return; const a=[...blocs]; [a[i],a[i+1]]=[a[i+1],a[i]]; setBlocs(a); };
  const getTotalDureeModule = () => blocs.reduce((s,b)=>s+(Number(b.dureeMin)||0),0);

  /* ── SÉANCES RÉCURRENTES ── */
  const saveRecurringSessions = () => {
    const base = seances.find(s=>s.id===Number(recurringForm.seanceBaseId));
    if (!base) { toast.error("Séance introuvable"); return; }
    const newSeances = Array.from({length:Number(recurringForm.nbSemaines)},(_,w)=>{ const d=new Date(base.date); d.setDate(d.getDate()+(w+1)*7); return { ...base, id:Date.now()+w, date:d.toISOString().split("T")[0], statut:"planifie", nbPresents:null }; });
    setSeances(prev=>[...prev,...newSeances]);
    toast.success(`${recurringForm.nbSemaines} séances récurrentes créées ✓`);
    setShowRecurringModal(false);
  };

  /* ── EXPORT EXCEL ── */
  const exportCSVNotes = () => {
    exporterExcelStyle({
      nomFichier: `rapport_notes_${new Date().toISOString().split("T")[0]}`,
      titre: '📋 Rapport de notes - Étudiants',
      sousTitre: `${etudiants.length} étudiant${etudiants.length>1?'s':''} · Généré le ${new Date().toLocaleDateString('fr-FR')}`,
      couleurEntete: '6366F1',
      colonnes: [
        { label: 'Nom', width: 22, bold: true }, { label: 'Email', width: 26 },
        { label: 'Niveau', width: 10, align: 'center' }, { label: 'Cours', width: 30 },
        { label: 'Progression %', width: 14, align: 'center' }, { label: 'Assiduité %', width: 14, align: 'center' },
        { label: 'Dernière note /20', width: 16, align: 'center' }, { label: 'Score test %', width: 14, align: 'center' },
        { label: 'Absences', width: 12, align: 'center' }, { label: 'Retards', width: 12, align: 'center' },
        { label: 'Commentaire', width: 30 },
      ],
      lignes: etudiants.map(e => {
        const coursList = e.coursIds.map(cId=>cours.find(x=>x.id===cId)?.titre||"").join(" | ");
        return [e.nom, e.email, e.niveau, coursList, e.progression, e.assiduite, e.dernNote, e.testScore, e.absent, e.retard, e.commentaire||""];
      }),
    });
    toast.success("Export Excel téléchargé ✓");
  };

  const exportCSVProgressions = (coursId) => {
    const c=cours.find(x=>x.id===coursId);
    const etudsCours=etudiants.filter(e=>e.coursIds.includes(coursId));
    const modules=(c?.blocs||[]).map((b,i)=>({ id:b.id||i, titre:b.titre||`Partie ${i+1}` }));
    exporterExcelStyle({
      nomFichier: `progression_${(c?.titre||"cours").replace(/\s+/g,"_")}_${new Date().toISOString().split("T")[0]}`,
      titre: `📈 Progression - ${c?.titre||"cours"}`,
      sousTitre: `${etudsCours.length} étudiant${etudsCours.length>1?'s':''} · Généré le ${new Date().toLocaleDateString('fr-FR')}`,
      couleurEntete: '6366F1',
      colonnes: [
        { label: 'Nom', width: 22, bold: true }, { label: 'Email', width: 26 },
        ...modules.map(m => ({ label: `${m.nom} (%)`, width: 16, align: 'center' })),
        { label: 'Moyenne %', width: 14, align: 'center' },
      ],
      lignes: etudsCours.map(e => {
        const progs = modules.map(m=>studentProgressions[e.id]?.[String(coursId)]?.[String(m.id)]?.pct||0);
        const avg = progs.length?Math.round(progs.reduce((s,v)=>s+v,0)/progs.length):0;
        return [e.nom, e.email, ...progs, avg];
      }),
    });
    toast.success("Export progression Excel ✓");
  };

  /* ── CRÉER / MODIFIER UNE ÉVALUATION ── */
  const sauvegarderEval = async (publierDirectement = false) => {
    if (!evalForm.titre.trim()) { toast.error("Titre requis"); return; }
    const groupeId = evalForm.groupe_id || groupes[0]?.id;
    if (!groupeId) { toast.error("Sélectionnez un groupe"); return; }
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    const body = {
      titre:          evalForm.titre.trim(),
      // Les 3 catégories partagent le même contenu - seule la vraie catégorie (devoir/
      // exercice/evaluation) est envoyée, plus jamais collapsée en "evaluation" : le Backend
      // s'en sert pour le bonus de gamification réservé aux devoirs notés ≥ 80 % (groupes.js).
      // "mixte" = un ou plusieurs blocs QCM/Listening/Audio/Quiz/Speaking combinés (blocs[]) ;
      // sans bloc ajouté, rendu "texte" reste une simple zone de texte libre (texte_libre).
      type:           evalForm.typeRendu === "texte" && evalForm.blocs.length > 0 ? "mixte" : "texte_libre",
      categorie:      evalForm.categorie || "evaluation",
      // Manquait jusqu'ici : tout devoir créé retombait toujours sur "texte" côté serveur
      // (valeur par défaut de la colonne), quel que soit le choix du coach dans le modal.
      type_rendu:     evalForm.typeRendu      || "texte",
      date_ouverture: evalForm.date_ouverture || null,
      heure_ouverture:evalForm.heure_ouverture|| "00:00",
      instructions:   evalForm.instructions   || "",
      // Étaient codés en dur à vide à CHAQUE sauvegarde (création ET modification) -
      // le premier "Enregistrer" écrasait donc systématiquement le fichier joint et les
      // questions déjà saisis, même quand evalForm les contenait bien. C'est ça qui donnait
      // l'impression que "dépublier pour modifier" faisait perdre le contenu : il avait déjà
      // été effacé en base dès le tout premier enregistrement, avant même toute dépublication.
      questions:      evalForm.questions    || [],
      ressource_url:  evalForm.ressourceUrl || "",
      blocs:          evalForm.typeRendu === "texte" ? evalForm.blocs : [],
      sur_toeic:      !!evalForm.surTOEIC,
      duree_min:      Number(evalForm.dureeMin) || 60,
      date_evaluation:evalForm.date_limite    || null,
      heure_debut:    evalForm.heure_limite   || null,
      statut:         publierDirectement ? "publie" : "brouillon",
      notifier_eleves:evalForm.notifierEleves !== false,
      // L'email ne part qu'à la publication, et une seule fois par évaluation.
      envoyer_email:  publierDirectement && !!evalForm.envoyerEmail,
    };
    try {
      let r, data;
      if (evalEditId) {
        r    = await fetch(`${API_URL}/api/groupes/${groupeId}/evaluations/${evalEditId}`, { method:"PATCH", headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" }, body:JSON.stringify(body) });
        data = await r.json();
        if (r.ok) setEvaluations(prev => prev.map(e => e.id === evalEditId ? { ...data.evaluation, groupe_nom: e.groupe_nom } : e));
      } else {
        r    = await fetch(`${API_URL}/api/groupes/${groupeId}/evaluations`, { method:"POST", headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" }, body:JSON.stringify(body) });
        data = await r.json();
        const g = groupes.find(x => x.id === groupeId);
        if (r.ok) setEvaluations(prev => [{ ...data.evaluation, groupe_nom: g?.nom || "" }, ...prev]);
      }
      if (!r.ok) { toast.error(data.error || "Erreur sauvegarde"); return; }
      const label = { devoir:"Devoir", exercice:"Exercice", evaluation:"Évaluation" }[body.categorie] || "Évaluation";
      toast.success(`${label} "${body.titre}" ${evalEditId ? "mise à jour" : "créée"} ✓`);
    } catch { toast.error("Erreur réseau"); }
    setShowCreateEvalModal(false);
    setEvalEditId(null);
    setEvalForm({ groupe_id:groupes[0]?.id||"", titre:"", date_limite:"", heure_limite:"23:59", date_ouverture:"", heure_ouverture:"", type:"qcm", categorie:"devoir", typeRendu:"fichier", surTOEIC:false, dureeMin:60, questions:[], ressourceUrl:"", instructions:"", notifierEleves:true, envoyerEmail:false, blocs:[] });
    setEvalQForm({ texte:"", options:["","","",""], correct:"", media:"" });
    setEvalBlocEditing(null);
  };

  const publierEval = async (ev) => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    try {
      const r = await fetch(`${API_URL}/api/groupes/${ev.groupe_id}/evaluations/${ev.id}`, { method:"PATCH", headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" }, body:JSON.stringify({ statut:"publie" }) });
      if (r.ok) {
        setEvaluations(prev => prev.map(e => e.id === ev.id ? { ...e, statut:"publie" } : e));
        toast.success("Évaluation publiée ✓ - apprenants notifiés");
      }
    } catch { toast.error("Erreur réseau"); }
  };

  const supprimerEval = async (ev) => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    try {
      const r = await fetch(`${API_URL}/api/groupes/${ev.groupe_id}/evaluations/${ev.id}`, { method:"DELETE", headers:{ Authorization:`Bearer ${token}` } });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setEvaluations(prev => prev.filter(e => e.id !== ev.id));
        toast.success("Évaluation supprimée");
      } else {
        toast.error(d.error || "Erreur lors de la suppression");
      }
    } catch { toast.error("Erreur réseau"); }
  };

  const depublierEval = async (ev, callback) => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    try {
      const r = await fetch(`${API_URL}/api/groupes/${ev.groupe_id}/evaluations/${ev.id}`, {
        method:"PATCH", headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({ statut:"brouillon" }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setEvaluations(prev => prev.map(e => e.id === ev.id ? { ...e, statut:"brouillon" } : e));
        toast.success("Dépublié - vous pouvez maintenant modifier le contenu");
        if (callback) callback();
      } else {
        toast.error(d.error || "Erreur lors de la dépublication");
      }
    } catch { toast.error("Erreur réseau"); }
  };

  const ouvrirEditionEval = (ev) => {
    setEvalEditId(ev.id);
    setEvalForm({
      groupe_id:          ev.groupe_id    || groupes[0]?.id || "",
      titre:              ev.titre        || "",
      date_limite:        ev.date_evaluation || "",
      heure_limite:       ev.heure_debut  || "23:59",
      date_ouverture:     ev.date_ouverture  || "",
      heure_ouverture:    ev.heure_ouverture || "00:00",
      type:               ev.type         || "qcm",
      categorie:          ev.categorie    || "evaluation",
      typeRendu:          ev.type_rendu   || "texte",
      surTOEIC:           !!ev.sur_toeic,
      dureeMin:           ev.duree_min    || 60,
      questions:          ev.questions    || [],
      ressourceUrl:       ev.ressource_url || "",
      instructions:       ev.instructions || "",
      notifierEleves:     ev.notifier_eleves !== false,
      envoyerEmail:       false,
      blocs:              ev.blocs        || [],
    });
    setEvalBlocEditing(null);
    setShowCreateEvalModal(true);
  };

  const chargerResultats = async (ev) => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    try {
      const r = await fetch(`${API_URL}/api/groupes/${ev.groupe_id}/evaluations/${ev.id}/resultats`, { headers:{ Authorization:`Bearer ${token}` } });
      const d = await r.json();
      if (r.ok) {
        setEvalResultatsModal({ evaluation: d.evaluation || ev, resultats: d.resultats || [] });
        // Pre-fill correction forms from existing data
        const forms = {};
        (d.resultats || []).forEach(({ apprenant: a, resultat: res }) => {
          forms[a.id] = { note: res.note !== null && res.note !== undefined ? String(res.note) : "", commentaire: res.commentaire_coach || "" };
        });
        // Auto-zero: si la date limite est dépassée, pré-remplir 0 pour les non-rendus
        const evalData = d.evaluation || ev;
        if (evalData.date_evaluation) {
          const limite = new Date(`${evalData.date_evaluation}T${evalData.heure_debut || "23:59"}:00`);
          if (limite < new Date()) {
            (d.resultats || []).forEach(({ apprenant: a, resultat: res }) => {
              if (res.statut === "a_faire" && !forms[a.id]?.note) {
                forms[a.id] = { note: "0", commentaire: "Non rendu" };
              }
            });
          }
        }
        setEvalCorrectForms(forms);
      }
    } catch { toast.error("Erreur chargement résultats"); }
  };

  const corrigerResultat = async (ev, gaId) => {
    const form = evalCorrectForms[gaId] || { note:"", commentaire:"" };
    const note = parseFloat(form.note);
    if (isNaN(note)) { toast.error("Note invalide"); return; }
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    try {
      const r = await fetch(`${API_URL}/api/groupes/${ev.groupe_id}/evaluations/${ev.id}/resultats/${gaId}`, {
        method:"PATCH", headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({ note, note_max: 20, commentaire_coach: form.commentaire || null }),
      });
      const d = await r.json();
      if (r.ok) {
        setEvalResultatsModal(prev => prev ? { ...prev, resultats: prev.resultats.map(item =>
          item.apprenant.id === gaId ? { ...item, resultat: d.resultat } : item
        ) } : null);
        toast.success("Note enregistrée ✓");
      } else { toast.error(d.error || "Erreur serveur"); }
    } catch { toast.error("Erreur réseau"); }
  };

  const validerDefinitivement = async (ev, resultats) => {
    if (validationEnCours.has(ev.id)) return;
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");

    // Construire le payload : note du formulaire OU note déjà sauvegardée
    const corrections = resultats.map(({ apprenant: a, resultat: r }) => {
      const f = evalCorrectForms[a.id] || {};
      const note = f.note !== "" && !isNaN(parseFloat(f.note))
        ? parseFloat(f.note)
        : (r.statut === "corrige" ? r.note : null);
      return {
        ga_id:             a.id,
        note,
        note_max:          f.note_max ?? r.note_max ?? 20,
        commentaire_coach: f.commentaire || r.commentaire_coach || null,
      };
    });

    // Vérification front (double sécurité)
    const sansNote = corrections.filter(c => c.note === null || c.note === undefined || isNaN(c.note));
    if (sansNote.length > 0) {
      toast.error(`${sansNote.length} apprenant(s) sans note - renseignez toute la classe avant de valider`);
      return;
    }

    setValidationEnCours(prev => new Set(prev).add(ev.id));
    try {
      const r = await fetch(`${API_URL}/api/groupes/${ev.groupe_id}/evaluations/${ev.id}/valider`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ corrections }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.error || "Erreur lors de la validation"); return; }

      toast.success(`✅ Notes validées pour ${d.total} apprenant(s) - apprenants et PA notifiés`);
      // Mettre à jour l'état local : tous passent en "corrige"
      setEvalResultatsModal(prev => prev ? {
        ...prev,
        resultats: prev.resultats.map(item => {
          const c = corrections.find(x => x.ga_id === item.apprenant.id);
          return c ? { ...item, resultat: { ...item.resultat, statut:"corrige", note:c.note, note_max:c.note_max, commentaire_coach:c.commentaire_coach } } : item;
        }),
      } : null);
      setEvaluations(prev => prev.map(e => e.id === ev.id ? { ...e, statut:"cloture" } : e));
    } catch { toast.error("Erreur réseau"); }
    finally { setValidationEnCours(prev => { const n = new Set(prev); n.delete(ev.id); return n; }); }
  };

  /* ── AJOUTER QUESTION ÉVALUATION ── */
  // Cible le bloc en cours d'édition (evalBlocEditing) si présent - sinon le format unique
  // legacy (evalForm.questions), gardé pour compatibilité avec les évaluations déjà créées.
  const addEvalQuestion = () => {
    if (!evalQForm.texte.trim()) { toast.error("Texte de la question requis"); return; }
    if (!evalQForm.correct) { toast.error("Sélectionnez la bonne réponse"); return; }
    const qid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (evalBlocEditing) {
      setEvalForm(f => ({ ...f, blocs: f.blocs.map(b => b.id === evalBlocEditing
        ? { ...b, questions: [...(b.questions||[]), { id: qid, ...evalQForm }] }
        : b) }));
    } else {
      setEvalForm(f => ({ ...f, questions: [...f.questions, { id: qid, ...evalQForm }] }));
    }
    setEvalQForm({ texte:"", options:["","","",""], correct:"", media:"" });
  };

  const addEvalBloc = (type) => {
    // Date.now() seul peut produire des doublons si le coach clique vite sur plusieurs
    // boutons "+ Bloc" - deux blocs partageant le même id se marchent dessus côté apprenant
    // (submitBlocs[id] partagé), rendant le bloc speaking impossible à valider/soumettre.
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setEvalForm(f => ({ ...f, blocs: [...f.blocs, { id, type, questions:[], ressourceUrl:"", instructions:"", conseil:"" }] }));
    setEvalBlocEditing(id);
    setEvalQForm({ texte:"", options:["","","",""], correct:"", media:"" });
  };

  const removeEvalBloc = (id) => {
    setEvalForm(f => ({ ...f, blocs: f.blocs.filter(b => b.id !== id) }));
    if (evalBlocEditing === id) setEvalBlocEditing(null);
  };

  const updateEvalBloc = (id, patch) => {
    setEvalForm(f => ({ ...f, blocs: f.blocs.map(b => b.id === id ? { ...b, ...patch } : b) }));
  };

  const removeEvalBlocQuestion = (blocId, qi) => {
    setEvalForm(f => ({ ...f, blocs: f.blocs.map(b => b.id === blocId
      ? { ...b, questions: b.questions.filter((_,i) => i !== qi) }
      : b) }));
  };


  /* ── CRÉER UN NOUVEAU MODULE ── */
  const createNewModule = async () => {
    if (!newModForm.titre) { toast.error("Titre du contenu requis"); return; }
    const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
    const groupeIds = Array.isArray(newModForm.groupe_ids)
      ? newModForm.groupe_ids
      : (newModForm.groupe_id ? [newModForm.groupe_id] : []);
    try {
      const r = await fetch(`${API_URL}/api/cours-elearning`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          titre:         newModForm.titre,
          groupe_ids:    groupeIds,
          objectifs:     newModForm.objectifs.split("\n").filter(Boolean),
          duree_estimee: Number(newModForm.dureeEstimee),
          semaine:       newModForm.semaine   || "",
          type_contenu:  newModForm.type_contenu || "lecon",
          statut:        "brouillon",
          ordre:         1,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur serveur");
      const ct = d.contenu;
      setCours(prev => [ct, ...prev]);
      setModulesContent(prev => ({ ...prev, [ct.id]: {
        id: ct.id, titre: ct.titre, objectifs: ct.objectifs || [],
        dureeEstimee: ct.dureeEstimee || 60, statut: ct.statut, ordre: ct.ordre, blocs: ct.blocs || [],
      } }));
      toast.success(`« ${ct.titre} » créé - éditeur ouvert ✓`);
      setShowNewModuleModal(false);
      setNewModForm({ coursId: "", groupe_id: "", groupe_ids: [], titre:"", objectifs:"", dureeEstimee:60, type_contenu:"lecon", semaine:"", statut:"brouillon" });
      setActiveTab("modules_contenu");
      openModuleBuilder(ct.id, ct.id, ct);
    } catch (e) { toast.error(e.message); }
  };

  /* ── CRÉER UN NOUVEAU COURS ── */

  /* ── SIGNAL AU RESPONSABLE ── */
  const sendSignal = () => {
    if (!signalForm.sujet || !signalForm.description) { toast.error("Sujet et description requis"); return; }
    const typeLabels = { probleme_technique:"🔧 Problème technique", probleme_etudiant:"👤 Problème étudiant", demande_ressource:"📦 Demande ressource", autre:"💬 Autre" };
    const urgenceColors = { normale:"normale", haute:"haute ⚠️", critique:"critique 🚨" };
    const newMsg = {
      id: Date.now(), de: "Moi (Professeur)", avatar: "MP",
      date: new Date().toISOString().split("T")[0], lu: true,
      objet: `${typeLabels[signalForm.type]} - ${signalForm.sujet}`,
      msg: `[Urgence : ${urgenceColors[signalForm.urgence]}]\n\n${signalForm.description}`,
      type: "envoye", sens: "envoye", destinataire: "responsable",
    };
    setMessages(prev => [newMsg, ...prev]);
    toast.success("Signal envoyé au responsable pédagogique ✓");
    setShowSignalModal(false);
    setSignalForm({ type:"probleme_technique", sujet:"", description:"", urgence:"normale" });
  };

  /* ── ENVOYER MESSAGE ── */
  const sendNewMessage = () => {
    if (!newMsgForm.objet || !newMsgForm.message) { toast.error("Objet et message requis"); return; }
    let destinataireNom = "";
    if (newMsgForm.destinataire === "etudiant") {
      if (!newMsgForm.etudiantId) { toast.error("Sélectionnez un étudiant"); return; }
      destinataireNom = etudiants.find(e => e.id === Number(newMsgForm.etudiantId))?.nom || "";
    } else {
      destinataireNom = "Responsable Pédagogique";
    }
    const newMsg = {
      id: Date.now(), de: "Moi (Professeur)", avatar: "MP",
      date: new Date().toISOString().split("T")[0], lu: true,
      objet: newMsgForm.objet, msg: newMsgForm.message,
      type: "envoye", sens: "envoye",
      destinataire: newMsgForm.destinataire === "etudiant" ? Number(newMsgForm.etudiantId) : "responsable",
    };
    setMessages(prev => [newMsg, ...prev]);
    toast.success(`Message envoyé à ${destinataireNom} ✓`);
    setShowNewMsgModal(false);
    setNewMsgForm({ destinataire:"etudiant", etudiantId:"", objet:"", message:"" });
  };

  /* ── RÉPONDRE DANS UNE CONVERSATION ── */
  const sendConvReply = () => {
    if (!convReply.trim() || !activeConvMsg) return;
    const reply = {
      id: Date.now(), de: "Moi (Professeur)", avatar: "MP",
      date: new Date().toISOString().split("T")[0], lu: true,
      objet: `Re: ${activeConvMsg.objet}`, msg: convReply.trim(),
      type: "envoye", sens: "envoye", conversationId: activeConvMsg.id,
    };
    setMessages(prev => [reply, ...prev]);
    setConvReply("");
    toast.success("Réponse envoyée ✓");
  };

  /* ── NOTIFICATIONS ── */
  const sendNotification = () => {
    if (!notifForm.titre||!notifForm.message) { toast.error("Titre et message requis"); return; }
    const c=cours.find(x=>String(x.id)===String(notifForm.coursId));
    setNotifications(prev=>[{ id:Date.now(),type:notifForm.type,titre:notifForm.titre,message:notifForm.message,cours:c?.titre||"",destinataires:c?.etudiants||0,date:new Date().toISOString().split("T")[0],statut:"envoye" },...prev]);
    toast.success(`Notification envoyée à ${c?.etudiants||0} étudiant(s) ✓`);
    setShowNotifModal(false);
    setNotifForm({ titre:"", message:"", coursId:1, type:"info" });
  };



const messagesFiltres = useMemo(() => {
  let r = [...messages];
  if (filterMsgType === "responsable") {
    r = r.filter(m => m.type === "responsable");
  } else if (filterMsgType === "etudiant") {
    r = r.filter(m => m.type === "etudiant");
  } else if (filterMsgType === "envoye") {
    r = r.filter(m => m.sens === "envoye");
  } else if (filterMsgType === "admin") {
    r = r.filter(m => m.type === "admin");
  }
  if (filterMsgLu !== "Tous") {
    r = r.filter(m => m.lu === (filterMsgLu === "lu"));
  }
  if (searchMsg) {
    r = r.filter(m => m.objet.toLowerCase().includes(searchMsg.toLowerCase()) || m.msg.toLowerCase().includes(searchMsg.toLowerCase()));
  }
  return r;
}, [messages, filterMsgType, filterMsgLu, searchMsg]);


  const { messages: groupeMessages, sendMessage: sendGroupeMessage, markRead: markGroupeRead } = useGroupeChat(selectedGroupe?.id || null);

  useEffect(() => {
    if (selectedGroupe?.id && MON_PROFIL_REEL?.id) markGroupeRead(MON_PROFIL_REEL.id);
  }, [selectedGroupe?.id, groupeMessages.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const sendGroupeMsg = async () => {
    if (!chatInput.trim() && !pendingChatFile) return;
    if (!selectedGroupe || fichierUploading) return;

    // Envoyer le texte si présent
    if (chatInput.trim()) {
      await sendGroupeMessage(MON_PROFIL_REEL.id, `${MON_PROFIL_REEL.prenom} ${MON_PROFIL_REEL.nom}`, chatInput.trim());
      setChatInput("");
    }

    // Uploader et envoyer le fichier si en attente
    if (pendingChatFile) {
      setFichierUploading(true);
      try {
        const { file, type } = pendingChatFile;
        const isImage = type === "image";
        const endpoint = isImage ? "image" : "document";
        const fd = new FormData(); fd.append("file", file);
        const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
        const r = await fetchUpload(`${API_URL}/api/upload/${endpoint}`, { method:"POST", headers:{ Authorization:`Bearer ${token}` }, body:fd });
        if (!r.ok) { const d = await r.json(); throw new Error(d.error || "Erreur upload"); }
        const d = await r.json();
        const url = d.file?.url || d.url;
        if (url) {
          await sendGroupeMessage(MON_PROFIL_REEL.id, `${MON_PROFIL_REEL.prenom} ${MON_PROFIL_REEL.nom}`, "", { nom: file.name, url, type });
          await fetch(`${API_URL}/api/groupes/${selectedGroupe.id}/fichiers`, {
            method:"POST", headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
            body: JSON.stringify({ nom:file.name, url, type_fichier:type, taille_ko:Math.round(file.size/1024) })
          });
          setGroupeFichiers(prev => [{ id:Date.now(), nom:file.name, url, type_fichier:type }, ...prev]);
          toast.success(`✅ Fichier partagé - ${file.name}`);
        }
      } catch (err) { toast.error(`Erreur : ${err.message}`); }
      finally { setFichierUploading(false); setPendingChatFile(null); }
    }
  };

  const tachesDispoNonRemplie = dispoMoisCourantRempli===false ? 1 : 0;
  const tachesDemandesAPourvoir = demandesAbsence.filter(d=>d.statut==="a_pourvoir").length;
  const tachesEvalAVenir = evalAVenir;
  const tachesTotal = tachesDispoNonRemplie + tachesDemandesAPourvoir + tachesEvalAVenir;

  // Ce qu'est une session « à venir » - défini UNE fois.
  //
  // Le badge de l'onglet ne regardait que la date, alors que l'écran, lui, écarte aussi les
  // sessions clôturées. Une séance terminée mais programmée la semaine prochaine était donc
  // comptée comme à venir : le badge annonçait 7 là où l'écran affichait « 2 à venir /
  // 5 terminées ». Les deux lisent désormais la même règle.
  const estSessionAVenir = (s) =>
    s.statut !== "terminee" && !sessionsRealisees.has(s.id) &&
    new Date(`${s.date}T${s.heure}`) > new Date();
  const nbSessionsAVenir = liveSessions.filter(estSessionAVenir).length;

  const tabs = [
    { key:"taches",          label:"Mes tâches",      icon:"✅", count: tachesTotal || null, danger: tachesTotal>0 },
    { key:"dashboard",       label:"Tableau de bord", icon:"🏠", count:null },
    { key:"groupes",         label:"Mes Contrats",      icon:"📋", count: groupes.filter(g=>g.statut==="actif" && Number(g.capacite_max)!==1).length || null },
    { key:"etudiants",       label:"Apprenants",        icon:"👥", count:etudiants.length },
    { key:"planning",        label:"Planning",          icon:"📅", count:stats.seancesAV },
    { key:"disponibilites",  label:"Disponibilités",    icon:"🗓️", count: dispoMoisCourantRempli===false ? "!" : null, danger: dispoMoisCourantRempli===false },
    { key:"presences",       label:"Présences",         icon:"✅", count:null },
    { key:"evaluations",     label:"Évaluations",       icon:"📝", count:evalAVenir||null, danger:evalAVenir>0 },
    { key:"session_live",   label:"Session Live",       icon:"📡", count: nbSessionsAVenir || null },
    { key:"modules_contenu", label:"Médiathèque",icon:"🧩", count:null },
    { key:"ressources",      label:"Ressources",        icon:"📂", count:ressources.length },
    { key:"demandes",        label:"Mes demandes",      icon:"📨", count:demandesAbsence.filter(d=>d.statut==="a_pourvoir").length || null, danger:demandesAbsence.some(d=>d.statut==="a_pourvoir") },
    { key:"honoraires",      label:"Honoraires",         icon:"💵", count:null },
    { key:"recompenses",     label:"Récompenses",        icon:"🏆", count:null },
    { key:"messages",        label:"Messages",          icon:"💬", count:msgNonLus||null, danger:msgNonLus>0 },
    { key:"notifs",          label:"Notifications",     icon:"🔔", count:nbNotifsNonLues||null, danger:nbNotifsNonLues>0 },
    { key:"profil",          label:"Mon profil",        icon:"👤", count:null },
  ];

  /* ══════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════ */
  return (
    <div style={{ display:"flex", minHeight:"100vh", background:"#f0f9ff" }}>
     
      <div style={{ flex:1, overflowX:"hidden" }}>

        {/* ── HERO ── */}
        <div style={{ background:BET_GRAD, padding:"26px 28px 0", color:"#fff", position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:-40, right:-30, width:180, height:180, borderRadius:"50%", background:"rgba(255,255,255,0.04)", zIndex:0 }}/>
          <div style={{ display:"flex", alignItems:"center", gap:18, marginBottom:24, position:"relative", zIndex:2 }}>
            <div style={{ position:"relative", flexShrink:0 }} onClick={()=>{ if ((coachAvatarUrl || MON_PROFIL_REEL.photo_url)) setPhotoProfilOuverte(true); }}>
              <div style={{ width:60, height:60, borderRadius:"50%", background:"rgba(255,255,255,0.14)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:20, color:"#fff", border:"3px solid rgba(255,255,255,0.3)", overflow:"hidden" , cursor: (coachAvatarUrl || MON_PROFIL_REEL.photo_url) ? "zoom-in" : "default"}}>
                {(coachAvatarUrl || MON_PROFIL_REEL.photo_url)
                  ? <img src={coachAvatarUrl || MON_PROFIL_REEL.photo_url} alt={MON_PROFIL_REEL.prenom} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  : MON_PROFIL_REEL.avatar}
              </div>
              {photoProfilOuverte && <VisionneuseImage url={(coachAvatarUrl || MON_PROFIL_REEL.photo_url)} onClose={()=>setPhotoProfilOuverte(false)} />}
              <label title="Changer la photo" onClick={e=>e.stopPropagation()} style={{ position:"absolute", bottom:0, right:0, width:20, height:20, borderRadius:"50%", background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:11, border:"2px solid #fff" }}>
                📷
                <input type="file" accept="image/*" style={{ display:"none" }} onChange={(e) => { const f=e.target.files?.[0]; if(f){ uploadFichier(f, "avatar").then(handleCoachAvatarSuccess).catch(e=>toast.error(e.message)); } e.target.value=""; }} />
              </label>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:"#7dd3fc", fontWeight:600, letterSpacing:"0.08em", marginBottom:2 }}>ESPACE COACH 🎓</div>
              {/* Le SURNOM passe devant : c'est sous ce nom que le coach est appele au
                  centre, et il n'apparaissait nulle part dans son propre espace. Le nom
                  d'etat-civil reste dessous, en second plan - on ne le supprime pas, il
                  sert a se reconnaitre sur les documents officiels. */}
              {surnomPerso.trim() ? (
                <>
                  <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:"#fff", lineHeight:1.15, textAlign:"left" }}>
                    « {surnomPerso.trim()} »
                  </h1>
                  <div style={{ fontSize:13, color:"rgba(255,255,255,0.72)", fontWeight:600, marginTop:1 }}>
                    {MON_PROFIL_REEL.prenom} {MON_PROFIL_REEL.nom}
                  </div>
                </>
              ) : (
                <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:"#fff", textAlign:"left" }}>{MON_PROFIL_REEL.prenom} {MON_PROFIL_REEL.nom}</h1>
              )}
              <div style={{ fontSize:12, color:"#bae6fd", marginTop:3, display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                <span>{MON_PROFIL_REEL.specialite}</span>
                <span style={{ padding:"2px 8px", borderRadius:10, background:"rgba(255,255,255,0.15)" }}>🏆 {MON_PROFIL_REEL.xp}</span>
                {coachCentreLabel && (
                  <span style={{ padding:"2px 10px", borderRadius:10, background:"rgba(8,145,178,0.4)", border:"1px solid rgba(125,211,252,0.5)", fontWeight:700, color:"#e0f2fe" }}>
                    🏢 {coachCentreLabel}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"row", alignItems:"center", gap:10, position:"relative", zIndex:2, flexWrap:"wrap", justifyContent:"flex-end" }}>
              {/* Sa note d'observation et la categorie de contrat qu'elle ouvre.
                  Affichee meme sans note : ne rien montrer ne distinguait pas « pas
                  encore observe » d'un serveur qui n'a pas repondu. */}
              {maNote && (
                <div
                  title={maNote.nb_avec_note > 0
                    ? `Moyenne de vos ${maNote.nb_avec_note} observation${maNote.nb_avec_note > 1 ? "s" : ""} - ${BAREME_TEXTE}`
                    : `Aucune observation notee pour le moment - ${BAREME_TEXTE}`}
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 12px",
                    background:"rgba(255,255,255,0.08)", borderRadius:10,
                    border:`1px solid ${maNote.moyenne ? NOTE_COULEUR(maNote.moyenne) + "80" : "rgba(255,255,255,0.12)"}` }}>
                  <div style={{ width:38, height:38, borderRadius:"50%", flexShrink:0,
                    background: NOTE_FOND(maNote.moyenne),
                    border:`2.5px solid ${NOTE_COULEUR(maNote.moyenne)}`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontWeight:900, fontSize:13, color:NOTE_COULEUR(maNote.moyenne) }}>
                    {maNote.moyenne ? Number(maNote.moyenne).toFixed(1) : "-"}
                  </div>

                  {/* Les cinq dernieres notes dans l'ordre, puis la fleche de tendance.
                      La moyenne seule ne dit pas si le coach monte ou descend - deux
                      coachs a 3,5 n'ont pas la meme trajectoire. La fleche n'a de sens
                      qu'a partir de deux notes : avec une seule, il n'y a rien a comparer. */}
                  {(maNote.dernieres_notes || []).length > 0 && (
                    <div style={{ display:"flex", gap:3, alignItems:"flex-end", height:26, flexShrink:0 }}
                      title={`Vos ${maNote.dernieres_notes.length} dernieres notes : ${maNote.dernieres_notes.join(" · ")}`}>
                      {maNote.dernieres_notes.map((n, ni) => (
                        <div key={ni} style={{ width:7, borderRadius:3, background:NOTE_COULEUR(n),
                          height:`${(n / 5) * 100}%`, minHeight:4 }} />
                      ))}
                    </div>
                  )}
                  {(maNote.dernieres_notes || []).length >= 2 && (
                    <div title={`Tendance : ${maNote.tendance}`}
                      style={{ fontSize:17, fontWeight:900, flexShrink:0, width:18, textAlign:"center",
                        color: maNote.tendance === "hausse" ? "#4ade80"
                             : maNote.tendance === "baisse" ? "#f87171" : "#94a3b8" }}>
                      {maNote.tendance === "hausse" ? "↗" : maNote.tendance === "baisse" ? "↘" : "→"}
                    </div>
                  )}

                  <div style={{ lineHeight:1.3 }}>
                    <div style={{ fontSize:10, color:"#7dd3fc", marginBottom:3 }}>Ma note</div>
                    <BadgeCategorieCoach note={maNote.moyenne} taille="xs" />
                  </div>
                </div>
              )}
              <div style={{ textAlign:"center", padding:"6px 14px", background:"rgba(255,255,255,0.08)", borderRadius:10, border:"1px solid rgba(255,255,255,0.12)" }}>
                <div style={{ fontSize:10, color:"#7dd3fc" }}>Ce mois</div>
                <div style={{ fontSize:20, fontWeight:900, lineHeight:1.1 }}>
                  {heuresMoisReelles % 1 === 0 ? heuresMoisReelles : heuresMoisReelles.toFixed(1)}h
                </div>
                <div style={{ fontSize:10, color:"#bae6fd" }}>dispensées</div>
              </div>
              <NotificationBell userId={MON_PROFIL_REEL?.id} />
              <button onClick={toggleLang} style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:10, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", transition:"background .2s", letterSpacing:"0.06em" }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.2)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}>
                {lang === "FR" ? "🇫🇷 FR" : "🇬🇧 EN"}
              </button>
              <DashboardColorPicker />
              {accesElearning && (
                <button type="button" onClick={() => openElearningSSO(ELEARNING_URL)} style={{ padding:"6px 14px", background:BET_GRAD, border:"none", borderRadius:8, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
                  🎓 E-Learning
                </button>
              )}
              <button type="button" onClick={handleLogout} style={{ padding:"6px 14px", background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.25)", borderRadius:8, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                🚪 Déconnexion
              </button>
            </div>
          </div>
          {/* Mini stats */}
          <div style={{ display:"flex", background:"rgba(0,0,0,0.18)", borderRadius:"10px 10px 0 0", overflow:"hidden" }}>
            {[
              { l:"Cours actifs",       v:cours.length,            c:"#38bdf8" },
              { l:"Total étudiants",    v:stats.totalEtudiants,    c:"#34d399" },
              { l:"Progression moy.",   v:`${stats.avgProg}%`,     c:"#a78bfa" },
              { l:"Assiduité moy.",     v:`${stats.avgAssid}%`,    c:"#fbbf24" },
              { l:"À surveiller",       v:stats.enDanger,          c:stats.enDanger>0?"#f87171":"#6ee7b7" },
              { l:"Séances à venir",    v:stats.seancesAV,         c:"#38bdf8" },
            ].map((s,i,arr) => (
              <div key={s.l} style={{ flex:1, textAlign:"center", padding:"12px 6px", borderRight:i<arr.length-1?"1px solid rgba(255,255,255,0.07)":"none" }}>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.45)", marginBottom:2 }}>{s.l}</div>
                <div style={{ fontSize:19, fontWeight:800, color:s.c }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding:"0 24px 28px" }}>
          {/* ── TABS ── */}
          <div style={{ display:"flex", gap:3, marginBottom:0, paddingTop:18, flexWrap:"wrap" }}>
            {tabs.map(tab => {
              const ia = activeTab === tab.key;
              return (
                <button key={tab.key} onClick={()=>setActiveTab(tab.key)} style={{
                  padding:"9px 14px", borderRadius:"8px 8px 0 0", border:"none", cursor:"pointer",
                  fontWeight:600, fontSize:12,
                  background: ia?"#fff":"#e0f2fe",
                  color: ia?BET:"#0369a1",
                  boxShadow: ia?"0 -2px 8px rgba(8,145,178,0.12)":"none",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                  flex:"1 1 120px", whiteSpace:"nowrap",
                }}>
                  <span style={{ fontSize:13 }}>{tab.icon}</span>{tab.label}
                  {tab.count!=null&&(<span style={{ padding:"1px 6px", borderRadius:9, fontSize:10, fontWeight:700,
                    background:tab.danger?"#fee2e2":ia?BET_LIGHT:"#bae6fd",
                    color:tab.danger?"#dc2626":ia?BET:"#0369a1" }}>{tab.count}</span>)}
                </button>
              );
            })}
          </div>

          {!banderoleFermeeCoach && notifsBanderoleCoach.length > 0 && (
            <div style={{ padding:"10px 20px", background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:8, marginTop:10, display:"flex", alignItems:"flex-start", gap:10 }}>
              <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>🔔</span>
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:4 }}>
                {notifsBanderoleCoach.map(n => (
                  <div key={n.id} onClick={() => { marquerNotifLueCoach(n.id); setActiveTab("notifs"); }}
                    style={{ cursor:"pointer", display:"flex", flexDirection:"column" }}>
                    <span style={{ fontWeight:700, color:"#9a3412", fontSize:12 }}>{n.titre}</span>
                    <span style={{ color:"#78716c", fontSize:11 }}>{n.message}</span>
                  </div>
                ))}
                {nbNotifsNonLues > notifsBanderoleCoach.length && (
                  <button onClick={()=>setActiveTab("notifs")} style={{ alignSelf:"flex-start", background:"none", border:"none", color:"#9a3412", fontWeight:700, fontSize:11, cursor:"pointer", padding:0 }}>
                    +{nbNotifsNonLues - notifsBanderoleCoach.length} autre{nbNotifsNonLues - notifsBanderoleCoach.length > 1 ? "s" : ""} →
                  </button>
                )}
              </div>
              <button onClick={()=>setBanderoleFermeeCoach(true)} title="Masquer" style={{ background:"none", border:"none", cursor:"pointer", color:"#9a3412", fontSize:14, flexShrink:0 }}>✕</button>
            </div>
          )}

          {/* ── CARD PRINCIPALE ── */}
          <div style={{ ...card, borderRadius:"0 12px 12px 12px" }}>

            {/* ════════ MES TÂCHES ════════ */}
            {activeTab==="taches" && (() => {
              const taches = [
                { icon:"🗓️", label:"Disponibilités du mois non remplies", n:tachesDispoNonRemplie,   tab:"disponibilites" },
                { icon:"📨", label:"Demandes de remplacement à pourvoir", n:tachesDemandesAPourvoir, tab:"demandes" },
                { icon:"📝", label:"Évaluations à venir",                 n:tachesEvalAVenir,        tab:"evaluations" },
              ];
              const enCours = taches.filter(t => t.n > 0);
              return (
                <div>
                  <div style={tabHeader}>
                    <div><h2 style={tabTitle}>✅ Mes tâches</h2><p style={tabSubtitle}>
                      {enCours.length > 0
                        ? `${tachesTotal} élément${tachesTotal>1?"s":""} à traiter au total.`
                        : "Rien à traiter pour le moment - tout est à jour."}
                    </p></div>
                  </div>
                  {enCours.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"50px 0", color:"#94a3b8" }}>
                      <div style={{ fontSize:"2.4rem", marginBottom:8 }}>🎉</div>
                      Aucune tâche en attente.
                    </div>
                  ) : (
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:14 }}>
                      {enCours.map((t,i) => (
                        <div key={i} onClick={() => setActiveTab(t.tab)}
                          style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:14, padding:"16px 18px", cursor:"pointer", display:"flex", alignItems:"center", gap:14, transition:"border-color .15s" }}
                          onMouseEnter={e=>e.currentTarget.style.borderColor=BET}
                          onMouseLeave={e=>e.currentTarget.style.borderColor="#e2e8f0"}>
                          <div style={{ fontSize:"1.6rem" }}>{t.icon}</div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{t.label}</div>
                            <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>Cliquer pour ouvrir</div>
                          </div>
                          <div style={{ background:"#ef4444", color:"#fff", borderRadius:99, fontSize:13, fontWeight:800, padding:"3px 11px", minWidth:26, textAlign:"center" }}>{t.n}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ════════ DASHBOARD ════════ */}
            {activeTab==="dashboard" && (
              <div>
                <div style={tabHeader}>
                  <div><h2 style={tabTitle}>Tableau de bord</h2><p style={tabSubtitle}>Bonjour Prof. {MON_PROFIL_REEL.prenom} - voici votre résumé du jour</p></div>
                  <div style={{ fontSize:12, color:"#9ca3af" }}>{new Date().toLocaleDateString("fr-FR",{ weekday:"long", day:"numeric", month:"long", year:"numeric" })}</div>
                </div>
                {delegationsRecues.map(d => (
                  <div key={d.id} style={{ background:BET_GRAD, borderRadius:12, padding:"12px 20px", marginBottom:16, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                    <span style={{ fontSize:18 }}>🔄</span>
                    <div style={{ flex:1, minWidth:220 }}>
                      <div style={{ color:"#fff", fontWeight:800, fontSize:13 }}>
                        Délégation active{d.absent_nom ? ` - vous remplacez ${d.absent_nom}` : ""}
                      </div>
                      <div style={{ color:"rgba(255,255,255,0.75)", fontSize:11, marginTop:2 }}>
                        {d.groupe_nom ? `Groupe : ${d.groupe_nom} · ` : ""}{(d.sessions_ids||[]).length} session{(d.sessions_ids||[]).length>1?"s":""} déléguée{(d.sessions_ids||[]).length>1?"s":""}
                        {d.assigne_par_nom ? ` · Assigné par ${d.assigne_par_nom} (PA Advisor)` : ""}
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:24 }}>
                  <StatCard label="Séances aujourd'hui" value={seancesDuJour.length||"0"} color={BET} icon="📅" sub="voir le planning" onClick={()=>setActiveTab("planning")} />
                  <StatCard label="Étudiants total"      value={etudiants.length}   color="#7c3aed" icon="👥" sub={`${stats.enDanger} à surveiller`} onClick={()=>setActiveTab("etudiants")} />
                  <StatCard label="Taux de présence" value={`${stats.avgAssid}%`} color={stats.avgAssid>=75?"#059669":"#d97706"} icon="📊" sub="assiduité moyenne" onClick={()=>setActiveTab("presences")} />
                  <StatCard label="Eval. publiées"        value={evaluations.filter(e=>e.statut==="publie").length} color="#d97706" icon="📝" onClick={()=>setActiveTab("evaluations")} />
                  <StatCard label="Messages non lus"     value={msgNonLus}          color={msgNonLus>0?"#ef4444":"#9ca3af"} icon="💬" onClick={()=>setActiveTab("messages")} />
                  <StatCard label="Ressources partagées" value={ressources.filter(r=>r.partage).length} color="#059669" icon="📂" onClick={()=>setActiveTab("ressources")} />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:20 }}>
                  {/* Mes cours */}
                  <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
                      <h3 style={blockTitle}>Ma médiathèque</h3>
                    </div>
                    {/* Ces cartes affichaient une progression calculée sur `modulesOk/modules`
                        et des heures - tous champs du niveau « Cours » supprimé, donc
                        undefined : d'où le NaN%, le « /modules » vide et « Invalid Date ».
                        Un contenu n'a pas de progression : aucun suivi de lecture par
                        apprenant n'existe. On affiche donc ce qu'il sait réellement dire. */}
                    {cours.length === 0 && (
                      <div style={{ padding:"18px 14px", borderRadius:10, background:"#fff", border:"1px dashed #e5e7eb", fontSize:12.5, color:"#94a3b8", textAlign:"center" }}>
                        Aucun contenu pour l'instant - créez-en un depuis la Médiathèque.
                      </div>
                    )}
                    {cours.map(c => {
                      const tm = ({ lecon:{e:"📖",l:"Leçon",c:"#2563eb"}, audio:{e:"🎧",l:"Audio",c:"#7c3aed"}, video:{e:"🎬",l:"Vidéo",c:"#dc2626"} })[c.type_contenu]
                        || { e:"📚", l:"Contenu", c:"#64748b" };
                      const nbBlocs = (c.blocs || []).length;
                      const classes = c.groupe_noms || [];
                      const publie = c.statut === "publie";
                      return (
                        <div key={c.id} style={{ padding:"12px 14px", borderRadius:10, background:"#fff", border:"1px solid #e5e7eb", marginBottom:10, cursor:"pointer" }}
                          onClick={()=>setActiveTab("modules_contenu")}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, gap:10 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:0 }}>
                              <span style={{ fontSize:20 }}>{tm.e}</span>
                              <div style={{ minWidth:0 }}>
                                <div style={{ fontWeight:700, fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.titre}</div>
                                <div style={{ fontSize:11, color:"#9ca3af" }}>
                                  {tm.l} · {nbBlocs} partie{nbBlocs!==1?"s":""} · {c.dureeEstimee || 0} min
                                </div>
                              </div>
                            </div>
                            <span style={{ flexShrink:0, fontSize:10.5, fontWeight:700, padding:"2px 9px", borderRadius:999,
                              background: publie ? "#dcfce7" : "#fef3c7", color: publie ? "#15803d" : "#b45309" }}>
                              {publie ? "Publié" : "Brouillon"}
                            </span>
                          </div>
                          {classes.length > 0 ? (
                            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                              {classes.map(n => (
                                <span key={n} style={{ fontSize:10.5, fontWeight:600, padding:"2px 8px", borderRadius:999, background:"#f1f5f9", color:"#475569" }}>{n}</span>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize:11, color:"#b45309", fontWeight:600 }}>Aucune classe destinataire</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                    {/* Top étudiants */}
                    <div style={{ background:"#f8fafc", borderRadius:12, padding:18 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
                        <h3 style={{ ...blockTitle, margin:0 }}>🏆 Top élèves</h3>
                        <button onClick={()=>setActiveTab("etudiants")} style={btnGhost}>Voir →</button>
                      </div>
                      {[...etudiants].sort((a,b)=>b.progression-a.progression).slice(0,4).map((e,i) => (
                        <div key={e.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8, cursor:"pointer" }}
                          onClick={()=>{ setSelectedEtud(e); setShowEtudModal(true); }}>
                          <span style={{ fontSize:16 }}>{["🥇","🥈","🥉","4️⃣"][i]}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:600, fontSize:12 }}>{e.nom}</div>
                            <Bar value={e.progression} color={BET} h={5}/>
                          </div>
                          <span style={{ fontWeight:800, color:"#059669", fontSize:13 }}>{e.progression}%</span>
                        </div>
                      ))}
                    </div>
                    {/* Alertes */}
                    {(() => {
                      const aSurveiller = etudiants.filter(e=>e.assiduite<80||e.progression<45);
                      const MAX_VISIBLES = 4;
                      return (
                        <div style={{ background:"#f8fafc", borderRadius:12, padding:18 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                            <h3 style={{ ...blockTitle, margin:0 }}>⚠️ À surveiller</h3>
                            {aSurveiller.length > 0 && <span style={{ fontSize:11, fontWeight:700, color:"#dc2626" }}>{aSurveiller.length}</span>}
                          </div>
                          {aSurveiller.length === 0 ? (
                            <div style={{ fontSize:12, color:"#9ca3af" }}>Rien à signaler ✓</div>
                          ) : (
                            <div style={{ maxHeight:220, overflowY:"auto", display:"flex", flexDirection:"column", gap:6 }}>
                              {aSurveiller.slice(0, MAX_VISIBLES).map(e => (
                                <div key={e.id} style={{ padding:"8px 10px", borderRadius:8, background:"#fff5f5", border:"1px solid #fecaca", cursor:"pointer", fontSize:12 }}
                                  onClick={()=>{ setSelectedEtud(e); setShowEtudModal(true); }}>
                                  <strong style={{ color:"#dc2626" }}>{e.nom}</strong>
                                  <div style={{ color:"#9ca3af", fontSize:11 }}>
                                    {e.assiduite<80 && `Assiduité ${e.assiduite}% `}
                                    {e.progression<45 && `Progression ${e.progression}%`}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {aSurveiller.length > MAX_VISIBLES && (
                            <button onClick={()=>setActiveTab("etudiants")} style={{ ...btnGhost, marginTop:8, width:"100%", textAlign:"center" }}>
                              + {aSurveiller.length - MAX_VISIBLES} autre{aSurveiller.length - MAX_VISIBLES > 1 ? "s" : ""} →
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    {/* Prochaines séances */}
                    <div style={{ background:"#f8fafc", borderRadius:12, padding:18 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                        <h3 style={{ ...blockTitle, margin:0 }}>📅 Prochaines séances</h3>
                        <button onClick={()=>setActiveTab("planning")} style={btnGhost}>Voir →</button>
                      </div>
                      {seances.filter(s=>s.statut!=="termine"&&s.statut!=="annule").slice(0,3).map(s => {
                        const c = cours.find(x=>x.id===s.coursId);
                        return (
                          <div key={s.id} style={{ padding:"8px 10px", borderRadius:8, background:"#fff", border:"1px solid #e5e7eb", marginBottom:6, fontSize:12 }}>
                            <div style={{ fontWeight:600 }}>{s.titre}</div>
                            <div style={{ color:"#9ca3af" }}>{fmtDateCourt(s.date)} · {s.heure} · {s.type==="online"?"🌐":"🏢"} {s.salle}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ════════ PLANNING ════════ */}
            {activeTab==="planning" && (
              <div>
                <div style={tabHeader}>
                  <div><h2 style={tabTitle}>Planning des Séances</h2><p style={tabSubtitle}>{seances.length} séances · {stats.seancesAV} à venir</p></div>
                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                    <button
                      disabled={!peut("remplacements","create")}
                      title={permBtnTitle("Signaler une absence",peut("remplacements","create"))}
                      onClick={()=>ouvrirModalAbsence()}
                      style={permBtnStyle({ padding:'8px 16px', borderRadius:8, border:'1.5px solid #EF4444', background:'#FEF2F2', color:'#DC2626', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 },peut("remplacements","create"))}
                    >{peut("remplacements","create")?"🚨":"🔒"} Signaler une absence</button>
                    <button onClick={()=>setShowRecurringModal(true)} style={{ ...btnSecondary, marginRight:8 }}>🔄 Séances récurrentes</button>
                  <button onClick={()=>setSemaine(s=>Math.max(0,s-1))} style={btnSecondary} disabled={semaine===0}>← Précédent</button>
                    <span style={{ padding:"7px 14px", background:BET_LIGHT, color:BET, borderRadius:6, fontWeight:600, fontSize:12 }}>
                      Semaine {semaine===0?"courante":`+${semaine}`}
                    </span>
                    <button onClick={()=>setSemaine(s=>s+1)} style={btnSecondary}>Suivant →</button>
                  </div>
                </div>
                {/* Calendrier mini */}
                {(() => {
                  const todayStr = new Date().toISOString().split("T")[0];
                  const todayD = new Date(); const todayDow = todayD.getDay();
                  const weekStart = new Date(todayD);
                  weekStart.setDate(todayD.getDate() + (todayDow === 0 ? -6 : 1 - todayDow));
                  weekStart.setHours(0,0,0,0);
                  return (
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:6, marginBottom:24 }}>
                      {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map((j,i)=>{
                        const d = new Date(weekStart); d.setDate(weekStart.getDate() + semaine*7 + i);
                        const ds = d.toISOString().split("T")[0];
                        const sj = seances.filter(s => s.date === ds);
                        const lj = liveSessions.filter(s => s.date === ds);
                        const isToday = ds === todayStr;
                        return (
                          <div key={j} style={{ minHeight:80, padding:7, borderRadius:8, background:isToday?BET_LIGHT:"#f8fafc", border:`1px solid ${isToday?BET:"#e5e7eb"}` }}>
                            <div style={{ fontSize:11, fontWeight:700, color:isToday?BET:"#9ca3af", marginBottom:4 }}>{j} {d.getDate()}</div>
                            {sj.map(s=>(
                              <div key={s.id} style={{ fontSize:9, padding:"3px 5px", borderRadius:4, background:s.type==="online"?"#ede9fe":"#dcfce7", color:s.type==="online"?"#5b21b6":"#166534", marginBottom:2, lineHeight:1.3, cursor:"pointer" }}
                                onClick={()=>{ setSelectedSeance(s); setShowSeanceModal(true); }}>
                                {s.heure} {s.titre.slice(0,16)}
                              </div>
                            ))}
                            {lj.map(s=>(
                              <div key={s.id} style={{ fontSize:9, padding:"3px 5px", borderRadius:4, background: s.plateforme==="presentiel"?"#d1fae5":"#dbeafe", color: s.plateforme==="presentiel"?"#065f46":"#1d4ed8", marginBottom:2, lineHeight:1.3, cursor:"pointer", display:"flex", alignItems:"center", gap:2 }}
                                onClick={()=>{ setSessionDetailData(s); setShowSessionDetailModal(true); }}>
                                <span>{s.plateforme==="presentiel"?"🏢":"📡"}</span>
                                {s.heure} {s.titre.slice(0,14)}
                              </div>
                            ))}
                            {!sj.length && !lj.length && <div style={{ fontSize:10, color:"#d1d5db" }}>-</div>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {/* ── Séances non effectuées ──────────────────────────────────────
                    Volontairement hors de la navigation par semaine : une séance manquée
                    date d'une semaine passée, et personne ne remonte le calendrier pour
                    la retrouver. Elle reste visible jusqu'à ce qu'elle soit reposée. */}
                {(() => {
                  const manquees = liveSessions.filter(estSessionNonEffectuee)
                    .sort((a,b) => (b.date+(b.heure||"")).localeCompare(a.date+(a.heure||"")));
                  if (!manquees.length) return null;
                  return (
                    <div style={{ marginBottom:20, background:"#fffbeb", border:"1.5px solid #fcd34d", borderRadius:12, padding:"14px 16px" }}>
                      <div style={{ fontSize:13, fontWeight:800, color:"#92400e", marginBottom:4 }}>
                        ⚠️ {manquees.length} séance{manquees.length>1?"s":""} non effectuée{manquees.length>1?"s":""}
                      </div>
                      <div style={{ fontSize:11.5, color:"#b45309", marginBottom:10 }}>
                        Le créneau est passé et la salle n'a jamais été ouverte. Reposez la séance à une date ultérieure - apprenants et suivi pédagogique seront prévenus.
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                        {manquees.map(s => {
                          const grp = groupes.find(g => g.id === s.groupe_id);
                          return (
                            <div key={s.id} style={{ display:"flex", alignItems:"center", gap:10, background:"#fff", border:"1px solid #fde68a", borderRadius:9, padding:"9px 12px", flexWrap:"wrap" }}>
                              <span style={{ fontSize:11.5, color:"#92400e", fontWeight:700, whiteSpace:"nowrap", minWidth:96 }}>
                                📅 {fmtDateCourt(s.date)}{s.heure ? ` · ${String(s.heure).slice(0,5)}` : ""}
                              </span>
                              <span style={{ flex:"1 1 160px", fontSize:13, fontWeight:700, color:"#0f172a" }}>{s.titre}</span>
                              {grp && <span style={{ fontSize:11.5, color:"#6b7280", whiteSpace:"nowrap" }}>👥 {grp.nom}</span>}
                              <button onClick={() => ouvrirReprogrammation(s)}
                                style={{ padding:"7px 14px", borderRadius:8, border:"none", background:"#b45309", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
                                📅 Reprogrammer
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Sessions live de la semaine */}
                {planningSeam.filter(s => s._live).length > 0 && (
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontSize:13, fontWeight:800, color:"#1d4ed8", marginBottom:10 }}>📡 Sessions live cette semaine</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {planningSeam.filter(s => s._live).map(s => {
                        const realSession = liveSessions.find(ls => ls.id === s._liveId);
                        const grp = groupes.find(g => g.id === realSession?.groupe_id);
                        const now = new Date();
                        const debut = new Date(`${s.date}T${s.heure}`);
                        const disponible = now >= new Date(debut.getTime() - MS_OUVERTURE_SALLE);
                        const isPresent = s.plateforme === "presentiel";
                        return (
                          <div key={s.id} style={{ background:disponible?"#F0FDF4":"#f8fafc", borderRadius:12, border:`1.5px solid ${disponible?"#6ee7b7":"#e5e7eb"}`, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                            <div style={{ flex:1 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                                <span style={{ padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:700, background: isPresent?"#d1fae5":"#dbeafe", color: isPresent?"#065f46":"#1d4ed8" }}>
                                  {isPresent?"🏢 Présentiel":"📡 Live"}
                                </span>
                                <span style={{ fontSize:14, fontWeight:700, color:"#0f172a" }}>{s.titre}</span>
                                {s.statut === "terminee" && <span style={{ padding:"2px 8px", borderRadius:10, background:"#d1fae5", color:"#065f46", fontSize:10, fontWeight:800 }}>🔒 Clôturée</span>}
                                {disponible && s.statut !== "terminee" && <span style={{ padding:"2px 8px", borderRadius:10, background:"#d1fae5", color:"#065f46", fontSize:10, fontWeight:800 }}>✅ Disponible</span>}
                              </div>
                              <div style={{ fontSize:12, color:"#6b7280", display:"flex", gap:12, flexWrap:"wrap" }}>
                                <span>📅 {fmtDate(s.date)}</span>
                                <span>⏰ {s.heure}{realSession?.heure_fin?` – ${realSession.heure_fin}`:""}</span>
                                {grp && <span>👥 {grp.nom}</span>}
                                {!isPresent && realSession?.lien && <span style={{ maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>🔗 {realSession.lien}</span>}
                              </div>
                            </div>
                            <button
                              onClick={() => { if (realSession) { setSessionDetailData(realSession); setShowSessionDetailModal(true); } }}
                              style={{ padding:"8px 18px", borderRadius:9, border:"none", fontSize:12, fontWeight:700, cursor:"pointer", background:"#f1f5f9", color:"#374151", whiteSpace:"nowrap" }}>
                              🔍 Voir détails
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Filtre + liste */}
                <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
                  {["Tous","planifie","confirme","termine","annule"].map(s=>(
                    <button key={s} onClick={()=>setFiltSeanceSt(s)} style={{
                      padding:"4px 12px", borderRadius:20, border:"1px solid", fontSize:12, cursor:"pointer",
                      background: filtSeanceSt===s?(STATUT_SEANCE[s]?.bg||BET_LIGHT):"#fff",
                      color: filtSeanceSt===s?(STATUT_SEANCE[s]?.c||BET):"#6b7280",
                      borderColor: filtSeanceSt===s?(STATUT_SEANCE[s]?.bg||BET):"#e5e7eb",
                      fontWeight: filtSeanceSt===s?700:400,
                    }}>{s==="Tous"?"Toutes":STATUT_SEANCE[s]?.label}</button>
                  ))}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {seancesFiltres.map(s=>{
                    const c = cours.find(x=>x.id===s.coursId);
                    const sm = STATUT_SEANCE[s.statut]||STATUT_SEANCE.planifie;
                    const tauxP = s.nbPresents!==null ? Math.round((s.nbPresents/s.nbInscrits)*100) : null;
                    const deplie = seancesDepliees.has(s.id);
                    const toggleDeplie = () => setSeancesDepliees(prev => {
                      const n = new Set(prev);
                      n.has(s.id) ? n.delete(s.id) : n.add(s.id);
                      return n;
                    });
                    const apprenants = etudiants.filter(e=>e.coursIds.includes(s.coursId));
                    const evalLiee = evaluations?.find(ev=>ev.coursId===s.coursId&&ev.date===s.date);
                    return (
                      <div key={s.id} style={{ borderRadius:12, border:`1.5px solid ${deplie?BET:"#e5e7eb"}`, background:"#fff", overflow:"hidden", transition:"border-color .15s" }}>
                        {/* ── LIGNE PRINCIPALE (clic = déplier) ── */}
                        <div onClick={toggleDeplie} style={{ display:"flex", gap:14, padding:"14px 16px", cursor:"pointer", alignItems:"flex-start" }}>
                          {/* Icône type */}
                          <div style={{ width:48, textAlign:"center", padding:"8px 10px", borderRadius:8, background:s.type==="online"?"#ede9fe":"#dcfce7", flexShrink:0 }}>
                            <div style={{ fontSize:18 }}>{s.type==="online"?"🌐":"🏢"}</div>
                            <div style={{ fontSize:9, fontWeight:700, color:s.type==="online"?"#5b21b6":"#166534" }}>{s.type==="online"?"Online":"Présentiel"}</div>
                          </div>
                          {/* Infos principales */}
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>{s.titre}</div>
                            <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>
                              {c?.emoji} {c?.titre} · 📅 {fmtDateCourt(s.date)} · ⏱ {s.heure} · ⌛ {s.duree} · 📍 {s.salle}
                            </div>
                            <div style={{ fontSize:12, color:"#6b7280" }}>👥 {s.nbInscrits} inscrits{tauxP!==null?` · ✅ ${s.nbPresents}/${s.nbInscrits} présents (${tauxP}%)`:""}</div>
                            {tauxP!==null&&(<div style={{ marginTop:6, maxWidth:200 }}><Bar value={tauxP} color={tauxP>=80?"#22c55e":"#f59e0b"} h={5}/></div>)}
                          </div>
                          {/* Statut + chevron */}
                          <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end", flexShrink:0 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <span style={{ padding:"3px 10px", borderRadius:10, fontSize:11, fontWeight:700, background:sm.bg, color:sm.c }}>{sm.label}</span>
                              <span style={{ fontSize:16, color:deplie?BET:"#9ca3af", transition:"transform .2s", display:"inline-block", transform:deplie?"rotate(180deg)":"rotate(0deg)" }}>⌄</span>
                            </div>
                            {/* Les boutons « 📋 Présences » et « ✅ Confirmer » ont été retirés :
                                ils ne faisaient qu'un setSeances local, sans le moindre appel
                                serveur, et écrivaient des statuts inexistants en base
                                (« confirme », « termine »). Un coach qui pointait ses présences
                                ici était convaincu que c'était enregistré - rien ne l'était.
                                La saisie réelle se fait à la CLÔTURE de la salle, qui envoie
                                les présences et passe la séance en « realisee ». Le planning
                                sert à consulter, pas à décider. */}
                          </div>
                        </div>

                        {/* ── PANNEAU DÉPLIABLE ── */}
                        {deplie && (
                          <div style={{ borderTop:`1.5px solid ${BET}20`, background:"#f8fafc", padding:"16px 20px", display:"flex", flexDirection:"column", gap:16 }}>

                            {/* Infos détaillées */}
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10 }}>
                              {[
                                { icon:"📅", label:"Date", val:fmtDate(s.date) },
                                { icon:"⏰", label:"Heure de début", val:s.heure },
                                { icon:"⌛", label:"Durée", val:s.duree },
                                { icon:"📍", label:"Salle / Plateforme", val:s.salle },
                                { icon:"📚", label:"Cours", val:c?.titre||"-" },
                                { icon:"👥", label:"Inscrits", val:`${s.nbInscrits} apprenants` },
                              ].map(info=>(
                                <div key={info.label} style={{ background:"#fff", borderRadius:8, padding:"10px 12px", border:"1px solid #e5e7eb" }}>
                                  <div style={{ fontSize:10, color:"#9ca3af", fontWeight:600, marginBottom:3 }}>{info.icon} {info.label}</div>
                                  <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{info.val}</div>
                                </div>
                              ))}
                            </div>

                            {/* Évaluation liée */}
                            {evalLiee && (
                              <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, padding:"10px 14px", display:"flex", alignItems:"center", gap:12 }}>
                                <span style={{ fontSize:20 }}>📝</span>
                                <div>
                                  <div style={{ fontSize:12, fontWeight:700, color:"#1e40af" }}>Évaluation liée : {evalLiee.titre}</div>
                                  {evalLiee.moyenneClasse!=null && (
                                    <div style={{ fontSize:11, color:"#3b82f6", marginTop:2 }}>
                                      Moyenne : {evalLiee.moyenneClasse}/20 · Réussite : {evalLiee.tauxReussite}%
                                    </div>
                                  )}
                                </div>
                                <span style={{ marginLeft:"auto", padding:"2px 8px", borderRadius:8, fontSize:11, fontWeight:700, background:evalLiee.statut==="corrige"?"#dcfce7":"#fef9c3", color:evalLiee.statut==="corrige"?"#166534":"#92400e" }}>
                                  {evalLiee.statut==="corrige"?"✅ Corrigée":"🕐 À venir"}
                                </span>
                              </div>
                            )}

                            {/* Présences résumé (si terminée) */}
                            {tauxP!==null && (
                              <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"10px 14px" }}>
                                <div style={{ fontSize:12, fontWeight:700, color:"#065f46", marginBottom:8 }}>✅ Résultat des présences</div>
                                <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                                  <div style={{ flex:1 }}><Bar value={tauxP} color={tauxP>=80?"#22c55e":"#f59e0b"} h={8}/></div>
                                  <div style={{ fontSize:18, fontWeight:900, color:tauxP>=80?"#22c55e":"#f59e0b", minWidth:50 }}>{tauxP}%</div>
                                  <div style={{ fontSize:12, color:"#374151" }}>{s.nbPresents}/{s.nbInscrits} présents</div>
                                </div>
                              </div>
                            )}

                            {/* Liste apprenants du cours */}
                            <div>
                              <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:8 }}>👥 Apprenants inscrits à ce cours ({apprenants.length})</div>
                              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                                {apprenants.map(a=>{
                                  const ast = STATUT_ETUD[a.statut]||STATUT_ETUD.actif;
                                  return (
                                    <div key={a.id} style={{ display:"flex", alignItems:"center", gap:7, padding:"5px 10px", borderRadius:20, background:"#fff", border:"1px solid #e5e7eb", fontSize:12 }}>
                                      <div style={{ width:22, height:22, borderRadius:"50%", background:BET_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:BET, flexShrink:0 }}>
                                        {a.nom.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
                                      </div>
                                      <span style={{ fontWeight:600, color:"#0f172a" }}>{a.nom}</span>
                                      <span style={{ padding:"1px 6px", borderRadius:8, fontSize:10, fontWeight:700, background:ast.bg, color:ast.c }}>{ast.label}</span>
                                    </div>
                                  );
                                })}
                                {apprenants.length===0&&<span style={{ fontSize:12, color:"#9ca3af" }}>Aucun apprenant lié</span>}
                              </div>
                            </div>

                            {/* Actions détaillées */}
                            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", paddingTop:4, borderTop:"1px solid #e5e7eb" }}>
                              <button onClick={()=>{setSelectedSeance(s);setShowSeanceModal(true);}} style={btnSecondary}>🔍 Voir le détail complet</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {demandesAbsence.length > 0 && (
                  <div style={{ marginTop:28, display:'flex', justifyContent:'flex-end' }}>
                    <button onClick={()=>setActiveTab('demandes')} style={{ ...btnGhost, display:'flex', alignItems:'center', gap:6 }}>
                      📨 Voir mes demandes d'absence ({demandesAbsence.length}) →
                    </button>
                  </div>
                )}

              </div>
            )}

            {/* ════════ MES DEMANDES ════════ */}
            {activeTab==="demandes" && (() => {
              const demandesFiltrees = demandesAbsence.filter(d => filtreDemandesStatut==='tous' || d.statut===filtreDemandesStatut);
              const totalPagesDem = Math.max(1, Math.ceil(demandesFiltrees.length / DEMANDES_PAR_PAGE));
              const pageClamp = Math.min(pageDemandes, totalPagesDem);
              const demandesPage = demandesFiltrees.slice((pageClamp-1)*DEMANDES_PAR_PAGE, pageClamp*DEMANDES_PAR_PAGE);
              return (
                <div>
                  <div style={tabHeader}>
                    <div><h2 style={tabTitle}>Mes demandes</h2><p style={tabSubtitle}>{demandesAbsence.length} demande{demandesAbsence.length>1?'s':''} d'absence / remplacement</p></div>
                    <button
                      disabled={!peut("remplacements","create")}
                      title={permBtnTitle("Signaler une absence",peut("remplacements","create"))}
                      onClick={()=>ouvrirModalAbsence()}
                      style={permBtnStyle({ padding:'8px 16px', borderRadius:8, border:'1.5px solid #EF4444', background:'#FEF2F2', color:'#DC2626', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 },peut("remplacements","create"))}
                    >{peut("remplacements","create")?"🚨":"🔒"} Signaler une absence</button>
                  </div>

                  <RangeePastilles accent={BET} valeur={filtreDemandesStatut} style={{ marginBottom:14 }}
                    onChange={(v)=>{ setFiltreDemandesStatut(v); setPageDemandes(1); }}
                    options={['tous','a_pourvoir','en_cours','termine','refuse'].map(k=>(
                      { v:k, l: k==='tous' ? 'Toutes' : STATUT_DEMANDE[k]?.label }
                    ))}
                    compte={(v)=> v==='tous' ? demandesAbsence.length : demandesAbsence.filter(d=>d.statut===v).length} />

                  {demandesLoading ? (
                    <div style={{ textAlign:'center', padding:40, color:'#9ca3af' }}>Chargement…</div>
                  ) : demandesPage.length===0 ? (
                    <div style={{ textAlign:'center', padding:40, color:'#9ca3af' }}>Aucune demande{filtreDemandesStatut!=='tous'?' avec ce statut':''}.</div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {demandesPage.map(d => {
                        const st = STATUT_DEMANDE[d.statut] || STATUT_DEMANDE.a_pourvoir;
                        return (
                          <div key={d.id} onClick={()=>ouvrirDetailDemande(d)} style={{ background:'#fff', border:'1.5px solid #e5e7eb', borderRadius:12, padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10, cursor:'pointer' }}>
                            <div>
                              <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', marginBottom:3 }}>
                                {d.motif} · {fmtDate(d.date_debut)}{d.date_debut !== d.date_fin ? ` → ${fmtDate(d.date_fin)}` : ''}
                              </div>
                              <div style={{ fontSize:11, color:'#64748b' }}>
                                👥 {d.groupe_nom || '-'} · {d.nb_sessions} session{d.nb_sessions>1?'s':''} concernée{d.nb_sessions>1?'s':''}
                                {d.remplacant_nom && <span> · Remplaçant : {d.remplacant_nom}</span>}
                                {d.message && <span style={{ fontStyle:'italic' }}> · "{d.message}"</span>}
                              </div>
                            </div>
                            <span style={{ padding:'3px 10px', borderRadius:10, background:st.bg, color:st.c, fontSize:11, fontWeight:800 }}>{st.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {totalPagesDem > 1 && (
                    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:10, marginTop:18 }}>
                      <button onClick={()=>setPageDemandes(p=>Math.max(1,p-1))} disabled={pageClamp===1} style={btnSecondary}>← Précédent</button>
                      <span style={{ fontSize:12, color:'#6b7280' }}>Page {pageClamp}/{totalPagesDem}</span>
                      <button onClick={()=>setPageDemandes(p=>Math.min(totalPagesDem,p+1))} disabled={pageClamp===totalPagesDem} style={btnSecondary}>Suivant →</button>
                    </div>
                  )}

                  {demandeDetail && (
                    <div onClick={()=>setDemandeDetail(null)} style={{ position:'fixed', inset:0, background:'rgba(15,23,42,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}>
                      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:16, padding:24, width:'90vw', maxWidth:'90vw', height:'90vh', overflowY:'auto' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                          <div style={{ fontSize:16, fontWeight:800, color:'#0f172a' }}>Détail de la demande</div>
                          <button onClick={()=>setDemandeDetail(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#64748b', lineHeight:1 }}>×</button>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                          <span style={{ alignSelf:'flex-start', padding:'4px 12px', borderRadius:10, fontSize:12, fontWeight:800, background:(STATUT_DEMANDE[demandeDetail.statut]||STATUT_DEMANDE.a_pourvoir).bg, color:(STATUT_DEMANDE[demandeDetail.statut]||STATUT_DEMANDE.a_pourvoir).c }}>
                            {(STATUT_DEMANDE[demandeDetail.statut]||STATUT_DEMANDE.a_pourvoir).label}
                          </span>
                          {[
                            { l:'Motif', v:demandeDetail.motif },
                            { l:'Période', v:`${fmtDate(demandeDetail.date_debut)}${demandeDetail.date_debut!==demandeDetail.date_fin?` → ${fmtDate(demandeDetail.date_fin)}`:''}` },
                            { l:'Groupe', v:demandeDetail.groupe_nom || '-' },
                            { l:'Séances concernées', v:`${demandeDetail.nb_sessions}` },
                            { l:'Message', v:demandeDetail.message || '-' },
                            { l:'Remplaçant', v:demandeDetail.remplacant_nom || 'Non assigné' },
                            ...(demandeDetail.statut==='refuse' ? [{ l:'Motif du refus', v:demandeDetail.motif_refus || '-' }] : []),
                            { l:'Envoyée le', v:fmtDate(demandeDetail.created_at, { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }) },
                          ].map(f => (
                            <div key={f.l}>
                              <div style={{ fontSize:10, color:'#9ca3af', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.03em', marginBottom:2 }}>{f.l}</div>
                              <div style={{ fontSize:13, color:'#0f172a', fontWeight:600 }}>{f.v}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ════════ ÉTUDIANTS ════════ */}
            {activeTab==="etudiants" && (() => {
              const groupesStatutFiltresEtud = groupes.filter(g =>
                filtreGroupeStatutEtud === "tous" ? true :
                filtreGroupeStatutEtud === "cloture" ? g.statut === "cloture" :
                g.statut !== "cloture"
              );
              const groupesOptionsEtud = rechercheClasseEtud.trim()
                ? groupesStatutFiltresEtud.filter(g => (g.nom||"").toLowerCase().includes(rechercheClasseEtud.trim().toLowerCase()))
                : groupesStatutFiltresEtud;
              // Si la classe sélectionnée sort du filtre statut courant (ex: on vient de la clôturer), on revient à "toutes"
              if (filtreGroupeTab && !groupesStatutFiltresEtud.some(g => g.id === filtreGroupeTab)) {
                setTimeout(() => setFiltreGroupeTab(null), 0);
              }
              return (
              <div>
                {/* Sélecteur de classe */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>Classe</div>
                  <RangeePastilles accent={BET} valeur={filtreGroupeStatutEtud} style={{ marginBottom:8 }}
                    onChange={(v)=>{ setFiltreGroupeStatutEtud(v); setFiltreGroupeTab(null); }}
                    options={[{ v:"actif", l:"🟢 Actives" }, { v:"cloture", l:"🔒 Terminées" }, { v:"tous", l:"Toutes" }]} />
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                    <input type="text" placeholder="🔍 Filtrer les classes…" value={rechercheClasseEtud} onChange={e=>setRechercheClasseEtud(e.target.value)}
                      style={{ ...inputSt, marginBottom:0, width:180 }} />
                    <select value={filtreGroupeTab||""} onChange={e=>setFiltreGroupeTab(e.target.value||null)}
                      style={{ ...inputSt, marginBottom:0, width:"auto", minWidth:220 }}>
                      <option value="">📚 Toutes les classes ({groupesOptionsEtud.length})</option>
                      {groupesOptionsEtud.map(g => (
                        <option key={g.id} value={g.id}>{g.nom}{g.niveau?` · ${g.niveau}`:""}{g.statut==="cloture"?" · 🔒 Terminée":""}</option>
                      ))}
                    </select>
                    {groupesLoading && <span style={{ fontSize:12, color:"#9ca3af" }}>Chargement…</span>}
                  </div>
                </div>
                <div style={tabHeader}>
                  <div>
                    <h2 style={tabTitle}>Mes Apprenants</h2>
                    <p style={tabSubtitle}>
                      {filtreGroupeTab ? (groupes.find(g=>g.id===filtreGroupeTab)?.nom || "Classe sélectionnée") : `${groupes.length} classe${groupes.length!==1?"s":""}`}
                      {" · "}{etudsFiltres.length} apprenant{etudsFiltres.length!==1?"s":""} affichés
                    </p>
                  </div>
                  {/* L'ARCHIVE. Sa place est ici, à côté des apprenants d'aujourd'hui :
                      la liste ci-dessous montre les inscrits du jour, l'archive montre
                      tous ceux de l'année - y compris ceux qui sont partis, et pourquoi. */}
                  <button onClick={() => setShowArchiveApprenants(true)}
                    style={{ padding:"10px 16px", border:"1px solid #e5e7eb", borderRadius:10, background:"#fff",
                      fontWeight:800, fontSize:13, color:"#0f172a", cursor:"pointer", fontFamily:"inherit",
                      display:"inline-flex", alignItems:"center", gap:8, flexShrink:0 }}>
                    📒 Archive de mes apprenants
                  </button>
                </div>
                <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
                  <input type="text" placeholder="🔍 Nom ou email…" value={searchEtud} onChange={e=>setSearchEtud(e.target.value)} style={{ ...inputSt, marginBottom:0, width:200 }}/>
                  <select value={filtEtudNiveau} onChange={e=>setFiltEtudNiveau(e.target.value)} style={{ ...inputSt, marginBottom:0, width:"auto" }}>
                    <option value="Tous">Tous niveaux</option>
                    {Object.keys(NIVEAU_META).map(l=><option key={l}>{l}</option>)}
                  </select>
                  {(filtEtudNiveau!=="Tous"||searchEtud)&&(
                    <button onClick={()=>{setFiltEtudNiveau("Tous");setSearchEtud("");}} style={{ ...btnSecondary, padding:"7px 10px", fontSize:11 }}>✕ Reset</button>
                  )}
                  <button disabled={!peut("devoirs_evaluations","create")} title={permBtnTitle("Saisir une note",peut("devoirs_evaluations","create"))} onClick={()=>setShowNoteModal(true)} style={permBtnStyle({ ...btnPrimary, marginLeft:"auto" },peut("devoirs_evaluations","create"))}>{peut("devoirs_evaluations","create")?"+":"🔒"} Saisir une note</button>
                </div>
                <div style={{ overflowX:"auto" }}>
                  {etudiantsLoading && (
                    <div style={{ textAlign:"center", padding:"32px 0", color:"#9ca3af", fontSize:13 }}>Chargement des apprenants…</div>
                  )}
                  {!etudiantsLoading && etudiants.length === 0 && (
                    <div style={{ textAlign:"center", padding:"48px 0", color:"#9ca3af", fontSize:14 }}>
                      <div style={{ fontSize:32, marginBottom:8 }}>👥</div>
                      <div>Aucun apprenant assigné à vos classes pour l'instant.</div>
                    </div>
                  )}
                  {!etudiantsLoading && etudiants.length > 0 && (() => {
                    const totalPagesEtud = Math.max(1, Math.ceil(etudsFiltres.length / ETUD_PER_PAGE));
                    const pageEtud = Math.min(etudPage, totalPagesEtud);
                    const etudsPaged = etudsFiltres.slice((pageEtud - 1) * ETUD_PER_PAGE, pageEtud * ETUD_PER_PAGE);
                    return (
                  <>
                  <table style={tableStyle}><thead><tr>
                    <th style={th}>Apprenant</th><th style={th}>Classe</th><th style={th}>Niveau</th><th style={{ ...th, minWidth:130 }}>Progression</th>
                    <th style={{ ...th, minWidth:130 }}>Assiduité</th><th style={th}>Dern. note</th><th style={th}>Absences</th><th style={th}>Statut</th>
                  </tr></thead><tbody>
                    {etudsPaged.map(e=>(
                      <tr key={e.id}
                        onClick={() => openFicheApprenant(e, groupes.find(g => g.id === e.groupe_id) || { id: e.groupe_id, nom: e.groupe_nom })}
                        style={{ borderTop:"1px solid #f1f5f9", background:e.assiduite<75||e.progression<40?"#fff9f0":"transparent", cursor:"pointer", transition:"background .12s" }}
                        onMouseEnter={ev => ev.currentTarget.style.background = "#f0f9ff"}
                        onMouseLeave={ev => ev.currentTarget.style.background = e.assiduite<75||e.progression<40?"#fff9f0":"transparent"}>
                        <td style={td}>
                          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                            <div style={{ width:34, height:34, borderRadius:"50%", background: e.acces_bloque ? "#fee2e2" : BET_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:11, color: e.acces_bloque ? "#dc2626" : BET, flexShrink:0, overflow:"hidden" }}>
                              {e.avatar_url ? <img src={e.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : e.nom.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight:600, fontSize:13, display:"flex", alignItems:"center", gap:6 }}>
                                {e.nom}
                                {e.acces_bloque && <span style={{ fontSize:9, background:"#dc2626", color:"#fff", borderRadius:99, padding:"1px 7px", fontWeight:700, flexShrink:0 }}>🔒 SUSPENDU</span>}
                              </div>
                              <div style={{ fontSize:11, color:"#9ca3af" }}>{e.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ ...td, fontSize:12, color:"#6b7280" }}>{e.groupe_nom}</td>
                        <td style={td}><NivBadge n={e.niveau}/></td>
                        <td style={{ ...td, minWidth:130 }}>
                          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                            <div style={{ flex:1 }}><Bar value={e.progression} color={e.progression>=60?BET:"#f59e0b"}/></div>
                            <span style={{ fontSize:12, fontWeight:700, color:e.progression>=60?BET:"#f59e0b", minWidth:32 }}>{e.progression}%</span>
                          </div>
                        </td>
                        <td style={{ ...td, minWidth:130 }}>
                          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                            <div style={{ flex:1 }}><Bar value={e.assiduite} color={e.assiduite>=85?"#22c55e":e.assiduite>=70?"#f59e0b":"#ef4444"}/></div>
                            <span style={{ fontSize:12, fontWeight:700, color:e.assiduite>=85?"#22c55e":e.assiduite>=70?"#f59e0b":"#ef4444", minWidth:32 }}>{e.assiduite}%</span>
                          </div>
                        </td>
                        <td style={{ ...td, fontWeight:800, color:e.dernNote>=10?"#22c55e":"#ef4444", fontSize:15 }}>{e.dernNote}/20</td>
                        <td style={{ ...td, fontWeight:700, color:e.absent>5?"#ef4444":e.absent>2?"#f59e0b":"#374151" }}>{e.absent}</td>
                        <td style={td}><Sbadge s={e.statut}/></td>
                      </tr>
                    ))}
                  </tbody></table>

                  {/* ── Pagination ── */}
                  {totalPagesEtud > 1 && (
                    <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:6, marginTop:16 }}>
                      <button onClick={() => setEtudPage(1)} disabled={pageEtud===1}
                        style={{ padding:"6px 10px", border:"1.5px solid #e5e7eb", borderRadius:6, fontSize:12, fontWeight:600, cursor:pageEtud===1?"not-allowed":"pointer", background:"#fff", color:pageEtud===1?"#d1d5db":"#374151", opacity:pageEtud===1?0.5:1 }}>
                        «
                      </button>
                      <button onClick={() => setEtudPage(p => Math.max(1, p-1))} disabled={pageEtud===1}
                        style={{ padding:"6px 12px", border:"1.5px solid #e5e7eb", borderRadius:6, fontSize:12, fontWeight:600, cursor:pageEtud===1?"not-allowed":"pointer", background:"#fff", color:pageEtud===1?"#d1d5db":"#374151", opacity:pageEtud===1?0.5:1 }}>
                        ‹ Préc.
                      </button>
                      {Array.from({ length: totalPagesEtud }, (_, i) => i+1).filter(p => p===1 || p===totalPagesEtud || Math.abs(p-pageEtud)<=2).map((p, i, arr) => (
                        <React.Fragment key={p}>
                          {i > 0 && arr[i-1] !== p-1 && <span style={{ color:"#9ca3af" }}>…</span>}
                          <button onClick={() => setEtudPage(p)}
                            style={{ padding:"6px 12px", border:`1.5px solid ${p===pageEtud?BET:"#e5e7eb"}`, borderRadius:6, fontSize:12, fontWeight:p===pageEtud?800:600, cursor:"pointer", background:p===pageEtud?BET:"#fff", color:p===pageEtud?"#fff":"#374151" }}>
                            {p}
                          </button>
                        </React.Fragment>
                      ))}
                      <button onClick={() => setEtudPage(p => Math.min(totalPagesEtud, p+1))} disabled={pageEtud===totalPagesEtud}
                        style={{ padding:"6px 12px", border:"1.5px solid #e5e7eb", borderRadius:6, fontSize:12, fontWeight:600, cursor:pageEtud===totalPagesEtud?"not-allowed":"pointer", background:"#fff", color:pageEtud===totalPagesEtud?"#d1d5db":"#374151", opacity:pageEtud===totalPagesEtud?0.5:1 }}>
                        Suiv. ›
                      </button>
                      <button onClick={() => setEtudPage(totalPagesEtud)} disabled={pageEtud===totalPagesEtud}
                        style={{ padding:"6px 10px", border:"1.5px solid #e5e7eb", borderRadius:6, fontSize:12, fontWeight:600, cursor:pageEtud===totalPagesEtud?"not-allowed":"pointer", background:"#fff", color:pageEtud===totalPagesEtud?"#d1d5db":"#374151", opacity:pageEtud===totalPagesEtud?0.5:1 }}>
                        »
                      </button>
                      <span style={{ fontSize:12, color:"#9ca3af", marginLeft:8 }}>
                        Page {pageEtud}/{totalPagesEtud} · {etudsFiltres.length} apprenant{etudsFiltres.length!==1?"s":""}
                      </span>
                    </div>
                  )}
                  </>
                    );
                  })()}
                </div>
              </div>
              );
            })()}

            {/* ════════ PRÉSENCES ════════ */}
            {activeTab==="presences" && (() => {
              const groupesStatutFiltresPres = groupes.filter(g =>
                filtreGroupeStatutPres === "tous" ? true :
                filtreGroupeStatutPres === "cloture" ? g.statut === "cloture" :
                g.statut !== "cloture"
              );
              const groupesOptionsPres = rechercheClassePres.trim()
                ? groupesStatutFiltresPres.filter(g => (g.nom||"").toLowerCase().includes(rechercheClassePres.trim().toLowerCase()))
                : groupesStatutFiltresPres;
              return (
              <div>
                {/* Sélecteur de classe */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>Classe</div>
                  <RangeePastilles accent={BET} valeur={filtreGroupeStatutPres} style={{ marginBottom:8 }}
                    onChange={(v)=>{ setFiltreGroupeStatutPres(v) }}
                    options={[{ v:"actif", l:"🟢 Actives" }, { v:"cloture", l:"🔒 Terminées" }, { v:"tous", l:"Toutes" }]} />
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                    <input type="text" placeholder="🔍 Filtrer les classes…" value={rechercheClassePres} onChange={e=>setRechercheClassePres(e.target.value)}
                      style={{ ...inputSt, marginBottom:0, width:180 }} />
                    <select value={filtreGroupeTab||""} onChange={e=>{
                        const g = groupesOptionsPres.find(x => x.id === e.target.value);
                        if (g) selectGroupeForPresences(g);
                      }}
                      style={{ ...inputSt, marginBottom:0, width:"auto", minWidth:220 }}>
                      <option value="">- Sélectionner une classe -</option>
                      {groupesOptionsPres.map(g => (
                        <option key={g.id} value={g.id}>{g.nom}{g.niveau?` · ${g.niveau}`:""}{g.statut==="cloture"?" · 🔒 Terminée":""}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {!filtreGroupeTab ? (
                  <div style={{ textAlign:"center", padding:"60px 20px", color:"#9ca3af", background:"#f8fafc", borderRadius:12 }}>
                    <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
                    <div style={{ fontWeight:600, fontSize:15 }}>Sélectionnez une classe ci-dessus</div>
                    <div style={{ fontSize:13, marginTop:6 }}>pour saisir ou consulter les feuilles de présence</div>
                  </div>
                ) : (
                  <div>
                    <div style={tabHeader}>
                      <div><h2 style={tabTitle}>Présences</h2><p style={tabSubtitle}>
                        {groupes.find(g=>g.id===filtreGroupeTab)?.nom || "-"} · Historique et saisie des feuilles de présence
                      </p></div>
                    </div>

                    {/* ── KPIs Présences ── */}
                    {(() => {
                      const parDate = {};
                      presenceHistory.forEach(p => { if (!parDate[p.date_seance]) parDate[p.date_seance]=[]; parDate[p.date_seance].push(p); });
                      const dates = Object.keys(parDate);
                      const nbSeances = dates.length;
                      const totalEnr  = presenceHistory.length;
                      const totalPres = presenceHistory.filter(p=>p.statut==="present").length;
                      const totalAbs  = presenceHistory.filter(p=>p.statut==="absent").length;
                      const totalRet  = presenceHistory.filter(p=>p.statut==="retard").length;
                      const totalExc  = presenceHistory.filter(p=>p.statut==="excuse").length;
                      const tauxMoyen = totalEnr ? Math.round(totalPres/totalEnr*100) : 0;
                      const tauxParDate = dates.map(d => {
                        const rows = parDate[d];
                        const pres = rows.filter(r=>r.statut==="present").length;
                        return { date:d, taux: rows.length ? Math.round(pres/rows.length*100) : 0 };
                      });
                      const meilleureSeance = tauxParDate.length ? tauxParDate.reduce((a,b)=>b.taux>a.taux?b:a) : null;
                      const derniereSeance  = tauxParDate.length ? tauxParDate.sort((a,b)=>b.date.localeCompare(a.date))[0] : null;
                      const tendance = tauxParDate.length >= 2
                        ? derniereSeance.taux - tauxParDate.sort((a,b)=>b.date.localeCompare(a.date))[1].taux
                        : null;
                      const nomClassePres = groupes.find(g=>g.id===filtreGroupeTab)?.nom || "Classe";

                      function exportExcelPresences() {
                        exporterExcelStyle({
                          nomFichier: `Presences_${nomClassePres.replace(/\s+/g, "_")}`,
                          titre: `Présences - ${nomClassePres}`,
                          sousTitre: `${nbSeances} séance(s) enregistrée(s) · Taux moyen ${tauxMoyen}%`,
                          couleurEntete: BET.replace("#", ""),
                          colonnes: [
                            { label: "Date",     width: 16 },
                            { label: "Présents", width: 16, align: "center" },
                            { label: "Total",    width: 14, align: "center" },
                            { label: "Taux",     width: 14, align: "center" },
                          ],
                          lignes: tauxParDate.sort((a,b)=>b.date.localeCompare(a.date)).map(s => {
                            const rows = parDate[s.date] || [];
                            const pres = rows.filter(r=>r.statut==="present").length;
                            return [fmtDatePDF(s.date), pres, rows.length, `${s.taux}%`];
                          }),
                        });
                      }

                      function exportPDFPresences() {
                        const seancesTriees = [...tauxParDate].sort((a,b)=>b.date.localeCompare(a.date));
                        const lignesHtml = seancesTriees.map(s => {
                          const rows = parDate[s.date] || [];
                          const pres = rows.filter(r=>r.statut==="present").length;
                          return ligneTableau([
                            { val: fmtDatePDF(s.date) },
                            { val: pres, right: true },
                            { val: rows.length, right: true },
                            { val: `${s.taux}%`, right: true, bold: true },
                          ]);
                        }).join("");
                        const html = `
                          <div class="doc-header">
                            <div><div class="doc-header-logo">BET</div><div class="doc-header-sub">Suivi des présences · ${nomClassePres}</div></div>
                            <div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}</div>
                          </div>
                          <div class="doc-title-band">📋 Présences - ${nomClassePres}</div>
                          <div class="doc-body">
                            <div class="kpi-row">
                              <div class="kpi-card"><div class="kpi-val">${nbSeances}</div><div class="kpi-lbl">Séances enregistrées</div></div>
                              <div class="kpi-card"><div class="kpi-val">${tauxMoyen}%</div><div class="kpi-lbl">Taux présence moyen</div></div>
                              <div class="kpi-card"><div class="kpi-val">${totalPres}</div><div class="kpi-lbl">Total présences</div></div>
                              <div class="kpi-card"><div class="kpi-val">${totalAbs}</div><div class="kpi-lbl">Total absences</div></div>
                            </div>
                            <div class="section-title">Détail par séance</div>
                            <table>
                              <thead><tr><th>Date</th><th>Présents</th><th>Total</th><th>Taux</th></tr></thead>
                              <tbody>${lignesHtml || '<tr><td colspan="4" style="text-align:center;color:#94A3B8">Aucune séance enregistrée</td></tr>'}</tbody>
                            </table>
                            <div class="doc-footer"><span>BET</span><span>Document généré automatiquement</span></div>
                          </div>`;
                        genererPDF(html, `Présences - ${nomClassePres}`);
                      }

                      return (
                        <div style={{ marginBottom:20 }}>
                          {/* Exports */}
                          <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginBottom:12 }}>
                            <button onClick={exportPDFPresences} disabled={nbSeances===0}
                              style={{ padding:"9px 14px", borderRadius:8, border:`1.5px solid ${BET}`, background:"#fff", color:BET, fontSize:12, fontWeight:700, cursor:nbSeances===0?"not-allowed":"pointer", opacity:nbSeances===0?0.5:1, display:"flex", alignItems:"center", gap:6 }}>
                              📄 Export PDF
                            </button>
                            <button onClick={exportExcelPresences} disabled={nbSeances===0}
                              style={{ padding:"9px 14px", borderRadius:8, border:"none", background:nbSeances===0?"#e5e7eb":"#16A34A", color:"#fff", fontSize:12, fontWeight:700, cursor:nbSeances===0?"not-allowed":"pointer", display:"flex", alignItems:"center", gap:6 }}>
                              📊 Export Excel
                            </button>
                          </div>
                          {/* Ligne 1 : métriques principales */}
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:12 }}>
                            {[
                              { icon:"📋", label:"Séances enregistrées", val:nbSeances,        color:BET,      bg:BET+"12" },
                              { icon:"✅", label:"Taux de présence",      val:`${tauxMoyen}%`,  color:tauxMoyen>=80?"#059669":tauxMoyen>=60?"#d97706":"#dc2626", bg:tauxMoyen>=80?"#dcfce7":tauxMoyen>=60?"#fef3c7":"#fee2e2" },
                              { icon:"👥", label:"Total apprenants suivis",val:presenceListe.length||groupeApprenants.filter(a=>a.statut==="actif").length, color:"#7c3aed", bg:"#ede9fe" },
                              { icon:"📅", label:"Dernière séance",        val:derniereSeance ? new Date(derniereSeance.date).toLocaleDateString("fr-FR",{day:"numeric",month:"short"}) : "-", color:"#0369a1", bg:"#e0f2fe" },
                            ].map(k=>(
                              <div key={k.label} style={{ borderRadius:12, background:k.bg, padding:"14px 16px", border:`1px solid ${k.color}22` }}>
                                <div style={{ fontSize:18, marginBottom:4 }}>{k.icon}</div>
                                <div style={{ fontSize:22, fontWeight:900, color:k.color, lineHeight:1 }}>{k.val}</div>
                                <div style={{ fontSize:11, color:"#6b7280", marginTop:4, fontWeight:500 }}>{k.label}</div>
                              </div>
                            ))}
                          </div>
                          {/* Ligne 2 : répartition statuts + tendance */}
                          {nbSeances > 0 && (
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr", gap:10 }}>
                              {[
                                { icon:"✅", label:"Présences",  val:totalPres, color:"#059669", bg:"#f0fdf4", pct: totalEnr ? Math.round(totalPres/totalEnr*100) : 0 },
                                { icon:"❌", label:"Absences",   val:totalAbs,  color:"#dc2626", bg:"#fff1f2", pct: totalEnr ? Math.round(totalAbs/totalEnr*100)  : 0 },
                                { icon:"⏰", label:"Retards",    val:totalRet,  color:"#d97706", bg:"#fffbeb", pct: totalEnr ? Math.round(totalRet/totalEnr*100)  : 0 },
                                { icon:"📝", label:"Excusés",    val:totalExc,  color:"#7c3aed", bg:"#f5f3ff", pct: totalEnr ? Math.round(totalExc/totalEnr*100)  : 0 },
                                { icon: tendance===null?"📊": tendance>0?"📈":"📉",
                                  label:"Tendance",
                                  val: tendance===null ? "-" : `${tendance>0?"+":""}${tendance}%`,
                                  color: tendance===null?"#6b7280": tendance>0?"#059669":"#dc2626",
                                  bg:"#f8fafc",
                                  pct: null,
                                  sub: meilleureSeance ? `Meil. ${meilleureSeance.taux}%` : null },
                              ].map(k=>(
                                <div key={k.label} style={{ borderRadius:10, background:k.bg, padding:"10px 12px", border:"1px solid #e5e7eb", textAlign:"center" }}>
                                  <div style={{ fontSize:14 }}>{k.icon}</div>
                                  <div style={{ fontSize:18, fontWeight:800, color:k.color }}>{k.val}</div>
                                  <div style={{ fontSize:10, color:"#9ca3af", fontWeight:600 }}>{k.label}</div>
                                  {k.pct !== null && (
                                    <div style={{ marginTop:4, height:3, borderRadius:3, background:"#e5e7eb", overflow:"hidden" }}>
                                      <div style={{ height:"100%", width:`${k.pct}%`, background:k.color, borderRadius:3 }} />
                                    </div>
                                  )}
                                  {k.sub && <div style={{ fontSize:10, color:k.color, fontWeight:600, marginTop:3 }}>{k.sub}</div>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {presenceView==="saisie" && (
                      <div>
                        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, padding:"14px 18px", background:"#f0f9ff", borderRadius:12, border:"1px solid #bae6fd" }}>
                          <span style={{ fontSize:13, fontWeight:600, color:"#0369a1" }}>📅 Date de la séance :</span>
                          <input type="date" value={presenceDate} onChange={e=>setPresenceDate(e.target.value)}
                            style={{ padding:"7px 10px", border:"1.5px solid #bae6fd", borderRadius:8, fontSize:13, fontWeight:600 }} />
                        </div>
                        {presenceListe.length === 0
                          ? <p style={{ textAlign:"center", color:"#9ca3af", padding:30 }}>Aucun apprenant actif dans ce groupe.</p>
                          : (
                            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
                              {presenceListe.map((p, idx) => (
                                <div key={p.ga_id || idx} style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 16px", background:"#fff", borderRadius:10, border:"1.5px solid #e5e7eb" }}>
                                  <div style={{ width:38, height:38, borderRadius:"50%", background:BET_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:BET, flexShrink:0, overflow:"hidden" }}>
                                    {p.avatar_url ? <img src={p.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : (p.prenom_apprenant?.[0] || p.nom_apprenant?.[0] || "?").toUpperCase()}
                                  </div>
                                  <div style={{ flex:1 }}>
                                    <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{[p.prenom_apprenant, p.nom_apprenant].filter(Boolean).join(" ")}</div>
                                  </div>
                                  <div style={{ display:"flex", gap:6 }}>
                                    {[
                                      { val:"present", label:"✅ Présent",  bg:"#d1fae5", color:"#065f46", sel:"#059669" },
                                      { val:"retard",  label:"⏰ Retard",   bg:"#fef3c7", color:"#92400e", sel:"#d97706" },
                                      { val:"absent",  label:"❌ Absent",   bg:"#fee2e2", color:"#991b1b", sel:"#dc2626" },
                                      { val:"excuse",  label:"📝 Excusé",   bg:"#ede9fe", color:"#5b21b6", sel:"#7c3aed" },
                                    ].map(s => (
                                      <button key={s.val} onClick={()=>setPresenceListe(prev=>prev.map((x,i)=>i===idx?{...x,statut:s.val}:x))}
                                        style={{ padding:"5px 10px", borderRadius:20, border:`1.5px solid ${p.statut===s.val?s.sel:"#e5e7eb"}`, fontSize:11, fontWeight:600, cursor:"pointer",
                                          background: p.statut===s.val ? s.bg : "#fff", color: p.statut===s.val ? s.color : "#9ca3af" }}>
                                        {s.label}
                                      </button>
                                    ))}
                                  </div>
                                  <input value={p.note} onChange={e=>setPresenceListe(prev=>prev.map((x,i)=>i===idx?{...x,note:e.target.value}:x))}
                                    placeholder="Note…" style={{ width:120, padding:"5px 8px", border:"1px solid #e5e7eb", borderRadius:7, fontSize:11 }} />
                                </div>
                              ))}
                            </div>
                          )
                        }
                        {presenceListe.length > 0 && (
                          <div style={{ display:"flex", gap:12, marginBottom:20, padding:"12px 16px", background:"#f8fafc", borderRadius:10, border:"1px solid #e5e7eb" }}>
                            {[
                              { label:"Présents",  val:presenceListe.filter(p=>p.statut==="present").length,  color:"#059669" },
                              { label:"Retards",   val:presenceListe.filter(p=>p.statut==="retard").length,   color:"#d97706" },
                              { label:"Absents",   val:presenceListe.filter(p=>p.statut==="absent").length,   color:"#dc2626" },
                              { label:"Excusés",   val:presenceListe.filter(p=>p.statut==="excuse").length,   color:"#7c3aed" },
                            ].map(s=>(
                              <div key={s.label} style={{ textAlign:"center", flex:1 }}>
                                <div style={{ fontSize:22, fontWeight:900, color:s.color }}>{s.val}</div>
                                <div style={{ fontSize:11, color:"#9ca3af", fontWeight:600 }}>{s.label}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        <button onClick={savePresences} disabled={presenceSaving || presenceListe.length===0}
                          style={{ padding:"11px 24px", background:BET, color:"#fff", border:"none", borderRadius:9, cursor:"pointer", fontWeight:700, fontSize:13, opacity:presenceSaving?0.6:1 }}>
                          {presenceSaving ? "⏳ Enregistrement…" : "💾 Enregistrer la feuille de présence"}
                        </button>
                      </div>
                    )}

                    {presenceView==="historique" && (
                      <div>
                        {presenceHistory.length === 0
                          ? <div style={{ textAlign:"center", padding:"40px 20px", color:"#9ca3af", background:"#f8fafc", borderRadius:12 }}>Aucune séance enregistrée pour ce groupe.</div>
                          : (() => {
                              const parDate = {};
                              presenceHistory.forEach(p => { if (!parDate[p.date_seance]) parDate[p.date_seance]=[]; parDate[p.date_seance].push(p); });
                              return Object.entries(parDate).sort(([a],[b])=>b.localeCompare(a)).map(([date, rows]) => {
                                const presents = rows.filter(r=>r.statut==="present").length;
                                const total = rows.length;
                                const taux = total ? Math.round(presents/total*100) : 0;
                                return (
                                  <div key={date} style={{ marginBottom:16, background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", overflow:"hidden" }}>
                                    <div style={{ padding:"12px 16px", background:"#f8fafc", borderBottom:"1px solid #e5e7eb", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                      <span style={{ fontWeight:700, color:"#0f172a" }}>📅 {new Date(date).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</span>
                                      <span style={{ fontSize:12, fontWeight:700, color:taux>=80?"#059669":taux>=60?"#d97706":"#dc2626" }}>
                                        {presents}/{total} présents - {taux}%
                                      </span>
                                    </div>
                                    <div style={{ padding:"10px 16px", display:"flex", flexWrap:"wrap", gap:6 }}>
                                      {rows.map(r=>(
                                        <span key={r.id} style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600,
                                          background:r.statut==="present"?"#d1fae5":r.statut==="absent"?"#fee2e2":r.statut==="retard"?"#fef3c7":"#ede9fe",
                                          color:r.statut==="present"?"#065f46":r.statut==="absent"?"#991b1b":r.statut==="retard"?"#92400e":"#5b21b6" }}>
                                          {r.statut==="present"?"✅":r.statut==="absent"?"❌":r.statut==="retard"?"⏰":"📝"} {[r.prenom_apprenant,r.nom_apprenant].filter(Boolean).join(" ")}
                                          {r.note && ` (${r.note})`}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                );
                              });
                            })()
                        }
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })()}

            {/* ════════ ÉVALUATIONS / DEVOIRS ════════ */}
            {activeTab==="evaluations" && (() => {
              const TABS_ND = [
                { id:"devoirs",   lib:"Devoirs",                icone:"📝" },
                { id:"reception", lib:"Réception & Correction", icone:"📥", badge: evaluations.reduce((s,e)=>(s+(e.stats?.rendus||0)),0) },
                { id:"notes",     lib:"Notes & Évaluations",   icone:"🏅" },
              ];
              // KPIs réception
              const totalRendus  = evaluations.reduce((s,e)=>(s+(e.stats?.rendus||0)+(e.stats?.corriges||0)),0);
              const aCorrection  = evaluations.reduce((s,e)=>(s+(e.stats?.rendus||0)),0);
              const corriges     = evaluations.reduce((s,e)=>(s+(e.stats?.corriges||0)),0);
              const nonRendus    = Math.max(0, evaluations.reduce((s,e)=>(s+(e.stats?.total||0)),0) - totalRendus);
              const publiés      = evaluations.filter(e=>e.statut==="publie").length;

              // Filtres devoirs
              const evFiltrees = evaluations
                .filter(ev => evalStatutFiltre==="tous" || ev.statut===evalStatutFiltre)
                .filter(ev => !evalClasseFiltre || ev.groupe_id===evalClasseFiltre);

              return (
                <div>
                  {/* ── Barre sous-onglets ── */}
                  <div style={{ display:"flex", gap:0, marginBottom:24, background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", overflow:"hidden", boxShadow:"0 2px 6px rgba(0,0,0,0.04)" }}>
                    {TABS_ND.map((t,i) => (
                      <button key={t.id} onClick={()=>setSousOngletEval(t.id)} style={{ flex:1, padding:"13px 16px", border:"none", background:sousOngletEval===t.id?"#fff":"#f8fafc", borderBottom:sousOngletEval===t.id?`3px solid ${BET}`:"3px solid transparent", borderRight:i<TABS_ND.length-1?"1px solid #e5e7eb":"none", color:sousOngletEval===t.id?BET:"#6b7280", fontWeight:sousOngletEval===t.id?700:500, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:7, transition:"all 0.15s" }}>
                        <span>{t.icone}</span><span>{t.lib}</span>
                        {t.badge>0 && <span style={{ background:sousOngletEval===t.id?BET:"#fee2e2", color:sousOngletEval===t.id?"#fff":"#dc2626", borderRadius:20, padding:"1px 7px", fontSize:11, fontWeight:700 }}>{t.badge}</span>}
                      </button>
                    ))}
                  </div>

                  {/* ══ DEVOIRS ══ */}
                  {sousOngletEval==="devoirs" && (
                    <div>
                      {/* Header */}
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                        <h2 style={tabTitle}>Gestion des devoirs</h2>
                        <button style={btnPrimary} onClick={()=>{ setEvalEditId(null); setEvalForm({ groupe_id:groupes[0]?.id||"", titre:"", date_limite:"", heure_limite:"23:59", date_ouverture:"", heure_ouverture:"", type:"qcm", categorie:"devoir", typeRendu:"fichier", surTOEIC:false, dureeMin:60, questions:[], ressourceUrl:"", instructions:"", notifierEleves:true, envoyerEmail:false, blocs:[] }); setEvalBlocEditing(null); setShowCreateEvalModal(true); }}>
                          + Créer un devoir / évaluation
                        </button>
                      </div>

                      {/* Filtres */}
                      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"12px 16px", marginBottom:16, display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
                        <div>
                          <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", marginBottom:6 }}>Statut</div>
                          <div style={{ display:"flex", gap:6 }}>
                            {[["tous","Tous"],["publie","✅ Publiés"],["brouillon","📝 Brouillons"]].map(([v,l])=>(
                              <button key={v} onClick={()=>setEvalStatutFiltre(v)} style={{ padding:"5px 12px", borderRadius:20, border:`1.5px solid ${evalStatutFiltre===v?BET:"#e5e7eb"}`, background:evalStatutFiltre===v?BET_LIGHT:"#fff", color:evalStatutFiltre===v?BET:"#6b7280", fontSize:11, fontWeight:evalStatutFiltre===v?700:400, cursor:"pointer" }}>{l}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", marginBottom:6 }}>Classe</div>
                          <select value={evalClasseFiltre||""} onChange={e=>setEvalClasseFiltre(e.target.value||null)} style={{ padding:"6px 10px", borderRadius:8, border:"1px solid #e5e7eb", fontSize:12, color:"#374151" }}>
                            <option value="">Toutes</option>
                            {groupes.map(g=><option key={g.id} value={g.id}>{g.nom}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Liste */}
                      {evalsLoading ? (
                        <div style={{ textAlign:"center", padding:"40px 20px", color:"#9ca3af" }}>⏳ Chargement…</div>
                      ) : evFiltrees.length === 0 ? (
                        <div style={{ textAlign:"center", padding:"50px 20px", background:"#f8fafc", borderRadius:16, color:"#9ca3af" }}>
                          <div style={{ fontSize:40, marginBottom:12 }}>📝</div>
                          <div style={{ fontWeight:600, marginBottom:6, color:"#374151" }}>Aucun devoir</div>
                          <div style={{ fontSize:13 }}>Cliquez sur "+ Créer un devoir / évaluation" pour commencer</div>
                        </div>
                      ) : evFiltrees.map(ev => {
                        const isBrouillon = ev.statut==="brouillon";
                        const isPublie    = ev.statut==="publie";
                        const isCloture   = ev.statut==="cloture";
                        const now         = new Date();
                        const expire      = ev.date_evaluation && now > new Date(ev.date_evaluation+"T"+(ev.heure_debut||"23:59")+":00");
                        const typeEmoji   = { qcm:"📋", speaking:"🎤", texte_libre:"📝", exercice:"✏️", listening:"🎬", audio:"🎧", quiz:"🎯" }[ev.type] || "📝";
                        const typeLabel   = { qcm:"qcm", speaking:"speaking", texte_libre:"Composition", exercice:"Exercice", listening:"Listening", audio:"Audio", quiz:"Quiz" }[ev.type] || ev.type;
                        return (
                          <div key={ev.id} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"14px 18px", marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:14, flex:1, minWidth:0 }}>
                              <div style={{ width:38, height:38, borderRadius:10, background:`${BET}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>{typeEmoji}</div>
                              <div style={{ minWidth:0 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                                  <span style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>{ev.titre}</span>
                                  {ev.groupe_nom && <span style={{ padding:"2px 8px", borderRadius:10, fontSize:10, fontWeight:700, background:`${BET}18`, color:BET }}>{ev.groupe_nom}</span>}
                                  <span style={{ padding:"2px 8px", borderRadius:10, fontSize:10, fontWeight:700, background:isPublie?"#dcfce7":isBrouillon?"#f3f4f6":"#f3e8ff", color:isPublie?"#166534":isBrouillon?"#6b7280":"#7c3aed" }}>{isPublie?"✅ Publié":isBrouillon?"📝 Brouillon":"⏳ Terminé"}</span>
                                  {isPublie && expire && <span style={{ padding:"2px 8px", borderRadius:10, fontSize:10, fontWeight:700, background:"#fef2f2", color:"#dc2626" }}>⚠️ Délai dépassé</span>}
                                </div>
                                <div style={{ fontSize:11, color:"#9ca3af", display:"flex", gap:10, flexWrap:"wrap" }}>
                                  <span>{typeEmoji} {typeLabel}</span>
                                  {ev.type==="texte_libre"&&<span>📝 Composition</span>}
                                  {ev.date_evaluation&&<span>⏳ Limite : {fmtDate(ev.date_evaluation)} {ev.heure_debut||""}</span>}
                                  {ev.duree_min&&ev.type!=="texte_libre"&&<span>⏱ {ev.duree_min} min</span>}
                                </div>
                              </div>
                            </div>
                            <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                              {isPublie ? (
                                <>
                                  <button onClick={()=>openConfirm("Dépublier ce devoir ?",`"${ev.titre}" sera repassé en brouillon. Les apprenants ne pourront plus y accéder tant qu'il est dépublié.`,()=>depublierEval(ev),"⏸ Dépublier","#0891b2")} style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${BET}`, background:"#fff", color:BET, fontSize:12, fontWeight:600, cursor:"pointer" }}>⏸ Dépublier</button>
                                  <button onClick={()=>openConfirm("Modifier un devoir publié",`"${ev.titre}" doit d'abord être dépublié. Les apprenants n'y auront plus accès pendant la modification.`,()=>depublierEval(ev,()=>ouvrirEditionEval({...ev,statut:"brouillon"})),"✏️ Dépublier & modifier","#7c3aed")} style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #7c3aed", background:"#f5f3ff", color:"#7c3aed", fontSize:12, fontWeight:600, cursor:"pointer" }}>✏️ Modifier</button>
                                </>
                              ) : isCloture ? (
                                <span style={{ padding:"6px 14px", borderRadius:8, background:"#f3e8ff", color:"#7c3aed", fontSize:12, fontWeight:600 }}>🔒 Notes validées</span>
                              ) : (
                                <>
                                  <button onClick={()=>publierEval(ev)} style={{ padding:"6px 14px", borderRadius:8, border:"none", background:BET, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" }}>📤 Publier</button>
                                  <button onClick={()=>ouvrirEditionEval(ev)} style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #7c3aed", background:"#f5f3ff", color:"#7c3aed", fontSize:12, fontWeight:600, cursor:"pointer" }}>✏️ Modifier</button>
                                </>
                              )}
                              <button onClick={()=>chargerResultats(ev)} style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${BET}`, background:`${BET}10`, color:BET, fontSize:12, fontWeight:600, cursor:"pointer" }}>📥 Rendus</button>
                              <button onClick={()=>openConfirm("Supprimer ce devoir ?",`"${ev.titre}" sera définitivement supprimé avec tous les rendus des apprenants. Cette action est irréversible.`,()=>supprimerEval(ev),"🗑 Supprimer","#dc2626")} style={{ padding:"6px 10px", borderRadius:8, border:"1px solid #fca5a5", background:"#fef2f2", color:"#dc2626", fontSize:12, cursor:"pointer" }}>🗑</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ══ RÉCEPTION & CORRECTION ══ */}
                  {sousOngletEval==="reception" && (
                    <div>
                      {/* KPIs */}
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:24 }}>
                        {[
                          { v:totalRendus,  l:"Soumissions reçues", i:"📥", c:"#0891b2" },
                          { v:aCorrection,  l:"À corriger",         i:"✏️",  c:"#f59e0b" },
                          { v:corriges,     l:"Corrigés",           i:"✅", c:"#059669" },
                          { v:nonRendus,    l:`Non rendus (${nonRendus})`, i:"🔴", c:"#dc2626" },
                          { v:publiés,      l:"Devoirs publiés",    i:"📝", c:BET },
                        ].map(s=>(
                          <div key={s.l} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"14px 16px", textAlign:"center" }}>
                            <div style={{ fontSize:22, marginBottom:4 }}>{s.i}</div>
                            <div style={{ fontSize:22, fontWeight:800, color:s.c }}>{s.v}</div>
                            <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>{s.l}</div>
                          </div>
                        ))}
                      </div>

                      {/* Filtres */}
                      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"12px 16px", marginBottom:16, display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
                        <div>
                          <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", marginBottom:6 }}>Statut</div>
                          <div style={{ display:"flex", gap:6 }}>
                            {[["tous","Tous"],["rendu","✅ Rendus"],["corrige","🏅 Corrigés"],["a_faire","🔴 Non rendus"],["publie","⏳ En attente"]].map(([v,l])=>(
                              <button key={v} onClick={()=>setEvalStatutFiltre(v)} style={{ padding:"5px 12px", borderRadius:20, border:`1.5px solid ${evalStatutFiltre===v?BET:"#e5e7eb"}`, background:evalStatutFiltre===v?BET_LIGHT:"#fff", color:evalStatutFiltre===v?BET:"#6b7280", fontSize:11, fontWeight:evalStatutFiltre===v?700:400, cursor:"pointer" }}>{l}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", marginBottom:6 }}>Classe</div>
                          <select value={evalClasseFiltre||""} onChange={e=>setEvalClasseFiltre(e.target.value||null)} style={{ padding:"6px 10px", borderRadius:8, border:"1px solid #e5e7eb", fontSize:12, color:"#374151" }}>
                            <option value="">Toutes les classes</option>
                            {groupes.map(g=><option key={g.id} value={g.id}>{g.nom}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Liste devoirs pour la réception */}
                      {evalsLoading ? (
                        <div style={{ textAlign:"center", padding:"40px 20px", color:"#9ca3af" }}>⏳ Chargement…</div>
                      ) : evaluations.filter(ev=>!evalClasseFiltre||ev.groupe_id===evalClasseFiltre).length === 0 ? (
                        <div style={{ textAlign:"center", padding:"50px 20px", background:"#f8fafc", borderRadius:16, color:"#9ca3af" }}>
                          <div style={{ fontSize:40, marginBottom:12 }}>📥</div>
                          <div style={{ fontWeight:600, color:"#374151" }}>Aucune soumission</div>
                        </div>
                      ) : evaluations.filter(ev=>!evalClasseFiltre||ev.groupe_id===evalClasseFiltre).map(ev => {
                        const rendus = (ev.stats?.rendus||0)+(ev.stats?.corriges||0);
                        const typeLabel = { qcm:"QCM",speaking:"Speaking",texte_libre:"Composition",exercice:"Exercice",listening:"Listening",audio:"Audio",quiz:"Quiz" }[ev.type]||ev.type;
                        return (
                          <div key={ev.id} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"14px 18px", marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:14, flex:1 }}>
                              <div style={{ width:38, height:38, borderRadius:10, background:"#f8fafc", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>📝</div>
                              <div>
                                <div style={{ fontWeight:700, fontSize:14, color:"#0f172a", marginBottom:3 }}>{ev.titre}</div>
                                <div style={{ fontSize:11, color:"#9ca3af" }}>{ev.groupe_nom} · {typeLabel} · {ev.date_evaluation?`Limite : ${fmtDate(ev.date_evaluation)}`:"Sans limite"}</div>
                                {rendus>0 ? <div style={{ fontSize:11, color:"#059669", marginTop:2 }}>📥 {rendus} rendu{rendus>1?"s":""}{ev.stats?.corriges?` · ✅ ${ev.stats.corriges} corrigé${ev.stats.corriges>1?"s":""}`:""}</div>
                                : <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>Non chargé</div>}
                              </div>
                            </div>
                            <button onClick={()=>chargerResultats(ev)} style={{ padding:"8px 16px", borderRadius:8, border:"none", background:BET, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", flexShrink:0 }}>📥 Voir les rendus</button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ══ NOTES & ÉVALUATIONS ══ */}
                  {sousOngletEval==="notes" && (() => {
                    const groupesStatutFiltresEvalNotes = groupes.filter(g =>
                      evalGroupeStatutFiltre === "tous" ? true :
                      evalGroupeStatutFiltre === "cloture" ? g.statut === "cloture" :
                      g.statut !== "cloture"
                    );
                    const groupesOptionsEvalNotes = rechercheClasseEvalNotes.trim()
                      ? groupesStatutFiltresEvalNotes.filter(g => (g.nom||"").toLowerCase().includes(rechercheClasseEvalNotes.trim().toLowerCase()))
                      : groupesStatutFiltresEvalNotes;
                    if (evalClasseFiltre && !groupesStatutFiltresEvalNotes.some(g => g.id === evalClasseFiltre)) {
                      setTimeout(() => setEvalClasseFiltre(null), 0);
                    }
                    const etudsFiltresNotes = evalClasseFiltre
                      ? etudiants.filter(e => e.groupe_id === evalClasseFiltre)
                      : etudiants;
                    return (
                      <div>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                          <h2 style={tabTitle}>Notes & Évaluations</h2>
                          <button disabled={!peut("devoirs_evaluations","create")} title={permBtnTitle("Saisir une note",peut("devoirs_evaluations","create"))} onClick={()=>setShowNoteModal(true)} style={permBtnStyle(btnPrimary,peut("devoirs_evaluations","create"))}>{peut("devoirs_evaluations","create")?"+":"🔒"} Saisir une note</button>
                        </div>
                        <div style={{ marginBottom:16 }}>
                          <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", marginBottom:8 }}>Classe</div>
                          <RangeePastilles accent={BET} valeur={evalGroupeStatutFiltre} style={{ marginBottom:8 }}
                            onChange={(v)=>{ setEvalGroupeStatutFiltre(v); setEvalClasseFiltre(null); }}
                            options={[{ v:"actif", l:"🟢 Actives" }, { v:"cloture", l:"🔒 Terminées" }, { v:"tous", l:"Toutes" }]} />
                          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                            <input type="text" placeholder="🔍 Filtrer les classes…" value={rechercheClasseEvalNotes} onChange={e=>setRechercheClasseEvalNotes(e.target.value)}
                              style={{ ...inputSt, marginBottom:0, width:180 }} />
                            <select value={evalClasseFiltre||""} onChange={e=>setEvalClasseFiltre(e.target.value||null)}
                              style={{ ...inputSt, marginBottom:0, width:"auto", minWidth:220 }}>
                              <option value="">📚 Toutes les classes ({groupesOptionsEvalNotes.length})</option>
                              {groupesOptionsEvalNotes.map(g => (
                                <option key={g.id} value={g.id}>{g.nom}{g.niveau?` · ${g.niveau}`:""}{g.statut==="cloture"?" · 🔒 Terminée":""}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {notesDataLoading && (
                          <div style={{ textAlign:"center", padding:"20px 0", color:"#9ca3af", fontSize:13 }}>Chargement des notes…</div>
                        )}
                        {(() => {
                          const lignesNotesPlates = etudsFiltresNotes.flatMap(et => {
                            const prenomEt = et.prenom_apprenant || et.nom.split(" ")[0] || "";
                            const nomEt    = et.nom_apprenant    || et.nom.split(" ").slice(1).join(" ") || et.nom;
                            return notesData.filter(n => n.etudiant_id === et.id).map(n => ({ et, prenomEt, nomEt, n }));
                          }).sort((a,b) => new Date(b.n.date_evaluation||b.n.created_at||0) - new Date(a.n.date_evaluation||a.n.created_at||0));
                          if (etudsFiltresNotes.length === 0) {
                            return <div style={{ textAlign:"center", padding:"40px 20px", color:"#9ca3af" }}>Aucun apprenant dans cette classe</div>;
                          }
                          if (lignesNotesPlates.length === 0) {
                            return <div style={{ textAlign:"center", padding:"40px 20px", background:"#f8fafc", borderRadius:16, color:"#9ca3af" }}>Aucune note enregistrée pour l'instant.</div>;
                          }
                          return (
                            <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, overflow:"hidden" }}>
                              <div style={{ display:"grid", gridTemplateColumns:"1.6fr 1.4fr 1fr 0.8fr 1.4fr 1fr", gap:8, fontSize:10, color:"#9ca3af", fontWeight:700, textTransform:"uppercase", padding:"10px 16px", background:"#f8fafc", borderBottom:"1px solid #e5e7eb" }}>
                                <span>Apprenant</span><span>Devoir / Évaluation</span><span>Note</span><span>Type</span><span>Classe</span><span>Date</span>
                              </div>
                              {lignesNotesPlates.map(({et, prenomEt, nomEt, n}) => (
                                <div key={n.id} onClick={()=>setNoteDetailModal({et, prenomEt, nomEt, n})}
                                  style={{ display:"grid", gridTemplateColumns:"1.6fr 1.4fr 1fr 0.8fr 1.4fr 1fr", gap:8, fontSize:12, color:"#374151", padding:"10px 16px", borderBottom:"1px solid #f9fafb", cursor:"pointer" }}
                                  onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                                  <span style={{ fontWeight:700, color:"#0f172a" }}>{prenomEt} {nomEt}</span>
                                  <span style={{ fontWeight:600 }}>{n.eval_nom||n.nom_evaluation||"-"}</span>
                                  <span style={{ fontWeight:700, color:Number(n.score||n.note)>=10?"#059669":"#dc2626" }}>{n.score||n.note}/{n.total||20}</span>
                                  <span style={{ padding:"2px 7px", borderRadius:8, background:"#f3e8ff", color:"#7c3aed", fontSize:10, fontWeight:700, display:"inline-block", width:"fit-content" }}>{n.type||"controle"}</span>
                                  <span style={{ color:"#9ca3af" }}>{groupes.find(g=>g.id===et.groupe_id)?.nom||""}</span>
                                  <span style={{ color:"#9ca3af" }}>{fmtDate(n.date_evaluation||n.created_at)}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}

                  {/* ── Modal détail d'une note ── */}
                  {noteDetailModal && (() => {
                    const { prenomEt, nomEt, n, et } = noteDetailModal;
                    const noteVal = Number(n.score||n.note);
                    return (
                      <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.75)", zIndex:3000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setNoteDetailModal(null)}>
                        <div style={{ background:"#fff", borderRadius:18, width:"90vw", maxWidth:"90vw", height:"90vh", overflow:"hidden", display:"flex", flexDirection:"column", boxShadow:"0 24px 60px rgba(0,0,0,0.35)" }} onClick={e=>e.stopPropagation()}>
                          <div style={{ background:`linear-gradient(135deg,${BET},#0e4f6b)`, padding:"18px 24px", color:"#fff" }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                              <div>
                                <div style={{ fontSize:10, color:"rgba(255,255,255,0.55)", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>Détail de la note</div>
                                <div style={{ fontSize:17, fontWeight:800 }}>{prenomEt} {nomEt}</div>
                              </div>
                              <button onClick={()=>setNoteDetailModal(null)} style={{ background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", borderRadius:8, width:34, height:34, fontSize:18, cursor:"pointer", flexShrink:0 }}>✕</button>
                            </div>
                          </div>
                          <div style={{ padding:22 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                              <div style={{ fontWeight:700, fontSize:15, color:"#0f172a" }}>{n.eval_nom||n.nom_evaluation||"-"}</div>
                              <div style={{ fontSize:26, fontWeight:900, color: noteVal>=10?"#059669":"#dc2626" }}>{n.score||n.note}/{n.total||20}</div>
                            </div>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                              <div>
                                <div style={{ fontSize:10, color:"#9ca3af", textTransform:"uppercase", fontWeight:700, marginBottom:4 }}>Type</div>
                                <span style={{ padding:"3px 10px", borderRadius:10, background:"#f3e8ff", color:"#7c3aed", fontSize:11, fontWeight:700 }}>{n.type||"controle"}</span>
                              </div>
                              <div>
                                <div style={{ fontSize:10, color:"#9ca3af", textTransform:"uppercase", fontWeight:700, marginBottom:4 }}>Classe</div>
                                <div style={{ fontSize:13, fontWeight:600, color:"#374151" }}>{groupes.find(g=>g.id===et.groupe_id)?.nom||"-"}</div>
                              </div>
                              <div>
                                <div style={{ fontSize:10, color:"#9ca3af", textTransform:"uppercase", fontWeight:700, marginBottom:4 }}>Date</div>
                                <div style={{ fontSize:13, fontWeight:600, color:"#374151" }}>{fmtDate(n.date_evaluation||n.created_at)}</div>
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize:10, color:"#9ca3af", textTransform:"uppercase", fontWeight:700, marginBottom:6 }}>Commentaire</div>
                              <div style={{ fontSize:13, color:"#374151", background:"#f8fafc", borderRadius:10, padding:"12px 14px", minHeight:40, fontStyle: n.commentaire ? "normal":"italic" }}>
                                {n.commentaire || "Aucun commentaire"}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Modal résultats / correction ── */}
                  {evalResultatsModal && (()=>{
                    const ev = evalResultatsModal.evaluation;
                    const resultats = evalResultatsModal.resultats;
                    const nbRendus   = resultats.filter(({resultat:r})=>r.statut==="rendu").length;
                    const nbCorrige  = resultats.filter(({resultat:r})=>r.statut==="corrige").length;
                    const nbAFaire   = resultats.filter(({resultat:r})=>r.statut==="a_faire").length;
                    const nbRetard   = resultats.filter(({resultat:r})=>r.statut==="en_retard").length;
                    const tousCorrige = resultats.every(({resultat:r})=>r.statut==="corrige"||r.statut==="a_faire");
                    const deadlinePassed = ev.date_evaluation && new Date(`${ev.date_evaluation}T${ev.heure_debut || "23:59"}:00`) < new Date();
                    // Peut valider seulement si TOUS les apprenants de la classe ont une note
                    // (note déjà sauvegardée OU saisie dans le formulaire)
                    const peutValider = resultats.length > 0 && resultats.every(({resultat:r, apprenant:a}) => {
                      const f = evalCorrectForms[a.id];
                      const noteForm = f && f.note !== "" && !isNaN(parseFloat(f.note));
                      const noteExistante = r.statut === "corrige" && r.note !== null && r.note !== undefined;
                      return noteForm || noteExistante;
                    });
                    return (
                    <>
                    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.75)", zIndex:3000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
                      <div style={{ background:"#fff", borderRadius:18, width:"90vw", height:"90vh", overflow:"hidden", display:"flex", flexDirection:"column", boxShadow:"0 24px 60px rgba(0,0,0,0.35)" }}>
                        {/* Header */}
                        <div style={{ background:`linear-gradient(135deg,${BET},#0e4f6b)`, padding:"18px 24px", color:"#fff", flexShrink:0 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                            <div>
                              <div style={{ fontSize:10, color:"rgba(255,255,255,0.55)", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>Correction des rendus</div>
                              <div style={{ fontSize:17, fontWeight:800, marginBottom:6 }}>{ev?.titre}</div>
                              <div style={{ display:"flex", gap:10 }}>
                                {[
                                  { l:`${nbRendus} à corriger`, c:"#fbbf24", show: nbRendus>0 },
                                  { l:`${nbCorrige} corrigé${nbCorrige>1?"s":""}`, c:"#34d399", show: nbCorrige>0 },
                                  { l:`${nbAFaire} non rendu${nbAFaire>1?"s":""}`, c:"rgba(255,255,255,0.5)", show: nbAFaire>0 },
                                  { l:`${nbRetard} en retard`, c:"#f87171", show: nbRetard>0 },
                                ].filter(x=>x.show).map(x=>(
                                  <span key={x.l} style={{ fontSize:11, fontWeight:700, color:x.c }}>{x.l}</span>
                                ))}
                              </div>
                            </div>
                            <button onClick={()=>{ setEvalResultatsModal(null); setEvalResultatDetail(null); }} style={{ background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", borderRadius:8, width:34, height:34, fontSize:18, cursor:"pointer", flexShrink:0 }}>✕</button>
                          </div>
                        </div>

                        {/* Body */}
                        <div style={{ flex:1, overflowY:"auto", padding:20 }}>
                          {/* Exercice joint à la création - rappel pour la correction */}
                          {ev.ressource_url && (
                            <a href={ev.ressource_url} target="_blank" rel="noreferrer" style={{ display:"flex", alignItems:"center", gap:10, background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:10, padding:"10px 14px", marginBottom:16, textDecoration:"none" }}>
                              <span style={{ fontSize:18 }}>📎</span>
                              <div>
                                <div style={{ fontSize:11.5, fontWeight:700, color:"#0f172a" }}>Exercice joint à ce devoir</div>
                                <div style={{ fontSize:11, color:"#9ca3af", wordBreak:"break-all" }}>{(ev.ressource_url.split("/").pop() || "Voir le fichier")}</div>
                              </div>
                            </a>
                          )}
                          {resultats.length === 0 ? (
                            <div style={{ textAlign:"center", padding:"40px 20px", color:"#9ca3af" }}>Aucun apprenant dans ce groupe</div>
                          ) : resultats.map(({ apprenant: app, resultat: res }) => {
                            const statutColor = res.statut==="corrige" ? { bg:"#dcfce7", c:"#166534" }
                              : res.statut==="rendu"    ? { bg:"#dbeafe", c:"#1e40af" }
                              : res.statut==="en_retard"? { bg:"#fee2e2", c:"#991b1b" }
                              : { bg:"#f3f4f6", c:"#6b7280" };
                            const statutLib = res.statut==="corrige"?"✅ Corrigé":res.statut==="rendu"?"📥 Rendu":res.statut==="en_retard"?"⏰ En retard":"⏳ À rendre";
                            return (
                              <div key={app.id} onClick={()=>setEvalResultatDetail({ apprenant:app, resultat:res })}
                                style={{ display:"flex", alignItems:"center", gap:12, borderRadius:12, border:`1.5px solid ${res.statut==="rendu"?"#bfdbfe":res.statut==="corrige"?"#bbf7d0":"#e5e7eb"}`, padding:"12px 16px", marginBottom:8, background:res.statut==="rendu"?"#f0f9ff":"#fff", cursor:"pointer" }}
                                onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 10px rgba(0,0,0,0.07)"}
                                onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                                <div style={{ fontWeight:700, fontSize:13, flex:1 }}>{app.prenom} {app.nom}</div>
                                {res.statut === "a_faire" && deadlinePassed && (
                                  <span style={{ fontSize:10, fontWeight:700, color:"#dc2626" }}>⏰ Auto-zéro</span>
                                )}
                                {res.statut==="corrige" && res.note!==null && (
                                  <strong style={{ fontSize:13, color:res.note>=10?"#059669":"#dc2626" }}>{res.note}/{res.note_max||20}</strong>
                                )}
                                {res.rendu_at && <span style={{ fontSize:10, color:"#9ca3af" }}>rendu le {new Date(res.rendu_at).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</span>}
                                <span style={{ fontSize:11, padding:"3px 10px", borderRadius:10, fontWeight:700, background:statutColor.bg, color:statutColor.c, whiteSpace:"nowrap" }}>{statutLib}</span>
                                <span style={{ color:"#9ca3af", fontSize:13 }}>›</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Footer */}
                        <div style={{ borderTop:"1px solid #e5e7eb", padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0, background:"#f8fafc" }}>
                          <div style={{ fontSize:12, color:"#6b7280" }}>
                            {nbCorrige}/{resultats.length} corrigé{nbCorrige>1?"s":""}
                          </div>
                          <div style={{ display:"flex", gap:8 }}>
                            <button onClick={()=>{ setEvalResultatsModal(null); setEvalResultatDetail(null); }} style={{ padding:"8px 18px", borderRadius:8, border:"1px solid #e5e7eb", background:"#fff", color:"#374151", fontSize:13, cursor:"pointer" }}>Fermer</button>
                            <button
                              onClick={()=>validerDefinitivement(ev, resultats)}
                              disabled={!peutValider || validationEnCours.has(ev.id)}
                              title={!peutValider ? `Renseignez une note pour chaque apprenant de la classe (${resultats.filter(({resultat:r,apprenant:a})=>{const f=evalCorrectForms[a.id];return !(f&&f.note!==""&&!isNaN(parseFloat(f.note)))&&!(r.statut==="corrige"&&r.note!=null)}).length} manquante(s))` : "Valider toutes les corrections en une fois"}
                              style={{ padding:"8px 18px", borderRadius:8, border:"none", background:(peutValider && !validationEnCours.has(ev.id))?"#059669":"#d1d5db", color:(peutValider && !validationEnCours.has(ev.id))?"#fff":"#9ca3af", fontSize:13, fontWeight:700, cursor:(peutValider && !validationEnCours.has(ev.id))?"pointer":"not-allowed" }}
                            >
                              {validationEnCours.has(ev.id) ? "⏳ Validation en cours…" : `✅ Valider définitivement (${resultats.length} apprenant${resultats.length>1?"s":""})`}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Détail / correction d'un rendu - ouvert au clic sur une ligne */}
                    {evalResultatDetail && (() => {
                      const { apprenant: app, resultat: res } = evalResultatDetail;
                      const form = evalCorrectForms[app.id] || { note:"", commentaire:"" };
                      const sc = res.statut==="corrige" ? { bg:"#dcfce7", c:"#166534" }
                        : res.statut==="rendu"    ? { bg:"#dbeafe", c:"#1e40af" }
                        : res.statut==="en_retard"? { bg:"#fee2e2", c:"#991b1b" }
                        : { bg:"#f3f4f6", c:"#6b7280" };
                      const sl = res.statut==="corrige"?"✅ Corrigé":res.statut==="rendu"?"📥 Rendu":res.statut==="en_retard"?"⏰ En retard":"⏳ À rendre";
                      return (
                        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.55)", zIndex:3100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
                          onClick={()=>setEvalResultatDetail(null)}>
                          <div style={{ background:"#fff", borderRadius:16, width:"min(900px,92vw)", maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 60px rgba(0,0,0,0.3)" }}
                            onClick={e=>e.stopPropagation()}>
                            <div style={{ background:`linear-gradient(135deg,${BET},#0e4f6b)`, padding:"18px 24px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                              <div>
                                <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>{app.prenom} {app.nom}</div>
                                <span style={{ fontSize:11, padding:"3px 10px", borderRadius:10, fontWeight:700, background:sc.bg, color:sc.c, marginTop:4, display:"inline-block" }}>{sl}</span>
                              </div>
                              <button onClick={()=>setEvalResultatDetail(null)} style={{ background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", borderRadius:8, width:32, height:32, fontSize:16, cursor:"pointer" }}>✕</button>
                            </div>
                            <div style={{ padding:20 }}>
                              {/* Consigne du devoir - rappel des instructions et de la pièce jointe fournies
                                  au moment de la publication, indisponible jusqu'ici dans ce modal (le coach
                                  devait rouvrir/mémoriser le devoir lui-même pour se rappeler ce qui était
                                  demandé pendant qu'il corrige chaque rendu). */}
                              {(ev.instructions || ev.ressource_url) && (
                                <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
                                  <div style={{ fontSize:10, fontWeight:700, color:"#1d4ed8", textTransform:"uppercase", letterSpacing:.4, marginBottom:6 }}>📋 Consigne du devoir</div>
                                  {ev.instructions && (
                                    <div style={{ fontSize:13, color:"#1e3a8a", whiteSpace:"pre-wrap", marginBottom: ev.ressource_url ? 8 : 0 }}>{ev.instructions}</div>
                                  )}
                                  {ev.ressource_url && (
                                    <a href={ev.ressource_url} target="_blank" rel="noreferrer" style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:12, color:"#1d4ed8", fontWeight:700, textDecoration:"none", background:"#dbeafe", padding:"6px 12px", borderRadius:8 }}>
                                      📎 Voir la pièce jointe du devoir
                                    </a>
                                  )}
                                </div>
                              )}

                              {res.statut === "a_faire" && deadlinePassed && (
                                <div style={{ marginBottom:14, padding:"8px 12px", borderRadius:8, background:"#fef2f2", border:"1px solid #fecaca", display:"flex", alignItems:"center", gap:8 }}>
                                  <span style={{ fontSize:14 }}>⏰</span>
                                  <div style={{ flex:1 }}>
                                    <span style={{ fontSize:12, fontWeight:700, color:"#dc2626" }}>Non rendu - délai dépassé</span>
                                    <span style={{ fontSize:11, color:"#ef4444", marginLeft:8 }}>Note 0 attribuée automatiquement. Vous pouvez la modifier avant de valider.</span>
                                  </div>
                                </div>
                              )}

                              {res.statut !== "a_faire" && (
                                <div style={{ marginBottom:16 }}>
                                  {res.contenu_texte && (
                                    <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px", fontSize:13, color:"#374151", whiteSpace:"pre-wrap", maxHeight:200, overflowY:"auto", border:"1px solid #e2e8f0", marginBottom:10 }}>
                                      <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", marginBottom:4 }}>Réponse texte</div>
                                      {res.contenu_texte}
                                    </div>
                                  )}
                                  {res.fichier_url && (
                                    <a href={res.fichier_url} target="_blank" rel="noreferrer" style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:12, color:BET, fontWeight:600, textDecoration:"none", background:`${BET}10`, padding:"6px 12px", borderRadius:8, marginBottom:10 }}>
                                      📎 {res.fichier_nom || "Voir le fichier rendu"}
                                    </a>
                                  )}
                                  {res.reponses_qcm && Object.keys(res.reponses_qcm).length > 0 && (
                                    <div style={{ fontSize:12, color:"#6b7280", background:"#f8fafc", borderRadius:8, padding:"10px 12px", border:"1px solid #e2e8f0", marginBottom:10 }}>
                                      <div style={{ fontWeight:700, marginBottom:4 }}>QCM ({Object.keys(res.reponses_qcm).length} réponse{Object.keys(res.reponses_qcm).length>1?"s":""})</div>
                                      {Object.entries(res.reponses_qcm).map(([qi,rep])=>(
                                        <div key={qi}>Q{parseInt(qi)+1} : {rep}</div>
                                      ))}
                                    </div>
                                  )}
                                  {res.reponses_blocs && Object.keys(res.reponses_blocs).length > 0 && Array.isArray(ev.blocs) && (
                                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                                      {ev.blocs.map((b,bi)=>{
                                        const rep = res.reponses_blocs[b.id];
                                        if (!rep) return null;
                                        const BLOC_ICO = { qcm:"📋", listening:"🎬", audio:"🎧", quiz:"🎯", speaking:"🎤" };
                                        return (
                                          <div key={b.id} style={{ fontSize:12, color:"#6b7280", background:"#f8fafc", borderRadius:8, padding:"10px 12px", border:"1px solid #e2e8f0" }}>
                                            <div style={{ fontWeight:700, marginBottom:4 }}>{BLOC_ICO[b.type]||"📋"} Bloc {bi+1} · {b.type}</div>
                                            {b.type==="speaking"
                                              ? <>
                                                  {rep.audioUrl && <audio controls src={rep.audioUrl} style={{ width:"100%", marginBottom:6 }}/>}
                                                  <div style={{ whiteSpace:"pre-wrap" }}>{rep.texte || (!rep.audioUrl && <em>Aucune réponse</em>)}</div>
                                                </>
                                              : (b.questions||[]).map((q,qi)=>(
                                                  <div key={qi}>Q{qi+1} : {rep[qi] ?? <em>-</em>} {rep[qi] && rep[qi]===q.correct ? "✓" : rep[qi] ? "✗" : ""}</div>
                                                ))
                                            }
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}

                              {res.statut !== "a_faire" && (
                                <div>
                                  <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", marginBottom:6 }}>Correction</div>
                                  {Array.isArray(ev.blocs) && ev.blocs.some(b=>b.type==="speaking") && (
                                    <div style={{ marginBottom:8, padding:"8px 12px", borderRadius:8, background:"#fffbeb", border:"1px solid #fde68a", fontSize:11.5, color:"#92400e" }}>
                                      ℹ️ La note ci-dessous {res.note!=null ? <>est pré-remplie à <strong>{res.note}/{res.note_max||20}</strong>, calculée</> : "sera calculée"} uniquement sur les blocs QCM/Listening/Audio/Quiz - <strong>ajustez-la vous-même</strong> pour tenir compte de la réponse Speaking (lue ci-dessus), qui n'est jamais notée automatiquement.
                                    </div>
                                  )}
                                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                                    <input
                                      type="number" min="0" max="20" step="0.5"
                                      value={form.note}
                                      onChange={e=>setEvalCorrectForms(prev=>({...prev,[app.id]:{...form,note:e.target.value}}))}
                                      placeholder="Note /20"
                                      style={{ padding:"7px 10px", borderRadius:8, border:"1.5px solid #e5e7eb", fontSize:13, width:90, fontWeight:700 }}
                                    />
                                    <input
                                      type="text"
                                      value={form.commentaire}
                                      onChange={e=>setEvalCorrectForms(prev=>({...prev,[app.id]:{...form,commentaire:e.target.value}}))}
                                      placeholder="Commentaire (optionnel)"
                                      style={{ flex:1, padding:"7px 10px", borderRadius:8, border:"1.5px solid #e5e7eb", fontSize:13, minWidth:120 }}
                                    />
                                    <button onClick={()=>{ corrigerResultat(ev, app.id); setEvalResultatDetail(null); }} style={{ padding:"7px 14px", borderRadius:8, border:"none", background:BET, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
                                      {res.statut==="corrige"?"🔄 Mettre à jour":"✅ Valider"}
                                    </button>
                                  </div>
                                  {res.statut==="corrige" && res.note!==null && (
                                    <div style={{ marginTop:6, fontSize:12, color:"#374151" }}>
                                      Dernière note : <strong style={{ color:res.note>=10?"#059669":"#dc2626" }}>{res.note}/{res.note_max||20}</strong>
                                      {res.corrige_at && <span style={{ color:"#9ca3af", marginLeft:8 }}>- le {new Date(res.corrige_at).toLocaleDateString("fr-FR")}</span>}
                                    </div>
                                  )}
                                </div>
                              )}

                              {res.statut === "a_faire" && !deadlinePassed && (
                                <div style={{ textAlign:"center", padding:"30px 0", color:"#9ca3af" }}>
                                  <div style={{ fontSize:32, marginBottom:8 }}>⏳</div>
                                  <div style={{ fontSize:13 }}>L'apprenant n'a pas encore rendu ce travail.</div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    </>
                    );
                  })()}
                </div>
              );
            })()}

            {/* ════════ RESSOURCES ════════ */}
            {activeTab==="ressources" && (() => {
              const groupesStatutFiltresRess = groupes.filter(g =>
                filtreGroupeStatutRess === "tous" ? true :
                filtreGroupeStatutRess === "cloture" ? g.statut === "cloture" :
                g.statut !== "archive" && g.statut !== "cloture"
              );
              const groupesActifs = groupesStatutFiltresRess.filter(g => (rechercheClasseRess.trim()
                ? (g.nom||"").toLowerCase().includes(rechercheClasseRess.trim().toLowerCase())
                : true));
              const ressFiltered = ressources.filter(r =>
                (filtRessGroupe === null || r.groupe_id === filtRessGroupe) &&
                (filtRessType === "Tous" || r.type === filtRessType)
              );
              const classeSelectionnee = filtRessGroupe ? groupes.find(g => g.id === filtRessGroupe) : null;
              // Si la classe sélectionnée sort du filtre statut courant, on revient à "toutes"
              if (filtRessGroupe && !groupesStatutFiltresRess.some(g => g.id === filtRessGroupe)) {
                setTimeout(() => setFiltRessGroupe(null), 0);
              }

              return (
                <div>
                  {/* Header */}
                  <div style={tabHeader}>
                    <div>
                      <h2 style={tabTitle}>Ressources Pédagogiques</h2>
                      <p style={tabSubtitle}>{ressFiltered.length} ressource{ressFiltered.length!==1?"s":""} · {ressFiltered.filter(r=>r.partage).length} partagée{ressFiltered.filter(r=>r.partage).length!==1?"s":""}</p>
                    </div>
                    <button disabled={!peut("contenus_ressources","create")} title={permBtnTitle("Ajouter une ressource",peut("contenus_ressources","create"))} onClick={() => {
                      setRessForm(f => ({ ...f, groupe_ids: filtRessGroupe ? [filtRessGroupe] : (groupesActifs[0]?.id ? [groupesActifs[0].id] : []) }));
                      setShowAddRessModal(true);
                    }} style={permBtnStyle(btnPrimary,peut("contenus_ressources","create"))}>{peut("contenus_ressources","create")?"+":"🔒"} Ajouter une ressource</button>
                  </div>

                  {/* Filtre classe */}
                  <div style={{ marginBottom:16 }}>
                    <RangeePastilles accent={BET} valeur={filtreGroupeStatutRess} style={{ marginBottom:8 }}
                      onChange={(v)=>{ setFiltreGroupeStatutRess(v); setFiltRessGroupe(null); }}
                      options={[{ v:"actif", l:"🟢 Actives" }, { v:"cloture", l:"🔒 Terminées" }, { v:"tous", l:"Toutes" }]} />
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                      <input type="text" placeholder="🔍 Filtrer les classes…" value={rechercheClasseRess} onChange={e=>setRechercheClasseRess(e.target.value)}
                        style={{ ...inputSt, marginBottom:0, width:180 }} />
                      <select value={filtRessGroupe||""} onChange={e=>setFiltRessGroupe(e.target.value||null)}
                        style={{ ...inputSt, marginBottom:0, width:"auto", minWidth:220 }}>
                        <option value="">🏫 Toutes les classes ({ressources.length})</option>
                        {groupesActifs.map(g => {
                          const count = ressources.filter(r => r.groupe_id === g.id).length;
                          return <option key={g.id} value={g.id}>{g.nom} ({count}){g.statut==="cloture"?" · 🔒 Terminée":""}</option>;
                        })}
                      </select>
                    </div>
                  </div>

                  {/* Filtres type */}
                  <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
                    {["Tous",...Object.keys(TYPE_RESSOURCE)].map(t => {
                      const meta = TYPE_RESSOURCE[t];
                      return (
                        <button key={t} onClick={() => setFiltRessType(t)} style={{
                          padding:"5px 12px", borderRadius:20, border:"1px solid", fontSize:12, cursor:"pointer",
                          background: filtRessType===t ? (meta?.color||BET)+"15" : "#fff",
                          color: filtRessType===t ? (meta?.color||BET) : "#6b7280",
                          borderColor: filtRessType===t ? (meta?.color||BET) : "#e5e7eb",
                          fontWeight: filtRessType===t ? 700 : 400,
                        }}>{meta ? `${meta.icon} ${meta.label}` : "Tous"}</button>
                      );
                    })}
                  </div>

                  {/* Grille ressources */}
                  {ressFiltered.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"48px 0", color:"#9ca3af" }}>
                      <div style={{ fontSize:36, marginBottom:10 }}>📂</div>
                      <div style={{ fontSize:14, fontWeight:600 }}>Aucune ressource{classeSelectionnee ? ` pour la classe "${classeSelectionnee.nom}"` : ""}</div>
                      <div style={{ fontSize:12, marginTop:4 }}>Cliquez sur "+ Ajouter une ressource" pour commencer</div>
                    </div>
                  ) : (
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))", gap:12 }}>
                      {ressFiltered.map(r => {
                        const meta = TYPE_RESSOURCE[r.type] || { icon:"📎", label:r.type, color:"#6b7280" };
                        const groupeNom = r.groupe_id ? (groupes.find(g => g.id === r.groupe_id)?.nom || null) : null;
                        return (
                          <div key={r.id} style={{ borderRadius:10, border:"1px solid #e5e7eb", background:"#fff", padding:14 }}>
                            <div style={{ display:"flex", gap:10, marginBottom:10 }}>
                              <div style={{ width:40, height:40, borderRadius:8, background:meta.color+"15", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                                {meta.icon}
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontWeight:600, fontSize:13, lineHeight:1.4 }}>{r.titre}</div>
                                {groupeNom && <div style={{ fontSize:11, color:"#9ca3af" }}>🏫 {groupeNom}</div>}
                              </div>
                            </div>
                            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:10 }}>
                              <span style={{ padding:"2px 7px", borderRadius:6, background:meta.color+"12", color:meta.color, fontWeight:600 }}>{meta.icon} {meta.label}</span>
                              <span style={{ color:"#9ca3af" }}>{r.taille||r.duree}</span>
                            </div>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                              <span style={{ fontSize:11, padding:"2px 8px", borderRadius:6, background:r.partage?"#dcfce7":"#f3f4f6", color:r.partage?"#166534":"#6b7280", fontWeight:600 }}>
                                {r.partage?"✅ Partagé":"🔒 Privé"}
                              </span>
                              <div style={{ display:"flex", gap:6 }}>
                                {r.url && <a href={r.url} target="_blank" rel="noreferrer" style={{ padding:"4px 8px", borderRadius:6, background:"#f0f9ff", color:BET, border:"1px solid #bae6fd", fontSize:11, fontWeight:700, textDecoration:"none" }}>⬇ Ouvrir</a>}
                                <button onClick={async () => {
                                  const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
                                  const newVisible = !r.partage;
                                  setRessources(prev => prev.map(x => x.id===r.id ? {...x, partage: newVisible} : x));
                                  if (r.groupe_id && typeof r.id === "string") {
                                    await fetch(`${API_URL}/api/groupes/${r.groupe_id}/fichiers/${r.id}`, {
                                      method:"PATCH",
                                      headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
                                      body: JSON.stringify({ visible: newVisible }),
                                    }).catch(() => {});
                                  }
                                  toast.success(newVisible ? "Ressource partagée avec les étudiants" : "Ressource rendue privée");
                                }} style={btnIconToggle}>{r.partage?"🔒":"🔓"}</button>
                                <button onClick={() => openConfirm("Supprimer la ressource", "Cette ressource sera définitivement supprimée.", async () => {
                                  const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
                                  if (r.groupe_id && typeof r.id === "string") {
                                    const res = await fetch(`${API_URL}/api/groupes/${r.groupe_id}/fichiers/${r.id}`, {
                                      method:"DELETE",
                                      headers:{ Authorization:`Bearer ${token}` },
                                    });
                                    if (!res.ok) { toast.error("Erreur suppression"); return; }
                                  }
                                  setRessources(prev => prev.filter(x => x.id !== r.id));
                                  toast.success("Ressource supprimée");
                                })} style={btnIconDelete}>🗑️</button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}


            {/* ════════ MÉDIATHÈQUE ════════
                Un contenu, plusieurs classes. Le niveau « Cours » a été supprimé : il
                n'apportait qu'un titre et une couleur, imposait deux assistants de
                création et deux niveaux d'imbrication pour déposer un PDF. Le contenu est
                désormais l'unité de base, publiée vers autant de classes que voulu - ce
                qui rend inutile la duplication d'un module vers une autre classe. */}
            {activeTab==="modules_contenu" && (() => {
              const TYPE_META = {
                lecon: { label:"Leçon", emoji:"📖", bg:"#dbeafe", color:"#1e40af" },
                audio: { label:"Audio", emoji:"🎧", bg:"#ede9fe", color:"#6d28d9" },
                video: { label:"Vidéo", emoji:"🎬", bg:"#fee2e2", color:"#b91c1c" },
                quiz:  { label:"Quiz",  emoji:"❓", bg:"#cffafe", color:"#0e7490" },
              };
              const fpA = { padding:"6px 14px", borderRadius:99, fontSize:12, fontWeight:700, background:BET, color:"#fff", border:`1.5px solid ${BET}`, cursor:"pointer", whiteSpace:"nowrap" };
              const fp  = { padding:"6px 14px", borderRadius:99, fontSize:12, fontWeight:600, background:"#fff", color:"#374151", border:"1.5px solid #e5e7eb", cursor:"pointer", whiteSpace:"nowrap" };

              const classesDispo = groupes.filter(g => g.statut !== "archive");
              const nomDeClasse  = (id) => classesDispo.find(g => String(g.id) === String(id))?.nom || "Classe retirée";
              // Une classe clôturée garde ses contenus : l'apprenant y accède toujours, et
              // un coaching privé peut rouvrir. On les range à part plutôt que de les cacher.
              const classesActives   = classesDispo.filter(g => g.statut !== "cloture");
              const classesTerminees = classesDispo.filter(g => g.statut === "cloture");
              const classesAffichees = mediathFamille === "actives"   ? classesActives
                                     : mediathFamille === "terminees" ? classesTerminees
                                     : classesDispo;
              const idsFamille = new Set(classesAffichees.map(g => String(g.id)));

              const visibles = cours.filter(ct => {
                if (mediathFiltreCours !== "tous" && !(ct.groupe_ids || []).some(id => String(id) === String(mediathFiltreCours))) return false;
                // Filtre par famille : le contenu doit viser au moins une classe de la famille.
                if (mediathFamille !== "toutes" && !(ct.groupe_ids || []).some(id => idsFamille.has(String(id)))) return false;
                if (mediathStatut === "publie"    && ct.statut !== "publie")    return false;
                if (mediathStatut === "brouillon" && ct.statut !== "brouillon") return false;
                const q = (searchMediath || "").trim().toLowerCase();
                if (q && !`${ct.titre || ""}`.toLowerCase().includes(q)) return false;
                return true;
              });

              const nbPublies = cours.filter(c => c.statut === "publie").length;

              return (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

                  {/* En-tête */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                    <div>
                      <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:"#0f172a" }}>📚 Médiathèque</h2>
                      <div style={{ fontSize:12.5, color:"#6b7280", marginTop:3 }}>
                        {cours.length} contenu{cours.length>1?"s":""} · {nbPublies} publié{nbPublies>1?"s":""}
                      </div>
                    </div>
                    <button onClick={()=>openWizard()}
                      style={{ background:BET, color:"#fff", border:"none", borderRadius:8, padding:"10px 18px", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                      + Nouveau contenu
                    </button>
                  </div>

                  {/* Filtres */}
                  <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"14px 16px", display:"flex", flexDirection:"column", gap:10 }}>
                    <input value={searchMediath} onChange={e=>setSearchMediath(e.target.value)}
                      placeholder="Rechercher un contenu…"
                      style={{ padding:"8px 12px", borderRadius:8, border:"1px solid #e5e7eb", fontSize:13, outline:"none", maxWidth:320 }} />
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {[["toutes",`Toutes mes classes (${classesDispo.length})`],
                        ["actives",`✅ Actives (${classesActives.length})`],
                        ["terminees",`🔒 Terminées (${classesTerminees.length})`]]
                        .filter(([k]) => k !== "terminees" || classesTerminees.length > 0)
                        .map(([k,l]) => (
                          <button key={k} style={mediathFamille===k?fpA:fp}
                            onClick={()=>{ setMediathFamille(k); setMediathFiltreCours("tous"); }}>{l}</button>
                        ))}
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      <button style={mediathFiltreCours==="tous"?fpA:fp} onClick={()=>setMediathFiltreCours("tous")}>Toutes</button>
                      {classesAffichees.map(g => (
                        <button key={g.id} style={String(mediathFiltreCours)===String(g.id)?fpA:fp} onClick={()=>setMediathFiltreCours(g.id)}>
                          {g.statut === "cloture" ? "🔒 " : ""}{g.nom}
                        </button>
                      ))}
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {[["tous","Tous statuts"],["publie","✅ Publiés"],["brouillon","📝 Brouillons"]].map(([v,l]) => (
                        <button key={v} style={mediathStatut===v?fpA:fp} onClick={()=>setMediathStatut(v)}>{l}</button>
                      ))}
                    </div>
                  </div>

                  {/* Liste */}
                  {cours.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"56px 20px", border:"2px dashed #e5e7eb", borderRadius:14 }}>
                      <div style={{ fontSize:46, marginBottom:12 }}>📚</div>
                      <div style={{ fontWeight:700, fontSize:16, color:"#374151", marginBottom:6 }}>Votre médiathèque est vide</div>
                      <div style={{ fontSize:13, color:"#9ca3af", marginBottom:20 }}>
                        Déposez une leçon, un audio, une vidéo ou un quiz, et choisissez les classes qui le recevront.
                      </div>
                      <button onClick={()=>openWizard()}
                        style={{ background:BET, color:"#fff", border:"none", borderRadius:8, padding:"11px 24px", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                        + Créer mon premier contenu
                      </button>
                    </div>
                  ) : visibles.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"40px 20px", border:"2px dashed #e5e7eb", borderRadius:14, color:"#94a3b8", fontSize:13 }}>
                      Aucun contenu ne correspond à ces filtres.
                    </div>
                  ) : (
                    <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, overflow:"hidden" }}>
                      <div style={{ overflowX:"auto" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                          <thead>
                            <tr style={{ background:"#f8fafc" }}>
                              {["TYPE","TITRE","CLASSES","DURÉE","LU PAR","STATUT","ACTIONS"].map(h=>(
                                <th key={h} style={{ textAlign:"left", padding:"9px 12px", fontSize:10.5, fontWeight:800, color:"#94a3b8", letterSpacing:".05em", borderBottom:"1px solid #e5e7eb", whiteSpace:"nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {visibles.map((ct,i) => {
                              const tm = TYPE_META[ct.type_contenu] || { label:ct.type_contenu||"-", emoji:"📄", bg:"#f1f5f9", color:"#64748b" };
                              const ids = ct.groupe_ids || [];
                              const publie = ct.statut === "publie";
                              return (
                                <tr key={ct.id} style={{ background: i%2 ? "#fafafa" : "#fff" }}>
                                  <td style={{ padding:"9px 12px", borderBottom:"1px solid #f1f5f9", whiteSpace:"nowrap" }}>
                                    <span style={{ fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:999, background:tm.bg, color:tm.color }}>{tm.emoji} {tm.label}</span>
                                  </td>
                                  <td style={{ padding:"9px 12px", borderBottom:"1px solid #f1f5f9", fontWeight:700, color:"#0f172a" }}>{ct.titre}</td>
                                  <td style={{ padding:"9px 12px", borderBottom:"1px solid #f1f5f9" }}>
                                    {ids.length === 0 ? (
                                      <span style={{ fontSize:11.5, color:"#b45309", fontWeight:700 }}>Aucune classe - non diffusé</span>
                                    ) : (
                                      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                                        {ids.map(id => (
                                          <span key={id} style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:999, background:"#f1f5f9", color:"#475569" }}>{nomDeClasse(id)}</span>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding:"9px 12px", borderBottom:"1px solid #f1f5f9", whiteSpace:"nowrap", color:"#64748b" }}>{ct.dureeEstimee || 0} min</td>
                                  {/* Lu par - la donnée existait depuis toujours dans
                                      `contenus_lus`, mais rien ne la montrait au coach. */}
                                  <td style={{ padding:"9px 12px", borderBottom:"1px solid #f1f5f9", whiteSpace:"nowrap" }}>
                                    {!publie ? (
                                      <span style={{ color:"#cbd5e1", fontSize:11.5 }}>-</span>
                                    ) : (() => {
                                      const st = luParContenu[ct.id];
                                      if (!st) return <span style={{ color:"#cbd5e1", fontSize:11.5 }}>…</span>;
                                      const pct = st.total ? Math.round((st.lus / st.total) * 100) : 0;
                                      return (
                                        <button onClick={()=>ouvrirLecteurs(ct)} title="Voir qui a lu, et qui n'a pas encore ouvert"
                                          style={{ background:"none", border:"none", cursor:"pointer", padding:0, textAlign:"left" }}>
                                          <div style={{ fontSize:12, fontWeight:800, color: st.lus ? "#15803d" : "#b45309" }}>
                                            {st.lus}/{st.total}
                                          </div>
                                          <div style={{ width:56, height:4, borderRadius:99, background:"#e5e7eb", marginTop:3, overflow:"hidden" }}>
                                            <div style={{ width:`${pct}%`, height:"100%", background: st.lus ? "#15803d" : "#e5e7eb" }} />
                                          </div>
                                        </button>
                                      );
                                    })()}
                                  </td>
                                  <td style={{ padding:"9px 12px", borderBottom:"1px solid #f1f5f9", whiteSpace:"nowrap" }}>
                                    <span style={{ fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:999,
                                      background: publie ? "#dcfce7" : "#fef3c7", color: publie ? "#15803d" : "#b45309" }}>
                                      {publie ? "✅ Publié" : "📝 Brouillon"}
                                    </span>
                                  </td>
                                  <td style={{ padding:"9px 12px", borderBottom:"1px solid #f1f5f9", whiteSpace:"nowrap" }}>
                                    {/* Modifier - ouvre l'éditeur de blocs déjà existant. Son
                                        absence empêchait purement et simplement de reprendre
                                        un brouillon après création. */}
                                    {/* Même entrée que « 📥 Rendus » côté évaluations : un bouton
                                        explicite dans les actions. Le compteur de la colonne
                                        « Lu par » ouvre le même écran, mais rien ne signalait
                                        qu'il était cliquable. */}
                                    {publie && (
                                      <button onClick={()=>ouvrirLecteurs(ct)}
                                        title="Voir qui a lu, et qui n'a pas encore ouvert"
                                        style={{ marginRight:6, padding:"5px 11px", borderRadius:7, border:"1px solid #bbf7d0", background:"#f0fdf4", color:"#15803d", fontSize:11.5, fontWeight:700, cursor:"pointer" }}>
                                        👀 Lectures
                                      </button>
                                    )}
                                    <button onClick={()=>basculerSequentielContenu(ct)}
                                      title={ct.lecture_sequentielle
                                        ? "Lecture obligatoire - cliquez pour repasser en lecture libre"
                                        : "Rendre la lecture obligatoire : les cours publiés après celui-ci resteront fermés tant qu'il n'est pas terminé"}
                                      style={{ marginRight:6, padding:"5px 11px", borderRadius:7,
                                        border:`1px solid ${ct.lecture_sequentielle ? "#f59e0b" : "#e5e7eb"}`,
                                        background: ct.lecture_sequentielle ? "#fffbeb" : "#fff",
                                        color: ct.lecture_sequentielle ? "#b45309" : "#9ca3af",
                                        fontSize:11.5, fontWeight:700, cursor:"pointer" }}>
                                      {ct.lecture_sequentielle ? "🔒 Obligatoire" : "🔓 Libre"}
                                    </button>
                                    <button onClick={()=>openModuleBuilder(ct.id, ct.id, ct)}
                                      title="Modifier le contenu et ses parties"
                                      style={{ marginRight:6, padding:"5px 11px", borderRadius:7, border:`1px solid ${BET}55`, background:"#fff", color:BET, fontSize:11.5, fontWeight:700, cursor:"pointer" }}>
                                      ✏️ Modifier
                                    </button>
                                    <button onClick={()=>setConfirmContenu({ action: publie ? "depublier" : "publier", contenu: ct })}
                                      title={publie ? "Repasser en brouillon" : "Publier vers les classes choisies"}
                                      style={{ marginRight:6, padding:"5px 11px", borderRadius:7, border:"1px solid #e5e7eb", background:"#fff", fontSize:11.5, fontWeight:700, cursor:"pointer", color:"#374151" }}>
                                      {publie ? "Dépublier" : "Publier"}
                                    </button>
                                    <button onClick={()=>setConfirmContenu({ action:"supprimer", contenu: ct })}
                                      title="Supprimer ce contenu"
                                      style={{ padding:"5px 10px", borderRadius:7, border:"1px solid #fecaca", background:"#fff", color:"#b91c1c", fontSize:11.5, fontWeight:700, cursor:"pointer" }}>
                                      🗑
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Qui a lu - les DEUX listes comptent. Savoir que « 4 ont lu » n'aide pas
                      à relancer ; savoir QUI n'a pas ouvert, si. */}
                  {lecteursModal && (
                    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.55)", zIndex:9700, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
                         onClick={e=>{ if(e.target===e.currentTarget) setLecteursModal(null); }}>
                      <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:620, maxHeight:"85vh", overflowY:"auto", padding:24 }}>
                        <h3 style={{ margin:"0 0 4px", fontSize:16, fontWeight:800, color:"#0f172a" }}>👀 Lectures</h3>
                        <p style={{ margin:"0 0 18px", fontSize:12.5, color:"#6b7280" }}>{lecteursModal.contenu.titre}</p>

                        {lecteursModal.loading ? (
                          <div style={{ textAlign:"center", padding:32, color:"#94a3b8" }}>⏳ Chargement…</div>
                        ) : (() => {
                          const d = lecteursModal.data || { lecteurs:[], en_attente:[], lus:0, total:0 };
                          const pct = d.total ? Math.round((d.lus / d.total) * 100) : 0;
                          return (
                            <>
                              <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:"12px 14px", marginBottom:16 }}>
                                <div style={{ fontSize:20, fontWeight:900, color:"#0f172a" }}>{d.lus} / {d.total}</div>
                                <div style={{ fontSize:12, color:"#64748b", marginBottom:7 }}>apprenants ont marqué ce contenu comme terminé</div>
                                <div style={{ height:6, borderRadius:99, background:"#e5e7eb", overflow:"hidden" }}>
                                  <div style={{ width:`${pct}%`, height:"100%", background:"#15803d" }} />
                                </div>
                                <div style={{ fontSize:11, color:"#94a3b8", marginTop:7, lineHeight:1.5 }}>
                                  Déclaratif : l'apprenant clique lui-même. Ce n'est pas une mesure du temps passé.
                                </div>
                              </div>

                              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))", gap:14 }}>
                                <div>
                                  <div style={{ fontSize:11, fontWeight:800, color:"#15803d", marginBottom:7 }}>✅ ONT TERMINÉ ({d.lecteurs.length})</div>
                                  {d.lecteurs.length === 0 ? (
                                    <div style={{ fontSize:12, color:"#94a3b8", fontStyle:"italic" }}>Personne pour l'instant.</div>
                                  ) : d.lecteurs.map((l,i) => (
                                    <div key={i} style={{ padding:"7px 10px", borderRadius:8, background:"#f0fdf4", marginBottom:5 }}>
                                      <div style={{ fontSize:12.5, fontWeight:700, color:"#0f172a" }}>{l.nom}</div>
                                      <div style={{ fontSize:10.5, color:"#64748b" }}>
                                        {l.classe} · {l.lu_le ? new Date(l.lu_le).toLocaleDateString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : ""}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div>
                                  <div style={{ fontSize:11, fontWeight:800, color:"#b45309", marginBottom:7 }}>⏳ PAS ENCORE OUVERT ({d.en_attente.length})</div>
                                  {d.en_attente.length === 0 ? (
                                    <div style={{ fontSize:12, color:"#15803d", fontWeight:700 }}>Tout le monde a terminé 🎉</div>
                                  ) : d.en_attente.map((l,i) => (
                                    <div key={i} style={{ padding:"7px 10px", borderRadius:8, background:"#fffbeb", marginBottom:5 }}>
                                      <div style={{ fontSize:12.5, fontWeight:700, color:"#0f172a" }}>{l.nom}</div>
                                      <div style={{ fontSize:10.5, color:"#64748b" }}>{l.classe}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </>
                          );
                        })()}

                        <button onClick={()=>setLecteursModal(null)}
                          style={{ width:"100%", marginTop:18, padding:"10px 0", borderRadius:8, border:"1.5px solid #e2e8f0", background:"#fff", color:"#374151", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                          Fermer
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Confirmation - publier notifie tous les apprenants des classes visées,
                      et rien ne permet de rattraper un envoi. Le modal annonce donc la
                      portée réelle de l'action avant de la déclencher. */}
                  {confirmContenu && (() => {
                    const { action, contenu: ct } = confirmContenu;
                    const ids = ct.groupe_ids || [];
                    const noms = ids.map(nomDeClasse);
                    const cfg = {
                      publier:   { emoji:"📤", titre:"Publier ce contenu", couleur:"#15803d", bouton:"Publier maintenant" },
                      depublier: { emoji:"📥", titre:"Repasser en brouillon", couleur:"#b45309", bouton:"Dépublier" },
                      supprimer: { emoji:"🗑", titre:"Supprimer ce contenu", couleur:"#b91c1c", bouton:"Supprimer définitivement" },
                    }[action];
                    const lancer = () => {
                      if (action === "supprimer") supprimerContenu(ct);
                      else basculerPublicationContenu(ct, action === "publier" && envoyerEmailPub);
                      setConfirmContenu(null);
                      setEnvoyerEmailPub(false);
                    };
                    return (
                      <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.55)", zIndex:9700, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
                           onClick={e=>{ if(e.target===e.currentTarget) setConfirmContenu(null); }}>
                        <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:440, padding:24 }}>
                          <div style={{ fontSize:28, textAlign:"center", marginBottom:8 }}>{cfg.emoji}</div>
                          <h3 style={{ margin:"0 0 4px", fontSize:16, fontWeight:800, color:"#0f172a", textAlign:"center" }}>{cfg.titre}</h3>
                          <p style={{ margin:"0 0 16px", fontSize:13, color:"#6b7280", textAlign:"center" }}><strong>{ct.titre}</strong></p>

                          <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:"12px 14px", fontSize:12.5, color:"#374151", lineHeight:1.7 }}>
                            {action === "publier" && (
                              noms.length ? (
                                <>
                                  <div>Le contenu deviendra visible dans l'espace de&nbsp;:</div>
                                  <div style={{ display:"flex", gap:5, flexWrap:"wrap", margin:"7px 0" }}>
                                    {noms.map(n => <span key={n} style={{ fontSize:11.5, fontWeight:700, padding:"2px 9px", borderRadius:999, background:BET+"15", color:BET }}>{n}</span>)}
                                  </div>
                                  <div style={{ color:"#b45309", fontWeight:700 }}>Tous leurs apprenants recevront une notification - cet envoi n'est pas annulable.</div>
                                </>
                              ) : <div style={{ color:"#b91c1c", fontWeight:700 }}>Aucune classe destinataire : ajoutez-en une avant de publier.</div>
                            )}
                            {action === "depublier" && "Le contenu disparaîtra de l'espace des apprenants. Il est conservé en brouillon, et les notifications déjà envoyées ne sont pas retirées."}
                            {action === "supprimer" && "Le contenu et toutes ses parties seront supprimés définitivement. Cette action ne peut pas être annulée."}
                          </div>

                          {/* L'email ne part qu'UNE fois par contenu : republier après une
                              correction ne réécrit à personne. C'est ce qui rend la case sûre
                              à cocher - le coach n'a pas à craindre de spammer en hésitant. */}
                          {action === "publier" && noms.length > 0 && (
                            <label style={{ display:"flex", alignItems:"flex-start", gap:9, marginTop:14, padding:"11px 13px", borderRadius:10, border:`1.5px solid ${envoyerEmailPub?BET:"#e5e7eb"}`, background:envoyerEmailPub?BET+"0d":"#fff", cursor:"pointer" }}>
                              <input type="checkbox" checked={envoyerEmailPub} onChange={e=>setEnvoyerEmailPub(e.target.checked)} style={{ marginTop:2, cursor:"pointer" }} />
                              <span>
                                <span style={{ fontSize:12.5, fontWeight:700, color:"#0f172a" }}>✉️ Prévenir aussi par email</span>
                                <span style={{ display:"block", fontSize:11.5, color:"#64748b", marginTop:2, lineHeight:1.5 }}>
                                  Les apprenants <strong>et leurs parents</strong> recevront un email.
                                  Envoyé une seule fois : republier ce contenu n'en enverra pas d'autre.
                                </span>
                              </span>
                            </label>
                          )}

                          <div style={{ display:"flex", gap:10, marginTop:18 }}>
                            <button onClick={()=>{ setConfirmContenu(null); setEnvoyerEmailPub(false); }}
                              style={{ flex:1, padding:"10px 0", borderRadius:8, border:"1.5px solid #e2e8f0", background:"#fff", color:"#374151", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                              Annuler
                            </button>
                            <button onClick={lancer}
                              disabled={action === "publier" && !noms.length}
                              style={{ flex:1, padding:"10px 0", borderRadius:8, border:"none",
                                background:(action==="publier"&&!noms.length)?"#e5e7eb":cfg.couleur,
                                color:(action==="publier"&&!noms.length)?"#9ca3af":"#fff",
                                fontWeight:800, fontSize:13, cursor:(action==="publier"&&!noms.length)?"not-allowed":"pointer" }}>
                              {cfg.bouton}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* ════════ NOTIFICATIONS ════════ */}
            {activeTab==="notifs" && (
              <div style={{ padding:"24px 0" }}>
                <NotificationsTab userId={MON_PROFIL_REEL?.id} accentColor={BET} />
              </div>
            )}

            {/* ════════ MESSAGES ════════ */}
            {activeTab==="messages" && (
              <div>
                {/* Sous-onglets */}
                <div style={{ display:"flex", gap:0, marginBottom:14, borderBottom:"2px solid #e5e7eb" }}>
                  {[{ key:"prive", label:"💬 Messagerie privée", badge:0 },
                    { key:"groupe", label:"👥 Chat de classe", badge: msgGroupeNonLus },
                  // Les groupes LIBRES, ceux qui ne suivent pas une classe. Sans cet onglet, une
                  // personne ajoutée à un groupe recevait la notification sans avoir nulle part
                  // où ouvrir le fil - c'est ce qui a été constaté.
                    { key:"libre", label:"💬 Groupes", badge: groupesLibresNonLus }].map(t => (
                    <button key={t.key} onClick={() => setMsgSubTab(t.key)}
                      style={{ padding:"10px 20px", border:"none", borderBottom:msgSubTab===t.key?`2px solid ${BET}`:"2px solid transparent", marginBottom:-2, fontSize:13, fontWeight:600, cursor:"pointer", background:"transparent", color:msgSubTab===t.key?BET:"#64748b" }}>
                      {t.label}
                      {t.badge > 0 && (
                        <span style={{ marginLeft:7, display:"inline-block", minWidth:18, padding:"1px 6px", borderRadius:99, background:"#dc2626", color:"#fff", fontSize:10.5, fontWeight:800, lineHeight:"16px", textAlign:"center" }}>
                          {t.badge > 99 ? "99+" : t.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {msgSubTab==="prive" && <MessagerieTab accentColor={BET} profil={coachBase} token={localStorage.getItem("coach_token") || localStorage.getItem("admin_token")} />}

                {/* Le chat de classe vit dans Components/ChatGroupe : la commerciale et
                    l'onboarding montent exactement le même. */}
                {msgSubTab==="libre" && (
                  <GroupesLibres
                    profil={MON_PROFIL_REEL}
                    token={localStorage.getItem("coach_token") || localStorage.getItem("admin_token")}
                    accent={BET} accentClair={BET_LIGHT}
                  />
                )}

                {msgSubTab==="groupe" && (
                  <ChatGroupe
                    groupes={groupes}
                    profil={MON_PROFIL_REEL}
                    token={localStorage.getItem("coach_token") || localStorage.getItem("admin_token")}
                    accent={BET}
                    accentClair={BET_LIGHT}
                  />
                )}
              </div>
            )}

            {/* ════════ CONTRATS ════════ */}
            {activeTab==="groupes" && (
  <div>
      {/* ── En-tête + KPIs contrats ── */}
      {(() => {
        const grade       = coachMoi?.grade       || coachBase?.coach_info?.grade       || "Vacataire";
        const typeContrat = coachMoi?.type_contrat || coachBase?.coach_info?.type_contrat|| "Freelance";
        const tarifs      = GRILLE_TARIFAIRE[grade] || GRILLE_TARIFAIRE["Vacataire"];
        const contratsActifs = groupes.filter(g => g.statut === "actif");
        const totalApprenants = contratsActifs.reduce((s, g) => s + (g.nb_apprenants || 0), 0);

        const totalHSemaine = contratsActifs.reduce((s, g) => {
          const hor = Array.isArray(g.horaire) ? g.horaire : (typeof g.horaire==="string" ? (() => { try { return JSON.parse(g.horaire); } catch { return []; } })() : []);
          return s + calcHeureSemaine(hor);
        }, 0);
        const estimMensuel = contratsActifs.reduce((s, g) => {
          const hor = Array.isArray(g.horaire) ? g.horaire : (typeof g.horaire==="string" ? (() => { try { return JSON.parse(g.horaire); } catch { return []; } })() : []);
          const hSem = calcHeureSemaine(hor);
          const tarif = coachMoi?.taux_horaire || tarifs[g.type_cours] || tarifs["en_ligne"] || 5000;
          return s + (hSem * 4 * tarif);
        }, 0);

        return (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
              <div>
                <h2 style={{ margin:0, fontSize:17, fontWeight:800, color:"#0f172a" }}>📋 Mes Contrats</h2>
                <p style={{ margin:"3px 0 0", fontSize:13, color:"#9ca3af" }}>
                  {groupes.length} classe{groupes.length>1?"s":""} assignée{groupes.length>1?"s":""} · Grade : <strong style={{ color:BET }}>{grade}</strong> · Contrat : <strong style={{ color:BET }}>{typeContrat}</strong>
                </p>
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:24 }}>
              <div style={{ background:`linear-gradient(135deg,#0f172a,${BET})`, borderRadius:14, padding:"14px 16px", color:"#fff" }}>
                <div style={{ fontSize:10, opacity:0.75, fontWeight:700, letterSpacing:"0.06em", marginBottom:4 }}>CONTRATS ACTIFS</div>
                <div style={{ fontSize:24, fontWeight:900 }}>{contratsActifs.length}</div>
                <div style={{ fontSize:11, opacity:0.7, marginTop:2 }}>classe{contratsActifs.length>1?"s":""} en cours</div>
              </div>
              <div style={{ background:"linear-gradient(135deg,#059669,#10b981)", borderRadius:14, padding:"14px 16px", color:"#fff" }}>
                <div style={{ fontSize:10, opacity:0.75, fontWeight:700, letterSpacing:"0.06em", marginBottom:4 }}>APPRENANTS TOTAL</div>
                <div style={{ fontSize:24, fontWeight:900 }}>{totalApprenants}</div>
                <div style={{ fontSize:11, opacity:0.7, marginTop:2 }}>sur tous les contrats</div>
              </div>
              <div style={{ background:"linear-gradient(135deg,#7c3aed,#8b5cf6)", borderRadius:14, padding:"14px 16px", color:"#fff" }}>
                <div style={{ fontSize:10, opacity:0.75, fontWeight:700, letterSpacing:"0.06em", marginBottom:4 }}>HEURES / SEMAINE</div>
                <div style={{ fontSize:24, fontWeight:900 }}>{totalHSemaine.toFixed(1)}h</div>
                <div style={{ fontSize:11, opacity:0.7, marginTop:2 }}>≈ {(totalHSemaine * 4).toFixed(0)}h / mois</div>
              </div>
              <div style={{ background:"linear-gradient(135deg,#d97706,#f59e0b)", borderRadius:14, padding:"14px 16px", color:"#fff" }}>
                <div style={{ fontSize:10, opacity:0.75, fontWeight:700, letterSpacing:"0.06em", marginBottom:4 }}>RÉMUNÉRATION EST.</div>
                <div style={{ fontSize:20, fontWeight:900 }}>{new Intl.NumberFormat("fr-FR").format(Math.round(estimMensuel))} F</div>
                <div style={{ fontSize:11, opacity:0.7, marginTop:2 }}>estimation mensuelle</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Sous-onglets Groupes / Cours privés ── */}
      <div style={{ display:"flex", gap:8, marginBottom:20 }}>
        <button onClick={() => setContratSubTab("groupes")}
          style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 22px", borderRadius:10, border:`2px solid ${contratSubTab==="groupes" ? BET : "#e2e8f0"}`,
            background: contratSubTab==="groupes" ? BET : "#fff", color: contratSubTab==="groupes" ? "#fff" : "#374151",
            fontWeight:700, fontSize:13, cursor:"pointer", transition:"all .15s" }}>
          🏫 Groupes
          <span style={{ background: contratSubTab==="groupes" ? "rgba(255,255,255,0.25)" : "#f1f5f9", color: contratSubTab==="groupes" ? "#fff" : "#6b7280",
            borderRadius:20, padding:"1px 8px", fontSize:11, fontWeight:800 }}>{groupes.filter(g=>Number(g.capacite_max)!==1).length}</span>
        </button>
        <button onClick={() => {
            setContratSubTab("prives");
            // Rafraîchir la liste au clic pour voir les nouveaux apprenants sans reload
            const tok = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
            if (tok) {
              fetch(`${API_URL}/api/parcours/mes-apprenants-coach`, { headers: { Authorization: `Bearer ${tok}` } })
                .then(r => r.ok ? r.json() : { apprenants: [] })
                .then(d => setApprenantsPrive(d.apprenants || []))
                .catch(() => {});
            }
          }}
          style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 22px", borderRadius:10, border:`2px solid ${contratSubTab==="prives" ? BET : "#e2e8f0"}`,
            background: contratSubTab==="prives" ? BET : "#fff", color: contratSubTab==="prives" ? "#fff" : "#374151",
            fontWeight:700, fontSize:13, cursor:"pointer", transition:"all .15s" }}>
          🏠 Cours privés
          <span style={{ background: contratSubTab==="prives" ? "rgba(255,255,255,0.25)" : "#f1f5f9", color: contratSubTab==="prives" ? "#fff" : "#6b7280",
            borderRadius:20, padding:"1px 8px", fontSize:11, fontWeight:800 }}>{apprenantsPrive.length || groupes.filter(g=>Number(g.capacite_max)===1).length}</span>
        </button>
      </div>

      {groupesLoading && <p style={{ textAlign:"center", color:"#9ca3af", padding:40 }}>Chargement…</p>}

      {!groupesLoading && contratSubTab === "groupes" && groupes.length === 0 && (
        <div style={{ textAlign:"center", padding:"60px 20px", background:"#f8fafc", borderRadius:16, border:"1px solid #e5e7eb" }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
          <div style={{ fontWeight:700, fontSize:15, color:"#0f172a" }}>Aucun contrat assigné</div>
          <p style={{ color:"#9ca3af", fontSize:13 }}>L'assistante onboarding vous assignera des classes.</p>
        </div>
      )}

      {/* ── Tableau contrats ── */}
      {!groupesLoading && contratSubTab === "groupes" && (() => {
        const grade  = coachMoi?.grade || coachBase?.coach_info?.grade || "Vacataire";
        const tarifs = GRILLE_TARIFAIRE[grade] || GRILLE_TARIFAIRE["Vacataire"];
        const CPG = 10;

        const filtered = groupes.filter(g => {
          const q = contratSearch.toLowerCase();
          const matchSearch = !q || (g.nom||"").toLowerCase().includes(q) || (g.niveau||"").toLowerCase().includes(q) || (g.filiere||"").toLowerCase().includes(q);
          const matchStatut = contratFiltreStatut === "tous" || g.statut === contratFiltreStatut;
          const isPrivate = Number(g.capacite_max) === 1;
          return matchSearch && matchStatut && !isPrivate;
        }).sort((a, b) => {
          const da = new Date(a.date_debut || a.created_at || 0).getTime();
          const db = new Date(b.date_debut || b.created_at || 0).getTime();
          return contratSort === "desc" ? db - da : da - db;
        });
        const nPages = Math.max(1, Math.ceil(filtered.length / CPG));
        const safePg = Math.min(contratPage, nPages - 1);
        const page   = filtered.slice(safePg * CPG, (safePg + 1) * CPG);

        const thS = { padding:"11px 16px", fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.05em", background:"#f8fafc", borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap", textAlign:"left" };
        const tdS = { padding:"13px 16px", fontSize:13, color:"#374151", borderBottom:"1px solid #f1f5f9", verticalAlign:"middle" };

        return (
          <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e2e8f0", overflow:"hidden" }}>
            {/* Barre filtres */}
            <div style={{ display:"flex", gap:10, padding:"12px 16px", borderBottom:"1px solid #e2e8f0", flexWrap:"wrap", alignItems:"center" }}>
              <input
                value={contratSearch}
                onChange={e => { setContratSearch(e.target.value); setContratPage(0); }}
                placeholder="🔍 Rechercher un groupe, niveau, filière…"
                style={{ flex:1, minWidth:200, padding:"7px 12px", borderRadius:8, border:"1px solid #d1d5db", fontSize:12, outline:"none" }}
              />
              <RangeePastilles accent={BET} valeur={contratFiltreStatut} style={{ marginBottom:0 }}
                onChange={(v) => { setContratFiltreStatut(v); setContratPage(0); }}
                options={["tous","actif","suspendu","terminé","cloture"].map(k=>(
                  { v:k, l: k==="tous" ? "Tous" : k.charAt(0).toUpperCase()+k.slice(1) }
                ))}
                compte={(v)=> v==="tous" ? groupes.length : groupes.filter(g=>g.statut===v).length} />
              <button onClick={() => { setContratSort(s => s==="desc"?"asc":"desc"); setContratPage(0); }}
                title={contratSort==="desc" ? "Tri : plus récent en premier" : "Tri : plus ancien en premier"}
                style={{ padding:"6px 12px", borderRadius:20, fontSize:11, fontWeight:700, cursor:"pointer",
                  border:"1.5px solid #e2e8f0", background:"#f8fafc", color:"#64748b", whiteSpace:"nowrap" }}>
                {contratSort==="desc" ? "⬇ Plus récent" : "⬆ Plus ancien"}
              </button>
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af", fontSize:13 }}>
                {groupes.length === 0 ? "Aucun contrat assigné." : "Aucun résultat pour ces filtres."}
              </div>
            ) : (
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr>
                      <th style={thS}>Groupe</th>
                      <th style={thS}>Niveau / Filière</th>
                      <th style={thS}>Type</th>
                      <th style={{ ...thS, textAlign:"center" }}>Apprenants</th>
                      <th style={{ ...thS, textAlign:"center" }}>H/sem</th>
                      <th style={{ ...thS, textAlign:"center" }}>H/mois</th>
                      <th style={{ ...thS, textAlign:"right" }}>Tarif/h</th>
                      <th style={{ ...thS, textAlign:"right" }}>Rémun. estimée/mois</th>
                      <th style={{ ...thS, textAlign:"center" }}>Statut</th>
                      <th style={{ ...thS, textAlign:"center" }}>Séances</th>
                      <th style={{ ...thS, textAlign:"center" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.map((g, i) => {
                      const horaires = Array.isArray(g.horaire) ? g.horaire : (typeof g.horaire==="string" ? (() => { try { return JSON.parse(g.horaire); } catch { return []; } })() : []);
                      const hSem    = calcHeureSemaine(horaires);
                      const tarifH  = coachMoi?.taux_horaire || tarifs[g.type_cours] || tarifs["en_ligne"] || 5000;
                      const estimMois = hSem * 4 * tarifH;
                      const typeIcon  = g.type_cours==="en_ligne" ? "💻" : g.type_cours==="domicile" ? "🏠" : "🏢";
                      const typeLabel = g.type_cours==="en_ligne" ? "En ligne" : g.type_cours==="domicile" ? "Domicile" : "Présentiel";
                      const sCol = g.statut==="actif" ? { bg:"#d1fae5", c:"#059669" } : g.statut==="suspendu" ? { bg:"#fef3c7", c:"#d97706" } : g.statut==="cloture" ? { bg:"#fee2e2", c:"#dc2626" } : { bg:"#f1f5f9", c:"#6b7280" };
                      const sLabel = g.statut==="actif" ? "Actif" : g.statut==="suspendu" ? "Suspendu" : g.statut==="cloture" ? "🔒 Clôturée" : (g.statut||"-");
                      const isCloture = g.statut === "cloture";
                      return (
                        <tr key={g.id} style={{ background: isCloture ? "#f8f8f8" : i%2===0 ? "#fff" : "#fafbfc", cursor:"pointer", opacity: isCloture ? 0.75 : 1 }}
                          onClick={() => fetchGroupeDetail(g)}
                          onMouseEnter={e=>e.currentTarget.style.background=isCloture?"#f1f1f1":"#f0f9ff"}
                          onMouseLeave={e=>e.currentTarget.style.background=isCloture?"#f8f8f8":i%2===0?"#fff":"#fafbfc"}>
                          <td style={{ ...tdS, fontWeight:700, color: isCloture ? "#9ca3af" : BET }}>
                            {isCloture && <span style={{ marginRight:4 }}>🔒</span>}{g.nom}
                            {groupeIdsDelegues.has(g.id) && (
                              <span
                                title={delegationsRecues.find(d => d.groupe_id === g.id)?.absent_nom ? `Vous remplacez ${delegationsRecues.find(d => d.groupe_id === g.id).absent_nom}` : undefined}
                                style={{ marginLeft:6, padding:"2px 7px", borderRadius:8, fontSize:9, fontWeight:800, background:'#FEF3C7', color:'#92400E' }}>🔁 Remplacement</span>
                            )}
                          </td>
                          <td style={tdS}>{g.niveau||"-"}{g.filiere ? <span style={{ color:"#9ca3af" }}> · {g.filiere}</span> : ""}</td>
                          <td style={tdS}>{typeIcon} {typeLabel}</td>
                          <td style={{ ...tdS, textAlign:"center", fontWeight:700 }}>{g.nb_apprenants||0}</td>
                          <td style={{ ...tdS, textAlign:"center" }}>{hSem > 0 ? `${hSem.toFixed(1)}h` : "-"}</td>
                          <td style={{ ...tdS, textAlign:"center", color:"#6b7280" }}>{hSem > 0 ? `${(hSem*4).toFixed(0)}h` : "-"}</td>
                          <td style={{ ...tdS, textAlign:"right", color:"#374151" }}>{new Intl.NumberFormat("fr-FR").format(tarifH)} F</td>
                          <td style={{ ...tdS, textAlign:"right", fontWeight:800, color: estimMois>0 ? "#d97706" : "#9ca3af" }}>
                            {estimMois > 0 ? `${new Intl.NumberFormat("fr-FR").format(Math.round(estimMois))} F` : "-"}
                          </td>
                          <td style={{ ...tdS, textAlign:"center" }}>
                            <span style={{ padding:"3px 10px", borderRadius:20, fontSize:10, fontWeight:700, background:sCol.bg, color:sCol.c }}>{sLabel}</span>
                          </td>
                          <td style={{ ...tdS, textAlign:"center" }}>
                            {horaires.length > 0 ? (
                              <div style={{ display:"flex", flexWrap:"wrap", gap:3, justifyContent:"center" }}>
                                {horaires.map((h,j) => (
                                  <span key={j} style={{ padding:"2px 6px", borderRadius:5, background:"#f0f9ff", color:BET, fontSize:10, fontWeight:600, whiteSpace:"nowrap" }}>
                                    {h.jour} {h.debut}–{h.fin}
                                  </span>
                                ))}
                              </div>
                            ) : "-"}
                          </td>
                          <td style={{ ...tdS, textAlign:"center" }}>
                            <button onClick={() => fetchGroupeDetail(g)}
                              style={{ padding:"5px 12px", background:BET_LIGHT, color:BET, border:`1px solid ${BET}40`, borderRadius:7, fontSize:11, fontWeight:700, cursor:"pointer" }}>
                              👁 Voir
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {nPages > 1 && (
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", borderTop:"1px solid #e2e8f0", background:"#f8fafc" }}>
                <span style={{ fontSize:11, color:"#94a3b8" }}>
                  Page {safePg+1}/{nPages} · {safePg*CPG+1}–{Math.min((safePg+1)*CPG, filtered.length)} sur {filtered.length} contrat{filtered.length>1?"s":""}
                </span>
                <div style={{ display:"flex", gap:5 }}>
                  <button onClick={()=>setContratPage(p=>Math.max(0,p-1))} disabled={safePg===0}
                    style={{ padding:"4px 12px", border:"1px solid #e2e8f0", borderRadius:7, fontSize:12, fontWeight:700, cursor:safePg===0?"not-allowed":"pointer", background:safePg===0?"#f1f5f9":"#fff", color:safePg===0?"#cbd5e1":"#374151" }}>‹</button>
                  {Array.from({length:nPages},(_,idx)=>(
                    <button key={idx} onClick={()=>setContratPage(idx)}
                      style={{ padding:"4px 10px", border:`1.5px solid ${safePg===idx?BET:"#e2e8f0"}`, borderRadius:7, fontSize:12, fontWeight:700, cursor:"pointer", background:safePg===idx?BET:"#fff", color:safePg===idx?"#fff":"#374151" }}>{idx+1}</button>
                  ))}
                  <button onClick={()=>setContratPage(p=>Math.min(nPages-1,p+1))} disabled={safePg===nPages-1}
                    style={{ padding:"4px 12px", border:"1px solid #e2e8f0", borderRadius:7, fontSize:12, fontWeight:700, cursor:safePg===nPages-1?"not-allowed":"pointer", background:safePg===nPages-1?"#f1f5f9":"#fff", color:safePg===nPages-1?"#cbd5e1":"#374151" }}>›</button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Cours privés (apprenants assignés par le PA) ── */}
      {contratSubTab === "prives" && (() => {
        // Groupes privés déjà dans la liste (capacite_max=1) - fallback si mes-apprenants-coach vide
        const groupesPrives = groupes.filter(g => Number(g.capacite_max) === 1);
        const privesDepuisGroupes = groupesPrives.flatMap(g => {
          const appsGroupe = etudiants.filter(e => e.groupe_id === g.id || e.coursIds?.includes(g.id));
          if (appsGroupe.length === 0) {
            // Groupe privé sans apprenant encore ajouté - afficher quand même le groupe
            return [{
              id: `g-${g.id}`, _type:"prive_groupe", _groupe_id: g.id,
              prospect_nom:  g.nom?.replace(/^Coaching privé\s*[\u2014-]\s*/i,"") || g.nom,
              prospect_email:"", prospect_telephone:"",
              statut: g.statut, routing_statut: "onboarding_affecte",
              formation: g.filiere || "Cours privé",
              niveau: g.niveau || "",
              lieu: g.type_cours === "domicile" ? "domicile" : g.type_cours === "centre" ? "cabinet" : "prive",
              disponibilites: { horaires: g.horaire || [] },
              groupe_nom: g.nom, _horaire: g.horaire,
            }];
          }
          return appsGroupe.map(e => ({
            // e.assignation_id (lien direct posé à la création de la classe privée, cf.
            // groupes_apprenants.note) est l'identifiant fiable pour enregistrer séances/
            // présences - sans lui, l'id synthétique "g-…" ci-dessous n'est pas une
            // assignation réelle et tout POST vers /api/seances-privees ou
            // /api/presences-privees avec cet id échoue silencieusement.
            id: e.assignation_id || `g-${g.id}-${e.id}`,
            _type:"prive_groupe", _groupe_id: g.id,
            prospect_nom:  e.nom || `${e.prenom_apprenant||""} ${e.nom_apprenant||""}`.trim() || g.nom,
            prospect_email: e.email || e.email_apprenant || "",
            prospect_telephone: e.telephone || "",
            statut: g.statut, routing_statut: "onboarding_affecte",
            formation: g.filiere || "Cours privé",
            niveau: g.niveau || e.niveau || "",
            lieu: g.type_cours === "domicile" ? "domicile" : g.type_cours === "centre" ? "cabinet" : "prive",
            disponibilites: { horaires: g.horaire || [] },
            groupe_nom: g.nom, _horaire: g.horaire,
          }));
        });
        // Fusionner en dédupliquant par assignation_id réelle en priorité (fiable), puis par
        // email en repli pour les anciennes classes créées avant le lien assignation_id -
        // dédupliquer par email seul ratait les cas où prospect_email (le parent) diffère de
        // email_apprenant (l'enfant), affichant l'apprenant en double avec un id synthétique.
        const idsPrives    = new Set(apprenantsPrive.map(a=>a.id));
        const emailsPrives = new Set(apprenantsPrive.map(a=>(a.prospect_email||"").toLowerCase()).filter(Boolean));
        const privesGroupesExtra = privesDepuisGroupes.filter(a =>
          !idsPrives.has(a.id) && (!a.prospect_email || !emailsPrives.has(a.prospect_email.toLowerCase()))
        );
        const allPrives = [...apprenantsPrive, ...privesGroupesExtra].sort((a, b) => {
          const da = new Date(a.created_at || 0).getTime();
          const db = new Date(b.created_at || 0).getTime();
          return contratSort === "desc" ? db - da : da - db;
        });

        if (allPrives.length === 0) return (
          <div style={{ textAlign:"center", padding:"60px 20px", background:"#f8fafc", borderRadius:16, border:"1px solid #e5e7eb" }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🏠</div>
            <div style={{ fontWeight:700, fontSize:15, color:"#0f172a" }}>Aucun cours privé assigné</div>
            <p style={{ color:"#9ca3af", fontSize:13 }}>L'assistante onboarding vous assignera des apprenants en cours individuel.</p>
          </div>
        );

        const PPG = 8;
        const priveFiltered = allPrives.filter(a => {
          const q = priveSearch.toLowerCase();
          return !q
            || (a.prospect_nom||"").toLowerCase().includes(q)
            || (a.formation||"").toLowerCase().includes(q)
            || (a.niveau||"").toLowerCase().includes(q)
            || (a.prospect_email||"").toLowerCase().includes(q);
        });
        const priveNPages = Math.max(1, Math.ceil(priveFiltered.length / PPG));
        const priveSafePg = Math.min(privePage, priveNPages - 1);
        const privePaged  = priveFiltered.slice(priveSafePg * PPG, (priveSafePg + 1) * PPG);
        const thP = { padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em", background:"#f8fafc", borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap" };
        const tdP = { padding:"12px 14px", borderBottom:"1px solid #f1f5f9", verticalAlign:"middle" };

        return (
          <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e2e8f0", overflow:"hidden", marginTop:8 }}>
            {/* Header + search */}
            <div style={{ padding:"12px 16px", borderBottom:"1px solid #e2e8f0", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, flex:1 }}>
                <span style={{ fontSize:16 }}>🏠</span>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:"#0f172a" }}>Cours privés assignés</div>
                  <div style={{ fontSize:12, color:"#9ca3af" }}>
                    {priveFiltered.length}/{allPrives.length} apprenant{allPrives.length>1?"s":""} · Coaching individuel
                  </div>
                </div>
              </div>
              <input
                value={priveSearch}
                onChange={e => { setPriveSearch(e.target.value); setPrivePage(0); }}
                placeholder="🔍 Nom, formation, niveau…"
                style={{ width:220, padding:"7px 12px", borderRadius:8, border:"1px solid #d1d5db", fontSize:12, outline:"none" }}
              />
              <button onClick={() => { setContratSort(s => s==="desc"?"asc":"desc"); setPrivePage(0); }}
                title={contratSort==="desc" ? "Tri : plus récent en premier" : "Tri : plus ancien en premier"}
                style={{ padding:"6px 12px", borderRadius:20, fontSize:11, fontWeight:700, cursor:"pointer",
                  border:"1.5px solid #e2e8f0", background:"#f8fafc", color:"#64748b", whiteSpace:"nowrap" }}>
                {contratSort==="desc" ? "⬇ Plus récent" : "⬆ Plus ancien"}
              </button>
            </div>

            {priveFiltered.length === 0 ? (
              <div style={{ textAlign:"center", padding:"32px 0", color:"#9ca3af", fontSize:13 }}>
                Aucun apprenant pour cette recherche.
              </div>
            ) : (
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead>
                    <tr>
                      <th style={thP}>#</th>
                      <th style={thP}>Apprenant</th>
                      <th style={thP}>Contact</th>
                      <th style={thP}>Formation</th>
                      <th style={thP}>Niveau</th>
                      <th style={thP}>Type</th>
                      <th style={thP}>Lieu</th>
                      <th style={thP}>Disponibilités</th>
                      <th style={{ ...thP, textAlign:"center" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {privePaged.map((a, idx) => {
                      const globalIdx = priveSafePg * PPG + idx;
                      const _d = a.disponibilites || {};
                      const horairesList = Array.isArray(_d.horaires) && _d.horaires.length > 0
                        ? _d.horaires
                        : [];
                      const joursLegacy = horairesList.length === 0
                        ? [...(_d.jours||[]), ...(_d.creneaux||[])]
                        : [];
                      return (
                        <tr key={a.id}
                          style={{ background: globalIdx%2===0?"#fff":"#fafafa", cursor:"pointer", transition:"background .15s" }}
                          onMouseEnter={e => e.currentTarget.style.background = BET+"0d"}
                          onMouseLeave={e => e.currentTarget.style.background = globalIdx%2===0?"#fff":"#fafafa"}>
                          <td style={{ ...tdP, color:"#94a3b8", fontSize:11, fontWeight:600, width:36 }}>{globalIdx+1}</td>
                          <td style={{ ...tdP, fontWeight:700, color:"#0f172a", cursor:"pointer" }} onClick={() => setSelectedPrive(a)}>
                            {a.prospect_nom || "-"}
                          </td>
                          <td style={{ ...tdP, color:"#64748b", fontSize:12 }}>
                            {a.prospect_email    && <div>{a.prospect_email}</div>}
                            {a.prospect_telephone && <div>{a.prospect_telephone}</div>}
                          </td>
                          <td style={{ ...tdP, color:"#374151" }}>{a.formation || "-"}</td>
                          <td style={tdP}>
                            {a.niveau && a.niveau !== "-"
                              ? <span style={{ padding:"2px 9px", borderRadius:99, fontSize:11, fontWeight:700, background:BET+"18", color:BET }}>{a.niveau}</span>
                              : <span style={{ color:"#d1d5db" }}>-</span>}
                          </td>
                          <td style={{ ...tdP, color:"#64748b" }}>
                            {a.type_coaching === "intensive" ? "⚡ Intensive" : "📘 Classique"}
                          </td>
                          <td style={tdP}>
                            <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                              <span style={{ padding:"2px 9px", borderRadius:99, fontSize:11, fontWeight:700, width:"fit-content",
                                background: a.lieu === "domicile" ? "#fef3c7" : "#e0f2fe",
                                color:      a.lieu === "domicile" ? "#d97706"  : "#0369a1" }}>
                                {a.lieu === "domicile" ? "🏠 Domicile" : "🏢 Cabinet"}
                              </span>
                              {a.lieu === "domicile" && a.adresse_coaching && (
                                <span style={{ fontSize:11, color:"#64748b", fontStyle:"italic" }}>📍 {a.adresse_coaching}</span>
                              )}
                              {a.lieu === "cabinet" && a.centre_coaching && (
                                <span style={{ fontSize:11, color:"#0369a1", fontWeight:600 }}>🏫 {a.centre_coaching}</span>
                              )}
                            </div>
                          </td>
                          <td style={tdP}>
                            {horairesList.length > 0
                              ? <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                                  {horairesList.map((h,i) => <span key={i} style={{ padding:"2px 7px", borderRadius:6, fontSize:10, fontWeight:600, background:"#ede9fe", color:"#7c3aed", whiteSpace:"nowrap" }}>{h.jour} {h.debut}</span>)}
                                </div>
                              : joursLegacy.length > 0
                              ? <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                                  {joursLegacy.map(j => <span key={j} style={{ padding:"2px 7px", borderRadius:6, fontSize:10, fontWeight:600, background:"#ede9fe", color:"#7c3aed", whiteSpace:"nowrap" }}>{j}</span>)}
                                </div>
                              : <span style={{ color:"#d1d5db", fontSize:12 }}>Non renseigné</span>}
                          </td>
                          <td style={{ ...tdP, textAlign:"center" }}>
                            <div style={{ display:"flex", flexDirection:"column", gap:4, alignItems:"center" }}>
                              {a.routing_statut === "onboarding_en_attente" && (
                                <span style={{ padding:"2px 8px", borderRadius:99, fontSize:10, fontWeight:700, background:"#fef3c7", color:"#d97706", border:"1px solid #fde68a", whiteSpace:"nowrap" }}>
                                  ⏳ En attente planning
                                </span>
                              )}
                              <button onClick={() => setSelectedPrive(a)}
                                style={{ padding:"5px 12px", background:BET+"15", color:BET, border:`1px solid ${BET}40`, borderRadius:7, fontSize:11, fontWeight:700, cursor:"pointer" }}>
                                👁 Voir
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {priveNPages > 1 && (
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", borderTop:"1px solid #e2e8f0", background:"#f8fafc" }}>
                <span style={{ fontSize:11, color:"#94a3b8" }}>
                  Page {priveSafePg+1}/{priveNPages} · {priveSafePg*PPG+1}–{Math.min((priveSafePg+1)*PPG, priveFiltered.length)} sur {priveFiltered.length}
                </span>
                <div style={{ display:"flex", gap:5 }}>
                  <button onClick={() => setPrivePage(p => Math.max(0, p-1))} disabled={priveSafePg===0}
                    style={{ padding:"4px 12px", border:"1px solid #e2e8f0", borderRadius:7, fontSize:12, fontWeight:700,
                      cursor: priveSafePg===0?"not-allowed":"pointer",
                      background: priveSafePg===0?"#f1f5f9":"#fff",
                      color: priveSafePg===0?"#cbd5e1":"#374151" }}>‹</button>
                  {Array.from({ length: priveNPages }, (_, i) => (
                    <button key={i} onClick={() => setPrivePage(i)}
                      style={{ padding:"4px 10px", border:`1.5px solid ${priveSafePg===i ? BET : "#e2e8f0"}`, borderRadius:7, fontSize:12, fontWeight:700, cursor:"pointer",
                        background: priveSafePg===i ? BET : "#fff",
                        color:      priveSafePg===i ? "#fff" : "#374151" }}>{i+1}</button>
                  ))}
                  <button onClick={() => setPrivePage(p => Math.min(priveNPages-1, p+1))} disabled={priveSafePg===priveNPages-1}
                    style={{ padding:"4px 12px", border:"1px solid #e2e8f0", borderRadius:7, fontSize:12, fontWeight:700,
                      cursor: priveSafePg===priveNPages-1?"not-allowed":"pointer",
                      background: priveSafePg===priveNPages-1?"#f1f5f9":"#fff",
                      color: priveSafePg===priveNPages-1?"#cbd5e1":"#374151" }}>›</button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Modal détail cours privé ── */}
      {selectedPrive && (() => {
        const a = selectedPrive;
        const _sd = a.disponibilites || {};
        const horairesModal = Array.isArray(_sd.horaires) && _sd.horaires.length > 0
          ? _sd.horaires
          : [];
        const joursLegacyModal = horairesModal.length === 0
          ? [...(_sd.jours||[]), ...(_sd.creneaux||[])]
          : [];
        const ini = (a.prospect_nom||"?").split(" ").map(x=>x[0]).slice(0,2).join("").toUpperCase();
        const PTABS = [
          { id:"infos",        label:"📋 Infos" },
          { id:"disponibilites", label:"📅 Planning" },
          { id:"presences",    label:"✅ Présences" },
          { id:"seances",      label:"📆 Séances" },
          { id:"fichiers",     label:"📎 Fichiers" },
        ];
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:10000, padding:16 }}
            onClick={() => { setSelectedPrive(null); setPriveTab("infos"); setShowSeanceForm(false); setShowPresenceForm(false); setSeancesPrivees([]); setPresencesPrivees([]); setFichiersPrives([]); }}>
            <div style={{ background:"#fff", borderRadius:18, width:"90vw", height:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 24px 64px rgba(0,0,0,.25)" }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div style={{ background:BET_GRAD, padding:"20px 24px", borderRadius:"18px 18px 0 0", display:"flex", alignItems:"center", gap:14, position:"relative", flexShrink:0 }}>
                <button onClick={() => { setSelectedPrive(null); setPriveTab("infos"); setShowSeanceForm(false); setShowPresenceForm(false); setSeancesPrivees([]); setPresencesPrivees([]); setFichiersPrives([]); }}
                  style={{ position:"absolute", top:14, right:14, background:"rgba(255,255,255,0.2)", border:"none", color:"#fff", width:30, height:30, borderRadius:"50%", cursor:"pointer", fontSize:16 }}>✕</button>
                <div style={{ width:48, height:48, borderRadius:"50%", background:"rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:17, color:"#fff", flexShrink:0 }}>{ini}</div>
                <div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,.6)", fontWeight:600, textTransform:"uppercase", letterSpacing:".06em" }}>🏠 Cours privé</div>
                  <div style={{ fontSize:18, fontWeight:800, color:"#fff" }}>{a.prospect_nom || "-"}</div>
                  {a.niveau && a.niveau !== "-" && (
                    <span style={{ fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:99, background:"rgba(255,255,255,0.2)", color:"#fff" }}>{a.niveau}</span>
                  )}
                </div>
              </div>

              {/* Onglets */}
              <div style={{ display:"flex", borderBottom:"1px solid #e2e8f0", background:"#fff", flexShrink:0, overflowX:"auto" }}>
                {PTABS.map(t => (
                  <button key={t.id} onClick={() => setPriveTab(t.id)}
                    style={{ flex:1, minWidth:80, padding:"11px 10px", border:"none", borderBottom: priveTab===t.id ? `2.5px solid ${BET}` : "2.5px solid transparent",
                      background:"transparent", cursor:"pointer", fontSize:12, fontWeight: priveTab===t.id ? 800 : 500,
                      color: priveTab===t.id ? BET : "#64748b", transition:"all .15s", whiteSpace:"nowrap" }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Corps scrollable */}
              <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>

                {/* ── Onglet Infos ── */}
                {priveTab === "infos" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

                    {/* CE QUE L'APPRENANT ATTEND, en tête et avant la formation.
                        Le coach de groupe l'avait déjà sur sa fiche ; le coach d'un apprenant
                        PRIVÉ ne l'avait nulle part - alors que c'est en privé que le contenu
                        des séances se décide séance par séance, donc là que l'objectif sert
                        le plus. La route serveur ne l'envoyait même pas : corrigé le même jour
                        dans parcours.js (/mes-apprenants-coach). */}
                    {a.objectif_client && (
                      <div style={{ background:"#f5f3ff", border:"1.5px solid #ddd6fe",
                        borderRadius:12, padding:"13px 16px" }}>
                        <div style={{ fontSize:10.5, fontWeight:800, color:"#6d28d9",
                          letterSpacing:".06em", marginBottom:5 }}>
                          🎯 CE QUE L'APPRENANT ATTEND
                        </div>
                        <div style={{ fontSize:13.5, lineHeight:1.65, color:"#0f172a", whiteSpace:"pre-wrap" }}>
                          {a.objectif_client}
                        </div>
                      </div>
                    )}

                    {/* Formation suivie */}
                    <div style={{ background:"linear-gradient(135deg,#f5f3ff,#ede9fe)", borderRadius:12, padding:"16px 18px", border:"1.5px solid #c4b5fd" }}>
                      <div style={{ fontSize:10, fontWeight:700, color:BET, textTransform:"uppercase", letterSpacing:".06em", marginBottom:8 }}>📚 Formation suivie</div>
                      <div style={{ fontSize:16, fontWeight:900, color:"#0f172a" }}>{a.formation || "Cours privés"}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8, flexWrap:"wrap" }}>
                        {a.niveau && a.niveau !== "-" && (
                          <span style={{ fontSize:12, fontWeight:800, padding:"3px 12px", borderRadius:999, background:BET, color:"#fff" }}>Niveau {a.niveau}</span>
                        )}
                        {a.nb_seances && (
                          <span style={{ fontSize:12, fontWeight:700, color:BET, background:BET+"18", padding:"3px 10px", borderRadius:999 }}>📅 {a.nb_seances} mois</span>
                        )}
                        {a.type_coaching && (
                          <span style={{ fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:999, background:"#f1f5f9", color:"#374151" }}>
                            {a.type_coaching === "intensive" ? "⚡ Intensive" : "📘 Classique"}
                          </span>
                        )}
                      </div>
                      <div style={{ marginTop:10, display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:999,
                          background: a.lieu === "domicile" ? "#fef3c7" : "#e0f2fe",
                          color:      a.lieu === "domicile" ? "#d97706"  : "#0369a1" }}>
                          {a.lieu === "domicile" ? "🏠 À domicile" : "🏢 Au cabinet"}
                        </span>
                        {a.lieu === "domicile" && a.adresse_coaching && (
                          <span style={{ fontSize:11, color:"#374151" }}>📍 {a.adresse_coaching}</span>
                        )}
                        {a.lieu === "cabinet" && a.centre_coaching && (
                          <span style={{ fontSize:11, fontWeight:700, color:"#0369a1" }}>🏫 {a.centre_coaching}</span>
                        )}
                      </div>
                      {a.cout_formation && (
                        <div style={{ marginTop:14, paddingTop:12, borderTop:"1px solid #ddd6fe", display:"flex", flexDirection:"column", gap:2 }}>
                          <div style={{ fontSize:11, color:"#7c3aed", fontWeight:700, textTransform:"uppercase", letterSpacing:".04em" }}>Coût total de la formation</div>
                          <div style={{ fontSize:22, fontWeight:900, color:"#0f172a" }}>
                            {Number(a.cout_formation).toLocaleString("fr-FR")} <span style={{ fontSize:13, color:"#6b7280", fontWeight:600 }}>FCFA</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Contact */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                      {[
                        ["📧 Email",     a.prospect_email     || "-"],
                        ["📞 Téléphone", a.prospect_telephone || "-"],
                      ].map(([l,v]) => (
                        <div key={l} style={{ background:"#f8fafc", borderRadius:9, padding:"10px 13px", border:"1px solid #e2e8f0" }}>
                          <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", marginBottom:3 }}>{l}</div>
                          <div style={{ fontSize:13, fontWeight:600, color:"#0f172a" }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Disponibilités */}
                    <div style={{ background:"#f8fafc", borderRadius:10, padding:"13px 15px", border:"1px solid #e2e8f0" }}>
                      <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".05em", marginBottom:8 }}>📅 Créneaux de disponibilité</div>
                      {horairesModal.length > 0 ? (
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          {horairesModal.map((h,i) => (
                            <span key={i} style={{ padding:"4px 10px", borderRadius:8, fontSize:12, fontWeight:600, background:"#ede9fe", color:"#7c3aed" }}>{h.jour} {h.debut}</span>
                          ))}
                        </div>
                      ) : joursLegacyModal.length > 0 ? (
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          {joursLegacyModal.map(j => (
                            <span key={j} style={{ padding:"4px 10px", borderRadius:8, fontSize:12, fontWeight:600, background:"#ede9fe", color:"#7c3aed" }}>{j}</span>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize:12, color:"#9ca3af" }}>Aucun créneau renseigné</div>
                      )}
                    </div>

                  </div>
                )}

                {/* ── Onglet Disponibilités / Planning ── */}
                {priveTab === "disponibilites" && (() => {
                  const dispo    = a.disponibilites || {};
                  const horairesTab = Array.isArray(dispo.horaires) && dispo.horaires.length > 0 ? dispo.horaires : [];
                  const joursDisp = horairesTab.length > 0
                    ? [...new Set(horairesTab.map(h => h.jour))]
                    : Array.isArray(dispo.jours) ? dispo.jours : [];
                  const creneaux  = horairesTab.length > 0 ? [] : Array.isArray(dispo.creneaux) ? dispo.creneaux : [];
                  const ALL_JOURS = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
                  const lieuLabel = a.lieu === "domicile" ? "🏠 À domicile" : a.lieu === "cabinet" ? "🏢 Au cabinet" : a.lieu || "-";
                  const lieuColor = a.lieu === "domicile" ? { bg:"#fef3c7", color:"#d97706", border:"#fcd34d" } : { bg:"#e0f2fe", color:"#0369a1", border:"#7dd3fc" };
                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

                      {/* Lieu */}
                      <div style={{ borderRadius:12, padding:"16px 18px", background:lieuColor.bg, border:`1.5px solid ${lieuColor.border}` }}>
                        <div style={{ fontSize:10, fontWeight:700, color:lieuColor.color, textTransform:"uppercase", letterSpacing:".06em", marginBottom:6 }}>Lieu du cours</div>
                        <div style={{ fontSize:17, fontWeight:800, color:"#0f172a" }}>{lieuLabel}</div>
                        {a.lieu === "domicile" && a.adresse_coaching && (
                          <div style={{ marginTop:6, fontSize:13, color:"#374151" }}>📍 {a.adresse_coaching}</div>
                        )}
                        {a.lieu === "cabinet" && a.centre_coaching && (
                          <div style={{ marginTop:6, fontSize:13, fontWeight:700, color:lieuColor.color }}>🏫 {a.centre_coaching}</div>
                        )}
                      </div>

                      {/* Jours de cours */}
                      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", padding:"16px 18px" }}>
                        <div style={{ fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".06em", marginBottom:14 }}>Jours de cours</div>
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          {ALL_JOURS.map(j => {
                            const actif = joursDisp.includes(j);
                            return (
                              <div key={j} style={{ width:56, textAlign:"center", borderRadius:10, padding:"10px 0", fontWeight:700, fontSize:13,
                                background: actif ? BET : "#f1f5f9",
                                color:      actif ? "#fff" : "#cbd5e1",
                                border:     `2px solid ${actif ? BET : "#e5e7eb"}`,
                                boxShadow:  actif ? `0 4px 12px ${BET}40` : "none" }}>
                                {j}
                              </div>
                            );
                          })}
                        </div>
                        {joursDisp.length === 0 && (
                          <div style={{ fontSize:12, color:"#9ca3af", marginTop:8 }}>Jours non renseignés - à confirmer avec l'apprenant</div>
                        )}
                      </div>

                      {/* Créneaux horaires */}
                      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", padding:"16px 18px" }}>
                        <div style={{ fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".06em", marginBottom:12 }}>Créneaux horaires</div>
                        {horairesTab.length > 0 ? (
                          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                            {horairesTab.map((h, i) => (
                              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 18px", borderRadius:10, background:`${BET}10`, border:`1.5px solid ${BET}30` }}>
                                <span style={{ fontSize:18 }}>🕐</span>
                                <span style={{ fontSize:14, fontWeight:800, color:BET }}>{h.jour} à partir de {h.debut}</span>
                              </div>
                            ))}
                          </div>
                        ) : creneaux.length > 0 ? (
                          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                            {creneaux.map((c, i) => (
                              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 18px", borderRadius:10, background:`${BET}10`, border:`1.5px solid ${BET}30` }}>
                                <span style={{ fontSize:18 }}>🕐</span>
                                <span style={{ fontSize:14, fontWeight:800, color:BET }}>{c}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize:12, color:"#9ca3af" }}>Créneaux non renseignés - à confirmer avec l'apprenant</div>
                        )}
                      </div>

                      {/* Infos complémentaires */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                        {[
                          ["📅 Date de début",    a.disponibilites?.date_debut || (a.created_at ? new Date(a.created_at).toLocaleDateString("fr-FR") : "-")],
                          ["⚡ Type de coaching", a.type_coaching === "intensive" ? "Intensif" : a.type_coaching === "premium" ? "Premium" : "Classique"],
                          ["📦 Pack",             a.pack_coaching || "-"],
                          ["📍 Nb séances prévu", a.nb_seances ? `${a.nb_seances}` : "Non défini"],
                        ].map(([l, v]) => v && v !== "-" ? (
                          <div key={l} style={{ background:"#f8fafc", borderRadius:9, padding:"11px 14px", border:"1px solid #e2e8f0" }}>
                            <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", marginBottom:4 }}>{l}</div>
                            <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{v}</div>
                          </div>
                        ) : null)}
                      </div>

                      {/* Message si rien */}
                      {joursDisp.length === 0 && creneaux.length === 0 && (
                        <div style={{ textAlign:"center", padding:32, background:"#f8fafc", borderRadius:12, border:"1px dashed #e2e8f0" }}>
                          <div style={{ fontSize:32, marginBottom:10 }}>📅</div>
                          <div style={{ fontSize:14, fontWeight:700, color:"#374151" }}>Planning non encore défini</div>
                          <div style={{ fontSize:12, color:"#9ca3af", marginTop:4 }}>Le planning sera confirmé par l'onboarding et vous sera transmis.</div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Onglet Présences ── */}
                {priveTab === "presences" && (() => {
                  const nbPresent = presencesPrivees.filter(p=>p.statut==="present").length;
                  const nbAbsent  = presencesPrivees.filter(p=>p.statut==="absent").length;
                  const total     = presencesPrivees.length;
                  const taux      = total > 0 ? Math.round((nbPresent/total)*100) : null;
                  const statutColors = { present:{ bg:"#f0fdf4", color:"#22c55e", label:"Présent" }, absent:{ bg:"#fef2f2", color:"#ef4444", label:"Absent" }, retard:{ bg:"#fffbeb", color:"#f59e0b", label:"Retard" }, excuse:{ bg:"#f0f9ff", color:"#0891b2", label:"Excusé" } };
                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div style={{ fontWeight:800, fontSize:15, color:"#0f172a" }}>Suivi des présences</div>
                        <button onClick={() => { setShowPresenceForm(f=>!f); }}
                          style={{ padding:"6px 14px", background:showPresenceForm?"#f1f5f9":BET, color:showPresenceForm?"#374151":"#fff", border:showPresenceForm?"1px solid #e2e8f0":"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                          {showPresenceForm ? "✕ Annuler" : "+ Enregistrer"}
                        </button>
                      </div>

                      {/* Formulaire inline */}
                      {showPresenceForm && (
                        <div style={{ background:"#f8fafc", borderRadius:12, padding:"16px", border:"1.5px solid #e2e8f0", display:"flex", flexDirection:"column", gap:10 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:"#0f172a", marginBottom:2 }}>Nouvelle présence</div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                            <div>
                              <div style={{ fontSize:11, color:"#64748b", fontWeight:600, marginBottom:3 }}>Date *</div>
                              <input type="date" value={presenceForm.date_presence}
                                onChange={e => setPresenceForm(f=>({...f, date_presence:e.target.value}))}
                                style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, boxSizing:"border-box" }} />
                            </div>
                            <div>
                              <div style={{ fontSize:11, color:"#64748b", fontWeight:600, marginBottom:3 }}>Statut</div>
                              <select value={presenceForm.statut} onChange={e => setPresenceForm(f=>({...f, statut:e.target.value}))}
                                style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, boxSizing:"border-box" }}>
                                <option value="present">✅ Présent</option>
                                <option value="absent">❌ Absent</option>
                                <option value="retard">⏰ Retard</option>
                                <option value="excuse">💬 Excusé</option>
                              </select>
                            </div>
                          </div>
                          {(presenceForm.statut === "absent" || presenceForm.statut === "excuse") && (
                            <div>
                              <div style={{ fontSize:11, color:"#64748b", fontWeight:600, marginBottom:3 }}>Motif</div>
                              <input type="text" value={presenceForm.motif} placeholder="Motif de l'absence..."
                                onChange={e => setPresenceForm(f=>({...f, motif:e.target.value}))}
                                style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, boxSizing:"border-box" }} />
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize:11, color:"#64748b", fontWeight:600, marginBottom:3 }}>Note (optionnel)</div>
                            <input type="text" value={presenceForm.note} placeholder="Observation..."
                              onChange={e => setPresenceForm(f=>({...f, note:e.target.value}))}
                              style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, boxSizing:"border-box" }} />
                          </div>
                          <button onClick={() => savePresencePrive(a.id)} disabled={presencePriveeSaving || !presenceForm.date_presence}
                            style={{ alignSelf:"flex-end", padding:"8px 18px", background:BET, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", opacity:presencePriveeSaving?0.6:1 }}>
                            {presencePriveeSaving ? "Enregistrement…" : "✅ Enregistrer"}
                          </button>
                        </div>
                      )}

                      {/* Stats */}
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                        {[
                          { l:"Présences", v:nbPresent, color:"#22c55e", bg:"#f0fdf4" },
                          { l:"Absences",  v:nbAbsent,  color:"#ef4444", bg:"#fef2f2" },
                          { l:"Taux",      v:taux!=null?`${taux}%`:"-", color:BET, bg:BET+"12" },
                        ].map(s => (
                          <div key={s.l} style={{ background:s.bg, borderRadius:10, padding:"12px 14px", textAlign:"center" }}>
                            <div style={{ fontSize:22, fontWeight:900, color:s.color }}>{s.v}</div>
                            <div style={{ fontSize:11, color:"#64748b", fontWeight:600 }}>{s.l}</div>
                          </div>
                        ))}
                      </div>

                      {/* Tableau */}
                      <div style={{ border:"1px solid #e2e8f0", borderRadius:10, overflow:"hidden" }}>
                        {presencesLoading ? (
                          <div style={{ padding:24, textAlign:"center", color:"#94a3b8", fontSize:13 }}>Chargement…</div>
                        ) : (
                          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                            <thead>
                              <tr style={{ background:"#f8fafc" }}>
                                {["Date","Statut","Motif","Note"].map(h => (
                                  <th key={h} style={{ padding:"10px 12px", fontWeight:700, color:"#64748b", fontSize:11, textAlign:"left", borderBottom:"1px solid #e2e8f0" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {presencesPrivees.length === 0 ? (
                                <tr><td colSpan={4} style={{ padding:"28px 12px", textAlign:"center", color:"#94a3b8", fontSize:13 }}>
                                  <div style={{ fontSize:28, marginBottom:6 }}>📋</div>
                                  Aucune présence enregistrée
                                </td></tr>
                              ) : presencesPrivees.map(p => {
                                const sc = statutColors[p.statut] || { bg:"#f8fafc", color:"#64748b", label:p.statut };
                                return (
                                  <tr key={p.id} style={{ borderBottom:"1px solid #f1f5f9" }}>
                                    <td style={{ padding:"10px 12px", fontWeight:600 }}>{new Date(p.date_presence).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}</td>
                                    <td style={{ padding:"10px 12px" }}>
                                      <span style={{ padding:"3px 9px", borderRadius:99, fontSize:11, fontWeight:700, background:sc.bg, color:sc.color }}>{sc.label}</span>
                                    </td>
                                    <td style={{ padding:"10px 12px", color:"#64748b", fontSize:12 }}>{p.motif || "-"}</td>
                                    <td style={{ padding:"10px 12px", color:"#64748b", fontSize:12 }}>{p.note || "-"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Onglet Séances ── */}
                {priveTab === "seances" && (() => {
                  const nbEffectuees = seancesPrivees.filter(s=>s.statut==="effectuee").length;
                  const nbAvenir     = seancesPrivees.filter(s=>s.statut==="planifiee").length;
                  const statutSeance = { planifiee:{ bg:"#eff6ff", color:"#2563eb", label:"Planifiée" }, effectuee:{ bg:"#f0fdf4", color:"#22c55e", label:"Effectuée" }, annulee:{ bg:"#fef2f2", color:"#ef4444", label:"Annulée" } };
                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div style={{ fontWeight:800, fontSize:15, color:"#0f172a" }}>Séances planifiées</div>
                        <button onClick={() => { setShowSeanceForm(f=>!f); }}
                          style={{ padding:"6px 14px", background:showSeanceForm?"#f1f5f9":BET, color:showSeanceForm?"#374151":"#fff", border:showSeanceForm?"1px solid #e2e8f0":"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                          {showSeanceForm ? "✕ Annuler" : "+ Planifier"}
                        </button>
                      </div>

                      {/* Formulaire inline */}
                      {showSeanceForm && (
                        <div style={{ background:"#f8fafc", borderRadius:12, padding:"16px", border:"1.5px solid #e2e8f0", display:"flex", flexDirection:"column", gap:10 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:"#0f172a", marginBottom:2 }}>Nouvelle séance</div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                            <div>
                              <div style={{ fontSize:11, color:"#64748b", fontWeight:600, marginBottom:3 }}>Date *</div>
                              <input type="date" value={seanceForm.date_seance}
                                onChange={e => setSeanceForm(f=>({...f, date_seance:e.target.value}))}
                                style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, boxSizing:"border-box" }} />
                            </div>
                            <div>
                              <div style={{ fontSize:11, color:"#64748b", fontWeight:600, marginBottom:3 }}>Heure début</div>
                              <input type="time" value={seanceForm.heure_debut}
                                onChange={e => setSeanceForm(f=>({...f, heure_debut:e.target.value}))}
                                style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, boxSizing:"border-box" }} />
                            </div>
                            <div>
                              <div style={{ fontSize:11, color:"#64748b", fontWeight:600, marginBottom:3 }}>Durée (h)</div>
                              <input type="number" step="0.5" min="0.5" value={seanceForm.duree_h}
                                onChange={e => setSeanceForm(f=>({...f, duree_h:e.target.value}))}
                                style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, boxSizing:"border-box" }} />
                            </div>
                            <div>
                              <div style={{ fontSize:11, color:"#64748b", fontWeight:600, marginBottom:3 }}>Lieu</div>
                              <select value={seanceForm.lieu} onChange={e => setSeanceForm(f=>({...f, lieu:e.target.value}))}
                                style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, boxSizing:"border-box" }}>
                                <option value="cabinet">🏢 Au cabinet</option>
                                <option value="domicile">🏠 À domicile</option>
                                <option value="en_ligne">💻 En ligne</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize:11, color:"#64748b", fontWeight:600, marginBottom:3 }}>Notes (optionnel)</div>
                            <input type="text" value={seanceForm.notes} placeholder="Ex: Révision chapitre 3..."
                              onChange={e => setSeanceForm(f=>({...f, notes:e.target.value}))}
                              style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, boxSizing:"border-box" }} />
                          </div>
                          <button onClick={() => saveSeancePrive(a.id)} disabled={seanceSaving || !seanceForm.date_seance}
                            style={{ alignSelf:"flex-end", padding:"8px 18px", background:BET, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", opacity:seanceSaving?0.6:1 }}>
                            {seanceSaving ? "Sauvegarde…" : "📆 Enregistrer"}
                          </button>
                        </div>
                      )}

                      {/* Stats */}
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                        {[
                          { l:"Effectuées", v:nbEffectuees,              color:"#22c55e", bg:"#f0fdf4" },
                          { l:"À venir",    v:nbAvenir,                  color:BET,       bg:BET+"12" },
                          { l:"Total",      v:seancesPrivees.length,     color:"#64748b", bg:"#f8fafc" },
                        ].map(s => (
                          <div key={s.l} style={{ background:s.bg, borderRadius:10, padding:"12px 14px", textAlign:"center" }}>
                            <div style={{ fontSize:22, fontWeight:900, color:s.color }}>{s.v}</div>
                            <div style={{ fontSize:11, color:"#64748b", fontWeight:600 }}>{s.l}</div>
                          </div>
                        ))}
                      </div>

                      {/* Tableau */}
                      <div style={{ border:"1px solid #e2e8f0", borderRadius:10, overflow:"hidden" }}>
                        {seancesLoading ? (
                          <div style={{ padding:24, textAlign:"center", color:"#94a3b8", fontSize:13 }}>Chargement…</div>
                        ) : (
                          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                            <thead>
                              <tr style={{ background:"#f8fafc" }}>
                                {["Date","Heure","Durée","Lieu","Statut",""].map(h => (
                                  <th key={h} style={{ padding:"10px 12px", fontWeight:700, color:"#64748b", fontSize:11, textAlign:"left", borderBottom:"1px solid #e2e8f0" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {seancesPrivees.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding:"28px 12px", textAlign:"center", color:"#94a3b8", fontSize:13 }}>
                                  <div style={{ fontSize:28, marginBottom:6 }}>📆</div>
                                  Aucune séance planifiée
                                </td></tr>
                              ) : seancesPrivees.map(s => {
                                const sc = statutSeance[s.statut] || { bg:"#f8fafc", color:"#64748b", label:s.statut };
                                const lieuLabel = s.lieu==="domicile"?"🏠 Domicile":s.lieu==="en_ligne"?"💻 En ligne":"🏢 Cabinet";
                                return (
                                  <tr key={s.id} style={{ borderBottom:"1px solid #f1f5f9" }}>
                                    <td style={{ padding:"10px 12px", fontWeight:600 }}>{new Date(s.date_seance).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}</td>
                                    <td style={{ padding:"10px 12px", color:"#64748b" }}>{s.heure_debut ? s.heure_debut.slice(0,5) : "-"}</td>
                                    <td style={{ padding:"10px 12px", color:"#64748b" }}>{s.duree_h}h</td>
                                    <td style={{ padding:"10px 12px", fontSize:12, color:"#374151" }}>{lieuLabel}</td>
                                    <td style={{ padding:"10px 12px" }}>
                                      <select value={s.statut}
                                        onChange={e => patchSeancePrive(s.id, { statut:e.target.value }, a.id)}
                                        style={{ padding:"3px 7px", borderRadius:8, border:"1px solid #e2e8f0", fontSize:11, fontWeight:700, background:sc.bg, color:sc.color, cursor:"pointer" }}>
                                        <option value="planifiee">Planifiée</option>
                                        <option value="effectuee">Effectuée</option>
                                        <option value="annulee">Annulée</option>
                                      </select>
                                    </td>
                                    <td style={{ padding:"10px 8px" }}>
                                      <button disabled={!peut("classes","delete")} onClick={() => deleteSeancePrive(s.id, a.id)}
                                        title={permBtnTitle("Supprimer",peut("classes","delete"))} style={{ background:"none", border:"none", color: peut("classes","delete")?"#ef4444":"#cbd5e1", cursor: peut("classes","delete")?"pointer":"not-allowed", fontSize:14, padding:2 }}>{peut("classes","delete")?"🗑":"🔒"}</button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Onglet Fichiers ── */}
                {priveTab === "fichiers" && (() => {
                  const fileIcon = (type) => type==="pdf"?"📄":type==="image"?"🖼️":type==="word"?"📝":type==="audio"?"🎵":type==="video"?"🎬":"📎";
                  const fileColor = (type) => type==="pdf"?"#ef4444":type==="image"?"#8b5cf6":type==="word"?"#2563eb":type==="audio"?"#f59e0b":type==="video"?"#ec4899":"#64748b";
                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div>
                          <div style={{ fontWeight:800, fontSize:15, color:"#0f172a" }}>Fichiers partagés</div>
                          <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>Documents, exercices, ressources pour cet apprenant</div>
                        </div>
                        <label style={{ padding:"7px 14px", background: fichierPriveUploading?"#e2e8f0":BET, color: fichierPriveUploading?"#94a3b8":"#fff",
                          borderRadius:8, fontSize:12, fontWeight:700, cursor: fichierPriveUploading?"not-allowed":"pointer", display:"flex", alignItems:"center", gap:5 }}>
                          {fichierPriveUploading ? "⏳ Upload…" : "📤 Partager un fichier"}
                          <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.pptx,.mp4,.mp3" style={{ display:"none" }} disabled={fichierPriveUploading}
                            onChange={async e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setFichierPriveUploading(true);
                              try {
                                const fd = new FormData(); fd.append("file", file);
                                const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
                                const uploadEndpoint = file.type.startsWith("image/") ? "/api/upload/image" : "/api/upload/document";
                                const r = await fetchUpload(`${API_URL}${uploadEndpoint}`, { method:"POST", headers:{ Authorization:`Bearer ${token}` }, body:fd });
                                const d = await r.json();
                                const url = d.file?.url || d.url;
                                if (!url) throw new Error("URL manquante");
                                const ext = file.name.split(".").pop().toLowerCase();
                                const type = ["jpg","jpeg","png","gif","webp"].includes(ext)?"image":ext==="pdf"?"pdf":["doc","docx"].includes(ext)?"word":["mp3","wav","ogg"].includes(ext)?"audio":["mp4","mov"].includes(ext)?"video":"autre";
                                const fr = await fetch(`${API_URL}/api/fichiers-prives`, {
                                  method:"POST",
                                  headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
                                  body: JSON.stringify({ assignation_id:a.id, nom:file.name, url, type_fichier:type, taille_ko:Math.round(file.size/1024) })
                                });
                                const fd2 = await fr.json();
                                setFichiersPrives(prev => [fd2.fichier || { id:Date.now(), nom:file.name, url, type_fichier:type }, ...prev]);
                                toast.success("Fichier partagé avec l'apprenant ✓");
                              } catch { toast.error("Erreur lors de l'upload"); }
                              finally { setFichierPriveUploading(false); e.target.value=""; }
                            }} />
                        </label>
                      </div>

                      {fichiersPrivesLoading ? (
                        <div style={{ padding:"28px", textAlign:"center", color:"#94a3b8", fontSize:13 }}>Chargement…</div>
                      ) : fichiersPrives.length === 0 ? (
                        <div style={{ textAlign:"center", padding:"40px 20px", background:"#f8fafc", borderRadius:12, border:"1.5px dashed #e2e8f0" }}>
                          <div style={{ fontSize:36, marginBottom:8 }}>📎</div>
                          <div style={{ fontWeight:700, color:"#374151", marginBottom:4 }}>Aucun fichier partagé</div>
                          <div style={{ fontSize:12, color:"#9ca3af" }}>Partagez des exercices, cours ou ressources avec cet apprenant</div>
                        </div>
                      ) : (
                        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                          {fichiersPrives.map(f => (
                            <div key={f.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:"#fff", borderRadius:10, border:"1px solid #e2e8f0", transition:"box-shadow .15s" }}
                              onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.08)"}
                              onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                              <div style={{ width:42, height:42, borderRadius:10, background:fileColor(f.type_fichier)+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
                                {fileIcon(f.type_fichier)}
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontWeight:700, fontSize:13, color:"#0f172a", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.nom}</div>
                                <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>
                                  {f.type_fichier?.toUpperCase()}
                                  {f.taille_ko ? ` · ${f.taille_ko < 1024 ? `${f.taille_ko} Ko` : `${(f.taille_ko/1024).toFixed(1)} Mo`}` : ""}
                                  {f.created_at ? ` · ${new Date(f.created_at).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}` : ""}
                                </div>
                              </div>
                              <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                                <a href={f.url} target="_blank" rel="noopener noreferrer"
                                  style={{ padding:"6px 12px", background:BET+"15", color:BET, borderRadius:7, fontSize:11, fontWeight:700, textDecoration:"none", border:`1px solid ${BET}30` }}>
                                  👁 Voir
                                </a>
                                <a href={f.url} download={f.nom}
                                  style={{ padding:"6px 12px", background:"#f0fdf4", color:"#22c55e", borderRadius:7, fontSize:11, fontWeight:700, textDecoration:"none", border:"1px solid #bbf7d0" }}>
                                  ⬇
                                </a>
                                <button disabled={!peut("contenus_ressources","delete")} title={permBtnTitle("Supprimer",peut("contenus_ressources","delete"))} onClick={() => deleteFichierPrive(f.id, a.id)}
                                  style={{ padding:"6px 10px", background: peut("contenus_ressources","delete")?"#fef2f2":"#f1f5f9", color: peut("contenus_ressources","delete")?"#ef4444":"#94a3b8", border:"1px solid #fecaca", borderRadius:7, fontSize:11, cursor: peut("contenus_ressources","delete")?"pointer":"not-allowed", fontWeight:700 }}>
                                  {peut("contenus_ressources","delete")?"🗑":"🔒"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>

              <div style={{ padding:"12px 24px", borderTop:"1px solid #e2e8f0", display:"flex", justifyContent:"flex-end", flexShrink:0 }}>
                <button onClick={() => { setSelectedPrive(null); setPriveTab("infos"); setShowSeanceForm(false); setShowPresenceForm(false); setSeancesPrivees([]); setPresencesPrivees([]); setFichiersPrives([]); }}
                  style={{ padding:"8px 20px", background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:9, fontSize:13, fontWeight:600, color:"#374151", cursor:"pointer" }}>
                  Fermer
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modal détail groupe ── */}
      {selectedGroupe && (
        <div style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:12 }}
          onClick={()=>{ setSelectedGroupe(null); setGroupeSubTab("apprenants"); }}>
          <div style={{ background:"#fff",borderRadius:18,width:"90vw",height:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 60px rgba(0,0,0,0.35)",overflow:"hidden" }}
            onClick={e=>e.stopPropagation()}>

            {/* En-tête modal */}
            <div style={{ background:BET_GRAD,padding:"18px 24px",color:"#fff",flexShrink:0,display:"flex",gap:16,alignItems:"flex-start" }}>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:3 }}>
                  <div style={{ fontSize:10,color:"#7dd3fc",fontWeight:700,letterSpacing:"0.08em" }}>GROUPE</div>
                  {selectedGroupe.statut==="cloture" && (
                    <span style={{ fontSize:10,fontWeight:800,padding:"2px 9px",borderRadius:99,background:"#dc2626",color:"#fff",letterSpacing:"0.04em" }}>🔒 CLÔTURÉE</span>
                  )}
                </div>
                <div style={{ fontSize:19,fontWeight:900,marginBottom:5 }}>{selectedGroupe.nom}</div>
                <div style={{ fontSize:12,color:"#bae6fd",display:"flex",gap:14,flexWrap:"wrap" }}>
                  {selectedGroupe.niveau && <span>📊 {selectedGroupe.niveau}</span>}
                  {selectedGroupe.filiere && <span>🎓 {selectedGroupe.filiere}</span>}
                  {/* « 12 actifs · 1 arrêté » plutôt qu'un total muet : un effectif qui
                      baisse sans explication se lit comme une erreur d'affichage. */}
                  {(() => {
                    const actifs   = groupeApprenants.filter(a => a.statut === "actif").length;
                    const arretes  = groupeApprenants.filter(a => a.statut === "retire" || a.date_retrait).length;
                    return (
                      <span>👤 {selectedGroupe.statut==="cloture" ? groupeApprenants.length : actifs} apprenant{groupeApprenants.length!==1?"s":""}{selectedGroupe.statut==="cloture"?" (archivés)":" actifs"}
                        {selectedGroupe.statut!=="cloture" && arretes > 0 && <span style={{ color:"#94a3b8" }}> · {arretes} arrêté{arretes>1?"s":""}</span>}
                      </span>
                    );
                  })()}
                  {selectedGroupe.date_debut && <span>📅 Début : {new Date(selectedGroupe.date_debut).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}</span>}
                  <span>{selectedGroupe.type_cours==="en_ligne"?"💻 En ligne":selectedGroupe.type_cours==="domicile"?"🏠 Domicile":"🏢 Centre"}</span>
                </div>
                {selectedGroupe.horaire?.length > 0 && (
                  <div style={{ marginTop:8,display:"flex",gap:5,flexWrap:"wrap" }}>
                    {selectedGroupe.horaire.map((h,i) => (
                      <span key={i} style={{ padding:"2px 9px",borderRadius:7,background:"rgba(255,255,255,0.18)",fontSize:11,fontWeight:600 }}>
                        {h.jour} {h.debut}–{h.fin}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={()=>{ setSelectedGroupe(null); setGroupeSubTab("apprenants"); }}
                style={{ background:"rgba(255,255,255,0.18)",border:"none",color:"#fff",width:34,height:34,borderRadius:"50%",cursor:"pointer",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2 }}>
                ✕
              </button>
            </div>

            {/* Onglets */}
            <div style={{ display:"flex",gap:0,background:"#fafafa",borderBottom:"1px solid #e5e7eb",flexShrink:0,overflowX:"auto" }}>
              {[
                // Le compte de l'onglet suit CE QUE LA LISTE AFFICHE - arrêtés compris -
                // sinon l'onglet annonce 12 et on en voit 13.
                { key:"apprenants", label:`Apprenants (${selectedGroupe.statut==="cloture" ? groupeApprenants.length : groupeApprenants.filter(a=>a.statut!=="transfere").length})`, icon:"👤" },
                { key:"chat",       label:"Chat groupe",  icon:"💬" },
                { key:"fichiers",   label:`Fichiers (${groupeFichiers.length})`, icon:"📎" },
                { key:"presences",  label:"Présences", icon:"✅" },
                { key:"sessions",   label:"Sessions", icon:"📡" },
                { key:"honoraire",  label:"Honoraire", icon:"💰" },
                { key:"historique", label:"Historique", icon:"📜" },
                // « Mouvements » et non « Historique » : l'onglet voisin porte ce nom et
                // parle des séances et des honoraires. Deux choses sous un même mot
                // rendraient l'écran illisible.
                { key:"mouvements", label:"Mouvements", icon:"🕓" },
              ].map(t => (
                <button key={t.key} onClick={() => setGroupeSubTab(t.key)}
                  style={{ padding:"12px 18px",border:"none",borderBottom:groupeSubTab===t.key?`3px solid ${BET}`:"3px solid transparent",fontSize:12,fontWeight:600,cursor:"pointer",
                    background:"transparent",color:groupeSubTab===t.key?BET:"#64748b",whiteSpace:"nowrap",flexShrink:0 }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Corps scrollable */}
            <div style={{ flex:1,overflowY:"auto",padding:"20px 24px" }}>

        {groupeSubTab==="apprenants" && (()=>{
          /* CEUX QUI ONT ARRÊTÉ RESTENT DANS LA LISTE, grisés.
             Le filtre ne gardait que `actif` : un apprenant déclaré « arrêté » s'effaçait
             de l'écran du coach, et le compteur baissait d'une unité - sans que rien ne
             dise qui était parti, quand, ni pourquoi. Le coach découvrait une place vide.
             `transfere` reste exclu : celui-là n'a pas arrêté, il est dans une autre classe,
             et l'afficher ici le ferait compter deux fois. */
          const apprenantsFiltres = selectedGroupe.statut === "cloture"
            ? groupeApprenants
            : groupeApprenants.filter(a => a.statut !== "transfere");
          return (
          <div>
            {apprenantsFiltres.length === 0
              ? <div style={{ textAlign:"center", padding:"40px 20px", color:"#9ca3af", background:"#f8fafc", borderRadius:12 }}>Aucun apprenant dans ce groupe.</div>
              : (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:12 }}>
                  {apprenantsFiltres.map(a => {
                    const initiales = [(a.prenom_apprenant||""),(a.nom_apprenant||"")].map(s=>s[0]||"").join("").toUpperCase() || "?";
                    const NIVEAU_COLOR = { A1:"#6b7280",A2:"#0891b2",B1:"#16a34a",B2:"#7c3aed",C1:"#d97706",C2:"#dc2626" };
                    const nColor = NIVEAU_COLOR[a.niveau] || "#6b7280";
                    let noteObj = null;
                    try { noteObj = a.note ? JSON.parse(a.note) : null; } catch { noteObj = null; }
                    const arrete = a.statut === "retire" || !!a.date_retrait;
                    const infoArret = noteObj?.arret_formation || null;
                    return (
                      <div key={a.id}
                        onClick={() => openFicheApprenant(a, selectedGroupe)}
                        style={{ background: arrete ? "#fafafa" : "#fff", borderRadius:12, border:`1.5px solid ${arrete ? "#e2e8f0" : "#e5e7eb"}`, overflow:"hidden", cursor:"pointer", boxShadow:"0 1px 4px rgba(0,0,0,0.04)", transition:"all .15s", opacity: arrete ? .7 : 1 }}
                        onMouseEnter={e=>{ e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.10)"; e.currentTarget.style.borderColor=BET+"60"; e.currentTarget.style.opacity=1; }}
                        onMouseLeave={e=>{ e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,0.04)"; e.currentTarget.style.borderColor="#e5e7eb"; e.currentTarget.style.opacity= arrete ? .7 : 1; }}
                      >
                        <div style={{ height:3, background: arrete ? "#cbd5e1" : `linear-gradient(90deg,${BET},${BET}cc)` }}/>
                        <div style={{ padding:"14px 16px" }}>
                          {/* Header */}
                          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
                            <div style={{ width:44, height:44, borderRadius:"50%", background:`linear-gradient(135deg,#0f172a,${BET})`, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:16, color:"#fff", flexShrink:0, overflow:"hidden" }}>{a.avatar_url ? <img src={a.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : initiales}</div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontWeight:800, color:"#0f172a", fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:6 }}>
                                {[a.prenom_apprenant, a.nom_apprenant].filter(Boolean).join(" ")}
                                {arrete && (
                                  <span title={[
                                    infoArret?.motif ? `Motif : ${infoArret.motif}` : "Motif non renseigné",
                                    infoArret?.par ? `Déclaré par ${infoArret.par}` : null,
                                  ].filter(Boolean).join(" · ")}
                                    style={{ fontSize:9, background:"#e2e8f0", color:"#475569", borderRadius:99, padding:"1px 7px", fontWeight:700, flexShrink:0 }}>
                                    🎓 A ARRÊTÉ{a.date_retrait ? ` · ${new Date(a.date_retrait).toLocaleDateString("fr-FR")}` : ""}
                                  </span>
                                )}
                                {a.acces_bloque && <span style={{ fontSize:9, background:"#dc2626", color:"#fff", borderRadius:99, padding:"1px 7px", fontWeight:700, flexShrink:0 }}>🔒 SUSPENDU</span>}
                              </div>
                              <div style={{ fontSize:11, color:"#6b7280", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.email_apprenant || "-"}</div>
                            </div>
                            <span style={{ padding:"2px 8px", borderRadius:99, fontSize:10, fontWeight:800, color:"#fff", background:nColor, flexShrink:0 }}>{a.niveau || "-"}</span>
                          </div>
                          {/* Infos rapides */}
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:10 }}>
                            <div style={{ padding:"5px 8px", borderRadius:6, background:"#f8fafc" }}>
                              <div style={{ fontSize:9, color:"#9ca3af" }}>Téléphone</div>
                              <div style={{ fontSize:11, fontWeight:700, color:"#374151" }}>{a.telephone || "-"}</div>
                            </div>
                            <div style={{ padding:"5px 8px", borderRadius:6, background:"#f8fafc" }}>
                              <div style={{ fontSize:9, color:"#9ca3af" }}>Programme</div>
                              <div style={{ fontSize:11, fontWeight:700, color:"#374151", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{noteObj?.programme || selectedGroupe?.filiere || "-"}</div>
                            </div>
                            {noteObj?.date_debut && (
                              <div style={{ padding:"5px 8px", borderRadius:6, background:"#f8fafc" }}>
                                <div style={{ fontSize:9, color:"#9ca3af" }}>Date début</div>
                                <div style={{ fontSize:11, fontWeight:700, color:"#374151" }}>{new Date(noteObj.date_debut).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}</div>
                              </div>
                            )}
                            {noteObj?.date_renouvellement && (
                              <div style={{ padding:"5px 8px", borderRadius:6, background:"#f8fafc" }}>
                                <div style={{ fontSize:9, color:"#9ca3af" }}>Renouvellement</div>
                                <div style={{ fontSize:11, fontWeight:700, color:"#374151" }}>{new Date(noteObj.date_renouvellement).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}</div>
                              </div>
                            )}
                          </div>
                          {/* Attentes (aperçu) */}
                          {noteObj?.attentes && (
                            <div style={{ padding:"6px 10px", borderRadius:8, background:"#fef9ee", border:"1px solid #fde68a", fontSize:11, color:"#92400e", lineHeight:1.5, marginBottom:10, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>
                              🎯 {noteObj.attentes}
                            </div>
                          )}
                          {/* Footer */}
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                            <span style={{ fontSize:10, color:"#22c55e", fontWeight:700 }}>● Actif</span>
                            <div style={{ display:"flex", gap:6 }}>
                              <span style={{ fontSize:10, color:"#9ca3af" }}>Cliquer pour les détails</span>
                              <button onClick={e=>{ e.stopPropagation(); signalerAbsence(a); }}
                                style={{ padding:"3px 8px", background:"#fff7ed", color:"#92400e", border:"1px solid #fed7aa", borderRadius:6, fontSize:10, fontWeight:600, cursor:"pointer" }}>
                                🚨 Absence
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>
          );
        })()}

        {groupeSubTab==="chat" && (
          <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", overflow:"hidden" }}>
            <div style={{ padding:"12px 16px", borderBottom:"1px solid #e5e7eb", background:`${BET}08`, fontWeight:700, fontSize:13, color:BET }}>
              💬 Chat - {selectedGroupe.nom}
            </div>

            <div style={{ height:380, overflowY:"auto", padding:16, display:"flex", flexDirection:"column", gap:10 }}>
              {groupeMessages.length === 0 && (
                <div style={{ textAlign:"center", color:"#9ca3af", paddingTop:60 }}>Aucun message - commencez la conversation !</div>
              )}
              {groupeMessages.map(m => {
                const isMe = m.auteur_id === MON_PROFIL_REEL.id;
                return (
                  <div key={m.id} style={{ display:"flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                    {!isMe && (
                      <div style={{ width:32, height:32, borderRadius:"50%", background:BET_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:BET, flexShrink:0, marginRight:8, alignSelf:"flex-end" }}>
                        {m.auteur_nom?.[0] || "?"}
                      </div>
                    )}
                    <div style={{ maxWidth:"72%" }}>
                      {!isMe && <div style={{ fontSize:11, color:"#9ca3af", marginBottom:2, fontWeight:600 }}>{m.auteur_nom}</div>}
                      {m.type==="fichier" && m.fichier ? (() => {
                        const f = m.fichier;
                        const ext = (f.nom && f.nom.includes(".")) ? f.nom.split(".").pop().toLowerCase() : (f.type === "image" ? "jpg" : f.type || "bin");
                        const isImg = ["jpg","jpeg","png","gif","webp","svg"].includes(ext);
                        const nomAvecExt = f.nom && f.nom.includes(".") ? f.nom : `${f.nom || "fichier"}.${ext}`;
                        const handleDownload = async () => {
                          try {
                            const proxyUrl = `${API_URL}/api/upload/download?url=${encodeURIComponent(f.url)}&nom=${encodeURIComponent(nomAvecExt)}&type=${encodeURIComponent(ext)}`;
                            const r = await fetch(proxyUrl, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
                            const blob = await r.blob();
                            const objUrl = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = objUrl; a.download = nomAvecExt; a.click();
                            setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
                          } catch { window.open(f.url, "_blank"); }
                        };
                        return isImg ? (
                          <a href={f.url} target="_blank" rel="noreferrer"
                            style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:isMe?"12px 12px 0 12px":"12px 12px 12px 0", background:isMe?BET:"#f3f4f6", color:isMe?"#fff":"#0f172a", textDecoration:"none", fontSize:13 }}>
                            <span style={{ fontSize:20 }}>🖼️</span>
                            <span style={{ fontWeight:600 }}>{nomAvecExt}</span>
                          </a>
                        ) : (
                          <button onClick={handleDownload}
                            style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:isMe?"12px 12px 0 12px":"12px 12px 12px 0", background:isMe?BET:"#f3f4f6", color:isMe?"#fff":"#0f172a", border:"none", cursor:"pointer", fontSize:13 }}>
                            <span style={{ fontSize:20 }}>{ext==="pdf"?"📄":"📎"}</span>
                            <span style={{ fontWeight:600 }}>{nomAvecExt}</span>
                          </button>
                        );
                      })() : (
                        <div style={{ padding:"10px 14px", borderRadius:isMe?"12px 12px 0 12px":"12px 12px 12px 0", background:isMe?BET:"#f3f4f6", color:isMe?"#fff":"#0f172a", fontSize:13, lineHeight:1.5, whiteSpace:"pre-wrap" }}>
                          {m.texte}
                        </div>
                      )}
                      <div style={{ fontSize:10, color:"#9ca3af", marginTop:2, textAlign:isMe?"right":"left" }}>
                        {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}) : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Aperçu fichier en attente */}
            {pendingChatFile && (
              <div style={{ padding:"8px 12px", borderTop:"1px solid #e5e7eb", background:"#f0f9ff", display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:20 }}>{pendingChatFile.type==="image"?"🖼️":pendingChatFile.type==="pdf"?"📄":"📎"}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#0f172a", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{pendingChatFile.name}</div>
                  <div style={{ fontSize:11, color:"#9ca3af" }}>{(pendingChatFile.size / (1024*1024)).toFixed(1)} Mo - prêt à envoyer</div>
                </div>
                <button onClick={() => setPendingChatFile(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, color:"#9ca3af", lineHeight:1, padding:4 }} title="Retirer">✕</button>
              </div>
            )}
            <div style={{ padding:"10px 12px", borderTop:"1px solid #e5e7eb", display:"flex", gap:8, alignItems:"flex-end", }}>
              <label style={{ padding:"8px 10px", background: pendingChatFile?"#dbeafe":"#f1f5f9", border:`1px solid ${pendingChatFile?"#93c5fd":"#e5e7eb"}`, borderRadius:8, cursor:"pointer", fontSize:16, flexShrink:0 }} title="Joindre un fichier (max 20 Mo - PDF, image, doc)">
                📎
                <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.xlsx,.pptx" style={{ display:"none" }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const MAX_MB = 20;
                    if (file.size > MAX_MB * 1024 * 1024) {
                      toast.error(`Fichier trop lourd - maximum ${MAX_MB} Mo`);
                      e.target.value = "";
                      return;
                    }
                    const ext = file.name.split(".").pop().toLowerCase();
                    const isImage = ["jpg","jpeg","png","gif","webp","svg"].includes(ext);
                    const type = isImage ? "image" : ext === "pdf" ? "pdf" : "autre";
                    setPendingChatFile({ file, name:file.name, size:file.size, ext, type });
                    e.target.value = "";
                  }} />
              </label>
              <textarea value={chatInput} onChange={e=>setChatInput(e.target.value)}
                placeholder={pendingChatFile ? "Ajouter un message avec le fichier (optionnel)…" : `Message au groupe "${selectedGroupe.nom}"…`}
                rows={1}
                style={{ flex:1, padding:"9px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, resize:"none", fontFamily:"inherit", background:"#fff" }}
                onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendGroupeMsg(); }}} />
              <button onClick={sendGroupeMsg} disabled={(!chatInput.trim() && !pendingChatFile) || fichierUploading}
                style={{ padding:"9px 16px", background:BET, color:"#fff", border:"none", borderRadius:8, cursor:(!chatInput.trim()&&!pendingChatFile)?"not-allowed":"pointer", fontWeight:700, fontSize:13, opacity:(!chatInput.trim()&&!pendingChatFile)?0.5:1, flexShrink:0 }}>
                {fichierUploading ? "⏳" : "✉️"}
              </button>
            </div>
          </div>
        )}

        {groupeSubTab==="fichiers" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>📎 Fichiers partagés</div>
              <label style={{ padding:"8px 14px", background:BET, color:"#fff", borderRadius:8, fontSize:12, fontWeight:600, cursor:fichierUploading?"not-allowed":"pointer", opacity:fichierUploading?0.6:1 }}>
                {fichierUploading ? "⏳ Upload…" : "📤 Partager un fichier"}
                <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.pptx,.mp4" style={{ display:"none" }} disabled={fichierUploading}
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file || !selectedGroupe) return;
                    setFichierUploading(true);
                    try {
                      const fd = new FormData(); fd.append("file", file);
                      const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
                      const uploadEndpoint = file.type.startsWith("image/") ? "/api/upload/image" : "/api/upload/document";
                      const r = await fetchUpload(`${API_URL}${uploadEndpoint}`, { method:"POST", headers:{ Authorization:`Bearer ${token}` }, body:fd });
                      const d = await r.json();
                      const url = d.file?.url || d.url;
                      if (url) {
                        const ext = file.name.split(".").pop().toLowerCase();
                        const type = ["jpg","jpeg","png","gif","webp"].includes(ext) ? "image" : ext==="pdf" ? "pdf" : ["doc","docx"].includes(ext) ? "word" : "autre";
                        const fr = await fetch(`${API_URL}/api/groupes/${selectedGroupe.id}/fichiers`, {
                          method:"POST",
                          headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
                          body: JSON.stringify({ nom:file.name, url, type_fichier:type, taille_ko:Math.round(file.size/1024) })
                        });
                        const fd2 = await fr.json();
                        setGroupeFichiers(prev => [fd2.fichier || { id:Date.now(), nom:file.name, url, type_fichier:type }, ...prev]);
                        toast.success("Fichier partagé ✓");
                      }
                    } catch { toast.error("Erreur upload"); }
                    finally { setFichierUploading(false); e.target.value=""; }
                  }} />
              </label>
            </div>
            {groupeFichiers.length === 0
              ? <div style={{ textAlign:"center", padding:"40px 20px", color:"#9ca3af", background:"#f8fafc", borderRadius:12 }}>Aucun fichier partagé dans ce groupe.</div>
              : (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {groupeFichiers.map(f => {
                    const icon = f.type_fichier==="pdf" ? "📄" : f.type_fichier==="image" ? "🖼️" : f.type_fichier==="word" ? "📝" : "📎";
                    return (
                      <div key={f.id} style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 16px", background:"#fff", borderRadius:10, border:"1px solid #e5e7eb" }}>
                        <div style={{ fontSize:28, flexShrink:0 }}>{icon}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, color:"#0f172a", fontSize:13 }}>{f.nom}</div>
                          <div style={{ fontSize:11, color:"#9ca3af" }}>{f.created_at ? new Date(f.created_at).toLocaleDateString("fr-FR") : ""}{f.taille_ko ? ` · ${f.taille_ko} Ko` : ""}</div>
                        </div>
                        <a href={f.url} target="_blank" rel="noreferrer"
                          style={{ padding:"6px 12px", background:BET_LIGHT, color:BET, borderRadius:8, fontSize:12, fontWeight:600, textDecoration:"none" }}>
                          ⬇️ Télécharger
                        </a>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>
        )}

        {groupeSubTab==="presences" && (
          <div>
            {presenceView==="saisie" && (
              <div>
                {/* Date séance */}
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, padding:"14px 18px", background:"#f0f9ff", borderRadius:12, border:"1px solid #bae6fd" }}>
                  <span style={{ fontSize:13, fontWeight:600, color:"#0369a1" }}>📅 Date de la séance :</span>
                  <input type="date" value={presenceDate} onChange={e=>setPresenceDate(e.target.value)}
                    style={{ padding:"7px 10px", border:"1.5px solid #bae6fd", borderRadius:8, fontSize:13, fontWeight:600 }} />
                </div>

                {/* Liste apprenants */}
                {presenceListe.length === 0
                  ? <p style={{ textAlign:"center", color:"#9ca3af", padding:30 }}>Aucun apprenant actif dans ce groupe.</p>
                  : (
                    <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
                      {presenceListe.map((p, idx) => (
                        <div key={p.ga_id || idx} style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 16px", background:"#fff", borderRadius:10, border:"1.5px solid #e5e7eb" }}>
                          <div style={{ width:38, height:38, borderRadius:"50%", background:BET_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:BET, flexShrink:0, overflow:"hidden" }}>
                            {p.avatar_url ? <img src={p.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : (p.prenom_apprenant?.[0] || p.nom_apprenant?.[0] || "?").toUpperCase()}
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{[p.prenom_apprenant, p.nom_apprenant].filter(Boolean).join(" ")}</div>
                          </div>
                          {/* Statut */}
                          <div style={{ display:"flex", gap:6 }}>
                            {[
                              { val:"present", label:"✅ Présent",  bg:"#d1fae5", color:"#065f46", sel:"#059669" },
                              { val:"retard",  label:"⏰ Retard",   bg:"#fef3c7", color:"#92400e", sel:"#d97706" },
                              { val:"absent",  label:"❌ Absent",   bg:"#fee2e2", color:"#991b1b", sel:"#dc2626" },
                              { val:"excuse",  label:"📝 Excusé",   bg:"#ede9fe", color:"#5b21b6", sel:"#7c3aed" },
                            ].map(s => (
                              <button key={s.val} onClick={()=>setPresenceListe(prev=>prev.map((x,i)=>i===idx?{...x,statut:s.val}:x))}
                                style={{ padding:"5px 10px", borderRadius:20, border:`1.5px solid ${p.statut===s.val?s.sel:"#e5e7eb"}`, fontSize:11, fontWeight:600, cursor:"pointer",
                                  background: p.statut===s.val ? s.bg : "#fff", color: p.statut===s.val ? s.color : "#9ca3af" }}>
                                {s.label}
                              </button>
                            ))}
                          </div>
                          {/* Note optionnelle */}
                          <input value={p.note} onChange={e=>setPresenceListe(prev=>prev.map((x,i)=>i===idx?{...x,note:e.target.value}:x))}
                            placeholder="Note…" style={{ width:120, padding:"5px 8px", border:"1px solid #e5e7eb", borderRadius:7, fontSize:11 }} />
                        </div>
                      ))}
                    </div>
                  )
                }

                {/* Stats rapides */}
                {presenceListe.length > 0 && (
                  <div style={{ display:"flex", gap:12, marginBottom:20, padding:"12px 16px", background:"#f8fafc", borderRadius:10, border:"1px solid #e5e7eb" }}>
                    {[
                      { label:"Présents",  val:presenceListe.filter(p=>p.statut==="present").length,  color:"#059669" },
                      { label:"Retards",   val:presenceListe.filter(p=>p.statut==="retard").length,   color:"#d97706" },
                      { label:"Absents",   val:presenceListe.filter(p=>p.statut==="absent").length,   color:"#dc2626" },
                      { label:"Excusés",   val:presenceListe.filter(p=>p.statut==="excuse").length,   color:"#7c3aed" },
                    ].map(s=>(
                      <div key={s.label} style={{ textAlign:"center", flex:1 }}>
                        <div style={{ fontSize:22, fontWeight:900, color:s.color }}>{s.val}</div>
                        <div style={{ fontSize:11, color:"#9ca3af", fontWeight:600 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={savePresences} disabled={presenceSaving || presenceListe.length===0}
                  style={{ padding:"11px 24px", background:BET, color:"#fff", border:"none", borderRadius:9, cursor:"pointer", fontWeight:700, fontSize:13, opacity:presenceSaving?0.6:1 }}>
                  {presenceSaving ? "⏳ Enregistrement…" : "💾 Enregistrer la feuille de présence"}
                </button>
              </div>
            )}

            {presenceView==="historique" && (
              <div>
                {presenceHistory.length === 0
                  ? <div style={{ textAlign:"center", padding:"40px 20px", color:"#9ca3af", background:"#f8fafc", borderRadius:12 }}>Aucune séance enregistrée.</div>
                  : (() => {
                      const parDate = {};
                      presenceHistory.forEach(p => { if (!parDate[p.date_seance]) parDate[p.date_seance]=[]; parDate[p.date_seance].push(p); });
                      return Object.entries(parDate).sort(([a],[b])=>b.localeCompare(a)).map(([date, rows]) => {
                        const presents = rows.filter(r=>r.statut==="present").length;
                        const total = rows.length;
                        const taux = total ? Math.round(presents/total*100) : 0;
                        return (
                          <div key={date} style={{ marginBottom:16, background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", overflow:"hidden" }}>
                            <div style={{ padding:"12px 16px", background:"#f8fafc", borderBottom:"1px solid #e5e7eb", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                              <span style={{ fontWeight:700, color:"#0f172a" }}>📅 {new Date(date).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</span>
                              <span style={{ fontSize:12, fontWeight:700, color:taux>=80?"#059669":taux>=60?"#d97706":"#dc2626" }}>
                                {presents}/{total} présents - {taux}%
                              </span>
                            </div>
                            <div style={{ padding:"10px 16px", display:"flex", flexWrap:"wrap", gap:6 }}>
                              {rows.map(r=>(
                                <span key={r.id} style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600,
                                  background:r.statut==="present"?"#d1fae5":r.statut==="absent"?"#fee2e2":r.statut==="retard"?"#fef3c7":"#ede9fe",
                                  color:r.statut==="present"?"#065f46":r.statut==="absent"?"#991b1b":r.statut==="retard"?"#92400e":"#5b21b6" }}>
                                  {r.statut==="present"?"✅":r.statut==="absent"?"❌":r.statut==="retard"?"⏰":"📝"} {[r.prenom_apprenant,r.nom_apprenant].filter(Boolean).join(" ")}
                                  {r.note && ` (${r.note})`}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      });
                    })()
                }
              </div>
            )}
          </div>
        )}

        {groupeSubTab==="sessions" && (() => {
          const now = new Date();
          const JOURS_FR = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
          const STATUT_META = {
            dispense:         { label:"Dispensé",         color:"#065f46", bg:"#d1fae5", icon:"✅" },
            annule:           { label:"Annulé",           color:"#991b1b", bg:"#fee2e2", icon:"❌" },
            apprenant_absent: { label:"Apprenant absent", color:"#92400e", bg:"#fef3c7", icon:"👤" },
            coach_absent:     { label:"Coach absent",     color:"#1e40af", bg:"#dbeafe", icon:"🏃" },
            catch_up:         { label:"Catch up",         color:"#5b21b6", bg:"#ede9fe", icon:"🔄" },
            holiday:          { label:"Congé / Férié",    color:"#374151", bg:"#f1f5f9", icon:"🏖️" },
          };
          const getSlot = (date_cours) => {
            const jour = JOURS_FR[new Date(date_cours + "T12:00:00").getDay()];
            const hor  = Array.isArray(selectedGroupe?.horaire) ? selectedGroupe.horaire : [];
            return hor.find(h => h.jour === jour) || hor[0] || null;
          };

          // ── Sessions live uniquement (triées par date desc) ───────
          const allRaw = sessGroupeLive
            .map(s => ({ _date:new Date(`${s.date}T${s.heure||"00:00"}`), _key:`live-${s.id}`, ...s }))
            .sort((a,b) => b._date - a._date);

          // ── Appliquer filtres date + statut ───────────────────────
          const borneDebut = sessDateDebutF ? new Date(sessDateDebutF) : null;
          const borneFin   = sessDateFinF   ? new Date(sessDateFinF + "T23:59:59") : null;
          const allFilt = allRaw.filter(i => {
            if (borneDebut && i._date < borneDebut) return false;
            if (borneFin   && i._date > borneFin)   return false;
            if (sessStatutFilter === "actif")   return i.statut !== "terminee";
            if (sessStatutFilter === "cloture") return i.statut === "terminee";
            return true;
          });

          // ── Pagination ────────────────────────────────────────────
          const totalPagesG = Math.max(1, Math.ceil(allFilt.length / SESS_G_PER_PAGE));
          const pageItemsG  = allFilt.slice(sessPageG * SESS_G_PER_PAGE, (sessPageG + 1) * SESS_G_PER_PAGE);
          const goPageG     = p => setSessPageG(Math.max(0, Math.min(p, totalPagesG - 1)));

          return (
            <div>
              <h3 style={{ margin:"0 0 14px", fontSize:15, fontWeight:800, color:"#0f172a" }}>📡 Sessions - {selectedGroupe?.nom}</h3>

              {/* Filtres */}
              <div style={{ background:"#f8fafc", borderRadius:10, padding:"12px 14px", marginBottom:16, display:"flex", flexDirection:"column", gap:10 }}>
                {/* Statut */}
                <RangeePastilles accent={BET} label="Statut :" valeur={sessStatutFilter} style={{ marginBottom:0 }}
                  onChange={(v) => { setSessStatutFilter(v); setSessPageG(0); }}
                  options={[{v:"all",l:"Toutes"},{v:"actif",l:"✅ À venir"},{v:"cloture",l:"🔒 Clôturées"}]} />
                {/* Date */}
                <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                  <span style={{ fontSize:11, fontWeight:700, color:"#64748b" }}>Du</span>
                  <input type="date" value={sessDateDebutF} onChange={e=>{setSessDateDebutF(e.target.value);setSessPageG(0);}}
                    style={{ padding:"5px 8px", borderRadius:6, border:"1.5px solid #e2e8f0", fontSize:12 }} />
                  <span style={{ fontSize:11, fontWeight:700, color:"#64748b" }}>au</span>
                  <input type="date" value={sessDateFinF} onChange={e=>{setSessDateFinF(e.target.value);setSessPageG(0);}}
                    style={{ padding:"5px 8px", borderRadius:6, border:"1.5px solid #e2e8f0", fontSize:12 }} />
                  {(sessDateDebutF||sessDateFinF) && (
                    <button onClick={()=>{setSessDateDebutF("");setSessDateFinF("");setSessPageG(0);}}
                      style={{ padding:"5px 10px", borderRadius:6, border:"none", background:"#fee2e2", color:"#dc2626", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                      ✕ Effacer
                    </button>
                  )}
                  <span style={{ marginLeft:"auto", fontSize:11, color:"#64748b" }}>{allFilt.length} session{allFilt.length>1?"s":""} · {allFilt.filter(i=>i.statut==="terminee").length} clôturée{allFilt.filter(i=>i.statut==="terminee").length>1?"s":""}</span>
                </div>
              </div>

              {sessGroupeLoading && <p style={{ textAlign:"center", color:"#9ca3af", padding:30 }}>⏳ Chargement…</p>}
              {!sessGroupeLoading && allFilt.length === 0 && (
                <div style={{ textAlign:"center", padding:"40px 20px", background:"#f8fafc", borderRadius:12, border:"1px solid #e5e7eb" }}>
                  <div style={{ fontSize:40, marginBottom:8 }}>📋</div>
                  <div style={{ fontWeight:700, color:"#0f172a" }}>Aucune session trouvée</div>
                  <p style={{ color:"#9ca3af", fontSize:13 }}>Ajustez les filtres ou enregistrez des cours.</p>
                </div>
              )}
              {!sessGroupeLoading && pageItemsG.map(item => {
                const isPast = item._date < now;
                if (item._type === "cours") {
                  const sm = STATUT_META[item.statut] || { label:item.statut||"-", bg:"#f1f5f9", color:"#64748b", icon:"-" };
                  return (
                    <div key={item._key} style={{ display:"flex", gap:12, padding:"12px 14px", borderRadius:10, border:"1px solid #e5e7eb", background:isPast?"#fafafa":"#fff", marginBottom:8 }}>
                      <div style={{ textAlign:"center", padding:"7px 9px", borderRadius:8, background:"#f0fdf4", flexShrink:0, minWidth:40 }}>
                        <div style={{ fontSize:18 }}>📗</div>
                        <div style={{ fontSize:9, color:"#16a34a", fontWeight:700, marginTop:2 }}>COURS</div>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{item.objectif || "Cours de groupe"}</div>
                        <div style={{ fontSize:11, color:"#6b7280", marginTop:3, display:"flex", gap:8, flexWrap:"wrap" }}>
                          <span>📅 {item._date.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}</span>
                          <span>📍 {JOURS_FR[item._date.getDay()]}</span>
                          {item.slot && <span>🕐 {item.slot.debut} – {item.slot.fin}</span>}
                          {item.grammaire && <span>📐 {item.grammaire}</span>}
                        </div>
                        {item.commentaire && <div style={{ fontSize:11, color:"#7c3aed", marginTop:3, fontStyle:"italic" }}>{item.commentaire}</div>}
                      </div>
                      <span style={{ padding:"4px 10px", borderRadius:10, fontSize:11, fontWeight:700, height:"fit-content", background:sm.bg, color:sm.color }}>{sm.icon} {sm.label}</span>
                    </div>
                  );
                }
                // live - icône basée sur la plateforme réelle
                const isClosed = item.statut === "terminee";
                const PLAT_META_S = {
                  zoom:       { icon:"🎥", label:"Zoom",       color:"#2563eb", bg:"#dbeafe" },
                  meet:       { icon:"🟢", label:"Google Meet", color:"#16a34a", bg:"#dcfce7" },
                  teams:      { icon:"🟣", label:"Teams",      color:"#7c3aed", bg:"#ede9fe" },
                  presentiel: { icon:"🏢", label:"Présentiel", color:"#059669", bg:"#ecfdf5" },
                  domicile:   { icon:"🏠", label:"Domicile",   color:"#9333ea", bg:"#fdf4ff" },
                  webex:      { icon:"🔵", label:"Webex",      color:"#0891b2", bg:"#e0f2fe" },
                };
                const plat = PLAT_META_S[item.plateforme] || { icon:"📡", label:"En ligne", color:"#2563eb", bg:"#dbeafe" };
                return (
                  <div key={item._key} style={{ display:"flex", gap:12, padding:"12px 14px", borderRadius:10, border:`1px solid ${isClosed?"#e5e7eb":plat.bg}`, background:isClosed?"#fafafa":`${plat.bg}55`, marginBottom:8 }}>
                    <div style={{ textAlign:"center", padding:"7px 9px", borderRadius:8, background:plat.bg, flexShrink:0, minWidth:40 }}>
                      <div style={{ fontSize:18 }}>{plat.icon}</div>
                      <div style={{ fontSize:9, color:plat.color, fontWeight:700, marginTop:2 }}>{plat.label.toUpperCase()}</div>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{item.titre}</div>
                      <div style={{ fontSize:11, color:"#6b7280", marginTop:3, display:"flex", gap:8, flexWrap:"wrap" }}>
                        <span>📅 {item._date.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}</span>
                        <span>🕐 {item.heure}</span>
                        {item.duree && <span>⏱ {item.duree} min</span>}
                      </div>
                      {item.notes && <div style={{ fontSize:11, color:"#6b7280", marginTop:3, fontStyle:"italic" }}>💬 {item.notes}</div>}
                    </div>
                    <span style={{ padding:"4px 10px", borderRadius:10, fontSize:11, fontWeight:700, height:"fit-content", background:isClosed?"#f1f5f9":isPast?"#fef3c7":"#dcfce7", color:isClosed?"#64748b":isPast?"#92400e":"#065f46" }}>
                      {isClosed?"🔒 Clôturée":isPast?"Passée":"✅ À venir"}
                    </span>
                  </div>
                );
              })}

              {/* Pagination */}
              {!sessGroupeLoading && totalPagesG > 1 && (
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:14, padding:"10px 14px", background:"#f8fafc", borderRadius:10 }}>
                  <button onClick={()=>goPageG(sessPageG-1)} disabled={sessPageG===0}
                    style={{ padding:"6px 12px", borderRadius:7, border:"1.5px solid #e2e8f0", background:sessPageG===0?"#f1f5f9":"#fff", color:sessPageG===0?"#9ca3af":"#374151", fontWeight:700, fontSize:12, cursor:sessPageG===0?"default":"pointer" }}>← Préc.</button>
                  <div style={{ display:"flex", gap:4 }}>
                    {Array.from({length:totalPagesG},(_,i)=>i).map(i=>(
                      <button key={i} onClick={()=>goPageG(i)}
                        style={{ width:28, height:28, borderRadius:6, border:`1.5px solid ${i===sessPageG?BET:"#e2e8f0"}`, background:i===sessPageG?BET:"#fff", color:i===sessPageG?"#fff":"#374151", fontWeight:700, fontSize:12, cursor:"pointer" }}>
                        {i+1}
                      </button>
                    ))}
                  </div>
                  <button onClick={()=>goPageG(sessPageG+1)} disabled={sessPageG>=totalPagesG-1}
                    style={{ padding:"6px 12px", borderRadius:7, border:"1.5px solid #e2e8f0", background:sessPageG>=totalPagesG-1?"#f1f5f9":"#fff", color:sessPageG>=totalPagesG-1?"#9ca3af":"#374151", fontWeight:700, fontSize:12, cursor:sessPageG>=totalPagesG-1?"default":"pointer" }}>Suiv. →</button>
                </div>
              )}
              {!sessGroupeLoading && allFilt.length > 0 && (
                <div style={{ textAlign:"center", fontSize:11, color:"#9ca3af", marginTop:8 }}>
                  {sessPageG*SESS_G_PER_PAGE+1}–{Math.min((sessPageG+1)*SESS_G_PER_PAGE,allFilt.length)} sur {allFilt.length} session{allFilt.length>1?"s":""}
                </div>
              )}
            </div>
          );
        })()}

        {groupeSubTab==="honoraire" && (() => {
          const MOIS_NOMS = ["","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
          const JOURS_FR  = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
          const STATUT_PAYANT = { dispense:true, apprenant_absent:true, catch_up:true, annule:false, coach_absent:false, holiday:false };
          const STATUT_LABEL  = { dispense:"Dispensé", annule:"Annulé", apprenant_absent:"Appr. absent", coach_absent:"Coach absent", catch_up:"Catch up", holiday:"Férié" };

          const grade      = coachMoi?.grade || coachBase?.coach_info?.grade || "Vacataire";
          const typeContrat = coachMoi?.type_contrat || coachBase?.coach_info?.type_contrat || "Freelance";
          const typeCours  = selectedGroupe?.type_cours || "en_ligne";
          const grille     = grillePA || { tarifs: GRILLE_TARIFAIRE, multiplicateurs: { "A1-A2":1, "B1-B2":1.2, "C1-C2":1.5 } };
          const niveauGroupe = selectedGroupe?.niveau || "B1";
          const niveauKey  = ["A1","A2"].includes(niveauGroupe) ? "A1-A2" : ["B1","B2"].includes(niveauGroupe) ? "B1-B2" : "C1-C2";
          const typeKey    = typeCours.includes("ligne") ? "en_ligne" : typeCours.includes("domicile") ? "domicile" : "presentiel";
          const tarifBase  = coachMoi?.taux_horaire
            || grille.tarifs?.[grade]?.[typeKey]
            || GRILLE_TARIFAIRE[grade]?.[typeKey]
            || 5000;
          const multiplicateur = grille.multiplicateurs?.[niveauKey] || 1;
          const tarifH     = Math.round(tarifBase * multiplicateur);
          const formatMoney = (v) => new Intl.NumberFormat("fr-FR").format(Math.round(v)) + " FCFA";

          // ── Helpers durée ────────────────────────────────────────
          const getDuree = (date_cours) => {
            const jour = JOURS_FR[new Date(date_cours + "T12:00:00").getDay()];
            const hor  = Array.isArray(selectedGroupe?.horaire) ? selectedGroupe.horaire : [];
            const slot = hor.find(h => h.jour === jour) || hor[0];
            if (!slot?.debut || !slot?.fin) return calcHeureSemaine(hor) / Math.max(hor.length, 1) || 1.5;
            const [dh, dm] = slot.debut.split(":").map(Number);
            const [fh, fm] = slot.fin.split(":").map(Number);
            const dur = (fh * 60 + fm - dh * 60 - dm) / 60;
            return dur > 0 ? dur : 1.5;
          };
          const getSlot = (date_cours) => {
            const jour = JOURS_FR[new Date(date_cours + "T12:00:00").getDay()];
            const hor  = Array.isArray(selectedGroupe?.horaire) ? selectedGroupe.horaire : [];
            return hor.find(h => h.jour === jour) || hor[0] || null;
          };

          // ── Filtrage par mois/année (même source que l'onglet Sessions) ──
          const coursHonor = sessGroupeCours
            .filter(c => {
              const d = new Date(c.date_cours + "T12:00:00");
              return d.getMonth()+1 === honorMois && d.getFullYear() === honorAnnee;
            })
            .map(c => {
              const duree   = getDuree(c.date_cours);
              const slot    = getSlot(c.date_cours);
              const payant  = STATUT_PAYANT[c.statut] === true;
              const montant = payant ? duree * tarifH : 0;
              return { ...c, _type:"cours", duree, slot, payant, montant };
            });

          const liveHonor = sessGroupeLive
            .filter(s => {
              if (s.statut !== "terminee") return false;
              const d = new Date(`${s.date}T${s.heure||"00:00"}`);
              return d.getMonth()+1 === honorMois && d.getFullYear() === honorAnnee;
            })
            .map(s => {
              const duree   = (s.duree || 90) / 60;
              const montant = duree * tarifH;
              return { ...s, _type:"live", duree, payant:true, montant };
            });

          const allHonor   = [...coursHonor, ...liveHonor].sort((a,b) => {
            const da = new Date(a.date_cours || `${a.date}T${a.heure||"00:00"}`);
            const db = new Date(b.date_cours || `${b.date}T${b.heure||"00:00"}`);
            return db - da;
          });
          const payantes   = allHonor.filter(s => s.payant);
          const heuresTotal  = payantes.reduce((s,c) => s + c.duree, 0);
          const montantTotal = payantes.reduce((s,c) => s + c.montant, 0);

          return (
            <div>
              {/* En-tête + sélecteur mois/année */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, flexWrap:"wrap", gap:10 }}>
                <h3 style={{ margin:0, fontSize:15, fontWeight:800, color:"#0f172a" }}>💰 Honoraires - {selectedGroupe?.nom}</h3>
                <div style={{ display:"flex", gap:8 }}>
                  <select value={honorMois} onChange={e=>{setHonorMois(Number(e.target.value));}}
                    style={{ padding:"7px 10px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:12, fontWeight:600 }}>
                    {MOIS_NOMS.slice(1).map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                  <select value={honorAnnee} onChange={e=>setHonorAnnee(Number(e.target.value))}
                    style={{ padding:"7px 10px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:12, fontWeight:600 }}>
                    {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {/* KPIs */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:22 }}>
                {[
                  { label:"Séances rémunérées", val:payantes.length, sub:`sur ${allHonor.length} au total`, bg:"linear-gradient(135deg,#059669,#10b981)" },
                  { label:"Heures dispensées",   val:`${heuresTotal.toFixed(1)}h`, sub:"séances payantes", bg:`linear-gradient(135deg,#0f172a,${BET})` },
                  { label:"Taux horaire",        val:`${new Intl.NumberFormat("fr-FR").format(tarifH)} F/h`, sub:`${grade} · ×${multiplicateur} niveau ${niveauGroupe}`, bg:"linear-gradient(135deg,#7c3aed,#a78bfa)" },
                  { label:"Montant dû",          val:formatMoney(montantTotal), sub:`${MOIS_NOMS[honorMois]} ${honorAnnee}`, bg:"linear-gradient(135deg,#d97706,#f59e0b)" },
                ].map(k => (
                  <div key={k.label} style={{ background:k.bg, borderRadius:12, padding:"14px 16px", color:"#fff" }}>
                    <div style={{ fontSize:10, opacity:0.8, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:4 }}>{k.label}</div>
                    <div style={{ fontSize:19, fontWeight:900, marginBottom:2 }}>{k.val}</div>
                    <div style={{ fontSize:10, opacity:0.75 }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {sessGroupeLoading && <p style={{ textAlign:"center", color:"#9ca3af", padding:30 }}>⏳ Chargement…</p>}
              {!sessGroupeLoading && allHonor.length === 0 && (
                <div style={{ textAlign:"center", padding:"40px 20px", background:"#f8fafc", borderRadius:12, border:"1px solid #e5e7eb" }}>
                  <div style={{ fontSize:40, marginBottom:8 }}>💰</div>
                  <div style={{ fontWeight:700, color:"#0f172a" }}>Aucune séance ce mois-ci</div>
                  <p style={{ color:"#9ca3af", fontSize:13 }}>Enregistrez des cours ou clôturez des sessions live.</p>
                </div>
              )}
              {!sessGroupeLoading && allHonor.length > 0 && (
                <div style={{ borderRadius:12, border:"1px solid #e5e7eb", overflow:"hidden", marginBottom:20 }}>
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                      <thead>
                        <tr style={{ background:"#f8fafc" }}>
                          {["Type","Date","Durée","Statut","Rémunération"].map(h=>(
                            <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontWeight:700, color:"#374151", fontSize:11, borderBottom:"2px solid #e5e7eb", whiteSpace:"nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allHonor.map((s, idx) => {
                          const dateStr = s._type === "cours"
                            ? new Date(s.date_cours).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})
                            : new Date(`${s.date}T${s.heure||"00:00"}`).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"});
                          const label = s._type === "cours"
                            ? (STATUT_LABEL[s.statut] || s.statut || "-")
                            : "Live clôturée";
                          const badge = s._type === "cours"
                            ? { bg: s.payant?"#d1fae5":"#fee2e2", c: s.payant?"#065f46":"#991b1b" }
                            : { bg:"#dbeafe", c:"#2563eb" };
                          return (
                            <tr key={`${s._type}-${s.id}`} style={{ background:idx%2===0?"#fff":"#fafafa", borderBottom:"1px solid #f1f5f9" }}>
                              <td style={{ padding:"10px 14px" }}>
                                {(() => {
                                  const PLAT_H = {
                                    zoom:       { icon:"🎥", label:"Zoom",        bg:"#dbeafe", c:"#2563eb" },
                                    meet:       { icon:"🟢", label:"Google Meet", bg:"#dcfce7", c:"#16a34a" },
                                    teams:      { icon:"🟣", label:"Teams",       bg:"#ede9fe", c:"#7c3aed" },
                                    presentiel: { icon:"🏢", label:"Présentiel",  bg:"#ecfdf5", c:"#059669" },
                                    domicile:   { icon:"🏠", label:"Domicile",    bg:"#fdf4ff", c:"#9333ea" },
                                    webex:      { icon:"🔵", label:"Webex",       bg:"#e0f2fe", c:"#0891b2" },
                                  };
                                  if (s._type === "live") {
                                    const p = PLAT_H[s.plateforme] || { icon:"📡", label:"En ligne", bg:"#dbeafe", c:"#2563eb" };
                                    return <span style={{ padding:"3px 8px", borderRadius:10, fontSize:10, fontWeight:700, background:p.bg, color:p.c }}>{p.icon} {p.label}</span>;
                                  }
                                  const tc = selectedGroupe?.type_cours || typeCours;
                                  const p = PLAT_H[tc] || { icon:"💻", label:"En ligne", bg:"#f0f9ff", c:"#0891b2" };
                                  return <span style={{ padding:"3px 8px", borderRadius:10, fontSize:10, fontWeight:700, background:p.bg, color:p.c }}>{p.icon} {p.label}</span>;
                                })()}
                              </td>
                              <td style={{ padding:"10px 14px", fontWeight:600, whiteSpace:"nowrap", color:"#0f172a" }}>{dateStr}</td>
                              <td style={{ padding:"10px 14px", fontWeight:700, color:BET, whiteSpace:"nowrap" }}>
                                {s.duree % 1 === 0 ? `${s.duree}h` : `${s.duree.toFixed(1)}h`}
                              </td>
                              <td style={{ padding:"10px 14px" }}>
                                <span style={{ padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:700, background:badge.bg, color:badge.c, whiteSpace:"nowrap" }}>
                                  {label}
                                </span>
                              </td>
                              <td style={{ padding:"10px 14px", fontWeight:800, fontSize:13, color:s.payant?"#059669":"#9ca3af", whiteSpace:"nowrap" }}>
                                {s.payant ? formatMoney(s.montant) : <span style={{ fontSize:11, fontStyle:"italic" }}>Non rémunéré</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding:"13px 18px", background:"#f0fdf4", borderTop:"2px solid #d1fae5", display:"flex", justifyContent:"flex-end", alignItems:"center", gap:24, flexWrap:"wrap" }}>
                    <span style={{ fontSize:12, color:"#374151", fontWeight:600 }}>{heuresTotal.toFixed(1)}h rémunérées</span>
                    <span style={{ fontSize:15, fontWeight:900, color:"#059669" }}>Total : {formatMoney(montantTotal)}</span>
                  </div>
                </div>
              )}

              {/* Récap contrat */}
              <div style={{ background:BET_GRAD, borderRadius:14, padding:"18px 22px", color:"#fff" }}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:12, color:"#7dd3fc" }}>📋 Récapitulatif contrat - {selectedGroupe?.nom}</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:12 }}>
                  {[
                    { l:"Grade",              v: grade },
                    { l:"Type contrat",       v: typeContrat },
                    { l:"Type de cours",      v: typeCours==="en_ligne"?"En ligne":typeCours==="domicile"?"Domicile":"Présentiel" },
                    { l:"Niveau groupe",      v: niveauGroupe },
                    { l:"Tarif de base",      v: `${new Intl.NumberFormat("fr-FR").format(tarifBase)} FCFA/h` },
                    { l:"Multiplicateur niv.", v: `×${multiplicateur}` },
                    { l:"Taux effectif",      v: `${new Intl.NumberFormat("fr-FR").format(tarifH)} FCFA/h` },
                    { l:"Montant période",    v: formatMoney(montantTotal) },
                  ].map(r => (
                    <div key={r.l} style={{ padding:"10px 14px", background:"rgba(255,255,255,0.08)", borderRadius:10, border:"1px solid rgba(255,255,255,0.12)" }}>
                      <div style={{ fontSize:10, color:"#93c5fd", fontWeight:600, marginBottom:3, textTransform:"uppercase", letterSpacing:"0.05em" }}>{r.l}</div>
                      <div style={{ fontSize:14, fontWeight:800 }}>{r.v}</div>
                    </div>
                  ))}
                </div>
                {!grillePA && <div style={{ marginTop:12, fontSize:11, color:"#fbbf24", opacity:0.8 }}>⚠️ Grille tarifaire PA non chargée - utilisation de la grille par défaut</div>}
              </div>
            </div>
          );
        })()}

        {groupeSubTab==="mouvements" && (
          <div style={{ padding:"18px 20px" }}>
            <MouvementsClasse groupeId={selectedGroupe?.id} authHdrs={() => ({ Authorization: `Bearer ${localStorage.getItem("coach_token") || localStorage.getItem("admin_token")}` })} />
          </div>
        )}

        {groupeSubTab==="historique" && (() => {
          const MOIS_FR = ["","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
          const libMois = (p) => { const [y,m] = String(p).split("-"); return `${MOIS_FR[parseInt(m,10)] || p} ${y}`; };
          const formatMoney = (v) => new Intl.NumberFormat("fr-FR").format(Math.round(v||0)) + " FCFA";
          const d = histoContrat;
          // Le vocabulaire de la base est au féminin - « une séance » : planifiee,
          // realisee, annulee, terminee. Le masculin ne correspondait à rien.
          const STATUT_SEANCE = {
            realisee: { l:"Réalisée", c:"#15803d", bg:"#dcfce7" },
            terminee: { l:"Terminée", c:"#15803d", bg:"#dcfce7" },
            planifiee:{ l:"Planifiée", c:"#b45309", bg:"#fef3c7" },
            en_cours: { l:"En direct", c:"#b91c1c", bg:"#fee2e2" },
            annulee:  { l:"Annulée",  c:"#b91c1c", bg:"#fee2e2" },
          };

          const exportData = () => ({
            titre: `Historique des cours - ${selectedGroupe?.nom || ""}`,
            sousTitre: `${d?.totaux?.nb_seances || 0} séance(s) · ${d?.totaux?.total_heures || 0}h · ${formatMoney(d?.totaux?.montant_total || 0)}`,
            colonnes: [{label:"Mois"},{label:"Séances",align:"right"},{label:"Réalisées",align:"right"},{label:"Heures",align:"right"},{label:"Montant",align:"right"},{label:"Validé",align:"right"}],
            lignes: (d?.mois || []).map(m => [
              libMois(m.periode), String(m.nb_seances), String(m.nb_realisees),
              `${m.total_heures}h`, formatMoney(m.montant_total), formatMoney(m.montant_valide),
            ]),
          });

          return (
            <div style={{ padding:"18px 20px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap", marginBottom:16 }}>
                <div>
                  <h3 style={{ margin:0, fontSize:15, fontWeight:800, color:"#0f172a" }}>📜 Historique des cours - {selectedGroupe?.nom}</h3>
                  <div style={{ fontSize:12, color:"#6b7280", marginTop:3 }}>
                    Ce qui a réellement été dispensé, mois par mois - à distinguer de l'onglet Honoraire, qui simule un mois à partir de la grille.
                  </div>
                </div>
                {(d?.mois || []).length > 0 && (
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={()=>exporterExcelStyle({ nomFichier:`historique_${(selectedGroupe?.nom||"contrat").replace(/\s+/g,"_")}`, ...exportData() })}
                      style={btnSecondary}>📊 Excel</button>
                    <button onClick={()=>genererPDF(exportData())} style={btnSecondary}>📄 PDF</button>
                  </div>
                )}
              </div>

              {histoLoading ? (
                <div style={{ textAlign:"center", padding:40, color:"#94a3b8", fontSize:13 }}>⏳ Chargement…</div>
              ) : !(d?.mois || []).length ? (
                <div style={{ textAlign:"center", padding:"44px 20px", border:"2px dashed #e5e7eb", borderRadius:14, color:"#94a3b8" }}>
                  <div style={{ fontSize:40, marginBottom:10 }}>📜</div>
                  <div style={{ fontWeight:700, color:"#64748b", marginBottom:4 }}>Aucune séance enregistrée</div>
                  <div style={{ fontSize:12.5 }}>L'historique se remplira au fur et à mesure des cours dispensés sur ce contrat.</div>
                </div>
              ) : (
                <>
                  {/* Totaux - le montant validé est celui sur lequel le coach sera payé ;
                      le distinguer du total évite de faire attendre une somme en litige. */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:18 }}>
                    {[
                      { l:"Séances", v:d.totaux.nb_seances, c:"#0f172a" },
                      { l:"Heures", v:`${d.totaux.total_heures}h`, c:"#0369a1" },
                      { l:"Montant total", v:formatMoney(d.totaux.montant_total), c:"#b45309" },
                      { l:"Dont validé", v:formatMoney(d.totaux.montant_valide), c:"#15803d" },
                    ].map(k => (
                      <div key={k.l} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"13px 16px" }}>
                        <div style={{ fontSize:10, fontWeight:800, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".05em" }}>{k.l}</div>
                        <div style={{ fontSize:19, fontWeight:900, color:k.c, marginTop:4 }}>{k.v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, overflow:"hidden" }}>
                    {d.mois.map((m, i) => {
                      const ouvert = histoMoisOuvert === m.periode;
                      return (
                        <div key={m.periode} style={{ borderBottom: i < d.mois.length-1 ? "1px solid #f1f5f9" : "none" }}>
                          <div onClick={()=>setHistoMoisOuvert(ouvert ? null : m.periode)}
                            style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", cursor:"pointer", background: ouvert ? "#f8fafc" : "#fff", flexWrap:"wrap" }}>
                            <span style={{ fontSize:13, color:"#94a3b8", transform: ouvert ? "rotate(90deg)" : "none", display:"inline-block", transition:"transform .15s" }}>›</span>
                            <div style={{ flex:"1 1 150px", fontWeight:800, fontSize:13.5, color:"#0f172a" }}>{libMois(m.periode)}</div>
                            <div style={{ fontSize:12, color:"#64748b", whiteSpace:"nowrap" }}>
                              {m.nb_realisees}/{m.nb_seances} réalisée{m.nb_seances>1?"s":""}
                              {m.nb_annulees > 0 && <span style={{ color:"#b91c1c" }}> · {m.nb_annulees} annulée{m.nb_annulees>1?"s":""}</span>}
                            </div>
                            <div style={{ fontSize:12.5, fontWeight:700, color:"#0369a1", whiteSpace:"nowrap", minWidth:56, textAlign:"right" }}>{m.total_heures}h</div>
                            <div style={{ fontSize:13, fontWeight:800, color:"#0f172a", whiteSpace:"nowrap", minWidth:96, textAlign:"right" }}>{formatMoney(m.montant_total)}</div>
                            <span style={{ fontSize:10.5, fontWeight:700, padding:"2px 9px", borderRadius:999, whiteSpace:"nowrap",
                              background: m.montant_valide >= m.montant_total && m.montant_total > 0 ? "#dcfce7" : "#fef3c7",
                              color: m.montant_valide >= m.montant_total && m.montant_total > 0 ? "#15803d" : "#b45309" }}>
                              {m.montant_valide >= m.montant_total && m.montant_total > 0 ? "Validé" : `${formatMoney(m.montant_valide)} validé`}
                            </span>
                          </div>

                          {ouvert && (
                            <div style={{ padding:"4px 16px 14px 40px", display:"flex", flexDirection:"column", gap:5 }}>
                              {m.seances.map(s => {
                                const st = STATUT_SEANCE[s.statut] || { l:s.statut||"-", c:"#64748b", bg:"#f1f5f9" };
                                return (
                                  <div key={s.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 12px", borderRadius:8, background:"#f8fafc", flexWrap:"wrap" }}>
                                    <span style={{ fontSize:11.5, color:"#64748b", whiteSpace:"nowrap", minWidth:76 }}>
                                      {s.date_seance ? new Date(s.date_seance).toLocaleDateString("fr-FR",{day:"2-digit",month:"short"}) : "-"}
                                      {s.heure_debut ? ` · ${String(s.heure_debut).slice(0,5)}` : ""}
                                    </span>
                                    <span style={{ flex:"1 1 140px", fontSize:12.5, color:"#0f172a", fontWeight:600 }}>{s.titre || "Séance"}</span>
                                    <span style={{ fontSize:11.5, color:"#0369a1", whiteSpace:"nowrap" }}>{parseFloat(s.duree_h||0).toFixed(1)}h</span>
                                    <span style={{ fontSize:11.5, fontWeight:700, color:"#374151", whiteSpace:"nowrap", minWidth:80, textAlign:"right" }}>{formatMoney(s.honoraire_montant||0)}</span>
                                    <span style={{ fontSize:10, fontWeight:700, padding:"1px 8px", borderRadius:999, background:st.bg, color:st.c, whiteSpace:"nowrap" }}>{st.l}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })()}

            </div>
          </div>
        </div>
      )}
  </div>
)}

            {/* ════════ DISPONIBILITÉS ════════ */}
            {activeTab==="disponibilites" && (() => {
              const now = new Date();
              const estMoisReelCourant = dispoMois === now.getMonth()+1 && dispoAnnee === now.getFullYear();
              const MOIS_LABELS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
              const allerAuMoisCourant = () => {
                const m = now.getMonth()+1, a = now.getFullYear();
                setDispoMois(m); setDispoAnnee(a);
                chargerDisponibilites(m, a);
              };
              const changerMois = (m, a) => {
                setDispoMois(m); setDispoAnnee(a);
                chargerDisponibilites(m, a);
              };
              return (
              <div>
                <div style={tabHeader}>
                  <div>
                    <h2 style={tabTitle}>🗓️ Mes Disponibilités</h2>
                    <p style={tabSubtitle}>Indiquez vos créneaux libres toute la semaine (y compris week-end) - votre planning sera transmis automatiquement à l'assistance onboarding qui programmera les cours et les salles. La disponibilité doit être renseignée <strong>chaque mois</strong>.</p>
                  </div>
                  <button onClick={async () => {
                    if (dispoLoading) return;
                    const token = localStorage.getItem("coach_token");
                    if (!token) { toast.error("Session expirée, veuillez vous reconnecter"); return; }
                    const slots = [];
                    JOURS_SEMAINE.forEach(j => {
                      const ranges = disponibilites[j] || [];
                      CRENEAUX_DEF.forEach(c => {
                        const inRange = ranges.some(r => c.debut >= r.debut && c.fin <= r.fin);
                        slots.push({ jour: j, creneau: c.id, debut: c.debut, fin: c.fin, dispo: inRange });
                      });
                    });
                    setDispoLoading(true);
                    try {
                      const r = await fetch(`${API_URL}/api/coachs/disponibilites`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ slots, mois: dispoMois, annee: dispoAnnee }),
                      });
                      const data = await r.json();
                      if (!r.ok) throw new Error(data.error || "Erreur");
                      setDispoSaved(true);
                      setDispoPreRempli(false);
                      if (estMoisReelCourant) setDispoMoisCourantRempli(true);
                      toast.success(`Disponibilités de ${MOIS_LABELS[dispoMois-1]} ${dispoAnnee} transmises à l'assistance onboarding ✓`);
                      setTimeout(() => setDispoSaved(false), 3000);
                    } catch (err) {
                      toast.error(err.message || "Erreur lors de l'enregistrement");
                    } finally {
                      setDispoLoading(false);
                    }
                  }} disabled={dispoLoading} style={{ padding:"9px 20px", background:BET, color:"#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:13, cursor: dispoLoading ? "wait" : "pointer", opacity: dispoLoading ? 0.7 : 1 }}>
                    {dispoLoading ? "⏳ Enregistrement..." : `💾 Enregistrer pour ${MOIS_LABELS[dispoMois-1]} ${dispoAnnee}`}
                  </button>
                </div>

                {/* Sélecteur de mois */}
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, flexWrap:"wrap" }}>
                  <select value={dispoMois} onChange={e=>changerMois(Number(e.target.value), dispoAnnee)}
                    style={{ padding:"7px 10px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, fontWeight:600 }}>
                    {MOIS_LABELS.map((m,i)=><option key={m} value={i+1}>{m}</option>)}
                  </select>
                  <select value={dispoAnnee} onChange={e=>changerMois(dispoMois, Number(e.target.value))}
                    style={{ padding:"7px 10px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, fontWeight:600 }}>
                    {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(a=><option key={a} value={a}>{a}</option>)}
                  </select>
                  {estMoisReelCourant && <span style={{ fontSize:11, fontWeight:700, color:BET, background:BET_LIGHT, padding:"3px 10px", borderRadius:20 }}>Mois courant</span>}
                </div>

                {/* Alerte : mois courant non renseigné */}
                {dispoMoisCourantRempli===false && (
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, padding:"12px 16px", marginBottom:16, flexWrap:"wrap" }}>
                    <div style={{ color:"#991b1b", fontSize:13, fontWeight:600 }}>
                      ⚠️ Vous n'avez pas encore renseigné vos disponibilités pour {MOIS_LABELS[now.getMonth()]} {now.getFullYear()}. Votre planning ne pourra pas être programmé pour ce mois tant que ce n'est pas fait.
                    </div>
                    {!estMoisReelCourant && (
                      <button onClick={allerAuMoisCourant} style={{ padding:"6px 14px", background:"#dc2626", color:"#fff", border:"none", borderRadius:7, fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
                        Aller au mois courant
                      </button>
                    )}
                  </div>
                )}

                {dispoPreRempli && (
                  <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10, padding:"10px 16px", marginBottom:16, color:"#92400e", fontWeight:600, fontSize:13 }}>
                    ℹ️ Créneaux repris du mois précédent à titre indicatif - ajustez-les puis cliquez sur "Enregistrer" pour valider {MOIS_LABELS[dispoMois-1]} {dispoAnnee}.
                  </div>
                )}

                {dispoSaved && (
                  <div style={{ background:"#d1fae5", border:"1px solid #6ee7b7", borderRadius:10, padding:"10px 16px", marginBottom:16, color:"#065f46", fontWeight:600, fontSize:13 }}>
                    ✅ Disponibilités transmises à l'assistance onboarding du {coachCentreLabel || "centre BET"}. Les cours seront programmés en conséquence.
                  </div>
                )}

                {/* Formulaire jour par jour */}
                <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:24 }}>
                  {/* En-tête colonnes */}
                  <div style={{ display:"grid", gridTemplateColumns:"120px 1fr", gap:12, paddingBottom:6, borderBottom:"1px solid #e5e7eb" }}>
                    <span style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.05em" }}>Jour</span>
                    <span style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.05em" }}>Créneaux disponibles</span>
                  </div>

                  {JOURS_SEMAINE.map(jour => {
                    const ranges = disponibilites[jour] || [];

                    function addRange() {
                      const defDebut = "08:00";
                      const defFin   = "12:00";
                      setDisponibilites(prev => ({ ...prev, [jour]: [...(prev[jour]||[]), { debut:defDebut, fin:defFin }] }));
                    }
                    function removeRange(idx) {
                      setDisponibilites(prev => ({ ...prev, [jour]: prev[jour].filter((_,i) => i!==idx) }));
                    }
                    function updateRange(idx, field, val) {
                      setDisponibilites(prev => ({
                        ...prev,
                        [jour]: prev[jour].map((r,i) => i===idx ? { ...r, [field]:val } : r),
                      }));
                    }

                    const isWeekend = jour === "Samedi" || jour === "Dimanche";

                    return (
                      <div key={jour} style={{ display:"grid", gridTemplateColumns:"120px 1fr", gap:12, alignItems:"flex-start", padding:"10px 0", borderBottom:"1px solid #f1f5f9" }}>
                        {/* Nom du jour */}
                        <div style={{ display:"flex", alignItems:"center", gap:6, paddingTop:4 }}>
                          <span style={{ fontSize:13, fontWeight:700, color: ranges.length>0?"#0f172a":isWeekend?"#d1d5db":"#9ca3af" }}>{jour}</span>
                          {isWeekend && ranges.length===0 && <span style={{ fontSize:10, color:"#d1d5db" }}>WE</span>}
                        </div>

                        {/* Plages horaires */}
                        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                          {ranges.length === 0 ? (
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <span style={{ fontSize:12, color:"#d1d5db", fontStyle:"italic" }}>Non disponible</span>
                              <button onClick={addRange}
                                style={{ padding:"4px 12px", borderRadius:20, border:`1px dashed ${BET}`, background:"transparent", color:BET, fontSize:11, fontWeight:600, cursor:"pointer" }}>
                                + Ajouter un créneau
                              </button>
                            </div>
                          ) : (
                            <>
                              {ranges.map((range, idx) => {
                                const heuresDebut = HEURES_DISPO.slice(0, -1);
                                const heuresFin   = HEURES_DISPO.filter(h => h > range.debut);
                                return (
                                  <div key={idx} style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                    <span style={{ fontSize:12, color:"#64748b", minWidth:20 }}>De</span>
                                    <select value={range.debut}
                                      onChange={e => {
                                        const newDebut = e.target.value;
                                        const newFin   = range.fin <= newDebut ? HEURES_DISPO[HEURES_DISPO.indexOf(newDebut)+1] || range.fin : range.fin;
                                        updateRange(idx, "debut", newDebut);
                                        if (newFin !== range.fin) updateRange(idx, "fin", newFin);
                                      }}
                                      style={{ padding:"5px 8px", borderRadius:6, border:"1.5px solid #e2e8f0", fontSize:13, fontWeight:600, color:"#0f172a", cursor:"pointer", background:"#fff", outline:"none" }}>
                                      {heuresDebut.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    <span style={{ fontSize:12, color:"#64748b" }}>à</span>
                                    <select value={range.fin}
                                      onChange={e => updateRange(idx, "fin", e.target.value)}
                                      style={{ padding:"5px 8px", borderRadius:6, border:"1.5px solid #e2e8f0", fontSize:13, fontWeight:600, color:"#0f172a", cursor:"pointer", background:"#fff", outline:"none" }}>
                                      {heuresFin.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    <span style={{ padding:"2px 8px", borderRadius:12, background:BET_LIGHT, color:BET, fontSize:11, fontWeight:700 }}>
                                      {(() => {
                                        const [dh,dm] = range.debut.split(":").map(Number);
                                        const [fh,fm] = range.fin.split(":").map(Number);
                                        const dur = (fh*60+fm)-(dh*60+dm);
                                        return `${Math.floor(dur/60)}h${dur%60?String(dur%60).padStart(2,'0'):''}`;
                                      })()}
                                    </span>
                                    <button onClick={() => removeRange(idx)}
                                      style={{ padding:"4px 8px", borderRadius:6, border:"1px solid #fecdd3", background:"#fff1f2", color:"#ef4444", fontSize:12, cursor:"pointer", lineHeight:1, fontWeight:700 }}>×</button>
                                  </div>
                                );
                              })}
                              <button onClick={addRange}
                                style={{ alignSelf:"flex-start", padding:"3px 10px", borderRadius:20, border:`1px dashed ${BET}`, background:"transparent", color:BET, fontSize:11, fontWeight:600, cursor:"pointer", marginTop:2 }}>
                                + Ajouter
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Résumé */}
                <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:12, padding:"16px 20px" }}>
                  <h4 style={{ margin:"0 0 10px", fontSize:13, fontWeight:800, color:"#0369a1" }}>📋 Récapitulatif</h4>
                  {JOURS_SEMAINE.every(j => (disponibilites[j]||[]).length === 0) ? (
                    <p style={{ color:"#94a3b8", fontSize:13, margin:0 }}>Aucun créneau renseigné. Ajoutez vos disponibilités ci-dessus.</p>
                  ) : (
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                      {JOURS_SEMAINE.map(j => {
                        const ranges = disponibilites[j] || [];
                        if (!ranges.length) return null;
                        return (
                          <div key={j} style={{ background:"#fff", border:"1px solid #bae6fd", borderRadius:8, padding:"8px 12px", minWidth:140 }}>
                            <div style={{ fontWeight:800, color:"#0891b2", fontSize:12, marginBottom:4 }}>{j}</div>
                            {ranges.map((r, i) => (
                              <div key={i} style={{ fontSize:11, color:"#475569" }}>• {r.debut} – {r.fin}</div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              );
            })()}

            {/* ════════ MON PROFIL ════════ */}
            {activeTab==="profil" && (
              <div>
                <div style={tabHeader}>
                  <div><h2 style={tabTitle}>Mon Profil Professeur</h2><p style={tabSubtitle}>Informations personnelles et professionnelles</p></div>
                  <button onClick={()=>toast.success("Modifications enregistrées ✓")} style={btnPrimary}>💾 Enregistrer</button>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
                  {/* Infos perso */}
                  <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:20, padding:"14px 16px", borderRadius:10, background:"#fff", border:"1px solid #e5e7eb" }}>
                      <div style={{ position:"relative", flexShrink:0 }}>
                        <div style={{ width:64, height:64, borderRadius:"50%", background:BET_GRAD, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:22, color:"#fff", overflow:"hidden" }}>
                          {(coachAvatarUrl || MON_PROFIL_REEL.photo_url)
                            ? <img src={coachAvatarUrl || MON_PROFIL_REEL.photo_url} alt={MON_PROFIL_REEL.prenom} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                            : MON_PROFIL_REEL.avatar}
                        </div>
                        <label title="Changer la photo" style={{ position:"absolute", bottom:0, right:0, width:22, height:22, borderRadius:"50%", background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:12, border:"2px solid #fff" }}>
                          📷
                          <input type="file" accept="image/*" style={{ display:"none" }} onChange={(e) => { const f=e.target.files?.[0]; if(f){ uploadFichier(f, "avatar").then(handleCoachAvatarSuccess).catch(e=>toast.error(e.message)); } e.target.value=""; }} />
                        </label>
                      </div>
                      <div>
                        <div style={{ fontSize:18, fontWeight:800, display:"flex", alignItems:"center", gap:6 }}>
                          Prof. {nomAffiche({ ...MON_PROFIL_REEL, surnom: surnomPerso })}
                          <BoutonMonProfil onClick={() => setMonProfilOuvert(true)} couleurTexte="#94a3b8" />
                        </div>
                        {surnomPerso.trim() && (
                          <div style={{ fontSize:12, color:"#9ca3af" }}>{MON_PROFIL_REEL.prenom} {MON_PROFIL_REEL.nom}</div>
                        )}
                        <div style={{ fontSize:13, color:"#6b7280" }}>{MON_PROFIL_REEL.specialite}</div>
                        <div style={{ display:"flex", gap:6, marginTop:6 }}>
                          <span style={{ padding:"2px 8px", borderRadius:8, fontSize:11, background:BET_LIGHT, color:BET, fontWeight:700 }}>🏆 {MON_PROFIL_REEL.xp}</span>
                          {MON_PROFIL_REEL.notation != null && <span style={{ padding:"2px 8px", borderRadius:8, fontSize:11, background:"#fef3c7", color:"#92400e", fontWeight:700 }}>⭐ {MON_PROFIL_REEL.notation}/5</span>}
                        </div>
                      </div>
                    </div>
                    <h3 style={{ ...blockTitle, marginBottom:12 }}>Informations personnelles</h3>
                    {[
                      ["Prénom",              MON_PROFIL_REEL.prenom],
                      ["Nom",                 MON_PROFIL_REEL.nom],
                      ["Email",               MON_PROFIL_REEL.email],
                      ["Téléphone",           MON_PROFIL_REEL.phone],
                      ["Spécialité / Filière",coachBase?.coach_info?.filiere || MON_PROFIL_REEL.specialite],
                      ["Matricule",           coachBase?.coach_info?.matricule || "-"],
                      ["Date début à BET",    fmtDate(coachBase?.coach_info?.date_debut_bet || coachBase?.coach_info?.date_debut || MON_PROFIL_REEL.dateRecrutement)],
                      ["Lieu d'habitation",   coachBase?.coach_info?.lieu_habitation || "-"],
                      ["Contrats actifs",     MON_PROFIL_REEL.nbr_contrats_actifs !== null ? `${MON_PROFIL_REEL.nbr_contrats_actifs} groupe(s) actif(s)` : "-"],
                      ["Nombre d'avis",       `${MON_PROFIL_REEL.nbAvis} avis`],
                    ].map(([l,v])=>(
                      <div key={l} style={{ display:"flex", padding:"6px 0", borderBottom:"1px solid #f3f4f6", fontSize:13 }}>
                        <span style={{ color:"#9ca3af", width:140, fontWeight:500 }}>{l}</span>
                        <span style={{ fontWeight:400 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  {/* Stats et certif */}
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                    <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                      <h3 style={{ ...blockTitle, marginBottom:14 }}>Niveaux enseignés</h3>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                        {MON_PROFIL_REEL.niveauxEnseignes.map(n=><NivBadge key={n} n={n}/>)}
                      </div>
                    </div>
                    <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                      <h3 style={{ ...blockTitle, marginBottom:14 }}>Certifications</h3>
                      {MON_PROFIL_REEL.certifications.map(cert=>(
                        <div key={cert} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:8, background:"#fff", border:"1px solid #e5e7eb", marginBottom:8 }}>
                          <span style={{ fontSize:18 }}>🏅</span>
                          <span style={{ fontWeight:600, fontSize:13 }}>{cert}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                      <h3 style={{ ...blockTitle, marginBottom:14 }}>Performance ce mois</h3>
                      {[
                        { l:"Contrats actifs",      v:MON_PROFIL_REEL.nbr_contrats_actifs !== null ? MON_PROFIL_REEL.nbr_contrats_actifs : groupes.length, c:"#dc2626" },
                        { l:"Cours dispensés",     v:cours.length,              c:BET },
                        { l:"Heures de cours",     v:`${heuresMoisReelles % 1 === 0 ? heuresMoisReelles : heuresMoisReelles.toFixed(1)}h`, c:"#7c3aed" },
                        { l:"Étudiants suivis",    v:etudiants.length,          c:"#059669" },
                        { l:"Taux de satisfaction",v:MON_PROFIL_REEL.notation != null ? `${MON_PROFIL_REEL.notation}/5` : "-",c:"#f59e0b" },
                      ].map(s=>(
                        <div key={s.l} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #f3f4f6" }}>
                          <span style={{ fontSize:13, color:"#6b7280" }}>{s.l}</span>
                          <span style={{ fontWeight:800, color:s.c, fontSize:16 }}>{s.v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── ONGLET HONORAIRES ── */}
            {activeTab==="honoraires" && (() => {
              const formatMoney = (v) => new Intl.NumberFormat("fr-FR").format(Math.round(v||0)) + " FCFA";
              const STATUT_HON_COACH = {
                en_attente: { lib:'En attente',         bg:'#FEF3C7', c:'#B45309', desc:"Le PA n'a pas encore vérifié ce mois." },
                valide:     { lib:'Validé (à envoyer)', bg:'#E0E7FF', c:'#4338CA', desc:"Le PA a validé le calcul, pas encore transmis à la RH - vous pouvez encore signaler un désaccord." },
                transmis:   { lib:'Transmis → RH',       bg:'#DBEAFE', c:'#1D4ED8', desc:'Envoyé à la RH/Paie pour paiement.' },
                paye:       { lib:'Payé',                bg:'#D1FAE5', c:'#065F46', desc:'Virement effectué.' },
                litige:     { lib:'Litige',              bg:'#FEE2E2', c:'#991B1B', desc:'Fiche en litige - contactez votre PA.' },
              };
              const STATUT_SEANCE_COACH = {
                en_attente: { lib:'En attente', bg:'#FEF3C7', c:'#B45309' },
                valide:     { lib:'Validée',    bg:'#DBEAFE', c:'#1D4ED8' },
                rejete:     { lib:'Rejetée',    bg:'#FEE2E2', c:'#991B1B' },
              };
              const stHon = STATUT_HON_COACH[monHonoraire?.statut] || STATUT_HON_COACH.en_attente;

              return (
                <div>
                  <div style={tabHeader}>
                    <div>
                      <h2 style={tabTitle}>💵 Mes honoraires</h2>
                      <p style={tabSubtitle}>Calculés par le PA à partir de vos séances réalisées</p>
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                      {_MOIS_HON.slice(1).map((m,i) => (
                        <button key={m} onClick={() => setHonMoisSel(i+1)}
                          style={{ padding:"4px 9px", borderRadius:20, border:"none", fontSize:11, fontWeight:700, cursor:"pointer", background:honMoisSel===i+1?BET:"#f1f5f9", color:honMoisSel===i+1?"#fff":"#6b7280" }}>
                          {m}
                        </button>
                      ))}
                      {[2024,2025,2026,2027].map(y => (
                        <button key={y} onClick={() => setHonAnneeSel(y)}
                          style={{ padding:"4px 9px", borderRadius:20, border:"none", fontSize:11, fontWeight:700, cursor:"pointer", background:honAnneeSel===y?BET:"#f1f5f9", color:honAnneeSel===y?"#fff":"#6b7280" }}>
                          {y}
                        </button>
                      ))}
                    </div>
                  </div>

                  {honLoading ? (
                    <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>⏳ Chargement…</div>
                  ) : !monHonoraire ? (
                    <div style={{ textAlign:"center", padding:"40px 20px", background:"#f8fafc", borderRadius:14, color:"#9ca3af" }}>
                      Aucune fiche d'honoraires pour {_MOIS_HON[honMoisSel]} {honAnneeSel}.<br/>
                      <span style={{ fontSize:12 }}>Elle apparaîtra ici une fois calculée par votre PA.</span>
                    </div>
                  ) : (
                    <>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, flexWrap:"wrap" }}>
                        <span style={{ padding:"4px 12px", borderRadius:20, background:stHon.bg, color:stHon.c, fontSize:12, fontWeight:700 }}>{stHon.lib}</span>
                        <span style={{ fontSize:12, color:"#9ca3af" }}>{stHon.desc}</span>
                      </div>

                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:14, marginBottom:24 }}>
                        <div style={{ background:"linear-gradient(135deg,#059669,#10b981)", borderRadius:14, padding:"16px 18px", color:"#fff" }}>
                          <div style={{ fontSize:11, opacity:0.8, fontWeight:600, letterSpacing:"0.05em" }}>MONTANT NET</div>
                          <div style={{ fontSize:20, fontWeight:800, margin:"6px 0 2px" }}>{formatMoney(monHonoraire.montant_net ?? monHonoraire.montant_total)}</div>
                          <div style={{ fontSize:11, opacity:0.75 }}>{monHonoraire.nb_seances||0} séance{(monHonoraire.nb_seances||0)>1?"s":""}</div>
                        </div>
                        <div style={{ background:`linear-gradient(135deg,#0f172a,${BET})`, borderRadius:14, padding:"16px 18px", color:"#fff" }}>
                          <div style={{ fontSize:11, opacity:0.8, fontWeight:600, letterSpacing:"0.05em" }}>HEURES RÉALISÉES</div>
                          <div style={{ fontSize:22, fontWeight:800, margin:"6px 0 2px" }}>{(monHonoraire.total_heures||0).toFixed(1)}h</div>
                        </div>
                        <div style={{ background:"linear-gradient(135deg,#7c3aed,#8b5cf6)", borderRadius:14, padding:"16px 18px", color:"#fff" }}>
                          <div style={{ fontSize:11, opacity:0.8, fontWeight:600, letterSpacing:"0.05em" }}>MONTANT BRUT</div>
                          <div style={{ fontSize:18, fontWeight:800, margin:"6px 0 2px" }}>{formatMoney(monHonoraire.montant_total)}</div>
                        </div>
                        <div style={{ background:"linear-gradient(135deg,#d97706,#f59e0b)", borderRadius:14, padding:"16px 18px", color:"#fff" }}>
                          <div style={{ fontSize:11, opacity:0.8, fontWeight:600, letterSpacing:"0.05em" }}>RETENUES</div>
                          <div style={{ fontSize:20, fontWeight:800, margin:"6px 0 2px" }}>{formatMoney(monHonoraire.retenues||0)}</div>
                          <div style={{ fontSize:11, opacity:0.75, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{monHonoraire.note_pa || "Aucune"}</div>
                        </div>
                      </div>

                      <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e5e7eb", overflow:"hidden" }}>
                        <div style={{ padding:"14px 18px", borderBottom:"1px solid #e5e7eb" }}>
                          <span style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>📋 Séances réalisées</span>
                        </div>
                        <div style={{ overflowX:"auto" }}>
                          {monHonSeances.length === 0 ? (
                            <div style={{ padding:"32px", textAlign:"center", color:"#9ca3af", fontSize:13 }}>Aucune séance associée à cette fiche.</div>
                          ) : (
                            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                              <thead>
                                <tr style={{ background:"#f8fafc" }}>
                                  {["Date","Titre","Créneau","Durée","Montant","Statut"].map(h=>(
                                    <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#9ca3af", borderBottom:"1px solid #e5e7eb", whiteSpace:"nowrap" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {monHonSeances.map((s,i) => {
                                  const stS = STATUT_SEANCE_COACH[s.honoraire_statut] || STATUT_SEANCE_COACH.en_attente;
                                  return (
                                    <tr key={s.id} onClick={() => setHonSeanceDetail(s)}
                                      style={{ borderBottom:"1px solid #f1f5f9", cursor:"pointer" }}
                                      onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                      <td style={{ padding:"10px 14px", color:"#6b7280" }}>{s.date_seance ? new Date(s.date_seance).toLocaleDateString("fr-FR") : "-"}</td>
                                      <td style={{ padding:"10px 14px", fontWeight:600, color:"#0f172a" }}>
                                        {s.titre || "-"}
                                        {s.remplacement_id && (
                                          <span title={s.remplacement_absent_nom ? `Remplacement de ${s.remplacement_absent_nom}` : "Séance de remplacement"}
                                            style={{ marginLeft:6, padding:"1px 7px", borderRadius:8, fontSize:9, fontWeight:800, background:"#EDE9FE", color:"#6D28D9" }}>🔄 Remplacement</span>
                                        )}
                                      </td>
                                      <td style={{ padding:"10px 14px", color:"#6b7280" }}>{s.heure_debut?.slice(0,5) || "-"}</td>
                                      <td style={{ padding:"10px 14px", fontWeight:700, color:"#374151" }}>{parseFloat(s.duree_h||0).toFixed(1)}h</td>
                                      <td style={{ padding:"10px 14px", fontWeight:800, color: s.honoraire_statut==="rejete" ? "#9ca3af" : "#059669", textDecoration: s.honoraire_statut==="rejete" ? "line-through" : "none" }}>
                                        {new Intl.NumberFormat("fr-FR").format(Math.round(s.honoraire_montant||0))} F
                                      </td>
                                      <td style={{ padding:"10px 14px" }}>
                                        <span title={s.honoraire_statut==="rejete" && s.honoraire_statut_note ? `Motif : ${s.honoraire_statut_note}` : undefined}
                                          style={{ padding:"3px 10px", borderRadius:20, fontSize:10, fontWeight:700, background:stS.bg, color:stS.c, cursor: s.honoraire_statut==="rejete" && s.honoraire_statut_note ? "help" : "default" }}>
                                          {stS.lib}{s.honoraire_statut==="rejete" && s.honoraire_statut_note ? " 💬" : ""}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginTop:16 }}>
                    {Object.entries(STATUT_HON_COACH).map(([k,v]) => (
                      <div key={k} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11 }}>
                        <span style={{ padding:"2px 9px", borderRadius:20, background:v.bg, color:v.c, fontWeight:700 }}>{v.lib}</span>
                        <span style={{ color:"#9ca3af" }}>{v.desc}</span>
                      </div>
                    ))}
                  </div>

                  {/* ── Modal détail séance ── */}
                  {honSeanceDetail && (() => {
                    const s   = honSeanceDetail;
                    const stS = STATUT_SEANCE_COACH[s.honoraire_statut] || STATUT_SEANCE_COACH.en_attente;
                    const heureFin = (() => {
                      if (!s.heure_debut) return null;
                      const [h,m] = s.heure_debut.split(":").map(Number);
                      const totalMin = h*60 + (m||0) + Math.round((parseFloat(s.duree_h)||0)*60);
                      return `${String(Math.floor(totalMin/60)%24).padStart(2,"0")}:${String(totalMin%60).padStart(2,"0")}`;
                    })();
                    return (
                      <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.55)", zIndex:3000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
                        onClick={e => { if (e.target === e.currentTarget) setHonSeanceDetail(null); }}>
                        <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:800, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(0,0,0,.25)" }}>
                          <div style={{ padding:"18px 22px", borderBottom:"1px solid #f1f5f9", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                            <div>
                              <div style={{ fontSize:16, fontWeight:800, color:"#0f172a" }}>{s.titre || "Séance"}</div>
                              <div style={{ fontSize:12, color:"#6b7280", marginTop:3 }}>
                                {s.date_seance ? new Date(s.date_seance).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" }) : "-"}
                              </div>
                            </div>
                            <button onClick={() => setHonSeanceDetail(null)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#94a3b8" }}>✕</button>
                          </div>
                          <div style={{ padding:"18px 22px", display:"flex", flexDirection:"column", gap:14 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:stS.bg, color:stS.c }}>{stS.lib}</span>
                              {s.honoraire_statut_note && (
                                <span style={{ fontSize:11, color:"#b91c1c" }}>- {s.honoraire_statut_note}</span>
                              )}
                            </div>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                              <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px", border:"1px solid #e2e8f0" }}>
                                <div style={{ fontSize:9, color:"#9ca3af", fontWeight:700, marginBottom:3, textTransform:"uppercase" }}>Créneau</div>
                                <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{s.heure_debut?.slice(0,5) || "-"}{heureFin ? ` – ${heureFin}` : ""}</div>
                              </div>
                              <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px", border:"1px solid #e2e8f0" }}>
                                <div style={{ fontSize:9, color:"#9ca3af", fontWeight:700, marginBottom:3, textTransform:"uppercase" }}>Durée</div>
                                <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{parseFloat(s.duree_h||0).toFixed(1)}h</div>
                              </div>
                              <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px", border:"1px solid #e2e8f0" }}>
                                <div style={{ fontSize:9, color:"#9ca3af", fontWeight:700, marginBottom:3, textTransform:"uppercase" }}>Classe / Circuit</div>
                                <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{s.groupe_nom || (s.circuit==="prive" ? "Coaching privé" : s.circuit || "-")}</div>
                              </div>
                              <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px", border:"1px solid #e2e8f0" }}>
                                <div style={{ fontSize:9, color:"#9ca3af", fontWeight:700, marginBottom:3, textTransform:"uppercase" }}>Niveau / Type</div>
                                <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{[s.niveau, s.type_cours].filter(Boolean).join(" · ") || "-"}</div>
                              </div>
                              {s.lieu && (
                                <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px", border:"1px solid #e2e8f0" }}>
                                  <div style={{ fontSize:9, color:"#9ca3af", fontWeight:700, marginBottom:3, textTransform:"uppercase" }}>Lieu</div>
                                  <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{s.lieu}</div>
                                </div>
                              )}
                              <div style={{ background:"#f0fdf4", borderRadius:8, padding:"10px 12px", border:"1px solid #bbf7d0" }}>
                                <div style={{ fontSize:9, color:"#15803d", fontWeight:700, marginBottom:3, textTransform:"uppercase" }}>Montant honoraire</div>
                                <div style={{ fontSize:14, fontWeight:800, color: s.honoraire_statut==="rejete" ? "#9ca3af" : "#15803d", textDecoration: s.honoraire_statut==="rejete" ? "line-through" : "none" }}>{formatMoney(s.honoraire_montant||0)}</div>
                              </div>
                            </div>
                            {s.objectif && (
                              <div>
                                <div style={{ fontSize:9, color:"#9ca3af", fontWeight:700, marginBottom:3, textTransform:"uppercase" }}>Objectif de la séance</div>
                                <div style={{ fontSize:13, color:"#374151", lineHeight:1.5 }}>{s.objectif}</div>
                              </div>
                            )}
                            {s.notes && (
                              <div>
                                <div style={{ fontSize:9, color:"#9ca3af", fontWeight:700, marginBottom:3, textTransform:"uppercase" }}>Notes</div>
                                <div style={{ fontSize:13, color:"#374151", lineHeight:1.5, whiteSpace:"pre-wrap" }}>{s.notes}</div>
                              </div>
                            )}
                            <div>
                              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                                <div style={{ fontSize:9, color:"#9ca3af", fontWeight:700, textTransform:"uppercase" }}>Présences</div>
                                {honSeancePresences.length > 0 && (() => {
                                  const taux = Math.round(honSeancePresences.filter(p=>p.statut==="present").length / honSeancePresences.length * 100);
                                  return (
                                    <span style={{ fontSize:11, fontWeight:800, padding:"2px 10px", borderRadius:20, background: taux>=80?"#dcfce7":taux>=50?"#fef3c7":"#fee2e2", color: taux>=80?"#166534":taux>=50?"#92400e":"#991b1b" }}>
                                      {taux}% présent{taux>1?"s":""}
                                    </span>
                                  );
                                })()}
                              </div>
                              {honSeancePresencesLoading ? (
                                <div style={{ fontSize:12, color:"#9ca3af" }}>Chargement…</div>
                              ) : honSeancePresences.length === 0 ? (
                                <div style={{ fontSize:12, color:"#9ca3af" }}>Aucune présence enregistrée pour cette séance.</div>
                              ) : (
                                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                                  {honSeancePresences.map(p => (
                                    <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 10px", background:"#f8fafc", borderRadius:7, border:"1px solid #f1f5f9" }}>
                                      <span style={{ fontSize:12, fontWeight:600, color:"#0f172a" }}>{p.nom_apprenant || "-"}</span>
                                      <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20,
                                        background: p.statut==="present" ? "#dcfce7" : p.statut==="retard" ? "#fef3c7" : p.statut==="excuse" ? "#dbeafe" : "#fee2e2",
                                        color: p.statut==="present" ? "#166534" : p.statut==="retard" ? "#92400e" : p.statut==="excuse" ? "#1e40af" : "#991b1b" }}>
                                        {p.statut === "present" ? "Présent" : p.statut === "absent" ? "Absent" : p.statut === "retard" ? "En retard" : p.statut === "excuse" ? "Excusé" : p.statut || "-"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {activeTab==="recompenses" && <OngletRecompensesProf />}

            {/* ════════ NOTIFS LIVE ════════ */}

            {/* ════════ SESSION LIVE ════════ */}
            {activeTab==="session_live" && (() => {
              const PLATFORMS = [
                { id:"zoom",        label:"Zoom",         icon:"💻", color:"#2D8CFF", bg:"#e8f1ff" },
                { id:"meet",        label:"Google Meet",  icon:"🎥", color:"#00897B", bg:"#e0f2f1" },
                { id:"teams",       label:"Teams",        icon:"💼", color:"#6264A7", bg:"#ede9f7" },
                { id:"jitsi",       label:"Jitsi",        icon:"🌐", color:"#009E44", bg:"#e8f8ee" },
                { id:"webex",       label:"Webex",        icon:"📹", color:"#00BCEB", bg:"#e0f7fd" },
                { id:"presentiel",  label:"Présentiel",   icon:"🏢", color:"#059669", bg:"#ecfdf5" },
                { id:"autre",       label:"Autre",        icon:"🔗", color:"#6b7280", bg:"#f3f4f6" },
              ];
              const now = new Date();
              const MODE_DEV = process.env.NODE_ENV === "development";
              const inputS = { width:"100%", padding:"9px 12px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" };

              const sessionActive = salleOuverte ? (liveSessions.find(s => s.id === salleOuverte) || sessionEnCours) : null;
              const upcoming = liveSessions
                .filter(estSessionAVenir)
                .sort((a,b) => new Date(`${a.date}T${a.heure}`) - new Date(`${b.date}T${b.heure}`));
              const realisees = liveSessions
                .filter(s => !estSessionAVenir(s))
                .sort((a,b) => new Date(`${b.date}T${b.heure}`) - new Date(`${a.date}T${a.heure}`));

              const VIDE_FORM = { titre:"", type_session:"ligne", lien_visio:"", date_session:"", heure_debut:"", heure_fin:"", groupe_id:"", notes_prof:"", contenu_ids:[] };
              const VIDE_CF  = { groupe_id:"", heure_debut:"", heure_fin:"", lien_visio:"", type_session:"ligne" };

              const openCreate = () => {
                setLiveEditId(null);
                setModeMultiple(false);
                setFormNouvelleSession({...VIDE_FORM});
                setSessionsMultiples([{ titre:"", date_session:"", heure_debut:"", heure_fin:"", lien_visio:"" }]);
                setCommonFields({...VIDE_CF});
                setShowLiveForm(true);
              };
              const openEdit = (s) => {
                setLiveEditId(s.id);
                setModeMultiple(false);
                setFormNouvelleSession({
                  titre: s.titre,
                  type_session: s.lien?.startsWith("presentiel") ? "presentiel" : "ligne",
                  lien_visio: s.lien?.startsWith("presentiel") ? "" : (s.lien||""),
                  date_session: s.date,
                  heure_debut: s.heure,
                  heure_fin: s.heure_fin||"",
                  groupe_id: s.groupe_id||"",
                  notes_prof: s.notes||"",
                  contenu_ids: s.contenu_ids||[],
                });
                setShowLiveForm(true);
              };
              const deleteSession = (id) => {
                openConfirm("Mettre en corbeille", "Cette session sera déplacée dans la corbeille. Vous pourrez la restaurer tant que la date n'est pas passée.", async () => {
                  const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
                  try {
                    const r = await fetch(`${API_URL}/api/coachs/sessions-live/${id}`, { method:"DELETE", headers:{ Authorization:`Bearer ${token}` } });
                    if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Erreur"); }
                    setSessGroupeLive(prev => prev.filter(s => s.id !== id));
                    fetchLiveSessions();
                    toast.success("Session déplacée en corbeille ✓");
                  } catch(e) { toast.error(e.message || "Erreur mise en corbeille"); }
                });
              };
              const copyLink = (lien) => { navigator.clipboard.writeText(lien).then(()=>toast.success("Lien copié !")); };
              // Compté sur la salle, pas sur toutes les saisies : un apprenant retiré de la
              // liste en cours de séance gonflait sinon le total.
              const nbPresents = apprenantsSalle.filter(a => presencesLive[a.id] === "present").length;
              const nbNonRenseignes = apprenantsSalle.filter(a => !presencesLive[a.id] || presencesLive[a.id] === "non_renseigne").length;
              const presencesObligatoires = apprenantsSalle.length > 0;
              const presencesComplete = presencesObligatoires ? nbNonRenseignes === 0 : true;

              return (
                <div>

                  {/* ════ VUE SALLE OUVERTE ════ */}
                  {sessionActive ? (
                    <div>
                      {/* Header live */}
                      <div style={{ background:BET_GRAD, borderRadius:16, padding:"20px 24px", marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:16 }}>
                        <div>
                          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                            <span style={{ width:10, height:10, borderRadius:"50%", background:"#EF4444", display:"inline-block", boxShadow:"0 0 8px #EF4444" }}/>
                            <span style={{ fontSize:11, fontWeight:800, color:"#FCA5A5", textTransform:"uppercase", letterSpacing:"0.08em" }}>En direct</span>
                            <span style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>· {groupes.find(g=>g.id===sessionActive.groupe_id)?.nom || ""}</span>
                          </div>
                          <div style={{ fontSize:20, fontWeight:800, color:"#fff", marginBottom:4 }}>{sessionActive.titre}</div>
                          <div style={{ fontSize:13, color:"rgba(255,255,255,0.6)" }}>
                            📅 {fmtDate(sessionActive.date)} · ⏰ {sessionActive.heure}{sessionActive.heure_fin ? ` – ${sessionActive.heure_fin}` : ""}
                          </div>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
                          <div style={{ fontSize:34, fontWeight:900, color:"#FCD34D", fontFamily:"monospace", letterSpacing:2 }}>{fmtChrono(chronoSec)}</div>
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                            <button
                              disabled={!presencesComplete}
                              onClick={() => openConfirm("Clôturer la session", "Les présences seront sauvegardées et la session marquée comme terminée.", () => cloturerSalle(sessionActive))}
                              title={!presencesComplete ? `Renseignez d'abord les présences (${nbNonRenseignes} manquante${nbNonRenseignes>1?"s":""})` : "Clôturer la session"}
                              style={{ background: presencesComplete ? "#EF4444" : "#9ca3af", color:"#fff", border:"none", borderRadius:8, padding:"8px 18px", fontSize:12, fontWeight:700, cursor: presencesComplete ? "pointer" : "not-allowed", opacity: presencesComplete ? 1 : 0.7, transition:"all 0.2s" }}>
                              ⏹ Clôturer la session
                            </button>
                            {!presencesComplete && (
                              <span style={{ fontSize:10, color:"#FCA5A5", fontWeight:600, textAlign:"center" }}>
                                ⚠️ {nbNonRenseignes} présence{nbNonRenseignes>1?"s":""} manquante{nbNonRenseignes>1?"s":""}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Salle vidéo */}
                      {sessionActive.lien && (() => {
                        const plat = PLATFORMS.find(p => p.id === sessionActive.plateforme) || PLATFORMS[5];
                        const isJitsi = sessionActive.lien.includes("jit.si") || sessionActive.lien.includes("meet.jit");
                        if (isJitsi) {
                          return (
                            <div style={{ marginBottom:20, background: modalVideoOuvert ? "transparent" : "linear-gradient(135deg,#EFF6FF,#DBEAFE)", border:`1.5px solid ${modalVideoOuvert ? "transparent" : "#BFDBFE"}`, borderRadius:14, padding: modalVideoOuvert ? 0 : "20px", display:"flex", flexDirection:"column", alignItems:"center", gap:12, textAlign:"center" }}>
                              {!modalVideoOuvert && (
                                <>
                                  <div style={{ fontSize:28 }}>🎥</div>
                                  <div style={{ fontSize:14, fontWeight:700, color:"#1D4ED8" }}>Vidéo masquée</div>
                                  <div style={{ fontSize:12, color:"#3B82F6" }}>La session Jitsi tourne en arrière-plan.</div>
                                  <button onClick={() => setModalVideoOuvert(true)}
                                    style={{ padding:"10px 28px", borderRadius:10, background:"#2563EB", color:"#fff", fontWeight:800, fontSize:14, border:"none", cursor:"pointer" }}>
                                    📺 Afficher la vidéo
                                  </button>
                                </>
                              )}
                            </div>
                          );
                        }
                        return (
                          <div style={{ marginBottom:20, background:`linear-gradient(135deg,#f8fafc,${plat.bg})`, border:`2px solid ${plat.color}30`, borderRadius:14, padding:"24px", textAlign:"center" }}>
                            <div style={{ fontSize:40, marginBottom:10 }}>{plat.icon}</div>
                            <div style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:6 }}>Session {plat.label} - fenêtre flottante</div>
                            <div style={{ fontSize:12, color:"#6b7280", marginBottom:16 }}>La salle a été ouverte dans une fenêtre flottante. Si elle s'est fermée, cliquez sur Rouvrir.</div>
                            <button onClick={() => openPopup(sessionActive.lien)}
                              style={{ padding:"12px 28px", borderRadius:10, border:"none", background:plat.color, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                              {plat.icon} Rouvrir {plat.label}
                            </button>
                          </div>
                        );
                      })()}

                      {/* Bandeau stats live */}
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"#F0FDF4", border:"1px solid #6EE7B7", borderRadius:10, padding:"10px 16px", marginBottom:16, flexWrap:"wrap", gap:10 }}>
                        <div style={{ fontSize:12, color:"#065F46", display:"flex", alignItems:"center", gap:6 }}>
                          <span>💡</span>
                          <span>Saisissez les présences en temps réel · Validez en fin de session</span>
                        </div>
                        <div style={{ display:"flex", gap:14, alignItems:"center" }}>
                          <span style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>👥 {nbPresents}/{apprenantsSalle.length} présents</span>
                          {mainLeveesLive.length > 0 && (
                            <span style={{ fontSize:13, fontWeight:700, color:"#F97316", background:"#FFF7ED", padding:"3px 10px", borderRadius:10 }}>
                              ✋ {mainLeveesLive.length} main{mainLeveesLive.length>1?"s":""} levée{mainLeveesLive.length>1?"s":""}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Corps : présences + chat */}
                      <div style={{ display:"grid", gridTemplateColumns:"1.5fr 1fr", gap:20 }}>
                        {/* Présences live */}
                        <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e5e7eb", overflow:"hidden" }}>
                          <div style={{ background:"#f8fafc", padding:"10px 18px", borderBottom:"1px solid #e5e7eb", display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
                            <span style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>👥 Participants & Présences</span>
                            <button onClick={() => {
                              const nbNonSaisie = apprenantsSalle.filter(a => !presencesLive[a.id] || presencesLive[a.id] === "non_renseigne").length;
                              const doValidate = () => {
                                const filled = { ...presencesLive };
                                apprenantsSalle.forEach(a => { if (!filled[a.id] || filled[a.id] === "non_renseigne") filled[a.id] = "absent"; });
                                setPresencesLive(filled);
                                setChatLive(prev => [...prev, { id:Date.now(), auteur:"🤖 Système", systeme:true, texte:`✅ Présences validées - ${apprenantsSalle.filter(a=>filled[a.id]==="present").length} présents, ${apprenantsSalle.filter(a=>filled[a.id]==="retard").length} en retard, ${apprenantsSalle.filter(a=>filled[a.id]==="absent").length} absents.`, ts:new Date().toISOString() }]);
                              };
                              if (nbNonSaisie > 0) {
                                openConfirm("Valider les présences", `${nbNonSaisie} apprenant(s) sans statut seront marqués "Absent".`, doValidate);
                              } else {
                                doValidate();
                              }
                            }}
                              style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"#059669", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                              ✅ Valider les présences
                            </button>
                          </div>
                          {apprenantsSalle.length === 0 && (
                            <div style={{ padding:"24px", textAlign:"center", color:"#9ca3af", fontSize:13 }}>
                              {sessionActive.groupe_id ? "Chargement des apprenants…" : "Aucun groupe associé à cette session"}
                            </div>
                          )}
                          {apprenantsSalle.map(a => {
                            const statut = presencesLive[a.id] || "non_renseigne";
                            const mainLevee = mainLeveesLive.includes(a.id);
                            const prenom = a.prenom_apprenant || a.prenom || "";
                            const nom    = a.nom_apprenant    || a.nom    || "";
                            return (
                              <div key={a.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 18px", borderBottom:"1px solid #f1f5f9", background:statut==="present"?"#F0FDF4":statut==="absent"?"#FEF2F2":statut==="retard"?"#FFFBEB":"#fff" }}>
                                <div style={{ width:32, height:32, borderRadius:"50%", background:`${BET}20`, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:12, color:BET, flexShrink:0, overflow:"hidden" }}>
                                  {a.avatar_url ? <img src={a.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : <>{(prenom||"?")[0].toUpperCase()}{(nom||"?")[0].toUpperCase()}</>}
                                </div>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:13, fontWeight:600, color:"#0f172a", display:"flex", alignItems:"center", gap:6 }}>
                                    {prenom} {nom}
                                    {mainLevee && <span>✋</span>}
                                  </div>
                                  <div style={{ fontSize:10, color:"#9ca3af" }}>{a.niveau_cecr || a.niveau || ""}</div>
                                </div>
                                <div style={{ display:"flex", gap:4 }}>
                                  {[["present","P","#059669","#D1FAE5"],["retard","R","#D97706","#FEF3C7"],["absent","A","#DC2626","#FEE2E2"]].map(([val,lib,txt,bg]) => (
                                    <button key={val} onClick={() => setPresencesLive(prev=>({...prev,[a.id]:val}))}
                                      style={{ width:28, height:28, borderRadius:6, border:`1.5px solid ${statut===val?txt:"#e5e7eb"}`, background:statut===val?bg:"#fff", color:statut===val?txt:"#9ca3af", fontSize:11, fontWeight:800, cursor:"pointer" }}>
                                      {lib}
                                    </button>
                                  ))}
                                  <button onClick={() => setMainLeveesLive(prev => prev.includes(a.id) ? prev.filter(x=>x!==a.id) : [...prev,a.id])}
                                    style={{ width:28, height:28, borderRadius:6, border:`1.5px solid ${mainLevee?"#F97316":"#e5e7eb"}`, background:mainLevee?"#FFF7ED":"#fff", color:mainLevee?"#F97316":"#9ca3af", fontSize:13, cursor:"pointer" }}>
                                    ✋
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {/* Résumé */}
                          <div style={{ padding:"10px 18px", background:"#f8fafc", display:"flex", gap:16, fontSize:12 }}>
                            {[["✅ Présents",Object.values(presencesLive).filter(v=>v==="present").length,"#059669"],["⏱ Retard",Object.values(presencesLive).filter(v=>v==="retard").length,"#D97706"],["❌ Absents",Object.values(presencesLive).filter(v=>v==="absent").length,"#DC2626"]].map(([lib,n,c])=>(
                              <span key={lib} style={{ fontWeight:700, color:c }}>{lib} : {n}</span>
                            ))}
                          </div>
                        </div>

                        {/* Chat live */}
                        <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e5e7eb", overflow:"hidden", display:"flex", flexDirection:"column" }}>
                          <div style={{ background:"#f8fafc", padding:"12px 18px", fontSize:13, fontWeight:700, color:"#0f172a", borderBottom:"1px solid #e5e7eb" }}>
                            💬 Chat de classe
                          </div>
                          <div style={{ flex:1, overflowY:"auto", padding:"12px 16px", display:"flex", flexDirection:"column", gap:8, minHeight:250, maxHeight:350 }}>
                            {chatLive.map(msg => (
                              <div key={msg.id} style={{ fontSize:12, padding:"6px 10px", borderRadius:8, background:msg.systeme?"#EFF6FF":"#f8fafc", borderLeft:`3px solid ${msg.systeme?BET:"#e5e7eb"}` }}>
                                <span style={{ fontWeight:700, color:msg.systeme?BET:"#0f172a" }}>{msg.auteur} </span>
                                <span style={{ color:"#4b5563" }}>{msg.texte}</span>
                              </div>
                            ))}
                            {chatLive.length === 0 && <div style={{ color:"#9ca3af", fontSize:12, textAlign:"center", marginTop:20 }}>Aucun message pour le moment…</div>}
                          </div>
                          <div style={{ padding:"10px 14px", borderTop:"1px solid #e5e7eb", display:"flex", gap:8 }}>
                            <input value={chatInputLive} onChange={e=>setChatInputLive(e.target.value)}
                              onKeyDown={e=>e.key==="Enter"&&envoyerMessageLive()}
                              placeholder="Écrire un message…"
                              style={{ flex:1, padding:"8px 12px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:12, outline:"none" }} />
                            <button onClick={envoyerMessageLive}
                              style={{ background:BET, color:"#fff", border:"none", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                              Envoyer
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                  ) : (
                  /* ════ VUE LISTE SESSIONS ════ */
                  <div>
                    {/* Header + boutons */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                      <div style={{ fontSize:15, fontWeight:800, color:"#0f172a" }}>🎥 Sessions live</div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={()=>{ fetchCorbeille(); setShowCorbeille(true); }}
                          style={{ padding:"9px 14px", borderRadius:9, border:"1px solid #fca5a5", background:"#fff1f2", color:"#dc2626", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                          🗑️ Corbeille
                        </button>
                        <button onClick={openCreate}
                          style={{ padding:"9px 18px", borderRadius:9, border:"none", background:BET, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                          + Programmer une session
                        </button>
                      </div>
                    </div>

                    {/* Déroulement type */}
                    <div style={{ background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:12, padding:"14px 18px", marginBottom:20, fontSize:12, color:"#1E40AF" }}>
                      <div style={{ fontWeight:700, marginBottom:8 }}>📋 Déroulement type d'une session :</div>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        {["J-1 : Rappel auto 🔔","H-15min : Salle accessible 🔓","Prof ouvre la salle 🎥","Apprenants rejoignent 👥","Cours + chat + main levée 📚","Saisie présences ✅","Clôture & Replay ⏹"].map((e,i) => (
                          <span key={i} style={{ background:"#DBEAFE", borderRadius:20, padding:"3px 10px", fontWeight:600 }}>{e}</span>
                        ))}
                      </div>
                    </div>


                    {/* Sessions à venir */}
                    <div style={{ fontSize:14, fontWeight:800, color:"#0f172a", marginBottom:12 }}>📅 Sessions à venir</div>
                    {liveLoading && <p style={{ color:"#9ca3af", fontSize:13 }}>Chargement…</p>}
                    {!liveLoading && upcoming.length === 0 && (
                      <div style={{ textAlign:"center", padding:"32px", color:"#9ca3af", fontSize:13, background:"#f8fafc", borderRadius:12, border:"1px dashed #e5e7eb", marginBottom:16 }}>
                        Aucune session planifiée - cliquez sur « + Programmer une session »
                      </div>
                    )}
                    {upcoming.map(s => {
                      const grp = groupes.find(g=>g.id===s.groupe_id);
                      const plat = PLATFORMS.find(p=>p.id===s.plateforme) || PLATFORMS[5];
                      const debut = new Date(`${s.date}T${s.heure}`);
                      const debutMoins15 = new Date(debut.getTime() - MS_OUVERTURE_SALLE);
                      const disponible = MODE_DEV || now >= debutMoins15;
                      const deplie = sessionsDepliees.has(s.id);
                      const minutesAvant = disponible ? 0 : Math.round((debutMoins15 - now) / 60000);
                      return (
                        <div key={s.id} style={{ background:disponible?"#F0FDF4":"#fff", borderRadius:14, border:`1.5px solid ${disponible?"#6EE7B7":"#e5e7eb"}`, marginBottom:12, overflow:"hidden" }}>
                          <div style={{ padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:16, flexWrap:"wrap" }}>
                            <div style={{ flex:1 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                                <span style={{ padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:700, background:plat.bg, color:plat.color }}>{plat.icon} {plat.label}</span>
                                <span style={{ fontSize:15, fontWeight:700, color:"#0f172a" }}>{s.titre}</span>
                                {disponible && <span style={{ padding:"2px 8px", borderRadius:10, background:"#D1FAE5", color:"#065F46", fontSize:10, fontWeight:800 }}>✅ Salle disponible</span>}
                              </div>
                              <div style={{ fontSize:12, color:"#6b7280", display:"flex", gap:14, flexWrap:"wrap" }}>
                                <span>📅 {fmtDate(s.date)}</span>
                                <span>⏰ {s.heure}{s.heure_fin?` – ${s.heure_fin}`:""}</span>
                                {grp && <span>👥 {grp.nom}</span>}
                              </div>
                              {!disponible && (
                                <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>
                                  🔒 Disponible H-15min avant le cours
                                  {minutesAvant < 1440 && <span> ({minutesAvant<60?`dans ${minutesAvant} min`:`dans ${Math.floor(minutesAvant/60)}h`})</span>}
                                </div>
                              )}
                              {s.notes && <div style={{ fontSize:11, color:"#374151", marginTop:4, fontStyle:"italic" }}>💬 {s.notes}</div>}
                            </div>
                            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", justifyContent:"flex-end" }}>
                              {s.plateforme !== "presentiel" && (
                                <button onClick={()=>copyLink(s.lien)} title="Copier le lien"
                                  style={{ padding:"7px 10px", borderRadius:8, border:"1.5px solid #e5e7eb", background:"#fff", color:"#374151", fontSize:13, cursor:"pointer" }}>🔗</button>
                              )}
                              <button onClick={()=>openEdit(s)}
                                style={{ padding:"7px 10px", borderRadius:8, border:"1.5px solid #e5e7eb", background:"#fff", color:"#374151", fontSize:13, cursor:"pointer" }}>✏️</button>
                              <button onClick={()=>deleteSession(s.id)}
                                style={{ padding:"7px 10px", borderRadius:8, border:"1.5px solid #fee2e2", background:"#fff", color:"#dc2626", fontSize:13, cursor:"pointer" }}>🗑</button>
                              {s.plateforme === "presentiel" ? (
                                /* Démarrer une séance n'est pas anodin : le serveur l'horodate,
                                   la feuille de présence s'ouvre et le « Déroulé réel » vu par le
                                   PA commence à courir. Un clic par mégarde laissait une séance
                                   ouverte au mauvais moment, sans retour en arrière. La visio
                                   demandait déjà confirmation ; le présentiel non. */
                                <button onClick={()=>openConfirm(
                                    "Démarrer le cours",
                                    `Démarrer la séance « ${s.titre} » maintenant ? L'heure de début sera enregistrée et la feuille de présence s'ouvrira.`,
                                    ()=>ouvrirPresentielModal(s), "🏢 Démarrer le cours", "#059669")}
                                  style={{ padding:"9px 20px", borderRadius:9, border:"none", fontSize:13, fontWeight:700, cursor:"pointer", background:"#059669", color:"#fff", whiteSpace:"nowrap" }}>
                                  🏢 Démarrer le cours
                                </button>
                              ) : (
                                <button disabled={!disponible} onClick={()=>disponible&&openConfirm("Ouvrir la salle", `Démarrer la session "${s.titre}" et ouvrir la salle vidéo maintenant ?`, ()=>ouvrirSalle(s), "🎥 Ouvrir la salle", "#059669")}
                                  style={{ padding:"9px 20px", borderRadius:9, border:"none", fontSize:13, fontWeight:700, cursor:disponible?"pointer":"not-allowed", background:disponible?"#059669":"#e5e7eb", color:disponible?"#fff":"#9ca3af", whiteSpace:"nowrap" }}>
                                  {disponible ? "🎥 Ouvrir la salle" : "🔒 Pas encore disponible"}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Sessions terminées avec pagination */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:24, marginBottom:12 }}>
                      <div style={{ fontSize:14, fontWeight:800, color:"#0f172a" }}>▶️ Sessions terminées & Replays</div>
                      {realisees.length > 0 && <span style={{ fontSize:12, color:"#9ca3af" }}>{realisees.length} session{realisees.length>1?"s":""}</span>}
                    </div>
                    {realisees.length === 0 ? (
                      <div style={{ textAlign:"center", padding:"24px", color:"#9ca3af", fontSize:13, background:"#f8fafc", borderRadius:12, border:"1px dashed #e5e7eb" }}>Aucune session réalisée</div>
                    ) : (() => {
                      const totalPagesR = Math.max(1, Math.ceil(realisees.length / REALISEES_PER_PAGE));
                      const pageR = Math.min(realiseesPage, totalPagesR - 1);
                      const pageItemsR = realisees.slice(pageR * REALISEES_PER_PAGE, (pageR + 1) * REALISEES_PER_PAGE);
                      return (
                        <>
                          {pageItemsR.map(s => {
                            const grp = groupes.find(g=>g.id===s.groupe_id);
                            const estRecente = sessionsRealisees.has(s.id);
                            return (
                              <div key={s.id} style={{ background:"#fff", borderRadius:14, border:"1px solid #e5e7eb", padding:"14px 20px", marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"center", gap:14, flexWrap:"wrap" }}>
                                <div>
                                  <div style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:3, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                    {s.titre}
                                    {s.statut === "terminee"
                                      ? <span style={{ padding:"2px 8px", borderRadius:10, background:"#D1FAE5", color:"#065F46", fontSize:10, fontWeight:800 }}>🔒 Clôturée</span>
                                      : estRecente && <span style={{ padding:"2px 8px", borderRadius:10, background:"#DBEAFE", color:"#1D4ED8", fontSize:10, fontWeight:800 }}>🆕 Terminée · Replay disponible</span>}
                                  </div>
                                  <div style={{ fontSize:12, color:"#9ca3af" }}>{fmtDate(s.date)}{grp?` · ${grp.nom}`:""}</div>
                                  {s.notes && <div style={{ fontSize:11, color:"#6b7280", marginTop:4, fontStyle:"italic" }}>📝 {s.notes}</div>}
                                </div>
                                {s.plateforme !== "presentiel" ? (
                                  <button onClick={()=>window.open(s.lien,"_blank")}
                                    style={{ padding:"8px 16px", borderRadius:9, border:"1.5px solid #e5e7eb", background:"#fff", color:"#0f172a", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                                    ▶️ Replay
                                  </button>
                                ) : (
                                  <span style={{ padding:"6px 14px", borderRadius:9, background:"#ecfdf5", color:"#065f46", fontSize:12, fontWeight:700 }}>🏢 Présentiel</span>
                                )}
                              </div>
                            );
                          })}
                          {totalPagesR > 1 && (
                            <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:6, marginTop:12 }}>
                              <button onClick={()=>setRealiseesPage(p=>Math.max(0,p-1))} disabled={pageR===0}
                                style={{ padding:"5px 12px", borderRadius:7, border:"1.5px solid #e2e8f0", background:pageR===0?"#f1f5f9":"#fff", color:pageR===0?"#9ca3af":"#374151", fontWeight:700, fontSize:12, cursor:pageR===0?"default":"pointer" }}>← Préc.</button>
                              {Array.from({length:totalPagesR},(_,i)=>i).map(i=>(
                                <button key={i} onClick={()=>setRealiseesPage(i)}
                                  style={{ width:28, height:28, borderRadius:6, border:`1.5px solid ${i===pageR?BET:"#e2e8f0"}`, background:i===pageR?BET:"#fff", color:i===pageR?"#fff":"#374151", fontWeight:700, fontSize:12, cursor:"pointer" }}>{i+1}</button>
                              ))}
                              <button onClick={()=>setRealiseesPage(p=>Math.min(totalPagesR-1,p+1))} disabled={pageR===totalPagesR-1}
                                style={{ padding:"5px 12px", borderRadius:7, border:"1.5px solid #e2e8f0", background:pageR===totalPagesR-1?"#f1f5f9":"#fff", color:pageR===totalPagesR-1?"#9ca3af":"#374151", fontWeight:700, fontSize:12, cursor:pageR===totalPagesR-1?"default":"pointer" }}>Suiv. →</button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  )}

                  {/* ════ MODAL PROGRAMMER UNE / PLUSIEURS SESSIONS ════ */}
                  {showLiveForm && (() => {
                    const LBL = { fontSize:11, fontWeight:700, color:"#6b7280", marginBottom:5, display:"block", textTransform:"uppercase", letterSpacing:"0.04em" };
                    const VISIO_PLATS = [
                      { id:"zoom",  label:"Zoom",        logo:"💻", prefix:"https://zoom.us/j/",           plh:"https://zoom.us/j/123456789" },
                      { id:"meet",  label:"Google Meet", logo:"🎥", prefix:"https://meet.google.com/",     plh:"https://meet.google.com/abc-defg" },
                      { id:"teams", label:"Teams",       logo:"💼", prefix:"https://teams.microsoft.com/", plh:"https://teams.microsoft.com/…" },
                      { id:"jitsi", label:"Jitsi",       logo:"🌐", prefix:"https://meet.jit.si/",         plh:"https://meet.jit.si/nom-salle" },
                      { id:"webex", label:"Webex",       logo:"📹", prefix:"https://webex.com/",           plh:"https://webex.com/meet/…" },
                      { id:"autre", label:"Autre",       logo:"🔗", prefix:"",                             plh:"Collez votre lien…" },
                    ];

                    const fermerModal = () => {
                      setShowLiveForm(false);
                      setLiveEditId(null);
                      setModeMultiple(false);
                      setFormNouvelleSession({...VIDE_FORM});
                      setSessionsMultiples([{ titre:"", date_session:"", heure_debut:"", heure_fin:"", lien_visio:"" }]);
                      setCommonFields({...VIDE_CF});
                    };
                    const calcDuree = (debut, fin) => {
                      if (!debut||!fin||fin<=debut) return null;
                      const [dh,dm]=debut.split(':').map(Number);
                      const [fh,fm]=fin.split(':').map(Number);
                      const t=(fh*60+fm)-(dh*60+dm);
                      return t>0 ? `${Math.floor(t/60)}h${t%60>0?String(t%60).padStart(2,'0'):''}` : null;
                    };
                    const calcDureeMin = (debut, fin) => {
                      if (!debut||!fin) return 60;
                      const [dh,dm]=debut.split(':').map(Number);
                      const [fh,fm]=fin.split(':').map(Number);
                      const t=(fh*60+fm)-(dh*60+dm);
                      return t>0?t:60;
                    };
                    const getPlatf = (lien) => {
                      if (!lien) return "zoom";
                      if (lien.includes("zoom.us")) return "zoom";
                      if (lien.includes("meet.google.com")) return "meet";
                      if (lien.includes("teams.microsoft.com")) return "teams";
                      if (lien.includes("jit.si")) return "jitsi";
                      if (lien.includes("webex.com")) return "webex";
                      return "autre";
                    };

                    // ── Mode unique ──
                    const f = formNouvelleSession;
                    const setF = (patch) => setFormNouvelleSession(prev=>({...prev,...patch}));
                    const grpUnique = groupes.find(g=>g.id===f.groupe_id);
                    // Le lien doit être EXPLOITABLE, pas seulement non vide : le bouton
                    // « Zoom » insère « https://zoom.us/j/ », et sans identifiant collé
                    // derrière l'apprenant clique sur une page vide le jour du cours.
                    const analyseLien = f.type_session === "presentiel"
                      ? { valide: true, raison: "", plateforme: null }
                      : analyserLienVisio(f.lien_visio);
                    const valideUnique = f.titre.trim() && f.date_session && f.heure_debut && f.heure_fin && analyseLien.valide;

                    const sauvegarderUnique = async () => {
                      if (savingLiveSession) return;
                      setSavingLiveSession(true);
                      const token = localStorage.getItem("coach_token");
                      if (!token) { toast.error("Session expirée"); setSavingLiveSession(false); return; }
                      const payload = {
                        titre: f.titre.trim(),
                        plateforme: f.type_session==="presentiel" ? "presentiel" : getPlatf(f.lien_visio),
                        lien: f.type_session==="presentiel" ? ("presentiel://"+(f.groupe_id||"salle")) : f.lien_visio.trim(),
                        date: f.date_session,
                        heure: f.heure_debut,
                        heure_fin: f.heure_fin,
                        duree: calcDureeMin(f.heure_debut, f.heure_fin),
                        groupe_id: f.groupe_id || null,
                        notes: f.notes_prof || null,
                        contenu_ids: f.contenu_ids||[],
                      };
                      try {
                        if (liveEditId) {
                          await fetch(`${API_URL}/api/coachs/sessions-live/${liveEditId}`, { method:"PATCH", headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" }, body:JSON.stringify(payload) });
                          toast.success("Session mise à jour ✅");
                        } else {
                          await fetch(`${API_URL}/api/coachs/sessions-live`, { method:"POST", headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" }, body:JSON.stringify(payload) });
                          const nbS = (f.contenu_ids||[]).length;
                          toast.success(`Session créée !${nbS>0?` · ${nbS} support(s) partagé(s) aux apprenants 📚`:""}`);
                        }
                        await publierBrouillonsLies(f.contenu_ids);
                        fermerModal();
                        fetchLiveSessions();
                      } catch { toast.error("Erreur réseau"); }
                      finally { setSavingLiveSession(false); }
                    };

                    // ── Mode multiple ──
                    const cf = commonFields;
                    const setCF = (patch) => setCommonFields(prev=>({...prev,...patch}));
                    const grpMulti = groupes.find(g=>g.id===cf.groupe_id);
                    // Le lien d'une ligne est exigé exploitable, exactement comme en création
                    // unique. Ce contrôle manquait ici, et le code comblait le vide en
                    // inventant « https://zoom.us/j/nouveau » - une adresse qui n'ouvre rien
                    // et n'échoue qu'au clic de l'apprenant. C'est de là que viennent les
                    // séances signalées « sans lien exploitable » dans le suivi.
                    const lienDeLaLigne = (s) => (s.lien_visio || cf.lien_visio || "").trim();
                    const lienLigneOk = (s) => cf.type_session === "presentiel"
                      || analyserLienVisio(lienDeLaLigne(s)).valide;
                    const lignesValides = sessionsMultiples.filter(s=>s.titre.trim()&&s.date_session&&lienLigneOk(s));
                    const lignesLienInvalide = sessionsMultiples.filter(s=>s.titre.trim()&&s.date_session&&!lienLigneOk(s));
                    const valideMultiple = cf.groupe_id && cf.heure_debut && cf.heure_fin && lignesValides.length>0;

                    const genererLignes = (n) => setSessionsMultiples(Array.from({length:n},(_,i)=>
                      sessionsMultiples[i]?{...sessionsMultiples[i]}:{titre:"",date_session:"",heure_debut:cf.heure_debut,heure_fin:cf.heure_fin,lien_visio:cf.lien_visio,contenu_ids:[]}
                    ));

                    // ── Supports ──
                    // Arbre cours → modules pour le picker, filtré par groupe sélectionné
                    // Un contenu vise desormais PLUSIEURS classes : il est proposé dès
                    // qu'il touche celle de la session. Et il n'y a plus de niveau « Cours »
                    // au-dessus - la liste est plate, un contenu = un support.
                    const buildSupportTree = (groupeId) => cours
                      .filter(c => !groupeId || (c.groupe_ids || []).some(id => String(id) === String(groupeId)));
                    const supportTree = buildSupportTree(f.groupe_id);
                    const supportTreeMulti = buildSupportTree(cf.groupe_id);

                    /**
                     * Publie les contenus liés à une session programmée.
                     *
                     * L'écran promet « ces modules seront visibles dans la médiathèque des
                     * apprenants dès la programmation » - mais l'ancienne version ne
                     * modifiait que l'état local : rien n'était persisté, et l'apprenant ne
                     * voyait jamais rien. La promesse était tenue à l'écran du coach
                     * seulement.
                     */
                    const publierBrouillonsLies = async (contenuIds) => {
                      if (!contenuIds?.length) return;
                      const aPublier = cours.filter(c => contenuIds.includes(c.id) && c.statut === "brouillon");
                      if (!aPublier.length) return;

                      const token = localStorage.getItem("coach_token") || localStorage.getItem("admin_token");
                      const ok = [];
                      for (const c of aPublier) {
                        try {
                          const r = await fetch(`${API_URL}/api/cours-elearning/${c.id}`, {
                            method: "PATCH",
                            headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
                            body: JSON.stringify({ statut: "publie" }),
                          });
                          if (r.ok) ok.push(c.id);
                        } catch { /* un échec n'empêche pas les suivants */ }
                      }
                      if (!ok.length) return;

                      setCours(prev => prev.map(c => ok.includes(c.id) ? { ...c, statut:"publie", publie:true } : c));
                      setModulesContent(prev => {
                        const next = { ...prev };
                        ok.forEach(id => { if (next[String(id)]) next[String(id)] = { ...next[String(id)], statut:"publie" }; });
                        return next;
                      });
                      toast.success(`${ok.length} support(s) publié(s) - visibles par les apprenants ✓`);
                    };

                    // Composant picker réutilisable
                    const renderSupportsPicker = (selectedIds, onToggle, tree) => {
                      const effectiveTree = tree || supportTree;
                      return (
                      <div style={{ border:"1.5px solid #e5e7eb", borderRadius:10, overflow:"hidden", background:"#fff" }}>
                        <div style={{ padding:"8px 14px", background:"#f8fafc", borderBottom:"1px solid #e5e7eb", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                          <span style={{ fontSize:12, fontWeight:700, color:"#374151" }}>📚 Supports à partager avec les apprenants</span>
                          {selectedIds.length>0 && <span style={{ padding:"2px 9px", borderRadius:10, fontSize:11, fontWeight:700, background:BET+"18", color:BET }}>{selectedIds.length} sélectionné{selectedIds.length>1?"s":""}</span>}
                        </div>
                        {effectiveTree.length===0
                          ? <div style={{ padding:"12px 16px", fontSize:12, color:"#9ca3af" }}>{f.groupe_id || cf.groupe_id ? "Aucun contenu publié ou en brouillon pour cette classe." : "Sélectionnez d'abord une classe."}</div>
                          : (
                            <div style={{ padding:"10px 12px", display:"flex", flexDirection:"column", gap:10, maxHeight:200, overflowY:"auto" }}>
                              {effectiveTree.map(m => {
                                const sel = selectedIds.includes(m.id);
                                const draft = m.statut === "brouillon";
                                const tm = ({ lecon:{e:"📖",c:"#2563eb"}, audio:{e:"🎧",c:"#7c3aed"}, video:{e:"🎬",c:"#dc2626"} })[m.type_contenu] || { e:"📦", c:BET };
                                return (
                                  <label key={m.id} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", padding:"7px 10px", borderRadius:8, background:sel?BET+"12":"#f9fafb", border:`1px solid ${sel?BET:"#e5e7eb"}`, transition:"all .12s" }}>
                                    <input type="checkbox" checked={sel} onChange={()=>onToggle(m.id)} style={{ width:14, height:14, cursor:"pointer", accentColor:BET }} />
                                    <span style={{ fontSize:15 }}>{tm.e}</span>
                                    <span style={{ flex:1, fontSize:12, fontWeight:sel?700:400, color:"#0f172a" }}>{m.titre}</span>
                                    {draft && <span style={{ padding:"1px 6px", borderRadius:6, fontSize:10, fontWeight:700, background:"#FEF9C3", color:"#92400E" }}>brouillon</span>}
                                    <span style={{ fontSize:11, color:"#9ca3af", whiteSpace:"nowrap" }}>{(m.blocs||[]).length} partie{(m.blocs||[]).length>1?"s":""} · {m.dureeEstimee}min</span>
                                  </label>
                                );
                              })}
                            </div>
                          )
                        }
                      </div>
                    );};

                    const sauvegarderMultiple = async () => {
                      if (savingLiveSession) return;
                      setSavingLiveSession(true);
                      const token = localStorage.getItem("coach_token");
                      if (!token) { toast.error("Session expirée"); setSavingLiveSession(false); return; }
                      try {
                      const typeCommon = cf.type_session||"ligne";
                      let ok=0;
                      for (const s of lignesValides) {
                        const payload = {
                          titre: s.titre.trim(),
                          plateforme: typeCommon==="presentiel" ? "presentiel" : getPlatf(s.lien_visio||cf.lien_visio),
                          lien: typeCommon==="presentiel" ? ("presentiel://"+(cf.groupe_id||"salle")) : lienDeLaLigne(s),
                          date: s.date_session,
                          heure: s.heure_debut||cf.heure_debut,
                          heure_fin: s.heure_fin||cf.heure_fin,
                          duree: calcDureeMin(s.heure_debut||cf.heure_debut, s.heure_fin||cf.heure_fin),
                          groupe_id: cf.groupe_id||null,
                          notes: null,
                          contenu_ids: s.contenu_ids||[],
                        };
                        try { await fetch(`${API_URL}/api/coachs/sessions-live`, { method:"POST", headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" }, body:JSON.stringify(payload) }); ok++; } catch {}
                      }
                      // Publier tous les brouillons sélectionnés (union de toutes les sessions)
                      const allIds = [...new Set(lignesValides.flatMap(s=>s.contenu_ids||[]))];
                      await publierBrouillonsLies(allIds);
                      const nbS = allIds.length;
                      toast.success(`${ok} session${ok>1?"s":""} créée${ok>1?"s":""}${nbS>0?` · ${nbS} support(s) partagé(s) 📚`:""} !`);
                      fermerModal();
                      fetchLiveSessions();
                      } finally { setSavingLiveSession(false); }
                    };

                    return (
                      <>
                        {/* Overlay */}
                        <div onClick={fermerModal} style={{ position:"fixed", inset:0, background:"rgba(10,18,35,0.6)", zIndex:3000, backdropFilter:"blur(3px)" }} />
                        {/* Box */}
                        <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:"90vw", maxWidth:"90vw", height:"90vh", maxHeight:"90vh", background:"#fff", borderRadius:20, boxShadow:"0 28px 70px rgba(0,0,0,0.3)", zIndex:3001, display:"flex", flexDirection:"column", overflow:"hidden" }}>

                          {/* ── En-tête ── */}
                          <div style={{ background:BET_GRAD, padding:"20px 26px", flexShrink:0 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:16 }}>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:5 }}>Planning sessions</div>
                                <div style={{ fontSize:18, fontWeight:800, color:"#fff", marginBottom:12 }}>
                                  {liveEditId ? "✏️ Modifier la session" : modeMultiple ? "📋 Programme complet de sessions" : "🗓 Programmer une nouvelle session"}
                                </div>
                                {!liveEditId && (
                                  <div style={{ display:"flex", gap:6 }}>
                                    {[{id:false,label:"1 session",icon:"🗓"},{id:true,label:"Programme complet",icon:"📋"}].map(({id,label,icon})=>(
                                      <button key={String(id)} onClick={()=>setModeMultiple(id)} style={{ padding:"6px 14px", borderRadius:20, fontSize:12, fontWeight:700, cursor:"pointer", border:`1.5px solid ${modeMultiple===id?"#FCD34D":"rgba(255,255,255,0.25)"}`, background:modeMultiple===id?"#FCD34D":"rgba(255,255,255,0.1)", color:modeMultiple===id?"#0f172a":"rgba(255,255,255,0.8)" }}>
                                        {icon} {label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <button onClick={fermerModal} style={{ background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:8, width:34, height:34, color:"#fff", fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✕</button>
                            </div>
                          </div>

                          {/* ══ CORPS MODE UNIQUE ══ */}
                          {!modeMultiple && (
                            <div style={{ overflowY:"auto", padding:"24px 26px", flex:1, display:"flex", flexDirection:"column", gap:18 }}>
                              <div>
                                <label style={LBL}>Titre de la session *</label>
                                <input style={inputS} placeholder="Ex : Cours B2 - Groupe 1" value={f.titre} onChange={e=>setF({titre:e.target.value})} />
                              </div>
                              <div>
                                <label style={LBL}>Groupe / Classe</label>
                                <select style={inputS} value={f.groupe_id} onChange={e=>setF({groupe_id:e.target.value})}>
                                  <option value="">- Aucun groupe spécifique -</option>
                                  {groupes.map(g=><option key={g.id} value={g.id}>{g.nom}{g.niveau?` · ${g.niveau}`:""}</option>)}
                                </select>
                                {grpUnique && <div style={{ marginTop:8, padding:"8px 12px", background:BET+"12", borderRadius:8, fontSize:12, color:BET, fontWeight:600 }}>📚 {grpUnique.nom}{grpUnique.niveau?` · ${grpUnique.niveau}`:""}</div>}
                              </div>
                              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                                <div><label style={LBL}>Date *</label><input type="date" style={inputS} value={f.date_session} onChange={e=>setF({date_session:e.target.value})} /></div>
                                <div><label style={LBL}>Heure début *</label><input type="time" style={inputS} value={f.heure_debut} onChange={e=>setF({heure_debut:e.target.value})} /></div>
                                <div><label style={LBL}>Heure fin *</label><input type="time" style={inputS} value={f.heure_fin} onChange={e=>setF({heure_fin:e.target.value})} /></div>
                              </div>
                              {calcDuree(f.heure_debut,f.heure_fin) && <div style={{ background:"#EFF6FF", borderRadius:8, padding:"8px 14px", fontSize:12, color:"#1E40AF", fontWeight:600 }}>⏱ Durée : {calcDuree(f.heure_debut,f.heure_fin)}</div>}
                              {/* Type de session */}
                              <div>
                                <label style={LBL}>Type de session</label>
                                <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                                  {[{val:"ligne",ic:"📹",lib:"En ligne",sub:"Zoom · Meet · Teams · Jitsi",col:BET},{val:"presentiel",ic:"🏢",lib:"Présentiel",sub:"Pas de lien requis",col:"#F59E0B"}].map(({val,ic,lib,sub,col})=>{
                                    const actif=(f.type_session||"ligne")===val;
                                    return <button key={val} onClick={()=>setF({type_session:val,lien_visio:val==="presentiel"?"":f.lien_visio})} style={{ flex:1, padding:"12px 10px", borderRadius:10, border:`2px solid ${actif?col:"#e5e7eb"}`, background:actif?`${col}15`:"#fff", cursor:"pointer", textAlign:"center" }}><div style={{ fontSize:22, marginBottom:3 }}>{ic}</div><div style={{ fontSize:13, fontWeight:700, color:actif?col:"#0f172a" }}>{lib}</div><div style={{ fontSize:10, color:actif?col:"#9ca3af" }}>{sub}</div></button>;
                                  })}
                                </div>
                                {(f.type_session||"ligne")==="presentiel" && <div style={{ padding:"8px 12px", borderRadius:8, background:"#FFFBEB", border:"1px solid #FDE68A", fontSize:12, color:"#92400E" }}>🏢 Session présentielle - aucun lien de visioconférence requis.</div>}
                              </div>
                              {/* Lien visio */}
                              {(f.type_session||"ligne")==="ligne" && (
                                <div>
                                  <label style={LBL}>Lien de la réunion *</label>
                                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
                                    {VISIO_PLATS.map(p=>{
                                      const actif=p.prefix!==""&&f.lien_visio.startsWith(p.prefix);
                                      const actifA=p.id==="autre"&&f.lien_visio!==""&&!VISIO_PLATS.filter(x=>x.id!=="autre").some(x=>f.lien_visio.startsWith(x.prefix));
                                      return <button key={p.id} onClick={()=>{if(!f.lien_visio||!f.lien_visio.startsWith("http"))setF({lien_visio:p.prefix});}} style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:20, fontSize:12, fontWeight:600, cursor:"pointer", border:`1.5px solid ${(actif||actifA)?BET:"#e5e7eb"}`, background:(actif||actifA)?BET+"15":"#fff", color:(actif||actifA)?BET:"#6b7280" }}>{p.logo} {p.label}</button>;
                                    })}
                                  </div>
                                  <input style={{ ...inputS, borderColor: (f.lien_visio.trim() && !analyseLien.valide) ? "#fca5a5" : inputS.borderColor }}
                                    placeholder={VISIO_PLATS.find(p=>p.prefix&&f.lien_visio.startsWith(p.prefix))?.plh||"Collez votre lien de réunion…"}
                                    value={f.lien_visio} onChange={e=>setF({lien_visio:e.target.value})} />
                                  {f.lien_visio.trim() && !analyseLien.valide && (
                                    <div style={{ marginTop:6, fontSize:11.5, color:"#b91c1c", fontWeight:600 }}>
                                      ⚠️ {analyseLien.raison.charAt(0).toUpperCase() + analyseLien.raison.slice(1)} - collez l'adresse complète de votre réunion.
                                    </div>
                                  )}
                                  {analyseLien.valide && analyseLien.plateforme && (
                                    <div style={{ marginTop:6, fontSize:11.5, color:"#15803d", fontWeight:600 }}>
                                      ✅ Lien {analyseLien.plateforme} valide
                                    </div>
                                  )}
                                </div>
                              )}
                              <div>
                                <label style={LBL}>Notes préparatoires (facultatif)</label>
                                <textarea style={{...inputS,minHeight:68,resize:"vertical",lineHeight:1.6}} placeholder="Objectifs pédagogiques, matériel à préparer…" value={f.notes_prof} onChange={e=>setF({notes_prof:e.target.value})} />
                              </div>
                              {/* ── Supports liés ── */}
                              <div>
                                <label style={LBL}>Supports de cours à partager</label>
                                {renderSupportsPicker(
                                  f.contenu_ids||[],
                                  (mid) => setF({ contenu_ids:(f.contenu_ids||[]).includes(mid) ? (f.contenu_ids||[]).filter(x=>x!==mid) : [...(f.contenu_ids||[]),mid] }),
                                  supportTree
                                )}
                                {(f.contenu_ids||[]).length>0 && <div style={{ marginTop:7, fontSize:11, color:"#059669", fontWeight:600 }}>✅ Ces modules seront visibles dans la médiathèque des apprenants dès la programmation.</div>}
                              </div>
                              {valideUnique && (
                                <div style={{ background:"#f8fafc", borderRadius:10, padding:"14px 16px", border:"1px solid #e5e7eb" }}>
                                  <div style={{ fontWeight:700, color:"#0f172a", marginBottom:8, fontSize:13 }}>📋 Récapitulatif</div>
                                  <div style={{ display:"flex", flexDirection:"column", gap:5, color:"#6b7280", fontSize:12 }}>
                                    <div>📌 <strong>{f.titre}</strong></div>
                                    {grpUnique&&<div>👥 {grpUnique.nom}</div>}
                                    <div>📅 {fmtDate(f.date_session)} · ⏰ {f.heure_debut} – {f.heure_fin}{calcDuree(f.heure_debut,f.heure_fin)?` (${calcDuree(f.heure_debut,f.heure_fin)})`:""}</div>
                                    <div>{f.type_session==="presentiel"?"🏢 Présentiel":"📹 En ligne"}{f.type_session!=="presentiel"&&f.lien_visio?` · ${f.lien_visio}`:""}</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* ══ CORPS MODE MULTIPLE ══ */}
                          {modeMultiple && (
                            <div style={{ overflowY:"auto", padding:"20px 26px", flex:1, display:"flex", flexDirection:"column", gap:16 }}>
                              {/* Paramètres communs */}
                              <div style={{ background:"#EFF6FF", borderRadius:12, padding:"16px 18px", border:"1px solid #BFDBFE" }}>
                                <div style={{ fontSize:13, fontWeight:700, color:"#1E40AF", marginBottom:12 }}>⚙️ Paramètres communs à toutes les sessions</div>
                                <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:12, alignItems:"end" }}>
                                  <div>
                                    <label style={{...LBL,color:"#1E40AF"}}>Groupe *</label>
                                    <select style={inputS} value={cf.groupe_id} onChange={e=>setCF({groupe_id:e.target.value})}>
                                      <option value="">- Sélectionner -</option>
                                      {groupes.map(g=><option key={g.id} value={g.id}>{g.nom}{g.niveau?` · ${g.niveau}`:""}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label style={{...LBL,color:"#1E40AF"}}>Heure début *</label>
                                    <input type="time" style={inputS} value={cf.heure_debut} onChange={e=>{const v=e.target.value;setCF({heure_debut:v});setSessionsMultiples(prev=>prev.map(l=>l.heure_debut===''||l.heure_debut===cf.heure_debut?{...l,heure_debut:v}:l));}} />
                                  </div>
                                  <div>
                                    <label style={{...LBL,color:"#1E40AF"}}>Heure fin *</label>
                                    <input type="time" style={inputS} value={cf.heure_fin} onChange={e=>{const v=e.target.value;setCF({heure_fin:v});setSessionsMultiples(prev=>prev.map(l=>l.heure_fin===''||l.heure_fin===cf.heure_fin?{...l,heure_fin:v}:l));}} />
                                  </div>
                                  <div style={{ gridColumn:"1 / -1" }}>
                                    <label style={{...LBL,color:"#1E40AF"}}>Type (commun)</label>
                                    <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                                      {[{val:"ligne",ic:"📹",lib:"En ligne",col:BET},{val:"presentiel",ic:"🏢",lib:"Présentiel",col:"#F59E0B"}].map(({val,ic,lib,col})=>{
                                        const actif=(cf.type_session||"ligne")===val;
                                        return <button key={val} onClick={()=>setCF({type_session:val,lien_visio:val==="presentiel"?"":cf.lien_visio})} style={{ flex:1, padding:"8px 10px", borderRadius:8, border:`2px solid ${actif?col:"#e5e7eb"}`, background:actif?`${col}15`:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}><span>{ic}</span><span style={{ fontSize:12, fontWeight:700, color:actif?col:"#0f172a" }}>{lib}</span></button>;
                                      })}
                                    </div>
                                  </div>
                                  {(cf.type_session||"ligne")==="ligne" && (
                                    <div style={{ gridColumn:"1 / -1" }}>
                                      <label style={{...LBL,color:"#1E40AF"}}>Lien visio commun</label>
                                      <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:7 }}>
                                        {VISIO_PLATS.map(p=>{
                                          const est=p.prefix!==""&&cf.lien_visio.startsWith(p.prefix);
                                          const estA=p.id==="autre"&&cf.lien_visio!==""&&!VISIO_PLATS.filter(x=>x.id!=="autre").some(x=>cf.lien_visio.startsWith(x.prefix));
                                          return <button key={p.id} onClick={()=>{if(!cf.lien_visio||!cf.lien_visio.startsWith("http")){const v=p.prefix;setCF({lien_visio:v});setSessionsMultiples(prev=>prev.map(l=>l.lien_visio===''||l.lien_visio===cf.lien_visio?{...l,lien_visio:v}:l));}}} style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:600, cursor:"pointer", border:`1.5px solid ${(est||estA)?"#6366F1":"#e5e7eb"}`, background:(est||estA)?"#EEF2FF":"#fff", color:(est||estA)?"#4F46E5":"#6b7280" }}>{p.logo} {p.label}</button>;
                                        })}
                                      </div>
                                      <input style={inputS} placeholder="https://zoom.us/j/… (commun à toutes)" value={cf.lien_visio} onChange={e=>{const v=e.target.value;setCF({lien_visio:v});setSessionsMultiples(prev=>prev.map(l=>l.lien_visio===''||l.lien_visio===cf.lien_visio?{...l,lien_visio:v}:l));}} />
                                    </div>
                                  )}
                                </div>
                                {grpMulti && <div style={{ marginTop:10, fontSize:12, color:"#1E40AF", fontWeight:600 }}>👥 {grpMulti.nom}{calcDuree(cf.heure_debut,cf.heure_fin)?` · ⏱ ${calcDuree(cf.heure_debut,cf.heure_fin)} / session`:""}</div>}
                              </div>

                              {/* Générateur rapide */}
                              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                                <span style={{ fontSize:13, color:"#6b7280", fontWeight:600 }}>Générer rapidement :</span>
                                {[8,10,12,14,16,20].map(n=>(
                                  <button key={n} onClick={()=>genererLignes(n)} style={{ padding:"5px 13px", borderRadius:20, fontSize:12, fontWeight:700, border:`1.5px solid ${sessionsMultiples.length===n?BET:"#e5e7eb"}`, background:sessionsMultiples.length===n?BET+"18":"#fff", color:sessionsMultiples.length===n?BET:"#6b7280", cursor:"pointer" }}>{n} sessions</button>
                                ))}
                                <span style={{ fontSize:12, color:"#9ca3af", marginLeft:4 }}>- ou ajoutez manuellement ↓</span>
                              </div>

                              {/* Cartes sessions */}
                              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                                <div style={{ fontSize:10, color:"#9ca3af", fontStyle:"italic" }}>↺ = override possible par session (vide = valeur commune)</div>
                                {sessionsMultiples.map((ligne,idx)=>{
                                  const ok=ligne.titre.trim()&&ligne.date_session;
                                  const hdP=ligne.heure_debut!==''&&ligne.heure_debut!==cf.heure_debut;
                                  const hfP=ligne.heure_fin!==''&&ligne.heure_fin!==cf.heure_fin;
                                  const lP=ligne.lien_visio!==''&&ligne.lien_visio!==cf.lien_visio;
                                  const ovr={borderColor:"#FCD34D",background:"#FFFBEB"};
                                  const nbSup=(ligne.contenu_ids||[]).length;
                                  return (
                                    <div key={idx} style={{ border:`1.5px solid ${ok?BET+"40":"#e5e7eb"}`, borderRadius:10, overflow:"hidden", background:"#fff" }}>
                                      {/* En-tête de la carte */}
                                      <div style={{ padding:"10px 12px", background:ok?"#F0F9FF":"#f9fafb", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                                        <span style={{ fontSize:12, fontWeight:800, color:ok?BET:"#9ca3af", minWidth:22, textAlign:"center" }}>{idx+1}</span>
                                        <input style={{...inputS,flex:2,minWidth:120}} placeholder={`Session ${idx+1}`} value={ligne.titre} onChange={e=>setSessionsMultiples(prev=>prev.map((l,i)=>i===idx?{...l,titre:e.target.value}:l))} />
                                        <input type="date" style={{...inputS,flex:"0 0 140px"}} value={ligne.date_session} onChange={e=>setSessionsMultiples(prev=>prev.map((l,i)=>i===idx?{...l,date_session:e.target.value}:l))} />
                                        <input type="time" style={{...inputS,...(hdP?ovr:{}),flex:"0 0 82px",fontSize:12,padding:"7px 8px"}} placeholder={cf.heure_debut||"--:--"} value={ligne.heure_debut} onChange={e=>setSessionsMultiples(prev=>prev.map((l,i)=>i===idx?{...l,heure_debut:e.target.value}:l))} />
                                        <input type="time" style={{...inputS,...(hfP?ovr:{}),flex:"0 0 82px",fontSize:12,padding:"7px 8px"}} placeholder={cf.heure_fin||"--:--"} value={ligne.heure_fin} onChange={e=>setSessionsMultiples(prev=>prev.map((l,i)=>i===idx?{...l,heure_fin:e.target.value}:l))} />
                                        <input style={{...inputS,...(lP?ovr:{}),flex:2,minWidth:100,fontSize:11}} placeholder={cf.lien_visio||"Lien commun"} value={ligne.lien_visio} onChange={e=>setSessionsMultiples(prev=>prev.map((l,i)=>i===idx?{...l,lien_visio:e.target.value}:l))} />
                                        <button onClick={()=>setSessionsMultiples(prev=>prev.filter((_,i)=>i!==idx))} style={{ width:30,height:30,borderRadius:8,border:"1px solid #e5e7eb",background:"#FEF2F2",color:"#EF4444",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>✕</button>
                                      </div>
                                      {/* Supports de cette session */}
                                      <div style={{ padding:"10px 12px", borderTop:"1px solid #f1f5f9" }}>
                                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                                          <span style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.05em" }}>📚 Supports de cette session</span>
                                          {nbSup>0 && <span style={{ padding:"2px 8px", borderRadius:10, fontSize:11, fontWeight:700, background:BET+"18", color:BET }}>{nbSup} sélectionné{nbSup>1?"s":""}</span>}
                                        </div>
                                        {renderSupportsPicker(
                                          ligne.contenu_ids||[],
                                          (mid) => setSessionsMultiples(prev=>prev.map((l,i)=>i===idx?{...l,contenu_ids:(l.contenu_ids||[]).includes(mid)?(l.contenu_ids||[]).filter(x=>x!==mid):[...(l.contenu_ids||[]),mid]}:l)),
                                          supportTreeMulti
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                                <button onClick={()=>setSessionsMultiples(prev=>[...prev,{titre:"",date_session:"",heure_debut:cf.heure_debut,heure_fin:cf.heure_fin,lien_visio:cf.lien_visio,contenu_ids:[]}])} style={{ padding:"8px 16px", borderRadius:8, border:`1.5px dashed ${BET}`, background:"transparent", color:BET, fontSize:12, fontWeight:700, cursor:"pointer", width:"100%" }}>
                                  + Ajouter une session
                                </button>
                              </div>

                              {/* Une ligne écartée pour son lien doit dire pourquoi : sans ce
                                  message elle disparaîtrait du décompte sans explication, et
                                  le coach croirait avoir programmé des séances qui n'existent
                                  pas. Le compteur « incomplète(s) ignorée(s) » ne distingue
                                  pas un titre manquant d'un lien inutilisable. */}
                              {lignesLienInvalide.length > 0 && (
                                <div style={{ background:"#FFFBEB", borderRadius:10, padding:"12px 16px", border:"1px solid #FCD34D", marginBottom:10 }}>
                                  <div style={{ fontWeight:700, color:"#92400E", marginBottom:4, fontSize:13 }}>
                                    ⚠️ {lignesLienInvalide.length} ligne{lignesLienInvalide.length>1?"s":""} écartée{lignesLienInvalide.length>1?"s":""} - lien de visioconférence inutilisable
                                  </div>
                                  <div style={{ fontSize:12, color:"#B45309" }}>
                                    {analyserLienVisio(lienDeLaLigne(lignesLienInvalide[0])).raison || "lien manquant"}.
                                    Complétez le lien commun ou celui de chaque ligne - aucune session ne sera créée sans adresse valide.
                                  </div>
                                </div>
                              )}

                              {/* Récap multiple */}
                              {valideMultiple && (
                                <div style={{ background:"#F0FDF4", borderRadius:10, padding:"12px 16px", border:"1px solid #6EE7B7" }}>
                                  <div style={{ fontWeight:700, color:"#065F46", marginBottom:4, fontSize:13 }}>
                                    ✅ {lignesValides.length} session{lignesValides.length>1?"s":""} prête{lignesValides.length>1?"s":""} à programmer
                                    {sessionsMultiples.length-lignesValides.length>0&&<span style={{ marginLeft:8, fontSize:12, color:"#D97706" }}>· {sessionsMultiples.length-lignesValides.length} incomplète(s) ignorée(s)</span>}
                                  </div>
                                  <div style={{ fontSize:12, color:"#065F46" }}>👥 {grpMulti?.nom||"-"} · ⏰ {cf.heure_debut} – {cf.heure_fin}{calcDuree(cf.heure_debut,cf.heure_fin)?` · ${calcDuree(cf.heure_debut,cf.heure_fin)}/session`:""}</div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── Pied ── */}
                          <div style={{ padding:"14px 26px", borderTop:"1px solid #e5e7eb", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
                            <span style={{ fontSize:12, color:"#9ca3af" }}>* Champs obligatoires</span>
                            <div style={{ display:"flex", gap:8 }}>
                              <button onClick={fermerModal} style={{ padding:"9px 18px", borderRadius:9, border:"1.5px solid #e2e8f0", background:"#fff", color:"#374151", fontSize:13, fontWeight:600, cursor:"pointer" }}>Annuler</button>
                              {!modeMultiple && (
                                <button disabled={!valideUnique} onClick={()=>liveEditId?sauvegarderUnique():openConfirm("Programmer la session", `Confirmer la programmation de cette session ${f.date_session?`le ${fmtDate(f.date_session)}`:""}${f.heure_debut?` à ${f.heure_debut}`:""} ?`, sauvegarderUnique, "🗓 Programmer", BET)} style={{ padding:"9px 22px", borderRadius:9, border:"none", background:valideUnique?BET:"#e5e7eb", color:valideUnique?"#fff":"#9ca3af", fontSize:13, fontWeight:700, cursor:valideUnique?"pointer":"not-allowed" }}>
                                  🗓 {liveEditId?"Enregistrer":"Programmer la session"}
                                </button>
                              )}
                              {modeMultiple && (
                                <button disabled={!valideMultiple} onClick={()=>openConfirm("Programmer les sessions", `Confirmer la programmation de ${lignesValides.length} session${lignesValides.length>1?"s":""} pour ${grpMulti?.nom||"cette classe"} ?`, sauvegarderMultiple, `📋 Programmer ${lignesValides.length>0?lignesValides.length:""} session${lignesValides.length!==1?"s":""}`, "#059669")} style={{ padding:"9px 22px", borderRadius:9, border:"none", background:valideMultiple?"#059669":"#e5e7eb", color:valideMultiple?"#fff":"#9ca3af", fontSize:13, fontWeight:700, cursor:valideMultiple?"pointer":"not-allowed" }}>
                                  📋 Programmer {lignesValides.length>0?lignesValides.length:""} session{lignesValides.length!==1?"s":""}
                                </button>
                              )}
                            </div>
                          </div>

                        </div>
                      </>
                    );
                  })()}
                </div>
              );
            })()}

          </div>
        </div>

        {/* ══ MODAL MODULE BUILDER ══ */}
        {showModuleBuilder&&editingModuleContent&&(
          <div style={{ ...modalOverlay, zIndex:1100 }}>
            <div style={{ background:"#fff", borderRadius:14, width:"90vw", maxHeight:"90vh", overflowY:"auto", padding:0, display:"flex", flexDirection:"column" }}>
              {/* Header */}
              <div style={{ padding:"18px 24px", borderBottom:"1px solid #e5e7eb", display:"flex", alignItems:"center", gap:16, background:BET_GRAD, borderRadius:"14px 14px 0 0" }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11,color:"rgba(255,255,255,0.6)",letterSpacing:"0.1em",marginBottom:4 }}>ÉDITEUR DE MODULE</div>
                  <h3 style={{ margin:0,fontSize:18,color:"#fff",fontWeight:800 }}>{moduleForm.titre||"Nouveau module"}</h3>
                  <div style={{ fontSize:12,color:"rgba(255,255,255,0.6)",marginTop:3 }}>
                    ⏱ {getTotalDureeModule()} min estimées · 📦 {blocs.length} blocs
                  </div>
                </div>
                <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                  <button onClick={()=>setPreviewMode(v=>!v)} style={{ padding:"7px 14px",borderRadius:8,border:"1px solid rgba(255,255,255,0.3)",background:previewMode?"rgba(255,255,255,0.2)":"transparent",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600 }}>
                    {previewMode?"✏️ Éditer":"👁️ Aperçu"}
                  </button>
                  <button onClick={fermerEditeurModule} style={{ background:"none",border:"none",color:"rgba(255,255,255,0.7)",fontSize:22,cursor:"pointer",padding:0 }}>✕</button>
                </div>
              </div>

              <div style={{ display:"grid",gridTemplateColumns:previewMode?"1fr":"340px 1fr",flex:1,overflow:"hidden" }}>
                {/* LEFT - Paramètres module */}
                {!previewMode&&(
                  <div style={{ padding:20,borderRight:"1px solid #e5e7eb",overflowY:"auto",background:"#f9fafb" }}>
                    <div style={{ fontSize:12,fontWeight:700,color:"#374151",marginBottom:12,textTransform:"uppercase",letterSpacing:"0.08em" }}>Paramètres</div>
                    <label style={labelSt}>Titre du module *</label>
                    <input value={moduleForm.titre} onChange={e=>setModuleForm({...moduleForm,titre:e.target.value})} style={inputSt} placeholder="ex: Réunions d'affaires"/>
                    <label style={labelSt}>Objectifs pédagogiques (un par ligne)</label>
                    <textarea value={moduleForm.objectifs} onChange={e=>setModuleForm({...moduleForm,objectifs:e.target.value})} style={{ ...inputSt,minHeight:80,resize:"vertical" }} placeholder="Maîtriser le vocabulaire des réunions&#10;Animer une réunion formelle"/>
                    <label style={labelSt}>Durée estimée (minutes)</label>
                    <input type="number" value={moduleForm.dureeEstimee} onChange={e=>setModuleForm({...moduleForm,dureeEstimee:e.target.value})} style={inputSt} min={10}/>
                    {/* Les classes destinataires, modifiables ici comme à la création :
                        mêmes pastilles, même règle - au moins une doit rester cochée. */}
                    {(() => {
                      const dispo = groupes.filter(g => g.statut !== "archive");
                      const choisies = moduleForm.groupe_ids || [];
                      const basculer = (id) => setModuleForm(p => {
                        const ids = p.groupe_ids || [];
                        return { ...p, groupe_ids: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] };
                      });
                      return (
                        <>
                          <label style={labelSt}>
                            Classes destinataires
                            {choisies.length > 0 && <span style={{ color:BET }}> ({choisies.length})</span>}
                          </label>
                          {dispo.length === 0 ? (
                            <div style={{ fontSize:12, color:"#94a3b8", padding:"6px 0" }}>Aucune classe ne vous est assignée.</div>
                          ) : (
                            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:4 }}>
                              {dispo.map(g => {
                                const choisi = choisies.includes(g.id);
                                return (
                                  <button key={g.id} type="button" onClick={()=>basculer(g.id)}
                                    style={{ padding:"6px 12px", borderRadius:99, fontSize:12, fontWeight:700, cursor:"pointer",
                                      border:`2px solid ${choisi?BET:"#e5e7eb"}`, background: choisi?BET+"14":"#fff", color: choisi?BET:"#374151" }}>
                                    {choisi ? "✓ " : ""}{g.nom}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          <div style={{ fontSize:11, color: choisies.length ? "#9ca3af" : "#dc2626", marginBottom:10 }}>
                            {choisies.length
                              ? "Une seule version du contenu : la corriger la corrige pour toutes ces classes."
                              : "⚠ Choisissez au moins une classe - sans destinataire, ce contenu n'est lu par personne."}
                          </div>
                        </>
                      );
                    })()}
                    <label style={labelSt}>Statut de publication</label>
                    <select value={moduleForm.statut} onChange={e=>setModuleForm({...moduleForm,statut:e.target.value})} style={inputSt}>
                      <option value="brouillon">📝 Brouillon (invisible aux étudiants)</option>
                      <option value="publie">✅ Publié (visible + notification)</option>
                      <option value="archive">📦 Archivé</option>
                    </select>
                    <div style={{ marginTop:16,padding:"10px 12px",borderRadius:8,background:moduleForm.statut==="publie"?"#dcfce7":"#f3f4f6",border:`1px solid ${moduleForm.statut==="publie"?"#bbf7d0":"#e5e7eb"}`,fontSize:12,color:moduleForm.statut==="publie"?"#166534":"#6b7280" }}>
                      {moduleForm.statut==="publie"?"✅ Les étudiants seront notifiés lors de la sauvegarde.":moduleForm.statut==="brouillon"?"📝 Non visible. Publiez pour le rendre accessible.":"📦 Archivé, non accessible."}
                    </div>
                    <div style={{ marginTop:20,padding:"12px",borderRadius:8,background:"#f0f9ff",border:"1px solid #bae6fd" }}>
                      <div style={{ fontSize:11,fontWeight:700,color:BET,marginBottom:6 }}>DURÉE PAR TYPE DE BLOC</div>
                      {blocs.map(b=>{ const bt=BLOCK_TYPES[b.type]||BLOCK_TYPES.texte; return (
                        <div key={b.id} style={{ display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3 }}>
                          <span style={{ color:bt.color }}>{bt.icon} {b.titre.slice(0,24)}…</span><span style={{ color:"#9ca3af" }}>{b.dureeMin} min</span>
                        </div>
                      );})}
                      <div style={{ borderTop:"1px solid #e0f2fe",marginTop:6,paddingTop:6,display:"flex",justifyContent:"space-between",fontWeight:700,fontSize:12,color:BET }}>
                        <span>Total</span><span>{getTotalDureeModule()} min</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* RIGHT - Blocs */}
                <div style={{ padding:20,overflowY:"auto" }}>
                  {!previewMode&&(
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
                      <div style={{ fontSize:13,fontWeight:700,color:"#0f172a" }}>Contenu du module ({blocs.length} bloc{blocs.length>1?"s":""})</div>
                      <button onClick={ouvrirNouveauBloc} style={btnPrimary}>+ Ajouter un bloc</button>
                    </div>
                  )}

                  {blocs.length===0&&!previewMode&&(
                    <div style={{ textAlign:"center",padding:"40px 20px",background:"#f8fafc",borderRadius:12,border:"2px dashed #e5e7eb" }}>
                      <div style={{ fontSize:36,marginBottom:10 }}>🧩</div>
                      <p style={{ color:"#9ca3af",fontSize:13 }}>Aucun bloc - ajoutez du contenu pour créer votre module.</p>
                      <p style={{ color:"#9ca3af",fontSize:12,marginTop:4 }}>Texte, vidéo, quiz, exercice, document…</p>
                    </div>
                  )}

                  {blocs.map((b,i)=>{ const bt=BLOCK_TYPES[b.type]||BLOCK_TYPES.texte; return (
                    <div key={b.id} style={{ marginBottom:12,borderRadius:12,border:`1px solid ${bt.color}30`,background:"#fff",overflow:"hidden" }}>
                      <div style={{ padding:"10px 14px",background:bt.color+"0a",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid "+bt.color+"20" }}>
                        <span style={{ fontSize:18 }}>{bt.icon}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700,fontSize:13,color:"#0f172a" }}>{b.titre}</div>
                          <div style={{ fontSize:11,color:"#9ca3af" }}>{bt.label} · {b.dureeMin} min{b.questions?.length>0?` · ${b.questions.length} question(s)`:""}</div>
                        </div>
                        {!previewMode&&(
                          <div style={{ display:"flex",gap:4 }}>
                            <button onClick={()=>editerBloc(b)} style={btnIconToggle} title="Modifier ce bloc">✏️</button>
                            <button onClick={()=>moveBlocUp(i)} style={btnIconToggle} disabled={i===0}>↑</button>
                            <button onClick={()=>moveBlocDown(i)} style={btnIconToggle} disabled={i===blocs.length-1}>↓</button>
                            <button onClick={()=>removeBloc(b.id)} style={btnIconDelete}>🗑️</button>
                          </div>
                        )}
                      </div>
                      <div style={{ padding:"10px 14px" }}>
                        {b.type==="texte"&&<p style={{ fontSize:13,color:"#374151",lineHeight:1.6,margin:0 }}>{b.contenu}</p>}
                        {/* APERÇUS RÉELS. Ces trois blocs n'affichaient qu'une étiquette :
                            une URL tronquée pour la vidéo, un nom de fichier même pas
                            cliquable pour le document. Le coach ne pouvait donc pas relire
                            ce qu'il avait déposé avant de publier. */}
                        {b.type==="video"&&<ApercuVideoBloc bloc={b} />}
                        {b.type==="audio"&&<ApercuAudioBloc bloc={b} onOuvrir={()=>{ setSelectedAudio(b); setShowAudioModal(true); }} />}
                        {b.type==="document"&&<ApercuDocumentBloc bloc={b} />}
                        {b.type==="image"&&b.url&&<img src={b.url} alt={b.titre||"Illustration"} style={{ maxWidth:"100%", maxHeight:160, objectFit:"contain", borderRadius:8, background:"#f1f5f9", display:"block" }} />}
                        {b.type==="lien"&&<div style={{ background:"#e0f2fe",borderRadius:8,padding:12,fontSize:12,color:BET }}>🔗 <a href={b.url} target="_blank" rel="noreferrer" style={{ color:BET }}>{b.url}</a></div>}
                        {b.type==="exercice"&&<div style={{ background:"#fff7ed",borderRadius:8,padding:12,fontSize:12,color:"#92400e" }}><pre style={{ fontFamily:"inherit",margin:0,whiteSpace:"pre-wrap" }}>{b.contenu}</pre></div>}
                        {b.type==="quiz"&&b.questions?.length>0&&(
                          <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                            {b.questions.map((q,qi)=>(
                              <div key={q.id} style={{ padding:"8px 12px",borderRadius:8,background:"#f0f9ff",border:"1px solid #bae6fd" }}>
                                <div style={{ fontSize:12,fontWeight:600,color:"#0f172a",marginBottom:5 }}>Q{qi+1}. {q.texte}</div>
                                <div style={{ display:"flex",flexWrap:"wrap",gap:5 }}>
                                  {q.options.filter(Boolean).map((opt,oi)=>(
                                    <span key={oi} style={{ padding:"2px 8px",borderRadius:6,fontSize:11,background:opt===q.correct?"#dcfce7":"#f3f4f6",color:opt===q.correct?"#166534":"#6b7280",fontWeight:opt===q.correct?700:400 }}>
                                      {opt===q.correct?"✓ ":""}{opt}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );})}

                  {/* Formulaire ajout bloc */}
                  {showBlocForm&&(
                    <div style={{ marginTop:16,padding:18,borderRadius:12,background:"#f0f9ff",border:"1px solid #bae6fd" }}>
                      <div style={{ fontSize:13,fontWeight:700,color:"#0f172a",marginBottom:14 }}>{blocEnEdition ? "Modifier le bloc" : "Nouveau bloc de contenu"}</div>
                      {blocEnEdition && (
                        <div style={{ marginBottom:12, padding:"9px 13px", borderRadius:8, background:"#fef3c7", border:"1px solid #fde68a", fontSize:12, color:"#92400e", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
                          <span>✏️ Vous modifiez « <strong>{blocs.find(x=>x.id===blocEnEdition)?.titre || "ce bloc"}</strong> » - il sera remplacé, pas ajouté.</span>
                          <button onClick={annulerEditionBloc} style={{ background:"none", border:"none", color:"#92400e", fontWeight:700, fontSize:11.5, cursor:"pointer", textDecoration:"underline", whiteSpace:"nowrap" }}>Annuler la modification</button>
                        </div>
                      )}
                      <label style={labelSt}>Type de bloc</label>
                      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:7,marginBottom:14 }}>
                        {Object.entries(BLOCK_TYPES).filter(([k])=>blocsAutorises(editingModuleContent?.moduleBase?.type_contenu).includes(k)).map(([k,v])=>(
                          <button key={k} onClick={()=>setBlocForm({...blocForm,type:k})}
                            style={{ padding:"8px 10px",borderRadius:8,border:`1.5px solid ${blocForm.type===k?v.color:"#e5e7eb"}`,background:blocForm.type===k?v.color+"12":"#fff",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3 }}>
                            <span style={{ fontSize:18 }}>{v.icon}</span>
                            <span style={{ fontSize:10,fontWeight:blocForm.type===k?700:400,color:blocForm.type===k?v.color:"#374151" }}>{v.label}</span>
                          </button>
                        ))}
                      </div>
                      <label style={labelSt}>Titre du bloc *</label>
                      <input value={blocForm.titre} onChange={e=>setBlocForm({...blocForm,titre:e.target.value})} style={inputSt} placeholder="ex: Vidéo : Introduction aux réunions"/>
                      <div style={{ display:"grid",gridTemplateColumns:"1fr auto",gap:10 }}>
                        <div><label style={labelSt}>Durée estimée (min)</label><input type="number" value={blocForm.dureeMin} onChange={e=>setBlocForm({...blocForm,dureeMin:Number(e.target.value)})} style={inputSt} min={1}/></div>
                      </div>
                      {(blocForm.type==="texte"||blocForm.type==="exercice")&&(
                        <div>
                          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
                            <label style={labelSt}>Sections du cours</label>
                            <button onClick={()=>setBlocForm(f=>({ ...f, sections:[...f.sections,{id:Date.now(),niveau:"h2",titre:`${["I","II","III","IV","V","VI","VII","VIII"][f.sections.length]||"§"}. Nouvelle section`,contenu:""}] }))} style={{ ...btnPrimary,padding:"4px 10px",fontSize:11 }}>+ Section</button>
                          </div>
                          {blocForm.sections.map((sec,si)=>(
                            <div key={sec.id} style={{ borderRadius:10,border:"1px solid #bae6fd",background:"#f0f9ff",padding:12,marginBottom:10 }}>
                              <div style={{ display:"flex",gap:8,marginBottom:8,alignItems:"center" }}>
                                <select value={sec.niveau} onChange={e=>{ const s=[...blocForm.sections]; s[si]={...s[si],niveau:e.target.value}; setBlocForm(f=>({...f,sections:s})); }} style={{ ...inputSt,width:90,marginBottom:0,fontSize:11 }}>
                                  <option value="h1">Titre H1</option>
                                  <option value="h2">Section</option>
                                  <option value="h3">Sous-section</option>
                                  <option value="p">Paragraphe</option>
                                  <option value="ul">Liste</option>
                                  <option value="note">📌 Note</option>
                                </select>
                                <input value={sec.titre} onChange={e=>{ const s=[...blocForm.sections]; s[si]={...s[si],titre:e.target.value}; setBlocForm(f=>({...f,sections:s})); }} style={{ ...inputSt,marginBottom:0,flex:1,fontWeight:600 }} placeholder={`ex: I. Introduction`}/>
                                <button onClick={()=>setBlocForm(f=>({...f,sections:f.sections.filter((_,i)=>i!==si)}))} style={{ padding:"4px 8px",borderRadius:6,border:"1px solid #fca5a5",background:"#fff1f2",color:"#dc2626",cursor:"pointer",fontSize:12 }}>✕</button>
                              </div>
                              <textarea value={sec.contenu} onChange={e=>{ const s=[...blocForm.sections]; s[si]={...s[si],contenu:e.target.value}; setBlocForm(f=>({...f,sections:s})); }} style={{ ...inputSt,marginBottom:0,minHeight:70,resize:"vertical",fontFamily:"inherit" }} placeholder={sec.niveau==="ul"?"- Point 1\n- Point 2\n- Point 3":sec.niveau==="note"?"Remarque importante…":"Rédigez le contenu de cette section…"}/>
                            </div>
                          ))}
                          {blocForm.sections.length===0&&(
                            <div style={{ padding:14,textAlign:"center",color:"#9ca3af",fontSize:12,border:"1px dashed #d1d5db",borderRadius:8 }}>Cliquez "+ Section" pour commencer</div>
                          )}
                        </div>
                      )}
                      {(blocForm.type==="video"||blocForm.type==="audio")&&(
                        <>
                          <label style={labelSt}>Fichier</label>
                          <CloudinaryUpload type={blocForm.type} compact
                            label={blocForm.type==="video"?"Uploader une vidéo":"Uploader un audio"}
                            onSuccess={(file)=>setBlocForm(f=>({ ...f, url:file.url, fichier:file.original_name, taille:file.size?`${(file.size/1024/1024).toFixed(1)} MB`:"" }))}
                            onError={msg=>toast.error(msg)}/>
                          {blocForm.fichier&&<div style={{ fontSize:12, color:"#059669", marginTop:4 }}>✓ {blocForm.fichier}{blocForm.taille?` · ${blocForm.taille}`:""}</div>}
                          <label style={{ ...labelSt, marginTop:10 }}>…ou coller un lien</label>
                          <input type="url" value={blocForm.url} onChange={e=>setBlocForm({...blocForm,url:e.target.value,fichier:"",taille:""})} style={inputSt} placeholder="https://…"/>
                        </>
                      )}
                      {blocForm.type==="lien"&&(
                        <><label style={labelSt}>URL</label>
                        <input type="url" value={blocForm.url} onChange={e=>setBlocForm({...blocForm,url:e.target.value})} style={inputSt} placeholder="https://…"/></>
                      )}
                      {/* IMAGE - le type existait dans la liste mais n'avait aucun champ
                          d'envoi : on pouvait choisir « Image » puis rester devant un
                          formulaire sans moyen de déposer quoi que ce soit. */}
                      {blocForm.type==="image"&&(
                        <>
                          <label style={labelSt}>Image (JPG, PNG, WebP, HEIC…)</label>
                          <CloudinaryUpload
                            type="image"
                            label="Uploader une image"
                            compact
                            onSuccess={(file) => setBlocForm(f => ({ ...f, fichier: file.original_name, taille: file.size ? `${(file.size/1024/1024).toFixed(1)} MB` : "", url: file.url }))}
                            onError={(msg) => toast.error(msg)}
                          />
                          {blocForm.url && (
                            <img src={blocForm.url} alt="Aperçu" style={{ maxWidth:"100%", maxHeight:180, objectFit:"contain", borderRadius:8, marginTop:8, background:"#f1f5f9", display:"block" }} />
                          )}
                        </>
                      )}
                      {blocForm.type==="document"&&(
                        <>
                          <label style={labelSt}>Document (PDF, Word, Excel…)</label>
                          <CloudinaryUpload
                            type="document"
                            label="Uploader un document"
                            compact
                            onSuccess={(file) => setBlocForm(f => ({ ...f, fichier: file.original_name, taille: file.size ? `${(file.size/1024/1024).toFixed(1)} MB` : "", url: file.url }))}
                            onError={(msg) => toast.error(msg)}
                          />
                          {blocForm.fichier&&<div style={{ fontSize:12,color:"#059669",marginTop:4,marginBottom:4 }}>✓ {blocForm.fichier} {blocForm.taille&&`(${blocForm.taille})`}</div>}
                        </>
                      )}
                      {blocForm.type==="quiz"&&(
                        <div>
                          <label style={labelSt}>Questions du quiz ({blocForm.questions.length} ajoutée{blocForm.questions.length>1?"s":""})</label>
                          {blocForm.questions.map((q,qi)=>(
                            <div key={q.id} style={{ padding:"8px 10px",borderRadius:8,background:"#f0fdf4",border:"1px solid #bbf7d0",marginBottom:6,fontSize:12 }}>
                              <div style={{ fontWeight:600 }}>Q{qi+1}. {q.texte}</div>
                              <div style={{ color:"#9ca3af" }}>✓ {q.correct}</div>
                            </div>
                          ))}
                          <div style={{ background:"#fff",borderRadius:8,padding:12,border:"1px solid #e5e7eb",marginBottom:8 }}>
                            <div style={{ fontSize:12,fontWeight:600,color:"#374151",marginBottom:8 }}>Ajouter une question</div>
                            <input value={blocQuizQ.texte} onChange={e=>setBlocQuizQ({...blocQuizQ,texte:e.target.value})} style={{ ...inputSt,marginBottom:8 }} placeholder="Texte de la question (ex : What is the video about ?)"/>
                            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8 }}>
                              {[0,1,2,3].map(i=>(
                                <input key={i} value={blocQuizQ.options[i]} onChange={e=>{ const o=[...blocQuizQ.options]; o[i]=e.target.value; setBlocQuizQ({...blocQuizQ,options:o}); }} style={{ ...inputSt,marginBottom:0 }} placeholder={`Option ${i+1} (facultatif)`}/>
                              ))}
                            </div>
                            <select value={blocQuizQ.correct} onChange={e=>setBlocQuizQ({...blocQuizQ,correct:e.target.value})} style={{ ...inputSt,marginBottom:8 }}>
                              <option value="">- Aucune : question ouverte -</option>
                              {blocQuizQ.options.filter(Boolean).map((o,i)=><option key={i} value={o}>{o}</option>)}
                            </select>
                            <button onClick={addQuizQuestion} style={{ ...btnPrimary,padding:"6px 12px",fontSize:11 }}>+ Ajouter cette question</button>
                          </div>
                        </div>
                      )}
                      <div style={{ display:"flex",gap:8,marginTop:12 }}>
                        <button onClick={addBloc} style={btnPrimary}>{blocEnEdition ? "✓ Enregistrer les modifications" : "✓ Ajouter ce bloc"}</button>
                        <button onClick={annulerEditionBloc} style={btnSecondary}>Annuler</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding:"14px 24px",borderTop:"1px solid #e5e7eb",display:"flex",gap:10,justifyContent:"flex-end",background:"#f9fafb",borderRadius:"0 0 14px 14px" }}>
                <button onClick={fermerEditeurModule} style={btnSecondary}>Annuler</button>
                <button onClick={()=>saveModuleContent("brouillon")} style={{ ...btnSecondary,borderColor:"#d1d5db" }}>💾 Sauvegarder brouillon</button>
                <button onClick={()=>saveModuleContent("publie")} style={btnPrimary}>🚀 Publier le module</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ MODAL PROGRESSION INDIVIDUELLE ══ */}
        {showProgEtudModal&&selectedEtudProg&&(
          <Modal title={`Progression : ${selectedEtudProg.moduleTitre}`} onClose={()=>setShowProgEtudModal(false)} wide>
            <p style={{ fontSize:13,color:"#9ca3af",marginBottom:16 }}>Suivi individuel par étudiant pour ce module</p>
            <table style={tableStyle}><thead><tr>
              <th style={th}>Étudiant</th><th style={th}>Statut</th><th style={th}>Progression</th><th style={th}>Score quiz</th><th style={th}>Date completion</th>
            </tr></thead><tbody>
              {etudiants.filter(e=>e.coursIds.includes(selectedEtudProg.coursId)).map(e=>{
                const prog=studentProgressions[e.id]?.[String(selectedEtudProg.coursId)]?.[String(selectedEtudProg.moduleId)];
                const sm=STATUT_PROG_META[prog?.statut||"non_commence"];
                return (
                  <tr key={e.id} style={{ borderTop:"1px solid #f1f5f9" }}>
                    <td style={td}><div style={{ fontWeight:600,fontSize:13 }}>{e.nom}</div><div style={{ fontSize:11,color:"#9ca3af" }}>{e.email}</div></td>
                    <td style={td}><span style={{ padding:"3px 10px",borderRadius:10,fontSize:11,fontWeight:700,background:sm.bg,color:sm.c }}>{sm.icon} {sm.label}</span></td>
                    <td style={{ ...td,minWidth:120 }}>
                      <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                        <div style={{ flex:1,height:6,background:"#e5e7eb",borderRadius:3,overflow:"hidden" }}><div style={{ height:"100%",width:`${prog?.pct||0}%`,background:BET,borderRadius:3 }}/></div>
                        <span style={{ fontSize:12,fontWeight:700,color:BET }}>{prog?.pct||0}%</span>
                      </div>
                    </td>
                    <td style={td}><span style={{ fontWeight:700,color:prog?.quizScore!=null?(prog.quizScore>=60?"#22c55e":"#f59e0b"):"#9ca3af" }}>{prog?.quizScore!=null?`${prog.quizScore}%`:"-"}</span></td>
                    <td style={{ ...td,fontSize:12,color:"#6b7280" }}>{prog?.dateComplete?fmtDate(prog.dateComplete):"-"}</td>
                  </tr>
                );
              })}
            </tbody></table>
            <div style={{ display:"flex",gap:10,marginTop:16 }}>
              <button onClick={()=>exportCSVProgressions(selectedEtudProg.coursId)} style={btnSecondary}>⬇️ Exporter CSV</button>
              <button onClick={()=>setShowProgEtudModal(false)} style={btnSecondary}>Fermer</button>
            </div>
          </Modal>
        )}


        {/* ══ MODAL SÉANCES RÉCURRENTES ══ */}
        {showRecurringModal&&(
          <Modal title="Créer des séances récurrentes" onClose={()=>setShowRecurringModal(false)}>
            <p style={{ fontSize:13,color:"#6b7280",marginBottom:16 }}>Dupliquez une séance existante sur plusieurs semaines consécutives.</p>
            <label style={labelSt}>Séance de référence</label>
            <select value={recurringForm.seanceBaseId} onChange={e=>setRecurringForm({...recurringForm,seanceBaseId:e.target.value})} style={inputSt}>
              <option value="">Sélectionner une séance…</option>
              {seances.filter(s=>s.statut!=="annule").map(s=>(
                <option key={s.id} value={s.id}>{s.titre} - {fmtDateCourt(s.date)} {s.heure}</option>
              ))}
            </select>
            <label style={labelSt}>Nombre de semaines à dupliquer</label>
            <div style={{ display:"flex",alignItems:"center",gap:14,marginBottom:16 }}>
              <input type="range" min={1} max={12} step={1} value={recurringForm.nbSemaines} onChange={e=>setRecurringForm({...recurringForm,nbSemaines:Number(e.target.value)})} style={{ flex:1 }}/>
              <span style={{ fontWeight:800,color:BET,fontSize:18,minWidth:40 }}>{recurringForm.nbSemaines} sem.</span>
            </div>
            {recurringForm.seanceBaseId&&(
              <div style={{ padding:"10px 14px",borderRadius:8,background:"#e0f2fe",border:"1px solid #bae6fd",fontSize:12,color:BET }}>
                📅 {recurringForm.nbSemaines} nouvelle{recurringForm.nbSemaines>1?"s":""} séance{recurringForm.nbSemaines>1?"s":""} créée{recurringForm.nbSemaines>1?"s":""},<br/>chaque semaine +1 à partir du {fmtDateCourt(seances.find(s=>s.id===Number(recurringForm.seanceBaseId))?.date||"")}.
              </div>
            )}
            <div style={{ display:"flex",gap:10,marginTop:16 }}>
              <button onClick={saveRecurringSessions} disabled={!recurringForm.seanceBaseId} style={{ ...btnPrimary,opacity:!recurringForm.seanceBaseId?0.5:1 }}>🔄 Créer les séances</button>
              <button onClick={()=>setShowRecurringModal(false)} style={btnSecondary}>Annuler</button>
            </div>
          </Modal>
        )}

        {/* ══ MODAL NOTIFICATION ══ */}
        {showNotifModal&&(
          <Modal title="Envoyer une notification" onClose={()=>setShowNotifModal(false)}>
            <label style={labelSt}>Cours concerné</label>
            <select value={notifForm.coursId} onChange={e=>setNotifForm({...notifForm,coursId:e.target.value})} style={inputSt}>
              {cours.map(c=><option key={c.id} value={c.id}>{c.emoji} {c.titre} ({c.etudiants} étudiants)</option>)}
            </select>
            <label style={labelSt}>Type de notification</label>
            <select value={notifForm.type} onChange={e=>setNotifForm({...notifForm,type:e.target.value})} style={inputSt}>
              <option value="info">ℹ️ Information générale</option>
              <option value="module_publie">📚 Nouveau module disponible</option>
              <option value="evaluation">📝 Évaluation à venir</option>
              <option value="ressource_ajoutee">📄 Nouvelle ressource</option>
            </select>
            <label style={labelSt}>Titre *</label>
            <input value={notifForm.titre} onChange={e=>setNotifForm({...notifForm,titre:e.target.value})} style={inputSt} placeholder="ex: Nouveau module disponible"/>
            <label style={labelSt}>Message *</label>
            <textarea value={notifForm.message} onChange={e=>setNotifForm({...notifForm,message:e.target.value})} style={{ ...inputSt,minHeight:80,resize:"vertical" }} placeholder="ex: Le module 'Correspondance formelle' est maintenant accessible."/>
            <div style={{ padding:"10px 14px",borderRadius:8,background:"#e0f2fe",fontSize:12,color:BET,marginBottom:14 }}>
              📧 Cette notification sera envoyée à <strong>{cours.find(x=>x.id===notifForm.coursId)?.etudiants||0}</strong> étudiant(s) inscrit(s) au cours.
            </div>
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={sendNotification} style={btnPrimary}>🚀 Envoyer la notification</button>
              <button onClick={()=>setShowNotifModal(false)} style={btnSecondary}>Annuler</button>
            </div>
          </Modal>
        )}

        {/* ══ MODAL FICHE ÉTUDIANT ══ */}
        {showEtudModal&&selectedEtud&&(
          <Modal title="Fiche Étudiant" onClose={()=>setShowEtudModal(false)} wide>
            <div style={{ display:"flex", gap:16, paddingBottom:16, borderBottom:"1px solid #e5e7eb", marginBottom:16 }}>
              <div style={{ width:52, height:52, borderRadius:"50%", background:BET_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:16, color:BET, flexShrink:0, overflow:"hidden" }}>
                {selectedEtud.avatar_url ? <img src={selectedEtud.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : selectedEtud.nom.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:17, fontWeight:800 }}>{selectedEtud.nom}</div>
                <div style={{ fontSize:13, color:"#6b7280" }}>{selectedEtud.email}</div>
                <div style={{ display:"flex", gap:8, marginTop:6 }}><NivBadge n={selectedEtud.niveau}/><Sbadge s={selectedEtud.statut}/></div>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
              {[
                { l:"Progression", v:`${selectedEtud.progression}%`,  c:selectedEtud.progression>=60?BET:"#f59e0b" },
                { l:"Assiduité",   v:`${selectedEtud.assiduite}%`,    c:selectedEtud.assiduite>=85?"#22c55e":"#ef4444" },
                { l:"Dernière note",v:`${selectedEtud.dernNote}/20`,  c:selectedEtud.dernNote>=10?"#22c55e":"#ef4444" },
                { l:"Absences",    v:selectedEtud.absent,             c:selectedEtud.absent>5?"#ef4444":"#374151" },
              ].map(s=>(
                <div key={s.l} style={{ textAlign:"center", padding:12, borderRadius:10, background:"#f8fafc" }}>
                  <div style={{ fontSize:11, color:"#9ca3af" }}>{s.l}</div>
                  <div style={{ fontSize:20, fontWeight:800, color:s.c }}>{s.v}</div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, color:"#9ca3af", marginBottom:4 }}>Progression</div>
              <Bar value={selectedEtud.progression} color={BET} h={9}/>
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:"#9ca3af", marginBottom:4 }}>Assiduité</div>
              <Bar value={selectedEtud.assiduite} color={selectedEtud.assiduite>=85?"#22c55e":"#ef4444"} h={9}/>
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:600, color:"#374151", marginBottom:8 }}>Cours suivis</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {selectedEtud.coursIds.map(cId=>{ const c=cours.find(x=>x.id===cId); return c&&<span key={cId} style={{ padding:"4px 10px", borderRadius:8, fontSize:12, background:c.color+"15", color:c.color, fontWeight:600 }}>{c.emoji} {c.titre}</span>; })}
              </div>
            </div>
            {selectedEtud.commentaire&&(
              <div style={{ padding:"10px 14px", borderRadius:8, background:"#fef3c7", border:"1px solid #fcd34d", fontSize:12, color:"#92400e", marginBottom:16 }}>
                📝 {selectedEtud.commentaire}
              </div>
            )}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>{
                const body=encodeURIComponent(`Bonjour ${selectedEtud.nom},\n\nVoici votre bilan :\n- Progression : ${selectedEtud.progression}%\n- Assiduité : ${selectedEtud.assiduite}%\n- Dernière note : ${selectedEtud.dernNote}/20\n\nCordialement,\nProf. ${MON_PROFIL_REEL.nom}`);
                window.location.href=`mailto:${selectedEtud.email}?subject=Bilan formation&body=${body}`;
              }} style={btnPrimary}>📧 Envoyer un bilan</button>
              <button onClick={()=>setShowEtudModal(false)} style={btnSecondary}>Fermer</button>
            </div>
          </Modal>
        )}


        {/* ══ MODAL PRÉSENCE ══ */}

        {/* ══ MODAL SAISIE NOTE ══ */}
        {showNoteModal&&(
          <Modal title="Saisir une note" onClose={()=>setShowNoteModal(false)}>
            <label style={labelSt}>Étudiant *</label>
            <select value={noteForm.etudiantId} onChange={e=>setNoteForm({...noteForm,etudiantId:e.target.value})} style={inputSt}>
              <option value="">Sélectionner un étudiant</option>
              {etudiants.map(e=><option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
            <label style={labelSt}>Nom de l'évaluation *</label>
            <input type="text" placeholder="ex: Évaluation Module 4" value={noteForm.evalNom} onChange={e=>setNoteForm({...noteForm,evalNom:e.target.value})} style={inputSt}/>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div>
                <label style={labelSt}>Note obtenue *</label>
                <input type="number" min="0" max={noteForm.total} placeholder="0–20" value={noteForm.score} onChange={e=>setNoteForm({...noteForm,score:e.target.value})} style={inputSt}/>
              </div>
              <div>
                <label style={labelSt}>Note sur</label>
                <input type="number" value={noteForm.total} onChange={e=>setNoteForm({...noteForm,total:e.target.value})} style={inputSt}/>
              </div>
            </div>
            <label style={labelSt}>Commentaire (optionnel)</label>
            <textarea placeholder="Remarques pédagogiques…" value={noteForm.commentaire} onChange={e=>setNoteForm({...noteForm,commentaire:e.target.value})} style={{ ...inputSt, minHeight:60, resize:"vertical" }}/>
            {noteForm.score&&noteForm.total&&(
              <div style={{ padding:"8px 12px", borderRadius:8, background:Number(noteForm.score)/Number(noteForm.total)>=0.5?"#f0fdf4":"#fff5f5", border:`1px solid ${Number(noteForm.score)/Number(noteForm.total)>=0.5?"#bbf7d0":"#fecaca"}`, fontSize:12, marginBottom:10 }}>
                Résultat : <strong style={{ color:Number(noteForm.score)/Number(noteForm.total)>=0.5?"#22c55e":"#ef4444" }}>{Math.round(Number(noteForm.score)/Number(noteForm.total)*100)}%</strong>
                {" - "}{Number(noteForm.score)/Number(noteForm.total)>=0.5?"✅ Réussi":"❌ Non validé"}
              </div>
            )}
            <div style={{ display:"flex", gap:10, marginTop:14 }}>
              <button disabled={!peut("devoirs_evaluations","create")} title={permBtnTitle("Enregistrer",peut("devoirs_evaluations","create"))} onClick={saveNote} style={permBtnStyle(btnPrimary,peut("devoirs_evaluations","create"))}>{peut("devoirs_evaluations","create")?"💾":"🔒"} Enregistrer</button>
              <button onClick={()=>setShowNoteModal(false)} style={btnSecondary}>Annuler</button>
            </div>
          </Modal>
        )}

        {/* ══ MODAL AJOUTER RESSOURCE ══ */}
        {showAddRessModal&&(
          <Modal title="Ajouter une ressource" onClose={()=>setShowAddRessModal(false)} wide>
            <label style={labelSt}>Titre *</label>
            <input type="text" placeholder="ex: Guide de grammaire B2" value={ressForm.titre} onChange={e=>setRessForm({...ressForm,titre:e.target.value})} style={inputSt}/>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div>
                <label style={labelSt}>Type</label>
                <select value={ressForm.type} onChange={e=>setRessForm({...ressForm,type:e.target.value,url:"",fichierNom:"",speakConsigne:""})} style={inputSt}>
                  {Object.entries(TYPE_RESSOURCE).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
            </div>

            {/* ── Classes associées - sélection multiple ── */}
            {(() => {
              const groupesDispo = groupes.filter(g=>g.statut!=="archive"&&g.statut!=="cloture");
              const toggleGroupe = (gid) => setRessForm(f => ({
                ...f,
                groupe_ids: f.groupe_ids.includes(gid) ? f.groupe_ids.filter(id=>id!==gid) : [...f.groupe_ids, gid],
              }));
              const toutesCochees = groupesDispo.length > 0 && groupesDispo.every(g=>ressForm.groupe_ids.includes(g.id));
              return (
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <label style={{ ...labelSt, marginBottom:0 }}>Classes associées {ressForm.groupe_ids.length>0 && <span style={{ fontWeight:700, color:BET }}>({ressForm.groupe_ids.length})</span>}</label>
                    <button type="button" onClick={()=>setRessForm(f=>({ ...f, groupe_ids: toutesCochees ? [] : groupesDispo.map(g=>g.id) }))}
                      style={{ fontSize:11, fontWeight:700, color:BET, background:"none", border:"none", cursor:"pointer" }}>
                      {toutesCochees ? "Tout désélectionner" : "Tout sélectionner"}
                    </button>
                  </div>
                  <div style={{ maxHeight:220, overflowY:"auto", border:"1px solid #e2e8f0", borderRadius:10, padding:8, display:"flex", flexDirection:"column", gap:6 }}>
                    {groupesDispo.map(g=>{
                      const tm = RESS_TYPE_COURS_META[g.type_cours] || { icon:"📘", label:g.type_cours||"-" };
                      const checked = ressForm.groupe_ids.includes(g.id);
                      return (
                        <label key={g.id} onClick={()=>toggleGroupe(g.id)}
                          style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:8, border:`1.5px solid ${checked?BET:"#e2e8f0"}`, background:checked?BET_LIGHT:"#fff", cursor:"pointer" }}>
                          <input type="checkbox" checked={checked} onChange={()=>toggleGroupe(g.id)} style={{ accentColor:BET, flexShrink:0 }} onClick={e=>e.stopPropagation()} />
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:700, fontSize:12, color:"#0f172a" }}>{g.nom}{g.niveau?` · ${g.niveau}`:""}</div>
                            <div style={{ fontSize:10, color:"#94a3b8" }}>{tm.icon} {tm.label} · 👥 {g.nb_apprenants ?? 0} apprenant{(g.nb_apprenants||0)>1?"s":""}</div>
                          </div>
                        </label>
                      );
                    })}
                    {groupesDispo.length===0 && <div style={{ textAlign:"center", padding:12, color:"#9ca3af", fontSize:12 }}>Aucune classe active</div>}
                  </div>
                  {ressForm.groupe_ids.length===0 && (
                    <div style={{ fontSize:11, color:"#9ca3af", marginTop:6 }}>Aucune classe cochée → la ressource sera enregistrée localement uniquement, sans être partagée.</div>
                  )}
                </div>
              );
            })()}

            {/* ── AUDIO : upload Cloudinary + URL ── */}
            {ressForm.type === "audio" && (
              <div style={{ padding:"14px 16px", borderRadius:10, background:"#f0fdf4", border:"1px solid #bbf7d0", marginBottom:4 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#059669", marginBottom:10 }}>🎧 Fichier Audio</div>
                <CloudinaryUpload
                  type="audio"
                  label="Uploader un fichier audio"
                  currentUrl={ressForm.url && ressForm.fichierNom ? ressForm.url : undefined}
                  onSuccess={(file) => setRessForm(r => ({ ...r, url: file.url, fichierNom: file.original_name, taille: file.size ? `${(file.size/1024/1024).toFixed(1)} MB` : "" }))}
                  onError={(msg) => toast.error(msg)}
                  style={{ marginBottom: 8 }}
                />
                {ressForm.url && ressForm.fichierNom && <audio src={ressForm.url} controls style={{ width:"100%", height:36, marginBottom:8 }} />}
                <label style={labelSt}>- ou URL externe (lien direct MP3)</label>
                <input type="url" placeholder="https://example.com/audio.mp3" value={ressForm.fichierNom?"":ressForm.url} onChange={e=>setRessForm(r=>({...r,url:e.target.value,fichierNom:""}))} style={inputSt}/>
                <label style={labelSt}>Durée</label>
                <input type="text" placeholder="ex: 30 min" value={ressForm.taille} onChange={e=>setRessForm({...ressForm,taille:e.target.value})} style={inputSt}/>
              </div>
            )}

            {/* ── VIDÉO : upload Cloudinary + URL ── */}
            {ressForm.type === "video" && (
              <div style={{ padding:"14px 16px", borderRadius:10, background:"#f5f3ff", border:"1px solid #c4b5fd", marginBottom:4 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#7c3aed", marginBottom:10 }}>🎬 Fichier Vidéo</div>
                <CloudinaryUpload
                  type="video"
                  label="Uploader une vidéo"
                  currentUrl={ressForm.url && ressForm.fichierNom ? ressForm.url : undefined}
                  onSuccess={(file) => setRessForm(r => ({ ...r, url: file.url, fichierNom: file.original_name, taille: file.size ? `${(file.size/1024/1024).toFixed(0)} MB` : "" }))}
                  onError={(msg) => toast.error(msg)}
                  style={{ marginBottom: 8 }}
                />
                {ressForm.url && ressForm.fichierNom && <video src={ressForm.url} controls style={{ width:"100%", maxHeight:180, borderRadius:8, marginBottom:8 }} />}
                <label style={labelSt}>- ou URL YouTube / Vimeo / lien direct</label>
                <input type="url" placeholder="https://youtube.com/watch?v=… ou https://example.com/video.mp4" value={ressForm.fichierNom?"":ressForm.url} onChange={e=>setRessForm(r=>({...r,url:e.target.value,fichierNom:""}))} style={inputSt}/>
                <label style={labelSt}>Durée</label>
                <input type="text" placeholder="ex: 45 min" value={ressForm.taille} onChange={e=>setRessForm({...ressForm,taille:e.target.value})} style={inputSt}/>
              </div>
            )}

            {/* ── PDF : upload Cloudinary ── */}
            {ressForm.type === "pdf" && (
              <div style={{ padding:"14px 16px", borderRadius:10, background:"#fff5f5", border:"1px solid #fecaca", marginBottom:4 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#dc2626", marginBottom:10 }}>📄 Fichier PDF</div>
                <CloudinaryUpload
                  type="document"
                  label="Uploader un PDF"
                  currentUrl={ressForm.url && ressForm.fichierNom ? ressForm.url : undefined}
                  onSuccess={(file) => setRessForm(r => ({ ...r, url: file.url, fichierNom: file.original_name || file.public_id, taille: file.size ? `${(file.size/1024/1024).toFixed(1)} MB` : "" }))}
                  onError={(msg) => toast.error(msg)}
                  style={{ marginBottom: 8 }}
                />
                {ressForm.url && ressForm.fichierNom && (
                  <div style={{ marginTop:8, padding:"8px 12px", background:"#fff", borderRadius:8, border:"1px solid #e5e7eb", display:"flex", alignItems:"center", gap:8, fontSize:12 }}>
                    <span>📄</span>
                    <a href={ressForm.url?.replace("/raw/upload/", "/raw/upload/fl_attachment/")} target="_blank" rel="noreferrer" download={ressForm.fichierNom} style={{ color:"#dc2626", fontWeight:600, textDecoration:"none" }}>{ressForm.fichierNom}</a>
                    {ressForm.taille && <span style={{ color:"#9ca3af" }}>({ressForm.taille})</span>}
                  </div>
                )}
                <label style={{ ...labelSt, marginTop:10 }}>- ou URL externe (lien direct vers le PDF)</label>
                <input type="url" placeholder="https://example.com/document.pdf" value={ressForm.fichierNom ? "" : ressForm.url} onChange={e => setRessForm(r => ({ ...r, url: e.target.value, fichierNom: "" }))} style={inputSt}/>
              </div>
            )}

            {/* ── LIEN : URL externe ── */}
            {ressForm.type === "lien" && (
              <div style={{ padding:"14px 16px", borderRadius:10, background:"#f0f9ff", border:"1px solid #bae6fd", marginBottom:4 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#0891b2", marginBottom:10 }}>🔗 Lien externe</div>
                <label style={labelSt}>URL *</label>
                <input type="url" placeholder="https://example.com" value={ressForm.url} onChange={e => setRessForm(r => ({ ...r, url: e.target.value }))} style={inputSt}/>
              </div>
            )}

            {/* ── SPEAKING : formulaire complet ── */}
            {ressForm.type === "speaking" && (
              <div style={{ padding:"14px 16px", borderRadius:10, background:"#fef2f2", border:"1px solid #fecaca", marginBottom:4 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#dc2626", marginBottom:10 }}>🎤 Exercice Speaking à partager</div>
                <div style={{ padding:"8px 12px", borderRadius:8, background:"#fff7ed", border:"1px solid #fed7aa", fontSize:12, color:"#9a3412", marginBottom:12 }}>
                  ℹ️ Cet exercice apparaîtra dans l'onglet <strong>Examens → 🎤 Speaking</strong> de chaque apprenant concerné.
                </div>
                <label style={labelSt}>Format de speaking</label>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:10 }}>
                  {[["independant","💭","Opinion / Indépendant"],["integre_lecture","📖","Lecture + Expression"],["integre_audio","🎧","Audio + Expression"]].map(([v,ic,lb])=>(
                    <button key={v} onClick={()=>setRessForm(r=>({...r,speakType:v}))} style={{ padding:"10px 6px", borderRadius:8, border:`2px solid ${ressForm.speakType===v?"#dc2626":"#e5e7eb"}`, background:ressForm.speakType===v?"#fef2f2":"#fff", cursor:"pointer", textAlign:"center" }}>
                      <div style={{ fontSize:18 }}>{ic}</div>
                      <div style={{ fontSize:10, fontWeight:ressForm.speakType===v?700:400, color:ressForm.speakType===v?"#dc2626":"#374151", marginTop:2 }}>{lb}</div>
                    </button>
                  ))}
                </div>
                <label style={labelSt}>Consigne * (ce que l'apprenant devra dire)</label>
                <textarea placeholder="ex: Do you prefer working from home or in the office? Explain your preference with 2 reasons and an example." value={ressForm.speakConsigne} onChange={e=>setRessForm(r=>({...r,speakConsigne:e.target.value}))} style={{ ...inputSt, minHeight:80, resize:"vertical" }}/>
                {ressForm.speakType === "integre_audio" && (
                  <>
                    <label style={labelSt}>🎧 URL du fichier audio prompt</label>
                    <input type="url" placeholder="https://example.com/prompt.mp3" value={ressForm.url} onChange={e=>setRessForm(r=>({...r,url:e.target.value}))} style={inputSt}/>
                  </>
                )}
                <label style={labelSt}>Conseil (tip) pour l'apprenant (optionnel)</label>
                <input type="text" placeholder="ex: Structure: State preference → 2 reasons → example → conclude" value={ressForm.speakTip} onChange={e=>setRessForm(r=>({...r,speakTip:e.target.value}))} style={inputSt}/>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                  <div>
                    <label style={labelSt}>Niveau</label>
                    <select value={ressForm.speakNiveau} onChange={e=>setRessForm(r=>({...r,speakNiveau:e.target.value}))} style={inputSt}>
                      {["A2","B1","B2","C1","C2"].map(n=><option key={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelSt}>⏱ Préparation (sec)</label>
                    <input type="number" min={10} max={120} value={ressForm.speakPrepTime} onChange={e=>setRessForm(r=>({...r,speakPrepTime:Number(e.target.value)}))} style={inputSt}/>
                  </div>
                  <div>
                    <label style={labelSt}>🎙 Réponse max (sec)</label>
                    <input type="number" min={15} max={180} value={ressForm.speakRecordTime} onChange={e=>setRessForm(r=>({...r,speakRecordTime:Number(e.target.value)}))} style={inputSt}/>
                  </div>
                </div>
              </div>
            )}

            {/* Taille/Durée pour les autres types */}
            {!["audio","video","speaking"].includes(ressForm.type) && (
              <>
                <label style={labelSt}>Taille / Durée</label>
                <input type="text" placeholder="ex: 2.4 MB ou 30 min" value={ressForm.taille} onChange={e=>setRessForm({...ressForm,taille:e.target.value})} style={inputSt}/>
              </>
            )}

            <label style={{ ...labelSt, display:"flex", alignItems:"center", gap:8 }}>
              <input type="checkbox" checked={ressForm.partage} onChange={e=>setRessForm({...ressForm,partage:e.target.checked})}/> Partager avec les étudiants
            </label>
            <div style={{ display:"flex", gap:10, marginTop:14 }}>
              <button disabled={!peut("contenus_ressources","create")} title={permBtnTitle("Ajouter",peut("contenus_ressources","create"))} onClick={saveRessource} style={permBtnStyle(btnPrimary,peut("contenus_ressources","create"))}>
                {!peut("contenus_ressources","create")?"🔒":ressForm.type==="speaking"?"🎤 Publier l'exercice":ressForm.type==="audio"?"🎧 Ajouter l'audio":ressForm.type==="video"?"🎬 Ajouter la vidéo":"Ajouter"}
              </button>
              <button onClick={()=>setShowAddRessModal(false)} style={btnSecondary}>Annuler</button>
            </div>
          </Modal>
        )}

        {/* ══ MODAL NOUVEAU MESSAGE ══ */}
        {showNewMsgModal&&(
          <Modal title="✉️ Nouveau message" onClose={()=>setShowNewMsgModal(false)}>
            <label style={labelSt}>Destinataire</label>
            <select value={newMsgForm.destinataire} onChange={e=>setNewMsgForm(f=>({...f,destinataire:e.target.value,etudiantId:""}))} style={inputSt}>
              <option value="etudiant">👤 Un étudiant</option>
              <option value="responsable">🎓 Responsable pédagogique</option>
              <option value="superviseur">🔭 Superviseur Global</option>
              <option value="deputy_superviseur">🔍 Deputy Superviseur</option>
              <option value="onboarding">🎯 Assistant Onboarding</option>
            </select>
            {newMsgForm.destinataire==="etudiant"&&(
              <>
                <label style={labelSt}>Étudiant *</label>
                <select value={newMsgForm.etudiantId} onChange={e=>setNewMsgForm(f=>({...f,etudiantId:e.target.value}))} style={inputSt}>
                  <option value="">Sélectionner un étudiant</option>
                  {etudiants.map(e=><option key={e.id} value={e.id}>{e.nom}</option>)}
                </select>
              </>
            )}
            <label style={labelSt}>Objet *</label>
            <input type="text" placeholder="Sujet du message…" value={newMsgForm.objet} onChange={e=>setNewMsgForm(f=>({...f,objet:e.target.value}))} style={inputSt}/>
            <label style={labelSt}>Message *</label>
            <textarea placeholder="Votre message…" value={newMsgForm.message} onChange={e=>setNewMsgForm(f=>({...f,message:e.target.value}))} style={{ ...inputSt, minHeight:100, resize:"vertical" }}/>
            <div style={{ display:"flex", gap:10, marginTop:14 }}>
              <button onClick={()=>sendNewMessage()} style={btnPrimary}>📨 Envoyer</button>
              <button onClick={()=>setShowNewMsgModal(false)} style={btnSecondary}>Annuler</button>
            </div>
          </Modal>
        )}

        {/* ══ MODAL CRÉER ÉVALUATION / EXAMEN ══ */}
        {showCreateEvalModal&&(()=>{
          const LBL = { fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.05em", display:"block", marginBottom:6 };
          const INP = { ...inputSt, fontSize:13 };
          const CATS = [
            { id:"devoir",     icone:"📝", lib:"Devoir",     desc:"Fichier ou texte à soumettre", couleur:"#0891B2" },
            { id:"exercice",   icone:"✏️", lib:"Exercice",   desc:"Fichier ou texte à soumettre", couleur:"#059669" },
            { id:"evaluation", icone:"📊", lib:"Évaluation", desc:"Fichier ou texte à soumettre", couleur:"#7C3AED" },
          ];
          const TYPES_RENDU = [
            { id:"fichier",  lib:"📎 Fichier" },
            { id:"texte",    lib:"📝 Texte en ligne" },
          ];
          const FORMATS = [
            { id:"qcm",       icone:"📋", lib:"QCM" },
            { id:"listening", icone:"🎬", lib:"Listening" },
            { id:"audio",     icone:"🎧", lib:"Audio" },
            { id:"quiz",      icone:"🎯", lib:"Quiz" },
            { id:"speaking",  icone:"🎤", lib:"Speaking" },
          ];
          const catActive = CATS.find(c=>c.id===evalForm.categorie)||CATS[0];
          // Les 3 catégories (devoir/exercice/évaluation) partagent le même contenu - seule
          // la catégorie change (affecte le libellé et, côté serveur, le bonus de gamification
          // réservé aux devoirs notés ≥ 80 %). Les blocs (QCM/Listening/Audio/Quiz/Speaking,
          // combinables librement) ne sont proposés que pour le rendu "Texte en ligne"
          // (l'apprenant compose dans l'app) - un rendu "Fichier" n'a pas de format à choisir,
          // l'apprenant dépose simplement son document.
          const avecFichier = evalForm.typeRendu === "fichier";
          const avecFormat  = evalForm.typeRendu === "texte";
          const titreDyn  = { devoir:"📝 Créer un devoir", exercice:"✏️ Créer un exercice", evaluation:"📊 Créer une évaluation" }[evalForm.categorie]||"+ Créer";
          const fermerModal = () => setShowCreateEvalModal(false);
          return (
            <>
              <div onClick={fermerModal} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:2000,backdropFilter:"blur(2px)" }}/>
              <div style={{ position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:"90vw",maxWidth:"90vw",height:"90vh",maxHeight:"90vh",background:"#fff",borderRadius:20,boxShadow:"0 24px 64px rgba(0,0,0,0.25)",zIndex:2001,display:"flex",flexDirection:"column",overflow:"hidden" }}>

                {/* En-tête */}
                <div style={{ background:"linear-gradient(135deg,#0f172a 0%,#0E4F6B 100%)",padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0 }}>
                  <div>
                    <div style={{ fontSize:18,fontWeight:800,color:"#fff" }}>{evalEditId?`✏️ Modifier le ${evalForm.categorie}`:titreDyn}</div>
                    <div style={{ fontSize:12,color:"rgba(255,255,255,0.55)",marginTop:2 }}>{evalEditId?"Modifiez les informations du brouillon":"Assignez un travail à vos apprenants"}</div>
                  </div>
                  <button onClick={fermerModal} style={{ background:"rgba(255,255,255,0.12)",border:"none",borderRadius:8,width:34,height:34,color:"#fff",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>✕</button>
                </div>

                {/* Corps scrollable */}
                <div style={{ overflowY:"auto",padding:"24px",display:"flex",flexDirection:"column",gap:20,flex:1 }}>

                  {/* Type */}
                  <div>
                    <label style={LBL}>Type</label>
                    <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8 }}>
                      {CATS.map(cat=>{
                        const actif = evalForm.categorie===cat.id;
                        return (
                          <button key={cat.id} onClick={()=>setEvalForm(f=>({...f,categorie:cat.id}))}
                            style={{ border:`2px solid ${actif?cat.couleur:"#e5e7eb"}`,borderRadius:12,padding:"10px 8px",background:actif?cat.couleur+"12":"#fff",cursor:"pointer",textAlign:"center" }}>
                            <div style={{ fontSize:20,marginBottom:4 }}>{cat.icone}</div>
                            <div style={{ fontSize:12,fontWeight:700,color:actif?cat.couleur:"#0f172a" }}>{cat.lib}</div>
                            <div style={{ fontSize:10,color:"#9ca3af",marginTop:2,lineHeight:1.3 }}>{cat.desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Champs communs */}
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>

                    {/* Titre pleine largeur */}
                    <div style={{ gridColumn:"1/-1" }}>
                      <label style={LBL}>Titre *</label>
                      <input style={INP}
                        placeholder={evalForm.categorie==="devoir"?"Ex : Devoir maison - Present Perfect":evalForm.categorie==="exercice"?"Ex : Exercice de prononciation":"Ex : Évaluation Module 3"}
                        value={evalForm.titre} onChange={e=>setEvalForm(f=>({...f,titre:e.target.value}))}/>
                    </div>

                    {/* Groupe */}
                    <div>
                      <label style={LBL}>Groupe *</label>
                      <select style={{ ...INP,width:"100%" }} value={evalForm.groupe_id} onChange={e=>setEvalForm(f=>({...f,groupe_id:e.target.value}))}>
                        <option value="">- Sélectionner -</option>
                        {groupes.filter(g=>g.statut!=="archive"&&g.statut!=="cloture").map(g=><option key={g.id} value={g.id}>{g.nom}</option>)}
                      </select>
                      {(() => {
                        const groupeSel = groupes.find(g => g.id === evalForm.groupe_id);
                        if (!groupeSel) return null;
                        return (
                          <div style={{ marginTop:8, background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:10, padding:"10px 14px", display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
                            <span style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>👥 {groupeSel.nom}</span>
                            {groupeSel.niveau && (
                              <span style={{ fontSize:11.5, padding:"2px 9px", borderRadius:20, background:"#E0F2FE", color:"#0E7490", fontWeight:700 }}>🎯 {groupeSel.niveau}</span>
                            )}
                            <span style={{ fontSize:12, color:"#6b7280" }}>👩‍🎓 {groupeSel.nb_apprenants ?? 0} apprenant{(groupeSel.nb_apprenants ?? 0) > 1 ? "s" : ""}</span>
                            <span style={{ fontSize:11.5, padding:"2px 9px", borderRadius:20, background:groupeSel.statut==="actif"?"#D1FAE5":"#f1f5f9", color:groupeSel.statut==="actif"?"#065F46":"#6b7280", fontWeight:700 }}>
                              {groupeSel.statut==="actif" ? "✓ Actif" : groupeSel.statut || "-"}
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Date limite */}
                    <div>
                      <label style={LBL}>Date limite</label>
                      <input type="date" style={INP} value={evalForm.date_limite} onChange={e=>setEvalForm(f=>({...f,date_limite:e.target.value}))}/>
                    </div>

                    {/* Heure limite */}
                    <div>
                      <label style={LBL}>Heure limite</label>
                      <input type="time" style={INP} value={evalForm.heure_limite} onChange={e=>setEvalForm(f=>({...f,heure_limite:e.target.value}))}/>
                    </div>

                    {/* Date/heure ouverture - disponible pour tout type de rendu */}
                    <div>
                      <label style={LBL}>📅 Date d'ouverture</label>
                      <input type="date" style={INP} value={evalForm.date_ouverture} onChange={e=>setEvalForm(f=>({...f,date_ouverture:e.target.value}))}/>
                    </div>
                    <div>
                      <label style={LBL}>🕐 Heure d'ouverture</label>
                      <input type="time" style={INP} value={evalForm.heure_ouverture} onChange={e=>setEvalForm(f=>({...f,heure_ouverture:e.target.value}))}/>
                    </div>

                  </div>

                  {/* Instructions - communes aux 3 catégories */}
                  <div>
                    <label style={LBL}>Instructions</label>
                    <textarea style={{ ...INP,minHeight:90,resize:"vertical",lineHeight:1.6 }}
                      placeholder={evalForm.categorie==="devoir"?"Décrivez ce que les élèves doivent faire…":evalForm.categorie==="exercice"?"Décrivez l'activité à réaliser en classe ou en autonomie…":"Décrivez ce qui est attendu des élèves…"}
                      value={evalForm.instructions} onChange={e=>setEvalForm(f=>({...f,instructions:e.target.value}))}/>
                  </div>

                  {/* Type de rendu - communes aux 3 catégories */}
                  <div>
                    <label style={LBL}>Type de rendu</label>
                    <div style={{ display:"flex",gap:8 }}>
                      {TYPES_RENDU.map(t=>{
                        const actif = evalForm.typeRendu===t.id;
                        return (
                          <button key={t.id} onClick={()=>setEvalForm(f=>({...f,typeRendu:t.id}))}
                            style={{ flex:1,padding:"9px 10px",borderRadius:8,border:`2px solid ${actif?BET:"#e5e7eb"}`,background:actif?BET+"12":"#fff",color:actif?BET:"#6b7280",fontSize:12,fontWeight:600,cursor:"pointer" }}>
                            {t.lib}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Rendu fichier : joindre un fichier de départ (optionnel) */}
                  {avecFichier && (
                    <div>
                      <label style={LBL}>Fichier à joindre (optionnel)</label>
                      <label style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",border:`2px dashed ${evalForm.ressourceUrl?BET:"#d1d5db"}`,borderRadius:12,padding:"18px 14px",cursor:uploadExerciceEnCours?"wait":"pointer",background:evalForm.ressourceUrl?`${BET}10`:"#f8fafc",gap:8 }}>
                        <span style={{ fontSize:24 }}>{uploadExerciceEnCours?"⏳":evalForm.ressourceUrl?"✅":"📁"}</span>
                        <span style={{ fontSize:12.5,color:evalForm.ressourceUrl?BET:"#6b7280",fontWeight:600,textAlign:"center",wordBreak:"break-all" }}>
                          {uploadExerciceEnCours?"Envoi en cours…":evalForm.ressourceUrl?(evalForm.ressourceUrl.split("/").pop()||"Fichier joint"):"Cliquez pour joindre un fichier"}
                        </span>
                        <input type="file" style={{ display:"none" }} disabled={uploadExerciceEnCours}
                          onChange={e=>e.target.files[0] && uploaderExerciceDevoir(e.target.files[0])}/>
                      </label>
                      {evalForm.ressourceUrl && (
                        <button type="button" onClick={()=>setEvalForm(f=>({...f,ressourceUrl:""}))}
                          style={{ marginTop:6,background:"none",border:"none",color:"#DC2626",fontSize:11.5,fontWeight:600,cursor:"pointer",padding:0 }}>
                          ✕ Retirer le fichier
                        </button>
                      )}
                    </div>
                  )}

                  {/* Rendu texte : blocs de contenu - QCM, Listening, Audio, Quiz, Speaking,
                      combinables librement dans une même évaluation (ordre d'ajout). */}
                  {avecFormat && (
                    <div>
                      <label style={LBL}>Blocs de contenu (optionnel - laissez vide pour une simple zone de texte libre)</label>
                      <div style={{ display:"flex",flexDirection:"column",gap:10,marginBottom:10 }}>
                        {evalForm.blocs.map((b,bi)=>{
                          const fmt = FORMATS.find(f=>f.id===b.type)||FORMATS[0];
                          const isEditing = evalBlocEditing===b.id;
                          const avecQuestions = ["qcm","listening","audio","quiz"].includes(b.type);
                          return (
                            <div key={b.id} style={{ border:`1.5px solid ${isEditing?catActive.couleur:"#e5e7eb"}`, borderRadius:12, overflow:"hidden" }}>
                              <div style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:isEditing?catActive.couleur+"10":"#f8fafc" }}>
                                <span style={{ fontSize:16 }}>{fmt.icone}</span>
                                <span style={{ fontSize:12,fontWeight:700,color:"#0f172a" }}>Bloc {bi+1} · {fmt.lib}</span>
                                {avecQuestions && <span style={{ fontSize:11,color:"#9ca3af" }}>({(b.questions||[]).length} question{(b.questions||[]).length>1?"s":""})</span>}
                                <div style={{ marginLeft:"auto",display:"flex",gap:6 }}>
                                  <button onClick={()=>setEvalBlocEditing(isEditing?null:b.id)}
                                    style={{ padding:"4px 10px",borderRadius:6,border:"1px solid #e5e7eb",background:"#fff",fontSize:11,fontWeight:600,color:"#374151",cursor:"pointer" }}>
                                    {isEditing?"Réduire":"✏️ Éditer"}
                                  </button>
                                  <button onClick={()=>removeEvalBloc(b.id)}
                                    style={{ padding:"4px 10px",borderRadius:6,border:"none",background:"#FEE2E2",fontSize:11,fontWeight:600,color:"#991B1B",cursor:"pointer" }}>
                                    ✕ Retirer
                                  </button>
                                </div>
                              </div>

                              {isEditing && (
                                <div style={{ padding:14,display:"flex",flexDirection:"column",gap:12 }}>
                                  {b.type==="speaking" && (
                                    <div>
                                      <label style={LBL}>Consigne speaking</label>
                                      <textarea style={{ ...INP,minHeight:70,resize:"vertical",lineHeight:1.6 }}
                                        placeholder="Décrivez la tâche orale demandée à l'apprenant…"
                                        value={b.instructions} onChange={e=>updateEvalBloc(b.id,{instructions:e.target.value})}/>
                                    </div>
                                  )}

                                  {["listening","audio","speaking"].includes(b.type) && (
                                    <div>
                                      <label style={LBL}>
                                        {b.type==="listening" ? "Vidéo à regarder avant de répondre" : b.type==="audio" ? "Audio à écouter avant de répondre" : "Support audio/vidéo (optionnel - exemple ou consigne enregistrée)"}
                                      </label>
                                      <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                                        <input style={{ ...INP,flex:1 }} placeholder={b.type==="listening"?"https://youtube.com/…":"https://…/audio.mp3"}
                                          value={b.ressourceUrl} onChange={e=>updateEvalBloc(b.id,{ressourceUrl:e.target.value})}/>
                                        <label style={{ padding:"9px 14px",borderRadius:8,border:"1.5px dashed #cbd5e1",background:"#fff",fontSize:12,fontWeight:600,color:"#6b7280",cursor:uploadBlocEnCours===b.id?"wait":"pointer",whiteSpace:"nowrap" }}>
                                          {uploadBlocEnCours===b.id?"⏳ Envoi…":"📁 Téléverser"}
                                          <input type="file" accept="audio/*,video/*" style={{ display:"none" }} disabled={uploadBlocEnCours===b.id}
                                            onChange={e=>e.target.files[0] && uploaderRessourceBloc(b.id, e.target.files[0])}/>
                                        </label>
                                      </div>
                                      <div style={{ fontSize:11,color:"#9ca3af",marginTop:4 }}>Colle un lien (YouTube, etc.) ou téléverse directement un fichier audio/vidéo.</div>
                                    </div>
                                  )}

                                  {b.type==="speaking" && (
                                    <div>
                                      <label style={LBL}>Conseil / tip pour l'apprenant</label>
                                      <input style={INP} placeholder="Ex : Parlez pendant au moins 2 minutes…"
                                        value={b.conseil||""} onChange={e=>updateEvalBloc(b.id,{conseil:e.target.value})}/>
                                    </div>
                                  )}

                                  {avecQuestions && (
                                    <div style={{ background:"#f8fafc",borderRadius:10,padding:14,border:"1px solid #e2e8f0" }}>
                                      {(b.questions||[]).map((q,qi)=>(
                                        <div key={q.id||qi} style={{ background:"#fff",borderRadius:8,padding:"10px 14px",border:"1px solid #e5e7eb",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:8 }}>
                                          <div style={{ flex:1 }}>
                                            <div style={{ fontSize:13,fontWeight:600,color:"#0f172a",marginBottom:4 }}>Q{qi+1}. {q.texte||q.text}</div>
                                            <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
                                              {(q.options||[]).map((opt,oi)=>(
                                                <span key={oi} style={{ fontSize:11,padding:"2px 8px",borderRadius:20,background:opt===q.correct?"#D1FAE5":"#f1f5f9",color:opt===q.correct?"#065F46":"#6b7280",fontWeight:opt===q.correct?700:400 }}>
                                                  {opt===q.correct?"✓ ":""}{opt}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                          <button onClick={()=>removeEvalBlocQuestion(b.id,qi)}
                                            style={{ background:"#FEE2E2",border:"none",borderRadius:6,padding:"4px 8px",color:"#991B1B",fontSize:11,cursor:"pointer",flexShrink:0 }}>✕</button>
                                        </div>
                                      ))}
                                      <div style={{ display:"flex",flexDirection:"column",gap:10,marginTop:4 }}>
                                        <input style={{ ...INP,fontSize:13 }} placeholder="Texte de la question…"
                                          value={evalQForm.texte} onChange={e=>setEvalQForm(f=>({...f,texte:e.target.value}))}/>
                                        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                                          {[0,1,2,3].map(i=>(
                                            <input key={i} style={{ ...INP,fontSize:12 }} placeholder={`Option ${String.fromCharCode(65+i)}…`}
                                              value={evalQForm.options[i]} onChange={e=>{ const o=[...evalQForm.options]; o[i]=e.target.value; setEvalQForm(f=>({...f,options:o})); }}/>
                                          ))}
                                        </div>
                                        <div style={{ display:"flex",gap:10,alignItems:"center" }}>
                                          <div style={{ flex:1 }}>
                                            <label style={{ ...LBL,marginBottom:4 }}>Bonne réponse</label>
                                            <select style={{ ...INP,width:"100%" }} value={evalQForm.correct} onChange={e=>setEvalQForm(f=>({...f,correct:e.target.value}))}>
                                              <option value="">- Choisir -</option>
                                              {evalQForm.options.filter(Boolean).map((o,i)=><option key={i} value={o}>{String.fromCharCode(65+i)}. {o}</option>)}
                                            </select>
                                          </div>
                                          <button disabled={!evalQForm.texte||!evalQForm.correct} onClick={()=>addEvalQuestion()}
                                            style={{ ...btnPrimary,padding:"8px 14px",fontSize:12,marginTop:18,opacity:(!evalQForm.texte||!evalQForm.correct)?0.5:1,cursor:(!evalQForm.texte||!evalQForm.correct)?"not-allowed":"pointer" }}>
                                            + Ajouter
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                        {FORMATS.map(f=>(
                          <button key={f.id} onClick={()=>addEvalBloc(f.id)}
                            style={{ padding:"7px 12px",borderRadius:8,border:"1.5px dashed #cbd5e1",background:"#fff",color:"#6b7280",fontSize:12,fontWeight:600,cursor:"pointer" }}>
                            {f.icone} + {f.lib}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                </div>

                {/* Pied */}
                <div style={{ padding:"16px 24px",borderTop:"1px solid #e5e7eb",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexShrink:0,flexWrap:"wrap" }}>
                  {/* Une évaluation a une échéance : la manquer a une conséquence. C'est ici
                      que l'email compte le plus - il porte la date limite. Un seul envoi par
                      évaluation, quelles que soient les republications. */}
                  <label style={{ display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12.5,color:"#374151" }}>
                    <input type="checkbox" checked={!!evalForm.envoyerEmail}
                      onChange={e=>setEvalForm(f=>({ ...f, envoyerEmail:e.target.checked }))}
                      style={{ cursor:"pointer" }} />
                    <span>
                      <strong>✉️ Prévenir par email</strong>
                      <span style={{ color:"#9ca3af" }}> - apprenants et parents, une seule fois</span>
                    </span>
                  </label>
                  <div style={{ display:"flex",gap:10,marginLeft:"auto" }}>
                  <button onClick={fermerModal} style={btnSecondary}>Annuler</button>
                  <button onClick={()=>sauvegarderEval(false)} disabled={!evalForm.titre||!evalForm.groupe_id}
                    style={{ ...btnPrimary,background:catActive.couleur,opacity:(!evalForm.titre||!evalForm.groupe_id)?0.5:1,cursor:(!evalForm.titre||!evalForm.groupe_id)?"not-allowed":"pointer" }}>
                    {catActive.icone} {evalEditId?"Enregistrer":"Créer"} {catActive.lib.toLowerCase()}
                  </button>
                  <button onClick={()=>sauvegarderEval(true)} disabled={!evalForm.titre||!evalForm.groupe_id}
                    style={{ padding:"9px 18px",borderRadius:9,border:"none",background:!evalForm.titre||!evalForm.groupe_id?"#e5e7eb":"#22c55e",color:"#fff",fontSize:13,fontWeight:700,cursor:!evalForm.titre||!evalForm.groupe_id?"not-allowed":"pointer",opacity:!evalForm.titre||!evalForm.groupe_id?0.5:1 }}>
                    🚀 Créer & publier
                  </button>
                  </div>
                </div>

              </div>
            </>
          );
        })()}

        {/* ══ MODAL NOUVEAU COURS - Wizard 3 étapes ══ */}

        {/* ══ MODAL NOUVEAU MODULE - Wizard 3 étapes ══ */}
        {showNewModuleModal&&(()=>{
          const fermerMod = () => { setShowNewModuleModal(false); setEtapeModule(1); };
          // Cours filtrés selon la classe sélectionnée dans le modal
          const coursDeLaClasse = newModForm.groupe_id
            ? cours.filter(c => c.groupe_id === newModForm.groupe_id)
            : cours;
          const peutEtape2Mod = !!newModForm.type_contenu && !!newModForm.groupe_id && !!newModForm.coursId;
          const peutCreer = newModForm.titre.trim().length>=2;
          const TYPE_CONTENU_META = [
            { key:"lecon",    emoji:"📖", label:"Leçon",     color:"#2563eb", desc:"Cours théorique" },
            { key:"audio",    emoji:"🎧", label:"Audio",     color:"#7c3aed", desc:"Écoute & compréhension" },
            { key:"video",    emoji:"🎬", label:"Vidéo",     color:"#dc2626", desc:"Contenu vidéo" },
          ];
          const selectedType = TYPE_CONTENU_META.find(t=>t.key===newModForm.type_contenu)||TYPE_CONTENU_META[0];
          const ETAPES_MOD = ["Type","Contenu","Récapitulatif"];
          const coursSelectionne = cours.find(c=>String(c.id)===String(newModForm.coursId));
          return (
            <div style={{ position:"fixed", inset:0, zIndex:3000, background:"rgba(15,23,42,0.55)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
              <div style={{ width:"90vw", maxWidth:"90vw", height:"90vh", maxHeight:"90vh", borderRadius:16, overflow:"hidden", display:"flex", flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.35)", background:"#fff" }}>
                {/* Header gradient */}
                <div style={{ background:`linear-gradient(135deg, ${selectedType.color} 0%, ${selectedType.color}cc 100%)`, padding:"20px 24px", flexShrink:0 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontSize:26 }}>{selectedType.emoji}</span>
                      <div>
                        <div style={{ fontWeight:800, fontSize:17, color:"#fff" }}>Nouveau module</div>
                        <div style={{ fontSize:12, color:"rgba(255,255,255,0.75)" }}>Étape {etapeModule} sur {ETAPES_MOD.length}</div>
                      </div>
                    </div>
                    <button onClick={fermerMod} style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, width:32, height:32, color:"#fff", fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                  </div>
                  {/* Stepper */}
                  <div style={{ display:"flex", gap:0 }}>
                    {ETAPES_MOD.map((lbl,i)=>{
                      const n=i+1; const done=n<etapeModule; const active=n===etapeModule;
                      return (
                        <div key={n} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                          <div style={{ width:28, height:28, borderRadius:"50%", background:done?"#22c55e":active?"#fff":"rgba(255,255,255,0.3)", color:done?"#fff":active?selectedType.color:"rgba(255,255,255,0.7)", fontSize:13, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{done?"✓":n}</div>
                          <span style={{ fontSize:10, color:active?"#fff":"rgba(255,255,255,0.6)", fontWeight:active?700:400 }}>{lbl}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Body */}
                <div style={{ padding:"22px 24px", flex:1, overflowY:"auto" }}>
                  {etapeModule===1&&(
                    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                      <div>
                        <label style={labelSt}>Classe *</label>
                        <select
                          value={newModForm.groupe_id}
                          onChange={e => setNewModForm(f => ({ ...f, groupe_id: e.target.value, coursId: "" }))}
                          style={inputSt}
                        >
                          <option value="">- Sélectionner une classe -</option>
                          {groupes.filter(g => g.statut !== "archive" && g.statut !== "cloture").map(g => (
                            <option key={g.id} value={g.id}>{g.nom}{g.niveau ? " · " + g.niveau : ""}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={labelSt}>Cours rattaché *</label>
                        <select
                          value={newModForm.coursId}
                          onChange={e => setNewModForm(f => ({ ...f, coursId: e.target.value }))}
                          style={inputSt}
                          disabled={!newModForm.groupe_id}
                        >
                          <option value="">- {newModForm.groupe_id ? "Sélectionner un cours" : "Choisir une classe d'abord"} -</option>
                          {coursDeLaClasse.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.titre}</option>)}
                        </select>
                        {newModForm.groupe_id && coursDeLaClasse.length === 0 && (
                          <div style={{ fontSize:11, color:"#f59e0b", marginTop:4 }}>
                            ⚠️ Aucun cours dans cette classe - créez d'abord un cours.
                          </div>
                        )}
                      </div>
                      <div>
                        <label style={labelSt}>Type de contenu *</label>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                          {TYPE_CONTENU_META.map(t=>(
                            <button key={t.key} onClick={()=>setNewModForm(f=>({...f,type_contenu:t.key}))} style={{ padding:"12px 8px", borderRadius:10, border:`2px solid ${newModForm.type_contenu===t.key?t.color:"#e5e7eb"}`, background:newModForm.type_contenu===t.key?t.color+"14":"#fafafa", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:4, transition:"all .15s" }}>
                              <span style={{ fontSize:24 }}>{t.emoji}</span>
                              <span style={{ fontSize:12, fontWeight:700, color:newModForm.type_contenu===t.key?t.color:"#374151" }}>{t.label}</span>
                              <span style={{ fontSize:10, color:"#9ca3af", textAlign:"center" }}>{t.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {etapeModule===2&&(
                    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                      <div>
                        <label style={labelSt}>Titre du module *</label>
                        <input autoFocus type="text" placeholder="ex: Compréhension orale avancée" value={newModForm.titre} onChange={e=>setNewModForm(f=>({...f,titre:e.target.value}))} style={inputSt}/>
                      </div>
                      <div>
                        <label style={labelSt}>Objectifs pédagogiques</label>
                        <textarea placeholder="Décrivez les objectifs et compétences visés…" value={newModForm.objectifs} onChange={e=>setNewModForm(f=>({...f,objectifs:e.target.value}))} style={{ ...inputSt, minHeight:80, resize:"vertical" }}/>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                        <div>
                          <label style={labelSt}>Durée estimée (min)</label>
                          <input type="number" min={10} max={600} value={newModForm.dureeEstimee} onChange={e=>setNewModForm(f=>({...f,dureeEstimee:Number(e.target.value)}))} style={inputSt}/>
                        </div>
                        <div>
                          <label style={labelSt}>Semaine / Séquence</label>
                          <input type="text" placeholder="ex: Semaine 3" value={newModForm.semaine} onChange={e=>setNewModForm(f=>({...f,semaine:e.target.value}))} style={inputSt}/>
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                        <div>
                          <label style={labelSt}>Statut initial</label>
                          <select value={newModForm.statut} onChange={e=>setNewModForm(f=>({...f,statut:e.target.value}))} style={inputSt}>
                            <option value="brouillon">📝 Brouillon</option>
                            <option value="publie">✅ Publié</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                  {etapeModule===3&&(
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      <div style={{ padding:"14px 18px", borderRadius:12, background:selectedType.color+"12", border:`2px solid ${selectedType.color}40`, display:"flex", alignItems:"center", gap:14, marginBottom:4 }}>
                        <span style={{ fontSize:38 }}>{selectedType.emoji}</span>
                        <div>
                          <div style={{ fontWeight:800, fontSize:16, color:selectedType.color }}>{newModForm.titre||"-"}</div>
                          <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>{selectedType.label} · {newModForm.dureeEstimee}min</div>
                          {coursSelectionne&&<div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>{coursSelectionne.emoji} {coursSelectionne.titre}</div>}
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                        {[
                          ["📦 Type",selectedType.label],
                          ["⏱️ Durée",newModForm.dureeEstimee+"min"],
                          ["📅 Semaine",newModForm.semaine||"-"],
                          ["🌐 Statut",newModForm.statut==="publie"?"✅ Publié":"📝 Brouillon"],
                        ].map(([k,v])=>(
                          <div key={String(k)} style={{ padding:"10px 12px", borderRadius:8, background:"#f8fafc", border:"1px solid #e5e7eb" }}>
                            <div style={{ fontSize:10, color:"#9ca3af", fontWeight:600 }}>{k}</div>
                            <div style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginTop:2 }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {newModForm.objectifs&&(
                        <div style={{ padding:"10px 14px", borderRadius:8, background:"#f8fafc", border:"1px solid #e5e7eb" }}>
                          <div style={{ fontSize:10, color:"#9ca3af", fontWeight:600, marginBottom:4 }}>🎯 OBJECTIFS</div>
                          <div style={{ fontSize:12, color:"#374151", lineHeight:1.6 }}>{newModForm.objectifs}</div>
                        </div>
                      )}
                      <div style={{ padding:"10px 14px", borderRadius:8, background:BET_LIGHT, border:`1px solid ${BET}30`, fontSize:12, color:BET }}>
                        💡 Après création, vous pourrez ajouter les blocs de contenu dans Modules & Contenu.
                      </div>
                    </div>
                  )}
                </div>
                {/* Footer */}
                <div style={{ padding:"14px 24px", borderTop:"1px solid #f1f5f9", display:"flex", justifyContent:"space-between", gap:10, background:"#fafafa", flexShrink:0 }}>
                  <button onClick={()=>etapeModule>1?setEtapeModule(e=>e-1):fermerMod()} style={{ ...btnSecondary, minWidth:100 }}>{etapeModule>1?"← Retour":"Annuler"}</button>
                  {etapeModule<3
                    ? <button onClick={()=>setEtapeModule(e=>e+1)} disabled={etapeModule===1&&!peutEtape2Mod} style={{ ...btnPrimary, minWidth:140, opacity:(etapeModule===1&&!peutEtape2Mod)?0.5:1, cursor:(etapeModule===1&&!peutEtape2Mod)?"not-allowed":"pointer" }}>Suivant →</button>
                    : <button onClick={()=>{createNewModule();setEtapeModule(1);}} disabled={!peutCreer} style={{ ...btnPrimary, minWidth:160, opacity:peutCreer?1:0.5, cursor:peutCreer?"pointer":"not-allowed" }}>✅ Créer le module</button>
                  }
                </div>
              </div>
            </div>
          );
        })()}

        {/* ══ WIZARD UNIFIÉ : Cours → Module → Contenu ══ */}
        {showWizard&&(()=>{
          const fermerWizard = () => { setShowWizard(false); setWiz(WIZARD_INIT); setBlocs([]); setShowBlocForm(false); setWizardStep(1); };
          const TYPE_CONTENU_META = [
            { key:"lecon",    emoji:"📖", label:"Leçon",     color:"#2563eb" },
            { key:"audio",    emoji:"🎧", label:"Audio",     color:"#7c3aed" },
            { key:"video",    emoji:"🎬", label:"Vidéo",     color:"#dc2626" },
          ];
          const selectedType = TYPE_CONTENU_META.find(t=>t.key===wiz.mod_type)||TYPE_CONTENU_META[0];
          const ETAPES = ["Contenu","Récapitulatif"];
          const classesDispoWiz = groupes.filter(g => g.statut !== "archive");
          const nomsClassesWiz = wiz.groupe_ids.map(id => classesDispoWiz.find(g=>String(g.id)===String(id))?.nom).filter(Boolean);
          const canStep1 = wiz.mod_titre.trim().length>=2;
          return (
            <div style={{ position:"fixed", inset:0, zIndex:3000, background:"rgba(15,23,42,0.6)", display:"flex", alignItems:"center", justifyContent:"center", padding:"5vh 5vw" }}>
              <div style={{ width:"90vw", height:"90vh", borderRadius:18, overflow:"hidden", boxShadow:"0 24px 70px rgba(0,0,0,0.4)", background:"#fff", display:"flex", flexDirection:"column" }}>

                {/* ─ Header ─ */}
                <div style={{ background:`linear-gradient(135deg, #0f172a 0%, ${BET} 100%)`, padding:"20px 24px", flexShrink:0 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontSize:28 }}>🚀</span>
                      <div>
                        <div style={{ fontWeight:800, fontSize:17, color:"#fff" }}>Nouveau contenu</div>
                        <div style={{ fontSize:12, color:"rgba(255,255,255,0.7)" }}>Étape {wizardStep} sur {ETAPES.length} - {ETAPES[wizardStep-1]}</div>
                      </div>
                    </div>
                    <button onClick={fermerWizard} style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, width:34, height:34, color:"#fff", fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                  </div>
                  {/* Stepper */}
                  <div style={{ display:"flex", gap:0 }}>
                    {ETAPES.map((lbl,i)=>{
                      const n=i+1; const done=n<wizardStep; const active=n===wizardStep;
                      return (
                        <div key={n} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                          <div style={{ width:28, height:28, borderRadius:"50%", background:done?"#22c55e":active?"#fff":"rgba(255,255,255,0.25)", color:done?"#fff":active?BET:"rgba(255,255,255,0.6)", fontSize:12, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", transition:"all .2s" }}>{done?"✓":n}</div>
                          <span style={{ fontSize:9, color:active?"#fff":"rgba(255,255,255,0.5)", fontWeight:active?700:400, textAlign:"center" }}>{lbl}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ─ Body ─ */}
                <div style={{ padding:"22px 24px", overflowY:"auto", flex:1 }}>

                  {/* ── ÉTAPE 1 : Contenu ── */}
                  {wizardStep===1&&(
                    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                      {/* Type de module */}
                      <div>
                        <label style={labelSt}>Type de contenu *</label>
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                          {TYPE_CONTENU_META.map(t=>(
                            <button key={t.key} onClick={()=>{
                              setW("mod_type", t.key);
                              const permis = blocsAutorises(t.key);
                              if (!permis.includes(blocForm.type)) setBlocForm(f=>({ ...f, type: permis[0] }));
                            }} style={{ padding:"10px 8px", borderRadius:10, border:`2px solid ${wiz.mod_type===t.key?t.color:"#e5e7eb"}`, background:wiz.mod_type===t.key?t.color+"14":"#fafafa", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                              <span style={{ fontSize:22 }}>{t.emoji}</span>
                              <span style={{ fontSize:11, fontWeight:700, color:wiz.mod_type===t.key?t.color:"#374151" }}>{t.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Classes destinataires - le cœur du changement : un même contenu
                          part vers plusieurs classes, au lieu d'être dupliqué autant de fois. */}
                      <div>
                        <label style={labelSt}>Classes destinataires {wiz.groupe_ids.length > 0 && <span style={{ color:BET }}>({wiz.groupe_ids.length} sélectionnée{wiz.groupe_ids.length>1?"s":""})</span>}</label>
                        {classesDispoWiz.length === 0 ? (
                          <div style={{ fontSize:12.5, color:"#94a3b8", padding:"8px 0" }}>Aucune classe ne vous est assignée pour l'instant.</div>
                        ) : (
                          <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                            {classesDispoWiz.map(g => {
                              const choisi = wiz.groupe_ids.includes(g.id);
                              return (
                                <button key={g.id} onClick={()=>basculerClasseWiz(g.id)}
                                  style={{ padding:"7px 14px", borderRadius:99, fontSize:12.5, fontWeight:700, cursor:"pointer",
                                    border:`2px solid ${choisi?BET:"#e5e7eb"}`, background: choisi?BET+"14":"#fff", color: choisi?BET:"#374151" }}>
                                  {choisi ? "✓ " : ""}{g.nom}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div style={{ fontSize:11.5, color:"#9ca3af", marginTop:6 }}>
                          Une seule version du contenu : la corriger plus tard la corrigera pour toutes les classes.
                        </div>
                      </div>
                      {/* Titre + durée + objectifs */}
                      <div>
                        <label style={labelSt}>Titre du contenu *</label>
                        <input type="text" placeholder="ex: Compréhension orale avancée" value={wiz.mod_titre} onChange={e=>setW("mod_titre",e.target.value)} style={inputSt}/>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                        <div>
                          <label style={labelSt}>Durée estimée (min)</label>
                          <input type="number" min={10} max={600} value={wiz.mod_duree} onChange={e=>setW("mod_duree",Number(e.target.value))} style={inputSt}/>
                        </div>
                        <div>
                          <label style={labelSt}>Statut</label>
                          <select value={wiz.mod_statut} onChange={e=>setW("mod_statut",e.target.value)} style={inputSt}>
                            <option value="brouillon">📝 Brouillon</option>
                            <option value="publie">✅ Publié</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label style={labelSt}>Objectifs pédagogiques</label>
                        <textarea placeholder="Un objectif par ligne…" value={wiz.mod_objectifs} onChange={e=>setW("mod_objectifs",e.target.value)} style={{ ...inputSt, minHeight:70, resize:"vertical" }}/>
                      </div>

                      {/* ── Blocs de contenu ── */}
                      <div style={{ borderTop:"1px solid #e5e7eb", paddingTop:14 }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                          <label style={{ ...labelSt, marginBottom:0 }}>Blocs de contenu ({blocs.length})</label>
                          {!showBlocForm&&<button onClick={ouvrirNouveauBloc} style={{ ...btnPrimary, padding:"6px 14px", fontSize:12 }}>+ Ajouter un bloc</button>}
                        </div>

                        {/* Liste des blocs ajoutés */}
                        {blocs.length>0&&(
                          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:12 }}>
                            {blocs.map((b,i)=>{ const bt=BLOCK_TYPES[b.type]||BLOCK_TYPES.texte; return (
                              <div key={b.id} style={{ padding:"8px 12px", borderRadius:8, background:"#f8fafc", border:"1px solid #e5e7eb", display:"flex", alignItems:"center", gap:10 }}>
                                <span style={{ fontSize:20 }}>{bt.icon}</span>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:13, fontWeight:600, color:"#0f172a" }}>{b.titre}</div>
                                  <div style={{ fontSize:11, color:"#9ca3af" }}>{bt.label} · {b.dureeMin}min</div>
                                </div>
                                <button onClick={()=>editerBloc(b)} title="Modifier ce bloc" style={{ background:"none", border:"none", cursor:"pointer", fontSize:14 }}>✏️</button>
                                <button onClick={()=>moveBlocUp(i)} disabled={i===0} style={{ background:"none", border:"none", cursor:i===0?"default":"pointer", opacity:i===0?0.3:1, fontSize:14 }}>↑</button>
                                <button onClick={()=>moveBlocDown(i)} disabled={i>=blocs.length-1} style={{ background:"none", border:"none", cursor:i>=blocs.length-1?"default":"pointer", opacity:i>=blocs.length-1?0.3:1, fontSize:14 }}>↓</button>
                                <button onClick={()=>removeBloc(b.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"#dc2626", fontSize:16 }}>✕</button>
                              </div>
                            );})}
                          </div>
                        )}

                        {/* Formulaire ajout de bloc */}
                        {showBlocForm&&(
                          <div style={{ padding:16, borderRadius:12, background:"#f0f9ff", border:"1px solid #bae6fd" }}>
                            <div style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginBottom:12 }}>{blocEnEdition ? "Modifier le bloc" : "Nouveau bloc"}</div>
                          {blocEnEdition && (
                            <div style={{ marginBottom:10, padding:"8px 12px", borderRadius:8, background:"#fef3c7", border:"1px solid #fde68a", fontSize:11.5, color:"#92400e", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                              <span>✏️ Modification de « <strong>{blocs.find(x=>x.id===blocEnEdition)?.titre || "ce bloc"}</strong> »</span>
                              <button onClick={annulerEditionBloc} style={{ background:"none", border:"none", color:"#92400e", fontWeight:700, fontSize:11, cursor:"pointer", textDecoration:"underline", whiteSpace:"nowrap" }}>Annuler</button>
                            </div>
                          )}
                            <label style={labelSt}>Type de bloc</label>
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))", gap:6, marginBottom:12 }}>
                              {Object.entries(BLOCK_TYPES).filter(([k])=>blocsAutorises(wiz.mod_type).includes(k)).map(([k,v])=>(
                                <button key={k} onClick={()=>setBlocForm({...blocForm,type:k})} style={{ padding:"7px 6px", borderRadius:8, border:`1.5px solid ${blocForm.type===k?v.color:"#e5e7eb"}`, background:blocForm.type===k?v.color+"12":"#fff", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                                  <span style={{ fontSize:16 }}>{v.icon}</span>
                                  <span style={{ fontSize:9, fontWeight:blocForm.type===k?700:400, color:blocForm.type===k?v.color:"#374151" }}>{v.label}</span>
                                </button>
                              ))}
                            </div>
                            <label style={labelSt}>Titre du bloc *</label>
                            <input value={blocForm.titre} onChange={e=>setBlocForm({...blocForm,titre:e.target.value})} style={inputSt} placeholder="ex: Vidéo introduction"/>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                              <div><label style={labelSt}>Durée (min)</label><input type="number" value={blocForm.dureeMin} onChange={e=>setBlocForm({...blocForm,dureeMin:Number(e.target.value)})} style={inputSt} min={1}/></div>
                            </div>
                            {(blocForm.type==="texte"||blocForm.type==="exercice")&&(
                              <div>
                                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                                  <label style={labelSt}>Sections</label>
                                  <button onClick={()=>setBlocForm(f=>({ ...f, sections:[...f.sections,{id:Date.now(),niveau:"h2",titre:`§ Section`,contenu:""}] }))} style={{ ...btnPrimary, padding:"3px 9px", fontSize:11 }}>+ Section</button>
                                </div>
                                {blocForm.sections.map((sec,si)=>(
                                  <div key={sec.id} style={{ borderRadius:8, border:"1px solid #bae6fd", background:"#f0f9ff", padding:10, marginBottom:8 }}>
                                    <div style={{ display:"flex", gap:6, marginBottom:6, alignItems:"center" }}>
                                      <select value={sec.niveau} onChange={e=>{ const s=[...blocForm.sections]; s[si]={...s[si],niveau:e.target.value}; setBlocForm(f=>({...f,sections:s})); }} style={{ ...inputSt, width:80, marginBottom:0, fontSize:11 }}>
                                        <option value="h2">Section</option><option value="h3">Sous-section</option><option value="p">Paragraphe</option><option value="ul">Liste</option><option value="note">Note</option>
                                      </select>
                                      <input value={sec.titre} onChange={e=>{ const s=[...blocForm.sections]; s[si]={...s[si],titre:e.target.value}; setBlocForm(f=>({...f,sections:s})); }} style={{ ...inputSt, marginBottom:0, flex:1 }} placeholder="Titre de la section"/>
                                      <button onClick={()=>setBlocForm(f=>({...f,sections:f.sections.filter((_,ii)=>ii!==si)}))} style={{ padding:"3px 7px", borderRadius:6, border:"1px solid #fca5a5", background:"#fff1f2", color:"#dc2626", cursor:"pointer", fontSize:12 }}>✕</button>
                                    </div>
                                    <textarea value={sec.contenu} onChange={e=>{ const s=[...blocForm.sections]; s[si]={...s[si],contenu:e.target.value}; setBlocForm(f=>({...f,sections:s})); }} style={{ ...inputSt, marginBottom:0, minHeight:60, resize:"vertical" }} placeholder="Contenu…"/>
                                  </div>
                                ))}
                                {blocForm.sections.length===0&&<div style={{ padding:10, textAlign:"center", color:"#9ca3af", fontSize:12, border:"1px dashed #d1d5db", borderRadius:8 }}>Cliquez "+ Section" pour commencer</div>}
                              </div>
                            )}
                            {(blocForm.type==="video"||blocForm.type==="audio")&&(
                              <>
                                <label style={labelSt}>Fichier</label>
                                <CloudinaryUpload type={blocForm.type} compact
                                  label={blocForm.type==="video"?"Uploader une vidéo":"Uploader un audio"}
                                  onSuccess={(file)=>setBlocForm(f=>({ ...f, url:file.url, fichier:file.original_name, taille:file.size?`${(file.size/1024/1024).toFixed(1)} MB`:"" }))}
                                  onError={msg=>toast.error(msg)}/>
                                {blocForm.fichier&&<div style={{ fontSize:12, color:"#059669", marginTop:4 }}>✓ {blocForm.fichier}{blocForm.taille?` · ${blocForm.taille}`:""}</div>}
                                {/* L'URL reste offerte : beaucoup de coachs pointent vers une
                                    vidéo YouTube ou un podcast déjà en ligne, qu'il serait absurde
                                    de réimporter. */}
                                <label style={{ ...labelSt, marginTop:10 }}>…ou coller un lien</label>
                                <input type="url" value={blocForm.url} onChange={e=>setBlocForm({...blocForm,url:e.target.value,fichier:"",taille:""})} style={inputSt} placeholder="https://…"/>
                              </>
                            )}
                            {blocForm.type==="lien"&&(
                              <><label style={labelSt}>URL</label><input type="url" value={blocForm.url} onChange={e=>setBlocForm({...blocForm,url:e.target.value})} style={inputSt} placeholder="https://…"/></>
                            )}
                            {blocForm.type==="image"&&(
                              <>
                                <label style={labelSt}>Image</label>
                                <CloudinaryUpload type="image" label="Uploader une image" compact onSuccess={(file)=>setBlocForm(f=>({...f,fichier:file.original_name,taille:file.size?`${(file.size/1024/1024).toFixed(1)} MB`:"",url:file.url}))} onError={msg=>toast.error(msg)}/>
                                {blocForm.url && <img src={blocForm.url} alt="Aperçu" style={{ maxWidth:"100%", maxHeight:150, objectFit:"contain", borderRadius:8, marginTop:6, background:"#f1f5f9", display:"block" }} />}
                              </>
                            )}
                            {blocForm.type==="document"&&(
                              <>
                                <label style={labelSt}>Document</label>
                                <CloudinaryUpload type="document" label="Uploader un document" compact onSuccess={(file)=>setBlocForm(f=>({...f,fichier:file.original_name,taille:file.size?`${(file.size/1024/1024).toFixed(1)} MB`:"",url:file.url}))} onError={msg=>toast.error(msg)}/>
                                {blocForm.fichier&&<div style={{ fontSize:12,color:"#059669",marginTop:4 }}>✓ {blocForm.fichier}</div>}
                              </>
                            )}
                            {blocForm.type==="quiz"&&(
                              <div>
                                <label style={labelSt}>Questions ({blocForm.questions.length})</label>
                                {blocForm.questions.map((q,qi)=>(
                                  <div key={q.id} style={{ padding:"6px 10px", borderRadius:8, background:"#f0fdf4", border:"1px solid #bbf7d0", marginBottom:6, fontSize:12 }}>
                                    <div style={{ fontWeight:600 }}>Q{qi+1}. {q.texte}</div>
                                    <div style={{ color:"#9ca3af" }}>✓ {q.correct}</div>
                                  </div>
                                ))}
                                <div style={{ background:"#fff", borderRadius:8, padding:10, border:"1px solid #e5e7eb", marginBottom:8 }}>
                                  <input value={blocQuizQ.texte} onChange={e=>setBlocQuizQ({...blocQuizQ,texte:e.target.value})} style={{ ...inputSt, marginBottom:6 }} placeholder="Question…"/>
                                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:6 }}>
                                    {[0,1,2,3].map(ii=>(
                                      <input key={ii} value={blocQuizQ.options[ii]} onChange={e=>{ const o=[...blocQuizQ.options]; o[ii]=e.target.value; setBlocQuizQ({...blocQuizQ,options:o}); }} style={{ ...inputSt, marginBottom:0 }} placeholder={`Option ${ii+1} (facultatif)`}/>
                                    ))}
                                  </div>
                                  <select value={blocQuizQ.correct} onChange={e=>setBlocQuizQ({...blocQuizQ,correct:e.target.value})} style={{ ...inputSt, marginBottom:6 }}>
                                    <option value="">- Bonne réponse -</option>
                                    {blocQuizQ.options.filter(Boolean).map((o,ii)=><option key={ii} value={o}>{o}</option>)}
                                  </select>
                                  <button onClick={addQuizQuestion} style={{ ...btnPrimary, padding:"5px 10px", fontSize:11 }}>+ Ajouter</button>
                                </div>
                              </div>
                            )}
                            <div style={{ display:"flex", gap:8, marginTop:10 }}>
                              <button onClick={addBloc} style={btnPrimary}>{blocEnEdition ? "✓ Enregistrer les modifications" : "✓ Ajouter ce bloc"}</button>
                              <button onClick={annulerEditionBloc} style={btnSecondary}>Annuler</button>
                            </div>
                          </div>
                        )}

                        {blocs.length===0&&!showBlocForm&&(
                          <div style={{ padding:"14px", textAlign:"center", color:"#9ca3af", fontSize:12, border:"1px dashed #d1d5db", borderRadius:8 }}>
                            Aucun bloc ajouté - le contenu peut être ajouté plus tard.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── ÉTAPE 2 : Récapitulatif ── */}
                  {wizardStep===2&&(
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      {/* Destinataires - c'est la donnée que le coach doit relire avant de
                          publier : le contenu partira vers TOUTES ces classes d'un coup. */}
                      <div style={{ padding:"14px 18px", borderRadius:12, background:"#f8fafc", border:"2px solid #e2e8f0" }}>
                        <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700, letterSpacing:"0.06em", marginBottom:6 }}>
                          CLASSES DESTINATAIRES ({nomsClassesWiz.length})
                        </div>
                        {nomsClassesWiz.length === 0 ? (
                          <div style={{ fontSize:12.5, color:"#b45309", fontWeight:700 }}>
                            Aucune classe - le contenu sera enregistré en brouillon, non diffusé.
                          </div>
                        ) : (
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                            {nomsClassesWiz.map(n => (
                              <span key={n} style={{ fontSize:12, fontWeight:700, padding:"3px 11px", borderRadius:999, background:BET+"15", color:BET }}>{n}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Contenu */}
                      <div style={{ padding:"12px 16px", borderRadius:12, background:selectedType.color+"0d", border:`2px solid ${selectedType.color}40`, display:"flex", alignItems:"center", gap:12 }}>
                        <span style={{ fontSize:30 }}>{selectedType.emoji}</span>
                        <div>
                          <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700, letterSpacing:"0.06em" }}>CONTENU</div>
                          <div style={{ fontWeight:700, fontSize:15, color:selectedType.color }}>{wiz.mod_titre}</div>
                          <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>{selectedType.label} · {wiz.mod_duree}min · {wiz.mod_statut==="publie"?"✅ Publié":"📝 Brouillon"}</div>
                        </div>
                      </div>
                      {/* Blocs */}
                      {blocs.length>0&&(
                        <div style={{ padding:"10px 14px", borderRadius:8, background:"#f8fafc", border:"1px solid #e5e7eb" }}>
                          <div style={{ fontSize:11, color:"#9ca3af", fontWeight:700, marginBottom:6 }}>CONTENU ({blocs.length} bloc{blocs.length>1?"s":""})</div>
                          {blocs.map((b,i)=>{ const bt=BLOCK_TYPES[b.type]||BLOCK_TYPES.texte; return (
                            <div key={b.id} style={{ fontSize:12, color:"#374151", display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                              <span>{bt.icon}</span> {b.titre} <span style={{ color:"#9ca3af" }}>({b.dureeMin}min)</span>
                            </div>
                          );})}
                        </div>
                      )}
                      {/* Objectifs */}
                      {wiz.mod_objectifs&&(
                        <div style={{ padding:"10px 14px", borderRadius:8, background:"#f8fafc", border:"1px solid #e5e7eb" }}>
                          <div style={{ fontSize:11, color:"#9ca3af", fontWeight:700, marginBottom:4 }}>OBJECTIFS</div>
                          <div style={{ fontSize:12, color:"#374151", lineHeight:1.7 }}>{wiz.mod_objectifs}</div>
                        </div>
                      )}
                      <div style={{ padding:"10px 14px", borderRadius:8, background:"#f0fdf4", border:"1px solid #bbf7d0", fontSize:12, color:"#166534" }}>
                        ✅ Après création vous serez redirigé vers votre <strong>Médiathèque</strong>.
                      </div>
                    </div>
                  )}

                </div>

                {/* ─ Footer ─ */}
                <div style={{ padding:"14px 24px", borderTop:"1px solid #f1f5f9", display:"flex", justifyContent:"space-between", gap:10, background:"#fafafa", flexShrink:0 }}>
                  <button onClick={()=>{ if(wizardStep>1) setWizardStep(s=>s-1); else fermerWizard(); }} style={{ ...btnSecondary, minWidth:110 }}>{wizardStep>1?"← Retour":"Annuler"}</button>
                  {wizardStep < ETAPES.length
                    ? <button
                        onClick={()=>{ if(wizardStep===1&&showBlocForm){ toast.error("Finalisez ou annulez le bloc en cours"); return; } setWizardStep(s=>s+1); }}
                        disabled={wizardStep===1&&!canStep1}
                        style={{ ...btnPrimary, minWidth:140, opacity:(wizardStep===1&&!canStep1)?0.5:1, cursor:(wizardStep===1&&!canStep1)?"not-allowed":"pointer" }}>
                        Suivant →
                      </button>
                    : (() => {
                        // Un bouton inactif SANS raison affichée est une impasse : on dit ce
                        // qui manque plutôt que de laisser chercher.
                        const sansClasse = !wiz.groupe_ids.length;
                        return (
                          <button onClick={createWizard} disabled={wizardCreating || sansClasse}
                            title={sansClasse ? "Cochez au moins une classe destinataire" : undefined}
                            style={{ ...btnPrimary, minWidth:170, opacity:(wizardCreating||sansClasse)?0.5:1,
                              cursor:(wizardCreating||sansClasse)?"not-allowed":"pointer" }}>
                            {wizardCreating ? "⏳ Création…" : sansClasse ? "Choisissez une classe ↑" : "🚀 Créer le contenu"}
                          </button>
                        );
                      })()
                  }
                </div>

              </div>
            </div>
          );
        })()}

        {/* ══ MODAL SIGNALER PROBLÈME ══ */}
        {showSignalModal&&(
          <Modal title="⚠️ Signaler un problème au responsable" onClose={()=>setShowSignalModal(false)}>
            <label style={labelSt}>Type de problème</label>
            <select value={signalForm.type} onChange={e=>setSignalForm(f=>({...f,type:e.target.value}))} style={inputSt}>
              <option value="probleme_technique">🔧 Problème technique</option>
              <option value="absence_etudiant">👤 Absence / comportement étudiant</option>
              <option value="planning">📅 Problème de planning</option>
              <option value="materiel">🖥️ Matériel / salle</option>
              <option value="autre">📌 Autre</option>
            </select>
            <label style={labelSt}>Sujet *</label>
            <input type="text" placeholder="Résumé court du problème…" value={signalForm.sujet} onChange={e=>setSignalForm(f=>({...f,sujet:e.target.value}))} style={inputSt}/>
            <label style={labelSt}>Description *</label>
            <textarea placeholder="Décrivez le problème en détail…" value={signalForm.description} onChange={e=>setSignalForm(f=>({...f,description:e.target.value}))} style={{ ...inputSt, minHeight:100, resize:"vertical" }}/>
            <label style={labelSt}>Urgence</label>
            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              {[["normale","🟢 Normale"],["haute","🟡 Haute"],["critique","🔴 Critique"]].map(([val,lbl])=>(
                <button key={val} onClick={()=>setSignalForm(f=>({...f,urgence:val}))} style={{
                  padding:"7px 14px", borderRadius:6, border:"1px solid", fontSize:12, cursor:"pointer", fontWeight:600,
                  background: signalForm.urgence===val?(val==="critique"?"#fee2e2":val==="haute"?"#fef3c7":"#dcfce7"):"#fff",
                  color: signalForm.urgence===val?(val==="critique"?"#991b1b":val==="haute"?"#92400e":"#166534"):"#6b7280",
                  borderColor: signalForm.urgence===val?(val==="critique"?"#fca5a5":val==="haute"?"#fcd34d":"#bbf7d0"):"#e5e7eb",
                }}>{lbl}</button>
              ))}
            </div>
            <div style={{ display:"flex", gap:10, marginTop:14 }}>
              <button onClick={()=>sendSignal()} style={{ ...btnPrimary, background:"#f97316" }}>📤 Envoyer au responsable</button>
              <button onClick={()=>setShowSignalModal(false)} style={btnSecondary}>Annuler</button>
            </div>
          </Modal>
        )}

        {/* ══ MODAL LECTEUR (audio ou vidéo) ══════════════════════════════════════
            Ce modal était une MAQUETTE : aucune balise `<audio>` ni `<video>`, une barre
            de progression figée à 30 %, un temps « 7:12 » écrit en dur et trois boutons
            qui se contentaient d'afficher un message. Le coach ne pouvait donc jamais
            réécouter ni revoir ce qu'il avait déposé. ══ */}
        {showAudioModal&&selectedAudio&&(() => {
          const url   = selectedAudio.url;
          const embed = urlEmbedVideo(url);
          // Le type réel du média, pour ne plus titrer « 🎧 » une vidéo.
          const estVideo = selectedAudio.type === "video" || (!!url && estFichierVideo(url));
          const ico = estVideo ? "🎬" : "🎧";
          return (
            <div onClick={e=>{ if(e.target===e.currentTarget) setShowAudioModal(false); }}
              style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.6)",zIndex:10050,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}>
              <div style={{ background:"#fff",borderRadius:16,width:"90vw",height:"90vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 24px 60px rgba(0,0,0,.28)" }}>
                <div style={{ padding:"16px 22px",borderBottom:"1px solid #e5e7eb",display:"flex",alignItems:"center",gap:10,flexShrink:0 }}>
                  <span style={{ fontSize:20 }}>{ico}</span>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:15,fontWeight:800,color:"#0f172a" }}>{selectedAudio.titre || (estVideo?"Vidéo":"Audio")}</div>
                    {selectedAudio.dureeMin && <div style={{ fontSize:11.5,color:"#94a3b8" }}>⏱ {selectedAudio.dureeMin} min</div>}
                  </div>
                  <button onClick={()=>setShowAudioModal(false)}
                    style={{ width:32,height:32,borderRadius:"50%",border:"1px solid #e5e7eb",background:"#fff",cursor:"pointer",fontSize:16,color:"#64748b",lineHeight:1,flexShrink:0 }}>✕</button>
                </div>

                <div style={{ flex:1,overflowY:"auto",padding:"18px 22px" }}>
                  {!url ? (
                    <div style={{ background:"#fffbeb",border:"1px dashed #fcd34d",borderRadius:10,padding:"14px 16px",fontSize:13,color:"#92400e" }}>
                      Aucun fichier n'est rattaché à ce contenu.
                    </div>
                  ) : embed ? (
                    <div style={{ position:"relative",width:"100%",paddingTop:"56.25%",borderRadius:10,overflow:"hidden",background:"#0f172a" }}>
                      <iframe src={embed} title={selectedAudio.titre||"Média"} allowFullScreen
                        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                        style={{ position:"absolute",inset:0,width:"100%",height:"100%",border:"none" }} />
                    </div>
                  ) : estFichierVideo(url) ? (
                    <video src={url} controls preload="metadata" style={{ width:"100%",maxHeight:"62vh",borderRadius:10,background:"#000",display:"block" }} />
                  ) : estFichierAudio(url) ? (
                    <div style={{ background:"linear-gradient(135deg,#059669,#34d399)",borderRadius:12,padding:"28px 24px",textAlign:"center",color:"#fff" }}>
                      <div style={{ fontSize:52,marginBottom:10 }}>🎧</div>
                      <div style={{ fontSize:15,fontWeight:700,marginBottom:16 }}>{selectedAudio.titre}</div>
                      <audio src={url} controls preload="metadata" style={{ width:"100%",maxWidth:560 }} />
                    </div>
                  ) : (
                    <div style={{ background:"#fffbeb",border:"1px dashed #fcd34d",borderRadius:10,padding:"14px 16px",fontSize:13,color:"#92400e" }}>
                      <div style={{ fontWeight:700,marginBottom:4 }}>
                        {estChaineYoutube(url) ? "Ce lien mène à une chaîne YouTube, pas à une vidéo" : "Ce média ne peut pas être lu ici"}
                      </div>
                      <a href={url} target="_blank" rel="noreferrer" style={{ color:"#b45309",fontWeight:700,wordBreak:"break-all" }}>{url} ↗</a>
                    </div>
                  )}

                  {url && (
                    <div style={{ padding:"8px 12px",borderRadius:6,background:"#f8fafc",border:"1px solid #e5e7eb",fontSize:11.5,color:"#64748b",marginTop:14,wordBreak:"break-all" }}>
                      🔗 Fichier : <a href={url} target="_blank" rel="noreferrer" style={{ color:"#059669",fontFamily:"monospace" }}>{url}</a>
                    </div>
                  )}
                </div>

                <div style={{ padding:"12px 22px",borderTop:"1px solid #e5e7eb",background:"#fafafa",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",flexShrink:0 }}>
                  <span style={{ fontSize:11.5,color:"#94a3b8" }}>Partagez ce contenu avec vos étudiants depuis l'onglet Modules &amp; Contenu.</span>
                  <button onClick={()=>setShowAudioModal(false)} style={btnSecondary}>Fermer</button>
                </div>
              </div>
            </div>
          );
        })()}


        {/* ══ MODAL DÉTAIL MODULE ══ */}
        {showModuleDetail && moduleDetailData && (() => {
          const { mod, content, cours: c } = moduleDetailData;
          const sm = STATUT_MODULE[content?.statut||mod.statut||"brouillon"];
          const blocs = content?.blocs || [];
          const objectifs = content?.objectifs || mod.objectifs || [];
          return (
            <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}
              onClick={()=>setShowModuleDetail(false)}>
              <div style={{ background:"#fff",borderRadius:18,width:"90vw",height:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 60px rgba(0,0,0,0.3)",overflow:"hidden" }}
                onClick={e=>e.stopPropagation()}>
                {/* Header */}
                <div style={{ background:`linear-gradient(135deg,#0f172a,${c?.color||BET})`,padding:"20px 24px",display:"flex",alignItems:"center",gap:14 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10,color:"rgba(255,255,255,0.55)",fontWeight:700,letterSpacing:"0.07em",marginBottom:3 }}>{c?.emoji} {c?.titre} · MODULE</div>
                    <div style={{ fontSize:19,fontWeight:900,color:"#fff" }}>{content?.titre||mod.nom}</div>
                    <div style={{ display:"flex",gap:8,marginTop:6,flexWrap:"wrap",alignItems:"center" }}>
                      <span style={{ padding:"2px 9px",borderRadius:8,fontSize:11,fontWeight:700,background:"rgba(255,255,255,0.15)",color:"#fff" }}>⏱ {content?.dureeEstimee||"-"} min</span>
                      <span style={{ padding:"2px 9px",borderRadius:8,fontSize:11,fontWeight:700,background:sm.bg,color:sm.c }}>{sm.label}</span>
                      <span style={{ padding:"2px 9px",borderRadius:8,fontSize:11,fontWeight:700,background:"rgba(255,255,255,0.15)",color:"#fff" }}>📦 {blocs.length} bloc{blocs.length!==1?"s":""}</span>
                    </div>
                  </div>
                  <button onClick={()=>setShowModuleDetail(false)} style={{ background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,color:"#fff",fontSize:18,cursor:"pointer",width:36,height:36,flexShrink:0 }}>✕</button>
                </div>
                {/* Body scrollable */}
                <div style={{ overflowY:"auto",flex:1,padding:"20px 24px",display:"flex",flexDirection:"column",gap:16 }}>
                  {/* Méta : groupe, semaine, type */}
                  {(mod.groupe_id || mod.semaine || mod.type_contenu) && (() => {
                    const groupeNom = mod.groupe_id ? (groupes.find(g=>g.id===mod.groupe_id)?.nom || mod.groupe_id) : null;
                    return (
                      <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                        {groupeNom && <span style={{ padding:"4px 12px",borderRadius:20,fontSize:12,fontWeight:700,background:"#dbeafe",color:"#1e40af" }}>🏫 {groupeNom}</span>}
                        {mod.semaine && <span style={{ padding:"4px 12px",borderRadius:20,fontSize:12,fontWeight:700,background:"#f3f4f6",color:"#374151" }}>📅 {mod.semaine}</span>}
                        {mod.type_contenu && mod.type_contenu !== "lecon" && <span style={{ padding:"4px 12px",borderRadius:20,fontSize:12,fontWeight:700,background:"#fef3c7",color:"#92400e" }}>📦 {mod.type_contenu}</span>}
                      </div>
                    );
                  })()}
                  {/* Objectifs */}
                  {objectifs.length > 0 && (
                    <div>
                      <div style={{ fontWeight:700,fontSize:13,color:"#374151",marginBottom:8 }}>🎯 Objectifs pédagogiques</div>
                      <ul style={{ margin:0,padding:"0 0 0 18px",display:"flex",flexDirection:"column",gap:4 }}>
                        {objectifs.map((o,i)=><li key={i} style={{ fontSize:13,color:"#475569" }}>{o}</li>)}
                      </ul>
                    </div>
                  )}
                  {/* Suivi de lecture */}
                  <div>
                    <div style={{ fontWeight:700,fontSize:13,color:"#374151",marginBottom:8 }}>✅ Suivi de lecture</div>
                    {moduleLecteursLoading ? (
                      <div style={{ fontSize:12,color:"#9ca3af",padding:"8px 0" }}>⏳ Chargement…</div>
                    ) : moduleLecteurs.length === 0 ? (
                      <div style={{ fontSize:12,color:"#9ca3af",background:"#f8fafc",borderRadius:10,padding:"12px 14px" }}>
                        Aucun apprenant n'a encore marqué ce module comme terminé.
                      </div>
                    ) : (
                      <div style={{ background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:10,padding:"10px 14px" }}>
                        <div style={{ fontSize:12,fontWeight:700,color:"#166534",marginBottom:8 }}>
                          {moduleLecteurs.length} apprenant{moduleLecteurs.length>1?"s ont":" a"} terminé ce module
                        </div>
                        <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                          {moduleLecteurs.map(l=>(
                            <div key={l.apprenant_id} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12 }}>
                              <span style={{ color:"#166534",fontWeight:600 }}>{l.prenom} {l.nom}</span>
                              <span style={{ color:"#65a37e" }}>{l.lu_le ? new Date(l.lu_le).toLocaleDateString("fr-FR",{ day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit" }) : ""}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Blocs */}
                  {blocs.length === 0
                    ? <div style={{ textAlign:"center",padding:"30px 20px",color:"#9ca3af",background:"#f8fafc",borderRadius:10 }}>Aucun contenu dans ce module.</div>
                    : (
                      <div>
                        <div style={{ fontWeight:700,fontSize:13,color:"#374151",marginBottom:10 }}>📦 Contenu du module</div>
                        <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                          {blocs.map((b,i)=>{
                            const bt = BLOCK_TYPES[b.type]||BLOCK_TYPES.texte;
                            return (
                              <div key={b.id||i} style={{ borderRadius:10,border:`1.5px solid ${bt.color}22`,background:"#fff",overflow:"hidden" }}>
                                {/* Bloc header */}
                                <div style={{ padding:"10px 14px",background:`${bt.color}08`,borderBottom:`1px solid ${bt.color}18`,display:"flex",alignItems:"center",gap:8 }}>
                                  <span style={{ fontSize:16 }}>{bt.icon}</span>
                                  <span style={{ fontWeight:700,fontSize:13,color:bt.color }}>{b.titre}</span>
                                  <span style={{ marginLeft:"auto",fontSize:11,color:"#9ca3af" }}>⏱ {b.dureeMin}min</span>
                                </div>
                                {/* Bloc body */}
                                <div style={{ padding:"10px 14px" }}>
                                  {(b.type==="texte"||b.type==="exercice") && b.contenu && (
                                    <p style={{ margin:0,fontSize:13,color:"#374151",lineHeight:1.6,whiteSpace:"pre-wrap" }}>{b.contenu}</p>
                                  )}
                                  {b.type==="video" && b.url && (
                                    <div style={{ background:"#f1f5f9",borderRadius:8,padding:"10px 14px",display:"flex",alignItems:"center",gap:8 }}>
                                      <span style={{ fontSize:20 }}>🎬</span>
                                      <a href={b.url} target="_blank" rel="noreferrer" style={{ color:bt.color,fontWeight:600,fontSize:13,wordBreak:"break-all" }}>{b.url}</a>
                                    </div>
                                  )}
                                  {b.type==="audio" && b.url && (
                                    <audio controls src={b.url} style={{ width:"100%",marginTop:4 }} />
                                  )}
                                  {b.type==="lien" && b.url && (
                                    <a href={b.url} target="_blank" rel="noreferrer" style={{ color:bt.color,fontWeight:600,fontSize:13,wordBreak:"break-all" }}>{b.url}</a>
                                  )}
                                  {b.type==="quiz" && b.questions?.length > 0 && (
                                    <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                                      {b.questions.map((q,qi)=>(
                                        <div key={qi} style={{ background:"#f8fafc",borderRadius:8,padding:"8px 12px" }}>
                                          <div style={{ fontWeight:600,fontSize:12,color:"#374151",marginBottom:4 }}>Q{qi+1}. {q.texte}</div>
                                          <div style={{ display:"flex",flexWrap:"wrap",gap:4 }}>
                                            {(q.options||[]).map((opt,oi)=>(
                                              <span key={oi} style={{ padding:"2px 8px",borderRadius:6,fontSize:11,background:opt===q.correct?"#dcfce7":"#f1f5f9",color:opt===q.correct?"#166534":"#374151",fontWeight:opt===q.correct?700:400,border:opt===q.correct?"1px solid #bbf7d0":"1px solid #e5e7eb" }}>
                                                {opt===q.correct?"✓ ":""}{opt}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {b.type==="document" && b.fichier && (
                                    <div style={{ background:"#fef2f2",borderRadius:8,padding:"8px 12px",display:"flex",alignItems:"center",gap:8 }}>
                                      <span>📄</span>
                                      <span style={{ fontSize:13,color:"#dc2626",fontWeight:600 }}>{b.fichier}</span>
                                      {b.taille && <span style={{ fontSize:11,color:"#9ca3af" }}>· {b.taille}</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )
                  }
                </div>
                {/* Footer */}
                <div style={{ padding:"12px 24px",borderTop:"1px solid #e5e7eb",display:"flex",gap:8,justifyContent:"flex-end" }}>
                  <button onClick={()=>{ setShowModuleDetail(false); openModuleBuilder(c?.id||mod.coursId, mod.id, mod); }} style={btnSecondary}>✏️ Modifier le contenu</button>
                  <button onClick={()=>setShowModuleDetail(false)} style={btnPrimary}>Fermer</button>
                </div>
              </div>
            </div>
          );
        })()}


        {/* ══ MODAL DÉTAIL APPRENANT (groupe) ══ */}
      {apprenantDetail && (() => {
        const a = apprenantDetail;
        const nomComplet = [a.prenom_apprenant, a.nom_apprenant].filter(Boolean).join(" ");
        const initiales  = [a.prenom_apprenant||"", a.nom_apprenant||""].map(s=>s[0]||"").join("").toUpperCase() || "?";
        const NIVEAU_COLOR = { A1:"#6b7280",A2:"#0891b2",B1:"#16a34a",B2:"#7c3aed",C1:"#d97706",C2:"#dc2626" };
        const nColor = NIVEAU_COLOR[a.niveau] || BET;
        let noteObj = null;
        try { noteObj = a.note ? JSON.parse(a.note) : null; } catch { noteObj = null; }
        const NIVEAUX_LBL = { A1:"Débutant",A2:"Élémentaire",B1:"Intermédiaire",B2:"Interm. Sup.",C1:"Avancé",C2:"Maîtrise" };

        // Présences filtrées pour cet apprenant
        const presApp = fichePres.length > 0 ? fichePres : presenceHistory.filter(p => p.ga_id === a.id || (p.nom_apprenant===a.nom_apprenant && p.prenom_apprenant===a.prenom_apprenant));
        const nbPresent = presApp.filter(p=>p.statut==="present").length;
        const tauxPres  = presApp.length ? Math.round(nbPresent/presApp.length*100) : null;

        return (
          <div style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.65)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:12 }}
            onClick={()=>setApprenantDetail(null)}>
            <div style={{ background:"#fff",borderRadius:18,width:"90vw",height:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 60px rgba(0,0,0,0.3)",overflow:"hidden" }}
              onClick={e=>e.stopPropagation()}>

              {/* ── Header ── */}
              <div style={{ background: a.acces_bloque ? "linear-gradient(135deg,#7f1d1d,#dc2626)" : BET_GRAD, padding:"20px 24px",flexShrink:0,display:"flex",gap:14,alignItems:"center" }}>
                <div style={{ width:54,height:54,borderRadius:"50%",background:"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:20,color:"#fff",flexShrink:0,border:`3px solid ${a.acces_bloque?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.3)"}`,overflow:"hidden" }}>
                  {ficheAcces?.profil?.avatar_url
                    ? <img src={ficheAcces.profil.avatar_url} alt={initiales} style={{ width:"100%",height:"100%",objectFit:"cover" }} />
                    : a.acces_bloque ? "🔒" : initiales}
                </div>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:10,color:"rgba(255,255,255,0.6)",fontWeight:600,marginBottom:2,letterSpacing:"0.07em" }}>FICHE APPRENANT - {selectedGroupe?.nom || a.groupe_nom || "-"}</div>
                  <div style={{ fontSize:18,fontWeight:900,color:"#fff" }}>{nomComplet}</div>
                  <div style={{ display:"flex",gap:6,marginTop:5,flexWrap:"wrap" }}>
                    {a.niveau && <span style={{ padding:"2px 10px",borderRadius:99,fontSize:11,fontWeight:800,color:"#fff",background:nColor }}>{a.niveau} - {NIVEAUX_LBL[a.niveau]||a.niveau}</span>}
                    {noteObj?.programme && <span style={{ padding:"2px 10px",borderRadius:99,fontSize:11,fontWeight:600,background:"rgba(255,255,255,0.18)",color:"#fff" }}>{noteObj.programme}</span>}
                    {a.acces_bloque
                      ? <span style={{ padding:"2px 10px",borderRadius:99,fontSize:11,fontWeight:700,background:"rgba(0,0,0,0.3)",color:"#fca5a5" }}>🔒 Accès bloqué</span>
                      : <span style={{ padding:"2px 10px",borderRadius:99,fontSize:11,fontWeight:700,background:"rgba(34,197,94,0.3)",color:"#fff" }}>● Actif</span>}
                  </div>
                </div>
                {/* DEMANDER LE TRANSFERT. Dans l'en-tete, donc visible depuis tous les onglets
                    de la fiche : le coach constate le probleme en lisant les presences ou les
                    notes, pas depuis un onglet dedie. Il n'execute pas le changement - il ouvre
                    un dossier que le placement test puis l'onboarding font avancer. */}
                {a.id && (
                  <BoutonDemandeTransfert
                    gaId={a.id}
                    nomApprenant={nomComplet}
                    accent={BET}
                    authHdrs={() => ({ "Content-Type":"application/json", Authorization:`Bearer ${localStorage.getItem("coach_token")||localStorage.getItem("admin_token")}` })}
                  />
                )}
                <button onClick={()=>setApprenantDetail(null)} style={{ background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>✕</button>
              </div>

              {/* ── Onglets ── */}
              {/* ── Onglets ── */}
              {(() => {
                const noteObj2 = (() => { try { return a.note ? (typeof a.note==="string"?JSON.parse(a.note):a.note) : {}; } catch { return {}; } })();
                const isEnfant = noteObj2?.is_enfant || (a.niveau && ["A1","A2"].includes(a.niveau)) || noteObj2?.age_apprenant < 18 || Array.isArray(noteObj2?.parents) && noteObj2.parents.length > 0;
                const tabs = [
                  { k:"profil",      l:"Profil",       icon:"👤" },
                  { k:"test",        l:"Test",          icon:"📊" },
                  { k:"presences",   l:`Présences${tauxPres!==null?` (${tauxPres}%)`:""} `, icon:"✅" },
                  { k:"devoirs",     l:`Devoirs et notes${ficheDevoirsDB.length?` (${ficheDevoirsDB.length})`:""}`, icon:"📚" },
                  { k:"parcours",    l:"Parcours",     icon:"🕓" },
                  ...(isEnfant ? [{ k:"parents", l:"Parents", icon:"👨‍👩‍👧" }] : []),
                ];
                return (
                  <div style={{ display:"flex",background:"#fafafa",borderBottom:"1px solid #e5e7eb",flexShrink:0,overflowX:"auto" }}>
                    {tabs.map(t=>(
                      <button key={t.k} onClick={()=>{
                        setFicheFicheTab(t.k);
                        setFicheNotePatch(null);
                        if (t.k==="presences" && fichePres.length===0 && selectedGroupe) {
                          setFichePresLoading(true);
                          const tok = localStorage.getItem("coach_token")||localStorage.getItem("admin_token");
                          fetch(`${API_URL}/api/groupes/${selectedGroupe.id}/presences`,{headers:{Authorization:`Bearer ${tok}`}})
                            .then(r=>r.ok?r.json():null)
                            .then(d=>setFichePres((d?.presences||[]).filter(p=>p.ga_id===a.id||(p.nom_apprenant===a.nom_apprenant&&p.prenom_apprenant===a.prenom_apprenant))))
                            .catch(()=>{}).finally(()=>setFichePresLoading(false));
                        }
                      }}
                        style={{ padding:"10px 14px",border:"none",borderBottom:ficheFicheTab===t.k?`3px solid ${BET}`:"3px solid transparent",fontSize:11,fontWeight:600,cursor:"pointer",background:"transparent",color:ficheFicheTab===t.k?BET:"#64748b",whiteSpace:"nowrap",flexShrink:0 }}>
                        {t.icon} {t.l}
                      </button>
                    ))}
                  </div>
                );
              })()}

              {/* ── Corps scrollable ── */}
              <div style={{ flex:1,overflowY:"auto",padding:"20px 24px" }}>

                {/* ═══ PROFIL ═══ */}
                {ficheFicheTab==="profil" && (
                  <div>
                    {/* Coordonnées */}
                    <div style={{ marginBottom:18 }}>
                      <div style={{ fontSize:11,fontWeight:800,color:"#9ca3af",letterSpacing:"0.08em",marginBottom:10 }}>COORDONNÉES</div>
                      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                        {[
                          { icon:"📧", label:"Email",     value:a.email_apprenant||"-" },
                          { icon:"📞", label:"Téléphone", value:a.telephone||"-" },
                        ].map(r=>(
                          <div key={r.label} style={{ padding:"10px 12px",borderRadius:10,background:"#f8fafc",border:"1px solid #e5e7eb",display:"flex",gap:10,alignItems:"flex-start" }}>
                            <span style={{ fontSize:18,flexShrink:0 }}>{r.icon}</span>
                            <div>
                              <div style={{ fontSize:9,color:"#9ca3af",fontWeight:600 }}>{r.label}</div>
                              <div style={{ fontSize:12,fontWeight:700,color:"#0f172a",wordBreak:"break-all" }}>{r.value}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* L'OBJECTIF DU CLIENT, en tête de la formation et non noyé dans la
                        grille : c'est la raison pour laquelle ce coach-là a été choisi, et
                        ce que l'apprenant attend de ses séances. Le coach ne l'avait
                        jusqu'ici nulle part - il fallait le demander à l'assistante. */}
                    {a.objectif_client && (
                      <div style={{ marginBottom:18, background:"#f5f3ff", border:"1.5px solid #ddd6fe",
                        borderRadius:12, padding:"13px 16px" }}>
                        <div style={{ fontSize:10.5, fontWeight:800, color:"#6d28d9", letterSpacing:".06em", marginBottom:5 }}>
                          🎯 CE QUE L'APPRENANT ATTEND
                        </div>
                        <div style={{ fontSize:13.5, lineHeight:1.65, color:"#0f172a", whiteSpace:"pre-wrap" }}>
                          {a.objectif_client}
                        </div>
                      </div>
                    )}

                    {/* Formation */}
                    <div style={{ marginBottom:18 }}>
                      <div style={{ fontSize:11,fontWeight:800,color:"#9ca3af",letterSpacing:"0.08em",marginBottom:10 }}>FORMATION</div>
                      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                        {[
                          { icon:"📊", label:"Niveau",     value:a.niveau?(a.niveau+" - "+(NIVEAUX_LBL[a.niveau]||"")):"-" },
                          { icon:"📚", label:"Programme",  value:noteObj?.programme||selectedGroupe?.filiere||"-" },
                          { icon:"👥", label:"Groupe",     value:selectedGroupe?.nom||a.groupe_nom||"-" },
                          { icon:"📅", label:"Date début", value:noteObj?.date_debut?new Date(noteObj.date_debut).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}):selectedGroupe?.date_debut?new Date(selectedGroupe.date_debut).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}):"-" },
                          { icon:"🔄", label:"Renouvellement prévu", value:noteObj?.date_renouvellement?new Date(noteObj.date_renouvellement).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}):"-" },
                          { icon:"👩‍💼", label:"Assistante Onboarding", value:a.assistante_nom||"-" },
                        ].map(r=>(
                          <div key={r.label} style={{ padding:"9px 12px",borderRadius:10,background:"#f8fafc",border:"1px solid #e5e7eb",display:"flex",gap:10,alignItems:"flex-start" }}>
                            <span style={{ fontSize:16,flexShrink:0 }}>{r.icon}</span>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize:9,color:"#9ca3af",fontWeight:600 }}>{r.label}</div>
                              <div style={{ fontSize:12,fontWeight:700,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{r.value}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Description */}
                    {noteObj?.description && (
                      <div style={{ marginBottom:14 }}>
                        <div style={{ fontSize:11,fontWeight:800,color:"#9ca3af",letterSpacing:"0.08em",marginBottom:8 }}>PROFIL DE L'APPRENANT</div>
                        <div style={{ padding:"12px 14px",borderRadius:10,background:"#f0f9ff",border:"1px solid #bae6fd",fontSize:13,color:"#374151",lineHeight:1.7 }}>{noteObj.description}</div>
                      </div>
                    )}

                    {/* Attentes */}
                    {noteObj?.attentes && (
                      <div style={{ marginBottom:14 }}>
                        <div style={{ fontSize:11,fontWeight:800,color:"#9ca3af",letterSpacing:"0.08em",marginBottom:8 }}>ATTENTES / OBJECTIFS</div>
                        <div style={{ padding:"12px 14px",borderRadius:10,background:"#fef9ee",border:"1px solid #fde68a",fontSize:13,color:"#374151",lineHeight:1.7 }}>🎯 {noteObj.attentes}</div>
                      </div>
                    )}

                    {/* Note libre */}
                    {a.note && !noteObj && (
                      <div style={{ marginBottom:14 }}>
                        <div style={{ fontSize:11,fontWeight:800,color:"#9ca3af",letterSpacing:"0.08em",marginBottom:8 }}>NOTES</div>
                        <div style={{ padding:"12px 14px",borderRadius:10,background:"#f8fafc",border:"1px solid #e5e7eb",fontSize:13,color:"#374151",lineHeight:1.7 }}>{a.note}</div>
                      </div>
                    )}

                    {/* Assistante commerciale */}
                    <div style={{ marginBottom:18 }}>
                      <div style={{ fontSize:11,fontWeight:800,color:"#9ca3af",letterSpacing:"0.08em",marginBottom:10 }}>SUIVI COMMERCIAL</div>
                      {a.assistante_commerciale ? (() => {
                        const ac = a.assistante_commerciale;
                        return (
                          <div style={{ display:"flex",alignItems:"center",gap:14,padding:"14px 16px",borderRadius:12,background:"linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%)",border:"1.5px solid #86efac" }}>
                            <div style={{ width:48,height:48,borderRadius:"50%",background:"#16a34a",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:18,color:"#fff",flexShrink:0,overflow:"hidden" }}>
                              {ac.photo_url
                                ? <img src={ac.photo_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} onError={e=>{e.currentTarget.style.display="none";}} />
                                : ((ac.prenom||"?")[0]+(ac.nom||"")[0]||"?").toUpperCase()
                              }
                            </div>
                            <div style={{ flex:1,minWidth:0 }}>
                              <div style={{ fontSize:9,fontWeight:700,color:"#16a34a",letterSpacing:"0.06em",marginBottom:2 }}>ASSISTANTE COMMERCIALE</div>
                              <div style={{ fontSize:14,fontWeight:800,color:"#0f172a" }}>{ac.prenom} {ac.nom}</div>
                              {ac.telephone && (
                                <div style={{ fontSize:12,color:"#374151",marginTop:2,display:"flex",alignItems:"center",gap:4 }}>
                                  <span>📞</span>
                                  <a href={`tel:${ac.telephone}`} style={{ color:"#0891b2",fontWeight:600,textDecoration:"none" }}>{ac.telephone}</a>
                                </div>
                              )}
                            </div>
                            <div style={{ flexShrink:0,fontSize:22 }}>🤝</div>
                          </div>
                        );
                      })() : (
                        <div style={{ padding:"12px 14px",borderRadius:10,background:"#f8fafc",border:"1px solid #e5e7eb",fontSize:12,color:"#9ca3af",fontStyle:"italic" }}>
                          Aucune assistante commerciale trouvée pour cet apprenant.
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display:"flex",gap:10,justifyContent:"space-between",alignItems:"center",marginTop:20,paddingTop:16,borderTop:"1px solid #e5e7eb",flexWrap:"wrap" }}>
                      <button onClick={()=>{ signalerAbsence(a); setApprenantDetail(null); }}
                        style={{ padding:"9px 16px",background:"#fff7ed",color:"#92400e",border:"1px solid #fed7aa",borderRadius:9,cursor:"pointer",fontWeight:700,fontSize:12 }}>
                        🚨 Signaler absence répétée
                      </button>
                      <div style={{ display:"flex",gap:8 }}>
                        <button onClick={()=>setApprenantDetail(null)}
                          style={{ padding:"9px 20px",background:BET,color:"#fff",border:"none",borderRadius:9,cursor:"pointer",fontWeight:700,fontSize:12 }}>
                          Fermer
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ TEST DE NIVEAU ═══ */}
                {/* ═══ PARCOURS ═══
                    Où cet apprenant est passé, et pourquoi il en est parti. Le coach
                    voyait une place se libérer sans jamais savoir ce qu'elle racontait. */}
                {ficheFicheTab==="parcours" && (
                  <ParcoursApprenant gaId={a?.id}
                    authHdrs={() => ({ Authorization: `Bearer ${localStorage.getItem("coach_token") || localStorage.getItem("admin_token")}` })} />
                )}

                {ficheFicheTab==="test" && (
                  <div>
                    {ficheTestLoading && <p style={{ textAlign:"center",color:"#9ca3af",padding:40 }}>Chargement…</p>}
                    {!ficheTestLoading && !ficheTest && (
                      <div style={{ textAlign:"center",padding:"50px 20px",background:"#f8fafc",borderRadius:14,border:"1px solid #e5e7eb" }}>
                        <div style={{ fontSize:44,marginBottom:10 }}>📊</div>
                        <div style={{ fontWeight:700,fontSize:15,color:"#0f172a",marginBottom:4 }}>Aucun test de niveau enregistré</div>
                        <p style={{ color:"#9ca3af",fontSize:13 }}>Le test de placement n'a pas été passé ou n'est pas lié à cet email.</p>
                      </div>
                    )}
                    {!ficheTestLoading && ficheTest && (() => {
                      const CLR = { A1:"#6b7280",A2:"#0891b2",B1:"#16a34a",B2:"#7c3aed",C1:"#d97706",C2:"#dc2626" };
                      const lvlC = CLR[ficheTest.level] || BET;
                      return (
                        <div style={{ display:"grid",gap:14 }}>
                          {/* Score */}
                          <div style={{ background:BET_GRAD,borderRadius:14,padding:"22px 26px",color:"#fff",display:"flex",gap:22,alignItems:"center",flexWrap:"wrap" }}>
                            <div style={{ textAlign:"center",flexShrink:0 }}>
                              <div style={{ fontSize:52,fontWeight:900,lineHeight:1 }}>{ficheTest.level||"-"}</div>
                              <div style={{ fontSize:12,color:"#7dd3fc",marginTop:4 }}>{NIVEAUX_LBL[ficheTest.level]||"CECRL"}</div>
                            </div>
                            <div style={{ flex:1,minWidth:140 }}>
                              <div style={{ fontSize:26,fontWeight:800 }}>{ficheTest.score??ficheTest.points_earned??0} pts</div>
                              {ficheTest.points_total && <div style={{ fontSize:12,color:"#7dd3fc" }}>sur {ficheTest.points_total} - {ficheTest.correct_answers||0}/{ficheTest.total_questions||0} bonnes réponses</div>}
                              {ficheTest.submitted_at && <div style={{ fontSize:11,color:"#7dd3fc",marginTop:5 }}>📅 Passé le {new Date(ficheTest.submitted_at).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"})}</div>}
                            </div>
                          </div>

                          {/* Par catégorie */}
                          {ficheTest.by_category && Object.keys(ficheTest.by_category).length>0 && (
                            <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
                              <div style={{ fontSize:11,fontWeight:800,color:BET,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12 }}>Résultats par catégorie</div>
                              <div style={{ display:"grid",gap:10 }}>
                                {Object.entries(ficheTest.by_category).map(([cat,val])=>{
                                  const total = val.total||val.max||10;
                                  const score = val.score??val.correct??0;
                                  const pct = Math.round((score/total)*100);
                                  return (
                                    <div key={cat}>
                                      <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3 }}>
                                        <span style={{ fontWeight:600,color:"#374151" }}>{cat}</span>
                                        <span style={{ color:pct>=70?lvlC:"#dc2626",fontWeight:700 }}>{score}/{total} ({pct}%)</span>
                                      </div>
                                      <div style={{ height:6,background:"#e5e7eb",borderRadius:99,overflow:"hidden" }}>
                                        <div style={{ height:"100%",width:`${pct}%`,background:pct>=70?lvlC:"#f87171",borderRadius:99 }}/>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Notes oral */}
                          {ficheTest.notes_oral && (
                            <div style={{ background:"#f8fafc",borderRadius:12,padding:14,border:"1px solid #e5e7eb" }}>
                              <div style={{ fontSize:11,fontWeight:800,color:BET,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8 }}>Notes de l'oral</div>
                              <p style={{ color:"#374151",fontSize:13,lineHeight:1.6,margin:0 }}>{ficheTest.notes_oral}</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* ═══ PRÉSENCES ═══ */}
                {ficheFicheTab==="presences" && (
                  <div>
                    {fichePresLoading && <p style={{ textAlign:"center",color:"#9ca3af",padding:40 }}>Chargement…</p>}
                    {!fichePresLoading && presApp.length===0 && (
                      <div style={{ textAlign:"center",padding:"50px 20px",background:"#f8fafc",borderRadius:14,border:"1px solid #e5e7eb" }}>
                        <div style={{ fontSize:44,marginBottom:10 }}>✅</div>
                        <div style={{ fontWeight:700,fontSize:15,color:"#0f172a",marginBottom:4 }}>Aucune présence enregistrée</div>
                        <p style={{ color:"#9ca3af",fontSize:13 }}>Les séances apparaîtront ici au fil des cours.</p>
                      </div>
                    )}
                    {!fichePresLoading && presApp.length>0 && (() => {
                      const absents  = presApp.filter(p=>p.statut==="absent").length;
                      const retards  = presApp.filter(p=>p.statut==="retard").length;
                      const taux     = Math.round(nbPresent/presApp.length*100);
                      const PRES_CFG = {
                        present: { bg:"#d1fae5",c:"#065f46",icon:"✅",l:"Présent" },
                        absent:  { bg:"#fee2e2",c:"#991b1b",icon:"❌",l:"Absent" },
                        retard:  { bg:"#fef3c7",c:"#92400e",icon:"⏰",l:"Retard" },
                      };
                      // Filtrage
                      const presFiltrees = [...presApp]
                        .sort((a,b)=>(b.date_seance||"").localeCompare(a.date_seance||""))
                        .filter(p => {
                          if (presStatutFil !== "tous" && p.statut !== presStatutFil) return false;
                          if (presDateFrom && p.date_seance && p.date_seance < presDateFrom) return false;
                          if (presDateTo   && p.date_seance && p.date_seance > presDateTo)   return false;
                          return true;
                        });
                      const presTotal = presFiltrees.length;
                      const presPages = Math.ceil(presTotal / PRES_PER_PAGE) || 1;
                      const presCurPage = Math.min(presPage, presPages);
                      const presSlice = presFiltrees.slice((presCurPage-1)*PRES_PER_PAGE, presCurPage*PRES_PER_PAGE);
                      return (
                        <div style={{ display:"grid",gap:14 }}>
                          {/* KPIs */}
                          <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10 }}>
                            {[
                              { l:"Total séances", v:presApp.length, c:"#0f172a" },
                              { l:"Présent",        v:nbPresent,      c:"#059669" },
                              { l:"Absent",         v:absents,        c:"#dc2626" },
                              { l:"Retard",         v:retards,        c:"#d97706" },
                            ].map(s=>(
                              <div key={s.l} style={{ background:"#f8fafc",borderRadius:10,padding:"12px 8px",border:"1px solid #e5e7eb",textAlign:"center" }}>
                                <div style={{ fontSize:22,fontWeight:900,color:s.c }}>{s.v}</div>
                                <div style={{ fontSize:10,color:"#9ca3af",marginTop:2 }}>{s.l}</div>
                              </div>
                            ))}
                          </div>
                          {/* Barre globale */}
                          <div style={{ background:"#f8fafc",borderRadius:10,padding:"12px 16px",border:"1px solid #e5e7eb" }}>
                            <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6 }}>
                              <span style={{ fontWeight:700,color:"#374151" }}>Taux de présence global</span>
                              <span style={{ fontWeight:800,color:taux>=80?"#059669":taux>=60?"#d97706":"#dc2626" }}>{taux}%</span>
                            </div>
                            <div style={{ height:8,background:"#e5e7eb",borderRadius:99,overflow:"hidden" }}>
                              <div style={{ height:"100%",width:`${taux}%`,background:taux>=80?"#059669":taux>=60?"#d97706":"#dc2626",borderRadius:99 }}/>
                            </div>
                          </div>
                          {/* Barre filtres */}
                          <div style={{ display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",padding:"10px 14px",background:"#f8fafc",borderRadius:10,border:"1px solid #e5e7eb" }}>
                            <span style={{ fontSize:11,fontWeight:700,color:"#374151" }}>Filtrer :</span>
                            {["tous","present","absent","retard"].map(s=>{
                              const cfg = s==="tous"?{ l:"Tous",bg:"#0f172a",c:"#fff" }:PRES_CFG[s]||{ l:s,bg:"#e5e7eb",c:"#374151" };
                              return (
                                <button key={s} onClick={()=>{ setPresStatutFil(s); setPresPage(1); }}
                                  style={{ padding:"4px 12px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",background:presStatutFil===s?cfg.bg:"#e5e7eb",color:presStatutFil===s?cfg.c:"#6b7280" }}>
                                  {s==="tous"?"Tous":cfg.l}
                                </button>
                              );
                            })}
                            <div style={{ display:"flex",gap:6,alignItems:"center",marginLeft:"auto" }}>
                              <span style={{ fontSize:10,color:"#9ca3af" }}>Du</span>
                              <input type="date" value={presDateFrom} onChange={e=>{ setPresDateFrom(e.target.value); setPresPage(1); }}
                                style={{ padding:"4px 8px",borderRadius:7,border:"1px solid #d1d5db",fontSize:11 }}/>
                              <span style={{ fontSize:10,color:"#9ca3af" }}>au</span>
                              <input type="date" value={presDateTo} onChange={e=>{ setPresDateTo(e.target.value); setPresPage(1); }}
                                style={{ padding:"4px 8px",borderRadius:7,border:"1px solid #d1d5db",fontSize:11 }}/>
                              {(presDateFrom||presDateTo||presStatutFil!=="tous") && (
                                <button onClick={()=>{ setPresDateFrom(""); setPresDateTo(""); setPresStatutFil("tous"); setPresPage(1); }}
                                  style={{ fontSize:11,color:"#dc2626",background:"none",border:"none",cursor:"pointer",fontWeight:700 }}>✕ Réinitialiser</button>
                              )}
                            </div>
                          </div>
                          {/* Liste séances paginée */}
                          <div style={{ borderRadius:12,border:"1px solid #e5e7eb",overflow:"hidden" }}>
                            {presSlice.length === 0 ? (
                              <div style={{ textAlign:"center",padding:"30px 0",color:"#9ca3af",fontSize:13 }}>Aucune séance pour ce filtre.</div>
                            ) : presSlice.map((p,i)=>{
                              const s = PRES_CFG[p.statut] || PRES_CFG.present;
                              return (
                                <div key={p.id||i} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:i%2===0?"#fff":"#fafafa",borderBottom:"1px solid #f1f5f9" }}>
                                  <span style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>📅 {p.date_seance?new Date(p.date_seance).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short",year:"numeric"}):"-"}</span>
                                  <span style={{ padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:s.bg,color:s.c }}>{s.icon} {s.l}</span>
                                </div>
                              );
                            })}
                          </div>
                          {/* Pagination présences */}
                          {presPages > 1 && (
                            <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:6 }}>
                              <button onClick={()=>setPresPage(p=>Math.max(1,p-1))} disabled={presCurPage===1}
                                style={{ padding:"5px 12px",borderRadius:7,border:"1px solid #e5e7eb",background:"#fff",cursor:presCurPage===1?"not-allowed":"pointer",color:presCurPage===1?"#d1d5db":"#374151",fontSize:12 }}>‹ Préc.</button>
                              {Array.from({length:presPages},(_,i)=>i+1).map(n=>(
                                <button key={n} onClick={()=>setPresPage(n)}
                                  style={{ width:30,height:30,borderRadius:7,border:`1px solid ${n===presCurPage?BET:"#e5e7eb"}`,background:n===presCurPage?BET:"#fff",color:n===presCurPage?"#fff":"#374151",fontWeight:700,fontSize:12,cursor:"pointer" }}>{n}</button>
                              ))}
                              <button onClick={()=>setPresPage(p=>Math.min(presPages,p+1))} disabled={presCurPage===presPages}
                                style={{ padding:"5px 12px",borderRadius:7,border:"1px solid #e5e7eb",background:"#fff",cursor:presCurPage===presPages?"not-allowed":"pointer",color:presCurPage===presPages?"#d1d5db":"#374151",fontSize:12 }}>Suiv. ›</button>
                              <span style={{ fontSize:11,color:"#9ca3af",marginLeft:4 }}>{presTotal} séance{presTotal>1?"s":""} · page {presCurPage}/{presPages}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* ════════════════════════════════ */}
                {/* Onglets dynamiques (devoirs/parents) */}
                {/* ════════════════════════════════ */}
                {["devoirs","parents"].includes(ficheFicheTab) && (() => {
                  const tok = localStorage.getItem("coach_token")||localStorage.getItem("admin_token");
                  const note2 = (() => { try { return a.note ? (typeof a.note==="string"?JSON.parse(a.note):a.note) : {}; } catch { return {}; } })();
                  const patch = ficheNotePatch !== null ? ficheNotePatch : note2;

                  const saveNote = async (newPatch) => {
                    if (ficheNoteSaving) return;
                    setFicheNoteSaving(true);
                    try {
                      const r = await fetch(`${API_URL}/api/groupes/apprenants/${a.id}/note`, {
                        method:"PATCH", headers:{ Authorization:`Bearer ${tok}`, "Content-Type":"application/json" },
                        body: JSON.stringify({ patch: newPatch }),
                      });
                      const d = r.ok ? await r.json() : null;
                      if (d?.apprenant) {
                        const updated = { ...a, note: d.apprenant.note };
                        setApprenantDetail(updated);
                        setFicheNotePatch(null);
                      }
                    } catch(e) { console.error(e); }
                    setFicheNoteSaving(false);
                  };

                  /* ── NOTES ── */
                  /* ── DEVOIRS ── */
                  if (ficheFicheTab==="devoirs") {
                    const DEV_STATUT_CFG = {
                      a_faire:   { l:"À rendre",  bg:"#f3f4f6", c:"#6b7280",  icon:"⏳" },
                      rendu:     { l:"Rendu",      bg:"#dbeafe", c:"#1e40af",  icon:"📥" },
                      en_retard: { l:"En retard",  bg:"#fee2e2", c:"#991b1b",  icon:"⚠️" },
                      corrige:   { l:"Corrigé",    bg:"#dcfce7", c:"#166534",  icon:"✅" },
                    };
                    const DEV_TYPE_CFG = { devoir:"📝", examen:"📋", quiz:"❓", oral:"🎤", projet:"🗂" };
                    // Filtrage
                    const devFiltres = ficheDevoirsDB.filter(ev => {
                      if (devStatutFil !== "tous" && ev.resultat?.statut !== devStatutFil) return false;
                      if (devDateFrom && ev.date_evaluation && ev.date_evaluation < devDateFrom) return false;
                      if (devDateTo   && ev.date_evaluation && ev.date_evaluation > devDateTo)   return false;
                      return true;
                    });
                    const devTotal = devFiltres.length;
                    const devPages = Math.ceil(devTotal / DEV_PER_PAGE) || 1;
                    const devCurPage = Math.min(devPage, devPages);
                    const devSlice = devFiltres.slice((devCurPage-1)*DEV_PER_PAGE, devCurPage*DEV_PER_PAGE);
                    // Stats rapides
                    const nbRendus   = ficheDevoirsDB.filter(e=>e.resultat?.statut==="rendu").length;
                    const nbCorrige  = ficheDevoirsDB.filter(e=>e.resultat?.statut==="corrige").length;
                    const nbAFaire   = ficheDevoirsDB.filter(e=>e.resultat?.statut==="a_faire").length;
                    const nbRetard   = ficheDevoirsDB.filter(e=>e.resultat?.statut==="en_retard").length;
                    return (
                      <div>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>📚 Évaluations de {nomComplet}</div>
                          <span style={{ fontSize:11, color:"#9ca3af" }}>{ficheDevoirsDB.length} évaluation{ficheDevoirsDB.length>1?"s":""}</span>
                        </div>

                        {/* KPIs */}
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
                          {[
                            { l:"À rendre",  v:nbAFaire,  c:"#6b7280" },
                            { l:"Rendus",    v:nbRendus,  c:"#1e40af" },
                            { l:"En retard", v:nbRetard,  c:"#dc2626" },
                            { l:"Corrigés",  v:nbCorrige, c:"#166534" },
                          ].map(s=>(
                            <div key={s.l} style={{ background:"#f8fafc", borderRadius:10, padding:"12px 8px", border:"1px solid #e5e7eb", textAlign:"center" }}>
                              <div style={{ fontSize:22, fontWeight:900, color:s.c }}>{s.v}</div>
                              <div style={{ fontSize:10, color:"#9ca3af", marginTop:2 }}>{s.l}</div>
                            </div>
                          ))}
                        </div>

                        {/* Barre filtres */}
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", padding:"10px 14px", background:"#f8fafc", borderRadius:10, border:"1px solid #e5e7eb", marginBottom:14 }}>
                          <span style={{ fontSize:11, fontWeight:700, color:"#374151" }}>Statut :</span>
                          {["tous","a_faire","rendu","en_retard","corrige"].map(s=>{
                            const cfg = s==="tous"?{ l:"Tous",bg:"#0f172a",c:"#fff" }:DEV_STATUT_CFG[s];
                            return (
                              <button key={s} onClick={()=>{ setDevStatutFil(s); setDevPage(1); }}
                                style={{ padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:700, cursor:"pointer", border:"none", background:devStatutFil===s?cfg.bg:"#e5e7eb", color:devStatutFil===s?cfg.c:"#6b7280" }}>
                                {s==="tous"?"Tous":cfg.icon+" "+cfg.l}
                              </button>
                            );
                          })}
                          <div style={{ display:"flex", gap:6, alignItems:"center", marginLeft:"auto" }}>
                            <input type="date" value={devDateFrom} onChange={e=>{ setDevDateFrom(e.target.value); setDevPage(1); }}
                              style={{ padding:"4px 8px", borderRadius:7, border:"1px solid #d1d5db", fontSize:11 }}/>
                            <span style={{ fontSize:10, color:"#9ca3af" }}>→</span>
                            <input type="date" value={devDateTo} onChange={e=>{ setDevDateTo(e.target.value); setDevPage(1); }}
                              style={{ padding:"4px 8px", borderRadius:7, border:"1px solid #d1d5db", fontSize:11 }}/>
                            {(devDateFrom||devDateTo||devStatutFil!=="tous") && (
                              <button onClick={()=>{ setDevDateFrom(""); setDevDateTo(""); setDevStatutFil("tous"); setDevPage(1); }}
                                style={{ fontSize:11, color:"#dc2626", background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>✕</button>
                            )}
                          </div>
                        </div>

                        {/* Liste évaluations */}
                        {ficheDevoirsLoading ? (
                          <div style={{ textAlign:"center", padding:"30px 0", color:"#9ca3af" }}>Chargement…</div>
                        ) : devSlice.length === 0 ? (
                          <div style={{ textAlign:"center", padding:"30px 0", color:"#9ca3af", fontSize:13 }}>Aucune évaluation pour ce filtre.</div>
                        ) : (
                          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                            {devSlice.map((ev, i) => {
                              const res = ev.resultat || {};
                              const sc  = DEV_STATUT_CFG[res.statut] || DEV_STATUT_CFG.a_faire;
                              const now = new Date();
                              const limite = ev.date_evaluation ? new Date(ev.date_evaluation+"T"+(ev.heure_debut||"23:59")+":00") : null;
                              const enRetard = limite && limite < now && res.statut === "a_faire";
                              const border = enRetard ? "#fca5a5" : res.statut==="corrige" ? "#bbf7d0" : res.statut==="rendu" ? "#93c5fd" : "#e5e7eb";
                              const bg     = enRetard ? "#fff5f5" : res.statut==="corrige" ? "#f0fdf4" : res.statut==="rendu" ? "#f0f9ff" : "#fff";
                              return (
                                <div key={ev.id||i} style={{ padding:"14px 16px", borderRadius:12, background:bg, border:`1.5px solid ${border}` }}>
                                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                                    <div style={{ flex:1, minWidth:0 }}>
                                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                                        <span style={{ fontSize:16 }}>{DEV_TYPE_CFG[ev.type_evaluation]||"📝"}</span>
                                        <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{ev.titre}</div>
                                      </div>
                                      <div style={{ display:"flex", gap:10, flexWrap:"wrap", fontSize:11, color:"#6b7280" }}>
                                        {ev.date_evaluation && <span>📅 Limite : {new Date(ev.date_evaluation).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}{ev.heure_debut?" "+ev.heure_debut:""}</span>}
                                        <span style={{ textTransform:"capitalize" }}>{ev.type_evaluation||"devoir"}</span>
                                        {enRetard && <span style={{ color:"#dc2626", fontWeight:700 }}>⚠️ Délai dépassé</span>}
                                      </div>
                                      {res.rendu_at && <div style={{ fontSize:11, color:"#6b7280", marginTop:3 }}>Rendu le : {new Date(res.rendu_at).toLocaleDateString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>}
                                      {res.note !== null && res.note !== undefined && (
                                        <div style={{ marginTop:6, display:"flex", alignItems:"center", gap:8 }}>
                                          <span style={{ fontSize:14, fontWeight:900, color:res.note/(res.note_max||20)>=0.5?"#059669":"#dc2626" }}>{res.note}/{res.note_max||20}</span>
                                          {res.commentaire_coach && <span style={{ fontSize:11, color:"#374151", fontStyle:"italic" }}>"{res.commentaire_coach}"</span>}
                                        </div>
                                      )}
                                    </div>
                                    <span style={{ padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:700, background:sc.bg, color:sc.c, flexShrink:0 }}>{sc.icon} {sc.l}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Pagination devoirs */}
                        {devPages > 1 && (
                          <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:6, marginTop:14 }}>
                            <button onClick={()=>setDevPage(p=>Math.max(1,p-1))} disabled={devCurPage===1}
                              style={{ padding:"5px 12px", borderRadius:7, border:"1px solid #e5e7eb", background:"#fff", cursor:devCurPage===1?"not-allowed":"pointer", color:devCurPage===1?"#d1d5db":"#374151", fontSize:12 }}>‹ Préc.</button>
                            {Array.from({length:devPages},(_,i)=>i+1).map(n=>(
                              <button key={n} onClick={()=>setDevPage(n)}
                                style={{ width:30, height:30, borderRadius:7, border:`1px solid ${n===devCurPage?BET:"#e5e7eb"}`, background:n===devCurPage?BET:"#fff", color:n===devCurPage?"#fff":"#374151", fontWeight:700, fontSize:12, cursor:"pointer" }}>{n}</button>
                            ))}
                            <button onClick={()=>setDevPage(p=>Math.min(devPages,p+1))} disabled={devCurPage===devPages}
                              style={{ padding:"5px 12px", borderRadius:7, border:"1px solid #e5e7eb", background:"#fff", cursor:devCurPage===devPages?"not-allowed":"pointer", color:devCurPage===devPages?"#d1d5db":"#374151", fontSize:12 }}>Suiv. ›</button>
                            <span style={{ fontSize:11, color:"#9ca3af", marginLeft:4 }}>{devTotal} éval. · page {devCurPage}/{devPages}</span>
                          </div>
                        )}

                        {/* ── Notes manuelles du coach (fusionné depuis l'ex-onglet Notes) ── */}
                        <div style={{ marginTop:24, paddingTop:18, borderTop:"1px solid #e5e7eb" }}>
                          <div style={{ fontSize:11, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:".06em", marginBottom:8 }}>
                            ✏️ Notes manuelles du coach
                          </div>
                          {(() => {
                            const notesList = Array.isArray(patch.notes_cours) ? patch.notes_cours : [];
                            return (
                              <>
                                <div style={{ background:"#f8fafc", borderRadius:12, padding:14, border:"1px solid #e5e7eb", marginBottom:12 }}>
                                  <div style={{ fontSize:11, fontWeight:700, color:"#374151", marginBottom:8 }}>Ajouter une note</div>
                                  <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", gap:8, marginBottom:8 }}>
                                    <input value={newNote.titre} onChange={e=>setNewNote(p=>({...p,titre:e.target.value}))} placeholder="Ex: Dictée n°3, Oral B1…"
                                      style={{ padding:"8px 10px", borderRadius:7, border:"1px solid #d1d5db", fontSize:12 }}/>
                                    <input type="number" value={newNote.note} onChange={e=>setNewNote(p=>({...p,note:e.target.value}))} placeholder="Note" min={0} max={newNote.sur}
                                      style={{ padding:"8px 10px", borderRadius:7, border:"1px solid #d1d5db", fontSize:12 }}/>
                                    <input type="number" value={newNote.sur} onChange={e=>setNewNote(p=>({...p,sur:e.target.value}))} placeholder="/20"
                                      style={{ padding:"8px 10px", borderRadius:7, border:"1px solid #d1d5db", fontSize:12 }}/>
                                    <input type="date" value={newNote.date} onChange={e=>setNewNote(p=>({...p,date:e.target.value}))}
                                      style={{ padding:"8px 10px", borderRadius:7, border:"1px solid #d1d5db", fontSize:12 }}/>
                                  </div>
                                  <input value={newNote.commentaire} onChange={e=>setNewNote(p=>({...p,commentaire:e.target.value}))} placeholder="Commentaire (optionnel)"
                                    style={{ width:"100%", padding:"8px 12px", borderRadius:7, border:"1px solid #d1d5db", fontSize:12, marginBottom:8 }}/>
                                  <button onClick={()=>{
                                    if (!newNote.titre.trim()||newNote.note==="") return;
                                    const entry = { id:Date.now(), ...newNote, note:Number(newNote.note), sur:Number(newNote.sur||20) };
                                    saveNote({...patch, notes_cours:[entry,...notesList]});
                                    setNewNote({ titre:"", note:"", sur:20, date:new Date().toISOString().slice(0,10), commentaire:"" });
                                  }} disabled={ficheNoteSaving||!newNote.titre.trim()||newNote.note===""}
                                    style={{ padding:"7px 18px", background:BET, color:"#fff", border:"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer", opacity:ficheNoteSaving?0.6:1 }}>
                                    {ficheNoteSaving?"…":"➕ Ajouter"}
                                  </button>
                                </div>
                                {notesList.length === 0
                                  ? <div style={{ textAlign:"center", padding:"20px 0", color:"#9ca3af", fontSize:13 }}>Aucune note manuelle enregistrée.</div>
                                  : <table style={{ width:"100%", borderCollapse:"collapse" }}>
                                      <thead><tr style={{ background:"#f8fafc" }}>
                                        {["Date","Exercice","Note","Commentaire",""].map(h=><th key={h} style={{ padding:"9px 12px", fontSize:10, fontWeight:700, color:"#64748b", textAlign:"left", textTransform:"uppercase", borderBottom:"2px solid #e2e8f0" }}>{h}</th>)}
                                      </tr></thead>
                                      <tbody>
                                        {notesList.map((n,i)=>{
                                          const pct = Math.round(n.note/(n.sur||20)*100);
                                          const c = pct>=70?"#059669":pct>=50?"#d97706":"#dc2626";
                                          return (
                                            <tr key={n.id||i} style={{ borderBottom:"1px solid #f1f5f9", background:i%2===0?"#fff":"#fafafa" }}>
                                              <td style={{ padding:"10px 12px", fontSize:12, color:"#6b7280" }}>{n.date?new Date(n.date).toLocaleDateString("fr-FR",{day:"numeric",month:"short"}):"-"}</td>
                                              <td style={{ padding:"10px 12px", fontSize:13, fontWeight:700, color:"#0f172a" }}>{n.titre}</td>
                                              <td style={{ padding:"10px 12px", fontWeight:900, color:c }}>{n.note}/{n.sur||20}</td>
                                              <td style={{ padding:"10px 12px", fontSize:12, color:"#374151" }}>{n.commentaire||"-"}</td>
                                              <td style={{ padding:"10px 12px", textAlign:"center" }}>
                                                <button onClick={()=>saveNote({...patch,notes_cours:notesList.filter((_,j)=>j!==i)})} style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:14 }}>×</button>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                }
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  }

                  /* ── PARENTS ── */
                  if (ficheFicheTab==="parents") {
                    const parentsList = Array.isArray(patch.parents) ? patch.parents : [];
                    const RELATIONS = ["Père","Mère","Tuteur","Tutrice","Grand-père","Grand-mère","Oncle","Tante","Autre"];
                    return (
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginBottom:14 }}>👨‍👩‍👧 Parents / Tuteurs de {nomComplet}</div>
                        {/* Ajout */}
                        <div style={{ background:"#f8fafc", borderRadius:12, padding:14, border:"1px solid #e5e7eb", marginBottom:16 }}>
                          <div style={{ fontSize:11, fontWeight:700, color:"#374151", marginBottom:8 }}>Ajouter un parent / tuteur</div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:8 }}>
                            <input value={newP.prenom} onChange={e=>setNewP(p=>({...p,prenom:e.target.value}))} placeholder="Prénom" style={{ padding:"8px 10px", borderRadius:7, border:"1px solid #d1d5db", fontSize:12 }}/>
                            <input value={newP.nom} onChange={e=>setNewP(p=>({...p,nom:e.target.value}))} placeholder="Nom" style={{ padding:"8px 10px", borderRadius:7, border:"1px solid #d1d5db", fontSize:12 }}/>
                            <select value={newP.relation} onChange={e=>setNewP(p=>({...p,relation:e.target.value}))} style={{ padding:"8px 10px", borderRadius:7, border:"1px solid #d1d5db", fontSize:12 }}>
                              {RELATIONS.map(r=><option key={r}>{r}</option>)}
                            </select>
                            <input value={newP.telephone} onChange={e=>setNewP(p=>({...p,telephone:e.target.value}))} placeholder="Téléphone" style={{ padding:"8px 10px", borderRadius:7, border:"1px solid #d1d5db", fontSize:12 }}/>
                            <input type="email" value={newP.email} onChange={e=>setNewP(p=>({...p,email:e.target.value}))} placeholder="Email (optionnel)" style={{ padding:"8px 10px", borderRadius:7, border:"1px solid #d1d5db", fontSize:12, gridColumn:"span 2" }}/>
                          </div>
                          <button onClick={()=>{
                            if (!newP.nom.trim()&&!newP.prenom.trim()) return;
                            const entry = { id:Date.now(), ...newP };
                            saveNote({...patch, parents:[...parentsList, entry], is_enfant:true});
                            setNewP({ nom:"", prenom:"", relation:"Père", telephone:"", email:"" });
                          }} disabled={ficheNoteSaving||(!newP.nom.trim()&&!newP.prenom.trim())}
                            style={{ padding:"7px 18px", background:BET, color:"#fff", border:"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer", opacity:ficheNoteSaving?0.6:1 }}>
                            {ficheNoteSaving?"…":"➕ Ajouter"}
                          </button>
                        </div>
                        {parentsList.length === 0
                          ? <div style={{ textAlign:"center", padding:"30px 0", color:"#9ca3af", fontSize:13 }}>Aucun parent / tuteur enregistré.</div>
                          : <div style={{ display:"grid", gap:12 }}>
                              {parentsList.map((p,i)=>(
                                <div key={p.id||i} style={{ padding:"14px 16px", borderRadius:12, background:"#fff", border:"1px solid #e5e7eb", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                                  <div style={{ display:"flex", gap:14, alignItems:"center" }}>
                                    <div style={{ width:44, height:44, borderRadius:"50%", background:BET_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                                      {p.relation==="Mère"||p.relation==="Tutrice"||p.relation==="Grand-mère"||p.relation==="Tante"?"👩":"👨"}
                                    </div>
                                    <div>
                                      <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>{p.prenom} {p.nom}</div>
                                      <div style={{ fontSize:11, color:BET, fontWeight:600, marginBottom:3 }}>{p.relation}</div>
                                      {p.telephone && <div style={{ fontSize:12, color:"#374151" }}>📞 <a href={`tel:${p.telephone}`} style={{ color:"#0891b2", fontWeight:600, textDecoration:"none" }}>{p.telephone}</a></div>}
                                      {p.email && <div style={{ fontSize:12, color:"#374151", marginTop:2 }}>✉️ <a href={`mailto:${p.email}`} style={{ color:"#0891b2", textDecoration:"none" }}>{p.email}</a></div>}
                                    </div>
                                  </div>
                                  <button onClick={()=>{ const nl=parentsList.filter((_,j)=>j!==i); saveNote({...patch,parents:nl}); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:16 }}>×</button>
                                </div>
                              ))}
                            </div>
                        }
                      </div>
                    );
                  }

                  return null;
                })()}

              </div>
            </div>
          </div>
        );
      })()}


        {/* ══ MODAL MESSAGE ══ */}
      {showMsgModal&&selectedMsg&&(
  <Modal title={selectedMsg.objet} onClose={()=>setShowMsgModal(false)}>
    <div style={{ display:"flex", gap:12, paddingBottom:14, borderBottom:"1px solid #e5e7eb", marginBottom:14 }}>
      <div style={{ width:44, height:44, borderRadius:"50%", background:BET_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, color:BET }}>
        {selectedMsg.sens === "envoye" ? "✉️" : selectedMsg.avatar}
      </div>
      <div>
        <div style={{ fontWeight:700, fontSize:14 }}>{selectedMsg.de}{selectedMsg.sens === "envoye" && " (moi)"}</div>
        <div style={{ fontSize:12, color:"#9ca3af" }}>📅 {fmtDate(selectedMsg.date)}</div>
      </div>
    </div>
    <p style={{ fontSize:14, color:"#374151", lineHeight:1.7 }}>{selectedMsg.msg}</p>
    <div style={{ display:"flex", gap:10, marginTop:16 }}>
      {selectedMsg.sens !== "envoye" && (
        <button onClick={() => { setActiveConvMsg(selectedMsg); setShowMsgModal(false); }} style={btnPrimary}>↩️ Répondre</button>
      )}
      <button onClick={()=>setShowMsgModal(false)} style={btnSecondary}>Fermer</button>
    </div>
  </Modal>
)}

      {/* ════ MODAL DÉTAILS SESSION (Planning) ════ */}
      {showSessionDetailModal && sessionDetailData && (() => {
        const sd = sessionDetailData;
        const isPresent = sd.plateforme === "presentiel";
        const grpNom = groupes.find(g => g.id === sd.groupe_id)?.nom;
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.65)", zIndex:3000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
            onClick={() => setShowSessionDetailModal(false)}>
            <div style={{ background:"#fff", borderRadius:18, width:"90vw", height:"90vh", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 24px 60px rgba(0,0,0,0.3)" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ background: isPresent ? "linear-gradient(135deg,#065f46,#059669)" : "linear-gradient(135deg,#1e3a8a,#3b82f6)", padding:"20px 24px", color:"#fff", position:"relative", flexShrink:0 }}>
                <button onClick={() => setShowSessionDetailModal(false)}
                  style={{ position:"absolute", top:14, right:14, background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", width:28, height:28, borderRadius:"50%", cursor:"pointer", fontSize:15 }}>✕</button>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", marginBottom:5, letterSpacing:"0.1em" }}>{isPresent ? "🏢 SESSION PRÉSENTIELLE" : "📡 SESSION LIVE"}</div>
                <div style={{ fontSize:19, fontWeight:900, paddingRight:40 }}>{sd.titre}</div>
              </div>
              <div style={{ padding:"20px 24px 24px", flex:1, overflowY:"auto" }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
                  {[
                    { icon:"📅", label:"Date",  val: sd.date ? new Date(sd.date).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"}) : "-" },
                    { icon:"🕐", label:"Heure", val: sd.heure || "-" },
                    { icon:"⏱",  label:"Durée", val: sd.duree ? `${sd.duree} min` : (sd.heure_fin ? `→ ${sd.heure_fin}` : "-") },
                  ].map(item => (
                    <div key={item.label} style={{ background:"#f8fafc", borderRadius:9, padding:"10px 12px", textAlign:"center" }}>
                      <div style={{ fontSize:16, marginBottom:3 }}>{item.icon}</div>
                      <div style={{ fontSize:10, color:"#9ca3af", fontWeight:600, textTransform:"uppercase" }}>{item.label}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{item.val}</div>
                    </div>
                  ))}
                </div>
                {grpNom && (
                  <div style={{ padding:"10px 14px", background:"#ede9f7", borderRadius:9, marginBottom:12, fontSize:13, fontWeight:600, color:"#5b21b6" }}>👥 Groupe : {grpNom}</div>
                )}
                {!isPresent && sd.lien && (
                  <div style={{ padding:"10px 14px", background:"#eff6ff", borderRadius:9, marginBottom:12, display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ fontSize:14 }}>🔗</span>
                    <span style={{ fontSize:12, color:"#1d4ed8", wordBreak:"break-all" }}>{sd.lien}</span>
                  </div>
                )}
                {isPresent && (
                  <div style={{ padding:"10px 14px", background:"#ecfdf5", borderRadius:9, marginBottom:12, fontSize:13, color:"#065f46", fontWeight:600 }}>
                    🏢 Séance présentielle - rendez-vous en salle
                  </div>
                )}
                {sd.notes && (
                  <div style={{ padding:"10px 14px", background:"#fffbeb", borderRadius:9, marginBottom:16, fontSize:12, color:"#92400e", fontStyle:"italic" }}>
                    💬 {sd.notes}
                  </div>
                )}
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={() => setShowSessionDetailModal(false)}
                    style={{ flex:1, padding:"12px", borderRadius:10, border:"1.5px solid #e2e8f0", background:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", color:"#374151" }}>
                    Fermer
                  </button>
                  {/* Une séance manquée n'est plus à ouvrir, elle est à reposer : proposer
                      « Ouvrir la salle » sur un créneau passé de deux jours n'aide personne. */}
                  {estSessionNonEffectuee(sd) ? (
                    <button onClick={() => { setShowSessionDetailModal(false); ouvrirReprogrammation(sd); }}
                      style={{ flex:1, padding:"12px", borderRadius:10, border:"none", background:"#b45309", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                      📅 Reprogrammer
                    </button>
                  ) : sd.statut !== "terminee" && (
                    <button onClick={() => openConfirm(
                      isPresent ? "Démarrer le cours" : "Ouvrir la salle",
                      isPresent
                        ? `Démarrer la séance « ${sd.titre} » maintenant ? L'heure de début sera enregistrée et la feuille de présence s'ouvrira.`
                        : `Démarrer la session « ${sd.titre} » et ouvrir la salle vidéo maintenant ?`,
                      () => {
                        setShowSessionDetailModal(false);
                        if (isPresent) ouvrirPresentielModal(sd);
                        else { ouvrirSalle(sd); setActiveTab("session_live"); }
                      },
                      isPresent ? "🏢 Démarrer le cours" : "🎥 Ouvrir la salle", "#059669")}
                    style={{ flex:1, padding:"12px", borderRadius:10, border:"none", background: isPresent?"#059669":"#1d4ed8", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                      {isPresent ? "🏢 Démarrer" : "🎥 Ouvrir la salle"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ════ MODAL REPROGRAMMATION ════ */}
      {reprogSession && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.65)", zIndex:3200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
          onClick={() => !reprogBusy && setReprogSession(null)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:"#fff", borderRadius:16, width:"min(440px,92vw)", overflow:"hidden", boxShadow:"0 24px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ background:"linear-gradient(135deg,#92400e,#d97706)", padding:"18px 22px", color:"#fff" }}>
              <div style={{ fontSize:10.5, letterSpacing:"0.1em", color:"rgba(255,255,255,0.7)", marginBottom:4 }}>SÉANCE NON EFFECTUÉE</div>
              <div style={{ fontSize:17, fontWeight:900 }}>{reprogSession.titre}</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.85)", marginTop:3 }}>
                Prévue le {fmtDate(reprogSession.date)}{reprogSession.heure ? ` à ${String(reprogSession.heure).slice(0,5)}` : ""}
              </div>
            </div>
            <div style={{ padding:"18px 22px", display:"flex", flexDirection:"column", gap:12 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>NOUVELLE DATE *</label>
                <input type="date" value={reprogForm.date} min={new Date().toISOString().slice(0,10)}
                  onChange={e => setReprogForm(f => ({ ...f, date: e.target.value }))}
                  style={{ width:"100%", padding:"9px 11px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, boxSizing:"border-box" }} />
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>HEURE *</label>
                  <input type="time" value={reprogForm.heure}
                    onChange={e => setReprogForm(f => ({ ...f, heure: e.target.value }))}
                    style={{ width:"100%", padding:"9px 11px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, boxSizing:"border-box" }} />
                </div>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>FIN</label>
                  <input type="time" value={reprogForm.heure_fin}
                    onChange={e => setReprogForm(f => ({ ...f, heure_fin: e.target.value }))}
                    style={{ width:"100%", padding:"9px 11px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, boxSizing:"border-box" }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>MOTIF DU REPORT</label>
                <textarea value={reprogForm.motif} rows={2} placeholder="Empêchement, coupure réseau, absence des apprenants…"
                  onChange={e => setReprogForm(f => ({ ...f, motif: e.target.value }))}
                  style={{ width:"100%", padding:"9px 11px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, resize:"vertical", fontFamily:"inherit", boxSizing:"border-box" }} />
                <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>
                  Le motif est transmis aux apprenants et conservé dans l'historique de la séance.
                </div>
              </div>
              <div style={{ display:"flex", gap:10, marginTop:4 }}>
                <button onClick={() => setReprogSession(null)} disabled={reprogBusy}
                  style={{ flex:1, padding:"11px", borderRadius:10, border:"1.5px solid #e2e8f0", background:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", color:"#374151" }}>
                  Annuler
                </button>
                <button onClick={envoyerReprogrammation} disabled={reprogBusy || !reprogForm.date || !reprogForm.heure}
                  style={{ flex:1, padding:"11px", borderRadius:10, border:"none", fontSize:13, fontWeight:700,
                    background: (reprogBusy || !reprogForm.date || !reprogForm.heure) ? "#e2e8f0" : "#b45309",
                    color: (reprogBusy || !reprogForm.date || !reprogForm.heure) ? "#94a3b8" : "#fff",
                    cursor: (reprogBusy || !reprogForm.date || !reprogForm.heure) ? "not-allowed" : "pointer" }}>
                  {reprogBusy ? "⏳ Report…" : "📅 Reporter la séance"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL PRÉSENTIEL - Présences + Clôture ════ */}
      {showPresentielModal && presentielSession && (() => {
        const ps = presentielSession;
        const grpNom = groupes.find(g => g.id === ps.groupe_id)?.nom;
        // Borné à la liste affichée : un apprenant retiré en cours de séance gonflait
        // sinon le total, et « 3/2 présents » s'affichait.
        const nbPresents = presentielApprenants.filter(a => presentielPresences[a.id] === "present").length;
        const nbNonRenseignesPre = presentielApprenants.filter(a => !presentielPresences[a.id]).length;
        const preOk = presentielApprenants.length === 0 || nbNonRenseignesPre === 0;
        const STATUTS = [
          { val:"present", label:"✅ Présent",  bg:"#d1fae5", c:"#065f46" },
          { val:"retard",  label:"⏱ Retard",   bg:"#fef3c7", c:"#92400e" },
          { val:"absent",  label:"❌ Absent",   bg:"#fee2e2", c:"#991b1b" },
        ];
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.72)", zIndex:3000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
            <div style={{ background:"#fff", borderRadius:18, width:"90vw", height:"90vh", overflow:"hidden", display:"flex", flexDirection:"column", boxShadow:"0 24px 60px rgba(0,0,0,0.35)" }}>
              {/* Header */}
              <div style={{ background:"linear-gradient(135deg,#065f46,#059669)", padding:"18px 22px", color:"#fff", flexShrink:0 }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:16 }}>
                  <div>
                    <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", marginBottom:4, letterSpacing:"0.1em" }}>🏢 SESSION PRÉSENTIELLE</div>
                    <div style={{ fontSize:18, fontWeight:900 }}>{ps.titre}</div>
                  </div>
                  {/* Le temps passé en salle, relevé et transmis à la clôture : c'est lui que
                      le PA, la commerciale et l'onboarding liront dans « Déroulé réel ». */}
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontSize:9.5, color:"rgba(255,255,255,0.6)", letterSpacing:"0.08em", fontWeight:700 }}>TEMPS EN SALLE</div>
                    <div style={{ fontSize:26, fontWeight:900, color:"#FCD34D", fontFamily:"monospace", letterSpacing:1.5 }}>{fmtChrono(chronoPresentiel)}</div>
                  </div>
                </div>
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.7)", marginTop:4, display:"flex", gap:14, flexWrap:"wrap" }}>
                  <span>📅 {ps.date ? new Date(ps.date).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"}) : ""}</span>
                  <span>🕐 {ps.heure}{ps.heure_fin?` – ${ps.heure_fin}`:""}</span>
                  {grpNom && <span>👥 {grpNom}</span>}
                </div>
              </div>
              {/* Corps présences */}
              <div style={{ flex:1, overflowY:"auto", padding:"18px 22px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:"#0f172a" }}>👥 Liste de présences</div>
                  <div style={{ fontSize:13, color:"#059669", fontWeight:700 }}>{nbPresents}/{presentielApprenants.length} présent{nbPresents > 1 ? "s" : ""}</div>
                </div>
                {presentielApprenants.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"30px 0", color:"#9ca3af" }}>
                    <div style={{ fontSize:32, marginBottom:8 }}>👥</div>
                    <div style={{ fontSize:13 }}>{ps.groupe_id ? "Chargement des apprenants…" : "Aucun groupe associé à cette session"}</div>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {/* Tout marquer comme présent */}
                    <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                      <button onClick={() => { const all = {}; presentielApprenants.forEach(a => { all[a.id] = "present"; }); setPresentielPresences(all); }}
                        style={{ padding:"6px 14px", borderRadius:8, border:"1.5px solid #6ee7b7", background:"#ecfdf5", color:"#065f46", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                        ✅ Tous présents
                      </button>
                      <button onClick={() => { const all = {}; presentielApprenants.forEach(a => { all[a.id] = "absent"; }); setPresentielPresences(all); }}
                        style={{ padding:"6px 14px", borderRadius:8, border:"1.5px solid #fca5a5", background:"#fef2f2", color:"#991b1b", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                        ❌ Tous absents
                      </button>
                    </div>
                    {presentielApprenants.map(a => {
                      const statut = presentielPresences[a.id] || null;
                      const nom = `${a.prenom_apprenant || a.prenom || ""} ${a.nom_apprenant || a.nom || ""}`.trim();
                      return (
                        <div key={a.id} style={{ background:"#f8fafc", borderRadius:10, padding:"10px 14px", border:"1px solid #e5e7eb" }}>
                          <div style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginBottom:8 }}>{nom || a.email_apprenant || "Apprenant"}</div>
                          <div style={{ display:"flex", gap:6 }}>
                            {STATUTS.map(st => (
                              <button key={st.val} onClick={() => setPresentielPresences(p => ({ ...p, [a.id]: st.val }))}
                                style={{ flex:1, padding:"6px 4px", borderRadius:8, border:`2px solid ${statut===st.val?st.c:"#e5e7eb"}`, background:statut===st.val?st.bg:"#fff", color:statut===st.val?st.c:"#6b7280", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                                {st.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {ps.notes && (
                  <div style={{ marginTop:14, padding:"10px 14px", background:"#fffbeb", borderRadius:9, fontSize:12, color:"#92400e", fontStyle:"italic" }}>
                    💬 {ps.notes}
                  </div>
                )}
              </div>
              {/* Footer */}
              <div style={{ padding:"14px 22px", borderTop:"1px solid #e5e7eb", display:"flex", gap:10, flexShrink:0 }}>
                <button onClick={() => setShowPresentielModal(false)}
                  style={{ flex:1, padding:"12px", borderRadius:10, border:"1.5px solid #e2e8f0", background:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", color:"#374151" }}>
                  Annuler
                </button>
                <button onClick={() => openConfirm("Clôturer la séance", "Les présences seront sauvegardées et la séance marquée comme terminée.", cloturerPresentiel)} disabled={presentielCloturing || !preOk}
                  title={!preOk ? `Renseignez d'abord les présences (${nbNonRenseignesPre} manquante${nbNonRenseignesPre>1?"s":""})` : ""}
                  style={{ flex:2, padding:"12px", borderRadius:10, border:"none", background:(presentielCloturing||!preOk)?"#e5e7eb":"#059669", color:(presentielCloturing||!preOk)?"#9ca3af":"#fff", fontSize:14, fontWeight:800, cursor:(presentielCloturing||!preOk)?"not-allowed":"pointer" }}>
                  {presentielCloturing ? "Clôture en cours…" : !preOk ? `⚠️ ${nbNonRenseignesPre} présence(s) manquante(s)` : "⏹ Clôturer la séance"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

{/* ── MODAL SIGNALER UNE ABSENCE ── */}
{modalAbsence && (() => {
  const sessionsDispos     = sessionsAbsenceDansPeriode(formAbsence.dateDebut, formAbsence.dateFin);
  const toutesSelectionnees = sessionsDispos.every(s => formAbsence.sessionsIds.includes(s.id));

  function toggleSession(id) {
    setFormAbsence(prev => ({
      ...prev,
      sessionsIds: prev.sessionsIds.includes(id)
        ? prev.sessionsIds.filter(x => x !== id)
        : [...prev.sessionsIds, id],
    }));
  }

  function selectionnerToutes() {
    setFormAbsence(prev => ({
      ...prev,
      sessionsIds: toutesSelectionnees ? [] : sessionsDispos.map(s => s.id),
    }));
  }

  const nbSelectionnes = formAbsence.sessionsIds.filter(id => sessionsDispos.some(s => s.id === id)).length;
  const canSend = formAbsence.dateDebut && formAbsence.dateFin &&
    !(sessionsDispos.length > 0 && formAbsence.sessionsIds.length === 0);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:18, width:'90vw', maxWidth:'90vw', height:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 60px rgba(0,0,0,0.2)' }}>

        {/* En-tête */}
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'#0f172a' }}>🚨 Signaler une absence</div>
            <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>Le conseiller pédagogique sera notifié pour assigner un remplaçant</div>
          </div>
          <button onClick={()=>setModalAbsence(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#64748b', lineHeight:1 }}>×</button>
        </div>

        {absenceEnvoyee ? (
          /* ── Confirmation ── */
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:40, textAlign:'center' }}>
            <div style={{ fontSize:52, marginBottom:16 }}>✅</div>
            <div style={{ fontSize:17, fontWeight:800, color:'#0f172a', marginBottom:8 }}>Demande envoyée au PA Advisor</div>
            <div style={{ fontSize:13, color:'#64748b', marginBottom:24, lineHeight:1.6 }}>
              Le conseiller pédagogique a été notifié. Il assignera un remplaçant dès que possible.<br/>
              Vous pouvez suivre l'avancement dans l'onglet <strong>Mes demandes</strong>.
            </div>
            <button onClick={()=>setModalAbsence(false)}
              style={{ background:BET, color:'#fff', border:'none', borderRadius:10, padding:'10px 28px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
              Fermer
            </button>
          </div>
        ) : (
          <>
            {/* Corps */}
            <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>

              {/* Motif */}
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Motif</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {MOTIFS_ABSENCE.map(m => (
                    <button key={m} onClick={()=>setFormAbsence(p=>({...p,motif:m}))}
                      style={{ padding:'7px 14px', borderRadius:20, fontSize:12, fontWeight:600, border:`1.5px solid ${formAbsence.motif===m?BET:'#e2e8f0'}`, background:formAbsence.motif===m?BET_LIGHT:'#fff', color:formAbsence.motif===m?BET_DARK:'#64748b', cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', transition:'all 0.15s' }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Période */}
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Période d'absence</div>
                <div style={{ display:'flex', gap:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, color:'#94a3b8', marginBottom:4 }}>Du</div>
                    <input type="date" value={formAbsence.dateDebut}
                      onChange={e=>{
                        const d = e.target.value;
                        setFormAbsence(p=>({...p, dateDebut:d, dateFin:p.dateFin<d?d:p.dateFin, sessionsIds:[]}));
                      }}
                      style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #e2e8f0', fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', boxSizing:'border-box', outline:'none' }} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, color:'#94a3b8', marginBottom:4 }}>Au</div>
                    <input type="date" value={formAbsence.dateFin} min={formAbsence.dateDebut}
                      onChange={e=>setFormAbsence(p=>({...p,dateFin:e.target.value,sessionsIds:[]}))}
                      style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #e2e8f0', fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', boxSizing:'border-box', outline:'none' }} />
                  </div>
                </div>
              </div>

              {/* Sessions dans la période */}
              {formAbsence.dateDebut && formAbsence.dateFin && (
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                      Sessions concernées
                      {sessionsDispos.length > 0 && (
                        <span style={{ marginLeft:8, fontSize:11, fontWeight:600, color:BET, background:BET_LIGHT, padding:'2px 8px', borderRadius:10 }}>
                          {nbSelectionnes}/{sessionsDispos.length} sélectionnée{sessionsDispos.length>1?'s':''}
                        </span>
                      )}
                    </div>
                    {sessionsDispos.length > 1 && (
                      <button onClick={selectionnerToutes}
                        style={{ fontSize:11, fontWeight:600, color:BET, background:'none', border:'none', cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                        {toutesSelectionnees ? 'Tout décocher' : 'Tout sélectionner'}
                      </button>
                    )}
                  </div>
                  {sessionsDispos.length === 0 ? (
                    <div style={{ background:'#f8fafc', borderRadius:10, padding:'14px 16px', fontSize:13, color:'#94a3b8', textAlign:'center', border:'1px dashed #e2e8f0' }}>
                      Aucune séance planifiée sur cette période
                    </div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      {sessionsDispos.map(s => {
                        const grp   = groupes.find(g => g.id === s.groupe_id);
                        const coche = formAbsence.sessionsIds.includes(s.id);
                        return (
                          <div key={s.id} onClick={()=>toggleSession(s.id)}
                            style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:10, border:`1.5px solid ${coche?BET:'#e2e8f0'}`, background:coche?BET_LIGHT:'#fff', cursor:'pointer', transition:'all 0.15s' }}>
                            <div style={{ width:18, height:18, borderRadius:5, border:`2px solid ${coche?BET:'#cbd5e1'}`, background:coche?BET:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s' }}>
                              {coche && <span style={{ color:'#fff', fontSize:11, fontWeight:900 }}>✓</span>}
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:13, fontWeight:600, color:'#0f172a' }}>{s.titre || grp?.nom || 'Séance'}</div>
                              <div style={{ fontSize:11, color:'#64748b' }}>
                                📅 {fmtDate(s.date_seance)} · ⏰ {s.heure_debut || '-'} · 👥 {grp?.nom || '-'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Message */}
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>
                  Message au PA Advisor <span style={{ fontWeight:400, textTransform:'none' }}>(optionnel)</span>
                </div>
                <textarea value={formAbsence.message} onChange={e=>setFormAbsence(p=>({...p,message:e.target.value}))}
                  placeholder="Précisez si besoin : durée estimée, préférence de remplaçant, consignes particulières…"
                  rows={3}
                  style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1.5px solid #e2e8f0', fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', resize:'vertical', boxSizing:'border-box', outline:'none' }} />
              </div>

            </div>

            {/* Pied */}
            <div style={{ padding:'14px 24px', borderTop:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <button onClick={()=>setModalAbsence(false)}
                style={{ background:'none', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:600, cursor:'pointer', color:'#64748b', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                Annuler
              </button>
              <button onClick={envoyerDemandeAbsence} disabled={!canSend || absenceEnvoi}
                style={{ background:canSend&&!absenceEnvoi?'#EF4444':'#e2e8f0', color:canSend&&!absenceEnvoi?'#fff':'#94a3b8', border:'none', borderRadius:8, padding:'9px 22px', fontSize:13, fontWeight:700, cursor:canSend&&!absenceEnvoi?'pointer':'not-allowed', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                {absenceEnvoi ? '⏳ Envoi…' : '🚨 Envoyer au PA Advisor'}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
})()}

      {/* ── Modal « Archive de mes apprenants » ──
          Monté HORS de l'onglet « Mes contrats » : un modal rendu à l'intérieur d'un
          onglet disparaît dès que l'onglet change, et ferme donc la fenêtre sous les
          doigts de celui qui la consulte. */}
      {showArchiveApprenants && (
        <div onClick={() => setShowArchiveApprenants(false)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(3px)", padding:16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:"#fff", borderRadius:18, width:"90vw", height:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 24px 64px rgba(0,0,0,0.28)", overflow:"hidden" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, padding:"18px 24px", borderBottom:"1px solid #e5e7eb" }}>
              <div>
                <div style={{ fontSize:17, fontWeight:900, color:"#0f172a" }}>📒 Archive de mes apprenants</div>
                <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>
                  Qui j'ai formé cette année, et pourquoi certains sont partis
                </div>
              </div>
              <button onClick={() => setShowArchiveApprenants(false)}
                style={{ background:"#f1f5f9", border:"none", borderRadius:10, width:34, height:34, fontSize:17, cursor:"pointer", color:"#475569", lineHeight:1, flexShrink:0 }}>
                ✕
              </button>
            </div>
            {/* `flex:1` + `minHeight:0` : sans eux, la hauteur fixe du modal est dépassée
                par un tableau long au lieu de le faire défiler ici. */}
            <div style={{ padding:"18px 24px 24px", overflowY:"auto", flex:1, minHeight:0 }}>
              <ArchiveApprenantsCoach
                coachId={MON_PROFIL_REEL?.id}
                coachNom={`${MON_PROFIL_REEL?.prenom || ""} ${MON_PROFIL_REEL?.nom || ""}`.trim()}
                accent={BET}
                authHdrs={() => ({ Authorization: `Bearer ${localStorage.getItem("coach_token") || localStorage.getItem("admin_token")}` })}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Confirmation générique ── */}
      {confirmModal.open && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(3px)" }}>
          <div style={{ background:"#fff", borderRadius:18, padding:"28px 32px", width:"90vw", maxWidth:460, maxHeight:"80vh", display:"flex", flexDirection:"column", boxShadow:"0 24px 64px rgba(0,0,0,0.28)" }}>
            <div style={{ fontSize:17, fontWeight:800, color:"#0f172a", marginBottom:8 }}>{confirmModal.title}</div>
            <p style={{ fontSize:13, color:"#64748b", margin:"0 0 26px", lineHeight:1.65, overflowY:"auto" }}>{confirmModal.message}</p>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", flexShrink:0 }}>
              <button onClick={closeConfirm}
                style={{ padding:"9px 22px", background:"#f1f5f9", color:"#64748b", border:"none", borderRadius:9, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                Annuler
              </button>
              <button onClick={()=>{ confirmModal.onConfirm && confirmModal.onConfirm(); closeConfirm(); }}
                style={{ padding:"9px 22px", background:confirmModal.confirmColor||"#dc2626", color:"#fff", border:"none", borderRadius:9, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                {confirmModal.confirmLabel||"Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

    {/* ── Modal Corbeille sessions ── */}
    {showCorbeille && (
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:9998, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ background:"#fff", borderRadius:16, padding:"24px 28px", width:"90vw", height:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.25)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:800, color:"#0f172a" }}>🗑️ Corbeille - sessions supprimées</div>
              <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>Les sessions dont la date n'est pas encore passée peuvent être restaurées.</div>
            </div>
            <button onClick={()=>setShowCorbeille(false)}
              style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#94a3b8" }}>✕</button>
          </div>
          <div style={{ flex:1, overflowY:"auto" }}>
            {corbeilleLoading ? (
              <div style={{ textAlign:"center", padding:30, color:"#94a3b8", fontSize:13 }}>Chargement…</div>
            ) : corbeilleList.length === 0 ? (
              <div style={{ textAlign:"center", padding:30, color:"#94a3b8", fontSize:13 }}>La corbeille est vide.</div>
            ) : (
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ background:"#f8fafc" }}>
                    {["Date","Heure","Groupe","Plateforme","Notes","Actions"].map(h => (
                      <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", borderBottom:"1px solid #e5e7eb" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {corbeilleList.map(s => {
                    const dateObj   = new Date(`${s.date}T${s.heure || "00:00"}`);
                    const isPast    = dateObj < new Date();
                    const dateLabel = dateObj.toLocaleDateString("fr-FR", { weekday:"short", day:"2-digit", month:"short", year:"numeric" });
                    const PLAT = { zoom:"🎥 Zoom", meet:"🟢 Meet", teams:"🟣 Teams", presentiel:"🏢 Présentiel", domicile:"🏠 Domicile", webex:"🔵 Webex" };
                    return (
                      <tr key={s.id} style={{ borderBottom:"1px solid #f1f5f9" }}>
                        <td style={{ padding:"10px 12px", fontSize:13, color:"#374151" }}>
                          {dateLabel}
                          {isPast && <span style={{ marginLeft:6, fontSize:10, background:"#fef3c7", color:"#92400e", borderRadius:4, padding:"1px 5px", fontWeight:600 }}>Passée</span>}
                        </td>
                        <td style={{ padding:"10px 12px", fontSize:13, color:"#374151" }}>{s.heure}{s.heure_fin ? ` – ${s.heure_fin}` : ""}</td>
                        <td style={{ padding:"10px 12px", fontSize:12, color:"#374151", fontWeight:600 }}>{s.groupes?.nom || "-"}</td>
                        <td style={{ padding:"10px 12px", fontSize:12, color:"#374151" }}>{PLAT[s.plateforme] || s.plateforme || "-"}</td>
                        <td style={{ padding:"10px 12px", fontSize:12, color:"#6b7280", maxWidth:160 }}>{s.notes || <span style={{ color:"#d1d5db" }}>-</span>}</td>
                        <td style={{ padding:"10px 12px", whiteSpace:"nowrap" }}>
                          {!isPast && (
                            <button onClick={()=>restoreSession(s.id)}
                              style={{ padding:"4px 10px", background:"#d1fae5", color:"#065f46", border:"1px solid #6ee7b7", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer", marginRight:6 }}>
                              ↩️ Restaurer
                            </button>
                          )}
                          <button disabled={!peut("classes","delete")} title={permBtnTitle("Supprimer définitivement",peut("classes","delete"))} onClick={()=>permanentDeleteSession(s.id)}
                            style={{ padding:"4px 10px", background: peut("classes","delete")?"#fee2e2":"#f1f5f9", color: peut("classes","delete")?"#dc2626":"#94a3b8", border:"1px solid #fca5a5", borderRadius:6, fontSize:11, fontWeight:700, cursor: peut("classes","delete")?"pointer":"not-allowed" }}>
                            {peut("classes","delete")?"🗑️ Supprimer":"🔒 Supprimer"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ marginTop:16, paddingTop:12, borderTop:"1px solid #f1f5f9", textAlign:"right" }}>
            <button onClick={()=>setShowCorbeille(false)}
              style={{ padding:"9px 20px", background:"#f1f5f9", color:"#374151", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    )}

      {/* ══ Modal vidéo Jitsi flottant (EspaceProfesseur /dash) ══ */}
      {modalVideoOuvert && salleOuverte && (() => {
        const session = liveSessions.find(s => s.id === salleOuverte) || sessionEnCours;
        if (!session) return null;
        const lien = session.lien || session.lien_visio || "";
        const isJitsi = lien.includes("jit.si") || lien.includes("meet.jit");
        if (!isJitsi && lien) return null;
        const salleJitsi = lien || `https://meet.jit.si/BET-${session.groupe_id || "session"}-${session.id}`;
        const _nbNonRensJitsi = apprenantsSalle.filter(a => !presencesLive[a.id] || presencesLive[a.id] === "non_renseigne").length;
        const _presOkJitsi = apprenantsSalle.length === 0 || _nbNonRensJitsi === 0;
        return (
          <div style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,0.82)", backdropFilter:"blur(6px)", display:"flex", flexDirection:"column" }}>
            {/* Header */}
            <div style={{ background:BET_GRAD, padding:"12px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0, flexWrap:"wrap", gap:10 }}>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ width:8, height:8, borderRadius:"50%", background:"#EF4444", boxShadow:"0 0 6px #EF4444" }}/>
                  <span style={{ fontSize:14, fontWeight:800, color:"#fff" }}>{session.titre}</span>
                </div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", marginTop:2 }}>⏰ {session.heure}{session.heure_fin ? ` – ${session.heure_fin}` : ""} · Jitsi</div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <button onClick={() => setModalVideoOuvert(false)}
                  style={{ padding:"6px 14px", borderRadius:8, border:"1px solid rgba(255,255,255,0.2)", background:"rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.7)", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  ⤓ Masquer
                </button>
                <button
                  disabled={!_presOkJitsi}
                  onClick={() => openConfirm("Clôturer la session", "Les présences seront sauvegardées.", () => { cloturerSalle(session); setModalVideoOuvert(false); })}
                  title={!_presOkJitsi ? `${_nbNonRensJitsi} présence(s) manquante(s) - renseignez la liste avant de clôturer` : "Clôturer la session"}
                  style={{ padding:"6px 14px", borderRadius:8, border:"none", background:_presOkJitsi?"rgba(239,68,68,0.8)":"#6b7280", color:"#fff", fontSize:12, fontWeight:700, cursor:_presOkJitsi?"pointer":"not-allowed", opacity:_presOkJitsi?1:0.7 }}>
                  {_presOkJitsi ? "⏹ Clôturer" : `⚠️ ${_nbNonRensJitsi} manquante(s)`}
                </button>
              </div>
            </div>
            {/* iFrame Jitsi */}
            <iframe src={salleJitsi} allow="camera; microphone; fullscreen; display-capture; autoplay"
              style={{ flex:1, border:"none", display:"block", background:"#0F172A" }} title="Session Live" />
          </div>
        );
      })()}

      <FooterSaaS couleurTheme={BET} />

      {/* Choix du surnom - `espace="coach"` : la route d'administration est fermee au coach,
          qui porte un `coach_token`. Voir MonProfilModal. */}
      <MonProfilModal
        ouvert={monProfilOuvert}
        onClose={() => setMonProfilOuvert(false)}
        onEnregistre={(v) => setSurnomPerso(v || "")}
        accent={BET}
        espace="coach"
      />
      </div>
    </div>
  );
}

/* ═══ STYLES ═══ */
const sidebarStyle    = { width:200, minWidth:200, background:"#0f172a", color:"#fff", padding:20, minHeight:"100vh" };
const sidebarItemStyle= { padding:11, marginBottom:7, borderRadius:8, cursor:"pointer", fontSize:12, color:"#fff" };
const card            = { background:"#fff", padding:24, boxShadow:"0 2px 8px rgba(0,0,0,0.05)" };
const tableStyle      = { width:"100%", borderCollapse:"collapse" };
const th              = { padding:"10px 12px", textAlign:"left", fontSize:12, color:"#6b7280", background:"#f9fafb", fontWeight:600 };
const td              = { padding:"10px 12px", fontSize:13, verticalAlign:"middle" };
const tabHeader       = { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 };
const tabTitle        = { margin:0, fontSize:17, fontWeight:700, color:"#0f172a" };
const tabSubtitle     = { margin:"3px 0 0", fontSize:12, color:"#9ca3af" };
const blockTitle      = { fontSize:14, fontWeight:700, color:"#0f172a" };
const btnPrimary      = { padding:"9px 16px", background:BET, color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 };
const btnSecondary    = { padding:"9px 16px", background:"#e5e7eb", color:"#374151", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 };
const btnGhost        = { padding:"5px 10px", background:"none", color:BET, border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 };
const btnIconEdit     = { padding:"5px 10px", background:"#e0f2fe", color:BET, border:`1px solid ${BET}40`, borderRadius:6, cursor:"pointer", fontSize:11, fontWeight:600 };
const btnIconToggle   = { padding:"4px 8px", background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:6, cursor:"pointer", fontSize:13 };
const btnIconDelete   = { padding:"4px 8px", background:"#fff1f2", border:"1px solid #fecdd3", borderRadius:6, cursor:"pointer", fontSize:13 };
const modalOverlay    = { position:"fixed", top:0, left:0, width:"100%", height:"100%", background:"rgba(0,0,0,0.5)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:1000 };
const modalBox        = { background:"#fff", padding:24, borderRadius:14, width:"90vw", maxWidth:"90vw" };
const inputSt         = { padding:9, marginBottom:10, width:"100%", borderRadius:6, border:"1px solid #d1d5db", boxSizing:"border-box", fontSize:13 };
const labelSt         = { display:"block", fontSize:12, fontWeight:600, color:"#374151", marginBottom:4 };