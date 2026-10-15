// DashboardSuperviseur.jsx - Module Superviseur Général extrait de DashboardAdmin.jsx (profil admin_superviseur)
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { usePrompt, useConfirm } from '../../contexts/ConfirmContext';
import { COULEURS } from '../../constants/couleurs';
import { useAuth } from '../../contexts/AuthContext';
import { accesSalle, MINUTES_OUVERTURE_SALLE } from '../../utils/ouvertureSalle';
import PastilleGroupe from '../../components/shared/PastilleGroupe';
import { urlOuvrir } from '../../utils/fichierUrl';
import { exporterAppraisalCoachs } from '../../utils/exporterAppraisalCoachs';
import { exporterClassementCoachs } from '../../utils/exporterClassementCoachs';
import DerouleReel from '../../components/shared/DerouleReel';
import BadgeCategorieCoach, { FlecheTendance } from '../../components/shared/BadgeCategorieCoach';
import { CATEGORIES_COACH, CATEGORIE_SANS_NOTE, categorieCoach, NOTE_COULEUR, NOTE_FOND } from '../../utils/categorieCoach';
import { CRITERES_LECTURE, libelleLecon, libelleObservation, libelleInternet } from '../../utils/criteresObservation';

const _API_URL_ADMIN = process.env.REACT_APP_API_URL || 'http://localhost:5001';

// ══════════════════════════════════════════════════════════════════════════
// SUPERVISEUR GÉNÉRAL - Cahiers coachs / Rapports Deputy / Anomalies / Deputies
// Ces 5 onglets consomment les mêmes endpoints /api/superviseur/* que le Deputy Superviseur
// (déjà branché côté bet-elearning). Le backend tague/filtre désormais chaque ligne par
// "plateforme" (dash vs bet-elearning), donc ces données ne se mélangent jamais avec dash.
// ══════════════════════════════════════════════════════════════════════════
const SUP_COLOR = '#7C3AED';

function fmtDateSup(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function supAuthHdrs() {
  // admin_token uniquement (comme _authHdrsAdmin) : bet_access_token peut être le token d'une
  // session apprenant/professeur restée en cache dans le même navigateur, ce qui envoyait le
  // mauvais rôle au backend et déclenchait un 403 "Accès réservé aux superviseurs".
  const token = localStorage.getItem('admin_token') || '';
  // dash et bet-elearning partagent le même rôle DB pour le module Superviseur - ce header
  // est l'unique moyen pour le backend de savoir que la requête vient de bet-elearning.
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Plateforme': 'bet-elearning' };
}

function StatCardSup({ label, value, color, icon, sub, onClick }) {
  return (
    <div onClick={onClick} style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', border: `1.5px solid ${color}25`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{icon}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: COULEURS.gris400, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ModalSup({ title, subtitle, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 18, width: '90vw', height: '90vh', maxWidth: 'none', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ background: `linear-gradient(135deg,${SUP_COLOR},#5B21B6)`, borderRadius: '18px 18px 0 0', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#fff', fontSize: 18 }}>×</button>
        </div>
        <div style={{ padding: '22px 24px' }}>{children}</div>
      </div>
    </div>
  );
}

const SUP_STATUT_RAPPORT = {
  soumis:      { bg: '#DBEAFE', txt: '#1D4ED8', lib: 'Soumis' },
  lu:          { bg: '#FEF3C7', txt: '#D97706', lib: 'Lu' },
  transmis_pa: { bg: '#D1FAE5', txt: '#065F46', lib: 'Transmis PA' },
};

/* ═══════════════════════════════════════════════════════════════════════════
   LE DOSSIER D'UN COACH - le modal qu'ouvre un clic sur sa ligne.
   ═══════════════════════════════════════════════════════════════════════════
   Pendant du modal coach du superviseur de dash, avec ses huit onglets.

   ⚠️ CHAQUE ONGLET EST REBRANCHÉ SUR LA SOURCE E-LEARNING. La version dash lit
   `/api/groupes` et `/api/seances` - les tables de dash. Les recopier ici aurait affiché
   les classes et les séances de dash dans un écran bet-elearning, la même fuite que celle
   corrigée sur les apprenants, l'audit, la vue d'ensemble et les messages. On lit donc
   `/api/classes-elearning` et `/api/classes-elearning/seances`.

   Trois sources sont en revanche légitimement communes, parce qu'elles décrivent LA
   PERSONNE et non une plateforme : ses disponibilités, les modules qu'il a rédigés, et les
   fichiers que ces modules contiennent.
═══════════════════════════════════════════════════════════════════════════ */

const COACH_TABS = [
  { id: 'infos',         icon: '👤', label: 'Infos' },
  { id: 'observations',  icon: '📋', label: 'Observations' },
  { id: 'classes',       icon: '🏫', label: 'Classes' },
  { id: 'seances',       icon: '📆', label: 'Séances' },
  { id: 'disponibilite', icon: '📅', label: 'Disponibilités' },
  { id: 'modules',       icon: '🧩', label: 'Modules e-learning' },
  { id: 'ressources',    icon: '📂', label: 'Ressources partagées' },
  { id: 'archive',       icon: '🗄️', label: 'Archive' },
];

const MOIS_FR_SUP = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                     'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const PAR_PAGE_COACH = 10;

const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/* `hhmm` est défini plus bas dans ce fichier (horaires de séance) et partagé ici. */

/**
 * `coach_disponibilites` stocke UNE LIGNE PAR HEURE (jour + créneau h07, h08…).
 * Listées à plat et triées par heure de début, les mêmes jours réapparaissent en
 * alternance (Lundi h07, Jeudi h07, Dimanche h07, Jeudi h08, Lundi h08…) : ça se lit
 * comme des doublons alors que chaque ligne est bien distincte. On regroupe donc par
 * jour dans l'ordre de la semaine, et on fusionne les heures qui se touchent en une
 * seule plage (4 lignes de 07h→11h deviennent « 07:00 – 11:00 »).
 */
function grouperDispos(dispos) {
  const parJour = {};
  (dispos || []).forEach((d) => {
    if (!d?.jour) return;
    (parJour[d.jour] = parJour[d.jour] || []).push(d);
  });
  return JOURS_SEMAINE
    .filter((j) => (parJour[j] || []).length > 0)
    .map((jour) => {
      const creneaux = parJour[jour].slice().sort((a, b) => hhmm(a.debut).localeCompare(hhmm(b.debut)));
      const plages = [];
      creneaux.forEach((c) => {
        const derniere = plages[plages.length - 1];
        if (derniere && hhmm(derniere.fin) === hhmm(c.debut)) derniere.fin = c.fin;
        else plages.push({ debut: c.debut, fin: c.fin });
      });
      return { jour, plages, nb: creneaux.length };
    });
}

/**
 * Filtrage par date + pagination, pour les tableaux du dossier coach.
 *
 * Un seul crochet pour les six tableaux : six copies auraient divergé au premier
 * ajustement (taille de page, bornes incluses ou non, remise à la page 1 après filtrage).
 *
 * LES DEUX BORNES SONT INCLUSES, et la borne haute couvre la journée entière - comparer une
 * date seule à un horodatage exclurait tout ce qui a été créé après minuit le dernier jour.
 */
function useTableauCoach(lignes, champDate) {
  const [du, setDu]     = useState('');
  const [au, setAu]     = useState('');
  const [page, setPage] = useState(1);

  const filtrees = (lignes || []).filter(l => {
    if (!du && !au) return true;
    const brut = champDate ? l[champDate] : null;
    if (!brut) return false;                       // sans date, une ligne ne peut pas être datée
    const d = new Date(brut);
    if (Number.isNaN(d.getTime())) return false;
    if (du && d < new Date(`${du}T00:00:00`)) return false;
    if (au && d > new Date(`${au}T23:59:59`)) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtrees.length / PAR_PAGE_COACH));
  // Supprimer un filtre peut laisser la page courante au-delà du dernier écran : sans ce
  // recadrage, le tableau paraîtrait vide alors qu'il porte des lignes.
  const pageSure = Math.min(page, totalPages);
  const visibles = filtrees.slice((pageSure - 1) * PAR_PAGE_COACH, pageSure * PAR_PAGE_COACH);

  const reinit = () => { setDu(''); setAu(''); setPage(1); };
  const majDu  = (v) => { setDu(v); setPage(1); };
  const majAu  = (v) => { setAu(v); setPage(1); };

  return { du, au, majDu, majAu, reinit, page: pageSure, setPage, visibles,
           total: filtrees.length, totalBrut: (lignes || []).length, totalPages };
}

function FiltreDates({ t, libelle = 'Filtrer par date' }) {
  const champ = { padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 12, fontFamily: 'inherit', color: COULEURS.navy };
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{libelle}</span>
      <input type="date" value={t.du} onChange={e => t.majDu(e.target.value)} style={champ} aria-label="Date de début" />
      <span style={{ color: COULEURS.gris400, fontSize: 12 }}>→</span>
      <input type="date" value={t.au} onChange={e => t.majAu(e.target.value)} style={champ} aria-label="Date de fin" />
      {(t.du || t.au) && (
        <>
          <button onClick={t.reinit}
            style={{ padding: '6px 11px', borderRadius: 8, border: `1px solid ${COULEURS.gris200}`, background: '#fff', fontSize: 11.5, color: COULEURS.gris600, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
            ✕ Réinitialiser
          </button>
          {/* Dire combien de lignes le filtre écarte : un tableau qui rétrécit sans
              explication passe pour une donnée manquante. */}
          <span style={{ fontSize: 11.5, color: COULEURS.gris400 }}>
            {t.total} sur {t.totalBrut}
          </span>
        </>
      )}
    </div>
  );
}

function PaginationCoach({ t }) {
  if (t.totalPages <= 1) return null;
  const pages = Array.from({ length: t.totalPages }, (_, i) => i + 1)
    // Au-delà de sept écrans, on garde une fenêtre glissante autour de la page courante :
    // aligner trente boutons rendrait la barre illisible.
    .filter(p => t.totalPages <= 7 || p === 1 || p === t.totalPages || Math.abs(p - t.page) <= 1);

  const btn = (actif) => ({
    padding: '5px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
    border: `1.5px solid ${actif ? SUP_COLOR : COULEURS.gris200}`,
    background: actif ? SUP_COLOR : '#fff',
    color: actif ? '#fff' : COULEURS.gris600, fontWeight: actif ? 800 : 500,
  });

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
      <button onClick={() => t.setPage(p => Math.max(1, p - 1))} disabled={t.page === 1}
        style={{ ...btn(false), cursor: t.page === 1 ? 'default' : 'pointer', opacity: t.page === 1 ? 0.45 : 1 }}>← Préc.</button>
      {pages.map((p, i) => (
        <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && p - pages[i - 1] > 1 && <span style={{ color: COULEURS.gris400, fontSize: 12 }}>…</span>}
          <button onClick={() => t.setPage(p)} style={btn(p === t.page)}>{p}</button>
        </span>
      ))}
      <button onClick={() => t.setPage(p => Math.min(t.totalPages, p + 1))} disabled={t.page === t.totalPages}
        style={{ ...btn(false), cursor: t.page === t.totalPages ? 'default' : 'pointer', opacity: t.page === t.totalPages ? 0.45 : 1 }}>Suiv. →</button>
      <span style={{ fontSize: 11.5, color: COULEURS.gris400, marginLeft: 4 }}>{t.total} ligne{t.total > 1 ? 's' : ''}</span>
    </div>
  );
}

