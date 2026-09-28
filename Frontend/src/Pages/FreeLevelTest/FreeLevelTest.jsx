import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../Footer/Footer";
import { insertTestNiveau } from "../../services/formsService";
import SEO from "../Components/SEO/SEO";
import { supabase } from "../../config/supabase";

/* ── Fonts & KF (inchangés) ───────────────────────────────── */
if (!document.querySelector("#flt-fonts")) {
  const l = document.createElement("link"); l.id = "flt-fonts"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&display=swap";
  document.head.appendChild(l);
}
if (!document.querySelector("#flt-kf")) {
  const s = document.createElement("style"); s.id = "flt-kf";
  s.textContent = `
    @keyframes fltFU   { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
    @keyframes fltFI   { from{opacity:0} to{opacity:1} }
    @keyframes fltSI   { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }
    @keyframes fltSpin { to{transform:rotate(360deg)} }
    @keyframes fltPulse{ 0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.35)} 60%{box-shadow:0 0 0 12px rgba(220,38,38,0)} }
    @keyframes fltBar  { from{width:0} to{width:var(--bw,100%)} }
    @keyframes fltCount{ from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    .flt-opt:hover { border-color:#ff2945 !important; background:#fff0f2 !important; color:#ff2945 !important; }
    .flt-share:hover { background:#0c33ac !important; color:#fff !important; border-color:#0c33ac !important; }
    .flt-profile-btn:hover { border-color:#ff2945 !important; background:#fff0f2 !important; color:#ff2945 !important; }
    @keyframes pmFU { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
    .pm-card:hover { transform:translateY(-4px)!important;box-shadow:0 16px 40px rgba(0,0,0,.12)!important; }
    .pm-assistant:hover { border-color:#0891b2!important;transform:translateY(-2px)!important; }
    .pm-centre:hover { border-color:#0c33ac!important;background:#eef1ff!important; }
    /* pm-grid2/pm-grid3 sont réutilisées ici mais leur règle mobile ne vit que dans
       ParcoursModal.jsx (id="pm-styles") - dupliquée ici pour que cette page soit
       responsive même quand ParcoursModal n'a jamais été monté. */
    @media (max-width: 540px) {
      .pm-grid2 { grid-template-columns: 1fr !important; }
      .pm-grid3 { grid-template-columns: 1fr !important; }
      .pm-assist-grid { grid-template-columns: 1fr !important; }
      .pm-centre-grid { grid-template-columns: 1fr !important; }
    }
    @media (max-width: 480px) {
      .flt-stepper { gap: 0 !important; }
      .flt-step-circle { width: 30px !important; height: 30px !important; font-size: .72rem !important; }
      .flt-step-label { font-size: .6rem !important; }
      .flt-step-line { width: 24px !important; }
      .flt-locked-panel { padding: 22px 18px 18px !important; }
      .flt-locked-panel h2 { font-size: 1rem !important; }
      .flt-locked-panel p { font-size: .76rem !important; }
    }
    @media (max-width: 560px) {
      .flt-header-inner { flex-wrap: wrap !important; row-gap: 6px !important; padding: 10px 16px !important; }
      .flt-header-title { font-size: .72rem !important; white-space: normal !important; }
      .flt-header-badge { font-size: .64rem !important; padding: 2px 9px !important; white-space: nowrap !important; }
    }
  `;
  document.head.appendChild(s);
}

/* ════════════════════════════════════════════════════════
   MÉTADONNÉES D'AFFICHAGE (les questions viennent toujours du
   test actif configuré par le staff - Super Admin / Admin /
   Agent Placement Test - via l'onglet "Test de niveau" de leur
   dashboard, jamais d'une banque codée en dur ici)
════════════════════════════════════════════════════════ */
const CEFR = {
  A1: { label:"Débutant",            color:"#64748b", bg:"#f8fafc", ring:"#e2e8f0", icon:"🌱", desc:"Compréhension d'expressions familières. Communication basique.", course:"Anglais Débutant A1→A2" },
  A2: { label:"Élémentaire",         color:"#d97706", bg:"#fefce8", ring:"#fde68a", icon:"🌿", desc:"Communication sur des sujets quotidiens et familiers.",          course:"Anglais Élémentaire A2→B1" },
  B1: { label:"Intermédiaire",       color:"#0c33ac", bg:"#eef1ff", ring:"#b3c4ff", icon:"🌳", desc:"Interaction courante. Compréhension des points essentiels.",      course:"Anglais Intermédiaire B1→B2" },
  B2: { label:"Inter. Supérieur",    color:"#7c3aed", bg:"#faf5ff", ring:"#ddd6fe", icon:"⭐", desc:"Compréhension de textes complexes. Expression fluide.",           course:"Préparation TOEIC / IELTS" },
  C1: { label:"Avancé",              color:"#059669", bg:"#f0fdf4", ring:"#bbf7d0", icon:"🏆", desc:"Expression efficace et flexible dans des contextes exigeants.",   course:"Anglais Expert C1→C2" },
  C2: { label:"Maîtrise",            color:"#ff2945", bg:"#fff0f2", ring:"#ffb3bc", icon:"👑", desc:"Compréhension et expression parfaites - niveau bilingue.",        course:"Perfectionnement & Accent" },
};

const CAT = {
  "Grammaire":     { bg:"#eef1ff", c:"#0c33ac", dot:"#3355cc" },
  "Vocabulaire":   { bg:"#fefce8", c:"#92400e", dot:"#f59e0b" },
  "Compréhension": { bg:"#f0fdf4", c:"#065f46", dot:"#10b981" },
  "Listening":     { bg:"#fdf2f8", c:"#9d174d", dot:"#ec4899" },
  "Reading":       { bg:"#e0f2fe", c:"#075985", dot:"#0ea5e9" },
  "Speaking":      { bg:"#fff7ed", c:"#9a3412", dot:"#f97316" },
  "Orthographe":   { bg:"#ede9fe", c:"#5b21b6", dot:"#8b5cf6" },
  "Expression":    { bg:"#fee2e2", c:"#cc1530", dot:"#ef4444" },
};

const Q_TYPE_LABEL = {
  qcm:         { icon:"🎯", label:"QCM" },
  vrai_faux:   { icon:"✅", label:"Vrai / Faux" },
  texte_trous: { icon:"✏️", label:"Texte à trous" },
  audio_qcm:   { icon:"🎧", label:"Listening" },
  lecture_qcm: { icon:"📖", label:"Reading" },
  libre:       { icon:"💬", label:"Expression libre" },
  speaking:    { icon:"🎙️", label:"Speaking" },
};

/* ════════════════════════════════════════════════════════
   FORMAT INFOS
════════════════════════════════════════════════════════ */
const FORMAT_INFO = {
  mixte:    { icon:"🔀", label:"Test Mixte",  color:"#0c33ac", bg:"#eef1ff", desc:"Grammaire · Vocabulaire · Compréhension",              scored:true  },
  reading:  { icon:"📖", label:"Reading",     color:"#075985", bg:"#e0f2fe", desc:"Compréhension de textes écrits",                        scored:true  },
  writing:  { icon:"✍️", label:"Writing",     color:"#6d28d9", bg:"#faf5ff", desc:"Expression écrite - résultat sous 24h après correction", scored:false },
  speaking: { icon:"🎤", label:"Speaking",    color:"#ff2945", bg:"#fff1f2", desc:"Expression orale - résultat sous 24h après correction",  scored:false },
  listening:{ icon:"🎧", label:"Listening",   color:"#9d174d", bg:"#fdf2f8", desc:"Compréhension orale",                                   scored:true  },
};

/* ════════════════════════════════════════════════════════
   TEXTES D'INSTRUCTIONS / EXEMPLE - un écran "Comment ça
   marche" + un exemple non noté avant chaque nouvelle
   catégorie de questions, par type d'exercice (l'interaction
   dépend du type, pas de la catégorie).
════════════════════════════════════════════════════════ */
const TYPE_INTRO = {
  qcm: {
    how: [
      { icon:"✅", en:"A few multiple-choice questions. Tap the best answer.", fr:"Quelques questions à choix multiple. Touchez la meilleure réponse." },
      { icon:"⏱️", en:"Each question is timed. Don't overthink it.", fr:"Chaque question est chronométrée. Ne réfléchissez pas trop." },
      { icon:"➡️", en:"When you answer, you move straight to the next one.", fr:"Quand vous répondez, vous passez directement à la suivante." },
      { icon:"🤔", en:"We won't tell you if you're right or wrong. That's normal.", fr:"Nous ne dirons pas si c'est juste ou faux. C'est normal." },
    ],
    warning: null,
    sample: { kind:"qcm", q:"She ___ a teacher.", opts:["is","are","am"], sel:0,
      note:{ en:"Here, “is” is chosen. In the real test, tapping an answer moves you on.", fr:"Ici, « is » est sélectionné. Dans le vrai test, toucher une réponse vous fait avancer." } },
  },
  vrai_faux: {
    how: [
      { icon:"✅", en:"A statement is shown. Decide if it's True or False.", fr:"Une affirmation est affichée. Décidez si elle est Vraie ou Fausse." },
      { icon:"⏱️", en:"Each question is timed. Go with your first instinct.", fr:"Chaque question est chronométrée. Fiez-vous à votre premier instinct." },
      { icon:"➡️", en:"Tapping an answer moves you straight to the next question.", fr:"Toucher une réponse vous fait passer directement à la question suivante." },
    ],
    warning: null,
    sample: { kind:"vf", q:"Water boils at 100°C.", sel:"Vrai",
      note:{ en:"Here, “Vrai” (True) is chosen. In the real test, tapping an answer moves you on.", fr:"Ici, « Vrai » est sélectionné. Dans le vrai test, toucher une réponse vous fait avancer." } },
  },
  texte_trous: {
    how: [
      { icon:"✏️", en:"A sentence is missing a word. Type the correct word in the blank.", fr:"Il manque un mot dans une phrase. Tapez le mot correct dans le blanc." },
      { icon:"⌨️", en:"Spelling counts - write it exactly as it should appear.", fr:"L'orthographe compte - écrivez-le exactement comme il doit apparaître." },
      { icon:"➡️", en:"Tap “Next” when you're done answering.", fr:"Touchez « Suivant » une fois votre réponse saisie." },
    ],
    warning: null,
    sample: { kind:"trous", q:"I ___ (to be) very happy today.", val:"am",
      note:{ en:"Here, “am” is typed in the blank. Write your own answer in the real test.", fr:"Ici, « am » est saisi dans le blanc. Écrivez votre propre réponse dans le vrai test." } },
  },
  audio_qcm: {
    how: [
      { icon:"🎧", en:"Listen to a short audio clip - replay it as many times as you like before answering.", fr:"Écoutez un court extrait audio - réécoutez-le autant de fois que vous voulez avant de répondre." },
      { icon:"✅", en:"Then answer a multiple-choice question about what you heard.", fr:"Puis répondez à une question à choix multiple sur ce que vous avez entendu." },
      { icon:"⏱️", en:"Each question is timed once you start answering.", fr:"Chaque question est chronométrée une fois que vous commencez à répondre." },
    ],
    warning: null,
    sample: { kind:"qcm", audio:true, q:"What is the woman's job?", opts:["A teacher","A doctor","An engineer"], sel:0,
      note:{ en:"Listen first, then tap the best answer - just like in the real test.", fr:"Écoutez d'abord, puis touchez la meilleure réponse - comme dans le vrai test." } },
  },
  lecture_qcm: {
    how: [
      { icon:"📖", en:"Read a short passage carefully.", fr:"Lisez attentivement un court texte." },
      { icon:"✅", en:"Then answer a multiple-choice question about it.", fr:"Puis répondez à une question à choix multiple à ce sujet." },
      { icon:"⏱️", en:"Take your time reading, but answer honestly once you start.", fr:"Prenez le temps de lire, mais répondez honnêtement une fois que vous commencez." },
    ],
    warning: null,
    sample: { kind:"qcm", passage:"Sarah works at a hospital. She helps sick people every day and wears a white coat.", q:"Where does Sarah work?", opts:["At a hospital","At a school","At a bank"], sel:0,
      note:{ en:"Read the passage, then tap the best answer - just like in the real test.", fr:"Lisez le texte, puis touchez la meilleure réponse - comme dans le vrai test." } },
  },
  libre: {
    how: [
      { icon:"✍️", en:"Write your answer in English, in your own words.", fr:"Rédigez votre réponse en anglais, avec vos propres mots." },
      { icon:"👩‍🏫", en:"This part is corrected manually by our team - no instant score.", fr:"Cette partie est corrigée manuellement par notre équipe - pas de score instantané." },
      { icon:"🌐", en:"No internet searches, dictionary, or translator.", fr:"Aucune recherche internet, dictionnaire ou traducteur." },
    ],
    warning: null,
    sample: { kind:"libre", q:"Describe your daily routine in 2–3 sentences.", val:"I wake up at 6am. I have breakfast, then I go to work by bus.",
      note:{ en:"Write a few honest sentences - length and accuracy both matter.", fr:"Écrivez quelques phrases honnêtes - la longueur et la justesse comptent toutes les deux." } },
  },
  speaking: {
    how: [
      { icon:"🎙️", en:"Find a quiet place. You will need to speak out loud.", fr:"Trouvez un endroit calme. Vous devrez parler à voix haute." },
      { icon:"🎧", en:"Check your microphone and sound before you begin.", fr:"Vérifiez votre micro et le son avant de commencer." },
      { icon:"⏱️", en:"Each part is timed. Answer as honestly as you can.", fr:"Chaque partie est chronométrée. Répondez le plus honnêtement possible." },
    ],
    warning: { en:"Speak clearly and try to say as much as you can - up to 2 minutes per recording.", fr:"Parlez clairement et essayez d'en dire le plus possible - jusqu'à 2 minutes par enregistrement." },
    sample: { kind:"speaking",
      note:{ en:"In the real test, tap the microphone to start recording your answer.", fr:"Dans le vrai test, touchez le micro pour démarrer l'enregistrement de votre réponse." } },
  },
};

/* ── Progress bar ──────────────────────────────────────── */
const PBar = ({ value, max, color = "#ff2945", height = 8 }) => (
  <div style={{ height, background:"#f1f5f9", borderRadius:4, overflow:"hidden" }}>
    <div style={{ height:"100%", width:`${Math.round((value/max)*100)}%`, background:`linear-gradient(90deg,${color},${color}bb)`, borderRadius:4, transition:"width .6s ease" }} />
  </div>
);

