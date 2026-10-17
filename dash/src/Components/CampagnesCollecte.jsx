import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import { uploadFichier } from "../utils/uploadFichier";
import { useConfirm } from "../contexts/ConfirmContext";
import { exporterCampagnesExcel, exporterCampagnesPdf } from "../utils/exportCampagnes";
import { preparerContacts, exporterVcards, exporterNumeros, decouperEnListes, MAX_PAR_LISTE } from "../utils/exportContactsWhatsapp";

/**
 * Campagnes de collecte - l'écran de l'assistant marketing.
 *
 * Trois niveaux, du plus large au plus précis : les campagnes regroupent des formulaires,
 * un formulaire porte ses questions et ses canaux de diffusion, un canal produit des
 * réponses. C'est le canal qui donne sa valeur au dispositif : sans lui on collecte des
 * réponses sans savoir quel support les a produites.
 *
 * Composant séparé et non un bloc de plus dans le dashboard : celui-ci dépasse déjà
 * 20 000 lignes, et cet écran a vocation à être monté aussi chez la commerciale.
 */

/* L'ADRESSE PUBLIQUE DU SITE - celle qui part dans les liens de campagne et les QR codes.

   Cet écran lisait `REACT_APP_PUBLIC_URL`, une variable qui n'a JAMAIS été définie : le
   repli `localhost` s'appliquait donc en permanence, et les liens partagés aux prospects
   pointaient vers la machine de celui qui les avait générés.

   TOUJOURS LE DOMAINE DE PRODUCTION, y compris en développement - et c'est la différence
   avec les autres écrans. Un QR code n'est pas un lien de navigation : il est imprimé sur
   une affiche et scanné par un prospect avec son téléphone, qui n'atteindra jamais le
   `localhost` du poste où le code a été fabriqué. Un QR produit en développement doit
   rester scannable ; seule l'adresse de production a un sens ici.

   `REACT_APP_PUBLIC_URL` reste lue en premier : si vous la définissez un jour pour pointer
   ailleurs que le site principal, elle l'emportera sans qu'on touche à ce fichier. */
const PUBLIC_URL =
  process.env.REACT_APP_PUBLIC_URL || "https://binniesenglish.net";

const TYPES_CHAMP = [
  { v: "texte",          l: "Texte court",      i: "✏️" },
  { v: "texte_long",     l: "Texte long",       i: "📝" },
  { v: "email",          l: "E-mail",           i: "✉️" },
  { v: "telephone",      l: "Téléphone",        i: "📞" },
  { v: "nombre",         l: "Nombre",           i: "🔢" },
  { v: "date",           l: "Date",             i: "📅" },
  { v: "heure",          l: "Heure",            i: "🕐" },
  { v: "choix_unique",   l: "Choix unique",     i: "⭕" },
  { v: "choix_multiple", l: "Choix multiple",   i: "☑️" },
  { v: "liste",          l: "Liste déroulante", i: "📋" },
  { v: "oui_non",        l: "Oui / Non",        i: "🔘" },
  { v: "echelle",        l: "Échelle 1-10",     i: "📊" },
  { v: "note",           l: "Note (étoiles)",   i: "⭐" },
  { v: "centre",         l: "Centre BET",       i: "🏢" },
  { v: "section",        l: "Titre de section", i: "➖" },
  { v: "information",    l: "Texte explicatif", i: "💡" },
];

/** Les champs qui peuvent alimenter la conversion en dossier. */
const ROLES = [
  { v: "",           l: "- aucun -" },
  { v: "nom",        l: "Nom du prospect" },
  { v: "email",      l: "E-mail" },
  { v: "telephone",  l: "Téléphone" },
  { v: "centre",     l: "Centre" },
  { v: "niveau",     l: "Niveau" },
  { v: "type_cours", l: "Type de cours" },
];

const SUPPORTS = [
  { v: "affiche",  l: "Affiche" },   { v: "flyer",    l: "Flyer" },
  { v: "stand",    l: "Stand" },     { v: "whatsapp", l: "WhatsApp" },
  { v: "reseaux",  l: "Réseaux sociaux" }, { v: "email", l: "E-mail" },
  { v: "sms",      l: "SMS" },       { v: "site",     l: "Site web" },
  { v: "autre",    l: "Autre" },
];

const STATUT_REPONSE = {
  nouvelle:  { l: "Nouvelle",  c: "#1d4ed8", f: "#dbeafe" },
  vue:       { l: "Vue",       c: "#475569", f: "#f1f5f9" },
  en_cours:  { l: "En cours",  c: "#b45309", f: "#fef3c7" },
  convertie: { l: "Convertie", c: "#15803d", f: "#dcfce7" },
  doublon:   { l: "Doublon",   c: "#64748b", f: "#f1f5f9" },
  rejetee:   { l: "Rejetée",   c: "#b91c1c", f: "#fee2e2" },
};