/** Un bloc vide qui DIT pourquoi il est vide, au lieu d'un écran blanc. */
function VideSup({ icone = '📭', titre, detail }) {
  return (
    <div style={{ textAlign: 'center', padding: '44px 20px', background: COULEURS.gris50, borderRadius: 12, border: `1px dashed ${COULEURS.gris200}` }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>{icone}</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: COULEURS.navy }}>{titre}</div>
      {detail && <div style={{ fontSize: 12, color: COULEURS.gris400, marginTop: 5, lineHeight: 1.6, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>{detail}</div>}
    </div>
  );
}

/* Un onglet qui n'a PAS PU charger n'est pas un onglet vide : le confondre avec « aucune
   donnée » a déjà fait passer une route inexistante pour un coach sans séances. On le dit,
   on donne le code HTTP, et on propose de réessayer. */
function ErreurSup({ detail, onReessayer }) {
  return (
    <div style={{ textAlign: 'center', padding: '44px 20px', background: '#FEF2F2', borderRadius: 12, border: `1px dashed ${COULEURS.erreur}55` }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: COULEURS.erreur }}>Chargement impossible</div>
      <div style={{ fontSize: 12, color: COULEURS.gris600, marginTop: 5, lineHeight: 1.6, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
        Cet onglet n'a pas pu récupérer ses données — ce n'est pas qu'il n'y en a aucune.
        {detail ? <><br /><span style={{ color: COULEURS.gris400 }}>Détail : {detail}</span></> : null}
      </div>
      {onReessayer && (
        <button onClick={onReessayer}
          style={{ marginTop: 14, padding: '7px 16px', borderRadius: 8, border: `1.5px solid ${COULEURS.erreur}`, background: COULEURS.blanc,
            color: COULEURS.erreur, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          🔄 Réessayer
        </button>
      )}
    </div>
  );
}

function TableauSup({ colonnes, lignes, rendu }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${COULEURS.gris200}`, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: COULEURS.gris50 }}>
              {colonnes.map(h => (
                <th key={h} style={{ padding: '9px 13px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{lignes.map(rendu)}</tbody>
        </table>
      </div>
    </div>
  );
}

function ModalCoachDetail({ coach, ongletInitial = 'infos', onFermer, onSignaler }) {
  /* Sert à marquer « vous » sur les rapports que l'utilisateur a lui-même déposés : le
     dossier d'un coach liste désormais les observations de tout le monde. */
  const { profile: profilCourant } = useAuth();
  // La classe ouverte depuis le sous-onglet « Classes » — une modale par-dessus la fiche coach.
  const [classeOuverte, setClasseOuverte] = useState(null);
  // Le module dont on lit le contenu, par-dessus la fiche coach.
  const [moduleOuvert, setModuleOuvert] = useState(null);
  const [onglet, setOnglet] = useState(ongletInitial);
  const [chargement, setChargement] = useState(false);
  // Ce qui a échoué, pour ne pas afficher un état vide à la place d'une panne.
  const [erreur, setErreur] = useState(null);
  // Incrémenté par « Réessayer » : relance l'effet sans changer d'onglet.
  const [relance, setRelance] = useState(0);

  const [observations, setObservations] = useState([]);
  const [classes,      setClasses]      = useState([]);
  const [seances,      setSeances]      = useState([]);
  const [dispos,       setDispos]       = useState([]);
  const [modules,      setModules]      = useState([]);
  const [ressources,   setRessources]   = useState([]);
  const [sansChat,     setSansChat]     = useState(false);

  const _now = new Date();
  const [dispoMois,  setDispoMois]  = useState(_now.getMonth() + 1);
  const [dispoAnnee, setDispoAnnee] = useState(_now.getFullYear());

  // Un tableau filtrable et paginé par onglet, chacun sur SA colonne de date.
  const tObs     = useTableauCoach(observations, 'date_observation');
  const tClasses = useTableauCoach(classes,      'date_debut');
  // `seances_elearning` date sa séance dans `date` — pas `date_seance`, qui est la colonne
  // du présentiel : filtrer dessus ne retenait jamais rien.
  const tSeances = useTableauCoach(seances,      'date');
  const tModules = useTableauCoach(modules,      'created_at');
  const tRess    = useTableauCoach(ressources,   'created_at');
  const archivees = classes.filter(cl => cl.statut === 'clos' || cl.statut === 'archive');
  const tArchive = useTableauCoach(archivees,    'date_fin');

  /* Chaque onglet charge À SON OUVERTURE et non au montage : ouvrir un dossier
     déclencherait sinon huit requêtes dont sept pour des onglets jamais regardés. */
  useEffect(() => {
    if (!coach?.id) return;
    let vivant = true;
    const lire = async (url) => {
      const r = await fetch(`${_API_URL_ADMIN}${url}`, { headers: supAuthHdrs() });
      if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
      return r.json();
    };
    (async () => {
      setChargement(true);
      setErreur(null);
      try {
        if (onglet === 'observations') {
          /* `coach_id` en paramètre, et non un tri côté client : c'est lui qui fait passer
             la route en « dossier d'un coach », où un deputy voit TOUS les rapports du
             coach et non les seuls siens. Le filtre local reste en garde-fou. */
          const d = await lire(`/api/superviseur/rapports-deputy?coach_id=${coach.id}`);
          if (vivant) setObservations((d.rapports || []).filter(r => String(r.coach_id) === String(coach.id)));
        } else if (onglet === 'classes' || onglet === 'archive') {
          const d = await lire(`/api/classes-elearning?coach_id=${coach.id}`);
          if (vivant) setClasses(d.classes || []);
        } else if (onglet === 'seances') {
          /* `/api/elearning/seances` et NON `/api/classes-elearning/seances` : cette
             dernière n'existe pas, l'URL tombait sur `GET /:id` avec id="seances" et le
             dossier annonçait « aucune séance » pour un coach qui en avait cinq.
             La route renvoie `seances_elearning` brute : le nom de la classe n'y est pas,
             on le rapporte depuis la liste des classes du coach. */
          const [d, dc] = await Promise.all([
            lire(`/api/elearning/seances?coach_id=${coach.id}`),
            lire(`/api/classes-elearning?coach_id=${coach.id}`).catch(() => ({ classes: [] })),
          ]);
          const nomParClasse = {};
          (dc.classes || []).forEach(cl => { nomParClasse[cl.id] = cl.nom; });
          if (vivant) setSeances((d.seances || []).map(s => ({ ...s, classe_nom: nomParClasse[s.classe_id] || null })));
        } else if (onglet === 'disponibilite') {
          const d = await lire(`/api/coachs/${coach.id}/disponibilites?mois=${dispoMois}&annee=${dispoAnnee}`);
          if (vivant) setDispos(Array.isArray(d.disponibilites) ? d.disponibilites : []);
        } else if (onglet === 'modules') {
          /* Route dédiée du superviseur bet-elearning, et NON `/api/cours-elearning` :
             cette dernière liste les modules par `coach_id` seul, donc les modules de dash.
             Celle-ci ne garde que ceux rattachés à une classe e-learning. */
          const d = await lire(`/api/superviseur/coachs/${coach.id}/modules`);
          if (vivant) setModules(d.modules || []);
        } else if (onglet === 'ressources') {
          const d = await lire(`/api/superviseur/coachs/${coach.id}/ressources`);
          if (vivant) { setRessources(d.ressources || []); setSansChat(!!d.sans_fichiers_chat); }
        }
      } catch (e) {
        /* On NE confond plus une panne avec un onglet vide : l'écran le dit. */
        if (vivant) setErreur(e?.message || 'erreur inconnue');
      }
      finally { if (vivant) setChargement(false); }
    })();
    return () => { vivant = false; };
  }, [onglet, coach?.id, dispoMois, dispoAnnee, relance]);

  const nomCoach = `${coach.prenom || ''} ${coach.nom || ''}`.trim() || 'Coach';
  const cell = { padding: '9px 13px', verticalAlign: 'top' };

  const NATURE_ICONE = { image: '🖼️', audio: '🎵', video: '🎬', pdf: '📄', document: '📎' };

  return (
    <ModalSup
      /* LA PHOTO DU COACH, celle de son compte (`utilisateurs.avatar_url`) - la même que
         l'administrateur BET enregistre depuis dash, et que montrent déjà les fils de
         discussion. Repli sur les initiales quand il n'y en a pas. */
      title={(
        <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <PastilleGroupe nom={nomCoach} url={coach.avatar_url} taille={36} accent="#fff" agrandissable />
          <span>{nomCoach}</span>
          {/* La catégorie de contrat dès l'en-tête : c'est le verdict qu'on vient
              chercher, il ne doit pas se mériter en ouvrant un onglet. */}
          <BadgeCategorieCoach note={coach.note_moyenne} taille="sm" avecNote />
        </span>
      )}
      subtitle={coach.email} onClose={onFermer}>
      {/* ONGLETS */}
      <div style={{ display: 'flex', borderBottom: `2px solid ${COULEURS.gris200}`, marginBottom: 18, overflowX: 'auto' }}>
        {COACH_TABS.map(t => {
          const actif = onglet === t.id;
          return (
            <button key={t.id} onClick={() => setOnglet(t.id)}
              style={{ padding: '11px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                borderBottom: `3px solid ${actif ? SUP_COLOR : 'transparent'}`, marginBottom: -2,
                fontWeight: actif ? 700 : 500, color: actif ? SUP_COLOR : COULEURS.gris600,
                fontSize: 12, whiteSpace: 'nowrap', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>

      {chargement && <div style={{ textAlign: 'center', padding: 36, color: COULEURS.gris400, fontSize: 13 }}>Chargement…</div>}

      {!chargement && erreur && <ErreurSup detail={erreur} onReessayer={() => setRelance(n => n + 1)} />}

      {/* ── INFOS ── */}
      {!chargement && onglet === 'infos' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 14 }}>
          {[
            ['Nom complet',        nomCoach],
            ['Surnom',             coach.surnom || '-'],
            ['E-mail',             coach.email || '-'],
            ['Périmètre',          coach.scope || '-'],
            ['Dernière connexion', fmtDateSup(coach.derniere_connexion)],
            ['Classes e-learning', coach.nb_groupes ?? 0],
            ['Observations',       coach.nb_rapports_deputy ?? 0],
            ['Évaluations',        coach.nb_evaluations ?? 0],
            ['Note moyenne',       coach.note_moyenne ? `${coach.note_moyenne}/5` : '-'],
            ['Anomalies ouvertes', coach.nb_anomalies ?? 0],
            ['Compte',             coach.acces_bloque ? '🔒 Bloqué' : coach.actif === false ? 'Inactif' : '✅ Actif'],
          ].map(([l, v]) => (
            <div key={l} style={{ background: COULEURS.gris50, borderRadius: 10, padding: '11px 14px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l}</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: COULEURS.navy, marginTop: 3 }}>{v}</div>
            </div>
          ))}
          {onSignaler && (
            <button onClick={() => onSignaler(coach)}
              style={{ gridColumn: '1 / -1', padding: '10px 16px', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 10, color: '#B91C1C', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              ⚠️ Signaler une anomalie sur ce coach
            </button>
          )}
        </div>
      )}

      {/* ── OBSERVATIONS ── */}
      {!chargement && !erreur && onglet === 'observations' && (
        observations.length === 0
          ? <VideSup icone="📋" titre="Aucun rapport d'observation"
              /* Le dossier d'un coach montre désormais TOUS ses rapports, au deputy comme au
                 superviseur : une liste vide veut donc dire qu'aucune observation n'existe,
                 et plus « vous n'avez pas encore écrit la vôtre ». */
              detail="Aucune observation n'a encore été déposée sur ce coach, ni par les Deputy Superviseurs ni par le Superviseur Général." />
          : <>
            <FiltreDates t={tObs} libelle="Date d'observation" />
            {/* « Observateur » et non « Deputy » : le Superviseur Général dépose lui aussi
                des rapports, et la colonne lisait `deputy_nom` — un champ que la route ne
                renvoie pas (elle enrichit `deputy: {prenom, nom}`), d'où un tiret partout. */}
            <TableauSup colonnes={['Date', 'Observateur', 'Classe', 'Note', 'Statut']} lignes={tObs.visibles}
              rendu={r => {
                const st = SUP_STATUT_RAPPORT[r.statut] || SUP_STATUT_RAPPORT.soumis;
                const auteur = `${r.deputy?.prenom || ''} ${r.deputy?.nom || ''}`.trim();
                const estMoi = String(r.deputy_id) === String(profilCourant?.id);
                return (
                  <tr key={r.id} style={{ borderTop: `1px solid ${COULEURS.gris100}` }}>
                    <td style={cell}>{fmtDateSup(r.date_observation)}</td>
                    <td style={cell}>
                      {auteur || '-'}
                      {estMoi && <span style={{ marginLeft: 6, background: COULEURS.cyanClair, color: COULEURS.cyanFonce, padding: '1px 7px', borderRadius: 9, fontSize: 10, fontWeight: 700 }}>vous</span>}
                    </td>
                    <td style={cell}>{r.classe || r.groupe_nom || '-'}</td>
                    <td style={cell}>
                      <CercleNote note={r.note_globale} taille={36} />
                    </td>
                    <td style={cell}><span style={{ background: st.bg, color: st.txt, padding: '2px 9px', borderRadius: 10, fontSize: 10.5, fontWeight: 700 }}>{st.lib}</span></td>
                  </tr>
                );
              }} />
            <PaginationCoach t={tObs} />
          </>
      )}

      {/* ── CLASSES ── */}
      {!chargement && !erreur && onglet === 'classes' && (
        classes.length === 0
          ? <VideSup icone="🏫" titre="Aucune classe e-learning"
              detail="Ce coach n'est titulaire d'aucune classe sur cette plateforme. Ses éventuelles classes présentiel relèvent de dash et ne sont pas listées ici." />
          : <>
            <FiltreDates t={tClasses} libelle="Date de début" />
            {/* LA CLASSE S'OUVRE. Le tableau listait cinq colonnes sans aucun moyen d'entrer
                dans la classe : le superviseur voyait qu'elle existait, sans pouvoir savoir
                qui la suit, quand elle se réunit, ni ce qui y a été partagé. */}
            <TableauSup colonnes={['Classe', 'Niveau', 'Entreprise', 'Début', 'Statut']} lignes={tClasses.visibles}
              rendu={cl => (
                <tr key={cl.id} onClick={() => setClasseOuverte(cl)}
                  title={`Ouvrir ${cl.nom || 'la classe'}`}
                  style={{ borderTop: `1px solid ${COULEURS.gris100}`, cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = COULEURS.gris50; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                  <td style={{ ...cell, fontWeight: 700, color: COULEURS.navy }}>{cl.nom}</td>
                  <td style={cell}>{cl.niveau || '-'}</td>
                  <td style={cell}>{cl.entreprise_nom || '-'}</td>
                  <td style={cell}>{fmtDateSup(cl.date_debut)}</td>
                  <td style={cell}>{cl.statut || '-'}</td>
                </tr>
              )} />
            <PaginationCoach t={tClasses} />
          </>
      )}

      {/* ── SÉANCES ── */}
      {!chargement && !erreur && onglet === 'seances' && (
        seances.length === 0
          ? <VideSup icone="📆" titre="Aucune séance"
              detail="Les séances e-learning de ce coach s'afficheront ici dès qu'une classe lui sera assignée." />
          : <>
            <FiltreDates t={tSeances} libelle="Date de séance" />
            <TableauSup colonnes={['Date', 'Classe', 'Horaire', 'Durée', 'Statut']} lignes={tSeances.visibles}
              rendu={s => (
                <tr key={s.id} style={{ borderTop: `1px solid ${COULEURS.gris100}` }}>
                  <td style={cell}>{fmtDateSup(s.date || s.date_seance)}</td>
                  <td style={cell}>{s.classe_nom || s.classe || '-'}</td>
                  <td style={cell}>{s.heure_debut ? `${hhmm(s.heure_debut)}${s.heure_fin ? ` – ${hhmm(s.heure_fin)}` : ''}` : '-'}</td>
                  <td style={cell}>{s.duree_minutes ? `${s.duree_minutes} min` : '-'}</td>
                  <td style={cell}>{s.statut || '-'}</td>
                </tr>
              )} />
            <PaginationCoach t={tSeances} />
          </>
      )}

      {/* ── DISPONIBILITÉS ── */}
      {/* ── DISPONIBILITÉS ──
          RÉTABLI, et désormais propre à la plateforme. `coach_disponibilites` porte une
          colonne `plateforme` (Backend/sql/coach_disponibilites_plateforme.sql) et le coach
          déclare ses créneaux e-learning depuis son propre espace. Cet onglet montrait
          auparavant les créneaux déclarés pour le présentiel : on l'avait vidé plutôt que
          d'emprunter la donnée du voisin. */}
      {!chargement && !erreur && onglet === 'disponibilite' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={dispoMois} onChange={e => setDispoMois(Number(e.target.value))}
              style={{ padding: '7px 11px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 12, fontFamily: 'inherit' }}>
              {MOIS_FR_SUP.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select value={dispoAnnee} onChange={e => setDispoAnnee(Number(e.target.value))}
              style={{ padding: '7px 11px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 12, fontFamily: 'inherit' }}>
              {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <span style={{ fontSize: 11.5, color: COULEURS.gris400 }}>
              Créneaux déclarés pour BET E-Learning uniquement.
            </span>
          </div>
          {dispos.length === 0
            ? <VideSup icone="📅" titre="Aucune disponibilité déclarée"
                detail={`Ce coach n'a déclaré aucun créneau e-learning pour ${MOIS_FR_SUP[dispoMois - 1]} ${dispoAnnee}. `
                  + "Ses disponibilités présentiel relèvent de dash et ne sont pas listées ici."} />
            : (() => {
                const jours = grouperDispos(dispos);
                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 10 }}>
                      {jours.map(({ jour, plages, nb }) => (
                        <div key={jour} style={{ background: COULEURS.blanc, border: `1.5px solid ${COULEURS.cyan}30`, borderRadius: 12, padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginBottom: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 12, color: COULEURS.cyan }}>📅 {jour}</span>
                            <span style={{ fontSize: 10.5, color: COULEURS.gris400 }}>{nb} h</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {plages.map((p, i) => (
                              <span key={i} style={{ background: COULEURS.cyanClair, color: COULEURS.cyanFonce, borderRadius: 7, padding: '3px 10px', fontSize: 12, fontWeight: 600, width: 'fit-content' }}>
                                🕐 {hhmm(p.debut)} – {hhmm(p.fin)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: COULEURS.gris400, textAlign: 'right', marginTop: 12 }}>
                      {dispos.length} heure{dispos.length !== 1 ? 's' : ''} déclarée{dispos.length !== 1 ? 's' : ''} · {jours.length} jour{jours.length !== 1 ? 's' : ''}
                    </div>
                  </>
                );
              })()}
        </>
      )}

      {/* ── MODULES E-LEARNING ── */}
      {!chargement && !erreur && onglet === 'modules' && (
        modules.length === 0
          ? <VideSup icone="🧩" titre="Aucun module e-learning"
              detail={"Seuls les modules rattachés à une classe de cette plateforme sont listés. "
                + "Les modules que ce coach a rédigés pour ses classes présentiel relèvent de dash "
                + "et n'apparaissent pas ici."} />
          : <>
            <FiltreDates t={tModules} libelle="Date de création" />
            <TableauSup colonnes={['Module', 'Statut', 'Blocs', 'Classes', 'Créé le']} lignes={tModules.visibles}
              rendu={m => (
                <tr key={m.id} onClick={() => setModuleOuvert(m)}
                  title="Voir le contenu de ce module"
                  style={{ borderTop: `1px solid ${COULEURS.gris100}`, cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = COULEURS.gris50; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                  <td style={{ ...cell, fontWeight: 700, color: COULEURS.navy }}>{m.titre || m.nom || '-'}</td>
                  {/* Un brouillon est signalé : c'est ce qu'il reste à relire avant
                      publication, et c'est la seule chose qui sépare un contenu écrit d'un
                      contenu que les apprenants reçoivent. */}
                  <td style={cell}>
                    {m.statut === 'publie'
                      ? <span style={{ background: '#D1FAE5', color: '#065F46', borderRadius: 9, padding: '2px 9px', fontSize: 10.5, fontWeight: 700 }}>publié</span>
                      : <span style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 9, padding: '2px 9px', fontSize: 10.5, fontWeight: 700 }}>📝 {m.statut || 'brouillon'}</span>}
                  </td>
                  <td style={cell}>{m.nb_blocs ?? (Array.isArray(m.blocs) ? m.blocs.length : '-')}</td>
                  <td style={cell}>{m.classes?.length ? m.classes.join(', ') : '-'}</td>
                  <td style={cell}>{fmtDateSup(m.created_at)}</td>
                </tr>
              )} />
            <PaginationCoach t={tModules} />
          </>
      )}

      {/* ── RESSOURCES PARTAGÉES ── */}
      {!chargement && !erreur && onglet === 'ressources' && (
        <>
          {sansChat && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '11px 14px', marginBottom: 14, fontSize: 12, color: '#78350F', lineHeight: 1.6 }}>
              <strong>Les pièces jointes du chat de classe ne figurent pas ici.</strong> Sur cette
              plateforme, le chat de classe vit dans Firestore et ses fichiers n'ont pas de ligne en
              base - contrairement à dash. Cet onglet liste donc les fichiers contenus dans les
              modules du coach.
            </div>
          )}
          {ressources.length === 0
            ? <VideSup icone="📂" titre="Aucune ressource partagée"
                detail="Les fichiers contenus dans les modules e-learning de ce coach apparaîtront ici." />
            : <>
              <FiltreDates t={tRess} libelle="Date de dépôt" />
              <TableauSup colonnes={['Fichier', 'Nature', 'Module', 'Classes', 'Déposé le']} lignes={tRess.visibles}
                rendu={r => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${COULEURS.gris100}` }}>
                    <td style={cell}>
                      {/* `urlOuvrir` ET NON L'URL BRUTE. Les documents (pdf, docx, pptx…)
                          sont stockés en `raw` chez Cloudinary, qui les refuse publiquement :
                          le lien direct renvoyait un 401 et le fichier ne s'ouvrait pas. Le
                          relais signé du serveur est le seul chemin qui marche pour eux. */}
                      <a href={urlOuvrir(r.url, r.nom)} target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: SUP_COLOR, textDecoration: 'none' }}>{r.nom}</a>
                      {r.masque && <span style={{ marginLeft: 7, fontSize: 10, color: '#92400E', background: '#FEF3C7', padding: '1px 7px', borderRadius: 9, fontWeight: 700 }}>non publié</span>}
                    </td>
                    <td style={cell}>{NATURE_ICONE[r.nature] || '📎'} {r.nature}</td>
                    {/* Deux origines : un bloc de module, ou un fichier déposé sur la
                        classe — ce dernier n'a pas de module et affichait « - ». */}
                    <td style={cell}>{r.contexte?.module_titre || r.contexte?.classe_nom || '-'}</td>
                    <td style={cell}>{r.classes?.length ? r.classes.join(', ') : '-'}</td>
                    <td style={cell}>{fmtDateSup(r.created_at)}</td>
                  </tr>
                )} />
              <PaginationCoach t={tRess} />
            </>}
        </>
      )}

      {/* ── ARCHIVE ── */}
      {!chargement && !erreur && onglet === 'archive' && (
        archivees.length === 0
          ? <VideSup icone="🗄️" titre="Aucune classe clôturée"
              detail="Les classes e-learning que ce coach a menées à leur terme s'archiveront ici." />
          : <>
            <FiltreDates t={tArchive} libelle="Date de fin" />
            <TableauSup colonnes={['Classe', 'Niveau', 'Début', 'Fin', 'Statut']} lignes={tArchive.visibles}
              rendu={cl => (
                <tr key={cl.id} style={{ borderTop: `1px solid ${COULEURS.gris100}` }}>
                  <td style={{ ...cell, fontWeight: 700, color: COULEURS.navy }}>{cl.nom}</td>
                  <td style={cell}>{cl.niveau || '-'}</td>
                  <td style={cell}>{fmtDateSup(cl.date_debut)}</td>
                  <td style={cell}>{fmtDateSup(cl.date_fin)}</td>
                  <td style={cell}>{cl.statut}</td>
                </tr>
              )} />
            <PaginationCoach t={tArchive} />
          </>
      )}

      {/* LE CONTENU D'UN MODULE, BROUILLON COMPRIS.
          Le tableau n'en donnait que le titre, le statut et un nombre de blocs : le
          superviseur voyait qu'un contenu existait sans pouvoir le lire. Or c'est
          précisément ce qu'il vient vérifier — et un brouillon, qu'aucun apprenant ne reçoit
          encore, est justement celui qu'il faut relire. */}
      {moduleOuvert && (
        <ModalSup
          title={`🧩 ${moduleOuvert.titre || 'Module'}`}
          subtitle={`${moduleOuvert.nb_blocs || 0} bloc${(moduleOuvert.nb_blocs || 0) > 1 ? 's' : ''}`
            + `${moduleOuvert.classes?.length ? ` · ${moduleOuvert.classes.join(', ')}` : ''}`}
          onClose={() => setModuleOuvert(null)}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {moduleOuvert.statut === 'publie'
              ? <span style={{ background: '#D1FAE5', color: '#065F46', borderRadius: 9, padding: '4px 11px', fontSize: 11.5, fontWeight: 700 }}>✅ Publié</span>
              : <span style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 9, padding: '4px 11px', fontSize: 11.5, fontWeight: 700 }}>📝 {moduleOuvert.statut || 'brouillon'} — non reçu par les apprenants</span>}
            {moduleOuvert.created_at && (
              <span style={{ background: COULEURS.gris100, color: COULEURS.gris600, borderRadius: 9, padding: '4px 11px', fontSize: 11.5 }}>
                Créé le {fmtDateSup(moduleOuvert.created_at)}
              </span>
            )}
          </div>

          {!moduleOuvert.blocs?.length ? (
            <VideSup icone="📄" titre="Module sans contenu"
              detail="Ce module a été créé mais aucun bloc n'y a encore été ajouté." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {moduleOuvert.blocs.map((b, i) => {
                const ICONES = { texte: '📝', video: '🎬', audio: '🎧', document: '📄', image: '🖼️', lien: '🔗', exercice: '✏️', quiz: '🧩', speaking: '🎤' };
                const texte = b.contenu || b.texte || '';
                return (
                  <div key={b.id || i} style={{ border: `1px solid ${COULEURS.gris200}`, borderRadius: 11, padding: '12px 15px', background: COULEURS.blanc }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginBottom: texte || b.url ? 8 : 0 }}>
                      <span style={{ fontSize: 15 }}>{ICONES[b.type] || '📄'}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: COULEURS.navy }}>{b.titre || b.nom || b.type || `Bloc ${i + 1}`}</span>
                      <span style={{ background: COULEURS.gris100, color: COULEURS.gris600, borderRadius: 20, padding: '2px 9px', fontSize: 10.5, fontWeight: 600 }}>{b.type || 'bloc'}</span>
                      {b.dureeMin ? <span style={{ fontSize: 11, color: COULEURS.gris400 }}>⏱ {b.dureeMin} min</span> : null}
                    </div>
                    {texte && (
                      <div style={{ fontSize: 12.5, color: COULEURS.gris600, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{texte}</div>
                    )}
                    {/* Même relais signé que partout : un document en `raw` chez Cloudinary
                        refuse l'accès direct. */}
                    {b.url && (
                      <a href={urlOuvrir(b.url, b.fichier || b.nom || b.titre)} target="_blank" rel="noreferrer"
                        style={{ display: 'inline-block', marginTop: 8, fontSize: 11.5, fontWeight: 700, color: SUP_COLOR, textDecoration: 'none' }}>
                        ↗ Ouvrir le fichier
                      </a>
                    )}
                    {Array.isArray(b.questions) && b.questions.length > 0 && (
                      <div style={{ marginTop: 9, paddingTop: 9, borderTop: `1px solid ${COULEURS.gris100}` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                          {b.questions.length} question{b.questions.length > 1 ? 's' : ''}
                        </div>
                        {b.questions.map((q, qi) => (
                          <div key={q.id || qi} style={{ fontSize: 12, color: COULEURS.gris600, marginBottom: 4 }}>
                            {qi + 1}. {q.question || q.enonce || q.texte || '—'}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ModalSup>
      )}

      {/* La classe ouverte par-dessus la fiche coach. `ModalClasseObservee` est la même que
          celle d'« Observer un cours » : une seule vue de classe, qu'on y arrive par le
          cahier du coach ou par l'observation. */}
      {classeOuverte && (
        <ModalClasseObservee classe={classeOuverte} ongletInitial="infos" onFermer={() => setClasseOuverte(null)} />
      )}

    </ModalSup>
  );
}

// ─────────────────────────── 1. CAHIERS COACHS ───────────────────────────
/**
 * VUE D'ENSEMBLE DU SUPERVISEUR — ce qu'il doit regarder en arrivant.
 *
 * CE QU'ELLE REMPLACE : la page d'accueil générique des rôles admin, qui lui proposait une
 * grille de trois modules — « Suivi profs » et « Évaluations » pointant vers des chemins
 * qu'aucune route ne sert, donc deux tuiles mortes — et aucun chiffre sur son propre
 * périmètre. Il devait ouvrir les onglets un par un pour savoir s'il avait du travail.
 *
 * LES SIX CHIFFRES SONT CEUX DE DASH, et viennent de la route qui existait déjà
 * (`/api/superviseur/dashboard`, servie pour les deux plateformes). Chacun est cliquable et
 * mène à l'onglet qui le détaille : un compteur qui ne conduit nulle part oblige à chercher
 * ensuite où se trouve ce qu'il annonce.
 */
export function OngletVueEnsembleSuperviseur() {
  const [kpi, setKpi] = useState(null);
  const [chargement, setChargement] = useState(true);
  const naviguer = useNavigate();

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`${_API_URL_ADMIN}/api/superviseur/dashboard`, { headers: supAuthHdrs() });
        const d = r.ok ? await r.json() : null;
        if (vivant) setKpi(d);
      } catch { if (vivant) setKpi(null); }
      finally { if (vivant) setChargement(false); }
    })();
    return () => { vivant = false; };
  }, []);

  const CARTES = [
    { lbl: 'Coachs actifs',       val: kpi?.nb_coachs,             coul: '#0891B2', ic: '👨‍🏫', vers: '/admin/superviseur/cahiers-coachs' },
    { lbl: 'Coachs évalués',      val: kpi?.nb_coachs_evalues,     coul: '#7C3AED', ic: '📊',  vers: '/admin/superviseur/classement' },
    { lbl: 'Rapports non lus',    val: kpi?.nb_rapports_non_lus,   coul: '#F59E0B', ic: '📋',  vers: '/admin/superviseur/rapports-deputy' },
    // ANOMALIES MASQUÉ POUR LE MOMENT - carte retirée avec l'entrée de menu qu'elle ouvrait.
    // { lbl: 'Anomalies ouvertes',  val: kpi?.nb_anomalies_ouvertes, coul: '#DC2626', ic: '⚠️',  vers: '/admin/superviseur/anomalies' },
    { lbl: 'Deputy Superviseurs', val: kpi?.nb_deputies,           coul: '#059669', ic: '👥',  vers: '/admin/superviseur/deputies' },
    { lbl: 'Missions actives',    val: kpi?.nb_missions_actives,   coul: '#0369A1', ic: '🎯',  vers: '/admin/superviseur/deputies' },
  ];

  const RACCOURCIS = [
    { ic: '📓', lbl: 'Vérifier les cahiers de texte des coachs', vers: '/admin/superviseur/cahiers-coachs' },
    { ic: '👁️', lbl: 'Observer un cours',                        vers: '/admin/superviseur/observer' },
    // ANOMALIES MASQUÉ POUR LE MOMENT - raccourci retiré avec l'entrée de menu.
    // { ic: '⚠️',  lbl: 'Signaler une anomalie',                    vers: '/admin/superviseur/anomalies' },
    { ic: '🎯', lbl: 'Assigner une mission à un deputy',          vers: '/admin/superviseur/deputies' },
  ];

  const RESPONSABILITES = [
    'Vérifier les cahiers de texte (présences, cours, informations pédagogiques)',
    'Contrôler le respect des procédures et des standards BET',
    'Établir la liste des coachs éligibles au paiement',
    'Transmettre les rapports et la liste au Pedagogical Advisor',
    'Encadrer et coordonner les Deputy Superviseurs',
    'Escalader les cas problématiques au PA ou au CEO si nécessaire',
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: COULEURS.navy }}>🏠 Vue d'ensemble — Superviseur</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: COULEURS.gris400 }}>
            Suivi administratif et pédagogique des coachs BET E-Learning
          </p>
        </div>
        <div style={{ fontSize: 12, color: COULEURS.gris400 }}>Mise à jour : {fmtDateSup(new Date())}</div>
      </div>

      {chargement ? (
        <div style={{ textAlign: 'center', padding: 60, color: COULEURS.gris400 }}>Chargement…</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12, marginBottom: 24 }}>
            {CARTES.map(c => (
              <div key={c.lbl} onClick={() => naviguer(c.vers)}
                title={`Ouvrir : ${c.lbl}`}
                style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderLeft: `3px solid ${c.coul}`,
                  borderRadius: 12, padding: '14px 17px', cursor: 'pointer', transition: 'box-shadow .15s, transform .15s' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.10)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = ''; }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 11, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{c.lbl}</span>
                  <span style={{ fontSize: 17 }}>{c.ic}</span>
                </div>
                {/* `??` et non `||` : un compteur à zéro est une information — « aucune
                    anomalie ouverte » —, pas une valeur manquante. Seul `null` mérite un tiret. */}
                <div style={{ fontSize: 25, fontWeight: 800, color: c.coul, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                  {c.val ?? '—'}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
            <div style={{ background: COULEURS.gris50, borderRadius: 12, padding: 18 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12, color: COULEURS.navy }}>⚡ Accès rapides</div>
              {RACCOURCIS.map(a => (
                <button key={a.lbl} onClick={() => naviguer(a.vers)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: COULEURS.blanc,
                    border: `1px solid ${COULEURS.gris200}`, borderRadius: 10, padding: '10px 14px', fontSize: 13,
                    cursor: 'pointer', marginBottom: 8, textAlign: 'left', fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 17 }}>{a.ic}</span>
                  <span style={{ color: COULEURS.gris900, fontWeight: 500 }}>{a.lbl}</span>
                  <span style={{ marginLeft: 'auto', color: COULEURS.gris400 }}>›</span>
                </button>
              ))}
            </div>

            <div style={{ background: COULEURS.gris50, borderRadius: 12, padding: 18 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12, color: COULEURS.navy }}>📌 Responsabilités</div>
              {RESPONSABILITES.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: COULEURS.gris600, marginBottom: 8, lineHeight: 1.55 }}>
                  <span style={{ color: SUP_COLOR, flexShrink: 0, marginTop: 1 }}>✓</span><span>{r}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function OngletCahiersCoachs() {
  const [coachs,   setCoachs]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [recherche, setRecherche] = useState('');
  const [filtreConformite, setFiltreConformite] = useState('tous');
  // Le coach dont on regarde le dossier. `null` = aucun modal ouvert.
  const [coachDetail, setCoachDetail] = useState(null);
  // Filtre par catégorie de contrat, déduite de la note. '' = toutes.
  const [categorie, setCategorie] = useState('');
  const [page, setPage] = useState(1);

  const fetchCoachs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/superviseur/coachs-conformite`, { headers: supAuthHdrs() });
      const d = await r.json();
      setCoachs(d.coachs || []);
    } catch { setCoachs([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchCoachs(); }, [fetchCoachs]);

  const filtres = coachs.filter(c => {
    if (filtreConformite !== 'tous' && c.statut_conformite !== filtreConformite) return false;
    // La catégorie se déduit de la note ; un coach jamais observé tombe dans « Non évalué »
    // et non dans la pire catégorie.
    if (categorie && categorieCoach(c.note_moyenne).cle !== categorie) return false;
    if (recherche && !`${c.prenom} ${c.nom} ${c.email}`.toLowerCase().includes(recherche.toLowerCase())) return false;
    return true;
  });

  /* PAGINATION. Tout l'annuaire des coachs e-learning tenait sur une seule page : au-delà
     d'une poignée de coachs, la liste devient un mur qu'on parcourt à la molette. On borne
     à PAR_PAGE_CAHIER et on revient en page 1 dès qu'un filtre change — rester en page 4
     d'un résultat qui n'en compte plus que 2 donnerait un tableau vide trompeur. */
  const PAR_PAGE_CAHIER = 12;
  const totalPages = Math.max(1, Math.ceil(filtres.length / PAR_PAGE_CAHIER));
  const pageSure   = Math.min(page, totalPages);
  const visibles   = filtres.slice((pageSure - 1) * PAR_PAGE_CAHIER, pageSure * PAR_PAGE_CAHIER);
  useEffect(() => { setPage(1); }, [recherche, filtreConformite, categorie]);

  /* Les trois états, avec leur RÈGLE DE CALCUL en infobulle. Le badge seul laissait la
     question « en attente de quoi ? » sans réponse : c'est un statut calculé, pas une
     saisie, et rien à l'écran ne disait sur quoi il repose. Règle appliquée côté serveur
     (superviseurRoutesBet.js) : une anomalie ouverte ou une moyenne sous 3/5 → non
     conforme ; aucune évaluation ET aucun rapport → en attente ; sinon conforme. */
  const CONF_BADGE = {
    conforme:     { bg: '#D1FAE5', txt: '#065F46', lib: '✅ Conforme',
                    aide: 'Ce coach a été évalué ou observé, sa moyenne atteint 3/5 et aucune anomalie n\'est ouverte.' },
    non_conforme: { bg: '#FEE2E2', txt: '#991B1B', lib: '⚠️ Non conforme',
                    aide: 'Une anomalie est ouverte sur ce coach, ou sa note moyenne est inférieure à 3/5.' },
    en_attente:   { bg: '#FEF3C7', txt: '#92400E', lib: '⏳ En attente',
                    aide: "Rien à évaluer pour l'instant : ce coach n'a reçu aucune évaluation ni aucun rapport d'observation sur cette plateforme. Ce n'est pas un manquement de sa part — il n'y a simplement pas encore de quoi juger." },
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COULEURS.navy }}>📘 Cahiers coachs</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: COULEURS.gris400 }}>Conformité, évaluations et rapports d'observation par coach</p>
        </div>
        <button onClick={fetchCoachs} style={{ padding: '7px 14px', background: SUP_COLOR + '15', border: `1px solid ${SUP_COLOR}40`, borderRadius: 8, fontSize: 12, color: SUP_COLOR, fontWeight: 600, cursor: 'pointer' }}>↻ Actualiser</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 18 }}>
        <StatCardSup label="Coachs" value={coachs.length} color={SUP_COLOR} icon="🎓" />
        <StatCardSup label="Conformes" value={coachs.filter(c => c.statut_conformite === 'conforme').length} color="#16A34A" icon="✅" />
        <StatCardSup label="Non conformes" value={coachs.filter(c => c.statut_conformite === 'non_conforme').length} color="#DC2626" icon="⚠️" />
        <StatCardSup label="En attente" value={coachs.filter(c => c.statut_conformite === 'en_attente').length} color="#D97706" icon="⏳" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="🔍 Nom, email…"
          style={{ padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 12, minWidth: 200 }} />
        {['tous', 'conforme', 'non_conforme', 'en_attente'].map(v => (
          <button key={v} onClick={() => setFiltreConformite(v)}
            style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1.5px solid ${filtreConformite === v ? SUP_COLOR : COULEURS.gris200}`, background: filtreConformite === v ? SUP_COLOR + '15' : '#fff', color: filtreConformite === v ? SUP_COLOR : COULEURS.gris600, cursor: 'pointer' }}>
            {v === 'tous' ? 'Tous' : CONF_BADGE[v]?.lib}
          </button>
        ))}
      </div>

      {/* Filtre par CATÉGORIE DE CONTRAT. Le compte est porté par chaque puce : une
          catégorie vide se voit avant d'être cliquée, plutôt que de renvoyer un tableau
          vide sans explication. */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Catégorie</span>
        {[{ cle: '', libelle: 'Toutes', couleur: SUP_COLOR, fond: SUP_COLOR + '15', bord: SUP_COLOR + '40' },
          ...CATEGORIES_COACH, CATEGORIE_SANS_NOTE].map(cat => {
          const actif = categorie === cat.cle;
          const n = cat.cle === ''
            ? coachs.length
            : coachs.filter(c => categorieCoach(c.note_moyenne).cle === cat.cle).length;
          return (
            <button key={cat.cle || 'toutes'} onClick={() => setCategorie(actif ? '' : cat.cle)}
              title={cat.cle === CATEGORIE_SANS_NOTE.cle ? 'Coachs jamais évalués - aucune observation à ce jour' : undefined}
              style={{ padding: '4px 11px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6,
                border: `1.5px solid ${actif ? cat.couleur : COULEURS.gris200}`,
                background: actif ? (cat.fond || cat.couleur + '15') : '#fff',
                color: actif ? cat.couleur : COULEURS.gris600 }}>
              {cat.libelle}
              <span style={{ fontWeight: 900, opacity: n ? 1 : 0.45 }}>{n}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : filtres.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 50, background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}`, color: COULEURS.gris400 }}>Aucun coach trouvé.</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${COULEURS.gris200}`, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: COULEURS.gris50 }}>
                {['Coach', 'Catégorie', 'Groupes', 'Évaluations', 'Rapports Deputy', 'Note moyenne', 'Anomalies', 'Conformité', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map(c => {
                const conf = CONF_BADGE[c.statut_conformite] || CONF_BADGE.en_attente;
                return (
                  /* La LIGNE ENTIÈRE ouvre le dossier, comme chez dash : viser un bouton
                     de 60 px pour consulter une fiche est une contrainte inutile. Le
                     bouton « Détail » reste, parce que rien n'indique autrement qu'une
                     ligne de tableau est cliquable. */
                  <tr key={c.id} onClick={() => setCoachDetail(c)} title="Ouvrir le dossier du coach"
                    style={{ borderTop: `1px solid ${COULEURS.gris100}`, cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.background = SUP_COLOR + '08'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    <td style={{ padding: '10px 14px' }}>
                      {/* La PHOTO du compte, la même que partout ailleurs. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <PastilleGroupe nom={`${c.prenom || ''} ${c.nom || ''}`} url={c.avatar_url} taille={32} accent={SUP_COLOR} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: COULEURS.navy }}>{c.prenom} {c.nom}</div>
                          <div style={{ fontSize: 11, color: COULEURS.gris400 }}>{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <BadgeCategorieCoach note={c.note_moyenne} taille="xs" />
                    </td>
                    <td style={{ padding: '10px 14px' }}>{c.nb_groupes}</td>
                    <td style={{ padding: '10px 14px' }}>{c.nb_evaluations}</td>
                    <td style={{ padding: '10px 14px' }}>{c.nb_rapports_deputy}</td>
                    {/* La note prend la COULEUR DE SA CATÉGORIE, et non un rouge/navy
                        binaire : deux verdicts sur la même ligne devaient s'accorder. */}
                    <td style={{ padding: '10px 14px' }}>
                      <CercleNote note={c.note_moyenne} taille={38} />
                    </td>
                    <td style={{ padding: '10px 14px' }}>{c.nb_anomalies > 0 ? <span style={{ color: '#DC2626', fontWeight: 700 }}>{c.nb_anomalies}</span> : '0'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span title={conf.aide} style={{ background: conf.bg, color: conf.txt, padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: 'help' }}>{conf.lib}</span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={e => { e.stopPropagation(); setCoachDetail(c); }}
                        style={{ padding: '4px 11px', background: SUP_COLOR + '15', border: `1px solid ${SUP_COLOR}40`, borderRadius: 6, fontSize: 11, color: SUP_COLOR, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Détail
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtres.length > 0 && (
        <PaginationCoach t={{ page: pageSure, setPage, totalPages, total: filtres.length }} />
      )}

      {coachDetail && (
        <ModalCoachDetail coach={coachDetail} onFermer={() => setCoachDetail(null)} />
      )}
    </div>
  );
}

// ─────────────────────────── 2. RAPPORTS DEPUTY ───────────────────────────
const RAPPORT_INIT_SUP = {
  coach_id: '', date_observation: '', centre: '', classe: '', groupe_id: '', seance_id: '',
  /* LES SEPT CRITÈRES, et non cinq. `expression_engagement` et `feedback_correction`
     manquaient au formulaire alors que le serveur les EXIGE : toute soumission repartait en
     400 — « Critère(s) non noté(s) : Expression & engagement, Feedback & correction » —, et
     aucun rapport d'observation ne pouvait être enregistré depuis bet-elearning. */
  ponctualite: 0, preparation: 0, pedagogie: 0, gestion_classe: 0, professionnalisme: 0,
  expression_engagement: 0, feedback_correction: 0,
  // Échelles fermées : notées par le serveur, pas saisies en étoiles.
  interactivite_classe: '', approche_grammaticale: '',
  type_observation: 'cours', type_lecon: '',
  // Hors note : un constat de contexte, pas une performance du coach.
  internet: '',
  observations: '', recommandations: '',
};

/* Les échelles fermées et leur conversion en points — les mêmes valeurs que côté serveur,
   qui reste seul juge de la note enregistrée. Ici, c'est pour montrer le poids à la saisie. */
const ECHELLE_INTERACTIVITE = [
  { v: 'excellent',   l: 'Excellent',   pts: 5, d: 'tous sollicités, échanges entre apprenants' },
  { v: 'bon',         l: 'Bon',         pts: 4, d: 'la majorité participe' },
  { v: 'acceptable',  l: 'Acceptable',  pts: 3, d: 'participation inégale' },
  { v: 'insuffisant', l: 'Insuffisant', pts: 1, d: 'cours frontal, apprenants passifs' },
];
/* Les mêmes valeurs, côté LECTURE. Un rapport déjà soumis n'affiche pas des boutons mais
   des libellés : on les sort des échelles de saisie pour que la liste n'ait pas à les
   reconstruire, et pour que les deux ne puissent pas diverger. */
const LIB_INTERACTIVITE_SUP = { excellent: 'Excellent', bon: 'Bon', acceptable: 'Acceptable', insuffisant: 'Insuffisant' };
const LIB_GRAMMAIRE_SUP = {
  inductive_claire: 'Inductive et claire', inductive_perfectible: 'Inductive, à revoir',
  deductive_claire: 'Déductive mais claire', confuse: 'Confuse ou erronée',
};
const LIB_SYNTHESE_SUP = {
  excellent:     { l: 'Excellent',      c: '#15803D', bg: '#DCFCE7' },
  satisfaisant:  { l: 'Satisfaisant',   c: '#B45309', bg: '#FEF3C7' },
  a_accompagner: { l: 'À accompagner',  c: '#B91C1C', bg: '#FEE2E2' },
};

const ECHELLE_GRAMMAIRE = [
  { v: 'inductive_claire',      l: 'Inductive et claire',            pts: 5, d: 'la règle est dégagée par les apprenants' },
  { v: 'inductive_perfectible', l: 'Inductive, explication à revoir', pts: 4, d: 'démarche juste, formulation confuse' },
  { v: 'deductive_claire',      l: 'Déductive mais claire',          pts: 3, d: 'règle donnée puis appliquée' },
  { v: 'confuse',               l: 'Confuse ou erronée',             pts: 1, d: '« Not Induc & Confu » de la feuille' },
];

/**
 * LA NOTE, TOUJOURS DANS LE MÊME CERCLE.
 *
 * Elle s'affichait de quatre façons selon l'écran — « 4.4/5 » en gras, un carré arrondi, une
 * cellule colorée — alors que c'est la même information et le même barème. Un lecteur qui
 * passe du classement au cahier d'un coach ne doit pas avoir à réapprendre à la lire.
 *
 * Le fond et la bordure viennent du barème : la couleur dit la catégorie avant même que le
 * chiffre soit lu, et ne contredit jamais le badge posé à côté.
 */
function CercleNote({ note, taille = 44 }) {
  if (note === null || note === undefined || note === '' || Number.isNaN(Number(note))) {
    return <span style={{ color: COULEURS.gris400, fontSize: 12 }}>—</span>;
  }
  const n = Number(note);
  return (
    <div style={{ width: taille, height: taille, borderRadius: '50%', flexShrink: 0,
      background: NOTE_FOND(n), border: `2.5px solid ${NOTE_COULEUR(n)}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 900, fontSize: taille * 0.31, color: NOTE_COULEUR(n) }}>
      {n.toFixed(1)}
    </div>
  );
}