/* ── Stepper ───────────────────────────────────────────── */
const Stepper = ({ current, alreadyAssigned }) => {
  const steps = [
    {n:1, l:"Vos infos"},
    {n:2, l: alreadyAssigned ? "Projet ✓" : "Votre projet"},
    {n:3, l:"Le test"},
    {n:4, l:"Résultats"},
  ];
  // Si conseillère déjà assignée, traiter le step 2 comme validé dès le début
  const effectiveCurrent = alreadyAssigned && current <= 2 ? 3 : current;
  return (
    <div className="flt-stepper" style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:0, marginBottom:40 }}>
      {steps.map((s, i) => {
        const done    = effectiveCurrent > s.n;
        const active  = effectiveCurrent === s.n;
        return (
          <React.Fragment key={s.n}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
              <div className="flt-step-circle" style={{
                width:40, height:40, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
                fontWeight:800, fontSize:".88rem", transition:"all .3s",
                background: done ? "#10b981" : active ? "linear-gradient(135deg,#ff2945,#0c33ac)" : "#f1f5f9",
                color: (done || active) ? "#fff" : "#94a3b8",
                boxShadow: active ? "0 4px 14px rgba(220,38,38,.35)" : "none",
              }}>
                {done ? "✓" : s.n}
              </div>
              <span className="flt-step-label" style={{ fontSize:".72rem", fontWeight: active ? 700 : 500, color: active ? "#ff2945" : done ? "#10b981" : "#94a3b8", whiteSpace:"nowrap" }}>
                {s.l}
              </span>
            </div>
            {i < 3 && <div className="flt-step-line" style={{ width:48, height:2, background: done ? "#10b981" : "#e2e8f0", margin:"0 4px 20px", transition:"background .4s" }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/* ════════════════════════════════════════════════════════
   MAIN
════════════════════════════════════════════════════════ */
const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5001";

/* Les profils qu'un lien d'invitation peut transmettre. On ne verrouille QUE sur une de ces
   valeurs : un parametre inattendu laisserait sinon le selecteur fige sur rien, donc bloquant. */
const PROFILS_CONNUS = ["particulier", "etudiant", "professionnel", "enfant"];

/* ────────────────────────────────────────────────────────
   COMPOSANT : Enregistreur audio (questions Speaking)
──────────────────────────────────────────────────────── */
function AudioRecorder({ onRecordingComplete, existingUrl }) {
  const [phase, setPhase]     = React.useState(existingUrl ? "done" : "idle");
  const [seconds, setSeconds] = React.useState(0);
  const [blobUrl, setBlobUrl] = React.useState(existingUrl || null);
  const [error, setError]     = React.useState("");
  const mrRef    = React.useRef(null);
  const chunksRef = React.useRef([]);
  const timerRef  = React.useRef(null);
  const MAX_SECONDS = 120;

  React.useEffect(() => () => {
    clearInterval(timerRef.current);
    if (mrRef.current?.state === "recording") mrRef.current.stop();
  }, []);

  const startRecording = async () => {
    setError("");
    setPhase("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      chunksRef.current = [];
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find(m => MediaRecorder.isTypeSupported(m)) || "";
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mrRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(timerRef.current);
        const blob = new Blob(chunksRef.current, { type: mimeType.split(";")[0] || "audio/webm" });
        const localUrl = URL.createObjectURL(blob);
        setBlobUrl(localUrl);
        setPhase("uploading");
        try {
          const fd = new FormData();
          fd.append("file", blob, "recording.webm");
          const r = await fetch(`${API_BASE}/api/upload/recording`, { method:"POST", body:fd });
          const d = await r.json();
          if (r.ok && d.url) { setBlobUrl(d.url); onRecordingComplete(d.url); setPhase("done"); }
          else { setError(d.error || "Erreur lors de l'envoi"); setPhase("error"); }
        } catch { setError("Erreur réseau - vérifiez votre connexion"); setPhase("error"); }
      };
      mr.start(500);
      setPhase("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds(s => {
          if (s + 1 >= MAX_SECONDS) { clearInterval(timerRef.current); mr.stop(); }
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      setError(e.name === "NotAllowedError"
        ? "Accès au microphone refusé. Autorisez le micro dans les paramètres de votre navigateur."
        : "Microphone non disponible sur cet appareil.");
      setPhase("error");
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    if (mrRef.current?.state === "recording") mrRef.current.stop();
  };

  const reRecord = () => {
    if (blobUrl?.startsWith("blob:")) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null); setSeconds(0); setError(""); setPhase("idle");
    onRecordingComplete(null);
  };

  const fmtT = (s) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const baseBox = { borderRadius:14, padding:"18px 20px", marginBottom:18, textAlign:"center" };

  if (phase === "idle" || phase === "requesting" || phase === "error") return (
    <div style={{ ...baseBox, background:"linear-gradient(135deg,#f0fdf4,#dcfce7)", border:"1.5px solid #86efac" }}>
      <p style={{ fontSize:".88rem", color:"#166534", fontWeight:600, marginBottom:14 }}>
        🎙️ <strong>Enregistrez votre réponse orale</strong>
        <span style={{ display:"block", fontWeight:400, fontSize:".81rem", color:"#4b5563", marginTop:4 }}>
          Cliquez sur le micro et répondez à voix haute en anglais. Maximum 2 minutes.
        </span>
      </p>
      {error && (
        <div style={{ background:"#fee2e2", border:"1px solid #ffb3bc", borderRadius:8, padding:"8px 12px", marginBottom:12, fontSize:".81rem", color:"#b91c1c" }}>
          ⚠️ {error}
          <div style={{ fontSize:".76rem", color:"#6b7280", marginTop:4 }}>Passez à la question suivante si le micro est indisponible.</div>
        </div>
      )}
      <button onClick={startRecording} disabled={phase === "requesting"}
        style={{ width:72, height:72, borderRadius:"50%", border:"none", background:phase==="requesting"?"#d1fae5":"#22c55e",
          color:"#fff", fontSize:"1.8rem", cursor:phase==="requesting"?"default":"pointer",
          boxShadow:"0 4px 20px rgba(34,197,94,.35)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto", transition:"all .2s" }}>
        {phase === "requesting" ? "⏳" : "🎙️"}
      </button>
      {phase === "requesting" && <p style={{ fontSize:".79rem", color:"#6b7280", marginTop:10 }}>Autorisation du microphone…</p>}
    </div>
  );

  if (phase === "recording") return (
    <div style={{ ...baseBox, background:"linear-gradient(135deg,#fff1f2,#fee2e2)", border:"1.5px solid #fca5a5" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, marginBottom:12 }}>
        <div style={{ width:12, height:12, borderRadius:"50%", background:"#ff2945", animation:"fltPulse 1.2s ease infinite" }} />
        <span style={{ fontSize:"1rem", fontWeight:800, color:"#ff2945" }}>Enregistrement • {fmtT(seconds)}</span>
        <span style={{ fontSize:".77rem", color:"#9ca3af" }}>/ {fmtT(MAX_SECONDS)} max</span>
      </div>
      <div style={{ height:6, background:"#ffb3bc", borderRadius:3, marginBottom:16, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${(seconds/MAX_SECONDS)*100}%`, background:"#ff2945", borderRadius:3, transition:"width .8s" }} />
      </div>
      <button onClick={stopRecording} style={{ padding:"12px 28px", background:"#ff2945", color:"#fff", border:"none", borderRadius:12, fontWeight:700, fontSize:".94rem", cursor:"pointer", boxShadow:"0 4px 16px rgba(220,38,38,.3)" }}>
        ⏹ Arrêter l'enregistrement
      </button>
      <p style={{ fontSize:".77rem", color:"#9ca3af", marginTop:10 }}>Arrêt automatique après 2 minutes</p>
    </div>
  );

  if (phase === "uploading") return (
    <div style={{ ...baseBox, background:"linear-gradient(135deg,#f0fdf4,#dcfce7)", border:"1.5px solid #86efac" }}>
      <div style={{ width:36, height:36, borderRadius:"50%", border:"3px solid rgba(34,197,94,.2)", borderTopColor:"#22c55e", animation:"fltSpin .8s linear infinite", margin:"0 auto 12px" }} />
      <p style={{ fontSize:".88rem", color:"#166534", fontWeight:600 }}>Envoi de l'enregistrement…</p>
      {blobUrl && <audio controls src={blobUrl} style={{ width:"100%", marginTop:10, borderRadius:8 }} />}
    </div>
  );

  return (
    <div style={{ ...baseBox, background:"linear-gradient(135deg,#f0fdf4,#dcfce7)", border:"1.5px solid #86efac" }}>
      <p style={{ fontSize:".88rem", color:"#166534", fontWeight:700, marginBottom:10 }}>✅ Réponse enregistrée</p>
      {blobUrl && <audio controls src={blobUrl} crossOrigin="anonymous" style={{ width:"100%", marginBottom:12, borderRadius:8 }} />}
      <button onClick={reRecord} style={{ padding:"8px 18px", background:"#fff", border:"1.5px solid #86efac", borderRadius:8, color:"#166534", fontWeight:600, fontSize:".84rem", cursor:"pointer" }}>
        🔄 Ré-enregistrer
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────
   Petits blocs UI partagés - instructions bilingues EN/FR
──────────────────────────────────────────────────────── */
const introCardStyle = { background:"#fff", border:"1px solid #e2e8f0", borderRadius:20, overflow:"hidden", width:"100%", maxWidth:700, boxShadow:"0 4px 24px rgba(0,0,0,.07)", animation:"fltSI .35s ease" };
const introBodyStyle = { padding:"26px 28px 30px" };

function BiLine({ icon, en, fr, tone = "muted" }) {
  const tones = {
    muted:   { bg:"#f8fafc", border:"#f1f5f9" },
    warning: { bg:"#fee2e2", border:"#fecaca" },
  };
  const t = tones[tone] || tones.muted;
  return (
    <div style={{ display:"flex", gap:12, alignItems:"flex-start", background:t.bg, border:`1px solid ${t.border}`, borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
      {icon && <span style={{ fontSize:"1.15rem", flexShrink:0, lineHeight:1.4 }}>{icon}</span>}
      <div>
        <div style={{ fontSize:".92rem", fontWeight:600, color: tone==="warning" ? "#b91c1c" : "#0f172a", lineHeight:1.55 }}>{en}</div>
        <div style={{ fontSize:".82rem", fontStyle:"italic", color: tone==="warning" ? "#b91c1c99" : "#94a3b8", marginTop:3, lineHeight:1.5 }}>{fr}</div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────
   ÉCRAN 1/2 - Règles d'intégrité (une seule fois, avant la
   toute première section du test)
──────────────────────────────────────────────────────── */
function IntegrityGate({ onContinue }) {
  return (
    <div style={introCardStyle}>
      <div style={{ background:"linear-gradient(135deg,#011451,#0c33ac)", padding:"26px 28px", textAlign:"center" }}>
        <div style={{ fontSize:"2rem", marginBottom:8 }}>🛡️</div>
        <h2 style={{ fontFamily:"'Montserrat','Segoe UI',sans-serif", color:"#fff", fontSize:"1.3rem", fontWeight:800, margin:"0 0 4px" }}>Before you begin</h2>
        <p style={{ color:"rgba(255,255,255,.65)", fontSize:".84rem", fontStyle:"italic", margin:0 }}>Avant de commencer</p>
      </div>
      <div style={introBodyStyle}>
        <BiLine icon="🌐" en={<><strong>No internet searches</strong> · Aucune recherche internet</>} fr="Do not search for answers in a browser, dictionary, or online translator. N'utilisez pas de navigateur, dictionnaire ou traducteur en ligne." />
        <BiLine icon="📝" en={<><strong>Your own words only</strong> · Vos propres mots uniquement</>} fr="All responses must come from your own knowledge and ability. Toutes les réponses doivent venir de vos propres connaissances et capacités." />
        <BiLine icon="🚫" en={<><strong>No AI tools</strong> · Aucun outil d'IA</>} fr="Do not use ChatGPT or any other AI assistant to answer. N'utilisez pas ChatGPT ni aucun autre assistant IA pour répondre." />
        <BiLine tone="warning" en="Using any form of external assistance invalidates your results and misrepresents your true level."
          fr="L'utilisation d'une aide extérieure invalide vos résultats et ne reflète pas votre vrai niveau." />
        <button onClick={onContinue} style={{ width:"100%", marginTop:8, padding:"15px", background:"#0c33ac", color:"#fff", border:"none", borderRadius:12, fontWeight:800, fontSize:".95rem", cursor:"pointer", boxShadow:"0 4px 16px rgba(12,51,172,.3)" }}>
          I UNDERSTAND - I WILL NOT CHEAT
        </button>
        <p style={{ textAlign:"center", fontSize:".78rem", fontStyle:"italic", color:"#94a3b8", margin:"10px 0 0" }}>Je comprends - je ne tricherai pas</p>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────
   ÉCRAN 2/2 - Instructions + exemple non noté, avant chaque
   nouvelle catégorie de questions
──────────────────────────────────────────────────────── */
function SampleQcmCard({ sample }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:16, padding:"20px 22px" }}>
      {sample.audio && (
        <div style={{ background:"linear-gradient(135deg,#fdf2f8,#fce7f3)", border:"1.5px solid #f9a8d4", borderRadius:12, padding:"10px 14px", marginBottom:14, fontSize:".82rem", color:"#9d174d", fontWeight:600 }}>
          🎧 (Example audio)
        </div>
      )}
      {sample.passage && (
        <div style={{ background:"#f0f9ff", border:"1.5px solid #bae6fd", borderRadius:12, padding:"12px 14px", marginBottom:14, fontSize:".84rem", color:"#0369a1" }}>
          📖 {sample.passage}
        </div>
      )}
      <div style={{ fontSize:".78rem", color:"#94a3b8", fontWeight:700, marginBottom:6 }}>QUESTION 1 / 5</div>
      <div style={{ fontSize:"1.15rem", fontWeight:700, color:"#0f172a", marginBottom:18 }}>{sample.q}</div>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {sample.opts.map((opt, i) => (
          <div key={opt} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 18px", borderRadius:12, background: i===sample.sel ? "#0c33ac" : "#eef1ff", color: i===sample.sel ? "#fff" : "#0c33ac", fontWeight:700 }}>
            <span style={{ width:26, height:26, borderRadius:"50%", background: i===sample.sel ? "rgba(255,255,255,.25)" : "rgba(12,51,172,.12)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:".78rem", flexShrink:0 }}>{["A","B","C","D"][i]}</span>
            {opt}
          </div>
        ))}
      </div>
    </div>
  );
}

function SampleVfCard({ sample }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:16, padding:"20px 22px" }}>
      <div style={{ fontSize:"1.15rem", fontWeight:700, color:"#0f172a", marginBottom:18 }}>{sample.q}</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {["Vrai","Faux"].map(opt => (
          <div key={opt} style={{ textAlign:"center", padding:"14px", borderRadius:12, background: opt===sample.sel ? "#0c33ac" : "#eef1ff", color: opt===sample.sel ? "#fff" : "#0c33ac", fontWeight:700 }}>{opt}</div>
        ))}
      </div>
    </div>
  );
}

function SampleTrousCard({ sample }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:16, padding:"20px 22px" }}>
      <div style={{ fontSize:"1.15rem", fontWeight:700, color:"#0f172a", marginBottom:18 }}>{sample.q}</div>
      <div style={{ padding:"13px 16px", borderRadius:10, border:"2px solid #0c33ac", background:"#eef1ff", color:"#0c33ac", fontWeight:700, display:"inline-block", minWidth:100 }}>{sample.val}</div>
    </div>
  );
}

function SampleLibreCard({ sample }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:16, padding:"20px 22px" }}>
      <div style={{ fontSize:"1.15rem", fontWeight:700, color:"#0f172a", marginBottom:14 }}>{sample.q}</div>
      <div style={{ padding:"14px 16px", borderRadius:10, border:"1.5px solid #e2e8f0", background:"#f8fafc", color:"#334155", fontSize:".9rem", lineHeight:1.6 }}>{sample.val}</div>
    </div>
  );
}

function SampleSpeakingCard() {
  return (
    <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:16, padding:"30px 22px", textAlign:"center" }}>
      <div style={{ width:100, height:100, borderRadius:"50%", background:"#fff0f2", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px" }}>
        <div style={{ width:64, height:64, borderRadius:14, background:"#ff2945", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.6rem", color:"#fff" }}>🎙️</div>
      </div>
      <div style={{ fontSize:"1.8rem", fontWeight:900, color:"#0f172a", marginBottom:6 }}>2:00</div>
      <p style={{ fontSize:".82rem", color:"#94a3b8", margin:"0 0 4px" }}>The timer counts down while you speak.</p>
      <p style={{ fontSize:".78rem", fontStyle:"italic", color:"#cbd5e1", margin:0 }}>Le minuteur décompte pendant que vous parlez.</p>
    </div>
  );
}

const SAMPLE_RENDERERS = { qcm:SampleQcmCard, vf:SampleVfCard, trous:SampleTrousCard, libre:SampleLibreCard, speaking:SampleSpeakingCard };

// Instructions + exemple fusionnés sur un seul écran (un seul bouton "Commencer") - au lieu
// de deux onglets séparés nécessitant 2 clics avant chaque section du test.
function SectionIntro({ category, type, sectionIndex, totalSections, onStart }) {
  const meta = TYPE_INTRO[type] || TYPE_INTRO.qcm;
  const typeMeta = Q_TYPE_LABEL[type] || Q_TYPE_LABEL.qcm;
  const SampleRenderer = SAMPLE_RENDERERS[meta.sample?.kind] || SampleQcmCard;

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
        <span style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"7px 16px", borderRadius:999, background:"#0c33ac", color:"#fff", fontWeight:800, fontSize:".85rem" }}>
          {typeMeta.icon} {category.toUpperCase()} <span style={{ background:"rgba(255,255,255,.25)", borderRadius:999, padding:"1px 8px", fontSize:".75rem" }}>{sectionIndex+1}/{totalSections}</span>
        </span>
        <span style={{ fontSize:".82rem", fontStyle:"italic", color:"#94a3b8" }}>{category}</span>
      </div>

      <div style={introCardStyle}>
        <div style={introBodyStyle}>
          <h2 style={{ fontFamily:"'Montserrat','Segoe UI',sans-serif", color:"#011451", fontSize:"1.25rem", fontWeight:800, margin:"0 0 2px" }}>How this part works</h2>
          <p style={{ color:"#94a3b8", fontSize:".82rem", fontStyle:"italic", margin:"0 0 18px" }}>Comment fonctionne cette partie</p>

          {meta.how.map((h, i) => <BiLine key={i} icon={h.icon} en={h.en} fr={h.fr} />)}
          {meta.warning && <BiLine tone="warning" en={meta.warning.en} fr={meta.warning.fr} />}

          <div style={{ marginTop:20, paddingTop:20, borderTop:"1px solid #f1f5f9" }}>
            <span style={{ display:"inline-block", background:"#eef1ff", color:"#0c33ac", fontWeight:700, fontSize:".76rem", borderRadius:999, padding:"4px 12px", marginBottom:4 }}>
              Example only - not scored
            </span>
            <p style={{ fontSize:".78rem", fontStyle:"italic", color:"#94a3b8", margin:"4px 0 18px" }}>Exemple seulement - non noté</p>

            <SampleRenderer sample={meta.sample} />

            {meta.sample?.note && (
              <p style={{ textAlign:"center", fontSize:".84rem", color:"#64748b", lineHeight:1.6, margin:"16px 0 0" }}>
                {meta.sample.note.en}
                <span style={{ display:"block", fontStyle:"italic", fontSize:".8rem", color:"#94a3b8", marginTop:3 }}>{meta.sample.note.fr}</span>
              </p>
            )}
          </div>

          <button onClick={onStart} style={{ width:"100%", marginTop:22, padding:"15px", background: type==="speaking" ? "#ff2945" : "#0c33ac", color:"#fff", border:"none", borderRadius:12, fontWeight:800, fontSize:".95rem", cursor:"pointer", boxShadow: type==="speaking" ? "0 4px 16px rgba(255,41,69,.3)" : "0 4px 16px rgba(12,51,172,.3)" }}>
            START THE {category.toUpperCase()} TEST
          </button>
          <p style={{ textAlign:"center", fontSize:".78rem", fontStyle:"italic", color:"#94a3b8", margin:"10px 0 0" }}>Commencer - {category}</p>
        </div>
      </div>
    </div>
  );
}

export default function FreeLevelTest({ questions: propQ }) {
  const navigate  = useNavigate();

  const [activeTest,   setActiveTest]   = useState(null);
  const [loadingTest,  setLoadingTest]  = useState(true);

  // Charger le test actif depuis l'API au montage
  useEffect(() => {
    fetch(`${API_BASE}/api/level-tests/actif`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.test) setActiveTest(d.test); })
      .catch(() => {})
      .finally(() => setLoadingTest(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Format : dérivé du test actif (configuré par l'admin), sinon "mixte"
  const format = activeTest?.format_test || activeTest?.format || "mixte";
  const fmtInfo = FORMAT_INFO[format] || FORMAT_INFO.mixte;
  // Writing et Speaking : résultat donné par l'assistante après correction
  const needsManualCorrection = format === "writing" || format === "speaking";

  // Questions : uniquement le test réellement configuré par le staff (Super Admin /
  // Admin / Agent Placement Test, onglet "Test de niveau" de leur dashboard) - plus
  // aucune banque codée en dur ici. Si le test actif n'a pas de questions, on
  // l'affiche clairement (voir écran "aucun test disponible" plus bas) plutôt que
  // de servir un contenu fictif à l'insu du candidat.
  const activeQuestions = activeTest?.level_questions?.filter(q => q.actif !== false).sort((a,b) => (a.ordre||0)-(b.ordre||0));
  // Regroupées par catégorie (ordre de 1ère apparition dans la config staff) pour que
  // chaque catégorie forme une "section" cohérente avec ses propres instructions -
  // sinon des catégories entrecoupées feraient réapparaître l'écran d'instructions
  // à chaque bascule si l'ordre configuré les mélange.
  const questions = React.useMemo(() => {
    const questionsRaw = propQ || activeQuestions || [];
    const order = [];
    questionsRaw.forEach(q => { if (q?.category && !order.includes(q.category)) order.push(q.category); });
    return [...questionsRaw].sort((a,b) => order.indexOf(a.category) - order.indexOf(b.category));
  }, [propQ, activeQuestions]);
  const sections = React.useMemo(() => {
    const order = [];
    questions.forEach(q => { if (q?.category && !order.includes(q.category)) order.push(q.category); });
    return order;
  }, [questions]);
  const noTestAvailable = !loadingTest && questions.length === 0;

  const testParams = activeTest?.params || {};
  const totalPts  = questions.reduce((s, q) => s + (q.points || 1), 0);

  const [step,         setStep]       = useState("form");
  const [formData,     setFormData]   = useState({ fullname:"", email:"", phone:"", consent:false, profile:"particulier", centre_id:"", commercial_id:"" });
  const [emailFromUrl, setEmailFromUrl] = useState(false);
  // Dossier précis (assignations_parcours) transmis dans le lien de test - quand présent, le
  // résultat se rattache uniquement à CE dossier, jamais par email (indispensable quand parent
  // et enfant partagent le même email/téléphone).
  const [assignationIdFromUrl, setAssignationIdFromUrl] = useState(null);
  /* Demande de transfert (demandes_transfert) transmise dans le lien : un apprenant DÉJÀ en
     classe qu'un coach demande de transférer, et que l'agent placement test doit faire tester.
     Il n'a pas d'`assignation_id` - cette notion appartient au parcours d'un prospect - et le
     mur de connexion le bloquait donc net. Pire : s'il ouvrait le lien depuis un poste où un
     autre compte était connecté, il se retrouvait à passer le test sous cette identité-là. */
  const [demandeIdFromUrl, setDemandeIdFromUrl] = useState(null);
  // Profil transmis par le lien : le sélecteur « Vous êtes » devient alors une information
  // affichée, plus un choix - on ne redemande pas ce qu'on sait déjà.
  const [profilVerrouille, setProfilVerrouille] = useState(null);
  // Lien d'invitation émis par le staff (email + dossier précis, de parcours OU de transfert) :
  // autorise à sauter le mur de connexion, le destinataire étant déjà identifié par le lien.
  const hasInviteContext = !!(emailFromUrl && (assignationIdFromUrl || demandeIdFromUrl));
  const [formErrors,   setFormErrors] = useState({});
  // Étape "Votre projet" - wizard style ParcoursModal
  const [pStep,         setPStep]         = useState(0);   // sub-step du wizard projet
  const [pModeCours,    setPModeCours]    = useState(null);// "en_ligne" | "presentiel"
  const [pTypeCoaching, setPTypeCoaching] = useState(null);// "groupe" | "prive"
  const [pCentreChoisi, setPCentreChoisi] = useState(null);// objet centre {id,nom,ville}
  const [pAssistante,   setPAssistante]   = useState(null);// objet assistante
  const [pAssistantes,  setPAssistantes]  = useState([]);
  const [pCentres,      setPCentres]      = useState([]);
  const [pLoading,      setPLoading]      = useState(false);
  const [pErreur,       setPErreur]       = useState("");
  const [pSubmitting,   setPSubmitting]   = useState(false);
  const [pOffresEnLigne,       setPOffresEnLigne]       = useState([]);
  const [pOffreChoisie,        setPOffreChoisie]        = useState(null);
  const [pSelectedCentreCard,  setPSelectedCentreCard]  = useState(null);
  const [pCentresMaster,       setPCentresMaster]       = useState([]);
  const [pCentreAssistantesMap,setPCentreAssistantesMap]= useState({});
  // Étape assign (après le quiz - fallback si l'utilisateur a un lien direct sans projet)
  const [assignCentre,       setAssignCentre]       = useState("");
  const [assignCommerciaux,  setAssignCommerciaux]  = useState([]);
  const [assignLoadingCom,   setAssignLoadingCom]   = useState(false);
  const [assignCommercialId, setAssignCommercialId] = useState("");
  const [assignSaving,       setAssignSaving]       = useState(false);
  const [assignError,        setAssignError]        = useState("");
  const [answers,    setAnswers]    = useState({});
  const [currentQ,   setCurrentQ]   = useState(0);
  // Sous-étapes de l'ÉTAPE 3 (quiz) : règles d'intégrité (une fois) → instructions +
  // exemple avant chaque nouvelle catégorie → questions réelles chronométrées.
  const [quizPhase,  setQuizPhase]  = useState("rules"); // "rules" | "intro" | "live"
  const quizPhaseRef = useRef(quizPhase);
  useEffect(() => { quizPhaseRef.current = quizPhase; }, [quizPhase]);
  const currentQRef = useRef(currentQ);
  useEffect(() => { currentQRef.current = currentQ; }, [currentQ]);

  // Remonte en haut de page à chaque changement d'écran (étape du parcours, règles → intro
  // → question, changement de question) - sinon, après un clic sur "Suivant"/"Démarrer" au
  // bas d'un long écran, la page restait scrollée en bas du nouvel écran au lieu de repartir
  // du début (titre, chrono, énoncé).
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [step, quizPhase, currentQ]);

  // Tentative de test ancrée côté serveur (level_test_attempts) - empêche qu'un
  // rafraîchissement de page (ou une navigation privée) "recommence" le test :
  // le chrono et les réponses reprennent exactement où ils en étaient.
  const [attemptId,       setAttemptId]       = useState(null);
  const [attemptReady,    setAttemptReady]    = useState(false); // true une fois la tentative résolue (créée ou reprise)
  const [tabSwitchCount,  setTabSwitchCount]  = useState(0);
  const attemptIdRef = useRef(null);
  useEffect(() => { attemptIdRef.current = attemptId; }, [attemptId]);
  const [result,     setResult]     = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [isLoggedIn,       setIsLoggedIn]       = useState(false);
  const [checkingSession,  setCheckingSession]  = useState(true);
  const [alreadyTested,    setAlreadyTested]    = useState(false);
  const [checkingTest,     setCheckingTest]     = useState(false);
  const [sessionCommercialId, setSessionCommercialId] = useState("");
  // Auth wall
  const [authTab,        setAuthTab]        = useState("register");
  const [authEmail,      setAuthEmail]      = useState("");
  const [authPassword,   setAuthPassword]   = useState("");
  const [authName,       setAuthName]       = useState("");
  const [authTel,        setAuthTel]        = useState("");
  const [authError,      setAuthError]      = useState("");
  const [authSuccess,    setAuthSuccess]    = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const timerPerQ = testParams?.timerEnabled !== false ? (testParams?.timerPerQ || 60) : 9999;
  // Chrono par question (pas un total sur tout le test) - timeLeft repart à timerPerQ
  // à chaque nouvelle question (cf. advanceTo) au lieu de décompter en continu sur
  // l'ensemble du test.
  const [timeLeft,   setTimeLeft]   = useState(timerPerQ);
  const [elapsed,    setElapsed]    = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [emailSent,  setEmailSent]  = useState(false);
  // Confirmation avant de passer sans avoir répondu (clic accidentel sur "Suivant") - ne
  // s'applique pas au speaking (pas de choix à sélectionner, juste un enregistrement).
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  const timerRef = useRef(null);
  const startRef = useRef(null);

  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const BET_CENTRES = [
    { id:"angre",      label:"Angré",        ville:"Abidjan", icon:"🏙️" },
    { id:"2plateaux",  label:"II Plateaux",  ville:"Abidjan", icon:"🌆" },
    { id:"yopougon",   label:"Yopougon",     ville:"Abidjan", icon:"🏢" },
    { id:"koumassi",   label:"Koumassi",     ville:"Abidjan", icon:"🌇" },
    { id:"abatta",     label:"Abatta",       ville:"Abidjan", icon:"🏘️" },
    { id:"bouake",     label:"Bouaké",       ville:"Bouaké",  icon:"🌍" },
  ];

  /* ── Charger les conseillères dans le step assign ── */
  useEffect(() => {
    if (!assignCentre) { setAssignCommerciaux([]); return; }
    setAssignLoadingCom(true);
    fetch(`${process.env.REACT_APP_API_URL || "http://localhost:5001"}/api/level-test/commerciaux?centre_id=${assignCentre}`)
      .then(r => r.json())
      .then(data => setAssignCommerciaux(data.commerciaux || []))
      .catch(() => setAssignCommerciaux([]))
      .finally(() => setAssignLoadingCom(false));
  }, [assignCentre]);

  const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5001";

  /* ── Charger les centres BET + offres en ligne quand on entre dans le step projet ── */
  useEffect(() => {
    if (step !== "projet") return;
    // Reset wizard
    setPStep(0); setPModeCours(null); setPTypeCoaching(null);
    setPCentreChoisi(null); setPAssistante(null); setPAssistantes([]);
    setPOffreChoisie(null); setPSelectedCentreCard(null);
    setPCentreAssistantesMap({}); setPErreur("");

    // Centres
    fetch(`${API_BASE}/api/parcours/centres`)
      .then(r => r.json())
      .then(d => {
        const centres = d.centres || [];
        setPCentres(centres);
        // Pré-charger les assistantes de chaque centre
        Promise.all(centres.map(async c => {
          try {
            const r = await fetch(`${API_BASE}/api/parcours/assistantes-presentiel/${c.id}?tous=true`);
            const d = await r.json();
            return { id: c.id, assistantes: d.assistantes || [] };
          } catch { return { id: c.id, assistantes: [] }; }
        })).then(results => {
          const map = {};
          results.forEach(({ id, assistantes }) => { map[id] = assistantes; });
          setPCentreAssistantesMap(map);
        });
      })
      .catch(() => {});

    // Centres master (pour les offres par cabinet)
    try {
      const s = localStorage.getItem("bet_centres_master");
      if (s) setPCentresMaster(JSON.parse(s).filter(c => c.actif !== false));
    } catch {}

    // Offres en ligne : localStorage d'abord, puis sync Supabase
    try {
      const s = localStorage.getItem("bet_offres_en_ligne");
      if (s) setPOffresEnLigne(JSON.parse(s).filter(o => o.actif !== false));
    } catch {}
    supabase.from("plateforme_config").select("valeur").eq("key","offres_en_ligne").maybeSingle()
      .then(({ data, error }) => {
        if (!error && Array.isArray(data?.valeur) && data.valeur.length) {
          localStorage.setItem("bet_offres_en_ligne", JSON.stringify(data.valeur));
          setPOffresEnLigne(data.valeur.filter(o => o.actif !== false));
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /* ── Lire ?ref=, ?email= et ?nom= dans l'URL ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref   = params.get("ref");
    const email = params.get("email");
    const nom   = params.get("nom");
    const assignationId = params.get("assignation_id");
    setFormData(fd => ({
      ...fd,
      ...(ref   ? { commercial_id: ref }  : {}),
      ...(email ? { email }               : {}),
      ...(nom   ? { fullname: nom }        : {}),
    }));
    if (ref)   setSessionCommercialId(ref);
    if (email) setEmailFromUrl(true);
    if (assignationId) setAssignationIdFromUrl(assignationId);
    // Demande de transfert : même rôle que `assignation_id`, pour un apprenant déjà en classe.
    const demande = params.get("demande");
    if (demande) setDemandeIdFromUrl(demande);
    /* PROFIL DÉJÀ CONNU. Sur un transfert, l'apprenant a un dossier : son profil n'est pas à
       redemander. Sans cela il arrivait sur « Particulier », présélectionné par DÉFAUT et non
       parce qu'on le savait - et pouvait le changer sans y penser, faussant le dossier que
       l'agent placement test s'apprête à traiter. */
    const profil = params.get("profil");
    if (PROFILS_CONNUS.includes(profil)) {
      setProfilVerrouille(profil);
      setFormData(fd => ({ ...fd, profile: profil }));
    }
  }, []);

  /* ── Invité via lien commercial (email + assignation_id dans l'URL) : la personne
     peut ne jamais avoir de compte (inscription manuelle par le staff) - le mur de
     connexion est alors sauté et on vérifie directement si son test est déjà fait,
     sans dupliquer l'appel si une session active existe pour le même email
     (couvert par l'effet de session ci-dessous). ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const email = params.get("email");
    const assignationId = params.get("assignation_id");
    if (!email || !assignationId) return;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user && session.user.email.toLowerCase() === email.toLowerCase()) return;
      setCheckingTest(true);
      try {
        const res = await fetch(`${API_BASE}/api/level-test/result?email=${encodeURIComponent(email)}&assignation_id=${encodeURIComponent(assignationId)}`);
        const data = await res.json();
        if (data.result) setAlreadyTested(true);
      } catch { /* silently ignore */ }
      finally { setCheckingTest(false); }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Session Supabase : pré-remplissage + vérification test ── */
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { setCheckingSession(false); return; }

      const params = new URLSearchParams(window.location.search);
      const urlEmail = params.get("email");
      const urlAssignationId = params.get("assignation_id");
      // Si le lien contient un email prospect différent de la session active, ignorer la session
      // (évite qu'une session commerciale ou d'un autre prospect bloque le formulaire)
      if (urlEmail && urlEmail.toLowerCase() !== session.user.email.toLowerCase()) {
        setCheckingSession(false);
        return;
      }

      const meta = session.user.user_metadata || {};
      const fullName = (meta.nom && meta.prenom)
        ? `${meta.nom} ${meta.prenom}`
        : meta.full_name || session.user.email.split("@")[0];
      setIsLoggedIn(true);
      setCheckingSession(false);
      if (meta.commercial_id) setSessionCommercialId(meta.commercial_id);
      setFormData(fd => ({
        ...fd,
        // Un dossier précis dans l'URL (ex: lien enfant partagé par la commerciale, ouvert
        // pendant que le parent est connecté sous le même email) prime toujours sur le profil
        // de la session - sinon le nom de l'enfant (déjà posé par l'effet URL ci-dessus) se
        // faisait écraser par celui du parent connecté.
        fullname: urlAssignationId ? fd.fullname : fullName,
        email:    session.user.email,
        phone:    urlAssignationId ? fd.phone : (meta.telephone || fd.phone),
        consent:  true,
      }));
      setCheckingTest(true);
      try {
        // Idem : si un dossier précis est fourni, vérifier "déjà testé" sur CE dossier (utile
        // pour un profil enfant, dont l'email est celui du parent, déjà testé sous ce même
        // email) plutôt que sur l'email de la session, qui remonterait à tort le test du parent.
        const qs = urlAssignationId
          ? `assignation_id=${encodeURIComponent(urlAssignationId)}&email=${encodeURIComponent(session.user.email)}`
          : `email=${encodeURIComponent(session.user.email)}`;
        const res = await fetch(`${API_BASE}/api/level-test/result?${qs}`);
        const data = await res.json();
        if (data.result) setAlreadyTested(true);
      } catch { /* silently ignore */ }
      finally { setCheckingTest(false); }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAuthRegister = async (e) => {
    e.preventDefault();
    setAuthError(""); setAuthSuccess(""); setAuthSubmitting(true);
    try {
      const nameParts = authName.trim().split(" ");
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: nameParts[0] || "", prenom: nameParts.slice(1).join(" ") || "", email: authEmail, telephone: authTel, password: authPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'inscription");
      setAuthSuccess("Compte créé ! Connexion en cours…");
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
      if (signInErr) throw new Error(signInErr.message);
      window.location.reload();
    } catch (err) {
      setAuthError(err.message);
      setAuthSubmitting(false);
    }
  };

  const handleAuthLogin = async (e) => {
    e.preventDefault();
    setAuthError(""); setAuthSuccess(""); setAuthSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Email ou mot de passe incorrect");
      await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
      window.location.reload();
    } catch (err) {
      setAuthError(err.message);
      setAuthSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/test-niveau` } });
  };


  const timeLeftRef = useRef(timeLeft);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

  // ── Résolution de la tentative côté serveur (création ou reprise) ──
  // Ancre started_at/seconds_remaining/answers/quiz_phase sur le serveur : un
  // rafraîchissement de page ne fait plus repartir le test à zéro, il reprend
  // exactement où il en était (voir Backend/sql/level_test_attempts_migration.sql).
  useEffect(() => {
    if (step !== "quiz" || attemptReady) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/level-test/attempt/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: formData.email,
            test_id: activeTest?.id || null,
            question_ids: questions.map(q => q.id),
            // seconds_total représente désormais le temps de LA question en cours (pas le
            // total du test) - cf. seconds_remaining stocké/repris ci-dessous, par question.
            seconds_total: timerPerQ,
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.attempt) {
          setAttemptId(data.attempt.id);
          if (data.resumed) {
            setAnswers(data.attempt.answers || {});
            setQuizPhase(data.attempt.quiz_phase || "rules");
            setCurrentQ(Math.min(Math.max(data.attempt.current_index || 0, 0), Math.max(questions.length - 1, 0)));
            setTimeLeft(Math.max(0, data.attempt.seconds_remaining ?? timerPerQ));
            setTabSwitchCount(data.attempt.tab_switch_count || 0);
          } else {
            setTimeLeft(timerPerQ);
          }
        } else {
          // API indisponible : on continue sans reprise plutôt que de bloquer le test.
          setTimeLeft(timerPerQ);
        }
      } catch {
        setTimeLeft(timerPerQ);
      } finally {
        if (!cancelled) setAttemptReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [step]); // eslint-disable-line

  // ── Chrono - ne démarre qu'une fois la tentative résolue (créée ou reprise) ──
  useEffect(() => {
    if (step === "quiz" && attemptReady) {
      startRef.current = Date.now();
      timerRef.current = setInterval(() => {
        // Le chrono ne décompte que pendant les questions réelles (quizPhase "live") -
        // il est en pause pendant l'écran de règles et les instructions/exemple de
        // chaque section, pour ne pas pénaliser le temps de lecture des consignes.
        if (quizPhaseRef.current !== "live") return;
        setTimeLeft(t => {
          if (t <= 1) {
            // Temps de la question écoulé sans réponse (ou avec une réponse déjà donnée,
            // gardée telle quelle) - comptée automatiquement 0 si vide (cf. isCorrect),
            // jamais de blocage : on avance à la question suivante, ou on soumet si
            // c'était la dernière.
            if (currentQRef.current < questions.length - 1) {
              setTimeout(() => advanceTo(currentQRef.current + 1), 0);
            } else {
              clearInterval(timerRef.current);
              doSubmit();
            }
            return timerPerQ;
          }
          return t-1;
        });
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [step, attemptReady]); // eslint-disable-line

  // ── Sauvegarde incrémentale de la progression (réponses, phase, index) ──
  useEffect(() => {
    if (!attemptId || !attemptReady) return;
    fetch(`${API_BASE}/api/level-test/attempt/${attemptId}/progress`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers, current_index: currentQ, quiz_phase: quizPhase }),
    }).catch(() => {});
  }, [attemptId, attemptReady, answers, currentQ, quizPhase]); // eslint-disable-line

  // ── Synchronisation périodique du temps restant pendant les questions réelles -
  // borne la fenêtre de "pause gratuite" qu'offrirait un rafraîchissement à ~15s max.
  useEffect(() => {
    if (!attemptId) return;
    const iv = setInterval(() => {
      if (quizPhaseRef.current !== "live") return;
      fetch(`${API_BASE}/api/level-test/attempt/${attemptId}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds_remaining: timeLeftRef.current }),
      }).catch(() => {});
    }, 15000);
    return () => clearInterval(iv);
  }, [attemptId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Détection des changements d'onglet pendant les questions réelles -
  // ne peut pas être empêchée depuis un site web, seulement détectée et
  // remontée au staff dans le résultat final pour revue manuelle.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && step === "quiz" && quizPhaseRef.current === "live") {
        setTabSwitchCount(c => c + 1);
        if (attemptIdRef.current) {
          fetch(`${API_BASE}/api/level-test/attempt/${attemptIdRef.current}/progress`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tab_switch_increment: true }),
          }).catch(() => {});
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { window.scrollTo({ top:0, behavior:"smooth" }); }, [step]);

  const validateForm = () => {
    const e = {};
    if (!formData.fullname.trim()) e.fullname = "Le nom est requis";
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) e.email = "Email invalide";
    if (!formData.consent) e.consent = "Requis";
    return e;
  };

  const handleFormSubmit = async () => {
    const errs = validateForm();
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setSubmitting(true);

    // Si une assistante est déjà assignée via l'URL (?ref=) ou une session Supabase
    // active, on le sait déjà. Sinon, on vérifie côté serveur si ce candidat a déjà
    // une assignation existante (même sans être connecté) - sans ça, quelqu'un qui
    // revient juste avec son email se retrouvait à refaire tout le choix d'assistante.
    let existingCommercialId = sessionCommercialId || formData.commercial_id;
    let foundExisting = !!existingCommercialId;
    if (!existingCommercialId && formData.email.trim()) {
      try {
        const r = await fetch(`${API_BASE}/api/parcours/mon-assignation?email=${encodeURIComponent(formData.email.trim())}`);
        const d = await r.json();
        if (d?.assignation?.assistante_id) {
          foundExisting = true;
          // utilisateur_id est le seul identifiant reconnu comme commercial_id partout
          // ailleurs (notifications, paiements, tests de niveau) - poser assistante_id
          // (id technique de la table assistantes, un espace d'id totalement différent)
          // directement comme commercial_id rendait ce test invisible dans le dashboard
          // de la commerciale, sans jamais d'erreur visible (même bug déjà rencontré et
          // corrigé pour TouchPoint).
          const resolvedCommercialId = d.assignation.utilisateur_id || null;
          existingCommercialId = resolvedCommercialId;
          if (resolvedCommercialId) setSessionCommercialId(resolvedCommercialId);
          if (d.assignation.assignation_id) setAssignationIdFromUrl(d.assignation.assignation_id);
          setFormData(fd => ({ ...fd, commercial_id: resolvedCommercialId, centre_id: d.assignation.centre_id || fd.centre_id }));
        }
      } catch { /* pas d'assignation trouvée ou erreur réseau - on continue vers le choix du parcours */ }
    }

    setSubmitting(false);
    setStep(foundExisting ? "quiz" : "projet");
  };

  /* ── Wizard projet : helpers ── */
  const pInferTypeCoaching = (offre) => {
    if (!offre) return null;
    const l = (offre.label || "").toLowerCase();
    if (l.includes("groupe") || l.includes("group")) return "groupe";
    if (l.includes("priv")) return "prive";
    return null;
  };

  const pFindMaster = (centre) => {
    const norm = s => (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/^bet\s+/,"").trim();
    const cn = norm(centre.nom);
    return pCentresMaster.find(m => norm(m.name) === cn) ||
           pCentresMaster.find(m => norm(m.name).includes(cn) || cn.includes(norm(m.name)));
  };

  /* ── Wizard projet : handlers ── */
  const pChoisirMode = (mode) => {
    setPModeCours(mode);
    setPTypeCoaching(null);
    setPCentreChoisi(null);
    setPAssistante(null);
    setPAssistantes([]);
    setPOffreChoisie(null);
    setPSelectedCentreCard(null);
    setPErreur("");
    if (mode === "en_ligne") setPStep(1);
    else setPStep(1.5);
  };

  // En ligne : offre sélectionnée → charger les assistantes
  const pChoisirOffreEnLigne = async (offre) => {
    setPOffreChoisie(offre);
    setPTypeCoaching(pInferTypeCoaching(offre));
    setPAssistantes([]); setPAssistante(null); setPErreur("");
    setPLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/parcours/assistantes-ligne?profil=b2c`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      setPAssistantes(d.assistantes || []);
      setPStep(2);
    } catch (e) { setPErreur(e.message); }
    finally { setPLoading(false); }
  };

  // En ligne : continuer sans sélectionner d'offre
  const pContinuerSansOffreEnLigne = async () => {
    setPOffreChoisie(null); setPTypeCoaching(null);
    setPAssistantes([]); setPAssistante(null); setPErreur("");
    setPLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/parcours/assistantes-ligne?profil=b2c`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      setPAssistantes(d.assistantes || []);
      setPStep(2);
    } catch (e) { setPErreur(e.message); }
    finally { setPLoading(false); }
  };

  // Présentiel : confirmer cabinet (avec ou sans offre) → charger assistantes
  const pChoisirCentre = async (centre) => {
    setPCentreChoisi(centre); setPLoading(true); setPErreur("");
    setPSelectedCentreCard(null);
    try {
      const r = await fetch(`${API_BASE}/api/parcours/assistantes-presentiel/${centre.id}?liste=true`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      setPAssistantes(d.assistantes || []);
      setPStep(2);
    } catch (e) { setPErreur(e.message); }
    finally { setPLoading(false); }
  };

  const pChoisirAssistante = (a) => {
    setPAssistante(a);
    pDoSubmit(a); // pas d'étape paiement dans le test de niveau
  };

  const pDoSubmit = async (assistante) => {
    const ast = assistante || pAssistante;
    if (!ast) return;
    setPSubmitting(true); setPErreur("");
    try {
      const r = await fetch(`${API_BASE}/api/parcours/assignation`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistante_id:      ast.id,
          prospect_nom:       formData.fullname,
          prospect_email:     formData.email || undefined,
          prospect_telephone: formData.phone || "",
          type_cours:         pModeCours,
          type_coaching:      pTypeCoaching || undefined,
          centre_id:          pCentreChoisi?.id || undefined,
          source:             "test_niveau",
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      // utilisateur_id = ID dans la table utilisateurs (pour le filtre level_test_results)
      // ast.id         = ID dans la table assistantes  (pour l'assignation parcours)
      const commercialUserId = d.assistante?.utilisateur_id || null;
      await supabase.auth.updateUser({
        data: {
          commercial_id: commercialUserId,
          centre_id: pCentreChoisi?.id || null,
          parcours_assignation: {
            assignation_id:    d.assignation?.id || null,
            assistante_id:     ast.id,
            assistante_prenom: ast.prenom,
            assistante_nom:    ast.nom,
            assistante_photo:  ast.photo_url || null,
            assistante_tel:    ast.telephone || null,
            type_cours:        pModeCours,
            type_coaching:     pTypeCoaching || null,
            centre_id:         pCentreChoisi?.id || null,
            centre_nom:        pCentreChoisi?.nom || null,
            date:              new Date().toISOString(),
          },
        },
      }).catch(() => {});
      setFormData(fd => ({ ...fd, commercial_id: commercialUserId, centre_id: pCentreChoisi?.id || null }));
      setSessionCommercialId(commercialUserId);
      setPAssistante(ast);
      setPStep(4);
    } catch (e) { setPErreur(e.message); }
    finally { setPSubmitting(false); }
  };

  // Avance vers `idx` - si la question ciblée appartient à une nouvelle catégorie,
  // on repasse par l'écran instructions/exemple de cette section avant de la montrer.
  const advanceTo = (idx) => {
    if (idx < 0 || idx >= questions.length) return;
    const curCat  = questions[currentQ]?.category;
    const nextCat = questions[idx]?.category;
    setCurrentQ(idx);
    // Chrono par question (pas un chrono global sur tout le test) : repart à plein
    // dès qu'on change de question - décompte réellement en pause pendant "intro"
    // (cf. l'effet du setInterval plus bas, qui ne décompte que si quizPhase==="live").
    setTimeLeft(timerPerQ);
    if (nextCat !== curCat) { setQuizPhase("intro"); }
  };

  // Avance à la question suivante, ou soumet le test si c'était la dernière.
  const goNext = () => {
    if (currentQ < questions.length - 1) advanceTo(currentQ + 1); else doSubmit();
  };

  // Clic sur "Suivant"/"Voir mon résultat" - si aucune réponse n'a été donnée (ni un vrai
  // choix, ni "Ne pas répondre" explicite, ni un enregistrement pour le speaking), demande
  // confirmation avant de passer, pour éviter qu'un clic accidentel saute une question sans
  // que le candidat s'en rende compte.
  const handleNextClick = () => {
    const q = questions[currentQ];
    if (!answers[q?.id]) { setShowSkipConfirm(true); return; }
    goNext();
  };

  // Valeur spéciale distincte de toute vraie réponse - sélectionnable comme un choix parmi
  // les autres ("Ne pas répondre"), jamais égale à q.correct, donc automatiquement comptée
  // comme fausse (0 point) par isCorrect, sans jamais bloquer la suite du test.
  const SKIP_SENTINEL = "__NE_PAS_REPONDRE__";

  // Ne fait plus qu'enregistrer le choix - ne passe plus automatiquement à la question
  // suivante : le candidat sélectionne sa réponse puis clique lui-même sur "Suivant".
  const handleAnswer = (qId, val) => {
    setAnswers(p => ({ ...p, [qId]: val }));
  };

  const isCorrect = (q) => {
    const ans = answers[q.id] || "";
    if (ans === SKIP_SENTINEL)  return false; // sauté volontairement
    if (q.type === "libre")     return false; // correction manuelle
    if (q.type === "speaking")  return false; // correction manuelle (audio)
    if (q.type === "texte_trous")  return ans.toLowerCase().trim() === (q.correct||"").toLowerCase().trim();
    return ans === q.correct;
  };

  const computeResult = () => {
    let earned = 0;
    const byCat = {}, byCefr = {};
    questions.forEach(q => {
      if (!byCat[q.category])  byCat[q.category]  = { correct:0, total:0, pts:0, max:0 };
      if (!byCefr[q.cefr])     byCefr[q.cefr]     = { correct:0, total:0 };
      byCat[q.category].total++;
      byCat[q.category].max += (q.type === "libre" || q.type === "speaking" ? 0 : (q.points || 1));
      byCefr[q.cefr].total++;
      if (isCorrect(q)) {
        earned += (q.points || 1);
        byCat[q.category].correct++;
        byCat[q.category].pts += (q.points || 1);
        byCefr[q.cefr].correct++;
      }
    });
    const gradableTotal = questions.filter(q => q.type !== "libre" && q.type !== "speaking").reduce((s,q) => s+(q.points||1), 0) || 1;
    const pct = Math.round((earned / gradableTotal) * 100);
    let cefr = "A1";
    if (pct >= 90) cefr="C2"; else if (pct >= 75) cefr="C1"; else if (pct >= 60) cefr="B2"; else if (pct >= 45) cefr="B1"; else if (pct >= 25) cefr="A2";
    return { earned, pct, cefr, byCat, byCefr, timeTaken:elapsed, correct: questions.filter(q => isCorrect(q)).length };
  };

  const saveTestResultToBackend = (resultData) => {
    const audioAnswers = {};
    questions.filter(q => q.type === "speaking").forEach(q => {
      const url = answers[q.id];
      if (url && url.startsWith("http")) audioAnswers[q.id] = url;
    });
    // Pour Writing/Speaking : pas de score auto - en attente de correction
    const isManual = format === "writing" || format === "speaking";
    // Un test "mixed" peut contenir quelques questions libre/speaking en plus des QCM
    // auto-corrigés : le score/niveau auto reste valable (calculé hors ces questions,
    // cf. isCorrect/gradableTotal ci-dessus), mais un humain doit encore écouter/lire
    // ces réponses avant de considérer le test comme traité - sans ce flag, ces
    // réponses ne remontaient jamais dans aucune file "à corriger".
    const hasQuestionsManuelles = questions.some(q => q.type === "libre" || q.type === "speaking");
    const needsReview = isManual || hasQuestionsManuelles;
    return insertTestNiveau({
      user: {
        fullname:  formData.fullname,
        email:     formData.email,
        phone:     formData.phone || null,
        profile:   formData.profile || "particulier",
        consent:   formData.consent,
        centre_id:     formData.centre_id     || null,
        commercial_id: formData.commercial_id || null,
      },
      test: {
        level:              isManual ? "En attente" : resultData.cefr,
        score:              isManual ? 0 : resultData.pct,
        points_earned:      isManual ? 0 : resultData.earned,
        points_total:       totalPts,
        correct_answers:    isManual ? 0 : resultData.correct,
        total_questions:    questions.length,
        time_taken_seconds: resultData?.timeTaken || 0,
        answers_details:    questions.map(q => ({
          question_id:    q.id,
          question_text:  q.text,
          category:       q.category,
          cefr:           q.cefr,
          text:           q.text,
          type:           q.type,
          user_answer:    q.type === "speaking" ? (answers[q.id] ? "[audio]" : null) : (answers[q.id] || null),
          correct_answer: q.correct || null,
          is_correct:     isManual ? null : isCorrect(q),
        })),
        audio_answers:     audioAnswers,
        by_category:       isManual ? {} : resultData.byCat,
        by_cefr:           isManual ? {} : resultData.byCefr,
        format_test:       format,
        correction_statut: needsReview ? "en_attente" : "auto",
        source:            "online",
        tab_switch_count:  tabSwitchCount,
      },
      assignation_id: assignationIdFromUrl || null,
      attempt_id: attemptIdRef.current || null,
      submitted_at: new Date().toISOString(),
    });
  };

  const doSubmit = async () => {
    clearInterval(timerRef.current);
    // Writing/Speaking : pas de calcul de score auto
    const r = needsManualCorrection ? { cefr:"En attente", pct:0, earned:0, byCat:{}, byCefr:{}, timeTaken:elapsed, correct:0 } : computeResult();
    setResult(r);
    setSavingResult(true);
    setSaveError("");

    // Lire le commercial_id depuis la session en temps réel (au cas où choisi depuis Mon Espace)
    let currentCommercialId = sessionCommercialId;
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      currentCommercialId = currentSession?.user?.user_metadata?.commercial_id || sessionCommercialId;
    } catch { /* utiliser sessionCommercialId */ }

    try {
      await saveTestResultToBackend(r);
      if (currentCommercialId) {
        const centreFromMeta = (await supabase.auth.getSession())?.data?.session?.user?.user_metadata?.centre_id || null;
        await fetch(`${API_BASE}/api/level-test/assign-commercial`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_email: formData.email, commercial_id: currentCommercialId, centre_id: centreFromMeta }),
        }).catch(() => {});
      }
    } catch (err) {
      console.error("Erreur sauvegarde résultat :", err);
    } finally {
      setSavingResult(false);
      if (needsManualCorrection) {
        // Writing/Speaking → écran "en attente de correction"
        setStep("pending");
      } else if (currentCommercialId) {
        setStep("result");
        setTimeout(() => setEmailSent(true), 1800);
      } else {
        setStep("assign");
      }
    }
  };

  const handleAssignAndContinue = async () => {
    if (!assignCentre) { setAssignError("Veuillez sélectionner votre centre BET."); return; }
    if (!assignCommercialId) { setAssignError("Veuillez choisir votre conseillère."); return; }
    setAssignError("");
    setAssignSaving(true);
    try {
      const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5001";
      const r = await fetch(`${API_BASE}/api/level-test/assign-commercial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_email: formData.email, commercial_id: assignCommercialId, centre_id: assignCentre }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Erreur serveur");
      if (isLoggedIn) {
        await supabase.auth.updateUser({ data: { commercial_id: assignCommercialId, centre_id: assignCentre } });
      }
      setAssignSaving(false);
      setStep("result");
      setTimeout(() => setEmailSent(true), 1800);
    } catch (err) {
      console.error("Erreur assignation conseillère :", err);
      setAssignSaving(false);
      setAssignError(err.message || "Une erreur est survenue. Réessayez.");
    }
  };

  // Envoi du bilan gratuit
  const answered = Object.keys(answers).filter(id => answers[id]).length;
  const requiredCount = questions.filter(q => q.type !== "speaking").length;
  const answeredRequired = questions.filter(q => q.type !== "speaking" && answers[q.id]).length;
  // Seuil d'alerte relatif au temps par question (pas 60s fixes - n'aurait plus de sens
  // maintenant que timeLeft est le temps restant d'UNE question, souvent déjà ≤60s).
  const isLow    = timeLeft <= Math.min(10, Math.ceil(timerPerQ / 3));
  const q        = questions[currentQ];
  const cs       = q ? (CAT[q.category] || { bg:"#f3f4f6", c:"#374151", dot:"#6b7280" }) : {};

  if (loadingTest) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f8fafc", flexDirection:"column", gap:16 }}>
      <div style={{ width:44, height:44, border:"4px solid #e2e8f0", borderTopColor:"#ff2945", borderRadius:"50%", animation:"fltSpin .8s linear infinite" }} />
      <p style={{ color:"#64748b", fontFamily:"Montserrat,sans-serif", fontSize:".9rem" }}>Chargement du test…</p>
    </div>
  );

  if (noTestAvailable) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f8fafc", flexDirection:"column", gap:14, padding:24, textAlign:"center" }}>
      <div style={{ fontSize:40 }}>🛠️</div>
      <h1 style={{ fontFamily:"Montserrat,sans-serif", fontSize:"1.3rem", color:"#0f172a", margin:0 }}>Test de niveau momentanément indisponible</h1>
      <p style={{ color:"#64748b", fontFamily:"Montserrat,sans-serif", fontSize:".9rem", maxWidth:420, margin:0 }}>
        Aucun test n'est actuellement configuré. Revenez un peu plus tard ou contactez-nous directement.
      </p>
    </div>
  );

  return (
    <>
      <SEO
        title="Test de niveau d'anglais gratuit CECRL - Binnie's English Training | BET"
        description="Passez gratuitement notre test de niveau d'anglais officiel (CECRL A1 à C2) et recevez votre résultat détaillé avec Binnie's English Training."
        canonicalUrl="/test-niveau"
      />
      <div style={S.page}>

        {/* ── STICKY HEADER ─────────────────────────── */}
        <div style={S.header}>
          <div className="flt-header-inner" style={S.headerInner}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={S.headerDiv}>|</span>
              <span className="flt-header-title" style={S.headerTitle}>Test de niveau officiel - CECRL A1–C2</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              {step === "quiz" && quizPhase === "live" && (
                <div style={{ ...S.timerChip, ...(isLow ? S.timerLow : {}), animation: isLow ? "fltPulse 1s ease infinite" : "none" }}>
                  ⏱ {fmt(timeLeft)}
                </div>
              )}
              <span className="flt-header-badge" style={S.headerBadge}>🏅 Gratuit & Officiel</span>
            </div>
          </div>
        </div>

        {/* ── PAGE BODY ─────────────────────────────── */}
        <div style={S.body}>
          {/* Badge format de test */}
          {format !== "mixte" && (
            <div style={{ display:"flex", alignItems:"center", gap:10, justifyContent:"center", marginBottom:20, padding:"10px 20px", borderRadius:12, background:fmtInfo.bg, border:`1.5px solid ${fmtInfo.color}30`, maxWidth:520, margin:"0 auto 24px" }}>
              <span style={{ fontSize:"1.4rem" }}>{fmtInfo.icon}</span>
              <div>
                <div style={{ fontWeight:800, fontSize:".95rem", color:fmtInfo.color }}>{fmtInfo.label}</div>
                <div style={{ fontSize:".78rem", color:"#64748b" }}>{fmtInfo.desc}</div>
              </div>
              {needsManualCorrection && (
                <span style={{ marginLeft:"auto", background:"#fffbeb", color:"#92400e", border:"1px solid #fde68a", borderRadius:999, padding:"2px 10px", fontSize:".72rem", fontWeight:700, whiteSpace:"nowrap" }}>
                  ⏳ Résultat sous 24h
                </span>
              )}
            </div>
          )}
          <Stepper current={step === "form" ? 1 : step === "projet" ? 2 : step === "quiz" ? 3 : (step === "assign" || step === "pending") ? 3 : 4} alreadyAssigned={!!sessionCommercialId} />

          {/* MUR AUTH : non connecté (sauté si le lien d'invitation commercial contient
             déjà email + assignation_id - cas d'un prospect inscrit manuellement par le
             staff, sans compte, pour qui forcer une connexion créerait un blocage inutile) */}
          {step === "form" && (checkingSession && !hasInviteContext ? (
            <div style={{ textAlign:"center", padding:"60px 24px", color:"#64748b" }}>
              <div style={{ width:40, height:40, border:"4px solid #e2e8f0", borderTopColor:"#ff2945", borderRadius:"50%", animation:"fltSpin .8s linear infinite", margin:"0 auto 16px" }} />
              Vérification de votre session…
            </div>
          ) : (!isLoggedIn && !hasInviteContext) ? (
            <div style={{ ...S.card, maxWidth:460, animation:"fltSI .45s ease" }}>
              <div className="flt-locked-panel" style={{ background:"linear-gradient(135deg,#011451,#0c33ac)", padding:"28px 28px 22px", textAlign:"center" }}>
                <div style={{ fontSize:"2.4rem", marginBottom:8 }}>🔐</div>
                <h2 style={{ fontFamily:"Montserrat,sans-serif", color:"#fff", fontWeight:800, margin:"0 0 8px", fontSize:"1.15rem" }}>
                  Connectez-vous pour passer le test
                </h2>
                <p style={{ color:"rgba(255,255,255,.7)", fontSize:".83rem", margin:0, lineHeight:1.6 }}>
                  Un compte est obligatoire pour que votre conseillère puisse recevoir votre résultat et vous contacter.
                </p>
              </div>

              {/* Tabs */}
              <div style={{ display:"flex", borderBottom:"1px solid #e2e8f0" }}>
                {[{id:"register",l:"Créer un compte"},{id:"login",l:"Se connecter"}].map(t => (
                  <button key={t.id} onClick={() => { setAuthTab(t.id); setAuthError(""); setAuthSuccess(""); }}
                    style={{ flex:1, padding:"13px 0", border:"none", background:"none", fontWeight: authTab===t.id?800:500,
                      color: authTab===t.id?"#ff2945":"#64748b", borderBottom: authTab===t.id?"2.5px solid #ff2945":"2.5px solid transparent",
                      cursor:"pointer", fontSize:".88rem", transition:"all .15s" }}>
                    {t.l}
                  </button>
                ))}
              </div>

              <div style={{ padding:"24px 28px" }}>
                {/* Google */}
                <button onClick={handleGoogleAuth}
                  style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:10,
                    padding:"11px 16px", border:"1.5px solid #e2e8f0", borderRadius:10, background:"#fff",
                    cursor:"pointer", fontWeight:700, fontSize:".88rem", color:"#011451", marginBottom:18 }}>
                  <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                  Continuer avec Google
                </button>

                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:18 }}>
                  <div style={{ flex:1, height:1, background:"#e2e8f0" }} />
                  <span style={{ fontSize:".76rem", color:"#94a3b8", fontWeight:600 }}>ou</span>
                  <div style={{ flex:1, height:1, background:"#e2e8f0" }} />
                </div>

                <form onSubmit={authTab==="register" ? handleAuthRegister : handleAuthLogin} style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {authTab === "register" && (
                    <>
                      <input placeholder="Nom complet *" value={authName} onChange={e=>setAuthName(e.target.value)} required
                        style={S.input} />
                      <input placeholder="Téléphone" value={authTel} onChange={e=>setAuthTel(e.target.value)}
                        style={S.input} />
                    </>
                  )}
                  <input type="email" placeholder="Email *" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} required style={S.input} />
                  <input type="password" placeholder="Mot de passe *" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} required style={S.input} />

                  {authError && <p style={{ color:"#ff2945", fontSize:".82rem", margin:0, fontWeight:600 }}>⚠ {authError}</p>}
                  {authSuccess && <p style={{ color:"#059669", fontSize:".82rem", margin:0, fontWeight:600 }}>✅ {authSuccess}</p>}

                  <button type="submit" disabled={authSubmitting}
                    style={{ ...S.btnRed, width:"100%", opacity: authSubmitting ? .7 : 1 }}>
                    {authSubmitting ? "Chargement…" : authTab==="register" ? "Créer mon compte et passer le test →" : "Se connecter →"}
                  </button>
                </form>
              </div>
            </div>
          ) : null)}

          {/* BLOCAGE : test déjà passé */}
          {step === "form" && (isLoggedIn || hasInviteContext) && (checkingTest || alreadyTested) && (
            <div style={{ ...S.card, maxWidth:500, animation:"fltSI .45s ease", textAlign:"center", padding:"48px 32px" }}>
              {checkingTest ? (
                <div style={{ color:"#64748b", fontSize:14 }}>Vérification en cours…</div>
              ) : (
                <>
                  <div style={{ fontSize:"3.5rem", marginBottom:16 }}>🎯</div>
                  <h2 style={{ fontFamily:"Montserrat,sans-serif", fontWeight:800, color:"#011451", marginBottom:12 }}>
                    Vous avez déjà passé ce test
                  </h2>
                  <p style={{ color:"#64748b", fontSize:".9rem", lineHeight:1.7, marginBottom:24 }}>
                    Le test de niveau BET est unique et ne peut être passé qu'une seule fois en ligne.
                    {isLoggedIn
                      ? " Votre résultat et votre programme personnalisé sont disponibles dans votre espace."
                      : " Votre conseillère a déjà votre résultat et votre programme personnalisé."}
                  </p>
                  <p style={{ color:"#94a3b8", fontSize:".82rem", marginBottom:28 }}>
                    Si vous souhaitez repasser le test, rendez-vous directement dans l'un de nos centres BET Languages.
                  </p>
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    {isLoggedIn && (
                      <button
                        onClick={() => navigate("/mon-espace")}
                        style={{ padding:"13px 28px", background:"linear-gradient(135deg,#ff2945,#0c33ac)", color:"#fff", border:"none", borderRadius:12, fontWeight:800, fontSize:"1rem", cursor:"pointer" }}
                      >
                        Voir mon résultat →
                      </button>
                    )}
                    <button
                      onClick={() => navigate("/")}
                      style={{ padding:"10px 24px", background:"none", color:"#64748b", border:"1.5px solid #e2e8f0", borderRadius:12, fontWeight:600, fontSize:".88rem", cursor:"pointer" }}
                    >
                      Retour à l'accueil
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ÉTAPE 1 - FORMULAIRE */}
          {step === "form" && (isLoggedIn || hasInviteContext) && !checkingTest && !alreadyTested && (
            <div style={{ ...S.card, maxWidth:500, animation:"fltSI .45s ease" }}>
              <div style={S.formTop}>
                <div style={S.formTopOrb} />
                <span style={S.formTopIcon}>🎓</span>
                <h1 style={S.formH1}>Testez votre niveau gratuitement</h1>
                <p style={S.formSub}>{questions.length} questions · ~{questions.length} minutes · Résultat CECRL immédiat</p>
                <div style={S.formPills}>
                  {["✅ 100% gratuit","📊 A1→C2","📧 Résultat par email","🎯 Programme personnalisé"].map((p, i) => (
                    <span key={i} style={S.formPill}>{p}</span>
                  ))}
                </div>
              </div>

              <div style={S.cardBody}>
                {/* Badge connecté / invité */}
                {(isLoggedIn || hasInviteContext) && (
                  <div style={{ display:"flex", alignItems:"center", gap:10, background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"10px 14px", marginBottom:18, fontSize:".82rem", color:"#065f46" }}>
                    <span style={{ fontSize:"1rem" }}>✅</span>
                    <div>
                      <strong>{isLoggedIn ? `Connecté en tant que ${formData.fullname}` : "Dossier identifié via votre lien d'invitation"}</strong>
                      <div style={{ fontSize:".76rem", color:"#047857", marginTop:2 }}>
                        {isLoggedIn
                          ? "Vos informations ont été pré-remplies. Le résultat sera automatiquement enregistré dans votre espace."
                          : "Vos informations ont été pré-remplies. Le résultat sera automatiquement transmis à votre conseillère."}
                      </div>
                    </div>
                  </div>
                )}

                {/* Profile */}
                <label style={S.fieldLabel}>
                  Vous êtes :
                  {profilVerrouille && <span style={{ marginLeft:6, fontSize:".72rem", color:"#059669", fontWeight:600 }}>✓ déjà renseigné</span>}
                </label>
                <div style={S.profileGrid}>
                  {[{v:"particulier",l:"Particulier",i:"👤"},{v:"etudiant",l:"Étudiant",i:"🎒"},{v:"professionnel",l:"Professionnel",i:"💼"},{v:"enfant",l:"Enfant",i:"🧒"}].map(p => {
                    // Profil connu : les autres choix s'effacent, celui-ci reste affiche mais inerte.
                    const choisi = formData.profile === p.v;
                    if (profilVerrouille && !choisi) return null;
                    return (
                    <button key={p.v} className="flt-profile-btn" disabled={!!profilVerrouille}
                      title={profilVerrouille ? "Profil repris de votre dossier - il n'y a rien à modifier ici." : undefined}
                      style={{ ...S.profileBtn, ...(choisi ? S.profileBtnActive : {}),
                        ...(profilVerrouille ? { cursor:"default", opacity:.85 } : {}) }}
                      onClick={() => { if (!profilVerrouille) setFormData(fd => ({ ...fd, profile:p.v })); }}>
                      <span style={{ fontSize:"1.3rem" }}>{p.i}</span>
                      <span style={{ fontSize:".76rem", fontWeight: formData.profile === p.v ? 800 : 600 }}>{p.l}</span>
                    </button>
                    );
                  })}
                </div>

                {/* Fields */}
                <div style={{ display:"flex", flexDirection:"column", gap:14, margin:"20px 0" }}>
                  {[
                    { key:"fullname", label:"Nom complet *",   type:"text",  ph:"Jean Kouamé" },
                    { key:"email",    label:"Email *",          type:"email", ph:"jean@exemple.com" },
                    { key:"phone",    label:"Téléphone",        type:"tel",   ph:"+225 07 00 00 00 00" },
                  ].map(f => {
                    const locked = (isLoggedIn || (emailFromUrl && f.key === "email")) && f.key === "email";
                    return (
                      <div key={f.key}>
                        <label style={S.fieldLabel}>
                          {f.label}
                          {(isLoggedIn || (emailFromUrl && f.key === "email")) && <span style={{ marginLeft:6, fontSize:".72rem", color:"#059669", fontWeight:600 }}>✓ pré-rempli</span>}
                        </label>
                        <input
                          type={f.type}
                          placeholder={f.ph}
                          value={formData[f.key] || ""}
                          readOnly={locked}
                          onChange={e => { if (!locked) { setFormData(fd => ({ ...fd, [f.key]: e.target.value })); setFormErrors(fe => ({ ...fe, [f.key]: null })); } }}
                          style={{
                            ...S.input,
                            ...(formErrors[f.key] ? { borderColor:"#ff2945", boxShadow:"0 0 0 3px rgba(220,38,38,.1)" } : {}),
                            ...(locked ? { background:"#f8fafc", color:"#64748b", cursor:"not-allowed" } : {}),
                          }}
                          onFocus={e => { if (!locked) { e.currentTarget.style.borderColor="#ff2945"; e.currentTarget.style.boxShadow="0 0 0 3px rgba(220,38,38,.1)"; } }}
                          onBlur={e  => { e.currentTarget.style.borderColor=formErrors[f.key]?"#ff2945":"#e2e8f0"; e.currentTarget.style.boxShadow="none"; }}
                        />
                        {formErrors[f.key] && <p style={S.errTxt}>⚠ {formErrors[f.key]}</p>}
                      </div>
                    );
                  })}
                </div>

                {/* Consent */}
                <label style={{ display:"flex", alignItems:"flex-start", gap:10, cursor:"pointer", marginBottom:22 }}>
                  <input type="checkbox" checked={formData.consent} onChange={e => setFormData(fd => ({ ...fd, consent:e.target.checked }))} style={{ accentColor:"#ff2945", width:16, height:16, marginTop:2 }} />
                  <span style={{ fontSize:".84rem", color:"#475569", lineHeight:1.6 }}>
                    J'accepte de recevoir des informations personnalisées sur les formations adaptées à mon niveau.
                    <span style={{ color:"#94a3b8" }}> (Données confidentielles · Désinscription facile)</span>
                  </span>
                </label>
                {formErrors.consent && <p style={{ ...S.errTxt, marginTop:-16, marginBottom:12 }}>⚠ Ce champ est requis</p>}

                <button style={{ ...S.btnRed, width:"100%", opacity: submitting ? .7 : 1 }} onClick={handleFormSubmit} disabled={submitting}
                  onMouseEnter={e => { if (!submitting) e.currentTarget.style.background="#b91c1c"; }}
                  onMouseLeave={e => { e.currentTarget.style.background="#ff2945"; }}>
                  {submitting
                    ? <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}><span style={S.spinner} />Préparation du test...</span>
                    : "Commencer le test →"}
                </button>

                <div style={S.formBenefits}>
                  {[["🕒",`${questions.length} min`],["📊","Niveau A1–C2"],["✅","Résultat immédiat"],["📧","Reçu par email"]].map(([ico, lbl]) => (
                    <div key={lbl} style={{ textAlign:"center", fontSize:".78rem", color:"#94a3b8" }}>
                      <div style={{ fontSize:"1.2rem", marginBottom:3 }}>{ico}</div>{lbl}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ÉTAPE 2 - VOTRE PROJET (wizard style ParcoursModal) */}
          {step === "projet" && (() => {
            const PM_BLUE = "#0891b2";
            const PM_DARK = "#011451";
            const PM_NAVY = "#0c33ac";
            const PM_F    = "'Montserrat','Segoe UI',sans-serif";

            const pmPrimaryBtn = { width:"100%", background:`linear-gradient(135deg,${PM_BLUE},${PM_NAVY})`, color:"#fff", border:"none", borderRadius:999, padding:"12px", fontWeight:800, fontSize:".9rem", cursor:"pointer", fontFamily:PM_F, transition:"opacity .2s" };
            const pmBackBtn    = { background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:".82rem", marginBottom:16, display:"flex", alignItems:"center", gap:4, padding:0 };

            const pHeaderTitle = {
              0: "Comment souhaitez-vous apprendre ?",
              1: "Choisissez votre formule",
              1.5: "Choisissez votre cabinet",
              2: "Choisissez votre assistante",
              3.5: "Mode de paiement",
              4: "Conseillère assignée !",
            }[pStep] || "Votre projet de formation";

            const PMAv = ({ a, size = 48 }) => {
              const ini = `${a.prenom?.[0]||""}${a.nom?.[0]||""}`.toUpperCase();
              return a.photo_url
                ? <img src={a.photo_url} alt={a.prenom} style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} />
                : <div style={{ width:size, height:size, borderRadius:"50%", background:`linear-gradient(135deg,${PM_NAVY},${PM_BLUE})`, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:size*.3, flexShrink:0, fontFamily:PM_F }}>{ini||"?"}</div>;
            };

            const PMAvatarStack = ({ list = [], size = 28, max = 4 }) => {
              const shown = list.slice(0, max);
              const surplus = list.length - max;
              return (
                <div style={{ display:"flex", alignItems:"center" }}>
                  {shown.map((a, i) => (
                    <div key={a.id} style={{ marginLeft: i ? -size*.3 : 0, zIndex: max - i }}>
                      <PMAv a={a} size={size} />
                    </div>
                  ))}
                  {surplus > 0 && (
                    <div style={{ marginLeft:-size*.3, width:size, height:size, borderRadius:"50%", background:"#e2e8f0", display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*.28, fontWeight:800, color:"#64748b" }}>
                      +{surplus}
                    </div>
                  )}
                </div>
              );
            };

            const totalDots = 4;
            const dotStep   = pStep === 3.5 ? 3 : pStep === 1.5 ? 1 : Math.floor(pStep);

            return (
              <div style={{ ...S.card, maxWidth:1000, animation:"fltSI .45s ease", overflow:"hidden" }}>
                {/* Header */}
                <div style={{ background:`linear-gradient(135deg,${PM_DARK},${PM_NAVY})`, padding:"20px 24px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ color:"rgba(255,255,255,.6)", fontSize:".68rem", fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", marginBottom:4 }}>Parcours BET Languages</div>
                    <div style={{ color:"#fff", fontWeight:800, fontSize:"1rem", fontFamily:PM_F }}>{pHeaderTitle}</div>
                  </div>
                </div>

                {/* Body */}
                <div style={{ padding:"24px 24px 28px" }}>

                  {/* Step dots */}
                  {pStep < 4 && (
                    <div style={{ display:"flex", gap:6, justifyContent:"center", marginBottom:24 }}>
                      {Array.from({ length: totalDots }).map((_, i) => (
                        <div key={i} style={{ width: i === dotStep ? 22 : 8, height:8, borderRadius:999, background: i < dotStep ? "#22c55e" : i === dotStep ? PM_BLUE : "#e2e8f0", transition:"all .3s" }} />
                      ))}
                    </div>
                  )}

                  {/* Erreur */}
                  {pErreur && (
                    <div style={{ background:"#fff0f2", border:"1px solid #ffb3bc", borderRadius:10, padding:"10px 14px", color:"#ff2945", fontSize:".84rem", marginBottom:16 }}>
                      ⚠️ {pErreur}
                    </div>
                  )}

                  {/* Spinner */}
                  {pLoading && (
                    <div style={{ textAlign:"center", padding:40 }}>
                      <div style={{ width:32, height:32, border:"3px solid #e2e8f0", borderTopColor:PM_BLUE, borderRadius:"50%", animation:"fltSpin .8s linear infinite", margin:"0 auto 12px" }} />
                      <p style={{ color:"#64748b", fontSize:".88rem", margin:0 }}>Recherche en cours…</p>
                    </div>
                  )}

                  {/* ─── pStep 0 : Mode ─── */}
                  {pStep === 0 && !pLoading && (
                    <div style={{ animation:"pmFU .3s ease" }}>
                      <div className="pm-grid2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                        {[
                          { mode:"en_ligne",   icon:"💻", title:"Cours en ligne",   desc:"Coaching groupe ou privé, depuis chez vous.", tags:["Groupe","Privé"],                  color:PM_BLUE },
                          { mode:"presentiel", icon:"🏫", title:"En présentiel",    desc:"Dans l'un de nos cabinets en Côte d'Ivoire.", tags:["6 centres","Abidjan & Bouaké"], color:PM_NAVY },
                        ].map(o => (
                          <div key={o.mode} className="pm-card" onClick={() => pChoisirMode(o.mode)}
                            style={{ border:"2px solid #e2e8f0", borderRadius:16, padding:"22px 18px", cursor:"pointer", transition:"all .22s", textAlign:"center", background:"#fafafa" }}>
                            <div style={{ fontSize:"2.4rem", marginBottom:10 }}>{o.icon}</div>
                            <div style={{ fontWeight:800, color:PM_DARK, fontSize:".96rem", marginBottom:6, fontFamily:PM_F }}>{o.title}</div>
                            <div style={{ fontSize:".77rem", color:"#475569", lineHeight:1.6, marginBottom:12 }}>{o.desc}</div>
                            <div style={{ display:"flex", gap:6, justifyContent:"center", flexWrap:"wrap", marginBottom:14 }}>
                              {o.tags.map(t => <span key={t} style={{ background:o.color+"15", color:o.color, borderRadius:999, padding:"2px 10px", fontSize:".68rem", fontWeight:700 }}>{t}</span>)}
                            </div>
                            <div style={{ background:`linear-gradient(135deg,${o.color},${o.mode==="en_ligne"?PM_NAVY:PM_BLUE})`, color:"#fff", borderRadius:999, padding:"9px 0", fontWeight:800, fontSize:".82rem", fontFamily:PM_F }}>Choisir →</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ─── pStep 1 : offres en ligne (même design que ParcoursModal step 1) ─── */}
                  {pStep === 1 && !pLoading && (
                    <div style={{ animation:"pmFU .3s ease" }}>
                      <button onClick={() => setPStep(0)} style={pmBackBtn}>← Retour</button>
                      <p style={{ color:"#64748b", fontSize:".84rem", marginBottom:20, lineHeight:1.6 }}>
                        Découvrez nos formules de cours en ligne. Apprenez où que vous soyez, à votre rythme, avec nos assistantes dédiées.
                      </p>
                      {pOffresEnLigne.length === 0 ? (
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
                            {pOffresEnLigne.map((o, i) => {
                              const COLORS = [PM_BLUE, PM_NAVY, "#059669", "#d97706", "#7c3aed", "#ff2945"];
                              const col = COLORS[i % COLORS.length];
                              return (
                                <div key={o.id || i} className="pm-card"
                                  onClick={() => pChoisirOffreEnLigne(o)}
                                  style={{ border:"2px solid #e2e8f0", borderRadius:18, padding:"18px 16px", cursor:"pointer", transition:"all .22s", background:"#fafafa", display:"flex", flexDirection:"column", gap:10 }}>
                                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
                                    <div style={{ width:44, height:44, borderRadius:12, background:`${col}15`, border:`2px solid ${col}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.4rem", flexShrink:0 }}>
                                      {o.icon || "💻"}
                                    </div>
                                    <div style={{ textAlign:"right" }}>
                                      <div style={{ fontWeight:800, fontSize:".88rem", color:col, fontFamily:PM_F }}>{o.prix || "Sur devis"}</div>
                                      {o.duration && <div style={{ fontSize:".68rem", color:"#94a3b8", marginTop:1 }}>{o.duration}</div>}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontWeight:800, fontSize:".88rem", color:PM_DARK, fontFamily:PM_F, marginBottom:4, lineHeight:1.3 }}>{o.label}</div>
                                    {o.desc && <div style={{ fontSize:".74rem", color:"#64748b", lineHeight:1.5 }}>{o.desc}</div>}
                                  </div>
                                  {o.brochure_url && (
                                    <a href={o.brochure_url} download={o.brochure_nom || true} target="_blank" rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      style={{ display:"flex", alignItems:"center", gap:6, background:"#eef1ff", border:"1.5px solid #bae6fd", borderRadius:8, padding:"6px 10px", textDecoration:"none", marginTop:"auto" }}>
                                      <span style={{ fontSize:".8rem" }}>📄</span>
                                      <span style={{ fontSize:".7rem", fontWeight:700, color:PM_BLUE, flex:1 }}>{o.brochure_nom || "Télécharger la brochure"}</span>
                                      <span style={{ fontSize:".62rem", fontWeight:700, color:"#94a3b8", background:"#f1f5f9", borderRadius:4, padding:"1px 5px" }}>PDF</span>
                                    </a>
                                  )}
                                  <div style={{ background:`linear-gradient(135deg,${col},${PM_NAVY})`, color:"#fff", borderRadius:999, padding:"8px 0", fontWeight:800, fontSize:".74rem", textAlign:"center", fontFamily:PM_F, marginTop:"auto" }}>
                                    Choisir cette offre →
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ textAlign:"center" }}>
                            <button onClick={pContinuerSansOffreEnLigne}
                              style={{ background:"none", border:"none", color:"#94a3b8", fontSize:".78rem", cursor:"pointer", textDecoration:"underline", fontFamily:PM_F }}>
                              Continuer sans sélectionner d'offre →
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* ─── pStep 1.5 présentiel : cabinets (même design que ParcoursModal p1) ─── */}
                  {pStep === 1.5 && !pLoading && (
                    <div style={{ animation:"pmFU .3s ease" }}>
                      <button onClick={() => setPStep(0)} style={pmBackBtn}>← Retour</button>
                      <p style={{ color:"#64748b", fontSize:".82rem", marginBottom:16, lineHeight:1.6 }}>
                        Sélectionnez un cabinet et choisissez votre formule pour continuer.
                      </p>
                      {pCentres.length === 0
                        ? <p style={{ color:"#94a3b8", textAlign:"center", padding:20 }}>Chargement des centres…</p>
                        : (
                          <div className="pm-centre-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                            {pCentres.map(c => {
                              const master     = pFindMaster(c);
                              const color      = master?.color || PM_NAVY;
                              const offres     = (master?.offres || []).filter(o => o.actif !== false);
                              const assistList = pCentreAssistantesMap[c.id] || [];
                              const isOpen_    = pSelectedCentreCard === c.id;
                              const offreOk    = isOpen_ && pOffreChoisie && pSelectedCentreCard === c.id;
                              const prixList   = offres.map(o => parseInt((o.prix||"").replace(/\D/g,""))||0).filter(Boolean);
                              const minPrix    = prixList.length ? Math.min(...prixList) : null;
                              return (
                                <div key={c.id}
                                  onClick={() => setPSelectedCentreCard(isOpen_ ? null : c.id)}
                                  style={{ gridColumn: isOpen_ ? "1 / -1" : "auto",
                                    border:`2px solid ${isOpen_ ? color : "#e2e8f0"}`, borderRadius:16,
                                    background: isOpen_ ? `${color}06` : "#fff",
                                    cursor:"pointer", transition:"all .22s", overflow:"hidden",
                                    boxShadow: isOpen_ ? `0 8px 24px ${color}20` : "none" }}>
                                  <div style={{ height:4, background: isOpen_ ? color : "#e2e8f0", transition:"background .2s" }} />
                                  <div style={{ padding:"14px 16px" }}>
                                    <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:10 }}>
                                      <div style={{ width:42, height:42, borderRadius:10, background:`${color}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.3rem", flexShrink:0 }}>🏢</div>
                                      <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontWeight:800, fontSize:".9rem", color: isOpen_ ? color : PM_DARK, lineHeight:1.2 }}>{c.nom}</div>
                                        {c.ville && <div style={{ fontSize:".72rem", color:"#64748b", marginTop:2 }}>{c.ville}</div>}
                                        {c.adresse && <div style={{ fontSize:".68rem", color:"#94a3b8", marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.adresse}</div>}
                                      </div>
                                      <div style={{ color: isOpen_ ? color : "#94a3b8", fontWeight:800, fontSize:"1rem", transition:"transform .2s", transform: isOpen_ ? "rotate(90deg)" : "none" }}>›</div>
                                    </div>
                                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                        {assistList.length > 0
                                          ? <PMAvatarStack list={assistList} size={28} max={4} />
                                          : <span style={{ fontSize:".7rem", color:"#94a3b8" }}>-</span>
                                        }
                                        {assistList.length > 0 && (
                                          <span style={{ fontSize:".7rem", color:"#64748b", fontWeight:600 }}>
                                            {assistList.length} assistante{assistList.length > 1 ? "s" : ""}
                                          </span>
                                        )}
                                      </div>
                                      {minPrix && (
                                        <span style={{ background:`${color}12`, color, borderRadius:999, padding:"2px 8px", fontSize:".66rem", fontWeight:800 }}>
                                          Dès {minPrix.toLocaleString("fr")} F
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {isOpen_ && (
                                    <div style={{ borderTop:`1px solid ${color}30`, padding:"14px 16px", animation:"pmFU .2s ease" }}
                                      onClick={e => e.stopPropagation()}>
                                      {master?.brochure_url && (
                                        <a href={master.brochure_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                          style={{ display:"flex", alignItems:"center", gap:6, background:"#eef1ff", border:"1.5px solid #bae6fd", borderRadius:8, padding:"7px 10px", marginBottom:14, textDecoration:"none" }}>
                                          <span style={{ fontSize:".9rem" }}>📄</span>
                                          <span style={{ fontSize:".72rem", fontWeight:700, color:PM_BLUE, flex:1 }}>Télécharger la brochure</span>
                                          <span style={{ fontSize:".62rem", fontWeight:700, color:"#94a3b8", background:"#f1f5f9", borderRadius:4, padding:"1px 5px" }}>PDF</span>
                                        </a>
                                      )}
                                      {offres.length === 0 ? (
                                        <p style={{ fontSize:".78rem", color:"#94a3b8", margin:"0 0 12px", textAlign:"center" }}>Contactez-nous pour les tarifs.</p>
                                      ) : (
                                        <>
                                          <p style={{ fontSize:".72rem", fontWeight:700, color:"#374151", marginBottom:10, textTransform:"uppercase", letterSpacing:".05em" }}>
                                            Choisissez votre formule
                                          </p>
                                          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:14 }}>
                                            {offres.map((o, i) => {
                                              const sel = pOffreChoisie?.label === o.label && pSelectedCentreCard === c.id;
                                              return (
                                                <div key={i} onClick={() => setPOffreChoisie(o)}
                                                  style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 13px", borderRadius:12,
                                                    border:`2px solid ${sel ? color : "#e2e8f0"}`,
                                                    background: sel ? `${color}08` : "#f8fafc",
                                                    cursor:"pointer", transition:"all .15s" }}>
                                                  <div style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${sel ? color : "#cbd5e1"}`,
                                                    background: sel ? color : "#fff", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                                                    {sel && <div style={{ width:7, height:7, borderRadius:"50%", background:"#fff" }} />}
                                                  </div>
                                                  <div style={{ flex:1, minWidth:0 }}>
                                                    <div style={{ fontWeight:700, fontSize:".82rem", color: sel ? color : PM_DARK }}>{o.label}</div>
                                                    {o.desc && <div style={{ fontSize:".7rem", color:"#64748b", marginTop:1 }}>{o.desc}</div>}
                                                  </div>
                                                  <div style={{ textAlign:"right", flexShrink:0 }}>
                                                    <div style={{ fontWeight:800, fontSize:".82rem", color: sel ? color : PM_DARK }}>{o.prix}</div>
                                                    {o.duration && <div style={{ fontSize:".66rem", color:"#94a3b8" }}>{o.duration}</div>}
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </>
                                      )}
                                      <button onClick={() => pChoisirCentre(c)}
                                        disabled={offres.length > 0 && !offreOk}
                                        style={{ width:"100%", padding:"11px", borderRadius:999,
                                          background: (offres.length === 0 || offreOk) ? `linear-gradient(135deg,${color},${PM_DARK})` : "#e5e7eb",
                                          color: (offres.length === 0 || offreOk) ? "#fff" : "#94a3b8",
                                          border:"none", cursor: (offres.length === 0 || offreOk) ? "pointer" : "default",
                                          fontWeight:800, fontSize:".84rem", fontFamily:PM_F, transition:"all .2s" }}>
                                        {offres.length > 0 && !offreOk
                                          ? "Sélectionnez une formule ↑"
                                          : `Continuer avec ${c.nom.replace(/^BET\s*/i,"")} →`}
                                      </button>
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

                  {/* ─── pStep 2 en_ligne : assistantes (même design que ParcoursModal step 2) ─── */}
                  {pStep === 2 && pModeCours === "en_ligne" && !pLoading && (
                    <div style={{ animation:"pmFU .3s ease" }}>
                      <button onClick={() => setPStep(1)} style={pmBackBtn}>← Retour aux offres</button>
                      {pOffreChoisie && (
                        <div style={{ display:"flex", alignItems:"center", gap:10, background:"#eef1ff", border:"1.5px solid #bae6fd", borderRadius:12, padding:"10px 14px", marginBottom:16 }}>
                          <span style={{ fontSize:"1.1rem" }}>{pOffreChoisie.icon || "💻"}</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:800, fontSize:".82rem", color:PM_DARK }}>{pOffreChoisie.label}</div>
                            <div style={{ fontSize:".72rem", color:"#64748b" }}>{pOffreChoisie.prix}{pOffreChoisie.duration ? ` · ${pOffreChoisie.duration}` : ""}</div>
                          </div>
                          <button onClick={() => { setPOffreChoisie(null); setPStep(1); }} style={{ background:"none", border:"none", fontSize:".72rem", color:"#94a3b8", cursor:"pointer", fontWeight:700 }}>Changer</button>
                        </div>
                      )}
                      <p style={{ color:"#64748b", fontSize:".84rem", marginBottom:16, lineHeight:1.6 }}>
                        Choisissez l'assistante qui vous accompagnera tout au long de votre parcours en ligne.
                      </p>
                      {pAssistantes.length === 0 ? (
                        <div style={{ textAlign:"center", padding:"32px 20px", background:"#f8fafc", borderRadius:14, border:"1.5px dashed #e2e8f0" }}>
                          <div style={{ fontSize:"1.8rem", marginBottom:10 }}>😔</div>
                          <p style={{ color:"#475569", fontSize:".86rem", lineHeight:1.6, margin:0 }}>Toutes nos assistantes ont atteint leur quota aujourd'hui.<br/><strong>Contactez-nous directement.</strong></p>
                        </div>
                      ) : (
                        <div className="pm-assist-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
                          {pAssistantes.map(a => {
                            const placesRestantes = (a.quota_jour || 5) - (a.prises_aujourd_hui || 0);
                            const wa = a.telephone
                              ? `https://wa.me/${a.telephone.replace(/\D/g,"")}?text=${encodeURIComponent(`Bonjour ${a.prenom}, je souhaite m'inscrire à un cours BET en ligne${pOffreChoisie ? ` - ${pOffreChoisie.label}` : ""}.`)}`
                              : null;
                            return (
                              <div key={a.id} className="pm-assist-card" onClick={() => pChoisirAssistante(a)}
                                style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10, border:"2px solid #e2e8f0", borderRadius:18, padding:"20px 14px 16px", cursor:"pointer", transition:"all .22s", background:"#fff", textAlign:"center" }}>
                                <div style={{ position:"relative" }}>
                                  <PMAv a={a} size={72} />
                                  <span style={{ position:"absolute", bottom:0, right:0, width:16, height:16, borderRadius:"50%", background:"#22c55e", border:"2.5px solid #fff" }} />
                                </div>
                                <div>
                                  <div style={{ fontWeight:800, fontSize:".88rem", color:PM_DARK, fontFamily:PM_F, lineHeight:1.3 }}>{a.prenom} {a.nom}</div>
                                  <div style={{ fontSize:".68rem", color:"#94a3b8", marginTop:3 }}>Assistante · En ligne</div>
                                </div>
                                {a.telephone && (
                                  <div style={{ fontSize:".72rem", color:"#334155", fontWeight:600 }}>📞 {a.telephone}</div>
                                )}
                                <span style={{ background:`${PM_BLUE}14`, color:PM_BLUE, borderRadius:999, padding:"3px 10px", fontSize:".66rem", fontWeight:700 }}>
                                  {placesRestantes} place{placesRestantes > 1 ? "s" : ""} restante{placesRestantes > 1 ? "s" : ""}
                                </span>
                                {wa && (
                                  <a href={wa} target="_blank" rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:5, width:"100%", padding:"8px 0", background:"#25d366", color:"#fff", borderRadius:999, textDecoration:"none", fontWeight:700, fontSize:".74rem", fontFamily:PM_F, marginTop:"auto" }}>
                                    <span>💬</span> WhatsApp
                                  </a>
                                )}
                                <div style={{ width:"100%", padding:"7px 0", background:`linear-gradient(135deg,${PM_BLUE},${PM_NAVY})`, color:"#fff", borderRadius:999, fontWeight:800, fontSize:".72rem", fontFamily:PM_F }}>
                                  Choisir →
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─── pStep 2 présentiel : assistantes (même design que ParcoursModal p2) ─── */}
                  {pStep === 2 && pModeCours === "presentiel" && !pLoading && (
                    <div style={{ animation:"pmFU .3s ease" }}>
                      <button onClick={() => { setPStep(1.5); setPSelectedCentreCard(pCentreChoisi?.id); }} style={pmBackBtn}>← Retour</button>
                      {pOffreChoisie && (
                        <div style={{ display:"flex", alignItems:"center", gap:10, background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:10, padding:"10px 14px", marginBottom:16 }}>
                          <span style={{ fontSize:"1rem" }}>✅</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:700, fontSize:".82rem", color:"#065f46" }}>{pOffreChoisie.label}</div>
                            <div style={{ fontSize:".72rem", color:"#047857" }}>{pOffreChoisie.prix}{pOffreChoisie.duration ? ` · ${pOffreChoisie.duration}` : ""}</div>
                          </div>
                          <button onClick={() => setPStep(1.5)} style={{ background:"none", border:"none", fontSize:".7rem", color:"#059669", cursor:"pointer", fontWeight:700 }}>Changer</button>
                        </div>
                      )}
                      <p style={{ color:"#64748b", fontSize:".84rem", marginBottom:16 }}>
                        {pAssistantes.length} assistante{pAssistantes.length > 1 ? "s" : ""} - {pCentreChoisi?.nom}
                      </p>
                      {pAssistantes.length === 0 ? (
                        <div style={{ textAlign:"center", padding:"32px 20px", background:"#f8fafc", borderRadius:14, border:"1.5px dashed #e2e8f0" }}>
                          <div style={{ fontSize:"1.8rem", marginBottom:10 }}>😔</div>
                          <p style={{ color:"#475569", fontSize:".86rem", lineHeight:1.6 }}>
                            Aucune assistante assignée à ce centre.<br/>
                            <strong>Contactez-nous directement</strong> pour être pris(e) en charge.
                          </p>
                        </div>
                      ) : (
                        <div className="pm-assist-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                          {pAssistantes.map(a => {
                            const JOURS_SEMAINE_ = ["lundi","mardi","mercredi","jeudi","vendredi"];
                            const JOURS_WEEKEND_ = ["samedi","dimanche"];
                            const JOURS_COURT_   = { lundi:"Lun", mardi:"Mar", mercredi:"Mer", jeudi:"Jeu", vendredi:"Ven", samedi:"Sam", dimanche:"Dim" };
                            const jours      = a.jours_travail || JOURS_SEMAINE_;
                            const hasSemaine = jours.some(j => JOURS_SEMAINE_.includes(j));
                            const hasWeekend = jours.some(j => JOURS_WEEKEND_.includes(j));
                            const master     = pFindMaster(pCentreChoisi || {});
                            const color      = master?.color || PM_NAVY;
                            return (
                              <div key={a.id} className="pm-assist-card" onClick={() => pChoisirAssistante(a)}
                                style={{ border:"2px solid #e2e8f0", borderRadius:18, padding:"18px 14px", cursor:"pointer", transition:"all .22s", background:"#fff", textAlign:"center" }}>
                                <div style={{ display:"flex", justifyContent:"center", marginBottom:10 }}>
                                  <PMAv a={a} size={68} />
                                </div>
                                <div style={{ fontWeight:800, fontSize:".9rem", color:PM_DARK, marginBottom:2 }}>{a.prenom} {a.nom}</div>
                                <div style={{ fontSize:".72rem", color:"#94a3b8", marginBottom: a.telephone ? 4 : 8 }}>Assistante BET</div>
                                {a.telephone && (
                                  <div style={{ fontSize:".72rem", color:PM_BLUE, fontWeight:700, marginBottom:8 }}>📞 {a.telephone}</div>
                                )}
                                <div style={{ marginBottom:8 }}>
                                  <div style={{ display:"flex", gap:3, justifyContent:"center", flexWrap:"wrap" }}>
                                    {jours.map(j => (
                                      <span key={j} style={{ fontSize:".58rem", fontWeight:800, padding:"2px 6px", borderRadius:4, background: JOURS_WEEKEND_.includes(j) ? "#fef3c7" : "#eef1ff", color: JOURS_WEEKEND_.includes(j) ? "#92400e" : "#0c33ac" }}>
                                        {JOURS_COURT_[j] || j}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div style={{ display:"flex", gap:5, justifyContent:"center", flexWrap:"wrap", marginBottom:12 }}>
                                  {hasSemaine && <span style={{ fontSize:".65rem", padding:"3px 8px", borderRadius:999, background:"#eef1ff", color:"#0c33ac", fontWeight:700 }}>📆 Semaine</span>}
                                  {hasWeekend && <span style={{ fontSize:".65rem", padding:"3px 8px", borderRadius:999, background:"#fef3c7", color:"#92400e", fontWeight:700 }}>📅 Weekend</span>}
                                </div>
                                <div style={{ background:`linear-gradient(135deg,${color},${PM_DARK})`, color:"#fff", borderRadius:999, padding:"8px 0", fontWeight:800, fontSize:".76rem", fontFamily:PM_F }}>
                                  Choisir →
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─── pStep 3.5 : Paiement - Coaching de groupe ─── */}
                  {pStep === 3.5 && (
                    <div style={{ animation:"pmFU .3s ease" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:12, background:"#eef1ff", border:"1.5px solid #bae6fd", borderRadius:12, padding:"12px 14px", marginBottom:20 }}>
                        <PMAv a={pAssistante} size={40} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:800, fontSize:".85rem", color:PM_DARK }}>{pAssistante?.prenom} {pAssistante?.nom}</div>
                          <div style={{ fontSize:".72rem", color:"#64748b" }}>
                            {pModeCours === "en_ligne" ? "En ligne" : `Présentiel · ${pCentreChoisi?.nom || ""}`} · Coaching de groupe
                          </div>
                        </div>
                        <span style={{ background:"#f0fdf4", color:"#16a34a", borderRadius:999, padding:"3px 10px", fontSize:".7rem", fontWeight:700, flexShrink:0 }}>✓ Sélectionnée</span>
                      </div>
                      <button
                        onClick={() => pDoSubmit(pAssistante)}
                        disabled={pSubmitting}
                        style={{ ...pmPrimaryBtn, opacity:pSubmitting?.5:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
                      >
                        {pSubmitting
                          ? <><div style={{ width:14,height:14,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"fltSpin .7s linear infinite" }} />Assignation…</>
                          : "Confirmer mon inscription →"}
                      </button>
                    </div>
                  )}

                  {/* ─── pStep 4 : Succès → passer le test ─── */}
                  {pStep === 4 && (
                    <div style={{ animation:"pmFU .4s ease" }}>
                      <div style={{ textAlign:"center", marginBottom:22 }}>
                        <div style={{ width:70,height:70,borderRadius:"50%",background:"linear-gradient(135deg,#22c55e,#16a34a)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"2rem",margin:"0 auto 14px",boxShadow:"0 8px 24px rgba(34,197,94,.3)" }}>✓</div>
                        <h3 style={{ fontFamily:PM_F, color:PM_DARK, fontWeight:800, fontSize:"1.2rem", margin:"0 0 6px" }}>Assistante assignée !</h3>
                        <p style={{ color:"#475569", fontSize:".86rem", lineHeight:1.6, margin:0 }}>
                          <strong>{pAssistante?.prenom} {pAssistante?.nom}</strong> a été notifiée et vous contactera après votre test.
                        </p>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:14, background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:14, padding:"14px 16px", marginBottom:20 }}>
                        <PMAv a={pAssistante} size={50} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:800, color:PM_DARK, fontSize:".95rem" }}>{pAssistante?.prenom} {pAssistante?.nom}</div>
                          <div style={{ fontSize:".74rem", color:"#64748b", marginTop:2 }}>
                            {pModeCours==="en_ligne" ? `En ligne · ${pTypeCoaching==="groupe"?"Groupe":"Privé"}` : `Présentiel · ${pCentreChoisi?.nom||""}`}
                          </div>
                          {pAssistante?.telephone && <div style={{ fontSize:".74rem", color:PM_BLUE, marginTop:3 }}>📞 {pAssistante.telephone}</div>}
                        </div>
                        <span style={{ background:"#dcfce7", color:"#16a34a", borderRadius:999, padding:"4px 10px", fontSize:".7rem", fontWeight:800, flexShrink:0 }}>✓ Assignée</span>
                      </div>
                      {pAssistante?.telephone && (
                        <a
                          href={`https://wa.me/${(pAssistante.telephone||"").replace(/[\s+\-()]/g,"")}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ display:"flex", alignItems:"center", gap:12, background:"#22c55e", color:"#fff", borderRadius:12, padding:"12px 18px", textDecoration:"none", fontWeight:800, fontSize:".9rem", fontFamily:PM_F, marginBottom:10 }}
                        >
                          <svg width="20" height="20" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="16" fill="#fff" fillOpacity=".2"/><path d="M23.5 19.9c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2c-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.9-1.6.1-.2 0-.4-.1-.5-.1-.2-.7-1.8-1-2.4-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1.1 1.1-1.1 2.6s1.1 3 1.3 3.2c.2.2 2.2 3.4 5.3 4.7 2 .9 2.7.9 3.7.8.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3z" fill="#fff"/></svg>
                          Écrire sur WhatsApp
                        </a>
                      )}
                      <button onClick={() => setStep("quiz")}
                        style={{ ...pmPrimaryBtn, display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
                        <span style={{ fontSize:"1.1rem" }}>🎯</span>
                        Passer le test maintenant →
                      </button>
                    </div>
                  )}

                </div>
              </div>
            );
          })()}

          {/* ÉTAPE 3 - QUIZ : règles d'intégrité (une fois, avant la 1ère section) */}
          {step === "quiz" && quizPhase === "rules" && (
            <IntegrityGate onContinue={() => setQuizPhase("intro")} />
          )}

          {/* ÉTAPE 3 - QUIZ : instructions + exemple fusionnés, avant chaque nouvelle catégorie */}
          {step === "quiz" && quizPhase === "intro" && q && (
            <SectionIntro
              category={q.category}
              type={q.type}
              sectionIndex={sections.indexOf(q.category)}
              totalSections={sections.length}
              onStart={() => setQuizPhase("live")}
            />
          )}

          {/* ÉTAPE 3 - QUIZ : questions réelles chronométrées */}
          {step === "quiz" && quizPhase === "live" && q && (() => {
            const qTypeMeta = Q_TYPE_LABEL[q.type] || Q_TYPE_LABEL.qcm;
            const isQcmLike = ["qcm","audio_qcm","lecture_qcm"].includes(q.type);
            const opts      = (q.options || []).filter(Boolean);

            return (
              <div style={{ ...S.card, maxWidth:700, animation:"fltSI .35s ease" }}>
                {/* Header */}
                <div style={S.quizTop}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                    <span style={S.quizQLabel}>Question <strong>{currentQ+1}</strong>/{questions.length}</span>
                    <span style={{ ...S.catChip, background:"#f1f5f9", color:"#475569" }}>
                      {qTypeMeta.icon} {qTypeMeta.label}
                    </span>
                    <span style={{ ...S.catChip, background:cs.bg, color:cs.c }}>{q.category}</span>
                    <span style={S.cefrChip}>{q.cefr}</span>
                    {q.type !== "libre" && <span style={S.ptsChip}>{q.points||1} pt{(q.points||1)>1?"s":""}</span>}
                  </div>
                  <span style={{ fontSize:".82rem", color:"#64748b" }}>{answered}/{questions.length} répondues</span>
                </div>

                <div style={{ padding:"0 24px 4px" }}>
                  <PBar value={answeredRequired} max={requiredCount} color="#10b981" height={6} />
                </div>

                {/* Indicateurs de progression - non cliquables : impossible de revenir
                    sur une question déjà passée ou de sauter en avant. */}
                <div style={S.dotsRow}>
                  {questions.map((qq, i) => (
                    <span key={qq.id} className="flt-nav-dot" style={{
                      ...S.dot,
                      width: i === currentQ ? 26 : 10,
                      borderRadius: i === currentQ ? 5 : "50%",
                      background: i === currentQ ? "#ff2945" : answers[qq.id] ? "#10b981" : "#e2e8f0",
                      boxShadow: i === currentQ ? "0 0 8px rgba(220,38,38,.4)" : "none",
                      cursor: "default",
                    }} />
                  ))}
                </div>

                <div style={S.cardBody}>

                  {/* ── SPEAKING : audio stimulus + enregistreur ── */}
                  {q.type === "speaking" && (
                    <div>
                      {q.audio_url && (
                        <div style={S.audioBox}>
                          <div style={S.audioLabel}>
                            🎧 <strong>Écoutez cet audio</strong>, puis enregistrez votre réponse orale ci-dessous
                          </div>
                          <audio key={q.audio_url} controls controlsList="nodownload" crossOrigin="anonymous"
                            src={q.audio_url} style={{ width:"100%", borderRadius:12, marginTop:10 }} />
                          <p style={{ fontSize:".78rem", color:"#9d174d", margin:"8px 0 0", fontWeight:600 }}>
                            💡 Vous pouvez écouter plusieurs fois avant d'enregistrer
                          </p>
                        </div>
                      )}
                      <AudioRecorder
                        key={q.id}
                        existingUrl={answers[q.id]?.startsWith("http") ? answers[q.id] : null}
                        onRecordingComplete={(url) => setAnswers(p => ({ ...p, [q.id]: url || "" }))}
                      />
                    </div>
                  )}

                  {/* ── LISTENING : lecteur audio ou script texte ── */}
                  {q.type === "audio_qcm" && (
                    q.audio_url ? (
                      <div style={S.audioBox}>
                        <div style={S.audioLabel}>🎧 <strong>Écoutez attentivement</strong>, puis répondez à la question ci-dessous</div>
                        <audio key={q.audio_url} controls controlsList="nodownload" crossOrigin="anonymous" src={q.audio_url} style={{ width:"100%", borderRadius:12, marginTop:10 }} />
                        <p style={{ fontSize:".78rem", color:"#9d174d", margin:"8px 0 0", fontWeight:600 }}>💡 Vous pouvez écouter plusieurs fois avant de répondre</p>
                      </div>
                    ) : q.script ? (
                      <div style={{ background:"#fdf2f8", border:"1.5px solid #f0abfc", borderRadius:14, padding:"16px 18px", marginBottom:16 }}>
                        <div style={{ fontSize:".82rem", fontWeight:700, color:"#9d174d", marginBottom:10 }}>🎧 Transcript de l'audio - lisez attentivement</div>
                        <div style={{ fontSize:".84rem", color:"#374151", lineHeight:1.75, whiteSpace:"pre-wrap", background:"#fff", borderRadius:8, padding:"12px 14px", border:"1px solid #f0abfc40" }}>
                          {q.script}
                        </div>
                      </div>
                    ) : null
                  )}

                  {/* ── READING : passage texte ── */}
                  {q.type === "lecture_qcm" && q.passage && (
                    <div style={S.passageBox}>
                      <div style={S.passageLabel}>📖 <strong>Lisez ce texte</strong> puis répondez à la question :</div>
                      <div style={S.passageTxt}>{q.passage}</div>
                    </div>
                  )}

                  {/* ── Texte question ── */}
                  {q.text && <p style={S.questionTxt}>{q.text}</p>}

                  {/* ── QCM (qcm / audio_qcm / lecture_qcm) ── */}
                  {isQcmLike && opts.length > 0 && (
                    <div style={{ ...S.optsGrid, gridTemplateColumns: opts.length === 2 ? "1fr 1fr" : "1fr 1fr" }}>
                      {opts.map((opt, idx) => {
                        const sel = answers[q.id] === opt;
                        return (
                          <button key={idx} className={sel ? "" : "flt-opt"} style={{
                            ...S.opt,
                            border: sel ? "2px solid #ff2945" : "1.5px solid #e2e8f0",
                            background: sel ? "#fff0f2" : "#fff",
                            color: sel ? "#ff2945" : "#334155",
                            fontWeight: sel ? 700 : 500,
                            transform: sel ? "scale(1.01)" : "scale(1)",
                          }} onClick={() => handleAnswer(q.id, opt)}>
                            <span style={{ ...S.optRadio, borderColor: sel?"#ff2945":"#d1d5db", background: sel?"#ff2945":"transparent" }}>
                              {sel && <span style={{ width:7, height:7, borderRadius:"50%", background:"#fff", display:"block" }} />}
                            </span>
                            <span style={S.optLetter}>{["A","B","C","D","E","F"][idx]}</span>
                            <span style={{ flex:1, textAlign:"left", lineHeight:1.4 }}>{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Ne pas répondre - choix explicite, compte automatiquement 0 ── */}
                  {isQcmLike && opts.length > 0 && (() => {
                    const skipSel = answers[q.id] === SKIP_SENTINEL;
                    return (
                      <button onClick={() => handleAnswer(q.id, SKIP_SENTINEL)} style={{
                        width:"100%", marginTop:10, padding:"10px 14px", borderRadius:10,
                        border: skipSel ? "2px solid #94a3b8" : "1.5px dashed #cbd5e1",
                        background: skipSel ? "#f1f5f9" : "transparent",
                        color: skipSel ? "#334155" : "#94a3b8",
                        fontWeight: skipSel ? 700 : 500, fontSize:".85rem", cursor:"pointer",
                      }}>
                        {skipSel ? "✓ " : ""}🚫 Ne pas répondre à cette question (comptera 0 point)
                      </button>
                    );
                  })()}

                  {/* ── VRAI / FAUX ── */}
                  {q.type === "vrai_faux" && (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, margin:"8px 0 20px" }}>
                      {["Vrai","Faux"].map(opt => {
                        const sel = answers[q.id] === opt;
                        return (
                          <button key={opt} onClick={() => handleAnswer(q.id, opt)} style={{
                            padding:"20px 12px", borderRadius:16, fontWeight:800, fontSize:"1.1rem",
                            border: sel ? "2.5px solid #ff2945" : "1.5px solid #e2e8f0",
                            background: sel ? "#fff0f2" : "#fff",
                            color: sel ? "#ff2945" : "#334155",
                            cursor:"pointer", transition:"all .2s",
                            display:"flex", flexDirection:"column", alignItems:"center", gap:8,
                            boxShadow: sel ? "0 4px 16px rgba(220,38,38,.15)" : "none",
                          }}>
                            <span style={{ fontSize:"2rem" }}>{opt==="Vrai"?"✅":"❌"}</span>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Ne pas répondre - choix explicite, compte automatiquement 0 ── */}
                  {q.type === "vrai_faux" && (() => {
                    const skipSel = answers[q.id] === SKIP_SENTINEL;
                    return (
                      <button onClick={() => handleAnswer(q.id, SKIP_SENTINEL)} style={{
                        width:"100%", marginTop:-8, marginBottom:20, padding:"10px 14px", borderRadius:10,
                        border: skipSel ? "2px solid #94a3b8" : "1.5px dashed #cbd5e1",
                        background: skipSel ? "#f1f5f9" : "transparent",
                        color: skipSel ? "#334155" : "#94a3b8",
                        fontWeight: skipSel ? 700 : 500, fontSize:".85rem", cursor:"pointer",
                      }}>
                        {skipSel ? "✓ " : ""}🚫 Ne pas répondre à cette question (comptera 0 point)
                      </button>
                    );
                  })()}

                  {/* ── TEXTE À TROUS ── */}
                  {q.type === "texte_trous" && (
                    <div style={{ margin:"4px 0 20px" }}>
                      <p style={{ fontSize:".84rem", color:"#475569", marginBottom:10 }}>
                        ✏️ <strong>Complétez la phrase</strong> en tapant le mot manquant :
                      </p>
                      {answers[q.id] === SKIP_SENTINEL ? (
                        <div style={{ maxWidth:320, margin:"0 auto", textAlign:"center" }}>
                          <div style={{ padding:"12px 16px", borderRadius:10, background:"#f1f5f9", border:"1.5px solid #cbd5e1", color:"#334155", fontWeight:600, fontSize:".9rem" }}>
                            🚫 Question sautée - comptera 0 point
                          </div>
                          <button onClick={() => setAnswers(p => ({ ...p, [q.id]: "" }))} style={{ marginTop:8, background:"none", border:"none", color:"#0891b2", fontSize:".8rem", fontWeight:700, cursor:"pointer", textDecoration:"underline" }}>
                            Répondre quand même
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            placeholder="Votre réponse…"
                            value={answers[q.id] || ""}
                            onChange={e => setAnswers(p => ({ ...p, [q.id]: e.target.value }))}
                            onFocus={e => { e.currentTarget.style.borderColor="#ff2945"; e.currentTarget.style.boxShadow="0 0 0 3px rgba(220,38,38,.1)"; }}
                            onBlur={e  => { e.currentTarget.style.borderColor="#e2e8f0"; e.currentTarget.style.boxShadow="none"; }}
                            style={{ ...S.input, fontSize:"1.05rem", fontWeight:600, textAlign:"center", letterSpacing:".05em", maxWidth:320, margin:"0 auto", display:"block" }}
                          />
                          <p style={{ fontSize:".76rem", color:"#94a3b8", textAlign:"center", marginTop:8 }}>
                            La casse n'a pas d'importance (majuscules/minuscules)
                          </p>
                          <button onClick={() => handleAnswer(q.id, SKIP_SENTINEL)} style={{
                            display:"block", margin:"14px auto 0", padding:"10px 14px", borderRadius:10,
                            border:"1.5px dashed #cbd5e1", background:"transparent", color:"#94a3b8",
                            fontWeight:500, fontSize:".85rem", cursor:"pointer", maxWidth:320, width:"100%",
                          }}>
                            🚫 Ne pas répondre à cette question (comptera 0 point)
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* ── QUESTION LIBRE (Writing) ── */}
                  {q.type === "libre" && (
                    <div style={{ margin:"4px 0 20px" }}>
                      <div style={{ background:"#faf5ff", border:"1px solid #ddd6fe", borderRadius:12, padding:"12px 16px", marginBottom:14 }}>
                        <p style={{ margin:0, fontSize:".84rem", color:"#6d28d9", fontWeight:600 }}>
                          ✍️ <strong>Expression écrite</strong> - Répondez en anglais dans le champ ci-dessous.
                          <span style={{ fontWeight:400, display:"block", marginTop:4, color:"#7c3aed" }}>
                            Votre réponse sera corrigée par votre conseillère BET sous 24h.
                            {q.minWords && ` Minimum : ~${q.minWords} mots.`}
                          </span>
                        </p>
                      </div>
                      {answers[q.id] === SKIP_SENTINEL ? (
                        <div style={{ textAlign:"center" }}>
                          <div style={{ padding:"12px 16px", borderRadius:10, background:"#f1f5f9", border:"1.5px solid #cbd5e1", color:"#334155", fontWeight:600, fontSize:".9rem" }}>
                            🚫 Question sautée - comptera 0 point
                          </div>
                          <button onClick={() => setAnswers(p => ({ ...p, [q.id]: "" }))} style={{ marginTop:8, background:"none", border:"none", color:"#0891b2", fontSize:".8rem", fontWeight:700, cursor:"pointer", textDecoration:"underline" }}>
                            Répondre quand même
                          </button>
                        </div>
                      ) : (
                        <>
                          <textarea
                            placeholder="Write your answer in English here…"
                            value={answers[q.id] || ""}
                            onChange={e => setAnswers(p => ({ ...p, [q.id]: e.target.value }))}
                            rows={7}
                            onFocus={e => { e.currentTarget.style.borderColor="#7c3aed"; e.currentTarget.style.boxShadow="0 0 0 3px rgba(124,58,237,.1)"; }}
                            onBlur={e  => { e.currentTarget.style.borderColor="#e2e8f0"; e.currentTarget.style.boxShadow="none"; }}
                            style={{ ...S.input, resize:"vertical", fontSize:".95rem", lineHeight:1.7 }}
                          />
                          <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
                            <span style={{ fontSize:".76rem", color:"#94a3b8" }}>
                              {(answers[q.id]||"").trim().split(/\s+/).filter(Boolean).length} mots
                              {q.minWords ? ` / min. ${q.minWords}` : ""}
                            </span>
                            <span style={{ fontSize:".76rem", color:"#94a3b8" }}>{(answers[q.id]||"").length} caractères</span>
                          </div>
                          <button onClick={() => handleAnswer(q.id, SKIP_SENTINEL)} style={{
                            display:"block", margin:"10px auto 0", padding:"10px 14px", borderRadius:10,
                            border:"1.5px dashed #cbd5e1", background:"transparent", color:"#94a3b8",
                            fontWeight:500, fontSize:".85rem", cursor:"pointer", maxWidth:320, width:"100%",
                          }}>
                            🚫 Ne pas répondre à cette question (comptera 0 point)
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* ── Confirmation avant de passer sans réponse (clic accidentel) ── */}
                  {showSkipConfirm && (
                    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.55)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
                      <div style={{ background:"#fff", borderRadius:16, padding:"26px 24px", width:"100%", maxWidth:400, boxShadow:"0 20px 40px rgba(0,0,0,.25)", textAlign:"center" }}>
                        <div style={{ fontSize:"2rem", marginBottom:10 }}>⚠️</div>
                        <h3 style={{ margin:"0 0 6px", fontSize:"1.05rem", fontWeight:800, color:"#0f172a" }}>Vous n'avez pas répondu</h3>
                        <p style={{ margin:"0 0 20px", fontSize:".88rem", color:"#64748b", lineHeight:1.5 }}>
                          Voulez-vous vraiment passer sans répondre ? Cela comptera 0 point pour cette question.
                        </p>
                        <div style={{ display:"flex", gap:10 }}>
                          <button onClick={() => setShowSkipConfirm(false)} style={{ flex:1, padding:"11px 0", background:"#f1f5f9", color:"#334155", border:"none", borderRadius:10, fontWeight:700, fontSize:".88rem", cursor:"pointer" }}>
                            Répondre
                          </button>
                          <button onClick={() => { setShowSkipConfirm(false); goNext(); }} style={{ flex:1, padding:"11px 0", background:"#ff2945", color:"#fff", border:"none", borderRadius:10, fontWeight:700, fontSize:".88rem", cursor:"pointer" }}>
                            Passer (0 pt)
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Navigation - pas de retour en arrière possible une fois répondu.
                      Une question sans réponse (ni choisie, ni volontairement sautée via
                      "Ne pas répondre") n'empêche plus la soumission finale : elle compte
                      simplement 0, comme un skip explicite (cf. isCorrect). Un clic sans
                      réponse déclenche une confirmation (cf. handleNextClick) plutôt que de
                      passer directement, pour éviter un saut accidentel. ── */}
                  <div style={{ ...S.quizNav, justifyContent:"flex-end" }}>
                    {currentQ < questions.length - 1
                      ? <button style={S.btnBlue} onClick={handleNextClick}>Suivant →</button>
                      : <button
                          style={{ ...S.btnGreen, opacity: savingResult ? .6 : 1 }}
                          onClick={handleNextClick}
                          disabled={savingResult}>
                          {savingResult
                            ? <span style={{ display:"flex", alignItems:"center", gap:8 }}><span style={S.spinner}/> Enregistrement…</span>
                            : "🎯 Voir mon résultat"}
                        </button>
                    }
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ÉTAPE 3 - CHOIX CONSEILLÈRE (obligatoire) */}
          {step === "assign" && result && (
            <div style={{ ...S.card, maxWidth:560, animation:"fltSI .4s ease" }}>
              {/* Aperçu résultat */}
              <div style={{ background:"linear-gradient(135deg,#011451,#0c33ac)", borderRadius:14, padding:"20px 24px", marginBottom:24, display:"flex", alignItems:"center", gap:16 }}>
                <div style={{ width:56, height:56, borderRadius:"50%", background:"rgba(255,255,255,.15)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:"1.3rem", color:"#fff", flexShrink:0 }}>
                  {result.cefr}
                </div>
                <div>
                  <div style={{ color:"rgba(255,255,255,.7)", fontSize:".78rem" }}>Votre niveau</div>
                  <div style={{ color:"#fff", fontWeight:800, fontSize:"1.1rem" }}>Score : {result.pct}% - {result.cefr}</div>
                  <div style={{ color:"rgba(255,255,255,.6)", fontSize:".76rem", marginTop:2 }}>Résultat enregistré ✓</div>
                </div>
              </div>

              {/* Titre étape */}
              <div style={{ textAlign:"center", marginBottom:24 }}>
                <div style={{ fontSize:"2rem", marginBottom:8 }}>🤝</div>
                <h2 style={{ fontFamily:"Montserrat,sans-serif", fontWeight:800, color:"#011451", margin:"0 0 8px", fontSize:"1.15rem" }}>
                  Choisissez votre conseillère BET
                </h2>
                <p style={{ color:"#64748b", fontSize:".87rem", lineHeight:1.6, margin:0 }}>
                  Votre conseillère recevra votre résultat et vous contactera pour vous proposer un programme personnalisé. Cette étape est <strong>obligatoire</strong>.
                </p>
              </div>

              {/* Étape 1 : Centre */}
              <div style={{ marginBottom:20 }}>
                <label style={{ display:"block", fontSize:".78rem", fontWeight:700, color:"#011451", marginBottom:10 }}>
                  🏢 Étape 1 - Choisissez votre centre BET *
                </label>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                  {BET_CENTRES.map(c => {
                    const sel = assignCentre === c.id;
                    return (
                      <button key={c.id} type="button"
                        onClick={() => { setAssignCentre(c.id); setAssignCommercialId(""); setAssignError(""); }}
                        style={{ padding:"10px 6px", border:`2px solid ${sel?"#ff2945":"#e2e8f0"}`, borderRadius:10,
                          background: sel?"#fff0f2":"#fff", cursor:"pointer",
                          display:"flex", flexDirection:"column", alignItems:"center", gap:4, transition:"all .18s" }}>
                        <span style={{ fontSize:"1.3rem" }}>{c.icon}</span>
                        <span style={{ fontSize:".75rem", fontWeight: sel?800:600, color: sel?"#ff2945":"#1e293b" }}>{c.label}</span>
                        <span style={{ fontSize:".68rem", color:"#94a3b8" }}>{c.ville}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Étape 2 : Conseillère */}
              {assignCentre && (
                <div style={{ marginBottom:20 }}>
                  <label style={{ display:"block", fontSize:".78rem", fontWeight:700, color:"#011451", marginBottom:10 }}>
                    👩‍💼 Étape 2 - Choisissez votre conseillère *
                  </label>
                  {assignLoadingCom ? (
                    <div style={{ textAlign:"center", padding:"16px 0", color:"#94a3b8", fontSize:".84rem" }}>Chargement…</div>
                  ) : assignCommerciaux.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"16px 0", color:"#94a3b8", fontSize:".84rem" }}>Aucune conseillère disponible. Contactez-nous directement.</div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {assignCommerciaux.map(com => {
                        const sel = assignCommercialId === com.id;
                        return (
                          <button key={com.id} type="button"
                            onClick={() => { setAssignCommercialId(sel ? "" : com.id); setAssignError(""); }}
                            style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px",
                              border:`2px solid ${sel?"#ff2945":"#e2e8f0"}`, borderRadius:10,
                              background: sel?"#fff0f2":"#fff", cursor:"pointer", textAlign:"left", transition:"all .18s" }}>
                            <div style={{ width:42, height:42, borderRadius:"50%", background: sel?"#ff2945":"#f1f5f9",
                              display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                              <span style={{ fontSize:"1.2rem" }}>👩‍💼</span>
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontWeight:700, fontSize:".9rem", color: sel?"#ff2945":"#1e293b" }}>{com.prenom} {com.nom}</div>
                              {com.telephone && <div style={{ fontSize:".76rem", color:"#64748b", marginTop:2 }}>{com.telephone}</div>}
                            </div>
                            {sel && <span style={{ fontSize:".75rem", background:"#ff2945", color:"#fff", borderRadius:20, padding:"2px 10px", fontWeight:700 }}>✓ Choisie</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {assignError && (
                <div style={{ background:"#fff0f2", border:"1px solid #ffb3bc", borderRadius:8, padding:"10px 14px", marginBottom:14, color:"#ff2945", fontSize:".84rem", fontWeight:600 }}>
                  ⚠ {assignError}
                </div>
              )}

              <button onClick={handleAssignAndContinue} disabled={assignSaving}
                style={{ ...S.btnRed, width:"100%", opacity: assignSaving ? .7 : 1, cursor: assignSaving ? "wait" : "pointer" }}>
                {assignSaving
                  ? <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}><span style={S.spinner} />Enregistrement…</span>
                  : "Confirmer et voir mon résultat complet →"}
              </button>
            </div>
          )}

          {/* ÉTAPE PENDING - Writing/Speaking : en attente de correction */}
          {step === "pending" && (
            <div style={{ maxWidth:560, width:"100%", margin:"0 auto", animation:"fltFU .5s ease" }}>
              <div style={{ background:`linear-gradient(135deg,${fmtInfo.bg},#fff)`, border:`1.5px solid ${fmtInfo.color}30`, borderRadius:20, padding:"36px 32px", textAlign:"center" }}>
                <div style={{ fontSize:"3.5rem", marginBottom:16 }}>{fmtInfo.icon}</div>
                <h2 style={{ fontFamily:"Montserrat,sans-serif", fontWeight:900, fontSize:"1.4rem", color:"#011451", margin:"0 0 12px" }}>
                  Test {fmtInfo.label} envoyé !
                </h2>
                <p style={{ fontSize:".9rem", color:"#475569", lineHeight:1.6, margin:"0 0 24px" }}>
                  Vos réponses ont bien été reçues par votre conseillère BET.
                  <br />Elle analysera votre {format === "speaking" ? "expression orale" : "expression écrite"} et vous communiquera votre niveau CECRL <strong>sous 24h</strong>.
                </p>
                <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:28 }}>
                  {[
                    { icon:"✅", text:"Vos réponses ont été sauvegardées" },
                    { icon:"👩‍💼", text:"Votre conseillère a été notifiée" },
                    { icon:"📬", text:`Résultat envoyé à ${formData.email || "votre email"}` },
                  ].map(({ icon, text }) => (
                    <div key={text} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", background:"rgba(255,255,255,.8)", borderRadius:10, border:"1px solid #e5e7eb", textAlign:"left" }}>
                      <span style={{ fontSize:"1.1rem" }}>{icon}</span>
                      <span style={{ fontSize:".85rem", color:"#374151", fontWeight:500 }}>{text}</span>
                    </div>
                  ))}
                </div>
                <div style={{ padding:"16px 20px", background:"#fffbeb", borderRadius:12, border:"1px solid #fde68a", marginBottom:24 }}>
                  <div style={{ fontSize:".82rem", color:"#92400e", fontWeight:600, marginBottom:4 }}>⏳ Résultat sous 24h ouvrées</div>
                  <div style={{ fontSize:".78rem", color:"#b45309" }}>
                    En attendant, vous pouvez contacter votre conseillère via votre espace personnel.
                  </div>
                </div>
                <button
                  onClick={() => window.location.href = "/mon-espace"}
                  style={{ padding:"12px 28px", background:"linear-gradient(135deg,#ff2945,#0c33ac)", color:"#fff", border:"none", borderRadius:12, fontWeight:700, fontSize:".9rem", cursor:"pointer", fontFamily:"Montserrat,sans-serif" }}
                >
                  Accéder à mon espace →
                </button>
              </div>
            </div>
          )}

          {/* ÉTAPE 4 - RÉSULTATS (avec message d'erreur éventuel) */}
          {step === "result" && result && (() => {
            const ci = CEFR[result.cefr];
            return (
              <div style={{ maxWidth:720, width:"100%", display:"flex", flexDirection:"column", gap:20, animation:"fltFU .5s ease" }}>
                {saveError && (
                  <div style={{ background:"#fee2e2", border:"1px solid #ffb3bc", borderRadius:12, padding:"12px 16px", color:"#b91c1c", fontSize:".85rem", textAlign:"center" }}>
                    ⚠️ {saveError}
                  </div>
                )}
                {/* Email réellement envoyé côté backend (levelTest.js /submit) - ce bandeau
                    n'est qu'un indicateur visuel différé, pas l'envoi lui-même. */}
                {emailSent && (
                  <div style={S.emailBand}>
                    <span style={{ fontSize:"1.1rem" }}>📧</span>
                    <div>
                      <strong style={{ display:"block", fontSize:".88rem", marginBottom:2, color:"#065f46" }}>Résultats envoyés par email !</strong>
                      <span style={{ fontSize:".8rem", color:"#047857" }}>Votre rapport + programme recommandé vous attendent dans la boîte mail de <strong>{formData.email}</strong></span>
                    </div>
                  </div>
                )}

                {/* Carte principale niveau */}
                <div style={{ ...S.card, overflow:"hidden" }}>
                  <div style={{ ...S.resultTop, background:`linear-gradient(135deg,#011451,#0c33ac)` }}>
                    <div style={S.resultTopOrb1} />
                    <div style={S.resultTopOrb2} />
                    <div style={{ position:"relative", zIndex:1, textAlign:"center" }}>
                      <div style={{ fontSize:"3rem", marginBottom:8 }}>{ci.icon}</div>
                      <p style={S.resultKicker}>Votre niveau estimé</p>
                      <div style={{ ...S.resultCefr, color: ci.color === "#0c33ac" ? "#93c5fd" : ci.color }}>{result.cefr}</div>
                      <div style={S.resultLabel}>{ci.label}</div>
                      <p style={S.resultDesc}>{ci.desc}</p>
                    </div>
                  </div>
                  <div style={S.statsRow}>
                    {[
                      { l:"Score",         v:`${result.pct}%`,                       c: result.pct>=60?"#059669":result.pct>=40?"#d97706":"#ff2945" },
                      { l:"Bonnes rép.",   v:`${result.correct}/${questions.length}`, c:"#0c33ac" },
                      { l:"Points",        v:`${result.earned}/${totalPts}`,          c:"#7c3aed" },
                      { l:"Durée",         v:fmt(result.timeTaken),                   c:"#d97706" },
                    ].map((st, i) => (
                      <div key={i} style={S.statItem}>
                        <div style={{ fontSize:".7rem", color:"#94a3b8", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em", marginBottom:5 }}>{st.l}</div>
                        <div style={{ ...S.statVal, color:st.c, animation:`fltCount .4s ease ${i*70}ms both` }}>{st.v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding:"0 28px 24px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                      {["A1","A2","B1","B2","C1","C2"].map(l => (
                        <span key={l} style={{ fontSize:".7rem", fontWeight: l===result.cefr ? 800 : 500, color: l===result.cefr ? "#ff2945" : "#94a3b8" }}>{l}</span>
                      ))}
                    </div>
                    <div style={{ position:"relative", height:12, background:"#f1f5f9", borderRadius:6, overflow:"visible" }}>
                      <div style={{ height:"100%", width:`${result.pct}%`, background:"linear-gradient(90deg,#0c33ac,#ff2945)", borderRadius:6, transition:"width 1.2s ease" }} />
                      <div style={{ position:"absolute", top:"50%", left:`${result.pct}%`, transform:"translate(-50%,-50%)", width:20, height:20, borderRadius:"50%", background:"#fff", border:"3px solid #ff2945", boxShadow:"0 0 8px rgba(220,38,38,.4)", transition:"left 1.2s ease", zIndex:2 }} />
                    </div>
                  </div>
                </div>

                {/* Scores par catégorie (inchangé) */}
                <div style={S.lightCard}>
                  <h3 style={S.lcTitle}>📊 Résultats par catégorie</h3>
                  {Object.entries(result.byCat).map(([cat, data]) => {
                    const cs2 = CAT[cat] || { bg:"#f3f4f6", c:"#374151", dot:"#6b7280" };
                    const pct = Math.round((data.pts / data.max) * 100);
                    return (
                      <div key={cat} style={{ marginBottom:18 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ width:10, height:10, borderRadius:"50%", background:cs2.dot, flexShrink:0, display:"block" }} />
                            <span style={{ fontSize:".92rem", fontWeight:700, color:"#011451" }}>{cat}</span>
                            <span style={{ ...S.miniChip, background:cs2.bg, color:cs2.c }}>{data.correct}/{data.total} bonnes</span>
                          </div>
                          <span style={{ fontWeight:800, fontSize:".92rem", color: pct>=70?"#059669":pct>=50?"#d97706":"#ff2945" }}>{pct}%</span>
                        </div>
                        <PBar value={data.pts} max={data.max} color={cs2.dot} />
                      </div>
                    );
                  })}
                </div>

                {/* Maîtrise par niveau CECRL (inchangé) */}
                <div style={S.lightCard}>
                  <h3 style={S.lcTitle}>🏅 Maîtrise par niveau CECRL</h3>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
                    {Object.entries(result.byCefr).map(([lvl, data]) => {
                      const ci2 = CEFR[lvl];
                      const pct = Math.round((data.correct/data.total)*100);
                      return (
                        <div key={lvl} style={{ ...S.cefrCard, background:ci2.bg, border:`1.5px solid ${lvl===result.cefr?ci2.color:ci2.ring}`, boxShadow: lvl===result.cefr?`0 4px 16px ${ci2.color}33`:"none" }}>
                          {lvl === result.cefr && <div style={{ ...S.cefrTopBadge, background:ci2.color }}>VOTRE NIVEAU</div>}
                          <span style={{ fontSize:"1.4rem" }}>{ci2.icon}</span>
                          <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:"1.5rem", color:ci2.color, lineHeight:1 }}>{lvl}</div>
                          <div style={{ fontWeight:900, fontSize:"1.2rem", color:ci2.color }}>{pct}%</div>
                          <div style={{ fontSize:".7rem", color:ci2.color, opacity:.7 }}>{data.correct}/{data.total}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* CTA formations */}
                <div style={{ ...S.recCard, background:`linear-gradient(135deg,#011451 0%,#0c33ac 100%)` }}>
                  <div style={S.recOrb} />
                  <div style={{ position:"relative", zIndex:1 }}>
                    <span style={S.recKicker}>✅ Votre conseillère a bien reçu votre résultat</span>
                    <h3 style={S.recTitle}>Votre niveau : {result.cefr} - {ci.label}</h3>
                    <p style={S.recDesc}>Elle vous contactera prochainement pour vous proposer un programme de formation adapté à votre niveau et à vos objectifs.</p>
                    <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                      <button style={S.recBtnGhost} onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.12)";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";}} onClick={()=>navigate("/cours/en-ligne")}>
                        📚 Voir nos formations →
                      </button>
                      {isLoggedIn && (
                        <button
                          style={{ ...S.recBtnGhost, background:"rgba(16,185,129,.15)", border:"1.5px solid rgba(16,185,129,.5)", color:"#6ee7b7" }}
                          onMouseEnter={e=>e.currentTarget.style.background="rgba(16,185,129,.25)"}
                          onMouseLeave={e=>e.currentTarget.style.background="rgba(16,185,129,.15)"}
                          onClick={() => navigate("/mon-espace")}
                        >
                          🏠 Voir dans Mon Espace →
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Révision (inchangé) */}
                <div style={S.lightCard}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: showReview ? 20 : 0 }}>
                    <h3 style={{ ...S.lcTitle, margin:0 }}>🔍 Révision question par question</h3>
                    <button style={S.reviewToggleBtn} onClick={() => setShowReview(r=>!r)}>{showReview ? "Masquer ▲" : "Voir le détail ▼"}</button>
                  </div>
                  {showReview && (
                    <div style={{ display:"flex", flexDirection:"column", gap:12, animation:"fltFU .3s ease" }}>
                      {questions.map((qq, idx) => {
                        const isLibre    = qq.type === "libre";
                        const isSpeaking = qq.type === "speaking";
                        const isManual   = isLibre || isSpeaking;
                        const ok         = isManual ? null : isCorrect(qq);
                        const cs3        = CAT[qq.category] || { bg:"#f3f4f6", c:"#374151" };
                        const qTypeMeta  = Q_TYPE_LABEL[qq.type] || Q_TYPE_LABEL.qcm;
                        const borderC    = isManual ? "#c4b5fd" : ok ? "#bbf7d0" : "#ffb3bc";
                        const bgC        = isManual ? "#faf5ff" : ok ? "#f0fdf4" : "#fff5f5";
                        const recordUrl  = answers[qq.id]?.startsWith("http") ? answers[qq.id] : null;
                        return (
                          <div key={qq.id} style={{ border:`1.5px solid ${borderC}`, background:bgC, borderRadius:12, padding:"14px 16px" }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                <span style={{ fontWeight:800, fontSize:".88rem", color:"#011451" }}>Q{idx+1}</span>
                                <span style={{ ...S.miniChip, background:"#f1f5f9", color:"#475569" }}>{qTypeMeta.icon} {qTypeMeta.label}</span>
                                <span style={{ ...S.miniChip, background:cs3.bg, color:cs3.c }}>{qq.category}</span>
                                <span style={{ ...S.miniChip, background:"#f1f5f9", color:"#475569" }}>{qq.cefr}</span>
                              </div>
                              <span style={{ fontSize:"1.1rem" }}>
                                {isSpeaking ? "🎙️" : isLibre ? "🔍" : ok ? "✅" : "❌"}
                              </span>
                            </div>

                            {/* Audio stimulus (audio_qcm ou speaking) */}
                            {(qq.type === "audio_qcm" || qq.type === "speaking") && qq.audio_url && (
                              <audio controls src={qq.audio_url} controlsList="nodownload" crossOrigin="anonymous"
                                style={{ width:"100%", borderRadius:8, marginBottom:8 }} />
                            )}
                            {/* Passage */}
                            {qq.type === "lecture_qcm" && qq.passage && (
                              <div style={{ background:"#f8fafc", borderLeft:"3px solid #0ea5e9", borderRadius:6, padding:"8px 12px", fontSize:".82rem", color:"#334155", marginBottom:8, lineHeight:1.6 }}>
                                {qq.passage}
                              </div>
                            )}

                            <p style={{ fontSize:".9rem", color:"#334155", margin:"0 0 8px", fontWeight:500, lineHeight:1.5 }}>{qq.text}</p>

                            {/* Réponse donnée */}
                            {isSpeaking ? (
                              <div style={{ background:"#fff", border:"1px solid #c4b5fd", borderRadius:8, padding:"8px 12px", fontSize:".83rem", color:"#4c1d95" }}>
                                <strong>Votre réponse vocale :</strong>
                                {recordUrl
                                  ? <audio controls src={recordUrl} crossOrigin="anonymous" style={{ width:"100%", marginTop:6, borderRadius:6 }} />
                                  : <em style={{ color:"#94a3b8", marginLeft:6 }}>non enregistrée</em>
                                }
                                <div style={{ fontSize:".76rem", color:"#7c3aed", marginTop:4 }}>⏳ Correction manuelle par un formateur BET</div>
                              </div>
                            ) : isLibre ? (
                              <div style={{ background:"#fff", border:"1px solid #fed7aa", borderRadius:8, padding:"8px 12px", fontSize:".83rem", color:"#92400e" }}>
                                <strong>Votre réponse :</strong> {answers[qq.id] || <em style={{ color:"#94a3b8" }}>non répondue</em>}
                                <div style={{ fontSize:".76rem", color:"#9a3412", marginTop:4 }}>⏳ Correction manuelle par un formateur BET</div>
                              </div>
                            ) : (
                              <>
                                {!ok && <p style={{ fontSize:".83rem", margin:"0 0 3px", color:"#ff2945" }}>
                                  Votre réponse : <strong>{answers[qq.id] || "-"}</strong>
                                </p>}
                                {qq.correct && <p style={{ fontSize:".83rem", margin:"0 0 6px", color:"#059669" }}>
                                  Bonne réponse : <strong>{qq.correct}</strong>
                                </p>}
                              </>
                            )}

                            {qq.explanation && !isManual && (
                              <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderLeft:"3px solid #94a3b8", borderRadius:6, padding:"8px 12px", fontSize:".8rem", color:"#64748b", marginTop:6 }}>
                                💡 {qq.explanation}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* MODAL CONSEILLER (inchangée) */}
      <Footer />
    </>
  );
}

/* ════════════════════════════════════════════════════════
   STYLES (inchangés)
════════════════════════════════════════════════════════ */
const FF = "'Montserrat','Segoe UI',sans-serif";
const FD = "'Montserrat','Segoe UI',sans-serif"; 

const S = {
  page:         { fontFamily:FF, background:"#f8fafc", minHeight:"100vh", color:"#011451" },
  header:       { background:"#fff", borderBottom:"1px solid #e2e8f0", boxShadow:"0 1px 6px rgba(0,0,0,.05)" },
  headerInner:  { maxWidth:1100, margin:"0 auto", padding:"12px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" },
  headerDiv:    { color:"#e2e8f0", fontSize:"1.2rem" },
  headerTitle:  { fontSize:".82rem", fontWeight:600, color:"#64748b" },
  headerBadge:  { background:"#fff0f2", border:"1px solid #ffb3bc", color:"#ff2945", borderRadius:999, padding:"3px 12px", fontSize:".72rem", fontWeight:800 },
  timerChip:    { background:"#f1f5f9", border:"1px solid #e2e8f0", color:"#011451", borderRadius:999, padding:"5px 14px", fontFamily:FD, fontSize:".95rem", minWidth:72, textAlign:"center", transition:"all .3s" },
  timerLow:     { background:"#fff0f2", borderColor:"#ffb3bc", color:"#ff2945", animation:"fltPulse 1s ease infinite" },
  body:         { maxWidth:1100, margin:"0 auto", padding:"40px 16px 60px", display:"flex", flexDirection:"column", alignItems:"center" },
  card:         { background:"#fff", border:"1px solid #e2e8f0", borderRadius:20, overflow:"hidden", width:"100%", boxShadow:"0 4px 24px rgba(0,0,0,.07)" },
  cardBody:     { padding:"24px 28px" },
  formTop:      { background:"linear-gradient(135deg,#011451,#0c33ac)", padding:"30px 28px 24px", position:"relative", overflow:"hidden", textAlign:"center" },
  formTopOrb:   { position:"absolute", width:180, height:180, borderRadius:"50%", background:"rgba(220,38,38,.12)", top:-60, right:-50, pointerEvents:"none" },
  formTopIcon:  { fontSize:"2.5rem", display:"block", marginBottom:10, position:"relative", zIndex:1 },
  formH1:       { fontFamily:FD, fontSize:"1.65rem", color:"#fff", margin:"0 0 8px", fontWeight:400, position:"relative", zIndex:1 },
  formSub:      { color:"rgba(255,255,255,.65)", fontSize:".86rem", margin:"0 0 16px", position:"relative", zIndex:1 },
  formPills:    { display:"flex", flexWrap:"wrap", justifyContent:"center", gap:6, position:"relative", zIndex:1 },
  formPill:     { background:"rgba(255,255,255,.1)", border:"1px solid rgba(255,255,255,.15)", color:"rgba(255,255,255,.8)", borderRadius:999, padding:"3px 11px", fontSize:".72rem", fontWeight:600 },
  profileGrid:  { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:0 },
  profileBtn:   { display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"10px 4px", background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:10, cursor:"pointer", color:"#475569", fontFamily:FF, transition:"all .2s" },
  profileBtnActive:{ background:"#fff0f2", borderColor:"#ff2945", color:"#ff2945", boxShadow:"0 2px 8px rgba(220,38,38,.15)" },
  fieldLabel:   { display:"block", fontSize:".78rem", fontWeight:700, color:"#011451", marginBottom:5 },
  input:        { width:"100%", padding:"11px 14px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:".9rem", fontFamily:FF, outline:"none", boxSizing:"border-box", color:"#011451", background:"#fff", transition:"border-color .2s, box-shadow .2s" },
  errTxt:       { fontSize:".74rem", color:"#ff2945", fontWeight:600, margin:"3px 0 0" },
  formBenefits: { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginTop:20, paddingTop:20, borderTop:"1px solid #f1f5f9" },
  spinner:      { width:16, height:16, border:"2.5px solid rgba(255,255,255,.35)", borderTopColor:"#fff", borderRadius:"50%", animation:"fltSpin .8s linear infinite", display:"inline-block" },
  quizTop:      { background:"#f8fafc", padding:"14px 24px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:"1px solid #f1f5f9", flexWrap:"wrap", gap:8 },
  quizQLabel:   { fontSize:".9rem", color:"#64748b" },
  catChip:      { fontSize:".72rem", fontWeight:800, borderRadius:999, padding:"3px 10px" },
  cefrChip:     { background:"#f1f5f9", color:"#475569", borderRadius:999, padding:"3px 10px", fontSize:".72rem", fontWeight:700 },
  ptsChip:      { background:"#fefce8", color:"#92400e", borderRadius:999, padding:"3px 10px", fontSize:".72rem", fontWeight:800 },
  dotsRow:      { display:"flex", gap:6, padding:"10px 24px", flexWrap:"wrap", borderBottom:"1px solid #f1f5f9" },
  dot:          { height:10, border:"none", cursor:"pointer", transition:"all .25s ease", padding:0, flexShrink:0 },
  questionTxt:  { fontFamily:FD, fontSize:"1.25rem", color:"#011451", lineHeight:1.55, margin:"0 0 24px", fontWeight:400 },
  optsGrid:     { display:"grid", gridTemplateColumns:"1fr 1fr", gap:11, marginBottom:24 },
  opt:          { padding:"13px 14px", borderRadius:12, cursor:"pointer", fontFamily:FF, fontSize:".9rem", transition:"all .2s", display:"flex", alignItems:"center", gap:10, textAlign:"left" },
  optRadio:     { width:18, height:18, borderRadius:"50%", border:"2px solid", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all .2s" },
  optLetter:    { width:22, height:22, borderRadius:6, background:"#f1f5f9", display:"flex", alignItems:"center", justifyContent:"center", fontSize:".75rem", fontWeight:800, color:"#64748b", flexShrink:0 },
  quizNav:      { display:"flex", justifyContent:"space-between", alignItems:"center" },
  btnRed:       { padding:"13px 28px", background:"#ff2945", color:"#fff", border:"none", borderRadius:999, fontFamily:FF, fontWeight:800, fontSize:".95rem", cursor:"pointer", transition:"all .2s", boxShadow:"0 4px 16px rgba(220,38,38,.3)" },
  btnBlue:      { padding:"11px 24px", background:"#0c33ac", color:"#fff", border:"none", borderRadius:999, fontFamily:FF, fontWeight:700, fontSize:".9rem", cursor:"pointer", transition:"opacity .2s" },
  btnGreen:     { padding:"11px 24px", background:"linear-gradient(135deg,#059669,#0f766e)", color:"#fff", border:"none", borderRadius:999, fontFamily:FF, fontWeight:800, fontSize:".88rem", cursor:"pointer" },
  btnOutline:   { padding:"10px 22px", background:"#fff", color:"#475569", border:"1.5px solid #e2e8f0", borderRadius:999, fontFamily:FF, fontWeight:600, fontSize:".88rem", cursor:"pointer" },
  emailBand:    { background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:12, padding:"14px 18px", display:"flex", alignItems:"flex-start", gap:12, animation:"fltFI .5s ease", width:"100%", boxSizing:"border-box" },
  resultTop:    { padding:"36px 28px", position:"relative", overflow:"hidden", textAlign:"center", borderBottom:"1px solid #e2e8f0" },
  resultTopOrb1:{ position:"absolute", width:260, height:260, borderRadius:"50%", background:"rgba(220,38,38,.1)", top:-80, right:-60, pointerEvents:"none" },
  resultTopOrb2:{ position:"absolute", width:180, height:180, borderRadius:"50%", background:"rgba(255,255,255,.05)", bottom:-60, left:-40, pointerEvents:"none" },
  resultKicker: { fontSize:".72rem", fontWeight:800, letterSpacing:".1em", color:"rgba(255,255,255,.5)", textTransform:"uppercase", margin:"0 0 6px", display:"block" },
  resultCefr:   { fontFamily:FD, fontSize:"4rem", lineHeight:1, marginBottom:4 },
  resultLabel:  { fontSize:"1.3rem", fontWeight:800, color:"#fff", marginBottom:8 },
  resultDesc:   { fontSize:".9rem", color:"rgba(255,255,255,.7)", lineHeight:1.65, maxWidth:440, margin:"0 auto" },
  statsRow:     { display:"grid", gridTemplateColumns:"repeat(4,1fr)", borderBottom:"1px solid #f1f5f9" },
  statItem:     { padding:"18px 12px", textAlign:"center", borderRight:"1px solid #f1f5f9" },
  statVal:      { fontFamily:FD, fontSize:"1.7rem", lineHeight:1 },
  lightCard:    { background:"#fff", border:"1px solid #e2e8f0", borderRadius:16, padding:"22px", width:"100%", boxSizing:"border-box", boxShadow:"0 2px 10px rgba(0,0,0,.05)" },
  lcTitle:      { fontFamily:FD, fontSize:"1.1rem", fontWeight:400, color:"#011451", margin:"0 0 18px" },
  miniChip:     { fontSize:".7rem", fontWeight:700, borderRadius:999, padding:"2px 9px" },
  cefrCard:     { borderRadius:12, padding:"16px 10px", textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:5, position:"relative", paddingTop:22 },
  cefrTopBadge: { position:"absolute", top:-10, left:"50%", transform:"translateX(-50%)", color:"#fff", borderRadius:999, padding:"2px 10px", fontSize:".62rem", fontWeight:800, whiteSpace:"nowrap" },
  recCard:      { borderRadius:18, padding:"30px 28px", position:"relative", overflow:"hidden", width:"100%", boxSizing:"border-box" },
  recOrb:       { position:"absolute", width:240, height:240, borderRadius:"50%", background:"rgba(220,38,38,.12)", top:-80, right:-60, pointerEvents:"none" },
  recKicker:    { display:"block", fontSize:".78rem", fontWeight:700, color:"rgba(255,255,255,.55)", letterSpacing:".04em", marginBottom:10 },
  recTitle:     { fontFamily:FD, fontSize:"1.6rem", color:"#fff", margin:"0 0 12px", fontWeight:400, lineHeight:1.2 },
  recDesc:      { color:"rgba(255,255,255,.75)", fontSize:".9rem", lineHeight:1.7, margin:"0 0 20px" },
  recBtnRed:    { background:"#ff2945", color:"#fff", border:"none", borderRadius:999, padding:"11px 24px", fontFamily:FF, fontWeight:800, fontSize:".9rem", cursor:"pointer", transition:"background .2s", boxShadow:"0 4px 14px rgba(220,38,38,.4)" },
  recBtnGhost:  { background:"transparent", color:"#fff", border:"2px solid rgba(255,255,255,.3)", borderRadius:999, padding:"10px 22px", fontFamily:FF, fontWeight:700, fontSize:".86rem", cursor:"pointer", transition:"background .2s" },
  reviewToggleBtn:{ background:"#f1f5f9", border:"1px solid #e2e8f0", color:"#475569", borderRadius:999, padding:"6px 16px", fontFamily:FF, fontWeight:700, fontSize:".8rem", cursor:"pointer" },
  shareBtn:     { padding:"9px 16px", background:"#f8fafc", color:"#334155", border:"1px solid #e2e8f0", borderRadius:10, fontFamily:FF, fontWeight:600, fontSize:".84rem", cursor:"pointer", transition:"all .2s" },
  modalOverlay: { position:"fixed", inset:0, background:"rgba(0,0,0,.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:16 },
  modalContainer:{ background:"#fff", borderRadius:20, width:"100%", maxWidth:500, maxHeight:"92vh", overflowY:"auto", animation:"fltSI .25s ease", boxShadow:"0 20px 40px rgba(0,0,0,.2)" },
  modalHeader:  { background:"linear-gradient(135deg,#011451,#0c33ac)", padding:"20px 24px", display:"flex", justifyContent:"space-between", alignItems:"center", color:"#fff" },
  modalTitle:   { fontFamily:FD, fontSize:"1.2rem", margin:0, fontWeight:400 },
  modalClose:   { background:"rgba(255,255,255,.2)", border:"none", borderRadius:"50%", width:28, height:28, cursor:"pointer", color:"#fff", fontSize:"1.2rem", display:"flex", alignItems:"center", justifyContent:"center", transition:"background .2s" },
  modalBody:    { padding:"24px" },

  /* ── Nouveaux styles pour les formats de question ── */
  audioBox:     { background:"linear-gradient(135deg,#fdf2f8,#fce7f3)", border:"1.5px solid #f9a8d4", borderRadius:14, padding:"16px 18px", marginBottom:18 },
  audioLabel:   { fontSize:".88rem", color:"#9d174d", marginBottom:6, lineHeight:1.5 },

  passageBox:   { background:"#f0f9ff", border:"1.5px solid #bae6fd", borderRadius:14, padding:"16px 18px", marginBottom:18, maxHeight:260, overflowY:"auto" },
  passageLabel: { fontSize:".82rem", color:"#0369a1", fontWeight:700, marginBottom:10 },
  passageTxt:   { fontSize:".9rem", color:"#011451", lineHeight:1.8, whiteSpace:"pre-wrap", margin:0 },
};

