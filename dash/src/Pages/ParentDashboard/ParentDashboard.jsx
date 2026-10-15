// src/Pages/ParentDashboard/ParentDashboard.jsx
// Tableau de bord Parent - connecté aux données réelles (plus de mock).
// Intégration : <Route path="/dashboard/parent" element={<PrivateParentRoute><ParentDashboard /></PrivateParentRoute>} />

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { clearAllSessionStorage } from "../../utils/session";
import { supabase } from "../../config/supabase";

import MonProfilModal, { BoutonMonProfil, nomAffiche } from "../../Components/MonProfilModal";
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("user_token") || ""}` });

/* ── Fonts & Keyframes (injection unique) ───────────────────────── */
if (!document.querySelector("#parent-fonts")) {
  const link = document.createElement("link");
  link.id = "parent-fonts";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700;800&display=swap";
  document.head.appendChild(link);
}
if (!document.querySelector("#parent-kf")) {
  const style = document.createElement("style");
  style.id = "parent-kf";
  style.textContent = `
    @keyframes fadeUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
    @keyframes spin { to { transform: rotate(360deg) } }
  `;
  document.head.appendChild(style);
}

/* ── Composants utilitaires ─────────────────────────────────────── */
const ProgressBar = ({ value, max = 100, color = "#dc2626", height = 8 }) => {
  const percent = Math.min(100, Math.max(0, max > 0 ? (value / max) * 100 : 0));
  return (
    <div style={{ height, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ width: `${percent}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.6s ease" }} />
    </div>
  );
};

const StatCard = ({ title, value, unit, icon, color }) => (
  <div style={styles.statCard}>
    <div style={{ ...styles.statIcon, background: color + "20", color }}>{icon}</div>
    <div>
      <div style={styles.statValue}>{value}{unit && <span style={{ fontSize: "0.9rem" }}>{unit}</span>}</div>
      <div style={styles.statLabel}>{title}</div>
    </div>
  </div>
);