function EtoileRatingSup({ valeur, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} onClick={() => onChange(n)} style={{ cursor: 'pointer', fontSize: 20, color: n <= valeur ? '#F59E0B' : COULEURS.gris200 }}>★</span>
      ))}
    </div>
  );
}

// Déduit automatiquement le lieu de l'observation à partir du type_cours de la classe -
// même logique que côté Deputy (bet-elearning n'a pas de centre BET physique, seulement
// "en ligne" ou les locaux de l'entreprise cliente pour les classes B2B).
function lieuAutoClasseSup(classe) {
  if (!classe) return '';
  if (classe.type_cours === 'en_ligne') return 'En ligne';
  return classe.entreprise_nom ? `Présentiel - ${classe.entreprise_nom.trim()}` : 'Présentiel';
}

export function OngletRapportsDeputySuperviseur() {
  const confirm = useConfirm();
  const prompt  = usePrompt();
  // Les rapports dépliés. Un `Set` plutôt qu'un identifiant unique : on compare souvent deux
  // rapports du même coach côte à côte, et n'en ouvrir qu'un à la fois l'interdirait.
  const [deplies, setDeplies] = useState(new Set());
  const [correction, setCorrection] = useState(null);   // { rapport, valeurs, motif }
  const [duR, setDuR] = useState('');
  const [auR, setAuR] = useState('');
  const [pageR, setPageR] = useState(1);
  const PAR_PAGE_RAPPORTS = 10;
  const [rapports, setRapports] = useState([]);
  const [coachs,    setCoachs]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [filtreStatut, setFiltreStatut] = useState('tous');
  const [commentaires, setCommentaires] = useState({});
  const [rapportsEnCours, setRapportsEnCours] = useState(new Set()); // empêche le double-clic changement de statut rapport
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(RAPPORT_INIT_SUP);
  const [saving, setSaving] = useState(false);
  const [rapportGroupes, setRapportGroupes] = useState([]);
  const [rapportClasseFil, setRapportClasseFil] = useState('actif');

  /* ── OUVERTURE DEMANDÉE DEPUIS « OBSERVER UN COURS » ──
     Le bouton 📋 Observer d'une classe dépose le coach et la classe à observer, puis
     navigue ici. On consomme cette intention au montage : le formulaire s'ouvre déjà
     rempli, comme chez dash où les deux écrans partagent le même composant.
     `groupe_id` compte autant que le nom — c'est lui qui déclenche le chargement des
     séances de la classe, sans quoi le rapport s'ouvrirait sans aucune séance à choisir. */
  useEffect(() => {
    const demande = consommerObservation();
    if (!demande) return;
    setForm(p => ({ ...p, coach_id: demande.coach_id || '', classe: demande.classe || '', groupe_id: demande.groupe_id || '' }));
    setShowForm(true);
  }, []);

  const fetchRapports = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/superviseur/rapports-deputy`, { headers: supAuthHdrs() });
      const d = await r.json();
      setRapports(d.rapports || []);
    } catch { setRapports([]); }
    finally { setLoading(false); }
  }, []);
  const fetchCoachs = useCallback(async () => {
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/superviseur/coachs-conformite`, { headers: supAuthHdrs() });
      const d = await r.json();
      setCoachs(d.coachs || []);
    } catch { setCoachs([]); }
  }, []);
  useEffect(() => { fetchRapports(); fetchCoachs(); }, [fetchRapports, fetchCoachs]);

  // Charger les classes du coach sélectionné, pour le sélecteur de classe du formulaire
  async function fetchRapportCoachGroupes(coachId) {
    if (!coachId) { setRapportGroupes([]); return; }
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/elearning/seances?coach_id=${coachId}`, { headers: supAuthHdrs() });
      const d = await r.json();
      const classeIds = [...new Set((d.seances || []).map(s => s.classe_id).filter(Boolean))];
      const r2 = await fetch(`${_API_URL_ADMIN}/api/classes-elearning`, { headers: supAuthHdrs() });
      const d2 = await r2.json();
      const coachClasses = (d2.classes || []).filter(c => c.coach_id === coachId || classeIds.includes(c.id));
      setRapportGroupes(coachClasses);
    } catch { setRapportGroupes([]); }
  }

  /* `commentaire` explicite en 3e argument : « Commenter » enregistre un texte SANS changer
     de statut, et lire `commentaires[id]` juste après l'avoir posé ferait courir une course
     avec le rendu — l'état n'est pas encore à jour quand l'appel part. */
  async function majStatut(id, statut, commentaire) {
    if (rapportsEnCours.has(id)) return;
    setRapportsEnCours(prev => new Set(prev).add(id));
    try {
      const corps = { statut };
      const texte = commentaire !== undefined ? commentaire : commentaires[id];
      if (texte !== undefined) corps.commentaire_superviseur = texte;
      const r = await fetch(`${_API_URL_ADMIN}/api/superviseur/rapports-deputy/${id}`, {
        method: 'PATCH', headers: supAuthHdrs(),
        body: JSON.stringify(corps),
      });
      if (r.ok) {
        fetchRapports();
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Action refusée', { duration: 5000 });
      }
    } catch {
      toast.error('Impossible de joindre le serveur', { duration: 5000 });
    } finally {
      setRapportsEnCours(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  /* CE QUI MANQUE, NOMMÉ AVANT L'ENVOI.
     Le serveur exige les sept critères et refuse en 400 ; l'écran, lui, ne vérifiait que le
     coach et la date. Un rapport incomplet partait donc, revenait refusé, et l'observateur
     perdait son aller-retour sans savoir d'avance ce qu'il lui restait à noter. */
  const CRITERES_REQUIS = [
    ['ponctualite', 'Ponctualité'], ['pedagogie', 'Pédagogie'],
    ['preparation', 'Organisation du cours'], ['expression_engagement', 'Expression & engagement'],
    ['gestion_classe', 'Gestion de classe'], ['feedback_correction', 'Feedback & correction'],
    ['professionnalisme', 'Professionnalisme'],
  ];
  const manquants = [
    ...(!form.coach_id ? ['le coach observé'] : []),
    ...(!form.date_observation ? ["la date d'observation"] : []),
    ...CRITERES_REQUIS.filter(([c]) => !(Number(form[c]) > 0)).map(([, l]) => l),
  ];

  /* ── COMMENTER ──
     Le commentaire accompagne le rapport jusqu'au PA. Il passait par un champ en ligne
     toujours visible sur chaque carte, qui alourdissait une liste faite pour être parcourue :
     on le demande au moment où on le veut. */
  async function ouvrirCommentaire(r) {
    const val = await prompt('Commentaire du superviseur, transmis avec le rapport :', {
      titre: '💬 Commenter le rapport',
      valeurInitiale: r.commentaire_superviseur || '',
      placeholder: 'Votre remarque pour le PA…',
    });
    if (val === null || val === undefined) return;
    setCommentaires(prev => ({ ...prev, [r.id]: val }));
    await majStatut(r.id, r.statut, val);
  }

  /* ── CORRIGER ──
     Le superviseur relit avant de transmettre, et une erreur de saisie de l'observateur — un
     critère mal cliqué — ne doit pas partir telle quelle : la note attribue des points au
     coach et pèse sur son classement. Le serveur conserve l'original et recalcule la note ;
     l'écran ne fait que proposer les valeurs actuelles. */
  function ouvrirCorrection(r) {
    setCorrection({
      rapport: r,
      valeurs: Object.fromEntries(CRITERES_LECTURE.map(c => [c.cle, r[c.cle] || 0])),
      motif: '',
    });
  }

  async function enregistrerCorrection() {
    if (!correction) return;
    const { rapport, valeurs, motif } = correction;
    const changes = Object.entries(valeurs).filter(([c, v]) => Number(v) !== Number(rapport[c] || 0));
    if (!changes.length) { toast('Aucun critère modifié.'); return; }

    const ok = await confirm(
      `Corriger ${changes.length} critère${changes.length > 1 ? 's' : ''} de ce rapport ?`
      + " L'original est conservé et la note globale sera recalculée.",
      { titre: '✏️ Corriger le rapport', danger: false, confirmLabel: 'Corriger' },
    );
    if (!ok) return;

    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/superviseur/rapports-deputy/${rapport.id}`, {
        method: 'PATCH', headers: supAuthHdrs(),
        body: JSON.stringify({ correction: Object.fromEntries(changes), motif_correction: motif }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Correction refusée', { duration: 5000 });
        return;
      }
      setCorrection(null);
      fetchRapports();
      toast.success('Rapport corrigé.');
    } catch { toast.error('Impossible de joindre le serveur', { duration: 5000 }); }
  }

  async function soumettreRapport() {
    if (manquants.length || saving) return;

    /* UN RAPPORT D'OBSERVATION SE TRANSMET AU PA ET PÈSE SUR LA NOTE D'UN COACH : on
       demande confirmation, comme pour toute écriture qui engage quelqu'un d'autre. La
       moyenne est rappelée dans la question — c'est le chiffre qui comptera, et le voir
       avant de valider évite de découvrir après coup qu'un critère a été mal cliqué. */
    const moyenne = (CRITERES_REQUIS.reduce((n, [c]) => n + Number(form[c] || 0), 0) / CRITERES_REQUIS.length).toFixed(1);
    const nomCoach = coachs.find(c => c.id === form.coach_id);
    const ok = await confirm(
      `Soumettre ce rapport sur ${nomCoach ? `${nomCoach.prenom || ''} ${nomCoach.nom || ''}`.trim() : 'ce coach'} ?`
      + ` Moyenne des sept critères : ${moyenne}/5.`
      + ' Il partira au Superviseur Général et comptera dans la note du coach.',
      { titre: '📋 Soumettre le rapport', danger: false, confirmLabel: 'Soumettre' },
    );
    if (!ok) return;

    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/superviseur/rapports-deputy`, {
        method: 'POST', headers: supAuthHdrs(), body: JSON.stringify(form),
      });
      if (r.ok) {
        setShowForm(false); setForm(RAPPORT_INIT_SUP); setRapportGroupes([]); fetchRapports();
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Soumission refusée', { duration: 5000 });
      }
    } catch { toast.error('Impossible de joindre le serveur', { duration: 5000 }); }
    finally { setSaving(false); }
  }

  /* La plage porte sur la DATE D'OBSERVATION, pas sur celle de soumission : c'est la période
     du cours observé qu'on cherche, pas le moment où le rapport a été saisi — les deux
     peuvent être éloignées de plusieurs jours. Un rapport sans date reste visible. */
  const tous = rapports
    .filter(r => filtreStatut === 'tous' || r.statut === filtreStatut)
    .filter(r => {
      const d = String(r.date_observation || '');
      if (!d) return true;
      if (duR && d < duR) return false;
      if (auR && d > auR) return false;
      return true;
    })
    .sort((a, b) => (b.date_observation || '').localeCompare(a.date_observation || ''));

  const nbPagesR  = Math.max(1, Math.ceil(tous.length / PAR_PAGE_RAPPORTS));
  const pageSureR = Math.min(pageR, nbPagesR);
  const filtres   = tous.slice((pageSureR - 1) * PAR_PAGE_RAPPORTS, pageSureR * PAR_PAGE_RAPPORTS);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COULEURS.navy }}>📋 Rapports Deputy</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: COULEURS.gris400 }}>Rapports d'observation soumis par les Deputy Superviseurs et par vous-même</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* L'EXPORT AU FORMAT DE LA FEUILLE TERRAIN — « Coaches Weekly Performance
              Appraisal Sheet ». Le même utilitaire que dash, repris tel quel : c'est la mise
              en page que la direction lit depuis des mois, et lui rendre un tableau plat lui
              demanderait de réapprendre son propre document. Les mock teachings et les
              évaluations partent sur une seconde feuille — leurs notes ne se comparent pas à
              celles d'un cours normal. */}
          <button
            onClick={() => exporterAppraisalCoachs({
              rapports,
              nomFichier: `appraisal_coachs_${new Date().toISOString().slice(0, 10)}`,
            })}
            disabled={!rapports.length}
            title={rapports.length ? 'Exporter au format de la feuille terrain' : 'Aucun rapport à exporter'}
            style={{ padding: '9px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700,
              background: rapports.length ? '#16A34A' : COULEURS.gris200,
              color: rapports.length ? '#fff' : COULEURS.gris400,
              cursor: rapports.length ? 'pointer' : 'not-allowed' }}>
            📊 Excel
          </button>
          <button onClick={() => setShowForm(true)} style={{ padding: '9px 18px', background: SUP_COLOR, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Nouveau rapport</button>
          <button onClick={fetchRapports} style={{ padding: '7px 14px', background: SUP_COLOR + '15', border: `1px solid ${SUP_COLOR}40`, borderRadius: 8, fontSize: 12, color: SUP_COLOR, fontWeight: 600, cursor: 'pointer' }}>↻ Actualiser</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {['tous', 'soumis', 'lu', 'transmis_pa'].map(v => (
          <button key={v} onClick={() => { setFiltreStatut(v); setPageR(1); }}
            style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1.5px solid ${filtreStatut === v ? SUP_COLOR : COULEURS.gris200}`, background: filtreStatut === v ? SUP_COLOR + '15' : '#fff', color: filtreStatut === v ? SUP_COLOR : COULEURS.gris600, cursor: 'pointer' }}>
            {v === 'tous' ? 'Tous' : SUP_STATUT_RAPPORT[v]?.lib}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: 11, color: COULEURS.gris400, alignSelf: 'center' }}>Observé du</label>
        <input type="date" value={duR} onChange={e => { setDuR(e.target.value); setPageR(1); }}
          style={{ padding: '5px 8px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, fontSize: 12 }} />
        <label style={{ fontSize: 11, color: COULEURS.gris400, alignSelf: 'center' }}>au</label>
        <input type="date" value={auR} onChange={e => { setAuR(e.target.value); setPageR(1); }}
          style={{ padding: '5px 8px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, fontSize: 12 }} />
        {(duR || auR) && (
          <button onClick={() => { setDuR(''); setAuR(''); setPageR(1); }}
            style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, fontSize: 11, cursor: 'pointer' }}>✕</button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : filtres.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 50, background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}`, color: COULEURS.gris400 }}>Aucun rapport.</div>
      ) : (
        <div style={{ border: `1px solid ${COULEURS.gris200}`, borderRadius: 14, overflow: 'hidden', background: COULEURS.blanc }}>
          {/* L'en-tête porte le compte et les deux commandes de pliage : une liste de rapports
              se parcourt d'abord d'un coup d'œil, et ne s'ouvre que sur celui qu'on traite. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
            background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris200}` }}>
            <span style={{ fontSize: 12.5, color: COULEURS.gris600, fontWeight: 600 }}>
              {filtres.length} rapport{filtres.length > 1 ? 's' : ''} sur cette page
              {tous.length !== filtres.length && <span style={{ color: COULEURS.gris400, fontWeight: 500 }}> · {tous.length} au total</span>}
            </span>
            <span style={{ flex: 1 }} />
            <button onClick={() => setDeplies(new Set(filtres.map(r => r.id)))}
              style={{ fontSize: 11, fontWeight: 700, color: SUP_COLOR, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Tout déplier ↓</button>
            <button onClick={() => setDeplies(new Set())}
              style={{ fontSize: 11, fontWeight: 700, color: COULEURS.gris400, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Tout replier ↑</button>
          </div>

          {filtres.map((r, idx) => {
            const ouvert = deplies.has(r.id);
            const note = r.note_globale != null ? Number(r.note_globale) : null;
            const basculer = () => setDeplies(prev => { const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; });
            const aDuTexte = !!(r.observations || r.recommandations);

            return (
              <div key={r.id} style={{ borderBottom: idx < filtres.length - 1 ? `1px solid ${COULEURS.gris100}` : 'none' }}>
                <div onClick={basculer}
                  style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                    background: ouvert ? `${SUP_COLOR}08` : COULEURS.blanc, transition: 'background .15s' }}
                  onMouseEnter={e => { if (!ouvert) e.currentTarget.style.background = COULEURS.gris50; }}
                  onMouseLeave={e => { if (!ouvert) e.currentTarget.style.background = COULEURS.blanc; }}>
                  <span style={{ fontSize: 12, color: COULEURS.gris400, flexShrink: 0, display: 'inline-block',
                    transform: ouvert ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .2s' }}>▶</span>

                  <div style={{ width: 36, height: 36, borderRadius: 8, background: `${SUP_COLOR}18`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: SUP_COLOR, fontSize: 12, flexShrink: 0 }}>
                    {(r.deputy?.prenom || 'D')[0]}{(r.deputy?.nom || '')[0]}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: COULEURS.navy }}>
                      {`${r.deputy?.prenom || ''} ${r.deputy?.nom || ''}`.trim() || 'Observateur'}
                    </div>
                    <div style={{ fontSize: 11, color: COULEURS.gris600, marginTop: 1 }}>
                      Coach : {`${r.coach?.prenom || ''} ${r.coach?.nom || ''}`.trim() || '—'}
                      {r.classe && <span style={{ marginLeft: 7, background: '#E0F2FE', color: '#0369A1', borderRadius: 5, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>{r.classe}</span>}
                      {r.centre && <span style={{ marginLeft: 6, color: COULEURS.gris400 }}>· {r.centre}</span>}
                      {/* La séance observée : sans elle, deux rapports sur la même classe le
                          même jour restaient indiscernables. */}
                      {r.seance && (
                        <span style={{ marginLeft: 7, background: '#F0FDF4', color: '#15803D', borderRadius: 5, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>
                          🎥 {r.seance.objectifs_session || 'Séance'}
                          {r.seance.date ? ` · ${new Date(r.seance.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}` : ''}
                        </span>
                      )}
                      {aDuTexte && <span style={{ marginLeft: 6 }}>📝</span>}
                    </div>
                  </div>

                  {/* Les sept critères en barres : la forme du rapport se lit sans l'ouvrir —
                      une note moyenne de 3 cache aussi bien sept « 3 » qu'un « 5 » et un « 1 ». */}
                  <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 22, flexShrink: 0 }}>
                    {CRITERES_LECTURE.map(c => {
                      const v = r[c.cle];
                      return <div key={c.cle} title={`${c.label}${v ? ` : ${v}/5` : ' : non noté'}`}
                        style={{ width: 6, borderRadius: 2, background: v ? NOTE_COULEUR(v) : COULEURS.gris200, height: v ? `${v / 5 * 100}%` : '20%' }} />;
                    })}
                  </div>

                  <CercleNote note={note} taille={42} />

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                    {(() => { const st = SUP_STATUT_RAPPORT[r.statut] || SUP_STATUT_RAPPORT.soumis;
                      return <span style={{ background: st.bg, color: st.txt, padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{st.lib}</span>; })()}
                    <span style={{ fontSize: 10, color: COULEURS.gris400 }}>{fmtDateSup(r.date_observation)}</span>
                  </div>
                </div>

                {ouvert && (
                  <div style={{ padding: '16px 20px', background: `${SUP_COLOR}06`, borderTop: `1px solid ${SUP_COLOR}20` }}>
                    {/* Synthèse et contexte d'abord : c'est ce que le PA lit en premier. La
                        synthèse est CALCULÉE, jamais saisie — sur la feuille terrain elle était
                        remplie à la main et pouvait contredire les critères qui la précédaient. */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                      {r.synthese && LIB_SYNTHESE_SUP[r.synthese] && (
                        <span style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800,
                          background: LIB_SYNTHESE_SUP[r.synthese].bg, color: LIB_SYNTHESE_SUP[r.synthese].c }}>
                          {LIB_SYNTHESE_SUP[r.synthese].l}
                        </span>
                      )}
                      {r.type_observation && r.type_observation !== 'cours' && (
                        <span style={{ padding: '5px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, background: '#EDE9FE', color: '#6D28D9' }}>
                          {r.type_observation === 'evaluation' ? '📊' : '🎭'} {libelleObservation(r.type_observation)}
                        </span>
                      )}
                      {r.type_lecon && (
                        <span style={{ padding: '5px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 600, background: '#E0F2FE', color: '#0369A1' }}>📖 {libelleLecon(r.type_lecon)}</span>
                      )}
                      {r.internet && (
                        <span style={{ padding: '5px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
                          background: r.internet === 'instable' ? '#FEE2E2' : COULEURS.gris100,
                          color: r.internet === 'instable' ? '#B91C1C' : COULEURS.gris600 }}>
                          📶 Internet : <strong>{libelleInternet(r.internet)}</strong>
                        </span>
                      )}
                      {r.interactivite_classe && (
                        <span style={{ padding: '5px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 600, background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, color: COULEURS.gris600 }}>
                          👥 Interactivité : <strong>{LIB_INTERACTIVITE_SUP[r.interactivite_classe] || r.interactivite_classe}</strong>
                        </span>
                      )}
                      {r.approche_grammaticale && (
                        <span style={{ padding: '5px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 600, background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, color: COULEURS.gris600 }}>
                          📖 Grammaire : <strong>{LIB_GRAMMAIRE_SUP[r.approche_grammaticale] || r.approche_grammaticale}</strong>
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8, marginBottom: 14 }}>
                      {CRITERES_LECTURE.map(c => {
                        const val = r[c.cle];
                        return (
                          <div key={c.cle} style={{ background: COULEURS.blanc, borderRadius: 9, padding: '10px 12px', border: `1px solid ${COULEURS.gris200}` }}>
                            <div style={{ fontSize: 11, color: COULEURS.gris600, fontWeight: 600, marginBottom: 6 }}>{c.icon} {c.label}</div>
                            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                              {[1, 2, 3, 4, 5].map(n => (
                                <div key={n} style={{ width: 18, height: 18, borderRadius: 3, fontSize: 9, fontWeight: 700,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: val >= n ? NOTE_COULEUR(val) : COULEURS.gris200,
                                  color: val >= n ? '#fff' : COULEURS.gris400 }}>{n}</div>
                              ))}
                              {val ? <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 800, color: NOTE_COULEUR(val) }}>{val}/5</span> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {(r.observations || r.recommandations) && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 10, marginBottom: 14 }}>
                        {r.observations && <div style={{ background: '#F0F9FF', borderRadius: 8, padding: '9px 13px', border: '1px solid #BAE6FD', fontSize: 12, color: '#0C4A6E' }}><strong>👁 Observations</strong><p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{r.observations}</p></div>}
                        {r.recommandations && <div style={{ background: '#F0FDF4', borderRadius: 8, padding: '9px 13px', border: '1px solid #BBF7D0', fontSize: 12, color: '#14532D' }}><strong>💡 Recommandations</strong><p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{r.recommandations}</p></div>}
                      </div>
                    )}

                    {/* La trace d'une correction, visible de tous. Un rapport corrigé en
                        silence perdrait sa valeur de preuve le jour où un coach conteste. */}
                    {r.correction_superviseur && (
                      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 9, padding: '10px 13px', marginBottom: 14, fontSize: 11.5, color: '#92400E' }}>
                        ✏️ <strong>Rapport corrigé</strong> par {[r.correction_superviseur.par?.prenom, r.correction_superviseur.par?.nom].filter(Boolean).join(' ') || 'le superviseur'}
                        {r.correction_superviseur.le ? ` le ${fmtDateSup(r.correction_superviseur.le)}` : ''}
                        {r.correction_superviseur.motif ? <> · Motif : <strong>{r.correction_superviseur.motif}</strong></> : null}
                        {r.correction_superviseur.original?.note_globale != null && (
                          <> · note d'origine <strong>{r.correction_superviseur.original.note_globale}/5</strong></>
                        )}
                      </div>
                    )}

                    {r.commentaire_superviseur && (
                      <div style={{ background: '#FEF9C3', borderRadius: 8, padding: '9px 13px', marginBottom: 14, fontSize: 12, color: '#854D0E' }}>
                        <strong>💬 Commentaire :</strong> {r.commentaire_superviseur}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {r.statut !== 'transmis_pa' && (
                        <button onClick={() => majStatut(r.id, 'transmis_pa')}
                          style={{ padding: '8px 16px', background: SUP_COLOR, border: 'none', borderRadius: 8, fontSize: 12.5, color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          📤 Transmettre au PA
                        </button>
                      )}
                      {['soumis', 'lu'].includes(r.statut) && (
                        <button onClick={() => ouvrirCorrection(r)}
                          title="Corriger une erreur de saisie de l'observateur"
                          style={{ padding: '8px 16px', background: COULEURS.blanc, border: '1.5px solid #C4B5FD', borderRadius: 8, fontSize: 12.5, color: '#6D28D9', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          ✏️ Corriger
                        </button>
                      )}
                      <button onClick={() => ouvrirCommentaire(r)}
                        style={{ padding: '8px 16px', background: COULEURS.gris100, border: 'none', borderRadius: 8, fontSize: 12.5, color: COULEURS.navy, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        💬 Commenter
                      </button>
                      {r.statut === 'soumis' && (
                        <button onClick={() => majStatut(r.id, 'lu')}
                          style={{ padding: '8px 14px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 12, color: '#D97706', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          👁 Marquer lu
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <BarrePages page={pageSureR} total={tous.length} parPage={PAR_PAGE_RAPPORTS} onChange={setPageR} libelle="rapport" />
        </div>
      )}

      {correction && (
        <ModalSup title="✏️ Corriger le rapport"
          subtitle={`${correction.rapport.coach?.prenom || ''} ${correction.rapport.coach?.nom || ''} · ${fmtDateSup(correction.rapport.date_observation)}`}
          onClose={() => setCorrection(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '11px 14px', fontSize: 12.5, color: '#92400E', lineHeight: 1.6 }}>
              Un rapport est un <strong>témoignage</strong> : la version soumise par l'observateur est conservée,
              et la correction reste visible de tous. La note globale est recalculée automatiquement.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
              {CRITERES_LECTURE.map(c => {
                const avant = Number(correction.rapport[c.cle] || 0);
                const apres = Number(correction.valeurs[c.cle] || 0);
                return (
                  <div key={c.cle} style={{ border: `1px solid ${apres !== avant ? '#C4B5FD' : COULEURS.gris200}`,
                    background: apres !== avant ? '#F5F3FF' : COULEURS.blanc, borderRadius: 10, padding: '10px 13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: COULEURS.gris600 }}>{c.icon} {c.label}</span>
                      {/* La valeur d'origine reste sous les yeux : sans elle, on ne sait plus
                          ce qu'on est en train de changer. */}
                      {apres !== avant && (
                        <span style={{ fontSize: 10.5, color: '#6D28D9', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {avant || '—'} → {apres || '—'}
                        </span>
                      )}
                    </div>
                    <EtoileRatingSup valeur={apres}
                      onChange={n => setCorrection(co => ({ ...co, valeurs: { ...co.valeurs, [c.cle]: n } }))} />
                  </div>
                );
              })}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>
                Motif de la correction <span style={{ fontWeight: 500, color: COULEURS.gris400 }}>— facultatif, mais il explique la trace laissée</span>
              </label>
              <input value={correction.motif}
                onChange={e => setCorrection(co => ({ ...co, motif: e.target.value }))}
                placeholder="Ex. : critère Pédagogie saisi à 2 au lieu de 4"
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setCorrection(null)}
                style={{ padding: '9px 18px', background: COULEURS.gris100, border: 'none', borderRadius: 8, fontSize: 13, color: COULEURS.navy, cursor: 'pointer', fontWeight: 600 }}>Annuler</button>
              <button onClick={enregistrerCorrection}
                style={{ padding: '9px 22px', background: '#6D28D9', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Enregistrer la correction</button>
            </div>
          </div>
        </ModalSup>
      )}

      {showForm && (
        <ModalSup title="📋 Nouveau rapport d'observation" onClose={() => { setShowForm(false); setRapportGroupes([]); }} xl>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Coach *</label>
                <select value={form.coach_id}
                  onChange={e => { const id = e.target.value; setForm(f => ({ ...f, coach_id: id, classe: '', centre: '' })); setRapportClasseFil('actif'); fetchRapportCoachGroupes(id); }}
                  style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13 }}>
                  <option value="">-- Sélectionner --</option>
                  {coachs.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Date d'observation *</label>
                <input type="date" value={form.date_observation} onChange={e => setForm(f => ({ ...f, date_observation: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: COULEURS.gris600 }}>Classe observée</label>
                {rapportGroupes.length > 0 && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[{ v: 'actif', l: '🟢 Actives' }, { v: 'termine', l: '⬛ Terminées' }, { v: 'tous', l: 'Toutes' }].map(f => (
                      <button key={f.v} type="button" onClick={() => { setRapportClasseFil(f.v); setForm(fp => ({ ...fp, classe: '' })); }}
                        style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: `1.5px solid ${rapportClasseFil === f.v ? SUP_COLOR : COULEURS.gris200}`, background: rapportClasseFil === f.v ? SUP_COLOR + '15' : '#fff', color: rapportClasseFil === f.v ? SUP_COLOR : COULEURS.gris600, cursor: 'pointer' }}>
                        {f.l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {rapportGroupes.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {rapportGroupes.filter(g => rapportClasseFil === 'tous' ? true : rapportClasseFil === 'termine' ? g.statut === 'termine' : g.statut !== 'termine').map(g => {
                    const isSelected = form.classe === g.nom;
                    return (
                      <button key={g.id} type="button" onClick={() => setForm(f => ({ ...f, classe: g.nom, centre: lieuAutoClasseSup(g) }))}
                        style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1.5px solid ${isSelected ? SUP_COLOR : COULEURS.gris200}`, background: isSelected ? SUP_COLOR + '15' : '#fff', color: isSelected ? SUP_COLOR : COULEURS.navy, cursor: 'pointer' }}>
                        {g.nom} {g.niveau ? `· ${g.niveau}` : ''}
                      </button>
                    );
                  })}
                </div>
              )}
              <input value={form.classe} onChange={e => setForm(f => ({ ...f, classe: e.target.value }))}
                placeholder={form.coach_id ? 'Ou saisir le nom de la classe…' : 'Sélectionnez d\'abord un coach'}
                style={{ width: '100%', padding: '9px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Centre / Lieu</label>
              <input value={form.centre} onChange={e => setForm(f => ({ ...f, centre: e.target.value }))}
                placeholder="Rempli automatiquement selon la classe sélectionnée"
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[['ponctualite', '⏰ Ponctualité'], ['pedagogie', '🎓 Pédagogie'], ['preparation', '📝 Organisation du cours'], ['expression_engagement', '🗣️ Expression & engagement'], ['gestion_classe', '🧑\u200d🏫 Gestion de classe'], ['feedback_correction', '✍️ Feedback & correction'], ['professionnalisme', '🤝 Professionnalisme']].map(([key, label]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: COULEURS.gris600 }}>{label}</span>
                  <EtoileRatingSup valeur={form[key]} onChange={n => setForm(f => ({ ...f, [key]: n }))} />
                </div>
              ))}
            </div>
            {/* ── APPRÉCIATIONS : deux échelles FERMÉES, pas des étoiles ──
                Interactivité et approche grammaticale ne se notent pas de 1 à 5 à main
                levée : ce sont des constats qualifiés, chacun valant un nombre de points
                fixe. Les proposer en étoiles aurait laissé chaque observateur placer sa
                propre frontière entre « 3 » et « 4 », et les notes auraient cessé d'être
                comparables d'un coach à l'autre. Le poids est affiché à la saisie ; c'est le
                serveur qui l'applique. */}
            <div style={{ border: `1px solid ${COULEURS.gris200}`, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: COULEURS.navy, marginBottom: 12 }}>🎯 Appréciations</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
                {[
                  { cle: 'interactivite_classe',  titre: '👥 Interactivité de la classe', echelle: ECHELLE_INTERACTIVITE },
                  { cle: 'approche_grammaticale', titre: '📖 Approche grammaticale',      echelle: ECHELLE_GRAMMAIRE },
                ].map(({ cle, titre, echelle }) => (
                  <div key={cle}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 7 }}>{titre}</div>
                    {echelle.map(o => {
                      const actif = form[cle] === o.v;
                      return (
                        <button key={o.v} type="button"
                          onClick={() => setForm(f => ({ ...f, [cle]: actif ? '' : o.v }))}
                          style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, width: '100%',
                            textAlign: 'left', padding: '9px 13px', marginBottom: 6, borderRadius: 9, cursor: 'pointer',
                            fontFamily: 'inherit',
                            border: `1.5px solid ${actif ? SUP_COLOR : COULEURS.gris200}`,
                            background: actif ? `${SUP_COLOR}10` : COULEURS.blanc }}>
                          <span>
                            <span style={{ display: 'block', fontSize: 12.5, fontWeight: actif ? 700 : 600, color: COULEURS.navy }}>{o.l}</span>
                            <span style={{ display: 'block', fontSize: 11, color: COULEURS.gris400, marginTop: 2 }}>{o.d}</span>
                          </span>
                          <span style={{ fontSize: 11.5, fontWeight: 800, color: actif ? SUP_COLOR : COULEURS.gris400, whiteSpace: 'nowrap' }}>{o.pts}/5</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* L'état du réseau est un CONSTAT DE CONTEXTE : il explique une séance
                  difficile sans la mettre au débit du coach, donc il n'entre pas dans la
                  note. « Autre » vaut « non applicable » — un cours en présentiel n'a pas
                  d'état de connexion. */}
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COULEURS.gris100}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 7 }}>
                  📶 Internet <span style={{ fontWeight: 500, color: COULEURS.gris400 }}>— constat de contexte, sans effet sur la note</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[['stable', '📶 Stable'], ['instable', '📉 Instable'], ['autre', '➖ Autre']].map(([v, l]) => (
                    <button key={v} type="button"
                      onClick={() => setForm(f => ({ ...f, internet: f.internet === v ? '' : v }))}
                      style={{ padding: '8px 15px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5,
                        fontWeight: form.internet === v ? 700 : 500,
                        border: `1.5px solid ${form.internet === v ? SUP_COLOR : COULEURS.gris200}`,
                        background: form.internet === v ? `${SUP_COLOR}10` : COULEURS.blanc,
                        color: COULEURS.navy }}>{l}</button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 6 }}>
                  « Autre » vaut « non applicable » — un cours en présentiel n'a pas d'état de connexion.
                </div>
              </div>
            </div>

            {/* Deux qualifications qui changent la LECTURE du rapport : une note de mock
                teaching ne se compare pas à celle d'un cours normal, et l'export les sépare
                en deux feuilles. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
              {[
                { cle: 'type_observation', titre: "Type d'observation", options: [['cours', '📝 Cours normal'], ['evaluation', '📊 Évaluation'], ['mock_teaching', '🎭 Mock teaching']] },
                { cle: 'type_lecon',       titre: 'Type de leçon',      options: [['online', '💻 Online'], ['in_person', '🏫 In-person'], ['home_tutoring', '🏠 Home-tutoring']] },
              ].map(({ cle, titre, options }) => (
                <div key={cle}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>{titre}</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {options.map(([v, l]) => (
                      <button key={v} type="button"
                        onClick={() => setForm(f => ({ ...f, [cle]: f[cle] === v ? '' : v }))}
                        style={{ padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5,
                          fontWeight: form[cle] === v ? 700 : 500,
                          border: `1.5px solid ${form[cle] === v ? SUP_COLOR : COULEURS.gris200}`,
                          background: form[cle] === v ? `${SUP_COLOR}10` : COULEURS.blanc,
                          color: COULEURS.navy }}>{l}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Observations</label>
              <textarea rows={3} value={form.observations} onChange={e => setForm(f => ({ ...f, observations: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Recommandations</label>
              <textarea rows={3} value={form.recommandations} onChange={e => setForm(f => ({ ...f, recommandations: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            {manquants.length > 0 && (
              <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#FFFBEB',
                border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: '#92400E' }}>
                <span style={{ fontSize: 15, lineHeight: 1.2 }}>⚠️</span>
                <span>
                  <strong>Il reste à renseigner :</strong> {manquants.join(' · ')}.
                  <span style={{ display: 'block', fontSize: 11.5, marginTop: 3 }}>
                    Les sept critères sont requis : un critère laissé vide calculerait la note sur 30 au lieu de 35,
                    et elle cesserait d'être comparable à celle des autres coachs.
                  </span>
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setRapportGroupes([]); }} style={{ padding: '9px 18px', background: COULEURS.gris100, border: 'none', borderRadius: 8, fontSize: 13, color: COULEURS.navy, cursor: 'pointer', fontWeight: 600 }}>Annuler</button>
              {/* LE BOUTON DIT QU'IL EST DÉSACTIVÉ. Il gardait sa couleur pleine et son
                  curseur « pointer » : on cliquait, rien ne se passait, et rien n'expliquait
                  pourquoi. La liste de ce qui manque s'affiche juste au-dessus. */}
              <button onClick={soumettreRapport} disabled={saving || manquants.length > 0}
                title={manquants.length ? `À renseigner : ${manquants.join(', ')}` : 'Soumettre ce rapport'}
                style={{ padding: '9px 22px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  background: manquants.length || saving ? COULEURS.gris200 : SUP_COLOR,
                  color: manquants.length || saving ? COULEURS.gris400 : '#fff',
                  cursor: manquants.length || saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Envoi…' : 'Soumettre'}
              </button>
            </div>
          </div>
        </ModalSup>
      )}
    </div>
  );
}

// ─────────────────────────── 4. ANOMALIES ───────────────────────────
export function OngletAnomaliesSuperviseur() {
  const prompt = usePrompt();
  const [anomalies, setAnomalies] = useState([]);
  const [coachs,     setCoachs]    = useState([]);
  const [loading,    setLoading]   = useState(false);
  const [filtreStatut, setFiltreStatut] = useState('tous');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ coach_id: '', type_anomalie: 'cahier_incomplet', description: '', gravite: 'moyenne' });
  const [escalade, setEscalade] = useState(null); // anomalie en cours d'escalade
  const [saving, setSaving] = useState(false);
  const [anomaliesEnCours, setAnomaliesEnCours] = useState(new Set()); // empêche le double-clic maj anomalie

  const fetchAnomalies = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/superviseur/anomalies`, { headers: supAuthHdrs() });
      const d = await r.json();
      setAnomalies(d.anomalies || []);
    } catch { setAnomalies([]); }
    finally { setLoading(false); }
  }, []);
  const fetchCoachs = useCallback(async () => {
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/superviseur/coachs-conformite`, { headers: supAuthHdrs() });
      const d = await r.json();
      setCoachs(d.coachs || []);
    } catch { setCoachs([]); }
  }, []);
  useEffect(() => { fetchAnomalies(); fetchCoachs(); }, [fetchAnomalies, fetchCoachs]);

  async function creerAnomalie() {
    if (!form.coach_id || !form.description.trim() || saving) return;
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/superviseur/anomalies`, { method: 'POST', headers: supAuthHdrs(), body: JSON.stringify(form) });
      if (r.ok) {
        setShowForm(false); setForm({ coach_id: '', type_anomalie: 'cahier_incomplet', description: '', gravite: 'moyenne' }); fetchAnomalies();
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Signalement refusé', { duration: 5000 });
      }
    } catch { toast.error('Impossible de joindre le serveur', { duration: 5000 }); }
    finally { setSaving(false); }
  }

  async function majAnomalie(id, updates) {
    if (anomaliesEnCours.has(id)) return;
    setAnomaliesEnCours(prev => new Set(prev).add(id));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/superviseur/anomalies/${id}`, { method: 'PATCH', headers: supAuthHdrs(), body: JSON.stringify(updates) });
      if (r.ok) {
        fetchAnomalies();
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Modification refusée', { duration: 5000 });
      }
    } catch {
      toast.error('Impossible de joindre le serveur', { duration: 5000 });
    } finally {
      setAnomaliesEnCours(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  const GRAVITE_C = { haute: '#DC2626', moyenne: '#D97706', basse: '#16A34A' };
  const STATUT_C  = { ouvert: { bg: '#FEE2E2', txt: '#991B1B', lib: 'Ouvert' }, en_cours: { bg: '#FEF3C7', txt: '#D97706', lib: 'En cours' }, escaladé: { bg: '#EDE9FE', txt: '#6D28D9', lib: 'Escaladé' }, fermé: { bg: '#F1F5F9', txt: '#475569', lib: 'Fermé' } };
  const filtres = anomalies.filter(a => filtreStatut === 'tous' || a.statut === filtreStatut);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COULEURS.navy }}>⚠️ Anomalies</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: COULEURS.gris400 }}>Non-conformités signalées sur les coachs</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ padding: '9px 18px', background: SUP_COLOR, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Signaler une anomalie</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {['tous', 'ouvert', 'en_cours', 'escaladé', 'fermé'].map(v => (
          <button key={v} onClick={() => setFiltreStatut(v)}
            style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1.5px solid ${filtreStatut === v ? SUP_COLOR : COULEURS.gris200}`, background: filtreStatut === v ? SUP_COLOR + '15' : '#fff', color: filtreStatut === v ? SUP_COLOR : COULEURS.gris600, cursor: 'pointer' }}>
            {v === 'tous' ? 'Toutes' : STATUT_C[v]?.lib}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : filtres.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 50, background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}`, color: COULEURS.gris400 }}>Aucune anomalie.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtres.map(a => {
            const st = STATUT_C[a.statut] || STATUT_C.ouvert;
            return (
              <div key={a.id} style={{ background: '#fff', border: `1.5px solid ${COULEURS.gris200}`, borderLeft: `4px solid ${GRAVITE_C[a.gravite]}`, borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy }}>{a.coach?.prenom} {a.coach?.nom} - {a.type_anomalie?.replace(/_/g, ' ')}</div>
                    <div style={{ fontSize: 12, color: COULEURS.gris600, marginTop: 4 }}>{a.description}</div>
                    <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 4 }}>📅 {fmtDateSup(a.created_at)} · Gravité : <span style={{ color: GRAVITE_C[a.gravite], fontWeight: 700 }}>{a.gravite}</span></div>
                    {a.resolution && <div style={{ marginTop: 6, fontSize: 12, color: '#065F46', background: '#F0FDF4', padding: '6px 10px', borderRadius: 8 }}>✅ {a.resolution}</div>}
                  </div>
                  <span style={{ background: st.bg, color: st.txt, padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{st.lib}</span>
                </div>
                {!['fermé'].includes(a.statut) && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COULEURS.gris100}`, flexWrap: 'wrap' }}>
                    {a.statut === 'ouvert' && <button onClick={() => majAnomalie(a.id, { statut: 'en_cours' })} style={{ padding: '5px 12px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 7, fontSize: 11, color: '#D97706', fontWeight: 600, cursor: 'pointer' }}>▶ Traiter</button>}
                    {a.statut !== 'escaladé' && <button onClick={() => setEscalade(a.id)} style={{ padding: '5px 12px', background: '#EDE9FE', border: '1px solid #DDD6FE', borderRadius: 7, fontSize: 11, color: '#6D28D9', fontWeight: 600, cursor: 'pointer' }}>⬆ Escalader</button>}
                    <button onClick={async () => { const res = await prompt('Résolution :', { titre: 'Fermer l\'anomalie' }); if (res) majAnomalie(a.id, { statut: 'fermé', resolution: res }); }} style={{ padding: '5px 12px', background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 7, fontSize: 11, color: '#065F46', fontWeight: 600, cursor: 'pointer' }}>✓ Fermer</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal escalade */}
      {escalade && (
        <ModalSup title="⬆ Escalader l'anomalie" onClose={() => setEscalade(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[{ v: 'pa', l: 'PA Advisor' }, { v: 'ceo', l: 'Direction (CEO)' }, { v: 'rh', l: 'RH' }].map(o => (
              <button key={o.v} onClick={() => { majAnomalie(escalade, { escalade_a: o.v }); setEscalade(null); }}
                style={{ padding: '12px 16px', textAlign: 'left', background: COULEURS.gris50, border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 10, fontSize: 13, fontWeight: 600, color: COULEURS.navy, cursor: 'pointer' }}>
                {o.l}
              </button>
            ))}
          </div>
        </ModalSup>
      )}

      {/* Modal création */}
      {showForm && (
        <ModalSup title="⚠️ Signaler une anomalie" onClose={() => setShowForm(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Coach *</label>
              <select value={form.coach_id} onChange={e => setForm(f => ({ ...f, coach_id: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13 }}>
                <option value="">-- Sélectionner --</option>
                {coachs.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Type</label>
              <select value={form.type_anomalie} onChange={e => setForm(f => ({ ...f, type_anomalie: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13 }}>
                {[['cahier_incomplet', 'Cahier incomplet'], ['absence_non_justifiee', 'Absence non justifiée'], ['qualite_faible', 'Qualité pédagogique faible'], ['retard_recurrent', 'Retard récurrent'], ['autre', 'Autre']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Gravité</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['basse', 'moyenne', 'haute'].map(g => (
                  <button key={g} onClick={() => setForm(f => ({ ...f, gravite: g }))}
                    style={{ padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${form.gravite === g ? GRAVITE_C[g] : COULEURS.gris200}`, background: form.gravite === g ? GRAVITE_C[g] + '15' : '#fff', color: form.gravite === g ? GRAVITE_C[g] : COULEURS.gris600, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{g}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Description *</label>
              <textarea rows={4} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', background: COULEURS.gris100, border: 'none', borderRadius: 8, fontSize: 13, color: COULEURS.navy, cursor: 'pointer', fontWeight: 600 }}>Annuler</button>
              <button onClick={creerAnomalie} disabled={saving} style={{ padding: '9px 22px', background: SUP_COLOR, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Envoi…' : 'Signaler'}</button>
            </div>
          </div>
        </ModalSup>
      )}
    </div>
  );
}

// ─────────────────────────── 5. GESTION DEPUTIES ───────────────────────────
export function OngletGestionDeputies() {
  const [deputies, setDeputies] = useState([]);
  const [coachs,    setCoachs]   = useState([]);
  const [loading,   setLoading]  = useState(false);
  const [assignation, setAssignation] = useState(null); // deputy en cours d'assignation
  const [form, setForm] = useState({ type_mission: 'observation', titre: '', description: '', coach_id: '', centre: '', date_debut: '', date_fin: '' });
  const [saving, setSaving] = useState(false);

  const fetchDeputies = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/superviseur/deputies`, { headers: supAuthHdrs() });
      const d = await r.json();
      setDeputies(d.deputies || []);
    } catch { setDeputies([]); }
    finally { setLoading(false); }
  }, []);
  const fetchCoachs = useCallback(async () => {
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/superviseur/coachs-conformite`, { headers: supAuthHdrs() });
      const d = await r.json();
      setCoachs(d.coachs || []);
    } catch { setCoachs([]); }
  }, []);
  useEffect(() => { fetchDeputies(); fetchCoachs(); }, [fetchDeputies, fetchCoachs]);

  async function assignerMission() {
    if (!assignation || !form.titre.trim() || saving) return;
    setSaving(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/superviseur/deputies/${assignation.id}/missions`, {
        method: 'POST', headers: supAuthHdrs(), body: JSON.stringify(form),
      });
      if (r.ok) {
        setAssignation(null); setForm({ type_mission: 'observation', titre: '', description: '', coach_id: '', centre: '', date_debut: '', date_fin: '' }); fetchDeputies();
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Assignation refusée', { duration: 5000 });
      }
    } catch { toast.error('Impossible de joindre le serveur', { duration: 5000 }); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COULEURS.navy }}>👥 Gestion des Deputy Superviseurs</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: COULEURS.gris400 }}>Missions assignées à vos Deputy Superviseurs</p>
        </div>
        <button onClick={fetchDeputies} style={{ padding: '7px 14px', background: SUP_COLOR + '15', border: `1px solid ${SUP_COLOR}40`, borderRadius: 8, fontSize: 12, color: SUP_COLOR, fontWeight: 600, cursor: 'pointer' }}>↻ Actualiser</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : deputies.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 50, background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}`, color: COULEURS.gris400 }}>
          Aucun Deputy Superviseur trouvé. Les comptes Deputy sont créés via la gestion des utilisateurs.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 14 }}>
          {deputies.map(d => (
            <div key={d.id} style={{ background: '#fff', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 14, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: SUP_COLOR + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: SUP_COLOR, fontSize: 14, flexShrink: 0 }}>
                  {(d.prenom?.[0] || '') + (d.nom?.[0] || '')}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: COULEURS.navy, fontSize: 13 }}>{d.prenom} {d.nom}</div>
                  <div style={{ fontSize: 11, color: COULEURS.gris400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.email}</div>
                </div>
                <span style={{ marginLeft: 'auto', background: d.actif ? '#D1FAE5' : '#F1F5F9', color: d.actif ? '#065F46' : '#64748B', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                  {d.actif ? 'Actif' : 'Inactif'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10, fontSize: 11, color: COULEURS.gris600, marginBottom: 12 }}>
                <span>🎯 {d.nb_missions_actives} mission(s) active(s)</span>
                <span>📋 {d.nb_rapports_soumis} rapport(s)</span>
              </div>
              {d.missions?.slice(0, 3).map(m => (
                <div key={m.id} style={{ fontSize: 11, color: COULEURS.gris600, padding: '4px 0', borderTop: `1px solid ${COULEURS.gris100}` }}>
                  {m.titre} - <span style={{ fontWeight: 600 }}>{m.statut}</span>
                </div>
              ))}
              <button onClick={() => setAssignation(d)} style={{ marginTop: 10, width: '100%', padding: '8px 0', background: SUP_COLOR, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Assigner une mission</button>
            </div>
          ))}
        </div>
      )}

      {assignation && (
        <ModalSup title={`🎯 Assigner une mission - ${assignation.prenom} ${assignation.nom}`} onClose={() => setAssignation(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Type de mission</label>
              <select value={form.type_mission} onChange={e => setForm(f => ({ ...f, type_mission: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13 }}>
                {[['observation', 'Observation'], ['verification_cahier', 'Vérification cahier'], ['suivi_absence', "Suivi d'absence"], ['autre', 'Autre']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Titre *</label>
              <input value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Coach concerné (optionnel)</label>
              <select value={form.coach_id} onChange={e => setForm(f => ({ ...f, coach_id: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13 }}>
                <option value="">-- Aucun --</option>
                {coachs.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Date début</label>
                <input type="date" value={form.date_debut} onChange={e => setForm(f => ({ ...f, date_debut: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Date fin</label>
                <input type="date" value={form.date_fin} onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Centre</label>
              <input value={form.centre} onChange={e => setForm(f => ({ ...f, centre: e.target.value }))} placeholder="ex: Cocody, En ligne…"
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Description</label>
              <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setAssignation(null)} style={{ padding: '9px 18px', background: COULEURS.gris100, border: 'none', borderRadius: 8, fontSize: 13, color: COULEURS.navy, cursor: 'pointer', fontWeight: 600 }}>Annuler</button>
              <button onClick={assignerMission} disabled={saving || !form.titre.trim()} style={{ padding: '9px 22px', background: SUP_COLOR, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Envoi…' : 'Assigner'}</button>
            </div>
          </div>
        </ModalSup>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   MES TÂCHES & CLASSEMENT — portés depuis dash (SuperviseurDashboard.jsx)

   CES DEUX ÉCRANS NE DEMANDENT AUCUNE ROUTE NOUVELLE : « Mes tâches » lit les compteurs de
   `GET /api/superviseur/dashboard`, et « Classement » se déduit entièrement des rapports
   d'observation que `OngletRapportsDeputySuperviseur` charge déjà. C'est ce qui les rend
   portables tout de suite, là où Plannings et Observer un cours dépendent du modèle de cours.

   ⚠️ CE QU'ILS AFFICHERONT AUJOURD'HUI. `rapports_observation` contient 7 lignes, toutes
   taguées `plateforme = 'dash'` : côté bet-elearning il y en a zéro. Ces écrans sont donc
   vides en production, et le resteront jusqu'à ce qu'un Deputy soumette un rapport depuis
   cette plateforme. Ce n'est pas un bug — c'est la séparation voulue par les deux routeurs
   serveur (`superviseurRoutesBet.js` / `superviseurRoutesDash.js`, aiguillés par l'en-tête
   `X-Plateforme`). Les états vides le disent explicitement plutôt que de laisser croire à
   une panne.
   ═══════════════════════════════════════════════════════════════════════════════════════════ */

const CLASSEMENT_PAR_PAGE = 10;

/** Le début de la période choisie, ou `null` pour « toute période ». */
function debutPeriodeClassement(periode) {
  const d = new Date();
  if (periode === 'semaine') { d.setDate(d.getDate() - 7); return d; }
  if (periode === 'mois')    { d.setMonth(d.getMonth() - 1); return d; }
  return null;
}

/**
 * MES TÂCHES — ce qui attend le superviseur, et où le traiter.
 *
 * `general` distingue les deux métiers : le superviseur général lit des rapports qu'on lui a
 * soumis et des anomalies à trancher ; le Deputy, lui, attend qu'on lise les SIENS et qu'on
 * les commente. Ce sont deux files opposées, et les afficher avec les mêmes libellés aurait
 * fait croire au Deputy qu'il avait des rapports à relire.
 */
export function OngletMesTachesSuperviseur({ general = true }) {
  const [kpi, setKpi] = useState(null);
  const [missions, setMissions] = useState([]);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`${_API_URL_ADMIN}/api/superviseur/dashboard`, { headers: supAuthHdrs() });
        const d = await r.json().catch(() => ({}));
        if (vivant) setKpi(r.ok ? d : {});
      } catch { if (vivant) setKpi({}); }
      if (!general) {
        try {
          const r = await fetch(`${_API_URL_ADMIN}/api/superviseur/mes-missions`, { headers: supAuthHdrs() });
          const d = await r.json().catch(() => ({}));
          if (vivant) setMissions(Array.isArray(d.missions) ? d.missions : []);
        } catch { /* le compteur de missions restera à zéro */ }
      }
    })();
    return () => { vivant = false; };
  }, [general]);

  const chargement = kpi === null;
  const k = kpi || {};

  const taches = general ? [
    { icone: '📋', label: 'Rapports Deputy non lus',  n: k.nb_rapports_non_lus || 0,   vers: '/admin/superviseur/rapports-deputy' },
    // ANOMALIES MASQUÉ POUR LE MOMENT - mènerait vers une entrée retirée du menu.
    // { icone: '⚠️', label: 'Anomalies ouvertes',       n: k.nb_anomalies_ouvertes || 0, vers: '/admin/superviseur/anomalies' },
  ] : [
    { icone: '🎯', label: 'Missions assignées à traiter', n: missions.filter(m => ['assignée', 'en_cours'].includes(m.statut)).length, vers: '/admin/deputy-superviseur/missions' },
    { icone: '📋', label: 'Mes rapports en attente de lecture', n: k.nb_rapports_non_lus || 0, vers: '/admin/deputy-superviseur/rapports' },
  ];

  const ouvertes = taches.filter(t => t.n > 0);
  const total = taches.reduce((s, t) => s + t.n, 0);

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: COULEURS.navy }}>✅ Mes tâches</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: COULEURS.gris400 }}>
          {chargement ? 'Calcul en cours…'
            : total > 0 ? `${total} élément${total > 1 ? 's' : ''} à traiter au total.`
            : 'Rien à traiter pour le moment — tout est à jour.'}
        </p>
      </div>

      {chargement ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : ouvertes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 46, background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}` }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🎉</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy }}>Aucune tâche en attente</div>
          <div style={{ fontSize: 12, color: COULEURS.gris400, marginTop: 5, maxWidth: 420, margin: '5px auto 0', lineHeight: 1.6 }}>
            Aucun rapport ni anomalie n'a encore été enregistré depuis BET E-Learning. Les
            observations faites sur dash restent sur dash — les deux plateformes ont leur
            propre file de supervision.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
          {ouvertes.map(t => (
            <a key={t.label} href={t.vers}
              style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none',
                background: COULEURS.blanc, border: `1.5px solid ${COULEURS.gris200}`,
                borderLeft: `4px solid ${SUP_COLOR}`, borderRadius: 14, padding: '16px 18px' }}>
              <span style={{ fontSize: 24 }}>{t.icone}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: COULEURS.navy }}>{t.label}</span>
              <span style={{ background: SUP_COLOR + '18', color: SUP_COLOR, borderRadius: 99,
                fontSize: 13, fontWeight: 800, padding: '3px 11px' }}>{t.n}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * CLASSEMENT DES COACHS — la moyenne des notes d'observation, par coach.
 *
 * TOUT EST CALCULÉ ICI, à partir des rapports. Le serveur ne sert pas de classement : il
 * renvoie les rapports, et c'est le même calcul que dash — moyenne des `note_globale`, et
 * tendance donnée par la comparaison de la dernière note à la première de la période.
 *
 * SOUS DEUX OBSERVATIONS, LA TENDANCE EST « STABLE » et non « hausse ». Avec une seule note
 * il n'y a rien dont on puisse dire si ça monte : afficher une flèche serait une affirmation
 * sans fondement sur le travail d'un coach.
 *
 * LA PAGE COURANTE EST BORNÉE après filtrage : un filtre qui réduit la liste ne doit pas
 * laisser l'écran sur une page devenue inexistante, donc vide sans explication.
 */
export function OngletClassementCoachs() {
  const [rapports, setRapports] = useState(null);
  const [periode, setPeriode] = useState('mois');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [page, setPage] = useState(1);
  /* Mois et année en plus de la plage libre : on compare un mois à l'autre bien plus souvent
     qu'on ne saisit deux dates, et composer « du 01/09 au 30/09 » à la main pour chaque mois
     est une corvée que ce raccourci supprime. */
  const [mois, setMois] = useState('');
  const [annee, setAnnee] = useState(String(new Date().getFullYear()));
  // Le dossier du coach, ouvert depuis le classement — le même que dans Cahiers coachs.
  const [coachOuvert, setCoachOuvert] = useState(null);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`${_API_URL_ADMIN}/api/superviseur/rapports-deputy`, { headers: supAuthHdrs() });
        const d = await r.json().catch(() => ({}));
        if (vivant) setRapports(Array.isArray(d.rapports) ? d.rapports : []);
      } catch { if (vivant) setRapports([]); }
    })();
    return () => { vivant = false; };
  }, []);

  const classement = (() => {
    const tous = rapports || [];
    /* Une plage de dates explicite l'emporte sur le raccourci de période : c'est le filtre le
       plus précis qui gagne, sinon poser des dates n'aurait aucun effet visible. */
    const dansPeriode = (du || au)
      ? tous.filter(r => {
          const d = r.date_observation || '';
          if (du && d && d < du) return false;
          if (au && d && d > au) return false;
          return true;
        })
      : mois
      ? tous.filter(r => String(r.date_observation || '').startsWith(`${annee}-${mois}`))
      : annee && annee !== 'tout'
      ? tous.filter(r => String(r.date_observation || '').startsWith(`${annee}-`))
      : (() => {
          const debut = debutPeriodeClassement(periode);
          return debut ? tous.filter(r => r.date_observation && new Date(r.date_observation) >= debut) : tous;
        })();

    const parCoach = {};
    dansPeriode.forEach(r => {
      const c = r.coach;
      if (!c?.id || !r.note_globale) return;
      (parCoach[c.id] ??= { coach: c, notes: [] });
      parCoach[c.id].notes.push(Number(r.note_globale));
    });

    return Object.values(parCoach).map(e => {
      const moyenne = e.notes.reduce((a, b) => a + b, 0) / e.notes.length;
      const tendance = e.notes.length >= 2
        ? (e.notes[e.notes.length - 1] > e.notes[0] ? 'hausse'
          : e.notes[e.notes.length - 1] < e.notes[0] ? 'baisse' : 'stable')
        : 'stable';
      return { ...e, moyenne, nb: e.notes.length, tendance, notes: e.notes };
    }).sort((a, b) => b.moyenne - a.moyenne);
  })();

  const totalPages = Math.max(1, Math.ceil(classement.length / CLASSEMENT_PAR_PAGE));
  const pageSure = Math.min(page, totalPages);
  const visibles = classement.slice((pageSure - 1) * CLASSEMENT_PAR_PAGE, pageSure * CLASSEMENT_PAR_PAGE);
  const moyGlobale = classement.length
    ? classement.reduce((s, e) => s + e.moyenne, 0) / classement.length : null;
  const sousTrois = classement.filter(e => e.moyenne < 3).length;

  /* Le libellé de la période, écrit UNE fois : l'en-tête, chaque ligne et l'export Excel le
     répètent, et trois formulations différentes du même filtre feraient douter de ce qu'on
     regarde. */
  const MOIS_LIB = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const libellePeriode = (du || au)
    ? `du ${du || '…'} au ${au || '…'}`
    : mois ? `${MOIS_LIB[Number(mois) - 1]} ${annee}`
    : annee && annee !== 'tout' ? `année ${annee}`
    : periode === 'semaine' ? '7 derniers jours'
    : periode === 'mois' ? '30 derniers jours'
    : 'toute période';

  /* Les années PROPOSÉES sont celles qui existent en base, jamais une liste figée : offrir
     2024 quand aucun rapport n'y figure donne un filtre qui ne rend rien. */
  const anneesDisponibles = [...new Set((rapports || [])
    .map(r => String(r.date_observation || '').slice(0, 4)).filter(a => a.length === 4))]
    .sort((a, b) => b.localeCompare(a));

  const medaille = i => ['🥇', '🥈', '🥉'][i] || null;

  const puce = (actif) => ({
    padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 700,
    fontFamily: '"Plus Jakarta Sans",sans-serif',
    border: `1.5px solid ${actif ? SUP_COLOR : COULEURS.gris200}`,
    background: actif ? SUP_COLOR : COULEURS.blanc, color: actif ? '#fff' : COULEURS.gris600,
  });

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: COULEURS.navy }}>🏆 Classement des coachs</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: COULEURS.gris400 }}>
          Moyenne des notes d'observation{du || au ? ' sur la plage choisie'
            : periode === 'semaine' ? ' des 7 derniers jours'
            : periode === 'mois' ? ' des 30 derniers jours' : ', toute période'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        {[{ v: 'semaine', l: 'Semaine' }, { v: 'mois', l: 'Mois' }, { v: 'tout', l: 'Tout' }].map(p => (
          <button key={p.v} onClick={() => { setPeriode(p.v); setDu(''); setAu(''); setPage(1); }}
            style={puce(!du && !au && periode === p.v)}>{p.l}</button>
        ))}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11, color: COULEURS.gris400 }}>Mois</label>
          <select value={mois} onChange={e => { setMois(e.target.value); setDu(''); setAu(''); setPage(1); }}
            style={{ padding: '5px 8px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, fontSize: 12, fontFamily: 'inherit' }}>
            <option value="">- Tous -</option>
            {MOIS_LIB.map((m, i2) => <option key={m} value={String(i2 + 1).padStart(2, '0')}>{m}</option>)}
          </select>
          <select value={annee} onChange={e => { setAnnee(e.target.value); setDu(''); setAu(''); setPage(1); }}
            style={{ padding: '5px 8px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, fontSize: 12, fontFamily: 'inherit' }}>
            <option value="tout">Toutes</option>
            {anneesDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <label style={{ fontSize: 11, color: COULEURS.gris400 }}>Du</label>
          <input type="date" value={du} onChange={e => { setDu(e.target.value); setPage(1); }}
            style={{ padding: '5px 8px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, fontSize: 12 }} />
          <label style={{ fontSize: 11, color: COULEURS.gris400 }}>au</label>
          <input type="date" value={au} onChange={e => { setAu(e.target.value); setPage(1); }}
            style={{ padding: '5px 8px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, fontSize: 12 }} />
          {(du || au) && (
            <button onClick={() => { setDu(''); setAu(''); setPage(1); }}
              style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, fontSize: 11, cursor: 'pointer' }}>✕</button>
          )}
          <button
            onClick={() => exporterClassementCoachs({
              lignes: classement.map(e => ({
                nom: `${e.coach.prenom || ''} ${e.coach.nom || ''}`.trim(),
                nb: e.nb, moyenne: e.moyenne, notes: e.notes, tendance: e.tendance,
              })),
              periode: libellePeriode,
              libelleVolume: 'Observations',
              titre: 'Classement des coachs - observations',
              nomFichier: 'classement_coachs',
            })}
            disabled={!classement.length}
            title={classement.length ? 'Exporter le classement' : 'Aucun coach noté à exporter'}
            style={{ padding: '6px 14px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 700,
              background: classement.length ? '#16A34A' : COULEURS.gris200,
              color: classement.length ? '#fff' : COULEURS.gris400,
              cursor: classement.length ? 'pointer' : 'not-allowed' }}>📊 Excel</button>
        </div>
      </div>

      {rapports === null ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : classement.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 46, background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}` }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy }}>Aucun coach noté</div>
          <div style={{ fontSize: 12, color: COULEURS.gris400, marginTop: 5, maxWidth: 440, margin: '5px auto 0', lineHeight: 1.6 }}>
            {(rapports || []).length === 0
              ? "Aucun rapport d'observation n'a encore été soumis depuis BET E-Learning. Le classement se construit à partir des notes globales de ces rapports."
              : 'Aucun rapport noté sur cette période.'}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14, marginBottom: 18 }}>
            {[
              { l: '🏅 Coachs évalués', v: classement.length,                                       c: SUP_COLOR },
              /* La meilleure note NOMME son coach : un « 4.4/5 » sans visage n'apprend rien à
                 qui cherche qui tire l'équipe vers le haut. */
              { l: '⭐ Meilleure note', v: classement[0] ? `${classement[0].moyenne.toFixed(1)}/5` : '—',
                sub: classement[0] ? `${classement[0].coach.prenom || ''} ${classement[0].coach.nom || ''}`.trim() : null,
                c: COULEURS.attention },
              { l: '📊 Note moyenne',  v: moyGlobale != null ? `${moyGlobale.toFixed(1)}/5` : '—',   c: COULEURS.cyanFonce },
              { l: '⚠️ Notes < 3',     v: sousTrois,                                                c: sousTrois ? COULEURS.erreur : COULEURS.succes },
            ].map(c => (
              <div key={c.l} style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`,
                borderRadius: 12, padding: '14px 18px', borderTop: `3px solid ${c.c}` }}>
                <div style={{ fontSize: 11, color: COULEURS.gris600 }}>{c.l}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.c, marginTop: 3 }}>{c.v}</div>
                {c.sub && <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 2 }}>{c.sub}</div>}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 9 }}>
            {visibles.map((e, i) => {
              const rang = (pageSure - 1) * CLASSEMENT_PAR_PAGE + i;
              const m = medaille(rang);
              const faible = e.moyenne < 3;
              return (
                /* La note vit sur l'entrée de classement (`e.moyenne`), pas sur le coach :
                   passer `e.coach` brut faisait afficher « Non évalué » en en-tête du
                   dossier d'un coach pourtant classé. */
                <div key={e.coach.id} onClick={() => setCoachOuvert({ ...e.coach, note_moyenne: e.moyenne })}
                  title={`Ouvrir le dossier de ${e.coach.prenom || ''} ${e.coach.nom || ''}`.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 13, cursor: 'pointer',
                    background: COULEURS.blanc, border: `1px solid ${faible ? '#FECACA' : COULEURS.gris200}`,
                    borderRadius: 12, padding: '13px 16px', transition: 'box-shadow .15s' }}
                  onMouseEnter={ev => { ev.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.09)'; }}
                  onMouseLeave={ev => { ev.currentTarget.style.boxShadow = 'none'; }}>
                  <div style={{ width: 30, textAlign: 'center', fontSize: m ? 19 : 13, fontWeight: 800, color: COULEURS.gris400 }}>
                    {m || rang + 1}
                  </div>
                  {/* L'avatar est cerclé de la couleur du barème : le verdict se lit avant même
                      d'arriver à la note, à l'autre bout de la ligne. */}
                  <div style={{ borderRadius: '50%', border: `2px solid ${NOTE_COULEUR(e.moyenne)}`, flexShrink: 0, lineHeight: 0 }}>
                    <PastilleGroupe nom={`${e.coach.prenom || ''} ${e.coach.nom || ''}`} url={e.coach.avatar_url} taille={40} accent={SUP_COLOR} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: COULEURS.navy, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {e.coach.prenom} {e.coach.nom}
                      <BadgeCategorieCoach note={e.moyenne} taille="xs" />
                    </div>
                    <div style={{ fontSize: 11.5, color: COULEURS.gris400, marginTop: 2 }}>
                      {e.nb} rapport{e.nb > 1 ? 's' : ''} · {libellePeriode}
                    </div>
                  </div>

                  {/* Les cinq dernières notes dans l'ordre : la moyenne seule ne dit pas si le
                      coach monte ou descend — deux coachs à 3,5 n'ont pas la même trajectoire. */}
                  <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 26, flexShrink: 0 }}>
                    {e.notes.slice(-5).map((n, ni) => (
                      <div key={ni} title={`Note : ${n}/5`}
                        style={{ width: 8, borderRadius: 3, background: NOTE_COULEUR(n), height: `${(n / 5) * 100}%`, minHeight: 4 }} />
                    ))}
                  </div>

                  <CercleNote note={e.moyenne} taille={48} />

                  <FlecheTendance tendance={e.tendance} nbNotes={e.nb} />
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  style={{ minWidth: 36, height: 36, borderRadius: 9, cursor: 'pointer',
                    border: `1.5px solid ${p === pageSure ? SUP_COLOR : COULEURS.gris200}`,
                    background: p === pageSure ? SUP_COLOR : COULEURS.blanc,
                    color: p === pageSure ? '#fff' : COULEURS.navy, fontSize: 13, fontWeight: 700 }}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Le dossier du coach, ouvert depuis le classement — exactement celui de Cahiers
          coachs. Le classement dit QUI est en difficulté ; la question suivante est toujours
          « pourquoi », et elle se lit dans ses observations, ses classes et ses contenus. */}
      {coachOuvert && (
        <ModalCoachDetail coach={coachOuvert} ongletInitial="observations" onFermer={() => setCoachOuvert(null)} />
      )}

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   OBSERVER UN COURS & PLANNINGS — portés depuis dash, sur les données e-learning

   LE CHOIX DE LA SOURCE EST DÉLIBÉRÉ ET IMPORTANT. dash lit `/api/groupes` et `/api/seances`
   (37 classes, 25 séances en production) ; ces écrans-ci lisent `/api/classes-elearning` et
   `/api/elearning/seances`, qui sont VIDES aujourd'hui. Ce n'est pas une erreur de câblage :
   les deux plateformes doivent rester séparées, sinon les classes présentielles de dash
   viendraient fausser ses propres calculs — taux de présence, moyennes, conformité — en se
   mélangeant à celles de l'e-learning. L'absence de données côté bet-elearning est l'état
   normal attendu pour l'instant.
   Les états vides le disent donc explicitement, au lieu de laisser croire à une panne.

   POURQUOI UN SEUL COMPOSANT POUR LES DEUX RÔLES. `renderObserverCours` du superviseur dash
   et `renderObserver` du Deputy sont le même écran, jusqu'aux noms de variables
   (`obsDateFrom`, `obsPage`, `OBS_PER_PAGE`) : ils ont été copiés l'un de l'autre. Les écrire
   une fois évite la troisième copie.

   CE QUE JE N'AI PAS FAIT, ET POURQUOI. Je n'ai pas remplacé le `renderObserver` du Deputy par
   ce composant. Son écran fonctionne, il porte la saisie d'un rapport d'observation que le
   superviseur n'a pas, et le réécrire aurait risqué une régression sans rien apporter à
   l'utilisateur. `onObserver` est là pour le jour où on voudra les fusionner.
   ═══════════════════════════════════════════════════════════════════════════════════════════ */

const OBS_PAR_PAGE = 8;

const STATUT_CLASSE = {
  active:    { label: 'Active',    couleur: '#16a34a', fond: '#dcfce7' },
  planifiee: { label: 'Planifiée', couleur: '#0891b2', fond: '#e0f2fe' },
  terminee:  { label: 'Terminée',  couleur: '#6b7280', fond: '#f3f4f6' },
  suspendue: { label: 'Suspendue', couleur: '#d97706', fond: '#fef3c7' },
};

/** Pagination partagée par les deux écrans ci-dessous. */
function BarrePages({ page, total, parPage, onChange, libelle }) {
  const nbPages = Math.max(1, Math.ceil(total / parPage));
  if (nbPages <= 1) return null;
  const sure = Math.min(page, nbPages);
  const btn = (actif, off) => ({
    minWidth: 34, height: 34, borderRadius: 8, fontSize: 12, fontWeight: actif ? 800 : 500,
    cursor: off ? 'default' : 'pointer', border: `1.5px solid ${actif ? SUP_COLOR : COULEURS.gris200}`,
    background: actif ? SUP_COLOR : COULEURS.blanc, color: actif ? '#fff' : off ? COULEURS.gris200 : COULEURS.navy,
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', padding: '14px 0' }}>
      <span style={{ fontSize: 11, color: COULEURS.gris400, marginRight: 6 }}>
        Page {sure}/{nbPages} · {total} {libelle}{total !== 1 ? 's' : ''}
      </span>
      <button onClick={() => onChange(Math.max(1, sure - 1))} disabled={sure === 1} style={btn(false, sure === 1)}>‹</button>
      {Array.from({ length: nbPages }, (_, i) => i + 1).map(p => (
        <button key={p} onClick={() => onChange(p)} style={btn(p === sure, false)}>{p}</button>
      ))}
      <button onClick={() => onChange(Math.min(nbPages, sure + 1))} disabled={sure === nbPages} style={btn(false, sure === nbPages)}>›</button>
    </div>
  );
}

/** Un bandeau d'état vide qui explique POURQUOI c'est vide — la séparation des plateformes. */
function VidePlateforme({ icone, titre, quoi }) {
  return (
    <div style={{ textAlign: 'center', padding: 46, background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}` }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>{icone}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy }}>{titre}</div>
      <p style={{ fontSize: 12, color: COULEURS.gris400, margin: '7px auto 0', maxWidth: 460, lineHeight: 1.65 }}>
        {quoi} Les {quoi.includes('séance') ? 'séances' : 'classes'} créées sur dash n'apparaissent pas
        ici : les deux plateformes sont volontairement séparées, pour qu'aucune ne fausse les
        statistiques de l'autre.
      </p>
    </div>
  );
}

/**
 * OBSERVER UN COURS — les classes e-learning, filtrables par date de démarrage.
 *
 * `onObserver`, quand il est fourni, ajoute l'action « observer » sur chaque classe (le Deputy
 * en a besoin pour amorcer un rapport). Sans lui, l'écran reste en consultation : c'est le cas
 * du superviseur général, qui lit les rapports des autres plutôt que d'en écrire.
 */
/* ══════════════════════════════════════════════════════════════════════════════════════════
   PRÉ-REMPLISSAGE DU RAPPORT D'OBSERVATION, D'UN ONGLET À L'AUTRE.

   Chez dash, le bouton « Observer » et le formulaire de rapport vivent dans le même
   composant : un `setState` suffit. Ici ce sont deux composants exportés séparément, et il
   n'existe aucun parent commun pour porter cet état. Plutôt que d'inventer un contexte pour
   trois champs, on dépose l'intention dans ce petit relais : `OngletObserverCours` l'écrit
   avant de naviguer, `OngletRapportsDeputySuperviseur` la lit à son montage et la consomme.

   CONSOMMÉ UNE SEULE FOIS, volontairement : sans cela, revenir plus tard sur l'onglet
   Rapports rouvrirait le formulaire sur une classe qu'on n'observe plus.
══════════════════════════════════════════════════════════════════════════════════════════ */
let observationEnAttente = null;
export function demanderObservation(infos) { observationEnAttente = infos; }
export function consommerObservation() {
  const v = observationEnAttente;
  observationEnAttente = null;
  return v;
}

/**
 * OBSERVER UN COURS — la liste des classes e-learning, en lecture seule.
 *
 * CE QUE CET ÉCRAN REMPLACE : une grille de cartes sans la moindre action. Le seul bouton
 * prévu, « Observer cette classe », dépendait d'une prop `onObserver` que le dashboard ne
 * passait pas : il ne s'affichait donc jamais. Le superviseur voyait la liste de ses classes
 * et ne pouvait rien en faire.
 *
 * On reprend le tableau de dash et ses trois actions, parce que ce sont trois questions
 * différentes : QUI est dans cette classe, QUAND elle se réunit, et COMMENT le coach l'anime.
 */
export function OngletObserverCours({ onObserver }) {
  const [classes, setClasses] = useState(null);
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);     // la classe ouverte
  const [tabDetail, setTabDetail] = useState('apprenants');
  const naviguer = useNavigate();

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`${_API_URL_ADMIN}/api/classes-elearning`, { headers: supAuthHdrs() });
        const d = await r.json().catch(() => ({}));
        if (vivant) setClasses(Array.isArray(d.classes) ? d.classes : []);
      } catch { if (vivant) setClasses([]); }
    })();
    return () => { vivant = false; };
  }, []);

  const toutes = classes || [];
  const filtrees = toutes.filter(cl => {
    if (!cl.date_debut) return true;          // une classe sans date reste visible
    if (du && cl.date_debut < du) return false;
    if (au && cl.date_debut > au) return false;
    return true;
  });
  const nbPages  = Math.max(1, Math.ceil(filtrees.length / OBS_PAR_PAGE));
  const pageSure = Math.min(page, nbPages);
  const visibles = filtrees.slice((pageSure - 1) * OBS_PAR_PAGE, pageSure * OBS_PAR_PAGE);

  const ouvrir = (cl, onglet) => { setDetail(cl); setTabDetail(onglet); };

  /* « Observer » part sur le formulaire de rapport avec le coach et la classe déjà posés.
     C'est exactement ce que fait dash ; seul le chemin diffère, les deux écrans étant ici
     deux composants distincts. */
  const observer = (cl) => {
    demanderObservation({ coach_id: cl.coach_id || '', classe: cl.nom || '', groupe_id: cl.id || '' });
    if (onObserver) { onObserver(cl); return; }
    naviguer('/admin/superviseur/rapports-deputy');
  };

  const th = { padding: '10px 12px', fontSize: 11, color: COULEURS.gris600, textTransform: 'uppercase', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' };
  const td = { padding: '10px 12px', fontSize: 12.5, color: COULEURS.navy };
  const btn = (fond, couleur, bord) => ({
    padding: '4px 9px', background: fond, border: bord || 'none', borderRadius: 6, fontSize: 11,
    color: couleur, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
  });
  const TYPE_LIB = { presentiel: '🏢 Présentiel', ligne: '🌐 En ligne', en_ligne: '🌐 En ligne', hybride: '⚡ Hybride' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: COULEURS.navy }}>👁️ Observer un cours</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: COULEURS.gris400 }}>
            Accès lecture seule — apprenants, sessions et rapport d'observation
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <label style={{ fontSize: 11, color: COULEURS.gris400 }}>Début du</label>
          <input type="date" value={du} onChange={e => { setDu(e.target.value); setPage(1); }}
            style={{ padding: '5px 8px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, fontSize: 12 }} />
          <label style={{ fontSize: 11, color: COULEURS.gris400 }}>au</label>
          <input type="date" value={au} onChange={e => { setAu(e.target.value); setPage(1); }}
            style={{ padding: '5px 8px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, fontSize: 12 }} />
          {(du || au) && (
            <button onClick={() => { setDu(''); setAu(''); setPage(1); }}
              style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, fontSize: 11, cursor: 'pointer' }}>✕</button>
          )}
        </div>
      </div>

      {/* Le rappel du périmètre : cet écran ne modifie rien, et le dire évite qu'on y
          cherche une action qui n'y est pas. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FFFBEB', border: '1px solid #FDE68A',
        borderRadius: 12, padding: '11px 15px', marginBottom: 16, fontSize: 12.5, color: '#92400E' }}>
        <span style={{ fontSize: 16 }}>🔒</span>
        <span>Accès <strong>lecture seule</strong>. Vous pouvez consulter les classes et préparer un rapport d'observation, sans modifier aucune donnée.</span>
      </div>

      {classes === null ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : filtrees.length === 0 ? (
        toutes.length === 0
          ? <VidePlateforme icone="🏫" titre="Aucune classe e-learning"
              quoi="Aucune classe n'a encore été créée sur BET E-Learning." />
          : <div style={{ textAlign: 'center', padding: 40, background: COULEURS.gris50, borderRadius: 12, color: COULEURS.gris400, fontSize: 13 }}>
              Aucune classe démarrée sur cette plage.
            </div>
      ) : (
        <>
          <div style={{ border: `1px solid ${COULEURS.gris200}`, borderRadius: 14, overflow: 'hidden', background: COULEURS.blanc }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
                <thead>
                  <tr style={{ background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris200}` }}>
                    <th style={th}>#</th><th style={th}>Classe</th><th style={th}>Coach</th><th style={th}>Niveau</th>
                    <th style={th}>Type</th><th style={{ ...th, textAlign: 'center' }}>Apprenants</th>
                    <th style={{ ...th, textAlign: 'center' }}>Séances</th><th style={th}>Début</th>
                    <th style={th}>Statut</th><th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((cl, idx) => {
                    const st = STATUT_CLASSE[cl.statut] || { label: cl.statut || '—', couleur: COULEURS.gris600, fond: COULEURS.gris100 };
                    return (
                      <tr key={cl.id} onClick={() => ouvrir(cl, 'apprenants')}
                        title={`Ouvrir la classe ${cl.nom || ''}`}
                        style={{ borderBottom: `1px solid ${COULEURS.gris100}`, cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.background = COULEURS.gris50; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <td style={{ ...td, color: COULEURS.gris400, fontWeight: 600 }}>{(pageSure - 1) * OBS_PAR_PAGE + idx + 1}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{cl.nom || '—'}</td>
                        <td style={td}>
                          {cl.coach_nom
                            ? <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <PastilleGroupe nom={cl.coach_nom} url={cl.coach_avatar_url} taille={24} />
                                <span style={{ fontWeight: 600, color: COULEURS.gris900 }}>{cl.coach_nom}</span>
                              </span>
                            : <span style={{ color: COULEURS.gris400 }}>—</span>}
                        </td>
                        <td style={td}>
                          {cl.niveau
                            ? <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: `${SUP_COLOR}18`, color: SUP_COLOR }}>{cl.niveau}</span>
                            : <span style={{ color: COULEURS.gris400 }}>—</span>}
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{TYPE_LIB[cl.type_cours] || cl.type_cours || '—'}</td>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: SUP_COLOR, fontSize: 14 }}>{cl.nb_apprenants ?? 0}</td>
                        {/* « 0 » affirmerait qu'aucune séance n'a eu lieu ; la route ne
                            renvoie pas toujours ce compte. On ne dit rien plutôt que faux. */}
                        <td style={{ ...td, textAlign: 'center', color: (cl.nb_seances ?? cl.nb_seances_realisees) == null ? COULEURS.gris400 : COULEURS.navy }}>
                          {cl.nb_seances ?? cl.nb_seances_realisees ?? '—'}
                        </td>
                        <td style={{ ...td, color: COULEURS.gris600, whiteSpace: 'nowrap' }}>{cl.date_debut ? fmtDateSup(cl.date_debut) : '—'}</td>
                        <td style={td}>
                          <span style={{ background: st.fond, color: st.couleur, borderRadius: 99, padding: '3px 10px', fontSize: 10, fontWeight: 700 }}>{st.label}</span>
                        </td>
                        <td style={td}>
                          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                            <button onClick={e => { e.stopPropagation(); ouvrir(cl, 'apprenants'); }}
                              style={btn(`${SUP_COLOR}14`, SUP_COLOR, `1px solid ${SUP_COLOR}35`)}>👥 Apprenants</button>
                            <button onClick={e => { e.stopPropagation(); ouvrir(cl, 'sessions'); }}
                              style={btn('#1D4ED8', '#fff')}>🎥 Sessions</button>
                            <button onClick={e => { e.stopPropagation(); observer(cl); }}
                              title="Ouvrir un rapport d'observation pour cette classe"
                              style={btn(COULEURS.blanc, COULEURS.gris900, `1px solid ${COULEURS.gris200}`)}>📋 Observer</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <BarrePages page={pageSure} total={filtrees.length} parPage={OBS_PAR_PAGE} onChange={setPage} libelle="classe" />
        </>
      )}

      {detail && (
        <ModalClasseObservee classe={detail} ongletInitial={tabDetail} onFermer={() => setDetail(null)} />
      )}
    </div>
  );
}

/**
 * La classe vue par l'observateur : qui la suit, et quand elle se réunit.
 *
 * DEUX ONGLETS PARCE QUE CE SONT DEUX QUESTIONS. Avant d'assister à un cours, le superviseur
 * veut savoir devant qui le coach se tiendra, puis à quelle heure se présenter. Les fondre
 * en une seule liste obligerait à faire défiler l'une pour atteindre l'autre.
 *
 * LECTURE SEULE DE BOUT EN BOUT : aucun bouton n'écrit ici, et le lien de salle suit la
 * règle commune — rien avant H-10, rien après la clôture.
 */
function ModalClasseObservee({ classe, ongletInitial = 'apprenants', onFermer }) {
  const [onglet, setOnglet] = useState(ongletInitial);
  const [apprenants, setApprenants] = useState(null);
  const [seances, setSeances] = useState(null);
  const [presences, setPresences] = useState(null);
  const [fichiers, setFichiers] = useState(null);
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  /* Les présences ont LEUR PROPRE plage de dates. Partager celle des séances obligerait à
     défiler jusqu'à l'autre onglet pour la changer, et surtout : on ne filtre pas les deux
     pour la même raison — ici on cherche l'assiduité sur un mois, là une séance précise. */
  const [duP, setDuP] = useState('');
  const [auP, setAuP] = useState('');
  /* Les fichiers aussi ont leur propre plage : on y cherche « ce qui a été déposé en
     octobre », une question sans rapport avec la période des séances ou des présences. */
  const [duF, setDuF] = useState('');
  const [auF, setAuF] = useState('');
  const [pageAV, setPageAV] = useState(1);
  const [pagePA, setPagePA] = useState(1);
  const [pageP,  setPageP]  = useState(1);
  const [pageF,  setPageF]  = useState(1);
  const PAR_PAGE_MODAL = 8;

  /* TOUT EST CHARGÉ EN UNE FOIS, et non onglet par onglet : les quatre lectures sont courtes
     et bornées à une classe, et les compteurs des onglets (« Apprenants (12) ») doivent être
     justes AVANT qu'on ne clique dessus. */
  useEffect(() => {
    let vivant = true;
    (async () => {
      const lire = async (url) => {
        try { const r = await fetch(`${_API_URL_ADMIN}${url}`, { headers: supAuthHdrs() }); return await r.json(); }
        catch { return {}; }
      };
      const [da, ds, dp, df] = await Promise.all([
        lire(`/api/classes-elearning/${classe.id}/apprenants`),
        lire(`/api/elearning/seances?classe_id=${classe.id}`),
        lire(`/api/elearning/classes/${classe.id}/presences`),
        lire(`/api/elearning/classes/${classe.id}/fichiers`),
      ]);
      if (!vivant) return;
      setApprenants(Array.isArray(da.apprenants) ? da.apprenants : []);
      setSeances(Array.isArray(ds.seances) ? ds.seances : []);
      setPresences(Array.isArray(dp.presences) ? dp.presences : []);
      setFichiers(Array.isArray(df.fichiers) ? df.fichiers : []);
    })();
    return () => { vivant = false; };
  }, [classe.id]);

  const creneaux = Array.isArray(classe.horaire) ? classe.horaire : [];
  const seancesFiltrees = (seances || []).filter(s => {
    if (du && String(s.date || '') < du) return false;
    if (au && String(s.date || '') > au) return false;
    return true;
  });
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const aVenir  = seancesFiltrees.filter(s => String(s.date || '') >= aujourdhui)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const passees = seancesFiltrees.filter(s => String(s.date || '') < aujourdhui)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  /* DEUX PAGINATIONS DISTINCTES. Fondues en une seule, les séances à venir — les seules sur
     lesquelles on peut encore agir — disparaîtraient dès qu'une classe compte dix passées. */
  const page = (liste, p) => liste.slice((p - 1) * PAR_PAGE_MODAL, p * PAR_PAGE_MODAL);
  const pageSureAV = Math.min(pageAV, Math.max(1, Math.ceil(aVenir.length  / PAR_PAGE_MODAL)));
  const pageSurePA = Math.min(pagePA, Math.max(1, Math.ceil(passees.length / PAR_PAGE_MODAL)));

  const TABS = [
    { id: 'infos',      label: '📋 Infos classe' },
    { id: 'apprenants', label: `🎓 Apprenants${apprenants?.length ? ` (${apprenants.length})` : ''}` },
    { id: 'sessions',   label: `🗓️ Planning & séances${seances?.length ? ` (${seances.length})` : ''}` },
    { id: 'presences',  label: `📊 Présences${presences?.length ? ` (${presences.length})` : ''}` },
    { id: 'fichiers',   label: `📁 Fichiers${fichiers?.length ? ` (${fichiers.length})` : ''}` },
  ];
  const td = { padding: '9px 12px', fontSize: 12.5, color: COULEURS.navy };
  const th = { padding: '9px 12px', fontSize: 11, color: COULEURS.gris600, textTransform: 'uppercase', textAlign: 'left', fontWeight: 700 };

  const ligneSeance = (s) => {
    const acc = accesSalle(s);
    const lien = s.lien_zoom || s.lien_meet || s.lien_teams;
    return (
      <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '9px 13px', background: COULEURS.gris50, borderRadius: 9, marginBottom: 6, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: COULEURS.navy }}>
            {fmtDateSup(s.date)} <span style={{ fontWeight: 500, color: COULEURS.gris600 }}>
              {hhmm(s.heure_debut)}{s.heure_fin ? ` → ${hhmm(s.heure_fin)}` : ''}
            </span>
          </div>
          {s.objectifs_session && <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 2 }}>{s.objectifs_session}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {acc.close
            ? <span style={{ fontSize: 11, color: COULEURS.gris400 }} title={acc.raison}>🔒 Clôturée</span>
            : acc.presentiel ? <span style={{ fontSize: 11, color: COULEURS.gris600 }}>🏢 Présentiel</span>
            : !lien ? <span style={{ fontSize: 11, color: '#B45309' }}>⚠️ Lien manquant</span>
            : acc.joignable
              ? <a href={lien} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, fontWeight: 700, color: COULEURS.succes, textDecoration: 'none' }}>
                  {acc.enDirect ? '▶ En direct' : '🔗 Rejoindre'}
                </a>
              : <span style={{ fontSize: 11, color: COULEURS.gris400 }} title={`La salle ouvre ${MINUTES_OUVERTURE_SALLE} min avant`}>🔒 {acc.libelleAttente}</span>}
          <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 99, padding: '2px 9px',
            background: COULEURS.gris100, color: COULEURS.gris600 }}>{s.statut || '—'}</span>
        </div>
      </div>
    );
  };

  return (
    <ModalSup title={`👥 ${classe.nom || 'Classe'}`} subtitle="Vue lecture seule" onClose={onFermer}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: COULEURS.gris100, borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setOnglet(t.id)}
            style={{ padding: '7px 14px', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
              background: onglet === t.id ? COULEURS.blanc : 'transparent',
              color: onglet === t.id ? COULEURS.navy : COULEURS.gris600,
              fontWeight: onglet === t.id ? 700 : 500, fontSize: 12 }}>{t.label}</button>
        ))}
      </div>

      {onglet === 'infos' && (() => {
        const lignes = [
          ['Classe',     classe.nom || '—'],
          ['Niveau',     classe.niveau || '—'],
          ['Modalité',   { presentiel: '🏢 Présentiel', ligne: '🌐 En ligne', en_ligne: '🌐 En ligne', hybride: '⚡ Hybride' }[classe.type_cours] || classe.type_cours || '—'],
          ['Coach',      classe.coach_nom || '—'],
          ['Entreprise', classe.entreprise_nom || '—'],
          ['Début',      classe.date_debut ? fmtDateSup(classe.date_debut) : '—'],
          ['Fin prévue', classe.date_fin ? fmtDateSup(classe.date_fin) : '—'],
          ['Capacité',   classe.capacite_max ? `${apprenants?.length ?? 0} / ${classe.capacite_max}` : `${apprenants?.length ?? 0}`],
          ['Statut',     classe.statut || '—'],
        ];
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, border: `1px solid ${COULEURS.gris200}`, borderRadius: 12, overflow: 'hidden' }}>
            {lignes.map(([l, v], i) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '11px 15px',
                background: i % 2 ? COULEURS.gris50 : COULEURS.blanc, fontSize: 12.5 }}>
                <span style={{ color: COULEURS.gris600 }}>{l}</span>
                <span style={{ fontWeight: 600, color: COULEURS.navy, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {onglet === 'presences' && (
        presences === null ? <div style={{ textAlign: 'center', padding: 30, color: COULEURS.gris400, fontSize: 13 }}>Chargement…</div>
        : presences.length === 0 ? <VideSup icone="📊" titre="Aucune présence relevée"
            detail="Le coach saisit les présences en clôturant une séance. Tant qu'aucune séance n'a été clôturée, il n'y a rien à lire ici." />
        : (() => {
          /* LA PLAGE FILTRE LES SÉANCES RETENUES, ET DONC L'ASSIDUITÉ ELLE-MÊME : le taux se
             recalcule sur la période choisie. C'est tout l'intérêt — « il décroche depuis
             octobre » ne se lit pas sur une moyenne depuis le premier jour.
             La date vient de la séance imbriquée dans chaque présence. */
          const dansLaPlage = (p) => {
            const d = String(p.seance?.date || '');
            if (!d) return true;              // séance sans date : on ne l'écarte pas
            if (duP && d < duP) return false;
            if (auP && d > auP) return false;
            return true;
          };
          const retenues = presences.filter(dansLaPlage);
          const nbSeancesRelevees = new Set(retenues.map(p => p.seance_id).filter(Boolean)).size;
          /* ON AGRÈGE PAR APPRENANT, pas par ligne de présence. Une liste brute de pointages
             ne répond pas à la question qu'on se pose en ouvrant cet onglet : qui suit, et
             qui décroche. Le dénominateur est le nombre de séances RELEVÉES pour la classe —
             pas le nombre de séances programmées, dont beaucoup n'ont pas encore eu lieu. */
          const parInscr = {};
          for (const p of retenues) {
            const k = p.inscription_id;
            (parInscr[k] ||= { present: 0, retard: 0, absent: 0, excuse: 0, total: 0 });
            parInscr[k][p.statut] = (parInscr[k][p.statut] || 0) + 1;
            parInscr[k].total += 1;
          }
          const nomDe = Object.fromEntries((apprenants || []).map(a => [a.id, a.nom_complet || `${a.prenom || ''} ${a.nom || ''}`.trim()]));
          const lignes = Object.entries(parInscr).map(([id, c]) => ({
            id, nom: nomDe[id] || '—', ...c,
            taux: c.total ? Math.round(((c.present + c.retard) / c.total) * 100) : null,
          })).sort((a, b) => (a.taux ?? 101) - (b.taux ?? 101));
          const pageSureP = Math.min(pageP, Math.max(1, Math.ceil(lignes.length / PAR_PAGE_MODAL)));
          const visiblesP = lignes.slice((pageSureP - 1) * PAR_PAGE_MODAL, pageSureP * PAR_PAGE_MODAL);
          const champDate = { padding: '4px 7px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, fontSize: 11.5 };

          return (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: COULEURS.gris600 }}>
                  {nbSeancesRelevees} séance{nbSeancesRelevees > 1 ? 's' : ''} relevée{nbSeancesRelevees > 1 ? 's' : ''}
                  {(duP || auP) ? ' sur la période' : ''}
                </span>
                <span style={{ flex: 1 }} />
                <label style={{ fontSize: 11, color: COULEURS.gris400 }}>Du</label>
                <input type="date" value={duP} onChange={e => { setDuP(e.target.value); setPageP(1); }} style={champDate} />
                <label style={{ fontSize: 11, color: COULEURS.gris400 }}>au</label>
                <input type="date" value={auP} onChange={e => { setAuP(e.target.value); setPageP(1); }} style={champDate} />
                {(duP || auP) && (
                  <button onClick={() => { setDuP(''); setAuP(''); setPageP(1); }}
                    style={{ ...champDate, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer' }}>✕</button>
                )}
              </div>

              {lignes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 34, background: COULEURS.gris50, borderRadius: 12, color: COULEURS.gris400, fontSize: 13 }}>
                  Aucune présence relevée sur cette période.
                </div>
              ) : (
            <div style={{ border: `1px solid ${COULEURS.gris200}`, borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: COULEURS.gris50 }}>
                  <th style={th}>Apprenant</th>
                  <th style={{ ...th, textAlign: 'center' }}>Présent</th>
                  <th style={{ ...th, textAlign: 'center' }}>Retard</th>
                  <th style={{ ...th, textAlign: 'center' }}>Absent</th>
                  <th style={{ ...th, textAlign: 'center' }}>Assiduité</th>
                </tr></thead>
                <tbody>
                  {visiblesP.map(l => {
                    const c = l.taux === null ? COULEURS.gris400 : l.taux >= 80 ? COULEURS.succes : l.taux >= 70 ? COULEURS.attention : COULEURS.erreur;
                    return (
                      <tr key={l.id} style={{ borderBottom: `1px solid ${COULEURS.gris100}` }}>
                        <td style={{ ...td, fontWeight: 600 }}>{l.nom}</td>
                        <td style={{ ...td, textAlign: 'center' }}>{l.present || 0}</td>
                        <td style={{ ...td, textAlign: 'center' }}>{l.retard || 0}</td>
                        <td style={{ ...td, textAlign: 'center' }}>{l.absent || 0}</td>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: c }}>
                          {l.taux === null ? '—' : `${l.taux}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <BarrePages page={pageSureP} total={lignes.length} parPage={PAR_PAGE_MODAL} onChange={setPageP} libelle="apprenant" />
            </div>
              )}
            </>
          );
        })()
      )}

      {onglet === 'fichiers' && (
        fichiers === null ? <div style={{ textAlign: 'center', padding: 30, color: COULEURS.gris400, fontSize: 13 }}>Chargement…</div>
        : fichiers.length === 0 ? <VideSup icone="📁" titre="Aucun document"
            detail="Le coach n'a encore déposé aucun document pour cette classe." />
        : (() => {
          /* LA DATE RETENUE EST CELLE DU DÉPÔT (`created_at`). C'est la seule que porte un
             fichier, et c'est bien la question qu'on se pose : quand le coach a-t-il partagé
             ce document. Un fichier sans date n'est pas écarté — une donnée manquante ne doit
             pas faire disparaître un document qui existe. */
          const retenus = fichiers.filter(f => {
            const d = String(f.created_at || '').slice(0, 10);
            if (!d) return true;
            if (duF && d < duF) return false;
            if (auF && d > auF) return false;
            return true;
          });
          const pageSureF = Math.min(pageF, Math.max(1, Math.ceil(retenus.length / PAR_PAGE_MODAL)));
          const visiblesF = retenus.slice((pageSureF - 1) * PAR_PAGE_MODAL, pageSureF * PAR_PAGE_MODAL);
          const champDateF = { padding: '4px 7px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, fontSize: 11.5 };
          const masques = retenus.filter(f => f.visible === false).length;

          return (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: COULEURS.gris600 }}>
                {retenus.length} document{retenus.length > 1 ? 's' : ''}{(duF || auF) ? ' sur la période' : ''}
                {/* Le nombre de masqués se dit ici : c'est l'écart entre ce que le coach a
                    déposé et ce que l'apprenant reçoit réellement. */}
                {masques > 0 && <span style={{ color: '#B45309', fontWeight: 600 }}> · {masques} masqué{masques > 1 ? 's' : ''}</span>}
              </span>
              <span style={{ flex: 1 }} />
              <label style={{ fontSize: 11, color: COULEURS.gris400 }}>Du</label>
              <input type="date" value={duF} onChange={e => { setDuF(e.target.value); setPageF(1); }} style={champDateF} />
              <label style={{ fontSize: 11, color: COULEURS.gris400 }}>au</label>
              <input type="date" value={auF} onChange={e => { setAuF(e.target.value); setPageF(1); }} style={champDateF} />
              {(duF || auF) && (
                <button onClick={() => { setDuF(''); setAuF(''); setPageF(1); }}
                  style={{ ...champDateF, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer' }}>✕</button>
              )}
            </div>

            {retenus.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 34, background: COULEURS.gris50, borderRadius: 12, color: COULEURS.gris400, fontSize: 13 }}>
                Aucun document déposé sur cette période.
              </div>
            ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {visiblesF.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '10px 14px', background: COULEURS.gris50, borderRadius: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: COULEURS.navy, wordBreak: 'break-all' }}>{f.nom || 'Fichier'}</div>
                  <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 2 }}>
                    {f.categorie || 'autre'}{f.taille_ko ? ` · ${f.taille_ko} Ko` : ''}{f.created_at ? ` · ${fmtDateSup(f.created_at)}` : ''}
                    {/* Un document masqué est listé au superviseur — il doit voir ce qui
                        existe — mais signalé : l'apprenant, lui, ne l'a pas. */}
                    {f.visible === false && <span style={{ color: '#B45309', fontWeight: 700 }}> · masqué aux apprenants</span>}
                  </div>
                </div>
                {f.url && (
                  <a href={urlOuvrir(f.url, f.nom)} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11.5, fontWeight: 700, color: SUP_COLOR, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    ↗ Ouvrir
                  </a>
                )}
              </div>
            ))}
          </div>
            )}
            <BarrePages page={pageSureF} total={retenus.length} parPage={PAR_PAGE_MODAL} onChange={setPageF} libelle="document" />
          </>
          );
        })()
      )}

      {onglet === 'apprenants' && (
        apprenants === null ? <div style={{ textAlign: 'center', padding: 30, color: COULEURS.gris400, fontSize: 13 }}>Chargement…</div>
        : apprenants.length === 0 ? <VideSup icone="🎓" titre="Aucun apprenant" detail="Aucun apprenant n'est encore inscrit dans cette classe." />
        : (
          <div style={{ border: `1px solid ${COULEURS.gris200}`, borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: COULEURS.gris50 }}>
                <th style={th}>Apprenant</th><th style={th}>E-mail</th><th style={{ ...th, textAlign: 'center' }}>Niveau</th><th style={{ ...th, textAlign: 'center' }}>Statut</th>
              </tr></thead>
              <tbody>
                {apprenants.map(a => (
                  <tr key={a.id} style={{ borderBottom: `1px solid ${COULEURS.gris100}` }}>
                    <td style={{ ...td, fontWeight: 600 }}>{a.nom_complet || `${a.prenom || ''} ${a.nom || ''}`.trim() || '—'}</td>
                    <td style={{ ...td, color: COULEURS.gris600 }}>{a.email || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{a.niveau_cecr || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 99, padding: '2px 9px',
                        background: a.statut === 'actif' ? '#D1FAE5' : COULEURS.gris100,
                        color: a.statut === 'actif' ? '#065F46' : COULEURS.gris600 }}>{a.statut || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {onglet === 'sessions' && (
        <>
          <div style={{ fontSize: 13, fontWeight: 800, color: COULEURS.navy, marginBottom: 9 }}>🗓️ Emploi du temps hebdomadaire</div>
          {creneaux.length === 0 ? (
            <div style={{ fontSize: 12, color: COULEURS.gris400, marginBottom: 18 }}>Aucun créneau hebdomadaire renseigné pour cette classe.</div>
          ) : (
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginBottom: 18 }}>
              {creneaux.map((c, i) => (
                <div key={i} style={{ background: `${SUP_COLOR}10`, border: `1px solid ${SUP_COLOR}30`, borderRadius: 10, padding: '10px 14px', minWidth: 130 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: SUP_COLOR }}>{c.jour || 'Jour non précisé'}</div>
                  {/* `classes_elearning.horaire` porte `{ jour, debut, fin }`. Lire
                      `heure_debut`/`heure_fin` — les noms employés sur les séances —
                      affichait « ? – ? » sur des créneaux pourtant renseignés. */}
                  <div style={{ fontSize: 12, color: COULEURS.gris600, marginTop: 3 }}>
                    {hhmm(c.debut || c.heure_debut) || '?'} – {hhmm(c.fin || c.heure_fin) || '?'}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: COULEURS.navy }}>📋 Séances{seances?.length ? ` (${seances.length})` : ''}</div>
            <span style={{ flex: 1 }} />
            <label style={{ fontSize: 11, color: COULEURS.gris400 }}>Du</label>
            <input type="date" value={du} onChange={e => { setDu(e.target.value); setPageAV(1); setPagePA(1); }}
              style={{ padding: '4px 7px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, fontSize: 11.5 }} />
            <label style={{ fontSize: 11, color: COULEURS.gris400 }}>au</label>
            <input type="date" value={au} onChange={e => { setAu(e.target.value); setPageAV(1); setPagePA(1); }}
              style={{ padding: '4px 7px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, fontSize: 11.5 }} />
            {(du || au) && <button onClick={() => { setDu(''); setAu(''); setPageAV(1); setPagePA(1); }}
              style={{ padding: '4px 9px', borderRadius: 7, border: `1px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, fontSize: 11, cursor: 'pointer' }}>✕</button>}
          </div>

          {seances === null ? <div style={{ textAlign: 'center', padding: 24, color: COULEURS.gris400, fontSize: 13 }}>Chargement…</div>
          : seancesFiltrees.length === 0 ? <VideSup icone="📅" titre="Aucune séance" detail="Aucune séance ne correspond à cette période." />
          : (
            <>
              {aVenir.length > 0 && (
                <>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '.05em', margin: '6px 0 7px' }}>À venir ({aVenir.length})</div>
                  {page(aVenir, pageSureAV).map(ligneSeance)}
                  <BarrePages page={pageSureAV} total={aVenir.length} parPage={PAR_PAGE_MODAL} onChange={setPageAV} libelle="séance à venir" />
                </>
              )}
              {passees.length > 0 && (
                <>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '.05em', margin: '14px 0 7px' }}>Passées ({passees.length})</div>
                  {page(passees, pageSurePA).map(ligneSeance)}
                  <BarrePages page={pageSurePA} total={passees.length} parPage={PAR_PAGE_MODAL} onChange={setPagePA} libelle="séance passée" />
                </>
              )}
            </>
          )}
        </>
      )}
    </ModalSup>
  );
}

/**
 * PLANNINGS — les séances e-learning à venir et passées.
 *
 * LE TRI MET LES SÉANCES À VENIR EN TÊTE, du plus proche au plus lointain, puis les passées de
 * la plus récente à la plus ancienne. Un tri par date brute enterrerait la prochaine séance
 * sous des mois d'historique — or c'est elle que le superviseur cherche quand il ouvre cet
 * écran.
 */
/* Utilise par le Superviseur, le Deputy ET l'Onboarding : les trois regardent le meme
   planning e-learning, il n'y avait aucune raison d'en ecrire trois versions. D'ou le nom
   neutre - il ne designe plus un role mais une source de donnees. */
/** « 20:00:00 » → « 20:00 ». Les secondes d'un horaire de cours n'apprennent rien. */
const hhmm = (h) => (h ? String(h).slice(0, 5) : '');

export function OngletPlanningsElearning() {
  const [seances, setSeances] = useState(null);
  const [filtre, setFiltre] = useState('avenir');
  const [page, setPage] = useState(1);
  /* LE DÉTAIL D'UNE SÉANCE. Le tableau donnait la date, l'horaire prévu et un lien : rien
     ne permettait de savoir si le cours avait réellement été donné, combien de temps il
     avait duré, ni qui était présent. C'est pourtant la question du superviseur et du PA,
     et dash y répond déjà par ce panneau — mêmes données, mêmes colonnes
     (`demarree_at`, `terminee_at`, `duree_reelle_s`). */
  const [detail, setDetail] = useState(null);
  const [presences, setPresences] = useState(null);   // null = en cours de chargement

  useEffect(() => {
    if (!detail?.id) { setPresences(null); return; }
    let vivant = true;
    setPresences(null);
    fetch(`${_API_URL_ADMIN}/api/elearning/seances/${detail.id}/presences`, { headers: supAuthHdrs() })
      .then(r => (r.ok ? r.json() : { presences: [] }))
      .then(d => { if (vivant) setPresences(d.presences || []); })
      .catch(() => { if (vivant) setPresences([]); });
    return () => { vivant = false; };
  }, [detail?.id]);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        /* ── LES NOMS DE CLASSE ET DE COACH SONT RÉSOLUS ICI ──
           `seances_elearning` ne porte que `classe_id` et `coach_id` : le tableau lisait
           `classe_nom` et `coach_nom`, absents de cette réponse, et affichait donc « — »
           dans les deux colonnes. On charge les deux référentiels en parallèle — ils sont
           courts et déjà servis ailleurs — et on recolle les noms. */
        const [rs, rc, rk] = await Promise.all([
          fetch(`${_API_URL_ADMIN}/api/elearning/seances`, { headers: supAuthHdrs() }),
          fetch(`${_API_URL_ADMIN}/api/classes-elearning`, { headers: supAuthHdrs() }),
          fetch(`${_API_URL_ADMIN}/api/classes-elearning/coaches-elearning`, { headers: supAuthHdrs() }),
        ]);
        const d  = await rs.json().catch(() => ({}));
        const dc = await rc.json().catch(() => ({}));
        const dk = await rk.json().catch(() => ({}));
        const l = Array.isArray(d.seances) ? d.seances : Array.isArray(d) ? d : [];
        const nomClasse = Object.fromEntries((dc.classes || []).map(c => [c.id, c.nom]));
        const nomCoach  = Object.fromEntries((dk.coaches || []).map(c =>
          [c.id, `${c.prenom || ''} ${c.nom || ''}`.trim() || c.email]));
        if (vivant) setSeances(l.map(x => ({
          ...x,
          classe_nom: x.classe_nom || nomClasse[x.classe_id] || null,
          // `coach_nom` peut déjà être posé sur la séance (coach figé à la planification).
          coach_nom:  x.coach_nom  || nomCoach[x.coach_id]  || null,
        })));
      } catch { if (vivant) setSeances([]); }
    })();
    return () => { vivant = false; };
  }, []);

  const toutes = seances || [];
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const estAVenir = (s) => (s.date || '') >= aujourdhui;

  const filtrees = toutes.filter(s =>
    filtre === 'toutes' ? true : filtre === 'avenir' ? estAVenir(s) : !estAVenir(s));

  const triees = [...filtrees].sort((a, b) => {
    const aA = estAVenir(a), aB = estAVenir(b);
    if (aA !== aB) return aA ? -1 : 1;
    const cmp = String(a.date || '').localeCompare(String(b.date || ''));
    return aA ? cmp : -cmp;
  });

  const nbPages = Math.max(1, Math.ceil(triees.length / OBS_PAR_PAGE));
  const sure = Math.min(page, nbPages);
  const visibles = triees.slice((sure - 1) * OBS_PAR_PAGE, sure * OBS_PAR_PAGE);

  const puce = (actif) => ({
    padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 700,
    fontFamily: '"Plus Jakarta Sans",sans-serif',
    border: `1.5px solid ${actif ? SUP_COLOR : COULEURS.gris200}`,
    background: actif ? SUP_COLOR : COULEURS.blanc, color: actif ? '#fff' : COULEURS.gris600,
  });

  const th = { padding: '9px 12px', fontSize: 11, color: COULEURS.gris600, textTransform: 'uppercase', textAlign: 'left', fontWeight: 700 };
  const td = { padding: '11px 12px', color: COULEURS.gris900, fontSize: 13 };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: COULEURS.navy }}>📅 Plannings</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: COULEURS.gris400 }}>
          Séances BET E-Learning — les prochaines d'abord
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[{ v: 'avenir', l: 'À venir' }, { v: 'passees', l: 'Passées' }, { v: 'toutes', l: 'Toutes' }].map(f => (
          <button key={f.v} onClick={() => { setFiltre(f.v); setPage(1); }} style={puce(filtre === f.v)}>
            {f.l} · {toutes.filter(s => f.v === 'toutes' ? true : f.v === 'avenir' ? estAVenir(s) : !estAVenir(s)).length}
          </button>
        ))}
      </div>

      {seances === null ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : triees.length === 0 ? (
        toutes.length === 0
          ? <VidePlateforme icone="📅" titre="Aucune séance e-learning"
              quoi="Aucune séance n'a encore été planifiée sur BET E-Learning." />
          : <div style={{ textAlign: 'center', padding: 40, background: COULEURS.gris50, borderRadius: 12, color: COULEURS.gris400, fontSize: 13 }}>
              Aucune séance {filtre === 'avenir' ? 'à venir' : 'passée'}.
            </div>
      ) : (
        <div style={{ border: `1px solid ${COULEURS.gris200}`, borderRadius: 12, overflow: 'hidden', background: COULEURS.blanc }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
              <thead>
                <tr style={{ background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris200}` }}>
                  <th style={th}>Date</th><th style={th}>Horaire</th><th style={th}>Classe</th>
                  <th style={th}>Coach</th><th style={th}>Lien</th><th style={th}>État</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(s => {
                  const avenir = estAVenir(s);
                  return (
                    <tr key={s.id} onClick={() => setDetail(s)}
                      title="Voir le déroulé réel et la liste de présence"
                      style={{ borderBottom: `1px solid ${COULEURS.gris100}`, cursor: 'pointer' }}
                      onMouseEnter={e => { e.currentTarget.style.background = COULEURS.gris50; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                      <td style={{ ...td, fontWeight: 700, color: avenir ? SUP_COLOR : COULEURS.gris600 }}>
                        {fmtDateSup(s.date)}
                      </td>
                      {/* `heure_debut` et non `heure` : le champ n'existe pas sous ce nom
                          dans `seances_elearning`, la colonne affichait « — → 22:00:00 ».
                          Les secondes sont coupées : « 20:00 → 22:00 » se lit. */}
                      <td style={td}>
                        {hhmm(s.heure_debut) || '—'}{s.heure_fin ? ` → ${hhmm(s.heure_fin)}` : ''}
                      </td>
                      <td style={td}>{s.classe_nom || s.groupe_nom || '—'}</td>
                      <td style={td}>{s.coach_nom || '—'}</td>
                      {/* LE LIEN, verrouillé jusqu'à H-10 : avant, la salle est vide et
                          celui qui l'ouvre pour « vérifier » croit à une panne. */}
                      <td style={td}>
                        {(() => {
                          const acc = accesSalle(s);
                          /* UNE SÉANCE CLÔTURÉE N'EST PLUS JOIGNABLE. « 🔗 Rejoindre »
                             survivait à la clôture du coach : la règle ne regardait que
                             l'heure, jamais le statut. Or c'est exactement ce que le
                             superviseur et le PA viennent vérifier ici — qu'un cours a bien
                             été donné —, et un lien actif leur disait le contraire. */
                          if (acc.close) return <span style={{ color: COULEURS.gris400, fontWeight: 600 }} title={acc.raison}>
                            {s.statut === 'annulee' ? '🚫 Annulée' : '✅ Clôturée'}
                          </span>;
                          /* UNE SÉANCE EN PRÉSENTIEL N'A PAS DE SALLE À OUVRIR. Elle
                             affichait « — », exactement comme une séance en ligne dont le
                             lien manque : on lisait un oubli du coach là où il n'y en a
                             pas. On nomme la raison. */
                          if (acc.presentiel) return <span style={{ color: COULEURS.gris600, fontWeight: 600 }}>🏢 Présentiel</span>;
                          const lien = s.lien_zoom || s.lien_meet || s.lien_teams;
                          if (!lien) return <span style={{ color: '#B45309', fontWeight: 600 }} title="Séance en ligne sans lien de visio">⚠️ Lien manquant</span>;
                          return acc.joignable
                            ? <a href={lien} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                                style={{ color: acc.enDirect ? '#B91C1C' : '#0891B2', fontWeight: acc.enDirect ? 800 : 700, textDecoration: 'none' }}>
                                {acc.enDirect ? '▶ En direct' : '🔗 Rejoindre'}
                              </a>
                            : <span style={{ color: COULEURS.gris400, fontWeight: 600 }} title={`La salle s'ouvre ${MINUTES_OUVERTURE_SALLE} min avant le cours`}>🔒 {acc.libelleAttente}</span>;
                        })()}
                      </td>
                      <td style={td}>
                        <span style={{ background: avenir ? '#e0f2fe' : COULEURS.gris100,
                          color: avenir ? '#0369a1' : COULEURS.gris600, borderRadius: 20,
                          padding: '3px 10px', fontSize: 10.5, fontWeight: 700 }}>
                          {s.statut || (avenir ? 'à venir' : 'passée')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <BarrePages page={page} total={triees.length} parPage={OBS_PAR_PAGE} onChange={setPage} libelle="séance" />
        </div>
      )}

      {detail && <ModalSeanceElearning seance={detail} presences={presences} onFermer={() => setDetail(null)} />}
    </div>
  );
}

/**
 * Le détail d'une séance e-learning : ce qui était prévu, ce qui s'est réellement passé, et
 * qui était là.
 *
 * POURQUOI CE PANNEAU. Le superviseur et le PA ouvrent les plannings pour une seule raison
 * — s'assurer qu'un cours a bien été donné. Le tableau ne leur disait que l'horaire PRÉVU :
 * une séance de deux heures expédiée en vingt minutes y était indiscernable d'une séance
 * tenue en entier, et une séance clôturée sans aucun présent y ressemblait à toutes les
 * autres. Dash répond déjà à cette question par le même panneau ; les colonnes de
 * `seances_elearning` portent les mêmes horodatages, `DerouleReel` fonctionne donc tel quel.
 */
function ModalSeanceElearning({ seance, presences, onFermer }) {
  const acc = accesSalle(seance);
  const lien = seance.lien_zoom || seance.lien_meet || seance.lien_teams;
  const dureePrevue = seance.duree_minutes
    || (seance.heure_debut && seance.heure_fin
        ? Math.max(0, Math.round((new Date(`1970-01-01T${hhmm(seance.heure_fin)}:00`) - new Date(`1970-01-01T${hhmm(seance.heure_debut)}:00`)) / 60000))
        : null);

  const P_STATUT = {
    present: { c: '#15803D', bg: '#DCFCE7', l: 'Présent' },
    absent:  { c: '#B91C1C', bg: '#FEE2E2', l: 'Absent'  },
    retard:  { c: '#B45309', bg: '#FEF9C3', l: 'Retard'  },
    excuse:  { c: '#4F46E5', bg: '#E0E7FF', l: 'Excusé'  },
  };
  const nbPresents = (presences || []).filter(p => ['present', 'retard'].includes(p.statut)).length;
  const lignes = [
    ['Classe', seance.classe_nom || '—'],
    ['Coach',  seance.coach_nom  || '—'],
    ['Date',   fmtDateSup(seance.date)],
    ['Horaire prévu', `${hhmm(seance.heure_debut) || '—'}${seance.heure_fin ? ` → ${hhmm(seance.heure_fin)}` : ''}${dureePrevue ? ` (${dureePrevue} min)` : ''}`],
    ['Modalité', acc.presentiel ? '🏢 Présentiel' : '📡 En ligne'],
    ['État', seance.statut || '—'],
  ];

  return (
    <>
      <div onClick={onFermer} style={{ position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.6)', zIndex: 1200, backdropFilter: 'blur(3px)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(92vw,560px)', background: COULEURS.blanc, zIndex: 1201,
        display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.2)', fontFamily: '"Plus Jakarta Sans",sans-serif' }}>

        <div style={{ background: SUP_COLOR, padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Séance e-learning</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginTop: 4 }}>
              {seance.objectifs_session || seance.classe_nom || 'Séance'}
            </div>
          </div>
          <button onClick={onFermer} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8,
            width: 30, height: 30, color: '#fff', fontSize: 15, cursor: 'pointer', flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {lignes.map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5 }}>
                <span style={{ color: COULEURS.gris400 }}>{l}</span>
                <span style={{ fontWeight: 600, color: COULEURS.gris900, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Ce qui s'est réellement passé — le composant se tait de lui-même si la séance
              n'a pas encore eu lieu. */}
          <DerouleReel seance={seance} style={{ marginTop: 16 }} />

          {seance.compte_rendu && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Compte rendu du coach</div>
              <div style={{ background: COULEURS.gris50, borderRadius: 10, padding: '11px 14px', fontSize: 12.5, color: COULEURS.gris900, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{seance.compte_rendu}</div>
            </div>
          )}

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${COULEURS.gris100}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 10 }}>
              👥 Liste de présence
              {presences !== null && presences.length > 0 && (
                <span style={{ fontWeight: 600, color: COULEURS.gris400, fontSize: 12 }}> — {nbPresents}/{presences.length} présent{nbPresents > 1 ? 's' : ''}</span>
              )}
            </div>
            {presences === null ? (
              <div style={{ fontSize: 12, color: COULEURS.gris400 }}>Chargement…</div>
            ) : presences.length === 0 ? (
              /* On distingue « pas encore saisie » de « séance pas encore tenue » : la
                 première est une relance à faire au coach, la seconde est normale. */
              <div style={{ fontSize: 12, color: COULEURS.gris400, lineHeight: 1.6 }}>
                {acc.close
                  ? "Présences non saisies pour cette séance clôturée — à relancer auprès du coach."
                  : "Présences pas encore enregistrées : le coach les saisit en clôturant la séance."}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {presences.map(p => {
                  const ps = P_STATUT[p.statut] || { c: COULEURS.gris600, bg: COULEURS.gris100, l: p.statut || '—' };
                  const insc = p.classes_elearning_apprenants || {};
                  return (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                      padding: '7px 11px', background: COULEURS.gris50, borderRadius: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: COULEURS.gris900 }}>{insc.nom_complet || insc.email || '—'}</div>
                        {p.duree_connexion_min != null && (
                          <div style={{ fontSize: 10.5, color: COULEURS.gris400 }}>⏱ {p.duree_connexion_min} min en salle</div>
                        )}
                      </div>
                      <span style={{ background: ps.bg, color: ps.c, borderRadius: 99, padding: '2px 9px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>{ps.l}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Le bouton suit la règle commune, clôture comprise. */}
          {acc.close ? (
            <div style={{ marginTop: 18, padding: 10, borderRadius: 9, background: COULEURS.gris100, color: COULEURS.gris400,
              fontWeight: 700, fontSize: 12.5, textAlign: 'center' }}>🔒 {acc.raison}</div>
          ) : acc.presentiel ? null : !lien ? (
            <div style={{ marginTop: 18, padding: 10, borderRadius: 9, background: '#FEF3C7', color: '#92400E',
              fontWeight: 700, fontSize: 12.5, textAlign: 'center' }}>⚠️ Séance en ligne sans lien de visio</div>
          ) : acc.joignable ? (
            <a href={lien} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 18, padding: 10, borderRadius: 9,
              background: acc.enDirect ? '#B91C1C' : COULEURS.succes, color: '#fff', fontWeight: 800, fontSize: 13, textAlign: 'center', textDecoration: 'none' }}>
              {acc.enDirect ? '▶ Rejoindre maintenant' : '🔗 Rejoindre la séance'}
            </a>
          ) : (
            <div style={{ marginTop: 18, padding: 10, borderRadius: 9, background: COULEURS.gris100, color: COULEURS.gris400,
              fontWeight: 700, fontSize: 12.5, textAlign: 'center' }}>
              🔒 {acc.libelleAttente}
              <div style={{ fontWeight: 600, fontSize: 11, marginTop: 3 }}>La salle ouvre {MINUTES_OUVERTURE_SALLE} min avant le début du cours.</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
