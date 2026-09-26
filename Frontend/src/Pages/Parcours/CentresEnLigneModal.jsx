import React, { useState, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
// useNavigate removed - auth redirect now via bet:openLoginModal event
import { supabase } from "../../config/supabase";
import PromosBanner from "../Components/PromosBanner/PromosBanner";
import { payerAvecTouchPoint, parsePrixFCFA, calcMontantReduit } from "../../utils/touchpoint";

const API           = process.env.REACT_APP_API_URL || "http://localhost:5001";
const LS_OFFRES_KEY = "bet_offres_en_ligne";
const F             = "'Montserrat', 'Segoe UI', sans-serif";
const BET_BLUE      = "#0891b2";
const BET_DARK      = "#011451";
const BET_NAVY      = "#0c33ac";

if (!document.querySelector("#cel-styles")) {
  const s = document.createElement("style");
  s.id = "cel-styles";
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');
    @keyframes celFU   { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
    @keyframes celSpin { to{transform:rotate(360deg)} }
    @keyframes celIn   { from{opacity:0;transform:scale(.96)} to{opacity:1;transform:scale(1)} }
    @keyframes celSlide { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
    .cel-overlay { position:fixed;inset:0;background:rgba(10,20,50,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px); }
    .cel-box     { background:#fff;border-radius:24px;width:100%;max-width:800px;max-height:92vh;overflow-y:auto;box-shadow:0 32px 80px rgba(0,0,0,.28);animation:celIn .25s ease; }
    .cel-offre-card:hover  { border-color:${BET_BLUE}!important;transform:translateY(-4px)!important;box-shadow:0 12px 32px rgba(8,145,178,.14)!important; }
    .cel-assist-card:hover { border-color:${BET_BLUE}!important;transform:translateY(-3px)!important;box-shadow:0 8px 24px rgba(8,145,178,.12)!important; }
    @media(max-width:600px){ .cel-offres-grid{grid-template-columns:1fr!important;} .cel-assist-grid{grid-template-columns:1fr 1fr!important;} .cel-overlay{align-items:flex-start!important;overflow-y:auto!important;padding-top:16px!important;padding-bottom:16px!important;} }
    @media(max-width:380px){ .cel-assist-grid{grid-template-columns:1fr!important;} .cel-pack-grid{grid-template-columns:1fr!important;} }
  `;
  document.head.appendChild(s);
}

/* ── Dots de progression ── */
function StepDots({ current }) {
  return (
    <div style={{ display:"flex", gap:6, justifyContent:"center", marginBottom:20 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: i === current ? 24 : 8, height:8, borderRadius:999,
          background: i < current ? "#22c55e" : i === current ? BET_BLUE : "#e2e8f0",
          transition:"all .3s"
        }} />
      ))}
    </div>
  );
}

/* ── Avatar ── */
function Avatar({ a, size = 56 }) {
  const ini = `${a.prenom?.[0] || ""}${a.nom?.[0] || ""}`.toUpperCase();
  const src = a.photo_url || a.avatar_url || null;
  return src
    ? <img src={src} alt={a.prenom} style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover", flexShrink:0, border:"2.5px solid #e2e8f0" }} />
    : <div style={{ width:size, height:size, borderRadius:"50%", background:`linear-gradient(135deg,${BET_NAVY},${BET_BLUE})`, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:Math.max(10, size * .32), flexShrink:0, fontFamily:F }}>
        {ini || "?"}
      </div>;
}

/* ── Lit les offres en ligne depuis localStorage ── */
function lireOffresEnLigne() {
  try {
    const s = localStorage.getItem(LS_OFFRES_KEY);
    if (!s) return [];
    return JSON.parse(s).filter(o => o.actif !== false);
  } catch { return []; }
}

/* ── Styles partagés formulaire ── */
const labelStyle = { fontSize:".76rem", fontWeight:700, color:"#374151", display:"block", marginBottom:5, fontFamily:F };
const inputStyle = { width:"100%", padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:".84rem", fontFamily:F, outline:"none", boxSizing:"border-box", color:BET_DARK };
const lockedInputStyle = { ...inputStyle, background:"#f1f5f9", color:"#64748b", cursor:"not-allowed" };
const errStyle   = { color:"#ff2945", fontSize:".72rem", marginTop:4, marginBottom:0 };
const primaryBtn = { width:"100%", padding:"13px 0", background:`linear-gradient(135deg,${BET_BLUE},${BET_NAVY})`, color:"#fff", border:"none", borderRadius:999, fontWeight:800, fontSize:".88rem", fontFamily:F, cursor:"pointer", transition:"opacity .18s" };

/* ════════════════════════════════════════════════════════
   MODAL CENTRES VIRTUELS - Mini-parcours en ligne
   Étape 0 : Offres en ligne
   Étape 1 : Assistantes disponibles (non assignées à un centre physique)
   Étape 2 : Paiement & confirmation
   Étape 3 : Succès
════════════════════════════════════════════════════════ */
export default function CentresEnLigneModal({ isOpen, onClose, onSelectAssistante }) {
  const [sbUser,            setSbUser]        = useState(null);
  const [step,              setStep]          = useState(0);
  const [offres,            setOffres]        = useState([]);
  const [offreChoisie,      setOffreChoisie]  = useState(null);
  const [assistantes,       setAssistantes]   = useState([]);
  const [assistanteChoisie, setAssistanteChoisie] = useState(null);
  const [loading,           setLoading]       = useState(false);
  const [erreur,            setErreur]        = useState("");

  /* Coaching privé uniquement - même config/logique que ParcoursModal.jsx */
  const GRILLE_PRIVE_DEFAULT = {
    classique: { label:"Classique", frequence:"3 séances de 2h / semaine", cabinet:150000, domicile:200000, en_ligne:120000 },
    intensive: { label:"Intensive",  frequence:"5 séances / semaine",       cabinet:200000, domicile:300000, en_ligne:160000 },
  };
  const [grillePrive,  setGrillePrive]  = useState(GRILLE_PRIVE_DEFAULT);
  const [packCoaching, setPackCoaching] = useState("classique");
  const [lieuChoix,    setLieuChoix]    = useState("en_ligne");
  const [zoneForm,     setZoneForm]     = useState("");
  const [dispos,       setDispos]       = useState([]); // [{jour, debut}]
  const [centres,      setCentres]      = useState([]);
  const [centreChoisi, setCentreChoisi] = useState(null);

  /* ── FORMULES DE GROUPE ───────────────────────────────────────────────────
     Cette modale, ouverte depuis la barre de navigation, vend les mêmes offres que le
     parcours principal - mais elle ignorait leurs formules : un client qui passait par ici
     était facturé le prix d'appel de la carte, quel que soit le rythme qu'il voulait. */
  const [formuleGroupe, setFormuleGroupe] = useState(null);

  const formulesGroupeDe = (o) => {
    if (o?.formules_actif !== true) return [];
    return (o.formules || [])
      .map(f => ({ id:f.id, label:f.label, frequence:f.frequence, tarif:Number(f.tarif) || 0 }))
      .filter(f => f.tarif > 0 && f.label);
  };
  const formulesGroupe = useMemo(
    () => (offreChoisie?.type_coaching === "prive" ? [] : formulesGroupeDe(offreChoisie)),
    [offreChoisie]
  );
  const formuleGroupeChoisie = useMemo(
    () => formulesGroupe.find(f => f.id === formuleGroupe) || null,
    [formulesGroupe, formuleGroupe]
  );

  useEffect(() => {
    supabase.from("plateforme_config").select("valeur").eq("key","coaching_prive_config").maybeSingle()
      .then(({ data, error }) => {
        if (!error && data?.valeur && typeof data.valeur === "object") {
          const v = data.valeur;
          const merged = { ...GRILLE_PRIVE_DEFAULT };
          Object.keys(v).forEach(k => { merged[k] = { ...(GRILLE_PRIVE_DEFAULT[k] || {}), ...v[k] }; });
          setGrillePrive(merged);
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Liste des centres BET (pour "Au cabinet") - même source que ParcoursModal.jsx */
  useEffect(() => {
    if (!isOpen) return;
    fetch(`${API}/api/parcours/centres`).then(r => r.json()).then(d => setCentres(d.centres || [])).catch(() => {});
  }, [isOpen]);

  /* centres_master (grille tarifaire par centre, dont coaching privé spécifique)
     - même source que ParcoursModal.jsx, pour appliquer la grille du centre choisi
     à la place de la grille globale coaching_prive_config quand elle est activée. */
  const [centresMaster, setCentresMaster] = useState([]);
  useEffect(() => {
    if (!isOpen) return;
    supabase.from("plateforme_config").select("valeur").eq("key","centres_master").maybeSingle()
      .then(({ data, error }) => { if (!error && Array.isArray(data?.valeur)) setCentresMaster(data.valeur); })
      .catch(() => {});
  }, [isOpen]);
  const findMaster = (centre) => {
    if (!centre) return null;
    const norm = s => (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/^bet\s+/,"").trim();
    const cn = norm(centre.nom);
    return centresMaster.find(m => norm(m.name) === cn) ||
           centresMaster.find(m => norm(m.name).includes(cn) || cn.includes(norm(m.name)));
  };
  const centreMasterChoisi = lieuChoix === "cabinet" && centreChoisi ? findMaster(centreChoisi) : null;

  /* Les formules portées par l'offre priment sur la grille du centre puis sur la grille
     globale - même ordre de priorité que ParcoursModal et CourseDetail. */
  const formulesPriveDeLOffre = useMemo(() => {
    const o = offreChoisie;
    if (o?.type_coaching !== "prive" || o?.formules_actif !== true) return null;
    const liste = (o.formules || []).filter(f => f.label && (Number(f.tarif) > 0 || Number(f.tarif_domicile) > 0));
    if (!liste.length) return null;
    return Object.fromEntries(liste.map(f => [f.id || f.label, {
      label:     f.label,
      frequence: f.frequence || "",
      cabinet:   Number(f.tarif) || 0,
      en_ligne:  Number(f.tarif) || 0,
      domicile:  Number(f.tarif_domicile) || Number(f.tarif) || 0,
    }]));
  }, [offreChoisie]);

  const grillePriveeActive = formulesPriveDeLOffre
    || (centreMasterChoisi?.grilleTarifaire?.coachingPrive?.actif
      ? { classique: centreMasterChoisi.grilleTarifaire.coachingPrive.classique, intensive: centreMasterChoisi.grilleTarifaire.coachingPrive.intensive }
      : grillePrive);

  /* Le pack par défaut « classique » n'existe pas dans une grille propre à l'offre : sans
     ce recalage, le sélecteur afficherait 0 F. */
  useEffect(() => {
    if (!formulesPriveDeLOffre) return;
    const cles = Object.keys(formulesPriveDeLOffre);
    if (cles.length && !cles.includes(packCoaching)) setPackCoaching(cles[0]);
  }, [formulesPriveDeLOffre]); // eslint-disable-line

  /* LE MONTANT DE RÉFÉRENCE DU GROUPE - affiché ET facturé : le tarif de la formule prime
     sur le prix d'appel de l'offre. Le coaching privé garde son propre circuit (demande
     envoyée, tarif du pack arrêté avec le PA), délibérément inchangé ici. */
  const montantReference = useMemo(
    () => formuleGroupeChoisie?.tarif || parsePrixFCFA(offreChoisie?.prix) || null,
    [formuleGroupeChoisie, offreChoisie]
  );

  /* Formulaire */
  const [form,         setForm]         = useState({ nom:"", telephone:"", email:"" });
  const [formErrors,   setFormErrors]   = useState({});
  const [modePaiement] = useState("mobile_money"); // sélecteur retiré - un seul mode réellement utilisé (TouchPoint)
  const [submitting,   setSubmitting]   = useState(false);

  /* Code promo */
  const [codePromo,        setCodePromo]        = useState("");
  const [codePromoApplied, setCodePromoApplied] = useState(null); // { code, type_reduction, valeur, description }
  const [codePromoLoading, setCodePromoLoading] = useState(false);
  const [codePromoError,   setCodePromoError]   = useState("");

  /* Auth inline */
  const [authTab,     setAuthTab]     = useState("login");
  const [authFormCel, setAuthFormCel] = useState({ email:"", password:"", prenom:"", nom:"", telephone:"" });
  const [authLoading, setAuthLoading] = useState(false);
  const [authErr,     setAuthErr]     = useState("");

  const prefillForm = useCallback((u) => {
    if (!u) return;
    const meta = u.user_metadata || {};
    const nom = (meta.nom && meta.prenom)
      ? `${meta.prenom} ${meta.nom}`
      : meta.full_name || u.email?.split("@")[0] || "";
    setForm({ nom, email: u.email || "", telephone: meta.telephone || "" });
  }, []);

  /* ── Session Supabase ── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSbUser(session?.user || null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user || null;
      setSbUser(u);
      if (u) { prefillForm(u); setAuthErr(""); }
    });
    return () => subscription.unsubscribe();
  }, [prefillForm]);

  /* ── Chargement à l'ouverture ── */
  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setOffreChoisie(null);
    setAssistanteChoisie(null);
    setPackCoaching("classique");
    setLieuChoix("en_ligne");
    setZoneForm("");
    setCentreChoisi(null);
    setFormuleGroupe(null);
    setDispos([]);
    setErreur("");
    setForm({ nom:"", telephone:"", email:"" });
    setFormErrors({});
    setCodePromo(""); setCodePromoApplied(null); setCodePromoError("");
    setAuthTab("login"); setAuthFormCel({ email:"", password:"", prenom:"", nom:"", telephone:"" }); setAuthErr("");
    // Pre-fill if user is already logged in
    if (sbUser) prefillForm(sbUser);
    setOffres(lireOffresEnLigne());

    // Sync depuis Supabase (dashboard sur port différent - localStorage non partagé)
    supabase.from("plateforme_config").select("valeur").eq("key","offres_en_ligne").maybeSingle()
      .then(({ data, error }) => {
        if (!error && Array.isArray(data?.valeur) && data.valeur.length) {
          localStorage.setItem(LS_OFFRES_KEY, JSON.stringify(data.valeur));
          setOffres(lireOffresEnLigne());
        }
      });

    const onStorage = (e) => {
      if (e.key === LS_OFFRES_KEY) setOffres(lireOffresEnLigne());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [isOpen, sbUser, prefillForm]);

  /* ── Charger assistantes à l'étape 1 (offres non coaching-privé uniquement -
     le coaching privé saute directement au formulaire, le PA étant tiré à l'envoi) ── */
  useEffect(() => {
    if (!isOpen || step !== 1) return;
    setLoading(true);
    setErreur("");
    fetch(`${API}/api/parcours/assistantes-ligne?profil=b2c`)
      .then(r => r.json())
      .then(d => setAssistantes(d.assistantes || []))
      .catch(() => setErreur("Impossible de charger les assistantes. Réessayez."))
      .finally(() => setLoading(false));
  }, [isOpen, step]);

  const handleClose = useCallback(() => {
    setStep(0);
    setOffreChoisie(null);
    setAssistanteChoisie(null);
    setPackCoaching("classique");
    setLieuChoix("en_ligne");
    setZoneForm("");
    setCentreChoisi(null);
    setFormuleGroupe(null);
    setDispos([]);
    setErreur("");
    setForm({ nom:"", telephone:"", email:"" });
    setFormErrors({});
    setCodePromo(""); setCodePromoApplied(null); setCodePromoError("");
    onClose();
  }, [onClose]);

  // Coaching privé : pas d'étape "choisir une assistante" - formulaire direct
  // (pack/lieu + coordonnées + disponibilités), le PA est affecté automatiquement
  // au moment de l'envoi (même logique que ParcoursModal.jsx / ParcoursParticulier.jsx).
  const choisirOffre = (o) => {
    setOffreChoisie(o);
    setErreur("");
    if (o.type_coaching === "prive") {
      // Modale dédiée au catalogue en ligne - le lieu est donc toujours "en ligne", jamais
      // de choix cabinet/domicile ici.
      setLieuChoix("en_ligne");
      if (!sbUser) {
        setStep("authgate");
        window.dispatchEvent(new CustomEvent("bet:openLoginModal", {
          detail: {
            returnUrl: window.location.pathname + window.location.search,
            context: { type: "centres_en_ligne" }
          }
        }));
      } else {
        prefillForm(sbUser);
        setStep(2);
      }
    } else if (formulesGroupeDe(o).length > 0) {
      /* La formule d'abord, l'assistante ensuite - même ordre que ParcoursModal : on sait
         ce qu'on achète, et à quel prix, avant d'engager qui que ce soit. */
      setFormuleGroupe(null);
      setStep("formule");
    } else {
      setStep(1);
    }
  };

  const choisirAssistante = (a) => {
    setAssistanteChoisie(a);
    setErreur("");
    if (!sbUser) {
      setStep("authgate");
      window.dispatchEvent(new CustomEvent("bet:openLoginModal", {
        detail: {
          returnUrl: window.location.pathname + window.location.search,
          context: { type: "centres_en_ligne" }
        }
      }));
    } else {
      prefillForm(sbUser);
      setStep(2);
    }
  };

  // Lorsque l'utilisateur se connecte depuis la modale ouverte sur auth gate, passer auto à l'étape 2
  useEffect(() => {
    if (step === "authgate" && sbUser) {
      prefillForm(sbUser);
      setStep(2);
    }
  }, [sbUser, step, prefillForm]);

  const validateForm = () => {
    const errs = {};
    const coachingPrive = offreChoisie?.type_coaching === "prive";
    if (!form.nom.trim())       errs.nom       = "Nom complet requis";
    if (!form.telephone.trim()) errs.telephone = "Numéro WhatsApp requis";
    if (coachingPrive && lieuChoix === "domicile" && !zoneForm.trim()) errs.zone = "Requis";
    if (coachingPrive && lieuChoix === "cabinet" && !centreChoisi) errs.centre = "Choisissez un cabinet";
    if (coachingPrive && dispos.length === 0) errs.dispos = "Sélectionnez au moins un jour";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validerCodePromo = async (codeOverride) => {
    const code = (codeOverride || codePromo).trim().toUpperCase();
    if (!code) return;
    setCodePromoLoading(true);
    setCodePromoError("");
    setCodePromoApplied(null);
    try {
      const token = localStorage.getItem("bet_token") || localStorage.getItem("admin_token") || "";
      const r = await fetch(`${API}/api/codes-promo/valider`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ code, offre_type: "en_ligne" }),
      });
      const d = await r.json();
      if (!r.ok) { setCodePromoError(d.error || "Code invalide"); return; }
      setCodePromoApplied(d);
      const reduc = d.type_reduction === "pourcentage" ? `-${d.valeur}%` : `-${Number(d.valeur).toLocaleString("fr-FR")} FCFA`;
      toast.success(`🎟️ Code ${d.code} activé - ${reduc}`);
    } catch { setCodePromoError("Impossible de vérifier le code"); }
    finally { setCodePromoLoading(false); }
  };

  const submitInscription = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    setErreur("");
    const coachingPrive = offreChoisie?.type_coaching === "prive";
    try {
      let assistanteId = assistanteChoisie?.id;

      // Coaching privé : le PA est tiré au moment de l'envoi (pas de choix visiteur),
      // même logique que ParcoursModal.jsx / ParcoursParticulier.jsx.
      if (coachingPrive) {
        const paR = await fetch(`${API}/api/parcours/assistantes-pa`);
        const paD = await paR.json();
        const pa = (paD.assistantes || [])[0] || null;
        if (!pa) throw new Error("Aucun conseiller pédagogique disponible. Contactez-nous directement.");
        setAssistanteChoisie(pa);
        assistanteId = pa.id;
      }

      const r = await fetch(`${API}/api/parcours/assignation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistante_id:      assistanteId,
          prospect_nom:       form.nom.trim(),
          prospect_email:     form.email.trim() || undefined,
          prospect_telephone: form.telephone.trim(),
          type_cours:         "en_ligne",
          type_coaching:      coachingPrive ? "prive" : undefined,
          pack_coaching:      coachingPrive ? packCoaching : undefined,
          lieu_coaching:      coachingPrive ? lieuChoix : undefined,
          adresse_coaching:   coachingPrive && lieuChoix === "domicile" ? zoneForm.trim() || undefined : undefined,
          centre_id:          coachingPrive && lieuChoix === "cabinet" ? centreChoisi?.id : undefined,
          centre_coaching:    coachingPrive && lieuChoix === "cabinet" ? centreChoisi?.nom : undefined,
          disponibilites:     coachingPrive && dispos.length > 0 ? { horaires: dispos } : undefined,
          offre_label:        offreChoisie?.label || undefined,
          source:             coachingPrive ? "formulaire_coaching_prive_enligne" : "formulaire_en_ligne",
          mode_paiement:      modePaiement || undefined,
          // Montant NON réduit ici volontairement : le backend revalide le code promo et
          // applique lui-même la réduction sur ce montant de référence (voir parcours.js).
          montant_paye:       coachingPrive ? undefined : (montantReference || undefined),
          code_promo:         coachingPrive ? undefined : (codePromoApplied?.code || undefined),
          // La formule retenue, pour que l'assistante et l'onboarding sachent quoi planifier.
          ...(formuleGroupeChoisie ? {
            pack_coaching:       formuleGroupeChoisie.label,
            formation_souhaitee: `${offreChoisie?.label || "Coaching de groupe"} - ${formuleGroupeChoisie.label}`,
            cout_formation:      formuleGroupeChoisie.tarif,
            formule_groupe: {
              id:        formuleGroupeChoisie.id,
              label:     formuleGroupeChoisie.label,
              frequence: formuleGroupeChoisie.frequence,
              tarif:     formuleGroupeChoisie.tarif,
              canal:     "en_ligne",
            },
          } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur lors de l'envoi");
      // Réduction du code promo déjà validé appliquée ici - sinon TouchPoint facturait le
      // plein tarif alors que la réduction n'était qu'affichée.
      const montantPaiement = calcMontantReduit(
        coachingPrive ? parsePrixFCFA(offreChoisie?.prix) : montantReference,
        coachingPrive ? null : codePromoApplied);
      if ((modePaiement === "mobile_money" || modePaiement === "carte_bancaire") && montantPaiement) {
        await payerAvecTouchPoint({
          clientInfo:    { nom: form.nom.trim(), email: form.email.trim(), telephone: form.telephone.trim() },
          montant:       montantPaiement,
          offreLabel:    offreChoisie?.label,
          assignationId: d.assignation?.id,
          assistanteId:  assistanteId,
        });
        return; // redirection vers la page de paiement TouchPoint en cours
      }
      setStep(3);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAuthLogin = async () => {
    if (!authFormCel.email || !authFormCel.password) return setAuthErr("Email et mot de passe requis.");
    setAuthLoading(true); setAuthErr("");
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authFormCel.email, password: authFormCel.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Email ou mot de passe incorrect");
      await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
    } catch (err) { setAuthErr(err.message); }
    finally { setAuthLoading(false); }
  };

  const handleAuthRegister = async () => {
    if (!authFormCel.prenom || !authFormCel.nom || !authFormCel.email || !authFormCel.password) return setAuthErr("Tous les champs * sont requis.");
    setAuthLoading(true); setAuthErr("");
    try {
      const res = await fetch(`${API}/api/auth/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: authFormCel.nom, prenom: authFormCel.prenom, email: authFormCel.email, telephone: authFormCel.telephone, password: authFormCel.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'inscription");
      const { error } = await supabase.auth.signInWithPassword({ email: authFormCel.email, password: authFormCel.password });
      if (error) throw new Error(error.message);
    } catch (err) { setAuthErr(err.message); }
    finally { setAuthLoading(false); }
  };

  if (!isOpen) return null;

  const isCoachingPrive = offreChoisie?.type_coaching === "prive";

  const titres = {
    0: "Nos offres en ligne",
    1: "Choisissez votre assistante",
    2: "Paiement & confirmation",
    authgate: "Connexion requise",
    3: "Inscription confirmée !",
  };

  return (
    <div className="cel-overlay" onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="cel-box">

        {/* ── Header ── */}
        <div style={{ background:`linear-gradient(135deg,${BET_DARK},${BET_NAVY})`, borderRadius:"24px 24px 0 0", padding:"20px 24px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ color:"rgba(255,255,255,.55)", fontSize:".68rem", fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", marginBottom:3 }}>
              BET Languages · Centre virtuel en ligne
            </div>
            <div style={{ color:"#fff", fontWeight:800, fontSize:"1rem", fontFamily:F }}>
              {titres[step] || ""}
            </div>
          </div>
          <button onClick={handleClose} style={{ background:"rgba(255,255,255,.12)", border:"none", borderRadius:"50%", width:32, height:32, color:"#fff", fontSize:"1.1rem", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✕</button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding:"22px 24px 28px" }}>

          {typeof step === "number" && step < 3 && <StepDots current={step} />}

          {erreur && (
            <div style={{ background:"#fff0f2", border:"1px solid #ffb3bc", borderRadius:10, padding:"10px 14px", color:"#ff2945", fontSize:".84rem", marginBottom:16 }}>
              ⚠️ {erreur}
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              ÉTAPE 0 - Offres en ligne
          ═══════════════════════════════════════════════ */}
          {step === 0 && (
            <div style={{ animation:"celFU .3s ease" }}>
              <PromosBanner
                offreType="en_ligne"
                accentColor={BET_BLUE}
                onApply={(code) => { setCodePromo(code); setCodePromoApplied(null); setCodePromoError(""); validerCodePromo(code); }}
              />
              <p style={{ color:"#64748b", fontSize:".84rem", marginBottom:20, lineHeight:1.6 }}>
                Découvrez nos formules de cours en ligne. Apprenez où que vous soyez, à votre rythme, avec nos assistantes dédiées.
              </p>

              {offres.length === 0 ? (
                <div style={{ textAlign:"center", padding:"36px 20px", background:"#f8fafc", borderRadius:16, border:"1.5px dashed #e2e8f0" }}>
                  <div style={{ fontSize:"2rem", marginBottom:10 }}>💻</div>
                  <p style={{ color:"#64748b", fontSize:".88rem", lineHeight:1.6, margin:0 }}>
                    Nos offres seront disponibles très prochainement.<br />
                    <strong>Contactez-nous</strong> pour en savoir plus.
                  </p>
                  <button onClick={() => setStep(1)}
                    style={{ marginTop:18, padding:"10px 24px", background:`linear-gradient(135deg,${BET_BLUE},${BET_NAVY})`, color:"#fff", border:"none", borderRadius:999, cursor:"pointer", fontWeight:700, fontSize:".84rem", fontFamily:F }}>
                    Voir les assistantes →
                  </button>
                </div>
              ) : (
                <>
                  <div className="cel-offres-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:18 }}>
                    {offres.map((o, i) => {
                      const COLORS = [BET_BLUE, BET_NAVY, "#059669", "#d97706", "#7c3aed", "#ff2945"];
                      const col = COLORS[i % COLORS.length];
                      return (
                        <div key={o.id || i} className="cel-offre-card"
                          onClick={() => choisirOffre(o)}
                          style={{ border:"2px solid #e2e8f0", borderRadius:18, padding:"18px 16px", cursor:"pointer", transition:"all .22s", background:"#fafafa", display:"flex", flexDirection:"column", gap:10 }}>

                          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
                            <div style={{ width:44, height:44, borderRadius:12, background:`${col}15`, border:`2px solid ${col}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.4rem", flexShrink:0 }}>
                              {o.icon || "💻"}
                            </div>
                            <div style={{ textAlign:"right" }}>
                              <div style={{ fontWeight:800, fontSize:".88rem", color:col, fontFamily:F }}>{o.prix || "Sur devis"}</div>
                              {o.duration && <div style={{ fontSize:".68rem", color:"#94a3b8", marginTop:1 }}>{o.duration}</div>}
                            </div>
                          </div>

                          <div>
                            <div style={{ fontWeight:800, fontSize:".88rem", color:BET_DARK, fontFamily:F, marginBottom:4, lineHeight:1.3 }}>{o.label}</div>
                            {o.desc && (
                              <ul style={{ margin:0, padding:"0 0 0 16px", fontSize:".74rem", color:"#64748b", lineHeight:1.5 }}>
                                {o.desc.split("\n").map(s => s.trim()).filter(Boolean).map((line, li) => <li key={li}>{line}</li>)}
                              </ul>
                            )}
                          </div>

                          {o.brochure_url && (
                            <a href={o.brochure_url} download={o.brochure_nom || true} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{ display:"flex", alignItems:"center", gap:6, background:"#eef1ff", border:"1.5px solid #bae6fd", borderRadius:8, padding:"6px 10px", textDecoration:"none", marginTop:"auto" }}>
                              <span style={{ fontSize:".8rem" }}>📄</span>
                              <span style={{ fontSize:".7rem", fontWeight:700, color:BET_BLUE, flex:1 }}>{o.brochure_nom || "Télécharger la brochure"}</span>
                              <span style={{ fontSize:".62rem", fontWeight:700, color:"#94a3b8", background:"#f1f5f9", borderRadius:4, padding:"1px 5px" }}>PDF</span>
                            </a>
                          )}

                          <div style={{ background:`linear-gradient(135deg,${col},${BET_NAVY})`, color:"#fff", borderRadius:999, padding:"8px 0", fontWeight:800, fontSize:".74rem", textAlign:"center", fontFamily:F, marginTop:"auto" }}>
                            Choisir cette offre →
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ textAlign:"center" }}>
                    <button onClick={() => setStep(1)}
                      style={{ background:"none", border:"none", color:"#94a3b8", fontSize:".78rem", cursor:"pointer", textDecoration:"underline" }}>
                      Continuer sans sélectionner d'offre →
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              ÉTAPE FORMULE - le rythme et son tarif, avant l'assistante
          ═══════════════════════════════════════════════ */}
          {step === "formule" && (
            <div style={{ animation:"celFU .3s ease" }}>
              <button onClick={() => { setFormuleGroupe(null); setOffreChoisie(null); setStep(0); }}
                style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:".82rem", marginBottom:16, display:"flex", alignItems:"center", gap:4, padding:0, fontFamily:F }}>
                ← Retour aux offres
              </button>

              <div style={{ display:"flex", alignItems:"center", gap:12, background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:12, padding:"12px 16px", marginBottom:18 }}>
                <div style={{ width:40, height:40, borderRadius:10, background:"linear-gradient(135deg,#059669,#065f46)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.3rem", flexShrink:0 }}>👥</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:800, fontSize:".85rem", color:"#065f46", fontFamily:F }}>{offreChoisie?.label}</div>
                  <div style={{ fontSize:".72rem", color:"#047857" }}>Choisissez votre formule</div>
                </div>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:10, marginBottom:16 }}>
                {formulesGroupe.map(f => {
                  const selected = formuleGroupe === f.id;
                  return (
                    <button key={f.id} type="button" onClick={() => setFormuleGroupe(f.id)}
                      style={{ textAlign:"left", cursor:"pointer", border:`2px solid ${selected ? "#059669" : "#e2e8f0"}`,
                        background: selected ? "#f0fdf4" : "#fafafa", borderRadius:16, padding:"14px",
                        boxShadow: selected ? "0 0 0 4px #05966920" : "none", transition:"all .2s",
                        display:"flex", flexDirection:"column", gap:6, position:"relative", fontFamily:F }}>
                      {selected && (
                        <div style={{ position:"absolute", top:10, right:10, width:22, height:22, borderRadius:"50%", background:"#059669", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:".72rem", fontWeight:800 }}>✓</div>
                      )}
                      <div style={{ fontWeight:800, fontSize:".86rem", color:BET_DARK }}>{f.label}</div>
                      {f.frequence && <div style={{ fontSize:".72rem", color:"#64748b", lineHeight:1.45 }}>{f.frequence}</div>}
                      <div style={{ marginTop:"auto", fontWeight:800, fontSize:".95rem", color:"#059669" }}>
                        {f.tarif.toLocaleString("fr-FR")} F <span style={{ fontSize:".68rem", fontWeight:600, color:"#64748b" }}>/ mois</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {formuleGroupeChoisie && (
                <div style={{ background:"#0f172a", color:"#fff", borderRadius:12, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
                  <div>
                    <div style={{ fontWeight:800, fontSize:".82rem" }}>Formule {formuleGroupeChoisie.label}</div>
                    <div style={{ fontSize:".7rem", color:"rgba(255,255,255,.7)" }}>{formuleGroupeChoisie.frequence}</div>
                  </div>
                  <div style={{ fontWeight:800, fontSize:"1.05rem" }}>{formuleGroupeChoisie.tarif.toLocaleString("fr-FR")} F / mois</div>
                </div>
              )}

              <button type="button" disabled={!formuleGroupeChoisie} onClick={() => setStep(1)}
                style={{ width:"100%", padding:"12px 0", borderRadius:999, border:"none", fontFamily:F, fontWeight:800, fontSize:".85rem",
                  background: formuleGroupeChoisie ? "linear-gradient(135deg,#059669,#065f46)" : "#e2e8f0",
                  color: formuleGroupeChoisie ? "#fff" : "#94a3b8",
                  cursor: formuleGroupeChoisie ? "pointer" : "not-allowed" }}>
                {formuleGroupeChoisie ? "Continuer vers le choix de l'assistante →" : "Choisissez une formule"}
              </button>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              ÉTAPE 1 - Assistantes en ligne
          ═══════════════════════════════════════════════ */}
          {step === 1 && (
            <div style={{ animation:"celFU .3s ease" }}>
              <button onClick={() => setStep(formulesGroupe.length > 0 ? "formule" : 0)}
                style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:".82rem", marginBottom:16, display:"flex", alignItems:"center", gap:4, padding:0, fontFamily:F }}>
                {formulesGroupe.length > 0 ? "← Retour aux formules" : "← Retour aux offres"}
              </button>

              {offreChoisie && (
                <div style={{ display:"flex", alignItems:"center", gap:10, background:"#eef1ff", border:"1.5px solid #bae6fd", borderRadius:12, padding:"10px 14px", marginBottom:16 }}>
                  <span style={{ fontSize:"1.1rem" }}>{offreChoisie.icon || "💻"}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:800, fontSize:".82rem", color:BET_DARK }}>{offreChoisie.label}</div>
                    {/* Le tarif de la formule retenue, et non le prix d'appel de la carte. */}
                    <div style={{ fontSize:".72rem", color:"#64748b" }}>
                      {formuleGroupeChoisie
                        ? `${formuleGroupeChoisie.label} · ${formuleGroupeChoisie.tarif.toLocaleString("fr-FR")} F / mois`
                        : `${offreChoisie.prix}${offreChoisie.duration ? ` · ${offreChoisie.duration}` : ""}`}
                    </div>
                  </div>
                  <button onClick={() => setOffreChoisie(null)}
                    style={{ background:"none", border:"none", fontSize:".72rem", color:"#94a3b8", cursor:"pointer", fontWeight:700 }}>
                    Changer
                  </button>
                </div>
              )}

              <p style={{ color:"#64748b", fontSize:".84rem", marginBottom:16, lineHeight:1.6 }}>
                Choisissez l'assistante qui vous accompagnera tout au long de votre parcours en ligne.
              </p>

              {loading ? (
                <div style={{ textAlign:"center", padding:48 }}>
                  <div style={{ width:32, height:32, border:"3px solid #e2e8f0", borderTopColor:BET_BLUE, borderRadius:"50%", animation:"celSpin .8s linear infinite", margin:"0 auto 12px" }} />
                  <p style={{ color:"#64748b", fontSize:".88rem", margin:0 }}>Chargement des assistantes…</p>
                </div>
              ) : assistantes.length === 0 ? (
                <div style={{ textAlign:"center", padding:"32px 20px", background:"#f8fafc", borderRadius:14, border:"1.5px dashed #e2e8f0" }}>
                  <div style={{ fontSize:"1.8rem", marginBottom:10 }}>😔</div>
                  <p style={{ color:"#475569", fontSize:".86rem", lineHeight:1.6, margin:0 }}>
                    Aucune assistante disponible pour le moment.<br />
                    <strong>Contactez-nous directement</strong> pour être pris(e) en charge.
                  </p>
                </div>
              ) : (
                <div className="cel-assist-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
                  {assistantes.map(a => {
                    const wa = a.telephone
                      ? `https://wa.me/${a.telephone.replace(/\D/g,"")}?text=${encodeURIComponent(`Bonjour ${a.prenom}, je souhaite m'inscrire à un cours BET en ligne${offreChoisie ? ` - ${offreChoisie.label}` : ""}.`)}`
                      : null;
                    return (
                      <div key={a.id} className="cel-assist-card"
                        onClick={() => choisirAssistante(a)}
                        style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10, border:"2px solid #e2e8f0", borderRadius:18, padding:"20px 14px 16px", cursor:"pointer", transition:"all .22s", background:"#fff", textAlign:"center" }}>

                        <div style={{ position:"relative" }}>
                          <Avatar a={a} size={72} />
                          <span style={{ position:"absolute", bottom:0, right:0, width:16, height:16, borderRadius:"50%", background:"#22c55e", border:"2.5px solid #fff" }} />
                        </div>

                        <div>
                          <div style={{ fontWeight:800, fontSize:".88rem", color:BET_DARK, fontFamily:F, lineHeight:1.3 }}>{a.prenom} {a.nom}</div>
                          <div style={{ fontSize:".68rem", color:"#94a3b8", marginTop:3 }}>Assistante · En ligne</div>
                        </div>

                        {a.telephone && (
                          <div style={{ fontSize:".72rem", color:"#334155", fontWeight:600 }}>📞 {a.telephone}</div>
                        )}

                        {wa && (
                          <a href={wa} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:5, width:"100%", padding:"8px 0", background:"#25d366", color:"#fff", borderRadius:999, textDecoration:"none", fontWeight:700, fontSize:".74rem", fontFamily:F, marginTop:"auto" }}>
                            <span>💬</span> WhatsApp
                          </a>
                        )}

                        <div style={{ width:"100%", padding:"7px 0", background:`linear-gradient(135deg,${BET_BLUE},${BET_NAVY})`, color:"#fff", borderRadius:999, fontWeight:800, fontSize:".72rem", fontFamily:F }}>
                          Choisir →
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              AUTH GATE - Connexion requise
          ═══════════════════════════════════════════════ */}
          {step === "authgate" && (
            <div style={{ animation:"celFU .3s ease", textAlign:"center", padding:"8px 0" }}>
              <div style={{ fontSize:"3rem", marginBottom:12 }}>🔐</div>
              <h3 style={{ fontFamily:F, color:BET_DARK, fontSize:"1.1rem", fontWeight:800, margin:"0 0 10px" }}>
                Connexion requise
              </h3>
              <p style={{ color:"#475569", fontSize:".88rem", lineHeight:1.7, margin:"0 0 20px" }}>
                Pour finaliser votre inscription, connectez-vous à votre espace BET.<br />
                Vos coordonnées seront pré-remplies automatiquement.
              </p>

              {/* Mini recap assistante + offre */}
              <div style={{ background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:12, padding:"12px 16px", marginBottom:20, textAlign:"left", display:"flex", alignItems:"center", gap:12 }}>
                <Avatar a={assistanteChoisie || {}} size={40} />
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:800, fontSize:".85rem", color:BET_DARK }}>
                    {assistanteChoisie?.prenom} {assistanteChoisie?.nom}
                  </div>
                  <div style={{ fontSize:".72rem", color:"#64748b" }}>
                    En ligne{offreChoisie ? ` · ${offreChoisie.label}` : ""}
                    {offreChoisie?.prix ? ` · ${offreChoisie.prix}` : ""}
                  </div>
                </div>
                <span style={{ background:"#f0fdf4", color:"#16a34a", borderRadius:999, padding:"3px 10px", fontSize:".7rem", fontWeight:700, flexShrink:0 }}>✓ Sélectionnée</span>
              </div>

              {/* Tabs */}
              <div style={{ display:"flex", borderRadius:10, overflow:"hidden", border:"1.5px solid #e2e8f0", marginBottom:16 }}>
                {[["login","Se connecter"],["register","Créer un compte"]].map(([t,l]) => (
                  <button key={t} onClick={() => setAuthTab(t)} style={{ flex:1, padding:"10px 0", border:"none", fontWeight:700, fontSize:".84rem", cursor:"pointer", background:authTab===t?BET_NAVY:"#fff", color:authTab===t?"#fff":"#374151", transition:"background .2s" }}>{l}</button>
                ))}
              </div>
              {authTab === "login" ? (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <input style={{ ...inputStyle }} type="email" placeholder="Email *" value={authFormCel.email} onChange={e=>setAuthFormCel(p=>({...p,email:e.target.value}))} />
                  <input style={{ ...inputStyle }} type="password" placeholder="Mot de passe *" value={authFormCel.password} onChange={e=>setAuthFormCel(p=>({...p,password:e.target.value}))} />
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <input style={{ ...inputStyle }} placeholder="Prénom *" value={authFormCel.prenom} onChange={e=>setAuthFormCel(p=>({...p,prenom:e.target.value}))} />
                    <input style={{ ...inputStyle }} placeholder="Nom *" value={authFormCel.nom} onChange={e=>setAuthFormCel(p=>({...p,nom:e.target.value}))} />
                  </div>
                  <input style={{ ...inputStyle }} type="email" placeholder="Email *" value={authFormCel.email} onChange={e=>setAuthFormCel(p=>({...p,email:e.target.value}))} />
                  <input style={{ ...inputStyle }} placeholder="Téléphone" value={authFormCel.telephone} onChange={e=>setAuthFormCel(p=>({...p,telephone:e.target.value}))} />
                  <input style={{ ...inputStyle }} type="password" placeholder="Mot de passe *" value={authFormCel.password} onChange={e=>setAuthFormCel(p=>({...p,password:e.target.value}))} />
                </div>
              )}
              {authErr && <p style={{ fontSize:".78rem", margin:"8px 0 0", color:"#ff2945", textAlign:"center" }}>{authErr}</p>}
              <button onClick={authTab==="login" ? handleAuthLogin : handleAuthRegister} disabled={authLoading}
                style={{ width:"100%", marginTop:14, padding:"12px", background:BET_NAVY, color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", opacity:authLoading?.7:1, fontFamily:F, fontSize:".9rem" }}>
                {authLoading ? "Chargement…" : authTab==="login" ? "Se connecter" : "Créer mon compte"}
              </button>
              <button onClick={() => setStep(1)} style={{ width:"100%", marginTop:10, padding:"10px", background:"transparent", color:"#64748b", border:"1.5px solid #e2e8f0", borderRadius:8, fontWeight:600, fontSize:".82rem", cursor:"pointer", fontFamily:F }}>
                ← Choisir une autre assistante
              </button>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              ÉTAPE 2 - Paiement & confirmation
          ═══════════════════════════════════════════════ */}
          {step === 2 && (
            <div style={{ animation:"celFU .3s ease" }}>
              <button onClick={() => setStep(isCoachingPrive ? 0 : 1)}
                style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:".82rem", marginBottom:16, display:"flex", alignItems:"center", gap:4, padding:0, fontFamily:F }}>
                ← Retour
              </button>

              {/* Récapitulatif */}
              <div style={{ background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:14, padding:"14px 16px", marginBottom:20 }}>
                <div style={{ fontSize:".7rem", fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:".05em", marginBottom:12 }}>Récapitulatif</div>

                {/* Assistante choisie */}
                {assistanteChoisie && (
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
                    <Avatar a={assistanteChoisie} size={42} />
                    <div>
                      <div style={{ fontWeight:800, fontSize:".88rem", color:BET_DARK }}>{assistanteChoisie.prenom} {assistanteChoisie.nom}</div>
                      <div style={{ fontSize:".72rem", color:"#64748b" }}>Assistante · Cours en ligne</div>
                    </div>
                  </div>
                )}

                {/* Offre choisie */}
                {offreChoisie && (
                  <div style={{ borderRadius:10, background:`${BET_BLUE}07`, border:`1.5px solid ${BET_BLUE}20`, overflow:"hidden" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", borderBottom: offreChoisie.desc ? `1px solid ${BET_BLUE}15` : "none" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:".9rem" }}>{offreChoisie.icon || "💻"}</span>
                        <div>
                          <div style={{ fontWeight:800, fontSize:".84rem", color:BET_DARK }}>{offreChoisie.label}</div>
                          {offreChoisie.duration && (
                            <div style={{ fontSize:".68rem", color:"#64748b", marginTop:1 }}>⏱ {offreChoisie.duration}</div>
                          )}
                        </div>
                      </div>
                      <div style={{ fontWeight:900, fontSize:".92rem", color:BET_BLUE, flexShrink:0, textAlign:"right" }}>
                        {formuleGroupeChoisie
                          ? <>{formuleGroupeChoisie.tarif.toLocaleString("fr-FR")} F<div style={{ fontSize:".62rem", fontWeight:700, color:"#64748b" }}>/ mois · {formuleGroupeChoisie.label}</div></>
                          : (offreChoisie.prix || "Sur devis")}
                      </div>
                    </div>
                    {offreChoisie.desc && (
                      <ul style={{ margin:0, padding:"8px 12px 8px 24px", fontSize:".74rem", color:"#475569", lineHeight:1.6 }}>
                        {offreChoisie.desc.split("\n").map(s => s.trim()).filter(Boolean).map((line, li) => <li key={li}>{line}</li>)}
                      </ul>
                    )}
                  </div>
                )}

                {!offreChoisie && (
                  <div style={{ fontSize:".78rem", color:"#94a3b8", fontStyle:"italic" }}>
                    Aucune offre sélectionnée - nos conseillers vous proposeront la formule adaptée.
                  </div>
                )}
              </div>

              {/* Bannière pré-remplissage */}
              {sbUser && (
                <div style={{ fontSize:".75rem", color:"#059669", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"7px 12px", marginBottom:14 }}>
                  ✓ Coordonnées pré-remplies depuis votre compte
                </div>
              )}

              {/* Pack / Lieu - coaching privé uniquement */}
              {isCoachingPrive && (
                <div style={{ background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:14, padding:16, marginBottom:16 }}>
                  <div style={{ fontSize:".78rem", fontWeight:800, color:BET_NAVY, marginBottom:12 }}>💰 Choisissez votre pack de coaching</div>

                  <div className="cel-pack-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                    {Object.entries(grillePriveeActive).map(([key, pack]) => {
                      const prix = pack[lieuChoix] || pack.cabinet;
                      const selected = packCoaching === key;
                      return (
                        <button key={key} type="button" onClick={() => setPackCoaching(key)}
                          style={{ background: selected ? `linear-gradient(135deg,${BET_BLUE},${BET_NAVY})` : "#fff", border: selected ? `2px solid ${BET_BLUE}` : "1.5px solid #bfdbfe", borderRadius:12, padding:"12px 10px", cursor:"pointer", textAlign:"left", transition:"all .15s", color: selected ? "#fff" : BET_NAVY }}>
                          <div style={{ fontWeight:800, fontSize:".82rem", marginBottom:3 }}>{pack.label || key}</div>
                          <div style={{ fontSize:".7rem", opacity:.85, marginBottom:6, lineHeight:1.3 }}>{pack.frequence}</div>
                          <div style={{ fontWeight:900, fontSize:"1rem" }}>
                            {prix ? Number(prix).toLocaleString("fr-FR") + " FCFA" : "Sur devis"}
                          </div>
                          <div style={{ fontSize:".65rem", opacity:.75, marginTop:1 }}>/mois</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Modale dédiée au catalogue en ligne - lieu toujours "en ligne", plus de choix. */}
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, fontSize:".8rem", fontWeight:700, color:BET_NAVY, background:"#fff", border:"1.5px solid #bfdbfe", borderRadius:10, padding:"9px 12px" }}>
                    💻 Lieu du coaching : En ligne
                  </div>

                  {(() => {
                    const pack = grillePriveeActive[packCoaching];
                    const prix = pack?.[lieuChoix] || pack?.cabinet;
                    return (
                      <div style={{ background:`linear-gradient(135deg,${BET_BLUE},${BET_NAVY})`, borderRadius:10, padding:"12px 14px", color:"#fff", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div>
                          <div style={{ fontWeight:800, fontSize:".82rem" }}>Pack {pack?.label || packCoaching} · {lieuChoix === "en_ligne" ? "En ligne" : lieuChoix === "cabinet" ? "Au cabinet" : "À domicile"}</div>
                          <div style={{ fontSize:".7rem", opacity:.8, marginTop:2 }}>{pack?.frequence}</div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontWeight:900, fontSize:"1.05rem" }}>{prix ? Number(prix).toLocaleString("fr-FR") + " FCFA" : "Sur devis"}</div>
                          <div style={{ fontSize:".65rem", opacity:.75 }}>/mois</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Formulaire */}
              <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:18 }}>
                <div>
                  <label style={labelStyle}>Nom complet *</label>
                  <input value={form.nom} readOnly={!!(sbUser && form.nom)}
                    onChange={e => { setForm(f => ({ ...f, nom:e.target.value })); setFormErrors(fe => ({ ...fe, nom:"" })); }}
                    placeholder="Ex : Kouamé Yao"
                    style={{ ...(sbUser && form.nom ? lockedInputStyle : inputStyle), borderColor: formErrors.nom ? "#ff2945" : "#e2e8f0" }} />
                  {formErrors.nom && <p style={errStyle}>{formErrors.nom}</p>}
                </div>
                <div>
                  <label style={labelStyle}>Numéro WhatsApp *</label>
                  <input value={form.telephone} readOnly={!!(sbUser && form.telephone)}
                    onChange={e => { setForm(f => ({ ...f, telephone:e.target.value })); setFormErrors(fe => ({ ...fe, telephone:"" })); }}
                    placeholder="+225 07 XX XX XX"
                    style={{ ...(sbUser && form.telephone ? lockedInputStyle : inputStyle), borderColor: formErrors.telephone ? "#ff2945" : "#e2e8f0" }} />
                  {formErrors.telephone && <p style={errStyle}>{formErrors.telephone}</p>}
                </div>
                <div>
                  <label style={labelStyle}>E-mail <span style={{ color:"#94a3b8", fontWeight:400 }}>(optionnel)</span></label>
                  <input value={form.email} readOnly={!!(sbUser && form.email)}
                    onChange={e => setForm(f => ({ ...f, email:e.target.value }))}
                    placeholder="votre@email.com" type="email"
                    style={sbUser && form.email ? lockedInputStyle : inputStyle} />
                </div>

                {/* Adresse - coaching privé uniquement, requise si lieu = "à domicile" */}
                {isCoachingPrive && lieuChoix === "domicile" && (
                  <div>
                    <label style={labelStyle}>Quartier / Zone / Adresse *</label>
                    <input value={zoneForm}
                      onChange={e => { setZoneForm(e.target.value); setFormErrors(fe => ({ ...fe, zone:"" })); }}
                      placeholder="Ex : Cocody Riviera, Angré 7ème tranche…"
                      style={{ ...inputStyle, borderColor: formErrors.zone ? "#ff2945" : "#e2e8f0" }} />
                    {formErrors.zone && <p style={errStyle}>{formErrors.zone}</p>}
                  </div>
                )}

                {/* Disponibilités - coaching privé uniquement, obligatoire (même logique que ParcoursModal.jsx) */}
                {isCoachingPrive && (
                  <div>
                    <label style={labelStyle}>Votre disponibilité *</label>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:6, marginBottom:10, borderRadius:10, border: formErrors.dispos ? "1.5px solid #ff2945" : "none", padding: formErrors.dispos ? 8 : 0 }}>
                      {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(jour => {
                        const active = dispos.some(d => d.jour === jour);
                        return (
                          <button key={jour} type="button"
                            onClick={() => {
                              setFormErrors(fe => ({ ...fe, dispos:"" }));
                              if (active) {
                                setDispos(prev => prev.filter(d => d.jour !== jour));
                              } else {
                                setDispos(prev => {
                                  const ORDER = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
                                  const next = [...prev, { jour, debut:"08:00" }];
                                  return next.sort((a,b) => ORDER.indexOf(a.jour) - ORDER.indexOf(b.jour));
                                });
                              }
                            }}
                            style={{ padding:"7px 16px", borderRadius:20, border:`2px solid ${active?BET_NAVY:"#e2e8f0"}`,
                              background:active?"#eff6ff":"#fff", color:active?BET_NAVY:"#64748b",
                              fontWeight:700, fontSize:".8rem", cursor:"pointer", transition:"all .15s" }}>
                            {jour}
                          </button>
                        );
                      })}
                    </div>
                    {formErrors.dispos && <p style={errStyle}>{formErrors.dispos}</p>}
                    {dispos.length > 0 ? (
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        {dispos.map(row => (
                          <div key={row.jour} style={{ display:"flex", alignItems:"center", gap:10, background:"#f0f6ff", borderRadius:10, padding:"9px 12px", border:"1.5px solid #bfdbfe" }}>
                            <span style={{ fontWeight:800, fontSize:".82rem", color:BET_NAVY, minWidth:34 }}>{row.jour}</span>
                            <span style={{ color:"#94a3b8", fontSize:".75rem", flexShrink:0 }}>à partir de</span>
                            <input type="time" value={row.debut}
                              onChange={e => setDispos(prev => prev.map(d => d.jour===row.jour ? { ...d, debut:e.target.value } : d))}
                              style={{ padding:"5px 8px", borderRadius:8, border:"1px solid #bfdbfe", fontSize:".82rem", outline:"none", cursor:"pointer", background:"#fff", color:"#0f172a" }} />
                            <button type="button"
                              onClick={() => setDispos(prev => prev.filter(d => d.jour !== row.jour))}
                              style={{ marginLeft:"auto", background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:".9rem", padding:"2px 6px", borderRadius:6, lineHeight:1, flexShrink:0 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize:".72rem", color:"#94a3b8", margin:0 }}>Cliquez sur un jour pour ajouter un créneau horaire</p>
                    )}
                  </div>
                )}
              </div>

              {!isCoachingPrive && (
                <>
                  {/* Code promo */}
                  <div style={{ marginBottom:16 }}>
                    <p style={{ fontSize:".78rem", fontWeight:700, color:"#374151", marginBottom:8 }}>🏷️ Code promo <span style={{ fontWeight:400, color:"#94a3b8" }}>(optionnel)</span></p>
                    {codePromoApplied ? (
                      <div style={{ display:"flex", alignItems:"center", gap:10, background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:10, padding:"10px 14px" }}>
                        <span style={{ fontSize:"1.1rem" }}>✅</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:800, fontSize:".82rem", color:"#166534" }}>{codePromoApplied.code} appliqué !</div>
                          <div style={{ fontSize:".72rem", color:"#166534" }}>
                            Réduction : {codePromoApplied.type_reduction === "pourcentage" ? `-${codePromoApplied.valeur}%` : `-${Number(codePromoApplied.valeur).toLocaleString("fr-FR")} FCFA`}
                            {codePromoApplied.description && <span> · {codePromoApplied.description}</span>}
                          </div>
                        </div>
                        <button onClick={() => { setCodePromoApplied(null); setCodePromo(""); setCodePromoError(""); }}
                          style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:16, padding:0 }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display:"flex", gap:8 }}>
                        <input value={codePromo} onChange={e => { setCodePromo(e.target.value.toUpperCase()); setCodePromoError(""); }}
                          onKeyDown={e => e.key === "Enter" && validerCodePromo()}
                          placeholder="Ex : BET2025"
                          style={{ flex:1, padding:"10px 13px", border:`1.5px solid ${codePromoError?"#ff2945":"#e2e8f0"}`, borderRadius:9, fontSize:".82rem", fontFamily:"monospace", letterSpacing:1, outline:"none" }} />
                        <button onClick={() => validerCodePromo()} disabled={!codePromo.trim() || codePromoLoading}
                          style={{ padding:"0 16px", background:BET_BLUE, color:"#fff", border:"none", borderRadius:9, cursor:"pointer", fontWeight:700, fontSize:".78rem", opacity:(!codePromo.trim()||codePromoLoading)?.5:1, whiteSpace:"nowrap" }}>
                          {codePromoLoading ? "⏳" : "Appliquer"}
                        </button>
                      </div>
                    )}
                    {codePromoError && <p style={{ margin:"5px 0 0", fontSize:".72rem", color:"#ff2945" }}>{codePromoError}</p>}
                  </div>

                  {/* Toujours affiché, code promo ou non, et fondé sur le tarif de la
                      formule : l'écran restait muet sur le montant sans réduction. */}
                  {montantReference && (() => {
                    const montantFinal = calcMontantReduit(montantReference, codePromoApplied);
                    return (
                      <div style={{ background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"12px 14px", marginBottom:14 }}>
                        {formuleGroupeChoisie && (
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, fontSize:".78rem", marginBottom:8, paddingBottom:8, borderBottom:"1px solid #e2e8f0" }}>
                            <div>
                              <div style={{ fontWeight:800, color:BET_DARK }}>Formule {formuleGroupeChoisie.label}</div>
                              {formuleGroupeChoisie.frequence && <div style={{ fontSize:".72rem", color:"#64748b", marginTop:2 }}>{formuleGroupeChoisie.frequence}</div>}
                            </div>
                            <span style={{ fontWeight:700, color:"#059669", whiteSpace:"nowrap" }}>{formuleGroupeChoisie.tarif.toLocaleString("fr-FR")} F / mois</span>
                          </div>
                        )}
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:".78rem", color:"#64748b", marginBottom:codePromoApplied?4:8 }}>
                          <span>Montant initial</span>
                          <span>{montantReference.toLocaleString("fr-FR")} FCFA</span>
                        </div>
                        {codePromoApplied && (
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:".78rem", color:"#16a34a", fontWeight:700, marginBottom:8 }}>
                            <span>Réduction ({codePromoApplied.code})</span>
                            <span>-{(montantReference-montantFinal).toLocaleString("fr-FR")} FCFA</span>
                          </div>
                        )}
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:".92rem", fontWeight:800, color:"#0c33ac", paddingTop:8, borderTop:"1px solid #e2e8f0" }}>
                          <span>Total à payer</span>
                          <span>{montantFinal.toLocaleString("fr-FR")} FCFA</span>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

              <button onClick={submitInscription}
                disabled={submitting}
                style={{ ...primaryBtn, opacity:submitting ? .5 : 1, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                {submitting
                  ? <><div style={{ width:14, height:14, border:"2px solid rgba(255,255,255,.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"celSpin .7s linear infinite" }} />Envoi…</>
                  : isCoachingPrive ? "📩 Envoyer ma demande →" : "Confirmer mon inscription →"}
              </button>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              ÉTAPE 3 - Succès
          ═══════════════════════════════════════════════ */}
          {step === 3 && (
            <div style={{ animation:"celFU .3s ease", textAlign:"center", padding:"12px 0 8px" }}>
              <div style={{ fontSize:"3.5rem", marginBottom:16 }}>🎉</div>
              <h3 style={{ fontWeight:900, fontSize:"1.1rem", color:BET_DARK, fontFamily:F, marginBottom:8 }}>
                Inscription envoyée !
              </h3>
              <p style={{ color:"#475569", fontSize:".86rem", lineHeight:1.7, marginBottom:24, maxWidth:380, margin:"0 auto 24px" }}>
                {isCoachingPrive
                  ? <>Votre demande a bien été reçue. <strong>Un conseiller pédagogique BET</strong> vous contactera très prochainement sur WhatsApp au <strong>{form.telephone}</strong>.</>
                  : <>Votre demande a bien été reçue. <strong>{assistanteChoisie?.prenom}</strong> vous contactera très prochainement sur WhatsApp au <strong>{form.telephone}</strong>.</>
                }
              </p>

              {/* Mini récap */}
              {isCoachingPrive ? (
                <div style={{ display:"flex", alignItems:"center", gap:12, background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:14, padding:"14px 16px", marginBottom:24, textAlign:"left" }}>
                  <div style={{ width:44, height:44, borderRadius:"50%", background:`linear-gradient(135deg,${BET_BLUE},${BET_NAVY})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.3rem", flexShrink:0 }}>🧑‍💼</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:800, fontSize:".86rem", color:BET_DARK }}>Coaching privé - {packCoaching === "intensive" ? "Formule intensive" : "Formule classique"}</div>
                    <div style={{ fontSize:".72rem", color:"#64748b" }}>Un conseiller pédagogique vous sera affecté</div>
                  </div>
                  <span style={{ background:"#f0fdf4", color:"#16a34a", border:"1.5px solid #bbf7d0", borderRadius:999, padding:"4px 12px", fontSize:".72rem", fontWeight:700, flexShrink:0 }}>✓ Confirmé</span>
                </div>
              ) : (
                <div style={{ display:"flex", alignItems:"center", gap:12, background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:14, padding:"14px 16px", marginBottom:24, textAlign:"left" }}>
                  <Avatar a={assistanteChoisie || {}} size={44} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:800, fontSize:".86rem", color:BET_DARK }}>{assistanteChoisie?.prenom} {assistanteChoisie?.nom}</div>
                    <div style={{ fontSize:".72rem", color:"#64748b" }}>
                      {offreChoisie ? offreChoisie.label : "Cours en ligne"} · {assistanteChoisie?.telephone || ""}
                    </div>
                  </div>
                  <span style={{ background:"#f0fdf4", color:"#16a34a", border:"1.5px solid #bbf7d0", borderRadius:999, padding:"4px 12px", fontSize:".72rem", fontWeight:700, flexShrink:0 }}>✓ Confirmé</span>
                </div>
              )}

              <button onClick={handleClose}
                style={{ ...primaryBtn, maxWidth:280, margin:"0 auto" }}>
                Fermer
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