/** L'image du QR n'est jamais stockée : elle se regénère depuis l'URL, qui est la vérité. */
const urlQr = (lien, taille = 300) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${taille}x${taille}&margin=10&data=${encodeURIComponent(lien)}`;


/* ── Briques d'affichage ──────────────────────────────────────────────────────
   DÉFINIES AU NIVEAU MODULE, et c'est tout l'objet de ce déplacement. Elles vivaient
   à l'intérieur des composants qui les utilisent : à chaque frappe dans un champ, le
   parent se re-rendait, ces fonctions étaient recréées, et React - qui identifie un
   composant par sa référence - démontait puis remontait tout leur sous-arbre. L'input
   était donc détruit à chaque lettre : le curseur sautait et, sur mobile, le clavier
   se refermait. Déclarées une fois pour toutes, leur identité ne change plus.
   Les deux `Ligne` et les deux `Bloc` étaient homonymes sans être identiques : ils
   portent maintenant le nom de leur rôle. ── */

const LigneReglage = ({ label, aide, children }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 5 }}>{label}</label>
    {aide && <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>{aide}</div>}
    {children}
  </div>
);


const Etape = ({ n, titre, children }) => (
  <div style={{ display: "flex", gap: 11, marginBottom: 13 }}>
    <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 99, background: "#0f172a", color: "#fff",
      fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</div>
    <div style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.65 }}>
      <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 2 }}>{titre}</div>
      {children}
    </div>
  </div>
);


const LigneStat = ({ n, l, c = "#0f172a" }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0", borderBottom: "1px solid #f1f5f9" }}>
    <span style={{ fontSize: 12.5, color: "#64748b" }}>{l}</span>
    <strong style={{ fontSize: 15, color: c, fontVariantNumeric: "tabular-nums" }}>{n}</strong>
  </div>
);


const Chiffre = ({ n, l, c }) => (
  <div style={{ flex: 1, minWidth: 96, textAlign: "center" }}>
    <div style={{ fontSize: 21, fontWeight: 900, color: c, fontVariantNumeric: "tabular-nums" }}>{n}</div>
    <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>{l}</div>
  </div>
);


const BlocStat = ({ n, l, c }) => (
  <div style={{ flex: 1, minWidth: 110, background: "#f8fafc", borderRadius: 10, padding: "13px 15px", textAlign: "center" }}>
    <div style={{ fontSize: 24, fontWeight: 900, color: c }}>{n}</div>
    <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>{l}</div>
  </div>
);


export default function CampagnesCollecte({ apiUrl, accent = "#db2777" }) {
  /* LE MODAL MAISON, PAS `window.confirm`. Il est déjà la convention du dashboard
     (`contexts/ConfirmContext`) : même rendu partout, bouton rouge pour ce qui détruit,
     et il n'est pas bloquant. Les dialogues natifs du navigateur ne se stylent pas et
     détonnent avec le reste de l'écran. */
  const confirm = useConfirm();
  const jeton = () => localStorage.getItem("admin_token");
  const hdr = useCallback(() => ({
    Authorization: `Bearer ${jeton()}`, "Content-Type": "application/json",
  }), []);

  const [vue, setVue] = useState("campagnes");      // campagnes | formulaire | reponses
  const [campagnes, setCampagnes] = useState([]);
  const [formulaires, setFormulaires] = useState([]);
  const [chargement, setChargement] = useState(false);

  const [formOuvert, setFormOuvert] = useState(null);   // { formulaire, champs, diffusions }
  const [ongletForm, setOngletForm] = useState("questions"); // questions | diffusion | reglages

  const [reponses, setReponses] = useState([]);
  const [totalRep, setTotalRep] = useState(0);
  const [pageRep, setPageRep]   = useState(1);
  const [filtreDiff, setFiltreDiff] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("");
  const [repOuverte, setRepOuverte] = useState(null);

  const [qrOuvert, setQrOuvert] = useState(null);

  /* Tout passe par des MODALS : la page ne garde que la liste des campagnes. Trois
     formulaires de creation empiles au-dessus noyaient l'essentiel sous l'accessoire. */
  const [modalCampagne, setModalCampagne] = useState(null);
  const [modalSuppr,    setModalSuppr]    = useState(null);   // { campagne, formulaires, reponses, visites }
  const [modalForm, setModalForm]         = useState(null);
  const [modalReponses, setModalReponses] = useState(false);
  const [modalWhatsapp, setModalWhatsapp] = useState(null);
  // Deux canaux, un seul vivier : on relance la MEME selection par e-mail ou par WhatsApp,
  // selon ce dont on dispose - tout le monde ne laisse pas son numero.
  const [modalEmail, setModalEmail]       = useState(null);

  /* Les statistiques des relances. Une recolte recoit PLUSIEURS campagnes, et une
     campagne peut viser plusieurs recoltes : la liste est donc chargee globalement
     puis filtree sur la recolte ouverte, jamais attachee a une seule. */
  const [stats, setStats] = useState(null);
  const [perf, setPerf]   = useState([]);
  const [export_, setExport_] = useState(false);   // un export en cours
  const [modalContacts, setModalContacts] = useState(null);   // { lignes, titre }

  /* ── Chargements ─────────────────────────────────────────────── */
  const chargerCampagnes = useCallback(async () => {
    setChargement(true);
    try {
      const [rc, rf] = await Promise.all([
        fetch(`${apiUrl}/api/campagnes`, { headers: hdr() }),
        fetch(`${apiUrl}/api/campagnes/formulaires`, { headers: hdr() }),
      ]);
      setCampagnes((await rc.json()).campagnes || []);
      setFormulaires((await rf.json()).formulaires || []);
    } catch { toast.error("Chargement impossible"); }
    finally { setChargement(false); }
  }, [apiUrl, hdr]);

  useEffect(() => { chargerCampagnes(); }, [chargerCampagnes]);

  /**
   * Les statistiques des campagnes et la performance des canaux.
   *
   * En PARALLELE et non l'une apres l'autre : l'ecran les affiche ensemble, et deux
   * allers-retours en serie coutent deux fois la latence pour un seul affichage.
   */
  const chargerStats = useCallback(async (formulaireId) => {
    try {
      const [rs, rp] = await Promise.all([
        fetch(`${apiUrl}/api/campagnes/statistiques?formulaire_id=${formulaireId}`, { headers: hdr() }),
        fetch(`${apiUrl}/api/campagnes/performance?formulaire_id=${formulaireId}`, { headers: hdr() }),
      ]);
      setStats(rs.ok ? await rs.json() : null);
      setPerf(rp.ok ? ((await rp.json()).performance || []) : []);
    } catch { /* l'ecran reste utilisable sans les statistiques */ }
  }, [apiUrl, hdr]);

  /** Ce que l'export doit annoncer en tete : la selection reellement exportee. */
  const filtresLisibles = () => {
    const bouts = [];
    const d = (formOuvert?.diffusions || []).find(x => x.id === filtreDiff);
    if (d) bouts.push(`Canal : ${d.libelle} (${d.code})`);
    if (filtreStatut) bouts.push(`Statut : ${STATUT_REPONSE[filtreStatut]?.l || filtreStatut}`);
    return bouts.join("  ·  ") || "Toutes les réponses";
  };

  /**
   * Les donnees d'export, recuperees au CLIC et non gardees en memoire.
   *
   * Elles contiennent toutes les reponses a toutes les questions : les garder chargees
   * en permanence alourdirait un ecran qu'on ouvre surtout pour consulter.
   */
  const donneesExport = async () => {
    const q = new URLSearchParams({ formulaire_id: formOuvert?.formulaire?.id || "" });
    if (filtreDiff)   q.set("diffusion_id", filtreDiff);
    if (filtreStatut) q.set("statut", filtreStatut);
    const r = await fetch(`${apiUrl}/api/campagnes/export/reponses?${q}`, { headers: hdr() });
    if (!r.ok) throw new Error((await r.json()).error || "Export impossible");
    return r.json();
  };

  /**
   * Prepare l'export des numeros vers le carnet d'adresses.
   *
   * Passe par un MODAL plutot que de telecharger directement : la diffusion WhatsApp
   * obeit a des regles qui decident si elle arrive ou non - 256 par liste, et le
   * destinataire doit avoir enregistre le numero de BET. Les taire ferait partir des
   * campagnes qui n'atteignent personne, sans la moindre alerte.
   */
  const ouvrirContacts = async () => {
    setExport_(true);
    try {
      const d = await donneesExport();
      setModalContacts({ lignes: d.lignes || [], titre: formOuvert?.formulaire?.titre });
    } catch (e) { toast.error(e.message || "Lecture impossible"); }
    finally { setExport_(false); }
  };

  const exporter = async (format) => {
    setExport_(true);
    try {
      const donnees = await donneesExport();
      const commun = {
        titre: formOuvert?.formulaire?.titre,
        filtresLisibles: filtresLisibles(),
        exportData: donnees, stats, performance: perf,
      };
      if (format === "excel") exporterCampagnesExcel(commun);
      else await exporterCampagnesPdf(commun);
      toast.success(`Export ${format === "excel" ? "Excel" : "PDF"} généré ✓`);
      if (donnees.tronque) toast.info("Export limité aux 5 000 réponses les plus récentes.");
    } catch (e) { toast.error(e.message || "Export impossible"); }
    finally { setExport_(false); }
  };

  const ouvrirFormulaire = async (id) => {
    try {
      const r = await fetch(`${apiUrl}/api/campagnes/formulaires/${id}`, { headers: hdr() });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || "Erreur"); return; }
      setFormOuvert(d);
      setOngletForm("questions");
      setVue("formulaire");
    } catch { toast.error("Erreur réseau"); }
  };

  const chargerReponses = useCallback(async (formulaireId, page = 1) => {
    const p = new URLSearchParams({ page, limit: 25 });
    if (formulaireId) p.set("formulaire_id", formulaireId);
    if (filtreDiff)   p.set("diffusion_id", filtreDiff);
    if (filtreStatut) p.set("statut", filtreStatut);
    try {
      const r = await fetch(`${apiUrl}/api/campagnes/reponses?${p}`, { headers: hdr() });
      const d = await r.json();
      setReponses(d.reponses || []);
      setTotalRep(d.total || 0);
      setPageRep(page);
    } catch { toast.error("Chargement des réponses impossible"); }
  }, [apiUrl, hdr, filtreDiff, filtreStatut]);

  /* ── Actions ─────────────────────────────────────────────────── */
  const creerCampagne = async (v) => {
    if (!(await confirm("La campagne sera créée et pourra recevoir des formulaires.",
      { titre: "Créer cette campagne ?", confirmLabel: "Créer", danger: false }))) return;

    const r = await fetch(`${apiUrl}/api/campagnes`, {
      method: "POST", headers: hdr(),
      body: JSON.stringify({ ...v, nom: (v.nom || "").trim(), statut: "active" }),
    });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error || "Erreur"); return; }
    setModalCampagne(null); toast.success("Campagne créée ✓"); chargerCampagnes();
  };

  /* MODIFIER une campagne : le serveur savait déjà le faire (PATCH /campagnes/:id), aucun
     écran ne l'appelait. Le même modal sert à créer et à éditer - un second, presque
     identique, aurait divergé du premier à la première correction. */
  const enregistrerCampagne = async (v) => {
    if (!(await confirm("Les modifications de cette campagne seront enregistrées.",
      { titre: "Enregistrer cette campagne ?", confirmLabel: "Enregistrer", danger: false }))) return;

    if (!v.id) return creerCampagne(v);
    const r = await fetch(`${apiUrl}/api/campagnes/${v.id}`, {
      method: "PATCH", headers: hdr(),
      body: JSON.stringify({
        nom: (v.nom || "").trim(), statut: v.statut || "active",
        date_debut: v.date_debut || null, date_fin: v.date_fin || null,
        objectif_reponses: v.objectif_reponses === "" ? null : Number(v.objectif_reponses),
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(d.error || "Erreur"); return; }
    setModalCampagne(null); toast.success("Campagne modifiée ✓"); chargerCampagnes();
  };

  /* SUPPRIMER : le serveur compte d'abord et répond 409 tant qu'on n'a pas confirmé.
     On n'invente donc AUCUN chiffre ici - on affiche ceux qu'il renvoie, puis on
     redemande avec `force=1`. Les réponses déjà collectées survivent ; ce qui se perd,
     c'est leur rattachement à la campagne, c'est-à-dire la mesure de provenance. */
  const supprimerCampagne = async (c, force = false) => {
    /* `force` vient de la seconde confirmation, celle qui affiche les chiffres du serveur :
       on ne redemande donc pas. Mais le PREMIER appel partait sans rien demander — une
       campagne sans réponse était supprimée au clic, sans retour possible. */
    if (!force && !(await confirm(
      `La campagne « ${c.nom} » et son lien de collecte seront supprimés.`,
      { titre: "Supprimer cette campagne ?", confirmLabel: "Supprimer" }))) return;
    const r = await fetch(`${apiUrl}/api/campagnes/${c.id}${force ? "?force=1" : ""}`, {
      method: "DELETE", headers: hdr(),
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 409 && d.confirmation_requise) { setModalSuppr({ campagne: c, ...d }); return; }
    if (!r.ok) { toast.error(d.error || "Suppression impossible"); return; }
    setModalSuppr(null);
    toast.success(d.reponses_conservees
      ? `Campagne supprimée - ${d.reponses_conservees} réponse(s) conservée(s) ✓`
      : "Campagne supprimée ✓");
    chargerCampagnes();
  };

  const creerFormulaire = async (v) => {
    if (!(await confirm("Le formulaire sera créé, en brouillon : il ne sera public qu’une fois publié.",
      { titre: "Créer ce formulaire ?", confirmLabel: "Créer", danger: false }))) return;

    const r = await fetch(`${apiUrl}/api/campagnes/formulaires`, {
      method: "POST", headers: hdr(),
      body: JSON.stringify({ titre: (v.titre || "").trim(), campagne_id: v.campagne_id || null, description: v.description || null }),
    });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error || "Erreur"); return; }
    setModalForm(null);
    toast.success("Formulaire créé ✓");
    chargerCampagnes();
    // On enchaine sur l'edition : un formulaire sans question ne sert a rien, et le
    // laisser dans la liste ferait perdre le fil de ce qu'on etait en train de faire.
    ouvrirFormulaire(d.formulaire.id);
  };

  /* `dejaConfirme` existe parce que ce même enregistrement sert à DEUX gestes : les
     réglages, et le bouton Publier/Fermer qui pose déjà sa propre question — plus précise,
     puisqu'elle parle du QR code. Sans ce drapeau, publier demanderait deux confirmations
     d'affilée, ce qui apprend surtout à cliquer sans lire. */
  const majFormulaire = async (maj, dejaConfirme = false) => {
    if (!dejaConfirme && !(await confirm("Les réglages de ce formulaire seront enregistrés.",
      { titre: "Enregistrer les réglages ?", confirmLabel: "Enregistrer", danger: false }))) return false;
    const r = await fetch(`${apiUrl}/api/campagnes/formulaires/${formOuvert.formulaire.id}`, {
      method: "PATCH", headers: hdr(), body: JSON.stringify(maj),
    });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error || "Erreur"); return false; }
    setFormOuvert(p => ({ ...p, formulaire: d.formulaire }));
    chargerCampagnes();
    return true;
  };

  const enregistrerChamps = async () => {
    /* L’éditeur de questions est l’endroit où l’on enchaîne le plus de sauvegardes ;
       la confirmation y a donc été ajoutée en connaissance de cause, sur demande. */
    if (!(await confirm("Les questions de ce formulaire seront remplacées par celles affichées à l’écran.",
      { titre: "Enregistrer les questions ?", confirmLabel: "Enregistrer", danger: false }))) return;

    const r = await fetch(`${apiUrl}/api/campagnes/formulaires/${formOuvert.formulaire.id}/champs`, {
      method: "PUT", headers: hdr(), body: JSON.stringify({ champs: formOuvert.champs }),
    });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error || "Erreur"); return; }
    setFormOuvert(p => ({ ...p, champs: d.champs }));
    toast.success("Questions enregistrées ✓");
  };

  const ajouterDiffusion = async (payload) => {
    if (!(await confirm("Un canal et son code de suivi seront créés : c’est lui qui dira d’où viennent les inscriptions.",
      { titre: "Créer ce canal ?", confirmLabel: "Créer", danger: false }))) return;

    const r = await fetch(`${apiUrl}/api/campagnes/formulaires/${formOuvert.formulaire.id}/diffusions`, {
      method: "POST", headers: hdr(), body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error || "Erreur"); return; }
    setFormOuvert(p => ({ ...p, diffusions: [...p.diffusions, d.diffusion] }));
    toast.success(`Canal créé - code ${d.diffusion.code} ✓`);
  };

  const lienDiffusion = (d) =>
    `${PUBLIC_URL}/f/${formOuvert.formulaire.slug}${d ? `?d=${d.code}` : ""}`;

  const copier = (texte) => {
    navigator.clipboard?.writeText(texte)
      .then(() => toast.success("Lien copié ✓"))
      .catch(() => toast.error("Copie impossible"));
  };

  /* ── Styles partagés ─────────────────────────────────────────── */
  const carte = { background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 20 };
  const champ = { padding: "9px 12px", borderRadius: 9, border: "1.5px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" };
  const bouton = (couleur = accent) => ({ padding: "9px 16px", borderRadius: 9, border: "none", background: couleur, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" });

  /* ══════════════ VUE 1 - LISTE ══════════════ */
  if (vue === "campagnes") {
    const parCampagne = {};
    formulaires.forEach(f => { (parCampagne[f.campagne_id || "_"] ||= []).push(f); });

    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#0f172a" }}>📋 Campagnes de collecte</h3>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Formulaires par QR code et lien partageable - et d'où viennent vraiment vos inscriptions.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setModalCampagne({ nom: "", date_debut: "", date_fin: "", objectif_reponses: "" })}
              style={{ ...bouton("#f1f5f9"), color: "#374151" }}>🎯 Nouvelle campagne</button>
            <button onClick={() => setModalForm({ titre: "", campagne_id: "", description: "" })}
              style={bouton()}>+ Nouveau formulaire</button>
            <button onClick={chargerCampagnes} style={{ ...bouton("#f1f5f9"), color: "#374151" }}>↻</button>
          </div>
        </div>

        {chargement && <div style={{ textAlign: "center", padding: 30, color: "#9ca3af", fontSize: 13 }}>Chargement…</div>}

        {!chargement && formulaires.length === 0 && (
          <div style={{ ...carte, textAlign: "center", padding: 44, color: "#9ca3af" }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>📋</div>
            <div style={{ fontWeight: 700, color: "#374151", marginBottom: 5 }}>Aucun formulaire pour le moment</div>
            <div style={{ fontSize: 13, marginBottom: 16 }}>Créez-en un, ajoutez vos questions, puis générez un QR par support.</div>
            <button onClick={() => setModalForm({ titre: "", campagne_id: "", description: "" })} style={bouton()}>
              + Créer mon premier formulaire
            </button>
          </div>
        )}

        {/* ── LA LISTE EN TABLEAU ────────────────────────────────────────────────────────
            Les formulaires étaient présentés en cartes : jolies, mais on ne pouvait rien y
            comparer. Les chiffres qui comptent ici — réponses, visites, canaux — se lisent
            en colonne, pas en cherchant trois nombres au milieu de chaque carte. Un tableau
            les aligne, et tient dix campagnes dans la hauteur qu'une grille donnait à trois.

            UN SEUL TABLEAU, avec une ligne de groupe par campagne. Découper en un tableau
            par campagne répéterait l'en-tête à chaque fois et casserait justement
            l'alignement qu'on vient de gagner. La ligne de groupe porte le nom de la
            campagne, son statut et ses deux actions. */}
        {!chargement && formulaires.length > 0 && (
          <div style={{ ...carte, padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Formulaire", "Statut", "Réponses", "Visites", "Canaux", ""].map((t, i) => (
                    <th key={t + i} style={{
                      padding: "11px 14px", textAlign: i >= 2 && i <= 4 ? "right" : "left",
                      fontSize: 11, fontWeight: 800, color: "#64748b",
                      textTransform: "uppercase", letterSpacing: ".04em",
                      borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap",
                    }}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...campagnes, { id: "_", nom: "Sans campagne", _orphelin: true }].map(c => {
                  const liste = parCampagne[c.id] || [];
                  if (!liste.length) return null;
                  return (
                    <React.Fragment key={c.id}>
                      <tr style={{ background: "#f1f5f9" }}>
                        <td colSpan={6} style={{ padding: "9px 14px", borderBottom: "1px solid #e2e8f0" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 13.5, fontWeight: 800, color: c._orphelin ? "#94a3b8" : "#0f172a" }}>
                              {c._orphelin ? "📄 " : "🎯 "}{c.nom}
                            </span>
                            {!c._orphelin && c.statut && (
                              <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: "#fff", color: "#475569", border: "1px solid #e2e8f0" }}>{c.statut}</span>
                            )}
                            {/* « Sans campagne » n'est pas une campagne : c'est le fourre-tout des
                                formulaires qui n'en ont pas. Rien à y modifier ni à y supprimer. */}
                            {!c._orphelin && (
                              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                                <button onClick={() => setModalCampagne({
                                    id: c.id, nom: c.nom || "", statut: c.statut || "active",
                                    date_debut: (c.date_debut || "").slice(0, 10),
                                    date_fin:   (c.date_fin   || "").slice(0, 10),
                                    objectif_reponses: c.objectif_reponses ?? "",
                                  })}
                                  title="Modifier cette campagne"
                                  style={{ padding: "4px 11px", borderRadius: 7, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                                  ✏️ Modifier
                                </button>
                                <button onClick={() => supprimerCampagne(c)}
                                  title="Supprimer cette campagne"
                                  style={{ padding: "4px 11px", borderRadius: 7, border: "1px solid #fecaca", background: "#fff", color: "#b91c1c", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                                  🗑 Supprimer
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>

                      {liste.map(f => (
                        <tr key={f.id} onClick={() => ouvrirFormulaire(f.id)}
                          style={{ cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}
                          onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <td style={{ padding: "11px 14px" }}>
                            <div style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a" }}>{f.titre}</div>
                            <div style={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8", marginTop: 2 }}>/f/{f.slug}</div>
                            {/* Les non-lues restent SOUS le titre et non dans leur propre colonne :
                                elles sont rares, une colonne vide sur toute la hauteur pour un
                                compteur occasionnel coûterait plus qu'elle ne rapporte. */}
                            {f.nouvelles > 0 && (
                              <div style={{ marginTop: 4, fontSize: 11.5, fontWeight: 700, color: "#1d4ed8" }}>
                                🔔 {f.nouvelles} réponse{f.nouvelles > 1 ? "s" : ""} non lue{f.nouvelles > 1 ? "s" : ""}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "11px 14px" }}>
                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 9px", borderRadius: 99, whiteSpace: "nowrap",
                              background: f.statut === "publie" ? "#dcfce7" : f.statut === "ferme" ? "#fee2e2" : "#fef9c3",
                              color: f.statut === "publie" ? "#15803d" : f.statut === "ferme" ? "#b91c1c" : "#a16207" }}>
                              {f.statut === "publie" ? "Publié" : f.statut === "ferme" ? "Fermé" : "Brouillon"}
                            </span>
                          </td>
                          <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 15, fontWeight: 800, color: accent, fontVariantNumeric: "tabular-nums" }}>
                            {f.reponses}
                          </td>
                          <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 13.5, color: "#475569", fontVariantNumeric: "tabular-nums" }}>
                            {f.visites}
                          </td>
                          <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 13.5, color: "#475569", fontVariantNumeric: "tabular-nums" }}>
                            {f.diffusions}
                          </td>
                          <td style={{ padding: "11px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: accent }}>Ouvrir →</span>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* CONFIRMATION DE SUPPRESSION - avec les chiffres RENVOYÉS PAR LE SERVEUR, jamais
            devinés ici. Elle dit ce qui disparaît et ce qui reste : l'écueil serait de
            laisser croire que les inscriptions collectées partent avec la campagne. */}
        {modalSuppr && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", zIndex: 9800, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
            onClick={e => { if (e.target === e.currentTarget) setModalSuppr(null); }}>
            <div style={{ background: "#fff", borderRadius: 16, maxWidth: 480, width: "100%", padding: 26 }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>⚠️</div>
              <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 800, color: "#0f172a" }}>
                Supprimer « {modalSuppr.campagne.nom} » ?
              </h3>
              <p style={{ margin: "0 0 14px", fontSize: 13, color: "#475569", lineHeight: 1.6 }}>
                Cette campagne a déjà collecté des données :
              </p>
              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                {[
                  { n: modalSuppr.reponses,    l: "réponse",    c: "#b91c1c" },
                  { n: modalSuppr.visites,     l: "visite",     c: "#b45309" },
                  { n: modalSuppr.formulaires, l: "formulaire", c: "#475569" },
                ].map(x => (
                  <div key={x.l} style={{ flex: "1 1 110px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: 19, fontWeight: 800, color: x.c }}>{x.n}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{x.l}{x.n > 1 ? "s" : ""}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 13px", fontSize: 12, color: "#166534", lineHeight: 1.6, marginBottom: 18 }}>
                <strong>Les réponses collectées sont conservées</strong> - elles ne sont pas effacées avec la campagne.
                En revanche, <strong>on perdra le lien entre ces inscriptions et cette campagne</strong> : impossible,
                ensuite, de savoir qu'elles en proviennent.
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setModalSuppr(null)}
                  style={{ padding: "9px 18px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Annuler
                </button>
                <button onClick={() => supprimerCampagne(modalSuppr.campagne, true)}
                  style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: "#dc2626", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Supprimer quand même
                </button>
              </div>
            </div>
          </div>
        )}

        {modalCampagne && (
          <ModalSimple titre={modalCampagne.id ? "✏️ Modifier la campagne" : "🎯 Nouvelle campagne"}
            aide="Un regroupement - « Rentrée septembre 2026 ». Un formulaire peut aussi vivre sans campagne."
            onFermer={() => setModalCampagne(null)}
            onValider={() => enregistrerCampagne(modalCampagne)}
            valide={!!modalCampagne.nom.trim()}
            carte={carte} bouton={bouton} accent={accent}>
            <Champ label="Nom de la campagne">
              <input autoFocus value={modalCampagne.nom} onChange={e => setModalCampagne(p => ({ ...p, nom: e.target.value }))}
                placeholder="Ex. Rentrée septembre 2026" style={{ ...champ, width: "100%" }} />
            </Champ>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Champ label="Début" style={{ flex: "1 1 130px" }}>
                <input type="date" value={modalCampagne.date_debut} onChange={e => setModalCampagne(p => ({ ...p, date_debut: e.target.value }))} style={{ ...champ, width: "100%" }} />
              </Champ>
              <Champ label="Fin" style={{ flex: "1 1 130px" }}>
                <input type="date" value={modalCampagne.date_fin} onChange={e => setModalCampagne(p => ({ ...p, date_fin: e.target.value }))} style={{ ...champ, width: "100%" }} />
              </Champ>
              <Champ label="Objectif de réponses" style={{ flex: "1 1 130px" }}>
                <input type="number" value={modalCampagne.objectif_reponses} onChange={e => setModalCampagne(p => ({ ...p, objectif_reponses: e.target.value }))}
                  placeholder="Ex. 150" style={{ ...champ, width: "100%" }} />
              </Champ>
            </div>
          </ModalSimple>
        )}

        {modalForm && (
          <ModalSimple titre="+ Nouveau formulaire"
            aide="C'est la page qu'ouvriront vos QR codes. Vous ajouterez les questions juste après."
            onFermer={() => setModalForm(null)}
            onValider={() => creerFormulaire(modalForm)}
            valide={!!modalForm.titre.trim()}
            carte={carte} bouton={bouton} accent={accent}>
            <Champ label="Titre du formulaire">
              <input autoFocus value={modalForm.titre} onChange={e => setModalForm(p => ({ ...p, titre: e.target.value }))}
                placeholder="Ex. Inscription - Rentrée 2026" style={{ ...champ, width: "100%" }} />
            </Champ>
            <Champ label="Rattacher à une campagne">
              <select value={modalForm.campagne_id} onChange={e => setModalForm(p => ({ ...p, campagne_id: e.target.value }))} style={{ ...champ, width: "100%" }}>
                <option value="">- Sans campagne -</option>
                {campagnes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </Champ>
            <Champ label="Description" aide="Affichée sous le titre, sur la page publique.">
              <textarea value={modalForm.description} onChange={e => setModalForm(p => ({ ...p, description: e.target.value }))}
                rows={3} placeholder="Laissez-nous vos coordonnées, nous vous rappelons sous 24h." style={{ ...champ, width: "100%" }} />
            </Champ>
          </ModalSimple>
        )}
      </div>
    );
  }

  /* ══════════════ VUE 2 - UN FORMULAIRE ══════════════ */
  if (vue === "formulaire" && formOuvert) {
    const f = formOuvert.formulaire;
    const publie = f.statut === "publie";
    const pages = Math.max(1, Math.ceil(totalRep / 25));

    return (
      <div>
        <button onClick={() => { setVue("campagnes"); chargerCampagnes(); }}
          style={{ ...bouton("#f1f5f9"), color: "#374151", marginBottom: 14 }}>← Toutes les campagnes</button>

        <div style={{ ...carte, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ minWidth: 240 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#0f172a" }}>{f.titre}</h3>
              <div style={{ fontFamily: "monospace", fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                {PUBLIC_URL}/f/{f.slug}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => { setFiltreDiff(""); setFiltreStatut(""); chargerReponses(f.id, 1); chargerStats(f.id); setModalReponses(true); }}
                style={bouton("#0891b2")}>📥 Voir les réponses</button>
              <button onClick={async () => {
                /* CE BOUTON AGIT SUR LE PUBLIC, et c'est ce qui justifie la confirmation :
                   publier rend le QR actif pour tout le monde, fermer coupe net une collecte
                   en cours — les affiches déjà distribuées, elles, ne se rappellent pas. */
                if (!(await confirm(
                  publie
                    ? "Le QR code et le lien cesseront de fonctionner. Les affiches déjà distribuées mèneront à un formulaire fermé."
                    : "Le QR code et le lien deviendront actifs : n'importe qui pourra répondre.",
                  { titre: publie ? "Fermer ce formulaire ?" : "Publier ce formulaire ?",
                    confirmLabel: publie ? "Fermer" : "Publier", danger: publie }))) return;
                const ok = await majFormulaire({ statut: publie ? "ferme" : "publie" }, true);
                if (ok) toast.success(publie ? "Formulaire fermé" : "Formulaire publié - le QR est actif ✓");
              }} style={bouton(publie ? "#b45309" : "#15803d")}>
                {publie ? "Fermer" : "Publier"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {[{ v: "questions", l: "❓ Questions" }, { v: "diffusion", l: "📱 QR & liens" }, { v: "reglages", l: "⚙️ Réglages" }].map(o => (
            <button key={o.v} onClick={() => setOngletForm(o.v)}
              style={{ padding: "8px 16px", borderRadius: 9, border: `1.5px solid ${ongletForm === o.v ? accent : "#e2e8f0"}`,
                background: ongletForm === o.v ? `${accent}12` : "#fff",
                color: ongletForm === o.v ? accent : "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{o.l}</button>
          ))}
        </div>

        {ongletForm === "questions" && (
          <EditeurChamps
            champs={formOuvert.champs}
            onChange={champs => setFormOuvert(p => ({ ...p, champs }))}
            onEnregistrer={enregistrerChamps}
            accent={accent} carte={carte} champ={champ} bouton={bouton}
          />
        )}

        {ongletForm === "diffusion" && (
          <Diffusions
            diffusions={formOuvert.diffusions} lien={lienDiffusion} onAjouter={ajouterDiffusion}
            onCopier={copier} onQr={setQrOuvert} publie={publie}
            accent={accent} carte={carte} champ={champ} bouton={bouton}
          />
        )}

        {ongletForm === "reglages" && (
          <Reglages formulaire={f} onMaj={majFormulaire} carte={carte} champ={champ} bouton={bouton} accent={accent} />
        )}

        {/* RÉPONSES - en modal : on ne quitte plus le formulaire pour les consulter,
            et le bouton WhatsApp agit sur la SÉLECTION affichée, filtres compris. */}
        {modalReponses && (
          <div onClick={e => { if (e.target === e.currentTarget) setModalReponses(false); }}
            style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:9800, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"3vh 2vw", overflowY:"auto" }}>
            <div style={{ background:"#f8fafc", borderRadius:16, width:"90vw", maxWidth:1500, minHeight:"90vh", padding:"24px 26px 28px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:16, flexWrap:"wrap" }}>
                <div>
                  <div style={{ fontSize:17, fontWeight:800, color:"#0f172a" }}>📥 Réponses - {f.titre}</div>
                  <div style={{ fontSize:12.5, color:"#64748b", marginTop:3 }}>
                    Filtrez par canal, relancez cette sélection par e-mail ou WhatsApp, puis exportez.
                  </div>
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <button onClick={() => setModalEmail({ formulaire_id: f.id, diffusion_id: filtreDiff, statut: filtreStatut, titre: f.titre })}
                    style={bouton("#0891b2")}>✉️ Campagne e-mail</button>
                  <button onClick={() => setModalWhatsapp({ formulaire_id: f.id, diffusion_id: filtreDiff, statut: filtreStatut, titre: f.titre })}
                    style={bouton("#25D366")}>📱 Campagne WhatsApp</button>

                  {/* Les exports portent sur la SELECTION AFFICHEE, filtres compris -
                      c'est le sens des filtres poses juste en dessous. */}
                  <button onClick={() => exporter("excel")} disabled={export_ || !reponses.length}
                    title="Réponses, campagnes et canaux - la sélection affichée"
                    style={{ ...bouton(export_ || !reponses.length ? "#cbd5e1" : "#16a34a") }}>
                    {export_ ? "…" : "📊 Excel"}
                  </button>
                  <button onClick={() => exporter("pdf")} disabled={export_ || !reponses.length}
                    title="Rapport imprimable de cette sélection"
                    style={{ ...bouton(export_ || !reponses.length ? "#cbd5e1" : "#b91c1c") }}>
                    {export_ ? "…" : "📄 PDF"}
                  </button>
                  <button onClick={ouvrirContacts} disabled={export_ || !reponses.length}
                    title="Numéros à importer dans le téléphone, pour une liste de diffusion WhatsApp"
                    style={{ ...bouton(export_ || !reponses.length ? "#cbd5e1" : "#475569") }}>
                    {export_ ? "…" : "📇 Contacts WhatsApp"}
                  </button>

                  <button onClick={() => setModalReponses(false)} style={{ ...bouton("#e2e8f0"), color:"#374151" }}>✕</button>
                </div>
              </div>
      <div style={{ ...carte, marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#475569" }}>Canal :</span>
        <select value={filtreDiff} onChange={e => { setFiltreDiff(e.target.value); }} style={{ ...champ, minWidth: 180 }}>
          <option value="">Tous les canaux</option>
          {(formOuvert?.diffusions || []).map(d => <option key={d.id} value={d.id}>{d.libelle} ({d.code})</option>)}
        </select>
        <select value={filtreStatut} onChange={e => { setFiltreStatut(e.target.value); }} style={{ ...champ, minWidth: 150 }}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUT_REPONSE).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
        </select>
        <button onClick={() => chargerReponses(f?.id, 1)} style={bouton()}>Filtrer</button>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b" }}>
          <strong style={{ color: "#0f172a" }}>{totalRep}</strong> réponse{totalRep !== 1 ? "s" : ""}
        </span>
      </div>

      <StatsCampagnes stats={stats} carte={carte} />

      {reponses.length === 0 ? (
        <div style={{ ...carte, textAlign: "center", padding: 44, color: "#9ca3af" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>📭</div>
          <div style={{ fontWeight: 700, color: "#374151" }}>Aucune réponse pour l'instant</div>
          <div style={{ fontSize: 13, marginTop: 5 }}>Les réponses apparaissent ici dès qu'on scanne le QR et envoie le formulaire.</div>
        </div>
      ) : (
        <div style={{ ...carte, padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                  {["Reçue le", "Nom", "Téléphone", "Canal", "Statut", ""].map(h => (
                    <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reponses.map(r => {
                  const st = STATUT_REPONSE[r.statut] || STATUT_REPONSE.nouvelle;
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9", background: r.statut === "nouvelle" ? "#f8fbff" : "#fff" }}>
                      <td style={{ padding: "11px 14px", color: "#64748b", whiteSpace: "nowrap" }}>
                        {new Date(r.created_at).toLocaleDateString("fr-FR")}<br />
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(r.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                      </td>
                      <td style={{ padding: "11px 14px", fontWeight: 700, color: "#0f172a" }}>{r.nom || "-"}</td>
                      <td style={{ padding: "11px 14px", fontFamily: "monospace", fontSize: 12.5 }}>{r.telephone || "-"}</td>
                      <td style={{ padding: "11px 14px" }}>
                        {r.diffusion ? (
                          <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: "#e0f2fe", color: "#0369a1" }}>
                            {r.diffusion.libelle}
                          </span>
                        ) : <span style={{ color: "#cbd5e1" }}>direct</span>}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: st.f, color: st.c }}>{st.l}</span>
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right" }}>
                        <button onClick={async () => {
                          const rr = await fetch(`${apiUrl}/api/campagnes/reponses/${r.id}`, { headers: hdr() });
                          const dd = await rr.json();
                          if (rr.ok) { setRepOuverte(dd); chargerReponses(f?.id, pageRep); }
                        }} style={{ ...bouton("#f1f5f9"), color: "#374151", padding: "6px 12px" }}>Voir</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div style={{ display: "flex", gap: 6, justifyContent: "center", padding: 14, borderTop: "1px solid #f1f5f9" }}>
              <button disabled={pageRep === 1} onClick={() => chargerReponses(f?.id, pageRep - 1)}
                style={{ ...bouton(pageRep === 1 ? "#f1f5f9" : "#fff"), color: "#374151", border: "1.5px solid #e2e8f0" }}>← Préc.</button>
              <span style={{ padding: "9px 14px", fontSize: 13, color: "#64748b" }}>{pageRep} / {pages}</span>
              <button disabled={pageRep === pages} onClick={() => chargerReponses(f?.id, pageRep + 1)}
                style={{ ...bouton(pageRep === pages ? "#f1f5f9" : "#fff"), color: "#374151", border: "1.5px solid #e2e8f0" }}>Suiv. →</button>
            </div>
          )}
        </div>
      )}

      {repOuverte && (
        <DetailReponse detail={repOuverte} onFermer={() => setRepOuverte(null)}
          onStatut={async (statut) => {
            if (!(await confirm(`Cette réponse passera au statut « ${statut} ».`,
              { titre: "Changer le statut ?", confirmLabel: "Changer", danger: false }))) return;
            const r = await fetch(`${apiUrl}/api/campagnes/reponses/${repOuverte.reponse.id}`, {
              method: "PATCH", headers: hdr(), body: JSON.stringify({ statut }),
            });
            if (r.ok) { toast.success("Statut mis à jour ✓"); setRepOuverte(null); chargerReponses(f?.id, pageRep); }
          }}
          carte={carte} bouton={bouton} accent={accent} />
      )}
            </div>
          </div>
        )}

        {modalEmail && (
          <ModalEmail apiUrl={apiUrl} hdr={hdr} filtres={modalEmail}
            onFermer={() => { setModalEmail(null); if (formOuvert?.formulaire?.id) chargerStats(formOuvert.formulaire.id); }}
            carte={carte} champ={champ} bouton={bouton} />
        )}

        {modalWhatsapp && (
          <ModalWhatsapp apiUrl={apiUrl} hdr={hdr} filtres={modalWhatsapp}
            onFermer={() => { setModalWhatsapp(null); if (formOuvert?.formulaire?.id) chargerStats(formOuvert.formulaire.id); }}
            carte={carte} champ={champ} bouton={bouton} />
        )}

        {modalContacts && (
          <ModalContacts donnees={modalContacts} onFermer={() => setModalContacts(null)}
            carte={carte} bouton={bouton} />
        )}

        {qrOuvert && (
          <div onClick={e => { if (e.target === e.currentTarget) setQrOuvert(null); }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "#fff", borderRadius: 16, padding: 28, textAlign: "center", maxWidth: 420 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#0f172a", marginBottom: 4 }}>{qrOuvert.libelle}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>Code {qrOuvert.code}</div>
              <img src={urlQr(lienDiffusion(qrOuvert), 320)} alt={`QR ${qrOuvert.libelle}`}
                style={{ width: 280, height: 280, display: "block", margin: "0 auto 16px" }} />
              <div style={{ fontSize: 11.5, fontFamily: "monospace", color: "#64748b", wordBreak: "break-all", marginBottom: 16 }}>
                {lienDiffusion(qrOuvert)}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <a href={urlQr(lienDiffusion(qrOuvert), 1000)} target="_blank" rel="noreferrer"
                  style={{ ...bouton("#0891b2"), textDecoration: "none", display: "inline-block" }}>⬇ Télécharger</a>
                <button onClick={() => setQrOuvert(null)} style={{ ...bouton("#f1f5f9"), color: "#374151" }}>Fermer</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Les reponses et la campagne WhatsApp sont des MODALS de la vue « formulaire » :
  // on ne quitte plus l'ecran d'edition pour les consulter.
  return null;
}

/* ══════════════════════════════════════════════════════════════
   L'éditeur de questions
══════════════════════════════════════════════════════════════ */
function EditeurChamps({ champs, onChange, onEnregistrer, accent, carte, champ, bouton }) {
  const maj = (i, cle, v) => onChange(champs.map((c, j) => j === i ? { ...c, [cle]: v } : c));
  const deplacer = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= champs.length) return;
    const copie = [...champs];
    [copie[i], copie[j]] = [copie[j], copie[i]];
    onChange(copie);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={() => onChange([...champs, { libelle: "", type: "texte", obligatoire: false, options: [] }])}
          style={bouton()}>+ Ajouter une question</button>
        <button onClick={onEnregistrer} style={bouton("#15803d")}>💾 Enregistrer</button>
      </div>

      {champs.length === 0 && (
        <div style={{ ...carte, textAlign: "center", padding: 40, color: "#9ca3af" }}>
          Aucune question. Ajoutez-en une pour commencer.
        </div>
      )}

      {champs.map((c, i) => {
        const aOptions = ["choix_unique", "choix_multiple", "liste"].includes(c.type);
        const sansReponse = ["section", "information"].includes(c.type);
        return (
          <div key={c.id || `n${i}`} style={{ ...carte, marginBottom: 10, borderLeft: `4px solid ${sansReponse ? "#cbd5e1" : accent}` }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", minWidth: 24 }}>{i + 1}.</span>
              <input value={c.libelle} onChange={e => maj(i, "libelle", e.target.value)}
                placeholder={sansReponse ? "Titre de la section" : "Votre question"}
                style={{ ...champ, flex: "1 1 220px", fontWeight: 600 }} />
              <select value={c.type} onChange={e => maj(i, "type", e.target.value)} style={{ ...champ, minWidth: 160 }}>
                {TYPES_CHAMP.map(t => <option key={t.v} value={t.v}>{t.i} {t.l}</option>)}
              </select>
              <button onClick={() => deplacer(i, -1)} disabled={i === 0} style={{ ...bouton("#f1f5f9"), color: "#475569", padding: "7px 10px" }}>↑</button>
              <button onClick={() => deplacer(i, 1)} disabled={i === champs.length - 1} style={{ ...bouton("#f1f5f9"), color: "#475569", padding: "7px 10px" }}>↓</button>
              <button onClick={() => onChange(champs.filter((_, j) => j !== i))} style={{ ...bouton("#fee2e2"), color: "#b91c1c", padding: "7px 10px" }}>🗑</button>
            </div>

            <input value={c.aide || ""} onChange={e => maj(i, "aide", e.target.value)}
              placeholder="Précision affichée sous la question (facultatif)"
              style={{ ...champ, width: "100%", marginBottom: 10, fontSize: 12.5 }} />

            {aOptions && (
              <textarea value={(c.options || []).join("\n")}
                onChange={e => maj(i, "options", e.target.value.split("\n").filter(x => x.trim()))}
                placeholder={"Une option par ligne\nAnglais général\nBusiness English"}
                rows={3} style={{ ...champ, width: "100%", marginBottom: 10, fontFamily: "monospace", fontSize: 12.5 }} />
            )}

            {!sansReponse && (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#475569", cursor: "pointer" }}>
                  <input type="checkbox" checked={!!c.obligatoire} onChange={e => maj(i, "obligatoire", e.target.checked)} />
                  Obligatoire
                </label>
                {aOptions && (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#475569", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!c.autre_autorise} onChange={e => maj(i, "autre_autorise", e.target.checked)} />
                    Option « Autre »
                  </label>
                )}
                {/* `role_canonique` est ce qui permettra de convertir la réponse en dossier
                    sans deviner où se trouve le téléphone en lisant les libellés. */}
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#475569" }}>
                  Sert de :
                  <select value={c.role_canonique || ""} onChange={e => maj(i, "role_canonique", e.target.value || null)}
                    style={{ ...champ, padding: "5px 9px", fontSize: 12 }}>
                    {ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>
        );
      })}

      {champs.length > 0 && (
        <button onClick={onEnregistrer} style={{ ...bouton("#15803d"), marginTop: 6 }}>💾 Enregistrer les questions</button>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Les canaux de diffusion - QR et liens
══════════════════════════════════════════════════════════════ */
function Diffusions({ diffusions, lien, onAjouter, onCopier, onQr, publie, accent, carte, champ, bouton }) {
  const [nouv, setNouv] = useState({ libelle: "", format: "qr", support: "affiche", emplacement: "" });

  return (
    <div>
      {!publie && (
        <div style={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 13, color: "#854d0e" }}>
          ⚠️ Ce formulaire est en <strong>brouillon</strong> : les QR fonctionneront seulement une fois publié.
          N'imprimez rien avant de l'avoir publié.
        </div>
      )}

      <div style={{ ...carte, marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>+ Nouveau canal</div>
        <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 12 }}>
          Un canal par support. C'est ce qui permettra de dire quelle affiche a réellement amené des inscriptions.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <input value={nouv.libelle} onChange={e => setNouv(p => ({ ...p, libelle: e.target.value }))}
            placeholder="Ex. Affiche entrée Angré" style={{ ...champ, flex: "1 1 220px" }} />
          <select value={nouv.support} onChange={e => setNouv(p => ({ ...p, support: e.target.value }))} style={{ ...champ, minWidth: 140 }}>
            {SUPPORTS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
          </select>
          <select value={nouv.format} onChange={e => setNouv(p => ({ ...p, format: e.target.value }))} style={{ ...champ, minWidth: 120 }}>
            <option value="qr">QR code</option>
            <option value="lien">Lien</option>
            <option value="mixte">Les deux</option>
          </select>
          <input value={nouv.emplacement} onChange={e => setNouv(p => ({ ...p, emplacement: e.target.value }))}
            placeholder="Emplacement (facultatif)" style={{ ...champ, flex: "1 1 180px" }} />
          <button onClick={() => { if (nouv.libelle.trim()) { onAjouter(nouv); setNouv({ libelle: "", format: "qr", support: "affiche", emplacement: "" }); } }}
            style={bouton()}>+ Créer</button>
        </div>
      </div>

      {diffusions.length === 0 ? (
        <div style={{ ...carte, textAlign: "center", padding: 40, color: "#9ca3af" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>📱</div>
          <div style={{ fontWeight: 700, color: "#374151" }}>Aucun canal</div>
          <div style={{ fontSize: 13, marginTop: 5 }}>Créez-en un par affiche, flyer ou groupe WhatsApp.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
          {diffusions.map(d => (
            <div key={d.id} style={{ ...carte, opacity: d.actif ? 1 : .55 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>{d.libelle}</div>
                <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: accent, flexShrink: 0 }}>{d.code}</span>
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                {SUPPORTS.find(s => s.v === d.support)?.l || d.support}
                {d.emplacement ? ` · ${d.emplacement}` : ""}
                {" · "}<strong>{d.nb_visites}</strong> visite{d.nb_visites !== 1 ? "s" : ""}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {d.format !== "lien" && (
                  <button onClick={() => onQr(d)} style={{ ...bouton("#f1f5f9"), color: "#374151", padding: "7px 12px" }}>📱 QR</button>
                )}
                <button onClick={() => onCopier(lien(d))} style={{ ...bouton("#f1f5f9"), color: "#374151", padding: "7px 12px" }}>🔗 Copier le lien</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Réglages du formulaire
══════════════════════════════════════════════════════════════ */
function Reglages({ formulaire, onMaj, carte, champ, bouton, accent }) {
  const [v, setV] = useState({
    image_url: formulaire.image_url || null,
    illustration_url: formulaire.illustration_url || null,
    description: formulaire.description || "",
    message_merci: formulaire.message_merci || "",
    message_ferme: formulaire.message_ferme || "",
    texte_consentement: formulaire.texte_consentement || "",
    couleur: formulaire.couleur || "#1B3080",
    autoriser_doublons: !!formulaire.autoriser_doublons,
  });


  return (
    <div style={carte}>
      <DepotImage url={v.image_url} onChange={u => setV(p => ({ ...p, image_url: u }))}
        label="Bannière du formulaire"
        aide="L'image d'en-tête, comme l'affiche de la campagne. C'est la première chose que voit la personne qui scanne."
        hauteur={170} bouton={bouton} />

      <LigneReglage label="Présentation de l'offre"
        aide="Affichée sous la bannière. Sauts de ligne, emojis et **gras** sont rendus tels quels sur la page publique.">
        <textarea value={v.description} onChange={e => setV(p => ({ ...p, description: e.target.value }))}
          rows={10}
          placeholder={"🎉 OFFRE EXCEPTIONNELLE\n\n**Pack 3 mois : 150 000 FCFA**\nSeptembre · Octobre · Novembre - et Décembre offert 🎁\n\n📅 Début : septembre 2026"}
          style={{ ...champ, width: "100%", lineHeight: 1.6 }} />
      </LigneReglage>

      <DepotImage url={v.illustration_url} onChange={u => setV(p => ({ ...p, illustration_url: u }))}
        label="Image d'illustration"
        aide="Placée entre la présentation et les questions - le visuel des tarifs ou du programme, par exemple."
        hauteur={170} bouton={bouton} />

      <LigneReglage label="Message de remerciement" aide="Ce que voit la personne après l'envoi.">
        <input value={v.message_merci} onChange={e => setV(p => ({ ...p, message_merci: e.target.value }))} style={{ ...champ, width: "100%" }} />
      </LigneReglage>

      <LigneReglage label="Message une fois la campagne terminée"
        aide="Un QR imprimé survit à la campagne : c'est ce qui s'affichera à qui scanne une affiche oubliée.">
        <input value={v.message_ferme} onChange={e => setV(p => ({ ...p, message_ferme: e.target.value }))} style={{ ...champ, width: "100%" }} />
      </LigneReglage>

      <LigneReglage label="Mention de consentement"
        aide="Sans consentement tracé, aucune relance WhatsApp n'est possible - et écrire sans accord fait bannir le numéro.">
        <input value={v.texte_consentement} onChange={e => setV(p => ({ ...p, texte_consentement: e.target.value }))} style={{ ...champ, width: "100%" }} />
      </LigneReglage>

      <LigneReglage label="Couleur du formulaire">
        <input type="color" value={v.couleur} onChange={e => setV(p => ({ ...p, couleur: e.target.value }))}
          style={{ width: 70, height: 38, border: "1.5px solid #e2e8f0", borderRadius: 9, cursor: "pointer" }} />
      </LigneReglage>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, color: "#475569", cursor: "pointer", marginBottom: 18 }}>
        <input type="checkbox" checked={v.autoriser_doublons} onChange={e => setV(p => ({ ...p, autoriser_doublons: e.target.checked }))} style={{ marginTop: 3 }} />
        <span>
          <strong>Autoriser plusieurs réponses depuis le même numéro</strong><br />
          <span style={{ color: "#94a3b8", fontSize: 12 }}>À cocher pour un stand, où plusieurs visiteurs utilisent le même téléphone.</span>
        </span>
      </label>

      <button onClick={async () => { if (await onMaj(v)) toast.success("Réglages enregistrés ✓"); }}
        style={bouton(accent)}>💾 Enregistrer</button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Le détail d'une réponse
══════════════════════════════════════════════════════════════ */
function DetailReponse({ detail, onFermer, onStatut, carte, bouton, accent }) {
  const { reponse, valeurs, diffusion } = detail;
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onFermer(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ ...carte, width: "100%", maxWidth: 620, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{reponse.nom || "Réponse anonyme"}</div>
            <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 3 }}>
              Reçue le {new Date(reponse.created_at).toLocaleString("fr-FR")}
            </div>
          </div>
          <button onClick={onFermer} style={{ ...bouton("#f1f5f9"), color: "#374151", padding: "6px 12px" }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {reponse.telephone && <span style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 11px", borderRadius: 99, background: "#f1f5f9", color: "#334155" }}>📞 {reponse.telephone}</span>}
          {reponse.email && <span style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 11px", borderRadius: 99, background: "#f1f5f9", color: "#334155" }}>✉️ {reponse.email}</span>}
          {diffusion && <span style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 11px", borderRadius: 99, background: "#e0f2fe", color: "#0369a1" }}>📍 {diffusion.libelle}</span>}
          <span style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 11px", borderRadius: 99,
            background: reponse.consentement ? "#dcfce7" : "#fef3c7", color: reponse.consentement ? "#15803d" : "#a16207" }}>
            {reponse.consentement ? "✓ Accepte d'être recontacté" : "✗ Pas de consentement"}
          </span>
        </div>

        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
          {(valeurs || []).map((v, i) => (
            <div key={i} style={{ marginBottom: 13 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".03em" }}>{v.libelle_champ}</div>
              <div style={{ fontSize: 14.5, color: "#0f172a", marginTop: 3 }}>
                {v.valeurs?.length ? v.valeurs.join(" · ") : (v.valeur_texte || v.valeur_nombre || v.valeur_date || "-")}
              </div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14, marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => onStatut("en_cours")} style={bouton("#b45309")}>📞 En cours de traitement</button>
          <button onClick={() => onStatut("convertie")} style={bouton("#15803d")}>✓ Convertie en dossier</button>
          <button onClick={() => onStatut("rejetee")} style={{ ...bouton("#fee2e2"), color: "#b91c1c" }}>✕ Rejeter</button>
        </div>
        <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 10 }}>
          La création du dossier dans le parcours reste manuelle : un test de curiosité sur un stand
          ne doit pas entrer automatiquement dans le pipeline.
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Dépôt d'image - bannière et illustration
══════════════════════════════════════════════════════════════ */

/**
 * Sur un formulaire de campagne, l'image n'est pas décorative : c'est le support de
 * communication lui-même. Un formulaire nu à côté d'une affiche soignée ne donne pas
 * envie d'être rempli.
 *
 * L'envoi passe par `uploadFichier`, qui va DIRECTEMENT vers Cloudinary - une affiche de
 * campagne dépasse souvent les 4,5 Mo que le relais accepte.
 */
function DepotImage({ url, onChange, label, aide, hauteur = 150, bouton }) {
  const [occupe, setOccupe] = useState(false);
  const [progression, setProgression] = useState(0);

  const deposer = async (fichier) => {
    if (!fichier) return;
    setOccupe(true); setProgression(0);
    try {
      const r = await uploadFichier(fichier, "image", { onProgress: setProgression });
      onChange(r.url);
      toast.success("Image ajoutée ✓");
    } catch (e) {
      toast.error(e.message || "Envoi impossible");
    } finally { setOccupe(false); }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 5 }}>{label}</label>
      {aide && <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 7 }}>{aide}</div>}

      {url ? (
        <div>
          <img src={url} alt="" style={{ width: "100%", maxHeight: hauteur, objectFit: "cover", borderRadius: 10, display: "block", border: "1px solid #e2e8f0" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <label style={{ ...bouton("#f1f5f9"), color: "#374151", display: "inline-block" }}>
              Remplacer
              <input type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => { deposer(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <button onClick={() => onChange(null)} style={{ ...bouton("#fee2e2"), color: "#b91c1c" }}>Retirer</button>
          </div>
        </div>
      ) : (
        <label style={{ display: "block", border: "1.5px dashed #cbd5e1", borderRadius: 10, padding: "26px 16px",
          textAlign: "center", cursor: occupe ? "wait" : "pointer", background: "#f8fafc" }}>
          <div style={{ fontSize: 26, marginBottom: 6 }}>🖼️</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>
            {occupe ? `Envoi… ${progression}%` : "Choisir une image"}
          </div>
          <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 3 }}>JPG ou PNG</div>
          <input type="file" accept="image/*" disabled={occupe} style={{ display: "none" }}
            onChange={e => { deposer(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Habillage commun des modals de création
══════════════════════════════════════════════════════════════ */
function Champ({ label, aide, style = {}, children }) {
  return (
    <div style={{ marginBottom: 14, ...style }}>
      <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 5 }}>{label}</label>
      {aide && <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 5 }}>{aide}</div>}
      {children}
    </div>
  );
}

function ModalSimple({ titre, aide, onFermer, onValider, valide, carte, bouton, accent, children }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onFermer(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 9900, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ ...carte, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>{titre}</div>
        {aide && <div style={{ fontSize: 12.5, color: "#64748b", margin: "5px 0 18px", lineHeight: 1.6 }}>{aide}</div>}
        {children}
        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 6 }}>
          <button onClick={onFermer} style={{ ...bouton("#f1f5f9"), color: "#374151" }}>Annuler</button>
          <button onClick={onValider} disabled={!valide}
            style={{ ...bouton(valide ? accent : "#cbd5e1"), cursor: valide ? "pointer" : "not-allowed" }}>Créer</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Contacts WhatsApp - export vers le carnet d'adresses
══════════════════════════════════════════════════════════════ */

/**
 * Les cinq étapes entre le fichier téléchargé et le message envoyé.
 *
 * Le fichier arrive sur l'ORDINATEUR, alors que WhatsApp vit sur le TÉLÉPHONE : c'est la
 * première étape, et c'est celle qu'on oublie d'écrire parce qu'elle paraît évidente une
 * fois qu'on la connaît. Les libellés sont ceux des menus réels, iPhone et Android, pour
 * qu'on puisse suivre sans chercher.
 */
function ModeEmploiDiffusion({ listes }) {

  return (
    <div style={{ marginTop: 13 }}>
      {/* Les etapes en deux colonnes : sur un modal large, une etape pleine largeur fait
          des lignes de cent quarante caracteres, et on perd le debut de la suivante. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: "0 30px", alignItems: "start" }}>
      <Etape n="1" titre="Amener le fichier sur le téléphone">
        Il vient de se télécharger sur cet ordinateur, mais WhatsApp est sur le téléphone. Le plus
        simple : depuis WhatsApp Web, ouvrez la discussion avec votre propre numéro
        (« Message à moi-même ») et joignez le fichier. Sinon : e-mail à vous-même, Google Drive,
        ou AirDrop entre Mac et iPhone.
      </Etape>

      <Etape n="2" titre="Importer dans les contacts">
        <div><strong>iPhone</strong> - touchez le fichier reçu → <em>Ajouter tous les contacts</em> → <em>Créer des contacts</em>.</div>
        <div><strong>Android</strong> - Contacts → ⋮ → <em>Importer</em> → <em>Fichier .vcf</em>.</div>
        {listes > 1 && <div style={{ marginTop: 3, color: "#b45309" }}>Importez bien les <strong>{listes} fichiers</strong>.</div>}
      </Etape>

      <Etape n="3" titre="Créer la liste de diffusion">
        WhatsApp Business → <em>Nouveau chat</em> ou ⋮ → <strong>Nouvelle diffusion</strong>. Dans la recherche,
        tapez <strong>BET</strong> : tous les contacts importés remontent d'un coup. Sélectionnez-les, puis ✓.
        {listes > 1 && <> Une liste par fichier - {listes} listes au total, puisque le plafond est de {MAX_PAR_LISTE}.</>}
      </Etape>

      <Etape n="4" titre="Écrire et envoyer">
        Chacun reçoit le message comme une <strong>conversation privée</strong> : les destinataires ne se voient
        pas entre eux et ne savent pas que c'est une diffusion. Leurs réponses vous arrivent
        individuellement.
      </Etape>

      <Etape n="5" titre="Nettoyer le carnet, après la campagne">
        Contacts → rechercher <strong>« BET · »</strong> → tout sélectionner → supprimer. Sans ça, le carnet
        enfle de plusieurs centaines de prospects à chaque campagne.
      </Etape>
      </div>

      {/* Les deux surprises qui font croire a une panne. Elles n'ont pas leur place dans
          les etapes : ce ne sont pas des actions, ce sont des pieges. */}
      <div style={{ background: "#f8fafc", borderRadius: 10, padding: "11px 14px", fontSize: 12, color: "#475569", lineHeight: 1.65 }}>
        <div style={{ marginBottom: 5 }}>
          <strong>Si WhatsApp ne voit pas les nouveaux contacts</strong> - fermez et rouvrez l'application :
          elle relit le carnet au démarrage.
        </div>
        <div>
          <strong>Les deux coches grises ne prouvent rien.</strong> Ceux qui n'ont pas enregistré le numéro de
          BET ne recevront rien, et l'écran affichera quand même les coches. C'est la règle n° 2
          plus haut : cet échec-là est invisible.
        </div>
      </div>
    </div>
  );
}

/**
 * Prépare une diffusion WhatsApp MANUELLE depuis les numéros collectés.
 *
 * L'envoi automatique passe par une API payante hors budget. Une liste de diffusion
 * depuis le téléphone ne coûte rien, mais elle obéit à des règles qu'aucun code ne peut
 * contourner - et c'est précisément pour les montrer que cet écran existe : une liste de
 * prospects froids part sans la moindre erreur et n'arrive nulle part.
 */
function ModalContacts({ donnees, onFermer, carte, bouton }) {
  const [avecConsentementSeul, setAvecConsentementSeul] = useState(true);
  /* Le mode d'emploi s'ouvre APRES le premier telechargement : c'est au moment ou le
     fichier arrive qu'on se demande quoi en faire. Ouvert d'emblee, il repousserait les
     boutons hors de l'ecran et ferait lire six etapes a quelqu'un qui connait deja. */
  const [modeEmploi, setModeEmploi] = useState(false);

  const prepa = preparerContacts(donnees.lignes, { seulementConsentants: avecConsentementSeul });
  const { contacts, sansNumero, invalides, sansConsentement } = prepa;
  const listes = decouperEnListes(contacts).length;


  return (
    <div onClick={e => { if (e.target === e.currentTarget) onFermer(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.65)", zIndex: 9900, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div style={{ ...carte, width: "92vw", maxWidth: 1180, maxHeight: "92vh", overflowY: "auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>📇 Contacts pour une diffusion WhatsApp</div>
            <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 3 }}>
              Sur la sélection de réponses affichée.
            </div>
          </div>
          <button onClick={onFermer} style={{ ...bouton("#f1f5f9"), color: "#374151", padding: "6px 12px" }}>✕</button>
        </div>

        {/* DEUX COLONNES sur large ecran : les regles a gauche, les chiffres et les actions
            a droite. Elargir sans reflow aurait etire chaque phrase sur cent quarante
            caracteres - une ligne qu'on relit deux fois pour retrouver son debut. */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.15fr) minmax(300px, 1fr)", gap: 18, alignItems: "start" }}>

        {/* LES TROIS REGLES, AVANT les chiffres. Elles decident si la diffusion arrive :
            les lire apres avoir telecharge ne sert plus a rien. */}
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 11, padding: "13px 16px", fontSize: 12.5, color: "#78350f", lineHeight: 1.7 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Ce que WhatsApp impose</div>
          <div><strong>1.</strong> Une liste de diffusion accepte <strong>{MAX_PAR_LISTE} destinataires</strong> au maximum.</div>
          <div><strong>2.</strong> Le destinataire ne reçoit le message <strong>que s'il a enregistré le numéro de BET</strong> dans
            ses contacts. Une liste de prospects froids part sans erreur et <strong>n'arrive nulle part</strong> - rien ne vous le signalera.</div>
          <div><strong>3.</strong> Vous devez avoir leur numéro enregistré : c'est l'objet du fichier ci-dessous.</div>
        </div>

        <div>
        <div style={{ marginBottom: 14 }}>
          <LigneStat l="Réponses dans la sélection" n={donnees.lignes.length} />
          <LigneStat l="Numéros exploitables, dédoublonnés" n={contacts.length} c="#15803d" />
          <LigneStat l="Listes de diffusion à créer" n={listes} c="#0891b2" />
          {sansConsentement > 0 && <LigneStat l="Sans consentement" n={sansConsentement} c="#b45309" />}
          {sansNumero > 0 && <LigneStat l="Réponses sans numéro" n={sansNumero} c="#94a3b8" />}
          {invalides > 0 && <LigneStat l="Numéros illisibles, écartés" n={invalides} c="#b91c1c" />}
        </div>

        <label style={{ display: "flex", alignItems: "flex-start", gap: 9, background: "#f8fafc", borderRadius: 10, padding: "11px 14px", marginBottom: 16, cursor: "pointer" }}>
          <input type="checkbox" checked={avecConsentementSeul} onChange={e => setAvecConsentementSeul(e.target.checked)}
            style={{ marginTop: 2, width: 15, height: 15, cursor: "pointer" }} />
          <span style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.6 }}>
            <strong>N'exporter que les contacts consentants.</strong> Diffuser sans accord fait signaler le numéro,
            et un numéro WhatsApp Business signalé se perd définitivement.
          </span>
        </label>

        {contacts.length === 0 ? (
          <div style={{ background: "#f1f5f9", borderRadius: 10, padding: "16px", textAlign: "center", fontSize: 13, color: "#64748b" }}>
            Aucun numéro exploitable dans cette sélection.
            {sansConsentement > 0 && avecConsentementSeul && " Décochez la case ci-dessus pour inclure les non-consentants."}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => {
              const n = exporterVcards(contacts, donnees.titre);
              setModeEmploi(true);
              toast.success(`${n} fichier${n > 1 ? "s" : ""} de contacts téléchargé${n > 1 ? "s" : ""} ✓`);
            }} style={{ ...bouton("#25D366"), flex: 2, minWidth: 220, padding: 13 }}>
              📇 Télécharger {listes > 1 ? `${listes} fichiers .vcf` : "le fichier .vcf"}
            </button>
            <button onClick={() => { exporterNumeros(contacts, donnees.titre); toast.success("Liste de numéros téléchargée ✓"); }}
              style={{ ...bouton("#f1f5f9"), color: "#374151", flex: 1, minWidth: 150, padding: 13 }}>
              📄 Numéros bruts
            </button>
          </div>
        )}
        </div>
        </div>

        <div style={{ marginTop: 16, borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
          <button onClick={() => setModeEmploi(o => !o)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
              fontSize: 13, fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: 7 }}>
            <span>{modeEmploi ? "▲" : "▼"}</span> Et maintenant ? - du fichier à la diffusion
          </button>

          {modeEmploi && <ModeEmploiDiffusion listes={listes} />}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Statistiques des relances - les deux canaux réunis
══════════════════════════════════════════════════════════════ */

/**
 * L'historique des campagnes parties depuis cette récolte.
 *
 * Les deux canaux dans le MÊME tableau, distingués par une colonne : une récolte se
 * relance par e-mail pour les uns et par WhatsApp pour les autres, et deux tableaux
 * séparés auraient obligé à additionner de tête pour savoir qui a été touché.
 *
 * Une même récolte reçoit plusieurs campagnes, et une campagne peut en viser plusieurs :
 * la colonne « Récolte(s) » le dit, sans quoi un envoi croisé passerait pour un envoi
 * dédié à celle qu'on regarde.
 */
function StatsCampagnes({ stats, carte }) {
  const [ouvert, setOuvert] = useState(false);
  const liste = stats?.toutes || [];
  const t = stats?.totaux || {};

  // Rien n'a encore été envoyé : on le dit en une ligne plutôt que d'afficher un
  // tableau vide, qui laisserait croire à un chargement qui n'aboutit pas.
  if (!stats) return null;


  return (
    <div style={{ ...carte, marginBottom: 14, padding: liste.length ? undefined : "14px 18px" }}>
      <div onClick={() => liste.length && setOuvert(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", cursor: liste.length ? "pointer" : "default" }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#0f172a" }}>
          📊 Relances envoyées
          {liste.length > 0 && <span style={{ color: "#94a3b8", fontWeight: 600 }}> - {liste.length} campagne{liste.length > 1 ? "s" : ""}</span>}
        </div>

        {liste.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "#94a3b8", marginLeft: "auto" }}>
            Aucune campagne partie depuis cette récolte pour l'instant.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, flex: 1, minWidth: 300, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <Chiffre n={t.destinataires ?? 0} l="visés" c="#0f172a" />
              <Chiffre n={t.envoyes ?? 0} l="partis" c="#15803d" />
              <Chiffre n={t.echecs ?? 0} l="échecs" c={t.echecs ? "#b91c1c" : "#94a3b8"} />
              <Chiffre n={t.sans_consentement ?? 0} l="sans consent." c="#b45309" />
              <Chiffre n={t.taux_reussite == null ? "-" : `${t.taux_reussite}%`} l="réussite" c="#0891b2" />
            </div>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{ouvert ? "▲ Replier" : "▼ Détail"}</span>
          </>
        )}
      </div>

      {ouvert && liste.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 14, borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Date", "Canal", "Campagne", "Récolte(s)", "Visés", "Partis", "Échecs", "Statut"].map(h => (
                  <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 10.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {liste.map(c => (
                <tr key={`${c.canal}-${c.id}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "9px 12px", color: "#64748b", whiteSpace: "nowrap" }}>
                    {c.date ? new Date(c.date).toLocaleDateString("fr-FR") : "-"}
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99,
                      background: c.canal === "email" ? "#cffafe" : "#dcfce7",
                      color: c.canal === "email" ? "#0e7490" : "#15803d" }}>
                      {c.canal === "email" ? "✉️ E-mail" : "📱 WhatsApp"}
                    </span>
                  </td>
                  <td style={{ padding: "9px 12px", fontWeight: 700, color: "#0f172a", maxWidth: 260 }}>{c.nom || "-"}</td>
                  <td style={{ padding: "9px 12px", color: "#64748b", fontSize: 11.5, maxWidth: 200 }}>
                    {(c.recoltes || []).join(" · ") || "-"}
                  </td>
                  <td style={{ padding: "9px 12px", fontVariantNumeric: "tabular-nums" }}>{c.destinataires}</td>
                  <td style={{ padding: "9px 12px", fontVariantNumeric: "tabular-nums", color: "#15803d", fontWeight: 700 }}>{c.envoyes}</td>
                  <td style={{ padding: "9px 12px", fontVariantNumeric: "tabular-nums", color: c.echecs ? "#b91c1c" : "#cbd5e1", fontWeight: c.echecs ? 700 : 400 }}>{c.echecs}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: c.statut === "echouee" ? "#b91c1c" : c.statut === "partielle" ? "#b45309" : "#15803d" }}>
                      {c.statut}
                    </span>
                    {/* Le motif exact du refus, la ou il a ete constate : sans lui, un
                        echec obligeait a aller lire les journaux du fournisseur. */}
                    {(c.erreurs || []).length > 0 && (
                      <div style={{ fontSize: 10.5, color: "#991b1b", marginTop: 3, maxWidth: 260, fontFamily: "monospace" }}>{c.erreurs[0]}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Campagne WhatsApp - sur la sélection de réponses affichée
══════════════════════════════════════════════════════════════ */

/**
 * Deux règles de Meta gouvernent cet écran, et il les montre plutôt que de les subir.
 *
 *  · Seul un MODÈLE APPROUVÉ peut partir vers quelqu'un qui n'a pas écrit dans les 24 h.
 *    Une campagne sortante est toujours dans ce cas.
 *  · Écrire sans consentement fait BANNIR le numéro, définitivement. Les contacts sans
 *    opt-in sont donc comptés et exclus à l'écran, jamais écartés en silence.
 */
function ModalWhatsapp({ apiUrl, hdr, filtres, onFermer, carte, champ, bouton }) {
  const confirm = useConfirm();
  const [etape, setEtape]       = useState("audience");   // audience | composer | envoi | fait
  const [audience, setAudience] = useState(null);
  const [config, setConfig]     = useState(null);
  const [modeles, setModeles]   = useState([]);
  const [modeleId, setModeleId] = useState("");
  const [nom, setNom]           = useState("");
  const [variables, setVariables] = useState({});
  const [resultat, setResultat] = useState(null);
  const [occupe, setOccupe]     = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [ra, rc, rm] = await Promise.all([
          fetch(`${apiUrl}/api/campagnes-whatsapp/audience`, {
            method: "POST", headers: hdr(),
            body: JSON.stringify({ formulaire_id: filtres.formulaire_id, diffusion_id: filtres.diffusion_id || undefined, statut: filtres.statut || undefined }),
          }),
          fetch(`${apiUrl}/api/campagnes-whatsapp/configuration`, { headers: hdr() }),
          fetch(`${apiUrl}/api/campagnes-whatsapp/modeles`, { headers: hdr() }),
        ]);
        setAudience(await ra.json());
        setConfig(await rc.json());
        setModeles((await rm.json()).modeles || []);
        setNom(`Relance - ${filtres.titre || "campagne"}`);
      } catch { toast.error("Chargement impossible"); }
    })();
  }, [apiUrl, hdr, filtres]);

  const modele = modeles.find(m => m.id === modeleId);
  const approuves = modeles.filter(m => m.statut === "approuve");
  const apercu = modele
    ? String(modele.corps).replace(/\{\{(\d+)\}\}/g, (_, n) => variables[n] || `{{${n}}}`)
    : "";

  const lancer = async () => {
    /* UN ENVOI NE SE RATTRAPE PAS. Le pendant e-mail a déjà sa confirmation dédiée ; celui-ci
       partait au clic, vers de vraies personnes. */
    if (!(await confirm(
      "Les messages partiront vers les destinataires correspondant à vos filtres. Un envoi ne peut pas être annulé.",
      { titre: "Lancer cette campagne WhatsApp ?", confirmLabel: "Lancer l'envoi" }))) return;
    setOccupe(true);
    try {
      const rc = await fetch(`${apiUrl}/api/campagnes-whatsapp`, {
        method: "POST", headers: hdr(),
        body: JSON.stringify({
          nom, modele_id: modeleId, variables,
          filtres: { formulaire_id: filtres.formulaire_id, diffusion_id: filtres.diffusion_id || undefined, statut: filtres.statut || undefined },
        }),
      });
      const dc = await rc.json();
      if (!rc.ok) { toast.error(dc.error || "Création impossible"); return; }

      const re = await fetch(`${apiUrl}/api/campagnes-whatsapp/${dc.campagne.id}/envoyer`, { method: "POST", headers: hdr() });
      const de = await re.json();
      setResultat(de);
      setEtape("fait");
    } catch { toast.error("Erreur réseau"); }
    finally { setOccupe(false); }
  };


  return (
    <div onClick={e => { if (e.target === e.currentTarget && !occupe) onFermer(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 9900, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ ...carte, width: "100%", maxWidth: 580, maxHeight: "92vh", overflowY: "auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>📱 Campagne WhatsApp</div>
            <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 3 }}>
              Sur la sélection de réponses affichée.
            </div>
          </div>
          {!occupe && <button onClick={onFermer} style={{ ...bouton("#f1f5f9"), color: "#374151", padding: "6px 12px" }}>✕</button>}
        </div>

        {!audience ? <div style={{ padding: 30, textAlign: "center", color: "#9ca3af" }}>Calcul de l'audience…</div> : (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <BlocStat n={audience.total} l="contacts" c="#0f172a" />
              <BlocStat n={audience.joignables} l="joignables" c="#15803d" />
              <BlocStat n={audience.sans_optin} l="sans consentement" c="#b45309" />
            </div>

            {audience.sans_optin > 0 && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 15px", marginBottom: 16, fontSize: 12.5, color: "#92400e", lineHeight: 1.6 }}>
                <strong>{audience.sans_optin} contact{audience.sans_optin > 1 ? "s" : ""} ne recevront rien</strong> : ils n'ont pas coché
                la case de consentement. Écrire sans accord fait signaler l'expéditeur, et un numéro trop
                signalé est banni définitivement - avec le compte WhatsApp Business de BET.
              </div>
            )}

            {/* Ce qui manque est dit AVANT de préparer une campagne pour rien. */}
            {config && !config.pret && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "13px 15px", marginBottom: 16, fontSize: 12.5, color: "#991b1b", lineHeight: 1.7 }}>
                <strong>L'envoi n'est pas encore possible :</strong>
                <ul style={{ margin: "7px 0 0", paddingLeft: 18 }}>
                  {!config.brevo_cle && <li>La clé Brevo n'est pas configurée.</li>}
                  {!config.numero_expediteur && <li><code>BREVO_WHATSAPP_SENDER</code> absent - le numéro WhatsApp Business n'est pas renseigné.</li>}
                  {!config.modeles_approuves && <li>Aucun modèle approuvé par Meta. Une campagne sortante ne peut partir qu'avec un modèle approuvé.</li>}
                </ul>
                <div style={{ marginTop: 8 }}>Vous pouvez préparer la campagne ; l'envoi restera bloqué tant que ces points ne sont pas réglés.</div>
              </div>
            )}

            {etape !== "fait" && (
              <>
                <Champ label="Nom de la campagne">
                  <input value={nom} onChange={e => setNom(e.target.value)} style={{ ...champ, width: "100%" }} />
                </Champ>

                <Champ label="Modèle de message"
                  aide="Seuls les modèles approuvés par Meta peuvent partir vers un contact qui n'a pas écrit dans les 24 h.">
                  <select value={modeleId} onChange={e => { setModeleId(e.target.value); setVariables({}); }} style={{ ...champ, width: "100%" }}>
                    <option value="">- Choisissez un modèle -</option>
                    {approuves.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                    {modeles.filter(m => m.statut !== "approuve").map(m => (
                      <option key={m.id} value={m.id} disabled>{m.nom} - {m.statut}</option>
                    ))}
                  </select>
                </Champ>

                {modele && (
                  <>
                    {(modele.variables || []).length > 0 && (
                      <Champ label="Valeurs des variables">
                        {(modele.variables || []).map((v, i) => (
                          <input key={i} value={variables[i + 1] || ""} placeholder={`{{${i + 1}}} - ${v}`}
                            onChange={e => setVariables(p => ({ ...p, [i + 1]: e.target.value }))}
                            style={{ ...champ, width: "100%", marginBottom: 7 }} />
                        ))}
                      </Champ>
                    )}
                    <div style={{ background: "#dcf8c6", borderRadius: "12px 12px 12px 3px", padding: "12px 15px", fontSize: 13.5, color: "#111b21", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 18 }}>
                      {apercu}
                    </div>
                  </>
                )}

                <button onClick={lancer}
                  disabled={occupe || !modeleId || !audience.joignables || (config && !config.pret)}
                  style={{ ...bouton(occupe || !modeleId || !audience.joignables || (config && !config.pret) ? "#cbd5e1" : "#25D366"), width: "100%", padding: 14, fontSize: 15 }}>
                  {occupe ? "Envoi en cours…" : `Envoyer à ${audience.joignables} contact${audience.joignables > 1 ? "s" : ""}`}
                </button>
              </>
            )}

            {etape === "fait" && resultat && (
              <div style={{ textAlign: "center", padding: "10px 0 4px" }}>
                <div style={{ fontSize: 42, marginBottom: 10 }}>{resultat.ok ? "✅" : "⚠️"}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>{resultat.message}</div>
                {(resultat.erreurs || []).length > 0 && (
                  <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "11px 14px", fontSize: 12.5, color: "#991b1b", textAlign: "left", marginTop: 12 }}>
                    {resultat.erreurs.map((e, i) => <div key={i}>· {e}</div>)}
                  </div>
                )}
                <button onClick={onFermer} style={{ ...bouton("#f1f5f9"), color: "#374151", marginTop: 16 }}>Fermer</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Campagne e-mail - sur la même sélection de réponses
══════════════════════════════════════════════════════════════ */

/**
 * Le pendant e-mail du modal WhatsApp, sur le même vivier.
 *
 * Les contraintes ne sont PAS les mêmes, et l'écran ne fait pas semblant du contraire :
 * l'e-mail n'exige ni modèle approuvé par Meta, ni fenêtre de 24 heures. On peut écrire
 * ce qu'on veut, tout de suite.
 *
 * Le consentement reste demandé. Une relance non sollicitée finit en spam, et c'est la
 * réputation du domaine de BET qui s'abîme - pas seulement une campagne.
 */
function ModalEmail({ apiUrl, hdr, filtres, onFermer, carte, champ, bouton }) {
  const [audience, setAudience] = useState(null);
  // Une recolte recoit PLUSIEURS campagnes : sans nom, l'historique n'est qu'une
  // suite d'objets d'e-mails qu'on ne distingue plus au bout de trois relances.
  const [nom, setNom]           = useState("");
  const [sujet, setSujet]       = useState("");
  const [contenu, setContenu]   = useState("");
  const [occupe, setOccupe]     = useState(false);
  const [resultat, setResultat] = useState(null);
  const [piece, setPiece]       = useState(null);   // { url, nom }
  const [envoiPiece, setEnvoiPiece] = useState(false);
  const [pctPiece, setPctPiece] = useState(0);
  const [confirme, setConfirme] = useState(false);   // un envoi ne se rattrape pas

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${apiUrl}/api/campagnes/email/audience`, {
          method: "POST", headers: hdr(),
          body: JSON.stringify({
            formulaire_id: filtres.formulaire_id,
            diffusion_id: filtres.diffusion_id || undefined,
            statut: filtres.statut || undefined,
          }),
        });
        setAudience(await r.json());
        setSujet(`BET - ${filtres.titre || "votre demande"}`);
        setNom(`Relance ${new Date().toLocaleDateString("fr-FR")} - ${filtres.titre || "collecte"}`);
      } catch { toast.error("Chargement impossible"); }
    })();
  }, [apiUrl, hdr, filtres]);

  const envoyer = async () => {
    setConfirme(false);
    setOccupe(true);
    try {
      const r = await fetch(`${apiUrl}/api/campagnes/email/envoyer`, {
        method: "POST", headers: hdr(),
        body: JSON.stringify({
          nom, sujet, contenu,
          piece_jointe_url: piece?.url || null,
          piece_jointe_nom: piece?.nom || null,
          filtres: {
            formulaire_id: filtres.formulaire_id,
            diffusion_id: filtres.diffusion_id || undefined,
            statut: filtres.statut || undefined,
          },
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || "Envoi impossible"); return; }
      setResultat(d);
    } catch { toast.error("Erreur réseau"); }
    finally { setOccupe(false); }
  };


  return (
    <div onClick={e => { if (e.target === e.currentTarget && !occupe) onFermer(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 9900, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ ...carte, width: "88vw", maxWidth: 980, maxHeight: "92vh", overflowY: "auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>✉️ Campagne e-mail</div>
            <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 3 }}>Sur la sélection de réponses affichée.</div>
          </div>
          {!occupe && <button onClick={onFermer} style={{ ...bouton("#f1f5f9"), color: "#374151", padding: "6px 12px" }}>✕</button>}
        </div>

        {!audience ? <div style={{ padding: 30, textAlign: "center", color: "#9ca3af" }}>Calcul de l'audience…</div> : resultat ? (
          <div style={{ textAlign: "center", padding: "10px 0 4px" }}>
            <div style={{ fontSize: 42, marginBottom: 10 }}>{resultat.ok ? "✅" : "⚠️"}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 14 }}>{resultat.message}</div>
            {resultat.raisons?.length > 0 && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "11px 14px", marginBottom: 14, fontSize: 12, color: "#991b1b", textAlign: "left", lineHeight: 1.6 }}>
                <strong>Motif renvoyé par le serveur d'envoi :</strong>
                {resultat.raisons.map((m, i) => <div key={i} style={{ marginTop: 4, fontFamily: "monospace", fontSize: 11.5 }}>{m}</div>)}
              </div>
            )}
            <button onClick={onFermer} style={{ ...bouton("#f1f5f9"), color: "#374151" }}>Fermer</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <BlocStat n={audience.reponses} l="réponses" c="#64748b" />
              <BlocStat n={audience.total} l="adresses" c="#0f172a" />
              <BlocStat n={audience.joignables} l="joignables" c="#15803d" />
              <BlocStat n={audience.sans_consentement} l="sans consentement" c="#b45309" />
              {audience.sans_email > 0 && <BlocStat n={audience.sans_email} l="sans e-mail" c="#94a3b8" />}
            </div>

            {/* Le champ e-mail est rarement obligatoire : beaucoup ne laissent qu'un
                numero. Sans cette ligne, on croirait que des reponses ont disparu. */}
            {audience.sans_email > 0 && (
              <div style={{ background: "#f1f5f9", borderRadius: 10, padding: "12px 15px", marginBottom: 16, fontSize: 12.5, color: "#475569", lineHeight: 1.6 }}>
                <strong>{audience.sans_email} réponse{audience.sans_email > 1 ? "s" : ""} sans adresse e-mail.</strong> Le champ n'étant pas
                obligatoire, ces personnes ne sont joignables que par WhatsApp - utilisez la campagne WhatsApp pour elles.
              </div>
            )}

            {audience.sans_consentement > 0 && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 15px", marginBottom: 16, fontSize: 12.5, color: "#92400e", lineHeight: 1.6 }}>
                <strong>{audience.sans_consentement} contact{audience.sans_consentement > 1 ? "s" : ""} ne recevront rien</strong> : ils n'ont pas
                coché la case de consentement. Une relance non sollicitée finit en spam, et c'est la
                réputation du domaine de BET qui s'abîme.
              </div>
            )}

            {audience.total === 0 && (
              <div style={{ background: "#f1f5f9", borderRadius: 10, padding: "14px 16px", marginBottom: 16, fontSize: 12.5, color: "#475569", lineHeight: 1.6 }}>
                Aucune adresse e-mail dans cette sélection. Pour collecter des e-mails, ajoutez un champ
                de type <strong>E-mail</strong> à votre formulaire et marquez-le « Sert de : E-mail ».
              </div>
            )}

            <Champ label="Nom de la campagne"
              aide="Pour la retrouver dans l'historique des relances. N'apparaît pas dans le message.">
              <input value={nom} onChange={e => setNom(e.target.value)}
                placeholder="Ex. Relance rentrée - affiche Angré" style={{ ...champ, width: "100%" }} />
            </Champ>

            <Champ label="Objet du message">
              <input value={sujet} onChange={e => setSujet(e.target.value)}
                placeholder="Ex. Votre place est réservée - Rentrée 2026" style={{ ...champ, width: "100%" }} />
            </Champ>

            <Champ label="Message"
              aide="Texte simple. La mise en page, l'en-tête BET et le pied de page sont ajoutés automatiquement. Les adresses web deviennent cliquables.">
              <textarea value={contenu} onChange={e => setContenu(e.target.value)} rows={12}
                placeholder={"Bonjour,\n\nMerci de votre intérêt pour nos cours d'anglais.\nNous vous proposons de commencer dès la semaine prochaine…\n\nÀ très vite,\nL'équipe BET"}
                style={{ ...champ, width: "100%", lineHeight: 1.6 }} />
            </Champ>

            <Champ label="Pièce jointe"
              aide="Image, PDF, document… Une image est affichée en grand dans le message ; tout autre fichier devient un lien de téléchargement.">
              {piece ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "11px 14px" }}>
                  <span style={{ fontSize: 20 }}>📎</span>
                  <span style={{ flex: 1, fontSize: 13, color: "#0369a1", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{piece.nom}</span>
                  <button onClick={() => setPiece(null)} style={{ ...bouton("#fee2e2"), color: "#b91c1c", padding: "5px 11px" }}>Retirer</button>
                </div>
              ) : (
                <label style={{ display: "block", border: "1.5px dashed #cbd5e1", borderRadius: 10, padding: "16px", textAlign: "center", cursor: envoiPiece ? "wait" : "pointer", background: "#f8fafc", fontSize: 13, color: "#475569", fontWeight: 600 }}>
                  {envoiPiece ? `Envoi… ${pctPiece}%` : "📎 Choisir un fichier"}
                  <input type="file" disabled={envoiPiece} style={{ display: "none" }}
                    onChange={async e => {
                      const f = e.target.files?.[0]; e.target.value = "";
                      if (!f) return;
                      setEnvoiPiece(true); setPctPiece(0);
                      try {
                        // « piece-jointe » et non « document » : ce dernier n'accepte que
                        // du bureautique, et joindre un simple .jpg a une relance echouait
                        // en « Format non supporte ». Ici, aucun format n'est exclu.
                        const r = await uploadFichier(f, "piece-jointe", { onProgress: setPctPiece });
                        setPiece({ url: r.url, nom: f.name });
                        toast.success("Fichier joint ✓");
                      } catch (err) { toast.error(err.message || "Envoi impossible"); }
                      finally { setEnvoiPiece(false); }
                    }} />
                </label>
              )}
            </Champ>

            <button onClick={() => setConfirme(true)} disabled={occupe || envoiPiece || !audience.joignables || !sujet.trim() || !contenu.trim()}
              style={{ ...bouton(occupe || !audience.joignables || !sujet.trim() || !contenu.trim() ? "#cbd5e1" : "#0891b2"), width: "100%", padding: 14, fontSize: 15 }}>
              {occupe ? "Envoi en cours…" : `Envoyer à ${audience.joignables} contact${audience.joignables > 1 ? "s" : ""}`}
            </button>

            {/* Un envoi ne se rappelle pas. On montre ce qui va reellement partir - le nombre
                exact de destinataires, l'objet, la piece jointe - avant de declencher. */}
            {confirme && (
              <div onClick={e => { if (e.target === e.currentTarget) setConfirme(false); }}
                style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", zIndex: 9950, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                <div style={{ ...carte, width: "100%", maxWidth: 470 }}>
                  <div style={{ fontSize: 34, textAlign: "center", marginBottom: 8 }}>✉️</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", textAlign: "center", marginBottom: 6 }}>
                    Envoyer à {audience.joignables} contact{audience.joignables > 1 ? "s" : ""} ?
                  </div>
                  <div style={{ fontSize: 12.5, color: "#64748b", textAlign: "center", lineHeight: 1.6, marginBottom: 16 }}>
                    Le message part immédiatement et <strong>ne peut pas être rappelé</strong>.
                  </div>

                  <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px", marginBottom: 16, fontSize: 12.5, color: "#334155", lineHeight: 1.8 }}>
                    <div><span style={{ color: "#94a3b8" }}>Campagne :</span> <strong>{nom || "sans nom"}</strong></div>
                    <div><span style={{ color: "#94a3b8" }}>Objet :</span> <strong>{sujet}</strong></div>
                    <div><span style={{ color: "#94a3b8" }}>Destinataires :</span> <strong>{audience.joignables}</strong> ayant donné leur consentement
                      {audience.sans_consentement > 0 && <span style={{ color: "#b45309" }}> · {audience.sans_consentement} exclu{audience.sans_consentement > 1 ? "s" : ""}</span>}
                    </div>
                    <div><span style={{ color: "#94a3b8" }}>Pièce jointe :</span> {piece ? <strong>{piece.nom}</strong> : <span style={{ color: "#94a3b8" }}>aucune</span>}</div>
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setConfirme(false)} style={{ ...bouton("#f1f5f9"), color: "#374151", flex: 1, padding: 12 }}>Annuler</button>
                    <button onClick={envoyer} style={{ ...bouton("#0891b2"), flex: 1.4, padding: 12, fontSize: 14 }}>Oui, envoyer maintenant</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
