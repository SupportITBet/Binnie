// src/Pages/Simulateur/SimulateurFormation.jsx
// Route : <Route path="/simulateur" element={<SimulateurFormation />} />

import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";

const BET_BLUE = "#1B3080";
const BET_RED  = "#E8273A";

// ═══════════════════════════════════════════════════════
// DONNÉES - CATALOGUE FORMATIONS
// ═══════════════════════════════════════════════════════
const NIVEAUX_CECRL = [
  { id: "A1", label: "A1 - Débutant",          color: "#6b7280", bg: "#f3f4f6" },
  { id: "A2", label: "A2 - Élémentaire",        color: "#d97706", bg: "#fef3c7" },
  { id: "B1", label: "B1 - Intermédiaire",      color: "#2563eb", bg: "#dbeafe" },
  { id: "B2", label: "B2 - Interm. supérieur",  color: "#7c3aed", bg: "#ede9fe" },
  { id: "C1", label: "C1 - Avancé",             color: "#059669", bg: "#dcfce7" },
  { id: "C2", label: "C2 - Maîtrise",           color: "#dc2626", bg: "#fee2e2" },
];

const OBJECTIFS = [
  { id: "communication", label: "Communication quotidienne",  icon: "💬" },
  { id: "business",      label: "Anglais des affaires",       icon: "💼" },
  { id: "toeic",         label: "Certification TOEIC",        icon: "🏆" },
  { id: "ielts",         label: "Certification IELTS",        icon: "📜" },
  { id: "presentations", label: "Présentations & réunions",   icon: "🎤" },
  { id: "redaction",     label: "Rédaction professionnelle",  icon: "✍️" },
  { id: "negociation",   label: "Négociation commerciale",    icon: "🤝" },
  { id: "technique",     label: "Anglais technique / IT",     icon: "💻" },
];

const FORMATS = [
  { id: "presentiel", label: "Présentiel",      icon: "🏢", desc: "Dans nos locaux à Abidjan",    coefPrix: 1.0 },
  { id: "distanciel", label: "À distance",      icon: "🌐", desc: "Sessions Zoom / Teams",        coefPrix: 0.85 },
  { id: "hybride",    label: "Hybride",          icon: "⚡", desc: "Mix présentiel & en ligne",   coefPrix: 0.92 },
  { id: "elearning",  label: "E-learning seul", icon: "💡", desc: "100% autonome, à votre rythme",coefPrix: 0.60 },
];

const RYTHMES = [
  { id: "intensif",   label: "Intensif",       sessions: 5,  desc: "5 sessions/semaine",   heures: 2.5, coef: 1.0 },
  { id: "regulier",   label: "Régulier",       sessions: 3,  desc: "3 sessions/semaine",   heures: 1.5, coef: 0.9 },
  { id: "leger",      label: "Modéré",         sessions: 2,  desc: "2 sessions/semaine",   heures: 1,   coef: 0.85 },
  { id: "weekend",    label: "Week-end only",  sessions: 2,  desc: "Sam + Dim uniquement", heures: 3,   coef: 0.88 },
];

const GROUPES = [
  { id: "individuel", label: "Individuel",    max: 1,  coefPrix: 2.2,  desc: "Cours 100% personnalisé" },
  { id: "duo",        label: "Duo",           max: 2,  coefPrix: 1.5,  desc: "2 participants" },
  { id: "petit",      label: "Petit groupe",  max: 6,  coefPrix: 1.0,  desc: "3 à 6 participants" },
  { id: "groupe",     label: "Groupe",        max: 15, coefPrix: 0.75, desc: "7 à 15 participants" },
  { id: "classe",     label: "Grande classe", max: 25, coefPrix: 0.55, desc: "16 à 25 participants" },
];

// Prix de base par heure (FCFA)
const PRIX_BASE_HEURE = 12000;

