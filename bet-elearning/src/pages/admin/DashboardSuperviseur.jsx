// DashboardSuperviseur.jsx - Module Superviseur Général extrait de DashboardAdmin.jsx (profil admin_superviseur)
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { usePrompt } from '../../contexts/ConfirmContext';
import { COULEURS } from '../../constants/couleurs';
import PastilleGroupe from '../../components/shared/PastilleGroupe';
import BadgeCategorieCoach, { FlecheTendance } from '../../components/shared/BadgeCategorieCoach';
import { CATEGORIES_COACH, CATEGORIE_SANS_NOTE, categorieCoach, NOTE_COULEUR } from '../../utils/categorieCoach';

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
  const [onglet, setOnglet] = useState(ongletInitial);
  const [chargement, setChargement] = useState(false);

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
  const tSeances = useTableauCoach(seances,      'date_seance');
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
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    };
    (async () => {
      setChargement(true);
      try {
        if (onglet === 'observations') {
          // La route ne filtre pas par coach : on trie ici, le volume est celui d'une
          // plateforme et non d'un annuaire.
          const d = await lire('/api/superviseur/rapports-deputy');
          if (vivant) setObservations((d.rapports || []).filter(r => String(r.coach_id) === String(coach.id)));
        } else if (onglet === 'classes' || onglet === 'archive') {
          const d = await lire(`/api/classes-elearning?coach_id=${coach.id}`);
          if (vivant) setClasses(d.classes || []);
        } else if (onglet === 'seances') {
          const d = await lire(`/api/classes-elearning/seances?coach_id=${coach.id}`);
          if (vivant) setSeances(d.seances || []);
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
      } catch { /* l'onglet affichera son état vide plutôt qu'une erreur brute */ }
      finally { if (vivant) setChargement(false); }
    })();
    return () => { vivant = false; };
  }, [onglet, coach?.id, dispoMois, dispoAnnee]);

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
      {!chargement && onglet === 'observations' && (
        observations.length === 0
          ? <VideSup icone="📋" titre="Aucun rapport d'observation"
              detail="Les rapports déposés par les Deputy Superviseurs sur ce coach apparaîtront ici." />
          : <>
            <FiltreDates t={tObs} libelle="Date d'observation" />
            <TableauSup colonnes={['Date', 'Deputy', 'Classe', 'Note', 'Statut']} lignes={tObs.visibles}
              rendu={r => {
                const st = SUP_STATUT_RAPPORT[r.statut] || SUP_STATUT_RAPPORT.soumis;
                return (
                  <tr key={r.id} style={{ borderTop: `1px solid ${COULEURS.gris100}` }}>
                    <td style={cell}>{fmtDateSup(r.date_observation)}</td>
                    <td style={cell}>{r.deputy_nom || r.observateur_nom || '-'}</td>
                    <td style={cell}>{r.classe || r.groupe_nom || '-'}</td>
                    <td style={{ ...cell, fontWeight: 700, color: r.note_globale && Number(r.note_globale) < 3 ? '#DC2626' : COULEURS.navy }}>
                      {r.note_globale ? `${r.note_globale}/5` : '-'}
                    </td>
                    <td style={cell}><span style={{ background: st.bg, color: st.txt, padding: '2px 9px', borderRadius: 10, fontSize: 10.5, fontWeight: 700 }}>{st.lib}</span></td>
                  </tr>
                );
              }} />
            <PaginationCoach t={tObs} />
          </>
      )}

      {/* ── CLASSES ── */}
      {!chargement && onglet === 'classes' && (
        classes.length === 0
          ? <VideSup icone="🏫" titre="Aucune classe e-learning"
              detail="Ce coach n'est titulaire d'aucune classe sur cette plateforme. Ses éventuelles classes présentiel relèvent de dash et ne sont pas listées ici." />
          : <>
            <FiltreDates t={tClasses} libelle="Date de début" />
            <TableauSup colonnes={['Classe', 'Niveau', 'Entreprise', 'Début', 'Statut']} lignes={tClasses.visibles}
              rendu={cl => (
                <tr key={cl.id} style={{ borderTop: `1px solid ${COULEURS.gris100}` }}>
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
      {!chargement && onglet === 'seances' && (
        seances.length === 0
          ? <VideSup icone="📆" titre="Aucune séance"
              detail="Les séances e-learning de ce coach s'afficheront ici dès qu'une classe lui sera assignée." />
          : <>
            <FiltreDates t={tSeances} libelle="Date de séance" />
            <TableauSup colonnes={['Date', 'Classe', 'Horaire', 'Statut']} lignes={tSeances.visibles}
              rendu={s => (
                <tr key={s.id} style={{ borderTop: `1px solid ${COULEURS.gris100}` }}>
                  <td style={cell}>{fmtDateSup(s.date_seance || s.date)}</td>
                  <td style={cell}>{s.classe_nom || s.classe || '-'}</td>
                  <td style={cell}>{s.heure_debut ? `${s.heure_debut} - ${s.heure_fin || ''}` : '-'}</td>
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
      {!chargement && onglet === 'disponibilite' && (
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
            : <TableauSup colonnes={['Jour', 'Créneau', 'Horaire']} lignes={dispos}
                rendu={(d, i) => (
                  <tr key={d.id || i} style={{ borderTop: `1px solid ${COULEURS.gris100}` }}>
                    <td style={cell}>{d.jour || '-'}</td>
                    <td style={cell}>{d.creneau || '-'}</td>
                    <td style={cell}>{d.debut ? `${String(d.debut).slice(0, 5)} – ${String(d.fin || '').slice(0, 5)}` : '-'}</td>
                  </tr>
                )} />}
        </>
      )}

      {/* ── MODULES E-LEARNING ── */}
      {!chargement && onglet === 'modules' && (
        modules.length === 0
          ? <VideSup icone="🧩" titre="Aucun module e-learning"
              detail={"Seuls les modules rattachés à une classe de cette plateforme sont listés. "
                + "Les modules que ce coach a rédigés pour ses classes présentiel relèvent de dash "
                + "et n'apparaissent pas ici."} />
          : <>
            <FiltreDates t={tModules} libelle="Date de création" />
            <TableauSup colonnes={['Module', 'Statut', 'Blocs', 'Classes', 'Créé le']} lignes={tModules.visibles}
              rendu={m => (
                <tr key={m.id} style={{ borderTop: `1px solid ${COULEURS.gris100}` }}>
                  <td style={{ ...cell, fontWeight: 700, color: COULEURS.navy }}>{m.titre || m.nom || '-'}</td>
                  <td style={cell}>{m.statut || '-'}</td>
                  <td style={cell}>{m.nb_blocs ?? (Array.isArray(m.blocs) ? m.blocs.length : '-')}</td>
                  <td style={cell}>{m.classes?.length ? m.classes.join(', ') : '-'}</td>
                  <td style={cell}>{fmtDateSup(m.created_at)}</td>
                </tr>
              )} />
            <PaginationCoach t={tModules} />
          </>
      )}

      {/* ── RESSOURCES PARTAGÉES ── */}
      {!chargement && onglet === 'ressources' && (
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
                      <a href={r.url} target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: SUP_COLOR, textDecoration: 'none' }}>{r.nom}</a>
                      {r.masque && <span style={{ marginLeft: 7, fontSize: 10, color: '#92400E', background: '#FEF3C7', padding: '1px 7px', borderRadius: 9, fontWeight: 700 }}>non publié</span>}
                    </td>
                    <td style={cell}>{NATURE_ICONE[r.nature] || '📎'} {r.nature}</td>
                    <td style={cell}>{r.contexte?.module_titre || '-'}</td>
                    <td style={cell}>{r.classes?.length ? r.classes.join(', ') : '-'}</td>
                    <td style={cell}>{fmtDateSup(r.created_at)}</td>
                  </tr>
                )} />
              <PaginationCoach t={tRess} />
            </>}
        </>
      )}

      {/* ── ARCHIVE ── */}
      {!chargement && onglet === 'archive' && (
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
    </ModalSup>
  );
}

// ─────────────────────────── 1. CAHIERS COACHS ───────────────────────────
export function OngletCahiersCoachs() {
  const [coachs,   setCoachs]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [recherche, setRecherche] = useState('');
  const [filtreConformite, setFiltreConformite] = useState('tous');
  // Le coach dont on regarde le dossier. `null` = aucun modal ouvert.
  const [coachDetail, setCoachDetail] = useState(null);
  // Filtre par catégorie de contrat, déduite de la note. '' = toutes.
  const [categorie, setCategorie] = useState('');

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
              {filtres.map(c => {
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
                    <td style={{ padding: '10px 14px', fontWeight: 800, color: c.note_moyenne ? NOTE_COULEUR(c.note_moyenne) : COULEURS.gris400 }}>
                      {c.note_moyenne ? `${c.note_moyenne}/5` : '-'}
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

      {coachDetail && (
        <ModalCoachDetail coach={coachDetail} onFermer={() => setCoachDetail(null)} />
      )}
    </div>
  );
}

// ─────────────────────────── 2. RAPPORTS DEPUTY ───────────────────────────
const RAPPORT_INIT_SUP = {
  coach_id: '', date_observation: '', centre: '', classe: '',
  ponctualite: 0, preparation: 0, pedagogie: 0, gestion_classe: 0, professionnalisme: 0,
  observations: '', recommandations: '',
};

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

  async function majStatut(id, statut) {
    if (rapportsEnCours.has(id)) return;
    setRapportsEnCours(prev => new Set(prev).add(id));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/superviseur/rapports-deputy/${id}`, {
        method: 'PATCH', headers: supAuthHdrs(),
        body: JSON.stringify({ statut, commentaire_superviseur: commentaires[id] || undefined }),
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

  async function soumettreRapport() {
    if (!form.coach_id || !form.date_observation || saving) return;
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

  const filtres = rapports.filter(r => filtreStatut === 'tous' || r.statut === filtreStatut)
    .sort((a, b) => (b.date_observation || '').localeCompare(a.date_observation || ''));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COULEURS.navy }}>📋 Rapports Deputy</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: COULEURS.gris400 }}>Rapports d'observation soumis par les Deputy Superviseurs et par vous-même</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowForm(true)} style={{ padding: '9px 18px', background: SUP_COLOR, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Nouveau rapport</button>
          <button onClick={fetchRapports} style={{ padding: '7px 14px', background: SUP_COLOR + '15', border: `1px solid ${SUP_COLOR}40`, borderRadius: 8, fontSize: 12, color: SUP_COLOR, fontWeight: 600, cursor: 'pointer' }}>↻ Actualiser</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {['tous', 'soumis', 'lu', 'transmis_pa'].map(v => (
          <button key={v} onClick={() => setFiltreStatut(v)}
            style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1.5px solid ${filtreStatut === v ? SUP_COLOR : COULEURS.gris200}`, background: filtreStatut === v ? SUP_COLOR + '15' : '#fff', color: filtreStatut === v ? SUP_COLOR : COULEURS.gris600, cursor: 'pointer' }}>
            {v === 'tous' ? 'Tous' : SUP_STATUT_RAPPORT[v]?.lib}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : filtres.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 50, background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}`, color: COULEURS.gris400 }}>Aucun rapport.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtres.map(r => {
            const st = SUP_STATUT_RAPPORT[r.statut] || SUP_STATUT_RAPPORT.soumis;
            const moy = [r.ponctualite, r.preparation, r.pedagogie, r.gestion_classe, r.professionnalisme, r.respect_programme].filter(Boolean);
            const moyVal = moy.length ? (moy.reduce((a, b) => a + b, 0) / moy.length).toFixed(1) : null;
            return (
              <div key={r.id} style={{ background: '#fff', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 14, padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy }}>
                      Coach : {r.coach?.prenom} {r.coach?.nom} <span style={{ fontWeight: 400, color: COULEURS.gris400 }}>· par {r.deputy?.prenom} {r.deputy?.nom}</span>
                    </div>
                    <div style={{ fontSize: 12, color: COULEURS.gris400, marginTop: 2 }}>
                      📅 {fmtDateSup(r.date_observation)}{r.centre && <> · 📍 {r.centre}</>}{r.classe && <> · 🏫 {r.classe}</>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {moyVal && <span style={{ background: '#FEF3C7', color: '#92400E', padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>⭐ {moyVal}/5</span>}
                    <span style={{ background: st.bg, color: st.txt, padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{st.lib}</span>
                  </div>
                </div>
                {(r.observations || r.recommandations) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    {r.observations && <div style={{ background: '#F0F9FF', borderRadius: 8, padding: '8px 12px', border: '1px solid #BAE6FD', fontSize: 12, color: '#0C4A6E' }}><strong>👁 Observations</strong><p style={{ margin: '4px 0 0' }}>{r.observations}</p></div>}
                    {r.recommandations && <div style={{ background: '#F0FDF4', borderRadius: 8, padding: '8px 12px', border: '1px solid #BBF7D0', fontSize: 12, color: '#14532D' }}><strong>💡 Recommandations</strong><p style={{ margin: '4px 0 0' }}>{r.recommandations}</p></div>}
                  </div>
                )}
                {r.statut !== 'transmis_pa' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', paddingTop: 10, borderTop: `1px solid ${COULEURS.gris100}` }}>
                    <input placeholder="Commentaire (optionnel)…" defaultValue={r.commentaire_superviseur || ''}
                      onChange={e => setCommentaires(prev => ({ ...prev, [r.id]: e.target.value }))}
                      style={{ flex: 1, minWidth: 160, padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 12 }} />
                    {r.statut === 'soumis' && (
                      <button onClick={() => majStatut(r.id, 'lu')} style={{ padding: '6px 14px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 12, color: '#D97706', fontWeight: 600, cursor: 'pointer' }}>👁 Marquer lu</button>
                    )}
                    <button onClick={() => majStatut(r.id, 'transmis_pa')} style={{ padding: '6px 14px', background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 8, fontSize: 12, color: '#065F46', fontWeight: 700, cursor: 'pointer' }}>📤 Transmettre au PA</button>
                  </div>
                )}
                {r.commentaire_superviseur && r.statut === 'transmis_pa' && (
                  <div style={{ marginTop: 8, background: '#FEF9C3', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#854D0E' }}><strong>💬 Commentaire :</strong> {r.commentaire_superviseur}</div>
                )}
              </div>
            );
          })}
        </div>
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
              {[['ponctualite', 'Ponctualité'], ['preparation', 'Organisation du cours'], ['pedagogie', 'Pédagogie'], ['gestion_classe', 'Gestion de classe'], ['professionnalisme', 'Professionnalisme']].map(([key, label]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: COULEURS.gris600 }}>{label}</span>
                  <EtoileRatingSup valeur={form[key]} onChange={n => setForm(f => ({ ...f, [key]: n }))} />
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
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setRapportGroupes([]); }} style={{ padding: '9px 18px', background: COULEURS.gris100, border: 'none', borderRadius: 8, fontSize: 13, color: COULEURS.navy, cursor: 'pointer', fontWeight: 600 }}>Annuler</button>
              <button onClick={soumettreRapport} disabled={saving || !form.coach_id || !form.date_observation} style={{ padding: '9px 22px', background: SUP_COLOR, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Envoi…' : 'Soumettre'}</button>
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
    { icone: '⚠️', label: 'Anomalies ouvertes',       n: k.nb_anomalies_ouvertes || 0, vers: '/admin/superviseur/anomalies' },
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
      return { ...e, moyenne, nb: e.notes.length, tendance };
    }).sort((a, b) => b.moyenne - a.moyenne);
  })();

  const totalPages = Math.max(1, Math.ceil(classement.length / CLASSEMENT_PAR_PAGE));
  const pageSure = Math.min(page, totalPages);
  const visibles = classement.slice((pageSure - 1) * CLASSEMENT_PAR_PAGE, pageSure * CLASSEMENT_PAR_PAGE);
  const moyGlobale = classement.length
    ? classement.reduce((s, e) => s + e.moyenne, 0) / classement.length : null;
  const sousTrois = classement.filter(e => e.moyenne < 3).length;

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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
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
              { l: 'Coachs notés',    v: classement.length,                                         c: SUP_COLOR },
              { l: 'Moyenne globale', v: moyGlobale != null ? `${moyGlobale.toFixed(1)}/5` : '—',   c: COULEURS.cyanFonce },
              { l: 'Sous 3/5',        v: sousTrois,                                                 c: sousTrois ? COULEURS.erreur : COULEURS.succes },
            ].map(c => (
              <div key={c.l} style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`,
                borderRadius: 12, padding: '14px 18px', borderTop: `3px solid ${c.c}` }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: c.c }}>{c.v}</div>
                <div style={{ fontSize: 11, color: COULEURS.gris600, marginTop: 3 }}>{c.l}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 9 }}>
            {visibles.map((e, i) => {
              const rang = (pageSure - 1) * CLASSEMENT_PAR_PAGE + i;
              const m = medaille(rang);
              const faible = e.moyenne < 3;
              return (
                <div key={e.coach.id} style={{ display: 'flex', alignItems: 'center', gap: 13,
                  background: COULEURS.blanc, border: `1px solid ${faible ? '#FECACA' : COULEURS.gris200}`,
                  borderRadius: 12, padding: '13px 16px' }}>
                  <div style={{ width: 30, textAlign: 'center', fontSize: m ? 19 : 13, fontWeight: 800, color: COULEURS.gris400 }}>
                    {m || rang + 1}
                  </div>
                  <PastilleGroupe nom={`${e.coach.prenom || ''} ${e.coach.nom || ''}`} url={e.coach.avatar_url} taille={36} accent={SUP_COLOR} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {e.coach.prenom} {e.coach.nom}
                      <BadgeCategorieCoach note={e.moyenne} taille="xs" />
                    </div>
                    <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 2 }}>
                      {e.nb} observation{e.nb > 1 ? 's' : ''}
                    </div>
                  </div>
                  <FlecheTendance tendance={e.tendance} nbNotes={e.nb} />
                  {/* La note suit le barème, comme le badge juste à gauche : un rouge/vert
                      binaire contredisait la catégorie sur la même ligne. */}
                  <div style={{ fontSize: 16, fontWeight: 800, color: NOTE_COULEUR(e.moyenne), minWidth: 54, textAlign: 'right' }}>
                    {e.moyenne.toFixed(1)}/5
                  </div>
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
export function OngletObserverCours({ onObserver }) {
  const [classes, setClasses] = useState(null);
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [page, setPage] = useState(1);

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
  const visibles = filtrees.slice((Math.min(page, Math.max(1, Math.ceil(filtrees.length / OBS_PAR_PAGE))) - 1) * OBS_PAR_PAGE,
                                  Math.min(page, Math.max(1, Math.ceil(filtrees.length / OBS_PAR_PAGE))) * OBS_PAR_PAGE);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: COULEURS.navy }}>👁️ Observer un cours</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: COULEURS.gris400 }}>
            Classes BET E-Learning{du || au ? ' démarrées sur la plage choisie' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
        </div>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 13 }}>
            {visibles.map(cl => {
              const st = STATUT_CLASSE[cl.statut] || { label: cl.statut || '—', couleur: COULEURS.gris600, fond: COULEURS.gris100 };
              return (
                <div key={cl.id} style={{ background: COULEURS.blanc, border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 14, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: COULEURS.navy }}>{cl.nom || 'Classe sans nom'}</div>
                      <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 3 }}>
                        {cl.niveau || '—'} · {cl.type_cours || '—'}
                      </div>
                    </div>
                    <span style={{ background: st.fond, color: st.couleur, borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {st.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: COULEURS.gris600, marginBottom: onObserver ? 12 : 0 }}>
                    <span>👤 {cl.coach_nom || 'sans coach'}</span>
                    <span>🎓 {cl.nb_apprenants ?? 0} apprenant{(cl.nb_apprenants ?? 0) > 1 ? 's' : ''}</span>
                    {cl.date_debut && <span>📅 {fmtDateSup(cl.date_debut)}</span>}
                  </div>
                  {onObserver && (
                    <button onClick={() => onObserver(cl)}
                      style={{ width: '100%', padding: '8px 0', background: SUP_COLOR, border: 'none', borderRadius: 8,
                        color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        fontFamily: '"Plus Jakarta Sans",sans-serif' }}>
                      👁️ Observer cette classe
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <BarrePages page={page} total={filtrees.length} parPage={OBS_PAR_PAGE} onChange={setPage} libelle="classe" />
        </>
      )}
    </div>
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
export function OngletPlanningsElearning() {
  const [seances, setSeances] = useState(null);
  const [filtre, setFiltre] = useState('avenir');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`${_API_URL_ADMIN}/api/elearning/seances`, { headers: supAuthHdrs() });
        const d = await r.json().catch(() => ({}));
        const l = Array.isArray(d.seances) ? d.seances : Array.isArray(d) ? d : [];
        if (vivant) setSeances(l);
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
                  <th style={th}>Coach</th><th style={th}>État</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(s => {
                  const avenir = estAVenir(s);
                  return (
                    <tr key={s.id} style={{ borderBottom: `1px solid ${COULEURS.gris100}` }}>
                      <td style={{ ...td, fontWeight: 700, color: avenir ? SUP_COLOR : COULEURS.gris600 }}>
                        {fmtDateSup(s.date)}
                      </td>
                      <td style={td}>{s.heure || '—'}{s.heure_fin ? ` → ${s.heure_fin}` : ''}</td>
                      <td style={td}>{s.classe_nom || s.groupe_nom || '—'}</td>
                      <td style={td}>{s.coach_nom || '—'}</td>
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
    </div>
  );
}
