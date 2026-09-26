// src/Pages/RendezVous/RendezVous.jsx
// Route : <Route path="/rdv" element={<RendezVous />} />
//
// ⚠️  CONFIGURATION CALENDLY :
//   1. Créez un compte sur https://calendly.com
//   2. Créez un "Event Type" (ex: "Consultation BET - 30 min")
//   3. Remplacez VOTRE_USERNAME et VOTRE_EVENT dans CALENDLY_URL
//   4. Installez : npm install react-calendly
//   5. Optionnel pour iframe directe : aucun package requis

import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAlerte } from "../../contexts/ConfirmContext";

// ─── CONFIGURATION ────────────────────────────────────────────────
// Option A : Avec react-calendly (recommandé)
// import { InlineWidget, useCalendlyEventListener } from "react-calendly";
//
// Option B : Iframe directe (utilisée ici - aucun package requis)
const CALENDLY_URL = "https://calendly.com/VOTRE_USERNAME/VOTRE_EVENT";

// Couleurs BET
const BET_BLUE = "#1B3080";
const BET_RED  = "#E8273A";

// ─── DONNÉES ─────────────────────────────────────────────────────
const CONSULT_TYPES = [
  {
    id: "decouverte",
    icon: "🌟",
    titre: "Consultation Découverte",
    duree: "30 min",
    prix: "Gratuit",
    description: "Premier échange pour évaluer votre niveau et définir vos objectifs. Sans engagement.",
    avantages: ["Évaluation du niveau actuel", "Définition des objectifs", "Présentation des offres", "Sans engagement"],
    color: BET_BLUE,
    calendlyPath: "consultation-decouverte-30min",
    badge: "Recommandé",
  },
  {
    id: "bilan",
    icon: "📊",
    titre: "Bilan de Compétences",
    duree: "1h",
    prix: "Gratuit",
    description: "Analyse approfondie de vos compétences en anglais et construction d'un plan de formation personnalisé.",
    avantages: ["Test de niveau CECRL", "Rapport détaillé", "Plan de formation", "Recommandations certifications"],
    color: "#059669",
    calendlyPath: "bilan-competences-60min",
    badge: null,
  },
  {
    id: "entreprise",
    icon: "🏢",
    titre: "Consultation Entreprise",
    duree: "45 min",
    prix: "Gratuit",
    description: "Réunion dédiée aux DRH et managers pour concevoir un programme de formation sur mesure pour vos équipes.",
    avantages: ["Analyse des besoins RH", "Programme personnalisé", "Devis détaillé", "Suivi post-formation"],
    color: "#7c3aed",
    calendlyPath: "consultation-entreprise-45min",
    badge: "Entreprises",
  },
];

const FORMATEURS = [
  { id: 1, nom: "Prof. Sophie Martin",  specialite: "Anglais Pro & TOEIC",    photo: "SM", dispo: "Lun–Ven, 9h–18h",  note: 4.9, avis: 124 },
  { id: 2, nom: "Prof. James Dubois",   specialite: "Business English & C1",  photo: "JD", dispo: "Mar–Sam, 10h–19h", note: 4.8, avis: 98  },
  { id: 3, nom: "Prof. Claire Smith",   specialite: "Préparation IELTS",       photo: "CS", dispo: "Lun–Jeu, 8h–17h",  note: 5.0, avis: 67  },
];

const FAQ = [
  { q: "Comment se déroule la consultation ?", r: "La consultation se fait en visio (Zoom/Google Meet) ou en présentiel dans nos locaux à Abidjan. Vous recevez un lien de confirmation par email avec tous les détails." },
  { q: "Puis-je annuler ou reporter mon rendez-vous ?", r: "Oui, vous pouvez annuler ou reporter jusqu'à 24h avant le rendez-vous via le lien dans votre email de confirmation. C'est entièrement gratuit." },
  { q: "Faut-il préparer quoi que ce soit avant ?", r: "Non, aucune préparation n'est requise pour la consultation découverte. Pour le bilan de compétences, nous vous envoyons un court questionnaire à remplir la veille." },
  { q: "La consultation est-elle vraiment gratuite ?", r: "Oui, les consultations initiales sont 100% gratuites et sans engagement. Notre objectif est de vous proposer la formation la plus adaptée à vos besoins." },
];

