// src/Pages/EspaceApprenant/EspaceApprenant.jsx
// Route : <Route path="/espace-apprenant" element={<EspaceApprenant />} />

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTabState } from "../../hooks/useTabState";
import toast from "react-hot-toast";
import { urlEmbedVideo, estFichierVideo, estFichierAudio, estChaineYoutube } from "../../utils/urlVideo";
import MessagerieTab from "../../Components/MessagerieTab";
import ApprenantColorPicker, { getApprenantColor } from "../../Components/ApprenantColorPicker";
import CloudinaryUpload from "../../Components/CloudinaryUpload";
import { useGroupesChatUnreadTotal } from "../../hooks/useGroupeChat";
import { supabase } from "../../config/supabase";
import { prochaineEcheance, delaiLisible, prochainRappel, libelleMois, statutMois, totalPayeMois, estPlanMensuel, dateEcheanceMois } from "../../utils/planMensuel";
import { urlDocument, extensionDe } from "../../utils/urlDocument";
import { useConfirm, useAlerte } from "../../contexts/ConfirmContext";
import { clearAllSessionStorage } from "../../utils/session";
import ChatGroupe from "../../Components/ChatGroupe";

import { fetchUpload } from "../../utils/fetchUpload";
import AppreciationSeance, { BandeauAppreciation, useSeancesANoter } from "../../Components/AppreciationSeance";
import { suivreFenetreLive } from "../../utils/inactivite";
import { estClassePrivee } from "../../utils/classePrivee";

/* OUVERTURE DE LA SALLE VIRTUELLE. Cet écran-ci ne connaissait AUCUNE règle d'heure :
   l'apprenant pouvait rejoindre une session - ou copier son lien - le jour même dès le
   matin, alors que son coach, lui, ne voit la salle s'ouvrir que peu avant le cours.
   L'espace apprenant de bet-elearning appliquait déjà la règle ; celui-ci l'avait perdue
   en route. Même délai pour tout le monde, coach compris. */
const MINUTES_OUVERTURE_SALLE = 10;
const MS_OUVERTURE_SALLE = MINUTES_OUVERTURE_SALLE * 60 * 1000;
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

/* ═══════════════════════════════════════════════════════
   CONSTANTES (NOUVELLE CHARTE)
═══════════════════════════════════════════════════════ */
const PRIMARY_COLOR    = getApprenantColor();
const PRIMARY_DARK     = PRIMARY_COLOR;
const PRIMARY_LIGHT    = `${PRIMARY_COLOR}18`;
const GRADIENT_HEADER  = `linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${PRIMARY_COLOR}cc 100%)`;

const NIVEAU_META = {
  A1: { label:"Débutant",           color:"#6b7280", bg:"#f3f4f6" },
  A2: { label:"Élémentaire",        color:"#d97706", bg:"#fef3c7" },
  B1: { label:"Intermédiaire",      color:"#2563eb", bg:"#dbeafe" },
  B2: { label:"Interm. supérieur",  color:"#7c3aed", bg:"#ede9fe" },
  C1: { label:"Avancé",             color:"#059669", bg:"#dcfce7" },
  C2: { label:"Maîtrise",           color:"#dc2626", bg:"#fee2e2" },
};

const STATUT_COURS = {
  en_cours:  { label:"En cours",   bg:"#dbeafe", c:"#1e40af" },
  termine:   { label:"Terminé",    bg:"#dcfce7", c:"#166534" },
  planifie:  { label:"Planifié",   bg:"#fef3c7", c:"#92400e" },
  pause:     { label:"En pause",   bg:"#f3f4f6", c:"#374151" },
};

const TYPE_RESSOURCE = {
  pdf:       { icon:"📄", label:"PDF",     color:"#dc2626" },
  video:     { icon:"🎬", label:"Vidéo",   color:"#7c3aed" },
  audio:     { icon:"🎧", label:"Audio",   color:"#059669" },
  exercice:  { icon:"✏️", label:"Exercice",color:"#d97706" },
  quiz:      { icon:"❓", label:"Quiz",    color:"#2563eb" },
  lien:      { icon:"🔗", label:"Lien",    color: PRIMARY_COLOR },
};

/* `urlEmbedVideo` vit désormais dans utils/urlVideo.js : la même reconnaissance
   servait ici, chez le superviseur et dans les ressources coach, recopiée à chaque fois. */

/**
 * Rendu du média d'un contenu d'onboarding - un seul endroit pour les quatre types.
 * Il existait deux rendus écrits séparément : celui de l'onglet Onboarding ne connaissait
 * pas le type `image` (pourtant proposé par le formulaire côté onboarding), et celui du
 * modal de bienvenue n'affichait aucun média du tout, même pour une vidéo.
 * Le cas `default` est là pour qu'un type ajouté demain reste ouvrable plutôt que muet.
 */
/**
 * Ce que fait un lecteur média quand on referme l'écran au milieu du chargement.
 *
 * Le navigateur annule alors le téléchargement et émet une erreur `MEDIA_ERR_ABORTED` -
 * « The fetching process for the media resource was aborted at the user's request ». Ce
 * n'est PAS une panne : c'est l'annulation demandée. Mais l'overlay de développement de
 * React la remonte en « Uncaught runtime error » plein écran, qui recouvre la page - d'où
 * l'impression que « marquer comme terminé ne fonctionne plus » : le bouton est là,
 * simplement masqué par l'overlay.
 *
 * `preload="metadata"` réduit la fenêtre où ça arrive : seule l'en-tête du fichier est
 * chargée d'emblée, pas les mégaoctets qui suivent.
 */
function avalerAbandonMedia(e) {
  const code = e?.currentTarget?.error?.code;
  // 1 = ABORTED (annulation), 2 = NETWORK. Les autres sont de vraies erreurs de
  // décodage ou de source, qu'on laisse remonter pour ne pas masquer un fichier cassé.
  if (code === 1 || code === 2) { e.stopPropagation(); e.preventDefault?.(); }
}

/**
 * Un lecteur audio/vidéo qui s'éteint PROPREMENT.
 *
 * Fermer un cours pendant que le son se charge faisait émettre au navigateur un
 * `MEDIA_ERR_ABORTED` - « the fetching process … was aborted at the user's request »,
 * c'est-à-dire l'annulation qu'on venait soi-même de demander. L'overlay de développement
 * de React le remontait en erreur plein écran, qui recouvrait la page : le bouton
 * « Marquer comme terminé » était toujours là, simplement masqué.
 *
 * Un `onError` ne suffit PAS : l'overlay écoute au niveau `window`, donc avant le
 * gestionnaire posé sur l'élément. Il faut empêcher l'erreur d'exister, pas la rattraper.
 * La séquence ci-dessous est celle que la spécification prévoit pour annuler un
 * téléchargement en cours : `pause()`, retrait de l'attribut `src`, puis `load()`. Elle
 * émet `emptied`, jamais `error`.
 *
 * `removeAttribute("src")` et non `src = ""` : une chaîne vide est une URL relative, que
 * le navigateur résout en l'adresse de la page et tente de charger comme un média.
 */
function LecteurMedia({ tag: Tag = "audio", style, ...rest }) {
  const ref = useRef(null);
  // `chargement` : on attend les métadonnées. `panne` : une VRAIE erreur (décodage,
  // source introuvable) - l'annulation, elle, ne compte pas comme une panne.
  const [chargement, setChargement] = useState(true);
  const [panne, setPanne] = useState(false);

  /* Le voile de chargement s'efface au bout de 8 secondes quoi qu'il arrive. Certains
     navigateurs n'émettent `loadedmetadata` qu'au premier clic sur « play » : sans cette
     échéance, l'indicateur tournait indéfiniment sous un lecteur pourtant fonctionnel, et
     laissait croire à une panne. */
  useEffect(() => {
    if (!chargement) return;
    const t = setTimeout(() => setChargement(false), 8000);
    return () => clearTimeout(t);
  }, [chargement]);

  useEffect(() => {
    const el = ref.current;
    return () => {
      if (!el) return;
      /* DIFFÉRÉ D'UN TOUR DE BOUCLE, et c'est tout l'objet de ce `setTimeout`.
         Exécuté directement dans le nettoyage de l'effet, `load()` annule la lecture en
         cours et rejette la promesse `play()` encore pendante. Ce rejet est ASYNCHRONE :
         le `try/catch` ne l'attrape pas, et React - qui est encore dans sa phase de
         commit - l'impute au composant et le remonte en erreur applicative. La trace
         désignait donc ce nettoyage comme coupable, à juste titre.
         Hors du commit, l'annulation redevient ce qu'elle est : un événement du
         navigateur, que `gardeMedia` filtre au niveau de la fenêtre. */
      setTimeout(() => {
        /* `isConnected` : L'ÉLÉMENT EST-IL ENCORE DANS LA PAGE ?
           En développement, `React.StrictMode` monte, démonte puis REMONTE chaque effet.
           Le nettoyage différé s'exécutait donc après le remontage et effaçait le `src`
           du lecteur qui venait de naître : il restait bloqué sur « 0:00 / 0:00 », sans
           jamais charger. Ce test distingue le vrai démontage - l'élément est détaché -
           de la répétition de StrictMode, où il est toujours en place. */
        if (el.isConnected) return;
        try { el.pause(); el.removeAttribute("src"); el.load(); } catch { /* déjà détaché */ }
      }, 0);
    };
  }, []);

  const surErreur = (e) => {
    avalerAbandonMedia(e);
    const code = e?.currentTarget?.error?.code;
    // 3 = décodage, 4 = source non supportée. Celles-là méritent d'être montrées :
    // sans message, l'apprenant croit que ça charge encore et attend indéfiniment.
    if (code === 3 || code === 4) { setPanne(true); setChargement(false); }
  };

  return (
    /* Le conteneur ne porte QUE la mise en page. Le `style` de l'appelant part sur le
       MÉDIA, à qui il est destiné : posé ici, il donnait au wrapper le `maxHeight: 280`
       d'une vidéo qui, elle, s'affichait à sa hauteur naturelle - elle débordait, et ses
       contrôles natifs se retrouvaient hors de la zone visible. D'où une vidéo « sans
       boutons », impossible à mettre en plein écran. */
    <div style={{ position: "relative", width: "100%" }}>
      <Tag
        ref={ref}
        preload="metadata"
        onError={surErreur}
        onLoadedMetadata={() => { setChargement(false); setPanne(false); }}
        onCanPlay={() => setChargement(false)}
        // Le tampon se vide en cours de lecture : on le dit, au lieu de laisser croire
        // que le son s'est arrêté tout seul.
        onWaiting={() => setChargement(true)}
        onPlaying={() => setChargement(false)}
        // `playsInline` : sans lui, iOS passe toute vidéo en plein écran dès la lecture,
        // ce qui sort l'apprenant de son cours.
        playsInline
        style={{ width: "100%", display: "block", opacity: panne ? .35 : 1, ...style }}
        {...rest}
      />

      {chargement && !panne && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 11.5, color: "#64748b" }}>
          <span style={{
            width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
            border: "2px solid #cbd5e1", borderTopColor: "#0891b2",
            animation: "rotationMedia .7s linear infinite",
          }} />
          Chargement du média…
        </div>
      )}

      {panne && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: "#b45309", display: "flex", alignItems: "center", gap: 7 }}>
          <span>⚠️</span>
          <span>Ce média n'a pas pu être lu. Rechargez la page, ou signalez-le à votre formateur.</span>
        </div>
      )}

      {/* L'animation est déclarée ici plutôt que dans App.css : ce composant doit rester
          autonome, et une règle globale de plus dans un fichier qui impose déjà
          `h1 { text-align: center }` à toute l'application n'aiderait personne. */}
      <style>{"@keyframes rotationMedia { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}

/* Un contenu sans fichier, ou dont le lien n'est pas lisible : le DIRE. Rendre `null`
   affichait une carte vide, et l'apprenant croyait à une panne de son espace. */
const AvertissementOnb = ({ children }) => (
  <div style={{ background:"#fffbeb", border:"1px dashed #fcd34d", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#92400e" }}>
    {children}
  </div>
);

function MediaContenuOnb({ contenu, onVue, compact = false }) {
  const url = contenu?.fichier_url;
  if (!url) {
    return <AvertissementOnb>⚠️ Aucun fichier n'a encore été déposé pour ce contenu.</AvertissementOnb>;
  }
  const embed = urlEmbedVideo(url);
  const marquerVue = () => { try { onVue?.(); } catch {} };
  const lienStyle = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8,
    background: "#EFF6FF", color: "#1D4ED8", fontSize: 12, fontWeight: 700, textDecoration: "none",
  };

  switch (contenu.type) {
    case "video":
      if (embed) {
        return <iframe src={embed} title={contenu.titre} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ width:"100%", aspectRatio:"16/9", borderRadius:8, border:"none" }} />;
      }
      if (estFichierVideo(url)) {
        return <LecteurMedia tag="video" src={url} controls onPlay={marquerVue} style={{ width:"100%", maxHeight: compact ? 220 : 320, borderRadius:8, background:"#000" }} />;
      }
      /* Ni vidéo intégrable ni fichier. Le cas le plus fréquent est une CHAÎNE YouTube
         (`/@nom`) : elle ne désigne aucune vidéo précise, il n'y a donc rien à lire sur
         place. `<video src>` recevait du HTML et le navigateur répondait « MIME type non
         supporté » - un lecteur noir, sans explication. */
      return (
        <AvertissementOnb>
          <div style={{ fontWeight:700, marginBottom:4 }}>
            {estChaineYoutube(url) ? "Ce lien mène à une chaîne YouTube, pas à une vidéo" : "Cette vidéo ne peut pas être lue ici"}
          </div>
          <div style={{ marginBottom:6 }}>
            {estChaineYoutube(url)
              ? "Ouvrez la chaîne pour choisir une vidéo."
              : "Le lien déposé n'est ni un fichier vidéo ni une vidéo YouTube/Vimeo."}
          </div>
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={marquerVue}
            style={{ color:"#b45309", fontWeight:700, wordBreak:"break-all" }}>
            {estChaineYoutube(url) ? "Ouvrir la chaîne ↗" : "Ouvrir le lien ↗"}
          </a>
        </AvertissementOnb>
      );
    case "audio":
      return estFichierAudio(url)
        ? <LecteurMedia tag="audio" src={url} controls onPlay={marquerVue} style={{ width:"100%" }} />
        : (
          <AvertissementOnb>
            <div style={{ fontWeight:700, marginBottom:4 }}>Cet audio ne peut pas être lu ici</div>
            <a href={url} target="_blank" rel="noopener noreferrer" onClick={marquerVue}
              style={{ color:"#b45309", fontWeight:700, wordBreak:"break-all" }}>Ouvrir le lien ↗</a>
          </AvertissementOnb>
        );
    case "image":
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" onClick={marquerVue} style={{ display:"block" }}>
          <img src={url} alt={contenu.titre} loading="lazy" style={{ width:"100%", maxHeight: compact ? 260 : 420, objectFit:"contain", borderRadius:8, background:"#f1f5f9", display:"block" }} />
        </a>
      );
    case "pdf": {
      /* PAR LE RELAIS, jamais l'URL brute : Cloudinary refuse la livraison publique des PDF
         sur ce compte et répondait 401 - « Ouvrir le document » ne menait donc nulle part,
         pour tous les apprenants. Le relais existe déjà et sert aux blocs e-learning. */
      /* L'extension vient de l'URL, jamais du titre : ici `contenu.titre` est un intitulé
         (« COMPRENDRE VOTRE PROGRESSION… »), pas un nom de fichier. La lui demander
         donnait une extension absurde, et le relais recevait un mauvais type. */
      const ext    = extensionDe(url);
      const nomDoc = `${contenu.titre || "Document"}${ext ? `.${ext}` : ""}`;
      return (
        <div>
          <a href={urlDocument(url, { nom: nomDoc })} target="_blank" rel="noopener noreferrer" onClick={marquerVue} style={lienStyle}>
            📄 Ouvrir le document
          </a>
          {ext === "pdf" && (
            <iframe title={nomDoc} src={urlDocument(url, { nom: nomDoc, inline: true })}
              style={{ width:"100%", height: compact ? 260 : "55vh", marginTop:10, border:"1px solid #e5e7eb", borderRadius:8, background:"#fff" }} />
          )}
        </div>
      );
    }
    default:
      // Même relais : un « fichier » de type inconnu est le plus souvent un document.
      return <a href={urlDocument(url, { nom: `${contenu.titre || "Fichier"}${extensionDe(url) ? `.${extensionDe(url)}` : ""}` })} target="_blank" rel="noopener noreferrer" onClick={marquerVue} style={lienStyle}>📎 Ouvrir le fichier</a>;
  }
}

const ETAPES_ONBOARDING_DASH = [
  { id:"bienvenue",     icone:"🎬", titre:"Présentation & Bienvenue",  desc:"Découvrez BET : votre coach, votre classe et comment se déroule votre parcours." },
  { id:"regles",        icone:"📋", titre:"Règles & Charte",           desc:"Les engagements attendus : ponctualité, respect, participation active." },
  { id:"processus",     icone:"🗺️", titre:"Processus d'apprentissage", desc:"Comment se déroulent les sessions, devoirs, évaluations et votre progression." },
  { id:"certification", icone:"🏆", titre:"Votre certificat BET",      desc:"Les critères pour obtenir votre certificat : assiduité, notes, passage de niveau." },
];

/* ═══════════════════════════════════════════════════════
   ADAPTATION PAR TRANCHE D'ÂGE (profil_type → enfant/etudiant/adulte)
   Même principe que useAgeInterface côté bet-elearning : couleurs, ton et
   émojis adaptés, sans toucher à la personnalisation de couleur existante
   (ApprenantColorPicker) qui reste la couleur principale du dashboard.
═══════════════════════════════════════════════════════ */
const AGE_UI = {
  enfant: {
    label: "🧒 Espace Enfants",
    accent: "#F97316", accentClair: "#FCD34D",
    badgeBg: "linear-gradient(135deg,#FCD34D,#F97316)",
    salutation: p => `Bonjour ${p} ! 👋`,
    sousTexte: "Prêt(e) à apprendre aujourd'hui ? 🚀",
    emojiCours: "📚", emojiResultats: "🌟", emojiRessources: "🎨",
  },
  etudiant: {
    label: "🎒 Espace Étudiants",
    accent: "#8B5CF6", accentClair: "#EC4899",
    badgeBg: "linear-gradient(135deg,#8B5CF6,#EC4899)",
    salutation: p => `Salut ${p} !`,
    sousTexte: "Entraîne-toi et progresse à ton rythme.",
    emojiCours: "📖", emojiResultats: "🏅", emojiRessources: "📁",
  },
  adulte: {
    label: "👔 Espace Adultes",
    accent: "#0891B2", accentClair: "#0E4F6B",
    badgeBg: "linear-gradient(135deg,#0891B2,#0E7490)",
    salutation: p => `Bonjour, ${p}`,
    sousTexte: "Votre espace de formation professionnelle.",
    emojiCours: "📖", emojiResultats: "🏅", emojiRessources: "📁",
  },
};
const TRANCHE_DEPUIS_PROFIL_TYPE = { enfant: "enfant", etudiant: "etudiant", adulte: "adulte" };

/* ═══════════════════════════════════════════════════════
   MINI-JEUX - catalogue + banques de contenu (même contenu pédagogique
   que côté bet-elearning, réutilisable car même matière - anglais).
   Le filtrage par tranche se fait via `cible` réglé côté admin
   (contenus_mini_jeux_dash), pas via un catalogue figé côté frontend.
═══════════════════════════════════════════════════════ */
const CATALOGUE_JEUX = [
  { id:'qcm',         icone:'⚡', titre:'QCM Flash',              desc:'Traduis le plus vite possible - 15 secondes par mot !',    couleur:'#F97316', bg:'#FFF7ED' },
  { id:'association', icone:'🔀', titre:'Association',             desc:'Relie chaque mot anglais à sa traduction française.',       couleur:'#8B5CF6', bg:'#F5F3FF' },
  { id:'lacunes',     icone:'✏️', titre:'Mot manquant',           desc:'Complète chaque phrase avec le mot anglais qui manque.',   couleur:'#10B981', bg:'#ECFDF5' },
  { id:'anagramme',   icone:'🔤', titre:'Anagramme',              desc:"Retrouve le mot en remettant les lettres dans l'ordre !", couleur:'#F97316', bg:'#FFF7ED' },
  { id:'sprint',      icone:'⏱️', titre:'Sprint vocabulaire',     desc:'Maximum de traductions en 60 secondes chrono !',           couleur:'#EF4444', bg:'#FEF2F2' },
  { id:'vrai_faux',   icone:'🎯', titre:'Vrai ou Faux',           desc:'Juge si la règle de grammaire est correcte ou non.',        couleur:'#0D9488', bg:'#F0FDFA' },
  { id:'reordre',     icone:'🧩', titre:'Phrases à réordonner',   desc:'Remets les mots dans le bon ordre pour former la phrase.',  couleur:'#0891B2', bg:'#EFF6FF' },
  { id:'dialogue',    icone:'💬', titre:'Complétion de dialogue', desc:'Choisis la bonne réplique dans une conversation réelle.',    couleur:'#EC4899', bg:'#FDF2F8' },
  { id:'flashcards',  icone:'🃏', titre:'Flashcards',             desc:'Retourne les cartes et mémorise le vocabulaire clé.',       couleur:'#6366F1', bg:'#EEF2FF' },
  { id:'conjugaison', icone:'🔁', titre:'Conjugaison express',    desc:'Tape le passé simple des verbes irréguliers.',              couleur:'#7C3AED', bg:'#F5F3FF' },
  { id:'cecr',        icone:'🏆', titre:'Défi CECR',              desc:'Questions calibrées par niveau A1, A2, B1.',                couleur:'#F59E0B', bg:'#FFFBEB' },
  { id:'dictee',      icone:'📖', titre:'Dictée éclair',          desc:"Lis l'indice et écris le mot anglais correspondant.",       couleur:'#14B8A6', bg:'#F0FDFA' },
  { id:'traduction',   icone:'🔃', titre:'Traduction inverse',    desc:'Tape la traduction anglaise du mot français affiché.',      couleur:'#059669', bg:'#ECFDF5' },
  { id:'mots_croises', icone:'🔍', titre:'Mots croisés',          desc:"Remplis la grille à l'aide des définitions.",               couleur:'#D97706', bg:'#FFFBEB' },
  { id:'mots_caches',  icone:'🕵️', titre:'Mots cachés',           desc:'Trouve les mots cachés dans la grille de lettres.',         couleur:'#4338CA', bg:'#EEF2FF' },
];
const QCM_MOTS = [
  { mot:'Hello',       options:['Bonjour','Au revoir','Merci','S\'il vous plaît'], correct:'Bonjour' },
  { mot:'Goodbye',     options:['Bonjour','Bonsoir','Au revoir','Bienvenue'],      correct:'Au revoir' },
  { mot:'Thank you',   options:['Pardon','Merci','De rien','S\'il vous plaît'],    correct:'Merci' },
  { mot:'Please',      options:['Merci','Pardon','S\'il vous plaît','Bonjour'],    correct:'S\'il vous plaît' },
  { mot:'Sorry',       options:['Bienvenue','Désolé','Bonjour','Bonsoir'],         correct:'Désolé' },
  { mot:'Yes',         options:['Non','Peut-être','Oui','Jamais'],                 correct:'Oui' },
  { mot:'No',          options:['Oui','Non','Peut-être','Toujours'],               correct:'Non' },
  { mot:'Good morning',options:['Bonsoir','Bonne nuit','Bonjour','Bon après-midi'],correct:'Bonjour' },
  { mot:'Friend',      options:['Ennemi','Famille','Ami','Collègue'],              correct:'Ami' },
  { mot:'Water',       options:['Feu','Eau','Air','Terre'],                        correct:'Eau' },
];
const ASSOC_PAIRES_DATA = [
  { fr:'Bonjour',   en:'Hello' },
  { fr:'Merci',     en:'Thank you' },
  { fr:'Chat',      en:'Cat' },
  { fr:'Chien',     en:'Dog' },
  { fr:'Maison',    en:'House' },
  { fr:'Voiture',   en:'Car' },
];
const LACUNES_DATA = [
  { phrase:'My ___ is Aminata.', mot:'name',    indice:'Ton prénom/nom' },
  { phrase:'I am ___ years old.', mot:'twelve',  indice:'Ton âge (12)' },
  { phrase:'___ morning !',       mot:'Good',    indice:'Salutation matinale' },
  { phrase:'Nice to ___ you !',   mot:'meet',    indice:'Enchanté de vous rencontrer' },
  { phrase:'I ___ from Abidjan.', mot:'am',      indice:'Verbe être (1ère pers.)' },
];
const ANAGRAMME_DATA = [
  { mot:'CAT',   melange:'TCA',  indice:'🐱 Un animal domestique' },
  { mot:'DOG',   melange:'GOD',  indice:'🐶 Le meilleur ami de l\'homme' },
  { mot:'SUN',   melange:'UNS',  indice:'☀️ Brille dans le ciel' },
  { mot:'TREE',  melange:'EETR', indice:'🌳 Pousse dans la forêt' },
  { mot:'BIRD',  melange:'RIBD', indice:'🐦 Vole dans les airs' },
  { mot:'BLUE',  melange:'ULBE', indice:'🔵 Une couleur' },
  { mot:'FISH',  melange:'HIFSF', indice:'🐟 Vit dans l\'eau' },
  { mot:'STAR',  melange:'RATS', indice:'⭐ Brille la nuit' },
];
const SPRINT_MOTS = [
  {en:'apple',fr:'pomme'},{en:'book',fr:'livre'},{en:'car',fr:'voiture'},{en:'door',fr:'porte'},
  {en:'eye',fr:'œil'},{en:'fish',fr:'poisson'},{en:'girl',fr:'fille'},{en:'hand',fr:'main'},
  {en:'ice',fr:'glace'},{en:'jump',fr:'sauter'},{en:'key',fr:'clé'},{en:'lamp',fr:'lampe'},
  {en:'moon',fr:'lune'},{en:'nose',fr:'nez'},{en:'open',fr:'ouvrir'},{en:'pen',fr:'stylo'},
  {en:'rain',fr:'pluie'},{en:'sea',fr:'mer'},{en:'tree',fr:'arbre'},{en:'up',fr:'en haut'},
  {en:'voice',fr:'voix'},{en:'wind',fr:'vent'},{en:'year',fr:'année'},{en:'zero',fr:'zéro'},
  {en:'air',fr:'air'},{en:'bed',fr:'lit'},{en:'cat',fr:'chat'},{en:'day',fr:'jour'},
  {en:'eat',fr:'manger'},{en:'fly',fr:'voler'},
];
const VRAI_FAUX_DATA = [
  { enonce:'"I goed to school yesterday" is correct.',        correct:false, explication:'❌ Faux - le passé de "go" est "went" (irrégulier). ✅ "I went to school."' },
  { enonce:'"She doesn\'t like coffee" is correct.',          correct:true,  explication:'✅ Vrai - on utilise "doesn\'t" à la 3e personne du singulier.' },
  { enonce:'"Childrens are playing" is correct.',             correct:false, explication:'❌ Faux - "children" est déjà le pluriel irrégulier de "child". ✅ "Children are playing."' },
  { enonce:'"He has been living here for 5 years" is correct.',correct:true, explication:'✅ Vrai - present perfect + "for" pour une durée qui continue.' },
  { enonce:'"I am agree with you" is correct.',               correct:false, explication:'❌ Faux - "agree" est un verbe, pas un adjectif. ✅ "I agree with you."' },
  { enonce:'"Much students were absent" is correct.',         correct:false, explication:'❌ Faux - "many" pour les noms dénombrables. ✅ "Many students were absent."' },
  { enonce:'"She speaks English very well" is correct.',      correct:true,  explication:'✅ Vrai - structure correcte avec adverbe de manière après le complément.' },
  { enonce:'"I didn\'t went to the party" is correct.',       correct:false, explication:'❌ Faux - après "didn\'t", on utilise l\'infinitif. ✅ "I didn\'t go to the party."' },
];
const REORDRE_DATA = [
  { mots:['I','school','to','go'],               correct:['I','go','to','school'],               fr:'Je vais à l\'école.' },
  { mots:['she','English','speaks'],              correct:['she','speaks','English'],              fr:'Elle parle anglais.' },
  { mots:['cats','love','I'],                     correct:['I','love','cats'],                     fr:'J\'adore les chats.' },
  { mots:['playing','are','they','football'],     correct:['they','are','playing','football'],     fr:'Ils jouent au foot.' },
  { mots:['yesterday','went','I','market','to','the'], correct:['I','went','to','the','market','yesterday'], fr:'Je suis allé(e) au marché hier.' },
  { mots:['much','how','cost','does','it'],       correct:['how','much','does','it','cost'],       fr:'Combien ça coûte ?' },
  { mots:['rain','it','will','tomorrow'],         correct:['it','will','rain','tomorrow'],         fr:'Il va pleuvoir demain.' },
  { mots:['never','coffee','drunk','have','I'],   correct:['I','have','never','drunk','coffee'],   fr:'Je n\'ai jamais bu de café.' },
];
const DIALOGUE_DATA = [
  { situation:'☕ Au café', repliques:[
    { loc:'Serveur', texte:'Good morning! What would you like?' },
    { loc:'Toi', options:['I would like a coffee, please.','Give me coffee now!','Coffee! Coffee!'], correct:0 },
    { loc:'Serveur', texte:'Of course! Anything else?' },
    { loc:'Toi', options:['No, thank you.','No want nothing.','I no want more.'], correct:0 },
    { loc:'Serveur', texte:'That\'ll be 500 FCFA, please.' },
    { loc:'Toi', options:['Here you are.','Take money!','Give change!'], correct:0 },
  ]},
  { situation:'🏪 En magasin', repliques:[
    { loc:'Vendeur', texte:'Can I help you?' },
    { loc:'Toi', options:['I\'m looking for a blue shirt.','I want shirt blue.','Blue shirt give me.'], correct:0 },
    { loc:'Vendeur', texte:'What size are you?' },
    { loc:'Toi', options:['I\'m a medium, please.','My size medium.','Medium I am.'], correct:0 },
    { loc:'Vendeur', texte:'Here you go. Would you like to try it on?' },
    { loc:'Toi', options:['Yes, please. Where are the fitting rooms?','Yes. Where room?','Yes fitting room where?'], correct:0 },
  ]},
  { situation:'📞 Au téléphone', repliques:[
    { loc:'Réceptionniste', texte:'Good afternoon, BET Training. How can I help you?' },
    { loc:'Toi', options:['I\'d like to book an appointment, please.','I want appointment!','Appointment make for me.'], correct:0 },
    { loc:'Réceptionniste', texte:'Of course. What date suits you?' },
    { loc:'Toi', options:['Is Wednesday at 10am available?','Wednesday 10 ok?','I want Wednesday morning.'], correct:0 },
    { loc:'Réceptionniste', texte:'Yes, that works. Can I have your name, please?' },
    { loc:'Toi', options:['My name is Aminata Koné.','Name me Aminata.','I Aminata Koné.'], correct:0 },
  ]},
];
const FLASHCARDS_DATA = [
  { recto:'to be',     verso:'être\nam / is / are',         categorie:'Verbes essentiels' },
  { recto:'to have',   verso:'avoir\nhave / has',           categorie:'Verbes essentiels' },
  { recto:'to go',     verso:'aller\ngo → went (irrég.)',   categorie:'Verbes essentiels' },
  { recto:'to make',   verso:'faire / fabriquer\nmake → made', categorie:'Verbes essentiels' },
  { recto:'to take',   verso:'prendre\ntake → took',        categorie:'Verbes essentiels' },
  { recto:'to come',   verso:'venir\ncome → came',          categorie:'Verbes essentiels' },
  { recto:'Present Perfect', verso:'have/has + past participle\n"I have lived here for 5 years."', categorie:'Grammaire' },
  { recto:'Past Simple', verso:'Action terminée dans le passé\n"I went to school yesterday."',     categorie:'Grammaire' },
  { recto:'will + verb', verso:'Futur simple\n"It will rain tomorrow."',                           categorie:'Grammaire' },
  { recto:'since vs for', verso:'"since" = point de départ → since 2020\n"for" = durée → for 3 years', categorie:'Grammaire' },
];
const CONJUGAISON_DATA = [
  { infinitif:'go',    temps:'passé simple (I)',   correct:'went',   indice:'Aller (irrégulier)' },
  { infinitif:'be',    temps:'passé simple (I)',   correct:'was',    indice:'Être (irrégulier)' },
  { infinitif:'have',  temps:'passé simple (I)',   correct:'had',    indice:'Avoir (irrégulier)' },
  { infinitif:'see',   temps:'passé simple (I)',   correct:'saw',    indice:'Voir (irrégulier)' },
  { infinitif:'come',  temps:'passé simple (I)',   correct:'came',   indice:'Venir (irrégulier)' },
  { infinitif:'take',  temps:'passé simple (I)',   correct:'took',   indice:'Prendre (irrégulier)' },
  { infinitif:'give',  temps:'passé simple (I)',   correct:'gave',   indice:'Donner (irrégulier)' },
  { infinitif:'speak', temps:'passé simple (I)',   correct:'spoke',  indice:'Parler (irrégulier)' },
  { infinitif:'write', temps:'passé simple (I)',   correct:'wrote',  indice:'Écrire (irrégulier)' },
  { infinitif:'know',  temps:'passé simple (I)',   correct:'knew',   indice:'Savoir (irrégulier)' },
];
const CECR_DATA = [
  { niveau:'A1', q:'What is the plural of "child"?', options:['childs','children','childes','child'], correct:'children' },
  { niveau:'A1', q:'Choose the correct form: "She ___ coffee."', options:['like','likes','liking','liked'], correct:'likes' },
  { niveau:'A2', q:'Complete: "I have lived here ___ 2020."', options:['for','since','during','while'], correct:'since' },
  { niveau:'A2', q:'"I went" is the past of which verb?', options:['to come','to go','to get','to give'], correct:'to go' },
  { niveau:'B1', q:'Which sentence is in the passive voice?', options:['She read the book.','The book was read by her.','She reads books.','She will read.'], correct:'The book was read by her.' },
  { niveau:'B1', q:'Complete: "If I ___ you, I would study harder."', options:['am','was','were','be'], correct:'were' },
  { niveau:'A1', q:'"How much does it cost?" - best reply?', options:['It costs 500 FCFA.','It cost 500 FCFA.','500 FCFA cost it.','Costs 500 FCFA it.'], correct:'It costs 500 FCFA.' },
  { niveau:'A2', q:'Choose the correct word: "There ___ a lot of students."', options:['is','are','am','be'], correct:'are' },
  { niveau:'B1', q:'Which is correct?', options:['I am agree','I agree','I am agreeing','I agreed to'], correct:'I agree' },
  { niveau:'A1', q:'What does "beautiful" mean?', options:['laid','petit','magnifique','rapide'], correct:'magnifique' },
];
const DICTEE_DATA = [
  { mot:'beautiful',  indice:'adj. 🌸 - magnifique' },
  { mot:'necessary',  indice:'adj. ✅ - nécessaire' },
  { mot:'Wednesday',  indice:'📅 - le milieu de la semaine' },
  { mot:'February',   indice:'📅 - 2ème mois de l\'année' },
  { mot:'government', indice:'🏛️ - autorité qui dirige un pays' },
  { mot:'knowledge',  indice:'🧠 - ce qu\'on sait, le savoir' },
  { mot:'language',   indice:'🗣️ - ce qu\'on parle (ex: English)' },
  { mot:'experience', indice:'💼 - ce qu\'on a vécu ou appris' },
  { mot:'different',  indice:'↔️ - pas pareil, distinct' },
  { mot:'important',  indice:'⭐ - qui compte beaucoup' },
];
// Traduction inverse - FR → EN
const TRADUCTION_DATA = [
  { fr:'pomme',    mot:'apple' },
  { fr:'chien',    mot:'dog' },
  { fr:'maison',   mot:'house' },
  { fr:'voiture',  mot:'car' },
  { fr:'livre',    mot:'book' },
  { fr:'école',    mot:'school' },
  { fr:'ami',      mot:'friend' },
  { fr:'travail',  mot:'work' },
  { fr:'temps',    mot:'time' },
  { fr:'famille',  mot:'family' },
];
// Mots croisés - une grille fixe (lignes/colonnes 0-indexées), 2 mots horizontaux + 2 verticaux
const CROSSWORD = {
  lignes: 5, colonnes: 5,
  cases: { '1,2':'M','2,1':'C','2,2':'A','2,3':'T','3,2':'P','3,3':'E','4,1':'S','4,2':'U','4,3':'N' },
  mots: [
    { id:'map', numero:1, dir:'v', ligne:1, colonne:2, longueur:3, mot:'MAP', indice:'🗺️ Aide à trouver son chemin' },
    { id:'cat', numero:2, dir:'h', ligne:2, colonne:1, longueur:3, mot:'CAT', indice:"🐱 Un animal qui dit 'meow'" },
    { id:'ten', numero:3, dir:'v', ligne:2, colonne:3, longueur:3, mot:'TEN', indice:'🔟 Le nombre après neuf' },
    { id:'sun', numero:4, dir:'h', ligne:4, colonne:1, longueur:3, mot:'SUN', indice:'☀️ Brille pendant la journée' },
  ],
};
// Mots cachés - grille de lettres avec mots placés horizontalement, verticalement et en diagonale
const WORDSEARCH_TAILLE = 8;
const WORDSEARCH_MOTS_POS = [
  { mot:'CAT', ligne:0, colonne:0, dir:'h' },
  { mot:'DOG', ligne:0, colonne:4, dir:'v' },
  { mot:'SUN', ligne:3, colonne:1, dir:'h' },
  { mot:'RUN', ligne:2, colonne:6, dir:'v' },
  { mot:'BIG', ligne:5, colonne:0, dir:'diag' },
];
function construireGrilleMotsCaches() {
  const grille = Array.from({ length: WORDSEARCH_TAILLE }, (_, r) =>
    Array.from({ length: WORDSEARCH_TAILLE }, (_, c) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[(r * 7 + c * 5) % 26])
  );
  WORDSEARCH_MOTS_POS.forEach(({ mot, ligne, colonne, dir }) => {
    const [dr, dc] = dir === 'h' ? [0, 1] : dir === 'v' ? [1, 0] : [1, 1];
    mot.split('').forEach((lettre, i) => { grille[ligne + dr * i][colonne + dc * i] = lettre; });
  });
  return grille;
}

/* ═══════════════════════════════════════════════════════
   VALEURS DE REPLI (utilisées tant que l'API n'a pas répondu)
═══════════════════════════════════════════════════════ */
const PROFIL_DEFAUT = {
  id: null, nom:"", prenom:"", email:"",
  phone:"", avatar:"?",
  niveau:null, testNiveauResultat:"-",
  dateInscription:null, objectif:"",
  coach: { nom:"", email:"" },
  typeCours: null,
  classe: "-",
  parent: null,
};

// Libellés type_cours réels (cf. valeurs posées à la création de la classe côté
// onboarding/PA : en_ligne, presentiel, domicile, centre, prive) - un ternaire à 2 branches
// avec repli "Entreprise" affichait ce libellé trompeur pour toutes les autres valeurs.
const TYPE_COURS_LABELS = {
  en_ligne:   "En ligne",
  presentiel: "Présentiel",
  domicile:   "Cours à domicile",
  centre:     "Cours au centre",
  prive:      "Coaching privé",
};

/* ═══════════════════════════════════════════════════════
   COMPOSANTS RÉUTILISABLES
═══════════════════════════════════════════════════════ */
const ProgressRing = ({ pct, size = 80, stroke = 6, color = PRIMARY_COLOR }) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform:"rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"/>
    </svg>
  );
};

const ProgressBar = ({ value, color = PRIMARY_COLOR, height = 7, animated = false }) => (
  <div style={{ height, background:"#e5e7eb", borderRadius:height, overflow:"hidden" }}>
    <div style={{ height:"100%", width:`${Math.min(100, value)}%`, background:color, borderRadius:height,
      transition: animated ? "width 1s ease" : "none" }} />
  </div>
);

const StatCard = ({ label, value, color, icon, sub, onClick }) => (
  <div onClick={onClick} style={{ background:"#fff", padding:16, borderRadius:12, boxShadow:"0 1px 6px rgba(0,0,0,0.06)", display:"flex", alignItems:"center", gap:12, cursor:onClick?"pointer":"default", transition:"transform .15s", border:"1px solid #f1f5f9" }}>
    <div style={{ width:46, height:46, borderRadius:10, background:color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{icon}</div>
    <div style={{ minWidth:0 }}>
      <div style={{ fontSize:11, color:"#9ca3af" }}>{label}</div>
      <div style={{ fontSize:21, fontWeight:800, color, lineHeight:1.2 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"#9ca3af", marginTop:1 }}>{sub}</div>}
    </div>
  </div>
);

const NiveauBadge = ({ niveau }) => {
  const m = NIVEAU_META[niveau] || NIVEAU_META.A1;
  return <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:800, background:m.bg, color:m.color }}>{niveau} - {m.label}</span>;
};

/* Filtres et pagination de l'onglet « Mes cours ». */
const champCours = { padding:"8px 11px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:12.5,
  background:"#fff", outline:"none", fontFamily:"inherit", color:"#0f172a" };

const BtnPageCours = ({ onClick, disabled, children }) => (
  <button onClick={onClick} disabled={disabled}
    style={{ padding:"6px 11px", borderRadius:7, fontSize:12, fontWeight:700, fontFamily:"inherit",
      border:`1px solid ${disabled ? "#e2e8f0" : "#cbd5e1"}`, background: disabled ? "#f1f5f9" : "#fff",
      color: disabled ? "#cbd5e1" : "#334155", cursor: disabled ? "not-allowed" : "pointer" }}>
    {children}
  </button>
);

const Modal = ({ title, onClose, children, wide }) => (
  <div style={modalOverlay}>
    <div style={{ ...modalBox, width: wide ? 680 : 520, maxHeight:"90vh", overflowY:"auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <h3 style={{ margin:0, fontSize:16 }}>{title}</h3>
        <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#6b7280" }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════
   PAGE PRINCIPALE
═══════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════
   COMPOSANT LECTEUR AUDIO RÉEL
═══════════════════════════════════════════════════════ */
const AudioPlayer = ({ url, titre, cours, duree, description }) => {
  const audioRef = useRef(null);
  const progressRef = useRef(null);
  const [playing, setPlaying]       = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime]   = useState(0);
  const [volume, setVolume]         = useState(1);
  const [speed, setSpeed]           = useState(1);
  const [loaded, setLoaded]         = useState(false);
  const [error, setError]           = useState(false);

  const fmtTime = (s) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2,"0")}`;
  };

  const toggle = useCallback(() => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); }
    else { audioRef.current.play().catch(() => setError(true)); }
  }, [playing]);

  const skip = (s) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(totalTime, audioRef.current.currentTime + s));
    }
  };

  const handleSeek = (e) => {
    if (!progressRef.current || !totalTime) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (audioRef.current) audioRef.current.currentTime = pct * totalTime;
  };

  const handleVolume = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const changeSpeed = (s) => {
    setSpeed(s);
    if (audioRef.current) audioRef.current.playbackRate = s;
  };

  const pct = totalTime ? (currentTime / totalTime) * 100 : 0;

  return (
    <div>
      {/* Élément audio natif caché */}
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onTimeUpdate={e => setCurrentTime(e.target.currentTime)}
        onLoadedMetadata={e => { setTotalTime(e.target.duration); setLoaded(true); }}
        onEnded={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setError(true)}
      />

      {/* En-tête coloré */}
      <div style={{ padding:"20px 24px", borderRadius:"12px 12px 0 0", background:"linear-gradient(135deg,#059669,#34d399)", color:"#fff", textAlign:"center", marginBottom:0 }}>
        <div style={{ fontSize:44, marginBottom:6 }}>🎧</div>
        <div style={{ fontSize:15, fontWeight:700, lineHeight:1.3, marginBottom:4 }}>{titre}</div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.8)" }}>📚 {cours} · ⏱ {duree}</div>
      </div>

      {/* Lecteur */}
      <div style={{ padding:"16px 20px", borderRadius:"0 0 12px 12px", background:"#f0fdf4", border:"1px solid #bbf7d0", marginBottom:14 }}>
        {error ? (
          <div style={{ textAlign:"center", padding:"12px 0", color:"#dc2626", fontSize:13 }}>
            ⚠️ Impossible de charger l'audio. Vérifiez votre connexion.
          </div>
        ) : (
          <>
            {/* Barre de progression cliquable */}
            <div
              ref={progressRef}
              onClick={handleSeek}
              style={{ height:8, background:"#d1fae5", borderRadius:4, cursor:"pointer", marginBottom:8, position:"relative", overflow:"hidden" }}
            >
              <div style={{ height:"100%", width:`${pct}%`, background:"#059669", borderRadius:4, transition:"width .1s linear" }} />
              {/* Curseur */}
              <div style={{ position:"absolute", top:-2, left:`${pct}%`, transform:"translateX(-50%)", width:14, height:14, borderRadius:"50%", background:"#059669", border:"2px solid #fff", boxShadow:"0 1px 4px rgba(0,0,0,.2)", transition:"left .1s linear" }} />
            </div>

            {/* Temps */}
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#6b7280", marginBottom:14 }}>
              <span>{fmtTime(currentTime)}</span>
              <span>{loaded ? fmtTime(totalTime) : duree}</span>
            </div>

            {/* Contrôles principaux */}
            <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:12, marginBottom:14 }}>
              <button onClick={()=>skip(-10)} title="Reculer 10s" style={{ padding:"8px 14px", background:"#e5e7eb", border:"none", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:600, color:"#374151" }}>⏮ 10s</button>

              <button
                onClick={toggle}
                style={{ width:52, height:52, borderRadius:"50%", background:playing?"#dc2626":"#059669", border:"none", cursor:"pointer", fontSize:22, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 2px 8px rgba(0,0,0,.2)", transition:"background .2s" }}
              >
                {playing ? "⏸" : "▶️"}
              </button>

              <button onClick={()=>skip(10)} title="Avancer 10s" style={{ padding:"8px 14px", background:"#e5e7eb", border:"none", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:600, color:"#374151" }}>10s ⏭</button>
            </div>

            {/* Volume + Vitesse */}
            <div style={{ display:"flex", gap:16, alignItems:"center", justifyContent:"center", flexWrap:"wrap" }}>
              {/* Volume */}
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:14 }}>{volume===0?"🔇":volume<0.5?"🔉":"🔊"}</span>
                <input type="range" min="0" max="1" step="0.05" value={volume} onChange={handleVolume}
                  style={{ width:80, accentColor:"#059669" }} />
              </div>

              {/* Vitesse */}
              <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                <span style={{ fontSize:11, color:"#6b7280", marginRight:2 }}>Vitesse :</span>
                {[0.75, 1, 1.25, 1.5].map(s => (
                  <button key={s} onClick={()=>changeSpeed(s)} style={{ padding:"3px 8px", borderRadius:6, border:"1px solid", fontSize:11, fontWeight:600, cursor:"pointer", background:speed===s?"#059669":"#fff", color:speed===s?"#fff":"#374151", borderColor:speed===s?"#059669":"#e5e7eb" }}>{s}×</button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Description */}
      {description && (
        <p style={{ fontSize:12, color:"#6b7280", lineHeight:1.6, margin:"8px 0 0" }}>
          📝 {description}
        </p>
      )}
    </div>
  );
};

export default function EspaceApprenant() {
  const navigate = useNavigate();

  // ── Auth + statut compte ─────────────────────────────────────
  const [authLoading, setAuthLoading] = useState(true);
  const [espaceInfo, setEspaceInfo]   = useState(null); // { actif, profil, groupe }
  const [accesStatus, setAccesStatus] = useState(null); // { nb_absences, seuil_blocage, acces_bloque }
  const monUtilisateurId = useMemo(() => {
    try {
      const token = localStorage.getItem("user_token");
      if (!token) return null;
      return JSON.parse(atob(token.split(".")[1])).sub || null;
    } catch { return null; }
  }, []);

  const [activeTab, setActiveTab] = useTabState("dashboard");

  // ── Dictionnaire (EN↔FR, appels directs Free Dictionary API + MyMemory) ──
  const [dicoSens,       setDicoSens]       = useState("ang_fr"); // "ang_fr" | "fr_ang"
  const [dicoQuery,      setDicoQuery]      = useState("");
  const [dicoResultat,   setDicoResultat]   = useState(null);
  const [dicoTraduction, setDicoTraduction] = useState("");
  const [dicoChargement, setDicoChargement] = useState(false);
  const [dicoErreur,     setDicoErreur]     = useState("");
  const [dicoHistorique, setDicoHistorique] = useState([]);

  // ── Gamification (points, badges, classement du groupe) ──
  const [gamifLoading,   setGamifLoading]   = useState(false);
  const [gamifSolde,     setGamifSolde]     = useState(0);
  const [gamifTx,        setGamifTx]        = useState([]);
  const [gamifBadges,    setGamifBadges]    = useState([]);
  const [gamifClassement,setGamifClassement]= useState([]);
  // Badges de fidélité "Happy to have You" (1 à 24 mois d'ancienneté) - distincts des badges
  // gamification ci-dessus, calculés côté serveur depuis la date de début réelle du dossier.
  const [badgesFidelite, setBadgesFidelite] = useState([]);
  const [ancienneteMois, setAncienneteMois] = useState(0);
  const [badgeFideliteOuvert, setBadgeFideliteOuvert] = useState(null);

  async function rechercherMotDico(e) {
    e && e.preventDefault && e.preventDefault();
    const mot = dicoQuery.trim();
    if (!mot) return;
    setDicoChargement(true);
    setDicoErreur("");
    setDicoResultat(null);
    setDicoTraduction("");
    try {
      let motAnglais = mot;
      if (dicoSens === "fr_ang") {
        const tResp = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(mot)}&langpair=fr|en`);
        const tData = await tResp.json();
        motAnglais = tData?.responseData?.translatedText || mot;
      }
      const resp = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(motAnglais.toLowerCase())}`);
      if (!resp.ok) throw new Error("Mot non trouvé dans le dictionnaire.");
      const data = await resp.json();
      const entree = data[0];
      const tResp2 = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(motAnglais)}&langpair=en|fr`);
      const tData2 = await tResp2.json();
      const trad = tData2?.responseData?.translatedText || "";
      setDicoResultat(entree);
      setDicoTraduction(trad);
      setDicoHistorique(prev => {
        const filtered = prev.filter(h => h.mot !== motAnglais.toLowerCase());
        return [{ mot: motAnglais.toLowerCase(), trad }, ...filtered].slice(0, 10);
      });
    } catch (err) {
      setDicoErreur(err.message || "Erreur lors de la recherche. Vérifiez votre connexion.");
    } finally {
      setDicoChargement(false);
    }
  }

  // ── Contenus onboarding (guide de bienvenue + bibliothèque de vidéos) ──
  const [contenusOnb, setContenusOnb]           = useState([]);
  // Contenus dépliés dans le modal de bienvenue : le règlement intérieur fait plusieurs
  // dizaines de lignes, l'afficher en entier d'emblée noierait les autres rubriques.
  const [onbDeplie, setOnbDeplie] = useState(new Set());
  const [contenusVideosLib, setContenusVideosLib] = useState([]);
  const [contenusOnbLoading, setContenusOnbLoading] = useState(false);
  const [etapeOnbOuverte, setEtapeOnbOuverte]   = useState(null);
  const [showBienvenueModal, setShowBienvenueModal] = useState(false);

  // ── Mini-jeux ──────────────────────────────────────────
  const [jeu, setJeu] = useState(null); // id de l'instance en cours de jeu (plusieurs instances possibles par type)
  const [jeuxInstances, setJeuxInstances] = useState(null); // null = pas encore chargé ; sinon liste des instances actives
  const [mesJeuxKpis, setMesJeuxKpis] = useState(null);
  const [mesJeuxParJeu, setMesJeuxParJeu] = useState({}); // clé = id de l'instance
  const attemptsRef = useRef({});
  const jeuActif = jeuxInstances?.find(x => x.id === jeu) || null;
  const jeuActifType = jeuActif?.type || null;

  // QCM Flash
  const [qcmIdx, setQcmIdx] = useState(0);
  const [qcmScore, setQcmScore] = useState(0);
  const [qcmChoix, setQcmChoix] = useState(null);
  const [qcmFini, setQcmFini] = useState(false);
  const [qcmTemps, setQcmTemps] = useState(15);
  // Association
  const [assocSel, setAssocSel] = useState(null);
  const [assocOk, setAssocOk] = useState([]);
  // Mot manquant
  const [lacuneIdx, setLacuneIdx] = useState(0);
  const [lacuneInput, setLacuneInput] = useState('');
  const [lacuneScore, setLacuneScore] = useState(0);
  const [lacuneFini, setLacuneFini] = useState(false);
  const [lacuneMontre, setLacuneMontre] = useState(false);
  // Anagramme
  const [anaIdx, setAnaIdx] = useState(0);
  const [anaInput, setAnaInput] = useState('');
  const [anaScore, setAnaScore] = useState(0);
  const [anaFini, setAnaFini] = useState(false);
  const [anaMontre, setAnaMontre] = useState(false);
  // Sprint vocabulaire
  const [sprintScore, setSprintScore] = useState(0);
  const [sprintTemps, setSprintTemps] = useState(60);
  const [sprintFini, setSprintFini] = useState(false);
  const [sprintIdx, setSprintIdx] = useState(0);
  const [sprintMots, setSprintMots] = useState([]);
  // Vrai ou Faux
  const [vfIdx, setVfIdx] = useState(0);
  const [vfScore, setVfScore] = useState(0);
  const [vfFini, setVfFini] = useState(false);
  const [vfChoix, setVfChoix] = useState(null);
  // Phrases à réordonner
  const [reordreIdx, setReordreIdx] = useState(0);
  const [reordreScore, setReordreScore] = useState(0);
  const [reodreFini, setReodreFini] = useState(false);
  const [reodreMots, setReodreMots] = useState([]);
  const [reordreSelec, setReordreSelec] = useState([]);
  const [reordreValide, setReordreValide] = useState(null);
  // Complétion de dialogue
  const [dialogueIdx, setDialogueIdx] = useState(0);
  const [dialogueEtape, setDialogueEtape] = useState(0);
  const [dialogueScore, setDialogueScore] = useState(0);
  const [dialogueFini, setDialogueFini] = useState(false);
  // Flashcards
  const [flashIdx, setFlashIdx] = useState(0);
  const [flashRetourne, setFlashRetourne] = useState(false);
  const [flashSus, setFlashSus] = useState([]);
  // Conjugaison express
  const [conjIdx, setConjIdx] = useState(0);
  const [conjInput, setConjInput] = useState('');
  const [conjScore, setConjScore] = useState(0);
  const [conjFini, setConjFini] = useState(false);
  const [conjMontre, setConjMontre] = useState(false);
  // Défi CECR
  const [cecrIdx, setCecrIdx] = useState(0);
  const [cecrScore, setCecrScore] = useState(0);
  const [cecrFini, setCecrFini] = useState(false);
  const [cecrChoix, setCecrChoix] = useState(null);
  // Dictée éclair
  const [dicteeIdx, setDicteeIdx] = useState(0);
  const [dicteeInput, setDicteeInput] = useState('');
  const [dicteeScore, setDicteeScore] = useState(0);
  const [dicteeFini, setDicteeFini] = useState(false);
  const [dicteeMontre, setDicteeMontre] = useState(false);
  // Traduction inverse
  const [traIdx, setTraIdx] = useState(0);
  const [traInput, setTraInput] = useState('');
  const [traScore, setTraScore] = useState(0);
  const [traFini, setTraFini] = useState(false);
  const [traMontre, setTraMontre] = useState(false);
  // Mots croisés
  const [crossInputs, setCrossInputs] = useState({});
  const [crossValide, setCrossValide] = useState(null); // null | { motsOk: [id...], score }
  const [crossFini, setCrossFini] = useState(false);
  // Mots cachés
  const [wsGrille, setWsGrille] = useState(() => construireGrilleMotsCaches());
  const [wsDebut, setWsDebut] = useState(null);
  const [wsTrouves, setWsTrouves] = useState([]);
  const [wsCellsTrouvees, setWsCellsTrouvees] = useState([]);
  const [wsFini, setWsFini] = useState(false);
  const [tentativesJeu, setTentativesJeu] = useState({
    qcm:0, association:0, lacunes:0, anagramme:0, sprint:0,
    vrai_faux:0, reordre:0, dialogue:0, flashcards:0, conjugaison:0, cecr:0, dictee:0,
    traduction:0, mots_croises:0, mots_caches:0,
  });

  const [selectedCours, setSelectedCours] = useState(null);
  const [showCoursModal, setShowCoursModal] = useState(false);
  const [filterRessource, setFilterRess] = useState("Tous");
  const [filterFavori, setFilterFav] = useState(false);
  const [showMessageModal, setShowMsgModal] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [semaineCourante, setSemaine] = useState(0);
  const [planningDateFrom, setPlanningDateFrom] = useState("");
  const [planningDateTo,   setPlanningDateTo]   = useState("");
  const [planningLiveFil,  setPlanningLiveFil]  = useState("tous"); // "tous" | "a_venir" | "terminee"
  const [planningPage,     setPlanningPage]     = useState(1);
  const PLANNING_PER_PAGE = 8;

  const [showPaiementModal, setShowPaiementModal] = useState(false);
  const [cpLoading, setCpLoading]     = useState(false);
  const [cpTranche, setCpTranche]     = useState(null);
  const certifCount = 0; // pas de certifications mock - données réelles à venir

  const [mesEvals, setMesEvals] = useState([]);           // évaluations réelles (BDD)
  const [mesEvalsLoading, setMesEvalsLoading] = useState(false);
  const [mesEvalsErreur, setMesEvalsErreur] = useState(null);
  const [mesResultatsDB, setMesResultatsDB] = useState([]); // résultats corrigés (BDD)
  const [mesResultatsDBLoading, setMesResultatsDBLoading] = useState(false);
  const [mesContacts, setMesContacts] = useState([]); // contacts réels (coach, commercial, PA)
  const [mesContactsLoading, setMesContactsLoading] = useState(false);
  /* Écrire et appeler depuis l'espace, au lieu des liens `mailto:`/`tel:` qui n'ouvraient
     rien sur un poste sans client de messagerie configuré. */
  const [contactMailModal, setContactMailModal] = useState(null); // { contact }
  const [contactMailForm,  setContactMailForm]  = useState({ sujet:"", message:"" });
  const [contactMailEnvoi, setContactMailEnvoi] = useState(false);
  const [contactTelModal,  setContactTelModal]  = useState(null); // { contact }
  const [telCopie,         setTelCopie]         = useState(false);
  // Devoir submission states
  const [devoirOuvert, setDevoirOuvert] = useState(null); // devoir sélectionné pour soumission
  const [submitTexte, setSubmitTexte] = useState("");
  const [submitQcm, setSubmitQcm] = useState({});
  const [submitBlocs, setSubmitBlocs] = useState({}); // { [blocId]: { [qIndex]: option, texte: "", audioUrl: "" } } - évaluations "mixte"
  const [recState, setRecState] = useState({}); // { [blocId]: { recording, uploading, seconds } } - enregistrement micro Speaking
  const mediaRecordersRef = useRef({});

  const startRecording = async (blocId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Le conteneur réel varie selon le navigateur - on force un type supporté explicitement
      // plutôt que de laisser le navigateur choisir, et on nomme le fichier avec la BONNE
      // extension. IMPORTANT : Firefox annonce (isTypeSupported) le support de
      // "audio/webm;codecs=opus" mais son encodeur webm produit dans certains cas un fichier
      // à la durée correcte mais totalement silencieux - son propre format natif "audio/ogg"
      // est nettement plus fiable chez lui. Chrome/Edge/Safari n'ont pas ce souci avec webm.
      const isFirefox = /firefox/i.test(navigator.userAgent);
      const mimeCandidates = isFirefox
        ? ["audio/ogg;codecs=opus", "audio/ogg", "audio/webm;codecs=opus", "audio/webm"]
        : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"];
      const chosenMime = mimeCandidates.find(m => MediaRecorder.isTypeSupported?.(m)) || "";
      const recorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime }) : new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(mediaRecordersRef.current[blocId]?.timer);
        setRecState(p => ({ ...p, [blocId]: { ...p[blocId], recording:false, uploading:true } }));
        try {
          const realMime = recorder.mimeType || chosenMime || "audio/webm";
          const ext = realMime.includes("ogg") ? "ogg" : realMime.includes("mp4") ? "m4a" : "webm";
          const blob = new Blob(chunks, { type: realMime });
          const token = localStorage.getItem("user_token");
          const fd = new FormData();
          fd.append("audio", blob, `speaking.${ext}`);
          const r = await fetch(`${API_URL}/api/apprenants/upload-audio`, { method:"POST", headers:{ Authorization:`Bearer ${token}` }, body: fd });
          const d = await r.json();
          if (r.ok && d.url) setSubmitBlocs(p => ({ ...p, [blocId]: { ...(p[blocId]||{}), audioUrl: d.url } }));
          else toast.error(d.error || "Échec de l'envoi de l'enregistrement");
        } catch { toast.error("Erreur réseau lors de l'envoi de l'enregistrement"); }
        setRecState(p => ({ ...p, [blocId]: { ...p[blocId], uploading:false } }));
      };
      recorder.start();
      mediaRecordersRef.current[blocId] = { recorder };
      setRecState(p => ({ ...p, [blocId]: { recording:true, uploading:false, seconds:0 } }));
      mediaRecordersRef.current[blocId].timer = setInterval(() => {
        setRecState(p => ({ ...p, [blocId]: { ...p[blocId], seconds:(p[blocId]?.seconds||0)+1 } }));
      }, 1000);
    } catch {
      toast.error("Impossible d'accéder au microphone - vérifiez les autorisations du navigateur.");
    }
  };
  const stopRecording = (blocId) => mediaRecordersRef.current[blocId]?.recorder?.stop();
  const fmtRecTime = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  const [submitFichier, setSubmitFichier] = useState(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitErreur, setSubmitErreur] = useState("");
  const [nowTick, setNowTick] = useState(new Date());
  const [filtreDevoir, setFiltreDevoir] = useState("tous");
  const [gaId, setGaId] = useState(null); // groupes_apprenants.id de l'apprenant

  const [msgSubTab, setMsgSubTab] = useState("prive"); // "prive" | "groupe" | "libres"
  /* Les groupes d'événement créés par la commerciale ou l'onboarding, qui réunissent des
     apprenants de plusieurs classes. L'apprenant n'en crée aucun et n'y ajoute personne :
     il les lit et y écrit, rien de plus. */
  const [groupesLibres, setGroupesLibres] = useState([]);
  // Ressource viewer
  const [showRessModal, setShowRessModal] = useState(false);
  const [selectedRess, setSelectedRess] = useState(null);
  const [mediaModal, setMediaModal] = useState(null); // { url, nom, type: "video"|"audio" }
  // Course expandable modules in modal
  const [expandedModule, setExpandedModule] = useState(null);
  const [coursLus, setCoursLus] = useState({});       // { [contenu_id]: true }
  const [confirmLuEnCours, setConfirmLuEnCours] = useState(false);
  const [confirmLuModal, setConfirmLuModal] = useState(null); // { id, nom, classeId }
  // Le refus du serveur s'affiche DANS le modal. Un simple toast se rate : le modal
  // restait ouvert sans explication, ce qui se lit comme un bouton qui ne fait rien.
  const [confirmLuErreur, setConfirmLuErreur] = useState("");
  // Boutique achat
  const [showAchatModal, setShowAchatModal] = useState(false);
  const [selectedProduit, setSelectedProduit] = useState(null);
  const [achatForm, setAchatForm] = useState({ nom:"", email:"", telephone:"" });
  const [produits, setProduits]   = useState([]);
  const [produitsLoading, setProduitsLoading] = useState(false);
  const [produitCategorie, setProduitCategorie] = useState("Tous");
  const [achatSending, setAchatSending] = useState(false);
  const [mesCommandes, setMesCommandes] = useState([]);
  const [mesCommandesLoading, setMesCommandesLoading] = useState(false);
  const [boutiqueSubTab, setBoutiqueSubTab] = useState("produits"); // "produits" | "achats"
  // Résultat détail
  const [expandedResult, setExpandedResult] = useState(null);

  // ── Notifications apprenant ─────────────────────────
  const [appNotifs, setAppNotifs]           = useState([]);
  const [appNotifsLoading, setAppNotifsLoading] = useState(false);
  const [notifModal, setNotifModal]         = useState(null); // notification sélectionnée

  // ── Cours e-learning réels ───────────────────────────
  const [coursElearning, setCoursElearning]       = useState([]);
  const [coursElearningLoading, setCoursElearningLoading] = useState(false);
  const [coursElearningDetail, setCoursElearningDetail] = useState(null);
  // Filtres et pagination de l'onglet « Mes cours ».
  const [coursRecherche, setCoursRecherche] = useState("");
  const [coursType, setCoursType]           = useState("");
  const [coursStatut, setCoursStatut]       = useState("");
  const [coursDu, setCoursDu]               = useState("");
  const [coursAu, setCoursAu]               = useState("");
  const [coursPage, setCoursPage]           = useState(1);
  // Réponses cochées dans les QCM d'auto-évaluation. Volontairement en mémoire seulement :
  // l'apprenant répond en classe, rien n'est collecté ni noté ici.
  const [reponsesQuiz, setReponsesQuiz] = useState({});

  // ── Présences apprenant ──────────────────────────────────
  const [appPresences,        setAppPresences]        = useState(null); // null = pas encore chargé
  const [appPresencesLoading, setAppPresencesLoading] = useState(false);

  // ── Sessions live ────────────────────────────────────
  const [liveSessionsAppr, setLiveSessionsAppr] = useState([]);
  const [liveLoadingAppr, setLiveLoadingAppr] = useState(false);
  const [liveJoinModal, setLiveJoinModal] = useState(null);
  const [jitsiModalSession, setJitsiModalSession] = useState(null);
  const [livePastOpenAppr, setLivePastOpenAppr] = useState(false);
  const [mesPresencesLive, setMesPresencesLive] = useState({}); // { date_seance: statut }

  // Tick chaque seconde pour les countdown devoirs
  useEffect(() => {
    const interval = setInterval(() => setNowTick(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setLiveLoadingAppr(true);
    fetch(`${API_URL}/api/coachs/sessions-live/upcoming`, { headers: { Authorization: `Bearer ${localStorage.getItem("user_token")}` } })
      .then(r => r.ok ? r.json() : { sessions: [] })
      .then(d => setLiveSessionsAppr(d.sessions || []))
      .catch(() => {})
      .finally(() => setLiveLoadingAppr(false));
  }, []);

  // ── Presences live de l'apprenant ────────────────────────────
  useEffect(() => {
    const gaId = espaceInfo?.groupe?.id;
    const groupeId = espaceInfo?.groupe?.groupe_id;
    if (!groupeId || !gaId) return;
    fetch(`${API_URL}/api/groupes/${groupeId}/mes-presences?ga_id=${gaId}`, { headers: { Authorization: `Bearer ${localStorage.getItem("user_token")}` } })
      .then(r => r.ok ? r.json() : { presences: [] })
      .then(d => {
        const map = {};
        (d.presences || []).forEach(p => { map[p.date_seance] = p.statut; });
        setMesPresencesLive(map);
      }).catch(() => {});
  }, [espaceInfo?.groupe?.id, espaceInfo?.groupe?.groupe_id]);

  // ── Statut d'accès / compteur d'absences - bandeau d'avertissement avant
  //    le blocage automatique à la 4e absence (cf. Backend/src/routes/groupes.js
  //    checkAutoSuspension). Rien n'appelait cet endpoint côté apprenant jusqu'ici,
  //    donc aucun avertissement n'était jamais montré avant le blocage effectif.
  useEffect(() => {
    const token = localStorage.getItem("user_token");
    if (!token) return;
    fetch(`${API_URL}/api/groupes/mon-acces-status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setAccesStatus(d))
      .catch(() => {});
  }, []);

  // ── Boutique : charger les produits actifs ──────────────────
  useEffect(() => {
    setProduitsLoading(true);
    fetch(`${API_URL}/api/boutique/produits/actifs`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setProduits(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setProduitsLoading(false));
  }, []);

  // ── Boutique : historique des propres commandes de l'apprenant (référence
  // de paiement, statut de livraison) - évite de dépendre du seul toast affiché
  // au retour de paiement pour retrouver la trace d'un achat.
  const fetchMesCommandes = useCallback(() => {
    const email = espaceInfo?.profil?.email;
    if (!email) return;
    setMesCommandesLoading(true);
    fetch(`${API_URL}/api/boutique/mes-commandes?email=${encodeURIComponent(email)}`, { headers: { Authorization: `Bearer ${localStorage.getItem("user_token")}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => setMesCommandes(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setMesCommandesLoading(false));
  }, [espaceInfo?.profil?.email]);

  useEffect(() => { fetchMesCommandes(); }, [fetchMesCommandes]);

  // ── Données réelles depuis espaceInfo (avec fallback sur les mocks) ──────
  const realP        = espaceInfo?.profil   || {};
  const realG        = espaceInfo?.groupe   || null;
  const realGI       = realG?.groupes       || null;
  const monGroupeId  = realG?.groupe_id     || null;

  // Le compteur était figé à 0 « car géré en interne par MessagerieTab » - sauf que ce
  // « géré en interne » ne remontait nulle part : ni le badge de l'onglet ni la tuile du
  // tableau de bord ne pouvaient donc rien afficher. On compte au moins ce qui arrive dans
  // le chat de la classe, seul canal dont l'apprenant est certain d'être destinataire.
  const msgNonLus = useGroupesChatUnreadTotal(monGroupeId ? [monGroupeId] : [], realP?.id);

  // ── Chat groupe (Firebase - même collection que le coach) ──────────────
  const realCoach       = espaceInfo?.coach    || null;
  const realParcours    = espaceInfo?.parcours || null;
  const classeCloturee  = espaceInfo?.classe_cloturee === true;
  const formationArretee = espaceInfo?.formation_arretee || null;
  /* À qui écrire pour une question : son assistante si elle est connue, sinon l'adresse
     centrale. Résolu côté serveur (`/mon-espace`) - l'écran affichait jusqu'ici une
     adresse écrite en dur qui ne correspondait à aucune boîte réelle. */
  const contactAssistance = espaceInfo?.contact_assistance || null;

  /* Envoi d'un message à un membre de son équipe. Le serveur revérifie que le destinataire
     est bien l'un de SES contacts - l'identifiant envoyé ici n'est qu'une désignation. */
  const envoyerMessageContact = async () => {
    const cible = contactMailModal?.contact;
    if (!cible || contactMailEnvoi) return;
    if (!contactMailForm.message.trim()) { toast.error("Écrivez votre message"); return; }
    setContactMailEnvoi(true);
    try {
      const token = localStorage.getItem("user_token");
      const r = await fetch(`${API_URL}/api/apprenants/contacter`, {
        method: "POST",
        headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify({
          destinataire_id: cible.id,
          sujet:           contactMailForm.sujet,
          message:         contactMailForm.message,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "L'envoi a échoué");
      toast.success(`✉️ Message envoyé à ${d.destinataire || cible.nom || "votre contact"}`);
      setContactMailModal(null);
      setContactMailForm({ sujet:"", message:"" });
    } catch (e) {
      toast.error(e.message || "L'envoi a échoué");
    } finally {
      setContactMailEnvoi(false);
    }
  };

  /* Le numéro sans espaces : pour `tel:` et pour wa.me, qui n'accepte que des chiffres.
     Les numéros sont saisis dans des formats très variés (+225…, 225…, 07…). */
  const telBrut = (t) => String(t || "").replace(/[^\d+]/g, "");
  const telWhatsApp = (t) => {
    const d = String(t || "").replace(/\D/g, "");
    if (!d) return null;
    // 8 chiffres sans indicatif = numéro ivoirien local ; 10 depuis la réforme de 2021.
    if (d.startsWith("225")) return d;
    if (d.length === 10 || d.length === 8) return `225${d}`;
    return d;
  };

  /* LES SESSIONS LIVE QUI LE CONCERNENT - filtrées ici, une fois pour toutes.
     Deux défauts se cumulaient :
     · la route est appelée SANS paramètre et renvoie les sessions de TOUS les coachs ;
       un repli `: liveSessionsAppr` les affichait telles quelles dès que ni la classe ni
       le coach n'étaient encore résolus - l'apprenant voyait alors le planning d'autrui ;
     · rien ne les recoupait avec sa fenêtre de présence, si bien qu'un apprenant ayant
       arrêté gardait le bouton « Détails » sur une session postérieure à son départ.
     La règle de l'arrêt est la même partout : le passé reste consultable, l'avenir non. */
  const sessionsLiveVisibles = useMemo(() => {
    const finAcces = formationArretee?.date ? new Date(formationArretee.date) : null;
    return (liveSessionsAppr || []).filter(s => {
      const aMoi = monGroupeId
        ? s.groupe_id === monGroupeId
        : (!s.groupe_id && realCoach?.id && s.coach_id === realCoach.id);
      // Faute de rattachement identifié, on ne montre RIEN plutôt que tout.
      if (!aMoi) return false;
      if (!finAcces || !s.date) return true;
      // Comparaison à la journée, comme la fenêtre d'accès aux contenus.
      return new Date(`${s.date}T23:59:59`) <= new Date(`${finAcces.toISOString().slice(0,10)}T23:59:59`);
    });
  }, [liveSessionsAppr, monGroupeId, realCoach?.id, formationArretee?.date]);

  // ── Détection du type de coaching ──────────────────────────
  const isCoachingPrive = !!(
    estClassePrivee(realGI) ||
    (realGI?.nom || "").toLowerCase().includes("priv") ||
    ["prive", "domicile", "centre"].includes(realParcours?.type_cours)
  );
  const isCoachingGroupe = !isCoachingPrive && !!monGroupeId;
  // ── Notifications tranches ──────────────────────────────────
  const today7  = new Date(); today7.setHours(0,0,0,0);
  const in7days  = new Date(today7.getTime() + 7 * 24 * 60 * 60 * 1000);
  // Le statut réel stocké en base varie selon l'origine de l'enregistrement (accents,
  // orthographes) - couvrir toutes les variantes utilisées ailleurs dans l'app (ex: "paye"
  // sans accent produit par CommercialDashboard) pour ne jamais afficher "en attente" à tort.
  const STATUTS_PAYES = ["payé", "paye", "validé", "valide", "confirmé", "confirme", "confirmée", "reçu", "recu", "encaissé", "encaisse"];
  const estStatutPaye = (s) => STATUTS_PAYES.includes(s);

  const tranches = realParcours?.plan_paiement?.tranches || [];
  /* LE PLAN MENSUEL. Cet écran ne lisait que `tranches`, l'ANCIEN modèle : un apprenant
     au plan mensuel - le cas de tous les dossiers récents - voyait un onglet Paiement
     vide et un badge à zéro, alors qu'il recevait par ailleurs les rappels J-7/J-3/J-1
     du cron. L'écran contredisait donc les notifications. */
  const planMensuel = realParcours?.plan_paiement || null;
  const echeance    = prochaineEcheance(planMensuel);
  const moisDuPlan  = estPlanMensuel(planMensuel)
    ? [...planMensuel.mois_paiements].sort((x, y) => String(x.periode).localeCompare(String(y.periode)))
    : [];
  const overdueTranches  = tranches.filter(t => !estStatutPaye(t.statut) && new Date(t.date_echeance) < today7);
  const upcomingTranches = tranches.filter(t => !estStatutPaye(t.statut) && new Date(t.date_echeance) >= today7 && new Date(t.date_echeance) <= in7days);
  const totalDu  = tranches.reduce((s, t) => s + (!estStatutPaye(t.statut) ? (t.montant || 0) : 0), 0);

  const rawPaiements = espaceInfo?.paiements ?? null; // null = pas encore chargé, [] = chargé mais vide
  const paiements = rawPaiements !== null
    ? rawPaiements.map(p => {
        // Parse "offre::XXX||description" format enregistré par la commerciale
        const inscriptionRaw = p.inscription || "";
        const parts = inscriptionRaw.split("||");
        const offre = parts.find(s => s.startsWith("offre::"))?.replace("offre::", "") || null;
        const description = parts.filter(s => !s.startsWith("offre::")).join(" - ") || offre || "Paiement";
        return {
          id:           p.id,
          date:         p.date_paiement,
          montant_recu: Number(p.montant_recu) || 0,
          montant_du:   Number(p.montant_du)   || 0,
          montant:      Number(p.montant_recu) > 0 ? Number(p.montant_recu) : Number(p.montant_du),
          description,
          offre,
          cours:        realGI?.nom || offre || "",
          mode:         p.mode_paiement || "-",
          statut:       STATUTS_PAYES.includes(p.statut) ? "payé" : "attente",
          statut_raw:   p.statut,
          ref:          p.ref_transaction || null,
          operateur:    p.payment_mode_reel || null,
          token:        p.payment_token || null,
          notes:        p.notes || null,
          preuve_image: p.preuve_image || null,
        };
      })
    : []; // en attente du chargement réel - jamais de paiements factices affichés
  const profil = {
    ...PROFIL_DEFAUT,
    id:              realP.id        || PROFIL_DEFAUT.id,
    nom:             realP.nom       || PROFIL_DEFAUT.nom,
    prenom:          realP.prenom    || PROFIL_DEFAUT.prenom,
    email:           realP.email     || PROFIL_DEFAUT.email,
    phone:           realP.telephone || PROFIL_DEFAUT.phone,
    avatar:          ((realP.prenom?.[0] || "") + (realP.nom?.[0] || "")).toUpperCase() || PROFIL_DEFAUT.avatar,
    avatar_url:      realP.avatar_url || null,
    surnom:          realP.surnom     || "",
    adresse:         realP.adresse    || "",
    niveau:          realG?.niveau      || PROFIL_DEFAUT.niveau,
    classe:          realGI?.nom        || PROFIL_DEFAUT.classe,
    typeCours:       realParcours?.type_cours || realGI?.type_cours || PROFIL_DEFAUT.typeCours,
    // Repli sur suivi_demarrage.niveau_prospect : pour le coaching privé, niveau_client
    // (colonne top-level) n'est renseigné qu'après passage effectif du test en ligne ; le
    // niveau évalué manuellement par le PA à la qualification vit lui dans le JSONB.
    testNiveauResultat: (realParcours?.niveau_client || realParcours?.suivi_demarrage?.niveau_prospect)
      ? `Niveau évalué : ${realParcours.niveau_client || realParcours.suivi_demarrage.niveau_prospect}`
      : PROFIL_DEFAUT.testNiveauResultat,
    parent: realParcours?.profil_type === "enfant" && realParcours?.nom_parent
      ? { nom: realParcours.nom_parent, email: realParcours.email_parent || null, telephone: realParcours.telephone_parent || null }
      : PROFIL_DEFAUT.parent,
    objectif:        realParcours?.objectif_client || PROFIL_DEFAUT.objectif,
    dateInscription: realG?.date_ajout || PROFIL_DEFAUT.dateInscription,
    coach: realCoach
      ? { nom: `${realCoach.prenom || ""} ${realCoach.nom || ""}`.trim(), email: realCoach.email || "" }
      : PROFIL_DEFAUT.coach,
    paiements: paiements,
  };

  // ── Adaptation par tranche d'âge (enfant/etudiant/adulte) ──────────────
  const tranche = TRANCHE_DEPUIS_PROFIL_TYPE[realParcours?.profil_type] || "adulte";
  const ui = AGE_UI[tranche];

  // ── Photo de profil & adresse ──────────────────────────
  const [avatarUrl,      setAvatarUrl]      = useState(null);
  const [avatarSaving,   setAvatarSaving]   = useState(false);
  const [adresseEdit,    setAdresseEdit]    = useState("");
  const [adresseSaving,  setAdresseSaving]  = useState(false);
  const [profilSavMsg,   setProfilSavMsg]   = useState("");
  // Surnom - le nom d'usage, comme pour le personnel. L'état civil reste la référence
  // administrative et n'est jamais modifiable ici.
  const [surnomSaisi,    setSurnomSaisi]    = useState(null); // null = pas encore initialisé
  const [surnomSaving,   setSurnomSaving]   = useState(false);

  // Sync quand les données arrivent de l'API
  useEffect(() => {
    if (espaceInfo?.profil?.avatar_url) setAvatarUrl(espaceInfo.profil.avatar_url);
    if (espaceInfo?.profil?.adresse)    setAdresseEdit(espaceInfo.profil.adresse);
  }, [espaceInfo]);

  // Le token "user_token" (session apprenant) n'est jamais rafraîchi automatiquement
  // ailleurs dans l'app (l'intercepteur global de App.js exclut exprès les routes
  // apprenant/parent) - sans ça, un token expiré fait échouer silencieusement la sauvegarde
  // (ex: photo affichée en local via l'aperçu optimiste, jamais persistée en base).
  /**
   * Un appel authentifié qui SURVIT à l'expiration du jeton.
   *
   * Le jeton d'un apprenant vaut 60 minutes, et l'intercepteur global de `App.js` exclut
   * délibérément les routes apprenant et parent. Passé une heure sur la page, toute action
   * échouait donc en 401 - « Marquer comme terminé » en tête, ce qui donnait un bouton
   * qui « ne marche pas » sans rapport ni avec le cours ni avec son média.
   *
   * Le rafraîchissement n'est tenté qu'UNE fois : si le jeton de renouvellement est lui
   * aussi périmé, insister ne ferait que retarder le message qui dit d'aller se
   * reconnecter.
   */
  /**
   * Un appel authentifié de l'espace apprenant, BORNÉ DANS LE TEMPS.
   *
   * Volontairement SANS rafraîchissement de jeton. Une version précédente appelait
   * `supabase.auth.refreshSession` sur un 401 : cette fonction prend un verrou
   * `Navigator LockManager` partagé entre les onglets, et avec un second onglet ouvert
   * l'attente ne se terminait jamais - « Marquer comme terminé » restait bloqué plusieurs
   * minutes. Demander une reconnexion coûte un clic ; faire attendre sans fin coûte la
   * confiance dans le bouton.
   *
   * Reste la limite de temps, qui est le seul garde-fou vraiment utile ici : rien ne doit
   * pouvoir suspendre l'interface indéfiniment.
   */
  const fetchApprenant = async (url, options = {}) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      return await fetch(url, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${localStorage.getItem("user_token")}`,
        },
        signal: ctrl.signal,
      });
    } finally { clearTimeout(t); }
  };

  const patchPreferencesAvecRetry = async (body) => {
    let token = localStorage.getItem("user_token");
    let r = await fetch(`${API_URL}/api/apprenants/preferences`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (r.status === 401) {
      const refreshToken = localStorage.getItem("user_refresh");
      if (refreshToken) {
        const { data: rd } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
        if (rd?.session?.access_token) {
          localStorage.setItem("user_token", rd.session.access_token);
          if (rd.session.refresh_token) localStorage.setItem("user_refresh", rd.session.refresh_token);
          r = await fetch(`${API_URL}/api/apprenants/preferences`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${rd.session.access_token}` },
            body: JSON.stringify(body),
          });
        }
      }
    }
    return r;
  };

  const handleAvatarSuccess = async (file) => {
    if (avatarSaving) return;
    setAvatarSaving(true);
    setAvatarUrl(file.url);
    try {
      const r = await patchPreferencesAvecRetry({ avatar_url: file.url });
      if (r.ok) {
        setProfilSavMsg("✅ Photo mise à jour !");
      } else {
        const err = await r.json().catch(() => ({}));
        console.error("[avatar save]", r.status, err);
        setProfilSavMsg(`⚠️ Erreur sauvegarde : ${err.error || r.status}`);
      }
    } catch (e) {
      console.error("[avatar save]", e);
      setProfilSavMsg("⚠️ Erreur réseau lors de la sauvegarde.");
    }
    setAvatarSaving(false);
    setTimeout(() => setProfilSavMsg(""), 5000);
  };

  const handleAdresseSave = async () => {
    setAdresseSaving(true);
    try {
      const r = await patchPreferencesAvecRetry({ adresse: adresseEdit });
      setProfilSavMsg(r.ok ? "✅ Adresse enregistrée !" : "⚠️ Erreur lors de la sauvegarde.");
    } catch { setProfilSavMsg("⚠️ Erreur lors de la sauvegarde."); }
    setAdresseSaving(false);
    setTimeout(() => setProfilSavMsg(""), 3000);
  };

  // ── Témoignage ────────────────────────────────────────
  const estCertifie = false; // pas de certifications mock
  const certifPrincipale = null;
  const [temoExistant,   setTemoExistant]   = useState(null);
  const [temoLoading,    setTemoLoading]    = useState(false);
  const [temoSubmitting, setTemoSubmitting] = useState(false);
  const [temoForm, setTemoForm] = useState({
    etoiles: 5, avatar: "🎓", texte: "",
    role: "",
    score: certifPrincipale ? `${certifPrincipale.titre.split(/\s*[\u2014-]\s*/)[0].trim()}` : "",
  });
  const [temoPhotoPreview, setTemoPhotoPreview] = useState(null);
  const [temoPhotoUrl,     setTemoPhotoUrl]     = useState(null);
  const [temoPhotoLoading, setTemoPhotoLoading] = useState(false);
  const [temoPhotoError,   setTemoPhotoError]   = useState("");
  const temoPhotoInputRef = useRef(null);

  const handleTemoPhotoChange = async (e) => {
    if (temoPhotoLoading) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setTemoPhotoError("Seules les images sont acceptées."); return; }
    if (file.size > 5 * 1024 * 1024) { setTemoPhotoError("La photo ne doit pas dépasser 5 Mo."); return; }
    setTemoPhotoError(""); setTemoPhotoLoading(true);
    setTemoPhotoPreview(URL.createObjectURL(file));
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetchUpload(`${API_URL}/api/upload/temoignage`, { method:"POST", body:fd });
      const d   = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur upload");
      setTemoPhotoUrl(d.url || d.file?.url);
    } catch (err) { setTemoPhotoError(err.message); setTemoPhotoPreview(null); setTemoPhotoUrl(null); }
    finally { setTemoPhotoLoading(false); }
  };

  const EMOJI_TEMO = ["🎓","🌟","💪","🏆","👩🏽‍💻","👨🏿‍💼","👩🏾‍⚖️","👨🏽‍🎓","✨","👑"];

  const loadTemoignage = useCallback(async () => {
    setTemoLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/temoignages/soumettre`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      // On charge depuis Supabase via le backend en filtrant par apprenant_id (simulé ici)
    } catch {}
    finally { setTemoLoading(false); }
  }, []);

  const submitTemoignage = async () => {
    if (temoSubmitting) return;
    if (!temoForm.texte.trim() || temoForm.texte.trim().length < 30) {
      toast.error("Votre témoignage doit faire au moins 30 caractères.");
      return;
    }
    setTemoSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/temoignages/soumettre`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apprenant_id: profil.id,
          texte:    temoForm.texte,
          etoiles:  temoForm.etoiles,
          role:     temoForm.role,
          score:    temoForm.score,
          photo_url: temoPhotoUrl || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erreur lors de la soumission"); return; }
      toast.success("Témoignage soumis ! Il sera publié après validation par notre équipe.");
      setTemoExistant({ statut: "en_attente", texte: temoForm.texte, etoiles: temoForm.etoiles, role: temoForm.role });
    } catch { toast.error("Erreur réseau, réessayez."); }
    finally { setTemoSubmitting(false); }
  };

  // ── Fichiers réels partagés par le coach ─────────────────
  const [mesFichiers,        setMesFichiers]        = useState(null); // null = pas encore chargé
  const [mesFichiersLoading, setMesFichiersLoading] = useState(false);

  // ── Séances coaching privé ────────────────────────────────
  const [mesSeances,        setMesSeances]        = useState(null);
  const [mesSeancesLoading, setMesSeancesLoading] = useState(false);

  // ── Cours de groupe (coaching groupe) ────────────────────
  const [groupeCours,        setGroupeCours]        = useState(null);
  const [groupeCoursLoading, setGroupeCoursLoading] = useState(false);
  const [groupeCoursInfo,    setGroupeCoursInfo]    = useState(null); // méta-données du groupe

  const ressourcesFiltrees = useMemo(() => {
    const source = mesFichiers ?? [];
    let r = [...source];
    if (filterRessource !== "Tous") r = r.filter(x => (x.type_fichier || x.type) === filterRessource);
    return r;
  }, [mesFichiers, filterRessource]);

  const formatDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { weekday:"short", day:"numeric", month:"short" }) : "-";
  const formatDateFull = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" }) : "-";

  const scoreColor = (s, max) => {
    const p = (s/max)*100;
    return p >= 75 ? "#22c55e" : p >= 50 ? "#f59e0b" : "#ef4444";
  };

  // Prochaine séance / cours à venir (dynamique selon le type de coaching)
  const prochaineSeance = (() => {
    const now = new Date();
    if (isCoachingPrive && mesSeances?.length) {
      const s = [...mesSeances]
        .filter(s => new Date(s.date_seance || s.date_cours) >= now)
        .sort((a, b) => new Date(a.date_seance || a.date_cours) - new Date(b.date_seance || b.date_cours))[0];
      if (!s) return null;
      return {
        label: formatDate(s.date_seance || s.date_cours),
        sub:   s.heure_debut ? `${s.heure_debut}${s.heure_fin ? ` – ${s.heure_fin}` : ""}` : (s.titre || s.objectif || "Séance"),
      };
    }
    if (isCoachingGroupe && groupeCours?.length) {
      const c = [...groupeCours]
        .filter(c => new Date(c.date_cours) >= now)
        .sort((a, b) => new Date(a.date_cours) - new Date(b.date_cours))[0];
      if (!c) return null;
      return {
        label: formatDate(c.date_cours),
        sub:   c.objectif || "Cours de classe",
      };
    }
    return null;
  })();

  const appNotifsNonLus = appNotifs.filter(n => !n.lu).length;
  const [banderoleNotifFermee, setBanderoleNotifFermee] = useState(false);

  // Compteur planning selon le type de coaching - ne compte que les séances/cours à venir,
  // comme le fait déjà le corps de l'onglet (filtre `>= now`), sinon le badge affiche un total
  // figé qui ne correspond pas à ce que l'onglet montre réellement.
  const planningCount = (() => {
    const now = new Date();
    if (isCoachingPrive) {
      return mesSeances?.filter(s => new Date(s.date_seance || s.date_cours) >= now).length || null;
    }
    return groupeCours?.filter(c => new Date(c.date_cours) >= now).length || null;
  })();

  // Tabs communs à tous les profils
  const TABS_COMMUNS = [
    { key:"dashboard",          label: tranche === "enfant" ? "Accueil" : "Tableau de bord", icon:"🏠", count:null },
    { key:"monprofil",          label:"Mon profil",         icon:"👤", count:null },
    { key:"onboarding",         label:"Onboarding",         icon:"🎬", count:null },
    { key:"minijeux",           label:"Mini-jeux",          icon:"🎮", count:null },
    { key:"dictionnaire",       label:"Dictionnaire",       icon:"📘", count:null },
    { key:"gamification",       label:"Gamification",       icon:"🏆", count:null },
    { key:"presences",          label:"Mes présences",      icon:"✅", count: appPresences ? appPresences.filter(p=>p.statut==="absent").length || null : null, danger: appPresences ? appPresences.filter(p=>p.statut==="absent").length >= 3 : false },
    { key:"notifications_appr", label:"Notifications",      icon:"🔔", count:appNotifsNonLus || null, danger:appNotifsNonLus > 0 },
    { key:"planning",           label: isCoachingPrive ? "Mes séances" : "Planning",  icon:"📅", count:planningCount },
    { key:"ressources",         label:"Ressources",         icon:"📂", count:(mesFichiers?.length) || null },
    { key:"contacts",           label:"Contacts & Support", icon:"📞", count:null },
    { key:"boutique",           label:"Boutique",           icon:"🛒", count:produits.length || null },
    { key:"messages",           label:"Messages",           icon:"💬", count:msgNonLus || null, danger:msgNonLus > 0 },
    /* Le badge comptait les seules `tranches` : un apprenant au plan mensuel voyait un
       onglet muet alors qu'une mensualité était en retard. Le plan mensuel y entre pour
       1 dès qu'une échéance est due - et il passe en rouge si elle est dépassée. */
    { key:"paiement",           label:"Paiement",           icon:"💳",
      count:(overdueTranches.length + upcomingTranches.length + (echeance.etat === "du" && echeance.jours <= 7 ? 1 : 0)) || null,
      danger: overdueTranches.length > 0 || (echeance.etat === "du" && echeance.jours < 0) },
    { key:"temoignage",         label:"Mon témoignage",     icon:"⭐", count:null },
  ];

  // Devoirs/évaluations pas encore rendus et pas encore expirés - même logique que le
  // calcul "statut" fait dans le corps de l'onglet Examens (mesEvals.statut ne vaut
  // jamais "disponible", cette valeur n'existe dans aucun des deux schémas de statut ;
  // le badge restait donc bloqué à 0 même quand des devoirs étaient réellement à faire).
  const evalsARendreCount = mesEvals.filter(e => {
    if (e.monResultat) return false;
    const hLim = (e.heure_limite || "23:59").slice(0,5);
    const expire = e.date_limite && nowTick > new Date(`${e.date_limite}T${hLim}:00`);
    return !expire;
  }).length;

  // Tabs spécifiques coaching groupe
  const TABS_GROUPE = [
    { key:"cours",          label:"Mes cours",      icon:ui.emojiCours, count:coursElearning.length || null },
    { key:"resultats",      label:"Résultats",      icon:ui.emojiResultats, count:mesResultatsDB.length },
    { key:"objectifs",      label:"Objectifs & Certifications", icon:"🎯", count:certifCount },
    { key:"examens",        label:"Devoirs & Évaluations", icon:"📝", count:evalsARendreCount, danger: evalsARendreCount > 0 },
    { key:"session_live",   label:"Session Live",   icon:"📡", count: sessionsLiveVisibles.filter(s => new Date(`${s.date}T${s.heure}`) > new Date()).length || null },
  ];

  // Tabs spécifiques coaching privé
  const TABS_PRIVE = [
    { key:"cours",          label:"Mes cours",      icon:ui.emojiCours, count:coursElearning.length || null },
    { key:"objectifs",      label:"Mes objectifs",  icon:"🎯", count:null },
    { key:"session_live",   label:"Mes séances",   icon:"📅", count: sessionsLiveVisibles.filter(s => new Date(`${s.date}T${s.heure}`) > new Date()).length || null },
  ];

  const tabsBrutes = isCoachingPrive
    ? [
        ...TABS_COMMUNS.slice(0, 3), // dashboard, monprofil, onboarding
        ...TABS_PRIVE,               // cours, objectifs
        ...TABS_COMMUNS.slice(3),    // presences, notifs, planning, ressources, contacts…
      ]
    : isCoachingGroupe
      ? [
          ...TABS_COMMUNS.slice(0, 3), // dashboard, monprofil, onboarding
          ...TABS_GROUPE,              // cours, resultats, objectifs, certifs, examens, session_live
          ...TABS_COMMUNS.slice(3),    // presences, notifs, planning, ressources, contacts…
        ]
      : TABS_COMMUNS; // profil inconnu → tabs minimaux

  // Pour les enfants, Mini-jeux remonte juste après Présences (plus visible, comme sur
  // bet-elearning) plutôt que sa position par défaut plus loin dans la liste.
  const tabs = tranche === "enfant"
    ? (() => {
        const sansMinijeux = tabsBrutes.filter(t => t.key !== "minijeux");
        const minijeuxTab = tabsBrutes.find(t => t.key === "minijeux");
        if (!minijeuxTab) return tabsBrutes;
        const idxPresences = sansMinijeux.findIndex(t => t.key === "presences");
        if (idxPresences === -1) return tabsBrutes;
        return [...sansMinijeux.slice(0, idxPresences + 1), minijeuxTab, ...sansMinijeux.slice(idxPresences + 1)];
      })()
    : tabsBrutes;

  // Auth check + fetch espace info
  useEffect(() => {
    const token = localStorage.getItem("user_token");
    if (!token) { navigate("/connexion/apprenant", { replace: true }); return; }
    fetch(`${API_URL}/api/apprenants/mon-espace`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (r.status === 401) { navigate("/connexion/apprenant", { replace: true }); return null; } return r.json(); })
      .then(d => { if (d) { setEspaceInfo(d); } })
      .catch(() => {})
      .finally(() => setAuthLoading(false));
  }, [navigate]);

  const confirm = useConfirm();
  const alerte = useAlerte();
  const handleLogoutApprenant = async () => {
    if (!(await confirm('Vous allez être déconnecté(e) de votre session.', { titre: 'Se déconnecter ?', confirmLabel: 'Se déconnecter', danger: false }))) return;
    clearAllSessionStorage();
    navigate("/connexion/apprenant", { replace: true });
  };

  // Realtime notifications + polling de secours pour l'apprenant
  useEffect(() => {
    const userId = espaceInfo?.profil?.id;
    if (!userId) return;
    const token = localStorage.getItem("user_token");
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    const fetchNotifs = () => {
      fetch(`${API_URL}/api/apprenants/mes-notifs`, { headers })
        .then(r => r.ok ? r.json() : { notifications: [] })
        .then(d => setAppNotifs(d.notifications || []))
        .catch(() => {});
    };

    // Chargement initial
    fetchNotifs();

    const channelName = `notifs-appr-${userId}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications",
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const n = { ...payload.new, createdAt: payload.new.created_at };
        setAppNotifs(prev => [n, ...prev]);
        toast(n.message || n.titre || "Nouvelle notification", {
          icon: n.type === "badge_obtenu" ? "🏅" : "🔔",
          duration: 5000,
        });
      })
      .subscribe();

    const pollInterval = setInterval(fetchNotifs, 60_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [espaceInfo?.profil?.id]);

  // Charger notifications + cours e-learning dès que l'apprenant est authentifié
  useEffect(() => {
    if (!espaceInfo?.actif) return;
    const token = localStorage.getItem("user_token");
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    // Email à passer aux endpoints mon-espace/* (recherche par prospect_email)
    const emailParam = encodeURIComponent(espaceInfo?.profil?.email || "");

    setAppNotifsLoading(true);
    fetch(`${API_URL}/api/apprenants/mes-notifs`, { headers })
      .then(r => r.ok ? r.json() : { notifications: [] })
      .then(d => setAppNotifs(d.notifications || []))
      .catch(() => {})
      .finally(() => setAppNotifsLoading(false));

    setCoursElearningLoading(true);
    fetch(`${API_URL}/api/cours-elearning/pour-apprenant`, { headers })
      .then(r => r.ok ? r.json() : { contenus: [] })
      .then(d => setCoursElearning(d.contenus || []))
      .catch(() => {})
      .finally(() => setCoursElearningLoading(false));

    // Presences : endpoint mon-espace (gère coaching privé ET groupe)
    setAppPresencesLoading(true);
    fetch(`${API_URL}/api/mon-espace/presences?email=${emailParam}`, { headers })
      .then(r => r.ok ? r.json() : { presences: [] })
      .then(d => setAppPresences(d.presences || []))
      .catch(() => setAppPresences([]))
      .finally(() => setAppPresencesLoading(false));

    // Fichiers : endpoint mon-espace (gère fichiers_prives ET groupes_fichiers)
    setMesFichiersLoading(true);
    fetch(`${API_URL}/api/mon-espace/fichiers?email=${emailParam}`, { headers })
      .then(r => r.ok ? r.json() : { fichiers: [] })
      .then(d => setMesFichiers(d.fichiers || []))
      .catch(() => setMesFichiers([]))
      .finally(() => setMesFichiersLoading(false));

    // Séances coaching privé (seances_privees)
    setMesSeancesLoading(true);
    fetch(`${API_URL}/api/mon-espace/seances?email=${emailParam}`, { headers })
      .then(r => r.ok ? r.json() : { seances: [] })
      .then(d => setMesSeances(d.seances || []))
      .catch(() => setMesSeances([]))
      .finally(() => setMesSeancesLoading(false));

    // Cours de groupe (coaching groupe - groupes_cours)
    setGroupeCoursLoading(true);
    fetch(`${API_URL}/api/mon-espace/cours-groupe?email=${emailParam}`, { headers })
      .then(r => r.ok ? r.json() : { cours: [], groupe: null })
      .then(d => { setGroupeCours(d.cours || []); setGroupeCoursInfo(d.groupe || null); })
      .catch(() => { setGroupeCours([]); setGroupeCoursInfo(null); })
      .finally(() => setGroupeCoursLoading(false));

    // Évaluations réelles publiées par le coach pour le groupe de l'apprenant
    setMesEvalsLoading(true);
    setMesEvalsErreur(null);
    fetch(`${API_URL}/api/apprenants/mes-evaluations`, { headers })
      .then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          setMesEvalsErreur(err.error || `Erreur ${r.status}`);
          return { evaluations: [], ga_id: null };
        }
        return r.json();
      })
      .then(d => {
        if (d.ga_id) setGaId(d.ga_id);
        else setMesEvalsErreur("groupe_introuvable"); // code spécial : pas d'erreur serveur, mais pas de groupe lié
        const normalised = (d.evaluations || []).map(ev => {
          const monR = ev.resultat || ev.monResultat || null;
          return {
            _isReal: true, _evalId: ev.id, id: ev.id,
            titre: ev.titre,
            categorie: ev.categorie || "evaluation",
            type: ev.type || "qcm",
            type_rendu: ev.type_rendu || "texte",
            date_ouverture: ev.date_ouverture || null,
            heure_ouverture: ev.heure_ouverture || "00:00",
            date_limite: ev.date_evaluation || null,
            heure_limite: ev.heure_debut || "23:59",
            dureeMinutes: ev.duree_min || 60,
            instructions: ev.instructions || "",
            questions: (ev.questions || []).map((q, i) => ({
              id: q.id || i, text: q.enonce || q.text || "",
              options: q.options || [], correct: q.correct || null, points: q.points || 1,
            })),
            ressource_url: ev.ressource_url || "",
            blocs: ev.blocs || [],
            monResultat: monR,
            statut: monR?.statut || "a_faire",
          };
        });
        setMesEvals(normalised);
      })
      .catch(e => { setMesEvalsErreur(e.message); setMesEvals([]); })
      .finally(() => setMesEvalsLoading(false));

    // Résultats corrigés par le coach
    setMesResultatsDBLoading(true);
    fetch(`${API_URL}/api/apprenants/mes-resultats`, { headers })
      .then(r => r.ok ? r.json() : { resultats: [] })
      .then(d => setMesResultatsDB(d.resultats || []))
      .catch(() => setMesResultatsDB([]))
      .finally(() => setMesResultatsDBLoading(false));

    // Les groupes d'événement dont il est membre. Une liste vide n'est pas une erreur :
    // la plupart des apprenants n'en ont aucun.
    fetch(`${API_URL}/api/conversations`, { headers })
      .then(r => r.ok ? r.json() : { conversations: [] })
      .then(d => setGroupesLibres((d.conversations || []).filter(c => !c.supervision)))
      .catch(() => setGroupesLibres([]));

    // Contacts réels (coach, commercial, PA advisor, onboarding)
    setMesContactsLoading(true);
    fetch(`${API_URL}/api/apprenants/mes-contacts`, { headers })
      .then(r => r.ok ? r.json() : { contacts: [] })
      .then(d => setMesContacts(d.contacts || []))
      .catch(() => setMesContacts([]))
      .finally(() => setMesContactsLoading(false));

    // Cours lus
    fetch(`${API_URL}/api/apprenants/mes-cours-lus`, { headers })
      .then(r => r.ok ? r.json() : { lus: [] })
      .then(d => {
        const map = {};
        (d.lus || []).forEach(l => { map[l.contenu_id] = true; });
        setCoursLus(map);
      })
      .catch(() => {});

    // Contenus onboarding (guide de bienvenue + bibliothèque de vidéos)
    setContenusOnbLoading(true);
    Promise.all([
      fetch(`${API_URL}/api/dash/contenus/onboarding/publiques`, { headers }).then(r => r.ok ? r.json() : { contenus: [] }),
      fetch(`${API_URL}/api/dash/contenus/videos/publiques`, { headers }).then(r => r.ok ? r.json() : { videos: [] }),
    ])
      .then(([d1, d2]) => {
        setContenusOnb(d1.contenus || []);
        setContenusVideosLib(d2.videos || []);
      })
      .catch(() => {})
      .finally(() => setContenusOnbLoading(false));
  }, [espaceInfo?.actif]); // eslint-disable-line

  // Guide de bienvenue affiché une seule fois, à la première connexion de l'apprenant.
  useEffect(() => {
    if (!espaceInfo?.actif || !espaceInfo?.profil?.id) return;
    const clef = `dash_onboarding_done_${espaceInfo.profil.id}`;
    if (!localStorage.getItem(clef)) setShowBienvenueModal(true);
  }, [espaceInfo?.actif, espaceInfo?.profil?.id]);

  function fermerBienvenueModal() {
    if (espaceInfo?.profil?.id) localStorage.setItem(`dash_onboarding_done_${espaceInfo.profil.id}`, "1");
    setShowBienvenueModal(false);
    const token = localStorage.getItem("user_token");
    if (token) fetch(`${API_URL}/api/dash/gamification/onboarding-complete`, { method:"POST", headers:{ Authorization:`Bearer ${token}` } }).catch(() => {});
  }

  function pingChatGamif() {
    const token = localStorage.getItem("user_token");
    if (!token) return;
    fetch(`${API_URL}/api/dash/gamification/chat-message`, { method:"POST", headers:{ Authorization:`Bearer ${token}` } }).catch(() => {});
  }

  // Cours a evaluer - le bandeau reste tant qu'il en reste un. Seules les seances ou
  // l'apprenant etait present remontent : le serveur ne renvoie que celles-la.
  const { seances: seancesANoter, recharger: rechargerANoter } = useSeancesANoter(
    API_URL, () => localStorage.getItem("user_token")
  );
  const [appreciationOuverte, setAppreciationOuverte] = useState(false);

  const vuesOnbEnvoyeesRef = useRef(new Set());
  function enregistrerVueContenuOnb(type, id) {
    const clef = `${type}:${id}`;
    if (vuesOnbEnvoyeesRef.current.has(clef)) return;
    vuesOnbEnvoyeesRef.current.add(clef);
    const token = localStorage.getItem("user_token");
    if (!token) return;
    fetch(`${API_URL}/api/dash/contenus/${type}/${id}/vue`, { method:"POST", headers:{ Authorization:`Bearer ${token}` } }).catch(() => {});
  }

  // ── Gamification : points, badges, classement du groupe ──
  useEffect(() => {
    if (activeTab !== "gamification") return;
    const token = localStorage.getItem("user_token");
    if (!token) return;
    setGamifLoading(true);
    (async () => {
      try {
        const [rPts, rBadges, rClass, rFidelite] = await Promise.all([
          fetch(`${API_URL}/api/dash/gamification/mes-points`, { headers:{ Authorization:`Bearer ${token}` } }),
          fetch(`${API_URL}/api/dash/gamification/mes-badges`, { headers:{ Authorization:`Bearer ${token}` } }),
          monGroupeId
            ? fetch(`${API_URL}/api/dash/gamification/classement?groupe_id=${monGroupeId}`, { headers:{ Authorization:`Bearer ${token}` } })
            : Promise.resolve(null),
          fetch(`${API_URL}/api/dash/badges-fidelite/mes-badges`, { headers:{ Authorization:`Bearer ${token}` } }),
        ]);
        if (rPts.ok) { const d = await rPts.json(); setGamifSolde(d.solde||0); setGamifTx(d.transactions||[]); }
        if (rBadges.ok) { const d = await rBadges.json(); setGamifBadges(d.badges||[]); }
        if (rClass?.ok) { const d = await rClass.json(); setGamifClassement(d.classement||[]); }
        if (rFidelite.ok) { const d = await rFidelite.json(); setBadgesFidelite(d.badges||[]); setAncienneteMois(d.anciennete||0); }
      } catch {}
      finally { setGamifLoading(false); }
    })();
  }, [activeTab, monGroupeId]);

  // ── Mini-jeux : chargement des instances actives + résultats déjà obtenus ──
  useEffect(() => {
    if (activeTab !== "minijeux") return;
    const token = localStorage.getItem("user_token");
    if (!token) { setJeuxInstances([]); return; }
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/dash/contenus/mini-jeux/publiques`, { headers:{ Authorization:`Bearer ${token}` } });
        if (r.ok) {
          const d = await r.json();
          setJeuxInstances(d.jeux || []);
        } else setJeuxInstances([]);

        const rMes = await fetch(`${API_URL}/api/dash/contenus/mini-jeux/mes-resultats`, { headers:{ Authorization:`Bearer ${token}` } });
        if (rMes.ok) {
          const dMes = await rMes.json();
          const parJeu = dMes.parJeu || {};
          setTentativesJeu(prev => {
            const next = { ...prev };
            Object.keys(parJeu).forEach(id => { next[id] = parJeu[id].tentatives; });
            return next;
          });
          Object.keys(parJeu).forEach(id => { attemptsRef.current[id] = parJeu[id].tentatives; });
          setMesJeuxParJeu(parJeu);
          setMesJeuxKpis(dMes.kpis || null);
        }
      } catch { setJeuxInstances([]); }
    })();
  }, [activeTab]);

  // `jeu` porte déjà l'id de l'instance en cours (plusieurs instances peuvent
  // partager le même moteur/type) - plus besoin de résoudre un id à partir du type.
  function enregistrerResultatJeu(score, scoreMax) {
    const jeuId = jeu;
    if (!jeuId) return;
    attemptsRef.current[jeuId] = (attemptsRef.current[jeuId] || 0) + 1;
    const tentative_numero = attemptsRef.current[jeuId];
    const token = localStorage.getItem("user_token");
    if (!token) return;
    (async () => {
      try {
        await fetch(`${API_URL}/api/dash/contenus/mini-jeux/${jeuId}/resultat`, {
          method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
          body: JSON.stringify({ score, score_max: scoreMax ?? null, tentative_numero }),
        });
        const pourcentage = scoreMax ? Math.round((score / scoreMax) * 100) : null;
        setMesJeuxParJeu(prev => {
          const cur = prev[jeuId] || { tentatives:0, meilleurPourcentage:null, moyennePourcentage:null };
          const nbAvantMoy = cur.moyennePourcentage != null ? cur.tentatives : 0;
          const nvlMoyenne = pourcentage != null
            ? Math.round(((cur.moyennePourcentage || 0) * nbAvantMoy + pourcentage) / (nbAvantMoy + 1))
            : cur.moyennePourcentage;
          return { ...prev, [jeuId]: {
            tentatives: cur.tentatives + 1,
            dernierScore: score, dernierPourcentage: pourcentage,
            meilleurPourcentage: pourcentage != null ? Math.max(cur.meilleurPourcentage ?? -1, pourcentage) : cur.meilleurPourcentage,
            moyennePourcentage: nvlMoyenne,
          } };
        });
        setMesJeuxKpis(prev => {
          const base = prev || { partiesJouees:0, jeuxJoues:0, meilleurScore:null, scoreMoyen:null };
          const dejaJoue = mesJeuxParJeu[jeuId] !== undefined;
          const total = base.partiesJouees + 1;
          const nvlMoyenne = pourcentage != null ? Math.round(((base.scoreMoyen || 0) * base.partiesJouees + pourcentage) / total) : base.scoreMoyen;
          return {
            partiesJouees: total,
            jeuxJoues: dejaJoue ? base.jeuxJoues : base.jeuxJoues + 1,
            meilleurScore: pourcentage != null ? Math.max(base.meilleurScore ?? -1, pourcentage) : base.meilleurScore,
            scoreMoyen: nvlMoyenne,
          };
        });
      } catch { /* silencieux - un résultat non reporté n'empêche pas de rejouer */ }
    })();
  }
  useEffect(() => { if (qcmFini) enregistrerResultatJeu(qcmScore, QCM_MOTS.length); }, [qcmFini]); // eslint-disable-line
  useEffect(() => { if (assocOk.length > 0 && assocOk.length === ASSOC_PAIRES_DATA.length) enregistrerResultatJeu(assocOk.length, ASSOC_PAIRES_DATA.length); }, [assocOk]); // eslint-disable-line
  useEffect(() => { if (lacuneFini) enregistrerResultatJeu(lacuneScore, LACUNES_DATA.length); }, [lacuneFini]); // eslint-disable-line
  useEffect(() => { if (anaFini) enregistrerResultatJeu(anaScore, ANAGRAMME_DATA.length); }, [anaFini]); // eslint-disable-line
  useEffect(() => { if (sprintFini) enregistrerResultatJeu(sprintScore, null); }, [sprintFini]); // eslint-disable-line
  useEffect(() => { if (vfFini) enregistrerResultatJeu(vfScore, VRAI_FAUX_DATA.length); }, [vfFini]); // eslint-disable-line
  useEffect(() => { if (reodreFini) enregistrerResultatJeu(reordreScore, REORDRE_DATA.length); }, [reodreFini]); // eslint-disable-line
  useEffect(() => { if (dialogueFini) enregistrerResultatJeu(dialogueScore, DIALOGUE_DATA.length); }, [dialogueFini]); // eslint-disable-line
  useEffect(() => { if (conjFini) enregistrerResultatJeu(conjScore, CONJUGAISON_DATA.length); }, [conjFini]); // eslint-disable-line
  useEffect(() => { if (cecrFini) enregistrerResultatJeu(cecrScore, CECR_DATA.length); }, [cecrFini]); // eslint-disable-line
  useEffect(() => { if (dicteeFini) enregistrerResultatJeu(dicteeScore, DICTEE_DATA.length); }, [dicteeFini]); // eslint-disable-line
  useEffect(() => { if (traFini) enregistrerResultatJeu(traScore, TRADUCTION_DATA.length); }, [traFini]); // eslint-disable-line
  useEffect(() => { if (crossFini && crossValide) enregistrerResultatJeu(crossValide.score, CROSSWORD.mots.length); }, [crossFini]); // eslint-disable-line
  useEffect(() => { if (wsFini) enregistrerResultatJeu(wsTrouves.length, WORDSEARCH_MOTS_POS.length); }, [wsFini]); // eslint-disable-line

  function resetAllJeux(id) {
    setJeu(id); setQcmIdx(0); setQcmScore(0); setQcmChoix(null); setQcmFini(false); setQcmTemps(15);
    setAssocSel(null); setAssocOk([]);
    setLacuneIdx(0); setLacuneInput(''); setLacuneScore(0); setLacuneFini(false); setLacuneMontre(false);
    setAnaIdx(0); setAnaInput(''); setAnaScore(0); setAnaFini(false); setAnaMontre(false);
    setSprintScore(0); setSprintTemps(60); setSprintFini(false); setSprintIdx(0); setSprintMots([...SPRINT_MOTS].sort(()=>Math.random()-0.5));
    setVfIdx(0); setVfScore(0); setVfFini(false); setVfChoix(null);
    setReordreIdx(0); setReordreScore(0); setReodreFini(false); setReordreSelec([]); setReordreValide(null);
    setReodreMots(REORDRE_DATA[0] ? [...REORDRE_DATA[0].mots].sort(()=>Math.random()-0.5) : []);
    setDialogueIdx(0); setDialogueEtape(0); setDialogueScore(0); setDialogueFini(false);
    setFlashIdx(0); setFlashRetourne(false); setFlashSus([]);
    setConjIdx(0); setConjInput(''); setConjScore(0); setConjFini(false); setConjMontre(false);
    setCecrIdx(0); setCecrScore(0); setCecrFini(false); setCecrChoix(null);
    setDicteeIdx(0); setDicteeInput(''); setDicteeScore(0); setDicteeFini(false); setDicteeMontre(false);
    setTraIdx(0); setTraInput(''); setTraScore(0); setTraFini(false); setTraMontre(false);
    setCrossInputs({}); setCrossValide(null); setCrossFini(false);
    setWsGrille(construireGrilleMotsCaches()); setWsDebut(null); setWsTrouves([]); setWsCellsTrouvees([]); setWsFini(false);
  }

  /* La reponse du serveur est LUE avant de toucher a l'ecran. Ces deux fonctions
     envoyaient la requete sans jamais la regarder : l'ecran affichait « terminé » quoi
     qu'il arrive, puis l'etat se perdait au rechargement. Un refus (cours verrouille,
     session expiree) passait ainsi totalement inapercu - ce qui se lit comme un bouton
     qui ne fonctionne pas. */
  /* OPTIMISTE : l'ecran repond au clic, sans attendre le serveur.
     Un aller-retour vers Supabase coute ~150 ms et la requete en enchaine plusieurs -
     attendre la reponse faisait paraitre fige un geste qui n'envoie qu'un booleen.
     On applique le resultat tout de suite et on REVIENT EN ARRIERE si le serveur refuse,
     en disant pourquoi : le seul cas ou l'affichage serait faux est aussi le seul ou l'on
     recoit une explication a montrer. */
  /** Recharge la liste des cours : en terminer un en DÉVERROUILLE d'autres. */
  const rechargerCoursElearning = async () => {
    try {
      const r = await fetchApprenant(`${API_URL}/api/cours-elearning/pour-apprenant`);
      if (r.ok) setCoursElearning((await r.json()).contenus || []);
    } catch { /* la liste reste telle quelle : sans gravité, un rechargement suffira */ }
  };

  /* ── « Mes cours » : filtres et pagination ───────────────────────────────
     Une classe accumule les publications au fil de l'année ; retrouver l'audio du mois
     dernier obligeait à parcourir toute la grille. */
  /* 12 et non 9 : la grille s'auto-remplit en 2, 3 ou 4 colonnes selon la largeur, et 12
     se divise par toutes. Avec 9, un écran à 4 colonnes affichait 2 rangées pleines puis
     une rangée d'un seul cours - et surtout renvoyait le 10e en page 2, si bien qu'un
     apprenant averti d'une publication ne la trouvait pas dans sa liste. */
  const COURS_PAR_PAGE = 12;

  const coursFiltres = useMemo(() => {
    const q = coursRecherche.trim().toLowerCase();
    // `du` à 00h00 et `au` à 23h59 : saisir la même date des deux côtés doit retenir
    // cette journée-là, pas un intervalle vide.
    const du = coursDu ? new Date(`${coursDu}T00:00:00`).getTime() : null;
    const au = coursAu ? new Date(`${coursAu}T23:59:59`).getTime() : null;

    return coursElearning.filter(c => {
      if (coursType && c.type_contenu !== coursType) return false;
      if (coursStatut === "lu"       && !c.lu)         return false;
      if (coursStatut === "non_lu"   && (c.lu || c.verrouille)) return false;
      if (coursStatut === "verrouille" && !c.verrouille) return false;
      if (du || au) {
        // Un contenu sans date n'est pas silencieusement rangé dans la période : on le
        // masque, sinon il apparaîtrait dans n'importe quel intervalle.
        const t = c.created_at ? new Date(c.created_at).getTime() : null;
        if (t == null || Number.isNaN(t)) return false;
        if (du && t < du) return false;
        if (au && t > au) return false;
      }
      if (q) {
        const foin = `${c.titre || ""} ${c.coach_nom || ""} ${(c.groupe_noms || []).join(" ")} ${(c.objectifs || []).join(" ")}`;
        if (!foin.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [coursElearning, coursRecherche, coursType, coursStatut, coursDu, coursAu]);

  const coursNbPages  = Math.max(1, Math.ceil(coursFiltres.length / COURS_PAR_PAGE));
  const coursPageSure = Math.min(coursPage, coursNbPages);
  const coursDebut    = (coursPageSure - 1) * COURS_PAR_PAGE;
  const coursPageVisibles = coursFiltres.slice(coursDebut, coursDebut + COURS_PAR_PAGE);

  // Filtrer depuis la page 3 laisserait une grille vide : on revient au début.
  useEffect(() => { setCoursPage(1); }, [coursRecherche, coursType, coursStatut, coursDu, coursAu]);

  const coursFiltreActif = !!(coursRecherche || coursType || coursStatut || coursDu || coursAu);

  const marquerModuleLu = async (moduleId, classeId) => {
    /* Le modal reste OUVERT tant que le serveur n'a pas répondu, et l'état n'est PAS
       anticipé. La version précédente fermait le modal et cochait le cours avant l'appel :
       en cas de refus - « Terminez d'abord « … » » - tout était défait en silence derrière
       un toast fugace, et le bouton donnait l'impression de ne rien faire. C'est
       exactement ce qui se produisait ici : six cours étaient retenus par un seul, et le
       message qui l'expliquait ne restait pas à l'écran. */
    setConfirmLuEnCours(true);
    setConfirmLuErreur("");
    try {
      // `fetchApprenant` et non `fetch` : après une heure passée sur la page, le jeton a
      // expiré et l'appel partait en 401 sans que rien ne le rattrape.
      const r = await fetchApprenant(`${API_URL}/api/apprenants/contenus/${moduleId}/lu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classe_id: classeId || null }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        // Le motif s'affiche DANS le modal, qui reste ouvert : c'est là que l'apprenant
        // regarde, et c'est une explication à lire, pas une notification à survoler.
        setConfirmLuErreur(r.status === 401
          ? "Votre session a expiré - reconnectez-vous, puis réessayez."
          : (d.error || "Impossible de marquer ce module comme terminé"));
        return;
      }
      setCoursLus(prev => ({ ...prev, [moduleId]: true }));
      setConfirmLuModal(null);
      toast.success("✅ Module marqué comme terminé !");
      // La liste est rechargée : terminer un cours en DÉVERROUILLE d'autres, et l'écran
      // les laissait cadenassés jusqu'au prochain rafraîchissement manuel.
      rechargerCoursElearning();
    } catch (e) {
      setConfirmLuErreur(e?.name === "AbortError"
        ? "Le serveur n'a pas répondu à temps. Vérifiez votre connexion et réessayez."
        : "Erreur réseau - le module n'a pas été enregistré. Réessayez.");
    } finally {
      setConfirmLuEnCours(false);
    }
  };

  const markAppNotifRead = (id) => {
    const token = localStorage.getItem("user_token");
    fetch(`${API_URL}/api/apprenants/notifs/${id}/lu`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}` }
    }).catch(() => {});
    setAppNotifs(prev => prev.map(n => n.id === id ? { ...n, lu: true } : n));
  };

  const markAllAppNotifsRead = () => {
    const token = localStorage.getItem("user_token");
    fetch(`${API_URL}/api/apprenants/notifs/tout-lire`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}` }
    }).catch(() => {});
    setAppNotifs(prev => prev.map(n => ({ ...n, lu: true })));
  };

  // Vérification retour TouchPoint (remplace l'ancien "?paiement=retour&tid=...")
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderNumber = params.get("order_number");
    const retour       = params.get("paiement");
    if (retour !== "retour" || !orderNumber) return;
    window.history.replaceState({}, "", window.location.pathname);
    fetch(`${API_URL}/api/touchpoint/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_number: orderNumber }),
    })
      .then(r => r.json())
      .then(d => {
        const statut = d.paiement?.statut;
        let ctx = null;
        try { ctx = d.paiement?.message ? JSON.parse(d.paiement.message) : null; } catch (_) {}
        const estBoutique = ctx?.context === "boutique";
        if (statut === "validé") {
          if (estBoutique) {
            toast.success("🎉 Paiement confirmé ! Votre commande a été enregistrée.");
            setActiveTab("boutique");
            setBoutiqueSubTab("achats");
            fetchMesCommandes();
          } else {
            toast.success("🎉 Paiement confirmé ! Votre historique a été mis à jour.");
            setActiveTab("paiement");
            const token = localStorage.getItem("user_token");
            if (token) {
              fetch(`${API_URL}/api/apprenants/mon-espace`, { headers: { Authorization: `Bearer ${token}` } })
                .then(r => r.json()).then(d2 => { if (d2) setEspaceInfo(d2); });
            }
          }
        } else if (statut === "en_attente") {
          toast("⏳ Paiement en cours de vérification. Revenez dans quelques minutes.", { icon: "⏳" });
        } else {
          toast.error("❌ Paiement non confirmé. Contactez le support.");
        }
      })
      .catch(() => toast.error("Impossible de vérifier le paiement."));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Charge le script TouchPoint (Checkout page) puis appelle SendPaymentInfos()
  // côté client avec les paramètres renvoyés par /initiate - logique partagée
  // entre le paiement de tranche de scolarité et l'achat boutique (même
  // mécanique que TouchPointButton.jsx côté site public).
  const declencherTouchPoint = async (d) => {
    if (typeof window.sendPaymentInfos !== "function") {
      // Le script TouchPoint utilise window.CryptoJS en interne sans le
      // charger lui-même ("CryptoJS is not defined") - chargé ici avant lui.
      if (typeof window.CryptoJS === "undefined") {
        await new Promise((resolve, reject) => {
          const cryptoScript = document.createElement("script");
          cryptoScript.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js";
          cryptoScript.type = "text/javascript";
          cryptoScript.onload = resolve;
          cryptoScript.onerror = () => reject(new Error("Échec chargement CryptoJS"));
          document.body.appendChild(cryptoScript);
        });
      }
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = d.script_url;
        script.type = "text/javascript";
        // Le script peut finir son initialisation interne un instant après
        // son propre onload - on attend que SendPaymentInfos soit vraiment prête.
        script.onload = () => {
          const start = Date.now();
          const interval = setInterval(() => {
            if (typeof window.sendPaymentInfos === "function") {
              clearInterval(interval);
              resolve();
            } else if (Date.now() - start > 8000) {
              clearInterval(interval);
              reject(new Error("Script TouchPoint indisponible"));
            }
          }, 150);
        };
        script.onerror = () => reject(new Error("Échec chargement script TouchPoint"));
        document.body.appendChild(script);
      });
    }

    window.sendPaymentInfos(
      d.order_number, d.agency_code, d.secure_code, d.domain_name,
      d.url_redirection_success, d.url_redirection_failed,
      d.amount, d.city, d.email, d.clientFirstName, d.clientLastName, d.clientPhone
    );
  };

  // Initier un paiement TouchPoint pour une tranche de scolarité.
  const handlePayerTranche = async (tranche) => {
    if (cpLoading) return;
    setCpTranche(tranche);
    setCpLoading(true);
    try {
      const token = localStorage.getItem("user_token");
      const res = await fetch(`${API_URL}/api/apprenants/initier-paiement`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          montant:        tranche.montant,
          description:    tranche.label || "Paiement formation BET",
          tranche_id:     tranche.id,
          assignation_id: espaceInfo?.parcours?.id,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.order_number) { toast.error(d.error || "Erreur lors du paiement"); return; }
      await declencherTouchPoint(d);
    } catch {
      toast.error("Erreur réseau, réessayez.");
    } finally {
      setCpLoading(false);
      setCpTranche(null);
    }
  };

  // Écran chargement
  if (authLoading) return (
    <div style={{ minHeight:"100vh", background:"#f8fafc", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Montserrat','Segoe UI',sans-serif" }}>
      <style>{`@keyframes eaSpin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ textAlign:"center" }}>
        <div style={{ width:40, height:40, border:"3px solid #e2e8f0", borderTopColor:"#011451", borderRadius:"50%", animation:"eaSpin .8s linear infinite", margin:"0 auto 16px" }}/>
        <p style={{ color:"#64748b", fontSize:13 }}>Chargement de votre espace…</p>
      </div>
    </div>
  );

  // Écran compte inactif
  if (espaceInfo && !espaceInfo.actif) {
    const p = espaceInfo.profil || {};
    const ini = ((p.prenom?.[0]||"")+(p.nom?.[0]||"")).toUpperCase() || "🎓";
    return (
      <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#011451 0%,#0c33ac 60%,#1e40af 100%)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'Montserrat','Segoe UI',sans-serif", padding:24 }}>
        <style>{`@keyframes eaFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}`}</style>
        <div style={{ marginBottom:32, textAlign:"center" }}>
          <div style={{ width:56, height:56, background:"#ff2945", borderRadius:16, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, color:"#fff", fontSize:26, margin:"0 auto 10px" }}>B</div>
          <div style={{ fontSize:17, fontWeight:900, color:"#fff" }}>Binnie's <span style={{ color:"#ff2945" }}>BET</span></div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:".12em" }}>British English Training</div>
        </div>
        <div style={{ background:"#fff", borderRadius:24, maxWidth:460, width:"100%", padding:"36px 32px", boxShadow:"0 32px 80px rgba(0,0,0,0.35)", textAlign:"center" }}>
          <div style={{ width:68, height:68, borderRadius:"50%", background:"linear-gradient(135deg,#011451,#0c33ac)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, fontWeight:900, color:"#fff", margin:"0 auto 18px", animation:"eaFloat 3s ease-in-out infinite" }}>
            {ini}
          </div>
          <h2 style={{ fontSize:20, fontWeight:900, color:"#011451", margin:"0 0 8px" }}>Bonjour, {p.prenom || "Apprenant"} 👋</h2>
          <p style={{ fontSize:13, color:"#64748b", margin:"0 0 24px", lineHeight:1.7 }}>
            Votre compte a été créé avec succès.<br/>Notre équipe finalise votre affectation à un groupe et un coach.
          </p>
          <div style={{ background:"#fff7ed", border:"1.5px solid #fed7aa", borderRadius:14, padding:"18px 20px", marginBottom:20 }}>
            <div style={{ fontSize:28, marginBottom:8 }}>⏳</div>
            <div style={{ fontSize:14, fontWeight:800, color:"#9a3412", marginBottom:6 }}>Compte en cours d'activation</div>
            <div style={{ fontSize:12, color:"#c2410c", lineHeight:1.7 }}>
              Vous recevrez un email dès que vous serez affecté(e) à votre groupe. Vous pourrez alors accéder à vos cours, sessions et exercices.
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:24 }}>
            {[["📚","Cours & modules"],["🎥","Sessions live"],["✏️","Exercices"],["🏆","Certifications"]].map(([i,l])=>(
              <div key={l} style={{ padding:"10px 12px", borderRadius:10, background:"#f0f4ff", border:"1px solid #c7d2fe", fontSize:11, fontWeight:600, color:"#3730a3" }}>{i} {l}</div>
            ))}
          </div>
          <div style={{ fontSize:12, color:"#9ca3af", marginBottom:20 }}>
            Des questions ? <a href="mailto:contact@binniesenglish.com" style={{ color:"#0c33ac", fontWeight:600 }}>contact@binniesenglish.com</a>
          </div>
          <button onClick={handleLogoutApprenant} style={{ padding:"10px 24px", background:"#f1f5f9", border:"none", borderRadius:99, fontSize:12, fontWeight:600, color:"#64748b", cursor:"pointer" }}>
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:PRIMARY_LIGHT }}>
      <div style={{ flex:1, padding:0, overflowX:"hidden" }}>

        {/* Bandeau d'appreciation - sans bouton de fermeture : une notification qu'on peut
            ecarter est ecartee, et le taux de reponse tombe. Il part quand tout est note. */}
        <BandeauAppreciation
          nb={seancesANoter.length}
          accent={PRIMARY_COLOR}
          onOuvrir={() => setAppreciationOuverte(true)}
        />
        {appreciationOuverte && (
          <AppreciationSeance
            seances={seancesANoter}
            apiUrl={API_URL}
            jeton={() => localStorage.getItem("user_token")}
            accent={PRIMARY_COLOR}
            onFerme={() => setAppreciationOuverte(false)}
            onEnvoye={() => rechargerANoter()}
          />
        )}

        {/* HERO HEADER */}
        <div style={{ background:GRADIENT_HEADER, padding:"28px 32px 0", color:"#fff", position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:-40, right:-40, width:200, height:200, borderRadius:"50%", background:"rgba(255,255,255,0.04)" }} />
          <div style={{ position:"absolute", bottom:-60, right:80, width:120, height:120, borderRadius:"50%", background:"rgba(255,255,255,0.03)" }} />

          <div style={{ display:"flex", alignItems:"center", gap:20, marginBottom:28, position:"relative", flexWrap:"wrap" }}>
            <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:22, color:"#fff", border:"3px solid rgba(255,255,255,0.3)", overflow:"hidden", flexShrink:0 }}>
              {(avatarUrl || profil.avatar_url)
                ? <img src={avatarUrl || profil.avatar_url} alt="avatar" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                : profil.avatar}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:2 }}>
                <span style={{ fontSize:11, color:"#fecaca", fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase" }}>Bienvenue</span>
                <span style={{ fontSize:10, fontWeight:700, padding:"2px 10px", borderRadius:20, background:ui.badgeBg, color:"#fff" }}>{ui.label}</span>
              </div>
              {/* `textAlign:"left"` EXPLICITE : `App.css` impose `h1 { text-align: center }`
                  à toute l'application, et la salutation se retrouvait centrée au milieu
                  d'un bloc aligné à gauche. Même piège que sur l'en-tête du coach. */}
              <h1 style={{ margin:0, fontSize:22, fontWeight:800, textAlign:"left" }}>{ui.salutation(profil.surnom || profil.prenom || "Apprenant")}</h1>
              <div style={{ fontSize:12, color:"#fecaca", marginTop:3, display:"flex", gap:12, flexWrap:"wrap" }}>
                <span>{ui.sousTexte}</span>
                {profil.classe && <span>· {profil.classe}</span>}
              </div>
            </div>
            <div style={{ textAlign:"center", padding:"12px 20px", borderRadius:12, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)" }}>
              <div style={{ fontSize:10, color:"#fecaca", marginBottom:2, fontWeight:600 }}>NIVEAU ACTUEL</div>
              <div style={{ fontSize:28, fontWeight:900 }}>{profil.niveau}</div>
              <div style={{ fontSize:10, color:"#fecaca" }}>{NIVEAU_META[profil.niveau]?.label}</div>
            </div>
            <ApprenantColorPicker currentColor={PRIMARY_COLOR} />
            {/* Cloche notifications apprenant */}
            {(() => {
              const nonLus = appNotifs.filter(n => !n.lu).length;
              return (
                <div style={{ position:"relative" }}>
                  <button
                    onClick={() => setActiveTab("notifications_appr")}
                    title={nonLus > 0 ? `${nonLus} notification(s) non lue(s)` : "Notifications"}
                    style={{ position:"relative", background:"rgba(255,255,255,0.1)", border:"1.5px solid rgba(255,255,255,0.25)", borderRadius:10, width:44, height:44, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#fff", fontSize:20, flexShrink:0 }}>
                    🔔
                    {nonLus > 0 && (
                      <span style={{ position:"absolute", top:-5, right:-5, background:"#ef4444", color:"#fff", borderRadius:"50%", width:18, height:18, fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1, border:"2px solid #0c33ac" }}>
                        {nonLus > 9 ? "9+" : nonLus}
                      </span>
                    )}
                  </button>
                </div>
              );
            })()}
            <button
              onClick={handleLogoutApprenant}
              style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 18px", background:"rgba(255,255,255,0.1)", border:"1.5px solid rgba(255,255,255,0.25)", borderRadius:10, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", flexShrink:0 }}
              onMouseEnter={e => e.currentTarget.style.background="rgba(220,38,38,0.35)"}
              onMouseLeave={e => e.currentTarget.style.background="rgba(255,255,255,0.1)"}
            >
              <span style={{ fontSize:16 }}>🚪</span> Déconnexion
            </button>
          </div>

          <div style={{ display:"flex", gap:0, background:"rgba(0,0,0,0.15)", borderRadius:"12px 12px 0 0", overflow:"hidden" }}>
            {[
              { l:"Cours suivis",  v:coursElearning.length, c:"#fca5a5" },
              { l:"Assiduité",     v: appPresences && appPresences.length > 0
                  ? `${Math.round((appPresences.filter(p=>p.statut==="present").length / appPresences.length) * 100)}%`
                  : "-",
                c:"#fecaca" },
              { l:"Certifications", v:certifCount, c:"#34d399" },
            ].map((s, i, arr) => (
              <div key={s.l} style={{ flex:1, textAlign:"center", padding:"14px 8px", borderRight: i < arr.length-1 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", marginBottom:3 }}>{s.l}</div>
                <div style={{ fontSize:20, fontWeight:800, color:s.c }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding:"0 24px 24px" }}>

          {/* ── BANNIÈRE ABSENCES - avertit avant le blocage automatique à la 4e absence ── */}
          {accesStatus && !accesStatus.acces_bloque && accesStatus.nb_absences > 0 && (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 18px", marginTop:14, borderRadius:10,
              background: accesStatus.nb_absences >= 3 ? "#fef2f2" : "#fffbeb",
              border: `2px solid ${accesStatus.nb_absences >= 3 ? "#fca5a5" : "#fde68a"}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:20 }}>{accesStatus.nb_absences >= 3 ? "🔴" : "⚠️"}</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color: accesStatus.nb_absences >= 3 ? "#dc2626" : "#92400e" }}>
                    {accesStatus.nb_absences} absence{accesStatus.nb_absences>1?"s":""} enregistrée{accesStatus.nb_absences>1?"s":""}
                  </div>
                  <div style={{ fontSize:12, color: accesStatus.nb_absences >= 3 ? "#b91c1c" : "#a16207" }}>
                    Votre accès sera automatiquement bloqué à la {accesStatus.seuil_blocage || 4}e absence - contactez votre coach ou votre assistante si besoin.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── BANNIÈRES PAIEMENT GLOBALES ── */}
          {overdueTranches.length > 0 && activeTab !== "paiement" && (
            <div onClick={() => setActiveTab("paiement")} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 18px", marginTop:14, borderRadius:10, background:"#fef2f2", border:"2px solid #fca5a5", cursor:"pointer" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:20 }}>🔴</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color:"#dc2626" }}>Paiement(s) en retard</div>
                  <div style={{ fontSize:12, color:"#b91c1c" }}>{overdueTranches.length} tranche(s) non réglée(s) - cliquez pour régulariser</div>
                </div>
              </div>
              <span style={{ fontSize:12, fontWeight:700, color:"#dc2626", whiteSpace:"nowrap" }}>Voir →</span>
            </div>
          )}
          {overdueTranches.length === 0 && upcomingTranches.length > 0 && activeTab !== "paiement" && (
            <div onClick={() => setActiveTab("paiement")} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 18px", marginTop:14, borderRadius:10, background:"#fff7ed", border:"2px solid #fed7aa", cursor:"pointer" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:20 }}>⏰</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color:"#c2410c" }}>Échéance proche</div>
                  <div style={{ fontSize:12, color:"#9a3412" }}>{upcomingTranches.length} paiement(s) à régler dans moins de 7 jours</div>
                </div>
              </div>
              <span style={{ fontSize:12, fontWeight:700, color:"#c2410c", whiteSpace:"nowrap" }}>Voir →</span>
            </div>
          )}

          {/* TABS */}
          <div style={{ display:"flex", gap:3, marginBottom:0, flexWrap:"wrap", paddingTop:20 }}>
            {tabs.map(tab => {
              const isActive = activeTab === tab.key;
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                  padding:"10px 16px", borderRadius:"8px 8px 0 0", border:"none", cursor:"pointer",
                  fontWeight:600, fontSize:13,
                  background: isActive ? "#fff" : PRIMARY_LIGHT,
                  color: isActive ? PRIMARY_COLOR : PRIMARY_DARK,
                  boxShadow: isActive ? `0 -2px 8px ${PRIMARY_COLOR}25` : "none",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                  flex:"1 1 130px", whiteSpace:"nowrap",
                }}>
                  <span style={{ fontSize:14 }}>{tab.icon}</span>
                  {tab.label}
                  {tab.count !== null && tab.count !== undefined && (
                    <span style={{ padding:"1px 7px", borderRadius:10, fontSize:11, fontWeight:700,
                      background: tab.danger ? "#fee2e2" : isActive ? PRIMARY_LIGHT : "#fecaca",
                      color: tab.danger ? "#dc2626" : isActive ? PRIMARY_COLOR : PRIMARY_DARK }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {!banderoleNotifFermee && activeTab !== "notifications_appr" && appNotifs.filter(n => !n.lu).slice(0, 3).length > 0 && (
            <div style={{ padding:"10px 16px", background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:8, marginBottom:12, display:"flex", alignItems:"flex-start", gap:10 }}>
              <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>🔔</span>
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:4 }}>
                {appNotifs.filter(n => !n.lu).slice(0, 3).map(n => (
                  <div key={n.id} onClick={() => { markAppNotifRead(n.id); setActiveTab("notifications_appr"); }}
                    style={{ cursor:"pointer", display:"flex", flexDirection:"column" }}>
                    <span style={{ fontWeight:700, color:"#9a3412", fontSize:12 }}>{n.titre}</span>
                    <span style={{ color:"#78716c", fontSize:11 }}>{n.message}</span>
                  </div>
                ))}
                {appNotifsNonLus > 3 && (
                  <button onClick={()=>setActiveTab("notifications_appr")} style={{ alignSelf:"flex-start", background:"none", border:"none", color:"#9a3412", fontWeight:700, fontSize:11, cursor:"pointer", padding:0 }}>
                    +{appNotifsNonLus - 3} autre{appNotifsNonLus - 3 > 1 ? "s" : ""} →
                  </button>
                )}
              </div>
              <button onClick={()=>setBanderoleNotifFermee(true)} title="Masquer" style={{ background:"none", border:"none", cursor:"pointer", color:"#9a3412", fontSize:14, flexShrink:0 }}>✕</button>
            </div>
          )}

          {/* Bannière classe clôturée */}
          {classeCloturee && (
            <div style={{ background:"#fef2f2", border:"1.5px solid #fca5a5", borderRadius:10, padding:"12px 18px", marginBottom:12, display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:20 }}>🔒</span>
              <div>
                <div style={{ fontWeight:800, color:"#991b1b", fontSize:13 }}>Classe clôturée</div>
                <div style={{ fontSize:12, color:"#b91c1c" }}>Votre classe "{realGI?.nom}" est terminée. Vos cours, résultats et historique restent consultables.</div>
              </div>
            </div>
          )}

          {/* Bannière formation arrêtée - l'espace reste ouvert, et c'est justement
              pourquoi il faut le dire : sans ce message, l'apprenant verrait ses cours
              cesser d'arriver sans savoir que sa formation a été déclarée terminée. */}
          {formationArretee && !classeCloturee && (
            <div style={{ background:"#fff7ed", border:"1.5px solid #fed7aa", borderRadius:10, padding:"12px 18px", marginBottom:12, display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:20 }}>🎓</span>
              <div>
                <div style={{ fontWeight:800, color:"#9a3412", fontSize:13 }}>
                  Formation arrêtée{formationArretee.date ? ` le ${new Date(formationArretee.date).toLocaleDateString("fr-FR")}` : ""}
                  {formationArretee.motif ? ` - ${formationArretee.motif}` : ""}
                </div>
                <div style={{ fontSize:12, color:"#b45309" }}>
                  Vos cours suivis, vos résultats et votre historique restent consultables.
                  Les nouveaux cours publiés depuis cette date ne vous sont plus destinés.
                </div>
              </div>
            </div>
          )}

          {/* CARD PRINCIPALE */}
          <div style={{ background:"#fff", padding:24, borderRadius:"0 12px 12px 12px", boxShadow:"0 2px 8px rgba(0,0,0,0.05)" }}>

            {/* DASHBOARD */}
            {activeTab === "dashboard" && (
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                  <div><h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>Mon tableau de bord</h2><p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Bienvenue dans votre espace personnel BET</p></div>
                  <div style={{ fontSize:12, color:"#9ca3af" }}>Dernière connexion : {formatDateFull("2025-12-09")}</div>
                </div>
                {/* ── PROCHAINE ÉCHÉANCE ──
                    L'apprenant recevait des rappels J-7/J-3/J-1 par notification, mais son
                    espace ne montrait rien : il ne pouvait pas vérifier de lui-même, entre
                    deux rappels, ce qu'il devait ni quand. D'où l'impression d'être poussé
                    au paiement plutôt qu'informé.
                    Le calcul est celui du cron, à la ligne près - sans quoi la carte
                    annoncerait une date et la notification une autre. */}
                {echeance.etat !== "aucun_plan" && (() => {
                  const E = {
                    suspendu: { bg:"#fff7ed", bd:"#fed7aa", c:"#9a3412", icone:"⏸️", titre:"Facturation suspendue" },
                    a_jour:   { bg:"#f0fdf4", bd:"#bbf7d0", c:"#15803d", icone:"✅", titre:"Vous êtes à jour" },
                    retard:   { bg:"#fef2f2", bd:"#fca5a5", c:"#b91c1c", icone:"🔴", titre:"Mensualité en retard" },
                    proche:   { bg:"#fff7ed", bd:"#fed7aa", c:"#c2410c", icone:"⏰", titre:"Prochaine échéance" },
                    a_venir:  { bg:"#f8fafc", bd:"#e2e8f0", c:"#0f172a", icone:"💳", titre:"Prochaine échéance" },
                  };
                  const cle = echeance.etat === "du"
                    ? (echeance.jours < 0 ? "retard" : echeance.jours <= 7 ? "proche" : "a_venir")
                    : echeance.etat;
                  const st = E[cle];
                  const rappel = echeance.etat === "du" ? prochainRappel(echeance.jours) : null;

                  return (
                    <div onClick={()=>setActiveTab("paiement")}
                      style={{ background:st.bg, border:`1.5px solid ${st.bd}`, borderRadius:12, padding:"14px 18px",
                        marginBottom:16, display:"flex", alignItems:"center", gap:14, cursor:"pointer", flexWrap:"wrap" }}>
                      <span style={{ fontSize:24, lineHeight:1 }}>{st.icone}</span>

                      <div style={{ flex:1, minWidth:180 }}>
                        <div style={{ fontWeight:800, fontSize:13.5, color:st.c }}>{st.titre}</div>

                        {echeance.etat === "du" && (
                          <>
                            <div style={{ fontSize:13, color:"#0f172a", marginTop:3 }}>
                              <strong>{libelleMois(echeance.mois.periode)}</strong>
                              {" · "}{Number(echeance.montant).toLocaleString("fr-FR")} F
                              {echeance.partiel && <span style={{ color:"#0891b2" }}> (reste à payer)</span>}
                            </div>
                            <div style={{ fontSize:12, color:st.c, marginTop:2, fontWeight:600 }}>
                              {echeance.echeance ? `Échéance le ${echeance.echeance.toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" })}` : ""}
                              {" - "}{delaiLisible(echeance.jours)}
                            </div>
                            {/* Dire quand le rappel partira évite de le découvrir comme une
                                relance : l'apprenant sait à quoi s'attendre. */}
                            {rappel && (
                              <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>
                                🔔 Rappel automatique {rappel.dans === 0 ? "aujourd'hui" : `dans ${rappel.dans} jour${rappel.dans > 1 ? "s" : ""}`} (J-{rappel.seuil})
                              </div>
                            )}
                          </>
                        )}

                        {echeance.etat === "suspendu" && (
                          <div style={{ fontSize:12, color:"#b45309", marginTop:3, lineHeight:1.55 }}>
                            Aucune mensualité n'est due pour l'instant
                            {echeance.suspension?.motif ? ` - ${echeance.suspension.motif}` : ""}.
                            {" "}Vos paiements passés restent consultables.
                          </div>
                        )}

                        {echeance.etat === "a_jour" && (
                          <div style={{ fontSize:12, color:"#15803d", marginTop:3 }}>
                            {echeance.dernierPaye
                              ? `Réglé jusqu'à ${libelleMois(echeance.dernierPaye.periode)} inclus. La prochaine mensualité apparaîtra ici dès qu'elle sera générée.`
                              : "Aucune mensualité en attente."}
                          </div>
                        )}
                      </div>

                      <span style={{ fontSize:12, fontWeight:700, color:st.c, whiteSpace:"nowrap" }}>Voir le détail →</span>
                    </div>
                  );
                })()}

                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px,1fr))", gap:12, marginBottom:24 }}>
                  {/* Cours e-learning - affiché pour coaching groupe principalement */}
                  {isCoachingGroupe && (
                    <StatCard label="Cours disponibles" value={coursElearning.length} color={PRIMARY_COLOR} icon="📚" sub={coursElearning.length > 0 ? `${coursElearning.length} cours` : "aucun"} onClick={()=>setActiveTab("cours")} />
                  )}
                  {/* Prochaine séance - dynamique */}
                  <StatCard
                    label={isCoachingPrive ? "Prochaine séance" : "Prochain cours"}
                    value={prochaineSeance?.label ?? "-"}
                    color={PRIMARY_DARK} icon="📅"
                    sub={prochaineSeance?.sub ?? (isCoachingPrive ? "Aucune séance prévue" : "Aucun cours planifié")}
                    onClick={()=>setActiveTab("planning")}
                  />
                  <StatCard label="Ressources" value={mesFichiers?.length ?? "…"} color="#059669" icon="📂" sub={mesFichiers ? `${mesFichiers.length} fichier${mesFichiers.length!==1?"s":""}`:"chargement"} onClick={()=>setActiveTab("ressources")} />
                  <StatCard label="Messages" value={msgNonLus > 0 ? msgNonLus : "📬"} color={msgNonLus>0?"#dc2626":"#9ca3af"} icon="💬" sub={msgNonLus > 0 ? `${msgNonLus} non lu${msgNonLus>1?"s":""}` : "À jour"} onClick={()=>setActiveTab("messages")} />
                  {/* Absences - présence pour tous */}
                  {appPresences && (
                    <StatCard label="Absences" value={appPresences.filter(p=>p.statut==="absent").length} color={appPresences.filter(p=>p.statut==="absent").length >= 3 ? "#dc2626" : "#059669"} icon="✅" sub={`sur ${appPresences.length} séances`} onClick={()=>setActiveTab("presences")} />
                  )}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:20 }}>
                  <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                      <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a" }}>Progression de mes cours</h3>
                      <button onClick={()=>setActiveTab("cours")} style={{ padding:"5px 10px", background:"none", color:PRIMARY_COLOR, border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:11 }}>Voir tout →</button>
                    </div>
                    {coursElearningLoading && <div style={{ fontSize:12, color:"#9ca3af", textAlign:"center", padding:16 }}>Chargement…</div>}
                    {!coursElearningLoading && coursElearning.length === 0 && (
                      <div style={{ fontSize:12, color:"#9ca3af", textAlign:"center", padding:20 }}>Aucun cours disponible pour votre classe.</div>
                    )}
                    {/* Les trois cours qui comptent MAINTENANT : ceux qui restent à faire.
                        Depuis que la liste est triée chronologiquement, un `slice(0,3)`
                        brut montrerait les trois plus anciens - souvent déjà terminés -
                        sur un bloc qui s'appelle « Progression ». */}
                    {[...coursElearning.filter(c => !c.lu), ...coursElearning.filter(c => c.lu)].slice(0,3).map(c => (
                      <div key={c.id} style={{ marginBottom:12, padding:"12px 14px", borderRadius:10, background: c.verrouille ? "#f8fafc" : "#fff", border:`1px solid ${c.lu ? "#86efac" : c.verrouille ? "#e2e8f0" : (c.color||PRIMARY_COLOR)+"30"}`, cursor: c.verrouille ? "not-allowed" : "pointer", opacity: c.verrouille ? .85 : 1 }}
                        title={!c.verrouille ? undefined
                          : c.motif === "avant_arrivee" ? "Publié avant votre arrivée dans la classe"
                          : c.bloque_par?.titre ? `Terminez d'abord « ${c.bloque_par.titre} »`
                          : "Cours pas encore accessible"}
                        onClick={()=>{ if (!c.verrouille) setCoursElearningDetail(c); }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ fontSize:20 }}>{c.verrouille ? (c.motif === "avant_arrivee" ? "🕓" : "🔒") : (c.emoji||"📚")}</span>
                            <div><div style={{ fontWeight:600, fontSize:13 }}>{c.titre}</div><div style={{ fontSize:11, color:"#9ca3af" }}>{c.coach_nom||"Formateur BET"} · {(c.verrouille ? (c.nb_blocs_caches||0) : (c.blocs||[]).length)} partie{(c.verrouille ? (c.nb_blocs_caches||0) : (c.blocs||[]).length)!==1?"s":""}</div></div>
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            {c.lu && (
                              <span style={{ padding:"2px 8px", borderRadius:14, fontSize:10.5, fontWeight:800, background:"#dcfce7", color:"#15803d", whiteSpace:"nowrap" }}>✓ Lu</span>
                            )}
                            <NiveauBadge niveau={c.niveau||"B1"} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                    <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                      <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:12 }}>🎯 Mon objectif principal</h3>
                      <p style={{ fontSize:13, color:"#374151", fontStyle:"italic", marginBottom:12, lineHeight:1.6 }}>
                        "{profil.objectif || (isCoachingPrive ? "Progresser en anglais avec un suivi personnalisé" : "Maîtriser l'anglais en groupe")}"
                      </p>
                      {profil.niveau && (
                        <div style={{ padding:"8px 12px", background:PRIMARY_LIGHT, borderRadius:8, fontSize:12, color:PRIMARY_COLOR, fontWeight:600, textAlign:"center" }}>
                          Niveau évalué : <strong>{profil.niveau}</strong>
                        </div>
                      )}
                    </div>
                    {/* Infos coach (privé) ou prochain examen (groupe) */}
                    {isCoachingPrive ? (
                      <div style={{ background:PRIMARY_LIGHT, borderRadius:12, padding:16, border:`1px solid ${PRIMARY_COLOR}30` }}>
                        <div style={{ fontSize:12, fontWeight:700, color:PRIMARY_COLOR, marginBottom:8 }}>👨‍🏫 Votre coach</div>
                        {realCoach ? (
                          <>
                            <div style={{ fontSize:15, fontWeight:800, color:"#0f172a" }}>{realCoach.prenom} {realCoach.nom}</div>
                            {realCoach.email && <div style={{ fontSize:12, color:"#6b7280", marginTop:4 }}>✉️ {realCoach.email}</div>}
                            <button onClick={()=>setActiveTab("messages")} style={{ marginTop:10, width:"100%", padding:"8px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:700 }}>
                              💬 Envoyer un message
                            </button>
                          </>
                        ) : (
                          <div style={{ fontSize:13, color:"#9ca3af" }}>Coach en cours d'assignation par l'équipe BET.</div>
                        )}
                      </div>
                    ) : (
                      <div style={{ background:PRIMARY_LIGHT, borderRadius:12, padding:16, border:`1px solid ${PRIMARY_COLOR}30` }}>
                        <div style={{ fontSize:12, fontWeight:700, color:PRIMARY_COLOR, marginBottom:6 }}>👥 Ma classe</div>
                        <div style={{ fontSize:15, fontWeight:800, color:"#0f172a" }}>{realGI?.nom || "-"}</div>
                        {realGI?.filiere && <div style={{ fontSize:12, color:"#6b7280", marginTop:4 }}>📚 {realGI.filiere}</div>}
                        {realCoach && <div style={{ fontSize:12, color:"#6b7280", marginTop:4 }}>👨‍🏫 Coach : {realCoach.prenom} {realCoach.nom}</div>}
                        <button onClick={()=>setActiveTab("planning")} style={{ marginTop:10, width:"100%", padding:"8px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:700 }}>
                          📅 Voir le planning
                        </button>
                      </div>
                    )}
                    <div style={{ background:"#f8fafc", borderRadius:12, padding:16 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                        <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", margin:0 }}>💬 Messagerie</h3>
                        <button onClick={()=>setActiveTab("messages")} style={{ padding:"5px 10px", background:"none", color:PRIMARY_COLOR, border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:11 }}>Ouvrir →</button>
                      </div>
                      <div onClick={()=>setActiveTab("messages")} style={{ padding:"14px", borderRadius:8, textAlign:"center", cursor:"pointer", background:PRIMARY_LIGHT, border:`1px solid ${PRIMARY_COLOR+"40"}` }}>
                        <div style={{ fontSize:24, marginBottom:4 }}>💬</div>
                        <div style={{ fontSize:12, color:PRIMARY_COLOR, fontWeight:600 }}>Échangez avec votre coach, commercial et l'équipe BET</div>
                        <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>Messages en temps réel · Firebase</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* MON PROFIL */}
            {activeTab === "monprofil" && (() => {
              const surnomCourant = surnomSaisi === null ? (profil.surnom || "") : surnomSaisi;
              const enregistrerSurnom = async () => {
                setSurnomSaving(true);
                try {
                  const r = await fetch(`${API_URL}/api/apprenants/mon-surnom`, {
                    method: "PATCH",
                    headers: { Authorization:`Bearer ${localStorage.getItem("user_token")}`, "Content-Type":"application/json" },
                    body: JSON.stringify({ surnom: surnomCourant.trim() }),
                  });
                  const d = await r.json().catch(()=>({}));
                  if (!r.ok) { setProfilSavMsg("⚠️ " + (d.error || "Enregistrement impossible")); return; }
                  setProfilSavMsg(surnomCourant.trim() ? "✅ Surnom enregistré" : "✅ Surnom retiré");
                  // Le profil vient de l'API : on le rafraîchit pour que l'en-tête suive
                  // sans imposer une reconnexion.
                  setEspaceInfo(prev => prev ? { ...prev, profil: { ...(prev.profil||{}), surnom: d.surnom } } : prev);
                } catch {
                  setProfilSavMsg("⚠️ Serveur injoignable");
                } finally {
                  setSurnomSaving(false);
                  setTimeout(()=>setProfilSavMsg(""), 4000);
                }
              };
              return (
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                  <div><h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>Mon profil</h2><p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Informations personnelles et suivi</p></div>
                  {profilSavMsg && <span style={{ fontSize:12, color: profilSavMsg.startsWith("✅") ? "#16a34a" : "#d97706", fontWeight:600 }}>{profilSavMsg}</span>}
                </div>

                {/* Surnom - le nom d'usage. Le nom complet reste affiché, et reste la
                    référence pour l'administration. */}
                <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:20, marginBottom:20 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginBottom:3 }}>Mon surnom</div>
                  <div style={{ fontSize:12, color:"#9ca3af", marginBottom:12, lineHeight:1.6 }}>
                    Le nom sous lequel vous souhaitez apparaître dans votre espace.
                    Votre nom complet - <strong>{`${profil.prenom || ""} ${profil.nom || ""}`.trim() || "-"}</strong> - reste inchangé.
                  </div>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                    <input
                      value={surnomCourant}
                      onChange={e=>setSurnomSaisi(e.target.value)}
                      onKeyDown={e=>{ if(e.key==="Enter" && !surnomSaving) enregistrerSurnom(); }}
                      placeholder={profil.prenom || "Ex : Koro"}
                      maxLength={40}
                      style={{ flex:"1 1 220px", padding:"9px 12px", borderRadius:8, border:"1.5px solid #e5e7eb", fontSize:14, outline:"none" }}
                    />
                    <button onClick={enregistrerSurnom} disabled={surnomSaving}
                      style={{ padding:"9px 20px", borderRadius:8, border:"none", background: surnomSaving ? "#e5e7eb" : PRIMARY_COLOR, color: surnomSaving ? "#9ca3af" : "#fff", fontWeight:700, fontSize:13, cursor: surnomSaving ? "not-allowed" : "pointer" }}>
                      {surnomSaving ? "…" : "Enregistrer"}
                    </button>
                  </div>
                </div>

                {/* Photo de profil */}
                <div style={{ background:"#f8fafc", borderRadius:12, padding:20, marginBottom:20, display:"flex", alignItems:"center", gap:24, flexWrap:"wrap" }}>
                  <div style={{ width:90, height:90, borderRadius:"50%", background:`${PRIMARY_COLOR}20`, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:30, color:PRIMARY_COLOR, border:`3px solid ${PRIMARY_COLOR}40`, overflow:"hidden", flexShrink:0 }}>
                    {(avatarUrl || profil.avatar_url)
                      ? <img src={avatarUrl || profil.avatar_url} alt="avatar" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                      : profil.avatar}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:16, color:"#0f172a", marginBottom:4 }}>{profil.prenom} {profil.nom}</div>
                    <div style={{ fontSize:12, color:"#6b7280", marginBottom:10 }}>{profil.email}</div>
                    <CloudinaryUpload
                      type="avatar"
                      token={localStorage.getItem("user_token")}
                      currentUrl={avatarUrl || profil.avatar_url}
                      compact={true}
                      label="Changer ma photo"
                      onSuccess={handleAvatarSuccess}
                    />
                  </div>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
                  <div>
                    <div style={{ background:"#f8fafc", borderRadius:12, padding:20, marginBottom:20 }}>
                      <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:12, display:"flex", alignItems:"center", gap:6 }}><span>👤</span> Identité</h3>
                      <div style={{ fontSize:13, marginBottom:8 }}><strong>Nom :</strong> {profil.prenom} {profil.nom}</div>
                      <div style={{ fontSize:13, marginBottom:8 }}><strong>Email :</strong> {profil.email}</div>
                      <div style={{ fontSize:13, marginBottom:8 }}><strong>Téléphone :</strong> {profil.phone}</div>
                      <div style={{ fontSize:13, marginBottom:8 }}><strong>Date d'inscription :</strong> {profil.dateInscription ? formatDateFull(profil.dateInscription) : "-"}</div>
                      <div style={{ fontSize:13, marginBottom:4 }}><strong>Adresse :</strong></div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <input
                          value={adresseEdit}
                          onChange={e => setAdresseEdit(e.target.value)}
                          placeholder="Votre quartier, ville…"
                          style={{ flex:1, padding:"7px 10px", borderRadius:8, border:"1px solid #d1d5db", fontSize:13 }}
                        />
                        <button
                          onClick={handleAdresseSave}
                          disabled={adresseSaving}
                          style={{ padding:"7px 14px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:12, cursor:adresseSaving?"not-allowed":"pointer", opacity:adresseSaving?0.7:1 }}
                        >{adresseSaving ? "⏳" : "Enregistrer"}</button>
                      </div>
                    </div>
                    {profil.parent && (
                      <div style={{ background:"#fef9c3", borderRadius:12, padding:20, marginBottom:20, border:"1px solid #fde68a" }}>
                        <h3 style={{ fontSize:14, fontWeight:700, color:"#854d0e", marginBottom:12, display:"flex", alignItems:"center", gap:6 }}><span>👨‍👩‍👧</span> Parent / Tuteur</h3>
                        <div style={{ fontSize:13, marginBottom:8 }}><strong>Nom :</strong> {profil.parent.nom}</div>
                        {profil.parent.telephone && <div style={{ fontSize:13, marginBottom:8 }}><strong>Téléphone :</strong> {profil.parent.telephone}</div>}
                        {profil.parent.email && <div style={{ fontSize:13, marginBottom:8 }}><strong>Email :</strong> {profil.parent.email}</div>}
                      </div>
                    )}
                    <div style={{ background:"#f8fafc", borderRadius:12, padding:20, marginBottom:20 }}>
                      <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:12, display:"flex", alignItems:"center", gap:6 }}><span>📊</span> Parcours pédagogique</h3>
                      <div style={{ fontSize:13, marginBottom:8 }}><strong>Niveau d'anglais :</strong> {profil.niveau} - {NIVEAU_META[profil.niveau]?.label}</div>
                      <div style={{ fontSize:13, marginBottom:8 }}><strong>Résultat test de niveau :</strong> {profil.testNiveauResultat}</div>
                      <div style={{ fontSize:13, marginBottom:8 }}><strong>Coach assigné :</strong> {profil.coach.nom ? `${profil.coach.nom}${profil.coach.email ? ` (${profil.coach.email})` : ""}` : "⏳ En attente d'assignation"}</div>
                      <div style={{ fontSize:13, marginBottom:8 }}><strong>Type de cours :</strong> {TYPE_COURS_LABELS[profil.typeCours] || "-"}</div>
                      <div style={{ fontSize:13, marginBottom:8 }}><strong>Classe :</strong> {profil.classe}</div>
                    </div>
                  </div>
                  <div>
                    <div style={{ background:"#f8fafc", borderRadius:12, padding:20, marginBottom:20 }}>
                      <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:12, display:"flex", alignItems:"center", gap:6 }}><span>💰</span> Historique des paiements</h3>
                      {profil.paiements.length === 0
                        ? <p style={{ fontSize:12, color:"#9ca3af", fontStyle:"italic" }}>Aucun paiement enregistré.</p>
                        : profil.paiements.map(p => (
                          <div key={p.id} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid #e5e7eb" }}>
                            <div>
                              <span style={{ fontSize:12, color:"#6b7280" }}>{formatDateFull(p.date)}</span><br/>
                              <span style={{ fontSize:13 }}>{p.description}</span>
                              {(p.ref || p.operateur) && (
                                <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>
                                  {p.operateur && <span>📱 {p.operateur}</span>}
                                  {p.ref && <span style={{ marginLeft: p.operateur ? 8 : 0, fontFamily:"monospace" }}>🔑 {p.ref}</span>}
                                </div>
                              )}
                            </div>
                            {/* Pas de badge Payé/En attente par ligne : ce statut décrit l'état
                                cumulé du dossier après CE versement, pas ce versement isolément -
                                l'afficher par ligne donnait l'impression contradictoire de deux
                                statuts différents pour le même dossier (cf. onglet Paiement). */}
                            <div style={{ textAlign:"right" }}><span style={{ fontWeight:700, color:PRIMARY_DARK }}>{(p.montant || 0).toLocaleString()} FCFA</span></div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              </div>
              );
            })()}

            {/* ONBOARDING */}
            {activeTab === "onboarding" && (
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                  <div><h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>👋 Guide de bienvenue BET</h2><p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Retrouvez ici les vidéos et documents des étapes de démarrage, à tout moment.</p></div>
                </div>

                {ETAPES_ONBOARDING_DASH.map((e) => {
                  const ouverte = etapeOnbOuverte === e.id;
                  const contenus = contenusOnb.filter(c => c.cat === e.id);
                  return (
                    <div key={e.id} style={{ borderRadius:12, marginBottom:12, border:`2px solid ${ouverte?PRIMARY_COLOR:"#e5e7eb"}`, background:"#fff", overflow:"hidden" }}>
                      <div onClick={()=>{ const nvl = ouverte ? null : e.id; setEtapeOnbOuverte(nvl); if (nvl) contenus.forEach(c=>enregistrerVueContenuOnb("onboarding", c.id)); }} style={{ display:"flex", gap:14, padding:16, cursor:"pointer" }}>
                        <div style={{ width:44, height:44, borderRadius:12, background:PRIMARY_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{e.icone}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, color:"#0f172a", fontSize:14, marginBottom:4 }}>{e.titre}</div>
                          <div style={{ fontSize:12, color:"#6b7280", lineHeight:1.5 }}>{e.desc}</div>
                        </div>
                        <span style={{ fontSize:13, color:"#9ca3af", flexShrink:0, alignSelf:"center", transform:ouverte?"rotate(90deg)":"rotate(0deg)", transition:"transform 0.2s" }}>▶</span>
                      </div>
                      {ouverte && (
                        <div style={{ padding:"0 16px 16px", borderTop:"1px solid #f1f5f9" }}>
                          {contenusOnbLoading ? (
                            <div style={{ padding:"16px 0", textAlign:"center", color:"#9ca3af", fontSize:12 }}>Chargement du contenu…</div>
                          ) : contenus.length === 0 ? (
                            <div style={{ padding:"16px 0", textAlign:"center", color:"#9ca3af", fontSize:12 }}>Aucun contenu associé à cette étape pour le moment.</div>
                          ) : (
                            <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:12 }}>
                              {contenus.map(c => (
                                <div key={c.id} style={{ background:"#f8fafc", borderRadius:10, padding:"12px 14px", border:"1px solid #e5e7eb" }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:(c.fichier_url||c.detail)?10:0 }}>
                                    <span style={{ fontSize:16 }}>{c.type==="video"?"🎬":c.type==="audio"?"🎧":c.type==="image"?"🖼️":"📄"}</span>
                                    <span style={{ fontSize:13, fontWeight:600, color:"#0f172a" }}>{c.titre}</span>
                                  </div>
                                  {/* Le texte du contenu tenait sur la ligne du titre, en 11px gris : un
                                      règlement intérieur de huit points y était illisible. Il a son propre bloc. */}
                                  {c.detail && (
                                    <div style={{ fontSize:12.5, color:"#475569", lineHeight:1.6, whiteSpace:"pre-wrap", marginBottom:c.fichier_url?10:0 }}>
                                      {c.detail}
                                    </div>
                                  )}
                                  <MediaContenuOnb contenu={c} onVue={()=>enregistrerVueContenuOnb("onboarding", c.id)} />
                                  {!c.fichier_url && !c.detail && <div style={{ fontSize:11, color:"#9ca3af", fontStyle:"italic" }}>Fichier non disponible pour le moment.</div>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* ── Autres vidéos (filtrées par tranche d'âge) ── */}
                <div style={{ marginTop:32, marginBottom:16 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:"#0f172a", marginBottom:4 }}>🎬 Autres vidéos</div>
                  <div style={{ fontSize:12, color:"#6b7280" }}>Contenus complémentaires, consultables à tout moment.</div>
                </div>
                {(() => {
                  const videosLibFiltrees = contenusVideosLib.filter(v => !v.cible || v.cible === "tous" || v.cible === tranche);
                  if (contenusOnbLoading) return <div style={{ padding:"16px 0", textAlign:"center", color:"#9ca3af", fontSize:12 }}>Chargement…</div>;
                  if (videosLibFiltrees.length === 0) return (
                    <div style={{ textAlign:"center", padding:24, color:"#9ca3af", background:"#f8fafc", borderRadius:12, border:"1px dashed #e5e7eb", fontSize:12 }}>
                      Aucune vidéo disponible pour le moment.
                    </div>
                  );
                  return (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
                    {videosLibFiltrees.map(v => (
                      <div key={v.id} style={{ background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", padding:"14px 16px" }}>
                        <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:10 }}>
                          <span style={{ fontSize:22 }}>{v.icone || (v.type==="video"?"🎬":"🎧")}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{v.titre}</div>
                            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:4 }}>
                              {v.duree && <span style={{ fontSize:11, color:"#9ca3af" }}>⏱ {v.duree}</span>}
                              {v.niveau && <span style={{ padding:"1px 7px", borderRadius:10, background:"#f1f5f9", color:"#374151", fontSize:10, fontWeight:700 }}>{v.niveau}</span>}
                            </div>
                          </div>
                        </div>
                        {v.fichier_url && v.type === "video" && (
                          urlEmbedVideo(v.fichier_url)
                            ? <iframe src={urlEmbedVideo(v.fichier_url)} title={v.titre} onLoad={()=>enregistrerVueContenuOnb("videos", v.id)} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ width:"100%", aspectRatio:"16/9", borderRadius:8, border:"none" }} />
                            : <video src={v.fichier_url} controls onPlay={()=>enregistrerVueContenuOnb("videos", v.id)} style={{ width:"100%", maxHeight:220, borderRadius:8, background:"#000" }} />
                        )}
                        {v.fichier_url && v.type === "audio" && <audio src={v.fichier_url} controls onPlay={()=>enregistrerVueContenuOnb("videos", v.id)} style={{ width:"100%" }} />}
                        {!v.fichier_url && <div style={{ fontSize:11, color:"#9ca3af", fontStyle:"italic" }}>Fichier non disponible pour le moment.</div>}
                      </div>
                    ))}
                  </div>
                  );
                })()}
              </div>
            )}

            {/* MINI-JEUX */}
            {activeTab === "minijeux" && (() => {
              const btnG = (bg) => ({ background:bg, color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:600, cursor:'pointer' });
              const btnGhost = { background:'transparent', color:PRIMARY_COLOR, border:`1.5px solid ${PRIMARY_COLOR}`, borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:600, cursor:'pointer' };
              const retourBtn = { marginBottom:16, background:'none', border:'none', color:PRIMARY_COLOR, fontWeight:700, cursor:'pointer' };
              // Chaque instance active (plusieurs peuvent partager le même moteur/type)
              // est fusionnée avec les visuels du catalogue (icône/couleur/desc par type),
              // le nom affiché venant de l'instance (personnalisé par l'admin).
              const jeusFiltres = (jeuxInstances||[])
                .filter(inst => inst.cible==='tous' || !inst.cible || inst.cible===tranche)
                .map(inst => { const cat = CATALOGUE_JEUX.find(c=>c.id===inst.type) || {}; return { ...cat, ...inst, titre: inst.nom || cat.titre }; });
              return (
              <div>
                {jeuxInstances === null ? (
                  <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:200, fontSize:14, color:'#64748B' }}>⏳ Chargement…</div>
                ) : (
                <>
                {/* Header profil (réutilise le système AGE_UI déjà en place) */}
                <div style={{ background:ui.badgeBg, borderRadius:14, padding:'16px 20px', marginBottom:20, color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
                  <div>
                    <div style={{ fontSize:16, fontWeight:800, marginBottom:2 }}>{ui.label}</div>
                    <div style={{ fontSize:12, opacity:0.85 }}>Des jeux pour réviser ton anglais en t'amusant !</div>
                  </div>
                  <div style={{ fontSize:12, opacity:0.8, textAlign:'right' }}>
                    <div style={{ fontWeight:700 }}>{jeusFiltres.length} jeu{jeusFiltres.length>1?'x':''} disponible{jeusFiltres.length>1?'s':''}</div>
                  </div>
                </div>

                {mesJeuxKpis && mesJeuxKpis.partiesJouees > 0 && (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12, marginBottom:20 }}>
                    {[
                      { l:'Parties jouées', v:mesJeuxKpis.partiesJouees, c:'#F97316', i:'🎮' },
                      { l:'Jeux essayés',   v:mesJeuxKpis.jeuxJoues,     c:'#0891B2', i:'🕹️' },
                      { l:'Meilleur score', v:mesJeuxKpis.meilleurScore!=null?`${mesJeuxKpis.meilleurScore}%`:'-', c:'#16A34A', i:'🏆' },
                      { l:'Score moyen',    v:mesJeuxKpis.scoreMoyen!=null?`${mesJeuxKpis.scoreMoyen}%`:'-', c:'#7C3AED', i:'📊' },
                    ].map(k => (
                      <div key={k.l} style={{ background:'#fff', borderRadius:12, padding:'12px 14px', border:'1px solid #E2E8F0', borderTop:`3px solid ${k.c}` }}>
                        <div style={{ fontSize:18, marginBottom:4 }}>{k.i}</div>
                        <div style={{ fontSize:18, fontWeight:800, color:k.c }}>{k.v}</div>
                        <div style={{ fontSize:10, color:'#475569', marginTop:2 }}>{k.l}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:10, padding:'10px 16px', fontSize:12, color:'#92400E', marginBottom:20, display:'flex', gap:10, alignItems:'center' }}>
                  <span style={{ fontSize:18 }}>📋</span>
                  <span>Le nombre de tentatives autorisées dépend du jeu (affiché sur chaque carte). Une fois atteint, le jeu est 🔒 verrouillé.</span>
                </div>

                {jeusFiltres.length === 0 ? (
                  <div style={{ textAlign:'center', padding:40, color:'#9ca3af', background:'#f8fafc', borderRadius:16 }}>
                    <div style={{ fontSize:40, marginBottom:10 }}>🎮</div>
                    Aucun mini-jeu disponible pour le moment.
                  </div>
                ) : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14, marginBottom:24 }}>
                  {jeusFiltres.map(g => {
                    const tents = tentativesJeu[g.id] || 0;
                    const maxJeu = g.max_tentatives || 2;
                    const verrouille = tents >= maxJeu;
                    return (
                      <div key={g.id} onClick={()=>{ if(verrouille) return; resetAllJeux(g.id); }}
                        style={{ background:verrouille?'#F8FAFC':g.bg, borderRadius:16, padding:'20px 18px', border:`2px solid ${verrouille?'#E2E8F0':g.couleur+'40'}`, cursor:verrouille?'not-allowed':'pointer', opacity:verrouille?0.6:1, position:'relative' }}>
                        {verrouille && <div style={{ position:'absolute', top:10, right:10, fontSize:18 }}>🔒</div>}
                        {tents>0 && !verrouille && <div style={{ position:'absolute', top:10, right:10, padding:'2px 7px', borderRadius:10, background:'#FEF3C7', color:'#92400E', fontSize:10, fontWeight:700 }}>Réessai</div>}
                        <div style={{ fontSize:36, marginBottom:10 }}>{g.icone}</div>
                        <div style={{ fontSize:15, fontWeight:800, color:verrouille?'#94A3B8':'#0F172A', marginBottom:5 }}>{g.titre}</div>
                        <div style={{ fontSize:11, color:'#475569', marginBottom:12, lineHeight:1.5 }}>{g.desc}</div>
                        {mesJeuxParJeu[g.id]?.meilleurPourcentage != null && (
                          <div style={{ fontSize:11, fontWeight:700, color:mesJeuxParJeu[g.id].meilleurPourcentage>=70?'#16A34A':mesJeuxParJeu[g.id].meilleurPourcentage>=40?'#D97706':'#DC2626', marginBottom:10 }}>
                            🏆 Meilleur score : {mesJeuxParJeu[g.id].meilleurPourcentage}%
                          </div>
                        )}
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div style={{ padding:'5px 14px', borderRadius:20, background:verrouille?'#E2E8F0':g.couleur, color:verrouille?'#94A3B8':'#fff', fontSize:12, fontWeight:700 }}>
                            {verrouille?'Verrouillé':tents===0?'Jouer →':'🔄 Rejouer'}
                          </div>
                          <span style={{ fontSize:10, color:'#94A3B8' }}>{tents}/{maxJeu}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
                </>
                )}

                {/* ── Jeu en cours ── */}
                {jeu && (
                  <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.75)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
                    <div style={{ background:'#F8FAFC', borderRadius:20, width:'100%', maxWidth:640, maxHeight:'90vh', overflowY:'auto', padding:24, position:'relative', boxShadow:'0 32px 80px rgba(0,0,0,0.4)' }}>
                      <button onClick={()=>setJeu(null)} title="Fermer" style={{ position:'absolute', top:14, right:14, width:34, height:34, borderRadius:10, border:'none', background:'#fff', color:'#475569', fontSize:16, fontWeight:800, cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.1)', zIndex:1 }}>✕</button>

                      {jeuActifType === 'qcm' ? (
                        <div style={{ maxWidth:600, margin:'0 auto' }}>
                          <button onClick={()=>setJeu(null)} style={retourBtn}>← Retour aux jeux</button>
                          {qcmFini ? (
                            <div style={{ textAlign:'center', padding:'40px 20px', background:'#fff', borderRadius:20, border:'1px solid #E2E8F0' }}>
                              <div style={{ fontSize:64, marginBottom:12 }}>{qcmScore>=8?'🎉':qcmScore>=5?'👍':'💪'}</div>
                              <div style={{ fontSize:24, fontWeight:900, color:'#0F172A', marginBottom:8 }}>{qcmScore}/{QCM_MOTS.length} bonnes réponses</div>
                              <div style={{ fontSize:14, color:'#475569', marginBottom:16 }}>{qcmScore>=8?'Excellent ! Tu maîtrises ce vocabulaire !':qcmScore>=5?"Bien ! Continue à t'entraîner.":'Continue à réviser, tu vas y arriver !'}</div>
                              {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2))
                                ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {(tentativesJeu[jeu]||0)===0?'Tu peux rejouer une fois pour améliorer ton score.':'Dernière tentative - donne le meilleur de toi !'}</div>
                                : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{qcmScore}/{QCM_MOTS.length}</strong></div>}
                              <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                                {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2)) && <button onClick={()=>{ setTentativesJeu(p=>({...p,[jeu]:(p[jeu]||0)+1})); setQcmIdx(0); setQcmScore(0); setQcmChoix(null); setQcmFini(false); setQcmTemps(15); }} style={btnG('#F97316')}>🔄 Rejouer</button>}
                                <button onClick={()=>setJeu(null)} style={btnGhost}>Changer de jeu</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:12, color:'#94A3B8' }}>
                                <span>Question {qcmIdx+1}/{QCM_MOTS.length}</span>
                                <span style={{ fontWeight:700, color:qcmTemps<=5?'#EF4444':'#F97316' }}>⏱ {qcmTemps}s</span>
                              </div>
                              <div style={{ height:6, background:'#F1F5F9', borderRadius:3, marginBottom:24, overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${(qcmIdx/QCM_MOTS.length)*100}%`, background:'#F97316', borderRadius:3 }} />
                              </div>
                              <div style={{ textAlign:'center', fontSize:36, fontWeight:900, color:'#0F172A', marginBottom:24 }}>{QCM_MOTS[qcmIdx].mot}</div>
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                                {QCM_MOTS[qcmIdx].options.map(opt => {
                                  const selec = qcmChoix === opt;
                                  const estCorr = opt === QCM_MOTS[qcmIdx].correct;
                                  let bg='#f8fafc', bord='#E2E8F0', txt='#0F172A';
                                  if (qcmChoix !== null) { if (estCorr) { bg='#D1FAE5'; bord='#6EE7B7'; txt='#065F46'; } else if (selec) { bg='#FEE2E2'; bord='#FECACA'; txt='#991B1B'; } }
                                  return (
                                    <button key={opt} disabled={qcmChoix!==null} onClick={()=>{ const correct=opt===QCM_MOTS[qcmIdx].correct; setQcmChoix(opt); if(correct) setQcmScore(s=>s+1); setTimeout(()=>{ if(qcmIdx<QCM_MOTS.length-1){ setQcmIdx(i=>i+1); setQcmChoix(null); setQcmTemps(15); } else setQcmFini(true); },800); }}
                                      style={{ padding:'14px 12px', borderRadius:12, border:`2px solid ${bord}`, background:bg, color:txt, fontSize:14, fontWeight:600, cursor:qcmChoix?'default':'pointer' }}>{opt}</button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : jeuActifType === 'association' ? (
                        <div style={{ maxWidth:700, margin:'0 auto' }}>
                          <button onClick={()=>setJeu(null)} style={retourBtn}>← Retour aux jeux</button>
                          {assocOk.length === ASSOC_PAIRES_DATA.length ? (
                            <div style={{ textAlign:'center', padding:40, background:'#fff', borderRadius:20, border:'1px solid #E2E8F0' }}>
                              <div style={{ fontSize:64, marginBottom:12 }}>🎉</div>
                              <div style={{ fontSize:22, fontWeight:900, color:'#0F172A', marginBottom:8 }}>Parfait ! Toutes les paires trouvées !</div>
                              <div style={{ display:'flex', gap:12, justifyContent:'center', marginTop:20 }}>
                                <button onClick={()=>{ setAssocSel(null); setAssocOk([]); }} style={btnG('#8B5CF6')}>🔄 Rejouer</button>
                                <button onClick={()=>setJeu(null)} style={btnGhost}>Changer de jeu</button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div style={{ fontSize:13, color:'#475569', marginBottom:16, textAlign:'center' }}>Clique sur un mot français, puis sur sa traduction anglaise.</div>
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                                <div>
                                  <div style={{ fontSize:12, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10, textAlign:'center' }}>🇫🇷 Français</div>
                                  {ASSOC_PAIRES_DATA.map((p,i) => {
                                    const ok = assocOk.includes(i);
                                    const selec = assocSel === `fr-${i}`;
                                    return <button key={i} disabled={ok} onClick={()=>{ if(assocSel?.startsWith('en-')){ const enIdx=parseInt(assocSel.split('-')[1]); if(enIdx===i){ setAssocOk(a=>[...a,i]); setAssocSel(null); } else setAssocSel(`fr-${i}`); } else setAssocSel(`fr-${i}`); }}
                                      style={{ display:'block', width:'100%', marginBottom:8, padding:14, borderRadius:10, border:`2px solid ${ok?'#6EE7B7':selec?'#8B5CF6':'#E2E8F0'}`, background:ok?'#F0FDF4':selec?'#F5F3FF':'#fff', color:ok?'#065F46':selec?'#6D28D9':'#0F172A', fontWeight:700, fontSize:14, cursor:ok?'default':'pointer' }}>{ok?'✅ ':''}{p.fr}</button>;
                                  })}
                                </div>
                                <div>
                                  <div style={{ fontSize:12, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10, textAlign:'center' }}>🇬🇧 Anglais</div>
                                  {[...ASSOC_PAIRES_DATA].sort(()=>Math.random()-0.5).map((p,i) => {
                                    const realIdx = ASSOC_PAIRES_DATA.findIndex(x=>x.en===p.en);
                                    const ok = assocOk.includes(realIdx);
                                    const selec = assocSel === `en-${realIdx}`;
                                    return <button key={i} disabled={ok} onClick={()=>{ if(assocSel?.startsWith('fr-')){ const frIdx=parseInt(assocSel.split('-')[1]); if(frIdx===realIdx){ setAssocOk(a=>[...a,realIdx]); setAssocSel(null); } else setAssocSel(`en-${realIdx}`); } else setAssocSel(`en-${realIdx}`); }}
                                      style={{ display:'block', width:'100%', marginBottom:8, padding:14, borderRadius:10, border:`2px solid ${ok?'#6EE7B7':selec?'#8B5CF6':'#E2E8F0'}`, background:ok?'#F0FDF4':selec?'#F5F3FF':'#fff', color:ok?'#065F46':selec?'#6D28D9':'#0F172A', fontWeight:700, fontSize:14, cursor:ok?'default':'pointer' }}>{ok?'✅ ':''}{p.en}</button>;
                                  })}
                                </div>
                              </div>
                              <div style={{ textAlign:'center', marginTop:12, fontSize:12, color:'#94A3B8' }}>{assocOk.length}/{ASSOC_PAIRES_DATA.length} paires trouvées</div>
                            </div>
                          )}
                        </div>
                      ) : jeuActifType === 'lacunes' ? (
                        <div style={{ maxWidth:580, margin:'0 auto' }}>
                          <button onClick={()=>setJeu(null)} style={retourBtn}>← Retour aux jeux</button>
                          {lacuneFini ? (
                            <div style={{ textAlign:'center', padding:40, background:'#fff', borderRadius:20, border:'1px solid #E2E8F0' }}>
                              <div style={{ fontSize:64, marginBottom:12 }}>{lacuneScore>=4?'🌟':lacuneScore>=2?'👍':'💪'}</div>
                              <div style={{ fontSize:22, fontWeight:900, color:'#0F172A', marginBottom:8 }}>{lacuneScore}/{LACUNES_DATA.length} bonnes réponses</div>
                              {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2))
                                ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {(tentativesJeu[jeu]||0)===0?'Tu peux rejouer une fois pour améliorer ton score.':'Dernière tentative - donne le meilleur de toi !'}</div>
                                : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{lacuneScore}/{LACUNES_DATA.length}</strong></div>}
                              <div style={{ display:'flex', gap:12, justifyContent:'center', marginTop:16 }}>
                                {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2)) && <button onClick={()=>{ setTentativesJeu(p=>({...p,[jeu]:(p[jeu]||0)+1})); setLacuneIdx(0); setLacuneInput(''); setLacuneScore(0); setLacuneFini(false); setLacuneMontre(false); }} style={btnG('#10B981')}>🔄 Rejouer</button>}
                                <button onClick={()=>setJeu(null)} style={btnGhost}>Changer de jeu</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:20, fontSize:12, color:'#94A3B8' }}>
                                <span>Phrase {lacuneIdx+1}/{LACUNES_DATA.length}</span>
                                <span style={{ fontWeight:700, color:'#16A34A' }}>{lacuneScore} bonne{lacuneScore>1?'s':''}</span>
                              </div>
                              <div style={{ height:6, background:'#F1F5F9', borderRadius:3, marginBottom:24, overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${(lacuneIdx/LACUNES_DATA.length)*100}%`, background:'#10B981', borderRadius:3 }} />
                              </div>
                              <div style={{ fontSize:22, fontWeight:700, color:'#0F172A', textAlign:'center', marginBottom:8 }}>{LACUNES_DATA[lacuneIdx].phrase.replace('___','______')}</div>
                              <div style={{ textAlign:'center', fontSize:12, color:'#94A3B8', marginBottom:24 }}>💡 Indice : {LACUNES_DATA[lacuneIdx].indice}</div>
                              <input value={lacuneInput} onChange={e=>setLacuneInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&lacuneInput.trim()&&(()=>{ const ok=lacuneInput.trim().toLowerCase()===LACUNES_DATA[lacuneIdx].mot.toLowerCase(); if(ok)setLacuneScore(s=>s+1); if(lacuneIdx<LACUNES_DATA.length-1){setLacuneIdx(i=>i+1);setLacuneInput('');setLacuneMontre(false);}else setLacuneFini(true); })()} placeholder="Tape le mot manquant..." style={{ width:'100%', padding:'14px 16px', borderRadius:10, border:`2px solid ${PRIMARY_COLOR}`, fontSize:16, fontWeight:700, textAlign:'center', outline:'none', boxSizing:'border-box', marginBottom:14 }} />
                              {lacuneMontre && <div style={{ textAlign:'center', fontSize:14, color:'#10B981', fontWeight:700, marginBottom:14 }}>✅ Réponse : <strong>{LACUNES_DATA[lacuneIdx].mot}</strong></div>}
                              <div style={{ display:'flex', gap:10 }}>
                                <button onClick={()=>setLacuneMontre(true)} style={{ flex:1, padding:10, borderRadius:8, border:'1.5px solid #E2E8F0', background:'#fff', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer' }}>💡 Voir la réponse</button>
                                <button disabled={!lacuneInput.trim()} onClick={()=>{ const ok=lacuneInput.trim().toLowerCase()===LACUNES_DATA[lacuneIdx].mot.toLowerCase(); if(ok)setLacuneScore(s=>s+1); if(lacuneIdx<LACUNES_DATA.length-1){setLacuneIdx(i=>i+1);setLacuneInput('');setLacuneMontre(false);}else setLacuneFini(true); }} style={{ flex:1, ...btnG('#10B981'), opacity:lacuneInput.trim()?1:0.5, cursor:lacuneInput.trim()?'pointer':'not-allowed' }}>Valider ✓</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : jeuActifType === 'anagramme' ? (
                        <div style={{ maxWidth:520, margin:'0 auto' }}>
                          <button onClick={()=>setJeu(null)} style={retourBtn}>← Retour aux jeux</button>
                          {anaFini ? (
                            <div style={{ textAlign:'center', padding:40, background:'#fff', borderRadius:20, border:'1px solid #E2E8F0' }}>
                              <div style={{ fontSize:56, marginBottom:12 }}>{anaScore>=6?'🎉':anaScore>=4?'👍':'💪'}</div>
                              <div style={{ fontSize:22, fontWeight:900, color:'#0F172A', marginBottom:8 }}>{anaScore}/{ANAGRAMME_DATA.length} mots trouvés</div>
                              {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2))
                                ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {(tentativesJeu[jeu]||0)===0?'Tu peux rejouer une fois !':'Dernière tentative !'}</div>
                                : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{anaScore}/{ANAGRAMME_DATA.length}</strong></div>}
                              <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                                {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2)) && <button onClick={()=>{ setTentativesJeu(p=>({...p,[jeu]:(p[jeu]||0)+1})); setAnaIdx(0); setAnaInput(''); setAnaScore(0); setAnaFini(false); setAnaMontre(false); }} style={btnG('#F97316')}>🔄 Rejouer</button>}
                                <button onClick={()=>setJeu(null)} style={btnGhost}>Changer de jeu</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16, fontSize:12, color:'#94A3B8' }}>
                                <span>Mot {anaIdx+1}/{ANAGRAMME_DATA.length}</span>
                                <span style={{ fontWeight:700, color:'#F97316' }}>{anaScore} ✓</span>
                              </div>
                              <div style={{ height:5, background:'#F1F5F9', borderRadius:3, marginBottom:24, overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${(anaIdx/ANAGRAMME_DATA.length)*100}%`, background:'#F97316', borderRadius:3 }} />
                              </div>
                              <div style={{ textAlign:'center', marginBottom:8, fontSize:12, color:'#475569' }}>{ANAGRAMME_DATA[anaIdx].indice}</div>
                              <div style={{ textAlign:'center', fontSize:42, fontWeight:900, color:'#F97316', letterSpacing:8, marginBottom:24, fontFamily:'monospace' }}>{ANAGRAMME_DATA[anaIdx].melange}</div>
                              <input value={anaInput} onChange={e=>setAnaInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&anaInput.trim()&&(()=>{ const ok=anaInput.trim()===ANAGRAMME_DATA[anaIdx].mot; if(ok)setAnaScore(s=>s+1); setAnaMontre(true); setTimeout(()=>{ if(anaIdx<ANAGRAMME_DATA.length-1){setAnaIdx(i=>i+1);setAnaInput('');setAnaMontre(false);}else setAnaFini(true); },1000); })()} placeholder="Tape le mot en majuscules..." style={{ width:'100%', padding:14, borderRadius:10, border:'2px solid #F97316', fontSize:18, fontWeight:800, textAlign:'center', fontFamily:'monospace', outline:'none', boxSizing:'border-box', marginBottom:10, textTransform:'uppercase' }} />
                              {anaMontre && <div style={{ textAlign:'center', fontSize:15, fontWeight:700, color:anaInput===ANAGRAMME_DATA[anaIdx].mot?'#16A34A':'#EF4444', marginBottom:10 }}>{anaInput===ANAGRAMME_DATA[anaIdx].mot?'✅ Bravo !':'❌ Réponse : '+ANAGRAMME_DATA[anaIdx].mot}</div>}
                              <div style={{ display:'flex', gap:10 }}>
                                <button onClick={()=>{ setAnaMontre(true); setTimeout(()=>{ if(anaIdx<ANAGRAMME_DATA.length-1){setAnaIdx(i=>i+1);setAnaInput('');setAnaMontre(false);}else setAnaFini(true); },1200); }} style={{ flex:1, padding:10, borderRadius:8, border:'1.5px solid #E2E8F0', background:'#fff', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer' }}>💡 Voir la réponse</button>
                                <button disabled={!anaInput.trim()||anaMontre} onClick={()=>{ const ok=anaInput.trim()===ANAGRAMME_DATA[anaIdx].mot; if(ok)setAnaScore(s=>s+1); setAnaMontre(true); setTimeout(()=>{ if(anaIdx<ANAGRAMME_DATA.length-1){setAnaIdx(i=>i+1);setAnaInput('');setAnaMontre(false);}else setAnaFini(true); },1000); }} style={{ flex:1, ...btnG('#F97316'), opacity:(!anaInput.trim()||anaMontre)?0.5:1, cursor:(!anaInput.trim()||anaMontre)?'not-allowed':'pointer' }}>Valider ✓</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : jeuActifType === 'sprint' ? (
                        <div style={{ maxWidth:560, margin:'0 auto' }}>
                          <button onClick={()=>setJeu(null)} style={retourBtn}>← Retour aux jeux</button>
                          {sprintFini ? (
                            <div style={{ textAlign:'center', padding:40, background:'#fff', borderRadius:20, border:'1px solid #E2E8F0' }}>
                              <div style={{ fontSize:56, marginBottom:12 }}>{sprintScore>=20?'🏆':sprintScore>=10?'🎉':sprintScore>=5?'👍':'💪'}</div>
                              <div style={{ fontSize:24, fontWeight:900, color:'#0F172A', marginBottom:4 }}>{sprintScore} mots traduits</div>
                              <div style={{ fontSize:13, color:'#475569', marginBottom:20 }}>en 60 secondes</div>
                              {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2))
                                ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {(tentativesJeu[jeu]||0)===0?'Peux-tu faire mieux ? Un seul réessai !':'Dernière tentative !'}</div>
                                : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{sprintScore} mots</strong></div>}
                              <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                                {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2)) && <button onClick={()=>{ setTentativesJeu(p=>({...p,[jeu]:(p[jeu]||0)+1})); setSprintScore(0); setSprintTemps(60); setSprintFini(false); setSprintIdx(0); setSprintMots([...SPRINT_MOTS].sort(()=>Math.random()-0.5)); }} style={btnG('#EF4444')}>🔄 Rejouer</button>}
                                <button onClick={()=>setJeu(null)} style={btnGhost}>Changer de jeu</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12, alignItems:'center' }}>
                                <span style={{ fontWeight:700, color:'#EF4444', fontSize:24 }}>⏱ {sprintTemps}s</span>
                                <span style={{ fontWeight:700, color:'#0F172A', fontSize:18 }}>✓ {sprintScore}</span>
                              </div>
                              <div style={{ height:8, background:'#F1F5F9', borderRadius:4, marginBottom:24, overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${(sprintTemps/60)*100}%`, background:'#EF4444', borderRadius:4 }} />
                              </div>
                              {sprintMots[sprintIdx] && (
                                <>
                                  <div style={{ textAlign:'center', fontSize:13, color:'#94A3B8', marginBottom:6 }}>Traduis en français :</div>
                                  <div style={{ textAlign:'center', fontSize:36, fontWeight:900, color:'#0F172A', marginBottom:24 }}>{sprintMots[sprintIdx]?.en}</div>
                                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                                    {(() => {
                                      const correct = sprintMots[sprintIdx]?.fr;
                                      const wrong = SPRINT_MOTS.filter(m=>m.fr!==correct).sort(()=>Math.random()-0.5).slice(0,3).map(m=>m.fr);
                                      return [...wrong, correct].sort(()=>Math.random()-0.5).map(opt=>(
                                        <button key={opt} onClick={()=>{ if(opt===correct) setSprintScore(s=>s+1); setSprintIdx(i=>i+1); }} style={{ padding:14, borderRadius:12, border:'2px solid #E2E8F0', background:'#f8fafc', color:'#0F172A', fontSize:14, fontWeight:600, cursor:'pointer' }}>{opt}</button>
                                      ));
                                    })()}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ) : jeuActifType === 'vrai_faux' ? (
                        <div style={{ maxWidth:560, margin:'0 auto' }}>
                          <button onClick={()=>setJeu(null)} style={retourBtn}>← Retour aux jeux</button>
                          {vfFini ? (
                            <div style={{ textAlign:'center', padding:40, background:'#fff', borderRadius:20, border:'1px solid #E2E8F0' }}>
                              <div style={{ fontSize:56, marginBottom:12 }}>{vfScore>=6?'🎉':vfScore>=4?'👍':'💪'}</div>
                              <div style={{ fontSize:22, fontWeight:900, color:'#0F172A', marginBottom:8 }}>{vfScore}/{VRAI_FAUX_DATA.length} bonnes réponses</div>
                              {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2))
                                ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {(tentativesJeu[jeu]||0)===0?'Un seul réessai autorisé !':'Dernière tentative !'}</div>
                                : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{vfScore}/{VRAI_FAUX_DATA.length}</strong></div>}
                              <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                                {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2)) && <button onClick={()=>{ setTentativesJeu(p=>({...p,[jeu]:(p[jeu]||0)+1})); setVfIdx(0); setVfScore(0); setVfFini(false); setVfChoix(null); }} style={btnG('#0D9488')}>🔄 Rejouer</button>}
                                <button onClick={()=>setJeu(null)} style={btnGhost}>Changer de jeu</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16, fontSize:12, color:'#94A3B8' }}>
                                <span>Affirmation {vfIdx+1}/{VRAI_FAUX_DATA.length}</span>
                                <span style={{ fontWeight:700, color:'#16A34A' }}>{vfScore} ✓</span>
                              </div>
                              <div style={{ height:5, background:'#F1F5F9', borderRadius:3, marginBottom:24, overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${(vfIdx/VRAI_FAUX_DATA.length)*100}%`, background:'#0D9488', borderRadius:3 }} />
                              </div>
                              <div style={{ background:'#F0FDFA', borderRadius:14, padding:20, marginBottom:20, fontSize:16, fontWeight:700, color:'#0F172A', textAlign:'center', lineHeight:1.5 }}>"{VRAI_FAUX_DATA[vfIdx].enonce}"</div>
                              {vfChoix !== null && (
                                <div style={{ background:vfChoix===VRAI_FAUX_DATA[vfIdx].correct?'#DCFCE7':'#FEE2E2', borderRadius:10, padding:'12px 16px', fontSize:12, color:vfChoix===VRAI_FAUX_DATA[vfIdx].correct?'#065F46':'#991B1B', marginBottom:16, fontWeight:600 }}>{VRAI_FAUX_DATA[vfIdx].explication}</div>
                              )}
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                                {[true, false].map(val => {
                                  const selec = vfChoix === val;
                                  const correct = VRAI_FAUX_DATA[vfIdx].correct === val;
                                  let bg = val ? '#DCFCE7' : '#FEE2E2';
                                  let col = val ? '#065F46' : '#991B1B';
                                  if (vfChoix === null) { bg = '#F8FAFC'; col = '#0F172A'; }
                                  return (
                                    <button key={String(val)} disabled={vfChoix!==null} onClick={()=>{ setVfChoix(val); if(val===VRAI_FAUX_DATA[vfIdx].correct) setVfScore(s=>s+1); setTimeout(()=>{ setVfChoix(null); if(vfIdx<VRAI_FAUX_DATA.length-1) setVfIdx(i=>i+1); else setVfFini(true); },1500); }}
                                      style={{ padding:18, borderRadius:14, border:`2px solid ${vfChoix!==null&&correct?'#6EE7B7':vfChoix!==null&&selec&&!correct?'#FECACA':'#E2E8F0'}`, background:bg, color:col, fontSize:16, fontWeight:800, cursor:vfChoix?'default':'pointer' }}>{val?'✅ VRAI':'❌ FAUX'}</button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : jeuActifType === 'reordre' ? (
                        <div style={{ maxWidth:600, margin:'0 auto' }}>
                          <button onClick={()=>setJeu(null)} style={retourBtn}>← Retour aux jeux</button>
                          {reodreFini ? (
                            <div style={{ textAlign:'center', padding:40, background:'#fff', borderRadius:20, border:'1px solid #E2E8F0' }}>
                              <div style={{ fontSize:56, marginBottom:12 }}>{reordreScore>=6?'🎉':reordreScore>=4?'👍':'💪'}</div>
                              <div style={{ fontSize:22, fontWeight:900, color:'#0F172A', marginBottom:8 }}>{reordreScore}/{REORDRE_DATA.length} phrases correctes</div>
                              {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2))
                                ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {(tentativesJeu[jeu]||0)===0?'Un réessai autorisé !':'Dernière tentative !'}</div>
                                : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{reordreScore}/{REORDRE_DATA.length}</strong></div>}
                              <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                                {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2)) && <button onClick={()=>{ setTentativesJeu(p=>({...p,[jeu]:(p[jeu]||0)+1})); setReordreIdx(0); setReordreScore(0); setReodreFini(false); setReordreSelec([]); setReordreValide(null); setReodreMots([...REORDRE_DATA[0].mots].sort(()=>Math.random()-0.5)); }} style={btnG('#0891B2')}>🔄 Rejouer</button>}
                                <button onClick={()=>setJeu(null)} style={btnGhost}>Changer de jeu</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ background:'#fff', borderRadius:20, padding:24, boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14, fontSize:12, color:'#94A3B8' }}>
                                <span>Phrase {reordreIdx+1}/{REORDRE_DATA.length}</span>
                                <span style={{ fontWeight:700, color:'#16A34A' }}>{reordreScore} ✓</span>
                              </div>
                              <div style={{ height:5, background:'#F1F5F9', borderRadius:3, marginBottom:20, overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${(reordreIdx/REORDRE_DATA.length)*100}%`, background:'#0891B2', borderRadius:3 }} />
                              </div>
                              <div style={{ fontSize:12, color:'#94A3B8', marginBottom:6 }}>🇫🇷 {REORDRE_DATA[reordreIdx].fr}</div>
                              <div style={{ minHeight:52, background:'#EFF6FF', borderRadius:10, padding:'10px 14px', marginBottom:16, display:'flex', flexWrap:'wrap', gap:8, alignItems:'center', border:'2px dashed #93C5FD' }}>
                                {reordreSelec.length===0 && <span style={{ color:'#93C5FD', fontSize:13 }}>Clique les mots ci-dessous pour construire la phrase…</span>}
                                {reordreSelec.map((mot,i)=>(
                                  <button key={i} onClick={()=>{ const newS=[...reordreSelec]; newS.splice(i,1); setReordreSelec(newS); setReodreMots(p=>[...p,mot]); setReordreValide(null); }} style={{ padding:'6px 12px', borderRadius:8, background:'#0891B2', color:'#fff', border:'none', fontSize:14, fontWeight:700, cursor:'pointer' }}>{mot}</button>
                                ))}
                              </div>
                              <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
                                {reodreMots.map((mot,i)=>(
                                  <button key={i} onClick={()=>{ setReordreSelec(p=>[...p,mot]); setReodreMots(p=>p.filter((_,j)=>j!==i)); setReordreValide(null); }} style={{ padding:'6px 12px', borderRadius:8, background:'#F1F5F9', color:'#0F172A', border:'1.5px solid #E2E8F0', fontSize:14, fontWeight:600, cursor:'pointer' }}>{mot}</button>
                                ))}
                              </div>
                              {reordreValide !== null && (
                                <div style={{ textAlign:'center', fontSize:13, fontWeight:700, color:reordreValide?'#16A34A':'#EF4444', marginBottom:10 }}>{reordreValide?'✅ Correct !':`❌ Correct : ${REORDRE_DATA[reordreIdx].correct.join(' ')}`}</div>
                              )}
                              <div style={{ display:'flex', gap:10 }}>
                                <button onClick={()=>{ setReordreSelec([]); setReodreMots([...REORDRE_DATA[reordreIdx].mots].sort(()=>Math.random()-0.5)); setReordreValide(null); }} style={{ padding:'9px 16px', borderRadius:8, border:'1.5px solid #E2E8F0', background:'#fff', color:'#475569', fontSize:12, fontWeight:600, cursor:'pointer' }}>🔁 Reset</button>
                                <button onClick={()=>{ const ok=reordreSelec.join(' ')===REORDRE_DATA[reordreIdx].correct.join(' '); setReordreValide(ok); if(ok) setReordreScore(s=>s+1); setTimeout(()=>{ setReordreValide(null); if(reordreIdx<REORDRE_DATA.length-1){ const next=reordreIdx+1; setReordreIdx(next); setReordreSelec([]); setReodreMots([...REORDRE_DATA[next].mots].sort(()=>Math.random()-0.5)); } else setReodreFini(true); },1200); }} disabled={reordreSelec.length===0||reordreValide!==null} style={{ flex:1, ...btnG('#0891B2'), opacity:(reordreSelec.length===0||reordreValide!==null)?0.5:1, cursor:(reordreSelec.length===0||reordreValide!==null)?'not-allowed':'pointer' }}>Valider ✓</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : jeuActifType === 'dialogue' ? (
                        <div style={{ maxWidth:580, margin:'0 auto' }}>
                          <button onClick={()=>setJeu(null)} style={retourBtn}>← Retour aux jeux</button>
                          {dialogueFini ? (
                            <div style={{ textAlign:'center', padding:40, background:'#fff', borderRadius:20, border:'1px solid #E2E8F0' }}>
                              <div style={{ fontSize:56, marginBottom:12 }}>{dialogueScore>=2?'🎉':'💪'}</div>
                              <div style={{ fontSize:22, fontWeight:900, color:'#0F172A', marginBottom:8 }}>{dialogueScore}/{DIALOGUE_DATA.length} dialogues réussis</div>
                              {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2))
                                ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {(tentativesJeu[jeu]||0)===0?'Un réessai autorisé !':'Dernière tentative !'}</div>
                                : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{dialogueScore}/{DIALOGUE_DATA.length}</strong></div>}
                              <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                                {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2)) && <button onClick={()=>{ setTentativesJeu(p=>({...p,[jeu]:(p[jeu]||0)+1})); setDialogueIdx(0); setDialogueEtape(0); setDialogueScore(0); setDialogueFini(false); }} style={btnG('#EC4899')}>🔄 Rejouer</button>}
                                <button onClick={()=>setJeu(null)} style={btnGhost}>Changer de jeu</button>
                              </div>
                            </div>
                          ) : (() => {
                            const dial = DIALOGUE_DATA[dialogueIdx];
                            return (
                              <div>
                                <div style={{ background:'#FDF2F8', borderRadius:12, padding:'10px 16px', marginBottom:16, display:'flex', justifyContent:'space-between' }}>
                                  <span style={{ fontWeight:700, color:'#EC4899' }}>{dial.situation}</span>
                                  <span style={{ fontSize:12, color:'#94A3B8' }}>Dialogue {dialogueIdx+1}/{DIALOGUE_DATA.length}</span>
                                </div>
                                <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
                                  {dial.repliques.slice(0, dialogueEtape+1).map((r,i) => {
                                    const estToi = r.loc==='Toi';
                                    const estChoix = estToi && i===dialogueEtape;
                                    return (
                                      <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:estToi?'flex-end':'flex-start', gap:4 }}>
                                        <span style={{ fontSize:11, color:'#94A3B8' }}>{r.loc}</span>
                                        {estChoix ? (
                                          <div style={{ display:'flex', flexDirection:'column', gap:8, width:'100%' }}>
                                            {r.options.map((opt,j)=>(
                                              <button key={j} onClick={()=>{ const ok=j===r.correct; if(ok&&i===dial.repliques.length-1){ setDialogueScore(s=>s+1); if(dialogueIdx<DIALOGUE_DATA.length-1){ setDialogueIdx(d=>d+1); setDialogueEtape(0); } else setDialogueFini(true); } else if(ok){ setDialogueEtape(e=>e+2); } }}
                                                style={{ padding:'10px 14px', borderRadius:12, border:'2px solid #F9A8D4', background:'#FDF2F8', color:'#9D174D', fontSize:13, fontWeight:600, cursor:'pointer', textAlign:'left' }}>💬 {opt}</button>
                                            ))}
                                          </div>
                                        ) : (
                                          <div style={{ maxWidth:'75%', background:estToi?'#FDF2F8':'#F8FAFC', borderRadius:14, padding:'10px 14px', fontSize:13, color:'#0F172A', border:`1px solid ${estToi?'#F9A8D4':'#E2E8F0'}` }}>{r.texte || r.options[r.correct]}</div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ) : jeuActifType === 'flashcards' ? (
                        <div style={{ maxWidth:520, margin:'0 auto' }}>
                          <button onClick={()=>setJeu(null)} style={retourBtn}>← Retour aux jeux</button>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16, alignItems:'center' }}>
                            <span style={{ fontSize:13, color:'#94A3B8' }}>Carte {flashIdx+1}/{FLASHCARDS_DATA.length}</span>
                            <span style={{ fontSize:13, fontWeight:700, color:'#6366F1' }}>✓ Sus : {flashSus.length}</span>
                          </div>
                          <div style={{ height:5, background:'#F1F5F9', borderRadius:3, marginBottom:24, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${(flashIdx/FLASHCARDS_DATA.length)*100}%`, background:'#6366F1', borderRadius:3 }} />
                          </div>
                          <div onClick={()=>setFlashRetourne(p=>!p)} style={{ background:flashRetourne?'#EEF2FF':'#fff', borderRadius:20, padding:'40px 28px', textAlign:'center', cursor:'pointer', border:`2px solid ${flashRetourne?'#818CF8':'#6366F130'}`, boxShadow:'0 8px 24px rgba(99,102,241,0.15)', minHeight:180, display:'flex', flexDirection:'column', justifyContent:'center', marginBottom:20 }}>
                            <div style={{ fontSize:11, fontWeight:700, color:'#818CF8', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.08em' }}>{flashRetourne?'🇫🇷 Traduction & note':'🇬🇧 Terme anglais - clique pour retourner'}</div>
                            <div style={{ fontSize:flashRetourne?18:26, fontWeight:800, color:flashRetourne?'#4F46E5':'#0F172A', whiteSpace:'pre-line', lineHeight:1.5 }}>{flashRetourne ? FLASHCARDS_DATA[flashIdx].verso : FLASHCARDS_DATA[flashIdx].recto}</div>
                            <div style={{ fontSize:11, color:'#A5B4FC', marginTop:10 }}>{FLASHCARDS_DATA[flashIdx].categorie}</div>
                          </div>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                            <button onClick={()=>{ setFlashRetourne(false); if(flashIdx<FLASHCARDS_DATA.length-1) setFlashIdx(i=>i+1); }} style={{ padding:12, borderRadius:10, border:'1.5px solid #FECACA', background:'#FEF2F2', color:'#991B1B', fontSize:13, fontWeight:700, cursor:'pointer' }}>❌ À revoir</button>
                            <button onClick={()=>{ setFlashSus(p=>[...p,flashIdx]); setFlashRetourne(false); if(flashIdx<FLASHCARDS_DATA.length-1) setFlashIdx(i=>i+1); }} style={{ padding:12, borderRadius:10, border:'1.5px solid #6EE7B7', background:'#DCFCE7', color:'#065F46', fontSize:13, fontWeight:700, cursor:'pointer' }}>✅ Je sais !</button>
                          </div>
                          {flashIdx === FLASHCARDS_DATA.length-1 && (
                            <div style={{ marginTop:16, textAlign:'center' }}>
                              <div style={{ fontSize:22, fontWeight:900, color:'#0F172A', marginBottom:8 }}>🎴 {flashSus.length}/{FLASHCARDS_DATA.length} cartes maîtrisées !</div>
                              <button onClick={()=>{ setFlashIdx(0); setFlashRetourne(false); setFlashSus([]); }} style={btnG('#6366F1')}>🔄 Recommencer</button>
                            </div>
                          )}
                        </div>
                      ) : jeuActifType === 'conjugaison' ? (
                        <div style={{ maxWidth:520, margin:'0 auto' }}>
                          <button onClick={()=>setJeu(null)} style={retourBtn}>← Retour aux jeux</button>
                          {conjFini ? (
                            <div style={{ textAlign:'center', padding:40, background:'#fff', borderRadius:20, border:'1px solid #E2E8F0' }}>
                              <div style={{ fontSize:56, marginBottom:12 }}>{conjScore>=8?'🏆':conjScore>=5?'👍':'💪'}</div>
                              <div style={{ fontSize:22, fontWeight:900, color:'#0F172A', marginBottom:8 }}>{conjScore}/{CONJUGAISON_DATA.length} formes correctes</div>
                              {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2))
                                ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {(tentativesJeu[jeu]||0)===0?'Un réessai autorisé !':'Dernière tentative !'}</div>
                                : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{conjScore}/{CONJUGAISON_DATA.length}</strong></div>}
                              <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                                {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2)) && <button onClick={()=>{ setTentativesJeu(p=>({...p,[jeu]:(p[jeu]||0)+1})); setConjIdx(0); setConjInput(''); setConjScore(0); setConjFini(false); setConjMontre(false); }} style={btnG('#7C3AED')}>🔄 Rejouer</button>}
                                <button onClick={()=>setJeu(null)} style={btnGhost}>Changer de jeu</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16, fontSize:12, color:'#94A3B8' }}>
                                <span>Verbe {conjIdx+1}/{CONJUGAISON_DATA.length}</span>
                                <span style={{ fontWeight:700, color:'#7C3AED' }}>{conjScore} ✓</span>
                              </div>
                              <div style={{ height:5, background:'#F1F5F9', borderRadius:3, marginBottom:24, overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${(conjIdx/CONJUGAISON_DATA.length)*100}%`, background:'#7C3AED', borderRadius:3 }} />
                              </div>
                              <div style={{ textAlign:'center', fontSize:12, color:'#94A3B8', marginBottom:6 }}>{CONJUGAISON_DATA[conjIdx].indice}</div>
                              <div style={{ textAlign:'center', marginBottom:6 }}><span style={{ fontSize:32, fontWeight:900, color:'#7C3AED' }}>to {CONJUGAISON_DATA[conjIdx].infinitif}</span></div>
                              <div style={{ textAlign:'center', fontSize:14, color:'#475569', marginBottom:24 }}>{CONJUGAISON_DATA[conjIdx].temps} (I ___)</div>
                              <input value={conjInput} onChange={e=>setConjInput(e.target.value.toLowerCase())} onKeyDown={e=>e.key==='Enter'&&conjInput.trim()&&!conjMontre&&(()=>{ const ok=conjInput.trim()===CONJUGAISON_DATA[conjIdx].correct; if(ok)setConjScore(s=>s+1); setConjMontre(true); setTimeout(()=>{ if(conjIdx<CONJUGAISON_DATA.length-1){setConjIdx(i=>i+1);setConjInput('');setConjMontre(false);}else setConjFini(true); },1000); })()} placeholder="Tapez la forme conjuguée..." style={{ width:'100%', padding:14, borderRadius:10, border:'2px solid #7C3AED', fontSize:18, fontWeight:700, textAlign:'center', outline:'none', boxSizing:'border-box', marginBottom:10 }} />
                              {conjMontre && <div style={{ textAlign:'center', fontSize:15, fontWeight:700, color:conjInput===CONJUGAISON_DATA[conjIdx].correct?'#16A34A':'#EF4444', marginBottom:10 }}>{conjInput===CONJUGAISON_DATA[conjIdx].correct?'✅ Correct !':`❌ Réponse : ${CONJUGAISON_DATA[conjIdx].correct}`}</div>}
                              <div style={{ display:'flex', gap:10 }}>
                                <button onClick={()=>{ setConjMontre(true); setTimeout(()=>{ if(conjIdx<CONJUGAISON_DATA.length-1){setConjIdx(i=>i+1);setConjInput('');setConjMontre(false);}else setConjFini(true); },1200); }} style={{ flex:1, padding:10, borderRadius:8, border:'1.5px solid #E2E8F0', background:'#fff', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer' }}>💡 Voir la réponse</button>
                                <button disabled={!conjInput.trim()||conjMontre} onClick={()=>{ const ok=conjInput.trim()===CONJUGAISON_DATA[conjIdx].correct; if(ok)setConjScore(s=>s+1); setConjMontre(true); setTimeout(()=>{ if(conjIdx<CONJUGAISON_DATA.length-1){setConjIdx(i=>i+1);setConjInput('');setConjMontre(false);}else setConjFini(true); },1000); }} style={{ flex:1, ...btnG('#7C3AED'), opacity:(!conjInput.trim()||conjMontre)?0.5:1, cursor:(!conjInput.trim()||conjMontre)?'not-allowed':'pointer' }}>Valider ✓</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : jeuActifType === 'cecr' ? (
                        <div style={{ maxWidth:580, margin:'0 auto' }}>
                          <button onClick={()=>setJeu(null)} style={retourBtn}>← Retour aux jeux</button>
                          {cecrFini ? (
                            <div style={{ textAlign:'center', padding:40, background:'#fff', borderRadius:20, border:'1px solid #E2E8F0' }}>
                              <div style={{ fontSize:56, marginBottom:12 }}>{cecrScore>=8?'🏆':cecrScore>=5?'🎉':'💪'}</div>
                              <div style={{ fontSize:22, fontWeight:900, color:'#0F172A', marginBottom:8 }}>{cecrScore}/{CECR_DATA.length} bonnes réponses</div>
                              {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2))
                                ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {(tentativesJeu[jeu]||0)===0?'Un réessai autorisé !':'Dernière tentative !'}</div>
                                : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{cecrScore}/{CECR_DATA.length}</strong></div>}
                              <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                                {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2)) && <button onClick={()=>{ setTentativesJeu(p=>({...p,[jeu]:(p[jeu]||0)+1})); setCecrIdx(0); setCecrScore(0); setCecrFini(false); setCecrChoix(null); }} style={btnG('#F59E0B')}>🔄 Rejouer</button>}
                                <button onClick={()=>setJeu(null)} style={btnGhost}>Changer de jeu</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
                                <span style={{ padding:'3px 10px', borderRadius:20, background:'#FEF3C7', color:'#92400E', fontSize:11, fontWeight:800 }}>Niveau {CECR_DATA[cecrIdx].niveau}</span>
                                <span style={{ fontSize:12, color:'#94A3B8' }}>{cecrIdx+1}/{CECR_DATA.length} - {cecrScore} ✓</span>
                              </div>
                              <div style={{ height:5, background:'#F1F5F9', borderRadius:3, marginBottom:20, overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${(cecrIdx/CECR_DATA.length)*100}%`, background:'#F59E0B', borderRadius:3 }} />
                              </div>
                              <div style={{ fontSize:17, fontWeight:700, color:'#0F172A', marginBottom:22, lineHeight:1.4 }}>{CECR_DATA[cecrIdx].q}</div>
                              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                                {CECR_DATA[cecrIdx].options.map(opt=>{
                                  const selec=cecrChoix===opt;
                                  const correct=opt===CECR_DATA[cecrIdx].correct;
                                  let bg='#F8FAFC', bord='#E2E8F0', txt='#0F172A';
                                  if(cecrChoix!==null){ if(correct){bg='#DCFCE7';bord='#6EE7B7';txt='#065F46';} else if(selec){bg='#FEE2E2';bord='#FECACA';txt='#991B1B';} }
                                  return (
                                    <button key={opt} disabled={cecrChoix!==null} onClick={()=>{ setCecrChoix(opt); if(opt===CECR_DATA[cecrIdx].correct) setCecrScore(s=>s+1); setTimeout(()=>{ setCecrChoix(null); if(cecrIdx<CECR_DATA.length-1) setCecrIdx(i=>i+1); else setCecrFini(true); },900); }}
                                      style={{ padding:'13px 16px', borderRadius:12, border:`2px solid ${bord}`, background:bg, color:txt, fontSize:13, fontWeight:600, cursor:cecrChoix?'default':'pointer', textAlign:'left' }}>{opt}</button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : jeuActifType === 'dictee' ? (
                        <div style={{ maxWidth:520, margin:'0 auto' }}>
                          <button onClick={()=>setJeu(null)} style={retourBtn}>← Retour aux jeux</button>
                          {dicteeFini ? (
                            <div style={{ textAlign:'center', padding:40, background:'#fff', borderRadius:20, border:'1px solid #E2E8F0' }}>
                              <div style={{ fontSize:56, marginBottom:12 }}>{dicteeScore>=8?'🏆':dicteeScore>=5?'👍':'💪'}</div>
                              <div style={{ fontSize:22, fontWeight:900, color:'#0F172A', marginBottom:8 }}>{dicteeScore}/{DICTEE_DATA.length} mots corrects</div>
                              {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2))
                                ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {(tentativesJeu[jeu]||0)===0?'Un réessai autorisé !':'Dernière tentative !'}</div>
                                : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{dicteeScore}/{DICTEE_DATA.length}</strong></div>}
                              <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                                {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2)) && <button onClick={()=>{ setTentativesJeu(p=>({...p,[jeu]:(p[jeu]||0)+1})); setDicteeIdx(0); setDicteeInput(''); setDicteeScore(0); setDicteeFini(false); setDicteeMontre(false); }} style={btnG('#14B8A6')}>🔄 Rejouer</button>}
                                <button onClick={()=>setJeu(null)} style={btnGhost}>Changer de jeu</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16, fontSize:12, color:'#94A3B8' }}>
                                <span>Mot {dicteeIdx+1}/{DICTEE_DATA.length}</span>
                                <span style={{ fontWeight:700, color:'#14B8A6' }}>{dicteeScore} ✓</span>
                              </div>
                              <div style={{ height:5, background:'#F1F5F9', borderRadius:3, marginBottom:24, overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${(dicteeIdx/DICTEE_DATA.length)*100}%`, background:'#14B8A6', borderRadius:3 }} />
                              </div>
                              <div style={{ textAlign:'center', background:'#F0FDFA', borderRadius:14, padding:24, marginBottom:24 }}>
                                <div style={{ fontSize:11, color:'#0D9488', fontWeight:700, marginBottom:8, textTransform:'uppercase' }}>Indice</div>
                                <div style={{ fontSize:18, fontWeight:700, color:'#0F172A' }}>{DICTEE_DATA[dicteeIdx].indice}</div>
                              </div>
                              <input value={dicteeInput} onChange={e=>setDicteeInput(e.target.value.toLowerCase())} onKeyDown={e=>e.key==='Enter'&&dicteeInput.trim()&&!dicteeMontre&&(()=>{ const ok=dicteeInput.trim()===DICTEE_DATA[dicteeIdx].mot; if(ok)setDicteeScore(s=>s+1); setDicteeMontre(true); setTimeout(()=>{ if(dicteeIdx<DICTEE_DATA.length-1){setDicteeIdx(i=>i+1);setDicteeInput('');setDicteeMontre(false);}else setDicteeFini(true); },1000); })()} placeholder="Écris le mot en anglais..." style={{ width:'100%', padding:14, borderRadius:10, border:'2px solid #14B8A6', fontSize:16, fontWeight:700, textAlign:'center', outline:'none', boxSizing:'border-box', marginBottom:10 }} />
                              {dicteeMontre && <div style={{ textAlign:'center', fontSize:15, fontWeight:700, color:dicteeInput===DICTEE_DATA[dicteeIdx].mot?'#16A34A':'#EF4444', marginBottom:10 }}>{dicteeInput===DICTEE_DATA[dicteeIdx].mot?'✅ Parfait !':'❌ Réponse : '+DICTEE_DATA[dicteeIdx].mot}</div>}
                              <div style={{ display:'flex', gap:10 }}>
                                <button onClick={()=>{ setDicteeMontre(true); setTimeout(()=>{ if(dicteeIdx<DICTEE_DATA.length-1){setDicteeIdx(i=>i+1);setDicteeInput('');setDicteeMontre(false);}else setDicteeFini(true); },1200); }} style={{ flex:1, padding:10, borderRadius:8, border:'1.5px solid #E2E8F0', background:'#fff', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer' }}>💡 Voir la réponse</button>
                                <button disabled={!dicteeInput.trim()||dicteeMontre} onClick={()=>{ const ok=dicteeInput.trim()===DICTEE_DATA[dicteeIdx].mot; if(ok)setDicteeScore(s=>s+1); setDicteeMontre(true); setTimeout(()=>{ if(dicteeIdx<DICTEE_DATA.length-1){setDicteeIdx(i=>i+1);setDicteeInput('');setDicteeMontre(false);}else setDicteeFini(true); },1000); }} style={{ flex:1, ...btnG('#14B8A6'), opacity:(!dicteeInput.trim()||dicteeMontre)?0.5:1, cursor:(!dicteeInput.trim()||dicteeMontre)?'not-allowed':'pointer' }}>Valider ✓</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : jeuActifType === 'traduction' ? (
                        <div style={{ maxWidth:520, margin:'0 auto' }}>
                          <button onClick={()=>setJeu(null)} style={retourBtn}>← Retour aux jeux</button>
                          {traFini ? (
                            <div style={{ textAlign:'center', padding:40, background:'#fff', borderRadius:20, border:'1px solid #E2E8F0' }}>
                              <div style={{ fontSize:56, marginBottom:12 }}>{traScore>=8?'🏆':traScore>=5?'👍':'💪'}</div>
                              <div style={{ fontSize:22, fontWeight:900, color:'#0F172A', marginBottom:8 }}>{traScore}/{TRADUCTION_DATA.length} traductions correctes</div>
                              {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2))
                                ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {(tentativesJeu[jeu]||0)===0?'Un réessai autorisé !':'Dernière tentative !'}</div>
                                : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{traScore}/{TRADUCTION_DATA.length}</strong></div>}
                              <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                                {(tentativesJeu[jeu]||0) < ((jeuActif?.max_tentatives||2)) && <button onClick={()=>{ setTentativesJeu(p=>({...p,[jeu]:(p[jeu]||0)+1})); setTraIdx(0); setTraInput(''); setTraScore(0); setTraFini(false); setTraMontre(false); }} style={btnG('#059669')}>🔄 Rejouer</button>}
                                <button onClick={()=>setJeu(null)} style={btnGhost}>Changer de jeu</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16, fontSize:12, color:'#94A3B8' }}>
                                <span>Mot {traIdx+1}/{TRADUCTION_DATA.length}</span>
                                <span style={{ fontWeight:700, color:'#059669' }}>{traScore} ✓</span>
                              </div>
                              <div style={{ height:5, background:'#F1F5F9', borderRadius:3, marginBottom:24, overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${(traIdx/TRADUCTION_DATA.length)*100}%`, background:'#059669', borderRadius:3 }} />
                              </div>
                              <div style={{ textAlign:'center', fontSize:12, color:'#94A3B8', marginBottom:6 }}>Traduis en anglais :</div>
                              <div style={{ textAlign:'center', fontSize:32, fontWeight:900, color:'#059669', marginBottom:24 }}>{TRADUCTION_DATA[traIdx].fr}</div>
                              <input value={traInput} onChange={e=>setTraInput(e.target.value.toLowerCase())} onKeyDown={e=>e.key==='Enter'&&traInput.trim()&&!traMontre&&(()=>{ const ok=traInput.trim()===TRADUCTION_DATA[traIdx].mot; if(ok)setTraScore(s=>s+1); setTraMontre(true); setTimeout(()=>{ if(traIdx<TRADUCTION_DATA.length-1){setTraIdx(i=>i+1);setTraInput('');setTraMontre(false);}else setTraFini(true); },1000); })()} placeholder="Type the English word..." style={{ width:'100%', padding:14, borderRadius:10, border:'2px solid #059669', fontSize:18, fontWeight:700, textAlign:'center', outline:'none', boxSizing:'border-box', marginBottom:10 }} />
                              {traMontre && <div style={{ textAlign:'center', fontSize:15, fontWeight:700, color:traInput===TRADUCTION_DATA[traIdx].mot?'#16A34A':'#EF4444', marginBottom:10 }}>{traInput===TRADUCTION_DATA[traIdx].mot?'✅ Correct !':`❌ Réponse : ${TRADUCTION_DATA[traIdx].mot}`}</div>}
                              <div style={{ display:'flex', gap:10 }}>
                                <button onClick={()=>{ setTraMontre(true); setTimeout(()=>{ if(traIdx<TRADUCTION_DATA.length-1){setTraIdx(i=>i+1);setTraInput('');setTraMontre(false);}else setTraFini(true); },1200); }} style={{ flex:1, padding:10, borderRadius:8, border:'1.5px solid #E2E8F0', background:'#fff', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer' }}>💡 Voir la réponse</button>
                                <button disabled={!traInput.trim()||traMontre} onClick={()=>{ const ok=traInput.trim()===TRADUCTION_DATA[traIdx].mot; if(ok)setTraScore(s=>s+1); setTraMontre(true); setTimeout(()=>{ if(traIdx<TRADUCTION_DATA.length-1){setTraIdx(i=>i+1);setTraInput('');setTraMontre(false);}else setTraFini(true); },1000); }} style={{ flex:1, ...btnG('#059669'), opacity:(!traInput.trim()||traMontre)?0.5:1, cursor:(!traInput.trim()||traMontre)?'not-allowed':'pointer' }}>Valider ✓</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : jeuActifType === 'mots_croises' ? (
                        <div style={{ maxWidth:560, margin:'0 auto' }}>
                          <button onClick={()=>setJeu(null)} style={retourBtn}>← Retour aux jeux</button>
                          {crossFini ? (
                            <div style={{ textAlign:'center', padding:40, background:'#fff', borderRadius:20, border:'1px solid #E2E8F0' }}>
                              <div style={{ fontSize:56, marginBottom:12 }}>{crossValide?.score>=3?'🏆':crossValide?.score>=2?'👍':'💪'}</div>
                              <div style={{ fontSize:22, fontWeight:900, color:'#0F172A', marginBottom:8 }}>{crossValide?.score}/{CROSSWORD.mots.length} mots corrects</div>
                              {(tentativesJeu[jeu]||0) < (jeuActif?.max_tentatives||2)
                                ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {(tentativesJeu[jeu]||0)===0?'Un réessai autorisé !':'Dernière tentative !'}</div>
                                : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{crossValide?.score}/{CROSSWORD.mots.length}</strong></div>}
                              <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                                {(tentativesJeu[jeu]||0) < (jeuActif?.max_tentatives||2) && <button onClick={()=>{ setTentativesJeu(p=>({...p,[jeu]:(p[jeu]||0)+1})); setCrossInputs({}); setCrossValide(null); setCrossFini(false); }} style={btnG('#D97706')}>🔄 Rejouer</button>}
                                <button onClick={()=>setJeu(null)} style={btnGhost}>Changer de jeu</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ background:'#fff', borderRadius:20, padding:'24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                              <div style={{ display:'grid', gridTemplateColumns:`repeat(${CROSSWORD.colonnes},34px)`, gap:2, justifyContent:'center', marginBottom:24 }}>
                                {Array.from({ length: CROSSWORD.lignes }).map((_,r) => (
                                  Array.from({ length: CROSSWORD.colonnes }).map((__,c) => {
                                    const clef = `${r},${c}`;
                                    const lettre = CROSSWORD.cases[clef];
                                    if (!lettre) return <div key={clef} style={{ width:34, height:34 }} />;
                                    const motDebut = CROSSWORD.mots.find(m=>m.ligne===r && m.colonne===c);
                                    return (
                                      <div key={clef} style={{ position:'relative', width:34, height:34 }}>
                                        {motDebut && <span style={{ position:'absolute', top:1, left:2, fontSize:8, fontWeight:800, color:'#D97706' }}>{motDebut.numero}</span>}
                                        <input maxLength={1} value={crossInputs[clef]||''} onChange={e=>setCrossInputs(p=>({...p,[clef]:e.target.value.toUpperCase()}))}
                                          style={{ width:34, height:34, textAlign:'center', fontSize:16, fontWeight:800, borderRadius:4, border:'2px solid #D97706', textTransform:'uppercase', outline:'none' }} />
                                      </div>
                                    );
                                  })
                                ))}
                              </div>
                              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
                                {CROSSWORD.mots.map(m => (
                                  <div key={m.id} style={{ fontSize:12, color:'#475569' }}><strong>{m.numero}.</strong> {m.dir==='h'?'Horizontal':'Vertical'} - {m.indice}</div>
                                ))}
                              </div>
                              <button onClick={()=>{
                                let motsOk = [];
                                CROSSWORD.mots.forEach(m => {
                                  const [dr,dc] = m.dir==='h' ? [0,1] : [1,0];
                                  let ok = true;
                                  for (let i=0;i<m.longueur;i++) {
                                    const clef = `${m.ligne+dr*i},${m.colonne+dc*i}`;
                                    if ((crossInputs[clef]||'') !== m.mot[i]) { ok = false; break; }
                                  }
                                  if (ok) motsOk.push(m.id);
                                });
                                setCrossValide({ motsOk, score: motsOk.length });
                                setCrossFini(true);
                              }} style={{ width:'100%', ...btnG('#D97706') }}>Vérifier la grille ✓</button>
                            </div>
                          )}
                        </div>
                      ) : jeuActifType === 'mots_caches' ? (
                        <div style={{ maxWidth:520, margin:'0 auto' }}>
                          <button onClick={()=>setJeu(null)} style={retourBtn}>← Retour aux jeux</button>
                          {wsFini ? (
                            <div style={{ textAlign:'center', padding:40, background:'#fff', borderRadius:20, border:'1px solid #E2E8F0' }}>
                              <div style={{ fontSize:56, marginBottom:12 }}>{wsTrouves.length>=WORDSEARCH_MOTS_POS.length?'🏆':wsTrouves.length>=3?'👍':'💪'}</div>
                              <div style={{ fontSize:22, fontWeight:900, color:'#0F172A', marginBottom:8 }}>{wsTrouves.length}/{WORDSEARCH_MOTS_POS.length} mots trouvés</div>
                              {(tentativesJeu[jeu]||0) < (jeuActif?.max_tentatives||2)
                                ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {(tentativesJeu[jeu]||0)===0?'Un réessai autorisé !':'Dernière tentative !'}</div>
                                : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{wsTrouves.length}/{WORDSEARCH_MOTS_POS.length}</strong></div>}
                              <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                                {(tentativesJeu[jeu]||0) < (jeuActif?.max_tentatives||2) && <button onClick={()=>{ setTentativesJeu(p=>({...p,[jeu]:(p[jeu]||0)+1})); setWsGrille(construireGrilleMotsCaches()); setWsDebut(null); setWsTrouves([]); setWsCellsTrouvees([]); setWsFini(false); }} style={btnG('#4338CA')}>🔄 Rejouer</button>}
                                <button onClick={()=>setJeu(null)} style={btnGhost}>Changer de jeu</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ background:'#fff', borderRadius:20, padding:24, boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14, fontSize:12, color:'#94A3B8' }}>
                                <span>Clique une lettre de début, puis de fin du mot.</span>
                                <span style={{ fontWeight:700, color:'#4338CA' }}>{wsTrouves.length}/{WORDSEARCH_MOTS_POS.length} ✓</span>
                              </div>
                              <div style={{ display:'grid', gridTemplateColumns:`repeat(${WORDSEARCH_TAILLE},32px)`, gap:2, justifyContent:'center', marginBottom:20 }}>
                                {wsGrille.map((ligne,r) => ligne.map((lettre,c) => {
                                  const clef = `${r},${c}`;
                                  const trouve = wsCellsTrouvees.includes(clef);
                                  const selec = wsDebut && wsDebut.r===r && wsDebut.c===c;
                                  return (
                                    <button key={clef} onClick={()=>{
                                      if (!wsDebut) { setWsDebut({r,c}); return; }
                                      const dr=r-wsDebut.r, dc=c-wsDebut.c;
                                      const steps=Math.max(Math.abs(dr),Math.abs(dc));
                                      const ligneValide=(dr===0||dc===0||Math.abs(dr)===Math.abs(dc)) && steps>0;
                                      if (ligneValide) {
                                        const stepR = dr===0?0:dr/Math.abs(dr), stepC = dc===0?0:dc/Math.abs(dc);
                                        let lettres=''; const chemin=[];
                                        for (let i=0;i<=steps;i++) { const rr=wsDebut.r+stepR*i, cc=wsDebut.c+stepC*i; lettres+=wsGrille[rr][cc]; chemin.push(`${rr},${cc}`); }
                                        const inverse = lettres.split('').reverse().join('');
                                        const trouveMot = WORDSEARCH_MOTS_POS.find(m => (m.mot===lettres||m.mot===inverse) && !wsTrouves.includes(m.mot));
                                        if (trouveMot) {
                                          const nvlTrouves=[...wsTrouves, trouveMot.mot];
                                          setWsTrouves(nvlTrouves);
                                          setWsCellsTrouvees(prev=>[...prev,...chemin]);
                                          if (nvlTrouves.length === WORDSEARCH_MOTS_POS.length) { setTentativesJeu(p=>({...p,[jeu]:(p[jeu]||0)+1})); setWsFini(true); }
                                        }
                                      }
                                      setWsDebut(null);
                                    }} style={{ width:32, height:32, borderRadius:4, border:`2px solid ${trouve?'#6EE7B7':selec?'#4338CA':'#E2E8F0'}`, background:trouve?'#DCFCE7':selec?'#EEF2FF':'#fff', color:trouve?'#065F46':'#0F172A', fontSize:13, fontWeight:800, cursor:'pointer' }}>{lettre}</button>
                                  );
                                }))}
                              </div>
                              <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
                                {WORDSEARCH_MOTS_POS.map(m => (
                                  <span key={m.mot} style={{ padding:'4px 10px', borderRadius:20, fontSize:12, fontWeight:700, background:wsTrouves.includes(m.mot)?'#DCFCE7':'#F1F5F9', color:wsTrouves.includes(m.mot)?'#065F46':'#475569', textDecoration:wsTrouves.includes(m.mot)?'line-through':'none' }}>{m.mot}</span>
                                ))}
                              </div>
                              <button onClick={()=>{ setTentativesJeu(p=>({...p,[jeu]:(p[jeu]||0)+1})); setWsFini(true); }} style={btnGhost}>Terminer</button>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
              );
            })()}

            {/* MES COURS */}
            {activeTab === "cours" && (
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                  <div>
                    <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>{ui.emojiCours} Mes Cours</h2>
                    <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>
                      {coursElearningLoading ? "Chargement…" : `${coursElearning.length} cours disponible${coursElearning.length!==1?"s":""} pour votre classe`}
                    </p>
                  </div>
                </div>

                {coursElearningLoading && (
                  <div style={{ textAlign:"center", padding:60, color:"#9ca3af", fontSize:13 }}>
                    <div style={{ fontSize:32, marginBottom:10 }}>⏳</div>Chargement des cours…
                  </div>
                )}

                {!coursElearningLoading && coursElearning.length === 0 && (
                  <div style={{ textAlign:"center", padding:60, background:"#f8fafc", borderRadius:14, border:"1px dashed #e5e7eb" }}>
                    <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
                    <div style={{ fontWeight:700, fontSize:15, color:"#374151", marginBottom:6 }}>Aucun cours disponible</div>
                    <div style={{ fontSize:13, color:"#9ca3af" }}>Votre formateur n'a pas encore publié de cours pour votre classe.</div>
                  </div>
                )}

                {/* ── Filtres ──
                    La barre n'apparaît que s'il y a des cours : sur une liste vide elle
                    ne ferait que donner à chercher ce qui n'existe pas. */}
                {!coursElearningLoading && coursElearning.length > 0 && (
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:16,
                    background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:12, padding:"12px 14px" }}>
                    <input value={coursRecherche} onChange={e=>setCoursRecherche(e.target.value)}
                      placeholder="🔍 Titre, formateur, classe…"
                      style={{ ...champCours, minWidth:190, flex:"1 1 220px" }} />

                    <select value={coursType} onChange={e=>setCoursType(e.target.value)} style={{ ...champCours, cursor:"pointer" }}>
                      <option value="">Tous les types</option>
                      <option value="lecon">📖 Leçon</option>
                      <option value="audio">🎧 Audio</option>
                      <option value="video">🎬 Vidéo</option>
                    </select>

                    <select value={coursStatut} onChange={e=>setCoursStatut(e.target.value)} style={{ ...champCours, cursor:"pointer" }}>
                      <option value="">Tous les statuts</option>
                      <option value="non_lu">À lire</option>
                      <option value="lu">✓ Lu</option>
                      <option value="verrouille">🔒 Verrouillé</option>
                    </select>

                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:11.5, color:"#94a3b8", fontWeight:700 }}>Publié du</span>
                      <input type="date" value={coursDu} max={coursAu || undefined}
                        onChange={e=>setCoursDu(e.target.value)} style={{ ...champCours, cursor:"pointer" }} />
                      <span style={{ fontSize:11.5, color:"#94a3b8", fontWeight:700 }}>au</span>
                      <input type="date" value={coursAu} min={coursDu || undefined}
                        onChange={e=>setCoursAu(e.target.value)} style={{ ...champCours, cursor:"pointer" }} />
                    </div>

                    {coursFiltreActif && (
                      <button onClick={()=>{ setCoursRecherche(""); setCoursType(""); setCoursStatut(""); setCoursDu(""); setCoursAu(""); }}
                        style={{ marginLeft:"auto", padding:"8px 14px", borderRadius:8, border:"1px solid #cbd5e1", background:"#fff",
                          fontSize:12, fontWeight:700, color:"#475569", cursor:"pointer", fontFamily:"inherit" }}>
                        ✕ Réinitialiser
                      </button>
                    )}
                  </div>
                )}

                {/* Les filtres ne retiennent rien : on le dit ici, au lieu de laisser une
                    grille vide qui ressemblerait à une classe sans cours. */}
                {!coursElearningLoading && coursElearning.length > 0 && coursFiltres.length === 0 && (
                  <div style={{ textAlign:"center", padding:48, background:"#f8fafc", borderRadius:14, border:"1px dashed #e5e7eb" }}>
                    <div style={{ fontSize:34, marginBottom:10 }}>🔍</div>
                    <div style={{ fontWeight:700, fontSize:14, color:"#374151", marginBottom:6 }}>Aucun cours ne correspond à ces filtres</div>
                    <div style={{ fontSize:12.5, color:"#9ca3af" }}>Élargissez la période ou effacez la recherche.</div>
                  </div>
                )}

                {!coursElearningLoading && coursFiltres.length > 0 && (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px,1fr))", gap:16 }}>
                    {coursPageVisibles.map(c => {
                      const TYPE_APP = {
                        lecon: { label:"Leçon", emoji:"📖", couleur:"#2563eb" },
                        audio: { label:"Audio", emoji:"🎧", couleur:"#7c3aed" },
                        video: { label:"Vidéo", emoji:"🎬", couleur:"#dc2626" },
                      };
                      const tm = TYPE_APP[c.type_contenu] || { label:"Contenu", emoji:"📚", couleur:"#2563eb" };
                      // Le serveur n'envoie pas les blocs d'un contenu verrouille : on affiche
                      // le nombre qu'il a mis de cote, pour que l'apprenant sache ce qui l'attend.
                      const verrou  = c.verrouille === true;
                      const lu      = c.lu === true;
                      const nbBlocs = verrou ? (c.nb_blocs_caches || 0) : (c.blocs || []).length;
                      // Le rang dans la séquence : les cours arrivent désormais du serveur
                      // dans l'ordre exact où ils se déverrouillent, et le numéroter rend
                      // cet ordre lisible au lieu de le laisser deviner.
                      const rang = coursElearning.indexOf(c) + 1;
                      return (
                        <div key={c.id} style={{ borderRadius:14, border:`2px solid ${lu ? "#86efac" : verrou ? "#e2e8f0" : tm.couleur+"30"}`, background: verrou ? "#f8fafc" : "#fff", overflow:"hidden", cursor: verrou ? "not-allowed" : "pointer", transition:"box-shadow .15s", opacity: verrou ? .85 : 1 }}
                          onClick={() => { if (!verrou) setCoursElearningDetail(c); }}
                          onMouseEnter={e => { if (!verrou) e.currentTarget.style.boxShadow="0 4px 18px rgba(0,0,0,0.1)"; }}
                          onMouseLeave={e => e.currentTarget.style.boxShadow="none"}>
                          <div style={{ height:5, background: lu ? "#16a34a" : verrou ? "#cbd5e1" : tm.couleur }} />
                          <div style={{ padding:18 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                <span style={{ fontSize:28 }}>{tm.emoji}</span>
                                <div>
                                  <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
                                    <span style={{ fontSize:11, fontWeight:800, color:"#94a3b8", fontVariantNumeric:"tabular-nums" }}>#{rang}</span>
                                    <span style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>{c.titre}</span>
                                  </div>
                                  <div style={{ fontSize:11, color:"#9ca3af" }}>{c.coach_nom||"Formateur BET"}</div>
                                </div>
                              </div>
                              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:5 }}>
                                {/* LE BADGE « LU ». Un cours terminé et un cours jamais
                                    ouvert s'affichaient à l'identique : rien ne disait où
                                    l'on s'était arrêté. */}
                                {lu && (
                                  <span style={{ padding:"3px 9px", borderRadius:14, fontSize:11, fontWeight:800, background:"#dcfce7", color:"#15803d", whiteSpace:"nowrap" }}>✓ Lu</span>
                                )}
                                <span style={{ padding:"3px 9px", borderRadius:14, fontSize:11, fontWeight:700, background:`${tm.couleur}15`, color:tm.couleur }}>{tm.label}</span>
                              </div>
                            </div>
                            {(c.objectifs||[]).length > 0 && (
                              <p style={{ fontSize:12, color:"#6b7280", lineHeight:1.6, marginBottom:12 }}>{(c.objectifs||[]).join(" · ")}</p>
                            )}
                            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
                              <span style={{ padding:"3px 10px", borderRadius:99, fontSize:11, fontWeight:600, background:"#dcfce7", color:"#16a34a" }}>📑 {nbBlocs} partie{nbBlocs!==1?"s":""}</span>
                              {(c.groupe_noms||[]).map(n => (
                                <span key={n} style={{ padding:"3px 10px", borderRadius:99, fontSize:11, fontWeight:700, background:"#dbeafe", color:"#1e40af" }}>🏫 {n}</span>
                              ))}
                              <span style={{ padding:"3px 10px", borderRadius:99, fontSize:11, fontWeight:600, background:"#f1f5f9", color:"#64748b" }}>⏱ {c.dureeEstimee||60} min</span>
                            </div>
                            {verrou ? (
                              /* Nommer le cours bloquant : un cadenas sans raison parait
                                 arbitraire, et l'apprenant ne saurait pas quoi faire pour
                                 l'ouvrir. */
                              /* Trois causes possibles, trois messages. « Publié avant
                                 votre arrivée » ne se répare pas - il n'y a rien à faire,
                                 et le dire évite d'attendre une ouverture qui ne viendra
                                 pas. La séquence, elle, se débloque. */
                              (() => {
                                // `pendant_absence` : publié entre son départ et son retour.
                                // Comme « avant votre arrivée », ce n'est PAS un verrou qui
                                // se lève - d'où le même traitement neutre, et non le jaune
                                // d'un prérequis à remplir.
                                const definitif = c.motif === "avant_arrivee" || c.motif === "pendant_absence";
                                const absence   = c.motif === "pendant_absence";
                                return (
                                  <div style={{ display:"flex", alignItems:"center", gap:8,
                                    background: definitif ? "#f1f5f9" : "#fffbeb",
                                    border:`1px solid ${definitif ? "#cbd5e1" : "#fde68a"}`,
                                    borderRadius:9, padding:"9px 12px" }}>
                                    <span style={{ fontSize:17 }}>{definitif ? "🕓" : "🔒"}</span>
                                    <div style={{ fontSize:11.5, color: definitif ? "#475569" : "#92400e", lineHeight:1.5 }}>
                                      {absence
                                        ? <>Publié <strong>pendant votre interruption</strong> - vous avez repris après ce cours, il ne vous est pas destiné.</>
                                        : definitif
                                        ? <>Publié <strong>avant votre arrivée</strong> dans la classe - ce cours ne vous est pas destiné.</>
                                        : c.bloque_par?.titre
                                        ? <>Terminez d'abord <strong>« {c.bloque_par.titre} »</strong> pour ouvrir ce cours.</>
                                        : <>Ce cours s'ouvrira lorsque le précédent sera terminé.</>}
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              <div style={{ fontSize:11, color: lu ? "#15803d" : tm.couleur, fontWeight:600 }}>
                                {lu ? "✓ Terminé - relire le contenu →" : "Ouvrir le contenu →"}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Pagination ──
                    Le décompte reste affiché même sur une seule page : c'est lui qui dit
                    combien de cours les filtres ont retenus. */}
                {!coursElearningLoading && coursFiltres.length > 0 && (
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap", marginTop:18 }}>
                    <div style={{ fontSize:12.5, color:"#64748b", fontVariantNumeric:"tabular-nums" }}>
                      {coursDebut + 1}–{coursDebut + coursPageVisibles.length} sur <strong style={{ color:"#0f172a" }}>{coursFiltres.length}</strong> cours
                      {coursFiltres.length !== coursElearning.length && <span style={{ color:"#94a3b8" }}> · {coursElearning.length} au total</span>}
                    </div>

                    {coursNbPages > 1 && (
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <BtnPageCours onClick={()=>setCoursPage(1)} disabled={coursPageSure===1}>«</BtnPageCours>
                        <BtnPageCours onClick={()=>setCoursPage(p=>Math.max(1,p-1))} disabled={coursPageSure===1}>‹ Précédent</BtnPageCours>
                        <span style={{ fontSize:12.5, fontWeight:700, color:"#0f172a", padding:"0 6px", fontVariantNumeric:"tabular-nums" }}>
                          {coursPageSure} / {coursNbPages}
                        </span>
                        <BtnPageCours onClick={()=>setCoursPage(p=>Math.min(coursNbPages,p+1))} disabled={coursPageSure===coursNbPages}>Suivant ›</BtnPageCours>
                        <BtnPageCours onClick={()=>setCoursPage(coursNbPages)} disabled={coursPageSure===coursNbPages}>»</BtnPageCours>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* DICTIONNAIRE */}
            {activeTab === "dictionnaire" && (() => {
              return (
              <div>
                <div style={{ fontSize:18, fontWeight:800, color:"#0f172a", marginBottom:4 }}>📘 Dictionnaire Anglais / Français</div>
                <div style={{ fontSize:12, color:"#94a3b8", marginBottom:20 }}>Dictionnaire en temps réel · Définitions, traductions et exemples</div>

                {/* Sélecteur de sens */}
                <div style={{ display:"flex", gap:8, marginBottom:16, background:"#f8fafc", padding:5, borderRadius:10, width:"fit-content" }}>
                  {[["ang_fr","🇬🇧 Anglais → Français"],["fr_ang","🇫🇷 Français → Anglais"]].map(([val,lib]) => (
                    <button key={val} onClick={() => { setDicoSens(val); setDicoQuery(""); setDicoResultat(null); setDicoErreur(""); }}
                      style={{ padding:"8px 18px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:600,
                        background: dicoSens===val ? "#0f172a" : "transparent",
                        color:      dicoSens===val ? "#fff" : "#475569",
                        boxShadow:  dicoSens===val ? "0 2px 8px rgba(0,0,0,0.15)" : "none" }}>
                      {lib}
                    </button>
                  ))}
                </div>

                {/* Formulaire de recherche */}
                <form onSubmit={rechercherMotDico} style={{ display:"flex", gap:10, marginBottom:20 }}>
                  <div style={{ position:"relative", flex:1 }}>
                    <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:16 }}>🔍</span>
                    <input value={dicoQuery} onChange={e => setDicoQuery(e.target.value)}
                      placeholder={dicoSens==="ang_fr" ? "Entrez un mot anglais… ex: beautiful" : "Entrez un mot français… ex: magnifique"}
                      style={{ width:"100%", padding:"13px 44px", borderRadius:12, border:"2px solid #e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box" }} />
                    {dicoQuery && <button type="button" onClick={() => { setDicoQuery(""); setDicoResultat(null); setDicoErreur(""); }} style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", fontSize:18, cursor:"pointer", color:"#94a3b8" }}>×</button>}
                  </div>
                  <button type="submit" disabled={dicoChargement || !dicoQuery.trim()}
                    style={{ padding:"13px 24px", borderRadius:12, border:"none", background: dicoChargement||!dicoQuery.trim() ? "#e2e8f0" : PRIMARY_COLOR, color:"#fff", fontSize:14, fontWeight:700, cursor: dicoChargement||!dicoQuery.trim() ? "not-allowed" : "pointer", flexShrink:0 }}>
                    {dicoChargement ? "⏳" : "Chercher"}
                  </button>
                </form>

                {/* Erreur */}
                {dicoErreur && (
                  <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:10, padding:"12px 16px", marginBottom:20, fontSize:13, color:"#DC2626" }}>
                    ⚠️ {dicoErreur}
                  </div>
                )}

                {/* Résultat */}
                {dicoResultat && (
                  <div style={{ background:"#fff", borderRadius:16, border:"1px solid #e2e8f0", overflow:"hidden", marginBottom:24, boxShadow:"0 4px 20px rgba(0,0,0,0.06)" }}>
                    <div style={{ background:`linear-gradient(135deg,#0f172a,${PRIMARY_COLOR})`, padding:"20px 24px", color:"#fff" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                        <div>
                          <div style={{ fontSize:34, fontWeight:900, marginBottom:4 }}>{dicoResultat.word}</div>
                          {(dicoResultat.phonetics?.find(p=>p.text)?.text) && <div style={{ fontSize:14, color:"rgba(255,255,255,0.6)", marginBottom:8 }}>{dicoResultat.phonetics.find(p=>p.text).text}</div>}
                          {dicoResultat.phonetics?.find(p => p.audio) && (
                            <audio controls src={dicoResultat.phonetics.find(p => p.audio).audio} style={{ height:32, filter:"invert(1) opacity(0.8)" }} />
                          )}
                        </div>
                        {dicoTraduction && (
                          <div style={{ textAlign:"right" }}>
                            <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.06em" }}>🇫🇷 Traduction</div>
                            <div style={{ fontSize:24, fontWeight:800, color:"#FCD34D" }}>{dicoTraduction}</div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ padding:"20px 24px" }}>
                      {(dicoResultat.meanings||[]).map((sig, i) => (
                        <div key={i} style={{ marginBottom:20 }}>
                          <div style={{ display:"inline-block", padding:"4px 12px", borderRadius:20, background:`${PRIMARY_COLOR}15`, color:PRIMARY_COLOR, fontSize:12, fontWeight:700, marginBottom:12 }}>
                            {sig.partOfSpeech}
                          </div>
                          {sig.definitions.slice(0,3).map((def, j) => (
                            <div key={j} style={{ marginBottom:12, paddingLeft:16, borderLeft:`3px solid ${j===0?PRIMARY_COLOR:"#e2e8f0"}` }}>
                              <div style={{ fontSize:13, color:"#0f172a", fontWeight:600, marginBottom:4 }}>{def.definition}</div>
                              {def.example && (
                                <div style={{ fontSize:12, color:"#94a3b8", fontStyle:"italic" }}>📝 "{def.example}"</div>
                              )}
                              {def.synonyms?.length > 0 && (
                                <div style={{ marginTop:6, display:"flex", gap:5, flexWrap:"wrap" }}>
                                  {def.synonyms.slice(0,4).map(s => (
                                    <button key={s} onClick={() => { setDicoQuery(s); setDicoSens("ang_fr"); setTimeout(rechercherMotDico, 0); }}
                                      style={{ padding:"2px 8px", borderRadius:20, background:"#f1f5f9", color:"#475569", fontSize:11, fontWeight:600, border:"none", cursor:"pointer" }}>
                                      {s}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                          {sig.synonyms?.length > 0 && (
                            <div style={{ marginTop:8 }}>
                              <span style={{ fontSize:11, fontWeight:700, color:"#94a3b8" }}>Synonymes : </span>
                              {sig.synonyms.slice(0,5).map(s => (
                                <button key={s} onClick={() => { setDicoQuery(s); setDicoSens("ang_fr"); setTimeout(rechercherMotDico, 0); }}
                                  style={{ margin:"0 4px 4px 0", padding:"3px 10px", borderRadius:20, background:`${PRIMARY_COLOR}12`, color:PRIMARY_COLOR, fontSize:11, fontWeight:600, border:"none", cursor:"pointer" }}>
                                  {s}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Historique + état initial */}
                {!dicoResultat && !dicoChargement && !dicoErreur && (
                  <div style={{ textAlign:"center", padding:"32px 20px", color:"#94a3b8", background:"#f8fafc", borderRadius:16, border:"1px dashed #e2e8f0" }}>
                    <div style={{ fontSize:48, marginBottom:12 }}>📘</div>
                    <div style={{ fontWeight:700, fontSize:15, marginBottom:6, color:"#0f172a" }}>Cherche n'importe quel mot anglais ou français</div>
                    <div style={{ fontSize:13 }}>Définitions, prononciation audio, exemples et traduction en temps réel.</div>
                    {dicoHistorique.length > 0 && (
                      <div style={{ marginTop:20 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>Recherches récentes</div>
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"center" }}>
                          {dicoHistorique.map(h => (
                            <button key={h.mot} onClick={() => { setDicoQuery(h.mot); setDicoSens("ang_fr"); setTimeout(rechercherMotDico, 0); }}
                              style={{ padding:"5px 14px", borderRadius:20, background:"#fff", border:"1px solid #e2e8f0", color:"#0f172a", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                              {h.mot} <span style={{ color:"#94a3b8" }}>· {h.trad}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })()}

            {/* GAMIFICATION */}
            {activeTab === "gamification" && (() => {
              const CAT_LABELS = {
                demarrage: "Démarrage", assiduite: "Assiduité", devoirs: "Devoirs",
                progression: "Progression CECR", social: "Social", sessions_live: "Sessions live",
                minijeux: "Mini-jeux", explorateur: "Explorateur",
              };
              const badgesParCat = {};
              gamifBadges.forEach(b => {
                const cat = b.categorie || "autre";
                if (!badgesParCat[cat]) badgesParCat[cat] = [];
                badgesParCat[cat].push(b);
              });
              const nbObtenus = gamifBadges.filter(b=>b.obtenu).length;
              return (
              <div>
                <div style={{ fontSize:18, fontWeight:800, color:"#0f172a", marginBottom:4 }}>🏆 Gamification</div>
                <div style={{ fontSize:12, color:"#94a3b8", marginBottom:20 }}>Tes points, tes badges débloqués et ton classement</div>

                {gamifLoading ? (
                  <div style={{ display:"flex", justifyContent:"center", alignItems:"center", minHeight:200, fontSize:14, color:"#64748B" }}>⏳ Chargement…</div>
                ) : (
                <>
                  {/* Solde + badges KPI */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:14, marginBottom:24 }}>
                    <div style={{ background:`linear-gradient(135deg,#0f172a,${PRIMARY_COLOR})`, borderRadius:14, padding:"18px 20px", color:"#fff" }}>
                      <div style={{ fontSize:12, opacity:0.75, marginBottom:4 }}>Solde de points</div>
                      <div style={{ fontSize:32, fontWeight:900 }}>{gamifSolde}</div>
                    </div>
                    <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:"18px 20px" }}>
                      <div style={{ fontSize:12, color:"#94a3b8", marginBottom:4 }}>Badges débloqués</div>
                      <div style={{ fontSize:32, fontWeight:900, color:"#0f172a" }}>{nbObtenus}<span style={{ fontSize:16, color:"#94a3b8", fontWeight:700 }}> / {gamifBadges.length}</span></div>
                    </div>
                  </div>

                  {/* Badges de fidélité - un par mois d'ancienneté (1 à 24), distincts des badges
                      gamification ci-dessus. Défilement horizontal, cliquer ouvre le détail. */}
                  {badgesFidelite.length > 0 && (
                    <div style={{ marginBottom:28 }}>
                      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:10 }}>
                        <div style={{ fontSize:14, fontWeight:800, color:"#0f172a" }}>🏅 Badges de fidélité</div>
                        <div style={{ fontSize:11, color:"#94a3b8" }}>{ancienneteMois} mois avec BET · {badgesFidelite.filter(b=>b.obtenu).length}/{badgesFidelite.length} débloqués</div>
                      </div>
                      <div style={{ display:"flex", gap:12, overflowX:"auto", paddingBottom:6 }}>
                        {badgesFidelite.map(b => (
                          <div key={b.id} onClick={() => b.obtenu && setBadgeFideliteOuvert(b)}
                            style={{ flexShrink:0, width:110, cursor: b.obtenu ? "pointer" : "default" }}
                            title={b.obtenu ? `${b.mois}e mois - cliquer pour voir` : `${b.mois}e mois - pas encore atteint`}>
                            <div style={{ width:110, height:132, borderRadius:12, overflow:"hidden", border:`2px solid ${b.obtenu?"#eab308":"#e2e8f0"}`, position:"relative", background:"#0c0a09" }}>
                              <img src={b.image_url} alt={`${b.mois}e mois`} style={{ width:"100%", height:"100%", objectFit:"cover", filter: b.obtenu ? "none" : "grayscale(1) brightness(0.5)" }} />
                              {!b.obtenu && (
                                <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>🔒</div>
                              )}
                              {b.obtenu && b.type_recompense !== "aucune" && (
                                <div style={{ position:"absolute", top:4, right:4, fontSize:14 }}>{b.type_recompense === "gratuit" ? "🎁" : "🏷️"}</div>
                              )}
                            </div>
                            <div style={{ textAlign:"center", fontSize:11, fontWeight:700, color: b.obtenu?"#0f172a":"#cbd5e1", marginTop:4 }}>Mois {b.mois}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Historique des points */}
                  <div style={{ fontSize:14, fontWeight:800, color:"#0f172a", marginBottom:10 }}>📜 Historique des points</div>
                  {gamifTx.length===0 ? (
                    <div style={{ textAlign:"center", padding:"24px 0", color:"#94a3b8", fontSize:13, background:"#f8fafc", borderRadius:12, marginBottom:28 }}>Aucune transaction pour le moment.</div>
                  ) : (
                    <div style={{ border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden", marginBottom:28, maxHeight:260, overflowY:"auto" }}>
                      {gamifTx.map((t,i) => (
                        <div key={t.id||i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, padding:"10px 16px", borderBottom: i<gamifTx.length-1 ? "1px solid #f1f5f9" : "none" }}>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600, color:"#0f172a" }}>{t.description || t.source_type}</div>
                            <div style={{ fontSize:11, color:"#94a3b8" }}>{t.created_at ? new Date(t.created_at).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}) : ""}</div>
                          </div>
                          <div style={{ fontSize:14, fontWeight:800, color: t.points>=0 ? "#16a34a" : "#dc2626", flexShrink:0 }}>{t.points>=0?"+":""}{t.points}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Badges */}
                  <div style={{ fontSize:14, fontWeight:800, color:"#0f172a", marginBottom:14 }}>🎖️ Badges</div>
                  {Object.keys(badgesParCat).length===0 ? (
                    <div style={{ textAlign:"center", padding:"24px 0", color:"#94a3b8", fontSize:13, background:"#f8fafc", borderRadius:12, marginBottom:28 }}>Aucun badge disponible pour le moment.</div>
                  ) : Object.entries(badgesParCat).map(([cat, badges]) => (
                    <div key={cat} style={{ marginBottom:24 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>
                        {CAT_LABELS[cat] || cat} <span style={{ fontWeight:400 }}>· {badges.filter(b=>b.obtenu).length}/{badges.length}</span>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12 }}>
                        {badges.map(b => (
                          <div key={b.id} style={{ background: b.obtenu ? "#fff" : "#f8fafc", border:`1px solid ${b.obtenu?"#fde68a":"#e2e8f0"}`, borderRadius:14, padding:16, opacity: b.obtenu?1:0.6, display:"flex", flexDirection:"column", gap:8 }}>
                            <div style={{ fontSize:28, width:48, height:48, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", background: b.obtenu ? "#fef3c7" : "#f1f5f9" }}>
                              {b.obtenu ? (b.icone||"🏅") : "🔒"}
                            </div>
                            <div style={{ fontSize:14, fontWeight:700, color:"#0f172a" }}>{b.nom}</div>
                            <div style={{ fontSize:12, color:"#94a3b8", lineHeight:1.5, flex:1 }}>{b.description}</div>
                            {b.obtenu && b.obtenu_le && (
                              <div style={{ fontSize:10, color:"#16a34a", fontWeight:700 }}>Débloqué le {new Date(b.obtenu_le).toLocaleDateString("fr-FR")}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Classement du groupe */}
                  <div style={{ fontSize:14, fontWeight:800, color:"#0f172a", marginBottom:10, marginTop:8 }}>🏅 Classement de mon groupe</div>
                  {!monGroupeId ? (
                    <div style={{ textAlign:"center", padding:"24px 0", color:"#94a3b8", fontSize:13, background:"#f8fafc", borderRadius:12 }}>Le classement est disponible une fois rattaché à un groupe.</div>
                  ) : gamifClassement.length===0 ? (
                    <div style={{ textAlign:"center", padding:"24px 0", color:"#94a3b8", fontSize:13, background:"#f8fafc", borderRadius:12 }}>Pas encore de classement pour ton groupe.</div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {gamifClassement.map(r => {
                        const cestMoi = r.id === monUtilisateurId;
                        return (
                          <div key={r.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:10, background: r.rang===1 ? "#fef3c7" : cestMoi ? `${PRIMARY_COLOR}15` : "#f8fafc", border: cestMoi ? `1.5px solid ${PRIMARY_COLOR}` : "1px solid #e2e8f0" }}>
                            <div style={{ width:26, height:26, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, background: r.rang===1 ? "#F0B84B" : "#fff", color: r.rang===1 ? "#1a1400" : "#64748b", flexShrink:0 }}>
                              {r.rang}
                            </div>
                            <div style={{ flex:1, fontSize:13, color:"#0f172a", fontWeight: cestMoi?700:500 }}>{r.nom_complet}{cestMoi && <span style={{ color:PRIMARY_COLOR }}> (toi)</span>}</div>
                            <div style={{ fontSize:13, fontWeight:800, color:"#0f172a" }}>{r.points} pts</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
                )}
              </div>
              );
            })()}

            {/* MES PRÉSENCES */}
            {activeTab === "presences" && (() => {
              const presences = appPresences || [];
              const total     = presences.length;
              const nbPresent = presences.filter(p => p.statut === "present").length;
              const nbAbsent  = presences.filter(p => p.statut === "absent").length;
              const nbRetard  = presences.filter(p => p.statut === "retard").length;
              const nbExcuse  = presences.filter(p => p.statut === "excuse").length;
              const nbLive    = presences.filter(p => p.source === "session_live").length;
              const taux      = total > 0 ? Math.round((nbPresent / total) * 100) : null;
              const tauxAbs   = total > 0 ? Math.round((nbAbsent  / total) * 100) : null;

              const STATUT_CFG = {
                present: { label:"Présent",   bg:"#dcfce7", c:"#166534", icon:"✅" },
                absent:  { label:"Absent",    bg:"#fee2e2", c:"#991b1b", icon:"❌" },
                retard:  { label:"En retard", bg:"#fef3c7", c:"#92400e", icon:"⏰" },
                excuse:  { label:"Excusé",    bg:"#dbeafe", c:"#1e40af", icon:"📝" },
              };

              return (
                <div>
                  {/* Header */}
                  <div style={{ marginBottom:24 }}>
                    <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>✅ Mes Présences</h2>
                    <p style={{ margin:"4px 0 0", fontSize:12, color:"#9ca3af" }}>
                      Historique de vos présences enregistrées par votre coach
                    </p>
                  </div>

                  {appPresencesLoading ? (
                    <div style={{ textAlign:"center", padding:"60px 0", color:"#9ca3af", fontSize:13 }}>Chargement…</div>
                  ) : total === 0 ? (
                    <div style={{ textAlign:"center", padding:"60px 0", color:"#9ca3af" }}>
                      <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
                      <div style={{ fontSize:14, fontWeight:600, marginBottom:6 }}>Aucune séance enregistrée</div>
                      <div style={{ fontSize:12 }}>Vos présences apparaîtront ici dès que votre coach commencera les cours.</div>
                    </div>
                  ) : (
                    <>
                      {/* KPIs */}
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12, marginBottom:24 }}>
                        {[
                          { label:"Séances total",      value:total,    color:"#0f172a",  bg:"#f8fafc",  icon:"📅" },
                          { label:"Taux de présence",   value:taux !== null ? `${taux}%` : "-", color: taux >= 80 ? "#059669" : taux >= 60 ? "#d97706" : "#dc2626", bg: taux >= 80 ? "#f0fdf4" : taux >= 60 ? "#fffbeb" : "#fff5f5", icon:"📈" },
                          { label:"Présences",          value:nbPresent, color:"#059669", bg:"#f0fdf4",  icon:"✅" },
                          { label:"Absences",           value:nbAbsent,  color:"#dc2626", bg:"#fff5f5",  icon:"❌" },
                          { label:"Retards",            value:nbRetard,  color:"#d97706", bg:"#fffbeb",  icon:"⏰" },
                          { label:"Excusés",            value:nbExcuse,  color:"#2563eb", bg:"#eff6ff",  icon:"📝" },
                          ...(nbLive > 0 ? [{ label:"Sessions Live", value:nbLive, color:"#0369a1", bg:"#e0f2fe", icon:"📡" }] : []),
                        ].map(k => (
                          <div key={k.label} style={{ background:k.bg, borderRadius:12, padding:"16px 18px", border:"1px solid #e5e7eb", display:"flex", alignItems:"center", gap:12 }}>
                            <span style={{ fontSize:24 }}>{k.icon}</span>
                            <div>
                              <div style={{ fontSize:22, fontWeight:900, color:k.color }}>{k.value}</div>
                              <div style={{ fontSize:11, color:"#9ca3af", fontWeight:600, textTransform:"uppercase", letterSpacing:".04em" }}>{k.label}</div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Barre visuelle taux de présence */}
                      {taux !== null && (
                        <div style={{ marginBottom:24, background:"#fff", borderRadius:12, padding:"16px 20px", border:"1px solid #e5e7eb" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                            <span style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>Taux de présence global</span>
                            <span style={{ fontSize:16, fontWeight:900, color: taux >= 80 ? "#059669" : taux >= 60 ? "#d97706" : "#dc2626" }}>{taux}%</span>
                          </div>
                          <div style={{ height:10, borderRadius:99, background:"#f1f5f9", overflow:"hidden" }}>
                            <div style={{ height:"100%", width:`${taux}%`, borderRadius:99, background: taux >= 80 ? "linear-gradient(90deg,#22c55e,#059669)" : taux >= 60 ? "linear-gradient(90deg,#fbbf24,#d97706)" : "linear-gradient(90deg,#f87171,#dc2626)", transition:"width .5s" }} />
                          </div>
                          {nbAbsent >= 3 && (
                            <div style={{ marginTop:10, fontSize:12, color:"#dc2626", fontWeight:700, background:"#fff5f5", borderRadius:8, padding:"8px 12px", border:"1px solid #fecaca" }}>
                              ⚠️ Vous avez {nbAbsent} absence{nbAbsent > 1 ? "s" : ""} enregistrée{nbAbsent > 1 ? "s" : ""}. Contactez votre coach si nécessaire.
                            </div>
                          )}
                        </div>
                      )}

                      {/* Liste chronologique */}
                      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", overflow:"hidden" }}>
                        <div style={{ padding:"12px 18px", background:"#f8fafc", borderBottom:"1px solid #f1f5f9", fontWeight:700, fontSize:12, color:"#6b7280", textTransform:"uppercase", letterSpacing:".05em" }}>
                          Historique des séances
                        </div>
                        <div style={{ display:"flex", flexDirection:"column" }}>
                          {[...presences].sort((a,b) => (b.date_seance||"").localeCompare(a.date_seance||"")).map((p, i) => {
                            const st = STATUT_CFG[p.statut] || { label:p.statut, bg:"#f3f4f6", c:"#374151", icon:"•" };
                            /* « Session live » ne voulait dire qu'une chose ici : la présence
                               vient d'une session programmée. Or une séance EN SALLE est elle
                               aussi programmée de cette façon : l'apprenant lisait « Session
                               Live » sur des cours qu'il avait suivis en présentiel.
                               `plateforme` tranche : « presentiel », ou le service de visio. */
                            const issueSession = p.source === "session_live";
                            const enSalle = p.plateforme === "presentiel";
                            const seance = !issueSession ? null
                              : enSalle
                                ? { label:"Séance présentielle", icone:"🏢", bg:"#dcfce7", c:"#15803d", pastille:"#bbf7d0", bord:"#16a34a", fond:"#f0fdf4" }
                                : { label:"Session live", icone:"📡", bg:"#e0f2fe", c:"#0369a1", pastille:"#bae6fd", bord:"#0ea5e9", fond:"#f0f9ff" };
                            return (
                              <div key={p.id || i} style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 18px", borderBottom: i < presences.length - 1 ? "1px solid #f8fafc" : "none", background: seance ? seance.fond : i % 2 === 0 ? "#fff" : "#fafafa" }}>
                                <div style={{ width:38, height:38, borderRadius:"50%", background: seance ? seance.pastille : st.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0, border:`1px solid ${seance ? seance.bord : st.c}20` }}>
                                  {seance ? seance.icone : st.icon}
                                </div>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontWeight:700, color:"#0f172a", fontSize:13, display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
                                    {p.date_seance
                                      ? new Date(p.date_seance).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" })
                                      : "-"}
                                    {seance && (
                                      <span title={p.session_titre || ""} style={{ padding:"1px 7px", borderRadius:8, fontSize:10, fontWeight:700, background:seance.bg, color:seance.c }}>
                                        {seance.icone} {seance.label}
                                      </span>
                                    )}
                                  </div>
                                  {p.note && <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>📝 {p.note}</div>}
                                </div>
                                <span style={{ padding:"4px 12px", borderRadius:99, background:st.bg, color:st.c, fontSize:12, fontWeight:700, whiteSpace:"nowrap" }}>
                                  {st.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* NOTIFICATIONS APPRENANT */}
            {activeTab === "notifications_appr" && (
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                  <div>
                    <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>🔔 Mes Notifications</h2>
                    <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>{appNotifs.length} notification{appNotifs.length!==1?"s":""} · {appNotifsNonLus} non lue{appNotifsNonLus!==1?"s":""}</p>
                  </div>
                  {appNotifsNonLus > 0 && (
                    <button onClick={markAllAppNotifsRead}
                      style={{ padding:"8px 16px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:700 }}>
                      Tout marquer comme lu
                    </button>
                  )}
                </div>
                {appNotifsLoading && <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>Chargement…</div>}
                {!appNotifsLoading && appNotifs.length === 0 && (
                  <div style={{ textAlign:"center", padding:48, background:"#f8fafc", borderRadius:12, border:"1px dashed #e5e7eb", color:"#9ca3af" }}>
                    <div style={{ fontSize:36, marginBottom:10 }}>🔔</div>
                    <div style={{ fontWeight:600, color:"#374151", marginBottom:4 }}>Aucune notification</div>
                    <div style={{ fontSize:12 }}>Vous serez notifié dès qu'un nouveau contenu est publié pour votre classe.</div>
                  </div>
                )}
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {appNotifs.map(n => {
                    const NOTIF_ICONS = {
                      evaluation:"📝", cours:"📚", cours_publie:"📚",
                      assignation:"🎯", inscription:"🎉",
                      suspension:"⛔", reinstatement:"✅",
                      alerte:"⚠️", info:"ℹ️", absence_repetee:"📅",
                      correction:"✅", retrait:"📤", transfert:"🔄",
                    };
                    const icone = NOTIF_ICONS[n.type] || "🔔";
                    const hasAction = n.meta?.eval_id || n.meta?.cours_id || n.meta?.groupe_id;
                    return (
                      <div key={n.id}
                        onClick={() => { markAppNotifRead(n.id); setNotifModal(n); }}
                        style={{ display:"flex", gap:14, padding:"14px 18px", background: n.lu ? "#fff" : `${PRIMARY_COLOR}08`, border:`1.5px solid ${n.lu?"#e5e7eb":PRIMARY_COLOR+"30"}`, borderRadius:12, cursor:"pointer", transition:"background .15s" }}
                        onMouseEnter={e => e.currentTarget.style.background=n.lu?"#f8fafc":`${PRIMARY_COLOR}12`}
                        onMouseLeave={e => e.currentTarget.style.background=n.lu?"#fff":`${PRIMARY_COLOR}08`}>
                        <div style={{ width:42, height:42, borderRadius:10, background: n.lu ? "#f1f5f9" : `${PRIMARY_COLOR}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
                          {icone}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                            <div style={{ fontWeight: n.lu ? 600 : 800, fontSize:13, color:"#0f172a" }}>{n.titre}</div>
                            {!n.lu && <span style={{ padding:"2px 8px", borderRadius:99, fontSize:10, fontWeight:800, background:PRIMARY_COLOR, color:"#fff", flexShrink:0 }}>Nouveau</span>}
                          </div>
                          {n.message && <div style={{ fontSize:12, color:"#6b7280", marginTop:3, lineHeight:1.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{n.message}</div>}
                          <div style={{ fontSize:11, color:"#9ca3af", marginTop:5, display:"flex", gap:10, alignItems:"center" }}>
                            <span>{n.created_at ? new Date(n.created_at).toLocaleString("fr-FR", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }) : ""}</span>
                            {hasAction && <span style={{ color:PRIMARY_COLOR, fontWeight:600 }}>Cliquer pour voir les détails →</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ══ Modal détail notification ══ */}
            {notifModal && (()=>{
              const n = notifModal;
              const NOTIF_CONFIG = {
                evaluation:     { icone:"📝", couleur:"#0891b2", libType:"Devoir / Évaluation",  tabCible:"examens" },
                cours:          { icone:"📚", couleur:"#059669", libType:"Cours",                 tabCible:"cours" },
                cours_publie:   { icone:"📚", couleur:"#059669", libType:"Cours",                 tabCible:"cours" },
                assignation:    { icone:"🎯", couleur:"#7c3aed", libType:"Assignation",           tabCible:null },
                inscription:    { icone:"🎉", couleur:"#10b981", libType:"Inscription",           tabCible:null },
                suspension:     { icone:"⛔", couleur:"#dc2626", libType:"Accès",                 tabCible:null },
                reinstatement:  { icone:"✅", couleur:"#059669", libType:"Accès rétabli",         tabCible:null },
                alerte:         { icone:"⚠️", couleur:"#f59e0b", libType:"Alerte",                tabCible:null },
                correction:     { icone:"✅", couleur:"#059669", libType:"Correction",            tabCible:"examens" },
                absence_repetee:{ icone:"📅", couleur:"#f59e0b", libType:"Absence",               tabCible:"planning" },
                info:           { icone:"ℹ️", couleur:"#6366f1", libType:"Information",           tabCible:null },
              };
              const cfg = NOTIF_CONFIG[n.type] || { icone:"🔔", couleur:PRIMARY_COLOR, libType:"Notification", tabCible:null };
              const dateStr = n.created_at ? new Date(n.created_at).toLocaleString("fr-FR", { weekday:"long", day:"2-digit", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "";

              const handleAction = () => {
                setNotifModal(null);
                if (cfg.tabCible) setActiveTab(cfg.tabCible);
              };

              return (
                <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.65)", zIndex:4000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setNotifModal(null)}>
                  <div style={{ background:"#fff", borderRadius:20, width:"min(94vw,640px)", maxHeight:"85vh", overflow:"hidden", boxShadow:"0 24px 64px rgba(0,0,0,0.3)", display:"flex", flexDirection:"column" }} onClick={e=>e.stopPropagation()}>

                    {/* Header coloré */}
                    <div style={{ background:`linear-gradient(135deg,${cfg.couleur},${cfg.couleur}cc)`, padding:"22px 24px 18px", position:"relative", flexShrink:0 }}>
                      <button onClick={()=>setNotifModal(null)} style={{ position:"absolute", top:14, right:14, background:"rgba(255,255,255,0.2)", border:"none", color:"#fff", borderRadius:8, width:30, height:30, fontSize:16, cursor:"pointer" }}>✕</button>
                      <div style={{ fontSize:36, marginBottom:10 }}>{cfg.icone}</div>
                      <div style={{ fontSize:10, color:"rgba(255,255,255,0.65)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>{cfg.libType}</div>
                      <div style={{ fontSize:16, fontWeight:800, color:"#fff", lineHeight:1.3 }}>{n.titre}</div>
                      {!n.lu && <span style={{ display:"inline-block", marginTop:8, padding:"2px 10px", borderRadius:99, fontSize:10, fontWeight:800, background:"rgba(255,255,255,0.25)", color:"#fff" }}>Nouveau</span>}
                    </div>

                    {/* Corps */}
                    <div style={{ padding:"20px 24px", overflowY:"auto", minHeight:0 }}>
                      {/* Message complet */}
                      {n.message && (
                        <div style={{ fontSize:14, color:"#374151", lineHeight:1.65, marginBottom:18, padding:"14px 16px", background:"#f8fafc", borderRadius:10, border:"1px solid #e5e7eb", wordBreak:"break-word", overflowWrap:"anywhere" }}>
                          {n.message}
                        </div>
                      )}

                      {/* Métadonnées */}
                      <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:12, color:"#6b7280" }}>
                          <span style={{ width:20, textAlign:"center" }}>🕐</span>
                          <span>{dateStr}</span>
                        </div>
                        {n.meta?.groupe_nom && (
                          <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:12, color:"#6b7280" }}>
                            <span style={{ width:20, textAlign:"center" }}>👥</span>
                            <span>Groupe : <strong style={{ color:"#374151" }}>{n.meta.groupe_nom}</strong></span>
                          </div>
                        )}
                        {n.meta?.eval_titre && (
                          <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:12, color:"#6b7280" }}>
                            <span style={{ width:20, textAlign:"center" }}>📋</span>
                            <span><strong style={{ color:"#374151" }}>{n.meta.eval_titre}</strong></span>
                          </div>
                        )}
                        {n.meta?.date_limite && (
                          <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:12, color:"#6b7280" }}>
                            <span style={{ width:20, textAlign:"center" }}>⏳</span>
                            <span>À rendre avant le <strong style={{ color:"#dc2626" }}>{new Date(n.meta.date_limite+"T00:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"2-digit",month:"long"})}</strong></span>
                          </div>
                        )}
                        {n.meta?.note !== undefined && n.meta?.note !== null && (
                          <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:12, color:"#6b7280" }}>
                            <span style={{ width:20, textAlign:"center" }}>🏅</span>
                            <span>Note : <strong style={{ fontSize:16, color:n.meta.note>=10?"#059669":"#dc2626" }}>{n.meta.note}/{n.meta.note_max||20}</strong></span>
                          </div>
                        )}
                        {n.meta?.commentaire_coach && (
                          <div style={{ display:"flex", alignItems:"flex-start", gap:10, fontSize:12, color:"#6b7280" }}>
                            <span style={{ width:20, textAlign:"center", flexShrink:0 }}>💬</span>
                            <span style={{ fontStyle:"italic", color:"#374151" }}>"{n.meta.commentaire_coach}"</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display:"flex", gap:10 }}>
                        <button onClick={()=>setNotifModal(null)} style={{ flex:1, padding:"10px", borderRadius:10, border:"1px solid #e5e7eb", background:"#fff", color:"#374151", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                          Fermer
                        </button>
                        {cfg.tabCible && (
                          <button onClick={handleAction} style={{ flex:2, padding:"10px", borderRadius:10, border:"none", background:cfg.couleur, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                            {n.type==="evaluation"||n.type==="correction" ? "📝 Voir mes devoirs" : n.type==="cours"||n.type==="cours_publie" ? "📚 Voir les cours" : n.type==="absence_repetee" ? "📅 Voir le planning" : "→ Accéder"}
                          </button>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              );
            })()}

            {/* ══ Modal détail badge de fidélité ══ */}
            {badgeFideliteOuvert && (
              <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.75)", zIndex:4000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setBadgeFideliteOuvert(null)}>
                <div style={{ background:"#0c0a09", borderRadius:20, width:"min(94vw,420px)", overflow:"hidden", boxShadow:"0 24px 64px rgba(0,0,0,0.4)" }} onClick={e=>e.stopPropagation()}>
                  <div style={{ position:"relative" }}>
                    <img src={badgeFideliteOuvert.image_url} alt={`${badgeFideliteOuvert.mois}e mois`} style={{ width:"100%", display:"block" }} />
                    <button onClick={()=>setBadgeFideliteOuvert(null)} style={{ position:"absolute", top:14, right:14, background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", borderRadius:8, width:32, height:32, fontSize:16, cursor:"pointer" }}>✕</button>
                  </div>
                  <div style={{ padding:"20px 22px" }}>
                    <div style={{ fontSize:13, color:"#e5e7eb", lineHeight:1.6 }}>{badgeFideliteOuvert.message}</div>
                    {badgeFideliteOuvert.type_recompense !== "aucune" && (
                      <div style={{ marginTop:14, padding:"10px 14px", borderRadius:10, background: badgeFideliteOuvert.type_recompense==="gratuit" ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)", border:`1px solid ${badgeFideliteOuvert.type_recompense==="gratuit"?"#22c55e":"#eab308"}`, fontSize:12, fontWeight:700, color: badgeFideliteOuvert.type_recompense==="gratuit" ? "#4ade80" : "#facc15", textAlign:"center" }}>
                        {badgeFideliteOuvert.type_recompense==="gratuit" ? "🎁 Ce mois est gratuit pour vous !" : `🏷️ ${badgeFideliteOuvert.valeur_recompense||""} de réduction ce mois`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* PLANNING - dynamique selon le type de coaching */}
            {activeTab === "planning" && (() => {
              const now = new Date();

              // ── COACHING GROUPE : cours de groupe ──────────────────────
              if (isCoachingGroupe) {
                const cours = groupeCours || [];
                const futurs = cours.filter(c => new Date(c.date_cours) >= now);
                const passes = cours.filter(c => new Date(c.date_cours) < now);
                const debutSemaine = new Date();
                debutSemaine.setDate(debutSemaine.getDate() - debutSemaine.getDay() + 1 + semaineCourante * 7);

                return (
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                      <div>
                        <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>Planning de la classe</h2>
                        {groupeCoursInfo && (
                          <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>
                            {groupeCoursInfo.nom} · {groupeCoursInfo.niveau} · Coach : {groupeCoursInfo.utilisateurs ? `${groupeCoursInfo.utilisateurs.prenom} ${groupeCoursInfo.utilisateurs.nom}` : "-"}
                          </p>
                        )}
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={()=>setSemaine(s=>Math.max(0,s-1))} disabled={semaineCourante===0} style={{ padding:"7px 12px", background:"#e5e7eb", color:"#374151", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 }}>← Préc.</button>
                        <span style={{ padding:"7px 14px", background:PRIMARY_LIGHT, color:PRIMARY_COLOR, borderRadius:6, fontWeight:600, fontSize:12 }}>{semaineCourante === 0 ? "Semaine courante" : `Semaine +${semaineCourante}`}</span>
                        <button onClick={()=>setSemaine(s=>s+1)} style={{ padding:"7px 12px", background:"#e5e7eb", color:"#374151", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 }}>Suiv. →</button>
                      </div>
                    </div>

                    {/* Horaires récurrents du groupe */}
                    {groupeCoursInfo?.horaire?.length > 0 && (
                      <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:10, padding:"12px 16px", marginBottom:20, display:"flex", flexWrap:"wrap", gap:8 }}>
                        <span style={{ fontSize:12, fontWeight:700, color:"#0369a1", width:"100%", marginBottom:4 }}>🕐 Créneaux habituels</span>
                        {groupeCoursInfo.horaire.map((h, i) => (
                          <span key={i} style={{ padding:"4px 10px", background:"#e0f2fe", borderRadius:20, fontSize:12, fontWeight:600, color:"#0369a1" }}>
                            {h.jour} {h.debut}{h.fin ? ` – ${h.fin}` : ""}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Grille semaine */}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:6, marginBottom:24 }}>
                      {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map((j, i) => {
                        const d = new Date(debutSemaine); d.setDate(d.getDate() + i);
                        const dateStr = d.toISOString().split("T")[0];
                        const isToday = dateStr === new Date().toISOString().split("T")[0];
                        const coursJour = cours.filter(c => (c.date_cours || "").startsWith(dateStr));
                        const liveJour = sessionsLiveVisibles.filter(s => s.date === dateStr);
                        return (
                          <div key={j} style={{ minHeight:72, padding:"8px 6px", borderRadius:8, background: isToday ? PRIMARY_LIGHT : "#f8fafc", border:`1.5px solid ${isToday ? PRIMARY_COLOR : "#e5e7eb"}` }}>
                            <div style={{ fontSize:10, fontWeight:800, color: isToday ? PRIMARY_COLOR : "#9ca3af", marginBottom:4 }}>{j} {d.getDate()}</div>
                            {coursJour.map((c, ci) => (
                              <div key={ci} style={{ fontSize:9, padding:"2px 5px", borderRadius:4, background:"#dcfce7", color:"#166534", marginBottom:2, lineHeight:1.4, fontWeight:600 }}>
                                {c.objectif ? c.objectif.substring(0, 14) : "Cours"}
                              </div>
                            ))}
                            {liveJour.map((s, si) => (
                              <div key={si} style={{ fontSize:9, padding:"2px 5px", borderRadius:4, background: s.plateforme==="presentiel"?"#d1fae5":"#dbeafe", color: s.plateforme==="presentiel"?"#065f46":"#1d4ed8", marginBottom:2, lineHeight:1.4, fontWeight:600 }}>
                                {s.plateforme==="presentiel"?"🏢":"📡"} {s.titre?.slice(0,12)}
                              </div>
                            ))}
                            {!coursJour.length && !liveJour.length && <div style={{ fontSize:9, color:"#d1d5db", marginTop:4 }}>-</div>}
                          </div>
                        );
                      })}
                    </div>

                    {/* Sessions live - avec filtres date + statut + pagination */}
                    {(() => {
                      const now = new Date();
                      const allLive = sessionsLiveVisibles;
                      const liveFiltrees = allLive
                        .filter(s => {
                          const dt = new Date(`${s.date}T${s.heure}`);
                          if (planningDateFrom && s.date < planningDateFrom) return false;
                          if (planningDateTo   && s.date > planningDateTo)   return false;
                          if (planningLiveFil === "a_venir"  && (s.statut === "terminee" || dt < now)) return false;
                          if (planningLiveFil === "terminee" && s.statut !== "terminee" && dt >= now)  return false;
                          return true;
                        })
                        .sort((a,b) => new Date(`${a.date}T${a.heure}`) - new Date(`${b.date}T${b.heure}`));
                      const totalPages = Math.ceil(liveFiltrees.length / PLANNING_PER_PAGE);
                      const pageLive = liveFiltrees.slice((planningPage-1)*PLANNING_PER_PAGE, planningPage*PLANNING_PER_PAGE);

                      if (allLive.length === 0) return null;
                      return (
                        <>
                          <h3 style={{ fontSize:13, fontWeight:700, color:"#1d4ed8", marginBottom:10 }}>📡 Sessions live</h3>

                          {/* Filtres */}
                          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12, alignItems:"center" }}>
                            <input type="date" value={planningDateFrom} onChange={e=>{ setPlanningDateFrom(e.target.value); setPlanningPage(1); }}
                              style={{ padding:"6px 10px", border:"1px solid #e5e7eb", borderRadius:6, fontSize:12 }} placeholder="Du" />
                            <input type="date" value={planningDateTo} onChange={e=>{ setPlanningDateTo(e.target.value); setPlanningPage(1); }}
                              style={{ padding:"6px 10px", border:"1px solid #e5e7eb", borderRadius:6, fontSize:12 }} placeholder="Au" />
                            {["tous","a_venir","terminee"].map(f => (
                              <button key={f} onClick={()=>{ setPlanningLiveFil(f); setPlanningPage(1); }}
                                style={{ padding:"6px 12px", borderRadius:20, border:"1px solid", fontSize:12, cursor:"pointer", fontWeight:planningLiveFil===f?700:400,
                                  background:planningLiveFil===f?"#1d4ed8":"#fff", color:planningLiveFil===f?"#fff":"#6b7280",
                                  borderColor:planningLiveFil===f?"#1d4ed8":"#e5e7eb" }}>
                                {f==="tous"?"Toutes":f==="a_venir"?"À venir":"Terminées"}
                              </button>
                            ))}
                            {(planningDateFrom||planningDateTo||planningLiveFil!=="tous") && (
                              <button onClick={()=>{ setPlanningDateFrom(""); setPlanningDateTo(""); setPlanningLiveFil("tous"); setPlanningPage(1); }}
                                style={{ padding:"6px 10px", borderRadius:6, border:"1px solid #fca5a5", background:"#fef2f2", color:"#dc2626", fontSize:12, cursor:"pointer" }}>✕ Réinitialiser</button>
                            )}
                          </div>

                          {pageLive.length === 0 && (
                            <div style={{ textAlign:"center", padding:24, color:"#9ca3af", fontSize:13 }}>Aucune session correspondant aux filtres</div>
                          )}

                          {pageLive.map((s, i) => {
                            const isPresent = s.plateforme === "presentiel";
                            const isPast = new Date(`${s.date}T${s.heure}`) < new Date();
                            return (
                              <div key={s.id || i} style={{ display:"flex", gap:12, padding:"12px 16px", borderRadius:10, border:`1px solid ${isPresent?"#6ee7b7":"#93c5fd"}`, background: isPresent?"#f0fdf4":"#eff6ff", marginBottom:8 }}>
                                <div style={{ textAlign:"center", padding:"6px 10px", borderRadius:8, background: isPresent?"#d1fae5":"#dbeafe", flexShrink:0 }}>
                                  <div style={{ fontSize:18 }}>{isPresent?"🏢":"📡"}</div>
                                </div>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{s.titre}</div>
                                  <div style={{ fontSize:11, color:"#6b7280", marginTop:2, display:"flex", gap:10, flexWrap:"wrap" }}>
                                    <span>📅 {new Date(s.date).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})}</span>
                                    <span>🕐 {s.heure}</span>
                                    {s.duree && <span>⏱ {s.duree} min</span>}
                                  </div>
                                  {s.notes && <div style={{ fontSize:11, color:"#6b7280", marginTop:3, fontStyle:"italic" }}>💬 {s.notes}</div>}
                                </div>
                                <div style={{ display:"flex", flexDirection:"column", gap:6, justifyContent:"center" }}>
                                  <span style={{ padding:"3px 10px", borderRadius:10, fontSize:11, fontWeight:700, background: s.statut==="terminee"?"#f1f5f9": isPast?"#fef3c7":"#dcfce7", color: s.statut==="terminee"?"#64748b": isPast?"#92400e":"#065f46", whiteSpace:"nowrap" }}>
                                    {s.statut==="terminee" ? "🔒 Clôturée" : isPast ? "Passée" : "✅ À venir"}
                                  </span>
                                </div>
                              </div>
                            );
                          })}

                          {/* Pagination */}
                          {totalPages > 1 && (
                            <div style={{ display:"flex", justifyContent:"center", gap:6, marginTop:12 }}>
                              <button disabled={planningPage===1} onClick={()=>setPlanningPage(p=>p-1)} style={{ padding:"6px 12px", borderRadius:6, border:"1px solid #e5e7eb", background:planningPage===1?"#f9fafb":"#fff", cursor:planningPage===1?"not-allowed":"pointer", fontSize:12 }}>← Préc.</button>
                              {Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
                                <button key={p} onClick={()=>setPlanningPage(p)} style={{ padding:"6px 10px", borderRadius:6, border:"1px solid", fontSize:12, cursor:"pointer", fontWeight:p===planningPage?700:400, background:p===planningPage?"#1d4ed8":"#fff", color:p===planningPage?"#fff":"#374151", borderColor:p===planningPage?"#1d4ed8":"#e5e7eb" }}>{p}</button>
                              ))}
                              <button disabled={planningPage===totalPages} onClick={()=>setPlanningPage(p=>p+1)} style={{ padding:"6px 12px", borderRadius:6, border:"1px solid #e5e7eb", background:planningPage===totalPages?"#f9fafb":"#fff", cursor:planningPage===totalPages?"not-allowed":"pointer", fontSize:12 }}>Suiv. →</button>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {groupeCoursLoading ? (
                      <div style={{ textAlign:"center", padding:30, color:"#9ca3af" }}>⏳ Chargement…</div>
                    ) : cours.length === 0 ? (
                      <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>
                        <div style={{ fontSize:36, marginBottom:10 }}>📅</div>
                        <div style={{ fontWeight:700, marginBottom:6 }}>Aucun cours enregistré</div>
                        <div style={{ fontSize:12 }}>L'historique des cours apparaîtra ici une fois les sessions enregistrées par votre coach.</div>
                      </div>
                    ) : (
                      <>
                        {futurs.length > 0 && (
                          <>
                            <h3 style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginBottom:10 }}>📅 Cours à venir ({futurs.length})</h3>
                            {futurs.map((c, i) => (
                              <div key={c.id || i} style={{ display:"flex", gap:14, padding:"14px 16px", borderRadius:10, border:`1px solid ${PRIMARY_COLOR}40`, background:PRIMARY_LIGHT, marginBottom:8 }}>
                                <div style={{ textAlign:"center", padding:"8px 12px", borderRadius:8, background:"#dcfce7", flexShrink:0 }}>
                                  <div style={{ fontSize:18 }}>📗</div>
                                </div>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{c.objectif || "Cours de groupe"}</div>
                                  {c.grammaire && <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>📐 Grammaire : {c.grammaire}</div>}
                                  {c.sujet_discussion && <div style={{ fontSize:12, color:"#6b7280" }}>💬 Sujet : {c.sujet_discussion}</div>}
                                  <div style={{ fontSize:11, color:"#9ca3af", marginTop:3 }}>📅 {formatDateFull(c.date_cours)}</div>
                                </div>
                                <span style={{ padding:"4px 10px", borderRadius:10, fontSize:11, fontWeight:700, background:"#dcfce7", color:"#166534", height:"fit-content" }}>Planifié</span>
                              </div>
                            ))}
                          </>
                        )}
                        {passes.length > 0 && (
                          <>
                            <h3 style={{ fontSize:13, fontWeight:700, color:"#6b7280", marginTop:16, marginBottom:10 }}>✅ Cours effectués ({passes.length})</h3>
                            {passes.map((c, i) => (
                              <div key={c.id || i} style={{ display:"flex", gap:14, padding:"12px 16px", borderRadius:10, border:"1px solid #e5e7eb", background:"#f9fafb", marginBottom:6, opacity:0.85 }}>
                                <div style={{ textAlign:"center", padding:"6px 12px", borderRadius:8, background:"#f1f5f9", flexShrink:0 }}>
                                  <div style={{ fontSize:16 }}>✔️</div>
                                </div>
                                <div style={{ flex:1 }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
                                    <span style={{ fontWeight:600, fontSize:13, color:"#374151" }}>{c.objectif || "Cours de groupe"}</span>
                                    {/* CE QUI A ÉTÉ TRAITÉ AVANT SON ARRIVÉE. Ces cours étaient
                                        purement masqués : un apprenant intégrant une classe déjà
                                        commencée ne pouvait pas savoir ce qu'il avait à rattraper.
                                        Montré, donc - mais marqué, pour qu'il ne croie pas y avoir
                                        assisté : ces séances ne comptent dans aucune de ses présences. */}
                                    {c.avant_mon_arrivee && (
                                      <span title="Cours dispensé par la classe avant votre arrivée - vous n'y étiez pas, mais son contenu vous aide à rattraper le programme."
                                        style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99, background:"#f1f5f9", color:"#64748b", border:"1px solid #e2e8f0" }}>
                                        Avant mon arrivée
                                      </span>
                                    )}
                                  </div>
                                  {c.grammaire && <div style={{ fontSize:12, color:"#9ca3af" }}>Grammaire : {c.grammaire}</div>}
                                  {c.sujet_discussion && <div style={{ fontSize:12, color:"#9ca3af" }}>Sujet : {c.sujet_discussion}</div>}
                                  <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>📅 {formatDateFull(c.date_cours)}</div>
                                  {c.commentaire && <div style={{ fontSize:11, color:"#7c3aed", marginTop:3, fontStyle:"italic" }}>{c.commentaire}</div>}
                                </div>
                                <span style={{ padding:"4px 10px", borderRadius:10, fontSize:11, fontWeight:700, background: c.statut === "dispense" ? "#f1f5f9" : "#dcfce7", color: c.statut === "dispense" ? "#64748b" : "#166534", height:"fit-content" }}>
                                  {c.statut === "dispense" ? "Dispensé" : "✅ Effectué"}
                                </span>
                              </div>
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </div>
                );
              }

              // ── COACHING PRIVÉ : séances personnelles ──────────────────
              const seances = mesSeances || [];
              const futures = seances.filter(s => new Date(s.date_seance || s.date_cours) >= now);
              const passees = seances.filter(s => new Date(s.date_seance || s.date_cours) < now);

              // Grille semaine courante
              const debutSemaine = new Date();
              debutSemaine.setDate(debutSemaine.getDate() - debutSemaine.getDay() + 1 + semaineCourante * 7);

              return (
                <div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                    <div>
                      <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>Mon Planning</h2>
                      <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>
                        {mesSeancesLoading ? "Chargement…" : `${seances.length} séance${seances.length !== 1 ? "s" : ""} programmée${seances.length !== 1 ? "s" : ""}`}
                      </p>
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={()=>setSemaine(s=>Math.max(0,s-1))} disabled={semaineCourante===0} style={{ padding:"7px 12px", background:"#e5e7eb", color:"#374151", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 }}>← Préc.</button>
                      <span style={{ padding:"7px 14px", background:PRIMARY_LIGHT, color:PRIMARY_COLOR, borderRadius:6, fontWeight:600, fontSize:12 }}>{semaineCourante === 0 ? "Semaine courante" : `Semaine +${semaineCourante}`}</span>
                      <button onClick={()=>setSemaine(s=>s+1)} style={{ padding:"7px 12px", background:"#e5e7eb", color:"#374151", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 }}>Suiv. →</button>
                    </div>
                  </div>

                  {mesSeancesLoading ? (
                    <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>⏳ Chargement des séances…</div>
                  ) : seances.length === 0 ? (
                    <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>
                      <div style={{ fontSize:36, marginBottom:10 }}>📅</div>
                      <div style={{ fontWeight:700, marginBottom:6 }}>Aucune séance planifiée</div>
                      <div style={{ fontSize:12 }}>Vos séances apparaîtront ici dès qu'elles seront créées par votre coach.</div>
                    </div>
                  ) : (
                    <>
                      {/* Grille 7 jours */}
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:6, marginBottom:24 }}>
                        {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map((j, i) => {
                          const d = new Date(debutSemaine);
                          d.setDate(d.getDate() + i);
                          const dateStr = d.toISOString().split("T")[0];
                          const isToday = dateStr === new Date().toISOString().split("T")[0];
                          const seancesJour = seances.filter(s => (s.date_seance || s.date_cours || "").startsWith(dateStr));
                          return (
                            <div key={j} style={{ minHeight:72, padding:"8px 6px", borderRadius:8, background: isToday ? PRIMARY_LIGHT : "#f8fafc", border:`1.5px solid ${isToday ? PRIMARY_COLOR : "#e5e7eb"}` }}>
                              <div style={{ fontSize:10, fontWeight:800, color: isToday ? PRIMARY_COLOR : "#9ca3af", marginBottom:4 }}>{j} {d.getDate()}</div>
                              {seancesJour.map((s, si) => (
                                <div key={si} style={{ fontSize:9, padding:"2px 5px", borderRadius:4, background:"#ede9fe", color:"#5b21b6", marginBottom:2, lineHeight:1.4, fontWeight:600 }}>
                                  {s.heure_debut} {(s.titre || s.objectif || "Séance").substring(0, 12)}
                                </div>
                              ))}
                              {!seancesJour.length && <div style={{ fontSize:9, color:"#d1d5db", marginTop:4 }}>-</div>}
                            </div>
                          );
                        })}
                      </div>

                      {/* Liste détaillée */}
                      {futures.length > 0 && (
                        <>
                          <h3 style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginBottom:10 }}>📅 Séances à venir ({futures.length})</h3>
                          {futures.map((s, i) => (
                            <div key={s.id || i} style={{ display:"flex", gap:14, padding:"14px 16px", borderRadius:10, border:`1px solid ${PRIMARY_COLOR}40`, background:PRIMARY_LIGHT, marginBottom:8 }}>
                              <div style={{ textAlign:"center", padding:"8px 12px", borderRadius:8, background:"#ede9fe", flexShrink:0 }}>
                                <div style={{ fontSize:18 }}>📚</div>
                                <div style={{ fontSize:10, color:"#5b21b6", fontWeight:700 }}>{s.duree_h ? `${s.duree_h}h` : ""}</div>
                              </div>
                              <div style={{ flex:1 }}>
                                <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{s.titre || s.objectif || "Séance de coaching"}</div>
                                <div style={{ fontSize:12, color:"#6b7280", marginTop:3 }}>
                                  📅 {formatDateFull(s.date_seance || s.date_cours)}
                                  {s.heure_debut && ` · ⏱ ${s.heure_debut}`}
                                  {s.heure_fin   && ` – ${s.heure_fin}`}
                                </div>
                                {s.lieu && <div style={{ fontSize:12, color:"#6b7280" }}>📍 {s.lieu}</div>}
                                {s.notes_coach && <div style={{ fontSize:11, color:"#7c3aed", marginTop:4, fontStyle:"italic" }}>{s.notes_coach}</div>}
                              </div>
                              <span style={{ padding:"4px 10px", borderRadius:10, fontSize:11, fontWeight:700, background:"#dcfce7", color:"#166534", height:"fit-content" }}>✅ Confirmée</span>
                            </div>
                          ))}
                        </>
                      )}

                      {passees.length > 0 && (
                        <>
                          <h3 style={{ fontSize:13, fontWeight:700, color:"#6b7280", marginTop:16, marginBottom:10 }}>✅ Séances effectuées ({passees.length})</h3>
                          {passees.map((s, i) => (
                            <div key={s.id || i} style={{ display:"flex", gap:14, padding:"12px 16px", borderRadius:10, border:"1px solid #e5e7eb", background:"#f9fafb", marginBottom:6, opacity:0.85 }}>
                              <div style={{ textAlign:"center", padding:"6px 12px", borderRadius:8, background:"#f1f5f9", flexShrink:0 }}>
                                <div style={{ fontSize:16 }}>✔️</div>
                                <div style={{ fontSize:10, color:"#64748b", fontWeight:700 }}>{s.duree_h ? `${s.duree_h}h` : ""}</div>
                              </div>
                              <div style={{ flex:1 }}>
                                <div style={{ fontWeight:600, fontSize:13, color:"#374151" }}>{s.titre || s.objectif || "Séance de coaching"}</div>
                                <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>
                                  📅 {formatDateFull(s.date_seance || s.date_cours)}
                                  {s.heure_debut && ` · ⏱ ${s.heure_debut}`}
                                </div>
                                {s.notes_coach && <div style={{ fontSize:11, color:"#9ca3af", marginTop:3, fontStyle:"italic" }}>{s.notes_coach}</div>}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {/* RESSOURCES */}
            {activeTab === "ressources" && (() => {
              const TYPE_FICH = {
                pdf:     { icon:"📄", label:"PDF",     color:"#dc2626" },
                video:   { icon:"🎬", label:"Vidéo",   color:"#7c3aed" },
                audio:   { icon:"🎧", label:"Audio",   color:"#059669" },
                lien:    { icon:"🔗", label:"Lien",    color:PRIMARY_COLOR },
                speaking:{ icon:"🎤", label:"Speaking",color:"#dc2626" },
                autre:   { icon:"📎", label:"Fichier", color:"#6b7280" },
              };
              const getMeta = (f) => TYPE_FICH[f.type_fichier] || TYPE_FICH[f.type] || TYPE_FICH.autre;
              const tailleFmt = (ko) => ko ? (ko >= 1024 ? `${(ko/1024).toFixed(1)} Mo` : `${ko} Ko`) : null;
              const DOC_TYPES = ["pdf","doc","docx","ppt","pptx","xls","xlsx"];
              const handleDownload = async (f) => {
                const url = f.url || "";
                const type = f.type_fichier || f.type || "";
                const needsProxy = DOC_TYPES.includes(type) && url.includes("cloudinary.com");
                const proxyUrl = needsProxy
                  ? `${API_URL}/api/upload/download?url=${encodeURIComponent(url)}&nom=${encodeURIComponent(f.nom || "document")}&type=${encodeURIComponent(type)}`
                  : url;
                try {
                  const r = await fetch(proxyUrl);
                  if (!r.ok) throw new Error("HTTP " + r.status);
                  const blob = await r.blob();
                  const blobUrl = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = blobUrl;
                  a.download = f.nom || "document";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                } catch (e) {
                  toast.error("Erreur téléchargement : " + e.message);
                }
              };

              return (
                <div>
                  <div style={{ marginBottom:20 }}>
                    <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>📂 Ressources partagées</h2>
                    <p style={{ margin:"4px 0 0", fontSize:12, color:"#9ca3af" }}>
                      {mesFichiersLoading ? "Chargement…" : `${ressourcesFiltrees.length} fichier${ressourcesFiltrees.length!==1?"s":""} partagé${ressourcesFiltrees.length!==1?"s":""} par votre coach`}
                    </p>
                  </div>

                  {/* Filtres type */}
                  <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
                    {["Tous", "pdf", "video", "audio", "lien", "speaking", "autre"].map(t => {
                      const meta = TYPE_FICH[t];
                      return (
                        <button key={t} onClick={() => setFilterRess(t)} style={{
                          padding:"5px 12px", borderRadius:20, border:"1px solid", fontSize:12, cursor:"pointer",
                          background: filterRessource===t ? (meta?.color||PRIMARY_COLOR)+"15" : "#fff",
                          color: filterRessource===t ? (meta?.color||PRIMARY_COLOR) : "#6b7280",
                          borderColor: filterRessource===t ? (meta?.color||PRIMARY_COLOR) : "#e5e7eb",
                          fontWeight: filterRessource===t ? 700 : 400,
                        }}>{meta ? `${meta.icon} ${meta.label}` : "Tous"}</button>
                      );
                    })}
                  </div>

                  {mesFichiersLoading ? (
                    <div style={{ textAlign:"center", padding:"48px 0", color:"#9ca3af" }}>Chargement des ressources…</div>
                  ) : ressourcesFiltrees.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"60px 0", color:"#9ca3af" }}>
                      <div style={{ fontSize:40, marginBottom:12 }}>📂</div>
                      <div style={{ fontSize:14, fontWeight:600, marginBottom:6 }}>Aucune ressource disponible</div>
                      <div style={{ fontSize:12 }}>Votre coach n'a pas encore partagé de fichiers pour votre classe.</div>
                    </div>
                  ) : (
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
                      {ressourcesFiltrees.map(f => {
                        const meta = getMeta(f);
                        const taille = tailleFmt(f.taille_ko);
                        const dateAjout = f.created_at ? new Date(f.created_at).toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" }) : null;
                        return (
                          <div key={f.id} style={{ borderRadius:10, border:"1px solid #e5e7eb", background:"#fff", padding:14, display:"flex", flexDirection:"column", gap:10 }}>
                            <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                              <div style={{ width:40, height:40, borderRadius:8, background:meta.color+"15", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{meta.icon}</div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontWeight:700, fontSize:13, color:"#0f172a", lineHeight:1.4, marginBottom:2 }}>{f.nom}</div>
                                <div style={{ display:"flex", gap:8, fontSize:11, color:"#9ca3af" }}>
                                  <span style={{ padding:"1px 7px", borderRadius:6, background:meta.color+"12", color:meta.color, fontWeight:600 }}>{meta.icon} {meta.label}</span>
                                  {taille && <span>{taille}</span>}
                                  {dateAjout && <span>· {dateAjout}</span>}
                                </div>
                              </div>
                            </div>
                            {DOC_TYPES.includes(f.type_fichier||f.type) ? (
                              <button onClick={() => handleDownload(f)}
                                style={{ display:"block", width:"100%", padding:"9px", background:PRIMARY_COLOR, color:"#fff", borderRadius:7, cursor:"pointer", fontWeight:700, fontSize:12, textAlign:"center", border:"none" }}>
                                ⬇️ Télécharger
                              </button>
                            ) : (f.type_fichier||f.type)==="video" ? (
                              <button onClick={() => setMediaModal({ url: f.url, nom: f.nom, type: "video" })}
                                style={{ display:"block", width:"100%", padding:"9px", background:PRIMARY_COLOR, color:"#fff", borderRadius:7, cursor:"pointer", fontWeight:700, fontSize:12, textAlign:"center", border:"none" }}>
                                ▶️ Regarder
                              </button>
                            ) : (f.type_fichier||f.type)==="audio" ? (
                              <button onClick={() => setMediaModal({ url: f.url, nom: f.nom, type: "audio" })}
                                style={{ display:"block", width:"100%", padding:"9px", background:PRIMARY_COLOR, color:"#fff", borderRadius:7, cursor:"pointer", fontWeight:700, fontSize:12, textAlign:"center", border:"none" }}>
                                🎧 Écouter
                              </button>
                            ) : (
                              <a href={f.url} target="_blank" rel="noreferrer"
                                style={{ display:"block", padding:"9px", background:PRIMARY_COLOR, color:"#fff", borderRadius:7, cursor:"pointer", fontWeight:700, fontSize:12, textAlign:"center", textDecoration:"none" }}>
                                🔗 Ouvrir
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

                        {/* EXAMENS */}
            {activeTab === "examens" && (()=>{
              // Logique devoir : ouverture / expiration / statut calculés côté client
              const devoirs = mesEvals.map(d => {
                const hOuv = (d.heure_ouverture || "00:00").slice(0,5);
                const hLim = (d.heure_limite   || "23:59").slice(0,5);
                const ouvert = !d.date_ouverture || nowTick >= new Date(`${d.date_ouverture}T${hOuv}:00`);
                const expire = d.date_limite && nowTick > new Date(`${d.date_limite}T${hLim}:00`);
                const rendu  = d.monResultat;
                const statut = rendu ? rendu.statut : (expire ? "en_retard" : "a_rendre");
                return { ...d, ouvert, expire, statut, rendu };
              });

              const devFiltres = filtreDevoir === "tous" ? devoirs
                : devoirs.filter(d => d.statut === filtreDevoir);

              const fmt2 = n => String(n).padStart(2,"0");
              function timerStr(d) {
                if (!d.date_limite) return null;
                const ms = new Date(`${d.date_limite}T${(d.heure_limite||"23:59").slice(0,5)}:00`) - nowTick;
                if (ms <= 0) return null;
                const j = Math.floor(ms/86400000);
                const h = Math.floor((ms%86400000)/3600000);
                const m = Math.floor((ms%3600000)/60000);
                const s = Math.floor((ms%60000)/1000);
                return j>0 ? `${j}j ${fmt2(h)}:${fmt2(m)}:${fmt2(s)}` : `${fmt2(h)}:${fmt2(m)}:${fmt2(s)}`;
              }

              async function soumettreDevoir(d) {
                if (submitLoading) return;
                if (!gaId) { await alerte("Impossible de soumettre : identifiant groupe manquant", { titre: "Erreur", danger: true }); return; }
                if (!(await confirm("Vous pourrez encore la modifier ou l'annuler tant que votre coach ne l'a pas corrigée.", { titre: "Envoyer ce devoir ?", confirmLabel: "✅ Envoyer", danger: false }))) return;
                setSubmitLoading(true); setSubmitErreur("");
                try {
                  const token = localStorage.getItem("user_token");
                  const url = `${API_URL}/api/apprenants/evaluations/${d._evalId}/soumettre`;
                  let resp;
                  if (submitFichier) {
                    const fd = new FormData();
                    fd.append("fichier", submitFichier);
                    fd.append("ga_id", gaId);
                    fd.append("type_soumission", "fichier");
                    if (submitTexte.trim()) fd.append("contenu_texte", submitTexte.trim());
                    if (Object.keys(submitQcm).length) fd.append("reponses_qcm", JSON.stringify(submitQcm));
                    if (Object.keys(submitBlocs).length) fd.append("reponses_blocs", JSON.stringify(submitBlocs));
                    resp = await fetch(url, { method:"POST", headers:{ Authorization:`Bearer ${token}` }, body: fd });
                  } else {
                    resp = await fetch(url, {
                      method:"POST",
                      headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
                      body: JSON.stringify({ ga_id: gaId, contenu_texte: submitTexte.trim(), reponses_qcm: submitQcm, reponses_blocs: submitBlocs }),
                    });
                  }
                  const json = await resp.json();
                  if (!resp.ok) { setSubmitErreur(json.error || "Erreur lors de la soumission"); setSubmitLoading(false); return; }
                  // Mettre à jour l'état local
                  setMesEvals(prev => prev.map(e => e._evalId === d._evalId
                    ? { ...e, monResultat: json.resultat || { statut:"rendu" } }
                    : e));
                  setDevoirOuvert(null); setSubmitTexte(""); setSubmitQcm({}); setSubmitFichier(null); setSubmitBlocs({});
                } catch { setSubmitErreur("Erreur réseau. Vérifiez votre connexion."); }
                setSubmitLoading(false);
              }

              function ouvrirPourModifier(d) {
                setDevoirOuvert(d);
                setSubmitTexte(d.rendu?.contenu_texte || "");
                setSubmitQcm(d.rendu?.reponses_qcm || {});
                setSubmitBlocs(d.rendu?.reponses_blocs || {});
                setSubmitFichier(null);
                setSubmitErreur("");
              }

              async function annulerRendu(d) {
                if (!(await confirm("Votre rendu sera supprimé et le devoir repassera à \"À rendre\".", { titre:"Annuler ce rendu ?", confirmLabel:"🗑️ Annuler le rendu", danger:true }))) return;
                try {
                  const token = localStorage.getItem("user_token");
                  const resp = await fetch(`${API_URL}/api/apprenants/evaluations/${d._evalId}/rendu?ga_id=${gaId}`, {
                    method:"DELETE", headers:{ Authorization:`Bearer ${token}` },
                  });
                  const json = await resp.json();
                  if (!resp.ok) { await alerte(json.error || "Erreur lors de l'annulation", { titre:"Erreur", danger:true }); return; }
                  setMesEvals(prev => prev.map(e => e._evalId === d._evalId ? { ...e, monResultat: null } : e));
                  toast.success("Rendu annulé ✓");
                } catch { await alerte("Erreur réseau. Vérifiez votre connexion.", { titre:"Erreur", danger:true }); }
              }

              const STATUT_DV = {
                a_rendre:  { fond:"#FEF9C3", texte:"#92400E", lib:"À rendre",  ic:"⏳" },
                rendu:     { fond:"#D1FAE5", texte:"#065F46", lib:"Rendu",     ic:"✅" },
                corrige:   { fond:"#DBEAFE", texte:"#1D4ED8", lib:"Corrigé",   ic:"🏅" },
                en_retard: { fond:"#FEE2E2", texte:"#991B1B", lib:"Non rendu", ic:"🔴" },
              };

              return (
                <div>
                  {/* Filtres */}
                  <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
                    {[
                      { id:"tous",      lib:`Tous (${devoirs.length})` },
                      { id:"a_rendre",  lib:`À rendre (${devoirs.filter(d=>d.statut==="a_rendre").length})` },
                      { id:"rendu",     lib:`Rendus (${devoirs.filter(d=>d.statut==="rendu").length})` },
                      { id:"corrige",   lib:`Corrigés (${devoirs.filter(d=>d.statut==="corrige").length})` },
                      { id:"en_retard", lib:`En retard (${devoirs.filter(d=>d.statut==="en_retard").length})` },
                    ].map(f=>(
                      <button key={f.id} onClick={()=>setFiltreDevoir(f.id)}
                        style={{ padding:"7px 16px", borderRadius:20, fontSize:12, fontWeight:600, border:`1.5px solid ${filtreDevoir===f.id?PRIMARY_COLOR:"#e5e7eb"}`, background:filtreDevoir===f.id?PRIMARY_COLOR:"#fff", color:filtreDevoir===f.id?"#fff":"#6b7280", cursor:"pointer" }}>
                        {f.lib}
                      </button>
                    ))}
                  </div>

                  {mesEvalsLoading && <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>Chargement…</div>}

                  {!mesEvalsLoading && mesEvalsErreur && mesEvalsErreur !== "groupe_introuvable" && (
                    <div style={{ textAlign:"center", padding:"40px 20px", background:"#fef2f2", borderRadius:12, border:"1px solid #fecaca", margin:"0 0 16px" }}>
                      <div style={{ fontSize:28, marginBottom:8 }}>⚠️</div>
                      <div style={{ fontWeight:700, color:"#dc2626", marginBottom:4 }}>Impossible de charger les devoirs</div>
                      <div style={{ fontSize:12, color:"#6b7280" }}>{mesEvalsErreur}</div>
                    </div>
                  )}

                  {!mesEvalsLoading && mesEvalsErreur === "groupe_introuvable" && (
                    <div style={{ textAlign:"center", padding:"40px 20px", background:"#fffbeb", borderRadius:12, border:"1px solid #fde68a", margin:"0 0 16px" }}>
                      <div style={{ fontSize:28, marginBottom:8 }}>🔗</div>
                      <div style={{ fontWeight:700, color:"#92400e", marginBottom:4 }}>Compte non lié à un groupe</div>
                      <div style={{ fontSize:12, color:"#78350f" }}>Votre compte n'est pas encore rattaché à votre groupe de cours. Reconnectez-vous ou contactez votre assistante.</div>
                    </div>
                  )}

                  {!mesEvalsLoading && !mesEvalsErreur && devoirs.length === 0 && (
                    <div style={{ textAlign:"center", padding:"50px 20px", color:"#9ca3af" }}>
                      <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
                      <div style={{ fontWeight:600, color:"#374151" }}>Aucun devoir assigné pour le moment</div>
                      <div style={{ fontSize:12, marginTop:4 }}>Votre coach n'a pas encore publié de devoir pour votre groupe.</div>
                    </div>
                  )}

                  {!mesEvalsLoading && (
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      {devFiltres.map(d => {
                        const st = STATUT_DV[d.statut] || STATUT_DV.a_rendre;
                        const borderCol = d.statut==="corrige"?"#3B82F6":d.statut==="rendu"?"#059669":d.statut==="en_retard"?"#EF4444":d.ouvert?PRIMARY_COLOR:"#A78BFA";
                        const tStr = timerStr(d);
                        const jRest = d.date_limite ? Math.floor((new Date(`${d.date_limite}T${(d.heure_limite||"23:59").slice(0,5)}:00`) - nowTick)/86400000) : null;
                        return (
                          <div key={d.id} style={{ background:"#fff", borderRadius:14, border:`1px solid #e5e7eb`, borderLeft:`4px solid ${borderCol}`, overflow:"hidden" }}>
                            <div style={{ padding:"16px 20px", display:"flex", alignItems:"center", gap:14 }}>
                              <div style={{ width:44, height:44, borderRadius:12, background:st.fond, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
                                {!d.ouvert ? "🔒" : st.ic}
                              </div>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:15, fontWeight:700, color:"#0f172a", marginBottom:4 }}>{d.titre}</div>
                                <div style={{ display:"flex", gap:12, fontSize:12, color:"#6b7280", flexWrap:"wrap", alignItems:"center" }}>
                                  {!d.ouvert && <span style={{ color:"#7C3AED", fontWeight:700 }}>🔒 Disponible le {d.date_ouverture} à {d.heure_ouverture}</span>}
                                  {d.ouvert && !d.expire && d.date_limite && tStr && (
                                    <span style={{ color: jRest!==null&&jRest<=1?"#EF4444":jRest<=3?"#F59E0B":"#6b7280", fontWeight:jRest!==null&&jRest<=3?700:400, fontFamily:"monospace" }}>
                                      ⏳ {tStr}
                                    </span>
                                  )}
                                  {d.expire && <span style={{ color:"#EF4444", fontWeight:700 }}>🔴 Date limite dépassée ({d.date_limite} {d.heure_limite})</span>}
                                  {d.rendu?.rendu_at && <span>✅ Rendu le {new Date(d.rendu.rendu_at).toLocaleDateString("fr-FR")}</span>}
                                  {d.rendu?.note != null && <span style={{ fontWeight:700, color:d.rendu.note>=10?"#059669":"#dc2626" }}>🏅 {d.rendu.note}/{d.rendu.note_max||20}</span>}
                                  <span style={{ color:"#9ca3af" }}>
                                    {d.type_rendu==="fichier"?"📎 Fichier":d.type_rendu==="les_deux"?"📎+📝 Les deux":"📝 Composition"}
                                    {d.categorie === "devoir" ? " · Devoir" : d.categorie === "exercice" ? " · Exercice" : " · Évaluation"}
                                  </span>
                                </div>
                              </div>
                              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8, flexShrink:0 }}>
                                <span style={{ padding:"3px 10px", borderRadius:20, background:st.fond, color:st.texte, fontSize:11, fontWeight:700 }}>{st.ic} {st.lib}</span>
                                {d.ouvert && !d.expire && d.statut==="a_rendre" && (
                                  <button onClick={async ()=>{
                                    if (d.type_rendu !== "fichier" && !(await confirm(
                                      "Une fois ouvert, vous devrez le soumettre pour continuer - impossible d'annuler en cours de route.",
                                      { titre:"Ouvrir ce devoir ?", confirmLabel:"📝 Ouvrir", danger:false }
                                    ))) return;
                                    setDevoirOuvert(d); setSubmitTexte(""); setSubmitQcm({}); setSubmitFichier(null); setSubmitBlocs({}); setSubmitErreur("");
                                  }}
                                    style={{ padding:"7px 14px", borderRadius:8, border:"none", background:PRIMARY_COLOR, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                                    {d.type_rendu==="fichier"?"📎 Déposer":"📝 Ouvrir"}
                                  </button>
                                )}
                                {(d.expire && d.statut==="a_rendre") && (
                                  <button onClick={()=>setDevoirOuvert(d)}
                                    style={{ padding:"7px 14px", borderRadius:8, border:"none", background:"#FEE2E2", color:"#991B1B", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                                    Voir
                                  </button>
                                )}
                                {d.statut==="rendu" && (
                                  <div style={{ display:"flex", gap:6 }}>
                                    <button onClick={()=>ouvrirPourModifier(d)}
                                      style={{ padding:"7px 12px", borderRadius:8, border:"none", background:PRIMARY_COLOR, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                                      ✏️ Modifier
                                    </button>
                                    <button onClick={()=>annulerRendu(d)}
                                      style={{ padding:"7px 12px", borderRadius:8, border:"1px solid #FCA5A5", background:"#FEF2F2", color:"#991B1B", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                                      🗑️ Annuler
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* Commentaire coach */}
                            {d.rendu?.commentaire_coach && (
                              <div style={{ padding:"10px 20px", background:"#EFF6FF", borderTop:"1px solid #e5e7eb", fontSize:12, color:"#1E40AF" }}>
                                💬 Commentaire du professeur : <em>"{d.rendu.commentaire_coach}"</em>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {devFiltres.length === 0 && !mesEvalsLoading && devoirs.length > 0 && (
                        <div style={{ textAlign:"center", padding:30, color:"#9ca3af" }}>Aucun devoir pour ce filtre</div>
                      )}
                    </div>
                  )}

                  {/* ── Modal soumission ── */}
                  {devoirOuvert && (()=>{
                    const d = devoirOuvert;
                    const isExpire = d.expire && d.statut==="a_rendre";
                    const isFichier = d.type_rendu==="fichier";
                    const isLesTwo  = d.type_rendu==="les_deux";
                    const hasQcm = ["qcm","quiz","listening","audio"].includes(d.type) && d.questions.length > 0;
                    const isMixte = d.type==="mixte" && Array.isArray(d.blocs) && d.blocs.length > 0;
                    const canSubmit = submitFichier || submitTexte.trim() || Object.keys(submitQcm).length > 0;

                    function fermer() { setDevoirOuvert(null); setSubmitTexte(""); setSubmitQcm({}); setSubmitFichier(null); setSubmitBlocs({}); setSubmitErreur(""); }

                    // Cas 1 : expiré non rendu
                    if (isExpire) return (
                      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1300, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
                        <div style={{ background:"#fff", borderRadius:20, maxWidth:440, width:"100%", overflow:"hidden", boxShadow:"0 8px 40px rgba(0,0,0,0.2)" }}>
                          <div style={{ background:"linear-gradient(135deg,#991B1B,#DC2626)", padding:"20px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                            <div>
                              <div style={{ fontSize:11, color:"rgba(255,255,255,0.65)", textTransform:"uppercase", marginBottom:3 }}>⛔ Devoir expiré</div>
                              <div style={{ fontSize:16, fontWeight:700, color:"#fff" }}>{d.titre}</div>
                            </div>
                            <button onClick={fermer} style={{ background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", borderRadius:8, width:32, height:32, fontSize:16, cursor:"pointer" }}>✕</button>
                          </div>
                          <div style={{ padding:28, textAlign:"center" }}>
                            <div style={{ fontSize:48, marginBottom:12 }}>🔴</div>
                            <div style={{ fontSize:18, fontWeight:800, color:"#991B1B", marginBottom:8 }}>Date limite dépassée</div>
                            <div style={{ fontSize:14, color:"#6b7280", lineHeight:1.6, marginBottom:20 }}>
                              La date limite était le <strong>{d.date_limite}</strong> à <strong>{d.heure_limite||"23:59"}</strong>.<br/>La soumission n'est plus possible.
                            </div>
                            <div style={{ padding:"12px 16px", background:"#FEE2E2", borderRadius:10, fontSize:13, color:"#991B1B", fontWeight:600, marginBottom:20 }}>
                              📋 Statut : Devoir non rendu - en retard
                            </div>
                            <button onClick={fermer} style={{ padding:"11px 32px", borderRadius:10, border:"none", background:"#f1f5f9", color:"#0f172a", fontSize:13, fontWeight:700, cursor:"pointer" }}>Fermer</button>
                          </div>
                        </div>
                      </div>
                    );

                    // Cas 2 : fichier seul
                    if (isFichier && !hasQcm) return (
                      <>
                        <div onClick={fermer} style={{ position:"fixed", inset:0, background:"rgba(10,18,35,0.6)", zIndex:1298, backdropFilter:"blur(3px)" }} />
                        <div style={{ position:"fixed", top:0, right:0, bottom:0, width:"min(92vw,720px)", background:"#fff", zIndex:1299, display:"flex", flexDirection:"column", boxShadow:"-8px 0 40px rgba(0,0,0,0.2)", overflow:"hidden" }}>
                          <div style={{ background:`linear-gradient(135deg,${PRIMARY_COLOR},#0e7490)`, padding:"20px 24px", flexShrink:0, display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
                            <div>
                              <div style={{ fontSize:11, color:"rgba(255,255,255,0.65)", textTransform:"uppercase", letterSpacing:".08em", marginBottom:4 }}>📎 Déposer un fichier</div>
                              <div style={{ fontSize:18, fontWeight:800, color:"#fff" }}>{d.titre}</div>
                            </div>
                            <button onClick={fermer} style={{ background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.3)", borderRadius:8, width:34, height:34, color:"#fff", fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✕</button>
                          </div>
                          <div style={{ flex:1, overflowY:"auto", padding:"24px" }}>
                            {d.instructions && <div style={{ background:"#f8fafc", borderRadius:12, padding:"16px 18px", marginBottom:22, fontSize:14, color:"#374151", lineHeight:1.7 }}><div style={{ fontWeight:700, color:"#0f172a", marginBottom:6 }}>📋 Consigne</div>{d.instructions}</div>}
                            {d.date_limite && <div style={{ marginBottom:18, fontSize:13, color:"#92400E", fontWeight:600 }}>⏳ Date limite : {d.date_limite} à {d.heure_limite||"23:59"}</div>}
                            {d.ressource_url && (
                              <a href={d.ressource_url} target="_blank" rel="noreferrer" style={{ display:"flex", alignItems:"center", gap:12, background:"#F0F9FF", border:"1px solid #BAE6FD", borderRadius:12, padding:"14px 18px", marginBottom:18, textDecoration:"none" }}>
                                <span style={{ fontSize:22 }}>📎</span>
                                <div>
                                  <div style={{ fontSize:13, fontWeight:700, color:"#0369A1" }}>Exercice joint par le coach</div>
                                  <div style={{ fontSize:12, color:"#0C4A6E", wordBreak:"break-all" }}>{(d.ressource_url.split("/").pop() || "Télécharger")}</div>
                                </div>
                              </a>
                            )}
                            {!submitFichier && d.rendu?.fichier_url && (
                              <a href={d.rendu.fichier_url} target="_blank" rel="noreferrer" style={{ display:"flex", alignItems:"center", gap:12, background:"#F0FDF4", border:"1px solid #BBF7D0", borderRadius:12, padding:"14px 18px", marginBottom:14, textDecoration:"none" }}>
                                <span style={{ fontSize:22 }}>✅</span>
                                <div>
                                  <div style={{ fontSize:13, fontWeight:700, color:"#166534" }}>Fichier déjà envoyé</div>
                                  <div style={{ fontSize:12, color:"#15803d", wordBreak:"break-all" }}>{d.rendu.fichier_nom || d.rendu.fichier_url.split("/").pop()}</div>
                                </div>
                              </a>
                            )}
                            <label style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", border:`2px dashed ${submitFichier?PRIMARY_COLOR:"#d1d5db"}`, borderRadius:14, padding:"40px 20px", cursor:"pointer", background:submitFichier?`${PRIMARY_COLOR}10`:"#f8fafc", gap:12, marginBottom:8 }}>
                              <span style={{ fontSize:44 }}>{submitFichier?"✅":"📁"}</span>
                              <span style={{ fontSize:15, color:submitFichier?PRIMARY_COLOR:"#6b7280", fontWeight:600, textAlign:"center" }}>{submitFichier?submitFichier.name:d.rendu?.fichier_url?"Cliquez pour remplacer le fichier":"Cliquez pour choisir votre fichier"}</span>
                              <span style={{ fontSize:12.5, color:"#9ca3af" }}>.pdf · .docx · .mp4 · .mp3 · .jpg · .png</span>
                              <input type="file" accept=".pdf,.docx,.mp4,.mp3,.jpg,.png,.jpeg" style={{ display:"none" }} onChange={e=>setSubmitFichier(e.target.files[0]||null)}/>
                            </label>
                            {submitErreur && <div style={{ marginTop:16, padding:"12px 16px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:8, fontSize:13, color:"#991B1B", fontWeight:600 }}>⚠️ {submitErreur}</div>}
                          </div>
                          <div style={{ padding:"16px 24px", borderTop:"1px solid #e5e7eb", display:"flex", gap:12, justifyContent:"flex-end", flexShrink:0 }}>
                            <button onClick={fermer} style={{ background:"#f1f5f9", color:"#6b7280", border:"1px solid #e5e7eb", borderRadius:8, padding:"10px 20px", fontSize:13, fontWeight:600, cursor:"pointer" }}>Annuler</button>
                            <button disabled={(!submitFichier && !d.rendu?.fichier_url)||submitLoading} onClick={()=>soumettreDevoir(d)}
                              style={{ background:((!submitFichier && !d.rendu?.fichier_url)||submitLoading)?"#e5e7eb":PRIMARY_COLOR, color:((!submitFichier && !d.rendu?.fichier_url)||submitLoading)?"#9ca3af":"#fff", border:"none", borderRadius:8, padding:"10px 20px", fontSize:13, fontWeight:700, cursor:((!submitFichier && !d.rendu?.fichier_url)||submitLoading)?"not-allowed":"pointer" }}>
                              {submitLoading?"⏳ Envoi…":"✅ Soumettre le devoir"}
                            </button>
                          </div>
                        </div>
                      </>
                    );

                    // Cas 3 : texte / QCM / les_deux / mixte (panel plein écran)
                    const blocsNotables = isMixte ? d.blocs.filter(b=>["qcm","listening","audio","quiz"].includes(b.type)) : [];
                    const totalBlocQ    = blocsNotables.reduce((s,b)=>s+(b.questions||[]).length, 0);
                    const reponduBlocQ  = blocsNotables.reduce((s,b)=>s+Object.keys(submitBlocs[b.id]||{}).length, 0);
                    const speakingOk    = !isMixte || d.blocs.filter(b=>b.type==="speaking").every(b=>(submitBlocs[b.id]?.texte||"").trim().length>0 || !!submitBlocs[b.id]?.audioUrl);
                    const canSubmitFinal = isMixte
                      ? (totalBlocQ===0 || reponduBlocQ===totalBlocQ) && speakingOk
                      : hasQcm
                        ? Object.keys(submitQcm).length === d.questions.length
                        : (submitTexte.trim().length > 0 || (isLesTwo && submitFichier));
                    return (
                      <>
                        {/* Pas de fermeture au clic sur le fond ni de bouton ✕ : une fois ouvert,
                            le devoir doit être soumis pour pouvoir en sortir. */}
                        <div style={{ position:"fixed", inset:0, background:"rgba(10,18,35,0.6)", zIndex:1298, backdropFilter:"blur(3px)" }} />
                        <div style={{ position:"fixed", top:0, right:0, bottom:0, width:"min(92vw,800px)", background:"#fff", zIndex:1299, display:"flex", flexDirection:"column", boxShadow:"-8px 0 40px rgba(0,0,0,0.2)", overflow:"hidden" }}>
                          <div style={{ background:`linear-gradient(135deg,${PRIMARY_COLOR},#0e7490)`, padding:"20px 24px", flexShrink:0, display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
                            <div>
                              <div style={{ fontSize:11, color:"rgba(255,255,255,0.65)", textTransform:"uppercase", letterSpacing:".08em", marginBottom:4 }}>📝 {(hasQcm||isMixte)?"Répondre aux questions":"Rendre mon devoir"}</div>
                              <div style={{ fontSize:18, fontWeight:800, color:"#fff" }}>{d.titre}</div>
                            </div>
                          </div>
                          <div style={{ padding:"20px 24px", overflowY:"auto", flex:1, display:"flex", flexDirection:"column", gap:16 }}>
                            {(d.instructions||d.ressource_url) && (
                              <div style={{ background:"#f8fafc", borderRadius:12, padding:"14px 16px", fontSize:13, color:"#374151", lineHeight:1.6 }}>
                                {d.instructions && <><div style={{ fontWeight:700, color:"#0f172a", marginBottom:4 }}>📋 Consigne</div>{d.instructions}</>}
                                {d.ressource_url && <div style={{ marginTop:8 }}><a href={d.ressource_url} target="_blank" rel="noreferrer" style={{ color:PRIMARY_COLOR, fontWeight:600 }}>🔗 Voir la ressource</a></div>}
                              </div>
                            )}
                            {d.date_limite && <div style={{ fontSize:12, color:"#92400E", fontWeight:600 }}>⏳ Date limite : {d.date_limite} à {d.heure_limite||"23:59"}</div>}

                            {/* QCM */}
                            {hasQcm && d.questions.map((q,qi)=>(
                              <div key={q.id||qi} style={{ background:"#f8fafc", borderRadius:12, padding:"14px 16px" }}>
                                <div style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginBottom:10 }}>Q{qi+1}. {q.text}</div>
                                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                                  {(q.options||[]).map((opt,oi)=>{
                                    const sel = submitQcm[qi]===opt;
                                    return (
                                      <label key={oi} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:8, border:`2px solid ${sel?PRIMARY_COLOR:"#e5e7eb"}`, background:sel?`${PRIMARY_COLOR}12`:"#fff", cursor:"pointer" }}>
                                        <input type="radio" name={`q${qi}`} value={opt} checked={sel} onChange={()=>setSubmitQcm(p=>({...p,[qi]:opt}))} style={{ accentColor:PRIMARY_COLOR }}/>
                                        <span style={{ fontSize:13, color:"#374151" }}>{opt}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                            {hasQcm && <div style={{ fontSize:11, color:"#9ca3af", textAlign:"right" }}>{Object.keys(submitQcm).length}/{d.questions.length} question(s) répondue(s)</div>}

                            {/* Blocs mixtes - QCM/Listening/Audio/Quiz/Speaking combinés */}
                            {isMixte && d.blocs.map((b,bi)=>{
                              const BLOC_ICO = { qcm:"📋", listening:"🎬", audio:"🎧", quiz:"🎯", speaking:"🎤" };
                              const avecQ = ["qcm","listening","audio","quiz"].includes(b.type) && (b.questions||[]).length > 0;
                              const rep = submitBlocs[b.id] || {};
                              return (
                                <div key={b.id} style={{ background:"#f8fafc", borderRadius:12, padding:"14px 16px", border:"1px solid #e2e8f0" }}>
                                  <div style={{ fontSize:12, fontWeight:700, color:"#0f172a", marginBottom:10 }}>{BLOC_ICO[b.type]||"📋"} Bloc {bi+1}</div>

                                  {["listening","audio"].includes(b.type) && b.ressourceUrl && (
                                    b.type==="listening"
                                      ? (urlEmbedVideo(b.ressourceUrl)
                                          ? <div style={{ position:"relative", paddingTop:"48%", borderRadius:8, overflow:"hidden", marginBottom:12 }}>
                                              <iframe title={`listening-${b.id}`} src={urlEmbedVideo(b.ressourceUrl)} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none" }}/>
                                            </div>
                                          : <video controls src={b.ressourceUrl} style={{ width:"100%", borderRadius:8, marginBottom:12, maxHeight:280 }}/>)
                                      : <audio controls src={b.ressourceUrl} style={{ width:"100%", marginBottom:12 }}/>
                                  )}

                                  {avecQ && b.questions.map((q,qi)=>(
                                    <div key={q.id||qi} style={{ marginBottom:12 }}>
                                      <div style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginBottom:8 }}>Q{qi+1}. {q.texte||q.text}</div>
                                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                                        {(q.options||[]).map((opt,oi)=>{
                                          const sel = rep[qi]===opt;
                                          return (
                                            <label key={oi} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:8, border:`2px solid ${sel?PRIMARY_COLOR:"#e5e7eb"}`, background:sel?`${PRIMARY_COLOR}12`:"#fff", cursor:"pointer" }}>
                                              <input type="radio" name={`bloc${b.id}q${qi}`} value={opt} checked={sel}
                                                onChange={()=>setSubmitBlocs(p=>({ ...p, [b.id]: { ...(p[b.id]||{}), [qi]: opt } }))}
                                                style={{ accentColor:PRIMARY_COLOR }}/>
                                              <span style={{ fontSize:13, color:"#374151" }}>{opt}</span>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}

                                  {b.type==="speaking" && (
                                    <>
                                      {b.instructions && <div style={{ fontSize:13, color:"#374151", lineHeight:1.6, marginBottom:8 }}>{b.instructions}</div>}
                                      {b.ressourceUrl && (
                                        /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(b.ressourceUrl)
                                          ? <audio controls src={b.ressourceUrl} style={{ width:"100%", marginBottom:12 }}/>
                                          : urlEmbedVideo(b.ressourceUrl)
                                            ? <div style={{ position:"relative", paddingTop:"48%", borderRadius:8, overflow:"hidden", marginBottom:12 }}>
                                                <iframe title={`speaking-${b.id}`} src={urlEmbedVideo(b.ressourceUrl)} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none" }}/>
                                              </div>
                                            : <video controls src={b.ressourceUrl} style={{ width:"100%", borderRadius:8, marginBottom:12, maxHeight:280 }}/>
                                      )}
                                      {b.conseil && <div style={{ fontSize:12, color:"#9ca3af", fontStyle:"italic", marginBottom:10 }}>💡 {b.conseil}</div>}

                                      {!!navigator.mediaDevices?.getUserMedia && (
                                        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10, flexWrap:"wrap" }}>
                                          {rep.audioUrl && !recState[b.id]?.recording && (
                                            <>
                                              <audio controls src={rep.audioUrl} style={{ flex:1, minWidth:200 }}/>
                                              <button type="button" onClick={()=>setSubmitBlocs(p=>({ ...p, [b.id]: { ...(p[b.id]||{}), audioUrl:"" } }))}
                                                style={{ padding:"7px 12px", borderRadius:8, border:"1px solid #e5e7eb", background:"#fff", color:"#6b7280", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                                                🔄 Recommencer
                                              </button>
                                            </>
                                          )}
                                          {!rep.audioUrl && !recState[b.id]?.recording && (
                                            <button type="button" onClick={()=>startRecording(b.id)} disabled={recState[b.id]?.uploading}
                                              style={{ padding:"9px 16px", borderRadius:8, border:"none", background:recState[b.id]?.uploading?"#e5e7eb":PRIMARY_COLOR, color:recState[b.id]?.uploading?"#9ca3af":"#fff", fontSize:12.5, fontWeight:700, cursor:recState[b.id]?.uploading?"wait":"pointer" }}>
                                              {recState[b.id]?.uploading ? "⏳ Envoi de l'enregistrement…" : "🎤 Enregistrer ma réponse"}
                                            </button>
                                          )}
                                          {recState[b.id]?.recording && (
                                            <button type="button" onClick={()=>stopRecording(b.id)}
                                              style={{ padding:"9px 16px", borderRadius:8, border:"none", background:"#DC2626", color:"#fff", fontSize:12.5, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:8 }}>
                                              <span style={{ width:8, height:8, borderRadius:"50%", background:"#fff", display:"inline-block" }}/>
                                              ⏹ Arrêter - {fmtRecTime(recState[b.id].seconds||0)}
                                            </button>
                                          )}
                                        </div>
                                      )}

                                      <textarea rows={3} placeholder="Notes complémentaires (optionnel si vous avez enregistré un audio), ou collez un lien d'enregistrement…"
                                        value={rep.texte||""}
                                        onChange={e=>setSubmitBlocs(p=>({ ...p, [b.id]: { ...(p[b.id]||{}), texte: e.target.value } }))}
                                        style={{ width:"100%", borderRadius:8, border:"1px solid #e5e7eb", padding:"10px 12px", fontSize:13, color:"#0f172a", background:"#fff", resize:"vertical", outline:"none", boxSizing:"border-box" }}/>
                                    </>
                                  )}
                                </div>
                              );
                            })}

                            {/* Texte libre */}
                            {((!hasQcm && !isMixte) || isLesTwo) && (
                              <div>
                                <div style={{ fontSize:12, fontWeight:700, color:"#6b7280", marginBottom:6 }}>VOTRE RÉPONSE</div>
                                <textarea rows={6} placeholder="Écrivez votre réponse ici…" value={submitTexte}
                                  onChange={e=>setSubmitTexte(e.target.value)}
                                  style={{ width:"100%", borderRadius:10, border:"1px solid #e5e7eb", padding:"12px 14px", fontSize:13, color:"#0f172a", background:"#f8fafc", resize:"vertical", outline:"none", boxSizing:"border-box" }}/>
                                <div style={{ fontSize:11, color:"#9ca3af", textAlign:"right", marginTop:4 }}>{submitTexte.length} caractère(s)</div>
                              </div>
                            )}

                            {/* Fichier optionnel si les_deux */}
                            {isLesTwo && (
                              <>
                                {!submitFichier && d.rendu?.fichier_url && (
                                  <a href={d.rendu.fichier_url} target="_blank" rel="noreferrer" style={{ display:"flex", alignItems:"center", gap:10, background:"#F0FDF4", border:"1px solid #BBF7D0", borderRadius:10, padding:"10px 14px", textDecoration:"none" }}>
                                    <span style={{ fontSize:18 }}>✅</span>
                                    <div style={{ fontSize:12, color:"#166534", fontWeight:700 }}>Fichier déjà envoyé - {d.rendu.fichier_nom || d.rendu.fichier_url.split("/").pop()}</div>
                                  </a>
                                )}
                                <label style={{ display:"flex", flexDirection:"column", alignItems:"center", border:`2px dashed ${submitFichier?PRIMARY_COLOR:"#d1d5db"}`, borderRadius:12, padding:"16px", cursor:"pointer", background:submitFichier?`${PRIMARY_COLOR}10`:"#f8fafc", gap:8 }}>
                                  <span style={{ fontSize:24 }}>{submitFichier?"✅":"📁"}</span>
                                  <span style={{ fontSize:13, color:submitFichier?PRIMARY_COLOR:"#6b7280", fontWeight:600 }}>{submitFichier?submitFichier.name:d.rendu?.fichier_url?"Cliquez pour remplacer le fichier":"Joindre un fichier (optionnel)"}</span>
                                  <input type="file" accept=".pdf,.docx,.mp4,.mp3,.jpg,.png,.jpeg" style={{ display:"none" }} onChange={e=>setSubmitFichier(e.target.files[0]||null)}/>
                                </label>
                              </>
                            )}

                            {submitErreur && <div style={{ padding:"10px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:8, fontSize:12, color:"#991B1B", fontWeight:600 }}>⚠️ {submitErreur}</div>}
                          </div>
                          <div style={{ padding:"16px 24px", borderTop:"1px solid #e5e7eb", display:"flex", gap:12, justifyContent:"flex-end", flexShrink:0 }}>
                            <button disabled={!canSubmitFinal||submitLoading} onClick={()=>soumettreDevoir(d)}
                              style={{ background:(!canSubmitFinal||submitLoading)?"#e5e7eb":PRIMARY_COLOR, color:(!canSubmitFinal||submitLoading)?"#9ca3af":"#fff", border:"none", borderRadius:8, padding:"10px 20px", fontSize:13, fontWeight:700, cursor:(!canSubmitFinal||submitLoading)?"not-allowed":"pointer" }}>
                              {submitLoading?"⏳ Envoi…":"✅ Soumettre le devoir"}
                            </button>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              );
            })()}

            {/* RÉSULTATS */}
            {activeTab === "resultats" && (
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                  <div><h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>{ui.emojiResultats} Mes Résultats</h2><p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>{mesResultatsDB.length} résultat{mesResultatsDB.length!==1?"s":""}</p></div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 }}>
                  {[
                    { l:"Évaluations corrigées", v:mesResultatsDB.filter(r=>r.statut==="corrige").length, c:"#6366f1" },
                    { l:"En attente",       v:mesResultatsDB.filter(r=>r.statut==="rendu").length, c:"#f59e0b" },
                    { l:"Certifications",   v:certifCount, c:PRIMARY_COLOR },
                    { l:"Total résultats",  v:mesResultatsDB.length, c:"#059669" },
                  ].map(s => (
                    <div key={s.l} style={{ textAlign:"center", padding:14, borderRadius:10, background:"#f8fafc" }}>
                      <div style={{ fontSize:11, color:"#9ca3af" }}>{s.l}</div>
                      <div style={{ fontSize:22, fontWeight:800, color:s.c }}>{s.v}</div>
                      {s.sub && <div style={{ fontSize:10, color:"#9ca3af" }}>{s.sub}</div>}
                    </div>
                  ))}
                </div>

                {/* ── Résultats corrigés par le coach (BDD réelle) ── */}
                {mesResultatsDBLoading && <div style={{ textAlign:"center", padding:20, color:"#9ca3af", fontSize:13 }}>⏳ Chargement des résultats…</div>}
                {!mesResultatsDBLoading && mesResultatsDB.length > 0 && (
                  <div style={{ marginBottom:20 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>Résultats de vos évaluations</span>
                      <span style={{ padding:"2px 8px", borderRadius:8, background:"#dcfce7", color:"#166534", fontSize:11, fontWeight:700 }}>{mesResultatsDB.length} résultat(s)</span>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {[...mesResultatsDB].reverse().map(r => {
                        const note = r.note ?? null;
                        const noteMax = r.note_max ?? 20;
                        const norm = note !== null ? Math.round((note / noteMax) * 100) : null;
                        const couleur = norm !== null ? scoreColor(note, noteMax) : "#9ca3af";
                        const isExpanded = expandedResult === `db-${r.id}`;
                        return (
                          <div key={r.id} style={{ borderRadius:10, border:`1px solid ${isExpanded?couleur+"60":"#e5e7eb"}`, background:"#fff", overflow:"hidden" }}>
                            <div onClick={()=>setExpandedResult(isExpanded?null:`db-${r.id}`)} style={{ padding:"14px 16px", cursor:"pointer", userSelect:"none" }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                                <div>
                                  <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>{r.evaluation?.titre || "Évaluation"}</div>
                                  <div style={{ fontSize:12, color:"#9ca3af" }}>{r.evaluation?.groupe_nom || ""} · 📅 {formatDateFull((r.corrige_at || r.rendu_at || "").split("T")[0])}</div>
                                </div>
                                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                  <div style={{ textAlign:"right" }}>
                                    {note !== null
                                      ? <div style={{ fontSize:22, fontWeight:900, color:couleur }}>{note}/{noteMax}</div>
                                      : <div style={{ fontSize:13, color:"#9ca3af" }}>En attente</div>
                                    }
                                    <span style={{ padding:"2px 8px", borderRadius:8, fontSize:10, fontWeight:700, background:"#e0f2fe", color:"#0891b2" }}>
                                      {r.statut === "corrige" ? "✅ Corrigé" : "⏳ Rendu"}
                                    </span>
                                  </div>
                                  <span style={{ fontSize:12, color:"#9ca3af", display:"inline-block", transform:isExpanded?"rotate(180deg)":"none" }}>▼</span>
                                </div>
                              </div>
                              {norm !== null && <ProgressBar value={norm} color={couleur} height={6} />}
                            </div>
                            {isExpanded && (
                              <div style={{ padding:"14px 16px", borderTop:`1px solid ${couleur}30`, background:"#fafafa" }}>
                                {r.commentaire_coach && (
                                  <div style={{ padding:"10px 14px", borderRadius:8, background:"#fff", border:`1px solid ${couleur}30`, fontSize:13, color:"#374151", borderLeft:`4px solid ${couleur}`, marginBottom:12 }}>
                                    💬 <strong>Commentaire du coach :</strong> {r.commentaire_coach}
                                  </div>
                                )}
                                {note !== null && (
                                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                                    {[
                                      { l:"Note", v:`${note}/${noteMax}`, c:couleur },
                                      { l:"Pourcentage", v:norm!==null?`${norm}%`:"-", c:couleur },
                                      { l:"Résultat", v:norm!==null?(norm>=50?"✅ Validé":"❌ Non validé"):"-", c:norm!==null?(norm>=50?"#22c55e":"#ef4444"):"#9ca3af" },
                                    ].map(s=>(
                                      <div key={s.l} style={{ textAlign:"center", padding:"10px 12px", borderRadius:8, background:"#fff", border:"1px solid #e5e7eb" }}>
                                        <div style={{ fontSize:10, color:"#9ca3af" }}>{s.l}</div>
                                        <div style={{ fontSize:16, fontWeight:800, color:s.c }}>{s.v}</div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!mesResultatsDBLoading && mesResultatsDB.length === 0 && (
                  <div style={{ textAlign:"center", padding:"40px 20px", background:"#f8fafc", borderRadius:16, color:"#9ca3af" }}>
                    <div style={{ fontSize:36, marginBottom:10 }}>📊</div>
                    <div style={{ fontWeight:600, color:"#374151", marginBottom:6 }}>Aucun résultat pour l'instant</div>
                    <div style={{ fontSize:13 }}>Vos résultats d'évaluations apparaîtront ici après correction par votre coach.</div>
                  </div>
                )}
              </div>
            )}

            {/* OBJECTIFS & CERTIFICATIONS */}
            {activeTab === "objectifs" && (
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                  <div><h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>{isCoachingGroupe ? "Mes Objectifs & Certifications" : "Mes Objectifs"}</h2><p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Suivi de vos objectifs personnels{isCoachingGroupe ? " et de vos certifications" : ""}</p></div>
                </div>
                {profil.objectif && (
                  <div style={{ padding:20, borderRadius:12, background:GRADIENT_HEADER, color:"#fff", marginBottom:24 }}>
                    <div style={{ fontSize:12, color:"#fecaca", marginBottom:6 }}>OBJECTIF PRINCIPAL</div>
                    <div style={{ fontSize:17, fontWeight:700 }}>{profil.objectif}</div>
                  </div>
                )}
                <div style={{ textAlign:"center", padding:"60px 20px", background:"#f8fafc", borderRadius:16, color:"#9ca3af" }}>
                  <div style={{ fontSize:52, marginBottom:16 }}>🎯</div>
                  <div style={{ fontWeight:700, fontSize:16, color:"#374151", marginBottom:8 }}>Aucun objectif suivi pour l'instant</div>
                  <div style={{ fontSize:13, maxWidth:340, margin:"0 auto", lineHeight:1.6 }}>
                    Vos objectifs personnalisés apparaîtront ici une fois définis avec votre coach.
                  </div>
                </div>

                {isCoachingGroupe && (
                  <>
                    <h3 style={{ margin:"28px 0 14px", fontSize:15, fontWeight:700, color:"#0f172a" }}>🏅 Mes Certifications</h3>
                    <div style={{ textAlign:"center", padding:"60px 20px", background:"#f8fafc", borderRadius:16, color:"#9ca3af" }}>
                      <div style={{ fontSize:52, marginBottom:16 }}>🏅</div>
                      <div style={{ fontWeight:700, fontSize:16, color:"#374151", marginBottom:8 }}>Aucune certification pour l'instant</div>
                      <div style={{ fontSize:13, maxWidth:340, margin:"0 auto", lineHeight:1.6 }}>
                        Vos certifications BET apparaîtront ici une fois validées par l'administration après la fin de votre parcours.
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}


            {/* CONTACTS & SUPPORT */}
            {activeTab === "contacts" && (
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                  <div>
                    <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>Contacts & Support</h2>
                    <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Votre équipe dédiée - coach, commercial(e), PA advisor</p>
                  </div>
                </div>

                {mesContactsLoading && (
                  <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>⏳ Chargement des contacts…</div>
                )}

                {!mesContactsLoading && mesContacts.length === 0 && (
                  <div style={{ textAlign:"center", padding:"40px 20px", background:"#f8fafc", borderRadius:16, color:"#9ca3af" }}>
                    <div style={{ fontSize:36, marginBottom:10 }}>📞</div>
                    <div style={{ fontWeight:600, color:"#374151", marginBottom:6 }}>Aucun contact assigné</div>
                    <div style={{ fontSize:13 }}>Votre équipe apparaîtra ici une fois votre classe activée.</div>
                  </div>
                )}

                {!mesContactsLoading && mesContacts.length > 0 && (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px,1fr))", gap:16 }}>
                    {mesContacts.map((contact, idx) => {
                      const roleColors = {
                        "Coach":         { bg:"#e0f2fe", color:"#0369a1", icon:"👨‍🏫" },
                        "Commercial(e)": { bg:"#dcfce7", color:"#166534", icon:"📊" },
                        "Onboarding":    { bg:"#fff7ed", color:"#c2410c", icon:"🏷️" },
                        "PA Advisor":    { bg:"#eff6ff", color:"#1d4ed8", icon:"📋" },
                        "Customer Care": { bg:"#fdf2f8", color:"#9d174d", icon:"💬" },
                        "Assistante":    { bg:"#f5f3ff", color:"#6d28d9", icon:"👤" },
                      };
                      const rc = roleColors[contact.role] || { bg:PRIMARY_LIGHT, color:PRIMARY_COLOR, icon:"👤" };
                      return (
                        <div key={contact.id || idx} style={{ background:"#fff", borderRadius:12, border:`1px solid ${rc.color}20`, padding:16 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                            <div style={{ width:44, height:44, borderRadius:"50%", background:rc.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>{rc.icon}</div>
                            <div>
                              <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>{contact.nom || "-"}</div>
                              <div style={{ fontSize:11, fontWeight:600, color:rc.color, background:rc.bg, display:"inline-block", padding:"2px 8px", borderRadius:20, marginTop:2 }}>{contact.role}</div>
                            </div>
                          </div>
                          {contact.telephone && <div style={{ marginBottom:8, fontSize:12, color:"#374151" }}>📞 {contact.telephone}</div>}
                          {contact.email && <div style={{ marginBottom:8, fontSize:12, color:"#374151" }}>✉️ {contact.email}</div>}
                          {contact.disponible && <div style={{ fontSize:11, color:"#9ca3af", marginBottom:12 }}>📅 {contact.disponible}</div>}
                          {/* Des boutons, plus des liens `tel:`/`mailto:` : sur un poste sans
                              client de messagerie, le second n'ouvrait rien et le premier non
                              plus. Chacun ouvre un petit modal qui agit vraiment. */}
                          <div style={{ display:"flex", gap:8 }}>
                            {contact.telephone && (
                              <button type="button" onClick={()=>{ setTelCopie(false); setContactTelModal({ contact }); }}
                                style={{ flex:1, textAlign:"center", padding:"7px", background:rc.bg, color:rc.color, border:"none", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                                📞 Appeler
                              </button>
                            )}
                            {contact.email && (
                              <button type="button" onClick={()=>{ setContactMailForm({ sujet:"", message:"" }); setContactMailModal({ contact }); }}
                                style={{ flex:1, textAlign:"center", padding:"7px", background:rc.bg, color:rc.color, border:"none", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                                ✉️ Écrire
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* BOUTIQUE */}
            {activeTab === "boutique" && (
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                  <div>
                    <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>Boutique BET</h2>
                    <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>{produits.length} article(s) disponible(s)</p>
                  </div>
                </div>

                {/* Sous-onglets */}
                <div style={{ display:"flex", gap:6, borderBottom:"2px solid #e2e8f0", marginBottom:20 }}>
                  {[
                    { key:"produits", label:"🛍️ Produits" },
                    { key:"achats",   label:"📦 Mes achats", count: mesCommandes.length || null },
                  ].map(t => (
                    <button key={t.key} onClick={()=>setBoutiqueSubTab(t.key)}
                      style={{ padding:"9px 16px", border:"none", background:"none", cursor:"pointer", fontSize:13, fontWeight:boutiqueSubTab===t.key?800:500, color:boutiqueSubTab===t.key?PRIMARY_COLOR:"#64748b", borderBottom:boutiqueSubTab===t.key?`2.5px solid ${PRIMARY_COLOR}`:"2.5px solid transparent", marginBottom:-2, display:"flex", alignItems:"center", gap:6 }}>
                      {t.label}
                      {!!t.count && <span style={{ background:PRIMARY_COLOR, color:"#fff", borderRadius:999, fontSize:10, fontWeight:800, padding:"1px 7px" }}>{t.count}</span>}
                    </button>
                  ))}
                </div>

                {boutiqueSubTab === "achats" ? (
                  mesCommandesLoading ? (
                    <div style={{ textAlign:"center", padding:48, color:"#9ca3af" }}>⏳ Chargement…</div>
                  ) : mesCommandes.length === 0 ? (
                    <div style={{ textAlign:"center", padding:60, color:"#9ca3af" }}>
                      <div style={{ fontSize:48, marginBottom:12 }}>📦</div>
                      <div style={{ fontWeight:600, fontSize:15 }}>Aucun achat pour le moment</div>
                      <div style={{ fontSize:13, marginTop:4 }}>Vos commandes boutique apparaîtront ici avec leur référence de paiement.</div>
                    </div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {mesCommandes.map(cmd => {
                        const STATUT_CMD = {
                          en_attente: { label:"⏳ En attente de paiement", bg:"#fef9c3", color:"#854d0e" },
                          confirmee:  { label:"✅ Payée - confirmée",       bg:"#d1fae5", color:"#065f46" },
                          livree:     { label:"📬 Livrée",                  bg:"#dbeafe", color:"#1e40af" },
                          annulee:    { label:"↩ Annulée",                  bg:"#f3f4f6", color:"#6b7280" },
                        };
                        const s = STATUT_CMD[cmd.statut] || STATUT_CMD.en_attente;
                        return (
                          <div key={cmd.id} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:10, padding:"12px 16px" }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                              <div>
                                <div style={{ fontWeight:700, color:"#0f172a", fontSize:13 }}>
                                  {(cmd.items || []).map(i => `${i.nom} ×${i.quantite}`).join(", ")}
                                </div>
                                <div style={{ color:"#9ca3af", marginTop:3, fontSize:12 }}>
                                  {new Date(cmd.created_at).toLocaleDateString("fr-FR",{ day:"2-digit", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit" })}
                                </div>
                              </div>
                              <div style={{ textAlign:"right" }}>
                                <div style={{ fontWeight:800, color:"#0f172a", fontSize:15 }}>{Number(cmd.total).toLocaleString("fr-FR")} FCFA</div>
                                <span style={{ display:"inline-block", marginTop:4, padding:"2px 8px", borderRadius:999, fontSize:10, fontWeight:700, background:s.bg, color:s.color }}>{s.label}</span>
                              </div>
                            </div>
                            {cmd.touchpoint && (
                              <div style={{ marginTop:8, paddingTop:8, borderTop:"1px solid #f1f5f9", display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:6, fontSize:11, color:"#6b7280" }}>
                                <div><span style={{ color:"#9ca3af" }}>Réf. paiement : </span><span style={{ fontFamily:"monospace", fontWeight:600, color:"#374151" }}>{cmd.touchpoint.order_number}</span></div>
                                {cmd.touchpoint.payment_mode && (
                                  <div><span style={{ color:"#9ca3af" }}>Mode : </span><span style={{ fontWeight:600, color:"#374151" }}>{cmd.touchpoint.payment_mode}</span></div>
                                )}
                                {cmd.touchpoint.updated_at && (
                                  <div><span style={{ color:"#9ca3af" }}>Confirmé le : </span><span style={{ fontWeight:600, color:"#374151" }}>{new Date(cmd.touchpoint.updated_at).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}</span></div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <>
                    {/* Filtres catégories */}
                    {produits.length > 0 && (
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:20 }}>
                        {["Tous", ...new Set(produits.map(p => p.categorie).filter(Boolean))].map(cat => (
                          <button key={cat} onClick={()=>setProduitCategorie(cat)} style={{ padding:"5px 14px", borderRadius:20, border:"1px solid", fontSize:12, cursor:"pointer", fontWeight:produitCategorie===cat?700:400, background:produitCategorie===cat?PRIMARY_COLOR:"#fff", color:produitCategorie===cat?"#fff":"#6b7280", borderColor:produitCategorie===cat?PRIMARY_COLOR:"#e5e7eb" }}>{cat}</button>
                        ))}
                      </div>
                    )}
                    {produitsLoading && <div style={{ textAlign:"center", padding:48, color:"#9ca3af" }}>⏳ Chargement…</div>}
                    {!produitsLoading && produits.length === 0 && (
                      <div style={{ textAlign:"center", padding:60, color:"#9ca3af" }}>
                        <div style={{ fontSize:48, marginBottom:12 }}>🛒</div>
                        <div style={{ fontWeight:600, fontSize:15 }}>Aucun article disponible</div>
                        <div style={{ fontSize:13, marginTop:4 }}>La boutique sera bientôt disponible.</div>
                      </div>
                    )}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px,1fr))", gap:20 }}>
                      {produits
                        .filter(p => produitCategorie === "Tous" || p.categorie === produitCategorie)
                        .map(produit => {
                          const imgs = produit.images?.length ? produit.images : (produit.image_url ? [produit.image_url] : []);
                          const img  = imgs[0];
                          return (
                            <div key={produit.id} style={{ borderRadius:12, border:`1px solid ${PRIMARY_COLOR}20`, background:"#fff", overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", display:"flex", flexDirection:"column" }}>
                              {img
                                ? <img src={img} alt={produit.nom} style={{ width:"100%", height:180, objectFit:"cover" }} onError={e=>{ e.target.style.display="none"; }}/>
                                : <div style={{ height:140, background:PRIMARY_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontSize:52 }}>🛒</div>
                              }
                              <div style={{ padding:"14px 16px", flex:1, display:"flex", flexDirection:"column" }}>
                                <div style={{ fontSize:10, fontWeight:700, color:PRIMARY_COLOR, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>{produit.categorie}</div>
                                <h3 style={{ fontSize:14, fontWeight:700, color:"#0f172a", margin:"0 0 6px" }}>{produit.nom}</h3>
                                <p style={{ fontSize:12, color:"#6b7280", marginBottom:12, flex:1, lineHeight:1.5 }}>{produit.description || "-"}</p>
                                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                                  <div style={{ fontSize:20, fontWeight:800, color:PRIMARY_COLOR }}>{Number(produit.prix).toLocaleString()} FCFA</div>
                                  <div style={{ fontSize:11, color: produit.stock > 0 ? "#22c55e" : "#ef4444", fontWeight:600 }}>{produit.stock > 0 ? `${produit.stock} en stock` : "Rupture"}</div>
                                </div>
                                <button
                                  disabled={produit.stock === 0}
                                  onClick={()=>{ setSelectedProduit(produit); setShowAchatModal(true); setAchatForm({ nom: profil.prenom ? `${profil.prenom} ${profil.nom}`.trim() : "", email: profil.email || "", telephone: profil.phone || "" }); }}
                                  style={{ width:"100%", padding:"9px", background:produit.stock>0?PRIMARY_COLOR:"#e5e7eb", color:produit.stock>0?"#fff":"#9ca3af", border:"none", borderRadius:8, cursor:produit.stock>0?"pointer":"not-allowed", fontWeight:700, fontSize:13 }}
                                >{produit.stock > 0 ? "🛒 Commander" : "Indisponible"}</button>
                              </div>
                            </div>
                          );
                        })
                      }
                    </div>
                  </>
                )}
              </div>
            )}

            {/* MESSAGES */}
            {activeTab === "messages" && (
              <div>
                {/* Sous-onglets - chat groupe uniquement si coaching groupe */}
                <div style={{ display:"flex", gap:8, marginBottom:20 }}>
                  {[
                    { key:"prive",  label: isCoachingPrive ? "💬 Messages" : "💬 Messages privés", show: true, badge: 0 },
                    // Le compteur vit ICI et pas seulement sur l'onglet Messages : le
                    // sous-onglet ouvert par défaut est « privé », donc ouvrir Messages ne
                    // montre pas la conversation de classe. Le badge doit dire OÙ ça se
                    // passe, et ne disparaître qu'une fois le chat réellement ouvert.
                    { key:"groupe", label:`👥 Chat groupe${realGI?.nom ? ` - ${realGI.nom}` : ""}`, show: isCoachingGroupe, badge: msgNonLus },
                    // N'apparaît que s'il est réellement membre d'un groupe : un onglet
                    // toujours vide n'apprend rien et encombre la barre.
                    { key:"libres", label:`💬 Groupes${groupesLibres.length ? ` (${groupesLibres.length})` : ""}`, show: groupesLibres.length > 0, badge: 0 },
                  ].filter(t => t.show).map(t => (
                    <button key={t.key} onClick={() => setMsgSubTab(t.key)}
                      style={{ padding:"9px 18px", borderRadius:10, border:`1.5px solid ${msgSubTab===t.key ? PRIMARY_COLOR : "#e5e7eb"}`, background: msgSubTab===t.key ? PRIMARY_LIGHT : "#fff", color: msgSubTab===t.key ? PRIMARY_COLOR : "#6b7280", fontWeight: msgSubTab===t.key ? 700 : 500, fontSize:13, cursor:"pointer" }}>
                      {t.label}
                      {t.badge > 0 && (
                        <span style={{ marginLeft:7, display:"inline-block", minWidth:18, padding:"1px 6px", borderRadius:99, background:"#dc2626", color:"#fff", fontSize:10.5, fontWeight:800, lineHeight:"16px", textAlign:"center" }}>
                          {t.badge > 99 ? "99+" : t.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Messagerie privée - même MessagerieTab (useFirebaseChat) que le coach côté
                    EspaceProfesseur.jsx, pour garantir le même schéma de doc Firestore
                    (chats/{[id1,id2].sort().join('_')}) des deux côtés. Auto-ouverte sur le
                    coach via openWithUser quand un coach est assigné (coaching privé). */}
                {msgSubTab === "prive" && (
                  <MessagerieTab
                    accentColor={PRIMARY_COLOR}
                    profil={espaceInfo?.profil ? { ...espaceInfo.profil, role: "apprenant" } : undefined}
                    token={localStorage.getItem("user_token")}
                    openWithUser={realCoach?.id ? {
                      uid:  realCoach.id,
                      nom:  `${realCoach.prenom || ""} ${realCoach.nom || ""}`.trim(),
                      role: "coach",
                      ts:   realCoach.id,
                    } : null}
                  />
                )}

                {/* Chat groupe - le même composant que le coach, la commerciale, l'onboarding
                    et le PA. Sa version locale, écrite avant, n'avait ni photos de profil ni
                    liens cliquables : exactement la divergence que ce partage évite. */}
                {msgSubTab === "groupe" && isCoachingGroupe && (
                  !monGroupeId ? (
                    <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", padding:"40px 20px", textAlign:"center", color:"#9ca3af" }}>
                      <div style={{ fontSize:32, marginBottom:10 }}>👥</div>
                      <div style={{ fontWeight:600 }}>Vous n'êtes pas encore affecté(e) à un groupe.</div>
                    </div>
                  ) : (
                    <ChatGroupe
                      groupes={[{ id: monGroupeId, nom: realGI?.nom || "Ma classe", statut: realGI?.statut || "actif" }]}
                      profil={realP}
                      token={localStorage.getItem("user_token")}
                      accent={PRIMARY_COLOR}
                      accentClair={PRIMARY_LIGHT}
                      onMessageEnvoye={pingChatGamif}
                    />
                  )
                )}

                {/* Groupes d'événement - le MÊME `ChatGroupe` que la classe, qui sait déjà
                    gérer plusieurs fils et rend les liens cliquables. `source="libre"`
                    pointe sur `chats/libre_{id}`, là où le personnel écrit. */}
                {msgSubTab === "libres" && (
                  groupesLibres.length === 0 ? (
                    <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", padding:"40px 20px", textAlign:"center", color:"#9ca3af" }}>
                      <div style={{ fontSize:32, marginBottom:10 }}>💬</div>
                      <div style={{ fontWeight:600 }}>Vous ne faites partie d'aucun groupe pour l'instant.</div>
                      <div style={{ fontSize:13, marginTop:5 }}>Votre assistante vous y ajoutera si besoin.</div>
                    </div>
                  ) : (
                    <ChatGroupe
                      source="libre"
                      groupes={groupesLibres.map(c => ({ id: c.id, nom: c.nom, statut: "actif" }))}
                      profil={realP}
                      token={localStorage.getItem("user_token")}
                      accent={PRIMARY_COLOR}
                      accentClair={PRIMARY_LIGHT}
                      onMessageEnvoye={pingChatGamif}
                    />
                  )
                )}
              </div>
            )}

                        {/* SESSION LIVE */}
            {activeTab === "session_live" && (() => {
              const PLATFORMS = [
                { id:"zoom",        label:"Zoom",         icon:"💻", color:"#2D8CFF", bg:"#e8f1ff" },
                { id:"meet",        label:"Google Meet",  icon:"🎥", color:"#00897B", bg:"#e0f2f1" },
                { id:"teams",       label:"Teams",        icon:"💼", color:"#6264A7", bg:"#ede9f7" },
                { id:"jitsi",       label:"Jitsi",        icon:"🌐", color:"#97D640", bg:"#f2fce4" },
                { id:"webex",       label:"Webex",        icon:"📹", color:"#00BCEB", bg:"#e0f7fd" },
                { id:"presentiel",  label:"Présentiel",   icon:"🏢", color:"#059669", bg:"#ecfdf5" },
                { id:"autre",       label:"Autre",        icon:"🔗", color:"#6b7280", bg:"#f3f4f6" },
              ];
              const now = new Date();
              // Filtrer les sessions selon le type de coaching
              // `sessionsLiveVisibles` couvre déjà les deux cas - groupe, ou coach attitré
              // pour un coaching privé sans groupe - et borne à la fenêtre de présence.
              const sessionsFiltered = sessionsLiveVisibles;
              const upcoming = sessionsFiltered
                .filter(s => s.statut !== "terminee" && new Date(`${s.date}T${s.heure}`) > now)
                .sort((a,b) => new Date(`${a.date}T${a.heure}`) - new Date(`${b.date}T${b.heure}`));
              const cloturees = sessionsFiltered
                .filter(s => s.statut === "terminee")
                .sort((a,b) => new Date(`${b.date}T${b.heure}`) - new Date(`${a.date}T${a.heure}`));
              const past = sessionsFiltered
                .filter(s => s.statut !== "terminee" && new Date(`${s.date}T${s.heure}`) <= now)
                .sort((a,b) => new Date(`${b.date}T${b.heure}`) - new Date(`${a.date}T${a.heure}`));

              const formatCountdown = (dateStr, heureStr) => {
                const diff = new Date(`${dateStr}T${heureStr}`) - now;
                if (diff < 0) return null;
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                if (h > 24) return `Dans ${Math.floor(h/24)}j ${h%24}h`;
                if (h > 0)  return `Dans ${h}h${m > 0 ? m+"min" : ""}`;
                return `Dans ${m} min`;
              };

              const copyLink = (lien) => { navigator.clipboard.writeText(lien).then(()=>toast.success("Lien copié !")); };

              const ApprCard = ({ s, isPast }) => {
                const plat = PLATFORMS.find(p=>p.id===s.plateforme) || PLATFORMS[5];
                const countdown = formatCountdown(s.date, s.heure);
                const grp = s.groupes;
                const isClosed = s.statut === "terminee";
                /* La salle n'existe qu'à partir de T-10. Le présentiel est hors règle : il
                   n'y a pas de salle à ouvrir, seulement un lieu où se rendre. Une séance
                   passée ou terminée garde ses boutons « Détails », qui ne rejoignent rien. */
                const debutSession = new Date(`${s.date}T${s.heure}`);
                const ouvertureSalle = new Date(debutSession.getTime() - MS_OUVERTURE_SALLE);
                const estPresentielCarte = s.plateforme === "presentiel";
                const trop_tot = !estPresentielCarte && !isClosed && !isPast && new Date() < ouvertureSalle;
                const minutesAvantOuverture = trop_tot
                  ? Math.max(1, Math.round((ouvertureSalle - new Date()) / 60000)) : 0;
                const maPresence = isClosed ? (mesPresencesLive[s.date] || null) : null;
                const presenceBadge = maPresence === "present"
                  ? { bg:"#D1FAE5", c:"#065F46", label:"✅ Présent" }
                  : maPresence === "retard"
                  ? { bg:"#FEF3C7", c:"#92400E", label:"⏱ Retard" }
                  : maPresence === "absent"
                  ? { bg:"#FEE2E2", c:"#991B1B", label:"❌ Absent" }
                  : null;
                return (
                  <div style={{ background:"#fff", borderRadius:12, border:`1.5px solid ${isClosed?"#e5e7eb":isPast?"#e5e7eb":plat.bg}`, overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,0.05)", opacity:isPast&&!isClosed?0.75:1 }}>
                    <div style={{ height:3, background:isClosed?"#94a3b8":isPast?"#e5e7eb":`linear-gradient(90deg,${plat.color},${plat.color}88)` }}/>
                    <div style={{ padding:"14px 16px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5, flexWrap:"wrap" }}>
                            <span style={{ padding:"2px 9px", borderRadius:20, fontSize:11, fontWeight:700, background:plat.bg, color:plat.color }}>{plat.icon} {plat.label}</span>
                            {grp?.nom && <span style={{ padding:"2px 9px", borderRadius:20, fontSize:11, fontWeight:600, background:"#ede9f7", color:"#6264A7" }}>👥 {grp.nom}{grp.niveau?` · ${grp.niveau}`:""}</span>}
                            {!isPast && countdown && <span style={{ padding:"2px 9px", borderRadius:20, fontSize:11, fontWeight:700, background:"#d1fae5", color:"#065f46" }}>🟢 {countdown}</span>}
                            {isClosed && <span style={{ padding:"2px 9px", borderRadius:20, fontSize:11, fontWeight:700, background:"#f1f5f9", color:"#475569" }}>🔒 Clôturée</span>}
                            {!isClosed && isPast && <span style={{ padding:"2px 9px", borderRadius:20, fontSize:11, background:"#f1f5f9", color:"#6b7280" }}>Terminée</span>}
                            {presenceBadge && <span style={{ padding:"2px 9px", borderRadius:20, fontSize:11, fontWeight:700, background:presenceBadge.bg, color:presenceBadge.c }}>{presenceBadge.label}</span>}
                          </div>
                          <div style={{ fontWeight:800, fontSize:14, color:"#0f172a", marginBottom:4 }}>{s.titre}</div>
                          <div style={{ fontSize:12, color:"#6b7280", display:"flex", gap:12, flexWrap:"wrap" }}>
                            <span>📅 {new Date(s.date).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}</span>
                            <span>🕐 {s.heure}</span>
                            <span>⏱ {s.duree} min</span>
                          </div>
                          {s.notes && <div style={{ marginTop:6, fontSize:12, color:"#374151", fontStyle:"italic" }}>💬 {s.notes}</div>}
                          {(s.contenu_titres||[]).length > 0 && (
                            <div style={{ marginTop:6, display:"flex", flexWrap:"wrap", gap:4 }}>
                              {(s.contenu_titres||[]).map((t,i) => (
                                <span key={i} style={{ padding:"2px 8px", borderRadius:8, fontSize:10, fontWeight:600, background:"#e0f2fe", color:"#0369a1" }}>📦 {t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                          <button onClick={()=>setLiveJoinModal(s)}
                            disabled={trop_tot}
                            title={trop_tot ? `La salle ouvre ${MINUTES_OUVERTURE_SALLE} min avant le cours` : undefined}
                            style={{ padding:"7px 14px", borderRadius:8, border:"none", background:(isClosed||isPast||trop_tot)?"#e5e7eb":plat.color, color:(isClosed||isPast||trop_tot)?"#6b7280":"#fff", fontSize:12, fontWeight:700, cursor:trop_tot?"not-allowed":"pointer", whiteSpace:"nowrap" }}>
                            {isClosed ? "🔍 Voir" : isPast ? "🔍 Détails" : estPresentielCarte ? "🏢 Détails"
                              : trop_tot ? (minutesAvantOuverture < 60 ? `🔒 dans ${minutesAvantOuverture} min` : "🔒 Pas encore ouverte")
                              : "▶ Rejoindre"}
                          </button>
                          {/* Le lien suit la même règle : le laisser copiable rouvrirait la
                              porte qu'on vient de fermer. */}
                          {!isClosed && !estPresentielCarte && !trop_tot && <button onClick={()=>copyLink(s.lien)} title="Copier le lien"
                            style={{ padding:"7px 10px", borderRadius:8, border:"1.5px solid #e2e8f0", background:"#fff", color:"#374151", fontSize:13, cursor:"pointer" }}>🔗</button>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              };

              return (
                <div>
                  <div style={{ marginBottom:20 }}>
                    <h2 style={{ margin:0, fontSize:17, fontWeight:800, color:"#0f172a" }}>{isCoachingPrive ? "📅 Mes séances de coaching" : "📡 Sessions Live"}</h2>
                    <p style={{ margin:"3px 0 0", fontSize:13, color:"#9ca3af" }}>
                      {isCoachingPrive
                        ? `${upcoming.length} séance${upcoming.length!==1?"s":""} à venir · cliquez sur une séance pour voir les détails`
                        : `${upcoming.length} session${upcoming.length!==1?"s":""} à venir · cliquez sur une session pour rejoindre`}
                    </p>
                  </div>

                  {liveLoadingAppr && <p style={{ textAlign:"center", color:"#9ca3af", padding:40 }}>Chargement…</p>}

                  {!liveLoadingAppr && upcoming.length === 0 && cloturees.length === 0 && (
                    <div style={{ textAlign:"center", padding:"50px 20px", background:"#fef2f2", borderRadius:16, border:"1px solid #fecaca" }}>
                      <div style={{ fontSize:44, marginBottom:10 }}>{isCoachingPrive ? "📅" : "📡"}</div>
                      <div style={{ fontWeight:700, fontSize:15, color:"#0f172a", marginBottom:6 }}>Aucune séance planifiée</div>
                      <p style={{ color:"#9ca3af", fontSize:13, marginTop:0 }}>
                        {isCoachingPrive ? "Votre coach n'a pas encore programmé de séance. Revenez bientôt !" : "Votre coach n'a pas encore programmé de session live. Revenez bientôt !"}
                      </p>
                    </div>
                  )}

                  {!liveLoadingAppr && upcoming.length > 0 && (
                    <div style={{ marginBottom:20 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ width:8, height:8, borderRadius:"50%", background:"#22c55e", display:"inline-block" }}/>
                        À venir ({upcoming.length})
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {upcoming.map(s => <ApprCard key={s.id} s={s} isPast={false} />)}
                      </div>
                    </div>
                  )}

                  {!liveLoadingAppr && cloturees.length > 0 && (
                    <div style={{ marginBottom:20 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ width:8, height:8, borderRadius:"50%", background:"#94a3b8", display:"inline-block" }}/>
                        {isCoachingPrive ? `Séances clôturées (${cloturees.length})` : `Sessions clôturées (${cloturees.length})`}
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {cloturees.map(s => <ApprCard key={s.id} s={s} isPast={true} />)}
                      </div>
                    </div>
                  )}

                  {!liveLoadingAppr && past.length > 0 && (
                    <div>
                      <button onClick={()=>setLivePastOpenAppr(v=>!v)}
                        style={{ display:"flex", alignItems:"center", gap:8, fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.07em", background:"none", border:"none", cursor:"pointer", padding:"4px 0", marginBottom:10 }}>
                        <span>{livePastOpenAppr?"▼":"▶"}</span> {isCoachingPrive ? `Autres séances passées (${past.length})` : `Autres sessions passées (${past.length})`}
                      </button>
                      {livePastOpenAppr && (
                        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                          {past.map(s => <ApprCard key={s.id} s={s} isPast={true} />)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── MODAL REJOINDRE / VOIR (apprenant) ── */}
                  {liveJoinModal && (() => {
                    const jm = liveJoinModal;
                    const plat = PLATFORMS.find(p=>p.id===jm.plateforme) || PLATFORMS[5];
                    const isClosed = jm.statut === "terminee";
                    const isPast = isClosed || new Date(`${jm.date}T${jm.heure}`) <= new Date();
                    const countdown = formatCountdown(jm.date, jm.heure);
                    const grp = jm.groupes;
                    const maPresenceModal = isClosed ? (mesPresencesLive[jm.date] || null) : null;
                    const presenceBadgeModal = maPresenceModal === "present"
                      ? { bg:"#D1FAE5", c:"#065F46", label:"✅ Vous étiez présent(e)" }
                      : maPresenceModal === "retard"
                      ? { bg:"#FEF3C7", c:"#92400E", label:"⏱ Vous étiez en retard" }
                      : maPresenceModal === "absent"
                      ? { bg:"#FEE2E2", c:"#991B1B", label:"❌ Vous étiez absent(e)" }
                      : null;
                    const titresContenu = jm.contenu_titres || [];
                    return (
                      <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.72)", zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
                        onClick={()=>setLiveJoinModal(null)}>
                        <div style={{ background:"#fff", borderRadius:18, width:"min(94vw,500px)", overflow:"hidden", boxShadow:"0 24px 60px rgba(0,0,0,0.35)" }}
                          onClick={e=>e.stopPropagation()}>

                          <div style={{ background: isClosed ? "linear-gradient(135deg,#374151,#6b7280)" : `linear-gradient(135deg,#1e3a8a,${plat.color})`, padding:"22px 24px 18px", color:"#fff", position:"relative" }}>
                            <button onClick={()=>setLiveJoinModal(null)}
                              style={{ position:"absolute", top:14, right:14, background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", width:30, height:30, borderRadius:"50%", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                            <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", letterSpacing:"0.1em", marginBottom:6 }}>
                              {isCoachingPrive ? (isClosed ? "🔒 SÉANCE CLÔTURÉE" : "SÉANCE DE COACHING") : (isClosed ? "🔒 SESSION CLÔTURÉE" : "SESSION LIVE")}
                            </div>
                            <div style={{ fontSize:20, fontWeight:900, marginBottom:10, paddingRight:40 }}>{jm.titre}</div>
                            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                              <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:"rgba(255,255,255,0.18)" }}>{plat.icon} {plat.label}</span>
                              {grp?.nom && <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, background:"rgba(255,255,255,0.15)" }}>👥 {grp.nom}</span>}
                              {!isPast && countdown && <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:"rgba(34,197,94,0.35)" }}>🟢 {countdown}</span>}
                              {isClosed && presenceBadgeModal && <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:"rgba(255,255,255,0.2)" }}>{presenceBadgeModal.label}</span>}
                            </div>
                          </div>

                          <div style={{ padding:"20px 24px 24px" }}>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
                              {[
                                { icon:"📅", label:"Date",  val: new Date(jm.date).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"}) },
                                { icon:"🕐", label:"Heure", val: jm.heure },
                                { icon:"⏱",  label:"Durée", val: `${jm.duree} min` },
                              ].map(item => (
                                <div key={item.label} style={{ background:"#f8fafc", borderRadius:9, padding:"10px 12px", textAlign:"center" }}>
                                  <div style={{ fontSize:18, marginBottom:3 }}>{item.icon}</div>
                                  <div style={{ fontSize:10, color:"#9ca3af", fontWeight:600, textTransform:"uppercase" }}>{item.label}</div>
                                  <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{item.val}</div>
                                </div>
                              ))}
                            </div>

                            {/* Badge présence apprenant (session clôturée) */}
                            {isClosed && (
                              <div style={{ marginBottom:16, padding:"12px 16px", borderRadius:10, border:`1.5px solid ${presenceBadgeModal?.c || "#e5e7eb"}22`, background: presenceBadgeModal?.bg || "#f8fafc", display:"flex", alignItems:"center", gap:10 }}>
                                <span style={{ fontSize:22 }}>{maPresenceModal === "present" ? "✅" : maPresenceModal === "retard" ? "⏱" : maPresenceModal === "absent" ? "❌" : "📋"}</span>
                                <div>
                                  <div style={{ fontSize:12, fontWeight:700, color: presenceBadgeModal?.c || "#374151" }}>
                                    {presenceBadgeModal?.label || "Présence non renseignée"}
                                  </div>
                                  <div style={{ fontSize:11, color:"#9ca3af" }}>{isCoachingPrive ? "Séance du" : "Session du"} {new Date(jm.date).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"})}</div>
                                </div>
                              </div>
                            )}

                            {/* Cours / modules partagés */}
                            {titresContenu.length > 0 && (
                              <div style={{ marginBottom:16 }}>
                                <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>📚 Supports de cours partagés</div>
                                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                                  {titresContenu.map((titre, i) => (
                                    <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 12px", background:"#f0f9ff", borderRadius:8, border:"1px solid #bae6fd", fontSize:12, color:"#0369a1", fontWeight:600 }}>
                                      📦 {titre}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {!isClosed && jm.plateforme !== "presentiel" && (
                              <div style={{ marginBottom:jm.notes?14:20 }}>
                                <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:6 }}>Lien de la réunion</div>
                                <div style={{ display:"flex", gap:8, alignItems:"center", background:"#f8fafc", borderRadius:9, padding:"10px 12px", border:"1px solid #e5e7eb" }}>
                                  <span style={{ fontSize:16, flexShrink:0 }}>{plat.icon}</span>
                                  <span style={{ flex:1, fontSize:12, color:"#374151", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{jm.lien}</span>
                                  <button onClick={()=>copyLink(jm.lien)}
                                    style={{ flexShrink:0, padding:"5px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", color:"#374151", fontSize:11, fontWeight:600, cursor:"pointer" }}>
                                    🔗 Copier
                                  </button>
                                </div>
                              </div>
                            )}

                            {!isClosed && jm.plateforme === "presentiel" && (
                              <div style={{ marginBottom:jm.notes?14:20, padding:"14px 16px", background:"#ecfdf5", borderRadius:10, border:"1.5px solid #6ee7b7" }}>
                                <div style={{ fontSize:11, fontWeight:700, color:"#065f46", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:6 }}>📍 Lieu du cours</div>
                                <div style={{ fontSize:13, fontWeight:700, color:"#065f46" }}>🏢 Séance présentielle - rendez-vous en salle</div>
                                {jm.groupes?.nom && <div style={{ fontSize:12, color:"#047857", marginTop:4 }}>Groupe : {jm.groupes.nom}</div>}
                                <div style={{ fontSize:12, color:"#047857", marginTop:2 }}>Aucun lien de visioconférence requis</div>
                              </div>
                            )}

                            {jm.notes && (
                              <div style={{ marginBottom:16, padding:"10px 14px", background:"#fffbeb", borderRadius:9, border:"1px solid #fde68a", fontSize:12, color:"#92400e" }}>
                                💬 {jm.notes}
                              </div>
                            )}

                            {isClosed ? (
                              <div style={{ textAlign:"center", padding:"14px", borderRadius:12, background:"#f1f5f9", border:"1px solid #e2e8f0", fontSize:13, color:"#64748b", fontWeight:600 }}>
                                🔒 {isCoachingPrive ? "Cette séance est terminée" : "Cette session est terminée"}
                              </div>
                            ) : jm.plateforme === "presentiel" ? (
                              <div style={{ textAlign:"center", padding:"14px", borderRadius:12, background:"#ecfdf5", border:"1.5px solid #6ee7b7", fontSize:13, color:"#065f46", fontWeight:700 }}>
                                🏢 Séance en présentiel - rendez-vous à la salle le {new Date(jm.date).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})} à {jm.heure}
                              </div>
                            ) : (
                              <button onClick={() => {
                                const isJitsi = jm.lien && (jm.lien.includes("jit.si") || jm.lien.includes("meet.jit"));
                                if (isJitsi) {
                                  setLiveJoinModal(null);
                                  setJitsiModalSession(jm);
                                } else {
                                  const w = Math.min(1280, window.screen.width - 40);
                                  const h = Math.min(800,  window.screen.height - 80);
                                  const left = Math.round((window.screen.width  - w) / 2);
                                  const top  = Math.round((window.screen.height - h) / 2);
                                  // Même raison que côté coach : la salle vit dans une autre
                                  // fenêtre, et l'apprenant ne doit pas être déconnecté
                                  // pendant qu'il suit son cours.
                                  suivreFenetreLive(window.open(jm.lien, 'bet_session_live', `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`));
                                  setLiveJoinModal(null);
                                }
                              }}
                                style={{ width:"100%", padding:"14px", borderRadius:12, border:"none", background:`linear-gradient(135deg,#1e3a8a,${plat.color})`, color:"#fff", fontSize:15, fontWeight:800, cursor:"pointer" }}>
                                ▶ Rejoindre sur {plat.label}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* PAIEMENT */}
            {activeTab === "paiement" && (() => {
              // Chaque ligne de paiements_parcours est un versement individuel - son statut
              // ("partiel"/"payé") décrit l'état CUMULÉ après CE versement, pas s'il faut ou
              // non compter son propre montant_recu. Ne sommer que les lignes "payé" ignorait
              // à tort l'argent réellement reçu sur toute ligne encore marquée "partiel" (ex:
              // un premier versement de 100k sur 200k, suivi d'un second qui solde à 200k -
              // le premier montant_recu disparaissait du total encaissé). montant_du répète le
              // même total sur chaque ligne (jamais additif) : on prend le plus grand, pas la somme.
              const totalPayé = profil.paiements.reduce((s, p) => s + (p.montant_recu||0), 0);
              const totalDuMax = profil.paiements.reduce((s, p) => Math.max(s, p.montant_du||0), 0);
              const totalDu2  = Math.max(0, totalDuMax - totalPayé);
              return (
              <div>
                <div style={{ marginBottom:24 }}>
                  <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>💳 Mes Paiements</h2>
                  <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Plan de paiement, historique et règlement en ligne</p>
                </div>

                {/* ── LE PLAN MENSUEL ──
                    Les blocs qui suivent lisent `plan_paiement.tranches`, l'ancien modèle.
                    Les dossiers d'aujourd'hui sont en plan MENSUEL (`mois_paiements`) :
                    cet onglet restait donc entièrement vide pour eux, alors même que le
                    cron leur envoyait des rappels. */}
                {moisDuPlan.length > 0 && (
                  <div style={{ border:"1px solid #e5e7eb", borderRadius:12, overflow:"hidden", marginBottom:20 }}>
                    <div style={{ padding:"12px 16px", background:"#0f172a", color:"#fff", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                      <div>
                        <div style={{ fontWeight:800, fontSize:13.5 }}>
                          💳 Plan mensuel{planMensuel?.mensualite ? ` - ${Number(planMensuel.mensualite).toLocaleString("fr-FR")} F/mois` : ""}
                        </div>
                        <div style={{ fontSize:11, color:"rgba(255,255,255,0.65)", marginTop:2 }}>
                          {planMensuel?.date_debut_formation ? `Début : ${new Date(planMensuel.date_debut_formation).toLocaleDateString("fr-FR")}` : ""}
                          {planMensuel?.actif === false ? " · facturation suspendue" : ""}
                        </div>
                      </div>
                      <div style={{ fontSize:11.5, color:"rgba(255,255,255,0.8)" }}>
                        {moisDuPlan.filter(m => statutMois(m, planMensuel) === "paye").length}
                        {" / "}
                        {moisDuPlan.filter(m => statutMois(m, planMensuel) !== "annule").length} mois réglés
                      </div>
                    </div>

                    <div>
                      {moisDuPlan.map((m, i) => {
                        const st = statutMois(m, planMensuel);
                        const S = {
                          paye:       { icone:"✅", bg:"#f0fdf4", c:"#15803d", l:"Réglé" },
                          partiel:    { icone:"🟡", bg:"#fffbeb", c:"#b45309", l:"Partiel" },
                          retard:     { icone:"🔴", bg:"#fef2f2", c:"#b91c1c", l:"En retard" },
                          en_attente: { icone:"⏳", bg:"#fff",    c:"#64748b", l:"À venir" },
                          annule:     { icone:"🚫", bg:"#fff7ed", c:"#9a3412", l:"Annulée" },
                        }[st];
                        const ech = dateEcheanceMois(m.periode, planMensuel?.jour_echeance, m.echeance_override);
                        const paye = totalPayeMois(m);
                        const reste = Math.max(0, (m.montant || 0) - paye);

                        return (
                          <div key={m.id || m.periode} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 16px",
                            background:S.bg, borderTop: i ? "1px solid #f1f5f9" : "none", flexWrap:"wrap" }}>
                            <span style={{ fontSize:15 }}>{S.icone}</span>
                            <div style={{ flex:1, minWidth:150 }}>
                              <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{libelleMois(m.periode)}</div>
                              <div style={{ fontSize:11, color:"#94a3b8" }}>
                                {ech ? `Échéance : ${ech.toLocaleDateString("fr-FR")}` : "-"}
                                {st === "partiel" ? ` · ${Number(paye).toLocaleString("fr-FR")} F déjà versés` : ""}
                              </div>
                              {/* Un mois annulé DIT pourquoi : « 0 F » sans explication se lit
                                  comme une erreur de saisie. */}
                              {st === "annule" && (
                                <div style={{ fontSize:11, color:"#9a3412", marginTop:2 }}>
                                  Annulée - {m.neutralise?.motif || "formation interrompue"}
                                </div>
                              )}
                            </div>
                            <div style={{ textAlign:"right" }}>
                              <div style={{ fontSize:12.5, fontWeight:800, color:S.c }}>
                                {st === "annule"
                                  ? <span style={{ textDecoration:"line-through", opacity:.6 }}>{Number(m.montant_initial ?? m.montant ?? 0).toLocaleString("fr-FR")} F</span>
                                  : `${Number(st === "partiel" ? reste : (m.montant || 0)).toLocaleString("fr-FR")} F`}
                              </div>
                              <div style={{ fontSize:10.5, color:S.c, fontWeight:700 }}>{S.l}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ padding:"10px 16px", background:"#f8fafc", borderTop:"1px solid #e5e7eb", fontSize:11.5, color:"#64748b", lineHeight:1.6 }}>
                      Une nouvelle mensualité apparaît automatiquement chaque mois. Vous recevez
                      un rappel <strong>7 jours</strong>, <strong>3 jours</strong> et <strong>la veille</strong> de
                      chaque échéance, avec un lien de paiement.
                    </div>
                  </div>
                )}

                {/* ── Alertes retard / échéance ── */}
                {overdueTranches.length > 0 && (
                  <div style={{ background:"#fef2f2", border:"2px solid #fca5a5", borderRadius:12, padding:"16px 20px", marginBottom:16 }}>
                    <div style={{ fontWeight:800, color:"#dc2626", fontSize:14, marginBottom:10 }}>🔴 {overdueTranches.length} paiement(s) en retard</div>
                    {overdueTranches.map(t => (
                      <div key={t.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #fecaca" }}>
                        <div>
                          <span style={{ fontWeight:700, fontSize:13 }}>{t.label}</span>
                          <span style={{ fontSize:11, color:"#9ca3af", marginLeft:10 }}>Échéance : {formatDateFull(t.date_echeance)}</span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                          <span style={{ fontWeight:800, color:"#dc2626" }}>{(t.montant||0).toLocaleString("fr-FR")} FCFA</span>
                          <button onClick={() => handlePayerTranche(t)} disabled={cpLoading && cpTranche?.id === t.id}
                            style={{ padding:"7px 16px", background:"#dc2626", color:"#fff", border:"none", borderRadius:7, cursor:"pointer", fontWeight:700, fontSize:12 }}>
                            {cpLoading && cpTranche?.id === t.id ? "⏳…" : "💳 Payer maintenant"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {upcomingTranches.length > 0 && (
                  <div style={{ background:"#fff7ed", border:"2px solid #fed7aa", borderRadius:12, padding:"14px 20px", marginBottom:16 }}>
                    <div style={{ fontWeight:800, color:"#c2410c", fontSize:13, marginBottom:8 }}>⏰ {upcomingTranches.length} paiement(s) à régler dans 7 jours</div>
                    {upcomingTranches.map(t => (
                      <div key={t.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0" }}>
                        <span style={{ fontSize:13, fontWeight:600 }}>{t.label} · {formatDateFull(t.date_echeance)}</span>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <span style={{ fontWeight:700, color:"#c2410c" }}>{(t.montant||0).toLocaleString("fr-FR")} FCFA</span>
                          <button onClick={() => handlePayerTranche(t)} disabled={cpLoading && cpTranche?.id === t.id}
                            style={{ padding:"6px 14px", background:"#f97316", color:"#fff", border:"none", borderRadius:7, cursor:"pointer", fontWeight:700, fontSize:12 }}>
                            {cpLoading && cpTranche?.id === t.id ? "⏳…" : "💳 Payer"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Résumé stats ── */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px,1fr))", gap:12, marginBottom:24 }}>
                  {[
                    { label:"Total encaissé",  value:`${totalPayé.toLocaleString("fr-FR")} FCFA`,   color:"#16a34a", icon:"✅" },
                    { label:"Reste à régler",  value:`${(totalDu||totalDu2).toLocaleString("fr-FR")} FCFA`, color:(totalDu||totalDu2)>0?"#dc2626":"#16a34a", icon:(totalDu||totalDu2)>0?"⚠️":"🎉" },
                    { label:"Paiements reçus", value:profil.paiements.filter(p=>(p.montant_recu||0)>0).length, color:PRIMARY_COLOR, icon:"🧾" },
                    { label:"Tranches",        value: tranches.length > 0 ? `${tranches.filter(t=>t.statut==="payé").length} / ${tranches.length}` : `${profil.paiements.filter(p=>(p.montant_recu||0)>0).length} / ${profil.paiements.length}`, color:"#7c3aed", icon:"📅" },
                  ].map(s => (
                    <div key={s.label} style={{ background:"#fff", padding:"14px 16px", borderRadius:12, border:"1px solid #e5e7eb", display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ width:40, height:40, borderRadius:10, background:s.color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>{s.icon}</div>
                      <div><div style={{ fontSize:11, color:"#9ca3af" }}>{s.label}</div><div style={{ fontSize:16, fontWeight:800, color:s.color }}>{s.value}</div></div>
                    </div>
                  ))}
                </div>

                {/* ── Plan de paiement ── */}
                {tranches.length > 0 && (
                  <div style={{ marginBottom:28 }}>
                    <h3 style={{ fontSize:15, fontWeight:700, color:"#0f172a", marginBottom:12 }}>📅 Plan de paiement échelonné</h3>
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {tranches.map((t, idx) => {
                        const isPayé    = estStatutPaye(t.statut);
                        const isRetard  = !isPayé && new Date(t.date_echeance) < today7;
                        const isSoon    = !isPayé && !isRetard && new Date(t.date_echeance) <= in7days;
                        const borderCol = isPayé ? "#86efac" : isRetard ? "#fca5a5" : isSoon ? "#fed7aa" : "#e5e7eb";
                        const bgCol     = isPayé ? "#f0fdf4" : isRetard ? "#fff5f5" : isSoon ? "#fffbeb" : "#fff";
                        const badgeBg   = isPayé ? "#dcfce7" : isRetard ? "#fee2e2" : isSoon ? "#fef3c7" : "#f1f5f9";
                        const badgeCol  = isPayé ? "#166534" : isRetard ? "#dc2626" : isSoon ? "#92400e" : "#374151";
                        const badgeLabel= isPayé ? "✅ Payé" : isRetard ? "🔴 En retard" : isSoon ? "⏰ Bientôt dû" : "⏳ À venir";
                        return (
                          <div key={t.id || idx} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", borderRadius:10, border:`1.5px solid ${borderCol}`, background:bgCol }}>
                            <div>
                              <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>{t.label || `Tranche ${idx+1}`}</div>
                              <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>📅 Échéance : {formatDateFull(t.date_echeance)}</div>
                              {isPayé && t.date_paiement_effectif && (
                                <div style={{ fontSize:11, color:"#059669", marginTop:2 }}>✅ Payé le {formatDateFull(t.date_paiement_effectif)}</div>
                              )}
                              {t.notes && <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>📝 {t.notes}</div>}
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                              <div style={{ textAlign:"right" }}>
                                <div style={{ fontSize:17, fontWeight:800, color: isRetard ? "#dc2626" : "#0f172a" }}>{(t.montant||0).toLocaleString("fr-FR")} FCFA</div>
                                <span style={{ padding:"3px 10px", borderRadius:10, fontSize:10, fontWeight:700, background:badgeBg, color:badgeCol }}>{badgeLabel}</span>
                              </div>
                              {!isPayé && (
                                <button onClick={() => handlePayerTranche(t)} disabled={cpLoading && cpTranche?.id === t.id}
                                  style={{ padding:"9px 18px", background: isRetard ? "#dc2626" : PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:13, whiteSpace:"nowrap", opacity: cpLoading && cpTranche?.id === t.id ? 0.6 : 1 }}>
                                  {cpLoading && cpTranche?.id === t.id ? "⏳ Redirection…" : "💳 Payer avec TouchPoint"}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Historique des paiements réels ── */}
                <div style={{ marginBottom:16 }}>
                  <h3 style={{ fontSize:15, fontWeight:700, color:"#0f172a", marginBottom:12 }}>🧾 Historique des paiements</h3>
                  {profil.paiements.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"36px 0", color:"#9ca3af", background:"#f8fafc", borderRadius:12, border:"1px solid #e5e7eb" }}>
                      <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
                      <p style={{ margin:0, fontSize:13 }}>Aucun paiement enregistré pour le moment.</p>
                      <p style={{ margin:"6px 0 0", fontSize:12, color:"#cbd5e1" }}>Vos paiements enregistrés par votre conseillère apparaîtront ici.</p>
                    </div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {profil.paiements.map((p) => {
                        // Pas de badge "Payé/En attente" par ligne : le statut d'UN versement
                        // décrit l'état cumulé du dossier après CE versement, pas ce versement
                        // isolément - deux lignes du même dossier peuvent porter des statuts
                        // d'apparence contradictoire alors que l'ensemble est cohérent (cf. le
                        // total encaissé/reste à régler juste au-dessus, seul indicateur fiable).
                        const dateStr = p.date ? new Date(p.date).toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"}) : "-";
                        return (
                          <div key={p.id} style={{ borderRadius:12, border:"1.5px solid #e5e7eb", background:"#fff", padding:"14px 18px" }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                                  <span style={{ fontSize:18 }}>💳</span>
                                  <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>{p.description}</div>
                                </div>
                                <div style={{ display:"flex", gap:10, flexWrap:"wrap", fontSize:12, color:"#6b7280", marginBottom: (p.ref||p.notes) ? 6 : 0 }}>
                                  <span>📅 {dateStr}</span>
                                  <span>💳 {p.mode}</span>
                                  {p.offre && <span style={{ padding:"1px 8px", borderRadius:99, background:"#dbeafe", color:"#1d4ed8", fontWeight:600 }}>🎓 {p.offre}</span>}
                                </div>
                                {p.ref && <div style={{ fontSize:11, color:"#9ca3af" }}>🔑 Réf : {p.ref}</div>}
                                {p.operateur && <div style={{ fontSize:11, color:"#9ca3af" }}>📱 Opérateur : <strong style={{ color:"#374151" }}>{p.operateur}</strong></div>}
                                {p.token && <div style={{ fontSize:11, color:"#9ca3af", fontFamily:"monospace" }}>🔒 Token TouchPoint : {p.token}</div>}
                                {p.notes && <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>📝 {p.notes}</div>}
                              </div>
                              <div style={{ textAlign:"right", flexShrink:0 }}>
                                <div style={{ fontSize:18, fontWeight:900, color:"#16a34a" }}>
                                  {(p.montant_recu||0).toLocaleString("fr-FR")} <span style={{ fontSize:11, fontWeight:500 }}>FCFA</span>
                                </div>
                                {p.montant_du > 0 && (
                                  <div style={{ fontSize:11, color:"#9ca3af" }}>
                                    Total dû : {p.montant_du.toLocaleString("fr-FR")} FCFA
                                  </div>
                                )}
                              </div>
                            </div>
                            {p.preuve_image && (
                              <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid #e5e7eb" }}>
                                <a href={p.preuve_image} target="_blank" rel="noreferrer"
                                  style={{ fontSize:12, color:"#2563eb", fontWeight:600, textDecoration:"none" }}>
                                  🧾 Voir le reçu / justificatif →
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ padding:"10px 14px", borderRadius:8, background:"#f0f4ff", border:"1px solid #c7d2fe", fontSize:12, color:"#3730a3" }}>
                  {contactAssistance?.type === "assistante" ? (
                    <>
                      💬 Pour toute question, contactez votre assistante
                      {contactAssistance.nom ? <> <strong>{contactAssistance.nom}</strong></> : null} :{" "}
                      {contactAssistance.telephone && (
                        <a href={`tel:${String(contactAssistance.telephone).replace(/\s/g,"")}`} style={{ color:"#3730a3", fontWeight:700 }}>
                          {contactAssistance.telephone}
                        </a>
                      )}
                      {contactAssistance.telephone && contactAssistance.email ? " · " : null}
                      {contactAssistance.email && (
                        <a href={`mailto:${contactAssistance.email}`} style={{ color:"#3730a3", fontWeight:700 }}>
                          {contactAssistance.email}
                        </a>
                      )}
                    </>
                  ) : (contactAssistance?.email || contactAssistance?.telephone) ? (
                    <>
                      💬 Pour toute question, contactez le service clientèle :{" "}
                      {contactAssistance.telephone && (
                        <a href={`tel:${String(contactAssistance.telephone).replace(/\s/g,"")}`} style={{ color:"#3730a3", fontWeight:700 }}>
                          {contactAssistance.telephone}
                        </a>
                      )}
                      {contactAssistance.telephone && contactAssistance.email ? " · " : null}
                      {contactAssistance.email && (
                        <a href={`mailto:${contactAssistance.email}`} style={{ color:"#3730a3", fontWeight:700 }}>
                          {contactAssistance.email}
                        </a>
                      )}
                    </>
                  ) : (
                    /* Ni assistante ni configuration lisible : on renvoie vers l'adresse
                       publique de BET plutôt que vers une boîte inexistante. */
                    <>💬 Pour toute question, contactez le service clientèle : <strong>contact@binniesenglish.com</strong></>
                  )}
                </div>
              </div>
              );
            })()}

            {/* ════ MON TÉMOIGNAGE ════ */}
            {activeTab === "temoignage" && (
              <div style={{ maxWidth:640, margin:"0 auto" }}>
                {/* Header */}
                <div style={{ marginBottom:24 }}>
                  <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:"#0f172a" }}>⭐ Mon témoignage</h2>
                  <p style={{ margin:"4px 0 0", fontSize:13, color:"#9ca3af" }}>
                    Partagez votre expérience BET - votre témoignage sera publié sur notre site après validation.
                  </p>
                </div>

                {/* Non certifié */}
                {!estCertifie && (
                  <div style={{ background:"#fff", borderRadius:16, border:"2px dashed #e2e8f0", padding:36, textAlign:"center" }}>
                    <div style={{ fontSize:52, marginBottom:12 }}>🔒</div>
                    <h3 style={{ margin:"0 0 8px", fontSize:17, fontWeight:800, color:"#0f172a" }}>
                      Témoignage disponible après certification
                    </h3>
                    <p style={{ fontSize:13, color:"#6b7280", lineHeight:1.7, maxWidth:400, margin:"0 auto 20px" }}>
                      Obtenez votre certification BET (TOEIC, TOEFL, IELTS…) pour débloquer cette fonctionnalité et partager votre succès avec la communauté.
                    </p>
                    <button onClick={() => setActiveTab("objectifs")}
                      style={{ padding:"10px 22px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:9, cursor:"pointer", fontWeight:700, fontSize:13 }}>
                      Voir mes certifications
                    </button>
                  </div>
                )}

                {/* Déjà soumis */}
                {estCertifie && temoExistant && (
                  <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
                    <div style={{ height:4, background: temoExistant.statut==="actif" ? "#22c55e" : temoExistant.statut==="en_attente" ? "#f59e0b" : "#ef4444" }} />
                    <div style={{ padding:24 }}>
                      {/* Statut badge */}
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                        <div style={{ fontWeight:800, fontSize:16, color:"#0f172a" }}>Votre témoignage</div>
                        <span style={{
                          padding:"5px 14px", borderRadius:20, fontSize:12, fontWeight:700,
                          background: temoExistant.statut==="actif" ? "#dcfce7" : temoExistant.statut==="en_attente" ? "#fef3c7" : "#fee2e2",
                          color:      temoExistant.statut==="actif" ? "#166534" : temoExistant.statut==="en_attente" ? "#92400e" : "#991b1b",
                        }}>
                          {temoExistant.statut==="actif" ? "✅ Publié" : temoExistant.statut==="en_attente" ? "⏳ En attente de validation" : "❌ Rejeté"}
                        </span>
                      </div>
                      {/* Aperçu */}
                      <div style={{ background:"#f8fafc", borderRadius:12, padding:18, border:"1px solid #e2e8f0" }}>
                        <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:12 }}>
                          <div style={{ width:44, height:44, borderRadius:"50%", background:"#1e4080", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24 }}>
                            {temoExistant.avatar || "🎓"}
                          </div>
                          <div>
                            <div style={{ fontWeight:700, color:"#0f172a" }}>{profil.prenom} {profil.nom}</div>
                            <div style={{ fontSize:11, color:"#9ca3af" }}>{temoExistant.role}</div>
                          </div>
                        </div>
                        <div style={{ color:"#f59e0b", fontSize:18, marginBottom:8 }}>
                          {"★".repeat(temoExistant.etoiles||5)}
                          <span style={{ color:"#e5e7eb" }}>{"☆".repeat(5-(temoExistant.etoiles||5))}</span>
                        </div>
                        <p style={{ fontSize:13, color:"#374151", fontStyle:"italic", lineHeight:1.65, margin:"0 0 10px" }}>
                          « {temoExistant.texte} »
                        </p>
                        {temoExistant.photo_url && (
                          <div style={{ borderRadius:8, overflow:"hidden", border:"1px solid #e5e7eb", maxHeight:120 }}>
                            <img src={temoExistant.photo_url} alt="Photo du diplôme" style={{ width:"100%", height:120, objectFit:"cover", display:"block" }} />
                          </div>
                        )}
                      </div>
                      {temoExistant.statut==="en_attente" && (
                        <p style={{ fontSize:12, color:"#9ca3af", marginTop:14, textAlign:"center" }}>
                          Notre équipe examine votre témoignage. Vous serez notifié une fois publié.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Formulaire (certifié + pas encore soumis) */}
                {estCertifie && !temoExistant && (
                  <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
                    {/* Bandeau certification */}
                    <div style={{ background:GRADIENT_HEADER, padding:"14px 20px", display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ width:40, height:40, borderRadius:"50%", background:"rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>🏅</div>
                      <div>
                        <div style={{ color:"#fff", fontWeight:700, fontSize:14 }}>
                          Certifié BET - {certifPrincipale?.titre?.split(/\s*[\u2014-]\s*/)[1]?.trim() || certifPrincipale?.titre}
                        </div>
                        <div style={{ color:"rgba(255,255,255,0.75)", fontSize:11 }}>
                          Score {certifPrincipale?.score}/100 · {new Date(certifPrincipale?.date).toLocaleDateString("fr-FR")}
                        </div>
                      </div>
                    </div>

                    <div style={{ padding:24 }}>
                      {/* Étoiles */}
                      <div style={{ marginBottom:20 }}>
                        <label style={{ fontSize:13, fontWeight:700, color:"#374151", display:"block", marginBottom:8 }}>
                          Votre note globale *
                        </label>
                        <div style={{ display:"flex", gap:8 }}>
                          {[1,2,3,4,5].map(n => (
                            <div key={n} onClick={() => setTemoForm(f=>({...f,etoiles:n}))}
                              style={{ fontSize:28, cursor:"pointer", color: n<=temoForm.etoiles ? "#f59e0b" : "#e5e7eb", transition:"color .15s, transform .12s", transform: n<=temoForm.etoiles ? "scale(1.15)" : "scale(1)" }}>
                              ★
                            </div>
                          ))}
                          <span style={{ marginLeft:4, fontSize:13, color:"#9ca3af", alignSelf:"center" }}>
                            {["","Mauvais","Passable","Bien","Très bien","Excellent"][temoForm.etoiles]}
                          </span>
                        </div>
                      </div>

                      {/* Photo du diplôme */}
                      <div style={{ marginBottom:20 }}>
                        <label style={{ fontSize:13, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>
                          🎓 Photo de votre diplôme / certificat <span style={{ fontWeight:400, color:"#9ca3af", fontSize:11 }}>(optionnelle, max 10 Mo)</span>
                        </label>
                        <p style={{ fontSize:11, color:"#9ca3af", margin:"0 0 10px" }}>Ajoutez une photo de votre certificat TOEIC, TOEFL, IELTS… pour illustrer votre témoignage.</p>
                        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                          <div style={{ width:80, height:56, borderRadius:8, overflow:"hidden", background:"#f9fafb", border:"2px dashed #e5e7eb", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            {temoPhotoPreview
                              ? <img src={temoPhotoPreview} alt="Diplôme" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                              : <span style={{ fontSize:26 }}>🏅</span>}
                          </div>
                          <div>
                            <input ref={temoPhotoInputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleTemoPhotoChange} />
                            <button onClick={() => temoPhotoInputRef.current?.click()} disabled={temoPhotoLoading}
                              style={{ padding:"8px 16px", background:"#f3f4f6", border:"1px solid #e5e7eb", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12, color:"#374151" }}>
                              {temoPhotoLoading ? "⏳ Upload…" : temoPhotoUrl ? "✅ Changer le diplôme" : "📁 Ajouter le diplôme"}
                            </button>
                            {temoPhotoError && <p style={{ color:"#ef4444", fontSize:11, margin:"5px 0 0" }}>{temoPhotoError}</p>}
                            {temoPhotoUrl && !temoPhotoLoading && <p style={{ color:"#166534", fontSize:11, margin:"5px 0 0" }}>✓ Photo du diplôme prête</p>}
                          </div>
                        </div>
                      </div>

                      {/* Avatar (si pas de photo) */}
                      {!temoPhotoUrl && (
                      <div style={{ marginBottom:20 }}>
                        <label style={{ fontSize:13, fontWeight:700, color:"#374151", display:"block", marginBottom:8 }}>Avatar emoji</label>
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          {EMOJI_TEMO.map(e => (
                            <div key={e} onClick={() => setTemoForm(f=>({...f,avatar:e}))}
                              style={{ width:40, height:40, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, cursor:"pointer", border:`2px solid ${temoForm.avatar===e?"#1e4080":"#e5e7eb"}`, background:temoForm.avatar===e?"#e0e7ff":"#f8fafc", transition:"border-color .15s, background .15s, transform .12s", transform:temoForm.avatar===e?"scale(1.1)":"scale(1)" }}>
                              {e}
                            </div>
                          ))}
                        </div>
                      </div>
                      )}

                      {/* Rôle */}
                      <div style={{ marginBottom:16 }}>
                        <label style={{ fontSize:13, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>Votre titre / poste</label>
                        <input value={temoForm.role} onChange={e => setTemoForm(f=>({...f,role:e.target.value}))}
                          placeholder="Ex: Chef de projet · Orange CI"
                          style={{ width:"100%", padding:"10px 14px", border:"1px solid #e5e7eb", borderRadius:9, fontSize:13, boxSizing:"border-box", outline:"none", transition:"border-color .15s" }}
                          onFocus={e=>e.target.style.borderColor="#1e4080"} onBlur={e=>e.target.style.borderColor="#e5e7eb"} />
                      </div>

                      {/* Texte */}
                      <div style={{ marginBottom:20 }}>
                        <label style={{ fontSize:13, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>
                          Votre témoignage * <span style={{ fontSize:11, color:"#9ca3af", fontWeight:400 }}>({temoForm.texte.length}/500 caractères, min. 30)</span>
                        </label>
                        <textarea value={temoForm.texte} onChange={e => setTemoForm(f=>({...f,texte:e.target.value.slice(0,500)}))}
                          rows={5} placeholder="Racontez votre expérience avec BET English Training : les méthodes, les résultats, ce qui vous a le plus aidé…"
                          style={{ width:"100%", padding:"10px 14px", border:"1px solid #e5e7eb", borderRadius:9, fontSize:13, resize:"vertical", boxSizing:"border-box", outline:"none", lineHeight:1.65, transition:"border-color .15s" }}
                          onFocus={e=>e.target.style.borderColor="#1e4080"} onBlur={e=>e.target.style.borderColor="#e5e7eb"} />
                      </div>

                      {/* Aperçu */}
                      {temoForm.texte.trim().length > 0 && (
                        <div style={{ marginBottom:22, padding:16, borderRadius:12, background:"linear-gradient(135deg,#f0f4ff,#fdf2f8)", border:"1px solid #e0e7ff" }}>
                          <div style={{ fontSize:11, color:"#9ca3af", marginBottom:10, fontWeight:600, letterSpacing:.5 }}>APERÇU</div>
                          <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:10 }}>
                            <div style={{ width:40, height:40, borderRadius:"50%", background:"#1e4080", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, overflow:"hidden" }}>
                              {temoPhotoPreview ? <img src={temoPhotoPreview} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : temoForm.avatar}
                            </div>
                            <div>
                              <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{profil.prenom} {profil.nom}</div>
                              <div style={{ fontSize:11, color:"#9ca3af" }}>{temoForm.role}</div>
                            </div>
                          </div>
                          <div style={{ color:"#f59e0b", fontSize:15, marginBottom:6 }}>
                            {"★".repeat(temoForm.etoiles)}<span style={{ color:"#e5e7eb" }}>{"☆".repeat(5-temoForm.etoiles)}</span>
                          </div>
                          <p style={{ fontSize:12, color:"#374151", fontStyle:"italic", lineHeight:1.65, margin:0 }}>
                            « {temoForm.texte} »
                          </p>
                        </div>
                      )}

                      {/* Bouton */}
                      <button onClick={submitTemoignage} disabled={temoSubmitting || temoForm.texte.trim().length < 30}
                        style={{ width:"100%", padding:"13px", background: temoForm.texte.trim().length < 30 ? "#e5e7eb" : PRIMARY_COLOR, color: temoForm.texte.trim().length < 30 ? "#9ca3af" : "#fff", border:"none", borderRadius:10, cursor: temoForm.texte.trim().length < 30 ? "not-allowed" : "pointer", fontWeight:800, fontSize:15, transition:"background .2s" }}>
                        {temoSubmitting ? "Envoi en cours…" : "📤 Soumettre mon témoignage"}
                      </button>
                      <p style={{ fontSize:11, color:"#9ca3af", textAlign:"center", marginTop:10 }}>
                        Votre témoignage sera examiné par notre équipe avant publication sur le site.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}


          </div>
        </div>

        {/* MODAL ACHAT BOUTIQUE */}
        {showAchatModal && selectedProduit && (
          <Modal title={`🛒 Commander - ${selectedProduit.nom}`} onClose={()=>setShowAchatModal(false)} wide>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 }}>
              <div style={{ textAlign:"center", padding:20, borderRadius:12, background:PRIMARY_LIGHT, border:`1px solid ${PRIMARY_COLOR}20` }}>
                {selectedProduit.image_url
                  ? <img src={selectedProduit.image_url} alt={selectedProduit.nom} style={{ width:"100%", maxHeight:160, objectFit:"cover", borderRadius:8, marginBottom:10 }}/>
                  : <div style={{ fontSize:52, marginBottom:10 }}>🛒</div>
                }
                <div style={{ fontSize:15, fontWeight:800, color:"#0f172a", marginBottom:4 }}>{selectedProduit.nom}</div>
                <div style={{ fontSize:11, color:PRIMARY_COLOR, fontWeight:600, marginBottom:8 }}>{selectedProduit.categorie}</div>
                <p style={{ fontSize:12, color:"#6b7280", marginBottom:10 }}>{selectedProduit.description}</p>
                <div style={{ fontSize:26, fontWeight:900, color:PRIMARY_COLOR }}>{Number(selectedProduit.prix).toLocaleString()} FCFA</div>
              </div>
              <div>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#374151", marginBottom:4 }}>Nom complet *</label>
                <input type="text" value={achatForm.nom} onChange={e=>setAchatForm(f=>({...f,nom:e.target.value}))} placeholder="Votre nom complet" style={{ width:"100%", padding:9, borderRadius:6, border:"1px solid #d1d5db", fontSize:13, boxSizing:"border-box", marginBottom:10 }}/>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#374151", marginBottom:4 }}>Email *</label>
                <input type="email" value={achatForm.email} onChange={e=>setAchatForm(f=>({...f,email:e.target.value}))} placeholder="votre@email.com" style={{ width:"100%", padding:9, borderRadius:6, border:"1px solid #d1d5db", fontSize:13, boxSizing:"border-box", marginBottom:10 }}/>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#374151", marginBottom:4 }}>Téléphone</label>
                <input type="tel" value={achatForm.telephone} onChange={e=>setAchatForm(f=>({...f,telephone:e.target.value}))} placeholder="+225 XX XX XX XX" style={{ width:"100%", padding:9, borderRadius:6, border:"1px solid #d1d5db", fontSize:13, boxSizing:"border-box", marginBottom:10 }}/>
              </div>
            </div>
            <div style={{ padding:"12px 16px", borderRadius:8, background:"#eff6ff", border:"1px solid #bfdbfe", fontSize:12, color:"#1e40af", marginBottom:16 }}>
              💳 Vous allez être redirigé(e) vers TouchPoint (Orange Money, Wave, carte bancaire…) pour régler cette commande en toute sécurité.
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={()=>setShowAchatModal(false)} style={{ padding:"9px 16px", background:"#e5e7eb", color:"#374151", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 }}>Annuler</button>
              <button disabled={achatSending} onClick={async ()=>{
                if (achatSending) return;
                if(!achatForm.nom.trim()||!achatForm.email.trim()){ toast.error("Veuillez remplir votre nom et email."); return; }
                setAchatSending(true);
                try {
                  const rCmd = await fetch(`${API_URL}/api/boutique/commandes`, {
                    method:"POST", headers:{"Content-Type":"application/json"},
                    body: JSON.stringify({
                      client_nom: achatForm.nom.trim(),
                      client_email: achatForm.email.trim(),
                      client_telephone: achatForm.telephone?.trim() || null,
                      items:[{ produit_id: selectedProduit.id, nom: selectedProduit.nom, prix_unitaire: selectedProduit.prix, quantite: 1 }],
                    }),
                  });
                  if (!rCmd.ok) { const d = await rCmd.json(); toast.error(d.error || "Erreur lors de la commande"); return; }
                  const commande = await rCmd.json();

                  const rPay = await fetch(`${API_URL}/api/touchpoint/initiate`, {
                    method:"POST", headers:{"Content-Type":"application/json"},
                    body: JSON.stringify({
                      client_nom:       achatForm.nom.trim(),
                      client_email:     achatForm.email.trim(),
                      client_telephone: achatForm.telephone?.trim() || null,
                      offre_label:      `Boutique - ${selectedProduit.nom}`,
                      montant:          Number(selectedProduit.prix),
                      message:          JSON.stringify({ context:"boutique", commande_id: commande.id, apprenant_id: profil.id }),
                      // /initiate redirige par défaut vers le site public (FRONTEND_URL) -
                      // ici on reste dans dash, donc on impose le retour vers cette même
                      // origine plutôt que de laisser l'apprenant atterrir sur le site vitrine.
                      return_url:       `${window.location.origin}/espace-apprenant?paiement=retour`,
                    }),
                  });
                  const d = await rPay.json();
                  if (!rPay.ok || !d.order_number) { toast.error(d.error || "Erreur lors du paiement"); return; }
                  await declencherTouchPoint(d);
                } catch { toast.error("Erreur réseau"); }
                finally { setAchatSending(false); }
              }} style={{ padding:"9px 20px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:700, fontSize:13, opacity:achatSending?0.6:1 }}>
                {achatSending ? "⏳ Redirection…" : `💳 Payer - ${Number(selectedProduit.prix).toLocaleString()} FCFA`}
              </button>
            </div>
          </Modal>
        )}

        {/* MODAL PAIEMENT */}
        {showPaiementModal && (
          <div style={modalOverlay}>
            <div style={{ ...modalBox, width:480 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
                <h3 style={{ margin:0, fontSize:16 }}>💳 Faire un paiement</h3>
                <button onClick={()=>setShowPaiementModal(false)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#6b7280" }}>✕</button>
              </div>
              <div style={{ padding:"12px 14px", borderRadius:8, background:PRIMARY_LIGHT, border:`1px solid ${PRIMARY_COLOR}30`, marginBottom:18, fontSize:13, color:PRIMARY_COLOR }}>
                Paiement en attente : <strong>Renouvellement T4</strong> - 250 000 FCFA
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:600, marginBottom:4 }}>Montant (FCFA)</label>
                <input type="number" defaultValue={250000} readOnly style={{ width:"100%", padding:9, borderRadius:6, border:"1px solid #d1d5db", fontSize:13, background:"#f8fafc", boxSizing:"border-box" }} />
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:600, marginBottom:4 }}>Mode de paiement</label>
                <select style={{ width:"100%", padding:9, borderRadius:6, border:"1px solid #d1d5db", fontSize:13 }}>
                  <option>Orange Money</option>
                  <option>Wave</option>
                  <option>Virement bancaire</option>
                  <option>Espèces (en centre)</option>
                </select>
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:600, marginBottom:4 }}>Référence / Note (optionnel)</label>
                <input type="text" placeholder="Ex: Reçu n°12345" style={{ width:"100%", padding:9, borderRadius:6, border:"1px solid #d1d5db", fontSize:13, boxSizing:"border-box" }} />
              </div>
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button onClick={()=>setShowPaiementModal(false)} style={{ padding:"9px 16px", background:"#e5e7eb", color:"#374151", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 }}>Annuler</button>
                <button onClick={()=>{ toast.success("Demande de paiement envoyée ! Notre équipe vous contactera sous 24h."); setShowPaiementModal(false); }} style={{ padding:"9px 16px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:700, fontSize:12 }}>Confirmer le paiement</button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DÉTAIL COURS */}
        {showCoursModal && selectedCours && (
          <Modal title={selectedCours.titre} onClose={()=>{ setShowCoursModal(false); setExpandedModule(null); }} wide>
            <div style={{ display:"flex", gap:14, alignItems:"flex-start", paddingBottom:16, borderBottom:"1px solid #e5e7eb", marginBottom:16 }}>
              <span style={{ fontSize:40 }}>{selectedCours.emoji}</span>
              <div style={{ flex:1 }}><div style={{ fontSize:18, fontWeight:800, color:"#0f172a" }}>{selectedCours.titre}</div><div style={{ fontSize:13, color:"#6b7280" }}>👤 {selectedCours.formateur}</div><div style={{ marginTop:6 }}><NiveauBadge niveau={selectedCours.niveau} /></div></div>
              <span style={{ padding:"5px 12px", borderRadius:14, fontSize:12, fontWeight:700, background:STATUT_COURS[selectedCours.statut]?.bg, color:STATUT_COURS[selectedCours.statut]?.c }}>{STATUT_COURS[selectedCours.statut]?.label}</span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:14 }}>
              {[
                { l:"Progression", v:`${selectedCours.progression}%`, c:selectedCours.color },
                { l:"Heures", v:`${selectedCours.heuresFaites}h / ${selectedCours.heures}h`, c:"#374151" },
                { l:"Modules", v:`${selectedCours.modules.filter(m=>m.done).length}/${selectedCours.modules.length}`, c:"#6366f1" },
              ].map(s => <div key={s.l} style={{ textAlign:"center", padding:12, borderRadius:8, background:"#f8fafc" }}><div style={{ fontSize:11, color:"#9ca3af" }}>{s.l}</div><div style={{ fontSize:18, fontWeight:800, color:s.c }}>{s.v}</div></div>)}
            </div>
            <div style={{ marginBottom:14 }}><ProgressBar value={selectedCours.progression} color={selectedCours.color} height={10} /></div>
            <p style={{ fontSize:13, color:"#6b7280", marginBottom:16, lineHeight:1.6 }}>{selectedCours.description}</p>
            <h4 style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginBottom:10 }}>Modules du cours - cliquez pour voir le détail</h4>
            {selectedCours.modules.map((mod, i) => {
              const isExpanded = expandedModule === i;
              const moduleDetails = {
                objectifs: ["Comprendre et utiliser le vocabulaire clé", "Maîtriser les structures grammaticales liées", "Pratiquer à l'oral et à l'écrit"],
                blocs: [
                  { icon:"📖", titre:"Vocabulaire essentiel", desc:"20 mots et expressions clés avec exemples", duree:"15 min" },
                  { icon:"🎧", titre:"Écoute active", desc:"2 dialogues audio avec exercices de compréhension", duree:"20 min" },
                  { icon:"✏️", titre:"Exercices pratiques", desc:"10 exercices de mise en application", duree:"25 min" },
                  { icon:"❓", titre:"Quiz de validation", desc:"QCM 10 questions - score minimum 60%", duree:"10 min" },
                ],
              };
              return (
                <div key={i} style={{ marginBottom:8, borderRadius:10, border:`1px solid ${mod.done?"#bbf7d0":"#e5e7eb"}`, overflow:"hidden" }}>
                  <div onClick={()=>setExpandedModule(isExpanded?null:i)} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", cursor:"pointer", background:mod.done?"#f0fdf4":isExpanded?"#f8fafc":"#fff", userSelect:"none" }}>
                    <span style={{ fontSize:18 }}>{mod.done?"✅":"⭕"}</span>
                    <span style={{ flex:1, fontSize:13, fontWeight:600, color:mod.done?"#166534":"#374151" }}>{mod.nom}</span>
                    <span style={{ fontSize:11, padding:"2px 7px", borderRadius:6, background:mod.done?"#dcfce7":"#f3f4f6", color:mod.done?"#166534":"#6b7280" }}>{mod.done?"Terminé":"En cours"}</span>
                    <span style={{ fontSize:12, color:"#9ca3af", transition:"transform .2s", display:"inline-block", transform:isExpanded?"rotate(180deg)":"none" }}>▼</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding:"14px 16px", background:"#fafafa", borderTop:"1px solid #e5e7eb" }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:8 }}>🎯 Objectifs pédagogiques</div>
                      <ul style={{ margin:"0 0 14px 0", paddingLeft:18 }}>
                        {moduleDetails.objectifs.map((o,idx)=><li key={idx} style={{ fontSize:12, color:"#6b7280", marginBottom:4 }}>{o}</li>)}
                      </ul>
                      <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:8 }}>📦 Contenu du module</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                        {moduleDetails.blocs.map((b,idx)=>(
                          <div key={idx} style={{ display:"flex", gap:8, padding:"8px 10px", borderRadius:8, background:"#fff", border:"1px solid #e5e7eb" }}>
                            <span style={{ fontSize:16 }}>{b.icon}</span>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize:12, fontWeight:600, color:"#0f172a" }}>{b.titre}</div>
                              <div style={{ fontSize:11, color:"#9ca3af", marginTop:1 }}>{b.desc}</div>
                              <div style={{ fontSize:10, color:"#6b7280", marginTop:2 }}>⏱ {b.duree}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {!mod.done && <button onClick={()=>{ toast.success(`Module "${mod.nom}" - Accès au contenu`); }} style={{ marginTop:12, padding:"7px 14px", background:selectedCours.color, color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 }}>▶️ Accéder au module</button>}
                    </div>
                  )}
                </div>
              );
            })}
            {selectedCours.prochaineCours && <div style={{ marginTop:14, padding:"10px 14px", borderRadius:8, background:PRIMARY_LIGHT, border:`1px solid ${PRIMARY_COLOR}30`, fontSize:12, color:PRIMARY_COLOR, fontWeight:600 }}>📅 Prochaine session : {new Date(selectedCours.prochaineCours).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", hour:"2-digit", minute:"2-digit" })}</div>}
            <button onClick={()=>{ setShowCoursModal(false); setExpandedModule(null); }} style={{ padding:"9px 16px", background:"#e5e7eb", color:"#374151", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12, marginTop:16 }}>Fermer</button>
          </Modal>
        )}

        {/* MODAL COURS E-LEARNING DETAIL */}
        {coursElearningDetail && (() => {
          const cd = coursElearningDetail;
          const ACCENT_TYPE = { lecon:"#2563eb", audio:"#7c3aed", video:"#dc2626" };
          const accent = ACCENT_TYPE[cd.type_contenu] || "#2563eb";
          // Le niveau « Cours » a été supprimé : le contenu EST l'unité. On le présente
          // comme un module unique, ce qui conserve l'accordéon, le rendu de chaque bloc
          // et le suivi de progression sans les réécrire.
          const mods = [cd];

          const BLOC_INFO = {
            texte:    { icon:"📝", color:"#3B82F6", label:"Cours" },
            video:    { icon:"🎬", color:"#8B5CF6", label:"Vidéo" },
            audio:    { icon:"🎧", color:"#10B981", label:"Audio" },
            document: { icon:"📄", color:"#F59E0B", label:"Document" },
            image:    { icon:"🖼️", color:"#EC4899", label:"Image" },
            lien:     { icon:"🔗", color:"#06B6D4", label:"Lien" },
            exercice: { icon:"✏️",  color:"#EC4899", label:"Exercice" },
            quiz:     { icon:"🧩", color:"#F97316", label:"Quiz" },
          };

          const renderBloc = (b) => {
            const bt = BLOC_INFO[b.type] || BLOC_INFO.texte;
            return (
              <div key={b.id||b.ordre} style={{ marginBottom:16, borderRadius:12, border:`1px solid ${bt.color}25`, overflow:"hidden" }}>
                <div style={{ padding:"10px 16px", background:bt.color+"0d", borderBottom:`1px solid ${bt.color}20`, display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:18 }}>{bt.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, color:"#0f172a", fontSize:13 }}>{b.titre}</div>
                    <div style={{ fontSize:11, color:"#9ca3af" }}>{bt.label}{b.dureeMin ? ` · ${b.dureeMin} min` : ""}</div>
                  </div>
                </div>
                <div style={{ padding:"14px 16px", background:"#fff" }}>
                  {/* TEXTE / EXERCICE */}
                  {(b.type === "texte" || b.type === "exercice") && (
                    <div style={{ fontSize:13, color:"#374151", lineHeight:1.8, whiteSpace:"pre-wrap" }}>
                      {b.contenu || b.texte || (b.sections||[]).map(s => s.contenu).join("\n\n") || "Contenu en cours de rédaction."}
                    </div>
                  )}
                  {/* VIDÉO */}
                  {b.type === "video" && (() => {
                    const ytM = (b.url||"").match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
                    return ytM ? (
                      <div style={{ position:"relative", paddingTop:"56.25%", borderRadius:8, overflow:"hidden" }}>
                        <iframe src={`https://www.youtube.com/embed/${ytM[1]}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none" }} />
                      </div>
                    ) : b.url ? (
                      <LecteurMedia tag="video" controls src={b.url}
                        style={{ width:"100%", borderRadius:8, maxHeight:"60vh", background:"#000" }} />
                    ) : (
                      <div style={{ background:"#1e293b", borderRadius:8, padding:"32px 20px", textAlign:"center", color:"#94a3b8", fontSize:13 }}>🎬 Vidéo à venir</div>
                    );
                  })()}
                  {/* AUDIO */}
                  {b.type === "audio" && (
                    b.url ? <LecteurMedia tag="audio" controls src={b.url} style={{ width:"100%", marginTop:4 }} />
                    : <div style={{ color:"#9ca3af", fontSize:13 }}>🎧 Audio à venir</div>
                  )}
                  {/* LIEN */}
                  {b.type === "lien" && (
                    <div style={{ display:"flex", alignItems:"center", gap:12, background:"#e0f2fe", borderRadius:8, padding:"12px 16px" }}>
                      <span style={{ fontSize:24 }}>🔗</span>
                      <a href={b.url} target="_blank" rel="noreferrer" style={{ color:"#0284c7", fontWeight:600, fontSize:13, textDecoration:"none" }}>
                        {b.titre || b.url} →
                      </a>
                    </div>
                  )}
                  {/* DOCUMENT */}
                  {b.type === "document" && (() => {
                    const nomDoc = b.fichier || b.titre || "document";
                    const estPdf = extensionDe(nomDoc || b.url) === "pdf";
                    return (
                      <div style={{ background:"#fff7ed", borderRadius:8, padding:"12px 16px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom: estPdf && b.url ? 12 : 0 }}>
                          <span style={{ fontSize:32 }}>📄</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:600, color:"#0f172a", fontSize:13, marginBottom:4, overflow:"hidden", textOverflow:"ellipsis" }}>{nomDoc}</div>
                            {/* Le lien passe par le RELAIS : Cloudinary refuse la livraison
                                publique des PDF sur ce compte et répondait 401, ce qui
                                rendait tous les documents inaccessibles. */}
                            {b.url && (
                              <a href={urlDocument(b.url, { nom: nomDoc })} target="_blank" rel="noreferrer"
                                style={{ fontSize:12, color:"#f59e0b", fontWeight:700 }}>⬇ Télécharger</a>
                            )}
                          </div>
                        </div>
                        {/* Un PDF se LIT dans la page : obliger à le télécharger pour
                            consulter trois pages coupe le fil du cours. */}
                        {estPdf && b.url && (
                          <iframe title={nomDoc} src={urlDocument(b.url, { nom: nomDoc, inline: true })}
                            style={{ width:"100%", height:"60vh", border:"1px solid #fed7aa", borderRadius:8, background:"#fff" }} />
                        )}
                      </div>
                    );
                  })()}

                  {/* IMAGE - ce type n'existait nulle part : ni dans les blocs proposés au
                      coach, ni dans ce rendu. Une image déposée restait invisible. */}
                  {b.type === "image" && b.url && (
                    <a href={b.url} target="_blank" rel="noreferrer" style={{ display:"block" }}>
                      <img src={b.url} alt={b.titre || "Illustration du cours"} loading="lazy"
                        style={{ width:"100%", maxHeight:"60vh", objectFit:"contain", borderRadius:8, background:"#f1f5f9", display:"block" }} />
                    </a>
                  )}
                  {/* QUIZ - ce type n'avait aucun rendu : le bloc affichait son en-tête puis
                      un corps vide, et les questions saisies par le coach restaient invisibles.
                      Deux formes cohabitent : la question ouverte, qui se lit et se prépare,
                      et le QCM auto-corrigé pour ceux qui portent des options. */}
                  {b.type === "quiz" && (
                    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                      {(b.questions || []).length === 0 ? (
                        <div style={{ fontSize:13, color:"#9ca3af", fontStyle:"italic" }}>Aucune question pour l'instant.</div>
                      ) : (b.questions || []).map((q, qi) => {
                        const options = (q.options || []).filter(o => String(o).trim());
                        const cle = `${b.id || b.ordre}-${qi}`;
                        const choisi = reponsesQuiz[cle];
                        return (
                          <div key={cle} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:10, padding:"12px 14px" }}>
                            <div style={{ fontSize:13.5, fontWeight:700, color:"#0f172a", lineHeight:1.6, marginBottom: options.length ? 10 : 0 }}>
                              {qi + 1}. {q.texte}
                            </div>
                            {options.length === 0 ? (
                              <div style={{ fontSize:12, color:"#94a3b8", fontStyle:"italic", marginTop:6 }}>
                                Question ouverte - préparez votre réponse pour le cours.
                              </div>
                            ) : (
                              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                                {options.map((o, oi) => {
                                  const bon = String(o).trim() === String(q.correct || "").trim();
                                  const actif = choisi != null;
                                  const moi = choisi === oi;
                                  const fond = !actif ? "#fff" : bon ? "#f0fdf4" : moi ? "#fef2f2" : "#fff";
                                  const bord = !actif ? "#e5e7eb" : bon ? "#86efac" : moi ? "#fca5a5" : "#e5e7eb";
                                  return (
                                    <button key={oi} disabled={actif}
                                      onClick={() => setReponsesQuiz(p => ({ ...p, [cle]: oi }))}
                                      style={{ textAlign:"left", padding:"9px 12px", borderRadius:8, border:`1.5px solid ${bord}`,
                                        background:fond, fontSize:12.5, fontWeight:600, color:"#374151", cursor: actif ? "default" : "pointer" }}>
                                      {actif && bon ? "✅ " : actif && moi ? "❌ " : ""}{o}
                                    </button>
                                  );
                                })}
                                {choisi != null && (
                                  <div style={{ fontSize:11.5, color:"#64748b", marginTop:2 }}>
                                    Auto-évaluation - votre réponse n'est pas enregistrée.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* SPEAKING - même oubli que le quiz. La consigne vit soit dans `contenu`,
                      soit dans les sections, selon la façon dont le coach l'a saisie. */}
                  {b.type === "speaking" && (
                    <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, padding:"14px 16px" }}>
                      <div style={{ fontSize:11, fontWeight:800, color:"#b91c1c", letterSpacing:".05em", marginBottom:6 }}>🎤 À PRÉPARER À L'ORAL</div>
                      <div style={{ fontSize:13, color:"#374151", lineHeight:1.8, whiteSpace:"pre-wrap" }}>
                        {b.contenu || b.texte || (b.sections || []).map(x => [x.titre, x.contenu].filter(Boolean).join("\n")).join("\n\n") || "Consigne à venir."}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          };

          return (
            <>
              {/* Le fond NE FERME PAS le panneau. On y lit un cours, on y écoute un audio,
                  on y coche « Marquer comme terminé » : un clic à côté fermait tout ce
                  travail sans prévenir. La croix du bandeau est la seule sortie. */}
              <div style={{ position:"fixed", inset:0, background:"rgba(10,18,35,0.6)", zIndex:9998, backdropFilter:"blur(3px)" }} />
              <div style={{ position:"fixed", top:0, right:0, bottom:0, width:"min(94vw,880px)", background:"#fff", zIndex:9999, display:"flex", flexDirection:"column", boxShadow:"-8px 0 40px rgba(0,0,0,0.2)", overflow:"hidden" }}>

                {/* Header */}
                <div style={{ background:`linear-gradient(135deg, ${accent}, #0f172a)`, padding:"20px 24px", flexShrink:0 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                      <span style={{ fontSize:36 }}>{({lecon:"📖",audio:"🎧",video:"🎬"})[cd.type_contenu] || "📚"}</span>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.6)", textTransform:"uppercase", letterSpacing:".08em", marginBottom:5 }}>
                          {({lecon:"Leçon",audio:"Audio",video:"Vidéo"})[cd.type_contenu] || "Contenu"} · {cd.coach_nom||"Formateur BET"}
                        </div>
                        <div style={{ fontSize:18, fontWeight:800, color:"#fff", lineHeight:1.3 }}>{cd.titre}</div>
                        <div style={{ display:"flex", gap:12, fontSize:12, color:"rgba(255,255,255,0.7)", marginTop:5, flexWrap:"wrap" }}>
                          <span>📑 {(cd.blocs||[]).length} partie{(cd.blocs||[]).length!==1?"s":""}</span>
                          {(cd.groupe_noms||[]).map(n => <span key={n}>🏫 {n}</span>)}
                          {cd.dureeEstimee && <span>⏱ {cd.dureeEstimee} min</span>}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => { setCoursElearningDetail(null); setExpandedModule(null); }}
                      style={{ background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.3)", borderRadius:8, width:34, height:34, color:"#fff", fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✕</button>
                  </div>
                </div>

                {/* Corps scrollable */}
                <div style={{ flex:1, overflowY:"auto", padding:"16px 18px" }}>
                  {(cd.objectifs||[]).length > 0 && (
                    <p style={{ fontSize:13, color:"#6b7280", lineHeight:1.7, marginBottom:20, padding:"12px 16px", background:"#f8fafc", borderRadius:10, borderLeft:`3px solid ${accent}` }}>{(cd.objectifs||[]).join("\n")}</p>
                  )}

                  {mods.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"48px 0", color:"#9ca3af" }}>
                      <div style={{ fontSize:36, marginBottom:10 }}>📄</div>
                      <div style={{ fontWeight:600 }}>Ce contenu n'a pas encore de partie.</div>
                    </div>
                  ) : mods.map((m, idx) => {
                    const isOpen = expandedModule === m.id;
                    const blocs  = m.blocs || [];
                    const TYPE_INFO_MOD = {
                      lecon:    { bg:"#E0F2FE", txt:"#0E7490", icon:"📖" },
                      exercice: { bg:"#D1FAE5", txt:"#065F46", icon:"✏️" },
                      devoir:   { bg:"#FEF3C7", txt:"#92400E", icon:"📝" },
                      audio:    { bg:"#EDE9FE", txt:"#5B21B6", icon:"🎵" },
                    };
                    const mt = TYPE_INFO_MOD[m.type_contenu] || TYPE_INFO_MOD.lecon;
                    return (
                      <div key={m.id} style={{ marginBottom:12, borderRadius:14, border:`1px solid ${isOpen ? accent+"60" : "#e5e7eb"}`, overflow:"hidden", transition:"border-color .15s" }}>
                        {/* En-tête module - cliquable */}
                        <div onClick={() => setExpandedModule(isOpen ? null : m.id)}
                          style={{ padding:"14px 18px", background:isOpen ? accent+"08" : "#f8fafc", cursor:"pointer", display:"flex", alignItems:"center", gap:12, userSelect:"none" }}>
                          <div style={{ width:32, height:32, borderRadius:8, background:mt.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>{mt.icon}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{m.nom}</div>
                            <div style={{ display:"flex", gap:6, marginTop:3, flexWrap:"wrap" }}>
                              {m.dureeEstimee && <span style={{ padding:"1px 7px", borderRadius:99, fontSize:10, background:"#f1f5f9", color:"#64748b" }}>⏱ {m.dureeEstimee}min</span>}
                              {m.semaine && <span style={{ padding:"1px 7px", borderRadius:99, fontSize:10, background:"#fef3c7", color:"#92400e" }}>📅 {m.semaine}</span>}
                              <span style={{ padding:"1px 7px", borderRadius:99, fontSize:10, background:mt.bg, color:mt.txt, fontWeight:600 }}>{mt.icon} {m.type_contenu||"leçon"}</span>
                              {blocs.length > 0 && <span style={{ padding:"1px 7px", borderRadius:99, fontSize:10, background:"#dbeafe", color:"#1e40af" }}>{blocs.length} bloc{blocs.length!==1?"s":""}</span>}
                              {coursLus[m.id] && <span style={{ padding:"1px 7px", borderRadius:99, fontSize:10, background:"#dcfce7", color:"#166534", fontWeight:700 }}>✅ Lu</span>}
                            </div>
                          </div>
                          <span style={{ fontSize:13, color:"#9ca3af", flexShrink:0 }}>#{idx+1}</span>
                          <span style={{ fontSize:14, color:isOpen ? accent : "#9ca3af", flexShrink:0, transition:"transform .15s", display:"inline-block", transform:isOpen?"rotate(90deg)":"none" }}>›</span>
                        </div>

                        {/* Contenu du module */}
                        {isOpen && (
                          <div style={{ padding:"16px 18px", borderTop:`1px solid ${accent}20` }}>
                            {m.objectifs?.length > 0 && (
                              <div style={{ marginBottom:14, padding:"10px 14px", background:"#f0f9ff", borderRadius:8, borderLeft:`3px solid #0284c7` }}>
                                <div style={{ fontSize:11, fontWeight:700, color:"#0284c7", marginBottom:6, textTransform:"uppercase", letterSpacing:".06em" }}>Objectifs</div>
                                <ul style={{ margin:0, paddingLeft:16, fontSize:12, color:"#374151", lineHeight:1.8 }}>
                                  {m.objectifs.map((o, i) => <li key={i}>{o}</li>)}
                                </ul>
                              </div>
                            )}
                            {blocs.length === 0 ? (
                              <div style={{ textAlign:"center", padding:"20px 0", color:"#9ca3af", fontSize:12 }}>Contenu à venir…</div>
                            ) : blocs.map(b => renderBloc(b))}

                            {/* Bouton Marquer lu / non terminé */}
                            <div style={{ marginTop:16, paddingTop:14, borderTop:`1px solid ${accent}20`, display:"flex", justifyContent:"flex-end" }}>
                              {coursLus[m.id] ? (
                                /* Plus de retour possible : marquer un cours comme termine
                                   est une declaration, pas un interrupteur. Un badge, donc,
                                   et non un bouton - rien ne doit laisser croire qu'on peut
                                   revenir dessus. */
                                <div style={{ padding:"8px 16px", borderRadius:8, border:"1px solid #bbf7d0", background:"#f0fdf4", color:"#166534", fontSize:12, fontWeight:700, display:"flex", alignItems:"center", gap:6 }}>
                                  <span>✅</span> Terminé
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setConfirmLuErreur(""); setConfirmLuModal({ id: m.id, nom: m.titre || m.nom, classeId: espaceInfo?.groupe?.id }); /* `titre` d'abord : c'est le champ réellement porté par un contenu - `nom` rendait « undefined » dans la phrase de confirmation */ }}
                                  style={{ padding:"8px 16px", borderRadius:8, border:"none", background:accent, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}
                                >
                                  ✅ Marquer comme terminé
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          );
        })()}

        {/* MODAL CONFIRMATION MARQUER LU */}
        {confirmLuModal && (
          <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.6)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
            <div style={{ background:"#fff", borderRadius:16, width:"min(92vw,400px)", padding:28, boxShadow:"0 20px 50px rgba(0,0,0,0.25)", textAlign:"center" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
              <div style={{ fontWeight:800, fontSize:16, color:"#0f172a", marginBottom:8 }}>Marquer comme terminé ?</div>
              <div style={{ fontSize:13, color:"#6b7280", lineHeight:1.6, marginBottom:20 }}>
                Le module <strong>« {confirmLuModal.nom || "ce cours"} »</strong> sera marqué comme terminé.<br/>
                Votre coach en sera informé, et <strong>cette action est définitive</strong> - vous ne pourrez pas revenir en arrière.
              </div>
              {confirmLuErreur && (
                <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, padding:"11px 14px", marginBottom:16, fontSize:12.5, color:"#b91c1c", lineHeight:1.6, textAlign:"left" }}>
                  🔒 {confirmLuErreur}
                </div>
              )}
              <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
                <button onClick={() => { setConfirmLuModal(null); setConfirmLuErreur(""); }} style={{ padding:"9px 20px", borderRadius:8, border:"1px solid #e5e7eb", background:"#fff", color:"#374151", fontSize:13, cursor:"pointer", fontWeight:600 }}>Annuler</button>
                <button onClick={() => marquerModuleLu(confirmLuModal.id, confirmLuModal.classeId)}
                  disabled={confirmLuEnCours || !!confirmLuErreur}
                  style={{ padding:"9px 20px", borderRadius:8, border:"none",
                    background: (confirmLuEnCours || confirmLuErreur) ? "#cbd5e1" : PRIMARY_COLOR,
                    color:"#fff", fontSize:13, fontWeight:700,
                    cursor: (confirmLuEnCours || confirmLuErreur) ? "not-allowed" : "pointer" }}>
                  {confirmLuEnCours ? "Enregistrement…" : "✅ Confirmer"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL MESSAGE */}
        {showMessageModal && selectedMsg && (
          <Modal title={selectedMsg.objet} onClose={()=>setShowMsgModal(false)}>
            <div style={{ display:"flex", alignItems:"center", gap:12, paddingBottom:14, borderBottom:"1px solid #e5e7eb", marginBottom:14 }}>
              <div style={{ width:44, height:44, borderRadius:"50%", background:selectedMsg.type==="gestionnaire"?"#fef3c7":PRIMARY_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, color:selectedMsg.type==="gestionnaire"?"#92400e":PRIMARY_COLOR }}>{selectedMsg.avatar}</div>
              <div><div style={{ fontWeight:700, fontSize:14 }}>{selectedMsg.expediteur}</div><div style={{ fontSize:12, color:"#9ca3af" }}>📅 {formatDateFull(selectedMsg.date)}</div></div>
            </div>
            <p style={{ fontSize:14, color:"#374151", lineHeight:1.7, whiteSpace:"pre-wrap" }}>{selectedMsg.message}</p>
            <div style={{ display:"flex", gap:10, marginTop:16 }}>
              <button onClick={()=>{ setShowMsgModal(false); setActiveTab("messages"); }} style={{ padding:"9px 16px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 }}>↩️ Aller aux messages</button>
              <button onClick={()=>setShowMsgModal(false)} style={{ padding:"9px 16px", background:"#e5e7eb", color:"#374151", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 }}>Fermer</button>
            </div>
          </Modal>
        )}

        {/* MODAL RESSOURCE VIEWER */}
        {showRessModal && selectedRess && (
          <Modal title={selectedRess.titre} onClose={()=>setShowRessModal(false)} wide>
            {selectedRess.type === "video" && (
              <div>
                <div style={{ position:"relative", paddingBottom:"56.25%", background:"#000", borderRadius:8, overflow:"hidden", marginBottom:16 }}>
                  <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title={selectedRess.titre} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%" }} />
                </div>
                <div style={{ display:"flex", gap:12, fontSize:12, color:"#6b7280", marginBottom:14 }}>
                  <span>⏱ {selectedRess.duree}</span>
                  <span>📚 {selectedRess.cours}</span>
                  <span style={{ padding:"2px 8px", borderRadius:8, background:"#ede9fe", color:"#5b21b6", fontWeight:600 }}>🎬 Vidéo</span>
                </div>
                <p style={{ fontSize:13, color:"#6b7280" }}>Cette vidéo pédagogique fait partie de votre parcours de formation BET. Regardez-la dans un endroit calme.</p>
              </div>
            )}
            {selectedRess.type === "audio" && (
              <AudioPlayer
                url={selectedRess.audioUrl}
                titre={selectedRess.titre}
                cours={selectedRess.cours}
                duree={selectedRess.duree}
                description={selectedRess.description || "Podcast d'entraînement à la compréhension orale. Écoutez attentivement puis prenez des notes."}
              />
            )}
            {(selectedRess.type === "exercice" || selectedRess.type === "quiz") && (
              <div>
                <div style={{ padding:"12px 16px", borderRadius:10, background:selectedRess.type==="quiz"?"#dbeafe":"#fef3c7", border:`1px solid ${selectedRess.type==="quiz"?"#93c5fd":"#fcd34d"}`, marginBottom:16, fontSize:13 }}>
                  <strong>{selectedRess.type==="quiz"?"❓ Quiz interactif":"✏️ Exercice pratique"}</strong> - {selectedRess.pages || selectedRess.questions} · Cours : {selectedRess.cours}
                </div>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>Exemple de question :</div>
                <div style={{ padding:"14px 16px", borderRadius:10, background:"#f8fafc", border:"1px solid #e5e7eb", marginBottom:12 }}>
                  <p style={{ fontSize:14, fontWeight:600, marginBottom:12 }}>Which sentence is grammatically correct in a formal context?</p>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    {["We was able to reach the target.","The target has been successfully reached.","Target reached we did it.","We have reached the target successfully."].map((opt,i)=>(
                      <button key={i} onClick={()=>toast.success(i===1||i===3?"✅ Bonne réponse !":"❌ Mauvaise réponse")} style={{ padding:"10px 12px", borderRadius:8, border:"1px solid #e5e7eb", background:"#fff", cursor:"pointer", fontSize:12, textAlign:"left" }}>{opt}</button>
                    ))}
                  </div>
                </div>
                <button onClick={()=>{ setShowRessModal(false); setActiveTab("examens"); }} style={{ padding:"9px 16px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 }}>▶️ Commencer l'exercice complet</button>
              </div>
            )}
            {selectedRess.type === "pdf" && (
              <div>
                <div style={{ padding:32, borderRadius:12, background:"#f8fafc", border:"2px dashed #d1d5db", textAlign:"center", marginBottom:16 }}>
                  <div style={{ fontSize:52, marginBottom:8 }}>📄</div>
                  <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>{selectedRess.titre}</div>
                  <div style={{ fontSize:12, color:"#9ca3af" }}>{selectedRess.taille} · {selectedRess.cours}</div>
                </div>
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={()=>toast.success("Téléchargement lancé !")} style={{ flex:1, padding:"9px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 }}>⬇️ Télécharger le PDF</button>
                  <button onClick={()=>toast.success("Ouverture de l'aperçu...")} style={{ flex:1, padding:"9px", background:"#e5e7eb", color:"#374151", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 }}>👁️ Aperçu en ligne</button>
                </div>
              </div>
            )}
            <button onClick={()=>setShowRessModal(false)} style={{ padding:"9px 16px", background:"#e5e7eb", color:"#374151", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12, marginTop:16 }}>Fermer</button>
          </Modal>
        )}


      </div>

      {/* ══ MODAL BIENVENUE (première connexion) ══ */}
      {showBienvenueModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.75)", zIndex:1200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          {/* 80 % de l'écran sur les grands moniteurs, sans jamais descendre sous 760 px
              ni dépasser 1 280 px - au-delà, les lignes de texte deviennent trop longues
              pour être lues confortablement. `width:100%` reste la contrainte sur mobile. */}
          <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:"max(760px, min(80vw, 1280px))", maxHeight:"92vh", overflowY:"auto", boxShadow:"0 30px 80px rgba(0,0,0,0.4)" }}>
            <div style={{ background:GRADIENT_HEADER, padding:"28px 28px 24px", color:"#fff" }}>
              <div style={{ fontSize:34, marginBottom:8 }}>👋</div>
              <div style={{ fontSize:20, fontWeight:800, marginBottom:4 }}>Bienvenue chez BET !</div>
              <div style={{ fontSize:13, opacity:0.9 }}>Voici un rapide tour d'horizon avant de démarrer.</div>
            </div>
            <div style={{ padding:"22px 24px" }}>
              {contenusOnbLoading ? (
                <div style={{ textAlign:"center", padding:30, color:"#9ca3af" }}>Chargement…</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  {ETAPES_ONBOARDING_DASH.map(e => {
                    const contenus = contenusOnb.filter(c => c.cat === e.id);
                    return (
                      <div key={e.id}>
                        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                          <span style={{ fontSize:18 }}>{e.icone}</span>
                          <div>
                            <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{e.titre}</div>
                            <div style={{ fontSize:11, color:"#6b7280" }}>{e.desc}</div>
                          </div>
                        </div>
                        {contenus.length > 0 && (
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))", gap:10, marginLeft:28, alignItems:"start" }}>
                            {contenus.map(c => {
                              // Le texte du contenu - `detail` - était chargé mais jamais affiché :
                              // l'apprenant voyait le titre « MODELE DE PRESENTATION » sans le modèle,
                              // et le règlement intérieur sans le règlement.
                              const texte = (c.detail || "").trim();
                              const long = texte.length > 220;
                              const ouvert = onbDeplie.has(c.id);
                              return (
                                <div key={c.id} style={{ background:"#f8fafc", borderRadius:10, padding:"11px 14px", fontSize:12.5, color:"#374151" }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom: texte ? 7 : 0 }}>
                                    <span>{c.type==="video"?"🎬":c.type==="audio"?"🎧":c.type==="image"?"🖼️":"📄"}</span>
                                    {c.fichier_url ? (
                                      <a href={c.fichier_url} target="_blank" rel="noopener noreferrer" onClick={()=>enregistrerVueContenuOnb("onboarding", c.id)} style={{ color:PRIMARY_COLOR, fontWeight:700, textDecoration:"none" }}>{c.titre}</a>
                                    ) : <span style={{ fontWeight:700, color:"#0f172a" }}>{c.titre}</span>}
                                  </div>
                                  {texte && (
                                    <>
                                      <div style={{ whiteSpace:"pre-wrap", lineHeight:1.6, color:"#475569",
                                        ...(long && !ouvert ? { display:"-webkit-box", WebkitLineClamp:4, WebkitBoxOrient:"vertical", overflow:"hidden" } : {}) }}>
                                        {texte}
                                      </div>
                                      {long && (
                                        <button onClick={()=>setOnbDeplie(prev=>{ const n=new Set(prev); n.has(c.id)?n.delete(c.id):n.add(c.id); return n; })}
                                          style={{ marginTop:6, background:"transparent", border:"none", padding:0, cursor:"pointer", color:PRIMARY_COLOR, fontSize:11.5, fontWeight:700 }}>
                                          {ouvert ? "Réduire ↑" : "Lire la suite ↓"}
                                        </button>
                                      )}
                                    </>
                                  )}
                                  {/* Le média était absent de ce modal : une vidéo ou une image de
                                      bienvenue n'y apparaissait que sous forme de lien texte. */}
                                  {c.fichier_url && (
                                    <div style={{ marginTop:9 }}>
                                      <MediaContenuOnb contenu={c} compact onVue={()=>enregistrerVueContenuOnb("onboarding", c.id)} />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ marginTop:24, textAlign:"center" }}>
                <button onClick={fermerBienvenueModal} style={{ padding:"12px 32px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:14 }}>
                  C'est parti ! 🚀
                </button>
                <div style={{ fontSize:11, color:"#9ca3af", marginTop:10 }}>Vous pourrez retrouver ce guide à tout moment dans l'onglet "Onboarding".</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal lecteur vidéo / audio */}
      {mediaModal && (
        <div onClick={() => setMediaModal(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#0f172a", borderRadius:14, width:"100%", maxWidth:760, overflow:"hidden", boxShadow:"0 25px 60px rgba(0,0,0,0.5)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderBottom:"1px solid rgba(255,255,255,0.1)" }}>
              <span style={{ color:"#fff", fontWeight:700, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"85%" }}>
                {mediaModal.type === "video" ? "▶️" : "🎧"} {mediaModal.nom}
              </span>
              <button onClick={() => setMediaModal(null)} style={{ background:"rgba(255,255,255,0.1)", border:"none", borderRadius:6, color:"#fff", width:30, height:30, cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
            </div>
            <div style={{ padding: mediaModal.type === "audio" ? "32px 24px" : 0, background: mediaModal.type === "audio" ? "#1e293b" : "#000" }}>
              {mediaModal.type === "video" ? (() => {
                const u = mediaModal.url || "";
                const ytMatch = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
                if (ytMatch) {
                  return (
                    <div style={{ position:"relative", paddingTop:"56.25%" }}>
                      <iframe
                        src={`https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none" }}
                      />
                    </div>
                  );
                }
                return <video controls autoPlay src={u} style={{ width:"100%", maxHeight:"70vh", display:"block" }} />;
              })() : (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:20 }}>
                  <div style={{ fontSize:64 }}>🎧</div>
                  <div style={{ color:"#94a3b8", fontSize:13, textAlign:"center" }}>{mediaModal.nom}</div>
                  <LecteurMedia tag="audio" controls autoPlay src={mediaModal.url} style={{ width:"100%" }} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    {/* ══ Modal Jitsi plein écran (EspaceApprenant /dash) ══ */}
    {jitsiModalSession && (
      <div style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,0.82)", backdropFilter:"blur(6px)", display:"flex", flexDirection:"column" }}>
        <div style={{ background:"linear-gradient(135deg,#064E3B,#065F46)", padding:"12px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0, flexWrap:"wrap", gap:10 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:800, color:"#fff" }}>{jitsiModalSession.titre}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", marginTop:2 }}>⏰ {jitsiModalSession.heure} · Jitsi</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => setJitsiModalSession(null)}
              style={{ padding:"6px 14px", borderRadius:8, border:"1px solid rgba(255,255,255,0.25)", background:"rgba(239,68,68,0.2)", color:"#FCA5A5", fontSize:12, fontWeight:700, cursor:"pointer" }}>
              ⏹ Quitter
            </button>
          </div>
        </div>
        <iframe
          src={jitsiModalSession.lien}
          allow="camera; microphone; fullscreen; display-capture; autoplay"
          style={{ flex:1, border:"none", display:"block", background:"#0F172A" }}
          title="Session Live"
        />
      </div>
    )}

    {/* ══ MODAL ÉCRIRE À UN CONTACT ═══════════════════════════════════════════════
        Le message part du serveur (`POST /api/apprenants/contacter`), qui revérifie que
        le destinataire appartient bien à l'équipe de cet apprenant. Fermeture par les
        boutons seulement : un clic à côté perdrait un message à moitié écrit. ══ */}
    {contactMailModal && (
      <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.55)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
        <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:540, maxHeight:"90vh", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 24px 60px rgba(0,0,0,.25)" }}>
          <div style={{ padding:"16px 22px", borderBottom:"1px solid #f1f5f9", flexShrink:0 }}>
            <div style={{ fontSize:11, fontWeight:800, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".06em", marginBottom:3 }}>Écrire à</div>
            <div style={{ fontSize:15, fontWeight:800, color:"#0f172a" }}>{contactMailModal.contact.nom || contactMailModal.contact.role}</div>
            <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{contactMailModal.contact.role} · {contactMailModal.contact.email}</div>
          </div>
          <div style={{ padding:"18px 22px", overflowY:"auto", flex:1, display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:5 }}>Sujet <span style={{ fontWeight:400, color:"#94a3b8" }}>(facultatif)</span></label>
              <input value={contactMailForm.sujet} onChange={e=>setContactMailForm(f=>({ ...f, sujet:e.target.value }))}
                maxLength={150} placeholder="Ex : Question sur ma prochaine échéance"
                style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:9, fontSize:13, boxSizing:"border-box", outline:"none" }} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:5 }}>Votre message *</label>
              <textarea value={contactMailForm.message} onChange={e=>setContactMailForm(f=>({ ...f, message:e.target.value }))}
                maxLength={4000} rows={7} placeholder="Écrivez votre message…"
                style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:9, fontSize:13, boxSizing:"border-box", outline:"none", resize:"vertical", fontFamily:"inherit" }} />
              <div style={{ fontSize:11, color:"#94a3b8", textAlign:"right", marginTop:3 }}>{contactMailForm.message.length}/4000</div>
            </div>
            <div style={{ padding:"9px 12px", borderRadius:8, background:"#f0f4ff", border:"1px solid #c7d2fe", fontSize:11.5, color:"#3730a3" }}>
              Votre nom et vos coordonnées accompagnent le message pour qu'on puisse vous répondre.
            </div>
          </div>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end", padding:"14px 22px", borderTop:"1px solid #f1f5f9", background:"#fafafa", flexShrink:0 }}>
            <button type="button" onClick={()=>setContactMailModal(null)} disabled={contactMailEnvoi}
              style={{ padding:"9px 18px", background:"#f1f5f9", border:"none", borderRadius:9, cursor:contactMailEnvoi?"not-allowed":"pointer", fontWeight:700, fontSize:13, color:"#374151" }}>
              Annuler
            </button>
            <button type="button" onClick={envoyerMessageContact} disabled={contactMailEnvoi || !contactMailForm.message.trim()}
              style={{ padding:"9px 22px", background:(contactMailEnvoi || !contactMailForm.message.trim())?"#cbd5e1":PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:9, cursor:(contactMailEnvoi || !contactMailForm.message.trim())?"not-allowed":"pointer", fontWeight:800, fontSize:13 }}>
              {contactMailEnvoi ? "⏳ Envoi…" : "✉️ Envoyer"}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ══ MODAL APPELER ══════════════════════════════════════════════════════════
        Le numéro d'abord, en grand : sur un ordinateur un lien `tel:` ne mène nulle part,
        alors qu'un numéro lisible et copiable, lui, sert toujours. ══ */}
    {contactTelModal && (
      <div onClick={e=>{ if(e.target===e.currentTarget) setContactTelModal(null); }}
        style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.55)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
        <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:380, overflow:"hidden", boxShadow:"0 24px 60px rgba(0,0,0,.25)" }}>
          <div style={{ padding:"20px 22px 14px", textAlign:"center", borderBottom:"1px solid #f1f5f9" }}>
            <div style={{ fontSize:12, color:"#64748b", marginBottom:4 }}>{contactTelModal.contact.role}</div>
            <div style={{ fontSize:15, fontWeight:800, color:"#0f172a", marginBottom:10 }}>{contactTelModal.contact.nom || "-"}</div>
            <div style={{ fontSize:22, fontWeight:900, color:PRIMARY_COLOR, letterSpacing:".02em" }}>{contactTelModal.contact.telephone}</div>
          </div>
          <div style={{ padding:"14px 22px", display:"flex", flexDirection:"column", gap:8 }}>
            <button type="button"
              onClick={()=>{
                navigator.clipboard?.writeText(String(contactTelModal.contact.telephone || ""))
                  .then(()=>{ setTelCopie(true); setTimeout(()=>setTelCopie(false), 2000); })
                  .catch(()=>toast.error("Copie impossible - notez le numéro affiché"));
              }}
              style={{ padding:"10px", borderRadius:9, border:"1.5px solid #e2e8f0", background:telCopie?"#dcfce7":"#fff", color:telCopie?"#15803d":"#374151", fontWeight:700, fontSize:13, cursor:"pointer" }}>
              {telCopie ? "✓ Numéro copié" : "📋 Copier le numéro"}
            </button>
            <a href={`tel:${telBrut(contactTelModal.contact.telephone)}`}
              style={{ padding:"10px", borderRadius:9, background:PRIMARY_COLOR, color:"#fff", fontWeight:800, fontSize:13, textAlign:"center", textDecoration:"none" }}>
              📞 Lancer l'appel
            </a>
            {telWhatsApp(contactTelModal.contact.telephone) && (
              <a href={`https://wa.me/${telWhatsApp(contactTelModal.contact.telephone)}`} target="_blank" rel="noopener noreferrer"
                style={{ padding:"10px", borderRadius:9, background:"#25d366", color:"#fff", fontWeight:800, fontSize:13, textAlign:"center", textDecoration:"none" }}>
                💬 WhatsApp
              </a>
            )}
          </div>
          <div style={{ padding:"0 22px 16px" }}>
            <button type="button" onClick={()=>setContactTelModal(null)}
              style={{ width:"100%", padding:"9px", borderRadius:9, border:"none", background:"#f1f5f9", color:"#374151", fontWeight:700, fontSize:13, cursor:"pointer" }}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    )}

    </div>
  );
}

/* STYLES */
const modalOverlay = { position:"fixed", top:0, left:0, width:"100%", height:"100%", background:"rgba(0,0,0,0.5)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:1000 };
const modalBox = { background:"#fff", padding:24, borderRadius:14, maxWidth:"92vw" };