// Certifications disponibles
const CERTIFICATIONS = [
  { id: "toeic",   label: "TOEIC",  prix: 85000,  icon: "🏆" },
  { id: "ielts",   label: "IELTS",  prix: 120000, icon: "📜" },
  { id: "toefl",   label: "TOEFL",  prix: 140000, icon: "🎓" },
  { id: "cambridge",label:"Cambridge FCE", prix: 110000, icon: "🏅" },
];

// ── Utilitaires ──────────────────────────────────────
const fmt = (n) => Math.round(n).toLocaleString("fr-FR");
const fmtPrix = (n) => `${fmt(n)} FCFA`;

// ── Progression steps ────────────────────────────────
const STEPS = [
  { id: 1, label: "Votre entreprise",    icon: "🏢" },
  { id: 2, label: "Niveau & objectifs",  icon: "🎯" },
  { id: 3, label: "Format & rythme",     icon: "📅" },
  { id: 4, label: "Options",             icon: "⚙️" },
  { id: 5, label: "Votre devis",         icon: "📊" },
];

// ═══════════════════════════════════════════════════════
// COMPOSANTS
// ═══════════════════════════════════════════════════════
const ProgressSteps = ({ current }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 36, flexWrap: "wrap", rowGap: 12 }}>
    {STEPS.map((s, i) => (
      <React.Fragment key={s.id}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, transition: "all .3s",
            background: current > s.id ? BET_BLUE : current === s.id ? BET_BLUE : "#e5e7eb",
            color: current >= s.id ? "#fff" : "#9ca3af",
            boxShadow: current === s.id ? `0 0 0 4px ${BET_BLUE}20` : "none" }}>
            {current > s.id ? "✓" : s.icon}
          </div>
          <span style={{ fontSize: 10, fontWeight: current === s.id ? 700 : 400, color: current >= s.id ? BET_BLUE : "#9ca3af", textAlign: "center", maxWidth: 70, lineHeight: 1.3 }}>
            {s.label}
          </span>
        </div>
        {i < STEPS.length - 1 && (
          <div style={{ width: 40, height: 2, background: current > s.id ? BET_BLUE : "#e5e7eb", marginBottom: 22, transition: "background .3s", flexShrink: 0 }} />
        )}
      </React.Fragment>
    ))}
  </div>
);

