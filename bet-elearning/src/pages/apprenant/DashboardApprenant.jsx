import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAgeInterface } from '../../hooks/useAgeInterface';
import { COULEURS } from '../../constants/couleurs';
import { urlOuvrir, urlTelecharger } from '../../utils/fichierUrl';
import TopNavLayout from '../../components/shared/TopNavLayout';
import { genererPDF, fmtDatePDF } from '../../utils/genererPDF';
import SalleVirtuelle from '../../components/shared/SalleVirtuelle';
import { accesSalle, MINUTES_OUVERTURE_SALLE } from '../../utils/ouvertureSalle';
import { NIVEAUX_CECR, COMPETENCES_DEFAUT, chargerCompetences, CATEGORIES_COMPETENCES } from '../../constants/niveauxCECR';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../config/supabase';
import { calcTranche } from '../../utils/trancheAge';

import AppreciationSeance, { BandeauAppreciation, useSeancesANoter } from "../../components/shared/AppreciationSeance";
import {
  SectionMonProfil, SectionPlanning, SectionObjectifs, SectionPaiement,
  SectionBoutique, SectionTemoignage, SectionSupport,
} from '../../components/apprenant/SectionsApprenant';

/* OUVERTURE DE LA SALLE VIRTUELLE — la règle et le délai viennent de `utils/ouvertureSalle`,
   partagés par l'apprenant, le parent, le coach et les quatre dashboards d'encadrement.
   Cet écran en gardait sa propre copie : c'est exactement la divergence que le module
   commun existe pour empêcher. */
const MS_OUVERTURE_SALLE = MINUTES_OUVERTURE_SALLE * 60 * 1000;
const _API = process.env.REACT_APP_API_URL || 'http://localhost:5001';

// Convertit un lien YouTube/Vimeo classique en URL d'embed lisible dans un <iframe> ;
// renvoie null si ce n'est pas un lien reconnu (dans ce cas on utilise <video> directement,
// pour les fichiers uploadés ou les URLs directes .mp4).
function urlEmbedVideo(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

/**
 * Rendu du média d'un contenu d'onboarding - les mêmes contenus que dash, servis par
 * `/api/dash/contenus/onboarding/publiques`. Le type `image`, proposé par le formulaire
 * côté onboarding, n'était traité nulle part : l'apprenant ne voyait rien du tout.
 * Le cas `default` garantit qu'un type ajouté plus tard reste au moins ouvrable.
 */
function MediaContenuOnb({ contenu }) {
  const url = contenu?.fichier_url;
  if (!url) return null;
  const embed = urlEmbedVideo(url);
  const lienStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
    background: '#EFF6FF', color: '#1D4ED8', fontSize: 12, fontWeight: 700, textDecoration: 'none',
  };
  switch (contenu.type) {
    case 'video':
      return embed
        ? <iframe src={embed} title={contenu.titre} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ width:'100%', aspectRatio:'16/9', borderRadius:8, border:'none' }} />
        : <video src={url} controls style={{ width:'100%', maxHeight:320, borderRadius:8, background:'#000' }} />;
    case 'audio':
      return <audio src={url} controls style={{ width:'100%' }} />;
    case 'image':
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ display:'block' }}>
          <img src={url} alt={contenu.titre} loading="lazy" style={{ width:'100%', maxHeight:420, objectFit:'contain', borderRadius:8, background:'#f1f5f9', display:'block' }} />
        </a>
      );
    case 'pdf':
      return <a href={url} target="_blank" rel="noopener noreferrer" style={lienStyle}>📄 Ouvrir le document</a>;
    default:
      return <a href={url} target="_blank" rel="noopener noreferrer" style={lienStyle}>📎 Ouvrir le fichier</a>;
  }
}

// ── Section routing ──────────────────────────────────────────────────────────
const CHEMIN_VERS_SECTION = {
  '/apprenant/dashboard':   'tableau_bord',
  '/apprenant/cours':       'cours',
  '/apprenant/ressources':  'fichiers',
  '/apprenant/devoirs':     'exercices_devoirs',
  '/apprenant/exercices':   'exercices_devoirs',
  '/apprenant/session':     'session_live',
  '/apprenant/progression': 'progression',
  '/apprenant/resultats':   'resultats',
  '/apprenant/badges':      'badges',
  '/apprenant/bulletin':    'resultats',
  '/apprenant/minijeux':      'minijeux',
  '/apprenant/dictionnaire':  'dictionnaire',
  '/apprenant/classement':    'classement',
  '/apprenant/presences':    'presences',
  '/apprenant/onboarding':   'onboarding',
  '/apprenant/profil':       'mon_profil',
  '/apprenant/planning':     'planning',
  '/apprenant/objectifs':    'objectifs',
  '/apprenant/paiement':     'paiement',
  '/apprenant/boutique':     'boutique',
  '/apprenant/temoignage':   'temoignage',
  '/apprenant/support':      'support',
};

// ── Données mini-jeux (contenu pédagogique statique, pas des mocks) ────────────
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
// Anagramme
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
// Sprint vocabulaire
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
// Vrai ou Faux - grammaire
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
// Phrases à réordonner
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
// Complétion de dialogue
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
// Flashcards
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
// Conjugaison express - verbes irréguliers
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
// Défi CECR
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
// Dictée éclair
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
// Mots croisés - une grille fixe, 2 mots horizontaux + 2 verticaux
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

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtHeure(d) {
  if (!d) return '-';
  return new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function Puce({ label, fond, texte }) {
  return (
    <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:20, background:fond, color:texte, fontSize:11, fontWeight:700 }}>
      {label}
    </span>
  );
}

// ── Fichiers partagés (section dédiée apprenant) ──────────────────────────────
const CATS_FICHIERS = [
  { id: 'tous',     lib: 'Tous',          icone: '📂' },
  { id: 'cours',    lib: 'Cours',         icone: '📄' },
  { id: 'exercice', lib: 'Exercices',     icone: '✏️' },
  { id: 'audio',    lib: 'Audio / Vidéo', icone: '🎵' },
  { id: 'ressource',lib: 'Ressources',    icone: '📎' },
  { id: 'autre',    lib: 'Autres',        icone: '📁' },
];
const COULEUR_CAT_F = {
  cours: '#0891B2', exercice: '#8B5CF6', audio: '#F97316',
  ressource: '#059669', autre: '#64748B',
};
function iconeParExt(nom) {
  const ext = (nom || '').split('.').pop().toLowerCase();
  if (['mp3','mp4','wav','ogg','webm'].includes(ext)) return '🎵';
  if (['jpg','jpeg','png','gif','svg'].includes(ext)) return '🖼';
  if (ext === 'pdf') return '📄';
  if (['doc','docx'].includes(ext)) return '📝';
  if (['ppt','pptx'].includes(ext)) return '📊';
  if (['xls','xlsx'].includes(ext)) return '📈';
  if (ext === 'zip') return '🗜';
  return '📎';
}

// ── Composant principal ──────────────────────────────────────────────────────
// ── Composant Dictionnaire réel (Free Dictionary API + MyMemory) ──────────────
function SectionDictionnaire({ S, COULEURS }) {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const [sens,       setSens]       = useState('ang_fr');  // 'ang_fr' | 'fr_ang'
  const [query,      setQuery]      = useState('');
  const [resultat,   setResultat]   = useState(null);   // données de l'API
  const [traduction, setTraduction] = useState('');
  const [chargement, setChargement] = useState(false);
  const [erreur,     setErreur]     = useState('');
  const [historique, setHistorique] = useState([]);

  async function rechercherMot(e) {
    e && e.preventDefault();
    const mot = query.trim();
    if (!mot) return;
    setChargement(true);
    setErreur('');
    setResultat(null);
    setTraduction('');

    try {
      // Mot anglais à chercher dans l'API dictionnaire
      let motAnglais = mot;

      // Si recherche FR → ANG : traduire d'abord le mot FR en AN via MyMemory
      if (sens === 'fr_ang') {
        const tResp = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(mot)}&langpair=fr|en`);
        const tData = await tResp.json();
        motAnglais = tData?.responseData?.translatedText || mot;
      }

      // Appel Free Dictionary API (anglais)
      const resp = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(motAnglais.toLowerCase())}`);
      if (!resp.ok) throw new Error('Mot non trouvé dans le dictionnaire.');
      const data = await resp.json();
      const entree = data[0];

      // Traduction EN → FR via MyMemory
      const tResp2 = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(motAnglais)}&langpair=en|fr`);
      const tData2 = await tResp2.json();
      const trad = tData2?.responseData?.translatedText || '';

      setResultat(entree);
      setTraduction(trad);

      // Ajouter à l'historique (éviter les doublons)
      setHistorique(prev => {
        const filtered = prev.filter(h => h.mot !== motAnglais.toLowerCase());
        return [{ mot: motAnglais.toLowerCase(), trad }, ...filtered].slice(0, 10);
      });
    } catch (err) {
      setErreur(err.message || 'Erreur lors de la recherche. Vérifiez votre connexion.');
    } finally {
      setChargement(false);
    }
  }

  function rechercherDepuisHistorique(mot) {
    setQuery(mot);
    setSens('ang_fr');
    setTimeout(() => rechercherMot(), 0);
  }

  const phonetique = resultat?.phonetics?.find(p => p.text)?.text || '';
  const significations = resultat?.meanings || [];

  return (
    <div>
      <div style={S.titre}>📘 Dictionnaire Anglais / Français</div>
      <div style={{ fontSize:12, color:COULEURS.gris400, marginBottom:20 }}>
        Dictionnaire en temps réel · Définitions, traductions et exemples
      </div>

      {/* Sélecteur de sens */}
      <div style={{ display:'flex', gap:8, marginBottom:16, background:COULEURS.gris50, padding:5, borderRadius:10, width:'fit-content' }}>
        {[['ang_fr','🇬🇧 Anglais → Français'],['fr_ang','🇫🇷 Français → Anglais']].map(([val,lib]) => (
          <button key={val} onClick={() => { setSens(val); setQuery(''); setResultat(null); setErreur(''); }}
            style={{ padding:'8px 18px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', fontSize:13, fontWeight:600,
              background: sens===val ? COULEURS.navy : 'transparent',
              color:      sens===val ? '#fff' : COULEURS.gris600,
              boxShadow:  sens===val ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
            }}>
            {lib}
          </button>
        ))}
      </div>

      {/* Formulaire de recherche */}
      <form onSubmit={rechercherMot} style={{ display:'flex', gap:10, marginBottom:20 }}>
        <div style={{ position:'relative', flex:1 }}>
          <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:16 }}>🔍</span>
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder={sens==='ang_fr' ? 'Entrez un mot anglais… ex: beautiful' : 'Entrez un mot français… ex: magnifique'}
            style={{ width:'100%', padding:'13px 44px', borderRadius:12, border:`2px solid ${COULEURS.gris200}`, fontSize:14, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', boxSizing:'border-box', transition:'border-color 0.2s' }}
            onFocus={e => e.target.style.borderColor=couleurTheme}
            onBlur={e => e.target.style.borderColor=COULEURS.gris200} />
          {query && <button type="button" onClick={() => { setQuery(''); setResultat(null); setErreur(''); }} style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', fontSize:18, cursor:'pointer', color:COULEURS.gris400 }}>×</button>}
        </div>
        <button type="submit" disabled={chargement || !query.trim()}
          style={{ padding:'13px 24px', borderRadius:12, border:'none', background: chargement||!query.trim() ? COULEURS.gris200 : couleurTheme, color:'#fff', fontSize:14, fontWeight:700, cursor: chargement||!query.trim() ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', flexShrink:0 }}>
          {chargement ? '⏳' : 'Chercher'}
        </button>
      </form>

      {/* Erreur */}
      {erreur && (
        <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'12px 16px', marginBottom:20, fontSize:13, color:'#DC2626' }}>
          ⚠️ {erreur}
        </div>
      )}

      {/* Résultat */}
      {resultat && (
        <div style={{ background:COULEURS.blanc, borderRadius:16, border:`1px solid ${COULEURS.gris200}`, overflow:'hidden', marginBottom:24, boxShadow:'0 4px 20px rgba(0,0,0,0.06)' }}>
          {/* Header du mot */}
          <div style={{ background:`linear-gradient(135deg,${COULEURS.navy},${couleurThemeFonce})`, padding:'20px 24px', color:'#fff' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
              <div>
                <div style={{ fontSize:34, fontWeight:900, marginBottom:4 }}>{resultat.word}</div>
                {phonetique && <div style={{ fontSize:14, color:'rgba(255,255,255,0.6)', marginBottom:8 }}>{phonetique}</div>}
                {resultat.phonetics?.find(p => p.audio) && (
                  <audio controls src={resultat.phonetics.find(p => p.audio).audio}
                    style={{ height:32, filter:'invert(1) opacity(0.8)' }} />
                )}
              </div>
              {traduction && (
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>🇫🇷 Traduction</div>
                  <div style={{ fontSize:24, fontWeight:800, color:'#FCD34D' }}>{traduction}</div>
                </div>
              )}
            </div>
          </div>

          {/* Significations */}
          <div style={{ padding:'20px 24px' }}>
            {significations.map((sig, i) => (
              <div key={i} style={{ marginBottom:20 }}>
                <div style={{ display:'inline-block', padding:'4px 12px', borderRadius:20, background:`${couleurTheme}15`, color:couleurThemeFonce, fontSize:12, fontWeight:700, marginBottom:12 }}>
                  {sig.partOfSpeech}
                </div>
                {sig.definitions.slice(0,3).map((def, j) => (
                  <div key={j} style={{ marginBottom:12, paddingLeft:16, borderLeft:`3px solid ${j===0?couleurTheme:COULEURS.gris200}` }}>
                    <div style={{ fontSize:13, color:COULEURS.navy, fontWeight:600, marginBottom:4 }}>{def.definition}</div>
                    {def.example && (
                      <div style={{ fontSize:12, color:COULEURS.gris400, fontStyle:'italic' }}>
                        📝 "{def.example}"
                      </div>
                    )}
                    {def.synonyms?.length > 0 && (
                      <div style={{ marginTop:6, display:'flex', gap:5, flexWrap:'wrap' }}>
                        {def.synonyms.slice(0,4).map(s => (
                          <button key={s} onClick={() => { setQuery(s); setSens('ang_fr'); setTimeout(rechercherMot, 0); }}
                            style={{ padding:'2px 8px', borderRadius:20, background:COULEURS.gris100, color:COULEURS.gris600, fontSize:11, fontWeight:600, border:'none', cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {sig.synonyms?.length > 0 && (
                  <div style={{ marginTop:8 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:COULEURS.gris400 }}>Synonymes : </span>
                    {sig.synonyms.slice(0,5).map(s => (
                      <button key={s} onClick={() => { setQuery(s); setSens('ang_fr'); setTimeout(rechercherMot, 0); }}
                        style={{ margin:'0 4px 4px 0', padding:'3px 10px', borderRadius:20, background:`${couleurTheme}12`, color:couleurThemeFonce, fontSize:11, fontWeight:600, border:'none', cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
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
      {!resultat && !chargement && !erreur && (
        <div style={{ textAlign:'center', padding:'32px 20px', color:COULEURS.gris400, background:COULEURS.gris50, borderRadius:16, border:`1px dashed ${COULEURS.gris200}` }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📘</div>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:6, color:COULEURS.navy }}>Chercher n'importe quel mot anglais ou français</div>
          <div style={{ fontSize:13 }}>Définitions, prononciation audio, exemples et traduction en temps réel.</div>
          {historique.length > 0 && (
            <div style={{ marginTop:20 }}>
              <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Recherches récentes</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
                {historique.map(h => (
                  <button key={h.mot} onClick={() => rechercherDepuisHistorique(h.mot)}
                    style={{ padding:'5px 14px', borderRadius:20, background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, color:COULEURS.navy, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                    {h.mot} <span style={{ color:COULEURS.gris400 }}>· {h.trad}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardApprenant() {
  // Cours a evaluer - en TETE du composant : ce fichier comporte des retours anticipes,
  // et un hook appele apres l'un d'eux ne serait pas execute a chaque rendu.
  const { seances: seancesANoter, recharger: rechargerANoter } = useSeancesANoter(
    _API, () => localStorage.getItem("bet_access_token") || localStorage.getItem("admin_token")
  );
  const [appreciationOuverte, setAppreciationOuverte] = useState(false);

  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const { profile }  = useAuth();
  const navigate     = useNavigate();
  const location     = useLocation();
  const section      = CHEMIN_VERS_SECTION[location.pathname] || 'tableau_bord';

  const [apprenant, setApprenant]     = useState(null);
  const [competencesParNiveau, setCompetencesParNiveau] = useState(COMPETENCES_DEFAUT);
  useEffect(() => {
    const token = localStorage.getItem('bet_access_token');
    if (!token) return;
    chargerCompetences(token).then(setCompetencesParNiveau);
  }, []);
  const [modalRendre, setModalRendre] = useState(null);
  const [rendreForm, setRendreForm]   = useState({ fichier: null, texte: '' });
  const [rendus, setRendus]           = useState({});
  const [filtreDevoir, setFiltreDevoir] = useState('tous');
  const [sousOngletExDev, setSousOngletExDev] = useState(() =>
    location.pathname === '/apprenant/exercices' ? 'exercices' : 'devoirs'
  );
  const [sousOngletRB, setSousOngletRB] = useState('resultats');
  const [rechercheCours, setRechercheCours] = useState('');
  const [categorieFichier, setCategorieFichier] = useState('tous');
  const [rechercheFichier, setRechercheFichier] = useState('');
  const [presDateDebut, setPresDateDebut] = useState('');
  const [presDateFin,   setPresDateFin]   = useState('');
  const [presPage,      setPresPage]      = useState(1);
  const [liveDateDebut, setLiveDateDebut] = useState('');
  const [liveDateFin,   setLiveDateFin]   = useState('');
  const [liveAVenirPage, setLiveAVenirPage] = useState(1);
  const [liveReplayPage, setLiveReplayPage] = useState(1);

  // ── Exercice modal ──
  const [exerciceOuvert, setExerciceOuvert] = useState(null);
  /* `exoTermines` A ÉTÉ SUPPRIMÉ. Deux états décrivaient le même fait — « ce cours est
     terminé » : `terminesLive`, chargé depuis `/mes-cours-lus` et écrit en base par le
     lecteur de session, et celui-ci, purement local au modal de cours. Le bouton du modal
     ne faisait donc que colorer un bouton : rien ne partait au serveur, l'état se perdait
     au rechargement, et le coach voyait « 0 lecture » sur un cours que toute sa classe
     avait lu. Un seul état désormais, celui qui existe réellement en base. */
  const [exoReponses, setExoReponses]       = useState({});
  const [exoSoumis, setExoSoumis]           = useState({});


  // ── Session live ──
  const [sessionRejointe, setSessionRejointe] = useState(null);

  function rejoindreSession(s) {
    if (s.lien_visio) {
      const w = Math.min(1280, window.screen.width - 40);
      const h = Math.min(800,  window.screen.height - 80);
      const left = Math.round((window.screen.width  - w) / 2);
      const top  = Math.round((window.screen.height - h) / 2);
      window.open(s.lien_visio, 'bet_session_live',
        `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`);
    }
    setSessionRejointe(s.id);
  }
  const [sessionDetail, setSessionDetail]     = useState(null); // session_id → panneau programme
  const [coursOuvertLive, setCoursOuvertLive] = useState(null); // contenu ouvert dans le lecteur
  const [presentielInfoModal, setPresentielInfoModal] = useState(null); // session présentielle info
  const [reponsesQuizLive, setReponsesQuizLive] = useState({});
  const [quizSoumisLive, setQuizSoumisLive]   = useState({});
  const [terminesLive, setTerminesLive]       = useState({});
  const [confirmLuModal, setConfirmLuModal]   = useState(null); // contenu object en attente de confirmation

  // ── Mini-jeux ──
  const [jeu, setJeu]             = useState(null);
  // Types de jeu activés par Onboarding PA / PA Contenus (contenus_mini_jeux.actif) - un jeu
  // du catalogue ne doit être jouable que si son type est explicitement activé côté admin.
  const [jeuxActifsTypes, setJeuxActifsTypes] = useState(null); // null = pas encore chargé
  const [jeuxMaxTentatives, setJeuxMaxTentatives] = useState({}); // { [type]: nombre de tentatives autorisées }
  const [jeuxIdsParType, setJeuxIdsParType] = useState({}); // { [type]: id contenus_mini_jeux } - pour reporter les résultats
  const [mesJeuxKpis, setMesJeuxKpis] = useState(null); // { partiesJouees, jeuxJoues, meilleurScore, scoreMoyen }
  const [mesJeuxParType, setMesJeuxParType] = useState({});
  useEffect(() => {
    if (section !== 'minijeux') return;
    // On attend que `profile` soit chargé (donc que la session Supabase soit rehydratée) avant
    // de récupérer un token - sur un F5 direct sur /apprenant/minijeux, appeler
    // supabase.auth.getSession() immédiatement pouvait courir plus vite que la restauration de
    // session et échouer silencieusement, laissant jeuxActifsTypes bloqué à null pour toujours
    // (donc TOUS les jeux du catalogue affichés, même ceux désactivés côté admin).
    if (!profile?.id) return;
    (async () => {
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token || localStorage.getItem('bet_access_token');
        if (!token) { setJeuxActifsTypes([]); return; }
        const r = await fetch(`${_API}/api/contenus/mini-jeux/publiques`, { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) {
          const d = await r.json();
          setJeuxActifsTypes(d.actifs || []);
          setJeuxMaxTentatives(d.maxTentatives || {});
          setJeuxIdsParType(d.idsParType || {});
        } else {
          setJeuxActifsTypes([]);
        }

        // Réhydrate le nombre de tentatives déjà utilisées par l'apprenant pour chaque jeu -
        // sans ça, tentativesJeu repartait de 0 à chaque F5 et le verrouillage après N
        // tentatives pouvait être contourné en rechargeant simplement la page.
        try {
          const rMes = await fetch(`${_API}/api/contenus/mini-jeux/mes-resultats`, { headers: { Authorization: `Bearer ${token}` } });
          if (rMes.ok) {
            const dMes = await rMes.json();
            const parType = dMes.parType || {};
            setTentativesJeu(prev => {
              const next = { ...prev };
              Object.keys(parType).forEach(type => { next[type] = parType[type].tentatives; });
              return next;
            });
            Object.keys(parType).forEach(type => { attemptsRef.current[type] = parType[type].tentatives; });
            setMesJeuxParType(parType);
            setMesJeuxKpis(dMes.kpis || null);
          }
        } catch { /* silencieux - au pire le compteur repart de 0 pour cette session */ }
      } catch { setJeuxActifsTypes([]); } // en cas d'échec, on n'affiche rien plutôt que de rester bloqué en chargement
    })();
  }, [section, profile?.id]);

  // ── Gamification (points, badges, classement) ──
  const [gamifPoints, setGamifPoints] = useState(0);
  const [gamifBadges, setGamifBadges] = useState([]); // catalogue complet + { obtenu, obtenu_le }
  const [gamifClassement, setGamifClassement] = useState([]);
  const [celebrationBadge, setCelebrationBadge] = useState(null); // badge fraîchement débloqué → overlay de célébration
  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token || localStorage.getItem('bet_access_token');
        if (!token) return;
        const [rPoints, rBadges] = await Promise.all([
          fetch(`${_API}/api/gamification/mes-points`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${_API}/api/gamification/mes-badges`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (rPoints.ok) { const d = await rPoints.json(); setGamifPoints(d.solde || 0); }
        if (rBadges.ok) {
          const d = await rBadges.json();
          const badges = d.badges || [];
          setGamifBadges(badges);
          // Détecte un nouveau badge débloqué depuis le dernier passage (comparé à un cache local)
          // pour déclencher la célébration - sans rejouer l'animation pour des badges déjà vus, et
          // sans célébrer rétroactivement tout le catalogue au tout premier chargement.
          const clefVus = `bet_badges_vus_${profile.id}`;
          const dejaVus = JSON.parse(localStorage.getItem(clefVus) || 'null');
          const obtenus = badges.filter(b => b.obtenu);
          if (dejaVus !== null) {
            const nouveaux = obtenus.filter(b => !dejaVus.includes(b.id));
            if (nouveaux.length) setCelebrationBadge(nouveaux[0]);
          }
          localStorage.setItem(clefVus, JSON.stringify(obtenus.map(b => b.id)));
        }
      } catch { /* silencieux */ }
    })();
  }, [profile?.id, section]);

  // Classement de la classe - chargé à l'ouverture de l'onglet correspondant.
  useEffect(() => {
    if (section !== 'classement' || !apprenant?.groupe_id) return;
    (async () => {
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token || localStorage.getItem('bet_access_token');
        if (!token) return;
        const r = await fetch(`${_API}/api/gamification/classement?classe_id=${apprenant.groupe_id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) { const d = await r.json(); setGamifClassement(d.classement || []); }
      } catch { /* silencieux */ }
    })();
  }, [section, apprenant?.groupe_id]);

  // QCM Flash
  const [qcmIdx, setQcmIdx]       = useState(0);
  const [qcmScore, setQcmScore]   = useState(0);
  const [qcmChoix, setQcmChoix]   = useState(null);
  const [qcmFini, setQcmFini]     = useState(false);
  const [qcmTemps, setQcmTemps]   = useState(15);
  // Association
  const [assocSel, setAssocSel]   = useState(null);
  const [assocOk, setAssocOk]     = useState([]);
  // Mot manquant
  const [lacuneIdx, setLacuneIdx]       = useState(0);
  const [lacuneInput, setLacuneInput]   = useState('');
  const [lacuneScore, setLacuneScore]   = useState(0);
  const [lacuneFini, setLacuneFini]     = useState(false);
  const [lacuneMontre, setLacuneMontre] = useState(false);
  // Anagramme
  const [anaIdx, setAnaIdx]         = useState(0);
  const [anaInput, setAnaInput]     = useState('');
  const [anaScore, setAnaScore]     = useState(0);
  const [anaFini, setAnaFini]       = useState(false);
  const [anaMontre, setAnaMontre]   = useState(false);
  // Sprint vocabulaire
  const [sprintScore, setSprintScore]   = useState(0);
  const [sprintTemps, setSprintTemps]   = useState(60);
  const [sprintFini, setSprintFini]     = useState(false);
  const [sprintIdx, setSprintIdx]       = useState(0);
  const [sprintMots, setSprintMots]     = useState([]);
  // Vrai ou Faux
  const [vfIdx, setVfIdx]       = useState(0);
  const [vfScore, setVfScore]   = useState(0);
  const [vfFini, setVfFini]     = useState(false);
  const [vfChoix, setVfChoix]   = useState(null);
  // Phrases à réordonner
  const [reordreIdx, setReordreIdx]         = useState(0);
  const [reordreScore, setReordreScore]     = useState(0);
  const [reodreFini, setReodreFini]         = useState(false);
  const [reodreMots, setReodreMots]         = useState([]);
  const [reordreSelec, setReordreSelec]     = useState([]);
  const [reordreValide, setReordreValide]   = useState(null);
  // Complétion de dialogue
  const [dialogueIdx, setDialogueIdx]     = useState(0);
  const [dialogueEtape, setDialogueEtape] = useState(0);
  const [dialogueScore, setDialogueScore] = useState(0);
  const [dialogueFini, setDialogueFini]   = useState(false);
  // Flashcards
  const [flashIdx, setFlashIdx]         = useState(0);
  const [flashRetourne, setFlashRetourne] = useState(false);
  const [flashSus, setFlashSus]         = useState([]);
  // Conjugaison express
  const [conjIdx, setConjIdx]       = useState(0);
  const [conjInput, setConjInput]   = useState('');
  const [conjScore, setConjScore]   = useState(0);
  const [conjFini, setConjFini]     = useState(false);
  const [conjMontre, setConjMontre] = useState(false);
  // Défi CECR
  const [cecrIdx, setCecrIdx]   = useState(0);
  const [cecrScore, setCecrScore] = useState(0);
  const [cecrFini, setCecrFini] = useState(false);
  const [cecrChoix, setCecrChoix] = useState(null);
  // Dictée éclair
  const [dicteeIdx, setDicteeIdx]       = useState(0);
  const [dicteeInput, setDicteeInput]   = useState('');
  const [dicteeScore, setDicteeScore]   = useState(0);
  const [dicteeFini, setDicteeFini]     = useState(false);
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
  // Règle : max 2 tentatives par jeu
  const [tentativesJeu, setTentativesJeu] = useState({
    qcm:0, association:0, lacunes:0, anagramme:0, sprint:0,
    vrai_faux:0, reordre:0, dialogue:0, flashcards:0, conjugaison:0, cecr:0, dictee:0,
    traduction:0, mots_croises:0, mots_caches:0,
  });

  // ── Suivi réel des résultats de mini-jeux (score, tentative, %) consultable par
  // Onboarding PA / PA Contenus. Compteur de tentative dédié (indépendant de tentativesJeu,
  // dont l'incrémentation n'est pas homogène selon les jeux dans le code existant) pour que
  // le numéro de tentative reporté soit toujours exact.
  const attemptsRef = useRef({});
  function enregistrerResultatJeu(type, score, scoreMax) {
    const jeuId = jeuxIdsParType[type];
    if (!jeuId) return; // jeu inactif ou id inconnu - rien à reporter
    attemptsRef.current[type] = (attemptsRef.current[type] || 0) + 1;
    const tentative_numero = attemptsRef.current[type];
    (async () => {
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token || localStorage.getItem('bet_access_token');
        if (!token) return;
        await fetch(`${_API}/api/contenus/mini-jeux/${jeuId}/resultat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Plateforme': 'bet-elearning' },
          body: JSON.stringify({ score, score_max: scoreMax ?? null, tentative_numero }),
        });
        // Mise à jour optimiste des KPIs affichés - évite d'attendre un F5 pour les voir bouger.
        const pourcentage = scoreMax ? Math.round((score / scoreMax) * 100) : null;
        setMesJeuxParType(prev => {
          const cur = prev[type] || { tentatives: 0, meilleurPourcentage: null, moyennePourcentage: null };
          const nbAvantMoy = cur.moyennePourcentage != null ? cur.tentatives : 0;
          const nvlMoyenne = pourcentage != null
            ? Math.round(((cur.moyennePourcentage || 0) * nbAvantMoy + pourcentage) / (nbAvantMoy + 1))
            : cur.moyennePourcentage;
          return { ...prev, [type]: {
            tentatives: cur.tentatives + 1,
            dernierScore: score, dernierPourcentage: pourcentage,
            meilleurPourcentage: pourcentage != null ? Math.max(cur.meilleurPourcentage ?? -1, pourcentage) : cur.meilleurPourcentage,
            moyennePourcentage: nvlMoyenne,
          } };
        });
        setMesJeuxKpis(prev => {
          const base = prev || { partiesJouees: 0, jeuxJoues: 0, meilleurScore: null, scoreMoyen: null };
          const dejaJoue = mesJeuxParType[type] !== undefined;
          const total = base.partiesJouees + 1;
          const nvlMoyenne = pourcentage != null ? Math.round(((base.scoreMoyen || 0) * base.partiesJouees + pourcentage) / total) : base.scoreMoyen;
          return {
            partiesJouees: total,
            jeuxJoues: dejaJoue ? base.jeuxJoues : base.jeuxJoues + 1,
            meilleurScore: pourcentage != null ? Math.max(base.meilleurScore ?? -1, pourcentage) : base.meilleurScore,
            scoreMoyen: nvlMoyenne,
          };
        });
      } catch { /* silencieux - un résultat non reporté n'affecte pas le jeu de l'apprenant */ }
    })();
  }
  useEffect(() => { if (qcmFini) enregistrerResultatJeu('qcm', qcmScore, QCM_MOTS.length); }, [qcmFini]); // eslint-disable-line
  useEffect(() => { if (assocOk.length > 0 && assocOk.length === ASSOC_PAIRES_DATA.length) enregistrerResultatJeu('association', assocOk.length, ASSOC_PAIRES_DATA.length); }, [assocOk]); // eslint-disable-line
  useEffect(() => { if (lacuneFini) enregistrerResultatJeu('lacunes', lacuneScore, LACUNES_DATA.length); }, [lacuneFini]); // eslint-disable-line
  useEffect(() => { if (anaFini) enregistrerResultatJeu('anagramme', anaScore, ANAGRAMME_DATA.length); }, [anaFini]); // eslint-disable-line
  useEffect(() => { if (sprintFini) enregistrerResultatJeu('sprint', sprintScore, null); }, [sprintFini]); // eslint-disable-line
  useEffect(() => { if (vfFini) enregistrerResultatJeu('vrai_faux', vfScore, VRAI_FAUX_DATA.length); }, [vfFini]); // eslint-disable-line
  useEffect(() => { if (reodreFini) enregistrerResultatJeu('reordre', reordreScore, REORDRE_DATA.length); }, [reodreFini]); // eslint-disable-line
  useEffect(() => { if (dialogueFini) enregistrerResultatJeu('dialogue', dialogueScore, DIALOGUE_DATA.length); }, [dialogueFini]); // eslint-disable-line
  useEffect(() => { if (conjFini) enregistrerResultatJeu('conjugaison', conjScore, CONJUGAISON_DATA.length); }, [conjFini]); // eslint-disable-line
  useEffect(() => { if (cecrFini) enregistrerResultatJeu('cecr', cecrScore, CECR_DATA.length); }, [cecrFini]); // eslint-disable-line
  useEffect(() => { if (dicteeFini) enregistrerResultatJeu('dictee', dicteeScore, DICTEE_DATA.length); }, [dicteeFini]); // eslint-disable-line
  useEffect(() => { if (traFini) enregistrerResultatJeu('traduction', traScore, TRADUCTION_DATA.length); }, [traFini]); // eslint-disable-line
  useEffect(() => { if (crossFini && crossValide) enregistrerResultatJeu('mots_croises', crossValide.score, CROSSWORD.mots.length); }, [crossFini]); // eslint-disable-line
  useEffect(() => { if (wsFini) enregistrerResultatJeu('mots_caches', wsTrouves.length, WORDSEARCH_MOTS_POS.length); }, [wsFini]); // eslint-disable-line

  // Timer QCM
  useEffect(() => {
    if (jeu !== 'qcm' || qcmFini || qcmChoix !== null) return;
    if (qcmTemps <= 0) { setQcmChoix('__timeout__'); return; }
    const t = setTimeout(() => setQcmTemps(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [jeu, qcmFini, qcmChoix, qcmTemps]);

  // Timer Sprint
  useEffect(() => {
    if (jeu !== 'sprint' || sprintFini) return;
    if (sprintTemps <= 0) { setSprintFini(true); return; }
    const t = setTimeout(() => setSprintTemps(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [jeu, sprintFini, sprintTemps]);

  // Init sprint mots mélangés
  useEffect(() => {
    if (jeu === 'sprint') {
      setSprintMots([...SPRINT_MOTS].sort(() => Math.random() - 0.5));
    }
  }, [jeu]);

  // Init phrases à réordonner
  useEffect(() => {
    if (jeu === 'reordre') {
      setReodreMots([...REORDRE_DATA[reordreIdx].mots].sort(() => Math.random() - 0.5));
      setReordreSelec([]);
      setReordreValide(null);
    }
  }, [jeu, reordreIdx]);

  // Onboarding
  const ETAPES_ONBOARDING = [
    { id: 'bienvenue',    icone: '🎬', titre: 'Présentation de la plateforme', desc: "Découvrez BET E-Learning : comment naviguer, accéder à vos cours et utiliser les outils disponibles.", duree: '3 min' },
    { id: 'regles',       icone: '📋', titre: "Règles & Charte de l'apprenant", desc: "Les engagements attendus : ponctualité, respect, participation active. Tout ce qu'il faut savoir avant de commencer.", duree: '2 min' },
    { id: 'processus',    icone: '🗺️', titre: "Processus d'apprentissage", desc: "Comment se déroulent les sessions, les devoirs, les évaluations et la progression jusqu'au certificat.", duree: '4 min' },
    { id: 'certification',icone: '🏆', titre: 'Votre certificat BET', desc: "Les critères pour obtenir votre certificat : assiduité, notes, passage de niveau. Votre objectif final.", duree: '2 min' },
  ];
  /* ── LE GUIDE DE BIENVENUE SE TERMINE UNE FOIS, PAR COMPTE ──
     Son état ne vivait QUE dans `localStorage`. Il était donc attaché au navigateur et non
     à l'apprenant : le même compte revoyait les quatre étapes sur son téléphone, sur un
     autre poste, ou après un simple nettoyage de cache. Le serveur gardait pourtant la
     trace de la validation depuis le début — elle n'était jamais relue.
     `localStorage` reste utilisé, mais seulement pour ÉVITER LE CLIGNOTEMENT : sans lui,
     le guide s'afficherait une fraction de seconde à chaque chargement, le temps que la
     réponse du serveur arrive. C'est le serveur qui tranche. */
  const clefOnboarding = `bet_onboarding_done_${profile?.id || 'default'}`;
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem(clefOnboarding));
  useEffect(() => {
    if (!profile?.id) return;
    let vivant = true;
    (async () => {
      try {
        const sess = await supabase.auth.getSession();
        const tok = sess.data.session?.access_token || localStorage.getItem('bet_access_token');
        if (!tok) return;
        const r = await fetch(`${_API}/api/gamification/onboarding-complete`, { headers: { Authorization: `Bearer ${tok}` } });
        if (!r.ok || !vivant) return;
        const d = await r.json();
        if (d.fait) {
          /* On recopie dans `localStorage` pour que les prochains chargements de CE
             navigateur n'aient plus à attendre la réponse. */
          localStorage.setItem(clefOnboarding, '1');
          setShowOnboarding(false);
        }
      } catch { /* hors ligne : on garde ce que dit le navigateur */ }
    })();
    return () => { vivant = false; };
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [etapesValidees, setEtapesValidees] = useState({});
  const toutValide = ETAPES_ONBOARDING.every(e => etapesValidees[e.id]);
  async function validerOnboarding() {
    localStorage.setItem(clefOnboarding, '1');
    setShowOnboarding(false);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token || localStorage.getItem('bet_access_token');
      if (token) {
        await fetch(`${_API}/api/gamification/onboarding-complete`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      }
    } catch { /* silencieux - l'onboarding reste validé côté client même si l'appel échoue */ }
  }

  // Étape dépliée + contenus (vidéos/PDFs de bienvenue) liés à chaque étape, chargés depuis
  // la bibliothèque de contenus onboarding gérée par Onboarding PA / PA Contenus.
  const [etapeOuverte, setEtapeOuverte] = useState(null);
  const [contenusOnboarding, setContenusOnboarding] = useState({});
  const [contenusOnbLoading, setContenusOnbLoading] = useState(false);
  // Suivi des vues - une seule vue comptabilisée par ressource et par session (pas à chaque
  // ouverture/fermeture répétée d'une étape ou relecture d'une vidéo déjà comptée).
  const vuesEnvoyeesRef = useRef(new Set());
  function enregistrerVue(table, id) {
    const clef = `${table}:${id}`;
    if (vuesEnvoyeesRef.current.has(clef)) return;
    vuesEnvoyeesRef.current.add(clef);
    (async () => {
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token || localStorage.getItem('bet_access_token');
        if (!token) return;
        await fetch(`${_API}/api/contenus/${table}/${id}/vue`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      } catch { /* silencieux - un compteur de vue raté n'a aucun impact fonctionnel */ }
    })();
  }
  // Bibliothèque communautaire - accessible à tous les apprenants, indépendante des 4 étapes
  // d'onboarding, chargée uniquement sur l'onglet "Onboarding" permanent (pas dans le modal
  // de bienvenue, qui ne concerne que le parcours d'arrivée).
  const [biblioComApp, setBiblioComApp] = useState([]);
  useEffect(() => {
    // Chargé pour le modal de bienvenue (1ère connexion) ET pour l'onglet "Onboarding"
    // permanent accessible depuis la nav, qui permet de revoir ces contenus à tout moment.
    if (!showOnboarding && section !== 'onboarding') return;
    // Idem mini-jeux : on attend `profile` pour éviter de courir plus vite que la restauration
    // de session Supabase sur un F5 direct sur la page.
    if (!profile?.id) return;
    (async () => {
      setContenusOnbLoading(true);
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token || localStorage.getItem('bet_access_token');
        if (!token) return;
        // Contenus de bienvenue réellement écrits par Onboarding (table contenus_onboarding_dash) -
        // /api/contenus/ressources/publiques lit une tout autre table (contenus_ressources),
        // jamais alimentée par ce formulaire : les contenus ajoutés n'apparaissaient jamais ici.
        const r = await fetch(`${_API}/api/dash/contenus/onboarding/publiques`, { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) {
          const d = await r.json();
          const parCat = {};
          (d.contenus || []).forEach(res => { (parCat[res.cat] ||= []).push(res); });
          setContenusOnboarding(parCat);
        }
        if (section === 'onboarding') {
          const r2 = await fetch(`${_API}/api/contenus/biblio-communautaire/publiques`, { headers: { Authorization: `Bearer ${token}` } });
          if (r2.ok) { const d2 = await r2.json(); setBiblioComApp(d2.ressources || []); }
        }
      } catch { /* silencieux - l'étape reste consultable sans contenu lié */ }
      finally { setContenusOnbLoading(false); }
    })();
  }, [showOnboarding, section, profile?.id]);

  // ── Données réelles e-learning (Supabase) ──────────────────────────────────
  const [trancheChargee,        setTrancheChargee]        = useState(false);
  const [inscriptionReelle,     setInscriptionReelle]     = useState(null);
  const [seancesReelles_app,    setSeancesReelles_app]    = useState([]);
  const [presencesReelles_app,  setPresencesReelles_app]  = useState([]);
  const [progressionReelle_app, setProgressionReelle_app] = useState([]);
  const [resultatsReels_app,    setResultatsReels_app]    = useState([]);
  const [contenusReels_app,     setContenus_app]          = useState([]);
  const [fichiersReels_app,     setFichiers_app]          = useState([]);
  // Devoirs
  const [devoirsReels_app,    setDevoirsReels_app]    = useState([]);
  const [devoirOuvertApp,     setDevoirOuvertApp]     = useState(null); // devoir sélectionné
  const [devoirRenduState,    setDevoirRenduState]    = useState({}); // { [devoirId]: { statut, note, ... } }
  const [submitTexte,         setSubmitTexte]         = useState('');
  const [submitQcm,           setSubmitQcm]           = useState({}); // { questionIdx: reponse }
  const [submitBlocs,         setSubmitBlocs]         = useState({}); // { [blocId]: { [qIndex]: option, texte, audioUrl } } - devoirs "mixte"
  const [submitLoading,       setSubmitLoading]       = useState(false);
  const [submitFichier,       setSubmitFichier]       = useState(null);
  const [submitErreur,        setSubmitErreur]        = useState('');
  const [recState,            setRecState]            = useState({}); // { [blocId]: { recording, uploading, seconds } }

  /* ── LE MINUTEUR DE COMPOSITION ──
     L'échéance vient du SERVEUR et n'est jamais calculée ici : le navigateur ne fait que
     l'afficher et déclencher l'envoi à zéro. Un chrono calculé localement se contournerait
     en changeant l'horloge de sa machine ou en rouvrant dans un autre onglet.
     `echeanceComposition` est une date ISO renvoyée par `/devoirs/:id/commencer`. */
  const [compo, setCompo] = useState(null); // { echeance, duree_min, chronometre, expire }
  const autoEnvoiFait = useRef(false);

  /* ── LE DEVOIR EN COURS SURVIT AU RECHARGEMENT ──
     Actualiser la page refermait le panneau et effaçait tout ce qui avait été saisi : un
     apprenant à mi-chemin d'une composition perdait son travail sur un simple F5, un
     réseau qui coupe ou un téléphone qui met l'onglet en veille. Le rendu n'est envoyé
     qu'à la soumission — il n'y avait donc aucun filet entre l'ouverture et l'envoi.

     `sessionStorage` et non `localStorage` : le brouillon appartient à CETTE session de
     travail. Le retrouver des jours plus tard, sur un devoir peut-être déjà rendu ou
     expiré, créerait plus de confusion qu'il n'en éviterait.

     Le fichier choisi ne peut pas être conservé — un objet `File` n'est pas sérialisable,
     et le navigateur n'autorise pas à repeupler un `<input type="file">`. On le dit
     explicitement à la réouverture plutôt que de laisser croire qu'il est toujours joint. */
  const CLE_BROUILLON = `bet_devoir_en_cours_${profile?.id || 'anon'}`;
  const brouillonRestaure = useRef(false);
  const [fichierAJoindreDeNouveau, setFichierAJoindreDeNouveau] = useState(false);

  useEffect(() => {
    try {
      const b = JSON.parse(sessionStorage.getItem(CLE_BROUILLON) || 'null');
      if (!b?.devoirId) return;
      setSubmitTexte(b.texte || '');
      setSubmitQcm(b.qcm || {});
      setSubmitBlocs(b.blocs || {});
      setFichierAJoindreDeNouveau(!!b.avaitUnFichier);
      brouillonRestaure.current = b.devoirId;   // le devoir sera rouvert dès qu'il sera chargé
    } catch { /* brouillon illisible : on repart à zéro plutôt que de planter */ }
  }, [CLE_BROUILLON]);

  /* La réouverture attend que les devoirs soient chargés : on rouvre l'OBJET, pas un
     identifiant — le panneau lit ses consignes, sa date limite et ses blocs. Un devoir
     entre-temps rendu, corrigé ou expiré n'est pas rouvert : le brouillon n'a plus
     d'objet, et le rouvrir enverrait l'apprenant sur un écran qu'il ne peut plus valider. */
  useEffect(() => {
    const id = brouillonRestaure.current;
    if (!id || devoirOuvertApp || !devoirsReels_app.length) return;
    const d = devoirsReels_app.find(x => x.id === id);
    brouillonRestaure.current = null;
    if (!d) return;
    const rendu = devoirRenduState[id];
    if (rendu?.statut === 'corrige') return;
    setDevoirOuvertApp(d);
  }, [devoirsReels_app, devoirRenduState, devoirOuvertApp]);

  /* On enregistre à chaque frappe. C'est un objet de quelques kilo-octets au plus, écrit
     en mémoire du navigateur : le coût est nul comparé à la perte qu'il évite. */
  useEffect(() => {
    try {
      if (!devoirOuvertApp) { sessionStorage.removeItem(CLE_BROUILLON); return; }
      sessionStorage.setItem(CLE_BROUILLON, JSON.stringify({
        devoirId: devoirOuvertApp.id,
        texte: submitTexte,
        qcm: submitQcm,
        blocs: submitBlocs,
        avaitUnFichier: !!submitFichier,
      }));
    } catch { /* quota plein ou stockage refusé : le brouillon est un confort, pas un dû */ }
  }, [devoirOuvertApp, submitTexte, submitQcm, submitBlocs, submitFichier, CLE_BROUILLON]);
  const [confirmOuvrirDevoir, setConfirmOuvrirDevoir] = useState(null); // devoir en attente de confirmation d'ouverture
  const [confirmSoumettre,    setConfirmSoumettre]    = useState(false); // confirmation avant envoi définitif
  const mediaRecordersRef = useRef({});

  const startRecording = async (blocId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const isFirefox = /firefox/i.test(navigator.userAgent);
      const mimeCandidates = isFirefox
        ? ['audio/ogg;codecs=opus', 'audio/ogg', 'audio/webm;codecs=opus', 'audio/webm']
        : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
      const chosenMime = mimeCandidates.find(m => MediaRecorder.isTypeSupported?.(m)) || '';
      const recorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime }) : new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(mediaRecordersRef.current[blocId]?.timer);
        setRecState(p => ({ ...p, [blocId]: { ...p[blocId], recording:false, uploading:true } }));
        try {
          const realMime = recorder.mimeType || chosenMime || 'audio/webm';
          const ext = realMime.includes('ogg') ? 'ogg' : realMime.includes('mp4') ? 'm4a' : 'webm';
          const blob = new Blob(chunks, { type: realMime });
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;
          const fd = new FormData();
          fd.append('audio', blob, `speaking.${ext}`);
          const r = await fetch(`${_API}/api/elearning/upload-audio-speaking`, { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body: fd });
          const d = await r.json();
          if (r.ok && d.url) setSubmitBlocs(p => ({ ...p, [blocId]: { ...(p[blocId]||{}), audioUrl: d.url } }));
          else setSubmitErreur(d.error || "Échec de l'envoi de l'enregistrement");
        } catch { setSubmitErreur("Erreur réseau lors de l'envoi de l'enregistrement"); }
        setRecState(p => ({ ...p, [blocId]: { ...p[blocId], uploading:false } }));
      };
      recorder.start();
      mediaRecordersRef.current[blocId] = { recorder };
      setRecState(p => ({ ...p, [blocId]: { recording:true, uploading:false, seconds:0 } }));
      mediaRecordersRef.current[blocId].timer = setInterval(() => {
        setRecState(p => ({ ...p, [blocId]: { ...p[blocId], seconds:(p[blocId]?.seconds||0)+1 } }));
      }, 1000);
    } catch {
      setSubmitErreur('Impossible d\'accéder au microphone - vérifiez les autorisations du navigateur.');
    }
  };
  const stopRecording = (blocId) => mediaRecordersRef.current[blocId]?.recorder?.stop();
  const fmtRecTime = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  const [nowTick,             setNowTick]             = useState(() => new Date());

  // Timer tick chaque seconde pour le compte à rebours des devoirs
  useEffect(() => {
    const t = setInterval(() => setNowTick(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    // Profil minimal stable dès le départ (tranche_age adulte par défaut pour éviter le basculement d'onglets)
    setApprenant({
      id: profile.id, profile_id: profile.id,
      prenom: profile.prenom || '', nom: profile.nom || '',
      niveau_cecr: 'A1', groupe_id: null, statut: 'actif',
      email: profile.email || '', points_gamif: 0, tranche_age: 'adulte',
    });
    if (!supabase) { setTrancheChargee(true); return; }
    (async () => {
      try {
        // 1. Trouver l'inscription active de l'apprenant
        const { data: inscr } = await supabase
          .from('classes_elearning_apprenants')
          .select('*, classe:classes_elearning(*)')
          .eq('apprenant_id', profile.id)
          .neq('statut', 'suspendu')
          .limit(1)
          .maybeSingle();
        if (!inscr) { setTrancheChargee(true); return; }
        setInscriptionReelle(inscr);
        setApprenant({
          id:           inscr.id,
          profile_id:   profile.id,
          prenom:       profile.prenom || '',
          nom:          profile.nom    || '',
          niveau_cecr:  inscr.niveau_cecr || 'A1',
          groupe_id:    inscr.classe_id,
          statut:       inscr.statut   || 'actif',
          email:        inscr.email    || profile.email,
          points_gamif: 0,
          tranche_age:  calcTranche(inscr.date_naissance),
        });
        setTrancheChargee(true);
        // 2. Chargement parallèle des données liées
        const [{ data: seances }, { data: pres }, { data: prog }, { data: res }] = await Promise.all([
          supabase.from('seances_elearning')
            .select('*')
            .eq('classe_id', inscr.classe_id)
            .order('date', { ascending: false }),
          supabase.from('presences_elearning')
            .select('*, seance:seances_elearning(date,heure_debut,heure_fin,objectifs_session)')
            .eq('inscription_id', inscr.id),
          supabase.from('progression_elearning')
            .select('*, cours:cours_elearning(titre,niveau), module:modules_elearning(titre)')
            .eq('inscription_id', inscr.id),
          supabase.from('resultats_elearning')
            .select('*')
            .eq('inscription_id', inscr.id)
            .order('date_evaluation', { ascending: false }),
        ]);
        setSeancesReelles_app(seances    || []);
        setPresencesReelles_app(pres     || []);
        setProgressionReelle_app(prog    || []);
        setResultatsReels_app(res        || []);

        /* 3. Cours publiés par le coach — SERVIS PAR L'API, ANNOTÉS DU VERROU.
           La lecture directe de la table ne pouvait pas dire ce qui est verrouillé : le
           calcul demande les rattachements, leurs dates et les lectures déjà faites. Le
           refaire ici aurait créé une seconde implémentation de la règle, celle qui finit
           par diverger de ce que le serveur applique à l'écriture — et par afficher un
           cadenas sur un cours autorisé, ou l'inverse, bien pire.
           Repli sur la lecture directe si l'API échoue : mieux vaut des cours sans verrou
           affiché qu'un espace apprenant vide. */
        let contenus = null;
        try {
          const sess = await supabase.auth.getSession();
          const tk = sess.data.session?.access_token;
          if (tk) {
            const rc = await fetch(`${_API}/api/apprenants/mes-contenus-elearning`, {
              headers: { Authorization: `Bearer ${tk}`, 'X-Plateforme': 'bet-elearning' },
            });
            if (rc.ok) contenus = (await rc.json()).contenus || [];
          }
        } catch { /* repli ci-dessous */ }
        if (contenus === null) {
          const { data } = await supabase
            .from('contenus_classes_elearning')
            .select('*')
            .contains('classe_ids', [inscr.classe_id])
            .eq('est_visible', true)
            .order('ordre', { ascending: true });
          contenus = data || [];
        }
        if (contenus.length > 0) setContenus_app(contenus);

        // 4. Fichiers partagés par le coach pour cette classe
        const { data: fichiers } = await supabase
          .from('fichiers_classes_elearning')
          .select('*')
          .eq('classe_id', inscr.classe_id)
          .eq('visible', true)
          .order('created_at', { ascending: false });
        setFichiers_app(fichiers || []);

        // 5. Devoirs publiés pour cette classe
        const { data: devoirs } = await supabase
          .from('devoirs_elearning')
          .select('*')
          /* `contains` : un devoir peut être donné à plusieurs classes, et `classe_id` ne
             porte que la première. Filtrer dessus privait l'apprenant des devoirs où sa
             classe n'arrivait pas en tête. */
          .contains('classe_ids', [inscr.classe_id])
          .eq('statut', 'publie')
          .order('created_at', { ascending: false });
        if (devoirs && devoirs.length > 0) {
          setDevoirsReels_app(devoirs);
          // Charger les rendus existants de cet apprenant
          const { data: rendusExist } = await supabase
            .from('devoirs_rendus_elearning')
            .select('*')
            .eq('inscription_id', inscr.id)
            .in('devoir_id', devoirs.map(d => d.id));
          if (rendusExist) {
            const map = {};
            rendusExist.forEach(r => { map[r.devoir_id] = r; });
            setDevoirRenduState(map);
          }
        }
        // 6. Cours marqués comme lus
        const session = await supabase.auth.getSession();
        const token   = session.data.session?.access_token;
        if (token) {
          const luRes = await fetch(`${_API}/api/apprenants/mes-cours-lus`, { headers: { Authorization: `Bearer ${token}` } });
          if (luRes.ok) {
            const luData = await luRes.json();
            const map = {};
            (luData.lus || []).forEach(l => { map[l.contenu_id] = true; });
            setTerminesLive(map);
          }
        }
      } catch (e) { console.warn('[apprenant-data]', e); setTrancheChargee(true); }
    })();
  }, [profile]);

  /**
   * Marquer un cours comme terminé — ou revenir en arrière.
   *
   * OPTIMISTE : l'écran répond au clic, car l'aller-retour coûte ~150 ms pour un geste qui
   * n'envoie qu'un booléen. On REVIENT EN ARRIÈRE si le serveur refuse, en disant pourquoi :
   * un refus silencieux se lit exactement comme un bouton en panne.
   */
  async function marquerCoursTermine(contenuId) {
    setTerminesLive(p => ({ ...p, [contenuId]: true }));
    const s = await supabase.auth.getSession();
    const tok = s.data.session?.access_token;
    if (!tok) {
      setTerminesLive(p => ({ ...p, [contenuId]: false }));
      alert('Session expirée — reconnectez-vous.');
      return false;
    }
    try {
      const r = await fetch(`${_API}/api/apprenants/contenus/${contenuId}/lu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, 'X-Plateforme': 'bet-elearning' },
        body: JSON.stringify({ classe_id: apprenant?.groupe_id || null }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setTerminesLive(p => ({ ...p, [contenuId]: false }));
        alert(d.error || "Impossible d'enregistrer ce cours.");
        return false;
      }
      return true;
    } catch {
      setTerminesLive(p => ({ ...p, [contenuId]: false }));
      alert("Connexion interrompue — le cours n'a pas été enregistré.");
      return false;
    }
  }

  /* Démarre (ou retrouve) le chrono dès que le panneau s'ouvre. Idempotent côté serveur :
     rouvrir le devoir ne relance pas le compte à rebours — c'est tout l'enjeu, sinon
     fermer puis rouvrir l'onglet rendrait le minuteur sans effet. */
  useEffect(() => {
    if (!devoirOuvertApp?.id) { setCompo(null); autoEnvoiFait.current = false; return; }
    let vivant = true;
    (async () => {
      try {
        const sess = await supabase.auth.getSession();
        const tok = sess.data.session?.access_token;
        if (!tok) return;
        const r = await fetch(`${_API}/api/elearning/devoirs/${devoirOuvertApp.id}/commencer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, 'X-Plateforme': 'bet-elearning' },
          body: JSON.stringify({ inscription_id: inscriptionReelle?.id, classe_id: inscriptionReelle?.classe_id }),
        });
        if (!r.ok || !vivant) return;
        setCompo(await r.json());
      } catch { /* hors ligne : le serveur refusera un dépôt tardif de toute façon */ }
    })();
    return () => { vivant = false; };
  }, [devoirOuvertApp?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ui = useAgeInterface(apprenant);

  // ── Données filtrées ──────────────────────────────────────────────────────
  // Sessions : données réelles si disponibles, sinon mock
  const _sessionsReellesMapped = seancesReelles_app.map(s => ({
    id: s.id, groupe_id: s.classe_id, professeur_id: s.coach_id,
    titre: s.objectifs_session || s.bilan_session || `Séance - ${s.date}`,
    date_session: s.date, heure_debut: s.heure_debut, heure_fin: s.heure_fin,
    lien_visio: s.lien_zoom || s.lien_meet || s.lien_teams || null,
    type_session: s.type === 'presentiel' ? 'presentiel' : (s.lien_zoom || s.lien_meet || s.lien_teams ? 'ligne' : 'presentiel'),
    statut: s.statut, notes_prof: s.compte_rendu || null,
    contenu_ids: s.contenu_ids || [],
  }));
  const sessionsGroupe  = _sessionsReellesMapped;
  const prochaineCours  = sessionsGroupe.find(s => s.statut === 'planifiee');
  const now = nowTick;
  const devoirsApp = devoirsReels_app.map(d => {
    const rendu  = devoirRenduState[d.id] || null;
    const hOuv   = (d.heure_ouverture || '00:00').slice(0, 5);
    const hLim   = (d.heure_limite   || '23:59').slice(0, 5);
    const ouvert = !d.date_ouverture || now >= new Date(`${d.date_ouverture}T${hOuv}:00`);
    const expire = d.date_limite && now > new Date(`${d.date_limite}T${hLim}:00`);
    const statut = rendu?.statut || (expire && !rendu ? 'en_retard' : 'a_rendre');
    return { ...d, rendu, ouvert, expire, statut };
  });
  const devoirsARendre  = devoirsApp.filter(d => d.statut === 'a_rendre' && d.ouvert && !d.expire);
  const cours = contenusReels_app.map(c => ({
    id: c.id, groupe_id: c.classe_id, professeur_id: c.coach_id,
    titre: c.titre, type_contenu: c.type_contenu, module: c.categorie || '',
    semaine: c.semaine, est_visible: c.est_visible, blocs: c.blocs || [],
    objectifs: c.objectifs || '', dureeEstimee: c.duree_estimee || 30,
    statut: c.statut,
    /* L'état du verrou, calculé par le serveur et transporté tel quel : l'écran AFFICHE
       la règle, il ne la recalcule pas. */
    verrouille: c.verrouille === true, bloque_par: c.bloque_par || null,
    lecture_sequentielle: c.lecture_sequentielle === true,
  }));
  const exercices  = cours.filter(c => c.type_contenu === 'exercice');
  const badgesApp    = gamifBadges.filter(b => b.obtenu);
  const badgesLocked = gamifBadges.filter(b => !b.obtenu);
  const notesApp   = resultatsReels_app.map(r => ({
    id: r.id, apprenant_id: r.inscription_id, professeur_id: r.evalue_par,
    session_id: r.seance_id, type_eval: r.type || 'controle',
    note: r.note, note_max: r.note_max || 20,
    competence: r.titre || (r.competences?.[0]?.lib) || 'Général',
    commentaire: r.commentaire_coach || '', created_at: r.date_evaluation,
  }));

  const niveauActuelReel = inscriptionReelle?.niveau_cecr || apprenant?.niveau_cecr || 'A1';
  const progressionApp = {
    niveauActuel: niveauActuelReel,
    niveauCible: (() => {
      const niv = ['A1','A2','B1','B2','C1','C2'];
      const idx = niv.indexOf(niveauActuelReel);
      return niv[idx + 1] || 'C2';
    })(),
    pctGlobal: progressionReelle_app.length > 0
      ? Math.round(progressionReelle_app.filter(p => p.statut === 'termine').length / progressionReelle_app.length * 100)
      : 0,
    modules: progressionReelle_app.map(p => ({
      nom:     p.module?.titre || p.cours?.titre || 'Module',
      pct:     p.statut === 'termine' ? 100 : p.statut === 'en_cours' ? (p.score || 50) : 0,
      sessions: 1, termines: p.statut === 'termine' ? 1 : 0,
    })),
    competences: [],
  };
  const rapportsMensuels = [];

  const ORDRE_NIVEAUX = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const idxNiveauActuel = ORDRE_NIVEAUX.indexOf(progressionApp.niveauActuel);
  const niveauSuivantCode = idxNiveauActuel >= 0 && idxNiveauActuel < ORDRE_NIVEAUX.length - 1
    ? ORDRE_NIVEAUX[idxNiveauActuel + 1] : null;
  const niveauActuelInfo   = NIVEAUX_CECR[progressionApp.niveauActuel];
  const niveauSuivantInfo  = niveauSuivantCode ? NIVEAUX_CECR[niveauSuivantCode] : null;
  const competencesActuel  = competencesParNiveau[progressionApp.niveauActuel] || [];
  const competencesSuivant = niveauSuivantCode ? (competencesParNiveau[niveauSuivantCode] || []) : [];
  const presencesApp = presencesReelles_app.map(p => ({
    id: p.id, apprenant_id: inscriptionReelle?.id,
    session_id: p.seance_id, statut: p.statut,
    date: p.seance?.date || p.created_at?.slice(0, 10),
  }));

  // Fusionner les notes officielles (resultats_elearning) + notes de devoirs corrigés
  const notesDeDevoirs = devoirsApp
    .filter(d => d.rendu?.note != null)
    .map(d => ({
      id: `devoir_${d.id}`,
      apprenant_id: d.rendu.inscription_id,
      type_eval: 'Devoir',
      note: d.rendu.note,
      note_max: d.rendu.note_max || 20,
      competence: d.titre,
      commentaire: d.rendu.commentaire_coach || '',
      created_at: d.rendu.corrige_at || d.rendu.rendu_at,
    }));
  const toutesNotes = [...notesApp, ...notesDeDevoirs]
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  const moyenneNotes = toutesNotes.length > 0
    ? (toutesNotes.reduce((s, n) => s + (n.note / (n.note_max || 20) * 20), 0) / toutesNotes.length).toFixed(1)
    : null;

  const stats = [
    { label: 'Cours disponibles', valeur: cours.length,          couleur: couleurTheme },
    { label: 'Devoirs à rendre',  valeur: devoirsARendre.length, couleur: COULEURS.attention },
    { label: 'Badges obtenus',    valeur: badgesApp.length,      couleur: '#A78BFA' },
    { label: 'Points gagnés',     valeur: gamifPoints, couleur: '#F97316' },
  ];

  // ── Styles ────────────────────────────────────────────────────────────────
  const S = {
    corps: { flex: 1, padding: 28, overflowY: 'auto' },
    titre: { fontSize: 16, fontWeight: 700, color: COULEURS.navy, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 },
    carte: (acc = couleurTheme, extra = {}) => ({
      background: COULEURS.blanc, borderRadius: 14, padding: '18px 20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      border: `1px solid ${COULEURS.gris200}`, borderTop: `3px solid ${acc}`, ...extra,
    }),
    vide: { textAlign:'center', padding:40, color:COULEURS.gris400, fontSize:13, background:COULEURS.gris50, borderRadius:12, border:`1px dashed ${COULEURS.gris200}`, marginBottom:24 },
    btn: (bg = couleurTheme, sm = false) => ({
      background:bg, color:'#fff', border:'none', borderRadius:8,
      padding: sm ? '6px 14px' : '9px 18px', fontSize: sm ? 12 : 13,
      fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif',
    }),
    btnGhost: { background:'transparent', color:couleurTheme, border:`1.5px solid ${couleurTheme}`, borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' },
    grille: (cols = 'repeat(auto-fit,minmax(200px,1fr))') => ({ display:'grid', gridTemplateColumns:cols, gap:16, marginBottom:24 }),
    tableau: { background:COULEURS.blanc, borderRadius:12, overflow:'hidden', border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.05)', marginBottom:24 },
    thead: (cols) => ({ display:'grid', gridTemplateColumns:cols, padding:'11px 18px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }),
    trow: (cols) => ({ display:'grid', gridTemplateColumns:cols, padding:'13px 18px', borderBottom:`1px solid ${COULEURS.gris100}`, alignItems:'center', fontSize:13 }),
  };

  const iconeType = { lecon:'📖', exercice:'✏️', devoir:'📝', audio:'🎵', ressource:'📎' };
  const STATUT_D = {
    a_rendre:  { fond:'#FEF9C3', texte:'#92400E', lib:'À rendre',  icone:'⏳' },
    rendu:     { fond:'#D1FAE5', texte:'#065F46', lib:'Rendu',     icone:'✅' },
    corrige:   { fond:'#DBEAFE', texte:'#1D4ED8', lib:'Corrigé',   icone:'🏅' },
    en_retard: { fond:'#FEE2E2', texte:'#991B1B', lib:'En retard', icone:'🔴' },
  };

  if (!apprenant) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
      Chargement…
    </div>
  );

  const devoirModal   = devoirsApp.find(d => d.id === modalRendre);
  const contenuModal  = devoirModal ? cours.find(c => c.id === devoirModal.contenu_id) : null;

  // Blocage réel de l'accès (au-delà du simple bandeau d'avertissement).
  // La route admin PATCH /apprenants/:id/suspension écrit "suspendu" (pas "bloque")
  // dans classes_elearning_apprenants.statut - d'où vient apprenant.statut ci-dessous.
  const blocageActif    = apprenant.statut === 'suspendu';
  // Seuil réel de blocage automatique = 4 absences (voir checkAutoSuspensionElearning,
  // Backend/src/routes/elearning.js) - on avertit dès la 3e pour laisser une chance d'agir
  // avant que le blocage ne devienne effectif à la 4e.
  const nbAbsencesActuelles = presencesApp.filter(p => p.statut === 'absent').length;
  const alerteAbsences      = !blocageActif && nbAbsencesActuelles >= 3;
  const sectionBloquee  = blocageActif && ['cours', 'exercices_devoirs', 'session_live'].includes(section);
  const BlocageMessage  = ({ label }) => (
    <div style={{ background:'#fef2f2', border:'1.5px solid #fca5a5', borderRadius:14, padding:'32px 28px', textAlign:'center' }}>
      <div style={{ fontSize:36, marginBottom:12 }}>🚫</div>
      <div style={{ fontSize:16, fontWeight:800, color:'#991b1b', marginBottom:6 }}>Accès {label} suspendu</div>
      <div style={{ fontSize:13, color:'#b91c1c' }}>
        Ton compte est bloqué suite à des absences non justifiées. Contacte le Customer Care BET pour rétablir ton accès.
      </div>
    </div>
  );

  if (!trancheChargee) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', background:'#F8FAFC', flexDirection:'column', gap:16 }}>
      <style>{`@keyframes _spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width:36, height:36, border:'4px solid #E2E8F0', borderTopColor:'#0891B2', borderRadius:'50%', animation:'_spin 0.8s linear infinite' }} />
      <div style={{ fontSize:13, color:'#64748B', fontWeight:600 }}>Chargement de votre espace…</div>
    </div>
  );

  return (
    <>
    <TopNavLayout stats={stats} menuRole={ui.menuRole} sousTitre={inscriptionReelle?.classe?.nom ? `Classe : ${inscriptionReelle.classe.nom}` : undefined}>
      <div style={{ ...S.corps, background: ui.fondPage }}>

        {/* Sans bouton de fermeture : une notification qu'on peut ecarter est ecartee. */}
        <BandeauAppreciation
          nb={seancesANoter.length}
          accent={ui.couleurPrincipale || "#7c3aed"}
          onOuvrir={() => setAppreciationOuverte(true)}
        />
        {appreciationOuverte && (
          <AppreciationSeance
            seances={seancesANoter}
            apiUrl={_API}
            jeton={() => localStorage.getItem("bet_access_token") || localStorage.getItem("admin_token")}
            accent={ui.couleurPrincipale || "#7c3aed"}
            onFerme={() => setAppreciationOuverte(false)}
            onEnvoye={() => rechargerANoter()}
          />
        )}

        {/* ── Bannière classe clôturée ── */}
        {inscriptionReelle?.classe?.statut === 'clos' && (
          <div style={{ background:'#fef2f2', border:'1.5px solid #fca5a5', borderRadius:14, padding:'16px 22px', marginBottom:20, display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ fontSize:26, flexShrink:0 }}>🔒</div>
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:'#991b1b', marginBottom:3 }}>Formation terminée</div>
              <div style={{ fontSize:13, color:'#b91c1c' }}>
                Ta classe <strong>"{inscriptionReelle?.classe?.nom || ''}"</strong> est officiellement clôturée. Ton historique, tes résultats et tes cours restent accessibles ici.
              </div>
            </div>
          </div>
        )}

        {/* ── Bannière blocage absences ── */}
        {blocageActif && (
          <div style={{ background:'linear-gradient(135deg,#991B1B,#DC2626)', borderRadius:14, padding:'20px 24px', marginBottom:24, color:'#fff' }}>
            <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
              <div style={{ fontSize:36, flexShrink:0 }}>🚫</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:16, fontWeight:800, marginBottom:6 }}>Accès temporairement suspendu</div>
                <div style={{ fontSize:13, opacity:0.9, marginBottom:12 }}>
                  Ton accès à la plateforme a été <strong>suspendu</strong> par l'équipe BET suite à des absences non justifiées. Tu ne peux plus accéder aux cours, exercices ou sessions live.
                </div>
                <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:10, padding:'12px 16px', fontSize:13 }}>
                  <div style={{ fontWeight:700, marginBottom:4 }}>📞 Que faire ?</div>
                  <div style={{ opacity:0.9 }}>Contacte le <strong>Customer Care BET</strong> pour fournir une justification d'absence. Ton accès sera rétabli dès validation.</div>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* ══ ONBOARDING (revoir le guide de bienvenue à tout moment) ══ */}
        {section === 'onboarding' && (
          <div>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:20, fontWeight:800, color:COULEURS.navy, marginBottom:4 }}>👋 Guide de bienvenue BET E-Learning</div>
              <div style={{ fontSize:13, color:COULEURS.gris600 }}>Retrouve ici les vidéos et documents des 4 étapes de démarrage, à tout moment.</div>
            </div>
            {ETAPES_ONBOARDING.map((e, i) => {
              const valide  = etapesValidees[e.id];
              const ouverte = etapeOuverte === e.id;
              const contenus = contenusOnboarding[e.id] || [];
              return (
                <div key={e.id} style={{ borderRadius:12, marginBottom:12, border:`2px solid ${valide?COULEURS.succes:ouverte?'#0891B2':COULEURS.gris200}`, background:valide?'#F0FDF4':COULEURS.blanc, transition:'all 0.2s', overflow:'hidden' }}>
                  <div onClick={() => { const nvlOuverte = ouverte ? null : e.id; setEtapeOuverte(nvlOuverte); if (nvlOuverte) contenus.forEach(c => enregistrerVue('ressources', c.id)); }} style={{ display:'flex', gap:14, padding:'16px', cursor:'pointer' }}>
                    <div style={{ width:44, height:44, borderRadius:12, background:valide?COULEURS.succes:COULEURS.gris100, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0, transition:'all 0.2s' }}>
                      {valide ? '✅' : e.icone}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                        <div style={{ fontWeight:700, color:COULEURS.navy, fontSize:14 }}>
                          <span style={{ color:COULEURS.gris400, fontWeight:400, fontSize:12, marginRight:8 }}>Étape {i+1}</span>
                          {e.titre}
                        </div>
                        <span style={{ fontSize:11, color:COULEURS.gris400, flexShrink:0 }}>⏱ {e.duree}</span>
                      </div>
                      <div style={{ fontSize:12, color:COULEURS.gris600, lineHeight:1.5 }}>{e.desc}</div>
                    </div>
                    <span style={{ fontSize:13, color:COULEURS.gris400, flexShrink:0, alignSelf:'center', transform:ouverte?'rotate(90deg)':'rotate(0deg)', transition:'transform 0.2s' }}>▶</span>
                  </div>
                  {ouverte && (
                    <div style={{ padding:'0 16px 16px', borderTop:`1px solid ${COULEURS.gris100}` }}>
                      {contenusOnbLoading ? (
                        <div style={{ padding:'16px 0', textAlign:'center', color:COULEURS.gris400, fontSize:12 }}>Chargement du contenu…</div>
                      ) : contenus.length === 0 ? (
                        <div style={{ padding:'16px 0', textAlign:'center', color:COULEURS.gris400, fontSize:12 }}>Aucun contenu associé à cette étape pour le moment.</div>
                      ) : (
                        <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:12 }}>
                          {contenus.map(c => (
                            <div key={c.id} style={{ background:COULEURS.gris50, borderRadius:10, padding:'12px 14px', border:`1px solid ${COULEURS.gris200}` }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:(c.fichier_url || c.detail) ? 10 : 0 }}>
                                <span style={{ fontSize:16 }}>{c.type==='video'?'🎬':c.type==='audio'?'🎧':c.type==='image'?'🖼️':'📄'}</span>
                                <span style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>{c.titre}</span>
                              </div>
                              {c.detail && (
                                <div style={{ fontSize:12.5, color:COULEURS.gris600 || '#475569', lineHeight:1.6, whiteSpace:'pre-wrap', marginBottom:c.fichier_url ? 10 : 0 }}>{c.detail}</div>
                              )}
                              <MediaContenuOnb contenu={c} />
                              {!c.fichier_url && !c.detail && (
                                <div style={{ fontSize:11, color:COULEURS.gris400, fontStyle:'italic' }}>Fichier non disponible pour le moment.</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Bibliothèque communautaire - accessible à tous les apprenants ── */}
            <div style={{ marginTop:32, marginBottom:16 }}>
              <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy, marginBottom:4 }}>🌍 Bibliothèque communautaire</div>
              <div style={{ fontSize:12, color:COULEURS.gris600 }}>Comptines, podcasts, vidéos… accessibles à tous les apprenants, pas seulement pour l'arrivée.</div>
            </div>
            {(() => {
              const tranche = ui.tranche;
              const items = biblioComApp.filter(r => r.cible === 'tous' || r.cible === tranche);
              if (contenusOnbLoading) {
                return <div style={{ padding:'16px 0', textAlign:'center', color:COULEURS.gris400, fontSize:12 }}>Chargement…</div>;
              }
              if (items.length === 0) {
                return (
                  <div style={{ textAlign:'center', padding:24, color:COULEURS.gris400, background:COULEURS.gris50, borderRadius:12, border:`1px dashed ${COULEURS.gris200}`, fontSize:12 }}>
                    Aucune ressource communautaire disponible pour le moment.
                  </div>
                );
              }
              return (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12 }}>
                  {items.map(r => (
                    <div key={r.id} style={{ background:COULEURS.blanc, borderRadius:12, border:`1px solid ${COULEURS.gris200}`, padding:'14px 16px' }}>
                      <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:10 }}>
                        <span style={{ fontSize:22 }}>{r.icone || (r.type==='video'?'🎬':r.type==='audio'?'🎧':'🎮')}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{r.titre}</div>
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:4 }}>
                            {r.duree && <span style={{ fontSize:11, color:COULEURS.gris400 }}>⏱ {r.duree}</span>}
                            {r.niveau && <span style={{ padding:'1px 7px', borderRadius:10, background:COULEURS.gris100, color:COULEURS.gris600, fontSize:10, fontWeight:700 }}>{r.niveau}</span>}
                          </div>
                        </div>
                      </div>
                      {r.fichier_url && r.type === 'video' && (
                        urlEmbedVideo(r.fichier_url)
                          // Iframe YouTube/Vimeo : pas d'événement "lecture" accessible (cross-origin),
                          // donc la vue est comptabilisée dès l'affichage de la carte intégrée.
                          ? (enregistrerVue('biblio-communautaire', r.id), <iframe src={urlEmbedVideo(r.fichier_url)} title={r.titre} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ width:'100%', aspectRatio:'16/9', borderRadius:8, border:'none' }} />)
                          : <video src={r.fichier_url} controls onPlay={() => enregistrerVue('biblio-communautaire', r.id)} style={{ width:'100%', maxHeight:220, borderRadius:8, background:'#000' }} />
                      )}
                      {r.fichier_url && r.type === 'audio' && (
                        <audio src={r.fichier_url} controls onPlay={() => enregistrerVue('biblio-communautaire', r.id)} style={{ width:'100%' }} />
                      )}
                      {!r.fichier_url && r.type !== 'jeu' && (
                        <div style={{ fontSize:11, color:COULEURS.gris400, fontStyle:'italic' }}>Fichier non disponible pour le moment.</div>
                      )}
                      {r.type === 'jeu' && (
                        <div style={{ fontSize:11, color:COULEURS.gris400, fontStyle:'italic' }}>Disponible dans l'onglet Mini-jeux.</div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* ══ TABLEAU DE BORD ══ */}
        {section === 'tableau_bord' && (
          <>
            {/* Bannière avertissement absences - avant blocage automatique à la 4e */}
            {alerteAbsences && (
              <div style={{ background:'linear-gradient(135deg,#B45309,#D97706)', borderRadius:14, padding:'20px 24px', marginBottom:24, color:'#fff' }}>
                <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
                  <div style={{ fontSize:36, flexShrink:0 }}>⚠️</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:16, fontWeight:800, marginBottom:6 }}>Attention - {nbAbsencesActuelles} absences enregistrées</div>
                    <div style={{ fontSize:13, opacity:0.92 }}>
                      À la <strong>4ᵉ absence</strong>, ton accès à la plateforme sera <strong>automatiquement bloqué</strong> (cours, exercices et sessions live). Contacte ton coach ou le Customer Care BET si une absence n'était pas justifiée.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Bannière test de niveau */}
            {apprenant.statut === 'test_niveau_pending' && (
              <div style={{ background:'linear-gradient(135deg, #1E40AF, #0891B2)', borderRadius:14, padding:'20px 24px', marginBottom:24, color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>📝 Test de niveau en attente</div>
                  <div style={{ fontSize:13, opacity:0.85 }}>Ton test de positionnement est programmé. Un lien te sera envoyé par email dès qu'il sera prêt.</div>
                </div>
                <div style={{ fontSize:40 }}>⏳</div>
              </div>
            )}

            {/* KPIs */}
            <div style={S.grille()}>
              {[
                { icone:'📖', val:cours.length,             lbl:'Cours disponibles',  acc:couleurTheme },
                { icone:'📝', val:devoirsARendre.length,    lbl:'Devoirs à rendre',   acc:COULEURS.attention },
                { icone:'🏅', val:badgesApp.length,         lbl:'Badges obtenus',     acc:'#A78BFA' },
                { icone:'⭐', val:gamifPoints,lbl:'Points gagnés',      acc:'#F97316' },
              ].map(k => (
                <div key={k.lbl} style={S.carte(k.acc)}>
                  <div style={{ fontSize:28, marginBottom:8 }}>{k.icone}</div>
                  <div style={{ fontSize:28, fontWeight:800, color:COULEURS.navy, lineHeight:1, marginBottom:4 }}>{k.val}</div>
                  <div style={{ fontSize:13, color:COULEURS.gris600 }}>{k.lbl}</div>
                </div>
              ))}
            </div>

            {/* Prochain cours */}
            {prochaineCours && (
              <div style={{ marginBottom:24 }}>
                <div style={S.titre}>⏰ Prochain cours</div>
                <div style={{ background:`linear-gradient(135deg, ${COULEURS.navy} 0%, ${couleurThemeFonce} 100%)`, borderRadius:16, padding:24, color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Session planifiée</div>
                    <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>{prochaineCours.titre}</div>
                    <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)' }}>
                      {fmtDate(prochaineCours.date_session)} · {prochaineCours.heure_debut} – {prochaineCours.heure_fin}
                    </div>
                  </div>
                  <button style={{ background:'#fff', color:COULEURS.navy, border:'none', borderRadius:10, padding:'10px 20px', fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', fontSize:13 }} onClick={() => navigate('/apprenant/session')}>
                    {ui.estEnfant ? '🚀 Rejoindre !' : 'Rejoindre'}
                  </button>
                </div>
              </div>
            )}

            {/* Devoirs urgents */}
            {devoirsARendre.filter(d => !rendus[d.id]).length > 0 && (
              <div style={{ marginBottom:24 }}>
                <div style={S.titre}>
                  📝 Devoirs à rendre
                  <span style={{ background:'#EF4444', color:'#fff', borderRadius:20, padding:'2px 8px', fontSize:12, fontWeight:700 }}>{devoirsARendre.filter(d => !rendus[d.id]).length}</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {devoirsARendre.filter(d => !rendus[d.id]).slice(0, 3).map(d => {
                    const c = cours.find(x => x.id === d.contenu_id);
                    return (
                      <div key={d.id} style={{ background:'#fff', borderRadius:12, padding:'14px 18px', border:`1px solid ${COULEURS.gris200}`, display:'flex', alignItems:'center', gap:14 }}>
                        <div style={{ width:40, height:40, borderRadius:10, background:'#FEF3C7', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>📝</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:14, fontWeight:600, color:COULEURS.navy, marginBottom:2 }}>{c?.titre || d.contenu_id}</div>
                          <div style={{ fontSize:12, color:COULEURS.gris400 }}>Limite : {fmtDate(d.date_limite)}</div>
                        </div>
                        <button style={S.btn(couleurTheme, true)} onClick={() => { setModalRendre(d.id); setRendreForm({ fichier:null, texte:'' }); }}>Rendre</button>
                      </div>
                    );
                  })}
                  {devoirsARendre.filter(d => !rendus[d.id]).length > 3 && (
                    <button style={S.btnGhost} onClick={() => navigate('/apprenant/devoirs')}>Voir tous les devoirs →</button>
                  )}
                </div>
              </div>
            )}

            {/* Mes cours */}
            <div style={{ marginBottom:24 }}>
              <div style={S.titre}>{ui.estEnfant ? '📚' : '📖'} Mes cours récents</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {cours.slice(0, 4).map(c => (
                  <div key={c.id} style={{ background:'#fff', borderRadius:12, padding:'14px 18px', border:`1px solid ${COULEURS.gris200}`, display:'flex', alignItems:'center', gap:14, cursor:'pointer' }} onClick={() => navigate('/apprenant/cours')}>
                    <div style={{ width:40, height:40, borderRadius:10, background:c.type_contenu === 'lecon' ? '#E0F2FE' : c.type_contenu === 'exercice' ? '#D1FAE5' : '#FEF3C7', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                      {iconeType[c.type_contenu] || '📄'}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:COULEURS.navy, marginBottom:2 }}>{c.titre}</div>
                      <div style={{ fontSize:12, color:COULEURS.gris400 }}>{c.module} · Semaine {c.semaine}</div>
                    </div>
                    <span style={{ color:COULEURS.gris400, fontSize:18 }}>›</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Badges récents */}
            {badgesApp.length > 0 && (
              <div>
                <div style={S.titre}>{ui.estEnfant ? '🌟' : '🏅'} Mes badges récents</div>
                <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
                  {badgesApp.slice(0, 4).map(b => (
                    <div key={b.badge_id} style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:`1px solid ${COULEURS.gris200}`, textAlign:'center', minWidth:100 }}>
                      <div style={{ fontSize:32, marginBottom:6 }}>{b.badge?.icone || '🏅'}</div>
                      <div style={{ fontSize:12, fontWeight:600, color:COULEURS.navy }}>{b.badge?.nom}</div>
                    </div>
                  ))}
                  <button onClick={() => navigate('/apprenant/badges')} style={{ ...S.carte(COULEURS.gris400, { padding:'16px 18px', textAlign:'center', minWidth:100, cursor:'pointer', border:'none', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4 }) }}>
                    <div style={{ fontSize:28 }}>→</div>
                    <div style={{ fontSize:11, color:COULEURS.gris600 }}>Voir tous</div>
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══ EXERCICES & DEVOIRS ══ */}
        {section === 'exercices_devoirs' && sectionBloquee && <BlocageMessage label="aux exercices et devoirs" />}
        {section === 'exercices_devoirs' && !sectionBloquee && (
          <div>
            {/* Titre + sous-onglets */}
            <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:20, flexWrap:'wrap' }}>
              <div style={S.titre} >✏️ Exercices &amp; Devoirs</div>
              <div style={{ display:'flex', gap:6 }}>
                {[
                  { id:'exercices', lib:'✏️ Exercices', badge: exercices.length },
                  { id:'devoirs',   lib:'📝 Devoirs',   badge: devoirsApp.length },
                ].map(t => (
                  <button key={t.id} onClick={() => setSousOngletExDev(t.id)}
                    style={{ padding:'7px 16px', borderRadius:20, fontSize:12, fontWeight:700, border:`1.5px solid ${sousOngletExDev===t.id ? couleurTheme : COULEURS.gris200}`, background:sousOngletExDev===t.id ? couleurTheme : '#fff', color:sousOngletExDev===t.id ? '#fff' : COULEURS.gris600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}>
                    {t.lib}
                    {t.badge > 0 && <span style={{ background: sousOngletExDev===t.id ? 'rgba(255,255,255,0.3)' : couleurTheme, color:'#fff', borderRadius:20, padding:'1px 7px', fontSize:10, fontWeight:800 }}>{t.badge}</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Sous-onglet Exercices ── */}
            {sousOngletExDev === 'exercices' && (
              exercices.length === 0 ? (
                <div style={S.vide}>
                  <div style={{ fontSize:40, marginBottom:12 }}>✏️</div>
                  <div style={{ fontWeight:600, marginBottom:6 }}>Aucun exercice disponible pour le moment</div>
                  <div>Ton professeur publiera des exercices prochainement.</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {exercices.map((c) => {
                    const blocs   = c.blocs || [];
                    const duree   = blocs.reduce((s, b) => s + (b.dureeMin || 0), 0);
                    const termine = terminesLive[c.id];
                    const nbQuiz  = blocs.filter(b => b.type === 'quiz').reduce((s, b) => s + (b.questions?.length || 0), 0);
                    return (
                      <div key={c.id} style={{ background:'#fff', borderRadius:14, border:`1px solid ${termine ? '#6EE7B7' : COULEURS.gris200}`, borderLeft:`4px solid ${termine ? COULEURS.succes : '#10B981'}`, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                        <div style={{ width:48, height:48, borderRadius:12, background:'#D1FAE5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>✏️</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:4 }}>{c.titre}</div>
                          <div style={{ fontSize:12, color:COULEURS.gris600 }}>{c.module} · Semaine {c.semaine}</div>
                          <div style={{ display:'flex', gap:12, marginTop:4, fontSize:11, color:COULEURS.gris400 }}>
                            {duree > 0 && <span>⏱ {duree} min</span>}
                            {nbQuiz > 0 && <span>🧩 {nbQuiz} question{nbQuiz > 1 ? 's' : ''}</span>}
                            {termine && <span style={{ color:COULEURS.succes, fontWeight:700 }}>✅ Terminé</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => setExerciceOuvert(c)}
                          style={{ ...S.btn('#10B981', true), background: termine ? COULEURS.gris200 : '#10B981', color: termine ? COULEURS.gris600 : '#fff' }}
                        >
                          {termine ? '🔄 Revoir' : 'Commencer →'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* ── Sous-onglet Devoirs ── */}
            {sousOngletExDev === 'devoirs' && (
              <div>
                {/* Filtres */}
                <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
                  {[
                    { id:'tous',      lib:`Tous (${devoirsApp.length})` },
                    { id:'a_rendre',  lib:`À rendre (${devoirsApp.filter(d=>d.statut==='a_rendre').length})` },
                    { id:'rendu',     lib:`Rendus (${devoirsApp.filter(d=>d.statut==='rendu').length})` },
                    { id:'corrige',   lib:`Corrigés (${devoirsApp.filter(d=>d.statut==='corrige').length})` },
                    { id:'en_retard', lib:`En retard (${devoirsApp.filter(d=>d.statut==='en_retard').length})` },
                  ].map(f => (
                    <button key={f.id} onClick={() => setFiltreDevoir(f.id)} style={{ padding:'7px 16px', borderRadius:20, fontSize:12, fontWeight:600, border:`1.5px solid ${filtreDevoir===f.id ? couleurTheme : COULEURS.gris200}`, background:filtreDevoir===f.id ? couleurTheme : '#fff', color:filtreDevoir===f.id ? '#fff' : COULEURS.gris600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      {f.lib}
                    </button>
                  ))}
                </div>

                {devoirsApp.length === 0 ? (
                  <div style={S.vide}>Aucun devoir assigné pour le moment.</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    {devoirsApp
                      .filter(d => filtreDevoir === 'tous' || d.statut === filtreDevoir)
                      .map(d => {
                        const STATUT_DV = {
                          a_rendre:  { fond:'#FEF9C3', texte:'#92400E', lib:'À rendre',  icone:'⏳' },
                          rendu:     { fond:'#D1FAE5', texte:'#065F46', lib:'Rendu',     icone:'✅' },
                          corrige:   { fond:'#DBEAFE', texte:'#1D4ED8', lib:'Corrigé',   icone:'🏅' },
                          en_retard: { fond:'#FEE2E2', texte:'#991B1B', lib:'Non rendu', icone:'🔴' },
                        };
                        const st = STATUT_DV[d.statut] || STATUT_DV.a_rendre;
                        const borderCol = d.statut==='corrige'?'#3B82F6':d.statut==='rendu'?COULEURS.succes:d.statut==='en_retard'?'#EF4444':d.ouvert?COULEURS.attention:'#A78BFA';
                        const limDate   = d.date_limite ? new Date(`${d.date_limite}T${(d.heure_limite||'23:59').slice(0,5)}:00`) : null;
                        const msRestants = limDate ? limDate - now : null;
                        const jRestants  = msRestants !== null ? Math.floor(msRestants / 86400000) : null;
                        const hRestantes = msRestants !== null ? Math.floor((msRestants % 86400000) / 3600000) : null;
                        const mRestantes = msRestants !== null ? Math.floor((msRestants % 3600000) / 60000) : null;
                        const sRestantes = msRestants !== null ? Math.floor((msRestants % 60000) / 1000) : null;
                        const fmt2 = n => String(n).padStart(2, '0');
                        /* LE COMPTE À REBOURS D'OUVERTURE. « Disponible le 2026-10-13 à
                           16:42:00 » oblige à faire la soustraction de tête, et la date
                           brute ne dit pas si c'est dans dix minutes ou dans trois jours.
                           Le même tic d'horloge que le compteur de rendu sert ici : il
                           bat déjà chaque seconde, rien à ajouter. */
                        const ouvDate = d.date_ouverture ? new Date(`${d.date_ouverture}T${(d.heure_ouverture || '00:00').slice(0, 5)}:00`) : null;
                        const msAvantOuv = ouvDate ? ouvDate - now : null;
                        const dureeHumaine = (ms) => {
                          const j = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000);
                          const m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000);
                          return j > 0 ? `${j}j ${fmt2(h)}:${fmt2(m)}:${fmt2(sec)}` : `${fmt2(h)}:${fmt2(m)}:${fmt2(sec)}`;
                        };
                        const timerStr = msRestants !== null && msRestants > 0
                          ? jRestants > 0
                            ? `${jRestants}j ${fmt2(hRestantes)}:${fmt2(mRestantes)}:${fmt2(sRestantes)}`
                            : `${fmt2(hRestantes)}:${fmt2(mRestantes)}:${fmt2(sRestantes)}`
                          : null;
                        return (
                          <div key={d.id} style={{ background:'#fff', borderRadius:14, border:`1px solid ${COULEURS.gris200}`, borderLeft:`4px solid ${borderCol}`, overflow:'hidden' }}>
                            <div style={{ padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                              <div style={{ width:44, height:44, borderRadius:12, background:st.fond, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                                {!d.ouvert ? '🔒' : st.icone}
                              </div>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:4 }}>{d.titre}</div>
                                <div style={{ display:'flex', gap:12, fontSize:12, color:COULEURS.gris600, flexWrap:'wrap' }}>
                                  {!d.ouvert && (
                                    <span style={{ display:'inline-flex', flexDirection:'column', gap:2 }}>
                                      <span style={{ color:'#7C3AED', fontWeight:700 }}>🔒 Disponible le {d.date_ouverture} à {d.heure_ouverture}</span>
                                      {msAvantOuv !== null && msAvantOuv > 0 && (
                                        /* Sous l'heure brute, le délai réel. Rouge sous une
                                           heure : c'est le moment où l'on s'organise pour
                                           être devant son écran. */
                                        <span style={{ color: msAvantOuv < 3600000 ? '#EF4444' : '#7C3AED', fontWeight:700, fontVariantNumeric:'tabular-nums', fontFamily:'monospace', fontSize:11.5 }}>
                                          ⏱ Ouverture dans {dureeHumaine(msAvantOuv)}
                                        </span>
                                      )}
                                    </span>
                                  )}
                                  {d.ouvert && !d.expire && d.date_limite && timerStr && (
                                    <span style={{ color: jRestants !== null && jRestants <= 1 ? '#EF4444' : jRestants <= 3 ? '#F59E0B' : COULEURS.gris600, fontWeight: jRestants !== null && jRestants <= 3 ? 700 : 400, fontVariantNumeric:'tabular-nums', fontFamily:'monospace' }}>
                                      ⏳ {timerStr}
                                    </span>
                                  )}
                                  {d.expire && <span style={{ color:'#EF4444', fontWeight:700 }}>🔴 Date limite dépassée ({d.date_limite} {d.heure_limite})</span>}
                                  {d.rendu?.rendu_at && <span>✅ Rendu le {new Date(d.rendu.rendu_at).toLocaleDateString('fr-FR')}</span>}
                                  {d.rendu?.note != null && <span style={{ fontWeight:700, color:d.rendu.note>=12?COULEURS.succes:COULEURS.attention }}>🏅 {d.rendu.note}/20</span>}
                                  <span style={{ color:COULEURS.gris400 }}>{d.type_rendu==='fichier'?'📎 PDF':'📝 Composition'} · {d.format_type}</span>
                                </div>
                              </div>
                              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8, flexShrink:0 }}>
                                <span style={{ padding:'3px 10px', borderRadius:20, background:st.fond, color:st.texte, fontSize:11, fontWeight:700 }}>{st.icone} {st.lib}</span>
                                {d.ouvert && !d.expire && d.statut === 'a_rendre' && (
                                  <button onClick={() => {
                                    setSubmitTexte(''); setSubmitQcm({}); setSubmitBlocs({}); setSubmitFichier(null);
                                    if (d.type_rendu === 'fichier') setDevoirOuvertApp(d);
                                    else setConfirmOuvrirDevoir(d);
                                  }}
                                    style={{ padding:'7px 14px', borderRadius:8, border:'none', background:couleurTheme, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                                    {d.type_rendu === 'fichier' ? '📎 Déposer' : '📝 Ouvrir'}
                                  </button>
                                )}
                                {d.expire && d.statut === 'a_rendre' && (
                                  <button onClick={() => setDevoirOuvertApp(d)} style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'#FEE2E2', color:'#991B1B', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                                    Voir
                                  </button>
                                )}
                                {/* REVENIR SUR SA COPIE TANT QU'ELLE N'A PAS ÉTÉ CORRIGÉE.
                                    Une fois rendu, le devoir n'offrait plus aucune action :
                                    l'apprenant qui s'était trompé de fichier ou voulait
                                    compléter sa réponse n'avait aucun recours, alors que le
                                    serveur acceptait la re-soumission. Elle est fermée dès
                                    que le coach a corrigé — c'est le statut qui le dit, et
                                    le serveur le refuse désormais aussi (403 DEJA_CORRIGE). */}
                                {d.statut === 'rendu' && !d.expire && (
                                  <button onClick={() => {
                                    setSubmitTexte(d.rendu?.contenu_texte || ''); setSubmitQcm(d.rendu?.reponses_qcm || {});
                                    setSubmitBlocs(d.rendu?.reponses_blocs || {}); setSubmitFichier(null);
                                    if (d.type_rendu === 'fichier') setDevoirOuvertApp(d);
                                    else setConfirmOuvrirDevoir(d);
                                  }}
                                    style={{ padding:'7px 14px', borderRadius:8, border:`1.5px solid ${couleurTheme}`, background:'#fff', color:couleurTheme, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                                    ✏️ Modifier ma copie
                                  </button>
                                )}
                                {d.statut === 'corrige' && (
                                  <span style={{ fontSize:10.5, color:COULEURS.gris400, textAlign:'right', maxWidth:150 }}>
                                    🔒 Corrigé — plus modifiable
                                  </span>
                                )}
                              </div>
                            </div>
                            {d.rendu?.commentaire_coach && (
                              <div style={{ padding:'10px 20px', background:'#EFF6FF', borderTop:`1px solid ${COULEURS.gris100}`, fontSize:12, color:'#1E40AF' }}>
                                💬 Commentaire du professeur : <em>"{d.rendu.commentaire_coach}"</em>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    {devoirsApp.filter(d => filtreDevoir === 'tous' || d.statut === filtreDevoir).length === 0 && (
                      <div style={S.vide}>Aucun devoir pour ce filtre</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ SESSION LIVE ══ */}
        {section === 'session_live' && sectionBloquee && <BlocageMessage label="aux sessions live" />}
        {section === 'session_live' && !sectionBloquee && (
          <div>
            <div style={S.titre}>🎥 Sessions live</div>

            {/* ── Modal session active ── */}
            {sessionRejointe && (() => {
              const s = sessionsGroupe.find(x => x.id === sessionRejointe);
              if (!s) return null;
              const lien = s.lien_visio;
              const nomService = lien
                ? (lien.includes('meet.google') ? 'Google Meet' : lien.includes('zoom') ? 'Zoom' : lien.includes('teams') ? 'Teams' : 'Salle virtuelle')
                : 'Jitsi';
              return (
                <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(6px)', display:'flex', flexDirection:'column' }}
                  onClick={() => setSessionRejointe(null)}>
                  <div style={{ flex:1, display:'flex', flexDirection:'column', margin: lien ? '40px auto' : '0', width: lien ? 'min(600px,92vw)' : '100%', maxHeight: lien ? 'calc(100vh - 80px)' : '100vh' }}
                    onClick={e => e.stopPropagation()}>

                    {/* ── Header modal ── */}
                    <div style={{ background:'linear-gradient(135deg,#064E3B,#065F46)', padding:'12px 20px', borderRadius: lien ? '14px 14px 0 0' : 0, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10, flexShrink:0 }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>{s.titre}</div>
                        <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>⏰ {s.heure_debut} – {s.heure_fin} · {nomService}</div>
                      </div>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        {lien && (
                          <button onClick={() => rejoindreSession(s)}
                            style={{ padding:'6px 14px', borderRadius:8, border:'none', background:'#fff', color:'#064E3B', fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', whiteSpace:'nowrap' }}>
                            ↗ Rouvrir
                          </button>
                        )}
                        <button onClick={() => setSessionRejointe(null)}
                          style={{ padding:'6px 14px', borderRadius:8, border:'1px solid rgba(255,255,255,0.3)', background:'rgba(239,68,68,0.2)', color:'#FCA5A5', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                          ⏹ Quitter
                        </button>
                      </div>
                    </div>

                    {/* ── Contenu ── */}
                    {lien ? (
                      <div style={{ background:'#F0FDF4', border:'1px solid #6EE7B7', borderRadius:'0 0 14px 14px', padding:'32px 24px', display:'flex', flexDirection:'column', alignItems:'center', gap:16, textAlign:'center' }}>
                        <div style={{ fontSize:48 }}>🎥</div>
                        <div style={{ fontSize:16, fontWeight:800, color:'#065F46' }}>Session en cours</div>
                        <div style={{ fontSize:13, color:'#047857', maxWidth:400 }}>
                          <strong>{nomService}</strong> a été ouvert dans une fenêtre flottante.<br/>
                          Si elle s'est fermée, cliquez sur <strong>Rouvrir</strong>.
                        </div>
                        <button onClick={() => rejoindreSession(s)}
                          style={{ padding:'12px 32px', borderRadius:10, background:'#059669', color:'#fff', fontWeight:800, fontSize:14, border:'none', cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                          ↗ Rouvrir {nomService}
                        </button>
                      </div>
                    ) : (
                      <div style={{ flex:1, minHeight:0 }}>
                        <SalleVirtuelle
                          session={s}
                          profil={profile}
                          role="apprenant"
                          hauteur={window.innerHeight - 80}
                          onQuitter={() => setSessionRejointe(null)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* En cours maintenant (prof a ouvert la salle) */}
            {!sessionRejointe && sessionsGroupe.some(s => s.statut === 'en_cours') && (
              <div style={{ marginBottom:24 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#DC2626', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ width:10, height:10, borderRadius:'50%', background:'#DC2626', display:'inline-block' }}></span>
                  En cours maintenant
                </div>
                {sessionsGroupe.filter(s => s.statut === 'en_cours').map(s => (
                  <div key={s.id} style={{ background:'linear-gradient(135deg,#064E3B,#065F46)', borderRadius:14, padding:'20px 24px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:16, fontWeight:800, color:'#fff', marginBottom:4 }}>{s.titre}</div>
                      <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)' }}>🕐 {s.heure_debut} – {s.heure_fin}</div>
                    </div>
                    <button
                      style={{ background:'#fff', color:'#064E3B', border:'none', borderRadius:10, padding:'12px 24px', fontWeight:800, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', fontSize:14 }}
                      onClick={() => rejoindreSession(s)}
                    >
                      🚀 Rejoindre maintenant
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Filtrage par date - commun aux sessions à venir et aux replays */}
            <div style={{ display:'flex', alignItems:'flex-end', gap:14, flexWrap:'wrap', marginBottom:20 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, marginBottom:4 }}>Du</div>
                <input
                  type="date"
                  value={liveDateDebut}
                  onChange={e => { setLiveDateDebut(e.target.value); setLiveAVenirPage(1); setLiveReplayPage(1); }}
                  style={{ padding:'8px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none' }}
                />
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, marginBottom:4 }}>Au</div>
                <input
                  type="date"
                  value={liveDateFin}
                  onChange={e => { setLiveDateFin(e.target.value); setLiveAVenirPage(1); setLiveReplayPage(1); }}
                  style={{ padding:'8px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none' }}
                />
              </div>
              {(liveDateDebut || liveDateFin) && (
                <button
                  onClick={() => { setLiveDateDebut(''); setLiveDateFin(''); setLiveAVenirPage(1); setLiveReplayPage(1); }}
                  style={{ ...S.btnGhost, padding:'8px 16px' }}
                >✕ Réinitialiser</button>
              )}
            </div>

            {/* À venir */}
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:12 }}>📅 Sessions à venir</div>
              {(() => {
                const sessionsAVenir = sessionsGroupe
                  .filter(s => s.statut === 'planifiee')
                  .filter(s => !liveDateDebut || (s.date_session && s.date_session >= liveDateDebut))
                  .filter(s => !liveDateFin   || (s.date_session && s.date_session <= liveDateFin));
                const PAR_PAGE = 5;
                const nbPages      = Math.max(1, Math.ceil(sessionsAVenir.length / PAR_PAGE));
                const pageActuelle = Math.min(liveAVenirPage, nbPages);
                const sessionsPage = sessionsAVenir.slice((pageActuelle - 1) * PAR_PAGE, pageActuelle * PAR_PAGE);
                if (sessionsAVenir.length === 0) {
                  return <div style={S.vide}>{liveDateDebut || liveDateFin ? 'Aucune session sur cette période' : 'Aucune session planifiée pour le moment'}</div>;
                }
                return (
                  <>
                  {sessionsPage.map(s => {
                /* LA RÈGLE D'OUVERTURE VIENT DU MODULE COMMUN, et plus d'un calcul posé ici.
                   Celui qu'il remplace comportait `MODE_DEV ||` : en développement, tous les
                   boutons « Rejoindre » étaient donc ouverts en permanence, y compris pour
                   une session prévue dans dix jours. La commodité d'un raccourci de test ne
                   vaut pas une règle qui ne s'applique plus là où on la vérifie. */
                const debutISO      = `${s.date_session}T${s.heure_debut}:00`;
                const debut         = new Date(debutISO);
                const maintenant    = new Date();
                const acces         = accesSalle(s, maintenant);
                const estPresentiel = acces.presentiel;
                const joignable     = !estPresentiel && acces.joignable;
                const ouvertureA    = acces.ouvertureA || new Date(debut.getTime() - MS_OUVERTURE_SALLE);
                const enCours       = !estPresentiel && maintenant >= debut && maintenant <= new Date(debut.getTime() + 2 * 60 * 60 * 1000);
                const minutesAvant  = acces.minutesAvant;
                const veille        = !estPresentiel && Math.floor((ouvertureA - maintenant) / (1000 * 60 * 60 * 24)) === 0 && !joignable;
                /* LES COURS LIÉS, ANNONCÉS SUR LA CARTE comme ils le sont chez le coach.
                   L'apprenant ne pouvait le savoir qu'en ouvrant « Programme », et retombait
                   le plus souvent sur « aucun contenu » sans pouvoir distinguer les deux cas
                   possibles : le coach n'a rien lié, ou le cours lié ne lui est pas
                   accessible. On compte donc les deux séparément. */
                const idsLies       = s.contenu_ids || [];
                const contenusCarte = cours.filter(c => idsLies.includes(c.id));
                const liesInvisibles = idsLies.length - contenusCarte.length;

                // Couleurs selon type
                const cardBg    = estPresentiel ? '#F0FDF4' : (joignable ? '#F0FDF4' : COULEURS.gris50);
                const cardBord  = estPresentiel ? '#6EE7B7' : (joignable ? '#6EE7B7' : COULEURS.gris200);
                const iconeBg   = estPresentiel ? '#D1FAE5' : (joignable ? '#D1FAE5' : COULEURS.gris100);
                const icone     = estPresentiel ? '🏢' : (enCours ? '🔴' : joignable ? '🟢' : '🔒');

                return (
                  <div key={s.id} style={{ background:cardBg, borderRadius:14, border:`1.5px solid ${cardBord}`, padding:'16px 20px', marginBottom:12, transition:'all 0.2s' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                        <div style={{ width:48, height:48, borderRadius:12, background:iconeBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>
                          {icone}
                        </div>
                        <div>
                          <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:4, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                            {s.titre}
                            {estPresentiel
                              ? <span style={{ padding:'2px 8px', borderRadius:10, background:'#D1FAE5', color:'#065F46', fontSize:10, fontWeight:800 }}>🏢 Présentiel</span>
                              : <span style={{ padding:'2px 8px', borderRadius:10, background:'#DBEAFE', color:'#1D4ED8', fontSize:10, fontWeight:800 }}>📡 En ligne</span>}
                            {enCours && <span style={{ padding:'2px 8px', borderRadius:10, background:'#FEE2E2', color:'#991B1B', fontSize:10, fontWeight:800 }}>🔴 EN COURS</span>}
                            {!estPresentiel && joignable && !enCours && <span style={{ padding:'2px 8px', borderRadius:10, background:'#D1FAE5', color:'#065F46', fontSize:10, fontWeight:800 }}>✅ Salle ouverte</span>}
                            {veille && <span style={{ padding:'2px 8px', borderRadius:10, background:'#FEF3C7', color:'#92400E', fontSize:10, fontWeight:800 }}>🔔 Demain</span>}
                          </div>
                          <div style={{ fontSize:12, color:COULEURS.gris600, display:'flex', gap:12, flexWrap:'wrap' }}>
                            <span>📅 {fmtDate(s.date_session)}</span>
                            <span>⏰ {s.heure_debut} – {s.heure_fin}</span>
                            {contenusCarte.length > 0 && (
                              <span style={{ color:COULEURS.cyanFonce, fontWeight:700 }}>
                                📚 {contenusCarte.length} cours lié{contenusCarte.length > 1 ? 's' : ''}
                              </span>
                            )}
                            {contenusCarte.length === 0 && liesInvisibles > 0 && (
                              <span style={{ color:COULEURS.attention, fontWeight:600 }}>📚 Cours lié non disponible</span>
                            )}
                          </div>
                          {!estPresentiel && !joignable && (
                            <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:4 }}>
                              🔒 Accès ouvert {MINUTES_OUVERTURE_SALLE} min avant le cours
                              {minutesAvant < 1440 && <span style={{ color:COULEURS.attention, fontWeight:600 }}> - {acces.libelleAttente}</span>}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display:'flex', flexDirection:'column', gap:8, alignItems:'flex-end' }}>
                        {estPresentiel ? (
                          <button
                            onClick={() => setPresentielInfoModal(s)}
                            style={{ padding:'10px 22px', borderRadius:10, border:'none', fontSize:13, fontWeight:800, cursor:'pointer', background:'#059669', color:'#fff', fontFamily:'"Plus Jakarta Sans",sans-serif', whiteSpace:'nowrap' }}>
                            🏢 Voir les détails
                          </button>
                        ) : (
                          <button
                            disabled={!joignable}
                            onClick={() => joignable && rejoindreSession(s)}
                            style={{ padding:'10px 22px', borderRadius:10, border:'none', fontSize:13, fontWeight:800, cursor:joignable?'pointer':'not-allowed', background:enCours?'#DC2626':joignable?COULEURS.succes:COULEURS.gris200, color:joignable?'#fff':COULEURS.gris400, fontFamily:'"Plus Jakarta Sans",sans-serif', transition:'all 0.2s', whiteSpace:'nowrap' }}>
                            {enCours ? '🔴 Rejoindre maintenant' : joignable ? '🎥 Rejoindre' : '🔒 Pas encore'}
                          </button>
                        )}
                        <button
                          onClick={() => setSessionDetail(s.id)}
                          style={{ padding:'7px 16px', borderRadius:10, border:`1.5px solid ${COULEURS.gris200}`, fontSize:12, fontWeight:700, cursor:'pointer', background:'transparent', color:COULEURS.navy, fontFamily:'"Plus Jakarta Sans",sans-serif', whiteSpace:'nowrap' }}>
                          📋 Programme
                        </button>
                      </div>
                    </div>

                    {/* Info Jitsi pour live joignable */}
                    {!estPresentiel && joignable && (
                      <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid #6EE7B730`, display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:11, color:'#065F46' }}>💡</span>
                        <span style={{ fontSize:11, color:'#065F46' }}>
                          Après avoir cliqué sur <strong>Rejoindre</strong>, utilisez la barre de la salle virtuelle pour : ✋ lever la main · 💬 chat · 🎙 micro · 📷 caméra
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
                  {nbPages > 1 && (
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginTop:4, marginBottom:8 }}>
                      <button
                        onClick={() => setLiveAVenirPage(p => Math.max(1, p - 1))}
                        disabled={pageActuelle === 1}
                        style={{ ...S.btnGhost, padding:'6px 14px', opacity: pageActuelle === 1 ? 0.4 : 1, cursor: pageActuelle === 1 ? 'not-allowed' : 'pointer' }}
                      >← Précédent</button>
                      <span style={{ fontSize:12, color:COULEURS.gris600, fontWeight:600 }}>Page {pageActuelle} / {nbPages}</span>
                      <button
                        onClick={() => setLiveAVenirPage(p => Math.min(nbPages, p + 1))}
                        disabled={pageActuelle === nbPages}
                        style={{ ...S.btnGhost, padding:'6px 14px', opacity: pageActuelle === nbPages ? 0.4 : 1, cursor: pageActuelle === nbPages ? 'not-allowed' : 'pointer' }}
                      >Suivant →</button>
                    </div>
                  )}
                  </>
                );
              })()}
              <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:8, fontStyle:'italic' }}>
                🔓 La salle virtuelle (sessions en ligne) s'ouvre {MINUTES_OUVERTURE_SALLE} minutes avant le début du cours.
              </div>
            </div>

            {/* Replays */}
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:12 }}>▶️ Replays disponibles</div>
              {(() => {
                const replaysTous = sessionsGroupe
                  .filter(s => s.statut === 'realisee')
                  .filter(s => !liveDateDebut || (s.date_session && s.date_session >= liveDateDebut))
                  .filter(s => !liveDateFin   || (s.date_session && s.date_session <= liveDateFin))
                  .map(s => ({ id:s.id, titre:s.titre, date:s.date_session, duree:'2h', lien:'#', miniature:'🎬' }));
                const PAR_PAGE = 6;
                const nbPages      = Math.max(1, Math.ceil(replaysTous.length / PAR_PAGE));
                const pageActuelle = Math.min(liveReplayPage, nbPages);
                const replaysPage  = replaysTous.slice((pageActuelle - 1) * PAR_PAGE, pageActuelle * PAR_PAGE);
                if (replaysTous.length === 0) {
                  return <div style={S.vide}>{liveDateDebut || liveDateFin ? 'Aucun replay sur cette période' : 'Aucun replay disponible pour le moment'}</div>;
                }
                return (
                  <>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:14 }}>
                    {replaysPage.map(r => (
                      <div key={r.id} style={{ background:'#fff', borderRadius:14, border:`1px solid ${COULEURS.gris200}`, overflow:'hidden' }}>
                        <div style={{ background:'linear-gradient(135deg,#1E293B,#334155)', height:80, display:'flex', alignItems:'center', justifyContent:'center', fontSize:32 }}>{r.miniature}</div>
                        <div style={{ padding:'12px 14px' }}>
                          <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:4 }}>{r.titre}</div>
                          <div style={{ fontSize:11, color:COULEURS.gris400, marginBottom:10 }}>{fmtDate(r.date)} · {r.duree}</div>
                          <button style={S.btn(COULEURS.navy, true)}>▶️ Regarder</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {nbPages > 1 && (
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginTop:16 }}>
                      <button
                        onClick={() => setLiveReplayPage(p => Math.max(1, p - 1))}
                        disabled={pageActuelle === 1}
                        style={{ ...S.btnGhost, padding:'6px 14px', opacity: pageActuelle === 1 ? 0.4 : 1, cursor: pageActuelle === 1 ? 'not-allowed' : 'pointer' }}
                      >← Précédent</button>
                      <span style={{ fontSize:12, color:COULEURS.gris600, fontWeight:600 }}>Page {pageActuelle} / {nbPages}</span>
                      <button
                        onClick={() => setLiveReplayPage(p => Math.min(nbPages, p + 1))}
                        disabled={pageActuelle === nbPages}
                        style={{ ...S.btnGhost, padding:'6px 14px', opacity: pageActuelle === nbPages ? 0.4 : 1, cursor: pageActuelle === nbPages ? 'not-allowed' : 'pointer' }}
                      >Suivant →</button>
                    </div>
                  )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* ══ PROGRESSION ══ */}
        {section === 'progression' && (
          <div>
            <div style={S.titre}>📈 Ma progression</div>

            {/* Niveau & progression globale */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
              <div style={{ background:`linear-gradient(135deg, ${COULEURS.navy}, #0891B2)`, borderRadius:16, padding:'24px 28px', color:'#fff' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Niveau actuel</div>
                <div style={{ fontSize:52, fontWeight:900, lineHeight:1, marginBottom:4 }}>{progressionApp.niveauActuel}</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)', marginBottom:16 }}>Objectif : {progressionApp.niveauCible}</div>
                <div style={{ height:8, background:'rgba(255,255,255,0.2)', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${progressionApp.pctGlobal}%`, background:'#fff', borderRadius:4, transition:'width 0.6s' }} />
                </div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:6 }}>{progressionApp.pctGlobal}% complété vers {progressionApp.niveauCible}</div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {[
                  { val:`${Math.round((presencesApp.filter(p=>p.statut==='present').length/Math.max(presencesApp.length,1))*100)}%`, lbl:'Taux de présence', acc:COULEURS.succes },
                  { val:moyenneNotes != null ? `${moyenneNotes}/20` : '-', lbl:'Moyenne générale', acc:couleurTheme },
                  { val:`${sessionsGroupe.filter(s=>s.statut==='realisee').length}`, lbl:'Sessions réalisées', acc:'#8B5CF6' },
                  { val:`${devoirsApp.filter(d=>d.statut==='corrige'||d.statut==='rendu').length}/${devoirsApp.length}`, lbl:'Devoirs rendus', acc:'#F97316' },
                ].map(k => (
                  <div key={k.lbl} style={S.carte(k.acc, { padding:'16px' })}>
                    <div style={{ fontSize:22, fontWeight:800, color:COULEURS.navy, marginBottom:4 }}>{k.val}</div>
                    <div style={{ fontSize:11, color:COULEURS.gris600 }}>{k.lbl}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Compétences */}
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>🎯 Compétences CECR</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14 }}>
                {progressionApp.competences.map(comp => (
                  <div key={comp.nom} style={{ background:'#fff', borderRadius:14, padding:'16px 20px', border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:20 }}>{comp.icone}</span>
                        <span style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{comp.nom}</span>
                      </div>
                      <span style={{ fontSize:14, fontWeight:800, color:comp.couleur }}>{comp.score}%</span>
                    </div>
                    <div style={{ height:8, background:COULEURS.gris100, borderRadius:4, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${comp.score}%`, background:comp.couleur, borderRadius:4, transition:'width 0.6s' }} />
                    </div>
                    <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:6 }}>
                      {comp.score >= 80 ? 'Excellent !' : comp.score >= 60 ? 'En bonne voie' : 'À renforcer'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modules */}
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>📚 Avancement par module</div>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {progressionApp.modules.map(m => (
                  <div key={m.nom} style={{ background:'#fff', borderRadius:14, border:`1px solid ${COULEURS.gris200}`, padding:'16px 20px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy }}>{m.nom}</div>
                        <div style={{ fontSize:12, color:COULEURS.gris400, marginTop:2 }}>{m.termines}/{m.sessions} sessions complétées</div>
                      </div>
                      <span style={{ fontSize:18, fontWeight:800, color:m.pct===100?COULEURS.succes:couleurTheme }}>{m.pct}%</span>
                    </div>
                    <div style={{ height:8, background:COULEURS.gris100, borderRadius:4, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${m.pct}%`, background:m.pct===100?COULEURS.succes:couleurTheme, borderRadius:4, transition:'width 0.6s' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Compétences niveau actuel & suivant ── */}
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>🎓 Compétences par niveau</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

                {/* Niveau actuel */}
                <div style={{ background:'#fff', borderRadius:16, border:`2px solid ${niveauActuelInfo?.couleur || couleurTheme}`, overflow:'hidden' }}>
                  <div style={{ background:niveauActuelInfo?.couleur || couleurTheme, padding:'14px 20px', color:'#fff' }}>
                    <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', opacity:0.85, marginBottom:4 }}>Niveau actuel - acquis</div>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:30, fontWeight:900 }}>{progressionApp.niveauActuel}</span>
                      <span style={{ fontSize:14, fontWeight:700 }}>{niveauActuelInfo?.libelle}</span>
                    </div>
                  </div>
                  <div style={{ padding:'16px 20px', maxHeight:480, overflowY:'auto' }}>
                    {CATEGORIES_COMPETENCES.map(cat => {
                      const comps = competencesActuel.filter(c => c.categorie === cat.id);
                      if (comps.length === 0) return null;
                      return (
                        <div key={cat.id} style={{ marginBottom:14 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                            <span style={{ fontSize:15 }}>{cat.icone}</span>
                            <span style={{ fontSize:11, fontWeight:700, color:cat.couleur }}>{cat.lib}</span>
                          </div>
                          {comps.map(comp => (
                            <div key={comp.id} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'6px 0', borderBottom:`1px solid ${COULEURS.gris100}` }}>
                              <span style={{ color:COULEURS.succes, fontSize:13, flexShrink:0, marginTop:1 }}>✓</span>
                              <div>
                                <div style={{ fontSize:12, fontWeight:600, color:COULEURS.navy }}>{comp.libelle}</div>
                                <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:2 }}>{comp.description}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Niveau suivant */}
                {niveauSuivantInfo ? (
                  <div style={{ background:'#fff', borderRadius:16, border:`2px dashed ${niveauSuivantInfo.couleur}`, overflow:'hidden' }}>
                    <div style={{ background:niveauSuivantInfo.couleurFond, padding:'14px 20px' }}>
                      <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:niveauSuivantInfo.couleur, marginBottom:4 }}>Niveau suivant - objectif</div>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontSize:30, fontWeight:900, color:niveauSuivantInfo.couleur }}>{niveauSuivantCode}</span>
                        <span style={{ fontSize:14, fontWeight:700, color:niveauSuivantInfo.couleur }}>{niveauSuivantInfo.libelle}</span>
                      </div>
                      <div style={{ fontSize:11, color:niveauSuivantInfo.couleur, opacity:0.8, marginTop:4 }}>{niveauSuivantInfo.description}</div>
                    </div>
                    <div style={{ padding:'16px 20px', maxHeight:480, overflowY:'auto' }}>
                      <div style={{ fontSize:11, color:COULEURS.gris400, marginBottom:12, fontStyle:'italic' }}>
                        🎯 Ce que tu maîtriseras à ce niveau :
                      </div>
                      {CATEGORIES_COMPETENCES.map(cat => {
                        const comps = competencesSuivant.filter(c => c.categorie === cat.id);
                        if (comps.length === 0) return null;
                        return (
                          <div key={cat.id} style={{ marginBottom:14 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                              <span style={{ fontSize:15 }}>{cat.icone}</span>
                              <span style={{ fontSize:11, fontWeight:700, color:cat.couleur }}>{cat.lib}</span>
                            </div>
                            {comps.map(comp => (
                              <div key={comp.id} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'6px 0', borderBottom:`1px solid ${COULEURS.gris100}` }}>
                                <span style={{ color:niveauSuivantInfo.couleur, fontSize:13, flexShrink:0, marginTop:1 }}>◎</span>
                                <div>
                                  <div style={{ fontSize:12, fontWeight:600, color:COULEURS.navy }}>{comp.libelle}</div>
                                  <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:2 }}>{comp.description}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{ background:'#fff', borderRadius:16, border:`2px dashed ${COULEURS.gris200}`, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, padding:32, color:COULEURS.gris400, textAlign:'center' }}>
                    <span style={{ fontSize:40 }}>🏆</span>
                    <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy }}>Niveau maximum atteint !</div>
                    <div style={{ fontSize:12 }}>Tu as atteint le niveau C2, le plus haut du référentiel CECR.</div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Rapport de progression mensuel (enfant / ado) ── */}
            {!ui.estAdulte && rapportsMensuels.length > 0 && (
              <div style={{ marginTop:24 }}>
                <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>📈 Rapports de progression mensuels</div>
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  {rapportsMensuels.map((rapport, idx) => (
                    <div key={idx} style={{ background:'#fff', borderRadius:16, border:`1px solid ${COULEURS.gris200}`, overflow:'hidden' }}>
                      {/* En-tête mois */}
                      <div style={{ background:`linear-gradient(135deg,${COULEURS.navy},${couleurThemeFonce})`, padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div>
                          <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>📅 {rapport.mois}</div>
                          <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:2 }}>Émis le {rapport.dateEmission} · {rapport.progression}</div>
                        </div>
                        <div style={{ display:'flex', gap:12 }}>
                          {[
                            { v:`${rapport.presencePct}%`,   l:'Présence',       c:'#6EE7B7' },
                            { v:`${rapport.moyenneNotes}/20`, l:'Moyenne',        c:'#93C5FD' },
                            { v:`${rapport.sessionsPresentes}/${rapport.sessionsTotal}`, l:'Sessions', c:'#C4B5FD' },
                          ].map(k => (
                            <div key={k.l} style={{ textAlign:'center' }}>
                              <div style={{ fontSize:16, fontWeight:800, color:k.c }}>{k.v}</div>
                              <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)' }}>{k.l}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Progression compétences */}
                      <div style={{ padding:'16px 20px' }}>
                        <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:10 }}>Évolution des compétences ce mois</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                          {rapport.competences.map(comp => (
                            <div key={comp.nom} style={{ background:COULEURS.gris50, borderRadius:10, padding:'10px 14px' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12 }}>
                                <span style={{ fontWeight:600, color:COULEURS.navy }}>{comp.icone} {comp.nom}</span>
                                <span style={{ fontWeight:800, color:comp.couleur }}>
                                  {comp.avant}% → <strong>{comp.apres}%</strong>
                                  <span style={{ fontSize:10, color:comp.apres>comp.avant?COULEURS.succes:COULEURS.attention, marginLeft:4 }}>
                                    {comp.apres>comp.avant?`+${comp.apres-comp.avant}`:`${comp.apres-comp.avant}`}
                                  </span>
                                </span>
                              </div>
                              <div style={{ height:5, background:COULEURS.gris200, borderRadius:3, overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${comp.apres}%`, background:comp.couleur, borderRadius:3 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* Commentaire prof */}
                        <div style={{ background:'#EFF6FF', borderRadius:10, padding:'12px 16px', marginBottom:10 }}>
                          <div style={{ fontSize:11, fontWeight:700, color:couleurThemeFonce, marginBottom:4 }}>💬 Commentaire du professeur</div>
                          <div style={{ fontSize:12, color:COULEURS.navy, lineHeight:1.6 }}>{rapport.commentaireProfesseur}</div>
                        </div>
                        <div style={{ background:'#F0FDF4', borderRadius:10, padding:'10px 16px' }}>
                          <div style={{ fontSize:11, fontWeight:700, color:'#065F46', marginBottom:3 }}>🎯 Objectif mois suivant</div>
                          <div style={{ fontSize:12, color:'#047857' }}>{rapport.objetifMoisSuivant}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ RÉSULTATS ══ */}
        {section === 'resultats' && (() => {
          // Notes officielles + notes de devoirs corrigés (même source que l'onglet Résultats
          // juste au-dessus - avant ce fix, le bulletin n'utilisait que les notes officielles
          // et affichait "-/20" dès qu'un apprenant n'avait que des devoirs notés).
          const notesB  = toutesNotes;
          const totalPresences = presencesApp.length;
          const presentesB    = presencesApp.filter(p => p.statut === 'present').length;
          const tauxPresB     = totalPresences > 0 ? Math.round(presentesB / totalPresences * 100) : 0;
          const moyPonderee   = moyenneNotes ?? '-';
          return (
          <div>
            <div style={S.titre}>🏅 Résultats & Bulletins</div>

            {/* Switcher */}
            <div style={{ display:'flex', gap:6, marginBottom:24, background:COULEURS.gris100, borderRadius:10, padding:4 }}>
              {[{ id:'resultats', lib:'🏅 Résultats' }, { id:'bulletins', lib:'📊 Bulletins' }].map(t => (
                <button key={t.id} onClick={() => setSousOngletRB(t.id)}
                  style={{ flex:1, padding:'10px', borderRadius:8, border:'none', background: sousOngletRB===t.id ? '#fff' : 'transparent', color: sousOngletRB===t.id ? couleurTheme : COULEURS.gris600, fontWeight: sousOngletRB===t.id ? 700 : 500, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', boxShadow: sousOngletRB===t.id ? '0 2px 6px rgba(0,0,0,0.08)' : 'none', transition:'all 0.15s' }}>
                  {t.lib}
                </button>
              ))}
            </div>

            {/* ── Vue Résultats ── */}
            {sousOngletRB === 'resultats' && (<>
            {/* Résumé */}
            <div style={S.grille('repeat(auto-fit,minmax(160px,1fr))')}>
              {[
                { val: moyenneNotes ? `${moyenneNotes}/20` : '-', lbl:'Moyenne générale',  acc:couleurTheme,    icone:'📊' },
                { val: toutesNotes.length,                          lbl:'Évaluations',       acc:'#8B5CF6',        icone:'📋' },
                { val: toutesNotes.length > 0 ? `${Math.max(...toutesNotes.map(n=>Math.round(n.note/(n.note_max||20)*20)))}/20` : '-', lbl:'Meilleure note', acc:COULEURS.succes, icone:'🌟' },
                { val: devoirsApp.filter(d=>d.statut==='corrige').length, lbl:'Devoirs corrigés', acc:'#F97316', icone:'✅' },
              ].map(k => (
                <div key={k.lbl} style={S.carte(k.acc)}>
                  <div style={{ fontSize:26, marginBottom:6 }}>{k.icone}</div>
                  <div style={{ fontSize:26, fontWeight:800, color:COULEURS.navy, marginBottom:4 }}>{k.val}</div>
                  <div style={{ fontSize:12, color:COULEURS.gris600 }}>{k.lbl}</div>
                </div>
              ))}
            </div>

            {/* Tableau toutes les notes */}
            {toutesNotes.length === 0 ? (
              <div style={S.vide}>
                <div style={{ fontSize:40, marginBottom:12 }}>🏅</div>
                <div style={{ fontWeight:600, marginBottom:6 }}>Aucun résultat enregistré</div>
                <div>Tes notes apparaîtront ici après chaque évaluation ou correction de devoir.</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {toutesNotes.map(n => {
                  const noteMax = n.note_max || 20;
                  const pct     = n.note / noteMax;
                  const couleurN = pct >= 0.7 ? COULEURS.succes : pct >= 0.5 ? COULEURS.attention : '#EF4444';
                  const isDevoir = n.type_eval === 'Devoir';
                  return (
                    <div key={n.id} style={{ background:'#fff', borderRadius:12, border:`1px solid ${COULEURS.gris200}`, borderLeft:`4px solid ${couleurN}`, padding:'14px 18px', display:'flex', alignItems:'center', gap:14 }}>
                      <div style={{ width:40, height:40, borderRadius:10, background:isDevoir?'#EDE9FE':'#DBEAFE', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                        {isDevoir ? '📝' : '📋'}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, color:COULEURS.navy, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{n.competence}</div>
                        <div style={{ display:'flex', gap:8, marginTop:4, flexWrap:'wrap', alignItems:'center' }}>
                          <span style={{ padding:'2px 8px', borderRadius:20, background:isDevoir?'#EDE9FE':'#DBEAFE', color:isDevoir?'#6D28D9':'#1D4ED8', fontSize:10, fontWeight:700 }}>{n.type_eval}</span>
                          {n.commentaire && <span style={{ fontSize:11, color:COULEURS.gris500, fontStyle:'italic' }}>💬 {n.commentaire}</span>}
                        </div>
                        <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:4 }}>📅 {fmtDate(n.created_at)}</div>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <div style={{ fontSize:22, fontWeight:900, color:couleurN, lineHeight:1 }}>{n.note}</div>
                        <div style={{ fontSize:11, color:COULEURS.gris400 }}>/{noteMax}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </>)}

            {/* ── Vue Bulletins ── */}
            {sousOngletRB === 'bulletins' && (<>

            {/* ── Header bulletin ── */}
            <div style={{ background:`linear-gradient(135deg, ${COULEURS.navy}, #0891B2)`, borderRadius:16, padding:'24px 28px', marginBottom:24, color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>📊 Bulletin de résultats</div>
                <div style={{ fontSize:22, fontWeight:900 }}>{apprenant?.prenom} {apprenant?.nom}</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)', marginTop:4 }}>Niveau {apprenant?.niveau_cecr}</div>
              </div>
              <button onClick={() => {
                genererPDF(`
                  <div class="doc-header">
                    <div><div class="doc-header-logo">BET E-Learning</div><div class="doc-header-sub">British English Training · Abidjan, Côte d'Ivoire</div></div>
                    <div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}<br/>Document officiel</div>
                  </div>
                  <div class="doc-title-band">📊 BULLETIN DE RÉSULTATS</div>
                  <div class="doc-body">
                    <div class="section-title">Identification de l'apprenant</div>
                    <div class="info-grid">
                      <div class="info-row"><span class="info-label">Nom complet</span><span class="info-value">${apprenant?.prenom} ${apprenant?.nom}</span></div>
                      <div class="info-row"><span class="info-label">Niveau CECR</span><span class="info-value">${apprenant?.niveau_cecr}</span></div>
                    </div>
                    <div class="section-title">Indicateurs clés</div>
                    <div class="kpi-row">
                      <div class="kpi-card"><div class="kpi-val">${moyPonderee}/20</div><div class="kpi-lbl">Moyenne</div></div>
                      <div class="kpi-card"><div class="kpi-val">${tauxPresB}%</div><div class="kpi-lbl">Assiduité</div></div>
                      <div class="kpi-card"><div class="kpi-val">${presentesB}/${totalPresences}</div><div class="kpi-lbl">Sessions présentes</div></div>
                    </div>
                    <div class="section-title">Détail des évaluations</div>
                    <table>
                      <thead><tr><th>Type</th><th>Compétence</th><th>Note</th><th>/Max</th><th>Date</th></tr></thead>
                      <tbody>${notesB.map(n=>`<tr><td>${n.type_eval||'-'}</td><td>${n.competence||n.titre||'-'}</td><td style="font-weight:800;color:${(n.note/(n.note_max||20))>=0.7?'#059669':(n.note/(n.note_max||20))>=0.5?'#D97706':'#DC2626'}">${n.note}</td><td>${n.note_max||20}</td><td>${fmtDatePDF(n.created_at)}</td></tr>`).join('')}</tbody>
                      <tfoot><tr><td colspan="2">Moyenne</td><td>${moyPonderee}</td><td>/20</td><td></td></tr></tfoot>
                    </table>
                    <div class="doc-footer"><span>BET E-Learning · Formation en anglais · Abidjan, Côte d'Ivoire</span><span>Page 1/1</span></div>
                  </div>
                `, `Bulletin - ${apprenant?.prenom} ${apprenant?.nom}`);
              }} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', color:'#fff', borderRadius:10, padding:'10px 20px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:8 }}>📥 Télécharger PDF</button>
            </div>

            {/* KPIs bulletin */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginBottom:24 }}>
              {[
                { val:`${moyPonderee}/20`,              lbl:'Moyenne',            acc:couleurTheme,    i:'📊' },
                { val:`${tauxPresB}%`,                   lbl:'Taux de présence',  acc:COULEURS.succes,  i:'✅' },
                { val:`${presentesB}/${totalPresences}`, lbl:'Sessions présentes', acc:'#F97316',        i:'📅' },
                { val:`${notesB.length}`,               lbl:'Évaluations',        acc:'#8B5CF6',        i:'📝' },
              ].map(k => (
                <div key={k.lbl} style={S.carte(k.acc)}>
                  <div style={{ fontSize:24, marginBottom:6 }}>{k.i}</div>
                  <div style={{ fontSize:22, fontWeight:800, color:COULEURS.navy, marginBottom:4 }}>{k.val}</div>
                  <div style={{ fontSize:11, color:COULEURS.gris600 }}>{k.lbl}</div>
                </div>
              ))}
            </div>

            {/* Tableau détail évaluations (bulletin) */}
            {notesB.length > 0 && (
              <div style={{ marginBottom:24 }}>
                <div style={S.titre}>📋 Détail des évaluations</div>
                <div style={S.tableau}>
                  <div style={S.thead('2fr 0.7fr 0.7fr 1.5fr 1fr')}>
                    <span>Type d'évaluation</span><span>Note</span><span>/Max</span><span>Compétence</span><span>Date</span>
                  </div>
                  {notesB.map((n,i) => {
                    const pct = n.note/(n.note_max||20);
                    return (
                      <div key={i} style={S.trow('2fr 0.7fr 0.7fr 1.5fr 1fr')}>
                        <span style={{ fontWeight:600, color:COULEURS.navy, fontSize:12 }}>{n.type_eval||'Évaluation'}</span>
                        <span style={{ fontWeight:800, fontSize:16, color:pct>=0.7?COULEURS.succes:pct>=0.5?COULEURS.attention:'#EF4444' }}>{n.note}</span>
                        <span style={{ color:COULEURS.gris400 }}>{n.note_max||20}</span>
                        <Puce label={n.competence||n.titre||'-'} fond="#EDE9FE" texte="#6D28D9" />
                        <span style={{ fontSize:11, color:COULEURS.gris400 }}>{fmtDate(n.created_at)}</span>
                      </div>
                    );
                  })}
                  <div style={{ padding:'12px 18px', background:COULEURS.gris50, borderTop:`2px solid ${COULEURS.gris200}`, display:'grid', gridTemplateColumns:'2fr 0.7fr 0.7fr 1.5fr 1fr', fontSize:13, fontWeight:700, color:COULEURS.navy }}>
                    <span>Moyenne</span>
                    <span style={{ color:couleurTheme, fontSize:16 }}>{moyPonderee}</span>
                    <span style={{ color:COULEURS.gris400 }}>/20</span>
                    <span></span><span></span>
                  </div>
                </div>
              </div>
            )}
            </>)}

          </div>
          );
        })()}

        {/* ══ BADGES ══ */}
        {section === 'badges' && (
          <div>
            {/* En-tête gamification */}
            <div style={{ background:`linear-gradient(135deg, #F59E0B, #F97316)`, borderRadius:16, padding:'20px 24px', marginBottom:24, color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Gamification BET</div>
                <div style={{ fontSize:24, fontWeight:900 }}>{gamifPoints} points ⭐</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.8)', marginTop:4 }}>{badgesApp.length} badge{badgesApp.length!==1?'s':''} obtenu{badgesApp.length!==1?'s':''} sur {gamifBadges.length}</div>
              </div>
              <div style={{ fontSize:52 }}>🏆</div>
            </div>

            {/* Badges obtenus */}
            {badgesApp.length > 0 && (
              <div style={{ marginBottom:28 }}>
                <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>✅ Badges obtenus ({badgesApp.length})</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:14 }}>
                  {badgesApp.map(b => (
                    <div key={b.id} style={{ background:'#fff', borderRadius:16, border:`2px solid #FCD34D`, padding:'20px 16px', textAlign:'center', boxShadow:'0 4px 12px rgba(251,191,36,0.2)' }}>
                      <div style={{ fontSize:44, marginBottom:8 }}>{b.icone || '🏅'}</div>
                      <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:4 }}>{b.nom}</div>
                      <div style={{ fontSize:11, color:COULEURS.gris400, marginBottom:8 }}>{b.description}</div>
                      <div style={{ fontSize:10, color:COULEURS.gris400 }}>Obtenu le {fmtDate(b.obtenu_le)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Badges à débloquer */}
            {badgesLocked.length > 0 && (
              <div style={{ marginBottom:28 }}>
                <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>🔒 À débloquer ({badgesLocked.length})</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:14 }}>
                  {badgesLocked.map(b => (
                    <div key={b.id} style={{ background:COULEURS.gris50, borderRadius:16, border:`1.5px dashed ${COULEURS.gris200}`, padding:'20px 16px', textAlign:'center', opacity:0.7 }}>
                      <div style={{ fontSize:44, marginBottom:8, filter:'grayscale(1)' }}>{b.icone || '🏅'}</div>
                      <div style={{ fontSize:14, fontWeight:700, color:COULEURS.gris600, marginBottom:4 }}>{b.nom}</div>
                      <div style={{ fontSize:11, color:COULEURS.gris400 }}>{b.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {gamifBadges.length === 0 && (
              <div style={{ textAlign:'center', padding:'32px 20px', background:COULEURS.gris50, borderRadius:14, border:`1.5px dashed ${COULEURS.gris200}` }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🏅</div>
                <div style={{ fontWeight:600, color:COULEURS.gris600 }}>Aucun badge obtenu pour le moment</div>
                <div style={{ fontSize:12, color:COULEURS.gris400, marginTop:6 }}>Participez aux sessions et rendez vos devoirs pour gagner des badges.</div>
              </div>
            )}
          </div>
        )}

        {/* ══ MINI-JEUX ══ */}
        {section === 'minijeux' && (
          <div>
            <div style={S.titre}>🎮 Mini-jeux - Révise en t'amusant !</div>

            {!trancheChargee || jeuxActifsTypes === null ? (
              <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:200, fontSize:14, color:'#64748B' }}>
                ⏳ Chargement de ton espace…
              </div>
            ) : (
              <>
              {/* ── Sélection du jeu filtrée par profil (toujours visible) ── */}
              {(() => {
                const resetAll = (id) => { setJeu(id); setQcmIdx(0); setQcmScore(0); setQcmChoix(null); setQcmFini(false); setQcmTemps(15); setAssocSel(null); setAssocOk([]); setLacuneIdx(0); setLacuneInput(''); setLacuneScore(0); setLacuneFini(false); setLacuneMontre(false); setAnaIdx(0); setAnaInput(''); setAnaScore(0); setAnaFini(false); setAnaMontre(false); setSprintScore(0); setSprintTemps(60); setSprintFini(false); setSprintIdx(0); setVfIdx(0); setVfScore(0); setVfFini(false); setVfChoix(null); setReordreIdx(0); setReordreScore(0); setReodreFini(false); setReordreSelec([]); setReordreValide(null); setDialogueIdx(0); setDialogueEtape(0); setDialogueScore(0); setDialogueFini(false); setFlashIdx(0); setFlashRetourne(false); setFlashSus([]); setConjIdx(0); setConjInput(''); setConjScore(0); setConjFini(false); setConjMontre(false); setCecrIdx(0); setCecrScore(0); setCecrFini(false); setCecrChoix(null); setDicteeIdx(0); setDicteeInput(''); setDicteeScore(0); setDicteeFini(false); setDicteeMontre(false); setTraIdx(0); setTraInput(''); setTraScore(0); setTraFini(false); setTraMontre(false); setCrossInputs({}); setCrossValide(null); setCrossFini(false); setWsGrille(construireGrilleMotsCaches()); setWsDebut(null); setWsTrouves([]); setWsCellsTrouvees([]); setWsFini(false); };

                // Catalogue complet : profils = tableau des tranches qui voient ce jeu
                const CATALOGUE = [
                  { id:'anagramme',  icone:'🔤', titre:'Anagramme',              desc:'Retrouve le mot en remettant les lettres dans l\'ordre !', couleur:'#F97316', bg:'#FFF7ED', profils:['enfant','adolescent'] },
                  { id:'qcm',        icone:'⚡', titre:'QCM Flash',              desc:'Traduis le plus vite possible - 15 secondes par mot !',    couleur:'#F97316', bg:'#FFF7ED', profils:['enfant','adolescent','adulte'] },
                  { id:'association',icone:'🔀', titre:'Association',             desc:'Relie chaque mot anglais à sa traduction française.',       couleur:'#8B5CF6', bg:'#F5F3FF', profils:['enfant','adolescent','adulte'] },
                  { id:'lacunes',    icone:'✏️',  titre:'Mot manquant',           desc:'Complète chaque phrase avec le mot anglais qui manque.',   couleur:'#10B981', bg:'#ECFDF5', profils:['enfant','adolescent','adulte'] },
                  { id:'reordre',    icone:'🧩', titre:'Phrases à réordonner',   desc:'Remets les mots dans le bon ordre pour former la phrase.',  couleur:'#0891B2', bg:'#EFF6FF', profils:['adolescent','adulte'] },
                  { id:'flashcards', icone:'🃏', titre:'Flashcards',             desc:'Retourne les cartes et mémorise le vocabulaire clé.',       couleur:'#6366F1', bg:'#EEF2FF', profils:['adolescent','adulte'] },
                  { id:'sprint',     icone:'⏱️', titre:'Sprint vocabulaire',     desc:'Maximum de traductions en 60 secondes chrono !',           couleur:'#EF4444', bg:'#FEF2F2', profils:['adolescent','adulte'] },
                  { id:'conjugaison',icone:'🔁', titre:'Conjugaison express',    desc:'Tape le passé simple des verbes irréguliers.',              couleur:'#7C3AED', bg:'#F5F3FF', profils:['adolescent','adulte'] },
                  { id:'vrai_faux',  icone:'🎯', titre:'Vrai ou Faux',           desc:'Juge si la règle de grammaire est correcte ou non.',        couleur:'#0D9488', bg:'#F0FDFA', profils:['adolescent','adulte'] },
                  { id:'dialogue',   icone:'💬', titre:'Complétion de dialogue', desc:'Choisis la bonne réplique dans une conversation réelle.',    couleur:'#EC4899', bg:'#FDF2F8', profils:['adolescent','adulte'] },
                  { id:'cecr',       icone:'🏆', titre:'Défi CECR',              desc:'Questions calibrées par niveau A1, A2, B1.',                couleur:'#F59E0B', bg:'#FFFBEB', profils:['adulte'] },
                  { id:'dictee',     icone:'📖', titre:'Dictée éclair',          desc:'Lis l\'indice et écris le mot anglais correspondant.',       couleur:'#14B8A6', bg:'#F0FDFA', profils:['adulte'] },
                  { id:'traduction',   icone:'🔃', titre:'Traduction inverse', desc:'Tape la traduction anglaise du mot français affiché.',      couleur:'#059669', bg:'#ECFDF5', profils:['enfant','adolescent','adulte'] },
                  { id:'mots_croises', icone:'🔍', titre:'Mots croisés',       desc:'Remplis la grille à l\'aide des définitions.',               couleur:'#D97706', bg:'#FFFBEB', profils:['adolescent','adulte'] },
                  { id:'mots_caches',  icone:'🕵️', titre:'Mots cachés',        desc:'Trouve les mots cachés dans la grille de lettres.',          couleur:'#4338CA', bg:'#EEF2FF', profils:['enfant','adolescent','adulte'] },
                ];

                // Jeux "bientôt" uniquement pour enfants
                const BIENTOT_ENFANT = [
                  { icone:'🖼️', titre:"Devine l'image", desc:'Trouve le mot anglais à partir de l\'image.' },
                  { icone:'🔊', titre:'Écoute & Réponds', desc:'Associe les sons aux bons mots.' },
                  { icone:'🎨', titre:'Coloriage vocabulaire', desc:'Clique sur la bonne couleur.' },
                ];

                const tranche = ui.tranche; // 'enfant' | 'adolescent' | 'adulte'
                // jeuxActifsTypes est garanti chargé (jamais null) à ce stade - l'écran attend
                // son chargement avant de rendre cette section, pour éviter le flash de jeux
                // désactivés qui se corrigeaient une seconde plus tard.
                const jeusFiltres = CATALOGUE.filter(g => g.profils.includes(tranche) && jeuxActifsTypes.includes(g.id));

                // Header par profil
                const headerProfilCfg = {
                  enfant:     { label:'🧒 Espace Enfants',    bg:'linear-gradient(135deg,#FCD34D,#F97316)', desc:'Des jeux amusants pour apprendre l\'anglais !' },
                  adolescent: { label:'🧑 Espace Adolescents', bg:'linear-gradient(135deg,#8B5CF6,#EC4899)', desc:'Entraîne-toi avec des jeux variés et progressifs.' },
                  adulte:     { label:'👔 Espace Adultes',     bg:'linear-gradient(135deg,#0891B2,#0E4F6B)', desc:'Des exercices complets pour maîtriser l\'anglais professionnel.' },
                };
                const headerCfg = headerProfilCfg[tranche] || headerProfilCfg.adulte;

                return (
                  <div>
                    {/* Header profil */}
                    <div style={{ background:headerCfg.bg, borderRadius:14, padding:'16px 20px', marginBottom:20, color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <div style={{ fontSize:16, fontWeight:800, marginBottom:2 }}>{headerCfg.label}</div>
                        <div style={{ fontSize:12, opacity:0.85 }}>{headerCfg.desc}</div>
                      </div>
                      <div style={{ fontSize:12, opacity:0.8, textAlign:'right' }}>
                        <div style={{ fontWeight:700 }}>{jeusFiltres.length} jeu{jeusFiltres.length>1?'x':''} disponible{jeusFiltres.length>1?'s':''}</div>
                      </div>
                    </div>

                    {/* KPIs de mes scores */}
                    {mesJeuxKpis && mesJeuxKpis.partiesJouees > 0 && (
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12, marginBottom:20 }}>
                        {[
                          { l:'Parties jouées', v: mesJeuxKpis.partiesJouees, c:'#F97316', i:'🎮' },
                          { l:'Jeux essayés',   v: mesJeuxKpis.jeuxJoues,     c:'#0891B2', i:'🕹️' },
                          { l:'Meilleur score', v: mesJeuxKpis.meilleurScore!=null?`${mesJeuxKpis.meilleurScore}%`:'-', c:COULEURS.succes, i:'🏆' },
                          { l:'Score moyen',    v: mesJeuxKpis.scoreMoyen!=null?`${mesJeuxKpis.scoreMoyen}%`:'-', c:'#7C3AED', i:'📊' },
                        ].map(k => (
                          <div key={k.l} style={{ background:'#fff', borderRadius:12, padding:'12px 14px', border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}` }}>
                            <div style={{ fontSize:18, marginBottom:4 }}>{k.i}</div>
                            <div style={{ fontSize:18, fontWeight:800, color:k.c }}>{k.v}</div>
                            <div style={{ fontSize:10, color:COULEURS.gris600, marginTop:2 }}>{k.l}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Règle */}
                    <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:10, padding:'10px 16px', fontSize:12, color:'#92400E', marginBottom:20, display:'flex', gap:10, alignItems:'center' }}>
                      <span style={{ fontSize:18 }}>📋</span>
                      <span>Le nombre de tentatives autorisées dépend du jeu (affiché sur chaque carte). Une fois atteint, le jeu est 🔒 verrouillé.</span>
                    </div>

                    {/* Grille des jeux filtrés */}
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14, marginBottom:24 }}>
                      {jeusFiltres.map(g => {
                        const tents = tentativesJeu[g.id] || 0;
                        const maxJeu = jeuxMaxTentatives[g.id] || 2;
                        const verrouille = tents >= maxJeu;
                        return (
                          <div key={g.id}
                            onClick={() => { if(verrouille) return; resetAll(g.id); }}
                            style={{ background:verrouille?COULEURS.gris50:g.bg, borderRadius:16, padding:'20px 18px', border:`2px solid ${verrouille?COULEURS.gris200:g.couleur+'40'}`, cursor:verrouille?'not-allowed':'pointer', opacity:verrouille?0.6:1, position:'relative', transition:'transform 0.15s,box-shadow 0.15s' }}
                            onMouseEnter={e=>{ if(!verrouille){e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow=`0 8px 24px ${g.couleur}30`; }}}
                            onMouseLeave={e=>{ e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none'; }}>
                            {verrouille && <div style={{ position:'absolute', top:10, right:10, fontSize:18 }}>🔒</div>}
                            {tents>0 && !verrouille && <div style={{ position:'absolute', top:10, right:10, padding:'2px 7px', borderRadius:10, background:'#FEF3C7', color:'#92400E', fontSize:10, fontWeight:700 }}>Réessai</div>}
                            <div style={{ fontSize:36, marginBottom:10 }}>{g.icone}</div>
                            <div style={{ fontSize:15, fontWeight:800, color:verrouille?COULEURS.gris400:COULEURS.navy, marginBottom:5 }}>{g.titre}</div>
                            <div style={{ fontSize:11, color:COULEURS.gris600, marginBottom:12, lineHeight:1.5 }}>{g.desc}</div>
                            {mesJeuxParType[g.id]?.meilleurPourcentage != null && (
                              <div style={{ fontSize:11, fontWeight:700, color: mesJeuxParType[g.id].meilleurPourcentage>=70?COULEURS.succes:mesJeuxParType[g.id].meilleurPourcentage>=40?'#D97706':'#DC2626', marginBottom:10 }}>
                                🏆 Meilleur score : {mesJeuxParType[g.id].meilleurPourcentage}%
                              </div>
                            )}
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                              <div style={{ padding:'5px 14px', borderRadius:20, background:verrouille?COULEURS.gris200:g.couleur, color:verrouille?COULEURS.gris400:'#fff', fontSize:12, fontWeight:700 }}>
                                {verrouille ? 'Verrouillé' : tents===0 ? 'Jouer →' : '🔄 Rejouer'}
                              </div>
                              <span style={{ fontSize:10, color:COULEURS.gris400 }}>{tents}/{maxJeu}</span>
                            </div>
                          </div>
                        );
                      })}

                      {/* Cartes "Bientôt" pour les enfants */}
                      {tranche === 'enfant' && BIENTOT_ENFANT.map(g => (
                        <div key={g.titre} style={{ background:COULEURS.gris50, borderRadius:16, padding:'20px 18px', border:`2px dashed ${COULEURS.gris200}`, opacity:0.55 }}>
                          <div style={{ fontSize:36, marginBottom:10 }}>{g.icone}</div>
                          <div style={{ fontSize:15, fontWeight:800, color:COULEURS.gris500, marginBottom:5 }}>{g.titre}</div>
                          <div style={{ fontSize:11, color:COULEURS.gris400, marginBottom:12, lineHeight:1.5 }}>{g.desc}</div>
                          <div style={{ padding:'5px 14px', borderRadius:20, background:COULEURS.gris200, color:COULEURS.gris400, fontSize:12, fontWeight:700, display:'inline-block' }}>🔜 Bientôt</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ── Jeu en cours : modal plein écran, fermeture uniquement via le bouton ✕ ── */}
              {jeu && (
                <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.75)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16, backdropFilter:'blur(4px)' }}>
                  <div style={{ background: COULEURS.gris50, borderRadius:20, width:'100%', maxWidth:640, maxHeight:'90vh', overflowY:'auto', padding:'24px', position:'relative', boxShadow:'0 32px 80px rgba(0,0,0,0.4)' }}>
                    <button onClick={()=>setJeu(null)} title="Fermer" style={{ position:'absolute', top:14, right:14, width:34, height:34, borderRadius:10, border:'none', background:COULEURS.blanc, color:COULEURS.gris600, fontSize:16, fontWeight:800, cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.1)', zIndex:1 }}>✕</button>
                    {jeu === 'qcm' ? (
              /* QCM Flash */
              <div style={{ maxWidth:600, margin:'0 auto' }}>
                <button onClick={() => setJeu(null)} style={{ marginBottom:16, background:'none', border:'none', color:couleurTheme, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>← Retour aux jeux</button>
                {qcmFini ? (
                  <div style={{ textAlign:'center', padding:'40px 20px', background:'#fff', borderRadius:20, border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:64, marginBottom:12 }}>{qcmScore>=8?'🎉':qcmScore>=5?'👍':'💪'}</div>
                    <div style={{ fontSize:24, fontWeight:900, color:COULEURS.navy, marginBottom:8 }}>{qcmScore}/{QCM_MOTS.length} bonnes réponses</div>
                    <div style={{ fontSize:14, color:COULEURS.gris600, marginBottom:16 }}>{qcmScore>=8?'Excellent ! Tu maîtrises ce vocabulaire !':qcmScore>=5?'Bien ! Continue à t\'entraîner.':'Continue à réviser, tu vas y arriver !'}</div>
                    {tentativesJeu.qcm < (jeuxMaxTentatives.qcm || 2)
                      ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>
                          💡 {tentativesJeu.qcm === 0 ? 'Tu peux rejouer une fois pour améliorer ton score.' : 'Dernière tentative - donne le meilleur de toi !'}
                        </div>
                      : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>
                          🔒 Tu as utilisé tes 2 tentatives. Score final : <strong>{qcmScore}/{QCM_MOTS.length}</strong>
                        </div>
                    }
                    <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                      {tentativesJeu.qcm < (jeuxMaxTentatives.qcm || 2) && <button onClick={() => { setTentativesJeu(p=>({...p,qcm:p.qcm+1})); setQcmIdx(0); setQcmScore(0); setQcmChoix(null); setQcmFini(false); setQcmTemps(15); }} style={S.btn('#F97316')}>🔄 Rejouer</button>}
                      <button onClick={() => setJeu(null)} style={S.btnGhost}>Changer de jeu</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                    {/* Barre progression */}
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:12, color:COULEURS.gris400 }}>
                      <span>Question {qcmIdx+1}/{QCM_MOTS.length}</span>
                      <span style={{ fontWeight:700, color:qcmTemps<=5?'#EF4444':'#F97316' }}>⏱ {qcmTemps}s</span>
                    </div>
                    <div style={{ height:6, background:COULEURS.gris100, borderRadius:3, marginBottom:24, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${(qcmIdx/QCM_MOTS.length)*100}%`, background:'#F97316', borderRadius:3, transition:'width 0.3s' }} />
                    </div>
                    <div style={{ height:6, background:COULEURS.gris100, borderRadius:3, marginBottom:24, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${(qcmTemps/15)*100}%`, background:qcmTemps<=5?'#EF4444':'#F97316', borderRadius:3, transition:'width 1s linear' }} />
                    </div>
                    <div style={{ textAlign:'center', fontSize:36, fontWeight:900, color:COULEURS.navy, marginBottom:24 }}>{QCM_MOTS[qcmIdx].mot}</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                      {QCM_MOTS[qcmIdx].options.map(opt => {
                        const selec = qcmChoix === opt;
                        const timeout = qcmChoix === '__timeout__';
                        const estCorr = opt === QCM_MOTS[qcmIdx].correct;
                        let bg = '#f8fafc', bord = COULEURS.gris200, txt = COULEURS.navy;
                        if (qcmChoix !== null) {
                          if (estCorr) { bg='#D1FAE5'; bord='#6EE7B7'; txt='#065F46'; }
                          else if (selec) { bg='#FEE2E2'; bord='#FECACA'; txt='#991B1B'; }
                        }
                        return (
                          <button key={opt} disabled={qcmChoix!==null} onClick={() => { const correct = opt===QCM_MOTS[qcmIdx].correct; setQcmChoix(opt); if(correct) setQcmScore(s=>s+1); setTimeout(() => { if(qcmIdx<QCM_MOTS.length-1){ setQcmIdx(i=>i+1); setQcmChoix(null); setQcmTemps(15); } else { setQcmFini(true); setTentativesJeu(p=>({...p,qcm:p.qcm+1})); } }, 800); }}
                            style={{ padding:'14px 12px', borderRadius:12, border:`2px solid ${bord}`, background:bg, color:txt, fontSize:14, fontWeight:600, cursor:qcmChoix?'default':'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', transition:'all 0.15s' }}>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    {qcmChoix === '__timeout__' && <div style={{ textAlign:'center', marginTop:14, fontSize:13, color:'#EF4444', fontWeight:700 }}>⏰ Temps écoulé ! La bonne réponse était : {QCM_MOTS[qcmIdx].correct}</div>}
                  </div>
                )}
              </div>
            ) : jeu === 'association' ? (
              /* Association */
              <div style={{ maxWidth:700, margin:'0 auto' }}>
                <button onClick={() => setJeu(null)} style={{ marginBottom:16, background:'none', border:'none', color:couleurTheme, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>← Retour aux jeux</button>
                {assocOk.length === ASSOC_PAIRES_DATA.length ? (
                  <div style={{ textAlign:'center', padding:'40px', background:'#fff', borderRadius:20, border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:64, marginBottom:12 }}>🎉</div>
                    <div style={{ fontSize:22, fontWeight:900, color:COULEURS.navy, marginBottom:8 }}>Parfait ! Toutes les paires trouvées !</div>
                    <div style={{ display:'flex', gap:12, justifyContent:'center', marginTop:20 }}>
                      <button onClick={() => { setAssocSel(null); setAssocOk([]); }} style={S.btn('#8B5CF6')}>🔄 Rejouer</button>
                      <button onClick={() => setJeu(null)} style={S.btnGhost}>Changer de jeu</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize:13, color:COULEURS.gris600, marginBottom:16, textAlign:'center' }}>Clique sur un mot français, puis sur sa traduction anglaise.</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10, textAlign:'center' }}>🇫🇷 Français</div>
                        {ASSOC_PAIRES_DATA.map((p,i) => {
                          const ok = assocOk.includes(i);
                          const selec = assocSel === `fr-${i}`;
                          return <button key={i} disabled={ok} onClick={() => { if(assocSel?.startsWith('en-')){ const enIdx=parseInt(assocSel.split('-')[1]); if(enIdx===i){ setAssocOk(a=>[...a,i]); setAssocSel(null); } else setAssocSel(`fr-${i}`); } else setAssocSel(`fr-${i}`); }}
                            style={{ display:'block', width:'100%', marginBottom:8, padding:'14px', borderRadius:10, border:`2px solid ${ok?'#6EE7B7':selec?'#8B5CF6':COULEURS.gris200}`, background:ok?'#F0FDF4':selec?'#F5F3FF':'#fff', color:ok?'#065F46':selec?'#6D28D9':COULEURS.navy, fontWeight:700, fontSize:14, cursor:ok?'default':'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', transition:'all 0.15s' }}>
                            {ok?'✅ ':''}{p.fr}
                          </button>;
                        })}
                      </div>
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10, textAlign:'center' }}>🇬🇧 Anglais</div>
                        {[...ASSOC_PAIRES_DATA].sort(()=>Math.random()-0.5).map((p,i) => {
                          const realIdx = ASSOC_PAIRES_DATA.findIndex(x=>x.en===p.en);
                          const ok = assocOk.includes(realIdx);
                          const selec = assocSel === `en-${realIdx}`;
                          return <button key={i} disabled={ok} onClick={() => { if(assocSel?.startsWith('fr-')){ const frIdx=parseInt(assocSel.split('-')[1]); if(frIdx===realIdx){ setAssocOk(a=>[...a,realIdx]); setAssocSel(null); } else setAssocSel(`en-${realIdx}`); } else setAssocSel(`en-${realIdx}`); }}
                            style={{ display:'block', width:'100%', marginBottom:8, padding:'14px', borderRadius:10, border:`2px solid ${ok?'#6EE7B7':selec?'#8B5CF6':COULEURS.gris200}`, background:ok?'#F0FDF4':selec?'#F5F3FF':'#fff', color:ok?'#065F46':selec?'#6D28D9':COULEURS.navy, fontWeight:700, fontSize:14, cursor:ok?'default':'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', transition:'all 0.15s' }}>
                            {ok?'✅ ':''}{p.en}
                          </button>;
                        })}
                      </div>
                    </div>
                    <div style={{ textAlign:'center', marginTop:12, fontSize:12, color:COULEURS.gris400 }}>{assocOk.length}/{ASSOC_PAIRES_DATA.length} paires trouvées</div>
                  </div>
                )}
              </div>
            ) : jeu === 'lacunes' ? (
              /* Mot manquant */
              <div style={{ maxWidth:580, margin:'0 auto' }}>
                <button onClick={() => setJeu(null)} style={{ marginBottom:16, background:'none', border:'none', color:couleurTheme, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>← Retour aux jeux</button>
                {lacuneFini ? (
                  <div style={{ textAlign:'center', padding:'40px', background:'#fff', borderRadius:20, border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:64, marginBottom:12 }}>{lacuneScore>=4?'🌟':lacuneScore>=2?'👍':'💪'}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:COULEURS.navy, marginBottom:8 }}>{lacuneScore}/{LACUNES_DATA.length} bonnes réponses</div>
                    {tentativesJeu.lacunes < (jeuxMaxTentatives.lacunes || 2)
                      ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>
                          💡 {tentativesJeu.lacunes===0?'Tu peux rejouer une fois pour améliorer ton score.':'Dernière tentative - donne le meilleur de toi !'}
                        </div>
                      : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>
                          🔒 Tu as utilisé tes 2 tentatives. Score final : <strong>{lacuneScore}/{LACUNES_DATA.length}</strong>
                        </div>
                    }
                    <div style={{ display:'flex', gap:12, justifyContent:'center', marginTop:16 }}>
                      {tentativesJeu.lacunes < (jeuxMaxTentatives.lacunes || 2) && <button onClick={() => { setTentativesJeu(p=>({...p,lacunes:p.lacunes+1})); setLacuneIdx(0); setLacuneInput(''); setLacuneScore(0); setLacuneFini(false); setLacuneMontre(false); }} style={S.btn('#10B981')}>🔄 Rejouer</button>}
                      <button onClick={() => setJeu(null)} style={S.btnGhost}>Changer de jeu</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:20, fontSize:12, color:COULEURS.gris400 }}>
                      <span>Phrase {lacuneIdx+1}/{LACUNES_DATA.length}</span>
                      <span style={{ fontWeight:700, color:COULEURS.succes }}>{lacuneScore} bonne{lacuneScore>1?'s':''}</span>
                    </div>
                    <div style={{ height:6, background:COULEURS.gris100, borderRadius:3, marginBottom:24, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${(lacuneIdx/LACUNES_DATA.length)*100}%`, background:'#10B981', borderRadius:3 }} />
                    </div>
                    <div style={{ fontSize:22, fontWeight:700, color:COULEURS.navy, textAlign:'center', marginBottom:8 }}>{LACUNES_DATA[lacuneIdx].phrase.replace('___','______')}</div>
                    <div style={{ textAlign:'center', fontSize:12, color:COULEURS.gris400, marginBottom:24 }}>💡 Indice : {LACUNES_DATA[lacuneIdx].indice}</div>
                    <input value={lacuneInput} onChange={e=>setLacuneInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&lacuneInput.trim()&&(()=>{ const ok=lacuneInput.trim().toLowerCase()===LACUNES_DATA[lacuneIdx].mot.toLowerCase(); if(ok)setLacuneScore(s=>s+1); if(lacuneIdx<LACUNES_DATA.length-1){setLacuneIdx(i=>i+1);setLacuneInput('');setLacuneMontre(false);}else setLacuneFini(true); })()} placeholder="Tape le mot manquant..." style={{ width:'100%', padding:'14px 16px', borderRadius:10, border:`2px solid ${couleurTheme}`, fontSize:16, fontWeight:700, textAlign:'center', fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', boxSizing:'border-box', marginBottom:14 }} />
                    {lacuneMontre && <div style={{ textAlign:'center', fontSize:14, color:'#10B981', fontWeight:700, marginBottom:14 }}>✅ Réponse : <strong>{LACUNES_DATA[lacuneIdx].mot}</strong></div>}
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={()=>setLacuneMontre(true)} style={{ flex:1, padding:'10px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>💡 Voir la réponse</button>
                      <button disabled={!lacuneInput.trim()} onClick={()=>{ const ok=lacuneInput.trim().toLowerCase()===LACUNES_DATA[lacuneIdx].mot.toLowerCase(); if(ok)setLacuneScore(s=>s+1); if(lacuneIdx<LACUNES_DATA.length-1){setLacuneIdx(i=>i+1);setLacuneInput('');setLacuneMontre(false);}else setLacuneFini(true); }} style={{ flex:1, ...S.btn('#10B981'), opacity:lacuneInput.trim()?1:0.5, cursor:lacuneInput.trim()?'pointer':'not-allowed' }}>Valider ✓</button>
                    </div>
                  </div>
                )}
              </div>

            ) : jeu === 'anagramme' ? (
              /* ── ANAGRAMME ── */
              <div style={{ maxWidth:520, margin:'0 auto' }}>
                <button onClick={()=>setJeu(null)} style={{ marginBottom:16, background:'none', border:'none', color:couleurTheme, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>← Retour aux jeux</button>
                {anaFini ? (
                  <div style={{ textAlign:'center', padding:'40px', background:'#fff', borderRadius:20, border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:56, marginBottom:12 }}>{anaScore>=6?'🎉':anaScore>=4?'👍':'💪'}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:COULEURS.navy, marginBottom:8 }}>{anaScore}/{ANAGRAMME_DATA.length} mots trouvés</div>
                    {tentativesJeu.anagramme < (jeuxMaxTentatives.anagramme || 2)
                      ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {tentativesJeu.anagramme===0?'Tu peux rejouer une fois !':'Dernière tentative !'}</div>
                      : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{anaScore}/{ANAGRAMME_DATA.length}</strong></div>
                    }
                    <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                      {tentativesJeu.anagramme < (jeuxMaxTentatives.anagramme || 2) && <button onClick={()=>{ setTentativesJeu(p=>({...p,anagramme:p.anagramme+1})); setAnaIdx(0); setAnaInput(''); setAnaScore(0); setAnaFini(false); setAnaMontre(false); }} style={S.btn('#F97316')}>🔄 Rejouer</button>}
                      <button onClick={()=>setJeu(null)} style={S.btnGhost}>Changer de jeu</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16, fontSize:12, color:COULEURS.gris400 }}>
                      <span>Mot {anaIdx+1}/{ANAGRAMME_DATA.length}</span>
                      <span style={{ fontWeight:700, color:'#F97316' }}>{anaScore} ✓</span>
                    </div>
                    <div style={{ height:5, background:COULEURS.gris100, borderRadius:3, marginBottom:24, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${(anaIdx/ANAGRAMME_DATA.length)*100}%`, background:'#F97316', borderRadius:3 }} />
                    </div>
                    <div style={{ textAlign:'center', marginBottom:8, fontSize:12, color:COULEURS.gris600 }}>{ANAGRAMME_DATA[anaIdx].indice}</div>
                    <div style={{ textAlign:'center', fontSize:42, fontWeight:900, color:'#F97316', letterSpacing:8, marginBottom:24, fontFamily:'monospace' }}>{ANAGRAMME_DATA[anaIdx].melange}</div>
                    <input value={anaInput} onChange={e=>setAnaInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&anaInput.trim()&&(()=>{ const ok=anaInput.trim()===ANAGRAMME_DATA[anaIdx].mot; if(ok)setAnaScore(s=>s+1); setAnaMontre(true); setTimeout(()=>{ if(anaIdx<ANAGRAMME_DATA.length-1){setAnaIdx(i=>i+1);setAnaInput('');setAnaMontre(false);}else setAnaFini(true); },1000); })()} placeholder="Tape le mot en majuscules..." style={{ width:'100%', padding:'14px', borderRadius:10, border:`2px solid #F97316`, fontSize:18, fontWeight:800, textAlign:'center', fontFamily:'monospace', outline:'none', boxSizing:'border-box', marginBottom:10, textTransform:'uppercase' }} />
                    {anaMontre && <div style={{ textAlign:'center', fontSize:15, fontWeight:700, color:anaInput===ANAGRAMME_DATA[anaIdx].mot?COULEURS.succes:'#EF4444', marginBottom:10 }}>{anaInput===ANAGRAMME_DATA[anaIdx].mot?'✅ Bravo !':'❌ Réponse : '+ANAGRAMME_DATA[anaIdx].mot}</div>}
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={()=>{ setAnaMontre(true); setTimeout(()=>{ if(anaIdx<ANAGRAMME_DATA.length-1){setAnaIdx(i=>i+1);setAnaInput('');setAnaMontre(false);}else setAnaFini(true); },1200); }} style={{ flex:1, padding:'10px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>💡 Voir la réponse</button>
                      <button disabled={!anaInput.trim()||anaMontre} onClick={()=>{ const ok=anaInput.trim()===ANAGRAMME_DATA[anaIdx].mot; if(ok)setAnaScore(s=>s+1); setAnaMontre(true); setTimeout(()=>{ if(anaIdx<ANAGRAMME_DATA.length-1){setAnaIdx(i=>i+1);setAnaInput('');setAnaMontre(false);}else setAnaFini(true); },1000); }} style={{ flex:1, ...S.btn('#F97316'), opacity:(!anaInput.trim()||anaMontre)?0.5:1, cursor:(!anaInput.trim()||anaMontre)?'not-allowed':'pointer' }}>Valider ✓</button>
                    </div>
                  </div>
                )}
              </div>

            ) : jeu === 'sprint' ? (
              /* ── SPRINT VOCABULAIRE ── */
              <div style={{ maxWidth:560, margin:'0 auto' }}>
                <button onClick={()=>setJeu(null)} style={{ marginBottom:16, background:'none', border:'none', color:couleurTheme, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>← Retour aux jeux</button>
                {sprintFini ? (
                  <div style={{ textAlign:'center', padding:'40px', background:'#fff', borderRadius:20, border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:56, marginBottom:12 }}>{sprintScore>=20?'🏆':sprintScore>=10?'🎉':sprintScore>=5?'👍':'💪'}</div>
                    <div style={{ fontSize:24, fontWeight:900, color:COULEURS.navy, marginBottom:4 }}>{sprintScore} mots traduits</div>
                    <div style={{ fontSize:13, color:COULEURS.gris600, marginBottom:20 }}>en 60 secondes</div>
                    {tentativesJeu.sprint < (jeuxMaxTentatives.sprint || 2)
                      ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {tentativesJeu.sprint===0?'Peux-tu faire mieux ? Un seul réessai !':'Dernière tentative !'}</div>
                      : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{sprintScore} mots</strong></div>
                    }
                    <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                      {tentativesJeu.sprint < (jeuxMaxTentatives.sprint || 2) && <button onClick={()=>{ setTentativesJeu(p=>({...p,sprint:p.sprint+1})); setSprintScore(0); setSprintTemps(60); setSprintFini(false); setSprintIdx(0); setSprintMots([...SPRINT_MOTS].sort(()=>Math.random()-0.5)); }} style={S.btn('#EF4444')}>🔄 Rejouer</button>}
                      <button onClick={()=>setJeu(null)} style={S.btnGhost}>Changer de jeu</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12, alignItems:'center' }}>
                      <span style={{ fontWeight:700, color:'#EF4444', fontSize:24 }}>⏱ {sprintTemps}s</span>
                      <span style={{ fontWeight:700, color:COULEURS.navy, fontSize:18 }}>✓ {sprintScore}</span>
                    </div>
                    <div style={{ height:8, background:COULEURS.gris100, borderRadius:4, marginBottom:24, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${(sprintTemps/60)*100}%`, background:sprintTemps<=10?'#EF4444':'#EF4444', borderRadius:4, transition:'width 1s linear' }} />
                    </div>
                    {sprintMots[sprintIdx] && (
                      <>
                        <div style={{ textAlign:'center', fontSize:13, color:COULEURS.gris400, marginBottom:6 }}>Traduis en français :</div>
                        <div style={{ textAlign:'center', fontSize:36, fontWeight:900, color:COULEURS.navy, marginBottom:24 }}>{sprintMots[sprintIdx]?.en}</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                          {(() => {
                            const correct = sprintMots[sprintIdx]?.fr;
                            const wrong = SPRINT_MOTS.filter(m=>m.fr!==correct).sort(()=>Math.random()-0.5).slice(0,3).map(m=>m.fr);
                            return [...wrong, correct].sort(()=>Math.random()-0.5).map(opt=>(
                              <button key={opt} onClick={()=>{ if(opt===correct) setSprintScore(s=>s+1); setSprintIdx(i=>i+1); }} style={{ padding:'14px', borderRadius:12, border:`2px solid ${COULEURS.gris200}`, background:'#f8fafc', color:COULEURS.navy, fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>{opt}</button>
                            ));
                          })()}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

            ) : jeu === 'vrai_faux' ? (
              /* ── VRAI OU FAUX ── */
              <div style={{ maxWidth:560, margin:'0 auto' }}>
                <button onClick={()=>setJeu(null)} style={{ marginBottom:16, background:'none', border:'none', color:couleurTheme, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>← Retour aux jeux</button>
                {vfFini ? (
                  <div style={{ textAlign:'center', padding:'40px', background:'#fff', borderRadius:20, border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:56, marginBottom:12 }}>{vfScore>=6?'🎉':vfScore>=4?'👍':'💪'}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:COULEURS.navy, marginBottom:8 }}>{vfScore}/{VRAI_FAUX_DATA.length} bonnes réponses</div>
                    {tentativesJeu.vrai_faux < (jeuxMaxTentatives.vrai_faux || 2)
                      ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {tentativesJeu.vrai_faux===0?'Un seul réessai autorisé !':'Dernière tentative !'}</div>
                      : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{vfScore}/{VRAI_FAUX_DATA.length}</strong></div>
                    }
                    <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                      {tentativesJeu.vrai_faux < (jeuxMaxTentatives.vrai_faux || 2) && <button onClick={()=>{ setTentativesJeu(p=>({...p,vrai_faux:p.vrai_faux+1})); setVfIdx(0); setVfScore(0); setVfFini(false); setVfChoix(null); }} style={S.btn('#0D9488')}>🔄 Rejouer</button>}
                      <button onClick={()=>setJeu(null)} style={S.btnGhost}>Changer de jeu</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16, fontSize:12, color:COULEURS.gris400 }}>
                      <span>Affirmation {vfIdx+1}/{VRAI_FAUX_DATA.length}</span>
                      <span style={{ fontWeight:700, color:COULEURS.succes }}>{vfScore} ✓</span>
                    </div>
                    <div style={{ height:5, background:COULEURS.gris100, borderRadius:3, marginBottom:24, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${(vfIdx/VRAI_FAUX_DATA.length)*100}%`, background:'#0D9488', borderRadius:3 }} />
                    </div>
                    <div style={{ background:'#F0FDFA', borderRadius:14, padding:'20px', marginBottom:20, fontSize:16, fontWeight:700, color:COULEURS.navy, textAlign:'center', lineHeight:1.5 }}>
                      "{VRAI_FAUX_DATA[vfIdx].enonce}"
                    </div>
                    {vfChoix !== null && (
                      <div style={{ background:vfChoix===VRAI_FAUX_DATA[vfIdx].correct?'#DCFCE7':'#FEE2E2', borderRadius:10, padding:'12px 16px', fontSize:12, color:vfChoix===VRAI_FAUX_DATA[vfIdx].correct?'#065F46':'#991B1B', marginBottom:16, fontWeight:600 }}>
                        {VRAI_FAUX_DATA[vfIdx].explication}
                      </div>
                    )}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                      {[true, false].map(val => {
                        const selec = vfChoix === val;
                        const correct = VRAI_FAUX_DATA[vfIdx].correct === val;
                        let bg = val ? '#DCFCE7' : '#FEE2E2';
                        let col = val ? '#065F46' : '#991B1B';
                        if(vfChoix === null) { bg = '#F8FAFC'; col = COULEURS.navy; }
                        return (
                          <button key={String(val)} disabled={vfChoix!==null} onClick={()=>{ setVfChoix(val); if(val===VRAI_FAUX_DATA[vfIdx].correct) setVfScore(s=>s+1); setTimeout(()=>{ setVfChoix(null); if(vfIdx<VRAI_FAUX_DATA.length-1) setVfIdx(i=>i+1); else { setVfFini(true); setTentativesJeu(p=>({...p,vrai_faux:p.vrai_faux+1})); } },1500); }}
                            style={{ padding:'18px', borderRadius:14, border:`2px solid ${vfChoix!==null&&correct?'#6EE7B7':vfChoix!==null&&selec&&!correct?'#FECACA':COULEURS.gris200}`, background:bg, color:col, fontSize:16, fontWeight:800, cursor:vfChoix?'default':'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', transition:'all 0.15s' }}>
                            {val ? '✅ VRAI' : '❌ FAUX'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

            ) : jeu === 'reordre' ? (
              /* ── PHRASES À RÉORDONNER ── */
              <div style={{ maxWidth:600, margin:'0 auto' }}>
                <button onClick={()=>setJeu(null)} style={{ marginBottom:16, background:'none', border:'none', color:couleurTheme, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>← Retour aux jeux</button>
                {reodreFini ? (
                  <div style={{ textAlign:'center', padding:'40px', background:'#fff', borderRadius:20, border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:56, marginBottom:12 }}>{reordreScore>=6?'🎉':reordreScore>=4?'👍':'💪'}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:COULEURS.navy, marginBottom:8 }}>{reordreScore}/{REORDRE_DATA.length} phrases correctes</div>
                    {tentativesJeu.reordre < (jeuxMaxTentatives.reordre || 2)
                      ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {tentativesJeu.reordre===0?'Un réessai autorisé !':'Dernière tentative !'}</div>
                      : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{reordreScore}/{REORDRE_DATA.length}</strong></div>
                    }
                    <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                      {tentativesJeu.reordre < (jeuxMaxTentatives.reordre || 2) && <button onClick={()=>{ setTentativesJeu(p=>({...p,reordre:p.reordre+1})); setReordreIdx(0); setReordreScore(0); setReodreFini(false); setReordreSelec([]); setReordreValide(null); }} style={S.btn('#0891B2')}>🔄 Rejouer</button>}
                      <button onClick={()=>setJeu(null)} style={S.btnGhost}>Changer de jeu</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ background:'#fff', borderRadius:20, padding:'24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14, fontSize:12, color:COULEURS.gris400 }}>
                      <span>Phrase {reordreIdx+1}/{REORDRE_DATA.length}</span>
                      <span style={{ fontWeight:700, color:COULEURS.succes }}>{reordreScore} ✓</span>
                    </div>
                    <div style={{ height:5, background:COULEURS.gris100, borderRadius:3, marginBottom:20, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${(reordreIdx/REORDRE_DATA.length)*100}%`, background:'#0891B2', borderRadius:3 }} />
                    </div>
                    <div style={{ fontSize:12, color:COULEURS.gris400, marginBottom:6 }}>🇫🇷 {REORDRE_DATA[reordreIdx].fr}</div>
                    {/* Zone de construction */}
                    <div style={{ minHeight:52, background:'#EFF6FF', borderRadius:10, padding:'10px 14px', marginBottom:16, display:'flex', flexWrap:'wrap', gap:8, alignItems:'center', border:'2px dashed #93C5FD' }}>
                      {reordreSelec.length===0 && <span style={{ color:'#93C5FD', fontSize:13 }}>Clique les mots ci-dessous pour construire la phrase…</span>}
                      {reordreSelec.map((mot,i)=>(
                        <button key={i} onClick={()=>{ const newS=[...reordreSelec]; newS.splice(i,1); setReordreSelec(newS); setReodreMots(p=>[...p,mot]); setReordreValide(null); }} style={{ padding:'6px 12px', borderRadius:8, background:'#0891B2', color:'#fff', border:'none', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>{mot}</button>
                      ))}
                    </div>
                    {/* Mots disponibles */}
                    <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
                      {reodreMots.map((mot,i)=>(
                        <button key={i} onClick={()=>{ setReordreSelec(p=>[...p,mot]); setReodreMots(p=>p.filter((_,j)=>j!==i)); setReordreValide(null); }} style={{ padding:'6px 12px', borderRadius:8, background:COULEURS.gris100, color:COULEURS.navy, border:`1.5px solid ${COULEURS.gris200}`, fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>{mot}</button>
                      ))}
                    </div>
                    {reordreValide !== null && (
                      <div style={{ textAlign:'center', fontSize:13, fontWeight:700, color:reordreValide?COULEURS.succes:'#EF4444', marginBottom:10 }}>
                        {reordreValide ? '✅ Correct !' : `❌ Correct : ${REORDRE_DATA[reordreIdx].correct.join(' ')}`}
                      </div>
                    )}
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={()=>{ setReordreSelec([]); setReodreMots([...REORDRE_DATA[reordreIdx].mots].sort(()=>Math.random()-0.5)); setReordreValide(null); }} style={{ padding:'9px 16px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.gris600, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>🔁 Reset</button>
                      <button onClick={()=>{ const ok=reordreSelec.join(' ')===REORDRE_DATA[reordreIdx].correct.join(' '); setReordreValide(ok); if(ok) setReordreScore(s=>s+1); setTimeout(()=>{ setReordreValide(null); if(reordreIdx<REORDRE_DATA.length-1){setReordreIdx(i=>i+1);setReordreSelec([]);}else{setReodreFini(true);setTentativesJeu(p=>({...p,reordre:p.reordre+1}));} },1200); }} disabled={reordreSelec.length===0||reordreValide!==null} style={{ flex:1, ...S.btn('#0891B2'), opacity:(reordreSelec.length===0||reordreValide!==null)?0.5:1, cursor:(reordreSelec.length===0||reordreValide!==null)?'not-allowed':'pointer' }}>Valider ✓</button>
                    </div>
                  </div>
                )}
              </div>

            ) : jeu === 'dialogue' ? (
              /* ── COMPLÉTION DE DIALOGUE ── */
              <div style={{ maxWidth:580, margin:'0 auto' }}>
                <button onClick={()=>setJeu(null)} style={{ marginBottom:16, background:'none', border:'none', color:couleurTheme, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>← Retour aux jeux</button>
                {dialogueFini ? (
                  <div style={{ textAlign:'center', padding:'40px', background:'#fff', borderRadius:20, border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:56, marginBottom:12 }}>{dialogueScore>=2?'🎉':'💪'}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:COULEURS.navy, marginBottom:8 }}>{dialogueScore}/{DIALOGUE_DATA.length} dialogues réussis</div>
                    {tentativesJeu.dialogue < (jeuxMaxTentatives.dialogue || 2)
                      ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {tentativesJeu.dialogue===0?'Un réessai autorisé !':'Dernière tentative !'}</div>
                      : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{dialogueScore}/{DIALOGUE_DATA.length}</strong></div>
                    }
                    <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                      {tentativesJeu.dialogue < (jeuxMaxTentatives.dialogue || 2) && <button onClick={()=>{ setTentativesJeu(p=>({...p,dialogue:p.dialogue+1})); setDialogueIdx(0); setDialogueEtape(0); setDialogueScore(0); setDialogueFini(false); }} style={S.btn('#EC4899')}>🔄 Rejouer</button>}
                      <button onClick={()=>setJeu(null)} style={S.btnGhost}>Changer de jeu</button>
                    </div>
                  </div>
                ) : (() => {
                  const dial = DIALOGUE_DATA[dialogueIdx];
                  return (
                    <div>
                      <div style={{ background:'#FDF2F8', borderRadius:12, padding:'10px 16px', marginBottom:16, display:'flex', justifyContent:'space-between' }}>
                        <span style={{ fontWeight:700, color:'#EC4899' }}>{dial.situation}</span>
                        <span style={{ fontSize:12, color:COULEURS.gris400 }}>Dialogue {dialogueIdx+1}/{DIALOGUE_DATA.length}</span>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
                        {dial.repliques.slice(0, dialogueEtape+1).map((r,i) => {
                          const estToi = r.loc==='Toi';
                          const estChoix = estToi && i===dialogueEtape;
                          return (
                            <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:estToi?'flex-end':'flex-start', gap:4 }}>
                              <span style={{ fontSize:11, color:COULEURS.gris400, marginX:8 }}>{r.loc}</span>
                              {estChoix ? (
                                <div style={{ display:'flex', flexDirection:'column', gap:8, width:'100%' }}>
                                  {r.options.map((opt,j)=>(
                                    <button key={j} onClick={()=>{ const ok=j===r.correct; if(ok&&i===dial.repliques.length-1){ setDialogueScore(s=>s+1); if(dialogueIdx<DIALOGUE_DATA.length-1){setDialogueIdx(d=>d+1);setDialogueEtape(0);}else{setDialogueFini(true);setTentativesJeu(p=>({...p,dialogue:p.dialogue+1}));} } else if(ok){ setDialogueEtape(e=>e+2); } }}
                                      style={{ padding:'10px 14px', borderRadius:12, border:`2px solid #F9A8D4`, background:'#FDF2F8', color:'#9D174D', fontSize:13, fontWeight:600, cursor:'pointer', textAlign:'left', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>💬 {opt}</button>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ maxWidth:'75%', background:estToi?'#FDF2F8':'#F8FAFC', borderRadius:14, padding:'10px 14px', fontSize:13, color:COULEURS.navy, border:`1px solid ${estToi?'#F9A8D4':COULEURS.gris200}` }}>
                                  {r.texte || r.options[r.correct]}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

            ) : jeu === 'flashcards' ? (
              /* ── FLASHCARDS ── */
              <div style={{ maxWidth:520, margin:'0 auto' }}>
                <button onClick={()=>setJeu(null)} style={{ marginBottom:16, background:'none', border:'none', color:couleurTheme, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>← Retour aux jeux</button>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16, alignItems:'center' }}>
                  <span style={{ fontSize:13, color:COULEURS.gris400 }}>Carte {flashIdx+1}/{FLASHCARDS_DATA.length}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:'#6366F1' }}>✓ Sus : {flashSus.length}</span>
                </div>
                <div style={{ height:5, background:COULEURS.gris100, borderRadius:3, marginBottom:24, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${((flashIdx)/FLASHCARDS_DATA.length)*100}%`, background:'#6366F1', borderRadius:3 }} />
                </div>
                {/* Carte à retourner */}
                <div onClick={()=>setFlashRetourne(p=>!p)} style={{ background:flashRetourne?'#EEF2FF':'#fff', borderRadius:20, padding:'40px 28px', textAlign:'center', cursor:'pointer', border:`2px solid ${flashRetourne?'#818CF8':'#6366F130'}`, boxShadow:'0 8px 24px rgba(99,102,241,0.15)', minHeight:180, display:'flex', flexDirection:'column', justifyContent:'center', transition:'background 0.3s', marginBottom:20 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#818CF8', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.08em' }}>
                    {flashRetourne ? '🇫🇷 Traduction & note' : '🇬🇧 Terme anglais - clique pour retourner'}
                  </div>
                  <div style={{ fontSize:flashRetourne?18:26, fontWeight:800, color:flashRetourne?'#4F46E5':COULEURS.navy, whiteSpace:'pre-line', lineHeight:1.5 }}>
                    {flashRetourne ? FLASHCARDS_DATA[flashIdx].verso : FLASHCARDS_DATA[flashIdx].recto}
                  </div>
                  <div style={{ fontSize:11, color:'#A5B4FC', marginTop:10 }}>{FLASHCARDS_DATA[flashIdx].categorie}</div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <button onClick={()=>{ setFlashRetourne(false); if(flashIdx<FLASHCARDS_DATA.length-1) setFlashIdx(i=>i+1); }} style={{ padding:'12px', borderRadius:10, border:'1.5px solid #FECACA', background:'#FEF2F2', color:'#991B1B', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>❌ À revoir</button>
                  <button onClick={()=>{ setFlashSus(p=>[...p,flashIdx]); setFlashRetourne(false); if(flashIdx<FLASHCARDS_DATA.length-1) setFlashIdx(i=>i+1); }} style={{ padding:'12px', borderRadius:10, border:'1.5px solid #6EE7B7', background:'#DCFCE7', color:'#065F46', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>✅ Je sais !</button>
                </div>
                {flashIdx === FLASHCARDS_DATA.length-1 && (
                  <div style={{ marginTop:16, textAlign:'center' }}>
                    <div style={{ fontSize:22, fontWeight:900, color:COULEURS.navy, marginBottom:8 }}>🎴 {flashSus.length}/{FLASHCARDS_DATA.length} cartes maîtrisées !</div>
                    <button onClick={()=>{ setFlashIdx(0); setFlashRetourne(false); setFlashSus([]); }} style={S.btn('#6366F1')}>🔄 Recommencer</button>
                  </div>
                )}
              </div>

            ) : jeu === 'conjugaison' ? (
              /* ── CONJUGAISON EXPRESS ── */
              <div style={{ maxWidth:520, margin:'0 auto' }}>
                <button onClick={()=>setJeu(null)} style={{ marginBottom:16, background:'none', border:'none', color:couleurTheme, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>← Retour aux jeux</button>
                {conjFini ? (
                  <div style={{ textAlign:'center', padding:'40px', background:'#fff', borderRadius:20, border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:56, marginBottom:12 }}>{conjScore>=8?'🏆':conjScore>=5?'👍':'💪'}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:COULEURS.navy, marginBottom:8 }}>{conjScore}/{CONJUGAISON_DATA.length} formes correctes</div>
                    {tentativesJeu.conjugaison < (jeuxMaxTentatives.conjugaison || 2)
                      ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {tentativesJeu.conjugaison===0?'Un réessai autorisé !':'Dernière tentative !'}</div>
                      : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{conjScore}/{CONJUGAISON_DATA.length}</strong></div>
                    }
                    <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                      {tentativesJeu.conjugaison < (jeuxMaxTentatives.conjugaison || 2) && <button onClick={()=>{ setTentativesJeu(p=>({...p,conjugaison:p.conjugaison+1})); setConjIdx(0); setConjInput(''); setConjScore(0); setConjFini(false); setConjMontre(false); }} style={S.btn('#7C3AED')}>🔄 Rejouer</button>}
                      <button onClick={()=>setJeu(null)} style={S.btnGhost}>Changer de jeu</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16, fontSize:12, color:COULEURS.gris400 }}>
                      <span>Verbe {conjIdx+1}/{CONJUGAISON_DATA.length}</span>
                      <span style={{ fontWeight:700, color:'#7C3AED' }}>{conjScore} ✓</span>
                    </div>
                    <div style={{ height:5, background:COULEURS.gris100, borderRadius:3, marginBottom:24, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${(conjIdx/CONJUGAISON_DATA.length)*100}%`, background:'#7C3AED', borderRadius:3 }} />
                    </div>
                    <div style={{ textAlign:'center', fontSize:12, color:COULEURS.gris400, marginBottom:6 }}>{CONJUGAISON_DATA[conjIdx].indice}</div>
                    <div style={{ textAlign:'center', marginBottom:6 }}>
                      <span style={{ fontSize:32, fontWeight:900, color:'#7C3AED' }}>to {CONJUGAISON_DATA[conjIdx].infinitif}</span>
                    </div>
                    <div style={{ textAlign:'center', fontSize:14, color:COULEURS.gris600, marginBottom:24 }}>{CONJUGAISON_DATA[conjIdx].temps} (I ___)</div>
                    <input value={conjInput} onChange={e=>setConjInput(e.target.value.toLowerCase())} onKeyDown={e=>e.key==='Enter'&&conjInput.trim()&&!conjMontre&&(()=>{ const ok=conjInput.trim()===CONJUGAISON_DATA[conjIdx].correct; if(ok)setConjScore(s=>s+1); setConjMontre(true); setTimeout(()=>{ if(conjIdx<CONJUGAISON_DATA.length-1){setConjIdx(i=>i+1);setConjInput('');setConjMontre(false);}else{setConjFini(true);setTentativesJeu(p=>({...p,conjugaison:p.conjugaison+1}));} },1000); })()} placeholder="Tapez la forme conjuguée..." style={{ width:'100%', padding:'14px', borderRadius:10, border:`2px solid #7C3AED`, fontSize:18, fontWeight:700, textAlign:'center', fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', boxSizing:'border-box', marginBottom:10 }} />
                    {conjMontre && <div style={{ textAlign:'center', fontSize:15, fontWeight:700, color:conjInput===CONJUGAISON_DATA[conjIdx].correct?COULEURS.succes:'#EF4444', marginBottom:10 }}>{conjInput===CONJUGAISON_DATA[conjIdx].correct?`✅ Correct !`:`❌ Réponse : ${CONJUGAISON_DATA[conjIdx].correct}`}</div>}
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={()=>{ setConjMontre(true); setTimeout(()=>{ if(conjIdx<CONJUGAISON_DATA.length-1){setConjIdx(i=>i+1);setConjInput('');setConjMontre(false);}else{setConjFini(true);setTentativesJeu(p=>({...p,conjugaison:p.conjugaison+1}));} },1200); }} style={{ flex:1, padding:'10px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>💡 Voir la réponse</button>
                      <button disabled={!conjInput.trim()||conjMontre} onClick={()=>{ const ok=conjInput.trim()===CONJUGAISON_DATA[conjIdx].correct; if(ok)setConjScore(s=>s+1); setConjMontre(true); setTimeout(()=>{ if(conjIdx<CONJUGAISON_DATA.length-1){setConjIdx(i=>i+1);setConjInput('');setConjMontre(false);}else{setConjFini(true);setTentativesJeu(p=>({...p,conjugaison:p.conjugaison+1}));} },1000); }} style={{ flex:1, ...S.btn('#7C3AED'), opacity:(!conjInput.trim()||conjMontre)?0.5:1, cursor:(!conjInput.trim()||conjMontre)?'not-allowed':'pointer' }}>Valider ✓</button>
                    </div>
                  </div>
                )}
              </div>

            ) : jeu === 'cecr' ? (
              /* ── DÉFI CECR ── */
              <div style={{ maxWidth:580, margin:'0 auto' }}>
                <button onClick={()=>setJeu(null)} style={{ marginBottom:16, background:'none', border:'none', color:couleurTheme, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>← Retour aux jeux</button>
                {cecrFini ? (
                  <div style={{ textAlign:'center', padding:'40px', background:'#fff', borderRadius:20, border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:56, marginBottom:12 }}>{cecrScore>=8?'🏆':cecrScore>=5?'🎉':'💪'}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:COULEURS.navy, marginBottom:8 }}>{cecrScore}/{CECR_DATA.length} bonnes réponses</div>
                    {tentativesJeu.cecr < (jeuxMaxTentatives.cecr || 2)
                      ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {tentativesJeu.cecr===0?'Un réessai autorisé !':'Dernière tentative !'}</div>
                      : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{cecrScore}/{CECR_DATA.length}</strong></div>
                    }
                    <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                      {tentativesJeu.cecr < (jeuxMaxTentatives.cecr || 2) && <button onClick={()=>{ setTentativesJeu(p=>({...p,cecr:p.cecr+1})); setCecrIdx(0); setCecrScore(0); setCecrFini(false); setCecrChoix(null); }} style={S.btn('#F59E0B')}>🔄 Rejouer</button>}
                      <button onClick={()=>setJeu(null)} style={S.btnGhost}>Changer de jeu</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
                      <span style={{ padding:'3px 10px', borderRadius:20, background:'#FEF3C7', color:'#92400E', fontSize:11, fontWeight:800 }}>Niveau {CECR_DATA[cecrIdx].niveau}</span>
                      <span style={{ fontSize:12, color:COULEURS.gris400 }}>{cecrIdx+1}/{CECR_DATA.length} - {cecrScore} ✓</span>
                    </div>
                    <div style={{ height:5, background:COULEURS.gris100, borderRadius:3, marginBottom:20, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${(cecrIdx/CECR_DATA.length)*100}%`, background:'#F59E0B', borderRadius:3 }} />
                    </div>
                    <div style={{ fontSize:17, fontWeight:700, color:COULEURS.navy, marginBottom:22, lineHeight:1.4 }}>{CECR_DATA[cecrIdx].q}</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {CECR_DATA[cecrIdx].options.map(opt=>{
                        const selec=cecrChoix===opt;
                        const correct=opt===CECR_DATA[cecrIdx].correct;
                        let bg='#F8FAFC', bord=COULEURS.gris200, txt=COULEURS.navy;
                        if(cecrChoix!==null){ if(correct){bg='#DCFCE7';bord='#6EE7B7';txt='#065F46';} else if(selec){bg='#FEE2E2';bord='#FECACA';txt='#991B1B';} }
                        return (
                          <button key={opt} disabled={cecrChoix!==null} onClick={()=>{ setCecrChoix(opt); if(opt===CECR_DATA[cecrIdx].correct) setCecrScore(s=>s+1); setTimeout(()=>{ setCecrChoix(null); if(cecrIdx<CECR_DATA.length-1) setCecrIdx(i=>i+1); else{setCecrFini(true);setTentativesJeu(p=>({...p,cecr:p.cecr+1}));} },900); }}
                            style={{ padding:'13px 16px', borderRadius:12, border:`2px solid ${bord}`, background:bg, color:txt, fontSize:13, fontWeight:600, cursor:cecrChoix?'default':'pointer', textAlign:'left', fontFamily:'"Plus Jakarta Sans",sans-serif', transition:'all 0.15s' }}>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

            ) : jeu === 'dictee' ? (
              /* ── DICTÉE ÉCLAIR ── */
              <div style={{ maxWidth:520, margin:'0 auto' }}>
                <button onClick={()=>setJeu(null)} style={{ marginBottom:16, background:'none', border:'none', color:couleurTheme, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>← Retour aux jeux</button>
                {dicteeFini ? (
                  <div style={{ textAlign:'center', padding:'40px', background:'#fff', borderRadius:20, border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:56, marginBottom:12 }}>{dicteeScore>=8?'🏆':dicteeScore>=5?'👍':'💪'}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:COULEURS.navy, marginBottom:8 }}>{dicteeScore}/{DICTEE_DATA.length} mots corrects</div>
                    {tentativesJeu.dictee < (jeuxMaxTentatives.dictee || 2)
                      ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {tentativesJeu.dictee===0?'Un réessai autorisé !':'Dernière tentative !'}</div>
                      : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{dicteeScore}/{DICTEE_DATA.length}</strong></div>
                    }
                    <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                      {tentativesJeu.dictee < (jeuxMaxTentatives.dictee || 2) && <button onClick={()=>{ setTentativesJeu(p=>({...p,dictee:p.dictee+1})); setDicteeIdx(0); setDicteeInput(''); setDicteeScore(0); setDicteeFini(false); setDicteeMontre(false); }} style={S.btn('#14B8A6')}>🔄 Rejouer</button>}
                      <button onClick={()=>setJeu(null)} style={S.btnGhost}>Changer de jeu</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16, fontSize:12, color:COULEURS.gris400 }}>
                      <span>Mot {dicteeIdx+1}/{DICTEE_DATA.length}</span>
                      <span style={{ fontWeight:700, color:'#14B8A6' }}>{dicteeScore} ✓</span>
                    </div>
                    <div style={{ height:5, background:COULEURS.gris100, borderRadius:3, marginBottom:24, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${(dicteeIdx/DICTEE_DATA.length)*100}%`, background:'#14B8A6', borderRadius:3 }} />
                    </div>
                    <div style={{ textAlign:'center', background:'#F0FDFA', borderRadius:14, padding:'24px', marginBottom:24 }}>
                      <div style={{ fontSize:11, color:'#0D9488', fontWeight:700, marginBottom:8, textTransform:'uppercase' }}>Indice</div>
                      <div style={{ fontSize:18, fontWeight:700, color:COULEURS.navy }}>{DICTEE_DATA[dicteeIdx].indice}</div>
                    </div>
                    <input value={dicteeInput} onChange={e=>setDicteeInput(e.target.value.toLowerCase())} onKeyDown={e=>e.key==='Enter'&&dicteeInput.trim()&&!dicteeMontre&&(()=>{ const ok=dicteeInput.trim()===DICTEE_DATA[dicteeIdx].mot; if(ok)setDicteeScore(s=>s+1); setDicteeMontre(true); setTimeout(()=>{ if(dicteeIdx<DICTEE_DATA.length-1){setDicteeIdx(i=>i+1);setDicteeInput('');setDicteeMontre(false);}else{setDicteeFini(true);setTentativesJeu(p=>({...p,dictee:p.dictee+1}));} },1000); })()} placeholder="Écris le mot en anglais..." style={{ width:'100%', padding:'14px', borderRadius:10, border:`2px solid #14B8A6`, fontSize:16, fontWeight:700, textAlign:'center', fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', boxSizing:'border-box', marginBottom:10 }} />
                    {dicteeMontre && <div style={{ textAlign:'center', fontSize:15, fontWeight:700, color:dicteeInput===DICTEE_DATA[dicteeIdx].mot?COULEURS.succes:'#EF4444', marginBottom:10 }}>{dicteeInput===DICTEE_DATA[dicteeIdx].mot?'✅ Parfait !':'❌ Réponse : '+DICTEE_DATA[dicteeIdx].mot}</div>}
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={()=>{ setDicteeMontre(true); setTimeout(()=>{ if(dicteeIdx<DICTEE_DATA.length-1){setDicteeIdx(i=>i+1);setDicteeInput('');setDicteeMontre(false);}else{setDicteeFini(true);setTentativesJeu(p=>({...p,dictee:p.dictee+1}));} },1200); }} style={{ flex:1, padding:'10px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>💡 Voir la réponse</button>
                      <button disabled={!dicteeInput.trim()||dicteeMontre} onClick={()=>{ const ok=dicteeInput.trim()===DICTEE_DATA[dicteeIdx].mot; if(ok)setDicteeScore(s=>s+1); setDicteeMontre(true); setTimeout(()=>{ if(dicteeIdx<DICTEE_DATA.length-1){setDicteeIdx(i=>i+1);setDicteeInput('');setDicteeMontre(false);}else{setDicteeFini(true);setTentativesJeu(p=>({...p,dictee:p.dictee+1}));} },1000); }} style={{ flex:1, ...S.btn('#14B8A6'), opacity:(!dicteeInput.trim()||dicteeMontre)?0.5:1, cursor:(!dicteeInput.trim()||dicteeMontre)?'not-allowed':'pointer' }}>Valider ✓</button>
                    </div>
                  </div>
                )}
              </div>

            ) : jeu === 'traduction' ? (
              /* ── TRADUCTION INVERSE ── */
              <div style={{ maxWidth:520, margin:'0 auto' }}>
                <button onClick={()=>setJeu(null)} style={{ marginBottom:16, background:'none', border:'none', color:couleurTheme, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>← Retour aux jeux</button>
                {traFini ? (
                  <div style={{ textAlign:'center', padding:'40px', background:'#fff', borderRadius:20, border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:56, marginBottom:12 }}>{traScore>=8?'🏆':traScore>=5?'👍':'💪'}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:COULEURS.navy, marginBottom:8 }}>{traScore}/{TRADUCTION_DATA.length} traductions correctes</div>
                    {tentativesJeu.traduction < (jeuxMaxTentatives.traduction || 2)
                      ? <div style={{ padding:'8px 16px', borderRadius:8, background:'#FFF7ED', border:'1px solid #FED7AA', color:'#92400E', fontSize:12, fontWeight:600, marginBottom:16 }}>💡 {tentativesJeu.traduction===0?'Un réessai autorisé !':'Dernière tentative !'}</div>
                      : <div style={{ padding:'8px 16px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', fontSize:12, fontWeight:600, marginBottom:16 }}>🔒 Score final : <strong>{traScore}/{TRADUCTION_DATA.length}</strong></div>
                    }
                    <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                      {tentativesJeu.traduction < (jeuxMaxTentatives.traduction || 2) && <button onClick={()=>{ setTentativesJeu(p=>({...p,traduction:p.traduction+1})); setTraIdx(0); setTraInput(''); setTraScore(0); setTraFini(false); setTraMontre(false); }} style={S.btn('#059669')}>🔄 Rejouer</button>}
                      <button onClick={()=>setJeu(null)} style={S.btnGhost}>Changer de jeu</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16, fontSize:12, color:COULEURS.gris400 }}>
                      <span>Mot {traIdx+1}/{TRADUCTION_DATA.length}</span>
                      <span style={{ fontWeight:700, color:'#059669' }}>{traScore} ✓</span>
                    </div>
                    <div style={{ height:5, background:COULEURS.gris100, borderRadius:3, marginBottom:24, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${(traIdx/TRADUCTION_DATA.length)*100}%`, background:'#059669', borderRadius:3 }} />
                    </div>
                    <div style={{ textAlign:'center', fontSize:12, color:COULEURS.gris400, marginBottom:6 }}>Traduis en anglais :</div>
                    <div style={{ textAlign:'center', fontSize:32, fontWeight:900, color:'#059669', marginBottom:24 }}>{TRADUCTION_DATA[traIdx].fr}</div>
                    <input value={traInput} onChange={e=>setTraInput(e.target.value.toLowerCase())} onKeyDown={e=>e.key==='Enter'&&traInput.trim()&&!traMontre&&(()=>{ const ok=traInput.trim()===TRADUCTION_DATA[traIdx].mot; if(ok)setTraScore(s=>s+1); setTraMontre(true); setTimeout(()=>{ if(traIdx<TRADUCTION_DATA.length-1){setTraIdx(i=>i+1);setTraInput('');setTraMontre(false);}else{setTraFini(true);setTentativesJeu(p=>({...p,traduction:p.traduction+1}));} },1000); })()} placeholder="Type the English word..." style={{ width:'100%', padding:'14px', borderRadius:10, border:'2px solid #059669', fontSize:18, fontWeight:700, textAlign:'center', fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', boxSizing:'border-box', marginBottom:10 }} />
                    {traMontre && <div style={{ textAlign:'center', fontSize:15, fontWeight:700, color:traInput===TRADUCTION_DATA[traIdx].mot?COULEURS.succes:'#EF4444', marginBottom:10 }}>{traInput===TRADUCTION_DATA[traIdx].mot?'✅ Correct !':`❌ Réponse : ${TRADUCTION_DATA[traIdx].mot}`}</div>}
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={()=>{ setTraMontre(true); setTimeout(()=>{ if(traIdx<TRADUCTION_DATA.length-1){setTraIdx(i=>i+1);setTraInput('');setTraMontre(false);}else{setTraFini(true);setTentativesJeu(p=>({...p,traduction:p.traduction+1}));} },1200); }} style={{ flex:1, padding:'10px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>💡 Voir la réponse</button>
                      <button disabled={!traInput.trim()||traMontre} onClick={()=>{ const ok=traInput.trim()===TRADUCTION_DATA[traIdx].mot; if(ok)setTraScore(s=>s+1); setTraMontre(true); setTimeout(()=>{ if(traIdx<TRADUCTION_DATA.length-1){setTraIdx(i=>i+1);setTraInput('');setTraMontre(false);}else{setTraFini(true);setTentativesJeu(p=>({...p,traduction:p.traduction+1}));} },1000); }} style={{ flex:1, ...S.btn('#059669'), opacity:(!traInput.trim()||traMontre)?0.5:1, cursor:(!traInput.trim()||traMontre)?'not-allowed':'pointer' }}>Valider ✓</button>
                    </div>
                  </div>
                )}
              </div>

            ) : jeu === 'mots_croises' ? (
              /* ── MOTS CROISÉS ── */
              <div style={{ maxWidth:560, margin:'0 auto' }}>
                <button onClick={()=>setJeu(null)} style={{ marginBottom:16, background:'none', border:'none', color:couleurTheme, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>← Retour aux jeux</button>
                {crossFini ? (
                  <div style={{ textAlign:'center', padding:'40px', background:'#fff', borderRadius:20, border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:56, marginBottom:12 }}>{crossValide?.score>=3?'🏆':crossValide?.score>=2?'👍':'💪'}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:COULEURS.navy, marginBottom:8 }}>{crossValide?.score}/{CROSSWORD.mots.length} mots corrects</div>
                    <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                      <button onClick={()=>{ setTentativesJeu(p=>({...p,mots_croises:p.mots_croises+1})); setCrossInputs({}); setCrossValide(null); setCrossFini(false); }} style={S.btn('#D97706')}>🔄 Rejouer</button>
                      <button onClick={()=>setJeu(null)} style={S.btnGhost}>Changer de jeu</button>
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
                                style={{ width:34, height:34, textAlign:'center', fontSize:16, fontWeight:800, borderRadius:4, border:'2px solid #D97706', textTransform:'uppercase', outline:'none', fontFamily:'"Plus Jakarta Sans",sans-serif' }} />
                            </div>
                          );
                        })
                      ))}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
                      {CROSSWORD.mots.map(m => (
                        <div key={m.id} style={{ fontSize:12, color:COULEURS.gris600 }}><strong>{m.numero}.</strong> {m.dir==='h'?'Horizontal':'Vertical'} - {m.indice}</div>
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
                    }} style={{ width:'100%', ...S.btn('#D97706') }}>Vérifier la grille ✓</button>
                  </div>
                )}
              </div>

            ) : jeu === 'mots_caches' ? (
              /* ── MOTS CACHÉS ── */
              <div style={{ maxWidth:520, margin:'0 auto' }}>
                <button onClick={()=>setJeu(null)} style={{ marginBottom:16, background:'none', border:'none', color:couleurTheme, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>← Retour aux jeux</button>
                {wsFini ? (
                  <div style={{ textAlign:'center', padding:'40px', background:'#fff', borderRadius:20, border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:56, marginBottom:12 }}>{wsTrouves.length>=WORDSEARCH_MOTS_POS.length?'🏆':wsTrouves.length>=3?'👍':'💪'}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:COULEURS.navy, marginBottom:8 }}>{wsTrouves.length}/{WORDSEARCH_MOTS_POS.length} mots trouvés</div>
                    <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                      <button onClick={()=>{ setTentativesJeu(p=>({...p,mots_caches:p.mots_caches+1})); setWsGrille(construireGrilleMotsCaches()); setWsDebut(null); setWsTrouves([]); setWsCellsTrouvees([]); setWsFini(false); }} style={S.btn('#4338CA')}>🔄 Rejouer</button>
                      <button onClick={()=>setJeu(null)} style={S.btnGhost}>Changer de jeu</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ background:'#fff', borderRadius:20, padding:'24px', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14, fontSize:12, color:COULEURS.gris400 }}>
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
                                if (nvlTrouves.length === WORDSEARCH_MOTS_POS.length) { setWsFini(true); setTentativesJeu(p=>({...p,mots_caches:p.mots_caches+1})); }
                              }
                            }
                            setWsDebut(null);
                          }} style={{ width:32, height:32, borderRadius:4, border:`2px solid ${trouve?'#6EE7B7':selec?'#4338CA':COULEURS.gris200}`, background:trouve?'#DCFCE7':selec?'#EEF2FF':'#fff', color:trouve?'#065F46':COULEURS.navy, fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>{lettre}</button>
                        );
                      }))}
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
                      {WORDSEARCH_MOTS_POS.map(m => (
                        <span key={m.mot} style={{ padding:'4px 10px', borderRadius:20, fontSize:12, fontWeight:700, background:wsTrouves.includes(m.mot)?'#DCFCE7':COULEURS.gris100, color:wsTrouves.includes(m.mot)?'#065F46':COULEURS.gris600, textDecoration:wsTrouves.includes(m.mot)?'line-through':'none' }}>{m.mot}</span>
                      ))}
                    </div>
                    <button onClick={()=>{ setTentativesJeu(p=>({...p,mots_caches:p.mots_caches+1})); setWsFini(true); }} style={S.btnGhost}>Terminer</button>
                  </div>
                )}
              </div>

            ) : null}
                  </div>
                </div>
              )}
              </>
            )}
          </div>
        )}

        {/* ══ CLASSEMENT ══ */}
        {/* ══ DICTIONNAIRE ANG / FR ══ */}
        {section === 'dictionnaire' && <SectionDictionnaire S={S} COULEURS={COULEURS} />}

        {section === 'classement' && (
          <div>
            <div style={S.titre}>🏆 Classement de la classe</div>
            <div style={{ background:`linear-gradient(135deg, #F59E0B, #F97316)`, borderRadius:16, padding:'20px 24px', marginBottom:24, color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginBottom:4 }}>Tes points</div>
                <div style={{ fontSize:36, fontWeight:900 }}>{gamifPoints} ⭐</div>
              </div>
              <div style={{ fontSize:52 }}>🏆</div>
            </div>
            {gamifClassement.length > 0 ? (
              <div style={{ background:'#fff', borderRadius:14, border:`1px solid ${COULEURS.gris200}`, overflow:'hidden' }}>
                {gamifClassement.map(r => {
                  const moi = r.id === apprenant.profile_id;
                  const medaille = r.rang === 1 ? '🥇' : r.rang === 2 ? '🥈' : r.rang === 3 ? '🥉' : null;
                  return (
                    <div key={r.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px', borderBottom:`1px solid ${COULEURS.gris100}`, background: moi ? '#FFF7ED' : 'transparent' }}>
                      <div style={{ width:32, textAlign:'center', fontSize: medaille ? 20 : 14, fontWeight:800, color: COULEURS.gris600 }}>{medaille || r.rang}</div>
                      <div style={{ flex:1, fontSize:13, fontWeight: moi ? 800 : 600, color: moi ? '#C2410C' : COULEURS.navy }}>{r.nom_complet}{moi ? ' (toi)' : ''}</div>
                      <div style={{ fontSize:14, fontWeight:800, color:'#F97316' }}>{r.points} ⭐</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={S.vide}>
                <div style={{ fontSize:40, marginBottom:12 }}>🏆</div>
                <div style={{ fontWeight:600 }}>Classement en cours de construction</div>
                <div style={{ marginTop:6, fontSize:12 }}>Le classement sera disponible dès que plusieurs apprenants de votre classe auront participé aux sessions.</div>
              </div>
            )}
            <div style={{ textAlign:'center', fontSize:12, color:COULEURS.gris400, marginTop:8 }}>
              ⭐ Gagnez des points en assistant aux sessions, rendant vos devoirs et obtenant des badges.
            </div>
          </div>
        )}

        {/* ══ PRÉSENCES ══ */}
        {section === 'presences' && (() => {
          const total    = presencesApp.length;
          const presents = presencesApp.filter(p => p.statut === 'present').length;
          const absents  = presencesApp.filter(p => p.statut === 'absent').length;
          const retards  = presencesApp.filter(p => p.statut === 'retard').length;
          const taux     = total > 0 ? Math.round((presents / total) * 100) : null;

          const presencesFiltrees = presencesApp
            .filter(p => !presDateDebut || (p.date && p.date >= presDateDebut))
            .filter(p => !presDateFin   || (p.date && p.date <= presDateFin))
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

          const PAR_PAGE = 10;
          const nbPages     = Math.max(1, Math.ceil(presencesFiltrees.length / PAR_PAGE));
          const pageActuelle = Math.min(presPage, nbPages);
          const presencesPage = presencesFiltrees.slice((pageActuelle - 1) * PAR_PAGE, pageActuelle * PAR_PAGE);

          return (
            <div>
              <div style={S.titre}>✅ Mes présences</div>

              {/* Stats rapides */}
              <div style={S.grille('repeat(auto-fit,minmax(140px,1fr))')}>
                {[
                  { val: total,    lbl: 'Sessions notées', fond: '#EFF6FF', txt: '#1D4ED8' },
                  { val: presents, lbl: 'Présent(s)',       fond: '#F0FDF4', txt: '#15803D' },
                  { val: absents,  lbl: 'Absent(s)',        fond: '#FEF2F2', txt: '#B91C1C' },
                  { val: retards,  lbl: 'Retard(s)',        fond: '#FFFBEB', txt: '#B45309' },
                  { val: taux !== null ? `${taux}%` : '-', lbl: 'Taux présence', fond: taux !== null && taux >= 75 ? '#F0FDF4' : '#FEF9C3', txt: taux !== null && taux >= 75 ? '#15803D' : '#92400E' },
                ].map(k => (
                  <div key={k.lbl} style={{ ...S.carte(couleurTheme), background: k.fond, borderTop: 'none', textAlign: 'center', padding: '16px 12px' }}>
                    <div style={{ fontSize: 26, fontWeight: 900, color: k.txt }}>{k.val}</div>
                    <div style={{ fontSize: 11, color: k.txt, opacity: 0.75, marginTop: 4 }}>{k.lbl}</div>
                  </div>
                ))}
              </div>

              {/* Filtrage par date */}
              {total > 0 && (
                <div style={{ display:'flex', alignItems:'flex-end', gap:14, flexWrap:'wrap', marginBottom:20 }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, marginBottom:4 }}>Du</div>
                    <input
                      type="date"
                      value={presDateDebut}
                      onChange={e => { setPresDateDebut(e.target.value); setPresPage(1); }}
                      style={{ padding:'8px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none' }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, marginBottom:4 }}>Au</div>
                    <input
                      type="date"
                      value={presDateFin}
                      onChange={e => { setPresDateFin(e.target.value); setPresPage(1); }}
                      style={{ padding:'8px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none' }}
                    />
                  </div>
                  {(presDateDebut || presDateFin) && (
                    <button
                      onClick={() => { setPresDateDebut(''); setPresDateFin(''); setPresPage(1); }}
                      style={{ ...S.btnGhost, padding:'8px 16px' }}
                    >✕ Réinitialiser</button>
                  )}
                  <div style={{ fontSize:12, color:COULEURS.gris400, marginLeft:'auto' }}>
                    {presencesFiltrees.length} session{presencesFiltrees.length !== 1 ? 's' : ''}
                  </div>
                </div>
              )}

              {/* Historique */}
              {total === 0 ? (
                <div style={S.vide}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
                  <div style={{ fontWeight: 600, color: COULEURS.navy, marginBottom: 6 }}>Aucune présence enregistrée</div>
                  <div>Vos présences apparaîtront ici après chaque session.</div>
                </div>
              ) : presencesFiltrees.length === 0 ? (
                <div style={S.vide}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
                  <div style={{ fontWeight: 600, color: COULEURS.navy, marginBottom: 6 }}>Aucune présence sur cette période</div>
                  <div>Essayez d'élargir la plage de dates.</div>
                </div>
              ) : (
                <>
                <div style={S.tableau}>
                  <div style={S.thead('2fr 1.2fr 1.2fr 1fr')}>
                    <span>Session</span><span>Date</span><span>Horaire</span><span>Statut</span>
                  </div>
                  {presencesPage.map(p => {
                    const seance = presencesReelles_app.find(r => r.id === p.id);
                    const titre  = seance?.seance?.objectifs_session || `Séance du ${p.date || '-'}`;
                    const date   = p.date ? new Date(p.date).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }) : '-';
                    const debut  = seance?.seance?.heure_debut || '';
                    const fin    = seance?.seance?.heure_fin   || '';
                    const horaire = debut ? `${debut}${fin ? ' – ' + fin : ''}` : '-';
                    const statutMap = { present: { lib: '✅ Présent', fond: '#D1FAE5', txt: '#065F46' }, absent: { lib: '❌ Absent', fond: '#FEE2E2', txt: '#991B1B' }, retard: { lib: '⏱ Retard', fond: '#FEF3C7', txt: '#92400E' } };
                    const s = statutMap[p.statut] || { lib: p.statut, fond: COULEURS.gris100, txt: COULEURS.gris600 };
                    return (
                      <div key={p.id} style={S.trow('2fr 1.2fr 1.2fr 1fr')}>
                        <span style={{ fontWeight: 600, color: COULEURS.navy, fontSize: 13 }}>{titre}</span>
                        <span style={{ fontSize: 12, color: COULEURS.gris600 }}>{date}</span>
                        <span style={{ fontSize: 12, color: COULEURS.gris600 }}>{horaire}</span>
                        <span style={{ display: 'inline-flex', padding: '3px 10px', borderRadius: 20, background: s.fond, color: s.txt, fontSize: 11, fontWeight: 700 }}>{s.lib}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {nbPages > 1 && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginTop:-10, marginBottom:24 }}>
                    <button
                      onClick={() => setPresPage(p => Math.max(1, p - 1))}
                      disabled={pageActuelle === 1}
                      style={{ ...S.btnGhost, padding:'6px 14px', opacity: pageActuelle === 1 ? 0.4 : 1, cursor: pageActuelle === 1 ? 'not-allowed' : 'pointer' }}
                    >← Précédent</button>
                    <span style={{ fontSize:12, color:COULEURS.gris600, fontWeight:600 }}>Page {pageActuelle} / {nbPages}</span>
                    <button
                      onClick={() => setPresPage(p => Math.min(nbPages, p + 1))}
                      disabled={pageActuelle === nbPages}
                      style={{ ...S.btnGhost, padding:'6px 14px', opacity: pageActuelle === nbPages ? 0.4 : 1, cursor: pageActuelle === nbPages ? 'not-allowed' : 'pointer' }}
                    >Suivant →</button>
                  </div>
                )}
                </>
              )}
            </div>
          );
        })()}

        {/* ══ MES COURS ══ */}
        {section === 'cours' && sectionBloquee && <BlocageMessage label="aux cours" />}
        {section === 'cours' && !sectionBloquee && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div style={S.titre}>📖 Mes cours</div>
              <input
                style={{ padding:'8px 14px', borderRadius:20, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', width:240 }}
                placeholder="🔍 Rechercher un cours…"
                value={rechercheCours}
                onChange={e => setRechercheCours(e.target.value)}
              />
            </div>

            {cours.length === 0 ? (
              <div style={S.vide}>
                <div style={{ fontSize:40, marginBottom:12 }}>📖</div>
                <div style={{ fontWeight:600, color:COULEURS.navy, marginBottom:6 }}>Aucun cours disponible pour le moment</div>
                <div>Votre coach publiera des cours prochainement.</div>
              </div>
            ) : (() => {
              const coursFiltres = cours.filter(c =>
                rechercheCours === '' || c.titre.toLowerCase().includes(rechercheCours.toLowerCase())
              );
              return coursFiltres.length === 0 ? (
                <div style={S.vide}>Aucun cours trouvé pour « {rechercheCours} »</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {coursFiltres.map(c => {
                    const blocs  = c.blocs || [];
                    const duree  = blocs.reduce((s, b) => s + (b.dureeMin || 0), 0);
                    const termine = terminesLive[c.id];
                    /* VERROUILLÉ : un cours publié après un cours obligatoire qui n'a pas
                       été terminé. On le laisse VISIBLE et grisé plutôt que de le cacher —
                       savoir qu'il existe et ce qui le retient, c'est précisément ce qui
                       pousse à finir le précédent. Le masquer donnerait l'impression que
                       le coach n'a rien publié. */
                    const ferme = c.verrouille && !termine;
                    const typeColors = {
                      lecon:    { bg:'#E0F2FE', accent:'#0891B2', icone:'📖' },
                      exercice: { bg:'#D1FAE5', accent:'#10B981', icone:'✏️' },
                      devoir:   { bg:'#FEF3C7', accent:'#F59E0B', icone:'📝' },
                      audio:    { bg:'#EDE9FE', accent:'#8B5CF6', icone:'🎵' },
                    };
                    const tc = typeColors[c.type_contenu] || typeColors.lecon;
                    return (
                      <div key={c.id} style={{ background: ferme ? '#FAFAFA' : '#fff', opacity: ferme ? 0.78 : 1, borderRadius:14, border:`1px solid ${ferme ? '#FDE68A' : termine ? '#6EE7B7' : COULEURS.gris200}`, borderLeft:`4px solid ${ferme ? '#F59E0B' : tc.accent}`, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                        <div style={{ width:48, height:48, borderRadius:12, background: ferme ? '#FEF3C7' : tc.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>{ferme ? '🔒' : tc.icone}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:4 }}>{c.titre}</div>
                          <div style={{ fontSize:12, color:COULEURS.gris600, marginBottom:4 }}>
                            {c.module && <span>{c.module} · </span>}Semaine {c.semaine}
                          </div>
                          <div style={{ display:'flex', gap:8, fontSize:11, color:COULEURS.gris400, flexWrap:'wrap', alignItems:'center' }}>
                            {duree > 0 && <span>⏱ {duree} min</span>}
                            <span>📦 {blocs.length} bloc{blocs.length > 1 ? 's' : ''}</span>
                            {termine && (
                              <span style={{ display:'inline-flex', alignItems:'center', gap:3, background:'#D1FAE5', color:'#065F46', borderRadius:20, padding:'2px 8px', fontWeight:700 }}>
                                ✅ Lu
                              </span>
                            )}
                            {/* Un cadenas sans raison est incompréhensible : on NOMME le
                                cours qui retient celui-ci, c'est la seule chose qui dit
                                quoi faire pour l'ouvrir. */}
                            {ferme && (
                              <span style={{ display:'inline-flex', alignItems:'center', gap:3, background:'#FEF3C7', color:'#92400E', borderRadius:20, padding:'2px 8px', fontWeight:700 }}>
                                🔒 {c.bloque_par?.titre ? `Terminez d'abord « ${c.bloque_par.titre} »` : 'Pas encore accessible'}
                              </span>
                            )}
                            {/* Prévenir AVANT : savoir que ce cours ouvre la suite change
                                la façon de le lire. */}
                            {!ferme && c.lecture_sequentielle && !termine && (
                              <span style={{ display:'inline-flex', alignItems:'center', gap:3, background:'#FFF7ED', color:'#9A3412', borderRadius:20, padding:'2px 8px', fontWeight:700 }}>
                                ⭐ À terminer pour débloquer la suite
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          disabled={ferme}
                          title={ferme && c.bloque_par?.titre ? `Terminez d'abord « ${c.bloque_par.titre} »` : undefined}
                          onClick={() => { if (!ferme) setCoursOuvertLive(c); }}
                          style={{ ...S.btn(tc.accent, true), background: ferme ? COULEURS.gris100 : termine ? COULEURS.gris200 : tc.accent, color: ferme ? COULEURS.gris400 : termine ? COULEURS.gris600 : '#fff', cursor: ferme ? 'not-allowed' : 'pointer' }}
                        >
                          {ferme ? '🔒 Verrouillé' : termine ? '🔄 Revoir' : '▶ Ouvrir'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ══ FICHIERS DU COURS ══ */}
        {section === 'fichiers' && (
          <div>
            <div style={{ fontSize:20, fontWeight:800, color:COULEURS.navy, marginBottom:4 }}>📂 Fichiers du cours</div>
            <div style={{ fontSize:13, color:COULEURS.gris400, marginBottom:24 }}>
              Ressources partagées par votre coach - niveau <strong>{apprenant?.niveau_cecr || '…'}</strong>.
            </div>

            {/* Filtres catégorie + recherche */}
            <div style={{ display:'flex', gap:6, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
              {CATS_FICHIERS.map(cat => {
                const actif = categorieFichier === cat.id;
                return (
                  <button key={cat.id} onClick={() => setCategorieFichier(cat.id)} style={{ padding:'6px 14px', borderRadius:16, border:`1.5px solid ${actif ? couleurTheme : COULEURS.gris200}`, background:actif ? couleurTheme : COULEURS.blanc, color:actif ? '#fff' : COULEURS.gris600, fontSize:12, fontWeight:actif ? 700 : 500, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                    {cat.icone} {cat.lib}
                  </button>
                );
              })}
              <input
                style={{ padding:'8px 14px', borderRadius:20, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', width:240 }}
                placeholder="🔍 Rechercher un fichier…"
                value={rechercheFichier}
                onChange={e => setRechercheFichier(e.target.value)}
              />
            </div>

            {/* Grille fichiers */}
            {(() => {
              const fichiersFiltres = fichiersReels_app.filter(f =>
                (categorieFichier === 'tous' || f.categorie === categorieFichier) &&
                (rechercheFichier === '' || f.nom.toLowerCase().includes(rechercheFichier.toLowerCase()))
              );
              if (fichiersReels_app.length === 0) return (
                <div style={S.vide}>
                  <div style={{ fontSize:40, marginBottom:12 }}>📂</div>
                  <div style={{ fontWeight:600, color:COULEURS.navy, marginBottom:6 }}>Aucun fichier disponible</div>
                  <div>Votre coach n'a pas encore partagé de fichiers.</div>
                </div>
              );
              if (fichiersFiltres.length === 0) return (
                <div style={S.vide}>Aucun fichier trouvé pour ce filtre.</div>
              );
              return (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14 }}>
                  {fichiersFiltres.map(f => {
                    const tko = f.taille_ko || 0;
                    const taille = tko > 1024 ? `${(tko/1024).toFixed(1)} Mo` : tko > 0 ? `${tko} Ko` : '-';
                    const coulCat = COULEUR_CAT_F[f.categorie] || '#64748B';
                    const libCat = CATS_FICHIERS.find(c => c.id === f.categorie)?.lib || f.categorie;
                    return (
                      <div key={f.id} style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
                        <div style={{ height:4, background:coulCat }} />
                        <div style={{ padding:'14px 16px' }}>
                          <div style={{ fontSize:28, marginBottom:8 }}>{iconeParExt(f.nom)}</div>
                          <div style={{ display:'inline-block', padding:'2px 8px', borderRadius:10, background:coulCat+'15', color:coulCat, fontSize:10, fontWeight:700, marginBottom:10 }}>{libCat}</div>
                          <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:4, lineHeight:1.4 }}>{f.nom}</div>
                          <div style={{ fontSize:11, color:COULEURS.gris400, marginBottom:10 }}>
                            {taille} · Partagé le {fmtDate(f.created_at)}
                          </div>
                          {f.url ? (
                            <a
                              href={urlTelecharger(f.url, f.nom)}
                              download={f.nom}
                              style={{ width:'100%', padding:'9px', borderRadius:8, background:couleurTheme, color:'#fff', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:6, textDecoration:'none', boxSizing:'border-box', fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                            >
                              ⬇ Télécharger
                            </a>
                          ) : (
                            <div style={{ width:'100%', padding:'9px', borderRadius:8, background:COULEURS.gris200, color:COULEURS.gris400, fontSize:13, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:6, boxSizing:'border-box' }}>
                              Non disponible
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* LES SEPT ÉCRANS DE PARITÉ avec l'espace apprenant de dash. Ils vivent dans
            `components/apprenant/SectionsApprenant.jsx` : ce fichier dépasse déjà
            5 000 lignes, et six cents de plus l'auraient rendu illisible. */}
        {section === 'mon_profil'  && <SectionMonProfil  couleur={couleurTheme} />}
        {section === 'planning'    && <SectionPlanning   couleur={couleurTheme} />}
        {section === 'objectifs'   && <SectionObjectifs  couleur={couleurTheme} />}
        {section === 'paiement'    && <SectionPaiement   couleur={couleurTheme} />}
        {section === 'boutique'    && <SectionBoutique   couleur={couleurTheme} />}
        {section === 'temoignage'  && <SectionTemoignage couleur={couleurTheme} profile={profile} />}
        {section === 'support'     && <SectionSupport    couleur={couleurTheme} />}

      </div>
    </TopNavLayout>

    {/* ── Modal Exercice ── */}
    {exerciceOuvert && (() => {
      const blocs    = exerciceOuvert.blocs || [];
      const dureeTotal = blocs.reduce((s, b) => s + (b.dureeMin || 0), 0);

      /* SEULES LES QUESTIONS À OPTIONS SONT NOTÉES. Une question ouverte n'a pas de
         bonne réponse — elle se prépare et se discute en classe —, donc elle ne peut
         être ni juste ni fausse. La compter dans le total la rendait automatiquement
         fausse : un bloc de cinq questions ouvertes affichait « 0/5 · 0% » et donnait à
         l'apprenant le sentiment d'avoir tout raté. */
      function scoreQuizBloc(bloc) {
        const notables = (bloc.questions || []).filter(q => (q.options || []).filter(Boolean).length > 0);
        const bonnes = notables.filter(q => exoReponses[`${bloc.id}_${q.id}`] === q.correct).length;
        return { bonnes, total: notables.length, pct: notables.length > 0 ? Math.round(bonnes / notables.length * 100) : 0 };
      }

      return (
        <>
          <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', zIndex:1000, backdropFilter:'blur(3px)' }} />
          {/* 836 px : les 760 d'origine élargis de 10%. Les blocs de cours portent des vidéos, des images et des tableaux de quiz qui se serraient dans le panneau ; le plafond à 92vw reste, pour que le panneau ne couvre jamais tout l'écran. */}
          <div style={{ position:'fixed', top:0, right:0, bottom:0, width:'min(92vw,870px)', background:'#fff', zIndex:1001, display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,0.2)', fontFamily:'"Plus Jakarta Sans",sans-serif', overflow:'hidden' }}>

            {/* Header */}
            <div style={{ background:'linear-gradient(135deg,#059669,#10B981)', padding:'20px 24px', flexShrink:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.65)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>
                    ✏️ Exercice · {exerciceOuvert.module} · Semaine {exerciceOuvert.semaine}
                  </div>
                  <div style={{ fontSize:18, fontWeight:800, color:'#fff', lineHeight:1.3, marginBottom:4 }}>{exerciceOuvert.titre}</div>
                  <div style={{ display:'flex', gap:14, fontSize:12, color:'rgba(255,255,255,0.75)' }}>
                    <span>⏱ {dureeTotal} min</span>
                    <span>📦 {blocs.length} bloc{blocs.length > 1 ? 's' : ''}</span>
                    {terminesLive[exerciceOuvert.id] && <span style={{ color:'#A7F3D0', fontWeight:700 }}>✅ Terminé</span>}
                  </div>
                </div>
                <button onClick={() => setExerciceOuvert(null)} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, width:34, height:34, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
              </div>
            </div>

            {/* Sommaire */}
            {blocs.length > 0 && (
              <div style={{ display:'flex', gap:6, padding:'10px 22px', background:'#F0FDF4', borderBottom:'1px solid #D1FAE5', flexWrap:'wrap', flexShrink:0 }}>
                {blocs.map((b, i) => {
                  const icon = { texte:'📝', exercice:'✏️', quiz:'🧩', video:'🎬', lien:'🔗', audio:'🎧', document:'📄' }[b.type] || '📦';
                  return (
                    <a key={b.id} href={`#exo-bloc-${b.id}`} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:20, background:'#D1FAE5', color:'#065F46', fontSize:11, fontWeight:700, textDecoration:'none', flexShrink:0 }}>
                      {icon} {i + 1}. {b.titre.length > 22 ? b.titre.slice(0, 22) + '…' : b.titre}
                    </a>
                  );
                })}
              </div>
            )}

            {/* Contenu */}
            <div style={{ flex:1, overflowY:'auto', padding:'22px' }}>
              {blocs.length === 0 && (
                <div style={{ textAlign:'center', padding:'60px 20px', color:COULEURS.gris400 }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>✏️</div>
                  <div style={{ fontWeight:600 }}>{exerciceOuvert.description || 'Exercice en cours de préparation.'}</div>
                </div>
              )}

              {blocs.map((b, bi) => {
                const couleurs = { texte:'#3B82F6', exercice:'#EC4899', quiz:'#F97316', video:'#8B5CF6', lien:'#06B6D4', audio:'#10B981', document:'#F59E0B' };
                const icons    = { texte:'📝', exercice:'✏️', quiz:'🧩', video:'🎬', lien:'🔗', audio:'🎧', document:'📄' };
                const labels   = { texte:'Cours', exercice:'Exercice', quiz:'Quiz', video:'Vidéo', lien:'Lien', audio:'Audio', document:'Document' };
                const col = couleurs[b.type] || '#64748B';
                const ico = icons[b.type] || '📦';
                const lbl = labels[b.type] || b.type;

                return (
                  <div key={b.id} id={`exo-bloc-${b.id}`} style={{ marginBottom:22, borderRadius:14, border:`1px solid ${col}25`, overflow:'hidden' }}>
                    <div style={{ padding:'11px 16px', background:col + '0a', borderBottom:`1px solid ${col}20`, display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:18 }}>{ico}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, color:COULEURS.navy, fontSize:14 }}>{b.titre}</div>
                        <div style={{ fontSize:11, color:COULEURS.gris400 }}>{lbl} · {b.dureeMin} min</div>
                      </div>
                      <span style={{ fontSize:12, fontWeight:700, color:COULEURS.gris400 }}>#{bi + 1}</span>
                    </div>

                    <div style={{ padding:'14px 16px', background:'#fff' }}>
                      {/* Texte / Exercice avec sections */}
                      {(b.type === 'texte' || b.type === 'exercice') && b.sections?.length > 0 && (
                        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                          {b.sections.map(sec => (
                            <div key={sec.id}>
                              {sec.niveau === 'h2' && <h3 style={{ margin:'0 0 6px', fontSize:15, color:COULEURS.navy, fontWeight:700, borderBottom:`2px solid ${col}30`, paddingBottom:5 }}>{sec.titre}</h3>}
                              {sec.niveau === 'note' && (
                                <div style={{ background:'#FFFBEB', borderLeft:'3px solid #F59E0B', borderRadius:'0 8px 8px 0', padding:'10px 14px' }}>
                                  <div style={{ fontWeight:700, color:'#92400E', marginBottom:4, fontSize:12 }}>{sec.titre}</div>
                                  <div style={{ fontSize:13, color:'#78350F', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{sec.contenu}</div>
                                </div>
                              )}
                              {sec.niveau === 'ul' && (
                                <div>
                                  <div style={{ fontSize:12, fontWeight:600, color:COULEURS.gris400, marginBottom:4 }}>{sec.titre}</div>
                                  <ul style={{ margin:0, paddingLeft:20 }}>
                                    {sec.contenu.split('\n').filter(l => l.trim()).map((l, li) => <li key={li} style={{ fontSize:13, color:COULEURS.gris600, lineHeight:1.8 }}>{l.replace(/^-\s*/, '')}</li>)}
                                  </ul>
                                </div>
                              )}
                              {!['h2', 'note', 'ul'].includes(sec.niveau) && (
                                <p style={{ margin:0, fontSize:13, color:COULEURS.gris600, lineHeight:1.7, whiteSpace:'pre-wrap' }}>{sec.contenu}</p>
                              )}
                              {sec.niveau === 'h2' && sec.contenu && (
                                <p style={{ margin:'4px 0 0', fontSize:13, color:COULEURS.gris600, lineHeight:1.7, whiteSpace:'pre-wrap' }}>{sec.contenu}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Vidéo */}
                      {/* Lecteur intégré plutôt qu'un lien sortant. `urlEmbedVideo`
                          convertit les URL YouTube/Vimeo en URL embarquables ; un fichier
                          hébergé (.mp4) passe par la balise `<video>`. Même traitement que
                          la bibliothèque communautaire, plus bas dans ce fichier. */}
                      {b.type === 'video' && (
                        b.url ? (
                          /* `urlEmbedVideo` rend `null` quand l'URL n'est PAS une
                             plateforme reconnue — c'est son contrat. Le test `!== b.url`
                             était donc VRAI pour un fichier téléversé (`null !== l'url`),
                             et on affichait `<iframe src={null}>` : un cadre vide. Toute
                             vidéo déposée depuis un ordinateur était invisible chez
                             l'apprenant, sans erreur ni message. On teste la présence de
                             l'URL d'intégration, pas une différence. */
                          urlEmbedVideo(b.url) ? (
                            <iframe src={urlEmbedVideo(b.url)} title={b.titre || 'Vidéo du cours'}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
                              style={{ width:'100%', aspectRatio:'16/9', borderRadius:10, border:'none' }} />
                          ) : (
                            <video src={b.url} controls style={{ width:'100%', maxHeight:380, borderRadius:10, background:'#000' }} />
                          )
                        ) : (
                          <div style={{ background:'#1E293B', borderRadius:10, padding:'28px 20px', textAlign:'center', color:'rgba(255,255,255,0.6)', fontSize:13 }}>
                            🎬 Aucune vidéo jointe à ce bloc.
                          </div>
                        )
                      )}

                      {/* IMAGE — un schéma, une consigne visuelle. Cliquable pour
                          l'agrandir : une illustration lue à 300 px ne sert à rien. */}
                      {b.type === 'image' && (
                        b.url ? (
                          <a href={b.url} target="_blank" rel="noreferrer" style={{ display:'block' }}>
                            <img src={b.url} alt={b.titre || 'Illustration du cours'}
                              style={{ width:'100%', maxHeight:420, objectFit:'contain', borderRadius:10, background:COULEURS.gris50, cursor:'zoom-in' }} />
                          </a>
                        ) : (
                          <div style={{ background:COULEURS.gris50, borderRadius:10, padding:'24px', textAlign:'center', fontSize:13, color:COULEURS.gris400 }}>
                            🖼️ Aucune image jointe à ce bloc.
                          </div>
                        )
                      )}

                      {/* SPEAKING — la consigne du coach. La réponse orale se dépose
                          depuis l'onglet Devoirs, qui sait déjà enregistrer un audio. */}
                      {b.type === 'speaking' && (
                        <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'16px 20px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                            <span style={{ fontSize:26 }}>🎤</span>
                            <div style={{ fontWeight:700, color:'#991B1B' }}>{b.titre || 'Expression orale'}</div>
                          </div>
                          {b.contenu
                            ? <div style={{ fontSize:13.5, color:'#7F1D1D', lineHeight:1.65, whiteSpace:'pre-wrap' }}>{b.contenu}</div>
                            : <div style={{ fontSize:12, color:COULEURS.gris400 }}>Aucune consigne renseignée.</div>}

                          {/* S'ENTRAÎNER À VOIX HAUTE, ICI MÊME.
                              On réutilise l'enregistreur des devoirs (`startRecording`), avec une clé
                              préfixée pour ne pas mélanger les deux états. L'enregistrement SERT À
                              S'ÉCOUTER : un bloc de cours n'est pas évalué, rien n'est soumis au coach.
                              Un speaking à corriger se crée comme DEVOIR — ce circuit existe déjà et
                              porte, lui, la notation et le retour du coach. */}
                          {(() => {
                            const cle = `cours_${b.id}`;
                            const rec = recState[cle] || {};
                            const audio = submitBlocs[cle]?.audioUrl;
                            return (
                              <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid #FECACA' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                                  {!rec.recording ? (
                                    <button type="button" onClick={() => startRecording(cle)} disabled={rec.uploading}
                                      style={{ padding:'8px 16px', borderRadius:8, border:'none', background: rec.uploading ? COULEURS.gris200 : '#DC2626', color:'#fff', fontSize:12.5, fontWeight:700, cursor: rec.uploading ? 'wait' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                                      {rec.uploading ? '⏳ Envoi…' : audio ? '🎤 Réenregistrer' : "🎤 M'entraîner"}
                                    </button>
                                  ) : (
                                    <button type="button" onClick={() => stopRecording(cle)}
                                      style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'#1E293B', color:'#fff', fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                                      ⏹ Arrêter ({rec.seconds || 0}s)
                                    </button>
                                  )}
                                  <span style={{ fontSize:11, color:'#9A3412' }}>
                                    {rec.recording ? '🔴 Enregistrement en cours…' : "Pour vous écouter — rien n'est envoyé au coach."}
                                  </span>
                                </div>
                                {audio && !rec.recording && <audio src={audio} controls style={{ width:'100%', marginTop:10 }} />}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* AUDIO ET DOCUMENT ÉTAIENT ABSENTS DE CETTE MODALE.
                          Le coach peut créer sept types de blocs ; celle-ci n'en rendait
                          que quatre (texte, vidéo, lien, quiz). Un bloc audio ou document
                          n'affichait donc RIEN DU TOUT — pas même un lien mort : le
                          contenu existait en base et restait invisible à l'apprenant.
                          Les deux rendus sont ceux du lecteur live, pour que la même
                          leçon se lise pareil quel que soit l'écran par lequel on l'ouvre. */}
                      {b.type === 'audio' && (
                        <div style={{ background:'#F0FDF4', borderRadius:10, padding:'16px 20px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                            <span style={{ fontSize:28 }}>🎧</span>
                            <div style={{ fontWeight:700, color:COULEURS.navy }}>{b.titre}</div>
                          </div>
                          {b.url
                            ? <audio src={b.url} controls style={{ width:'100%' }} />
                            : <div style={{ fontSize:12, color:COULEURS.gris400 }}>Aucun fichier audio joint à ce bloc.</div>}
                        </div>
                      )}

                      {b.type === 'document' && (
                        <div style={{ background:'#FFF7ED', borderRadius:10, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                          <div style={{ fontSize:36 }}>📄</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:600, color:COULEURS.navy, marginBottom:4 }}>{b.fichier || b.titre}</div>
                            {b.url ? (
                              <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
                                {/* « Ouvrir » passait l'URL Cloudinary brute : sur un .docx ou un
                                    .pptx, livrés en type `raw`, le navigateur recevait un
                                    401 et affichait une page d'erreur. Le relais signe la
                                    requête et rend le fichier avec son vrai type. */}
                                <a href={urlOuvrir(b.url, b.fichier || b.titre)} target="_blank" rel="noreferrer" style={{ fontSize:13, color:'#F59E0B', fontWeight:600 }}>👁 Ouvrir</a>
                                <a href={urlTelecharger(b.url, b.fichier || b.titre || 'document')}
                                  style={{ fontSize:13, color:'#F59E0B', fontWeight:600 }}>⬇ Télécharger</a>
                              </div>
                            ) : (
                              <div style={{ fontSize:12, color:COULEURS.gris400 }}>Aucun fichier joint à ce bloc.</div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Lien */}
                      {b.type === 'lien' && (
                        <div style={{ background:'#E0F2FE', borderRadius:10, padding:'16px', display:'flex', gap:12, alignItems:'center' }}>
                          <span style={{ fontSize:28 }}>🔗</span>
                          <a href={b.url} target="_blank" rel="noreferrer" style={{ color:couleurTheme, fontWeight:600, fontSize:13 }}>Accéder à la ressource →</a>
                        </div>
                      )}

                      {/* Quiz */}
                      {b.type === 'quiz' && (() => {
                        const soumis = exoSoumis[b.id];
                        const { bonnes, total, pct } = scoreQuizBloc(b);
                        return (
                          <div>
                            {b.questions.map((q, qi) => {
                              const clef   = `${b.id}_${q.id}`;
                              const choix  = exoReponses[clef];
                              const estBon = choix === q.correct;
                              return (
                                <div key={q.id} style={{ marginBottom:14, padding:'12px 14px', borderRadius:10, background: soumis ? (estBon ? '#F0FDF4' : '#FFF5F5') : '#F8FAFC', border:`1px solid ${soumis ? (estBon ? '#6EE7B7' : '#FECACA') : COULEURS.gris200}` }}>
                                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>{qi + 1}. {q.texte}</div>
                                  {/* SANS OPTION, LA QUESTION EST OUVERTE : elle se prépare,
                                      et sa réponse se discute en classe. Elle n'affichait
                                      rien du tout — le texte de la question suivi du vide,
                                      comme un bloc cassé. */}
                                  {(q.options || []).filter(Boolean).length === 0 ? (
                                    <div style={{ fontSize:12.5, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, padding:'9px 12px' }}>
                                      💬 Question ouverte — préparez votre réponse pour le cours.
                                    </div>
                                  ) : (
                                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                                    {(q.options || []).filter(Boolean).map(opt => {
                                      const sel = choix === opt;
                                      const correct = opt === q.correct;
                                      let bg = '#fff', bord = COULEURS.gris200, txt = COULEURS.gris600;
                                      if (soumis) { if (correct) { bg = '#F0FDF4'; bord = '#6EE7B7'; txt = '#065F46'; } else if (sel) { bg = '#FFF5F5'; bord = '#FECACA'; txt = '#991B1B'; } }
                                      else if (sel) { bg = col + '15'; bord = col; txt = col; }
                                      return (
                                        <button key={opt} disabled={soumis} onClick={() => !soumis && setExoReponses(p => ({ ...p, [clef]: opt }))}
                                          style={{ textAlign:'left', padding:'9px 14px', borderRadius:8, border:`1.5px solid ${bord}`, background:bg, color:txt, fontSize:13, fontWeight:sel || (soumis && correct) ? 700 : 400, cursor:soumis ? 'default' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:8 }}>
                                          {soumis && correct && <span>✅</span>}
                                          {soumis && sel && !correct && <span>❌</span>}
                                          {opt}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  )}
                                </div>
                              );
                            })}

                            {soumis ? (
                              <div style={{ padding:'12px 16px', borderRadius:10, background: pct >= 70 ? '#D1FAE5' : '#FEE2E2', border:`1px solid ${pct >= 70 ? '#6EE7B7' : '#FECACA'}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                <div>
                                  <div style={{ fontWeight:700, color: pct >= 70 ? '#065F46' : '#991B1B', fontSize:14 }}>{pct >= 70 ? '🎉 Bravo !' : '📖 Continue à réviser'}</div>
                                  <div style={{ fontSize:13, color: pct >= 70 ? '#065F46' : '#991B1B', marginTop:2 }}>{bonnes}/{total} bonne{bonnes > 1 ? 's' : ''} réponse{bonnes > 1 ? 's' : ''} - {pct}%</div>
                                </div>
                                <button onClick={() => { setExoSoumis(p => { const n = { ...p }; delete n[b.id]; return n; }); setExoReponses(p => { const n = { ...p }; b.questions.forEach(q => delete n[`${b.id}_${q.id}`]); return n; }); }}
                                  style={{ padding:'6px 14px', borderRadius:8, border:`1px solid ${pct >= 70 ? '#6EE7B7' : '#FECACA'}`, background:'#fff', color: pct >= 70 ? '#065F46' : '#991B1B', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                                  Recommencer
                                </button>
                              </div>
                            ) : (() => {
                              /* ON N'ATTEND QUE LES QUESTIONS NOTABLES. Le bouton exigeait une réponse à
                                 TOUTES les questions du bloc. Une question ouverte ne peut pas en recevoir :
                                 une seule suffisait à désactiver « Valider » pour toujours, et le quiz entier
                                 devenait impossible à soumettre. S'il n'y a QUE des questions ouvertes, il n'y
                                 a rien à corriger : le bouton disparaît au lieu de promettre une note qui ne
                                 viendra pas. */
                              const notables = b.questions.filter(q => (q.options || []).filter(Boolean).length > 0);
                              if (notables.length === 0) return null;
                              const incomplet = notables.some(q => !exoReponses[`${b.id}_${q.id}`]);
                              return (
                                <button disabled={incomplet}
                                  onClick={() => setExoSoumis(p => ({ ...p, [b.id]: true }))}
                                  style={{ padding:'10px 20px', borderRadius:8, border:'none', background: incomplet ? COULEURS.gris200 : col, color: incomplet ? COULEURS.gris400 : '#fff', fontSize:13, fontWeight:700, cursor: incomplet ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                                  ✓ Valider mes réponses
                                </button>
                              );
                            })()}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pied */}
            <div style={{ padding:'14px 22px', borderTop:'1px solid #D1FAE5', background:'#F0FDF4', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <div style={{ fontSize:12, color:'#065F46' }}>
                {terminesLive[exerciceOuvert.id] ? '✅ Cours marqué comme terminé' : 'Marque le cours comme terminé quand tu as tout lu.'}
              </div>
              <button
                /* MARQUER EST DÉFINITIF — le serveur refuse tout retour en arrière
                   (`DELETE /contenus/:id/lu` répond 403). Proposer « Marquer non
                   terminé » aurait donc toujours échoué ; le bouton se désactive une
                   fois le cours terminé, et la confirmation prévient avant le clic. */
                disabled={!!terminesLive[exerciceOuvert.id]}
                onClick={() => {
                  if (terminesLive[exerciceOuvert.id]) return;
                  if (!window.confirm("Marquer ce cours comme terminé ?\n\nC'est définitif : votre coach le verra dans son suivi de lecture.")) return;
                  marquerCoursTermine(exerciceOuvert.id);
                }}
                style={{ padding:'9px 18px', borderRadius:8, border:'none', background: terminesLive[exerciceOuvert.id] ? COULEURS.gris200 : COULEURS.succes, color: terminesLive[exerciceOuvert.id] ? COULEURS.gris600 : '#fff', fontSize:13, fontWeight:700, cursor: terminesLive[exerciceOuvert.id] ? 'default' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                {terminesLive[exerciceOuvert.id] ? '✅ Terminé' : '✅ Marquer comme terminé'}
              </button>
            </div>
          </div>
        </>
      );
    })()}

    {/* ── Modal rendre un devoir ── */}
    {modalRendre && devoirModal && (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
        <div style={{ background:'#fff', borderRadius:20, maxWidth:520, width:'100%', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 8px 40px rgba(0,0,0,0.18)', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
          <div style={{ background:`linear-gradient(135deg, ${COULEURS.navy} 0%, ${couleurThemeFonce||'#0891B2'} 100%)`, padding:'20px 24px', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.65)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>📝 Rendre mon devoir</div>
              <div style={{ fontSize:16, fontWeight:700, color:'#fff' }}>{contenuModal ? contenuModal.titre : devoirModal.contenu_id}</div>
            </div>
            <button onClick={() => { setModalRendre(null); setRendreForm({ fichier:null, texte:'' }); }} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', borderRadius:8, width:32, height:32, fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>✕</button>
          </div>
          <div style={{ padding:24, display:'flex', flexDirection:'column', gap:18, overflowY:'auto', maxHeight:'70vh' }}>
            <div style={{ background:COULEURS.gris50, borderRadius:12, padding:'14px 16px' }}>
              <div style={{ fontSize:13, color:COULEURS.gris600 }}><span style={{ fontWeight:600, color:COULEURS.navy }}>Date limite :</span> {fmtDate(devoirModal.date_limite)}</div>
              {(devoirModal.consigne || devoirModal.instructions) && (
                <div style={{ fontSize:13, color:COULEURS.gris600, marginTop:6 }}><span style={{ fontWeight:600, color:COULEURS.navy }}>Consigne :</span> {devoirModal.consigne || devoirModal.instructions}</div>
              )}
            </div>
            <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', border:`2px dashed ${COULEURS.gris200}`, borderRadius:12, padding:'20px 16px', cursor:'pointer', background:COULEURS.gris50, gap:8 }}>
              <span style={{ fontSize:28 }}>📁</span>
              <span style={{ fontSize:13, color:COULEURS.gris600, textAlign:'center' }}>
                {rendreForm.fichier ? <span style={{ color:COULEURS.navy, fontWeight:600 }}>✅ {rendreForm.fichier.name}</span> : 'Cliquez pour sélectionner un fichier (.pdf, .docx, .mp4, .mp3, .jpg, .png)'}
              </span>
              <input type="file" accept=".pdf,.docx,.mp4,.mp3,.jpg,.png" style={{ display:'none' }} onChange={e => setRendreForm(p => ({ ...p, fichier:e.target.files[0]||null }))} />
            </label>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ flex:1, height:1, background:COULEURS.gris200 }} />
              <span style={{ fontSize:12, color:COULEURS.gris400, fontWeight:600 }}>OU</span>
              <div style={{ flex:1, height:1, background:COULEURS.gris200 }} />
            </div>
            <textarea rows={5} placeholder="Écrivez votre réponse ici..." value={rendreForm.texte} onChange={e => setRendreForm(p => ({ ...p, texte:e.target.value }))} style={{ width:'100%', borderRadius:10, border:`1px solid ${COULEURS.gris200}`, padding:'12px 14px', fontSize:13, color:COULEURS.navy, background:COULEURS.gris50, resize:'vertical', outline:'none', fontFamily:'"Plus Jakarta Sans",sans-serif', boxSizing:'border-box' }} />
          </div>
          <div style={{ padding:'16px 24px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', gap:12, justifyContent:'flex-end', background:'#fff' }}>
            <button onClick={() => { setModalRendre(null); setRendreForm({ fichier:null, texte:'' }); }} style={{ background:COULEURS.gris50, color:COULEURS.gris600, border:`1px solid ${COULEURS.gris200}`, borderRadius:8, padding:'10px 20px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>Annuler</button>
            <button disabled={!rendreForm.fichier && !rendreForm.texte.trim()} onClick={() => { setRendus(p => ({ ...p, [modalRendre]:true })); setModalRendre(null); setRendreForm({ fichier:null, texte:'' }); }} style={{ background:(!rendreForm.fichier && !rendreForm.texte.trim())?COULEURS.gris200:couleurTheme, color:(!rendreForm.fichier && !rendreForm.texte.trim())?COULEURS.gris400:'#fff', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, fontWeight:600, cursor:(!rendreForm.fichier && !rendreForm.texte.trim())?'not-allowed':'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
              ✅ Soumettre le devoir
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Confirmation avant ouverture (texte/QCM/mixte - pas de retour en arrière possible) ── */}
    {confirmOuvrirDevoir && (
      <>
        <div onClick={() => setConfirmOuvrirDevoir(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1290 }} />
        <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'min(420px,92vw)', background:'#fff', borderRadius:18, zIndex:1291, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.22)', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
          <div style={{ background:`linear-gradient(135deg, ${couleurTheme}, ${couleurThemeFonce||couleurTheme})`, padding:'18px 22px' }}>
            <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>📝 Ouvrir ce devoir ?</div>
          </div>
          <div style={{ padding:'22px 24px' }}>
            <div style={{ fontSize:14, color:COULEURS.navy, lineHeight:1.7 }}>Une fois ouvert, vous devrez le soumettre pour continuer - impossible d'annuler en cours de route.</div>
          </div>
          <div style={{ padding:'12px 24px 20px', display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button onClick={() => setConfirmOuvrirDevoir(null)} style={{ padding:'10px 22px', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
              Annuler
            </button>
            <button onClick={() => { setDevoirOuvertApp(confirmOuvrirDevoir); setConfirmOuvrirDevoir(null); }}
              style={{ padding:'10px 22px', borderRadius:9, border:'none', background:couleurTheme, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
              📝 Ouvrir
            </button>
          </div>
        </div>
      </>
    )}

    {/* ── Panel / Modal : Soumettre un devoir réel ── */}
    {devoirOuvertApp && (() => {
      const d          = devoirOuvertApp;
      const questions  = Array.isArray(d.questions) ? d.questions : [];
      const isExpired  = d.expire && d.statut === 'a_rendre';
      const isFichier  = d.type_rendu === 'fichier';
      const isTexte    = d.type_rendu === 'texte';
      const isLesTwo   = d.type_rendu === 'les_deux';
      const hasQcm     = ['qcm','quiz'].includes(d.format_type) && questions.length > 0;
      const isMixte    = d.format_type === 'mixte' && Array.isArray(d.blocs) && d.blocs.length > 0;

      function fermerDevoir() {
        setDevoirOuvertApp(null);
        setSubmitTexte('');
        setSubmitQcm({});
        setSubmitBlocs({});
        setSubmitFichier(null);
        setSubmitErreur('');
      }

      async function soumettreFichier() {
        if (!submitFichier) return;
        setSubmitLoading(true);
        try {
          const fd = new FormData();
          fd.append('fichier', submitFichier);
          fd.append('inscription_id', inscriptionReelle?.id || '');
          fd.append('classe_id', inscriptionReelle?.classe_id || '');
          fd.append('type_soumission', 'fichier');
          const r = await fetch(`${_API}/api/elearning/devoirs/${d.id}/rendre`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
            body: fd,
          });
          const json = await r.json();
          if (r.ok && json.rendu) {
            setDevoirRenduState(prev => ({ ...prev, [d.id]: json.rendu }));
            setDevoirsReels_app(prev => prev.map(x => x.id === d.id ? { ...x, statut: 'rendu' } : x));
            fermerDevoir();
          } else {
            setSubmitErreur(json.error || 'Erreur lors de la soumission');
          }
        } catch { setSubmitErreur('Erreur réseau. Vérifie ta connexion.'); }
        setSubmitLoading(false);
      }

      /* `auto` = envoi déclenché par le minuteur, pas par l'apprenant. Il part SANS
         condition de complétude : c'est précisément la copie incomplète qu'il faut sauver.
         Le serveur le reconnaît (`auto_minuteur`) et l'accepte malgré l'échéance franchie
         d'une fraction de seconde — le refuser perdrait ce qu'il vient sauver. */
      async function soumettreTexte(auto = false) {
        const texteOk   = (isTexte || isLesTwo) && submitTexte.trim();
        const qcmOk     = hasQcm && Object.keys(submitQcm).length === questions.length;
        if (!auto && !texteOk && !qcmOk && !hasQcm && !isMixte) return;
        setSubmitLoading(true);
        setSubmitErreur('');
        try {
          const body = {
            inscription_id: inscriptionReelle?.id || '',
            classe_id:      inscriptionReelle?.classe_id || '',
            type_soumission:'texte',
            contenu_texte:  submitTexte.trim(),
            reponses_qcm:   submitQcm,
            reponses_blocs: submitBlocs,
            ...(auto ? { auto_minuteur: true } : {}),
          };
          const r = await fetch(`${_API}/api/elearning/devoirs/${d.id}/rendre`, {
            method: 'POST',
            headers: { 'Content-Type':'application/json', Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`, 'X-Plateforme': 'bet-elearning' },
            body: JSON.stringify(body),
          });
          const json = await r.json();
          if (r.ok && json.rendu) {
            setDevoirRenduState(prev => ({ ...prev, [d.id]: json.rendu }));
            setDevoirsReels_app(prev => prev.map(x => x.id === d.id ? { ...x, statut: 'rendu' } : x));
            fermerDevoir();
          } else {
            setSubmitErreur(json.error || 'Erreur lors de la soumission');
          }
        } catch { setSubmitErreur('Erreur réseau. Vérifie ta connexion.'); }
        setSubmitLoading(false);
      }

      const blocsNotables = isMixte ? d.blocs.filter(b => ['qcm','listening','audio','quiz'].includes(b.type)) : [];
      const totalBlocQ    = blocsNotables.reduce((s,b) => s + (b.questions||[]).length, 0);
      const reponduBlocQ  = blocsNotables.reduce((s,b) => s + Object.keys(submitBlocs[b.id]||{}).length, 0);
      const speakingOk    = !isMixte || d.blocs.filter(b => b.type === 'speaking').every(b => (submitBlocs[b.id]?.texte||'').trim().length > 0 || !!submitBlocs[b.id]?.audioUrl);
      const canSubmitTexte = isMixte
        ? (totalBlocQ === 0 || reponduBlocQ === totalBlocQ) && speakingOk
        : hasQcm
          ? Object.keys(submitQcm).length === questions.length
          : (isTexte || isLesTwo) && submitTexte.trim().length > 0;

      /* ── Cas 1 : date limite dépassée, devoir non rendu ── */
      if (isExpired) return (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:20, maxWidth:440, width:'100%', overflow:'hidden', boxShadow:'0 8px 40px rgba(0,0,0,0.2)', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
            <div style={{ background:'linear-gradient(135deg,#991B1B,#DC2626)', padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:3 }}>⛔ Devoir expiré</div>
                <div style={{ fontSize:16, fontWeight:700, color:'#fff' }}>{d.titre}</div>
              </div>
              <button onClick={fermerDevoir} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', borderRadius:8, width:32, height:32, fontSize:16, cursor:'pointer', fontFamily:'inherit' }}>✕</button>
            </div>
            <div style={{ padding:28, textAlign:'center' }}>
              <div style={{ fontSize:48, marginBottom:12 }}>🔴</div>
              <div style={{ fontSize:18, fontWeight:800, color:'#991B1B', marginBottom:8 }}>Date limite dépassée</div>
              <div style={{ fontSize:14, color:COULEURS.gris600, lineHeight:1.6, marginBottom:24 }}>
                La date limite pour ce devoir était le <strong>{d.date_limite}</strong> à <strong>{d.heure_limite || '23:59'}</strong>.<br />
                La soumission n'est plus possible.
              </div>
              <div style={{ padding:'12px 16px', background:'#FEE2E2', borderRadius:10, fontSize:13, color:'#991B1B', fontWeight:600, marginBottom:20 }}>
                📋 Statut : Devoir non rendu - en retard
              </div>
              <button onClick={fermerDevoir} style={{ padding:'11px 32px', borderRadius:10, border:'none', background:COULEURS.gris100, color:COULEURS.navy, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Fermer</button>
            </div>
          </div>
        </div>
      );

      /* ── Cas 2 : type fichier → modal centré ── */
      if (isFichier) return (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:20, maxWidth:720, width:'100%', maxHeight:'88vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.2)', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
            <div style={{ background:`linear-gradient(135deg, ${couleurTheme} 0%, ${couleurThemeFonce||couleurTheme} 100%)`, padding:'24px 28px', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
              <div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>📎 Déposer un fichier</div>
                <div style={{ fontSize:19, fontWeight:700, color:'#fff' }}>{d.titre}</div>
              </div>
              <button onClick={fermerDevoir} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', borderRadius:8, width:32, height:32, fontSize:16, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>✕</button>
            </div>
            <div style={{ padding:'28px 28px 8px' }}>
              {d.instructions && (
                <div style={{ background:COULEURS.gris50, borderRadius:12, padding:'16px 18px', marginBottom:22, fontSize:14, color:COULEURS.gris700, lineHeight:1.7 }}>
                  <div style={{ fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>📋 Consigne</div>
                  {d.instructions}
                </div>
              )}
              {d.date_limite && (
                <div style={{ marginBottom:18, fontSize:13, color:'#92400E', fontWeight:600 }}>
                  ⏳ Date limite : {d.date_limite} à {d.heure_limite || '23:59'}
                </div>
              )}

              {/* ── LE COMPTE À REBOURS DE COMPOSITION ──
                  Distinct de la date limite, qui borne le DÉPÔT : celui-ci borne le temps
                  passé sur la copie, et il court depuis que l'apprenant a ouvert le devoir.
                  Il doit rester sous les yeux en permanence — on ne compose pas de la même
                  façon selon qu'il reste deux heures ou quatre minutes. */}
              {compo?.chronometre && compo.echeance && (() => {
                const msRestant = new Date(compo.echeance) - now;
                const fini = msRestant <= 0;
                const fmt2 = (n) => String(n).padStart(2, '0');
                const h = Math.floor(msRestant / 3600000);
                const m = Math.floor((msRestant % 3600000) / 60000);
                const sec = Math.floor((msRestant % 60000) / 1000);
                const urgent = !fini && msRestant < 5 * 60000;

                /* L'ENVOI AUTOMATIQUE. Une seule fois (`autoEnvoiFait`), sans quoi le tic
                   d'horloge le relancerait chaque seconde. On n'envoie que si la copie
                   n'est pas déjà rendue : rouvrir un devoir rendu ne doit rien réexpédier. */
                if (fini && !autoEnvoiFait.current && !submitLoading && d.statut !== 'rendu' && d.statut !== 'corrige') {
                  autoEnvoiFait.current = true;
                  soumettreTexte(true);
                }

                return (
                  <div style={{ marginBottom:18, padding:'14px 18px', borderRadius:12,
                    background: fini ? '#FEF2F2' : urgent ? '#FFF7ED' : '#EFF6FF',
                    border:`1px solid ${fini ? '#FECACA' : urgent ? '#FDBA74' : '#BFDBFE'}` }}>
                    <div style={{ fontSize:12, fontWeight:700, color: fini ? '#991B1B' : urgent ? '#9A3412' : '#1D4ED8', marginBottom:4 }}>
                      ⏱ Temps de composition — {compo.duree_min} min
                    </div>
                    {fini ? (
                      <div style={{ fontSize:13, color:'#991B1B', fontWeight:700, lineHeight:1.6 }}>
                        Temps écoulé. Votre copie a été transmise à votre coach en l'état.
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize:26, fontWeight:900, color: urgent ? '#C2410C' : '#1D4ED8', fontVariantNumeric:'tabular-nums', fontFamily:'monospace', lineHeight:1.2 }}>
                          {h > 0 ? `${h}:` : ''}{fmt2(m)}:{fmt2(sec)}
                        </div>
                        <div style={{ fontSize:11.5, color: urgent ? '#9A3412' : '#1E40AF', marginTop:4, lineHeight:1.5 }}>
                          {urgent
                            ? 'Moins de 5 minutes — votre copie partira automatiquement à zéro.'
                            : "À zéro, votre copie est envoyée automatiquement, même incomplète. Ce qui n'a pas été fait vaut zéro ; votre coach tranche la note finale."}
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
              {d.ressource_url && (
                <a href={d.ressource_url} target="_blank" rel="noreferrer" style={{ display:'flex', alignItems:'center', gap:12, background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:12, padding:'14px 18px', marginBottom:18, textDecoration:'none' }}>
                  <span style={{ fontSize:22 }}>📎</span>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#0369A1' }}>Exercice joint par le coach</div>
                    <div style={{ fontSize:12, color:'#0C4A6E', wordBreak:'break-all' }}>{(d.ressource_url.split('/').pop() || 'Télécharger')}</div>
                  </div>
                </a>
              )}
              {/* Le fichier ne survit pas au rechargement — un objet `File` n'est pas
                  sérialisable et aucun navigateur n'autorise à repeupler un champ de
                  fichier. On le dit, plutôt que de laisser croire qu'il est encore joint
                  et de découvrir un envoi sans pièce jointe. */}
              {fichierAJoindreDeNouveau && !submitFichier && (
                <div style={{ background:'#FFFBEB', border:'1px solid #FCD34D', borderRadius:12, padding:'12px 16px', marginBottom:14, fontSize:12.5, color:'#92400E', lineHeight:1.6 }}>
                  ⚠️ Vos réponses ont été retrouvées, mais le fichier que vous aviez choisi
                  avant le rechargement doit être sélectionné à nouveau.
                </div>
              )}
              {/* ── CE QUI A DÉJÀ ÉTÉ DÉPOSÉ ──
                  En cliquant « Modifier ma copie », l'apprenant retrouvait une zone de
                  dépôt vide, identique à celle du premier rendu : rien ne lui disait quel
                  fichier était actuellement enregistré, ni s'il avait bien envoyé le bon.
                  Il devait redéposer à l'aveugle. On montre la copie en place, avec de
                  quoi la rouvrir pour vérifier avant de la remplacer. */}
              {d.rendu?.fichier_url && (
                <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, padding:'14px 18px', marginBottom:14, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                  <span style={{ fontSize:22 }}>✅</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#15803D' }}>Votre copie actuelle</div>
                    <div style={{ fontSize:12, color:'#166534', wordBreak:'break-all' }}>
                      {d.rendu.fichier_nom || d.rendu.fichier_url.split('/').pop()}
                      {d.rendu.rendu_at && ` · déposée le ${new Date(d.rendu.rendu_at).toLocaleDateString('fr-FR', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' })}`}
                    </div>
                  </div>
                  <a href={urlOuvrir(d.rendu.fichier_url, d.rendu.fichier_nom)} target="_blank" rel="noreferrer"
                    style={{ fontSize:12.5, fontWeight:700, color:'#15803D', textDecoration:'underline' }}>👁 Ouvrir</a>
                </div>
              )}
              {d.rendu?.contenu_texte && !d.rendu?.fichier_url && (
                <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, padding:'14px 18px', marginBottom:14 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#15803D', marginBottom:6 }}>Votre réponse actuelle</div>
                  <div style={{ fontSize:12.5, color:'#166534', whiteSpace:'pre-wrap', lineHeight:1.6, maxHeight:140, overflowY:'auto' }}>{d.rendu.contenu_texte}</div>
                </div>
              )}
              <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', border:`2px dashed ${submitFichier ? couleurTheme : COULEURS.gris300}`, borderRadius:14, padding:'40px 20px', cursor:'pointer', background: submitFichier ? `${couleurTheme}10` : COULEURS.gris50, gap:12, transition:'all 0.2s', marginBottom:8 }}>
                <span style={{ fontSize:44 }}>{submitFichier ? '✅' : '📁'}</span>
                <span style={{ fontSize:15, color: submitFichier ? couleurTheme : COULEURS.gris600, fontWeight:600, textAlign:'center' }}>
                  {submitFichier ? submitFichier.name
                    : d.rendu?.fichier_url ? 'Cliquez pour REMPLACER votre fichier'
                    : 'Cliquez pour choisir votre fichier'}
                </span>
                <span style={{ fontSize:12.5, color:COULEURS.gris400 }}>.pdf · .docx · .mp4 · .mp3 · .jpg · .png</span>
                <input type="file" accept=".pdf,.docx,.mp4,.mp3,.jpg,.png" style={{ display:'none' }} onChange={e => { setSubmitFichier(e.target.files[0] || null); setFichierAJoindreDeNouveau(false); }} />
              </label>
            </div>
            {submitErreur && (
              <div style={{ margin:'0 28px', padding:'12px 16px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, fontSize:13, color:'#991B1B', fontWeight:600 }}>
                ⚠️ {submitErreur}
              </div>
            )}
            <div style={{ padding:'18px 28px 28px', display:'flex', gap:12, justifyContent:'flex-end' }}>
              <button onClick={fermerDevoir} style={{ padding:'11px 22px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.gris600, fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Annuler</button>
              <button onClick={soumettreFichier} disabled={!submitFichier || submitLoading} style={{ padding:'11px 24px', borderRadius:8, border:'none', background:(!submitFichier||submitLoading) ? COULEURS.gris200 : couleurTheme, color:(!submitFichier||submitLoading) ? COULEURS.gris400 : '#fff', fontSize:14, fontWeight:700, cursor:(!submitFichier||submitLoading)?'not-allowed':'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:8 }}>
                {submitLoading ? '⏳ Envoi...' : '📤 Soumettre'}
              </button>
            </div>
          </div>
        </div>
      );

      /* ── Cas 3 : type texte / les_deux / mixte → panneau latéral droit ──
         Pas de fermeture au clic sur le fond ni de bouton ✕ : une fois ouvert, le devoir
         doit être soumis pour pouvoir en sortir. */
      return (
        <>
          <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.55)', zIndex:1300, backdropFilter:'blur(2px)' }} />
          {/* 870 px comme les trois autres panneaux de l'espace apprenant. À 580 px, les
              questions à options longues passaient à la ligne au milieu d'un mot et les
              blocs d'un devoir mixte se serraient — alors que c'est l'écran où l'apprenant
              compose, celui qui mérite le plus de place. */}
          <div style={{ position:'fixed', top:0, right:0, height:'100vh', width:'min(92vw, 870px)', background:'#fff', zIndex:1301, display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,0.18)', fontFamily:'"Plus Jakarta Sans",sans-serif', overflow:'hidden' }}>
            {/* Header */}
            <div style={{ background:`linear-gradient(135deg, ${couleurTheme} 0%, ${couleurThemeFonce||couleurTheme} 100%)`, padding:'20px 24px', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexShrink:0 }}>
              <div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:3 }}>📝 {(hasQcm||isMixte) ? 'Répondre aux questions' : 'Composition'}</div>
                <div style={{ fontSize:17, fontWeight:800, color:'#fff', lineHeight:1.3 }}>{d.titre}</div>
                {d.date_limite && (
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:6 }}>⏳ Limite : {d.date_limite} à {d.heure_limite || '23:59'}</div>
                )}
              </div>
            </div>

            {/* Corps scrollable */}
            <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:20 }}>

              {/* Consigne */}
              {d.instructions && (
                <div style={{ background:'#F0F9FF', borderRadius:12, padding:'14px 16px', border:'1px solid #BAE6FD' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#0369A1', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>📋 Consigne</div>
                  <div style={{ fontSize:13, color:'#0C4A6E', lineHeight:1.7, whiteSpace:'pre-wrap' }}>{d.instructions}</div>
                </div>
              )}

              {/* Ressource audio/listening */}
              {d.ressource_url && ['listening','audio'].includes(d.format_type) && (
                <div style={{ background:'#F5F3FF', borderRadius:12, padding:'14px 16px', border:'1px solid #C4B5FD' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#5B21B6', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>🎧 Document audio</div>
                  <audio controls src={d.ressource_url} style={{ width:'100%', borderRadius:8 }} />
                </div>
              )}

              {/* QCM / Quiz */}
              {hasQcm && (
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>❓ Questions ({questions.length})</div>
                  {questions.map((q, qi) => (
                    <div key={qi} style={{ background:COULEURS.gris50, borderRadius:12, padding:'14px 16px', border:`1px solid ${COULEURS.gris200}` }}>
                      <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:12 }}>Q{qi+1}. {q.texte}</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {(q.options || []).map((opt, oi) => {
                          const sel = submitQcm[qi] === opt;
                          return (
                            <label key={oi} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:8, border:`1.5px solid ${sel ? couleurTheme : COULEURS.gris200}`, background: sel ? `${couleurTheme}12` : '#fff', cursor:'pointer', transition:'all 0.15s' }}>
                              <div style={{ width:18, height:18, borderRadius:'50%', border:`2px solid ${sel ? couleurTheme : COULEURS.gris300}`, background: sel ? couleurTheme : '#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s' }}>
                                {sel && <div style={{ width:8, height:8, borderRadius:'50%', background:'#fff' }} />}
                              </div>
                              <input type="radio" name={`q_${qi}`} value={opt} checked={sel} onChange={() => setSubmitQcm(prev => ({ ...prev, [qi]: opt }))} style={{ display:'none' }} />
                              <span style={{ fontSize:13, color:COULEURS.navy }}>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div style={{ fontSize:12, color:COULEURS.gris400, textAlign:'center' }}>
                    {Object.keys(submitQcm).length}/{questions.length} question(s) répondue(s)
                  </div>
                </div>
              )}

              {/* Blocs mixtes - QCM/Listening/Audio/Quiz/Speaking combinés */}
              {isMixte && d.blocs.map((b, bi) => {
                const BLOC_ICO = { qcm:'📋', listening:'🎬', audio:'🎧', quiz:'🎯', speaking:'🎤' };
                const avecQ = ['qcm','listening','audio','quiz'].includes(b.type) && (b.questions||[]).length > 0;
                const rep = submitBlocs[b.id] || {};
                return (
                  <div key={b.id} style={{ background:COULEURS.gris50, borderRadius:12, padding:'14px 16px', border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:10 }}>{BLOC_ICO[b.type]||'📋'} Bloc {bi+1}</div>

                    {['listening','audio'].includes(b.type) && b.ressourceUrl && (
                      b.type === 'listening'
                        ? (urlEmbedVideo(b.ressourceUrl)
                            ? <div style={{ position:'relative', paddingTop:'48%', borderRadius:8, overflow:'hidden', marginBottom:12 }}>
                                <iframe title={`listening-${b.id}`} src={urlEmbedVideo(b.ressourceUrl)} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:'none' }} />
                              </div>
                            : <video controls src={b.ressourceUrl} style={{ width:'100%', borderRadius:8, marginBottom:12, maxHeight:280 }} />)
                        : <audio controls src={b.ressourceUrl} style={{ width:'100%', marginBottom:12 }} />
                    )}

                    {avecQ && b.questions.map((q, qi) => (
                      <div key={q.id||qi} style={{ marginBottom:12 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>Q{qi+1}. {q.texte}</div>
                        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                          {(q.options||[]).map((opt, oi) => {
                            const sel = rep[qi] === opt;
                            return (
                              <label key={oi} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, border:`2px solid ${sel?couleurTheme:COULEURS.gris200}`, background:sel?`${couleurTheme}12`:'#fff', cursor:'pointer' }}>
                                <input type="radio" name={`bloc${b.id}q${qi}`} value={opt} checked={sel}
                                  onChange={() => setSubmitBlocs(p => ({ ...p, [b.id]: { ...(p[b.id]||{}), [qi]: opt } }))}
                                  style={{ accentColor:couleurTheme }} />
                                <span style={{ fontSize:13, color:COULEURS.navy }}>{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {b.type === 'speaking' && (
                      <>
                        {b.instructions && <div style={{ fontSize:13, color:COULEURS.gris700, lineHeight:1.6, marginBottom:8 }}>{b.instructions}</div>}
                        {b.ressourceUrl && (
                          /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(b.ressourceUrl)
                            ? <audio controls src={b.ressourceUrl} style={{ width:'100%', marginBottom:12 }} />
                            : urlEmbedVideo(b.ressourceUrl)
                              ? <div style={{ position:'relative', paddingTop:'48%', borderRadius:8, overflow:'hidden', marginBottom:12 }}>
                                  <iframe title={`speaking-${b.id}`} src={urlEmbedVideo(b.ressourceUrl)} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:'none' }} />
                                </div>
                              : <video controls src={b.ressourceUrl} style={{ width:'100%', borderRadius:8, marginBottom:12, maxHeight:280 }} />
                        )}
                        {b.conseil && <div style={{ fontSize:12, color:COULEURS.gris400, fontStyle:'italic', marginBottom:10 }}>💡 {b.conseil}</div>}

                        {!!navigator.mediaDevices?.getUserMedia && (
                          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10, flexWrap:'wrap' }}>
                            {rep.audioUrl && !recState[b.id]?.recording && (
                              <>
                                <audio controls src={rep.audioUrl} style={{ flex:1, minWidth:200 }} />
                                <button type="button" onClick={() => setSubmitBlocs(p => ({ ...p, [b.id]: { ...(p[b.id]||{}), audioUrl:'' } }))}
                                  style={{ padding:'7px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.gris600, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                                  🔄 Recommencer
                                </button>
                              </>
                            )}
                            {!rep.audioUrl && !recState[b.id]?.recording && (
                              <button type="button" onClick={() => startRecording(b.id)} disabled={recState[b.id]?.uploading}
                                style={{ padding:'9px 16px', borderRadius:8, border:'none', background:recState[b.id]?.uploading?COULEURS.gris200:couleurTheme, color:recState[b.id]?.uploading?COULEURS.gris400:'#fff', fontSize:12.5, fontWeight:700, cursor:recState[b.id]?.uploading?'wait':'pointer', fontFamily:'inherit' }}>
                                {recState[b.id]?.uploading ? "⏳ Envoi de l'enregistrement…" : '🎤 Enregistrer ma réponse'}
                              </button>
                            )}
                            {recState[b.id]?.recording && (
                              <button type="button" onClick={() => stopRecording(b.id)}
                                style={{ padding:'9px 16px', borderRadius:8, border:'none', background:'#DC2626', color:'#fff', fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:8 }}>
                                <span style={{ width:8, height:8, borderRadius:'50%', background:'#fff', display:'inline-block' }} />
                                ⏹ Arrêter - {fmtRecTime(recState[b.id].seconds||0)}
                              </button>
                            )}
                          </div>
                        )}

                        <textarea rows={3} placeholder="Notes complémentaires (optionnel si vous avez enregistré un audio), ou collez un lien d'enregistrement…"
                          value={rep.texte||''}
                          onChange={e => setSubmitBlocs(p => ({ ...p, [b.id]: { ...(p[b.id]||{}), texte: e.target.value } }))}
                          style={{ width:'100%', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, padding:'10px 12px', fontSize:13, color:COULEURS.navy, background:'#fff', resize:'vertical', outline:'none', fontFamily:'inherit', boxSizing:'border-box' }} />
                      </>
                    )}
                  </div>
                );
              })}

              {/* Zone texte libre */}
              {(isTexte || isLesTwo) && !hasQcm && !isMixte && (
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:10 }}>✍️ Votre réponse</div>
                  <textarea
                    rows={10}
                    placeholder="Rédigez votre réponse ici..."
                    value={submitTexte}
                    onChange={e => setSubmitTexte(e.target.value)}
                    style={{ width:'100%', borderRadius:10, border:`1.5px solid ${COULEURS.gris200}`, padding:'14px 16px', fontSize:13, color:COULEURS.navy, background:COULEURS.gris50, resize:'vertical', outline:'none', fontFamily:'inherit', boxSizing:'border-box', lineHeight:1.7, minHeight:200 }}
                  />
                  <div style={{ fontSize:11, color:COULEURS.gris400, textAlign:'right', marginTop:4 }}>{submitTexte.length} caractère(s)</div>
                </div>
              )}

              {/* Texte + fichier pour les_deux */}
              {isLesTwo && (
                <div>
                  <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', border:`2px dashed ${submitFichier ? couleurTheme : COULEURS.gris300}`, borderRadius:12, padding:'20px 16px', cursor:'pointer', background: submitFichier ? `${couleurTheme}10` : COULEURS.gris50, gap:8 }}>
                    <span style={{ fontSize:28 }}>{submitFichier ? '✅' : '📁'}</span>
                    <span style={{ fontSize:13, color: submitFichier ? couleurTheme : COULEURS.gris600, fontWeight:600 }}>{submitFichier ? submitFichier.name : 'Joindre un fichier (optionnel)'}</span>
                    <input type="file" accept=".pdf,.docx,.mp4,.mp3,.jpg,.png" style={{ display:'none' }} onChange={e => { setSubmitFichier(e.target.files[0] || null); setFichierAJoindreDeNouveau(false); }} />
                  </label>
                </div>
              )}
            </div>

            {/* Footer */}
            {submitErreur && (
              <div style={{ padding:'10px 24px', background:'#FEF2F2', borderTop:'1px solid #FECACA', fontSize:12, color:'#991B1B', fontWeight:600 }}>
                ⚠️ {submitErreur}
              </div>
            )}
            <div style={{ padding:'16px 24px', borderTop:`1px solid ${COULEURS.gris100}`, display:'flex', gap:12, justifyContent:'flex-end', flexShrink:0, background:'#fff' }}>
              <button
                onClick={() => setConfirmSoumettre(true)}
                disabled={!canSubmitTexte || submitLoading}
                style={{ padding:'10px 22px', borderRadius:8, border:'none', background:(!canSubmitTexte||submitLoading) ? COULEURS.gris200 : couleurTheme, color:(!canSubmitTexte||submitLoading) ? COULEURS.gris400 : '#fff', fontSize:13, fontWeight:700, cursor:(!canSubmitTexte||submitLoading)?'not-allowed':'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:8 }}>
                {submitLoading ? '⏳ Envoi...' : '✅ Soumettre'}
              </button>
            </div>
          </div>

          {/* Confirmation avant envoi définitif */}
          {confirmSoumettre && (
            <>
              <div onClick={() => setConfirmSoumettre(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1400 }} />
              <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'min(420px,92vw)', background:'#fff', borderRadius:18, zIndex:1401, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.22)', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                <div style={{ background:`linear-gradient(135deg, ${couleurTheme}, ${couleurThemeFonce||couleurTheme})`, padding:'18px 22px' }}>
                  <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>✅ Envoyer ce devoir ?</div>
                </div>
                <div style={{ padding:'22px 24px' }}>
                  <div style={{ fontSize:14, color:COULEURS.navy, lineHeight:1.7 }}>Une fois envoyé, vous ne pourrez plus modifier votre réponse.</div>
                </div>
                <div style={{ padding:'12px 24px 20px', display:'flex', gap:10, justifyContent:'flex-end' }}>
                  <button onClick={() => setConfirmSoumettre(false)} style={{ padding:'10px 22px', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                    Annuler
                  </button>
                  <button onClick={() => { setConfirmSoumettre(false); soumettreTexte(); }}
                    style={{ padding:'10px 22px', borderRadius:9, border:'none', background:couleurTheme, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                    ✅ Envoyer
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      );
    })()}

    {/* ── Panneau latéral : programme de session + lecteur de cours ── */}
    {(sessionDetail || coursOuvertLive) && (() => {
      const sess         = sessionsGroupe.find(s => s.id === sessionDetail);
      const contenusSess = sess ? cours.filter(c => (sess.contenu_ids || []).includes(c.id)) : [];
      const TYPE_INFO_L  = {
        lecon:    { bg:'#E0F2FE', txt:'#0E7490', icone:'📖', label:'Leçon',    accent:'#0891B2' },
        exercice: { bg:'#D1FAE5', txt:'#065F46', icone:'✏️',  label:'Exercice', accent:'#10B981' },
        devoir:   { bg:'#FEF3C7', txt:'#92400E', icone:'📝',  label:'Devoir',   accent:'#F59E0B' },
        audio:    { bg:'#EDE9FE', txt:'#5B21B6', icone:'🎵',  label:'Audio',    accent:'#8B5CF6' },
      };
      const BLOC_TYPE_INFO_L = {
        texte:    { icone:'📝', couleur:'#3B82F6', label:'Cours' },
        video:    { icone:'🎬', couleur:'#8B5CF6', label:'Vidéo' },
        audio:    { icone:'🎧', couleur:'#10B981', label:'Audio' },
        document: { icone:'📄', couleur:'#F59E0B', label:'Document' },
        lien:     { icone:'🔗', couleur:'#06B6D4', label:'Lien' },
        exercice: { icone:'✏️',  couleur:'#EC4899', label:'Exercice' },
        quiz:     { icone:'🧩', couleur:'#F97316', label:'Quiz' },
      };

      function fermerTout() { setSessionDetail(null); setCoursOuvertLive(null); }

      /* SEULES LES QUESTIONS À OPTIONS SONT NOTÉES. Une question ouverte n'a pas de
         bonne réponse — elle se prépare et se discute en classe —, donc elle ne peut
         être ni juste ni fausse. La compter dans le total la rendait automatiquement
         fausse : un bloc de cinq questions ouvertes affichait « 0/5 · 0% » et donnait à
         l'apprenant le sentiment d'avoir tout raté. */
      function scoreQuizL(bloc) {
        const notables = (bloc.questions || []).filter(q => (q.options || []).filter(Boolean).length > 0);
        const bonnes = notables.filter(q => reponsesQuizLive[`${bloc.id}_${q.id}`] === q.correct).length;
        return { bonnes, total: notables.length, pct: notables.length > 0 ? Math.round(bonnes / notables.length * 100) : 0 };
      }

      // ── VUE LECTEUR DE COURS ──
      if (coursOuvertLive) {
        const c       = coursOuvertLive;
        const blocs   = c.blocs || [];
        const typeI   = TYPE_INFO_L[c.type_contenu] || TYPE_INFO_L.lecon;
        const dureeT  = blocs.reduce((s, b) => s + (b.dureeMin || 0), 0);

        return (
          <>
            {/* LE FOND NE FERME PLUS. Un clic à côté suffisait à refermer le lecteur,
                et avec lui les réponses de quiz saisies et non validées — un geste
                involontaire effaçait le travail en cours sans rien demander. On sort par
                le bouton, qui est explicite et au même endroit à chaque fois. */}
            <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', zIndex:1200, backdropFilter:'blur(3px)' }} />
            <div style={{ position:'fixed', top:0, right:0, bottom:0, width:'min(92vw,870px)', background:'#fff', zIndex:1201, display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,0.2)', fontFamily:'"Plus Jakarta Sans",sans-serif', overflow:'hidden' }}>

              {/* Header */}
              <div style={{ background:`linear-gradient(135deg, ${typeI.accent}, ${COULEURS.navy})`, padding:'20px 24px', flexShrink:0 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                  <div>
                    {sess && (
                      <button onClick={() => setCoursOuvertLive(null)} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'3px 10px', color:'rgba(255,255,255,0.85)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', marginBottom:8, display:'inline-flex', alignItems:'center', gap:4 }}>
                        ← Programme : {sess.titre}
                      </button>
                    )}
                    <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>
                      {typeI.icone} {typeI.label} · {c.module} · Semaine {c.semaine}
                    </div>
                    <div style={{ fontSize:19, fontWeight:800, color:'#fff', lineHeight:1.3, marginBottom:4 }}>{c.titre}</div>
                    <div style={{ display:'flex', gap:14, fontSize:12, color:'rgba(255,255,255,0.7)' }}>
                      {dureeT > 0 && <span>⏱ {dureeT} min estimées</span>}
                      <span>📦 {blocs.length} bloc{blocs.length>1?'s':''}</span>
                      {terminesLive[c.id] && (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'rgba(110,231,183,0.2)', color:'#6EE7B7', borderRadius:20, padding:'2px 10px', fontWeight:700 }}>
                          ✅ Lu
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={fermerTout} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, width:34, height:34, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
                </div>
              </div>

              {/* Sommaire */}
              {blocs.length > 0 && (
                <div style={{ display:'flex', gap:6, padding:'10px 24px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, flexWrap:'wrap', flexShrink:0 }}>
                  {blocs.map((b, i) => {
                    const bt = BLOC_TYPE_INFO_L[b.type] || BLOC_TYPE_INFO_L.texte;
                    return (
                      <a key={b.id} href={`#bloclive-${b.id}`} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:20, background:bt.couleur+'15', color:bt.couleur, fontSize:11, fontWeight:700, textDecoration:'none', flexShrink:0 }}>
                        {bt.icone} {i+1}. {b.titre.length > 20 ? b.titre.slice(0,20)+'…' : b.titre}
                      </a>
                    );
                  })}
                </div>
              )}

              {/* Contenu scrollable */}
              <div style={{ flex:1, overflowY:'auto', padding:'24px' }}>
                {blocs.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'60px 20px', color:COULEURS.gris400 }}>
                    <div style={{ fontSize:40, marginBottom:12 }}>📄</div>
                    <div style={{ fontWeight:600, marginBottom:6 }}>{c.titre}</div>
                    {c.description && <div style={{ fontSize:14, lineHeight:1.6 }}>{c.description}</div>}
                  </div>
                ) : blocs.map((b, bi) => {
                  const bt = BLOC_TYPE_INFO_L[b.type] || BLOC_TYPE_INFO_L.texte;
                  return (
                    <div key={b.id} id={`bloclive-${b.id}`} style={{ marginBottom:24, borderRadius:14, border:`1px solid ${bt.couleur}25`, overflow:'hidden' }}>
                      <div style={{ padding:'12px 18px', background:bt.couleur+'0a', borderBottom:`1px solid ${bt.couleur}20`, display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontSize:20 }}>{bt.icone}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, color:COULEURS.navy, fontSize:14 }}>{b.titre}</div>
                          <div style={{ fontSize:11, color:COULEURS.gris400 }}>{bt.label} · {b.dureeMin} min</div>
                        </div>
                        <span style={{ fontSize:12, fontWeight:700, color:COULEURS.gris400 }}>#{bi+1}</span>
                      </div>
                      <div style={{ padding:'16px 18px', background:'#fff' }}>
                        {/* TEXTE */}
                        {(b.type === 'texte' || b.type === 'exercice') && b.sections?.length > 0 && (
                          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                            {b.sections.map(sec => (
                              <div key={sec.id}>
                                {sec.niveau === 'h2' && <h3 style={{ margin:'0 0 6px', fontSize:15, color:COULEURS.navy, fontWeight:700 }}>{sec.titre}</h3>}
                                {sec.niveau === 'note' && (
                                  <div style={{ background:'#FFFBEB', borderLeft:`3px solid #F59E0B`, borderRadius:'0 8px 8px 0', padding:'10px 14px' }}>
                                    <div style={{ fontWeight:700, color:'#92400E', marginBottom:4, fontSize:12 }}>{sec.titre}</div>
                                    <div style={{ fontSize:13, color:'#78350F', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{sec.contenu}</div>
                                  </div>
                                )}
                                {!['h1','h2','h3','note','ul'].includes(sec.niveau) && (
                                  <p style={{ margin:0, fontSize:14, color:COULEURS.gris600, lineHeight:1.7, whiteSpace:'pre-wrap' }}>{sec.contenu}</p>
                                )}
                                {['h1','h2','h3'].includes(sec.niveau) && sec.contenu && (
                                  <p style={{ margin:'4px 0 0', fontSize:14, color:COULEURS.gris600, lineHeight:1.7, whiteSpace:'pre-wrap' }}>{sec.contenu}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* VIDÉO */}
                        {/* Lecteur intégré, comme dans la modale de cours. */}
                        {b.type === 'video' && (
                          b.url ? (
                            /* `urlEmbedVideo` rend `null` quand l'URL n'est PAS une
                             plateforme reconnue — c'est son contrat. Le test `!== b.url`
                             était donc VRAI pour un fichier téléversé (`null !== l'url`),
                             et on affichait `<iframe src={null}>` : un cadre vide. Toute
                             vidéo déposée depuis un ordinateur était invisible chez
                             l'apprenant, sans erreur ni message. On teste la présence de
                             l'URL d'intégration, pas une différence. */
                          urlEmbedVideo(b.url) ? (
                              <iframe src={urlEmbedVideo(b.url)} title={b.titre || 'Vidéo du cours'}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
                                style={{ width:'100%', aspectRatio:'16/9', borderRadius:10, border:'none' }} />
                            ) : (
                              <video src={b.url} controls style={{ width:'100%', maxHeight:380, borderRadius:10, background:'#000' }} />
                            )
                          ) : (
                            <div style={{ background:'#1E293B', borderRadius:10, padding:'28px 20px', textAlign:'center', color:'rgba(255,255,255,0.6)', fontSize:13 }}>
                              🎬 Aucune vidéo jointe à ce bloc.
                            </div>
                          )
                        )}
                      {/* IMAGE — un schéma, une consigne visuelle. Cliquable pour
                            l'agrandir : une illustration lue à 300 px ne sert à rien. */}
                        {b.type === 'image' && (
                          b.url ? (
                            <a href={b.url} target="_blank" rel="noreferrer" style={{ display:'block' }}>
                              <img src={b.url} alt={b.titre || 'Illustration du cours'}
                                style={{ width:'100%', maxHeight:420, objectFit:'contain', borderRadius:10, background:COULEURS.gris50, cursor:'zoom-in' }} />
                            </a>
                          ) : (
                            <div style={{ background:COULEURS.gris50, borderRadius:10, padding:'24px', textAlign:'center', fontSize:13, color:COULEURS.gris400 }}>
                              🖼️ Aucune image jointe à ce bloc.
                            </div>
                          )
                        )}

                        {/* SPEAKING — la consigne du coach. La réponse orale se dépose
                            depuis l'onglet Devoirs, qui sait déjà enregistrer un audio. */}
                        {b.type === 'speaking' && (
                          <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'16px 20px' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                              <span style={{ fontSize:26 }}>🎤</span>
                              <div style={{ fontWeight:700, color:'#991B1B' }}>{b.titre || 'Expression orale'}</div>
                            </div>
                            {b.contenu
                              ? <div style={{ fontSize:13.5, color:'#7F1D1D', lineHeight:1.65, whiteSpace:'pre-wrap' }}>{b.contenu}</div>
                              : <div style={{ fontSize:12, color:COULEURS.gris400 }}>Aucune consigne renseignée.</div>}

                            {/* S'ENTRAÎNER À VOIX HAUTE, ICI MÊME.
                                On réutilise l'enregistreur des devoirs (`startRecording`), avec une clé
                                préfixée pour ne pas mélanger les deux états. L'enregistrement SERT À
                                S'ÉCOUTER : un bloc de cours n'est pas évalué, rien n'est soumis au coach.
                                Un speaking à corriger se crée comme DEVOIR — ce circuit existe déjà et
                                porte, lui, la notation et le retour du coach. */}
                            {(() => {
                              const cle = `cours_${b.id}`;
                              const rec = recState[cle] || {};
                              const audio = submitBlocs[cle]?.audioUrl;
                              return (
                                <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid #FECACA' }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                                    {!rec.recording ? (
                                      <button type="button" onClick={() => startRecording(cle)} disabled={rec.uploading}
                                        style={{ padding:'8px 16px', borderRadius:8, border:'none', background: rec.uploading ? COULEURS.gris200 : '#DC2626', color:'#fff', fontSize:12.5, fontWeight:700, cursor: rec.uploading ? 'wait' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                                        {rec.uploading ? '⏳ Envoi…' : audio ? '🎤 Réenregistrer' : "🎤 M'entraîner"}
                                      </button>
                                    ) : (
                                      <button type="button" onClick={() => stopRecording(cle)}
                                        style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'#1E293B', color:'#fff', fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                                        ⏹ Arrêter ({rec.seconds || 0}s)
                                      </button>
                                    )}
                                    <span style={{ fontSize:11, color:'#9A3412' }}>
                                      {rec.recording ? '🔴 Enregistrement en cours…' : "Pour vous écouter — rien n'est envoyé au coach."}
                                    </span>
                                  </div>
                                  {audio && !rec.recording && <audio src={audio} controls style={{ width:'100%', marginTop:10 }} />}
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* AUDIO */}
                        {/* UN VRAI LECTEUR, pas un lien qui quitte le cours. Le bloc
                            n'offrait qu'un « ▶ Écouter » ouvrant un onglet : l'apprenant
                            perdait sa place dans la leçon pour écouter trente secondes.
                            Le `<audio>` intégré est déjà utilisé plus bas dans ce même
                            fichier (bibliothèque communautaire) — on s'aligne dessus. */}
                        {b.type === 'audio' && (
                          <div style={{ background:'#F0FDF4', borderRadius:10, padding:'16px 20px' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                              <span style={{ fontSize:28 }}>🎧</span>
                              <div style={{ fontWeight:700, color:COULEURS.navy }}>{b.titre}</div>
                            </div>
                            {b.url
                              ? <audio src={b.url} controls style={{ width:'100%' }} />
                              : <div style={{ fontSize:12, color:COULEURS.gris400 }}>Aucun fichier audio joint à ce bloc.</div>}
                          </div>
                        )}
                        {/* LIEN */}
                        {b.type === 'lien' && (
                          <div style={{ background:'#E0F2FE', borderRadius:10, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                            <div style={{ fontSize:28 }}>🔗</div>
                            <div><div style={{ fontWeight:600, color:COULEURS.navy, marginBottom:4 }}>{b.titre}</div><a href={b.url} target="_blank" rel="noreferrer" style={{ fontSize:13, color:couleurTheme }}>Accéder →</a></div>
                          </div>
                        )}
                        {/* DOCUMENT */}
                        {/* LE BOUTON NE FAISAIT RIEN : un `<button>` sans `onClick` ni
                            `href`. Tout document déposé par le coach dans un cours — PDF,
                            Word, Excel — était donc inaccessible à l'apprenant, alors que
                            le fichier existait bel et bien. On passe par la même route de
                            téléchargement que les fichiers de séance (`/api/upload/download`),
                            qui force l'enregistrement sous le nom d'origine. */}
                        {b.type === 'document' && (
                          <div style={{ background:'#FFF7ED', borderRadius:10, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                            <div style={{ fontSize:36 }}>📄</div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontWeight:600, color:COULEURS.navy, marginBottom:4 }}>{b.fichier || b.titre}</div>
                              {b.url ? (
                                <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
                                  <a href={urlOuvrir(b.url, b.fichier || b.titre)} target="_blank" rel="noreferrer"
                                    style={{ fontSize:13, color:'#F59E0B', fontWeight:600 }}>👁 Ouvrir</a>
                                  <a href={urlTelecharger(b.url, b.fichier || b.titre || 'document')}
                                    style={{ fontSize:13, color:'#F59E0B', fontWeight:600 }}>⬇ Télécharger</a>
                                </div>
                              ) : (
                                <div style={{ fontSize:12, color:COULEURS.gris400 }}>Aucun fichier joint à ce bloc.</div>
                              )}
                            </div>
                          </div>
                        )}
                        {/* QUIZ */}
                        {b.type === 'quiz' && (() => {
                          const soumis = quizSoumisLive[b.id];
                          const { bonnes, total, pct } = scoreQuizL(b);
                          return (
                            <div>
                              {b.questions.map((q, qi) => {
                                const clef = `${b.id}_${q.id}`;
                                const choix = reponsesQuizLive[clef];
                                const estBon = choix === q.correct;
                                return (
                                  <div key={q.id} style={{ marginBottom:18, padding:'14px 16px', borderRadius:10, background:soumis?(estBon?'#F0FDF4':'#FFF5F5'):COULEURS.gris50, border:`1px solid ${soumis?(estBon?'#6EE7B7':'#FECACA'):COULEURS.gris200}` }}>
                                    <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:10 }}>{qi+1}. {q.texte}</div>
                                    {/* Même règle que dans le modal de cours : sans option,
                                        la question est ouverte et se prépare pour le cours. */}
                                    {(q.options || []).filter(Boolean).length === 0 ? (
                                      <div style={{ fontSize:12.5, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, padding:'9px 12px' }}>
                                        💬 Question ouverte — préparez votre réponse pour le cours.
                                      </div>
                                    ) : (
                                    <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                                      {(q.options || []).filter(Boolean).map(opt => {
                                        const selec = choix === opt;
                                        const estCorr = opt === q.correct;
                                        let bg='#fff', bord=COULEURS.gris200, txtC=COULEURS.gris600;
                                        if (soumis) { if (estCorr) { bg='#F0FDF4'; bord='#6EE7B7'; txtC='#065F46'; } else if (selec) { bg='#FFF5F5'; bord='#FECACA'; txtC='#991B1B'; } }
                                        else if (selec) { bg=bt.couleur+'15'; bord=bt.couleur; txtC=bt.couleur; }
                                        return (
                                          <button key={opt} disabled={soumis} onClick={() => !soumis && setReponsesQuizLive(p => ({ ...p, [clef]:opt }))}
                                            style={{ textAlign:'left', padding:'9px 14px', borderRadius:8, border:`1.5px solid ${bord}`, background:bg, color:txtC, fontSize:13, fontWeight:selec||soumis&&estCorr?700:400, cursor:soumis?'default':'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:8 }}>
                                            {soumis && estCorr && <span>✅</span>}{soumis && selec && !estCorr && <span>❌</span>}{opt}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    )}
                                  </div>
                                );
                              })}
                              {soumis ? (
                                <div style={{ padding:'12px 16px', borderRadius:10, background:pct>=70?'#D1FAE5':'#FEE2E2', border:`1px solid ${pct>=70?'#6EE7B7':'#FECACA'}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                  <div>
                                    <div style={{ fontWeight:700, color:pct>=70?'#065F46':'#991B1B', fontSize:14 }}>{pct>=70?'🎉 Bravo !':'📖 Continue à réviser'}</div>
                                    <div style={{ fontSize:13, color:pct>=70?'#065F46':'#991B1B', marginTop:2 }}>{bonnes}/{total} bonne{bonnes>1?'s':''} réponse{bonnes>1?'s':''} - {pct}%</div>
                                  </div>
                                  <button onClick={() => { setQuizSoumisLive(p => { const n={...p}; delete n[b.id]; return n; }); setReponsesQuizLive(p => { const n={...p}; b.questions.forEach(q => delete n[`${b.id}_${q.id}`]); return n; }); }}
                                    style={{ padding:'7px 14px', borderRadius:8, border:`1px solid ${pct>=70?'#6EE7B7':'#FECACA'}`, background:'#fff', color:pct>=70?'#065F46':'#991B1B', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                                    Recommencer
                                  </button>
                                </div>
                              ) : (() => {
                                /* ON N'ATTEND QUE LES QUESTIONS NOTABLES. Le bouton exigeait une réponse à
                                   TOUTES les questions du bloc. Une question ouverte ne peut pas en recevoir :
                                   une seule suffisait à désactiver « Valider » pour toujours, et le quiz entier
                                   devenait impossible à soumettre. S'il n'y a QUE des questions ouvertes, il n'y
                                   a rien à corriger : le bouton disparaît au lieu de promettre une note qui ne
                                   viendra pas. */
                                const notables = b.questions.filter(q => (q.options || []).filter(Boolean).length > 0);
                                if (notables.length === 0) return null;
                                const incomplet = notables.some(q => !reponsesQuizLive[`${b.id}_${q.id}`]);
                                return (
                                  <button disabled={incomplet}
                                    onClick={() => setQuizSoumisLive(p => ({ ...p, [b.id]: true }))}
                                    style={{ padding:'10px 20px', borderRadius:8, border:'none', background: incomplet ? COULEURS.gris200 : bt.couleur, color: incomplet ? COULEURS.gris400 : '#fff', fontSize:13, fontWeight:700, cursor: incomplet ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                                    ✓ Valider mes réponses
                                  </button>
                                );
                              })()}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pied */}
              <div style={{ padding:'14px 24px', borderTop:`1px solid ${COULEURS.gris200}`, background:COULEURS.gris50, display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  {terminesLive[c.id] && (
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#D1FAE5', color:'#065F46', borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:700 }}>
                      ✅ Lu
                    </span>
                  )}
                  <span style={{ fontSize:12, color:COULEURS.gris400 }}>
                    {terminesLive[c.id] ? 'Tu as marqué ce cours comme terminé.' : 'Marque le cours comme terminé quand tu as tout lu.'}
                  </span>
                </div>
                {/* Plus de retour possible : marquer un cours comme termine est une
                    declaration, pas un interrupteur. Une fois lu, le bouton disparait -
                    rien ne doit laisser croire qu'on peut revenir dessus. */}
                {terminesLive[c.id] ? (
                  <div style={{ padding:'10px 20px', borderRadius:8, background:'#D1FAE5', color:'#065F46', fontSize:13, fontWeight:700, flexShrink:0 }}>
                    ✅ Terminé
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmLuModal(c)}
                    style={{ padding:'10px 20px', borderRadius:8, border:'none', background:COULEURS.succes, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', flexShrink:0 }}>
                    ✅ Marquer comme terminé
                  </button>
                )}
              </div>
            </div>
          </>
        );
      }

      // ── VUE PROGRAMME DE SESSION (liste des cours) ──
      if (!sess) return null;
      return (
        <>
          <div onClick={fermerTout} style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', zIndex:1200, backdropFilter:'blur(3px)' }} />
          <div style={{ position:'fixed', top:0, right:0, bottom:0, width:'min(92vw,870px)', background:'#fff', zIndex:1201, display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,0.2)', fontFamily:'"Plus Jakarta Sans",sans-serif', overflow:'hidden' }}>

            {/* Header */}
            <div style={{ background:'linear-gradient(135deg,#003087,#0891B2)', padding:'20px 24px', flexShrink:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.5)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Programme de la session</div>
                  <div style={{ fontSize:17, fontWeight:800, color:'#fff', marginBottom:6 }}>{sess.titre}</div>
                  <div style={{ display:'flex', gap:16, fontSize:12, color:'rgba(255,255,255,0.75)', flexWrap:'wrap' }}>
                    <span>📅 {new Date(sess.date_session).toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}</span>
                    <span>⏰ {sess.heure_debut} – {sess.heure_fin}</span>
                  </div>
                </div>
                <button onClick={fermerTout} style={{ background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:8, width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
              </div>
            </div>

            {/* Liste des cours */}
            <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
              {/* DEUX CAS, DEUX MESSAGES. « Le professeur n'a rien lié » et « le cours lié
                  ne vous est pas accessible » ne se réparent pas de la même façon : le
                  premier se règle avec le coach, le second est un cours resté en brouillon
                  ou rattaché à une autre classe. Les confondre envoyait l'apprenant
                  réclamer un cours que son coach avait bel et bien lié. */}
              {contenusSess.length === 0 ? (
                <div style={{ textAlign:'center', padding:'48px 20px', color:COULEURS.gris400, background:COULEURS.gris50, borderRadius:12, border:`1px dashed ${COULEURS.gris200}` }}>
                  <div style={{ fontSize:40, marginBottom:10 }}>{(sess.contenu_ids || []).length > 0 ? '🔒' : '📭'}</div>
                  {(sess.contenu_ids || []).length > 0 ? (
                    <>
                      <div style={{ fontSize:14, fontWeight:600, color:COULEURS.gris600 }}>Le cours de cette session n'est pas encore disponible</div>
                      <div style={{ fontSize:12, marginTop:4 }}>
                        Votre professeur l'a bien rattaché à la séance, mais il ne l'a pas encore publié
                        pour votre classe. Il apparaîtra ici dès qu'il le rendra visible.
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize:14, fontWeight:600, color:COULEURS.gris600 }}>Aucun contenu associé pour l'instant</div>
                      <div style={{ fontSize:12, marginTop:4 }}>Le professeur n'a pas encore lié de cours à cette session.</div>
                    </>
                  )}
                </div>
              ) : contenusSess.map((c, cidx) => {
                const ti      = TYPE_INFO_L[c.type_contenu] || TYPE_INFO_L.lecon;
                const blocs   = c.blocs || [];
                const dureeC  = blocs.reduce((s, b) => s + (b.dureeMin || 0), 0);
                const faitC   = terminesLive[c.id];
                return (
                  <div
                    key={c.id}
                    onClick={() => setCoursOuvertLive(c)}
                    style={{ background:COULEURS.blanc, borderRadius:14, padding:18, boxShadow:'0 2px 10px rgba(0,0,0,0.07)', border:`1.5px solid ${faitC?'#6EE7B7':COULEURS.gris200}`, cursor:'pointer', transition:'transform 0.15s, box-shadow 0.15s', position:'relative' }}
                    onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.12)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='0 2px 10px rgba(0,0,0,0.07)'; }}
                  >
                    {faitC && <div style={{ position:'absolute', top:12, right:12, background:'#D1FAE5', color:'#065F46', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:700 }}>✅ Terminé</div>}
                    {!c.est_visible && <div style={{ position:'absolute', top:12, right:faitC?90:12, background:'#FEF3C7', color:'#D97706', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:700 }}>Aperçu</div>}
                    <div style={{ display:'inline-block', padding:'3px 10px', borderRadius:20, background:ti.bg, color:ti.txt, fontSize:11, fontWeight:700, marginBottom:8 }}>{ti.icone} {ti.label}</div>
                    <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:6, paddingRight: faitC ? 80 : 0 }}>{c.titre}</div>
                    {c.description && <div style={{ fontSize:13, color:COULEURS.gris600, marginBottom:10, lineHeight:1.5 }}>{c.description}</div>}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, color:COULEURS.gris400 }}>
                      <span>{c.module} · Semaine {c.semaine}</span>
                      {dureeC > 0 && <span>⏱ {dureeC} min</span>}
                    </div>
                    <div style={{ marginTop:12, padding:'8px 14px', background:ti.bg+'60', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13, color:ti.txt }}>
                      {faitC ? '✅ Revoir le cours' : '▶ Commencer le cours'}
                    </div>
                  </div>
                );
              })}
              {sess.notes_prof && (
                <div style={{ background:'#EFF6FF', borderRadius:12, padding:'12px 16px', border:'1px solid #BFDBFE' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#1E40AF', marginBottom:6 }}>📝 Note du professeur</div>
                  <div style={{ fontSize:13, color:'#1E40AF', fontStyle:'italic', lineHeight:1.6 }}>{sess.notes_prof}</div>
                </div>
              )}
            </div>

            <div style={{ padding:'12px 24px', borderTop:`1px solid ${COULEURS.gris200}`, background:COULEURS.gris50, fontSize:12, color:COULEURS.gris400, flexShrink:0 }}>
              {contenusSess.length} cours · Cliquez sur un cours pour le lire
            </div>
          </div>
        </>
      );
    })()}

    {/* ── Modal onboarding 1ère connexion ── */}
    {showOnboarding && (
      <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, backdropFilter:'blur(4px)' }}>
        <div style={{ background:COULEURS.blanc, borderRadius:20, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.4)', overflow:'hidden' }}>
          <div style={{ background:'linear-gradient(135deg, #003087 0%, #0891B2 100%)', padding:'24px 28px', flexShrink:0 }}>
            <div style={{ fontSize:28, marginBottom:8 }}>👋</div>
            <div style={{ fontSize:20, fontWeight:800, color:'#fff', marginBottom:4 }}>Bienvenue sur BET E-Learning !</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)' }}>Avant d'accéder à ta plateforme, parcours ces 4 étapes importantes.</div>
            <div style={{ marginTop:12, height:6, background:'rgba(255,255,255,0.2)', borderRadius:3, overflow:'hidden' }}>
              <div style={{ height:'100%', borderRadius:3, background:'#fff', transition:'width 0.4s', width:`${(Object.keys(etapesValidees).filter(k=>etapesValidees[k]).length / ETAPES_ONBOARDING.length)*100}%` }} />
            </div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:4 }}>
              {Object.keys(etapesValidees).filter(k=>etapesValidees[k]).length} / {ETAPES_ONBOARDING.length} étapes validées
            </div>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:24 }}>
            {ETAPES_ONBOARDING.map((e, i) => {
              const valide  = etapesValidees[e.id];
              const ouverte = etapeOuverte === e.id;
              const contenus = contenusOnboarding[e.id] || [];
              return (
                <div key={e.id} style={{ borderRadius:12, marginBottom:12, border:`2px solid ${valide?COULEURS.succes:ouverte?COULEURS.bleuFonce||'#0891B2':COULEURS.gris200}`, background:valide?'#F0FDF4':COULEURS.blanc, transition:'all 0.2s', overflow:'hidden' }}>
                  <div onClick={() => { const nvlOuverte = ouverte ? null : e.id; setEtapeOuverte(nvlOuverte); if (nvlOuverte) contenus.forEach(c => enregistrerVue('ressources', c.id)); }} style={{ display:'flex', gap:14, padding:'16px', cursor:'pointer' }}>
                    <div style={{ width:44, height:44, borderRadius:12, background:valide?COULEURS.succes:COULEURS.gris100, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0, transition:'all 0.2s' }}>
                      {valide ? '✅' : e.icone}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                        <div style={{ fontWeight:700, color:COULEURS.navy, fontSize:14 }}>
                          <span style={{ color:COULEURS.gris400, fontWeight:400, fontSize:12, marginRight:8 }}>Étape {i+1}</span>
                          {e.titre}
                        </div>
                        <span style={{ fontSize:11, color:COULEURS.gris400, flexShrink:0 }}>⏱ {e.duree}</span>
                      </div>
                      <div style={{ fontSize:12, color:COULEURS.gris600, lineHeight:1.5 }}>{e.desc}</div>
                    </div>
                    <span style={{ fontSize:13, color:COULEURS.gris400, flexShrink:0, alignSelf:'center', transform:ouverte?'rotate(90deg)':'rotate(0deg)', transition:'transform 0.2s' }}>▶</span>
                    <div onClick={ev => { ev.stopPropagation(); setEtapesValidees(p => ({ ...p, [e.id]:!p[e.id] })); }}
                      style={{ width:22, height:22, borderRadius:6, border:`2px solid ${valide?COULEURS.succes:COULEURS.gris200}`, background:valide?COULEURS.succes:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, alignSelf:'center', transition:'all 0.2s' }}>
                      {valide && <span style={{ color:'#fff', fontSize:14, fontWeight:800 }}>✓</span>}
                    </div>
                  </div>

                  {ouverte && (
                    <div style={{ padding:'0 16px 16px', borderTop:`1px solid ${COULEURS.gris100}` }}>
                      {contenusOnbLoading ? (
                        <div style={{ padding:'16px 0', textAlign:'center', color:COULEURS.gris400, fontSize:12 }}>Chargement du contenu…</div>
                      ) : contenus.length === 0 ? (
                        <div style={{ padding:'16px 0', textAlign:'center', color:COULEURS.gris400, fontSize:12 }}>Aucun contenu associé à cette étape pour le moment.</div>
                      ) : (
                        <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:12 }}>
                          {contenus.map(c => (
                            <div key={c.id} style={{ background:COULEURS.gris50, borderRadius:10, padding:'12px 14px', border:`1px solid ${COULEURS.gris200}` }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:(c.fichier_url || c.detail) ? 10 : 0 }}>
                                <span style={{ fontSize:16 }}>{c.type==='video'?'🎬':c.type==='audio'?'🎧':c.type==='image'?'🖼️':'📄'}</span>
                                <span style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>{c.titre}</span>
                              </div>
                              {c.detail && (
                                <div style={{ fontSize:12.5, color:COULEURS.gris600 || '#475569', lineHeight:1.6, whiteSpace:'pre-wrap', marginBottom:c.fichier_url ? 10 : 0 }}>{c.detail}</div>
                              )}
                              <MediaContenuOnb contenu={c} />
                              {!c.fichier_url && !c.detail && (
                                <div style={{ fontSize:11, color:COULEURS.gris400, fontStyle:'italic' }}>Fichier non disponible pour le moment.</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ padding:'12px 16px', background:'#EFF6FF', borderRadius:8, fontSize:12, color:'#1D4ED8', marginTop:4 }}>
              ℹ️ Coche chaque étape pour confirmer que tu l'as lue. Tu pourras revenir à ce guide depuis ton profil.
            </div>
          </div>
          <div style={{ padding:'16px 24px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'space-between', alignItems:'center', background:COULEURS.blanc, flexShrink:0 }}>
            <span style={{ fontSize:12, color:COULEURS.gris600 }}>{toutValide ? '✅ Tout est validé !' : `Il reste ${ETAPES_ONBOARDING.filter(e=>!etapesValidees[e.id]).length} étape(s)`}</span>
            <button onClick={validerOnboarding} disabled={!toutValide} style={{ background:toutValide?COULEURS.succes:COULEURS.gris200, color:toutValide?'#fff':COULEURS.gris400, border:'none', borderRadius:10, padding:'11px 28px', fontSize:14, fontWeight:700, cursor:toutValide?'pointer':'not-allowed', fontFamily:'"Plus Jakarta Sans",sans-serif', transition:'all 0.2s' }}>
              Accéder à ma plateforme →
            </button>
          </div>
        </div>
      </div>
    )}
    {/* ══════════ MODAL SESSION PRÉSENTIELLE (apprenant) ══════════ */}
    {presentielInfoModal && (() => {
      const ps = presentielInfoModal;
      return (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.75)', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', padding:16, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
          <div style={{ background:'#fff', borderRadius:18, width:'min(94vw,480px)', overflow:'hidden' }}>

            {/* Header vert */}
            <div style={{ background:'linear-gradient(135deg,#065F46,#059669)', padding:'22px 24px 18px', color:'#fff' }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:6 }}>🏢 Session présentielle</div>
              <div style={{ fontSize:20, fontWeight:900, marginBottom:10 }}>{ps.titre}</div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:'rgba(255,255,255,0.18)' }}>
                  🏢 Présentiel
                </span>
              </div>
            </div>

            {/* Corps */}
            <div style={{ padding:'20px 24px 24px' }}>
              {/* Date / Heure */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
                {[
                  { icon:'📅', label:'Date',  val: fmtDate(ps.date_session) },
                  { icon:'🕐', label:'Heure', val: `${ps.heure_debut}${ps.heure_fin ? ` – ${ps.heure_fin}` : ''}` },
                ].map(item => (
                  <div key={item.label} style={{ background:COULEURS.gris50, borderRadius:10, padding:'12px 14px', textAlign:'center' }}>
                    <div style={{ fontSize:18, marginBottom:4 }}>{item.icon}</div>
                    <div style={{ fontSize:11, color:COULEURS.gris400, fontWeight:600, marginBottom:2 }}>{item.label}</div>
                    <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{item.val}</div>
                  </div>
                ))}
              </div>

              {/* Info lieu */}
              <div style={{ marginBottom:20, padding:'16px', background:'#ECFDF5', borderRadius:12, border:'1.5px solid #6EE7B7' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#065F46', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>📍 Lieu du cours</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#065F46', marginBottom:4 }}>🏢 Séance en présentiel</div>
                <div style={{ fontSize:13, color:'#047857' }}>Rendez-vous en salle selon les instructions de votre coach.</div>
                <div style={{ fontSize:12, color:'#059669', marginTop:6 }}>Aucun lien de visioconférence requis.</div>
              </div>

              {/* Bouton fermeture */}
              <div style={{ textAlign:'center', padding:'14px', borderRadius:12, background:'#ECFDF5', border:'1.5px solid #6EE7B7', fontSize:13, color:'#065F46', fontWeight:700 }}>
                🏢 Rendez-vous le {fmtDate(ps.date_session)} à {ps.heure_debut}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'center' }}>
              <button
                onClick={() => setPresentielInfoModal(null)}
                style={{ padding:'11px 32px', borderRadius:10, border:`1.5px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.navy, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      );
    })()}

    {/* ── Modal de confirmation "Marquer comme Lu" ── */}
    {confirmLuModal && (() => {
      const c = confirmLuModal;
      return (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'"Plus Jakarta Sans",sans-serif', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, width:'min(92vw,420px)', boxShadow:'0 24px 64px rgba(0,0,0,0.25)', overflow:'hidden' }}>
            {/* Header */}
            <div style={{ background:'linear-gradient(135deg,#065F46,#059669)', padding:'20px 24px' }}>
              <div style={{ fontSize:32, marginBottom:6 }}>✅</div>
              <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>Marquer comme lu ?</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', marginTop:4 }}>Cette action confirme que tu as lu ce cours.</div>
            </div>
            {/* Body */}
            <div style={{ padding:'20px 24px' }}>
              <div style={{ background:'#F0FDF4', borderRadius:10, padding:'14px 16px', border:'1px solid #A7F3D0', marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#065F46', marginBottom:4 }}>{c.titre}</div>
                {c.description && <div style={{ fontSize:12, color:'#047857', lineHeight:1.5 }}>{c.description}</div>}
              </div>
              <div style={{ fontSize:13, color:'#374151', lineHeight:1.6 }}>
                Un badge <strong>"Terminé"</strong> sera affiché et ton coach en sera informé. <strong>Cette action est définitive</strong> - tu ne pourras pas revenir en arrière.
              </div>
            </div>
            {/* Footer */}
            <div style={{ padding:'12px 24px 20px', display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button
                onClick={() => setConfirmLuModal(null)}
                style={{ padding:'10px 20px', borderRadius:8, border:`1.5px solid #D1D5DB`, background:'#fff', color:'#374151', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Annuler
              </button>
              <button
                onClick={async () => {
                  // La reponse est LUE avant de toucher a l'ecran : la requete partait
                  // sans jamais etre regardee, l'ecran affichait « terminé » quoi qu'il
                  // arrive et l'etat se perdait au rechargement. Un refus passait
                  // inapercu, ce qui se lit comme un bouton qui ne fonctionne pas.
                  // OPTIMISTE : l'ecran repond au clic. Un aller-retour vers Supabase
                  // coute ~150 ms et la requete en enchaine plusieurs - attendre faisait
                  // paraitre fige un geste qui n'envoie qu'un booleen. On REVIENT EN
                  // ARRIERE si le serveur refuse, en disant pourquoi.
                  setTerminesLive(p => ({ ...p, [c.id]: true }));
                  setConfirmLuModal(null);
                  const s = await supabase.auth.getSession();
                  const tok = s.data.session?.access_token;
                  if (!tok) {
                    setTerminesLive(p => ({ ...p, [c.id]: false }));
                    alert("Session expirée - reconnectez-vous.");
                    return;
                  }
                  try {
                    const r = await fetch(`${_API}/api/apprenants/contenus/${c.id}/lu`, {
                      method: 'POST',
                      headers: { 'Content-Type':'application/json', Authorization:`Bearer ${tok}`, 'X-Plateforme': 'bet-elearning' },
                      body: JSON.stringify({ classe_id: apprenant?.groupe_id || null }),
                    });
                    if (!r.ok) {
                      const d = await r.json().catch(() => ({}));
                      setTerminesLive(p => ({ ...p, [c.id]: false }));
                      alert(d.error || "Impossible de marquer ce cours comme terminé.");
                    }
                  } catch {
                    setTerminesLive(p => ({ ...p, [c.id]: false }));
                    alert("Connexion interrompue - le cours n'a pas été enregistré.");
                  }
                }}
                style={{ padding:'10px 24px', borderRadius:8, border:'none', background:'#059669', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                ✅ Confirmer - Lu !
              </button>
            </div>
          </div>
        </div>
      );
    })()}

    {/* ══════════ CÉLÉBRATION - nouveau badge débloqué ══════════ */}
    {celebrationBadge && (
      <div
        onClick={() => setCelebrationBadge(null)}
        style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.65)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', animation:'bet-fade-in 0.25s ease-out' }}
      >
        <style>{`
          @keyframes bet-fade-in { from { opacity:0; } to { opacity:1; } }
          @keyframes bet-pop-in { 0% { transform:scale(0.3) rotate(-8deg); opacity:0; } 60% { transform:scale(1.08) rotate(3deg); opacity:1; } 100% { transform:scale(1) rotate(0deg); } }
          @keyframes bet-badge-bounce { 0%,100% { transform:translateY(0) scale(1); } 50% { transform:translateY(-10px) scale(1.06); } }
          @keyframes bet-confetti-fall { 0% { transform:translateY(-20px) rotate(0deg); opacity:1; } 100% { transform:translateY(340px) rotate(540deg); opacity:0; } }
          @media (prefers-reduced-motion: reduce) {
            .bet-celebration-card, .bet-celebration-badge, .bet-confetti { animation:none !important; }
          }
        `}</style>
        <div
          className="bet-celebration-card"
          onClick={e => e.stopPropagation()}
          style={{ position:'relative', width:'min(92vw, 380px)', background:'linear-gradient(160deg, #fff, #FFFBEB)', borderRadius:24, padding:'36px 28px 28px', textAlign:'center', boxShadow:'0 24px 60px rgba(0,0,0,0.35)', overflow:'hidden', animation:'bet-pop-in 0.5s cubic-bezier(0.34,1.56,0.64,1)' }}
        >
          {Array.from({ length: 24 }).map((_, i) => {
            const couleurs = ['#F59E0B', '#F97316', '#EF4444', '#22C55E', '#3B82F6', '#A855F7'];
            const gauche = (i * 37) % 100;
            const delai = (i % 8) * 0.12;
            const duree = 1.6 + (i % 5) * 0.2;
            return (
              <div
                key={i}
                className="bet-confetti"
                style={{ position:'absolute', top:-10, left:`${gauche}%`, width:8, height:8, borderRadius: i % 2 ? '50%' : 2, background: couleurs[i % couleurs.length], animation:`bet-confetti-fall ${duree}s ease-in ${delai}s infinite` }}
              />
            );
          })}
          <button
            onClick={() => setCelebrationBadge(null)}
            aria-label="Fermer"
            style={{ position:'absolute', top:14, right:14, width:30, height:30, borderRadius:'50%', border:'none', background:'rgba(0,0,0,0.06)', color:COULEURS.gris600, fontSize:15, fontWeight:700, cursor:'pointer', zIndex:2 }}
          >✕</button>
          <div style={{ position:'relative', zIndex:1 }}>
            <div style={{ fontSize:12, fontWeight:800, color:'#D97706', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>🎉 Nouveau badge débloqué</div>
            <div className="bet-celebration-badge" style={{ fontSize:76, margin:'10px 0', animation:'bet-badge-bounce 1.4s ease-in-out infinite' }}>{celebrationBadge.icone || '🏅'}</div>
            <div style={{ fontSize:20, fontWeight:900, color:COULEURS.navy, marginBottom:6 }}>{celebrationBadge.nom}</div>
            <div style={{ fontSize:13, color:COULEURS.gris600, lineHeight:1.5, marginBottom:22 }}>{celebrationBadge.description}</div>
            <button
              onClick={() => setCelebrationBadge(null)}
              style={{ padding:'12px 32px', borderRadius:12, border:'none', background:'linear-gradient(135deg, #F59E0B, #F97316)', color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer' }}
            >Génial !</button>
          </div>
        </div>
      </div>
    )}

    </>
  );
}