function fmtDate(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

const TRANCHES_AGE = [
  { val:"4-5",   label:"4 – 5 ans" },
  { val:"6-7",   label:"6 – 7 ans" },
  { val:"8-10",  label:"8 – 10 ans" },
  { val:"11-13", label:"11 – 13 ans" },
  { val:"14-17", label:"14 – 17 ans" },
];

// Contacts administration (identique à EspaceApprenant)
const CONTACTS_ADMIN = [
  { id:1, nom:"Assistante en ligne", role:"Assistance technique et pédagogique", tel:"+225 01 23 45 67", email:"assistante@bet-formation.com", disponible:"Lun-Ven 9h-18h" },
  { id:2, nom:"Service clientèle", role:"Facturation, administratif", tel:"+225 01 23 45 68", email:"client@bet-formation.com", disponible:"Lun-Ven 8h-19h" },
  { id:3, nom:"Superviseur pédagogique", role:"Suivi de la qualité", tel:"+225 01 23 45 69", email:"superviseur@bet-formation.com", disponible:"Sur rendez-vous" },
  { id:4, nom:"Manager", role:"Responsable de centre", tel:"+225 01 23 45 70", email:"manager@bet-formation.com", disponible:"Lun-Jeu 9h-17h" },
];

const TABS = [
  { key: "vue",        label: "Vue d'ensemble", icon: "🏠" },
  { key: "seances",    label: "Séances",        icon: "📅" },
  { key: "presences",  label: "Présences",      icon: "📋" },
  { key: "devoirs",    label: "Devoirs",        icon: "📝" },
  { key: "ressources", label: "Ressources",     icon: "📂" },
  { key: "resultats",  label: "Résultats",      icon: "📈" },
  { key: "evaluation", label: "Évaluer le coach", icon: "⭐" },
  { key: "paiement",   label: "Paiement",       icon: "💳" },
  { key: "notifications", label: "Notifications", icon: "🔔" },
  { key: "contact",    label: "Contactez BET",  icon: "📞" },
];

// Le statut réel stocké en base varie selon l'origine de l'enregistrement (accents,
// orthographes différentes) - couvrir toutes les variantes pour ne jamais afficher
// "en attente" à tort sur un paiement réellement réglé.
const STATUTS_PAYES = ["payé", "paye", "validé", "valide", "confirmé", "confirme", "confirmée", "reçu", "recu", "encaissé", "encaisse"];
const estStatutPaye = (s) => STATUTS_PAYES.includes(s);

/* ════════════════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
════════════════════════════════════════════════════════════════ */
export default function ParentDashboard() {
  const navigate = useNavigate();

  const [enfants, setEnfants]       = useState([]);
  const [enfantActifId, setEnfantActifId] = useState(null);
  const [surnomModal,   setSurnomModal]   = useState(null); // { enfant, valeur }
  const [surnomSaving,  setSurnomSaving]  = useState(false);
  const [loading, setLoading]       = useState(true);
  const [erreur, setErreur]         = useState("");
  const [activeTab, setActiveTab]   = useState("vue");

  const [presences, setPresences] = useState([]);
  const [resultats, setResultats] = useState([]);
  const [devoirs, setDevoirs]     = useState([]);
  const [seances, setSeances]     = useState([]);
  const [ressources, setRessources]           = useState([]);
  const [ressourcesLoading, setRessourcesLoading] = useState(false);
  const [evaluations, setEvaluations] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [planPaiement, setPlanPaiement] = useState(null);
  const [chargementEnfant, setChargementEnfant] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [notifsLoading, setNotifsLoading]  = useState(false);

  const [evalForm, setEvalForm]     = useState({ q1:0, q2:0, q3:0, q4:0, q5:0, commentaire:"" });
  const [evalSaving, setEvalSaving] = useState(false);

  // États pour le formulaire de requête (Contactez BET)
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestDestinataire, setRequestDestinataire] = useState(CONTACTS_ADMIN[0].nom);
  const [requestObjet, setRequestObjet] = useState("");
  const [requestMessage, setRequestMessage] = useState("");

  // États pour l'inscription d'un nouvel enfant (parent déjà rattaché à un compte existant)
  const parentSession = (() => { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } })();
  const parentMeta = parentSession?.user_metadata || parentSession || {};
  // Le parent pouvait nommer son enfant, mais pas lui-meme : son propre surnom n'avait
  // aucun ecran, alors que la colonne existe sur sa ligne `utilisateurs` comme pour tous.
  const [monProfilOuvert, setMonProfilOuvert] = useState(false);
  const [surnomParent, setSurnomParent] = useState(parentMeta.surnom || "");
  const nomParent = nomAffiche({ prenom: parentMeta.prenom, nom: parentMeta.nom, surnom: surnomParent, email: parentSession?.email });
  const [showAjoutEnfant, setShowAjoutEnfant] = useState(false);
  const [centres, setCentres] = useState([]);
  const [enfantForm, setEnfantForm] = useState({
    prenom: "", nom: "", tranche_age: TRANCHES_AGE[0].val, niveau_classe_enfant: "",
    type_cours: "en_ligne", centre_id: "", assistante_id: "", adresse_domicile: "",
    telephone_parent: parentMeta.telephone || "",
  });
  const [enfantSubmitting, setEnfantSubmitting] = useState(false);
  const [assistantesEnfant, setAssistantesEnfant] = useState([]);
  const [assistantesEnfantLoading, setAssistantesEnfantLoading] = useState(false);

  useEffect(() => {
    if (!showAjoutEnfant || centres.length) return;
    fetch(`${API_URL}/api/parcours/centres`).then(r => r.json()).then(d => setCentres(d.centres || [])).catch(() => {});
  }, [showAjoutEnfant, centres.length]);

  // Assistantes disponibles selon le mode choisi (en ligne / centre présentiel / domicile) -
  // même logique que le parcours enfant du site public (EnfantParcoursModal.jsx) : l'assistante
  // choisie ici est celle qui recevra le dossier, avec ses vraies infos (photo, téléphone).
  useEffect(() => {
    if (!showAjoutEnfant) return;
    setEnfantForm(f => (f.assistante_id ? { ...f, assistante_id:"" } : f));
    if (enfantForm.type_cours === "en_ligne") {
      setAssistantesEnfantLoading(true);
      fetch(`${API_URL}/api/parcours/assistantes-ligne?profil=b2c`)
        .then(r => r.json()).then(d => setAssistantesEnfant(d.assistantes || []))
        .catch(() => setAssistantesEnfant([]))
        .finally(() => setAssistantesEnfantLoading(false));
    } else if (enfantForm.type_cours === "presentiel" && enfantForm.centre_id) {
      setAssistantesEnfantLoading(true);
      fetch(`${API_URL}/api/parcours/assistantes-presentiel/${enfantForm.centre_id}?tous=true`)
        .then(r => r.json()).then(d => setAssistantesEnfant(d.assistantes || []))
        .catch(() => setAssistantesEnfant([]))
        .finally(() => setAssistantesEnfantLoading(false));
    } else if (enfantForm.type_cours === "domicile") {
      setAssistantesEnfantLoading(true);
      fetch(`${API_URL}/api/parcours/assistantes-domicile`)
        .then(r => r.json()).then(d => setAssistantesEnfant(d.assistantes || []))
        .catch(() => setAssistantesEnfant([]))
        .finally(() => setAssistantesEnfantLoading(false));
    } else {
      setAssistantesEnfant([]);
    }
  }, [showAjoutEnfant, enfantForm.type_cours, enfantForm.centre_id]);

  const soumettreNouvelEnfant = async () => {
    if (!enfantForm.prenom.trim() || !enfantForm.nom.trim()) { toast.error("Merci de renseigner le prénom et le nom de l'enfant."); return; }
    if (!enfantForm.telephone_parent.trim()) { toast.error("Merci de renseigner un numéro de téléphone."); return; }
    if (enfantForm.type_cours === "presentiel" && !enfantForm.centre_id) { toast.error("Merci de choisir un centre."); return; }
    if (enfantForm.type_cours === "domicile" && !enfantForm.adresse_domicile.trim()) { toast.error("Merci d'indiquer l'adresse du domicile."); return; }
    if (!enfantForm.assistante_id) { toast.error("Merci de choisir une assistante."); return; }
    setEnfantSubmitting(true);
    try {
      const r = await fetch(`${API_URL}/api/parcours/assignation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistante_id:       enfantForm.assistante_id,
          prospect_nom:        `${enfantForm.prenom.trim()} ${enfantForm.nom.trim()}`.trim(),
          prospect_email:      parentSession.email || undefined,
          prospect_telephone:  enfantForm.telephone_parent.trim(),
          type_cours:          enfantForm.type_cours,
          type_coaching:       enfantForm.type_cours === "domicile" ? "prive" : "groupe",
          centre_id:           enfantForm.type_cours === "presentiel" ? (enfantForm.centre_id || undefined) : undefined,
          lieu_coaching:       enfantForm.type_cours === "domicile" ? "domicile" : undefined,
          adresse_coaching:    enfantForm.type_cours === "domicile" ? enfantForm.adresse_domicile.trim() : undefined,
          source:              "dashboard_parent_dash",
          profil_type:         "enfant",
          nom_parent:          [parentMeta.prenom, parentMeta.nom].filter(Boolean).join(" ") || undefined,
          telephone_parent:    enfantForm.telephone_parent.trim(),
          email_parent:        parentSession.email || undefined,
          prenom_enfant:       enfantForm.prenom.trim(),
          nom_enfant:          enfantForm.nom.trim(),
          age_enfant:          enfantForm.tranche_age,
          niveau_classe_enfant: enfantForm.niveau_classe_enfant || undefined,
          statut:              "en_attente",
        }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Erreur serveur"); }
      toast.success("Demande transmise ! Notre équipe vous recontactera pour finaliser l'inscription.");
      setShowAjoutEnfant(false);
      setEnfantForm({ prenom:"", nom:"", tranche_age:TRANCHES_AGE[0].val, niveau_classe_enfant:"", type_cours:"en_ligne", centre_id:"", assistante_id:"", adresse_domicile:"", telephone_parent:parentMeta.telephone||"" });
    } catch (e) {
      toast.error(e.message || "Erreur lors de l'envoi");
    } finally {
      setEnfantSubmitting(false);
    }
  };

  const enfantActif = enfants.find(e => e.id === enfantActifId) || null;

  const enregistrerSurnomEnfant = async () => {
    if (!surnomModal?.enfant?.id) return;
    setSurnomSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/apprenants/enfants/${surnomModal.enfant.id}/surnom`, {
        method: "PATCH",
        headers: { Authorization:`Bearer ${localStorage.getItem("user_token")}`, "Content-Type":"application/json" },
        body: JSON.stringify({ surnom: (surnomModal.valeur || "").trim() }),
      });
      const d = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(d.error || "Enregistrement impossible");
      setEnfants(prev => prev.map(e => e.id === surnomModal.enfant.id ? { ...e, surnom: d.surnom } : e));
      setSurnomModal(null);
    } catch (e) {
      alert(e.message || "Erreur lors de l'enregistrement");
    } finally {
      setSurnomSaving(false);
    }
  };

  // ── Chargement des enfants du parent connecté ──
  useEffect(() => {
    (async () => {
      const token = localStorage.getItem("user_token");
      if (!token) { navigate("/login-particulier", { replace: true, state: { profil: "parent" } }); return; }
      try {
        const r = await fetch(`${API_URL}/api/apprenants/parent/mes-enfants`, { headers: authHeaders() });
        if (r.status === 401) { navigate("/login-particulier", { replace: true, state: { profil: "parent" } }); return; }
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Erreur de chargement");
        setEnfants(d.enfants || []);
        if (d.enfants?.length) setEnfantActifId(d.enfants[0].id);
      } catch (e) {
        setErreur(e.message || "Impossible de charger vos enfants");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  // ── Chargement des notifications du parent (tous enfants confondus) ──
  useEffect(() => {
    (async () => {
      setNotifsLoading(true);
      try {
        const r = await fetch(`${API_URL}/api/apprenants/mes-notifs?limit=50`, { headers: authHeaders() });
        const d = await r.json();
        if (r.ok) setNotifications(d.notifications || d.data || []);
      } catch (e) { /* silencieux */ }
      finally { setNotifsLoading(false); }
    })();
  }, []);

  // Identifiant Supabase du parent, décodé depuis le JWT - sert de filtre au canal Realtime
  // ci-dessous (même pattern que EspaceApprenant.jsx). Le parent n'a jamais de toast en temps
  // réel jusqu'ici : il ne découvrait une notification qu'en rouvrant l'onglet Notifications.
  const monUserId = useMemo(() => {
    try {
      const token = localStorage.getItem("user_token");
      if (!token) return null;
      return JSON.parse(atob(token.split(".")[1])).sub || null;
    } catch { return null; }
  }, []);

  useEffect(() => {
    if (!monUserId) return;
    const channel = supabase
      .channel(`notifs-parent-${monUserId}-${Date.now()}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications",
        filter: `user_id=eq.${monUserId}`,
      }, (payload) => {
        const n = { ...payload.new, createdAt: payload.new.created_at };
        setNotifications(prev => [n, ...prev]);
        toast(n.message || n.titre || "Nouvelle notification", {
          icon: n.type === "badge_obtenu" ? "🏅" : "🔔",
          duration: 5000,
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [monUserId]);

  const notifsNonLues = notifications.filter(n => !n.lu).length;
  const [banderoleFermee, setBanderoleFermee] = useState(false);

  const marquerNotifLue = async (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, lu: true } : n));
    try { await fetch(`${API_URL}/api/apprenants/notifs/${id}/lu`, { method: "PATCH", headers: authHeaders() }); } catch (e) { /* silencieux */ }
  };

  const marquerToutLu = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, lu: true })));
    try { await fetch(`${API_URL}/api/apprenants/notifs/tout-lire`, { method: "PATCH", headers: authHeaders() }); } catch (e) { /* silencieux */ }
  };

  // ── Chargement des données de l'enfant actif ──
  const chargerDonneesEnfant = useCallback(async (id) => {
    if (!id) return;
    setChargementEnfant(true);
    try {
      const [rPres, rRes, rDev, rSea, rEval, rPai] = await Promise.all([
        fetch(`${API_URL}/api/apprenants/parent/enfant/${id}/presences`,  { headers: authHeaders() }),
        fetch(`${API_URL}/api/apprenants/parent/enfant/${id}/resultats`,  { headers: authHeaders() }),
        fetch(`${API_URL}/api/apprenants/parent/enfant/${id}/devoirs`,    { headers: authHeaders() }),
        fetch(`${API_URL}/api/apprenants/parent/enfant/${id}/seances`,    { headers: authHeaders() }),
        fetch(`${API_URL}/api/apprenants/parent/enfant/${id}/avis-coach`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/apprenants/parent/enfant/${id}/paiements`,  { headers: authHeaders() }),
      ]);
      const [dPres, dRes, dDev, dSea, dEval, dPai] = await Promise.all([rPres.json(), rRes.json(), rDev.json(), rSea.json(), rEval.json(), rPai.json()]);
      setPresences(dPres.presences || []);
      setResultats(dRes.resultats || []);
      setDevoirs(dDev.devoirs || []);
      setSeances(dSea.seances || []);
      setEvaluations(dEval.evaluations || []);
      setPaiements(dPai.paiements || []);
      setPlanPaiement(dPai.plan_paiement || null);
    } catch (e) {
      toast.error("Erreur lors du chargement des données de l'enfant");
    } finally {
      setChargementEnfant(false);
    }
  }, []);

  useEffect(() => {
    if (enfantActifId) chargerDonneesEnfant(enfantActifId);
  }, [enfantActifId, chargerDonneesEnfant]);

  // ── Ressources partagées par le coach - même endpoint que l'espace de l'enfant
  // (GET /api/mon-espace/fichiers), appelé ici avec l'email technique de l'enfant
  // (email_apprenant, déjà porté par chaque entrée de `enfants`).
  useEffect(() => {
    const emailApprenant = enfants.find(e => e.id === enfantActifId)?.email_apprenant;
    if (!emailApprenant) { setRessources([]); return; }
    setRessourcesLoading(true);
    fetch(`${API_URL}/api/mon-espace/fichiers?email=${encodeURIComponent(emailApprenant)}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { fichiers: [] })
      .then(d => setRessources(d.fichiers || []))
      .catch(() => setRessources([]))
      .finally(() => setRessourcesLoading(false));
  }, [enfantActifId, enfants]);

  useEffect(() => {
    setEvalForm({ q1:0, q2:0, q3:0, q4:0, q5:0, commentaire:"" });
  }, [enfantActifId]);

  // ── Statistiques dérivées ──
  const totalPresences  = presences.length;
  const presentCount    = presences.filter(p => p.statut === "present" || p.statut === "présent").length;
  const tauxAssiduite   = totalPresences > 0 ? Math.round((presentCount / totalPresences) * 100) : 0;
  const derniersResultats = [...resultats].slice(0, 5);
  const progressionMoyenne = resultats.length
    ? Math.round(resultats.reduce((s, r) => s + (r.note_max ? (r.note / r.note_max) * 100 : 0), 0) / resultats.length)
    : 0;
  const prochaineSeance = seances.find(s => s.statut === "planifiee") || null;

  const moisCourant = new Date().toISOString().slice(0, 7);
  const dejaEvalueCeMois = evaluations.some(e => e.mois === moisCourant);

  const soumettreEval = async () => {
    if (!(evalForm.q1 && evalForm.q2 && evalForm.q3 && evalForm.q4 && evalForm.q5)) {
      toast.error("Merci de noter les 5 critères avant d'envoyer.");
      return;
    }
    setEvalSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/analytics/avis-parent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inscription_id: enfantActif?.id ? String(enfantActif.id) : null,
          parent_email:   JSON.parse(localStorage.getItem("user") || "{}")?.email || null,
          coach_nom:      enfantActif?.coach_nom || null,
          classe_id:      enfantActif?.groupe_id ? String(enfantActif.groupe_id) : null,
          mois: moisCourant,
          q1: evalForm.q1, q2: evalForm.q2, q3: evalForm.q3, q4: evalForm.q4, q5: evalForm.q5,
          commentaire: evalForm.commentaire || null,
        }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Erreur"); }
      toast.success("Merci pour votre retour !");
      setEvaluations(prev => [{ ...evalForm, mois: moisCourant, created_at: new Date().toISOString() }, ...prev]);
      setEvalForm({ q1:0, q2:0, q3:0, q4:0, q5:0, commentaire:"" });
    } catch (e) {
      toast.error(e.message || "Erreur lors de l'envoi");
    } finally {
      setEvalSaving(false);
    }
  };

  const handleSubmitRequest = () => {
    if (!requestObjet.trim() || !requestMessage.trim()) {
      toast.error("Veuillez remplir l'objet et le message.");
      return;
    }
    toast.success(`Votre requête à ${requestDestinataire} a été envoyée. Nous vous répondrons dans les 48h.`);
    setShowRequestModal(false);
    setRequestObjet("");
    setRequestMessage("");
    setRequestDestinataire(CONTACTS_ADMIN[0].nom);
  };

  if (loading) {
    return (
      <div style={styles.loaderContainer}>
        <div style={styles.spinner} />
        <p>Chargement de votre tableau de bord...</p>
      </div>
    );
  }

  return (
    <>
      {/* `espace="utilisateur"` : le parent porte un `user_token`, la route d'administration
          lui est fermee. Son profil vient de la session, pas d'un cache `admin_profil`. */}
      <MonProfilModal
        ouvert={monProfilOuvert}
        onClose={() => setMonProfilOuvert(false)}
        onEnregistre={(v) => setSurnomParent(v || "")}
        espace="utilisateur"
        profil={{ id: parentSession?.id, prenom: parentMeta.prenom, nom: parentMeta.nom, email: parentSession?.email, surnom: surnomParent }}
        accent="#16a34a"
      />
      <div style={styles.page}>

        <div style={styles.header}>
          <div style={styles.headerInner}>
            <div>
              <h1 style={{ ...styles.title, display:"flex", alignItems:"center", gap:8 }}>
                👨‍👩‍👧 {nomParent && nomParent !== "-" ? nomParent : "Tableau de bord Parent"}
                <BoutonMonProfil onClick={() => setMonProfilOuvert(true)} />
              </h1>
              <p style={styles.subtitle}>Suivez la progression, l'assiduité et les résultats de vos enfants</p>
            </div>
            <div style={styles.headerRight}>
              <button
                style={{ ...styles.profileBtn, background:"linear-gradient(135deg,#16a34a,#0891b2)" }}
                onClick={() => setShowAjoutEnfant(true)}>
                ➕ Inscrire un nouvel enfant
              </button>
              <button
                style={styles.profileBtn}
                onClick={() => { clearAllSessionStorage(); navigate("/login-particulier", { replace: true, state: { profil: "parent" } }); }}>
                🚪 Déconnexion
              </button>
            </div>
          </div>
        </div>

        <div style={styles.container}>
          {erreur && (
            <div style={{ background:"#fef2f2", border:"1px solid #fecaca", color:"#991b1b", borderRadius:10, padding:"12px 16px", marginBottom:20, fontSize:13 }}>
              ⚠️ {erreur}
            </div>
          )}

          {!enfants.length && !erreur && (
            <div style={styles.card}>
              <p style={{ color:"#64748b", margin:0 }}>Aucun enfant n'est encore rattaché à votre compte. Contactez BET si vous pensez qu'il s'agit d'une erreur.</p>
            </div>
          )}

          {enfants.length > 0 && (
            <>
              {enfants.length > 1 && (
                <div style={styles.childTabs}>
                  {enfants.map(e => (
                    <button
                      key={e.id}
                      style={{ ...styles.childTab, ...(enfantActifId === e.id ? styles.childTabActive : {}) }}
                      onClick={() => setEnfantActifId(e.id)}>
                      {e.avatar_url
                        ? <img src={e.avatar_url} alt="" style={{ width:22, height:22, borderRadius:"50%", objectFit:"cover", marginRight:8 }} />
                        : <span style={{ fontSize:"1.2rem", marginRight:8 }}>🧒</span>}
                      {e.prenom} {e.nom}
                    </button>
                  ))}
                </div>
              )}

              <div style={styles.tabsBar}>
                {TABS.map(t => (
                  <button key={t.key} onClick={() => setActiveTab(t.key)}
                    style={{ ...styles.tabBtn, ...(activeTab === t.key ? styles.tabBtnActive : {}) }}>
                    <span style={{ marginRight:6 }}>{t.icon}</span>{t.label}
                    {t.key === "notifications" && notifsNonLues > 0 && (
                      <span style={{ marginLeft:6, background:"#dc2626", color:"#fff", borderRadius:99, padding:"1px 7px", fontSize:10, fontWeight:800 }}>{notifsNonLues}</span>
                    )}
                  </button>
                ))}
              </div>

              {!banderoleFermee && activeTab !== "notifications" && notifications.filter(n => !n.lu).slice(0, 3).length > 0 && (
                <div style={{ padding:"10px 16px", background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:8, margin:"12px 0", display:"flex", alignItems:"flex-start", gap:10 }}>
                  <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>🔔</span>
                  <div style={{ flex:1, display:"flex", flexDirection:"column", gap:4 }}>
                    {notifications.filter(n => !n.lu).slice(0, 3).map(n => (
                      <div key={n.id} onClick={() => { marquerNotifLue(n.id); setActiveTab("notifications"); }}
                        style={{ cursor:"pointer", display:"flex", flexDirection:"column" }}>
                        <span style={{ fontWeight:700, color:"#9a3412", fontSize:12 }}>{n.titre}</span>
                        <span style={{ color:"#78716c", fontSize:11 }}>{n.message}</span>
                      </div>
                    ))}
                    {notifsNonLues > 3 && (
                      <button onClick={()=>setActiveTab("notifications")} style={{ alignSelf:"flex-start", background:"none", border:"none", color:"#9a3412", fontWeight:700, fontSize:11, cursor:"pointer", padding:0 }}>
                        +{notifsNonLues - 3} autre{notifsNonLues - 3 > 1 ? "s" : ""} →
                      </button>
                    )}
                  </div>
                  <button onClick={()=>setBanderoleFermee(true)} title="Masquer" style={{ background:"none", border:"none", cursor:"pointer", color:"#9a3412", fontSize:14, flexShrink:0 }}>✕</button>
                </div>
              )}

              {chargementEnfant ? (
                <div style={{ padding:40, textAlign:"center", color:"#94a3b8" }}>Chargement…</div>
              ) : (
                <div style={styles.dashboardContent}>

                  {activeTab === "notifications" && (
                    <div style={styles.card}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                        <h3 style={{ ...styles.cardTitle, margin:0 }}>🔔 Notifications</h3>
                        {notifsNonLues > 0 && (
                          <button onClick={marquerToutLu} style={{ background:"none", border:"none", color:"#dc2626", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                            Tout marquer comme lu
                          </button>
                        )}
                      </div>
                      {notifsLoading ? (
                        <p style={{ color:"#94a3b8" }}>Chargement…</p>
                      ) : notifications.length ? (
                        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                          {notifications.map(n => (
                            <div key={n.id} onClick={() => !n.lu && marquerNotifLue(n.id)}
                              style={{ padding:"12px 16px", borderRadius:10, border:`1.5px solid ${n.lu ? "#e2e8f0" : "#fecaca"}`, background: n.lu ? "#fff" : "#fef2f2", cursor: n.lu ? "default" : "pointer" }}>
                              <div style={{ display:"flex", justifyContent:"space-between", gap:10 }}>
                                <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{n.titre}</div>
                                {!n.lu && <span style={{ width:8, height:8, borderRadius:"50%", background:"#dc2626", flexShrink:0, marginTop:5 }} />}
                              </div>
                              <div style={{ fontSize:12, color:"#475569", marginTop:3 }}>{n.message}</div>
                              <div style={{ fontSize:11, color:"#94a3b8", marginTop:5 }}>{fmtDate(n.created_at)}</div>
                            </div>
                          ))}
                        </div>
                      ) : <p style={{ color:"#94a3b8" }}>Aucune notification pour le moment.</p>}
                    </div>
                  )}

                  {activeTab === "vue" && (
                    <>
                      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:4 }}>
                        <div style={{ width:56, height:56, borderRadius:"50%", overflow:"hidden", background:"#fef2f2", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, flexShrink:0 }}>
                          {enfantActif?.avatar_url
                            ? <img src={enfantActif.avatar_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                            : "🧒"}
                        </div>
                        <div style={{ flex:1, minWidth:200 }}>
                          <div style={{ fontSize:18, fontWeight:800, color:"#0f172a" }}>
                            {enfantActif?.surnom || enfantActif?.prenom} {enfantActif?.surnom ? "" : enfantActif?.nom}
                          </div>
                          {enfantActif?.surnom && (
                            <div style={{ fontSize:11.5, color:"#94a3b8" }}>{enfantActif?.prenom} {enfantActif?.nom}</div>
                          )}
                          {enfantActif?.classe?.niveau_cecr && <div style={{ fontSize:12, color:"#64748b" }}>Niveau {enfantActif.classe.niveau_cecr}</div>}
                          {/* Le surnom d'un enfant est posé par le parent : l'enfant consulte,
                              c'est le parent qui connaît le prénom d'usage. */}
                          <button onClick={()=>setSurnomModal({ enfant: enfantActif, valeur: enfantActif?.surnom || "" })}
                            style={{ marginTop:6, background:"none", border:"none", padding:0, color:"#3b82f6", fontSize:11.5, fontWeight:700, cursor:"pointer", textDecoration:"underline" }}>
                            ✏️ {enfantActif?.surnom ? "Modifier le surnom" : "Ajouter un surnom"}
                          </button>
                        </div>
                      </div>

                      <div style={styles.statsGrid}>
                        <StatCard title="Taux d'assiduité"      value={tauxAssiduite}      unit="%" icon="📅" color="#3b82f6" />
                        <StatCard title="Progression moyenne"   value={progressionMoyenne} unit="%" icon="📈" color="#10b981" />
                        <StatCard title="Cours suivis"          value={presentCount} unit={`/${totalPresences}`} icon="🎯" color="#f59e0b" />
                        <StatCard title="Résultats enregistrés" value={resultats.length} icon="📝" color="#8b5cf6" />
                      </div>

                      <div style={styles.card}>
                        <h3 style={styles.cardTitle}>📚 Classe</h3>
                        <div style={{ fontSize:14, color:"#334155" }}>
                          <div><strong>{enfantActif?.classe?.nom || "Classe non assignée"}</strong> {enfantActif?.classe?.niveau_cecr ? `· Niveau ${enfantActif.classe.niveau_cecr}` : ""}</div>
                          {enfantActif?.coach_nom && <div style={{ marginTop:4, color:"#64748b" }}>Coach : {enfantActif.coach_nom}</div>}
                        </div>
                      </div>

                      <div style={styles.card}>
                        <h3 style={styles.cardTitle}>🎯 Derniers résultats</h3>
                        {derniersResultats.length ? (
                          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                            {derniersResultats.map((r, i) => (
                              <div key={r.id || i}>
                                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                                  <span style={styles.courseName}>{r.titre || "Évaluation"} <span style={{ color:"#94a3b8", fontWeight:400 }}>· {fmtDate(r.date_evaluation)}</span></span>
                                  <span style={styles.courseScore}>{r.note} / {r.note_max || 20}</span>
                                </div>
                                <ProgressBar value={r.note} max={r.note_max || 20} color="#1e3a8a" />
                              </div>
                            ))}
                          </div>
                        ) : <p style={{ color:"#94a3b8" }}>Aucun résultat enregistré pour le moment.</p>}
                      </div>

                      {prochaineSeance && (() => {
                        const lienProchaine = prochaineSeance.lieu && /^https?:\/\//i.test(prochaineSeance.lieu) ? prochaineSeance.lieu : null;
                        return (
                        <div style={styles.card}>
                          <h3 style={styles.cardTitle}>📅 Prochaine séance</h3>
                          <div style={styles.classItem}>
                            <div style={styles.classDate}>
                              <div style={{ fontWeight:800 }}>{fmtDate(prochaineSeance.date)}</div>
                              <div style={{ fontSize:".8rem", color:"#64748b" }}>{prochaineSeance.heure_debut || ""}</div>
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontWeight:600 }}>{prochaineSeance.objectifs_session || prochaineSeance.type || "Séance"}</div>
                            </div>
                            {lienProchaine && (
                              <a href={lienProchaine} target="_blank" rel="noopener noreferrer"
                                style={{ padding:"8px 16px", background:"#dc2626", color:"#fff", borderRadius:8, fontWeight:700, fontSize:12.5, textDecoration:"none", whiteSpace:"nowrap" }}>
                                🔗 Rejoindre
                              </a>
                            )}
                          </div>
                        </div>
                        );
                      })()}

                      {/* Accès de l'enfant - identifiant de connexion et statut du compte,
                          jamais le mot de passe lui-même. */}
                      {enfantActif?.acces && (
                        <div style={styles.card}>
                          <h3 style={styles.cardTitle}>🔑 Accès de {enfantActif.prenom || "l'enfant"}</h3>
                          {enfantActif.acces.compte_cree ? (
                            <div style={{ fontSize:14, color:"#334155", display:"flex", flexDirection:"column", gap:6 }}>
                              <div>Identifiant de connexion : <strong>{enfantActif.acces.identifiant || "-"}</strong></div>
                              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:4 }}>
                                <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, background: enfantActif.acces.actif ? "#dcfce7" : "#fee2e2", color: enfantActif.acces.actif ? "#16a34a" : "#dc2626" }}>
                                  {enfantActif.acces.actif ? "✅ Compte actif" : "🔒 Compte suspendu"}
                                </span>
                                {enfantActif.acces.mdp_temporaire && (
                                  <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:"#fef3c7", color:"#92400e" }}>
                                    ⚠️ Mot de passe temporaire - à changer à la connexion
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <p style={{ color:"#94a3b8", fontSize:13 }}>Le compte de {enfantActif.prenom || "votre enfant"} n'a pas encore été créé - contactez BET pour recevoir ses accès.</p>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {activeTab === "presences" && (
                    <div style={styles.card}>
                      <h3 style={styles.cardTitle}>📋 Présences</h3>
                      {presences.length ? (
                        <div style={{ overflowX:"auto" }}>
                          <table style={styles.testTable}>
                            <thead><tr><th style={styles.testTableTh}>Date</th><th style={styles.testTableTh}>Séance</th><th style={styles.testTableTh}>Statut</th></tr></thead>
                            <tbody>
                              {presences.map((p, i) => (
                                <tr key={p.id || i}>
                                  <td style={{ padding:"10px 8px" }}>{fmtDate(p.seance?.date)}</td>
                                  <td style={{ padding:"10px 8px" }}>{p.seance?.objectifs_session || p.seance?.type || "-"}</td>
                                  <td style={{ padding:"10px 8px", fontWeight:700, color: (p.statut === "present" || p.statut === "présent") ? "#16a34a" : "#dc2626" }}>{p.statut || "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : <p style={{ color:"#94a3b8" }}>Aucune présence enregistrée.</p>}
                    </div>
                  )}

                  {activeTab === "resultats" && (
                    <div style={styles.card}>
                      <h3 style={styles.cardTitle}>📈 Résultats</h3>
                      {resultats.length ? (
                        <div style={{ overflowX:"auto" }}>
                          <table style={styles.testTable}>
                            <thead><tr><th style={styles.testTableTh}>Date</th><th style={styles.testTableTh}>Évaluation</th><th style={styles.testTableTh}>Note</th><th style={styles.testTableTh}>Progression</th></tr></thead>
                            <tbody>
                              {resultats.map((r, i) => (
                                <tr key={r.id || i}>
                                  <td style={{ padding:"10px 8px" }}>{fmtDate(r.date_evaluation)}</td>
                                  <td style={{ padding:"10px 8px" }}>{r.titre || "-"}</td>
                                  <td style={{ padding:"10px 8px", fontWeight:700 }}>{r.note} / {r.note_max || 20}</td>
                                  <td style={{ padding:"10px 8px", minWidth:140 }}><ProgressBar value={r.note} max={r.note_max || 20} color="#10b981" height={6} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : <p style={{ color:"#94a3b8" }}>Aucun résultat pour le moment.</p>}
                    </div>
                  )}

                  {activeTab === "devoirs" && (
                    <div style={styles.card}>
                      <h3 style={styles.cardTitle}>📝 Devoirs</h3>
                      {devoirs.length ? (
                        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                          {devoirs.map((d, i) => (
                            <div key={d.id || i} style={{ padding:"12px 0", borderBottom:"1px solid #f1f5f9" }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                <span style={{ fontWeight:700, color:"#0f172a" }}>{d.titre}</span>
                                <span style={{
                                  fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:20,
                                  background: d.rendu ? "#dcfce7" : "#fef3c7",
                                  color: d.rendu ? "#16a34a" : "#92400e",
                                }}>
                                  {d.rendu ? (d.rendu.statut === "corrige" ? `Corrigé · ${d.rendu.note ?? "-"}/${d.rendu.note_max ?? 20}` : "Rendu") : "Non rendu"}
                                </span>
                              </div>
                              {d.description && <div style={{ fontSize:12, color:"#64748b", marginTop:4 }}>{d.description}</div>}
                              {d.rendu?.commentaire_coach && <div style={{ fontSize:12, color:"#334155", marginTop:6, fontStyle:"italic" }}>💬 {d.rendu.commentaire_coach}</div>}
                            </div>
                          ))}
                        </div>
                      ) : <p style={{ color:"#94a3b8" }}>Aucun devoir publié.</p>}
                    </div>
                  )}

                  {activeTab === "ressources" && (
                    <div style={styles.card}>
                      <h3 style={styles.cardTitle}>📂 Ressources partagées</h3>
                      {ressourcesLoading ? (
                        <p style={{ color:"#94a3b8" }}>Chargement…</p>
                      ) : ressources.length ? (
                        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                          {ressources.map((f, i) => {
                            const typeIcon = { pdf:"📄", video:"🎬", audio:"🎧", lien:"🔗", speaking:"🎤" };
                            const icon = typeIcon[f.type_fichier] || "📎";
                            return (
                              <a key={f.id || i} href={f.url} target="_blank" rel="noopener noreferrer"
                                style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:10, border:"1px solid #f1f5f9", textDecoration:"none", color:"inherit" }}>
                                <span style={{ fontSize:22 }}>{icon}</span>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontWeight:700, color:"#0f172a", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.nom}</div>
                                  {f.created_at && <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>Partagé le {fmtDate(f.created_at)}</div>}
                                </div>
                                <span style={{ fontSize:12, fontWeight:700, color:"#dc2626" }}>Ouvrir →</span>
                              </a>
                            );
                          })}
                        </div>
                      ) : <p style={{ color:"#94a3b8" }}>Le coach n'a pas encore partagé de fichiers pour la classe de {enfantActif?.prenom || "votre enfant"}.</p>}
                    </div>
                  )}

                  {activeTab === "seances" && (
                    <div style={styles.card}>
                      <h3 style={styles.cardTitle}>📅 Séances</h3>
                      {seances.length ? (
                        <div style={styles.classList}>
                          {seances.map((s, i) => {
                            // Le lien de la session en ligne (Zoom/Meet) vit dans la colonne
                            // "lieu" de la table unifiée `seances` (posé par le coach à la
                            // programmation) - jamais exposé au parent jusqu'ici.
                            const lienSession = s.lieu && /^https?:\/\//i.test(s.lieu) ? s.lieu : null;
                            const estAVenir = s.statut === "planifie" || s.statut === "planifiee";
                            /* LE PROGRAMME DE LA SÉANCE. Le coach rattache un ou plusieurs
                               cours à chaque session ; le parent n'en voyait rien, alors que
                               c'est précisément ce qu'il cherche à savoir - ce que son enfant
                               va travailler. Seuls les cours PUBLIÉS remontent : le serveur
                               écarte les brouillons, dont le titre promettrait un contenu
                               que l'enfant ne peut pas encore ouvrir. */
                            const coursLies = s.contenu_modules || [];
                            /* La salle n'est pas encore ouverte : le serveur ne transmet alors
                               pas le lien du tout (il est public, le masquer à l'écran ne
                               protégerait rien) et indique l'heure d'ouverture. */
                            const enAttente = estAVenir && !lienSession && s.salle_ouvre_a;
                            const EMOJI_C = { lecon:"📖", audio:"🎧", video:"🎬" };
                            return (
                            <div key={s.id || i} style={{ ...styles.classItem, alignItems:"flex-start", flexWrap:"wrap" }}>
                              <div style={styles.classDate}>
                                <div style={{ fontWeight:800 }}>{fmtDate(s.date)}</div>
                                <div style={{ fontSize:".8rem", color:"#64748b" }}>{s.heure_debut || ""}{s.heure_fin ? ` – ${s.heure_fin}` : ""}</div>
                              </div>
                              <div style={{ flex:1, minWidth:180 }}>
                                <div style={{ fontWeight:600 }}>{s.objectifs_session || s.type || "Séance"}</div>
                                <div style={{ fontSize:".8rem", color:"#475569" }}>{s.statut}{s.source === "presence" && <span style={{ color:"#94a3b8" }}> · déduite des présences</span>}</div>
                                {coursLies.length > 0 && (
                                  <div style={{ marginTop:7 }}>
                                    <div style={{ fontSize:".7rem", fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".05em", marginBottom:5 }}>
                                      📚 Au programme
                                    </div>
                                    <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                                      {coursLies.map(m => (
                                        <span key={m.id} style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:8, fontSize:".75rem", fontWeight:600, background:"#f0f9ff", border:"1px solid #bae6fd", color:"#0369a1" }}>
                                          <span>{EMOJI_C[m.type_contenu] || "📦"}</span>
                                          <span>{m.titre}</span>
                                          {m.nb_blocs > 0 && <span style={{ color:"#7dd3fc", fontWeight:700 }}>· {m.nb_blocs} partie{m.nb_blocs > 1 ? "s" : ""}</span>}
                                          {m.duree_estimee && <span style={{ color:"#94a3b8" }}>· {m.duree_estimee} min</span>}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                              {lienSession && estAVenir && (
                                <a href={lienSession} target="_blank" rel="noopener noreferrer"
                                  style={{ padding:"8px 16px", background:"#dc2626", color:"#fff", borderRadius:8, fontWeight:700, fontSize:12.5, textDecoration:"none", whiteSpace:"nowrap" }}>
                                  🔗 Rejoindre
                                </a>
                              )}
                              {enAttente && (
                                <span title={`La salle s'ouvre ${s.salle_ouvre_dans_min || 10} min avant le début du cours`}
                                  style={{ padding:"8px 16px", background:"#f1f5f9", color:"#94a3b8", borderRadius:8, fontWeight:700, fontSize:12.5, whiteSpace:"nowrap", cursor:"not-allowed" }}>
                                  🔒 Salle à {String(s.salle_ouvre_a).slice(0,5)}
                                </span>
                              )}
                            </div>
                            );
                          })}
                        </div>
                      ) : <p style={{ color:"#94a3b8" }}>Aucune séance programmée.</p>}
                    </div>
                  )}

                  {activeTab === "paiement" && (() => {
                    const tranches = planPaiement?.tranches || [];
                    const totalRecu = paiements.reduce((s, p) => s + (estStatutPaye(p.statut) ? (p.montant_recu || 0) : 0), 0);
                    const totalDu   = paiements.length ? Math.max(...paiements.map(p => p.montant_du || 0)) : 0;
                    const reste     = Math.max(0, totalDu - totalRecu);
                    return (
                      <>
                        {(totalDu > 0 || paiements.length > 0) && (
                          <div style={styles.card}>
                            <h3 style={styles.cardTitle}>💳 Résumé</h3>
                            <div style={{ display:"flex", gap:0 }}>
                              {[
                                { l:"Total dû",  v:totalDu,  c:"#0f172a" },
                                { l:"Reçu",      v:totalRecu, c:"#22c55e" },
                                { l:"Reste",     v:reste,    c: reste > 0 ? "#ef4444" : "#22c55e" },
                              ].map((s, i, arr) => (
                                <div key={s.l} style={{ flex:1, textAlign:"center", borderRight: i < arr.length-1 ? "1px solid #e2e8f0" : "none" }}>
                                  <div style={{ fontSize:11, color:"#94a3b8", marginBottom:4 }}>{s.l}</div>
                                  <div style={{ fontSize:16, fontWeight:800, color:s.c }}>{Number(s.v).toLocaleString("fr-FR")} F</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {tranches.length > 0 && (
                          <div style={styles.card}>
                            <h3 style={styles.cardTitle}>📅 Plan de paiement échelonné</h3>
                            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                              {tranches.map((t, idx) => {
                                const isPaye = estStatutPaye(t.statut);
                                return (
                                  <div key={t.id || idx} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", borderRadius:10, border:`1.5px solid ${isPaye ? "#86efac" : "#fde68a"}`, background: isPaye ? "#f0fdf4" : "#fffbeb" }}>
                                    <div>
                                      <div style={{ fontWeight:700, fontSize:13 }}>{t.label || `Tranche ${idx+1}`}</div>
                                      {t.date_echeance && <div style={{ fontSize:11, color:"#64748b" }}>Échéance : {fmtDate(t.date_echeance)}</div>}
                                    </div>
                                    <div style={{ textAlign:"right" }}>
                                      <div style={{ fontWeight:800, fontSize:14 }}>{Number(t.montant || 0).toLocaleString("fr-FR")} F</div>
                                      <span style={{ fontSize:11, fontWeight:700, color: isPaye ? "#166534" : "#92400e" }}>{isPaye ? "✅ Payé" : "⏳ À venir"}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div style={styles.card}>
                          <h3 style={styles.cardTitle}>🧾 Historique des paiements</h3>
                          {paiements.length ? (
                            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                              {paiements.map(p => {
                                const isPaye = estStatutPaye(p.statut);
                                return (
                                  <div key={p.id} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid #f1f5f9" }}>
                                    <div>
                                      <div style={{ fontSize:12, color:"#6b7280" }}>{fmtDate(p.date_paiement)}</div>
                                      <div style={{ fontSize:13 }}>{p.inscription || "Paiement"} {p.mode_paiement ? `· ${p.mode_paiement}` : ""}</div>
                                    </div>
                                    <div style={{ textAlign:"right" }}>
                                      <div style={{ fontWeight:700, color:"#0f172a" }}>{Number(p.montant_recu || 0).toLocaleString("fr-FR")} F</div>
                                      <span style={{ fontSize:11, fontWeight:700, color: isPaye ? "#16a34a" : "#d97706" }}>{isPaye ? "✅ Payé" : "⏳ En attente"}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : <p style={{ color:"#94a3b8" }}>Aucun paiement enregistré pour le moment.</p>}
                        </div>
                      </>
                    );
                  })()}

                  {activeTab === "evaluation" && (
                    <div style={styles.card}>
                      <h3 style={styles.cardTitle}>⭐ Évaluer le coach ce mois-ci</h3>
                      {dejaEvalueCeMois ? (
                        <p style={{ color:"#16a34a", fontWeight:600 }}>✅ Merci, vous avez déjà transmis votre avis pour ce mois-ci.</p>
                      ) : (
                        <>
                          {[
                            { id:"q1", label:"Ponctualité du coach" },
                            { id:"q2", label:"Qualité pédagogique" },
                            { id:"q3", label:"Communication" },
                            { id:"q4", label:"Progrès observés" },
                            { id:"q5", label:"Satisfaction globale" },
                          ].map(q => (
                            <div key={q.id} style={{ marginBottom:14 }}>
                              <div style={{ fontSize:13, fontWeight:600, marginBottom:6 }}>{q.label}</div>
                              <div style={{ display:"flex", gap:6 }}>
                                {[1,2,3,4,5].map(v => (
                                  <button key={v} onClick={() => setEvalForm(f => ({ ...f, [q.id]: v }))}
                                    style={{
                                      width:36, height:36, borderRadius:8, cursor:"pointer",
                                      border:`2px solid ${evalForm[q.id] >= v ? "#F59E0B" : "#E2E8F0"}`,
                                      background: evalForm[q.id] >= v ? "#FEF9C3" : "#fff",
                                      fontWeight:700, color: evalForm[q.id] >= v ? "#92400e" : "#94a3b8",
                                    }}>
                                    {v}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                          <textarea rows={3} placeholder="Commentaire (optionnel)" value={evalForm.commentaire}
                            onChange={e => setEvalForm(f => ({ ...f, commentaire: e.target.value }))}
                            style={{ width:"100%", padding:9, borderRadius:6, border:"1px solid #d1d5db", fontSize:13, resize:"vertical", marginBottom:14 }} />
                          <button onClick={soumettreEval} disabled={evalSaving}
                            style={{ padding:"10px 20px", background: evalSaving ? "#cbd5e1" : "#F59E0B", color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor: evalSaving ? "not-allowed" : "pointer" }}>
                            {evalSaving ? "Envoi…" : "Envoyer mon avis"}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {activeTab === "contact" && (() => {
                    // Contacts réels du dossier de l'enfant sélectionné (assistante, coach,
                    // PA Advisor) - plus de contacts fictifs. Le PA n'apparaît que s'il est
                    // réellement assigné à ce dossier précis (rarement le cas pour un dossier
                    // groupe) ; pas de contact générique à sa place.
                    const c = enfantActif?.contacts || {};
                    const contactsReels = [
                      c.assistante ? { id:"assistante", role:"Assistante", ...c.assistante } : null,
                      c.coach      ? { id:"coach",      role:"Coach",      ...c.coach }      : null,
                      c.pa_advisor ? { id:"pa",         role:"PA Advisor", ...c.pa_advisor } : null,
                    ].filter(Boolean);
                    return (
                    <div style={styles.card}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                        <h3 style={styles.cardTitle}>📞 Contactez BET</h3>
                        <button onClick={() => setShowRequestModal(true)} style={styles.requestBtn}>📝 Formulaire de requête</button>
                      </div>
                      {contactsReels.length === 0 ? (
                        <p style={{ color:"#64748b", fontSize:13 }}>Les contacts de l'équipe assignée au dossier de {enfantActif?.prenom || "votre enfant"} apparaîtront ici dès qu'ils seront renseignés. Utilisez le formulaire de requête en attendant.</p>
                      ) : (
                      <div style={styles.contactGrid}>
                        {contactsReels.map(contact => (
                          <div key={contact.id} style={styles.contactCard}>
                            <div style={styles.contactHeader}>
                              <div style={{ ...styles.contactAvatar, overflow:"hidden" }}>
                                {contact.photo_url ? <img src={contact.photo_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : "👤"}
                              </div>
                              <div>
                                <div style={styles.contactName}>{contact.nom || "-"}</div>
                                <div style={styles.contactRole}>{contact.role}</div>
                              </div>
                            </div>
                            <div style={styles.contactDetails}>
                              {contact.telephone && <div>📞 {contact.telephone}</div>}
                              {contact.email && <div>✉️ {contact.email}</div>}
                            </div>
                            <div style={styles.contactActions}>
                              {contact.telephone && <a href={`tel:${contact.telephone}`} style={styles.contactLink}>📞 Appeler</a>}
                              {contact.email && <a href={`mailto:${contact.email}`} style={styles.contactLink}>✉️ Email</a>}
                            </div>
                          </div>
                        ))}
                      </div>
                      )}
                    </div>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showRequestModal && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
              <h3 style={{ margin:0, fontSize:16 }}>Formulaire de requête</h3>
              <button onClick={() => setShowRequestModal(false)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#6b7280" }}>✕</button>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, marginBottom:4 }}>Destinataire</label>
              <select value={requestDestinataire} onChange={(e) => setRequestDestinataire(e.target.value)} style={{ width:"100%", padding:9, borderRadius:6, border:"1px solid #d1d5db", fontSize:13 }}>
                {CONTACTS_ADMIN.map(c => <option key={c.id} value={c.nom}>{c.nom} ({c.role})</option>)}
              </select>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, marginBottom:4 }}>Objet</label>
              <input type="text" value={requestObjet} onChange={(e) => setRequestObjet(e.target.value)} placeholder="Ex: Problème d'accès à une ressource" style={{ width:"100%", padding:9, borderRadius:6, border:"1px solid #d1d5db", fontSize:13 }} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, marginBottom:4 }}>Message</label>
              <textarea rows={5} value={requestMessage} onChange={(e) => setRequestMessage(e.target.value)} placeholder="Décrivez votre demande ou signalement..." style={{ width:"100%", padding:9, borderRadius:6, border:"1px solid #d1d5db", fontSize:13, resize:"vertical" }} />
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={() => setShowRequestModal(false)} style={{ padding:"9px 16px", background:"#e5e7eb", color:"#374151", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 }}>Annuler</button>
              <button onClick={handleSubmitRequest} style={{ padding:"9px 16px", background:"#dc2626", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 }}>Envoyer la requête</button>
            </div>
          </div>
        </div>
      )}

      {showAjoutEnfant && (
        <div style={modalOverlay}>
          <div style={{ ...modalBox, width:640, maxHeight:"88vh", overflowY:"auto" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <h3 style={{ margin:0, fontSize:16 }}>➕ Inscrire un nouvel enfant</h3>
              <button onClick={() => setShowAjoutEnfant(false)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#6b7280" }}>✕</button>
            </div>
            <p style={{ margin:"0 0 18px", fontSize:12.5, color:"#64748b", lineHeight:1.5 }}>
              Votre demande sera transmise à notre équipe (onglet « Prospects parcours »), qui vous recontactera pour finaliser l'inscription.
            </p>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
              <div>
                <label style={{ display:"block", fontSize:12, fontWeight:600, marginBottom:4 }}>Prénom de l'enfant *</label>
                <input type="text" value={enfantForm.prenom} onChange={e => setEnfantForm(f => ({ ...f, prenom:e.target.value }))} style={{ width:"100%", padding:9, borderRadius:6, border:"1px solid #d1d5db", fontSize:13, boxSizing:"border-box" }} />
              </div>
              <div>
                <label style={{ display:"block", fontSize:12, fontWeight:600, marginBottom:4 }}>Nom de l'enfant *</label>
                <input type="text" value={enfantForm.nom} onChange={e => setEnfantForm(f => ({ ...f, nom:e.target.value }))} style={{ width:"100%", padding:9, borderRadius:6, border:"1px solid #d1d5db", fontSize:13, boxSizing:"border-box" }} />
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
              <div>
                <label style={{ display:"block", fontSize:12, fontWeight:600, marginBottom:4 }}>Tranche d'âge</label>
                <select value={enfantForm.tranche_age} onChange={e => setEnfantForm(f => ({ ...f, tranche_age:e.target.value }))} style={{ width:"100%", padding:9, borderRadius:6, border:"1px solid #d1d5db", fontSize:13 }}>
                  {TRANCHES_AGE.map(t => <option key={t.val} value={t.val}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display:"block", fontSize:12, fontWeight:600, marginBottom:4 }}>Niveau de classe</label>
                <select value={enfantForm.niveau_classe_enfant} onChange={e => setEnfantForm(f => ({ ...f, niveau_classe_enfant:e.target.value }))} style={{ width:"100%", padding:9, borderRadius:6, border:"1px solid #d1d5db", fontSize:13 }}>
                  <option value="">- Choisir -</option>
                  {["CP","CE1","CE2","CM1","CM2","6ème","5ème","4ème","3ème","2nde","1ère","Terminale"].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, marginBottom:4 }}>Mode de cours</label>
              <div style={{ display:"flex", gap:8 }}>
                {[["en_ligne","💻 En ligne"],["presentiel","🏫 Présentiel"],["domicile","🏠 À domicile"]].map(([val,label]) => (
                  <button key={val} onClick={() => setEnfantForm(f => ({ ...f, type_cours:val, centre_id: val==="en_ligne" ? "" : f.centre_id }))}
                    style={{ flex:1, padding:"9px 12px", borderRadius:8, border:`1.5px solid ${enfantForm.type_cours===val?"#16a34a":"#e2e8f0"}`, background:enfantForm.type_cours===val?"#f0fdf4":"#fff", color:enfantForm.type_cours===val?"#166534":"#374151", fontWeight:600, fontSize:12.5, cursor:"pointer" }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {enfantForm.type_cours === "presentiel" && (
              <div style={{ marginBottom:14 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:600, marginBottom:4 }}>Centre *</label>
                <select value={enfantForm.centre_id} onChange={e => setEnfantForm(f => ({ ...f, centre_id:e.target.value }))} style={{ width:"100%", padding:9, borderRadius:6, border:"1px solid #d1d5db", fontSize:13 }}>
                  <option value="">- Sélectionner un centre -</option>
                  {centres.map(c => <option key={c.id} value={c.id}>{c.label || c.nom}</option>)}
                </select>
              </div>
            )}

            {enfantForm.type_cours === "domicile" && (
              <div style={{ marginBottom:14 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:600, marginBottom:4 }}>Adresse du domicile *</label>
                <input type="text" value={enfantForm.adresse_domicile} onChange={e => setEnfantForm(f => ({ ...f, adresse_domicile:e.target.value }))} placeholder="Ex : Cocody Angré 7ème tranche, non loin de…" style={{ width:"100%", padding:9, borderRadius:6, border:"1px solid #d1d5db", fontSize:13, boxSizing:"border-box" }} />
              </div>
            )}

            {/* Assistante - même sélection (avec ses vraies infos) que sur le parcours enfant
                du site public : en ligne dès qu'on choisit ce mode, ou dès qu'un centre est
                sélectionné en présentiel. */}
            {(enfantForm.type_cours === "en_ligne" || enfantForm.type_cours === "domicile" || (enfantForm.type_cours === "presentiel" && enfantForm.centre_id)) && (
              <div style={{ marginBottom:14 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:600, marginBottom:4 }}>Assistante *</label>
                {assistantesEnfantLoading ? (
                  <div style={{ padding:"14px 0", textAlign:"center", color:"#9ca3af", fontSize:12 }}>Recherche des assistantes…</div>
                ) : assistantesEnfant.length === 0 ? (
                  <div style={{ padding:"12px 14px", background:"#f8fafc", border:"1.5px dashed #e2e8f0", borderRadius:8, color:"#6b7280", fontSize:12, textAlign:"center" }}>
                    Aucune assistante disponible pour le moment.
                  </div>
                ) : (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(120px, 1fr))", gap:8 }}>
                    {assistantesEnfant.map(a => {
                      const selected = enfantForm.assistante_id === a.id;
                      const initiales = `${a.prenom?.[0]||""}${a.nom?.[0]||""}`.toUpperCase();
                      const photo = a.photo_url || a.avatar_url || null;
                      return (
                        <div key={a.id} onClick={() => setEnfantForm(f => ({ ...f, assistante_id:a.id }))}
                          style={{ border:`1.5px solid ${selected?"#16a34a":"#e2e8f0"}`, background:selected?"#f0fdf4":"#fff", borderRadius:10, padding:"10px 8px", textAlign:"center", cursor:"pointer", transition:"all .15s" }}>
                          {photo
                            ? <img src={photo} alt={a.prenom} style={{ width:40, height:40, borderRadius:"50%", objectFit:"cover", margin:"0 auto 6px" }} />
                            : <div style={{ width:40, height:40, borderRadius:"50%", background:selected?"#16a34a":"#94a3b8", color:"#fff", fontWeight:800, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 6px" }}>{initiales}</div>
                          }
                          <div style={{ fontSize:11.5, fontWeight:700, color:"#1e293b" }}>{a.prenom} {a.nom}</div>
                          {a.telephone && <div style={{ fontSize:10, color:"#2563eb", marginTop:2 }}>📞 {a.telephone}</div>}
                          {selected && <div style={{ fontSize:10, fontWeight:700, color:"#16a34a", marginTop:4 }}>✓ Choisie</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginBottom:20 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, marginBottom:4 }}>Téléphone de contact *</label>
              <input type="tel" value={enfantForm.telephone_parent} onChange={e => setEnfantForm(f => ({ ...f, telephone_parent:e.target.value }))} placeholder="+225 07 00 00 00 00" style={{ width:"100%", padding:9, borderRadius:6, border:"1px solid #d1d5db", fontSize:13, boxSizing:"border-box" }} />
            </div>

            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={() => setShowAjoutEnfant(false)} style={{ padding:"9px 16px", background:"#e5e7eb", color:"#374151", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 }}>Annuler</button>
              <button onClick={soumettreNouvelEnfant} disabled={enfantSubmitting} style={{ padding:"9px 16px", background:enfantSubmitting?"#9ca3af":"#16a34a", color:"#fff", border:"none", borderRadius:6, cursor:enfantSubmitting?"not-allowed":"pointer", fontWeight:600, fontSize:12 }}>
                {enfantSubmitting ? "⏳ Envoi…" : "Envoyer la demande"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Surnom de l'enfant - saisi par le parent, jamais par l'enfant : son compte sert
          surtout à consulter, et c'est le parent qui connaît le prénom d'usage. */}
      {surnomModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.55)", zIndex:9800, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
             onClick={e=>{ if(e.target===e.currentTarget && !surnomSaving) setSurnomModal(null); }}>
          <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:420, padding:24 }}>
            <h3 style={{ margin:"0 0 6px", fontSize:16, fontWeight:800, color:"#0f172a" }}>✏️ Surnom de mon enfant</h3>
            <p style={{ margin:"0 0 16px", fontSize:12.5, color:"#6b7280", lineHeight:1.6 }}>
              Le nom sous lequel <strong>{surnomModal.enfant?.prenom} {surnomModal.enfant?.nom}</strong> apparaîtra
              dans son espace. Son nom complet reste inchangé pour l'administration.
            </p>
            <input
              value={surnomModal.valeur}
              onChange={e=>setSurnomModal(m=>({ ...m, valeur:e.target.value }))}
              onKeyDown={e=>{ if(e.key==="Enter" && !surnomSaving) enregistrerSurnomEnfant(); }}
              placeholder={surnomModal.enfant?.prenom || "Ex : Koro"}
              maxLength={40}
              autoFocus
              style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:"1.5px solid #e5e7eb", fontSize:14, boxSizing:"border-box", outline:"none" }}
            />
            <div style={{ display:"flex", gap:10, marginTop:18 }}>
              <button onClick={()=>setSurnomModal(null)} disabled={surnomSaving}
                style={{ flex:1, padding:"10px 0", borderRadius:8, border:"1.5px solid #e2e8f0", background:"#fff", color:"#374151", fontWeight:700, fontSize:13, cursor: surnomSaving?"not-allowed":"pointer" }}>
                Annuler
              </button>
              <button onClick={enregistrerSurnomEnfant} disabled={surnomSaving}
                style={{ flex:1, padding:"10px 0", borderRadius:8, border:"none", background: surnomSaving?"#e5e7eb":"#3b82f6", color: surnomSaving?"#9ca3af":"#fff", fontWeight:800, fontSize:13, cursor: surnomSaving?"not-allowed":"pointer" }}>
                {surnomSaving ? "…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
   STYLES
════════════════════════════════════════════════════════════════ */
const styles = {
  page: { fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#f8fafc", minHeight: "100vh", color: "#0f172a" },
  header: { background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "24px 0", boxShadow: "0 1px 6px rgba(0,0,0,.05)" },
  headerInner: { width: "100%", boxSizing: "border-box", padding: "0 32px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 },
  title: { fontFamily: "'DM Serif Display', serif", fontSize: "1.8rem", margin: 0, fontWeight: 400, color: "#0f172a" },
  subtitle: { fontSize: ".9rem", color: "#64748b", margin: "4px 0 0" },
  headerRight: { display: "flex", gap: 12 },
  profileBtn: { background: "linear-gradient(135deg,#dc2626,#1e3a8a)", color: "#fff", border: "none", borderRadius: 999, padding: "8px 20px", fontWeight: 600, cursor: "pointer" },
  container: { width: "100%", boxSizing: "border-box", margin: "40px 0", padding: "0 32px" },
  childTabs: { display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" },
  childTab: { background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 999, padding: "10px 24px", fontSize: ".95rem", fontWeight: 600, color: "#475569", cursor: "pointer", transition: "all .2s", display: "flex", alignItems: "center" },
  childTabActive: { background: "#fef2f2", borderColor: "#dc2626", color: "#dc2626", boxShadow: "0 2px 8px rgba(220,38,38,.1)" },
  tabsBar: { display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap", borderBottom: "1px solid #e2e8f0", paddingBottom: 12 },
  tabBtn: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, color: "#475569", cursor: "pointer", flex: "1 1 120px", whiteSpace: "nowrap", textAlign: "center" },
  tabBtnActive: { background: "#1e3a8a", borderColor: "#1e3a8a", color: "#fff" },
  dashboardContent: { display: "flex", flexDirection: "column", gap: 28 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 },
  statCard: { background: "#fff", borderRadius: 16, padding: "18px 20px", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 2px 10px rgba(0,0,0,.05)" },
  statIcon: { width: 48, height: 48, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem" },
  statValue: { fontSize: "1.6rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.2 },
  statLabel: { fontSize: ".78rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".03em" },
  card: { background: "#fff", borderRadius: 20, padding: "24px", border: "1px solid #e2e8f0", boxShadow: "0 2px 12px rgba(0,0,0,.05)" },
  cardTitle: { fontFamily: "'DM Serif Display', serif", fontSize: "1.3rem", fontWeight: 400, margin: "0 0 20px", color: "#0f172a" },
  courseName: { fontSize: ".9rem", fontWeight: 600, color: "#334155" },
  courseScore: { fontSize: ".85rem", fontWeight: 700, color: "#1e3a8a" },
  testTable: { width: "100%", borderCollapse: "collapse" },
  testTableTh: { textAlign: "left", padding: "12px 8px", fontSize: ".75rem", fontWeight: 800, color: "#64748b", borderBottom: "1px solid #e2e8f0" },
  classList: { display: "flex", flexDirection: "column", gap: 16 },
  classItem: { display: "flex", alignItems: "center", gap: 20, padding: "12px 0", borderBottom: "1px solid #f1f5f9", flexWrap: "wrap" },
  classDate: { minWidth: 100 },
  contactGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 },
  contactCard: { background: "#f8fafc", borderRadius: 16, padding: 16, border: "1px solid #e2e8f0", transition: "all .2s" },
  contactHeader: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12 },
  contactAvatar: { width: 40, height: 40, borderRadius: "50%", background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#dc2626" },
  contactName: { fontWeight: 700, fontSize: 14, color: "#0f172a" },
  contactRole: { fontSize: 11, color: "#64748b" },
  contactDetails: { fontSize: 12, color: "#374151", marginBottom: 12, lineHeight: 1.6 },
  contactActions: { display: "flex", gap: 8 },
  contactLink: { flex: 1, textAlign: "center", padding: "6px", background: "#fff", color: "#1e3a8a", textDecoration: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid #e2e8f0" },
  requestBtn: { padding: "8px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: "pointer" },
  loaderContainer: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16 },
  spinner: { width: 40, height: 40, border: "4px solid #e2e8f0", borderTopColor: "#dc2626", borderRadius: "50%", animation: "spin 1s linear infinite" },
};

const modalOverlay = { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 };
const modalBox = { background: "#fff", padding: 24, borderRadius: 14, maxWidth: "92vw", width: 520 };