const SelectCard = ({ item, selected, onSelect, color = BET_BLUE }) => (
  <div onClick={() => onSelect(item.id)}
    style={{ padding: "14px 16px", borderRadius: 12, border: `1.5px solid ${selected ? color : "#e5e7eb"}`, background: selected ? color + "08" : "#fff", cursor: "pointer", transition: "all .2s" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${selected ? color : "#d1d5db"}`, background: selected ? color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {selected && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
      </div>
      {item.icon && <span style={{ fontSize: 18 }}>{item.icon}</span>}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{item.label}</div>
        {item.desc && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{item.desc}</div>}
        {item.coefPrix && <div style={{ fontSize: 10, color: selected ? color : "#94a3b8", marginTop: 2, fontWeight: selected ? 700 : 400 }}>
          {item.coefPrix > 1 ? `+${Math.round((item.coefPrix - 1) * 100)}% tarif` : item.coefPrix < 1 ? `−${Math.round((1 - item.coefPrix) * 100)}% tarif` : "Tarif standard"}
        </div>}
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═══════════════════════════════════════════════════════
export default function SimulateurFormation() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  // ── STATE ────────────────────────────────────────────
  const [entreprise, setEntreprise] = useState({
    nom: "", secteur: "", nbEmployes: "", emailContact: "", tel: "",
  });
  const [niveauActuel,    setNiveauActuel]    = useState("");
  const [niveauCible,     setNiveauCible]     = useState("");
  const [objectifs,       setObjectifs]       = useState([]);
  const [dureeWeeks,      setDureeWeeks]      = useState(12);
  const [nbParticipants,  setNbParticipants]  = useState(5);
  const [formatId,        setFormatId]        = useState("hybride");
  const [rythmeId,        setRythmeId]        = useState("regulier");
  const [groupeId,        setGroupeId]        = useState("petit");
  const [certifsChoisis,  setCertifsChoisis]  = useState([]);
  const [avecSupportExtra,setAvecSupportExtra]= useState(false);
  const [avecRapport,     setAvecRapport]     = useState(true);
  const [budgetMax,       setBudgetMax]       = useState("");
  const [devisEnvoye,     setDevisEnvoye]     = useState(false);
  const [emailDevis,      setEmailDevis]      = useState("");

  // ── CALCUL DEVIS ─────────────────────────────────────
  const devis = useMemo(() => {
    const format  = FORMATS.find(f => f.id === formatId)   || FORMATS[0];
    const rythme  = RYTHMES.find(r => r.id === rythmeId)   || RYTHMES[1];
    const groupe  = GROUPES.find(g => g.id === groupeId)   || GROUPES[2];

    const heuresSemaine     = rythme.sessions * rythme.heures;
    const heuresTotal       = heuresSemaine * dureeWeeks;
    const nbReel            = Math.max(1, nbParticipants);
    const prixHeureBrut     = PRIX_BASE_HEURE * format.coefPrix * rythme.coef * groupe.coefPrix;
    const prixFormation     = heuresTotal * prixHeureBrut * nbReel;
    const prixCertifs       = certifsChoisis.reduce((s, cId) => {
      const c = CERTIFICATIONS.find(x => x.id === cId); return s + (c ? c.prix * nbReel : 0);
    }, 0);
    const prixSupport       = avecSupportExtra ? prixFormation * 0.1 : 0;
    const prixRapport       = avecRapport ? 25000 * Math.ceil(nbReel / 5) : 0;
    const sousTotal         = prixFormation + prixCertifs + prixSupport + prixRapport;
    const tva               = sousTotal * 0.18;
    const total             = sousTotal + tva;
    const prixParPers       = nbReel > 0 ? total / nbReel : 0;

    return {
      heuresSemaine, heuresTotal: Math.round(heuresTotal), nbReel,
      prixFormation, prixCertifs, prixSupport, prixRapport,
      sousTotal, tva, total, prixParPers,
      format, rythme, groupe,
    };
  }, [formatId, rythmeId, groupeId, dureeWeeks, nbParticipants, certifsChoisis, avecSupportExtra, avecRapport]);

  // ── TOGGLE OBJECTIF ──────────────────────────────────
  const toggleObjectif = (id) => setObjectifs(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );
  const toggleCertif = (id) => setCertifsChoisis(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  const canNext = () => {
    if (step === 1) return entreprise.nom && entreprise.emailContact;
    if (step === 2) return niveauActuel && niveauCible && objectifs.length > 0;
    if (step === 3) return formatId && rythmeId && groupeId;
    return true;
  };

  const handleSendDevis = (e) => {
    e.preventDefault();
    // await fetch("/api/devis", { method:"POST", body: JSON.stringify({ ...entreprise, devis, emailDevis }) })
    // if (window.gtag) window.gtag("event", "devis_request", { value: devis.total, currency: "XOF" });
    // if (window.fbq) window.fbq("track", "Lead", { value: devis.total, currency: "XOF" });
    setDevisEnvoye(true);
  };

  // ══════════════ RENDER ══════════════════════════════
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes simFadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        .sim-fade { animation: simFadeUp .4s ease both; }
        .sim-fade-2 { animation: simFadeUp .4s ease .08s both; }
        input[type=range] { -webkit-appearance:none; width:100%; height:6px; border-radius:3px; background:#e5e7eb; outline:none; cursor:pointer; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:20px; height:20px; border-radius:50%; background:${BET_BLUE}; cursor:pointer; box-shadow:0 1px 4px rgba(0,0,0,0.2); }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#f0f4ff", fontFamily: "'DM Sans', sans-serif" }}>

        {/* ── HERO ── */}
        <div style={{ background: `linear-gradient(135deg, ${BET_BLUE} 0%, #0d1a4a 100%)`, padding: "52px 24px 0", color: "#fff", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -50, right: -50, width: 260, height: 260, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
          <div style={{ position: "absolute", bottom: -30, left: "20%", width: 180, height: 180, borderRadius: "50%", background: `rgba(232,39,58,0.08)` }} />
          <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
            <div className="sim-fade" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 20, background: "rgba(232,39,58,0.18)", border: "1px solid rgba(232,39,58,0.3)", fontSize: 12, fontWeight: 600, color: "#fca5a5", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 18 }}>
              🧮 Outil gratuit · Résultat en temps réel
            </div>
            <h1 className="sim-fade" style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(28px,4.5vw,48px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 14 }}>
              Simulateur de<br/><span style={{ color: "#f87171" }}>programme de formation</span>
            </h1>
            <p className="sim-fade-2" style={{ fontSize: 15, fontWeight: 300, color: "rgba(255,255,255,0.7)", lineHeight: 1.7, maxWidth: 520, margin: "0 auto 36px" }}>
              Configurez le programme idéal pour vos équipes et obtenez une estimation budgétaire instantanée.
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 0, background: "rgba(0,0,0,0.2)", borderRadius: "12px 12px 0 0", overflow: "hidden", maxWidth: 560, margin: "0 auto" }}>
              {[
                { v: "5 min",  l: "Pour simuler" },
                { v: "100%",   l: "Personnalisé" },
                { v: "Gratuit",l: "Sans engagement" },
                { v: "Devis",  l: "Envoyé par email" },
              ].map((s, i, arr) => (
                <div key={s.l} style={{ flex: 1, textAlign: "center", padding: "12px 6px", borderRight: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#f87171" }}>{s.v}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 20px 60px" }}>

          {/* ── STEPS ── */}
          {step <= 5 && !devisEnvoye && <ProgressSteps current={step} />}

          <div style={{ display: "grid", gridTemplateColumns: step === 5 ? "1fr 340px" : "1fr", gap: 24 }}>

            {/* ── CONTENU PRINCIPAL ── */}
            <div style={{ background: "#fff", borderRadius: 16, padding: 28, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb" }}>

              {/* ── ÉTAPE 1 : Votre entreprise ── */}
              {step === 1 && (
                <div className="sim-fade">
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>🏢 Votre entreprise</h2>
                  <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 24 }}>Ces informations permettent de personnaliser votre devis.</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelSt}>Nom de l'entreprise *</label>
                      <input style={inputSt} type="text" placeholder="Ex: Orange Côte d'Ivoire" value={entreprise.nom} onChange={e => setEntreprise({ ...entreprise, nom: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelSt}>Secteur d'activité</label>
                      <select style={inputSt} value={entreprise.secteur} onChange={e => setEntreprise({ ...entreprise, secteur: e.target.value })}>
                        <option value="">Sélectionner…</option>
                        {["Télécommunications","Finance & Banque","Industrie","Commerce","Santé","Education","Technologie","Logistique","Tourisme","Autre"].map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelSt}>Nombre total d'employés</label>
                      <select style={inputSt} value={entreprise.nbEmployes} onChange={e => setEntreprise({ ...entreprise, nbEmployes: e.target.value })}>
                        <option value="">Sélectionner…</option>
                        {["1–10","11–50","51–200","201–500","500+"].map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelSt}>Email de contact *</label>
                      <input style={inputSt} type="email" placeholder="drh@entreprise.ci" value={entreprise.emailContact} onChange={e => setEntreprise({ ...entreprise, emailContact: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelSt}>Téléphone</label>
                      <input style={inputSt} type="tel" placeholder="+225 07 00 00 00 00" value={entreprise.tel} onChange={e => setEntreprise({ ...entreprise, tel: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── ÉTAPE 2 : Niveau & objectifs ── */}
              {step === 2 && (
                <div className="sim-fade">
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>🎯 Niveau & objectifs</h2>
                  <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 24 }}>Définissez le point de départ et la destination de vos équipes.</p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
                    <div>
                      <label style={{ ...labelSt, marginBottom: 10 }}>Niveau actuel de vos équipes *</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        {NIVEAUX_CECRL.map(n => (
                          <div key={n.id} onClick={() => setNiveauActuel(n.id)}
                            style={{ padding: "10px 14px", borderRadius: 9, border: `1.5px solid ${niveauActuel === n.id ? n.color : "#e5e7eb"}`, background: niveauActuel === n.id ? n.bg : "#fff", cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}>
                            <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${niveauActuel === n.id ? n.color : "#d1d5db"}`, background: niveauActuel === n.id ? n.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {niveauActuel === n.id && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                            </div>
                            <span style={{ fontSize: 13, fontWeight: niveauActuel === n.id ? 700 : 400, color: niveauActuel === n.id ? n.color : "#374151" }}>{n.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={{ ...labelSt, marginBottom: 10 }}>Niveau cible visé *</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        {NIVEAUX_CECRL.map(n => (
                          <div key={n.id} onClick={() => setNiveauCible(n.id)}
                            style={{ padding: "10px 14px", borderRadius: 9, border: `1.5px solid ${niveauCible === n.id ? n.color : "#e5e7eb"}`, background: niveauCible === n.id ? n.bg : "#fff", cursor: "pointer", display: "flex", gap: 10, alignItems: "center", opacity: niveauActuel && n.id <= niveauActuel ? 0.35 : 1 }}>
                            <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${niveauCible === n.id ? n.color : "#d1d5db"}`, background: niveauCible === n.id ? n.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {niveauCible === n.id && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                            </div>
                            <span style={{ fontSize: 13, fontWeight: niveauCible === n.id ? 700 : 400, color: niveauCible === n.id ? n.color : "#374151" }}>{n.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <label style={{ ...labelSt, marginBottom: 10 }}>Objectifs de formation * <span style={{ fontSize: 11, color: "#9ca3af" }}>(plusieurs choix possibles)</span></label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 9 }}>
                    {OBJECTIFS.map(o => (
                      <div key={o.id} onClick={() => toggleObjectif(o.id)}
                        style={{ padding: "10px 13px", borderRadius: 9, border: `1.5px solid ${objectifs.includes(o.id) ? BET_BLUE : "#e5e7eb"}`, background: objectifs.includes(o.id) ? "#eef2ff" : "#fff", cursor: "pointer", display: "flex", gap: 9, alignItems: "center" }}>
                        <span style={{ fontSize: 16 }}>{o.icon}</span>
                        <span style={{ fontSize: 12, fontWeight: objectifs.includes(o.id) ? 700 : 400, color: objectifs.includes(o.id) ? BET_BLUE : "#374151" }}>{o.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── ÉTAPE 3 : Format & rythme ── */}
              {step === 3 && (
                <div className="sim-fade">
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>📅 Format, rythme & groupe</h2>
                  <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 24 }}>Ces choix influencent directement le coût et l'efficacité de la formation.</p>

                  <div style={{ marginBottom: 24 }}>
                    <label style={{ ...labelSt, marginBottom: 10 }}>Format des cours *</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 9 }}>
                      {FORMATS.map(f => <SelectCard key={f.id} item={f} selected={formatId === f.id} onSelect={setFormatId} color={BET_BLUE} />)}
                    </div>
                  </div>

                  <div style={{ marginBottom: 24 }}>
                    <label style={{ ...labelSt, marginBottom: 10 }}>Rythme d'apprentissage *</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 9 }}>
                      {RYTHMES.map(r => <SelectCard key={r.id} item={r} selected={rythmeId === r.id} onSelect={setRythmeId} color={BET_BLUE} />)}
                    </div>
                  </div>

                  <div style={{ marginBottom: 28 }}>
                    <label style={{ ...labelSt, marginBottom: 10 }}>Type de groupe *</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 9 }}>
                      {GROUPES.map(g => <SelectCard key={g.id} item={g} selected={groupeId === g.id} onSelect={setGroupeId} color={BET_BLUE} />)}
                    </div>
                  </div>

                  {/* Sliders */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                    <div>
                      <label style={labelSt}>Nombre de participants</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
                        <input type="range" min={1} max={50} step={1} value={nbParticipants} onChange={e => setNbParticipants(Number(e.target.value))} style={{ flex: 1 }} />
                        <span style={{ fontWeight: 800, color: BET_BLUE, fontSize: 20, minWidth: 36, textAlign: "right" }}>{nbParticipants}</span>
                      </div>
                    </div>
                    <div>
                      <label style={labelSt}>Durée de la formation</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
                        <input type="range" min={4} max={52} step={2} value={dureeWeeks} onChange={e => setDureeWeeks(Number(e.target.value))} style={{ flex: 1 }} />
                        <span style={{ fontWeight: 800, color: BET_BLUE, fontSize: 20, minWidth: 60, textAlign: "right" }}>{dureeWeeks} sem.</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ÉTAPE 4 : Options ── */}
              {step === 4 && (
                <div className="sim-fade">
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>⚙️ Options complémentaires</h2>
                  <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 24 }}>Enrichissez votre programme avec des certifications et services additionnels.</p>

                  <div style={{ marginBottom: 28 }}>
                    <label style={{ ...labelSt, marginBottom: 12 }}>Certifications officielles <span style={{ fontSize: 11, color: "#9ca3af" }}>(prix par participant)</span></label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                      {CERTIFICATIONS.map(c => (
                        <div key={c.id} onClick={() => toggleCertif(c.id)}
                          style={{ padding: "14px 16px", borderRadius: 12, border: `1.5px solid ${certifsChoisis.includes(c.id) ? BET_BLUE : "#e5e7eb"}`, background: certifsChoisis.includes(c.id) ? "#eef2ff" : "#fff", cursor: "pointer" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 20 }}>{c.icon}</span>
                            <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{c.label}</span>
                            {certifsChoisis.includes(c.id) && <span style={{ marginLeft: "auto", color: BET_BLUE, fontSize: 16 }}>✓</span>}
                          </div>
                          <div style={{ fontSize: 12, color: certifsChoisis.includes(c.id) ? BET_BLUE : "#9ca3af", fontWeight: certifsChoisis.includes(c.id) ? 700 : 400 }}>
                            {fmtPrix(c.prix)} / pers.
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
                    <label style={labelSt}>Services additionnels</label>
                    {[
                      { key: "avecSupportExtra", val: avecSupportExtra, set: setAvecSupportExtra, label: "Support pédagogique renforcé", desc: "+10% - Accès tuteur dédié entre les sessions, exercices supplémentaires" },
                      { key: "avecRapport",       val: avecRapport,     set: setAvecRapport,      label: "Rapport de progression mensuel", desc: "25 000 FCFA / 5 participants - Bilan détaillé envoyé au DRH chaque mois" },
                    ].map(opt => (
                      <div key={opt.key} onClick={() => opt.set(v => !v)}
                        style={{ padding: "14px 16px", borderRadius: 12, border: `1.5px solid ${opt.val ? BET_BLUE : "#e5e7eb"}`, background: opt.val ? "#eef2ff" : "#fff", cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${opt.val ? BET_BLUE : "#d1d5db"}`, background: opt.val ? BET_BLUE : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                          {opt.val && <span style={{ color: "#fff", fontSize: 12 }}>✓</span>}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{opt.label}</div>
                          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{opt.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <label style={labelSt}>Budget maximum envisagé <span style={{ fontSize: 11, color: "#9ca3af" }}>(optionnel)</span></label>
                    <input style={inputSt} type="number" placeholder="Ex: 5 000 000 FCFA" value={budgetMax} onChange={e => setBudgetMax(e.target.value)} />
                    {budgetMax && Number(budgetMax) < devis.total && (
                      <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fef3c7", border: "1px solid #fcd34d", fontSize: 12, color: "#92400e", marginTop: 8 }}>
                        ⚠️ Votre budget est de {fmtPrix(Number(budgetMax))} mais l'estimation actuelle est de {fmtPrix(devis.total)}. Nos conseillers vous proposeront des ajustements.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── ÉTAPE 5 : Devis ── */}
              {step === 5 && !devisEnvoye && (
                <div className="sim-fade">
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>📊 Votre estimation budgétaire</h2>
                  <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 24 }}>Estimation basée sur les informations fournies - devis définitif après validation par un conseiller BET.</p>

                  {/* Récap programme */}
                  <div style={{ padding: "16px 18px", borderRadius: 12, background: "#f0f4ff", border: `1px solid ${BET_BLUE}20`, marginBottom: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: BET_BLUE, marginBottom: 10, letterSpacing: "0.08em" }}>VOTRE PROGRAMME</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                      {[
                        { l: "Participants", v: devis.nbReel },
                        { l: "Heures totales", v: `${devis.heuresTotal}h` },
                        { l: "Durée", v: `${dureeWeeks} semaines` },
                        { l: "Format", v: devis.format.label },
                        { l: "Rythme", v: `${devis.rythme.sessions}×/sem.` },
                        { l: "Groupe", v: devis.groupe.label },
                      ].map(s => (
                        <div key={s.l} style={{ textAlign: "center", padding: "8px 6px" }}>
                          <div style={{ fontSize: 10, color: "#9ca3af" }}>{s.l}</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: BET_BLUE }}>{s.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Décomposition du prix */}
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
                    {[
                      { l: "Formation ({devis.heuresTotal}h × {devis.nbReel} participants)", v: devis.prixFormation, show: true },
                      { l: `Certifications (${certifsChoisis.length} × ${devis.nbReel} pers.)`, v: devis.prixCertifs, show: devis.prixCertifs > 0 },
                      { l: "Support pédagogique renforcé (+10%)", v: devis.prixSupport, show: devis.prixSupport > 0 },
                      { l: "Rapports de progression mensuels", v: devis.prixRapport, show: devis.prixRapport > 0 },
                    ].filter(r => r.show).map((r, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
                        <span style={{ color: "#374151" }}>{r.l.replace(/\{devis\.heuresTotal\}/, devis.heuresTotal).replace(/\{devis\.nbReel\}/, devis.nbReel)}</span>
                        <strong style={{ color: "#0f172a" }}>{fmtPrix(r.v)}</strong>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
                      <span style={{ color: "#374151" }}>Sous-total HT</span>
                      <strong>{fmtPrix(devis.sousTotal)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #e5e7eb", fontSize: 13 }}>
                      <span style={{ color: "#374151" }}>TVA 18%</span>
                      <span>{fmtPrix(devis.tva)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", background: `${BET_BLUE}06`, fontSize: 16 }}>
                      <strong style={{ color: "#0f172a" }}>TOTAL TTC</strong>
                      <strong style={{ color: BET_BLUE, fontSize: 20 }}>{fmtPrix(devis.total)}</strong>
                    </div>
                  </div>

                  <div style={{ padding: "12px 16px", borderRadius: 10, background: "#dcfce7", border: "1px solid #bbf7d0", fontSize: 13, color: "#166534", marginBottom: 20 }}>
                    💡 Soit <strong>{fmtPrix(devis.prixParPers)}</strong> par participant - soit <strong>{fmtPrix(Math.round(devis.total / dureeWeeks))}</strong>/semaine
                  </div>

                  {budgetMax && Number(budgetMax) < devis.total && (
                    <div style={{ padding: "12px 16px", borderRadius: 10, background: "#fef3c7", border: "1px solid #fcd34d", fontSize: 13, color: "#92400e", marginBottom: 20 }}>
                      ⚠️ Budget indiqué : <strong>{fmtPrix(Number(budgetMax))}</strong> - Écart de <strong>{fmtPrix(devis.total - Number(budgetMax))}</strong>. Nos conseillers pourront adapter le programme.
                    </div>
                  )}

                  {/* Formulaire envoi devis */}
                  <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 20 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>Recevoir ce devis par email</h3>
                    <form onSubmit={handleSendDevis} style={{ display: "flex", gap: 10 }}>
                      <input type="email" required placeholder={entreprise.emailContact || "Email professionnel"} value={emailDevis || entreprise.emailContact}
                        onChange={e => setEmailDevis(e.target.value)} style={{ ...inputSt, flex: 1 }} />
                      <button type="submit" style={{ ...btnPrimary, whiteSpace: "nowrap", padding: "11px 20px" }}>
                        📧 Envoyer le devis
                      </button>
                    </form>
                    <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
                      Un conseiller BET vous contactera sous 24h pour valider et affiner ce devis.
                    </p>
                  </div>
                </div>
              )}

              {/* ── DEVIS ENVOYÉ ── */}
              {devisEnvoye && (
                <div className="sim-fade" style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>Devis envoyé !</h2>
                  <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.7, maxWidth: 440, margin: "0 auto 24px" }}>
                    Votre simulation a été envoyée à <strong>{emailDevis || entreprise.emailContact}</strong>. Un conseiller BET vous contactera sous 24h pour finaliser votre programme.
                  </p>
                  <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                    <button onClick={() => navigate("/rdv")} style={btnPrimary}>
                      📅 Prendre un rendez-vous
                    </button>
                    <button onClick={() => { setStep(1); setDevisEnvoye(false); }} style={btnSecondary}>
                      Nouvelle simulation
                    </button>
                  </div>
                </div>
              )}

              {/* ── NAVIGATION ── */}
              {!devisEnvoye && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, paddingTop: 20, borderTop: "1px solid #f1f5f9" }}>
                  <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}
                    style={{ ...btnSecondary, opacity: step === 1 ? 0.4 : 1 }}>← Précédent</button>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>Étape {step} / {STEPS.length}</span>
                  {step < 5 ? (
                    <button onClick={() => canNext() && setStep(s => s + 1)} disabled={!canNext()}
                      style={{ ...btnPrimary, opacity: canNext() ? 1 : 0.45 }}>
                      Suivant →
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            {/* ── MINI DEVIS LIVE (étape 5 uniquement) ── */}
            {step === 5 && !devisEnvoye && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ background: `linear-gradient(135deg, ${BET_BLUE}, #0d1a4a)`, borderRadius: 14, padding: 20, color: "#fff" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em", marginBottom: 10 }}>ESTIMATION TOTALE</div>
                  <div style={{ fontSize: 32, fontWeight: 900 }}>{fmtPrix(devis.total)}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>TTC · {devis.nbReel} participant(s)</div>
                  <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "14px 0" }} />
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{fmtPrix(devis.prixParPers)}<span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}> /pers.</span></div>
                </div>
                <div style={{ background: "#fff", borderRadius: 14, padding: 18, border: "1px solid #e5e7eb" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.1em", marginBottom: 12 }}>RÉCAPITULATIF</div>
                  {[
                    { l: "Entreprise",    v: entreprise.nom || "-" },
                    { l: "Participants",  v: devis.nbReel },
                    { l: "Heures totales",v: `${devis.heuresTotal}h` },
                    { l: "Durée",         v: `${dureeWeeks} sem.` },
                    { l: "Format",        v: devis.format.label },
                    { l: "Certifications",v: certifsChoisis.length > 0 ? certifsChoisis.join(", ").toUpperCase() : "Aucune" },
                  ].map(r => (
                    <div key={r.l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "1px solid #f8fafc" }}>
                      <span style={{ color: "#9ca3af" }}>{r.l}</span>
                      <strong style={{ color: "#0f172a" }}>{r.v}</strong>
                    </div>
                  ))}
                </div>
                <button onClick={() => navigate("/rdv")} style={{ ...btnPrimary, width: "100%", justifyContent: "center", padding: "13px" }}>
                  📅 Prendre RDV avec un conseiller
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── STYLES ──────────────────────────────────────────
const btnPrimary  = { background: `linear-gradient(135deg,${BET_BLUE},#0d1a4a)`, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 14, fontFamily: "'DM Sans',sans-serif", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 22px", transition: "transform .15s, box-shadow .15s" };
const btnSecondary= { background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "'DM Sans',sans-serif", padding: "9px 16px" };
const inputSt     = { padding: "11px 14px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none", width: "100%", background: "#fff", color: "#0f172a" };
const labelSt     = { display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6, letterSpacing: "0.03em" };