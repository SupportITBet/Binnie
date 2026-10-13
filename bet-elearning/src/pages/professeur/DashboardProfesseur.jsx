import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { COULEURS } from '../../constants/couleurs';
import { urlOuvrir, urlTelecharger, extensionDe } from '../../utils/fichierUrl';
import { urlEmbedVideo, estChaineYoutube, estFichierVideo, estFichierAudio } from '../../utils/urlVideo';
import TopNavLayout from '../../components/shared/TopNavLayout';
import SalleVirtuelle from '../../components/shared/SalleVirtuelle';
import { SALLE_TEST, MODE_DEV } from '../../utils/genererSalleVirtuelle';
import { fmtFCFA } from '../../mock/paiements';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlerte, useConfirm } from '../../contexts/ConfirmContext';
import { FIREBASE_ACTIF } from '../../services/firebase';
import * as XLSX from 'xlsx';
import { genererPDF, exporterExcelStyle, ligneTableau, fmtDatePDF } from '../../utils/genererPDF';
import { analyserLienVisio } from '../../utils/lienVisio';
import { db } from '../../config/firebase';
import {
  collection, doc, addDoc, setDoc, query, orderBy, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { fetchUpload } from "../../utils/fetchUpload";
import { envoyerFichier, maxMoPour } from "../../utils/uploadFichier";
import { useEnregistreurVocal, microDisponible, dureeLisible } from "../../hooks/useEnregistreurVocal";
import SelecteurEmoji, { insererAuCurseur } from '../../components/shared/SelecteurEmoji';
import { estRole } from '../../constants/roles';
import PhotoClasseEntete from '../../components/shared/PhotoClasseEntete';
import PastilleGroupe from '../../components/shared/PastilleGroupe';
import {
  SectionCoachMesTaches, SectionCoachDisponibilites,
  SectionCoachContrats, SectionCoachProfil,
} from '../../components/professeur/SectionsCoach';

/* OUVERTURE DE LA SALLE VIRTUELLE - le même délai pour le coach, l'apprenant et le parent.
   Il vivait en clair dans chaque écran (`15*60*1000`), ce qui obligeait à le retrouver à la
   main dans quatre fichiers pour le changer d'une minute : nommé ici, il se relit et se
   corrige d'un seul endroit par application. */
const MINUTES_OUVERTURE_SALLE = 10;
const MS_OUVERTURE_SALLE = MINUTES_OUVERTURE_SALLE * 60 * 1000;

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
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, background: fond, color: texte, fontSize: 11, fontWeight: 700 }}>
      {label}
    </span>
  );
}

const STATUT_SESSION = {
  planifiee: { fond: '#E0F2FE', texte: '#0E7490', lib: 'Planifiée' },
  en_cours:  { fond: '#D1FAE5', texte: '#065F46', lib: 'En cours' },
  realisee:  { fond: '#F1F5F9', texte: '#475569', lib: 'Réalisée' },
  annulee:   { fond: '#FEE2E2', texte: '#991B1B', lib: 'Annulée' },
};

/* Aligné sur `TYPE_META` de la médiathèque de dash : mêmes libellés, mêmes emojis,
   mêmes teintes. `video` et `quiz` manquaient alors que le formulaire de création les
   propose — une vidéo déposée s'affichait donc avec la clé brute « video » sur fond gris,
   seul type de la liste à ne pas être reconnu par son propre tableau. */
const COULEUR_TYPE_CONTENU = {
  lecon:    { fond: '#DBEAFE', texte: '#1E40AF', lib: 'Leçon',    emoji: '📖' },
  audio:    { fond: '#EDE9FE', texte: '#6D28D9', lib: 'Audio',    emoji: '🎧' },
  video:    { fond: '#FEE2E2', texte: '#B91C1C', lib: 'Vidéo',    emoji: '🎬' },
  quiz:     { fond: '#CFFAFE', texte: '#0E7490', lib: 'Quiz',     emoji: '❓' },
  exercice: { fond: '#FEF9C3', texte: '#92400E', lib: 'Exercice', emoji: '✏️' },
  devoir:   { fond: '#F3E8FF', texte: '#7E22CE', lib: 'Devoir',   emoji: '📝' },
};

/* LES CLASSES DESTINATAIRES D'UN CONTENU, en une seule forme.
   Un contenu créé avant le passage au multi-classe n'a qu'un `groupe_id`, un
   nouveau porte `groupe_ids`. Les écrans n'ont pas à connaître les deux : ils
   demandent la liste, et le repli sur l'ancien champ se fait ici. */
const classesDuContenu = (c) => (c?.groupe_ids?.length ? c.groupe_ids : (c?.groupe_id ? [c.groupe_id] : []));
/* Les classes visées par un DEVOIR. Même repli que pour les contenus : un devoir créé
   avant le multi-classes ne porte que `classe_id`. */
const classesDuDevoir = (d) => (d?.classe_ids?.length ? d.classe_ids : (d?.classe_id ? [d.classe_id] : []));
const contenuViseClasse = (c, classeId) => classesDuContenu(c).includes(classeId);

const PRESENCE_OPTIONS = [
  { val: 'present', label: 'Présent', fond: '#D1FAE5', texte: '#065F46' },
  { val: 'absent',  label: 'Absent',  fond: '#FEE2E2', texte: '#991B1B' },
  { val: 'retard',  label: 'Retard',  fond: '#FEF9C3', texte: '#92400E' },
];

/* LES NEUF TYPES DE BLOCS, alignés sur la médiathèque de dash
   (`EspaceProfesseur.jsx`, BLOCK_TYPES). Il en manquait deux ici :
    · `image` — un schéma ou une consigne visuelle est souvent ce qui se comprend le plus
      vite, et le coach n'avait aucun moyen d'en déposer dans un cours ;
    · `speaking` — l'expression orale, qui appelle une consigne et une réponse audio de
      l'apprenant, alors que le rendu de devoir sait déjà traiter l'audio. */
const BLOCK_TYPES = {
  texte:    { label: 'Texte / Cours',     icon: '📝', color: '#3B82F6' },
  video:    { label: 'Vidéo',             icon: '🎬', color: '#8B5CF6' },
  audio:    { label: 'Audio / Podcast',   icon: '🎧', color: '#10B981' },
  document: { label: 'Document / PDF',    icon: '📄', color: '#F59E0B' },
  image:    { label: 'Image / Schéma',    icon: '🖼️', color: '#DB2777' },
  lien:     { label: 'Lien externe',      icon: '🔗', color: '#06B6D4' },
  exercice: { label: 'Exercice',          icon: '✏️',  color: '#EC4899' },
  speaking: { label: 'Speaking / Oral',   icon: '🎤', color: '#DC2626' },
  quiz:     { label: 'Quiz / QCM',        icon: '🧩', color: '#F97316' },
};

/* Les blocs recevables selon le TYPE DE CONTENU, comme dash (`BLOCS_PAR_TYPE`).
   Une leçon est le format composite : elle accepte tout. Une capsule audio ou vidéo est
   mono-média — on n'y glisse pas un second média, mais le texte, l'image, le lien, le
   quiz et l'exercice qui l'accompagnent y gardent tout leur sens. */
const BLOCS_PAR_TYPE = {
  lecon: Object.keys(BLOCK_TYPES),
  audio: ['audio', 'texte', 'image', 'lien', 'quiz', 'exercice', 'speaking'],
  video: ['video', 'texte', 'image', 'lien', 'quiz', 'exercice'],
};
const blocsAutorises = (typeContenu) => BLOCS_PAR_TYPE[typeContenu] || Object.keys(BLOCK_TYPES);

/* Les trois types de contenu de la médiathèque, repris de dash. Les deux sélecteurs
   n'offraient ici qu'une seule option — « Leçon » — alors que la colonne `type_contenu`
   accepte déjà les trois et que l'apprenant les affiche distinctement. */
const TYPES_CONTENU = [
  { cle: 'lecon', emoji: '📖', label: 'Leçon', desc: 'Cours théorique' },
  { cle: 'audio', emoji: '🎧', label: 'Audio', desc: 'Écoute & compréhension' },
  { cle: 'video', emoji: '🎬', label: 'Vidéo', desc: 'Contenu vidéo' },
];

/* ═══ APERÇUS DES BLOCS ═══════════════════════════════════════════════════════
   L'éditeur n'affichait qu'une ÉTIQUETTE : l'URL brute pour la vidéo, l'URL brute pour
   l'audio, un nom de fichier pour le document. En cliquant « Modifier » un cours, le coach
   ne pouvait donc pas relire ce qu'il avait déposé — ni vérifier que la vidéo était la
   bonne, ni réécouter l'audio, ni ouvrir le PDF — avant de le publier à ses apprenants.
   Mêmes composants que chez dash, mêmes règles : YouTube/Vimeo par intégration, fichiers
   par `<video>`/`<audio>`, documents PAR LE RELAIS — Cloudinary répond 401 sur les PDF de
   ce compte, un lien direct n'ouvrirait rien. */

const ApercuVideoBloc = ({ bloc }) => {
  const url = bloc?.url;
  if (!url) return <div style={{ background: '#f3f4f6', borderRadius: 8, padding: 12, fontSize: 12, color: '#9ca3af' }}>🎬 Aucune vidéo déposée.</div>;
  const embed = urlEmbedVideo(url);
  if (embed) {
    return (
      <div style={{ borderRadius: 8, overflow: 'hidden', background: '#0f172a' }}>
        <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%' }}>
          <iframe src={embed} title={bloc.titre || 'Vidéo'} allowFullScreen
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} />
        </div>
      </div>
    );
  }
  if (estFichierVideo(url)) {
    return <video src={url} controls preload="metadata" style={{ width: '100%', maxHeight: 320, borderRadius: 8, background: '#000', display: 'block' }} />;
  }
  /* Ni plateforme reconnue ni fichier lisible : on le DIT plutôt que d'afficher un lecteur
     qui resterait noir — le coach croirait à une panne au lieu d'un lien inadapté. */
  return (
    <div style={{ background: '#fffbeb', border: '1px dashed #fcd34d', borderRadius: 8, padding: 12, fontSize: 12, color: '#92400e' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {estChaineYoutube(url) ? 'Ce lien mène à une chaîne YouTube, pas à une vidéo' : 'Cette vidéo ne peut pas être lue ici'}
      </div>
      <a href={url} target="_blank" rel="noreferrer" style={{ color: '#b45309', fontWeight: 700, wordBreak: 'break-all' }}>{url} ↗</a>
    </div>
  );
};

const ApercuAudioBloc = ({ bloc }) => {
  const url = bloc?.url;
  if (!url) return <div style={{ background: '#f0fdf4', borderRadius: 8, padding: 12, fontSize: 12, color: '#9ca3af' }}>🎧 Aucun audio déposé.</div>;
  const embed = urlEmbedVideo(url);
  return (
    <div style={{ background: '#f0fdf4', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        🎧 {bloc.titre || bloc.fichier || 'Audio'}
      </div>
      {embed ? (
        <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 8, overflow: 'hidden', background: '#0f172a' }}>
          <iframe src={embed} title={bloc.titre || 'Audio'} allowFullScreen
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} />
        </div>
      ) : estFichierAudio(url) ? (
        <audio src={url} controls preload="metadata" style={{ width: '100%' }} />
      ) : (
        <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#b45309', fontWeight: 700, wordBreak: 'break-all' }}>{url} ↗</a>
      )}
    </div>
  );
};

const ApercuDocumentBloc = ({ bloc }) => {
  const url = bloc?.url;
  const nom = bloc?.fichier || bloc?.titre || 'Document';
  if (!url) {
    return (
      <div style={{ background: '#fff1f2', borderRadius: 8, padding: 12, fontSize: 12, color: '#92400e', display: 'flex', gap: 10, alignItems: 'center' }}>
        ⚠️ Aucun fichier joint à ce bloc — il s'afficherait vide chez vos apprenants.
      </div>
    );
  }
  // L'extension se lit sur le nom de FICHIER, sinon sur l'URL — jamais sur le titre.
  const ext = extensionDe(bloc?.fichier) || extensionDe(url);
  return (
    <div style={{ background: '#fff1f2', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: ext === 'pdf' ? 10 : 0 }}>
        <span>📄</span>
        <a href={urlOuvrir(url, nom)} target="_blank" rel="noreferrer"
          style={{ fontSize: 12, color: '#dc2626', fontWeight: 700, wordBreak: 'break-word' }}>{nom}</a>
        {bloc?.taille && <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>· {bloc.taille}</span>}
        <a href={urlTelecharger(url, nom)} style={{ marginLeft: 'auto', fontSize: 12, color: '#dc2626', fontWeight: 700 }}>⬇ Télécharger</a>
      </div>
      {/* Le PDF se lit SUR PLACE : c'est le seul format que le navigateur rend nativement,
          et c'est aussi le plus déposé. Pour un .docx ou un .pptx, le lien reste la seule
          voie — aucun navigateur ne les affiche. */}
      {ext === 'pdf' && (
        <iframe title={nom} src={urlOuvrir(url, nom)}
          style={{ width: '100%', height: 420, border: '1px solid #fecdd3', borderRadius: 8, background: '#fff' }} />
      )}
    </div>
  );
};

// ── Composant principal ──────────────────────────────────────────────────────
// Mapping chemin URL → section affichée
const CHEMIN_VERS_SECTION = {
  '/professeur/dashboard':    'tableau_bord',
  '/professeur/planning':     'planning',
  '/professeur/demandes':     'mes_demandes',
  '/professeur/apprenants':   'apprenants',
  '/professeur/mediatheque':  'mediatheque',
  '/professeur/session-live': 'session_live',
  '/professeur/presences':    'presences',
  '/professeur/notes':        'notes_devoirs',
  '/professeur/devoirs':      'notes_devoirs',
  '/professeur/reception':    'notes_devoirs',
  '/professeur/fichiers':     'fichiers',
  '/professeur/paiements':    'paiements',
  '/professeur/recompenses':  'recompenses',
  '/professeur/taches':           'mes_taches',
  '/professeur/disponibilites':   'disponibilites',
  '/professeur/contrats':         'contrats',
  '/professeur/profil':           'mon_profil',
};

const PALIER_INFO = {
  bronze:  { lib: 'Bronze',  couleur: '#9A9A9A', icone: '🥉' },
  argent:  { lib: 'Argent',  couleur: '#C4C4D2', icone: '🥈' },
  or:      { lib: 'Or',      couleur: '#F0B84B', icone: '🥇' },
  platine: { lib: 'Platine', couleur: '#A78BFA', icone: '💎' },
};

const CATEGORIES_FICHIERS = [
  { id: 'tous',     lib: 'Tous',         icone: '📂' },
  { id: 'cours',    lib: 'Cours',        icone: '📄' },
  { id: 'exercice', lib: 'Exercices',    icone: '✏️' },
  { id: 'audio',    lib: 'Audio / Vidéo',icone: '🎵' },
  { id: 'ressource',lib: 'Ressources',   icone: '📎' },
  { id: 'autre',    lib: 'Autres',       icone: '📁' },
];

// ── API e-learning (données réelles) ─────────────────────────────────────────
const _PROF_API  = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const _profHdrs  = () => ({ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token') || ''}`, 'X-Plateforme': 'bet-elearning' });

// ── Onglet Récompenses (gamification coach) ───────────────────────────────────
function OngletRecompenses() {
  const [donnees, setDonnees]     = useState(null);
  const [chargement, setChargement] = useState(true);
  const [filtreCategorie, setFiltreCategorie] = useState('tous');

  useEffect(() => {
    fetch(`${_PROF_API}/api/gamification-coach/moi`, { headers: _profHdrs() })
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
    return <div style={{ textAlign: 'center', padding: '48px 0', color: COULEURS.gris400 }}>Chargement…</div>;
  }
  if (!donnees) {
    return (
      <div style={{ background: COULEURS.blanc, borderRadius: 14, padding: '48px 32px', border: `2px dashed ${COULEURS.gris200}`, textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>🏆</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy }}>Impossible de charger vos récompenses pour le moment.</div>
      </div>
    );
  }

  const palier = PALIER_INFO[donnees.palier] || PALIER_INFO.bronze;
  const badgesFiltres = filtreCategorie === 'tous' ? donnees.badges : donnees.badges.filter(b => b.categorie === filtreCategorie);
  const nbObtenus = donnees.badges.filter(b => b.obtenu).length;

  return (
    <div>
      {/* En-tête palier + score */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ flex: '1 1 220px', background: `linear-gradient(135deg, ${palier.couleur}22, ${palier.couleur}08)`, border: `1.5px solid ${palier.couleur}55`, borderRadius: 16, padding: 22, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>{palier.icone}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: palier.couleur, marginTop: 4 }}>Palier {palier.lib}</div>
          <div style={{ fontSize: 12, color: COULEURS.gris600, marginTop: 4 }}>Score glissant : {donnees.score_glissant}/100</div>
          {!donnees.eligible_or_platine && (
            <div style={{ fontSize: 11, color: '#DC2626', marginTop: 8 }}>⚠ Une anomalie ouverte bloque l'accès aux paliers Or/Platine</div>
          )}
        </div>
        <div style={{ flex: '1 1 140px', background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderRadius: 16, padding: 22, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: COULEURS.navy }}>{donnees.rang ?? '-'}</div>
          <div style={{ fontSize: 12, color: COULEURS.gris600, marginTop: 4 }}>Rang ce mois-ci</div>
        </div>
        <div style={{ flex: '1 1 140px', background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderRadius: 16, padding: 22, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: COULEURS.navy }}>{nbObtenus}/{donnees.badges.length}</div>
          <div style={{ fontSize: 12, color: COULEURS.gris600, marginTop: 4 }}>Badges débloqués</div>
        </div>
      </div>

      {/* Filtres catégories badges */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {CATS.map(c => (
          <button key={c.id} onClick={() => setFiltreCategorie(c.id)}
            style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1.5px solid ${filtreCategorie === c.id ? COULEURS.navy : COULEURS.gris200}`,
              background: filtreCategorie === c.id ? COULEURS.navy : COULEURS.blanc,
              color: filtreCategorie === c.id ? '#fff' : COULEURS.gris600 }}>
            {c.lib}
          </button>
        ))}
      </div>

      {/* Grille badges */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 28 }}>
        {badgesFiltres.map(b => (
          <div key={b.code} style={{
            background: b.obtenu ? COULEURS.blanc : '#F8FAFC', border: `1px solid ${b.obtenu ? COULEURS.gris200 : COULEURS.gris100}`,
            borderRadius: 14, padding: 16, opacity: b.obtenu ? 1 : 0.5, position: 'relative',
          }}>
            <div style={{ fontSize: 26, marginBottom: 8, filter: b.obtenu ? 'none' : 'grayscale(1)' }}>{b.icone}</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: COULEURS.navy }}>{b.nom}</div>
            <div style={{ fontSize: 11.5, color: COULEURS.gris600, marginTop: 4, lineHeight: 1.4 }}>{b.description}</div>
            {b.obtenu && b.obtenu_le && (
              <div style={{ fontSize: 10.5, color: '#059669', marginTop: 8, fontWeight: 600 }}>
                ✓ Obtenu le {new Date(b.obtenu_le).toLocaleDateString('fr-FR')}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Historique des points */}
      <div style={{ fontSize: 15, fontWeight: 800, color: COULEURS.navy, marginBottom: 12 }}>📜 Derniers points reçus</div>
      <div style={{ background: COULEURS.blanc, borderRadius: 14, border: `1px solid ${COULEURS.gris200}`, overflow: 'hidden' }}>
        {donnees.historique.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: COULEURS.gris400, fontSize: 13 }}>Aucun point pour le moment.</div>
        ) : donnees.historique.map((h, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: i < donnees.historique.length - 1 ? `1px solid ${COULEURS.gris100}` : 'none' }}>
            <div>
              <div style={{ fontSize: 13, color: COULEURS.navy, fontWeight: 600 }}>{h.description}</div>
              <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 2 }}>{new Date(h.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: h.points >= 0 ? '#059669' : '#DC2626' }}>{h.points >= 0 ? '+' : ''}{h.points}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Onglet Présences par séance ───────────────────────────────────────────────
function OngletPresencesClasse({ classeId, couleur, nbApprenants, nomClasse }) {
  const [seances,      setSeances]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [erreur,       setErreur]       = useState(null);
  const [expanded,     setExpanded]     = useState(null);
  const [detailMap,    setDetailMap]    = useState({});
  const [loadingDetail,setLoadingDetail]= useState(null);
  const [filtreDebut,  setFiltreDebut]  = useState('');
  const [filtreFin,    setFiltreFin]    = useState('');
  const [page,         setPage]         = useState(0);
  const PAGE_P = 10;

  const col = couleur || '#0891B2';

  useEffect(() => {
    if (!classeId) return;
    setLoading(true);
    fetch(`${_PROF_API}/api/elearning/seances?classe_id=${classeId}`, { headers: _profHdrs() })
      .then(r => r.json())
      .then(d => {
        if (d.error) setErreur(d.error);
        else setSeances((d.seances || []).sort((a, b) => new Date(b.date) - new Date(a.date)));
      })
      .catch(e => setErreur(e.message))
      .finally(() => setLoading(false));
  }, [classeId]);

  function setPeriode(m) {
    const auj = new Date(); const d = new Date(auj);
    if (m === null) { setFiltreDebut(''); setFiltreFin(''); setPage(0); return; }
    d.setMonth(d.getMonth() - m);
    setFiltreDebut(d.toISOString().slice(0,10)); setFiltreFin(auj.toISOString().slice(0,10)); setPage(0);
  }

  async function toggleSession(seanceId) {
    if (expanded === seanceId) { setExpanded(null); return; }
    setExpanded(seanceId);
    if (detailMap[seanceId]) return;
    setLoadingDetail(seanceId);
    try {
      const r = await fetch(`${_PROF_API}/api/elearning/seances/${seanceId}/presences`, { headers: _profHdrs() });
      const d = await r.json();
      setDetailMap(prev => ({ ...prev, [seanceId]: d.presences || [] }));
    } catch { setDetailMap(prev => ({ ...prev, [seanceId]: [] })); }
    finally { setLoadingDetail(null); }
  }

  const STATUT_P = {
    present: { lib:'Présent', bg:'#D1FAE5', txt:'#065F46' },
    absent:  { lib:'Absent',  bg:'#FEE2E2', txt:'#991B1B' },
    retard:  { lib:'Retard',  bg:'#FEF3C7', txt:'#92400E' },
  };

  const realisees = seances.filter(s => s.statut === 'realisee');
  const totalPresences = realisees.reduce((s, r) => s + (r.nb_presents || 0), 0);
  const tauxMoyen = realisees.length > 0 && nbApprenants > 0
    ? Math.round((totalPresences / (realisees.length * nbApprenants)) * 100) : null;

  const filtreActif = filtreDebut || filtreFin;
  const realiseesFiltrees = realisees.filter(s => {
    const d = s.date || null;
    if (filtreDebut && d && d < filtreDebut) return false;
    if (filtreFin   && d && d > filtreFin)   return false;
    return true;
  });
  const nbPages  = Math.ceil(realiseesFiltrees.length / PAGE_P);
  const pageCurr = Math.min(page, Math.max(0, nbPages - 1));
  const slice    = realiseesFiltrees.slice(pageCurr * PAGE_P, (pageCurr + 1) * PAGE_P);

  const nomExport = nomClasse || 'Classe';
  function tauxSeance(s) {
    return s.nb_presents != null && nbApprenants > 0 ? Math.round((s.nb_presents / nbApprenants) * 100) : null;
  }

  function exportExcelPresences() {
    exporterExcelStyle({
      nomFichier: `Presences_${nomExport.replace(/\s+/g, '_')}`,
      titre: `Présences - ${nomExport}`,
      sousTitre: `${realiseesFiltrees.length} séance(s) réalisée(s) · Taux moyen ${tauxMoyen !== null ? tauxMoyen + '%' : '-'}`,
      colonnes: [
        { label: 'Date',                width: 16 },
        { label: 'Apprenants présents', width: 20, align: 'center' },
        { label: 'Total apprenants',    width: 18, align: 'center' },
        { label: 'Taux présence',       width: 16, align: 'center' },
      ],
      lignes: realiseesFiltrees.map(s => {
        const t = tauxSeance(s);
        return [fmtDatePDF(s.date), s.nb_presents ?? '-', nbApprenants, t !== null ? `${t}%` : '-'];
      }),
      couleurEntete: (col || '#0891B2').replace('#', ''),
    });
  }

  function exportPDFPresences() {
    const lignesHtml = realiseesFiltrees.map(s => {
      const t = tauxSeance(s);
      return ligneTableau([
        { val: fmtDatePDF(s.date) },
        { val: s.nb_presents ?? '-', right: true },
        { val: nbApprenants, right: true },
        { val: t !== null ? `${t}%` : '-', right: true, bold: true },
      ]);
    }).join('');
    const html = `
      <div class="doc-header">
        <div>
          <div class="doc-header-logo">BET E-Learning</div>
          <div class="doc-header-sub">Suivi des présences · ${nomExport}</div>
        </div>
        <div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}</div>
      </div>
      <div class="doc-title-band">📋 Présences - ${nomExport}</div>
      <div class="doc-body">
        <div class="kpi-row">
          <div class="kpi-card"><div class="kpi-val">${realisees.length}</div><div class="kpi-lbl">Sessions réalisées</div></div>
          <div class="kpi-card"><div class="kpi-val">${tauxMoyen !== null ? tauxMoyen + '%' : '-'}</div><div class="kpi-lbl">Taux présence moyen</div></div>
          <div class="kpi-card"><div class="kpi-val">${totalPresences}</div><div class="kpi-lbl">Total présences</div></div>
          <div class="kpi-card"><div class="kpi-val">${nbApprenants}</div><div class="kpi-lbl">Apprenants</div></div>
        </div>
        <div class="section-title">Détail par séance</div>
        <table>
          <thead><tr><th>Date</th><th>Présents</th><th>Total</th><th>Taux</th></tr></thead>
          <tbody>${lignesHtml || '<tr><td colspan="4" style="text-align:center;color:#94A3B8">Aucune séance réalisée</td></tr>'}</tbody>
        </table>
        <div class="doc-footer"><span>BET E-Learning</span><span>Document généré automatiquement</span></div>
      </div>`;
    genererPDF(html, `Présences - ${nomExport}`);
  }

  if (loading) return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:COULEURS.gris400 }}>
      <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
      <div style={{ fontSize:13 }}>Chargement des présences…</div>
    </div>
  );

  if (erreur) return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:'#991B1B' }}>
      <div style={{ fontSize:32, marginBottom:12 }}>⚠️</div>
      <div style={{ fontSize:13 }}>{erreur}</div>
    </div>
  );

  return (
    <div>
      {/* KPIs globaux (toujours sur l'ensemble) + exports */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          {[
            { l:'Sessions réalisées',  v:realisees.length,                              c:col },
            { l:'Taux présence moyen', v:tauxMoyen !== null ? `${tauxMoyen}%` : '-',   c:'#16A34A' },
            { l:'Total présences',     v:totalPresences,                                c:'#2563EB' },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'10px 18px', textAlign:'center', minWidth:130 }}>
              <div style={{ fontSize:22, fontWeight:800, color:c }}>{v}</div>
              <div style={{ fontSize:10, color:COULEURS.gris500, marginTop:2, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:8, flexShrink:0 }}>
          <button onClick={exportPDFPresences} disabled={realisees.length === 0}
            style={{ padding:'9px 14px', borderRadius:8, border:`1.5px solid ${col}`, background:COULEURS.blanc, color:col, fontSize:12, fontWeight:700, cursor:realisees.length===0?'not-allowed':'pointer', opacity:realisees.length===0?0.5:1, fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', gap:6 }}>
            📄 Export PDF
          </button>
          <button onClick={exportExcelPresences} disabled={realisees.length === 0}
            style={{ padding:'9px 14px', borderRadius:8, border:'none', background:realisees.length===0?COULEURS.gris200:'#16A34A', color:'#fff', fontSize:12, fontWeight:700, cursor:realisees.length===0?'not-allowed':'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', gap:6 }}>
            📊 Export Excel
          </button>
        </div>
      </div>

      {/* Filtres date */}
      <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <span style={{ fontSize:11, fontWeight:700, color:COULEURS.navy }}>🔍 Filtrer par période</span>
          {filtreActif && (
            <button onClick={() => setPeriode(null)} style={{ fontSize:10, color:'#EF4444', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:5, padding:'2px 8px', cursor:'pointer', fontFamily:'inherit', fontWeight:700 }}>✕ Effacer</button>
          )}
        </div>
        <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
          {[{l:'Tout',fn:()=>setPeriode(null)},{l:'Ce mois',fn:()=>setPeriode(0)},{l:'3 mois',fn:()=>setPeriode(3)},{l:'6 mois',fn:()=>setPeriode(6)},{l:'12 mois',fn:()=>setPeriode(12)}].map(p=>(
            <button key={p.l} onClick={p.fn} style={{ padding:'3px 10px', borderRadius:20, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.gris50, color:COULEURS.navy, fontSize:10, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>{p.l}</button>
          ))}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {[{l:'Du',v:filtreDebut,fn:e=>{setFiltreDebut(e.target.value);setPage(0);}},{l:'Au',v:filtreFin,fn:e=>{setFiltreFin(e.target.value);setPage(0);}}].map(f=>(
            <div key={f.l}>
              <div style={{ fontSize:9, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:3 }}>{f.l}</div>
              <input type="date" value={f.v} onChange={f.fn} style={{ width:'100%', padding:'5px 8px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, fontSize:11, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Compteur */}
      {realisees.length > 0 && (
        <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:8 }}>
          {filtreActif ? `${realiseesFiltrees.length} sur ${realisees.length} séances réalisées` : `${realisees.length} séance${realisees.length>1?'s':''} réalisée${realisees.length>1?'s':''}`}
          {nbPages > 1 && ` · page ${pageCurr+1}/${nbPages}`}
        </div>
      )}

      {realisees.length === 0 ? (
        <div style={{ textAlign:'center', padding:'56px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
          <div style={{ fontSize:44, marginBottom:14 }}>✅</div>
          <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>Aucune séance réalisée</div>
          <div style={{ fontSize:13, color:COULEURS.gris600 }}>Les données de présence apparaîtront ici après chaque séance effectuée.</div>
        </div>
      ) : realiseesFiltrees.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:12, color:COULEURS.gris400 }}>
          <div style={{ fontSize:32, marginBottom:10 }}>🔍</div>
          <div style={{ fontSize:13 }}>Aucune séance sur cette période</div>
        </div>
      ) : (
        <>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
            {slice.map((s) => {
              const total  = nbApprenants || 1;
              const nbP    = s.nb_presents || 0;
              const pct    = Math.round((nbP / total) * 100);
              const isOpen = expanded === s.id;
              const detail = detailMap[s.id] || [];
              return (
                <div key={s.id} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, overflow:'hidden' }}>
                  <div onClick={() => toggleSession(s.id)} style={{ padding:'12px 16px', cursor:'pointer', display:'flex', gap:12, alignItems:'center' }}>
                    <div style={{ flexShrink:0, width:44, textAlign:'center', background:`${col}10`, border:`1px solid ${col}25`, borderRadius:8, padding:'6px 4px' }}>
                      <div style={{ fontSize:16, fontWeight:900, color:col, lineHeight:1 }}>{s.date ? new Date(s.date).getDate() : '-'}</div>
                      <div style={{ fontSize:8, fontWeight:700, color:col, textTransform:'uppercase' }}>{s.date ? new Date(s.date).toLocaleDateString('fr-FR',{month:'short'}) : ''}</div>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:4 }}>{s.titre || 'Séance de cours'}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ flex:1, height:6, background:COULEURS.gris100, borderRadius:3, overflow:'hidden' }}>
                          <div style={{ width:`${pct}%`, height:'100%', background: pct>=75?'#22C55E':pct>=50?'#F59E0B':'#EF4444', borderRadius:3, transition:'width 0.3s' }}/>
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color:COULEURS.navy, flexShrink:0 }}>{nbP}/{total} ({pct}%)</span>
                      </div>
                    </div>
                    <span style={{ fontSize:14, color:COULEURS.gris400, transform: isOpen?'rotate(180deg)':'none', transition:'transform 0.2s', flexShrink:0 }}>▾</span>
                  </div>
                  {isOpen && (
                    <div style={{ borderTop:`1px solid ${COULEURS.gris100}`, padding:'10px 16px' }}>
                      {loadingDetail === s.id ? (
                        <div style={{ textAlign:'center', padding:'16px', color:COULEURS.gris400, fontSize:12 }}>Chargement…</div>
                      ) : detail.length === 0 ? (
                        <div style={{ textAlign:'center', padding:'16px', color:COULEURS.gris400, fontSize:12 }}>Aucun enregistrement de présence.</div>
                      ) : (
                        <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:'6px 12px', fontSize:12 }}>
                          <span style={{ fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase', fontSize:10 }}>Apprenant</span>
                          <span style={{ fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase', fontSize:10 }}>Statut</span>
                          <span style={{ fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase', fontSize:10 }}>Durée</span>
                          {detail.map((p, i) => {
                            const info = p.classes_elearning_apprenants || {};
                            const sp   = STATUT_P[p.statut] || STATUT_P.absent;
                            return (
                              <React.Fragment key={p.id || i}>
                                <span style={{ fontWeight:600, color:COULEURS.navy }}>{info.nom_complet || '-'}</span>
                                <span style={{ background:sp.bg, color:sp.txt, borderRadius:20, padding:'2px 8px', fontSize:10, fontWeight:700, textAlign:'center' }}>{sp.lib}</span>
                                <span style={{ color:COULEURS.gris500 }}>{p.duree_connexion_min != null ? `${p.duree_connexion_min} min` : '-'}</span>
                              </React.Fragment>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {nbPages > 1 && (
            <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
              <button onClick={()=>setPage(0)} disabled={pageCurr===0} style={{ padding:'4px 8px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:pageCurr===0?COULEURS.gris100:COULEURS.blanc, color:pageCurr===0?COULEURS.gris400:COULEURS.navy, cursor:pageCurr===0?'default':'pointer', fontSize:12, fontFamily:'inherit' }}>«</button>
              <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={pageCurr===0} style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:pageCurr===0?COULEURS.gris100:COULEURS.blanc, color:pageCurr===0?COULEURS.gris400:COULEURS.navy, cursor:pageCurr===0?'default':'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit' }}>‹ Préc.</button>
              {Array.from({length:nbPages},(_,i)=>i).filter(i=>Math.abs(i-pageCurr)<=2).map(i=>(
                <button key={i} onClick={()=>setPage(i)} style={{ padding:'4px 9px', borderRadius:6, border:`1px solid ${i===pageCurr?col:COULEURS.gris200}`, background:i===pageCurr?col:COULEURS.blanc, color:i===pageCurr?'#fff':COULEURS.navy, cursor:'pointer', fontSize:11, fontWeight:i===pageCurr?800:500, fontFamily:'inherit' }}>{i+1}</button>
              ))}
              <button onClick={()=>setPage(p=>Math.min(nbPages-1,p+1))} disabled={pageCurr===nbPages-1} style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:pageCurr===nbPages-1?COULEURS.gris100:COULEURS.blanc, color:pageCurr===nbPages-1?COULEURS.gris400:COULEURS.navy, cursor:pageCurr===nbPages-1?'default':'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit' }}>Suiv. ›</button>
              <button onClick={()=>setPage(nbPages-1)} disabled={pageCurr===nbPages-1} style={{ padding:'4px 8px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:pageCurr===nbPages-1?COULEURS.gris100:COULEURS.blanc, color:pageCurr===nbPages-1?COULEURS.gris400:COULEURS.navy, cursor:pageCurr===nbPages-1?'default':'pointer', fontSize:12, fontFamily:'inherit' }}>»</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Onglet Chat groupé par classe (Firebase) ──────────────────────────────────
function _iconeFichierChat(nom = '') {
  const ext = nom.split('.').pop().toLowerCase();
  if (ext === 'pdf') return '📄';
  if (['doc','docx'].includes(ext)) return '📝';
  if (['xls','xlsx'].includes(ext)) return '📊';
  if (['ppt','pptx'].includes(ext)) return '📑';
  if (['zip','rar','7z'].includes(ext)) return '🗜️';
  if (['mp3','wav','ogg','m4a'].includes(ext)) return '🎵';
  if (['jpg','jpeg','png','webp','gif'].includes(ext)) return '🖼️';
  return '📎';
}
/** Un fichier qui s'écoute plutôt qu'il ne se télécharge. */
function _estAudioChat(nom = '') {
  const ext = String(nom).split('.').pop().toLowerCase();
  return ['mp3','wav','ogg','oga','m4a','aac','webm','opus'].includes(ext);
}

function _tailleLisibleChat(octets) {
  if (!octets) return '';
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

function OngletChatGroupe({ classeId, couleur, profile }) {
  const [messages,  setMessages]  = useState([]);
  const [texte,     setTexte]     = useState('');
  // La zone de saisie, pour insérer un emoji là où est le curseur.
  const champSaisieRef = useRef(null);
  const [envoi,     setEnvoi]     = useState(false);
  const [erreur,    setErreur]    = useState(false);
  const [uploadFichier, setUploadFichier] = useState(false);
  const [fichierEnAttente, setFichierEnAttente] = useState(null); // File sélectionné, pas encore envoyé
  const [erreurTaille, setErreurTaille] = useState(false);
  const [citation, setCitation] = useState(null);   // le message auquel on répond
  const [surligne, setSurligne] = useState(null);   // cible d'un clic sur citation
  const [pctVocal, setPctVocal] = useState(0);
  // Trois minutes : au-delà ce n'est plus un message mais un appel, et personne ne
  // réécoute huit minutes d'audio pour retrouver une consigne.
  const vocal = useEnregistreurVocal({ dureeMaxS: 180 });
  const endRef  = useRef(null);
  const fichierInputRef = useRef(null);
  const col = couleur || '#0891B2';

  // Chat de groupe temps réel Firestore - collection classe_chats/{classeId}/messages,
  // couverte par les règles Firestore (allow read, write: if true, comme chats_elearning).
  useEffect(() => {
    if (!classeId) return;
    if (!FIREBASE_ACTIF || !db) { setErreur(true); return; }
    setErreur(false);
    const q = query(collection(db, 'classe_chats', classeId, 'messages'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => setErreur(true));
    return () => unsub();
  }, [classeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior:'smooth' });
  }, [messages]);

  /* Changer de classe ABANDONNE la citation et l'enregistrement en cours : ils désignent
     l'autre fil, et laisser le micro ouvert serait pire encore. */
  useEffect(() => { setCitation(null); setSurligne(null); vocal.annuler(); }, [classeId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Le résumé FIGÉ d'un message, tel qu'il sera recopié dans la citation. Figé et non
   *  résolu à l'affichage : citer un message sorti de la fenêtre chargée donnerait une
   *  citation vide. */
  function extraitDe(m) {
    if (m.fichierUrl) return `${_estAudioChat(m.fichierNom) ? '🎙️' : '📎'} ${m.fichierNom || 'pièce jointe'}`;
    const t = String(m.contenu || '').replace(/\s+/g, ' ').trim();
    return t.length > 120 ? `${t.slice(0, 120)}…` : t;
  }

  function citer(m) {
    setCitation({ id: m.id, auteur_nom: m.envoyeurNom || '-', extrait: extraitDe(m) });
  }

  /** Remonte au message cité et le surligne brièvement. */
  function allerAuMessage(id) {
    const el = document.getElementById(`msg-cl-${id}`);
    if (!el) return;   // hors de la fenêtre : ne rien faire vaut mieux qu'un saut au hasard
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setSurligne(id);
    setTimeout(() => setSurligne(v => (v === id ? null : v)), 1600);
  }

  async function envoyer() {
    const contenu = texte.trim();
    if (!contenu || envoi || !profile || !FIREBASE_ACTIF || !db) return;
    setEnvoi(true);
    setTexte('');
    try {
      await addDoc(collection(db, 'classe_chats', classeId, 'messages'), {
        contenu,
        // Firestore n'a pas de schéma : les messages déjà écrits n'ont pas ce champ et
        // restent parfaitement lisibles.
        repondA:      citation || null,
        envoyeurId:   profile.id,
        envoyeurNom:  `${profile.prenom} ${profile.nom}`,
        envoyeurRole: profile.role,
        timestamp:    serverTimestamp(),
      });
      setCitation(null);
      await setDoc(doc(db, 'classe_chats', classeId), {
        dernierMessage:   contenu,
        dernierMessageAt: serverTimestamp(),
      }, { merge: true });
    } catch {
      setErreur(true);
    }
    setEnvoi(false);
  }

  // Partage de fichier - réservé au coach (ce composant n'est monté que dans son dashboard).
  // Tout format accepté, 5 Mo max. Étape 1 : sélection + aperçu, l'envoi ne part QUE sur
  // confirmation explicite (voir confirmerEnvoiFichier) - jamais automatique.
  function selectionnerFichier(e) {
    const file = e.target.files?.[0];
    if (fichierInputRef.current) fichierInputRef.current.value = '';
    if (!file) return;
    // Le plafond suit la NATURE du fichier (vidéo 100 Mo, audio 20, reste 10) au lieu
    // des 5 Mo du relais, que l'envoi direct rend obsolètes.
    if (file.size > maxMoPour('piece-jointe', file.type) * 1024 * 1024) {
      setErreurTaille(true);
      return;
    }
    setErreurTaille(false);
    setFichierEnAttente(file);
  }

  /** La note vocale emprunte EXACTEMENT le chemin d'une pièce jointe. */
  async function envoyerVocal() {
    const f = vocal.fichier();
    if (!f || uploadFichier || !profile || !FIREBASE_ACTIF || !db) return;
    setUploadFichier(true); setPctVocal(0);
    try {
      /* `message` et non `piece-jointe` : ce dernier exige un jeton d'administration, et
         la note vocale d'un apprenant échouait donc en 403. 5 Mo couvrent largement les
         trois minutes de l'enregistreur. */
      const d = await envoyerFichier(f, 'message', { onProgress: setPctVocal });
      await addDoc(collection(db, 'classe_chats', classeId, 'messages'), {
        contenu:       '',
        fichierUrl:    d.url,
        fichierNom:    f.name,
        fichierTaille: f.size,
        repondA:       citation || null,
        envoyeurId:    profile.id,
        envoyeurNom:   `${profile.prenom} ${profile.nom}`,
        envoyeurRole:  profile.role,
        timestamp:     serverTimestamp(),
      });
      await setDoc(doc(db, 'classe_chats', classeId), {
        dernierMessage: '🎙️ Note vocale', dernierMessageAt: serverTimestamp(),
      }, { merge: true });
      setCitation(null);
      vocal.reinitialiser();
    } catch { setErreur(true); }
    finally { setUploadFichier(false); setPctVocal(0); }
  }

  async function confirmerEnvoiFichier() {
    const file = fichierEnAttente;
    if (!file || !profile || !FIREBASE_ACTIF || !db) return;
    setUploadFichier(true);
    try {
      /* Envoi DIRECT vers Cloudinary, au lieu du relais `/api/upload/message` : ce
         dernier n'acceptait que 5 Mo - en réalité 4,5, plafond que Vercel impose au
         corps d'une requête - et refusait une note vocale un peu longue comme une
         photo de téléphone. */
      const d = await envoyerFichier(file, 'piece-jointe', { onProgress: setPctVocal });
      await addDoc(collection(db, 'classe_chats', classeId, 'messages'), {
        contenu:       '',
        fichierUrl:    d.url,
        fichierNom:    file.name,
        fichierTaille: file.size,
        repondA:       citation || null,
        envoyeurId:    profile.id,
        envoyeurNom:   `${profile.prenom} ${profile.nom}`,
        envoyeurRole:  profile.role,
        timestamp:     serverTimestamp(),
      });
      setCitation(null);
      await setDoc(doc(db, 'classe_chats', classeId), {
        dernierMessage:   `📎 ${d.file.original_name}`,
        dernierMessageAt: serverTimestamp(),
      }, { merge: true });
      setFichierEnAttente(null);
    } catch {
      setErreur(true);
    }
    setUploadFichier(false);
  }

  const fmtHeure = ts => {
    const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date());
    return d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
  };

  const estMoi = msg => msg.envoyeurId === profile?.id;

  /* La photo des auteurs, résolue depuis leur identifiant - le message ne porte que le nom.
     Même endpoint groupé que les autres fils, et même raison : l'historique déjà écrit en
     bénéficie, et un changement de photo se propage partout au lieu de rester figé. */
  const [profilsChat, setProfilsChat] = useState({});
  const idsDemandesChat = useRef(new Set());
  useEffect(() => {
    const manquants = [...new Set(messages.map(m => m.envoyeurId).filter(Boolean))]
      .filter(id => !idsDemandesChat.current.has(id));
    if (!manquants.length) return;
    manquants.forEach(id => idsDemandesChat.current.add(id));
    (async () => {
      try {
        const jeton = localStorage.getItem('bet_access_token') || localStorage.getItem('admin_token') || '';
        const r = await fetch(`${_PROF_API}/api/admin/profils-chat?ids=${manquants.join(',')}`, {
          headers: { Authorization: `Bearer ${jeton}` },
        });
        if (!r.ok) return;
        const d = await r.json();
        if (d.profils && Object.keys(d.profils).length) setProfilsChat(p => ({ ...p, ...d.profils }));
      } catch { /* les initiales et le nom seul restent un repli acceptable */ }
    })();
  }, [messages]);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:300 }}>
      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:8 }}>
        {erreur && (
          <div style={{ textAlign:'center', padding:'10px 16px', background:'#FEF2F2', color:'#991B1B', borderRadius:8, fontSize:12, marginBottom:8 }}>
            ⚠️ Chat indisponible - Firebase non joignable. Réessayez plus tard.
          </div>
        )}
        {!erreur && messages.length === 0 && (
          <div style={{ textAlign:'center', padding:'40px 20px', color:COULEURS.gris400 }}>
            <div style={{ fontSize:36, marginBottom:10 }}>💬</div>
            <div style={{ fontSize:13 }}>Aucun message pour le moment. Soyez le premier à écrire !</div>
          </div>
        )}
        {messages.map((msg) => {
          const moi = estMoi(msg);
          return (
            <div key={msg.id} id={`msg-cl-${msg.id}`}
              style={{ display:'flex', flexDirection:'column', alignItems: moi?'flex-end':'flex-start',
                // Surlignage transitoire après un clic sur une citation : c'est le seul
                // moyen de retrouver le message d'origine dans un fil dense.
                background: surligne === msg.id ? `${col}18` : 'transparent',
                borderRadius:10, padding: surligne === msg.id ? '4px 6px' : 0, transition:'background .35s ease' }}>
              {/* QUI ÉCRIT : sa photo et son nom. Le coach et ses apprenants partagent ce
                  fil, et le seul nom ne disait pas lequel des deux parlait. */}
              {!moi && (
                <span style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3, paddingLeft:2 }}>
                  <PastilleGroupe nom={msg.envoyeurNom} url={profilsChat[msg.envoyeurId]?.avatar_url} taille={20} accent={col} />
                  <span style={{ fontSize:10.5, fontWeight:700, color:col }}>{msg.envoyeurNom}</span>
                </span>
              )}

              {/* LA CITATION - cliquable pour remonter au message d'origine. */}
              {msg.repondA && (
                <button onClick={() => allerAuMessage(msg.repondA.id)} title="Aller au message cité"
                  style={{ maxWidth:'72%', textAlign:'left', cursor:'pointer', border:'none',
                    borderLeft:`3px solid ${moi ? col : COULEURS.gris400}`, background: moi ? `${col}1A` : COULEURS.gris100,
                    borderRadius:'10px 10px 0 0', padding:'6px 10px', marginBottom:2, fontFamily:'inherit' }}>
                  <span style={{ display:'block', fontSize:10, fontWeight:800, color: moi ? col : COULEURS.gris600 }}>
                    {msg.repondA.auteur_nom || '-'}
                  </span>
                  <span style={{ display:'block', fontSize:11.5, color:COULEURS.gris600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {msg.repondA.extrait || '…'}
                  </span>
                </button>
              )}

              {/* L'AUDIO S'ÉCOUTE DANS LE FIL. Tout fichier devenait un lien de
                  téléchargement : une note vocale s'y téléchargeait au lieu de se jouer. */}
              {msg.fichierUrl && _estAudioChat(msg.fichierNom) ? (
                <div style={{ maxWidth:'72%', minWidth:230, background: moi?col:COULEURS.gris100, color: moi?'#fff':COULEURS.navy,
                  borderRadius: moi?'14px 14px 4px 14px':'14px 14px 14px 4px', padding:'8px 10px', display:'flex', flexDirection:'column', gap:5 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:11.5, fontWeight:700, opacity:.85 }}>
                    <span>🎙️</span>
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {String(msg.fichierNom || '').startsWith('note-vocale') ? 'Note vocale' : msg.fichierNom}
                    </span>
                  </div>
                  {/* `preload="metadata"` : la durée s'affiche sans télécharger tout le son. */}
                  <audio controls preload="metadata" src={msg.fichierUrl} style={{ width:'100%', height:34, borderRadius:6 }} />
                </div>
              ) : msg.fichierUrl ? (
                <a href={msg.fichierUrl} target="_blank" rel="noopener noreferrer" style={{ maxWidth:'72%', background: moi?col:COULEURS.gris100, color: moi?'#fff':COULEURS.navy, borderRadius: moi?'14px 14px 4px 14px':'14px 14px 14px 4px', padding:'10px 14px', fontSize:13, lineHeight:1.4, textDecoration:'none', display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:22 }}>{_iconeFichierChat(msg.fichierNom)}</span>
                  <span style={{ overflow:'hidden' }}>
                    <div style={{ fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{msg.fichierNom}</div>
                    <div style={{ fontSize:11, opacity:0.75 }}>{_tailleLisibleChat(msg.fichierTaille)} · Télécharger</div>
                  </span>
                </a>
              ) : (
                <div style={{ maxWidth:'72%', background: moi?col:COULEURS.gris100, color: moi?'#fff':COULEURS.navy, borderRadius: moi?'14px 14px 4px 14px':'14px 14px 14px 4px', padding:'8px 12px', fontSize:13, lineHeight:1.5 }}>
                  {msg.contenu}
                </div>
              )}
              <span style={{ fontSize:10, color:COULEURS.gris400, marginTop:2, paddingLeft:4, paddingRight:4, display:'flex', alignItems:'center', gap:8 }}>
                {fmtHeure(msg.timestamp)}
                <button onClick={() => citer(msg)} title="Répondre à ce message"
                  style={{ border:'none', background:'transparent', cursor:'pointer', color:COULEURS.gris400, fontSize:12, padding:0, lineHeight:1 }}>
                  ↩︎
                </button>
              </span>
            </div>
          );
        })}
        <div ref={endRef}/>
      </div>

      {/* BANDEAU DE CITATION - il doit rester visible pendant qu'on écrit : une réponse
          dont on ne voit plus la cible finit à côté du sujet. */}
      {citation && (
        <div style={{ padding:'8px 16px', borderTop:`1px solid ${COULEURS.gris200}`, background:COULEURS.gris50, display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:15, color:COULEURS.gris400, flexShrink:0 }}>↩︎</span>
          <div style={{ flex:1, minWidth:0, borderLeft:`3px solid ${col}`, paddingLeft:9 }}>
            <div style={{ fontSize:11, fontWeight:800, color:col }}>Réponse à {citation.auteur_nom}</div>
            <div style={{ fontSize:11.5, color:COULEURS.gris600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{citation.extrait || '…'}</div>
          </div>
          <button onClick={() => setCitation(null)} title="Annuler la réponse"
            style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:COULEURS.gris400, lineHeight:1, padding:4 }}>✕</button>
        </div>
      )}

      {/* ENREGISTREMENT EN COURS - minuteur et sortie de secours. Sans « Annuler », la
          seule issue serait d'envoyer un message qu'on ne voulait pas. */}
      {vocal.etat === 'enregistrement' && (
        <div style={{ padding:'9px 16px', borderTop:`1px solid ${COULEURS.gris200}`, background:'#FEF2F2', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ width:9, height:9, borderRadius:'50%', background:'#DC2626', flexShrink:0 }} />
          <span style={{ fontSize:12.5, fontWeight:800, color:'#991B1B', fontVariantNumeric:'tabular-nums' }}>{dureeLisible(vocal.duree)}</span>
          <span style={{ fontSize:11.5, color:'#B91C1C', flex:1 }}>Enregistrement… arrêt automatique à {dureeLisible(vocal.dureeMaxS)}</span>
          <button onClick={vocal.annuler} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#991B1B', fontWeight:700, padding:'4px 8px', fontFamily:'inherit' }}>Annuler</button>
          <button onClick={vocal.arreter} style={{ padding:'6px 14px', background:'#DC2626', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:12, fontFamily:'inherit' }}>⏹ Terminer</button>
        </div>
      )}

      {/* APERÇU AVANT ENVOI - une note vocale partie ne se reprend pas. */}
      {vocal.etat === 'pret' && (
        <div style={{ padding:'9px 16px', borderTop:`1px solid ${COULEURS.gris200}`, background:'#F0FDF4', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <span style={{ fontSize:17 }}>🎙️</span>
          <audio controls src={vocal.url} style={{ flex:1, minWidth:170, height:34 }} />
          <span style={{ fontSize:11.5, color:'#15803D', fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{dureeLisible(vocal.duree)}</span>
          <button onClick={vocal.reinitialiser} disabled={uploadFichier}
            style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:COULEURS.gris600, fontWeight:700, padding:'4px 8px', fontFamily:'inherit' }}>Refaire</button>
          <button onClick={envoyerVocal} disabled={uploadFichier}
            style={{ padding:'6px 14px', background: uploadFichier ? COULEURS.gris200 : '#16A34A', color:'#fff', border:'none', borderRadius:8, cursor: uploadFichier ? 'wait' : 'pointer', fontWeight:700, fontSize:12, fontFamily:'inherit' }}>
            {uploadFichier ? (pctVocal > 0 && pctVocal < 100 ? `${pctVocal}%` : 'Envoi…') : 'Envoyer'}
          </button>
        </div>
      )}

      {vocal.erreur && (
        <div style={{ padding:'8px 16px', borderTop:`1px solid ${COULEURS.gris200}`, background:'#FFFBEB', fontSize:11.5, color:'#92400E' }}>
          {vocal.erreur}
        </div>
      )}

      {/* Aperçu fichier - confirmation obligatoire avant tout envoi */}
      {erreurTaille && (
        <div style={{ padding:'8px 16px', background:'#FEF2F2', color:'#991B1B', fontSize:12, borderTop:`1px solid ${COULEURS.gris200}` }}>
          ⚠️ Fichier trop lourd - {maxMoPour('piece-jointe','video/mp4')} Mo maximum pour une vidéo, 20 Mo pour un son, 10 Mo sinon.
        </div>
      )}
      {fichierEnAttente && (
        <div style={{ padding:'10px 16px', borderTop:`1px solid ${COULEURS.gris200}`, background:COULEURS.gris50, display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:22 }}>{_iconeFichierChat(fichierEnAttente.name)}</span>
          <div style={{ flex:1, overflow:'hidden' }}>
            <div style={{ fontWeight:700, fontSize:13, color:COULEURS.navy, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fichierEnAttente.name}</div>
            <div style={{ fontSize:11, color:COULEURS.gris400 }}>{_tailleLisibleChat(fichierEnAttente.size)} · à confirmer avant envoi</div>
          </div>
          <button
            onClick={() => setFichierEnAttente(null)}
            disabled={uploadFichier}
            style={{ padding:'7px 14px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}
          >
            Annuler
          </button>
          <button
            onClick={confirmerEnvoiFichier}
            disabled={uploadFichier}
            style={{ padding:'7px 16px', borderRadius:8, border:'none', background:col, color:'#fff', fontSize:12, fontWeight:700, cursor: uploadFichier?'not-allowed':'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}
          >
            {uploadFichier ? '⏳ Envoi…' : '✅ Envoyer le fichier'}
          </button>
        </div>
      )}

      {/* Saisie */}
      <div style={{ padding:'10px 16px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', gap:8, background:COULEURS.blanc, flexShrink:0 }}>
        <input ref={fichierInputRef} type="file" style={{ display:'none' }} onChange={selectionnerFichier} />
        <button
          onClick={() => !fichierEnAttente && fichierInputRef.current?.click()}
          disabled={!!fichierEnAttente}
          title="Partager un fichier - tout format"
          style={{ width:36, height:36, borderRadius:'50%', border:`1.5px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:col, fontSize:15, cursor: fichierEnAttente?'not-allowed':'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}
        >
          📎
        </button>

        {/* Le micro n'apparaît que s'il est utilisable : les navigateurs exigent HTTPS ou
            localhost, et un bouton qui échoue toujours vaut moins que pas de bouton. */}
        {microDisponible() && vocal.etat === 'repos' && (
          <button
            onClick={vocal.demarrer}
            disabled={uploadFichier || !!fichierEnAttente}
            title="Enregistrer une note vocale"
            style={{ width:36, height:36, borderRadius:'50%', border:`1.5px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:col, fontSize:15, cursor: (uploadFichier || fichierEnAttente)?'not-allowed':'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}
          >
            🎤
          </button>
        )}

        {/* Les emojis, juste après le micro. */}
        <SelecteurEmoji accent={col}
          onInsert={emoji => {
            const champ = champSaisieRef.current;
            const { texte: nouveau, curseur } = insererAuCurseur(texte, emoji, champ);
            setTexte(nouveau);
            requestAnimationFrame(() => {
              if (!champ) return;
              champ.focus();
              champ.setSelectionRange(curseur, curseur);
            });
          }} />

        <input
          ref={champSaisieRef}
          value={texte}
          onChange={e => setTexte(e.target.value)}
          onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); }}}
          placeholder={citation ? `Répondre à ${citation.auteur_nom}…` : "Écrire un message…"}
          style={{ flex:1, padding:'9px 14px', borderRadius:20, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', outline:'none', background:COULEURS.gris50 }}
        />
        <button
          onClick={envoyer}
          disabled={!texte.trim() || envoi}
          style={{ padding:'9px 16px', borderRadius:20, border:'none', background: texte.trim()?col:COULEURS.gris200, color: texte.trim()?'#fff':COULEURS.gris400, fontSize:13, fontWeight:700, cursor: texte.trim()?'pointer':'default', fontFamily:'"Plus Jakarta Sans", sans-serif', flexShrink:0, transition:'background 0.15s' }}
        >
          Envoyer
        </button>
      </div>
      <div style={{ padding:'4px 16px 8px', fontSize:10, color:COULEURS.gris400, textAlign:'center', flexShrink:0 }}>
        📎 Fichiers partagés automatiquement supprimés après 30 jours
      </div>
    </div>
  );
}

// ── Onglet Sessions réutilisable ──────────────────────────────────────────────
function OngletSessionsClasse({ classeId, coachNom, couleur }) {
  const [seances,     setSeances]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [erreur,      setErreur]      = useState(null);
  const [filtreDebut, setFiltreDebut] = useState('');
  const [filtreFin,   setFiltreFin]   = useState('');
  const [filtreStatut,setFiltreStatut]= useState('tous');
  const [page,        setPage]        = useState(0);
  const PAGE_S = 10;

  useEffect(() => {
    if (!classeId) return;
    setLoading(true);
    setErreur(null);
    fetch(`${_PROF_API}/api/elearning/seances?classe_id=${classeId}`, { headers: _profHdrs() })
      .then(r => r.json())
      .then(d => {
        if (d.error) setErreur(d.error);
        else setSeances((d.seances || []).sort((a, b) => new Date(b.date) - new Date(a.date)));
      })
      .catch(e => setErreur(e.message))
      .finally(() => setLoading(false));
  }, [classeId]);

  function setPeriode(m) {
    if (m === null) { setFiltreDebut(''); setFiltreFin(''); setPage(0); return; }
    const auj = new Date(); const d = new Date(auj);
    d.setMonth(d.getMonth() - m);
    setFiltreDebut(d.toISOString().slice(0,10)); setFiltreFin(auj.toISOString().slice(0,10)); setPage(0);
  }

  const STATUT = {
    planifiee: { lib: 'Planifiée',  bg: '#EFF6FF', txt: '#1E40AF', dot: '#3B82F6' },
    realisee:  { lib: 'Réalisée',   bg: '#F0FDF4', txt: '#166534', dot: '#22C55E' },
    annulee:   { lib: 'Annulée',    bg: '#FEF2F2', txt: '#991B1B', dot: '#EF4444' },
    en_cours:  { lib: 'En cours',   bg: '#FEF3C7', txt: '#92400E', dot: '#F59E0B' },
  };

  const col = couleur || '#0891B2';

  const filtreActif = filtreDebut || filtreFin || filtreStatut !== 'tous';
  const seancesFiltrees = seances.filter(s => {
    const d = s.date || null;
    if (filtreStatut !== 'tous' && s.statut !== filtreStatut) return false;
    if (filtreDebut && d && d < filtreDebut) return false;
    if (filtreFin   && d && d > filtreFin)   return false;
    return true;
  });
  const nbPages  = Math.ceil(seancesFiltrees.length / PAGE_S);
  const pageCurr = Math.min(page, Math.max(0, nbPages - 1));
  const slice    = seancesFiltrees.slice(pageCurr * PAGE_S, (pageCurr + 1) * PAGE_S);

  if (loading) return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:COULEURS.gris400 }}>
      <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
      <div style={{ fontSize:13 }}>Chargement des sessions…</div>
    </div>
  );

  if (erreur) return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:'#991B1B' }}>
      <div style={{ fontSize:32, marginBottom:12 }}>⚠️</div>
      <div style={{ fontSize:13 }}>{erreur}</div>
    </div>
  );

  return (
    <div>
      {/* KPIs globaux */}
      <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap' }}>
        {[
          { l:'Total',      v:seances.length,                                           c:col },
          { l:'Réalisées',  v:seances.filter(s=>s.statut==='realisee').length,          c:'#16A34A' },
          { l:'À venir',    v:seances.filter(s=>s.statut==='planifiee').length,         c:'#2563EB' },
          { l:'Annulées',   v:seances.filter(s=>s.statut==='annulee').length,           c:'#DC2626' },
        ].map(({ l, v, c }) => (
          <div key={l} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'10px 18px', textAlign:'center', minWidth:100 }}>
            <div style={{ fontSize:22, fontWeight:800, color:c }}>{v}</div>
            <div style={{ fontSize:10, color:COULEURS.gris500, marginTop:2, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <span style={{ fontSize:11, fontWeight:700, color:COULEURS.navy }}>🔍 Filtrer</span>
          {filtreActif && (
            <button onClick={() => { setPeriode(null); setFiltreStatut('tous'); }} style={{ fontSize:10, color:'#EF4444', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:5, padding:'2px 8px', cursor:'pointer', fontFamily:'inherit', fontWeight:700 }}>✕ Effacer</button>
          )}
        </div>
        <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
          {[{l:'Tout',fn:()=>setPeriode(null)},{l:'Ce mois',fn:()=>setPeriode(0)},{l:'3 mois',fn:()=>setPeriode(3)},{l:'6 mois',fn:()=>setPeriode(6)},{l:'12 mois',fn:()=>setPeriode(12)}].map(p=>(
            <button key={p.l} onClick={p.fn} style={{ padding:'3px 10px', borderRadius:20, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.gris50, color:COULEURS.navy, fontSize:10, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>{p.l}</button>
          ))}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          {[{l:'Du',v:filtreDebut,fn:e=>{setFiltreDebut(e.target.value);setPage(0);}},{l:'Au',v:filtreFin,fn:e=>{setFiltreFin(e.target.value);setPage(0);}}].map(f=>(
            <div key={f.l}>
              <div style={{ fontSize:9, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:3 }}>{f.l}</div>
              <input type="date" value={f.v} onChange={f.fn} style={{ width:'100%', padding:'5px 8px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, fontSize:11, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
            </div>
          ))}
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:3 }}>Statut</div>
            <select value={filtreStatut} onChange={e=>{setFiltreStatut(e.target.value);setPage(0);}} style={{ width:'100%', padding:'5px 8px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, fontSize:11, fontFamily:'inherit', outline:'none', boxSizing:'border-box', background:COULEURS.blanc }}>
              <option value="tous">Tous</option>
              <option value="realisee">Réalisée</option>
              <option value="planifiee">Planifiée</option>
              <option value="annulee">Annulée</option>
            </select>
          </div>
        </div>
      </div>

      {/* Compteur */}
      {seances.length > 0 && (
        <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:8 }}>
          {filtreActif ? `${seancesFiltrees.length} sur ${seances.length}` : `${seances.length} session${seances.length>1?'s':''}`}
          {nbPages > 1 && ` · page ${pageCurr+1}/${nbPages}`}
        </div>
      )}

      {seances.length === 0 ? (
        <div style={{ textAlign:'center', padding:'56px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
          <div style={{ fontSize:44, marginBottom:14 }}>📅</div>
          <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>Aucune session enregistrée</div>
          <div style={{ fontSize:13, color:COULEURS.gris600, lineHeight:1.6, maxWidth:360, margin:'0 auto' }}>
            Les sessions de cours apparaîtront ici dès que vous commencerez à les saisir.
          </div>
          {coachNom && (
            <div style={{ marginTop:20, background:`${col}10`, border:`1px solid ${col}25`, borderRadius:10, padding:'10px 18px', display:'inline-block' }}>
              <span style={{ fontSize:13, color:COULEURS.navy }}>👨‍🏫 Coach : <strong>{coachNom}</strong></span>
            </div>
          )}
        </div>
      ) : seancesFiltrees.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:12, color:COULEURS.gris400 }}>
          <div style={{ fontSize:32, marginBottom:10 }}>🔍</div>
          <div style={{ fontSize:13 }}>Aucune session pour ces filtres</div>
        </div>
      ) : (
        <>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:12 }}>
            {slice.map((s, i) => {
              const st = STATUT[s.statut] || STATUT.planifiee;
              const duree = s.heure_debut && s.heure_fin
                ? (() => {
                    const [h1, m1] = s.heure_debut.split(':').map(Number);
                    const [h2, m2] = s.heure_fin.split(':').map(Number);
                    const diff = (h2*60+m2) - (h1*60+m1);
                    return diff > 0 ? `${Math.floor(diff/60)}h${String(diff%60).padStart(2,'0')}` : null;
                  })() : null;
              const lien = s.lien_zoom || s.lien_meet || s.lien_teams;
              return (
                <div key={s.id || i} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'14px 18px', display:'flex', gap:14, alignItems:'flex-start' }}>
                  <div style={{ flexShrink:0, width:52, textAlign:'center', background:`${col}10`, border:`1px solid ${col}25`, borderRadius:10, padding:'8px 6px' }}>
                    <div style={{ fontSize:18, fontWeight:900, color:col, lineHeight:1 }}>{s.date ? new Date(s.date).getDate() : '-'}</div>
                    <div style={{ fontSize:9, fontWeight:700, color:col, textTransform:'uppercase', letterSpacing:'0.05em', marginTop:2 }}>{s.date ? new Date(s.date).toLocaleDateString('fr-FR',{month:'short'}) : ''}</div>
                    {s.date && <div style={{ fontSize:8, color:COULEURS.gris400, marginTop:1 }}>{new Date(s.date).getFullYear()}</div>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                      <span style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{s.titre || s.type || 'Session de cours'}</span>
                      <span style={{ background:st.bg, color:st.txt, borderRadius:20, padding:'2px 9px', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                        <span style={{ width:6, height:6, borderRadius:'50%', background:st.dot, display:'inline-block' }}/>
                        {st.lib}
                      </span>
                    </div>
                    <div style={{ display:'flex', gap:12, flexWrap:'wrap', fontSize:11, color:COULEURS.gris500 }}>
                      {s.heure_debut && <span>🕐 {s.heure_debut}{s.heure_fin ? ` → ${s.heure_fin}` : ''}{duree ? ` (${duree})` : ''}</span>}
                      {s.nb_presents != null && <span>👥 {s.nb_presents} présent{s.nb_presents!==1?'s':''}</span>}
                      {lien && <span style={{ color:col }}>🔗 <a href={lien} target="_blank" rel="noreferrer" style={{ color:col, textDecoration:'none', fontWeight:600 }}>Lien visio</a></span>}
                    </div>
                    {(s.objectifs_session || s.compte_rendu || s.bilan_session) && (
                      <div style={{ marginTop:8, fontSize:12, color:COULEURS.gris600, background:COULEURS.gris50, borderRadius:8, padding:'8px 12px', lineHeight:1.5 }}>
                        {s.objectifs_session && <div><span style={{ fontWeight:600 }}>Objectifs :</span> {s.objectifs_session}</div>}
                        {s.compte_rendu     && <div style={{ marginTop:s.objectifs_session?4:0 }}><span style={{ fontWeight:600 }}>Compte-rendu :</span> {s.compte_rendu}</div>}
                        {s.bilan_session    && <div style={{ marginTop:4 }}><span style={{ fontWeight:600 }}>Bilan :</span> {s.bilan_session}</div>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {nbPages > 1 && (
            <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
              <button onClick={()=>setPage(0)} disabled={pageCurr===0} style={{ padding:'4px 8px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:pageCurr===0?COULEURS.gris100:COULEURS.blanc, color:pageCurr===0?COULEURS.gris400:COULEURS.navy, cursor:pageCurr===0?'default':'pointer', fontSize:12, fontFamily:'inherit' }}>«</button>
              <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={pageCurr===0} style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:pageCurr===0?COULEURS.gris100:COULEURS.blanc, color:pageCurr===0?COULEURS.gris400:COULEURS.navy, cursor:pageCurr===0?'default':'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit' }}>‹ Préc.</button>
              {Array.from({length:nbPages},(_,i)=>i).filter(i=>Math.abs(i-pageCurr)<=2).map(i=>(
                <button key={i} onClick={()=>setPage(i)} style={{ padding:'4px 9px', borderRadius:6, border:`1px solid ${i===pageCurr?col:COULEURS.gris200}`, background:i===pageCurr?col:COULEURS.blanc, color:i===pageCurr?'#fff':COULEURS.navy, cursor:'pointer', fontSize:11, fontWeight:i===pageCurr?800:500, fontFamily:'inherit' }}>{i+1}</button>
              ))}
              <button onClick={()=>setPage(p=>Math.min(nbPages-1,p+1))} disabled={pageCurr===nbPages-1} style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:pageCurr===nbPages-1?COULEURS.gris100:COULEURS.blanc, color:pageCurr===nbPages-1?COULEURS.gris400:COULEURS.navy, cursor:pageCurr===nbPages-1?'default':'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit' }}>Suiv. ›</button>
              <button onClick={()=>setPage(nbPages-1)} disabled={pageCurr===nbPages-1} style={{ padding:'4px 8px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:pageCurr===nbPages-1?COULEURS.gris100:COULEURS.blanc, color:pageCurr===nbPages-1?COULEURS.gris400:COULEURS.navy, cursor:pageCurr===nbPages-1?'default':'pointer', fontSize:12, fontFamily:'inherit' }}>»</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OngletPresencesApprenant({ presA, tauxA, couleurTheme, mesSessions, loadingPresModalApp }) {
  const [pdebut, setPdebut]  = useState('');
  const [pfin,   setPfin]    = useState('');
  const [pstatut,setPstatut] = useState('tous');
  const [ppage,  setPpage]   = useState(0);
  const PP = 10;

  function setPeriodeP(m) {
    const auj = new Date(); const d = new Date(auj);
    d.setMonth(d.getMonth() - m);
    setPdebut(d.toISOString().slice(0,10)); setPfin(auj.toISOString().slice(0,10));
  }

  const presFiltrees = presA.filter(p => {
    const d = p.seance?.date || null;
    if (pstatut !== 'tous' && p.statut !== pstatut) return false;
    if (pdebut && d && d < pdebut) return false;
    if (pfin   && d && d > pfin)   return false;
    return true;
  });
  const nbPagesP  = Math.ceil(presFiltrees.length / PP);
  const pageP     = Math.min(ppage, Math.max(0, nbPagesP - 1));
  const sliceP    = presFiltrees.slice(pageP * PP, (pageP + 1) * PP);
  const filtreActP = pdebut || pfin || pstatut !== 'tous';

  return (
    <div>
      <div style={{ display:'flex', gap:12, marginBottom:16 }}>
        {[
          { val: presA.filter(p=>p.statut==='present').length, lbl:'Présent(s)', fond:'#D1FAE5', txt:'#065F46' },
          { val: presA.filter(p=>p.statut==='absent').length,  lbl:'Absent(s)',  fond:'#FEE2E2', txt:'#991B1B' },
          { val: presA.filter(p=>p.statut==='retard').length,  lbl:'Retard(s)',  fond:'#FEF9C3', txt:'#92400E' },
          { val: tauxA !== null ? `${tauxA}%` : '-', lbl:'Taux', fond: tauxA !== null && tauxA >= 75 ? '#D1FAE5':'#FEF9C3', txt: tauxA !== null && tauxA >= 75 ? '#065F46':'#92400E' },
        ].map(k => (
          <div key={k.lbl} style={{ flex:1, background:k.fond, borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
            <div style={{ fontSize:20, fontWeight:800, color:k.txt }}>{k.val}</div>
            <div style={{ fontSize:10, color:k.txt, opacity:.7, marginTop:2 }}>{k.lbl}</div>
          </div>
        ))}
      </div>
      <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'10px 12px', marginBottom:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <span style={{ fontSize:11, fontWeight:700, color:COULEURS.navy }}>🔍 Filtrer</span>
          {filtreActP && <button onClick={() => { setPdebut(''); setPfin(''); setPstatut('tous'); setPpage(0); }} style={{ fontSize:10, color:'#EF4444', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:5, padding:'2px 7px', cursor:'pointer', fontFamily:'inherit', fontWeight:700 }}>✕ Effacer</button>}
        </div>
        <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
          {[{l:'Tout',fn:()=>{setPdebut('');setPfin('');}},{l:'Ce mois',fn:()=>setPeriodeP(0)},{l:'3 mois',fn:()=>setPeriodeP(3)},{l:'6 mois',fn:()=>setPeriodeP(6)}].map(p=>(
            <button key={p.l} onClick={p.fn} style={{ padding:'3px 10px', borderRadius:20, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.gris50, color:COULEURS.navy, fontSize:10, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>{p.l}</button>
          ))}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          {[{l:'Du',v:pdebut,fn:e=>setPdebut(e.target.value)},{l:'Au',v:pfin,fn:e=>setPfin(e.target.value)}].map(f=>(
            <div key={f.l}>
              <div style={{ fontSize:9, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:3 }}>{f.l}</div>
              <input type="date" value={f.v} onChange={f.fn} style={{ width:'100%', padding:'5px 8px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, fontSize:11, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
            </div>
          ))}
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:3 }}>Statut</div>
            <select value={pstatut} onChange={e=>{setPstatut(e.target.value);setPpage(0);}} style={{ width:'100%', padding:'5px 8px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, fontSize:11, fontFamily:'inherit', outline:'none', boxSizing:'border-box', background:COULEURS.blanc }}>
              <option value="tous">Tous</option>
              <option value="present">Présent</option>
              <option value="absent">Absent</option>
              <option value="retard">Retard</option>
            </select>
          </div>
        </div>
      </div>
      {presFiltrees.length > 0 && (
        <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:8 }}>
          {filtreActP ? `${presFiltrees.length} sur ${presA.length}` : `${presA.length} présence${presA.length>1?'s':''}`}
          {nbPagesP > 1 && ` · page ${pageP+1}/${nbPagesP}`}
        </div>
      )}
      {loadingPresModalApp ? (
        <div style={{ textAlign:'center', padding:24, color:COULEURS.gris400, fontSize:13 }}>⏳ Chargement…</div>
      ) : presFiltrees.length === 0 ? (
        <div style={{ textAlign:'center', padding:32, color:COULEURS.gris400, fontSize:13, background:COULEURS.gris50, borderRadius:12, border:`1px dashed ${COULEURS.gris200}` }}>
          {presA.length === 0 ? 'Aucun historique de présence' : 'Aucun résultat pour ces filtres'}
        </div>
      ) : (
        <>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
            {sliceP.map(p => {
              const seance = p.seance || mesSessions.find(s => s.id === p.seance_id);
              const opt = PRESENCE_OPTIONS.find(o => o.val === p.statut) || PRESENCE_OPTIONS[0];
              const typeIcon = seance?.type === 'presentiel' ? '🏢' : '📡';
              return (
                <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 14px', background:COULEURS.gris50, borderRadius:10, border:`1px solid ${COULEURS.gris200}` }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:13, color:COULEURS.navy }}>{typeIcon} {seance?.objectifs_session || '-'}</div>
                    <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:3 }}>
                      📅 {seance?.date ? fmtDate(seance.date) : ''}{seance?.heure_debut ? ` · ⏰ ${seance.heure_debut}` : ''}{p.observation ? ` · ${p.observation}` : ''}
                    </div>
                  </div>
                  <Puce label={opt.label} fond={opt.fond} texte={opt.texte} />
                </div>
              );
            })}
          </div>
          {nbPagesP > 1 && (
            <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
              <button onClick={() => setPpage(0)} disabled={pageP===0} style={{ padding:'4px 8px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:pageP===0?COULEURS.gris100:COULEURS.blanc, color:pageP===0?COULEURS.gris400:COULEURS.navy, cursor:pageP===0?'default':'pointer', fontSize:12, fontFamily:'inherit' }}>«</button>
              <button onClick={() => setPpage(p=>Math.max(0,p-1))} disabled={pageP===0} style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:pageP===0?COULEURS.gris100:COULEURS.blanc, color:pageP===0?COULEURS.gris400:COULEURS.navy, cursor:pageP===0?'default':'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit' }}>‹</button>
              {Array.from({length:nbPagesP},(_,i)=>i).filter(i=>Math.abs(i-pageP)<=2).map(i=>(
                <button key={i} onClick={()=>setPpage(i)} style={{ padding:'4px 9px', borderRadius:6, border:`1px solid ${i===pageP?couleurTheme:COULEURS.gris200}`, background:i===pageP?couleurTheme:COULEURS.blanc, color:i===pageP?'#fff':COULEURS.navy, cursor:'pointer', fontSize:11, fontWeight:i===pageP?800:500, fontFamily:'inherit' }}>{i+1}</button>
              ))}
              <button onClick={() => setPpage(p=>Math.min(nbPagesP-1,p+1))} disabled={pageP===nbPagesP-1} style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:pageP===nbPagesP-1?COULEURS.gris100:COULEURS.blanc, color:pageP===nbPagesP-1?COULEURS.gris400:COULEURS.navy, cursor:pageP===nbPagesP-1?'default':'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit' }}>›</button>
              <button onClick={() => setPpage(nbPagesP-1)} disabled={pageP===nbPagesP-1} style={{ padding:'4px 8px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:pageP===nbPagesP-1?COULEURS.gris100:COULEURS.blanc, color:pageP===nbPagesP-1?COULEURS.gris400:COULEURS.navy, cursor:pageP===nbPagesP-1?'default':'pointer', fontSize:12, fontFamily:'inherit' }}>»</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OngletSessionsApprenant({ sessClasse, presA, couleurTheme }) {
  const STATUT_S = { planifiee:{lib:'Planifiée',bg:'#EFF6FF',txt:'#1E40AF',dot:'#3B82F6'}, realisee:{lib:'Réalisée',bg:'#F0FDF4',txt:'#166534',dot:'#22C55E'}, annulee:{lib:'Annulée',bg:'#FEF2F2',txt:'#991B1B',dot:'#EF4444'}, en_cours:{lib:'En cours',bg:'#FEF3C7',txt:'#92400E',dot:'#F59E0B'} };
  const [sdebut, setSdebut]  = useState('');
  const [sfin,   setSfin]    = useState('');
  const [sstatut,setSstatut] = useState('tous');
  const [spage,  setSpage]   = useState(0);
  const SP = 8;

  function setPeriodeS(m) {
    const auj = new Date(); const d = new Date(auj);
    d.setMonth(d.getMonth() - m);
    setSdebut(d.toISOString().slice(0,10)); setSfin(auj.toISOString().slice(0,10));
  }

  const sessFiltrees = sessClasse.filter(s => {
    const d = s.date_session || null;
    if (sstatut !== 'tous' && s.statut !== sstatut) return false;
    if (sdebut && d && d < sdebut) return false;
    if (sfin   && d && d > sfin)   return false;
    return true;
  });
  const nbPagesS  = Math.ceil(sessFiltrees.length / SP);
  const pageS     = Math.min(spage, Math.max(0, nbPagesS - 1));
  const sliceS    = sessFiltrees.slice(pageS * SP, (pageS + 1) * SP);
  const filtreActS = sdebut || sfin || sstatut !== 'tous';

  return (
    <div>
      <div style={{ display:'flex', gap:12, marginBottom:16 }}>
        {[
          { val:sessClasse.length,                                           lbl:'Total',      fond:'#EFF6FF', txt:'#1E40AF' },
          { val:sessClasse.filter(s=>s.statut==='realisee').length,          lbl:'Réalisées',  fond:'#D1FAE5', txt:'#065F46' },
          { val:sessClasse.filter(s=>s.statut==='planifiee').length,         lbl:'À venir',    fond:'#FEF9C3', txt:'#92400E' },
          { val:sessClasse.filter(s=>s.statut==='annulee').length,           lbl:'Annulées',   fond:'#FEE2E2', txt:'#991B1B' },
        ].map(k=>(
          <div key={k.lbl} style={{ flex:1, background:k.fond, borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
            <div style={{ fontSize:20, fontWeight:800, color:k.txt }}>{k.val}</div>
            <div style={{ fontSize:10, color:k.txt, opacity:.7, marginTop:2 }}>{k.lbl}</div>
          </div>
        ))}
      </div>
      <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'10px 12px', marginBottom:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <span style={{ fontSize:11, fontWeight:700, color:COULEURS.navy }}>🔍 Filtrer</span>
          {filtreActS && <button onClick={() => { setSdebut(''); setSfin(''); setSstatut('tous'); setSpage(0); }} style={{ fontSize:10, color:'#EF4444', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:5, padding:'2px 7px', cursor:'pointer', fontFamily:'inherit', fontWeight:700 }}>✕ Effacer</button>}
        </div>
        <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
          {[{l:'Tout',fn:()=>{setSdebut('');setSfin('');}},{l:'Ce mois',fn:()=>setPeriodeS(0)},{l:'3 mois',fn:()=>setPeriodeS(3)},{l:'6 mois',fn:()=>setPeriodeS(6)}].map(p=>(
            <button key={p.l} onClick={p.fn} style={{ padding:'3px 10px', borderRadius:20, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.gris50, color:COULEURS.navy, fontSize:10, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>{p.l}</button>
          ))}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          {[{l:'Du',v:sdebut,fn:e=>setSdebut(e.target.value)},{l:'Au',v:sfin,fn:e=>setSfin(e.target.value)}].map(f=>(
            <div key={f.l}>
              <div style={{ fontSize:9, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:3 }}>{f.l}</div>
              <input type="date" value={f.v} onChange={f.fn} style={{ width:'100%', padding:'5px 8px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, fontSize:11, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
            </div>
          ))}
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', marginBottom:3 }}>Statut</div>
            <select value={sstatut} onChange={e=>{setSstatut(e.target.value);setSpage(0);}} style={{ width:'100%', padding:'5px 8px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, fontSize:11, fontFamily:'inherit', outline:'none', boxSizing:'border-box', background:COULEURS.blanc }}>
              <option value="tous">Tous</option>
              <option value="realisee">Réalisée</option>
              <option value="planifiee">Planifiée</option>
              <option value="annulee">Annulée</option>
            </select>
          </div>
        </div>
      </div>
      {sessFiltrees.length > 0 && (
        <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:8 }}>
          {filtreActS ? `${sessFiltrees.length} sur ${sessClasse.length}` : `${sessClasse.length} session${sessClasse.length>1?'s':''}`}
          {nbPagesS > 1 && ` · page ${pageS+1}/${nbPagesS}`}
        </div>
      )}
      {sessClasse.length === 0 ? (
        <div style={{ textAlign:'center', padding:32, color:COULEURS.gris400, fontSize:13, background:COULEURS.gris50, borderRadius:12, border:`1px dashed ${COULEURS.gris200}` }}>
          Aucune session pour cette classe
        </div>
      ) : sessFiltrees.length === 0 ? (
        <div style={{ textAlign:'center', padding:28, color:COULEURS.gris400, fontSize:13, background:COULEURS.gris50, borderRadius:12, border:`1px dashed ${COULEURS.gris200}` }}>
          Aucune session sur cette période
        </div>
      ) : (
        <>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
            {sliceS.map(s => {
              const st = STATUT_S[s.statut] || STATUT_S.planifiee;
              const duree = s.heure_debut && s.heure_fin ? (() => {
                const [h1,m1]=s.heure_debut.split(':').map(Number);
                const [h2,m2]=s.heure_fin.split(':').map(Number);
                const diff=(h2*60+m2)-(h1*60+m1);
                return diff>0?`${Math.floor(diff/60)}h${String(diff%60).padStart(2,'0')}`:null;
              })() : null;
              const presSession = presA.find(p => p.seance_id === s.id);
              const optPres = presSession ? PRESENCE_OPTIONS.find(o=>o.val===presSession.statut) : null;
              return (
                <div key={s.id} style={{ background:COULEURS.gris50, borderRadius:10, border:`1px solid ${COULEURS.gris200}`, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                      <div style={{ width:44, textAlign:'center', background:`${couleurTheme}10`, border:`1px solid ${couleurTheme}25`, borderRadius:8, padding:'4px' }}>
                        <div style={{ fontSize:14, fontWeight:900, color:couleurTheme, lineHeight:1 }}>{s.date_session ? new Date(s.date_session).getDate() : '-'}</div>
                        <div style={{ fontSize:8, fontWeight:700, color:couleurTheme, textTransform:'uppercase' }}>{s.date_session ? new Date(s.date_session).toLocaleDateString('fr-FR',{month:'short'}) : ''}</div>
                      </div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{s.titre}</div>
                        <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:2 }}>
                          {s.heure_debut && `⏰ ${s.heure_debut}${s.heure_fin?` – ${s.heure_fin}`:''}${duree?` (${duree})`:''}`}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                    <span style={{ padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700, background:st.bg, color:st.txt, display:'flex', alignItems:'center', gap:4 }}>
                      <span style={{ width:5, height:5, borderRadius:'50%', background:st.dot, display:'inline-block' }}/>
                      {st.lib}
                    </span>
                    {optPres && <Puce label={optPres.label} fond={optPres.fond} texte={optPres.texte} />}
                  </div>
                </div>
              );
            })}
          </div>
          {nbPagesS > 1 && (
            <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
              <button onClick={()=>setSpage(0)} disabled={pageS===0} style={{ padding:'4px 8px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:pageS===0?COULEURS.gris100:COULEURS.blanc, color:pageS===0?COULEURS.gris400:COULEURS.navy, cursor:pageS===0?'default':'pointer', fontSize:12, fontFamily:'inherit' }}>«</button>
              <button onClick={()=>setSpage(p=>Math.max(0,p-1))} disabled={pageS===0} style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:pageS===0?COULEURS.gris100:COULEURS.blanc, color:pageS===0?COULEURS.gris400:COULEURS.navy, cursor:pageS===0?'default':'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit' }}>‹</button>
              {Array.from({length:nbPagesS},(_,i)=>i).filter(i=>Math.abs(i-pageS)<=2).map(i=>(
                <button key={i} onClick={()=>setSpage(i)} style={{ padding:'4px 9px', borderRadius:6, border:`1px solid ${i===pageS?couleurTheme:COULEURS.gris200}`, background:i===pageS?couleurTheme:COULEURS.blanc, color:i===pageS?'#fff':COULEURS.navy, cursor:'pointer', fontSize:11, fontWeight:i===pageS?800:500, fontFamily:'inherit' }}>{i+1}</button>
              ))}
              <button onClick={()=>setSpage(p=>Math.min(nbPagesS-1,p+1))} disabled={pageS===nbPagesS-1} style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:pageS===nbPagesS-1?COULEURS.gris100:COULEURS.blanc, color:pageS===nbPagesS-1?COULEURS.gris400:COULEURS.navy, cursor:pageS===nbPagesS-1?'default':'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit' }}>›</button>
              <button onClick={()=>setSpage(nbPagesS-1)} disabled={pageS===nbPagesS-1} style={{ padding:'4px 8px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:pageS===nbPagesS-1?COULEURS.gris100:COULEURS.blanc, color:pageS===nbPagesS-1?COULEURS.gris400:COULEURS.navy, cursor:pageS===nbPagesS-1?'default':'pointer', fontSize:12, fontFamily:'inherit' }}>»</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function DashboardProfesseur() {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const { profile, delegation, delegationsSortantes, delegationsRecues } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const alerte = useAlerte();
  const confirmer = useConfirm();

  const section = CHEMIN_VERS_SECTION[location.pathname] || 'tableau_bord';

  const [filtreStatut, setFiltreStatut]   = useState('tous');
  const [planDateDebut, setPlanDateDebut] = useState('');
  const [planDateFin,   setPlanDateFin]   = useState('');
  const [planPage,      setPlanPage]      = useState(0);
  const PAGE_PLAN = 10;
  const [sessionsDepliees, setSessionsDepliees] = useState(new Set());
  const [sessionPresId, setSessionPresId] = useState(null);
  const [presences, setPresences]         = useState({});
  // Auteur de chaque saisie présence : { key: { id, prenom, nom, typeRole: 'titulaire'|'remplacant', date } }
  const [presencesAuteurs, setPresencesAuteurs] = useState({});
  const [corrections, setCorrections]       = useState({});
  const [sousOngletND,  setSousOngletND]    = useState(() => location.pathname === '/professeur/devoirs' ? 'devoirs' : location.pathname === '/professeur/reception' ? 'reception' : 'notes');
  const [groupeReception, setGroupeReception] = useState(null); // groupe_id filtre réception
  const [accordionOuvert, setAccordionOuvert] = useState(new Set()); // devoirs contenuIds ouverts

  useEffect(() => {
    if (location.pathname === '/professeur/devoirs')   setSousOngletND('devoirs');
    else if (location.pathname === '/professeur/notes') setSousOngletND('notes');
    else if (location.pathname === '/professeur/reception') setSousOngletND('reception');
  }, [location.pathname]);
  const [modalApprenant, setModalApprenant]   = useState(null);
  const [presencesModalApp, setPresencesModalApp] = useState([]);
  const [loadingPresModalApp, setLoadingPresModalApp] = useState(false);
  // Gamification réelle de l'apprenant ouvert dans la fiche détail - remplace le
  // points_gamif:0 codé en dur qui affichait toujours "0 pts" peu importe la réalité.
  const [gamifModalApp, setGamifModalApp] = useState(null); // { solde, badges }
  const [modalOnglet, setModalOnglet]       = useState('infos');
  const [modalSociete,  setModalSociete]    = useState(null); // client_id sélectionné
  const [modalGroupe,   setModalGroupe]     = useState(null); // groupe_id sélectionné
  const [modalGroupeOnglet, setModalGroupeOnglet] = useState('apprenants');
  const [pageSociete,   setPageSociete]     = useState(1);
  const [modalSupport, setModalSupport]     = useState(false);
  const [formSupport, setFormSupport]       = useState({ titre: '', description: '', type_contenu: 'lecon', module: '', semaine: 1, groupe_ids: [], est_visible: false, fichier: null });
  const [contenuEnEdition, setContenuEnEdition] = useState(null);
  const [contenusLocaux, setContenus]       = useState([]);
  const [previewMode, setPreviewMode]       = useState(false);
  const [blocs, setBlocs]                   = useState([]);
  const [showBlocForm, setShowBlocForm]     = useState(false);
  const BLOC_FORM_VIDE = { type: 'texte', titre: '', dureeMin: 5, contenu: '', url: '', fichier: '', taille: '', sections: [], questions: [] };
  const [blocForm, setBlocForm]             = useState(BLOC_FORM_VIDE);
  // L'envoi du fichier d'un bloc (document ou image) est asynchrone : on verrouille le
  // champ pendant le téléversement plutôt que de laisser croire qu'il est déjà joint.
  const [blocUpload, setBlocUpload]         = useState(false);
  const [blocQuizQ, setBlocQuizQ]           = useState({ texte: '', options: ['', '', '', ''], correct: '' });
  const [blocEnEdition, setBlocEnEdition]   = useState(null); // id du bloc en cours d'édition, null = nouveau
  const [moduleForm, setModuleForm]         = useState({ objectifs: '', dureeEstimee: 30, statut: 'brouillon' });
  /* L'étape du wizard de contenu : 1 = rédaction, 2 = récapitulatif avant diffusion.
     Remplace `moduleLock`, qui n'existait que pour distinguer « nouveau support dans un
     module existant » de « nouveau module » — distinction supprimée avec les deux
     parcours de création. */
  const [etapeContenu, setEtapeContenu] = useState(1);
  const [modalVoirContenu, setModalVoirContenu] = useState(null); // contenu object
  const [actionMedia, setActionMedia] = useState(null); // id du contenu en cours de publication/suppression
  const [rechercheMedia, setRechercheMedia] = useState('');
  const [lusParContenu, setLusParContenu]       = useState({}); // { [contenu_id]: [{ nom, prenom, lu_le }] }
  /* Le taux de lecture par contenu, pour la colonne « LU PAR » du tableau. Distinct de
     `lusParContenu`, qui ne porte le détail nominatif que du contenu actuellement ouvert :
     ici on ne garde que le couple lus/total, chargé pour toute la médiathèque d'un coup. */
  const [compteursLecture, setCompteursLecture] = useState({}); // { [contenu_id]: { lus, total } }
  const [lecteursModal, setLecteursModal]       = useState(null); // { contenu, data, loading }
  const [fichiers, setFichiers]             = useState([]);
  const [groupeFichiers, setGroupeFichiers] = useState('grp-001');
  const [catFichiers, setCatFichiers]       = useState('tous');
  const [uploadZone, setUploadZone]         = useState(false);
  const [fichierEnAttente, setFichierEnAttente] = useState(null); // File sélectionné, en attente de validation avant envoi
  const [envoiFichierEnCours, setEnvoiFichierEnCours] = useState(false);
  const [fichierIdsEnCours, setFichierIdsEnCours] = useState(new Set()); // empêche le double-clic toggle/suppression fichier partagé
  const [contenuIdsEnCours, setContenuIdsEnCours] = useState(new Set()); // empêche le double-clic toggle visibilité contenu médiathèque
  const [savingModule, setSavingModule] = useState(false); // empêche le double-clic sur l'éditeur de module/support
  const [savingNote, setSavingNote] = useState(false); // empêche le double-clic sur "Saisir une note"
  const [modalCreer, setModalCreer]         = useState(false);
  const [editDevoirId, setEditDevoirId]     = useState(null); // null = création, sinon id du devoir à modifier
  const [savingDevoir, setSavingDevoir]     = useState(false); // empêche le double-clic/double-envoi sur "Créer devoir"
  const [publishingDevoirId, setPublishingDevoirId] = useState(null); // empêche le double-clic sur "Publier"
  const [devoirActionEnCours, setDevoirActionEnCours] = useState(false); // empêche le double-clic dépublier/supprimer
  const [savingCorrection, setSavingCorrection] = useState(false); // empêche le double-clic sur "Corriger le devoir"
  const [confirmDepublier,  setConfirmDepublier]  = useState(null); // { id, titre }
  const [confirmSupprimer,  setConfirmSupprimer]  = useState(null); // { id, titre }
  const [confirmGeneral,    setConfirmGeneral]    = useState(null); // { titre, message, details?, icone, couleur, boutonLabel, onConfirm }
  const [erreurModal,       setErreurModal]       = useState(null); // { titre, message }
  const [modalReception,    setModalReception]    = useState(null); // devoirId ouvert en modal Réception
  const [receptModalStatut, setReceptModalStatut] = useState('tous'); // filtre statut dans le modal réception
  const [creerForm, setCreerForm]           = useState({ categorie: 'devoir', titre: '', groupe_id: '', groupe_ids: [], dureeComposition: 0, date_limite: '', heure_limite: '23:59', date_ouverture: '', heure_ouverture: '00:00', instructions: '', type: 'fichier', typeEval: 'qcm', dureeMin: 60, ressourceUrl: '', blocs: [] });
  const [blocEditing, setBlocEditing] = useState(null); // id du bloc en cours d'édition
  const [uploadBlocEnCours, setUploadBlocEnCours] = useState(null);

  const addBloc = (type) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setCreerForm(f => ({ ...f, blocs: [...f.blocs, { id, type, questions: [], ressourceUrl: '', instructions: '', conseil: '' }] }));
    setBlocEditing(id);
    setCreerQForm({ texte: '', options: ['', '', '', ''], correct: '' });
  };
  const removeBloc = (id) => {
    setCreerForm(f => ({ ...f, blocs: f.blocs.filter(b => b.id !== id) }));
    if (blocEditing === id) setBlocEditing(null);
  };
  const updateBloc = (id, patch) => {
    setCreerForm(f => ({ ...f, blocs: f.blocs.map(b => b.id === id ? { ...b, ...patch } : b) }));
  };
  const removeBlocQuestion = (blocId, qi) => {
    setCreerForm(f => ({ ...f, blocs: f.blocs.map(b => b.id === blocId ? { ...b, questions: b.questions.filter((_, i) => i !== qi) } : b) }));
  };
  const addBlocQuestion = () => {
    if (!creerQForm.texte.trim() || !creerQForm.correct || !blocEditing) return;
    const qid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setCreerForm(f => ({ ...f, blocs: f.blocs.map(b => b.id === blocEditing
      ? { ...b, questions: [...(b.questions||[]), { id: qid, texte: creerQForm.texte, options: creerQForm.options.filter(Boolean), correct: creerQForm.correct }] }
      : b) }));
    setCreerQForm({ texte: '', options: ['', '', '', ''], correct: '' });
  };
  async function uploaderRessourceBloc(blocId, file) {
    const tok = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
    if (!tok) return;
    setUploadBlocEnCours(blocId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetchUpload(`${_PROF_API}/api/upload/fichier-classe`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: fd });
      if (!r.ok) { toast.error('Échec de l\'envoi du fichier'); return; }
      const d = await r.json();
      updateBloc(blocId, { ressourceUrl: d.url });
    } catch { toast.error('Impossible de joindre le serveur'); }
    finally { setUploadBlocEnCours(null); }
  }
  const [uploadExerciceEnCours, setUploadExerciceEnCours] = useState(false);
  async function uploaderExerciceDevoir(file) {
    const token = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
    if (!token) return;
    setUploadExerciceEnCours(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetchUpload(`${_PROF_API}/api/upload/fichier-classe`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!r.ok) { const d = await r.json().catch(() => ({})); toast.error(d.error || "Échec de l'envoi du fichier", { duration: 5000 }); return; }
      const d = await r.json();
      setCreerForm(p => ({ ...p, ressourceUrl: d.url }));
    } catch {
      toast.error('Impossible de joindre le serveur', { duration: 5000 });
    } finally {
      setUploadExerciceEnCours(false);
    }
  }
  const [creerQForm, setCreerQForm]         = useState({ texte: '', options: ['', '', '', ''], correct: '' });
  // ── Devoirs réels ─────────────────────────────────────────────────────────
  const [devoirsReels,   setDevoirsReels]   = useState([]);
  const [devoirsLoading, setDevoirsLoading] = useState(false);
  const [devoirRendusMap,setDevoirRendusMap] = useState({}); // { [devoirId]: [...rendus] }
  const [correctionModal,setCorrectionModal] = useState(null); // { devoir, rendu }
  const [correctionForm, setCorrectionForm]  = useState({ note: '', commentaire: '' });
  const [notesReelles,   setNotesReelles]    = useState([]);
  const [notesLoading,   setNotesLoading]    = useState(false);
  const [modalSaisirNote,setModalSaisirNote] = useState(false);
  const [noteDetailModal, setNoteDetailModal] = useState(null); // { cl, a, n }
  const [saisirNoteForm, setSaisirNoteForm]  = useState({ inscription_id: '', titre: '', note: '', commentaire: '' });
  const [modalPresenceSession, setModalPresenceSession] = useState(null);
  const [replaysDateDebut, setReplaysDateDebut] = useState('');
  const [replaysDateFin,   setReplaysDateFin]   = useState('');
  const [replaysPage,      setReplaysPage]      = useState(1);
  const REPLAYS_PAR_PAGE = 5;
  const [sessionsLocales, setSessionsLocales] = useState([]);
  // ── Données réelles e-learning ─────────────────────────────────────────────
  const [classesReelles,     setClassesReelles]     = useState([]);
  const [apprenantsByClasse, setApprenantsByClasse] = useState({});
  const [groupesHistoriques, setGroupesHistoriques] = useState({}); // { groupe_id: { id, nom, ... } }
  const [classesDataLoaded,  setClassesDataLoaded]  = useState(false);
  const [filtreMediaGroupe, setFiltreMediaGroupe] = useState('tous');
  const [filtreMediaStatut, setFiltreMediaStatut] = useState('tous');
  const [filtreMediaClasseStatut, setFiltreMediaClasseStatut] = useState('actives'); // 'actives'|'terminees'|'toutes'
  const [ouvrirFiltrePeriode, setOuvrirFiltrePeriode] = useState(false); // la rangée « période » reste repliée tant qu'elle n'est pas utilisée
  const [filtreFichiersClasseStatut, setFiltreFichiersClasseStatut] = useState('actives');
  const [filtreMediaPeriode, setFiltreMediaPeriode] = useState('tous'); // 'tous'|'mois'|'mois_dernier'|'3mois'|'annee'|'custom'
  const [filtreMediaDateDebut, setFiltreMediaDateDebut] = useState('');
  const [filtreMediaDateFin, setFiltreMediaDateFin]   = useState('');
  const [pageMedia, setPageMedia] = useState(1);
  // ── Mes honoraires (réel, connecté à honoraires_elearning_mois / seances_elearning) ──
  const _MOIS_PAIE = ['','Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
  const [paieMois, setPaieMois] = useState(new Date().getMonth() + 1);
  const [paieAnnee, setPaieAnnee] = useState(new Date().getFullYear());
  const [monHonoraire, setMonHonoraire] = useState(null);
  const [monHonSeances, setMonHonSeances] = useState([]);
  const [paieLoading, setPaieLoading] = useState(false);
  const [honSeanceDetail, setHonSeanceDetail] = useState(null);
  const [honSeancePresences, setHonSeancePresences] = useState([]);
  const [honSeancePresencesLoading, setHonSeancePresencesLoading] = useState(false);

  useEffect(() => {
    if (!honSeanceDetail) { setHonSeancePresences([]); return; }
    setHonSeancePresencesLoading(true);
    fetch(`${_PROF_API}/api/elearning/seances/${honSeanceDetail.id}/presences`, { headers: _profHdrs() })
      .then(r => r.ok ? r.json() : { presences: [] })
      .then(d => setHonSeancePresences(d.presences || []))
      .catch(() => setHonSeancePresences([]))
      .finally(() => setHonSeancePresencesLoading(false));
  }, [honSeanceDetail]);

  useEffect(() => {
    if (section !== 'paiements') return;
    let annule = false;
    setPaieLoading(true);
    (async () => {
      try {
        const r = await fetch(`${_PROF_API}/api/elearning/honoraires?mois=${paieMois}&annee=${paieAnnee}`, { headers: _profHdrs() });
        const d = await r.json();
        const hon = (d.honoraires || [])[0] || null;
        if (annule) return;
        setMonHonoraire(hon);
        if (hon) {
          const r2 = await fetch(`${_PROF_API}/api/elearning/honoraires/${hon.id}/seances`, { headers: _profHdrs() });
          const d2 = await r2.json();
          if (!annule) setMonHonSeances(d2.seances || []);
        } else if (!annule) {
          setMonHonSeances([]);
        }
      } catch {
        if (!annule) { setMonHonoraire(null); setMonHonSeances([]); }
      } finally {
        if (!annule) setPaieLoading(false);
      }
    })();
    return () => { annule = true; };
  }, [section, paieMois, paieAnnee]);

  // ── Réception & Correction - filtres + pagination ──────────────────────────
  const [receptFiltreStatut,   setReceptFiltreStatut]   = useState('tous');
  const [receptFiltreClasse,   setReceptFiltreClasse]   = useState('toutes');
  const [receptDateDebut,      setReceptDateDebut]      = useState('');
  const [receptDateFin,        setReceptDateFin]        = useState('');
  const [receptPage,           setReceptPage]           = useState(1);
  const RECEPT_PAR_PAGE = 5;
  // ── Devoirs - filtres + pagination ─────────────────────────────────────────
  const [devoirFiltreStatut,   setDevoirFiltreStatut]   = useState('tous');       // tous|brouillon|publie
  const [devoirFiltreClasse,   setDevoirFiltreClasse]   = useState('toutes');
  const [devoirDateDebut,      setDevoirDateDebut]      = useState('');
  const [devoirDateFin,        setDevoirDateFin]        = useState('');
  const [devoirPage,           setDevoirPage]           = useState(1);
  const DEVOIR_PAR_PAGE = 8;
  // ── Notes - filtres + pagination ────────────────────────────────────────────
  const [notesFiltreClasse,    setNotesFiltreClasse]    = useState('toutes');
  const [notesRecherche,       setNotesRecherche]       = useState('');           // recherche par nom apprenant
  const [notesDateDebut,       setNotesDateDebut]       = useState('');
  const [notesDateFin,         setNotesDateFin]         = useState('');
  const [notesPage,            setNotesPage]            = useState(1);
  const NOTES_PAR_PAGE = 15;
  const [nouvellesClasses,     setNouvellesClasses]     = useState([]);
  const [nouveauxApprenants,   setNouveauxApprenants]   = useState([]);
  const [classePresencesModal, setClassePresencesModal] = useState(null);
  const [modalNouvelleSession, setModalNouvelleSession] = useState(false);
  const [savingSession, setSavingSession] = useState(false); // empêche le double-clic sur Programmer/Enregistrer une session
  const [editingSessionId, setEditingSessionId] = useState(null);
  const FORM_SESSION_VIDE = { titre: '', groupe_id: '', date_session: '', heure_debut: '', heure_fin: '', lien_visio: '', type_session: 'ligne', notes_prof: '', contenu_ids: [] };
  const [formNouvelleSession, setFormNouvelleSession] = useState(FORM_SESSION_VIDE);
  const [modeMultiple, setModeMultiple]         = useState(false);
  const SESSION_LIGNE_VIDE = { titre: '', date_session: '', heure_debut: '', heure_fin: '', lien_visio: '', type_session: 'ligne', contenu_ids: [] };
  const [sessionsMultiples, setSessionsMultiples] = useState([{ ...SESSION_LIGNE_VIDE }]);
  const [commonFields, setCommonFields]         = useState({ groupe_id: '', heure_debut: '', heure_fin: '', lien_visio: '', type_session: 'ligne', contenu_ids: [] });

  // ── Signalement d'absence ────────────────────────────────────────────────────
  const MOTIFS_ABSENCE = ['Maladie', 'Congé personnel', 'Formation', 'Congé maternité', 'Urgence familiale', 'Autre'];
  const [modalAbsence, setModalAbsence]         = useState(false);
  const [formAbsence, setFormAbsence]           = useState({ motif: 'Maladie', dateDebut: '', dateFin: '', message: '', sessionsIds: [] });
  const [absenceEnvoyee, setAbsenceEnvoyee]     = useState(false);
  const [absenceEnvoi,   setAbsenceEnvoi]       = useState(false);
  const [absenceErreur,  setAbsenceErreur]      = useState('');
  const [demandesAbsence, setDemandesAbsence]   = useState([]);
  const [filtreDemandesStatut,     setFiltreDemandesStatut]     = useState('tous');
  const [filtreDemandesDateDebut,  setFiltreDemandesDateDebut]  = useState('');
  const [filtreDemandesDateFin,    setFiltreDemandesDateFin]    = useState('');
  const [pageDemandes, setPageDemandes] = useState(1);
  const DEMANDES_PAR_PAGE = 8;
  const [demandeDetail, setDemandeDetail] = useState(null);

  const chargerDemandesAbsence = useCallback(() => {
    if (!profile?.id) return;
    const token = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
    if (!token) return;
    fetch(`${_PROF_API}/api/remplacements?absent_id=${profile.id}&plateforme=bet-elearning`, { headers: _profHdrs() })
      .then(r => r.json())
      .then(d => setDemandesAbsence(d.remplacements || []))
      .catch(() => {});
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { chargerDemandesAbsence(); }, [chargerDemandesAbsence]);

  // Ouvre le détail avec la donnée en cache (instantané), puis rafraîchit en arrière-plan - la
  // liste n'est chargée qu'une fois au montage, sans realtime, donc sans ce refetch le coach
  // verrait un statut/remplaçant périmé si le PA a agi sur la demande depuis.
  function ouvrirDetailDemande(d) {
    setDemandeDetail(d);
    if (!profile?.id) return;
    const token = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
    if (!token) return;
    fetch(`${_PROF_API}/api/remplacements?absent_id=${profile.id}&plateforme=bet-elearning`, { headers: _profHdrs() })
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
    setFormAbsence({ motif: 'Maladie', dateDebut: today, dateFin: today, message: '', sessionsIds: ids });
    setAbsenceEnvoyee(false);
    setModalAbsence(true);
  }

  function sessionsDansPeriode(debut, fin) {
    if (!debut || !fin) return [];
    return sessionsLocales.filter(s =>
      (s.professeur_id === profile?.id || s.professeur_id === 'teacher-001') &&
      s.statut !== 'realisee' && s.statut !== 'annulee' &&
      s.date_session >= debut && s.date_session <= fin
    );
  }

  async function envoyerDemandeAbsence() {
    const sessionsSelectionnees = sessionsDansPeriode(formAbsence.dateDebut, formAbsence.dateFin)
      .filter(s => formAbsence.sessionsIds.length === 0 || formAbsence.sessionsIds.includes(s.id));
    if (!sessionsSelectionnees.length) { setAbsenceErreur('Sélectionnez au moins une séance.'); return; }

    // Une même absence peut couvrir plusieurs classes différentes à la fois (le sélecteur ne
    // filtre que par date, pas par classe) - mais le serveur n'accepte qu'une seule classe par
    // demande (groupe_id singulier : remplaçant, clôture et notifications sont gérés par
    // classe). On regroupe donc les séances sélectionnées par classe et on envoie une demande
    // par groupe, en une seule action pour le coach.
    const parGroupe = {};
    sessionsSelectionnees.forEach(s => {
      if (!s.groupe_id) return;
      (parGroupe[s.groupe_id] ||= []).push(s);
    });
    const groupeIds = Object.keys(parGroupe);
    if (!groupeIds.length) { setAbsenceErreur('Aucune séance rattachée à une classe.'); return; }

    // Identifiant commun à toutes les demandes issues de cette déclaration - permet à la PA
    // de retrouver les demandes-sœurs (mêmes classes, même absence) et de choisir : un seul
    // remplaçant pour tout le lot, ou une assignation différente par classe.
    const lotId = groupeIds.length > 1 ? crypto.randomUUID() : null;

    setAbsenceEnvoi(true);
    setAbsenceErreur('');
    try {
      const resultats = await Promise.all(groupeIds.map(async (groupeId) => {
        const sessionsDuGroupe = parGroupe[groupeId];
        const r = await fetch(`${_PROF_API}/api/remplacements`, {
          method: 'POST',
          headers: { ..._profHdrs(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupe_id:    groupeId,
            groupe_nom:   mesGroupes.find(g => g.id === groupeId)?.nom || null,
            date_debut:   formAbsence.dateDebut,
            date_fin:     formAbsence.dateFin,
            sessions_ids: sessionsDuGroupe.map(s => s.id),
            motif:        formAbsence.motif,
            message:      formAbsence.message,
            lot_id:       lotId,
            plateforme:   'bet-elearning',
          }),
        });
        const d = await r.json().catch(() => ({}));
        return { ok: r.ok, groupe: mesGroupes.find(g => g.id === groupeId)?.nom || groupeId, data: d };
      }));
      const echecs = resultats.filter(r => !r.ok);
      const succes = resultats.filter(r => r.ok);
      if (succes.length) setDemandesAbsence(prev => [...succes.map(r => r.data.remplacement), ...prev]);
      if (echecs.length && !succes.length) {
        throw new Error(echecs[0].data.error || 'Erreur serveur');
      } else if (echecs.length) {
        setAbsenceErreur(`Échec pour ${echecs.map(e => e.groupe).join(', ')} : ${echecs[0].data.error || 'erreur serveur'}`);
      }
      if (succes.length) setAbsenceEnvoyee(true);
    } catch (err) {
      setAbsenceErreur(err.message);
    } finally {
      setAbsenceEnvoi(false);
    }
  }

  // ── État session live ────────────────────────────────────────────────────────
  const [salleOuverte, setSalleOuverte]       = useState(null);   // session_id en cours
  const [modalVideoOuvert, setModalVideoOuvert] = useState(false); // modal Jitsi flottant
  const [chronoSec, setChronoSec]             = useState(0);      // secondes écoulées
  const [presencesLive, setPresencesLive]     = useState({});     // { appId: 'present'|'absent'|'retard' }
  const [mainLevees, setMainLevees]           = useState([]);     // apprenant IDs
  const [chatLive, setChatLive]               = useState([]);     // { auteur, texte, ts }
  const [chatInput, setChatInput]             = useState('');
  const [sessionsClôturees, setSessionsCloturees] = useState(new Set());
  const [presentielModal, setPresentielModal] = useState(null);   // session présentielle ouverte
  const [presencesPresentiel, setPresencesPresentiel] = useState({}); // { appId: 'present'|'absent'|'retard' }


  // Fetch présences réelles + rendus devoirs quand le modal apprenant s'ouvre
  useEffect(() => {
    if (!modalApprenant) { setPresencesModalApp([]); return; }
    const token = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
    if (!token) return;
    // Trouver l'inscription_id (id dans classes_elearning_apprenants)
    const inscriptionId = Object.values(apprenantsByClasse).flat().find(a => a.apprenant_id === modalApprenant || a.id === modalApprenant)?.id;
    if (!inscriptionId) return;
    setLoadingPresModalApp(true);
    fetch(`${_PROF_API}/api/elearning/apprenants/${inscriptionId}/presences`, { headers: _profHdrs() })
      .then(r => r.ok ? r.json() : { presences: [] })
      .then(d => setPresencesModalApp(d.presences || []))
      .catch(() => setPresencesModalApp([]))
      .finally(() => setLoadingPresModalApp(false));
    // Charger les rendus de tous les devoirs de la classe de cet apprenant
    const appInfo = Object.entries(apprenantsByClasse).flatMap(([cId, apps]) => apps.map(x => ({ ...x, classe_id: cId }))).find(x => x.id === modalApprenant || x.apprenant_id === modalApprenant);
    if (appInfo) {
      devoirsReels.filter(d => classesDuDevoir(d).includes(appInfo.classe_id)).forEach(d => chargerRendusPourDevoir(d.id));
    }
  }, [modalApprenant]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chargement des données réelles ─────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id) return;
    const token = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
    if (!token) return; // mode développement mock - pas de token réel
    Promise.all([
      fetch(`${_PROF_API}/api/classes-elearning?coach_id=${profile.id}&statut=actif`, { headers: _profHdrs() }),
      fetch(`${_PROF_API}/api/elearning/seances?coach_id=${profile.id}`,              { headers: _profHdrs() }),
      fetch(`${_PROF_API}/api/elearning/contenus`,                                      { headers: _profHdrs() }),
      fetch(`${_PROF_API}/api/elearning/fichiers?coach_id=${profile.id}`,             { headers: _profHdrs() }),
    ]).then(async ([rC, rS, rM, rF]) => {
      const djC    = rC.ok  ? await rC.json()  : {};
      const djS    = rS.ok  ? await rS.json()  : {};
      const djM    = rM.ok  ? await rM.json()  : {};
      const djF    = rF.ok  ? await rF.json()  : {};
      const classes = djC.classes || [];
      const seances = (djS.seances || []).map(s => ({
        id:           s.id,
        groupe_id:    s.classe_id,
        professeur_id:s.coach_id,
        titre:        s.objectifs_session || s.bilan_session || `Séance - ${s.date}`,
        date_session: s.date,
        heure_debut:  s.heure_debut,
        heure_fin:    s.heure_fin,
        lien_visio:   s.lien_zoom || s.lien_meet || s.lien_teams || null,
        type:         s.type || 'cours',
        type_session: s.type === 'presentiel' ? 'presentiel' : (s.lien_zoom || s.lien_meet || s.lien_teams ? 'ligne' : 'presentiel'),
        statut:       s.statut === 'realisee' ? 'realisee' : s.statut === 'en_cours' ? 'en_cours' : 'planifiee',
        notes_prof:   s.compte_rendu || null,
        contenu_ids:  s.contenu_ids || [],
        nb_presents:  s.nb_presents ?? null,
        // Traçabilité : ces champs étaient perdus à la projection, si bien que l'écran ne
        // pouvait ni retrouver une salle restée ouverte ni calculer une durée juste.
        demarree_at:  s.demarree_at ?? null,
        terminee_at:  s.terminee_at ?? null,
        duree_reelle_s: s.duree_reelle_s ?? null,
        date_initiale:  s.date_initiale ?? null,
        reprogrammee_motif: s.reprogrammee_motif ?? null,
        _real:        true,
      }));

      // Mapper les contenus bet-elearning vers le format contenusLocaux
      const contenusDB = (djM.contenus || []).map(c => ({
        id:               c.id,
        professeur_id:    c.coach_id,
        groupe_id:        c.classe_id,   // dans le portail elearning classe_id = groupe_id UI
        /* Les classes destinataires. `classe_id` ne porte plus que la première
           d'entre elles : un contenu diffusé à trois classes n'apparaîtrait que
           dans la médiathèque de la première si on continuait à la lire seule. */
        groupe_ids:       c.classe_ids?.length ? c.classe_ids : (c.classe_id ? [c.classe_id] : []),
        type_contenu:     c.type_contenu || 'lecon',
        titre:            c.titre || '',
        description:      '',
        module:           c.categorie || '',
        semaine:          c.semaine || 1,
        fichier_url:      null,
        est_visible:      c.est_visible ?? (c.statut === 'publie'),
        date_publication: c.updated_at || c.created_at || new Date().toISOString(),
        version:          1,
        objectifs:        c.objectifs || '',
        dureeEstimee:     c.duree_estimee || 30,
        statut:           c.statut || 'brouillon',
        blocs:            c.blocs || [],
        /* Les deux dates arrivaient du serveur et étaient jetées ici. Sans elles, le
           tableau ne pouvait pas dire si un contenu datait de la semaine ou de l'an
           dernier, ni lequel avait été retouché depuis sa création. */
        created_at:       c.created_at || null,
        updated_at:       c.updated_at || null,
        lecture_sequentielle: c.lecture_sequentielle === true,
      }));
      if (contenusDB.length > 0) {
        setContenus(contenusDB);
        chargerCompteursLecture(contenusDB);
      }

      const fichiersDB = (djF.fichiers || []).map(f => {
        const ext = (f.nom || '').split('.').pop().toLowerCase();
        const tko = f.taille_ko || 0;
        return {
          id:       f.id,
          nom:      f.nom,
          categorie: f.categorie || 'autre',
          groupe_id: f.classe_id,
          taille:   tko > 1024 ? `${(tko/1024).toFixed(1)} Mo` : tko > 0 ? `${tko} Ko` : '-',
          date:     f.created_at?.split('T')[0] || '',
          visible:  f.visible,
          url:      f.url || null,
          icone:    ['mp3','mp4','wav','ogg'].includes(ext) ? '🎵' : ext === 'pdf' ? '📄' : ['jpg','jpeg','png','gif'].includes(ext) ? '🖼' : '📎',
        };
      });
      if (fichiersDB.length > 0) setFichiers(fichiersDB);

      setClassesReelles(classes);
      setClassesDataLoaded(true);
      // Fusion, jamais d'écrasement complet - sinon toute séance déléguée déjà chargée par
      // l'effet de délégation (plus bas, dépendant de `delegation.groupe_id`) disparaît dès
      // que cet effet-ci se redéclenche (ex : re-render StrictMode, refresh de session), pour
      // ne revenir qu'au prochain déclenchement de l'effet de délégation - d'où le
      // clignotement "apparaît et disparaît" observé côté remplaçant.
      setSessionsLocales(prev => [...seances, ...prev.filter(s => s._delegated)]);

      // ── Détection nouvelles classes ──
      const storageKeyC = `bet_known_classes_${profile?.id}`;
      const knownIds    = JSON.parse(localStorage.getItem(storageKeyC) || '[]');
      const nouvellesC  = classes.filter(c => !knownIds.includes(c.id));
      if (nouvellesC.length > 0) setNouvellesClasses(nouvellesC);

      // ── Chargement apprenants + détection nouveaux ──
      const storageKeyA = `bet_known_apps_${profile?.id}`;
      const knownApps   = JSON.parse(localStorage.getItem(storageKeyA) || '{}');
      const nouvsApps   = [];
      await Promise.all(classes.map(async cl => {
        const rA  = await fetch(`${_PROF_API}/api/classes-elearning/${cl.id}/apprenants?presence=true`, { headers: _profHdrs() });
        if (!rA.ok) return;
        const djA = await rA.json();
        const apps = djA.apprenants || [];
        setApprenantsByClasse(prev => ({ ...prev, [cl.id]: apps }));
        const knownCount = knownApps[cl.id] ?? null;
        if (knownCount !== null && apps.length > knownCount) {
          nouvsApps.push(...apps.slice(knownCount).map(a => ({ ...a, classe_nom: cl.nom })));
        }
      }));
      if (nouvsApps.length > 0) setNouveauxApprenants(nouvsApps);
    }).catch(e => console.warn('[prof-data]', e));
  }, [profile?.id]);

  // ── Séances + apprenants d'une classe déléguée (remplacement) ───────────────
  // Le coach_id de la séance appartient encore au titulaire absent tant qu'elle n'est pas
  // clôturée (réattribution comptable à la clôture seulement - voir
  // Backend/docs/remplacement-schema.html étape 5) : le fetch par coach_id=profile.id ne les
  // ramène donc jamais. Il faut charger explicitement les séances de la classe déléguée.
  useEffect(() => {
    if (!delegation?.groupe_id) return;
    const token = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
    if (!token) return;
    fetch(`${_PROF_API}/api/elearning/seances?classe_id=${delegation.groupe_id}`, { headers: _profHdrs() })
      .then(r => r.json())
      .then(d => {
        const idsDelegues = new Set(delegation.sessions_ids || []);
        const seancesDeleguees = (d.seances || [])
          .filter(s => idsDelegues.has(s.id))
          .map(s => ({
            id:            s.id,
            groupe_id:     s.classe_id,
            professeur_id: s.coach_id,
            titre:         s.objectifs_session || s.bilan_session || `Séance - ${s.date}`,
            date_session:  s.date,
            heure_debut:   s.heure_debut,
            heure_fin:     s.heure_fin,
            lien_visio:    s.lien_zoom || s.lien_meet || s.lien_teams || null,
            type:          s.type || 'cours',
            type_session:  s.type === 'presentiel' ? 'presentiel' : (s.lien_zoom || s.lien_meet || s.lien_teams ? 'ligne' : 'presentiel'),
            statut:        s.statut === 'realisee' ? 'realisee' : s.statut === 'en_cours' ? 'en_cours' : 'planifiee',
            notes_prof:    s.compte_rendu || null,
            contenu_ids:   s.contenu_ids || [],
            nb_presents:   s.nb_presents ?? null,
            demarree_at:   s.demarree_at ?? null,
            terminee_at:   s.terminee_at ?? null,
            duree_reelle_s: s.duree_reelle_s ?? null,
            date_initiale:  s.date_initiale ?? null,
            reprogrammee_motif: s.reprogrammee_motif ?? null,
            _real: true,
            _delegated: true,
          }));
        setSessionsLocales(prev => [...prev.filter(s => !idsDelegues.has(s.id)), ...seancesDeleguees]);
      })
      .catch(() => {});

    fetch(`${_PROF_API}/api/classes-elearning/${delegation.groupe_id}/apprenants?presence=true`, { headers: _profHdrs() })
      .then(r => r.json())
      .then(d => setApprenantsByClasse(prev => ({ ...prev, [delegation.groupe_id]: d.apprenants || [] })))
      .catch(() => {});
  }, [delegation?.groupe_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Charger le nom du groupe + la liste des apprenants pour TOUTE délégation reçue passée
  // (pas seulement l'active) - sans ça, consulter la feuille de présence d'une session
  // couverte par une délégation déjà terminée affiche "Aucun apprenant dans ce groupe" et un
  // en-tête sans nom de groupe, alors que la session elle-même reste bien visible (via
  // sessions_ids/coach_id réattribué). Ces requêtes ne s'exécutent qu'une fois par groupe déjà
  // connu, donc bon marché même avec beaucoup d'historique.
  useEffect(() => {
    const groupeIds = [...new Set((delegationsRecues || []).map(d => d.groupe_id).filter(Boolean))];
    if (groupeIds.length === 0) return;
    const token = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
    if (!token) return;
    groupeIds.forEach(gId => {
      if (groupesHistoriques[gId] || classesReelles.some(c => c.id === gId)) return;
      fetch(`${_PROF_API}/api/classes-elearning/${gId}`, { headers: _profHdrs() })
        .then(r => r.json())
        .then(d => {
          const c = d.classe || d;
          if (!c?.id) return;
          setGroupesHistoriques(prev => ({ ...prev, [gId]: {
            id: c.id, nom: c.nom, professeur_id: c.coach_id, client_id: c.entreprise_id,
            est_actif: c.statut === 'actif', niveau: c.niveau, cecr_min: c.niveau, cecr_max: c.niveau,
            nb_apprenants: c.nb_apprenants, _delegation: true, _lectureSeule: true,
          } }));
        })
        .catch(() => {});
      if (!apprenantsByClasse[gId]) {
        fetch(`${_PROF_API}/api/classes-elearning/${gId}/apprenants?presence=true`, { headers: _profHdrs() })
          .then(r => r.json())
          .then(d => setApprenantsByClasse(prev => ({ ...prev, [gId]: d.apprenants || [] })))
          .catch(() => {});
      }
    });
  }, [delegationsRecues]); // eslint-disable-line react-hooks/exhaustive-deps

  // Charger les présences sauvegardées quand on ouvre le modal sur une session réalisée
  useEffect(() => {
    if (!modalPresenceSession) return;
    const sess = mesSessions.find(s => s.id === modalPresenceSession);
    if (!sess?._real || sess.statut !== 'realisee') return;
    const token = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
    if (!token) return;
    fetch(`${_PROF_API}/api/elearning/seances/${modalPresenceSession}/presences`, { headers: _profHdrs() })
      .then(r => r.json())
      .then(d => {
        if (!Array.isArray(d.presences) || d.presences.length === 0) return;
        setPresences(prev => {
          const updates = {};
          d.presences.forEach(p => {
            if (p.statut) updates[`${modalPresenceSession}__${p.inscription_id}`] = p.statut;
          });
          return { ...prev, ...updates };
        });
        // Auteur réel de la saisie (peut être le remplaçant même si on consulte en tant
        // que titulaire) - remplace le repli sur le profil actuellement connecté.
        setPresencesAuteurs(prev => {
          const updates = {};
          d.presences.forEach(p => {
            if (!p.saisi_par) return;
            // Le rôle stocké en base ("coach") ne distingue pas titulaire/remplaçant - on se
            // fie plutôt à saisi_par_est_remplacant (calculé côté serveur depuis la
            // délégation réelle couvrant cette séance). Un compte non-coach (staff onboarding,
            // admin…) n'est ni l'un ni l'autre : on l'affiche tel quel plutôt que de le
            // faussement étiqueter "Titulaire".
            updates[`${modalPresenceSession}__${p.inscription_id}`] = {
              id: p.saisi_par,
              prenom: p.saisi_par_prenom || '',
              nom: p.saisi_par_nom || '',
              typeRole: p.saisi_par_role !== 'coach'
                ? 'autre'
                : (p.saisi_par_est_remplacant ? 'remplacant' : 'titulaire'),
              roleReel: p.saisi_par_role || null,
              date: p.updated_at || p.created_at || null,
            };
          });
          return { ...prev, ...updates };
        });
      })
      .catch(() => {});
  }, [modalPresenceSession]);

  // ── Chargement devoirs réels ─────────────────────────────────────────────
  useEffect(() => {
    if (classesReelles.length === 0) return;
    const tok = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
    if (!tok) return;
    setDevoirsLoading(true);
    /* ── UN SEUL APPEL, ET NON UN PAR CLASSE ──
       On interrogeait la route une fois PAR CLASSE, puis on étiquetait chaque devoir du
       nom de la classe interrogée. Un devoir donné à deux classes revenait donc DEUX FOIS
       dans la liste, chaque copie portant une seule de ses classes — et le coach croyait
       qu'il n'avait été attribué qu'à l'une d'elles.
       Le filtre `coach_id` ramène ses devoirs en une fois ; les noms de classes se
       résolvent depuis `classe_ids`, qui dit la vérité sur les destinataires. */
    fetch(`${_PROF_API}/api/elearning/devoirs?coach_id=${profile?.id || ''}`, { headers: _profHdrs() })
      .then(r => r.json())
      .then(d => {
        const nomDe = (id) => classesReelles.find(c => c.id === id)?.nom;
        setDevoirsReels((d.devoirs || []).map(dv => {
          const ids = dv.classe_ids?.length ? dv.classe_ids : (dv.classe_id ? [dv.classe_id] : []);
          const noms = ids.map(nomDe).filter(Boolean);
          return {
            ...dv,
            classe_ids_resolus: ids,
            /* Toutes les classes, pas la première : « Anglais Moov A2, MOOV CI - A1 » dit
               la portée réelle, là où un nom seul laissait croire à une attribution
               unique. */
            classe_nom: noms.join(', ') || '—',
          };
        }));
        setDevoirsLoading(false);
      })
      .catch(() => { setDevoirsReels([]); setDevoirsLoading(false); });
  }, [classesReelles, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chargement notes réelles ──────────────────────────────────────────────
  useEffect(() => {
    if (classesReelles.length === 0) return;
    const tok = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
    if (!tok) return;
    setNotesLoading(true);
    Promise.all(
      classesReelles.map(cl =>
        fetch(`${_PROF_API}/api/elearning/notes?classe_id=${cl.id}`, { headers: _profHdrs() })
          .then(r => r.json()).then(d => (d.notes || []).map(n => ({ ...n, classe_nom: cl.nom })))
          .catch(() => [])
      )
    ).then(results => {
      setNotesReelles(results.flat());
      setNotesLoading(false);
    });
  }, [classesReelles]);

  // Fetch list of apprenants who marked a contenu as "lu" - always refresh on modal open
  useEffect(() => {
    if (!modalVoirContenu?.id) return;
    const id = modalVoirContenu.id;
    setLusParContenu(p => ({ ...p, [id]: undefined })); // reset to "loading"
    /* `/lecteurs` et non `/lus` : la seconde ne rend que ceux qui ont ouvert, et un coach
       y lisait trois noms sans savoir s'il manquait deux apprenants ou vingt. La question
       utile est l'inverse — qui n'a PAS encore lu, pour le relancer. */
    fetch(`${_PROF_API}/api/elearning/contenus/${id}/lecteurs`, { headers: _profHdrs() })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setLusParContenu(p => ({ ...p, [id]: { lecteurs: d.lecteurs || [], en_attente: d.en_attente || [], total: d.total || 0 } })))
      .catch(() => setLusParContenu(p => ({ ...p, [id]: [] })));
  }, [modalVoirContenu?.id]);

  async function chargerRendusPourDevoir(devoirId, forcer = false) {
    if (devoirRendusMap[devoirId] && !forcer) return;
    try {
      const r = await fetch(`${_PROF_API}/api/elearning/devoirs/${devoirId}/rendus`, { headers: _profHdrs() });
      const d = await r.json();
      setDevoirRendusMap(prev => ({ ...prev, [devoirId]: d.rendus || [] }));
    } catch { setDevoirRendusMap(prev => ({ ...prev, [devoirId]: [] })); }
  }

  async function publierDevoir(devoirId) {
    if (publishingDevoirId) return;
    setPublishingDevoirId(devoirId);
    try {
      const r = await fetch(`${_PROF_API}/api/elearning/devoirs/${devoirId}`, {
        method: 'PATCH', headers: _profHdrs(), body: JSON.stringify({ statut: 'publie' }),
      });
      if (r.ok) {
        setDevoirsReels(prev => prev.map(d => d.id === devoirId ? { ...d, statut: 'publie' } : d));
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Publication refusée', { duration: 5000 });
      }
    } catch {
      toast.error('Impossible de joindre le serveur', { duration: 5000 });
    } finally {
      setPublishingDevoirId(null);
    }
  }

  async function confirmerDepublication() {
    if (!confirmDepublier || devoirActionEnCours) return;
    const { id: devoirId } = confirmDepublier;
    setDevoirActionEnCours(true);
    setConfirmDepublier(null);
    try {
      const r = await fetch(`${_PROF_API}/api/elearning/devoirs/${devoirId}`, {
        method: 'PATCH', headers: _profHdrs(), body: JSON.stringify({ statut: 'brouillon' }),
      });
      const d = await r.json();
      if (r.ok) {
        setDevoirsReels(prev => prev.map(x => x.id === devoirId ? { ...x, statut: 'brouillon' } : x));
        setDevoirRendusMap(prev => { const n = { ...prev }; delete n[devoirId]; return n; });
      } else {
        setErreurModal({ titre: 'Dépublication impossible', message: d.error || 'Impossible de dépublier ce devoir.' });
      }
    } catch { setErreurModal({ titre: 'Erreur réseau', message: 'La requête n\'a pas abouti. Vérifiez votre connexion.' }); }
    finally { setDevoirActionEnCours(false); }
  }

  async function confirmerSuppression() {
    if (!confirmSupprimer || devoirActionEnCours) return;
    const { id: devoirId } = confirmSupprimer;
    setDevoirActionEnCours(true);
    setConfirmSupprimer(null);
    try {
      const r = await fetch(`${_PROF_API}/api/elearning/devoirs/${devoirId}`, { method: 'DELETE', headers: _profHdrs() });
      if (r.ok) {
        setDevoirsReels(prev => prev.filter(d => d.id !== devoirId));
      } else {
        const d = await r.json();
        setErreurModal({ titre: 'Suppression impossible', message: d.error || 'Impossible de supprimer ce devoir.' });
      }
    } catch { setErreurModal({ titre: 'Erreur réseau', message: 'La requête n\'a pas abouti. Vérifiez votre connexion.' }); }
    finally { setDevoirActionEnCours(false); }
  }

  async function sauvegarderDevoir() {
    if (savingDevoir) return;
    const tok = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
    if (!tok) { setModalCreer(false); return; }
    setSavingDevoir(true);
    try {
      const body = {
        classe_id:      creerForm.groupe_id,
        classe_ids:     creerForm.groupe_ids?.length ? creerForm.groupe_ids : (creerForm.groupe_id ? [creerForm.groupe_id] : []),
        titre:          creerForm.titre,
        // 0 = aucun minuteur. Le serveur ignore cette valeur hors rendu « texte ».
        duree_min:      creerForm.dureeComposition > 0 ? creerForm.dureeComposition : null,
        instructions:   creerForm.instructions || '',
        // Les 3 catégories partagent le même contenu - seule la vraie catégorie (devoir/
        // exercice/evaluation) est envoyée : le Backend s'en sert pour le bonus de
        // gamification réservé aux devoirs notés ≥ 80 %. "mixte" = un ou plusieurs blocs
        // QCM/Listening/Audio/Quiz/Speaking combinés (blocs[]) ; sans bloc ajouté, rendu
        // "texte" reste une simple zone de texte libre (texte_libre).
        categorie:      creerForm.categorie || 'devoir',
        format_type:    creerForm.type === 'texte' && creerForm.blocs.length > 0 ? 'mixte' : 'texte_libre',
        blocs:          creerForm.type === 'texte' ? creerForm.blocs : [],
        type_rendu:     creerForm.type || 'texte',
        ressource_url:  creerForm.ressourceUrl || '',
        questions:      [],
        date_ouverture: creerForm.date_ouverture || null,
        heure_ouverture:creerForm.heure_ouverture || '00:00',
        date_limite:    creerForm.date_limite || null,
        heure_limite:   creerForm.heure_limite || '23:59',
        statut:         'brouillon',
      };
      let succes = false;
      if (editDevoirId) {
        // Mode édition - PATCH
        const r = await fetch(`${_PROF_API}/api/elearning/devoirs/${editDevoirId}`, { method: 'PATCH', headers: _profHdrs(), body: JSON.stringify(body) });
        if (r.ok) {
          const d = await r.json();
          const cl = classesReelles.find(c => c.id === creerForm.groupe_id);
          setDevoirsReels(prev => prev.map(x => x.id === editDevoirId ? { ...d.devoir, classe_nom: cl?.nom || x.classe_nom } : x));
          succes = true;
        } else {
          const d = await r.json().catch(() => ({}));
          toast.error(d.error || 'Modification refusée', { duration: 5000 });
        }
      } else {
        // Mode création - POST
        const r = await fetch(`${_PROF_API}/api/elearning/devoirs`, { method: 'POST', headers: _profHdrs(), body: JSON.stringify(body) });
        if (r.ok) {
          const d = await r.json();
          const cl = classesReelles.find(c => c.id === creerForm.groupe_id);
          setDevoirsReels(prev => [{ ...d.devoir, classe_nom: cl?.nom || '' }, ...prev]);
          succes = true;
        } else {
          const d = await r.json().catch(() => ({}));
          toast.error(d.error || 'Création refusée', { duration: 5000 });
        }
      }
      if (succes) { setEditDevoirId(null); setModalCreer(false); }
    } catch {
      toast.error('Impossible de joindre le serveur', { duration: 5000 });
    } finally {
      setSavingDevoir(false);
    }
  }

  async function corrigerRendu() {
    if (!correctionModal || savingCorrection) return;
    setSavingCorrection(true);
    try {
      const { devoir, rendu } = correctionModal;
      // Si l'apprenant n'a jamais soumis (id===null), on passe "new" + inscription_id
      const renduId = rendu.id || 'new';
      const r = await fetch(`${_PROF_API}/api/elearning/devoirs/${devoir.id}/rendus/${renduId}`, {
        method: 'PATCH', headers: _profHdrs(),
        body: JSON.stringify({
          note:              isNaN(parseFloat(correctionForm.note)) ? 0 : parseFloat(correctionForm.note),
          note_max:          20,
          commentaire_coach: correctionForm.commentaire,
          inscription_id:    rendu.inscription_id,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        setDevoirRendusMap(prev => ({
          ...prev,
          [devoir.id]: (prev[devoir.id] || []).map(rv =>
            (rv.id && rv.id === rendu.id) || rv.inscription_id === rendu.inscription_id
              ? { ...d.rendu, apprenant: rv.apprenant }
              : rv
          ),
        }));
        setNotesReelles(prev => [{ ...d.rendu, titre: devoir.titre, classe_nom: devoir.classe_nom }, ...prev.filter(n => n.inscription_id !== rendu.inscription_id || n.titre !== devoir.titre)]);
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Correction refusée', { duration: 5000 });
        return;
      }
    } catch {
      toast.error('Impossible de joindre le serveur', { duration: 5000 });
      return;
    } finally {
      setSavingCorrection(false);
    }
    setCorrectionModal(null);
    setCorrectionForm({ note: '', commentaire: '' });
  }

  function fmtChrono(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0
      ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function ouvrirSalle(session) {
    if (session.lien_visio) {
      const w = Math.min(1280, window.screen.width - 40);
      const h = Math.min(800,  window.screen.height - 80);
      const left = Math.round((window.screen.width  - w) / 2);
      const top  = Math.round((window.screen.height - h) / 2);
      window.open(session.lien_visio, 'bet_session_live',
        `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`);
    } else {
      setModalVideoOuvert(true);
    }
    setSalleOuverte(session.id);
    setChronoSec(0);
    setMainLevees([]);
    setChatInput('');

    // Déclarer l'ouverture au serveur : il horodate `demarree_at`, ce qui donne au
    // chronomètre un point de départ qui survit au rafraîchissement, et permet au suivi de
    // constater qu'un cours a bien commencé. Rien de tout cela n'était enregistré jusqu'ici.
    if (session._real) {
      fetch(`${_PROF_API}/api/elearning/seances/${session.id}`, {
        method: 'PATCH', headers: _profHdrs(),
        body: JSON.stringify({ statut: 'en_cours' }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d?.seance) return;
          // On conserve l'horodatage retenu par le serveur - il peut être antérieur à ce
          // clic si la salle était déjà ouverte avant un rechargement de la page.
          setSessionsLocales(prev => prev.map(x => x.id === session.id
            ? { ...x, statut: 'en_cours', demarree_at: d.seance.demarree_at || x.demarree_at }
            : x));
        })
        .catch(() => {});
    }
    // pré-remplir présences depuis l'état existant
    const appDuGroupe = (apprenantsByClasse[session.groupe_id] || []).filter(a => a.statut !== 'suspendu').map(a => { const p=(a.nom_complet||'').split(' '); return { id:a.id, prenom:p.slice(0,-1).join(' ')||a.nom_complet, nom:p[p.length-1]||'' }; });
    const init = {};
    appDuGroupe.forEach(a => { init[a.id] = presences[`${session.id}__${a.id}`] || 'non_renseigne'; });
    setPresencesLive(init);
    // messages de bienvenue simulés
    setChatLive([
      { id: 1, auteur: '🤖 Système', texte: `Salle "${session.titre}" ouverte. En attente des apprenants…`, ts: new Date().toISOString(), systeme: true },
    ]);
  }

  async function cloturerSalle(session) {
    const appDuGroupe = (apprenantsByClasse[session.groupe_id] || []).filter(a => a.statut !== 'suspendu').map(a => { const p=(a.nom_complet||'').split(' '); return { id:a.id, prenom:p.slice(0,-1).join(' ')||a.nom_complet, nom:p[p.length-1]||'' }; });

    // Bloquer si des présences ne sont pas renseignées
    const nonRenseignes = appDuGroupe.filter(a => !presencesLive[a.id] || presencesLive[a.id] === 'non_renseigne');
    if (appDuGroupe.length > 0 && nonRenseignes.length > 0) {
      await alerte(`⚠️ Renseignez d'abord les présences : ${nonRenseignes.length} apprenant(s) sans statut.`, { danger: true });
      return;
    }

    const estDeleg    = mesSessions.find(s => s.id === session.id)?._delegation || !!delegationActive;
    const marqueur    = {
      id:       profile?.id || 'teacher-001',
      prenom:   profile?.prenom || 'Prof',
      nom:      profile?.nom || '',
      typeRole: estDeleg ? 'remplacant' : 'titulaire',
      date:     new Date().toISOString(),
    };
    // Persister présences + statut séance en base AVANT de mettre à jour l'écran - si le
    // serveur refuse (permission manquante), l'écran ne doit rien afficher comme réussi.
    if (session._real) {
      const appsClasse = apprenantsByClasse[session.groupe_id] || [];
      const payload = appsClasse
        .filter(a => presencesLive[a.id] && presencesLive[a.id] !== 'non_renseigne')
        .map(a => ({ inscription_id: a.id, statut: presencesLive[a.id] }));
      try {
        if (payload.length > 0) {
          const rPres = await fetch(`${_PROF_API}/api/elearning/seances/${session.id}/presences`, {
            method: 'POST', headers: _profHdrs(), body: JSON.stringify({ presences: payload }),
          });
          if (!rPres.ok) {
            const d = await rPres.json().catch(() => ({}));
            toast.error(d.error || "L'enregistrement des présences a été refusé", { duration: 5000 });
            return;
          }
        }
        const rSeance = await fetch(`${_PROF_API}/api/elearning/seances/${session.id}`, {
          method: 'PATCH', headers: _profHdrs(),
          // Le chronomètre part avec la clôture : sans lui, personne ne peut dire après coup
          // combien de temps le cours a réellement duré.
          body: JSON.stringify({ statut: 'realisee', compte_rendu: session.notes_prof || null, duree_reelle_s: chronoSec }),
        });
        if (!rSeance.ok) {
          const d = await rSeance.json().catch(() => ({}));
          toast.error(d.error || 'La clôture de la session a été refusée', { duration: 5000 });
          return;
        }
      } catch (e) {
        toast.error('Impossible de joindre le serveur', { duration: 5000 });
        return;
      }
    }

    const nouvPresences  = { ...presences };
    const nouvAuteurs    = { ...presencesAuteurs };
    appDuGroupe.forEach(a => {
      const key = `${session.id}__${a.id}`;
      if (presencesLive[a.id] && presencesLive[a.id] !== 'non_renseigne') {
        nouvPresences[key] = presencesLive[a.id];
        nouvAuteurs[key]   = marqueur;
      }
    });
    setPresences(nouvPresences);
    setPresencesAuteurs(nouvAuteurs);
    setSessionsLocales(prev => prev.map(s => s.id === session.id ? { ...s, statut: 'realisee' } : s));
    setSessionsCloturees(prev => new Set([...prev, session.id]));
    setSalleOuverte(null);
    setChronoSec(0);
    setMainLevees([]);
  }

  function envoyerMessage() {
    if (!chatInput.trim()) return;
    setChatLive(prev => [...prev, {
      id: Date.now(),
      auteur: `${profile?.prenom || 'Prof'} ${profile?.nom?.[0] || ''}.`,
      texte: chatInput.trim(),
      ts: new Date().toISOString(),
    }]);
    setChatInput('');
  }

  // ── Données filtrées ──
  // ── Délégation active - donnée réelle (table `delegations`, posée à l'assignation d'un
  // remplacement - voir Backend/docs/remplacement-schema.html) chargée par AuthContext.jsx.
  const delegationActive = delegation ? {
    ...delegation,
    titulaireId: delegation.titulaire_id,
  } : null;

  // IDs des sessions déléguées reçues (pour éviter de les compter deux fois dans sessionsPerso)
  const sessionsDelegIds = new Set(delegationActive?.sessions_ids || []);
  // IDs des sessions que CE coach a lui-même déléguées à un remplaçant (délégations sortantes,
  // actives) - à exclure de ses propres sessions/paiements tant qu'elles sont couvertes, sinon
  // elles restent comptabilisées chez le titulaire ET chez le remplaçant simultanément (le
  // coach_id en base n'est réattribué qu'à la clôture de chaque séance, cf.
  // traiterClotureSeanceRemplacement).
  const sessionsDeleguesSortantesIds = new Set(
    (delegationsSortantes || []).flatMap(d => d.sessions_ids || [])
  );

  // Sessions propres au prof (hors sessions déléguées, reçues ou données)
  const sessionsPerso = sessionsLocales.filter(s =>
    (s.professeur_id === profile?.id || s.professeur_id === 'teacher-001') &&
    !sessionsDelegIds.has(s.id) &&
    !sessionsDeleguesSortantesIds.has(s.id)
  );
  // Sessions déléguées marquées
  const sessionsDelegation = delegationActive?.sessions_ids?.length
    ? sessionsLocales.filter(s => sessionsDelegIds.has(s.id)).map(s => ({ ...s, _delegation: true }))
    : [];
  const mesSessions = [...sessionsPerso, ...sessionsDelegation];

  // Restauration de la salle après un rafraîchissement.
  //
  // `salleOuverte` ne vivait que dans la mémoire de l'onglet : recharger la page suffisait à
  // la perdre, alors que le serveur, lui, gardait la séance en « en_cours ». Le coach ne
  // voyait plus rien tandis que le suivi la donnait toujours en direct. C'est le serveur qui
  // fait foi : on lui redemande.
  useEffect(() => {
    if (salleOuverte) return;
    const ouverte = mesSessions.find(s =>
      s._real && s.statut === 'en_cours' &&
      // Le présentiel a son propre modal : le restaurer ici ouvrirait la mauvaise salle.
      s.type_session !== 'presentiel' &&
      // Une séance clôturée dans cet onglet ne doit pas se rouvrir le temps que la liste
      // rechargée revienne du serveur.
      !sessionsClôturees.has(s.id)
    );
    if (!ouverte) return;
    setSalleOuverte(ouverte.id);
    setChatLive([{ id: 1, auteur: '🤖 Système', systeme: true,
      texte: `Salle « ${ouverte.titre} » retrouvée - elle était restée ouverte.`,
      ts: new Date().toISOString() }]);
  }, [mesSessions, salleOuverte, sessionsClôturees]);

  // Chronomètre - calculé depuis l'horodatage d'ouverture du serveur, et non par un compteur
  // local parti de zéro : ce dernier repartait à 00:00 à chaque rafraîchissement et dérivait
  // dès que l'onglet passait en veille. La durée d'un cours ne dépend pas d'un onglet.
  useEffect(() => {
    if (!salleOuverte) { setChronoSec(0); return; }
    const session = mesSessions.find(s => s.id === salleOuverte);
    const depart = session?.demarree_at ? new Date(session.demarree_at).getTime() : Date.now();
    const calcul = () => setChronoSec(Math.max(0, Math.round((Date.now() - depart) / 1000)));
    calcul();
    const id = setInterval(calcul, 1000);
    return () => clearInterval(id);
  }, [salleOuverte, mesSessions]);

  // Groupes propres + groupe délégué
  const groupesPerso = classesReelles.map(c => ({
    id: c.id, nom: c.nom, professeur_id: c.coach_id,
    client_id: c.entreprise_id, est_actif: c.statut === 'actif', statut: c.statut,
    niveau: c.niveau, cecr_min: c.niveau, cecr_max: c.niveau,
    nb_apprenants: c.nb_apprenants,
  }));
  const groupeDelegue = delegationActive?.groupe_id && !groupesPerso.some(gp => gp.id === delegationActive.groupe_id)
    ? [{
        id: delegationActive.groupe_id,
        nom: delegationActive.groupe?.nom || '-',
        professeur_id: delegationActive.titulaireId,
        client_id: delegationActive.groupe?.entreprise_id,
        est_actif: true,
        niveau: delegationActive.groupe?.niveau,
        cecr_min: delegationActive.groupe?.niveau,
        cecr_max: delegationActive.groupe?.niveau,
        nb_apprenants: delegationActive.groupe?.nb_apprenants,
        _delegation: true, _lectureSeule: true,
      }]
    : [];
  // Les classes couvertes par une délégation TERMINÉE ne rejoignent volontairement PAS
  // `mesGroupes` - ce tableau alimente le compteur "Groupes" du header, les filtres Médiathèque
  // /Planning/Apprenants et les listes de création, donc y ajouter l'historique ferait
  // apparaître la classe du titulaire comme si elle appartenait en propre au remplaçant, bien
  // après la fin de son intervention. `groupesHistoriques` reste disponible séparément pour les
  // deux seuls endroits qui en ont réellement besoin : la feuille de présence d'une séance
  // déléguée passée, et le libellé de groupe dans "Mes paiements".
  const mesGroupes = [...groupesPerso, ...groupeDelegue];

  const mesApprenants = Object.entries(apprenantsByClasse)
    // `apprenantsByClasse` sert aussi de cache pour l'historique de délégations terminées
    // (feuille de présence passée) - on ne garde ici que les classes réellement "les
    // miennes" (propres + délégation active), sinon les apprenants d'une classe déléguée
    // dans le passé restent visibles indéfiniment dans l'onglet Apprenants du remplaçant.
    .filter(([cId]) => mesGroupes.some(g => g.id === cId))
    .flatMap(([cId, apps]) =>
      apps.map(a => {
        const p = (a.nom_complet || '').split(' ');
        const dn = a.date_naissance;
        const age = dn ? Math.floor((Date.now() - new Date(dn)) / (365.25*24*3600*1000)) : null;
        const tranche_age = age === null ? null : age <= 12 ? 'enfant' : age <= 17 ? 'adolescent' : 'adulte';
        return {
          id: a.id, profile_id: a.apprenant_id || a.id,
          prenom: p.slice(0, -1).join(' ') || a.nom_complet,
          nom: p[p.length - 1] || '',
          niveau_cecr: a.niveau_cecr || '-',
          groupe_id: cId, statut: a.statut || 'actif',
          email: a.email, avatar_url: a.avatar_url || null,
          date_naissance: dn || null,
          age,
          tranche_age,
          profil_type: a.profil_type || 'adulte',
          prenom_parent: a.prenom_parent || null,
          nom_parent: a.nom_parent || null,
          email_parent: a.email_parent || null,
          telephone_parent: a.telephone_parent || null,
        };
      })
    );

  useEffect(() => {
    if (!modalApprenant) { setGamifModalApp(null); return; }
    const app = mesApprenants.find(x => x.id === modalApprenant);
    const profileId = app?.profile_id;
    if (!profileId) { setGamifModalApp({ solde: 0, badges: [] }); return; }
    fetch(`${_PROF_API}/api/gamification/admin/${profileId}`, { headers: _profHdrs() })
      .then(r => r.json())
      .then(d => setGamifModalApp({ solde: d.solde || 0, badges: d.badges || [] }))
      .catch(() => setGamifModalApp({ solde: 0, badges: [] }));
  }, [modalApprenant]); // eslint-disable-line react-hooks/exhaustive-deps

  // Contenus propres (hors contenus du titulaire quand délégation active)
  const contenusPerso = contenusLocaux.filter(c =>
    (c.professeur_id === profile?.id || c.professeur_id === 'teacher-001') &&
    !(delegationActive && c.professeur_id === delegationActive.titulaireId && c.professeur_id !== (profile?.id || 'teacher-001'))
  );
  // Contenus du titulaire en lecture seule
  const contenusDelegues = delegationActive
    ? contenusLocaux
        .filter(c =>
          c.professeur_id === delegationActive.titulaireId &&
          delegationActive.titulaireId !== (profile?.id || 'teacher-001') &&
          !contenusPerso.some(cp => cp.id === c.id)
        )
        .map(c => ({ ...c, _delegation: true, _lectureSeule: true }))
    : [];
  const mesContenus = [...contenusPerso, ...contenusDelegues];

  /* ── TAUX DE LECTURE DE TOUTE LA MÉDIATHÈQUE ──────────────────────────────────
     La donnée vit dans `contenus_lus` depuis le début et rien ne la montrait au coach
     dans sa liste : il fallait ouvrir un contenu, un par un, pour savoir s'il avait été
     lu. Un appel par contenu PUBLIÉ seulement — un brouillon n'est lu par personne, et
     afficher « 0/12 » dessus ferait croire à un échec de diffusion. Un compteur qui
     échoue est simplement absent : la liste s'affiche quand même. */
  const chargerCompteursLecture = useCallback(async (liste) => {
    const publies = (liste || []).filter(c => c.est_visible || c.statut === 'publie');
    if (!publies.length) return;
    const res = {};
    await Promise.all(publies.map(async (c) => {
      try {
        const r = await fetch(`${_PROF_API}/api/elearning/contenus/${c.id}/lecteurs`, { headers: _profHdrs() });
        if (!r.ok) return;
        const d = await r.json();
        res[c.id] = { lus: d.lus || 0, total: d.total || 0 };
      } catch { /* un compteur manquant n'empêche pas d'afficher la liste */ }
    }));
    setCompteursLecture(prev => ({ ...prev, ...res }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── UN SEUL ÉCRAN DE CRÉATION, comme chez dash ───────────────────────────────
     La création passait par deux modales successives : « Nouveau module » posait les
     paramètres et enregistrait un contenu avec `blocs: []`, puis il fallait revenir au
     tableau et cliquer « Modifier » pour ouvrir l'éditeur et y mettre quelque chose. Le
     coach créait donc des coquilles vides, et une coquille oubliée reste en base sans
     que rien ne le signale. On choisit ses classes et on rédige dans le même écran ; un
     seul appel serveur, avec les blocs dedans. */
  function ouvrirCreationContenu(classePreselectionnee) {
    const parDefaut = classePreselectionnee
      || mesGroupes.filter(g => g.est_actif && !g._delegation)[0]?.id
      || '';
    setContenuEnEdition(null);
    setFormSupport({
      titre: '', description: '', type_contenu: 'lecon', module: '', semaine: 1,
      groupe_ids: parDefaut ? [parDefaut] : [], est_visible: false, fichier: null,
    });
    setModuleForm({ objectifs: '', dureeEstimee: 30, statut: 'brouillon' });
    setBlocs([]); setShowBlocForm(false); setPreviewMode(false); setEtapeContenu(1);
    setModalSupport(true);
  }

  function ouvrirEditionContenu(c) {
    setContenuEnEdition(c.id);
    setFormSupport({
      titre: c.titre, description: c.description || '', type_contenu: c.type_contenu,
      module: c.module || '', semaine: c.semaine || 1,
      groupe_ids: classesDuContenu(c), est_visible: c.est_visible, fichier: null,
    });
    setModuleForm({ objectifs: c.objectifs || '', dureeEstimee: c.dureeEstimee || 30, statut: c.statut || 'publie' });
    setBlocs(c.blocs || []); setShowBlocForm(false); setPreviewMode(false); setEtapeContenu(1);
    setModalSupport(true);
  }

  /**
   * La PORTÉE d'une action sur un contenu, en une phrase.
   *
   * « Publier ? » ne dit rien ; « Publier vers Anglais Moov A2 et Anglais Moov B1 — 14
   * apprenants seront prévenus » dit exactement ce qui va se passer. Depuis que le même
   * contenu part vers plusieurs classes, une confirmation qui ne chiffre pas sa portée
   * laisse le coach deviner combien de personnes il vient d'alerter.
   */
  function porteeDuContenu(c) {
    const ids = classesDuContenu(c);
    const noms = ids.map(id => mesGroupes.find(g => g.id === id)?.nom).filter(Boolean);
    const nbApprenants = new Set(
      mesApprenants.filter(a => ids.includes(a.groupe_id)).map(a => a.id)
    ).size;
    return {
      ids, noms, nbApprenants,
      libClasses: noms.length ? noms.join(', ') : 'aucune classe',
      libApprenants: `${nbApprenants} apprenant${nbApprenants > 1 ? 's' : ''}`,
    };
  }

  /* Les DEUX listes comptent. Savoir que « 4 ont lu » n'aide pas à relancer ; savoir QUI
     n'a pas ouvert, si. C'est pourquoi on appelle `/lecteurs` et non `/lus`. */
  async function ouvrirLecteurs(contenu) {
    setLecteursModal({ contenu, data: null, loading: true });
    try {
      const r = await fetch(`${_PROF_API}/api/elearning/contenus/${contenu.id}/lecteurs`, { headers: _profHdrs() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setLecteursModal({ contenu, data: d, loading: false });
      setCompteursLecture(prev => ({ ...prev, [contenu.id]: { lus: d.lus || 0, total: d.total || 0 } }));
    } catch (e) {
      toast.error(e.message || 'Impossible de charger les lectures');
      setLecteursModal(null);
    }
  }

  /* ── PUBLIER / DÉPUBLIER ET SUPPRIMER UN CONTENU ──────────────────────────────
     Les routes `PATCH /contenus/:id` (champ `est_visible`) et `DELETE /contenus/:id`
     existaient déjà ; aucun écran ne les appelait. La médiathèque n'était donc qu'une
     liste de consultation, là où celle de dash diffuse.
     `actionMedia` porte l'id en cours de traitement : il verrouille le seul contenu
     concerné, pas toute la liste. */
  async function basculerPublicationMedia(c) {
    if (actionMedia) return;
    const publier = !c.est_visible;
    /* Publier ALERTE tous les apprenants des classes visées — notification dans leur
       espace, et l'envoi n'est pas rattrapable. On annonce donc la portée RÉELLE avant de
       la déclencher : vers quelles classes, et combien de personnes. */
    const p = porteeDuContenu(c);
    const nb = blocs => `${blocs} bloc${blocs > 1 ? 's' : ''}`;
    const ok = publier
      ? await confirmer(
          `Publier « ${c.titre} » (${nb((c.blocs || []).length)}) ?\n\n`
          + `Destinataires : ${p.libClasses}\n`
          + `${p.libApprenants} recevront une notification dans leur espace.\n\n`
          + `Cet envoi n'est pas annulable.`,
          { titre: '📤 Publier ce contenu', confirmLabel: 'Publier maintenant', danger: false })
      : await confirmer(
          `Dépublier « ${c.titre} » ?\n\n`
          + `Il disparaîtra de l'espace de : ${p.libClasses}\n`
          + `${p.libApprenants} n'y auront plus accès.\n\n`
          + `Le contenu n'est pas supprimé : vous pourrez le republier.`,
          { titre: '📥 Repasser en brouillon', confirmLabel: 'Dépublier' });
    if (!ok) return;

    setActionMedia(c.id);
    try {
      const r = await fetch(`${_PROF_API}/api/elearning/contenus/${c.id}`, {
        method: 'PATCH', headers: _profHdrs(),
        body: JSON.stringify({ est_visible: publier, statut: publier ? 'publie' : 'brouillon', envoyer_email: false }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Opération impossible');
      setContenus(prev => prev.map(x => x.id === c.id ? { ...x, est_visible: publier, statut: publier ? 'publie' : 'brouillon' } : x));
      setModalVoirContenu(prev => prev && prev.id === c.id ? { ...prev, est_visible: publier } : prev);
      /* La colonne « Lu par » ne se remplit que pour les contenus publiés, et son
         compteur est chargé au démarrage. Sans ce rafraîchissement, un contenu publié
         depuis le tableau afficherait « … » indéfiniment ; dépublié, il garderait un
         compteur périmé en mémoire. */
      if (publier) chargerCompteursLecture([{ id: c.id, est_visible: true }]);
      else setCompteursLecture(prev => { const n = { ...prev }; delete n[c.id]; return n; });
      toast.success(publier ? 'Contenu publié — les apprenants sont prévenus.' : 'Contenu dépublié.');
    } catch (e) {
      toast.error(e.message || 'Opération impossible');
    } finally { setActionMedia(null); }
  }

  /* ── RENDRE UN CONTENU OBLIGATOIRE, OU LE LIBÉRER ──
     Un contenu « obligatoire » doit être terminé avant que ceux publiés APRÈS lui ne
     s'ouvrent, pour les classes qu'il vise. Il sert à imposer un ordre là où il compte —
     on ne commence pas le passé composé avant le présent — sans l'imposer partout.
     Mise à jour optimiste : le basculement est un simple booléen, attendre l'aller-retour
     ferait paraître figé un bouton qui doit répondre au clic. On revient en arrière si le
     serveur refuse. */
  async function basculerSequentielMedia(c) {
    const nouveau = !c.lecture_sequentielle;
    /* Ce bouton n'avait AUCUNE confirmation, et c'est pourtant celui dont l'effet est le
       moins visible depuis l'écran du coach : rendre un contenu obligatoire FERME tous
       ceux publiés après lui, pour des apprenants qui ne comprendront pas pourquoi. Un
       clic de trop verrouillait un parcours entier sans rien afficher. */
    const p = porteeDuContenu(c);
    const ok = await confirmer(
      nouveau
        ? `Rendre « ${c.titre} » obligatoire ?\n\n`
          + `Dans ${p.libClasses}, tous les cours publiés APRÈS celui-ci resteront fermés `
          + `tant qu'un apprenant ne l'a pas marqué comme terminé.\n\n`
          + `${p.libApprenants} sont concernés. Vous pourrez revenir en arrière à tout moment.`
        : `Repasser « ${c.titre} » en lecture libre ?\n\n`
          + `Les cours qu'il retenait s'ouvriront immédiatement pour ${p.libApprenants}, `
          + `qu'ils l'aient terminé ou non.`,
      { titre: nouveau ? '🔒 Lecture obligatoire' : '🔓 Lecture libre',
        confirmLabel: nouveau ? 'Rendre obligatoire' : 'Libérer',
        danger: false });
    if (!ok) return;
    setContenus(prev => prev.map(x => x.id === c.id ? { ...x, lecture_sequentielle: nouveau } : x));
    try {
      const r = await fetch(`${_PROF_API}/api/elearning/contenus/${c.id}`, {
        method: 'PATCH', headers: _profHdrs(),
        body: JSON.stringify({ lecture_sequentielle: nouveau }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Action refusée');
      toast.success(nouveau
        ? `« ${c.titre} » est maintenant obligatoire — les cours publiés après lui resteront fermés tant qu'il n'est pas terminé.`
        : `« ${c.titre} » repasse en lecture libre.`);
    } catch (e) {
      setContenus(prev => prev.map(x => x.id === c.id ? { ...x, lecture_sequentielle: !nouveau } : x));
      toast.error(e.message || 'Impossible de modifier ce réglage');
    }
  }

  async function supprimerContenuMedia(c) {
    if (actionMedia) return;
    const p = porteeDuContenu(c);
    const suivi = compteursLecture[c.id];
    /* Supprimer un contenu DÉJÀ PUBLIÉ le retire de l'espace d'apprenants qui l'ont
       peut-être déjà ouvert, et leur progression le concernant disparaît avec lui. Le
       nombre de lectures déjà enregistrées est l'information qui fait hésiter — c'est
       elle qu'il faut montrer, pas un avertissement générique. */
    const ok = await confirmer(
      `Supprimer définitivement « ${c.titre} » ?\n\n`
      + (c.est_visible
          ? `⚠️ Ce contenu est PUBLIÉ vers : ${p.libClasses}\n`
            + `${p.libApprenants} le perdront immédiatement.\n`
            + (suivi?.lus ? `${suivi.lus} l'ont déjà terminé — ces lectures seront perdues.\n` : '')
          : `Ce contenu est en brouillon : personne ne le voit aujourd'hui.\n`)
      + `\nLe contenu et ses ${(c.blocs || []).length} bloc${(c.blocs || []).length > 1 ? 's' : ''} seront perdus. Cette action est sans retour.`,
      { titre: '🗑 Supprimer ce contenu', confirmLabel: 'Supprimer définitivement', danger: true });
    if (!ok) return;
    setActionMedia(c.id);
    try {
      const r = await fetch(`${_PROF_API}/api/elearning/contenus/${c.id}`, { method: 'DELETE', headers: _profHdrs() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Suppression impossible');
      setContenus(prev => prev.filter(x => x.id !== c.id));
      setCompteursLecture(prev => { const n = { ...prev }; delete n[c.id]; return n; });
      setModalVoirContenu(null);
      toast.success('Contenu supprimé.');
    } catch (e) {
      toast.error(e.message || 'Suppression impossible');
    } finally { setActionMedia(null); }
  }
  const mesNotes     = [];
  const mesDevoirs   = [];

  // ── KPIs ──
  const prochaineSess      = mesSessions.find(s => s.statut === 'planifiee');
  const groupeDuJour       = prochaineSess ? mesGroupes.find(g => g.id === prochaineSess.groupe_id) : mesGroupes[0];
  const effectifDuJour = (apprenantsByClasse[groupeDuJour?.id] || []).filter(a => a.statut !== 'suspendu').length;
  const realPresEntries  = Object.entries(presences).filter(([, v]) => v !== 'non_renseigne');
  const totalPres        = realPresEntries.length;
  const presentCount     = realPresEntries.filter(([, v]) => v === 'present').length;
  const tauxPresence     = totalPres > 0 ? Math.round((presentCount / totalPres) * 100) : 0;
  const devoirsACorrection = mesDevoirs.filter(d => d.statut === 'rendu' && d.note === null);
  const sessionsRealisees  = mesSessions.filter(s => s.statut === 'realisee');
  const evalsAVenir        = mesSessions.filter(s => s.statut === 'planifiee' && s.type === 'evaluation');

  // ── Présences : session active ──
  const sessionActiveId    = sessionPresId || sessionsRealisees[0]?.id || null;
  const sessionActive      = mesSessions.find(s => s.id === sessionActiveId);
  const groupeActifPres    = sessionActive ? mesGroupes.find(g => g.id === sessionActive.groupe_id) : null;
  const apprenantsPres = groupeActifPres
    ? (apprenantsByClasse[groupeActifPres.id] || []).map(a => {
        const p = (a.nom_complet || '').split(' ');
        return { id: a.id, prenom: p.slice(0,-1).join(' ') || a.nom_complet, nom: p[p.length-1] || '', niveau_cecr: a.niveau_cecr, groupe_id: groupeActifPres.id, statut: a.statut, email: a.email, avatar_url: a.avatar_url || null };
      })
    : [];

  const stats = [
    { label: 'Groupes',       valeur: mesGroupes.length,                                     couleur: couleurTheme },
    { label: 'Apprenants',    valeur: mesApprenants.length,                                   couleur: COULEURS.succes },
    { label: 'Sessions à venir', valeur: mesSessions.filter(s => s.statut === 'planifiee').length, couleur: COULEURS.attention },
    { label: 'À corriger',    valeur: devoirsACorrection.length,                              couleur: '#A78BFA' },
  ];

  // ── Styles ──────────────────────────────────────────────────────────────────
  const S = {
    corps: { flex: 1, overflowY: 'auto', padding: '24px 32px' },
    banniere: {
      background: 'linear-gradient(90deg,#FCD34D,#F97316)', borderRadius: 12,
      padding: '12px 20px', marginBottom: 20, display: 'flex', alignItems: 'center',
      gap: 10, fontSize: 13, fontWeight: 600, color: COULEURS.navy,
    },
    grille: (cols = 'repeat(auto-fit,minmax(180px,1fr))') => ({
      display: 'grid', gridTemplateColumns: cols, gap: 16, marginBottom: 24,
    }),
    carte: (acc = couleurTheme, extra = {}) => ({
      background: COULEURS.blanc, borderRadius: 14, padding: '18px 20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      border: `1px solid ${COULEURS.gris200}`, borderTop: `3px solid ${acc}`, ...extra,
    }),
    kpiVal: { fontSize: 32, fontWeight: 800, color: COULEURS.navy, lineHeight: 1, marginBottom: 4 },
    kpiLbl: { fontSize: 13, color: COULEURS.gris600 },
    titreSec: { fontSize: 15, fontWeight: 700, color: COULEURS.navy, marginBottom: 14 },
    liste: { display: 'flex', flexDirection: 'column', gap: 10 },
    ligneSession: (statut) => {
      const m = { planifiee: { bg: COULEURS.blanc, bord: COULEURS.gris200, acc: couleurTheme }, en_cours: { bg: '#ECFDF5', bord: '#6EE7B7', acc: COULEURS.succes }, realisee: { bg: COULEURS.gris50, bord: COULEURS.gris200, acc: COULEURS.gris400 }, annulee: { bg: '#FEF2F2', bord: '#FECACA', acc: '#EF4444' } };
      const c = m[statut] || m.planifiee;
      return { background: c.bg, border: `1px solid ${c.bord}`, borderLeft: `4px solid ${c.acc}`, borderRadius: 12, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 };
    },
    btn: (bg = couleurTheme, small = false) => ({
      background: bg, color: '#fff', border: 'none', borderRadius: 8,
      padding: small ? '6px 13px' : '9px 18px', fontSize: small ? 12 : 13,
      fontWeight: 600, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif',
    }),
    btnGhost: {
      background: 'transparent', color: couleurTheme, border: `1.5px solid ${couleurTheme}`,
      borderRadius: 8, padding: '7px 15px', fontSize: 13, fontWeight: 600,
      cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif',
    },
    tableau: { background: COULEURS.blanc, borderRadius: 12, overflow: 'hidden', border: `1px solid ${COULEURS.gris200}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 24 },
    thead: (cols) => ({ display: 'grid', gridTemplateColumns: cols, padding: '11px 18px', background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris200}`, fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.05em' }),
    trow: (cols) => ({ display: 'grid', gridTemplateColumns: cols, padding: '13px 18px', borderBottom: `1px solid ${COULEURS.gris100}`, alignItems: 'center', fontSize: 13 }),
    select: { padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', background: COULEURS.blanc, color: COULEURS.navy, outline: 'none', cursor: 'pointer' },
    vide: { textAlign: 'center', padding: 40, color: COULEURS.gris400, fontSize: 13, background: COULEURS.gris50, borderRadius: 12, border: `1px dashed ${COULEURS.gris200}`, marginBottom: 24 },
    infoBox: (bg = '#EFF6FF') => ({ background: bg, borderRadius: 10, padding: '12px 16px', fontSize: 12, lineHeight: 1.7, marginBottom: 20, color: '#1e40af' }),
    input: { padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', width: '100%', boxSizing: 'border-box', outline: 'none' },
  };

  // ════════════════════════════════════════════════════════════════════════════
  // RENDU
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <>
    <TopNavLayout stats={stats}>
      <div style={S.corps}>

        {/* Bannière délégation */}
        {delegationActive && (
          <div style={{ background:'linear-gradient(135deg,#5B21B6,#7C3AED)', borderRadius:12, padding:'12px 20px', marginBottom:20, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <span style={{ fontSize:18 }}>🔄</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:800, color:'#fff' }}>
                Délégation active - vous remplacez {delegationActive.titulaire?.prenom} {delegationActive.titulaire?.nom}
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:2 }}>
                Groupe : {delegationActive.groupe?.nom} · {delegationActive.sessions_ids?.length} session{delegationActive.sessions_ids?.length > 1 ? 's' : ''} déléguée{delegationActive.sessions_ids?.length > 1 ? 's' : ''}
                {delegationActive.assigne_par_nom && ` · Assigné par ${delegationActive.assigne_par_nom} (PA Advisor)`}
              </div>
            </div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <span style={{ fontSize:10, fontWeight:700, background:'rgba(255,255,255,0.15)', color:'#fff', padding:'3px 9px', borderRadius:10 }}>✅ Présences autorisées</span>
              <span style={{ fontSize:10, fontWeight:700, background:'rgba(255,255,255,0.15)', color:'#fff', padding:'3px 9px', borderRadius:10 }}>🎥 Sessions live déléguées</span>
              <span style={{ fontSize:10, fontWeight:700, background:'rgba(239,68,68,0.3)', color:'#FCA5A5', padding:'3px 9px', borderRadius:10 }}>🚫 Programme en lecture seule</span>
            </div>
          </div>
        )}


        {/* ══════════ TABLEAU DE BORD ══════════ */}
        {section === 'tableau_bord' && (
          <div>
            {/* Groupe du jour */}
            <div style={{ ...S.carte(couleurTheme, { marginBottom: 24, padding: '20px 24px' }) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Groupe du jour</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: COULEURS.navy }}>{groupeDuJour?.nom || '-'}</div>
                  <div style={{ fontSize: 13, color: COULEURS.gris600, marginTop: 4 }}>
                    Niveau {groupeDuJour?.cecr_min} → {groupeDuJour?.cecr_max} · {groupeDuJour?.tranche_age}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 28 }}>
                  {[
                    { val: effectifDuJour,  lbl: 'Effectif',       couleur: COULEURS.navy },
                    { val: `${tauxPresence}%`, lbl: 'Taux présence', couleur: tauxPresence >= 80 ? COULEURS.succes : COULEURS.attention },
                    { val: devoirsACorrection.length, lbl: 'À corriger', couleur: devoirsACorrection.length > 0 ? '#EF4444' : COULEURS.succes },
                  ].map(k => (
                    <div key={k.lbl} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 26, fontWeight: 800, color: k.couleur }}>{k.val}</div>
                      <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 2 }}>{k.lbl}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bannière nouvelles classes */}
            {nouvellesClasses.length > 0 && (
              <div style={{ background:'#EFF6FF', border:'1.5px solid #BFDBFE', borderRadius:12, padding:'14px 18px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
                <div>
                  <div style={{ fontWeight:700, color:'#1D4ED8', fontSize:13 }}>🆕 {nouvellesClasses.length} nouvelle{nouvellesClasses.length>1?'s':''} classe{nouvellesClasses.length>1?'s':''} assignée{nouvellesClasses.length>1?'s':''}</div>
                  <div style={{ fontSize:12, color:'#3B82F6', marginTop:3 }}>{nouvellesClasses.map(c => c.nom).join(' · ')}</div>
                </div>
                <button onClick={() => {
                  const key = `bet_known_classes_${profile?.id}`;
                  localStorage.setItem(key, JSON.stringify(classesReelles.map(c => c.id)));
                  setNouvellesClasses([]);
                }} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid #93C5FD', background:'#DBEAFE', color:'#1D4ED8', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                  ✓ Vu
                </button>
              </div>
            )}

            {/* Bannière nouveaux apprenants */}
            {nouveauxApprenants.length > 0 && (
              <div style={{ background:'#F0FDF4', border:'1.5px solid #BBF7D0', borderRadius:12, padding:'14px 18px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
                <div>
                  <div style={{ fontWeight:700, color:'#15803D', fontSize:13 }}>👤 {nouveauxApprenants.length} nouvel{nouveauxApprenants.length>1?'s':''} apprenant{nouveauxApprenants.length>1?'s':''} inscrit{nouveauxApprenants.length>1?'s':''}</div>
                  <div style={{ fontSize:12, color:'#16A34A', marginTop:3 }}>{nouveauxApprenants.map(a => a.nom_complet || `${a.prenom||''} ${a.nom||''}`).join(' · ')}</div>
                </div>
                <button onClick={() => {
                  const key = `bet_known_apps_${profile?.id}`;
                  const snap = {};
                  classesReelles.forEach(c => { snap[c.id] = (apprenantsByClasse[c.id] || []).length; });
                  localStorage.setItem(key, JSON.stringify(snap));
                  setNouveauxApprenants([]);
                }} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid #86EFAC', background:'#DCFCE7', color:'#15803D', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                  ✓ Vu
                </button>
              </div>
            )}

            {/* KPIs */}
            <div style={S.grille()}>
              {[
                { val: mesGroupes.length, lbl: 'Groupes assignés', acc: couleurTheme },
                { val: mesApprenants.length, lbl: 'Apprenants', acc: COULEURS.succes },
                { val: mesSessions.filter(s => s.statut === 'planifiee').length, lbl: 'Sessions à venir', acc: COULEURS.attention },
                { val: devoirsACorrection.length, lbl: 'Devoirs à corriger', acc: '#A78BFA' },
                { val: evalsAVenir.length, lbl: 'Évals à venir', acc: '#F97316' },
              ].map(k => (
                <div key={k.lbl} style={S.carte(k.acc)}>
                  <div style={S.kpiVal}>{k.val}</div>
                  <div style={S.kpiLbl}>{k.lbl}</div>
                </div>
              ))}
            </div>

            <div style={S.grille('1fr 1fr')}>
              {/* Prochaine session */}
              <div>
                <div style={S.titreSec}>Prochaine session</div>
                {prochaineSess ? (
                  <div style={S.ligneSession('planifiee')}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: COULEURS.navy, marginBottom: 4 }}>{prochaineSess.titre}</div>
                      <div style={{ fontSize: 12, color: COULEURS.gris600 }}>
                        {fmtDate(prochaineSess.date_session)} · {prochaineSess.heure_debut} – {prochaineSess.heure_fin}
                      </div>
                      <div style={{ fontSize: 12, color: COULEURS.gris400, marginTop: 3 }}>
                        {mesGroupes.find(g => g.id === prochaineSess.groupe_id)?.nom}
                      </div>
                    </div>
                    <button style={S.btn(COULEURS.succes)} onClick={() => { ouvrirSalle(prochaineSess); navigate('/professeur/session-live'); }}>
                      🎥 Démarrer
                    </button>
                  </div>
                ) : <div style={S.vide}>Aucune session planifiée</div>}

                {/* Notes post-session */}
                {sessionsRealisees.filter(s => s.notes_prof).length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={S.titreSec}>Notes post-session</div>
                    {sessionsRealisees.filter(s => s.notes_prof).map(s => (
                      <div key={s.id} style={{ ...S.carte(COULEURS.gris400, { padding: '12px 16px', marginBottom: 10 }) }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: COULEURS.navy, marginBottom: 4 }}>{s.titre} · {fmtDate(s.date_session)}</div>
                        <div style={{ fontSize: 12, color: COULEURS.gris600, fontStyle: 'italic' }}>{s.notes_prof}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Évaluations à venir */}
              <div>
                <div style={S.titreSec}>Évaluations à venir</div>
                <div style={S.liste}>
                  {evalsAVenir.length === 0 ? (
                    <div style={S.vide}>Aucune évaluation planifiée</div>
                  ) : evalsAVenir.map(ev => (
                    <div key={ev.id} style={S.carte('#8B5CF6', { padding: '14px 18px' })}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy }}>{ev.titre}</div>
                          <div style={{ fontSize: 12, color: COULEURS.gris600, marginTop: 3 }}>
                            {mesGroupes.find(g => g.id === ev.groupe_id)?.nom} · {fmtDate(ev.date_session || ev.date)}
                          </div>
                        </div>
                        <Puce label="Évaluation" fond="#EDE9FE" texte="#6D28D9" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════ PLANNING & AGENDA ══════════ */}
        {section === 'planning' && (() => {
          /* LES SIENNES, PLUS CELLES QU'IL REMPLACE - et non l'une OU l'autre.
             Ce planning montrait uniquement les sessions déléguées dès que le rôle valait
             `professeur_remplacant`, masquant au coach ses PROPRES classes. Or il n'existe
             pas de coach remplaçant : ce sont les mêmes titulaires qui se remplacent entre
             eux, comme chez dash. Un coach qui dépanne un collègue le mardi garde ses
             cours du lundi, et doit les voir.
             La délégation est une SITUATION, pas une identité : c'est elle qui ajoute des
             séances, jamais le rôle qui en retire. */
          /* `estRemplacant` décrit la SITUATION du moment - une délégation en cours -
             et non plus le rôle du compte. C'est ce qui change le titre du planning et
             fait apparaître le bandeau de délégation. */
          const estRemplacant = !!delegationActive;
          const parId = new Map((mesSessions || []).map(s => [s.id, s]));
          (delegationActive ? (sessionsDelegation || []) : []).forEach(s => parId.set(s.id, s));
          const sessionsPlanif = [...parId.values()];
          const sessionsFiltreesAll = sessionsPlanif
            .filter(s => {
              if (filtreStatut !== 'tous' && s.statut !== filtreStatut) return false;
              if (planDateDebut && s.date_session < planDateDebut) return false;
              if (planDateFin   && s.date_session > planDateFin)   return false;
              return true;
            })
            .sort((a, b) => a.date_session.localeCompare(b.date_session));
          const nbPagesPlan = Math.ceil(sessionsFiltreesAll.length / PAGE_PLAN);
          const planPageSafe = Math.min(planPage, Math.max(0, nbPagesPlan - 1));
          const sessionsFiltrees = sessionsFiltreesAll.slice(planPageSafe * PAGE_PLAN, (planPageSafe + 1) * PAGE_PLAN);
          const CT = { lecon:{ bg:'#E0F2FE', txt:'#0E7490', ic:'📖' }, exercice:{ bg:'#D1FAE5', txt:'#065F46', ic:'✏️' }, devoir:{ bg:'#FEF3C7', txt:'#92400E', ic:'📝' }, audio:{ bg:'#EDE9FE', txt:'#5B21B6', ic:'🎵' } };

          return (
          <div>
            {/* En-tête */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: estRemplacant ? 16 : 20, flexWrap:'wrap', gap:10 }}>
              <div>
                <div style={S.titreSec}>
                  {estRemplacant ? '🔄 Planning de remplacement' : 'Calendrier de mes sessions'}
                </div>
                {estRemplacant && (
                  <div style={{ fontSize:12, color:COULEURS.gris400, marginTop:-8 }}>
                    Uniquement les sessions déléguées par le PA Advisor
                  </div>
                )}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                {/* Filtrage par date */}
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <input
                    type="date"
                    value={planDateDebut}
                    onChange={e => { setPlanDateDebut(e.target.value); setPlanPage(0); }}
                    style={{ padding:'5px 8px', borderRadius:8, border:`1.5px solid ${planDateDebut ? couleurTheme : COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', color:COULEURS.navy, background:COULEURS.blanc }}
                  />
                  <span style={{ fontSize:11, color:COULEURS.gris400 }}>→</span>
                  <input
                    type="date"
                    value={planDateFin}
                    onChange={e => { setPlanDateFin(e.target.value); setPlanPage(0); }}
                    style={{ padding:'5px 8px', borderRadius:8, border:`1.5px solid ${planDateFin ? couleurTheme : COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', color:COULEURS.navy, background:COULEURS.blanc }}
                  />
                  {(planDateDebut || planDateFin) && (
                    <button onClick={() => { setPlanDateDebut(''); setPlanDateFin(''); setPlanPage(0); }}
                      style={{ padding:'4px 9px', borderRadius:8, border:'1px solid #FECACA', background:'#FEF2F2', color:'#DC2626', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>✕</button>
                  )}
                </div>
                {['tous', 'planifiee', 'en_cours', 'realisee', 'annulee'].map(f => (
                  <button
                    key={f}
                    onClick={() => { setFiltreStatut(f); setPlanPage(0); }}
                    style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      border: `1.5px solid ${filtreStatut === f ? couleurTheme : COULEURS.gris200}`,
                      background: filtreStatut === f ? couleurTheme : COULEURS.blanc,
                      color: filtreStatut === f ? '#fff' : COULEURS.gris600,
                      cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif',
                    }}
                  >
                    {f === 'tous' ? 'Toutes' : STATUT_SESSION[f]?.lib}
                  </button>
                ))}
              </div>
            </div>

            {/* Bandeau contexte délégation */}
            {estRemplacant && delegationActive && (
              <div style={{ background:'#F5F3FF', border:'1.5px solid #C4B5FD', borderRadius:12, padding:'14px 18px', marginBottom:20 }}>
                <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:'linear-gradient(135deg,#7C3AED,#5B21B6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>🔄</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:800, color:'#4C1D95', marginBottom:3 }}>
                      Délégation assignée par le PA Advisor
                    </div>
                    <div style={{ fontSize:12, color:'#6D28D9', display:'flex', gap:16, flexWrap:'wrap' }}>
                      <span>👨‍🏫 Titulaire : <strong>{delegationActive.titulaire?.prenom} {delegationActive.titulaire?.nom}</strong></span>
                      <span>👥 Groupe : <strong>{delegationActive.groupe?.nom}</strong></span>
                      <span>📋 {sessionsDelegation.length} session{sessionsDelegation.length > 1 ? 's' : ''} déléguée{sessionsDelegation.length > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    <span style={{ fontSize:10, fontWeight:700, background:'#EDE9FE', color:'#6D28D9', padding:'3px 9px', borderRadius:10 }}>✅ Présences autorisées</span>
                    <span style={{ fontSize:10, fontWeight:700, background:'#EDE9FE', color:'#6D28D9', padding:'3px 9px', borderRadius:10 }}>🎥 Accès live</span>
                    <span style={{ fontSize:10, fontWeight:700, background:'#FEE2E2', color:'#991B1B', padding:'3px 9px', borderRadius:10 }}>🚫 Pas de reprogrammation</span>
                  </div>
                </div>
              </div>
            )}

            {/* Le bloc « Aucune délégation en cours » a été retiré : il ne pouvait
                s'afficher que pour un compte au rôle `professeur_remplacant` SANS
                délégation, c'est-à-dire un coach à qui l'on cachait ses propres cours.
                Ce cas n'existe plus - un coach sans délégation voit simplement son
                propre planning. */}

            {/* Liste des sessions */}
            {sessionsFiltrees.length > 0 && (
              <div style={S.liste}>
                {sessionsFiltrees.map(s => {
                  const groupe       = mesGroupes.find(g => g.id === s.groupe_id);
                  const st           = STATUT_SESSION[s.statut] || STATUT_SESSION.planifiee;
                  const contenusSess = mesContenus.filter(c => (s.contenu_ids || []).includes(c.id));
                  const deplie       = sessionsDepliees.has(s.id);

                  return (
                    <div key={s.id} style={{ ...S.ligneSession(s.statut), flexDirection: 'column', alignItems: 'stretch', padding: 0, gap: 0, borderLeft: s._delegation ? '4px solid #7C3AED' : undefined }}>

                      {/* ── Ligne principale ── */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 18px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap:'wrap' }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: COULEURS.navy }}>{s.titre}</span>
                            <Puce label={st.lib} fond={st.fond} texte={st.texte} />
                            {s._delegation && (
                              <span style={{ padding:'2px 8px', borderRadius:10, background:'#EDE9FE', color:'#6D28D9', fontSize:10, fontWeight:800 }}>🔄 Délégation</span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: COULEURS.gris600 }}>
                            📅 {fmtDate(s.date_session)} · ⏰ {s.heure_debut} – {s.heure_fin}
                          </div>
                          <div style={{ fontSize: 12, color: COULEURS.gris400, marginTop: 3, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span>👥 {groupe?.nom}{groupe?.cecr_min && groupe?.cecr_min !== groupe?.cecr_max ? ` · ${groupe.cecr_min} → ${groupe.cecr_max}` : groupe?.niveau ? ` · ${groupe.niveau}` : ''}</span>
                            {estRemplacant && delegationActive && (
                              <span style={{ color:'#7C3AED', fontWeight:600 }}>👨‍🏫 Titulaire : {delegationActive.titulaire?.prenom} {delegationActive.titulaire?.nom}</span>
                            )}
                            {contenusSess.length > 0 ? (
                              <span style={{ color: couleurTheme, fontWeight: 600 }}>📚 {contenusSess.length} cours lié{contenusSess.length > 1 ? 's' : ''}</span>
                            ) : (
                              <span style={{ color: COULEURS.gris300, fontStyle: 'italic' }}>Aucun cours lié</span>
                            )}
                          </div>
                          {s.notes_prof && (
                            <div style={{ fontSize: 12, color: '#0E7490', marginTop: 6, fontStyle: 'italic', background: '#E0F2FE', padding: '4px 10px', borderRadius: 8, display: 'inline-block' }}>
                              📝 {s.notes_prof}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {contenusSess.length > 0 && (
                            <button
                              onClick={() => setSessionsDepliees(prev => { const n = new Set(prev); deplie ? n.delete(s.id) : n.add(s.id); return n; })}
                              style={{ padding: '7px 13px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: deplie ? COULEURS.gris100 : COULEURS.blanc, color: COULEURS.navy, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                            >
                              {deplie ? '▲ Masquer' : '▼ Voir le cours'}
                            </button>
                          )}
                          {/* Badge type session */}
                          {s.type_session === 'presentiel'
                            ? <span style={{ padding:'3px 9px', borderRadius:10, background:'#FEF3C7', color:'#92400E', fontSize:10, fontWeight:700 }}>🏢 Présentiel</span>
                            : <span style={{ padding:'3px 9px', borderRadius:10, background:'#E0F2FE', color:'#0E7490', fontSize:10, fontWeight:700 }}>📹 En ligne</span>
                          }
                          {/* Actions selon statut - Plannings = consultation uniquement */}
                          {(s.statut === 'en_cours' || s.statut === 'realisee') && (
                            <button style={S.btn(COULEURS.succes)} onClick={() => setModalPresenceSession(s.id)}>
                              {s.statut === 'realisee' ? '✅ Présences' : '📋 Présences'}
                            </button>
                          )}
                          {/* Toggle type session */}
                          <button
                            title={s.type_session === 'presentiel' ? 'Passer en ligne' : 'Passer en présentiel'}
                            style={{ padding:'5px 10px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris400, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                            onClick={() => setSessionsLocales(prev => prev.map(x => x.id === s.id ? { ...x, type_session: x.type_session === 'presentiel' ? 'ligne' : 'presentiel', lien_visio: x.type_session === 'presentiel' ? '' : null } : x))}
                          >{s.type_session === 'presentiel' ? '↔ En ligne' : '↔ Présentiel'}</button>
                          {!estRemplacant && s.statut === 'planifiee' && (
                            <button
                              onClick={() => {
                                setFormAbsence({ motif:'Maladie', dateDebut:s.date_session, dateFin:s.date_session, message:'', sessionsIds:[s.id] });
                                setAbsenceEnvoyee(false);
                                setModalAbsence(true);
                              }}
                              style={{ padding:'7px 13px', borderRadius:8, border:'1.5px solid #FECACA', background:'#FEF2F2', color:'#DC2626', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                            >🚨 Absent</button>
                          )}
                        </div>
                      </div>

                      {/* ── Contenus dépliés ── */}
                      {deplie && contenusSess.length > 0 && (
                        <div style={{ borderTop: `1px solid ${COULEURS.gris100}`, padding: '12px 18px', background: COULEURS.gris50, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {contenusSess.length > 0 && s._delegation && (
                            <div style={{ fontSize:11, color:'#7C3AED', fontWeight:700, marginBottom:4 }}>🔒 Contenus du titulaire - lecture seule</div>
                          )}
                          {contenusSess.map(c => {
                            const ct = CT[c.type_contenu] || { bg: COULEURS.gris100, txt: COULEURS.gris600, ic: '📄' };
                            const blocs = (c.blocs || []);
                            const dureeTotal = blocs.reduce((acc, b) => acc + (b.dureeMin || 0), 0);
                            return (
                              <div key={c.id} style={{ background: COULEURS.blanc, borderRadius: 10, border: `1px solid ${COULEURS.gris200}`, padding: '10px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                  <span style={{ padding: '2px 9px', borderRadius: 20, background: ct.bg, color: ct.txt, fontSize: 11, fontWeight: 700 }}>{ct.ic} {c.type_contenu}</span>
                                  {!c.est_visible && <span style={{ padding: '2px 8px', borderRadius: 10, background: '#FEF3C7', color: '#D97706', fontSize: 10, fontWeight: 700 }}>📝 Brouillon</span>}
                                  <span style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, flex: 1 }}>{c.titre}</span>
                                  {dureeTotal > 0 && <span style={{ fontSize: 11, color: COULEURS.gris400 }}>⏱ {dureeTotal} min</span>}
                                </div>
                                {c.description && (
                                  <div style={{ fontSize: 12, color: COULEURS.gris600, marginTop: 5, lineHeight: 1.5 }}>{c.description}</div>
                                )}
                                {blocs.length > 0 && (
                                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                                    {blocs.map(b => (
                                      <span key={b.id} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: COULEURS.gris100, color: COULEURS.gris600 }}>
                                        {{ texte:'📝', video:'🎬', audio:'🎧', document:'📄', lien:'🔗', exercice:'✏️', quiz:'🧩' }[b.type] || '📄'} {b.titre}
                                      </span>
                                    ))}
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
            {/* Pagination */}
            {nbPagesPlan > 1 && (
              <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:6, marginTop:18 }}>
                <button onClick={() => setPlanPage(0)} disabled={planPageSafe === 0}
                  style={{ padding:'4px 8px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:planPageSafe===0?COULEURS.gris100:COULEURS.blanc, color:planPageSafe===0?COULEURS.gris400:COULEURS.navy, cursor:planPageSafe===0?'default':'pointer', fontSize:12, fontFamily:'inherit' }}>«</button>
                <button onClick={() => setPlanPage(p => Math.max(0, p-1))} disabled={planPageSafe === 0}
                  style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:planPageSafe===0?COULEURS.gris100:COULEURS.blanc, color:planPageSafe===0?COULEURS.gris400:COULEURS.navy, cursor:planPageSafe===0?'default':'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit' }}>‹</button>
                {Array.from({ length: nbPagesPlan }, (_, i) => i).filter(i => Math.abs(i - planPageSafe) <= 2).map(i => (
                  <button key={i} onClick={() => setPlanPage(i)}
                    style={{ padding:'4px 9px', borderRadius:6, border:`1px solid ${i===planPageSafe?couleurTheme:COULEURS.gris200}`, background:i===planPageSafe?couleurTheme:COULEURS.blanc, color:i===planPageSafe?'#fff':COULEURS.navy, cursor:'pointer', fontSize:11, fontWeight:i===planPageSafe?800:500, fontFamily:'inherit' }}>{i+1}</button>
                ))}
                <button onClick={() => setPlanPage(p => Math.min(nbPagesPlan-1, p+1))} disabled={planPageSafe === nbPagesPlan-1}
                  style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:planPageSafe===nbPagesPlan-1?COULEURS.gris100:COULEURS.blanc, color:planPageSafe===nbPagesPlan-1?COULEURS.gris400:COULEURS.navy, cursor:planPageSafe===nbPagesPlan-1?'default':'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit' }}>›</button>
                <button onClick={() => setPlanPage(nbPagesPlan-1)} disabled={planPageSafe === nbPagesPlan-1}
                  style={{ padding:'4px 8px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:planPageSafe===nbPagesPlan-1?COULEURS.gris100:COULEURS.blanc, color:planPageSafe===nbPagesPlan-1?COULEURS.gris400:COULEURS.navy, cursor:planPageSafe===nbPagesPlan-1?'default':'pointer', fontSize:12, fontFamily:'inherit' }}>»</button>
                <span style={{ fontSize:11, color:COULEURS.gris400, marginLeft:4 }}>
                  {planPageSafe+1} / {nbPagesPlan} · {sessionsFiltreesAll.length} sessions
                </span>
              </div>
            )}

            {sessionsFiltrees.length === 0 && delegationActive && (
              <div style={S.vide}>Aucune session déléguée pour ce filtre</div>
            )}

          </div>
          );
        })()}

        {/* ══════════ MES DEMANDES (remplacement) ══════════ */}
        {/* VISIBLE POUR TOUT COACH. L'écran était masqué dès que le rôle valait
            `professeur_remplacant` ou qu'une délégation était en cours - un coach qui
            dépannait un collègue perdait l'accès à ses propres demandes d'absence, pour
            ses propres classes. Le rôle ne retire rien : ce sont les mêmes titulaires qui
            se remplacent entre eux. */}
        {section === 'mes_demandes' && (() => {
          const STATUT_DEMANDE = {
            a_pourvoir: { bg:'#FEE2E2', txt:'#991B1B', lib:'🔴 À pourvoir' },
            en_cours:   { bg:'#DBEAFE', txt:'#1D4ED8', lib:'🔵 En cours'  },
            termine:    { bg:'#D1FAE5', txt:'#065F46', lib:'✅ Terminée'  },
            refuse:     { bg:'#F3F4F6', txt:'#374151', lib:'❌ Refusée'   },
          };
          const demandesFiltrees = demandesAbsence.filter(d => {
            if (filtreDemandesStatut !== 'tous' && d.statut !== filtreDemandesStatut) return false;
            if (filtreDemandesDateDebut && d.date_debut < filtreDemandesDateDebut) return false;
            if (filtreDemandesDateFin   && d.date_debut > filtreDemandesDateFin)   return false;
            return true;
          });
          const filtreDemandesActif = filtreDemandesStatut !== 'tous' || !!filtreDemandesDateDebut || !!filtreDemandesDateFin;
          const nbPagesDemandes  = Math.max(1, Math.ceil(demandesFiltrees.length / DEMANDES_PAR_PAGE));
          const pageDemandesSafe = Math.min(pageDemandes, nbPagesDemandes);
          const demandesPage     = demandesFiltrees.slice((pageDemandesSafe-1)*DEMANDES_PAR_PAGE, pageDemandesSafe*DEMANDES_PAR_PAGE);

          return (
          <div>
            {/* En-tête */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:10 }}>
              <div>
                <div style={S.titreSec}>📨 Mes demandes de remplacement</div>
                <div style={{ fontSize:12, color:COULEURS.gris400, marginTop:-8 }}>Historique de vos absences signalées et leur suivi par le PA Advisor</div>
              </div>
              <button
                onClick={() => ouvrirModalAbsence()}
                style={{ padding:'9px 18px', borderRadius:8, border:'1.5px solid #EF4444', background:'#FEF2F2', color:'#DC2626', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}
              >
                🚨 Signaler une absence
              </button>
            </div>

            {/* Filtres statut + date */}
            <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
              {[
                { id:'tous',       lib:'Tous' },
                { id:'a_pourvoir', lib:'🔴 À pourvoir' },
                { id:'en_cours',   lib:'🔵 En cours' },
                { id:'termine',    lib:'✅ Terminées' },
                { id:'refuse',     lib:'❌ Refusées' },
              ].map(o => (
                <button key={o.id} onClick={() => { setFiltreDemandesStatut(o.id); setPageDemandes(1); }}
                  style={{
                    padding:'6px 13px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer',
                    border:`1.5px solid ${filtreDemandesStatut===o.id?couleurTheme:COULEURS.gris200}`,
                    background: filtreDemandesStatut===o.id?couleurTheme:COULEURS.blanc,
                    color: filtreDemandesStatut===o.id?'#fff':COULEURS.gris600,
                    fontFamily:'"Plus Jakarta Sans",sans-serif',
                  }}>
                  {o.lib}
                </button>
              ))}
              <span style={{ width:1, height:20, background:COULEURS.gris200, margin:'0 4px' }} />
              <span style={{ fontSize:12, fontWeight:700, color:COULEURS.gris600 }}>📅 Début entre</span>
              <input type="date" value={filtreDemandesDateDebut} onChange={e => { setFiltreDemandesDateDebut(e.target.value); setPageDemandes(1); }}
                style={{ padding:'6px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', color:COULEURS.navy }} />
              <span style={{ fontSize:12, color:COULEURS.gris400 }}>et</span>
              <input type="date" value={filtreDemandesDateFin} onChange={e => { setFiltreDemandesDateFin(e.target.value); setPageDemandes(1); }}
                style={{ padding:'6px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', color:COULEURS.navy }} />
              {filtreDemandesActif && (
                <button onClick={() => { setFiltreDemandesStatut('tous'); setFiltreDemandesDateDebut(''); setFiltreDemandesDateFin(''); setPageDemandes(1); }}
                  style={{ padding:'5px 11px', borderRadius:8, border:'1px solid #FECACA', background:'#FEF2F2', color:'#DC2626', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                  ✕ Effacer
                </button>
              )}
              <span style={{ fontSize:12, color:COULEURS.gris400, marginLeft:'auto' }}>
                {demandesFiltrees.length} demande{demandesFiltrees.length>1?'s':''} · page {pageDemandesSafe}/{nbPagesDemandes}
              </span>
            </div>

            {/* Liste */}
            {demandesPage.length === 0 ? (
              <div style={S.vide}>{filtreDemandesActif ? 'Aucune demande sur cette sélection.' : "Aucune demande d'absence envoyée pour le moment."}</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {demandesPage.map(d => {
                  const st = STATUT_DEMANDE[d.statut] || STATUT_DEMANDE.a_pourvoir;
                  return (
                    <div key={d.id} onClick={() => ouvrirDetailDemande(d)}
                      style={{ background: COULEURS.blanc, border: `1.5px solid ${COULEURS.gris200}`, borderRadius:12, padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10, cursor:'pointer', transition:'border-color 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = couleurTheme}
                      onMouseLeave={e => e.currentTarget.style.borderColor = COULEURS.gris200}
                    >
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:'#0F172A', marginBottom:3 }}>
                          {d.motif} · {fmtDate(d.date_debut)}{d.date_debut !== d.date_fin ? ` → ${fmtDate(d.date_fin)}` : ''}
                        </div>
                        <div style={{ fontSize:11, color:'#64748B' }}>
                          👥 {d.groupe_nom || '-'} · {d.nb_sessions} session{d.nb_sessions > 1 ? 's' : ''} concernée{d.nb_sessions > 1 ? 's' : ''}
                          {d.remplacant_nom && <span> · 🔁 {d.remplacant_nom}{d.assigne_par_nom && ` (assigné par ${d.assigne_par_nom})`}</span>}
                          {d.message && <span style={{ fontStyle:'italic' }}> · "{d.message}"</span>}
                        </div>
                        {d.statut === 'refuse' && (
                          <div style={{ fontSize:11, color:'#991B1B', marginTop:4 }}>
                            ❌ Refusée{d.refuse_par_nom ? ` par ${d.refuse_par_nom}` : ' par le PA Advisor'}{d.motif_refus ? ` - ${d.motif_refus}` : ''}
                          </div>
                        )}
                      </div>
                      <span style={{ padding:'3px 10px', borderRadius:10, background:st.bg, color:st.txt, fontSize:11, fontWeight:800, whiteSpace:'nowrap' }}>
                        {st.lib}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {nbPagesDemandes > 1 && (
              <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:6, marginTop:16 }}>
                <button onClick={() => setPageDemandes(1)} disabled={pageDemandesSafe===1}
                  style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background:pageDemandesSafe===1?COULEURS.gris100:COULEURS.blanc, color:pageDemandesSafe===1?COULEURS.gris400:COULEURS.navy, cursor:pageDemandesSafe===1?'default':'pointer', fontSize:12, fontFamily:'inherit' }}>«</button>
                <button onClick={() => setPageDemandes(p => Math.max(1,p-1))} disabled={pageDemandesSafe===1}
                  style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background:pageDemandesSafe===1?COULEURS.gris100:COULEURS.blanc, color:pageDemandesSafe===1?COULEURS.gris400:COULEURS.navy, cursor:pageDemandesSafe===1?'default':'pointer', fontSize:12, fontFamily:'inherit' }}>‹</button>
                {Array.from({length:nbPagesDemandes},(_,i)=>i+1).filter(i=>Math.abs(i-pageDemandesSafe)<=2).map(i=>(
                  <button key={i} onClick={() => setPageDemandes(i)}
                    style={{ padding:'5px 11px', borderRadius:7, border:`1px solid ${i===pageDemandesSafe?couleurTheme:COULEURS.gris200}`, background:i===pageDemandesSafe?couleurTheme:COULEURS.blanc, color:i===pageDemandesSafe?'#fff':COULEURS.navy, fontWeight:i===pageDemandesSafe?800:400, cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>{i}</button>
                ))}
                <button onClick={() => setPageDemandes(p => Math.min(nbPagesDemandes,p+1))} disabled={pageDemandesSafe===nbPagesDemandes}
                  style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background:pageDemandesSafe===nbPagesDemandes?COULEURS.gris100:COULEURS.blanc, color:pageDemandesSafe===nbPagesDemandes?COULEURS.gris400:COULEURS.navy, cursor:pageDemandesSafe===nbPagesDemandes?'default':'pointer', fontSize:12, fontFamily:'inherit' }}>›</button>
                <button onClick={() => setPageDemandes(nbPagesDemandes)} disabled={pageDemandesSafe===nbPagesDemandes}
                  style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background:pageDemandesSafe===nbPagesDemandes?COULEURS.gris100:COULEURS.blanc, color:pageDemandesSafe===nbPagesDemandes?COULEURS.gris400:COULEURS.navy, cursor:pageDemandesSafe===nbPagesDemandes?'default':'pointer', fontSize:12, fontFamily:'inherit' }}>»</button>
              </div>
            )}

            {/* Modal détail */}
            {demandeDetail && (() => {
              const dst = STATUT_DEMANDE[demandeDetail.statut] || STATUT_DEMANDE.a_pourvoir;
              const champ = (label, val) => (
                <div style={{ background:COULEURS.gris50, borderRadius:10, padding:'12px 16px', border:`1px solid ${COULEURS.gris200}` }}>
                  <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>{val}</div>
                </div>
              );
              return (
                <>
                  <div onClick={() => setDemandeDetail(null)} style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.6)', zIndex:1200, backdropFilter:'blur(3px)' }} />
                  <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'90vw', height:'90vh', maxHeight:'90vh', background:COULEURS.blanc, borderRadius:18, boxShadow:'0 30px 80px rgba(0,0,0,0.3)', zIndex:1201, display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                    <div style={{ background:`linear-gradient(135deg, ${COULEURS.navy} 0%, #0E4F6B 100%)`, padding:'20px 26px', flexShrink:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                        <div>
                          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.5)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Demande de remplacement</div>
                          <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>{demandeDetail.motif || 'Motif non précisé'}</div>
                        </div>
                        <button onClick={() => setDemandeDetail(null)} style={{ background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:8, width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
                      </div>
                      <span style={{ marginTop:12, display:'inline-block', padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:700, background:dst.bg, color:dst.txt }}>{dst.lib}</span>
                    </div>
                    <div style={{ flex:1, overflowY:'auto', padding:'22px 26px', display:'flex', flexDirection:'column', gap:14 }}>
                      {demandeDetail.message && (
                        <div style={{ background:'#F0F9FF', borderLeft:`4px solid ${couleurTheme}`, borderRadius:'0 10px 10px 0', padding:'12px 16px', fontSize:13, color:COULEURS.navy, fontStyle:'italic' }}>
                          "{demandeDetail.message}"
                        </div>
                      )}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                        {champ('Groupe concerné', demandeDetail.groupe_nom || '-')}
                        {champ('Séances concernées', `${demandeDetail.nb_sessions} séance${demandeDetail.nb_sessions>1?'s':''}`)}
                        {champ('Début', fmtDate(demandeDetail.date_debut))}
                        {champ('Fin', fmtDate(demandeDetail.date_fin))}
                      </div>
                      {demandeDetail.remplacant_nom && (
                        <div style={{ background:'#F5F3FF', borderRadius:10, padding:'12px 16px', border:'1px solid #DDD6FE', display:'flex', alignItems:'center', gap:10 }}>
                          <span style={{ fontSize:18 }}>🔁</span>
                          <div>
                            <div style={{ fontSize:10, fontWeight:700, color:'#6D28D9', textTransform:'uppercase', letterSpacing:'0.05em' }}>Remplaçant assigné</div>
                            <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{demandeDetail.remplacant_nom}</div>
                            {demandeDetail.assigne_par_nom && (
                              <div style={{ fontSize:11, color:'#6D28D9', marginTop:2 }}>Assigné par {demandeDetail.assigne_par_nom} (PA Advisor)</div>
                            )}
                          </div>
                        </div>
                      )}
                      {demandeDetail.statut === 'refuse' && (
                        <div style={{ background:'#FEF2F2', borderRadius:10, padding:'12px 16px', border:'1px solid #FECACA' }}>
                          <div style={{ fontSize:10, fontWeight:700, color:'#991B1B', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>
                            Motif du refus{demandeDetail.refuse_par_nom ? ` - ${demandeDetail.refuse_par_nom} (PA Advisor)` : ' (PA Advisor)'}
                          </div>
                          <div style={{ fontSize:13, color:'#7F1D1D' }}>{demandeDetail.motif_refus || 'Non précisé'}</div>
                        </div>
                      )}
                      <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:4 }}>
                        Signalée le {fmtDate(demandeDetail.created_at?.slice(0,10))}
                        {demandeDetail.updated_at && demandeDetail.updated_at !== demandeDetail.created_at && ` · Mise à jour le ${fmtDate(demandeDetail.updated_at.slice(0,10))}`}
                      </div>
                    </div>
                    <div style={{ padding:'14px 26px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'flex-end', flexShrink:0 }}>
                      <button onClick={() => setDemandeDetail(null)} style={S.btnGhost}>Fermer</button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
          );
        })()}

        {/* ══════════ GESTION DES APPRENANTS ══════════ */}
        {section === 'apprenants' && (() => {
          const PAR_PAGE = 5;
          const TRANCHES = { enfant:'🧒 Enfant', adolescent:'🧑 Ado', adulte:'👔 Adulte' };
          const PALETTE  = ['#0891B2','#F97316','#7C3AED','#DC2626','#059669','#D97706','#2563EB','#DB2777'];

          const btnPag = (actif) => ({
            width:32, height:32, borderRadius:6, border:`1px solid ${actif?couleurTheme:COULEURS.gris200}`,
            background:actif?couleurTheme:COULEURS.blanc, color:actif?COULEURS.blanc:COULEURS.navy,
            fontSize:12, fontWeight:actif?700:400, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif',
            display:'flex', alignItems:'center', justifyContent:'center',
          });

          // ══ MODE RÉEL ══ (données API disponibles)
          if (classesReelles.length > 0) {
            // Grouper les classes par entreprise
            const entreprisesMap = {};
            let palIdx = 0;
            classesReelles.forEach(cl => {
              const eId = cl.entreprise_id || '__null__';
              if (!entreprisesMap[eId]) {
                const nom = cl.entreprise_nom || 'Particuliers / Sans entreprise';
                entreprisesMap[eId] = {
                  id: eId, nom,
                  initiales: nom.slice(0, 2).toUpperCase(),
                  logo: cl.entreprise_logo_url || null,
                  couleur: PALETTE[palIdx++ % PALETTE.length],
                  classes: [],
                };
              }
              entreprisesMap[eId].classes.push(cl);
            });
            const entreprisesList = Object.entries(entreprisesMap);
            const totalApprenants = classesReelles.reduce((s, cl) => s + (apprenantsByClasse[cl.id]?.length || 0), 0);

            const nbPages  = Math.max(1, Math.ceil(entreprisesList.length / PAR_PAGE));
            const pageCour = Math.min(pageSociete, nbPages);
            const listePage = entreprisesList.slice((pageCour-1)*PAR_PAGE, pageCour*PAR_PAGE);

            return (
              <div>
                {/* En-tête */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:20 }}>
                  <div>
                    <div style={S.titreSec}>Mes apprenants par entreprise</div>
                    <div style={{ fontSize:13, color:COULEURS.gris600, marginTop:-8 }}>
                      {entreprisesList.length} entreprise{entreprisesList.length>1?'s':''} · {classesReelles.length} classe{classesReelles.length>1?'s':''} · {totalApprenants} apprenant{totalApprenants>1?'s':''}
                    </div>
                  </div>
                </div>

                {/* Tableau entreprises */}
                {entreprisesList.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'48px 20px', color:COULEURS.gris400 }}>
                    <div style={{ fontSize:40, marginBottom:12 }}>🏢</div>
                    <div style={{ fontSize:15, fontWeight:600 }}>Aucun apprenant dans vos classes</div>
                  </div>
                ) : (
                  <>
                    <div style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.05)', marginBottom:14 }}>
                      <div style={{ display:'grid', gridTemplateColumns:'2.4fr 0.7fr 0.8fr 2fr 1.4fr', padding:'11px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                        <span>Entreprise</span><span>Classes</span><span>Apprenants</span><span>Niveaux</span><span>Créée le</span>
                      </div>
                      {listePage.map(([eId, ent], idx) => {
                        const appsTotal = ent.classes.reduce((s, cl) => s + (apprenantsByClasse[cl.id]?.length || 0), 0);
                        const niveaux   = [...new Set(ent.classes.map(cl => cl.niveau).filter(Boolean))].sort();
                        const lastCl    = [...ent.classes].sort((a,b) => (b.created_at||'').localeCompare(a.created_at||''))[0];
                        return (
                          <div
                            key={eId}
                            onClick={() => setModalSociete(eId)}
                            style={{ display:'grid', gridTemplateColumns:'2.4fr 0.7fr 0.8fr 2fr 1.4fr', padding:'15px 20px', borderBottom: idx < listePage.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:13, alignItems:'center', cursor:'pointer', transition:'background 0.1s' }}
                            onMouseEnter={e => e.currentTarget.style.background=COULEURS.gris50}
                            onMouseLeave={e => e.currentTarget.style.background='transparent'}
                          >
                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                              {ent.logo ? (
                                <img src={ent.logo} alt={ent.nom} style={{ width:36, height:36, borderRadius:9, objectFit:'cover', border:`2px solid ${ent.couleur+'40'}`, flexShrink:0 }} />
                              ) : (
                                <div style={{ width:36, height:36, borderRadius:9, background:ent.couleur+'18', border:`2px solid ${ent.couleur+'40'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, color:ent.couleur, flexShrink:0 }}>
                                  {ent.initiales}
                                </div>
                              )}
                              <div>
                                <div style={{ fontWeight:700, color:COULEURS.navy }}>{ent.nom}</div>
                                <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:1 }}>{ent.classes.length} classe{ent.classes.length!==1?'s':''} · {appsTotal} apprenant{appsTotal!==1?'s':''}</div>
                              </div>
                            </div>
                            <span style={{ fontWeight:700, color:COULEURS.navy, textAlign:'center' }}>{ent.classes.length}</span>
                            <span style={{ fontWeight:700, color:COULEURS.succes, textAlign:'center' }}>{appsTotal}</span>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                              {niveaux.map(n => (
                                <span key={n} style={{ padding:'2px 7px', borderRadius:20, background:'#E0F2FE', color:'#0E7490', fontSize:11, fontWeight:700 }}>{n}</span>
                              ))}
                              {niveaux.length === 0 && <span style={{ color:COULEURS.gris400, fontSize:12 }}>-</span>}
                            </div>
                            <span style={{ fontSize:12, color:COULEURS.gris500 }}>{fmtDate(lastCl?.created_at)}</span>
                          </div>
                        );
                      })}
                    </div>

                    {nbPages > 1 && (
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <span style={{ fontSize:12, color:COULEURS.gris600 }}>Page {pageCour} / {nbPages}</span>
                        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                          <button onClick={() => setPageSociete(p => Math.max(1,p-1))} disabled={pageCour===1} style={{ ...btnPag(false), opacity:pageCour===1?0.35:1 }}>‹</button>
                          {Array.from({length:nbPages},(_,i)=>i+1).map(p => (
                            <button key={p} onClick={() => setPageSociete(p)} style={btnPag(p===pageCour)}>{p}</button>
                          ))}
                          <button onClick={() => setPageSociete(p => Math.min(nbPages,p+1))} disabled={pageCour===nbPages} style={{ ...btnPag(false), opacity:pageCour===nbPages?0.35:1 }}>›</button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ════ MODAL ENTREPRISE → Classes ════ */}
                {modalSociete !== null && (() => {
                  const ent = entreprisesMap[modalSociete];
                  if (!ent) return null;
                  return (
                    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:900, backdropFilter:'blur(3px)' }}>
                      <div style={{ background:COULEURS.gris50, borderRadius:20, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.3)', overflow:'hidden' }}>
                        <div style={{ background:`linear-gradient(135deg,${ent.couleur}CC,${ent.couleur})`, padding:'18px 24px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                            {ent.logo ? (
                              <img src={ent.logo} alt={ent.nom} style={{ width:44, height:44, borderRadius:10, objectFit:'cover', border:'2px solid rgba(255,255,255,0.35)' }} />
                            ) : (
                              <div style={{ width:44, height:44, borderRadius:10, background:'rgba(255,255,255,0.2)', border:'2px solid rgba(255,255,255,0.35)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:900, color:'#fff' }}>
                                {ent.initiales}
                              </div>
                            )}
                            <div>
                              <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>{ent.nom}</div>
                              <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)', marginTop:2 }}>
                                {ent.classes.length} classe{ent.classes.length!==1?'s':''} · Cliquez sur une classe pour voir ses apprenants
                              </div>
                            </div>
                          </div>
                          <button onClick={() => setModalSociete(null)} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                        </div>

                        <div style={{ flex:1, overflowY:'auto' }}>
                          <div style={{ display:'grid', gridTemplateColumns:'2.5fr 1fr 0.8fr 1fr 1fr', padding:'10px 22px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', position:'sticky', top:0 }}>
                            <span>Classe</span><span>Niveau</span><span>Effectif</span><span>Statut</span><span>Action</span>
                          </div>
                          {ent.classes.length === 0 ? (
                            <div style={{ textAlign:'center', padding:'40px 20px', color:COULEURS.gris400, fontSize:14 }}>Aucune classe pour cette entreprise.</div>
                          ) : ent.classes.map((cl, idx) => {
                            const appsClasse = apprenantsByClasse[cl.id] || [];
                            return (
                              <div
                                key={cl.id}
                                onClick={() => { setModalSociete(null); setModalGroupe(cl.id); setModalGroupeOnglet('apprenants'); }}
                                style={{ display:'grid', gridTemplateColumns:'2.5fr 1fr 0.8fr 1fr 1fr', padding:'14px 22px', borderBottom: idx < ent.classes.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:13, alignItems:'center', cursor:'pointer', transition:'background 0.1s' }}
                                onMouseEnter={e => e.currentTarget.style.background=COULEURS.gris50}
                                onMouseLeave={e => e.currentTarget.style.background='transparent'}
                              >
                                <div>
                                  <div style={{ fontWeight:700, color:COULEURS.navy }}>{cl.nom}</div>
                                  <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:2 }}>{fmtDate(cl.date_debut)} → {fmtDate(cl.date_fin)}</div>
                                </div>
                                <span style={{ padding:'2px 8px', borderRadius:20, background:'#E0F2FE', color:'#0E7490', fontSize:11, fontWeight:700, width:'fit-content' }}>{cl.niveau || '-'}</span>
                                <span style={{ fontWeight:700, color:COULEURS.navy, textAlign:'center' }}>{appsClasse.length}</span>
                                <span style={{ padding:'3px 9px', borderRadius:20, fontSize:11, fontWeight:700, background: cl.statut==='actif'?'#D1FAE5':'#F1F5F9', color: cl.statut==='actif'?'#065F46':'#475569', width:'fit-content' }}>
                                  {cl.statut === 'actif' ? '● Active' : '○ Archivée'}
                                </span>
                                <button
                                  onClick={e => { e.stopPropagation(); setModalSociete(null); setModalGroupe(cl.id); setModalGroupeOnglet('apprenants'); }}
                                  style={{ padding:'5px 12px', borderRadius:7, border:'none', background:ent.couleur, color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', width:'fit-content' }}
                                >Voir →</button>
                              </div>
                            );
                          })}
                        </div>

                        <div style={{ padding:'12px 22px', borderTop:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, display:'flex', justifyContent:'flex-end', flexShrink:0 }}>
                          <button onClick={() => setModalSociete(null)} style={{ padding:'8px 18px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>Fermer</button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ════ MODAL CLASSE → Apprenants ════ */}
                {modalGroupe !== null && (() => {
                  const cl  = classesReelles.find(c => c.id === modalGroupe);
                  const eid = cl?.entreprise_id || '__null__';
                  const ent = entreprisesMap[eid] || { nom:'Entreprise', couleur:PALETTE[0], initiales:'EN' };
                  const listApp = apprenantsByClasse[modalGroupe] || [];
                  const TABS_CL = [
                    { id:'apprenants', lib:'Apprenants', icone:'👥' },
                    { id:'presences',  lib:'Présences',  icone:'✅' },
                    { id:'sessions',   lib:'Sessions',   icone:'📅' },
                    { id:'chat',       lib:'Chat',       icone:'💬' },
                  ];
                  const padded = ['presences','sessions','chat'].includes(modalGroupeOnglet);
                  return (
                    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:901, backdropFilter:'blur(3px)' }}>
                      <div style={{ background:COULEURS.gris50, borderRadius:20, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.3)', overflow:'hidden' }}>
                        <div style={{ background:`linear-gradient(135deg,${ent.couleur}CC,${ent.couleur})`, padding:'18px 24px', flexShrink:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10, fontSize:12, color:'rgba(255,255,255,0.65)' }}>
                            <button onClick={() => { setModalGroupe(null); setModalSociete(eid); }} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'3px 10px', color:'rgba(255,255,255,0.85)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                              ← {ent.nom}
                            </button>
                            <span>›</span>
                            <span style={{ color:'#fff', fontWeight:700 }}>{cl?.nom}</span>
                          </div>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                            {/* La photo de la classe, en lecture seule : le coach la
                                consulte, l'onboarding la pose. Même image que dans le fil
                                de discussion de cette classe. */}
                            <PhotoClasseEntete classe={cl} taille={48} accent="#fff" />
                            <div style={{ flex:1, minWidth:0, marginLeft:14 }}>
                              <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>{cl?.nom}</div>
                              <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)', marginTop:2 }}>
                                Niveau {cl?.niveau || '-'}{cl?.coach_nom ? ` · 👨‍🏫 ${cl.coach_nom}` : ''}
                              </div>
                              {/* KPI chips */}
                              <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                                {[
                                  { ico:'👥', val:listApp.length,                                        lbl:'Inscrits'  },
                                  { ico:'✅', val:listApp.filter(a=>a.statut==='actif').length,          lbl:'Actifs'    },
                                  { ico:'⚠️', val:listApp.filter(a=>a.statut==='suspendu').length,       lbl:'Suspendus' },
                                  { ico:'🎯', val:cl?.niveau || '-',                                    lbl:'Niveau'    },
                                ].map(k => (
                                  <div key={k.lbl} style={{ background:'rgba(255,255,255,0.14)', border:'1px solid rgba(255,255,255,0.22)', borderRadius:8, padding:'5px 12px', textAlign:'center', minWidth:64 }}>
                                    <div style={{ fontSize:13, fontWeight:800, color:'#fff' }}>{k.ico} {k.val}</div>
                                    <div style={{ fontSize:9, color:'rgba(255,255,255,0.7)', fontWeight:600, textTransform:'uppercase', marginTop:1 }}>{k.lbl}</div>
                                  </div>
                                ))}
                              </div>

                              {/* LES CRÉNEAUX DE LA CLASSE. Le coach ne les voyait nulle
                                  part : `horaire` n'apparaissait dans AUCUN de ses écrans,
                                  alors qu'en recevant une classe la première chose à savoir
                                  est QUAND elle a lieu. Lecture seule - l'emploi du temps
                                  est posé par l'Onboarding à la création. */}
                              {Array.isArray(cl?.horaire) && cl.horaire.length > 0 ? (
                                <div style={{ display:'flex', gap:7, marginTop:9, flexWrap:'wrap', alignItems:'center' }}>
                                  <span style={{ fontSize:10, color:'rgba(255,255,255,0.65)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em' }}>📅 Créneaux</span>
                                  {cl.horaire.map((h, i) => (
                                    <span key={i} style={{ background:'rgba(255,255,255,0.18)', border:'1px solid rgba(255,255,255,0.28)', borderRadius:7, padding:'3px 10px', fontSize:11, fontWeight:700, color:'#fff', whiteSpace:'nowrap' }}>
                                      {h.jour} {h.debut}–{h.fin}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ marginTop:9, fontSize:11, color:'rgba(255,255,255,0.6)' }}>
                                  📅 Aucun créneau défini pour cette classe
                                </div>
                              )}
                            </div>
                            <button onClick={() => setModalGroupe(null)} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginLeft:12 }}>✕</button>
                          </div>
                          {/* Onglets */}
                          <div style={{ display:'flex', gap:4, marginTop:14, flexWrap:'wrap' }}>
                            {TABS_CL.map(t => (
                              <button key={t.id} onClick={() => setModalGroupeOnglet(t.id)} style={{ padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'"Plus Jakarta Sans", sans-serif', background: modalGroupeOnglet===t.id ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.15)', color: modalGroupeOnglet===t.id ? ent.couleur : 'rgba(255,255,255,0.85)', transition:'all 0.15s' }}>
                                {t.icone} {t.lib}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div style={{ flex:1, overflowY: modalGroupeOnglet==='chat'?'hidden':'auto', display: modalGroupeOnglet==='chat'?'flex':'block', flexDirection:'column', padding: padded && modalGroupeOnglet!=='chat' ? '20px 22px' : 0 }}>
                          {modalGroupeOnglet === 'apprenants' && (
                            <>
                              <div style={{ display:'grid', gridTemplateColumns:'2.5fr 1fr 1fr 1fr', padding:'10px 22px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', position:'sticky', top:0 }}>
                                <span>Apprenant</span><span>Niveau CECR</span><span>Statut</span><span>Contact</span>
                              </div>
                              {listApp.length === 0 ? (
                                <div style={{ textAlign:'center', padding:'40px 20px', color:COULEURS.gris400, fontSize:14 }}>Aucun apprenant inscrit dans cette classe.</div>
                              ) : listApp.map((a, idx) => (
                                <div
                                  key={a.id}
                                  onClick={() => { setModalGroupe(null); setModalApprenant(a.id); setModalOnglet('infos'); }}
                                  style={{ display:'grid', gridTemplateColumns:'2.5fr 1fr 1fr 1fr', padding:'13px 22px', borderBottom: idx < listApp.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:13, alignItems:'center', cursor:'pointer', transition:'background 0.1s' }}
                                  onMouseEnter={e => e.currentTarget.style.background=COULEURS.gris50}
                                  onMouseLeave={e => e.currentTarget.style.background='transparent'}
                                >
                                  <div>
                                    <div style={{ fontWeight:700, color:COULEURS.navy }}>{a.nom_complet}</div>
                                    <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:1 }}>{a.email || '-'}</div>
                                  </div>
                                  <span style={{ padding:'2px 8px', borderRadius:20, background:'#E0F2FE', color:'#0E7490', fontSize:11, fontWeight:700, width:'fit-content' }}>{a.niveau_cecr || '-'}</span>
                                  <span style={{ padding:'3px 9px', borderRadius:20, fontSize:11, fontWeight:700, background: a.statut==='actif'?'#D1FAE5':a.statut==='suspendu'?'#FEF3C7':'#F1F5F9', color: a.statut==='actif'?'#065F46':a.statut==='suspendu'?'#92400E':'#475569', width:'fit-content' }}>
                                    {a.statut === 'actif' ? '● Actif' : a.statut === 'suspendu' ? '⚠ Suspendu' : '○ Inactif'}
                                  </span>
                                  <span style={{ fontSize:12, color:COULEURS.gris600 }}>{a.telephone || '-'}</span>
                                </div>
                              ))}
                            </>
                          )}
                          {modalGroupeOnglet === 'presences' && (
                            <OngletPresencesClasse classeId={cl?.id} couleur={ent.couleur} nbApprenants={listApp.length} nomClasse={cl?.nom} />
                          )}
                          {modalGroupeOnglet === 'sessions' && (
                            <OngletSessionsClasse classeId={cl?.id} coachNom={cl?.coach_nom || profile?.prenom + ' ' + profile?.nom} couleur={ent.couleur} />
                          )}
                          {modalGroupeOnglet === 'chat' && (
                            <OngletChatGroupe classeId={cl?.id} couleur={ent.couleur} profile={profile} />
                          )}
                        </div>

                        <div style={{ padding:'12px 22px', borderTop:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                          <span style={{ fontSize:12, color:COULEURS.gris600 }}>{listApp.length} apprenant{listApp.length!==1?'s':''} · Cliquez sur un apprenant pour sa fiche complète</span>
                          <button onClick={() => setModalGroupe(null)} style={{ padding:'8px 18px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>Fermer</button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          }

          // ══ PAS DE CLASSES (données chargées mais vides) ══
          if (classesDataLoaded) {
            return (
              <div style={{ textAlign:'center', padding:'64px 20px', color:COULEURS.gris400, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                <div style={{ fontSize:48, marginBottom:16 }}>🏫</div>
                <div style={{ fontSize:16, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>Aucune classe assignée</div>
                <div style={{ fontSize:13, color:COULEURS.gris600, maxWidth:380, margin:'0 auto' }}>
                  Vous n'avez pas encore de classe active. Un administrateur doit vous assigner une classe pour que vos apprenants apparaissent ici.
                </div>
              </div>
            );
          }

          // ══ CHARGEMENT EN COURS ══
          return (
            <div style={{ textAlign:'center', padding:'64px 20px', color:COULEURS.gris400, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
              <div style={{ fontSize:32, marginBottom:12, opacity:0.5 }}>⏳</div>
              <div style={{ fontSize:14, color:COULEURS.gris500 }}>Chargement des apprenants…</div>
            </div>
          );

          // (dead code below - kept as placeholder for linter)
          const SOCIETES = {
            'tlg-001':  { nom:'TLG PHARMA',     initiales:'TL', couleur:'#0891B2', secteur:'Pharmaceutique'      },
            'oc-001':   { nom:'ORANGE CI',       initiales:'OC', couleur:'#F97316', secteur:'Télécommunications'  },
            'sg-001':   { nom:'SGBCI',           initiales:'SG', couleur:'#7C3AED', secteur:'Banque'              },
            'canal-001':{ nom:'CANAL+ AFRIQUE',  initiales:'CA', couleur:'#DC2626', secteur:'Médias'              },
            'nsia-001': { nom:'NSIA BANQUE',     initiales:'NS', couleur:'#059669', secteur:'Banque'              },
            null:       { nom:'Particuliers',    initiales:'🧑', couleur:'#64748B', secteur:'Inscriptions indiv.' },
          };

          const parSociete = mesApprenants.reduce((acc, a) => {
            const key = a.client_id ?? 'null';
            if (!acc[key]) acc[key] = [];
            acc[key].push(a);
            return acc;
          }, {});
          const societesList = Object.entries(parSociete);
          const nbPages    = Math.max(1, Math.ceil(societesList.length / PAR_PAGE));
          const pageCour   = Math.min(pageSociete, nbPages);
          const listePage  = societesList.slice((pageCour - 1) * PAR_PAGE, pageCour * PAR_PAGE);

          return (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:20 }}>
                <div>
                  <div style={S.titreSec}>Mes apprenants par société</div>
                  <div style={{ fontSize:13, color:COULEURS.gris600, marginTop:-8 }}>
                    {societesList.length} société{societesList.length>1?'s':''} · {mesApprenants.length} apprenant{mesApprenants.length>1?'s':''}
                  </div>
                </div>
              </div>

              {societesList.length === 0 ? (
                <div style={{ textAlign:'center', padding:'48px 20px', color:COULEURS.gris400 }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>🏢</div>
                  <div style={{ fontSize:15, fontWeight:600 }}>Aucun apprenant dans vos groupes</div>
                </div>
              ) : (
                <>
                  <div style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.05)', marginBottom:14 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'2.4fr 1fr 0.7fr 0.7fr 1.8fr 1.4fr 0.9fr', padding:'11px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                      <span>Société</span><span>Secteur</span><span>Apprenants</span><span>Actifs</span><span>Classes</span><span>Niveaux</span><span>Présence moy.</span>
                    </div>
                    {listePage.map(([clientId, apprenants], idx) => {
                      const soc      = SOCIETES[clientId] || SOCIETES[null];
                      const nbActifs = apprenants.filter(a => a.statut === 'actif').length;
                      const groupesSoc = mesGroupes.filter(g => g.client_id === clientId);
                      const niveaux  = [...new Set(apprenants.map(a => a.niveau_cecr).filter(Boolean))].sort();
                      const presTotal = apprenants.reduce((s, a) => {
                        const pA = [];
                        const ok = pA.filter(p => p.statut === 'present').length;
                        return s + (pA.length > 0 ? ok / pA.length : 0);
                      }, 0);
                      const tauxMoy = apprenants.length > 0 ? Math.round(presTotal / apprenants.length * 100) : null;
                      return (
                        <div
                          key={clientId}
                          onClick={() => setModalSociete(clientId)}
                          style={{ display:'grid', gridTemplateColumns:'2.4fr 1fr 0.7fr 0.7fr 1.8fr 1.4fr 0.9fr', padding:'15px 20px', borderBottom: idx < listePage.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:13, alignItems:'center', cursor:'pointer', transition:'background 0.1s' }}
                          onMouseEnter={e => e.currentTarget.style.background=COULEURS.gris50}
                          onMouseLeave={e => e.currentTarget.style.background='transparent'}
                        >
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:36, height:36, borderRadius:9, background:soc.couleur+'18', border:`2px solid ${soc.couleur+'40'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, color:soc.couleur, flexShrink:0 }}>
                              {soc.initiales}
                            </div>
                            <div>
                              <div style={{ fontWeight:700, color:COULEURS.navy }}>{soc.nom}</div>
                              <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:1 }}>{apprenants.length} apprenant{apprenants.length!==1?'s':''} · {groupesSoc.length} classe{groupesSoc.length!==1?'s':''}</div>
                            </div>
                          </div>
                          <span style={{ fontSize:12, color:COULEURS.gris600 }}>{soc.secteur}</span>
                          <span style={{ fontWeight:700, color:COULEURS.navy, textAlign:'center' }}>{apprenants.length}</span>
                          <span style={{ fontWeight:700, color:COULEURS.succes, textAlign:'center' }}>{nbActifs}</span>
                          <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                            {groupesSoc.slice(0,2).map(g => (
                              <span key={g.id} style={{ padding:'2px 7px', borderRadius:20, background:soc.couleur+'12', color:soc.couleur, fontSize:11, fontWeight:600 }}>
                                {g.nom}
                              </span>
                            ))}
                            {groupesSoc.length > 2 && <span style={{ fontSize:11, color:COULEURS.gris400 }}>+{groupesSoc.length-2}</span>}
                          </div>
                          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                            {niveaux.map(n => (
                              <span key={n} style={{ padding:'2px 7px', borderRadius:20, background:'#E0F2FE', color:'#0E7490', fontSize:11, fontWeight:700 }}>{n}</span>
                            ))}
                          </div>
                          <span style={{ fontWeight:700, color: tauxMoy!==null?(tauxMoy>=75?COULEURS.succes:COULEURS.attention):COULEURS.gris400, textAlign:'center' }}>
                            {tauxMoy !== null ? `${tauxMoy}%` : '-'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {nbPages > 1 && (
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <span style={{ fontSize:12, color:COULEURS.gris600 }}>Page {pageCour} / {nbPages} · {societesList.length} société{societesList.length>1?'s':''}</span>
                      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                        <button onClick={() => setPageSociete(p => Math.max(1,p-1))} disabled={pageCour===1} style={{ ...btnPag(false), opacity:pageCour===1?0.35:1 }}>‹</button>
                        {Array.from({length:nbPages},(_,i)=>i+1).map(p => (
                          <button key={p} onClick={() => setPageSociete(p)} style={btnPag(p===pageCour)}>{p}</button>
                        ))}
                        <button onClick={() => setPageSociete(p => Math.min(nbPages,p+1))} disabled={pageCour===nbPages} style={{ ...btnPag(false), opacity:pageCour===nbPages?0.35:1 }}>›</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ════ MODAL SOCIÉTÉ → Classes (mock) ════ */}
              {modalSociete !== null && (() => {
                const cid      = modalSociete;
                const soc      = SOCIETES[cid] || SOCIETES[null];
                const groupesSoc = mesGroupes.filter(g => g.client_id === cid);
                return (
                  <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:900, backdropFilter:'blur(3px)' }}>
                    <div style={{ background:COULEURS.gris50, borderRadius:20, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.3)', overflow:'hidden' }}>
                      <div style={{ background:`linear-gradient(135deg,${soc.couleur}CC,${soc.couleur})`, padding:'18px 24px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                          <div style={{ width:44, height:44, borderRadius:10, background:'rgba(255,255,255,0.2)', border:'2px solid rgba(255,255,255,0.35)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:900, color:'#fff' }}>
                            {soc.initiales}
                          </div>
                          <div>
                            <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>{soc.nom}</div>
                            <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)', marginTop:2 }}>
                              {groupesSoc.length} classe{groupesSoc.length!==1?'s':''} · Cliquez sur une classe pour voir ses apprenants
                            </div>
                          </div>
                        </div>
                        <button onClick={() => setModalSociete(null)} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                      </div>
                      <div style={{ flex:1, overflowY:'auto' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'2.5fr 1fr 1fr 0.8fr 1fr 1fr', padding:'10px 22px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', position:'sticky', top:0 }}>
                          <span>Classe / Groupe</span><span>Tranche d'âge</span><span>Niveaux</span><span>Effectif</span><span>Taux présence</span><span>Action</span>
                        </div>
                        {groupesSoc.length === 0 ? (
                          <div style={{ textAlign:'center', padding:'40px 20px', color:COULEURS.gris400, fontSize:14 }}>Aucune classe pour cette société.</div>
                        ) : groupesSoc.map((g, idx) => {
                          const appsGroupe = mesApprenants.filter(a => a.groupe_id === g.id);
                          const presTotal  = appsGroupe.reduce((s, a) => {
                            const pA = [];
                            const ok = pA.filter(p => p.statut === 'present').length;
                            return s + (pA.length > 0 ? ok / pA.length : 0);
                          }, 0);
                          const tauxG = appsGroupe.length > 0 ? Math.round(presTotal / appsGroupe.length * 100) : null;
                          return (
                            <div
                              key={g.id}
                              onClick={() => { setModalSociete(null); setModalGroupe(g.id); setModalGroupeOnglet('apprenants'); }}
                              style={{ display:'grid', gridTemplateColumns:'2.5fr 1fr 1fr 0.8fr 1fr 1fr', padding:'14px 22px', borderBottom: idx < groupesSoc.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:13, alignItems:'center', cursor:'pointer', transition:'background 0.1s' }}
                              onMouseEnter={e => e.currentTarget.style.background=COULEURS.gris50}
                              onMouseLeave={e => e.currentTarget.style.background='transparent'}
                            >
                              <div>
                                <div style={{ fontWeight:700, color:COULEURS.navy }}>{g.nom}</div>
                                <div style={{ fontSize:10, color: g.est_actif ? COULEURS.succes : COULEURS.gris400, marginTop:2, fontWeight:600 }}>
                                  {g.est_actif ? '● Active' : '○ Archivée'}
                                </div>
                              </div>
                              <span style={{ padding:'3px 9px', borderRadius:20, fontSize:11, fontWeight:700, background: g.tranche_age==='enfant'?'#FEF3C7':g.tranche_age==='adolescent'?'#EDE9FE':'#DBEAFE', color: g.tranche_age==='enfant'?'#92400E':g.tranche_age==='adolescent'?'#5B21B6':'#1D4ED8', width:'fit-content' }}>
                                {TRANCHES[g.tranche_age] || g.tranche_age}
                              </span>
                              <span style={{ fontSize:12, fontWeight:600, color:couleurThemeFonce }}>{g.cecr_min} → {g.cecr_max}</span>
                              <span style={{ fontWeight:700, color:COULEURS.navy, textAlign:'center' }}>{appsGroupe.length}</span>
                              <span style={{ fontWeight:700, color: tauxG!==null?(tauxG>=75?COULEURS.succes:COULEURS.attention):COULEURS.gris400 }}>
                                {tauxG !== null ? `${tauxG}%` : '-'}
                              </span>
                              <button
                                onClick={e => { e.stopPropagation(); setModalSociete(null); setModalGroupe(g.id); setModalGroupeOnglet('apprenants'); }}
                                style={{ padding:'5px 12px', borderRadius:7, border:'none', background:soc.couleur, color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', width:'fit-content' }}>
                                Voir →
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ padding:'12px 22px', borderTop:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, display:'flex', justifyContent:'flex-end', flexShrink:0 }}>
                        <button onClick={() => setModalSociete(null)} style={{ padding:'8px 18px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                          Fermer
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ════ MODAL GROUPE → Apprenants (mock) ════ */}
              {modalGroupe !== null && (() => {
                const groupe   = mesGroupes.find(g => g.id === modalGroupe);
                const cid      = groupe?.client_id ?? 'null';
                const soc      = SOCIETES[cid] || SOCIETES[null];
                const listApp  = mesApprenants.filter(a => a.groupe_id === modalGroupe);
                const TABS_GR  = [
                  { id:'apprenants', lib:'Apprenants', icone:'👥' },
                  { id:'presences',  lib:'Présences',  icone:'✅' },
                  { id:'sessions',   lib:'Sessions',   icone:'📅' },
                  { id:'chat',       lib:'Chat',       icone:'💬' },
                ];
                const padded2 = ['presences','sessions','chat'].includes(modalGroupeOnglet);
                return (
                  <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:901, backdropFilter:'blur(3px)' }}>
                    <div style={{ background:COULEURS.gris50, borderRadius:20, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.3)', overflow:'hidden' }}>
                      <div style={{ background:`linear-gradient(135deg,${soc.couleur}CC,${soc.couleur})`, padding:'18px 24px', flexShrink:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10, fontSize:12, color:'rgba(255,255,255,0.65)' }}>
                          <button onClick={() => { setModalGroupe(null); setModalSociete(cid); }} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'3px 10px', color:'rgba(255,255,255,0.85)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                            ← {soc.nom}
                          </button>
                          <span>›</span>
                          <span style={{ color:'#fff', fontWeight:700 }}>{groupe?.nom}</span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                          {/* Même photo, en lecture seule, que dans l'autre modale et dans
                              le fil de discussion de cette classe. */}
                          <PhotoClasseEntete classe={groupe} taille={48} accent="#fff" />
                          <div style={{ flex:1, minWidth:0, marginLeft:14 }}>
                            <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>{groupe?.nom}</div>
                            <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)', marginTop:2 }}>
                              {TRANCHES[groupe?.tranche_age] || ''}{groupe?.cecr_min ? ` · ${groupe.cecr_min} → ${groupe.cecr_max}` : ''}
                            </div>
                            {/* KPI chips */}
                            <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                              {[
                                { ico:'👥', val:listApp.length,                                        lbl:'Inscrits'  },
                                { ico:'✅', val:listApp.filter(a=>a.statut==='actif').length,          lbl:'Actifs'    },
                                { ico:'⚠️', val:listApp.filter(a=>a.statut==='suspendu').length,       lbl:'Suspendus' },
                                { ico:'🎯', val:groupe?.niveau || groupe?.cecr_min || '-',             lbl:'Niveau'    },
                              ].map(k => (
                                <div key={k.lbl} style={{ background:'rgba(255,255,255,0.14)', border:'1px solid rgba(255,255,255,0.22)', borderRadius:8, padding:'5px 12px', textAlign:'center', minWidth:64 }}>
                                  <div style={{ fontSize:13, fontWeight:800, color:'#fff' }}>{k.ico} {k.val}</div>
                                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.7)', fontWeight:600, textTransform:'uppercase', marginTop:1 }}>{k.lbl}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <button onClick={() => setModalGroupe(null)} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginLeft:12 }}>✕</button>
                        </div>
                        {/* Onglets */}
                        <div style={{ display:'flex', gap:4, marginTop:14, flexWrap:'wrap' }}>
                          {TABS_GR.map(t => (
                            <button key={t.id} onClick={() => setModalGroupeOnglet(t.id)} style={{ padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'"Plus Jakarta Sans", sans-serif', background: modalGroupeOnglet===t.id ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.15)', color: modalGroupeOnglet===t.id ? soc.couleur : 'rgba(255,255,255,0.85)', transition:'all 0.15s' }}>
                              {t.icone} {t.lib}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ flex:1, overflowY: modalGroupeOnglet==='chat'?'hidden':'auto', display: modalGroupeOnglet==='chat'?'flex':'block', flexDirection:'column', padding: padded2 && modalGroupeOnglet!=='chat' ? '20px 22px' : 0 }}>
                        {modalGroupeOnglet === 'apprenants' && (
                          <>
                            <div style={{ display:'grid', gridTemplateColumns:'2fr 0.7fr 0.8fr 1fr 1fr 1fr', padding:'10px 22px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', position:'sticky', top:0 }}>
                              <span>Apprenant</span><span>Âge</span><span>Niveau</span><span>Tranche</span><span>Présence</span><span>Dernière note</span>
                            </div>
                            {listApp.length === 0 ? (
                              <div style={{ textAlign:'center', padding:'40px 20px', color:COULEURS.gris400, fontSize:14 }}>Aucun apprenant dans ce groupe.</div>
                            ) : listApp.map((a, idx) => {
                              const presA = [];
                              const presOk = presA.filter(p => p.statut === 'present').length;
                              const tauxA  = presA.length > 0 ? Math.round(presOk / presA.length * 100) : null;
                              const notesA = mesNotes.filter(n => n.apprenant_id === a.id).sort((x,y) => (y.created_at||'').localeCompare(x.created_at||''));
                              const derniereNote = notesA[0];
                              return (
                                <div
                                  key={a.id}
                                  onClick={() => { setModalGroupe(null); setModalApprenant(a.id); setModalOnglet('infos'); }}
                                  style={{ display:'grid', gridTemplateColumns:'2fr 0.7fr 0.8fr 1fr 1fr 1fr', padding:'13px 22px', borderBottom: idx < listApp.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:13, alignItems:'center', cursor:'pointer', transition:'background 0.1s' }}
                                  onMouseEnter={e => e.currentTarget.style.background=COULEURS.gris50}
                                  onMouseLeave={e => e.currentTarget.style.background='transparent'}
                                >
                                  <div>
                                    <div style={{ fontWeight:700, color:COULEURS.navy }}>{a.prenom} {a.nom}</div>
                                    <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:1 }}>ID : {a.id}</div>
                                  </div>
                                  <span style={{ color:COULEURS.gris600 }}>{a.age} ans</span>
                                  <span style={{ padding:'2px 8px', borderRadius:20, background:'#E0F2FE', color:'#0E7490', fontSize:11, fontWeight:700, width:'fit-content' }}>{a.niveau_cecr}</span>
                                  <span style={{ padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:700, background: a.tranche_age==='enfant'?'#FEF3C7':a.tranche_age==='adolescent'?'#EDE9FE':'#DBEAFE', color: a.tranche_age==='enfant'?'#92400E':a.tranche_age==='adolescent'?'#5B21B6':'#1D4ED8', width:'fit-content' }}>
                                    {TRANCHES[a.tranche_age] || a.tranche_age}
                                  </span>
                                  <span style={{ fontWeight:600, color: tauxA!==null?(tauxA>=75?COULEURS.succes:COULEURS.attention):COULEURS.gris400 }}>
                                    {tauxA !== null ? `${tauxA}%` : '-'}
                                  </span>
                                  <span style={{ fontWeight:600, color:COULEURS.navy }}>
                                    {derniereNote ? `${derniereNote.note}/${derniereNote.note_max}` : '-'}
                                  </span>
                                </div>
                              );
                            })}
                          </>
                        )}
                        {modalGroupeOnglet === 'presences' && (
                          <OngletPresencesClasse classeId={groupe?.id} couleur={soc.couleur} nbApprenants={listApp.length} nomClasse={groupe?.nom} />
                        )}
                        {modalGroupeOnglet === 'sessions' && (
                          <OngletSessionsClasse classeId={groupe?.id} coachNom={profile?.prenom + ' ' + profile?.nom} couleur={soc.couleur} />
                        )}
                        {modalGroupeOnglet === 'chat' && (
                          <OngletChatGroupe classeId={groupe?.id} couleur={soc.couleur} profile={profile} />
                        )}
                      </div>
                      <div style={{ padding:'12px 22px', borderTop:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                        <span style={{ fontSize:12, color:COULEURS.gris600 }}>Cliquez sur un apprenant pour accéder à sa fiche complète</span>
                        <button onClick={() => setModalGroupe(null)} style={{ padding:'8px 18px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                          Fermer
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}


        {/* ══════════ MÉDIATHÈQUE PÉDAGOGIQUE ══════════ */}
        {section === 'mediatheque' && (() => {

          // ── Filtre période ──
          function matchPeriode(dateStr) {
            if (filtreMediaPeriode === 'tous') return true;
            if (!dateStr) return filtreMediaPeriode === 'tous';
            const d   = new Date(dateStr);
            const now = new Date();
            if (filtreMediaPeriode === 'mois')        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            if (filtreMediaPeriode === 'mois_dernier') {
              const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1);
              return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
            }
            if (filtreMediaPeriode === '3mois') {
              const ref = new Date(now); ref.setMonth(ref.getMonth() - 3); return d >= ref;
            }
            if (filtreMediaPeriode === 'annee')  return d.getFullYear() === now.getFullYear();
            if (filtreMediaPeriode === 'custom') {
              if (filtreMediaDateDebut && d < new Date(filtreMediaDateDebut)) return false;
              if (filtreMediaDateFin   && d > new Date(filtreMediaDateFin + 'T23:59:59')) return false;
              return true;
            }
            return true;
          }

          /* La RECHERCHE manquait : la médiathèque de dash en a une, et passé une
             vingtaine de contenus les filtres par classe et par période ne suffisent
             plus à retrouver un titre précis. Elle porte sur ce qu'on a en tête en
             cherchant — le titre, le module, la description, le type. */
          const qMedia = (rechercheMedia || '').trim().toLowerCase();
          const contenusFiltres = mesContenus
            .filter(c => filtreMediaGroupe === 'tous' || contenuViseClasse(c, filtreMediaGroupe))
            .filter(c => filtreMediaStatut === 'tous' || (filtreMediaStatut === 'publie' ? c.est_visible : !c.est_visible))
            .filter(c => matchPeriode(c.date_publication))
            .filter(c => !qMedia || `${c.titre || ''} ${c.module || ''} ${c.description || ''} ${c.type_contenu || ''}`
              .toLowerCase().includes(qMedia));

          /* LE TABLEAU EST À PLAT, comme celui de dash. Les contenus étaient regroupés
             sous une ligne d'en-tête par module, ce qui imposait de paginer PAR MODULE :
             quatre modules par page, quel que soit le nombre de contenus dessous. Le
             module devient une simple mention sous le titre, et la pagination porte sur
             ce qu'on parcourt réellement — les contenus. Elle n'apparaît qu'au-delà d'une
             page, donc jamais pour une médiathèque de taille ordinaire. */
          const CONTENUS_PAR_PAGE = 30;
          const nbPages       = Math.max(1, Math.ceil(contenusFiltres.length / CONTENUS_PAR_PAGE));
          const pageCourante  = Math.min(pageMedia, nbPages);
          const contenusPage  = contenusFiltres.slice((pageCourante - 1) * CONTENUS_PAR_PAGE, pageCourante * CONTENUS_PAR_PAGE);
          const nbPublies     = mesContenus.filter(c => c.est_visible).length;
          const fmtDateTab    = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

          function resetPage() { setPageMedia(1); }

          const btnFiltre = (actif) => ({
            padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: `1.5px solid ${actif ? couleurTheme : COULEURS.gris200}`,
            background: actif ? couleurTheme : COULEURS.blanc,
            color: actif ? '#fff' : COULEURS.gris600,
            fontFamily: '"Plus Jakarta Sans", sans-serif',
          });

          const PERIODES = [
            { id: 'tous',         label: 'Toutes dates' },
            { id: 'mois',         label: 'Ce mois' },
            { id: 'mois_dernier', label: 'Mois dernier' },
            { id: '3mois',        label: '3 derniers mois' },
            { id: 'annee',        label: 'Cette année' },
            { id: 'custom',       label: '📅 Personnalisé' },
          ];

          return (
          <div>
            {/* En-tête */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              {/* Le compteur porte sur la MÉDIATHÈQUE, pas sur le filtre en cours : c'est
                  l'état du fonds que le coach veut connaître d'un coup d'œil (« j'ai 24
                  contenus, 18 sont publiés »), le résultat du filtre se lisant déjà dans
                  le tableau juste dessous. La recherche a rejoint la carte de filtres,
                  avec les autres critères. */}
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: COULEURS.navy }}>📚 Médiathèque</h2>
                <div style={{ fontSize: 12.5, color: COULEURS.gris600, marginTop: 3 }}>
                  {mesContenus.length} contenu{mesContenus.length > 1 ? 's' : ''} · {nbPublies} publié{nbPublies > 1 ? 's' : ''}
                </div>
              </div>
              {/* UN SEUL BOUTON, comme dans la médiathèque de dash. « Créer un module »
                  et « Ajouter un support » exposaient une distinction interne — module
                  d'un côté, support de l'autre — que le coach n'a pas à connaître : il
                  dépose un contenu. Le parcours part du module, puis demande le support ;
                  c'est l'ordre naturel et il n'a plus à être choisi d'avance. */}
              {!delegationActive ? (
                <button style={S.btn(couleurTheme)} onClick={() => ouvrirCreationContenu()}>
                  + Nouveau contenu
                </button>
              ) : (
                <span style={{ fontSize:11, fontWeight:700, color:'#92400E', background:'#FEF3C7', padding:'5px 12px', borderRadius:8, border:'1px solid #FCD34D' }}>
                  🔒 Mode remplaçant - contenus en lecture seule
                </span>
              )}
            </div>

            {/* ── FILTRES ──
                Même carte que dash : la recherche en tête, puis les critères en pastilles,
                du plus large au plus précis — famille de classes, classe, statut, période.
                Les trois libellés en capitales qui titraient chaque rangée ont disparu :
                une pastille « 🟢 Actives » ou « 📗 Publiés » se lit sans qu'on lui annonce
                de quoi elle parle. */}
            <div style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderRadius: 12, padding: '14px 16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>

              <input value={rechercheMedia} onChange={e => { setRechercheMedia(e.target.value); resetPage(); }}
                placeholder="Rechercher un contenu…"
                style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${COULEURS.gris200}`, fontSize: 13, outline: 'none', maxWidth: 320, fontFamily: '"Plus Jakarta Sans", sans-serif', boxSizing: 'border-box' }} />

              {/* Famille de classes — une classe clôturée garde ses contenus (l'apprenant y
                  accède toujours), on les range à part plutôt que de les cacher. La rangée
                  « Terminées » ne s'affiche que s'il en existe. */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { id: 'actives',   lib: `✅ Actives (${mesGroupes.filter(g => g.est_actif).length})` },
                  { id: 'terminees', lib: `🔒 Terminées (${mesGroupes.filter(g => g.statut === 'clos').length})` },
                  { id: 'toutes',    lib: `Toutes mes classes (${mesGroupes.length})` },
                ]
                  .filter(o => o.id !== 'terminees' || mesGroupes.some(g => g.statut === 'clos'))
                  .map(o => (
                    <button key={o.id} style={btnFiltre(filtreMediaClasseStatut === o.id)}
                      onClick={() => { setFiltreMediaClasseStatut(o.id); setFiltreMediaGroupe('tous'); resetPage(); }}>
                      {o.lib}
                    </button>
                  ))}
              </div>

              {/* Classe */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={btnFiltre(filtreMediaGroupe === 'tous')} onClick={() => { setFiltreMediaGroupe('tous'); resetPage(); }}>
                  Toutes ({mesContenus.length})
                </button>
                {mesGroupes
                  .filter(g => filtreMediaClasseStatut === 'toutes' ? true : filtreMediaClasseStatut === 'terminees' ? g.statut === 'clos' : g.est_actif)
                  .map(g => {
                    const nb = mesContenus.filter(c => contenuViseClasse(c, g.id)).length;
                    return (
                      <button key={g.id} style={btnFiltre(filtreMediaGroupe === g.id)} onClick={() => { setFiltreMediaGroupe(g.id); resetPage(); }}>
                        {g.statut === 'clos' && '🔒 '}{g.nom.length > 28 ? g.nom.slice(0, 28) + '…' : g.nom}
                        <span style={{ marginLeft: 5, opacity: 0.7 }}>({nb})</span>
                      </button>
                    );
                  })}
              </div>

              {/* Statut */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { id: 'tous',      label: 'Tous statuts' },
                  { id: 'publie',    label: '✅ Publiés' },
                  { id: 'brouillon', label: '📝 Brouillons' },
                ].map(f => (
                  <button key={f.id} style={btnFiltre(filtreMediaStatut === f.id)} onClick={() => { setFiltreMediaStatut(f.id); resetPage(); }}>
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Période de publication — ce filtre n'existe pas chez dash ; il est conservé
                  parce qu'il fonctionne et sert à retrouver ce qui a été déposé sur une
                  période donnée. Il ne s'ouvre qu'à la demande pour ne pas alourdir la
                  carte : fermé, il tient en une ligne qui rappelle le filtre actif. */}
              <div style={{ borderTop: `1px solid ${COULEURS.gris100}`, paddingTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {filtreMediaPeriode === 'tous' && !ouvrirFiltrePeriode ? (
                  <button onClick={() => setOuvrirFiltrePeriode(true)}
                    style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: COULEURS.gris400, cursor: 'pointer', textDecoration: 'underline', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                    📅 Filtrer par période de publication
                  </button>
                ) : (
                  <>
                    {PERIODES.map(pe => (
                      <button key={pe.id} style={btnFiltre(filtreMediaPeriode === pe.id)} onClick={() => { setFiltreMediaPeriode(pe.id); resetPage(); }}>
                        {pe.label}
                      </button>
                    ))}
                    {filtreMediaPeriode === 'custom' && (
                      <>
                        <span style={{ fontSize: 11, color: COULEURS.gris600, fontWeight: 600 }}>Du</span>
                        <input type="date" value={filtreMediaDateDebut}
                          onChange={e => { setFiltreMediaDateDebut(e.target.value); resetPage(); }}
                          style={{ ...S.input, marginBottom: 0, padding: '5px 10px', fontSize: 12, width: 'auto' }} />
                        <span style={{ fontSize: 11, color: COULEURS.gris600, fontWeight: 600 }}>au</span>
                        <input type="date" value={filtreMediaDateFin}
                          onChange={e => { setFiltreMediaDateFin(e.target.value); resetPage(); }}
                          style={{ ...S.input, marginBottom: 0, padding: '5px 10px', fontSize: 12, width: 'auto' }} />
                      </>
                    )}
                    {(filtreMediaPeriode !== 'tous' || filtreMediaDateDebut || filtreMediaDateFin) && (
                      <button onClick={() => { setFiltreMediaPeriode('tous'); setFiltreMediaDateDebut(''); setFiltreMediaDateFin(''); resetPage(); }}
                        style={{ fontSize: 11, color: COULEURS.gris400, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                        Effacer
                      </button>
                    )}
                  </>
                )}
              </div>

            </div>
            {/* ── DEUX VIDES DIFFÉRENTS ──
                « Aucun contenu » et « aucun résultat » n'appellent pas la même réponse :
                le premier demande de créer, le second d'élargir le filtre. Les confondre
                sous un seul message laissait un coach devant un écran vide sans savoir
                s'il devait déposer un cours ou simplement cliquer sur « Toutes ». */}
            {mesContenus.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '56px 20px', border: `2px dashed ${COULEURS.gris200}`, borderRadius: 14 }}>
                <div style={{ fontSize: 46, marginBottom: 12 }}>📚</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: COULEURS.gris600, marginBottom: 6 }}>Votre médiathèque est vide</div>
                <div style={{ fontSize: 13, color: COULEURS.gris400, marginBottom: 20 }}>
                  Déposez une leçon, un audio ou une vidéo, et choisissez la classe qui le recevra.
                </div>
                {!delegationActive && (
                  <button style={S.btn(couleurTheme)} onClick={() => ouvrirCreationContenu()}>
                    + Créer mon premier contenu
                  </button>
                )}
              </div>
            ) : contenusFiltres.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', border: `2px dashed ${COULEURS.gris200}`, borderRadius: 14, color: COULEURS.gris400, fontSize: 13 }}>
                Aucun contenu ne correspond à ces filtres.
              </div>
            ) : (
            /* ── TABLEAU À PLAT, celui de dash ──
               Chaque colonne répond à une question que le coach se pose devant sa liste :
               qu'est-ce que c'est, pour qui, combien de temps, qui l'a lu, de quand ça
               date, qu'est-ce qui a bougé, où ça en est. Le module n'est plus un niveau
               d'imbrication avec sa ligne d'en-tête bleue et son propre bouton d'ajout :
               il devient une mention sous le titre. */
            <div style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      {['TYPE', 'TITRE', 'CLASSES', 'DURÉE', 'LU PAR', 'CRÉÉ LE', 'MIS À JOUR', 'STATUT', 'ACTIONS'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '.05em', borderBottom: `1px solid ${COULEURS.gris200}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {contenusPage.map((c, i) => {
                      const ct     = COULEUR_TYPE_CONTENU[c.type_contenu] || { fond: COULEURS.gris100, texte: COULEURS.gris600, lib: c.type_contenu || '-', emoji: '📄' };
                      const publie = !!c.est_visible;
                      const classesCibles = classesDuContenu(c).map(id => mesGroupes.find(g => g.id === id)).filter(Boolean);
                      const duree  = (c.blocs || []).reduce((t, b) => t + (Number(b.duree) || Number(b.dureeMin) || 0), 0) || c.dureeEstimee || 0;
                      return (
                        <tr key={c.id} style={{ background: i % 2 ? '#FAFAFA' : COULEURS.blanc }}>

                          {/* Type */}
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid #F1F5F9', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: ct.fond, color: ct.texte }}>
                              {ct.emoji} {ct.lib}
                            </span>
                          </td>

                          {/* Titre — cliquable, comme toute la ligne l'était avant */}
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid #F1F5F9' }}>
                            <button onClick={() => setModalVoirContenu(c)}
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, color: COULEURS.navy, fontSize: 13, textAlign: 'left', fontFamily: 'inherit' }}>
                              {c.titre}
                            </button>
                            {c.module && <div style={{ fontSize: 11, color: COULEURS.gris400, fontWeight: 500, marginTop: 2 }}>📚 {c.module}</div>}
                            {c._lectureSeule && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#6D28D9', background: '#EDE9FE', padding: '1px 7px', borderRadius: 20, marginTop: 4, display: 'inline-block' }}>
                                🔒 Lecture seule
                              </span>
                            )}
                          </td>

                          {/* Classes — un contenu part maintenant vers plusieurs d'entre
                              elles ; toutes sont listées, car c'est la portée réelle de ce
                              qui a été publié. Sans destinataire, il n'est diffusé à
                              personne et rien ne le signalait : il se confondait avec les
                              autres dans la liste. */}
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid #F1F5F9' }}>
                            {classesCibles.length === 0 ? (
                              <span style={{ fontSize: 11.5, color: '#B45309', fontWeight: 700 }}>Aucune classe - non diffusé</span>
                            ) : (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {classesCibles.map(g => (
                                  <span key={g.id} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: '#F1F5F9', color: '#475569' }}>
                                    {g.statut === 'clos' && '🔒 '}{g.nom.length > 22 ? g.nom.slice(0, 22) + '…' : g.nom}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          {/* Durée */}
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid #F1F5F9', whiteSpace: 'nowrap', color: '#64748B' }}>{duree} min</td>

                          {/* Lu par — la donnée vivait dans `contenus_lus` et rien ne la
                              montrait dans la liste. Elle n'a de sens que sur un contenu
                              publié : sur un brouillon, « 0/12 » ferait croire à un échec
                              de diffusion alors que personne n'était censé le voir. */}
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid #F1F5F9', whiteSpace: 'nowrap' }}>
                            {!publie ? (
                              <span style={{ color: '#CBD5E1', fontSize: 11.5 }}>-</span>
                            ) : (() => {
                              const st = compteursLecture[c.id];
                              if (!st) return <span style={{ color: '#CBD5E1', fontSize: 11.5 }}>…</span>;
                              const pct = st.total ? Math.round((st.lus / st.total) * 100) : 0;
                              return (
                                <button onClick={() => ouvrirLecteurs(c)} title="Voir qui a lu, et qui n'a pas encore ouvert"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                                  <div style={{ fontSize: 12, fontWeight: 800, color: st.lus ? '#15803D' : '#B45309' }}>{st.lus}/{st.total}</div>
                                  <div style={{ width: 56, height: 4, borderRadius: 99, background: '#E5E7EB', marginTop: 3, overflow: 'hidden' }}>
                                    <div style={{ width: `${pct}%`, height: '100%', background: st.lus ? '#15803D' : '#E5E7EB' }} />
                                  </div>
                                </button>
                              );
                            })()}
                          </td>

                          {/* Créé le */}
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid #F1F5F9', whiteSpace: 'nowrap', color: '#64748B', fontSize: 12 }}>
                            {fmtDateTab(c.created_at)}
                          </td>

                          {/* Mis à jour — « — » plutôt que la date de création répétée : la
                              colonne ne sert qu'à repérer ce qui a bougé depuis le dépôt. */}
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid #F1F5F9', whiteSpace: 'nowrap', fontSize: 12 }}>
                            {!c.updated_at || c.updated_at === c.created_at
                              ? <span style={{ color: '#CBD5E1' }} title="Jamais retouché depuis sa création">—</span>
                              : <span style={{ color: '#64748B' }}>{fmtDateTab(c.updated_at)}</span>}
                          </td>

                          {/* Statut */}
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid #F1F5F9', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: publie ? '#DCFCE7' : '#FEF3C7', color: publie ? '#15803D' : '#B45309' }}>
                              {publie ? '✅ Publié' : '📝 Brouillon'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid #F1F5F9', whiteSpace: 'nowrap' }}>
                            {/* Le compteur de la colonne « Lu par » ouvre le même écran,
                                mais rien ne signalait qu'il était cliquable. */}
                            {publie && (
                              <button onClick={() => ouvrirLecteurs(c)} title="Voir qui a lu, et qui n'a pas encore ouvert"
                                style={{ marginRight: 6, padding: '5px 11px', borderRadius: 7, border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#15803D', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                👀 Lectures
                              </button>
                            )}
                            {c._lectureSeule ? (
                              <span style={{ fontSize: 11, color: COULEURS.gris400 }}>-</span>
                            ) : (
                              <>
                                <button onClick={() => basculerSequentielMedia(c)}
                                  title={c.lecture_sequentielle
                                    ? 'Lecture obligatoire - cliquez pour repasser en lecture libre'
                                    : "Rendre la lecture obligatoire : les cours publiés après celui-ci resteront fermés tant qu'il n'est pas terminé"}
                                  style={{ marginRight: 6, padding: '5px 11px', borderRadius: 7,
                                    border: `1px solid ${c.lecture_sequentielle ? '#F59E0B' : COULEURS.gris200}`,
                                    background: c.lecture_sequentielle ? '#FFFBEB' : COULEURS.blanc,
                                    color: c.lecture_sequentielle ? '#B45309' : '#9CA3AF',
                                    fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  {c.lecture_sequentielle ? '🔒 Obligatoire' : '🔓 Libre'}
                                </button>
                                <button title="Modifier le contenu et ses parties"
                                  onClick={() => ouvrirEditionContenu(c)}
                                  style={{ marginRight: 6, padding: '5px 11px', borderRadius: 7, border: `1px solid ${couleurTheme}55`, background: COULEURS.blanc, color: couleurTheme, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  ✏️ Modifier
                                </button>
                                <button onClick={() => basculerPublicationMedia(c)} disabled={actionMedia === c.id}
                                  title={publie ? 'Repasser en brouillon' : 'Publier vers la classe'}
                                  style={{ marginRight: 6, padding: '5px 11px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, background: COULEURS.blanc, fontSize: 11.5, fontWeight: 700, cursor: actionMedia === c.id ? 'wait' : 'pointer', color: '#374151', fontFamily: 'inherit' }}>
                                  {actionMedia === c.id ? '⏳' : publie ? 'Dépublier' : 'Publier'}
                                </button>
                                <button onClick={() => supprimerContenuMedia(c)} disabled={actionMedia === c.id}
                                  title="Supprimer ce contenu"
                                  style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #FECACA', background: COULEURS.blanc, color: '#B91C1C', fontSize: 11.5, fontWeight: 700, cursor: actionMedia === c.id ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                                  🗑
                                </button>
                              </>
                            )}
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            )}
            {/* ── Pagination ── */}
            {nbPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 20, borderTop: `1px solid ${COULEURS.gris200}` }}>
                {/* Précédent */}
                <button
                  onClick={() => setPageMedia(p => Math.max(1, p - 1))}
                  disabled={pageCourante === 1}
                  style={{ padding: '7px 14px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: pageCourante === 1 ? COULEURS.gris200 : COULEURS.gris600, fontWeight: 600, fontSize: 13, cursor: pageCourante === 1 ? 'not-allowed' : 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                >
                  ← Précédent
                </button>

                {/* Numéros de pages */}
                {Array.from({ length: nbPages }, (_, i) => i + 1).map(n => {
                  const afficher = n === 1 || n === nbPages || Math.abs(n - pageCourante) <= 1;
                  const ellipsis  = !afficher && (n === pageCourante - 2 || n === pageCourante + 2);
                  if (ellipsis) return <span key={n} style={{ color: COULEURS.gris400, fontSize: 13 }}>…</span>;
                  if (!afficher) return null;
                  return (
                    <button
                      key={n}
                      onClick={() => setPageMedia(n)}
                      style={{ width: 36, height: 36, borderRadius: 8, border: `1.5px solid ${n === pageCourante ? couleurTheme : COULEURS.gris200}`, background: n === pageCourante ? couleurTheme : COULEURS.blanc, color: n === pageCourante ? '#fff' : COULEURS.gris600, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                    >
                      {n}
                    </button>
                  );
                })}

                {/* Suivant */}
                <button
                  onClick={() => setPageMedia(p => Math.min(nbPages, p + 1))}
                  disabled={pageCourante === nbPages}
                  style={{ padding: '7px 14px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: pageCourante === nbPages ? COULEURS.gris200 : COULEURS.gris600, fontWeight: 600, fontSize: 13, cursor: pageCourante === nbPages ? 'not-allowed' : 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                >
                  Suivant →
                </button>

                {/* Info page */}
                <span style={{ fontSize: 11, color: COULEURS.gris400, marginLeft: 8 }}>
                  Page {pageCourante} / {nbPages} · {contenusFiltres.length} contenu{contenusFiltres.length > 1 ? 's' : ''}
                </span>
              </div>
            )}

            {/* ── QUI A LU ──
                Les DEUX listes comptent. Savoir que « 4 ont lu » n'aide pas à relancer ;
                savoir QUI n'a pas ouvert, si. */}
            {lecteursModal && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 9700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                onClick={e => { if (e.target === e.currentTarget) setLecteursModal(null); }}>
                <div style={{ background: COULEURS.blanc, borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '85vh', overflowY: 'auto', padding: 24, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: COULEURS.navy }}>👀 Lectures</h3>
                  <p style={{ margin: '0 0 18px', fontSize: 12.5, color: COULEURS.gris600 }}>{lecteursModal.contenu.titre}</p>

                  {lecteursModal.loading ? (
                    <div style={{ textAlign: 'center', padding: 32, color: '#94A3B8' }}>⏳ Chargement…</div>
                  ) : (() => {
                    const d = lecteursModal.data || { lecteurs: [], en_attente: [], lus: 0, total: 0 };
                    const pct = d.total ? Math.round((d.lus / d.total) * 100) : 0;
                    return (
                      <>
                        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                          <div style={{ fontSize: 20, fontWeight: 900, color: COULEURS.navy }}>{d.lus} / {d.total}</div>
                          <div style={{ fontSize: 12, color: '#64748B', marginBottom: 7 }}>apprenants ont marqué ce contenu comme terminé</div>
                          <div style={{ height: 6, borderRadius: 99, background: '#E5E7EB', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: '#15803D' }} />
                          </div>
                          {/* Dire ce que le chiffre mesure vraiment évite de le lire comme un
                              taux d'assiduité : c'est l'apprenant qui clique « terminé ». */}
                          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 7, lineHeight: 1.5 }}>
                            Déclaratif : l'apprenant clique lui-même. Ce n'est pas une mesure du temps passé.
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 14 }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#15803D', marginBottom: 7 }}>✅ ONT TERMINÉ ({d.lecteurs.length})</div>
                            {d.lecteurs.length === 0 ? (
                              <div style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>Personne pour l'instant.</div>
                            ) : d.lecteurs.map((a, i2) => (
                              <div key={i2} style={{ padding: '7px 10px', borderRadius: 8, background: '#F0FDF4', marginBottom: 5 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: COULEURS.navy }}>{a.nom_complet || a.email}</div>
                                {/* La classe, parce qu'un contenu diffusé à plusieurs d'entre
                                    elles rend « Awa a lu » insuffisant pour savoir où en est
                                    chaque groupe. */}
                                <div style={{ fontSize: 10.5, color: '#64748B' }}>
                                  {[a.classe, a.lu_le ? new Date(a.lu_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '']
                                    .filter(Boolean).join(' · ')}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#B45309', marginBottom: 7 }}>⏳ PAS ENCORE OUVERT ({d.en_attente.length})</div>
                            {d.en_attente.length === 0 ? (
                              <div style={{ fontSize: 12, color: '#15803D', fontWeight: 700 }}>Tout le monde a terminé 🎉</div>
                            ) : d.en_attente.map((a, i2) => (
                              <div key={i2} style={{ padding: '7px 10px', borderRadius: 8, background: '#FFFBEB', marginBottom: 5 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: COULEURS.navy }}>{a.nom_complet || a.email}</div>
                                {/* Un apprenant sans compte ne PEUT pas avoir lu : le ranger
                                    simplement parmi les retardataires ferait relancer
                                    quelqu'un à qui il manque un accès, pas de la volonté. */}
                                {a.sans_compte
                                  ? <div style={{ fontSize: 10.5, color: '#B45309', fontWeight: 700 }}>{a.classe ? `${a.classe} · ` : ''}Compte non ouvert - accès à créer</div>
                                  : <div style={{ fontSize: 10.5, color: '#64748B' }}>{[a.classe, a.email].filter(Boolean).join(' · ')}</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  <button onClick={() => setLecteursModal(null)}
                    style={{ width: '100%', marginTop: 18, padding: '10px 0', borderRadius: 8, border: '1.5px solid #E2E8F0', background: COULEURS.blanc, color: '#374151', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Fermer
                  </button>
                </div>
              </div>
            )}

          </div>
          );
        })()}

        {/* ══════════ SESSION LIVE ══════════ */}
        {section === 'session_live' && (
          <div>
            {/* ══ VUE SALLE OUVERTE ══ */}
            {salleOuverte ? (() => {
              const session = mesSessions.find(s => s.id === salleOuverte);
              if (!session) return null;
              const groupe  = mesGroupes.find(g => g.id === session.groupe_id);
              const appDuGroupe = (apprenantsByClasse[session.groupe_id] || []).map(a => {
                const p = (a.nom_complet || '').split(' ');
                return { id: a.id, prenom: p.slice(0, -1).join(' ') || a.nom_complet, nom: p[p.length - 1] || '', niveau_cecr: a.niveau_cecr, tranche_age: a.tranche_age, avatar_url: a.avatar_url || null };
              });
              const nbPresents = Object.values(presencesLive).filter(v => v === 'present').length;
              const nbNonRenseignes = appDuGroupe.filter(a => !presencesLive[a.id] || presencesLive[a.id] === 'non_renseigne').length;
              const presencesComplete = appDuGroupe.length === 0 || nbNonRenseignes === 0;

              return (
                <div>
                  {/* Header live */}
                  <div style={{ background:'linear-gradient(135deg,#0F172A,#0E4F6B)', borderRadius:16, padding:'20px 24px', marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16 }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                        <span style={{ width:10, height:10, borderRadius:'50%', background:'#EF4444', display:'inline-block', boxShadow:'0 0 8px #EF4444' }} />
                        <span style={{ fontSize:11, fontWeight:800, color:'#FCA5A5', textTransform:'uppercase', letterSpacing:'0.08em' }}>En direct</span>
                        <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>· {groupe?.nom}</span>
                      </div>
                      <div style={{ fontSize:20, fontWeight:800, color:'#fff', marginBottom:4 }}>{session.titre}</div>
                      <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)' }}>📅 {fmtDate(session.date_session)} · ⏰ {session.heure_debut} – {session.heure_fin}</div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                      <div style={{ fontSize:36, fontWeight:900, color:'#FCD34D', fontFamily:'monospace', letterSpacing:2 }}>{fmtChrono(chronoSec)}</div>
                      <button
                        disabled={!presencesComplete}
                        onClick={() => setConfirmGeneral({
                          titre: 'Clôturer la session ?',
                          message: 'Les présences seront sauvegardées et la session marquée comme réalisée.',
                          icone: '⏹',
                          couleur: '#EF4444',
                          boutonLabel: '⏹ Clôturer la session',
                          onConfirm: () => cloturerSalle(session),
                        })}
                        title={!presencesComplete ? `Renseignez d'abord les présences (${nbNonRenseignes} manquante${nbNonRenseignes > 1 ? 's' : ''})` : 'Clôturer la session'}
                        style={{ background: presencesComplete ? '#EF4444' : '#9ca3af', color:'#fff', border:'none', borderRadius:8, padding:'8px 18px', fontSize:12, fontWeight:700, cursor: presencesComplete ? 'pointer' : 'not-allowed', opacity: presencesComplete ? 1 : 0.7, transition:'all 0.2s', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                        ⏹ Clôturer la session
                      </button>
                      {!presencesComplete && (
                        <span style={{ fontSize:10, color:'#FCA5A5', fontWeight:600, textAlign:'center' }}>
                          ⚠️ {nbNonRenseignes} présence{nbNonRenseignes > 1 ? 's' : ''} manquante{nbNonRenseignes > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ── Salle virtuelle ── */}
                  {session.lien_visio ? (
                    <div style={{ marginBottom:20, background:'#F0FDF4', border:'1.5px solid #6EE7B7', borderRadius:14, padding:'24px', display:'flex', flexDirection:'column', alignItems:'center', gap:14, textAlign:'center' }}>
                      <div style={{ fontSize:36 }}>🎥</div>
                      <div style={{ fontSize:15, fontWeight:800, color:'#065F46' }}>Session démarrée dans une fenêtre flottante</div>
                      <div style={{ fontSize:12, color:'#047857' }}>
                        {session.lien_visio.includes('meet.google') ? 'Google Meet' : session.lien_visio.includes('zoom') ? 'Zoom' : session.lien_visio.includes('teams') ? 'Microsoft Teams' : 'Votre salle virtuelle'} est ouvert dans une fenêtre séparée.
                      </div>
                      <button onClick={() => { const w=Math.min(1280,window.screen.width-40),h=Math.min(800,window.screen.height-80),l=Math.round((window.screen.width-w)/2),t=Math.round((window.screen.height-h)/2); window.open(session.lien_visio,'bet_session_live',`width=${w},height=${h},left=${l},top=${t},resizable=yes`); }}
                        style={{ padding:'10px 28px', borderRadius:10, background:'#059669', color:'#fff', fontWeight:800, fontSize:14, border:'none', cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                        ↗ Rouvrir la salle
                      </button>
                    </div>
                  ) : (
                    /* Jitsi → bouton pour rouvrir le modal vidéo */
                    <div style={{ marginBottom:20, background: modalVideoOuvert ? 'transparent' : 'linear-gradient(135deg,#EFF6FF,#DBEAFE)', border:`1.5px solid ${modalVideoOuvert ? 'transparent' : '#BFDBFE'}`, borderRadius:14, padding: modalVideoOuvert ? 0 : '20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12, textAlign:'center' }}>
                      {!modalVideoOuvert && (
                        <>
                          <div style={{ fontSize:28 }}>🎥</div>
                          <div style={{ fontSize:14, fontWeight:700, color:'#1D4ED8' }}>Vidéo masquée</div>
                          <div style={{ fontSize:12, color:'#3B82F6' }}>La session Jitsi tourne toujours en arrière-plan.</div>
                          <button onClick={() => setModalVideoOuvert(true)}
                            style={{ padding:'10px 28px', borderRadius:10, background:'#2563EB', color:'#fff', fontWeight:800, fontSize:14, border:'none', cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                            📺 Afficher la vidéo
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Bandeau info + stats live */}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'#F0FDF4', border:'1px solid #6EE7B7', borderRadius:10, padding:'10px 16px', marginBottom:16, flexWrap:'wrap', gap:10 }}>
                    <div style={{ fontSize:12, color:'#065F46', display:'flex', alignItems:'center', gap:6 }}>
                      <span>💡</span>
                      <span><strong>Contrôles vidéo</strong> disponibles {session.lien_visio ? 'dans la salle ouverte dans votre navigateur.' : 'dans la barre de l\'iFrame Jitsi ci-dessus.'}</span>
                    </div>
                    <div style={{ display:'flex', gap:14, alignItems:'center', flexShrink:0 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>👥 {nbPresents}/{appDuGroupe.length} présents</span>
                      {mainLevees.length > 0 && (
                        <span style={{ fontSize:13, fontWeight:700, color:'#F97316', background:'#FFF7ED', padding:'3px 10px', borderRadius:10 }}>
                          ✋ {mainLevees.length} main{mainLevees.length>1?'s':''} levée{mainLevees.length>1?'s':''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Corps : présences + chat */}
                  <div style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:20 }}>

                    {/* Saisie présences live */}
                    <div style={{ background:'#fff', borderRadius:14, border:`1px solid ${COULEURS.gris200}`, overflow:'hidden' }}>
                      <div style={{ background:COULEURS.gris50, padding:'10px 18px', borderBottom:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
                        <span style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>👥 Participants & Présences</span>
                        <button
                          onClick={() => {
                            const nbNonSaisie = appDuGroupe.filter(a => !presencesLive[a.id] || presencesLive[a.id] === 'non_renseigne').length;
                            const executerValidation = () => {
                              const filled = { ...presencesLive };
                              appDuGroupe.forEach(a => { if (!filled[a.id] || filled[a.id] === 'non_renseigne') filled[a.id] = 'absent'; });
                              setPresencesLive(filled);
                              const nouvPresences = { ...presences };
                              appDuGroupe.forEach(a => { nouvPresences[`${session.id}__${a.id}`] = filled[a.id]; });
                              setPresences(nouvPresences);
                              setChatLive(prev => [...prev, {
                                id: Date.now(), auteur:'🤖 Système', systeme:true,
                                texte:`✅ Présences validées - ${appDuGroupe.filter(a=>filled[a.id]==='present').length} présents, ${appDuGroupe.filter(a=>filled[a.id]==='retard').length} en retard, ${appDuGroupe.filter(a=>filled[a.id]==='absent').length} absents.`,
                                ts: new Date().toISOString(),
                              }]);
                            };
                            if (nbNonSaisie > 0) {
                              setConfirmGeneral({
                                titre: 'Valider les présences ?',
                                message: `${nbNonSaisie} apprenant${nbNonSaisie > 1 ? 's' : ''} sans statut ${nbNonSaisie > 1 ? 'seront' : 'sera'} automatiquement marqué${nbNonSaisie > 1 ? 's' : ''} "Absent".`,
                                icone: '👥',
                                couleur: '#D97706',
                                boutonLabel: '✅ Valider les présences',
                                onConfirm: executerValidation,
                              });
                            } else {
                              executerValidation();
                            }
                          }}
                          style={{ padding:'6px 14px', borderRadius:8, border:'none', background:COULEURS.succes, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6, flexShrink:0 }}
                        >
                          ✅ Valider les présences
                        </button>
                      </div>
                      {appDuGroupe.map(a => {
                        const statut = presencesLive[a.id] || 'non_renseigne';
                        const mainLevee = mainLevees.includes(a.id);
                        return (
                          <div key={a.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 18px', borderBottom:`1px solid ${COULEURS.gris100}`, background:statut==='present'?'#F0FDF4':statut==='absent'?'#FEF2F2':statut==='retard'?'#FFFBEB':'#fff' }}>
                            <div style={{ width:32, height:32, borderRadius:'50%', overflow:'hidden', background:couleurTheme+'20', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:12, color:couleurTheme, flexShrink:0 }}>
                              {a.avatar_url ? (
                                <img src={a.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => { e.target.style.display='none'; }} />
                              ) : <>{a.prenom[0]}{a.nom[0]}</>}
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:13, fontWeight:600, color:COULEURS.navy, display:'flex', alignItems:'center', gap:6 }}>
                                {a.prenom} {a.nom}
                                {mainLevee && <span style={{ fontSize:14 }}>✋</span>}
                              </div>
                              <div style={{ fontSize:10, color:COULEURS.gris400 }}>{a.niveau_cecr} · {a.tranche_age}</div>
                            </div>
                            <div style={{ display:'flex', gap:4 }}>
                              {[['present','P','#059669','#D1FAE5'],['retard','R','#D97706','#FEF3C7'],['absent','A','#DC2626','#FEE2E2']].map(([val,lib,txt,bg]) => (
                                <button key={val} onClick={() => setPresencesLive(prev=>({...prev,[a.id]:val}))}
                                  style={{ width:28, height:28, borderRadius:6, border:`1.5px solid ${statut===val?txt:COULEURS.gris200}`, background:statut===val?bg:'#fff', color:statut===val?txt:COULEURS.gris400, fontSize:11, fontWeight:800, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                                  {lib}
                                </button>
                              ))}
                              <button onClick={() => setMainLevees(prev => prev.includes(a.id) ? prev.filter(x=>x!==a.id) : [...prev,a.id])}
                                title="Main levée"
                                style={{ width:28, height:28, borderRadius:6, border:`1.5px solid ${mainLevee?'#F97316':COULEURS.gris200}`, background:mainLevee?'#FFF7ED':'#fff', color:mainLevee?'#F97316':COULEURS.gris400, fontSize:13, cursor:'pointer' }}>
                                ✋
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {/* Résumé */}
                      <div style={{ padding:'10px 18px', background:COULEURS.gris50, display:'flex', gap:16, fontSize:12 }}>
                        {[['✅ Présents',Object.values(presencesLive).filter(v=>v==='present').length,'#059669'],['⏱ Retard',Object.values(presencesLive).filter(v=>v==='retard').length,'#D97706'],['❌ Absents',Object.values(presencesLive).filter(v=>v==='absent').length,'#DC2626']].map(([lib,n,c])=>(
                          <span key={lib} style={{ fontWeight:700, color:c }}>{lib} : {n}</span>
                        ))}
                      </div>
                    </div>

                    {/* Chat live */}
                    <div style={{ background:'#fff', borderRadius:14, border:`1px solid ${COULEURS.gris200}`, overflow:'hidden', display:'flex', flexDirection:'column' }}>
                      <div style={{ background:COULEURS.gris50, padding:'12px 18px', fontSize:13, fontWeight:700, color:COULEURS.navy, borderBottom:`1px solid ${COULEURS.gris200}` }}>
                        💬 Chat de classe
                      </div>
                      <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:8, minHeight:250, maxHeight:350 }}>
                        {chatLive.map(msg => (
                          <div key={msg.id} style={{ fontSize:12, padding:'6px 10px', borderRadius:8, background:msg.systeme?'#EFF6FF':COULEURS.gris50, borderLeft:`3px solid ${msg.systeme?couleurTheme:COULEURS.gris200}` }}>
                            <span style={{ fontWeight:700, color:msg.systeme?couleurTheme:COULEURS.navy }}>{msg.auteur} </span>
                            <span style={{ color:COULEURS.gris600 }}>{msg.texte}</span>
                          </div>
                        ))}
                        {chatLive.length === 0 && <div style={{ color:COULEURS.gris400, fontSize:12, textAlign:'center', marginTop:20 }}>Aucun message pour le moment…</div>}
                      </div>
                      <div style={{ padding:'10px 14px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', gap:8 }}>
                        <input value={chatInput} onChange={e=>setChatInput(e.target.value)}
                          onKeyDown={e=>e.key==='Enter'&&envoyerMessage()}
                          placeholder="Écrire un message…"
                          style={{ flex:1, padding:'8px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none' }} />
                        <button onClick={envoyerMessage} style={{ background:couleurTheme, color:'#fff', border:'none', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                          Envoyer
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })() : (
            /* ══ VUE LISTE SESSIONS ══ */
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div style={S.titreSec}>🎥 Session live</div>
                {delegationActive ? (
                  <span style={{ fontSize:11, fontWeight:700, color:'#92400E', background:'#FEF3C7', padding:'5px 12px', borderRadius:8, border:'1px solid #FCD34D' }}>
                    🔒 Mode remplaçant - programmation désactivée
                  </span>
                ) : (
                  <button style={S.btn(couleurTheme)} onClick={() => { setFormNouvelleSession(FORM_SESSION_VIDE); setModeMultiple(false); setSessionsMultiples([{ ...SESSION_LIGNE_VIDE }]); setCommonFields({ groupe_id: '', heure_debut: '', heure_fin: '', lien_visio: '', type_session: 'ligne', contenu_ids: [] }); setModalNouvelleSession(true); }}>
                    + Programmer une session
                  </button>
                )}
              </div>

              {/* Déroulement type */}
              <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:12, padding:'14px 18px', marginBottom:20, fontSize:12, color:'#1E40AF' }}>
                <div style={{ fontWeight:700, marginBottom:8 }}>📋 Déroulement type d'une session :</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {['J-1 : Rappel auto 🔔','H-15min : Salle accessible 🔓','Prof ouvre la salle 🎥','Apprenants rejoignent 👥','Cours + chat + main levée 📚','Saisie présences ✅','Clôture & Replay ⏹'].map((e,i) => (
                    <span key={i} style={{ background:'#DBEAFE', borderRadius:20, padding:'3px 10px', fontWeight:600 }}>{e}</span>
                  ))}
                </div>
              </div>

              {/* Sessions planifiées */}
              <div style={S.titreSec}>📅 Sessions à venir</div>
              {mesSessions.filter(s => s.statut === 'planifiee' && !sessionsClôturees.has(s.id)).length === 0 ? (
                <div style={S.vide}>Aucune session planifiée</div>
              ) : mesSessions.filter(s => s.statut === 'planifiee' && !sessionsClôturees.has(s.id)).map(s => {
                const groupe       = mesGroupes.find(g => g.id === s.groupe_id);
                const debutISO     = `${s.date_session}T${s.heure_debut}:00`;
                const debut        = new Date(debutISO);
                const debutMoins15 = new Date(debut.getTime() - MS_OUVERTURE_SALLE);
                const maintenant   = new Date();
                const disponible   = MODE_DEV || maintenant >= debutMoins15;
                const minutesAvant = disponible ? 0 : Math.round((debutMoins15 - maintenant) / 60000);
                const contenusSess = mesContenus.filter(c => (s.contenu_ids || []).includes(c.id));
                const deplie       = sessionsDepliees.has(s.id);
                const CT           = { lecon:{ bg:'#E0F2FE', txt:'#0E7490', ic:'📖' }, exercice:{ bg:'#D1FAE5', txt:'#065F46', ic:'✏️' }, devoir:{ bg:'#FEF3C7', txt:'#92400E', ic:'📝' }, audio:{ bg:'#EDE9FE', txt:'#5B21B6', ic:'🎵' } };

                return (
                  <div key={s.id} style={{ background:disponible?'#F0FDF4':'#fff', borderRadius:14, border:`1.5px solid ${disponible?'#6EE7B7':COULEURS.gris200}`, marginBottom:12, overflow:'hidden' }}>

                    {/* Ligne principale */}
                    <div style={{ padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, flexWrap:'wrap' }}>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                          <span style={{ fontSize:15, fontWeight:700, color:COULEURS.navy }}>{s.titre}</span>
                          {s.type_session === 'presentiel'
                            ? <span style={{ padding:'2px 8px', borderRadius:10, background:'#D1FAE5', color:'#065F46', fontSize:10, fontWeight:800 }}>🏢 Présentiel</span>
                            : <span style={{ padding:'2px 8px', borderRadius:10, background:'#DBEAFE', color:'#1D4ED8', fontSize:10, fontWeight:800 }}>📡 En ligne</span>}
                          {s._delegation && <span style={{ padding:'2px 8px', borderRadius:10, background:'#EDE9FE', color:'#6D28D9', fontSize:10, fontWeight:800 }}>🔄 Délégation</span>}
                          {s.type_session !== 'presentiel' && disponible && <span style={{ padding:'2px 8px', borderRadius:10, background:'#D1FAE5', color:'#065F46', fontSize:10, fontWeight:800 }}>✅ Salle disponible</span>}
                        </div>
                        <div style={{ fontSize:12, color:COULEURS.gris600, display:'flex', gap:14, flexWrap:'wrap' }}>
                          <span>📅 {fmtDate(s.date_session)}</span>
                          <span>⏰ {s.heure_debut} – {s.heure_fin}</span>
                          <span>👥 {groupe?.nom}</span>
                          {contenusSess.length > 0
                            ? <span style={{ color:couleurTheme, fontWeight:600 }}>📚 {contenusSess.length} cours lié{contenusSess.length > 1 ? 's' : ''}</span>
                            : <span style={{ color:COULEURS.gris300, fontStyle:'italic' }}>Aucun cours lié</span>}
                        </div>
                        {!disponible && (
                          <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:4 }}>
                            🔒 Salle disponible J-1 et H-15min avant le cours
                            {minutesAvant < 1440 && <span> ({minutesAvant < 60 ? `dans ${minutesAvant} min` : `dans ${Math.floor(minutesAvant/60)}h`})</span>}
                          </div>
                        )}
                      </div>
                      <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                        {contenusSess.length > 0 && (
                          <button
                            onClick={() => setSessionsDepliees(prev => { const n = new Set(prev); deplie ? n.delete(s.id) : n.add(s.id); return n; })}
                            style={{ padding:'7px 13px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:deplie?COULEURS.gris100:COULEURS.blanc, color:COULEURS.navy, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                          >
                            {deplie ? '▲ Masquer' : '▼ Voir le cours'}
                          </button>
                        )}
                        {s._real && (
                          <button
                            onClick={() => {
                              setEditingSessionId(s.id);
                              setFormNouvelleSession({
                                titre: s.titre || '', groupe_id: s.groupe_id || '',
                                date_session: s.date_session || '', heure_debut: s.heure_debut || '',
                                heure_fin: s.heure_fin || '', lien_visio: s.lien_visio || '',
                                type_session: s.type_session || 'ligne', notes_prof: s.notes_prof || '',
                                contenu_ids: s.contenu_ids || [],
                              });
                              setModeMultiple(false);
                              setModalNouvelleSession(true);
                            }}
                            style={{ padding:'9px 16px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontWeight:700, cursor:'pointer', background:COULEURS.blanc, color:COULEURS.navy, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                            ✏️ Modifier
                          </button>
                        )}
                        {s.type_session === 'presentiel' ? (
                          <button
                            onClick={() => { setPresentielModal(s); setPresencesPresentiel({}); }}
                            style={{ padding:'9px 20px', borderRadius:8, border:'none', fontSize:13, fontWeight:700, cursor:'pointer', background:'#059669', color:'#fff', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                            🏢 Démarrer le cours
                          </button>
                        ) : (
                          <button
                            disabled={!disponible}
                            onClick={() => disponible && ouvrirSalle(s)}
                            style={{ padding:'9px 20px', borderRadius:8, border:'none', fontSize:13, fontWeight:700, cursor:disponible?'pointer':'not-allowed', background:disponible?COULEURS.succes:COULEURS.gris200, color:disponible?'#fff':COULEURS.gris400, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                            {disponible ? '🎥 Ouvrir la salle' : '🔒 Pas encore disponible'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Contenus dépliés */}
                    {deplie && contenusSess.length > 0 && (
                      <div style={{ borderTop:`1px solid ${disponible?'#6EE7B730':COULEURS.gris100}`, padding:'12px 20px', background:'rgba(255,255,255,0.6)', display:'flex', flexDirection:'column', gap:8 }}>
                        {contenusSess.map(c => {
                          const ct = CT[c.type_contenu] || { bg:COULEURS.gris100, txt:COULEURS.gris600, ic:'📄' };
                          const blocs = c.blocs || [];
                          const dureeTotal = blocs.reduce((acc, b) => acc + (b.dureeMin || 0), 0);
                          return (
                            <div key={c.id} style={{ background:COULEURS.blanc, borderRadius:10, border:`1px solid ${COULEURS.gris200}`, padding:'10px 14px' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                                <span style={{ padding:'2px 9px', borderRadius:20, background:ct.bg, color:ct.txt, fontSize:11, fontWeight:700 }}>{ct.ic} {c.type_contenu}</span>
                                {!c.est_visible && <span style={{ padding:'2px 8px', borderRadius:10, background:'#FEF3C7', color:'#D97706', fontSize:10, fontWeight:700 }}>📝 Brouillon</span>}
                                <span style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, flex:1 }}>{c.titre}</span>
                                {dureeTotal > 0 && <span style={{ fontSize:11, color:COULEURS.gris400 }}>⏱ {dureeTotal} min</span>}
                              </div>
                              {c.description && (
                                <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:5, lineHeight:1.5 }}>{c.description}</div>
                              )}
                              {blocs.length > 0 && (
                                <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
                                  {blocs.map(b => (
                                    <span key={b.id} style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:COULEURS.gris100, color:COULEURS.gris600 }}>
                                      {{ texte:'📝', video:'🎬', audio:'🎧', document:'📄', lien:'🔗', exercice:'✏️', quiz:'🧩' }[b.type] || '📄'} {b.titre}
                                    </span>
                                  ))}
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

              {/* Sessions réalisées & replays */}
              <div style={{ ...S.titreSec, marginTop:24 }}>▶️ Sessions terminées & Replays</div>
              {(() => {
                const sessionsTerminees = mesSessions
                  .filter(s => s.statut === 'realisee' || sessionsClôturees.has(s.id))
                  .filter(s => !replaysDateDebut || (s.date_session || '') >= replaysDateDebut)
                  .filter(s => !replaysDateFin   || (s.date_session || '') <= replaysDateFin)
                  .sort((a, b) => (b.date_session || '').localeCompare(a.date_session || ''));
                const totalPagesReplays = Math.max(1, Math.ceil(sessionsTerminees.length / REPLAYS_PAR_PAGE));
                const pageReplaysSafe   = Math.min(replaysPage, totalPagesReplays);
                const sessionsPage      = sessionsTerminees.slice((pageReplaysSafe-1)*REPLAYS_PAR_PAGE, pageReplaysSafe*REPLAYS_PAR_PAGE);

                return (
                  <>
                    {/* Filtre date */}
                    <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:14 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:11, color:COULEURS.gris600, fontWeight:600 }}>Du</span>
                        <input type="date" value={replaysDateDebut}
                          onChange={e => { setReplaysDateDebut(e.target.value); setReplaysPage(1); }}
                          style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans", sans-serif' }} />
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:11, color:COULEURS.gris600, fontWeight:600 }}>Au</span>
                        <input type="date" value={replaysDateFin}
                          onChange={e => { setReplaysDateFin(e.target.value); setReplaysPage(1); }}
                          style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans", sans-serif' }} />
                      </div>
                      {(replaysDateDebut || replaysDateFin) && (
                        <button onClick={() => { setReplaysDateDebut(''); setReplaysDateFin(''); setReplaysPage(1); }}
                          style={{ padding:'6px 12px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                          ✕ Réinitialiser
                        </button>
                      )}
                    </div>

                    {sessionsTerminees.length === 0 ? (
                      <div style={S.vide}>Aucune session réalisée{(replaysDateDebut || replaysDateFin) ? ' sur cette période' : ''}</div>
                    ) : sessionsPage.map(s => {
                      const groupe = mesGroupes.find(g => g.id === s.groupe_id);
                      const estRecente = sessionsClôturees.has(s.id);
                      const nbApps = (apprenantsByClasse[s.groupe_id] || []).length;
                      return (
                        <div key={s.id} style={{ background:'#fff', borderRadius:14, border:`1px solid ${COULEURS.gris200}`, padding:'14px 20px', marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:3, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                              {s.titre}
                              <span style={{ padding:'2px 8px', borderRadius:10, background:'#F0FDF4', color:'#166534', fontSize:10, fontWeight:800 }}>✅ Terminée</span>
                              {estRecente && <span style={{ padding:'2px 8px', borderRadius:10, background:'#DBEAFE', color:'#1D4ED8', fontSize:10, fontWeight:800 }}>🆕 Récente</span>}
                            </div>
                            <div style={{ fontSize:12, color:COULEURS.gris400 }}>
                              {fmtDate(s.date_session)} · {groupe?.nom}
                              {s.heure_debut && ` · ${s.heure_debut}${s.heure_fin ? ` – ${s.heure_fin}` : ''}`}
                              {nbApps > 0 && ` · ${nbApps} apprenant${nbApps > 1 ? 's' : ''}`}
                            </div>
                            {s.notes_prof && <div style={{ fontSize:11, color:COULEURS.gris600, marginTop:4, fontStyle:'italic' }}>📝 {s.notes_prof}</div>}
                          </div>
                          <button
                            style={S.btn(COULEURS.succes)}
                            onClick={() => setModalPresenceSession(s.id)}
                          >✅ Voir les présences</button>
                        </div>
                      );
                    })}

                    {totalPagesReplays > 1 && (
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:12 }}>
                        <span style={{ fontSize:12, color:COULEURS.gris600 }}>
                          {(pageReplaysSafe-1)*REPLAYS_PAR_PAGE+1}–{Math.min(pageReplaysSafe*REPLAYS_PAR_PAGE, sessionsTerminees.length)} sur {sessionsTerminees.length}
                        </span>
                        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                          <button onClick={() => setReplaysPage(p => Math.max(1, p-1))} disabled={pageReplaysSafe===1}
                            style={{ padding:'5px 9px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, fontSize:12, cursor:pageReplaysSafe===1?'not-allowed':'pointer', color:pageReplaysSafe===1?COULEURS.gris300:COULEURS.gris600 }}>‹</button>
                          {Array.from({ length: totalPagesReplays }, (_, i) => i+1).filter(p => Math.abs(p-pageReplaysSafe) <= 2).map(p => (
                            <button key={p} onClick={() => setReplaysPage(p)}
                              style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${p===pageReplaysSafe?COULEURS.succes:COULEURS.gris200}`, background:p===pageReplaysSafe?COULEURS.succes:COULEURS.blanc, fontSize:12, fontWeight:600, cursor:'pointer', color:p===pageReplaysSafe?'#fff':COULEURS.gris600 }}>{p}</button>
                          ))}
                          <button onClick={() => setReplaysPage(p => Math.min(totalPagesReplays, p+1))} disabled={pageReplaysSafe===totalPagesReplays}
                            style={{ padding:'5px 9px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, fontSize:12, cursor:pageReplaysSafe===totalPagesReplays?'not-allowed':'pointer', color:pageReplaysSafe===totalPagesReplays?COULEURS.gris300:COULEURS.gris600 }}>›</button>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            )}
          </div>
        )}

        {/* ══════════ PRÉSENCES ══════════ */}
        {section === 'presences' && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={S.titreSec}>Statistiques de présence</div>
              <div style={{ fontSize: 13, color: COULEURS.gris500, marginTop: 4 }}>
                Sélectionnez une classe pour voir ses statistiques détaillées.
              </div>
            </div>

            {classesReelles.length === 0 ? (
              <div style={S.vide}>Aucune classe assignée pour le moment.</div>
            ) : (
              <div style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: COULEURS.gris50 }}>
                      {['Classe', 'Apprenants', 'Séances réalisées', 'Taux présence', 'Niveau', ''].map((h, i) => (
                        <th key={i} style={{ padding: '11px 16px', textAlign: i === 0 ? 'left' : 'center', fontSize: 10, fontWeight: 700, color: COULEURS.gris500, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${COULEURS.gris200}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {classesReelles.map((cl, idx) => {
                      const col    = cl.couleur || couleurTheme;
                      const apps   = (apprenantsByClasse[cl.id] || []).filter(a => a.statut !== 'suspendu');
                      const nbApps = apps.length;
                      const seancesCl   = sessionsLocales.filter(s => s.groupe_id === cl.id && s.statut === 'realisee');
                      const avecPresences = seancesCl.filter(s => s.nb_presents != null);
                      const totalP      = avecPresences.reduce((acc, s) => acc + (s.nb_presents || 0), 0);
                      const taux        = avecPresences.length > 0 && nbApps > 0
                        ? Math.round((totalP / (avecPresences.length * nbApps)) * 100) : null;
                      const tauxColor   = taux === null ? COULEURS.gris400 : taux >= 75 ? '#16A34A' : taux >= 50 ? '#D97706' : '#DC2626';
                      return (
                        <tr key={cl.id}
                          onClick={() => setClassePresencesModal(cl)}
                          style={{ cursor: 'pointer', borderBottom: idx < classesReelles.length - 1 ? `1px solid ${COULEURS.gris100}` : 'none', transition: 'background 0.12s' }}
                          onMouseEnter={e => e.currentTarget.style.background = `${col}08`}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '13px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
                              <span style={{ fontWeight: 700, color: COULEURS.navy }}>{cl.nom}</span>
                            </div>
                          </td>
                          <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                            <span style={{ background: `${col}15`, color: col, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>{nbApps}</span>
                          </td>
                          <td style={{ padding: '13px 16px', textAlign: 'center', fontWeight: 600, color: COULEURS.navy }}>{seancesCl.length}</td>
                          <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                            {taux !== null ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                                <div style={{ width: 60, height: 6, background: COULEURS.gris100, borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{ width: `${taux}%`, height: '100%', background: tauxColor, borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 700, color: tauxColor }}>{taux}%</span>
                              </div>
                            ) : <span style={{ color: COULEURS.gris400, fontSize: 12 }}>-</span>}
                          </td>
                          <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                            <span style={{ fontSize: 11, color: COULEURS.gris600, fontWeight: 600 }}>{cl.niveau_cecr || '-'}</span>
                          </td>
                          <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                            <button
                              onClick={e => { e.stopPropagation(); setClassePresencesModal(cl); }}
                              style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${col}`, background: 'transparent', color: col, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                            >📊 Détails</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Modal statistiques présence ── */}
            {classePresencesModal && (() => {
              const cl     = classePresencesModal;
              const col    = cl.couleur || couleurTheme;
              const apps   = (apprenantsByClasse[cl.id] || []).filter(a => a.statut !== 'suspendu');
              return (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                  <div style={{ background: COULEURS.blanc, borderRadius: 18, width: '90vw', height: '90vh', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {/* Header */}
                    <div style={{ background: col, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📚</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{cl.nom}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                          {apps.length} apprenant{apps.length !== 1 ? 's' : ''} actif{apps.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => setClassePresencesModal(null)}
                        style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}
                      >✕</button>
                    </div>
                    {/* Corps */}
                    <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
                      <OngletPresencesClasse
                        classeId={cl.id}
                        couleur={col}
                        nbApprenants={apps.length}
                        nomClasse={cl.nom}
                      />
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ══════════ NOTES, DEVOIRS & RÉCEPTION ══════════ */}
        {section === 'notes_devoirs' && (() => {
          const TABS_ND = [
            { id:'notes',     lib:'Notes & Évaluations',   icone:'🏅' },
            { id:'devoirs',   lib:'Devoirs',                icone:'📝' },
            { id:'reception', lib:'Réception & Correction', icone:'📥', badge: devoirsACorrection.length },
          ];

          // ── Données réception ──
          // Grouper les devoirs par contenu_id (un "devoir" = un sujet assigné à plusieurs apprenants)
          const devoirsParContenu = mesDevoirs.reduce((acc, d) => {
            const key = d.contenu_id;
            if (!acc[key]) acc[key] = [];
            acc[key].push(d);
            return acc;
          }, {});

          // Groupe actif pour la réception (default = 1er groupe)
          const groupeRec = groupeReception ?? mesGroupes[0]?.id ?? null;

          // Devoirs du groupe sélectionné
          const apprenantsDuGroupe = mesApprenants.filter(a => a.groupe_id === groupeRec);
          const devoirsGroupe = mesDevoirs.filter(d => apprenantsDuGroupe.some(a => a.id === d.apprenant_id));
          const contenuIdsGroupe = [...new Set(devoirsGroupe.map(d => d.contenu_id))];

          // KPIs réception
          const totalRendus    = mesDevoirs.filter(d => d.statut === 'rendu' || d.statut === 'corrige').length;
          const aCorrection    = devoirsACorrection.length;
          const corriges       = mesDevoirs.filter(d => d.statut === 'corrige').length;

          function toggleAccordion(cid) {
            setAccordionOuvert(prev => {
              const next = new Set(prev);
              next.has(cid) ? next.delete(cid) : next.add(cid);
              return next;
            });
          }

          const STATUT_D = {
            a_rendre:  { fond:'#FEF9C3', texte:'#92400E', lib:'À rendre',  icone:'⏳' },
            rendu:     { fond:'#D1FAE5', texte:'#065F46', lib:'Rendu',     icone:'✅' },
            corrige:   { fond:'#DBEAFE', texte:'#1D4ED8', lib:'Corrigé',   icone:'🏅' },
            en_retard: { fond:'#FEE2E2', texte:'#991B1B', lib:'En retard', icone:'🔴' },
          };

          return (
            <div>
              {/* ── Barre de sous-onglets ── */}
              <div style={{ display:'flex', gap:0, marginBottom:24, background:COULEURS.blanc, borderRadius:12, border:`1px solid ${COULEURS.gris200}`, overflow:'hidden', boxShadow:'0 2px 6px rgba(0,0,0,0.04)' }}>
                {TABS_ND.map((t, i) => (
                  <button key={t.id} onClick={() => setSousOngletND(t.id)}
                    style={{ flex:1, padding:'13px 16px', border:'none', background: sousOngletND===t.id ? COULEURS.blanc : COULEURS.gris50, borderBottom: sousOngletND===t.id ? `3px solid ${couleurTheme}` : '3px solid transparent', borderRight: i<TABS_ND.length-1 ? `1px solid ${COULEURS.gris200}` : 'none', color: sousOngletND===t.id ? couleurTheme : COULEURS.gris600, fontWeight: sousOngletND===t.id ? 700 : 500, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', justifyContent:'center', gap:7, transition:'all 0.15s' }}>
                    <span>{t.icone}</span>
                    <span>{t.lib}</span>
                    {t.badge > 0 && (
                      <span style={{ background: sousOngletND===t.id ? COULEURS.rouge : '#FEE2E2', color: sousOngletND===t.id ? '#fff' : COULEURS.rouge, borderRadius:20, padding:'1px 7px', fontSize:11, fontWeight:700 }}>{t.badge}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* ══ NOTES ══ */}
              {sousOngletND === 'notes' && (() => {
                // ── Construction liste apprenants filtrée ─────────────────────
                const rechercheLow = notesRecherche.trim().toLowerCase();
                const lignes = classesReelles.flatMap(cl => {
                  if (notesFiltreClasse !== 'toutes' && cl.id !== notesFiltreClasse) return [];
                  const apps    = (apprenantsByClasse[cl.id] || []).filter(a => a.statut !== 'suspendu');
                  const notesCI = notesReelles.filter(n => {
                    if (n.classe_id !== cl.id) return false;
                    if (notesDateDebut && (n.date_evaluation||n.created_at||'') < notesDateDebut) return false;
                    if (notesDateFin   && (n.date_evaluation||n.created_at||'') > notesDateFin)   return false;
                    return true;
                  });
                  return apps
                    .filter(a => {
                      if (rechercheLow && !(a.nom_complet||'').toLowerCase().includes(rechercheLow)) return false;
                      return notesCI.some(n => n.inscription_id === a.id);
                    })
                    .map(a => ({ cl, a, notesA: notesCI.filter(n => n.inscription_id === a.id) }));
                });

                // Une ligne par note/évaluation (plus par apprenant) - cliquable pour ouvrir
                // le détail, même logique que les devoirs rendus dans Réception & Correction.
                const lignesPlates = lignes.flatMap(({ cl, a, notesA }) =>
                  notesA.map(n => ({ cl, a, n }))
                ).sort((x, y) => (y.n.date_evaluation || y.n.created_at || '').localeCompare(x.n.date_evaluation || x.n.created_at || ''));

                const totalPagesN  = Math.max(1, Math.ceil(lignesPlates.length / NOTES_PAR_PAGE));
                const pageNClamp   = Math.min(notesPage, totalPagesN);
                const lignesPage   = lignesPlates.slice((pageNClamp - 1) * NOTES_PAR_PAGE, pageNClamp * NOTES_PAR_PAGE);

                const btnPagN = (actif, dis) => ({
                  padding:'5px 12px', borderRadius:7, border:`1px solid ${actif?couleurTheme:COULEURS.gris200}`,
                  background:actif?couleurTheme:COULEURS.blanc, color:actif?'#fff':COULEURS.gris600,
                  fontSize:12, fontWeight:700, cursor:dis?'not-allowed':'pointer', fontFamily:'inherit', opacity:dis?0.4:1,
                });

                const hasFilter = notesFiltreClasse !== 'toutes' || notesRecherche || notesDateDebut || notesDateFin;

                return (
                  <div>
                    {/* Titre (bouton "+ Saisir une note" retiré temporairement) */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                      <div style={S.titreSec}>Notes & Évaluations</div>
                    </div>

                    {/* Barre de filtres */}
                    <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'14px 18px', marginBottom:16, display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
                      {/* Recherche apprenant */}
                      <div style={{ display:'flex', flexDirection:'column', gap:4, flex:'1 1 180px' }}>
                        <span style={{ fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase' }}>Apprenant</span>
                        <input type="text" placeholder="Rechercher un apprenant…" value={notesRecherche}
                          onChange={e => { setNotesRecherche(e.target.value); setNotesPage(1); }}
                          style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12, color:COULEURS.navy, fontFamily:'inherit', outline:'none' }} />
                      </div>
                      {/* Classe */}
                      {classesReelles.length > 1 && (
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          <span style={{ fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase' }}>Classe</span>
                          <select value={notesFiltreClasse} onChange={e => { setNotesFiltreClasse(e.target.value); setNotesPage(1); }}
                            style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12, color:COULEURS.navy, fontFamily:'inherit', cursor:'pointer' }}>
                            <option value="toutes">Toutes</option>
                            {classesReelles.map(cl => <option key={cl.id} value={cl.id}>{cl.nom}</option>)}
                          </select>
                        </div>
                      )}
                      {/* Date évaluation */}
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase' }}>Date éval. - du</span>
                        <input type="date" value={notesDateDebut} onChange={e => { setNotesDateDebut(e.target.value); setNotesPage(1); }}
                          style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit' }} />
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase' }}>au</span>
                        <input type="date" value={notesDateFin} onChange={e => { setNotesDateFin(e.target.value); setNotesPage(1); }}
                          style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit' }} />
                      </div>
                      {hasFilter && (
                        <button onClick={() => { setNotesFiltreClasse('toutes'); setNotesRecherche(''); setNotesDateDebut(''); setNotesDateFin(''); setNotesPage(1); }}
                          style={{ padding:'6px 12px', borderRadius:7, border:'none', background:'#FEE2E2', color:'#991B1B', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', alignSelf:'flex-end' }}>
                          ✕ Réinitialiser
                        </button>
                      )}
                    </div>

                    {notesLoading ? (
                      <div style={{ textAlign:'center', padding:'40px', color:COULEURS.gris400 }}>⏳ Chargement…</div>
                    ) : lignesPlates.length === 0 ? (
                      <div style={S.vide}>{notesReelles.length === 0 ? 'Aucune note. Les notes apparaissent après correction des devoirs.' : 'Aucun résultat pour ces filtres.'}</div>
                    ) : (
                      <>
                        <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, overflow:'hidden' }}>
                          <div style={S.thead('1.8fr 1.8fr 2fr 1fr 1fr 1fr')}>
                            <span>Apprenant</span><span>Classe</span><span>Devoir / Évaluation</span><span>Type</span><span>Note</span><span>Date</span>
                          </div>
                          {lignesPage.map(({ cl, a, n }) => (
                            <div key={n.id}
                              onClick={() => setNoteDetailModal({ cl, a, n })}
                              style={{ ...S.trow('1.8fr 1.8fr 2fr 1fr 1fr 1fr'), cursor:'pointer', transition:'background 0.1s' }}
                              onMouseEnter={e => e.currentTarget.style.background = COULEURS.gris50}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <div style={{ width:26, height:26, borderRadius:'50%', background:couleurTheme+'20', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:11, color:couleurTheme, flexShrink:0 }}>
                                  {(a.nom_complet||'?')[0]}
                                </div>
                                <span style={{ fontWeight:600, color:COULEURS.navy, fontSize:13 }}>{a.nom_complet}</span>
                              </div>
                              <span style={{ fontSize:12, color:cl.couleur||couleurTheme, fontWeight:600 }}>{cl.nom}</span>
                              <span style={{ fontWeight:600, color:COULEURS.navy, fontSize:13 }}>{n.titre||'-'}</span>
                              <Puce label={n.type||'controle'} fond="#EDE9FE" texte="#6D28D9" />
                              <span style={{ fontWeight:700, color:(n.note/(n.note_max||20))>=0.7?COULEURS.succes:COULEURS.attention }}>{n.note}/{n.note_max||20}</span>
                              <span style={{ fontSize:11, color:COULEURS.gris400 }}>{fmtDate(n.date_evaluation||n.created_at)}</span>
                            </div>
                          ))}
                        </div>

                        {/* Pagination notes */}
                        {totalPagesN > 1 && (
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:16, padding:'12px 4px' }}>
                            <span style={{ fontSize:12, color:COULEURS.gris500 }}>{lignesPlates.length} note{lignesPlates.length>1?'s':''} · page {pageNClamp}/{totalPagesN}</span>
                            <div style={{ display:'flex', gap:6 }}>
                              <button onClick={() => setNotesPage(1)}          disabled={pageNClamp===1}            style={btnPagN(false, pageNClamp===1)}>«</button>
                              <button onClick={() => setNotesPage(p=>p-1)}     disabled={pageNClamp===1}            style={btnPagN(false, pageNClamp===1)}>‹</button>
                              {Array.from({length:totalPagesN},(_,i)=>i+1).filter(p=>Math.abs(p-pageNClamp)<=2).map(p=>(
                                <button key={p} onClick={()=>setNotesPage(p)} style={btnPagN(p===pageNClamp, false)}>{p}</button>
                              ))}
                              <button onClick={() => setNotesPage(p=>p+1)}     disabled={pageNClamp===totalPagesN}  style={btnPagN(false, pageNClamp===totalPagesN)}>›</button>
                              <button onClick={() => setNotesPage(totalPagesN)} disabled={pageNClamp===totalPagesN} style={btnPagN(false, pageNClamp===totalPagesN)}>»</button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}

              {/* ══ DEVOIRS ══ */}
              {sousOngletND === 'devoirs' && (() => {
                const aCorrection = devoirsReels.filter(d => {
                  const rendus = devoirRendusMap[d.id] || [];
                  return rendus.some(r => r.statut === 'rendu');
                }).length;

                // ── Filtrage ─────────────────────────────────────────────────
                const nowD = new Date();
                const devoirsFiltres = devoirsReels.filter(d => {
                  if (devoirFiltreClasse !== 'toutes' && d.classe_id !== devoirFiltreClasse) return false;
                  if (devoirFiltreStatut !== 'tous'   && d.statut !== devoirFiltreStatut)   return false;
                  if (devoirDateDebut && d.date_limite && d.date_limite < devoirDateDebut)   return false;
                  if (devoirDateFin   && d.date_limite && d.date_limite > devoirDateFin)     return false;
                  return true;
                });

                // ── Pagination ───────────────────────────────────────────────
                const totalPagesD  = Math.max(1, Math.ceil(devoirsFiltres.length / DEVOIR_PAR_PAGE));
                const pageDClamp   = Math.min(devoirPage, totalPagesD);
                const devoirsPage  = devoirsFiltres.slice((pageDClamp - 1) * DEVOIR_PAR_PAGE, pageDClamp * DEVOIR_PAR_PAGE);

                const btnPagD = (actif, dis) => ({
                  padding:'5px 12px', borderRadius:7, border:`1px solid ${actif?couleurTheme:COULEURS.gris200}`,
                  background:actif?couleurTheme:COULEURS.blanc, color:actif?'#fff':COULEURS.gris600,
                  fontSize:12, fontWeight:700, cursor:dis?'not-allowed':'pointer', fontFamily:'inherit', opacity:dis?0.4:1,
                });

                const hasDFilter = devoirFiltreStatut !== 'tous' || devoirFiltreClasse !== 'toutes' || devoirDateDebut || devoirDateFin;

                return (
                  <div>
                    {/* Titre + bouton */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                      <div style={S.titreSec}>Gestion des devoirs</div>
                      <button style={S.btn(couleurTheme)} onClick={() => { setBlocEditing(null); setCreerForm({ categorie:'devoir', titre:'', groupe_id:classesReelles[0]?.id||'', groupe_ids:classesReelles[0]?.id?[classesReelles[0].id]:[], dureeComposition:0, date_limite:'', heure_limite:'23:59', date_ouverture:'', heure_ouverture:'00:00', instructions:'', type:'fichier', typeEval:'texte_libre', dureeMin:60, ressourceUrl:'', blocs:[] }); setModalCreer(true); }}>
                        + Créer un devoir / évaluation
                      </button>
                    </div>

                    {aCorrection > 0 && (
                      <div style={{ ...S.infoBox('#FEF2F2'), color:'#991B1B', fontWeight:600, cursor:'pointer', marginBottom:16 }} onClick={() => setSousOngletND('reception')}>
                        🔴 {aCorrection} devoir(s) rendu(s) en attente de correction - <span style={{ textDecoration:'underline' }}>Aller à la Réception →</span>
                      </div>
                    )}

                    {/* Barre de filtres */}
                    <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'14px 18px', marginBottom:16, display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
                      {/* Statut */}
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase' }}>Statut</span>
                        <div style={{ display:'flex', gap:6 }}>
                          {[
                            { id:'tous',      lib:'Tous' },
                            { id:'publie',    lib:'✅ Publiés' },
                            { id:'brouillon', lib:'📝 Brouillons' },
                          ].map(f => (
                            <button key={f.id} onClick={() => { setDevoirFiltreStatut(f.id); setDevoirPage(1); }}
                              style={{ padding:'5px 11px', borderRadius:7, border:`1.5px solid ${devoirFiltreStatut===f.id?couleurTheme:COULEURS.gris200}`, background:devoirFiltreStatut===f.id?couleurTheme:'#fff', color:devoirFiltreStatut===f.id?'#fff':COULEURS.gris600, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                              {f.lib}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Classe */}
                      {classesReelles.length > 1 && (
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          <span style={{ fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase' }}>Classe</span>
                          <select value={devoirFiltreClasse} onChange={e => { setDevoirFiltreClasse(e.target.value); setDevoirPage(1); }}
                            style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12, color:COULEURS.navy, fontFamily:'inherit', cursor:'pointer' }}>
                            <option value="toutes">Toutes</option>
                            {classesReelles.map(cl => <option key={cl.id} value={cl.id}>{cl.nom}</option>)}
                          </select>
                        </div>
                      )}
                      {/* Date limite */}
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase' }}>Date limite - du</span>
                        <input type="date" value={devoirDateDebut} onChange={e => { setDevoirDateDebut(e.target.value); setDevoirPage(1); }}
                          style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit' }} />
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase' }}>au</span>
                        <input type="date" value={devoirDateFin} onChange={e => { setDevoirDateFin(e.target.value); setDevoirPage(1); }}
                          style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'inherit' }} />
                      </div>
                      {hasDFilter && (
                        <button onClick={() => { setDevoirFiltreStatut('tous'); setDevoirFiltreClasse('toutes'); setDevoirDateDebut(''); setDevoirDateFin(''); setDevoirPage(1); }}
                          style={{ padding:'6px 12px', borderRadius:7, border:'none', background:'#FEE2E2', color:'#991B1B', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', alignSelf:'flex-end' }}>
                          ✕ Réinitialiser
                        </button>
                      )}
                    </div>

                    {devoirsLoading ? (
                      <div style={{ textAlign:'center', padding:'40px', color:COULEURS.gris400 }}>⏳ Chargement des devoirs…</div>
                    ) : devoirsFiltres.length === 0 ? (
                      <div style={S.vide}>{devoirsReels.length === 0 ? 'Aucun devoir créé. Cliquez sur "+ Créer" pour commencer.' : 'Aucun devoir ne correspond aux filtres.'}</div>
                    ) : (
                      <>
                        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                          {devoirsPage.map(d => {
                            const hLimD  = (d.heure_limite  ||'23:59').slice(0,5);
                            const hOuvD  = (d.heure_ouverture||'00:00').slice(0,5);
                            const ouvert = !d.date_ouverture || nowD >= new Date(`${d.date_ouverture}T${hOuvD}:00`);
                            const expire = d.date_limite && nowD > new Date(`${d.date_limite}T${hLimD}:00`);
                            const rendus    = devoirRendusMap[d.id];
                            const nbRendus  = rendus ? rendus.filter(r => r.statut==='rendu'||r.statut==='corrige').length : null;
                            const nbACorr   = rendus ? rendus.filter(r => r.statut==='rendu').length : 0;
                            const cl        = classesReelles.find(c => c.id === d.classe_id);
                            return (
                              <div key={d.id} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'14px 18px', display:'flex', alignItems:'center', gap:14 }}>
                                <div style={{ flex:1 }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                                    <span style={{ fontWeight:700, color:COULEURS.navy, fontSize:14 }}>{d.titre}</span>
                                    {cl && <span style={{ fontSize:10, fontWeight:700, color:cl.couleur||couleurTheme, background:(cl.couleur||couleurTheme)+'18', padding:'2px 8px', borderRadius:20 }}>{cl.nom}</span>}
                                    <Puce label={d.statut==='publie'?'Publié':'Brouillon'} fond={d.statut==='publie'?'#D1FAE5':'#F1F5F9'} texte={d.statut==='publie'?'#065F46':'#64748B'} />
                                    {expire && <Puce label="Délai dépassé" fond="#FEE2E2" texte="#991B1B" />}
                                    {!ouvert && !expire && <Puce label="Programmé" fond="#EDE9FE" texte="#6D28D9" />}
                                  </div>
                                  <div style={{ fontSize:11, color:COULEURS.gris500, display:'flex', gap:14, flexWrap:'wrap' }}>
                                    <span>📝 {d.type_rendu==='fichier'?'Fichier PDF':d.type_rendu==='texte'?'Composition':d.type_rendu==='les_deux'?'Fichier + Texte':'-'}</span>
                                    <span>🎯 {d.format_type||'-'}</span>
                                    {d.date_ouverture && <span>🔓 Ouverture : {fmtDate(d.date_ouverture)} {d.heure_ouverture}</span>}
                                    {d.date_limite && <span>⏳ Limite : {fmtDate(d.date_limite)} {d.heure_limite}</span>}
                                    {nbRendus !== null && <span>📥 {nbRendus} rendu{nbRendus!==1?'s':''} {nbACorr>0?`· ⚠️ ${nbACorr} à corriger`:''}</span>}
                                  </div>
                                </div>
                                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                                  {d.statut === 'brouillon' && (
                                    <>
                                      <button onClick={() => {
                                        setEditDevoirId(d.id);
                                        setBlocEditing(null);
                                        setCreerForm({ categorie:d.categorie||'devoir', titre:d.titre||'', groupe_id:d.classe_id||'', groupe_ids:(d.classe_ids?.length?d.classe_ids:(d.classe_id?[d.classe_id]:[])), dureeComposition:d.duree_min||0, date_limite:d.date_limite||'', heure_limite:d.heure_limite||'23:59', date_ouverture:d.date_ouverture||'', heure_ouverture:d.heure_ouverture||'00:00', instructions:d.instructions||'', type:d.type_rendu||'fichier', typeEval:d.format_type||'texte_libre', dureeMin:d.duree_min||60, ressourceUrl:d.ressource_url||'', blocs:d.blocs||[] });
                                        setModalCreer(true);
                                      }} style={{ padding:'6px 12px', borderRadius:8, border:'none', background:'#EFF6FF', color:'#1D4ED8', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                                        ✏️ Modifier
                                      </button>
                                      <button onClick={() => publierDevoir(d.id)} disabled={publishingDevoirId === d.id} style={{ padding:'6px 12px', borderRadius:8, border:'none', background:'#D1FAE5', color:'#065F46', fontSize:11, fontWeight:700, cursor: publishingDevoirId === d.id ? 'not-allowed' : 'pointer', opacity: publishingDevoirId === d.id ? 0.6 : 1, fontFamily:'inherit' }}>
                                        {publishingDevoirId === d.id ? '⏳ …' : 'Publier'}
                                      </button>
                                    </>
                                  )}
                                  {d.statut === 'publie' && (
                                    <button onClick={() => setConfirmDepublier({ id: d.id, titre: d.titre })} style={{ padding:'6px 12px', borderRadius:8, border:'none', background:'#FEF3C7', color:'#92400E', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                                      ⏸ Dépublier
                                    </button>
                                  )}
                                  <button onClick={() => { chargerRendusPourDevoir(d.id); setSousOngletND('reception'); }} style={{ padding:'6px 12px', borderRadius:8, border:'none', background:couleurTheme+'18', color:couleurTheme, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                                    📥 Rendus
                                  </button>
                                  <button onClick={() => setConfirmSupprimer({ id: d.id, titre: d.titre })} style={{ padding:'6px 10px', borderRadius:8, border:'none', background:'#FEE2E2', color:'#991B1B', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                                    🗑
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Pagination devoirs */}
                        {totalPagesD > 1 && (
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:16, padding:'12px 4px' }}>
                            <span style={{ fontSize:12, color:COULEURS.gris500 }}>{devoirsFiltres.length} devoir{devoirsFiltres.length>1?'s':''} · page {pageDClamp}/{totalPagesD}</span>
                            <div style={{ display:'flex', gap:6 }}>
                              <button onClick={() => setDevoirPage(1)}             disabled={pageDClamp===1}           style={btnPagD(false, pageDClamp===1)}>«</button>
                              <button onClick={() => setDevoirPage(p=>p-1)}        disabled={pageDClamp===1}           style={btnPagD(false, pageDClamp===1)}>‹</button>
                              {Array.from({length:totalPagesD},(_,i)=>i+1).filter(p=>Math.abs(p-pageDClamp)<=2).map(p=>(
                                <button key={p} onClick={()=>setDevoirPage(p)} style={btnPagD(p===pageDClamp, false)}>{p}</button>
                              ))}
                              <button onClick={() => setDevoirPage(p=>p+1)}        disabled={pageDClamp===totalPagesD} style={btnPagD(false, pageDClamp===totalPagesD)}>›</button>
                              <button onClick={() => setDevoirPage(totalPagesD)}   disabled={pageDClamp===totalPagesD} style={btnPagD(false, pageDClamp===totalPagesD)}>»</button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}

              {/* ══ RÉCEPTION & CORRECTION ══ */}
              {sousOngletND === 'reception' && (() => {
                const tousRendus   = Object.values(devoirRendusMap).flat();
                const totalRendus  = tousRendus.filter(r => r.statut==='rendu'||r.statut==='corrige').length;
                const aCorrection  = tousRendus.filter(r => r.statut==='rendu').length;
                const corriges     = tousRendus.filter(r => r.statut==='corrige').length;
                const nonRendus    = tousRendus.filter(r => r.statut==='en_retard').length;

                const STATUT_R = {
                  a_rendre:  { fond:'#FEF9C3', texte:'#92400E', lib:'En attente', ic:'⏳' },
                  rendu:     { fond:'#D1FAE5', texte:'#065F46', lib:'Rendu',      ic:'✅' },
                  corrige:   { fond:'#DBEAFE', texte:'#1D4ED8', lib:'Corrigé',    ic:'🏅' },
                  en_retard: { fond:'#FEE2E2', texte:'#991B1B', lib:'Non rendu',  ic:'🔴' },
                };

                // ── Filtrage des devoirs (classe + date limite) ──────────────
                const devoirsPublies = devoirsReels.filter(d => {
                  if (d.statut !== 'publie') return false;
                  /* Le devoir est retenu s'il vise la classe filtrée, même quand elle
                     n'est pas la première de sa liste. */
                  if (receptFiltreClasse !== 'toutes' && !classesDuDevoir(d).includes(receptFiltreClasse)) return false;
                  if (receptDateDebut && d.date_limite && d.date_limite < receptDateDebut) return false;
                  if (receptDateFin   && d.date_limite && d.date_limite > receptDateFin)   return false;
                  // Si filtre statut actif, ne garder que les devoirs ayant au moins un rendu du bon statut
                  if (receptFiltreStatut !== 'tous') {
                    const rendus = devoirRendusMap[d.id];
                    if (rendus && !rendus.some(r => r.statut === receptFiltreStatut)) return false;
                  }
                  return true;
                });

                // ── Pagination sur les devoirs ───────────────────────────────
                const totalPages   = Math.max(1, Math.ceil(devoirsPublies.length / RECEPT_PAR_PAGE));
                const pageClamped  = Math.min(receptPage, totalPages);
                const devoirsPage  = devoirsPublies.slice((pageClamped - 1) * RECEPT_PAR_PAGE, pageClamped * RECEPT_PAR_PAGE);

                const btnPag = (actif) => ({
                  padding:'5px 12px', borderRadius:7, border:`1px solid ${actif ? couleurTheme : COULEURS.gris200}`,
                  background: actif ? couleurTheme : COULEURS.blanc, color: actif ? '#fff' : COULEURS.gris600,
                  fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                });

                return (
                  <div>
                    {/* KPIs */}
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 }}>
                      {[
                        { l:'Soumissions reçues', v:totalRendus,           c:couleurTheme,                                 i:'📥' },
                        { l:'À corriger',          v:aCorrection,           c:aCorrection>0?COULEURS.rouge:COULEURS.succes, i:'✏️' },
                        { l:'Corrigés',            v:corriges,              c:COULEURS.succes,                              i:'✅' },
                        { l:'Non rendus (0)',       v:nonRendus,             c:nonRendus>0?'#EF4444':COULEURS.gris400,       i:'🔴' },
                        { l:'Devoirs publiés',      v:devoirsReels.filter(d=>d.statut==='publie').length, c:COULEURS.navy, i:'📝' },
                      ].map(k => (
                        <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:12, padding:'14px 16px', border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}`, boxShadow:'0 2px 6px rgba(0,0,0,0.04)' }}>
                          <div style={{ fontSize:18, marginBottom:4 }}>{k.i}</div>
                          <div style={{ fontSize:22, fontWeight:800, color:k.c, lineHeight:1, marginBottom:4 }}>{k.v}</div>
                          <div style={{ fontSize:10, color:COULEURS.gris600 }}>{k.l}</div>
                        </div>
                      ))}
                    </div>

                    {/* ── Barre de filtres ── */}
                    <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'14px 18px', marginBottom:16, display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
                      {/* Filtre statut */}
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase' }}>Statut</span>
                        <div style={{ display:'flex', gap:6 }}>
                          {[
                            { id:'tous',      lib:'Tous' },
                            { id:'rendu',     lib:'✅ Rendus' },
                            { id:'corrige',   lib:'🏅 Corrigés' },
                            { id:'en_retard', lib:'🔴 Non rendus' },
                            { id:'a_rendre',  lib:'⏳ En attente' },
                          ].map(f => (
                            <button key={f.id} onClick={() => { setReceptFiltreStatut(f.id); setReceptPage(1); }}
                              style={{ padding:'5px 11px', borderRadius:7, border:`1.5px solid ${receptFiltreStatut===f.id?couleurTheme:COULEURS.gris200}`, background:receptFiltreStatut===f.id?couleurTheme:'#fff', color:receptFiltreStatut===f.id?'#fff':COULEURS.gris600, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                              {f.lib}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Filtre classe */}
                      {classesReelles.length > 1 && (
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          <span style={{ fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase' }}>Classe</span>
                          <select value={receptFiltreClasse} onChange={e => { setReceptFiltreClasse(e.target.value); setReceptPage(1); }}
                            style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12, color:COULEURS.navy, background:'#fff', fontFamily:'inherit', cursor:'pointer' }}>
                            <option value="toutes">Toutes les classes</option>
                            {classesReelles.map(cl => <option key={cl.id} value={cl.id}>{cl.nom}</option>)}
                          </select>
                        </div>
                      )}

                      {/* Filtre date limite */}
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase' }}>Date limite - du</span>
                        <input type="date" value={receptDateDebut} onChange={e => { setReceptDateDebut(e.target.value); setReceptPage(1); }}
                          style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12, color:COULEURS.navy, fontFamily:'inherit', cursor:'pointer' }} />
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase' }}>au</span>
                        <input type="date" value={receptDateFin} onChange={e => { setReceptDateFin(e.target.value); setReceptPage(1); }}
                          style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12, color:COULEURS.navy, fontFamily:'inherit', cursor:'pointer' }} />
                      </div>

                      {/* Reset */}
                      {(receptFiltreStatut !== 'tous' || receptFiltreClasse !== 'toutes' || receptDateDebut || receptDateFin) && (
                        <button onClick={() => { setReceptFiltreStatut('tous'); setReceptFiltreClasse('toutes'); setReceptDateDebut(''); setReceptDateFin(''); setReceptPage(1); }}
                          style={{ padding:'6px 12px', borderRadius:7, border:'none', background:'#FEE2E2', color:'#991B1B', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', alignSelf:'flex-end' }}>
                          ✕ Réinitialiser
                        </button>
                      )}
                    </div>

                    {/* ── Résultat filtrage ── */}
                    {devoirsPublies.length === 0 ? (
                      <div style={S.vide}>{devoirsReels.filter(d=>d.statut==='publie').length === 0 ? 'Aucun devoir publié.' : 'Aucun devoir ne correspond aux filtres.'}</div>
                    ) : (
                      <>
                        {devoirsPage.map(d => {
                          const rendus  = devoirRendusMap[d.id];
                          const nbACorr = rendus ? rendus.filter(r => r.statut==='rendu').length : 0;
                          const nbCorr  = rendus ? rendus.filter(r => r.statut==='corrige').length : 0;
                          const nbNonR  = rendus ? rendus.filter(r => r.statut==='en_retard').length : 0;
                          const nbTotal = rendus ? rendus.length : 0;
                          const toutCorrige = rendus && rendus.length > 0 && rendus.every(r => r.statut==='corrige'||r.statut==='en_retard');

                          return (
                            <div key={d.id} style={{ background:COULEURS.blanc, border:`1.5px solid ${nbACorr>0?'#FCA5A5':toutCorrige?'#6EE7B7':COULEURS.gris200}`, borderRadius:12, marginBottom:12, padding:'16px 20px', display:'flex', alignItems:'center', gap:16 }}>
                              {/* Icône statut */}
                              <div style={{ width:44, height:44, borderRadius:10, background:nbACorr>0?'#FEE2E2':toutCorrige?'#D1FAE5':'#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                                {nbACorr>0?'✏️':toutCorrige?'✅':'📝'}
                              </div>
                              {/* Infos devoir */}
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontWeight:700, color:COULEURS.navy, fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.titre}</div>
                                <div style={{ fontSize:11, color:COULEURS.gris500, marginTop:2 }}>
                                  {d.classe_nom} · {d.type_rendu==='fichier'?'PDF':d.type_rendu==='les_deux'?'Fichier + Texte':'Composition'} · Limite : {fmtDate(d.date_limite)}
                                </div>
                                <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
                                  {nbACorr>0 && <span style={{ padding:'2px 9px', borderRadius:20, background:'#FEE2E2', color:'#991B1B', fontSize:11, fontWeight:700 }}>✏️ {nbACorr} à corriger</span>}
                                  {nbNonR>0  && <span style={{ padding:'2px 9px', borderRadius:20, background:'#FEF2F2', color:'#991B1B', fontSize:11, fontWeight:700 }}>🔴 {nbNonR} non rendu{nbNonR>1?'s':''}</span>}
                                  {nbCorr>0  && <span style={{ padding:'2px 9px', borderRadius:20, background:'#D1FAE5', color:'#065F46', fontSize:11, fontWeight:700 }}>✅ {nbCorr} corrigé{nbCorr>1?'s':''}</span>}
                                  {!rendus && <span style={{ fontSize:11, color:COULEURS.gris400, fontStyle:'italic' }}>Non chargé</span>}
                                  {rendus && <span style={{ padding:'2px 9px', borderRadius:20, background:COULEURS.gris100, color:COULEURS.gris600, fontSize:11 }}>👥 {nbTotal} apprenant{nbTotal!==1?'s':''}</span>}
                                </div>
                              </div>
                              {/* Bouton */}
                              <button
                                onClick={() => { chargerRendusPourDevoir(d.id); setModalReception(d.id); setReceptModalStatut('tous'); }}
                                style={{ padding:'9px 18px', borderRadius:9, border:`1.5px solid ${couleurTheme}`, background:couleurTheme, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', flexShrink:0, whiteSpace:'nowrap' }}>
                                📥 Voir les rendus
                              </button>
                            </div>
                          );
                        })}

                        {/* ── Pagination ── */}
                        {totalPages > 1 && (
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:16, padding:'12px 4px' }}>
                            <span style={{ fontSize:12, color:COULEURS.gris500 }}>
                              {devoirsPublies.length} devoir{devoirsPublies.length>1?'s':''} · page {pageClamped}/{totalPages}
                            </span>
                            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                              <button onClick={() => setReceptPage(1)}        disabled={pageClamped===1}           style={btnPag(false)}>«</button>
                              <button onClick={() => setReceptPage(p => p-1)} disabled={pageClamped===1}           style={btnPag(false)}>‹</button>
                              {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(p => Math.abs(p - pageClamped) <= 2)
                                .map(p => (
                                  <button key={p} onClick={() => setReceptPage(p)} style={btnPag(p === pageClamped)}>{p}</button>
                                ))}
                              <button onClick={() => setReceptPage(p => p+1)} disabled={pageClamped===totalPages}  style={btnPag(false)}>›</button>
                              <button onClick={() => setReceptPage(totalPages)} disabled={pageClamped===totalPages} style={btnPag(false)}>»</button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}

            </div>
          );
        })()}


        {/* ══════════ FICHIERS PARTAGÉS ══════════ */}
        {section === 'fichiers' && (() => {
          const fichiersDuGroupe = fichiers.filter(f =>
            f.groupe_id === groupeFichiers &&
            (catFichiers === 'tous' || f.categorie === catFichiers)
          );

          async function toggleVisibilite(id) {
            if (fichierIdsEnCours.has(id)) return;
            const fich = fichiers.find(f => f.id === id);
            if (!fich) return;
            setFichierIdsEnCours(prev => new Set(prev).add(id));
            const newVisible = !fich.visible;
            setFichiers(prev => prev.map(f => f.id === id ? { ...f, visible: newVisible } : f));
            const token = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
            if (token) {
              try {
                const r = await fetch(`${_PROF_API}/api/elearning/fichiers/${id}`, {
                  method: 'PATCH', headers: _profHdrs(),
                  body: JSON.stringify({ visible: newVisible }),
                });
                if (!r.ok) {
                  const d = await r.json().catch(() => ({}));
                  toast.error(d.error || 'Action refusée', { duration: 5000 });
                  setFichiers(prev => prev.map(f => f.id === id ? fich : f));
                }
              } catch {
                toast.error('Impossible de joindre le serveur', { duration: 5000 });
                setFichiers(prev => prev.map(f => f.id === id ? fich : f));
              } finally {
                setFichierIdsEnCours(prev => { const n = new Set(prev); n.delete(id); return n; });
              }
            } else {
              setFichierIdsEnCours(prev => { const n = new Set(prev); n.delete(id); return n; });
            }
          }
          async function supprimerFichier(id) {
            if (fichierIdsEnCours.has(id)) return;
            const fich = fichiers.find(f => f.id === id);
            setFichierIdsEnCours(prev => new Set(prev).add(id));
            setFichiers(prev => prev.filter(f => f.id !== id));
            const token = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
            if (token) {
              try {
                const r = await fetch(`${_PROF_API}/api/elearning/fichiers/${id}`, {
                  method: 'DELETE', headers: _profHdrs(),
                });
                if (!r.ok) {
                  const d = await r.json().catch(() => ({}));
                  toast.error(d.error || 'Suppression refusée', { duration: 5000 });
                  if (fich) setFichiers(prev => [...prev, fich]);
                }
              } catch {
                toast.error('Impossible de joindre le serveur', { duration: 5000 });
                if (fich) setFichiers(prev => [...prev, fich]);
              } finally {
                setFichierIdsEnCours(prev => { const n = new Set(prev); n.delete(id); return n; });
              }
            } else {
              setFichierIdsEnCours(prev => { const n = new Set(prev); n.delete(id); return n; });
            }
          }
          // Sélection (input ou drag&drop) : on ne fait que mettre le fichier en attente -
          // l'envoi réel n'a lieu qu'après validation explicite par le coach (voir confirmerEnvoiFichier).
          function selectionnerFichier(e) {
            const file = e.target.files?.[0];
            if (!file) return;
            setFichierEnAttente(file);
          }

          async function confirmerEnvoiFichier() {
            const file = fichierEnAttente;
            if (!file || envoiFichierEnCours) return;
            const ext = file.name.split('.').pop().toLowerCase();
            const catAuto = ['mp3','mp4','wav','ogg'].includes(ext) ? 'audio'
              : ['pdf','docx','pptx'].includes(ext) ? 'cours'
              : 'autre';
            const taille_ko = Math.round(file.size / 1024);
            const taille = taille_ko > 1024 ? `${(taille_ko/1024).toFixed(1)} Mo` : `${taille_ko} Ko`;
            const icone = ['mp3','mp4','wav','ogg'].includes(ext) ? '🎵' : ext === 'pdf' ? '📄' : '📎';
            const token = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
            if (!token) {
              setFichiers(prev => [...prev, { id:`f-${Date.now()}`, nom:file.name, categorie:catAuto, groupe_id:groupeFichiers, taille, date:new Date().toISOString().split('T')[0], visible:true, icone }]);
              setFichierEnAttente(null);
              return;
            }
            setEnvoiFichierEnCours(true);
            try {
              // 1. Upload Cloudinary
              const fd = new FormData();
              fd.append('file', file);
              let url = '', public_id = '';
              try {
                const upRes = await fetchUpload(`${_PROF_API}/api/upload/fichier-classe`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}` },
                  body: fd,
                });
                if (!upRes.ok) {
                  const d = await upRes.json().catch(() => ({}));
                  toast.error(d.error || "Échec de l'envoi du fichier", { duration: 5000 });
                  return;
                }
                const upData = await upRes.json();
                url = upData.url; public_id = upData.public_id;
              } catch (err) {
                toast.error('Impossible de joindre le serveur', { duration: 5000 });
                return;
              }
              // 2. Sauvegarder en base
              try {
                const r = await fetch(`${_PROF_API}/api/elearning/fichiers`, {
                  method: 'POST', headers: _profHdrs(),
                  body: JSON.stringify({ classe_id:groupeFichiers, nom:file.name, url, public_id, categorie:catAuto, taille_ko, visible:true }),
                });
                const d = await r.json();
                if (r.ok && d.fichier) {
                  setFichiers(prev => [...prev, { ...d.fichier, groupe_id:d.fichier.classe_id, taille, icone }]);
                  toast.success('Fichier envoyé à la classe', { duration: 4000 });
                  setFichierEnAttente(null);
                } else {
                  toast.error(d.error || 'Envoi refusé', { duration: 5000 });
                }
              } catch (err) {
                toast.error('Impossible de joindre le serveur', { duration: 5000 });
              }
            } finally {
              setEnvoiFichierEnCours(false);
            }
          }

          const COULEUR_CAT = { cours:'#0891B2', exercice:'#8B5CF6', audio:'#F97316', ressource:'#059669', autre:'#64748B' };

          return (
            <div>
              {/* En-tête */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24, flexWrap:'wrap', gap:12 }}>
                <div>
                  <div style={S.titreSec}>📂 Fichiers partagés avec les apprenants</div>
                  <div style={{ fontSize:12, color:COULEURS.gris400 }}>
                    Les fichiers visibles sont accessibles par tous les apprenants du groupe sélectionné.
                  </div>
                </div>
                <label style={{ padding:'9px 18px', borderRadius:8, background:couleurTheme, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', gap:8 }}>
                  ⬆ Importer un fichier
                  <input type="file" style={{ display:'none' }} accept=".pdf,.docx,.pptx,.mp3,.mp4,.jpg,.png,.xlsx,.zip" onChange={selectionnerFichier} />
                </label>
              </div>

              {/* Statut de classe - évite que la liste ne s'allonge indéfiniment avec des classes clôturées */}
              <div style={{ display:'flex', gap:6, marginBottom:10 }}>
                {[
                  { id: 'actives',   lib: '🟢 Actives' },
                  { id: 'terminees', lib: '🔒 Terminées' },
                  { id: 'toutes',    lib: 'Toutes' },
                ].map(o => (
                  <button key={o.id} onClick={() => setFiltreFichiersClasseStatut(o.id)}
                    style={{
                      padding:'4px 11px', borderRadius:20, fontSize:11, fontWeight:700, cursor:'pointer',
                      border:`1.5px solid ${filtreFichiersClasseStatut===o.id?couleurTheme:COULEURS.gris200}`,
                      background: filtreFichiersClasseStatut===o.id?couleurTheme:COULEURS.blanc,
                      color: filtreFichiersClasseStatut===o.id?'#fff':COULEURS.gris600,
                      fontFamily:'"Plus Jakarta Sans", sans-serif',
                    }}>
                    {o.lib}
                  </button>
                ))}
              </div>

              {/* Sélecteur groupe */}
              <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
                {mesGroupes
                  .filter(g => filtreFichiersClasseStatut === 'toutes' ? true : filtreFichiersClasseStatut === 'terminees' ? g.statut === 'clos' : g.est_actif)
                  .map(g => (
                  <button key={g.id} onClick={() => setGroupeFichiers(g.id)} style={{
                    padding:'7px 16px', borderRadius:20,
                    border:`1.5px solid ${groupeFichiers===g.id?couleurTheme:COULEURS.gris200}`,
                    background:groupeFichiers===g.id?couleurTheme:COULEURS.blanc,
                    color:groupeFichiers===g.id?'#fff':COULEURS.gris600,
                    fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif',
                  }}>
                    {g.statut === 'clos' && '🔒 '}{g.nom}
                    <span style={{ marginLeft:6, background:'rgba(255,255,255,0.25)', borderRadius:10, padding:'1px 6px', fontSize:10 }}>
                      {fichiers.filter(f=>f.groupe_id===g.id).length}
                    </span>
                  </button>
                ))}
              </div>

              {/* Filtres catégorie */}
              <div style={{ display:'flex', gap:6, marginBottom:20, flexWrap:'wrap' }}>
                {CATEGORIES_FICHIERS.map(c => (
                  <button key={c.id} onClick={() => setCatFichiers(c.id)} style={{
                    padding:'5px 13px', borderRadius:16,
                    border:`1.5px solid ${catFichiers===c.id?COULEURS.navy:COULEURS.gris200}`,
                    background:catFichiers===c.id?COULEURS.navy:COULEURS.blanc,
                    color:catFichiers===c.id?'#fff':COULEURS.gris600,
                    fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif',
                  }}>
                    {c.icone} {c.lib}
                    {c.id !== 'tous' && <span style={{ marginLeft:4, opacity:0.7 }}>({fichiers.filter(f=>f.groupe_id===groupeFichiers&&f.categorie===c.id).length})</span>}
                  </button>
                ))}
              </div>

              {/* Zone drop */}
              <label
                onDragOver={e => { e.preventDefault(); setUploadZone(true); }}
                onDragLeave={() => setUploadZone(false)}
                onDrop={e => { e.preventDefault(); setUploadZone(false); const f = e.dataTransfer.files[0]; if (f) { const evt = { target:{ files:[f] } }; selectionnerFichier(evt); } }}
                style={{
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                  gap:8, padding:'20px', borderRadius:12, cursor:'pointer', marginBottom:20,
                  border:`2px dashed ${uploadZone?couleurTheme:COULEURS.gris200}`,
                  background:uploadZone?`${couleurTheme}08`:COULEURS.gris50,
                  transition:'all 0.15s',
                }}
              >
                <span style={{ fontSize:28 }}>☁️</span>
                <span style={{ fontSize:13, fontWeight:600, color:uploadZone?couleurTheme:COULEURS.gris600 }}>
                  Glissez-déposez vos fichiers ici
                </span>
                <span style={{ fontSize:11, color:COULEURS.gris400 }}>PDF, DOCX, PPTX, MP3, MP4, JPG, PNG, ZIP</span>
                <input type="file" style={{ display:'none' }} accept=".pdf,.docx,.pptx,.mp3,.mp4,.jpg,.png,.xlsx,.zip" onChange={selectionnerFichier} />
              </label>

              {/* Barre de validation avant envoi à la classe */}
              {fichierEnAttente && (
                <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:10, background:`${couleurTheme}10`, border:`1.5px solid ${couleurTheme}40`, marginBottom:20, flexWrap:'wrap' }}>
                  <span style={{ fontSize:20 }}>📎</span>
                  <div style={{ flex:1, minWidth:180 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{fichierEnAttente.name}</div>
                    <div style={{ fontSize:11, color:COULEURS.gris400 }}>
                      {(fichierEnAttente.size/1024) > 1024 ? `${(fichierEnAttente.size/1024/1024).toFixed(1)} Mo` : `${Math.round(fichierEnAttente.size/1024)} Ko`}
                      {' · sera envoyé à '}{mesGroupes.find(g => g.id === groupeFichiers)?.nom || 'la classe sélectionnée'}
                    </div>
                  </div>
                  <button onClick={() => setFichierEnAttente(null)} disabled={envoiFichierEnCours}
                    style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontSize:12, fontWeight:600, cursor:envoiFichierEnCours?'not-allowed':'pointer', opacity:envoiFichierEnCours?0.5:1, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                    Annuler
                  </button>
                  <button onClick={confirmerEnvoiFichier} disabled={envoiFichierEnCours}
                    style={{ padding:'8px 18px', borderRadius:8, border:'none', background:couleurTheme, color:'#fff', fontSize:12, fontWeight:700, cursor:envoiFichierEnCours?'not-allowed':'pointer', opacity:envoiFichierEnCours?0.7:1, fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', gap:8 }}>
                    {envoiFichierEnCours ? (
                      <>
                        <span style={{ width:13, height:13, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }} />
                        Envoi en cours…
                      </>
                    ) : '✓ Valider et envoyer à la classe'}
                  </button>
                </div>
              )}

              {/* Stats du groupe */}
              <div style={{ display:'flex', gap:12, marginBottom:20 }}>
                {[
                  { val:fichiers.filter(f=>f.groupe_id===groupeFichiers).length, lbl:'Total', acc:COULEURS.navy },
                  { val:fichiers.filter(f=>f.groupe_id===groupeFichiers&&f.visible).length, lbl:'Visibles', acc:COULEURS.succes },
                  { val:fichiers.filter(f=>f.groupe_id===groupeFichiers&&!f.visible).length, lbl:'Masqués', acc:COULEURS.gris400 },
                ].map(k => (
                  <div key={k.lbl} style={{ background:COULEURS.blanc, borderRadius:10, padding:'10px 16px', border:`1px solid ${COULEURS.gris200}`, borderLeft:`3px solid ${k.acc}`, display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:18, fontWeight:800, color:k.acc }}>{k.val}</span>
                    <span style={{ fontSize:11, color:COULEURS.gris600 }}>{k.lbl}</span>
                  </div>
                ))}
              </div>

              {/* Liste fichiers */}
              {fichiersDuGroupe.length === 0 ? (
                <div style={S.vide}>
                  <div style={{ fontSize:36, marginBottom:12 }}>📂</div>
                  <div style={{ fontWeight:600, color:COULEURS.navy, marginBottom:4 }}>Aucun fichier partagé</div>
                  <div>Importez votre premier fichier pour ce groupe.</div>
                </div>
              ) : (
                <div style={S.tableau}>
                  <div style={{ display:'grid', gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr', padding:'10px 18px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    <span>Fichier</span><span>Catégorie</span><span>Taille</span><span>Visibilité</span><span>Actions</span>
                  </div>
                  {fichiersDuGroupe.map(f => (
                    <div key={f.id} style={{ display:'grid', gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr', padding:'13px 18px', borderBottom:`1px solid ${COULEURS.gris100}`, alignItems:'center', fontSize:13, background:f.visible?COULEURS.blanc:'#F8FAFC' }}>
                      {/* Nom */}
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontSize:20, flexShrink:0 }}>{f.icone}</span>
                        <div>
                          <div style={{ fontWeight:600, color:COULEURS.navy, fontSize:13 }}>{f.nom}</div>
                          <div style={{ fontSize:11, color:COULEURS.gris400 }}>Ajouté le {f.date}</div>
                        </div>
                      </div>
                      {/* Catégorie */}
                      <span style={{ padding:'3px 10px', borderRadius:20, background:(COULEUR_CAT[f.categorie]||'#64748B')+'15', color:COULEUR_CAT[f.categorie]||'#64748B', fontSize:11, fontWeight:700, display:'inline-block' }}>
                        {CATEGORIES_FICHIERS.find(c=>c.id===f.categorie)?.lib || f.categorie}
                      </span>
                      {/* Taille */}
                      <span style={{ color:COULEURS.gris600, fontSize:12 }}>{f.taille}</span>
                      {/* Visibilité */}
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <button onClick={() => toggleVisibilite(f.id)} disabled={fichierIdsEnCours.has(f.id)} style={{ width:40, height:22, borderRadius:11, background:f.visible?COULEURS.succes:COULEURS.gris200, border:'none', cursor: fichierIdsEnCours.has(f.id) ? 'not-allowed' : 'pointer', opacity: fichierIdsEnCours.has(f.id) ? 0.6 : 1, position:'relative', transition:'background 0.2s', flexShrink:0 }}>
                          <div style={{ position:'absolute', top:2, width:18, height:18, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,0.2)', left:f.visible?20:2, transition:'left 0.2s' }} />
                        </button>
                        <span style={{ fontSize:11, color:f.visible?COULEURS.succes:COULEURS.gris400, fontWeight:600 }}>
                          {f.visible ? '👁 Visible' : '🔒 Masqué'}
                        </span>
                      </div>
                      {/* Actions */}
                      <div style={{ display:'flex', gap:6 }}>
                        {f.url ? (
                          <a href={urlTelecharger(f.url, f.nom)} style={{ ...S.btn(couleurTheme, true), textDecoration:'none', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>⬇</a>
                        ) : (
                          <button style={{ ...S.btn(couleurTheme, true), opacity:0.4, cursor:'not-allowed' }}>⬇</button>
                        )}
                        <button onClick={() => supprimerFichier(f.id)} disabled={fichierIdsEnCours.has(f.id)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #FECACA', background:'#FEF2F2', color:'#991B1B', fontSize:12, cursor: fichierIdsEnCours.has(f.id) ? 'not-allowed' : 'pointer', opacity: fichierIdsEnCours.has(f.id) ? 0.6 : 1, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Info apprenants */}
              <div style={{ background:'#EFF6FF', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#1E40AF', lineHeight:1.7, marginTop:16 }}>
                👁 Les apprenants de <strong>{mesGroupes.find(g=>g.id===groupeFichiers)?.nom}</strong> voient uniquement les fichiers marqués comme <strong>Visibles</strong>.
              </div>
            </div>
          );
        })()}

    {/* ══════════ MODAL FICHE APPRENANT ══════════ */}
    {modalApprenant && (() => {
      const a        = mesApprenants.find(x => x.id === modalApprenant);
      if (!a) return null;
      const parent   = (a.email_parent || a.prenom_parent || a.nom_parent || a.telephone_parent)
        ? { prenom: a.prenom_parent || '', nom: a.nom_parent || '', email: a.email_parent || '', telephone: a.telephone_parent || '', role: 'parent' }
        : null;
      const groupe   = mesGroupes.find(g => g.id === a.groupe_id);
      const presA    = presencesModalApp;
      const presOk   = presA.filter(p => p.statut === 'present').length;
      const tauxA    = presA.length > 0 ? Math.round(presOk / presA.length * 100) : null;
      // inscription_id de cet apprenant (a.id = inscription ID dans mesApprenants)
      const inscriptionId = a.id;
      // Notes manuelles (resultats_elearning)
      const notesManuelles = notesReelles.filter(n => n.inscription_id === inscriptionId);
      // Devoirs réels de la classe avec statut/note du rendu de cet apprenant
      const devoirsA = devoirsReels
        .filter(d => classesDuDevoir(d).includes(a.groupe_id))
        .map(d => {
          const rendus = devoirRendusMap[d.id] || [];
          const rendu  = rendus.find(r => r.inscription_id === inscriptionId);
          return {
            id: d.id, titre: d.titre, date_limite: d.date_limite,
            statut:      rendu?.statut      ?? (devoirRendusMap[d.id] ? 'a_rendre' : 'chargement'),
            note:        rendu?.note        ?? null,
            note_max:    rendu?.note_max    ?? 20,
            commentaire: rendu?.commentaire_coach ?? '',
            date_rendu:  rendu?.rendu_at    ?? null,
          };
        });
      // Notes des devoirs corrigés
      const notesDevoirs = devoirsA
        .filter(d => d.note != null)
        .map(d => ({ titre: d.titre, note: d.note, note_max: d.note_max, commentaire_coach: d.commentaire, created_at: d.date_rendu, isDevoir: true }));
      const notesA = [...notesManuelles, ...notesDevoirs]
        .sort((x, y) => ((y.corrige_at||y.created_at||'')).localeCompare((x.corrige_at||x.created_at||'')));
      const moy    = notesA.length > 0 ? (notesA.reduce((s, n) => s + (n.note / (n.note_max || 20) * 20), 0) / notesA.length).toFixed(1) : null;
      // Sessions de la classe de l'apprenant
      const sessClasse    = mesSessions.filter(s => s.groupe_id === a.groupe_id).sort((x, y) => new Date(y.date_session) - new Date(x.date_session));
      const sessRealisees = sessClasse.filter(s => s.statut === 'realisee').length;
      const nbAppsClasse  = (apprenantsByClasse[a.groupe_id] || []).length;

      return (
        <>
          {/* Fond sombre */}
          <div
            onClick={() => setModalApprenant(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, backdropFilter: 'blur(2px)' }}
          />

          {/* Panneau modal */}
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '90vw', maxWidth: '90vw', height: '90vh', maxHeight: '90vh',
            background: COULEURS.blanc, borderRadius: 20,
            boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
            zIndex: 1001, display: 'flex', flexDirection: 'column',
            overflow: 'hidden', fontFamily: '"Plus Jakarta Sans", sans-serif',
          }}>

            {/* En-tête modal */}
            <div style={{ background: `linear-gradient(135deg, ${COULEURS.navy} 0%, #0E4F6B 100%)`, padding: '24px 28px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', background: couleurTheme + '30', border: `3px solid ${couleurTheme}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, color: couleurTheme }}>
                    {a.avatar_url ? (
                      <img src={a.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                    ) : <>{a.prenom[0]}{a.nom[0]}</>}
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{a.prenom} {a.nom}</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>
                      {a.age} ans · {a.tranche_age} · Groupe : {groupe?.nom}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setModalApprenant(null)}
                  style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, width: 36, height: 36, color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  ✕
                </button>
              </div>

              {/* KPIs apprenant */}
              <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
                {[
                  { val: a.niveau_cecr || '-', lbl: 'Niveau CECR',    couleur: couleurTheme },
                  { val: tauxA !== null ? `${tauxA}%` : '-',          lbl: 'Taux présence', couleur: tauxA !== null && tauxA >= 75 ? '#4ADE80' : '#FCD34D' },
                  { val: `${presOk}/${presA.length}`,                  lbl: 'Présences',     couleur: '#4ADE80' },
                  { val: moy ? `${moy}/20` : '-',                     lbl: 'Moyenne',       couleur: '#A78BFA' },
                  { val: gamifModalApp ? `${gamifModalApp.solde} pts` : '…',        lbl: 'Points',        couleur: '#FCD34D' },
                ].map(k => (
                  <div key={k.lbl}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: k.couleur }}>{k.val}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{k.lbl}</div>
                  </div>
                ))}
              </div>

              {/* Carte classe */}
              {groupe && (
                <div style={{ marginTop: 14, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>🏫</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{groupe.nom}</div>
                      {groupe.niveau && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>Niveau {groupe.niveau}</div>}
                    </div>
                  </div>
                  <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.15)' }} />
                  {[
                    { ic: '👥', v: nbAppsClasse,   l: `apprenant${nbAppsClasse > 1 ? 's' : ''}` },
                    { ic: '📅', v: sessClasse.length, l: `session${sessClasse.length > 1 ? 's' : ''}` },
                    { ic: '✅', v: sessRealisees,   l: 'réalisées' },
                    { ic: '⏳', v: sessClasse.filter(s => s.statut === 'planifiee').length, l: 'à venir' },
                  ].map(k => (
                    <div key={k.l} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{k.ic} {k.v}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{k.l}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Barre d'onglets du modal ── */}
            <div style={{ display: 'flex', borderBottom: `2px solid ${COULEURS.gris200}`, flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {[
                { id: 'infos',     lib: '📋 Informations' },
                ...(a.tranche_age === 'enfant' || a.tranche_age === 'adolescent' ? [{ id: 'parents', lib: '👨‍👩‍👧 Parents' }] : []),
                { id: 'presences', lib: `✅ Présences (${presA.length})` },
                { id: 'sessions',  lib: `📅 Sessions (${sessClasse.length})` },
                { id: 'notes',     lib: `🏅 Notes (${notesA.length})` },
                { id: 'devoirs',   lib: `📝 Devoirs (${devoirsA.length})` },
              ].map(t => {
                const actif = modalOnglet === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setModalOnglet(t.id)}
                    style={{
                      padding: '13px 20px', border: 'none', background: 'transparent',
                      borderBottom: actif ? `2px solid ${couleurTheme}` : '2px solid transparent',
                      color: actif ? couleurTheme : COULEURS.gris600,
                      fontWeight: actif ? 700 : 400, fontSize: 13, cursor: 'pointer',
                      fontFamily: '"Plus Jakarta Sans", sans-serif', marginBottom: -2,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.lib}
                  </button>
                );
              })}
            </div>

            {/* ── Corps onglets ── */}
            <div style={{ overflowY: 'auto', padding: '24px 28px', flex: 1 }}>

              {/* ── ONGLET INFORMATIONS ── */}
              {modalOnglet === 'infos' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: COULEURS.gris50, borderRadius: 12, padding: '20px', border: `1px solid ${COULEURS.gris200}` }}>
                    {[
                      { lbl: 'Prénom',             val: a.prenom },
                      { lbl: 'Nom',                val: a.nom },
                      { lbl: 'Date de naissance',  val: fmtDate(a.date_naissance) || '-' },
                      { lbl: 'Âge',                val: a.age !== null ? `${a.age} ans` : '-' },
                      { lbl: 'Profil',             val: a.tranche_age ? (a.tranche_age === 'enfant' ? '🧒 Enfant' : a.tranche_age === 'adolescent' ? '🧑 Adolescent' : '🧑 Adulte') : '-' },
                      { lbl: 'Niveau CECR',        val: a.niveau_cecr },
                      { lbl: 'Groupe',             val: groupe?.nom || '-' },
                      { lbl: 'Statut',             val: a.statut },
                    ].filter(f => f.val && f.val !== '-' || ['Prénom','Nom','Niveau CECR','Groupe','Statut'].includes(f.lbl)).map(f => (
                      <div key={f.lbl} style={{ padding: '10px 0', borderBottom: `1px solid ${COULEURS.gris200}` }}>
                        <div style={{ fontSize: 11, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{f.lbl}</div>
                        <div style={{ fontWeight: 700, color: COULEURS.navy, fontSize: 14 }}>{f.val}</div>
                      </div>
                    ))}
                  </div>
                  {/* Gamification */}
                  <div style={{ background: 'linear-gradient(135deg,#FCD34D20,#F9731620)', borderRadius: 12, padding: '16px 20px', border: '1px solid #FCD34D40' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: gamifModalApp?.badges?.some(b => b.obtenu) ? 16 : 0 }}>
                      <div style={{ fontSize: 32 }}>🌟</div>
                      <div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#F97316' }}>{gamifModalApp ? gamifModalApp.solde : '…'} pts</div>
                        <div style={{ fontSize: 12, color: COULEURS.gris600 }}>Points de gamification accumulés</div>
                      </div>
                    </div>
                    {gamifModalApp?.badges?.some(b => b.obtenu) && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {gamifModalApp.badges.filter(b => b.obtenu).map(b => (
                          <div key={b.id} title={b.description} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fff', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700, color: '#92400E', border: '1px solid #FCD34D60' }}>
                            <span>{b.icone}</span>{b.nom}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── ONGLET PARENTS ── */}
              {modalOnglet === 'parents' && (
                <div>
                  {parent ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {/* Avatar parent */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: COULEURS.gris50, borderRadius: 12, padding: '16px 20px', border: `1px solid ${COULEURS.gris200}` }}>
                        <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#8B5CF620', border: '2px solid #8B5CF640', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: '#8B5CF6', flexShrink: 0 }}>
                          {parent.prenom[0]}{parent.nom[0]}
                        </div>
                        <div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: COULEURS.navy }}>{parent.prenom} {parent.nom}</div>
                          <Puce label={parent.role} fond="#EDE9FE" texte="#6D28D9" />
                        </div>
                      </div>

                      {/* Coordonnées */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <a href={`mailto:${parent.email}`} style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 6, background: '#EFF6FF', borderRadius: 12, padding: '16px', border: '1px solid #BFDBFE' }}>
                          <div style={{ fontSize: 24 }}>✉️</div>
                          <div style={{ fontSize: 11, color: '#1D4ED8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</div>
                          <div style={{ fontSize: 13, color: '#1D4ED8', fontWeight: 600, wordBreak: 'break-all' }}>{parent.email}</div>
                        </a>
                        <a href={`tel:${parent.telephone}`} style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 6, background: '#F0FDF4', borderRadius: 12, padding: '16px', border: '1px solid #BBF7D0' }}>
                          <div style={{ fontSize: 24 }}>📞</div>
                          <div style={{ fontSize: 11, color: '#166534', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Téléphone</div>
                          <div style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>{parent.telephone}</div>
                        </a>
                      </div>

                      {/* Bouton message */}
                      <a href={`mailto:${parent.email}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: COULEURS.navy, color: '#fff', borderRadius: 10, padding: '13px', fontWeight: 600, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                        ✉️ Envoyer un email au parent
                      </a>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 48, color: COULEURS.gris400, fontSize: 13, background: COULEURS.gris50, borderRadius: 12, border: `1px dashed ${COULEURS.gris200}` }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>👨‍👩‍👧</div>
                      Aucun parent enregistré pour cet apprenant
                    </div>
                  )}
                </div>
              )}

              {/* ── ONGLET PRÉSENCES ── */}
              {modalOnglet === 'presences' && (
                <OngletPresencesApprenant
                  presA={presA}
                  tauxA={tauxA}
                  couleurTheme={couleurTheme}
                  mesSessions={mesSessions}
                  loadingPresModalApp={loadingPresModalApp}
                />
              )}

              {/* ── ONGLET SESSIONS ── */}
              {modalOnglet === 'sessions' && (
                <OngletSessionsApprenant
                  sessClasse={sessClasse}
                  presA={presA}
                  couleurTheme={couleurTheme}
                />
              )}


              {/* ── ONGLET NOTES ── */}
              {modalOnglet === 'notes' && (
                <div>
                  {/* Moyenne générale */}
                  {moy && (
                    <div style={{ background: `linear-gradient(135deg, ${couleurTheme}15, #8B5CF615)`, borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, border: `1px solid ${couleurTheme}30` }}>
                      <div>
                        <div style={{ fontSize: 36, fontWeight: 800, color: parseFloat(moy) >= 14 ? COULEURS.succes : parseFloat(moy) >= 10 ? COULEURS.attention : '#EF4444' }}>
                          {moy}<span style={{ fontSize: 16, fontWeight: 500, color: COULEURS.gris400 }}>/20</span>
                        </div>
                        <div style={{ fontSize: 12, color: COULEURS.gris600 }}>Moyenne générale</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        {[...new Set(notesA.map(n => n.competence))].map(comp => {
                          const notesComp = notesA.filter(n => n.competence === comp);
                          const moyComp = (notesComp.reduce((s, n) => s + (n.note / n.note_max * 20), 0) / notesComp.length).toFixed(1);
                          return (
                            <div key={comp} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 11, color: COULEURS.gris600, width: 90 }}>{comp}</span>
                              <div style={{ flex: 1, height: 6, background: COULEURS.gris200, borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ width: `${(parseFloat(moyComp) / 20) * 100}%`, height: '100%', background: couleurTheme, borderRadius: 4 }} />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: COULEURS.navy, width: 36 }}>{moyComp}/20</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {notesA.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {notesA.map((n, idx) => {
                        const noteMax   = n.note_max || 20;
                        const ratio     = n.note / noteMax;
                        const couleurN  = ratio >= 0.7 ? COULEURS.succes : ratio >= 0.5 ? COULEURS.attention : '#EF4444';
                        const label     = n.titre || n.type_eval || 'Note';
                        const comment   = n.commentaire || n.commentaire_coach;
                        const dateN     = n.corrige_at || n.created_at;
                        return (
                        <div key={n.id || idx} style={{ background: COULEURS.gris50, borderRadius: 10, padding: '14px 16px', border: `1px solid ${COULEURS.gris200}`, borderLeft: `4px solid ${couleurN}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap:'wrap' }}>
                              <Puce label={label} fond={n.isDevoir ? '#DBEAFE' : '#EDE9FE'} texte={n.isDevoir ? '#1D4ED8' : '#6D28D9'} />
                              {n.competence && <Puce label={n.competence} fond="#FEF9C3" texte="#92400E" />}
                              {n.isDevoir && <Puce label="Devoir corrigé" fond="#F0FDF4" texte="#166534" />}
                            </div>
                            <span style={{ fontSize: 20, fontWeight: 800, color: couleurN, flexShrink:0 }}>
                              {n.note}/{noteMax}
                            </span>
                          </div>
                          {comment && (
                            <div style={{ fontSize: 12, color: COULEURS.gris600, fontStyle: 'italic' }}>💬 {comment}</div>
                          )}
                          <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 6 }}>📅 {fmtDate(dateN)}</div>
                        </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 32, color: COULEURS.gris400, fontSize: 13, background: COULEURS.gris50, borderRadius: 12, border: `1px dashed ${COULEURS.gris200}` }}>
                      Aucune note enregistrée
                    </div>
                  )}
                </div>
              )}

              {/* ── ONGLET DEVOIRS ── */}
              {modalOnglet === 'devoirs' && (
                <div>
                  {/* Récap */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                    {[
                      { val: devoirsA.filter(d => d.statut === 'a_rendre').length,  lbl: 'À rendre', fond: '#FEF9C3', texte: '#92400E' },
                      { val: devoirsA.filter(d => d.statut === 'rendu').length,     lbl: 'Rendus',   fond: '#D1FAE5', texte: '#065F46' },
                      { val: devoirsA.filter(d => d.statut === 'corrige').length,   lbl: 'Corrigés', fond: '#E0F2FE', texte: '#0E7490' },
                      { val: devoirsA.filter(d => d.statut === 'en_retard').length, lbl: 'En retard',fond: '#FEE2E2', texte: '#991B1B' },
                    ].map(k => (
                      <div key={k.lbl} style={{ flex: 1, background: k.fond, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: k.texte }}>{k.val}</div>
                        <div style={{ fontSize: 11, color: k.texte, opacity: 0.7, marginTop: 2 }}>{k.lbl}</div>
                      </div>
                    ))}
                  </div>

                  {devoirsA.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {devoirsA.map(d => {
                        const stMap = {
                          a_rendre:     { fond: '#FEF9C3', texte: '#92400E', lib: 'À rendre',  acc: COULEURS.attention },
                          rendu:        { fond: '#D1FAE5', texte: '#065F46', lib: 'Rendu',     acc: COULEURS.succes },
                          corrige:      { fond: '#E0F2FE', texte: '#0E7490', lib: 'Corrigé',   acc: couleurTheme },
                          en_retard:    { fond: '#FEE2E2', texte: '#991B1B', lib: 'En retard', acc: '#EF4444' },
                          chargement:   { fond: '#F1F5F9', texte: '#64748B', lib: '…',          acc: COULEURS.gris300 },
                        };
                        const st = stMap[d.statut] || stMap.a_rendre;
                        const noteMax = d.note_max || 20;
                        const notePct = d.note != null ? d.note / noteMax : null;
                        const noteCoul = notePct == null ? COULEURS.gris400 : notePct >= 0.7 ? COULEURS.succes : notePct >= 0.5 ? COULEURS.attention : '#EF4444';
                        return (
                          <div key={d.id} style={{ background: COULEURS.gris50, borderRadius: 10, padding: '14px 16px', border: `1px solid ${COULEURS.gris200}`, borderLeft: `4px solid ${st.acc}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: COULEURS.navy, marginBottom: 4 }}>{d.titre}</div>
                                <div style={{ fontSize: 11, color: COULEURS.gris400 }}>
                                  ⏰ Limite : {fmtDate(d.date_limite)}
                                  {d.date_rendu ? ` · Rendu le : ${fmtDate(d.date_rendu)}` : ''}
                                </div>
                                {d.commentaire && (
                                  <div style={{ fontSize: 12, color: COULEURS.gris600, fontStyle: 'italic', marginTop: 6 }}>💬 {d.commentaire}</div>
                                )}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                                <Puce label={st.lib} fond={st.fond} texte={st.texte} />
                                {d.note != null && (
                                  <span style={{ fontSize: 18, fontWeight: 900, color: noteCoul }}>
                                    {d.note}<span style={{ fontSize: 11, fontWeight: 500, color: COULEURS.gris400 }}>/{noteMax}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 32, color: COULEURS.gris400, fontSize: 13, background: COULEURS.gris50, borderRadius: 12, border: `1px dashed ${COULEURS.gris200}` }}>
                      Aucun devoir publié pour cette classe
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Pied modal */}
            <div style={{ padding: '16px 28px', borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
              {parent?.email && (
                <a href={`mailto:${parent.email}`} style={{ ...S.btn(COULEURS.navy), textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  ✉️ Contacter le parent
                </a>
              )}
              <button onClick={() => setModalApprenant(null)} style={{ ...S.btnGhost }}>
                Fermer
              </button>
            </div>

          </div>
        </>
      );
    })()}

    {/* ══════════ MODAL MODULE BUILDER ══════════ */}
    {modalSupport && (() => {
      const LBL = { fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 };
      const INP = { ...S.input, marginBottom: 0 };
      const totalDuree = blocs.reduce((s, b) => s + (b.dureeMin || 0), 0);
      /* UNE CLASSE AU MOINS, brouillon compris. Un contenu sans destinataire n'apparaît
         dans aucune médiathèque — elle filtre par classe —, si bien que son auteur
         lui-même ne le retrouvait plus. Il se rattache d'abord, se rédige ensuite. */
      const classesChoisies = formSupport.groupe_ids || [];
      const valide = formSupport.titre.trim() && classesChoisies.length > 0;
      const peutPublierRecap = blocs.length > 0;

      async function doSave() {
        if (!valide || savingModule) return;
        setSavingModule(true);
        try {
        /* UN CONTENU SANS BLOC RESTE BROUILLON, quoi qu'on ait coché. Publier une
           coquille vide notifie toute la classe d'un cours qui s'ouvre sur rien, et
           l'envoi n'est pas rattrapable. Le serveur refuse aussi, c'est sa règle ; ici
           on évite simplement au coach de se la faire opposer après coup. */
        const peutPublier = blocs.length > 0;
        const payload = {
          titre: formSupport.titre, description: formSupport.description,
          type_contenu: formSupport.type_contenu, module: formSupport.module,
          semaine: formSupport.semaine,
          /* `groupe_id` suit avec la première classe : plusieurs écrans la lisent
             encore (planification d'une séance, fiche de classe). */
          groupe_ids: classesChoisies, groupe_id: classesChoisies[0] || null,
          est_visible: peutPublier && formSupport.est_visible,
          objectifs: moduleForm.objectifs, dureeEstimee: moduleForm.dureeEstimee,
          statut: peutPublier ? moduleForm.statut : 'brouillon',
          blocs,
        };
        const token = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');

        if (!token) {
          // Mode mock : mise à jour locale uniquement
          if (contenuEnEdition) {
            setContenus(prev => prev.map(c => c.id === contenuEnEdition ? { ...c, ...payload } : c));
          } else {
            setContenus(prev => [...prev, { id: `cnt-${Date.now()}`, professeur_id: profile?.id || 'teacher-001', fichier_url: null, date_publication: new Date().toISOString(), version: 1, ...payload }]);
          }
        } else {
          // Mode réel : persistance en base
          const body = {
            titre:         payload.titre,
            categorie:     payload.module || '',
            type_contenu:  payload.type_contenu,
            semaine:       payload.semaine,
            statut:        payload.statut,
            est_visible:   payload.est_visible,
            blocs:         payload.blocs,
            objectifs:     payload.objectifs || '',
            duree_estimee: payload.dureeEstimee,
            classe_ids:    payload.groupe_ids,
          };
          let echec = false;
          try {
            if (contenuEnEdition) {
              const r = await fetch(`${_PROF_API}/api/elearning/contenus/${contenuEnEdition}`, {
                method: 'PATCH', headers: _profHdrs(), body: JSON.stringify(body),
              });
              if (r.ok) {
                setContenus(prev => prev.map(c => c.id === contenuEnEdition ? { ...c, ...payload } : c));
              } else {
                echec = true;
                const d = await r.json().catch(() => ({}));
                toast.error(d.error || 'Modification refusée', { duration: 5000 });
              }
            } else {
              const r   = await fetch(`${_PROF_API}/api/elearning/contenus`, {
                method: 'POST', headers: _profHdrs(), body: JSON.stringify(body),
              });
              const d   = await r.json().catch(() => ({}));
              if (r.ok) {
                setContenus(prev => [...prev, { ...payload, id: d.contenu?.id || `cnt-${Date.now()}`, professeur_id: profile?.id, fichier_url: null, date_publication: new Date().toISOString(), version: 1 }]);
              } else {
                echec = true;
                toast.error(d.error || 'Création refusée', { duration: 5000 });
              }
            }
          } catch (e) {
            echec = true;
            toast.error('Impossible de joindre le serveur', { duration: 5000 });
          }
          if (echec) return;
        }
        setModalSupport(false); setBlocs([]); setShowBlocForm(false); setPreviewMode(false); setEtapeContenu(1);
        } finally {
          setSavingModule(false);
        }
      }

      function moveBlocUp(i) { setBlocs(p => { const a = [...p]; [a[i-1], a[i]] = [a[i], a[i-1]]; return a; }); }
      function moveBlocDown(i) { setBlocs(p => { const a = [...p]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a; }); }
      /* Supprimer un bloc partait sans un mot. Un bloc n'est pas une ligne : il peut
         porter un quiz de dix questions, un fichier qu'on vient de téléverser, ou des
         sections entières de texte. Le reconstruire coûte cher, le supprimer coûtait un
         clic. On nomme ce qui part. */
      async function removeBloc(id) {
        const b = blocs.find(x => x.id === id);
        if (!b) return;
        const bt = BLOCK_TYPES[b.type] || BLOCK_TYPES.texte;
        const detail = b.type === 'quiz' && b.questions?.length
          ? `\n\nIl contient ${b.questions.length} question${b.questions.length > 1 ? 's' : ''}.`
          : b.fichier
            ? `\n\nLe fichier joint « ${b.fichier} » sera détaché du cours.`
            : b.sections?.length
              ? `\n\nIl contient ${b.sections.length} section${b.sections.length > 1 ? 's' : ''} de texte.`
              : '';
        const ok = await confirmer(
          `Supprimer le bloc « ${b.titre || bt.label} » ?${detail}`,
          { titre: '🗑 Supprimer ce bloc', confirmLabel: 'Supprimer', danger: true });
        if (!ok) return;
        setBlocs(p => p.filter(x => x.id !== id));
      }

      /* Fermer l'éditeur jette TOUT ce qui n'a pas été enregistré. Le ✕ et le fond cliquable
         sont à un geste de distance d'un cours écrit pendant vingt minutes : on ne demande
         qu'en cas de travail réel en cours, pour ne pas transformer une fermeture anodine
         en question de plus. */
      async function fermerEditeur() {
        const aDuTravail = blocs.length > 0 || formSupport.titre.trim() || showBlocForm;
        if (aDuTravail) {
          const ok = await confirmer(
            contenuEnEdition
              ? `Fermer sans enregistrer ?\n\nLes modifications apportées à « ${formSupport.titre || 'ce contenu'} » seront perdues.`
              : `Abandonner ce contenu ?\n\n« ${formSupport.titre || 'Sans titre'} » et ses ${blocs.length} bloc${blocs.length > 1 ? 's' : ''} ne seront pas enregistrés.`,
            { titre: 'Quitter l\'éditeur', confirmLabel: 'Fermer sans enregistrer', danger: true });
          if (!ok) return;
        }
        setModalSupport(false); setPreviewMode(false); setEtapeContenu(1);
        setBlocs([]); setShowBlocForm(false);
      }

      return (
      <>
        <div onClick={() => fermerEditeur()} style={{ position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.6)', zIndex: 1000, backdropFilter: 'blur(3px)' }} />
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '90vw', height: '90vh', maxHeight: '90vh', background: '#fff', borderRadius: 14, boxShadow: '0 32px 80px rgba(0,0,0,0.3)', zIndex: 1001, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>

          {/* ── Header ── */}
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 16, background: `linear-gradient(135deg, ${COULEURS.navy} 0%, #0E4F6B 100%)`, borderRadius: '14px 14px 0 0', flexShrink: 0 }}>
            <div style={{ flex: 1 }}>
              {/* « Module » et « support » ne nommaient qu'une mécanique interne : le
                  coach dépose un contenu. Un seul mot, partout. */}
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.1em', marginBottom: 4 }}>
                {contenuEnEdition ? 'MODIFIER LE CONTENU' : 'NOUVEAU CONTENU'}
                <span style={{ marginLeft: 10, opacity: 0.8 }}>· Étape {etapeContenu} sur 2 — {etapeContenu === 1 ? 'Contenu' : 'Récapitulatif'}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{formSupport.titre || 'Nouveau contenu'}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 3 }}>⏱ {totalDuree} min estimées · 📦 {blocs.length} bloc{blocs.length > 1 ? 's' : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => setPreviewMode(v => !v)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: previewMode ? 'rgba(255,255,255,0.2)' : 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                {previewMode ? '✏️ Éditer' : '👁️ Aperçu'}
              </button>
              <button onClick={() => fermerEditeur()} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 22, cursor: 'pointer', padding: 0 }}>✕</button>
            </div>
          </div>

          {/* ── Body 2 colonnes (étape 1 : rédaction) ── */}
          <div style={{ display: etapeContenu === 1 ? 'grid' : 'none', gridTemplateColumns: previewMode ? '1fr' : '310px 1fr', flex: 1, overflow: 'hidden', minHeight: 0 }}>

            {/* LEFT - Paramètres */}
            {!previewMode && (
              <div style={{ padding: 20, borderRight: '1px solid #e5e7eb', overflowY: 'auto', background: '#f9fafb', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Paramètres du contenu</div>

                <div><label style={LBL}>Titre *</label><input value={formSupport.titre} onChange={e => setFormSupport(p => ({ ...p, titre: e.target.value }))} style={INP} placeholder="ex: Compréhension orale - Réunions professionnelles" /></div>

                <div><label style={LBL}>Description</label><textarea value={formSupport.description || ''} onChange={e => setFormSupport(p => ({ ...p, description: e.target.value }))} style={{ ...INP, minHeight: 60, resize: 'vertical', lineHeight: 1.6, width: '100%', boxSizing: 'border-box' }} placeholder="Résumé court du contenu de ce module…" /></div>

                {/* ── TYPE DE CONTENU ──
                    En cartes et non en liste déroulante : le type commande les blocs
                    recevables plus bas (une capsule vidéo n'accueille pas un second
                    bloc vidéo), donc il se choisit en premier et doit rester visible.
                    Changer de type alors qu'un bloc devenu interdit est en cours de
                    saisie le ramène sur un type permis, sinon le formulaire se figerait
                    sur des champs qui ne s'enregistrent plus. */}
                <div>
                  <label style={LBL}>Type de contenu *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
                    {TYPES_CONTENU.map(t => {
                      const actif = formSupport.type_contenu === t.cle;
                      const col = COULEUR_TYPE_CONTENU[t.cle]?.texte || couleurTheme;
                      return (
                        <button key={t.cle} title={t.desc}
                          onClick={() => {
                            setFormSupport(p => ({ ...p, type_contenu: t.cle }));
                            const permis = blocsAutorises(t.cle);
                            if (!permis.includes(blocForm.type)) setBlocForm(f => ({ ...f, type: permis[0] }));
                          }}
                          style={{ padding: '9px 6px', borderRadius: 10, border: `2px solid ${actif ? col : COULEURS.gris200}`, background: actif ? col + '14' : '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                          <span style={{ fontSize: 20 }}>{t.emoji}</span>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: actif ? col : '#374151' }}>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── CLASSES DESTINATAIRES ──
                    Le cœur du changement : un même contenu part vers autant de classes
                    qu'on veut, au lieu d'être recopié pour chacune. Une seule version à
                    corriger ensuite. Les classes closes restent proposées : leurs
                    apprenants gardent l'accès à ce qu'on y publie. */}
                <div>
                  <label style={LBL}>
                    Classes destinataires *
                    {formSupport.groupe_ids?.length > 0 && (
                      <span style={{ color: couleurTheme, marginLeft: 5 }}>
                        ({formSupport.groupe_ids.length} sélectionnée{formSupport.groupe_ids.length > 1 ? 's' : ''})
                      </span>
                    )}
                  </label>
                  {mesGroupes.filter(g => !g._delegation).length === 0 ? (
                    <div style={{ fontSize: 12.5, color: COULEURS.gris400, padding: '6px 0' }}>Aucune classe ne vous est assignée pour l'instant.</div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {mesGroupes.filter(g => !g._delegation).map(g => {
                        const choisi = (formSupport.groupe_ids || []).includes(g.id);
                        return (
                          <button key={g.id}
                            onClick={() => setFormSupport(p => {
                              const ids = p.groupe_ids || [];
                              return { ...p, groupe_ids: ids.includes(g.id) ? ids.filter(x => x !== g.id) : [...ids, g.id] };
                            })}
                            style={{ padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `2px solid ${choisi ? couleurTheme : COULEURS.gris200}`, background: choisi ? couleurTheme + '14' : '#fff', color: choisi ? couleurTheme : '#374151', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                            {choisi ? '✓ ' : ''}{g.statut === 'clos' ? '🔒 ' : ''}{g.nom}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 6, lineHeight: 1.5 }}>
                    Une seule version du contenu : la corriger plus tard la corrigera pour toutes ces classes.
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                  <div><label style={LBL}>Module / Thème</label><input value={formSupport.module} onChange={e => setFormSupport(p => ({ ...p, module: e.target.value }))} style={INP} placeholder="ex: Module 3 : Temps du passé" /></div>
                  <div><label style={LBL}>Semaine</label><input type="number" min={1} max={52} value={formSupport.semaine} onChange={e => setFormSupport(p => ({ ...p, semaine: parseInt(e.target.value) || 1 }))} style={INP} /></div>
                </div>

                <div>
                  <label style={LBL}>Objectifs pédagogiques</label>
                  <textarea value={moduleForm.objectifs} onChange={e => setModuleForm(p => ({ ...p, objectifs: e.target.value }))} style={{ ...INP, minHeight: 80, resize: 'vertical', lineHeight: 1.6, width: '100%', boxSizing: 'border-box' }} placeholder={"- Maîtriser le vocabulaire des réunions\n- Animer une réunion formelle\n- Comprendre les expressions clés"} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label style={LBL}>Durée estimée (min)</label><input type="number" min={5} value={moduleForm.dureeEstimee} onChange={e => setModuleForm(p => ({ ...p, dureeEstimee: parseInt(e.target.value) || 30 }))} style={INP} /></div>
                  <div>
                    <label style={LBL}>Statut</label>
                    <select value={moduleForm.statut} onChange={e => setModuleForm(p => ({ ...p, statut: e.target.value }))} style={{ ...INP, width: '100%' }}>
                      <option value="brouillon">📝 Brouillon</option>
                      <option value="publie">✅ Publié</option>
                      <option value="archive">📦 Archivé</option>
                    </select>
                  </div>
                </div>

                <div
                  onClick={() => setFormSupport(p => ({ ...p, est_visible: !p.est_visible }))}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, padding: '12px 14px', border: `1.5px solid ${formSupport.est_visible ? COULEURS.succes : COULEURS.gris200}`, background: formSupport.est_visible ? '#F0FDF4' : COULEURS.gris50, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: formSupport.est_visible ? COULEURS.succes : COULEURS.gris600 }}>
                      {formSupport.est_visible ? '📗 Publié - visible dans "Mes Cours"' : '📝 Brouillon - invisible pour les apprenants'}
                    </div>
                    <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 2 }}>
                      {formSupport.est_visible
                        ? 'Les apprenants du groupe peuvent accéder à ce cours librement.'
                        : 'Visible uniquement via "Voir le programme" si lié à une session.'}
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setFormSupport(p => ({ ...p, est_visible: !p.est_visible })); }} style={{ width: 46, height: 26, borderRadius: 13, border: 'none', background: formSupport.est_visible ? COULEURS.succes : COULEURS.gris200, cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 3, left: formSupport.est_visible ? 22 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                  </button>
                </div>

                {/* Récap durée */}
                {blocs.length > 0 && (
                  <div style={{ padding: 12, borderRadius: 8, background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: couleurTheme, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Durée par bloc</div>
                    {blocs.map(b => { const bt = BLOCK_TYPES[b.type] || BLOCK_TYPES.texte; return (
                      <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                        <span style={{ color: bt.color }}>{bt.icon} {b.titre.length > 22 ? b.titre.slice(0, 22) + '…' : b.titre}</span>
                        <span style={{ color: '#9ca3af' }}>{b.dureeMin} min</span>
                      </div>
                    ); })}
                    <div style={{ borderTop: '1px solid #e0f2fe', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 12, color: couleurTheme }}>
                      <span>Total</span><span>{totalDuree} min</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* RIGHT - Blocs */}
            <div style={{ padding: 20, overflowY: 'auto' }}>
              {!previewMode && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Contenu du module ({blocs.length} bloc{blocs.length > 1 ? 's' : ''})</div>
                  <button onClick={() => { setBlocEnEdition(null); setBlocForm(BLOC_FORM_VIDE); setShowBlocForm(true); }} style={S.btn(couleurTheme, true)}>+ Ajouter un bloc</button>
                </div>
              )}

              {blocs.length === 0 && !previewMode && (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: '#f8fafc', borderRadius: 12, border: '2px dashed #e5e7eb', marginBottom: 16 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🧩</div>
                  <p style={{ color: '#9ca3af', fontSize: 13, margin: '0 0 4px' }}>Aucun bloc - ajoutez du contenu pour créer votre module.</p>
                  <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>Texte structuré, vidéo, quiz QCM, exercice, document, audio, lien…</p>
                </div>
              )}

              {/* Liste des blocs */}
              {blocs.map((b, i) => {
                const bt = BLOCK_TYPES[b.type] || BLOCK_TYPES.texte;
                return (
                  <div key={b.id} style={{ marginBottom: 12, borderRadius: 12, border: `1px solid ${bt.color}30`, background: '#fff', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', background: bt.color + '0a', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${bt.color}20` }}>
                      <span style={{ fontSize: 18 }}>{bt.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{b.titre}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{bt.label} · {b.dureeMin} min{b.questions?.length > 0 ? ` · ${b.questions.length} question(s)` : ''}{b.sections?.length > 0 ? ` · ${b.sections.length} section(s)` : ''}</div>
                      </div>
                      {!previewMode && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => moveBlocUp(i)} disabled={i === 0} style={{ padding: '3px 7px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: i === 0 ? 'not-allowed' : 'pointer', opacity: i === 0 ? 0.35 : 1, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>↑</button>
                          <button onClick={() => moveBlocDown(i)} disabled={i === blocs.length - 1} style={{ padding: '3px 7px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: i === blocs.length - 1 ? 'not-allowed' : 'pointer', opacity: i === blocs.length - 1 ? 0.35 : 1, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>↓</button>
                          <button
                            onClick={() => { setBlocEnEdition(b.id); setBlocForm({ ...b }); setShowBlocForm(true); }}
                            style={{ padding: '3px 7px', borderRadius: 6, border: `1px solid ${bt.color}50`, background: bt.color + '10', color: bt.color, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                          >✏️</button>
                          <button onClick={() => removeBloc(b.id)} style={{ padding: '3px 7px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff1f2', color: '#dc2626', cursor: 'pointer', fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>🗑️</button>
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '10px 14px', fontSize: 13 }}>
                      {b.type === 'texte' && (b.sections?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {b.sections.map(sec => (
                            <div key={sec.id}>
                              {sec.niveau === 'h1' && <h2 style={{ margin: '0 0 4px', fontSize: 16, color: '#0f172a' }}>{sec.titre}</h2>}
                              {sec.niveau === 'h2' && <h3 style={{ margin: '0 0 4px', fontSize: 14, color: '#374151', borderBottom: '1px solid #e5e7eb', paddingBottom: 4 }}>{sec.titre}</h3>}
                              {sec.niveau === 'h3' && <h4 style={{ margin: '0 0 3px', fontSize: 13, color: '#374151', fontStyle: 'italic' }}>{sec.titre}</h4>}
                              {(sec.niveau === 'p' || !['h1','h2','h3','ul','note'].includes(sec.niveau)) && <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 2 }}>{sec.titre}</div>}
                              {sec.niveau === 'ul'
                                ? <ul style={{ margin: 0, paddingLeft: 18 }}>{sec.contenu.split('\n').filter(l => l.trim()).map((l, li) => <li key={li} style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{l.replace(/^-\s*/, '')}</li>)}</ul>
                                : sec.niveau === 'note'
                                ? <div style={{ background: '#fffbeb', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#92400e', borderLeft: '3px solid #fbbf24' }}>{sec.contenu}</div>
                                : <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>{sec.contenu}</p>
                              }
                            </div>
                          ))}
                        </div>
                      ) : <p style={{ margin: 0, color: b.contenu ? '#374151' : '#9ca3af', fontStyle: b.contenu ? 'normal' : 'italic', lineHeight: 1.6 }}>{b.contenu || 'Pas de contenu textuel'}</p>)}
                      {/* APERÇUS RÉELS, et non plus des étiquettes : la vidéo se regarde,
                          l'audio s'écoute, le PDF se lit sur place. */}
                      {b.type === 'video'    && <ApercuVideoBloc bloc={b} />}
                      {b.type === 'audio'    && <ApercuAudioBloc bloc={b} />}
                      {b.type === 'document' && <ApercuDocumentBloc bloc={b} />}
                      {/* Le bloc image n'avait AUCUN rendu : rien ne s'affichait, et le
                          coach ne pouvait pas vérifier qu'il avait déposé le bon schéma. */}
                      {b.type === 'image' && (b.url
                        ? <img src={b.url} alt={b.titre || 'Illustration'} style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8, background: '#f1f5f9', display: 'block' }} />
                        : <div style={{ background: '#fdf2f8', borderRadius: 8, padding: 12, fontSize: 12, color: '#92400e' }}>⚠️ Aucune image déposée.</div>)}
                      {b.type === 'lien' && <div style={{ background: '#e0f2fe', borderRadius: 8, padding: 10 }}>🔗 <a href={b.url} target="_blank" rel="noreferrer" style={{ color: couleurTheme }}>{b.url || '-'}</a></div>}
                      {b.type === 'exercice' && (b.sections?.length > 0
                        ? <div style={{ background: '#fff7ed', borderRadius: 8, padding: 10, color: '#92400e' }}>{b.sections.map(sec => <div key={sec.id} style={{ marginBottom: 5 }}><strong>{sec.titre}</strong><pre style={{ fontFamily: 'inherit', margin: '3px 0 0', whiteSpace: 'pre-wrap', fontSize: 12 }}>{sec.contenu}</pre></div>)}</div>
                        : <div style={{ background: '#fff7ed', borderRadius: 8, padding: 10 }}><pre style={{ fontFamily: 'inherit', margin: 0, whiteSpace: 'pre-wrap', color: '#92400e' }}>{b.contenu || '-'}</pre></div>
                      )}
                      {b.type === 'quiz' && b.questions?.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {b.questions.map((q, qi) => {
                            const opts = (q.options || []).filter(Boolean);
                            return (
                            <div key={q.id} style={{ padding: '8px 12px', borderRadius: 8, background: opts.length ? '#f0f9ff' : '#EFF6FF', border: `1px solid ${opts.length ? '#bae6fd' : '#BFDBFE'}` }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 5 }}>Q{qi + 1}. {q.texte}</div>
                              {/* Sans option, la question est ouverte : on le dit, sinon
                                  l'aperçu montrait un titre suivi d'une ligne vide et le
                                  coach croyait sa question incomplète. */}
                              {opts.length === 0 ? (
                                <div style={{ fontSize: 11, color: '#1D4ED8', fontWeight: 600 }}>💬 Question ouverte — réponse en classe</div>
                              ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                  {opts.map((opt, oi) => (
                                    <span key={oi} style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, background: opt === q.correct ? '#dcfce7' : '#f3f4f6', color: opt === q.correct ? '#166534' : '#6b7280', fontWeight: opt === q.correct ? 700 : 400 }}>
                                      {opt === q.correct ? '✓ ' : ''}{opt}
                                    </span>
                                  ))}
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
              })}

              {/* ── Formulaire ajout bloc ── */}
              {showBlocForm && (
                <div style={{ marginTop: 16, padding: 18, borderRadius: 12, background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                      {blocEnEdition ? '✏️ Modifier le bloc' : 'Nouveau bloc de contenu'}
                    </div>
                    {blocEnEdition && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: BLOCK_TYPES[blocForm.type]?.color + '15', color: BLOCK_TYPES[blocForm.type]?.color, fontWeight: 700 }}>
                        {BLOCK_TYPES[blocForm.type]?.icon} {BLOCK_TYPES[blocForm.type]?.label}
                      </span>
                    )}
                  </div>

                  {/* Les blocs proposés dépendent du TYPE DE CONTENU, comme chez dash :
                      une capsule vidéo n'accueille pas un second bloc vidéo, et offrir
                      les neuf types partout laissait composer des contenus incohérents
                      que le lecteur de l'apprenant n'attendait pas. */}
                  <label style={LBL}>Type de bloc</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 7, marginBottom: 14 }}>
                    {Object.entries(BLOCK_TYPES)
                      .filter(([k]) => blocsAutorises(formSupport.type_contenu).includes(k))
                      .map(([k, v]) => (
                      <button key={k} onClick={() => setBlocForm(f => ({ ...BLOC_FORM_VIDE, titre: f.titre, dureeMin: f.dureeMin, type: k }))}
                        style={{ padding: '8px 6px', borderRadius: 8, border: `1.5px solid ${blocForm.type === k ? v.color : '#e5e7eb'}`, background: blocForm.type === k ? v.color + '12' : '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                        <span style={{ fontSize: 20 }}>{v.icon}</span>
                        <span style={{ fontSize: 10, fontWeight: blocForm.type === k ? 700 : 400, color: blocForm.type === k ? v.color : '#374151' }}>{v.label}</span>
                      </button>
                    ))}
                  </div>

                  <label style={LBL}>Titre du bloc *</label>
                  <input value={blocForm.titre} onChange={e => setBlocForm(f => ({ ...f, titre: e.target.value }))} style={{ ...INP, marginBottom: 10 }} placeholder="ex: Introduction - Les salutations" />

                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, marginBottom: 12 }}>
                    <div><label style={LBL}>Durée (min)</label><input type="number" min={1} value={blocForm.dureeMin} onChange={e => setBlocForm(f => ({ ...f, dureeMin: parseInt(e.target.value) || 1 }))} style={INP} /></div>
                  </div>

                  {/* Contenu selon le type */}
                  {(blocForm.type === 'texte' || blocForm.type === 'exercice') && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <label style={LBL}>Sections ({blocForm.sections.length})</label>
                        <button onClick={() => setBlocForm(f => ({ ...f, sections: [...f.sections, { id: Date.now(), niveau: 'h2', titre: `${['I','II','III','IV','V','VI','VII'][f.sections.length] || '§'}. Nouvelle section`, contenu: '' }] }))} style={S.btn(couleurTheme, true)}>+ Section</button>
                      </div>
                      {blocForm.sections.map((sec, si) => (
                        <div key={sec.id} style={{ borderRadius: 10, border: '1px solid #bae6fd', background: '#f8fbff', padding: 10, marginBottom: 8 }}>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                            <select value={sec.niveau} onChange={e => { const s = [...blocForm.sections]; s[si] = { ...s[si], niveau: e.target.value }; setBlocForm(f => ({ ...f, sections: s })); }} style={{ ...INP, width: 130, fontSize: 11 }}>
                              <option value="h1">Titre principal</option>
                              <option value="h2">Section</option>
                              <option value="h3">Sous-section</option>
                              <option value="p">Paragraphe</option>
                              <option value="ul">Liste à puces</option>
                              <option value="note">📌 Note</option>
                            </select>
                            <input value={sec.titre} onChange={e => { const s = [...blocForm.sections]; s[si] = { ...s[si], titre: e.target.value }; setBlocForm(f => ({ ...f, sections: s })); }} style={{ ...INP, flex: 1, fontWeight: 600 }} placeholder="Titre" />
                            <button onClick={() => setBlocForm(f => ({ ...f, sections: f.sections.filter((_, idx) => idx !== si) }))} style={{ padding: '3px 7px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff1f2', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontFamily: '"Plus Jakarta Sans", sans-serif', flexShrink: 0 }}>✕</button>
                          </div>
                          <textarea value={sec.contenu} onChange={e => { const s = [...blocForm.sections]; s[si] = { ...s[si], contenu: e.target.value }; setBlocForm(f => ({ ...f, sections: s })); }} style={{ ...INP, minHeight: 60, resize: 'vertical', fontFamily: '"Plus Jakarta Sans", sans-serif', width: '100%', boxSizing: 'border-box' }} placeholder={sec.niveau === 'ul' ? '- Point 1\n- Point 2\n- Point 3' : sec.niveau === 'note' ? 'Remarque importante…' : 'Contenu…'} />
                        </div>
                      ))}
                      {blocForm.sections.length === 0 && <div style={{ padding: 12, textAlign: 'center', color: '#9ca3af', fontSize: 12, border: '1px dashed #d1d5db', borderRadius: 8 }}>Cliquez "+ Section" pour structurer le contenu</div>}
                    </div>
                  )}

                  {/* ── VIDÉO ET AUDIO : DÉPOSER UN FICHIER, OU COLLER UN LIEN ──
                      Seul le lien était proposé. Un coach qui a enregistré sa capsule sur
                      son ordinateur n'avait donc aucun moyen de la publier : il lui
                      fallait d'abord la mettre en ligne ailleurs, sur un service qu'on ne
                      lui fournit pas. Les deux voies coexistent, comme chez dash — le lien
                      reste utile pour ce qui est déjà publié (YouTube, un podcast), et il
                      serait absurde de réimporter une vidéo qui existe en ligne.
                      Déposer un fichier efface le lien et réciproquement : un bloc ne
                      porte qu'une source, et en garder deux laisserait le lecteur de
                      l'apprenant choisir à notre place. */}
                  {(blocForm.type === 'video' || blocForm.type === 'audio') && (
                    <div style={{ marginBottom: 10 }}>
                      <label style={LBL}>{blocForm.type === 'video' ? 'Vidéo' : 'Audio'}</label>
                      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '16px', borderRadius: 10, border: `2px dashed ${blocForm.fichier ? COULEURS.succes : '#d1d5db'}`, background: blocForm.fichier ? '#f0fdf4' : '#f9fafb', cursor: blocUpload ? 'wait' : 'pointer' }}>
                        <span style={{ fontSize: 22 }}>{blocUpload ? '⏳' : blocForm.fichier ? '✅' : (blocForm.type === 'video' ? '🎬' : '🎧')}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: blocForm.fichier ? COULEURS.succes : '#6b7280' }}>
                          {blocUpload ? 'Envoi en cours…' : (blocForm.fichier || 'Cliquez pour choisir un fichier')}
                        </span>
                        {/* La limite est annoncée AVANT l'envoi : la découvrir après deux
                            minutes de téléversement raté est le pire moment. */}
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>
                          {blocForm.type === 'video' ? 'MP4, MOV, WEBM' : 'MP3, M4A, WAV, OGG'} · 20 Mo maximum
                        </span>
                        <input type="file" style={{ display: 'none' }} disabled={blocUpload}
                          accept={blocForm.type === 'video' ? 'video/*' : 'audio/*'}
                          onChange={async e => {
                            const file = e.target.files[0];
                            e.target.value = '';
                            if (!file) return;
                            if (file.size > 20 * 1024 * 1024) {
                              toast.error(`Ce fichier fait ${(file.size / 1048576).toFixed(1)} Mo, la limite est de 20 Mo. Mettez-le en ligne (YouTube, Vimeo…) et collez son lien ci-dessous.`, { duration: 8000 });
                              return;
                            }
                            const t = file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} Mo` : `${Math.round(file.size / 1024)} Ko`;
                            setBlocUpload(true);
                            try {
                              const fd = new FormData();
                              fd.append('file', file);
                              const tok = localStorage.getItem('admin_token') || '';
                              const up = await fetchUpload(`${_PROF_API}/api/upload/fichier-classe`, {
                                method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: fd,
                              });
                              const d = await up.json().catch(() => ({}));
                              if (!up.ok || !d.url) throw new Error(d.error || "Échec de l'envoi");
                              setBlocForm(f => ({ ...f, fichier: file.name, taille: t, url: d.url }));
                            } catch (err) {
                              toast.error(err.message || "Impossible d'envoyer ce fichier");
                            } finally { setBlocUpload(false); }
                          }} />
                      </label>
                      {blocForm.fichier && (
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>✅ {blocForm.fichier}{blocForm.taille ? ` · ${blocForm.taille}` : ''}</span>
                          <button onClick={() => setBlocForm(f => ({ ...f, fichier: '', taille: '', url: '' }))}
                            style={{ background: 'none', border: 'none', color: '#B91C1C', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
                            Retirer
                          </button>
                        </div>
                      )}
                      <label style={{ ...LBL, marginTop: 12 }}>…ou coller un lien</label>
                      <input type="url" value={blocForm.fichier ? '' : blocForm.url}
                        disabled={!!blocForm.fichier}
                        onChange={e => setBlocForm(f => ({ ...f, url: e.target.value, fichier: '', taille: '' }))}
                        style={{ ...INP, background: blocForm.fichier ? '#f3f4f6' : undefined, cursor: blocForm.fichier ? 'not-allowed' : undefined }}
                        placeholder={blocForm.type === 'video' ? 'https://youtube.com/…' : 'https://…'} />
                      {blocForm.fichier && (
                        <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 4 }}>
                          Retirez le fichier pour utiliser un lien à la place.
                        </div>
                      )}
                    </div>
                  )}

                  {blocForm.type === 'lien' && (
                    <div style={{ marginBottom: 10 }}>
                      <label style={LBL}>URL du lien externe</label>
                      <input type="url" value={blocForm.url} onChange={e => setBlocForm(f => ({ ...f, url: e.target.value }))} style={INP} placeholder="https://…" />
                    </div>
                  )}

                  {/* LE FICHIER EST RÉELLEMENT TÉLÉVERSÉ.
                      Le champ ne gardait que `file.name` et la taille : aucun envoi, donc
                      aucune URL. Le bloc Document était par construction vide côté
                      apprenant, et son bouton « Télécharger » ne pouvait mener nulle part.
                      Même route que les fichiers de classe (`/api/upload/fichier-classe`). */}
                  {(blocForm.type === 'document' || blocForm.type === 'image') && (
                    <div style={{ marginBottom: 10 }}>
                      <label style={LBL}>{blocForm.type === 'image' ? 'Image' : 'Fichier'}</label>
                      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '16px', borderRadius: 10, border: `2px dashed ${blocForm.url ? COULEURS.succes : '#d1d5db'}`, background: blocForm.url ? '#f0fdf4' : '#f9fafb', cursor: blocUpload ? 'wait' : 'pointer' }}>
                        <span style={{ fontSize: 22 }}>{blocUpload ? '⏳' : blocForm.url ? '✅' : (blocForm.type === 'image' ? '🖼️' : '📄')}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: blocForm.url ? COULEURS.succes : '#6b7280' }}>
                          {blocUpload ? 'Envoi en cours…' : (blocForm.fichier || 'Cliquez pour choisir')}
                        </span>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>
                          {blocForm.type === 'image' ? 'JPG, PNG, WEBP' : 'PDF, DOCX, XLSX, PPTX'}
                        </span>
                        <input type="file" style={{ display: 'none' }} disabled={blocUpload}
                          accept={blocForm.type === 'image' ? 'image/*' : '.pdf,.docx,.xlsx,.pptx'}
                          onChange={async e => {
                            const file = e.target.files[0];
                            e.target.value = '';
                            if (!file) return;
                            const t = file.size > 1048576 ? `${(file.size/1048576).toFixed(1)} Mo` : `${Math.round(file.size/1024)} Ko`;
                            setBlocUpload(true);
                            try {
                              const fd = new FormData();
                              fd.append('file', file);
                              const tok = localStorage.getItem('admin_token') || '';
                              const up = await fetchUpload(`${_PROF_API}/api/upload/fichier-classe`, {
                                method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: fd,
                              });
                              const d = await up.json().catch(() => ({}));
                              if (!up.ok || !d.url) throw new Error(d.error || "Échec de l'envoi");
                              setBlocForm(f => ({ ...f, fichier: file.name, taille: t, url: d.url }));
                            } catch (err) {
                              toast.error(err.message || "Impossible d'envoyer ce fichier");
                            } finally { setBlocUpload(false); }
                          }} />
                      </label>
                      {blocForm.url && (
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
                          ✅ Fichier envoyé — il sera accessible à vos apprenants.
                        </div>
                      )}
                    </div>
                  )}

                  {/* SPEAKING : une consigne, et c'est l'apprenant qui produit l'audio. */}
                  {blocForm.type === 'speaking' && (
                    <div style={{ marginBottom: 10 }}>
                      <label style={LBL}>Consigne d'expression orale</label>
                      <textarea value={blocForm.contenu} onChange={e => setBlocForm(f => ({ ...f, contenu: e.target.value }))}
                        style={{ ...INP, minHeight: 80, resize: 'vertical', width: '100%', boxSizing: 'border-box', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                        placeholder="Ex : présentez votre parcours professionnel en 2 minutes, en utilisant le passé composé." />
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
                        🎤 L'apprenant répondra en s'enregistrant depuis son espace.
                      </div>
                    </div>
                  )}

                  {blocForm.type === 'quiz' && (
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ ...LBL, marginBottom: 8 }}>Questions ({blocForm.questions.length})</label>
                      {/* LES OPTIONS SONT FACULTATIVES, et c'est tout l'enjeu.
                          Sans options, la question est OUVERTE — « What is the video
                          about ? » — et se lit chez l'apprenant comme un sujet à préparer,
                          dont la réponse se discute en classe. Exiger une bonne réponse
                          interdisait purement et simplement ce cas, qui est le plus courant
                          dans les devoirs de l'équipe : le coach ne pouvait poser que des
                          QCM auto-corrigés. Même règle que côté dash. */}
                      {blocForm.questions.map((q, qi) => {
                        const ouverte = !(q.options || []).filter(Boolean).length;
                        return (
                          <div key={q.id} style={{ padding: '8px 10px', borderRadius: 8, background: ouverte ? '#EFF6FF' : '#f0fdf4', border: `1px solid ${ouverte ? '#BFDBFE' : '#bbf7d0'}`, marginBottom: 6, fontSize: 12 }}>
                            <div style={{ fontWeight: 600 }}>Q{qi + 1}. {q.texte}</div>
                            <div style={{ color: ouverte ? '#1D4ED8' : '#6b7280', marginTop: 2 }}>
                              {ouverte ? '💬 Question ouverte — réponse en classe' : `✓ ${q.correct}`}
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #e5e7eb' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Nouvelle question</div>
                        <input value={blocQuizQ.texte} onChange={e => setBlocQuizQ(q => ({ ...q, texte: e.target.value }))} style={{ ...INP, marginBottom: 8 }} placeholder="Texte de la question (ex : What is the video about ?)" />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                          {[0,1,2,3].map(idx => (
                            <input key={idx} value={blocQuizQ.options[idx]} onChange={e => { const o = [...blocQuizQ.options]; o[idx] = e.target.value; setBlocQuizQ(q => ({ ...q, options: o })); }} style={INP} placeholder={`Option ${idx + 1} (facultatif)`} />
                          ))}
                        </div>
                        <select value={blocQuizQ.correct} onChange={e => setBlocQuizQ(q => ({ ...q, correct: e.target.value }))} style={{ ...INP, marginBottom: 8, width: '100%' }}>
                          <option value="">- Aucune : question ouverte -</option>
                          {blocQuizQ.options.filter(Boolean).map((o, idx) => <option key={idx} value={o}>{o}</option>)}
                        </select>
                        <div style={{ fontSize: 11, color: COULEURS.gris400, marginBottom: 8, lineHeight: 1.5 }}>
                          Laissez les options vides pour une question ouverte : l'apprenant la prépare, vous la corrigez en classe.
                        </div>
                        <button
                          onClick={() => {
                            if (!blocQuizQ.texte.trim()) { toast.error('Texte de la question requis'); return; }
                            const options = blocQuizQ.options.filter(o => String(o).trim());
                            /* Des options SANS bonne réponse ne forment ni un QCM ni une
                               question ouverte : l'apprenant choisirait sans que rien ne
                               puisse être corrigé. On tranche plutôt que de laisser passer. */
                            if (options.length && !blocQuizQ.correct) {
                              toast.error('Indiquez la bonne réponse, ou retirez les options pour une question ouverte');
                              return;
                            }
                            setBlocForm(f => ({ ...f, questions: [...f.questions, { ...blocQuizQ, options, correct: options.length ? blocQuizQ.correct : '', id: Date.now() }] }));
                            setBlocQuizQ({ texte: '', options: ['', '', '', ''], correct: '' });
                          }}
                          style={{ ...S.btn(couleurTheme, true), opacity: blocQuizQ.texte.trim() ? 1 : 0.5 }}>
                          + Ajouter cette question
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── UN BLOC MÉDIA SANS SOURCE NE PEUT PAS ÊTRE AJOUTÉ ──
                      Seul le titre était exigé. On pouvait donc déposer un bloc
                      « Document » intitulé « intro » sans aucun fichier : il partait en
                      base avec `url: ""`, s'affichait chez l'apprenant comme un document
                      vide, et le coach croyait l'avoir joint. Le manque se constatait des
                      semaines plus tard, côté apprenant. */}
                  {(() => {
                    const BESOIN_SOURCE = { video: 'une vidéo ou un lien', audio: 'un audio ou un lien', document: 'un fichier', image: 'une image', lien: 'une URL' };
                    const manque = BESOIN_SOURCE[blocForm.type] && !blocForm.url;
                    return manque ? (
                      <div style={{ marginTop: 12, padding: '9px 13px', borderRadius: 8, background: '#FFFBEB', border: '1px solid #FCD34D', fontSize: 12, color: '#92400E', fontWeight: 600 }}>
                        ⚠️ Ajoutez {BESOIN_SOURCE[blocForm.type]} — sans source, ce bloc s'afficherait vide chez vos apprenants.
                      </div>
                    ) : null;
                  })()}

                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button
                      onClick={() => {
                        if (!blocForm.titre) return;
                        if (blocEnEdition) {
                          setBlocs(p => p.map(b => b.id === blocEnEdition ? { ...blocForm, id: blocEnEdition } : b));
                          setBlocEnEdition(null);
                        } else {
                          setBlocs(p => [...p, { ...blocForm, id: Date.now() }]);
                        }
                        setBlocForm(BLOC_FORM_VIDE);
                        setShowBlocForm(false);
                      }}
                      disabled={!blocForm.titre || (['video', 'audio', 'document', 'image', 'lien'].includes(blocForm.type) && !blocForm.url)}
                      style={(() => {
                        const pret = blocForm.titre && !(['video', 'audio', 'document', 'image', 'lien'].includes(blocForm.type) && !blocForm.url);
                        return { ...S.btn(COULEURS.succes), opacity: pret ? 1 : 0.45, cursor: pret ? 'pointer' : 'not-allowed' };
                      })()}
                    >
                      {blocEnEdition ? '✓ Enregistrer les modifications' : '✓ Ajouter ce bloc'}
                    </button>
                    <button onClick={() => { setShowBlocForm(false); setBlocEnEdition(null); setBlocForm(BLOC_FORM_VIDE); }} style={S.btnGhost}>Annuler</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── ÉTAPE 2 : RÉCAPITULATIF ──
              Ce qu'on relit avant de diffuser. Publier notifie tous les apprenants de
              toutes les classes cochées, et rien ne rattrape un envoi : la portée réelle
              de l'action s'annonce donc avant qu'on la déclenche, pas après. */}
          {etapeContenu === 2 && (() => {
            const nomsClasses = classesChoisies.map(id => mesGroupes.find(g => g.id === id)?.nom).filter(Boolean);
            const nbApprenants = new Set(
              mesApprenants.filter(a => classesChoisies.includes(a.groupe_id)).map(a => a.id)
            ).size;
            const vaPublier = peutPublierRecap && formSupport.est_visible;
            const ligne = (lib, val) => (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                <span style={{ color: COULEURS.gris400 }}>{lib}</span>
                <span style={{ fontWeight: 700, color: COULEURS.navy, textAlign: 'right' }}>{val}</span>
              </div>
            );
            return (
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>

                <div style={{ padding: '14px 18px', borderRadius: 12, background: '#F8FAFC', border: '2px solid #E2E8F0' }}>
                  <div style={{ fontSize: 10, color: COULEURS.gris400, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 7 }}>DESTINATAIRES</div>
                  {nomsClasses.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#B45309', fontWeight: 700 }}>Aucune classe choisie — revenez à l'étape précédente.</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        {nomsClasses.map(n => (
                          <span key={n} style={{ fontSize: 12, fontWeight: 700, padding: '3px 11px', borderRadius: 999, background: couleurTheme + '15', color: couleurTheme }}>{n}</span>
                        ))}
                      </div>
                      <div style={{ fontSize: 12, color: COULEURS.gris600 }}>
                        {nbApprenants} apprenant{nbApprenants > 1 ? 's' : ''} concerné{nbApprenants > 1 ? 's' : ''}
                      </div>
                    </>
                  )}
                </div>

                <div>
                  {ligne('Titre', formSupport.titre || '—')}
                  {ligne('Type', `${TYPES_CONTENU.find(t => t.cle === formSupport.type_contenu)?.emoji || ''} ${COULEUR_TYPE_CONTENU[formSupport.type_contenu]?.lib || formSupport.type_contenu}`)}
                  {ligne('Module / Thème', formSupport.module || '— aucun —')}
                  {ligne('Semaine', `S${formSupport.semaine}`)}
                  {ligne('Blocs', `${blocs.length} · ${totalDuree} min`)}
                </div>

                {/* Le garde-fou s'explique ici plutôt que de refuser silencieusement :
                    un coach qui a coché « Publié » doit comprendre pourquoi son contenu
                    partira en brouillon. */}
                {blocs.length === 0 ? (
                  <div style={{ padding: '12px 16px', borderRadius: 10, background: '#FEF3C7', border: '1px solid #FCD34D', fontSize: 12.5, color: '#92400E', lineHeight: 1.6 }}>
                    <strong>Aucun bloc.</strong> Ce contenu sera enregistré en brouillon, même si « Publié »
                    est coché : un cours qui s'ouvre sur une page vide ne doit pas être annoncé aux apprenants.
                    Vous pourrez le publier dès qu'il aura au moins un bloc.
                  </div>
                ) : vaPublier ? (
                  <div style={{ padding: '12px 16px', borderRadius: 10, background: '#FFF7ED', border: '1px solid #FDBA74', fontSize: 12.5, color: '#9A3412', lineHeight: 1.6 }}>
                    <strong>Publication immédiate.</strong> Tous les apprenants {nomsClasses.length > 1 ? 'de ces classes' : 'de cette classe'} recevront
                    une notification dans leur espace. Cet envoi n'est pas annulable.
                  </div>
                ) : (
                  <div style={{ padding: '12px 16px', borderRadius: 10, background: '#F1F5F9', border: `1px solid ${COULEURS.gris200}`, fontSize: 12.5, color: '#475569', lineHeight: 1.6 }}>
                    <strong>Enregistré en brouillon.</strong> Personne n'est prévenu. Vous le publierez depuis la
                    médiathèque quand il sera prêt.
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Footer ── */}
          <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb', flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: COULEURS.gris400 }}>
              {valide ? '' : '* Titre et au moins une classe destinataire'}
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              {etapeContenu === 1 ? (
                <button onClick={() => fermerEditeur()} disabled={savingModule} style={S.btnGhost}>Annuler</button>
              ) : (
                <button onClick={() => setEtapeContenu(1)} disabled={savingModule} style={S.btnGhost}>← Retour</button>
              )}
              {etapeContenu === 1 ? (
                <button
                  disabled={!valide}
                  /* Un bloc à moitié saisi serait perdu au passage à l'étape suivante :
                     le formulaire de bloc n'est pas remonté dans `blocs` tant qu'on n'a
                     pas validé. Mieux vaut le dire que le laisser disparaître. */
                  onClick={() => { if (showBlocForm) { toast.error('Finalisez ou annulez le bloc en cours'); return; } setEtapeContenu(2); }}
                  style={{ ...S.btn(couleurTheme), opacity: valide ? 1 : 0.45, cursor: valide ? 'pointer' : 'not-allowed' }}>
                  Suivant →
                </button>
              ) : (
                <button disabled={!valide || savingModule} onClick={doSave}
                  style={{ ...S.btn(COULEURS.succes), opacity: (valide && !savingModule) ? 1 : 0.45, cursor: (valide && !savingModule) ? 'pointer' : 'not-allowed' }}>
                  {savingModule ? '⏳ Envoi en cours…'
                    : contenuEnEdition ? '✅ Enregistrer les modifications'
                    : (peutPublierRecap && formSupport.est_visible) ? '🚀 Créer et publier'
                    : '💾 Créer en brouillon'}
                </button>
              )}
            </div>
          </div>

        </div>
      </>
      );
    })()}

    {/* ══════════ MODAL VOIR CONTENU ══════════ */}
    {modalVoirContenu && (() => {
      const c      = modalVoirContenu;
      const ct     = COULEUR_TYPE_CONTENU[c.type_contenu] || { fond: COULEURS.gris100, texte: COULEURS.gris600, lib: c.type_contenu };
      const classesCibles = classesDuContenu(c).map(id => mesGroupes.find(g => g.id === id)).filter(Boolean);
      const blocs  = c.blocs || [];
      const datePub = c.date_publication
        ? new Date(c.date_publication).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
        : null;

      return (
      <>
        <div onClick={() => setModalVoirContenu(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.6)', zIndex: 1000, backdropFilter: 'blur(3px)' }} />
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '90vw', maxHeight: '92vh', background: '#fff', borderRadius: 14, boxShadow: '0 32px 80px rgba(0,0,0,0.3)', zIndex: 1001, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>

          {/* ── Header ── */}
          <div style={{ padding: '20px 24px', background: `linear-gradient(135deg, ${COULEURS.navy} 0%, #0E4F6B 100%)`, borderRadius: '14px 14px 0 0', flexShrink: 0, position: 'relative' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ padding: '3px 10px', borderRadius: 20, background: ct.fond, color: ct.texte, fontSize: 11, fontWeight: 700 }}>{ct.lib}</span>
              {c.module && <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 600 }}>📚 {c.module}</span>}
              {/* Toutes les classes visées : sur un contenu diffusé à plusieurs, n'en
                  montrer qu'une laissait croire à une portée bien plus étroite. */}
              {classesCibles.length === 0 ? (
                <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(253,186,116,0.25)', color: '#FDBA74', fontSize: 11, fontWeight: 700 }}>👥 Aucune classe</span>
              ) : classesCibles.map(g => (
                <span key={g.id} style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>👥 {g.nom}</span>
              ))}
              <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>Semaine {c.semaine}</span>
              <span style={{ padding: '3px 10px', borderRadius: 20, background: c.est_visible ? '#D1FAE5' : 'rgba(255,255,255,0.1)', color: c.est_visible ? '#065F46' : 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700 }}>
                {c.est_visible ? '📗 Publié' : '📝 Brouillon'}
              </span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.3, paddingRight: 32 }}>{c.titre}</div>
            {datePub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>Publié le {datePub}</div>}
            <button onClick={() => setModalVoirContenu(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 22, cursor: 'pointer', padding: 0 }}>✕</button>
          </div>

          {/* ── Body ── */}
          <div style={{ overflowY: 'auto', flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Description */}
            {c.description && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Description</div>
                <p style={{ fontSize: 14, color: COULEURS.gris600, lineHeight: 1.7, margin: 0 }}>{c.description}</p>
              </div>
            )}

            {/* Objectifs */}
            {c.objectifs && (
              <div style={{ padding: '14px 16px', borderRadius: 10, background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>🎯 Objectifs pédagogiques</div>
                {c.objectifs.split('\n').filter(Boolean).map((obj, i) => (
                  <div key={i} style={{ fontSize: 13, color: '#1E3A5F', marginBottom: 5, display: 'flex', gap: 8 }}>
                    <span style={{ color: couleurTheme, flexShrink: 0, fontWeight: 700 }}>-</span>
                    <span>{obj.replace(/^-\s*/, '')}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Méta : durée + statut interne */}
            {(c.dureeEstimee || c.statut) && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {c.dureeEstimee && (
                  <div style={{ padding: '8px 14px', borderRadius: 8, background: COULEURS.gris50, border: `1px solid ${COULEURS.gris200}`, fontSize: 12, color: COULEURS.gris600 }}>
                    ⏱ <strong>{c.dureeEstimee} min</strong> estimées
                  </div>
                )}
                {c.statut && (
                  <div style={{ padding: '8px 14px', borderRadius: 8, background: COULEURS.gris50, border: `1px solid ${COULEURS.gris200}`, fontSize: 12, color: COULEURS.gris600 }}>
                    {c.statut === 'publie' ? '✅' : c.statut === 'brouillon' ? '📝' : '📦'} <strong>{c.statut === 'publie' ? 'Publié' : c.statut === 'brouillon' ? 'Brouillon' : 'Archivé'}</strong>
                  </div>
                )}
                {c.version && (
                  <div style={{ padding: '8px 14px', borderRadius: 8, background: COULEURS.gris50, border: `1px solid ${COULEURS.gris200}`, fontSize: 12, color: COULEURS.gris600 }}>
                    v{c.version}
                  </div>
                )}
              </div>
            )}

            {/* Blocs de contenu */}
            {blocs.length > 0 ? (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                  Contenu du cours · {blocs.length} bloc{blocs.length > 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {blocs.map((b, bi) => {
                    const bt = BLOCK_TYPES[b.type] || { label: b.type, icon: '📄', color: COULEURS.gris600 };
                    return (
                      <div key={b.id || bi} style={{ borderRadius: 10, border: `1px solid ${COULEURS.gris200}`, overflow: 'hidden' }}>
                        {/* Bloc header */}
                        <div style={{ padding: '10px 14px', background: COULEURS.gris50, display: 'flex', alignItems: 'center', gap: 10, borderBottom: b.contenu || b.url || b.sections?.length > 0 ? `1px solid ${COULEURS.gris200}` : 'none' }}>
                          <span style={{ fontSize: 18 }}>{bt.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy }}>{b.titre || bt.label}</div>
                            {b.dureeMin > 0 && <div style={{ fontSize: 11, color: COULEURS.gris400 }}>⏱ {b.dureeMin} min</div>}
                          </div>
                          <span style={{ padding: '2px 8px', borderRadius: 20, background: `${bt.color}18`, color: bt.color, fontSize: 11, fontWeight: 700 }}>{bt.label}</span>
                        </div>
                        {/* Bloc body */}
                        {b.contenu && (
                          <div style={{ padding: '12px 14px', fontSize: 13, color: COULEURS.gris600, lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
                            {b.contenu}
                          </div>
                        )}
                        {b.url && (
                          <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, color: couleurTheme, wordBreak: 'break-all' }}>🔗 {b.url}</span>
                          </div>
                        )}
                        {b.fichier && (
                          <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, color: COULEURS.gris600 }}>📎 {b.fichier}</span>
                            {b.taille && <span style={{ fontSize: 11, color: COULEURS.gris400 }}>· {b.taille}</span>}
                          </div>
                        )}
                        {b.sections?.length > 0 && (
                          <div style={{ padding: '10px 14px' }}>
                            {b.sections.map((s, si) => (
                              <div key={si} style={{ fontSize: 12, color: COULEURS.gris600, marginBottom: 4, paddingLeft: 12, borderLeft: `3px solid ${bt.color}` }}>
                                {s.titre || s}
                              </div>
                            ))}
                          </div>
                        )}
                        {b.questions?.length > 0 && (
                          <div style={{ padding: '10px 14px' }}>
                            <div style={{ fontSize: 11, color: COULEURS.gris400, marginBottom: 6 }}>{b.questions.length} question{b.questions.length > 1 ? 's' : ''}</div>
                            {b.questions.map((q, qi) => (
                              <div key={qi} style={{ fontSize: 12, color: COULEURS.navy, marginBottom: 4 }}>
                                <strong>{qi + 1}.</strong> {q.texte}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '28px 16px', borderRadius: 12, border: `2px dashed ${COULEURS.gris200}`, color: COULEURS.gris400 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Aucun bloc de contenu</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Cliquez sur "Modifier" pour ajouter du contenu à ce module.</div>
              </div>
            )}

          </div>

            {/* ── Section Lu par les apprenants ── */}
            <div style={{ padding: '0 24px 16px', borderTop: `1px solid ${COULEURS.gris200}`, background: '#FAFAFA' }}>
            <div style={{ paddingTop: 16 }}>{(() => {
              /* `lus` porte désormais { lecteurs, en_attente, total } : on garde le nom
                 pour ne pas réécrire le bloc, et on expose les deux listes. */
              const suivi = lusParContenu[c.id];
              const lus = suivi?.lecteurs;
              const enAttente = suivi?.en_attente || [];
              return (
                <div style={{ borderRadius: 12, border: `1px solid ${COULEURS.gris200}`, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', background: '#F0FDF4', borderBottom: lus?.length ? `1px solid #A7F3D0` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>✅</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#065F46' }}>Lu par les apprenants</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#059669', background: '#D1FAE5', borderRadius: 20, padding: '2px 10px' }}>
                      {lus === undefined ? '…' : `${lus.length} / ${suivi?.total ?? lus.length}`}
                    </span>
                  </div>
                  {lus === undefined ? (
                    <div style={{ padding: '14px 16px', fontSize: 12, color: COULEURS.gris400 }}>Chargement…</div>
                  ) : lus.length === 0 ? (
                    <div style={{ padding: '14px 16px', fontSize: 12, color: COULEURS.gris400 }}>Aucun apprenant n'a encore marqué ce cours comme lu.</div>
                  ) : (
                    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {lus.map((l, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 8px', borderRadius: 8, background: i % 2 === 0 ? '#F9FAFB' : '#fff' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#065F46' }}>
                              {(l.prenom?.[0] || l.nom?.[0] || '?').toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: COULEURS.navy }}>{[l.prenom, l.nom].filter(Boolean).join(' ') || l.email}</div>
                              {l.email && <div style={{ fontSize: 11, color: COULEURS.gris400 }}>{l.email}</div>}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: COULEURS.gris400 }}>
                            {l.lu_le ? new Date(l.lu_le).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── CEUX QUI N'ONT PAS ENCORE OUVERT ──
                      C'est la liste qui sert : savoir qui relancer. Elle n'existait pas,
                      l'écran ne montrant que les lecteurs. Un apprenant sans compte ouvert
                      est signalé à part : ce n'est pas qu'il tarde, c'est qu'il ne peut
                      pas — et cela se règle par l'assistante, pas par un rappel. */}
                  {enAttente.length > 0 && (
                    <>
                      <div style={{ padding: '12px 16px', background: '#FFFBEB', borderTop: '1px solid #FDE68A', borderBottom: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 16 }}>⏳</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>Pas encore ouvert</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#B45309', background: '#FEF3C7', borderRadius: 20, padding: '2px 10px' }}>
                          {enAttente.length}
                        </span>
                      </div>
                      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {enAttente.map((a, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', borderRadius: 8, background: i % 2 === 0 ? '#F9FAFB' : '#fff' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#92400E' }}>
                                {(a.nom_complet?.[0] || '?').toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: COULEURS.navy }}>{a.nom_complet || a.email}</div>
                                {a.email && <div style={{ fontSize: 11, color: COULEURS.gris400 }}>{a.email}</div>}
                              </div>
                            </div>
                            {a.sans_compte && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#991B1B', background: '#FEE2E2', borderRadius: 20, padding: '2px 9px' }}>
                                sans accès
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}</div></div>

          {/* ── Footer ── */}
          <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb', flexShrink: 0 }}>
            <div style={{ fontSize: 12, color: COULEURS.gris400 }}>
              {blocs.length} bloc{blocs.length > 1 ? 's' : ''} · {blocs.reduce((s, b) => s + (b.dureeMin || 0), 0)} min estimées
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModalVoirContenu(null)} style={S.btnGhost}>Fermer</button>

              {/* PUBLIER / DÉPUBLIER ET SUPPRIMER — ils manquaient alors que les routes
                  les acceptaient déjà. Un contenu créé en brouillon n'avait aucun moyen
                  d'être publié depuis cet écran : le coach devait rouvrir l'éditeur
                  complet pour changer une case. Même geste que dans la médiathèque de
                  dash, confirmation comprise — publier alerte toute une classe,
                  supprimer est sans retour. */}
              {!c._lectureSeule && (
                <>
                  <button onClick={() => supprimerContenuMedia(c)} disabled={actionMedia === c.id}
                    style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid #FCA5A5', background: '#FFF5F5', color: '#991B1B', fontSize: 13, fontWeight: 700, cursor: actionMedia === c.id ? 'wait' : 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                    🗑 Supprimer
                  </button>
                  <button onClick={() => basculerPublicationMedia(c)} disabled={actionMedia === c.id}
                    style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: c.est_visible ? '#F59E0B' : COULEURS.succes, color: '#fff', fontSize: 13, fontWeight: 700, cursor: actionMedia === c.id ? 'wait' : 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                    {actionMedia === c.id ? '⏳…' : c.est_visible ? '🚫 Dépublier' : '✅ Publier'}
                  </button>
                </>
              )}

              {!c._lectureSeule && (
                <button
                  style={S.btn(couleurTheme)}
                  onClick={() => { setModalVoirContenu(null); ouvrirEditionContenu(c); }}
                >✏️ Modifier</button>
              )}
            </div>
          </div>

        </div>
      </>
      );
    })()}

    {/* LES DEUX MODALES DE CRÉATION ONT DISPARU, et c'est le but.
        · « Choix de module » servait à rattacher un nouveau support à un module
          existant ; plus rien ne l'ouvrait depuis que le bouton « Ajouter un
          support » a été retiré.
        · « Nouveau module » posait les paramètres puis enregistrait un contenu
          SANS AUCUN BLOC. Il fallait ensuite rouvrir l'éditeur pour y mettre
          quelque chose, si bien que la création se faisait en deux temps et
          laissait des coquilles vides en base.
        L'éditeur (`modalSupport`) fait désormais les deux : on y choisit ses
        classes, on y rédige, et un seul appel serveur part avec les blocs. */}

    {/* ══════════ MODAL CRÉER DEVOIR / ÉVALUATION / EXERCICE / EXAMEN ══════════ */}
    {modalCreer && (() => {
      const LBL = { fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 };

      const CATS = [
        { id: 'devoir',     icone: '📝', lib: 'Devoir',     desc: 'Fichier ou texte à soumettre', couleur: '#0891B2' },
        { id: 'exercice',   icone: '✏️', lib: 'Exercice',   desc: 'Fichier ou texte à soumettre', couleur: '#059669' },
        { id: 'evaluation', icone: '📊', lib: 'Évaluation', desc: 'Fichier ou texte à soumettre', couleur: '#7C3AED' },
      ];

      const FORMATS_EVAL = [
        { id: 'qcm',       icone: '📋', lib: 'QCM' },
        { id: 'listening', icone: '🎬', lib: 'Listening' },
        { id: 'audio',     icone: '🎧', lib: 'Audio' },
        { id: 'quiz',      icone: '🎯', lib: 'Quiz' },
        { id: 'speaking',  icone: '🎤', lib: 'Speaking' },
      ];

      const TYPES_RENDU = [
        { id: 'fichier',    lib: '📎 Fichier' },
        { id: 'texte',      lib: '📝 Texte en ligne' },
      ];

      const catActive = CATS.find(c => c.id === creerForm.categorie) || CATS[0];
      // Les 3 catégories partagent le même contenu (fichier ou, en rendu "texte", des blocs
      // QCM/Listening/Audio/Quiz/Speaking combinables librement) - seule la catégorie change
      // (libellé + bonus de gamification côté serveur, réservé aux devoirs).
      const avecFichier = creerForm.type === 'fichier';
      const avecFormat  = creerForm.type === 'texte';

      const titreDynamique = {
        devoir:     '📝 Créer un devoir',
        exercice:   '✏️ Créer un exercice',
        evaluation: '📊 Créer une évaluation',
      }[creerForm.categorie] || '+ Créer';

      return (
        <>
          {/* Overlay */}
          <div
            onClick={() => { setModalCreer(false); setEditDevoirId(null); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, backdropFilter: 'blur(2px)' }}
          />

          {/* Panneau */}
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            width: '90vw', maxWidth: '90vw', height: '90vh', maxHeight: '90vh',
            background: COULEURS.blanc, borderRadius: 20,
            boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
            zIndex: 1001, display: 'flex', flexDirection: 'column',
            overflow: 'hidden', fontFamily: '"Plus Jakarta Sans", sans-serif',
          }}>

            {/* En-tête */}
            <div style={{ background: `linear-gradient(135deg, ${COULEURS.navy} 0%, #0E4F6B 100%)`, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{editDevoirId ? `✏️ Modifier le ${creerForm.categorie}` : titreDynamique}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{editDevoirId ? 'Modifiez les informations du brouillon' : 'Assignez un travail à vos apprenants'}</div>
              </div>
              <button
                onClick={() => { setModalCreer(false); setEditDevoirId(null); }}
                style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, width: 34, height: 34, color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >✕</button>
            </div>

            {/* Corps scrollable */}
            <div style={{ overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>

              {/* Sélecteur catégorie */}
              <div>
                <label style={LBL}>Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                  {CATS.map(cat => {
                    const actif = creerForm.categorie === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setCreerForm(p => ({ ...p, categorie: cat.id }))}
                        style={{
                          border: `2px solid ${actif ? cat.couleur : COULEURS.gris200}`,
                          borderRadius: 12, padding: '10px 8px', background: actif ? cat.couleur + '12' : COULEURS.blanc,
                          cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                          fontFamily: '"Plus Jakarta Sans", sans-serif',
                        }}
                      >
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{cat.icone}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: actif ? cat.couleur : COULEURS.navy }}>{cat.lib}</div>
                        <div style={{ fontSize: 10, color: COULEURS.gris400, marginTop: 2, lineHeight: 1.3 }}>{cat.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>


              {/* Champs communs - grille 2 colonnes */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                {/* Titre - pleine largeur */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={LBL}>Titre *</label>
                  <input
                    style={{ ...S.input, fontSize: 14 }}
                    placeholder={creerForm.categorie === 'devoir' ? 'Ex : Devoir maison - Present Perfect' : creerForm.categorie === 'exercice' ? 'Ex : Exercice de prononciation' : 'Ex : Évaluation Module 3 - Vocabulaire'}
                    value={creerForm.titre}
                    onChange={e => setCreerForm(p => ({ ...p, titre: e.target.value }))}
                  />
                </div>

                {/* ── CLASSES DESTINATAIRES ──
                    Une liste déroulante ne laissait choisir QU'UNE classe. Un coach qui
                    donne le même devoir à son A2 du matin et à celui du soir devait le
                    créer deux fois : deux consignes à écrire, deux fichiers à joindre, et
                    deux corrections le jour où une faute s'y glisse. On coche autant de
                    classes qu'on veut ; la consigne reste unique.
                    Chaque carte porte son effectif, parce que c'est ce qui dit combien de
                    copies vont arriver à corriger. */}
                <div>
                  <label style={LBL}>
                    Classes destinataires *
                    {(creerForm.groupe_ids || []).length > 0 && (
                      <span style={{ color: catActive.couleur, marginLeft: 6 }}>
                        ({creerForm.groupe_ids.length} classe{creerForm.groupe_ids.length > 1 ? 's' : ''} ·{' '}
                        {mesGroupes.filter(g => creerForm.groupe_ids.includes(g.id)).reduce((t, g) => t + (g.nb_apprenants ?? 0), 0)} apprenant(s))
                      </span>
                    )}
                  </label>
                  {mesGroupes.filter(g => g.est_actif && !g._delegation).length === 0 ? (
                    <div style={{ fontSize: 12.5, color: COULEURS.gris400, padding: '8px 0' }}>Aucune classe active ne vous est assignée.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {mesGroupes.filter(g => g.est_actif && !g._delegation).map(g => {
                        const choisi = (creerForm.groupe_ids || []).includes(g.id);
                        return (
                          <div key={g.id}
                            onClick={() => setCreerForm(p => {
                              const ids = p.groupe_ids || [];
                              const suivants = ids.includes(g.id) ? ids.filter(x => x !== g.id) : [...ids, g.id];
                              /* `groupe_id` suit la première classe cochée : plusieurs
                                 écrans la lisent encore (aperçu, filtres). */
                              return { ...p, groupe_ids: suivants, groupe_id: suivants[0] || '' };
                            })}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                              border: `2px solid ${choisi ? catActive.couleur : COULEURS.gris200}`,
                              background: choisi ? catActive.couleur + '10' : COULEURS.blanc, transition: 'all .12s' }}>
                            <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              border: `2px solid ${choisi ? catActive.couleur : COULEURS.gris200}`, background: choisi ? catActive.couleur : COULEURS.blanc,
                              color: '#fff', fontSize: 12, fontWeight: 800 }}>{choisi ? '✓' : ''}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: choisi ? catActive.couleur : COULEURS.navy }}>👥 {g.nom}</span>
                            {g.niveau && <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 20, background: '#E0F2FE', color: '#0E7490', fontWeight: 700 }}>🎯 {g.niveau}</span>}
                            <span style={{ fontSize: 12, color: COULEURS.gris600, marginLeft: 'auto' }}>
                              👩‍🎓 {g.nb_apprenants ?? 0} apprenant{(g.nb_apprenants ?? 0) > 1 ? 's' : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 6, lineHeight: 1.5 }}>
                    Une seule consigne : la corriger plus tard la corrigera pour toutes ces classes.
                    Chaque apprenant rend sa propre copie.
                  </div>
                </div>

                {/* Date limite */}
                <div>
                  <label style={LBL}>Date limite</label>
                  <input
                    type="date"
                    style={S.input}
                    value={creerForm.date_limite}
                    onChange={e => setCreerForm(p => ({ ...p, date_limite: e.target.value }))}
                  />
                </div>

                {/* Heure limite */}
                <div>
                  <label style={LBL}>Heure limite</label>
                  <input type="time" style={S.input} value={creerForm.heure_limite}
                    onChange={e => setCreerForm(p => ({ ...p, heure_limite: e.target.value }))} />
                </div>

                {/* ── PROGRAMMATION DE L'OUVERTURE, POUR TOUS LES TYPES DE RENDU ──
                    Ces deux champs n'apparaissaient que sur un rendu « texte » ou
                    « les deux ». Un devoir à rendre en FICHIER ne pouvait donc pas être
                    programmé : il s'ouvrait dès sa publication, alors que c'est justement
                    le cas où l'on veut préparer le sujet à l'avance et le libérer au bon
                    moment. Rien côté serveur ne justifiait cette restriction —
                    `date_ouverture` et `heure_ouverture` sont enregistrées quel que soit
                    le type, et `devoirOuvert()` les applique de la même façon.
                    Même comportement que dash, où le champ est commun aux trois types. */}
                <div>
                  <label style={LBL}>📅 Date d'ouverture</label>
                  <input type="date" style={S.input} value={creerForm.date_ouverture}
                    onChange={e => setCreerForm(p => ({ ...p, date_ouverture: e.target.value }))} />
                </div>
                <div>
                  <label style={LBL}>🕐 Heure d'ouverture</label>
                  <input type="time" style={S.input} value={creerForm.heure_ouverture}
                    onChange={e => setCreerForm(p => ({ ...p, heure_ouverture: e.target.value }))} />
                </div>

                {/* Durée - seulement pour evaluation */}
                {creerForm.categorie === 'evaluation' && (
                  <div>
                    <label style={LBL}>Durée (minutes)</label>
                    <input
                      type="number" min={1}
                      style={S.input}
                      value={creerForm.dureeMin}
                      onChange={e => setCreerForm(p => ({ ...p, dureeMin: parseInt(e.target.value) || 60 }))}
                    />
                  </div>
                )}

                {/* ── MINUTEUR DE COMPOSITION ──
                    La date limite borne le DÉPÔT, pas la DURÉE de l'épreuve : sans
                    minuteur, une rédaction « à rendre pour le 20 » se travaille six jours,
                    dictionnaire ouvert. Le chrono démarre à la première ouverture par
                    l'apprenant, pas à la publication — sinon il serait écoulé avant d'avoir
                    lu le sujet.
                    Réservé au rendu EN TEXTE : un fichier se prépare hors ligne, un chrono
                    n'y aurait pas le même sens.
                    « Aucun » par défaut : c'est une option, pas une règle imposée. */}
                {creerForm.type === 'texte' && (
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={LBL}>⏱ Temps de composition</label>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                      {[
                        { v: 0,   lib: 'Aucun' },
                        { v: 30,  lib: '30 min' },
                        { v: 60,  lib: '1 h' },
                        { v: 120, lib: '2 h' },
                        { v: 180, lib: '3 h' },
                      ].map(o => {
                        const actif = (creerForm.dureeComposition || 0) === o.v;
                        return (
                          <button key={o.v} onClick={() => setCreerForm(p => ({ ...p, dureeComposition: o.v }))}
                            style={{ padding: '7px 16px', borderRadius: 99, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                              border: `2px solid ${actif ? catActive.couleur : COULEURS.gris200}`,
                              background: actif ? catActive.couleur + '14' : COULEURS.blanc,
                              color: actif ? catActive.couleur : COULEURS.gris600, fontFamily: 'inherit' }}>
                            {o.lib}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 6, lineHeight: 1.5 }}>
                      {creerForm.dureeComposition > 0
                        ? `Le compte à rebours démarre quand l'apprenant ouvre le devoir. À zéro, sa copie vous est envoyée en l'état — ce qui n'a pas été fait vaut zéro, et vous tranchez la note finale.`
                        : `Sans minuteur, l'apprenant dispose de tout le temps jusqu'à la date limite.`}
                    </div>
                  </div>
                )}

              </div>

              {/* ── Section commune : contenu (devoir / exercice / évaluation) ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* Instructions - communes aux 3 catégories */}
                  <div>
                    <label style={LBL}>Instructions</label>
                    <textarea
                      style={{ ...S.input, minHeight: 90, resize: 'vertical', lineHeight: 1.6 }}
                      placeholder={creerForm.categorie === 'devoir' ? 'Décrivez ce que les élèves doivent faire…' : creerForm.categorie === 'exercice' ? 'Décrivez l\'activité à réaliser en classe ou en autonomie…' : 'Décrivez ce qui est attendu des élèves…'}
                      value={creerForm.instructions}
                      onChange={e => setCreerForm(p => ({ ...p, instructions: e.target.value }))}
                    />
                  </div>

                  {/* Type de rendu - communes aux 3 catégories */}
                  <div>
                    <label style={LBL}>Type de rendu</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {TYPES_RENDU.map(t => {
                        const actif = creerForm.type === t.id;
                        return (
                          <button
                            key={t.id}
                            onClick={() => setCreerForm(p => ({ ...p, type: t.id }))}
                            style={{
                              flex: 1, padding: '9px 10px', borderRadius: 8, border: `2px solid ${actif ? couleurTheme : COULEURS.gris200}`,
                              background: actif ? couleurTheme + '12' : COULEURS.blanc, color: actif ? couleurTheme : COULEURS.gris600,
                              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif',
                            }}
                          >{t.lib}</button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Rendu fichier : joindre un fichier de départ (optionnel) */}
                  {avecFichier && (
                    <div>
                      <label style={LBL}>Fichier à joindre (optionnel)</label>
                      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `2px dashed ${creerForm.ressourceUrl ? couleurTheme : COULEURS.gris300}`, borderRadius: 12, padding: '18px 14px', cursor: uploadExerciceEnCours ? 'wait' : 'pointer', background: creerForm.ressourceUrl ? `${couleurTheme}10` : COULEURS.gris50, gap: 8 }}>
                        <span style={{ fontSize: 24 }}>{uploadExerciceEnCours ? '⏳' : creerForm.ressourceUrl ? '✅' : '📁'}</span>
                        <span style={{ fontSize: 12.5, color: creerForm.ressourceUrl ? couleurTheme : COULEURS.gris600, fontWeight: 600, textAlign: 'center', wordBreak: 'break-all' }}>
                          {uploadExerciceEnCours ? 'Envoi en cours…' : creerForm.ressourceUrl ? (creerForm.ressourceUrl.split('/').pop() || 'Fichier joint') : 'Cliquez pour joindre un fichier'}
                        </span>
                        <input type="file" style={{ display: 'none' }} disabled={uploadExerciceEnCours}
                          onChange={e => e.target.files[0] && uploaderExerciceDevoir(e.target.files[0])} />
                      </label>
                      {creerForm.ressourceUrl && (
                        <button type="button" onClick={() => setCreerForm(p => ({ ...p, ressourceUrl: '' }))}
                          style={{ marginTop: 6, background: 'none', border: 'none', color: '#DC2626', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
                        {creerForm.blocs.map((b, bi) => {
                          const fmt = FORMATS_EVAL.find(f => f.id === b.type) || FORMATS_EVAL[0];
                          const isEditing = blocEditing === b.id;
                          const avecQuestions = ['qcm', 'listening', 'audio', 'quiz'].includes(b.type);
                          return (
                            <div key={b.id} style={{ border: `1.5px solid ${isEditing ? catActive.couleur : COULEURS.gris200}`, borderRadius: 12, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: isEditing ? catActive.couleur + '10' : COULEURS.gris50 }}>
                                <span style={{ fontSize: 16 }}>{fmt.icone}</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: COULEURS.navy }}>Bloc {bi + 1} · {fmt.lib}</span>
                                {avecQuestions && <span style={{ fontSize: 11, color: COULEURS.gris400 }}>({(b.questions||[]).length} question{(b.questions||[]).length > 1 ? 's' : ''})</span>}
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                                  <button onClick={() => setBlocEditing(isEditing ? null : b.id)}
                                    style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${COULEURS.gris200}`, background: '#fff', fontSize: 11, fontWeight: 600, color: COULEURS.gris600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    {isEditing ? 'Réduire' : '✏️ Éditer'}
                                  </button>
                                  <button onClick={() => removeBloc(b.id)}
                                    style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#FEE2E2', fontSize: 11, fontWeight: 600, color: '#991B1B', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    ✕ Retirer
                                  </button>
                                </div>
                              </div>

                              {isEditing && (
                                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                  {b.type === 'speaking' && (
                                    <div>
                                      <label style={LBL}>Consigne speaking</label>
                                      <textarea style={{ ...S.input, minHeight: 70, resize: 'vertical', lineHeight: 1.6 }}
                                        placeholder="Décrivez la tâche orale demandée à l'apprenant…"
                                        value={b.instructions} onChange={e => updateBloc(b.id, { instructions: e.target.value })} />
                                    </div>
                                  )}

                                  {['listening', 'audio', 'speaking'].includes(b.type) && (
                                    <div>
                                      <label style={LBL}>
                                        {b.type === 'listening' ? 'Vidéo à regarder avant de répondre' : b.type === 'audio' ? 'Audio à écouter avant de répondre' : 'Support audio/vidéo (optionnel - exemple ou consigne enregistrée)'}
                                      </label>
                                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <input style={{ ...S.input, flex: 1 }} placeholder={b.type === 'listening' ? 'https://youtube.com/…' : 'https://…/audio.mp3'}
                                          value={b.ressourceUrl} onChange={e => updateBloc(b.id, { ressourceUrl: e.target.value })} />
                                        <label style={{ padding: '9px 14px', borderRadius: 8, border: `1.5px dashed ${COULEURS.gris300}`, background: '#fff', fontSize: 12, fontWeight: 600, color: COULEURS.gris600, cursor: uploadBlocEnCours === b.id ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                                          {uploadBlocEnCours === b.id ? '⏳ Envoi…' : '📁 Téléverser'}
                                          <input type="file" accept="audio/*,video/*" style={{ display: 'none' }} disabled={uploadBlocEnCours === b.id}
                                            onChange={e => e.target.files[0] && uploaderRessourceBloc(b.id, e.target.files[0])} />
                                        </label>
                                      </div>
                                      <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 4 }}>Colle un lien (YouTube, etc.) ou téléverse directement un fichier audio/vidéo.</div>
                                    </div>
                                  )}

                                  {b.type === 'speaking' && (
                                    <div>
                                      <label style={LBL}>Conseil / tip pour l'apprenant</label>
                                      <input style={S.input} placeholder="Ex : Parlez pendant au moins 2 minutes…"
                                        value={b.conseil || ''} onChange={e => updateBloc(b.id, { conseil: e.target.value })} />
                                    </div>
                                  )}

                                  {avecQuestions && (
                                    <div style={{ background: COULEURS.gris50, borderRadius: 10, padding: 14, border: `1px solid ${COULEURS.gris200}` }}>
                                      {(b.questions || []).map((q, qi) => (
                                        <div key={q.id || qi} style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', border: `1px solid ${COULEURS.gris200}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                                          <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: COULEURS.navy, marginBottom: 4 }}>Q{qi + 1}. {q.texte}</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                              {(q.options || []).map((opt, oi) => (
                                                <span key={oi} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: opt === q.correct ? '#D1FAE5' : COULEURS.gris100, color: opt === q.correct ? '#065F46' : COULEURS.gris600, fontWeight: opt === q.correct ? 700 : 400 }}>
                                                  {opt === q.correct ? '✓ ' : ''}{opt}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                          <button onClick={() => removeBlocQuestion(b.id, qi)}
                                            style={{ background: '#FEE2E2', border: 'none', borderRadius: 6, padding: '4px 8px', color: '#991B1B', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>✕</button>
                                        </div>
                                      ))}
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                                        <input style={{ ...S.input, fontSize: 13 }} placeholder="Texte de la question…"
                                          value={creerQForm.texte} onChange={e => setCreerQForm(p => ({ ...p, texte: e.target.value }))} />
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                          {creerQForm.options.map((opt, i) => (
                                            <input key={i} style={{ ...S.input, fontSize: 12 }} placeholder={`Option ${String.fromCharCode(65 + i)}…`}
                                              value={opt} onChange={e => { const o = [...creerQForm.options]; o[i] = e.target.value; setCreerQForm(p => ({ ...p, options: o })); }} />
                                          ))}
                                        </div>
                                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                          <div style={{ flex: 1 }}>
                                            <label style={{ ...LBL, marginBottom: 4 }}>Bonne réponse</label>
                                            <select style={{ ...S.select, width: '100%' }} value={creerQForm.correct} onChange={e => setCreerQForm(p => ({ ...p, correct: e.target.value }))}>
                                              <option value="">- Choisir -</option>
                                              {creerQForm.options.filter(Boolean).map((o, i) => <option key={i} value={o}>{String.fromCharCode(65 + i)}. {o}</option>)}
                                            </select>
                                          </div>
                                          <button disabled={!creerQForm.texte || !creerQForm.correct} onClick={addBlocQuestion}
                                            style={{ ...S.btn('#7C3AED'), marginTop: 18, opacity: (!creerQForm.texte || !creerQForm.correct) ? 0.5 : 1, cursor: (!creerQForm.texte || !creerQForm.correct) ? 'not-allowed' : 'pointer' }}>
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
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {FORMATS_EVAL.map(f => (
                          <button key={f.id} onClick={() => addBloc(f.id)}
                            style={{ padding: '7px 12px', borderRadius: 8, border: `1.5px dashed ${COULEURS.gris300}`, background: '#fff', color: COULEURS.gris600, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {f.icone} + {f.lib}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

              </div>

            </div>

            {/* Pied */}
            <div style={{ padding: '16px 24px', borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
              <button disabled={savingDevoir} onClick={() => { setModalCreer(false); setEditDevoirId(null); }} style={S.btnGhost}>Annuler</button>
              <button
                disabled={!creerForm.titre || !(creerForm.groupe_ids || []).length || savingDevoir}
                onClick={sauvegarderDevoir}
                style={{ ...S.btn(catActive.couleur), opacity: (!creerForm.titre || !(creerForm.groupe_ids || []).length || savingDevoir) ? 0.5 : 1, cursor: (!creerForm.titre || !(creerForm.groupe_ids || []).length || savingDevoir) ? 'not-allowed' : 'pointer' }}
              >
                {savingDevoir ? '⏳ Envoi en cours…' : (editDevoirId ? '💾 Enregistrer les modifications' : `${catActive.icone} Créer ${catActive.lib.toLowerCase()}`)}
              </button>
            </div>

          </div>
        </>
      );
    })()}

    {/* ══════════ MODAL CONFIRMATION DÉPUBLICATION ══════════ */}
    {confirmDepublier && (
      <>
        <div onClick={() => setConfirmDepublier(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:2000 }} />
        <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'min(460px,92vw)', background:'#fff', borderRadius:18, zIndex:2001, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.2)', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
          {/* Header */}
          <div style={{ background:'linear-gradient(135deg,#92400E,#B45309)', padding:'18px 22px', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>⏸ Dépublier ce devoir ?</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', marginTop:3 }}>{confirmDepublier.titre}</div>
            </div>
            <button onClick={() => setConfirmDepublier(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
          </div>
          {/* Corps */}
          <div style={{ padding:'22px 24px' }}>
            <div style={{ background:'#FEF9C3', border:'1px solid #FDE68A', borderRadius:10, padding:'14px 16px', marginBottom:20 }}>
              <div style={{ fontSize:13, color:'#92400E', lineHeight:1.6 }}>
                <strong>Ce devoir repassera en brouillon</strong> et ne sera plus visible par les apprenants.<br />
                Les soumissions déjà reçues resteront bloquées si vous republier.
              </div>
            </div>
            <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#166534' }}>
              ✅ Cette action est autorisée uniquement si <strong>aucun apprenant n'a encore rendu</strong> ce devoir.
            </div>
          </div>
          {/* Footer */}
          <div style={{ padding:'14px 24px 20px', display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button onClick={() => setConfirmDepublier(null)} style={{ padding:'10px 22px', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
              Annuler
            </button>
            <button onClick={confirmerDepublication} disabled={devoirActionEnCours} style={{ padding:'10px 22px', borderRadius:9, border:'none', background:'#92400E', color:'#fff', fontSize:13, fontWeight:700, cursor: devoirActionEnCours ? 'not-allowed' : 'pointer', opacity: devoirActionEnCours ? 0.6 : 1, fontFamily:'inherit' }}>
              {devoirActionEnCours ? '⏳ …' : '⏸ Confirmer la dépublication'}
            </button>
          </div>
        </div>
      </>
    )}

    {/* ══════════ MODAL RÉCEPTION - rendus d'un devoir ══════════ */}
    {modalReception && (() => {
      const d = devoirsReels.find(x => x.id === modalReception);
      if (!d) return null;
      const rendus = devoirRendusMap[modalReception] || [];
      const STATUT_R = {
        a_rendre:  { fond:'#FEF9C3', texte:'#92400E', lib:'En attente', ic:'⏳' },
        rendu:     { fond:'#D1FAE5', texte:'#065F46', lib:'Rendu',      ic:'✅' },
        corrige:   { fond:'#DBEAFE', texte:'#1D4ED8', lib:'Corrigé',    ic:'🏅' },
        en_retard: { fond:'#FEE2E2', texte:'#991B1B', lib:'Non rendu',  ic:'🔴' },
      };
      const rendusAffiches = receptModalStatut === 'tous' ? rendus : rendus.filter(r => r.statut === receptModalStatut);
      const nbACorr   = rendus.filter(r => r.statut==='rendu').length;
      const nbCorr    = rendus.filter(r => r.statut==='corrige').length;
      const nbNonR    = rendus.filter(r => r.statut==='en_retard').length;
      const nbTotal   = rendus.length;
      // Apprenants sans note assignée (soumis non corrigé + pas encore soumis + en retard sans note)
      const sansNote  = rendus.filter(r => r.note === null || r.note === undefined);
      const toutFini  = rendus.length > 0 && sansNote.length === 0;

      async function validerDefinitivement() {
        // Tous les apprenants ont déjà une note (vérifiée avant d'arriver ici)
        chargerRendusPourDevoir(d.id, true);
      }

      function demanderValidation() {
        // Bloquer si au moins un apprenant n'a pas encore de note
        if (sansNote.length > 0) {
          const nbRendusNonNotes = rendus.filter(r => r.statut === 'rendu').length;
          const nbARendre        = rendus.filter(r => r.statut === 'a_rendre').length;
          const nbEnRetardSansN  = rendus.filter(r => r.statut === 'en_retard' && (r.note === null || r.note === undefined)).length;
          const parties = [];
          if (nbRendusNonNotes > 0) parties.push(`${nbRendusNonNotes} apprenant${nbRendusNonNotes > 1 ? 's ont' : ' a'} rendu le devoir sans être encore noté${nbRendusNonNotes > 1 ? 's' : ''}`);
          if (nbARendre > 0)        parties.push(`${nbARendre} apprenant${nbARendre > 1 ? 's n\'ont' : ' n\'a'} pas encore soumis et n'ont pas de note`);
          if (nbEnRetardSansN > 0)  parties.push(`${nbEnRetardSansN} apprenant${nbEnRetardSansN > 1 ? 's en retard n\'ont' : ' en retard n\'a'} pas encore de note attribuée`);
          setErreurModal({
            titre: 'Notes incomplètes',
            message: `Veuillez attribuer une note à tous les apprenants avant de valider définitivement.\n\n${parties.join('\n')}`,
          });
          return;
        }
        // Tous ont une note → confirmation obligatoire
        setConfirmGeneral({
          titre: 'Valider définitivement les notes ?',
          message: 'Les notes de ce devoir seront figées définitivement. Cette action confirme que toutes les notes ont été attribuées.',
          details: `${nbCorr} corrigé${nbCorr > 1 ? 's' : ''} · ${nbNonR} non rendu${nbNonR > 1 ? 's' : ''} · ${nbTotal} apprenant${nbTotal > 1 ? 's' : ''} au total`,
          icone: '🏅',
          couleur: '#059669',
          boutonLabel: '🏅 Valider définitivement',
          onConfirm: validerDefinitivement,
        });
      }

      return (
        <>
          <div onClick={() => setModalReception(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1500, backdropFilter:'blur(2px)' }} />
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'90vw', height:'90vh', background:COULEURS.blanc, borderRadius:20, zIndex:1501, overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.3)', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>

            {/* Header */}
            <div style={{ background:`linear-gradient(135deg,${couleurTheme},${couleurThemeFonce})`, padding:'20px 24px', flexShrink:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>📥 {d.titre}</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', marginTop:4 }}>
                    {d.classe_nom} · {d.type_rendu==='fichier'?'PDF':d.type_rendu==='les_deux'?'Fichier + Texte':'Composition'} · Limite : {fmtDate(d.date_limite)}
                  </div>
                </div>
                <button onClick={() => setModalReception(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:34, height:34, color:'#fff', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
              </div>
              {/* KPIs */}
              <div style={{ display:'flex', gap:20, marginTop:16, flexWrap:'wrap' }}>
                {[
                  { v:nbTotal,  l:'Total', c:'rgba(255,255,255,0.9)' },
                  { v:nbACorr,  l:'À corriger', c:nbACorr>0?'#FCD34D':'rgba(255,255,255,0.6)' },
                  { v:nbCorr,   l:'Corrigés',   c:'#6EE7B7' },
                  { v:nbNonR,   l:'Non rendus', c:nbNonR>0?'#FCA5A5':'rgba(255,255,255,0.6)' },
                ].map(k => (
                  <div key={k.l} style={{ textAlign:'center' }}>
                    <div style={{ fontSize:22, fontWeight:900, color:k.c }}>{k.v}</div>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,0.55)' }}>{k.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Barre filtres statut + bouton valider */}
            <div style={{ padding:'12px 24px', borderBottom:`1px solid ${COULEURS.gris200}`, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', flexShrink:0, background:COULEURS.gris50 }}>
              <div style={{ display:'flex', gap:6 }}>
                {[
                  { id:'tous',      lib:'Tous', n:nbTotal },
                  { id:'rendu',     lib:'✅ Rendus',    n:rendus.filter(r=>r.statut==='rendu').length },
                  { id:'corrige',   lib:'🏅 Corrigés',  n:nbCorr },
                  { id:'en_retard', lib:'🔴 Non rendus', n:nbNonR },
                ].map(f => (
                  <button key={f.id} onClick={() => setReceptModalStatut(f.id)}
                    style={{ padding:'5px 12px', borderRadius:7, border:`1.5px solid ${receptModalStatut===f.id?couleurTheme:COULEURS.gris200}`, background:receptModalStatut===f.id?couleurTheme:'#fff', color:receptModalStatut===f.id?'#fff':COULEURS.gris600, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                    {f.lib} {f.n > 0 && <span style={{ marginLeft:4, background:'rgba(0,0,0,0.12)', borderRadius:10, padding:'0 5px', fontSize:10 }}>{f.n}</span>}
                  </button>
                ))}
              </div>
              <button
                onClick={demanderValidation}
                style={{ padding:'8px 18px', borderRadius:9, border:'none', background: sansNote.length > 0 ? COULEURS.gris300 : '#059669', color: sansNote.length > 0 ? COULEURS.gris500 : '#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6 }}>
                🏅 Valider définitivement les notes
                {sansNote.length > 0 && <span style={{ fontSize:10, background:'#EF4444', color:'#fff', borderRadius:10, padding:'1px 6px', fontWeight:800 }}>{sansNote.length} sans note</span>}
                {toutFini && <span style={{ fontSize:10, background:'rgba(255,255,255,0.25)', color:'#fff', borderRadius:10, padding:'1px 6px' }}>✓ Prêt</span>}
              </button>
            </div>

            {/* Tableau apprenants */}
            <div style={{ overflowY:'auto', flex:1 }}>
              {rendus.length === 0 ? (
                <div style={{ padding:40, textAlign:'center', color:COULEURS.gris400, fontSize:13 }}>Chargement en cours…</div>
              ) : (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1.8fr', padding:'10px 24px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', position:'sticky', top:0 }}>
                    <span>Apprenant</span><span>Statut</span><span>Rendu le</span><span>Note</span><span>Action</span>
                  </div>
                  {rendusAffiches.length === 0 ? (
                    <div style={{ padding:'24px', textAlign:'center', color:COULEURS.gris400, fontSize:12 }}>Aucun apprenant pour ce filtre.</div>
                  ) : rendusAffiches.map(r => {
                    const nom = r.apprenant?.nom_complet || r.inscription_id;
                    const st  = STATUT_R[r.statut] || STATUT_R.a_rendre;
                    const bgRow = r.statut==='rendu'?'#FFFBEB' : r.statut==='corrige'?'#F0FFF4' : r.statut==='en_retard'?'#FFF5F5' : COULEURS.blanc;
                    const peutCorrection = ['rendu','en_retard'].includes(r.statut);
                    return (
                      <div key={r.id||r.inscription_id} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1.8fr', padding:'14px 24px', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13, alignItems:'center', background:bgRow }}>
                        <div>
                          <div style={{ fontWeight:700, color:COULEURS.navy }}>{nom}</div>
                          {r.apprenant?.email && <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:2 }}>{r.apprenant.email}</div>}
                        </div>
                        <span style={{ padding:'3px 9px', borderRadius:20, background:st.fond, color:st.texte, fontSize:11, fontWeight:700, width:'fit-content' }}>{st.ic} {st.lib}</span>
                        <span style={{ fontSize:11, color:COULEURS.gris500 }}>
                          {r.rendu_at ? fmtDate(r.rendu_at) : r.statut==='en_retard' ? <span style={{ color:'#EF4444', fontWeight:600 }}>Non rendu</span> : '-'}
                        </span>
                        <div>
                          {(r.statut==='corrige' || (r.statut==='en_retard' && r.note != null)) ? (
                            <span style={{ fontWeight:800, color:r.note>=10?COULEURS.succes:'#EF4444', fontSize:15 }}>{r.note ?? 0}<span style={{ fontSize:10, color:COULEURS.gris400, fontWeight:400 }}>/20</span></span>
                          ) : (
                            <span style={{ fontSize:11, color:COULEURS.gris300 }}>-</span>
                          )}
                        </div>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                          {/* Le lien Cloudinary brut répond 401 sur un .docx ou un .pdf —
                              Cloudinary bloque la livraison publique des fichiers `raw`.
                              Le coach recevait donc une page d'erreur sur la copie qu'il
                              voulait corriger. Le relais signe la requête côté serveur. */}
                          {r.fichier_url && (
                            <>
                              <a href={urlOuvrir(r.fichier_url, r.fichier_nom)} target="_blank" rel="noreferrer"
                                style={{ padding:'5px 10px', borderRadius:7, background:'#F0FDF4', color:'#15803D', fontSize:11, fontWeight:700, textDecoration:'none', border:'1px solid #BBF7D0', display:'inline-flex', alignItems:'center', gap:4 }}>
                                👁 Consulter
                              </a>
                              <a href={urlTelecharger(r.fichier_url, r.fichier_nom)}
                                style={{ padding:'5px 10px', borderRadius:7, background:'#EFF6FF', color:'#1D4ED8', fontSize:11, fontWeight:700, textDecoration:'none', border:'1px solid #BFDBFE', display:'inline-flex', alignItems:'center', gap:4 }}>
                                📥 Télécharger
                              </a>
                            </>
                          )}
                          {r.contenu_texte && (
                            <button onClick={() => { setCorrectionModal({ devoir:d, rendu:r }); setCorrectionForm({ note: r.note ?? (r.statut==='en_retard'?'0':''), commentaire: r.commentaire_coach||'' }); }}
                              style={{ padding:'5px 10px', borderRadius:7, border:'1px solid #D1FAE5', background:'#F0FFF4', color:'#065F46', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                              📄 Voir texte
                            </button>
                          )}
                          {peutCorrection ? (
                            <button onClick={() => { setCorrectionModal({ devoir:d, rendu:r }); setCorrectionForm({ note: r.note ?? (r.statut==='en_retard'?'0':''), commentaire: r.commentaire_coach||'' }); }}
                              style={{ padding:'5px 10px', borderRadius:7, border:'none', background:r.statut==='en_retard'?'#FEE2E2':couleurTheme+'18', color:r.statut==='en_retard'?'#991B1B':couleurTheme, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                              {r.statut==='en_retard' ? '🔴 Attribuer note' : '✏️ Corriger'}
                            </button>
                          ) : r.statut === 'corrige' ? (
                            <button onClick={() => { setCorrectionModal({ devoir:d, rendu:r }); setCorrectionForm({ note: r.note ?? '', commentaire: r.commentaire_coach||'' }); }}
                              style={{ padding:'5px 10px', borderRadius:7, border:'none', background:COULEURS.gris100, color:COULEURS.gris600, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                              🔁 Modifier note
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </>
      );
    })()}

    {/* ══════════ MODAL CONFIRMATION SUPPRESSION DEVOIR ══════════ */}
    {confirmSupprimer && (
      <>
        <div onClick={() => setConfirmSupprimer(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:2000 }} />
        <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'min(440px,92vw)', background:'#fff', borderRadius:18, zIndex:2001, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.25)', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
          {/* Header */}
          <div style={{ background:'linear-gradient(135deg,#991B1B,#DC2626)', padding:'18px 22px', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>🗑 Supprimer ce devoir ?</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:3, maxWidth:320, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{confirmSupprimer.titre}</div>
            </div>
            <button onClick={() => setConfirmSupprimer(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
          </div>
          {/* Corps */}
          <div style={{ padding:'22px 24px' }}>
            <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'14px 16px', marginBottom:16 }}>
              <div style={{ fontSize:13, color:'#991B1B', lineHeight:1.6 }}>
                ⚠️ <strong>Cette action est irréversible.</strong><br />
                Le devoir, toutes ses soumissions et toutes les notes associées seront définitivement supprimés.
              </div>
            </div>
            <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#92400E' }}>
              💡 Si des apprenants ont déjà rendu ce devoir, la suppression sera <strong>bloquée</strong>. Utilisez <strong>Dépublier</strong> pour masquer le devoir sans perdre les soumissions.
            </div>
          </div>
          {/* Footer */}
          <div style={{ padding:'14px 24px 20px', display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button onClick={() => setConfirmSupprimer(null)} style={{ padding:'10px 22px', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
              Annuler
            </button>
            <button onClick={confirmerSuppression} disabled={devoirActionEnCours} style={{ padding:'10px 22px', borderRadius:9, border:'none', background:'#DC2626', color:'#fff', fontSize:13, fontWeight:700, cursor: devoirActionEnCours ? 'not-allowed' : 'pointer', opacity: devoirActionEnCours ? 0.6 : 1, fontFamily:'inherit' }}>
              {devoirActionEnCours ? '⏳ …' : '🗑 Supprimer définitivement'}
            </button>
          </div>
        </div>
      </>
    )}

    {/* ══════════ MODAL CONFIRMATION GÉNÉRIQUE ══════════ */}
    {confirmGeneral && (
      <>
        <div onClick={() => setConfirmGeneral(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:99998 }} />
        <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%) translateZ(0)', width:'min(420px,92vw)', background:'#fff', borderRadius:18, zIndex:99999, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.22)', fontFamily:'"Plus Jakarta Sans",sans-serif', isolation:'isolate' }}>
          <div style={{ background:`linear-gradient(135deg,${confirmGeneral.couleur || '#1E3A5F'},${confirmGeneral.couleur || '#2563EB'})`, padding:'18px 22px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>{confirmGeneral.icone} {confirmGeneral.titre}</div>
            <button onClick={() => setConfirmGeneral(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
          </div>
          <div style={{ padding:'22px 24px' }}>
            <div style={{ fontSize:14, color:COULEURS.navy, lineHeight:1.7 }}>{confirmGeneral.message}</div>
            {confirmGeneral.details && (
              <div style={{ marginTop:12, background:COULEURS.gris50, border:`1px solid ${COULEURS.gris200}`, borderRadius:8, padding:'10px 14px', fontSize:12, color:COULEURS.gris600 }}>
                {confirmGeneral.details}
              </div>
            )}
          </div>
          <div style={{ padding:'12px 24px 20px', display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button onClick={() => setConfirmGeneral(null)} style={{ padding:'10px 22px', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
              Annuler
            </button>
            <button onClick={() => { const fn = confirmGeneral.onConfirm; setConfirmGeneral(null); fn?.(); }}
              style={{ padding:'10px 22px', borderRadius:9, border:'none', background: confirmGeneral.couleur || '#2563EB', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
              {confirmGeneral.boutonLabel || 'Confirmer'}
            </button>
          </div>
        </div>
      </>
    )}

    {/* ══════════ MODAL ERREUR ══════════ */}
    {erreurModal && (
      <>
        <div onClick={() => setErreurModal(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:2000 }} />
        <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'min(400px,92vw)', background:'#fff', borderRadius:18, zIndex:2001, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.22)', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
          <div style={{ background:'linear-gradient(135deg,#991B1B,#DC2626)', padding:'16px 22px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>⚠️ {erreurModal.titre}</div>
            <button onClick={() => setErreurModal(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
          </div>
          <div style={{ padding:'22px 24px' }}>
            <div style={{ fontSize:14, color:'#991B1B', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'14px 16px', lineHeight:1.7 }}>
              {erreurModal.message}
            </div>
          </div>
          <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end' }}>
            <button onClick={() => setErreurModal(null)} style={{ padding:'10px 24px', borderRadius:9, border:'none', background:'#DC2626', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
              Fermer
            </button>
          </div>
        </div>
      </>
    )}

    {/* ══════════ MODAL CORRECTION DEVOIR ══════════ */}
    {correctionModal && (() => {
      const { devoir, rendu } = correctionModal;
      const LBL = { fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 };
      return (
        <>
          <div onClick={() => setCorrectionModal(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:2000 }} />
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'90vw', background:COULEURS.blanc, borderRadius:18, zIndex:2001, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.2)', display:'flex', flexDirection:'column', height:'90vh', maxHeight:'90vh' }}>
            <div style={{ background:`linear-gradient(135deg, ${couleurTheme} 0%, ${couleurThemeFonce} 100%)`, padding:'18px 22px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>✏️ Corriger le devoir</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', marginTop:3 }}>{devoir.titre} · {rendu.apprenant?.nom_complet || rendu.inscription_id}</div>
              </div>
              <button onClick={() => setCorrectionModal(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
            <div style={{ overflowY:'auto', padding:'20px 22px', flex:1, display:'flex', flexDirection:'column', gap:16 }}>
              {/* Exercice joint à la création - rappel pour la correction */}
              {devoir.ressource_url && (
                <a href={devoir.ressource_url} target="_blank" rel="noreferrer" style={{ display:'flex', alignItems:'center', gap:10, background:COULEURS.gris50, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'10px 14px', textDecoration:'none' }}>
                  <span style={{ fontSize:18 }}>📎</span>
                  <div>
                    <div style={{ fontSize:11.5, fontWeight:700, color:COULEURS.navy }}>Exercice joint à ce devoir</div>
                    <div style={{ fontSize:11, color:COULEURS.gris400, wordBreak:'break-all' }}>{(devoir.ressource_url.split('/').pop() || 'Voir le fichier')}</div>
                  </div>
                </a>
              )}
              {/* Contenu rendu */}
              {rendu.contenu_texte && (
                <div>
                  <label style={LBL}>Composition de l'apprenant</label>
                  <div style={{ background:COULEURS.gris50, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'14px 16px', fontSize:13, color:COULEURS.navy, lineHeight:1.7, maxHeight:200, overflowY:'auto', whiteSpace:'pre-wrap' }}>
                    {rendu.contenu_texte}
                  </div>
                </div>
              )}
              {rendu.fichier_url && (
                <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:10, padding:'14px 16px', display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:44, height:44, borderRadius:10, background:'#DBEAFE', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>📄</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, color:COULEURS.navy, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{rendu.fichier_nom || 'Fichier déposé'}</div>
                    <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:2 }}>Fichier soumis par l'apprenant</div>
                  </div>
                  {/* Même relais : « Consulter » ouvre dans l'onglet (en-tête `inline`),
                      « Télécharger » enregistre. Sans lui, les deux menaient à un 401. */}
                  <a href={urlOuvrir(rendu.fichier_url, rendu.fichier_nom)} target="_blank" rel="noreferrer"
                    style={{ padding:'8px 16px', borderRadius:8, background:'#15803D', color:'#fff', fontSize:12, fontWeight:700, textDecoration:'none', flexShrink:0 }}>
                    👁 Consulter
                  </a>
                  <a href={urlTelecharger(rendu.fichier_url, rendu.fichier_nom)}
                    style={{ padding:'8px 16px', borderRadius:8, background:'#1D4ED8', color:'#fff', fontSize:12, fontWeight:700, textDecoration:'none', flexShrink:0 }}>
                    📥 Télécharger
                  </a>
                </div>
              )}
              {rendu.reponses_qcm && Object.keys(rendu.reponses_qcm).length > 0 && (
                <div>
                  <label style={LBL}>Réponses QCM</label>
                  {(devoir.questions || []).map((q, i) => {
                    const rep = rendu.reponses_qcm[String(i)];
                    const correct = rep === q.correct;
                    return (
                      <div key={i} style={{ padding:'8px 12px', borderRadius:8, background:correct?'#F0FFF4':'#FFF5F5', border:`1px solid ${correct?'#6EE7B7':'#FCA5A5'}`, marginBottom:6, fontSize:12 }}>
                        <div style={{ fontWeight:700, color:COULEURS.navy, marginBottom:4 }}>Q{i+1}. {q.texte}</div>
                        <div style={{ color:correct?COULEURS.succes:'#991B1B', fontWeight:600 }}>
                          {correct?'✓':'✗'} Réponse : {rep||'-'} {!correct && `(Attendu : ${q.correct})`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Réponses par bloc - devoirs "mixte" (QCM/Listening/Audio/Quiz/Speaking combinés) */}
              {rendu.reponses_blocs && Object.keys(rendu.reponses_blocs).length > 0 && Array.isArray(devoir.blocs) && (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <label style={LBL}>Réponses par bloc</label>
                  {devoir.blocs.map((b, bi) => {
                    const rep = rendu.reponses_blocs[b.id];
                    if (!rep) return null;
                    const BLOC_ICO = { qcm:'📋', listening:'🎬', audio:'🎧', quiz:'🎯', speaking:'🎤' };
                    return (
                      <div key={b.id} style={{ fontSize:12, color:COULEURS.gris600, background:COULEURS.gris50, borderRadius:8, padding:'10px 12px', border:`1px solid ${COULEURS.gris200}` }}>
                        <div style={{ fontWeight:700, marginBottom:4, color:COULEURS.navy }}>{BLOC_ICO[b.type]||'📋'} Bloc {bi+1} · {b.type}</div>
                        {b.type === 'speaking'
                          ? <>
                              {rep.audioUrl && <audio controls src={rep.audioUrl} style={{ width:'100%', marginBottom:6 }} />}
                              <div style={{ whiteSpace:'pre-wrap' }}>{rep.texte || (!rep.audioUrl && <em>Aucune réponse</em>)}</div>
                            </>
                          : (b.questions||[]).map((q, qi) => (
                              <div key={qi}>Q{qi+1} : {rep[qi] ?? <em>-</em>} {rep[qi] && rep[qi]===q.correct ? '✓' : rep[qi] ? '✗' : ''}</div>
                            ))
                        }
                      </div>
                    );
                  })}
                </div>
              )}
              {Array.isArray(devoir.blocs) && devoir.blocs.some(b => b.type === 'speaking') && (
                <div style={{ padding:'8px 12px', borderRadius:8, background:'#FFFBEB', border:'1px solid #FDE68A', fontSize:11.5, color:'#92400E' }}>
                  ℹ️ La note ci-dessous {rendu.note!=null ? <>est pré-remplie à <strong>{rendu.note}/20</strong>, calculée</> : 'sera calculée'} uniquement sur les blocs QCM/Listening/Audio/Quiz - <strong>ajustez-la vous-même</strong> pour tenir compte de la réponse Speaking (lue ci-dessus), qui n'est jamais notée automatiquement.
                </div>
              )}
              {/* Saisie note */}
              <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:14 }}>
                <div>
                  <label style={LBL}>Note /20</label>
                  <input type="number" min={0} max={20} step={0.5} value={correctionForm.note}
                    onChange={e => setCorrectionForm(p => ({ ...p, note: e.target.value }))}
                    style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`2px solid ${couleurTheme}`, fontSize:16, fontWeight:800, textAlign:'center', fontFamily:'inherit', outline:'none', boxSizing:'border-box' }}
                    placeholder="-" />
                </div>
                <div>
                  <label style={LBL}>Commentaire</label>
                  <textarea value={correctionForm.commentaire}
                    onChange={e => setCorrectionForm(p => ({ ...p, commentaire: e.target.value }))}
                    style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'inherit', resize:'vertical', minHeight:60, outline:'none', boxSizing:'border-box' }}
                    placeholder="Feedback pour l'apprenant…" />
                </div>
              </div>
            </div>
            <div style={{ padding:'14px 22px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button onClick={() => setCorrectionModal(null)} disabled={savingCorrection} style={S.btnGhost}>Annuler</button>
              <button onClick={corrigerRendu} disabled={!correctionForm.note || savingCorrection}
                style={{ ...S.btn(COULEURS.succes), opacity:(!correctionForm.note || savingCorrection)?0.5:1, cursor:(!correctionForm.note || savingCorrection)?'not-allowed':'pointer' }}>
                {savingCorrection ? '⏳ Envoi en cours…' : '✅ Valider la correction'}
              </button>
            </div>
          </div>
        </>
      );
    })()}

    {/* ══════════ MODAL DÉTAIL NOTE / ÉVALUATION ══════════ */}
    {noteDetailModal && (() => {
      const { cl, a, n } = noteDetailModal;
      const LBL = { fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 };
      const ratio = n.note / (n.note_max || 20);
      const couleurNote = ratio >= 0.7 ? COULEURS.succes : ratio >= 0.5 ? COULEURS.attention : '#EF4444';
      return (
        <>
          <div onClick={() => setNoteDetailModal(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:2000 }} />
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'min(520px,92vw)', background:COULEURS.blanc, borderRadius:18, zIndex:2001, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.2)', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
            <div style={{ background:`linear-gradient(135deg, ${couleurTheme} 0%, ${couleurThemeFonce} 100%)`, padding:'20px 24px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>{n.titre || 'Évaluation'}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', marginTop:3 }}>{a.nom_complet} · {cl.nom}</div>
              </div>
              <button onClick={() => setNoteDetailModal(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
            </div>
            <div style={{ padding:'22px 24px', display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ display:'flex', gap:14 }}>
                <div style={{ flex:1, background:COULEURS.gris50, borderRadius:12, padding:'16px', textAlign:'center' }}>
                  <div style={{ fontSize:28, fontWeight:900, color:couleurNote }}>{n.note}/{n.note_max || 20}</div>
                  <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:2, textTransform:'uppercase', letterSpacing:'0.05em' }}>Note</div>
                </div>
                <div style={{ flex:1, background:COULEURS.gris50, borderRadius:12, padding:'16px', textAlign:'center' }}>
                  <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy, marginTop:4 }}><Puce label={n.type||'controle'} fond="#EDE9FE" texte="#6D28D9" /></div>
                  <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>Type</div>
                </div>
                <div style={{ flex:1, background:COULEURS.gris50, borderRadius:12, padding:'16px', textAlign:'center' }}>
                  <div style={{ fontSize:14, fontWeight:800, color:COULEURS.navy }}>{fmtDate(n.date_evaluation || n.created_at)}</div>
                  <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>Date</div>
                </div>
              </div>
              <div>
                <label style={LBL}>Commentaire du coach</label>
                <div style={{ background:COULEURS.gris50, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'14px 16px', fontSize:13, color:COULEURS.navy, lineHeight:1.7, fontStyle: n.commentaire_coach ? 'normal' : 'italic', minHeight:44 }}>
                  {n.commentaire_coach || 'Aucun commentaire.'}
                </div>
              </div>
            </div>
            <div style={{ padding:'14px 22px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'flex-end' }}>
              <button onClick={() => setNoteDetailModal(null)} style={S.btnGhost}>Fermer</button>
            </div>
          </div>
        </>
      );
    })()}

    {/* ══════════ MODAL SAISIR UNE NOTE ══════════ */}
    {modalSaisirNote && (() => {
      const LBL = { fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 };
      const tousApps = Object.entries(apprenantsByClasse)
        .filter(([classeId]) => mesGroupes.some(g => g.id === classeId))
        .flatMap(([classeId, apps]) =>
          apps.filter(a => a.statut !== 'suspendu').map(a => ({ ...a, classe_id: classeId }))
        );
      async function validerNote() {
        const app = tousApps.find(a => a.id === saisirNoteForm.inscription_id);
        if (!app || !saisirNoteForm.note || savingNote) return;
        setSavingNote(true);
        try {
          const r = await fetch(`${_PROF_API}/api/elearning/notes`, {
            method:'POST', headers:_profHdrs(),
            body: JSON.stringify({ inscription_id: app.id, classe_id: app.classe_id, titre: saisirNoteForm.titre||'Note manuelle', note: parseFloat(saisirNoteForm.note), commentaire_coach: saisirNoteForm.commentaire }),
          });
          if (r.ok) {
            const d = await r.json();
            const cl = classesReelles.find(c => c.id === app.classe_id);
            setNotesReelles(prev => [{ ...d.note, classe_nom: cl?.nom||'' }, ...prev]);
          } else {
            const d = await r.json().catch(() => ({}));
            toast.error(d.error || 'Enregistrement refusé', { duration: 5000 });
            return;
          }
        } catch {
          toast.error('Impossible de joindre le serveur', { duration: 5000 });
          return;
        } finally {
          setSavingNote(false);
        }
        setModalSaisirNote(false);
      }
      return (
        <>
          <div onClick={() => setModalSaisirNote(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:2000 }} />
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'90vw', height:'90vh', maxHeight:'90vh', background:COULEURS.blanc, borderRadius:18, zIndex:2001, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.2)', display:'flex', flexDirection:'column' }}>
            <div style={{ background:couleurTheme, padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>🏅 Saisir une note</div>
              <button onClick={() => setModalSaisirNote(false)} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:7, width:30, height:30, color:'#fff', cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={LBL}>Apprenant</label>
                <select value={saisirNoteForm.inscription_id} onChange={e => setSaisirNoteForm(p => ({ ...p, inscription_id: e.target.value }))} style={{ ...S.select, width:'100%' }}>
                  <option value="">- Choisir -</option>
                  {tousApps.map(a => <option key={a.id} value={a.id}>{a.nom_complet}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>Titre / Évaluation</label>
                <input value={saisirNoteForm.titre} onChange={e => setSaisirNoteForm(p => ({ ...p, titre: e.target.value }))} style={{ ...S.input }} placeholder="Ex: Quiz vocabulaire" />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'100px 1fr', gap:12 }}>
                <div>
                  <label style={LBL}>Note /20</label>
                  <input type="number" min={0} max={20} step={0.5} value={saisirNoteForm.note} onChange={e => setSaisirNoteForm(p => ({ ...p, note: e.target.value }))} style={{ ...S.input, textAlign:'center', fontWeight:800, fontSize:16 }} placeholder="-" />
                </div>
                <div>
                  <label style={LBL}>Commentaire</label>
                  <input value={saisirNoteForm.commentaire} onChange={e => setSaisirNoteForm(p => ({ ...p, commentaire: e.target.value }))} style={{ ...S.input }} placeholder="Optionnel…" />
                </div>
              </div>
            </div>
            <div style={{ padding:'14px 20px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button onClick={() => setModalSaisirNote(false)} disabled={savingNote} style={S.btnGhost}>Annuler</button>
              <button onClick={validerNote} disabled={!saisirNoteForm.inscription_id||!saisirNoteForm.note||savingNote} style={{ ...S.btn(couleurTheme), opacity:(!saisirNoteForm.inscription_id||!saisirNoteForm.note||savingNote)?0.5:1 }}>
                {savingNote ? '⏳ Envoi en cours…' : '✅ Enregistrer'}
              </button>
            </div>
          </div>
        </>
      );
    })()}

    {/* ══════════ MODAL PROGRAMMER UNE SESSION ══════════ */}
    {modalNouvelleSession && (() => {
      const LBL = { fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' };

      const modeEdition = !!editingSessionId;

      function fermer() {
        setModalNouvelleSession(false);
        setModeMultiple(false);
        setEditingSessionId(null);
        setFormNouvelleSession(FORM_SESSION_VIDE);
        setSessionsMultiples([{ ...SESSION_LIGNE_VIDE }]);
        setCommonFields({ groupe_id: '', heure_debut: '', heure_fin: '', lien_visio: '', type_session: 'ligne', contenu_ids: [] });
      }

      // ── MODE UNIQUE ──
      const f    = formNouvelleSession;
      const setF = (patch) => setFormNouvelleSession(prev => ({ ...prev, ...patch }));
      const groupeChoisiUnique = mesGroupes.find(g => g.id === f.groupe_id);
      const valideUnique = f.titre.trim() && f.groupe_id && f.date_session && f.heure_debut && f.heure_fin;

      async function sauvegarderUnique() {
        if (savingSession) return;
        // Un lien saisi mais inexploitable est pire qu'un champ vide : il franchit tous les
        // controles et n'echoue qu'au clic de l'apprenant, trente secondes avant le cours.
        // Meme regle que chez le coach de `dash`.
        if (f.type_session !== 'presentiel' && f.lien_visio.trim()) {
          const v = analyserLienVisio(f.lien_visio);
          if (!v.valide) {
            await alerte(`Lien de visioconference inutilisable : ${v.raison}. Corrigez-le ou laissez le champ vide.`, { danger: true });
            return;
          }
        }
        setSavingSession(true);
        try {
        const ids  = f.contenu_ids || [];
        const token = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');

        if (modeEdition) {
          if (token) {
            try {
              const body = {
                date:         f.date_session,
                heure_debut:  f.heure_debut,
                heure_fin:    f.heure_fin,
                lien_zoom:    f.type_session !== 'presentiel' ? (f.lien_visio.trim() || null) : null,
                objectifs_session: f.titre.trim() || null,
                contenu_ids:  ids,
              };
              const r = await fetch(`${_PROF_API}/api/elearning/seances/${editingSessionId}`, { method:'PATCH', headers:_profHdrs(), body:JSON.stringify(body) });
              if (r.ok) {
                setSessionsLocales(prev => prev.map(s => s.id === editingSessionId ? {
                  ...s, titre: f.titre.trim(), date_session: f.date_session,
                  heure_debut: f.heure_debut, heure_fin: f.heure_fin,
                  lien_visio: f.type_session !== 'presentiel' ? (f.lien_visio.trim() || null) : s.lien_visio,
                  contenu_ids: ids,
                } : s));
                fermer(); return;
              }
              console.warn('[seance-edit] réponse non-ok:', r.status, await r.text().catch(()=>''));
              await alerte("La modification n'a pas pu être enregistrée. Réessayez.", { danger: true });
            } catch (e) { console.warn('[seance-edit]', e); await alerte("La modification n'a pas pu être enregistrée. Réessayez.", { danger: true }); }
            return;
          }
          // Pas de token → séance locale (fallback) : édition purement locale
          setSessionsLocales(prev => prev.map(s => s.id === editingSessionId ? {
            ...s, titre: f.titre.trim(), date_session: f.date_session,
            heure_debut: f.heure_debut, heure_fin: f.heure_fin,
            lien_visio: f.type_session === 'presentiel' ? null : (f.lien_visio.trim() || s.lien_visio),
            contenu_ids: ids,
          } : s));
          fermer();
          return;
        }

        if (token) {
          try {
            const body = {
              classe_id:    f.groupe_id,
              coach_id:     profile?.id,
              date:         f.date_session,
              heure_debut:  f.heure_debut,
              heure_fin:    f.heure_fin,
              type:         f.type_session === 'presentiel' ? 'presentiel' : 'cours',
              statut:       'planifiee',
              lien_zoom:    f.type_session !== 'presentiel' ? (f.lien_visio.trim() || null) : null,
              objectifs_session: f.titre.trim() || null,
              contenu_ids:  ids,
            };
            const r = await fetch(`${_PROF_API}/api/elearning/seances`, { method:'POST', headers:_profHdrs(), body:JSON.stringify(body) });
            if (r.ok) {
              const dj = await r.json();
              const s  = dj.seance;
              setSessionsLocales(prev => [...prev, {
                id: s.id, groupe_id: s.classe_id, professeur_id: s.coach_id,
                titre: s.objectifs_session || f.titre.trim(), date_session: s.date,
                heure_debut: s.heure_debut, heure_fin: s.heure_fin,
                lien_visio: s.lien_zoom || s.lien_meet || null, type_session: f.type_session || 'ligne',
                statut: 'planifiee', notes_prof: null, contenu_ids: s.contenu_ids || ids, _real: true,
              }]);
              fermer(); return;
            }
            const d = await r.json().catch(() => ({}));
            toast.error(d.error || "La session n'a pas pu être programmée", { duration: 5000 });
            return;
          } catch (e) {
            toast.error('Impossible de joindre le serveur', { duration: 5000 });
            return;
          }
        }
        // Fallback local (uniquement quand aucun token n'est présent, ex: démo hors-ligne)
        const nouv = {
          id: `ses-${Date.now()}`, groupe_id: f.groupe_id,
          professeur_id: profile?.id || 'teacher-001', titre: f.titre.trim(),
          date_session: f.date_session, heure_debut: f.heure_debut, heure_fin: f.heure_fin,
          type_session: f.type_session || 'ligne',
          // Pas de lien inventé : « https://zoom.us/j/nouveau » a l'apparence d'une adresse
          // valide et n'ouvre aucune réunion. Il franchissait tous les contrôles et n'échouait
          // qu'au seul moment qui compte - quand l'apprenant clique, avant le cours. Un champ
          // vide est honnête, et c'est lui qui déclenche l'alerte « lien manquant » du suivi.
          lien_visio: f.type_session === 'presentiel' ? null : (f.lien_visio.trim() || null),
          statut: 'planifiee', notes_prof: f.notes_prof.trim() || null, contenu_ids: ids,
        };
        setSessionsLocales(prev => [...prev, nouv]);
        if (ids.length > 0) setContenus(prev => prev.map(c => ids.includes(c.id) ? { ...c, est_visible: true, date_publication: c.date_publication || new Date().toISOString() } : c));
        fermer();
        } finally {
          setSavingSession(false);
        }
      }

      // ── MODE MULTIPLE ──
      const cf    = commonFields;
      const setCF = (patch) => setCommonFields(prev => ({ ...prev, ...patch }));
      const groupeChoisiMulti = mesGroupes.find(g => g.id === cf.groupe_id);
      const lignesValides = sessionsMultiples.filter(s => s.titre.trim() && s.date_session);
      const valideMultiple = cf.groupe_id && cf.heure_debut && cf.heure_fin && lignesValides.length > 0;

      function genererLignes(n) {
        setSessionsMultiples(Array.from({ length: n }, (_, i) =>
          sessionsMultiples[i] ? { ...sessionsMultiples[i] } : { titre: '', date_session: '', heure_debut: cf.heure_debut, heure_fin: cf.heure_fin, lien_visio: cf.lien_visio }
        ));
      }

      // Convertit une valeur de cellule Excel en date ISO (YYYY-MM-DD) - gère à la fois les
      // vraies dates Excel (objet Date grâce à cellDates:true) et le texte saisi à la main
      // (DD/MM/YYYY ou YYYY-MM-DD), formats les plus probables selon la locale FR de l'app.
      function celluleVersDateISO(val) {
        if (!val) return '';
        if (val instanceof Date) return val.toISOString().slice(0, 10);
        const s = String(val).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        return '';
      }
      // Normalise une heure ("9h30", "9:30", "09:30:00"...) en HH:MM.
      function celluleVersHeure(val) {
        if (!val) return '';
        if (val instanceof Date) return val.toISOString().slice(11, 16);
        const s = String(val).trim().replace('h', ':').replace('H', ':');
        const m = s.match(/^(\d{1,2}):?(\d{2})?/);
        if (!m) return '';
        return `${m[1].padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}`;
      }

      function telechargerModeleImport() {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([
          ['Titre', 'Date (JJ/MM/AAAA)', 'Heure début', 'Heure fin', 'Lien (optionnel)'],
          ['Greetings & Introductions - Semaine 1', '15/09/2026', '18:00', '19:00', ''],
          ['Present Simple - Semaine 2', '22/09/2026', '18:00', '19:00', 'https://zoom.us/j/exemple'],
        ]);
        ws['!cols'] = [{ wch: 38 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Sessions');
        XLSX.writeFile(wb, 'modele_import_sessions.xlsx');
      }

      async function importerExcel(e) {
        const fichier = e.target.files?.[0];
        e.target.value = '';
        if (!fichier) return;
        try {
          const data = await fichier.arrayBuffer();
          const wb = XLSX.read(data, { type: 'array', cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const lignes = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          // Ignore la ligne d'en-tête (Titre/Date/Heure début/...) - détectée si la 1ʳᵉ cellule
          // de la 1ʳᵉ ligne n'est pas une date/heure exploitable.
          const corps = lignes.slice(1).filter(l => l.some(c => String(c).trim() !== ''));
          if (corps.length === 0) { await alerte('Aucune ligne exploitable trouvée dans ce fichier. Vérifiez le format avec le modèle téléchargeable.', { titre: 'Import Excel', danger: true }); return; }
          const importees = corps.map(l => ({
            titre: String(l[0] || '').trim(),
            date_session: celluleVersDateISO(l[1]),
            heure_debut: celluleVersHeure(l[2]),
            heure_fin: celluleVersHeure(l[3]),
            lien_visio: String(l[4] || '').trim(),
            type_session: cf.type_session || 'ligne',
            contenu_ids: [],
          }));
          const invalides = importees.filter(s => !s.titre || !s.date_session).length;
          setSessionsMultiples(importees);
          if (invalides > 0) {
            await alerte(`${importees.length - invalides} session(s) importée(s) avec succès. ${invalides} ligne(s) incomplète(s) (titre ou date illisible) - vérifiez-les avant de programmer.`, { titre: 'Import Excel', danger: true });
          } else {
            await alerte(`${importees.length} session(s) importée(s) avec succès. Vérifiez la liste ci-dessous avant de cliquer sur "Programmer".`, { titre: 'Import Excel' });
          }
        } catch (err) {
          console.error('[import-excel]', err);
          await alerte("Impossible de lire ce fichier. Formats acceptés : .xlsx, .xls, .csv - utilisez le modèle téléchargeable pour garantir le bon format.", { titre: 'Import Excel', danger: true });
        }
      }

      async function sauvegarderMultiple() {
        if (savingSession) return;
        // Meme garde qu'en creation unique, mais sur le lot : une seule ligne fautive suffit
        // a produire une seance que personne ne pourra rejoindre.
        if ((cf.type_session || 'ligne') !== 'presentiel') {
          for (const [i, ligne] of lignesValides.entries()) {
            const brut = (ligne.lien_visio || '').trim() || cf.lien_visio.trim();
            if (!brut) continue;
            const v = analyserLienVisio(brut);
            if (!v.valide) {
              await alerte(`Ligne ${i + 1} - lien de visioconference inutilisable : ${v.raison}. Corrigez-le ou laissez le champ vide.`, { danger: true });
              return;
            }
          }
        }
        setSavingSession(true);
        try {
        const typeCommon    = cf.type_session || 'ligne';
        const token         = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
        const nouvelles     = lignesValides.map((s, i) => ({
          id: `ses-${Date.now()}-${i}`,
          groupe_id: cf.groupe_id, professeur_id: profile?.id || 'teacher-001',
          titre: s.titre.trim(), date_session: s.date_session,
          heure_debut: s.heure_debut.trim() || cf.heure_debut,
          heure_fin:   s.heure_fin.trim()   || cf.heure_fin,
          type_session: typeCommon,
          lien_visio: typeCommon === 'presentiel' ? null : ((s.lien_visio.trim() || cf.lien_visio.trim()) || null),
          statut: 'planifiee', notes_prof: null, contenu_ids: s.contenu_ids || [],
        }));
        if (token) {
          // Envoyer chaque séance à l'API (séquentiellement pour éviter les conflits)
          const creees = [];
          let echecs = 0;
          let dernierMessage = '';
          for (const s of nouvelles) {
            try {
              const r = await fetch(`${_PROF_API}/api/elearning/seances`, {
                method: 'POST', headers: _profHdrs(),
                body: JSON.stringify({
                  classe_id: cf.groupe_id, coach_id: profile?.id,
                  date: s.date_session, heure_debut: s.heure_debut, heure_fin: s.heure_fin,
                  type: typeCommon === 'presentiel' ? 'presentiel' : 'cours', statut: 'planifiee',
                  lien_zoom: typeCommon !== 'presentiel' ? s.lien_visio : null,
                  objectifs_session: s.titre || null,
                  contenu_ids: s.contenu_ids || [],
                }),
              });
              if (r.ok) {
                const dj = await r.json(); const sr = dj.seance;
                creees.push({ ...s, id: sr.id, contenu_ids: sr.contenu_ids || s.contenu_ids || [], _real: true });
              } else {
                echecs++;
                const d = await r.json().catch(() => ({}));
                dernierMessage = d.error || dernierMessage;
              }
            } catch { echecs++; }
          }
          setSessionsLocales(prev => [...prev, ...creees.map(s => ({
            id: s.id, groupe_id: s.groupe_id || cf.groupe_id, professeur_id: s.professeur_id || profile?.id,
            titre: s.titre, date_session: s.date_session, heure_debut: s.heure_debut, heure_fin: s.heure_fin,
            type_session: s.type_session, lien_visio: s.lien_visio, statut: 'planifiee',
            notes_prof: null, contenu_ids: s.contenu_ids || [], _real: s._real || false,
          }))]);
          if (echecs > 0) {
            toast.error(
              creees.length > 0
                ? `${creees.length} session(s) créée(s), ${echecs} refusée(s)${dernierMessage ? ` - ${dernierMessage}` : ''}`
                : (dernierMessage || 'Aucune session créée - action refusée'),
              { duration: 6000 }
            );
          }
          if (creees.length > 0) { fermer(); }
          return;
        }
        // Fallback local (mock)
        setSessionsLocales(prev => [...prev, ...nouvelles]);
        const tousIds = [...new Set(nouvelles.flatMap(s => s.contenu_ids))];
        if (tousIds.length > 0) setContenus(prev => prev.map(c => tousIds.includes(c.id) ? { ...c, est_visible: true, date_publication: c.date_publication || new Date().toISOString() } : c));
        fermer();
        } finally {
          setSavingSession(false);
        }
      }

      function calcDuree(debut, fin) {
        if (!debut || !fin || fin <= debut) return null;
        const [dh, dm] = debut.split(':').map(Number);
        const [fh, fm] = fin.split(':').map(Number);
        const total = (fh * 60 + fm) - (dh * 60 + dm);
        return `${Math.floor(total / 60)}h${total % 60 > 0 ? String(total % 60).padStart(2, '0') : ''}`;
      }

      return (
        <>
          <div onClick={fermer} style={{ position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.6)', zIndex: 1100, backdropFilter: 'blur(3px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '90vw', maxWidth: '90vw', height: '90vh', maxHeight: '90vh', background: COULEURS.blanc, borderRadius: 20, boxShadow: '0 28px 70px rgba(0,0,0,0.3)', zIndex: 1101, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>

            {/* En-tête */}
            <div style={{ background: `linear-gradient(135deg, ${COULEURS.navy} 0%, #0E4F6B 100%)`, padding: '20px 26px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Planning sessions</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 12 }}>
                    {modeEdition ? '✏️ Modifier la session' : (modeMultiple ? 'Programmer un programme de sessions' : 'Programmer une nouvelle session')}
                  </div>
                  {/* Toggle mode */}
                  {!modeEdition && <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { id: false, label: '1 session', icon: '🗓' },
                      { id: true,  label: 'Programme complet', icon: '📋' },
                    ].map(({ id, label, icon }) => (
                      <button
                        key={String(id)}
                        onClick={() => setModeMultiple(id)}
                        style={{
                          padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          border: `1.5px solid ${modeMultiple === id ? '#FCD34D' : 'rgba(255,255,255,0.25)'}`,
                          background: modeMultiple === id ? '#FCD34D' : 'rgba(255,255,255,0.1)',
                          color: modeMultiple === id ? COULEURS.navy : 'rgba(255,255,255,0.8)',
                          fontFamily: '"Plus Jakarta Sans", sans-serif',
                        }}
                      >
                        {icon} {label}
                      </button>
                    ))}
                  </div>}
                </div>
                <button onClick={fermer} style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, width: 34, height: 34, color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
              </div>
            </div>

            {/* ══ CORPS MODE UNIQUE ══ */}
            {!modeMultiple && (
              <div style={{ overflowY: 'auto', padding: '24px 26px', flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <label style={LBL}>Titre de la session *</label>
                  <input style={S.input} placeholder="Ex : Greetings & Introductions - Semaine 3" value={f.titre} onChange={e => setF({ titre: e.target.value })} />
                </div>
                <div>
                  <label style={LBL}>Classe / Groupe *</label>
                  <select disabled={modeEdition} style={{ ...S.select, width: '100%', opacity: modeEdition ? 0.6 : 1, cursor: modeEdition ? 'not-allowed' : 'pointer' }} value={f.groupe_id} onChange={e => setF({ groupe_id: e.target.value })}>
                    <option value="">- Sélectionner une classe -</option>
                    {mesGroupes.filter(g => g.est_actif && !g._delegation).map(g => <option key={g.id} value={g.id}>{g.nom} · {g.cecr_min}→{g.cecr_max} · {g.tranche_age}</option>)}
                  </select>
                  {modeEdition && <div style={{ marginTop: 6, fontSize: 11, color: COULEURS.gris400 }}>La classe ne peut pas être modifiée après création.</div>}
                  {groupeChoisiUnique && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: couleurTheme + '12', borderRadius: 8, fontSize: 12, color: couleurThemeFonce, fontWeight: 600 }}>
                      👥 {mesApprenants.filter(a => a.groupe_id === groupeChoisiUnique.id).length} apprenant(s) · {groupeChoisiUnique.tranche_age} · Niveaux {groupeChoisiUnique.cecr_min}→{groupeChoisiUnique.cecr_max}
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div><label style={LBL}>Date *</label><input type="date" style={S.input} value={f.date_session} onChange={e => setF({ date_session: e.target.value })} /></div>
                  <div><label style={LBL}>Heure début *</label><input type="time" style={S.input} value={f.heure_debut} onChange={e => setF({ heure_debut: e.target.value })} /></div>
                  <div><label style={LBL}>Heure fin *</label><input type="time" style={S.input} value={f.heure_fin} onChange={e => setF({ heure_fin: e.target.value })} /></div>
                </div>
                {calcDuree(f.heure_debut, f.heure_fin) && (
                  <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: '#1E40AF', fontWeight: 600 }}>
                    ⏱ Durée : {calcDuree(f.heure_debut, f.heure_fin)}
                  </div>
                )}
                <div>
                  <label style={LBL}>Type de session</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { val: 'ligne',      ic: '📹', lib: 'En ligne',    sub: 'Zoom · Meet · Teams',    col: couleurTheme },
                      { val: 'presentiel', ic: '🏢', lib: 'Présentiel',  sub: 'Pas de lien requis',     col: '#F59E0B' },
                    ].map(({ val, ic, lib, sub, col }) => {
                      const actif = (f.type_session || 'ligne') === val;
                      return (
                        <button key={val} type="button"
                          onClick={() => setF({ type_session: val, lien_visio: val === 'presentiel' ? '' : f.lien_visio })}
                          style={{ flex:1, padding:'12px 10px', borderRadius:10, border:`2px solid ${actif ? col : COULEURS.gris200}`, background: actif ? `${col}15` : COULEURS.blanc, cursor:'pointer', textAlign:'center', transition:'all 0.15s', fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                        >
                          <div style={{ fontSize:22, marginBottom:3 }}>{ic}</div>
                          <div style={{ fontSize:13, fontWeight:700, color: actif ? col : COULEURS.navy }}>{lib}</div>
                          <div style={{ fontSize:10, color: actif ? col : COULEURS.gris400 }}>{sub}</div>
                        </button>
                      );
                    })}
                  </div>
                  {(f.type_session || 'ligne') === 'presentiel' && (
                    <div style={{ marginTop:8, padding:'8px 12px', borderRadius:8, background:'#FFFBEB', border:'1px solid #FDE68A', fontSize:12, color:'#92400E' }}>
                      🏢 Session présentielle - les apprenants suivent le cours sur place. Aucun lien de visioconférence requis.
                    </div>
                  )}
                </div>
                <div>
                  <label style={LBL}>Plateforme visio</label>
                  {(f.type_session || 'ligne') === 'presentiel' ? (
                    <div style={{ padding:'10px 14px', borderRadius:8, background:COULEURS.gris50, border:`1px solid ${COULEURS.gris200}`, fontSize:12, color:COULEURS.gris400, fontStyle:'italic' }}>
                      Non applicable en mode présentiel
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        {[
                          { id: 'zoom',   label: 'Zoom',       logo: '🔵', placeholder: 'https://zoom.us/j/…',                   prefix: 'https://zoom.us/j/' },
                          { id: 'meet',   label: 'Google Meet', logo: '🟢', placeholder: 'https://meet.google.com/…',             prefix: 'https://meet.google.com/' },
                          { id: 'teams',  label: 'Teams',       logo: '🟣', placeholder: 'https://teams.microsoft.com/l/meetup-join/…', prefix: 'https://teams.microsoft.com/' },
                          { id: 'jitsi',  label: 'Jitsi',       logo: '🟠', placeholder: 'https://meet.jit.si/…',                prefix: 'https://meet.jit.si/' },
                          { id: 'webex',  label: 'Webex',       logo: '⚪', placeholder: 'https://webex.com/meet/…',             prefix: 'https://webex.com/' },
                          { id: 'autre',  label: 'Autre',        logo: '🔗', placeholder: 'https://…',                            prefix: '' },
                        ].map(p => {
                          const actif = f.lien_visio.startsWith(p.prefix) && p.prefix !== '';
                          const actifAutre = p.id === 'autre' && f.lien_visio !== '' && ![
                            'https://zoom.us/', 'https://meet.google.com/', 'https://teams.microsoft.com/', 'https://meet.jit.si/', 'https://webex.com/'
                          ].some(pfx => f.lien_visio.startsWith(pfx));
                          const estActif = actif || (p.id === 'autre' && actifAutre);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => { if (!f.lien_visio || f.lien_visio === '' || !f.lien_visio.startsWith('http')) setF({ lien_visio: p.prefix }); }}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif', border: `1.5px solid ${estActif ? couleurTheme : COULEURS.gris200}`, background: estActif ? couleurTheme + '15' : COULEURS.blanc, color: estActif ? couleurTheme : COULEURS.gris600, transition: 'all 0.15s' }}
                            >
                              <span>{p.logo}</span> {p.label}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        style={S.input}
                        placeholder={
                          f.lien_visio.startsWith('https://zoom.us/') ? 'https://zoom.us/j/123456789' :
                          f.lien_visio.startsWith('https://meet.google.com/') ? 'https://meet.google.com/abc-defg-hij' :
                          f.lien_visio.startsWith('https://teams.microsoft.com/') ? 'https://teams.microsoft.com/l/meetup-join/…' :
                          f.lien_visio.startsWith('https://meet.jit.si/') ? 'https://meet.jit.si/nom-de-la-salle' :
                          f.lien_visio.startsWith('https://webex.com/') ? 'https://webex.com/meet/votre-salle' :
                          'Collez votre lien de réunion…'
                        }
                        value={f.lien_visio}
                        onChange={e => setF({ lien_visio: e.target.value })}
                      />
                    </>
                  )}
                </div>
                {/* Contenus liés */}
                {f.groupe_id && (() => {
                  const disponibles = mesContenus.filter(c => contenuViseClasse(c, f.groupe_id));
                  if (disponibles.length === 0) return null;
                  const CT = { lecon: { bg:'#E0F2FE', txt:'#0E7490', ic:'📖' }, exercice: { bg:'#D1FAE5', txt:'#065F46', ic:'✏️' }, devoir: { bg:'#FEF3C7', txt:'#92400E', ic:'📝' }, audio: { bg:'#EDE9FE', txt:'#5B21B6', ic:'🎵' } };
                  return (
                    <div>
                      <label style={LBL}>Contenus associés à cette session</label>
                      <div style={{ fontSize: 11, color: COULEURS.gris400, marginBottom: 8 }}>
                        Vous pouvez lier des brouillons - ils seront visibles via "Voir le programme" même non publiés.
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {disponibles.map(c => {
                          const selectionne = (f.contenu_ids || []).includes(c.id);
                          const ct = CT[c.type_contenu] || { bg: COULEURS.gris100, txt: COULEURS.gris600, ic: '📄' };
                          return (
                            <div
                              key={c.id}
                              onClick={() => setF({ contenu_ids: selectionne ? (f.contenu_ids || []).filter(id => id !== c.id) : [...(f.contenu_ids || []), c.id] })}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderRadius: 10, border: `1.5px solid ${selectionne ? couleurTheme : COULEURS.gris200}`, background: selectionne ? couleurTheme + '0D' : COULEURS.blanc, cursor: 'pointer', transition: 'all 0.15s' }}
                            >
                              <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${selectionne ? couleurTheme : COULEURS.gris200}`, background: selectionne ? couleurTheme : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, color: '#fff', fontWeight: 800 }}>
                                {selectionne ? '✓' : ''}
                              </div>
                              <span style={{ padding: '2px 8px', borderRadius: 20, background: ct.bg, color: ct.txt, fontSize: 10, fontWeight: 700 }}>{ct.ic} {c.type_contenu}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: COULEURS.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.titre}</div>
                                  {!c.est_visible && <span style={{ fontSize: 10, fontWeight: 700, color: '#D97706', background: '#FEF3C7', padding: '1px 6px', borderRadius: 10, flexShrink: 0 }}>📝 Brouillon</span>}
                                </div>
                                <div style={{ fontSize: 11, color: COULEURS.gris400 }}>{c.module} · Sem. {c.semaine}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                <div>
                  <label style={LBL}>Notes préparatoires (facultatif)</label>
                  <textarea style={{ ...S.input, minHeight: 72, resize: 'vertical', lineHeight: 1.6 }} placeholder="Objectifs pédagogiques, matériel à préparer…" value={f.notes_prof} onChange={e => setF({ notes_prof: e.target.value })} />
                </div>
                {valideUnique && (() => {
                  const ids = f.contenu_ids || [];
                  const brouillonsLies = mesContenus.filter(c => ids.includes(c.id) && !c.est_visible);
                  const publiesLies    = mesContenus.filter(c => ids.includes(c.id) && c.est_visible);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ background: COULEURS.gris50, borderRadius: 10, padding: '14px 16px', border: `1px solid ${COULEURS.gris200}`, fontSize: 13 }}>
                        <div style={{ fontWeight: 700, color: COULEURS.navy, marginBottom: 8 }}>📋 Récapitulatif</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, color: COULEURS.gris600 }}>
                          <div>📌 <strong>{f.titre}</strong></div>
                          <div>👥 {groupeChoisiUnique?.nom}</div>
                          <div>📅 {fmtDate(f.date_session)} · ⏰ {f.heure_debut} – {f.heure_fin}</div>
                          <div>{f.type_session === 'presentiel' ? '🏢 Présentiel' : '📹 En ligne'}</div>
                          {f.type_session !== 'presentiel' && f.lien_visio && <div>🔗 {f.lien_visio}</div>}
                          {ids.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                              <span>📚 {ids.length} cours lié{ids.length > 1 ? 's' : ''}</span>
                              {publiesLies.length > 0 && <span style={{ background: '#D1FAE5', color: '#065F46', padding: '1px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>✅ {publiesLies.length} déjà publié{publiesLies.length > 1 ? 's' : ''}</span>}
                              {brouillonsLies.length > 0 && <span style={{ background: '#FEF3C7', color: '#92400E', padding: '1px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>📝 {brouillonsLies.length} brouillon{brouillonsLies.length > 1 ? 's' : ''} → sera{brouillonsLies.length > 1 ? 'ont' : ''} publié{brouillonsLies.length > 1 ? 's' : ''}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                      {brouillonsLies.length > 0 && (
                        <div style={{ background: '#FFFBEB', borderRadius: 10, padding: '10px 14px', border: '1px solid #FDE68A', fontSize: 12, color: '#92400E' }}>
                          <strong>📢 Publication automatique</strong> - {brouillonsLies.length} brouillon{brouillonsLies.length > 1 ? 's' : ''} ({brouillonsLies.map(c => c.titre).join(', ')}) sera{brouillonsLies.length > 1 ? 'ont' : ''} publié{brouillonsLies.length > 1 ? 's' : ''} et visible{brouillonsLies.length > 1 ? 's' : ''} par les apprenants lors de la programmation de cette session.
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ══ CORPS MODE MULTIPLE ══ */}
            {modeMultiple && (
              <div style={{ overflowY: 'auto', padding: '20px 26px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Champs communs */}
                <div style={{ background: '#EFF6FF', borderRadius: 12, padding: '16px 18px', border: '1px solid #BFDBFE' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1E40AF', marginBottom: 12 }}>⚙️ Paramètres communs à toutes les sessions</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
                    <div>
                      <label style={{ ...LBL, color: '#1E40AF' }}>Classe / Groupe *</label>
                      <select style={{ ...S.select, width: '100%' }} value={cf.groupe_id} onChange={e => setCF({ groupe_id: e.target.value })}>
                        <option value="">- Sélectionner -</option>
                        {mesGroupes.filter(g => g.est_actif && !g._delegation).map(g => <option key={g.id} value={g.id}>{g.nom} · {g.cecr_min}→{g.cecr_max}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ ...LBL, color: '#1E40AF' }}>Heure début *</label>
                      <input type="time" style={S.input} value={cf.heure_debut} onChange={e => {
                        const val = e.target.value;
                        setCF({ heure_debut: val });
                        setSessionsMultiples(prev => prev.map(l => l.heure_debut === '' || l.heure_debut === cf.heure_debut ? { ...l, heure_debut: val } : l));
                      }} />
                    </div>
                    <div>
                      <label style={{ ...LBL, color: '#1E40AF' }}>Heure fin *</label>
                      <input type="time" style={S.input} value={cf.heure_fin} onChange={e => {
                        const val = e.target.value;
                        setCF({ heure_fin: val });
                        setSessionsMultiples(prev => prev.map(l => l.heure_fin === '' || l.heure_fin === cf.heure_fin ? { ...l, heure_fin: val } : l));
                      }} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ ...LBL, color: '#1E40AF' }}>Type de session (commun)</label>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        {[
                          { val: 'ligne',      ic: '📹', lib: 'En ligne',   col: couleurTheme },
                          { val: 'presentiel', ic: '🏢', lib: 'Présentiel', col: '#F59E0B' },
                        ].map(({ val, ic, lib, col }) => {
                          const actif = (cf.type_session || 'ligne') === val;
                          return (
                            <button key={val} type="button"
                              onClick={() => setCF({ type_session: val, lien_visio: val === 'presentiel' ? '' : cf.lien_visio })}
                              style={{ flex:1, padding:'8px 10px', borderRadius:8, border:`2px solid ${actif ? col : COULEURS.gris200}`, background: actif ? `${col}15` : COULEURS.blanc, cursor:'pointer', textAlign:'center', transition:'all 0.15s', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}
                            >
                              <span>{ic}</span>
                              <span style={{ fontSize:12, fontWeight:700, color: actif ? col : COULEURS.navy }}>{lib}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {(cf.type_session || 'ligne') === 'ligne' && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ ...LBL, color: '#1E40AF' }}>Plateforme visio (commune)</label>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 7 }}>
                        {[
                          { id: 'zoom',  label: 'Zoom',        logo: '🔵', prefix: 'https://zoom.us/j/' },
                          { id: 'meet',  label: 'Google Meet',  logo: '🟢', prefix: 'https://meet.google.com/' },
                          { id: 'teams', label: 'Teams',        logo: '🟣', prefix: 'https://teams.microsoft.com/' },
                          { id: 'jitsi', label: 'Jitsi',        logo: '🟠', prefix: 'https://meet.jit.si/' },
                          { id: 'webex', label: 'Webex',        logo: '⚪', prefix: 'https://webex.com/' },
                          { id: 'autre', label: 'Autre',         logo: '🔗', prefix: '' },
                        ].map(p => {
                          const estActif = p.prefix !== '' && cf.lien_visio.startsWith(p.prefix);
                          const estActifAutre = p.id === 'autre' && cf.lien_visio !== '' && !['https://zoom.us/','https://meet.google.com/','https://teams.microsoft.com/','https://meet.jit.si/','https://webex.com/'].some(pfx => cf.lien_visio.startsWith(pfx));
                          return (
                            <button key={p.id} type="button"
                              onClick={() => { if (!cf.lien_visio || !cf.lien_visio.startsWith('http')) { const val = p.prefix; setCF({ lien_visio: val }); setSessionsMultiples(prev => prev.map(l => l.lien_visio === '' || l.lien_visio === cf.lien_visio ? { ...l, lien_visio: val } : l)); } }}
                              style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', border:`1.5px solid ${(estActif||estActifAutre)?'#6366F1':COULEURS.gris200}`, background:(estActif||estActifAutre)?'#EEF2FF':COULEURS.blanc, color:(estActif||estActifAutre)?'#4F46E5':COULEURS.gris600 }}>
                              {p.logo} {p.label}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        style={S.input}
                        placeholder="https://zoom.us/j/… (appliqué à toutes les sessions)"
                        value={cf.lien_visio}
                        onChange={e => {
                          const val = e.target.value;
                          setCF({ lien_visio: val });
                          setSessionsMultiples(prev => prev.map(l => l.lien_visio === '' || l.lien_visio === cf.lien_visio ? { ...l, lien_visio: val } : l));
                        }}
                      />
                    </div>
                    )}
                  </div>
                  {groupeChoisiMulti && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#1E40AF', fontWeight: 600 }}>
                      👥 {mesApprenants.filter(a => a.groupe_id === groupeChoisiMulti.id).length} apprenant(s) · {groupeChoisiMulti.tranche_age} · Niveaux {groupeChoisiMulti.cecr_min}→{groupeChoisiMulti.cecr_max}
                      {calcDuree(cf.heure_debut, cf.heure_fin) && <span style={{ marginLeft: 12 }}>⏱ {calcDuree(cf.heure_debut, cf.heure_fin)} / session</span>}
                    </div>
                  )}
                </div>

                {/* Générateur rapide */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: COULEURS.gris600, fontWeight: 600 }}>Générer rapidement :</span>
                  {[8, 10, 12, 14, 16, 20].map(n => (
                    <button
                      key={n}
                      onClick={() => genererLignes(n)}
                      style={{ padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1.5px solid ${sessionsMultiples.length === n ? couleurTheme : COULEURS.gris200}`, background: sessionsMultiples.length === n ? couleurTheme + '18' : COULEURS.blanc, color: sessionsMultiples.length === n ? couleurTheme : COULEURS.gris600, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                    >
                      {n} sessions
                    </button>
                  ))}
                  <span style={{ fontSize: 12, color: COULEURS.gris400, marginLeft: 6 }}>
                    - ou ajoutez manuellement ↓
                  </span>
                </div>

                {/* Import Excel */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '10px 14px' }}>
                  <span style={{ fontSize: 12, color: '#065F46', fontWeight: 600 }}>📊 Ou importez votre programmation depuis Excel :</span>
                  <label style={{ padding: '6px 14px', borderRadius: 8, background: '#059669', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                    ⬆ Importer un fichier
                    <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={importerExcel} />
                  </label>
                  <button onClick={telechargerModeleImport} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #A7F3D0', background: '#fff', color: '#065F46', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                    📥 Télécharger le modèle
                  </button>
                  <span style={{ fontSize: 11, color: '#059669' }}>Colonnes : Titre · Date (JJ/MM/AAAA) · Heure début · Heure fin · Lien (optionnel)</span>
                </div>

                {/* Liste des sessions */}
                <div>
                  <div style={{ fontSize: 10, color: COULEURS.gris400, marginBottom: 8, fontStyle: 'italic' }}>
                    ↺ = override possible par session (laisser vide = utilise la valeur commune)
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sessionsMultiples.map((ligne, idx) => {
                      const ok = ligne.titre.trim() && ligne.date_session;
                      const heureDebutPerso = ligne.heure_debut !== '' && ligne.heure_debut !== cf.heure_debut;
                      const heureFinPerso   = ligne.heure_fin   !== '' && ligne.heure_fin   !== cf.heure_fin;
                      const lienPerso       = ligne.lien_visio  !== '' && ligne.lien_visio  !== cf.lien_visio;
                      const styleOverride   = { borderColor: '#FCD34D', background: '#FFFBEB' };
                      const CT = { lecon:{bg:'#E0F2FE',txt:'#0E7490',ic:'📖'}, exercice:{bg:'#D1FAE5',txt:'#065F46',ic:'✏️'}, devoir:{bg:'#FEF3C7',txt:'#92400E',ic:'📝'}, audio:{bg:'#EDE9FE',txt:'#5B21B6',ic:'🎵'}, video:{bg:'#FEE2E2',txt:'#991B1B',ic:'🎬'}, document:{bg:'#F3F4F6',txt:'#374151',ic:'📄'} };
                      // Supports disponibles groupés par module
                      const disponibles = cf.groupe_id ? mesContenus.filter(c => contenuViseClasse(c, cf.groupe_id)) : [];
                      const modules = [...new Set(disponibles.map(c => c.module || '- Sans module -'))];
                      const idsLigne = ligne.contenu_ids || [];
                      return (
                        <div key={idx} style={{ borderRadius: 12, border: `1.5px solid ${ok ? couleurTheme + '50' : COULEURS.gris200}`, background: ok ? '#F0F9FF' : COULEURS.gris50, overflow: 'hidden' }}>
                          {/* Ligne principale */}
                          <div style={{ display: 'grid', gridTemplateColumns: '26px 1.4fr 140px 80px 80px 1fr 32px', gap: 6, padding: '10px 12px', alignItems: 'center' }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: ok ? couleurTheme : COULEURS.gris400, textAlign: 'center' }}>{idx + 1}</span>
                            <input
                              style={{ ...S.input, borderColor: ok ? couleurTheme + '60' : COULEURS.gris200, background: COULEURS.blanc }}
                              placeholder={`Session ${idx + 1}`}
                              value={ligne.titre}
                              onChange={e => setSessionsMultiples(prev => prev.map((l, i) => i === idx ? { ...l, titre: e.target.value } : l))}
                            />
                            <input type="date" style={{ ...S.input, background: COULEURS.blanc }} value={ligne.date_session}
                              onChange={e => setSessionsMultiples(prev => prev.map((l, i) => i === idx ? { ...l, date_session: e.target.value } : l))} />
                            <input type="time" style={{ ...S.input, ...(heureDebutPerso ? styleOverride : {}), fontSize: 12, padding: '7px 8px', background: COULEURS.blanc }}
                              placeholder={cf.heure_debut || '--:--'} value={ligne.heure_debut}
                              title={heureDebutPerso ? `Heure début : ${ligne.heure_debut}` : `Heure commune : ${cf.heure_debut || '-'}`}
                              onChange={e => setSessionsMultiples(prev => prev.map((l, i) => i === idx ? { ...l, heure_debut: e.target.value } : l))} />
                            <input type="time" style={{ ...S.input, ...(heureFinPerso ? styleOverride : {}), fontSize: 12, padding: '7px 8px', background: COULEURS.blanc }}
                              placeholder={cf.heure_fin || '--:--'} value={ligne.heure_fin}
                              title={heureFinPerso ? `Heure fin : ${ligne.heure_fin}` : `Heure commune : ${cf.heure_fin || '-'}`}
                              onChange={e => setSessionsMultiples(prev => prev.map((l, i) => i === idx ? { ...l, heure_fin: e.target.value } : l))} />
                            <input style={{ ...S.input, ...(lienPerso ? styleOverride : {}), fontSize: 11, background: COULEURS.blanc }}
                              placeholder={cf.lien_visio || 'Lien commun'} value={ligne.lien_visio}
                              onChange={e => setSessionsMultiples(prev => prev.map((l, i) => i === idx ? { ...l, lien_visio: e.target.value } : l))} />
                            <button onClick={() => setSessionsMultiples(prev => prev.filter((_, i) => i !== idx))}
                              style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${COULEURS.gris200}`, background: '#FEF2F2', color: '#EF4444', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
                          </div>

                          {/* Supports de cette session par module */}
                          {disponibles.length > 0 && (
                            <div style={{ borderTop: `1px solid ${COULEURS.gris200}`, padding: '10px 14px', background: COULEURS.blanc }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                                📚 Supports de cette session
                                {idsLigne.length > 0 && <span style={{ marginLeft: 8, background: couleurTheme + '20', color: couleurTheme, padding: '1px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, textTransform: 'none' }}>{idsLigne.length} sélectionné{idsLigne.length > 1 ? 's' : ''}</span>}
                              </div>
                              {modules.map(nomModule => {
                                const supportsModule = disponibles.filter(c => (c.module || '- Sans module -') === nomModule);
                                return (
                                  <div key={nomModule} style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: COULEURS.navy, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ background: '#DBEAFE', color: '#1E40AF', padding: '1px 8px', borderRadius: 20, fontSize: 10 }}>📦 {nomModule}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      {supportsModule.map(c => {
                                        const sel = idsLigne.includes(c.id);
                                        const ct = CT[c.type_contenu] || { bg: COULEURS.gris100, txt: COULEURS.gris600, ic: '📄' };
                                        return (
                                          <div key={c.id}
                                            onClick={() => setSessionsMultiples(prev => prev.map((l, i) => i === idx ? { ...l, contenu_ids: sel ? idsLigne.filter(id => id !== c.id) : [...idsLigne, c.id] } : l))}
                                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${sel ? couleurTheme : COULEURS.gris200}`, background: sel ? couleurTheme + '0D' : COULEURS.gris50, cursor: 'pointer' }}>
                                            <div style={{ width: 16, height: 16, borderRadius: 3, border: `2px solid ${sel ? couleurTheme : COULEURS.gris300}`, background: sel ? couleurTheme : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 800, flexShrink: 0 }}>{sel ? '✓' : ''}</div>
                                            <span style={{ padding: '1px 6px', borderRadius: 20, background: ct.bg, color: ct.txt, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{ct.ic} {c.type_contenu}</span>
                                            <span style={{ flex: 1, fontSize: 12, color: COULEURS.navy, fontWeight: sel ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.titre}</span>
                                            {!c.est_visible && <span style={{ fontSize: 10, color: '#D97706', background: '#FEF3C7', padding: '1px 6px', borderRadius: 10, fontWeight: 700, flexShrink: 0 }}>brouillon</span>}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setSessionsMultiples(prev => [...prev, { ...SESSION_LIGNE_VIDE, heure_debut: cf.heure_debut, heure_fin: cf.heure_fin, lien_visio: cf.lien_visio }])}
                    style={{ marginTop: 10, padding: '7px 16px', borderRadius: 8, border: `1.5px dashed ${couleurTheme}`, background: 'transparent', color: couleurTheme, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif', width: '100%' }}
                  >
                    + Ajouter une session
                  </button>
                </div>

                {/* Récap */}
                {valideMultiple && (
                  <div style={{ background: '#F0FDF4', borderRadius: 10, padding: '12px 16px', border: '1px solid #6EE7B7', fontSize: 13 }}>
                    <div style={{ fontWeight: 700, color: '#065F46', marginBottom: 6 }}>
                      ✅ {lignesValides.length} session{lignesValides.length > 1 ? 's' : ''} prête{lignesValides.length > 1 ? 's' : ''} à programmer
                      {sessionsMultiples.length - lignesValides.length > 0 && (
                        <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: '#D97706' }}>
                          · {sessionsMultiples.length - lignesValides.length} incomplète{sessionsMultiples.length - lignesValides.length > 1 ? 's' : ''} (ignorée{sessionsMultiples.length - lignesValides.length > 1 ? 's' : ''})
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#065F46' }}>
                      👥 {groupeChoisiMulti?.nom} · ⏰ {cf.heure_debut} – {cf.heure_fin}
                      {calcDuree(cf.heure_debut, cf.heure_fin) && ` · ${calcDuree(cf.heure_debut, cf.heure_fin)}/session`}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Pied */}
            <div style={{ padding: '14px 26px', borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: COULEURS.gris400 }}>* Champs obligatoires</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={fermer} style={S.btnGhost}>Annuler</button>
                {!modeMultiple && (
                  <button
                    disabled={!valideUnique || savingSession}
                    onClick={sauvegarderUnique}
                    style={{ ...S.btn(couleurTheme), opacity: (valideUnique && !savingSession) ? 1 : 0.45, cursor: (valideUnique && !savingSession) ? 'pointer' : 'not-allowed' }}
                  >
                    {savingSession ? '⏳ Envoi en cours…' : (modeEdition ? '✅ Enregistrer les modifications' : '🗓 Programmer la session')}
                  </button>
                )}
                {modeMultiple && (
                  <button
                    disabled={!valideMultiple || savingSession}
                    onClick={sauvegarderMultiple}
                    style={{ ...S.btn(COULEURS.succes), opacity: (valideMultiple && !savingSession) ? 1 : 0.45, cursor: (valideMultiple && !savingSession) ? 'pointer' : 'not-allowed' }}
                  >
                    {savingSession ? '⏳ Envoi en cours…' : `📋 Programmer ${lignesValides.length > 0 ? lignesValides.length : ''} session${lignesValides.length !== 1 ? 's' : ''}`}
                  </button>
                )}
              </div>
            </div>

          </div>
        </>
      );
    })()}

    {/* ══════════ MODAL PRÉSENCES (depuis Planning) ══════════ */}
    {modalPresenceSession && (() => {
      const sess       = mesSessions.find(s => s.id === modalPresenceSession);
      if (!sess) return null;
      const grp        = mesGroupes.find(g => g.id === sess.groupe_id) || groupesHistoriques[sess.groupe_id];
      const appsReelles = (apprenantsByClasse[sess.groupe_id] || [])
        .filter(a => a.statut !== 'suspendu')
        .map(a => {
          const p = (a.nom_complet || '').trim().split(/\s+/);
          return {
            id:          a.id,
            prenom:      p.length > 1 ? p.slice(0,-1).join(' ') : (p[0] || '?'),
            nom:         p.length > 1 ? p[p.length-1] : '?',
            niveau_cecr: a.niveau_cecr || '',
            tranche_age: a.tranche_age || '',
          };
        });
      const apprenants = appsReelles.length > 0
        ? appsReelles
        : (grp ? mesApprenants.filter(a => a.groupe_id === grp.id) : []);
      const st         = STATUT_SESSION[sess.statut] || STATUT_SESSION.realisee;
      const estSessionDeleg = !!sess._delegation;
      // Auteur réel de la saisie (récupéré du backend, cf. saisi_par) - prime sur une
      // simple déduction depuis le profil actuellement connecté, qui peut consulter une
      // session saisie par quelqu'un d'autre (ex : titulaire consultant une session couverte
      // par son remplaçant).
      const auteurReel = apprenants
        .map(a => presencesAuteurs[`${sess.id}__${a.id}`])
        .find(Boolean);
      const typeRoleSaisie  = auteurReel?.typeRole || ((estSessionDeleg || delegationActive) ? 'remplacant' : 'titulaire');
      const nomSaisie        = auteurReel ? `${auteurReel.prenom} ${auteurReel.nom}`.trim() : `${profile?.prenom || ''} ${profile?.nom || ''}`.trim();

      function sauvegarderPresences() {
        const marqueur = {
          id:       profile?.id || 'teacher-001',
          prenom:   profile?.prenom || 'Prof',
          nom:      profile?.nom || '',
          typeRole: typeRoleSaisie,
          date:     new Date().toISOString(),
        };
        const keysSession = apprenants.map(a => `${sess.id}__${a.id}`);
        setPresencesAuteurs(prev => ({
          ...prev,
          ...Object.fromEntries(keysSession.map(k => [k, marqueur])),
        }));
        setModalPresenceSession(null);
      }

      const nbPresent = apprenants.filter(a => presences[`${sess.id}__${a.id}`] === 'present').length;
      const nbAbsent  = apprenants.filter(a => presences[`${sess.id}__${a.id}`] === 'absent').length;
      const nbRetard  = apprenants.filter(a => presences[`${sess.id}__${a.id}`] === 'retard').length;
      const taux      = apprenants.length > 0 ? Math.round(nbPresent / apprenants.length * 100) : 0;

      return (
        <>
          {/* Fond */}
          <div
            onClick={() => setModalPresenceSession(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.6)', zIndex: 1100, backdropFilter: 'blur(3px)' }}
          />

          {/* Panneau */}
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '90vw', maxWidth: '90vw', height: '90vh', maxHeight: '90vh',
            background: COULEURS.blanc, borderRadius: 20,
            boxShadow: '0 28px 70px rgba(0,0,0,0.3)',
            zIndex: 1101, display: 'flex', flexDirection: 'column',
            overflow: 'hidden', fontFamily: '"Plus Jakarta Sans", sans-serif',
          }}>

            {/* En-tête */}
            <div style={{ background: `linear-gradient(135deg, ${COULEURS.navy} 0%, #0E4F6B 100%)`, padding: '20px 26px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                    Feuille de présence
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{sess.titre}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'flex', gap: 16, flexWrap:'wrap' }}>
                    <span>📅 {fmtDate(sess.date_session)}</span>
                    <span>⏰ {sess.heure_debut} – {sess.heure_fin}</span>
                    <span>👥 {grp?.nom}</span>
                  </div>
                  {/* Bandeau auteur saisie */}
                  <div style={{ marginTop:10, display:'inline-flex', alignItems:'center', gap:8, background: typeRoleSaisie === 'remplacant' ? 'rgba(124,58,237,0.35)' : (typeRoleSaisie === 'autre' ? 'rgba(107,114,128,0.35)' : 'rgba(16,185,129,0.25)'), borderRadius:8, padding:'5px 12px' }}>
                    <span style={{ fontSize:13 }}>{typeRoleSaisie === 'remplacant' ? '🔄' : (typeRoleSaisie === 'autre' ? '👤' : '👨‍🏫')}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:'#fff' }}>
                      Saisie par : {nomSaisie || '-'}
                      {typeRoleSaisie === 'remplacant'
                        ? ` (Remplaçant${delegationActive?.titulaire?.prenom ? ` de ${delegationActive.titulaire.prenom} ${delegationActive.titulaire.nom}` : ''})`
                        : typeRoleSaisie === 'autre'
                        ? ` (${auteurReel?.roleReel || 'Staff'})`
                        : ' (Titulaire)'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setModalPresenceSession(null)}
                  style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, width: 34, height: 34, color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >✕</button>
              </div>

              {/* KPIs rapides */}
              <div style={{ display: 'flex', gap: 20, marginTop: 16 }}>
                {[
                  { val: `${taux}%`, lbl: 'Taux présence', couleur: taux >= 75 ? '#4ADE80' : '#FCD34D' },
                  { val: nbPresent,  lbl: 'Présent(s)',    couleur: '#4ADE80' },
                  { val: nbAbsent,   lbl: 'Absent(s)',     couleur: '#FCA5A5' },
                  { val: nbRetard,   lbl: 'Retard(s)',     couleur: '#FCD34D' },
                  { val: apprenants.length, lbl: 'Effectif', couleur: 'rgba(255,255,255,0.7)' },
                ].map(k => (
                  <div key={k.lbl}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: k.couleur }}>{k.val}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>{k.lbl}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Corps - liste apprenants */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* Bandeau lecture seule pour sessions terminées */}
              {sess.statut === 'realisee' && (
                <div style={{ padding:'10px 22px', background:'#F0FDF4', borderBottom:`1px solid #6EE7B7`, display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:16 }}>✅</span>
                  <span style={{ fontSize:12, color:'#065F46', fontWeight:600 }}>Présences enregistrées - consultation uniquement.</span>
                </div>
              )}
              {apprenants.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: COULEURS.gris400 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>👥</div>
                  <div style={{ fontWeight: 600 }}>Aucun apprenant dans ce groupe</div>
                </div>
              ) : (
                <>
                  {/* En-tête tableau */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 1.6fr 1.4fr 1.4fr', padding: '10px 22px', background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris200}`, fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.05em', position: 'sticky', top: 0 }}>
                    <span>Apprenant</span>
                    <span>Niveau</span>
                    <span>Statut</span>
                    <span>Observation</span>
                    <span>Saisi par</span>
                  </div>

                  {apprenants.map((a, idx) => {
                    const key     = `${sess.id}__${a.id}`;
                    const statut  = presences[key] || 'non_renseigne';
                    const auteur  = presencesAuteurs[key];
                    return (
                      <div
                        key={a.id}
                        style={{
                          display: 'grid', gridTemplateColumns: '2fr 0.8fr 1.6fr 1.4fr 1.4fr',
                          padding: '13px 22px',
                          borderBottom: idx < apprenants.length - 1 ? `1px solid ${COULEURS.gris100}` : 'none',
                          alignItems: 'center', fontSize: 13,
                          background: statut === 'present' ? '#F0FDF4' : statut === 'absent' ? '#FFF5F5' : statut === 'retard' ? '#FFFBEB' : COULEURS.blanc,
                        }}
                      >
                        {/* Apprenant */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', background: couleurTheme + '20', border: `2px solid ${couleurTheme}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: couleurTheme, flexShrink: 0 }}>
                            {a.avatar_url ? (
                              <img src={a.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                            ) : <>{a.prenom[0]}{a.nom[0]}</>}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: COULEURS.navy }}>{a.prenom} {a.nom}</div>
                            <div style={{ fontSize: 10, color: COULEURS.gris400 }}>{a.tranche_age}</div>
                          </div>
                        </div>

                        {/* Niveau */}
                        <Puce label={a.niveau_cecr} fond="#E0F2FE" texte="#0E7490" />

                        {/* Statut */}
                        {sess.statut === 'realisee' ? (
                          // Lecture seule - badge coloré
                          (() => {
                            const cfg = PRESENCE_OPTIONS.find(o => o.val === statut);
                            return statut === 'non_renseigne' ? (
                              <span style={{ fontSize:11, color:COULEURS.gris400, fontStyle:'italic' }}>-</span>
                            ) : (
                              <span style={{ padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:700, background: cfg?.fond || COULEURS.gris100, color: cfg?.texte || COULEURS.gris600 }}>
                                {cfg?.label || statut}
                              </span>
                            );
                          })()
                        ) : (
                          // Éditable - boutons radio
                          <div style={{ display: 'flex', gap: 5 }}>
                            {PRESENCE_OPTIONS.map(opt => (
                              <button
                                key={opt.val}
                                onClick={() => setPresences(prev => ({ ...prev, [key]: opt.val }))}
                                style={{
                                  padding: '5px 9px', borderRadius: 16, fontSize: 11, fontWeight: 600,
                                  cursor: 'pointer', border: 'none', fontFamily: '"Plus Jakarta Sans", sans-serif',
                                  background: statut === opt.val ? opt.fond : COULEURS.gris100,
                                  color: statut === opt.val ? opt.texte : COULEURS.gris400,
                                  outline: statut === opt.val ? `2px solid ${opt.texte}40` : 'none',
                                  transition: 'all 0.12s',
                                }}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Observation */}
                        {sess.statut === 'realisee' ? (
                          <span style={{ fontSize:11, color:COULEURS.gris600, fontStyle: 'italic' }}>-</span>
                        ) : (
                          <input
                            placeholder={statut === 'absent' ? 'Motif absence…' : statut === 'retard' ? 'Durée du retard…' : '-'}
                            disabled={statut !== 'absent' && statut !== 'retard'}
                            style={{
                              padding: '5px 10px', borderRadius: 7,
                              border: `1px solid ${statut === 'absent' || statut === 'retard' ? COULEURS.gris200 : 'transparent'}`,
                              fontSize: 12, fontFamily: '"Plus Jakarta Sans", sans-serif',
                              background: statut === 'absent' || statut === 'retard' ? COULEURS.blanc : 'transparent',
                              color: COULEURS.gris600, width: '100%', boxSizing: 'border-box', outline: 'none',
                            }}
                          />
                        )}

                        {/* Saisi par */}
                        {auteur ? (
                          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                            <span style={{ fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:8, display:'inline-block', width:'fit-content', background: auteur.typeRole === 'remplacant' ? '#EDE9FE' : (auteur.typeRole === 'autre' ? '#E5E7EB' : '#D1FAE5'), color: auteur.typeRole === 'remplacant' ? '#6D28D9' : (auteur.typeRole === 'autre' ? '#374151' : '#065F46') }}>
                              {auteur.typeRole === 'remplacant' ? '🔄 Remplaçant' : (auteur.typeRole === 'autre' ? `👤 ${auteur.roleReel || 'Staff'}` : '👨‍🏫 Titulaire')}
                            </span>
                            <span style={{ fontSize:10, color:COULEURS.gris400 }}>{auteur.prenom} {auteur.nom}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize:10, color:COULEURS.gris300, fontStyle:'italic' }}>
                            {statut !== 'non_renseigne' && sess.statut !== 'realisee' ? '⏳ À enregistrer' : '-'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* Barre récap */}
            <div style={{ padding: '12px 22px', borderTop: `1px solid ${COULEURS.gris100}`, background: COULEURS.gris50, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: COULEURS.gris600, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {nbPresent + nbAbsent + nbRetard}/{apprenants.length} renseigné(s)
              </span>
              <div style={{ flex: 1, height: 5, background: COULEURS.gris200, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${apprenants.length > 0 ? Math.round((nbPresent + nbAbsent + nbRetard) / apprenants.length * 100) : 0}%`, background: couleurTheme, borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
            </div>

            {/* Pied */}
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', justifyContent: sess.statut === 'realisee' ? 'flex-end' : 'space-between', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              {sess.statut !== 'realisee' && (
                <div style={{ fontSize: 12, color: COULEURS.gris400, display:'flex', alignItems:'center', gap:8 }}>
                  <span>🕐 Horodatage automatique</span>
                  <span style={{ padding:'2px 8px', borderRadius:8, fontSize:11, fontWeight:700, background: typeRoleSaisie === 'remplacant' ? '#EDE9FE' : '#D1FAE5', color: typeRoleSaisie === 'remplacant' ? '#6D28D9' : '#065F46' }}>
                    {typeRoleSaisie === 'remplacant' ? '🔄 Saisie remplaçant' : '👨‍🏫 Saisie titulaire'}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                {sess.statut === 'realisee' ? (
                  <button onClick={() => setModalPresenceSession(null)} style={S.btn(COULEURS.navy)}>Fermer</button>
                ) : (
                  <>
                    <button onClick={() => setModalPresenceSession(null)} style={S.btnGhost}>Annuler</button>
                    <button onClick={sauvegarderPresences} style={S.btn(COULEURS.succes)}>
                      ✅ Enregistrer les présences
                    </button>
                  </>
                )}
              </div>
            </div>

          </div>
        </>
      );
    })()}

        {/* ══════════ PAIEMENTS (réel - honoraires_elearning_mois / seances_elearning) ══════════ */}
        {section === 'paiements' && (() => {
          const STATUT_HON_COACH = {
            en_attente: { lib:'En attente',         bg:'#FEF3C7', c:'#B45309', desc:"Le PA Advisor n'a pas encore vérifié ce mois." },
            valide:     { lib:'Validé (à envoyer)', bg:'#E0E7FF', c:'#4338CA', desc:"Le PA a validé le calcul, pas encore transmis à la RH - vous pouvez encore signaler un désaccord." },
            transmis:   { lib:'Transmis → RH',       bg:'#DBEAFE', c:'#1D4ED8', desc:'Envoyé à la RH/Paie pour paiement.' },
            paye:       { lib:'Payé',                bg:'#D1FAE5', c:'#065F46', desc:'Virement effectué.' },
            litige:     { lib:'Litige',              bg:'#FEE2E2', c:'#991B1B', desc:'Fiche en litige - contactez votre PA Advisor.' },
          };
          const STATUT_SEANCE_COACH = {
            en_attente: { lib:'En attente', bg:'#FEF3C7', c:'#B45309' },
            valide:     { lib:'Validée',    bg:'#DBEAFE', c:'#1D4ED8' },
            rejete:     { lib:'Rejetée',    bg:'#FEE2E2', c:'#991B1B' },
          };
          const stHon = STATUT_HON_COACH[monHonoraire?.statut] || STATUT_HON_COACH.en_attente;

          return (
          <div>
            {/* En-tête + sélecteur mois/année */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 }}>
              <div>
                <div style={S.titreSec}>💰 Mes honoraires e-learning</div>
                <div style={{ fontSize:12, color:COULEURS.gris400, marginTop:-8 }}>
                  Calculés par le PA Advisor à partir de vos séances réalisées
                </div>
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                {_MOIS_PAIE.slice(1).map((m, i) => (
                  <button key={m} onClick={() => setPaieMois(i + 1)}
                    style={{ padding:'4px 9px', borderRadius:20, border:'none', fontSize:11, fontWeight:700, cursor:'pointer', background:paieMois===i+1?couleurTheme:COULEURS.gris100, color:paieMois===i+1?'#fff':COULEURS.gris600 }}>
                    {m}
                  </button>
                ))}
                {[2024,2025,2026,2027].map(y => (
                  <button key={y} onClick={() => setPaieAnnee(y)}
                    style={{ padding:'4px 9px', borderRadius:20, border:'none', fontSize:11, fontWeight:700, cursor:'pointer', background:paieAnnee===y?couleurTheme:COULEURS.gris100, color:paieAnnee===y?'#fff':COULEURS.gris600 }}>
                    {y}
                  </button>
                ))}
              </div>
            </div>

            {paieLoading ? (
              <div style={S.vide}>⏳ Chargement…</div>
            ) : !monHonoraire ? (
              <div style={S.vide}>
                Aucune fiche d'honoraires pour {_MOIS_PAIE[paieMois]} {paieAnnee}.<br/>
                <span style={{ fontSize:11 }}>Elle apparaîtra ici une fois calculée par votre PA Advisor.</span>
              </div>
            ) : (
              <>
                {/* Statut de la fiche */}
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, flexWrap:'wrap' }}>
                  <span style={{ padding:'4px 12px', borderRadius:20, background:stHon.bg, color:stHon.c, fontSize:12, fontWeight:700 }}>{stHon.lib}</span>
                  <span style={{ fontSize:12, color:COULEURS.gris400 }}>{stHon.desc}</span>
                </div>

                {/* KPIs */}
                <div style={S.grille('repeat(4,1fr)')}>
                  {[
                    { val: `${(monHonoraire.nb_heures||0).toFixed(1)}h`, lbl: 'Heures réalisées', acc:'#7C3AED', sub:`${monHonoraire.nb_seances||0} séance${(monHonoraire.nb_seances||0)>1?'s':''}` },
                    { val: fmtFCFA(monHonoraire.tarif_horaire||0), lbl: 'Tarif horaire', acc:couleurTheme, sub:'Votre grille tarifaire' },
                    { val: fmtFCFA(monHonoraire.retenues||0), lbl: 'Retenues', acc:'#DC2626', sub: monHonoraire.note_pa || 'Aucune' },
                    { val: fmtFCFA(monHonoraire.montant_net||0), lbl: 'Montant net', acc:COULEURS.succes, sub: stHon.lib },
                  ].map(k => (
                    <div key={k.lbl} style={{ ...S.carte(k.acc), padding:'16px 18px' }}>
                      <div style={{ fontSize:18, fontWeight:800, color:k.acc, marginBottom:2 }}>{k.val}</div>
                      <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy }}>{k.lbl}</div>
                      <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{k.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Tableau des séances */}
                {monHonSeances.length === 0 ? (
                  <div style={S.vide}>Aucune séance associée à cette fiche.</div>
                ) : (
                  <div style={S.tableau}>
                    <div style={S.thead('1.3fr 1.5fr 1.3fr 0.8fr 0.8fr 1fr 1fr')}>
                      <span>Date</span><span>Groupe</span><span>Créneau</span><span>Durée</span><span>Apprenants</span><span>Montant</span><span>Statut</span>
                    </div>
                    {monHonSeances.map((s, idx) => {
                      const stS = STATUT_SEANCE_COACH[s.honoraire_statut_pa] || STATUT_SEANCE_COACH.en_attente;
                      return (
                        <div key={s.id} onClick={() => setHonSeanceDetail(s)}
                          style={{ ...S.trow('1.3fr 1.5fr 1.3fr 0.8fr 0.8fr 1fr 1fr'), borderBottom: idx < monHonSeances.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', cursor:'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.background = COULEURS.gris50}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <span style={{ fontSize:12, color:COULEURS.gris600 }}>{fmtDate(s.date)}</span>
                          <span style={{ fontSize:12, fontWeight:600, color:COULEURS.navy }}>
                            {s.classe_nom}
                            {s.remplacement_id && (
                              <span title={s.remplacement_absent_nom ? `Remplacement de ${s.remplacement_absent_nom}` : "Séance de remplacement"}
                                style={{ marginLeft:6, padding:'1px 7px', borderRadius:8, fontSize:9, fontWeight:800, background:'#EDE9FE', color:'#6D28D9' }}>🔄 Remplacement</span>
                            )}
                          </span>
                          <span style={{ fontSize:12, color:COULEURS.gris600 }}>{s.heure_debut?.slice(0,5)}–{s.heure_fin?.slice(0,5)}</span>
                          <span style={{ fontSize:12, fontWeight:600, color:COULEURS.navy }}>{s.duree_heures.toFixed(2)}h</span>
                          <span style={{ fontSize:12, color:COULEURS.gris600 }}>{s.nb_presents||0}</span>
                          <span style={{ fontSize:13, fontWeight:800, color: s.honoraire_statut_pa==='rejete'?COULEURS.gris400:'#7C3AED', textDecoration: s.honoraire_statut_pa==='rejete'?'line-through':'none' }}>{fmtFCFA(s.montant)}</span>
                          <span style={{ padding:'3px 10px', borderRadius:20, background:stS.bg, color:stS.c, fontSize:11, fontWeight:700, whiteSpace:'nowrap' }}>{stS.lib}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Détail d'une séance - porté depuis dash (EspaceProfesseur.jsx, onglet Honoraires) */}
            {honSeanceDetail && (() => {
              const s = honSeanceDetail;
              const stS = STATUT_SEANCE_COACH[s.honoraire_statut_pa] || STATUT_SEANCE_COACH.en_attente;
              return (
                <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.55)', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
                  onClick={e => { if (e.target === e.currentTarget) setHonSeanceDetail(null); }}>
                  <div style={{ background:COULEURS.blanc, borderRadius:16, width:'100%', maxWidth:560, maxHeight:'88vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,.25)' }}>
                    <div style={{ padding:'18px 22px', borderBottom:`1px solid ${COULEURS.gris100}`, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <div>
                        <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>{s.classe_nom || 'Séance'}</div>
                        <div style={{ fontSize:12, color:COULEURS.gris500, marginTop:3 }}>
                          {s.date ? new Date(s.date).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) : '-'}
                        </div>
                      </div>
                      <button onClick={() => setHonSeanceDetail(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:COULEURS.gris400 }}>✕</button>
                    </div>
                    <div style={{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:14 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:stS.bg, color:stS.c }}>{stS.lib}</span>
                        {s.remplacement_id && (
                          <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:'#EDE9FE', color:'#6D28D9' }}>
                            🔄 {s.remplacement_absent_nom ? `Remplacement de ${s.remplacement_absent_nom}` : 'Séance de remplacement'}
                          </span>
                        )}
                        {s.honoraire_statut_pa_note && (
                          <span style={{ fontSize:11, color:'#B91C1C' }}>- {s.honoraire_statut_pa_note}</span>
                        )}
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                        <div style={{ background:COULEURS.gris50, borderRadius:8, padding:'10px 12px', border:`1px solid ${COULEURS.gris200}` }}>
                          <div style={{ fontSize:9, color:COULEURS.gris400, fontWeight:700, marginBottom:3, textTransform:'uppercase' }}>Créneau</div>
                          <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{s.heure_debut?.slice(0,5) || '-'}{s.heure_fin ? ` – ${s.heure_fin.slice(0,5)}` : ''}</div>
                        </div>
                        <div style={{ background:COULEURS.gris50, borderRadius:8, padding:'10px 12px', border:`1px solid ${COULEURS.gris200}` }}>
                          <div style={{ fontSize:9, color:COULEURS.gris400, fontWeight:700, marginBottom:3, textTransform:'uppercase' }}>Durée</div>
                          <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{(s.duree_heures||0).toFixed(2)}h</div>
                        </div>
                        <div style={{ background:COULEURS.gris50, borderRadius:8, padding:'10px 12px', border:`1px solid ${COULEURS.gris200}` }}>
                          <div style={{ fontSize:9, color:COULEURS.gris400, fontWeight:700, marginBottom:3, textTransform:'uppercase' }}>Type</div>
                          <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{s.type || '-'}</div>
                        </div>
                        <div style={{ background:'#F0FDF4', borderRadius:8, padding:'10px 12px', border:'1px solid #BBF7D0' }}>
                          <div style={{ fontSize:9, color:'#15803D', fontWeight:700, marginBottom:3, textTransform:'uppercase' }}>Montant honoraire</div>
                          <div style={{ fontSize:14, fontWeight:800, color: s.honoraire_statut_pa==='rejete' ? COULEURS.gris400 : '#15803D', textDecoration: s.honoraire_statut_pa==='rejete' ? 'line-through' : 'none' }}>{fmtFCFA(s.montant||0)}</div>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize:9, color:COULEURS.gris400, fontWeight:700, marginBottom:6, textTransform:'uppercase' }}>Présences</div>
                        {honSeancePresencesLoading ? (
                          <div style={{ fontSize:12, color:COULEURS.gris400 }}>Chargement…</div>
                        ) : honSeancePresences.length === 0 ? (
                          <div style={{ fontSize:12, color:COULEURS.gris400 }}>Aucune présence enregistrée pour cette séance.</div>
                        ) : (
                          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                            {honSeancePresences.map(p => (
                              <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 10px', background:COULEURS.gris50, borderRadius:7, border:`1px solid ${COULEURS.gris100}` }}>
                                <span style={{ fontSize:12, fontWeight:600, color:COULEURS.navy }}>{p.classes_elearning_apprenants?.nom_complet || '-'}</span>
                                <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20,
                                  background: p.statut==='present' ? '#DCFCE7' : p.statut==='retard' ? '#FEF3C7' : p.statut==='excuse' ? '#DBEAFE' : '#FEE2E2',
                                  color: p.statut==='present' ? '#166534' : p.statut==='retard' ? '#92400E' : p.statut==='excuse' ? '#1E40AF' : '#991B1B' }}>
                                  {p.statut==='present' ? 'Présent' : p.statut==='absent' ? 'Absent' : p.statut==='retard' ? 'En retard' : p.statut==='excuse' ? 'Excusé' : p.statut || '-'}
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

            {/* Légende statuts */}
            <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:16 }}>
              {Object.entries(STATUT_HON_COACH).map(([k, v]) => (
                <div key={k} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
                  <span style={{ padding:'2px 9px', borderRadius:20, background:v.bg, color:v.c, fontWeight:700 }}>{v.lib}</span>
                  <span style={{ color:COULEURS.gris400 }}>{v.desc}</span>
                </div>
              ))}
            </div>
          </div>
          );
        })()}

        {section === 'recompenses' && <OngletRecompenses />}

        {/* LES QUATRE ÉCRANS DE PARITÉ avec l'Espace Professeur de dash. Dans un fichier à
            part : celui-ci dépasse déjà 9 000 lignes. */}
        {section === 'mes_taches'      && <SectionCoachMesTaches      couleur={couleurTheme} profile={profile} />}
        {section === 'disponibilites'  && <SectionCoachDisponibilites couleur={couleurTheme} />}
        {section === 'contrats'        && <SectionCoachContrats       couleur={couleurTheme} profile={profile} />}
        {section === 'mon_profil'      && <SectionCoachProfil         couleur={couleurTheme} />}

      </div>
    </TopNavLayout>

    {/* ══════════ MODAL SIGNALEMENT ABSENCE ══════════ */}
    {modalAbsence && (() => {
      const sessionsDispos = sessionsDansPeriode(formAbsence.dateDebut, formAbsence.dateFin);
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

      const nbSelectionnes = formAbsence.sessionsIds.filter(id =>
        sessionsDispos.some(s => s.id === id)
      ).length;

      return (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:18, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 60px rgba(0,0,0,0.2)' }}>

            {/* En-tête */}
            <div style={{ padding:'20px 24px', borderBottom:'1px solid #F1F5F9', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:'#0F172A' }}>🚨 Signaler une absence</div>
                <div style={{ fontSize:12, color:'#64748B', marginTop:2 }}>Le PA Advisor sera notifié pour assigner un remplaçant</div>
              </div>
              <button onClick={() => setModalAbsence(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#64748B', lineHeight:1 }}>×</button>
            </div>

            {absenceEnvoyee ? (
              /* ── Confirmation ── */
              <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:40, textAlign:'center' }}>
                <div style={{ fontSize:52, marginBottom:16 }}>✅</div>
                <div style={{ fontSize:17, fontWeight:800, color:'#0F172A', marginBottom:8 }}>Demande envoyée au PA Advisor</div>
                <div style={{ fontSize:13, color:'#64748B', marginBottom:24, lineHeight:1.6 }}>
                  Le PA Advisor a été notifié. Il assignera un remplaçant dès que possible.<br/>
                  Vous pouvez suivre l'avancement dans l'onglet <strong>Remplacements</strong>.
                </div>
                <button
                  onClick={() => setModalAbsence(false)}
                  style={{ background:'#7C3AED', color:'#fff', border:'none', borderRadius:10, padding:'10px 28px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                >
                  Fermer
                </button>
              </div>
            ) : (
              <>
              {/* Corps */}
              <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>

                {/* Motif */}
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Motif</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {MOTIFS_ABSENCE.map(m => (
                      <button
                        key={m}
                        onClick={() => setFormAbsence(p => ({ ...p, motif: m }))}
                        style={{ padding:'7px 14px', borderRadius:20, fontSize:12, fontWeight:600, border:`1.5px solid ${formAbsence.motif === m ? '#7C3AED' : '#E2E8F0'}`, background:formAbsence.motif === m ? '#EDE9FE' : '#fff', color:formAbsence.motif === m ? '#6D28D9' : '#64748B', cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', transition:'all 0.15s' }}
                      >{m}</button>
                    ))}
                  </div>
                </div>

                {/* Période */}
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Période d'absence</div>
                  <div style={{ display:'flex', gap:12 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:11, color:'#94A3B8', marginBottom:4 }}>Du</div>
                      <input
                        type="date"
                        value={formAbsence.dateDebut}
                        onChange={e => {
                          const d = e.target.value;
                          setFormAbsence(p => ({
                            ...p,
                            dateDebut: d,
                            dateFin: p.dateFin < d ? d : p.dateFin,
                            sessionsIds: [],
                          }));
                        }}
                        style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F0', fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', boxSizing:'border-box', outline:'none' }}
                      />
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:11, color:'#94A3B8', marginBottom:4 }}>Au</div>
                      <input
                        type="date"
                        value={formAbsence.dateFin}
                        min={formAbsence.dateDebut}
                        onChange={e => setFormAbsence(p => ({ ...p, dateFin: e.target.value, sessionsIds: [] }))}
                        style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F0', fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', boxSizing:'border-box', outline:'none' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Sessions dans la période */}
                {formAbsence.dateDebut && formAbsence.dateFin && (
                  <div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                        Sessions concernées
                        {sessionsDispos.length > 0 && (
                          <span style={{ marginLeft:8, fontSize:11, fontWeight:600, color:'#7C3AED', background:'#EDE9FE', padding:'2px 8px', borderRadius:10 }}>
                            {nbSelectionnes}/{sessionsDispos.length} sélectionnée{sessionsDispos.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      {sessionsDispos.length > 1 && (
                        <button
                          onClick={selectionnerToutes}
                          style={{ fontSize:11, fontWeight:600, color:'#7C3AED', background:'none', border:'none', cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                        >{toutesSelectionnees ? 'Tout décocher' : 'Tout sélectionner'}</button>
                      )}
                    </div>
                    {sessionsDispos.length === 0 ? (
                      <div style={{ background:'#F8FAFC', borderRadius:10, padding:'14px 16px', fontSize:13, color:'#94A3B8', textAlign:'center', border:'1px dashed #E2E8F0' }}>
                        Aucune session planifiée sur cette période
                      </div>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        {sessionsDispos.map(s => {
                          const groupe = mesGroupes.find(g => g.id === s.groupe_id);
                          const coche  = formAbsence.sessionsIds.includes(s.id);
                          return (
                            <div
                              key={s.id}
                              onClick={() => toggleSession(s.id)}
                              style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:10, border:`1.5px solid ${coche ? '#7C3AED' : '#E2E8F0'}`, background:coche ? '#F5F3FF' : '#fff', cursor:'pointer', transition:'all 0.15s' }}
                            >
                              <div style={{ width:18, height:18, borderRadius:5, border:`2px solid ${coche ? '#7C3AED' : '#CBD5E1'}`, background:coche ? '#7C3AED' : '#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s' }}>
                                {coche && <span style={{ color:'#fff', fontSize:11, fontWeight:900 }}>✓</span>}
                              </div>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:13, fontWeight:600, color:'#0F172A' }}>{s.titre}</div>
                                <div style={{ fontSize:11, color:'#64748B' }}>
                                  📅 {fmtDate(s.date_session)} · ⏰ {s.heure_debut}–{s.heure_fin} · 👥 {groupe?.nom || '-'}
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
                  <div style={{ fontSize:12, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Message au PA Advisor <span style={{ fontWeight:400, textTransform:'none' }}>(optionnel)</span></div>
                  <textarea
                    value={formAbsence.message}
                    onChange={e => setFormAbsence(p => ({ ...p, message: e.target.value }))}
                    placeholder="Précisez si besoin : durée estimée, préférence de remplaçant, consignes particulières…"
                    rows={3}
                    style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1.5px solid #E2E8F0', fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', resize:'vertical', boxSizing:'border-box', outline:'none' }}
                  />
                </div>

              </div>

              {/* Pied */}
              <div style={{ padding:'14px 24px', borderTop:'1px solid #F1F5F9', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0, gap:12 }}>
                <button onClick={() => setModalAbsence(false)} style={{ background:'none', border:'1.5px solid #E2E8F0', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:600, cursor:'pointer', color:'#64748B', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                  Annuler
                </button>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  {absenceErreur && <span style={{ fontSize:12, color:'#DC2626', fontWeight:600 }}>{absenceErreur}</span>}
                  <button
                    onClick={envoyerDemandeAbsence}
                    disabled={absenceEnvoi || !formAbsence.dateDebut || !formAbsence.dateFin || (sessionsDansPeriode(formAbsence.dateDebut, formAbsence.dateFin).length > 0 && formAbsence.sessionsIds.length === 0)}
                    style={{ background: (!formAbsence.dateDebut || !formAbsence.dateFin) ? '#E2E8F0' : '#EF4444', color: (!formAbsence.dateDebut || !formAbsence.dateFin) ? '#94A3B8' : '#fff', border:'none', borderRadius:8, padding:'9px 22px', fontSize:13, fontWeight:700, cursor:(absenceEnvoi || !formAbsence.dateDebut || !formAbsence.dateFin) ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                  >
                    {absenceEnvoi ? '⏳ Envoi…' : '🚨 Envoyer au PA Advisor'}
                  </button>
                </div>
              </div>
              </>
            )}
          </div>
        </div>
      );
    })()}

    {/* ══════════ MODAL SESSION PRÉSENTIELLE ══════════ */}
    {presentielModal && (() => {
      const ps = presentielModal;
      const groupe = mesGroupes.find(g => g.id === ps.groupe_id);
      const appsGroupe = (apprenantsByClasse[ps.groupe_id] || []).filter(a => a.statut !== 'suspendu');
      const nbPresents = Object.values(presencesPresentiel).filter(v => v === 'present').length;
      const nbNonRenseignesPre = appsGroupe.filter(a => !presencesPresentiel[a.id] || presencesPresentiel[a.id] === 'non_renseigne').length;
      const preOk = appsGroupe.length === 0 || nbNonRenseignesPre === 0;

      function demanderCloturePresentiel() {
        setConfirmGeneral({
          titre: 'Clôturer la séance ?',
          message: 'Les présences seront sauvegardées et la séance marquée comme réalisée.',
          icone: '⏹',
          couleur: '#065F46',
          boutonLabel: '⏹ Clôturer la séance',
          onConfirm: cloturerPresentiel,
        });
      }
      async function cloturerPresentiel() {
        const nonRenseignesPre = appsGroupe.filter(a => !presencesPresentiel[a.id] || presencesPresentiel[a.id] === 'non_renseigne');
        if (appsGroupe.length > 0 && nonRenseignesPre.length > 0) {
          await alerte(`⚠️ Renseignez d'abord les présences : ${nonRenseignesPre.length} apprenant(s) sans statut.`, { danger: true });
          return;
        }
        const token = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
        // Sauvegarder les présences via l'API si session réelle - AVANT de mettre à jour
        // l'écran, pour ne rien afficher comme réussi si le serveur refuse.
        if (ps._real && token) {
          const rows = appsGroupe.map(a => ({
            inscription_id: a.inscription_id || a.id,
            statut: presencesPresentiel[a.id] || 'absent',
          }));
          try {
            const rPres = await fetch(`${_PROF_API}/api/elearning/seances/${ps.id}/presences`, {
              method: 'POST', headers: _profHdrs(), body: JSON.stringify({ presences: rows }),
            });
            if (!rPres.ok) {
              const d = await rPres.json().catch(() => ({}));
              toast.error(d.error || "L'enregistrement des présences a été refusé", { duration: 5000 });
              return;
            }
            const rSeance = await fetch(`${_PROF_API}/api/elearning/seances/${ps.id}`, {
              method: 'PATCH', headers: _profHdrs(), body: JSON.stringify({ statut: 'realisee' }),
            });
            if (!rSeance.ok) {
              const d = await rSeance.json().catch(() => ({}));
              toast.error(d.error || 'La clôture de la session a été refusée', { duration: 5000 });
              return;
            }
          } catch (e) {
            toast.error('Impossible de joindre le serveur', { duration: 5000 });
            return;
          }
        }
        setSessionsLocales(prev => prev.map(s => s.id === ps.id ? { ...s, statut: 'realisee' } : s));
        setSessionsCloturees(prev => new Set([...prev, ps.id]));
        setPresentielModal(null);
        setPresencesPresentiel({});
      }

      return (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.75)', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:18, width:'90vw', height:'90vh', maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>

            {/* Header vert */}
            <div style={{ background:'linear-gradient(135deg,#065F46,#059669)', padding:'18px 22px', color:'#fff', flexShrink:0 }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginBottom:4, letterSpacing:'0.1em', textTransform:'uppercase' }}>🏢 Session présentielle</div>
              <div style={{ fontSize:18, fontWeight:900, marginBottom:6 }}>{ps.titre}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', display:'flex', gap:14, flexWrap:'wrap' }}>
                <span>📅 {fmtDate(ps.date_session)}</span>
                <span>⏰ {ps.heure_debut}{ps.heure_fin ? ` – ${ps.heure_fin}` : ''}</span>
                {groupe && <span>👥 {groupe.nom}</span>}
              </div>
            </div>

            {/* Liste présences */}
            <div style={{ flex:1, overflowY:'auto', padding:'18px 22px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <div style={{ fontSize:14, fontWeight:800, color:'#0F172A' }}>👥 Feuille de présence</div>
                <div style={{ fontSize:13, color:'#059669', fontWeight:700 }}>
                  {nbPresents}/{appsGroupe.length} présent{nbPresents > 1 ? 's' : ''}
                </div>
              </div>

              {appsGroupe.length === 0 ? (
                <div style={{ textAlign:'center', padding:'30px 0', color:COULEURS.gris400, fontSize:13 }}>
                  Aucun apprenant dans le groupe
                </div>
              ) : appsGroupe.map(a => {
                const statut  = presencesPresentiel[a.id] || 'non_renseigne';
                const _parts  = (a.nom_complet || '').trim().split(/\s+/);
                const prenom  = a.prenom_apprenant || a.prenom || (_parts.length > 1 ? _parts.slice(0, -1).join(' ') : _parts[0]) || '?';
                const nom     = a.nom_apprenant    || a.nom    || (_parts.length > 1 ? _parts[_parts.length - 1] : '') || '?';
                return (
                  <div key={a.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderBottom:`1px solid ${COULEURS.gris100}`, background:statut==='present'?'#F0FDF4':statut==='absent'?'#FEF2F2':statut==='retard'?'#FFFBEB':'#fff', borderRadius:8, marginBottom:4 }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:couleurTheme+'20', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:couleurTheme, fontSize:12, flexShrink:0 }}>
                      {prenom[0]?.toUpperCase()}{nom[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>{prenom} {nom}</div>
                      <div style={{ fontSize:10, color:COULEURS.gris400 }}>{a.niveau_cecr || ''}</div>
                    </div>
                    <div style={{ display:'flex', gap:4 }}>
                      {[['present','P','#059669','#D1FAE5'],['retard','R','#D97706','#FEF3C7'],['absent','A','#DC2626','#FEE2E2']].map(([val,lib,txt,bg]) => (
                        <button key={val}
                          onClick={() => setPresencesPresentiel(prev => ({ ...prev, [a.id]: val }))}
                          style={{ width:30, height:30, borderRadius:6, border:`1.5px solid ${statut===val?txt:COULEURS.gris200}`, background:statut===val?bg:'#fff', color:statut===val?txt:COULEURS.gris400, fontSize:11, fontWeight:800, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                          {lib}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Résumé */}
              {appsGroupe.length > 0 && (
                <div style={{ display:'flex', gap:16, padding:'10px 14px', background:COULEURS.gris50, borderRadius:8, marginTop:8, fontSize:12 }}>
                  {[['✅ Présents',Object.values(presencesPresentiel).filter(v=>v==='present').length,'#059669'],
                    ['⏱ Retard',Object.values(presencesPresentiel).filter(v=>v==='retard').length,'#D97706'],
                    ['❌ Absents',Object.values(presencesPresentiel).filter(v=>v==='absent').length,'#DC2626']].map(([lib,n,c]) => (
                    <span key={lib} style={{ fontWeight:700, color:c }}>{lib} : {n}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding:'14px 22px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', gap:10, flexShrink:0 }}>
              <button
                onClick={() => { setPresentielModal(null); setPresencesPresentiel({}); }}
                style={{ padding:'11px 20px', borderRadius:10, border:`1.5px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.navy, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                Fermer
              </button>
              <button
                onClick={demanderCloturePresentiel}
                disabled={!preOk}
                title={!preOk ? `Renseignez d'abord les présences (${nbNonRenseignesPre} manquante${nbNonRenseignesPre>1?'s':''})` : ''}
                style={{ flex:1, padding:'12px', borderRadius:10, border:'none', background:preOk?'#059669':'#9ca3af', color:'#fff', fontSize:13, fontWeight:700, cursor:preOk?'pointer':'not-allowed', opacity:preOk?1:0.7, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                {preOk ? '✅ Clôturer la séance' : `⚠️ ${nbNonRenseignesPre} présence(s) manquante(s)`}
              </button>
            </div>
          </div>
        </div>
      );
    })()}

    {/* ══ Modal vidéo Jitsi flottant (professeur) ══ */}
    {modalVideoOuvert && salleOuverte && (() => {
      const session = mesSessions.find(s => s.id === salleOuverte);
      if (!session || session.lien_visio) return null;
      const _appModal = classesReelles.length > 0
        ? (apprenantsByClasse[session.groupe_id] || []).filter(a => a.statut !== 'suspendu')
        : mesApprenants.filter(a => a.groupe_id === session.groupe_id);
      const _nbNonRens = _appModal.filter(a => !presencesLive[a.id] || presencesLive[a.id] === 'non_renseigne').length;
      const _presOk = _appModal.length === 0 || _nbNonRens === 0;
      return (
        <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.82)', backdropFilter:'blur(6px)', display:'flex', flexDirection:'column' }}>
          {/* Header */}
          <div style={{ background:'linear-gradient(135deg,#0F172A,#0E4F6B)', padding:'12px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0, flexWrap:'wrap', gap:10 }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:'#EF4444', boxShadow:'0 0 6px #EF4444' }} />
                <span style={{ fontSize:14, fontWeight:800, color:'#fff' }}>{session.titre}</span>
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:2 }}>⏰ {session.heure_debut} – {session.heure_fin} · Jitsi</div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button
                onClick={() => setModalVideoOuvert(false)}
                title="Masquer la vidéo (la session continue)"
                style={{ padding:'6px 14px', borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.7)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                ⤓ Masquer
              </button>
              <button
                disabled={!_presOk}
                onClick={() => _presOk && setConfirmGeneral({ titre:'Clôturer la session ?', message:'Les présences seront sauvegardées.', icone:'⏹', couleur:'#EF4444', boutonLabel:'⏹ Clôturer', onConfirm:() => { cloturerSalle(session); setModalVideoOuvert(false); } })}
                title={!_presOk ? `${_nbNonRens} présence(s) manquante(s)` : 'Clôturer la session'}
                style={{ padding:'6px 14px', borderRadius:8, border:'none', background: _presOk ? 'rgba(239,68,68,0.8)' : 'rgba(156,163,175,0.6)', color:'#fff', fontSize:12, fontWeight:700, cursor: _presOk ? 'pointer' : 'not-allowed', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                ⏹ Clôturer{!_presOk ? ` (${_nbNonRens}⚠️)` : ''}
              </button>
            </div>
          </div>
          {/* iFrame Jitsi */}
          <div style={{ flex:1, minHeight:0 }}>
            <SalleVirtuelle
              session={session}
              profil={profile}
              role="professeur"
              hauteur={window.innerHeight - 56}
              onQuitter={() => setModalVideoOuvert(false)}
            />
          </div>
        </div>
      );
    })()}

    </>
  );
}