// ─── SOUS-COMPOSANTS ────────────────────────────────────────────────
const StarRating = ({ note }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
    {[1,2,3,4,5].map(i => (
      <span key={i} style={{ color: i <= Math.floor(note) ? "#f59e0b" : "#e5e7eb", fontSize: 13 }}>★</span>
    ))}
    <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 4 }}>{note}</span>
  </div>
);

// ─── COMPOSANT CALENDLY IFRAME ────────────────────────────────────
const CalendlyWidget = ({ url, consultType }) => {
  const [loaded, setLoaded] = useState(false);
  const [booked, setBooked] = useState(false);
  const iframeRef = useRef(null);

  // Écoute l'événement de confirmation Calendly
  useEffect(() => {
    const handler = (e) => {
      if (e.origin === "https://calendly.com" && e.data.event === "calendly.event_scheduled") {
        setBooked(true);
        // Déclenche tes analytics ici :
        // if (window.gtag) window.gtag("event", "rdv_booked", { type: consultType });
        // if (window.fbq) window.fbq("track", "Schedule");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [consultType]);

  if (booked) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
        <h3 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
          Rendez-vous confirmé !
        </h3>
        <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.7, marginBottom: 20 }}>
          Vous allez recevoir un email de confirmation avec le lien de la réunion et les détails du rendez-vous.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={() => setBooked(false)} style={{ ...btnSecondary }}>
            Prendre un autre RDV
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {!loaded && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f8fafc", zIndex: 1, borderRadius: 12, minHeight: 500 }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${BET_BLUE}20`, borderTopColor: BET_BLUE, borderRadius: "50%", animation: "betSpin .8s linear infinite", marginBottom: 12 }} />
          <span style={{ fontSize: 13, color: "#9ca3af" }}>Chargement du calendrier…</span>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={`${url}?hide_gdpr_banner=1&primary_color=${BET_BLUE.replace("#","")}&background_color=f8fafc`}
        width="100%"
        height="660"
        frameBorder="0"
        title="Prise de rendez-vous"
        style={{ borderRadius: 12, display: "block", opacity: loaded ? 1 : 0, transition: "opacity .3s" }}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═══════════════════════════════════════════════════════
export default function RendezVous() {
  const navigate = useNavigate();
  const alerte = useAlerte();
  const [selectedType, setSelectedType]     = useState(null);
  const [selectedFormateurId, setFormateur] = useState(null);
  const [step, setStep]                     = useState("choix"); // choix | calendly
  const [openFaq, setOpenFaq]               = useState(null);
  const [formContact, setFormContact]       = useState({ nom: "", email: "", phone: "", message: "" });
  const [formSent, setFormSent]             = useState(false);

  const selectedTypeData = CONSULT_TYPES.find(t => t.id === selectedType);
  const formateurSelectionne = FORMATEURS.find(f => f.id === selectedFormateurId);

  const buildCalendlyUrl = () => {
    const base = CALENDLY_URL;
    // Personnalisation de l'URL Calendly avec les infos du contact
    // https://help.calendly.com/hc/en-us/articles/360020052833
    let url = base;
    if (selectedTypeData) url = `https://calendly.com/VOTRE_USERNAME/${selectedTypeData.calendlyPath}`;
    return url;
  };

  const handleProceed = async () => {
    if (!selectedType) { await alerte("Choisissez un type de consultation.", { titre: "Type requis", danger: true }); return; }
    setStep("calendly");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleContactSubmit = (e) => {
    e.preventDefault();
    // await fetch("/api/contact", { method:"POST", body: JSON.stringify(formContact) })
    setFormSent(true);
    // if (window.gtag) window.gtag("event", "contact_form_submit");
    // if (window.fbq) window.fbq("track", "Contact");
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes betSpin { to { transform: rotate(360deg); } }
        @keyframes betFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes betPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.03)} }
        .rdv-fade { animation: betFadeUp .5s ease both; }
        .rdv-fade-2 { animation: betFadeUp .5s ease .1s both; }
        .rdv-fade-3 { animation: betFadeUp .5s ease .2s both; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#f0f4ff", fontFamily: "'DM Sans', sans-serif" }}>

        {/* ── HERO ── */}
        <div style={{ background: `linear-gradient(135deg, ${BET_BLUE} 0%, #0d1a4a 100%)`, padding: "60px 24px 0", color: "#fff", position: "relative", overflow: "hidden" }}>
          {/* déco */}
          <div style={{ position: "absolute", top: -60, right: -60, width: 300, height: 300, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
          <div style={{ position: "absolute", bottom: -40, left: "30%", width: 200, height: 200, borderRadius: "50%", background: "rgba(232,39,58,0.08)" }} />

          <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
            <div className="rdv-fade" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 20, background: "rgba(232,39,58,0.18)", border: "1px solid rgba(232,39,58,0.35)", fontSize: 12, fontWeight: 600, color: "#fca5a5", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}>
              📅 Consultation 100% gratuite - Sans engagement
            </div>
            <h1 className="rdv-fade-2" style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(32px,5vw,52px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 16 }}>
              Prenez rendez-vous avec<br/>
              <span style={{ color: "#f87171" }}>un expert BET</span>
            </h1>
            <p className="rdv-fade-3" style={{ fontSize: 16, fontWeight: 300, color: "rgba(255,255,255,0.7)", lineHeight: 1.7, maxWidth: 560, margin: "0 auto 40px" }}>
              Nos conseillers analysent votre niveau, vos objectifs et vous proposent le programme de formation le plus adapté.
            </p>

            {/* Stats hero */}
            <div style={{ display: "flex", justifyContent: "center", gap: 0, background: "rgba(0,0,0,0.2)", borderRadius: "12px 12px 0 0", overflow: "hidden", maxWidth: 600, margin: "0 auto" }}>
              {[
                { v: "2 400+", l: "Apprenants formés" },
                { v: "< 24h", l: "Délai de réponse" },
                { v: "4.9★", l: "Note moyenne" },
                { v: "100%", l: "Gratuit" },
              ].map((s, i, arr) => (
                <div key={s.l} style={{ flex: 1, textAlign: "center", padding: "14px 8px", borderRight: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#f87171" }}>{s.v}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 20px 60px" }}>

          {/* ── STEP : CHOIX ── */}
          {step === "choix" && (
            <>
              {/* Types de consultation */}
              <div style={{ marginBottom: 48 }}>
                <div style={{ textAlign: "center", marginBottom: 28 }}>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, color: "#0f172a" }}>
                    Choisissez votre consultation
                  </h2>
                  <p style={{ color: "#6b7280", marginTop: 6 }}>Toutes nos consultations initiales sont gratuites</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
                  {CONSULT_TYPES.map(type => (
                    <div key={type.id} onClick={() => setSelectedType(type.id)}
                      style={{ borderRadius: 16, border: `2px solid ${selectedType === type.id ? type.color : "#e5e7eb"}`, background: selectedType === type.id ? type.color + "06" : "#fff", padding: 22, cursor: "pointer", transition: "all .2s", position: "relative", overflow: "hidden" }}>
                      {type.badge && (
                        <div style={{ position: "absolute", top: 14, right: 14, padding: "3px 10px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: type.color + "18", color: type.color }}>
                          {type.badge}
                        </div>
                      )}
                      {/* Radio */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                        <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${selectedType === type.id ? type.color : "#d1d5db"}`, background: selectedType === type.id ? type.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {selectedType === type.id && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
                        </div>
                        <span style={{ fontSize: 22 }}>{type.icon}</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>{type.titre}</div>
                          <div style={{ fontSize: 12, color: "#9ca3af" }}>⏱ {type.duree} · 💰 {type.prix}</div>
                        </div>
                      </div>
                      <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, marginBottom: 14 }}>{type.description}</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {type.avantages.map((av, i) => (
                          <div key={i} style={{ fontSize: 12, color: "#374151", display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ color: type.color, fontWeight: 700 }}>✓</span> {av}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Choisir un formateur (optionnel) */}
              <div style={{ marginBottom: 40 }}>
                <div style={{ textAlign: "center", marginBottom: 22 }}>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, color: "#0f172a" }}>
                    Choisissez votre conseiller <span style={{ fontSize: 14, fontWeight: 400, color: "#9ca3af" }}>(optionnel)</span>
                  </h2>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
                  {FORMATEURS.map(f => (
                    <div key={f.id} onClick={() => setFormateur(selectedFormateurId === f.id ? null : f.id)}
                      style={{ padding: 16, borderRadius: 12, border: `1.5px solid ${selectedFormateurId === f.id ? BET_BLUE : "#e5e7eb"}`, background: selectedFormateurId === f.id ? "#eef2ff" : "#fff", cursor: "pointer", transition: "all .2s", display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ width: 46, height: 46, borderRadius: "50%", background: `linear-gradient(135deg, ${BET_BLUE}, #0d1a4a)`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#fff", flexShrink: 0 }}>
                        {f.photo}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>{f.nom}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>{f.specialite}</div>
                        <StarRating note={f.note} />
                        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>🕐 {f.dispo}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div style={{ textAlign: "center" }}>
                <button onClick={handleProceed} disabled={!selectedType}
                  style={{ ...btnPrimary, padding: "15px 48px", fontSize: 16, opacity: selectedType ? 1 : 0.5, animation: selectedType ? "betPulse 2s ease-in-out infinite" : "none" }}>
                  📅 Choisir mon créneau →
                </button>
                <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 12 }}>Aucune carte bancaire requise · Annulation libre 24h avant</p>
              </div>
            </>
          )}

          {/* ── STEP : CALENDLY ── */}
          {step === "calendly" && (
            <div>
              {/* Breadcrumb */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
                <button onClick={() => setStep("choix")} style={{ ...btnSecondary, padding: "7px 14px", fontSize: 12 }}>← Changer de type</button>
                {selectedTypeData && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 20, background: selectedTypeData.color + "12", border: `1px solid ${selectedTypeData.color}30`, fontSize: 12, fontWeight: 600, color: selectedTypeData.color }}>
                    {selectedTypeData.icon} {selectedTypeData.titre} · {selectedTypeData.duree}
                  </div>
                )}
                {formateurSelectionne && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 20, background: "#f0f4ff", border: "1px solid #c7d2fe", fontSize: 12, color: BET_BLUE, fontWeight: 500 }}>
                    👤 {formateurSelectionne.nom}
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 24 }}>
                {/* Calendly */}
                <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb" }}>
                  <div style={{ marginBottom: 16 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Choisissez votre créneau</h2>
                    <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Sélectionnez la date et l'heure qui vous conviennent</p>
                  </div>
                  <CalendlyWidget url={buildCalendlyUrl()} consultType={selectedType} />
                </div>

                {/* Récap + infos */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Récap */}
                  {selectedTypeData && (
                    <div style={{ background: "#fff", borderRadius: 14, padding: 20, border: `1.5px solid ${selectedTypeData.color}30`, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: selectedTypeData.color, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
                        Votre consultation
                      </div>
                      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                        <span style={{ fontSize: 32 }}>{selectedTypeData.icon}</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>{selectedTypeData.titre}</div>
                          <div style={{ fontSize: 12, color: "#9ca3af" }}>⏱ {selectedTypeData.duree} · 💰 {selectedTypeData.prix}</div>
                        </div>
                      </div>
                      {selectedTypeData.avantages.map((av, i) => (
                        <div key={i} style={{ fontSize: 12, color: "#374151", display: "flex", gap: 7, marginBottom: 5 }}>
                          <span style={{ color: selectedTypeData.color }}>✓</span> {av}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Formateur */}
                  {formateurSelectionne && (
                    <div style={{ background: "#fff", borderRadius: 14, padding: 18, border: "1px solid #e5e7eb" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: BET_BLUE, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Votre conseiller</div>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <div style={{ width: 46, height: 46, borderRadius: "50%", background: `linear-gradient(135deg,${BET_BLUE},#0d1a4a)`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#fff", flexShrink: 0 }}>
                          {formateurSelectionne.photo}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{formateurSelectionne.nom}</div>
                          <div style={{ fontSize: 11, color: "#9ca3af" }}>{formateurSelectionne.specialite}</div>
                          <StarRating note={formateurSelectionne.note} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Ce qui se passe après */}
                  <div style={{ background: "#fff", borderRadius: 14, padding: 18, border: "1px solid #e5e7eb" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>Après votre réservation</div>
                    {[
                      { i: "1", t: "Email de confirmation", d: "Vous recevez un email avec le lien de la réunion" },
                      { i: "2", t: "Rappel 24h avant", d: "Nous vous envoyons un rappel automatique" },
                      { i: "3", t: "La consultation", d: "30 à 60 min en visio ou présentiel" },
                      { i: "4", t: "Votre plan personnalisé", d: "Rapport et recommandations sous 48h" },
                    ].map(s => (
                      <div key={s.i} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: BET_BLUE + "14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: BET_BLUE, flexShrink: 0 }}>{s.i}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{s.t}</div>
                          <div style={{ fontSize: 11, color: "#9ca3af" }}>{s.d}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── FAQ ── */}
          <div style={{ marginTop: 60 }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700, color: "#0f172a", textAlign: "center", marginBottom: 24 }}>
              Questions fréquentes
            </h2>
            <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {FAQ.map((item, i) => (
                <div key={i} style={{ borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", overflow: "hidden" }}>
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    style={{ width: "100%", padding: "15px 20px", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", fontFamily: "'DM Sans', sans-serif" }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>{item.q}</span>
                    <span style={{ color: BET_BLUE, fontSize: 18, transition: "transform .2s", transform: openFaq === i ? "rotate(45deg)" : "none" }}>+</span>
                  </button>
                  {openFaq === i && (
                    <div style={{ padding: "0 20px 15px", fontSize: 14, color: "#6b7280", lineHeight: 1.7, borderTop: "1px solid #f1f5f9" }}>
                      <div style={{ paddingTop: 12 }}>{item.r}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── FORMULAIRE CONTACT ALTERNATIF ── */}
          <div style={{ marginTop: 60, background: `linear-gradient(135deg, ${BET_BLUE}08, ${BET_RED}05)`, borderRadius: 20, padding: "40px 32px", border: "1px solid #e5e7eb" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "center" }}>
              <div>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>
                  Préférez-vous qu'on vous rappelle ?
                </h2>
                <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.7 }}>
                  Laissez vos coordonnées et un conseiller BET vous contacte dans les 24h pour planifier votre consultation.
                </p>
              </div>
              {formSent ? (
                <div style={{ textAlign: "center", padding: 24 }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Message envoyé !</h3>
                  <p style={{ fontSize: 13, color: "#6b7280" }}>Nous vous recontacterons sous 24h.</p>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <input type="text" placeholder="Votre nom *" required value={formContact.nom} onChange={e => setFormContact({ ...formContact, nom: e.target.value })} style={inputSt} />
                    <input type="email" placeholder="Email *" required value={formContact.email} onChange={e => setFormContact({ ...formContact, email: e.target.value })} style={inputSt} />
                  </div>
                  <input type="tel" placeholder="Téléphone" value={formContact.phone} onChange={e => setFormContact({ ...formContact, phone: e.target.value })} style={inputSt} />
                  <textarea placeholder="Votre message (optionnel)" value={formContact.message} onChange={e => setFormContact({ ...formContact, message: e.target.value })} style={{ ...inputSt, minHeight: 70, resize: "vertical" }} />
                  <button type="submit" style={{ ...btnPrimary, padding: "12px" }}>
                    📞 Demander à être rappelé
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── STYLES ──────────────────────────────────────────
const btnPrimary  = { background: `linear-gradient(135deg, ${BET_BLUE}, #0d1a4a)`, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 14, fontFamily: "'DM Sans',sans-serif", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 22px", transition: "transform .15s, box-shadow .15s" };
const btnSecondary= { background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "'DM Sans',sans-serif", padding: "9px 16px" };
const inputSt     = { padding: "11px 14px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none", width: "100%", background: "#fff" };